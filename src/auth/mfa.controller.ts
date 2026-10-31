import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { SessionPrincipal } from './auth.service';
import { sessionCookie } from './cookies';
import { countAttempt, parse } from './http-helpers';
import { MfaService } from './mfa.service';
import { MFA_VERIFY_LIMIT, RateLimiter } from './rate-limit';
import { AllowPendingMfa, SessionGuard } from './session.guard';
import { validateMfaCode } from './validation';

interface AuthedRequest extends Request {
  auth?: SessionPrincipal;
}

/**
 * The only two routes a pending-MFA session may reach (D10). Both are marked
 * AllowPendingMfa, which is the explicit opt-in the guard requires.
 *
 * Neither response is cacheable, and neither ever repeats the secret or the
 * recovery codes after enrolment.
 */
@Controller('auth/mfa')
export class MfaController {
  constructor(
    private readonly mfa: MfaService,
    private readonly limiter: RateLimiter,
  ) {}

  /**
   * Starts enrolment. Returns the shared secret, the otpauth URI and the
   * recovery codes exactly once; the server keeps only an encrypted secret and
   * hashes.
   */
  @Post('enroll')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard)
  @AllowPendingMfa()
  async enroll(
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<unknown> {
    res.setHeader('Cache-Control', 'no-store');
    return this.mfa.enroll(req.auth as SessionPrincipal);
  }

  /**
   * Confirms enrolment, or finishes a login that stopped at MFA. On success the
   * pending session is revoked and a new token is issued.
   */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard)
  @AllowPendingMfa()
  async verify(
    @Req() req: AuthedRequest,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<unknown> {
    const principal = req.auth as SessionPrincipal;
    countAttempt(this.limiter, MFA_VERIFY_LIMIT, principal.userId);
    const input = parse(() => validateMfaCode(body));
    const result = await this.mfa.verify(principal, input.code);

    res.setHeader('Cache-Control', 'no-store');
    if (result.kind === 'dashboard') {
      res.setHeader('Set-Cookie', sessionCookie(result.token));
      return {
        user_id: result.userId,
        kind: result.kind,
        expires_at: result.expiresAt.toISOString(),
        mfa_required: false,
      };
    }
    return {
      user_id: result.userId,
      kind: result.kind,
      token: result.token,
      expires_at: result.expiresAt.toISOString(),
      mfa_required: false,
    };
  }
}
