import { Module } from '@nestjs/common';
import { AuthController, MeController } from './auth.controller';
import { AuthService } from './auth.service';
import { RateLimiter } from './rate-limit';
import { SessionGuard } from './session.guard';

@Module({
  controllers: [AuthController, MeController],
  providers: [AuthService, SessionGuard, RateLimiter],
  exports: [AuthService, SessionGuard, RateLimiter],
})
export class AuthModule {}
