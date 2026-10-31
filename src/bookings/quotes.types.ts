import type { PolicySnapshot } from './policy.types';

export interface PriceRuleRow {
  id: string;
  venue_id: string;
  target_type: 'VENUE_DEFAULT' | 'ZONE' | 'RESOURCE';
  target_id: string | null;
  hourly_rate_minor: string;
  currency: string;
  created_at: Date;
  updated_at: Date;
}

export interface SetPriceRuleInput {
  targetType: 'VENUE_DEFAULT' | 'ZONE' | 'RESOURCE';
  targetId?: string | null;
  hourlyRateMinor: number;
}

export interface QuoteItem {
  resource_id: string;
  resource_name: string;
  resource_type: string;
  amount_minor: number;
  hourly_rate_minor: number;
}

export interface CreateQuoteInput {
  venue_id: string;
  resource_ids: string[];
  starts_at: string; // ISO-8601 UTC
  ends_at: string;   // ISO-8601 UTC
  participants?: number;
}

export interface PriceQuote {
  quote_id: string;
  venue_id: string;
  customer_id: string;
  starts_at: string;
  ends_at: string;
  currency: 'RON';
  total_minor: number;
  due_now_minor: number;
  balance_minor: number;
  policy: PolicySnapshot;
  items: QuoteItem[];
  signature: string;
  expires_at: string;
  created_at: string;
}
