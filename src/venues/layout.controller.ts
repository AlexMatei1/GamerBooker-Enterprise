import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
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
import { LayoutService } from './layout.service';
import type { UpdateDraftDto, GeneratePresetDto } from './layout.types';

interface AuthedRequest extends Request {
  auth?: SessionPrincipal;
}

@Controller()
export class LayoutController {
  constructor(
    private readonly layoutService: LayoutService,
    private readonly membershipService: MembershipService,
  ) {}

  @Get('dashboard/venues/:venue_id/layout/draft')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async getDraft(
    @Param('venue_id') venueId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const draft = await this.layoutService.getDraft(venueId);
    return { draft };
  }

  @Put('dashboard/venues/:venue_id/layout/draft')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async updateDraft(
    @Param('venue_id') venueId: string,
    @Body() body: UpdateDraftDto,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    if (typeof body?.expected_revision !== 'number') {
      throw new BadRequestException({
        code: 'MISSING_EXPECTED_REVISION',
        message: 'Must provide expected_revision for optimistic concurrency control',
      });
    }

    const principal = req.auth as SessionPrincipal;
    const role = (await this.membershipService.roleFor(principal.userId, venueId)) ?? 'OWNER';
    const requestId = (req.headers['x-request-id'] as string) || '';

    const draft = await this.layoutService.updateDraft(
      venueId,
      principal.userId,
      role,
      body,
      requestId,
    );
    return { draft };
  }

  @Post('dashboard/venues/:venue_id/layout/draft/reset')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async resetDraft(
    @Param('venue_id') venueId: string,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const principal = req.auth as SessionPrincipal;
    const role = (await this.membershipService.roleFor(principal.userId, venueId)) ?? 'OWNER';
    const requestId = (req.headers['x-request-id'] as string) || '';

    const draft = await this.layoutService.resetDraft(
      venueId,
      principal.userId,
      role,
      requestId,
    );
    return { draft, reset: true };
  }

  @Get('dashboard/venues/:venue_id/layout/presets')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async listPresets(
    @Param('venue_id') venueId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const presets = this.layoutService.listPresets();
    return { presets };
  }

  @Post('dashboard/venues/:venue_id/layout/presets/generate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async generatePreset(
    @Param('venue_id') venueId: string,
    @Body() body: GeneratePresetDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    if (!body?.template_type) {
      throw new BadRequestException({
        code: 'MISSING_TEMPLATE_TYPE',
        message: 'Must provide valid template_type',
      });
    }

    const result = this.layoutService.generatePreset(body);
    return result;
  }
}
