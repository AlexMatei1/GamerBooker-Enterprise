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

export type OrderItemStatus =
  | 'ACTIVE'
  | 'REFUNDED_UNAVAILABLE'
  | 'REFUSED_AGE_RESTRICTION';

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
  status?: OrderItemStatus;
  refund_id?: string | null;
  refunded_amount_minor?: number;
  refund_reason?: string | null;
  refunded_at?: string | null;
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
  accepted_by?: string | null;
  accepted_at?: string | null;
  prepared_by?: string | null;
  prepared_at?: string | null;
  ready_at?: string | null;
  handed_off_by?: string | null;
  handed_off_at?: string | null;
  estimated_prep_minutes?: number;
  sla_status?: 'ON_TIME' | 'OVERDUE';
  age_minutes?: number;
  cancellation_reason: string | null;
  notes: string | null;
  items: OrderItemDetail[];
  created_at: string;
  updated_at: string;
}

export interface HandoffOrderInput {
  pickup_code?: string;
  age_verified?: boolean;
}

export interface RejectOrderInput {
  reason: string;
}

export interface BarBoardSummary {
  placed_count: number;
  accepted_count: number;
  preparing_count: number;
  ready_count: number;
  overdue_count: number;
  queue: OrderDetail[];
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

export interface RefuseAgeInput {
  reason?: string;
  line_item_ids?: string[];
}

export interface CancelUnavailableItemInput {
  reason: string;
}

export interface StockReconciliationCountItem {
  product_id: string;
  counted_stock: number;
  notes?: string;
}

export interface PerformStockReconciliationInput {
  items: StockReconciliationCountItem[];
  notes?: string;
}

export interface StockReconciliationItemDetail {
  id: string;
  product_id: string;
  product_title?: string;
  expected_stock: number;
  counted_stock: number;
  discrepancy_quantity: number;
  discrepancy_value_minor: number;
  adjustment_type: 'NONE' | 'SHRINKAGE' | 'SURPLUS';
  notes?: string | null;
  created_at: string;
}

export interface StockReconciliationAuditDetail {
  id: string;
  tenant_id: string;
  venue_id: string;
  performed_by: string;
  performed_by_name?: string;
  items_counted: number;
  discrepancy_items_count: number;
  total_discrepancy_units: number;
  total_shrinkage_value_minor: number;
  notes?: string | null;
  status: 'IN_PROGRESS' | 'COMPLETED';
  items: StockReconciliationItemDetail[];
  created_at: string;
  completed_at: string;
}

export interface StockReconciliationListResult {
  audits: StockReconciliationAuditDetail[];
  total_count: number;
}

