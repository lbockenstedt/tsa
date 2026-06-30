#!/usr/bin/env bash
#
# TSA — one-line Azure installer.
#
# Builds the container image in Azure (ACR), deploys an Azure Container App
# + Azure Database for PostgreSQL via Bicep, and prints the public app URL.
# No local Node or Docker required — the image is built in the cloud with
# `az acr build`. Only the Azure CLI is needed.
#
# Usage (one line):
#   bash deploy/azure.sh
#
# Override any setting with an env var. Required secrets are generated
# automatically if not provided; provide your own for repeatability.
#
#   RESOURCE_GROUP=tsa-rg  LOCATION=eastus  NAME_PREFIX=tsa \
#   SMTP_HOST=smtp.x.com SMTP_USER=u SMTP_PASS=p SMTP_FROM='TSA <n@x.org>' \
#   bash deploy/azure.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

RESOURCE_GROUP="${RESOURCE_GROUP:-tsa-rg}"
LOCATION="${LOCATION:-eastus}"
NAME_PREFIX="${NAME_PREFIX:-tsa}"
ACR_NAME="${ACR_NAME:-${NAME_PREFIX}acr$(LC_ALL=C tr -dc a-z0-9 </dev/urandom | head -c5)}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
DB_ADMIN_USER="${DB_ADMIN_USER:-tsaadmin}"

# Generate strong secrets if not supplied.
DB_ADMIN_PASSWORD="${DB_ADMIN_PASSWORD:-$(LC_ALL=C tr -dc A-Za-z0-9 </dev/urandom | head -c24)}"
JWT_SECRET="${JWT_SECRET:-$(LC_ALL=C tr -dc A-Za-z0-9 </dev/urandom | head -c40)}"

SMTP_HOST="${SMTP_HOST:-}"
SMTP_USER="${SMTP_USER:-}"
SMTP_PASS="${SMTP_PASS:-}"
SMTP_FROM="${SMTP_FROM:-TSA <no-reply@example.org>}"

log() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
err() { printf '\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

command -v az >/dev/null 2>&1 || err "Azure CLI (az) not found. Install: https://learn.microsoft.com/cli/azure/install-azure-cli"
[ -f "$REPO_DIR/docker/Dockerfile" ] || err "Dockerfile not found at $REPO_DIR/docker/Dockerfile (run from the repo)."

# Ensure logged in.
log "Checking Azure login…"
az account show >/dev/null 2>&1 || { az login >/dev/null && az account show >/dev/null; }

log "Creating resource group '$RESOURCE_GROUP' in '$LOCATION'…"
az group create -g "$RESOURCE_GROUP" -l "$LOCATION" -o none

log "Creating container registry '$ACR_NAME'…"
az acr create -g "$RESOURCE_GROUP" -n "$ACR_NAME" --sku Basic -o none
az acr update -n "$ACR_NAME" --admin-enabled true -o none
ACR_SERVER="$(az acr show -n "$ACR_NAME" --query loginServer -o tsv)"
ACR_USER="$(az acr credential show -n "$ACR_NAME" --query username -o tsv)"
ACR_PASS="$(az acr credential show -n "$ACR_NAME" --query 'passwords[0].value' -o tsv)"
IMAGE="${ACR_SERVER}/${NAME_PREFIX}:${IMAGE_TAG}"

log "Building image '$IMAGE' in Azure (this takes a few minutes)…"
az acr build -r "$ACR_NAME" -t "${NAME_PREFIX}:${IMAGE_TAG}" -f "$REPO_DIR/docker/Dockerfile" "$REPO_DIR" -o none

# The container app's public URL (we'll know the FQDN after deploy).
EXPECTED_FQDN="${NAME_PREFIX}-app.${LOCATION}.azurecontainerapps.io"

log "Deploying Container App + PostgreSQL via Bicep…"
DEPLOY=$(az deployment group create \
  -g "$RESOURCE_GROUP" \
  -f "$REPO_DIR/azure/container-app.bicep" \
  -p namePrefix="$NAME_PREFIX" \
     imageName="$IMAGE" \
     dbAdminUser="$DB_ADMIN_USER" \
     dbAdminPassword="$DB_ADMIN_PASSWORD" \
     jwtSecret="$JWT_SECRET" \
     smtpHost="$SMTP_HOST" \
     smtpUser="$SMTP_USER" \
     smtpPass="$SMTP_PASS" \
     smtpFrom="$SMTP_FROM" \
     appBaseUrl="https://${EXPECTED_FQDN}" \
     registryServer="$ACR_SERVER" \
     registryUser="$ACR_USER" \
     registryPass="$ACR_PASS" \
  -o json)

APP_FQDN="$(printf '%s' "$DEPLOY" | python3 -c 'import sys,json; print(json.load(sys.stdin)["properties"]["outputs"]["appFqdn"]["value"])' 2>/dev/null || true)"
APP_URL="https://${APP_FQDN:-$EXPECTED_FQDN}"

DB_HOST="$(printf '%s' "$DEPLOY" | python3 -c 'import sys,json; print(json.load(sys.stdin)["properties"]["outputs"]["databaseHost"]["value"])' 2>/dev/null || true)"

cat <<EOF

\033[1;32m✔ Deployed.\033[0m

  App URL:        $APP_URL
  Database host:  ${DB_HOST:-${NAME_PREFIX}-pg.postgres.database.azure.com}
  ACR image:      $IMAGE

  Admin login:    admin@tsa.local / password
  (seed runs automatically on first boot via prisma migrate deploy.
   To reseed: see azure/README.md — set DATABASE_URL and run npm run prisma:seed)

  Generated secrets (save these):
    DB_ADMIN_PASSWORD=$DB_ADMIN_PASSWORD
    JWT_SECRET=$JWT_SECRET

EOF