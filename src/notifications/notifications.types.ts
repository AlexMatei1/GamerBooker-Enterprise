export type NotificationChannel = 'IN_APP' | 'EMAIL' | 'PUSH' | 'SMS';

export type NotificationEventType =
  | 'BOOKING_CONFIRMED'
  | 'BOOKING_CANCELLED'
  | 'BOOKING_REMINDER'
  | 'ORDER_PLACED'
  | 'ORDER_ACCEPTED'
  | 'ORDER_READY'
  | 'ORDER_HANDED_OFF'
  | 'ORDER_CANCELLED'
  | 'PAYMENT_CAPTURED'
  | 'REFUND_SUCCEEDED';

export interface NotificationItem {
  id: string;
  tenant_id?: string | null;
  user_id: string;
  event_type: string;
  title: string;
  body: string;
  channel: string;
  metadata: Record<string, any>;
  read: boolean;
  read_at?: string | null;
  created_at: string;
}

export interface NotificationPreference {
  user_id: string;
  email_enabled: boolean;
  push_enabled: boolean;
  in_app_enabled: boolean;
  marketing_opt_in: boolean;
  updated_at: string;
}

export interface UpdateNotificationPreferenceInput {
  email_enabled?: boolean;
  push_enabled?: boolean;
  in_app_enabled?: boolean;
  marketing_opt_in?: boolean;
}

export interface DispatchNotificationInput {
  eventId: string;
  recipientId: string;
  eventType: NotificationEventType;
  templateKey?: string;
  channel?: NotificationChannel;
  context: Record<string, any>;
  isMarketing?: boolean;
  tenantId?: string | null;
}

export interface DispatchNotificationResult {
  deliveryId: string;
  status: 'SENT' | 'SKIPPED' | 'FAILED';
  channel: NotificationChannel;
  title?: string;
  body?: string;
  reason?: string;
}

export interface RenderedTemplate {
  subject: string;
  bodyText: string;
  bodyHtml?: string;
}

export interface ReceiptItem {
  description: string;
  quantity: number;
  unit_price_minor: number;
  total_minor: number;
}

export interface ReceiptTransaction {
  type: 'ONLINE_CAPTURE' | 'RECEPTION_PAYMENT' | 'REFUND';
  reference: string;
  amount_minor: number;
  status: string;
  payment_method?: string;
  created_at: string;
}

export interface BookingReceiptView {
  receipt_number: string;
  issued_at: string;
  booking: {
    id: string;
    public_code: string;
    starts_at: string;
    ends_at: string;
    status: string;
    package_name?: string | null;
  };
  venue: {
    id: string;
    name: string;
    address?: string;
    fiscal_code?: string;
  };
  customer: {
    id: string;
    email: string;
    phone?: string;
  };
  items: ReceiptItem[];
  summary: {
    subtotal_minor: number;
    vat_minor: number;
    total_minor: number;
    paid_online_minor: number;
    paid_reception_minor: number;
    total_paid_minor: number;
    balance_due_minor: number;
    total_refunded_minor: number;
    currency: string;
  };
  transactions: ReceiptTransaction[];
  legal_notice: string;
}

export interface OrderStatusMilestone {
  status: string;
  label: string;
  reached: boolean;
  active: boolean;
  timestamp?: string | null;
}

export interface OrderStatusFlowView {
  order_id: string;
  order_number: string;
  fulfillment_mode: 'AT_STATION' | 'BAR_PICKUP';
  pickup_code?: string | null;
  target_station_name?: string | null;
  current_status: string;
  estimated_prep_minutes: number;
  created_at: string;
  milestones: OrderStatusMilestone[];
  items_summary: Array<{
    title: string;
    quantity: number;
    status: string;
  }>;
}
