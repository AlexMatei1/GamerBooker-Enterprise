import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { validationError } from './auth-error';
import { IDLE_TTL_MS, SESSION_COOKIE } from './auth.constants';
import { AuthService, type SessionPrincipal } from './auth.service';
import { SessionGuard } from './session.guard';
import {
  validateLogin,
  validateRegister,
  validateVerify,
  ValidationFailure,
} from './validation';

interface AuthedRequest extends Request {
  auth?: SessionPrincipal;
}

/** Maps a hand-rolled validation failure onto the standard envelope. */
function parse<T>(validate: () => T): T {
  try {
    return validate();
  } catch (err) {
    if (err instanceof ValidationFailure) {
      throw validationError(err.issues);
    }
    throw err;
  }
}

function sessionCookie(token: string): string {
  const maxAge = Math.floor(IDLE_TTL_MS / 1000);
  // __Host- requires Secure, Path=/ and no Domain. Max-Age is the idle window.
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function clearedCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(@Body() body: unknown): Promise<unknown> {
    const input = parse(() => validateRegister(body));
    return this.auth.register(input);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(@Body() body: unknown): Promise<unknown> {
    const input = parse(() => validateVerify(body));
    return this.auth.verifyEmail(input.token);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<unknown> {
    const input = parse(() => validateLogin(body));
    const result = await this.auth.login(input);

    // Dashboard sessions live in an HttpOnly cookie and the token is never
    // returned to JavaScript. Mobile clients get the token in the body.
    if (result.kind === 'dashboard') {
      res.setHeader('Set-Cookie', sessionCookie(result.token));
      return {
        user_id: result.userId,
        kind: result.kind,
        expires_at: result.expiresAt.toISOString(),
      };
    }

    return {
      user_id: result.userId,
      kind: result.kind,
      token: result.token,
      expires_at: result.expiresAt.toISOString(),
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
}

/** GET /v1/me - the only proof of authenticated identity. */
@Controller('me')
export class MeController {
  constructor(private readonly auth: AuthService) {}

  @Get()
  @UseGuards(SessionGuard)
  async me(@Req() req: AuthedRequest): Promise<unknown> {
    return this.auth.me(req.auth as SessionPrincipal);
  }
}
