const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const {start}=require('./server.cjs');
test('loopback, roles, staff capability, cross-origin and production-write denial; offline failure',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gb-http-test-'));const app=start({file:path.join(dir,'state.json'),customerPort:18787,staffPort:18788});
 try{await Promise.all(app.servers.map(s=>new Promise(r=>s.listening?r():s.once('listening',r))));assert.ok(app.servers.every(s=>s.address().address==='127.0.0.1'));
 const call=(port,route,headers={},body={})=>fetch(`http://127.0.0.1:${port}${route}`,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 assert.equal((await call(18787,'/v1/bookings')).status,404);
 assert.equal((await call(18787,'/preview/customer/session')).status,403);
 assert.equal((await call(18787,'/preview/customer/session',{'X-Preview-Client':'customer',Origin:'http://evil.invalid'})).status,403);
 const spoof=await new Promise((resolve,reject)=>{const r=require('node:http').request({host:'127.0.0.1',port:18787,path:'/preview/customer/session',method:'POST',headers:{Host:'evil.invalid:18787','Content-Type':'application/json','X-Preview-Client':'customer'}},s=>{s.resume();resolve(s.statusCode);});r.on('error',reject);r.end('{}');});assert.equal(spoof,403);
 assert.equal((await call(18787,'/preview/staff/scan',{'X-Preview-Client':'customer'})).status,403);
 assert.equal((await call(18788,'/preview/staff/scan',{'X-Preview-Client':'staff'})).status,403);
 assert.equal((await call(18788,'/preview/staff/policy',{'X-Preview-Client':'staff',Authorization:'Bearer '+app.staffCapability,Origin:'http://127.0.0.1:18787'},{venueId:'v-arena-bucharest-01',cancelHours:0})).status,403);
 assert.equal((await call(18787,'/preview/customer/session',{'X-Preview-Client':'customer'})).status,201);
 assert.equal((await call(18788,'/preview/staff/policy',{'X-Preview-Client':'staff',Authorization:'Bearer '+app.staffCapability},{venueId:'v-arena-bucharest-01',cancelHours:0})).status,200);
 }finally{await app.close();fs.rmSync(dir,{recursive:true,force:true});}
 await assert.rejects(fetch('http://127.0.0.1:18787/preview/customer/passes'));
});
