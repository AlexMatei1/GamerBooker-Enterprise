# ENG-002 Verification - Slice A (auth core)

Status: Slice A delivered, ENG-002 not complete and not accepted.
Sources: handoff/HANDOFF-ENG-002.md, git history on branch main, migrations/0001_auth.sql, tests/eng002-t01-t02-t05-t06-t08-auth.spec.ts.
Reviewer verdict on 3f126b4: requested, not received at the time of writing.
Everything below is primary-agent verification, not an independent audit.

## Scope

Slice A is register, verify email, login, logout and GET /v1/me, plus the
database and HTTP substrate they sit on. Slice B is MFA/TOTP, RBAC guards,
staff invitations, rate limiting, logout-all and DELETE /v1/me.

## Commits (branch main)

| Commit | Subject |
| --- | --- |
| 3f126b4 | feat(eng-002): auth core - opaque sessions, Argon2id, /v1 prefix, error filter |
| c250fba | test(eng-002): acceptance suite for T01/T02/T05/T06/T08 on real HTTP and real PG |
| d3138f3 | fix(eng-002): decide +tag subaddresses are distinct identities (D7) |

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
  schema_migrations, session advisory lock, idempotent on a second run.

Application:

- Product routes under /v1; /healthz and /readyz stay unversioned.
- src/common/global-exception.filter.ts: every throw becomes
  {error:{code,message,details?,request_id,retryable}} with request_id taken
  from the request context, so it matches X-Request-Id. A 5xx never forwards
  SQL text, a DSN, a stack or a secret.
- Opaque DB-backed sessions (D0, no JWT): 32 random bytes, stored only as
  SHA-256. Dashboard receives __Host-gb_session (HttpOnly, Secure,
  SameSite=Lax, Path=/, no Domain); mobile receives the token in the body and
  sends Authorization: Bearer. Both resolve the same sessions row.
- Argon2id m=19456 t=2 p=1. An unknown email still runs a real verification
  against a dummy hash so the failure path costs the same as a real one.
- AUTH_EMAIL_UNVERIFIED is returned only after the password has been proven
  correct.
- src/app.setup.ts holds the HTTP wiring shared by main.ts and the tests.

## Verification

| Check | Command | Result |
| --- | --- | --- |
| Migration applies | node db/migrate.js against PostgreSQL 17.6 on 127.0.0.1:5433 | apply 0001_auth.sql, exit 0 |
| Migration is idempotent | node db/migrate.js, second run | skip 0001_auth.sql (already applied), exit 0 |
| Case-variant duplicate email | INSERT on a scratch database | SQLSTATE 23505 |
| Duplicate active membership | INSERT on a scratch database | SQLSTATE 23505 |
| Reactivate inactive into active | UPDATE on a scratch database | SQLSTATE 23505 |
| audit_events UPDATE / DELETE / TRUNCATE | on a scratch database | SQLSTATE 23001 each; INSERT still allowed |
| Live HTTP smoke test | 41 checks against the running API | 41 passed, 0 failed |
| Audit rows | SELECT on gamerbooker_dev | 7 rows, every one with a request_id, no email, phone or token in metadata |
| Secrets in the API log | regex scan of the log | 0 hits for password, token or address |
| Dev route absent outside development | NODE_ENV=production on port 3001 | GET /v1/dev/verification-token 404, GET /v1/me 401, GET /healthz 200 |
| Acceptance suite | npx jest | 4 suites, 64 passed, 4 todo, 0 failed |
| Typecheck | npm run typecheck | exit 0 |
| Lint | npm run lint | exit 0 |
| Build | npm run build | exit 0 |

The acceptance suite creates its own gamerbooker_test database, applies every
migration, drives the application over a real socket with global fetch, and
drops the database afterwards. Nothing on the auth path is mocked and no test
dependency was added.

## The suite was checked against regressions, not only against correct code

A green suite proves nothing unless it can go red. Two defects were introduced
on purpose, one at a time, and reverted afterwards; git diff was clean after
each revert.

| Injected defect | Expected | Observed |
| --- | --- | --- |
| Removed Secure from the session cookie | the cookie-attribute case fails | 1 failed, 28 passed |
| Distinct error message for an unknown email | the enumeration case fails | 1 failed, 28 passed |

## Coverage of the acceptance cases

| Case | Covered by | Note |
| --- | --- | --- |
| ENG002-T01 | 4 cases | register, verify, login, own identity, single-use token |
| ENG002-T02 | 5 cases | index-level 23505 as well as HTTP 409; D7 subaddress case |
| ENG002-T03 | not delivered | Slice B: RBAC guards and venue scoping |
| ENG002-T04 | not delivered | Slice B: TOTP enrolment, verification, lockout |
| ENG002-T05 | 3 cases | identical body for unknown email and wrong password |
| ENG002-T06 | 7 cases | cookie attributes, revocation in the database, no token reuse, bearer parity, malformed bearer |
| ENG002-T07 | not delivered | Slice B: DELETE /v1/me with anonymization |
| ENG002-T08 | 6 cases | mass assignment ignored, no hash or secret in /v1/me, no echo of a rejected password, audit row per mutation, append-only audit |

## Decisions recorded during Slice A

| Decision | Effect |
| --- | --- |
| D1 amended | register returns the raw verification token only when NODE_ENV=development, and GET /v1/dev/verification-token re-issues one; DevAuthModule is not imported elsewhere |
| D7 added | a +tag subaddress is a separate identity; uniqueness stays case-insensitive on the literal address per D4; anti-abuse belongs to rate limiting, not to identity |

## Known gaps

| Gap | Consequence |
| --- | --- |
| D1, no mail provider | verification is dev-only; blocks staging and prod |
| D5, TOTP secret encryption with an env-var key | decided, not implemented, because MFA is Slice B; blocks staging and prod |
| Slice B not delivered | T03, T04, T07, staff invitations, rate limiting, logout-all |
| No independent audit yet | the reviewer verdict on 3f126b4 is requested, not received |
| ENG-001 incomplete | no CI, IaC, secrets management, backup/restore drill, or staging and prod |
| No acceptance owner | OI-017, DEC-014 still PROPOSED |

## Environment

- No Docker on the build machine and no cloud account.
- PostgreSQL 17.6 portable binaries, cluster on 127.0.0.1:5433, trust auth,
  databases gamerbooker_dev and, per test run, gamerbooker_test.
- The migration runner and the tests both read DATABASE_URL; the tests override
  it to point at their own database.
