import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SchedulesService } from './schedules.service';
import { AvailabilityService } from './availability.service';
import { PoliciesService } from './policies.service';
import { SchedulesController } from './schedules.controller';
import { AvailabilityController } from './availability.controller';
import { PoliciesController } from './policies.controller';

@Module({
  imports: [AuthModule],
  controllers: [SchedulesController, AvailabilityController, PoliciesController],
  providers: [SchedulesService, AvailabilityService, PoliciesService],
  exports: [SchedulesService, AvailabilityService, PoliciesService],
})
export class BookingsModule {}
