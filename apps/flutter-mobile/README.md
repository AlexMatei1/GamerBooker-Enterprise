# GamerBooker Android preview

The default Flutter app connects to the GamerBooker backend for the published
venue catalog and real availability windows. The account dialog lets a customer
create an account or sign in, and supports optional TOTP. In local
approval-only mode, a newly registered customer is signed in immediately. In a
normal environment, the app leaves a new account signed out until its email is
verified. The bearer session stays in memory and is discarded on logout or app
restart. The explicit `GAMERBOOKER_DEMO=true` mode is debug-only.

The detail page can request a real one-hour price quote for the first available
window. This build does not yet hold a station from the UI, process the initial
reservation payment, show a live boarding pass/QR, cancel a reservation, or send
a bar order. Do not use the old simulated booking flow as proof of a server
reservation.

## Build and install on Android

Install a Flutter SDK compatible with this project's Android Gradle settings,
an Android SDK and JDK 17. From this directory:

```powershell
flutter pub get
flutter analyze
flutter build apk --debug
adb devices -l
adb -s <device-serial> install -r build/app/outputs/flutter-apk/app-debug.apk
adb -s <device-serial> shell am start -n ro.gamerbooker.app.preview/ro.gamerbooker.app.MainActivity
```

On Windows, set `JAVA_HOME` to JDK 17 and make `flutter` and `adb`
available on PATH. Set Flutter's Android SDK path with
`flutter config --android-sdk <sdk-directory>` if needed. Enable USB debugging
on the phone and accept its authorization prompt. Use the serial reported as
`device`; an `unauthorized` device requires approval on the phone. Some
phones also require USB app installation to be enabled or an install prompt
to be accepted. If ADB installation does not complete, copy the debug APK to
the phone and open it with the file manager; Android may ask you to allow that
file manager to install the app.

The debug build uses application ID `ro.gamerbooker.app.preview` and is
installed separately from `ro.gamerbooker.app`. Installing with `-r`
updates an existing copy of this preview without deleting its data.

## Connect to the local Windows API

With USB debugging enabled and the phone authorized, forward the local API port:

```powershell
adb reverse tcp:3000 tcp:3000
```

The debug app defaults to `http://127.0.0.1:3000`. For a release build, set
`GAMERBOOKER_API_BASE_URL` to the trusted HTTPS API origin; cleartext HTTP is
restricted to the debug loopback configuration. To remove the temporary
forward later, run `adb reverse --remove tcp:3000`.

Follow `handoff/HANDOFF-END-TO-END-2026-11-06.md` for remaining checkout,
payment, pass, cancellation, and full end-to-end work.
