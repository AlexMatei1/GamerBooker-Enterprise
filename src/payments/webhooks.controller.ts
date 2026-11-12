import {
  BadRequestException,
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

    // A signature is a MAC over the bytes the PSP sent. Re-serialising a parsed
    // body changes key order and whitespace, so a hash computed over it would not
    // be the PSP's signature: accepting that fallback would mean verifying
    // nothing. When raw capture is absent the only truthful answer is to refuse.
    const rawBody = req.rawBody;
    if (!rawBody || !Buffer.isBuffer(rawBody)) {
      throw new BadRequestException({
        code: 'WEBHOOK_RAW_BODY_MISSING',
        message: 'Raw webhook body is required to verify the provider signature.',
      });
    }

    return this.paymentsService.processWebhook(provider, rawBody, signature);
  }
}
