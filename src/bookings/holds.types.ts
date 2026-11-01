export type HoldStatus = 'ACTIVE' | 'EXPIRED' | 'CONSUMED' | 'RELEASED';

export interface CreateHoldInput {
  quote_id: string;
}

export interface HoldResult {
  id: string;
  tenant_id: string;
  venue_id: string;
  customer_id: string;
  quote_id: string;
  package_id?: string | null;
  idempotency_key?: string | null;
  status: HoldStatus;
  resource_ids: string[];
  atomic_resource_ids: string[];
  starts_at: string;
  ends_at: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface HoldRow {
  id: string;
  tenant_id: string;
  venue_id: string;
  customer_id: string;
  quote_id: string;
  package_id?: string | null;
  idempotency_key: string | null;
  status: HoldStatus;
  resource_ids: string[];
  atomic_resource_ids: string[];
  starts_at: Date;
  ends_at: Date;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
}
