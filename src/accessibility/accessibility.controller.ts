import { Controller, Get, Param } from '@nestjs/common';
import { AccessibilityService } from './accessibility.service';

@Controller('venues')
export class AccessibilityController {
  constructor(private readonly accessibilityService: AccessibilityService) {}

  @Get(':id/layout/accessible-view')
  async getAccessibleLayout(@Param('id') venueId: string) {
    return this.accessibilityService.getAccessibleLayout(venueId);
  }
}
