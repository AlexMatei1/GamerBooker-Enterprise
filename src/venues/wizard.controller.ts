import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { SessionPrincipal } from '../auth/auth.service';
import { MembershipService, type VenueRole } from '../auth/membership.service';
import { SessionGuard } from '../auth/session.guard';
import { RequireVenueRole, VenueRoleGuard } from '../auth/venue-role.guard';
import { WizardService } from './wizard.service';

interface AuthedRequest extends Request {
  auth?: SessionPrincipal;
}

@Controller()
export class WizardController {
  constructor(
    private readonly wizardService: WizardService,
    private readonly membershipService: MembershipService,
  ) {}

  // ---------------------------------------------------------------------------
  // Wizard & Publication Gates
  // ---------------------------------------------------------------------------

  @Get('dashboard/venues/:venue_id/wizard-progress')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async getWizardProgress(
    @Param('venue_id') venueId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const progress = await this.wizardService.getWizardProgress(venueId);
    return progress;
  }

  @Get('dashboard/venues/:venue_id/publish-gates')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async getPublishGates(
    @Param('venue_id') venueId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const gates = await this.wizardService.getPublishGates(venueId);
    return gates;
  }

  @Post('dashboard/venues/:venue_id/publish')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER')
  async publishVenue(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const principal = req.auth as SessionPrincipal;
    const role = (await this.membershipService.roleFor(principal.userId, venueId)) ?? 'OWNER';
    const venue = await this.wizardService.publishVenue(venueId, principal.userId, role);
    return { venue };
  }

  @Post('dashboard/venues/:venue_id/unpublish')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER')
  async unpublishVenue(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const principal = req.auth as SessionPrincipal;
    const role = (await this.membershipService.roleFor(principal.userId, venueId)) ?? 'OWNER';
    const venue = await this.wizardService.unpublishVenue(venueId, principal.userId, role);
    return { venue };
  }

  // ---------------------------------------------------------------------------
  // Staff Invitations & Permissions
  // ---------------------------------------------------------------------------

  @Post('dashboard/venues/:venue_id/staff/invitations')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async createInvitation(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Body() body: { email: string; role: VenueRole },
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const principal = req.auth as SessionPrincipal;
    const role = (await this.membershipService.roleFor(principal.userId, venueId)) ?? 'OWNER';
    const invitation = await this.wizardService.createStaffInvitation(
      venueId,
      principal.userId,
      role,
      body.email,
      body.role,
    );
    return { invitation };
  }

  @Get('dashboard/venues/:venue_id/staff/invitations')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async listInvitations(
    @Param('venue_id') venueId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const invitations = await this.wizardService.listStaffInvitations(venueId);
    return { invitations };
  }

  @Post('dashboard/venues/:venue_id/staff/invitations/:id/revoke')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async revokeInvitation(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Param('id') invitationId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const principal = req.auth as SessionPrincipal;
    const role = (await this.membershipService.roleFor(principal.userId, venueId)) ?? 'OWNER';
    const result = await this.wizardService.revokeStaffInvitation(
      venueId,
      invitationId,
      principal.userId,
      role,
    );
    return result;
  }

  @Post('auth/invitations/accept')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard)
  async acceptInvitation(
    @Req() req: AuthedRequest,
    @Body() body: { token: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const principal = req.auth as SessionPrincipal;
    const result = await this.wizardService.acceptStaffInvitation(body.token, principal.userId);
    return result;
  }

  @Delete('dashboard/venues/:venue_id/memberships/:membership_id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER')
  async removeMembership(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Param('membership_id') membershipId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const principal = req.auth as SessionPrincipal;
    const role = (await this.membershipService.roleFor(principal.userId, venueId)) ?? 'OWNER';
    const result = await this.wizardService.removeMembership(
      venueId,
      membershipId,
      principal.userId,
      role,
    );
    return result;
  }
}
