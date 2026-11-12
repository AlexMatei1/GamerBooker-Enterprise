import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { SessionPrincipal } from '../auth/auth.service';
import { SessionGuard } from '../auth/session.guard';
import { ClosedLegacyGuard } from '../auth/venue-role.guard';
import { ObservabilityService } from './observability.service';
import type { LogSecurityViolationInput } from './observability.types';

interface AuthedRequest extends Request {
  auth?: SessionPrincipal;
}

@Controller('observability')
export class ObservabilityController {
  constructor(private readonly observabilityService: ObservabilityService) {}

  @Get('security-metrics')
  @UseGuards(SessionGuard, ClosedLegacyGuard)
  async getSecurityMetrics(@Query('tenant_id') tenantId?: string) {
    return this.observabilityService.getSecurityMetrics(tenantId);
  }

  @Get('system-health')
  @UseGuards(SessionGuard, ClosedLegacyGuard)
  async getSystemHealth() {
    return this.observabilityService.getSystemHealth();
  }

  @Post('security-violations')
  @UseGuards(SessionGuard, ClosedLegacyGuard)
  @HttpCode(HttpStatus.CREATED)
  async logSecurityViolation(@Req() req: AuthedRequest, @Body() input: LogSecurityViolationInput) {
    const actorId = input.actorId || req.auth?.userId;
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    const requestId = (req.headers['x-request-id'] as string) || undefined;

    return this.observabilityService.logSecurityViolation({
      ...input,
      actorId,
      ipAddress,
      requestId,
    });
  }
}
