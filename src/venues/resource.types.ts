import type { ResourceRow } from './venues.service';

export interface CreateResourceDto {
  name: string;
  type: 'PC' | 'CONSOLE_SETUP' | 'PRIVATE_ROOM';
  roomId?: string | null;
  zoneId?: string | null;
  attributes?: Record<string, unknown>;
  bookable?: boolean;
  status?: 'AVAILABLE' | 'MAINTENANCE' | 'TEMP_BLOCKED';
}

export interface UpdateResourceDto {
  name?: string;
  type?: 'PC' | 'CONSOLE_SETUP' | 'PRIVATE_ROOM';
  roomId?: string | null;
  zoneId?: string | null;
  attributes?: Record<string, unknown>;
  bookable?: boolean;
  status?: 'AVAILABLE' | 'MAINTENANCE' | 'TEMP_BLOCKED';
}

export interface BulkCloneNamingDto {
  prefix: string;
  startIndex: number;
  count: number;
  padLength?: number;
}

export interface BulkCloneDto {
  template: {
    type: 'PC' | 'CONSOLE_SETUP' | 'PRIVATE_ROOM';
    roomId?: string | null;
    zoneId?: string | null;
    attributes?: Record<string, unknown>;
    bookable?: boolean;
    status?: 'AVAILABLE' | 'MAINTENANCE' | 'TEMP_BLOCKED';
  };
  naming: BulkCloneNamingDto;
}

export interface BulkUpdateDto {
  resource_ids: string[];
  updates: {
    status?: 'AVAILABLE' | 'MAINTENANCE' | 'TEMP_BLOCKED';
    bookable?: boolean;
    roomId?: string | null;
    zoneId?: string | null;
    attributes?: Record<string, unknown>;
  };
}

export interface BulkImportDto {
  items: CreateResourceDto[];
}

export interface BulkUpdateResult {
  updated_count: number;
  resources: ResourceRow[];
}
