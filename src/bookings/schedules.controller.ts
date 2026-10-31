import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { RequireVenueRole, VenueRoleGuard } from '../auth/venue-role.guard';
import {
  SchedulesService,
  type OperatingScheduleInput,
  type ScheduleExceptionInput,
} from './schedules.service';

@Controller('dashboard/venues/:venue_id')
@UseGuards(SessionGuard, VenueRoleGuard)
export class SchedulesController {
  constructor(private readonly schedulesService: SchedulesService) {}

  @Get('schedule')
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async getSchedule(@Param('venue_id') venueId: string) {
    const schedules = await this.schedulesService.getWeeklySchedule(venueId);
    return { schedules };
  }

  @Put('schedule')
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async setSchedule(
    @Param('venue_id') venueId: string,
    @Body('schedules') schedules: OperatingScheduleInput[],
  ) {
    const updated = await this.schedulesService.setWeeklySchedule(venueId, schedules ?? []);
    return { schedules: updated };
  }

  @Get('exceptions')
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async getExceptions(@Param('venue_id') venueId: string) {
    const exceptions = await this.schedulesService.getExceptions(venueId);
    return { exceptions };
  }

  @Post('exceptions')
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async addException(
    @Param('venue_id') venueId: string,
    @Body() input: ScheduleExceptionInput,
  ) {
    const exception = await this.schedulesService.addException(venueId, input);
    return { exception };
  }

  @Delete('exceptions/:exception_id')
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async deleteException(
    @Param('venue_id') venueId: string,
    @Param('exception_id') exceptionId: string,
  ) {
    await this.schedulesService.deleteException(venueId, exceptionId);
    return { success: true };
  }
}
