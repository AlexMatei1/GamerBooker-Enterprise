# Correction round1: publication and booking transition scope

2026-11-05. Same authorized sole writer; requested model gpt-6.1-sol, client identity unverified. This is the first bounded correction round following independent review rejection, not a new feature packet or a broad security audit. Frozen dashboard, pass-preview, migrations, mobile/Flutter, real accounts/DB data, deployment and browser access were untouched.

## Changes

1. `src/venues/venues.controller.ts` no longer advertises publication state in profile edits. `VenuesService.updateVenue` explicitly rejects an own `publication_state` property before DB lookup/mutation, regardless of value. The profile UPDATE cannot write that column. Dedicated gated/audited publish/unpublish remain unchanged.
2. `BookingsController.transitionVenueBooking` passes the path venue in a required discriminated service scope. The only related calls found were that staff route and authenticated customer cancel. `BookingsService.transitionBooking` filters its locked lookup by staff venue or authenticated customer before version/state validation and all effects. The later booking UPDATE also predicates venue. Foreign and missing bookings return the same404 body category/message; version guessing cannot reveal the foreign row.
3. The café real-HTTP suite adds owner and actual MFA-completed manager profile denials for PUBLISHED, DRAFT, PENDING_APPROVAL, ARCHIVED and null, checks no profile mutation, DRAFT/public-list exclusion, legitimate profile editing and incomplete dedicated publish denial. A separate two-café transition test tries correct/incorrect versions, compares full booking, associated resource-claim, audit and outbox snapshots unchanged, and proves valid same-venue cancellation plus own-customer cancellation.
4. The multitenant suite's old generic-publish success expectation now asserts explicit rejection/private DRAFT behavior. Existing booking/publication-gate fixture helpers now complete real TOTP and explicitly opt in to the browser CSRF contract instead of assuming enrollment alone proves a session. No unrelated invitation expectations or implementation were changed.

## Observed checks

| Command | Outcome |
| --- | --- |
| `npm test -- --runInBand tests/cafe-access.spec.ts tests/eng105-booking-confirmation.spec.ts tests/eng003-multi-tenant-venues.spec.ts tests/eng002-t01-t02-t05-t06-t08-auth.spec.ts` | exit0;4 suites,69 tests passed;47.613s. Café suite now11 tests. Existing booking transition/concurrency/customer cancellation regression suite passed. |
| `npm test -- --runInBand tests/eng201-venue-setup-and-staff.spec.ts --testNamePattern 'Venue Setup Wizard & Publication Gates'` | exit0;1 suite,5 passed,8 unrelated invitation tests deliberately skipped by pattern;18.1s. Includes successful dedicated publication with audit/outbox and unpublication, plus incomplete-gate denial. |
| `npm run typecheck` | exit0 |
| `npm run build` | exit0, backend only |
| `.\node_modules\.bin\eslint.cmd src/bookings/bookings.controller.ts src/venues/venues.controller.ts src/venues/venues.service.ts tests/cafe-access.spec.ts tests/eng003-multi-tenant-venues.spec.ts` | exit0, narrow lint; no new lint exceptions |
| `git diff --check -- src/bookings/bookings.controller.ts src/bookings/bookings.service.ts src/venues/venues.controller.ts src/venues/venues.service.ts tests/cafe-access.spec.ts tests/eng003-multi-tenant-venues.spec.ts tests/eng105-booking-confirmation.spec.ts tests/eng201-venue-setup-and-staff.spec.ts` | exit0, only existing line-ending notices |

Total executed in this round: **74 passed across5 suites**,8 unrelated tests filtered out. No dashboard source change or dashboard rebuild was needed.

## Disposable database evidence

All tests used the existing random-per-invocation harness, fresh `gamerbooker_test_*_<random12>` DBs, all33 existing migrations, owner fixture connection and runtime `gamerbooker_app`. No working DB migration/bootstrap/grant was executed.

Logged café DB: `gamerbooker_test_cafe_access_9b779de8683a47bf_3c8c3bfd6698`. All suite `app.stop()` teardown calls completed without error. A separate read-only `pg_database` lookup after teardown confirmed that exact café DB absent (`cafeRemaining:0`) and no random-suffix eng105/eng201/eng003/slicea databases remaining (`relatedRandomTestDatabasesRemaining:0`), exit0. No cleanup was issued against any existing unrelated database.

## Status and limits

Both reviewer findings are corrected and covered by real HTTP/PostgreSQL tests. This supersedes the initial packet's readiness claims; the initial review rejection is retained in the handoff history. Separate fresh read-only verifier/reviewer and Astra acceptance remain pending. No new live accounts, HTTPS/browser UAT, production migration, mail delivery or deployment occurred. No new migration was required. Writer lease closed after saving this evidence/checkpoint.
