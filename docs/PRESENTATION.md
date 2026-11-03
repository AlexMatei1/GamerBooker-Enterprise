# GamerBooker Enterprise v1.0 — Platform Presentation & Technical Overview

> **The Turnkey Operating System for Modern Esports Arenas & Gaming Lounges**  
> *Engineered for high concurrency, zero double bookings, native mobile ticketing, and full Romanian regulatory compliance.*

---

## 1. Executive Summary & Vision

Traditional internet cafés and gaming centers struggle with fragmented tools: cash registers that don't talk to station timers, lost booking revenue, double-booked VIP rigs, manual paper receipts, and strict legal compliance hurdles (such as Romanian Law 42/2024 minor curfews and ANAF fiscal memory requirements).

**GamerBooker Enterprise v1.0** is an all-in-one, enterprise-grade platform uniting:
1. **A Customer Mobile Web App (PWA / iOS / Android)** with Apple Wallet 3D ticket pass flip, Dynamic Island live session countdown, and interactive 2D seating minimaps.
2. **An Enterprise Venue Operations Dashboard (POS)** designed like Square or Clover for gaming lounges: 1-click walk-in check-in, real-time station cards, kitchen/bar Kanban dispatch, and daily ANAF fiscal reports.
3. **A Hardened Core Backend Engine** built on NestJS 10, Fastify, and PostgreSQL 16 with mathematical GiST exclusion constraints that guarantee **zero double-bookings**.

---

## 2. Platform Architecture & Ecosystem

```
                                  GAMERBOOKER ECOSYSTEM
                                            │
               ┌────────────────────────────┼────────────────────────────┐
               ▼                            ▼                            ▼
     ┌───────────────────┐        ┌───────────────────┐        ┌───────────────────┐
     │  CUSTOMER MOBILE  │        │  VENUE DASHBOARD  │        │   EDGE GATEWAY    │
     │     (React 18)    │        │    (React 18)     │        │  (Nginx Reverse)  │
     │  Port 5174 / PWA  │        │     Port 5173     │        │   Port 80 / 443   │
     └─────────┬─────────┘        └─────────┬─────────┘        └─────────┬─────────┘
               │                            │                            │
               └────────────────────┬───────┴────────────────────────────┘
                                    ▼
                         ┌────────────────────┐
                         │   NESTJS 10 API    │ ◄── Swagger Docs: /docs/
                         │    (Port 3000)     │
                         └─────────┬──────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                             ▼
         ┌─────────────────────┐       ┌─────────────────────┐
         │    POSTGRESQL 16    │       │       REDIS 7       │
         │  GiST Range Locks   │       │  In-Memory Caching  │
         │    32 Migrations    │       │   Rate-Limiting     │
         └─────────────────────┘       └─────────────────────┘
```

---

## 3. The 3 Main Applications Explained

### A. The Customer Mobile App (`apps/mobile-app`)
* **Live Address:** `http://localhost:5174/` (or `https://app.gamerbooker.ro`)
* **Technology:** React 18, SF Pro / Inter typography, Tailwind CSS, Capacitor iOS/Android bridge.
* **Key Features:**
  * **Dynamic Island Live Activity:** Floating pill tracking active gaming session (`VIP-01 • Active • 1h 54m`) with tap-to-expand telemetry.
  * **Apple Wallet 3D Flip Pass:** Ticket pass with rolling HMAC-SHA256 security QR code. Click *"Flip Pass Details"* to flip the card in 3D space to see the arena's 10Gbps Wi-Fi (`NEXUS-ARENA-5G` / `NexusVIP2026`) and turnstile entry instructions.
  * **Interactive Seating Minimap:** Visual 2D floorplan showing free RTX 4090 rigs, console pods, and streaming booths with time slot pills.
  * **Checkout & Payment:** Apple Pay, Credit Card (3D Secure), Arena Wallet credits, and promo voucher engine (`ENTERPRISE10`).
  * **In-Seat Snack Ordering:** Order energy drinks and snacks delivered straight to your rig.
  * **GDPR & Apple Compliance:** In-app account deletion under Apple Guideline 5.1.1(v).

---

### B. The Venue Operations Dashboard (`apps/venue-dashboard`)
* **Live Address:** `http://localhost:5173/` (or `https://dashboard.gamerbooker.ro`)
* **Technology:** React 18, Linear/Figma dark palette, Lucide Icons.
* **Key Features:**
  * **Everyday Counter POS:** Large, tactile station cards color-coded for quick glance:
    * 🟢 **Free Stations:** Shows hardware (`RTX 4090`) and rate (`30 Lei/hr`) with a 1-click **"Quick Start Session"** button.
    * 🟣 **In Game Stations:** Displays gamer name, big readable countdown (`75m left`), progress bar, and instant **`[+30m]`**, **`[+1h]`**, and **`[End]`** buttons.
    * 🟡 **Reserved Stations:** Arriving customers with a **"Check In"** button.
  * **10-Second Walk-In Customer Wizard:** 3-step modal to choose station, duration (1h, 2h, 3h, all-day pass), payment method (Cash or POS Card), and instantly print an ANAF-compliant fiscal receipt.
  * **Bar & Kitchen Dispatch Board:** Kanban-style order board with Crockford Base32 4-character PIN token verification.
  * **Cash Register & Daily Sales:** Cash drawer balance, card totals, and 1-click Daily Z-Report generation.
  * **Manager Studio Dropdown:**
    * **CAD 2D Layout Studio:** AutoCAD/Figma style drafting canvas with 20px grid snapping, coordinate telemetry, and property inspector.
    * **Pricing Engine:** Peak/off-peak hourly rates and custom tier rules.
    * **Incident Runbooks (R1–R6):** Emergency guides for internet outages, power failures, and tournament delays.

---

### C. The Core Backend Engine (`src/`)
* **Live Address:** `http://localhost:3000/docs/` (Swagger UI)
* **Technology:** NestJS 10, Fastify, PostgreSQL 16, Redis 7, Argon2id, TOTP MFA.
* **Key Invariants:**
  * **Zero Double Bookings:** Enforced at the PostgreSQL kernel level using `tsrange` and `EXCLUDE USING gist (station_id WITH =, time_range WITH &&)`. Impossible to overlap bookings even during race conditions.
  * **Server-Signed Pricing:** All quotes calculated server-side in minor units (Bani) with cryptographic expiry signatures.
  * **Stripe Live Payment Provider:** Webhook signature verification (HMAC-SHA256) and automatic refund lifecycle.
  * **Automated Test Suite:** **42 test suites with 525 automated unit & integration tests passing with 0 failures**.

---

## 4. How It Works — Step-by-Step Journeys

### Journey 1: Customer Reserves Online
```
[Customer opens App]
       │
       ▼
[Selects RTX 4090 on Minimap & Time 18:00-21:00]
       │
       ▼
[Server creates Atomic Hold (10-min TTL) in Postgres]
       │
       ▼
[Customer pays via Apple Pay / Card / Voucher]
       │
       ▼
[Instant Apple Wallet Pass issued with rolling HMAC QR Code]
       │
       ▼
[Customer walks into arena ──► Turnstile scans QR ──► Station Unlocks]
```

---

### Journey 2: Walk-In Customer Arrives at the Counter
```
[Customer arrives at Reception: "Can I play 2 hours?"]
       │
       ▼
[Staff clicks "+ Check In Walk-In Customer" on Dashboard]
       │
       ▼
[Selects PC-01 ──► Selects "2 Hours (60 Lei)" ──► Clicks Card or Cash]
       │
       ▼
[Station PC-01 instantly turns purple with live countdown]
       │
       ▼
[Bon Fiscal pops up with 19% TVA breakdown ready for thermal printer]
```

---

### Journey 3: In-Seat Snack Delivery
```
[Gamer playing at PC-01 orders Red Bull & Nachos from phone]
       │
       ▼
[Kitchen Bar Board bleeps with order: "Deliver to PC-01 • PIN: 9H3P"]
       │
       ▼
[Staff brings snacks to PC-01 ──► Customer shows PIN ──► Order Completed]
```

---

## 5. Romanian Legal & Regulatory Shield

GamerBooker Enterprise is built specifically to protect arena proprietors under Romanian legislation:

1. **Law 42/2024 (Minors Protection):**
   * Strictly forbids unaccompanied minors under 16 from remaining in public gaming lounges between **22:00 and 06:00**.
   * The platform blocks checkout during curfew hours unless adult supervision is verified.
2. **O.G. 34/2014 (Consumer Rights & Cancellation):**
   * Clear 14-day statutory waiver for instant digital gaming allocation, with policy-governed refund tiering (100% refund $\ge$ 3h before start, 50% refund within 3h).
3. **ANAF Fiscal Memory & Cash Register Chaining:**
   * Daily Z-reports with SHA-256 hash chaining ($Hash_n = SHA256(Hash_{n-1} + LedgerData)$) guaranteeing tamper-proof accounting records.

---

## 6. How to Run the Project (Step-by-Step Setup)

### Prerequisites
* **Node.js:** v20.x LTS or higher
* **Docker Desktop:** Installed and running

### Step 1: Clone & Install
```bash
# Clone the repository
git clone https://github.com/YOUR_ORG/GamerBooker_Enterprise_v1.0.git
cd GamerBooker_Enterprise_v1.0

# Install backend dependencies
npm install

# Install dashboard & mobile dependencies
cd apps/venue-dashboard && npm install
cd ../mobile-app && npm install
cd ../..
```

### Step 2: Start the Database & Apply Migrations
```bash
# Start PostgreSQL 16 container on port 5433
docker compose up -d postgres

# Run database migrations
node db/migrate.js

# Seed sample data (Nexus Gaming Arena, stations, menus)
npm run seed
```

### Step 3: Run the Development Servers
Open 3 terminal tabs (or run in background):

```bash
# Terminal 1: Backend API (Port 3000)
npm run start:dev

# Terminal 2: Venue Operations Dashboard (Port 5173)
cd apps/venue-dashboard && npm run dev

# Terminal 3: Customer Mobile Web App (Port 5174)
cd apps/mobile-app && npm run dev
```

---

## 7. Cloud Production Deployment in 1 Command

To deploy the entire production stack (PostgreSQL, Redis, Backend, Dashboard, Mobile App, and Nginx Gateway) to any cloud VPS (Ubuntu):

```bash
# 1. Copy production secrets template
cp .env.production.example .env

# 2. Run the automated deployment script
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

All 6 services will build, migrate, and start automatically behind the Nginx Edge Gateway on ports `80` and `443`!

---

## 8. Verification & Test Metrics

Run the automated test suite across all 42 modules:
```bash
npm test
```

**Results:**
* **Test Suites:** 42 passed, 42 total (100%)
* **Tests:** 525 passed, 0 failed
* **Snapshots:** 0
* **Coverage:** RBAC, MFA, Exclusion Constraints, Hold TTLs, Group Splits, F&B Kitchen Dispatch, ANAF Fiscal Chaining, Chaos PSP recovery, DST transitions, and Apple Guidelines.

---

## 9. Summary for Partners & Friends

| What You Need | Where It Lives |
|---|---|
| **Mobile App (For Players)** | [http://localhost:5174](http://localhost:5174) |
| **Dashboard (For Staff & Owners)** | [http://localhost:5173](http://localhost:5173) |
| **API Documentation (For Developers)** | [http://localhost:3000/docs/](http://localhost:3000/docs/) |
| **GitHub Actions CI/CD** | `.github/workflows/ci-cd.yml` |
| **Production Cloud Guide** | `docs/11-delivery/06-cloud-deployment-walkthrough.md` |
| **App Store Submission Guide** | `docs/11-delivery/05-app-store-submission-guide.md` |

*GamerBooker Enterprise v1.0 is complete, verified, and ready for commercial gaming arena operations.*
