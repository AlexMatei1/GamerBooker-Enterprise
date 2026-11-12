// Pure client primitives, exercised with controlled time and delayed promises.
export class OperationContext {
 private epoch=0;
 capture(){return this.epoch;}
 invalidate(){return ++this.epoch;}
 current(epoch:number){return epoch===this.epoch;}
}
export class ServiceClock {
 private server:number|null=null;
 private sampled=0;
 private monotonic:()=>number;
 constructor(monotonic:()=>number=()=>performance.now()){this.monotonic=monotonic;}
 sync(server:number){if(Number.isFinite(server)){this.server=Math.max(server,this.now()??server);this.sampled=this.monotonic();}}
 now(){return this.server===null?null:this.server+Math.max(0,this.monotonic()-this.sampled);}
 active(pass:{status:string;startAt:number;endAt:number}|undefined){const now=this.now();return !!pass&&now!==null&&pass.status==='ACTIVE'&&now>=pass.startAt&&now<pass.endAt;}
}
export class PassBarState<Order> {
 private carts:Record<string,Record<string,number>>={};
 private histories:Record<string,Order[]>={};
 cart(id:string){return this.carts[id]||{};}
 orders(id:string){return this.histories[id]||[];}
 setCart(id:string,cart:Record<string,number>){this.carts[id]={...cart};}
 accept(id:string,order:Order){this.histories[id]=[order,...this.orders(id)];this.carts[id]={};}
 reset(){this.carts={};this.histories={};}
}
