import {
  Controller,
  Post,
  Param,
  Req,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { PaymentsService, type WebhookProcessResult } from './payments.service';

interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

@Controller('webhooks/payments')
export class WebhooksController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post(':provider')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Param('provider') provider: string,
    @Req() req: RequestWithRawBody,
    @Headers('x-psp-signature') xSignature?: string,
    @Headers('stripe-signature') stripeSignature?: string,
    @Headers('x-signature') genericSignature?: string,
  ): Promise<WebhookProcessResult> {
    const signature = xSignature || stripeSignature || genericSignature || '';

    // Prefer original raw byte buffer if captured by middleware; otherwise re-serialize
    const rawBody = req.rawBody
      ? req.rawBody
      : typeof req.body === 'string'
      ? Buffer.from(req.body, 'utf8')
      : Buffer.from(JSON.stringify(req.body ?? {}), 'utf8');

    return this.paymentsService.processWebhook(provider, rawBody, signature);
  }
}
