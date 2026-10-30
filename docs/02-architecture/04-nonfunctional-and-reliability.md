# Performanță, fiabilitate și observabilitate

## SLO de pornire [PROPOSED]
- Availability API: 99.9% lunar pentru GET/booking APIs, exclude întreruperile planificate comunicate.
- p95 search venues < 800ms / p95 resource availability < 500ms / p95 create hold < 1.5s nominal.
- Payment webhook receipt HTTP 2xx numai după verificare semnătură și persistare durabilă; procesare asincronă max 10s p95.
- 0 double-bookings confirmate. Priority > uptime: când DB locking nu e sigur, se oprește checkout.
- 0 diferențe nerezolvate între ledger și PSP la închiderea zilei.

## Capacity baseline [PROPOSED pentru test]
- 100 săli × 100 resurse × 20 sloturi/oră în căutare distribuită; peak 200 requests/s read, 20 attempts/s write checkout; benchmark înainte de lansare.
- Căutările de disponibilitate precompute slots orientative, dar checkout revalidează tranzacțional datele curente.
- CDN pentru imagini, paginare dashboard, lazy-loading layout rooms, query budgets și avoid N+1.

## Logs/metrics/traces
- Structured logs: `trace_id, tenant_id, venue_id, booking_id, hold_id, payment_id` cu date sensibile redactate.
- Metrics: `booking_hold_created`, `hold_expired`, `confirmed`, `payment_failed`, `refund_pending_age`, `stock_reserved`, `layout_publish_failed`, `qr_redeem_denied`.
- Distributed trace client→API→DB→webhook și outbox; corelație PSP în log fără numere card.
- Alerting pentru: payment mismatch, hold leak, orphan claim, duplicate reference, elevated 5xx, cross-tenant auth denials anormale, latență webhooks, backup failures.

## Resilience
- PSP retry exponential cu idempotency key, jitter, circuit breaker; reconciler periodic inspectă intențiile pending.
- Tranzacții serializable/deadlock retry limitat; outbox exactly-once *effect* via dedupe, nu exact-once network transport.
- Crash în timpul checkout: hold poate expira, PSP webhook târziu rambursează automat sau intră în manual review; niciodată nu confirmă inventar deja realocat.
- Files/media upload cu malware/extension/content scan, quotas și expirare URL signed.
- Backups cu PITR, restore test lunar, access review trimestrial.

## Edge cases time
- `start_at`, `end_at` UTC; interval `[start,end)`; agenda afișată în timezone-ul locației.
- Ora lipsă la DST spring-forward nu poate fi selectată; ora repetată la fall-back necesită offset explicit în quote; teste cu Europe/Bucharest.
- Publicarea unei noi ore locale nu poate schimba timestamps ale rezervărilor confirmate.
