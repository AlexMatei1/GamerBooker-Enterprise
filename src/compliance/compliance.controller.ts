import { Controller, Get, Param } from '@nestjs/common';
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
  async getVenueFiscalStatus(
    @Param('venue_id') venueId: string,
  ): Promise<VenueFiscalStatus> {
    return this.complianceService.getVenueFiscalStatus(venueId);
  }
}
