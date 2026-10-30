# Deployment, on-call, support și runbooks

## Environments
- `local`: seed synthetic venues, fake PSP, docker/dev.
- `test/CI`: ephemeral DB + deterministic fixtures, contract/safety tests.
- `staging`: full flows cu PSP sandbox, separate credentials and no real PII.
- `production`: multi-AZ DB, managed secrets, monitoring, database PITR, restricted deploy approvals.

## Release process
1. PR code review, static analysis/dependency scan, unit/integration/security tests.
2. Schema migration expands safely; deploy backend compatible with old/new mobile versions.
3. Deploy dashboard; feature flags by tenant/venue; smoke tests quote/hold/payment in sandbox.
4. Release mobile to testflight/internal testing → stores; observe crash/error and commerce.
5. Gradual enable venue by venue, with rollback plan; never rollback irreversible DB ledger mutations.

## Runbook R1 — Double-booking allegation
- Freeze further bookings for affected resources if needed; query claims/history and layout topology snapshot.
- Verify whether overlap was actual confirmed allocation or physical occupancy mismatch.
- Prioritize customer remediation/relocation or refund; preserve audit.
- P0 incident; investigate transactional locking, hold cleanup, stale cache.

## Runbook R2 — PSP payment captured, no booking
- Locate payment by provider ref; verify signature/status, hold state and claims.
- If hold expired/unavailable → create idempotent refund + inform client, do not force booking.
- If hold active and all due paid → retry state reconcile transactionally.
- Record root cause; reconcile PSP statements.

## Runbook R3 — Receivable mismatch
- Compare `booking.total`, due-now, ledger, offline receipts and PSP settlement.
- Suspend manual adjustment privileges if abuse suspected; finance lead approves compensating ledger entry.
- Never UPDATE/DELETE previous financial entries silently.

## Runbook R4 — Venue cannot publish layout
- Validate missing price/policy, duplicate resource references, orphan nodes, booked resources being removed, private room composition cycles.
- Restore draft safely; provide owner actionable errors; don’t bypass booked-resource protection.

## Runbook R5 — Staff check-in offline
- Display connectivity problem; booking cannot become confirmed/paid without server.
- Enable human assistance only for existing confirmed booking after connectivity restoration; never create off-system booking under app-only rule.

## Runbook R6 — Product out of stock
- Pause SKU, notify affected orders; offer explicit substitution or refund; audit stock movements.

## Incident management
Severity S1: confirmed double-booking, financial duplication, cross-tenant data breach, outage preventing check-in/checkout; S2: persistent payment webhooks/refunds delayed, significant order fulfillment errors; S3: localized UI issue.
On-call with paging, owner, customer/venue communications, postmortem within agreed SLA. Exact timings to be agreed in operational contract.

## Backups / DR
Encrypted database backups, PITR, regular restore drills, documentation of RPO/RTO, separated environment permissions. Data export and retention rules aligned with privacy and fiscal requirements.
