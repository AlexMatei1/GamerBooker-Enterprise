# Company dashboard and admin split — 2026-11-06

## Scope completed

- Authenticated café memberships are routed to `/dashboard`; a platform administrator is routed to `/admin`; pending applicants are routed to `/apply`.
- The authenticated company route now uses `CompanyDashboard`, a server-backed operations shell with the existing rail/top-bar visual language. Venue name, timezone and role come only from `/access/context` and `/dashboard/venues/:id/overview`.
- The company shell has no hard-coded Nexus venue, no client role selector, no simulated operation buttons and no API-to-demo fallback. Its refresh reads the authorized venue's overview, live floor, check-in queue and bar board. Bar status transitions call the existing scoped order endpoints.
- Admin remains the deliberately small applications/approval/initial setup page. Company configuration is not rendered from the authenticated `/dashboard` route. Logout remains visible in the rail.

## Changed files

- `apps/venue-dashboard/src/SecureApp.tsx`
- `apps/venue-dashboard/src/components/company/CompanyDashboard.tsx`
- `apps/venue-dashboard/src/styles/theme.css`

## Observed verification

`npm --prefix apps/venue-dashboard run build` passed: TypeScript and Vite completed, 1595 modules transformed.

## Deliberate limits / next work

- No browser authentication or live API route exercise was performed in this stage; the build does not prove a local account's cookies, memberships or operational data.
- The company dashboard is connected to overview, reservations list, check-in queue, floor state and bar queue/status transitions. Manual QR-token/public-code check-in is now available; camera scanning, payment/balance collection, menu/inventory management, receipts/finance and staffing are not rendered here yet.
- Android and booking business logic were intentionally untouched. The next integration phase should connect the Android flow to the same backend and run the owner-authorized end-to-end account → approval → reservation → company check-in path.

## Check-in form update — 2026-11-06

- Added a manual signed-QR-token or public-code form to the Reservations view. It uses the existing venue-scoped `POST /dashboard/venues/:venue_id/checkin` route and refreshes live state after success.
- The form is displayed only for OWNER, VENUE_MANAGER, and RECEPTION, while the API remains the source of role authorization. It does not use the device camera.
- Dashboard production build passed. API QR replay, too-early, and venue-scope behavior passed in the disposable ENG-106 test suite (9/9 for that suite).
- Remaining dashboard work: camera-based scanning, payments/receipts, menu/inventory, finance, and staffing. Full browser verification with an approved company account is still pending.
- See `HANDOFF-END-TO-END-2026-11-06.md` for the broader current status.
