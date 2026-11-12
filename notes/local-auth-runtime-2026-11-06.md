# Local API runtime evidence ? 2026-11-06

Lease `LOCAL-AUTH-RUNTIME-2026-11-06`: **CLOSED**.

The existing built API is running only on `127.0.0.1:3000` under `gamerbooker_app`. Root `.env` was parsed privately; its owner credentials were not passed to the child. An allowlisted child environment contains the reconstructed passwordless restricted-role database URL and persisted MFA key only in memory.

Before key generation, read-only SQL found zero users and zero encrypted MFA factors. A 48-byte cryptographically random key was persisted in ignored `.local-auth/mfa.json`. Directory and key file ACLs are protected and permit only the current Windows user and SYSTEM. Subsequent starts preserve the stored key and refuse conflicting keys or factor data without a prior key. The key, database URL, and credentials are absent from this evidence and sanitized runtime logs.

Commands from the workspace root:

```powershell
node tools/local-auth/start-api.cjs
# In another terminal, stop only the recorded API after PID/start-time/path checks:
node tools/local-auth/start-api.cjs --stop
# Restart with the same persisted key:
node tools/local-auth/start-api.cjs
```

The start command remains attached as the hidden/piped child monitor. Ctrl+C stops its own API child. Runtime identity/state and fixed-category logs are in ignored `.local-auth/runtime.json` and `.local-auth/runtime.log`. On startup failure the launcher terminates only its own child. A pre-existing port-3000 listener causes refusal.

Observed setup: sandbox EPERM required the narrowly approved launcher escalation. The first child was terminated after the initial 10-second startup window; no service was retained. Existing private ACLs are now validated and reused instead of rewritten, the key was preserved, and the 40-second startup window succeeded. `node --check`, ignore checks, and `git diff --check` passed (existing unrelated CRLF warnings).

Existing development database caveat: passwordless `gamerbooker_app` access uses the pre-existing PostgreSQL trust configuration. Docker already publishes database port 5433 on all host interfaces. This task did not change or secure that database authentication/network exposure. No role/password, migration, user/admin account, grant, registration/login/token, TLS/trust-store, or database configuration changes were made.

Only read-only database/schema checks and GET `/healthz` plus unauthenticated GET `/v1/access/context` were used. Auth counts are unchanged. This is not an end-to-end login test or a visual check.

Sanitized startup evidence:

```json
{
  "state": "ready",
  "launcher_pid": 42660,
  "api_pid": 2660,
  "entrypoint": "D:\\Proiecte\\GamerBooker_Enterprise_v1.0\\dist\\main.js",
  "started_at": "2026-11-05T23:45:02.287Z",
  "host": "127.0.0.1",
  "port": 3000,
  "api_identity": {
    "pid": 2660,
    "created": "2026-11-05T23:45:02.2846160Z",
    "executable": "C:\\Program Files\\nodejs\\node.exe",
    "command": "\"C:\\Program Files\\nodejs\\node.exe\" D:\\Proiecte\\GamerBooker_Enterprise_v1.0\\dist\\main.js"
  },
  "checks": {
    "health_status": 200,
    "context_status": 401,
    "context_code": "AUTH_REQUIRED",
    "counts_before": {
      "users": 0,
      "active_users": 0,
      "email_verified_users": 0,
      "mfa_factors": 0,
      "sessions": 0,
      "venue_memberships": 0,
      "platform_grants": 0,
      "cafe_applications": 0
    },
    "counts_after": {
      "users": 0,
      "active_users": 0,
      "email_verified_users": 0,
      "mfa_factors": 0,
      "sessions": 0,
      "venue_memberships": 0,
      "platform_grants": 0,
      "cafe_applications": 0
    },
    "runtime_role": {
      "role": "gamerbooker_app",
      "database": "gamerbooker_dev",
      "rolcanlogin": true,
      "rolsuper": false,
      "rolcreaterole": false,
      "rolcreatedb": false,
      "rolbypassrls": false,
      "inherits_privileged_role": false
    },
    "platform_grant_privileges": [
      {
        "privilege": "SELECT",
        "allowed": true
      },
      {
        "privilege": "INSERT",
        "allowed": false
      },
      {
        "privilege": "UPDATE",
        "allowed": false
      },
      {
        "privilege": "DELETE",
        "allowed": false
      },
      {
        "privilege": "TRUNCATE",
        "allowed": false
      }
    ],
    "private_acl": "current_user_and_SYSTEM_only",
    "key_action": "preserved"
  }
}
```
