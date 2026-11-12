import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:gamerbooker_mobile/catalog/catalog_client.dart';

void main() {
  group('Safe catalog configuration', () {
    test('debug defaults only to the ADB reverse loopback origin', () {
      expect(CatalogConfiguration.apiOrigin('', debug: true).toString(),
          'http://127.0.0.1:3000');
      expect(() => CatalogConfiguration.apiOrigin('', debug: false),
          throwsFormatException);
    });
    test('release requires explicit HTTPS; no credentials or path overrides',
        () {
      expect(
          CatalogConfiguration.apiOrigin('https://catalog.example.test',
                  debug: false)
              .scheme,
          'https');
      for (final value in [
        'http://127.0.0.1:3000',
        'http://example.test',
        'https://user:password@example.test',
        'https://example.test?token=x',
        'https://example.test/v1',
        'https://example.test/#fragment',
        'garbage'
      ]) {
        expect(() => CatalogConfiguration.apiOrigin(value, debug: false),
            throwsFormatException,
            reason: value);
      }
      expect(
          () => CatalogConfiguration.apiOrigin('http://192.168.1.5:3000',
              debug: true),
          throwsFormatException);
      expect(
          () => CatalogConfiguration.apiOrigin('http://example.test',
              debug: true),
          throwsFormatException);
    });
    test('demo needs explicit opt-in and debug mode', () {
      expect(CatalogConfiguration.demoAllowed(requested: false, debug: true),
          isFalse);
      expect(CatalogConfiguration.demoAllowed(requested: true, debug: true),
          isTrue);
      expect(CatalogConfiguration.demoAllowed(requested: true, debug: false),
          isFalse);
    });
  });
  group('Strict server data', () {
    test('empty means empty, not demonstration venues', () {
      expect(CatalogVenue.decode('{"venues":[]}'), isEmpty);
    });
    test('rejects malformed, incomplete, duplicate and wrongly typed data', () {
      for (final data in [
        'not json',
        '{}',
        '{"venues":null}',
        '{"venues":[null]}',
        '{"venues":[{"id":"one","name":"Venue","timezone":12}]}',
        '{"venues":[{"id":"one","name":"","timezone":"Europe/Paris"}]}',
        '{"venues":[{"id":"one","name":"Venue","timezone":"Europe/Paris","slug":12}]}',
        '{"venues":[{"id":"one","name":"A","timezone":"UTC"},{"id":"one","name":"B","timezone":"UTC"}]}'
      ]) {
        expect(() => CatalogVenue.decode(data), throwsFormatException);
      }
    });
  });
  group('Read-only HTTP catalog', () {
    late HttpServer server;
    late CatalogClient client;
    var status = 200;
    var body = '{"venues":[]}';
    String? Function(HttpRequest request)? responseBody;
    int? Function(HttpRequest request)? responseStatus;
    final requests = <HttpRequest>[];
    final requestBodies = <String>[];
    setUp(() async {
      requests.clear();
      requestBodies.clear();
      status = 200;
      body = '{"venues":[]}';
      responseBody = null;
      responseStatus = null;
      server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      client = CatalogClient(Uri.parse('http://127.0.0.1:${server.port}'));
      server.listen((request) async {
        requests.add(request);
        requestBodies.add(await utf8.decoder.bind(request).join());
        request.response.statusCode = responseStatus?.call(request) ?? status;
        request.response.headers.contentType = ContentType.json;
        if (status == 302)
          request.response.headers.set('location', '/unexpected');
        request.response.write(responseBody?.call(request) ?? body);
        await request.response.close();
      });
    });
    tearDown(() async {
      client.close();
      await server.close(force: true);
    });
    test(
        'reads only actual fields from the public endpoint without credentials',
        () async {
      body = jsonEncode({
        'venues': [
          {
            'id': 'server-id',
            'name': 'Arena de pe server',
            'timezone': 'Europe/Bucharest',
            'slug': null
          }
        ]
      });
      final venues = await client.fetchVenues();
      expect(venues.single.name, 'Arena de pe server');
      expect(venues.single.timezone, 'Europe/Bucharest');
      expect(requests.single.method, 'GET');
      expect(requests.single.uri.path, '/v1/venues');
      expect(requests.single.headers.value('authorization'), isNull);
      expect(requests.single.headers.value('cookie'), isNull);
    });
    test(
        'availability uses the real venue endpoint and strictly parses windows',
        () async {
      body = jsonEncode({
        'venueId': 'server-id',
        'resources': [
          {
            'resourceId': 'resource-id',
            'resourceName': 'PC 01',
            'resourceType': 'PC',
            'availableWindows': [
              {
                'start': '2026-11-07T10:00:00.000Z',
                'end': '2026-11-07T12:00:00.000Z'
              }
            ]
          }
        ]
      });
      final windows = await client.fetchAvailability(
          'server-id', DateTime.utc(2026, 11, 7), DateTime.utc(2026, 11, 8));
      expect(windows.single.name, 'PC 01');
      expect(
          windows.single.windows.single.start, DateTime.utc(2026, 11, 7, 10));
      expect(requests.single.uri.path, '/v1/venues/server-id/availability');
      expect(requests.single.headers.value('authorization'), isNull);
      expect(requests.single.headers.value('cookie'), isNull);
    });
    test('mobile login and MFA use bearer sessions without cookies', () async {
      body = jsonEncode({
        'user_id': 'user-1',
        'token': 'pending-token',
        'mfa_required': true,
      });
      final pending = await client.login('customer@example.test', 'password');
      expect(pending.mfaRequired, isTrue);
      expect(client.currentSession?.token, 'pending-token');
      body = jsonEncode({'user_id': 'user-1', 'token': 'active-token'});
      final active = await client.verifyMfa('123456');
      expect(active.mfaRequired, isFalse);
      expect(active.token, 'active-token');
      expect(requests.map((request) => request.uri.path), [
        '/v1/auth/login',
        '/v1/auth/mfa/verify',
      ]);
      expect(requests.first.method, 'POST');
      expect(requests.first.headers.value('authorization'), isNull);
      expect(requests.first.headers.value('cookie'), isNull);
      expect(
          requests.last.headers.value('authorization'), 'Bearer pending-token');
      expect(requests.last.headers.value('cookie'), isNull);
      await client.logout();
      expect(client.currentSession, isNull);
      expect(requests.last.uri.path, '/v1/auth/logout');
      expect(
          requests.last.headers.value('authorization'), 'Bearer active-token');
    });
    test('local customer registration immediately creates a mobile session',
        () async {
      responseBody = (request) {
        if (request.uri.path == '/v1/auth/register') {
          return jsonEncode({'user_id': 'new-user'});
        }
        if (request.uri.path == '/v1/auth/login') {
          return jsonEncode({'user_id': 'new-user', 'token': 'new-token'});
        }
        return body;
      };
      final result =
          await client.register('new.customer@example.test', 'safe password');
      expect(result.emailVerificationRequired, isFalse);
      expect(result.session?.userId, 'new-user');
      expect(client.currentSession?.token, 'new-token');
      expect(requests.map((request) => request.uri.path), [
        '/v1/auth/register',
        '/v1/auth/login',
      ]);
      expect(jsonDecode(requestBodies.first), {
        'email': 'new.customer@example.test',
        'password': 'safe password',
        'accepted_terms': true,
      });
      expect(jsonDecode(requestBodies.last)['kind'], 'mobile');
    });
    test('registration keeps an email-unverified customer signed out',
        () async {
      responseStatus =
          (request) => request.uri.path == '/v1/auth/register' ? 201 : 403;
      responseBody = (request) {
        if (request.uri.path == '/v1/auth/register') {
          return jsonEncode({'user_id': 'new-user'});
        }
        return jsonEncode({
          'error': {
            'code': 'AUTH_EMAIL_UNVERIFIED',
            'message': 'Email address is not verified.',
          }
        });
      };
      final result =
          await client.register('new.customer@example.test', 'safe password');
      expect(result.emailVerificationRequired, isTrue);
      expect(result.session, isNull);
      expect(client.currentSession, isNull);
    });
    test('quote, temporary hold, and release use the mobile session', () async {
      body = jsonEncode({'user_id': 'user-1', 'token': 'active-token'});
      await client.login('customer@example.test', 'password');
      body = jsonEncode({
        'quote_id': 'quote-1',
        'total_minor': 5000,
        'due_now_minor': 5000,
        'currency': 'RON',
        'expires_at': '2026-11-07T10:15:00.000Z',
      });
      final quote = await client.createQuote('venue-1', 'resource-1',
          DateTime.utc(2026, 11, 7, 10), DateTime.utc(2026, 11, 7, 11));
      expect(quote.id, 'quote-1');
      expect(jsonDecode(requestBodies.last), {
        'venue_id': 'venue-1',
        'resource_ids': ['resource-1'],
        'starts_at': '2026-11-07T10:00:00.000Z',
        'ends_at': '2026-11-07T11:00:00.000Z',
      });
      body = jsonEncode(
          {'id': 'hold-1', 'expires_at': '2026-11-07T10:15:00.000Z'});
      final hold = await client.createHold(quote.id);
      expect(hold.id, 'hold-1');
      expect(jsonDecode(requestBodies.last), {'quote_id': 'quote-1'});
      body = '{}';
      await client.releaseHold(hold.id);
      expect(requests.last.uri.path, '/v1/holds/hold-1/release');
      expect(
          requests.last.headers.value('authorization'), 'Bearer active-token');
      expect(
          requests.every((request) => request.headers.value('cookie') == null),
          isTrue);
    });
    test('empty server response never invents venues', () async {
      expect(await client.fetchVenues(), isEmpty);
    });
    test('malformed success response fails rather than falling back to mocks',
        () async {
      body = '{"venues":[{"name":"Missing fields"}]}';
      await expectLater(client.fetchVenues(), throwsA(isA<CatalogFailure>()));
    });
    test('service failure can retry with a fresh successful server response',
        () async {
      status = 503;
      await expectLater(client.fetchVenues(), throwsA(isA<CatalogFailure>()));
      status = 200;
      expect(await client.fetchVenues(), isEmpty);
      expect(requests, hasLength(2));
    });
    test('does not follow redirects to another endpoint', () async {
      status = 302;
      await expectLater(client.fetchVenues(), throwsA(isA<CatalogFailure>()));
      expect(requests, hasLength(1));
    });
    test('offline is an error and never an empty or mock success', () async {
      await server.close(force: true);
      await expectLater(client.fetchVenues(), throwsA(isA<CatalogFailure>()));
    });
  });
}
