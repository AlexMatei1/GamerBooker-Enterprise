# App Store & Google Play Submission Guide — GamerBooker Enterprise v1.0

This runbook contains the exact metadata, legal declarations, and review notes required for submitting GamerBooker Mobile to the **Apple App Store** and **Google Play Store**.

---

## 1. Apple App Store Connect Metadata

### Primary Information
* **App Name:** `GamerBooker — Arena Pass`
* **Bundle Identifier:** `ro.gamerbooker.app`
* **SKU:** `GB-IOS-01`
* **Primary Category:** Entertainment / Lifestyle
* **Secondary Category:** Utilities
* **Target Audience Age Rating:** 16+ (in compliance with Romanian Law 42/2024 for minors in internet cafés & esports arenas)

### App Description
> GamerBooker is the enterprise gaming workstation reservation and in-seat arena companion app.
> - **Interactive Seating Minimap:** Select high-end RTX 4090 rigs, console lounges, and streaming pods with real-time hardware telemetry.
> - **Apple Wallet Arena Pass:** Instant turnstile entry pass with dynamic rolling HMAC security QR codes and venue Wi-Fi access.
> - **Dynamic Island Live Activity:** Track your active gaming session time remaining directly from the lock screen.
> - **In-Seat F&B Dispatch:** Order energy drinks and snacks delivered straight to your workstation with Crockford Base32 verification codes.

### Keywords
`gaming,esports arena,pc cafe,lan party,nexus gaming,booking,seat reservation,arena pass,rtx 4090,romania esports`

### Support & Marketing URLs
* **Support URL:** `https://gamerbooker.ro/support`
* **Marketing URL:** `https://gamerbooker.ro`
* **Privacy Policy URL:** `https://gamerbooker.ro/legal/privacy`

---

## 2. Apple Review Guidelines Compliance & Sign-offs

### Guideline 5.1.1(v) — Account Deletion
* **Requirement:** Apps supporting account creation must also allow users to initiate deletion of their account from within the app.
* **Implementation:** Located in `Profile Screen -> Legal & Regulatory Terms -> "Delete My Account & Personal Data"`.
* **Behavior:** Revokes all active refresh tokens, executes GDPR-compliant data purge or anonymization, and immediately clears the local session.

### Guideline 3.1.1 — In-App Purchases vs. Real-World Services
* **Notice:** Workstation rental, arena entry fees, and physical food/beverage items represent physical real-world services consumed outside the app. They are processed via Credit Card / Apple Pay via standard payment gateways (Stripe / Netopia) and are exempt from Apple 30% IAP commissions.

### Romanian Law 42/2024 & Curfew Protection
* **Requirement:** Romanian legislation strictly forbids unaccompanied minors under 16 years of age in public internet/gaming arenas between 22:00 and 06:00.
* **Implementation:** The checkout flow enforces statutory age verification. Minors are barred from reserving slots spanning curfew hours without accompanied supervisor approval.

---

## 3. Demo Account for App Store Review Team
Provide these credentials in the **App Review Information** section:
* **Username:** `alex@nexus.ro`
* **Demo TOTP Secret / Code:** `123456` (or pre-verified session)
* **Venue:** Nexus Gaming Arena Bucharest
* **Demo Station:** VIP-01 (RTX 4090)

---

## 4. Native Compilation Commands
To compile native iOS and Android binaries using Capacitor:

```bash
# 1. Install Capacitor CLI and native platform bridges
cd apps/mobile-app
npm install --save @capacitor/core
npm install --save-dev @capacitor/cli @capacitor/ios @capacitor/android

# 2. Build production web bundle
npm run build

# 3. Add native platforms and sync assets
npx cap add ios
npx cap add android
npx cap sync

# 4. Open in Xcode / Android Studio
npx cap open ios
npx cap open android
```
