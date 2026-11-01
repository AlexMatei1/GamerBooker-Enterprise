import { Controller, Get, Param, Req, UseGuards, HttpStatus } from '@nestjs/common';
import type { Request } from 'express';
import type { SessionPrincipal } from '../auth/auth.service';
import { SessionGuard } from '../auth/session.guard';
import { AuthHttpError } from '../auth/auth-error';
import { ReceiptsService } from './receipts.service';
import { OrderStatusService } from './order-status.service';

interface AuthedRequest extends Request {
  auth?: SessionPrincipal;
}

@Controller()
export class ReceiptsController {
  constructor(
    private readonly receiptsService: ReceiptsService,
    private readonly orderStatusService: OrderStatusService,
  ) {}

  @Get('bookings/:id/receipt')
  @UseGuards(SessionGuard)
  async getBookingReceipt(@Req() req: AuthedRequest, @Param('id') bookingId: string) {
    const userId = req.auth?.userId;
    if (!userId) {
      throw new AuthHttpError(HttpStatus.UNAUTHORIZED, 'AUTH_REQUIRED', 'Authentication required.');
    }
    return this.receiptsService.getBookingReceipt(bookingId, userId);
  }

  @Get('orders/:id/status-flow')
  @UseGuards(SessionGuard)
  async getOrderStatusFlow(@Req() req: AuthedRequest, @Param('id') orderId: string) {
    const userId = req.auth?.userId;
    if (!userId) {
      throw new AuthHttpError(HttpStatus.UNAUTHORIZED, 'AUTH_REQUIRED', 'Authentication required.');
    }
    return this.orderStatusService.getOrderStatusFlow(orderId, userId);
  }
}
