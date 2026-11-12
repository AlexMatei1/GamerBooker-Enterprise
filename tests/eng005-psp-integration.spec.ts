/**
 * Acceptance test suite for ENG-005: PSP integration contract, sandbox, and webhook replay harness.
 */
import { startTestApp, type TestApp } from './support/auth-harness';
import { SandboxPaymentProvider } from '../src/payments/sandbox-psp.provider';
import { WebhookReplayHarness } from '../src/payments/webhook-replay.harness';
import { PaymentsService } from '../src/payments/payments.service';

describe('ENG-005 PSP Integration & Webhook Replay Harness', () => {
  let app: TestApp;
  let provider: SandboxPaymentProvider;
  let replayHarness: WebhookReplayHarness;
  let tenantId: string;
  let venueId: string;

  beforeAll(async () => {
    app = await startTestApp('eng005');
    provider = new SandboxPaymentProvider();
    replayHarness = new WebhookReplayHarness(provider);

    // Create a verified tenant and venue for payment tests
    const tenantRes = await app.db.query<{ id: string }>(
      "INSERT INTO tenants (legal_name) VALUES ('PSP Test Tenant') RETURNING id",
    );
    tenantId = tenantRes.rows[0].id;

    const venueRes = await app.db.query<{ id: string }>(
      "INSERT INTO venues (tenant_id, name, publication_state) VALUES ($1, 'PSP Test Venue', 'PUBLISHED') RETURNING id",
      [tenantId],
    );
    venueId = venueRes.rows[0].id;
  });

  afterAll(async () => {
    await app.stop();
  });

  describe('Payment Intent Creation & Idempotency', () => {
    it('creates a new payment intent with minor-unit exact amounts and unique provider_ref', async () => {
      const paymentsService = new PaymentsService(provider);
      const idempotencyKey = 'idemp_test_intent_001';

      const intent = await paymentsService.createIntent(
        tenantId,
        venueId,
        {
          amountMinor: 4000, // 40.00 RON
          currency: 'RON',
          reference: 'booking_ref_001',
          idempotencyKey,
          metadata: { note: 'Initial solo deposit' },
        },
        'sandbox',
      );

      expect(intent.intentId).toBeDefined();
      expect(intent.providerRef).toMatch(/^sbx_pi_/);
      expect(intent.status).toBe('PENDING');

      // Verify row persisted in DB
      const row = await paymentsService.getIntent(intent.providerRef);
      expect(row).not.toBeNull();
      expect(row?.amount_minor).toBe('4000');
      expect(row?.status).toBe('PENDING');
      expect(row?.currency).toBe('RON');
    });

    it('returns existing intent when called with an identical idempotency key', async () => {
      const paymentsService = new PaymentsService(provider);
      const idempotencyKey = 'idemp_test_intent_repeat';

      const first = await paymentsService.createIntent(
        tenantId,
        venueId,
        {
          amountMinor: 10000, // 100.00 RON
          currency: 'RON',
          reference: 'booking_ref_repeat',
          idempotencyKey,
        },
        'sandbox',
      );

      const second = await paymentsService.createIntent(
        tenantId,
        venueId,
        {
          amountMinor: 10000,
          currency: 'RON',
          reference: 'booking_ref_repeat',
          idempotencyKey,
        },
        'sandbox',
      );

      expect(second.intentId).toBe(first.intentId);
      expect(second.providerRef).toBe(first.providerRef);
      expect(second.status).toBe(first.status);
    });
  });

  describe('Webhook Cryptographic Signature Verification', () => {
    it('rejects a webhook request with missing signature header (400)', async () => {
      const res = await app.call('POST', '/v1/webhooks/payments/sandbox', {
        body: { test: 'payload' },
      });

      expect(res.status).toBe(400);
      const error = app.errorOf(res);
      expect(error.code).toBe('PSP_SIGNATURE_MISSING');
    });

    it('rejects a webhook request with forged signature (400)', async () => {
      const { rawBody } = replayHarness.createEvent('sbx_pi_fake', 'payment_intent.succeeded', 5000);

      const res = await app.call('POST', '/v1/webhooks/payments/sandbox', {
        body: rawBody,
        headers: {
          'x-psp-signature': '0000000000000000000000000000000000000000000000000000000000000000',
        },
      });

      expect(res.status).toBe(400);
      const error = app.errorOf(res);
      expect(error.code).toBe('PSP_SIGNATURE_INVALID');
    });

    it('rejects a tampered payload even if originally signed (400)', async () => {
      const { rawBody, signature } = replayHarness.createEvent('sbx_pi_fake', 'payment_intent.succeeded', 5000);
      const tamperedBody = rawBody.replace('5000', '9999');

      const res = await app.call('POST', '/v1/webhooks/payments/sandbox', {
        body: tamperedBody,
        headers: {
          'x-psp-signature': signature,
        },
      });

      expect(res.status).toBe(400);
      const error = app.errorOf(res);
      expect(error.code).toBe('PSP_SIGNATURE_INVALID');
    });

    it('rejects webhook for an unsupported provider (400)', async () => {
      const res = await app.call('POST', '/v1/webhooks/payments/unknown_provider', {
        body: { some: 'event' },
        headers: { 'x-psp-signature': 'abc' },
      });

      expect(res.status).toBe(400);
      const error = app.errorOf(res);
      expect(error.code).toBe('PSP_PROVIDER_NOT_SUPPORTED');
    });

    // Regression: a PSP signs the bytes it sent bytes. If the API re-serialises the
    // parsed JSON before hashing, any formatting (and Stripe always sends some)
    // changes the digest and a genuine webhook is rejected. This passes a
    // pretty-printed, correctly signed body and demands a 200.
    it('verifies a signature over the exact received bytes, not a re-serialised body', async () => {
      const paymentsService = new PaymentsService(provider);
      const intent = await paymentsService.createIntent(
        tenantId,
        venueId,
        {
          amountMinor: 1234,
          currency: 'RON',
          reference: 'raw_body_bytes',
          idempotencyKey: 'idem_raw_body_bytes',
        },
        'sandbox',
      );

      const rawBody = JSON.stringify(
        {
          event_id: `evt_ws_${Date.now()}`,
          event_type: 'payment_intent.succeeded',
          provider_ref: intent.providerRef,
          amount_minor: 1234,
          currency: 'RON',
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      );
      expect(rawBody).toContain('\n');
      expect(rawBody).toContain('  ');

      const res = await app.call('POST', '/v1/webhooks/payments/sandbox', {
        body: rawBody,
        headers: { 'x-psp-signature': provider.signPayload(rawBody) },
      });

      expect(res.status).toBe(200);
      const updated = await paymentsService.getIntent(intent.providerRef);
      expect(updated?.status).toBe('CAPTURED');
    });
  });

  describe('Webhook Processing, State Transitions & Replay Harness', () => {
    it('processes a valid payment_intent.succeeded event, transitions intent to CAPTURED, and records event', async () => {
      const paymentsService = new PaymentsService(provider);
      const intent = await paymentsService.createIntent(
        tenantId,
        venueId,
        {
          amountMinor: 8500, // 85.00 RON
          currency: 'RON',
          reference: 'booking_ref_85',
          idempotencyKey: 'idemp_key_85',
        },
        'sandbox',
      );

      const event = replayHarness.createEvent(intent.providerRef, 'payment_intent.succeeded', 8500);

      const res = await app.call('POST', '/v1/webhooks/payments/sandbox', {
        body: event.rawBody,
        headers: {
          'x-psp-signature': event.signature,
        },
      });

      expect(res.status).toBe(200);
      const body = res.json as { eventId: string; duplicate: boolean; status: string };
      expect(body.duplicate).toBe(false);
      expect(body.status).toBe('PROCESSED');

      // Verify payment intent updated to CAPTURED
      const updatedIntent = await paymentsService.getIntent(intent.providerRef);
      expect(updatedIntent?.status).toBe('CAPTURED');

      // Verify event recorded in payment_webhook_events
      const recorded = await app.db.query<{ event_id: string; status: string }>(
        'SELECT event_id, status FROM payment_webhook_events WHERE provider = $1 AND event_id = $2',
        ['sandbox', event.payload.event_id],
      );
      expect(recorded.rows.length).toBe(1);
      expect(recorded.rows[0].status).toBe('PROCESSED');
    });

    it('safely deduplicates replayed webhook events (idempotency verified)', async () => {
      const paymentsService = new PaymentsService(provider);
      const intent = await paymentsService.createIntent(
        tenantId,
        venueId,
        {
          amountMinor: 6000,
          currency: 'RON',
          reference: 'booking_ref_replay',
          idempotencyKey: 'idemp_key_replay',
        },
        'sandbox',
      );

      const event = replayHarness.createEvent(intent.providerRef, 'payment_intent.succeeded', 6000);

      // First delivery
      const res1 = await app.call('POST', '/v1/webhooks/payments/sandbox', {
        body: event.rawBody,
        headers: { 'x-psp-signature': event.signature },
      });
      expect(res1.status).toBe(200);
      expect((res1.json as { duplicate?: boolean }).duplicate).toBe(false);

      // Replay of the identical event
      const res2 = await app.call('POST', '/v1/webhooks/payments/sandbox', {
        body: event.rawBody,
        headers: { 'x-psp-signature': event.signature },
      });

      expect(res2.status).toBe(200);
      const body2 = res2.json as { duplicate: boolean; status: string };
      expect(body2.duplicate).toBe(true);
      expect(body2.status).toBe('IGNORED');

      // Ensure no duplicate event rows inserted
      const countRes = await app.db.query<{ count: string }>(
        'SELECT count(*)::text as count FROM payment_webhook_events WHERE event_id = $1',
        [event.payload.event_id],
      );
      expect(countRes.rows[0].count).toBe('1');
    });

    it('processes payment_intent.failed and charge.refunded events', async () => {
      const paymentsService = new PaymentsService(provider);

      // Test failure transition
      const failedIntent = await paymentsService.createIntent(
        tenantId,
        venueId,
        {
          amountMinor: 3000,
          currency: 'RON',
          reference: 'booking_fail',
          idempotencyKey: 'idemp_fail',
        },
        'sandbox',
      );

      const failEvent = replayHarness.createEvent(failedIntent.providerRef, 'payment_intent.failed', 3000);
      await app.call('POST', '/v1/webhooks/payments/sandbox', {
        body: failEvent.rawBody,
        headers: { 'x-psp-signature': failEvent.signature },
      });

      const updatedFailed = await paymentsService.getIntent(failedIntent.providerRef);
      expect(updatedFailed?.status).toBe('FAILED');

      // Test refund transition
      const refundIntent = await paymentsService.createIntent(
        tenantId,
        venueId,
        {
          amountMinor: 7000,
          currency: 'RON',
          reference: 'booking_refund',
          idempotencyKey: 'idemp_refund',
        },
        'sandbox',
      );

      // Capture first
      const captureEvent = replayHarness.createEvent(refundIntent.providerRef, 'payment_intent.succeeded', 7000);
      await app.call('POST', '/v1/webhooks/payments/sandbox', {
        body: captureEvent.rawBody,
        headers: { 'x-psp-signature': captureEvent.signature },
      });

      // Now refund
      const refundEvent = replayHarness.createEvent(refundIntent.providerRef, 'charge.refunded', 7000);
      await app.call('POST', '/v1/webhooks/payments/sandbox', {
        body: refundEvent.rawBody,
        headers: { 'x-psp-signature': refundEvent.signature },
      });

      const updatedRefunded = await paymentsService.getIntent(refundIntent.providerRef);
      expect(updatedRefunded?.status).toBe('REFUNDED');
    });
  });
});
