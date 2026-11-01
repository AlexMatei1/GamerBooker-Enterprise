import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { SessionPrincipal } from '../auth/auth.service';
import { MembershipService } from '../auth/membership.service';
import { SessionGuard } from '../auth/session.guard';
import { RequireVenueRole, VenueRoleGuard } from '../auth/venue-role.guard';
import { ResourceManagerService } from './resource-manager.service';
import type {
  BulkCloneDto,
  BulkImportDto,
  BulkUpdateDto,
  UpdateResourceDto,
} from './resource.types';

interface AuthedRequest extends Request {
  auth?: SessionPrincipal;
}

@Controller()
export class ResourceManagerController {
  constructor(
    private readonly resourceManager: ResourceManagerService,
    private readonly membershipService: MembershipService,
  ) {}

  // ---------------------------------------------------------------------------
  // Bulk Operations (must precede :id route to prevent route parameter collision)
  // ---------------------------------------------------------------------------

  @Post('dashboard/venues/:venue_id/resources/bulk-clone')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async bulkClone(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Body() body: BulkCloneDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const principal = req.auth as SessionPrincipal;
    const role = (await this.membershipService.roleFor(principal.userId, venueId)) ?? 'OWNER';
    const resources = await this.resourceManager.bulkCloneResources(
      venueId,
      body,
      principal.userId,
      role,
    );
    return { resources };
  }

  @Patch('dashboard/venues/:venue_id/resources/bulk-update')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async bulkUpdate(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Body() body: BulkUpdateDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const principal = req.auth as SessionPrincipal;
    const role = (await this.membershipService.roleFor(principal.userId, venueId)) ?? 'OWNER';
    const result = await this.resourceManager.bulkUpdateResources(
      venueId,
      body,
      principal.userId,
      role,
    );
    return result;
  }

  @Post('dashboard/venues/:venue_id/resources/bulk-import')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async bulkImport(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Body() body: BulkImportDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const principal = req.auth as SessionPrincipal;
    const role = (await this.membershipService.roleFor(principal.userId, venueId)) ?? 'OWNER';
    const resources = await this.resourceManager.bulkImportResources(
      venueId,
      body,
      principal.userId,
      role,
    );
    return { resources };
  }

  // ---------------------------------------------------------------------------
  // Single Resource Operations
  // ---------------------------------------------------------------------------

  @Get('dashboard/venues/:venue_id/resources/:id')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async getResource(
    @Param('venue_id') venueId: string,
    @Param('id') resourceId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const resource = await this.resourceManager.getResource(venueId, resourceId);
    return { resource };
  }

  @Patch('dashboard/venues/:venue_id/resources/:id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async updateResource(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Param('id') resourceId: string,
    @Body() body: UpdateResourceDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const principal = req.auth as SessionPrincipal;
    const role = (await this.membershipService.roleFor(principal.userId, venueId)) ?? 'OWNER';
    const resource = await this.resourceManager.updateResource(
      venueId,
      resourceId,
      body,
      principal.userId,
      role,
    );
    return { resource };
  }

  @Delete('dashboard/venues/:venue_id/resources/:id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async deleteResource(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Param('id') resourceId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const principal = req.auth as SessionPrincipal;
    const role = (await this.membershipService.roleFor(principal.userId, venueId)) ?? 'OWNER';
    const result = await this.resourceManager.deleteResource(
      venueId,
      resourceId,
      principal.userId,
      role,
    );
    return result;
  }
}
