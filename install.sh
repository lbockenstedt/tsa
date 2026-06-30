#!/usr/bin/env bash
#
# TSA — single-line installer (run directly from GitHub).
#
# It clones the repo and runs one of the deploy scripts. No local Node or
# Docker required — the Azure path builds in the cloud; the Proxmox path
# builds inside the LXC.
#
# Azure (Container App + Azure Database for PostgreSQL):
#   curl -fsSL https://raw.githubusercontent.com/lbockenstedt/tsa/main/install.sh | bash -s -- azure
#
# Proxmox (self-contained LXC with bundled Postgres) — run on the Proxmox host:
#   curl -fsSL https://raw.githubusercontent.com/lbockenstedt/tsa/main/install.sh | bash -s -- proxmox
#
# Overrides (env vars) are forwarded to the underlying deploy script, e.g.:
#   curl -fsSL .../install.sh | RESOURCE_GROUP=tsa-rg LOCATION=eastus bash -s -- azure
#
set -euo pipefail

TARGET="${1:-azure}"
REPO="${REPO:-lbockenstedt/tsa}"
BRANCH="${BRANCH:-main}"

err() { printf '\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

command -v git >/dev/null 2>&1 || err "git not found. Install git first."

case "$TARGET" in
  azure|proxmox|lxc) ;;
  *) err "Unknown target '$TARGET'. Use: bash -s -- azure   or   bash -s -- proxmox" ;;
esac

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

printf '\033[1;34m▶ Cloning %s@%s into %s\033[0m\n' "$REPO" "$BRANCH" "$TMP"
git clone --depth 1 -b "$BRANCH" "https://github.com/${REPO}.git" "$TMP/tsa"

case "$TARGET" in
  azure)
    printf '\033[1;34m▶ Running Azure installer…\033[0m\n'
    exec bash "$TMP/tsa/deploy/azure.sh"
    ;;
  proxmox|lxc)
    printf '\033[1;34m▶ Running Proxmox LXC installer…\033[0m\n'
    exec bash "$TMP/tsa/deploy/proxmox-lxc.sh"
    ;;
esac