import { Body, Controller, Get, HttpCode, HttpStatus, MessageEvent, Post, Query, Sse } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { EventsService } from './events.service';
import { BroadcastInput } from './events.types';

@ApiTags('Realtime Events')
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Sse('stream')
  @ApiOperation({ summary: 'Subscribe to real-time server-sent events (SSE)' })
  stream(
    @Query('venueId') venueId?: string,
    @Query('userId') userId?: string,
  ): Observable<MessageEvent> {
    return this.eventsService.getStream(venueId, userId);
  }

  @Post('broadcast')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Broadcast an event across mobile apps and venue dashboards' })
  broadcast(@Body() input: BroadcastInput) {
    const published = this.eventsService.emit(input);
    return {
      status: 'success',
      deliveredAt: published.timestamp,
      event: published,
    };
  }

  @Get('ping')
  @ApiOperation({ summary: 'Health check for realtime stream connectivity' })
  ping() {
    return {
      status: 'online',
      serverTime: new Date().toISOString(),
      channels: ['ORDER_CREATED', 'ORDER_STATUS_CHANGED', 'STATION_STATUS_CHANGED', 'STAFF_CALL', 'SESSION_EXTENDED', 'PC_LOCK_EVENT'],
    };
  }
}
