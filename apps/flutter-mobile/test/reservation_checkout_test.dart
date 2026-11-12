import 'package:flutter_test/flutter_test.dart';
import 'package:gamerbooker_mobile/catalog/catalog_client.dart';
import 'package:gamerbooker_mobile/catalog/payment_gateway.dart';
import 'package:gamerbooker_mobile/catalog/reservation_checkout.dart';

class _FakeSource implements VenueCatalogSource {
  _FakeSource({
    this.intentStatuses = const ['CAPTURED'],
    this.failCreateIntent,
    this.blankClientSecret = false,
  });

  final List<String> intentStatuses;
  final Object? failCreateIntent;
  final bool blankClientSecret;

  int holdCalls = 0;
  int statusCalls = 0;
  final List<String> released = <String>[];
  final List<String?> confirmedWith = <String?>[];

  @override
  MobileSession? currentSession =
      const MobileSession(userId: 'customer', token: 'token');

  @override
  Future<List<CatalogVenue>> fetchVenues() async => const [];

  @override
  Future<List<CatalogResourceAvailability>> fetchAvailability(
          String venueId, DateTime from, DateTime to) async =>
      const [];

  @override
  Future<CustomerRegistration> register(String email, String password) async =>
      throw UnimplementedError();

  @override
  Future<MobileSession> login(String email, String password) async =>
      throw UnimplementedError();

  @override
  Future<MobileSession> verifyMfa(String code) async =>
      throw UnimplementedError();

  @override
  Future<void> logout() async {
    currentSession = null;
  }

  @override
  Future<CatalogQuote> createQuote(
          String venueId, String resourceId, DateTime startsAt, DateTime endsAt) async =>
      throw UnimplementedError();

  @override
  Future<CatalogHold> createHold(String quoteId) async {
    holdCalls++;
    return CatalogHold(
      id: 'hold-1',
      expiresAt: DateTime.now().add(const Duration(minutes: 10)),
    );
  }

  @override
  Future<void> releaseHold(String holdId) async {
    released.add(holdId);
  }

  @override
  Future<CatalogPaymentIntent> createSoloPaymentIntent(String holdId) async {
    if (failCreateIntent != null) throw failCreateIntent!;
    return CatalogPaymentIntent(
      id: 'pi-1',
      holdId: holdId,
      amountMinor: 5000,
      currency: 'RON',
      status: 'REQUIRES_PAYMENT',
      clientSecret: blankClientSecret ? null : 'secret-1',
    );
  }

  @override
  Future<CatalogPaymentIntentStatus> getSoloPaymentIntentStatus(
      String holdId, String intentId) async {
    final index = statusCalls < intentStatuses.length
        ? statusCalls
        : intentStatuses.length - 1;
    statusCalls++;
    return CatalogPaymentIntentStatus(
      intentId: intentId,
      holdId: holdId,
      status: intentStatuses[index],
      updatedAt: DateTime.now(),
    );
  }

  @override
  Future<CatalogCheckoutResult> confirmSoloCheckout(
      String holdId, String? paymentIntentId) async {
    confirmedWith.add(paymentIntentId);
    return CatalogCheckoutResult(
      booking: _booking,
      qrToken: 'qr-token',
      qrExpiresAt: DateTime.now().add(const Duration(hours: 1)),
    );
  }
}

final CatalogBooking _booking = CatalogBooking(
  id: 'booking-1',
  publicCode: 'GB-1',
  venueId: 'venue-1',
  status: 'PENDING_CHECK_IN',
  startsAt: DateTime(2026, 11, 1, 18),
  endsAt: DateTime(2026, 11, 1, 20),
  totalMinor: 5000,
  dueNowMinor: 5000,
  balanceMinor: 0,
  currency: 'RON',
);

class _FakeGateway implements PaymentGateway {
  _FakeGateway({this.configured = true, this.error});

  bool configured;
  Object? error;
  int calls = 0;
  String? lastSecret;

  @override
  bool get isConfigured => configured;

  @override
  Future<void> initialize() async {}

  @override
  Future<void> presentPaymentSheet({
    required String clientSecret,
    required String merchantDisplayName,
  }) async {
    calls++;
    lastSecret = clientSecret;
    if (error != null) throw error!;
  }
}

CatalogQuote _quote({int dueNow = 5000}) => CatalogQuote(
      id: 'quote-1',
      totalMinor: 5000,
      dueNowMinor: dueNow,
      currency: 'RON',
      expiresAt: DateTime.now().add(const Duration(minutes: 15)),
    );

ReservationCheckout _checkout(
  VenueCatalogSource source,
  PaymentGateway gateway, {
  int maxPolls = 15,
}) =>
    ReservationCheckout(
      source: source,
      paymentGateway: gateway,
      maxStatusPolls: maxPolls,
      pollInterval: Duration.zero,
    );

void main() {
  test('zero upfront confirms the booking without touching the payment sheet',
      () async {
    final source = _FakeSource();
    final gateway = _FakeGateway();

    await _checkout(source, gateway).complete(_quote(dueNow: 0));

    expect(source.holdCalls, 1);
    expect(source.confirmedWith, [null]);
    expect(gateway.calls, 0);
  });

  test('refuses to start without an authenticated session', () async {
    final source = _FakeSource()..currentSession = null;
    final gateway = _FakeGateway();

    await expectLater(
      _checkout(source, gateway).complete(_quote()),
      throwsA(isA<ReservationCheckoutFailure>()),
    );
    expect(source.holdCalls, 0);
    expect(gateway.calls, 0);
  });

  test('refuses a session still awaiting the MFA second factor', () async {
    final source = _FakeSource()
      ..currentSession =
          const MobileSession(userId: 'customer', token: 'token', mfaRequired: true);
    final gateway = _FakeGateway();

    await expectLater(
      _checkout(source, gateway).complete(_quote()),
      throwsA(isA<ReservationCheckoutFailure>()),
    );
    expect(source.holdCalls, 0);
  });

  test('refuses an upfront charge when no gateway is configured', () async {
    final source = _FakeSource();
    final gateway = _FakeGateway(configured: false);

    await expectLater(
      _checkout(source, gateway).complete(_quote()),
      throwsA(isA<ReservationCheckoutFailure>()),
    );
    expect(source.holdCalls, 0);
    expect(source.released, isEmpty);
  });

  test('a cancelled sheet releases the hold and never confirms', () async {
    final source = _FakeSource();
    final gateway = _FakeGateway(error: const PaymentSheetCancelled());

    await expectLater(
      _checkout(source, gateway).complete(_quote()),
      throwsA(isA<ReservationCheckoutFailure>()),
    );
    expect(source.released, ['hold-1']);
    expect(source.confirmedWith, isEmpty);
  });

  test('a failed sheet releases the hold and never confirms', () async {
    final source = _FakeSource();
    final gateway = _FakeGateway(error: const PaymentSheetFailed('card declined'));

    await expectLater(
      _checkout(source, gateway).complete(_quote()),
      throwsA(isA<ReservationCheckoutFailure>()),
    );
    expect(source.released, ['hold-1']);
    expect(source.confirmedWith, isEmpty);
  });

  test('a successful sheet is not proof: confirmation waits for server CAPTURED',
      () async {
    final source = _FakeSource(intentStatuses: const ['PENDING', 'CAPTURED']);
    final gateway = _FakeGateway();

    await _checkout(source, gateway).complete(_quote());

    // The sheet was presented once, but the client asked the server twice:
    // the first poll was still PENDING and only the second CAPTURED unlocked the
    // confirmation. A dismissed sheet alone can never become a booking.
    expect(gateway.calls, 1);
    expect(source.statusCalls, 2);
    expect(source.confirmedWith, ['pi-1']);
  });

  test('an intent without a client secret never opens the sheet', () async {
    final source = _FakeSource(blankClientSecret: true);
    final gateway = _FakeGateway();

    await expectLater(
      _checkout(source, gateway).complete(_quote()),
      throwsA(isA<ReservationCheckoutFailure>()),
    );
    expect(gateway.calls, 0);
    expect(source.released, ['hold-1']);
    expect(source.confirmedWith, isEmpty);
  });

  test('FAILED payment status releases the hold and never confirms', () async {
    final source = _FakeSource(intentStatuses: const ['FAILED']);
    final gateway = _FakeGateway();

    await expectLater(
      _checkout(source, gateway).complete(_quote()),
      throwsA(isA<ReservationCheckoutFailure>()),
    );
    expect(source.released, ['hold-1']);
    expect(source.confirmedWith, isEmpty);
  });

  test('CANCELLED payment status releases the hold and never confirms', () async {
    final source = _FakeSource(intentStatuses: const ['CANCELLED']);
    final gateway = _FakeGateway();

    await expectLater(
      _checkout(source, gateway).complete(_quote()),
      throwsA(isA<ReservationCheckoutFailure>()),
    );
    expect(source.released, ['hold-1']);
    expect(source.confirmedWith, isEmpty);
  });

  test('a failure creating the payment intent releases the hold', () async {
    final source = _FakeSource(
      failCreateIntent: const CatalogFailure('payment provider unavailable'),
    );
    final gateway = _FakeGateway();

    await expectLater(
      _checkout(source, gateway).complete(_quote()),
      throwsA(isA<ReservationCheckoutFailure>()),
    );
    // No sheet was opened, so no money can be in flight: the slot is released.
    expect(gateway.calls, 0);
    expect(source.released, ['hold-1']);
    expect(source.confirmedWith, isEmpty);
  });

  test('CAPTURED status confirms with the intent id as proof', () async {
    final source = _FakeSource(intentStatuses: const ['PENDING', 'CAPTURED']);
    final gateway = _FakeGateway();

    final result = await _checkout(source, gateway).complete(_quote());

    expect(result.qrToken, 'qr-token');
    expect(source.confirmedWith, ['pi-1']);
    expect(source.released, isEmpty);
    expect(gateway.calls, 1);
    expect(gateway.lastSecret, 'secret-1');
  });

  test('a status poll timeout keeps the hold and reports uncertain payment',
      () async {
    final source = _FakeSource(intentStatuses: const ['PENDING']);
    final gateway = _FakeGateway();

    await expectLater(
      _checkout(source, gateway, maxPolls: 3).complete(_quote()),
      throwsA(
        isA<ReservationCheckoutFailure>().having(
          (error) => error.holdMayRemain,
          'holdMayRemain',
          isTrue,
        ),
      ),
    );
    expect(source.statusCalls, 3);
    expect(source.released, isEmpty);
    expect(source.confirmedWith, isEmpty);
  });
}
