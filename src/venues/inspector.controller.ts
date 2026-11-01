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
  Put,
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
import { InspectorService } from './inspector.service';
import type {
  UpdateInspectorDto,
  CreateAdjacencyDto,
  UpdateCompositionDto,
} from './inspector.types';

interface AuthedRequest extends Request {
  auth?: SessionPrincipal;
}

@Controller()
export class InspectorController {
  constructor(
    private readonly inspectorService: InspectorService,
    private readonly membershipService: MembershipService,
  ) {}

  // ---------------------------------------------------------------------------
  // Resource Inspector
  // ---------------------------------------------------------------------------

  @Get('dashboard/venues/:venue_id/resources/:id/inspector')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async getInspector(
    @Param('venue_id') venueId: string,
    @Param('id') resourceId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const detail = await this.inspectorService.getResourceInspector(venueId, resourceId);
    return { inspector: detail };
  }

  @Patch('dashboard/venues/:venue_id/resources/:id/inspector')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async updateInspector(
    @Param('venue_id') venueId: string,
    @Param('id') resourceId: string,
    @Body() body: UpdateInspectorDto,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const principal = req.auth as SessionPrincipal;
    const role = (await this.membershipService.roleFor(principal.userId, venueId)) ?? 'OWNER';
    const requestId = (req.headers['x-request-id'] as string) || '';

    const detail = await this.inspectorService.updateResourceInspector(
      venueId,
      resourceId,
      principal.userId,
      role,
      body,
      requestId,
    );
    return { inspector: detail };
  }

  // ---------------------------------------------------------------------------
  // Adjacency Edges
  // ---------------------------------------------------------------------------

  @Get('dashboard/venues/:venue_id/adjacencies')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async listAdjacencies(
    @Param('venue_id') venueId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const adjacencies = await this.inspectorService.listAdjacencies(venueId);
    return { adjacencies };
  }

  @Post('dashboard/venues/:venue_id/adjacencies')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async createAdjacency(
    @Param('venue_id') venueId: string,
    @Body() body: CreateAdjacencyDto,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const principal = req.auth as SessionPrincipal;
    const role = (await this.membershipService.roleFor(principal.userId, venueId)) ?? 'OWNER';
    const requestId = (req.headers['x-request-id'] as string) || '';

    const adjacency = await this.inspectorService.createAdjacency(
      venueId,
      principal.userId,
      role,
      body,
      requestId,
    );
    return { adjacency };
  }

  @Delete('dashboard/venues/:venue_id/adjacencies/:id')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async deleteAdjacency(
    @Param('venue_id') venueId: string,
    @Param('id') edgeId: string,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const principal = req.auth as SessionPrincipal;
    const role = (await this.membershipService.roleFor(principal.userId, venueId)) ?? 'OWNER';
    const requestId = (req.headers['x-request-id'] as string) || '';

    const result = await this.inspectorService.deleteAdjacency(
      venueId,
      edgeId,
      principal.userId,
      role,
      requestId,
    );
    return result;
  }

  @Get('dashboard/venues/:venue_id/adjacencies/suggest')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async suggestAdjacencies(
    @Param('venue_id') venueId: string,
    @Res({ passthrough: true }) res: Response,
    @Query('max_proximity') maxProxStr?: string,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const maxProx = maxProxStr ? parseInt(maxProxStr, 10) : 180;
    const suggestions = await this.inspectorService.suggestAdjacencies(venueId, maxProx);
    return { suggestions };
  }

  // ---------------------------------------------------------------------------
  // Private Room Composition Editing
  // ---------------------------------------------------------------------------

  @Get('dashboard/venues/:venue_id/private-rooms/:id/composition')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async getComposition(
    @Param('venue_id') venueId: string,
    @Param('id') parentResourceId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const composition = await this.inspectorService.getPrivateRoomComposition(venueId, parentResourceId);
    return { composition };
  }

  @Put('dashboard/venues/:venue_id/private-rooms/:id/composition')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async updateComposition(
    @Param('venue_id') venueId: string,
    @Param('id') parentResourceId: string,
    @Body() body: UpdateCompositionDto,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const principal = req.auth as SessionPrincipal;
    const role = (await this.membershipService.roleFor(principal.userId, venueId)) ?? 'OWNER';
    const requestId = (req.headers['x-request-id'] as string) || '';

    const composition = await this.inspectorService.updatePrivateRoomComposition(
      venueId,
      parentResourceId,
      principal.userId,
      role,
      body,
      requestId,
    );
    return { composition };
  }
}
