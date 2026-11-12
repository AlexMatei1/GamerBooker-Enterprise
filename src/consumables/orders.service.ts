import { HttpStatus, Injectable, OnModuleInit } from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import { getPool } from '../db/pool';
import { AuthHttpError } from '../auth/auth-error';
import { PaymentsService } from '../payments/payments.service';
import { RefundsService } from '../payments/refunds.service';
import type {
  OrderType,
  OrderStatus,
  FulfillmentMode,
  ValidateCartInput,
  ValidateCartResult,
  CheckoutOrderInput,
  CheckoutOrderResult,
  OrderDetail,
  OrderItemDetail,
  OrderFilterQuery,
  OrderListResult,
  BarBoardSummary,
  HandoffOrderInput,
  RejectOrderInput,
  RefuseAgeInput,
  CancelUnavailableItemInput,
} from './orders.types';

// Crockford base32 alphabet (excludes I, L, O, U)
const CROCKFORD_CHARS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function generateCrockfordCode(prefix: string, length: number = 6): string {
  const bytes = randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CROCKFORD_CHARS[bytes[i] % 32];
  }
  return `${prefix}-${code}`;
}

@Injectable()
export class OrdersService implements OnModuleInit {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly refundsService?: RefundsService,
  ) {}

  /**
   * Orders created through `orders/checkout` leave the `payment_intents` row in
   * PENDING and the order in PAYMENT_PENDING. The webhook path
   * (`PaymentsService.processWebhook`) is the only place a real PSP capture is
   * confirmed, so the order must be settled from there as well. Without this
   * registration the sandbox capture shim in `OrdersController` would be the
   * sole route out of PAYMENT_PENDING, which is exactly the client-supplied
   * payment proof this codebase must not accept.
   */
  onModuleInit() {
    this.paymentsService.onPaymentCaptured(async (intent) => {
      if (!this.isOrderIntent(intent)) {
        return;
      }
      await this.handleOrderPaymentCaptured(intent.provider_ref);
    });
  }

  /**
   * Consumables order intents are the ones that carry `metadata.order_id`;
   * booking balance and group intents carry a `booking_id` instead. Keeping the
   * discriminator on `order_id` stops the booking handlers from double-settling
   * an order intent and vice versa.
   */
  private isOrderIntent(intent: { metadata?: unknown }): boolean {
    const metadata = (intent.metadata ?? {}) as Record<string, unknown>;
    return typeof metadata.order_id === 'string' && metadata.order_id.length > 0;
  }

  // ---------------------------------------------------------------------------
  // Cart & Order Eligibility Validation
  // ---------------------------------------------------------------------------

  async validateCart(
    customerId: string,
    input: ValidateCartInput,
  ): Promise<ValidateCartResult> {
    const pool = getPool();
    const errors: string[] = [];

    // 1. Verify booking exists and belongs to venue
    const bRes = await pool.query<any>(
      'SELECT * FROM bookings WHERE id = $1 AND venue_id = $2',
      [input.booking_id, input.venue_id],
    );
    if (bRes.rows.length === 0) {
      throw new AuthHttpError(
        HttpStatus.NOT_FOUND,
        'BOOKING_NOT_FOUND',
        'Referenced booking not found for this venue.',
      );
    }
    const booking = bRes.rows[0];

    // Ownership check
    if (booking.customer_id !== customerId) {
      // Check if user is a participant of a group booking
      const partCheck = await pool.query(
        'SELECT id FROM group_participants WHERE group_booking_id = (SELECT id FROM group_bookings WHERE booking_id = $1) AND user_id = $2',
        [booking.id, customerId],
      );
      if (partCheck.rows.length === 0) {
        throw new AuthHttpError(
          HttpStatus.FORBIDDEN,
          'FORBIDDEN_BOOKING_ACCESS',
          'You are not authorized to place orders for this booking.',
        );
      }
    }

    // Booking status eligibility
    if (['CANCELLED', 'NO_SHOW'].includes(booking.status)) {
      throw new AuthHttpError(
        HttpStatus.BAD_REQUEST,
        'BOOKING_NOT_ELIGIBLE_FOR_ORDERS',
        `Cannot place orders for booking in status '${booking.status}'.`,
      );
    }
    if (booking.status === 'COMPLETED') {
      throw new AuthHttpError(
        HttpStatus.BAD_REQUEST,
        'BOOKING_ALREADY_COMPLETED',
        'Cannot place orders for an already completed session.',
      );
    }

    // Determine order type & session window
    const now = Date.now();
    const startMs = new Date(booking.starts_at).getTime();
    const endMs = new Date(booking.ends_at).getTime();
    const fifteenMinMs = 15 * 60 * 1000;

    let orderType: OrderType = 'PREORDER';
    if (booking.status === 'CHECKED_IN' || (now >= startMs - fifteenMinMs && now <= endMs - fifteenMinMs)) {
      orderType = 'IN_SESSION';
    } else if (now < startMs) {
      orderType = 'PREORDER';
    } else if (now > endMs - fifteenMinMs) {
      errors.push('Ordering window closed: in-session orders close 15 minutes before session ends.');
    }

    // Validate fulfillment mode & station target
    if (input.fulfillment_mode === 'AT_STATION') {
      if (!input.target_resource_id) {
        errors.push('target_resource_id is required when fulfillment_mode is AT_STATION.');
      } else {
        const resourceIds: string[] = booking.resource_ids || [];
        if (!resourceIds.includes(input.target_resource_id)) {
          errors.push('Target station is not assigned to this booking.');
        }
      }
    }

    if (!input.items || input.items.length === 0) {
      errors.push('Cart is empty. At least one item is required.');
      return {
        valid: false,
        order_type: orderType,
        items: [],
        total_minor: 0,
        has_age_restricted_items: false,
        errors,
      };
    }

    // Validate items
    const productIds = input.items.map((i) => i.product_id);
    const pRes = await pool.query<any>(
      'SELECT * FROM products WHERE id = ANY($1) AND venue_id = $2',
      [productIds, input.venue_id],
    );
    const productMap = new Map<string, any>();
    for (const p of pRes.rows) {
      productMap.set(p.id, p);
    }

    let totalMinor = 0;
    let hasAgeRestricted = false;
    const validatedItems = [];

    for (const item of input.items) {
      const prod = productMap.get(item.product_id);
      if (!prod) {
        errors.push(`Product with ID '${item.product_id}' was not found in venue catalog.`);
        continue;
      }
      if (!prod.active) {
        errors.push(`Product '${prod.title}' is currently inactive.`);
        continue;
      }

      if (item.quantity < 1) {
        errors.push(`Quantity for '${prod.title}' must be at least 1.`);
        continue;
      }
      if (item.quantity > Number(prod.max_qty || 10)) {
        errors.push(`Maximum allowed quantity for '${prod.title}' is ${prod.max_qty}.`);
      }

      const onHand = Number(prod.stock_on_hand || 0);
      const reserved = Number(prod.stock_reserved || 0);
      const available = prod.inventory_tracking ? Math.max(0, onHand - reserved) : 9999;

      if (prod.inventory_tracking && item.quantity > available) {
        errors.push(
          `Insufficient stock for '${prod.title}': requested ${item.quantity}, but only ${available} available.`,
        );
      }

      const unitPrice = Number(prod.price_minor);
      const lineTotal = unitPrice * item.quantity;
      totalMinor += lineTotal;

      if (prod.age_verification_required || prod.restricted_product_type !== 'NONE') {
        hasAgeRestricted = true;
      }

      validatedItems.push({
        product_id: prod.id,
        title: prod.title,
        unit_price_minor: unitPrice,
        quantity: item.quantity,
        line_total_minor: lineTotal,
        available_stock: available,
        restricted_product_type: prod.restricted_product_type || 'NONE',
        age_verification_required: Boolean(prod.age_verification_required),
      });
    }

    return {
      valid: errors.length === 0,
      order_type: orderType,
      items: validatedItems,
      total_minor: totalMinor,
      has_age_restricted_items: hasAgeRestricted,
      errors,
    };
  }

  // ---------------------------------------------------------------------------
  // Order Checkout & Stock Reservation
  // ---------------------------------------------------------------------------

  async checkoutOrder(
    customerId: string,
    input: CheckoutOrderInput,
    requestId?: string,
  ): Promise<CheckoutOrderResult> {
    const pool = getPool();
    const reqId = requestId || randomUUID();

    // 1. Pre-validate cart structure
    const cartVal = await this.validateCart(customerId, input);
    if (!cartVal.valid) {
      throw new AuthHttpError(
        HttpStatus.BAD_REQUEST,
        'INVALID_CART_CONTENTS',
        cartVal.errors.join('; '),
      );
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 2. Lock booking
      const bRes = await client.query<any>(
        'SELECT * FROM bookings WHERE id = $1 AND venue_id = $2 FOR UPDATE',
        [input.booking_id, input.venue_id],
      );
      if (bRes.rows.length === 0) {
        throw new AuthHttpError(HttpStatus.NOT_FOUND, 'BOOKING_NOT_FOUND', 'Booking not found.');
      }
      const booking = bRes.rows[0];

      // 3. Lock products in sorted order to avoid deadlocks
      const sortedItemIds = [...input.items]
        .map((i) => i.product_id)
        .sort((a, b) => a.localeCompare(b));

      const pRes = await client.query<any>(
        'SELECT * FROM products WHERE id = ANY($1) AND venue_id = $2 FOR UPDATE',
        [sortedItemIds, input.venue_id],
      );
      const prodMap = new Map<string, any>();
      for (const p of pRes.rows) {
        prodMap.set(p.id, p);
      }

      // Check stock & compute exact totals under lock
      let totalMinor = 0;
      const orderItemsToInsert: Array<{
        product_id: string;
        title: string;
        unit_price_minor: number;
        quantity: number;
        line_total_minor: number;
        restricted_product_type: string;
        age_verification_required: boolean;
        tax_category: string;
      }> = [];

      for (const item of input.items) {
        const prod = prodMap.get(item.product_id);
        if (!prod || !prod.active) {
          throw new AuthHttpError(
            HttpStatus.BAD_REQUEST,
            'PRODUCT_UNAVAILABLE',
            `Product '${prod?.title || item.product_id}' is no longer available.`,
          );
        }

        const onHand = Number(prod.stock_on_hand || 0);
        const reserved = Number(prod.stock_reserved || 0);
        const available = onHand - reserved;

        if (prod.inventory_tracking && item.quantity > available) {
          throw new AuthHttpError(
            HttpStatus.BAD_REQUEST,
            'INSUFFICIENT_STOCK',
            `Product '${prod.title}' has only ${Math.max(0, available)} units available.`,
          );
        }

        // Reserve stock
        if (prod.inventory_tracking) {
          await client.query(
            'UPDATE products SET stock_reserved = stock_reserved + $1, updated_at = now() WHERE id = $2',
            [item.quantity, prod.id],
          );

          await client.query(
            `INSERT INTO stock_movements (
               tenant_id, venue_id, product_id, movement_type, quantity_delta,
               balance_after, actor_id, actor_role, reference, notes
             ) VALUES ($1, $2, $3, 'RESERVATION_HOLD', $4, $5, $6, 'CUSTOMER', $7, 'Order checkout hold')`,
            [
              booking.tenant_id,
              input.venue_id,
              prod.id,
              item.quantity,
              onHand, // balance on hand does not change on hold, only reserved increases
              customerId,
              reqId,
            ],
          );
        }

        const unitPrice = Number(prod.price_minor);
        const lineTotal = unitPrice * item.quantity;
        totalMinor += lineTotal;

        orderItemsToInsert.push({
          product_id: prod.id,
          title: prod.title,
          unit_price_minor: unitPrice,
          quantity: item.quantity,
          line_total_minor: lineTotal,
          restricted_product_type: prod.restricted_product_type || 'NONE',
          age_verification_required: Boolean(prod.age_verification_required),
          tax_category: prod.tax_category || 'STANDARD',
        });
      }

      // 4. Generate order public code and pickup code
      const publicCode = generateCrockfordCode('ORD', 6);
      const pickupCode =
        input.fulfillment_mode === 'BAR_PICKUP' ? generateCrockfordCode('PK', 4) : null;

      // 5. Insert order row in PAYMENT_PENDING
      const insOrderRes = await client.query<any>(
        `INSERT INTO orders (
           tenant_id, venue_id, booking_id, customer_id, public_code,
           order_type, fulfillment_mode, target_resource_id, pickup_code,
           status, total_minor, currency, notes
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PAYMENT_PENDING', $10, 'RON', $11)
         RETURNING *`,
        [
          booking.tenant_id,
          input.venue_id,
          booking.id,
          customerId,
          publicCode,
          cartVal.order_type,
          input.fulfillment_mode,
          input.target_resource_id || null,
          pickupCode,
          totalMinor,
          input.notes || null,
        ],
      );
      const order = insOrderRes.rows[0];

      // 6. Insert order items
      for (const item of orderItemsToInsert) {
        await client.query(
          `INSERT INTO order_items (
             order_id, product_id, title, unit_price_minor,
             quantity, line_total_minor, restricted_product_type,
             age_verification_required, tax_category
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            order.id,
            item.product_id,
            item.title,
            item.unit_price_minor,
            item.quantity,
            item.line_total_minor,
            item.restricted_product_type,
            item.age_verification_required,
            item.tax_category,
          ],
        );
      }

      // 7. Create PSP payment intent
      const pspProvider = input.psp_provider || 'sandbox';
      const intentRes = await this.paymentsService.createIntent(
        booking.tenant_id,
        input.venue_id,
        {
          amountMinor: totalMinor,
          currency: 'RON',
          reference: order.public_code,
          idempotencyKey: input.idempotency_key || `order-checkout-${order.id}`,
          metadata: {
            order_id: order.id,
            booking_id: booking.id,
            customer_id: customerId,
          },
        },
        pspProvider,
        null,
        null,
        booking.id,
        client,
      );

      // Link payment_intent_id to order
      await client.query(
        'UPDATE orders SET payment_intent_id = $1 WHERE id = $2',
        [intentRes.intentId, order.id],
      );

      // Update payment_intents row to link order_id
      await client.query(
        'UPDATE payment_intents SET order_id = $1 WHERE id = $2',
        [order.id, intentRes.intentId],
      );

      // 8. Audit & Outbox events
      await client.query(
        `INSERT INTO audit_events (
           tenant_id, venue_id, request_id, actor_id, actor_role,
           action, target_type, target_id, metadata
         ) VALUES ($1, $2, $3, $4, 'CUSTOMER', 'ORDER_CHECKOUT_INITIATED', 'ORDER', $5, $6)`,
        [
          booking.tenant_id,
          input.venue_id,
          reqId,
          customerId,
          order.id,
          JSON.stringify({
            public_code: order.public_code,
            total_minor: totalMinor,
            order_type: cartVal.order_type,
          }),
        ],
      );

      await client.query(
        `INSERT INTO outbox_events (
           tenant_id, aggregate_type, aggregate_id, event_type, payload
         ) VALUES ($1, 'ORDER', $2, 'OrderPlaced', $3)`,
        [
          booking.tenant_id,
          order.id,
          JSON.stringify({
            order_id: order.id,
            public_code: order.public_code,
            booking_id: booking.id,
            total_minor: totalMinor,
            status: 'PAYMENT_PENDING',
          }),
        ],
      );

      await client.query('COMMIT');

      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      return {
        order_id: order.id,
        public_code: order.public_code,
        pickup_code: order.pickup_code,
        status: 'PAYMENT_PENDING',
        order_type: order.order_type,
        fulfillment_mode: order.fulfillment_mode,
        total_minor: Number(order.total_minor),
        currency: order.currency,
        payment_intent_id: intentRes.intentId,
        provider_ref: intentRes.providerRef,
        expires_at: expiresAt,
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // Payment Capture & Confirmation
  // ---------------------------------------------------------------------------

  async handleOrderPaymentCaptured(
    providerRef: string,
    requestId?: string,
  ): Promise<OrderDetail> {
    const pool = getPool();
    const reqId = requestId || randomUUID();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const piRes = await client.query<any>(
        'SELECT * FROM payment_intents WHERE provider_ref = $1 FOR UPDATE',
        [providerRef],
      );
      if (piRes.rows.length === 0) {
        throw new AuthHttpError(
          HttpStatus.NOT_FOUND,
          'PAYMENT_INTENT_NOT_FOUND',
          'Payment intent not found.',
        );
      }
      const pi = piRes.rows[0];

      let orderId = pi.order_id || (pi.metadata as any)?.order_id;
      if (!orderId) {
        throw new AuthHttpError(
          HttpStatus.BAD_REQUEST,
          'NOT_AN_ORDER_PAYMENT',
          'This payment intent is not linked to a consumables order.',
        );
      }

      const oRes = await client.query<any>(
        'SELECT * FROM orders WHERE id = $1 FOR UPDATE',
        [orderId],
      );
      if (oRes.rows.length === 0) {
        throw new AuthHttpError(HttpStatus.NOT_FOUND, 'ORDER_NOT_FOUND', 'Order not found.');
      }
      const order = oRes.rows[0];

      // Idempotency: if already PLACED or further, return
      if (order.status !== 'PAYMENT_PENDING') {
        await client.query('COMMIT');
        return this.getOrderById(order.id);
      }

      await client.query(
        "UPDATE payment_intents SET status = 'CAPTURED', updated_at = now() WHERE id = $1",
        [pi.id],
      );

      const updatedRes = await client.query<any>(
        "UPDATE orders SET status = 'PLACED', payment_intent_id = $1, updated_at = now() WHERE id = $2 RETURNING *",
        [pi.id, order.id],
      );
      const updated = updatedRes.rows[0];

      await client.query(
        `INSERT INTO audit_events (
           tenant_id, venue_id, request_id, actor_id, actor_role,
           action, target_type, target_id, metadata
         ) VALUES ($1, $2, $3, $4, 'SYSTEM', 'ORDER_PAID_AND_PLACED', 'ORDER', $5, $6)`,
        [
          order.tenant_id,
          order.venue_id,
          reqId,
          order.customer_id,
          order.id,
          JSON.stringify({ public_code: order.public_code, amount_minor: order.total_minor }),
        ],
      );

      await client.query(
        `INSERT INTO outbox_events (
           tenant_id, aggregate_type, aggregate_id, event_type, payload
         ) VALUES ($1, 'ORDER', $2, 'OrderConfirmed', $3)`,
        [
          order.tenant_id,
          order.id,
          JSON.stringify({
            order_id: order.id,
            public_code: order.public_code,
            status: 'PLACED',
          }),
        ],
      );

      await client.query('COMMIT');
      return this.getOrderById(order.id);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // Cancellation & Stock Release
  // ---------------------------------------------------------------------------

  async cancelOrder(
    venueId: string,
    orderId: string,
    actorId: string,
    actorRole: string,
    reason: string,
    requestId?: string,
  ): Promise<OrderDetail> {
    const pool = getPool();
    const reqId = requestId || randomUUID();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const oRes = await client.query<any>(
        'SELECT * FROM orders WHERE id = $1 AND venue_id = $2 FOR UPDATE',
        [orderId, venueId],
      );
      if (oRes.rows.length === 0) {
        throw new AuthHttpError(HttpStatus.NOT_FOUND, 'ORDER_NOT_FOUND', 'Order not found.');
      }
      const order = oRes.rows[0];

      if (order.status === 'CANCELLED') {
        await client.query('COMMIT');
        return this.getOrderById(order.id);
      }

      if (['HANDED_OFF'].includes(order.status)) {
        throw new AuthHttpError(
          HttpStatus.BAD_REQUEST,
          'ORDER_ALREADY_HANDED_OFF',
          'Cannot cancel an order that has already been handed off.',
        );
      }

      // 1. Release reserved stock if order was in PAYMENT_PENDING or PLACED
      const itemsRes = await client.query<any>(
        `SELECT oi.*, p.inventory_tracking, p.stock_on_hand
           FROM order_items oi
           JOIN products p ON p.id = oi.product_id
          WHERE oi.order_id = $1 AND oi.status = 'ACTIVE'`,
        [orderId],
      );

      for (const item of itemsRes.rows) {
        if (item.inventory_tracking) {
          await client.query(
            'UPDATE products SET stock_reserved = GREATEST(0, stock_reserved - $1), updated_at = now() WHERE id = $2',
            [item.quantity, item.product_id],
          );

          await client.query(
            `INSERT INTO stock_movements (
               tenant_id, venue_id, product_id, movement_type, quantity_delta,
               balance_after, actor_id, actor_role, reference, notes
             ) VALUES ($1, $2, $3, 'RESERVATION_RELEASE', $4, $5, $6, $7, $8, $9)`,
            [
              order.tenant_id,
              venueId,
              item.product_id,
              -item.quantity,
              item.stock_on_hand,
              actorId,
              actorRole,
              orderId,
              `Order cancelled: ${reason}`,
            ],
          );
        }
      }

      // 2. Update order status
      const updatedRes = await client.query<any>(
        "UPDATE orders SET status = 'CANCELLED', cancellation_reason = $1, updated_at = now() WHERE id = $2 RETURNING *",
        [reason, orderId],
      );
      const updated = updatedRes.rows[0];

      await client.query(
        `INSERT INTO audit_events (
           tenant_id, venue_id, request_id, actor_id, actor_role,
           action, target_type, target_id, metadata
         ) VALUES ($1, $2, $3, $4, $5, 'ORDER_CANCELLED', 'ORDER', $6, $7)`,
        [
          order.tenant_id,
          venueId,
          reqId,
          actorId,
          actorRole,
          orderId,
          JSON.stringify({ reason }),
        ],
      );

      await client.query(
        `INSERT INTO outbox_events (
           tenant_id, aggregate_type, aggregate_id, event_type, payload
         ) VALUES ($1, 'ORDER', $2, 'OrderCancelled', $3)`,
        [
          order.tenant_id,
          order.id,
          JSON.stringify({ order_id: order.id, reason }),
        ],
      );

      await client.query('COMMIT');
      return this.getOrderById(orderId);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  async getOrderById(
    orderId: string,
    callerUserId?: string,
    venueId?: string,
  ): Promise<OrderDetail> {
    const pool = getPool();
    const query = `
      SELECT o.*, b.public_code as booking_public_code, u.email as customer_email,
             r.name as target_resource_name, pi.status as payment_status
        FROM orders o
        JOIN bookings b ON b.id = o.booking_id
        LEFT JOIN users u ON u.id = o.customer_id
        LEFT JOIN resources r ON r.id = o.target_resource_id
        LEFT JOIN payment_intents pi ON pi.id = o.payment_intent_id
       WHERE o.id = $1 ${venueId ? 'AND o.venue_id = $2' : ''}
    `;
    const params = venueId ? [orderId, venueId] : [orderId];
    const res = await pool.query<any>(query, params);

    if (res.rows.length === 0) {
      throw new AuthHttpError(HttpStatus.NOT_FOUND, 'ORDER_NOT_FOUND', 'Order not found.');
    }
    const order = res.rows[0];

    // Ownership check if requested by customer
    if (callerUserId && callerUserId !== order.customer_id) {
      // Check if user is venue staff
      const staffRes = await pool.query(
        'SELECT role FROM venue_memberships WHERE venue_id = $1 AND user_id = $2 AND active = true',
        [order.venue_id, callerUserId],
      );
      if (staffRes.rows.length === 0) {
        throw new AuthHttpError(
          HttpStatus.FORBIDDEN,
          'FORBIDDEN',
          'You are not authorized to view this order.',
        );
      }
    }

    const itemsRes = await pool.query<any>(
      'SELECT * FROM order_items WHERE order_id = $1 ORDER BY title ASC',
      [orderId],
    );

    return this.mapOrderDetail(order, itemsRes.rows);
  }

  async listCustomerOrders(
    customerId: string,
    bookingId?: string,
  ): Promise<OrderDetail[]> {
    const pool = getPool();
    const conditions = ['o.customer_id = $1'];
    const params: any[] = [customerId];

    if (bookingId) {
      conditions.push('o.booking_id = $2');
      params.push(bookingId);
    }

    const res = await pool.query<any>(
      `SELECT o.*, b.public_code as booking_public_code, r.name as target_resource_name
         FROM orders o
         JOIN bookings b ON b.id = o.booking_id
         LEFT JOIN resources r ON r.id = o.target_resource_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY o.created_at DESC`,
      params,
    );

    const orders: OrderDetail[] = [];
    for (const row of res.rows) {
      const itemsRes = await pool.query<any>(
        'SELECT * FROM order_items WHERE order_id = $1',
        [row.id],
      );
      orders.push(this.mapOrderDetail(row, itemsRes.rows));
    }
    return orders;
  }

  async listOrders(venueId: string, filter: OrderFilterQuery): Promise<OrderListResult> {
    const pool = getPool();
    const conditions = ['o.venue_id = $1'];
    const params: any[] = [venueId];
    let pIdx = 2;

    if (filter.status) {
      conditions.push(`o.status = $${pIdx++}`);
      params.push(filter.status);
    }
    if (filter.order_type) {
      conditions.push(`o.order_type = $${pIdx++}`);
      params.push(filter.order_type);
    }
    if (filter.booking_id) {
      conditions.push(`o.booking_id = $${pIdx++}`);
      params.push(filter.booking_id);
    }
    if (filter.customer_id) {
      conditions.push(`o.customer_id = $${pIdx++}`);
      params.push(filter.customer_id);
    }
    if (filter.from) {
      conditions.push(`o.created_at >= $${pIdx++}`);
      params.push(new Date(filter.from));
    }
    if (filter.to) {
      conditions.push(`o.created_at <= $${pIdx++}`);
      params.push(new Date(filter.to));
    }

    const whereClause = conditions.join(' AND ');
    const limit = Math.min(Math.max(filter.limit || 50, 1), 100);
    const offset = Math.max((filter.page || 1) - 1, 0) * limit;

    const query = `
      SELECT o.*, b.public_code as booking_public_code, u.email as customer_email,
             r.name as target_resource_name
        FROM orders o
        JOIN bookings b ON b.id = o.booking_id
        LEFT JOIN users u ON u.id = o.customer_id
        LEFT JOIN resources r ON r.id = o.target_resource_id
       WHERE ${whereClause}
       ORDER BY o.created_at DESC
       LIMIT ${limit} OFFSET ${offset}
    `;
    const res = await pool.query<any>(query, params);

    const orders: OrderDetail[] = [];
    for (const row of res.rows) {
      const itemsRes = await pool.query<any>(
        'SELECT * FROM order_items WHERE order_id = $1',
        [row.id],
      );
      orders.push(this.mapOrderDetail(row, itemsRes.rows));
    }

    const sumRes = await pool.query<any>(
      `SELECT
         COUNT(*) as total_count,
         COALESCE(SUM(CASE WHEN status NOT IN ('CANCELLED', 'PAYMENT_PENDING') THEN total_minor ELSE 0 END), 0) as total_revenue_minor,
         COUNT(CASE WHEN status = 'PLACED' THEN 1 END) as count_placed,
         COUNT(CASE WHEN status = 'ACCEPTED' THEN 1 END) as count_accepted,
         COUNT(CASE WHEN status = 'PREPARING' THEN 1 END) as count_preparing,
         COUNT(CASE WHEN status = 'READY' THEN 1 END) as count_ready,
         COUNT(CASE WHEN status = 'HANDED_OFF' THEN 1 END) as count_handed_off,
         COUNT(CASE WHEN status = 'CANCELLED' THEN 1 END) as count_cancelled
        FROM orders o
       WHERE ${whereClause}`,
      params,
    );
    const sum = sumRes.rows[0];

    return {
      orders,
      total_count: Number(sum?.total_count || 0),
      summary: {
        total_revenue_minor: Number(sum?.total_revenue_minor || 0),
        count_by_status: {
          PLACED: Number(sum?.count_placed || 0),
          ACCEPTED: Number(sum?.count_accepted || 0),
          PREPARING: Number(sum?.count_preparing || 0),
          READY: Number(sum?.count_ready || 0),
          HANDED_OFF: Number(sum?.count_handed_off || 0),
          CANCELLED: Number(sum?.count_cancelled || 0),
        },
      },
    };
  }

  // ---------------------------------------------------------------------------
  // ENG-403: Bar Board Queue & Order State Machine
  // ---------------------------------------------------------------------------

  async getBarBoard(
    venueId: string,
    filter?: { fulfillment_mode?: FulfillmentMode; status?: OrderStatus },
  ): Promise<BarBoardSummary> {
    const pool = getPool();
    const conditions = ["o.venue_id = $1 AND o.status IN ('PLACED', 'ACCEPTED', 'PREPARING', 'READY')"];
    const params: any[] = [venueId];
    let pIdx = 2;

    if (filter?.fulfillment_mode) {
      conditions.push(`o.fulfillment_mode = $${pIdx++}`);
      params.push(filter.fulfillment_mode);
    }
    if (filter?.status) {
      conditions.push(`o.status = $${pIdx++}`);
      params.push(filter.status);
    }

    const whereClause = conditions.join(' AND ');
    const query = `
      SELECT o.*, b.public_code as booking_public_code, u.email as customer_email,
             r.name as target_resource_name
        FROM orders o
        JOIN bookings b ON b.id = o.booking_id
        LEFT JOIN users u ON u.id = o.customer_id
        LEFT JOIN resources r ON r.id = o.target_resource_id
       WHERE ${whereClause}
       ORDER BY o.created_at ASC
    `;
    const res = await pool.query<any>(query, params);

    const queue: OrderDetail[] = [];
    let placedCount = 0;
    let acceptedCount = 0;
    let preparingCount = 0;
    let readyCount = 0;
    let overdueCount = 0;

    for (const row of res.rows) {
      const itemsRes = await pool.query<any>(
        'SELECT * FROM order_items WHERE order_id = $1 ORDER BY title ASC',
        [row.id],
      );
      const detail = this.mapOrderDetail(row, itemsRes.rows);
      if (detail.status === 'PLACED') placedCount++;
      else if (detail.status === 'ACCEPTED') acceptedCount++;
      else if (detail.status === 'PREPARING') preparingCount++;
      else if (detail.status === 'READY') readyCount++;

      if (detail.sla_status === 'OVERDUE') overdueCount++;
      queue.push(detail);
    }

    return {
      placed_count: placedCount,
      accepted_count: acceptedCount,
      preparing_count: preparingCount,
      ready_count: readyCount,
      overdue_count: overdueCount,
      queue,
    };
  }

  async acceptOrder(
    venueId: string,
    orderId: string,
    staffId: string,
    staffRole: string,
    requestId?: string,
  ): Promise<OrderDetail> {
    const pool = getPool();
    const reqId = requestId || randomUUID();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const oRes = await client.query<any>(
        'SELECT * FROM orders WHERE id = $1 AND venue_id = $2 FOR UPDATE',
        [orderId, venueId],
      );
      if (oRes.rows.length === 0) {
        throw new AuthHttpError(HttpStatus.NOT_FOUND, 'ORDER_NOT_FOUND', 'Order not found.');
      }
      const order = oRes.rows[0];

      if (order.status !== 'PLACED') {
        throw new AuthHttpError(
          HttpStatus.BAD_REQUEST,
          'INVALID_ORDER_STATE',
          `Cannot accept order in status '${order.status}'. Expected 'PLACED'.`,
        );
      }

      await client.query(
        "UPDATE orders SET status = 'ACCEPTED', accepted_by = $1, accepted_at = now(), updated_at = now() WHERE id = $2",
        [staffId, orderId],
      );

      await client.query(
        `INSERT INTO audit_events (
           tenant_id, venue_id, request_id, actor_id, actor_role,
           action, target_type, target_id, metadata
         ) VALUES ($1, $2, $3, $4, $5, 'ORDER_ACCEPTED', 'ORDER', $6, $7)`,
        [order.tenant_id, venueId, reqId, staffId, staffRole, orderId, JSON.stringify({ public_code: order.public_code })],
      );

      await client.query(
        `INSERT INTO outbox_events (
           tenant_id, aggregate_type, aggregate_id, event_type, payload
         ) VALUES ($1, 'ORDER', $2, 'OrderAccepted', $3)`,
        [order.tenant_id, orderId, JSON.stringify({ order_id: orderId, public_code: order.public_code, status: 'ACCEPTED' })],
      );

      await client.query('COMMIT');
      return this.getOrderById(orderId);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async prepareOrder(
    venueId: string,
    orderId: string,
    staffId: string,
    staffRole: string,
    requestId?: string,
  ): Promise<OrderDetail> {
    const pool = getPool();
    const reqId = requestId || randomUUID();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const oRes = await client.query<any>(
        'SELECT * FROM orders WHERE id = $1 AND venue_id = $2 FOR UPDATE',
        [orderId, venueId],
      );
      if (oRes.rows.length === 0) {
        throw new AuthHttpError(HttpStatus.NOT_FOUND, 'ORDER_NOT_FOUND', 'Order not found.');
      }
      const order = oRes.rows[0];

      if (order.status !== 'ACCEPTED') {
        throw new AuthHttpError(
          HttpStatus.BAD_REQUEST,
          'INVALID_ORDER_STATE',
          `Cannot prepare order in status '${order.status}'. Expected 'ACCEPTED'.`,
        );
      }

      await client.query(
        "UPDATE orders SET status = 'PREPARING', prepared_by = $1, prepared_at = now(), updated_at = now() WHERE id = $2",
        [staffId, orderId],
      );

      await client.query(
        `INSERT INTO audit_events (
           tenant_id, venue_id, request_id, actor_id, actor_role,
           action, target_type, target_id, metadata
         ) VALUES ($1, $2, $3, $4, $5, 'ORDER_PREPARING', 'ORDER', $6, $7)`,
        [order.tenant_id, venueId, reqId, staffId, staffRole, orderId, JSON.stringify({ public_code: order.public_code })],
      );

      await client.query(
        `INSERT INTO outbox_events (
           tenant_id, aggregate_type, aggregate_id, event_type, payload
         ) VALUES ($1, 'ORDER', $2, 'OrderPreparing', $3)`,
        [order.tenant_id, orderId, JSON.stringify({ order_id: orderId, public_code: order.public_code, status: 'PREPARING' })],
      );

      await client.query('COMMIT');
      return this.getOrderById(orderId);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async markOrderReady(
    venueId: string,
    orderId: string,
    staffId: string,
    staffRole: string,
    requestId?: string,
  ): Promise<OrderDetail> {
    const pool = getPool();
    const reqId = requestId || randomUUID();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const oRes = await client.query<any>(
        'SELECT * FROM orders WHERE id = $1 AND venue_id = $2 FOR UPDATE',
        [orderId, venueId],
      );
      if (oRes.rows.length === 0) {
        throw new AuthHttpError(HttpStatus.NOT_FOUND, 'ORDER_NOT_FOUND', 'Order not found.');
      }
      const order = oRes.rows[0];

      if (order.status !== 'PREPARING') {
        throw new AuthHttpError(
          HttpStatus.BAD_REQUEST,
          'INVALID_ORDER_STATE',
          `Cannot mark order ready in status '${order.status}'. Expected 'PREPARING'.`,
        );
      }

      await client.query(
        "UPDATE orders SET status = 'READY', ready_at = now(), updated_at = now() WHERE id = $1",
        [orderId],
      );

      await client.query(
        `INSERT INTO audit_events (
           tenant_id, venue_id, request_id, actor_id, actor_role,
           action, target_type, target_id, metadata
         ) VALUES ($1, $2, $3, $4, $5, 'ORDER_READY', 'ORDER', $6, $7)`,
        [order.tenant_id, venueId, reqId, staffId, staffRole, orderId, JSON.stringify({ public_code: order.public_code })],
      );

      await client.query(
        `INSERT INTO outbox_events (
           tenant_id, aggregate_type, aggregate_id, event_type, payload
         ) VALUES ($1, 'ORDER', $2, 'OrderReady', $3)`,
        [order.tenant_id, orderId, JSON.stringify({ order_id: orderId, public_code: order.public_code, status: 'READY' })],
      );

      await client.query('COMMIT');
      return this.getOrderById(orderId);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async handoffOrder(
    venueId: string,
    orderId: string,
    staffId: string,
    staffRole: string,
    input?: HandoffOrderInput,
    requestId?: string,
  ): Promise<OrderDetail> {
    const pool = getPool();
    const reqId = requestId || randomUUID();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const oRes = await client.query<any>(
        'SELECT * FROM orders WHERE id = $1 AND venue_id = $2 FOR UPDATE',
        [orderId, venueId],
      );
      if (oRes.rows.length === 0) {
        throw new AuthHttpError(HttpStatus.NOT_FOUND, 'ORDER_NOT_FOUND', 'Order not found.');
      }
      const order = oRes.rows[0];

      // Idempotency: if already HANDED_OFF, return immediately (do not duplicate stock deduction)
      if (order.status === 'HANDED_OFF') {
        await client.query('COMMIT');
        return this.getOrderById(orderId);
      }

      if (!['READY', 'ACCEPTED'].includes(order.status)) {
        throw new AuthHttpError(
          HttpStatus.BAD_REQUEST,
          'INVALID_ORDER_STATE',
          `Cannot handoff order in status '${order.status}'. Expected 'READY' or 'ACCEPTED'.`,
        );
      }

      // Pickup code validation for counter pickups
      if (order.fulfillment_mode === 'BAR_PICKUP') {
        const cleanGiven = input?.pickup_code?.trim().toUpperCase();
        const cleanActual = order.pickup_code?.trim().toUpperCase();
        if (!cleanGiven || cleanGiven !== cleanActual) {
          throw new AuthHttpError(
            HttpStatus.BAD_REQUEST,
            'INVALID_PICKUP_CODE',
            'Pickup code is invalid or missing.',
          );
        }
      }

      // Check active items and age verification requirement across active items
      const itemsRes = await client.query<any>(
        `SELECT oi.*, p.inventory_tracking, p.stock_on_hand, p.stock_reserved
           FROM order_items oi
           JOIN products p ON p.id = oi.product_id
          WHERE oi.order_id = $1 AND oi.status = 'ACTIVE'`,
        [orderId],
      );

      if (itemsRes.rows.length === 0) {
        throw new AuthHttpError(
          HttpStatus.BAD_REQUEST,
          'NO_ACTIVE_ITEMS_TO_FULFILL',
          'All items in this order have been cancelled or refunded.',
        );
      }

      const hasAgeRestricted = itemsRes.rows.some((i) => i.age_verification_required);
      if (hasAgeRestricted && input?.age_verified !== true) {
        throw new AuthHttpError(
          HttpStatus.BAD_REQUEST,
          'AGE_VERIFICATION_REQUIRED',
          'Staff age verification is required before handing off age-restricted items (Law 42/2024).',
        );
      }

      // Atomic inventory deduction: decrement on_hand and reserved, log ORDER_DEDUCT movement
      for (const item of itemsRes.rows) {
        if (item.inventory_tracking) {
          const qty = Number(item.quantity);
          const currentOnHand = Number(item.stock_on_hand);
          const newOnHand = Math.max(0, currentOnHand - qty);
          const newReserved = Math.max(0, Number(item.stock_reserved) - qty);

          await client.query(
            'UPDATE products SET stock_on_hand = $1, stock_reserved = $2, updated_at = now() WHERE id = $3',
            [newOnHand, newReserved, item.product_id],
          );

          await client.query(
            `INSERT INTO stock_movements (
               tenant_id, venue_id, product_id, movement_type, quantity_delta,
               balance_after, actor_id, actor_role, reference, notes
             ) VALUES ($1, $2, $3, 'ORDER_DEDUCT', $4, $5, $6, $7, $8, 'Order fulfilled and handed off')`,
            [
              order.tenant_id,
              venueId,
              item.product_id,
              -qty,
              newOnHand,
              staffId,
              staffRole,
              order.public_code,
            ],
          );
        }
      }

      // Update order status to HANDED_OFF
      const ageVerifiedAt = hasAgeRestricted ? new Date() : null;
      const ageVerifiedBy = hasAgeRestricted ? staffId : null;

      await client.query(
        `UPDATE orders
            SET status = 'HANDED_OFF',
                handed_off_by = $1,
                handed_off_at = now(),
                age_verified_by = COALESCE($2, age_verified_by),
                age_verified_at = COALESCE($3, age_verified_at),
                updated_at = now()
          WHERE id = $4`,
        [staffId, ageVerifiedBy, ageVerifiedAt, orderId],
      );

      await client.query(
        `INSERT INTO audit_events (
           tenant_id, venue_id, request_id, actor_id, actor_role,
           action, target_type, target_id, metadata
         ) VALUES ($1, $2, $3, $4, $5, 'ORDER_HANDED_OFF', 'ORDER', $6, $7)`,
        [
          order.tenant_id,
          venueId,
          reqId,
          staffId,
          staffRole,
          orderId,
          JSON.stringify({
            public_code: order.public_code,
            fulfillment_mode: order.fulfillment_mode,
            age_verified: hasAgeRestricted,
          }),
        ],
      );

      await client.query(
        `INSERT INTO outbox_events (
           tenant_id, aggregate_type, aggregate_id, event_type, payload
         ) VALUES ($1, 'ORDER', $2, 'OrderHandedOff', $3)`,
        [
          order.tenant_id,
          orderId,
          JSON.stringify({
            order_id: orderId,
            public_code: order.public_code,
            status: 'HANDED_OFF',
          }),
        ],
      );

      await client.query('COMMIT');
      return this.getOrderById(orderId);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async rejectOrder(
    venueId: string,
    orderId: string,
    staffId: string,
    staffRole: string,
    input: RejectOrderInput,
    requestId?: string,
  ): Promise<OrderDetail> {
    const pool = getPool();
    const reqId = requestId || randomUUID();

    if (!input.reason || input.reason.trim().length === 0) {
      throw new AuthHttpError(
        HttpStatus.BAD_REQUEST,
        'MISSING_REJECTION_REASON',
        'Rejection reason is required.',
      );
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const oRes = await client.query<any>(
        'SELECT * FROM orders WHERE id = $1 AND venue_id = $2 FOR UPDATE',
        [orderId, venueId],
      );
      if (oRes.rows.length === 0) {
        throw new AuthHttpError(HttpStatus.NOT_FOUND, 'ORDER_NOT_FOUND', 'Order not found.');
      }
      const order = oRes.rows[0];

      if (['HANDED_OFF', 'CANCELLED'].includes(order.status)) {
        throw new AuthHttpError(
          HttpStatus.BAD_REQUEST,
          'INVALID_ORDER_STATE',
          `Cannot reject order in status '${order.status}'.`,
        );
      }

      // 1. Release reserved stock
      const itemsRes = await client.query<any>(
        `SELECT oi.*, p.inventory_tracking, p.stock_on_hand
           FROM order_items oi
           JOIN products p ON p.id = oi.product_id
          WHERE oi.order_id = $1 AND oi.status = 'ACTIVE'`,
        [orderId],
      );

      for (const item of itemsRes.rows) {
        if (item.inventory_tracking) {
          const qty = Number(item.quantity);
          await client.query(
            'UPDATE products SET stock_reserved = GREATEST(0, stock_reserved - $1), updated_at = now() WHERE id = $2',
            [qty, item.product_id],
          );

          await client.query(
            `INSERT INTO stock_movements (
               tenant_id, venue_id, product_id, movement_type, quantity_delta,
               balance_after, actor_id, actor_role, reference, notes
             ) VALUES ($1, $2, $3, 'RESERVATION_RELEASE', $4, $5, $6, $7, $8, $9)`,
            [
              order.tenant_id,
              venueId,
              item.product_id,
              -qty,
              item.stock_on_hand,
              staffId,
              staffRole,
              order.public_code,
              `Order rejected by staff: ${input.reason.trim()}`,
            ],
          );
        }
      }

      // 2. Mark order CANCELLED
      await client.query(
        "UPDATE orders SET status = 'CANCELLED', cancellation_reason = $1, updated_at = now() WHERE id = $2",
        [input.reason.trim(), orderId],
      );

      // 3. Initiate compensating refund for remaining unrefunded active items
      if (order.payment_intent_id && this.refundsService) {
        const unrefundedRes = await client.query<any>(
          `SELECT COALESCE(SUM(line_total_minor), 0) as unrefunded_minor
             FROM order_items
            WHERE order_id = $1 AND status = 'ACTIVE'`,
          [orderId],
        );
        const unrefundedMinor = Number(unrefundedRes.rows[0]?.unrefunded_minor || 0);

        if (unrefundedMinor > 0) {
          try {
            await this.refundsService.requestRefund(
              venueId,
              staffId,
              staffRole,
              {
                payment_intent_id: order.payment_intent_id,
                amount_minor: unrefundedMinor,
                reason: `BAR_ORDER_REJECTED: ${input.reason.trim()}`,
                idempotency_key: `refund-rej-${orderId}`,
              },
              reqId,
            );
          } catch (refundErr) {
            console.error('Compensating refund error on order rejection:', refundErr);
          }
        }
      }

      await client.query(
        `UPDATE order_items
            SET status = 'REFUNDED_UNAVAILABLE',
                refund_reason = $1,
                refunded_amount_minor = line_total_minor,
                refunded_at = now()
          WHERE order_id = $2 AND status = 'ACTIVE'`,
        [`Order rejected: ${input.reason.trim()}`, orderId],
      );

      await client.query(
        `INSERT INTO audit_events (
           tenant_id, venue_id, request_id, actor_id, actor_role,
           action, target_type, target_id, metadata
         ) VALUES ($1, $2, $3, $4, $5, 'ORDER_REJECTED_REFUND_TRIGGERED', 'ORDER', $6, $7)`,
        [
          order.tenant_id,
          venueId,
          reqId,
          staffId,
          staffRole,
          orderId,
          JSON.stringify({ reason: input.reason.trim(), total_minor: order.total_minor }),
        ],
      );

      await client.query(
        `INSERT INTO outbox_events (
           tenant_id, aggregate_type, aggregate_id, event_type, payload
         ) VALUES ($1, 'ORDER', $2, 'OrderRejected', $3)`,
        [
          order.tenant_id,
          orderId,
          JSON.stringify({
            order_id: orderId,
            public_code: order.public_code,
            reason: input.reason.trim(),
          }),
        ],
      );

      await client.query('COMMIT');
      return this.getOrderById(orderId);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // ENG-404: Age Restriction Refusal & Unavailable Product Refunds
  // ---------------------------------------------------------------------------

  async refuseAgeVerification(
    venueId: string,
    orderId: string,
    staffId: string,
    staffRole: string,
    input?: RefuseAgeInput,
    requestId?: string,
  ): Promise<OrderDetail> {
    const pool = getPool();
    const reqId = requestId || randomUUID();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const oRes = await client.query<any>(
        'SELECT * FROM orders WHERE id = $1 AND venue_id = $2 FOR UPDATE',
        [orderId, venueId],
      );
      if (oRes.rows.length === 0) {
        throw new AuthHttpError(HttpStatus.NOT_FOUND, 'ORDER_NOT_FOUND', 'Order not found.');
      }
      const order = oRes.rows[0];

      if (['HANDED_OFF', 'CANCELLED'].includes(order.status)) {
        throw new AuthHttpError(
          HttpStatus.BAD_REQUEST,
          'INVALID_ORDER_STATE',
          `Cannot refuse age verification on order in status '${order.status}'.`,
        );
      }

      const reason = input?.reason?.trim() || 'Age verification failed or ID check refused (Law 42/2024)';

      // 1. Fetch active order items
      const itemsRes = await client.query<any>(
        `SELECT oi.*, p.inventory_tracking, p.stock_on_hand
           FROM order_items oi
           JOIN products p ON p.id = oi.product_id
          WHERE oi.order_id = $1 AND oi.status = 'ACTIVE'`,
        [orderId],
      );

      let targetItems = itemsRes.rows.filter((i) => i.age_verification_required);

      if (input?.line_item_ids && input.line_item_ids.length > 0) {
        const idSet = new Set(input.line_item_ids);
        targetItems = itemsRes.rows.filter((i) => idSet.has(i.id));

        for (const item of targetItems) {
          if (!item.age_verification_required) {
            throw new AuthHttpError(
              HttpStatus.BAD_REQUEST,
              'ITEM_NOT_AGE_RESTRICTED',
              `Item '${item.title}' is not age-restricted.`,
            );
          }
        }
      }

      if (targetItems.length === 0) {
        throw new AuthHttpError(
          HttpStatus.BAD_REQUEST,
          'NO_AGE_RESTRICTED_ITEMS',
          'No active age-restricted items found in this order.',
        );
      }

      // 2. Release reserved stock and issue compensating refunds
      for (const item of targetItems) {
        const qty = Number(item.quantity);
        if (item.inventory_tracking) {
          await client.query(
            'UPDATE products SET stock_reserved = GREATEST(0, stock_reserved - $1), updated_at = now() WHERE id = $2',
            [qty, item.product_id],
          );

          await client.query(
            `INSERT INTO stock_movements (
               tenant_id, venue_id, product_id, movement_type, quantity_delta,
               balance_after, actor_id, actor_role, reference, notes
             ) VALUES ($1, $2, $3, 'RESERVATION_RELEASE', $4, $5, $6, $7, $8, $9)`,
            [
              order.tenant_id,
              venueId,
              item.product_id,
              -qty,
              item.stock_on_hand,
              staffId,
              staffRole,
              order.public_code,
              `Law 42/2024 age check failed: ${reason}`,
            ],
          );
        }

        let refundId: string | null = null;
        if (order.payment_intent_id && this.refundsService) {
          try {
            const refundRes = await this.refundsService.requestRefund(
              venueId,
              staffId,
              staffRole,
              {
                payment_intent_id: order.payment_intent_id,
                amount_minor: Number(item.line_total_minor),
                reason: `AGE_RESTRICTION_REFUSED: ${reason}`,
                idempotency_key: `refund-age-${orderId}-${item.id}`,
              },
              reqId,
            );
            refundId = refundRes.id;
          } catch (refundErr) {
            console.error('Refund error during age verification refusal:', refundErr);
          }
        }

        await client.query(
          `UPDATE order_items
              SET status = 'REFUSED_AGE_RESTRICTION',
                  refund_id = $1,
                  refunded_amount_minor = $2,
                  refund_reason = $3,
                  refunded_at = now()
            WHERE id = $4`,
          [refundId, Number(item.line_total_minor), reason, item.id],
        );
      }

      // 3. Check if all items in the order are now inactive
      const activeCheck = await client.query<any>(
        "SELECT COUNT(*) as count FROM order_items WHERE order_id = $1 AND status = 'ACTIVE'",
        [orderId],
      );
      const remainingActive = Number(activeCheck.rows[0]?.count || 0);

      if (remainingActive === 0) {
        await client.query(
          "UPDATE orders SET status = 'CANCELLED', cancellation_reason = $1, updated_at = now() WHERE id = $2",
          [`Age verification failed: ${reason}`, orderId],
        );
      }

      await client.query(
        `INSERT INTO audit_events (
           tenant_id, venue_id, request_id, actor_id, actor_role,
           action, target_type, target_id, metadata
         ) VALUES ($1, $2, $3, $4, $5, 'ORDER_AGE_VERIFICATION_REFUSED', 'ORDER', $6, $7)`,
        [
          order.tenant_id,
          venueId,
          reqId,
          staffId,
          staffRole,
          orderId,
          JSON.stringify({
            reason,
            refused_items_count: targetItems.length,
            remaining_active_items: remainingActive,
          }),
        ],
      );

      await client.query(
        `INSERT INTO outbox_events (
           tenant_id, aggregate_type, aggregate_id, event_type, payload
         ) VALUES ($1, 'ORDER', $2, 'OrderAgeVerificationRefused', $3)`,
        [
          order.tenant_id,
          orderId,
          JSON.stringify({
            order_id: orderId,
            public_code: order.public_code,
            refused_items: targetItems.map((i) => i.id),
            order_cancelled: remainingActive === 0,
          }),
        ],
      );

      await client.query('COMMIT');
      return this.getOrderById(orderId);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async cancelUnavailableItem(
    venueId: string,
    orderId: string,
    itemId: string,
    staffId: string,
    staffRole: string,
    input: CancelUnavailableItemInput,
    requestId?: string,
  ): Promise<OrderDetail> {
    const pool = getPool();
    const reqId = requestId || randomUUID();

    if (!input?.reason || input.reason.trim().length === 0) {
      throw new AuthHttpError(
        HttpStatus.BAD_REQUEST,
        'MISSING_CANCELLATION_REASON',
        'Cancellation reason is required.',
      );
    }
    const reason = input.reason.trim();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const oRes = await client.query<any>(
        'SELECT * FROM orders WHERE id = $1 AND venue_id = $2 FOR UPDATE',
        [orderId, venueId],
      );
      if (oRes.rows.length === 0) {
        throw new AuthHttpError(HttpStatus.NOT_FOUND, 'ORDER_NOT_FOUND', 'Order not found.');
      }
      const order = oRes.rows[0];

      if (['HANDED_OFF', 'CANCELLED'].includes(order.status)) {
        throw new AuthHttpError(
          HttpStatus.BAD_REQUEST,
          'INVALID_ORDER_STATE',
          `Cannot cancel items on order in status '${order.status}'.`,
        );
      }

      const itemRes = await client.query<any>(
        `SELECT oi.*, p.inventory_tracking, p.stock_on_hand
           FROM order_items oi
           JOIN products p ON p.id = oi.product_id
          WHERE oi.id = $1 AND oi.order_id = $2
          FOR UPDATE`,
        [itemId, orderId],
      );

      if (itemRes.rows.length === 0) {
        throw new AuthHttpError(HttpStatus.NOT_FOUND, 'ORDER_ITEM_NOT_FOUND', 'Order item not found.');
      }
      const item = itemRes.rows[0];

      if (item.status !== 'ACTIVE') {
        throw new AuthHttpError(
          HttpStatus.BAD_REQUEST,
          'ITEM_ALREADY_CANCELLED',
          `Item '${item.title}' is already in status '${item.status}'.`,
        );
      }

      // Release reserved stock
      const qty = Number(item.quantity);
      if (item.inventory_tracking) {
        await client.query(
          'UPDATE products SET stock_reserved = GREATEST(0, stock_reserved - $1), updated_at = now() WHERE id = $2',
          [qty, item.product_id],
        );

        await client.query(
          `INSERT INTO stock_movements (
             tenant_id, venue_id, product_id, movement_type, quantity_delta,
             balance_after, actor_id, actor_role, reference, notes
           ) VALUES ($1, $2, $3, 'RESERVATION_RELEASE', $4, $5, $6, $7, $8, $9)`,
          [
            order.tenant_id,
            venueId,
            item.product_id,
            -qty,
            item.stock_on_hand,
            staffId,
            staffRole,
            order.public_code,
            `Item unavailable: ${reason}`,
          ],
        );
      }

      // Compensating refund
      let refundId: string | null = null;
      if (order.payment_intent_id && this.refundsService) {
        try {
          const refundRes = await this.refundsService.requestRefund(
            venueId,
            staffId,
            staffRole,
            {
              payment_intent_id: order.payment_intent_id,
              amount_minor: Number(item.line_total_minor),
              reason: `PRODUCT_UNAVAILABLE: ${reason}`,
              idempotency_key: `refund-unavail-${orderId}-${item.id}`,
            },
            reqId,
          );
          refundId = refundRes.id;
        } catch (refundErr) {
          console.error('Refund error during unavailable product cancellation:', refundErr);
        }
      }

      await client.query(
        `UPDATE order_items
            SET status = 'REFUNDED_UNAVAILABLE',
                refund_id = $1,
                refunded_amount_minor = $2,
                refund_reason = $3,
                refunded_at = now()
          WHERE id = $4`,
        [refundId, Number(item.line_total_minor), reason, item.id],
      );

      // Check if all items in the order are now inactive
      const activeCheck = await client.query<any>(
        "SELECT COUNT(*) as count FROM order_items WHERE order_id = $1 AND status = 'ACTIVE'",
        [orderId],
      );
      const remainingActive = Number(activeCheck.rows[0]?.count || 0);

      if (remainingActive === 0) {
        await client.query(
          "UPDATE orders SET status = 'CANCELLED', cancellation_reason = $1, updated_at = now() WHERE id = $2",
          [`All items unavailable: ${reason}`, orderId],
        );
      }

      await client.query(
        `INSERT INTO audit_events (
           tenant_id, venue_id, request_id, actor_id, actor_role,
           action, target_type, target_id, metadata
         ) VALUES ($1, $2, $3, $4, $5, 'ORDER_ITEM_REFUNDED_UNAVAILABLE', 'ORDER', $6, $7)`,
        [
          order.tenant_id,
          venueId,
          reqId,
          staffId,
          staffRole,
          orderId,
          JSON.stringify({
            item_id: item.id,
            item_title: item.title,
            refunded_amount_minor: item.line_total_minor,
            reason,
            order_cancelled: remainingActive === 0,
          }),
        ],
      );

      await client.query(
        `INSERT INTO outbox_events (
           tenant_id, aggregate_type, aggregate_id, event_type, payload
         ) VALUES ($1, 'ORDER', $2, 'OrderItemRefundedUnavailable', $3)`,
        [
          order.tenant_id,
          orderId,
          JSON.stringify({
            order_id: orderId,
            item_id: item.id,
            item_title: item.title,
            refund_id: refundId,
            order_cancelled: remainingActive === 0,
          }),
        ],
      );

      await client.query('COMMIT');
      return this.getOrderById(orderId);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // Mapper
  // ---------------------------------------------------------------------------

  private mapOrderDetail(row: any, items: any[]): OrderDetail {
    const ageMinutes = Math.round((Date.now() - new Date(row.created_at).getTime()) / 60000);
    const estPrep = Number(row.estimated_prep_minutes || 10);
    const isOverdue =
      ['PLACED', 'ACCEPTED', 'PREPARING'].includes(row.status) &&
      Date.now() - new Date(row.created_at).getTime() > estPrep * 60000;

    return {
      id: row.id,
      public_code: row.public_code,
      tenant_id: row.tenant_id,
      venue_id: row.venue_id,
      booking_id: row.booking_id,
      booking_public_code: row.booking_public_code || null,
      customer_id: row.customer_id,
      customer_email: row.customer_email || null,
      order_type: row.order_type,
      fulfillment_mode: row.fulfillment_mode,
      target_resource_id: row.target_resource_id || null,
      target_resource_name: row.target_resource_name || null,
      pickup_code: row.pickup_code || null,
      status: row.status,
      total_minor: Number(row.total_minor),
      currency: row.currency || 'RON',
      payment_intent_id: row.payment_intent_id || null,
      payment_status: row.payment_status || null,
      age_verified_by: row.age_verified_by || null,
      age_verified_at: row.age_verified_at ? new Date(row.age_verified_at).toISOString() : null,
      accepted_by: row.accepted_by || null,
      accepted_at: row.accepted_at ? new Date(row.accepted_at).toISOString() : null,
      prepared_by: row.prepared_by || null,
      prepared_at: row.prepared_at ? new Date(row.prepared_at).toISOString() : null,
      ready_at: row.ready_at ? new Date(row.ready_at).toISOString() : null,
      handed_off_by: row.handed_off_by || null,
      handed_off_at: row.handed_off_at ? new Date(row.handed_off_at).toISOString() : null,
      estimated_prep_minutes: estPrep,
      sla_status: isOverdue ? 'OVERDUE' : 'ON_TIME',
      age_minutes: ageMinutes,
      cancellation_reason: row.cancellation_reason || null,
      notes: row.notes || null,
      items: items.map((i) => ({
        id: i.id,
        product_id: i.product_id,
        title: i.title,
        unit_price_minor: Number(i.unit_price_minor),
        quantity: Number(i.quantity),
        line_total_minor: Number(i.line_total_minor),
        restricted_product_type: i.restricted_product_type || 'NONE',
        age_verification_required: Boolean(i.age_verification_required),
        tax_category: i.tax_category || 'STANDARD',
        status: i.status || 'ACTIVE',
        refund_id: i.refund_id || null,
        refunded_amount_minor: Number(i.refunded_amount_minor || 0),
        refund_reason: i.refund_reason || null,
        refunded_at: i.refunded_at ? new Date(i.refunded_at).toISOString() : null,
      })),
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }
}
