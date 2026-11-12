# ENG-004 focused verification — 2026-11-04

**Result:** focused ENG-004 verification passed; broader acceptance remains open. The coordinator ran the checks and reported the results below to the documentation worker. The earlier documentation-only inventory on this date did not run tests.

## Isolated environment

- Disposable container `gamerbooker-eng004-verify-20261104`, ID `b305c9a6a02a4d6fbad79a64030cb8131a3ce4ecbb52ce7ba87222aaf49c9256`, label `codex.task=eng004-verification-20261104`.
- Image `postgres:15-alpine`, PostgreSQL `15.19`, database `gb_eng004_verify`, published at `127.0.0.1:53464`. The coordinator inspected the container identity before database changes: mounts `[]`, tmpfs at `/var/lib/postgresql/data`, and the stated label, image, and port.
- `DATABASE_URL` and `MIGRATION_DATABASE_URL` were bound to the disposable database for the checks. An initial sandbox migration connection attempt failed with `EACCES 127.0.0.1:53464` (exit 1); the elevated rerun succeeded.
- The existing project container `gamerbooker_postgres`, ID prefix `2697d177e795`, was left untouched and remained up and healthy.

## Commands and observed results

| Check | Result reported by coordinator |
|---|---|
| `node db/migrate.js` | Exit 0; applied 32 migrations, `0001` through `0032`. |
| `node db/migrate.js` again | Exit 0; skipped 32 migrations already recorded. |
| `npx ts-node scripts/seed.ts` twice | Both runs exited 0 with success. Successful replay alone does not prove that every fixture value was unchanged. |
| `npm test -- --runInBand --runTestsByPath tests/eng004-exclusion-constraints.spec.ts` | Final exit 0; one suite and three tests passed: non-overlap allowed, overlapping `ACTIVE_HOLD` rejected, overlapping `CANCELLED` allowed. |
| Transactional SQL probe (`BEGIN`, fixture cleanup and insertion, `DO`, `ROLLBACK`) | Exit 0; notice `VERIFIED SQLSTATE 23P01; constraint=resource_claims_no_overlap`; rollback succeeded. The delegated report did not include the complete SQL text. |

The coordinator rechecked the exact container ID and label, then `docker stop` returned that ID. A follow-up `docker ps -a` filter showed no temporary container. No application source was changed and the full test suite was not run.

## Limits and next action

These checks do not establish concurrency stress behavior, adjacent ranges, private-room closure, migration rollback on failure, least-privilege behavior, or integration with the actual application. Design and production acceptance remain open. Review the remaining cases against the handoff before accepting ENG-004; do not infer project-wide readiness from this focused run.

The documentation worker was requested as `gpt-6.1-terra` and the client reports `gpt-6.1-terra`; this is not independent model authentication. Independent verification and review of the evidence and documentation are pending at the time of writing.
