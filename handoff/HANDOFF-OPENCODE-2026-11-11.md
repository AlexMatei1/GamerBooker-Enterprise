# GamerBooker Enterprise — Handoff for OpenCode

**Date**: 2026-11-11  
**Project**: GamerBooker Enterprise v1.0  
**Stack**: NestJS (TypeScript) + PostgreSQL (TimescaleDB / PostGIS) + React Vite (Dashboard) + Flutter (Mobile) + Docker

---

## 1. Executive Summary & Current State

GamerBooker Enterprise is a high-reliability platform for esports arenas, gaming centers, and cyber cafes. It provides:
1. **Platform Admin Console** (`/admin`): Approves cafe partner intake applications submitted via Google Forms/Sheets, auto-generates tenant structures, operating schedules, pricing rules, PC station layouts, and cafe owner accounts with temporary passwords.
2. **Partner Venue Dashboard** (`/dashboard`): Comprehensive venue operations console for owners and staff covering:
   - **Sală** (`floor`): Live floor layout, 20 PC stations, real-time status (`AVAILABLE`, `OCCUPIED`, `MAINTENANCE`), and maintenance blocking with GiST exclusion.
   - **Comenzi** (`orders`): Bar Board queue for food/drink orders, with real-time station targeting and status transitions (`PLACED` ➔ `ACCEPTED` ➔ `PREPARING` ➔ `READY` ➔ `HANDED_OFF`).
   - **Încasări** (`financials`): Fiscal receipts ledger, cash/card breakdown, and voiding.
   - **Configurare** (`setup`): Venue profile, publication gates, rooms, zones, PC resources, operating hours (7 days, 10:00–02:00), pricing rules (25 RON/h standard, 40 RON/h VIP), policy profiles, bar menu & products, and staff team management/invitations.
3. **Mobile Client App** (`apps/flutter-mobile`): Flutter customer mobile app featuring:
   - Public live catalog discovering all published cafes (`GET /v1/venues`).
   - Real-time station availability query across rooms/zones (`/v1/venues/:id/availability`).
   - Mobile authentication (Bearer token).
   - Cryptographically signed price quotes (`/v1/quotes`).
   - Atomic holds (`/v1/holds`) backed by PostgreSQL GiST exclusion claims (`resource_claims`).
   - Solo checkout & digital Boarding Pass with rolling HMAC QR token (`/v1/checkout/solo`).
   - In-session bar ordering delivered directly to stations (`/v1/orders/checkout`).
   - Policy-compliant booking cancellation (`/v1/bookings/:id/cancel-policy`).

All services are fully implemented, compiling with zero TypeScript errors (`npx tsc --noEmit`), and 100% verified via automated integration suites.

---

## 2. Infrastructure & Local Runtime Topology

| Component | Host / Port | Service / Command | Notes |
| :--- | :--- | :--- | :--- |
| **PostgreSQL** | `localhost:5433` | Docker container `gamerbooker_postgres` | Database `gamerbooker_dev`, user `postgres`. Requires Docker Desktop backend (`com.docker.backend.exe`). |
| **Backend API** | `http://127.0.0.1:3000` | NestJS server (`node tools/local-auth/start-api.cjs start`) | CORS allowlist includes `http://localhost:5173`. Proxied by Vite. |
| **Venue Dashboard** | `http://localhost:5173` | React + Vite (`npm --prefix apps/venue-dashboard run dev`) | Proxies `/v1` to `http://127.0.0.1:3000`. Supports both HTTP and TLS. |
| **Flutter Mobile** | Local Dart / Android | `apps/flutter-mobile` | SDK at `C:\flutter\bin`. Defaults in debug mode to loopback `http://127.0.0.1:3000`. |

---

## 3. Seed Accounts & Entities in Development

### 3.1 Administrator Account
- **Email**: `alexmatei2330@gmail.com`
- **User ID**: `561a11f5-2aa0-423f-84cf-dba27589c416`
- **Role**: `PLATFORM_ADMIN` (audited grant in `platform_grants` table).
- **Access**: Admin Console at `http://localhost:5173` (`/admin` tab).
- **Capabilities**: Review partner applications, review temporary passwords, approve/reject venues, manage platform access.

### 3.2 Cafe Partner (Arena Cyber Cafe)
- **Venue Name**: `Arena Cyber Cafe`
- **Venue ID**: `30386a6e-6c6b-4120-9368-0bcbac972609`
- **Tenant ID**: `7761a06e-f1a7-4883-8a06-b7a04aba068b`
- **Slug**: `arena-cyber-cafe-7761a0`
- **Publication State**: `PUBLISHED` (automatically published on intake approval).
- **Owner Email**: `popamatei85@yahoo.com` (User ID: `9f5f9ac0-206e-4681-a309-fcd35566dd2a`).
- **Owner Role**: `OWNER` on `venue_memberships`.
- **Stations (20 total)**:
  - 15 Standard PC Stations: `PC-01` .. `PC-15` (Zone: *Zona PC Standard*, 25.00 RON/h).
  - 5 VIP / Bootcamp 5v5 Stations: `VIP-01` .. `VIP-05` (Zone: *Zona VIP / Bootcamp 5v5*, 40.00 RON/h).
- **Operating Hours**: Monday–Sunday, 10:00 to 02:00.
- **Menu Items**:
  - `Monster Energy Ultra 500ml` (SKU: `MNSTR-01`, 12.00 RON, Category: *Băuturi*).

### 3.3 Test Customer Account
- **Customer Email**: `andrei.gamer@gmail.com`
- **User ID**: `1b86987b-530f-4f99-a4f4-87c692ca08d5`
- **Auth Mode**: Mobile Bearer token (`kind = 'mobile'`).

---

## 4. Key Architecture Invariants & Standards

1. **Security & Session Isolation**:
   - Dashboard sessions use HttpOnly cookie named `__Host-gb_session`.
   - All state-mutating requests (POST, PUT, PATCH, DELETE) strictly require header: `X-GamerBooker-CSRF: 1`.
   - Mobile sessions use standard `Authorization: Bearer <token>` headers (`kind = 'mobile'`).
   - Session tokens in database are stored strictly as binary SHA-256 digests (`bytea`), never plaintext or hex strings.
2. **GiST Exclusion Constraint for Bookings & Holds**:
   - Double-booking prevention is enforced at the database kernel level using PostgreSQL GiST range exclusions on `resource_claims` (`tstzrange(starts_at, ends_at, '[)')`).
   - When placing a hold or maintenance block, an active claim is inserted into `resource_claims`. When cancelled or released, `state` is set to `'RELEASED'`.
3. **Publication Gates (`/publish-gates`)**:
   - Venues must pass 5 gates before public visibility: `has_bookable_resource`, `has_operating_schedule`, `has_policy_profile`, `has_price_rule`, and `has_staff`.
   - In `src/platform-access/access.service.ts`, applications approved via Google Form intake satisfy all 5 requirements and are immediately inserted with `publication_state = 'PUBLISHED'`.
4. **Policy Settings Alignment**:
   - `PolicySettings` requires `slot_granularity_minutes` (15, 30, or 60), `min_duration_minutes`, `max_duration_minutes`, `deposit_percentage`, and `deposit_mode_settlement`.
   - `PoliciesService.resolveEffectivePolicy()` merges stored settings with `DEFAULT_PLATFORM_POLICY` to prevent `undefined` granularity validation errors.

---

## 5. Verification & Test Scripts

All test scripts are located in `scratch/` and can be executed via Node.js:

```powershell
# 1. Run all 20 Partner Dashboard API checks (Sală, Comenzi, Încasări, Configurare, Rezervări)
node scratch/test-all-tabs.cjs

# 2. Run interactive mutation tests (maintenance block & cancel, staff invite & revoke)
node scratch/test-dashboard-mutations.cjs

# 3. Run complete End-to-End customer simulation (Flutter Mobile ⇄ Backend ⇄ Partner Dashboard)
node scratch/full-customer-simulation.cjs

# 4. Run Flutter mobile test suite (49 unit & widget tests)
cd apps/flutter-mobile
flutter test
cd ../..

# 5. TypeScript compile check (no emit)
npx tsc --noEmit
```

---

## 6. Project Directory Map

```text
GamerBooker_Enterprise_v1.0/
├── apps/
│   ├── flutter-mobile/                 # Flutter mobile client app
│   │   ├── lib/
│   │   │   ├── catalog/                # Live catalog client, quotes, holds, checkout
│   │   │   ├── screens/                # Explore, SeatPicker, BarOrdering, BoardingPass
│   │   │   └── main.dart               # Entrypoint (LiveCatalogApp vs debug demo)
│   │   └── test/                       # 49 unit and widget tests
│   └── venue-dashboard/                # Partner & Admin React web application
│       ├── src/
│       │   ├── components/admin/       # AdminConsole.tsx (Google Forms intake approval)
│       │   ├── components/company/     # CompanyDashboard.tsx (All 6 tabs: floor, orders, financials, setup)
│       │   ├── api/                    # secure-client.ts (CSRF & credentials)
│       │   └── SecureApp.tsx           # Authentication & route multiplexer
├── src/
│   ├── auth/                           # Sessions, MFA, local admin policy, CSRF
│   ├── bookings/                       # Quotes, holds, availability, solo checkout, lifecycle
│   ├── consumables/                    # Bar Board queue, cart validation, station orders
│   ├── platform-access/                # Cafe application approval, tenant & venue auto-generation
│   └── venues/                         # Operations (live floor, maintenance blocks), wizard setup
├── migrations/                         # PostgreSQL incremental SQL migrations
└── scratch/                            # Standalone end-to-end integration test runners
```

---

## 7. Recommended Next Steps for OpenCode

1. **Flutter Mobile UI Connection**:
   - Launch Flutter app on Android emulator/device with `adb reverse tcp:3000 tcp:3000` to interact visually with `Arena Cyber Cafe` in real time.
2. **Real-time WebSockets / SSE**:
   - Currently, the partner dashboard polls endpoints (`useLiveRefresh` every 25s). Implement Server-Sent Events (SSE) or WebSockets for instant Bar Board sound notifications when an order is placed from a station.
3. **Station PC Agent / Lock Screen Integration**:
   - Add the station client background agent (Windows service) that listens for active session codes (`GB-XXXXXX`) to unlock the PC and lock it when the session ends.
4. **Stripe Production Webhook Integration**:
   - Connect live Stripe webhooks (`/v1/payments/webhooks/stripe`) with signing secrets for production card processing.

---

*Handoff document ready for OpenCode continuation.*
