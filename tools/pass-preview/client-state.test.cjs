const {test}=require('node:test'),assert=require('node:assert/strict');
test('real web client primitives reject delayed completions across navigation/logout and isolate pass carts/orders',async()=>{
 const {OperationContext,PassBarState,ServiceClock}=await import('../../apps/mobile-app/src/services/lifecycleState.ts');
 const context=new OperationContext();let finish;let navigated=false;const epoch=context.capture();
 const pending=new Promise(r=>finish=r).then(()=>{if(context.current(epoch))navigated=true;});
 context.invalidate();finish();await pending;assert.equal(navigated,false);
 const oldPoll=context.capture();context.invalidate();assert.equal(context.current(oldPoll),false);assert.equal(context.current(context.capture()),true);
 const bars=new PassBarState();bars.setCart('nexus-pass',{'cola':2});bars.setCart('cluj-pass',{'snack':1});bars.accept('cluj-pass',{bookingId:'cluj-pass'});
 assert.deepEqual(bars.cart('nexus-pass'),{'cola':2});assert.deepEqual(bars.cart('cluj-pass'),{});assert.deepEqual(bars.orders('nexus-pass'),[]);assert.equal(bars.orders('cluj-pass')[0].bookingId,'cluj-pass');
 bars.reset();assert.deepEqual(bars.orders('cluj-pass'),[]);assert.deepEqual(bars.cart('nexus-pass'),{});
 let mono=100;const clock=new ServiceClock(()=>mono);assert.equal(clock.now(),null);clock.sync(100000);
 const active={status:'ACTIVE',startAt:90000,endAt:101000};assert.equal(clock.active(active),true);mono+=1000;assert.equal(clock.active(active),false);
 clock.sync(90000);assert.equal(clock.now(),101000);assert.equal(clock.active({...active,status:'CONFIRMED'}),false);
});
