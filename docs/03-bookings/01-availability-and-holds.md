# Availability Engine — algoritmi, concurență și hold-uri

## Input & output
- Input: venue_id, client-selected date/time, resource_ids / resource_type, people_count, preferred neighboring seating, optional game/hardware filters.
- Output `availability`: sloturi publicabile și preț orientativ; output `quote`: offer semnat cu resurse/interval, price + policy snapshot, `expires_at`; output `hold`: lock cu id și `expires_at`.
- Doar `hold` revalidat de DB este rezervare temporară efectivă. Lista de disponibilitate poate deveni stale între citire și checkout.

## Interval
`[start_at,end_at)` ca `tstzrange(...,'[)')`; pentru două bookings consecutive, `[18:00,19:00)` și `[19:00,20:00)` nu se suprapun. Minimum/maximum și granularity din effective policy.

## Resurse atomice și compozite
- PC-A1 → atomic {PC-A1}.
- CONSOLE-S1 → atomic {CONSOLE-S1}; oamenii din setup nu sunt resurse vândute separat.
- PRIVATE-ROOM-R1 cu PC-A1..A5 → atomic {R1, A1, A2, A3, A4, A5}. La rezervare PC-A2 se blochează coliziunea cu orice booking R1 prin claim pe A2. Topology DAG consistent, fără cycle sau cross venue, iar conținutul unei camere private se versionază.
- Schimbarea componentelor unei camere cu bookings viitoare necesită validare de impact și eventual migrare manuală aprobata.

## Transaction pseudocode
```text
BEGIN TRANSACTION (serializable or lock-retry)
  authenticate client, venue published and policy effective
  validate server-signed quote still valid and requested IDs match
  clean expired conflicting holds + release their active claims
  expand resources into stable atomic resource list (sorted IDs)
  SELECT ... FOR UPDATE on resource lock rows in sorted order
  validate operating schedule, maintenance, capacity, conflict
  INSERT hold(status=ACTIVE, expires_at=server_now+TTL)
  INSERT claims per atomic resource (ACTIVE_HOLD) -- exclusion constraint
  INSERT checkout draft, allocated shares
  INSERT outbox HoldCreated
COMMIT
```
- Nu se bazează exclusiv pe Redis locks.
- În caz de exclusion conflict -> HTTP 409 `RESOURCE_UNAVAILABLE`, re-query.
- Payment intent se creează după commit hold cu idempotency key; dacă PSP request eșuează, hold rămâne doar până la TTL.

## Expiry
- `TTL=15 minute` [PROPOSED] pentru split/group checkout, configurat doar prin parametrii platformei; durata unei sesiuni **nu** este influențată.
- Worker expira hold-urile după TTL; create-hold elimină defensiv claims expirate într-o tranzacție pentru a preveni ghost holds.
- Dacă payment webhook sosește după expirare, nu se reactivează locurile. Se creează refund/PSP reversal și alert dacă nu se poate finaliza automat.

## Smart seat selection (fără matchmaking)
- Algoritm opțional de recomandare a resurselor: căutare subgraf de locuri adiacente din layout publicat (graf definit prin vecinătate fizică), filtrare specs/preț/interval; determinist și explicabil.
- Algoritmul returnează **opțiuni**; clientul alege și confirmă. Când nicio grupare nu există, oferă altă oră, altă zonă sau altă sală.
- Nu face matching între persoane și nu solicită rank/joc account.

## Invariante verificabile
- În DB nu poate exista mai mult de un `ACTIVE_HOLD|CONFIRMED` claim per atom în intervalul suprapus.
- Confirmarea convertește în aceeași tranzacție claims către `CONFIRMED` și hold→CONSUMED; fără moment „fără lock”.
- `release` este idempotent; repetarea nu poate decremente solduri, nu poate afecta alte bookings.
- Claim-urile incluse în room booking provin din snapshot topology la booking, nu din geometria curentă.

## Teste concurență P0
1. 100 clienți încearcă ultimul PC pentru același interval: exact un hold activ.
2. Un client rezervă camera integral; altul un copil simultan: exact unul reușește.
3. Deținător hold expiră între autorizare PSP și webhook: booking nu se confirmă după expirare, refund orchestrat.
4. Două servere rulează cleanup simultan: o singură eliberare efectivă.
5. Quote expirat și preț modificat: se cere un quote nou, nu se folosește client-side price.
