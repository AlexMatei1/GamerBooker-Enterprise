/// The native payment sheet is deliberately isolated behind this contract so
/// booking logic can be tested without card fields, a Stripe SDK, or a charge.
abstract class PaymentGateway {
  bool get isConfigured;

  Future<void> initialize();

  /// Returns only after the provider's native payment sheet reports success.
  /// The caller must still ask GamerBooker's server whether the signed webhook
  /// has recorded a capture before confirming a booking.
  Future<void> presentPaymentSheet({
    required String clientSecret,
    required String merchantDisplayName,
  });
}

class PaymentGatewayUnavailable implements Exception {
  const PaymentGatewayUnavailable([this.message =
      'Plata online nu este configurată pentru această aplicație.']);
  final String message;
}

class PaymentSheetCancelled implements Exception {
  const PaymentSheetCancelled();
}

class PaymentSheetFailed implements Exception {
  const PaymentSheetFailed([this.message =
      'Plata nu a putut fi finalizată. Încearcă din nou.']);
  final String message;
}

class UnavailablePaymentGateway implements PaymentGateway {
  const UnavailablePaymentGateway([this.reason =
      'Plata online nu este configurată pentru această aplicație.']);
  final String reason;

  @override
  bool get isConfigured => false;

  @override
  Future<void> initialize() async {}

  @override
  Future<void> presentPaymentSheet({
    required String clientSecret,
    required String merchantDisplayName,
  }) {
    throw PaymentGatewayUnavailable(reason);
  }
}
