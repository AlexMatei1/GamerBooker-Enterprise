# Correction round 1 — source frozen, lease CLOSED

This section supersedes the implementation/verification status below. Requested same worker model gpt-6.1-sol; client identity unverified. Only the accepted new local passflow was corrected. No UI redesign, production API/controller, release/signing or old reset-task change. CUA stop remains in effect: no browser, phone touch, camera, alternate CDP, UI automation or screenshots were attempted during correction.

## Corrected behavior

- Web and Flutter quote/book/cancel/refresh/Bar operations capture a navigation epoch. Back, destination/venue/pass/selection changes and local logout invalidate it; stale success/failure/finally callbacks cannot navigate, replace the current pass or reset a newer busy operation. An already server-accepted booking remains in the durable list for the same owner. Both adapters singleflight initial identity creation; polling is singleflight and suppressed during current mutations, with generation checks for previously pending polls.
- Each pass has its own cart and simulated order history. Orders carry that booking ID. Opening Bar and confirming a local simulated order revalidates the owned pass through `/preview/customer/bar-eligibility`; staff authority is not exposed. No production bar order is posted. A response must still match the current epoch/pass and authoritative active window before local acceptance. Expiry/offline removes the sticky action and closes/drops the dialog; submit rechecks all gates. Refusal/offline/stale completion preserves cart/history and feedback. Back returns to the same pass. Local logout resets local bar state with the existing UI reset/search/filter semantics preserved.
- The service calculates and snapshots illustrative money with the quote, and the pass retains exactly those values: rate, subtotal, 30% base deposit, optional ENTERPRISE10 rebate of 10% of that deposit, deposit after rebate, original 70% remaining component and total after rebate. Example subtotal100 -> base30, rebate3, deposit27, remaining70, total97 RON. Both clients accept optional promo before generating the quote, then display the captured amounts in checkout and pass. Invalid promo is rejected. Unconnected selectable payment methods were removed from both; no payment/refund claim was introduced. Older passes with no amount snapshot explicitly say no saved amounts rather than inventing them.
- Clients use `X-Preview-Now` service timestamps plus a monotonic elapsed clock for inclusive cancellation and active/booked-end gating. Device wall-clock skew does not decide eligibility; an older response cannot rewind the clock. Human-readable date/time is still device local time. The service revalidates eligibility and preserves the originally booked end. Operation error feedback survives ordinary successful polling; explicit retry/action clears it, while connection feedback recovers separately.

## Actual correction checks

- `node --experimental-strip-types --test --experimental-test-isolation=none tools/pass-preview/model.test.cjs tools/pass-preview/server.test.cjs tools/pass-preview/journey.test.cjs tools/pass-preview/client-state.test.cjs`: PASS 8/8. Final captured run524.97ms, zero failures. Includes a full isolated temp-store HTTP session→quote/disclosed money+policy→booking/list→wrong/correct staff scan→customer active poll/matching booked end→replay refusal→owned active Bar eligibility→future cutoff snapshot→outsider/cancel/after-cutoff denial journey. No UI E2E claim. The actual web-used primitives are tested with delayed completion, per-pass cart/history/reset and controlled monotonic expiry/late sample.
- `C:/flutter/bin/cache/dart-sdk/bin/dart.exe tools/pass-preview/client_state_test.dart`: PASS7 standalone Dart assertions for the actual Flutter-used operation/cart/clock helpers. These are logic tests; widgets/device interactions were not exercised. Captured output: notes/pass-lifecycle/correction1-node-tests.txt and correction1-dart-tests.txt.
- Final mobile `npm run build`: PASS exit0,1586 modules,5.04s, index-BE4zGzZL.js. Dashboard `npm run build`: PASS exit0,1589 modules,10.62s, index-CxEBejTn.js. One final mobile rebuild followed whitespace-only diffcheck cleanup; no source edits followed final builds.
- Final direct installed SDK `flutter_tools.snapshot analyze --no-pub` in apps/flutter-mobile: PASS exit0, no issues,11.9s. `build apk --debug --no-pub`: PASS exit0, Gradle16.8s. Existing SDK/toolchain deprecation notices remain. One early attempt initially used the wrong helper-script cwd and hit SDK cache lockfile denial; the helper was then run from repo root and the narrowly scoped existing-SDK permission was granted. There was no stalled approval or toolchain upgrade.
- Corrected APK SHA256 `9ec214d8017cb8e26f5e902649fcfd12c8cd4ffe3e40e82529e3aa6eef25df0c`,165440016 bytes,2026-11-05T04:41:45Z. A single authorized `adb -s CNXNU20922109640 install -r apps/flutter-mobile/build/app/outputs/flutter-apk/app-debug.apk` was launched (session70048). At latest early polls it remained PENDING with no output. No duplicate install, UI/prompt interaction, uninstall, data clear or security setting change was performed. Corrected APK installation is NOT confirmed. The prior installed APK is only the earlier initial-passflow artifact; do not label it corrected.
- `git diff --check`: final PASS exit0, existing CRLF notices only. A preceding combined capture returned1 solely due to an extra blank line at mobile App.tsx EOF; that whitespace was corrected, checked and rebuilt.
- Prior task service PID24444 and ports8787/8788 were absent before restart. The default outside-repo state.json did not exist, so there was no live customer data/config to migrate or hash-preserve; no state was deleted/overwritten. Corrected service started once and is left available (session62415), PID17296, command line verified `node tools/pass-preview/server.cjs`, both listeners127.0.0.1:8787/8788. Read-only customer venues GET returned both Nexus and CyberSphere. No `/v1` mutation, staff port reverse or cloud/tunnel occurred.
- Temporary correction helper `tools/pass-preview/correct-flutter.py` was removed. Test temporary stores self-clean. No browser profile or screenshot was created. Exact corrected source/dist/APK metadata is in notes/pass-lifecycle/correction1-source-artifacts.json; the initial source-artifacts.json remains historical.

## Current manual test instructions and limits

Use the run/stop/USB setup and manual walkthrough retained below. The service is already running on8787(customer)/8788(staff). If the pending install finishes successfully, open the corrected preview manually; otherwise wait for/handle the existing install prompt yourself and check that command's result before initiating another install. No agent UI replay is authorized in this phase. Do not assume install success from the existence of a fresh APK.

For promo/money, enter ENTERPRISE10 in the selection screen before View total and compare all checkout/pass components (100→27+70=97). For context races, manually navigate Back/Account/logout or select a different venue/pass while a delayed operation is pending: the old response must not hijack the new screen. A server-accepted pass should be recoverable later in Passes. Create two active passes at separate stations/venues, put different items in each cart and place only one simulated order: each pass should retain only its own cart/history. Open an order dialog near the booked end or stop the service before confirmation: no new order/history or cart clearing should occur; expiry must remove the sticky action. Feedback should remain until retry/dismiss, despite polling.

The automated checks establish HTTP/state/helper behavior. Browser cancellation/policy rendered behavior, real phone booking→staff optical/typed UI→timer/Bar, widget lifecycle races, screenshots, optical decode/hardware and corrected APK touch remain NOT VERIFIED. The earlier CUA stop is respected. Cache-based Flutter preview identity and unavailable extensions/production PSP remain documented prototype limits. Independent read-only verification and review are required after this CLOSED correction lease.

---
# Local pass lifecycle preview — 2026-11-05

This isolated preview implements the new owner-authorized pass lifecycle. It does not call production `/v1` writes, collect payment/auth credentials, issue real venue admission, or send bar orders. No backend/controller/migration/signing/release files were changed by this phase. Existing dirty redesign/scaffold work was preserved.

## Contract

Customer navigation has three destinations: Explore, Passes, Account. Reserve is entered from a selected venue. Successful local confirmation opens the new confirmed pass automatically. Confirmed means not checked in; there is no countdown, Bar entry or extension before staff check-in. Multiple passes remain under the local owner identity. Bar is a child of an active pass and returns to the same pass; bar orders remain explicitly local simulations. Extensions are unavailable.

A staff scan is accepted only for the selected matching venue, an existing random unspent code, CONFIRMED status, and `startAt <= serverNow < endAt`. Early scans, end boundary/late scans, unknown, invalid, cancelled, wrong-venue and replayed codes are rejected. Check-in starts the active display; it preserves the originally booked `endAt`. A 10:00–11:00 booking scanned at 10:15 has 45 minutes remaining, ending 11:00. It does not grant a full extra hour. There is no automatic PC control.

Each venue initially requires cancellation at least 3 hours before start. Dashboard policy accepts integer 0–168 hours. Quotes disclose and snapshot the policy/deadline; a policy change before or after confirmation does not replace that disclosed snapshot. Cancellation requires CONFIRMED status and `serverNow <= cancellationDeadline` (inclusive). After deadline or check-in it is rejected. This preview hard cutoff supersedes the legacy late-cancellation penalty example in docs/03-bookings/04; there is no payment/refund calculation or promise. Overlapping non-cancelled passes for the same venue/station are rejected atomically in the single service; cancelled intervals are reusable.

Today's selected times become real timestamps on the local host. Past slots are rejected rather than silently moved. The host is expected to use Europe/Bucharest. Clients show exact date/time/seconds in their device timezone, labelled as device local time; service authority always uses host epoch time. The explicit rapid-demo option creates a future start 15 seconds after quote creation, with the disclosed end one selected duration later. Confirm before those 15 seconds expire. Refresh the quote if it expires; this is a deliberate real clock test, not an already-active fixture.

## Run / stop

From repository root, after existing dependencies/SDK are installed:

```powershell
npm --prefix apps/mobile-app run build
npm --prefix apps/venue-dashboard run build
node tools/pass-preview/server.cjs
```

Keep that terminal running. Customer web: http://127.0.0.1:8787 . Staff dashboard: http://127.0.0.1:8788 . Use the literal 127.0.0.1: localhost aliases are intentionally denied. Both listeners bind only 127.0.0.1. Do not use the old public-bind mobile Vite server for this flow. Ctrl+C in the service terminal stops both listeners. One service instance only; do not run two writers against its state file.

Preview state is stored outside the repository at `%LOCALAPPDATA%/GamerBooker-pass-preview/state.json` (OS temp fallback). Writes use a flushed same-directory temp file and atomic rename. There is no cloud exposure, tunnel, proxy to production, or background sync to `/v1`. Staff operations are on a separate port, require a random per-launch bearer capability injected only into staff HTML, and enforce role, Host, Origin, fetch-site and JSON/custom-header checks. Only the customer port may be reversed over USB. These local preview capabilities are not production authentication and do not protect against a person/process already controlling the local machine.

On the already installed Huawei preview (`ro.gamerbooker.app.preview`):

```powershell
adb -s CNXNU20922109640 reverse tcp:8787 tcp:8787
```

Open GamerBooker Preview on the phone. If USB disconnects or the service stops, customer actions must show unavailable/failure rather than confirm locally. No staff port is reversed. A new install is not needed for the APK installed during this phase. To remove only this USB mapping later: `adb -s CNXNU20922109640 reverse --remove tcp:8787`.

Browser owner identity lives in a dedicated localStorage key for 127.0.0.1:8787. Flutter owner identity is an app-private temp/cache file that survives ordinary process relaunch; OS cache eviction, app-data clearing, uninstall, or host state loss can lose access to that preview owner. It is not an account recovery system. Local logout/reset keeps the previous UI/cart/reset/search semantics; durable server passes remain recoverable when re-entering Passes. Staff is never granted that customer identity. No owner or staff bearer token was written into repository evidence.

## Manual acceptance walkthrough (NOT executed in this phase)

1. Open staff URL. The Passes / Check-in local section is at the top of Today; the venue dropdown contains Nexus and CyberSphere. Set the intended venue policy (3 hours default; use 0 only to demonstrate a still-open pre-start cancellation window).
2. Customer phone or web: Explore > select the same venue > choose an available station > explicit rapid +15-second start > View total. Review the exact scheduled interval, cancellation hours and exact local deadline before accepting the checkbox. Confirm within 15 seconds. The newly confirmed pass opens with QR/manual code, no active timer/Bar/extension. With default 3h the rapid pass's cancellation window is already closed; that is expected.
3. On staff dashboard, choose the matching venue. Scan the QR using a keyboard-wedge USB scanner + Enter or paste/type the exact `GBLOCAL-…` text. The camera button uses browser BarcodeDetector when supported; no optical hardware has been validated. After the scheduled start, submit. The server should confirm staff check-in and preserve the displayed booked end. Refresh/poll on the customer (2 seconds) should show Active and remaining time to that end.
4. Open Bar from that active pass, then use Back to same pass. Navigate Account, Explore, Passes, and relaunch the app: previous passes should remain. Create a second pass on a separate station to avoid overlap; the first must remain in the list.
5. Replay the code, select the wrong venue, enter an invalid/unknown code or present a cancelled/expired code: each must be refused. Early scans are refused. There must be no timer/Bar on a newly confirmed pass.
6. For cancellation: set venue policy 0, create a new quote/pass on an unused station, cancel before its scheduled start, and verify Cancelled/no usable check-in. Change policy afterwards: an older pass must retain its snapshot and deadline. For human-paced cancellation, select a future fixed clock slot; past times are rejected. Exact inclusive deadline and 1ms-after behavior are covered by the controlled-clock automated test, not claimed as an observed browser test.
7. Stop the service or disconnect reverse and attempt confirmation/cancel/scan: no new confirmation or active transition should occur. Existing display is only last fetched state. Restart service and reconnect to recover stored passes.

## Observed checks / limitations

- Mobile web `npm run build`: PASS, exit 0; TypeScript/Vite, 1585 modules, 8.85s, index-Dc6_Nxax.js.
- Dashboard `npm run build`: PASS, exit 0; 1589 modules, 11.45s, index-CxEBejTn.js.
- Installed SDK direct invocation `C:/flutter/bin/cache/dart-sdk/bin/dart.exe C:/flutter/bin/cache/flutter_tools.snapshot analyze --no-pub` in apps/flutter-mobile: PASS, exit 0, no issues, 25.0s.
- Same direct snapshot `build apk --debug --no-pub`: PASS, exit 0, Gradle 21.0s. Existing Gradle/AGP/Kotlin deprecation warnings remain; no toolchain upgrades.
- `adb -s CNXNU20922109640 reverse tcp:8787 tcp:8787`: PASS (8787). One already-running `adb ... install -r ...app-debug.apk` completed exit 0, Performing Streamed Install / Success. No uninstall/data clear, new prompt automation or security setting change. This proves update installation only; new APK interaction was not observed.
- `node --test --experimental-test-isolation=none tools/pass-preview/model.test.cjs tools/pass-preview/server.test.cjs`: PASS, 6/6, 222ms. Covers inclusive/after cutoff, owner denial, policy edits around confirmation, late scan booked end, early/end/replay/unknown/invalid/wrong venue/cancelled scans, recovery/repeated passes/idempotency/overlap, session invalidity, quote expiry/past times, local QR matrix, loopback/Host/Origin/staff authority, `/v1` denial, and unreachable service rejection. Raw HTTP is used for the Host-spoof test because fetch normalizes its Host header. Optical decoding was not tested.
- Initial Node runner failed before tests with EPERM spawning workers. A privileged rerun was requested then aborted by user after ~309s; it is not counted as verification. The supported in-process test mode above then ran without escalation.
- Two initial `flutter analyze` wrapper invocations stalled with no output (one mistakenly at repository root); their task-owned cmd processes were positively identified and terminated before the successful direct SDK check.
- `git diff --check`: PASS, exit 0, existing CRLF normalization warnings only.
- Service startup observed customer/staff both bound 127.0.0.1 (PID 24444 at observation); it was left running for manual testing. Stop via its terminal/Ctrl+C; verify the command line before ending a PID, which may later be reused.
- Browser connector failed: browser access host unavailable. Native Brave inventory worked, but the first local navigation stopped Computer Use because it could not determine the current browser URL with enough confidence to enforce policy. No further UI automation, CDP fallback, browser/device replay or prompt action followed. Therefore actual browser cancellation/policy walkthrough, cross-surface phone booking→staff scan→timer/Bar, relaunch UI behavior and screenshots are NOT VERIFIED / NOT CAPTURED. No old screenshot/APK was presented as current evidence.

Exact SHA256/size/UTC modification metadata for changed source, vendored QR, both web outputs and the installed fresh APK are in notes/pass-lifecycle/source-artifacts.json. QR code is encoded by project-local vendored QRCode for JavaScript (Kazuhiko Arase), retaining source notices and qrcode-terminal LICENSE; it renders the same random code as the manual/scanner text with a four-module quiet zone. No external QR service receives that code.

Source is FROZEN; sole implementation lease CLOSED. Requested worker model gpt-6.1-sol; actual client identity unverified. Independent read-only verification/review remains pending. No commit/push/publish occurred.

