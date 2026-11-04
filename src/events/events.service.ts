import { Injectable, MessageEvent } from '@nestjs/common';
import { Observable, Subject, filter, interval, map, merge } from 'rxjs';
import { BroadcastInput, RealtimeEventPayload } from './events.types';

@Injectable()
export class EventsService {
  private readonly eventBus$ = new Subject<RealtimeEventPayload>();

  /**
   * Publish an event to all connected consumers
   */
  emit(input: BroadcastInput): RealtimeEventPayload {
    const payload: RealtimeEventPayload = {
      type: input.type,
      venueId: input.venueId,
      userId: input.userId,
      stationId: input.stationId,
      timestamp: new Date().toISOString(),
      data: input.data ?? {},
    };
    this.eventBus$.next(payload);
    return payload;
  }

  /**
   * Create an SSE stream filtered optionally by venueId or userId
   */
  getStream(venueId?: string, userId?: string): Observable<MessageEvent> {
    const filteredEvents$ = this.eventBus$.asObservable().pipe(
      filter((evt) => {
        if (venueId && evt.venueId && evt.venueId !== venueId) {
          return false;
        }
        if (userId && evt.userId && evt.userId !== userId) {
          return false;
        }
        return true;
      }),
      map((evt) => ({
        data: evt,
        type: evt.type,
      })),
    );

    const heartbeat$ = interval(20000).pipe(
      map(() => ({
        data: {
          type: 'HEARTBEAT',
          timestamp: new Date().toISOString(),
        },
        type: 'HEARTBEAT',
      })),
    );

    return merge(filteredEvents$, heartbeat$);
  }
}
