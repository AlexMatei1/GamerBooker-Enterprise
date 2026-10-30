# HANDOFF - ENG-002 Auth: verified identity, staff MFA, sessions, RBAC

Status: proposed, awaiting human decisions D1-D5 before implementation starts.
Author: thinker (contract), recorded by the primary agent.
Task source: docs/11-delivery/04-engineering-handoff-backlog.md:8 (ENG-002),
critical path line 54. M0 requires auth plus tenant/venue model
(docs/11-delivery/01-implementation-roadmap.md).

Precondition: ENG-001 is NOT accepted. CI, IaC, secrets, backup/restore and
staging/prod do not exist. ENG-002 proceeds anyway because none of those are
needed to write and test auth against local PostgreSQL.

## Scope

Deliver server-side authentication and authorization for the mobile app and the
venue dashboard: account creation with verified email/phone, password login,
TOTP MFA for privileged roles, opaque server sessions with revocation, and a
closed five-role RBAC matrix enforced per request at venue scope.

Grounded in:
- docs/09-security/01-security-and-privacy.md:5 (server validates identity, role,
  tenant scope and ownership for every id)
- docs/09-security/01-security-and-privacy.md:13-14 (rate limit auth; CSRF for
  cookie dashboard; mobile token scoping, secure storage, rotation)
- docs/09-security/01-security-and-privacy.md:17 (MFA mandatory for
  owner/manager/platform admin; financial-operation gate is [PROPOSED])
- docs/09-security/01-security-and-privacy.md:18 (least privilege, secret manager)
- docs/05-venue-dashboard/04-roles-onboarding-and-audit.md:4-17 (role matrix)
- docs/02-architecture/02-data-model.md:9-12 (tenants, venues, users,
  venue_memberships)
- docs/08-api/01-api-contracts.md:4 (bearer token, audience verified, RBAC per
  request, X-Request-Id)
- docs/08-api/01-api-contracts.md:88 and
  docs/08-api/03-contract-schemas-and-errors.md:81 (401/403/429, 404 for
  out-of-tenant objects)
- docs/01-product/02-scope-and-requirements.md:6 (FR-AUTH-01 create account,
  delete own account, own history)
- docs/01-product/03-business-rules.md:28 (BR-024 owner cannot disable audit,
  anti-overlap, fraud checks or mandatory access rights)
- docs/10-testing/01-test-strategy-and-acceptance.md:43 (T-028)

## In scope

- Password accounts, Argon2id hashing, email verification state.
- Opaque session tokens, hashed at rest, cookie for dashboard and bearer for
  mobile, revocable on logout and logout-all.
- TOTP enrollment and verification for OWNER, VENUE_MANAGER, PLATFORM_ADMIN.
- Closed role enum on venue_memberships, resolved per request from the database.
- /v1 router prefix for product routes. /healthz and /readyz stay unversioned.
- A global exception filter so no error escapes without the standard envelope.
- Auth audit events, append-only.

## Out of scope (deferred, with reason)

- JWT access tokens and signing keys: no secret manager exists, and an opaque
  session needs no key. Revisit when secrets management lands.
- Refresh-token rotation: re-login is the rotation for opaque sessions.
- SMS MFA: no provider account, per-message cost, SIM-swap risk not modelled.
- Social login, SSO, password reset delivery: no mail/push provider exists.
- Full tenancy and venue model: ENG-003 owns tenants/venues columns. ENG-002
  needs only id, tenant_id and timezone for scope checks.
- Staff management UI and invitation screens: ENG-201.
- Booking, holds, payments, PSP: ENG-005 and later.
- Rate limiting infrastructure beyond auth routes: ENG-001 delivery item.

## Decisions

D0 Session mechanism - DECIDED (thinker): opaque DB-backed session, not JWT.
  Same sessions row serves cookie and bearer. Token is random, stored only as
  SHA-256. Lookup is one indexed query per request. Rationale: no signing key
  and no secret manager exist, and revocation must be immediate for staff
  deactivation. Cost accepted: one SELECT per authenticated request.

D1 Verification delivery - DECIDED (human, phase 0): a development-only token
  is written to the server log and returned by an endpoint that exists only
  when NODE_ENV=development. No mail or SMS provider is integrated. This is an
  explicit gap for staging/prod and must be closed before either environment.

D2 MFA scope - DECIDED (human): MFA is required for OWNER, VENUE_MANAGER and
  PLATFORM_ADMIN only. RECEPTION and BAR_STAFF authenticate with password only
  in phase 0. Accepted risk, recorded: a compromised reception account reaches
  check-in and booking-view data. Revisit at ENG-201.

D3 MFA mechanism - DECIDED (thinker): TOTP (RFC 6238) with recovery codes.
  No third party, no per-message cost, works offline. SMS deferred.

D4 Email uniqueness - DECIDED (human): email is globally unique and
  case-insensitive, enforced by a partial unique index on lower(email) where
  deleted_at is null. One person has one identity and may hold memberships in
  several venues. Login therefore never needs a tenant discriminator.

D5 TOTP secret at rest - DECIDED (human): store the TOTP secret encrypted with
  pgcrypto using a key supplied by an environment variable that must never be
  committed. This is a real security gap until a KMS exists; it is recorded as
  a release blocker for staging/prod, not for local development.

D6 Staff invitation - DECIDED (human): the owner creates an invitation token
  with an expiry; the invited staff member sets their own password. The owner
  never learns a staff credential.

## Data shape

ENG-002 owns these. All tables: id uuid primary key, created_at/updated_at
timestamptz.

- users(id, email, email_verified_at, phone, phone_verified_at, password_hash,
  identity_status, deleted_at)
  UNIQUE lower(email) WHERE deleted_at IS NULL.
- sessions(id, user_id, token_hash bytea UNIQUE, kind mobile|dashboard,
  mfa_state PENDING|ACTIVE, created_at, last_seen_at, idle_expires_at,
  absolute_expires_at, revoked_at, ip_hash, ua_hash)
  Raw token is never stored. Lookup is by SHA-256 of the presented token.
- user_mfa_factors(id, user_id, type totp, secret_encrypted, confirmed_at,
  recovery_codes_hash)
- venue_memberships(id, user_id, venue_id, tenant_id, role, active)
  UNIQUE (user_id, venue_id) WHERE active. role is a closed enum:
  PLATFORM_ADMIN, OWNER, VENUE_MANAGER, RECEPTION, BAR_STAFF.
- audit_events - append-only, columns per
  docs/05-venue-dashboard/04-roles-onboarding-and-audit.md:36.

ENG-003 owns tenants and venues. ENG-002 creates them only as minimal
dependencies (id, tenant_id, timezone) and must not absorb their full columns.

## API surface

Product routes mount under /v1. Health probes stay at /healthz and /readyz.

- POST /v1/auth/register
- POST /v1/auth/verify
- POST /v1/auth/login
- POST /v1/auth/mfa/enroll
- POST /v1/auth/mfa/verify
- POST /v1/auth/logout
- POST /v1/auth/logout-all
- GET  /v1/me
- DELETE /v1/me
- POST /v1/staff/invitations

All error bodies use {error:{code,message,details?,request_id,retryable}}.
request_id comes from getRequestId() and must never be empty.

Existing codes reused verbatim: AUTH_REQUIRED (401), FORBIDDEN (403),
RATE_LIMITED (429), VALIDATION_ERROR (400), RESOURCE_NOT_FOUND (404).

Proposed new codes, marked [NEW] for acceptance: AUTH_INVALID_CREDENTIALS,
AUTH_EMAIL_UNVERIFIED, AUTH_MFA_REQUIRED, AUTH_MFA_INVALID,
AUTH_SESSION_EXPIRED, AUTH_SESSION_REVOKED, AUTH_ACCOUNT_DELETED,
AUTH_ACCOUNT_LOCKED, AUTH_ROLE_NOT_PERMITTED, AUTH_INVITATION_INVALID.

## Domain invariants

1. The server is the only authority. No client-supplied user id, role, tenant
   or session state is ever trusted (docs/09-security/01:5).
2. Membership is resolved from the database per request, never from a claim.
3. A cross-tenant object returns 404, not 403, to avoid enumeration.
4. No staff role may create a booking on behalf of a customer
   (docs/05-venue-dashboard/04:11 - "no" for all five roles). No such route
   exists; T-028 must prove 403/404.
5. PLATFORM_ADMIN is not an implicit venue OWNER and has no impersonation path.
6. A session created before MFA completion is MFA_PENDING and cannot reach any
   non-enrolment route for a gated role.
7. Auth audit rows are append-only, never updated or deleted.
8. No password, hash, raw token, TOTP code or PAN/CVV appears in logs.
9. Rate limits on auth routes are policy values and cannot be disabled per
   venue (BR-024).

## Acceptance cases

ENG002-T01 register then verify then login then GET /v1/me returns own user_id.
ENG002-T02 duplicate email (including case and +tag variants) yields exactly one
  users row and one conflict response; a different email succeeds.
ENG002-T03 RECEPTION may read bookings of its own venue (200); the same user on
  another venue gets 404; any staff role calling a customer booking-create route
  gets 403 AUTH_ROLE_NOT_PERMITTED, and no staff create-on-behalf route exists.
ENG002-T04 OWNER with correct password but wrong TOTP cannot reach a gated
  route; repeated failures lock the account; a correct TOTP yields an ACTIVE
  session; GET /v1/me never returns the TOTP secret, recovery codes or token.
ENG002-T05 wrong email and existing email with a wrong password return an
  identical 401 body shape and comparable timing; no account enumeration.
ENG002-T06 login sets a cookie with HttpOnly, Secure, SameSite=Lax, Path=/ and
  no Domain; logout revokes it so the same cookie returns 401; logout-all
  revokes every session; a new login never reuses an old token.
ENG002-T07 DELETE /v1/me revokes sessions, anonymizes PII, writes an audit row
  with action, actor_id, reason and request_id, and the old credentials no
  longer authenticate.
ENG002-T08 login bodies containing user_id or role are ignored; the session role
  equals the stored membership; auth log lines carry trace_id and no secret.

## Test mapping

ENG001-T01 already proves the BR-011 exclusion constraint at the DB layer.
ENG-002 tests are unit plus integration against real PostgreSQL via the pg
driver, following the same pattern, until a CI job exists.

## Risks and traps

- No secret manager: the TOTP secret and any reset token have no real KMS. D5.
- Timing and enumeration: login must compare a dummy hash on unknown users so
  the failure path costs the same as a real one.
- Session fixation: mint a new token on every login and on MFA completion.
- Cookie scope: __Host- prefix forbids Domain and requires Path=/ and Secure.
- No global exception filter yet: an unexpected throw currently escapes the
  envelope. ENG-002 must add one.
- Docs contain pre-existing mojibake in places; read meaning, do not copy text.

## Open questions for the human

None. D1, D2, D4, D5 and D6 were decided by the human on 2026-10-30 and are
recorded above. D0 and D3 were decided by the thinker. If any decision changes,
this handoff must be amended before the implementer acts on it.

Decisions that create release blockers rather than implementation blockers:
- D1 (dev-only verification token) blocks staging and prod.
- D5 (env-var encryption instead of a KMS) blocks staging and prod.

## Definition of done

ENG002-T01..T08 pass against real PostgreSQL, a reviewer returns PASS, and the
handoff records which of D1-D6 were resolved and by whom. Acceptance itself
requires a named owner, which does not exist today.
