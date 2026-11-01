export interface LayoutValidationError {
  code: string;
  message: string;
  node_id?: string;
  resource_id?: string;
}

export interface LayoutValidationWarning {
  code: string;
  message: string;
  node_id?: string;
}

export interface ValidateLayoutResult {
  valid: boolean;
  errors: LayoutValidationError[];
  warnings: LayoutValidationWarning[];
  resource_count: number;
  room_count: number;
}

export interface PublishLayoutDto {
  expected_draft_revision: number;
  change_summary?: string;
}

export interface RollbackLayoutDto {
  target_revision_number: number;
  reason: string;
}

export interface LayoutRevisionDetail {
  id: string;
  venue_id: string;
  revision_number: number;
  schema_version: number;
  canvas: any;
  rooms: any[];
  layers: any[];
  nodes: any[];
  metadata: Record<string, any>;
  published_at: string;
  published_by: string | null;
  change_summary: string | null;
  is_active: boolean;
}

export interface CustomerPreviewNode {
  id: string;
  kind: string;
  layer_id: string;
  room_id?: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  rotation?: number;
  label?: string;
  color?: string;
  custom_props?: Record<string, any>;
  resource?: {
    id: string;
    name: string;
    type: string;
    hourly_rate_minor: number;
    currency: string;
    status: 'AVAILABLE' | 'BOOKED' | 'MAINTENANCE';
  };
}

export interface CustomerLayoutPreview {
  venue_id: string;
  source: 'DRAFT' | 'PUBLISHED';
  revision_number: number;
  canvas: any;
  rooms: any[];
  layers: any[];
  nodes: CustomerPreviewNode[];
  interval?: { from: string; to: string };
  summary: {
    total_resources: number;
    available: number;
    booked: number;
    maintenance: number;
  };
}
