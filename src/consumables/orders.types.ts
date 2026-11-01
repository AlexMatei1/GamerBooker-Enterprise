export type OrderType = 'PREORDER' | 'IN_SESSION';

export type FulfillmentMode = 'AT_STATION' | 'BAR_PICKUP';

export type OrderStatus =
  | 'DRAFT'
  | 'PAYMENT_PENDING'
  | 'PLACED'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'HANDED_OFF'
  | 'CANCELLED';

export interface CartItemInput {
  product_id: string;
  quantity: number;
}

export interface ValidateCartInput {
  venue_id: string;
  booking_id: string;
  items: CartItemInput[];
  fulfillment_mode: FulfillmentMode;
  target_resource_id?: string;
}

export interface ValidatedCartItem {
  product_id: string;
  title: string;
  unit_price_minor: number;
  quantity: number;
  line_total_minor: number;
  available_stock: number;
  restricted_product_type: string;
  age_verification_required: boolean;
}

export interface ValidateCartResult {
  valid: boolean;
  order_type: OrderType;
  items: ValidatedCartItem[];
  total_minor: number;
  has_age_restricted_items: boolean;
  errors: string[];
}

export interface CheckoutOrderInput {
  venue_id: string;
  booking_id: string;
  items: CartItemInput[];
  fulfillment_mode: FulfillmentMode;
  target_resource_id?: string;
  notes?: string;
  idempotency_key?: string;
  psp_provider?: string;
}

export interface CheckoutOrderResult {
  order_id: string;
  public_code: string;
  pickup_code: string | null;
  status: OrderStatus;
  order_type: OrderType;
  fulfillment_mode: FulfillmentMode;
  total_minor: number;
  currency: string;
  payment_intent_id: string;
  provider_ref: string;
  expires_at: string;
}

export interface OrderItemDetail {
  id: string;
  product_id: string;
  title: string;
  unit_price_minor: number;
  quantity: number;
  line_total_minor: number;
  restricted_product_type: string;
  age_verification_required: boolean;
  tax_category: string;
}

export interface OrderDetail {
  id: string;
  public_code: string;
  tenant_id: string;
  venue_id: string;
  booking_id: string;
  booking_public_code?: string;
  customer_id: string;
  customer_email?: string;
  order_type: OrderType;
  fulfillment_mode: FulfillmentMode;
  target_resource_id: string | null;
  target_resource_name?: string | null;
  pickup_code: string | null;
  status: OrderStatus;
  total_minor: number;
  currency: string;
  payment_intent_id: string | null;
  payment_status?: string;
  age_verified_by: string | null;
  age_verified_at: string | null;
  cancellation_reason: string | null;
  notes: string | null;
  items: OrderItemDetail[];
  created_at: string;
  updated_at: string;
}

export interface OrderFilterQuery {
  status?: OrderStatus;
  order_type?: OrderType;
  booking_id?: string;
  customer_id?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface OrderListResult {
  orders: OrderDetail[];
  total_count: number;
  summary: {
    total_revenue_minor: number;
    count_by_status: Record<string, number>;
  };
}
