import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { SessionPrincipal } from '../auth/auth.service';
import { SessionGuard } from '../auth/session.guard';
import { RequireVenueRole, VenueRoleGuard } from '../auth/venue-role.guard';
import { PricingService } from './pricing.service';
import { QuotesService } from './quotes.service';
import type { CreateQuoteInput, SetPriceRuleInput } from './quotes.types';

interface AuthedRequest extends Request {
  auth?: SessionPrincipal;
}

@Controller()
export class QuotesController {
  constructor(
    private readonly quotesService: QuotesService,
    private readonly pricingService: PricingService,
  ) {}

  // ---------------------------------------------------------------------------
  // Customer Quotes API (/v1/quotes)
  // ---------------------------------------------------------------------------

  @Post('quotes')
  @UseGuards(SessionGuard)
  async createQuote(
    @Req() req: AuthedRequest,
    @Body() input: CreateQuoteInput,
  ) {
    const customerId = req.auth?.userId;
    if (!customerId) {
      throw new Error('AUTH_REQUIRED');
    }
    const quote = await this.quotesService.createQuote(input.venue_id, customerId, input);
    return quote;
  }

  @Get('quotes/:quote_id')
  async getQuote(@Param('quote_id') quoteId: string) {
    const quote = await this.quotesService.getQuote(quoteId);
    return quote;
  }

  // ---------------------------------------------------------------------------
  // Venue Dashboard Pricing Configuration (/v1/dashboard/venues/:venue_id/pricing)
  // ---------------------------------------------------------------------------

  @Get('dashboard/venues/:venue_id/pricing')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async listPricingRules(@Param('venue_id') venueId: string) {
    const rules = await this.pricingService.listPriceRules(venueId);
    return { rules };
  }

  @Put('dashboard/venues/:venue_id/pricing')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async setPricingRule(
    @Param('venue_id') venueId: string,
    @Body() input: SetPriceRuleInput,
  ) {
    const rule = await this.pricingService.setPriceRule(venueId, input);
    return { rule };
  }
}
