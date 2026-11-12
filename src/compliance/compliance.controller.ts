import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { RequireVenueRole, VenueRoleGuard } from '../auth/venue-role.guard';
import { ComplianceService } from './compliance.service';
import type { ComplianceManifest, VenueFiscalStatus } from './compliance.types';

@Controller('compliance')
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  @Get('manifest')
  getComplianceManifest(): ComplianceManifest {
    return this.complianceService.getComplianceManifest();
  }

  @Get('store-review-kit')
  getStoreReviewKit() {
    return this.complianceService.getStoreReviewKit();
  }

  @Get('venues/:venue_id/fiscal-status')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER','VENUE_MANAGER')
  async getVenueFiscalStatus(
    @Param('venue_id') venueId: string,
  ): Promise<VenueFiscalStatus> {
    return this.complianceService.getVenueFiscalStatus(venueId);
  }
}
