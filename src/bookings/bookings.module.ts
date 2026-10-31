import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SchedulesService } from './schedules.service';
import { AvailabilityService } from './availability.service';
import { SchedulesController } from './schedules.controller';
import { AvailabilityController } from './availability.controller';

@Module({
  imports: [AuthModule],
  controllers: [SchedulesController, AvailabilityController],
  providers: [SchedulesService, AvailabilityService],
  exports: [SchedulesService, AvailabilityService],
})
export class BookingsModule {}
