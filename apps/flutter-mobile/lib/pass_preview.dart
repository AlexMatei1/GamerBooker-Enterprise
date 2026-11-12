import 'dart:convert';
import 'dart:io';
import 'lifecycle_state.dart';

// Debug-only loopback transport. No production authentication/payment endpoints.
class PassPreview {
  final clock = PreviewClock();
  Future<void>? _connecting;
  String _session = '';
  final File _identity = File('${Directory.systemTemp.path}/gamerbooker-preview-owner-v1');
  final HttpClient _http = HttpClient()..connectionTimeout = const Duration(seconds: 3);
  Future<dynamic> request(String route, [Map<String, dynamic>? body]) async {
    try {
      final request = await _http.openUrl(body == null ? 'GET' : 'POST', Uri.parse('http://127.0.0.1:8787/preview/customer/$route')).timeout(const Duration(seconds: 4));
      request.headers.set('X-Preview-Client', 'customer');
      request.headers.set('Authorization', 'Bearer $_session');
      if (body != null) { request.headers.contentType = ContentType.json; request.write(jsonEncode(body)); }
      final response = await request.close().timeout(const Duration(seconds: 4));
      final value = jsonDecode(await utf8.decoder.bind(response).join().timeout(const Duration(seconds: 4)));
      final serverNow=int.tryParse(response.headers.value('X-Preview-Now')??'');
      if(serverNow!=null)clock.sync(serverNow);
      if (response.statusCode >= 400) { throw StateError(value['error'].toString()); }
      return value;
    } on SocketException { throw StateError('Serviciul local este offline. Nicio modificare confirmată.'); }
  }
  Future<List<Map<String,dynamic>>> connect() async {
    if (_session.isEmpty) {
      _connecting ??= _connectIdentity().whenComplete(()=>_connecting=null);
      await _connecting;
    }
    return (await request('passes') as List).map((p) => Map<String,dynamic>.from(p as Map)).toList();
  }
  Future<void> _connectIdentity() async {
      if (await _identity.exists()) { _session = (await _identity.readAsString()).trim(); }
      if (_session.isEmpty) {
        final result = await request('session', {}); _session = result['session'];
        await _identity.writeAsString(_session, flush: true);
      }
  }
  void close() => _http.close(force: true);
}
String previewTime(dynamic timestamp) {
  final time = DateTime.fromMillisecondsSinceEpoch((timestamp as num).toInt()).toLocal();
  return '${time.day.toString().padLeft(2,'0')}.${time.month.toString().padLeft(2,'0')}.${time.year} ${time.hour.toString().padLeft(2,'0')}:${time.minute.toString().padLeft(2,'0')}:${time.second.toString().padLeft(2,'0')}';
}
