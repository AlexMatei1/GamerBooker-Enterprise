# Approved local administrator grant

Existing verified owner-registered account only. Existing operator CLI invoked once; no password, verification token, MFA secret, or database credential was printed or stored. The owner must sign in again and privately enroll/confirm MFA through the existing UI. No other identity, role, certificate, service, or feature was changed.

```json
{
  "checked_at": "2026-11-06T10:32:50.519Z",
  "lease": "LOCAL-ADMIN-GRANT-20261106",
  "status": "CLOSED",
  "database": "gamerbooker_dev",
  "operator_role": "postgres",
  "user_id": "561a11f5-2aa0-423f-84cf-dba27589c416",
  "email": "alexmatei2330@gmail.com",
  "reference": "LOCAL-ADMIN-20261106",
  "operator_cli_invocations": 1,
  "operator_cli_exit_code": 0,
  "before": {
    "users": 1,
    "cafe_memberships": 0,
    "active_grants": 0,
    "unrevoked_sessions": 0,
    "matching_audits": 0
  },
  "after": {
    "users": 1,
    "cafe_memberships": 0,
    "unrevoked_sessions": 0
  },
  "grant": {
    "user_id": "561a11f5-2aa0-423f-84cf-dba27589c416",
    "operator_reference": "LOCAL-ADMIN-20261106",
    "active": true
  },
  "audit": {
    "action": "platform.access_granted",
    "actor_role": "LOCAL_OPERATOR",
    "operator_reference": "LOCAL-ADMIN-20261106",
    "source": "local_operator",
    "target_id": "561a11f5-2aa0-423f-84cf-dba27589c416"
  },
  "runtime_platform_grant_privileges": [
    {
      "privilege": "DELETE",
      "allowed": false
    },
    {
      "privilege": "INSERT",
      "allowed": false
    },
    {
      "privilege": "SELECT",
      "allowed": true
    },
    {
      "privilege": "TRUNCATE",
      "allowed": false
    },
    {
      "privilege": "UPDATE",
      "allowed": false
    }
  ]
}
```
