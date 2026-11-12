import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'catalog_client.dart';
import 'payment_gateway.dart';
import 'reservation_checkout.dart';

const _paper = Color(0xFF09090B);
const _ink = Color(0xFFF4F4F5);
const _orange = Color(0xFF6366F1);
const _muted = Color(0xFF94A3B8);
const _card = Color(0xFF14141C);
const _border = Color(0x1FFFFFFF);

class LiveCatalogApp extends StatefulWidget {
  const LiveCatalogApp({super.key, this.source, this.paymentGateway});
  final VenueCatalogSource? source;

  /// Injected by `main.dart`. A null gateway means online payment was never
  /// configured for this build, so the checkout action stays unavailable rather
  /// than silently confirming a reservation the server has not been paid for.
  final PaymentGateway? paymentGateway;
  @override
  State<LiveCatalogApp> createState() => _LiveCatalogAppState();
}

class _LiveCatalogAppState extends State<LiveCatalogApp> {
  CatalogClient? _client;
  String? _configurationError;
  @override
  void initState() {
    super.initState();
    if (widget.source == null) {
      try {
        _client = CatalogClient(CatalogConfiguration.apiOrigin(
            const String.fromEnvironment('GAMERBOOKER_API_BASE_URL'),
            debug: kDebugMode));
      } on FormatException catch (error) {
        _configurationError = error.message;
      }
    }
  }

  @override
  void dispose() {
    _client?.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'GamerBooker',
        debugShowCheckedModeBanner: false,
        theme: ThemeData.dark().copyWith(
            scaffoldBackgroundColor: _paper,
            colorScheme: const ColorScheme.dark(
                surface: _paper,
                onSurface: _ink,
                primary: _orange,
                secondary: _orange),
            appBarTheme: const AppBarTheme(
                backgroundColor: _paper, foregroundColor: _ink),
            filledButtonTheme: FilledButtonThemeData(
                style: FilledButton.styleFrom(
                    backgroundColor: _orange, foregroundColor: Colors.white))),
        home: _configurationError != null
            ? Scaffold(
                appBar: AppBar(title: const Text('GamerBooker')),
                body: Center(
                    child: Padding(
                        padding: const EdgeInsets.all(28),
                        child: Text(_configurationError!,
                            textAlign: TextAlign.center))))
            : CatalogScreen(
                source: widget.source ?? _client!,
                paymentGateway: widget.paymentGateway),
      );
}

class CatalogScreen extends StatefulWidget {
  const CatalogScreen({super.key, required this.source, this.paymentGateway});
  final VenueCatalogSource source;
  final PaymentGateway? paymentGateway;
  @override
  State<CatalogScreen> createState() => _CatalogScreenState();
}

class _CatalogScreenState extends State<CatalogScreen> {
  late Future<List<CatalogVenue>> _venues;
  @override
  void initState() {
    super.initState();
    _venues = widget.source.fetchVenues();
  }

  void _reload() => setState(() {
        _venues = widget.source.fetchVenues();
      });
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('GamerBooker.'), actions: [
          IconButton(
              onPressed: () async {
                await showDialog<void>(
                    context: context,
                    builder: (_) => MobileLoginDialog(source: widget.source));
                if (mounted) setState(() {});
              },
              tooltip: widget.source.currentSession == null
                  ? 'Autentificare'
                  : 'Cont client',
              icon: Icon(widget.source.currentSession == null
                  ? Icons.person_outline
                  : Icons.person)),
          IconButton(
              onPressed: _reload,
              tooltip: 'Actualizează catalogul',
              icon: const Icon(Icons.refresh))
        ]),
        body: FutureBuilder<List<CatalogVenue>>(
          future: _venues,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return Center(
                  child: Semantics(
                      label: 'Se încarcă locațiile',
                      child: CircularProgressIndicator()));
            }
            if (snapshot.hasError) {
              final error = snapshot.error;
              return _message(
                  'Catalog indisponibil',
                  error is CatalogFailure
                      ? error.message
                      : 'Locațiile nu pot fi încărcate. Reîncearcă.');
            }
            final venues = snapshot.data ?? const <CatalogVenue>[];
            if (venues.isEmpty) {
              return _message('Locurile bune se pregătesc.',
                  'Nu sunt locații publicate momentan. Revino sau actualizează catalogul.');
            }
            return ListView(
                padding: const EdgeInsets.fromLTRB(22, 20, 22, 32),
                children: [
                  const Text('GĂSEȘTE-ȚI LOCUL',
                      style: TextStyle(
                          color: _muted,
                          fontSize: 11,
                          letterSpacing: 2,
                          fontWeight: FontWeight.w700)),
                  const SizedBox(height: 12),
                  const Text('Următoarea sesiune\nîncepe cu un loc.',
                      style: TextStyle(
                          fontSize: 32,
                          height: 1.1,
                          fontWeight: FontWeight.w800)),
                  const SizedBox(height: 12),
                  const Text('Descoperă locațiile publicate de echipele lor.',
                      style: TextStyle(color: _muted)),
                  const SizedBox(height: 24),
                  ...venues.map((venue) => Padding(
                      padding: const EdgeInsets.only(bottom: 14),
                      child: Card(
                          key: ValueKey(venue.id),
                          color: _card,
                          elevation: 0,
                          shape: RoundedRectangleBorder(
                              side: const BorderSide(color: _border),
                              borderRadius: BorderRadius.circular(14)),
                          child: ListTile(
                              contentPadding: const EdgeInsets.all(18),
                              title: Text(venue.name,
                                  style: const TextStyle(
                                      fontSize: 21,
                                      fontWeight: FontWeight.w700)),
                              subtitle: Padding(
                                  padding: const EdgeInsets.only(top: 8),
                                  child: Text('Fus orar · ${venue.timezone}')),
                              trailing: const Icon(Icons.arrow_outward),
                              onTap: () => Navigator.of(context).push(
                                  MaterialPageRoute<void>(
                                      builder: (_) => CatalogVenueScreen(
                                          venue: venue,
                                          source: widget.source,
                                          paymentGateway:
                                              widget.paymentGateway))))))),
                ]);
          },
        ),
      );
  Widget _message(String title, String description) => Center(
      child: SingleChildScrollView(
          padding: const EdgeInsets.all(28),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.storefront_outlined, size: 46, color: _muted),
            const SizedBox(height: 20),
            Text(title,
                textAlign: TextAlign.center,
                style:
                    const TextStyle(fontSize: 27, fontWeight: FontWeight.w800)),
            const SizedBox(height: 12),
            Text(description,
                textAlign: TextAlign.center,
                style: const TextStyle(color: _muted)),
            const SizedBox(height: 24),
            FilledButton(onPressed: _reload, child: const Text('Reîncearcă')),
          ])));
}

class MobileLoginDialog extends StatefulWidget {
  const MobileLoginDialog({super.key, required this.source});
  final VenueCatalogSource source;

  @override
  State<MobileLoginDialog> createState() => _MobileLoginDialogState();
}

class _MobileLoginDialogState extends State<MobileLoginDialog> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _code = TextEditingController();
  String? _error;
  String? _notice;
  bool _busy = false;
  bool _registering = false;
  bool _acceptedTerms = false;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final session = await widget.source.login(_email.text, _password.text);
      if (!session.mfaRequired && mounted) Navigator.pop(context);
    } catch (error) {
      _error = error is CatalogFailure
          ? error.message
          : 'Autentificarea nu a reușit.';
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _register() async {
    if (!_acceptedTerms) {
      setState(() => _error = 'Acceptă termenii pentru a crea contul.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    try {
      final registration =
          await widget.source.register(_email.text, _password.text);
      if (registration.session != null && mounted) {
        Navigator.pop(context);
      } else if (registration.emailVerificationRequired && mounted) {
        setState(() {
          _registering = false;
          _notice =
              'Contul a fost creat. Verifică emailul, apoi autentifică-te.';
        });
      }
    } catch (error) {
      _error = error is CatalogFailure
          ? error.message
          : 'Contul nu a putut fi creat.';
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _verify() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.source.verifyMfa(_code.text);
      if (mounted) Navigator.pop(context);
    } catch (error) {
      _error = error is CatalogFailure
          ? error.message
          : 'Codul nu a putut fi verificat.';
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _logout() async {
    setState(() => _busy = true);
    await widget.source.logout();
    if (mounted) {
      setState(() => _busy = false);
      Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = widget.source.currentSession;
    final pendingMfa = session?.mfaRequired == true;
    final showCredentials = session == null && !pendingMfa;
    return AlertDialog(
      scrollable: true,
      title: Text(session == null
          ? (_registering ? 'Creează cont client' : 'Cont client')
          : 'Sesiune client'),
      content: SizedBox(
          width: 360,
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            if (session != null && !pendingMfa)
              const Text(
                  'Ești autentificat. Rezervările tale vor fi asociate acestui cont.')
            else if (pendingMfa)
              TextField(
                  controller: _code,
                  keyboardType: TextInputType.number,
                  maxLength: 6,
                  decoration:
                      const InputDecoration(labelText: 'Cod de verificare'))
            else ...[
              TextField(
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  autofillHints: const [AutofillHints.username],
                  decoration: const InputDecoration(labelText: 'Email')),
              const SizedBox(height: 10),
              TextField(
                  controller: _password,
                  obscureText: true,
                  autofillHints: const [AutofillHints.password],
                  decoration: const InputDecoration(labelText: 'Parolă')),
              if (_registering)
                CheckboxListTile(
                    value: _acceptedTerms,
                    contentPadding: EdgeInsets.zero,
                    onChanged: _busy
                        ? null
                        : (value) =>
                            setState(() => _acceptedTerms = value ?? false),
                    title: const Text('Accept termenii de utilizare')),
            ],
            if (_notice != null)
              Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(_notice!, style: const TextStyle(color: _muted))),
            if (_error != null)
              Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(_error!, style: const TextStyle(color: Colors.red))),
          ])),
      actions: [
        TextButton(
            onPressed: _busy ? null : () => Navigator.pop(context),
            child: const Text('Închide')),
        if (session != null && !pendingMfa)
          FilledButton(
              onPressed: _busy ? null : _logout,
              child: const Text('Deconectare'))
        else
          FilledButton(
              onPressed: _busy
                  ? null
                  : (pendingMfa
                      ? _verify
                      : (_registering ? _register : _login)),
              child: Text(_busy
                  ? 'Se verifică…'
                  : pendingMfa
                      ? 'Verifică'
                      : (_registering ? 'Creează cont' : 'Autentificare'))),
        if (showCredentials)
          TextButton(
              onPressed: _busy
                  ? null
                  : () => setState(() {
                        _registering = !_registering;
                        _error = null;
                        _notice = null;
                      }),
              child: Text(_registering ? 'Am deja cont' : 'Creează cont')),
      ],
    );
  }
}

class CatalogVenueScreen extends StatelessWidget {
  const CatalogVenueScreen(
      {super.key,
      required this.venue,
      required this.source,
      this.paymentGateway});
  final CatalogVenue venue;
  final VenueCatalogSource source;
  final PaymentGateway? paymentGateway;
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Locația ta următoare')),
        body: ListView(padding: const EdgeInsets.all(24), children: [
          const Icon(Icons.storefront_outlined, size: 64, color: _ink),
          const SizedBox(height: 24),
          Text(venue.name,
              style: const TextStyle(
                  fontSize: 32, fontWeight: FontWeight.w800, height: 1.1)),
          const SizedBox(height: 20),
          Text('Fus orar: ${venue.timezone}'),
          const SizedBox(height: 28),
          CatalogAvailabilityView(
              venue: venue, source: source, paymentGateway: paymentGateway),
          const Text(
              'Poți verifica disponibilitatea și prețul. Confirmarea rezervării se activează după integrarea plății.',
              style: TextStyle(color: _muted)),
        ]),
      );
}

class CatalogAvailabilityView extends StatefulWidget {
  const CatalogAvailabilityView(
      {super.key,
      required this.venue,
      required this.source,
      this.paymentGateway});
  final CatalogVenue venue;
  final VenueCatalogSource source;
  final PaymentGateway? paymentGateway;

  @override
  State<CatalogAvailabilityView> createState() =>
      _CatalogAvailabilityViewState();
}

class _CatalogAvailabilityViewState extends State<CatalogAvailabilityView> {
  late Future<List<CatalogResourceAvailability>> _availability;
  CatalogQuote? _quote;
  String? _quoteError;
  bool _quoting = false;

  bool _confirming = false;
  String? _checkoutError;
  CatalogCheckoutResult? _result;

  @override
  void initState() {
    super.initState();
    _availability = _load();
  }

  Future<List<CatalogResourceAvailability>> _load() {
    final from = DateTime.now();
    return widget.source.fetchAvailability(
        widget.venue.id, from, from.add(const Duration(days: 7)));
  }

  void _retry() => setState(() => _availability = _load());

  Future<void> _showQuote(
      CatalogResourceAvailability resource, CatalogWindow window) async {
    if (widget.source.currentSession == null) {
      await showDialog<void>(
          context: context,
          builder: (_) => MobileLoginDialog(source: widget.source));
    }
    if (!mounted || widget.source.currentSession == null) return;
    setState(() {
      _quoting = true;
      _quoteError = null;
      _quote = null;
    });
    try {
      final end = window.start.add(const Duration(hours: 1));
      final quote = await widget.source
          .createQuote(widget.venue.id, resource.id, window.start, end);
      if (mounted) setState(() => _quote = quote);
    } catch (error) {
      if (mounted) {
        setState(() => _quoteError = error is CatalogFailure
            ? error.message
            : 'Prețul nu poate fi calculat acum.');
      }
    } finally {
      if (mounted) setState(() => _quoting = false);
    }
  }

  /// Creates the order on the server through the shared coordinator. The client
  /// never decides that a reservation is paid: `ReservationCheckout` polls the
  /// webhook-written status and only then asks the server to confirm.
  Future<void> _confirmQuote() async {
    final quote = _quote;
    final gateway = widget.paymentGateway;
    if (quote == null) return;
    if (gateway == null) {
      setState(() => _checkoutError =
          'Plata online nu este configurată în această versiune a aplicației.');
      return;
    }
    setState(() {
      _confirming = true;
      _checkoutError = null;
      _result = null;
    });
    try {
      final checkout = ReservationCheckout(
          source: widget.source, paymentGateway: gateway);
      final result = await checkout.complete(quote);
      if (mounted) setState(() => _result = result);
    } on ReservationCheckoutFailure catch (error) {
      if (mounted) setState(() => _checkoutError = error.message);
    } on PaymentGatewayUnavailable catch (error) {
      if (mounted) setState(() => _checkoutError = error.message);
    } catch (_) {
      if (mounted) {
        setState(() => _checkoutError =
            'Rezervarea nu a putut fi finalizată. Încearcă din nou.');
      }
    } finally {
      if (mounted) setState(() => _confirming = false);
    }
  }

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Disponibilitate live · următoarele 7 zile',
              style: TextStyle(fontSize: 19, fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          FutureBuilder<List<CatalogResourceAvailability>>(
              future: _availability,
              builder: (context, snapshot) {
                if (snapshot.connectionState != ConnectionState.done) {
                  return const Padding(
                      padding: EdgeInsets.all(20),
                      child: Center(child: CircularProgressIndicator()));
                }
                if (snapshot.hasError) {
                  final error = snapshot.error;
                  return Card(
                      child: ListTile(
                    title: const Text('Disponibilitatea nu s-a încărcat'),
                    subtitle: Text(error is CatalogFailure
                        ? error.message
                        : 'Verifică legătura și reîncearcă.'),
                    trailing: TextButton(
                        onPressed: _retry, child: const Text('Reîncearcă')),
                  ));
                }
                final resources =
                    snapshot.data ?? const <CatalogResourceAvailability>[];
                if (resources.isEmpty) {
                  return const Text(
                      'Nu sunt resurse publicate pentru această locație.');
                }
                return Column(
                    children: resources
                        .map((resource) => Card(
                              child: Padding(
                                padding: const EdgeInsets.all(14),
                                child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(resource.name,
                                          style: const TextStyle(
                                              fontWeight: FontWeight.w700,
                                              fontSize: 17)),
                                      Text(resource.type,
                                          style:
                                              const TextStyle(color: _muted)),
                                      const SizedBox(height: 8),
                                      if (resource.windows.isEmpty)
                                        const Text(
                                            'Fără intervale disponibile'),
                                      ...resource.windows.take(4).map(
                                          (window) => Padding(
                                              padding:
                                                  const EdgeInsets.only(top: 5),
                                              child: Text(
                                                  '${_displayTime(window.start)} – ${_displayTime(window.end)}'))),
                                      if (resource.windows.isNotEmpty &&
                                          resource.windows.first.end.difference(
                                                  resource
                                                      .windows.first.start) >=
                                              const Duration(hours: 1))
                                        TextButton(
                                            onPressed: _quoting
                                                ? null
                                                : () => _showQuote(resource,
                                                    resource.windows.first),
                                            child: const Text(
                                                'Vezi prețul pentru prima oră liberă')),
                                      if (resource.windows.length > 4)
                                        Text(
                                            '+ ${resource.windows.length - 4} intervale'),
                                    ]),
                              ),
                            ))
                        .toList(growable: false));
              }),
          if (_quoting)
            const Padding(
                padding: EdgeInsets.all(10),
                child: CircularProgressIndicator()),
          if (_quoteError != null)
            Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(_quoteError!,
                    style: const TextStyle(color: Colors.red))),
          if (_quote != null)
            Card(
                child: ListTile(
                    title: const Text('Estimare pentru o oră'),
                    subtitle: Text(
                        'Total ${(_quote!.totalMinor / 100).toStringAsFixed(2)} ${_quote!.currency} · de achitat acum ${(_quote!.dueNowMinor / 100).toStringAsFixed(2)} ${_quote!.currency}'),
                    trailing: const Icon(Icons.receipt_long_outlined))),
          if (_quote != null)
            Padding(
                padding: const EdgeInsets.only(top: 8),
                child: FilledButton(
                    onPressed: _confirming || _result != null
                        ? null
                        : _confirmQuote,
                    child: Text(_confirming
                        ? 'Se confirmă…'
                        : widget.paymentGateway == null
                            ? 'Plata online nu este disponibilă'
                            : 'Confirmă rezervarea'))),
          if (_checkoutError != null)
            Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(_checkoutError!,
                    style: const TextStyle(color: Colors.red))),
          if (_result != null)
            Card(
                child: ListTile(
                    title: const Text('Rezervare confirmată'),
                    subtitle: Text(
                        'Cod QR valabil până la ${_displayTime(_result!.qrExpiresAt)}'),
                    trailing: const Icon(Icons.qr_code_2))),
        ],
      );

  String _displayTime(DateTime value) {
    final local = value.toLocal();
    String two(int part) => part.toString().padLeft(2, '0');
    return '${two(local.day)}.${two(local.month)} ${two(local.hour)}:${two(local.minute)}';
  }
}
