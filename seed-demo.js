#!/usr/bin/env node

const { Pool } = require('pg');
const crypto = require('crypto');

// Connect to the demo DB (same as the API)
const pool = new Pool({
  connectionString: 'postgresql://gamerbooker_app@127.0.0.1:5433/gamerbooker_test_demo1',
});

async function uuid() {
  return crypto.randomUUID();
}

// Skip password hashing - use a simple hash or skip user creation
// We'll skip user creation entirely and just seed the booking+order flow
// The user already exists; we'll just seed downstream tables

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const now = new Date().toISOString();
    const secret = process.env.QUOTE_SECRET || 'gamerbooker-quote-signature-key-0123456789abcdef';

    // Use an existing customer or create a minimal one without password hash
    // We'll insert rows without a user - skip the users table, but we need a customer_id
    // Let's use the demo admin ID which is 00057427-b46d-406c-a02e-356a168f8733
    const customerId = '00057427-b46d-406c-a02e-356a168f8733';
    console.log('Using existing customer ID:', customerId);

    // ------------------------------------------------------------
    // 1. Insert a price quote (matching the demo venue's policy)
    // ------------------------------------------------------------
    const venueId = '22222222-2222-2222-2222-222222222222';
    const tenantId = '11111111-1111-1111-1111-111111111111';
    const resourceIds = [
      '77777777-7777-7777-7777-777777777777', // PC #1
      '88888888-8888-8888-8888-888888888888'  // PC #2
    ];
    const startAt = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 14:00+02
    const endAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // 16:00+02
    const totalMinor = 10000; // 2 hours × 5000 RON/h
    const dueNowMinor = Math.ceil(totalMinor * 0.4); // 40% deposit
    const balanceMinor = totalMinor - dueNowMinor;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15-min TTL

    const quoteId = await uuid();
    const itemsSnapshot = JSON.stringify([
      { resource_id: resourceIds[0], resource_name: 'PC #1', resource_type: 'PC', amount_minor: 5000, hourly_rate_minor: 5000 },
      { resource_id: resourceIds[1], resource_name: 'PC #2', resource_type: 'PC', amount_minor: 5000, hourly_rate_minor: 5000 }
    ]);
    const policySnapshot = JSON.stringify({
      prepaid_mode: 'DEPOSIT',
      deposit_percentage: 40,
      deposit_mode_settlement: 'ONLINE_OR_RECEPTION',
      min_duration_minutes: 60,
      max_duration_minutes: 480,
      slot_granularity_minutes: 15,
      buffer_after_minutes: 0,
      free_cancellation_hours: 3,
      late_cancellation_penalty_percent: 20,
      no_show_grace_minutes: 15
    });
    const canonical = `${quoteId}:${totalMinor}:${dueNowMinor}:${expiresAt}`;
    const signature = crypto.createHmac('sha256', secret).update(canonical).digest('hex');

    await client.query(
      `INSERT INTO price_quotes (
         id, venue_id, customer_id, package_id, starts_at, ends_at, items_snapshot,
         policy_snapshot, total_minor, due_now_minor, balance_minor, currency, signature, expires_at, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`
,
      [quoteId, venueId, customerId, null, startAt, endAt, itemsSnapshot, policySnapshot,
       totalMinor, dueNowMinor, balanceMinor, 'RON', signature, expiresAt, now]
    );
    console.log('✓ Price quote created:', quoteId);

    // ------------------------------------------------------------
    // 2. Insert a hold (ACTIVE, with resource claims)
    // ------------------------------------------------------------
    const holdId = await uuid();
    const expiresHoldAt = expiresAt;
    await client.query(
      `INSERT INTO holds (
         id, tenant_id, venue_id, customer_id, quote_id, package_id,
         status, resource_ids, atomic_resource_ids, starts_at, ends_at, expires_at, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`
,
      [holdId, tenantId, venueId, customerId, quoteId, null,
       'ACTIVE', `{${resourceIds.join(',')}}`, `{${resourceIds.join(',')}}`, startAt, endAt,
       expiresHoldAt, now, now]
    );
    console.log('✓ Hold created:', holdId);

    for (const rid of resourceIds) {
      await client.query(
        `INSERT INTO resource_claims (
           resource_id, tenant_id, holder_id, hold_id, claim_type, state, slot,
           created_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,tstzrange($7::timestamptz,$8::timestamptz,'[)'),$9,$10)`
,
        [rid, tenantId, customerId, holdId, 'HOLD', 'ACTIVE_HOLD', startAt, endAt, now, now]
      );
    }
    console.log('✓ Resource claims created');

    // ------------------------------------------------------------
    // 3. Insert a sandbox payment intent (PENDING) that will be marked CAPTURED
    // ------------------------------------------------------------
    const intentId = await uuid();
    const providerRef = `sbx_pi_${crypto.randomBytes(8).toString('hex')}`;
    const idempotencyKey = `seed-${Date.now()}`;
    await client.query(
      `INSERT INTO payment_intents (
         id, tenant_id, venue_id, booking_id, order_id, provider, provider_ref,
         idempotency_key, amount_minor, currency, status, metadata, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`
,
      [intentId, tenantId, venueId, null, null, 'sandbox', providerRef,
       idempotencyKey, dueNowMinor, 'RON', 'PENDING',
       JSON.stringify({ type: 'SOLO_BOOKING_CHECKOUT', hold_id: holdId, customer_id: customerId }),
       now, now]
    );
    console.log('✓ Sandbox payment intent created:', intentId, 'key:', idempotencyKey);

    // ------------------------------------------------------------
    // 4. Simulate webhook – capture intent
    // ------------------------------------------------------------
    await client.query(
      `UPDATE payment_intents SET status = 'CAPTURED', updated_at = now() WHERE id = $1`,
      [intentId]
    );
    console.log('✓ Payment intent captured (simulated webhook)');

    // ------------------------------------------------------------
    // 5. Create the booking (CONFIRMED)
    // ------------------------------------------------------------
    const bookingId = await uuid();
    const publicCode = crypto.randomBytes(3).toString('hex').toUpperCase() + crypto.randomBytes(5).toString('hex');
    await client.query(
      `INSERT INTO bookings (
         id, public_code, tenant_id, venue_id, customer_id, hold_id, quote_id, package_id,
         status, type, starts_at, ends_at, timezone, resource_ids, atomic_resource_ids,
         total_minor, due_now_minor, paid_minor, balance_minor, currency,
         price_snapshot, policy_snapshot, version, idempotency_key, confirmed_at, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)`
,
      [
        bookingId,
        publicCode,
        tenantId,
        venueId,
        customerId,
        holdId,
        quoteId,
        null,
        'CONFIRMED',
        'SINGLE',
        startAt,
        endAt,
        'Europe/Bucharest',
        `{${resourceIds.join(',')}}`,
        `{${resourceIds.join(',')}}`,
        totalMinor,
        dueNowMinor,
        dueNowMinor,
        balanceMinor,
        'RON',
        JSON.stringify({ items: [], total_minor: totalMinor, due_now_minor: dueNowMinor, balance_minor: balanceMinor }),
        JSON.stringify({ prepaid_mode: 'DEPOSIT', deposit_percentage: 40 }),
        1,
        null,
        now,
        now,
        now
      ]
    );
    console.log('✓ Booking confirmed:', bookingId);

    // Link payment intent to booking (required by bookings.service)
    await client.query(
      `UPDATE payment_intents SET booking_id = $1, updated_at = now() WHERE id = $2 AND booking_id IS NULL AND status = 'CAPTURED'`,
      [bookingId, intentId]
    );
    console.log('✓ Payment intent linked to booking');

    // ------------------------------------------------------------
    // 6. Insert an order (PAYMENT_PENDING) with two consumable items
    // ------------------------------------------------------------
    const orderId = await uuid();
    const orderPublicCode = crypto.randomBytes(3).toString('hex').toUpperCase() + crypto.randomBytes(6).toString('hex');
    const product1 = 'b1000000-0000-0000-0000-000000000002';
    const product2 = 'b1000000-0000-0000-0000-000000000005';
    await client.query(
      `INSERT INTO orders (
         id, tenant_id, venue_id, booking_id, customer_id, public_code, order_type,
         fulfillment_mode, target_resource_id, pickup_code, status, total_minor, currency, notes,
         payment_intent_id, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`
,
      [
        orderId,
        tenantId,
        venueId,
        bookingId,
        customerId,
        orderPublicCode,
        'PREORDER',
        'BAR_PICKUP',
        null,
        null,
        'PAYMENT_PENDING',
        totalMinor,
        'RON',
        null,
        intentId,
        now,
        now
      ]
    );
    console.log('✓ Order created:', orderId);

    // Order items - insert two rows separately (pg query doesn't accept multiple value arrays)
    // Columns per actual DB schema: id, order_id, product_id, title, unit_price_minor, quantity, line_total_minor,
    // restricted_product_type, age_verification_required, tax_category, status, created_at
    // (no updated_at column in order_items)
    await client.query(
      `INSERT INTO order_items (
         id, order_id, product_id, title, unit_price_minor, quantity, line_total_minor,
         restricted_product_type, age_verification_required, tax_category, status, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        await uuid(), orderId, product1, 'Apa minerala 500ml', 800, 1, 800,
        'NONE', false, 'STANDARD', 'ACTIVE', now
      ]
    );
    await client.query(
      `INSERT INTO order_items (
         id, order_id, product_id, title, unit_price_minor, quantity, line_total_minor,
         restricted_product_type, age_verification_required, tax_category, status, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        await uuid(), orderId, product2, 'Cappuccino', 1800, 1, 1800,
        'NONE', false, 'STANDARD', 'ACTIVE', now
      ]
    );
    console.log('✓ Order items added');

    await client.query('COMMIT');
    console.log('\n✅ Seed completed successfully.');
    console.log('   Customer ID:', customerId);
    console.log('   Venue:', venueId);
    console.log('   Booking public code:', publicCode);
    console.log('   Order public code:', orderPublicCode);

  } catch (err) {
    await client.query('ROLLBACK').catch(() => null);
    console.error('❌ Seed failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });