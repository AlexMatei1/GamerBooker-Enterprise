# HANDOFF - ENG-106 Solo checkout (FULL and DEPOSIT), QR, balance display

Historical status: proposed, ready for implementation. See the [2026-11-04 status inventory](HANDOFF-INDEX-2026-11-04.md) for the later assessment.
Author: thinker (contract), recorded by the primary agent (scribe).
Task source: docs/11-delivery/04-engineering-handoff-backlog.md:19 (ENG-106), critical path line 54.
Roadmap: Milestone M1 Resource & availability core (docs/11-delivery/01-implementation-roadmap.md:10-14).

Preconditions:
- E0 Foundation delivered (`ENG-001` through `ENG-005`).
- Venue & resource hierarchy delivered (`ENG-003`).
- Operating schedules & availability engine delivered (`ENG-101`).
- Policy hierarchy, validator, and immutable snapshots delivered (`ENG-102`).
- Price quotes with minor-unit exact arithmetic delivered (`ENG-103`).
- Atomic hold, component closure, and expiry worker delivered (`ENG-104`).
- Booking confirmation guard and state machine delivered (`ENG-105`).

---

## Task Definition
`ENG-106 | Solo checkout (FULL and DEPOSIT), QR, balance display | Active hold ID, payment intent authorization / simulation, customer session, staff session | Server-evaluated solo checkout supporting FULL and DEPOSIT prepaid modes, dynamic rolling QR token generation (HMAC-SHA256, expiring nonce, no PII), venue staff QR check-in scanner (single redemption, ALREADY_CHECKED_IN replay rejection, venue boundary matching), balance summary display, and reception balance settlement with offline receipts | POST /v1/checkout/solo, GET /v1/bookings/:id/qr, GET /v1/bookings/:id/balance, POST /v1/dashboard/venues/:venue_id/checkin, POST /v1/dashboard/venues/:venue_id/bookings/:id/pay-balance | checkins, offline_receipts, bookings, audit_events, outbox_events | Checkout Screen, Mobile QR Screen, Reception Scanner, Balance Display | CHECKIN_TOO_EARLY, SESSION_ENDED, ALREADY_CHECKED_IN, QR_INVALID, QR_EXPIRED, VENUE_MISMATCH, OVERPAYMENT_NOT_ALLOWED | Customer: checkout, QR view, balance view; Venue Staff: scan QR check-in, pay balance | Full & deposit checkout tests, QR generation & replay protection tests, check-in window validation tests, reception balance collection tests | solo_checkout_completed, qr_redeemed, qr_replay_prevented, balance_settled | Bookings & Operations Core`

---

## 1. Domain Invariants & Rules

### 1.1 Solo Checkout (FULL vs DEPOSIT)
- In solo checkout, a single customer pays 100% of `due_now_minor`:
  - If policy `prepaid_mode === 'FULL'`:
    - `due_now_minor = total_minor`
    - `paid_minor = total_minor`
    - `balance_minor = 0` (no outstanding gaming balance)
  - If policy `prepaid_mode === 'DEPOSIT'`:
    - `due_now_minor < total_minor`
    - `paid_minor = due_now_minor`
    - `balance_minor = total_minor - due_now_minor` (remaining gaming balance to be settled online or at reception)
- Checkout idempotency:
  - Repeated checkout requests with the same `Idempotency-Key` return the identical confirmed booking without creating duplicate payment intents or bookings.

### 1.2 Secure Expiring QR Token
- Structure:
  - Encoded payload: `booking_id`, `public_code`, `nonce`, `expires_at` (15-minute rolling TTL).
  - Cryptographic signature: `HMAC_SHA256(booking_id + ':' + nonce + ':' + expires_at, QR_SECRET)`.
  - Format: base64url JSON token containing the payload and signature.
  - Zero PII: no customer name, email, phone, or credit card info inside the QR payload.

### 1.3 Staff Check-in Scanner & Replay Protection
- Staff scans QR token or enters public booking code.
- Verification checks:
  1. Token cryptographic signature and expiry (`now() <= expires_at`).
  2. Booking exists and belongs to the scanner's venue (`booking.venue_id === venue_id`). If venue does not match -> 404/403 `VENUE_MISMATCH`.
  3. Status must be `CONFIRMED`:
     - If already `CHECKED_IN` -> 409 `ALREADY_CHECKED_IN` (returns existing check-in details without error crash).
     - If `CANCELLED`, `COMPLETED`, or `NO_SHOW` -> 400 `INVALID_BOOKING_STATUS`.
  4. Time window check:
     - Check-in allowed from `starts_at - 15 minutes` up to `ends_at`.
     - Before window -> 400 `CHECKIN_TOO_EARLY`.
     - After window -> 400 `SESSION_ENDED`.
- On successful check-in:
  - Inserts row into `checkins`.
  - Updates booking `status = 'CHECKED_IN'`.
  - Emits `CheckedIn` outbox event and `CHECKED_IN` audit log.

### 1.4 Balance Display & Reception Settlement
- Balance summary shows:
  - `total_minor`, `paid_minor`, `balance_minor`.
  - `prepaid_mode`: `'FULL'` or `'DEPOSIT'`.
  - `remaining_payment_methods`: from policy (`['ONLINE_ONLY']`, `['RECEPTION_ONLY']`, `['ONLINE_OR_RECEPTION']`).
  - `is_fully_paid`: `balance_minor === 0`.
- Reception Payment:
  - Staff records offline receipt (`CASH`, `POS_TERMINAL`, `RECEPTION_CARD`).
  - Prevents overpayment: `amount_minor <= booking.balance_minor`.
  - Atomically increments `paid_minor` and decrements `balance_minor`.
  - Emits `BalancePaid` outbox event and audit log.

---

## 2. Database Schema (`migrations/0013_checkins_and_checkout.sql`)

```sql
CREATE TABLE IF NOT EXISTS checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  qr_token_ref text,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT checkins_booking_uniq UNIQUE (booking_id)
);

CREATE TABLE IF NOT EXISTS offline_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  payment_method text NOT NULL CHECK (payment_method IN ('CASH', 'POS_TERMINAL', 'RECEPTION_CARD')),
  reference text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT offline_receipts_venue_ref_uniq UNIQUE (venue_id, reference)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON checkins, offline_receipts TO gamerbooker_app;
```

---

## 3. Acceptance Verification Plan
1. **Solo Checkout (FULL Prepaid)**:
   - Full prepaid quote/hold -> checkout confirms booking, `due_now_minor = total_minor`, `balance_minor = 0`, `is_fully_paid = true`.
2. **Solo Checkout (DEPOSIT Prepaid)**:
   - Deposit quote/hold -> checkout confirms booking, `due_now_minor = deposit`, `balance_minor = total - deposit`, `is_fully_paid = false`.
3. **QR Token Generation & Verification**:
   - Generates valid signed token with rolling TTL.
   - Rejects tampered signature or expired token.
4. **Staff QR Check-in**:
   - Scans valid QR within window -> transitions booking to `CHECKED_IN`, creates `checkins` record.
   - Re-scan attempt returns 409 `ALREADY_CHECKED_IN` without creating duplicate checkin.
   - Out of window check-in rejected (`CHECKIN_TOO_EARLY` / `SESSION_ENDED`).
   - Cross-venue scan rejected (venue mismatch).
5. **Balance Display & Settlement**:
   - Accurately reports outstanding balance.
   - Staff records reception payment -> decrements balance, increments paid, generates offline receipt.
   - Rejects overpayment attempt (`OVERPAYMENT_NOT_ALLOWED`).
