# Local company and Android integration checkpoint — 2026-11-06

## Owner request

Continue the five-step local flow: no-code company signup; separate company and admin dashboards; real tenant operations; Android connected to the real backend; and an end-to-end company approval, booking, dashboard, and check-in journey.

## Completed in this continuation

- Confirmed the protected local mode has `enabled: true` and `companySignupApprovalOnly: true`. The API launcher starts only on `127.0.0.1:3000`; `/healthz` returned 200 and unauthenticated `/v1/access/context` returned 401. No account, application, booking, or pass was created or changed.
- Added and verified the temporary Android USB reverse mapping `tcp:3000 -> tcp:3000`; the existing `8787` preview mapping remains. This prepares the phone to reach the local API. The new APK is not installed, so no handset app data was changed.
- The local dashboard split is implemented: `/admin` is for platform approvals/initial setup and `/dashboard` is for authenticated company operations. The company page reads server scoped venue overview, bookings, live floor, check-in queue, and bar orders. Bar transitions call the real scoped endpoints.
- Added a company check-in form that submits either the signed QR token or public code to `POST /v1/dashboard/venues/:venue_id/checkin`, then reloads the live dashboard data. Server role checks remain authoritative; the form is shown only to OWNER, VENUE_MANAGER, and RECEPTION.
- Connected the Flutter app to real venue discovery and the venue availability endpoint. Venue and resource data are parsed strictly; loading, empty, error, and retry states are explicit. No mock fallback is used in the normal app route.
- Added the customer account dialog in Flutter, mobile-kind login, optional TOTP verification, bearer-token logout, and in-memory-only session handling. The account dialog does not store passwords or persist tokens on device.
- Added typed mobile client calls for authenticated quote creation, temporary hold creation, and hold release. These contracts are tested; the UI does not yet initiate them.
- Added a live one-hour quote action to the venue detail page. It requests a quote only for the first available interval and shows total/due-now amounts; the screen does not create a hold or claim the booking is confirmed.
- Updated `apps/flutter-mobile/README.md` with the current live catalog/auth limits and the reversible local API port-forward command.
- Fixed a Flutter `const Semantics` compile error found while running the suite.
- Corrected ENG-106 test setup to use the mobile bearer session for customer booking endpoints and the CSRF header for dashboard cookie mutations. The staff fixture uses RECEPTION, which is an authorized check-in/payment role and does not require an owner MFA fixture.

## Verification

- `npm --prefix apps/venue-dashboard run build`: passed; TypeScript and Vite.
- `npm test -- --runInBand tests/cafe-access.spec.ts tests/eng105-booking-confirmation.spec.ts tests/eng106-solo-checkout-and-qr.spec.ts`: passed, 3 suites / 30 tests, all on disposable test databases.
- `flutter test`: passed, 19 tests, including live-API client contract checks for availability, mobile login, TOTP bearer session, logout, quote, hold, and release, plus a widget flow for login→quote.
- `flutter analyze`: passed, no issues.
- `flutter build apk --debug`: passed after the customer login update. Candidate artifact: `apps/flutter-mobile/build/app/outputs/flutter-apk/app-debug.apk`. It was not installed.
- `GET /v1/venues` on the local API returned the seeded Demo Venue. A read-only availability query for 2026-11-06 returned its three resources with no available windows for that date.

## Still incomplete

- Flutter now supports customer sign-in/MFA, live discovery/availability, and a live quote preview; its typed client can create/release holds but the UI does not yet hold a resource. It does not complete a payment-backed reservation, display the customer’s live pass/QR, or cancel a booking. Do not describe Android booking as integrated.
- The single-booking `POST /checkout/solo` path currently confirms a booking directly and does not create or verify an upfront captured payment intent. A real customer checkout must not call this path as if it represented paid checkout. The backend needs a payment-backed single-booking state/intent/webhook flow before the Android booking can safely confirm and show a pass. Current payment processing has sandbox and balance-payment paths, but no complete single-booking checkout path suitable for this screen.
- Admin and company routing have only build/static and API integration coverage. A real browser session for an approved company has not been exercised.
- The new dashboard QR/public-code input has not been exercised against an actual approved company account in a browser. The API check-in lifecycle is covered by the passing disposable-DB suite.
- No full company signup → admin approval → configured company dashboard → Android reservation → dashboard visibility → check-in run has been executed. No customer account was created and no live booking/pass was made.
- The latest debug APK was installed on the authorized phone on 2026-11-07 with `adb install -r`; version 1.0.0 / code 1 is active and the app was launched. ADB confirmed the existing `8787` and API `3000` reverse mappings. The install used replacement mode; no app data clear was issued. The installed build still does not implement completed reservation checkout.
- Independent reviewer/implementation subagent attempts were unavailable because those workers hit their usage limit. The scoped builds and integration tests are evidence, but not an independent review.

## Resume order

1. Add the missing single-booking payment intent and captured-payment confirmation flow on the backend, with idempotency, expiry, failure cleanup, and isolated tests. Then wire Flutter quote/hold/checkout/pass/cancel screens to those routes. Never simulate payment or treat checkout/solo as a captured payment.
   - Owner decision requested and pending: whether each cafe policy controls checkout, online payment is mandatory, or a reservation may be made and paid at the cafe.
2. Add dashboard checks for check-in, payment settlement, and bar/order transitions against a disposable tenant fixture; retain role and tenant scope.
3. Test signup → admin approval and setup → browser company dashboard against the disposable database. Then exercise Android against the local API without touching production or seeded user data.
4. Build a candidate APK and install only after the integrated Flutter flow passes tests and its destinations are reviewed.

## Files touched in this continuation

- `apps/venue-dashboard/src/components/company/CompanyDashboard.tsx`
- `apps/venue-dashboard/src/styles/theme.css`
- `apps/flutter-mobile/lib/catalog/catalog_client.dart`
- `apps/flutter-mobile/lib/catalog/catalog_app.dart`
- `apps/flutter-mobile/test/catalog_client_test.dart`
- `apps/flutter-mobile/test/catalog_widget_test.dart`
- `apps/flutter-mobile/test/catalog_client_test.dart` (client contract coverage includes login/TOTP/logout)
- `apps/flutter-mobile/README.md`
- `handoff/HANDOFF-DASHBOARD-SPLIT-2026-11-06.md`
- `apps/flutter-mobile/lib/catalog/catalog_app.dart` (removed a compile-time const error)
- `tests/support/auth-harness.ts`
- `tests/eng106-solo-checkout-and-qr.spec.ts`
- This handoff

## Continuation after Android customer sign-up — 2026-11-07

- Customer sign-up is now implemented in Flutter. It requires terms acceptance, calls `POST /v1/auth/register`, then attempts customer mobile login. In local company-approval mode the account is verified at registration; elsewhere an unverified account stays signed out with verification guidance. No password or bearer session is persisted, and development verification tokens are not displayed.
- The reviewed debug APK was rebuilt and installed on the authorized Huawei device with `adb install -r` (package `ro.gamerbooker.app.preview`, version 1.0.0, installed at 2026-11-07 03:43:24 local). Catalog rendered and the customer sign-up form/terms checkbox was opened. No customer account, reservation, or payment was submitted. See `HANDOFF-ANDROID-CUSTOMER-LOGIN-2026-11-07.md`.
- Flutter verification by Luna: `flutter test` 22/22 passed; `flutter analyze` no issues; fresh `flutter build apk --debug` exit 0. APK SHA-256: `46F1A8535117DA25AE5549332AE0EE01907D26F502848F11006890BDC9BB8022`.
- Next, the customer must register with their own chosen email/password on-device to prove the live login path. Do not use the local platform-admin account in the mobile app.
- Added ownership checks to `BookingsService.confirmBooking`: a foreign customer cannot retrieve a booking through another customer's hold/idempotency key or confirm that customer's hold. Owner idempotent replay is preserved. Stripe refund handling now throws on non-2xx responses instead of falling through without a result.
- Verification by Luna for this backend slice: `npm test -- --runInBand tests/eng105-booking-confirmation.spec.ts tests/eng106-solo-checkout-and-qr.spec.ts` passed, 2 suites / 21 tests; `git diff --check` passed. No working-database record, provider, device, booking, or payment was changed by these checks.
- Final separate Luna review accepted the ownership slice. The existing broader working-tree diff in `transitionBooking` and Stripe hardening was already present and is not part of the new ownership behavior.
- Remaining critical gap: `confirmBooking` still records the quote's `due_now_minor` as paid without requiring a matching captured payment intent. Android still stops at live availability/price quote; it does not create a hold, complete checkout, show a real booking pass, or cancel a confirmed reservation.
- Payment-mode preference is awaiting owner selection. Recommended assumption: follow each cafe's configured upfront amount (deposit or full amount) online and pay the remaining balance at the cafe. The alternatives are full online payment or reservation/payment at the cafe. Do not implement payment-dependent UX until this is settled; no payment secrets are configured or used.
- Recommended implementation order: server intent creation and captured-payment confirmation guard, with ownership/amount/venue/hold checks and idempotency; then Flutter hold/checkout/pass/cancel UI using the configured provider; then disposable tenant end-to-end reservation/check-in verification and a final device build/install.
