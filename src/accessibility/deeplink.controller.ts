import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthHttpError } from '../auth/auth-error';
import { SessionGuard } from '../auth/session.guard';
import { RequireVenueRole, VenueRoleGuard } from '../auth/venue-role.guard';
import { DeepLinkService } from './deeplink.service';
import {
  CreateDeferredLinkInput,
  RecordFunnelEventInput,
} from './accessibility.types';

@Controller()
export class DeepLinkController {
  constructor(private readonly deepLinkService: DeepLinkService) {}

  @Get('deeplink/resolve')
  async resolveDeepLink(
    @Query('venue_id') venueId?: string,
    @Query('zone_id') zoneId?: string,
    @Query('package_id') packageId?: string,
    @Query('source_tag') sourceTag?: string,
    @Query('session_id') sessionId?: string,
    @Query('redirect') redirect?: string,
    @Headers('user-agent') userAgent?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const result = await this.deepLinkService.resolveDeepLink(
      {
        venue_id: venueId,
        zone_id: zoneId,
        package_id: packageId,
        source_tag: sourceTag,
        session_id: sessionId,
      },
      userAgent,
    );

    if (redirect === 'true' && res) {
      res.redirect(HttpStatus.FOUND, result.target_redirect_url);
      return;
    }

    return result;
  }

  @Post('deeplink/deferred')
  @HttpCode(HttpStatus.CREATED)
  async createDeferredLink(@Body() input: CreateDeferredLinkInput) {
    if (!input.venue_id) {
      throw new AuthHttpError(HttpStatus.BAD_REQUEST, 'MISSING_VENUE_ID', 'venue_id is required.');
    }
    return this.deepLinkService.createDeferredLink(input);
  }

  @Get('deeplink/deferred/:token')
  async getDeferredLink(@Param('token') token: string) {
    return this.deepLinkService.getDeferredLink(token);
  }

  @Post('analytics/qr-funnel')
  @HttpCode(HttpStatus.OK)
  async recordFunnelEvent(
    @Body() input: RecordFunnelEventInput,
    @Headers('user-agent') userAgent?: string,
  ) {
    if (!input.venue_id || !input.session_id || !input.milestone) {
      throw new AuthHttpError(
        HttpStatus.BAD_REQUEST,
        'INVALID_FUNNEL_INPUT',
        'venue_id, session_id, and milestone are required.',
      );
    }
    const platform = input.platform || this.deepLinkService.resolvePlatform(userAgent);
    return this.deepLinkService.recordFunnelEvent({ ...input, platform });
  }

  @Get('dashboard/venues/:venue_id/analytics/qr-funnel')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async getFunnelAnalytics(@Param('venue_id') venueId: string) {
    return this.deepLinkService.getFunnelAnalytics(venueId);
  }

  // Mandatory invariant: web checkout prohibition
  @Post(['checkout/web', 'v1/checkout/web'])
  @HttpCode(HttpStatus.FORBIDDEN)
  async prohibitWebCheckout() {
    throw new AuthHttpError(
      HttpStatus.FORBIDDEN,
      'WEB_CHECKOUT_PROHIBITED',
      'Rezervările și plățile sunt permise exclusiv din aplicația mobilă GamerBooker (iOS / Android). Checkout-ul din browser web este dezactivat pentru securitatea check-in-ului cu token rotativ.',
    );
  }
}
