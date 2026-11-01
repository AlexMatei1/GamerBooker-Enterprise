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
import { RefundsService } from './refunds.service';
import { ReconciliationService } from './reconciliation.service';
import type {
  RequestRefundInput,
  RefundListFilter,
  CloseDailyReportInput,
  AcknowledgeAlertInput,
} from './refunds.types';

interface AuthedRequest extends Request {
  auth?: SessionPrincipal;
}

@Controller('dashboard/venues/:venue_id')
@UseGuards(SessionGuard, VenueRoleGuard)
export class ReconciliationController {
  constructor(
    private readonly refundsService: RefundsService,
    private readonly reconciliationService: ReconciliationService,
  ) {}

  // ---------------------------------------------------------------------------
  // Refunds Management
  // ---------------------------------------------------------------------------

  @Get('refunds')
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async listRefunds(
    @Param('venue_id') venueId: string,
    @Query() query: RefundListFilter,
  ) {
    return this.refundsService.listRefunds(venueId, query);
  }

  @Post('refunds')
  @HttpCode(HttpStatus.CREATED)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async requestRefund(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Body() input: RequestRefundInput,
    @Headers('x-request-id') requestId?: string,
  ) {
    const staffId = req.auth?.userId;
    if (!staffId) {
      throw new Error('AUTH_REQUIRED');
    }
    // We can extract staff role from session or membership; the guard already validated membership
    // In our guard, if canActivate passed, req.auth has user info. We query role or default to manager/reception
    const pool = (await import('../db/pool')).getPool();
    const roleRes = await pool.query<{ role: string }>(
      'SELECT role FROM venue_memberships WHERE venue_id = $1 AND user_id = $2',
      [venueId, staffId],
    );
    const staffRole = roleRes.rows[0]?.role || 'RECEPTION';

    return this.refundsService.requestRefund(venueId, staffId, staffRole, input, requestId);
  }

  @Post('refunds/:id/approve')
  @HttpCode(HttpStatus.OK)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async approveRefund(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Param('id') refundId: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    const managerId = req.auth?.userId;
    if (!managerId) {
      throw new Error('AUTH_REQUIRED');
    }
    return this.refundsService.approveRefund(venueId, refundId, managerId, requestId);
  }

  @Post('refunds/:id/process')
  @HttpCode(HttpStatus.OK)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async processRefund(
    @Param('venue_id') venueId: string,
    @Param('id') refundId: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.refundsService.processRefund(venueId, refundId, requestId);
  }

  @Post('refunds/:id/retry')
  @HttpCode(HttpStatus.OK)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async retryRefund(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Param('id') refundId: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    const managerId = req.auth?.userId;
    if (!managerId) {
      throw new Error('AUTH_REQUIRED');
    }
    return this.refundsService.retryRefund(venueId, refundId, managerId, requestId);
  }

  // ---------------------------------------------------------------------------
  // Daily Reconciliation Report
  // ---------------------------------------------------------------------------

  @Get('reconciliation/daily')
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async getDailyReport(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Query('date') dateQuery?: string,
  ) {
    const staffId = req.auth?.userId;
    const targetDate = dateQuery || new Date().toISOString().split('T')[0];
    return this.reconciliationService.generateDailyReport(venueId, targetDate, staffId);
  }

  @Post('reconciliation/daily/close')
  @HttpCode(HttpStatus.OK)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async closeDailyReport(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Query('date') dateQuery?: string,
    @Body() input?: CloseDailyReportInput,
  ) {
    const managerId = req.auth?.userId;
    if (!managerId) {
      throw new Error('AUTH_REQUIRED');
    }
    const targetDate = dateQuery || new Date().toISOString().split('T')[0];
    return this.reconciliationService.closeDailyReport(venueId, targetDate, managerId, input);
  }

  // ---------------------------------------------------------------------------
  // Reconciliation Alerts
  // ---------------------------------------------------------------------------

  @Get('reconciliation/alerts')
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async listAlerts(
    @Param('venue_id') venueId: string,
    @Query('status') statusFilter?: 'OPEN' | 'ACKNOWLEDGED' | 'ALL',
  ) {
    return this.reconciliationService.listAlerts(venueId, statusFilter || 'ALL');
  }

  @Post('reconciliation/alerts/:id/acknowledge')
  @HttpCode(HttpStatus.OK)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async acknowledgeAlert(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Param('id') alertId: string,
    @Body() input?: AcknowledgeAlertInput,
  ) {
    const managerId = req.auth?.userId;
    if (!managerId) {
      throw new Error('AUTH_REQUIRED');
    }
    return this.reconciliationService.acknowledgeAlert(venueId, alertId, managerId, input);
  }
}
