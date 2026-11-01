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
  BadRequestException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { SessionPrincipal } from '../auth/auth.service';
import { MembershipService } from '../auth/membership.service';
import { SessionGuard } from '../auth/session.guard';
import { RequireVenueRole, VenueRoleGuard } from '../auth/venue-role.guard';
import { LayoutPublishService } from './layout-publish.service';
import type {
  PublishLayoutDto,
  RollbackLayoutDto,
} from './layout-publish.types';

interface AuthedRequest extends Request {
  auth?: SessionPrincipal;
}

@Controller()
export class LayoutPublishController {
  constructor(
    private readonly publishService: LayoutPublishService,
    private readonly membershipService: MembershipService,
  ) {}

  @Post('dashboard/venues/:venue_id/layout/validate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async validateDraft(
    @Param('venue_id') venueId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const result = await this.publishService.validateDraft(venueId);
    return result;
  }

  @Post('dashboard/venues/:venue_id/layout/publish')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async publishDraft(
    @Param('venue_id') venueId: string,
    @Body() body: PublishLayoutDto,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    if (typeof body?.expected_draft_revision !== 'number') {
      throw new BadRequestException({
        code: 'MISSING_EXPECTED_DRAFT_REVISION',
        message: 'Must provide expected_draft_revision for optimistic publication guard',
      });
    }

    const principal = req.auth as SessionPrincipal;
    const role = (await this.membershipService.roleFor(principal.userId, venueId)) ?? 'OWNER';
    const requestId = (req.headers['x-request-id'] as string) || '';

    const revision = await this.publishService.publishDraft(
      venueId,
      principal.userId,
      role,
      body,
      requestId,
    );
    return { revision };
  }

  @Post('dashboard/venues/:venue_id/layout/rollback')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async rollbackLayout(
    @Param('venue_id') venueId: string,
    @Body() body: RollbackLayoutDto,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    if (typeof body?.target_revision_number !== 'number') {
      throw new BadRequestException({
        code: 'MISSING_TARGET_REVISION_NUMBER',
        message: 'Must provide target_revision_number to rollback to',
      });
    }

    const principal = req.auth as SessionPrincipal;
    const role = (await this.membershipService.roleFor(principal.userId, venueId)) ?? 'OWNER';
    const requestId = (req.headers['x-request-id'] as string) || '';

    const revision = await this.publishService.rollbackLayout(
      venueId,
      principal.userId,
      role,
      body,
      requestId,
    );
    return { revision, rolled_back: true };
  }

  @Get('dashboard/venues/:venue_id/layout/revisions')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async listRevisions(
    @Param('venue_id') venueId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const revisions = await this.publishService.listRevisions(venueId);
    return { revisions };
  }

  @Get('dashboard/venues/:venue_id/layout/preview')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async getPreview(
    @Param('venue_id') venueId: string,
    @Res({ passthrough: true }) res: Response,
    @Query('draft') draftParam?: string,
    @Query('from') fromStr?: string,
    @Query('to') toStr?: string,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const isDraft = draftParam === 'true';
    const preview = await this.publishService.getCustomerPreview(
      venueId,
      isDraft,
      fromStr,
      toStr,
    );
    return { preview };
  }
}
