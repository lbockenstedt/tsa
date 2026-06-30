# TSA

SignupGenius-style event signup for a non-profit **student competition organization**. People sign up to **judge** or to **be judged** (compete). Built so the work that follows signups is automated: assigning competitors to slots/rooms, balancing judges across rooms, sending email notifications, and aggregating judge scores into ranked results.

Runs as a **single Azure container** (Node/TypeScript Express serving a React/Vite frontend) against **Azure Database for PostgreSQL**.

## Stack

- **Backend:** Express + TypeScript, Prisma ORM, JWT cookie auth, bcrypt, zod validation, nodemailer.
- **Frontend:** React + Vite (built to static assets and served by Express in production).
- **Database:** PostgreSQL (Azure Database for PostgreSQL Flexible Server in prod; local Postgres in dev).
- **Tests:** Vitest.
- **Infra:** Dockerfile + Azure Container Apps (Bicep).

## Roles

- **Admin / organizer** — create & manage events, close signups, run auto-assignment, view/export results.
- **Judge** — sign up to judge, view assigned rooms/competitors, enter scores.
- **Competitor / student** — sign up to compete, pick a time slot, view assignment and results.
- **Check-in volunteer** — role exists in the schema; day-of UI is deferred.

## Quick start (local dev)

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Configure environment**
   ```bash
   cp .env.example .env
   # edit .env: set DATABASE_URL, JWT_SECRET, and SMTP_* if you want email
   ```
3. **Set up the database**
   ```bash
   npx prisma migrate dev --name init
   npm run prisma:seed
   ```
   Seed creates an admin user (`admin@tsa.local` / `password`) and a sample event.
4. **Run the app**
   ```bash
   npm run dev
   ```
   - Frontend (Vite): http://localhost:5173
   - API (Express): http://localhost:3001  (Vite proxies `/api` here)

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Run Express (watch) + Vite dev server concurrently |
| `npm run build` | Compile server (`tsc`) and build client (`vite build`) |
| `npm start` | Run the compiled server (`node dist/server/index.js`) — serves the client too |
| `npm test` | Run Vitest test suite |
| `npm run typecheck` | Type-check server and client without emitting |
| `npm run prisma:migrate` | Create/apply a dev migration |
| `npm run prisma:deploy` | Apply migrations in production |
| `npm run prisma:seed` | Seed the database |

## Project layout

```
prisma/            # schema.prisma + seed.ts
src/server/        # Express API, auth, routes, automation services
src/client/        # React app (Vite)
tests/server/      # Vitest unit + integration tests
docker/            # Dockerfile (multi-stage, single container)
azure/             # container-app.bicep + deploy guide
```

## The end-to-end flow

1. **Admin** creates an event with a rubric (scored criteria) and time slots (rooms + capacity).
2. **Competitors** sign up and pick a slot; **judges** sign up to judge.
3. **Admin** closes signups and runs **auto-assignment** — competitors distributed across slots/rooms (capacity-respecting), judges balanced round-robin across rooms.
4. **Judges** enter rubric scores for their assigned competitors.
5. **Results** aggregate scores (averaged across judges, weighted by rubric) into rankings.
6. Email notifications fire at signup, assignment, and results time (when SMTP is configured).

## Deploy

Two single-command installers live in [`deploy/`](deploy/README.md). Neither
requires local Node or Docker — everything is built in the cloud / inside the
container.

**Azure (one line):**
```bash
bash deploy/azure.sh
```
Builds the image in Azure Container Registry and deploys an Azure Container App
+ Azure Database for PostgreSQL via Bicep. See [`azure/README.md`](azure/README.md)
for the manual equivalent.

**Proxmox LXC (one line, self-contained):**
```bash
bash deploy/proxmox-lxc.sh
```
Creates a Debian 12 LXC on a Proxmox host with Node + PostgreSQL bundled inside,
builds the app, and runs it under systemd. No Azure or external DB needed.

## Status / out of scope (for now)

- Check-in volunteer day-of UI (role modeled, UI deferred).
- Cron-scheduled reminder emails (notification service is ready; scheduler deferred).
- Client-side DOM tests (added once UI stabilizes).
- Password-reset email flow, multi-tenant org support.