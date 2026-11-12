# HANDOFF - ENG-005 PSP Integration Contract, Sandbox, and Webhook Replay Harness

Historical status: proposed, ready for implementation. See the [2026-11-04 status inventory](HANDOFF-INDEX-2026-11-04.md) for the later assessment.
Author: thinker (contract), recorded by the primary agent (scribe).
Task source: docs/11-delivery/04-engineering-handoff-backlog.md:11 (ENG-005), critical path line 54.
Roadmap: Milestone M0 Foundations (docs/11-delivery/01-implementation-roadmap.md:5-9).

Preconditions:
- ENG-001 (Foundation), ENG-002 (Auth/RBAC), ENG-003 (Venues & Memberships), and ENG-004 (Exclusion constraints & Fixtures) delivered and passing.
- Database runs on PostgreSQL 15+ with least-privilege `gamerbooker_app` role.

---

## Task Definition
`ENG-005 | PSP integration contract + sandbox and webhook replay harness | Payment provider interface, webhook secret, raw signature headers | Idempotent payment intent creation, cryptographic signature verification, replay deduplication on event_id, minor-unit money (RON) | POST /v1/webhooks/payments/:provider, POST /v1/dev/psp/simulate-webhook | payment_intents, payment_webhook_events | N/A (Backend / Harness) | PSP_SIGNATURE_INVALID, PSP_INTENT_NOT_FOUND, PSP_EVENT_DUPLICATE, PSP_AMOUNT_MISMATCH | Webhook: public with HMAC signature; Dev simulation: development only | Replay harness tests, forged signature rejection, idempotent duplicate processing | payment_captured, payment_failed, webhook_received, webhook_rejected | Platform Engineering`

---

## 1. Domain Invariants & Contracts

### 1.1 Provider Interface (`PaymentProvider`)
Per `docs/04-payments/01-payment-architecture.md:28-36`:
```ts
export interface CreateIntentInput {
  amountMinor: number;
  currency: 'RON';
  reference: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

export interface IntentResult {
  providerRef: string;
  clientSecret?: string;
  status: 'PENDING' | 'AUTHORIZED' | 'CAPTURED' | 'FAILED' | 'CANCELLED';
}

export interface RefundInput {
  providerRef: string;
  amountMinor: number;
  idempotencyKey: string;
  reason?: string;
}

export interface RefundResult {
  refundRef: string;
  status: 'SUCCEEDED' | 'PENDING' | 'FAILED';
}

export interface VerifiedProviderEvent {
  eventId: string;
  eventType: 'payment_intent.succeeded' | 'payment_intent.failed' | 'charge.refunded';
  providerRef: string;
  amountMinor: number;
  currency: 'RON';
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly name: string;
  createIntent(input: CreateIntentInput): Promise<IntentResult>;
  getStatus(providerRef: string): Promise<'PENDING' | 'AUTHORIZED' | 'CAPTURED' | 'FAILED' | 'CANCELLED' | 'REFUNDED'>;
  refund(input: RefundInput): Promise<RefundResult>;
  verifyWebhook(rawBody: Buffer, signatureHeader: string): VerifiedProviderEvent;
}
```

### 1.2 Webhook Security & Idempotency Rules
1. **Raw Body Cryptographic Verification**:
   - Signature header must contain valid HMAC SHA-256 computed over the exact raw request bytes using the provider's shared secret (`PSP_WEBHOOK_SECRET`).
   - Forged or expired signatures immediately return HTTP 400 `PSP_SIGNATURE_INVALID`.
2. **Event Deduplication (T-018 / Idempotency Matrix)**:
   - Every provider event has a unique `eventId`.
   - On webhook ingest, the event is recorded in `payment_webhook_events(provider, event_id)`.
   - A replayed event with an identical `(provider, event_id)` already marked `PROCESSED` must return HTTP 200 with `{"status": "DUPLICATE_IGNORED"}` without applying duplicate state mutations or ledger changes.
3. **Financial Invariants**:
   - Minor units only (`bigint` bani, 1 RON = 100 bani).
   - No floating-point rounding.

---

## 2. Database Schema (`migrations/0007_psp_payments.sql`)

### 2.1 `payment_intents` Table
- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`
- `venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE`
- `booking_id uuid` (nullable for standalone orders)
- `order_id uuid` (nullable)
- `provider text NOT NULL` (e.g. `'sandbox'`, `'mock_psp'`)
- `provider_ref text NOT NULL UNIQUE`
- `idempotency_key text NOT NULL UNIQUE`
- `amount_minor bigint NOT NULL CHECK (amount_minor > 0)`
- `currency text NOT NULL DEFAULT 'RON'`
- `status text NOT NULL CHECK (status IN ('PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'CANCELLED', 'REFUNDED'))`
- `metadata jsonb NOT NULL DEFAULT '{}'`
- `created_at timestamptz NOT NULL DEFAULT now()`
- `updated_at timestamptz NOT NULL DEFAULT now()`

### 2.2 `payment_webhook_events` Table
- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `provider text NOT NULL`
- `event_id text NOT NULL`
- `event_type text NOT NULL`
- `provider_ref text NOT NULL`
- `payload jsonb NOT NULL`
- `status text NOT NULL CHECK (status IN ('PROCESSED', 'IGNORED', 'FAILED'))`
- `created_at timestamptz NOT NULL DEFAULT now()`
- `CONSTRAINT payment_webhook_events_provider_event_uniq UNIQUE (provider, event_id)`

### 2.3 Least-Privilege Grants
- `GRANT SELECT, INSERT, UPDATE ON payment_intents TO gamerbooker_app;`
- `GRANT SELECT, INSERT, UPDATE ON payment_webhook_events TO gamerbooker_app;`

---

## 3. Replay Harness & Sandbox
- `SandboxPaymentProvider`: Fully functional mock provider implementing `PaymentProvider` with cryptographic signing helper (`signPayload(payload: string): string`).
- Webhook Replay Harness: helper module allowing test suites and staging pipelines to simulate:
  - Valid `payment_intent.succeeded` event -> updates status to `CAPTURED`.
  - Replay of identical event -> safely ignored, returns 200.
  - Valid `payment_intent.failed` event -> updates status to `FAILED`.
  - Invalid signature -> returns 400.
  - Tampered payload -> returns 400.

---

## 4. Acceptance Criteria
- [x] All 11 existing test suites continue to pass.
- [x] `tests/eng005-psp-integration.spec.ts` passes against real PostgreSQL and HTTP server.
- [x] Lint (`npm run lint`), typecheck (`npm run typecheck`), and build (`npm run build`) pass cleanly.
