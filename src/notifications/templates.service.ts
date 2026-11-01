import { Injectable } from '@nestjs/common';
import { NotificationEventType, RenderedTemplate } from './notifications.types';

@Injectable()
export class TemplatesService {
  render(eventType: NotificationEventType, context: Record<string, any>): RenderedTemplate {
    switch (eventType) {
      case 'BOOKING_CONFIRMED': {
        const venueName = context.venue_name || 'GamerBooker Arena';
        const code = context.public_code || context.booking_code || 'GB-UNKNOWN';
        const starts = context.starts_at ? new Date(context.starts_at).toLocaleString() : '';
        const ends = context.ends_at ? new Date(context.ends_at).toLocaleString() : '';
        const total = context.total_minor != null ? `${(context.total_minor / 100).toFixed(2)} ${context.currency || 'RON'}` : '';
        const paid = context.due_now_minor != null ? `${(context.due_now_minor / 100).toFixed(2)} ${context.currency || 'RON'}` : '';
        const balance = context.balance_minor != null ? `${(context.balance_minor / 100).toFixed(2)} ${context.currency || 'RON'}` : '0.00 RON';

        return {
          subject: `Booking Confirmed: ${code} at ${venueName}`,
          bodyText: `Your reservation ${code} at ${venueName} from ${starts} to ${ends} is confirmed. Total: ${total}. Paid: ${paid}. Balance due: ${balance}. Please have your rolling check-in QR code ready upon arrival.`,
        };
      }

      case 'BOOKING_CANCELLED': {
        const code = context.public_code || context.booking_code || 'GB-UNKNOWN';
        const refund = context.refund_minor != null ? `${(context.refund_minor / 100).toFixed(2)} ${context.currency || 'RON'}` : '0.00 RON';

        return {
          subject: `Booking Cancelled: ${code}`,
          bodyText: `Your reservation ${code} has been cancelled. Refund amount: ${refund}. Reason: ${context.reason || 'Requested by customer'}.`,
        };
      }

      case 'BOOKING_REMINDER': {
        const venueName = context.venue_name || 'your venue';
        const station = context.station_name || 'your assigned seat';
        const starts = context.starts_at ? new Date(context.starts_at).toLocaleTimeString() : '15 minutes';

        return {
          subject: `Reminder: Session starts soon at ${venueName}`,
          bodyText: `Your gaming session begins at ${starts} at ${venueName} (${station}). Please present your rolling in-app QR code to desk reception.`,
        };
      }

      case 'ORDER_PLACED': {
        const orderNumber = context.order_number || 'ORD-UNKNOWN';
        const prep = context.estimated_prep_minutes || 10;
        return {
          subject: `Order Received: ${orderNumber}`,
          bodyText: `We have received your order ${orderNumber}. Estimated preparation time is ${prep} minutes.`,
        };
      }

      case 'ORDER_ACCEPTED': {
        const orderNumber = context.order_number || 'ORD-UNKNOWN';
        return {
          subject: `Order Accepted: ${orderNumber}`,
          bodyText: `The counter staff has accepted order ${orderNumber} and preparation has begun.`,
        };
      }

      case 'ORDER_READY': {
        const orderNumber = context.order_number || 'ORD-UNKNOWN';
        const isBarPickup = context.fulfillment_mode === 'BAR_PICKUP';
        const pickupCode = context.pickup_code ? ` Pickup code: ${context.pickup_code}.` : '';
        const station = context.station_name ? ` (Station ${context.station_name})` : '';

        const body = isBarPickup
          ? `Your order ${orderNumber} is ready for pickup at the bar counter!${pickupCode} Please show your code to staff.`
          : `Your order ${orderNumber} is ready and is being delivered to your seat${station}.`;

        return {
          subject: `Order Ready: ${orderNumber}`,
          bodyText: body,
        };
      }

      case 'ORDER_HANDED_OFF': {
        const orderNumber = context.order_number || 'ORD-UNKNOWN';
        return {
          subject: `Order Completed: ${orderNumber}`,
          bodyText: `Your order ${orderNumber} has been delivered. Enjoy your session!`,
        };
      }

      case 'ORDER_CANCELLED': {
        const orderNumber = context.order_number || 'ORD-UNKNOWN';
        const refund = context.refund_minor != null ? `${(context.refund_minor / 100).toFixed(2)} ${context.currency || 'RON'}` : '';
        return {
          subject: `Order Cancelled: ${orderNumber}`,
          bodyText: `Order ${orderNumber} was cancelled. ${refund ? `A refund of ${refund} has been initiated.` : ''}`,
        };
      }

      case 'PAYMENT_CAPTURED': {
        const amount = context.amount_minor != null ? `${(context.amount_minor / 100).toFixed(2)} ${context.currency || 'RON'}` : '';
        const ref = context.reference || context.booking_code || 'payment';
        return {
          subject: `Payment Successful: ${amount}`,
          bodyText: `Your payment of ${amount} for ${ref} was processed successfully. Thank you!`,
        };
      }

      case 'REFUND_SUCCEEDED': {
        const amount = context.amount_minor != null ? `${(context.amount_minor / 100).toFixed(2)} ${context.currency || 'RON'}` : '';
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
