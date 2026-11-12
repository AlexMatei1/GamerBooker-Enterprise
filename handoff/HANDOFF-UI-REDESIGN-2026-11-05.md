# UI redesign handoff — 2026-11-05

## Current status — correction round 2 CLOSED; independent review PENDING

Correction2 was strictly copy-only in `OperationsRunbooks.tsx` and `FinancialLedger.tsx`. Their state transitions, validation conditions, data access and actions are preserved. The earlier correction1 statement that reachable misleading action/financial claims had been resolved was too broad: the reviewer found the R1 audit, refund result and receipt-void messages documented below. This current section supersedes that wording-coverage claim, without changing attribution of the prior tests.

- Runbook headings, sample checklist values, R1 action/result and guidance now state a preset local illustration. They explicitly say no database audit or real booking access occurred, and no specific cause/customer entitlement was established. R2 shows a local simulated review, with no refund or financial reconciliation.
- The ledger heading/status/calculation/table/export labels identify illustrative values. Its receipt-void dialog and outcome state that only this page's local state changes, with no real booking/financial balance effect. The demo PIN no longer claims real credential authorization.
- `node notes/ui-redesign/correction2-check.mjs`: **9 PASS**, reaching ledger, void dialog/outcome, R1 audit example and R2 refund-review outcome. Actual observed network POST count for these flows: **0**; requests were observed, not blocked.
- Dashboard `npm run build` ran **once after final copy changes**: tsc + Vite PASS,1588 modules, `built in 3.32s`. No app edits followed. `git diff --check` PASS, with existing CRLF normalization warnings only.

Four actual unedited1440×900 Chrome screenshots cover ledger, void dialog/outcome and audit/refund outcomes. Provenance and screenshot SHA256 hashes are in [correction2-source-artifacts.json](../notes/ui-redesign/correction2-source-artifacts.json); assertion details and observed requests are in [correction2-results.json](../notes/ui-redesign/correction2-results.json). The manifest includes both changed source hashes, all final dashboard/mobile dist file hashes and the existing APK hash/timestamps. It also verifies the other15 correction1 source files are unchanged. Mobile index remains SHA256 `c50e5a30490935454f8c78222b652ad6fcaf47a4164b5e577b6cd29c43aa578e`; APK remains `7579e995973f0c822f3e3c90019752b7c0672252336264c1132cda24609884cf`. Final dashboard index is `29509c8c09abacc8b2d891ec374085b62b20441a3b3722eddc3863dd3f2e97ec`; its JS/CSS hashes are recorded in the manifest.

Correction1's21 web/9 native assertions remain evidence of that prior run; they were **not rerun** in correction2. No mobile/Flutter build, install, source, backend, signing, reset or CSS/aesthetic change occurred. Existing low-contrast legacy panel/modal text is visible in the screenshots and remains outside this copy-only lease; these assertions do not establish contrast/accessibility acceptance.

Requested model remains `gpt-6.1-sol`, client identity not independently authenticated. Dedicated task-only temporary Chrome profile and mutation script were cleaned; user profiles untouched. The correction2 write lease is CLOSED and source frozen. Fresh independent verification and review are **PENDING**; this record does not pre-accept the result or claim complete production/parity/copy coverage.

## Prior correction round 1 — historical; wording coverage overstated

This section supersedes the earlier source-only build mismatch and unresolved workflow findings retained below as historical evidence. The same implementation worker completed the seven review corrections without aesthetic expansion. Requested model: `gpt-6.1-sol`; actual client identity not independently authenticated. The paused reset/release/signing task, Flutter `localLogout` semantics and Android/signing configuration remain unchanged by this correction.

| Finding | Verified resolution |
|---|---|
| Simulation isolation | Both event services now use only `broadcastLocal`/same-origin BroadcastChannel. No HTTP event POST or SSE connection remains. Booking, extension, support, orders and dashboard status transitions use this boundary. Policy simulation no longer posts sample settings. Actual observed POST count: **0**. |
| Venue coherence | Both clients use distinct Cluj CJ-01/CJ-02/CJ-03 fixtures, RTX 4080 equipment, a Cluj PC room and 30 RON/hour rate. Venue changes select a valid available resource. Nexus 35/50 RON rates remain. Wrong-venue local events do not affect Nexus. |
| Pending web checkout | Immutable quote/price snapshot, duplicate guard and unmount timer cleanup. Navigating away and logging out during the delay produced no pass/event. |
| Extension/day labels | Web extension updates end time, seconds and total using the pass resource rate. Both clients show 22:00 + 5h as Mâine,03:00 and extension as Mâine,04:00. This is local illustrative arithmetic, not server/timezone scheduling. |
| Web cart | App owns quantities. Rendered assertions: 2 Red Bulls + cola =37, remove1 =23, tab persistence, cancel retains23, confirmed order clears cart exactly once. Logout also clears the cart. |
| Reachable claims | Bar/Financial wording no longer claims ANAF validation, live fiscal transactions or specific-law enforcement. Neutral verification prompts remain. Runbook certification/launch/refund-dispatch wording is explicitly illustrative/demo. |
| Current native runtime | Final source including KeyedSubtree passed analyze/build, was installed once with `-r` on explicit Huawei CNXNU20922109640 and exercised. Only authorized one-time installer prompts were accepted; no uninstall, data clear or persistent security setting change. |

Final observed commands: dashboard `npm run build` PASS (1588 modules,17.86s); mobile `npm run build` PASS (1587 modules,19.72s); existing SDK snapshot `analyze --no-pub` PASS, `No issues found! (ran in 23.6s)`; snapshot `build apk --debug --no-pub` PASS, Gradle25.1s, `Built build\\app\\outputs\\flutter-apk\\app-debug.apk`. `git diff --check` PASS; existing CRLF normalization warnings only.

`node notes/ui-redesign/correction1-check.mjs`: **21 PASS**, including actual `Network.requestWillBeSent` observations with POST count0. Requests were observed, not blocked to manufacture the result. Same-origin channel delivery and wrong-venue rejection were positively/negatively checked. Initial harness readiness/button-locator adjustments were resolved before the final complete run. `python notes/ui-redesign/correction1-native.py`: **9 PASS**, update install Success, Cluj checkout150 at30/h, next-day03→04 extension and top-of-page checkout/Pass/Reserve/Bar navigation. Actual screenshots were inspected, with no overflow stripes observed.

Evidence: [web assertions and network requests](../notes/ui-redesign/correction1-web-results.json), [native assertions/install hash](../notes/ui-redesign/correction1-native-results.json), [all correction source/artifact hashes and UTC timestamps](../notes/ui-redesign/correction1-source-artifacts.json), plus `correction1-*.png`. Native captures include Cluj details/reserve/checkout, top of Pass, next-day extension, Reserve after Pass, checkout after tab switch, Bar and Account.

Final installed/captured APK SHA256: `7579e995973f0c822f3e3c90019752b7c0672252336264c1132cda24609884cf`,165423973 bytes,built `2026-11-05T02:44:23.176404Z`. All application edits preceded final builds; no application edits followed them. The source/artifact manifest lists the exact17 correction paths.

Correction paths: mobile `src/App.tsx`, `src/api/client.ts`, `src/types/mobile.ts`, new `src/utils/demoTime.ts`, `src/components/{SeatPicker,BookingCheckout,ActivePassView,BarOrderingView}.tsx`, `src/services/realtime.ts`; dashboard `src/api/client.ts`, `src/services/realtime.ts`, `src/components/{LiveFloorView,BarBoard,FinancialLedger,OperationsRunbooks,StationClientShell}.tsx`; Flutter `lib/parity_app.dart`; this handoff, design note and correction evidence/checkpoint.

All seven defined findings are resolved in the saved, verified source. Remaining limits: demo fixtures only; no real bookings/payments/QR validation; same-origin channel cannot synchronize separate development ports or devices; no full accessibility/timezone/production UAT or full parity claim. One Android phone was exercised. Dedicated task-only temporary Chrome profile and throwaway mutation script were removed; user browser profiles were untouched. Independent verification/review follows this CLOSED write lease.

## Scope and ownership

New owner-authorized redesign across dashboard, mobile web demo and Flutter preview. Earlier reset-fix, release and signing work is PAUSED and excluded. Unrelated dirty Flutter/scaffold/document edits were preserved; no staging, commit, revert, uninstall or app-data clear. Requested model: `gpt-6.1-sol`; actual client identity not independently authenticated. Implementation used one writer under Astra supervision; independent verification/review follows write-lease closure.

## Changed implementation

- `apps/venue-dashboard/index.html`, `src/App.tsx`, `src/styles/theme.css`, `src/components/{Header,LiveFloorView,InteractiveFloorMap}.tsx`: dark venue rail, light operations canvas, stable sections, shared map/list filters, derived resource counts, arrivals/attention queue, schematic rooms/doors/aisles, compact station IDs, scan code rejection and installed-app assistance. Existing Layout/Pricing/Financial/Runbooks/Bar components retain their working implementations with shared form/table styles. Contractual occupied/booked states cannot be overwritten by maintenance controls. Existing session/status/staff event demonstrations remain subscribed.
- `apps/mobile-app/index.html`, `src/App.tsx`, `src/api/client.ts`, `src/styles/theme.css`, `src/components/{ExploreVenues,SeatPicker,BookingCheckout,ActivePassView,BarOrderingView,CustomerProfile,BottomNav}.tsx`: venue rows and native illustrations; coherent venue identity; selected start/duration passed to quote summary; room selection with one sticky total; transparent demo totals/promo; invalid demo admission QR; extension/support; product rows/cart/order status; account hierarchy. Unsupported sim-racing/VR/wallet/verified legal claims removed from the redesigned active flows. External font/CDN scripts removed.
- `apps/flutter-mobile/lib/parity_app.dart`: matching paper/ink/orange theme, five destinations and six redesigned screen workflows. The existing `localLogout` operations and generation guard semantics were preserved; only Dart formatting changes their source layout. No Android/signing configuration was edited by this task.
- New design specification, this handoff and concise evidence in `notes/ui-redesign/`. Index/changelog additions apply only to this task.

## Observed checks

| Check | Result | Evidence |
|---|---|---|
| Dashboard `npm run build` | PASS | Final saved source, TypeScript + Vite, 1588 modules, 5.06s |
| Mobile web `npm run build` | PASS before last tiny patch | TypeScript + Vite, 1586 modules, 4.61s, 04:18:20+02:00. Later ActivePassView end-label stripping patch at 04:19:22 was not rebuilt |
| Flutter analyze `--no-pub` | PASS | Existing SDK snapshot invocation: `No issues found! (ran in 6.6s)` |
| Flutter debug APK `build apk --debug --no-pub` | PASS | `Built build\\app\\outputs\\flutter-apk\\app-debug.apk`, Gradle 15.3s; existing Gradle/AGP/Kotlin deprecation notices |
| Initial Flutter build iteration | FAIL, corrected | Local zone identifier was accidentally renamed during copy replacement; fixed to `roomZones`, then analyze/build passed |
| SDK sandbox startup | BLOCKED, resolved | Cache lockfile outside workspace; approved existing-SDK invocation used |
| Dashboard 1440×900 | PASS, visual inspection | `dashboard-1440.png`, actual headless Chrome localhost capture; Astra also inspected |
| Explore 360/390/412×844 | PASS, no horizontal overflow | Actual device metrics, `scrollWidth` equals 360/390/412; PNGs and `web-observations.json` |
| Reserve/checkout/promo/pass/bar/account | PASS, representative web flow | One sticky booking CTA; ENTERPRISE10 applies 10% to deposit; 100 subtotal → 27 deposit + 70 balance = 97 final; extension adds 50 to 147; 1 bar product = 14 RON; simulated order disclosure shown |
| Huawei update | PASS | Explicit `CNXNU20922109640`, `adb install -r` returned Success after one-time local APK prompts. No persistent security setting changed. Initial guessed launch component failed; corrected to existing `ro.gamerbooker.app.preview/ro.gamerbooker.app.MainActivity` / installer Open |
| Full production/backend/payment/PSP validation | NOT RUN | Excluded local prototype scope |
| Old reset bug/release/signing work | NOT RUN | Owner-paused, excluded task |

CUA browser connector reported `browser access host unavailable`. Captures used existing installed Chrome in a dedicated task-owned headless profile, with CDP device metrics and a small checked-in `capture.mjs`; no new automation dependency or user browser profile was used. The first narrow CLI capture used Chrome's minimum layout viewport and was replaced by correctly sized metrics captures. Generated browser profiles are removed after task-owned Chrome processes exit.

## Remaining limits and review focus

Actual native screens and dialogs are captured where device runtime permits; inspect `flutter-*.png` and final checkpoint for exact observed state. Native talkback/font scaling, all empty/error combinations, backend event delivery and full operational UAT are not established. Web core flow checks are representative, not complete E2E coverage. Sample geometry, stock, policies and availability remain demo data. Existing legacy configuration tools still carry some English copy and require separate detailed acceptance for their full server flows; this task keeps them reachable rather than replacing their functionality.

## Closed lease and unresolved review findings

Write lease CLOSED at root's explicit direction. Final tool invocation was interrupted after a prolonged wait; no final analyze/build result was observed. APK timestamp is 2026-11-05 04:10:59+02:00, while final `parity_app.dart` is 04:19:21+02:00. The installed APK/screenshots therefore predate the final KeyedSubtree scroll-reset patch. That fix is saved in source only; final-source Flutter analyze/build/install are NOT RUN. Dashboard final build corresponds to source; mobile final build predates only the small ActivePassView day-label formatting patch.

| Review finding | Final state |
|---|---|
| Flutter scroll offset retained across destinations | KeyedSubtree keyed by tab/checkout saved; NOT rebuilt or verified after interruption |
| Web checkout callback fires after navigation/logout | UNRESOLVED: timeout has no unmount cleanup/generation guard |
| Web extension interval contradicts remaining time/total | UNRESOLVED: `handleExtendSession` updates seconds/total but not `endTime` |
| Web cart survives tab changes | UNRESOLVED: local BarOrderingView cart state is lost when conditional component unmounts; representative add/order check passed but persistence was not tested |

Focused visible-copy audit of preserved Bar/Financial/Pricing/Runbooks legal/fiscal labels is NOT RUN. The redesigned shell/primary flows remove their unsupported claims, but legacy-module claims cannot be represented as comprehensively removed. Native Explore still uses the longer hero/ALL chip; compact final web hero differs. This is a known remaining polish item, not a full parity claim.

Account subsections disclose their unconnected demo state. The UI does not claim real settings/receipts/history actions. There is no production deployment, new backend integration or legal/fiscal certification in this task.
