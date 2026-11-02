import {
  Body,
  Controller,
  Get,
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
import { RunbooksService } from './runbooks.service';
import type {
  RunbookR2OrphanPaymentInput,
  RunbookR6OutOfStockInput,
} from './runbooks.types';

interface AuthedRequest extends Request {
  auth?: SessionPrincipal;
}

@Controller('runbooks')
export class RunbooksController {
  constructor(private readonly runbooksService: RunbooksService) {}

  @Get('r1-double-booking-audit')
  @UseGuards(SessionGuard)
  async auditDoubleBooking(
    @Query('resource_id') resourceId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.runbooksService.auditDoubleBooking(resourceId, from, to);
  }

  @Post('r2-orphan-payment-resolution')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.OK)
  async resolveOrphanPayment(
    @Body() input: RunbookR2OrphanPaymentInput,
    @Req() req: AuthedRequest,
  ) {
    return this.runbooksService.resolveOrphanPayment(input, req.auth?.userId);
  }

  @Get('r3-receivable-reconciliation')
  @UseGuards(SessionGuard)
  async auditReceivables(
    @Query('venue_id') venueId: string,
    @Query('date') date: string,
  ) {
    return this.runbooksService.auditReceivables(venueId, date);
  }

  @Get('r4-publish-diagnostics')
  @UseGuards(SessionGuard)
  async diagnosePublish(@Query('venue_id') venueId: string) {
    return this.runbooksService.diagnoseLayoutPublish(venueId);
  }

  @Get('r5-offline-checkin-contingency')
  getOfflineContingency() {
    return this.runbooksService.getOfflineContingency();
  }

  @Post('r6-out-of-stock-action')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.OK)
  async handleOutOfStock(@Body() input: RunbookR6OutOfStockInput) {
    return this.runbooksService.handleOutOfStockProduct(input);
  }
}

@Controller('training')
export class TrainingController {
  constructor(private readonly runbooksService: RunbooksService) {}

  @Get('curriculum')
  getCurriculum() {
    return { modules: this.runbooksService.getTrainingCurriculum() };
  }

  @Post('certifications')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.CREATED)
  async certifyStaff(
    @Req() req: AuthedRequest,
    @Body()
    body: {
      tenant_id: string;
      venue_id: string;
      user_id: string;
      module_id: string;
      score?: number;
    },
  ) {
    const certifiedBy = req.auth?.userId;
    return this.runbooksService.certifyStaff(
      body.tenant_id,
      body.venue_id,
      body.user_id,
      body.module_id,
      certifiedBy,
      body.score ?? 100,
    );
  }

  @Get('venues/:venue_id/staff-readiness')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async getStaffReadiness(@Param('venue_id') venueId: string) {
    return this.runbooksService.getVenueStaffReadiness(venueId);
  }
}

@Controller('dashboard/venues/:venue_id')
export class PilotMetricsController {
  constructor(private readonly runbooksService: RunbooksService) {}

  @Get('pilot-metrics')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async getPilotMetrics(
    @Param('venue_id') venueId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.runbooksService.getPilotMetrics(venueId, from, to);
  }

  @Get('go-no-go')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async evaluateGoNoGo(@Param('venue_id') venueId: string) {
    return this.runbooksService.evaluateGoNoGo(venueId);
  }
}
