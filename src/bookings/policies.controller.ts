import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { RequireVenueRole, VenueRoleGuard } from '../auth/venue-role.guard';
import { PoliciesService } from './policies.service';
import type { PolicySettings } from './policy.types';

@Controller()
export class PoliciesController {
  constructor(private readonly policiesService: PoliciesService) {}

  // ---------------------------------------------------------------------------
  // Public effective policy lookup (/v1/venues/:venue_id/effective-policy)
  // ---------------------------------------------------------------------------

  @Get('venues/:venue_id/effective-policy')
  async getEffectivePolicy(
    @Param('venue_id') venueId: string,
    @Query('resource_id') resourceId?: string,
  ) {
    const effective = await this.policiesService.resolveEffectivePolicy(venueId, resourceId);
    const snapshot = this.policiesService.createSnapshot(effective);
    return { effectivePolicy: effective, snapshot };
  }

  // ---------------------------------------------------------------------------
  // Dashboard policy profile management (/v1/dashboard/venues/:venue_id/policies)
  // ---------------------------------------------------------------------------

  @Get('dashboard/venues/:venue_id/policies')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async listPolicies(@Param('venue_id') venueId: string) {
    const policies = await this.policiesService.listProfiles(venueId);
    return { policies };
  }

  @Post('dashboard/venues/:venue_id/policies')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async createPolicy(
    @Param('venue_id') venueId: string,
    @Body('name') name: string,
    @Body('isDefault') isDefault: boolean,
    @Body('settings') settings: Partial<PolicySettings>,
  ) {
    const policy = await this.policiesService.createProfile(
      venueId,
      name,
      Boolean(isDefault),
      settings ?? {},
    );
    return { policy };
  }

  @Patch('dashboard/venues/:venue_id/policies/:policy_id')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async updatePolicy(
    @Param('venue_id') venueId: string,
    @Param('policy_id') policyId: string,
    @Body('name') name?: string,
    @Body('isDefault') isDefault?: boolean,
    @Body('settings') settings?: Partial<PolicySettings>,
  ) {
    const policy = await this.policiesService.updateProfile(venueId, policyId, {
      name,
      isDefault,
      settings,
    });
    return { policy };
  }

  // ---------------------------------------------------------------------------
  // ENG-207: Customer preview and clear examples for pricing & policies
  // ---------------------------------------------------------------------------

  @Get('dashboard/venues/:venue_id/policies/preview-estimates')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async getPolicyPreviewEstimates(
    @Param('venue_id') venueId: string,
    @Query('resource_id') resourceId?: string,
  ) {
    return this.policiesService.previewPolicyEstimates(venueId, undefined, resourceId);
  }

  @Post('dashboard/venues/:venue_id/policies/preview-estimates')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  @HttpCode(HttpStatus.OK)
  async postPolicyPreviewEstimates(
    @Param('venue_id') venueId: string,
    @Body('settings') settings?: Partial<PolicySettings>,
    @Body('resource_id') resourceId?: string,
  ) {
    return this.policiesService.previewPolicyEstimates(venueId, settings, resourceId);
  }
}
