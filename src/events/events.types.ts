export type RealtimeEventType =
  | 'ORDER_CREATED'
  | 'ORDER_STATUS_CHANGED'
  | 'STATION_STATUS_CHANGED'
  | 'STAFF_CALL'
  | 'SESSION_EXTENDED'
  | 'PC_LOCK_EVENT'
  | 'HEARTBEAT';

export interface RealtimeEventPayload {
  type: RealtimeEventType;
  venueId?: string;
  userId?: string;
  stationId?: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface BroadcastInput {
  type: RealtimeEventType;
  venueId?: string;
  userId?: string;
  stationId?: string;
  data: Record<string, unknown>;
}
