import {
  Body,
  Controller,
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
import { LifecycleService } from './lifecycle.service';
import type {
  ExtendSessionInput,
  NoShowVerificationInput,
  RescheduleInput,
} from './lifecycle.types';

interface AuthedRequest extends Request {
  auth?: SessionPrincipal;
}

@Controller()
export class LifecycleController {
  constructor(private readonly lifecycleService: LifecycleService) {}

  // ---------------------------------------------------------------------------
  // Customer Booking Operations (/v1/bookings)
  // ---------------------------------------------------------------------------

  @Post('bookings/:id/cancel-policy')
  @UseGuards(SessionGuard)
  async cancelWithPolicy(
    @Req() req: AuthedRequest,
    @Param('id') bookingId: string,
    @Body() body: { reason?: string },
    @Headers('x-request-id') requestId?: string,
  ) {
    const customerId = req.auth?.userId;
    if (!customerId) {
      throw new Error('AUTH_REQUIRED');
    }
    return this.lifecycleService.cancelWithPolicy(
      bookingId,
      customerId,
      body.reason,
      requestId,
    );
  }

  @Post('bookings/:id/reschedule')
  @UseGuards(SessionGuard)
  async rescheduleBooking(
    @Req() req: AuthedRequest,
    @Param('id') bookingId: string,
    @Body() input: RescheduleInput,
    @Headers('x-request-id') requestId?: string,
  ) {
    const customerId = req.auth?.userId;
    if (!customerId) {
      throw new Error('AUTH_REQUIRED');
    }
    return this.lifecycleService.rescheduleBooking(
      bookingId,
      customerId,
      input,
      requestId,
    );
  }

  @Post('bookings/:id/extend')
  @UseGuards(SessionGuard)
  async extendSession(
    @Req() req: AuthedRequest,
    @Param('id') bookingId: string,
    @Body() input: ExtendSessionInput,
    @Headers('x-request-id') requestId?: string,
  ) {
    const customerId = req.auth?.userId;
    if (!customerId) {
      throw new Error('AUTH_REQUIRED');
    }
    return this.lifecycleService.extendSession(
      bookingId,
      customerId,
      input,
      requestId,
    );
  }

  // ---------------------------------------------------------------------------
  // Venue Staff Dashboard Operations (/v1/dashboard/venues/:venue_id)
  // ---------------------------------------------------------------------------

  @Post('dashboard/venues/:venue_id/bookings/:id/no-show')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async verifyNoShow(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Param('id') bookingId: string,
    @Body() input: NoShowVerificationInput,
    @Headers('x-request-id') requestId?: string,
  ) {
    const staffId = req.auth?.userId;
    if (!staffId) {
      throw new Error('AUTH_REQUIRED');
    }
    return this.lifecycleService.verifyNoShow(
      venueId,
      bookingId,
      staffId,
      input,
      requestId,
    );
  }

  @Post('dashboard/venues/:venue_id/bookings/:id/extend')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async staffExtendSession(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Param('id') bookingId: string,
    @Body() input: ExtendSessionInput,
    @Headers('x-request-id') requestId?: string,
  ) {
    const staffId = req.auth?.userId;
    if (!staffId) {
      throw new Error('AUTH_REQUIRED');
    }
    return this.lifecycleService.extendSession(
      bookingId,
      staffId,
      input,
      requestId,
      venueId,
    );
  }
}
