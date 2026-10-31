# ENG-002 Verification - Slice B part 2 (T04 MFA, T03 RBAC)

Status: Slice B part 2 delivered and verified. ENG-002 auth scope closed.
Sources: handoff/HANDOFF-ENG-002.md, notes/eng-002-slice-b-part-2-plan.md,
migrations/0003_mfa.sql, tests/eng002-t03-rbac.spec.ts,
tests/eng002-t04-mfa.spec.ts, tests/eng002-t04-totp.spec.ts.

## Scope

- ENG002-T04: TOTP MFA (RFC 6238) enrolment, verification, lockout, replay protection, secret encryption.
- ENG002-T03: RBAC substrate, role resolution from database per request, venue scoping, 404 cross-tenant isolation, 403 role enforcement.
- Decision implementations: D8 (user-level MFA gate for OWNER/VENUE_MANAGER/PLATFORM_ADMIN), D9 (minimal venue view GET /v1/venues/:venue_id), D10 (allowlist for pending sessions), D11 (lockout after 5 failed attempts for 15m), D12 (replay prevention via last_used_time_step), D13 (hashed recovery codes).

## Reviewer Blocking Checks Audit

1. **Double-booking**: N/A to auth/venues minimal view; PostgreSQL exclusion constraints and schema types unaffected.
2. **Money from client**: Verified. No request body or query parameter accepts, hints, or trusts client-supplied money, pricing, deposits, or payment status.
3. **Idempotency**:
   - `POST /v1/auth/mfa/enroll` is rejected with 409 `AUTH_MFA_ALREADY_ENROLLED` once a confirmed factor exists; unconfirmed enrolment replaces pending factor cleanly.
   - `POST /v1/auth/mfa/verify` verifies TOTP against `afterTimeStep = last_used_time_step`, rejecting replays within the valid window with 401 `AUTH_MFA_INVALID`.
4. **Late webhook**: N/A to auth.
5. **Tenant isolation**:
   - `GET /v1/venues/:venue_id` resolves active memberships for the caller's verified `user_id`.
   - A request for a venue owned by another tenant, or where the caller has no active membership, strictly returns 404 `RESOURCE_NOT_FOUND` with an identical body, preventing tenant and venue ID enumeration.
6. **Policy snapshot**: N/A to auth.
7. **Private room closure**: N/A to auth.
8. **Ledger integrity**:
   - `audit_events` rows written for `auth.mfa_enroll_started`, `auth.mfa_enrolled`, `auth.mfa_verified`, and `auth.mfa_failed`.
   - Secret, TOTP code, and recovery codes are never stored in audit metadata.
   - Append-only trigger remains active; DB privileges under `gamerbooker_app` restrict write access to INSERT only.
9. **Staff booking**: Not permitted; no booking creation routes exist or are introduced.
10. **Passwords and secrets**:
    - TOTP secret encrypted at rest using `pgcrypto.pgp_sym_encrypt` with `MFA_SECRET_KEY` bind parameter.
    - Plaintext secret and recovery codes returned exclusively in enrolment response, never logged, never exposed via `GET /v1/me`.
    - Recovery codes hashed with SHA-256 before storage.
    - Argon2id password hashing preserved.

## Automated Test Verification

All 9 test suites passing (149 passed, 4 deferred todo):
- `tests/eng001-t03-to-t06-deferred.spec.ts` (PASS - 4 todo)
- `tests/eng002-t04-totp.spec.ts` (PASS - RFC test vectors & timing safe checks)
- `tests/eng001-t01-br011-exclusion.spec.ts` (PASS - Exclusion constraint verification)
- `tests/eng001-t02-request-id-and-envelope.spec.ts` (PASS - Tracing & envelope)
- `tests/eng002-t03-rbac.spec.ts` (PASS - Scoping, DB role resolution, 404 vs 403)
- `tests/eng002-slice-a-hardening.spec.ts` (PASS - Least privilege & sliding sessions)
- `tests/eng002-t01-t02-t05-t06-t08-auth.spec.ts` (PASS - Core auth lifecycle)
- `tests/eng002-t06-t07-lifecycle.spec.ts` (PASS - Account deletion & logout-all)
- `tests/eng002-t04-mfa.spec.ts` (PASS - Full MFA enrollment, verification, lockout, replay)

Lint, typecheck, and build:
- `npm run typecheck`: clean (0 errors)
- `npm run lint`: clean (0 errors)
- `npm run build`: clean (0 errors)
