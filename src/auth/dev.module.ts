import { Module } from '@nestjs/common';
import { AuthModule } from './auth.module';
import { DevController } from './dev.controller';

/**
 * Holds the development-only routes. AppModule imports this module only when
 * NODE_ENV=development, so outside development the controller is never
 * instantiated and the route cannot be reached.
 */
@Module({
  imports: [AuthModule],
  controllers: [DevController],
})
export class DevAuthModule {}
