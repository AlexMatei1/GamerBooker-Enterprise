# Flutter parity evidence — 2026-11-04

Device: Huawei PPA-LX2, serial CNXNU20922109640. Fresh debug build analyzed, built, installed and launched. Screenshots through `pass-extended.png` and `account.png` were taken on the preceding build; the final build only changes bar card height. `bar-final.png` confirms the overflow fix on the final build. `account-bottom.png` and `logout.png` are also from the final build.

| Mobile web reference | Flutter implementation in `lib/parity_app.dart` | Evidence and limits |
| --- | --- | --- |
| `ExploreVenues.tsx` | `explore()` | `explore.png`; venue cards and search field visible. Search empty-state/filter behavior not verified in this run. |
| `SeatPicker.tsx` | `reserve()` | `reserve.png`; POD-A1 and 3h selected for checkout. Unavailable station behavior not verified. |
| `BookingCheckout.tsx` | `checkoutPage()` | `checkout.png`, `checkout-promo.png`; 105 subtotal, 31.50 deposit, 73.50 balance, then 3.15 discount, 28.35 deposit, 101.85 total. Keyboard input, Android back to dismiss it, and scrolling exercised. Sample policy shown; wallet choice not exercised. |
| `ActivePassView.tsx` | `passPage()` | `pass.png`, `pass-extended.png`; booking produces 101.85 pass and extension adds 35 to 136.85. Sample QR is invalid for check-in. |
| `BarOrderingView.tsx` | `bar()` | `bar-final.png`; product card overflow seen in `bar.png` corrected in final build. Quantity changes and order confirmation not verified in this run. |
| `CustomerProfile.tsx` | `account()` | `account.png`, `account-bottom.png`, `logout.png`; scrolled to logout, which returns to Explore with Demo ready. Account deletion/reset and support not exercised. |
| `BottomNav.tsx` | `AppShell` | All five tabs opened; session timer remained visible while navigating. Cart persistence across tabs not verified. |

These are local demo flows, not live booking, payment, check-in or order fulfillment; web BroadcastChannel synchronization is absent. Visual and behavior parity is partial and does not establish acceptance or accessibility compliance.
