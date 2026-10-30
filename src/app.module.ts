import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { DevAuthModule } from './auth/dev.module';
import { HealthModule } from './health/health.module';

// The development-only routes are not merely guarded, they are not registered:
// outside development DevAuthModule is never imported, so /v1/dev/* does not
// exist in the router at all.
const devImports = process.env.NODE_ENV === 'development' ? [DevAuthModule] : [];

@Module({
  imports: [HealthModule, AuthModule, ...devImports],
})
export class AppModule {}
