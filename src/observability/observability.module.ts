import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ObservabilityService } from './observability.service';
import { ObservabilityController } from './observability.controller';
import { SecurityHeadersMiddleware } from './security-headers.middleware';

@Module({
  imports: [AuthModule],
  providers: [ObservabilityService],
  controllers: [ObservabilityController],
  exports: [ObservabilityService],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SecurityHeadersMiddleware).forRoutes('*');
  }
}
