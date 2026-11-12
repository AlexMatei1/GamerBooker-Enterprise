import '../../apps/flutter-mobile/lib/lifecycle_state.dart';
Future<void> main() async {
  void check(bool value,String name){if(!value)throw StateError(name);print('PASS $name');}
  final operations=OperationContext();final captured=operations.epoch;
  final delayed=Future<void>.value().then((_)=>operations.current(captured));
  operations.invalidate();check(!await delayed,'delayed operation cannot overwrite navigation/logout');
  final bars=PassBarState<String>();bars.cart('nexus')[0]=2;bars.cart('cluj')[1]=1;bars.accept('cluj','cluj-order');
  check(bars.cart('nexus')[0]==2&&bars.cart('cluj').isEmpty,'carts are independent per pass');
  check(bars.orders('nexus').isEmpty&&bars.orders('cluj').single=='cluj-order','history is independent per pass');
  bars.reset();check(bars.cart('nexus').isEmpty&&bars.orders('cluj').isEmpty,'local reset clears all local bar scopes');
  var monotonic=100;final clock=PreviewClock(monotonic:()=>monotonic);clock.sync(100000);
  final active=<String,dynamic>{'status':'ACTIVE','startAt':90000,'endAt':101000};
  check(clock.active(active),'server sample controls activity independently of device wall clock');
  monotonic+=1000;check(!clock.active(active),'monotonic deadline ends bar eligibility');
  clock.sync(90000);check(clock.now==101000,'out-of-order response cannot rewind service time');
}
