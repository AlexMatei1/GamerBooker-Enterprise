# 02 — Technical Architecture & Engineering Specifications

> **Target Audience for LLM:** Use this document to generate Slides 5 and 6 (System Architecture, Tech Stack, and Technical Moat).

---

## 1. System Architecture Overview

GamerBooker is architected as an event-driven, high-concurrency micro-modular monolith designed for zero latency and rock-solid reliability:

```
                            EDGE TRAFFIC (Port 80 / 443)
                                         │
                                         ▼
                             NGINX EDGE REVERSE PROXY
                         (gateway / SSL & Rate Limiting)
                                         │
                 ┌───────────────────────┼───────────────────────┐
                 │                       │                       │
                 ▼                       ▼                       ▼
       CUSTOMER MOBILE APP      VENUE OPERATIONS POS      CORE BACKEND REST API
         (React 18 / PWA)        (React 18 / Tailwind)       (NestJS 10 / Fastify)
            Port 5174                   Port 5173                   Port 3000
                 │                       │                       │
                 └───────────────────────┼───────────────────────┘
                                         ▼
                             PERSISTENCE & STATE LAYER
                 ┌───────────────────────────────────────────────┐
                 │  PostgreSQL 16 Engine with GiST Range Locks   │
                 │  Redis 7 In-Memory Caching & Lock Broker      │
                 └───────────────────────────────────────────────┘
```

---

## 2. Technology Stack Breakdown

| Layer | Technologies Used | Key Reason for Selection |
|---|---|---|
| **Backend Framework** | **NestJS 10 + Fastify Engine** | Ultra-high throughput HTTP request processing with strict TypeScript typing and dependency injection. |
| **Database** | **PostgreSQL 16 + `btree_gist`** | Native support for range exclusion constraints (`tsrange`), eliminating race conditions at the database kernel level. |
| **In-Memory Cache** | **Redis 7 (Alpine)** | Distributed rate-limiting, session store, and atomic hold TTL expiration workers. |
| **Venue Dashboard** | **React 18 + Tailwind CSS** | Clean, responsive POS interface with high frame-rate canvas drafting (AutoCAD/Figma 2D Layout Studio). |
| **Customer Mobile App** | **React 18 + SF Pro + PWA** | Native Apple iOS aesthetic, Dynamic Island live session countdown, and Apple Wallet 3D ticket pass flip. |
| **Mobile Native Bridge** | **Capacitor CLI (iOS & Android)** | Compiles the web app directly into native Xcode `.ipa` and Android Studio `.apk` binaries under bundle `ro.gamerbooker.app`. |
| **Payment Gateway** | **Stripe PSP + HMAC-SHA256** | Timing-safe webhook verification, automated intent creation, and instant refund compensations. |
| **Containerization** | **Docker & Multi-Stage Builds** | Automated Docker Compose orchestration with healthcheck probes and zero-downtime deployment scripts. |

---

## 3. The Technical Moat: Mathematical Zero-Double-Booking Guarantee

In standard booking systems, double-bookings occur when two users click "Reserve" at the same millisecond, and the application layer checks availability before writing to the database (Check-Then-Act race condition).

**GamerBooker solves this at the database kernel level:**
```sql
ALTER TABLE station_claims
ADD CONSTRAINT prevent_station_double_booking
EXCLUDE USING gist (
    station_id WITH =,
    booking_time_range WITH &&
);
```
* Even if 1,000 customers attempt to book the exact same RTX 4090 rig at the identical nanosecond, PostgreSQL allows **exactly one transaction to commit** and immediately aborts the others with code `23P01 (exclusion_violation)`.
* **Result:** Zero double bookings. 100% mathematical certainty.

---

## 4. Verification & Testing Evidence
* **42 Comprehensive Test Suites** covering all modules:
  * RBAC & MFA TOTP Security
  * GiST Exclusion Constraints & Atomic Holds (10-minute TTL recovery)
  * Solo & Group Split-Pay Workflows
  * Kitchen F&B Crockford Token Verification
  * Chaos PSP Recovery & Daylight Saving Time (DST) edge cases
  * Romanian Law 42/2024 Curfew Verification
  * ANAF SHA-256 Daily Hash Chaining
* **525 Automated Tests Passing with 0 Failures.**
* Interactive OpenAPI Swagger 3.0 documentation live at `/docs/`.
