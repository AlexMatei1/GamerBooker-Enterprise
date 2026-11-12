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

export interface LayoutCanvas {
  width?: number;
  height?: number;
  [key: string]: unknown;
}

export interface LayoutRoomShape {
  x?: number;
  y?: number;
  [key: string]: unknown;
}

export interface LayoutRoom {
  id?: string;
  name?: string;
  shape?: LayoutRoomShape;
  [key: string]: unknown;
}

export interface LayoutLayer {
  id?: string;
  [key: string]: unknown;
}

export interface LayoutNode {
  id?: string;
  kind?: string;
  layer_id?: string;
  room_id?: string;
  resource_id?: string;
  label?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  rotation?: number;
  color?: string;
  custom_props?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface LayoutRevisionDetail {
  id: string;
  venue_id: string;
  revision_number: number;
  schema_version: number;
  canvas: LayoutCanvas;
  rooms: LayoutRoom[];
  layers: LayoutLayer[];
  nodes: LayoutNode[];
  metadata: Record<string, unknown>;
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
  custom_props?: Record<string, unknown>;
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
  canvas: LayoutCanvas;
  rooms: LayoutRoom[];
  layers: LayoutLayer[];
  nodes: Array<CustomerPreviewNode | Record<string, unknown>>;
  interval?: { from: string; to: string };
  summary: {
    total_resources: number;
    available: number;
    booked: number;
    maintenance: number;
  };
}
