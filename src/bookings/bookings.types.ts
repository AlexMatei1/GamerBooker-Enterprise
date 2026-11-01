import type { PolicySnapshot } from './policy.types';
import type { QuoteItem } from './quotes.types';

export type BookingStatus =
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'CANCELLED'
  | 'NO_SHOW'
  | 'COMPLETED';

export type BookingType = 'SINGLE' | 'GROUP';

export interface ConfirmBookingInput {
  hold_id: string;
  payment_intent_id?: string;
}

export interface TransitionBookingInput {
  target_status: BookingStatus;
  expected_version: number;
  reason?: string;
}

export interface BookingRow {
  id: string;
  public_code: string;
  tenant_id: string;
  venue_id: string;
  customer_id: string;
  hold_id: string | null;
  quote_id: string;
  package_id?: string | null;
  status: BookingStatus;
  type: BookingType;
  starts_at: Date;
  ends_at: Date;
  timezone: string;
  resource_ids: string[];
  atomic_resource_ids: string[];
  total_minor: string;
  due_now_minor: string;
  paid_minor: string;
  balance_minor: string;
  currency: string;
  price_snapshot: {
    items: QuoteItem[];
    total_minor: number;
    due_now_minor: number;
    balance_minor: number;
  };
  policy_snapshot: PolicySnapshot;
  version: number;
  idempotency_key: string | null;
  confirmed_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface BookingResult {
  id: string;
  public_code: string;
  tenant_id: string;
  venue_id: string;
  customer_id: string;
  hold_id: string | null;
  quote_id: string;
  package_id?: string | null;
  status: BookingStatus;
  type: BookingType;
  starts_at: string;
  ends_at: string;
  timezone: string;
  resource_ids: string[];
  atomic_resource_ids: string[];
  total_minor: number;
  due_now_minor: number;
  paid_minor: number;
  balance_minor: number;
  currency: string;
  price_snapshot: {
    items: QuoteItem[];
    total_minor: number;
    due_now_minor: number;
    balance_minor: number;
  };
  policy_snapshot: PolicySnapshot;
  version: number;
  idempotency_key?: string | null;
  confirmed_at: string;
  created_at: string;
  updated_at: string;
}
