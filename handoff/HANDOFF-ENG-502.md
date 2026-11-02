# HANDOFF-ENG-502: Customer Accessibility, Deep Links, and Mandatory Mobile App Install Funnel

## 1. Goal & Architectural Scope
Delivers customer accessibility compliance (EN 301 549 / WCAG 2.1), universal platform deep link resolution, mandatory mobile app install funnel with strict web checkout prohibition, deferred deep linking across store installation, and on-site QR conversion analytics for GamerBooker Enterprise v1.0, satisfying:
- `docs/11-delivery/04-engineering-handoff-backlog.md` (ENG-502)
- `docs/07-mobile-app/01-screens-navigation-and-ux.md`
- `docs/02-architecture/03-architecture-decisions.md`

Implements:
1. **Platform-Aware Deep Link Resolver**:
   - `GET /v1/deeplink/resolve`:
     - Inspects `user-agent` to detect platform (`IOS`, `ANDROID`, `DESKTOP_WEB`, `OTHER`).
     - iOS: Surfaces Universal Link app scheme (`gamerbooker://venues/:id`) with fallback to Apple App Store URL.
     - Android: Surfaces Android Intent scheme (`intent://venues/:id#Intent;scheme=gamerbooker;package=ro.gamerbooker.app;end`) with Google Play Store URL.
     - Desktop / Web Browser: Surfaces responsive informational landing page URL (`https://gamerbooker.ro/venues/:id`), QR code scanning instructions, and store badges.
     - Automatically generates a deferred deep link token whenever `venue_id` is targeted so newly installed apps can retrieve the targeted venue and zone.
     - Supports direct 302 redirect via `?redirect=true`.
2. **Mandatory Mobile App Install Funnel & Web Checkout Prohibition Invariant**:
   - **Architectural Guarantee**: Reservations and checkouts are strictly exclusive to the native mobile applications (iOS / Android) installed from official stores.
   - Any attempt to initiate checkout or payment from desktop/web browsers (`POST /v1/checkout/web`) is categorically blocked with `403 WEB_CHECKOUT_PROHIBITED`.
3. **Deferred Deep Linking Across App Store Installation**:
   - Schema: `deferred_deeplinks` table with cryptographic tokens (`dlnk_...`) and configurable TTL.
   - `POST /v1/deeplink/deferred`: Generates and stores targeted venue, zone, package, and promotional attribution metadata.
   - `GET /v1/deeplink/deferred/:token`: Invoked by native mobile app on first launch after store install to route directly into venue/station selection; automatically marks token as consumed (`consumed = true`) and triggers funnel milestone tracking (`DEFERRED_LINK_RESOLVED`).
4. **On-Site QR Funnel Analytics & Conversion Tracking**:
   - Schema: `qr_funnel_events` table tracking anonymous milestone progression:
     `SCANNED` -> `STORE_REDIRECTED` -> `APP_OPENED` -> `DEFERRED_LINK_RESOLVED` -> `BOOKING_STARTED` -> `BOOKING_COMPLETED`.
   - `POST /v1/analytics/qr-funnel`: Anonymous telemetry ingestion without personal identity or raw IP address retention (privacy-preserving analytics).
   - `GET /v1/dashboard/venues/:venue_id/analytics/qr-funnel`: Manager and staff dashboard surfacing total on-site scans, app store redirects, app opens, completed bookings, conversion percentages, and platform breakdowns (`IOS`, `ANDROID`, `DESKTOP_WEB`).
   - Cross-venue isolation enforced via `VenueRoleGuard` (`404 RESOURCE_NOT_FOUND`).
5. **Customer Accessibility Layout View (EN 301 549 / WCAG 2.1 AA/AAA)**:
   - `GET /v1/venues/:id/layout/accessible-view`:
   - Structured non-visual layout tree removing all dependency on visual 2D coordinates or visual-only color indicators:
     - Venue summary, station counts (total vs available).
     - Hierarchical traversal: Venue -> Rooms -> Zones -> Resources.
     - Semantic status tokens: `AVAILABLE_FOR_BOOKING`, `CURRENTLY_BOOKED`, `UNDER_MAINTENANCE`, `OUT_OF_ORDER`.
     - Contrast-safe color tokens adhering to WCAG AAA contrast ratios (`#1B5E20` green, `#B71C1C` red, `#E65100` amber, `#424242` charcoal).
     - Rich `aria_label` and `voiceover_text` suitable for screen readers (VoiceOver, TalkBack) detailing station name, type, room, zone, availability status, hourly pricing, and hardware specifications (CPU, GPU, RAM, monitor refresh rate).

## 2. Domain Invariants & Rules
1. **Web Checkout Prohibition Invariant**:
   - Web browsers cannot execute solo or group booking checkouts. Bookings require rolling HMAC QR tokens only secure inside native mobile apps.
2. **Accessibility Independence**:
   - Visual floor maps must always have an identical, complete textual and auditory representation via the accessible view API.
3. **Deferred Context Expiration**:
   - Deferred deep links expire after TTL (default 7 days) and are marked consumed upon first resolution to prevent replay.

## 3. Database Schema
Migration `migrations/0030_deeplinks_and_accessibility.sql`:
- Created `deferred_deeplinks`:
  - `id, token, venue_id, zone_id, package_id, metadata, expires_at, consumed, consumed_at, created_at`
  - Indexes on `token` and `expires_at`
- Created `qr_funnel_events`:
  - `id, venue_id, session_id, milestone, platform, source_tag, created_at`
  - Index on `(venue_id, milestone, created_at DESC)`
- Granted least-privilege `SELECT, INSERT, UPDATE, DELETE` to `gamerbooker_app`.

## 4. API Specification
- `GET /v1/deeplink/resolve` (Public Deep Link Resolver)
- `POST /v1/deeplink/deferred` (Deferred Token Creation)
- `GET /v1/deeplink/deferred/:token` (Deferred Token Consumption)
- `POST /v1/checkout/web` (Enforces 403 `WEB_CHECKOUT_PROHIBITED`)
- `POST /v1/analytics/qr-funnel` (Anonymous Funnel Tracking)
- `GET /v1/dashboard/venues/:venue_id/analytics/qr-funnel` (Staff Analytics)
- `GET /v1/venues/:id/layout/accessible-view` (Public Non-Visual Accessible Hierarchy)

## 5. Acceptance Verification Plan
Automated integration test suite `tests/eng502-accessibility-and-deeplinks.spec.ts`:
- **Deep Link Resolver**: Verifies user-agent detection across iOS, Android, and Desktop Web, returning correct schemes, store links, and web landing notices.
- **Mandatory Mobile App Funnel**: Proves web checkout attempts return `403 WEB_CHECKOUT_PROHIBITED`.
- **Deferred Deep Linking**: Proves creation, context preservation (venue, zone, campaign), single-use consumption, and 404 for missing tokens.
- **On-site QR Analytics**: Proves milestone recording (`SCANNED`, `STORE_REDIRECTED`, etc.), aggregated dashboard summary calculation, and cross-venue isolation.
- **Accessibility Layout View**: Proves non-visual tree generation, status tokens, WCAG AAA contrast tokens, aria labels, and hardware specifications.
