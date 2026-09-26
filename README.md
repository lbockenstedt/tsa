# tsa — Technical Support Assistant (Lab Manager Module)

Technical Support Assistant (TSA) is an event coordination, scoring, and automated judge/competitor scheduling module for non-profit student competition organizations. Manages student competitor registrations, judge availability signups, capacity-constrained room and slot allocation, automated round-robin judge balancing, rubric-based evaluation scoring, real-time result ranking, and email notification dispatch.

---

## Architecture & Overview

TSA is structured as a full-stack TypeScript application deployable as a single container or an LXC micro-appliance.

```
 +---------------------------------------------------------------+
 |                   React / Vite Client (SPA)                   |
 |  - Public event views & registration forms                    |
 |  - Competitor slot selection & scheduling portal              |
 |  - Judge scoring interface with dynamic rubric criteria       |
 |  - Organizer administration, live results & ranking board     |
 +---------------------------------------------------------------+
                                 |
                                 | HTTP / JSON REST API (Cookies / JWT)
                                 v
 +---------------------------------------------------------------+
 |                 Node / Express Backend (src/server)           |
 |  - Express application pipeline (`app.ts`, `index.ts`)        |
 |  - JWT Cookie Session Authentication & Role Authorization     |
 |  - Zod request body validation & error handling middleware    |
 |  - Core Automation Services:                                  |
 |      * `assignment.service.ts` — Room & judge balancing engine |
 |      * `results.service.ts`    — Weighted scoring & ranking   |
 |      * `notification.service.ts` — Nodemailer SMTP alerts     |
 +---------------------------------------------------------------+
                                 |
                                 | Prisma ORM (`schema.prisma`)
                                 v
 +---------------------------------------------------------------+
 |                      PostgreSQL Database                      |
 |  (Users, Events, Rubrics, TimeSlots, Signups, Assignments,    |
 |   Scores, Rankings)                                           |
 +---------------------------------------------------------------+
```

### Deployment Topologies

1. **Azure Container App + Azure Database for PostgreSQL (Cloud Architecture):**
   - Packaged via multi-stage `Dockerfile`.
   - Express server serves API endpoints under `/api` and delivers the compiled React frontend SPA static bundle from `dist/client/`.
   - Managed PostgreSQL Flexible Server handles relational data with automated backups and SSL connections.
   - Orchestrated via Azure Bicep template (`azure/container-app.bicep`).
2. **Proxmox LXC (On-Premises / Lab Infrastructure):**
   - Self-contained Debian 12 LXC container provisioned via `deploy/proxmox-lxc.sh`.
   - Bundles local PostgreSQL and NodeJS runtime under `systemd` supervision.
   - Provides private, zero-cloud operations within internal lab environments.

---

## Features

- **Student Competition & Event Management:**
  - Create and configure multi-day events with rich descriptions, physical or virtual room locations, and automated registration deadlines.
  - Multi-role access control for Administrators, Judges, Competitors (Students), and Check-in Volunteers.
- **Competitor Registration & Time Slot Selection:**
  - Self-service competitor signups with preferred time-slot reservations.
  - Hard capacity limits per time slot and room to eliminate overbooking.
- **Judge Availability Signups & Balancing Algorithms:**
  - Fast volunteer judge onboarding and availability tracking.
  - Automated auto-assignment engine (`placeCompetitors` & `balanceJudges`):
    * Fills time slots chronologically while honoring competitor preferences.
    * Balances volunteer judges round-robin across rooms to maintain uniform evaluation panel sizes (default 3 judges per room).
- **Rubric-Based Scoring Pipelines & Results Aggregation:**
  - Dynamic rubric definition with configurable criteria, point maximums, and proportional percentage weights.
  - In-app evaluation portal where assigned judges submit numeric marks per criterion.
  - Weighted results aggregation algorithm (`aggregateResults`):
    * Averages marks across all evaluating judges per criterion.
    * Computes final weighted composite scores.
    * Resolves ranks dynamically with deterministic tie handling.
- **Automated Notification Dispatch:**
  - Event lifecycle alerts via Nodemailer SMTP.
  - Dispatches immediate confirmations upon signup, schedule announcements after room balancing, and finalized result publication.
  - Graceful dev-mode fallback to console logging when SMTP is unconfigured.

---

<!-- INSTALLERS:START -->
## Installation

Every installer in this repo, with every flag and environment variable it accepts.
Installers are idempotent — re-running one updates code and preserves credentials.

### TSA — `install.sh`

Clones the repo and runs one of the deploy scripts. No local Node or Docker
needed: the Azure path builds in the cloud, the Proxmox path builds inside the LXC.

```bash
# Azure — Container App + Azure Database for PostgreSQL
curl -fsSL https://raw.githubusercontent.com/lbockenstedt/tsa/main/install.sh | bash -s -- azure

# Proxmox — self-contained LXC with bundled Postgres (run on the Proxmox host)
curl -fsSL https://raw.githubusercontent.com/lbockenstedt/tsa/main/install.sh | bash -s -- proxmox
```

| Argument | Purpose |
| :--- | :--- |
| `azure` \| `proxmox` | Deployment target. Default `azure`. |

Any environment variable you set is forwarded to the underlying deploy script:

```bash
curl -fsSL https://raw.githubusercontent.com/lbockenstedt/tsa/main/install.sh | RESOURCE_GROUP=tsa-rg LOCATION=eastus bash -s -- azure
```
<!-- INSTALLERS:END -->

---

## Local Development & Operations

### Prerequisites

- Node.js (v18+) and npm
- PostgreSQL database instance

### Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with DATABASE_URL, JWT_SECRET, and SMTP credentials
   ```
3. **Database migrations and seeding:**
   ```bash
   npx prisma migrate dev --name init
   npm run prisma:seed
   ```
   *Seed script creates default admin user (`admin@tsa.local` / `password`) and sample competition data.*
4. **Start local development servers:**
   ```bash
   npm run dev
   ```
   - Vite frontend: `http://localhost:5173`
   - Express API backend: `http://localhost:3001` (proxied by Vite)

### NPM Scripts Reference

| Script | Purpose |
| :--- | :--- |
| `npm run dev` | Runs Express backend and Vite frontend concurrently in watch mode. |
| `npm run build` | Compiles server via `tsc` and builds production client assets via `vite build`. |
| `npm start` | Launches compiled production server from `dist/server/index.js`. |
| `npm test` | Executes Vitest test suite. |
| `npm run typecheck` | Validates TypeScript types across both server and client without emitting files. |
| `npm run prisma:migrate` | Applies development migrations via Prisma. |
| `npm run prisma:deploy` | Applies pending database migrations in production environments. |
| `npm run prisma:seed` | Populates database with initial seed fixtures. |