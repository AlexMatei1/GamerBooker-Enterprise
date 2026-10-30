# ENG-001 Verification - E0 Foundation

Status: not accepted. Full ENG-001 acceptance is blocked (see Open items).
Sources: handoff/HANDOFF-ENG-001.md, git history on branch main.
Partially verified: primary-agent checks and the BR-011 proof are recorded
here at face value; no tester result table was supplied for ENG001-T01..T06.

## Scope

E0 Foundation: CI, IaC for staging + prod, secrets, observability
(handoff/HANDOFF-ENG-001.md, mandatory task header).

## Commits (branch main)

| Commit | Subject |
| --- | --- |
| 29e2550 | chore: bootstrap GamerBooker Enterprise v1.0 |
| 6b00a8d | docs: record HANDOFF-ENG-001 from thinker |
| 54fcb13 | feat(eng-001): scaffold NestJS app with health endpoints |
| d345c29 | fix(eng-001): close the two MAJOR review findings on 54fcb13 |
| 4adb38e | fix(eng-001): align error envelope with the documented contract |
| afffa85 | fix(eng-001): harden request-id fallback and fail fast on invalid PORT |

## Review verdicts

Verdicts below are copied from the reviewer; this record does not approve anything.

| Round | Target | Verdict | Findings |
| --- | --- | --- | --- |
| 1 | 54fcb13 | HOLD | 2 MAJOR: (a) X-Request-Id echo and trace_id propagation absent from src/; (b) /readyz bare 503 body with no error envelope and no request_id |
| 2 | fix on 54fcb13 | PASS | Both MAJORs closed, no new BLOCKER or MAJOR |

Residuals recorded by the reviewer as MINOR/NOTE:

- No global exception filter, so an unexpected exception emits Nest default body without request_id.
- Readiness is a TCP reachability check, not a query-level check.
- trace_id is not yet emitted as a structured log field.
- PORT was unvalidated (fixed in afffa85).

## Primary-agent verification

Recorded as primary-agent verification only; not reviewer verification.

| Check | Result |
| --- | --- |
| tsc --noEmit | exit 0 |
| eslint | exit 0 |
| nest build | exit 0 |
| GET /healthz | 200 {"status":"ok"} |
| GET /readyz (PostgreSQL 17.6 on 127.0.0.1:5433) | 200 {"status":"ok"} |
| GET /readyz (unreachable DB / missing DATABASE_URL / malformed DSN) | 503 READY_DB_UNAVAILABLE envelope, retryable true, request_id equals echoed X-Request-Id |
| X-Request-Id "probe-abc-123" | echoed verbatim |
| X-Request-Id absent, with spaces, or 200 chars | replaced with a UUID |
| PORT=abc | process exits 1 with an explicit message |
| 503 body content | no connection string or driver text |

## BR-011 proof

ENG-001-T01, run against PostgreSQL 17.6. Constraint:
EXCLUDE USING gist (resource_id WITH =, period WITH &&) WHERE (status = 'active').

| Case | Result |
| --- | --- |
| Overlapping active insert, same resource | rejected, SQLSTATE 23P01 |
| Adjacent [10:00,11:00) and [11:00,12:00) | both accepted (half-open interval) |
| Same window, different resource | accepted |
| Overlapping row with status = 'cancelled' | accepted |
| UPDATE cancelled -> active into an overlap | rejected, SQLSTATE 23P01 |

## Environment

- No Docker on the build machine.
- PostgreSQL 17.6 portable binaries were extracted outside the repo to a
  temp directory; a throwaway cluster was initialized on 127.0.0.1:5433
  with trust auth. Local development aid only, not committed to the repo.
- Prisma client cannot be generated while schema.prisma has zero models,
  so prisma/schema.prisma was not added. The readiness probe deliberately
  does not depend on an ORM client.

## Rejected changes

Rejected from an unreviewed implementer attempt:

| Change | Reason |
| --- | --- |
| duplicate src/observability/* module | dead code, never imported |
| package.json rewrite | added uninstalled ioredis and supertest; docker compose script on a machine without Docker; renamed the package; downgraded TypeScript |
| tsconfig.json and tsconfig.build.json churn | unrequested |

## Open items

Blocking full ENG-001 acceptance:

| Item | Note |
| --- | --- |
| OI-001 | PSP eligibility in Romania |
| OI-002 | merchant-of-record and payouts |
| OI-012 | GDPR roles and retention |
| OI-017 | feature flags and SLO targets |
| DEC-014 | still PROPOSED |
| Delivery | no CI workflow, IaC, secrets management, backup/restore drill, or staging/prod environments exist yet |
| Ownership | no acceptance owner is named |
