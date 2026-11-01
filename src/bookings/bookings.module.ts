import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';
import { SchedulesService } from './schedules.service';
import { AvailabilityService } from './availability.service';
import { PoliciesService } from './policies.service';
import { PricingService } from './pricing.service';
import { QuotesService } from './quotes.service';
import { HoldsService } from './holds.service';
import { BookingsService } from './bookings.service';
import { CheckoutService } from './checkout.service';
import { LifecycleService } from './lifecycle.service';
import { GroupService } from './group.service';
import { PackagesService } from './packages.service';
import { SchedulesController } from './schedules.controller';
import { AvailabilityController } from './availability.controller';
import { PoliciesController } from './policies.controller';
import { QuotesController } from './quotes.controller';
import { HoldsController } from './holds.controller';
import { BookingsController } from './bookings.controller';
import { CheckoutController } from './checkout.controller';
import { LifecycleController } from './lifecycle.controller';
import { GroupController } from './group.controller';
import { PackagesController } from './packages.controller';

@Module({
  imports: [AuthModule, PaymentsModule],
  controllers: [
    SchedulesController,
    AvailabilityController,
    PoliciesController,
    QuotesController,
    HoldsController,
    BookingsController,
    CheckoutController,
    LifecycleController,
    GroupController,
    PackagesController,
  ],
  providers: [
    SchedulesService,
    AvailabilityService,
    PoliciesService,
    PricingService,
    QuotesService,
    HoldsService,
    BookingsService,
    CheckoutService,
    LifecycleService,
    GroupService,
    PackagesService,
  ],
  exports: [
    SchedulesService,
    AvailabilityService,
    PoliciesService,
    PricingService,
    QuotesService,
    HoldsService,
    BookingsService,
    CheckoutService,
    LifecycleService,
    GroupService,
    PackagesService,
  ],
})
export class BookingsModule {}
