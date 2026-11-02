import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BookingsModule } from '../bookings/bookings.module';
import { DeepLinkService } from './deeplink.service';
import { AccessibilityService } from './accessibility.service';
import { DeepLinkController } from './deeplink.controller';
import { AccessibilityController } from './accessibility.controller';

@Module({
  imports: [AuthModule, BookingsModule],
  providers: [DeepLinkService, AccessibilityService],
  controllers: [DeepLinkController, AccessibilityController],
  exports: [DeepLinkService, AccessibilityService],
})
export class AccessibilityModule {}
