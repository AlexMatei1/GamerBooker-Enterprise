import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'pass_preview.dart';
import 'lifecycle_state.dart';

const bg = Color(0xff09090b);
const ink = Color(0xfff4f4f5);
const orange = Color(0xff6366f1);
const ticketWhite = Color(0xffffffff);
const surface = Color(0xff12121a);
const raised = Color(0xff181824);
const muted = Color(0xff94a3b8);
const faint = Color(0xff64748b);
const green = Color(0xff10b981);
const line = Color(0xff27272a);

class Venue {
  const Venue(this.name, this.city, this.address, this.rating, this.rate,
      this.free, this.zone, this.image, this.tags);
  final String name, city, address, image;
  final double rating;
  final int rate, free, zone;
  final List<String> tags;
}

class Station {
  const Station(this.name, this.zone, this.hardware, this.gpu, this.peripherals,
      this.rate, this.status);
  final String name, zone, hardware, gpu, peripherals, status;
  final int rate;
}

class MenuItem {
  const MenuItem(this.name, this.category, this.icon, this.price,
      {this.restricted = false});
  final String name, category, icon;
  final int price;
  final bool restricted;
}

class DemoOrder {
  const DemoOrder(this.code, this.items, this.station, this.status);
  final String code, items, station, status;
}

class DemoPass {
  DemoPass(
      {required this.venue,
      required this.station,
      required this.start,
      required this.duration,
      required this.total,
      required this.deposit,
      required this.remaining,
      required this.reference, this.lifecycle = const {}});
  final Map<String,dynamic> lifecycle;
  final Venue venue;
  final Station station;
  final String start, reference;
  int duration, total, deposit, remaining;
}

const venues = [
  Venue(
      'Nexus Gaming Arena Bucharest',
      'Bucharest',
      'Bd. Regina Elisabeta 32, Sector 5',
      4.95,
      3500,
      4,
      3,
      'assets/nexus.jpg',
      ['RTX 4090', '500Hz BenQ', '5v5 Bootcamp']),
  Venue(
      'CyberSphere Esports Cluj',
      'Cluj-Napoca',
      'Str. Regele Ferdinand 18',
      4.88,
      3000,
      2,
      1,
      'assets/cybersphere.jpg',
      ['RTX 4080', 'Secretlab Chairs', 'F&B Lounge']),
];
const stations = [
  Station('VIP-01', 'VIP Stage', 'Intel i9-14900KS • 64GB DDR5',
      'RTX 4090 24GB', 'ZOWIE 360Hz • Wooting 60HE', 5000, 'AVAILABLE'),
  Station('VIP-02', 'VIP Stage', 'Intel i9-14900KS • 64GB DDR5',
      'RTX 4090 24GB', 'ZOWIE 360Hz • Wooting 60HE', 5000, 'OCCUPIED'),
  Station(
      'POD-A1',
      'Esports Pod',
      'AMD Ryzen 7 7800X3D • 32GB DDR5',
      'RTX 4080 Super',
      'ASUS ROG 280Hz • Logitech Superlight',
      3500,
      'AVAILABLE'),
  Station(
      'POD-A2',
      'Esports Pod',
      'AMD Ryzen 7 7800X3D • 32GB DDR5',
      'RTX 4080 Super',
      'ASUS ROG 280Hz • Logitech Superlight',
      3500,
      'AVAILABLE'),
  Station(
      'POD-A3',
      'Esports Pod',
      'AMD Ryzen 7 7800X3D • 32GB DDR5',
      'RTX 4080 Super',
      'ASUS ROG 280Hz • Logitech Superlight',
      3500,
      'MAINTENANCE'),
  Station(
      'PS5-LOUNGE-A',
      'Console Lounge',
      'PlayStation 5 Pro • DualSense Edge',
      'Custom AMD RDNA 3',
      'LG OLED 65” • Atmos Soundbar',
      4000,
      'AVAILABLE'),
];
const clujStations = [
  Station('CJ-01', 'Cluj PC', 'AMD Ryzen 7 7800X3D · 32GB DDR5', 'RTX 4080',
      'Monitor 240Hz · Secretlab', 3000, 'AVAILABLE'),
  Station('CJ-02', 'Cluj PC', 'AMD Ryzen 7 7800X3D · 32GB DDR5', 'RTX 4080',
      'Monitor 240Hz · Secretlab', 3000, 'OCCUPIED'),
  Station('CJ-03', 'Cluj PC', 'AMD Ryzen 7 7800X3D · 32GB DDR5', 'RTX 4080',
      'Monitor 240Hz · Secretlab', 3000, 'AVAILABLE'),
];
List<Station> stationsForVenue(Venue venue) =>
    venue.city == 'Cluj-Napoca' ? clujStations : stations;
const menu = [
  MenuItem('Red Bull Energy 250ml', 'ENERGY', '⚡', 1400, restricted: true),
  MenuItem('Monster Ultra White 500ml', 'ENERGY', '🔋', 1600, restricted: true),
  MenuItem('Coca Cola Zero 330ml', 'DRINK', '🥤', 900),
  MenuItem('Doritos Sweet Chilli & Salsa Dip', 'SNACK', '🧀', 1500),
  MenuItem('Artisan Angus Cheeseburger + Fries', 'HOT FOOD', '🍔', 3900),
  MenuItem('Corona Cero 0.0%', 'DRINK', '🍺', 1800),
];

String money(int bani) => '${(bani / 100).toStringAsFixed(2)} RON';
String clock(int seconds) {
  final h = seconds ~/ 3600;
  final m = (seconds % 3600) ~/ 60;
  return '${h}h ${m.toString().padLeft(2, '0')}m';
}

String endTime(String start, int hours) {
  final parts = start.split(':');
  final totalHour = int.parse(parts[0]) + hours;
  final day = totalHour ~/ 24;
  final label = day == 0
      ? ''
      : day == 1
          ? 'Mâine, '
          : 'Peste $day zile, ';
  return '$label${(totalHour % 24).toString().padLeft(2, '0')}:${parts[1]}';
}

class GamerBookerApp extends StatelessWidget {
  const GamerBookerApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'GamerBooker Preview',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
            brightness: Brightness.dark,
            scaffoldBackgroundColor: bg,
            colorScheme: const ColorScheme.dark(
                primary: orange, surface: surface, onSurface: ink),
            useMaterial3: true,
            fontFamily: 'sans-serif',
            textTheme: const TextTheme(
                bodyMedium: TextStyle(color: ink, fontSize: 16))),
        home: const AppShell(),
      );
}

class AppShell extends StatefulWidget {
  const AppShell({super.key});
  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int tab = 0;
  bool checkout = false, islandOpen = false, listMode = false, passBack = false;
  bool terms = false, processing = false, staffCalled = false;
  final operations = OperationContext();
  int get bookingGeneration=>operations.epoch;
  set bookingGeneration(int value)=>operations.epoch=value;
  Venue venue = venues.first;
  Station station = stations.first;
  int hours = 2, discount = 0, sequence = 104;
  String start = 'DEMO+15s', zone = 'ALL', venueTag = 'ALL', category = 'ALL';
  String payment = 'Google Pay', venueSearch = '', menuSearch = '';
  String? promoMessage;
  final promo = TextEditingController();
  final venueQuery = TextEditingController();
  final menuQuery = TextEditingController();
  final barState = PassBarState<DemoOrder>();
  Map<int,int> get cart => barState.cart(pass?.reference ?? '');
  List<DemoOrder> get orders => barState.orders(pass?.reference ?? '');
  String? connectionError;
  BuildContext? orderDialogContext;
  bool activePass(DemoPass? p)=>p!=null && preview.clock.active(p.lifecycle);
  bool get barEligible=>tab==3 && previewOnline && activePass(pass);
  bool current(int generation)=>mounted && operations.current(generation);
  void closeOrderDialog(){final ctx=orderDialogContext;orderDialogContext=null;if(ctx!=null&&ctx.mounted&&ModalRoute.of(ctx)?.isCurrent==true)Navigator.pop(ctx);}
  void invalidateContext(){bookingGeneration++;processing=false;closeOrderDialog();}

  DemoPass? pass;
  final preview = PassPreview();
  List<Map<String,dynamic>> savedPasses = [];
  Map<String,dynamic>? previewQuote;
  String? previewError;
  bool previewOnline = false, refreshing = false;
  String requestId = '';
  bool showPassList = true;
  late final Timer timer;

  @override
  void initState() {
    super.initState();
    refreshPreview();
    timer = Timer.periodic(const Duration(seconds: 1), (_) {if(!mounted)return;if(!barEligible)closeOrderDialog();setState((){});refreshPreview();});
  }

  DemoPass fromRemote(Map<String,dynamic> p) {
    final v = venues[p['venueId'] == 'v-cyber-cluj-02' ? 1 : 0];
    final st = stationsForVenue(v).firstWhere((s) => s.name == p['stationName']);
    return DemoPass(venue:v,station:st,start:previewTime(p['startAt']),duration:p['durationHours'] as int,total:(p['amounts']?['total'] as int?)??0,deposit:(p['amounts']?['deposit'] as int?)??0,remaining:((p['endAt'] as num).toInt()-(preview.clock.now??(p['serverNow'] as num).toInt()))~/1000,reference:p['id'] as String,lifecycle:p);
  }
  Future<void> refreshPreview() async {
    if(refreshing||processing)return;
    refreshing=true;final generation=bookingGeneration;
    try {final list=await preview.connect();if(!current(generation))return;
      setState((){savedPasses=list;previewOnline=true;connectionError=null;
        if(pass!=null){final found=list.where((p)=>p['id']==pass!.reference);if(found.isNotEmpty)pass=fromRemote(found.first);}
      });
    }catch(e){if(current(generation)){setState((){previewOnline=false;connectionError=e.toString();});closeOrderDialog();}}
    finally{refreshing=false;}
  }
  Future<void> prepareCheckout() async {
    if(processing)return;final generation=++bookingGeneration;
    final input={'venueId':venue==venues[1]?'v-cyber-cluj-02':'v-arena-bucharest-01','stationName':station.name,'durationHours':hours,'start':start,'promo':promo.text};
    setState((){processing=true;previewError=null;});
    try{final q=Map<String,dynamic>.from(await preview.request('quote',input) as Map);
      if(!current(generation))return;setState((){previewQuote=q;requestId='flutter-${DateTime.now().microsecondsSinceEpoch}';checkout=true;terms=false;});
    }catch(e){if(current(generation))setState(()=>previewError=e.toString());}
    finally{if(current(generation))setState(()=>processing=false);}
  }
  Future<void> cancelPreview() async {
    final p=pass;if(p==null||processing||!previewOnline)return;final generation=++bookingGeneration;
    setState((){processing=true;previewError=null;});
    try{final result=Map<String,dynamic>.from(await preview.request('cancel',{'id':p.reference}) as Map);if(!current(generation))return;setState(()=>pass=fromRemote(result));}
    catch(e){if(current(generation))setState(()=>previewError=e.toString());}
    finally{if(current(generation))setState(()=>processing=false);}
  }
  Future<void> openBar() async {
    final p=pass;if(p==null||!previewOnline||!activePass(p)||processing)return;final generation=++bookingGeneration;
    setState((){processing=true;previewError=null;});
    try{final result=Map<String,dynamic>.from(await preview.request('bar-eligibility',{'id':p.reference}) as Map);
      if(!current(generation)||pass?.reference!=p.reference)return;
      if(!preview.clock.active(result))throw StateError('Permisul nu mai este activ.');
      setState((){pass=fromRemote(result);tab=3;});
    }catch(e){if(current(generation))setState(()=>previewError=e.toString());}
    finally{if(current(generation))setState(()=>processing=false);}
  }

  @override
  void dispose() {
    bookingGeneration++;
    timer.cancel();
    preview.close();
    promo.dispose();
    venueQuery.dispose();
    menuQuery.dispose();
    super.dispose();
  }

  int get subtotal => station.rate * hours;
  int get baseDeposit => (subtotal * 30 / 100).round();
  int get discountAmount => (baseDeposit * discount / 100).round();
  int get due => baseDeposit - discountAmount;
  int get balance => subtotal - baseDeposit;
  int get cartCount => cart.values.fold(0, (a, b) => a + b);
  int get cartTotal =>
      cart.entries.fold(0, (sum, e) => sum + menu[e.key].price * e.value);

  void go(int index) => setState(() {
        invalidateContext();
        tab = index;
        if(index==2)showPassList=true;
        checkout = false;
        islandOpen = false;
      });
  void chooseVenue(Venue v) => setState(() {
        venue = v;
        station =
            stationsForVenue(v).firstWhere((s) => s.status == 'AVAILABLE');
        zone = 'ALL';
        invalidateContext();
        tab = 1;
        checkout = false;
      });
  void changeQty(int index, int delta) {if(!barEligible||processing)return;setState(() {
        final value = (cart[index] ?? 0) + delta;
        if (value <= 0) {
          cart.remove(index);
        } else {
          cart[index] = value;
        }
      });
  }
  void localLogout() => setState(() {
        invalidateContext();
        staffCalled = false;
        passBack = false;
        barState.reset();
        pass = null;
        showPassList = true;
        tab = 0;
        checkout = false;
        islandOpen = false;
      });

  @override
  Widget build(BuildContext context) {
    final pages = <Widget>[
      explore(),
      checkout ? checkoutPage() : reserve(),
      showPassList ? passesPage() : passPage(),
      bar(),
      account()
    ];
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark,
      child: PopScope<Object?>(
          canPop: false,
          onPopInvokedWithResult: (didPop, _) {
            if (!didPop) {
              if (checkout) {
                setState(() {
                  bookingGeneration++;
                  processing = false;
                  checkout = false;
                });
              } else if(tab == 3) {
                setState(() {invalidateContext();tab=2;showPassList=false;});
              } else if (tab != 0) {
                go(0);
              }
            }
          },
          child: Scaffold(
            backgroundColor: bg,
            body: SafeArea(
                child: Center(
                    child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 448),
                        child: Column(children: [
                          sessionPill(),
                          if(connectionError!=null) Padding(padding:const EdgeInsets.symmetric(horizontal:20),child:Text(connectionError!,style:const TextStyle(color:Color(0xffa23220),fontSize:13))),
                          if(previewError!=null) Padding(padding:const EdgeInsets.symmetric(horizontal:20),child:Text(previewError!,style:const TextStyle(color:Color(0xffa23220),fontSize:13))),
                          Expanded(
                              child: Stack(children: [
                            Positioned.fill(
                              child: KeyedSubtree(
                                key: ValueKey('$tab-$checkout'),
                                child: pages[tab],
                              ),
                            ),
                            if (MediaQuery.viewInsetsOf(context).bottom == 0 &&
                                tab == 1 &&
                                !checkout)
                              Positioned(
                                  left: 0,
                                  right: 0,
                                  bottom: 0,
                                  child: selectionFooter()),
                            if (MediaQuery.viewInsetsOf(context).bottom == 0 &&
                                tab == 3 &&
                                barEligible && !processing && cartCount > 0)
                              Positioned(
                                  left: 0,
                                  right: 0,
                                  bottom: 0,
                                  child: cartFooter()),
                          ]))
                        ])))),
            bottomNavigationBar: bottomNav(),
          )),
    );
  }

  Widget sessionPill() => Padding(
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 16),
      child: Column(children: [
        Row(children: [
          const Text('GamerBooker.',
              style: TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 22,
                  letterSpacing: -.8)),
          const Spacer(),
          const Text('VIP PASS',
              style: TextStyle(fontSize: 11, color: muted, letterSpacing: 1))
        ]),
        if (pass != null && activePass(pass) && tab != 2) ...[
          const SizedBox(height: 16),
          InkWell(
              onTap: () => go(2),
              child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  decoration: const BoxDecoration(
                      border: Border(
                          top: BorderSide(color: line),
                          bottom: BorderSide(color: line))),
                  child: Row(children: [
                    Expanded(
                        child: Text('${pass!.station.name} · Sesiune activă',
                            style:
                                const TextStyle(fontSize: 13, color: muted))),
                    Text('${clock(pass!.remaining)} →',
                        style: const TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w700))
                  ])))
        ]
      ]));

  Widget bottomNav() {
    final selected = tab==4?2:(tab==2||tab==3?1:0);
    return NavigationBar(selectedIndex:selected,onDestinationSelected:(i)=>go([0,2,4][i]),destinations:const [
      NavigationDestination(icon:Icon(Icons.explore_outlined),label:'Explorează'),
      NavigationDestination(icon:Icon(Icons.confirmation_number_outlined),label:'Permise'),
      NavigationDestination(icon:Icon(Icons.person_outline),label:'Cont')]);
  }

  Widget explore() {
    final filtered = venues.where((v) {
      final q = venueSearch.toLowerCase();
      return (v.name.toLowerCase().contains(q) ||
              v.city.toLowerCase().contains(q) ||
              v.tags.any((t) => t.toLowerCase().contains(q))) &&
          (venueTag == 'ALL' || v.tags.contains(venueTag));
    }).toList();
    return ListView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        children: [
          const Row(children: [
            Icon(Icons.location_on_outlined, size: 17, color: muted),
            SizedBox(width: 5),
            Text('România', style: TextStyle(fontSize: 14)),
            Spacer(),
            Text('Săli de gaming partenere', style: TextStyle(fontSize: 12, color: muted))
          ]),
          const SizedBox(height: 20),
          const Text('Locul tău.\nUrmătoarea sesiune.',
              style: TextStyle(
                  fontSize: 39,
                  height: 1.03,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -1.6)),
          const SizedBox(height: 14),
          const Text('Alege sala, ora și exact locul în care joci.',
              style: TextStyle(fontSize: 16, color: muted, height: 1.5)),
          const SizedBox(height: 22),
          SearchField('Caută o sală sau un oraș',
              controller: venueQuery,
              onChanged: (v) => setState(() => venueSearch = v)),
          const SizedBox(height: 12),
          chips(['ALL', 'RTX 4090', 'RTX 4080'], venueTag,
              (v) => setState(() => venueTag = v)),
          const SizedBox(height: 22),
          Row(children: [
            const Text('Săli de explorat',
                style: TextStyle(fontSize: 21, fontWeight: FontWeight.w700)),
            const Spacer(),
            Text('${filtered.length} locații',
                style: const TextStyle(color: muted, fontSize: 12))
          ]),
          const SizedBox(height: 16),
          if (filtered.isEmpty)
            const Padding(
                padding: EdgeInsets.all(25),
                child: Text('Nicio sală găsită. Încearcă altă căutare.',
                    style: TextStyle(color: muted, fontSize: 15)))
          else
            ...filtered.map(venueRow),
          const Text(
              'Explorează sălile partenere și rezervă postul preferat în timp real.',
              style: TextStyle(fontSize: 12, color: muted, height: 1.6))
        ]);
  }

  Widget featured(Venue v) => InkWell(
      onTap: () => inspectVenue(v),
      borderRadius: BorderRadius.circular(16),
      child: Container(
          decoration: box(surface, radius: 16),
          clipBehavior: Clip.antiAlias,
          child: Column(children: [
            SizedBox(
                height: 176,
                child: Stack(fit: StackFit.expand, children: [
                  venueImage(v),
                  const DecoratedBox(
                      decoration: BoxDecoration(
                          gradient: LinearGradient(
                              begin: Alignment.topCenter,
                              end: Alignment.bottomCenter,
                              colors: [
                        Colors.transparent,
                        Color(0xff09090b)
                      ]))),
                  Positioned(
                      top: 10,
                      right: 10,
                      child: badge('${v.free} SEATS OPEN', color: green)),
                  Positioned(
                      left: 12,
                      bottom: 11,
                      right: 12,
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('★ ${v.rating}  •  ${v.city}',
                                style: const TextStyle(
                                    fontSize: 10,
                                    color: Color(0xfffbbf24),
                                    fontWeight: FontWeight.w600)),
                            const SizedBox(height: 4),
                            Text(v.name,
                                style: const TextStyle(
                                    fontSize: 16, fontWeight: FontWeight.w700)),
                            Text(v.address,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style:
                                    const TextStyle(fontSize: 10, color: muted))
                          ]))
                ])),
            Padding(
                padding: const EdgeInsets.all(12),
                child: Row(children: [
                  ...v.tags.take(2).map((t) => Padding(
                      padding: const EdgeInsets.only(right: 4),
                      child: badge(t))),
                  const Spacer(),
                  Text('from ${(v.rate / 100).toStringAsFixed(0)} RON/h',
                      style: const TextStyle(fontSize: 11, color: muted))
                ]))
          ])));

  Widget venueRow(Venue v) => Padding(
      padding: const EdgeInsets.only(bottom: 24),
      child: InkWell(
          onTap: () => inspectVenue(v),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            SizedBox(height: 145, width: double.infinity, child: venueImage(v)),
            const SizedBox(height: 14),
            Row(children: [
              Expanded(
                  child: Text(v.city,
                      style: const TextStyle(fontSize: 13, color: muted))),
              Text('${(v.rate / 100).round()}',
                  style: const TextStyle(
                      fontSize: 24, fontWeight: FontWeight.w700)),
              const Text(' RON/h', style: TextStyle(fontSize: 12, color: muted))
            ]),
            Text(v.name.replaceAll(' Bucharest', ''),
                style: const TextStyle(
                    fontSize: 23,
                    fontWeight: FontWeight.w700,
                    letterSpacing: -.6,
                    height: 1.2)),
            const SizedBox(height: 5),
            Text(v.address, style: const TextStyle(fontSize: 14, color: muted)),
            const SizedBox(height: 14),
            const Row(children: [
              Expanded(
                  child: Text('Stații de gaming · Disponibilitate live',
                      style: TextStyle(fontSize: 12, color: green))),
              Icon(Icons.north_east, size: 20)
            ]),
            const SizedBox(height: 18),
            const Divider(color: line, height: 1)
          ])));
  Widget venueImage(Venue v) => Container(
      decoration: BoxDecoration(
          color: v == venues.first
              ? const Color(0xff1e1b4b)
              : const Color(0xff1e293b),
          borderRadius: BorderRadius.circular(6)),
      padding: const EdgeInsets.all(18),
      child: Row(children: [
        Text(v == venues.first ? '01' : '02',
            style: TextStyle(
                fontSize: 85,
                height: 1,
                fontWeight: FontWeight.w800,
                letterSpacing: -6,
                color: v == venues.first
                    ? const Color(0xff6366f1)
                    : const Color(0xff818cf8))),
        const Spacer(),
        SizedBox(
            width: 140,
            child:
                Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              Wrap(
                  spacing: 10,
                  runSpacing: 16,
                  children: List.generate(
                      6,
                      (_) => Container(
                          width: 34,
                          height: 27,
                          decoration: BoxDecoration(
                              color: surface,
                              border: Border.all(
                                  color: const Color(0xff4f46e5), width: 2)),
                          child: const Icon(Icons.desktop_windows_outlined,
                              size: 20, color: Color(0xff818cf8))))),
              const SizedBox(height: 14),
              const Text('PC / CONSOLE',
                  style:
                      TextStyle(fontSize: 10, letterSpacing: 2, color: muted))
            ]))
      ]));

  void inspectVenue(Venue v) => showModalBottomSheet<void>(
      context: context,
      backgroundColor: surface,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => SafeArea(
          child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(children: [
                      Expanded(
                          child: Text(v.name,
                              style: const TextStyle(
                                  fontSize: 19, fontWeight: FontWeight.bold))),
                      IconButton(
                          onPressed: () => Navigator.pop(ctx),
                          icon: const Icon(Icons.close))
                    ]),
                    Text('${v.address} • ${v.city}',
                        style: const TextStyle(color: muted, fontSize: 11)),
                    const SizedBox(height: 14),
                    ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: SizedBox(
                            height: 150,
                            width: double.infinity,
                            child: venueImage(v))),
                    const SizedBox(height: 14),
                    Text(
                        '★ ${v.rating}   •   ${v.free} locuri libere   •   ${v.zone} zone',
                        style: const TextStyle(fontSize: 11, color: green)),
                    const SizedBox(height: 8),
                    Text(v.tags.join('  •  '),
                        style: const TextStyle(color: muted, fontSize: 11)),
                    const SizedBox(height: 18),
                    primary('Alege un loc →', () {
                      Navigator.pop(ctx);
                      chooseVenue(v);
                    })
                  ]))));

  Widget reserve() {
    final filtered = stationsForVenue(venue)
        .where((s) => zone == 'ALL' || s.zone == zone)
        .toList();
    final roomZones = filtered.map((s) => s.zone).toSet();
    return ListView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 145),
        children: [
          const Text('01 / Alege locul',
              style: TextStyle(fontSize: 13, color: muted)),
          const SizedBox(height: 10),
          const Text('Unde joci?',
              style: TextStyle(
                  fontSize: 40,
                  letterSpacing: -1.6,
                  fontWeight: FontWeight.w800)),
          const SizedBox(height: 10),
          Text('${venue.name} · Hartă interactivă',
              style: const TextStyle(color: muted, fontSize: 14)),
          const SizedBox(height: 24),
          const Divider(color: line, height: 1),
          const SizedBox(height: 16),
          TextField(controller:promo,onChanged:(_)=>setState(()=>invalidateContext()),decoration:const InputDecoration(labelText:'Cod promoțional (opțional)',hintText:'ENTERPRISE10')),
          const SizedBox(height:12),
          const Text('Ora de început · astăzi',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
          const SizedBox(height: 12),
          selectable('Rezervare imediată', start=='DEMO+15s',()=>setState((){invalidateContext();start='DEMO+15s';})),
          const SizedBox(height:8),
          Row(
              children: ['16:00', '18:00', '20:00', '22:00']
                  .map((t) => Expanded(
                      child: Padding(
                          padding: const EdgeInsets.only(right: 5),
                          child: selectable(
                              t, start == t, () => setState((){invalidateContext();start=t;})))))
                  .toList()),
          const SizedBox(height: 12),
          Row(children: [
            const Text('Durată', style: TextStyle(fontSize: 14, color: muted)),
            const Spacer(),
            ...[1, 2, 3, 5].map((h) => Padding(
                padding: const EdgeInsets.only(left: 6),
                child: selectable(
                    '${h}h', hours == h, () => setState((){invalidateContext();hours=h;}))))
          ]),
          const SizedBox(height: 16),
          const Divider(color: line),
          const SizedBox(height: 14),
          Row(children: [
            const Expanded(
                child: Text('Planul sălii',
                    style:
                        TextStyle(fontSize: 22, fontWeight: FontWeight.w700))),
            TextButton(
                onPressed: () => setState(() => listMode = !listMode),
                child: Text(listMode ? 'Vezi planul' : 'Vezi lista',
                    style: const TextStyle(fontSize: 13)))
          ]),
          const SizedBox(height: 8),
          chips(['ALL', ...stationsForVenue(venue).map((s) => s.zone).toSet()],
              zone, (v) => setState(() => zone = v)),
          const SizedBox(height: 14),
          if (listMode)
            ...filtered.map(stationRow)
          else
            Container(
                decoration: box(raised, radius: 6),
                padding: const EdgeInsets.all(14),
                child: Column(children: [
                  ...roomZones.map((z) => Padding(
                      padding: const EdgeInsets.only(bottom: 24),
                      child: Container(
                          decoration: const BoxDecoration(
                              color: surface,
                              border: Border(
                                  top: BorderSide(
                                      color: Color(0xff4f46e5), width: 3),
                                  left: BorderSide(
                                      color: Color(0xff4f46e5), width: 3),
                                  right: BorderSide(
                                      color: Color(0xff4f46e5), width: 3))),
                          padding: const EdgeInsets.all(12),
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(z,
                                    style: const TextStyle(
                                        fontSize: 14,
                                        fontWeight: FontWeight.w700,
                                        color: muted)),
                                const SizedBox(height: 18),
                                GridView.count(
                                    crossAxisCount: 3,
                                    childAspectRatio: 1.04,
                                    shrinkWrap: true,
                                    physics:
                                        const NeverScrollableScrollPhysics(),
                                    mainAxisSpacing: 10,
                                    crossAxisSpacing: 8,
                                    children: filtered
                                        .where((s) => s.zone == z)
                                        .map(stationTile)
                                        .toList()),
                                const SizedBox(height: 10),
                                const Align(
                                    alignment: Alignment.centerRight,
                                    child: Text('Acces ↘',
                                        style: TextStyle(
                                            color: muted, fontSize: 11)))
                              ])))),
                  const Row(children: [
                    Text('← Intrare / recepție',
                        style: TextStyle(color: muted, fontSize: 11)),
                    Spacer(),
                    Text('Bar →', style: TextStyle(color: muted, fontSize: 11))
                  ])
                ])),
          const SizedBox(height: 18),
          const Text(
              'Hartă sală: Liber / Selectat / Ocupat / Mentenanță',
              style: TextStyle(fontSize: 12, color: muted)),
          const SizedBox(height: 22),
          const Text('Locul ales',
              style: TextStyle(color: muted, fontSize: 13)),
          const SizedBox(height: 5),
          Text(station.name,
              style:
                  const TextStyle(fontSize: 28, fontWeight: FontWeight.w800)),
          const SizedBox(height: 7),
          Text('${station.hardware}\n${station.gpu} · ${station.peripherals}',
              style: const TextStyle(fontSize: 14, color: muted, height: 1.6)),
          const SizedBox(height: 8),
          Text('${money(station.rate)} / oră',
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700))
        ]);
  }

  Widget stationTile(Station s) {
    final selected = station.name == s.name,
        available = s.status == 'AVAILABLE';
    return InkWell(
        onTap: available ? () => setState((){invalidateContext();station=s;}) : null,
        child: Container(
            decoration: BoxDecoration(
                color: selected
                    ? orange
                    : available
                        ? const Color(0xff1e293b)
                        : raised,
                border: Border.all(
                    color: selected ? orange : const Color(0xff334155)),
                borderRadius: BorderRadius.circular(4)),
            padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 8),
            child:
                Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              Text(
                  s.name
                      .replaceAll('VIP-', 'V')
                      .replaceAll('POD-', '')
                      .replaceAll('PS5-LOUNGE-', 'PS5 '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      fontSize: 19, fontWeight: FontWeight.w800)),
              const SizedBox(height: 3),
              Text(
                  selected
                      ? 'Selectat'
                      : available
                          ? 'Liber'
                          : s.status == 'OCCUPIED'
                              ? 'Ocupat'
                              : 'Mentenanță',
                  style: const TextStyle(fontSize: 10, color: muted))
            ])));
  }

  Widget stationRow(Station s) => Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: InkWell(
          onTap: s.status == 'AVAILABLE'
              ? () => setState((){invalidateContext();station=s;})
              : null,
          child: Panel(
              border: s.name == station.name ? ink : line,
              child: Opacity(
                  opacity: s.status == 'AVAILABLE' ? 1 : .45,
                  child: Row(children: [
                    const Icon(Icons.monitor, size: 22, color: muted),
                    const SizedBox(width: 10),
                    Expanded(
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                          Text('${s.name}  •  ${s.zone}',
                              style: const TextStyle(
                                  fontWeight: FontWeight.w700, fontSize: 11)),
                          Text('${s.gpu} • ${s.status}',
                              style:
                                  const TextStyle(fontSize: 10, color: muted))
                        ])),
                    Text('${(s.rate / 100).round()} RON/h',
                        style: const TextStyle(fontSize: 10))
                  ])))));

  Widget selectionFooter() => Container(
      decoration: const BoxDecoration(
          color: bg, border: Border(top: BorderSide(color: line))),
      padding: const EdgeInsets.fromLTRB(20, 14, 20, 12),
      child: Row(children: [
        Expanded(
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
              Text('${station.name} · ${hours}h',
                  style: const TextStyle(color: muted, fontSize: 12)),
              Text(money(subtotal),
                  style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 24,
                      letterSpacing: -.7))
            ])),
        smallButton(
            processing ? 'Se încarcă…' : 'Vezi totalul →',
            () {prepareCheckout();},
            light: true)
      ]));
  Widget cartFooter() => Container(
      color: bg,
      padding: const EdgeInsets.fromLTRB(20, 14, 20, 12),
      child:
          primary('$cartCount produse · ${money(cartTotal)} →', orderDialog));

  Widget checkoutPage() =>
      ListView(padding: const EdgeInsets.fromLTRB(20, 0, 20, 24), children: [
        Row(children: [
          IconButton(
              onPressed: () => setState(() {
                    bookingGeneration++;
                    processing = false;
                    checkout = false;
                  }),
              icon: const Icon(Icons.arrow_back)),
          const Expanded(
              child: Text('Verifică totalul',
                  style: TextStyle(
                      fontSize: 29,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -1)))
        ]),
        const SizedBox(height: 18),
        Panel(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(station.name,
              style:
                  const TextStyle(fontSize: 26, fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          Text(venue.name, style: const TextStyle(fontSize: 14, color: muted)),
          const Divider(height: 28, color: line),
          moneyRow('Interval', previewQuote==null?'': '${previewTime(previewQuote!['startAt'])} — ${previewTime(previewQuote!['endAt'])}'),
          moneyRow('Durată', '${previewQuote?['durationHours']} ore'),
          moneyRow('Subtotal', money(previewQuote?['amounts']['subtotal'] as int? ?? 0)),
          moneyRow('Reducere aplicată', money(previewQuote?['amounts']['discount'] as int? ?? 0)),
          moneyRow('Avans online (30%)', money(previewQuote?['amounts']['deposit'] as int? ?? 0)),
          moneyRow('Rest de plată la recepție', money(previewQuote?['amounts']['remaining'] as int? ?? 0)),
          moneyRow('Total rezervare', money(previewQuote?['amounts']['total'] as int? ?? 0))
        ])),
        const SizedBox(height:16),
        const Text('Nicio plată reală. Metodele de plată nu sunt conectate.',style:TextStyle(fontSize:14,color:muted)),
        const SizedBox(height:20),
        const Text('Politica locației · snapshot',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        Text(
            previewQuote==null?'Politica indisponibilă.': 'Anulare cu minimum ${previewQuote!['policy']['cancelHours']} ore înainte de început. Termen exact, inclusiv: ${previewTime(previewQuote!['cancellationDeadline'])} (ora dispozitivului). După termen sau check-in, anularea este închisă. Fără plată sau rambursare reală. Check-in doar în intervalul rezervat; sosirea târzie păstrează sfârșitul rezervat.',
            style: TextStyle(fontSize: 14, color: muted, height: 1.6)),
        const SizedBox(height: 12),
        CheckboxListTile(
            value: terms,
            onChanged: (v) => setState(() => terms = v ?? false),
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            activeColor: orange,
            title: const Text('Sunt de acord cu termenii și condițiile de rezervare.',
                style: TextStyle(fontSize: 14))),
        const SizedBox(height: 12),
        primary(
            processing
                ? 'Se emite permisul de acces…'
                : 'Confirmă permisul local',
            terms && !processing && previewOnline && previewQuote!=null ? completeBooking : null),
        const SizedBox(height: 12),
        const Text('Plată securizată · Confirmare instantanee',
            textAlign: TextAlign.center,
            style: TextStyle(color: muted, fontSize: 12))
      ]);

  Future<void> completeBooking() async {
    final q=previewQuote;if(q==null||processing)return;final generation=++bookingGeneration;
    final key=requestId;setState((){processing=true;previewError=null;});
    try{final result=Map<String,dynamic>.from(await preview.request('book',{'quoteId':q['id'],'requestId':key}) as Map);
      if(!current(generation))return;setState((){pass=fromRemote(result);savedPasses=[result,...savedPasses.where((p)=>p['id']!=result['id'])];checkout=false;tab=2;showPassList=false;staffCalled=false;});
    }catch(e){if(current(generation))setState(()=>previewError=e.toString());}
    finally{if(current(generation))setState(()=>processing=false);}
  }
  Widget passesPage()=>ListView(padding:const EdgeInsets.all(20),children:[
    const Header('Rezervările tale locale','Permisele mele'),
    if(savedPasses.isEmpty)...[const SizedBox(height:24),const Text('Niciun permis. Alege o sală pentru a rezerva.'),primary('Explorează sălile',()=>go(0))],
    ...savedPasses.map((p)=>Padding(padding:const EdgeInsets.only(top:16),child:ListTile(tileColor:surface,title:Text('${p['venueName']} · ${p['stationName']}'),subtitle:Text('${previewTime(p['startAt'])}\n${p['status']}'),onTap:()=>setState((){invalidateContext();pass=fromRemote(p);showPassList=false;}))))
  ]);
  Widget passPage() {
    final p=pass;if(p==null)return passesPage();final data=p.lifecycle;
    final confirmed=data['status']=='CONFIRMED';
    final now=preview.clock.now;
    final canCancel=confirmed&&now!=null&&now<=(data['cancellationDeadline'] as num);
    return ListView(padding:const EdgeInsets.all(20),children:[
      TextButton(onPressed:()=>setState((){invalidateContext();showPassList=true;}),child:const Text('← Toate permisele')),
      Text(activePass(p)?'Sesiune activă':confirmed?'Confirmat. Te așteptăm.':data['status'].toString(),style:const TextStyle(fontSize:32,fontWeight:FontWeight.w800)),
      const SizedBox(height:20),Panel(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Text(p.venue.name,style:const TextStyle(fontSize:16)),Text(p.station.name,style:const TextStyle(fontSize:40,fontWeight:FontWeight.w800)),
        Text('${previewTime(data['startAt'])} — ${previewTime(data['endAt'])}',style:const TextStyle(fontSize:15)),
        const SizedBox(height:16),Text(confirmed?'CONFIRMAT · FĂRĂ CHECK-IN':data['status'].toString(),style:const TextStyle(fontWeight:FontWeight.w700)),
        if(confirmed)...[
          const Text('Prezintă codul personalului în intervalul rezervat. Numai scanarea staff activează sesiunea.'),
          Center(child:Padding(padding:const EdgeInsets.all(16),child:CustomPaint(size:const Size(240,240),painter:LocalQrPainter(data['qr'] as List)))),
          const Text('Cod scanner / manual',style:TextStyle(fontWeight:FontWeight.w700)),SelectableText(data['code'].toString()),
        ],
        if(activePass(p))...[
          const SizedBox(height:16),Text('Timp rămas · ${clock((((data['endAt'] as num).toInt()-(preview.clock.now??(data['endAt'] as num).toInt()))~/1000).clamp(0,86400))}',style:const TextStyle(fontSize:24,fontWeight:FontWeight.w700)),
          Text('Check-in staff: ${previewTime(data['checkedInAt'])}. Sfârșit rezervat: ${previewTime(data['endAt'])}. Sosirea târzie nu prelungește sesiunea.'),
          primary('Deschide Bar',previewOnline&&!processing?openBar:null),
          const Text('Prelungirile nu sunt conectate în această previzualizare.')
        ],
        const Divider(height:32),Text('Anulare cu minimum ${data['policy']['cancelHours']} ore înainte de început. Termen exact, inclusiv: ${previewTime(data['cancellationDeadline'])} (ora dispozitivului). După termen sau check-in, anularea este închisă.'),
        if(canCancel)primary('Anulează permisul local',!processing&&previewOnline?cancelPreview:null),
        if(data['amounts']!=null)...[moneyRow('Subtotal',money(data['amounts']['subtotal'] as int)),moneyRow('Reducere',money(data['amounts']['discount'] as int)),moneyRow('Avans achitat',money(data['amounts']['deposit'] as int)),moneyRow('Rest la recepție',money(data['amounts']['remaining'] as int)),moneyRow('Total',money(data['amounts']['total'] as int))] else const Text('Permis anterior: nu are sume memorate.'),
        const Text('Permis local. Fără rezervare, plată sau rambursare reală.')
      ]))
    ]);
  }

  Widget ticketMoney(String label, String value) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(children: [
        Expanded(
            child: Text(label,
                style:
                    const TextStyle(color: Color(0xffbcc6ca), fontSize: 13))),
        Text(value,
            style: const TextStyle(
                color: ticketWhite, fontSize: 13, fontWeight: FontWeight.w700))
      ]));

  Widget passDetails(DemoPass p) => Padding(
      padding: const EdgeInsets.all(18),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Row(children: [
          Expanded(
              child: Text('PASS DETAILS & AMENITIES',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold))),
          Text('CONFIRMED', style: TextStyle(color: green, fontSize: 10))
        ]),
        const SizedBox(height: 14),
        Panel(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Arena & session',
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          moneyRow('Venue', p.venue.name),
          moneyRow('Station', p.station.name),
          moneyRow('Window', '${p.start} – ${endTime(p.start, p.duration)}'),
          moneyRow('Avans achitat', money(p.deposit))
        ])),
        const SizedBox(height: 10),
        Panel(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Workstation Hardware Configuration',
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Text(
              '${p.station.hardware}\n${p.station.gpu}\n${p.station.peripherals}',
              style: const TextStyle(color: muted, fontSize: 10, height: 1.6))
        ])),
        const SizedBox(height: 12),
        const Text(
            'Show a confirmed booking to venue staff for check-in. This pass is a simulation.',
            style: TextStyle(color: muted, fontSize: 10)),
        const SizedBox(height: 14),
        primary('Return to QR Pass', () => setState(() => passBack = false))
      ]));

  Widget bar() {
    if(!barEligible)return ListView(padding:const EdgeInsets.all(20),children:[const Text('Barul necesită un permis activ și serviciul online. Coșul a fost păstrat.'),TextButton(onPressed:()=>setState((){invalidateContext();tab=2;showPassList=false;}),child:const Text('Înapoi la același permis'))]);
    final filtered = List<int>.generate(menu.length, (i) => i)
        .where((i) =>
            (category == 'ALL' || menu[i].category == category) &&
            menu[i].name.toLowerCase().contains(menuSearch.toLowerCase()))
        .toList();
    return ListView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 120),
        children: [
          TextButton(onPressed:()=>setState((){invalidateContext();tab=2;showPassList=false;}),child:const Text('← Înapoi la același permis')),
          Header(
              'Pentru ${pass?.station.name ?? station.name}', 'Pauză de bar'),
          const SizedBox(height: 16),
          const Text(
              'Meniu Bar & Snacks · Comandă livrată direct la postul tău.',
              style: TextStyle(fontSize: 14, color: muted, height: 1.5)),
          const SizedBox(height: 16),
          SearchField('Caută produse…',
              controller: menuQuery,
              onChanged: (v) => setState(() => menuSearch = v)),
          const SizedBox(height: 14),
          if (orders.isNotEmpty) ...[
            Text('Comenzi active (${orders.length})',
                style:
                    const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            const SizedBox(height: 10),
            ...orders.map((o) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('#${o.code} · ${o.status}',
                          style: const TextStyle(
                              fontSize: 13,
                              color: green,
                              fontWeight: FontWeight.w700)),
                      Text(o.items,
                          style: const TextStyle(fontSize: 14, color: muted))
                    ]))),
            const Divider(color: line),
            const SizedBox(height: 12)
          ],
          chips(['ALL', 'ENERGY', 'HOT FOOD', 'SNACK', 'DRINK'], category,
              (v) => setState(() => category = v)),
          const SizedBox(height: 18),
          if (filtered.isEmpty)
            const Text('Niciun produs găsit.',
                style: TextStyle(color: muted, fontSize: 15))
          else
            ...filtered.map(menuCard)
        ]);
  }

  Widget menuCard(int i) {
    final item = menu[i], qty = cart[i] ?? 0;
    return Container(
        padding: const EdgeInsets.symmetric(vertical: 18),
        decoration: const BoxDecoration(
            border: Border(bottom: BorderSide(color: line))),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
                width: 46,
                height: 46,
                alignment: Alignment.center,
                decoration: box(raised, radius: 6),
                child: Icon(
                    item.category == 'SNACK'
                        ? Icons.cookie_outlined
                        : item.category == 'HOT FOOD'
                            ? Icons.restaurant_outlined
                            : Icons.local_drink_outlined,
                    color: muted)),
            const SizedBox(width: 12),
            Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text(item.name,
                      style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          height: 1.3)),
                  const SizedBox(height: 6),
                  Text(money(item.price), style: const TextStyle(fontSize: 15))
                ]))
          ]),
          const SizedBox(height: 12),
          Row(children: [
            if (item.restricted)
              const Expanded(
                  child: Text('Verificare la servire',
                      style: TextStyle(fontSize: 12, color: muted)))
            else
              const Spacer(),
            if (qty == 0)
              smallButton('+ Adaugă', () => changeQty(i, 1))
            else ...[
              smallButton('−', () => changeQty(i, -1)),
              Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Text('$qty',
                      style: const TextStyle(
                          fontSize: 16, fontWeight: FontWeight.w700))),
              smallButton('+', () => changeQty(i, 1), light: true)
            ]
          ])
        ]));
  }

  Future<void> orderDialog() async {
    final p=pass;if(p==null||!barEligible||processing||cart.isEmpty)return;
    final generation=++bookingGeneration,id=p.reference,snapshot=Map<int,int>.from(cart);
    final count=cartCount,total=cartTotal;setState((){processing=true;previewError=null;});
    try{final result=Map<String,dynamic>.from(await preview.request('bar-eligibility',{'id':id}) as Map);
      if(!current(generation)||pass?.reference!=id||!preview.clock.active(result))return;
    }catch(e){if(current(generation))setState(()=>previewError=e.toString());return;}
    finally{if(current(generation))setState(()=>processing=false);}
    if(!current(generation)||!barEligible)return;
    await showDialog<void>(context:context,builder:(ctx){orderDialogContext=ctx;return AlertDialog(
      backgroundColor:surface,title:const Text('Simulezi comanda?'),
      content:Text('$count produse · ${money(total)}\n${p.station.name}\nComanda va fi pregătită de personalul barului.'),
      actions:[TextButton(onPressed:(){setState(()=>invalidateContext());},child:const Text('Anulează')),
        TextButton(onPressed:() async {
          if(!current(generation)||!barEligible||pass?.reference!=id||processing)return;
          setState((){processing=true;previewError=null;});
          try{final result=Map<String,dynamic>.from(await preview.request('bar-eligibility',{'id':id}) as Map);
            if(!current(generation)||pass?.reference!=id||!barEligible||!preview.clock.active(result))return;
            final items=snapshot.entries.map((e)=>'${e.value}× ${menu[e.key].name}').join(', ');
            setState((){sequence++;barState.accept(id,DemoOrder('D$sequence',items,p.station.name,'SIMULATED'));});
            closeOrderDialog();
          }catch(e){if(current(generation)){setState((){previewError=e.toString();previewOnline=false;});closeOrderDialog();}}
          finally{if(current(generation))setState(()=>processing=false);}
        },child:const Text('Simulează comanda'))]);});
    if(orderDialogContext!=null){orderDialogContext=null;if(current(generation))setState(()=>invalidateContext());}
  }

  Widget account() =>
      ListView(padding: const EdgeInsets.fromLTRB(20, 0, 20, 24), children: [
        const Header('Datele tale, la îndemână', 'Contul meu'),
        const SizedBox(height: 26),
        const Row(children: [
          CircleAvatar(
              radius: 28,
              backgroundColor: raised,
              child: Text('A',
                  style: TextStyle(
                      fontSize: 28, color: ink, fontWeight: FontWeight.w700))),
          SizedBox(width: 14),
          Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text('Alex Miller',
                    style:
                        TextStyle(fontSize: 23, fontWeight: FontWeight.w700)),
                Text('alex.miller@example.test',
                    style: TextStyle(fontSize: 13, color: muted)),
                Text('Profil GamerBooker',
                    style: TextStyle(fontSize: 12, color: muted))
              ]))
        ]),
        const SizedBox(height: 30),
        accountEntry(Icons.calendar_today_outlined, 'Rezervările mele',
            'Permise și istoricul sesiunilor', () => go(2)),
        accountEntry(
            Icons.receipt_long_outlined,
            'Plăți și documente',
            'Istoric rezervări & plăți',
            () => infoDialog('Plăți și documente',
                'Vezi detaliile și bonurile fiscale emise pentru rezervările tale.')),
        accountEntry(
            Icons.settings_outlined,
            'Setări',
            'Preferințe și notificări',
            () => infoDialog('Setări',
                'Setări de securitate, confidențialitate și preferințe cont.')),
        accountEntry(Icons.shield_outlined, 'Confidențialitate',
            'Date personale și opțiuni de cont', deleteDialog),
        accountEntry(
            Icons.help_outline,
            'Ajutor și suport',
            'Întrebări despre rezervări și locații',
            () => infoDialog('Ajutor și suport',
                'Asistență clienți și detalii despre regulamentul sălii.')),
        const SizedBox(height: 26),
        secondary('Deconectare cont', localLogout),
        const SizedBox(height: 16),
        const Text('Te poți reconecta oricând cu datele tale de cont.',
            style: TextStyle(fontSize: 13, color: muted, height: 1.6))
      ]);
  void infoDialog(String title, String content) => showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
              backgroundColor: bg,
              title: Text(title),
              content: Text(content,
                  style: const TextStyle(color: muted, fontSize: 15)),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(ctx),
                    child: const Text('Închide'))
              ]));
  Widget accountEntry(
          IconData icon, String title, String subtitle, VoidCallback onTap) =>
      InkWell(
          onTap: onTap,
          child: Container(
              padding: const EdgeInsets.symmetric(vertical: 21),
              decoration: const BoxDecoration(
                  border: Border(bottom: BorderSide(color: line))),
              child: Row(children: [
                Icon(icon, size: 23, color: muted),
                const SizedBox(width: 14),
                Expanded(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                      Text(title,
                          style: const TextStyle(
                              fontSize: 16, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 4),
                      Text(subtitle,
                          style: const TextStyle(fontSize: 13, color: muted))
                    ])),
                const Icon(Icons.chevron_right, size: 19, color: muted)
              ])));

  Widget settingsRow(IconData icon, String title, String subtitle) => InkWell(
      onTap: () => showDialog<void>(
          context: context,
          builder: (ctx) => AlertDialog(
                  backgroundColor: surface,
                  title: Text(title),
                  content: const Text('This section is a local preview.',
                      style: TextStyle(color: muted)),
                  actions: [
                    TextButton(
                        onPressed: () => Navigator.pop(ctx),
                        child: const Text('Închide'))
                  ])),
      child: Row(children: [
        Icon(icon, size: 18, color: muted),
        const SizedBox(width: 10),
        Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title,
              style:
                  const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
          Text(subtitle, style: const TextStyle(fontSize: 9, color: faint))
        ])),
        const Icon(Icons.chevron_right, color: faint, size: 18)
      ]));
  void deleteDialog() => showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
              backgroundColor: surface,
              title: const Text('Dorești să te deconectezi?'),
              content: const Text(
                  'Vei fi deconectat de pe acest dispozitiv.',
                  style: TextStyle(color: muted, fontSize: 12)),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(ctx),
                    child: const Text('Anulează')),
                TextButton(
                    onPressed: () {
                      Navigator.pop(ctx);
                      localLogout();
                      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                          content: Text(
                              'Te-ai deconectat cu succes.')));
                    },
                    child: const Text('Deconectează-te'))
              ]));

  Widget stat(String title, String value, String sub) => Panel(
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title, style: const TextStyle(fontSize: 9, color: faint)),
        const SizedBox(height: 5),
        Text(value,
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
        Text(sub, style: const TextStyle(color: faint, fontSize: 9))
      ]));
  Widget meta(String title, String value) =>
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title, style: const TextStyle(fontSize: 9, color: faint)),
        const SizedBox(height: 3),
        Text(value,
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600))
      ]);
}

BoxDecoration box(Color color, {double radius = 12, Color border = line}) =>
    BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: border, width: .7));
Widget badge(String text, {Color color = muted}) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
    decoration: box(raised, radius: 5),
    child: Text(text,
        style:
            TextStyle(fontSize: 9, color: color, fontWeight: FontWeight.w600)));
Widget chips(
        List<String> items, String selected, ValueChanged<String> onSelect) =>
    SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
            children: items
                .map((t) => Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: selectable(t, selected == t, () => onSelect(t))))
                .toList()));
Widget selectable(String label, bool selected, VoidCallback onTap) => InkWell(
    onTap: onTap,
    borderRadius: BorderRadius.circular(8),
    child: Container(
        alignment: Alignment.center,
        constraints: const BoxConstraints(minHeight: 44, minWidth: 44),
        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 12),
        decoration: box(selected ? orange : surface,
            radius: 8, border: selected ? orange : line),
        child: Text(label,
            textAlign: TextAlign.center,
            style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: selected ? ticketWhite : muted))));
Widget smallButton(String text, VoidCallback onTap, {bool light = false}) =>
    InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Container(
            constraints: const BoxConstraints(minHeight: 44, minWidth: 44),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            decoration: box(light ? orange : raised,
                radius: 8, border: light ? orange : line),
            child: Text(text,
                textAlign: TextAlign.center,
                style: TextStyle(
                    fontSize: 13, fontWeight: FontWeight.w600, color: ink))));
Widget primary(String label, VoidCallback? onTap) => SizedBox(
    width: double.infinity,
    child: FilledButton(
        onPressed: onTap,
        style: FilledButton.styleFrom(
            backgroundColor: orange,
            foregroundColor: ink,
            disabledBackgroundColor: raised,
            padding: const EdgeInsets.symmetric(vertical: 13),
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(11))),
        child: Text(label,
            textAlign: TextAlign.center,
            style:
                const TextStyle(fontSize: 15, fontWeight: FontWeight.w700))));
Widget secondary(String label, VoidCallback onTap) => SizedBox(
    width: double.infinity,
    child: OutlinedButton(
        onPressed: onTap,
        style: OutlinedButton.styleFrom(
            foregroundColor: ink,
            side: const BorderSide(color: line),
            padding: const EdgeInsets.symmetric(vertical: 13),
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(11))),
        child: Text(label,
            textAlign: TextAlign.center,
            style:
                const TextStyle(fontSize: 14, fontWeight: FontWeight.w600))));
Widget moneyRow(String label, String value, {bool emphasize = false}) =>
    Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
              child: Text(label,
                  style: TextStyle(
                      fontSize: 14, color: emphasize ? green : muted))),
          const SizedBox(width: 8),
          Flexible(
              child: Text(value,
                  textAlign: TextAlign.right,
                  style: TextStyle(
                      fontSize: 14,
                      color: ink,
                      fontWeight:
                          emphasize ? FontWeight.w700 : FontWeight.w400)))
        ]));

class Header extends StatelessWidget {
  const Header(this.eyebrow, this.title, {this.trailing, super.key});
  final String eyebrow, title;
  final String? trailing;
  @override
  Widget build(BuildContext context) => Row(children: [
        Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(eyebrow, style: const TextStyle(fontSize: 13, color: faint)),
          const SizedBox(height: 4),
          Text(title,
              style: const TextStyle(
                  fontSize: 36,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -1.3))
        ])),
        if (trailing != null)
          Container(
              width: 32,
              height: 32,
              alignment: Alignment.center,
              decoration: box(surface, radius: 20),
              child: Text(trailing!, style: const TextStyle(fontSize: 10)))
      ]);
}

class Panel extends StatelessWidget {
  const Panel({required this.child, this.border = line, super.key});
  final Widget child;
  final Color border;
  @override
  Widget build(BuildContext context) => Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: box(surface, border: border),
      child: child);
}

class Dot extends StatelessWidget {
  const Dot(this.color, {this.size = 6, super.key});
  final Color color;
  final double size;
  @override
  Widget build(BuildContext context) => Container(
      width: size,
      height: size,
      decoration: BoxDecoration(color: color, shape: BoxShape.circle));
}

class Caption extends StatelessWidget {
  const Caption(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) =>
      Text(text, style: const TextStyle(color: muted, fontSize: 10));
}

class SearchField extends StatelessWidget {
  const SearchField(this.hint,
      {required this.onChanged, this.controller, super.key});
  final String hint;
  final ValueChanged<String> onChanged;
  final TextEditingController? controller;
  @override
  Widget build(BuildContext context) => TextField(
      controller: controller,
      onChanged: onChanged,
      style: const TextStyle(fontSize: 15),
      decoration: InputDecoration(
          prefixIcon: const Icon(Icons.search, size: 18, color: faint),
          prefixIconConstraints: const BoxConstraints(minWidth: 36),
          isDense: true,
          contentPadding: const EdgeInsets.symmetric(vertical: 11),
          hintText: hint,
          hintStyle: const TextStyle(color: faint, fontSize: 14),
          filled: true,
          fillColor: surface,
          border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: line)),
          enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: line))));
}

class LocalQrPainter extends CustomPainter {
  LocalQrPainter(this.matrix);final List matrix;
  @override void paint(Canvas canvas,Size size){
    canvas.drawRect(Offset.zero & size,Paint()..color=Colors.white);
    final unit=size.width/(matrix.length+8);final paint=Paint()..color=Colors.black..isAntiAlias=false;
    for(var y=0;y<matrix.length;y++){for(var x=0;x<matrix.length;x++){if(matrix[y][x]==true)canvas.drawRect(Rect.fromLTWH((x+4)*unit,(y+4)*unit,unit,unit),paint);}}
  }
  @override bool shouldRepaint(covariant LocalQrPainter oldDelegate)=>oldDelegate.matrix!=matrix;
}

