# Deploy TSA

Two single-command installers are provided. Both build everything for you — no
local Node or Docker required.

## One-line install directly from GitHub

The repo has a dispatcher at `install.sh` that clones the repo and runs the
chosen deploy script. Run it from anywhere:

**Azure (Azure Container App + Azure Database for PostgreSQL):**
```bash
curl -fsSL https://raw.githubusercontent.com/lbockenstedt/tsa/main/install.sh | bash -s -- azure
```

**Proxmox LXC (self-contained, bundled Postgres) — run on the Proxmox host:**
```bash
curl -fsSL https://raw.githubusercontent.com/lbockenstedt/tsa/main/install.sh | bash -s -- proxmox
```

**Inside an existing LXC container** (any Debian 12 LXC — Proxmox, incus, LXC).
From a root shell inside the container (`pct enter <vmid>`, `lxc-attach`, or ssh):
```bash
curl -fsSL https://raw.githubusercontent.com/lbockenstedt/tsa/main/deploy/lxc-install.sh | bash
```

Overrides pass through as env vars, e.g.:
```bash
curl -fsSL https://raw.githubusercontent.com/lbockenstedt/tsa/main/install.sh \
  | RESOURCE_GROUP=tsa-rg LOCATION=eastus bash -s -- azure
```

## One-line Azure deploy (from a repo checkout)

Provisions an Azure Container App + Azure Database for PostgreSQL, builds the
image in Azure Container Registry, and prints the public URL.

```bash
bash deploy/azure.sh
```

Prerequisites: the Azure CLI (`az`) installed and `az login` done.

Common overrides (env vars):

```bash
RESOURCE_GROUP=tsa-rg LOCATION=eastus NAME_PREFIX=tsa \
SMTP_HOST=smtp.yourprovider.com SMTP_USER=apikey SMTP_PASS=secret \
SMTP_FROM='TSA <no-reply@yourdomain.org>' \
bash deploy/azure.sh
```

What it does:
1. Creates the resource group + an Azure Container Registry.
2. Builds the image in Azure via `az acr build` (cloud build — no local Docker).
3. Deploys `azure/container-app.bicep` (Container App + Postgres Flexible Server).
4. The container runs `prisma migrate deploy` on boot, so the schema + seed apply automatically.

Output: the app URL, DB host, and generated secrets.

## One-line Proxmox LXC deploy (from a repo checkout, self-contained)

Creates a Debian 12 LXC container on a Proxmox host with Node 20 + PostgreSQL
**inside the container**, builds the app, migrates + seeds, and runs it under
systemd. Self-contained — no Azure or external database.

Run **on the Proxmox host**:

```bash
bash deploy/proxmox-lxc.sh
```

Overrides:

```bash
VMID=210 STORAGE=local-lvm BRIDGE=vmbr0 MEMORY=2048 CPU=1 DISK=8 \
bash deploy/proxmox-lxc.sh
```

What it does:
1. Fetches the Debian 12 LXC template and creates the container (`pct create`).
2. Pushes the app source + `lxc-setup.sh` into the container.
3. Inside the container: installs Node 20 + PostgreSQL, creates the `tsa` DB,
   `npm install`, `prisma migrate deploy`, `npm run build`, installs a `tsa`
   systemd service, and starts it.
4. Prints `http://<container-ip>:3001`.

Manage it:

```bash
pct enter 210            # shell inside
systemctl status tsa     # inside the container
journalctl -u tsa -f     # logs
```

For HTTPS, put a reverse proxy (Caddy/Nginx) in front and set `COOKIE_SECURE=true`
and `APP_BASE_URL` to the HTTPS URL in `/opt/tsa/.env`.

## Local dev (for reference)

```bash
npm install
cp .env.example .env          # set DATABASE_URL, JWT_SECRET
npx prisma migrate dev --name init
npm run prisma:seed
npm run dev                   # http://localhost:5173
```

See the main [README](../README.md) for full details.