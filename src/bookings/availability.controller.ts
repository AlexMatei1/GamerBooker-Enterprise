import { Controller, Get, Param, Query } from '@nestjs/common';
import { AvailabilityService } from './availability.service';

@Controller('venues')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get(':venue_id/availability')
  async getAvailability(
    @Param('venue_id') venueId: string,
    @Query('from') fromStr?: string,
    @Query('to') toStr?: string,
    @Query('resource_type') resourceType?: string,
  ) {
    const now = new Date();
    const from = fromStr ? new Date(fromStr) : now;
    const to = toStr
      ? new Date(toStr)
      : new Date(from.getTime() + 24 * 60 * 60 * 1000); // default +24h

    return this.availabilityService.getAvailability(venueId, from, to, resourceType);
  }
}
