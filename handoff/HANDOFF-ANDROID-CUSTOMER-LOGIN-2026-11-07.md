# Android customer login blocker — 2026-11-07

## Initial user report

The app installed on the Android phone opens, but the user cannot log in to test it.

## Initial device verification (before customer sign-up was added)

- Connected phone: Huawei PPA_LX2 (`CNXNU20922109640`).
- Installed package: `ro.gamerbooker.app.preview`, version `1.0.0` (version code `1`).
- Resumed Flutter activity: `ro.gamerbooker.app.preview/ro.gamerbooker.app.MainActivity`.
- The screen shows the live GamerBooker catalog and the seeded `Demo Venue`.
- Local API health check returned HTTP 200; ADB reverse mappings for ports 3000 and 8787 exist.
- The visible sign-in dialog is titled “Cont client” and accepts email/password; it has no registration action.

## Initial root cause

The Android build is the current catalog app, not the older demo workflow. It only exposes customer sign-in. The locally created platform-admin account is intended for the local browser admin dashboard; it is not a customer test account. Backend registration exists, but the Flutter screen does not let a new customer create an account. Therefore the user has no usable customer login path from the app.

## Initial proposed implementation

Add a customer registration path in Flutter that matches the backend's existing registration and verification behavior, including clear handling of the development verification response when it is available. Then create a dedicated local customer test account or have the user register one, sign in on the phone, and verify the authenticated account state without making a booking. Do not weaken local-admin/dashboard restrictions or use the admin password as a mobile customer credential.

## Initial environment / evidence

- App source entry point: `apps/flutter-mobile/lib/main.dart` selects `LiveCatalogApp` by default.
- Customer login implementation: `apps/flutter-mobile/lib/catalog/catalog_app.dart` and `catalog_client.dart`.
- Local-admin login policy limits password-only access to dashboard requests from the loopback browser boundary: `src/auth/local-admin-policy.ts`.
- No source or backend data was changed in this diagnostic turn.
- The Android app remains open with the customer login dialog visible.

## Workflow constraint

At the time of the initial diagnosis, implementation paused because the requested Astra supervisor was unavailable. This constraint was superseded by the owner's later explicit instruction to proceed with available non-Astra agents.

## Resume attempt — 2026-11-07

- Owner specified that Astra should plan only and a separate Sol worker at high reasoning effort should implement Astra's task packet.
- Attempted native delegation for `gpt-6-astra`; the client rejected it as unavailable. The only launchable models reported by the collaboration tool were `gpt-6-luna`, `gpt-5.6-terra`, and `gpt-5.6-luna`.
- No implementation worker was launched because Astra is a mandatory, non-substitutable supervisor in the required workflow. Sol was not launched before Astra provided a task packet.
- This initial stop was superseded by the later owner instruction to proceed with available agents; see the implementation and device-install section below.

## Customer sign-up implementation and device install — 2026-11-07

- Owner changed the workflow: Astra may be unavailable; use an available implementation agent and Luna for verification. The native client rejected requested `gpt-6.1-sol`; the implementation worker was transparently launched as `gpt-5.6-terra` at high effort, following the owner's earlier instruction to work with available models. Independent verifier launched as `gpt-6-luna` at high effort.
- Added a Flutter customer registration mode to the existing account dialog. It requires explicit terms acceptance, posts to `/v1/auth/register`, validates the returned user ID, then attempts mobile login. When login says the email remains unverified, the app stays signed out and gives verification guidance. The client does not surface a development verification token or persist credentials/session tokens.
- Backend/admin code was not changed. Local admin password-only policy remains limited to dashboard requests on the loopback browser boundary. `.local-auth/admin-mode.json` has `companySignupApprovalOnly: true`; `tools/local-auth/start-api.cjs` maps that setting to `LOCAL_COMPANY_APPROVAL_ONLY=1`, which causes local registrations to be verified on creation.
- Verification: independent Luna inspected the actual code/contracts and ran `flutter test` (22/22 pass), `flutter analyze` (no issues), and a fresh `flutter build apk --debug` (exit 0). APK SHA-256: `46F1A8535117DA25AE5549332AE0EE01907D26F502848F11006890BDC9BB8022`.
- Installed the APK using `adb install -r`; result: `Success`. The app package is `ro.gamerbooker.app.preview`, version `1.0.0`, last update `2026-11-07 03:43:24`. No data clear was issued. Relaunched the app, confirmed the live `Demo Venue` catalog renders, opened `Cont client` → `Creează cont`, and confirmed the customer registration form and terms checkbox appear. No customer account, booking, or payment was created.
- Remaining live acceptance: user enters their own customer email/password and accepts terms on the device; app should register and sign in using the local approval-only mode. This account creation has not been submitted or verified against the working database. Production/remote sign-up email delivery remains an external requirement and was not tested.

## Keyboard layout fix and second device update — 2026-11-07

- Owner clarified that the Android device should show the Flutter customer application, not a browser dashboard. Confirmed the foreground activity is `ro.gamerbooker.app.preview/ro.gamerbooker.app.MainActivity`; the previous dashboard confusion is not present on the phone.
- Manual device inspection found the registration dialog overflowed when the Android keyboard opened. Updated the Flutter dialog to scroll and keep errors/notices in the content. Added a 360×640 widget scenario with a simulated 300px keyboard inset, asserting no overflow and reachable terms/create actions.
- Luna verification: focused overflow test passed; full `flutter test` passed 23 tests; `flutter analyze` and `git diff --check` passed. Debug APK built successfully. SHA-256: `0362CB1E77F18F745E4DE14A243B756A22863D64DD9F095A2770B27D88D043E4`.
- Installed this build with `adb install -r`; result `Success`, package remains `ro.gamerbooker.app.preview`, and Android reports `lastUpdateTime=2026-11-07 05:13:00`. No app data clear was issued. Relaunched the Flutter activity, confirmed the live catalog, opened registration, and opened the keyboard; no overflow warning appeared. Dismissed the keyboard and left the Flutter customer registration form in the foreground. No account, booking, or payment was created.

## Customer registration implementation — 2026-11-07

- The owner later authorized the available-model workflow: an implementation worker may plan and implement, followed by a separate Luna review. The requested Sol model was unavailable; the active implementation worker reported `gpt-5.6-terra`.
- Added a customer account creation action to the Flutter account dialog. It requires explicit acceptance of terms because the existing backend registration contract requires `accepted_terms: true`.
- The mobile client calls `POST /v1/auth/register`, validates the returned user identifier, then uses the existing mobile-login endpoint. With local approval-only registration, that signs the customer in immediately. If the server reports `AUTH_EMAIL_UNVERIFIED`, the customer remains signed out and sees instructions to verify their email before signing in.
- The app ignores any verification token returned by a development server and does not persist a password or bearer token.
- No customer account, booking, or payment was created during implementation. The verified APK was subsequently installed on Android, and its customer registration form was confirmed; see the device-install section above.

## Worker verification before final device verification

- `flutter test`: passed, 22 tests. The new client coverage checks local registration then mobile login, submits the required terms acceptance, and verifies email-unconfirmed registration remains signed out.
- `flutter analyze`: passed with no issues.
- `flutter build apk --debug`: fresh independent build completed with exit code 0. Artifact: `apps/flutter-mobile/build/app/outputs/flutter-apk/app-debug.apk`, 165,478,991 bytes; Luna reported timestamp 2026-11-07 03:41:28 and SHA-256 `46F1A8535117DA25AE5549332AE0EE01907D26F502848F11006890BDC9BB8022`. The APK was installed in place at 03:43:24; see above.
- The build emitted future Flutter support warnings for Gradle 8.14.0, Android Gradle Plugin 8.11.1, and Kotlin 2.2.20. They did not stop this debug build.

## Current next action

The updated APK is installed and the customer registration form is available on the phone. The owner can create a dedicated customer account there and sign in; do not use the local platform-admin account in the app. Registration against the live local database has not yet been submitted or verified.
