#!/usr/bin/env bash
#
# TSA — in-container installer. Run this INSIDE a Debian 12 LXC container
# (e.g. after `pct enter <vmid>` or `lxc-attach`). It clones the app from
# GitHub, installs Node 20 + PostgreSQL, builds, migrates + seeds, and starts
# the app under systemd. Self-contained — app + database live in one container.
#
# One line (from inside the container):
#   curl -fsSL https://raw.githubusercontent.com/lbockenstedt/tsa/main/deploy/lxc-install.sh | bash
#
# Overrides (env vars):
#   curl -fsSL .../lxc-install.sh | APP_PORT=3001 DB_PASS=secret bash
#
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

APP_DIR="${APP_DIR:-/opt/tsa}"
REPO="${REPO:-lbockenstedt/tsa}"
BRANCH="${BRANCH:-main}"
DB_NAME="${DB_NAME:-tsa}"
DB_USER="${DB_USER:-tsa}"
DB_PASS="${DB_PASS:-tsa_$(head -c 512 /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9' | cut -c1-16)}"
JWT_SECRET="${JWT_SECRET:-$(head -c 512 /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9' | cut -c1-40)}"
APP_PORT="${APP_PORT:-3001}"
APP_BASE_URL="${APP_BASE_URL:-http://localhost:${APP_PORT}}"

log() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
err() { printf '\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || err "Run as root (the container's root user)."

log "Installing system packages (git, Node 20, PostgreSQL, build tools)…"
apt-get update -y
apt-get install -y ca-certificates curl gnupg git build-essential postgresql postgresql-contrib

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
log "Node $(node --version), npm $(npm --version)"

log "Starting PostgreSQL and creating the '${DB_NAME}' database…"
service postgresql start || pg_ctlcluster 17 main start || pg_ctlcluster 16 main start || pg_ctlcluster 15 main start || true

# Create the role if missing, and ALWAYS (re)set its password so re-runs match
# the DATABASE_URL we build below (the role persists across runs; the random
# password does not). Debian's default pg_hba allows 127.0.0.1 via scram-sha-256.
if sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
  sudo -u postgres psql -c "ALTER ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}';" >/dev/null
else
  sudo -u postgres psql -c "CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}';" >/dev/null
fi
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"
sudo -u postgres psql -c "ALTER DATABASE ${DB_NAME} OWNER TO ${DB_USER};" >/dev/null
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};" >/dev/null

DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:5432/${DB_NAME}"

log "Cloning ${REPO}@${BRANCH} into ${APP_DIR}…"
rm -rf "$APP_DIR"
git clone --depth 1 -b "$BRANCH" "https://github.com/${REPO}.git" "$APP_DIR"
cd "$APP_DIR"

log "Installing dependencies…"
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
COOKIE_SECURE=${COOKIE_SECURE:-false}
SMTP_HOST=${SMTP_HOST:-}
SMTP_PORT=${SMTP_PORT:-587}
SMTP_USER=${SMTP_USER:-}
SMTP_PASS=${SMTP_PASS:-}
SMTP_FROM=${SMTP_FROM:-TSA <no-reply@example.org>}
APP_BASE_URL=${APP_BASE_URL}
EOF

log "Installing + starting the tsa systemd service…"
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
for _ in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null 2>&1; then
    IP="$(ip -4 -o addr show eth0 2>/dev/null | awk -F'[ /]+' 'NR==1{print $4}')"
    cat <<EOF

\033[1;32m✔ TSA is up.\033[0m

  App URL:      http://${IP:-127.0.0.1}:${APP_PORT}
  Admin login:  admin@tsa.local / password
  App dir:      ${APP_DIR}
  Database:     ${DB_NAME} (user ${DB_USER}) — local PostgreSQL

  Logs:         journalctl -u tsa -f
  Status:       systemctl status tsa

  Saved secrets:
    DB_PASS=${DB_PASS}
    JWT_SECRET=${JWT_SECRET}

EOF
    exit 0
  fi
  sleep 2
done
err "TSA did not become healthy. Check: journalctl -u tsa -n 80"