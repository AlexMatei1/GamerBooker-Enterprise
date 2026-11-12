class PreviewClock {
  final Stopwatch _elapsed = Stopwatch()..start();
  late final int Function() _monotonic;
  PreviewClock({int Function()? monotonic}) {_monotonic=monotonic??()=>_elapsed.elapsedMilliseconds;}
  int? _server;
  int _sampled = 0;
  int? get now => _server == null ? null : _server! + _monotonic() - _sampled;
  void sync(int server) {
    final current = now;
    _server = current != null && current > server ? current : server;
    _sampled = _monotonic();
  }
  bool active(Map<String,dynamic>? pass) {
    final time = now;
    return pass != null && time != null && pass['status'] == 'ACTIVE' && time >= (pass['startAt'] as num) && time < (pass['endAt'] as num);
  }
}
class PassBarState<T> {
  final _carts = <String,Map<int,int>>{};
  final _orders = <String,List<T>>{};
  Map<int,int> cart(String id) => _carts.putIfAbsent(id,()=>{});
  List<T> orders(String id) => _orders.putIfAbsent(id,()=>[]);
  void accept(String id,T order) {orders(id).insert(0,order);cart(id).clear();}
  void reset() {_carts.clear();_orders.clear();}
}
class OperationContext {
  int epoch=0;
  int invalidate()=>++epoch;
  bool current(int captured)=>epoch==captured;
}
