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
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { SessionPrincipal } from '../auth/auth.service';
import { MembershipService } from '../auth/membership.service';
import { SessionGuard } from '../auth/session.guard';
import { RequireVenueRole, VenueRoleGuard } from '../auth/venue-role.guard';
import { OperationsService } from './operations.service';
import type { CreateMaintenanceBlockDto } from './operations.types';

interface AuthedRequest extends Request {
  auth?: SessionPrincipal;
}

@Controller()
export class OperationsController {
  constructor(
    private readonly operationsService: OperationsService,
    private readonly membershipService: MembershipService,
  ) {}

  // ---------------------------------------------------------------------------
  // Live Floor Map
  // ---------------------------------------------------------------------------

  @Get('dashboard/venues/:venue_id/live-floor')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async getLiveFloor(
    @Param('venue_id') venueId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const floor = await this.operationsService.getLiveFloor(venueId);
    return floor;
  }

  // ---------------------------------------------------------------------------
  // Calendar & Reservations View
  // ---------------------------------------------------------------------------

  @Get('dashboard/venues/:venue_id/calendar')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async getCalendar(
    @Param('venue_id') venueId: string,
    @Query('from') fromStr: string,
    @Query('to') toStr: string,
    @Query('room_id') roomId?: string,
    @Query('zone_id') zoneId?: string,
    @Query('status') status?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    res?.setHeader('Cache-Control', 'no-store');
    const from = fromStr ? new Date(fromStr) : new Date(Date.now() - 24 * 3600 * 1000);
    const to = toStr ? new Date(toStr) : new Date(Date.now() + 7 * 24 * 3600 * 1000);

    const calendar = await this.operationsService.getCalendar(venueId, from, to, {
      roomId,
      zoneId,
      status,
    });
    return calendar;
  }

  // ---------------------------------------------------------------------------
  // Check-in Queue
  // ---------------------------------------------------------------------------

  @Get('dashboard/venues/:venue_id/checkin-queue')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async getCheckinQueue(
    @Param('venue_id') venueId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const queue = await this.operationsService.getCheckinQueue(venueId);
    return queue;
  }

  // ---------------------------------------------------------------------------
  // Maintenance Blocks
  // ---------------------------------------------------------------------------

  @Post('dashboard/venues/:venue_id/resources/:id/maintenance-blocks')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async createMaintenanceBlock(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Param('id') resourceId: string,
    @Body() body: CreateMaintenanceBlockDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const principal = req.auth as SessionPrincipal;
    const role = (await this.membershipService.roleFor(principal.userId, venueId)) ?? 'OWNER';
    const block = await this.operationsService.createMaintenanceBlock(
      venueId,
      resourceId,
      body,
      principal.userId,
      role,
    );
    return { maintenance_block: block };
  }

  @Get('dashboard/venues/:venue_id/maintenance-blocks')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async listMaintenanceBlocks(
    @Param('venue_id') venueId: string,
    @Query('resource_id') resourceId?: string,
    @Query('status') status?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    res?.setHeader('Cache-Control', 'no-store');
    const blocks = await this.operationsService.listMaintenanceBlocks(venueId, {
      resourceId,
      status,
    });
    return { maintenance_blocks: blocks };
  }

  @Post('dashboard/venues/:venue_id/maintenance-blocks/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async cancelMaintenanceBlock(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Param('id') blockId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const principal = req.auth as SessionPrincipal;
    const role = (await this.membershipService.roleFor(principal.userId, venueId)) ?? 'OWNER';
    const result = await this.operationsService.cancelMaintenanceBlock(
      venueId,
      blockId,
      principal.userId,
      role,
    );
    return result;
  }
}
