import { Controller, Get } from '@nestjs/common';

/** Public event injection and global streams stay unregistered until tenant-bound. */
@Controller('events')
export class EventsController {
  @Get('ping') ping(){return {status:'stream_disabled',serverTime:new Date().toISOString()};}
}
