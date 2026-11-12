# GamerBooker Enterprise v1.0 — Release Build Report

**Date:** 2026-11-12  
**Build:** `1.0.0` (`package.json`)  
**Environment:** Windows 10/11, Node.js + npm, PostgreSQL 17 (portable binaries), Flutter 3.47.9, Android SDK 35  
**Scope:** Local release build and end-to-end verification. Production infrastructure is out of scope for this report.

---

## Build status

**PASS** — TypeScript, all three application builds, the full Jest suite, the Flutter suite and both runtime integration simulations pass on this machine.

Docker was not used. PostgreSQL 17 runs directly from portable binaries on port `5433`, with the `gamerbooker_dev` database and all 34 migrations applied.

---

## Built components

| Component | Command | Output | Status |
|---|---|---|---|
| NestJS API | `npm run build` | `dist/` (`main.js`, `app.module.js`, module folders) | PASS |
| Venue Dashboard | `npm --prefix apps/venue-dashboard run build` | `apps/venue-dashboard/dist/` | PASS |
| Mobile Web App | `npm --prefix apps/mobile-app run build` | `apps/mobile-app/dist/` | PASS |
| Flutter Android APK | `flutter build apk --release` | `apps/flutter-mobile/build/app/outputs/flutter-apk/app-release.apk` | PASS |
| Flutter Android AAB | `flutter build appbundle --release` | `apps/flutter-mobile/build/app/outputs/bundle/release/app-release.aab` | PASS |

`npm run build:all` executes the first three builds in sequence and completed successfully.

### Flutter release APK

- **Path:** `apps/flutter-mobile/build/app/outputs/flutter-apk/app-release.apk`
- **Size:** 72,723,591 bytes
- **Signing:** verified with `apksigner` against the release certificate (`CN=GamerBooker`); APK Signature Scheme v2, 1 signer
- **Certificate SHA-256:** `0077d04d7b7a3074e0580535aea565172b6d3c01309598c8e9ff009f3b53bc77`
- **Keystore:** `apps/flutter-mobile/android/app/release-keystore.jks`, alias `gamerbooker`
- **Signing config:** `apps/flutter-mobile/android/key.properties`

### Flutter release AAB (Play Store upload)

- **Path:** `apps/flutter-mobile/build/app/outputs/bundle/release/app-release.aab`
- **Size:** 68,171,721 bytes
- **Signing:** verified with `jarsigner -verify`; certificate `CN=GamerBooker, OU=Release, O=GamerBooker, L=Bucharest, ST=Bucharest, C=RO`
- **Version:** `1.0.0+1`, application ID `ro.gamerbooker.app`, `minSdkVersion` 24

The keystore and `key.properties` are gitignored local release material. Back them up; losing the keystore prevents upgrades of the published app.

---

## Verification results

### Static checks and builds

```text
npx tsc --noEmit
→ PASS (no diagnostics)

npm run build:all
→ PASS (API + venue dashboard + mobile web app)
```

### Automated test suites

```text
npx jest --ci --no-cache --maxWorkers=4
→ Test Suites: 45 passed, 45 total
→ Tests:       4 todo, 564 passed, 568 total
→ Time:        ~50 s
```

The full suite runs against disposable PostgreSQL databases and real HTTP sockets. `--no-cache` is required on this machine because the Jest temp cache can hit `EPERM` under parallel load.

```text
cd apps/flutter-mobile && flutter test
→ 36/36 tests passed
```

### Runtime integration

```text
node scratch/test-all-tabs.cjs
→ 20/20 dashboard endpoints PASS
→ Sala 2/2, Comenzi 1/1, Încasări 1/1, Configurare 12/12, Rezervări 2/2, General 2/2

node scratch/full-customer-simulation.cjs
→ 100% PASS
→ catalog → availability → mobile login → quote (50 RON)
→ hold → deposit (20 RON) → booking confirmation (QR)
→ dashboard calendar sync → bar order lifecycle
→ customer cancellation → station released
```

### Running services used for verification

| Service | Address |
|---|---|
| API | `http://127.0.0.1:3000` |
| Venue Dashboard (dev) | `http://127.0.0.1:5173` |
| Mobile Web App (dev) | `http://127.0.0.1:5174` |
| PostgreSQL | `127.0.0.1:5433`, database `gamerbooker_dev` |

---

## Database state

- **Server:** PostgreSQL 17 portable binaries
- **Port:** `5433`
- **Database:** `gamerbooker_dev`
- **Migrations:** 34 SQL files in `migrations/`, all applied (`schema_migrations` = 34)
- **Local auth:** `pg_hba.conf` uses `trust` for localhost only (backup: `pg_hba.conf.bak`). This is a development convenience, not a production setting.

### Seeded release accounts

All seeded accounts use password `GamerBooker2026!`.

| Role | Email | User ID |
|---|---|---|
| Platform admin | `alexmatei2330@gmail.com` | `a6b0fabf-b718-45b2-8854-37a63235c6d1` |
| Customer | `andrei.gamer@gmail.com` | `6226bbdb-a7b9-4a43-af91-8430c0caf4ed` |
| Cafe partner / owner | `popamatei85@yahoo.com` | `18b96d4b-ebdc-4b77-932c-db7c8a624760` |

### Demo venue

- **Venue:** Arena Cyber Cafe — `bb680464-7537-4ff1-a994-2ffd9bca6138`
- **Application:** `ef5cd328-fd52-4f27-8ba9-cd3f881f60ea` (approved through the real Admin API)
- **State:** `PUBLISHED`
- **Setup:** 20 bookable PCs, 7-day operating schedule, default policy, price rules 25 RON/h standard and 40 RON/h VIP, owner membership
- **Dashboard verification:** all setup and operational tabs return `200`

---

## Release artifacts

The release bundle is staged under `release/v1.0.0/` and archived as `release/GamerBooker-Enterprise-v1.0.0.zip` (109,544,865 bytes).

| Artifact | Path | Size |
|---|---|---|
| Play Store bundle | `release/v1.0.0/android/gamerbooker-1.0.0.aab` | 68,171,721 B |
| Direct-install APK | `release/v1.0.0/android/gamerbooker-1.0.0.apk` | 72,723,591 B |
| API build | `release/v1.0.0/api/` (`dist/`, 34 migrations, manifests) | — |
| Venue dashboard | `release/v1.0.0/venue-dashboard/` | — |
| Mobile web app | `release/v1.0.0/mobile-web/` | — |
| Checksums | `release/v1.0.0/SHA256SUMS.txt` | 349 files |
| Manifest | `release/v1.0.0/RELEASE-MANIFEST.md` | — |

```text
SHA-256
android/gamerbooker-1.0.0.aab  0d1fc2636b1ee03d6cf630d5f17ff905c2356845d83ad00aad10fb951e494c0f
android/gamerbooker-1.0.0.apk  d4c1cbdce42932bd43d1a9f101a388a402d5b56dd7d0cb2460890ff78cea50ec
GamerBooker-Enterprise-v1.0.0.zip  6e87484b8f86ff23de5d62e6cadaae6d8784c3d71287db90003a460d198f5074
```

All 349 staged files re-hash to the values in `SHA256SUMS.txt`. `release/` is build output and is git-ignored.

Start commands:

```powershell
# API
node tools/local-auth/start-api.cjs start

# Venue dashboard
npm --prefix apps/venue-dashboard run dev

# Mobile web app
npm --prefix apps/mobile-app run dev
```

---

## Fixes applied during release verification

- `cafe_applications.form_data` added by `migrations/0034_cafe_application_form_data.sql`.
- Cafe approval now creates a `DRAFT` venue, not `PUBLISHED`.
- Cafe approval now leaves the venue empty (no rooms, resources, schedules, policy or prices). The owner completes setup before the gated publish route can succeed, matching the documented onboarding flow and the publish-gate tests.
- Cafe approval no longer rotates the applicant's password; only the dedicated temporary-password reset endpoint may change it.
- The local-admin password path requires an allowed `Origin` header for mutating requests. Origin-less logins fall back to the normal MFA-gated flow.
- Release APK signing configured with a local release keystore instead of the debug key.

---

## Remaining production-only items

These do not block the local release build but must be handled before a public deployment:

1. Replace local `trust` authentication with password/TLS-protected PostgreSQL credentials.
2. Provision production secrets: `MFA_SECRET_KEY`, PSP/Stripe credentials, SMTP/mail credentials and dashboard origins.
3. Back up and protect the release keystore and `key.properties`.
4. Terminate TLS at a trusted reverse proxy and set production `DASHBOARD_ORIGINS`.
5. Run migrations against the production database with a privileged migration connection, then start the API with the restricted runtime role.
6. Validate PSP webhooks and refund configuration with real merchant credentials.

---

## Conclusion

The v1.0 codebase builds cleanly, passes all 45 Jest suites (564 tests), passes the 36 Flutter tests, produces a signed Android release AAB and a signed release APK, and passes both dashboard and end-to-end customer simulations against a live PostgreSQL-backed API. The packaged release bundle in `release/v1.0.0/` is checksum-verified; only production secrets and infrastructure hardening remain.
