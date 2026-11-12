#!/usr/bin/env node
'use strict';

// Local development only. Never load the owner's database URL into the API.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseEnv } = require('node:util');
const { spawn, execFileSync } = require('node:child_process');
const { Client } = require('pg');
const { parse: parseConnection } = require('pg-connection-string');

const root = path.resolve(__dirname, '../..');
const privateDir = path.join(root, '.local-auth');
const keyFile = path.join(privateDir, 'mfa.json');
const stateFile = path.join(privateDir, 'runtime.json');
const logFile = path.join(privateDir, 'runtime.log');
const adminModeFile = path.join(privateDir, 'admin-mode.json');
const entrypoint = path.join(root, 'dist/main.js');
const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
let api;
let stopping = false;
let ready = false;
let stage = 'initial';

function requireCondition(ok, code) {
  if (!ok) { const error = new Error(code); error.code = code; throw error; }
}
function safeCode(error) {
  return typeof error?.code === 'string' && /^[A-Z0-9_]{1,60}$/.test(error.code) ? error.code : 'LOCAL_API_FAILED';
}
function osEnvironment() {
  const keep = new Set(['systemroot', 'windir', 'path', 'pathext', 'comspec', 'temp', 'tmp', 'userprofile', 'appdata', 'localappdata', 'programdata', 'homedrive', 'homepath']);
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => keep.has(key.toLowerCase())));
}
function ps(script, extra = {}) {
  return execFileSync(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script], {
    env: { ...osEnvironment(), ...extra }, windowsHide: true, encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
function listeners() {
  return JSON.parse(ps("$items=@(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess); ConvertTo-Json -InputObject $items -Compress; exit 0"));
}
function identity(pid) {
  requireCondition(Number.isSafeInteger(pid) && pid > 0, 'INVALID_PROCESS_ID');
  const output = ps("$item=Get-CimInstance Win32_Process -Filter ('ProcessId = '+$env:GB_LOCAL_PID); if($null -eq $item){Write-Output 'null';exit 0}; [pscustomobject]@{pid=[int]$item.ProcessId;created=$item.CreationDate.ToUniversalTime().ToString('o');executable=$item.ExecutablePath;command=$item.CommandLine} | ConvertTo-Json -Compress", { GB_LOCAL_PID: String(pid) });
  return JSON.parse(output);
}
function restrictAcl(target) {
  const result = ps(`
$ErrorActionPreference='Stop'
$targetPath=$env:GB_LOCAL_ACL_PATH
$currentSid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User
$systemSid=New-Object System.Security.Principal.SecurityIdentifier('S-1-5-18')
$allowed=@($currentSid.Value,'S-1-5-18')
$existing=Get-Acl -LiteralPath $targetPath
$existingEntries=@($existing.Access)
$alreadyPrivate=$existing.AreAccessRulesProtected -and $existingEntries.Count -eq 2
foreach($entry in $existingEntries){if($entry.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -notin $allowed -or $entry.AccessControlType -ne 'Allow' -or $entry.IsInherited){$alreadyPrivate=$false}}
if($alreadyPrivate){Write-Output 'private';exit 0}
$isDirectory=[System.IO.Directory]::Exists($targetPath)
if($isDirectory){$security=New-Object System.Security.AccessControl.DirectorySecurity}else{$security=New-Object System.Security.AccessControl.FileSecurity}
$security.SetAccessRuleProtection($true,$false)
foreach($sid in @($currentSid,$systemSid)){
  if($isDirectory){$rule=New-Object System.Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')}
  else{$rule=New-Object System.Security.AccessControl.FileSystemAccessRule($sid,'FullControl','Allow')}
  $security.AddAccessRule($rule)
}
Set-Acl -LiteralPath $targetPath -AclObject $security
$acl=Get-Acl -LiteralPath $targetPath
$entries=@($acl.Access)
if(!$acl.AreAccessRulesProtected -or $entries.Count -ne 2){throw 'ACL_NOT_PRIVATE'}
foreach($entry in $entries){if($entry.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -notin $allowed -or $entry.AccessControlType -ne 'Allow' -or $entry.IsInherited){throw 'ACL_NOT_PRIVATE'}}
Write-Output 'private'
`, { GB_LOCAL_ACL_PATH: target });
  requireCondition(result === 'private', 'ACL_NOT_PRIVATE');
}
function event(name, fields = {}) {
  const line = JSON.stringify({ at: new Date().toISOString(), event: name, ...fields });
  fs.appendFileSync(logFile, line + '\n', { mode: 0o600 });
  return line;
}
function saveState(state) {
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
}
async function inspectDatabase(connectionString) {
  const client = new Client({ connectionString, connectionTimeoutMillis: 10000, application_name: 'gamerbooker-local-preflight' });
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    const role = (await client.query("SELECT current_user AS role,current_database() AS database,rolcanlogin,rolsuper,rolcreaterole,rolcreatedb,rolbypassrls,EXISTS(SELECT 1 FROM pg_roles r WHERE (r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolbypassrls) AND pg_has_role(current_user,r.oid,'USAGE')) AS inherits_privileged_role FROM pg_roles WHERE rolname=current_user")).rows[0];
    requireCondition(role?.role === 'gamerbooker_app' && role.database === 'gamerbooker_dev', 'RUNTIME_IDENTITY_MISMATCH');
    requireCondition(role.rolcanlogin && !role.rolsuper && !role.rolcreaterole && !role.rolcreatedb && !role.rolbypassrls && !role.inherits_privileged_role, 'RUNTIME_ROLE_PRIVILEGED');
    const privileges = (await client.query("SELECT p.privilege,has_table_privilege(current_user,'public.platform_grants',p.privilege) AS allowed FROM (VALUES('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE')) p(privilege)")).rows;
    requireCondition(privileges.every(p => p.allowed === (p.privilege === 'SELECT')), 'PLATFORM_GRANT_PRIVILEGES_INVALID');
    const counts = (await client.query("SELECT (SELECT count(*)::int FROM public.users) AS users,(SELECT count(*)::int FROM public.users WHERE deleted_at IS NULL) AS active_users,(SELECT count(*)::int FROM public.users WHERE email_verified_at IS NOT NULL) AS email_verified_users,(SELECT count(*)::int FROM public.user_mfa_factors) AS mfa_factors,(SELECT count(*)::int FROM public.sessions) AS sessions,(SELECT count(*)::int FROM public.venue_memberships) AS venue_memberships,(SELECT count(*)::int FROM public.platform_grants) AS platform_grants,(SELECT count(*)::int FROM public.cafe_applications) AS cafe_applications")).rows[0];
    const schema = (await client.query("SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sessions' AND column_name='mfa_verified_at') AS mfa_column,to_regclass('public.cafe_applications') IS NOT NULL AS cafe_applications")).rows[0];
    requireCondition(schema.mfa_column && schema.cafe_applications, 'ACCOUNT_SCHEMA_MISSING');
    await client.query('COMMIT');
    return { role, privileges, counts, schema };
  } finally { await client.end().catch(() => undefined); }
}
function persistentKey(env, factors) {
  const supplied = [env.MFA_SECRET_KEY, process.env.MFA_SECRET_KEY].filter(Boolean);
  let stored;
  if (fs.existsSync(keyFile)) {
    restrictAcl(keyFile);
    stored = JSON.parse(fs.readFileSync(keyFile, 'utf8')).MFA_SECRET_KEY;
    requireCondition(typeof stored === 'string' && stored.length >= 32, 'PERSISTED_KEY_INVALID');
  }
  const existing = stored || supplied[0];
  requireCondition(supplied.every(key => key === existing), 'EXISTING_KEY_CONFLICT');
  requireCondition(!factors || Boolean(existing), 'MFA_FACTORS_REQUIRE_PRIOR_KEY');
  const key = existing || crypto.randomBytes(48).toString('base64url');
  requireCondition(key.length >= 32, 'EXISTING_KEY_TOO_SHORT');
  if (!stored) {
    fs.writeFileSync(keyFile, JSON.stringify({ MFA_SECRET_KEY: key }) + '\n', { flag: 'wx', mode: 0o600 });
    restrictAcl(keyFile);
  }
  return { key, action: stored ? 'preserved' : existing ? 'persisted_existing' : 'generated_48_random_bytes' };
}
async function response(pathname) {
  const result = await fetch('http://127.0.0.1:3000' + pathname, { signal: AbortSignal.timeout(1500), redirect: 'error', cache: 'no-store' });
  const body = await result.json();
  return { status: result.status, body };
}
function recordOutput(stream, label) {
  let pending = '';
  stream.on('data', chunk => {
    pending = (pending + chunk.toString()).slice(-16384);
    const lines = pending.split(/\r?\n/); pending = lines.pop();
    for (const line of lines) {
      if (line.includes('Nest application successfully started')) event('api_bootstrap_complete');
      else if (/\bERROR\b|\[ExceptionHandler\]|(?:^|\s)(?:Error|TypeError|ReferenceError):/.test(line)) {
        const code = line.match(/\b(EADDRINUSE|EACCES|EPERM|ECONNREFUSED|MODULE_NOT_FOUND)\b/)?.[0];
        event('api_output_error', { stream: label, ...(code ? { code } : {}) });
      }
    }
  });
}
async function start() {
  stage = 'port_preflight';
  requireCondition(process.platform === 'win32', 'WINDOWS_ACL_REQUIRED');
  requireCondition(listeners().length === 0, 'PORT_3000_ALREADY_OWNED');
  requireCondition(fs.existsSync(entrypoint), 'BUILT_API_MISSING');
  stage = 'target_preflight';
  const env = parseEnv(fs.readFileSync(path.join(root, '.env'), 'utf8'));
  const configured = env.MIGRATION_DATABASE_URL || env.DATABASE_URL;
  const url = new URL(configured); const parsed = parseConnection(configured);
  requireCondition(['postgres:', 'postgresql:'].includes(url.protocol) && ['localhost', '127.0.0.1'].includes(url.hostname) && url.port === '5433' && decodeURIComponent(url.pathname) === '/gamerbooker_dev', 'LOCAL_TARGET_MISMATCH');
  requireCondition(['localhost', '127.0.0.1'].includes(parsed.host) && String(parsed.port) === '5433' && parsed.database === 'gamerbooker_dev', 'RESOLVED_LOCAL_TARGET_MISMATCH');
  // Fresh URL removes owner username, password, query options and all PG overrides.
  const runtime = new URL('postgresql://127.0.0.1:5433/gamerbooker_dev');
  runtime.username = 'gamerbooker_app';
  stage = 'database_preflight';
  const before = await inspectDatabase(runtime.toString());
  // Check factors BEFORE generating any key or creating private config.
  const hasPriorKey = fs.existsSync(keyFile) || Boolean(env.MFA_SECRET_KEY || process.env.MFA_SECRET_KEY);
  requireCondition(before.counts.mfa_factors === 0 || hasPriorKey, 'MFA_FACTORS_REQUIRE_PRIOR_KEY');
  stage = 'private_directory_acl';
  fs.mkdirSync(privateDir, { recursive: true }); restrictAcl(privateDir);
  stage = 'persistent_key';
  const persistent = persistentKey(env, before.counts.mfa_factors);
  let adminMode = { enabled: false };
  if (fs.existsSync(adminModeFile)) {
    restrictAcl(adminModeFile);
    adminMode = JSON.parse(fs.readFileSync(adminModeFile, 'utf8'));
    requireCondition(typeof adminMode.enabled === 'boolean' && Object.keys(adminMode).every(key => ['enabled', 'userId', 'companySignupApprovalOnly'].includes(key)), 'INVALID_LOCAL_ADMIN_MODE_CONFIG');
    if (adminMode.companySignupApprovalOnly !== undefined) requireCondition(typeof adminMode.companySignupApprovalOnly === 'boolean', 'INVALID_LOCAL_COMPANY_SIGNUP_CONFIG');
    if (adminMode.enabled) requireCondition(typeof adminMode.userId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(adminMode.userId), 'INVALID_LOCAL_ADMIN_MODE_USER');
  }
  event('preflight_passed', { database_role: before.role.role, counts: before.counts, key_action: persistent.action, acl: 'current_user_and_SYSTEM_only' });
  stage = 'port_recheck';
  requireCondition(listeners().length === 0, 'PORT_3000_ALREADY_OWNED');
  const dashboardOrigins = env.DASHBOARD_ORIGINS || 'http://127.0.0.1:5173,http://localhost:5173,https://127.0.0.1:5173';
  const childEnv = { ...osEnvironment(), NODE_ENV: 'development', API_HOST: '127.0.0.1', PORT: '3000', DASHBOARD_ORIGINS: dashboardOrigins, DATABASE_URL: runtime.toString(), MFA_SECRET_KEY: persistent.key,
    LOCAL_ADMIN_PASSWORD_ONLY: adminMode.enabled ? '1' : '0',
    LOCAL_COMPANY_APPROVAL_ONLY: adminMode.companySignupApprovalOnly === true ? '1' : '0',
    ...(adminMode.enabled ? { LOCAL_ADMIN_USER_ID: adminMode.userId } : {}) };
  stage = 'api_startup';
  api = spawn(process.execPath, [entrypoint], { cwd: root, env: childEnv, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let spawnError;
  api.on('error', error => { spawnError = error; });
  recordOutput(api.stdout, 'stdout'); recordOutput(api.stderr, 'stderr');
  const state = { state: 'starting', launcher_pid: process.pid, api_pid: api.pid, entrypoint, started_at: new Date().toISOString(), host: '127.0.0.1', port: 3000 };
  api.on('exit', (code, signal) => {
    event('api_exited', { code, signal });
    saveState({ ...state, state: stopping ? 'stopped' : 'exited', stopped_at: new Date().toISOString(), exit_code: code });
    if (ready && !stopping) process.exitCode = code || 1;
  });
  let health, context;
  for (let attempt = 0; attempt < 160; attempt++) {
    requireCondition(!spawnError && api.exitCode === null && api.signalCode === null, spawnError ? safeCode(spawnError) : 'API_EXITED_DURING_STARTUP');
    try {
      health = await response('/healthz');
      if (health.status === 200 && health.body.status === 'ok') break;
    } catch { /* Startup is not ready yet; never log response bodies. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  requireCondition(health?.status === 200 && health.body.status === 'ok', 'API_HEALTH_STARTUP_FAILED');
  stage = 'context_denial';
  context = await response('/v1/access/context');
  requireCondition(context.status === 401 && context.body.error?.code === 'AUTH_REQUIRED', 'UNAUTHENTICATED_CONTEXT_NOT_DENIED');
  stage = 'listener_identity';
  const owned = listeners();
  requireCondition(owned.length === 1 && owned[0].LocalAddress === '127.0.0.1' && owned[0].OwningProcess === api.pid, 'API_LISTENER_IDENTITY_INVALID');
  state.api_identity = identity(api.pid);
  requireCondition(state.api_identity?.executable?.toLowerCase() === process.execPath.toLowerCase() && state.api_identity.command?.toLowerCase().includes(entrypoint.toLowerCase()), 'API_PROCESS_IDENTITY_INVALID');
  stage = 'post_start_database';
  const after = await inspectDatabase(runtime.toString());
  requireCondition(JSON.stringify(before.counts) === JSON.stringify(after.counts), 'STARTUP_CHANGED_AUTH_COUNTS');
  state.state = 'ready'; state.checks = { health_status: health.status, context_status: context.status, context_code: context.body.error.code, counts_before: before.counts, counts_after: after.counts, runtime_role: before.role, platform_grant_privileges: before.privileges, private_acl: 'current_user_and_SYSTEM_only', key_action: persistent.action, local_admin_password_only: adminMode.enabled };
  saveState(state); ready = true;
  console.log(event('api_ready', { api_pid: api.pid, launcher_pid: process.pid, address: 'http://127.0.0.1:3000', health_status: health.status, context_status: context.status, context_code: context.body.error.code }));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopping = true; if (api.exitCode === null) api.kill(); });
}
function stop() {
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  requireCondition(state.state === 'ready', 'API_NOT_MARKED_READY');
  const actual = identity(state.api_pid);
  requireCondition(actual && actual.created === state.api_identity?.created && actual.executable?.toLowerCase() === process.execPath.toLowerCase() && actual.command?.toLowerCase().includes(entrypoint.toLowerCase()), 'STOP_PROCESS_IDENTITY_MISMATCH');
  process.kill(state.api_pid, 'SIGTERM');
  console.log(JSON.stringify({ event: 'stop_requested', api_pid: state.api_pid, identity_verified: true }));
}

(async () => {
  const mode = process.argv[2] || 'start';
  requireCondition(['start', '--stop'].includes(mode), 'UNKNOWN_LOCAL_API_COMMAND');
  if (mode === '--stop') stop(); else await start();
})().catch(error => {
  if (api && api.exitCode === null) { stopping = true; api.kill(); }
  console.error(JSON.stringify({ error_code: safeCode(error), stage }));
  process.exitCode = 1;
});
