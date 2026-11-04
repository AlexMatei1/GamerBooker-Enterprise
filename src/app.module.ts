import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { DevAuthModule } from './auth/dev.module';
import { HealthModule } from './health/health.module';
import { VenuesModule } from './venues/venues.module';
import { PaymentsModule } from './payments/payments.module';
import { BookingsModule } from './bookings/bookings.module';
import { ConsumablesModule } from './consumables/consumables.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AccessibilityModule } from './accessibility/accessibility.module';
import { ObservabilityModule } from './observability/observability.module';
import { ComplianceModule } from './compliance/compliance.module';
import { OperationsModule } from './operations/operations.module';
import { EventsModule } from './events/events.module';

// The development-only routes are not merely guarded, they are not registered:
// outside development DevAuthModule is never imported, so /v1/dev/* does not
// exist in the router at all.
const devImports = process.env.NODE_ENV === 'development' ? [DevAuthModule] : [];

@Module({
  imports: [
    HealthModule,
    AuthModule,
    VenuesModule,
    PaymentsModule,
    BookingsModule,
    ConsumablesModule,
    NotificationsModule,
    AccessibilityModule,
    ObservabilityModule,
    ComplianceModule,
    OperationsModule,
    EventsModule,
    ...devImports,
  ],
})
export class AppModule {}
