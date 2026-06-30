#!/usr/bin/env bash
#
# TSA — in-container provisioning script (runs INSIDE the Proxmox LXC).
# Installs Node 20 + PostgreSQL, builds the app, runs migrations + seed, and
# installs a systemd service. Invoked by deploy/proxmox-lxc.sh via `pct exec`.
#
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

APP_DIR="/opt/tsa"
DB_NAME="tsa"
DB_USER="tsa"
DB_PASS="${DB_PASS:-tsa_$(head -c 512 /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9' | cut -c1-16)}"
JWT_SECRET="${JWT_SECRET:-$(head -c 512 /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9' | cut -c1-40)}"
APP_PORT="${APP_PORT:-3001}"

log() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
err() { printf '\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

log "Installing system packages (Node 20, PostgreSQL, build tools)…"
apt-get update -y
apt-get install -y ca-certificates curl gnupg postgresql postgresql-contrib build-essential

# Node 20 via NodeSource.
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
node --version
npm --version

log "Setting up local PostgreSQL database…"
service postgresql start || pg_ctlcluster 16 main start || true
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};" >/dev/null
# Allow local TCP connections with a password.
PG_HBA="$(find /etc/postgresql -name pg_hba.conf | head -n1)"
if [ -n "$PG_HBA" ] && ! grep -q "tsa-md5" "$PG_HBA"; then
  printf '\n# tsa-md5\nhost\ttsa\ttsa\t127.0.0.1/32\tmd5\n' >> "$PG_HBA"
  pg_ctlcluster 16 main reload || service postgresql reload || true
fi

DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:5432/${DB_NAME}"

log "Unpacking the app to ${APP_DIR}…"
mkdir -p "$APP_DIR"
rm -rf "${APP_DIR:?}/"* 2>/dev/null || true
tar -xzf /opt/tsa-app.tar.gz -C "$APP_DIR"

log "Installing dependencies…"
cd "$APP_DIR"
npm install --omit=optional

log "Generating Prisma client, pushing schema, seeding…"
export DATABASE_URL
npx prisma generate
npx prisma db push --accept-data-loss
npm run prisma:seed || true

log "Building the app (server + client)…"
npm run build

log "Writing environment file…"
cat > "$APP_DIR/.env" <<EOF
NODE_ENV=production
PORT=${APP_PORT}
DATABASE_URL=${DATABASE_URL}
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=7d
COOKIE_SECURE=false
SMTP_HOST=${SMTP_HOST:-}
SMTP_PORT=${SMTP_PORT:-587}
SMTP_USER=${SMTP_USER:-}
SMTP_PASS=${SMTP_PASS:-}
SMTP_FROM=${SMTP_FROM:-TSA <no-reply@example.org>}
APP_BASE_URL=${APP_BASE_URL:-http://localhost:${APP_PORT}}
EOF

log "Installing systemd service…"
cat > /etc/systemd/system/tsa.service <<EOF
[Unit]
Description=TSA event signup app
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
ExecStart=$(which node) ${APP_DIR}/dist/server/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable tsa >/dev/null
systemctl restart tsa

log "Waiting for the service to come up…"
for _ in $(seq 1 15); do
  if curl -fsS "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null 2>&1; then
    echo "✔ TSA is healthy on port ${APP_PORT}"
    exit 0
  fi
  sleep 2
done
err "TSA did not become healthy. Check: journalctl -u tsa -n 50"