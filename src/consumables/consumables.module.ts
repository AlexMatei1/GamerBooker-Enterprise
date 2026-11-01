import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';
import { ConsumablesService } from './consumables.service';
import { ConsumablesController } from './consumables.controller';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';

@Module({
  imports: [AuthModule, PaymentsModule],
  controllers: [ConsumablesController, OrdersController],
  providers: [ConsumablesService, OrdersService],
  exports: [ConsumablesService, OrdersService],
})
export class ConsumablesModule {}
