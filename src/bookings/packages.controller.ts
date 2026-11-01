import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { SessionPrincipal } from '../auth/auth.service';
import { SessionGuard } from '../auth/session.guard';
import { RequireVenueRole, VenueRoleGuard } from '../auth/venue-role.guard';
import { PackagesService } from './packages.service';
import type {
  CreatePackageInput,
  UpdatePackageInput,
} from './packages.types';

interface AuthedRequest extends Request {
  auth?: SessionPrincipal;
}

@Controller()
export class PackagesController {
  constructor(private readonly packagesService: PackagesService) {}

  // ===========================================================================
  // Public Packages Endpoints (/v1/venues/:venue_id/packages)
  // ===========================================================================

  @Get('venues/:venue_id/packages')
  async getPublicPackages(@Param('venue_id') venueId: string) {
    return this.packagesService.listPackages(venueId, true);
  }

  @Get('venues/:venue_id/packages/:id')
  async getPublicPackageById(
    @Param('venue_id') venueId: string,
    @Param('id') packageId: string,
  ) {
    return this.packagesService.getPackageById(venueId, packageId, true);
  }

  @Post('venues/:venue_id/packages/:id/quote')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard)
  async createPackageQuote(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Param('id') packageId: string,
    @Body() body: { resource_id: string; starts_at: string },
  ) {
    const customerId = req.auth?.userId;
    if (!customerId) {
      throw new Error('AUTH_REQUIRED');
    }
    return this.packagesService.createPackageQuote(venueId, customerId, {
      package_id: packageId,
      resource_id: body.resource_id,
      starts_at: body.starts_at,
    });
  }

  // ===========================================================================
  // Dashboard Package Management Endpoints
  // ===========================================================================

  @Post('dashboard/venues/:venue_id/packages')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async createPackage(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Body() input: CreatePackageInput,
    @Headers('x-request-id') requestId?: string,
  ) {
    const staffId = req.auth?.userId;
    if (!staffId) {
      throw new Error('AUTH_REQUIRED');
    }
    const pool = (await import('../db/pool')).getPool();
    const roleRes = await pool.query<{ role: string }>(
      'SELECT role FROM venue_memberships WHERE venue_id = $1 AND user_id = $2',
      [venueId, staffId],
    );
    const staffRole = roleRes.rows[0]?.role || 'VENUE_MANAGER';

    return this.packagesService.createPackage(venueId, staffId, staffRole, input, requestId);
  }

  @Get('dashboard/venues/:venue_id/packages')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async listPackages(@Param('venue_id') venueId: string) {
    return this.packagesService.listPackages(venueId, false);
  }

  @Get('dashboard/venues/:venue_id/packages/:id')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async getPackage(
    @Param('venue_id') venueId: string,
    @Param('id') packageId: string,
  ) {
    return this.packagesService.getPackageById(venueId, packageId, false);
  }

  @Patch('dashboard/venues/:venue_id/packages/:id')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async updatePackage(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Param('id') packageId: string,
    @Body() input: UpdatePackageInput,
    @Headers('x-request-id') requestId?: string,
  ) {
    const staffId = req.auth?.userId;
    if (!staffId) {
      throw new Error('AUTH_REQUIRED');
    }
    const pool = (await import('../db/pool')).getPool();
    const roleRes = await pool.query<{ role: string }>(
      'SELECT role FROM venue_memberships WHERE venue_id = $1 AND user_id = $2',
      [venueId, staffId],
    );
    const staffRole = roleRes.rows[0]?.role || 'VENUE_MANAGER';

    return this.packagesService.updatePackage(venueId, packageId, staffId, staffRole, input, requestId);
  }

  @Delete('dashboard/venues/:venue_id/packages/:id')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async deletePackage(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Param('id') packageId: string,
  ) {
    const staffId = req.auth?.userId;
    if (!staffId) {
      throw new Error('AUTH_REQUIRED');
    }
    const pool = (await import('../db/pool')).getPool();
    const roleRes = await pool.query<{ role: string }>(
      'SELECT role FROM venue_memberships WHERE venue_id = $1 AND user_id = $2',
      [venueId, staffId],
    );
    const staffRole = roleRes.rows[0]?.role || 'VENUE_MANAGER';

    return this.packagesService.deletePackage(venueId, packageId, staffId, staffRole);
  }
}
