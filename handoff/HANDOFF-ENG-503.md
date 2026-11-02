# HANDOFF-ENG-503: Security Hardening, BOLA/PenTest Suite, and Observability Dashboards

## 1. Goal & Architectural Scope
Delivers enterprise security hardening, comprehensive BOLA (Broken Object Level Authorization) / BOPLA (Broken Object Property Level Authorization) penetration testing suite, OWASP recommended security headers middleware, security violation audit logging, and operational observability dashboards for GamerBooker Enterprise v1.0, satisfying:
- `docs/11-delivery/04-engineering-handoff-backlog.md` (ENG-503)
- `docs/09-security/01-security-and-privacy.md`
- `docs/02-architecture/01-system-architecture.md`
- `docs/01-product/03-business-rules.md`

Implements:
1. **OWASP Recommended Security Headers Middleware**:
   - `SecurityHeadersMiddleware` mounted globally in NestJS pipeline:
     - `Content-Security-Policy`: `default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'`
     - `X-Content-Type-Options`: `nosniff`
     - `X-Frame-Options`: `DENY`
     - `Strict-Transport-Security`: `max-age=31536000; includeSubDomains; preload`
     - `Referrer-Policy`: `strict-origin-when-cross-origin`
     - `X-Permitted-Cross-Domain-Policies`: `none`
     - `X-XSS-Protection`: `0`
2. **BOLA (Broken Object Level Authorization) Defensive Hardening**:
   - Customer B cannot view Customer A's booking details (`404 BOOKING_NOT_FOUND` / anti-enumeration).
   - Customer B cannot generate or access Customer A's rolling HMAC QR token (`404 BOOKING_NOT_FOUND`).
   - Customer B cannot transition or cancel Customer A's booking (`404 BOOKING_NOT_FOUND`).
   - Customer B cannot view Customer A's fiscal booking receipt (`404 NOT_FOUND`).
   - Customer B cannot access Customer A's F&B order status flow (`404 ORDER_NOT_FOUND`).
   - Cross-venue isolation: Staff from Venue B cannot inspect or operate Venue A's bar board or live floor (`403/404`).
3. **BOPLA / Price & Settlement Tampering Immunity**:
   - Client-side tampering of totals (`total_minor`, `due_now_minor`, `balance_minor`) on quote creation is strictly ignored and overridden by server-side authoritative policy pricing calculations and cryptographic signatures.
4. **Security Violation Logging & Observability**:
   - `ObservabilityService.logSecurityViolation`: Ingests violation events (`BOLA_UNAUTHORIZED_OBJECT_ACCESS`, `CROSS_VENUE_FORBIDDEN`, etc.) and stores them immutably in `audit_events`.
   - `GET /v1/observability/security-metrics`: Surfaces total violations, breakdowns by violation type, high-risk operational flags, and recent violation records.
   - `GET /v1/observability/system-health`: Surfaces real-time node uptime, PostgreSQL connection pool metrics (active connections, latency ms), and transactional outbox queue backlog health.

## 2. Domain Invariants & Rules
1. **Zero Information Leakage (Anti-Enumeration)**:
   - Unauthorized attempts to access foreign customer or venue resources must return `404` (or `403` where appropriate) without disclosing resource existence, metadata, or version information.
2. **Authoritative Pricing**:
   - All booking totals, currency definitions, and payment breakdowns are computed exclusively by backend rules. Mass-assignment attempts on quotes, holds, or confirmations are rejected or disregarded.
3. **Audit Trail Integrity**:
   - All security violation logs are appended to the immutable `audit_events` ledger with `request_id` tracking.

## 3. Database Schema
Migration `migrations/0031_security_observability.sql`:
- Added optimized performance indexes on `audit_events`:
  - `idx_audit_events_action_created_at` on `(action, created_at DESC)`
  - `idx_audit_events_tenant_action_created_at` on `(tenant_id, action, created_at DESC)`

## 4. API Specification
- `POST /v1/observability/security-violations` (Audit logging for security incidents)
- `GET /v1/observability/security-metrics` (Operational security dashboard metrics)
- `GET /v1/observability/system-health` (Deep health check, connection pool metrics, outbox backlog)

## 5. Acceptance Verification Plan
Automated integration test suite `tests/eng503-security-hardening-and-observability.spec.ts`:
- **OWASP Headers**: Proves presence of CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, and X-XSS-Protection on responses.
- **BOLA PenTest**: Proves cross-customer isolation on booking view, QR rolling token, cancellation, receipt, and order status flow. Proves cross-venue isolation on bar board and live floor.
- **BOPLA Tamper Immunity**: Proves client pricing mass-assignment attempts are neutralized.
- **Security Observability**: Proves violation ingestion, categorization aggregation, pool health check, and outbox queue telemetry.
