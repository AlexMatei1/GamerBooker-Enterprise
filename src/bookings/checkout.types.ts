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
