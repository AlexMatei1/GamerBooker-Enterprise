# ENG-002 Verification - Slice A and Slice B part 1

Status: Slice A delivered and hardened after review; Slice B part 1 delivered.
ENG-002 is not complete and not accepted.
Sources: handoff/HANDOFF-ENG-002.md, git history on branch main,
migrations/0001_auth.sql, migrations/0002_least_privilege.sql,
tests/eng002-*.spec.ts.
Reviewer verdict on 3f126b4: HOLD. No BLOCKER, six MAJOR, several MINOR and
NIT findings. Every finding is addressed in 0b27952 except one recorded below
as accepted risk. The reviewer could not run psql, node or git, so its pass was
static; the database checks it asked for were run by the primary agent and are
recorded here. Nothing in this file is a second independent audit.

## Scope

Slice A is register, verify email, login, logout and GET /v1/me, plus the
database and HTTP substrate they sit on.

Slice B part 1 is DELETE /v1/me (ENG002-T07), POST /v1/auth/logout-all and rate
limiting on the auth routes. It has no dependency on ENG-003.

Slice B part 2 is ENG002-T04 (TOTP MFA enrolment, verification, lockout) and
ENG002-T03 (RBAC guards and venue scoping), plus D6 staff invitations. Not
delivered.

## Commits (branch main)

| Commit | Subject |
| --- | --- |
| 3f126b4 | feat(eng-002): auth core - opaque sessions, Argon2id, /v1 prefix, error filter |
| c250fba | test(eng-002): acceptance suite for T01/T02/T05/T06/T08 on real HTTP and real PG |
| d3138f3 | fix(eng-002): decide +tag subaddresses are distinct identities (D7) |
| b64b4d1 | docs(eng-002): record Slice A delivery and its verification evidence |
| 0b27952 | fix(eng-002): close the Slice A review findings and deliver T07 |

## What was built

Database, node-postgres with hand-written SQL. Prisma is declared in
package.json but unused; BR-011 needs an exclusion constraint and D4 needs a
partial unique index on an expression, neither of which the current schema
tooling expresses here.

- migrations/0001_auth.sql: users, sessions, verification_tokens, tenants,
  venues, venue_memberships, audit_events; pgcrypto for gen_random_uuid.
- users.email: partial unique index on lower(email) where deleted_at is null.
- venue_memberships: partial unique (user_id, venue_id) where active; role is a
  five-value check (PLATFORM_ADMIN, OWNER, VENUE_MANAGER, RECEPTION, BAR_STAFF).
- audit_events: append-only in the database. A trigger raises
  restrict_violation (23001) on UPDATE, DELETE and TRUNCATE.
- db/migrate.js: one transaction per file, applied files recorded in
  schema_migrations, session advisory lock taken before any DDL, idempotent on
  a second run, and a read-time guard that rejects a file owning its own
  transaction.

migrations/0002_least_privilege.sql closes the review findings:

- gamerbooker_app role with SELECT and INSERT on audit_events only;
  UPDATE, DELETE and TRUNCATE are revoked, so the application cannot rewrite
  audit history and cannot disable the trigger (it is not the owner).
- audit_events renamed to the documented names (actor_id, target_type,
  target_id) and extended with actor_role, reason, before_hash, after_hash,
  diff_redacted, approval_id; request_id is NOT NULL.
- venues (id, tenant_id) UNIQUE and a composite FK from venue_memberships, so a
  membership cannot present a venue of another tenant.
- Every statement is guarded, so the file is safe to re-run; that matters
  because the test harness applies migrations per suite in parallel workers.

Application:

- Product routes under /v1; /healthz and /readyz stay unversioned.
- src/common/global-exception.filter.ts: every throw becomes
  {error:{code,message,details?,request_id,retryable}} with request_id taken
  from the request context, so it matches X-Request-Id. A 5xx never forwards
  SQL text, a DSN, a stack or a secret, and its log line carries only an error
  category (class plus SQLSTATE when the driver supplied one).
- Opaque DB-backed sessions (D0, no JWT): 32 random bytes, stored only as
  SHA-256. Dashboard receives __Host-gb_session (HttpOnly, Secure,
  SameSite=Lax, Path=/, no Domain); mobile receives the token in the body and
  sends Authorization: Bearer.
- Idle expiry slides on each accepted request, bounded by
  absolute_expires_at, and the cookie Max-Age is refreshed to match. A failed
  touch is logged with the session id and SQLSTATE, never swallowed silently.
- A dashboard token presented as a bearer token is refused; the cookie is the
  only shape it was issued for. A mobile token works as a bearer.
- Login and /v1/me send Cache-Control: no-store.
- Argon2id m=19456 t=2 p=1. An unknown email still runs a real verification
  against a dummy hash so the failure path costs the same as a real one.
- AUTH_EMAIL_UNVERIFIED is returned only after the password has been proven
  correct.
- DELETE /v1/me requires the password, anonymizes the row, revokes every
  session and outstanding verification token and writes the audit row in one
  transaction. The address becomes deleted+<uuid>@deleted.invalid, so it is
  freed for a new registration.
- POST /v1/auth/logout-all revokes every session and audits the count.
- Fixed-window rate limiting on login (per identity and per address),
  register, verify and delete; 429 with Retry-After and a retryable envelope.
  The counter is in-process, which is correct for one instance and recorded as
  a limitation.
- src/app.setup.ts holds the HTTP wiring shared by main.ts and the tests.

## Review findings and disposition

| Finding | Severity | Disposition |
| --- | --- | --- |
| App role could disable the audit trigger and rewrite history | MAJOR | Fixed: separate gamerbooker_app role, owner DSN only for migrations, proven by 42501 in tests |
| migrate.js created schema_migrations before taking the lock | MAJOR | Fixed: lock first, then DDL |
| Dev re-issue fanned out tokens with no audit row | MAJOR | Fixed: one transaction supersedes live tokens and audits the re-issue |
| Idle expiry did not slide, so 12h idle was 12h from mint | MAJOR | Fixed: conditional extension bounded by the absolute expiry, cookie refreshed |
| venue_memberships.tenant_id was not tied to the venue tenant | MAJOR | Fixed: composite FK to venues (id, tenant_id) |
| audit_events.request_id was nullable | MAJOR | Fixed: NOT NULL; writeAudit throws outside a request context |
| Audit column names diverged from docs/05-venue-dashboard/04 | MINOR | Fixed: actor_id, target_type, target_id, plus the missing documented columns |
| users.password_hash is nullable | MINOR | Accepted risk: intentional for D6 invitations, where a staff member sets their own password. No live Slice A user has a null hash |
| No Cache-Control on token-bearing responses | MINOR | Fixed: no-store on login and /v1/me |
| 5xx log line had no category | MINOR | Fixed: non-secret category, class plus SQLSTATE |
| Unused isDev field | NIT | Fixed: removed |
| A migration file could own its transaction | NIT | Fixed: guard strips dollar-quoted bodies, comments and strings, and is unit-tested |

The reviewer also withdrew a mid-report finding about a 409 falling through to
VALIDATION_ERROR: no 409 is reachable in Slice A without an explicit code. It is
recorded as a Slice B trap, not a defect.

## Database checks the reviewer asked for

All read-only, against gamerbooker_dev on 127.0.0.1:5433.

| Check | Result |
| --- | --- |
| users_email_lower_active_uniq definition | UNIQUE on lower(email) WHERE deleted_at IS NULL |
| venue_memberships_user_venue_active_uniq definition | UNIQUE (user_id, venue_id) WHERE active |
| venue_memberships role check | role IN the five documented values |
| venue_memberships_venue_tenant_fk | FOREIGN KEY (venue_id, tenant_id) REFERENCES venues (id, tenant_id) |
| audit_events triggers | audit_events_no_update_delete and audit_events_no_truncate present |
| audit_events.request_id | is_nullable = NO |
| audit_events columns | id, occurred_at, actor_id, tenant_id, venue_id, action, target_type, target_id, metadata, request_id, created_at, updated_at, actor_role, reason, before_hash, after_hash, diff_redacted, approval_id |
| table owner | postgres; the application connects as gamerbooker_app |
| gamerbooker_app privileges on audit_events | SELECT true, INSERT true, UPDATE false, DELETE false, TRUNCATE false |
| schema_migrations | 0001_auth.sql and 0002_least_privilege.sql |
| rows with a null request_id | 0 |
| database collation | C, C. lower() is stable for the ASCII addresses in use; an IDN domain is stored punycode by the client |
| financial tables present | none; bookings, holds and ledger_entries do not exist yet |

## Verification

| Check | Command | Result |
| --- | --- | --- |
| Migration applies | node db/migrate.js with MIGRATION_DATABASE_URL as owner | apply 0002_least_privilege.sql, exit 0 |
| Migration is idempotent | node db/migrate.js, second run | skip both files, exit 0 |
| 0002 is re-runnable on its own | psql -f migrations/0002_least_privilege.sql | exit 0, notices only |
| App role cannot UPDATE audit_events | psql as gamerbooker_app | ERROR permission denied (42501) |
| App role cannot DELETE audit_events | psql as gamerbooker_app | ERROR permission denied (42501) |
| App role cannot disable the trigger | psql as gamerbooker_app | ERROR must be owner (42501) |
| App role can still SELECT and INSERT | psql as gamerbooker_app | count returned; insert accepted |
| Case-variant duplicate email | INSERT on a scratch database | SQLSTATE 23505 |
| Duplicate active membership | INSERT on a scratch database | SQLSTATE 23505 |
| Reactivate inactive into active | UPDATE on a scratch database | SQLSTATE 23505 |
| audit_events UPDATE / DELETE / TRUNCATE as owner | on a scratch database | SQLSTATE 23001 each; INSERT still allowed |
| Live HTTP smoke test, application on the app role | 41 checks against the running API | 41 passed, 0 failed |
| Audit rows after the smoke test | SELECT on gamerbooker_dev | 15 rows, 0 null request_id, 0 null actor_id |
| PII in audit metadata | regex over metadata | 0 rows matching @, +40, password or token |
| Secrets in the API log | regex scan of the log | 0 hits for password, token or address |
| Dev route absent outside development | NODE_ENV=production on port 3001 | GET /v1/dev/verification-token 404, GET /v1/me 401, GET /healthz 200 |
| Acceptance and hardening suites | npx jest | 6 suites, 94 passed, 4 todo, 0 failed |
| Typecheck | npm run typecheck | exit 0 |
| Lint | npm run lint | exit 0 |
| Build | npm run build | exit 0 |

Each suite creates its own database, applies every migration as the owner,
drives the application over a real socket with global fetch as gamerbooker_app,
and drops the database afterwards. Nothing on the auth path is mocked and no
test dependency was added.

## The suite was checked against regressions, not only against correct code

A green suite proves nothing unless it can go red. Five defects were introduced
on purpose, one at a time, and reverted afterwards.

| Injected defect | Expected | Observed |
| --- | --- | --- |
| Removed Secure from the session cookie | the cookie-attribute case fails | 1 failed, 28 passed |
| Distinct error message for an unknown email | the enumeration case fails | 1 failed, 28 passed |
| Dashboard token accepted as a bearer token | the channel-binding case fails | 1 failed, 15 skipped |
| Idle window no longer extended on a request | the sliding-idle case fails | 1 failed, 15 skipped |
| Dev re-issue no longer supersedes live tokens | the supersede case fails | 1 failed, 15 skipped |

After each revert the source was byte-identical to the committed file.

## Coverage of the acceptance cases

| Case | Covered by | Note |
| --- | --- | --- |
| ENG002-T01 | tests/eng002-t01-t02-t05-t06-t08-auth.spec.ts | register, verify, login, own identity, single-use token |
| ENG002-T02 | same suite | index-level 23505 as well as HTTP 409; D7 subaddress case |
| ENG002-T03 | not delivered | Slice B part 2: RBAC guards and venue scoping |
| ENG002-T04 | not delivered | Slice B part 2: TOTP enrolment, verification, lockout |
| ENG002-T05 | same suite | identical body for unknown email and wrong password |
| ENG002-T06 | same suite plus tests/eng002-t06-t07-lifecycle.spec.ts | cookie attributes, revocation in the database, no token reuse, bearer parity, malformed bearer, logout-all |
| ENG002-T07 | tests/eng002-t06-t07-lifecycle.spec.ts | password re-auth, anonymization, revocation, audit row, address freed |
| ENG002-T08 | same suite as T01 | mass assignment ignored, no hash or secret in /v1/me, no echo of a rejected password, audit row per mutation, append-only audit |

tests/eng002-slice-a-hardening.spec.ts holds the review regressions: least
privilege, request_id NOT NULL, sliding idle and its absolute cap, channel
binding, no-store, dev re-issue, and the migration runner guard.

## Decisions recorded during Slice A

| Decision | Effect |
| --- | --- |
| D1 amended | register returns the raw verification token only when NODE_ENV=development, and GET /v1/dev/verification-token re-issues one; DevAuthModule is not imported elsewhere |
| D7 added | a +tag subaddress is a separate identity; uniqueness stays case-insensitive on the literal address per D4; anti-abuse belongs to rate limiting, not to identity |

## Known gaps

| Gap | Consequence |
| --- | --- |
| ENG002-T03 and ENG002-T04 not delivered | no RBAC/venue scoping and no MFA; ENG-002 is not complete |
| D6 staff invitations not delivered | an owner cannot yet invite staff |
| D1, no mail provider | verification is dev-only; blocks staging and prod |
| D5, TOTP secret encryption with an env-var key | decided, not implemented, because MFA is Slice B part 2; blocks staging and prod |
| Rate limiter is in-process | behind more than one instance the effective limit multiplies by the instance count |
| users.password_hash nullable | accepted risk, intentional for D6 invitations |
| 0b27952 not re-reviewed | the fixes are verified by the primary agent, not yet by the reviewer |
| ENG-001 incomplete | no CI, IaC, secrets management, backup/restore drill, or staging and prod |
| No acceptance owner | OI-017, DEC-014 still PROPOSED |

## Environment

- No Docker on the build machine and no cloud account.
- PostgreSQL 17.6 portable binaries, cluster on 127.0.0.1:5433, trust auth,
  collation C, databases gamerbooker_dev and, per test run, a dedicated
  gamerbooker_test_<suite> database.
- Migrations run as the owner through MIGRATION_DATABASE_URL. The application
  runs as gamerbooker_app through DATABASE_URL and never holds the owner DSN.
