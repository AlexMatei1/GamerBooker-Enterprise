# HANDOFF - ENG-103 Price quote with minor-unit exact arithmetic and expiry

Historical status: proposed, ready for implementation. See the [2026-11-04 status inventory](HANDOFF-INDEX-2026-11-04.md) for the later assessment.
Author: thinker (contract), recorded by the primary agent (scribe).
Task source: docs/11-delivery/04-engineering-handoff-backlog.md:16 (ENG-103), critical path line 54.
Roadmap: Milestone M1 Resource & availability core (docs/11-delivery/01-implementation-roadmap.md:10-14).

Preconditions:
- E0 Foundation delivered (`ENG-001` through `ENG-005`).
- Venue & resource hierarchy delivered (`ENG-003`).
- Operating schedules & availability engine delivered (`ENG-101`).
- Policy hierarchy, validator, and immutable snapshots delivered (`ENG-102`).

---

## Task Definition
`ENG-103 | Price quote with minor-unit exact arithmetic and expiry | Venue ID, resource IDs, start_at, end_at, authenticated customer session | Server-evaluated exact integer arithmetic (no floating point), minor units (bani / RON), immutable policy snapshot, 15m quote expiry TTL, HMAC cryptographic server signature, precedence (resource > zone > venue) | POST /v1/quotes, GET /v1/quotes/:id, GET/PUT /v1/dashboard/venues/:id/pricing | price_rules, price_quotes | Quote Summary & Dashboard Pricing | QUOTE_INVALID_INTERVAL, QUOTE_EXPIRED, QUOTE_SIGNATURE_INVALID, RESOURCE_NOT_FOUND | Customer: POST /v1/quotes; Venue Staff: pricing configuration | Exact minor-unit calculation, deposit/balance equality (due_now + balance = total), quote expiry enforcement, tamper-evident cryptographic signature | quote_created, quote_expired, pricing_rule_updated | Pricing & Checkout Core`

---

## 1. Domain Invariants & Rules

### 1.1 Minor-Unit Exact Arithmetic (BR-006, BR-008, BR-010)
- All monetary values are strictly stored and computed as integer bani (`bigint`, 1 RON = 100 bani).
- For a booking of duration `D` minutes and effective hourly rate `R` (in bani):
  `item_amount_minor = Math.round((R * D) / 60)`.
- `total_minor = sum(items.amount_minor)`.
- Deposit calculation:
  - If `policy.prepaid_mode === 'FULL'`:
    `due_now_minor = total_minor`
    `balance_minor = 0`
  - If `policy.prepaid_mode === 'DEPOSIT'`:
    `due_now_minor = Math.ceil((total_minor * policy.deposit_percentage) / 100)`
    `balance_minor = total_minor - due_now_minor`
- Strict Accounting Invariant:
  `due_now_minor + balance_minor === total_minor` (exact to the last ban, no drift).

### 1.2 Pricing Rule Precedence
Resolution order per resource:
`Resource Price Rule > Zone Price Rule > Venue Default Price Rule > Platform Default (2000 bani / 20.00 RON/h)`
- Unambiguous precedence: most specific rule wins.
- Clean rate retrieval without duplicate ambiguities.

### 1.3 Quote Lifecycle & Cryptographic Signature
- Quotes are assigned a UUID `quote_id` and an immutable `expires_at` timestamp (`server_now + 15m`).
- A quote contains:
  - `quote_id`
  - `venue_id`, `customer_id`
  - `starts_at`, `ends_at`
  - `items_snapshot`: `[ { resource_id, resource_name, amount_minor, hourly_rate_minor } ]`
  - `policy_snapshot`: frozen immutable snapshot from `ENG-102`
  - `total_minor`, `due_now_minor`, `balance_minor`, `currency = 'RON'`
  - `signature`: `HMAC-SHA256(quote_id + ':' + total_minor + ':' + due_now_minor + ':' + expires_at, QUOTE_SECRET)`
- Anti-Tampering: the server verifies this signature before hold creation or checkout; any client-modified amounts are rejected.

---

## 2. Database Schema (`migrations/0010_pricing_and_quotes.sql`)

### 2.1 `price_rules`
- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE`
- `target_type text NOT NULL CHECK (target_type IN ('VENUE_DEFAULT', 'ZONE', 'RESOURCE'))`
- `target_id uuid` (nullable for VENUE_DEFAULT; references zones(id) or resources(id))
- `hourly_rate_minor bigint NOT NULL CHECK (hourly_rate_minor > 0)`
- `currency text NOT NULL DEFAULT 'RON'`
- `created_at timestamptz NOT NULL DEFAULT now()`
- `updated_at timestamptz NOT NULL DEFAULT now()`
- `CONSTRAINT price_rules_venue_target_uniq UNIQUE (venue_id, target_type, target_id)`

### 2.2 `price_quotes`
- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE`
- `customer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE`
- `starts_at timestamptz NOT NULL`
- `ends_at timestamptz NOT NULL`
- `items_snapshot jsonb NOT NULL`
- `policy_snapshot jsonb NOT NULL`
- `total_minor bigint NOT NULL CHECK (total_minor > 0)`
- `due_now_minor bigint NOT NULL CHECK (due_now_minor > 0)`
- `balance_minor bigint NOT NULL CHECK (balance_minor >= 0)`
- `currency text NOT NULL DEFAULT 'RON'`
- `signature text NOT NULL`
- `expires_at timestamptz NOT NULL`
- `created_at timestamptz NOT NULL DEFAULT now()`

### 2.3 Grants
- `GRANT SELECT, INSERT, UPDATE, DELETE ON price_rules TO gamerbooker_app;`
- `GRANT SELECT, INSERT, UPDATE, DELETE ON price_quotes TO gamerbooker_app;`

---

## 3. Acceptance Tests (`tests/eng103-price-quotes.spec.ts`)
1. **Pricing Rule Precedence**:
   - Computes quote using venue default rate when no zone/resource rule exists.
   - Computes quote using zone rate when zone price rule is defined.
   - Computes quote using resource rate when resource price rule is defined.
2. **Minor-Unit Arithmetic & Accounting Invariants**:
   - `total_minor === sum(items.amount_minor)`.
   - `due_now_minor + balance_minor === total_minor`.
   - Proves exact integer math on fractional amounts (e.g. 40% of 75.00 RON = 30.00 RON due, 45.00 RON balance).
3. **Policy Integration & Duration Validation**:
   - Rejects quote requests violating policy min/max duration or slot granularity.
   - Embeds frozen policy snapshot.
4. **Signature Verification & Anti-Tampering**:
   - Validates authentic quote signature.
   - Rejects altered amounts, expired quotes, or tampered IDs.
5. **Dashboard Pricing Management & RBAC**:
   - OWNER/VENUE_MANAGER can manage price rules.
   - RECEPTION cannot alter pricing rules (403).
   - Cross-tenant pricing modifications blocked with 404 (T-018).
