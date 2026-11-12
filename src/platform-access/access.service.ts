import { Injectable, OnModuleInit } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import { getPool } from '../db/pool';
import { AuthHttpError } from '../auth/auth-error';
import { writeAudit } from '../auth/audit';
import { hash } from '../auth/password';
import { MembershipService } from '../auth/membership.service';
import { applicationInput, invalid, object, text, timezone, uuid } from './access.validation';

interface Application {
  id: string; applicant_user_id: string; legal_name: string; venue_name: string;
  timezone: string; city: string; status: 'PENDING'|'APPROVED'|'REJECTED';
  tenant_id: string|null; venue_id: string|null; access_suspended: boolean;
  form_data?: Record<string, any> | null;
}
const notFound=()=>new AuthHttpError(404,'RESOURCE_NOT_FOUND','Resource not found.');

@Injectable()
export class AccessService implements OnModuleInit {
  constructor(private readonly memberships: MembershipService) {}

  async onModuleInit(): Promise<void> {
    const permissions=await getPool().query<{unsafe:boolean}>(
      "SELECT has_table_privilege(current_user,'platform_grants','INSERT,UPDATE,DELETE,TRUNCATE') AS unsafe");
    if(permissions.rows[0]?.unsafe) throw new Error('Unsafe runtime database role: platform grants require separate operator credentials.');
  }

  async context(userId: string,localPassword=false) {
    const db=getPool();
    const admin=await db.query('SELECT 1 FROM platform_grants WHERE user_id=$1 AND revoked_at IS NULL',[userId]);
    const user=await db.query('SELECT id,email FROM users WHERE id=$1',[userId]);
    if (admin.rowCount) return {user:user.rows[0],platform_admin:true,local_admin_password_only:localPassword,venues:[]};
    const rows=await db.query<{id:string;name:string;timezone:string;tenant_id:string;role:string}>(
      `SELECT v.id,v.name,v.timezone,v.tenant_id,m.role FROM venue_memberships m
       JOIN venues v ON v.id=m.venue_id AND v.tenant_id=m.tenant_id
       WHERE m.user_id=$1 AND m.active=true ORDER BY v.name`,[userId]);
    const venues=[];
    for (const row of rows.rows) if (await this.memberships.roleFor(userId,row.id)) venues.push(row);
    return {user:user.rows[0],platform_admin:false,venues};
  }

  async apply(userId: string, body: unknown) {
    const input=applicationInput(body);
    const db=getPool();
    const admin=await db.query('SELECT 1 FROM platform_grants WHERE user_id=$1 AND revoked_at IS NULL',[userId]);
    if (admin.rowCount) throw new AuthHttpError(403,'AUTH_ROLE_NOT_PERMITTED','Administrator accounts cannot apply.');
    return this.transaction(async c=>{
      const result=await c.query<Application>(
        `INSERT INTO cafe_applications(applicant_user_id,legal_name,venue_name,timezone,city)
         VALUES($1,$2,$3,$4,$5) ON CONFLICT(applicant_user_id) DO NOTHING RETURNING *`,
        [userId,input.legal_name,input.venue_name,input.timezone,input.city]);
      if (!result.rowCount) throw new AuthHttpError(409,'APPLICATION_EXISTS','An application already exists.');
      await writeAudit(c,'cafe.application_submitted',userId,{application_id:result.rows[0].id},{targetId:result.rows[0].id,targetType:'CAFE_APPLICATION'});
      return {application:result.rows[0]};
    });
  }

  async publicApply(body: unknown) {
    const raw = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    const legal_name = String(raw.legal_name ?? '').trim();
    const venue_name = String(raw.venue_name ?? '').trim();
    const city = String(raw.city ?? '').trim();
    const applicant_email = String(raw.applicant_email ?? '').toLowerCase().trim();
    const timezone = String(raw.timezone ?? 'Europe/Bucharest').trim();

    if (legal_name.length < 2 || legal_name.length > 160) {
      throw new AuthHttpError(400, 'VALIDATION_FAILED', 'Denumirea juridică trebuie să aibă între 2 și 160 de caractere.');
    }
    if (venue_name.length < 2 || venue_name.length > 120) {
      throw new AuthHttpError(400, 'VALIDATION_FAILED', 'Numele cafenelei/sălii trebuie să aibă între 2 și 120 de caractere.');
    }
    if (city.length < 2 || city.length > 120) {
      throw new AuthHttpError(400, 'VALIDATION_FAILED', 'Orașul trebuie să aibă între 2 și 120 de caractere.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(applicant_email) || applicant_email.length > 254) {
      throw new AuthHttpError(400, 'VALIDATION_FAILED', 'Adresa de email este invalidă.');
    }

    return this.transaction(async (c) => {
      let userId: string;
      const existing = await c.query<{ id: string }>(
        'SELECT id FROM users WHERE lower(email) = lower($1)',
        [applicant_email],
      );

      if (existing.rowCount) {
        userId = existing.rows[0].id;
      } else {
        const temporaryPassword = randomBytes(18).toString('base64url');
        const passwordHash = await hash(temporaryPassword);
        const inserted = await c.query<{ id: string }>(
          `INSERT INTO users (email, password_hash, email_verified_at, identity_status)
           VALUES ($1, $2, now(), 'verified') RETURNING id`,
          [applicant_email, passwordHash],
        );
        userId = inserted.rows[0].id;
      }

      const existingApp = await c.query<Application>(
        'SELECT * FROM cafe_applications WHERE applicant_user_id=$1 FOR UPDATE',
        [userId],
      );

      if (existingApp.rowCount) {
        return {
          application: existingApp.rows[0],
          replayed: true,
          message: 'Cererea ta a fost deja înregistrată și este în curs de evaluare de către administratori.',
        };
      }

      const insertedApp = await c.query<Application>(
        `INSERT INTO cafe_applications (applicant_user_id, legal_name, venue_name, timezone, city)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [userId, legal_name, venue_name, timezone, city],
      );

      await writeAudit(
        c,
        'cafe.application_submitted',
        userId,
        {
          application_id: insertedApp.rows[0].id,
          source: 'public_intake',
          phone: raw.phone,
          stations_count: raw.stations_count,
          rate_standard: raw.rate_standard,
          rate_vip: raw.rate_vip,
          schedule: raw.schedule,
        },
        { targetId: insertedApp.rows[0].id, targetType: 'CAFE_APPLICATION' },
      );

      return {
        application: insertedApp.rows[0],
        created: true,
        message: 'Cererea de parteneriat a fost trimisă cu succes!',
      };
    });
  }
  async own(userId: string) {
    const found=await getPool().query('SELECT * FROM cafe_applications WHERE applicant_user_id=$1',[userId]);
    return {application:found.rows[0]??null};
  }
  async queue() {
    const found=await getPool().query(
      `SELECT a.*,u.email AS applicant_email,v.name AS current_venue_name,v.timezone AS current_timezone
       FROM cafe_applications a JOIN users u ON u.id=a.applicant_user_id
       LEFT JOIN venues v ON v.id=a.venue_id AND v.tenant_id=a.tenant_id
       ORDER BY a.created_at DESC LIMIT 500`);
    return {applications:found.rows};
  }
  async decide(actor: string,id: string,body: unknown) {
    uuid(id);
    const input=object(body,['decision','reason']);
    if (!['APPROVED','REJECTED'].includes(String(input.decision))) invalid('Invalid decision.');
    const reason=text(input.reason,'reason',500);
    return this.transaction(async c=>{
      const found=await c.query<Application>('SELECT * FROM cafe_applications WHERE id=$1 FOR UPDATE',[id]);
      const a=found.rows[0]; if(!a) throw notFound();
      if(a.status!=='PENDING') {
        if(a.status!==input.decision) throw new AuthHttpError(409,'APPLICATION_DECIDED','Decision is immutable.');
        return {application:a,replayed:true};
      }
      const owner=await c.query<{id:string; email:string}>(
        `SELECT id, email FROM users WHERE id=$1 AND deleted_at IS NULL AND email_verified_at IS NOT NULL AND identity_status='verified' FOR UPDATE`,[a.applicant_user_id]);
      if(!owner.rowCount) throw new AuthHttpError(409,'APPLICANT_UNAVAILABLE','Applicant must be active and verified.');
      let tenantId=null,venueId=null;
      const formData = (typeof a.form_data === 'object' && a.form_data !== null) ? (a.form_data as Record<string, any>) : {};
      if(input.decision==='APPROVED') {
        const admin=await c.query('SELECT 1 FROM platform_grants WHERE user_id=$1 AND revoked_at IS NULL',[a.applicant_user_id]);
        if(admin.rowCount) throw new AuthHttpError(409,'APPLICANT_UNAVAILABLE','Administrator accounts cannot own a cafe.');

        // Approval never rotates the applicant's password. The account keeps the
        // credential it registered with (or the one issued by intake/reset); only
        // the dedicated temporary-password reset endpoint may change it.
        if (formData.temporary_password) {
          formData.temporary_password_generated_at = formData.temporary_password_generated_at || new Date().toISOString();
        }

        const cui = String(formData.cui || formData.cif || '');
        const addressStr = String(formData.address || a.city);
        const phoneStr = String(formData.phone || '');

        // 1. Create Tenant with Billing Profile
        const billingProfile = { cui, city: a.city, address: addressStr, phone: phoneStr };
        const tenant = await c.query<{id:string}>('INSERT INTO tenants(legal_name, billing_profile) VALUES($1, $2::jsonb) RETURNING id', [a.legal_name, JSON.stringify(billingProfile)]);
        tenantId = tenant.rows[0].id;

        // 2. Create Venue with Contact & Address
        const baseSlug = (a.venue_name || 'venue').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'venue';
        const slug = `${baseSlug}-${tenantId.slice(0, 6)}`;
        const addressObj = { city: a.city, street: addressStr, formatted: addressStr.includes(a.city) ? addressStr : `${addressStr}, ${a.city}` };
        const contactObj = { email: owner.rows[0]?.email || '', phone: phoneStr };
        // Approval provisions the venue but never publishes it: publication is a
        // separate gated/audited action taken by the owner once the venue setup
        // is complete (docs/05-venue-dashboard/04-roles-onboarding-and-audit.md).
        const venue = await c.query<{id:string}>(
          `INSERT INTO venues(tenant_id, name, slug, timezone, address, contact, publication_state)
           VALUES($1, $2, $3, $4, $5::jsonb, $6::jsonb, 'DRAFT') RETURNING id`,
          [tenantId, a.venue_name, slug, a.timezone, JSON.stringify(addressObj), JSON.stringify(contactObj)]);
        venueId = venue.rows[0].id;

        // 3. Link Owner Membership. Approval deliberately leaves the venue empty
        // (no rooms, resources, schedules, policy or prices): the owner completes
        // the setup wizard, and only then can the gated publish route succeed.
        // See docs/05-venue-dashboard/04-roles-onboarding-and-audit.md and
        // HANDOFF-CAFE-ACCESS-2026-11-05.md ("real empty/DRAFT venue").
        await c.query("INSERT INTO venue_memberships(user_id,tenant_id,venue_id,role) VALUES($1,$2,$3,'OWNER')",[a.applicant_user_id,tenantId,venueId]);

        // 4. Revoke old sessions
        await c.query('UPDATE sessions SET revoked_at=now(),updated_at=now() WHERE user_id=$1 AND revoked_at IS NULL',[a.applicant_user_id]);
      }
      const formDataJson = input.decision === 'APPROVED' ? JSON.stringify(formData) : JSON.stringify((typeof a.form_data === 'object' && a.form_data !== null) ? a.form_data : {});
      const result=await c.query(
        `UPDATE cafe_applications SET status=$2,decision_reason=$3,decided_by=$4,decided_at=now(),tenant_id=$5,venue_id=$6,form_data=$7::jsonb,updated_at=now()
         WHERE id=$1 RETURNING *`,[id,input.decision,reason,actor,tenantId,venueId,formDataJson]);
      await writeAudit(c,'cafe.application_'+String(input.decision).toLowerCase(),actor,{application_id:id,tenant_id:tenantId,venue_id:venueId,applicant_user_id:a.applicant_user_id},{tenantId,venueId,targetId:id,targetType:'CAFE_APPLICATION',actorRole:'PLATFORM_ADMIN'});
      return {application:result.rows[0],replayed:false};
    });
  }

  async resetTemporaryPassword(actor: string, id: string) {
    uuid(id);
    return this.transaction(async c => {
      const found = await c.query<Application>('SELECT * FROM cafe_applications WHERE id=$1 FOR UPDATE', [id]);
      const a = found.rows[0];
      if (!a) throw notFound();

      const tempPassword = `GamerBooker${randomBytes(4).toString('hex')}!`;
      const passwordHash = await hash(tempPassword);

      await c.query('UPDATE users SET password_hash=$2, updated_at=now() WHERE id=$1', [a.applicant_user_id, passwordHash]);
      await c.query('UPDATE sessions SET revoked_at=now(), updated_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [a.applicant_user_id]);

      const currentFormData = (typeof a.form_data === 'object' && a.form_data !== null) ? a.form_data : {};
      const updatedFormData = {
        ...currentFormData,
        temporary_password: tempPassword,
        temporary_password_generated_at: new Date().toISOString(),
      };

      const result = await c.query(
        'UPDATE cafe_applications SET form_data=$2::jsonb, updated_at=now() WHERE id=$1 RETURNING *',
        [id, JSON.stringify(updatedFormData)],
      );
      const owner = await c.query<{ email: string }>('SELECT email FROM users WHERE id=$1', [a.applicant_user_id]);

      await writeAudit(c, 'cafe.temporary_password_reset', actor, {
        application_id: id,
        applicant_user_id: a.applicant_user_id,
      }, { targetId: id, targetType: 'CAFE_APPLICATION', actorRole: 'PLATFORM_ADMIN' });

      return {
        application: result.rows[0],
        temporary_password: tempPassword,
        applicant_email: owner.rows[0]?.email || '',
        message: 'Parola temporară a fost resetată cu succes!',
      };
    });
  }
  async maintain(actor: string,id: string,body: unknown) {
    uuid(id);
    const input=object(body,['access_suspended','venue_name','timezone','reason']);
    const reason=text(input.reason,'reason',500);
    if(input.access_suspended!==undefined && typeof input.access_suspended!=='boolean') invalid('access_suspended must be boolean.');
    const name=input.venue_name===undefined?undefined:text(input.venue_name,'venue_name');
    const zone=input.timezone===undefined?undefined:timezone(input.timezone);
    if(name===undefined && zone===undefined && input.access_suspended===undefined) invalid('No changes provided.');
    return this.transaction(async c=>{
      const found=await c.query<Application>("SELECT * FROM cafe_applications WHERE id=$1 AND status='APPROVED' FOR UPDATE",[id]);
      const a=found.rows[0]; if(!a) throw notFound();
      await c.query('UPDATE venues SET name=COALESCE($3,name),timezone=COALESCE($4,timezone),updated_at=now() WHERE id=$1 AND tenant_id=$2',[a.venue_id,a.tenant_id,name??null,zone??null]);
      if(input.access_suspended!==undefined) {
        await c.query('UPDATE cafe_applications SET access_suspended=$2,updated_at=now() WHERE id=$1',[id,input.access_suspended]);
        await c.query('UPDATE sessions SET revoked_at=now(),updated_at=now() WHERE user_id=$1 AND revoked_at IS NULL',[a.applicant_user_id]);
      }
      await writeAudit(c,'cafe.account_setup_updated',actor,{application_id:id,tenant_id:a.tenant_id,venue_id:a.venue_id,applicant_user_id:a.applicant_user_id,access_suspended:input.access_suspended??a.access_suspended,name_changed:name!==undefined,timezone_changed:zone!==undefined,reason_hash:createHash('sha256').update(reason).digest('hex')},{tenantId:a.tenant_id,venueId:a.venue_id,targetId:id,targetType:'CAFE_APPLICATION',actorRole:'PLATFORM_ADMIN'});
      return {updated:true};
    });
  }
  async dashboard(userId: string,venueId: string) {
    uuid(venueId);
    const role=await this.memberships.roleFor(userId,venueId);
    if(!role) throw notFound();
    const db=getPool();
    const venue=await db.query('SELECT id,tenant_id,name,timezone,publication_state FROM venues WHERE id=$1',[venueId]);
    const resources=await db.query('SELECT id,name,type,status,bookable FROM resources WHERE venue_id=$1 ORDER BY name',[venueId]);
    const rooms=await db.query('SELECT id,name FROM rooms WHERE venue_id=$1 ORDER BY name',[venueId]);
    const bookings=await db.query(
      `SELECT id,status,starts_at,ends_at FROM bookings WHERE venue_id=$1 AND ends_at>=now() AND starts_at<now()+interval '7 days' ORDER BY starts_at LIMIT 100`,[venueId]);
    return {venue:venue.rows[0],role,resources:resources.rows,rooms:rooms.rows,bookings:bookings.rows};
  }
  private async transaction<T>(fn:(client:PoolClient)=>Promise<T>):Promise<T> {
    const client=await getPool().connect();
    try {await client.query('BEGIN'); const result=await fn(client); await client.query('COMMIT');return result;}
    catch(e){await client.query('ROLLBACK').catch(()=>undefined);throw e;}
    finally{client.release();}
  }
}
