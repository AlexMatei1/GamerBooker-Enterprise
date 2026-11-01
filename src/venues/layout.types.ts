export type SceneNodeKind =
  | 'WALL'
  | 'DOOR'
  | 'DECOR'
  | 'FURNITURE'
  | 'RESOURCE'
  | 'LABEL';

export interface SceneCanvas {
  width: number;
  height: number;
  grid: number;
}

export interface SceneRoomShape {
  kind: 'rect' | 'polygon';
  x: number;
  y: number;
  w?: number;
  h?: number;
  points?: Array<{ x: number; y: number }>;
}

export interface SceneRoom {
  id: string;
  name: string;
  color?: string;
  shape: SceneRoomShape;
}

export interface SceneLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
}

export interface SceneNode {
  id: string;
  kind: SceneNodeKind;
  layer_id: string;
  room_id?: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  rotation?: number;
  z_index?: number;
  resource_id?: string;
  label?: string;
  color?: string;
  custom_props?: Record<string, any>;
}

export interface LayoutDraft {
  id: string;
  venue_id: string;
  revision: number;
  schema_version: number;
  canvas: SceneCanvas;
  rooms: SceneRoom[];
  layers: SceneLayer[];
  nodes: SceneNode[];
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface UpdateDraftDto {
  expected_revision: number;
  canvas?: Partial<SceneCanvas>;
  rooms?: SceneRoom[];
  layers?: SceneLayer[];
  nodes?: SceneNode[];
  metadata?: Record<string, any>;
}

export type PresetTemplateType =
  | 'ROW_PCS'
  | 'ESPORTS_5V5'
  | 'CONSOLE_LOUNGE'
  | 'VIP_U_SHAPE'
  | 'PRIVATE_ROOM';

export interface GeneratePresetDto {
  template_type: PresetTemplateType;
  start_x: number;
  start_y: number;
  room_id?: string;
  naming_prefix?: string;
  count?: number;
  rotation?: number;
  spacing?: number;
}

export interface PresetCatalogItem {
  type: PresetTemplateType;
  name: string;
  description: string;
  default_count: number;
  min_count: number;
  max_count: number;
  required_dimensions: { w: number; h: number };
}

export interface GeneratedPresetResult {
  nodes: SceneNode[];
  bounding_box: { x: number; y: number; w: number; h: number };
}
