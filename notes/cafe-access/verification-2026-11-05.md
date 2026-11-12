# Observed implementation verification

Historical initial implementation evidence. Independent review subsequently rejected the initial packet for the publication/profile and booking-transition bypasses. The correction1 evidence in `correction-1-verification-2026-11-05.md` supersedes readiness claims here; acceptance still requires fresh independent verification/review.

2026-11-05, local workspace only. One writer; no production DB writes, privileged live account grants, deployment, mail transmission or browser/CUA activity.

## Final commands and results

| Command | Observed outcome |
| --- | --- |
| `npm run typecheck` | exit0 after final backend source changes |
| `npm run build` | exit0, Nest backend build |
| `npm --prefix apps/venue-dashboard run build` | exit0, TypeScript + Vite6.4.5,1592 modules; final assets index-BF4Zox6S.js and App-DhxbjcaP.js |
| `npm test -- --runInBand tests/cafe-access.spec.ts tests/eng002-t01-t02-t05-t06-t08-auth.spec.ts tests/eng002-t04-mfa.spec.ts tests/eng002-t03-rbac.spec.ts tests/eng003-multi-tenant-venues.spec.ts` | exit0;5 suites,85 tests passed;30.721s |
| `.\node_modules\.bin\eslint.cmd src/platform-access src/auth/session.guard.ts src/auth/platform-admin.guard.ts src/auth/csrf.ts src/auth/membership.service.ts src/auth/audit.ts tests/cafe-access.spec.ts tests/support/auth-harness.ts` | exit0, targeted lint for the new authorization surface/tests |
| `git diff --check` | exit0; only line-ending notices for existing dirty files, no whitespace errors |

Initial dashboard Vite build was blocked by sandbox `spawn EPERM`; a narrow approved escalation for the dashboard build succeeded. No access-confidence/browser block was bypassed. Initial targeted lint found the control-character validation regex; replaced with explicit character-code validation, then lint passed. Initial café suite passed8/9; one assertion queried an unregistered customer-list URL and expected403 instead of404. Changed it to the real customer extension route; all subsequent targeted and consolidated runs passed.

## Database/migration evidence

The existing `tests/support/auth-harness` connects to the local PostgreSQL test listener at127.0.0.1:5433, applies **all33 SQL migrations** to a fresh database, and runs the API using `gamerbooker_app`, while the fixture connection uses owner credentials. The harness now validates supplied suffixes and adds a random12-hex suffix on every invocation. It drops only the unique named database owned by that invocation, never a fixed prior test DB or the workspace application DB. It does not run the migration runner against a live database. Migration0033 syntax/schema/permissions were exercised through actual database operations, not a SQL mock.

Observed café test databases from completed runs:

- `gamerbooker_test_cafe_access_c2177a9fae854c79_d41dca398e6f`
- `gamerbooker_test_cafe_access_3da3658c5faf4baa_5c31bf1514e1`
- `gamerbooker_test_cafe_access_9b7dc4488e184dcd_d13f5ffeb0a3` (final consolidated run)

All corresponding `app.stop()` teardowns completed without error. A separate read-only `pg_database` lookup after teardown checked these exact three names: remaining0, exit0. No general database cleanup command was issued.

## Tested contracts

- Password registration/verification/login and opaque real cookie sessions; real TOTP enrollment, factor confirmation, session rotation, replay/lockout and dynamic MFA gate regression suites.
- Dedicated local operator grant denied to runtime role, successful only with fixture owner credentials against a verified account; all prior sessions revoked; admin grants independent of venue role strings; later revoke fails closed.
- Anonymous/raw header/preview token denial; missing dashboard-login/custom-header denial, hostile Origin denial, closed CORS; no anonymous admin bootstrap/global realtime publishing/stream reading.
- Admin dashboard-cookie-only operation; dashboard token as bearer denied; mobile session with test-fixture MFA proof still denied as admin.
- Applicant identity fixed to authenticated verified account, unknown owner/role fields rejected; own-status scope; pending/rejected membership absence; immutable decisions and concurrent approved replay yielding one tenant/venue/OWNER.
- Two café contexts and direct foreign venue/resource/booking ID substitutions; scoped fiscal status; closed cross-tenant runbook/certification/observability paths; admin restricted to access/setup.
- Membership/invitation platform-role injection denied; intended-email invitation binding, replay denial; legacy venue PLATFORM_ADMIN row ignored as platform authority; existing ordinary reception membership works.
- Privileged active session without per-session TOTP proof denied even with enrolled factor; suspended, unverified, deleted and expired identities fail closed; admin setup rejects role changes; owner suspension/reinstatement revokes sessions and controls direct venue access; corresponding audit events exist.

The ENG003 fixture now completes real TOTP instead of assuming an enrolled factor proves the existing password-only session. Existing auth/MFA suites explicitly enable the test client's browser header contract. The café negative suite does not enable that helper option and omits/spoofs headers explicitly.

## Limits of evidence

No claim of live operator creation, application-service availability outside ephemeral tests, email-provider readiness, deployed HTTPS, production migration execution, complete legacy-API security coverage, or browser/visual UAT. The authenticated portal built successfully; its manual HTTPS/cookie/MFA/admin/two-café UAT is documented in the handoff. Full repository lint/tests, mobile/Flutter, payments/release signing and deployment were not part of this bounded run. Separate read-only verification and independent review must inspect the final diff and these claims before Astra acceptance.
