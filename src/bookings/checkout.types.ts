import type { BookingResult } from './bookings.types';

export interface SoloCheckoutInput {
  hold_id: string;
  payment_method?: string;
  payment_intent_id?: string;
}

export interface SoloCheckoutResult {
  booking: BookingResult;
  qr_token: string;
  qr_expires_at: string;
}

export interface SoloPaymentIntentResult {
  intent_id: string;
  provider_ref: string;
  client_secret?: string;
  amount_minor: number;
  currency: string;
  hold_id: string;
  status: string;
  hold_expires_at: string;
}

/**
 * Customer-safe payment status. It is intentionally sourced from the server
 * record updated by the verified PSP webhook, rather than a mobile callback.
 */
export interface SoloPaymentIntentStatusResult {
  intent_id: string;
  hold_id: string;
  amount_minor: number;
  currency: string;
  status: 'PENDING' | 'AUTHORIZED' | 'CAPTURED' | 'FAILED' | 'CANCELLED' | 'REFUNDED';
  updated_at: string;
}

export interface QrTokenData {
  token: string;
  public_code: string;
  expires_at: string;
  refresh_after_seconds: number;
}

export interface ScanCheckinInput {
  qr_token?: string;
  public_code?: string;
}

export interface CheckinResult {
  status: 'CHECKED_IN';
  booking_id: string;
  public_code: string;
  redeemed_at: string;
  session_start: string;
  session_end: string;
  balance_minor: number;
  remaining_payment_methods: string[];
}

export interface BalanceSummary {
  booking_id: string;
  public_code: string;
  total_minor: number;
  paid_minor: number;
  balance_minor: number;
  currency: string;
  prepaid_mode: 'FULL' | 'DEPOSIT';
  deposit_percentage?: number;
  remaining_payment_methods: string[];
  is_fully_paid: boolean;
}

export interface PayBalanceInput {
  amount_minor: number;
  payment_method: 'CASH' | 'POS_TERMINAL' | 'RECEPTION_CARD';
  reference: string;
  notes?: string;
}

export interface OfflineReceiptResult {
  id: string;
  venue_id: string;
  booking_id: string;
  staff_id: string;
  amount_minor: number;
  payment_method: string;
  reference: string;
  notes: string | null;
  created_at: string;
}

export interface PayBalanceOnlineInput {
  amount_minor?: number;
}

export interface PayBalanceOnlineResult {
  intent_id: string;
  provider_ref: string;
  client_secret?: string;
  amount_minor: number;
  currency: string;
  booking_id: string;
  status: string;
}

export interface ReceiptFilterQuery {
  from?: string;
  to?: string;
  staff_id?: string;
  payment_method?: 'CASH' | 'POS_TERMINAL' | 'RECEPTION_CARD';
  include_voided?: boolean;
  page?: number;
  limit?: number;
}

export interface ReceiptLedgerItem {
  id: string;
  venue_id: string;
  booking_id: string;
  booking_public_code?: string;
  staff_id: string;
  staff_name?: string;
  amount_minor: number;
  payment_method: string;
  reference: string;
  notes: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  created_at: string;
}

export interface ReceiptLedgerResult {
  receipts: ReceiptLedgerItem[];
  total_count: number;
  summary: {
    total_collected_minor: number;
    cash_collected_minor: number;
    card_collected_minor: number;
    voided_count: number;
  };
}

export interface VoidReceiptInput {
  reason: string;
}

export interface VoidReceiptResult {
  receipt_id: string;
  voided: boolean;
  booking_id: string;
  reverted_amount_minor: number;
  new_balance_minor: number;
  new_paid_minor: number;
  voided_at: string;
  voided_by: string;
  void_reason: string;
}
