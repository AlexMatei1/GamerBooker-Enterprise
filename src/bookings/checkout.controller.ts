import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { SessionPrincipal } from '../auth/auth.service';
import { SessionGuard } from '../auth/session.guard';
import { RequireVenueRole, VenueRoleGuard } from '../auth/venue-role.guard';
import { CheckoutService } from './checkout.service';
import type {
  PayBalanceInput,
  ScanCheckinInput,
  SoloCheckoutInput,
  PayBalanceOnlineInput,
  ReceiptFilterQuery,
  VoidReceiptInput,
} from './checkout.types';

interface AuthedRequest extends Request {
  auth?: SessionPrincipal;
}

@Controller()
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  // ---------------------------------------------------------------------------
  // Customer Checkout & QR (/v1/checkout, /v1/bookings)
  // ---------------------------------------------------------------------------

  @Post('checkout/solo')
  @UseGuards(SessionGuard)
  async soloCheckout(
    @Req() req: AuthedRequest,
    @Body() input: SoloCheckoutInput,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    const customerId = req.auth?.userId;
    if (!customerId) {
      throw new Error('AUTH_REQUIRED');
    }
    return this.checkoutService.executeSoloCheckout(
      customerId,
      input,
      idempotencyKey,
      requestId,
    );
  }

  @Get('bookings/:id/qr')
  @UseGuards(SessionGuard)
  async getBookingQr(
    @Req() req: AuthedRequest,
    @Param('id') bookingId: string,
  ) {
    const customerId = req.auth?.userId;
    if (!customerId) {
      throw new Error('AUTH_REQUIRED');
    }
    return this.checkoutService.getBookingQr(bookingId, customerId);
  }

  @Get('bookings/:id/balance')
  @UseGuards(SessionGuard)
  async getBookingBalance(
    @Req() req: AuthedRequest,
    @Param('id') bookingId: string,
  ) {
    const customerId = req.auth?.userId;
    return this.checkoutService.getBalanceSummary(bookingId, customerId);
  }

  // ---------------------------------------------------------------------------
  // Venue Staff Dashboard Check-in & Balance (/v1/dashboard/venues/:venue_id)
  // ---------------------------------------------------------------------------

  @Post('dashboard/venues/:venue_id/checkin')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async scanCheckin(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Body() input: ScanCheckinInput,
    @Headers('x-request-id') requestId?: string,
  ) {
    const staffId = req.auth?.userId;
    if (!staffId) {
      throw new Error('AUTH_REQUIRED');
    }
    return this.checkoutService.scanCheckin(venueId, staffId, input, requestId);
  }

  @Post('dashboard/venues/:venue_id/bookings/:id/pay-balance')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async payBalance(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Param('id') bookingId: string,
    @Body() input: PayBalanceInput,
    @Headers('x-request-id') requestId?: string,
  ) {
    const staffId = req.auth?.userId;
    if (!staffId) {
      throw new Error('AUTH_REQUIRED');
    }
    return this.checkoutService.payBalance(
      venueId,
      bookingId,
      staffId,
      input,
      requestId,
    );
  }

  // ---------------------------------------------------------------------------
  // ENG-304: Online Remaining Payment & Reception Ledger / Voiding
  // ---------------------------------------------------------------------------

  @Post('bookings/:id/pay-balance-online')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionGuard)
  async payBalanceOnline(
    @Req() req: AuthedRequest,
    @Param('id') bookingId: string,
    @Body() input?: PayBalanceOnlineInput,
    @Headers('x-request-id') requestId?: string,
  ) {
    const customerId = req.auth?.userId;
    if (!customerId) {
      throw new Error('AUTH_REQUIRED');
    }
    return this.checkoutService.createOnlineBalanceIntent(
      customerId,
      bookingId,
      input,
      requestId,
    );
  }

  @Post('payments/capture-balance')
  @HttpCode(HttpStatus.OK)
  async captureBalancePayment(
    @Body() body: { provider_ref: string },
    @Headers('x-request-id') requestId?: string,
  ) {
    if (!body?.provider_ref) {
      throw new Error('MISSING_PROVIDER_REF');
    }
    return this.checkoutService.handleBalancePaymentCaptured(body.provider_ref, requestId);
  }

  @Get('dashboard/venues/:venue_id/receipts')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async listReceipts(
    @Param('venue_id') venueId: string,
    @Query() query: ReceiptFilterQuery,
  ) {
    return this.checkoutService.listReceiptLedger(venueId, query);
  }

  @Post('dashboard/venues/:venue_id/receipts/:id/void')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async voidReceipt(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Param('id') receiptId: string,
    @Body() input: VoidReceiptInput,
    @Headers('x-request-id') requestId?: string,
  ) {
    const staffId = req.auth?.userId;
    if (!staffId) {
      throw new Error('AUTH_REQUIRED');
    }
    return this.checkoutService.voidReceipt(venueId, receiptId, staffId, input, requestId);
  }
}
