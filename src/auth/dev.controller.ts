import { Controller, Get, Query } from '@nestjs/common';
import { validationError } from './auth-error';
import { AuthService } from './auth.service';
import { normalizeEmail, throwIf, ValidationFailure, type FieldIssue } from './validation';

/**
 * Development-only convenience endpoint (HANDOFF-ENG-002 D1).
 *
 * No mail provider exists in phase 0, and only the SHA-256 digest of a
 * verification token is stored, so the raw value cannot be read back. This
 * route therefore re-issues a fresh token for an unverified account and
 * returns it. It is mounted ONLY when NODE_ENV=development (see DevAuthModule
 * and AppModule); in any other environment the route does not exist at all.
 *
 * This is a recorded release blocker for staging and production.
 */
@Controller('dev')
export class DevController {
  constructor(private readonly auth: AuthService) {}

  @Get('verification-token')
  async verificationToken(@Query('email') email: unknown): Promise<{ token: string }> {
    const issues: FieldIssue[] = [];
    const normalized = normalizeEmail(email, issues);
    try {
      throwIf(issues);
    } catch (err) {
      if (err instanceof ValidationFailure) {
        throw validationError(err.issues);
      }
      throw err;
    }
    return this.auth.issueDevVerificationToken(normalized);
  }
}
