import 'package:flutter/material.dart';
import 'package:flutter_stripe/flutter_stripe.dart';

import 'payment_gateway.dart';

/// Native Stripe PaymentSheet adapter. It accepts only a publishable key from
/// dart-define; secret keys and card data never enter the Flutter app.
class StripePaymentSheetGateway implements PaymentGateway {
  StripePaymentSheetGateway({required String publishableKey})
      : _publishableKey = publishableKey.trim();

  final String _publishableKey;

  @override
  bool get isConfigured => _publishableKey.startsWith('pk_');

  @override
  Future<void> initialize() async {
    if (!isConfigured) return;
    Stripe.publishableKey = _publishableKey;
    await Stripe.instance.applySettings();
  }

  @override
  Future<void> presentPaymentSheet({
    required String clientSecret,
    required String merchantDisplayName,
  }) async {
    if (!isConfigured) throw const PaymentGatewayUnavailable();
    if (clientSecret.trim().isEmpty) {
      throw const PaymentSheetFailed(
          'Plata online nu a putut fi inițializată în siguranță.');
    }
    try {
      await Stripe.instance.initPaymentSheet(
        paymentSheetParameters: SetupPaymentSheetParameters(
          merchantDisplayName: merchantDisplayName,
          paymentIntentClientSecret: clientSecret,
          style: ThemeMode.system,
        ),
      );
      await Stripe.instance.presentPaymentSheet();
    } on StripeException catch (error) {
      if (error.error.code == FailureCode.Canceled) {
        throw const PaymentSheetCancelled();
      }
      throw const PaymentSheetFailed();
    } catch (_) {
      throw const PaymentSheetFailed();
    }
  }
}
