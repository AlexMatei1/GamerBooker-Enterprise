import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { VenuesController } from './venues.controller';

@Module({
  imports: [AuthModule],
  controllers: [VenuesController],
})
export class VenuesModule {}
