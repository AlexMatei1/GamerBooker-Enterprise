import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gamerbooker_mobile/catalog/catalog_app.dart';
import 'package:gamerbooker_mobile/catalog/catalog_client.dart';

class _Source implements VenueCatalogSource {
  _Source(this.responses, {this.availability = const []});
  final List<Future<List<CatalogVenue>>> responses;
  final List<CatalogResourceAvailability> availability;
  int calls = 0;
  int quoteCalls = 0;
  int registrationCalls = 0;
  @override
  MobileSession? currentSession;

  @override
  Future<CustomerRegistration> register(String email, String password) async {
    registrationCalls++;
    currentSession =
        const MobileSession(userId: 'new-customer', token: 'new-token');
    return CustomerRegistration.signedIn(currentSession!);
  }

  @override
  Future<MobileSession> login(String email, String password) async =>
      currentSession =
          const MobileSession(userId: 'test-user', token: 'test-token');

  @override
  Future<MobileSession> verifyMfa(String code) async => currentSession =
      const MobileSession(userId: 'test-user', token: 'test-token');

  @override
  Future<void> logout() async {
    currentSession = null;
  }

  @override
  Future<CatalogQuote> createQuote(String venueId, String resourceId,
      DateTime startsAt, DateTime endsAt) async {
    quoteCalls++;
    return CatalogQuote(
        id: 'quote',
        totalMinor: 0,
        dueNowMinor: 0,
        currency: 'RON',
        expiresAt: DateTime.utc(2026));
  }

  @override
  Future<CatalogHold> createHold(String quoteId) async =>
      CatalogHold(id: 'hold', expiresAt: DateTime.utc(2026));

  @override
  Future<void> releaseHold(String holdId) async {}

  @override
  Future<List<CatalogVenue>> fetchVenues() => responses[calls++];
  @override
  Future<List<CatalogResourceAvailability>> fetchAvailability(
          String venueId, DateTime from, DateTime to) async =>
      availability;

  @override
  Future<CatalogPaymentIntent> createSoloPaymentIntent(String holdId) async =>
      CatalogPaymentIntent(
        id: 'intent-1',
        holdId: holdId,
        amountMinor: 0,
        currency: 'RON',
        status: 'REQUIRES_PAYMENT',
        clientSecret: 'secret',
      );

  @override
  Future<CatalogPaymentIntentStatus> getSoloPaymentIntentStatus(
          String holdId, String intentId) async =>
      CatalogPaymentIntentStatus(
        intentId: intentId,
        holdId: holdId,
        status: 'CAPTURED',
        updatedAt: DateTime.utc(2026),
      );

  @override
  Future<CatalogCheckoutResult> confirmSoloCheckout(
          String holdId, String? paymentIntentId) async =>
      CatalogCheckoutResult(
        booking: CatalogBooking(
          id: 'booking-1',
          publicCode: 'GB-TEST',
          venueId: 'real-id',
          status: 'CONFIRMED',
          startsAt: DateTime.utc(2026, 11, 7, 10),
          endsAt: DateTime.utc(2026, 11, 7, 11),
          totalMinor: 0,
          dueNowMinor: 0,
          balanceMinor: 0,
          currency: 'RON',
        ),
        qrToken: 'qr-token',
        qrExpiresAt: DateTime.utc(2099),
      );
}

const _venue = CatalogVenue(
    id: 'real-id', name: 'Numele din API', timezone: 'Europe/Paris');

void main() {
  testWidgets('loading and empty state contain no automatic demo catalog',
      (tester) async {
    final pending = Completer<List<CatalogVenue>>();
    final source = _Source([pending.future]);
    await tester.pumpWidget(LiveCatalogApp(source: source));
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    pending.complete([]);
    await tester.pumpAndSettle();
    expect(find.text('Locurile bune se pregătesc.'), findsOneWidget);
    expect(find.textContaining('Nexus'), findsNothing);
    expect(find.textContaining('CyberSphere'), findsNothing);
    expect(find.text('DEMO LOCAL'), findsNothing);
  });

  testWidgets(
      'error remains actionable and retry renders actual named venue details',
      (tester) async {
    final pending = Completer<List<CatalogVenue>>();
    final source = _Source([
      pending.future,
      Future.value([_venue])
    ]);
    await tester.pumpWidget(LiveCatalogApp(source: source));
    pending
        .completeError(const CatalogFailure('Conexiunea nu este disponibilă.'));
    await tester.pumpAndSettle();
    expect(find.text('Catalog indisponibil'), findsOneWidget);
    expect(find.text('Conexiunea nu este disponibilă.'), findsOneWidget);
    await tester.tap(find.text('Reîncearcă'));
    await tester.pumpAndSettle();
    expect(source.calls, 2);
    expect(find.text(_venue.name), findsOneWidget);
    await tester.tap(find.text(_venue.name));
    await tester.pumpAndSettle();
    expect(find.text('Fus orar: Europe/Paris'), findsOneWidget);
    expect(find.textContaining('RON'), findsNothing);
    expect(find.textContaining('locuri libere'), findsNothing);
  });

  testWidgets(
      'late response from an earlier refresh does not replace current catalog',
      (tester) async {
    final first = Completer<List<CatalogVenue>>();
    final second = Completer<List<CatalogVenue>>();
    final source = _Source([first.future, second.future]);
    await tester.pumpWidget(LiveCatalogApp(source: source));
    await tester.tap(find.byTooltip('Actualizează catalogul'));
    await tester.pump();
    second.complete([_venue]);
    await tester.pumpAndSettle();
    first.complete([
      const CatalogVenue(id: 'stale', name: 'Răspuns vechi', timezone: 'UTC')
    ]);
    await tester.pumpAndSettle();
    expect(find.text(_venue.name), findsOneWidget);
    expect(find.text('Răspuns vechi'), findsNothing);
  });

  testWidgets('customer can sign in to the mobile account dialog',
      (tester) async {
    final source = _Source([
      Future.value([_venue])
    ]);
    await tester.pumpWidget(LiveCatalogApp(source: source));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Autentificare'));
    await tester.pumpAndSettle();
    await tester.enterText(
        find.byType(TextField).at(0), 'customer@example.test');
    await tester.enterText(find.byType(TextField).at(1), 'password');
    await tester.tap(find.widgetWithText(FilledButton, 'Autentificare'));
    await tester.pumpAndSettle();
    expect(source.currentSession?.userId, 'test-user');
    expect(find.byTooltip('Cont client'), findsOneWidget);
  });

  testWidgets('customer can create a local account from the mobile dialog',
      (tester) async {
    final source = _Source([
      Future.value([_venue])
    ]);
    await tester.pumpWidget(LiveCatalogApp(source: source));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Autentificare'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Creează cont'));
    await tester.pumpAndSettle();
    await tester.enterText(
        find.byType(TextField).at(0), 'new.customer@example.test');
    await tester.enterText(find.byType(TextField).at(1), 'safe password');
    await tester.tap(find.byType(Checkbox));
    await tester.tap(find.widgetWithText(FilledButton, 'Creează cont'));
    await tester.pumpAndSettle();
    expect(source.registrationCalls, 1);
    expect(source.currentSession?.userId, 'new-customer');
    expect(find.byTooltip('Cont client'), findsOneWidget);
  });

  testWidgets(
      'customer registration remains usable above a visible keyboard on a small screen',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(360, 640));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    tester.view.viewInsets = const FakeViewPadding(bottom: 300);
    addTearDown(tester.view.resetViewInsets);

    final source = _Source([
      Future.value([_venue])
    ]);
    await tester.pumpWidget(LiveCatalogApp(source: source));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Autentificare'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Creează cont'));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(FilledButton, 'Creează cont'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);

    await tester.ensureVisible(find.byType(Checkbox));
    expect(find.byType(Checkbox), findsOneWidget);
    await tester.ensureVisible(
        find.widgetWithText(FilledButton, 'Creează cont'));
    expect(find.widgetWithText(FilledButton, 'Creează cont'), findsOneWidget);
  });

  testWidgets('available slot asks for login then shows a real API quote',
      (tester) async {
    final window = CatalogWindow(
        DateTime.utc(2026, 11, 7, 10), DateTime.utc(2026, 11, 7, 12));
    final source = _Source([
      Future.value([_venue])
    ], availability: [
      CatalogResourceAvailability(
          id: 'resource-1', name: 'PC 01', type: 'PC', windows: [window]),
    ]);
    await tester.pumpWidget(LiveCatalogApp(source: source));
    await tester.pumpAndSettle();
    await tester.tap(find.text(_venue.name));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Vezi prețul pentru prima oră liberă'));
    await tester.pumpAndSettle();
    await tester.enterText(
        find.byType(TextField).at(0), 'customer@example.test');
    await tester.enterText(find.byType(TextField).at(1), 'password');
    await tester.tap(find.widgetWithText(FilledButton, 'Autentificare'));
    await tester.pumpAndSettle();
    expect(source.quoteCalls, 1);
    expect(find.text('Estimare pentru o oră'), findsOneWidget);
  });
}
