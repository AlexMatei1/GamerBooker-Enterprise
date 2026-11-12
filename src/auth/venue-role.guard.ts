import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { AuthHttpError } from './auth-error';
import { MembershipService, type VenueRole } from './membership.service';
import type { SessionPrincipal } from './auth.service';

/**
 * Venue-scoped authorization.
 *
 * Two answers, deliberately different:
 *   - no active membership on that venue  -> 404 RESOURCE_NOT_FOUND, the same
 *     body as a venue that does not exist, so a caller cannot enumerate venues
 *     or tenants by watching 403s (handoff invariant 3).
 *   - membership exists, role not allowed -> 403 AUTH_ROLE_NOT_PERMITTED, which
 *     leaks nothing the caller does not already know about its own membership.
 *
 * Must be used after SessionGuard: it reads req.auth and never a request field.
 */

export const VENUE_ROLES_KEY = 'auth:venue-roles';

/** Declares which venue roles may call the handler. */
export function RequireVenueRole(...roles: VenueRole[]): MethodDecorator {
  return SetMetadata(VENUE_ROLES_KEY, roles);
}

interface AuthedRequestLike {
  auth?: SessionPrincipal;
  params?: Record<string, string | undefined>;
}

@Injectable()
export class VenueRoleGuard implements CanActivate {
  constructor(private readonly membership: MembershipService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<AuthedRequestLike>();
    const principal = req.auth;
    if (!principal) {
      throw new AuthHttpError(
        HttpStatus.UNAUTHORIZED,
        'AUTH_REQUIRED',
        'Authentication is required.',
      );
    }

    const venueId = req.params?.venue_id;
    const role = venueId ? await this.membership.roleFor(principal.userId, venueId) : null;
    if (!role) {
      throw notFound();
    }

    const required = Reflect.getMetadata(VENUE_ROLES_KEY, context.getHandler()) as
      | VenueRole[]
      | undefined;
    if (required && required.length > 0 && !required.includes(role)) {
      throw new AuthHttpError(
        HttpStatus.FORBIDDEN,
        'AUTH_ROLE_NOT_PERMITTED',
        'Your role does not permit this action.',
      );
    }
    return true;
  }
}

export function notFound(): AuthHttpError {
  return new AuthHttpError(HttpStatus.NOT_FOUND, 'RESOURCE_NOT_FOUND', 'Resource not found.');
}

/** Temporary closure for legacy operational routes without tenant-safe contracts. */
@Injectable()
export class ClosedLegacyGuard implements CanActivate {
  canActivate(): boolean { throw notFound(); }
}
