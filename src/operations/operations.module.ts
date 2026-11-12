import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';
import { GoogleSheetsService } from './google-sheets.service';
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
  providers: [RunbooksService, GoogleSheetsService],
  exports: [RunbooksService, GoogleSheetsService],
})
export class OperationsModule {}
