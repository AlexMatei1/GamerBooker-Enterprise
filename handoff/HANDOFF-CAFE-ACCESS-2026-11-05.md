# Café applications, platform administration and tenant access

Implementation packet, 2026-11-05. One implementation writer under the existing Astra supervision. Requested writer model: gpt-6.1-sol; client identity is not independently verified. Independent verification/review and Astra acceptance remain separate gates.

Correction round1 supersedes the initial readiness evidence. Independent review rejected the first implementation for two concrete adjacent bypasses: generic venue profiles could publish without gates, and a staff booking transition could use another venue's booking ID. Both are corrected below, with fresh real-HTTP/PostgreSQL evidence in `notes/cafe-access/correction-1-verification-2026-11-05.md`. Writer lease is closed; fresh independent verification/review and Astra acceptance are still required.

## Delivered behavior

The dashboard now defaults to a real account portal in Romanian. Registration, private email-token verification, password login, TOTP enrollment/verification and logout call the existing authentication API. A verified account can submit one café application and view only its own status. Pending/rejected applications grant no membership. A dedicated platform administrator sees applications and account/venue setup only. Approving an application creates one tenant, a DRAFT venue and an OWNER membership in one transaction, revokes the owner's existing sessions, and records actor/application/tenant/venue in the immutable audit trail. Row locking makes concurrent/repeated identical decisions idempotent; contrary decisions return409. Decisions are immutable. Rejected applications cannot currently be resubmitted or edited.

Approved setup maintenance can change venue name/timezone and suspend/reinstate that application's owner access. It cannot change owner identity, tenant, role, publication state or platform privileges. Suspension and reinstatement revoke the owner's sessions. The suspension is also checked on every venue authorization, so reactivating a membership does not bypass it. Existing ordinary café memberships continue to work; legacy `PLATFORM_ADMIN` venue strings grant no venue or platform authority and are never promoted.

The café portal lists only active server-derived memberships joined to the same venue/tenant and active, verified users. It shows actual venue metadata, rooms, resources and upcoming bookings from PostgreSQL; owners/managers can add rooms/resources through existing venue-scoped APIs. Venue switching remounts the view and clears the previous venue's data. There is no role switch, static Nexus data, fixture mutation, API-to-mock fallback or mock finance/runbook content in the authenticated path. Unconnected modules are explicitly unavailable. Platform accounts are denied café/customer operational APIs even if legacy memberships exist.

The existing pass demonstration is preserved: the old demo App only mounts at exact `http://127.0.0.1:8788` with the capability meta tag injected by the existing preview server. That capability grants no real API/admin authority. Ports8787/8788 and their preview service were not changed or used to authenticate real users.

## Security changes and affected routes

- `0033_cafe_access.sql` adds `platform_grants`, immutable café applications and `sessions.mfa_verified_at`. Only successful TOTP session rotation stamps the proof. `mfa_state='active'` or having an enrolled factor alone is insufficient for owners/managers/admins, including privileges granted mid-session.
- Platform grants are independent of venue roles. `gamerbooker_app` can SELECT grants but cannot INSERT/UPDATE/DELETE/TRUNCATE them. API startup refuses a runtime role that has any of those privileges. Keep owner/migration/operator credentials out of the API process.
- Admin requests require a currently active, verified account, unrevoked/unexpired dashboard cookie, confirmed TOTP factor, proof on that specific session and a live platform grant. Mobile bearer sessions and dashboard tokens presented as bearer are denied.
- Dashboard login and cookie mutations require `X-GamerBooker-CSRF: 1`. A supplied browser Origin must exactly match `DASHBOARD_ORIGINS`; an empty allowlist rejects browser Origin-bearing mutations. CORS allows only configured origins. Cookies retain `__Host-`, Secure, HttpOnly, Path=/ and SameSite=Lax. Frontend/backend must share a browser origin via the proxy.
- Direct membership create/update and staff invitation creation reject platform/unknown roles. Invitation acceptance locks its row, checks pending/expiry, a valid venue role, same venue/tenant, and the authenticated verified account's email. Possessing another person's invitation does not bind it to the caller.
- Foreign venue IDs return404. Staff booking extension now checks the booking belongs to the path venue. Customer cancel/reschedule/extend require actual booking ownership. Existing scoped resource update checks were exercised with a foreign resource ID.
- Correction1: generic venue profile PATCH rejects any supplied `publication_state`, including the existing state or null, before profile writes. That UPDATE no longer writes publication state. Owners/managers can still edit profile fields; publication uses the dedicated gated/audited publish/unpublish routes. Incomplete DRAFT venues remain private.
- Correction1: staff booking transition passes the server path venue in a required typed service scope. The `SELECT ... FOR UPDATE` filters by that venue (or the authenticated customer for the customer-cancel call) before version/state checks, audit, claim updates or outbox effects. Foreign/missing bookings both return404 even when an attacker guesses the correct version. Same-venue staff transitions and own-customer cancellations remain valid.
- Old direct `POST /v1/admin/tenants` and `/admin/venues` provisioning routes are closed after authentication/admin checks. Provision through the application decision transaction.
- Public `POST /v1/events/broadcast` and `GET /v1/events/stream` are unregistered. Backend internal event emitters remain available; a tenant-bound realtime stream is future work.
- Unsafe legacy runbooks R1/R2/R3/R4/R6, training certification writes, and observability security metrics/security-violation/system-health routes fail closed. Basic `/healthz` and `/readyz` remain available. Static curriculum/contingency/compliance documents remain public. Venue fiscal status now requires OWNER/MANAGER membership on the path venue. These legacy closures are deliberate compatibility changes, not completed operational-module integrations.

## Local first-administrator setup (owner action, not executed on live data)

Preconditions: installed project dependencies, a local PostgreSQL database the owner explicitly chooses for this application, a separate privileged migration/operator connection, runtime credentials for `gamerbooker_app`, an existing trusted local HTTPS certificate/key for `127.0.0.1` (or an equivalent same-origin HTTPS reverse proxy), and a private persistent `MFA_SECRET_KEY` of at least32 characters. No certificates, privileged accounts, production migrations or application services were provisioned by this packet. Do not paste passwords, DSNs, verification tokens, TOTP secrets/codes or recovery codes into chat or source files.

1. In a private local PowerShell session, load your existing owner DSN into `MIGRATION_DATABASE_URL` without printing it. A secret prompt keeps the value out of command history:

   ```powershell
   $migrationSecret = Read-Host 'Local migration DSN' -AsSecureString
   $env:MIGRATION_DATABASE_URL = [System.Net.NetworkCredential]::new('', $migrationSecret).Password
   node db/migrate.js
   Remove-Item Env:MIGRATION_DATABASE_URL
   ```

   This applies pending migrations to the database YOU selected; review the target privately first. We applied all migrations only to new, disposable test databases. Do not run this against a production database as part of this handoff. The migration runner requires a privileged role; it must not fall back to owner credentials for the running API. Migration0033 never promotes legacy accounts.

2. In the API terminal, load `DATABASE_URL` through the same private prompt pattern using the runtime `gamerbooker_app` connection. Load the persistent MFA key through a private prompt too, not a literal in command history. Set nonsecret local values and run:

   ```powershell
   $runtimeSecret = Read-Host 'Local gamerbooker_app runtime DSN' -AsSecureString
   $env:DATABASE_URL = [System.Net.NetworkCredential]::new('', $runtimeSecret).Password
   $mfaKeySecret = Read-Host 'Persistent private MFA encryption key (32+ characters)' -AsSecureString
   $env:MFA_SECRET_KEY = [System.Net.NetworkCredential]::new('', $mfaKeySecret).Password
   $env:NODE_ENV = 'development'
   $env:API_HOST = '127.0.0.1'
   $env:PORT = '3000'
   $env:DASHBOARD_ORIGINS = 'https://127.0.0.1:5173'
   npm run start:dev
   ```

   Development mode exposes the existing development token delivery path and is forced to loopback. Nondevelopment preserves an explicit `API_HOST` or the prior all-interface default; configure production network/TLS separately. Runtime startup fails if migration0033 is absent or the API role can mutate platform grants. Use `/healthz` for process health; `/readyz` is the existing TCP readiness probe, not a full authorization check.

3. In a separate dashboard terminal set file paths for your existing trusted certificate/key, then start Vite:

   ```powershell
   $env:DASHBOARD_TLS_CERT = 'C:\private-local-certificates\127.0.0.1.pem'
   $env:DASHBOARD_TLS_KEY = 'C:\private-local-certificates\127.0.0.1-key.pem'
   npm --prefix apps/venue-dashboard run dev
   ```

   Replace these illustrative paths with your own existing files. Vite binds127.0.0.1:5173 with strictPort and proxies `/v1` to the loopback API. Visit `https://127.0.0.1:5173`. Trust your locally issued certificate through your normal local process. HTTP Vite remains available when no certificates are configured for nonauth design work; reliable Secure-cookie browser authentication requires HTTPS. No cookie weakening or TLS bypass is provided. If cookie login appears to succeed but context returns401, inspect browser cookie acceptance/origin/TLS locally; do not copy tokens to URLs or localStorage.

4. In that portal create **your own dedicated administrator account** using a private password (minimum12 characters) and accepted terms. Development registration displays its private one-time verification token locally; paste it into the portal's `Verificare email` field. Do not put it in a URL, shell command, screenshot or chat. In nondevelopment no token is returned and no real mail delivery is implemented yet, so public account activation requires a separately configured delivery flow. Log in after verification and note your user UUID from the authenticated `/v1/me` response locally if needed; no role is self-selected.

5. In a separate, trusted operator terminal, grant that exact verified dedicated account. It must have no active café membership. Use an owner/operator DSN only in this terminal and a ticket/reference identifying your approved operator action:

   ```powershell
   $operatorSecret = Read-Host 'Local privileged operator DSN' -AsSecureString
   $env:OPERATOR_DATABASE_URL = [System.Net.NetworkCredential]::new('', $operatorSecret).Password
   $verifiedEmail = Read-Host 'Your verified dedicated administrator email'
   $operatorTicket = Read-Host 'Operator approval ticket (letters/numbers and . _ : -; 6-100 characters)'
   npm run operator:platform -- grant $verifiedEmail $operatorTicket
   Remove-Item Env:OPERATOR_DATABASE_URL
   ```

   This CLI is the only platform-grant writer supplied. There is no HTTP bootstrap route, default password or shared admin. It requires an active verified account, privileged DB permissions, audits `LOCAL_OPERATOR` with the operator reference and target user (no fabricated HTTP actor), and revokes every prior session. Only the subject UUID is printed on success. To revoke, run the same private operator setup with `revoke` instead of `grant`; this also revokes all sessions. No grant to any live identity was performed by us.

6. Log in freshly. Configure TOTP on the first admin login, store the displayed recovery codes privately, and enter the current authenticator code. Recovery-code login/reset is not connected yet; keep an operator recovery procedure. The admin portal now contains the application queue and approved setup metadata only. It has no floor/orders/payment tools.

7. Create a **separate** café-owner account in another browser profile (or log out first), privately register/verify/login, and submit the café's legal name, venue name, city and IANA timezone. It sees `În evaluare` and no dashboard. As administrator, approve with a reason. The applicant's previous sessions are revoked. Log in freshly as that café owner, complete TOTP, then view its own real empty/DRAFT venue, add its first room/resource, and verify isolation using a second approved café in another account.

## Manual UAT still to perform

No browser/CUA automation was used because the prior access-confidence stop remains in scope. A human should perform the HTTPS/cookie setup above and verify: failed login and verification messages; TOTP enrollment/success; application pending/rejection; concurrent approval replay; admin setup name/timezone edits; suspension/reinstatement with fresh owner login; logout; two venue memberships switching without stale data; two café accounts receiving404 for each other's direct venue/resource/booking IDs; staff roles supplied only by the server; and the old pass preview still displaying only local demo behavior at8788. Keep all actual credentials private. Build/HTTP/database evidence does not claim visual/browser UAT or live service availability.

## Evidence and limits

See `notes/cafe-access/verification-2026-11-05.md` for exact observed commands/results and disposable DB identifiers. The test harness now appends a per-run random suffix and validates the suffix before any drop/create, including older acceptance suites. API tests use real HTTP, real TOTP and real PostgreSQL under `gamerbooker_app`; no fake auth. Existing auth/MFA suites opt in explicitly to the browser custom-header contract. New security-negative tests leave that opt-in off and explicitly omit/spoof headers for denial cases.

This is a bounded onboarding/auth/tenant-isolation implementation, not a complete security certification of every legacy API. Payment/PSP behavior, QR/quote secrets, all old mobile/customer flows, notifications/email delivery, realtime replacement, multi-instance rate limits, account recovery, large-queue pagination (queue currently latest500), production TLS/credentials, release signing, deployment and visual UAT remain outside this packet. Legacy operational routes not described above were not exhaustively re-audited. The portal fails closed and shows unavailable states instead of fixture data for unconnected modules. No production migrations, live grants, public deployment, external mail or mobile/Flutter edits were performed.
