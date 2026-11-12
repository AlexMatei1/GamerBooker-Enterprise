import { Module } from '@nestjs/common';
import { AuthController, MeController } from './auth.controller';
import { AuthService } from './auth.service';
import { MembershipService } from './membership.service';
import { MfaController } from './mfa.controller';
import { MfaService } from './mfa.service';
import { RateLimiter } from './rate-limit';
import { SessionGuard } from './session.guard';
import { VenueRoleGuard } from './venue-role.guard';
import { PlatformAdminGuard } from './platform-admin.guard';
import { LocalAdminPolicy } from './local-admin-policy';

@Module({
  controllers: [AuthController, MeController, MfaController],
  providers: [
    AuthService,
    MfaService,
    MembershipService,
    SessionGuard,
    VenueRoleGuard,
    RateLimiter,
    PlatformAdminGuard,
    LocalAdminPolicy,
  ],
  exports: [AuthService, MembershipService, SessionGuard, VenueRoleGuard, PlatformAdminGuard, RateLimiter, LocalAdminPolicy],
})
export class AuthModule {}
