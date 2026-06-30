# Deploy TSA to Azure

The app runs as a single Azure Container App backed by Azure Database for
PostgreSQL Flexible Server. `container-app.bicep` provisions both.

## Prerequisites

- Azure CLI: `az login` and a subscription selected.
- A container registry to hold the image (Azure Container Registry recommended).
- Docker (or `az acr build` to build in the cloud).

## 1. Create a resource group

```bash
az group create -g tsa-rg -l eastus
```

## 2. Build and push the image

Using Azure Container Registry (no local Docker needed):

```bash
REG=$(az acr create -g tsa-rg -n tsaacr$RANDOM --sku Basic --query name -o tsv)
az acr build -r $REG -t tsa:latest -f docker/Dockerfile .
```

The image reference becomes `$REG.azurecr.io/tsa:latest`.

Give the Container Apps environment permission to pull from ACR:

```bash
ACR_ID=$(az acr show -n $REG --query id -o tsv)
```

(The Bicep template's `registries` can be extended to pass ACR credentials; for a
quick start you can also use a registry with anonymous pull enabled, or supply
`--set` overrides at deploy time.)

## 3. Deploy with Bicep

```bash
IMAGE="$REG.azurecr.io/tsa:latest"
DB_PASS="$(openssl rand -base64 24)"   # strong Postgres admin password
JWT_SECRET="$(openssl rand -hex 32)"

az deployment group create -g tsa-rg -f azure/container-app.bicep \
  -p imageName=$IMAGE \
     dbAdminPassword="$DB_PASS" \
     jwtSecret="$JWT_SECRET" \
     smtpHost="smtp.yourprovider.com" \
     smtpUser="apikey" \
     smtpPass="your-smtp-key" \
     smtpFrom="TSA <no-reply@yourdomain.org>" \
     appBaseUrl="https://tsa-app.<region>.azurecontainerapps.io"
```

The deployment outputs `appFqdn` (the container app URL) and `databaseHost`.

## 4. Apply the database schema

The container runs `prisma db push` at startup, so the schema is applied
automatically on first boot. If you need to apply it manually:

```bash
# From your machine, allow your IP through the firewall, then:
DATABASE_URL="postgresql://tsaadmin:$DB_PASS@<databaseHost>:5432/tsadb?sslmode=require" \
  npx prisma db push
```

> Note: the deployers use `prisma db push` (no migration files committed yet).
> Once you have a local Node environment, run `npx prisma migrate dev --name init`
> to generate the first migration, commit `prisma/migrations/`, then switch the
> deployers/Dockerfile back to `prisma migrate deploy` for versioned migrations.

## 5. Seed (optional)

Seed creates an admin user and a sample event. Run it once against the Azure DB:

```bash
DATABASE_URL="postgresql://tsaadmin:$DB_PASS@<databaseHost>:5432/tsadb?sslmode=require" \
  npm run prisma:seed
```

Log in with `admin@tsa.local` / `password` and change the admin password ASAP
(there's no change-password UI yet — for now, update it directly in the DB).

## Notes

- The Bicep template enables "Allow Azure services" on the Postgres firewall so
  the container can reach the DB. For production, restrict this and use VNet
  integration / private endpoints.
- `COOKIE_SECURE=true` is set in the container env so the session cookie is only
  sent over HTTPS.
- To disable email entirely, leave `smtpHost` empty — emails are logged instead.
- Scaling: the template sets 1–3 replicas. Adjust `scale` in the Bicep file.