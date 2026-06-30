// TSA — Azure Container Apps + Azure Database for PostgreSQL Flexible Server.
// Provisions a managed Postgres, the container app, and wires secrets.
//
// Deploy:
//   az deployment group create -g <rg> -f azure/container-app.bicep \
//     -p location=<region> imageName=<registry>/tsa:latest \
//        jwtSecret=<...> smtpHost=<...> smtpUser=<...> smtpPass=<...> smtpFrom=<...>

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Short name used as a prefix for resources.')
param namePrefix string = 'tsa'

@description('Container image to deploy, e.g. myregistry.azurecr.io/tsa:latest.')
param imageName string

@description('Admin login for the Postgres flexible server.')
param dbAdminUser string = 'tsaadmin'

@description('Admin password for the Postgres flexible server.')
@secure()
param dbAdminPassword string

@description('JWT signing secret (>= 16 chars).')
@secure()
param jwtSecret string

@description('SMTP host. Leave empty to disable email sending.')
param smtpHost string = ''

@description('SMTP username.')
param smtpUser string = ''

@description('SMTP password.')
@secure()
param smtpPass string = ''

@description('From address for outgoing email.')
param smtpFrom string = 'TSA <no-reply@example.org>'

@description('Public base URL of the app (used in email links).')
param appBaseUrl string = ''

@description('Container registry server, e.g. myregistry.azurecr.io. Leave blank if the image is public.')
param registryServer string = ''

@description('Registry username (ACR admin user).')
param registryUser string = ''

@description('Registry password (ACR admin password).')
@secure()
param registryPass string = ''

@secure()
param smtpPassword string = smtpPass

var dbName = '${namePrefix}db'
var serverName = '${namePrefix}-pg'
var containerAppName = '${namePrefix}-app'
var containerEnvName = '${namePrefix}-env'
var aciName = '${namePrefix}-managed-env'

// --- Postgres Flexible Server ------------------------------------------------
resource dbServer 'Microsoft.DBforPostgreSQL/flexibleServers@2023-03-01-preview' = {
  name: serverName
  location: location
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: dbAdminUser
    administratorLoginPassword: dbAdminPassword
    storage: { storageSizeGB: 32 }
    highAvailability: { mode: 'Disabled' }
  }
}

resource firewallAllowAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-03-01-preview' = {
  parent: dbServer
  name: 'allow-azure-services'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-03-01-preview' = {
  parent: dbServer
  name: dbName
  properties: {}
}

// --- Container Apps environment ---------------------------------------------
resource env 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: containerEnvName
  location: location
  properties: {}
}

// Connection string for the app.
var databaseUrl = 'postgresql://${dbAdminUser}:${dbAdminPassword}@${serverName}.postgres.database.azure.com:5432/${dbName}?sslmode=require'

resource containerApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: containerAppName
  location: location
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      activeRevisionsMode: 'single'
      ingress: {
        external: true
        targetPort: 3001
        transport: 'http'
        allowInsecure: false
      }
      secrets: [
        { name: 'database-url', value: databaseUrl }
        { name: 'jwt-secret', value: jwtSecret }
        { name: 'smtp-host', value: smtpHost }
        { name: 'smtp-user', value: smtpUser }
        { name: 'smtp-pass', value: smtpPass }
        { name: 'smtp-from', value: smtpFrom }
        { name: 'app-base-url', value: appBaseUrl }
        { name: 'registry-pass', value: registryPass }
      ]
      registries: registryServer == '' ? [] : [
        {
          server: registryServer
          username: registryUser
          passwordSecretRef: 'registry-pass'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'tsa'
          image: imageName
          env: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'PORT', value: '3001' }
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'JWT_SECRET', secretRef: 'jwt-secret' }
            { name: 'JWT_EXPIRES_IN', value: '7d' }
            { name: 'COOKIE_SECURE', value: 'true' }
            { name: 'SMTP_HOST', secretRef: 'smtp-host' }
            { name: 'SMTP_PORT', value: '587' }
            { name: 'SMTP_USER', secretRef: 'smtp-user' }
            { name: 'SMTP_PASS', secretRef: 'smtp-pass' }
            { name: 'SMTP_FROM', secretRef: 'smtp-from' }
            { name: 'APP_BASE_URL', secretRef: 'app-base-url' }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1.0Gi'
          }
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
      }
    }
  }
}

output appFqdn string = containerApp.properties.configuration.ingress.fqdn
output databaseHost string = '${serverName}.postgres.database.azure.com'