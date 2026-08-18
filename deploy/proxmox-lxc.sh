#!/usr/bin/env bash
#
# TSA — self-contained Proxmox LXC installer.
#
# Creates a Debian 12 LXC container on a Proxmox host, installs Node 20 +
# PostgreSQL INSIDE the container, builds the app, runs migrations + seed, and
# starts it under systemd. The container is self-contained: app + database in
# one box, no Azure or external DB required.
#
# Run this ON THE PROXMOX HOST (it uses `pct`). No local Node/Docker needed —
# everything is built inside the container.
#
# Usage (one line):
#   bash deploy/proxmox-lxc.sh
#
# Overrides (env vars):
#   VMID=210 STORAGE=local-lvm BRIDGE=vmbr0 MEMORY=2048 CPU=1 DISK=8 \
#   bash deploy/proxmox-lxc.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

VMID="${VMID:-210}"
STORAGE="${STORAGE:-local-lvm}"
BRIDGE="${BRIDGE:-vmbr0}"
MEMORY="${MEMORY:-2048}"
CPU="${CPU:-1}"
DISK="${DISK:-8}"
HOSTNAME="${HOSTNAME:-tsa}"

log() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
err() { printf '\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

command -v pct >/dev/null 2>&1 || err "This script must run on a Proxmox host ('pct' not found)."

log "Updating LXC template list and fetching Debian 12…"
pveam update >/dev/null 2>&1 || true
TEMPLATE="$(pveam available -section system | awk '/debian-12-standard/ {print $2}' | head -n1)"
[ -n "$TEMPLATE" ] || err "Could not find a debian-12-standard template."
TEMPLATE_STORE="${TEMPLATE%%/*}"
TEMPLATE_NAME="${TEMPLATE#*/}"
pveam download "$TEMPLATE_STORE" "$TEMPLATE_NAME" >/dev/null 2>&1 || true

log "Creating container $VMID ($HOSTNAME)…"
if pct status "$VMID" >/dev/null 2>&1; then
  err "Container $VMID already exists. Stop and destroy it first: pct stop $VMID && pct destroy $VMID"
fi
pct create "$VMID" "${TEMPLATE_STORE}:vztmpl/${TEMPLATE_NAME}" \
  -hostname "$HOSTNAME" \
  -memory "$MEMORY" -cores "$CPU" -swap 0 \
  -rootfs "${STORAGE}:${DISK}" \
  -net0 "name=eth0,bridge=${BRIDGE},ip=dhcp" \
  -features nesting=1 \
  -onboot 1 >/dev/null

log "Starting container…"
pct start "$VMID"

# Wait for networking.
log "Waiting for the container to get an IP…"
IP=""
for _ in $(seq 1 30); do
  IP="$(pct exec "$VMID" -- sh -c 'ip -4 -o addr show eth0 2>/dev/null | awk "{print \$4}" | cut -d/ -f1' 2>/dev/null || true)"
  [ -n "$IP" ] && break
  sleep 2
done
[ -n "$IP" ] || err "Container did not get an IP via DHCP. Check your bridge / DHCP setup."

log "Packaging the app and pushing it into the container…"
# This archive is created in the system temp area; large checkouts need enough
# temporary disk space for a compressed copy of the repository.
TARBALL="$(mktemp -t tsa-app.XXXXXX.tar.gz)"
tar -C "$REPO_DIR" --exclude=node_modules --exclude=dist --exclude=.git \
  --exclude=.env --exclude='*.log' -czf "$TARBALL" .
pct push "$VMID" "$TARBALL" /opt/tsa-app.tar.gz >/dev/null
rm -f "$TARBALL"
pct push "$VMID" "$SCRIPT_DIR/lxc-setup.sh" /opt/lxc-setup.sh >/dev/null

log "Provisioning inside the container (Node + PostgreSQL + build + migrate)…"
pct exec "$VMID" -- bash /opt/lxc-setup.sh

cat <<EOF

\033[1;32m✔ Self-contained LXC is up.\033[0m

  Container:  $VMID ($HOSTNAME)
  App URL:    http://$IP:3001
  Admin login: admin@tsa.local / password

  Manage with:
    pct enter $VMID
    systemctl status tsa        # inside the container
    journalctl -u tsa -f        # logs

  The PostgreSQL database lives inside the container (db: tsa, user: tsa).
  Put a reverse proxy (e.g. Caddy/Nginx) in front for HTTPS.

EOF