# HANDOFF-ENG-001 - E0 Foundation

Historical status: proposed, awaiting human acceptance. not implemented. See the [2026-11-04 status inventory](HANDOFF-INDEX-2026-11-04.md) for the later assessment.
Author: thinker. Recorded by: primary agent (scribe owns this file from now on).
Sources verified by the primary agent: BR-011, BR-024, OI-017, DEC-014, ADR-002 all exist as cited.

## Mandatory task header

`ENG-001 | E0 Foundation: CI, IaC for staging+prod, secrets, observability | Inputs: docs/11-delivery/04-engineering-handoff-backlog.md, docs/11-delivery/01-implementation-roadmap.md, docs/02-architecture/01-system-architecture.md, docs/02-architecture/04-nonfunctional-and-reliability.md, docs/99-open-issues-and-approvals.md, docs/00-decisions-and-traceability.md | Domain invariant: BR-011, BR-024, DEC-014, ADR-002 | API: none product-facing | DB: Postgres 16+, per-environment, PITR, least-privilege roles | UI: none | Error codes: INFRA_* namespace | Authorization: no staff booking path, no tenant bypass | Tests: ENG001-T01..T06 | Telemetry: mandatory log fields + 8 metrics | Acceptance owner: OPEN (OI-017, SRE/Founder)`

## Context

ENG-001 appears once, in `docs/11-delivery/04-engineering-handoff-backlog.md` (E0 Foundation) and heads the critical path on line 54. M0 exit criteria in `docs/11-delivery/01-implementation-roadmap.md` require multi-tenant isolation tests, health checks, a reproducible deploy and a backup restore demo. This contract contains no domain features.

Repo state: `git init` done, `docs/` + agent config committed as `29e2550`. The "init repo" portion of ENG-001 is therefore complete.

## Variants considered

- **A. Single region, one cluster per environment, IaC from day one.** Recommended. Lowest operational surface, matches the modular monolith in ADR-001. No cross-region failover. Pending OI-017.
- **B. Multi-region active-passive, per-tenant schemas, blue/green migration lanes.** Rejected for V1. Implies a sharding decision no document states, and risks the single-SQL-transaction hold guarantee in `docs/02-architecture/01-system-architecture.md` (critical transactions).
- **C. Vendor-managed stack.** Rejected for the core. Moves the commit-time exclusion constraint and outbox outside our control (ADR-002).

## Decision and rationale

- **IaC only, no console drift.** M0 requires a reproducible deploy; staging and prod must fail closed.
- **CI runs Postgres 16+ with range constraints.** Redis is never the source of truth (ADR-002). Every CI job gets an ephemeral database with deterministic fixtures.
- **Secrets from a secret manager**, least-privilege service and DB accounts, no credentials in repo or mobile, rotation defined. PSP credentials are separated per environment.
- **Observability from day one.** ENG-503 owns dashboards, but ENG-001 owns the pipeline and the mandatory fields; dashboards cannot be built later over fields that were never emitted.
- **No invented SLO thresholds.** All targets are OI-017.

## Trade-offs and risks

- A real Postgres in CI costs pipeline time; it is the only way to prove BR-011 (see T-001, T-002).
- Single region lowers resilience while OI-017 is open.
- Fixing telemetry field names now means ENG-503 reviews them later; cheaper than re-instrumenting holds afterwards.
- No cloud vendor is confirmed; a late IaC rewrite is possible.

## Domain invariants

1. Modular monolith on PostgreSQL - DEC-014 (still PROPOSED), ADR-001.
2. Redis is cache/rate-limit only, never booking or balance truth - ADR-002.
3. Resources cannot have overlapping active allocations - BR-011.
4. Owner cannot disable audit, anti-overlap, fraud checks or mandatory access rights - BR-024. No env var or config key may disable them.
5. Money is integer minor units (bani). Fixture: 10000 bani, deposit 4000.
6. `start_at`/`end_at` stored UTC, interval `[start, end)`, displayed Europe/Bucharest.
7. Confirmed bookings keep an immutable policy and price snapshot - ADR-003.
8. Group booking confirms only when all required funds are satisfied; timeout refunds, never revives - ADR-006.
9. Bookings are created by the customer through the app, never by staff - ADR-004, BR-001.
10. Tenant authorization is checked on every object, not only on `venue_id` - security doc.
11. Ledger and audit are append-only; never UPDATE or DELETE.
12. No live money until OI-001 and OI-002 are signed off.

## Proposed API / DB / UI

**API**: no product endpoints. Health and readiness endpoints, names `/healthz` and `/readyz` are a proposal, not doc-sourced; docs require "health checks" only. Readiness returns 200 only when Postgres is reachable; Redis down does not fail readiness. No auth, no tenant data. `X-Request-Id` on every request, propagated as `trace_id`.

**DB**: one database per environment. `CREATE EXTENSION btree_gist`. Least-privilege roles: `migrator` (DDL), `app` (writes claims, no DDL), `read`. Append-only enforced by grants: no DELETE on ledger or audit tables. PITR enabled. Migrations must be expand-safe.

**UI**: none. Internal deploy status page and a CI redaction report artifact only.

## Error codes

CI and infrastructure namespace, not the booking domain: `BUILD_FAILED`, `SCHEMA_VALIDATION_FAILED`, `HOLD_OVERLAP_DETECTED`, `TENANT_ISOLATION_FAILED`, `SECRET_LEAK_DETECTED`, `REDACT_SENSITIVE_FIELD`, `READY_DB_UNAVAILABLE`, `PERMISSION_BROAD`, `SEED_IDEMPOTENCY_VIOLATION`, `PITR_RESTORE_DRILL_FAILED`.

Do not reuse `FORBIDDEN`; that belongs to the booking domain.

## Authorization

- Staff cannot create a booking - BR-001, ADR-004, T-020, T-028.
- CI pulls secrets per job with short-lived credentials; no permanent artifacts.
- Prod deploy requires human approval. The count "two approvers" is not stated in any doc; treat as OPEN.
- Staging holds no real PII.
- App role cannot DDL; migrator does not read business PII beyond migration needs.

## Tests (to be written by tester under tests/)

- ENG001-T01: Postgres 16 with the exclusion constraint present, proving BR-011 exists before any booking engine is built (pairs with T-001, T-002).
- ENG001-T02: redaction probe. `trace_id`, `tenant_id`, `venue_id`, `booking_id`, `hold_id`, `payment_id` present; card PAN and CVV absent; no secret in logs.
- ENG001-T03: the eight metrics emit.
- ENG001-T04: backup restore drill passes before M0 exit.
- ENG001-T05: staging and prod configurations are distinct and least-privilege.
- ENG001-T06: no configuration disables a platform invariant (BR-024).

No test result is claimed here.

## Telemetry

- Mandatory log fields: `trace_id`, `tenant_id`, `venue_id`, `booking_id`, `hold_id`, `payment_id`, with redaction.
- Traces: client -> API -> DB -> webhook, plus outbox. PSP correlation without PAN.
- Metrics: `booking_hold_created`, `hold_expired`, `confirmed`, `payment_failed`, `refund_pending_age`, `stock_reserved`, `layout_publish_failed`, `qr_redeem_denied`. Labels are not specified by any doc.
- Alerts: payment mismatch, hold leak, orphan claim, duplicate reference, elevated 5xx, cross-tenant auth denials, webhook latency, backup failure.

## Open items

1. OI-017 feature flags and SLO targets. Owner SRE/Founder. Blocks GA and alert thresholds. Default: use NFR values, pilot flags off.
2. OI-001 PSP eligibility in Romania. Owner Finance/Legal. Blocks live payments. Default: adapter plus sandbox only.
3. OI-002 merchant-of-record and payouts. Owner Legal/Finance. Blocks live payments.
4. OI-012 GDPR roles and retention. Owner DPO/Legal. Blocks production and any staging with real PII.
5. DEC-014 is still PROPOSED. Blocks formal ENG-001 sign-off. Owner Architecture.
6. Observability vendor, alert thresholds, CI runner, deploy approval count: not stated anywhere read. Owner SRE lead.

## Acceptance owner

Not named by any document read. Proposed owner: SRE lead / Founder under OI-017. Must be assigned before acceptance.

Acceptance checklist: health checks green; staging and prod deploys reproducible; no secret in repo or logs; restore drill passed; required trace fields present; BR-011 and BR-024 provably enforced in a test environment.
