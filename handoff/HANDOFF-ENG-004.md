# HANDOFF-ENG-004 — Migrations, fixtures, and time-range exclusions

Current assessment: focused ENG-004 verification passed; broader acceptance remains open. See the [verification record](../notes/eng-004-verification-2026-11-04.md) and [handoff status index](HANDOFF-INDEX-2026-11-04.md).

## Purpose and scope

The engineering backlog assigns ENG-004 the migration runner, fixture seeds, and SQL time-range exclusion needed by the booking foundation. The data hierarchy is provided by ENG-003; ENG-104 builds hold lifecycle and private-room closure on top. This handoff records existing work and is not a new implementation claim.

## Existing artifacts and invariants

- [`db/migrate.js`](../db/migrate.js) applies SQL files in filename order under a PostgreSQL advisory lock. It records applied filenames, wraps each file in a transaction, rejects embedded transaction control, and rolls back a failed file.
- [`migrations/0005_exclusion_constraints.sql`](../migrations/0005_exclusion_constraints.sql) creates `resource_claims` and a GiST exclusion constraint on resource and overlapping `tstzrange` for `ACTIVE_HOLD` and `CONFIRMED` rows. Later migrations extend the claim lifecycle; inspect them before changing the constraint.
- [`migrations/0006_fixture_seeds.sql`](../migrations/0006_fixture_seeds.sql) supplies deterministic demo tenant, venue, rooms, zones, and resources using `ON CONFLICT (id) DO NOTHING`. It is also read by [`scripts/seed.ts`](../scripts/seed.ts). These are development fixtures, not production data.
- [`scripts/ci.ps1`](../scripts/ci.ps1) describes a local Windows verification sequence. It runs `docker compose down -v`, which removes Compose volumes; use only against an explicitly disposable environment.
- The application must use its least-privilege database role; the migration runner uses the migration owner connection. See [`migrations/0002_least_privilege.sql`](../migrations/0002_least_privilege.sql) and runner comments.

## Acceptance and evidence

On 2026-11-04, a disposable PostgreSQL 15.19 database applied all 32 migrations, skipped all 32 on replay, and accepted two fixture seed runs. The focused [`tests/eng004-exclusion-constraints.spec.ts`](../tests/eng004-exclusion-constraints.spec.ts) run passed its three cases: separate ranges, rejection of an overlapping active hold, and allowance of an overlapping cancelled claim. A separate transactional probe observed SQLSTATE `23P01` for `resource_claims_no_overlap` and rolled back. Details and cleanup evidence are in the [verification record](../notes/eng-004-verification-2026-11-04.md).

The focused run does not establish concurrency stress, adjacent ranges, private-room closure, migration rollback on failure, least-privilege behavior, or integration with the actual application. Design and production acceptance remain open. The earlier 2026-11-04 documentation inventory ran no tests; the older ENG-004 entry in [`CHANGELOG.md`](../CHANGELOG.md) reports historical results and is not the result of this focused run.

## Ownership and dependencies

Engineering owns migration and constraint changes; an acceptance owner remains to be named. ENG-001 foundation and ENG-003 tenant/resource schema provide prerequisites. ENG-104 owns hold orchestration and component closure; this database constraint alone is not a complete booking workflow.
