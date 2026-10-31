/**
 * ENG002-T03: role resolution, venue scoping and the 404/403 split.
 *
 * The booking-create half of T03 needs a bookings route, which ENG-005 owns
 * (decision D9 in notes/eng-002-slice-b-part-2-plan.md). What is proven here is
 * the substrate every later route reuses: the role is read from the database on
 * every request, a venue outside the caller's memberships is indistinguishable
 * from one that does not exist, and a role gate answers 403 only when the
 * membership itself is real.
 */
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthHttpError } from '../src/auth/auth-error';
import type { SessionPrincipal } from '../src/auth/auth.service';
import type { MembershipService, VenueRole } from '../src/auth/membership.service';
import { RequireVenueRole, VenueRoleGuard } from '../src/auth/venue-role.guard';
import { startTestApp, type TestApp } from './support/auth-harness';

interface Fixture {
  userId: string;
  cookie: string;
  email: string;
  tenantId: string;
  venueId: string;
}

async function staffWithRole(app: TestApp, role: string): Promise<Fixture> {
  const user = await app.verifiedUser();
  const tenant = await app.db.query<{ id: string }>(
    "INSERT INTO tenants (legal_name) VALUES ('RBAC tenant') RETURNING id",
  );
  const tenantId = tenant.rows[0].id;
  const venue = await app.db.query<{ id: string }>(
    "INSERT INTO venues (tenant_id, timezone) VALUES ($1, 'Europe/Bucharest') RETURNING id",
    [tenantId],
  );
  const venueId = venue.rows[0].id;
  await app.db.query(
    'INSERT INTO venue_memberships (user_id, venue_id, tenant_id, role)' +
      ' VALUES ($1, $2, $3, $4)',
    [user.userId, venueId, tenantId, role],
  );
  return { ...user, tenantId, venueId };
}

describe('ENG002-T03 venue scoping', () => {
  let app: TestApp;
  let reception: Fixture;
  let otherTenant: Fixture;

  beforeAll(async () => {
    app = await startTestApp('t03rbac');
    reception = await staffWithRole(app, 'RECEPTION');
    otherTenant = await staffWithRole(app, 'OWNER');
  }, 60000);

  afterAll(async () => {
    if (app) {
      await app.stop();
    }
  }, 60000);

  it('lets RECEPTION read its own venue', async () => {
    const res = await app.call('GET', '/v1/venues/' + reception.venueId, {
      headers: { cookie: reception.cookie },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const venue = (res.json as { venue: Record<string, unknown> }).venue;
    expect(venue.id).toBe(reception.venueId);
    expect(venue.tenant_id).toBe(reception.tenantId);
    expect(venue.timezone).toBe('Europe/Bucharest');
    // Only the three agreed columns; ENG-003 owns the venue model.
    expect(Object.keys(venue).sort()).toEqual(['id', 'tenant_id', 'timezone']);
  });

  it('answers 404, not 403, for another tenant venue', async () => {
    const res = await app.call('GET', '/v1/venues/' + otherTenant.venueId, {
      headers: { cookie: reception.cookie },
    });
    expect(res.status).toBe(404);
    expect(app.errorOf(res).code).toBe('RESOURCE_NOT_FOUND');
  });

  it('gives a missing venue and a foreign venue the same body shape', async () => {
    const missing = await app.call('GET', '/v1/venues/00000000-0000-4000-8000-000000000000', {
      headers: { cookie: reception.cookie },
    });
    const foreign = await app.call('GET', '/v1/venues/' + otherTenant.venueId, {
      headers: { cookie: reception.cookie },
    });
    expect(missing.status).toBe(404);
    expect(foreign.status).toBe(404);
    const a = app.errorOf(missing);
    const b = app.errorOf(foreign);
    expect(a.code).toBe(b.code);
    expect(a.message).toBe(b.message);
    expect(a.request_id).not.toBe(b.request_id);
  });

  it('answers 404 for an id that is not a UUID', async () => {
    const res = await app.call('GET', '/v1/venues/not-a-uuid', {
      headers: { cookie: reception.cookie },
    });
    expect(res.status).toBe(404);
    expect(app.errorOf(res).code).toBe('RESOURCE_NOT_FOUND');
  });

  it('answers 404 for an inactive membership', async () => {
    const lapsed = await staffWithRole(app, 'RECEPTION');
    await app.db.query(
      'UPDATE venue_memberships SET active = false WHERE user_id = $1 AND venue_id = $2',
      [lapsed.userId, lapsed.venueId],
    );
    const res = await app.call('GET', '/v1/venues/' + lapsed.venueId, {
      headers: { cookie: lapsed.cookie },
    });
    expect(res.status).toBe(404);
    expect(app.errorOf(res).code).toBe('RESOURCE_NOT_FOUND');
  });

  it('answers 401 without a session', async () => {
    const res = await app.call('GET', '/v1/venues/' + reception.venueId);
    expect(res.status).toBe(401);
    expect(app.errorOf(res).code).toBe('AUTH_REQUIRED');
  });

  it('ignores a role or venue claimed in the request', async () => {
    const res = await app.call(
      'GET',
      '/v1/venues/' +
        otherTenant.venueId +
        '?role=OWNER&venue_id=' +
        otherTenant.venueId +
        '&tenant_id=' +
        otherTenant.tenantId,
      {
        headers: {
          cookie: reception.cookie,
          'x-role': 'OWNER',
          'x-venue-id': otherTenant.venueId,
          'x-tenant-id': otherTenant.tenantId,
        },
      },
    );
    // Query and headers are never read: resolution comes from the session's
    // user id and the path parameter.
    expect(res.status).toBe(404);
    expect(app.errorOf(res).code).toBe('RESOURCE_NOT_FOUND');
  });

  it('refuses a gated role that has not enrolled a factor yet', async () => {
    const res = await app.call('GET', '/v1/venues/' + otherTenant.venueId, {
      headers: { cookie: otherTenant.cookie },
    });
    // The OWNER has no confirmed factor, so the per-request gate stops the call
    // before the venue guard runs (D2): the role alone is not enough.
    expect(res.status).toBe(403);
    expect(app.errorOf(res).code).toBe('AUTH_MFA_REQUIRED');
  });
});

describe('ENG002-T03 role gate', () => {
  const membership = {
    roleFor: jest.fn(),
  } as unknown as MembershipService;

  function contextFor(handler: () => void): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          auth: {
            sessionId: 's',
            userId: 'u',
            kind: 'dashboard',
            mfaState: 'active',
          } as SessionPrincipal,
          params: { venue_id: 'v' },
        }),
      }),
      getHandler: () => handler,
    } as unknown as ExecutionContext;
  }

  const guard = new VenueRoleGuard(membership);

  it('allows a role the handler accepts', async () => {
    (membership.roleFor as jest.Mock).mockResolvedValue('RECEPTION');
    class Handler {
      @RequireVenueRole('RECEPTION', 'OWNER')
      run(): void {
        return undefined;
      }
    }
    await expect(guard.canActivate(contextFor(Handler.prototype.run))).resolves.toBe(true);
  });

  it('refuses a real membership whose role is not permitted', async () => {
    (membership.roleFor as jest.Mock).mockResolvedValue('BAR_STAFF');
    class Handler {
      @RequireVenueRole('OWNER' as VenueRole)
      run(): void {
        return undefined;
      }
    }
    await expect(guard.canActivate(contextFor(Handler.prototype.run))).rejects.toMatchObject({
      code: 'AUTH_ROLE_NOT_PERMITTED',
    });
    await expect(guard.canActivate(contextFor(Handler.prototype.run))).rejects.toBeInstanceOf(
      AuthHttpError,
    );
  });

  it('answers 404 before it considers the role when there is no membership', async () => {
    (membership.roleFor as jest.Mock).mockResolvedValue(null);
    class Handler {
      @RequireVenueRole('OWNER' as VenueRole)
      run(): void {
        return undefined;
      }
    }
    await expect(guard.canActivate(contextFor(Handler.prototype.run))).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    });
  });

  it('refuses an unauthenticated call outright', async () => {
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ params: {} }) }),
      getHandler: () => (() => undefined) as unknown as () => void,
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  // Reflector is a dependency of Nest, not of the guard; importing it here only
  // proves the metadata key the decorator writes is the one the guard reads.
  it('writes metadata the guard reads back', () => {
    class Handler {
      @RequireVenueRole('OWNER')
      run(): void {
        return undefined;
      }
    }
    const reflector = new Reflector();
    expect(reflector.get('auth:venue-roles', Handler.prototype.run)).toEqual(['OWNER']);
  });
});
