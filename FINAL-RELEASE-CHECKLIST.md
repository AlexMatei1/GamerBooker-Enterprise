# GamerBooker Enterprise v1.0 — Final Release Checklist

**Verified:** 2026-11-12  
**Build:** `1.0.0`  
**Result:** Local release build complete. All automated suites and runtime simulations pass.

---

## Release gates

| Gate | Status | Evidence |
|---|---|---|
| TypeScript compilation | PASS | `npx tsc --noEmit` → no diagnostics |
| API build | PASS | `dist/main.js`, `dist/app.module.js` |
| Venue dashboard build | PASS | `apps/venue-dashboard/dist/` |
| Mobile web build | PASS | `apps/mobile-app/dist/` |
| Jest integration suite | PASS | 45/45 suites, 564 passed, 4 todo |
| Flutter tests | PASS | 36/36 |
| Flutter release APK | PASS | signed `app-release.apk`, 72,723,591 bytes |
| Flutter release AAB | PASS | signed `app-release.aab`, 68,171,721 bytes |
| Packaged release bundle | PASS | `release/v1.0.0/`, 349/349 checksums verified |
| Dashboard runtime smoke | PASS | `scratch/test-all-tabs.cjs` → 20/20 |
| End-to-end customer flow | PASS | `scratch/full-customer-simulation.cjs` → 100% |
| Database migrations | PASS | 34/34 applied to `gamerbooker_dev` |

---

## 1. Database

- [x] PostgreSQL 17 running on `127.0.0.1:5433`
- [x] Database `gamerbooker_dev` created
- [x] All 34 migrations applied
- [x] `cafe_applications.form_data` present (`migrations/0034_cafe_application_form_data.sql`)
- [x] Local `pg_hba.conf` set to `trust` for localhost only; backup at `pg_hba.conf.bak`
- [x] Demo data seeded (Arena Cyber Cafe, accounts below)

Start the local cluster if it is not running:

```powershell
& "C:\Users\alexm\AppData\Local\Temp\opencode\pg17full\pgsql\bin\pg_ctl.exe" `
  -D "C:\Program Files\PostgreSQL\17\data" `
  -o "-p 5433" `
  -l "C:\Users\alexm\AppData\Local\Temp\opencode\pg17.log" start
```

---

## 2. Build

- [x] `npx tsc --noEmit`
- [x] `npm run build:all`
- [x] Flutter release APK built and signature verified
- [x] Flutter release AAB built and signature verified

```powershell
npx tsc --noEmit
npm run build:all
cd apps/flutter-mobile; flutter build appbundle --release; flutter build apk --release
```

Artifacts:

```text
dist/                                              NestJS API
apps/venue-dashboard/dist/                         Venue dashboard
apps/mobile-app/dist/                              Mobile web app
apps/flutter-mobile/build/app/outputs/bundle/release/app-release.aab
apps/flutter-mobile/build/app/outputs/flutter-apk/app-release.apk
release/v1.0.0/                                    Packaged release bundle
release/GamerBooker-Enterprise-v1.0.0.zip          Single-file archive
```

The APK and AAB are signed with the local release certificate (`CN=GamerBooker`). Keep `apps/flutter-mobile/android/app/release-keystore.jks` and `android/key.properties` backed up and private. Verify the staged bundle with `release/v1.0.0/SHA256SUMS.txt`; details are in `release/v1.0.0/RELEASE-MANIFEST.md`.

---

## 3. Automated tests

- [x] Full Jest suite: 45/45 suites, 564 passed, 4 todo
- [x] Flutter suite: 36/36
- [x] Cafe access and local-admin security suites green
- [x] Publish gates enforced for incomplete venues

```powershell
npx jest --ci --no-cache --maxWorkers=4
cd apps/flutter-mobile; flutter test
```

Use `--no-cache`: on this machine the Jest temp cache can fail with `EPERM` under parallel load.

---

## 4. Runtime services

- [x] API on `http://127.0.0.1:3000`
- [x] Venue dashboard dev server on `http://127.0.0.1:5173`
- [x] Mobile web dev server on `http://127.0.0.1:5174`
- [x] Dashboard endpoint sweep: 20/20
- [x] End-to-end customer simulation: 100%

```powershell
node tools/local-auth/start-api.cjs start
npm --prefix apps/venue-dashboard run dev
npm --prefix apps/mobile-app run dev
```

Runtime smoke tests:

```powershell
node scratch/test-all-tabs.cjs
node scratch/full-customer-simulation.cjs
```

Verified flow: catalog → availability → mobile login → price quote → hold → deposit → confirmed booking with QR → dashboard calendar sync → bar order lifecycle → cancellation and station release.

---

## 5. Release accounts and demo venue

All seeded accounts use password `GamerBooker2026!`.

| Role | Email | User ID |
|---|---|---|
| Platform admin | `alexmatei2330@gmail.com` | `a6b0fabf-b718-45b2-8854-37a63235c6d1` |
| Customer | `andrei.gamer@gmail.com` | `6226bbdb-a7b9-4a43-af91-8430c0caf4ed` |
| Cafe partner / owner | `popamatei85@yahoo.com` | `18b96d4b-ebdc-4b77-932c-db7c8a624760` |

Demo venue:

- Arena Cyber Cafe — `bb680464-7537-4ff1-a994-2ffd9bca6138`
- State: `PUBLISHED`
- 20 bookable PCs, 7-day schedule, default policy, 25/40 RON price rules, OWNER membership

---

## 6. Security fixes confirmed in this build

- [x] Cafe approval creates a `DRAFT` venue, not `PUBLISHED`
- [x] Approved venues start empty; owner completes setup before gated publish
- [x] Approval does not rotate the applicant's password
- [x] Local-admin password path requires an allowed `Origin` for mutations
- [x] Origin-less login falls back to the MFA-gated flow
- [x] Publication state cannot be changed through generic venue profile edits
- [x] Cross-tenant reads and writes remain isolated
- [x] Platform role injection is rejected in venue memberships and invitations
- [x] Admin maintenance fields are allowlisted and audited

---

## 7. Production-only items (not blockers for this local build)

- [ ] Replace local `trust` auth with password/TLS-protected PostgreSQL credentials
- [ ] Provision production secrets: `MFA_SECRET_KEY`, PSP/Stripe keys, SMTP/mail credentials, `DASHBOARD_ORIGINS`
- [ ] Back up and protect the Android release keystore and `key.properties`
- [ ] Terminate TLS at a trusted reverse proxy
- [ ] Run migrations with a privileged connection, then start the API with the restricted runtime role
- [ ] Validate PSP webhooks, refunds and merchant configuration with real credentials

---

## Final status

**Local release build: COMPLETE.**  
All code quality gates, builds, automated tests and runtime simulations pass. A signed AAB and signed APK are packaged with checksums under `release/v1.0.0/`, and the single-file archive `release/GamerBooker-Enterprise-v1.0.0.zip` is ready to hand off. Production deployment remains gated on secrets, TLS and database hardening listed above.
