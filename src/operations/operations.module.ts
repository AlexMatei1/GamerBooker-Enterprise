import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';
import { RunbooksService } from './runbooks.service';
import {
  RunbooksController,
  TrainingController,
  PilotMetricsController,
} from './runbooks.controller';

@Module({
  imports: [AuthModule, PaymentsModule],
  controllers: [
    RunbooksController,
    TrainingController,
    PilotMetricsController,
  ],
  providers: [RunbooksService],
  exports: [RunbooksService],
})
export class OperationsModule {}
