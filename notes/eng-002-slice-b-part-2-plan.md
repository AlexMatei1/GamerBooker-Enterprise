# ENG-002 Slice B part 2 - plan (T04 MFA, T03 RBAC)

Status: plan only. Nothing in this file is implemented or verified yet.
Sources: handoff/HANDOFF-ENG-002.md, migrations/0001_auth.sql,
migrations/0002_least_privilege.sql, docs/09-security/01, otplib 13.5.0 in
node_modules.

This note exists so the implementation is mechanical and so the decisions below
are reviewable before code exists. The reviewer re-audit of 0b27952 is running
in parallel; no source file is touched until its verdict is in.

## Scope

- ENG002-T04: TOTP enrolment, verification, account lockout, no secret
  leakage through GET /v1/me.
- ENG002-T03: role resolution per request, venue scoping, cross-tenant 404,
  role gate 403 AUTH_ROLE_NOT_PERMITTED. The booking-specific half of T03 needs
  a bookings route that ENG-005 owns; see D9.

Out of scope and unchanged: D6 staff invitations, password reset delivery,
recovery-code redemption (no route in the handoff surface), SMS, any venue
write model.

## Decisions taken here

| Id | Decision | Reversible |
| --- | --- | --- |
| D8 | MFA applies to a user, not to a session: the gate is "this user holds at least one active membership with role OWNER, VENUE_MANAGER or PLATFORM_ADMIN" (D2). A customer with no membership is never gated. | yes |
| D9 | T03's 403 half cannot be proven without a bookings route, and ENG-005 owns bookings. ENG-002 therefore delivers the RBAC substrate (role resolution, venue-scope guard, 404 vs 403) and proves it on a minimal read-only venue route, GET /v1/venues/:venue_id. ENG-003 owns venues and may replace that route. The booking-create 403 case is deferred to ENG-005 and stays open against T03. | yes |
| D10 | A pending-MFA session may reach only POST /v1/auth/mfa/enroll, POST /v1/auth/mfa/verify and POST /v1/auth/logout. Every other route answers 403 AUTH_MFA_REQUIRED. Implemented as explicit opt-in metadata on those handlers, not as an exclusion list, so a new route is closed by default. | yes |
| D11 | Lockout is per factor: 5 consecutive wrong codes set locked_until = now() + 15 minutes. A locked factor refuses both verify and a fresh login (after the password is proven correct), so an attacker cannot keep guessing by re-logging in. | yes |
| D12 | A TOTP code is single-use: the time step that verified is stored in last_used_time_step and passed to otplib as afterTimeStep, so replaying the same code inside its window fails. | yes |
| D13 | Recovery codes are generated at enrolment and returned exactly once, stored only as SHA-256 hex in recovery_codes_hash. No redemption route exists in the handoff surface, so they are inert until one is added; recorded as a gap rather than inventing a route. | yes |

## New error codes

Existing envelope, no change to the shape. Status chosen here because the
handoff names the codes but not their statuses.

| Code | Status | When |
| --- | --- | --- |
| AUTH_MFA_REQUIRED | 403 | authenticated session is mfa_state=pending and the route is not MFA-eligible |
| AUTH_MFA_INVALID | 401 | wrong TOTP code, or a replayed one |
| AUTH_ACCOUNT_LOCKED | 423 | factor locked by repeated failures, checked only after the password is correct |
| AUTH_ROLE_NOT_PERMITTED | 403 | authenticated, venue in scope, role not allowed for this action |
| AUTH_MFA_ALREADY_ENROLLED | 409 | enrolment attempted while a confirmed factor exists |

AUTH_MFA_ALREADY_ENROLLED is new relative to the handoff list and must be added
to docs when the slice lands.

## Schema - migrations/0003_mfa.sql

    user_mfa_factors(
      id uuid pk,
      user_id uuid not null references users(id) on delete cascade,
      type text not null default 'totp' check (type = 'totp'),
      secret_encrypted bytea not null,
      confirmed_at timestamptz,
      recovery_codes_hash text[] not null default '{}',
      failed_attempts integer not null default 0 check (failed_attempts >= 0),
      locked_until timestamptz,
      last_used_time_step bigint,
      created_at, updated_at
    )
    unique (user_id, type)

- secret_encrypted holds pgp_sym_encrypt(secret, key) with the key from
  MFA_SECRET_KEY (D5). The key is a bind parameter, never part of the SQL text.
  Prerequisite recorded: log_statement must not be 'all' in any environment,
  because the driver can log bind parameters.
- pgcrypto 1.3 is already installed (0001 needs it for gen_random_uuid); the
  app role can execute pgp_sym_encrypt/decrypt because EXECUTE is granted to
  PUBLIC by default. Verified read-only on gamerbooker_dev.
- No BEGIN/COMMIT in the file; db/migrate.js owns the transaction.
- Grants for gamerbooker_app: SELECT, INSERT, UPDATE, DELETE on the new table.
- Migration is guarded (IF NOT EXISTS) so the parallel test harness can apply
  it repeatedly.

## API

POST /v1/auth/login (changed)
- After a correct password, if the user is gated (D8):
  - factor confirmed -> 200 with mfa_required: true and a pending session.
  - no confirmed factor -> 200 with mfa_enrollment_required: true and a pending
    session.
  - factor locked -> 423 AUTH_ACCOUNT_LOCKED, no session.
- Response body still carries no role, tenant or venue claim. The dashboard
  cookie is set as today; the mobile token is the pending token.

POST /v1/auth/mfa/enroll (pending session)
- Rejects 409 if a confirmed factor exists.
- Creates or replaces the unconfirmed factor: fresh 20-byte base32 secret,
  encrypted, recovery codes generated and hashed.
- 200 {secret, otpauth_uri, recovery_codes}. Secret and codes appear in this
  response only, never again.
- Audits auth.mfa_enroll_started with no secret in metadata.

POST /v1/auth/mfa/verify (pending session)
- Body {code}. Loads the factor, decrypts, verifySync with epochTolerance 30
  and afterTimeStep = last_used_time_step.
- Wrong code: increment failed_attempts, audit auth.mfa_failed (count only),
  401 AUTH_MFA_INVALID, or 423 AUTH_ACCOUNT_LOCKED when the threshold is hit.
- Correct code: reset the counter, set confirmed_at if null, store the time
  step, revoke the pending session, mint a NEW session token with
  mfa_state=active (fixation, per the handoff risk list), audit
  auth.mfa_verified or auth.mfa_enrolled, 200 with the token or refreshed
  cookie.
- Replay of an already used step: 401 AUTH_MFA_INVALID, counter incremented.

GET /v1/venues/:venue_id (new, D9)
- Requires an active session and an active membership on that venue.
- 200 {venue:{id, tenant_id, timezone}} - no other columns, ENG-003 owns them.
- No membership, inactive membership, or a venue of another tenant: 404
  RESOURCE_NOT_FOUND, identical body in all three cases.
- Role gate: the route is open to every venue role, so it exercises resolution
  and scoping. The 403 path is exercised by the guard unit test and lands on a
  real route with ENG-005.

## Session guard changes

- Resolve as today, then: if mfa_state = 'pending' and the handler is not
  marked MFA-eligible, 403 AUTH_MFA_REQUIRED. The session is not revoked, so the
  client can finish enrolment.
- The gate is checked after the channel binding and expiry checks, so a pending
  session still expires and still cannot cross channels.
- requireSession() keeps returning the resolved session for eligible handlers.

## Test plan

tests/eng002-t04-mfa.spec.ts
- gated owner: login -> pending -> /v1/me 403 -> enroll -> wrong code 401 ->
  five failures -> 423 -> correct code still 423 -> time-travel locked_until ->
  correct code -> new token, old token 401, /v1/me 200.
- /v1/me body contains no secret, no recovery code, no token.
- replay of a used code fails.
- a customer with no membership logs in active and is not gated.
- database: secret_encrypted is not the base32 secret in any encoding,
  recovery_codes_hash holds hashes, no audit row contains the secret or a code.
- lockout resets on success.

tests/eng002-t03-rbac.spec.ts
- RECEPTION reads its own venue 200; the same user on another tenant's venue
  404; no membership 404; inactive membership 404; identical bodies.
- role resolution reads the database, not the request: a body or header
  claiming OWNER changes nothing.
- guard unit test: a handler requiring OWNER answers 403
  AUTH_ROLE_NOT_PERMITTED for RECEPTION.

Gates after implementation: typecheck, lint, build, full jest, live smoke with
MFA_SECRET_KEY set, then notes and CHANGELOG, then review.

## Risks

| Risk | Mitigation |
| --- | --- |
| The MFA key is missing at boot | fail fast at startup with a non-secret message; the test harness sets it before importing AppModule |
| Lockout becomes an enumeration oracle | it is only reachable after the password is proven correct |
| A pending session leaks data through an error body | the guard answers before the handler runs; the envelope carries no session fields |
| Enrolment on a live account replaces MFA | rejected with 409 once confirmed; reset needs a future route with password re-auth |
| TOTP codes in logs | the code is never logged; audit metadata carries counts only |
| D5 key handling | recorded as a staging/prod blocker until a KMS exists |
