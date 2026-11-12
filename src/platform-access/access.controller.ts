import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { SessionPrincipal } from '../auth/auth.service';
import { SessionGuard } from '../auth/session.guard';
import { PlatformAdminGuard } from '../auth/platform-admin.guard';
import { RateLimiter } from '../auth/rate-limit';
import { countAttempt } from '../auth/http-helpers';
import { AuthHttpError } from '../auth/auth-error';
import { AccessService } from './access.service';
import { GoogleSheetsService } from '../operations/google-sheets.service';

interface AuthedRequest extends Request {
  auth: SessionPrincipal;
}

@Controller()
@UseGuards(SessionGuard)
export class AccessController {
  constructor(
    private readonly access: AccessService,
    private readonly limiter: RateLimiter,
    private readonly sheets: GoogleSheetsService,
  ) {}

  @Get('access/context')
  context(@Req() req: AuthedRequest) {
    return this.access.context(
      req.auth.userId,
      req.auth.localAdminPasswordOnly === true,
    );
  }

  @Get('cafe/applications/me')
  own(@Req() req: AuthedRequest) {
    return this.access.own(req.auth.userId);
  }

  @Post('cafe/applications')
  apply(@Req() req: AuthedRequest, @Body() body: unknown) {
    countAttempt(
      this.limiter,
      { name: 'cafe-application', limit: 5, windowMs: 3600000 },
      req.auth.userId,
    );
    return this.access.apply(req.auth.userId, body);
  }

  @Get('admin/cafe-applications')
  @UseGuards(PlatformAdminGuard)
  queue() {
    return this.access.queue();
  }

  @Post('admin/cafe-applications/:id/decision')
  @UseGuards(PlatformAdminGuard)
  decide(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.access.decide(req.auth.userId, id, body);
  }

  @Patch('admin/cafe-applications/:id/setup')
  @UseGuards(PlatformAdminGuard)
  setup(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.access.maintain(req.auth.userId, id, body);
  }

  @Post('admin/cafe-applications/:id/reset-temporary-password')
  @UseGuards(PlatformAdminGuard)
  resetTemporaryPassword(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
  ) {
    return this.access.resetTemporaryPassword(req.auth.userId, id);
  }

  @Get('dashboard/venues/:venue_id/overview')
  dashboard(@Req() req: AuthedRequest, @Param('venue_id') id: string) {
    return this.access.dashboard(req.auth.userId, id);
  }

  // Kept inside the /admin namespace: the session guard only lets platform
  // administrators reach /v1/(auth|me|access|admin), so an /operator route
  // would be rejected for the very account that runs the intake.
  @Get('admin/cafe-applications/intake/google-sheets/status')
  @UseGuards(PlatformAdminGuard)
  intakeStatus() {
    return this.sheets.status();
  }

  @Post('admin/cafe-applications/intake/google-sheets/config')
  @UseGuards(PlatformAdminGuard)
  updateIntakeConfig(@Body() body: { url?: string }) {
    if (typeof body?.url === 'string') {
      return this.sheets.setUrl(body.url);
    }
    return this.sheets.status();
  }

  @Post('admin/cafe-applications/intake/raw-csv')
  @UseGuards(PlatformAdminGuard)
  importFromRawCsv(@Req() req: AuthedRequest, @Body() body: { csv?: string }) {
    if (typeof body?.csv !== 'string' || !body.csv.trim()) {
      throw new AuthHttpError(400, 'INTAKE_EMPTY', 'Introduceți conținut CSV valid.');
    }
    return this.sheets.syncFromCsvText(req.auth.userId, body.csv);
  }

  @Post('admin/cafe-applications/intake/google-sheets')
  @UseGuards(PlatformAdminGuard)
  importFromGoogleSheets(@Req() req: AuthedRequest) {
    return this.sheets.syncFromSheet(req.auth.userId);
  }
}
