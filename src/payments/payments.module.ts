import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PaymentsService } from './payments.service';
import { SandboxPaymentProvider } from './sandbox-psp.provider';
import { WebhooksController } from './webhooks.controller';
import { RefundsService } from './refunds.service';
import { ReconciliationService } from './reconciliation.service';
import { ReconciliationController } from './reconciliation.controller';

@Module({
  imports: [AuthModule],
  controllers: [WebhooksController, ReconciliationController],
  providers: [
    PaymentsService,
    SandboxPaymentProvider,
    RefundsService,
    ReconciliationService,
  ],
  exports: [
    PaymentsService,
    SandboxPaymentProvider,
    RefundsService,
    ReconciliationService,
  ],
})
export class PaymentsModule {}
