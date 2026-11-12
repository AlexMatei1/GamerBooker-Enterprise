import { startTestApp, type TestApp } from './support/auth-harness';
import { base32Decode, hotp, timeStepAt } from '../src/auth/totp';

type Fixture = { userId: string; cookie: string; tenantId: string; venueId: string };

async function member(app: TestApp, role: 'OWNER' | 'VENUE_MANAGER', existing?: Fixture): Promise<Fixture> {
  const user = await app.verifiedUser();
  const tenantId = existing?.tenantId ?? (await app.db.query<{ id: string }>(
    "INSERT INTO tenants(legal_name) VALUES('Discovery test tenant') RETURNING id")).rows[0].id;
  const venueId = existing?.venueId ?? (await app.db.query<{ id: string }>(
    "INSERT INTO venues(tenant_id,name,timezone,publication_state) VALUES($1,'Draft test venue','Europe/Bucharest','DRAFT') RETURNING id", [tenantId])).rows[0].id;
  await app.db.query('INSERT INTO venue_memberships(user_id,tenant_id,venue_id,role,active) VALUES($1,$2,$3,$4,true)', [user.userId, tenantId, venueId, role]);
  const enrolled = await app.call('POST', '/v1/auth/mfa/enroll', { headers: { cookie: user.cookie } });
  expect(enrolled.status).toBe(200);
  const secret = (enrolled.json as { secret: string }).secret;
  const confirmed = await app.call('POST', '/v1/auth/mfa/verify', { headers: { cookie: user.cookie }, body: { code: hotp(base32Decode(secret), timeStepAt(Date.now())) } });
  expect(confirmed.status).toBe(200);
  return { userId: user.userId, cookie: app.cookieOf(confirmed), tenantId, venueId };
}

async function completeReadiness(app: TestApp, venueId: string) {
  // Fixtures exist only in this harness's uniquely named disposable database.
  const room = (await app.db.query<{ id: string }>("INSERT INTO rooms(venue_id,name) VALUES($1,'Test room') RETURNING id", [venueId])).rows[0].id;
  const policy = (await app.db.query<{ id: string }>("INSERT INTO policy_profiles(venue_id,name,is_default,settings) VALUES($1,'Test policy',true,'{}'::jsonb) RETURNING id", [venueId])).rows[0].id;
  const zone = (await app.db.query<{ id: string }>("INSERT INTO zones(venue_id,room_id,name,policy_profile_id) VALUES($1,$2,'Test zone',$3) RETURNING id", [venueId, room, policy])).rows[0].id;
  await app.db.query("INSERT INTO resources(venue_id,room_id,zone_id,type,name,status,bookable) VALUES($1,$2,$3,'PC','Test PC','AVAILABLE',true)", [venueId, room, zone]);
  await app.db.query("INSERT INTO operating_schedules(venue_id,day_of_week,open_time,close_time,is_closed) VALUES($1,1,'10:00','22:00',false)", [venueId]);
  await app.db.query("INSERT INTO price_rules(venue_id,target_type,hourly_rate_minor,currency) VALUES($1,'VENUE_DEFAULT',2500,'RON')", [venueId]);
}

describe('Shared published venue discovery (disposable DB only)', () => {
  let app: TestApp;
  let owner: Fixture;
  let foreign: Fixture;
  let manager: Fixture;
  beforeAll(async () => {
    app = await startTestApp('shared_discovery', { browserClient: true });
    owner = await member(app, 'OWNER');
    foreign = await member(app, 'OWNER');
    manager = await member(app, 'VENUE_MANAGER', owner);
  });
  afterAll(async () => { if (app) await app.stop(); });
  const base = () => '/v1/dashboard/venues/' + owner.venueId;
  const publicVenues = async () => {
    const response = await app.call('GET', '/v1/venues');
    expect(response.status).toBe(200);
    return (response.json as { venues: { id: string; name: string; timezone: string; slug: string | null }[] }).venues;
  };
  // The catalog also carries the migration seed ('Demo Venue', PUBLISHED), so
  // assertions must be about THIS venue, never about the collection being empty.
  const publicVenue = async () => (await publicVenues()).find((v) => v.id === owner.venueId) ?? null;

  it('persists owner name/timezone while draft stays absent from the anonymous catalog', async () => {
    const updated = await app.call('PATCH', base(), { headers: { cookie: owner.cookie }, body: { name: 'Arena din catalog', timezone: 'Europe/Paris' } });
    expect(updated.status).toBe(200);
    const read = await app.call('GET', base(), { headers: { cookie: owner.cookie } });
    expect((read.json as { venue: unknown }).venue).toMatchObject({ name: 'Arena din catalog', timezone: 'Europe/Paris', publication_state: 'DRAFT' });
    expect(await publicVenue()).toBeNull();
  });

  it('enforces missing publication gates and rejects profile-based publication bypass', async () => {
    const gates = await app.call('GET', base() + '/publish-gates', { headers: { cookie: owner.cookie } });
    expect(gates.json).toMatchObject({ can_publish: false, current_state: 'DRAFT' });
    const rejected = await app.call('POST', base() + '/publish', { headers: { cookie: owner.cookie } });
    expect(rejected.status).toBe(400);
    expect(app.errorOf(rejected).code).toBe('PUBLISH_GATE_FAILED');
    const bypass = await app.call('PATCH', base(), { headers: { cookie: owner.cookie }, body: { publication_state: 'PUBLISHED' } });
    expect(bypass.status).toBe(400);
    expect(await publicVenue()).toBeNull();
  });

  it('prevents a foreign owner from editing, reading gates, publishing or unpublishing', async () => {
    for (const [method, suffix, body] of [['PATCH', '', { name: 'Foreign overwrite' }], ['GET', '/publish-gates', undefined], ['POST', '/publish', undefined], ['POST', '/unpublish', undefined]] as const) {
      const response = await app.call(method, base() + suffix, { headers: { cookie: foreign.cookie }, body });
      expect(response.status).toBe(404);
    }
    const row = (await app.db.query('SELECT name,publication_state FROM venues WHERE id=$1', [owner.venueId])).rows[0];
    expect(row).toEqual({ name: 'Arena din catalog', publication_state: 'DRAFT' });
  });

  it('allows manager profile edits but reserves publication for the owner', async () => {
    const edited = await app.call('PATCH', base(), { headers: { cookie: manager.cookie }, body: { name: 'Arena publică' } });
    expect(edited.status).toBe(200);
    await completeReadiness(app, owner.venueId);
    const denied = await app.call('POST', base() + '/publish', { headers: { cookie: manager.cookie } });
    expect(denied.status).toBe(403);
    expect(await publicVenue()).toBeNull();
  });

  it('publishes the saved profile, propagates rename, and removes it after unpublishing', async () => {
    const published = await app.call('POST', base() + '/publish', { headers: { cookie: owner.cookie } });
    expect(published.status).toBe(200);
    expect(await publicVenue()).toMatchObject({ id: owner.venueId, name: 'Arena publică', timezone: 'Europe/Paris' });
    const renamed = await app.call('PATCH', base(), { headers: { cookie: owner.cookie }, body: { name: 'Arena redenumită' } });
    expect(renamed.status).toBe(200);
    expect((await publicVenue())?.name).toBe('Arena redenumită');
    const unpublish = await app.call('POST', base() + '/unpublish', { headers: { cookie: owner.cookie } });
    expect(unpublish.status).toBe(200);
    expect(await publicVenue()).toBeNull();
  });
});
