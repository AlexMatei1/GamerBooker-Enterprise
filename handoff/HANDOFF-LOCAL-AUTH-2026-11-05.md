# Local authentication screen — 2026-11-05

- Lease: `LOCAL-AUTH-UI-2026-11-05` — **CLOSED** (implementation complete; ready for independent verification and review).
- Source scope: `apps/venue-dashboard/src/SecureApp.tsx` and `apps/venue-dashboard/src/styles/access.css`; both were already untracked before this task. Existing account, MFA, cafe application, platform administration, and venue dashboard handlers are retained.
- The anonymous entry screen centers an email/password login card in the available viewport. The label is explicitly **Email**, since the existing API authenticates by email. “Creează cont de cafenea” and “Verifică emailul” are secondary actions; both retain their existing real API flows.
- Anonymous layout uses a flexible full-height shell with `100dvh`, natural page overflow, responsive padding, 16px authentication inputs, and visible keyboard focus. Network failures show a service-unavailable message instead of a raw fetch error.
- API paths, same-origin credentials, CSRF header, MFA flow, server-authorized admin/cafe routing, and password autocomplete behavior remain intact. No backend activation, database changes, certificates, grants, credentials, or preview source changes were made.

Validation:

- `npm --prefix apps/venue-dashboard run build` — PASS (`tsc && vite build`; 1,592 modules transformed).
- `git diff --check` — PASS; repository emitted existing CRLF normalization warnings for unrelated tracked files. The two edited source files are untracked, so they were also checked directly for valid UTF-8, replacement characters, and trailing whitespace.
- UTF-8 source checked directly: Romanian diacritics preserved; no replacement characters.
- No new unit tests for this layout change. Browser automation and visual inspection were not performed, following the existing access-confidence stop. End-to-end authentication and live API availability were not tested or activated.

Writer client identity: exposed as Codex / GPT-6 family; exact serving model is not exposed, so the requested `gpt-6.1-sol` identity cannot be independently attested.

## CSS correction round 1

- Lease: `LOCAL-AUTH-UI-C1` — **CLOSED**.
- Independent review found the authentication override block preceded the generic CSS. Moved the complete override block after all generic rules and their mobile query; no selectors or authentication behavior changed.
- Source-order reasoning: `.access-login` now follows equal-specificity `.access-card` and `.access-auth`, so its 460px maximum width, zero margin, 32px padding, and shadow win. `.access-login h1`, `.access-login form`, `.access-login input`, and `.access-auth-secondary button` follow the respective equal-specificity generic element rules, so the heading, 26px form margin, 16px input font size, and transparent secondary background win. The later login mobile rule wins with 24px card padding. The anonymous `100dvh` declaration now also follows generic `100vh`.
- Correction validation: dashboard production build and `git diff --check` passed. Source ordering was inspected directly; browser automation and visual inspection remain unperformed under the existing access-confidence stop.

## Dashboard styling follow-up

- Lease: `LOCAL-AUTH-DASHBOARD-STYLE` — **CLOSED**.
- Matched the existing `theme.css` and `Header.tsx`: paper `#f2f0e9`, ink `#171c21`, orange `#f2643d`, muted `#657078`, line `#d9d9cf`, Arial/Helvetica body, and the existing condensed heading stack. Shared CSS variables have local fallback values; global dashboard theme was not edited.
- Replaced the green palette and large rounded cards with orange actions carrying ink labels, restrained borders, and 7–8px control/card corners. The ink header uses the existing Aperture icon, stacked Gamer/Booker wordmark, and orange brand dot. `SecureApp.tsx` changes in this follow-up are limited to the icon import and header brand markup.
- Kept the centered 460px login card, 16px authentication inputs, natural vertical overflow, focus outlines, and secondary registration/verification actions. Entry overrides remain after the generic CSS and mobile rules. Auth, MFA, context, CSRF, and cookies are unchanged.
- `npm --prefix apps/venue-dashboard run build` — PASS (`tsc && vite build`, 1,592 modules, Vite 12.30s). `git diff --check` — PASS, with existing unrelated CRLF normalization warnings. Direct CSS source-order, UTF-8, and whitespace checks passed.
- Read-only HTTP checks against the already running Vite server at `http://127.0.0.1:5173`: `/src/styles/access.css` returned HTTP 200 (6,963 bytes) containing the new shared paper/orange/ink palette and 460px/16px rules; `/src/SecureApp.tsx` returned HTTP 200 (118,552 bytes) containing the Aperture/brand/dot markup.
- No browser automation or visual rendering check was performed. No backend, database, TLS, account, credential, or server-process changes were made.

## Owner-authorized local account database schema

- Lease: `LOCAL-AUTH-DB-0033` — **CLOSED**.
- Applied only `migrations/0033_cafe_access.sql` to the root `.env` target after privately verifying both URL and resolved connection settings point to loopback port 5433, database `gamerbooker_dev`, and confirming `current_database()` from the connection. No DSN, password, token, or account data was printed or written to evidence.
- Acquired existing advisory migration lock `305419897`; compared all applied filenames to local SQL files: 32 applied, exactly `0033_cafe_access.sql` pending, no unknown applied filenames. Captured SQL SHA256 `3b707b2ab0fae005e7badf70ea498223c3ca3a51b8a9c08ccb0ba84190f9c79c` and passed the existing `hasTransactionControl` guard.
- The actual migration SQL and its `schema_migrations` entry committed in one transaction. Schema, privilege, and aggregate row-count checks passed inside the transaction and were repeated read-only after commit. The ledger now contains 33 migrations, including 0033.
- Verified `sessions.mfa_verified_at` has timestamp-with-time-zone type, the `platform_grants` and `cafe_applications` tables exist, and the `cafe_decision_immutable` and `venue_role_only` triggers exist and are enabled.
- User/session/venue-membership counts remained **0 / 0 / 0** before and after. `platform_grants` and `cafe_applications` are empty. For `gamerbooker_app`, platform grants allow only SELECT among SELECT/INSERT/UPDATE/DELETE/TRUNCATE; cafe applications allow SELECT/INSERT/UPDATE and deny DELETE/TRUNCATE.
- Sanitized aggregate evidence: `notes/local-auth-db-2026-11-05.md`. No source or migration SQL was edited. No user/admin account, platform grant, password reset, runtime auth test, backend activation, TLS/trust-store change, service change, or network exposure was performed.

## Owner-authorized local API runtime — 2026-11-06

- Lease: `LOCAL-AUTH-RUNTIME-2026-11-06` — **CLOSED**.
- Added `tools/local-auth/start-api.cjs` and ignored `.local-auth/`. It privately verifies the root `.env` loopback database target, reconstructs a passwordless `gamerbooker_app` URL, checks the connected restricted role and platform SELECT-only privileges, and passes an allowlisted environment to the existing built API. Owner credentials are not passed to the API.
- Read-only preflight found zero users and MFA factors before generating a 48-byte random MFA encryption key. The key is persisted in ignored `.local-auth/mfa.json`, protected with current-user/SYSTEM-only Windows ACLs. Existing keys are preserved; existing factors without a prior key and conflicting keys cause refusal. Logs contain fixed sanitized events.
- API retained after successful startup: **PID 2660**, launcher **42660**, listener only **127.0.0.1:3000**. `/healthz` returned **200**; unauthenticated `/v1/access/context` returned **401 AUTH_REQUIRED**. Users, active/verified users, MFA factors, sessions, memberships, platform grants, and cafe applications remained zero before/after. Runtime role has LOGIN and no superuser/create-role/create-db/bypass-RLS or inherited privileged role; platform grants permit SELECT and deny INSERT/UPDATE/DELETE/TRUNCATE.
- Start/restart from root: `node tools/local-auth/start-api.cjs`. Stop: `node tools/local-auth/start-api.cjs --stop`; it validates PID, creation time, executable, and entrypoint before terminating the recorded API. Ctrl+C in the attached launcher stops its own child. Startup failure terminates only its child; an existing port-3000 listener causes refusal.
- `node --check`, ignore checks, and `git diff --check` passed. Narrow launcher escalation was required after sandbox EPERM. The initial 10-second startup attempt stopped cleanly; the persisted key was reused and the 40-second window succeeded. No registration/login/token, visual, or end-to-end auth tests were performed.
- Existing database trust authentication and Docker publication of port 5433 on all host interfaces remain unchanged; this does not claim a secured database network. No account/admin/grant, migration, role/password, database config, TLS/trust-store, or database exposure changes were made. Details: `notes/local-auth-runtime-2026-11-06.md`.

## Bounded API restore — 2026-11-06

- Lease: `LOCAL-AUTH-RESTART-2026-11-06` — **CLOSED**. No source changes.
- Preflight found port 3000 free and prior API 2660 / launcher 42660 absent; prior log ended at ready without an exit event. The cause of their disappearance is unproven.
- Started the unchanged helper once with hidden Windows `Start-Process`, using only its path as the argument. The launcher is now **PID 9700**, API **PID 31076** (created `2026-11-06T00:25:00.6896470Z`), listener only **127.0.0.1:3000**. Both processes remained present across subsequent independent tool commands after the launching command returned. This is a local background process, without a Windows service or boot/logon restart guarantee.
- GET `/healthz` returned **200** and unauthenticated GET `/v1/access/context` returned **401 AUTH_REQUIRED**. Runtime preflight again validated `gamerbooker_app` restrictions and platform SELECT-only privileges; all auth counts remained zero. Existing private MFA key was **preserved**.
- Stop the recorded API using `node tools/local-auth/start-api.cjs --stop`, which checks process identity. No account/admin/grant, key rotation, password, migration, database/network, or TLS/trust-store action was performed. Admin email and trust decisions remain unresolved.

## Local TLS files only — 2026-11-06

- Lease: `LOCAL-AUTH-TLS-FILES-2026-11-06` — **CLOSED**. Prepared ignored `.local-auth/tls/server-cert.pem`, `server-key.pem`, and matching public DER `server-cert.cer`, using installed Git OpenSSL. No unknown existing files were overwritten.
- Verified self-signed RSA 2048 leaf, sole SAN IP `127.0.0.1`, critical `CA:FALSE`, Digital Signature/Key Encipherment, serverAuth EKU, 365-day validity through `2027-11-06 04:42:05 UTC`, matching private key and self-signature. SHA256 fingerprint: `AC:ED:9C:60:E4:68:91:4F:7C:15:2F:BD:5E:89:31:24:DA:C4:00:33:51:AF:C6:37:0D:8A:6E:D4:ED:3D:FB:8F`.
- TLS directory ACL is protected and permits only current user/SYSTEM; certificate/key files inherit only those entries. Private key contents were not printed; Git ignores the files. No Windows trust import, Vite restart/config edit, API change, account/password/grant, or mail operation occurred.
- `notes/local-auth-tls-2026-11-06.md` contains public certificate evidence, exact deferred CurrentUser Root public-certificate import and Vite TLS environment commands, plus owner registration/verification/operator-review/MFA steps for supplied email `alexmatei2330@gmail.com`. Trust installation and account operations remain unexecuted.

## Approved HTTPS activation — 2026-11-06

- Lease: `LOCAL-AUTH-HTTPS-ACTIVATE-2026-11-06` — **CLOSED**. Owner approved exact public leaf trust and local Vite restart. Imported verified `.local-auth/tls/server-cert.cer` into CurrentUser Root only; exact SHA256/SHA1 matched and no private key was imported. LocalMachine Root before/after snapshots unchanged (52 entries).
- Replaced only identity-checked workspace Vite PID 12576 with hidden background Vite **2044**, using existing PEM path environment variables and configuration. Portal **https://127.0.0.1:5173/** binds only loopback. API **31076** remains unchanged on loopback port 3000. Processes survived subsequent independent commands; no service/autostart guarantee.
- Normal Windows-trust portal GET **200**; default .NET TLS handshake peer fingerprint matched; Windows Schannel curl HTTPS proxy GET `/v1/access/context` **401 AUTH_REQUIRED**; API health GET **200**. No certificate-validation bypass was used.
- Source-only secure-cookie contract inspected; no account/login/registration/session/token/password/terms/MFA seed/admin-grant/mail action occurred. No source, database, role, or network exposure changes. Evidence: `notes/local-auth-https-2026-11-06.md`.

## Approved administrator grant — 2026-11-06

- Lease: `LOCAL-ADMIN-GRANT-20261106` — **CLOSED**. Owner registered and verified `alexmatei2330@gmail.com` before this lease. Privately verified root `.env` URL/resolved target and connected `gamerbooker_dev` on loopback port 5433; operator role `postgres` had required write rights.
- Preflight found exactly one active verified target account, UUID `561a11f5-2aa0-423f-84cf-dba27589c416`, zero active cafe memberships, zero active platform grants, and zero matching prior grant audits. Invoked the existing `src/platform-access/operator.ts` CLI via its existing ts-node entrypoint **once**, with `grant`, the approved email, and reference `LOCAL-ADMIN-20261106`; privileged URL was passed only in the child environment. Exit code 0.
- Read-only postchecks confirmed the active grant for that UUID/reference, zero unrevoked target sessions, no active cafe memberships, exactly one `platform.access_granted` audit with `LOCAL_OPERATOR` / `local_operator`, and unchanged total user count (1). Runtime `gamerbooker_app` platform permissions remain SELECT-only; INSERT/UPDATE/DELETE/TRUNCATE denied.
- No password/token/MFA handling, login, other identity/role, certificate, service, or feature change occurred. Owner should sign in again and enroll/confirm MFA privately in the existing UI. Sanitized evidence: `notes/local-admin-grant-2026-11-06.md`. Shared venue feature remains paused/incomplete pending separate review and resume.
