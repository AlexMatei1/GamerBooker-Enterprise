import { Injectable } from '@nestjs/common';
import { NotificationEventType, RenderedTemplate } from './notifications.types';

/** Formats an integer minor-unit amount for a human-readable message. */
function money(value: unknown, currency: unknown): string | null {
  if (value === null || value === undefined) return null;
  const minor = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(minor)) return null;
  const code = typeof currency === 'string' && currency ? currency : 'RON';
  return `${(minor / 100).toFixed(2)} ${code}`;
}

/** Formats a context timestamp without trusting its runtime type. */
function when(value: unknown, mode: 'datetime' | 'time'): string | null {
  if (value === null || value === undefined || value === '') return null;
  const valid =
    typeof value === 'string' ||
    typeof value === 'number' ||
    value instanceof Date;
  if (!valid) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return mode === 'datetime' ? date.toLocaleString() : date.toLocaleTimeString();
}

/** Coerces a loose template context value to display text. */
function text(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

@Injectable()
export class TemplatesService {
  render(eventType: NotificationEventType, context: Record<string, unknown>): RenderedTemplate {
    switch (eventType) {
      case 'BOOKING_CONFIRMED': {
        const venueName = text(context.venue_name, 'GamerBooker Arena');
        const code = text(context.public_code, text(context.booking_code, 'GB-UNKNOWN'));
        const starts = when(context.starts_at, 'datetime') ?? '';
        const ends = when(context.ends_at, 'datetime') ?? '';
        const total = money(context.total_minor, context.currency) ?? '';
        const paid = money(context.due_now_minor, context.currency) ?? '';
        const balance = money(context.balance_minor, context.currency) ?? '0.00 RON';

        return {
          subject: `Booking Confirmed: ${code} at ${venueName}`,
          bodyText: `Your reservation ${code} at ${venueName} from ${starts} to ${ends} is confirmed. Total: ${total}. Paid: ${paid}. Balance due: ${balance}. Please have your rolling check-in QR code ready upon arrival.`,
        };
      }

      case 'BOOKING_CANCELLED': {
        const code = text(context.public_code, text(context.booking_code, 'GB-UNKNOWN'));
        const refund = money(context.refund_minor, context.currency) ?? '0.00 RON';

        return {
          subject: `Booking Cancelled: ${code}`,
          bodyText: `Your reservation ${code} has been cancelled. Refund amount: ${refund}. Reason: ${text(context.reason, 'Requested by customer')}.`,
        };
      }

      case 'BOOKING_REMINDER': {
        const venueName = text(context.venue_name, 'your venue');
        const station = text(context.station_name, 'your assigned seat');
        const starts = when(context.starts_at, 'time') ?? '15 minutes';

        return {
          subject: `Reminder: Session starts soon at ${venueName}`,
          bodyText: `Your gaming session begins at ${starts} at ${venueName} (${station}). Please present your rolling in-app QR code to desk reception.`,
        };
      }

      case 'ORDER_PLACED': {
        const orderNumber = text(context.order_number, 'ORD-UNKNOWN');
        const prep = text(context.estimated_prep_minutes, '10');
        return {
          subject: `Order Received: ${orderNumber}`,
          bodyText: `We have received your order ${orderNumber}. Estimated preparation time is ${prep} minutes.`,
        };
      }

      case 'ORDER_ACCEPTED': {
        const orderNumber = text(context.order_number, 'ORD-UNKNOWN');
        return {
          subject: `Order Accepted: ${orderNumber}`,
          bodyText: `The counter staff has accepted order ${orderNumber} and preparation has begun.`,
        };
      }

      case 'ORDER_READY': {
        const orderNumber = text(context.order_number, 'ORD-UNKNOWN');
        const isBarPickup = context.fulfillment_mode === 'BAR_PICKUP';
        const pickup = text(context.pickup_code, '');
        const stationName = text(context.station_name, '');
        const pickupCode = pickup ? ` Pickup code: ${pickup}.` : '';
        const station = stationName ? ` (Station ${stationName})` : '';

        const body = isBarPickup
          ? `Your order ${orderNumber} is ready for pickup at the bar counter!${pickupCode} Please show your code to staff.`
          : `Your order ${orderNumber} is ready and is being delivered to your seat${station}.`;

        return {
          subject: `Order Ready: ${orderNumber}`,
          bodyText: body,
        };
      }

      case 'ORDER_HANDED_OFF': {
        const orderNumber = text(context.order_number, 'ORD-UNKNOWN');
        return {
          subject: `Order Completed: ${orderNumber}`,
          bodyText: `Your order ${orderNumber} has been delivered. Enjoy your session!`,
        };
      }

      case 'ORDER_CANCELLED': {
        const orderNumber = text(context.order_number, 'ORD-UNKNOWN');
        const refund = money(context.refund_minor, context.currency) ?? '';
        return {
          subject: `Order Cancelled: ${orderNumber}`,
          bodyText: `Order ${orderNumber} was cancelled. ${refund ? `A refund of ${refund} has been initiated.` : ''}`,
        };
      }

      case 'PAYMENT_CAPTURED': {
        const amount = money(context.amount_minor, context.currency) ?? '';
        const ref = text(context.reference, text(context.booking_code, 'payment'));
        return {
          subject: `Payment Successful: ${amount}`,
          bodyText: `Your payment of ${amount} for ${ref} was processed successfully. Thank you!`,
        };
      }

      case 'REFUND_SUCCEEDED': {
        const amount = money(context.amount_minor, context.currency) ?? '';
        return {
          subject: `Refund Succeeded: ${amount}`,
          bodyText: `Your refund of ${amount} has been processed back to your original payment method.`,
        };
      }

      default:
        return {
          subject: `Notification: ${eventType}`,
          bodyText: `You have an update regarding event ${eventType}.`,
        };
    }
  }
}
