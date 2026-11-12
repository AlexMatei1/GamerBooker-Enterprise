import 'catalog_client.dart';
import 'payment_gateway.dart';

class ReservationCheckoutFailure implements Exception {
  const ReservationCheckoutFailure(this.message, {this.holdMayRemain = false});
  final String message;

  /// When true, a completed or indeterminate payment may still settle through
  /// a webhook. The hold is intentionally retained until the server resolves
  /// it, so another customer cannot take the same slot prematurely.
  final bool holdMayRemain;
}

class ReservationCheckout {
  ReservationCheckout({
    required this.source,
    required this.paymentGateway,
    this.merchantDisplayName = 'GamerBooker',
    this.maxStatusPolls = 15,
    this.pollInterval = const Duration(seconds: 2),
  });

  final VenueCatalogSource source;
  final PaymentGateway paymentGateway;
  final String merchantDisplayName;
  final int maxStatusPolls;
  final Duration pollInterval;

  Future<CatalogCheckoutResult> complete(CatalogQuote quote) async {
    if (source.currentSession == null || source.currentSession!.mfaRequired) {
      throw const ReservationCheckoutFailure(
          'Autentifică-te înainte de a confirma rezervarea.');
    }
    if (quote.dueNowMinor > 0 && !paymentGateway.isConfigured) {
      throw const ReservationCheckoutFailure(
          'Plata online nu este configurată în această versiune a aplicației.');
    }

    CatalogHold? hold;
    var paymentMayHaveSucceeded = false;
    try {
      hold = await source.createHold(quote.id);
      if (quote.dueNowMinor <= 0) {
        return await source.confirmSoloCheckout(hold.id, null);
      }

      final paymentIntent = await source.createSoloPaymentIntent(hold.id);
      final clientSecret = paymentIntent.clientSecret;
      if (clientSecret == null || clientSecret.isEmpty) {
        throw const PaymentSheetFailed(
            'Plata online nu a returnat o sesiune sigură de plată.');
      }

      try {
        await paymentGateway.presentPaymentSheet(
          clientSecret: clientSecret,
          merchantDisplayName: merchantDisplayName,
        );
      } on PaymentSheetCancelled {
        await _releaseUnpaidHold(hold.id);
        throw const ReservationCheckoutFailure('Plata a fost anulată. Locul a fost eliberat.');
      } on PaymentSheetFailed catch (error) {
        await _releaseUnpaidHold(hold.id);
        throw ReservationCheckoutFailure(error.message);
      }

      // A successfully dismissed provider sheet is deliberately not treated as
      // proof of money received. Only our authenticated status endpoint,
      // written by the verified webhook, unlocks booking confirmation.
      paymentMayHaveSucceeded = true;
      final status = await _awaitTerminalPaymentStatus(hold.id, paymentIntent.id);
      if (status.status == 'CAPTURED') {
        return await source.confirmSoloCheckout(hold.id, paymentIntent.id);
      }
      if (status.status == 'FAILED' || status.status == 'CANCELLED') {
        await _releaseUnpaidHold(hold.id);
        throw const ReservationCheckoutFailure(
            'Plata nu a fost confirmată. Locul a fost eliberat.');
      }

      throw const ReservationCheckoutFailure(
        'Plata este încă în verificare. Păstrăm locul până primim confirmarea.',
        holdMayRemain: true,
      );
    } on ReservationCheckoutFailure {
      rethrow;
    } on CatalogFailure catch (error) {
      if (hold != null && !paymentMayHaveSucceeded) {
        await _releaseUnpaidHold(hold.id);
      }
      throw ReservationCheckoutFailure(
        paymentMayHaveSucceeded
            ? 'Plata poate fi în curs de confirmare. Nu încerca din nou până nu verifici rezervările.'
            : error.message,
        holdMayRemain: paymentMayHaveSucceeded,
      );
    } catch (_) {
      if (hold != null && !paymentMayHaveSucceeded) {
        await _releaseUnpaidHold(hold.id);
      }
      throw ReservationCheckoutFailure(
        paymentMayHaveSucceeded
            ? 'Plata poate fi în curs de confirmare. Nu încerca din nou până nu verifici rezervările.'
            : 'Rezervarea nu a putut fi finalizată. Locul a fost eliberat.',
        holdMayRemain: paymentMayHaveSucceeded,
      );
    }
  }

  Future<CatalogPaymentIntentStatus> _awaitTerminalPaymentStatus(
      String holdId, String intentId) async {
    CatalogPaymentIntentStatus? latest;
    for (var attempt = 0; attempt < maxStatusPolls; attempt++) {
      latest = await source.getSoloPaymentIntentStatus(holdId, intentId);
      if (latest.status == 'CAPTURED' ||
          latest.status == 'FAILED' ||
          latest.status == 'CANCELLED') {
        return latest;
      }
      if (attempt + 1 < maxStatusPolls) {
        await Future<void>.delayed(pollInterval);
      }
    }
    throw const ReservationCheckoutFailure(
      'Plata este încă în verificare. Păstrăm locul până primim confirmarea.',
      holdMayRemain: true,
    );
  }

  Future<void> _releaseUnpaidHold(String holdId) async {
    try {
      await source.releaseHold(holdId);
    } catch (_) {
      // A client cannot know whether a network failure happened before or after
      // the release. The original checkout error remains more useful to the
      // customer, while server hold expiry is the safe fallback.
    }
  }
}
