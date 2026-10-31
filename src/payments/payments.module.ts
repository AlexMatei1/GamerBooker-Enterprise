import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { SandboxPaymentProvider } from './sandbox-psp.provider';
import { WebhooksController } from './webhooks.controller';

@Module({
  controllers: [WebhooksController],
  providers: [PaymentsService, SandboxPaymentProvider],
  exports: [PaymentsService, SandboxPaymentProvider],
})
export class PaymentsModule {}
