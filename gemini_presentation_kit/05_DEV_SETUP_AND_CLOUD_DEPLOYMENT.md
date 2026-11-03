# 05 — Development Setup, DevOps & Cloud Deployment

> **Target Audience for LLM:** Use this document to generate Slides 11 and 12 (Deployment Readiness, DevOps, and Go-to-Market Execution).

---

## 1. Local Development Setup (Quick Start)

The entire platform runs locally on any developer machine in under 2 minutes:

```bash
# 1. Clone repository
git clone https://github.com/YOUR_ORGANIZATION/GamerBooker_Enterprise_v1.0.git
cd GamerBooker_Enterprise_v1.0

# 2. Install dependencies
npm install
cd apps/venue-dashboard && npm install
cd ../mobile-app && npm install
cd ../..

# 3. Spin up PostgreSQL 16 container & run migrations
docker compose up -d postgres
node db/migrate.js
npm run seed

# 4. Launch all 3 services
# Terminal 1: Backend API -> http://localhost:3000/docs/
npm run start:dev

# Terminal 2: Venue Operations Dashboard -> http://localhost:5173/
cd apps/venue-dashboard && npm run dev

# Terminal 3: Customer Mobile Web App -> http://localhost:5174/
cd apps/mobile-app && npm run dev
```

---

## 2. Cloud Production Deployment Architecture

The production environment is orchestrated via multi-stage Docker containers behind an Nginx Edge Reverse Proxy:

```
┌────────────────────────────────────────────────────────┐
│               HOST SERVER (Ubuntu 24.04 VPS)           │
│                                                        │
│   Port 80 / 443 (Let's Encrypt / Cloudflare SSL)       │
│                         │                              │
│                         ▼                              │
│            [gamerbooker_prod_gateway] (Nginx)          │
│       ┌─────────────────┼─────────────────┐            │
│       │                 │                 │            │
│       ▼                 ▼                 ▼            │
│  [prod_backend]  [prod_dashboard]  [prod_mobile]       │
│   (Port 3000)      (Port 5173)      (Port 5174)        │
│       │                                                │
│   ┌───┴───┐                                            │
│   ▼       ▼                                            │
│[postgres] [redis]                                      │
└────────────────────────────────────────────────────────┘
```

### One-Command Production Launch:
```bash
cp .env.production.example .env
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```
* **Script Automation:** Builds production images, waits for PostgreSQL and Redis health checks, runs migrations (`node db/migrate.js`), and brings up the full cluster with zero downtime.

---

## 3. Automated CI/CD Pipeline (GitHub Actions)
* File: `.github/workflows/ci-cd.yml`
* **Automated Workflow on every Git Push / Pull Request:**
  1. **Verify:** Spins up a PostgreSQL 16 container, typechecks TypeScript across backend and frontends, and runs all 42 test suites (525 tests).
  2. **Build:** Compiles multi-stage production Docker images with GitHub Actions layer caching.
  3. **Deploy:** Securely SSHs into the production VPS, pulls latest commits, applies new migrations, and executes zero-downtime container swaps.

---

## 4. Current Project Status & Readiness
* **Backend Core Engine:** 100% Complete (42 test suites, 525 passed, 0 failed).
* **Venue Operations POS Dashboard:** 100% Complete (Square-style simplicity, Live Floor, Walk-in wizard, Bar board).
* **Customer Mobile Web App:** 100% Complete (Apple Wallet 3D pass flip, Dynamic Island, Seating minimap).
* **Payment Processing:** 100% Complete (Stripe Live Provider + Sandbox replay harness).
* **Deployment Suite:** 100% Complete (Multi-stage Dockerfiles, Compose Prod, Nginx Gateway, CI/CD).
