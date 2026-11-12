import { Injectable, HttpStatus } from '@nestjs/common';
import { getPool } from '../db/pool';
import { AuthHttpError } from '../auth/auth-error';
import { BookingReceiptView, ReceiptItem, ReceiptTransaction } from './notifications.types';

@Injectable()
export class ReceiptsService {
  async getBookingReceipt(bookingId: string, customerId?: string): Promise<BookingReceiptView> {
    const pool = getPool();

    // 1. Fetch booking
    const bookingRes = await pool.query<{
      id: string;
      tenant_id: string;
      venue_id: string;
      customer_id: string;
      public_code: string;
      status: string;
      resource_ids: string[];
      package_id?: string | null;
      price_snapshot: {
        total_minor?: number | string | null;
        totalMinor?: number | string | null;
        currency?: string | null;
        items?: unknown[] | null;
      } | null;
      starts_at: string;
      ends_at: string;
      created_at: string;
    }>('SELECT * FROM bookings WHERE id = $1', [bookingId]);

    if (bookingRes.rows.length === 0) {
      throw new AuthHttpError(HttpStatus.NOT_FOUND, 'BOOKING_NOT_FOUND', 'Booking not found');
    }

    const booking = bookingRes.rows[0];

    // Authorization: customer must own the booking
    if (customerId && booking.customer_id !== customerId) {
      throw new AuthHttpError(HttpStatus.NOT_FOUND, 'BOOKING_NOT_FOUND', 'Booking not found');
    }

    // 2. Fetch venue and tenant info
    const venueRes = await pool.query<{
      id: string;
      name: string;
      tenant_name: string;
    }>(
      `SELECT v.id, v.name, t.legal_name as tenant_name
         FROM venues v
         JOIN tenants t ON t.id = v.tenant_id
        WHERE v.id = $1`,
      [booking.venue_id],
    );
    const venue = venueRes.rows[0];

    // 3. Fetch customer info
    const customerRes = await pool.query<{
      id: string;
      email: string;
      phone?: string;
    }>('SELECT id, email, phone FROM users WHERE id = $1', [booking.customer_id]);
    const customer = customerRes.rows[0];

    // 4. Fetch package details if applicable
    let packageName: string | null = null;
    if (booking.package_id) {
      const pkgRes = await pool.query<{ name: string }>(
        'SELECT name FROM packages WHERE id = $1',
        [booking.package_id],
      );
      if (pkgRes.rows.length > 0) {
        packageName = pkgRes.rows[0].name;
      }
    }

    // 5. Fetch resource names
    let resourceNames = 'Station';
    if (booking.resource_ids && booking.resource_ids.length > 0) {
      const resRes = await pool.query<{ name: string }>(
        'SELECT name FROM resources WHERE id = ANY($1::uuid[])',
        [booking.resource_ids],
      );
      resourceNames = resRes.rows.map((r) => r.name).join(', ');
    }

    // 6. Fetch payments and transactions
    const transactions: ReceiptTransaction[] = [];

    // Online captures
    const intentsRes = await pool.query<{
      id: string;
      amount_minor: string | number;
      currency: string;
      status: string;
      created_at: string;
    }>(
      `SELECT id, amount_minor, currency, status, created_at
         FROM payment_intents
        WHERE booking_id = $1 AND status = 'CAPTURED'
        ORDER BY created_at ASC`,
      [bookingId],
    );

    let paidOnlineMinor = 0;
    for (const intent of intentsRes.rows) {
      const amt = Number(intent.amount_minor);
      paidOnlineMinor += amt;
      transactions.push({
        type: 'ONLINE_CAPTURE',
        reference: `PSP-${intent.id.substring(0, 8).toUpperCase()}`,
        amount_minor: amt,
        status: intent.status,
        payment_method: 'CARD_ONLINE',
        created_at: intent.created_at,
      });
    }

    // Offline reception receipts
    const receiptsRes = await pool.query<{
      id: string;
      reference: string;
      amount_minor: string | number;
      payment_method: string;
      created_at: string;
    }>(
      `SELECT id, reference, amount_minor, payment_method, created_at
         FROM offline_receipts
        WHERE booking_id = $1 AND voided_at IS NULL
        ORDER BY created_at ASC`,
      [bookingId],
    );

    let paidReceptionMinor = 0;
    for (const r of receiptsRes.rows) {
      const amt = Number(r.amount_minor);
      paidReceptionMinor += amt;
      transactions.push({
        type: 'RECEPTION_PAYMENT',
        reference: r.reference,
        amount_minor: amt,
        status: 'COLLECTED',
        payment_method: r.payment_method,
        created_at: r.created_at,
      });
    }

    // Succeeded refunds
    const refundsRes = await pool.query<{
      id: string;
      amount_minor: string | number;
      status: string;
      created_at: string;
    }>(
      `SELECT id, amount_minor, status, created_at
         FROM refunds
        WHERE booking_id = $1 AND status = 'SUCCEEDED'
        ORDER BY created_at ASC`,
      [bookingId],
    );

    let totalRefundedMinor = 0;
    for (const ref of refundsRes.rows) {
      const amt = Number(ref.amount_minor);
      totalRefundedMinor += amt;
      transactions.push({
        type: 'REFUND',
        reference: `REF-${ref.id.substring(0, 8).toUpperCase()}`,
        amount_minor: amt,
        status: ref.status,
        payment_method: 'ORIGINAL_PAYMENT_METHOD',
        created_at: ref.created_at,
      });
    }

    // 7. Calculate totals
    const priceSnapshot = booking.price_snapshot || {};
    const totalMinor = Number(priceSnapshot.total_minor || priceSnapshot.totalMinor || 0);
    const currency = priceSnapshot.currency || 'RON';

    const vatMinor = Math.round(totalMinor - totalMinor / 1.19);
    const subtotalMinor = totalMinor - vatMinor;
    const totalPaidMinor = paidOnlineMinor + paidReceptionMinor;
    const netPaid = totalPaidMinor - totalRefundedMinor;
    const balanceDueMinor = Math.max(0, totalMinor - netPaid);

    // 8. Construct line items
    const items: ReceiptItem[] = [];
    if (packageName) {
      items.push({
        description: `Package: ${packageName} (${resourceNames})`,
        quantity: 1,
        unit_price_minor: totalMinor,
        total_minor: totalMinor,
      });
    } else {
      const starts = new Date(booking.starts_at);
      const ends = new Date(booking.ends_at);
      const durationMins = Math.round((ends.getTime() - starts.getTime()) / (60 * 1000));
      items.push({
        description: `Station Reservation (${resourceNames}) - ${durationMins} minutes`,
        quantity: 1,
        unit_price_minor: totalMinor,
        total_minor: totalMinor,
      });
    }

    return {
      receipt_number: `RCP-${booking.public_code}`,
      issued_at: new Date().toISOString(),
      booking: {
        id: booking.id,
        public_code: booking.public_code,
        starts_at: booking.starts_at,
        ends_at: booking.ends_at,
        status: booking.status,
        package_name: packageName,
      },
      venue: {
        id: venue?.id || booking.venue_id,
        name: venue?.name || 'GamerBooker Arena',
        address: 'București, România',
        fiscal_code: `RO-${(venue?.tenant_name || 'GAMERBOOKER').toUpperCase().replace(/\s+/g, '')}`,
      },
      customer: {
        id: customer?.id || booking.customer_id,
        email: customer?.email || 'customer@gamerbooker.com',
        phone: customer?.phone,
      },
      items,
      summary: {
        subtotal_minor: subtotalMinor,
        vat_minor: vatMinor,
        total_minor: totalMinor,
        paid_online_minor: paidOnlineMinor,
        paid_reception_minor: paidReceptionMinor,
        total_paid_minor: totalPaidMinor,
        balance_due_minor: balanceDueMinor,
        total_refunded_minor: totalRefundedMinor,
        currency,
      },
      transactions,
      legal_notice:
        'Confirmare de plată GamerBooker conform termenilor contractuali. Nu constituie bon fiscal direct conform OUG 28/1999; bonul fiscal/factura fiscală se emite de către operatorul sălii.',
    };
  }
}
