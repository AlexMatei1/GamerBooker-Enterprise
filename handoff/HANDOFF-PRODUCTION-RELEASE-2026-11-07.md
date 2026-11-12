# Production release handoff — 2026-11-07

## Objective and release status

Resume GamerBooker Enterprise v1.0 in `D:\Proiecte\GamerBooker_Enterprise_v1.0` and finish the secure server payment lifecycle, Flutter reservation/payment/pass/QR/cancellation/bar journey, company dashboard integration, automated release gates, proper Android signing/API configuration, and Huawei installation with manual acceptance. This is a local release-readiness objective. A public domain, Cloudflare/tunnel, deployment, publication, and real Stripe charges are outside the authorized scope.

**The release is incomplete and the current Flutter checkout work is interrupted.** Existing source contains useful security checks and client scaffolding, but the current tree has not been compiled or tested for this handoff. A previously installed preview APK and earlier passing checks do not establish that today's working tree builds or that a paid reservation works end to end.

This handoff was prepared from read-only inspection of current files, Git status/diffs, package scripts, OpenCode configuration, and the historical checkpoints linked below. Only this Markdown file was created. No product/test code, database, secrets, device state, services, or configuration was changed; no test/build/install was run for this documentation task. The already-dirty document index was left untouched.

## Evidence and current tree

The working tree is broadly dirty, with tracked modifications and many untracked files across the backend, Flutter, web clients, documentation, tests, tools, and handoffs. Preserve all of it. In particular, `apps/flutter-mobile/lib/catalog/` is untracked in Git, so `git diff` alone does not show its contents. Do not treat untracked files as disposable or newly attributable to the next agent.

### Confirmed by reading current source

| Area | Current observation | What it does not establish |
|---|---|---|
| Backend | NestJS/TypeScript API, PostgreSQL integration harness, React/Vite company dashboard and customer web app, plus a separate Flutter Android client are present in the tree. Root `package.json` defines the npm gates below. | Production readiness, green tests, or a deployed service. |
| Confirmation guard | `src/bookings/bookings.service.ts` requires a captured upfront intent when the quote has money due. It checks intent status, unlinked booking, tenant, venue, amount, currency, checkout metadata, hold, and customer before confirmation. The no-upfront branch rejects an unexpected intent. | Exhaustive protection against concurrency, retries, late capture, invalid transitions, or every alternative payment route. Those need tests/review. |
| Solo intent creation | `src/bookings/checkout.controller.ts` exposes authenticated `POST /v1/holds/:hold_id/payment-intent`. `checkout.service.ts` checks customer ownership and active/unexpired hold, uses server quote data and a hold-derived idempotency key, selects Stripe, and maps missing provider configuration to `PAYMENT_PROVIDER_UNAVAILABLE`. | A tested provider round trip. Current code passes `RON` to intent creation while returning the quote currency; verify the supported-currency contract. “Stripe provider” can use test credentials; it does not mean live charges are authorized. |
| Interrupted status route | Authenticated `GET /v1/holds/:hold_id/payment-intents/:intent_id` is present in the controller, service, and `checkout.types.ts`. The service reads persisted payment state and joins customer/tenant/venue/hold metadata; it returns status and amounts, without a client secret. | Verified authorization/contract tests, response compatibility, or safe lifecycle recovery. This is partial work, not an accepted feature. |
| Webhooks/provider | `src/payments/payments.service.ts` invokes provider signature verification, checks intent amount/currency for success/failure events, records webhook events, and updates payment state. `stripe-psp.provider.ts` fails without configuration instead of simulating a Stripe success. | Complete webhook security/idempotency under race, monotonic state transitions, raw-body fidelity, refund mapping, or late-payment recovery. Audit and prove these before acceptance. |
| Flutter dependency | `apps/flutter-mobile/pubspec.yaml` now declares `flutter_stripe: ^14.2.0`. | A resolved dependency graph. Current `pubspec.lock` has no `flutter_stripe`, `stripe_android`, `stripe_ios`, or `stripe_platform_interface` entry; the manifest and lock are inconsistent. Do not hand-edit the lock or assume generated package files are current. |
| Flutter partial client | `lib/catalog/catalog_client.dart` now has payment-intent/status/checkout models and `createSoloPaymentIntent`, `getSoloPaymentIntentStatus`, and `confirmSoloCheckout` methods, in addition to catalog/auth/quote/hold/release. | Working UI or sufficient contract coverage. The client interface still has no live booking-list/pass-refresh/cancel/bar-order methods. |
| Flutter new files | `payment_gateway.dart`, `stripe_payment_gateway.dart`, and `reservation_checkout.dart` exist under `lib/catalog/`. They define a native PaymentSheet adapter and a coordinator that attempts hold → intent → sheet → server status → confirmation. | An integrated, compiled, tested checkout. Poll timeouts, uncertain payment outcomes, cancellation/failed-network cleanup, resume/retry, and duplicate requests need careful review. |
| Concrete compile mismatch | `lib/main.dart` calls `LiveCatalogApp(paymentGateway: paymentGateway)`, but `catalog_app.dart` currently declares `const LiveCatalogApp({super.key, this.source});` and has no `paymentGateway` parameter. | Compiler output: the mismatch is a source observation, not a Flutter command result. Obtain the actual diagnostics before fixing it. |
| Another contract mismatch | `test/catalog_widget_test.dart` has `_Source implements VenueCatalogSource` without the three newly added payment/checkout methods. | A current test result. Update meaningful fakes/contracts when finishing the integration; do not weaken coverage to make it compile. |
| Flutter visible route | `catalog_app.dart` still requests a live quote only. It displays the notice that confirmation awaits payment integration and does not use the new coordinator. Account registration/sign-in, verification guidance, and optional MFA paths are present. | A live hold/payment/booking/pass/cancel/bar UI. Old demo/parity screens are not proof of server reservations. |
| Android partial setup | `MainActivity.kt` extends `FlutterFragmentActivity`. Gradle uses Java/Kotlin target 17; the release block still has `signingConfig signingConfigs.debug`. Main manifest disables cleartext; debug manifest adds preview network configuration. | Complete native Stripe compatibility or production signing. Inspect the resolved plugin's Android requirements, themes, SDK/Gradle versions, and release manifest. |
| API build configuration | `CatalogConfiguration` uses debug loopback by default, requires a valid HTTPS origin for release, and gates demo mode to explicit debug use. `main.dart` reads `GAMERBOOKER_API_BASE_URL` and `GAMERBOOKER_STRIPE_PUBLISHABLE_KEY` through dart-defines. | Availability of a trusted release origin, credentials, keystore, or correct environment. Their present secure configuration was not inspected. |
| Company web | `src/main.tsx` normally mounts `SecureApp`. `SecureApp.tsx` chooses `/admin` for platform admins and `/dashboard` for a company with venues. `CompanyDashboard.tsx` reads scoped overview/live-floor/check-in-queue/bar-board routes and posts check-in/bar transitions. | Browser acceptance, complete configuration/navigation linking, or tenant isolation merely because the UI supplies a venue ID. |
| Company setup linkage | Active `CompanyDashboard` currently renders today/reservations/floor/bar tabs. Separate `CompanyVenueSetup`, router helpers, and other dashboard modules exist. `SecureApp` returns the company dashboard before its older `VenueDashboard` setup branch. | That operational venue tools or explicitly delegated controls are reachable from the authenticated company route. Inspect the actual route graph; initial venue setup/configuration/publication remains in local `/admin`, not company `/dashboard`. |

### Historical results — records read, not rerun here

Read [production checkpoint](HANDOFF-PRODUCTION-RELEASE-CHECKPOINT-2026-11-07.md), [Android customer login](HANDOFF-ANDROID-CUSTOMER-LOGIN-2026-11-07.md), and [end-to-end integration](HANDOFF-END-TO-END-2026-11-06.md) for their original scope. They contain appended updates and some older statements superseded by later source changes.

- The production checkpoint records an earlier full backend run: **45 suites, 13 passed/32 failed; 562 tests, 262 passed/296 failed/4 todo**. It attributes failures to auth/MFA/CSRF/role fixtures, outdated DB fixtures, seeded discovery rows, and fail-closed route expectations. These are prior findings to reproduce and triage, not a current diagnosis of every failure.
- The same checkpoint records a later focused run of ENG-105/ENG-106: **2 suites/24 tests passed**, following the overpayment fixture correction and new missing/pending/mismatched-payment assertions. Current files contain those corrections/assertions. The earlier paragraph saying these were absent is stale. That checkpoint retained a pending-review note, but the focused slice was later independently accepted/reviewed. This is historical evidence only; it does not verify the current tree.
- Earlier `npm run typecheck:all` passed. Earlier lint failed with **717 errors**. Earlier `build:all` stopped at a Windows esbuild `spawn EPERM`; subsequent individual dashboard and customer-web builds passed with expanded process permission. These outcomes predate the interrupted Flutter/status changes and must not be presented as current gates.
- Flutter commands previously stalled around the SDK wrapper/cache lock; later customer-registration/keyboard work records **23 Flutter tests passed, analyze clean, and a debug APK built and installed**. These are previous states, not current results. The present Flutter/Stripe checkout tree remains unverified.
- The Android login handoff records the Huawei preview package `ro.gamerbooker.app.preview`, version `1.0.0`/code `1`, installed with replacement mode at local `2026-11-07 05:13:00`, followed by catalog/registration/keyboard inspection. Recorded APK SHA-256: `0362CB1E77F18F745E4DE14A243B756A22863D64DD9F095A2770B27D88D043E4`. It explicitly records **no submitted account, booking, or payment** for that check. Do not reuse this hash as proof of a new build.
- Prior checks record an authorized Huawei device, API health/catalog success and USB reversals for ports 3000/8787. Device authorization, foreground app, service state, and forwarding were **not rechecked for this handoff**. Preview server journeys and owner reports are not evidence of the production Flutter/server payment flow.

## Dependency-ordered roadmap and acceptance gates

Each row is unfinished unless evidence below is added after an actual run. Work in bounded slices; finish a writer's slice before separate verification and independent review. Keep this table and a short evidence log current, including working directory, command, exit result, inspected artifact, and unresolved findings.

| Step / dependency | Deliverable | Acceptance gate |
|---|---|---|
| 0 — before edits | Inventory the dirty tree, all relevant untracked files, applicable instructions, OpenCode's actual agents/models/permissions, SDK/toolchain, and safe test environment. Diagnose the interrupted Flutter checkout. | Written baseline and bounded file scope; actual analyzer/test/build diagnostics collected. Fix manifest/lock/native setup, `LiveCatalogApp` injection, interface/test-double contracts, and coordinator/UI integration coherently. Do not just delete the gateway to hide the mismatch. No unowned changes lost. |
| 1 — after 0 | Secure authoritative solo payment lifecycle, including intent/status endpoints and all confirmation paths. | Disposable-DB tests prove missing/foreign/pending/failed/wrong-amount/wrong-currency/wrong-tenant/wrong-hold/reused intent rejection, owner replay, no booking on negative cases, one booking/capture under duplicate and concurrent calls, and server-computed integer amounts. No client callback can mark payment captured. Preserve availability exclusion constraints, ownership checks, audit/outbox and policy snapshots. |
| 2 — after 1 | Reliable PSP webhook, failure/expiry/refund/reconciliation lifecycle. | Signed raw-body verification, invalid/missing/replayed/stale event handling, stable event IDs, duplicate/concurrent idempotency, out-of-order state safety, amount/currency/provider scoping, refund-event mapping and append-only ledger are reviewed/tested. A late capture after hold expiry/release creates the appropriate refund/reconciliation work and **never revives a booking**. Crash-after-capture and uncertain-network cases reconcile without a double charge, booking, refund, or stock movement. Use sandbox/fakes and recorded synthetic events. |
| 3 — after 1–2 | Flutter booking/payment journey from the live catalog. | Customer auth/verification/MFA → venue/resource/time selection → server quote → hold with expiry → native test-mode payment → authenticated server capture status → idempotent confirmation works in client/coordinator/widget tests. Enforce server venue policy for deposit/full/zero-upfront and remaining payment methods. Show explicit unavailable/error/pending/expired/cancel/retry states. Never infer “paid” from the sheet returning. Preserve uncertain payments for reconciliation; no premature hold release after an ambiguous outcome. |
| 4 — after 3 | Flutter real reservations, pass/QR, cancellation, balance and bar ordering. | Show the reservation tab only after a cafe is selected. Read real customer bookings and booking state; successful booking opens its pass in `PENDING_CHECK_IN`, with server public code/rolling QR and refresh expiry. Staff scan checks in/activates the pass and starts the actual timer; late check-in preserves the booked end time. The bar tab is available only for an `ACTIVE`, checked-in pass; the backend must enforce an owned active pass/booking for bar orders. Customer cancellation is allowed only until the venue-configured cutoff snapshotted at booking (inclusive), and is rejected after cutoff or check-in; show applicable refund/pending outcome and retry safely after restart or lost response. Live menu/cart/order/fulfillment and stock/error states use authenticated scoped APIs and appear in the venue's bar board. Repeated taps and retries cannot duplicate orders. Ownership denial, expired/tampered QR, offline/reconnect and accessibility/keyboard states are covered. No demo object becomes a real pass. |
| 5 — may inspect in parallel; integrate after 1–4 | Complete company dashboard linking and tenant journey. | Approved company enters `/dashboard`; initial venue setup/configuration/publication remains in local `/admin`. Company `/dashboard` provides operational venue-specific tools and explicitly delegated controls: operating bookings, check-in, balances, bar, and the venue-configured customer cancellation cutoff. Server-derived venue/name/role and logout work; connect these sections through actual scoped APIs. Company signup -> local admin decision and initial configuration/publication -> owner MFA/access -> discovery works; companies cannot self-approve. Clearly identify unavailable capabilities; no mock fallback/demo role switcher. All delegated actions obey server roles, CSRF and object scope. Include pending/rejected/suspended company states. |
| 6 — after 1–5 | Automated integrated tenant and financial verification. | Use a disposable tenant/database with synthetic company/customer/staff accounts. Prove company signup -> local `/admin` approval and initial venue setup/configuration/publication -> discovery -> cafe selection showing the reservation tab -> Flutter/API booking/payment opening a `PENDING_CHECK_IN` pass -> correct company's operational `/dashboard` visibility -> staff QR/public-code scan activating/checking in the pass and starting its actual timer -> allowed balance settlement -> bar fulfillment. Company `/dashboard` exposes operational venue-specific tools and explicitly delegated controls (bookings, check-in, balances, bar, venue-configured customer cancellation cutoff); companies cannot self-approve. Verify late check-in keeps the booked end fixed, bar tab availability only for an `ACTIVE` checked-in pass, backend rejection of bar orders without an owned active pass/booking, and cancellation/refund on a separate eligible booking only until the venue-configured snapshotted cutoff (inclusive), with cancellation rejected after cutoff or check-in. A second tenant cannot read/mutate those objects; staff cannot create a customer booking. Assert booking/claims/payment/ledger/audit/outbox/order/stock state, not screenshots alone. |
| 7 — after each slice; full gate after 6 | Quality and independent evidence. | Focused tests pass first, then root typecheck/lint/full tests/builds and Flutter analyze/full tests/debug APK. Map P0 T-001…T-030 and required concurrency/fault/DST cases to real results in `docs/10-testing/01-test-strategy-and-acceptance.md`. No skipped P0 is a pass, no security guard is weakened to fit an old fixture, and no unresolved Severity-1/2 defect is hidden. Separate verifier and reviewer inspect actual files/contracts/results. Record failures and limitations honestly. |
| 8 — after software gates; private prerequisites may be prepared earlier | Production Android signing and environment configuration. | Owner provides keystore/private configuration through a secure local mechanism; release config explicitly uses the intended key and never falls back to debug. Pin/review resolved dependencies and native Stripe requirements. Use a trusted owner-approved HTTPS API origin, correct app ID/version and environment-matched publishable key; keep server/private/webhook/MFA/QR secrets outside the app/source/chat. Verify missing required config fails closed and production does not inherit local admin/debug/demo access. A signing-certificate inspection proves the resulting APK uses the expected release certificate. No public launch is needed for this gate. |
| 9 — after 7–8 for release acceptance | Fresh Android artifact, Huawei install and manual UAT. | Record build command/configuration names (no secrets), hash, package/version/certificate and source baseline. Recheck the authorized device and install the intended artifact without clearing existing preview data. Inspect actual Flutter activity; user completes auth, booking/test payment, pass/QR, dashboard check-in/balance/bar, cancellation and recovery on isolated acceptance data. Record observed successes/failures and owner acceptance. A preview install or old APK is insufficient. |
| 10 — after all above | Concrete local release decision and final handoff. | Every gate has evidence or a named unresolved blocker; owner signs off device/UAT and external legal/platform requirements. Report artifact location, certificate fingerprint, approved API environment, limitations and rollback/install plan. Do not commit, push, publish, deploy, open a tunnel, or launch a public service without explicit approval. |

Payment mode is not settled by this handoff. The older end-to-end record leaves a product preference open. First inspect current policy/spec and the owner's latest instruction; following a venue's configured due-now amount and allowed balance methods is the proposed baseline, not a new authorization to change payment policy.

## Evidence log — 2026-11-08 local UAT run

Working directory `D:\Proiecte\GamerBooker_Enterprise_v1.0`. Shell: Git Bash on Windows. All results below were produced by actual runs today; nothing is carried over from the historical checkpoints. The UAT API ran as `PORT=3000 API_HOST=127.0.0.1 NODE_ENV=development` against the disposable database `gamerbooker_test_uat1794103287` (never `gamerbooker_dev`). `psql.exe` is unusable on this machine (`libintl-9.dll` missing), so every database assertion was read through Node + the repo `pg` client.

### Software gates (re-run on the current tree)

| Command | Working dir | Exit | Result |
|---|---|---|---|
| `npm run typecheck:all` | root | 0 | no diagnostics |
| `npm run build` | root | 0 | build emitted |
| `npx jest --runInBand` | root | 0 | 45/45 suites, 564 passed, 4 todo, 568 total, ~118 s |
| `npm run lint` | root | 1 | 711 errors, 0 warnings — pre-existing `@typescript-eslint/no-explicit-any` debt (668 across 60 files); baseline before this run was 717, so no new lint defect. Gate still red. |
| `flutter analyze` | `apps/flutter-mobile` | 0 | No issues found |
| `flutter test` | `apps/flutter-mobile` | 0 | 36/36 tests passed |
| `flutter build apk --debug` | `apps/flutter-mobile` | 0 | debug APK produced (see artifact below) |
| `flutter build apk --release` | `apps/flutter-mobile` | 1 | correctly refused: release-signing guard requires `android/key.properties` + keystore; no `*release*.apk` was produced. This is the intended fail-closed behaviour, not a missed build. |

### Artifact inspected

- Path: `apps/flutter-mobile/build/app/outputs/flutter-apk/app-debug.apk`
- Size 150,508,088 bytes; SHA-256 `22b01e25e10c67954532dbe98930a28a695ecde08cf204ba0eec18c2347b0552`
- `aapt2 dump badging`: package `ro.gamerbooker.app.preview`, versionCode 1, versionName 1.0.0, compileSdk 36, targetSdk 34
- `apksigner verify --print-certs`: `CN=Android Debug` (SHA-256 `aff81b442f55b37e199fefcf8a152adb579de793dac77f2b7756f4bcc7dc5048`) — **debug-signed, therefore not a production artifact**.

### Device and install

- `adb devices` → `CNXNU20922109640  device` (the authorized Huawei).
- Existing reverse mappings preserved and re-listed: `usb tcp:8787 tcp:8787`, `usb tcp:3000 tcp:3000`.
- Install used `adb push` to `/data/local/tmp` with SHA-256 compared on both sides, then EMUI confirmation dialogs tapped. No uninstall, no `pm clear`, no broad reversal removal: preview app data and preview services untouched.

### Acceptance data (disposable database)

- Owner `21f675a4-9e04-40aa-b7da-3f39e40befb1`, role OWNER, TOTP enrolled (secret readable only with the disposable `MFA_SECRET_KEY`).
- Default policy `e97560a2-5a3d-4aad-b4f2-1299026191cf`: `prepaid_mode=DEPOSIT`, `deposit_percentage=40`, `free_cancellation_hours=3`, `late_cancellation_penalty_percent=20`, `deposit_mode_settlement=ONLINE_OR_RECEPTION`, `slot_granularity_minutes=15`, `min/max_duration_minutes=60/360`.
- 7 operating schedules, 4 price rules (VENUE_DEFAULT + 3 resources at 5000 minor RON/hour), 3 bookable resources.
- Customer `uat-customer@example.test`, registered 201, email-verified, mobile login 200 (`mfa_required=false`).

### Customer client journey (Flutter preview on the Huawei)

1. Login through the app UI succeeded (screenshot `18-state.png`, `19-login-filled.png`, `20-logged-in.png`).
2. Venue page shows live availability for 7 days (screenshots `04`–`13`).
3. Server quote rendered: `Total 50.00 RON · de achitat acum 20.00 RON` — the 40% deposit is computed server-side, not by the client (`21-quote.png`).
4. Tapping `Confirmă rezervarea` refused with `Plata online nu este configurată în această versiune a aplicației.` (`22-confirm-refused.png`). Database after the tap: `price_quotes=2`, `holds=0`, `bookings=0`, `payment_intents=0` — the app creates no server object when payment is unavailable.

### Server-side payment lifecycle (real HTTP API)

| Case | Result |
|---|---|
| Quote PC#1 2 h | 201, `total_minor=10000`, `due_now_minor=4000`, `balance_minor=6000` |
| Hold for that quote | 201, status ACTIVE |
| Confirm with no intent | **409 `PAYMENT_REQUIRED`**, no booking row |
| Second hold on the same window | **409 `RESOURCE_UNAVAILABLE`** |
| Sandbox intent in PENDING + real HMAC-SHA256 signed webhook to `/v1/webhooks/payments/sandbox` | 200 `PROCESSED`, intent flipped to `CAPTURED` |
| Confirm with the captured, correctly-metadata'd intent | **201**, booking `ea66483f-39a8-439d-9d5b-f250ff26766b`, `public_code GB-YQMPQM`, `CONFIRMED`, paid 4000 / balance 6000, `qr_token` length 304, intent linked to booking |
| Intent missing `metadata.customer_id` | **409 `PAYMENT_NOT_CAPTURED_OR_MISMATCHED`** — the guard was kept, the fixture was corrected |

### Staff journey

- Dashboard login 200 with `mfa_required=true`; `/v1/auth/mfa/verify` 200; `/v1/me` returns the OWNER membership.
- Check-in 2 h before the window: **400 `CHECKIN_TOO_EARLY`** (15-minute window enforced).
- Balance settlement 6000 CASH under `ONLINE_OR_RECEPTION`: **201**, receipt `61d0eb42-d4b3-4f2a-a5f9-c24046a149e6`.
- Successful check-in: opened today via a schedule exception (00:00–23:59), booked PC#2 07:00–08:00Z, sandbox-captured, confirmed as `GB-NQDCVZ`, scanned at the counter: **201 `CHECKED_IN`** with `redeemed_at`, one `checkins` row, audit `CHECKED_IN`. Re-scan: **409 `ALREADY_CHECKED_IN`**.

### Cancellation and refunds (separate bookings, snapshotted policy)

- Late cancellation, start < 3 h away (`GB-43RGPV`, paid 2000): **201 `LATE_WITH_PENALTY`**, penalty 400 (20%), refund 1600, refund row `REQUESTED`.
- Free cancellation, start > 3 h away (`GB-J8F7GT`, paid 2000): **201 `FREE`**, penalty 0, refund 2000, refund row `REQUESTED`.
- Availability after cancellation shows the released PC#1 window again, so claims are actually freed.

### End-state assertions in the disposable database

`users=6, bookings=4 (1 CHECKED_IN, 2 CANCELLED, 1 CONFIRMED), checkins=1, payment_intents=5 (5 CAPTURED), refunds=2, offline_receipts=1, audit_events=50, outbox_events=14`. No booking, capture or refund was produced by a client callback.

### P0 T-001…T-030 mapping (suite-level, full `npx jest --runInBand` green)

`docs/10-testing/01-test-strategy-and-acceptance.md` is the spec and stays read-only for this role, so the mapping is preserved here for the owner/scribe to fold into that document. "Covered" means a named passing test asserts the invariant; "partial" means the mechanism is asserted but not the exact row; "gap" is an honest hole.

| ID | Verified by today's run |
|---|---|
| T-001 | Covered — `eng104` "concurrent hold requests on identical resource produce exactly 1 hold and 1 409 conflict"; live UAT duplicate hold returned 409 `RESOURCE_UNAVAILABLE` |
| T-002 | Covered — `eng104` parent/child hold blocking in both directions; `eng004` exclusion constraints |
| T-003 | Covered — `eng001-t01-br011-exclusion` "adjacent half-open allocations [10,11) and [11,12) are both accepted" |
| T-004 | Covered — `eng302` "expires group booking, releases hold, and initiates compensating refunds for paid participants" |
| T-005 | Covered — `eng005` "safely deduplicates replayed webhook events"; `eng504` "ignores duplicate webhook event without double credit" |
| T-006 | Covered — `eng302` "rejects resurrecting expired group booking and immediately refunds late capture" |
| T-007 | Covered — `eng103` due-now/balance split; `eng106` DEPOSIT checkout; live UAT 40% deposit (5000 -> 2000 due) |
| T-008 | Covered — `eng301` equal splits incl. penny remainder across 5; `eng302` confirm when all paid |
| T-009 | Covered — `eng304` "refunds online capture when desk staff already collected balance in full" |
| T-010 | Covered — `eng102` "creates an immutable policy snapshot that does not change when venue policy is modified" |
| T-011 | Covered — `eng102` zone/resource override resolution; `eng207` pricing-policy preview |
| T-012 | Covered — `eng205` layout publish/rollback; `eng203` multi-room scene revision |
| T-013 | Covered — `eng205` publish gate blocked; `eng202` resource CRUD with future claims |
| T-014 | **Gap** — no test asserts that moving a visual object leaves booking references unchanged (revisions exist, the invariant is not pinned) |
| T-015 | Covered — `eng504` "across 8 concurrent checkouts for a 3-unit stock, exactly 3 succeed and 5 fail" |
| T-016 | Covered — `eng504` "concurrent handoffs on the same order result in a single stock deduction"; `eng403` handoff |
| T-017 | Covered — `eng106` "rejects cross-venue QR scan (403 VENUE_MISMATCH)" |
| T-018 | Covered — `eng003` cross-tenant read/patch/list/create denials (404) |
| T-019 | Covered — `eng103` "detects tampering when total_minor or due_now_minor is modified"; `eng105` server-derived amounts |
| T-020 | Partial — self-booking through the customer API is covered (`eng106`); absence of a staff-create route is structural, not pinned by a dedicated negative test |
| T-021 | Covered — `eng304` "rejects online balance payment if venue policy requires RECEPTION_ONLY settlement" |
| T-022 | Covered — `eng106` "refuses desk settlement when the venue policy is ONLINE_ONLY (400 ONLINE_SETTLEMENT_ONLY)" |
| T-023 | Covered — `eng107` free cancellation >= 3 h (100% refund, claims released); live UAT free cancel 2000 -> 2000 refund |
| T-024 | Covered — `eng107` late cancellation with snapshotted penalty; live UAT late cancel 2000 -> 400 penalty / 1600 refund |
| T-025 | Covered — `eng504` "T-025: blocks quote for missing local hour on spring-forward Sunday" |
| T-026 | Covered — `eng504` "T-026" duplicate-hour rejection and explicit-offset acceptance |
| T-027 | Covered — `eng401`/`eng403`/`eng404` age verification and age-refusal refunds |
| T-028 | Partial — staff booking-create has no route to call (fail-closed by absence) and venue scoping is pinned in `cafe-access`; no dedicated "staff cannot create" assertion |
| T-029 | Covered — `eng504` "T-029: reconciler detects orphaned payment intent after crash"; `eng305` refund retry/manual review |
| T-030 | **Gap** — the duplicate offline reference is enforced by a DB unique constraint but the `23505` is not translated to a domain error and no test pins "no duplicate receivable credit" (the `eng504` test with that label covers receipt-void concurrency, not duplicate references) |

### Roadmap step mapping

- Step 1 (solo payment lifecycle): proven negatively and positively against the real API; disposable-DB suites cover the remaining rejection matrix.
- Step 2 (webhook): raw-body requirement + signed sandbox delivery + duplicate/replay handling proven; reconciliation/crash-after-capture cases still suite-only.
- Step 3 (Flutter journey): quote/hold UI and fail-closed payment proven on device; native PaymentSheet still blocked (no test publishable key, no authorized public webhook delivery).
- Step 6 (integrated financial verification): server-side journey complete on synthetic data (booking → pass → check-in → balance → cancellation/refund). Bar/order fulfilment not exercised in this run.
- Step 7: typecheck/build/jest/Flutter green; lint red for pre-existing debt; the T-001…T-030 mapping is recorded above (2 gaps: T-014, T-030) and still has to be folded into `docs/10-testing/01-test-strategy-and-acceptance.md` by the spec owner.
- Steps 8–10: blocked/no evidence — see below.

### Limitations, observations and residual risks

- **Native Stripe PaymentSheet end-to-end is blocked.** The APK carries no publishable test key and no public tunnel is authorized, so the app's payment-unavailable path is the correct observed behaviour; the server lifecycle was proven with the sandbox PSP instead.
- **Production signing is blocked** until the owner supplies a keystore via a secure local mechanism plus an owner-approved trusted HTTPS API origin and an environment-matched Stripe test publishable key.
- Lint gate is red on pre-existing `no-explicit-any` debt (711) and was not "fixed" by weakening rules.
- `docs/10-testing/01-test-strategy-and-acceptance.md` still lacks the P0 T-001…T-030 result mapping; T-014 (visual move only) and T-030 (duplicate offline reference) have no direct test. The `23505` unique-violation on duplicate offline receipts is not translated into a domain error yet (generic 500 envelope).
- Observations to triage, not judged defects: availability interprets `operating_schedules.open_time` as UTC, so a 10:00 schedule renders as 12:00 in Europe/Bucharest; `createOnlineBalanceIntent` derives its idempotency key from `Date.now()`; `createSoloPaymentIntent` hardcodes RON.
- The 13 closed legacy routes remain deliberately fail-closed (`ClosedLegacyGuard` → 404) and their tests pin that closure; reopening needs explicit owner approval.
- A stray unlinked `CAPTURED` sandbox intent (`sbx_pi_uatmanual1794124522`) existed only in the scratch database and was removed with it during teardown.

## Local commands to resume and verify

Commands below are **instructions for a future run**, not results from this handoff. Shell is PowerShell. Confirm effective agent permissions first. `Get-Command` currently resolves Flutter to `C:\flutter\bin\flutter.bat`, ADB to `C:\platform-tools\platform-tools\adb.exe`, Java to the installed Microsoft JDK 17, Node/npm, and OpenCode to the user's npm installation. Existence is not a tool health or version check.

### 1. Inspect before editing — workspace root

Working directory: `D:\Proiecte\GamerBooker_Enterprise_v1.0`.

```powershell
Set-Location -LiteralPath 'D:\Proiecte\GamerBooker_Enterprise_v1.0'
git status --short --untracked-files=all
git diff --stat
git diff -- src/bookings src/payments tests/eng105-booking-confirmation.spec.ts tests/eng106-solo-checkout-and-qr.spec.ts apps/flutter-mobile
git ls-files --others --exclude-standard -- apps/flutter-mobile apps/venue-dashboard handoff
Get-Content -LiteralPath 'opencode.json'
Get-Content -LiteralPath '.opencode/agents/thinker.md'
Get-Content -LiteralPath '.opencode/agents/implementer.md'
Get-Content -LiteralPath '.opencode/agents/tester.md'
Get-Content -LiteralPath '.opencode/agents/reviewer.md'
Get-Content -LiteralPath '.opencode/agents/scribe.md'
Get-Content -LiteralPath 'handoff/HANDOFF-PRODUCTION-RELEASE-2026-11-07.md'
Get-Content -LiteralPath 'apps/flutter-mobile/lib/main.dart'
Get-Content -LiteralPath 'apps/flutter-mobile/lib/catalog/catalog_app.dart'
Get-Content -LiteralPath 'apps/flutter-mobile/lib/catalog/catalog_client.dart'
Get-Content -LiteralPath 'apps/flutter-mobile/lib/catalog/payment_gateway.dart'
Get-Content -LiteralPath 'apps/flutter-mobile/lib/catalog/stripe_payment_gateway.dart'
Get-Content -LiteralPath 'apps/flutter-mobile/lib/catalog/reservation_checkout.dart'
Get-Command flutter, dart, adb, java, node, npm, opencode
```

Read the listed untracked files, applicable `AGENTS.md`/skills and actual Git diff; do not stop at the filenames. Do not dump environment variables, private config or the contents of secret files. A denied inspection action should be done by an appropriately authorized coordinator/read-only role, not disguised to evade the restriction.

OpenCode launch from the same root (after reading its effective configuration):

```powershell
opencode --help
opencode
```

Use the installed client's model/agent inventory to select real available roles. No inventory/help/launch command was run for this handoff; installed CLI/config files do not prove authentication or provider/model availability.

### 2. Diagnose/finish Flutter, then verify — Flutter directory

Working directory: `D:\Proiecte\GamerBooker_Enterprise_v1.0\apps\flutter-mobile`.

```powershell
Set-Location -LiteralPath 'D:\Proiecte\GamerBooker_Enterprise_v1.0\apps\flutter-mobile'
flutter --version
flutter doctor -v
flutter pub get --offline
flutter analyze
flutter test test/catalog_client_test.dart test/catalog_widget_test.dart
```

Stop on a failed dependency resolution; do not treat subsequent diagnostics from stale package metadata as a clean baseline. If the required version is absent from the local cache, review the exact dependency change and permitted package access before running `flutter pub get` online. Inspect its resulting lock and generated-file diff. Verify compatibility rather than silently downgrading the requested Stripe package.

If the wrapper stalls, inspect its own running process and SDK lock ownership before retrying. The historical lock diagnosis is not conclusive. Do not delete SDK lock/cache files, terminate unrelated processes, widen permissions, or retry through an approval rejection as a workaround. Capture the real cause and request only the concrete permission needed, if any.

After implementation and targeted checks, in the same directory:

```powershell
flutter analyze
flutter test
flutter build apk --debug
Get-FileHash -Algorithm SHA256 -LiteralPath 'build/app/outputs/flutter-apk/app-debug.apk'
```

Add focused coordinator/payment/error/recovery/pass/cancel/bar tests as those slices are implemented; the two current catalog test files are not sufficient release coverage. A build succeeding without a Stripe key can only prove the explicit payment-unavailable path. It does not prove native payment acceptance.

### 3. Backend/integration and web gates — workspace root

Before running any DB suite, inspect `tests/support/auth-harness.ts` and every additional suite's setup/cleanup. The shared harness currently generates `gamerbooker_test_<suffix>_<random>` databases, creates/drops only that generated DB, and runs application queries as `gamerbooker_app`. Its default admin endpoint is local PostgreSQL on **5433**; environment overrides can change the administrative connection. Securely verify those overrides target an isolated disposable test instance, never a working/production database. Do not print DSNs or copy protected runtime config. Use sandbox/fake PSP and no live charge credentials.

Working directory: `D:\Proiecte\GamerBooker_Enterprise_v1.0`.

```powershell
Set-Location -LiteralPath 'D:\Proiecte\GamerBooker_Enterprise_v1.0'
npm test -- --runInBand tests/eng005-psp-integration.spec.ts tests/eng105-booking-confirmation.spec.ts tests/eng106-solo-checkout-and-qr.spec.ts
npm test -- --runInBand tests/eng107-compensating-lifecycle.spec.ts tests/eng304-online-balance-and-receipt-ledger.spec.ts tests/eng305-refund-lifecycle-and-reconciliation.spec.ts
npm test -- --runInBand tests/cafe-access.spec.ts tests/shared-venue-discovery.spec.ts tests/eng003-multi-tenant-venues.spec.ts tests/eng201-venue-setup-and-staff.spec.ts
npm test -- --runInBand tests/eng401-menu-catalog-and-stock.spec.ts tests/eng402-cart-checkout-and-preorders.spec.ts tests/eng403-bar-board-and-handoff.spec.ts
npm run typecheck:all
npm run lint
npm test -- --runInBand
npm run build:all
git diff --check
```

Run the relevant focused group after each slice; run the full gate once the slice tests pass. These commands refer to existing scripts/files. Record each exit status immediately (`$LASTEXITCODE` for native commands), failures and test counts; do not let a later successful command hide an earlier failure. Update fixtures only where current contracts/spec justify it. Never weaken MFA/CSRF/RBAC/ownership checks or remove financial assertions to recover a green run.

For an isolated frontend retry, exact commands from the root are `npm --prefix apps/venue-dashboard run build` and `npm --prefix apps/mobile-app run build`. A Windows esbuild process-permission failure must be reported separately from a TypeScript/product defect. Request a narrow retry only when justified and permitted; do not claim `build:all` passed because a component build passed.

### 4. Local service/UAT preparation — inspect before starting anything

The current dashboard Vite config binds loopback port 5173, proxies `/v1` to `http://127.0.0.1:3000`, and loads HTTPS certificate/key paths from `DASHBOARD_TLS_CERT` / `DASHBOARD_TLS_KEY` when both are configured. Backend `src/main.ts` reads `API_HOST`, `PORT`, and `NODE_ENV`; development mode requires loopback. Do not start a second service, kill an existing listener, repoint the working API to a scratch database, or reuse working data for UAT.

Read-only preparation from the root:

```powershell
Get-NetTCPConnection -State Listen -LocalPort 3000,5173 -ErrorAction SilentlyContinue
adb devices -l
adb -s CNXNU20922109640 reverse --list
adb -s CNXNU20922109640 shell dumpsys package ro.gamerbooker.app.preview
adb -s CNXNU20922109640 shell dumpsys activity activities
```

The serial comes from historical device evidence; use it only if the fresh inventory identifies the same authorized phone. Confirm that the intended API/dashboard session uses disposable acceptance data. Once an isolated environment, free loopback ports, private runtime config, trusted browser HTTPS and matching dashboard proxy/CORS are prepared, the existing launch commands are `npm run start:dev` from the root and `npm --prefix apps/venue-dashboard run dev` from another root terminal. Do not run them against unknown inherited configuration. `tools/local-auth/start-api.cjs` is an existing local launcher tied to the development database; it is not a disposable-UAT shortcut.

### 5. Huawei preview install — only after a fresh verified debug build

Working directory: `D:\Proiecte\GamerBooker_Enterprise_v1.0\apps\flutter-mobile`.

```powershell
adb devices -l
Get-FileHash -Algorithm SHA256 -LiteralPath 'build/app/outputs/flutter-apk/app-debug.apk'
adb -s CNXNU20922109640 install -r build/app/outputs/flutter-apk/app-debug.apk
adb -s CNXNU20922109640 shell am start -n ro.gamerbooker.app.preview/ro.gamerbooker.app.MainActivity
adb -s CNXNU20922109640 shell dumpsys package ro.gamerbooker.app.preview
adb -s CNXNU20922109640 shell dumpsys activity activities
```

A debug loopback connection may require `adb -s CNXNU20922109640 reverse tcp:3000 tcp:3000`, **only after confirming that this endpoint is the intended isolated acceptance API and recording existing mappings**. Preserve the existing preview service/mapping and app data; no uninstall, `pm clear`, or broad reversal removal. PaymentSheet/webhook acceptance still needs a safe test-mode delivery plan without creating a public tunnel. If that cannot be supplied locally, record the integration gate as blocked rather than faking captured payments in the app.

### 6. Release build — blocked until signing/API gates are satisfied

Do not run a release build as production evidence while Gradle still signs it with the debug key. After explicit release signing is implemented and privately provisioned, set nonsecret build values in the local shell. This template intentionally contains no real key or origin:

```powershell
Set-Location -LiteralPath 'D:\Proiecte\GamerBooker_Enterprise_v1.0\apps\flutter-mobile'
$releaseApiOrigin = 'https://REPLACE-WITH-OWNER-APPROVED-API-ORIGIN'
$stripeTestPublishableKey = 'pk_test_REPLACE_WITH_APPROVED_TEST_PUBLISHABLE_KEY'
flutter build apk --release --dart-define="GAMERBOOKER_API_BASE_URL=$releaseApiOrigin" --dart-define="GAMERBOOKER_STRIPE_PUBLISHABLE_KEY=$stripeTestPublishableKey"
Get-FileHash -Algorithm SHA256 -LiteralPath 'build/app/outputs/flutter-apk/app-release.apk'
```

Replace the two placeholders before use; they are not configuration supplied by this handoff. Pass only a publishable key to Flutter. A trusted internal HTTPS origin is acceptable for private acceptance; this does not authorize a domain/tunnel/public launch. Using test payment credentials for acceptance must remain explicit.

Resolve the installed Android build-tools `apksigner.bat` path first, then run `& $apksignerPath verify --verbose --print-certs build/app/outputs/flutter-apk/app-release.apk` with `$apksignerPath` set to that verified local path. Compare the certificate fingerprint to the owner's expected release certificate. The exact build-tools version/path was not inspected here. Do not expose a keystore password/private key in the command, logs, source or chat. Release application ID is currently `ro.gamerbooker.app`; debug uses `.preview`, so recheck package/activity and existing certificate compatibility before any release install. No verified production-signed artifact is claimed.

## Safety and decision guardrails

- Preserve all pre-existing dirty/untracked work. No reset, clean, checkout/restore, stash, deletion, broad format/rewrite, or replacement of another task's files. Baseline relevant files before a small scoped change; review the resulting diff and generated artifacts. Do not commit/push unless explicitly approved.
- Use disposable databases/tenants for automated tests and acceptance transactions. Never drop/reseed/reset the working development or production DB, reuse live accounts, or change admin grants/passwords to make a fixture pass. Keep synthetic data and test-only roles isolated.
- The server is authoritative for prices, policies, money, identity, ownership, tenant scope, holds, booking state and order stock. A successful native sheet or client-supplied ID is not payment proof. Never add a “mark paid” shortcut or staff-create-booking route. Preserve append-only financial history and anti-overlap constraints.
- No real Stripe charges. Use fake/sandbox adapters and synthetic signed payloads for automation. If native Stripe test-mode acceptance requires access/configuration that is not available, report that exact gap. Do not silently switch to live keys or a paid provider.
- No secrets/private keys/keystore passwords/session tokens/customer PII in chat, source, docs, command history or logs. Ask for a secure local file path/credential store/injected environment, using approved tooling and restrictive permissions. Avoid reading secret values; check presence and behavior without echoing them. Payment client secrets remain sensitive even though a Flutter publishable key is public.
- Do not weaken local-admin boundary, auth verification, MFA, CSRF, RBAC or release HTTPS rules. Local approval-only registration/admin modes are not production security defaults. Check QR/MFA/webhook/private signing key provisioning and fail-closed startup for required production secrets.
- Do not delete Flutter SDK locks/caches or modify global SDK/toolchain/configuration to bypass a stall. Do not bypass an automatic approval rejection or expand filesystem/network/agent permissions without an actual authorized resolution.
- No domain/DNS/tunnel/Cloudflare/public service, publication, deployment or store submission. Produce a concrete local artifact and evidence for owner review first. Debug signing never counts as production signing.
- Preserve existing device app data, preview services and reverse mappings. Human-entered credentials stay on the phone/browser. Manual UAT must identify the real Flutter app and the correct isolated tenant/environment.

## OpenCode configuration facts and role preferences

Read the actual effective configuration before delegating. Current `opencode.json` describes implementer/tester/scribe/reviewer permissions; `.opencode/agents/` also defines thinker. All five agent Markdown files currently name `hcnesc/DeepSeek-V4-Pro#high`. This is a configuration declaration, not proof that this provider/model is installed, authenticated, available, or serving a request.

The present implementer rules deny Git, network/installs and arbitrary shell; source edit allowances do not include the Flutter/web `apps/**` tree, and Flutter/ADB commands are not explicitly allowed. Scribe permits handoff/notes but denies `docs/**`; reviewer is read-only with no shell. Agent Markdown and JSON restrictions overlap and can differ. Confirm the installed OpenCode version's effective behavior; do not assume a prompt overrides permission enforcement or silently edit its configuration. Route baseline Git inspection through an allowed coordinator. If a concrete required action is blocked, explain the exact rule and request the narrow permitted scope/tool change rather than evading it.

Owner preference remains **Sol for implementation/thinking and Luna for verification**. Use real installed/available roles and models, disclose requested versus client-reported models and failures, and explicitly report unavailable Sol/Luna/Astra roles. Do not pretend a role/model ran, independently authenticate an identity from a label, or reproduce stale “unavailable” conclusions from an older Codex session as current OpenCode facts. Follow applicable supervisory instructions and current owner authorization; where Astra supervision is required and no authorized exception applies, report its actual unavailability and leave a checkpoint. This documentation worker was assigned the requested Sol role; model labels are client reports, not independent authentication.

## Paste-ready prompt for OpenCode

```text
Continue the existing GamerBooker Enterprise v1.0 production-readiness work in:
D:\Proiecte\GamerBooker_Enterprise_v1.0

Read handoff/HANDOFF-PRODUCTION-RELEASE-2026-11-07.md first. Complete its dependency-ordered roadmap through a verified local Android release candidate and Huawei manual UAT, leaving public launch out of scope. Do not claim the project is production-ready until its gates have real evidence.

FIRST, BEFORE EDITING:
1. Inspect git status --short --untracked-files=all, git diff/stat, all relevant new/untracked files, and applicable AGENTS.md/skills. Preserve every pre-existing dirty/untracked file and record a baseline for your bounded scope. Git diff does not show the untracked lib/catalog files.
2. Read opencode.json and every .opencode/agents/*.md file, inspect the installed client's actual effective permissions/model/agent inventory and report auth/availability failures. The stored agents currently name hcnesc/DeepSeek-V4-Pro#high and contain restrictions that may block apps/** writes, Git, Flutter/ADB, installs/network and docs edits. Do not bypass them or silently rewrite config. Use an authorized coordinator for allowed read-only inspection, and request only a concrete narrow permission adjustment if a required action is blocked.
3. Preserve the owner's preference: Sol thinks/implements and Luna verifies when actually available. Use actual installed OpenCode agents/models under the current authorization; disclose requested vs client-reported model, and report unavailable Sol, Luna or required Astra supervision explicitly. Do not role-play an unavailable model, claim independent identity authentication, silently substitute a model, or treat old Codex availability reports as current. Follow applicable supervisor policy/owner exceptions, with one bounded writer, then a separate verifier and different independent reviewer whenever those roles are available/required. Report a blocked role honestly.
4. Diagnose the interrupted checkout using current files and ACTUAL tool output. pubspec.yaml declares flutter_stripe ^14.2.0 but the lock lacks Stripe packages; main.dart passes paymentGateway to LiveCatalogApp although its constructor currently accepts only source; catalog_widget_test's _Source lacks the newly added payment methods. New gateway/coordinator/client code and the authenticated hold-payment status route exist but are unverified. Inspect all native setup and actual analyzer/test/build errors; don't treat these source observations as a complete compiler error list.

IMPLEMENT IN SMALL COHERENT SLICES:
- Stabilize dependency resolution, native Android PaymentSheet compatibility, dependency injection, interfaces/test doubles and UI wiring, preserving existing customer signup/login/MFA/catalog behavior.
- Finish server-authoritative quote/hold/intent/signed-webhook/capture/confirmation. Prove ownership/tenant/venue/hold/amount/currency matching, idempotent retries and concurrency. Never trust client payment success. Cover expiry/late capture/refund/reconciliation/crash recovery and append-only ledger state. No booked slot may be revived after expiry by a late payment.
- Complete Flutter booking/payment, real booking list and pass/rolling QR, policy-eligible cancellation/refund, balances and real bar ordering. Show the reservation tab after cafe selection; successful booking opens its pass in PENDING_CHECK_IN. Staff scan activates/checks in the pass and starts the actual timer; late check-in keeps the booked end time fixed. Show the bar tab only for an ACTIVE checked-in pass, and enforce owned active pass/booking eligibility for bar orders on the backend. Allow customer cancellation only until the venue-configured cutoff snapshotted at booking (inclusive); reject it after cutoff or check-in. Handle unavailable provider, pending/failed/cancelled/uncertain payments, retry/restart and offline states safely. Do not release an uncertain paid hold prematurely or duplicate charges/bookings/orders.
- Keep initial venue setup/configuration/publication in local /admin. Connect company /dashboard operational venue-specific tools and explicitly delegated controls (operating bookings, check-in, balances, bar, venue-configured customer cancellation cutoff) to actual scoped APIs. Companies cannot self-approve. Prove company signup -> local /admin approval and initial configuration/publication -> owner access/MFA -> discovery -> cafe selection/reservation tab -> customer reservation/PENDING_CHECK_IN pass -> company visibility -> staff scan/ACTIVE pass/timer -> balance/bar, plus cutoff-eligible cancellation on a separate booking; verify fixed booked end for late check-in and backend active-pass enforcement for bar, with a second tenant denied throughout. No demo fallback or staff-create-customer-booking shortcut.

VERIFY AND RECORD:
Use the handoff's exact commands and working directories. Inspect DB harnesses/cleanup and privately confirm isolated disposable test connections before any suite; never touch the working DB. Use fake/sandbox PSP and synthetic data; no real Stripe charges. Run relevant targeted backend/client/coordinator/widget tests after each slice, then full typecheck/lint/backend tests/web builds and Flutter analyze/full tests/debug APK. Fix contract-correct fixtures without weakening security or financial assertions. Record exact commands, exits, counts, source/artifact baseline and remaining failures. Old checkpoint passes do not verify the current tree; a stale APK proves nothing about new code.

Keep this handoff's roadmap and a short evidence/checkpoint log updated through an authorized scribe; preserve existing records. Distinguish implemented, tested, independently verified/reviewed and still blocked. If effective permissions forbid a needed record update, report the rule and preserve a resumable output instead of bypassing it.

For release signing/API/test payment configuration, prepare code and a concrete reviewable result first. Request private keys, keystore passwords and server/webhook/MFA/QR credentials only through secure local paths/credential stores/injected environment, never pasted into chat/source/logs. Only a publishable Stripe key may enter Flutter. Never call a debug-signed APK production. Require the owner-approved trusted HTTPS origin and expected release certificate; verify APK signature/hash/version and record evidence.

After software gates and environment checks, recheck the authorized Huawei device, build a fresh intended artifact, preserve preview data/services/reverse mappings, install without clearing data, and exercise manual customer/company/staff UAT against isolated acceptance data. Human credentials stay on phone/browser. No public tunnel may be created to facilitate a webhook. If safe test-mode delivery, private signing material, trusted API or manual UAT is unavailable, report that specific pending gate and stop only the dependent step while completing independent authorized work.

DO NOT commit, push, publish, deploy, launch a public service, change DNS/domain, open Cloudflare/another tunnel, perform real Stripe charges, drop/reset/reseed the working DB, alter existing admin credentials/grants, delete dirty/untracked work, clear device app data, or use debug signing as production. These require separate explicit authorization where applicable. Do not bypass sandbox/approval/configuration restrictions.

Finish with changed paths, actual test/build/review evidence, artifact/package/certificate/hash if available, Huawei/UAT observations, remaining blockers and the exact next action. No invented passes, model identities, reviews, charges, installs, or launch claims.
```

## First next action

Open the workspace in OpenCode, inventory the actual permissions/models and dirty/new files, and obtain current Flutter dependency/analyzer/test diagnostics. Then complete one bounded coherent checkout slice before taking on the remaining roadmap. Preserve this handoff as the durable status/evidence record; do not restart the project or discard the interrupted work.
