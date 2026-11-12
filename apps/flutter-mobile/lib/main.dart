import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'catalog/catalog_app.dart';
import 'catalog/catalog_client.dart';
import 'catalog/payment_gateway.dart';
import 'catalog/stripe_payment_gateway.dart';
import 'parity_app.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final demo = CatalogConfiguration.demoAllowed(
      requested: const bool.fromEnvironment('GAMERBOOKER_DEMO'),
      debug: kDebugMode);
  final gateway = StripePaymentSheetGateway(
    publishableKey:
        const String.fromEnvironment('GAMERBOOKER_STRIPE_PUBLISHABLE_KEY'),
  );
  PaymentGateway paymentGateway = gateway;
  try {
    await gateway.initialize();
  } catch (_) {
    paymentGateway = const UnavailablePaymentGateway(
        'Plata online nu a putut fi inițializată în siguranță.');
  }
  runApp(demo
      ? const GamerBookerApp()
      : LiveCatalogApp(paymentGateway: paymentGateway));
}
