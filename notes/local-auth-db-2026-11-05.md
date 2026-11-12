# Local account schema migration evidence

Sanitized aggregate evidence only. No account or admin grant was created; no backend activation, TLS, credentials, or service configuration was changed.

```json
{
  "checked_at": "2026-11-05T13:00:44.463Z",
  "target": "localhost/127.0.0.1:5433/gamerbooker_dev",
  "action": "applied",
  "migration": "0033_cafe_access.sql",
  "sha256": "3b707b2ab0fae005e7badf70ea498223c3ca3a51b8a9c08ccb0ba84190f9c79c",
  "lock_key": "305419897",
  "applied_before": 32,
  "pending_before": [
    "0033_cafe_access.sql"
  ],
  "applied_after": 33,
  "local_migration_count": 33,
  "before": {
    "users": 0,
    "sessions": 0,
    "venue_memberships": 0
  },
  "after": {
    "users": 0,
    "sessions": 0,
    "venue_memberships": 0
  },
  "schema": {
    "session_mfa_column": true,
    "platform_grants_table": true,
    "cafe_applications_table": true,
    "cafe_decision_trigger": true,
    "venue_role_trigger": true
  },
  "data": {
    "platform_grants": 0,
    "cafe_applications": 0
  },
  "privileges": [
    {
      "table_name": "cafe_applications",
      "privilege": "DELETE",
      "allowed": false
    },
    {
      "table_name": "cafe_applications",
      "privilege": "INSERT",
      "allowed": true
    },
    {
      "table_name": "cafe_applications",
      "privilege": "SELECT",
      "allowed": true
    },
    {
      "table_name": "cafe_applications",
      "privilege": "TRUNCATE",
      "allowed": false
    },
    {
      "table_name": "cafe_applications",
      "privilege": "UPDATE",
      "allowed": true
    },
    {
      "table_name": "platform_grants",
      "privilege": "DELETE",
      "allowed": false
    },
    {
      "table_name": "platform_grants",
      "privilege": "INSERT",
      "allowed": false
    },
    {
      "table_name": "platform_grants",
      "privilege": "SELECT",
      "allowed": true
    },
    {
      "table_name": "platform_grants",
      "privilege": "TRUNCATE",
      "allowed": false
    },
    {
      "table_name": "platform_grants",
      "privilege": "UPDATE",
      "allowed": false
    }
  ],
  "ledger": {
    "total": 33,
    "migration_0033_recorded": true
  }
}
```
