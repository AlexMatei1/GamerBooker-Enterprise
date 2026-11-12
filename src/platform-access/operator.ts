/** Local, privileged operator CLI. No HTTP route calls this code. */
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { writeAudit } from '../auth/audit';
import { runWithRequestId } from '../common/request-context';

export async function changePlatformAccess(db:Client,email:string,reference:string,revoke:boolean):Promise<string> {
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[A-Za-z0-9_.:-]{6,100}$/.test(reference)) throw new Error('Verified email and operator ticket reference required.');
  const privileges=await db.query<{allowed:boolean}>(
    `SELECT current_user<>'gamerbooker_app' AND has_table_privilege(current_user,'platform_grants','INSERT,UPDATE') AS allowed`);
  if(!privileges.rows[0]?.allowed) throw new Error('Privileged operator database credentials required; runtime role is forbidden.');
  await db.query('BEGIN');
  try {
    const result=await db.query<{id:string}>(
      `SELECT id FROM users WHERE lower(email)=lower($1) AND email_verified_at IS NOT NULL AND identity_status='verified' AND deleted_at IS NULL FOR UPDATE`,[email]);
    const user=result.rows[0]; if(!user) throw new Error('Verified active account not found; register and verify first.');
    if(!revoke){
      const memberships=await db.query('SELECT 1 FROM venue_memberships WHERE user_id=$1 AND active=true AND role<>\'PLATFORM_ADMIN\'',[user.id]);
      if(memberships.rowCount) throw new Error('Use a separate verified administrator account without cafe memberships.');
      await db.query(`INSERT INTO platform_grants(user_id,operator_reference) VALUES($1,$2)
        ON CONFLICT(user_id) DO UPDATE SET revoked_at=NULL,granted_at=now(),operator_reference=EXCLUDED.operator_reference`,[user.id,reference]);
    } else await db.query('UPDATE platform_grants SET revoked_at=now(),operator_reference=$2 WHERE user_id=$1',[user.id,reference]);
    await db.query('UPDATE sessions SET revoked_at=now(),updated_at=now() WHERE user_id=$1 AND revoked_at IS NULL',[user.id]);
    await runWithRequestId('operator-'+randomUUID(),()=>writeAudit(db,revoke?'platform.access_revoked':'platform.access_granted',null,{operator_reference:reference,subject_user_id:user.id,source:'local_operator'},{targetId:user.id,targetType:'USER',actorRole:'LOCAL_OPERATOR'}));
    await db.query('COMMIT'); return user.id;
  }catch(error){await db.query('ROLLBACK');throw error;}
}

async function main(){
  const [action,email,reference,...rest]=process.argv.slice(2);
  if(!['grant','revoke'].includes(action)||!email||!reference||rest.length) throw new Error('Usage: npm run operator:platform -- grant|revoke VERIFIED_EMAIL OPERATOR_TICKET');
  const dsn=process.env.OPERATOR_DATABASE_URL;
  if(!dsn) throw new Error('OPERATOR_DATABASE_URL is required (privileged local operator only).');
  const db=new Client({connectionString:dsn});
  await db.connect();
  try{const userId=await changePlatformAccess(db,email,reference,action==='revoke');process.stdout.write('Platform access '+action+' completed for user '+userId+'; all sessions revoked.\n');}
  finally{await db.end();}
}
if(require.main===module) main().catch(()=>{process.stderr.write('Operator action failed. Check arguments, verified identity and privileged database configuration. No credentials are printed.\n');process.exitCode=1;});
