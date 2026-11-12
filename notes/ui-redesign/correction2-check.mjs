import fs from 'node:fs/promises';
const root = new URL('.', import.meta.url);
let tabs;
for (let i=0;i<50;i++) {try {tabs=await fetch('http://127.0.0.1:9227/json/list').then(r=>r.json());break} catch {await new Promise(r=>setTimeout(r,100))}}
if(!tabs) throw Error('Task Chrome unavailable');
const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
await new Promise(r=>ws.addEventListener('open',r,{once:true}));
let id=0;const pending=new Map(),requests=[],checks=[],screenshots=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Network.requestWillBeSent')requests.push({method:m.params.request.method,url:m.params.request.url});if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result)}};
function call(method,params={}){return new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))})}
async function ev(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function ready(expression){for(let i=0;i<200;i++){if(await ev(expression))return;await pause(100)}throw Error('Preview readiness timeout')}
async function click(text){const clicked=await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim().replace(/↗$/,'').trim()===${JSON.stringify(text)});if(!b)return false;b.scrollIntoView({block:'center'});b.click();return true})()`);if(!clicked)throw Error('Missing '+text);await pause(70)}
async function field(selector,value){await ev(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}))})()`);await pause(40)}
async function assert(name,expression){const pass=await ev(expression);checks.push({name,result:pass?'PASS':'FAIL'});if(!pass)throw Error(name)}
async function shot(name){const filename='correction2-'+name+'.png';const r=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(new URL(filename,root),Buffer.from(r.data,'base64'));screenshots.push({filename,url:'http://127.0.0.1:5173',viewport:{width:1440,height:900},method:'Existing Chrome headless CDP Page.captureScreenshot; actual rendered local UI; unedited PNG'})}
await call('Page.enable');await call('Network.enable');await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,mobile:false,deviceScaleFactor:1});
try {
 await call('Page.navigate',{url:'http://127.0.0.1:5173'});await ready("!!document.querySelector('.venue-rail')");await click('Încasări');await ready("document.querySelector('main')?.textContent.includes('Exemple de încasări · demo local')");
 await assert('Ledger heading explicitly local illustrative/no reconciliation',"document.querySelector('main').textContent.includes('Exemple de încasări · demo local')&&document.querySelector('main').textContent.includes('fără reconciliere financiară reală')&&document.querySelector('main').textContent.includes('fără efect asupra rezervărilor')");
 await ev('window.scrollTo(0,0)');await shot('ledger');
 await click('Simulează anularea →');await assert('Void dialog and PIN explicitly demonstration',"document.body.textContent.includes('Anularea unui document · demo')&&document.body.textContent.includes('PIN demonstrativ (4 cifre)')");await shot('void-dialog');
 await field('input[type=password]','1234');await click('Confirmă simularea locală');
 await assert('Void outcome only local; booking and financial balances unchanged',"document.querySelector('main').textContent.includes('marcat ca anulat doar în această pagină')&&document.querySelector('main').textContent.includes('Niciun sold de rezervare sau financiar real nu a fost modificat')&&document.querySelector('tbody tr').textContent.includes('ANULARE SIMULATĂ')");
 await ev('window.scrollTo(0,0)');await shot('void-outcome');
 await assert('Misleading financial completion headings absent',"!['Daily Financial Reconciliation','Strict cash drawer chaining','Electronic POS reconciliation','Managerial void audit trail','Outstanding balance restored'].some(t=>document.querySelector('main').textContent.includes(t))");
 await click('Ghiduri operaționale');await assert('Runbooks explicitly no database audit/refund/reconciliation',"document.querySelector('main').textContent.includes('Fără audit al bazei de date, rambursare reală')&&document.querySelector('main').textContent.includes('reconciliere financiară sau decizie de lansare')");
 await field('input[placeholder="ID loc · exemplu local"]','DEMO-PC-02');await click('Arată exemplul local');
 await assert('R1 outcome states preset illustration without findings/database access',"document.querySelector('main').textContent.includes('0 · exemplu, fără verificare')&&document.querySelector('main').textContent.includes('Scenariu ilustrativ, fără constatare')&&document.querySelector('main').textContent.includes('fără acces la baza de date sau la rezervări reale')");
 await field('input[placeholder="Referință ilustrativă · demo_99201"]','DEMO-REF-001');await click('Simulează revizuirea locală');
 await assert('R2 result explicitly no real refund or reconciliation',"document.querySelector('main').textContent.includes('REVIZUIRE SIMULATĂ · FĂRĂ RAMBURSARE')&&document.querySelector('main').textContent.includes('Nu a fost trimisă nicio rambursare')&&document.querySelector('main').textContent.includes('nicio reconciliere financiară reală')");
 await assert('Misleading audit/refund completion claims absent',"!['REFUND DISPATCHED','PostgreSQL','GiST','Exclusion Constraint Intact','Audit Claims','GB-992101','Physical Squatting Suspected'].some(t=>document.querySelector('main').textContent.includes(t))");
 await ev("[...document.querySelectorAll('main h3')].find(e=>e.textContent.includes('R1 /')).scrollIntoView({block:'start'})");await shot('audit-refund-outcomes');
 const posts=requests.filter(r=>r.method==='POST');checks.push({name:'Observed ledger void/runbooks audit/refund network POST count',result:posts.length===0?'PASS':'FAIL',count:posts.length,posts});if(posts.length)throw Error('Unexpected POST');
 await fs.writeFile(new URL('correction2-results.json',root),JSON.stringify({checks,requests,screenshots,priorEvidence:'Correction1 21 web/9 native checks were not rerun in this copy-only round.'},null,2));console.log(JSON.stringify(checks));
}catch(error){await fs.writeFile(new URL('correction2-failure.json',root),JSON.stringify({error:String(error),checks,requests},null,2));await shot('failure');console.error(error);process.exitCode=1}
finally {await call('Browser.close')}
