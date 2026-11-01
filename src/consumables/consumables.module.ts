import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ConsumablesService } from './consumables.service';
import { ConsumablesController } from './consumables.controller';

@Module({
  imports: [AuthModule],
  controllers: [ConsumablesController],
  providers: [ConsumablesService],
  exports: [ConsumablesService],
})
export class ConsumablesModule {}
