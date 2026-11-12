import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { SessionPrincipal } from '../auth/auth.service';
import { SessionGuard } from '../auth/session.guard';
import { RequireVenueRole, VenueRoleGuard } from '../auth/venue-role.guard';
import { BookingsService } from './bookings.service';
import type {
  ConfirmBookingInput,
  TransitionBookingInput,
} from './bookings.types';

interface AuthedRequest extends Request {
  auth?: SessionPrincipal;
}

@Controller()
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  // ---------------------------------------------------------------------------
  // Customer Bookings API (/v1/bookings)
  // ---------------------------------------------------------------------------

  @Post('bookings/confirm')
  @UseGuards(SessionGuard)
  async confirmBooking(
    @Req() req: AuthedRequest,
    @Body() input: ConfirmBookingInput,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    const customerId = req.auth?.userId;
    if (!customerId) {
      throw new Error('AUTH_REQUIRED');
    }
    return this.bookingsService.confirmBooking(
      customerId,
      input,
      idempotencyKey,
      requestId,
    );
  }

  @Get('bookings/:id')
  @UseGuards(SessionGuard)
  async getBooking(
    @Req() req: AuthedRequest,
    @Param('id') bookingId: string,
  ) {
    const customerId = req.auth?.userId;
    return this.bookingsService.getBookingById(bookingId, customerId);
  }

  @Get('bookings/code/:code')
  @UseGuards(SessionGuard)
  async getBookingByCode(
    @Req() req: AuthedRequest,
    @Param('code') code: string,
  ) {
    const customerId = req.auth?.userId;
    return this.bookingsService.getBookingByCode(code, customerId);
  }

  @Post('bookings/:id/cancel')
  @UseGuards(SessionGuard)
  async cancelBooking(
    @Req() req: AuthedRequest,
    @Param('id') bookingId: string,
    @Body() body: { expected_version: number; reason?: string },
    @Headers('x-request-id') requestId?: string,
  ) {
    const customerId = req.auth?.userId;
    if (!customerId) {
      throw new Error('AUTH_REQUIRED');
    }
    return this.bookingsService.transitionBooking(
      bookingId,
      customerId,
      {
        target_status: 'CANCELLED',
        expected_version: body.expected_version,
        reason: body.reason,
      },
      { actorRole: 'CUSTOMER' },
      requestId,
    );
  }

  // ---------------------------------------------------------------------------
  // Venue Staff Dashboard Bookings API (/v1/dashboard/venues/:venue_id/bookings)
  // ---------------------------------------------------------------------------

  @Get('dashboard/venues/:venue_id/bookings')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async listVenueBookings(@Param('venue_id') venueId: string) {
    const bookings = await this.bookingsService.listVenueBookings(venueId);
    return { bookings };
  }

  @Post('dashboard/venues/:venue_id/bookings/:id/transition')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async transitionVenueBooking(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Param('id') bookingId: string,
    @Body() input: TransitionBookingInput,
    @Headers('x-request-id') requestId?: string,
  ) {
    const actorId = req.auth?.userId;
    if (!actorId) {
      throw new Error('AUTH_REQUIRED');
    }
    return this.bookingsService.transitionBooking(
      bookingId,
      actorId,
      input,
      { actorRole: 'STAFF', venueId },
      requestId,
    );
  }
}
