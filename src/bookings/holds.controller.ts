import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { SessionPrincipal } from '../auth/auth.service';
import { SessionGuard } from '../auth/session.guard';
import { HoldsService } from './holds.service';
import type { CreateHoldInput } from './holds.types';

interface AuthedRequest extends Request {
  auth?: SessionPrincipal;
}

@Controller('holds')
export class HoldsController {
  constructor(private readonly holdsService: HoldsService) {}

  @Post()
  @UseGuards(SessionGuard)
  async createHold(
    @Req() req: AuthedRequest,
    @Body() input: CreateHoldInput,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const customerId = req.auth?.userId;
    if (!customerId) {
      throw new Error('AUTH_REQUIRED');
    }
    return this.holdsService.createHold(customerId, input, idempotencyKey);
  }

  @Get(':id')
  @UseGuards(SessionGuard)
  async getHold(
    @Req() req: AuthedRequest,
    @Param('id') holdId: string,
  ) {
    const customerId = req.auth?.userId;
    return this.holdsService.getHoldById(holdId, customerId);
  }

  @Post(':id/release')
  @UseGuards(SessionGuard)
  async releaseHold(
    @Req() req: AuthedRequest,
    @Param('id') holdId: string,
  ) {
    const customerId = req.auth?.userId;
    return this.holdsService.releaseHold(holdId, customerId);
  }

  @Post('cleanup-expired')
  async cleanupExpired() {
    return this.holdsService.cleanupExpiredHolds();
  }
}
