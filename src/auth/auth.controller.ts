import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthHttpError } from './auth-error';
import { clearedCookie, sessionCookie } from './cookies';
import { AuthService, type SessionPrincipal } from './auth.service';
import { countAttempt, parse } from './http-helpers';
import {
  addressOf,
  DELETE_ACCOUNT_LIMIT,
  LOGIN_ADDRESS_LIMIT,
  LOGIN_FAILURE_LIMIT,
  REGISTER_ADDRESS_LIMIT,
  RateLimiter,
  VERIFY_ADDRESS_LIMIT,
} from './rate-limit';
import { SessionGuard } from './session.guard';
import {
  validateDeleteAccount,
  validateLogin,
  validateRegister,
  validateVerify,
} from './validation';

interface AuthedRequest extends Request {
  auth?: SessionPrincipal;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly limiter: RateLimiter,
  ) {}

  @Post('register')
  async register(@Req() req: Request, @Body() body: unknown): Promise<unknown> {
    countAttempt(this.limiter, REGISTER_ADDRESS_LIMIT, addressOf(req));
    const input = parse(() => validateRegister(body));
    return this.auth.register(input);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(@Req() req: Request, @Body() body: unknown): Promise<unknown> {
    countAttempt(this.limiter, VERIFY_ADDRESS_LIMIT, addressOf(req));
    const input = parse(() => validateVerify(body));
    return this.auth.verifyEmail(input.token);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Req() req: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<unknown> {
    const input = parse(() => validateLogin(body));

    // Two buckets. The address bucket bounds spraying one password across many
    // identities; the identity bucket bounds guessing against one account.
    // Neither is scoped to a venue and neither can be turned off (BR-024).
    const address = addressOf(req);
    countAttempt(this.limiter, LOGIN_ADDRESS_LIMIT, address);
    const identityKey = address + '|' + input.email;
    this.limiter.assertAllowed(LOGIN_FAILURE_LIMIT, identityKey);

    let result;
    try {
      result = await this.auth.login(input);
    } catch (err) {
      if (err instanceof AuthHttpError && err.code === 'AUTH_INVALID_CREDENTIALS') {
        this.limiter.record(LOGIN_FAILURE_LIMIT, identityKey);
      }
      throw err;
    }
    // A correct password clears the failure bucket: two typos followed by a
    // success must not leave a person one mistake away from a 429.
    this.limiter.reset(LOGIN_FAILURE_LIMIT, identityKey);

    // A response that carries a session token must never be stored by a proxy
    // or the browser cache.
    res.setHeader('Cache-Control', 'no-store');

    // Dashboard sessions live in an HttpOnly cookie and the token is never
    // returned to JavaScript. Mobile clients get the token in the body.
    const mfa = {
      mfa_required: result.mfaState === 'pending',
      mfa_enrollment_required: result.mfaEnrollmentRequired,
    };

    if (result.kind === 'dashboard') {
      res.setHeader('Set-Cookie', sessionCookie(result.token));
      return {
        user_id: result.userId,
        kind: result.kind,
        expires_at: result.expiresAt.toISOString(),
        ...mfa,
      };
    }

    return {
      user_id: result.userId,
      kind: result.kind,
      token: result.token,
      expires_at: result.expiresAt.toISOString(),
      ...mfa,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionGuard)
  async logout(
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(req.auth as SessionPrincipal);
    res.setHeader('Set-Cookie', clearedCookie());
  }

  /**
   * Revokes every session the caller holds, not only the presented one. The
   * response is 204 whether one session or ten were open.
   */
  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionGuard)
  async logoutAll(
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logoutAll(req.auth as SessionPrincipal);
    res.setHeader('Set-Cookie', clearedCookie());
  }


}

/** GET /v1/me - the only proof of authenticated identity. */
@Controller('me')
export class MeController {
  constructor(
    private readonly auth: AuthService,
    private readonly limiter: RateLimiter,
  ) {}

  @Get()
  @UseGuards(SessionGuard)
  async me(
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<unknown> {
    // Personal data: not cacheable by any shared cache.
    res.setHeader('Cache-Control', 'no-store');
    return this.auth.me(req.auth as SessionPrincipal);
  }

  /**
   * Closes the caller's own account (ENG002-T07). The password is required, so
   * a stolen session alone cannot destroy an account. On success every session
   * is revoked, so the cookie that made this call is already dead.
   */
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionGuard)
  async deleteAccount(
    @Req() req: AuthedRequest,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const principal = req.auth as SessionPrincipal;
    countAttempt(this.limiter, DELETE_ACCOUNT_LIMIT, principal.userId);
    const input = parse(() => validateDeleteAccount(body));
    await this.auth.deleteAccount(principal, input.password, input.reason);
    res.setHeader('Set-Cookie', clearedCookie());
  }
}
