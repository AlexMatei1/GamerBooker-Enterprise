# MOB-FLUTTER-001 — Flutter Android preview

The debug preview follows the mobile web's five-tab navigation and core demo flows. It is a local simulation, not production parity: there is no backend, real payment, valid check-in QR, fulfillment, or web BroadcastChannel synchronization. State is in memory and resets when the process restarts.

On 2026-11-04 `flutter analyze --no-pub` passed and `flutter build apk --debug --no-pub` succeeded. The resulting APK was installed with `adb -s CNXNU20922109640 install -r` (Success) and launched on PPA-LX2. Flutter warned that Gradle 8.14, AGP 8.11.1 and Kotlin 2.2.20 will need future upgrades. Screenshots and checked interactions are in [parity evidence](../notes/flutter-preview/parity/README.md). The [preview README](../apps/flutter-mobile/README.md) contains build instructions.

The sample 30% deposit is 31.50 RON on 105 RON; ENTERPRISE10 discounts the deposit by 3.15 RON, leaving 28.35 deposit and 73.50 at reception, for a final total of 101.85. The simulated pass carries that total; extension adds the station's hourly rate. Policy and wallet text are sample simulations. Server-authoritative availability, prices, policies, authentication, payment, QR and accessibility/product acceptance remain open.
