import { randomUUID } from 'node:crypto';
import { startTestApp, PASSWORD, type TestApp, type ApiResponse } from './support/auth-harness';
import { changePlatformAccess } from '../src/platform-access/operator';
import { base32Decode,hotp,timeStepAt } from '../src/auth/totp';

const csrf={'x-gamerbooker-csrf':'1'};
interface ApplicationRow {id:string;applicant_user_id:string;tenant_id:string;venue_id:string;status:string}
interface ResponseBody {application:ApplicationRow;verification_token:string;user_id:string;mfa_required:boolean;secret:string;token:string;platform_admin:boolean;venues:{id:string;role:string;name:string}[];resource:{id:string};membership:{id:string};invitation:{token:string}}
const json=(r:ApiResponse)=>r.json as ResponseBody;
describe('Cafe access: real HTTP, isolated PostgreSQL, least privilege',()=>{
  let app:TestApp;
  let admin:{userId:string;email:string;cookie:string};
  let a:{userId:string;email:string;cookie:string};
  let b:{userId:string;email:string;cookie:string};
  let applicationA:ApplicationRow,applicationB:ApplicationRow;
  const secrets=new Map<string,string>();
  const suffix='cafe_access_'+randomUUID().replace(/-/g,'').slice(0,16);
  beforeAll(async()=>{
    process.env.DASHBOARD_ORIGINS='https://dashboard.example.test';
    app=await startTestApp(suffix);
    process.stdout.write('Disposable cafe test database: '+app.databaseName+' (drop on teardown)\n');
  },60000);
  afterAll(async()=>{if(app)await app.stop();},60000);
  async function user(){
    const email=app.uniqueEmail();
    const reg=await app.call('POST','/v1/auth/register',{body:{email,password:PASSWORD,accepted_terms:true}});
    expect(reg.status).toBe(201);
    expect((await app.call('POST','/v1/auth/verify',{body:{token:json(reg).verification_token}})).status).toBe(200);
    const login=await app.call('POST','/v1/auth/login',{headers:csrf,body:{email,password:PASSWORD}});
    expect(login.status).toBe(200);
    return {email,userId:String(json(reg).user_id),cookie:app.cookieOf(login)};
  }
  async function mfa(u:{userId:string;email:string;cookie:string}){
    const login=await app.call('POST','/v1/auth/login',{headers:csrf,body:{email:u.email,password:PASSWORD}});
    expect(login.status).toBe(200);
    const pending=app.cookieOf(login);
    let secret=secrets.get(u.userId);
    if(!secret){const enroll=await app.call('POST','/v1/auth/mfa/enroll',{headers:{...csrf,cookie:pending}});expect(enroll.status).toBe(200);secret=json(enroll).secret;secrets.set(u.userId,secret!);}
    else await app.db.query('UPDATE user_mfa_factors SET last_used_time_step=NULL WHERE user_id=$1',[u.userId]); // Isolated fixture: avoid sleeping for a second TOTP step.
    const verified=await app.call('POST','/v1/auth/mfa/verify',{headers:{...csrf,cookie:pending},body:{code:hotp(base32Decode(secret!),timeStepAt(Date.now()))}});
    expect(verified.status).toBe(200);
    expect((await app.call('GET','/v1/me',{headers:{cookie:pending}})).status).toBe(401);
    u.cookie=app.cookieOf(verified);
  }
  async function submit(u:typeof a,name:string){
    const response=await app.call('POST','/v1/cafe/applications',{headers:{...csrf,cookie:u.cookie},body:{legal_name:name+' SRL',venue_name:name,city:'București',timezone:'Europe/Bucharest'}});
    expect(response.status).toBe(201);return json(response).application;
  }
  const adminHeaders=()=>({...csrf,cookie:admin.cookie});
  it('has no public admin bootstrap, no public global event bus, and no preview-based authentication',async()=>{
    for(const [method,path] of [['GET','/v1/admin/cafe-applications'],['POST','/v1/admin/tenants'],['POST','/v1/admin/venues']]){
      expect((await app.call(method,path,{headers:{'x-preview-client':'staff','x-role':'PLATFORM_ADMIN',authorization:'Bearer fake-preview'},body:method==='POST'?{}:undefined})).status).toBe(401);
    }
    expect((await app.call('POST','/v1/events/broadcast',{body:{venueId:randomUUID()}})).status).toBe(404);
    expect((await app.call('GET','/v1/events/stream')).status).toBe(404);
    expect((await app.call('POST','/v1/admin/bootstrap',{body:{role:'PLATFORM_ADMIN'}})).status).toBe(404);
  });
  it('requires browser-safe dashboard login, including explicit missing and hostile-origin denials',async()=>{
    const u=await user();
    expect((await app.call('POST','/v1/auth/login',{body:{email:u.email,password:PASSWORD}})).status).toBe(403);
    expect((await app.call('POST','/v1/auth/login',{headers:{...csrf,origin:'https://evil.example'},body:{email:u.email,password:PASSWORD}})).status).toBe(403);
    const response=await app.call('OPTIONS','/v1/auth/login',{headers:{origin:'https://evil.example','access-control-request-method':'POST','access-control-request-headers':'x-gamerbooker-csrf'}});
    expect(response.headers.get('access-control-allow-origin')).not.toBe('https://evil.example');
  });
  it('allows only privileged local operators to grant verified dedicated admins, revokes old sessions, and requires real session MFA',async()=>{
    admin=await user();
    await expect(changePlatformAccess(app.appDb,admin.email,'TEST-OPERATOR-001',false)).rejects.toThrow('Privileged operator');
    await expect(app.appDb.query('INSERT INTO platform_grants(user_id,operator_reference) VALUES($1,$2)',[admin.userId,'FORGED'])).rejects.toMatchObject({code:'42501'});
    await changePlatformAccess(app.db,admin.email,'TEST-OPERATOR-001',false);
    expect((await app.call('GET','/v1/access/context',{headers:{cookie:admin.cookie}})).status).toBe(401);
    const login=await app.call('POST','/v1/auth/login',{headers:csrf,body:{email:admin.email,password:PASSWORD}});
    expect(json(login).mfa_required).toBe(true);
    expect((await app.call('GET','/v1/admin/cafe-applications',{headers:{cookie:app.cookieOf(login)}})).status).toBe(403);
    await mfa(admin);
    expect((await app.call('GET','/v1/admin/cafe-applications',{headers:adminHeaders()})).status).toBe(200);
    expect((await app.call('GET','/v1/admin/cafe-applications',{headers:{authorization:'Bearer '+admin.cookie.split('=')[1]}})).status).toBe(401);
    const mobile=await app.call('POST','/v1/auth/login',{body:{email:admin.email,password:PASSWORD,kind:'mobile'}});
    await app.db.query("UPDATE sessions SET mfa_state='active',mfa_verified_at=now() WHERE user_id=$1 AND kind='mobile'",[admin.userId]);
    expect((await app.call('GET','/v1/admin/cafe-applications',{headers:{authorization:'Bearer '+json(mobile).token}})).status).toBe(403);
    expect((await app.call('POST','/v1/admin/tenants',{headers:{cookie:admin.cookie},body:{legal_name:'CSRF'}})).status).toBe(403);
    expect((await app.call('POST','/v1/admin/venues',{headers:{...adminHeaders(),origin:'https://evil.example'},body:{}})).status).toBe(403);
  });
  it('binds applications to verified sessions and rejects forged identity/role data; pending and rejected get no membership',async()=>{
    a=await user();b=await user();
    const denied=await app.call('POST','/v1/cafe/applications',{headers:{...csrf,cookie:a.cookie},body:{legal_name:'Cafe SRL',venue_name:'Cafe A',city:'București',timezone:'Europe/Bucharest',user_id:b.userId,role:'OWNER'}});
    expect(denied.status).toBe(400);
    applicationA=await submit(a,'Cafe A');applicationB=await submit(b,'Cafe B');
    expect(applicationA.applicant_user_id).toBe(a.userId);
    expect(json(await app.call('GET','/v1/access/context',{headers:{cookie:a.cookie}})).venues).toEqual([]);
    expect((await app.call('GET','/v1/admin/cafe-applications',{headers:{cookie:a.cookie}})).status).toBe(403);
    expect((await app.call('POST','/v1/admin/tenants',{headers:{...csrf,cookie:a.cookie},body:{legal_name:'forged'}})).status).toBe(403);
    expect((await app.call('POST','/v1/admin/venues',{headers:{...csrf,cookie:a.cookie},body:{tenant_id:randomUUID(),name:'forged'}})).status).toBe(403);
    const own=json(await app.call('GET','/v1/cafe/applications/me?user_id='+b.userId,{headers:{cookie:a.cookie}})).application;
    expect(own.id).toBe(applicationA.id);
    const rejected=await user();const rejectApp=await submit(rejected,'Rejected cafe');
    expect((await app.call('POST','/v1/admin/cafe-applications/'+rejectApp.id+'/decision',{headers:adminHeaders(),body:{decision:'REJECTED',reason:'Date incomplete'}})).status).toBe(201);
    expect(json(await app.call('GET','/v1/cafe/applications/me',{headers:{cookie:rejected.cookie}})).application.status).toBe('REJECTED');
    expect((await app.call('POST','/v1/admin/cafe-applications/'+rejectApp.id+'/decision',{headers:adminHeaders(),body:{decision:'APPROVED',reason:'Try changing'}})).status).toBe(409);
    expect((await app.db.query('SELECT 1 FROM venue_memberships WHERE user_id=$1',[rejected.userId])).rowCount).toBe(0);
  });
  it('approves atomically under concurrent replay, creates one DRAFT venue/OWNER, locks decisions and revokes applicant sessions',async()=>{
    const [first,replay]=await Promise.all([1,2].map(()=>app.call('POST','/v1/admin/cafe-applications/'+applicationA.id+'/decision',{headers:adminHeaders(),body:{decision:'APPROVED',reason:'Date verificate'}})));
    expect(first.status).toBe(201);expect(replay.status).toBe(201);
    applicationA=json(first).application;
    expect(applicationA.venue_id).toBe(json(replay).application.venue_id);
    expect((await app.db.query('SELECT 1 FROM tenants WHERE legal_name=$1',['Cafe A SRL'])).rowCount).toBe(1);
    expect((await app.db.query('SELECT 1 FROM venue_memberships WHERE user_id=$1 AND role=$2',[a.userId,'OWNER'])).rowCount).toBe(1);
    expect((await app.db.query('SELECT publication_state FROM venues WHERE id=$1',[applicationA.venue_id])).rows[0].publication_state).toBe('DRAFT');
    expect((await app.call('GET','/v1/access/context',{headers:{cookie:a.cookie}})).status).toBe(401);
    applicationB=json(await app.call('POST','/v1/admin/cafe-applications/'+applicationB.id+'/decision',{headers:adminHeaders(),body:{decision:'APPROVED',reason:'Date verificate'}})).application;
    await mfa(a);await mfa(b);
    await expect(app.db.query("UPDATE cafe_applications SET status='REJECTED' WHERE id=$1",[applicationA.id])).rejects.toMatchObject({code:'23514'});
  });
  it('isolates two cafe contexts and direct venue/resource/booking IDs; admins have setup-only reach',async()=>{
    const ctx=json(await app.call('GET','/v1/access/context',{headers:{cookie:a.cookie}}));
    expect(ctx.platform_admin).toBe(false);expect(ctx.venues.map(v=>v.id)).toEqual([applicationA.venue_id]);expect(ctx.venues[0].role).toBe('OWNER');
    const foreign=await app.call('GET','/v1/dashboard/venues/'+applicationB.venue_id+'/overview',{headers:{cookie:a.cookie,'x-user-id':b.userId,'x-role':'OWNER'}});
    const missing=await app.call('GET','/v1/dashboard/venues/'+randomUUID()+'/overview',{headers:{cookie:a.cookie}});
    expect(foreign.status).toBe(404);expect(missing.status).toBe(404);expect(app.errorOf(foreign).code).toBe(app.errorOf(missing).code);
    const resource=await app.call('POST','/v1/dashboard/venues/'+applicationB.venue_id+'/resources',{headers:{...csrf,cookie:b.cookie},body:{name:'B private PC',type:'PC'}});
    expect(resource.status).toBe(201);
    const overview=await app.call('GET','/v1/dashboard/venues/'+applicationA.venue_id+'/overview',{headers:{cookie:a.cookie}});
    expect(overview.status).toBe(200);expect(overview.text).not.toContain('B private PC');
    expect((await app.call('PATCH','/v1/dashboard/venues/'+applicationA.venue_id+'/resources/'+json(resource).resource.id,{headers:{...csrf,cookie:a.cookie},body:{name:'forged'}})).status).toBe(404);
    const quote=await app.db.query<{id:string}>(`INSERT INTO price_quotes(venue_id,customer_id,starts_at,ends_at,items_snapshot,policy_snapshot,total_minor,due_now_minor,balance_minor,signature,expires_at)
       VALUES($1,$2,now(),now()+interval '1 hour','{}','{}',100,100,0,'fixture',now()+interval '1 hour') RETURNING id`,[applicationB.venue_id,b.userId]);
    const booking=await app.db.query<{id:string}>(`INSERT INTO bookings(public_code,tenant_id,venue_id,customer_id,quote_id,status,starts_at,ends_at,resource_ids,atomic_resource_ids,total_minor,due_now_minor,price_snapshot,policy_snapshot)
       VALUES($1,$2,$3,$4,$5,'CONFIRMED',now(),now()+interval '1 hour','{}','{}',100,100,'{}','{}') RETURNING id`,['ISOLATION-'+randomUUID(),applicationB.tenant_id,applicationB.venue_id,b.userId,quote.rows[0].id]);
    expect((await app.call('POST','/v1/dashboard/venues/'+applicationA.venue_id+'/bookings/'+booking.rows[0].id+'/extend',{headers:{...csrf,cookie:a.cookie},body:{additional_minutes:30,expected_version:1}})).status).toBe(404);
    expect((await app.call('POST','/v1/bookings/'+booking.rows[0].id+'/extend',{headers:{...csrf,cookie:a.cookie},body:{additional_minutes:30,expected_version:1}})).status).toBe(404);
    expect((await app.call('GET','/v1/dashboard/venues/'+applicationA.venue_id+'/overview',{headers:adminHeaders()})).status).toBe(403);
    expect((await app.call('POST','/v1/bookings/'+booking.rows[0].id+'/extend',{headers:adminHeaders(),body:{additional_minutes:30,expected_version:1}})).status).toBe(403);
    expect((await app.call('GET','/v1/compliance/venues/'+applicationB.venue_id+'/fiscal-status',{headers:{cookie:a.cookie}})).status).toBe(404);
    expect((await app.call('GET','/v1/observability/security-metrics?tenant_id='+applicationB.tenant_id,{headers:{cookie:a.cookie}})).status).toBe(404);
    expect((await app.call('POST','/v1/observability/security-violations',{body:{tenantId:applicationB.tenant_id,actorId:admin.userId}})).status).toBe(401);
    for(const path of ['/v1/runbooks/r1-double-booking-audit?resource_id='+json(resource).resource.id,'/v1/runbooks/r3-receivable-reconciliation?venue_id='+applicationB.venue_id,'/v1/runbooks/r4-publish-diagnostics?venue_id='+applicationB.venue_id]) expect((await app.call('GET',path,{headers:{cookie:a.cookie}})).status).toBe(404);
    expect((await app.call('POST','/v1/training/certifications',{headers:{...csrf,cookie:a.cookie},body:{tenant_id:applicationB.tenant_id,venue_id:applicationB.venue_id,user_id:a.userId,module_id:'fake'}})).status).toBe(404);
  });
  it('rejects publication_state in generic owner/manager profiles and retains the dedicated publication gates',async()=>{
    const manager=await user();
    const member=await app.call('POST','/v1/dashboard/venues/'+applicationA.venue_id+'/memberships',{
      headers:{...csrf,cookie:a.cookie},body:{userId:manager.userId,role:'VENUE_MANAGER'},
    });
    expect(member.status).toBe(201);
    await mfa(manager);
    const before=(await app.db.query('SELECT name,publication_state,updated_at FROM venues WHERE id=$1',[applicationA.venue_id])).rows[0];
    for(const caller of [a,manager]) for(const state of ['PUBLISHED','DRAFT','PENDING_APPROVAL','ARCHIVED',null]){
      const response=await app.call('PATCH','/v1/dashboard/venues/'+applicationA.venue_id,{
        headers:{...csrf,cookie:caller.cookie},body:{name:'Must not change',publication_state:state},
      });
      expect(response.status).toBe(400);
      expect(app.errorOf(response).code).toBe('VALIDATION_FAILED');
    }
    expect((await app.db.query('SELECT name,publication_state,updated_at FROM venues WHERE id=$1',[applicationA.venue_id])).rows[0]).toEqual(before);
    const publish=await app.call('POST','/v1/dashboard/venues/'+applicationA.venue_id+'/publish',{headers:{...csrf,cookie:a.cookie}});
    expect(publish.status).toBe(400);expect(app.errorOf(publish).code).toBe('PUBLISH_GATE_FAILED');
    expect((await app.db.query('SELECT publication_state FROM venues WHERE id=$1',[applicationA.venue_id])).rows[0].publication_state).toBe('DRAFT');
    expect(json(await app.call('GET','/v1/venues')).venues.some(v=>v.id===applicationA.venue_id)).toBe(false);
    expect((await app.db.query("SELECT 1 FROM audit_events WHERE venue_id=$1 AND action='VENUE_PUBLISHED'",[applicationA.venue_id])).rowCount).toBe(0);
    expect((await app.call('PATCH','/v1/dashboard/venues/'+applicationA.venue_id,{headers:{...csrf,cookie:manager.cookie},body:{name:before.name,contact:{setup:'verified'}}})).status).toBe(200);
  });
  it('binds staff transition lookup to the path venue before version checks and preserves foreign booking side effects',async()=>{
    const resource=await app.db.query<{id:string}>("INSERT INTO resources(venue_id,type,name) VALUES($1,'PC','Transition private PC') RETURNING id",[applicationB.venue_id]);
    async function bookingFixture(){
      const quote=await app.db.query<{id:string}>(`INSERT INTO price_quotes(venue_id,customer_id,starts_at,ends_at,items_snapshot,policy_snapshot,total_minor,due_now_minor,balance_minor,signature,expires_at)
        VALUES($1,$2,now(),now()+interval '1 hour','{}','{}',100,100,0,'fixture',now()+interval '1 hour') RETURNING id`,[applicationB.venue_id,b.userId]);
      return (await app.db.query<{id:string}>(`INSERT INTO bookings(public_code,tenant_id,venue_id,customer_id,quote_id,status,starts_at,ends_at,resource_ids,atomic_resource_ids,total_minor,due_now_minor,price_snapshot,policy_snapshot)
        VALUES($1,$2,$3,$4,$5,'CONFIRMED',now(),now()+interval '1 hour',$6,$6,100,100,'{}','{}') RETURNING id`,
        ['TRANSITION-'+randomUUID(),applicationB.tenant_id,applicationB.venue_id,b.userId,quote.rows[0].id,[resource.rows[0].id]])).rows[0].id;
    }
    const bookingId=await bookingFixture();
    await app.db.query(`INSERT INTO resource_claims(resource_id,tenant_id,holder_id,claim_type,state,slot,booking_id)
      VALUES($1,$2,$3,'BOOKING','CONFIRMED',tstzrange(now(),now()+interval '1 hour','[)'),$4)`,[resource.rows[0].id,applicationB.tenant_id,b.userId,bookingId]);
    async function snapshot(){return {
      booking:(await app.db.query('SELECT * FROM bookings WHERE id=$1',[bookingId])).rows,
      claims:(await app.db.query('SELECT * FROM resource_claims WHERE booking_id=$1 ORDER BY id',[bookingId])).rows,
      audit:(await app.db.query('SELECT * FROM audit_events WHERE target_id=$1 ORDER BY id',[bookingId])).rows,
      outbox:(await app.db.query('SELECT * FROM outbox_events WHERE aggregate_id=$1 ORDER BY id',[bookingId])).rows,
    };}
    const before=await snapshot();
    for(const version of [1,99]){
      const denied=await app.call('POST','/v1/dashboard/venues/'+applicationA.venue_id+'/bookings/'+bookingId+'/transition',{
        headers:{...csrf,cookie:a.cookie},body:{target_status:'CANCELLED',expected_version:version},
      });
      const missing=await app.call('POST','/v1/dashboard/venues/'+applicationA.venue_id+'/bookings/'+randomUUID()+'/transition',{
        headers:{...csrf,cookie:a.cookie},body:{target_status:'CANCELLED',expected_version:version},
      });
      expect(denied.status).toBe(404);expect(missing.status).toBe(404);
      expect(app.errorOf(denied).code).toBe(app.errorOf(missing).code);
      expect(app.errorOf(denied).message).toBe(app.errorOf(missing).message);
      expect(await snapshot()).toEqual(before);
    }
    const legitimate=await app.call('POST','/v1/dashboard/venues/'+applicationB.venue_id+'/bookings/'+bookingId+'/transition',{
      headers:{...csrf,cookie:b.cookie},body:{target_status:'CANCELLED',expected_version:1},
    });
    expect(legitimate.status).toBe(201);
    const after=await snapshot();
    expect(after.booking[0].status).toBe('CANCELLED');expect(after.booking[0].version).toBe(2);
    expect(after.claims[0].state).toBe('CANCELLED');expect(after.audit).toHaveLength(1);expect(after.outbox).toHaveLength(1);
    const customerBookingId=await bookingFixture();
    const foreignCustomer=await app.call('POST','/v1/bookings/'+customerBookingId+'/cancel',{headers:{...csrf,cookie:a.cookie},body:{expected_version:99}});
    expect(foreignCustomer.status).toBe(404);
    const ownCustomer=await app.call('POST','/v1/bookings/'+customerBookingId+'/cancel',{headers:{...csrf,cookie:b.cookie},body:{expected_version:1}});
    expect(ownCustomer.status).toBe(201);
  });
  it('rejects platform role injection in direct create/update/invite/legacy accept and binds invitations to actual account email',async()=>{
    const staff=await user();const base='/v1/dashboard/venues/'+applicationA.venue_id;
    const headers={...csrf,cookie:a.cookie};
    expect((await app.call('POST',base+'/memberships',{headers,body:{userId:staff.userId,role:'PLATFORM_ADMIN'}})).status).toBe(400);
    const member=await app.call('POST',base+'/memberships',{headers,body:{userId:staff.userId,role:'RECEPTION'}});expect(member.status).toBe(201);
    expect((await app.call('PATCH',base+'/memberships/'+json(member).membership.id,{headers,body:{role:'PLATFORM_ADMIN'}})).status).toBe(400);
    expect((await app.call('POST',base+'/staff/invitations',{headers,body:{email:app.uniqueEmail(),role:'PLATFORM_ADMIN'}})).status).toBe(400);
    await expect(app.appDb.query("INSERT INTO venue_memberships(user_id,tenant_id,venue_id,role) VALUES($1,$2,$3,'PLATFORM_ADMIN')",[staff.userId,applicationB.tenant_id,applicationB.venue_id])).rejects.toMatchObject({code:'23514'});
    const target=await user();const inv=await app.call('POST',base+'/staff/invitations',{headers,body:{email:target.email,role:'RECEPTION'}});expect(inv.status).toBe(201);
    const body={token:json(inv).invitation.token};
    expect((await app.call('POST','/v1/auth/invitations/accept',{headers:{...csrf,cookie:staff.cookie},body})).status).toBe(404);
    expect((await app.call('POST','/v1/auth/invitations/accept',{headers:{...csrf,cookie:target.cookie},body})).status).toBe(200);
    // HANDOFF-ENG-201.md:74-75 — a real, matching account re-using an already
    // accepted token gets the granular 400 INVITATION_ALREADY_USED, not the
    // anti-enumeration 404 reserved for a token that is not this account's.
    const replay=await app.call('POST','/v1/auth/invitations/accept',{headers:{...csrf,cookie:target.cookie},body});
    expect(replay.status).toBe(400);
    expect(app.errorOf(replay).code).toBe('INVITATION_ALREADY_USED');
    expect(json(await app.call('GET','/v1/access/context',{headers:{cookie:staff.cookie}})).venues[0].role).toBe('RECEPTION');
    expect((await app.call('GET','/v1/admin/cafe-applications',{headers:{cookie:staff.cookie}})).status).toBe(403);
    // Existing legacy strings remain data, never platform authority.
    await app.db.query('BEGIN');
    try{await app.db.query('ALTER TABLE venue_memberships DISABLE TRIGGER venue_role_only');await app.db.query("INSERT INTO venue_memberships(user_id,tenant_id,venue_id,role) VALUES($1,$2,$3,'PLATFORM_ADMIN')",[target.userId,applicationB.tenant_id,applicationB.venue_id]);await app.db.query('ALTER TABLE venue_memberships ENABLE TRIGGER venue_role_only');await app.db.query('COMMIT');}catch(e){await app.db.query('ROLLBACK');throw e;}
    expect((await app.call('GET','/v1/admin/cafe-applications',{headers:{cookie:target.cookie}})).status).toBe(403);
    expect((await app.call('GET','/v1/dashboard/venues/'+applicationB.venue_id+'/overview',{headers:{cookie:target.cookie}})).status).toBe(404);
  });
  it('gates mid-session privileges even with an enrolled factor, revocation, expiry, deleted/unverified/suspended identities',async()=>{
    await app.db.query('UPDATE sessions SET mfa_verified_at=NULL WHERE user_id=$1',[a.userId]);
    expect((await app.call('GET','/v1/dashboard/venues/'+applicationA.venue_id+'/overview',{headers:{cookie:a.cookie}})).status).toBe(403);
    await mfa(a);
    const u=await user();await app.db.query("UPDATE users SET identity_status='suspended' WHERE id=$1",[u.userId]);
    expect((await app.call('GET','/v1/access/context',{headers:{cookie:u.cookie}})).status).toBe(401);
    const d=await user();await app.db.query('UPDATE users SET deleted_at=now() WHERE id=$1',[d.userId]);
    expect((await app.call('GET','/v1/access/context',{headers:{cookie:d.cookie}})).status).toBe(401);
    const e=await user();await app.db.query("UPDATE sessions SET absolute_expires_at=now()-interval '1 second' WHERE user_id=$1",[e.userId]);
    expect((await app.call('GET','/v1/access/context',{headers:{cookie:e.cookie}})).status).toBe(401);
    const v=await user();await app.db.query('UPDATE users SET email_verified_at=NULL WHERE id=$1',[v.userId]);
    expect((await app.call('GET','/v1/access/context',{headers:{cookie:v.cookie}})).status).toBe(401);
  });
  it('limits admin maintenance to approved setup fields and suspends/reinstates access with session revocation and audit',async()=>{
    const path='/v1/admin/cafe-applications/'+applicationA.id+'/setup';
    expect((await app.call('PATCH',path,{headers:{...csrf,cookie:a.cookie},body:{access_suspended:true,reason:'forged'}})).status).toBe(403);
    expect((await app.call('PATCH',path,{headers:adminHeaders(),body:{role:'PLATFORM_ADMIN',reason:'forged'}})).status).toBe(400);
    expect((await app.call('PATCH',path,{headers:adminHeaders(),body:{venue_name:'Cafe A nou',timezone:'Europe/Bucharest',access_suspended:true,reason:'Review access'}})).status).toBe(200);
    expect((await app.call('GET','/v1/access/context',{headers:{cookie:a.cookie}})).status).toBe(401);
    await mfa(a);
    expect(json(await app.call('GET','/v1/access/context',{headers:{cookie:a.cookie}})).venues).toEqual([]);
    expect((await app.call('GET','/v1/dashboard/venues/'+applicationA.venue_id+'/overview',{headers:{cookie:a.cookie}})).status).toBe(404);
    expect((await app.call('PATCH',path,{headers:adminHeaders(),body:{access_suspended:false,reason:'Review complete'}})).status).toBe(200);
    await mfa(a);
    expect(json(await app.call('GET','/v1/access/context',{headers:{cookie:a.cookie}})).venues[0].name).toBe('Cafe A nou');
    const actions=(await app.db.query('SELECT action,metadata FROM audit_events WHERE action LIKE $1',['cafe.%'])).rows;
    expect(actions.some(x=>x.action==='cafe.application_approved'&&x.metadata.venue_id===applicationA.venue_id)).toBe(true);
    expect(actions.some(x=>x.action==='cafe.account_setup_updated'&&x.metadata.access_suspended===true)).toBe(true);
    await changePlatformAccess(app.db,admin.email,'TEST-OPERATOR-REVOKE',true);
    expect((await app.call('GET','/v1/admin/cafe-applications',{headers:adminHeaders()})).status).toBe(401);
  });
});
