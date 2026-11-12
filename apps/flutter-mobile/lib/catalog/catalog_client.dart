import 'dart:convert';
import 'dart:io';

class CatalogConfiguration {
  static Uri apiOrigin(String configured, {required bool debug}) {
    final value = configured.trim();
    if (value.isEmpty) {
      if (debug) return Uri.parse('http://127.0.0.1:3000');
      throw const FormatException('Configurează adresa HTTPS a catalogului.');
    }
    final uri = Uri.tryParse(value);
    if (uri == null ||
        uri.host.isEmpty ||
        uri.userInfo.isNotEmpty ||
        uri.hasQuery ||
        uri.hasFragment ||
        (uri.path.isNotEmpty && uri.path != '/') ||
        !(uri.scheme == 'https' ||
            (debug && uri.scheme == 'http' && uri.host == '127.0.0.1'))) {
      throw const FormatException('Catalogul necesită o adresă HTTPS validă.');
    }
    return uri;
  }

  static bool demoAllowed({required bool requested, required bool debug}) =>
      requested && debug;
}

class CatalogVenue {
  const CatalogVenue(
      {required this.id,
      required this.name,
      required this.timezone,
      this.slug});
  final String id;
  final String name;
  final String timezone;
  final String? slug;

  factory CatalogVenue.fromJson(Object? json) {
    if (json is! Map<String, dynamic>) throw const FormatException();
    String field(String key) {
      final value = json[key];
      if (value is! String || value.trim().isEmpty) {
        throw const FormatException();
      }
      return value;
    }

    final slug = json['slug'];
    if (slug != null && slug is! String) throw const FormatException();
    return CatalogVenue(
        id: field('id'),
        name: field('name'),
        timezone: field('timezone'),
        slug: slug as String?);
  }

  static List<CatalogVenue> decode(String body) {
    final json = jsonDecode(body);
    if (json is! Map<String, dynamic> || json['venues'] is! List) {
      throw const FormatException();
    }
    final venues = (json['venues'] as List).map(CatalogVenue.fromJson).toList();
    if (venues.map((venue) => venue.id).toSet().length != venues.length) {
      throw const FormatException();
    }
    return List.unmodifiable(venues);
  }
}

class CatalogWindow {
  const CatalogWindow(this.start, this.end);
  final DateTime start;
  final DateTime end;
}

class CatalogResourceAvailability {
  const CatalogResourceAvailability({
    required this.id,
    required this.name,
    required this.type,
    required this.windows,
  });
  final String id;
  final String name;
  final String type;
  final List<CatalogWindow> windows;

  factory CatalogResourceAvailability.fromJson(Object? json) {
    if (json is! Map<String, dynamic> ||
        json['resourceId'] is! String ||
        json['resourceName'] is! String ||
        json['resourceType'] is! String ||
        json['availableWindows'] is! List) {
      throw const FormatException();
    }
    final windows = (json['availableWindows'] as List).map((entry) {
      if (entry is! Map<String, dynamic> ||
          entry['start'] is! String ||
          entry['end'] is! String) {
        throw const FormatException();
      }
      final start = DateTime.tryParse(entry['start'] as String);
      final end = DateTime.tryParse(entry['end'] as String);
      if (start == null || end == null || !start.isBefore(end)) {
        throw const FormatException();
      }
      return CatalogWindow(start, end);
    }).toList(growable: false);
    return CatalogResourceAvailability(
      id: json['resourceId'] as String,
      name: json['resourceName'] as String,
      type: json['resourceType'] as String,
      windows: List.unmodifiable(windows),
    );
  }
}

class CatalogQuote {
  const CatalogQuote(
      {required this.id,
      required this.totalMinor,
      required this.dueNowMinor,
      required this.currency,
      required this.expiresAt});
  final String id;
  final int totalMinor;
  final int dueNowMinor;
  final String currency;
  final DateTime expiresAt;

  factory CatalogQuote.fromJson(Object? json) {
    if (json is! Map<String, dynamic> ||
        json['quote_id'] is! String ||
        json['total_minor'] is! num ||
        json['due_now_minor'] is! num ||
        json['currency'] is! String ||
        json['expires_at'] is! String) {
      throw const FormatException();
    }
    final expires = DateTime.tryParse(json['expires_at'] as String);
    if (expires == null) throw const FormatException();
    return CatalogQuote(
      id: json['quote_id'] as String,
      totalMinor: (json['total_minor'] as num).toInt(),
      dueNowMinor: (json['due_now_minor'] as num).toInt(),
      currency: json['currency'] as String,
      expiresAt: expires,
    );
  }
}

class CatalogHold {
  const CatalogHold({required this.id, required this.expiresAt});
  final String id;
  final DateTime expiresAt;

  factory CatalogHold.fromJson(Object? json) {
    if (json is! Map<String, dynamic> ||
        json['id'] is! String ||
        json['expires_at'] is! String) {
      throw const FormatException();
    }
    final expires = DateTime.tryParse(json['expires_at'] as String);
    if (expires == null) throw const FormatException();
    return CatalogHold(id: json['id'] as String, expiresAt: expires);
  }
}

class CatalogPaymentIntent {
  const CatalogPaymentIntent({
    required this.id,
    required this.holdId,
    required this.amountMinor,
    required this.currency,
    required this.status,
    this.clientSecret,
  });

  final String id;
  final String holdId;
  final int amountMinor;
  final String currency;
  final String status;
  final String? clientSecret;

  factory CatalogPaymentIntent.fromJson(Object? json) {
    if (json is! Map<String, dynamic> ||
        json['intent_id'] is! String ||
        json['hold_id'] is! String ||
        json['amount_minor'] is! num ||
        json['currency'] is! String ||
        json['status'] is! String) {
      throw const FormatException();
    }
    final clientSecret = json['client_secret'];
    if (clientSecret != null && (clientSecret is! String || clientSecret.isEmpty)) {
      throw const FormatException();
    }
    return CatalogPaymentIntent(
      id: json['intent_id'] as String,
      holdId: json['hold_id'] as String,
      amountMinor: (json['amount_minor'] as num).toInt(),
      currency: json['currency'] as String,
      status: json['status'] as String,
      clientSecret: clientSecret as String?,
    );
  }
}

class CatalogPaymentIntentStatus {
  const CatalogPaymentIntentStatus({
    required this.intentId,
    required this.holdId,
    required this.status,
    required this.updatedAt,
  });

  final String intentId;
  final String holdId;
  final String status;
  final DateTime updatedAt;

  factory CatalogPaymentIntentStatus.fromJson(Object? json) {
    if (json is! Map<String, dynamic> ||
        json['intent_id'] is! String ||
        json['hold_id'] is! String ||
        json['status'] is! String ||
        json['updated_at'] is! String) {
      throw const FormatException();
    }
    final updatedAt = DateTime.tryParse(json['updated_at'] as String);
    if (updatedAt == null) throw const FormatException();
    return CatalogPaymentIntentStatus(
      intentId: json['intent_id'] as String,
      holdId: json['hold_id'] as String,
      status: json['status'] as String,
      updatedAt: updatedAt,
    );
  }
}

class CatalogBooking {
  const CatalogBooking({
    required this.id,
    required this.publicCode,
    required this.venueId,
    required this.status,
    required this.startsAt,
    required this.endsAt,
    required this.totalMinor,
    required this.dueNowMinor,
    required this.balanceMinor,
    required this.currency,
  });

  final String id;
  final String publicCode;
  final String venueId;
  final String status;
  final DateTime startsAt;
  final DateTime endsAt;
  final int totalMinor;
  final int dueNowMinor;
  final int balanceMinor;
  final String currency;

  factory CatalogBooking.fromJson(Object? json) {
    if (json is! Map<String, dynamic> ||
        json['id'] is! String ||
        json['public_code'] is! String ||
        json['venue_id'] is! String ||
        json['status'] is! String ||
        json['starts_at'] is! String ||
        json['ends_at'] is! String ||
        json['total_minor'] is! num ||
        json['due_now_minor'] is! num ||
        json['balance_minor'] is! num ||
        json['currency'] is! String) {
      throw const FormatException();
    }
    final startsAt = DateTime.tryParse(json['starts_at'] as String);
    final endsAt = DateTime.tryParse(json['ends_at'] as String);
    if (startsAt == null || endsAt == null || !startsAt.isBefore(endsAt)) {
      throw const FormatException();
    }
    return CatalogBooking(
      id: json['id'] as String,
      publicCode: json['public_code'] as String,
      venueId: json['venue_id'] as String,
      status: json['status'] as String,
      startsAt: startsAt,
      endsAt: endsAt,
      totalMinor: (json['total_minor'] as num).toInt(),
      dueNowMinor: (json['due_now_minor'] as num).toInt(),
      balanceMinor: (json['balance_minor'] as num).toInt(),
      currency: json['currency'] as String,
    );
  }
}

class CatalogCheckoutResult {
  const CatalogCheckoutResult({
    required this.booking,
    required this.qrToken,
    required this.qrExpiresAt,
  });

  final CatalogBooking booking;
  final String qrToken;
  final DateTime qrExpiresAt;

  factory CatalogCheckoutResult.fromJson(Object? json) {
    if (json is! Map<String, dynamic> ||
        json['qr_token'] is! String ||
        json['qr_expires_at'] is! String) {
      throw const FormatException();
    }
    final expiresAt = DateTime.tryParse(json['qr_expires_at'] as String);
    if (expiresAt == null) throw const FormatException();
    return CatalogCheckoutResult(
      booking: CatalogBooking.fromJson(json['booking']),
      qrToken: json['qr_token'] as String,
      qrExpiresAt: expiresAt,
    );
  }
}

class CatalogFailure implements Exception {
  const CatalogFailure(this.message, {this.code});
  final String message;
  final String? code;

  @override
  String toString() => message;
}

class MobileSession {
  const MobileSession(
      {required this.userId, required this.token, this.mfaRequired = false});
  final String userId;
  final String token;
  final bool mfaRequired;
}

class CustomerRegistration {
  const CustomerRegistration._(
      {this.session, required this.emailVerificationRequired});

  const CustomerRegistration.signedIn(MobileSession session)
      : this._(session: session, emailVerificationRequired: false);

  const CustomerRegistration.emailVerificationRequired()
      : this._(emailVerificationRequired: true);

  final MobileSession? session;
  final bool emailVerificationRequired;
}

abstract class VenueCatalogSource {
  Future<List<CatalogVenue>> fetchVenues();
  Future<List<CatalogResourceAvailability>> fetchAvailability(
      String venueId, DateTime from, DateTime to);
  MobileSession? get currentSession;
  Future<CustomerRegistration> register(String email, String password);
  Future<MobileSession> login(String email, String password);
  Future<MobileSession> verifyMfa(String code);
  Future<void> logout();
  Future<CatalogQuote> createQuote(
      String venueId, String resourceId, DateTime startsAt, DateTime endsAt);
  Future<CatalogHold> createHold(String quoteId);
  Future<void> releaseHold(String holdId);
  Future<CatalogPaymentIntent> createSoloPaymentIntent(String holdId);
  Future<CatalogPaymentIntentStatus> getSoloPaymentIntentStatus(
      String holdId, String intentId);
  Future<CatalogCheckoutResult> confirmSoloCheckout(
      String holdId, String? paymentIntentId);
}

class CatalogClient implements VenueCatalogSource {
  CatalogClient(this.origin) : _http = HttpClient() {
    _http.connectionTimeout = const Duration(seconds: 5);
  }
  final Uri origin;
  final HttpClient _http;
  MobileSession? _session;
  @override
  MobileSession? get currentSession => _session;
  void close() => _http.close(force: true);

  @override
  Future<CustomerRegistration> register(String email, String password) async {
    final data = await _sendJson('/v1/auth/register', method: 'POST', body: {
      'email': email.trim(),
      'password': password,
      'accepted_terms': true,
    });
    final userId = data['user_id'];
    if (userId is! String || userId.isEmpty) {
      throw const CatalogFailure(
          'Răspunsul de creare a contului nu este valid.');
    }

    // Local approval-only mode verifies customer identities at registration.
    // A normal environment keeps the account unsigned-in until email proof.
    try {
      return CustomerRegistration.signedIn(await login(email, password));
    } on CatalogFailure catch (error) {
      if (error.code == 'AUTH_EMAIL_UNVERIFIED') {
        return const CustomerRegistration.emailVerificationRequired();
      }
      rethrow;
    }
  }

  Future<MobileSession> login(String email, String password) async {
    final data = await _sendJson('/v1/auth/login', method: 'POST', body: {
      'email': email.trim(),
      'password': password,
      'kind': 'mobile',
    });
    final token = data['token'];
    final userId = data['user_id'];
    if (token is! String ||
        token.isEmpty ||
        userId is! String ||
        userId.isEmpty) {
      throw const CatalogFailure('Răspunsul de autentificare nu este valid.');
    }
    _session = MobileSession(
      userId: userId,
      token: token,
      mfaRequired: data['mfa_required'] == true,
    );
    return _session!;
  }

  Future<MobileSession> verifyMfa(String code) async {
    final pending = _session;
    if (pending == null || !pending.mfaRequired) {
      throw const CatalogFailure('Autentificarea nu așteaptă un cod.');
    }
    final data = await _sendJson('/v1/auth/mfa/verify',
        method: 'POST', bearer: pending.token, body: {'code': code.trim()});
    final token = data['token'];
    if (token is! String ||
        token.isEmpty ||
        data['user_id'] != pending.userId) {
      throw const CatalogFailure('Verificarea suplimentară nu a reușit.');
    }
    _session = MobileSession(userId: pending.userId, token: token);
    return _session!;
  }

  Future<void> logout() async {
    final current = _session;
    _session = null;
    if (current == null) return;
    try {
      await _sendJson('/v1/auth/logout',
          method: 'POST', bearer: current.token, expectJson: false);
    } on CatalogFailure {
      // The local session is discarded even if the server is offline.
    }
  }

  @override
  Future<CatalogQuote> createQuote(String venueId, String resourceId,
      DateTime startsAt, DateTime endsAt) async {
    final session = _session;
    if (session == null || session.mfaRequired) {
      throw const CatalogFailure('Autentifică-te pentru a calcula prețul.');
    }
    final data = await _sendJson('/v1/quotes',
        method: 'POST',
        bearer: session.token,
        body: {
          'venue_id': venueId,
          'resource_ids': [resourceId],
          'starts_at': startsAt.toUtc().toIso8601String(),
          'ends_at': endsAt.toUtc().toIso8601String(),
        });
    return CatalogQuote.fromJson(data);
  }

  @override
  Future<CatalogHold> createHold(String quoteId) async {
    final session = _session;
    if (session == null || session.mfaRequired) {
      throw const CatalogFailure('Autentifică-te pentru a păstra un loc.');
    }
    final data = await _sendJson('/v1/holds',
        method: 'POST', bearer: session.token, body: {'quote_id': quoteId});
    return CatalogHold.fromJson(data);
  }

  @override
  Future<void> releaseHold(String holdId) async {
    final session = _session;
    if (session == null)
      throw const CatalogFailure('Autentifică-te pentru a elibera locul.');
    await _sendJson('/v1/holds/${Uri.encodeComponent(holdId)}/release',
        method: 'POST', bearer: session.token, expectJson: false);
  }

  @override
  Future<CatalogPaymentIntent> createSoloPaymentIntent(String holdId) async {
    final session = _requireActiveSession('a iniția plata online');
    final data = await _sendJson(
      '/v1/holds/${Uri.encodeComponent(holdId)}/payment-intent',
      method: 'POST',
      bearer: session.token,
    );
    return CatalogPaymentIntent.fromJson(data);
  }

  @override
  Future<CatalogPaymentIntentStatus> getSoloPaymentIntentStatus(
      String holdId, String intentId) async {
    final session = _requireActiveSession('a verifica plata online');
    final data = await _sendJson(
      '/v1/holds/${Uri.encodeComponent(holdId)}/payment-intents/${Uri.encodeComponent(intentId)}',
      bearer: session.token,
    );
    return CatalogPaymentIntentStatus.fromJson(data);
  }

  @override
  Future<CatalogCheckoutResult> confirmSoloCheckout(
      String holdId, String? paymentIntentId) async {
    final session = _requireActiveSession('a confirma rezervarea');
    final body = <String, dynamic>{'hold_id': holdId};
    if (paymentIntentId != null) body['payment_intent_id'] = paymentIntentId;
    final data = await _sendJson('/v1/checkout/solo',
        method: 'POST', bearer: session.token, body: body);
    return CatalogCheckoutResult.fromJson(data);
  }

  MobileSession _requireActiveSession(String action) {
    final session = _session;
    if (session == null || session.mfaRequired) {
      throw CatalogFailure('Autentifică-te pentru a $action.');
    }
    return session;
  }

  Future<Map<String, dynamic>> _sendJson(String path,
      {String method = 'GET',
      Object? body,
      String? bearer,
      bool expectJson = true}) async {
    HttpClientRequest? request;
    try {
      request = await _http.openUrl(method, origin.resolve(path));
      request.followRedirects = false;
      request.headers.set(HttpHeaders.acceptHeader, 'application/json');
      if (bearer != null)
        request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $bearer');
      if (body != null) {
        request.headers.contentType = ContentType.json;
        request.write(jsonEncode(body));
      }
      final response = await request.close();
      final bytes = <int>[];
      await for (final chunk in response) {
        bytes.addAll(chunk);
        if (bytes.length > 256 * 1024) throw const FormatException();
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        final decoded = bytes.isEmpty ? null : jsonDecode(utf8.decode(bytes));
        final error = decoded is Map<String, dynamic> &&
                decoded['error'] is Map<String, dynamic>
            ? decoded['error'] as Map<String, dynamic>
            : null;
        final message = error?['message'];
        final code = error?['code'];
        throw CatalogFailure(
            message is String && message.isNotEmpty
                ? message
                : 'Autentificarea nu a putut fi efectuată.',
            code: code is String ? code : null);
      }
      if (!expectJson || bytes.isEmpty) return <String, dynamic>{};
      final decoded = jsonDecode(utf8.decode(bytes));
      if (decoded is! Map<String, dynamic>) throw const FormatException();
      return decoded;
    } on CatalogFailure {
      rethrow;
    } on FormatException {
      throw const CatalogFailure('Răspunsul serviciului nu poate fi citit.');
    } on HandshakeException {
      throw const CatalogFailure(
          'Conexiunea securizată nu poate fi verificată.');
    } catch (_) {
      throw const CatalogFailure(
          'Serviciul nu este disponibil. Verifică legătura și reîncearcă.');
    } finally {
      request?.abort();
    }
  }

  @override
  Future<List<CatalogVenue>> fetchVenues() async {
    HttpClientRequest? request;
    try {
      return await (() async {
        request = await _http.getUrl(origin.resolve('/v1/venues'));
        request!.followRedirects = false;
        request!.headers.set(HttpHeaders.acceptHeader, 'application/json');
        final response = await request!.close();
        if (response.statusCode != HttpStatus.ok) {
          await response.drain<void>();
          throw const CatalogFailure(
              'Catalogul nu este disponibil acum. Reîncearcă.');
        }
        final bytes = <int>[];
        await for (final chunk in response) {
          bytes.addAll(chunk);
          if (bytes.length > 256 * 1024) {
            throw const FormatException();
          }
        }
        return CatalogVenue.decode(utf8.decode(bytes));
      })()
          .timeout(const Duration(seconds: 8));
    } on CatalogFailure {
      rethrow;
    } on FormatException {
      throw const CatalogFailure(
          'Datele catalogului nu pot fi citite. Reîncearcă.');
    } on HandshakeException {
      throw const CatalogFailure(
          'Conexiunea securizată nu poate fi verificată.');
    } catch (_) {
      throw const CatalogFailure(
          'Nu putem contacta catalogul. Verifică conexiunea și reîncearcă.');
    } finally {
      request?.abort();
    }
  }

  @override
  Future<List<CatalogResourceAvailability>> fetchAvailability(
      String venueId, DateTime from, DateTime to) async {
    HttpClientRequest? request;
    try {
      return await (() async {
        final query = <String, String>{
          'from': from.toUtc().toIso8601String(),
          'to': to.toUtc().toIso8601String(),
        };
        final path = '/v1/venues/${Uri.encodeComponent(venueId)}/availability';
        request = await _http
            .getUrl(origin.resolve(path).replace(queryParameters: query));
        request!.followRedirects = false;
        request!.headers.set(HttpHeaders.acceptHeader, 'application/json');
        final response = await request!.close();
        if (response.statusCode != HttpStatus.ok) {
          await response.drain<void>();
          throw const CatalogFailure(
              'Disponibilitatea nu este disponibilă acum. Reîncearcă.');
        }
        final bytes = <int>[];
        await for (final chunk in response) {
          bytes.addAll(chunk);
          if (bytes.length > 512 * 1024) throw const FormatException();
        }
        final json = jsonDecode(utf8.decode(bytes));
        if (json is! Map<String, dynamic> || json['resources'] is! List) {
          throw const FormatException();
        }
        return List<CatalogResourceAvailability>.unmodifiable(
            (json['resources'] as List)
                .map(CatalogResourceAvailability.fromJson));
      })()
          .timeout(const Duration(seconds: 8));
    } on CatalogFailure {
      rethrow;
    } on FormatException {
      throw const CatalogFailure(
          'Datele disponibilității nu pot fi citite. Reîncearcă.');
    } on HandshakeException {
      throw const CatalogFailure(
          'Conexiunea securizată nu poate fi verificată.');
    } catch (_) {
      throw const CatalogFailure(
          'Nu putem încărca disponibilitatea. Verifică conexiunea și reîncearcă.');
    } finally {
      request?.abort();
    }
  }
}
