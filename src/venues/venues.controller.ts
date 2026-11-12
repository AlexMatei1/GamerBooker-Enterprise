import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { SessionPrincipal } from '../auth/auth.service';
import {
  MembershipService,
  VENUE_ROLES,
  type VenueRole,
  type VenueSummary,
} from '../auth/membership.service';
import { SessionGuard } from '../auth/session.guard';
import { PlatformAdminGuard } from '../auth/platform-admin.guard';
import { ClosedLegacyGuard, RequireVenueRole, VenueRoleGuard, notFound } from '../auth/venue-role.guard';
import { VenuesService } from './venues.service';

interface AuthedRequest extends Request {
  auth?: SessionPrincipal;
}

/**
 * Public and Venue Dashboard management controller.
 */
@Controller()
export class VenuesController {
  constructor(
    private readonly membership: MembershipService,
    private readonly venuesService: VenuesService,
  ) {}

  // ---------------------------------------------------------------------------
  // Public routes (/v1/venues)
  // ---------------------------------------------------------------------------

  @Get('venues')
  async listPublic(): Promise<{ venues: Array<{ id: string; name: string; slug: string | null; timezone: string }> }> {
    const venues = await this.venuesService.listPublicVenues();
    return { venues };
  }

  @Get('venues/:venue_id')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole(...VENUE_ROLES)
  async get(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ venue: VenueSummary }> {
    const principal = req.auth as SessionPrincipal;
    const venue = await this.membership.venueForMember(principal.userId, venueId);
    if (!venue) {
      throw notFound();
    }
    // Venue settings are private to the tenant's staff.
    res.setHeader('Cache-Control', 'no-store');
    return { venue };
  }

  // ---------------------------------------------------------------------------
  // Admin Onboarding (/v1/admin)
  // ---------------------------------------------------------------------------

  @Post('admin/tenants')
  @UseGuards(SessionGuard, PlatformAdminGuard, ClosedLegacyGuard)
  async createTenant(
    @Body() body: { legal_name: string; billing_profile?: Record<string, unknown> },
  ) {
    const tenant = await this.venuesService.createTenant(body.legal_name, body.billing_profile);
    return { tenant };
  }

  @Post('admin/venues')
  @UseGuards(SessionGuard, PlatformAdminGuard, ClosedLegacyGuard)
  async createVenue(
    @Body()
    body: {
      tenant_id: string;
      name: string;
      slug?: string;
      timezone?: string;
      address?: Record<string, unknown>;
      contact?: Record<string, unknown>;
      publication_state?: 'DRAFT' | 'PENDING_APPROVAL' | 'PUBLISHED' | 'ARCHIVED';
    },
  ) {
    const venue = await this.venuesService.createVenue(body.tenant_id, body);
    return { venue };
  }

  // ---------------------------------------------------------------------------
  // Venue Dashboard: Profile & Management (/v1/dashboard/venues/:venue_id)
  // ---------------------------------------------------------------------------

  @Get('dashboard/venues/:venue_id')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async getDashboardVenue(
    @Param('venue_id') venueId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const venue = await this.venuesService.getVenueDetail(venueId);
    res.setHeader('Cache-Control', 'no-store');
    return { venue };
  }

  @Patch('dashboard/venues/:venue_id')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async updateVenue(
    @Param('venue_id') venueId: string,
    @Body()
    body: {
      name?: string;
      slug?: string;
      timezone?: string;
      address?: Record<string, unknown>;
      contact?: Record<string, unknown>;
    },
    @Res({ passthrough: true }) res: Response,
  ) {
    const venue = await this.venuesService.updateVenue(venueId, body);
    res.setHeader('Cache-Control', 'no-store');
    return { venue };
  }

  // ---------------------------------------------------------------------------
  // Rooms & Zones
  // ---------------------------------------------------------------------------

  @Get('dashboard/venues/:venue_id/rooms')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async listRooms(
    @Param('venue_id') venueId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rooms = await this.venuesService.listRooms(venueId);
    res.setHeader('Cache-Control', 'no-store');
    return { rooms };
  }

  @Post('dashboard/venues/:venue_id/rooms')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async createRoom(
    @Param('venue_id') venueId: string,
    @Body() body: { name: string; geometry_metadata?: Record<string, unknown> },
    @Res({ passthrough: true }) res: Response,
  ) {
    const room = await this.venuesService.createRoom(venueId, body);
    res.setHeader('Cache-Control', 'no-store');
    return { room };
  }

  @Get('dashboard/venues/:venue_id/zones')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async listZones(
    @Param('venue_id') venueId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const roomId = typeof req.query.room_id === 'string' ? req.query.room_id : undefined;
    const zones = await this.venuesService.listZones(venueId, roomId);
    res.setHeader('Cache-Control', 'no-store');
    return { zones };
  }

  @Post('dashboard/venues/:venue_id/zones')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async createZone(
    @Param('venue_id') venueId: string,
    @Body() body: { roomId: string; name: string; policy_profile_id?: string | null },
    @Res({ passthrough: true }) res: Response,
  ) {
    const zone = await this.venuesService.createZone(venueId, body);
    res.setHeader('Cache-Control', 'no-store');
    return { zone };
  }

  // ---------------------------------------------------------------------------
  // Resources & Private Room Components
  // ---------------------------------------------------------------------------

  @Get('dashboard/venues/:venue_id/resources')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async listResources(
    @Param('venue_id') venueId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const resources = await this.venuesService.listResources(venueId);
    res.setHeader('Cache-Control', 'no-store');
    return { resources };
  }

  @Post('dashboard/venues/:venue_id/resources')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async createResource(
    @Param('venue_id') venueId: string,
    @Body()
    body: {
      name: string;
      type: 'PC' | 'CONSOLE_SETUP' | 'PRIVATE_ROOM';
      roomId?: string | null;
      zoneId?: string | null;
      attributes?: Record<string, unknown>;
      bookable?: boolean;
      status?: 'AVAILABLE' | 'MAINTENANCE' | 'TEMP_BLOCKED';
    },
    @Res({ passthrough: true }) res: Response,
  ) {
    const resource = await this.venuesService.createResource(venueId, body);
    res.setHeader('Cache-Control', 'no-store');
    return { resource };
  }

  @Post('dashboard/venues/:venue_id/resources/:parent_id/components')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async addComponent(
    @Param('venue_id') venueId: string,
    @Param('parent_id') parentId: string,
    @Body() body: { child_resource_id: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const component = await this.venuesService.addResourceComponent(
      venueId,
      parentId,
      body.child_resource_id,
    );
    res.setHeader('Cache-Control', 'no-store');
    return { component };
  }

  // ---------------------------------------------------------------------------
  // Staff Memberships
  // ---------------------------------------------------------------------------

  @Get('dashboard/venues/:venue_id/memberships')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async listMemberships(
    @Param('venue_id') venueId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const memberships = await this.venuesService.listMemberships(venueId);
    res.setHeader('Cache-Control', 'no-store');
    return { memberships };
  }

  @Post('dashboard/venues/:venue_id/memberships')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER')
  async createMembership(
    @Param('venue_id') venueId: string,
    @Body() body: { userId: string; role: VenueRole },
    @Res({ passthrough: true }) res: Response,
  ) {
    const venue = await this.venuesService.getVenueDetail(venueId);
    const membership = await this.venuesService.createMembership(venueId, venue.tenant_id, body);
    res.setHeader('Cache-Control', 'no-store');
    return { membership };
  }

  @Patch('dashboard/venues/:venue_id/memberships/:membership_id')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER')
  async updateMembership(
    @Param('venue_id') venueId: string,
    @Param('membership_id') membershipId: string,
    @Body() body: { active?: boolean; role?: VenueRole },
    @Res({ passthrough: true }) res: Response,
  ) {
    const membership = await this.venuesService.updateMembership(venueId, membershipId, body);
    res.setHeader('Cache-Control', 'no-store');
    return { membership };
  }
}
