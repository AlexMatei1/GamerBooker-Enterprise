import { Module } from '@nestjs/common';
import { AuthController, MeController } from './auth.controller';
import { AuthService } from './auth.service';
import { MembershipService } from './membership.service';
import { MfaController } from './mfa.controller';
import { MfaService } from './mfa.service';
import { RateLimiter } from './rate-limit';
import { SessionGuard } from './session.guard';
import { VenueRoleGuard } from './venue-role.guard';

@Module({
  controllers: [AuthController, MeController, MfaController],
  providers: [
    AuthService,
    MfaService,
    MembershipService,
    SessionGuard,
    VenueRoleGuard,
    RateLimiter,
  ],
  exports: [AuthService, MembershipService, SessionGuard, VenueRoleGuard, RateLimiter],
})
export class AuthModule {}
