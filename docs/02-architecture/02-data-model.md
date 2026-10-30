# Model de date logic și DDL orientativ

## Convenții
`id UUID PK`, `tenant_id UUID`, `venue_id UUID`, `created_at timestamptz`, `updated_at timestamptz`. Valori monetare `bigint` bani; `currency='RON'`. Fiecare FK cross-entity verifică tenant/venue și vizibilitatea. Soft-delete doar pentru entities cu referințe istorice.

## Entități principale
| Tabel | Câmpuri esențiale | Constrângeri |
|---|---|---|
| tenants | legal_name, billing_profile, state | unique legal entity reference |
| venues | tenant_id, timezone, address, publication_state | tenant FK |
| users | email, phone, identity status | unique verified identity |
| venue_memberships | user_id, venue_id, role, active | uniqueness(role context) |
| rooms | venue_id, name, physical geometry metadata | stable room id |
| zones | room_id, name, policy_profile_id | stable zone id |
| resources | venue_id, room_id, zone_id, type, name, attributes jsonb, bookable, status | type ENUM PC/CONSOLE_SETUP/PRIVATE_ROOM |
| resource_components | parent_resource_id, child_resource_id | DAG no cycles / same venue |
| layouts | venue_id, draft_revision_id, published_revision_id | single current published |
| layout_revisions | venue_id, revision_no, scene jsonb, published_at, actor_id | immutable after publish |
| policy_profiles | venue_id, settings_json, version, effective_at | validated constraints |
| price_rules | venue_id, resource/zone target, recurrence, amount_minor | no ambiguous precedence |
| price_quotes | venue_id, customer_id, items_snapshot, policy_snapshot, total_minor, expires_at | immutable signed server-side |
| holds | venue_id, customer_id, expires_at, status, quote_id | EXPIRED/ACTIVE/CONSUMED |
| allocations | venue_id, booking_id/hold_id, resource_id, interval, active | DB exclusion constraint |
| bookings | customer_id, venue_id, status, start_at, end_at, total_minor, due_now_minor, policy_snapshot | unique public booking code |
| booking_participants | booking_id, user_id, share_minor, due_now_share_minor, state | sum shares = due amount |
| payment_intents | booking_id/order_id, provider_ref, method, expected_minor, status | provider unique + idempotency |
| ledger_entries | txn_group_id, direction, account, amount_minor, booking/order/refund reference | append-only, balanced entries |
| refunds | booking/order, provider_ref, approved_minor, status | <= refundable cap |
| offline_receipts | venue_id, booking_id, staff_id, amount_minor, method, reference | unique venue+reference |
| products | venue_id, category_id, title, price_minor, age_restricted, visible | published catalog |
| stock_movements | product_id, delta, reason, order_id | reconstructible stock |
| orders | venue_id, booking_id, state, fulfillment_method, payment status | session eligibility |
| order_lines | order_id, product_id, unit_price_snapshot, qty, target_resource | immutable cost snapshot |
| checkins | booking_id, staff_id, redeemed_at, qr_token_ref | one active check-in |
| audit_events | actor, tenant, action, target, diff, reason, trace_id | append-only |
| outbox_events | aggregate, type, payload, published_at, retries | transactional outbox |

## Constrângere anti-overlap
Alocarea exclusivă este bazată pe **resource atom**: la alegerea PRIVATE_ROOM extindem în tranzacție resursa în toate resursele componente pentru a evita overlap implicit. Pentru resurse fără copii, atom = self.

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE resource_claims (
  id uuid PRIMARY KEY,
  venue_id uuid NOT NULL,
  resource_id uuid NOT NULL,
  hold_id uuid,
  booking_id uuid,
  slot tstzrange NOT NULL,
  state text NOT NULL CHECK (state IN ('ACTIVE_HOLD','CONFIRMED','RELEASED')),
  CHECK (lower(slot) < upper(slot)),
  CHECK ((hold_id IS NOT NULL) <> (booking_id IS NOT NULL))
);
ALTER TABLE resource_claims ADD CONSTRAINT no_resource_overlap
EXCLUDE USING gist (resource_id WITH =, slot WITH &&)
WHERE (state IN ('ACTIVE_HOLD','CONFIRMED'));
```

**ATENȚIE:** un hold expirat încă în `ACTIVE_HOLD` trebuie marcat RELEASED tranzacțional **înainte** de a insera alt claim. Exclusion constraint ignoră timpul de expirare dacă starea rămâne activă. Worker + cleanup la început de tranzacție asigură eliberarea; tranzacțiile folosesc locking/serializable retry.

## Invariante contabile
- `sum(debits)=sum(credits)` pe grup de ledger; nu se permite entry monetar fără referință sursă.
- `due_now_minor <= total_minor`, `0 <= remaining_minor`, `refunded <= captured` (cu excepții ajustate explicit și aprobate).
- `sum(participant.due_now_share_minor) == booking.due_now_minor` în checkout split.
- Quote snapshot memorat pentru breakdown, taxes dacă se aplică, promoții, anulare, avans, timezone și resurse.

## Indexuri și performanță
- `claims(resource_id, slot)` GiST; `bookings(venue_id,start_at,status)`; `holds(expires_at,status)`; `orders(venue_id,state,created_at)`; `ledger_entries(booking_id,created_at)`.
- Primary keys nu înlocuiesc verificarea authorization per obiect.
- Scene layout geometry în JSONB; ID-urile de resurse rămân în relații normalizate.

## Migrații
Schema migration versionată; backfill cu verificarea integrității; deploy expand→migrate→contract. Datele financiare și claims nu se șterg prin cascade accidentale.
