import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SchedulesService } from './schedules.service';
import { AvailabilityService } from './availability.service';
import { PoliciesService } from './policies.service';
import { PricingService } from './pricing.service';
import { QuotesService } from './quotes.service';
import { HoldsService } from './holds.service';
import { SchedulesController } from './schedules.controller';
import { AvailabilityController } from './availability.controller';
import { PoliciesController } from './policies.controller';
import { QuotesController } from './quotes.controller';
import { HoldsController } from './holds.controller';

@Module({
  imports: [AuthModule],
  controllers: [
    SchedulesController,
    AvailabilityController,
    PoliciesController,
    QuotesController,
    HoldsController,
  ],
  providers: [
    SchedulesService,
    AvailabilityService,
    PoliciesService,
    PricingService,
    QuotesService,
    HoldsService,
  ],
  exports: [
    SchedulesService,
    AvailabilityService,
    PoliciesService,
    PricingService,
    QuotesService,
    HoldsService,
  ],
})
export class BookingsModule {}
