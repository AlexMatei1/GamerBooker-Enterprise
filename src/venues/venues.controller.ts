import { Controller, Get, Param, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { SessionPrincipal } from '../auth/auth.service';
import {
  MembershipService,
  VENUE_ROLES,
  type VenueSummary,
} from '../auth/membership.service';
import { SessionGuard } from '../auth/session.guard';
import { RequireVenueRole, VenueRoleGuard, notFound } from '../auth/venue-role.guard';

interface AuthedRequest extends Request {
  auth?: SessionPrincipal;
}

/**
 * Minimal, read-only venue view.
 *
 * ENG-003 owns the venue model and may replace this route; ENG-002 needs one
 * real venue-scoped route to make the RBAC substrate observable end to end
 * (decision D9 in notes/eng-002-slice-b-part-2-plan.md). It deliberately
 * returns three columns, not a venue model.
 *
 * A venue the caller has no active membership on answers exactly like a venue
 * that does not exist, so venue and tenant ids cannot be enumerated.
 */
@Controller('venues')
export class VenuesController {
  constructor(private readonly membership: MembershipService) {}

  @Get(':venue_id')
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
}
