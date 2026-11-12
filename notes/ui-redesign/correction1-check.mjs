import fs from "node:fs/promises";
const root = new URL(".", import.meta.url);
let tabs;
for (let attempt = 0; attempt < 50; attempt++) {
  try {
    tabs = await fetch("http://127.0.0.1:9226/json/list").then((r) => r.json());
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 100));
  }
}
if (!tabs) throw Error("Task Chrome endpoint unavailable");
const ws = new WebSocket(
  tabs.find((t) => t.type === "page").webSocketDebuggerUrl,
);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const pending = new Map(),
  requests = [],
  checks = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.method === "Network.requestWillBeSent")
    requests.push({
      method: m.params.request.method,
      url: m.params.request.url,
    });
  if (m.id) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    m.error ? p.reject(m.error) : p.resolve(m.result);
  }
};
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
}
async function ev(expression) {
  const r = await call("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function click(text) {
  const ok = await ev(
    `(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim().replace(/↗$/,'').trim()===${JSON.stringify(text)});if(!b) return false;b.click();return true})()`,
  );
  if (!ok) throw Error("Missing button " + text);
  await pause(70);
}
async function field(selector, value) {
  await ev(
    `(()=>{const input=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}))})()`,
  );
  await pause(40);
}
async function shot(name) {
  const r = await call("Page.captureScreenshot", { format: "png" });
  await fs.writeFile(
    new URL("correction1-" + name + ".png", root),
    Buffer.from(r.data, "base64"),
  );
}
async function assert(name, expression) {
  const value = await ev(expression);
  checks.push({ name, result: value ? "PASS" : "FAIL" });
  if (!value) throw Error(name + " failed");
}
async function navigate(url) {
  await call("Page.navigate", { url });
  for (let i = 0; i < 80; i++) {
    await pause(100);
    if (
      await ev(
        url.includes("5173")
          ? "!!document.querySelector('.attention-queue')"
          : "!!document.querySelector('.mobile-brand')",
      )
    )
      return;
  }
  throw Error("Preview did not become ready: " + url);
}
async function observe() {
  await ev(
    `window.previewEvents=[];window.previewObserver=new BroadcastChannel('gamerbooker-local-preview-v1');window.previewObserver.onmessage=e=>window.previewEvents.push(e.data);`,
  );
}
await call("Page.enable");
await call("Network.enable");
await call("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  mobile: true,
  deviceScaleFactor: 1,
});
try {
  await navigate("http://127.0.0.1:5174");
  await observe();
  await click("Cont");
  await click("Ieși din sesiunea demo");
  await click("Rezervă");
  await click("Vezi totalul →");
  await pause(150);
  await assert(
    "Nexus 50 RON/hour; 2h subtotal100",
    `document.querySelector('.checkout-money').textContent.includes('100.00 RON')&&document.querySelector('.checkout-money').textContent.includes('50.00 RON')`,
  );
  await field('input[aria-label="Cod promo"]', "ENTERPRISE10");
  await click("Aplică");
  await assert(
    "Nexus discount: deposit27 remaining70 total97",
    `document.querySelector('.checkout-money').textContent.includes('27.00 RON')&&document.querySelector('.checkout-money').textContent.includes('70.00 RON')&&document.querySelector('.checkout-money').textContent.includes('97.00 RON')`,
  );
  await ev(`document.querySelector('input[type=checkbox]').click()`);
  await pause(40);
  await click("Simulează rezervarea · 27.00 RON");
  await click("Cont");
  await click("Ieși din sesiunea demo");
  await pause(850);
  await assert(
    "Abandoned pending checkout cannot resurrect pass/event",
    `!document.querySelector('.admission-ticket')&&!document.querySelector('.session-strip')&&window.previewEvents.filter(e=>e.type==='STATION_STATUS_CHANGED').length===0`,
  );
  await click("Rezervă");
  await click("22:00");
  await click("5h");
  await click("Vezi totalul →");
  await pause(150);
  await assert(
    "22+5 checkout shows next day03",
    `document.querySelector('.checkout-summary').textContent.includes('Mâine, 03:00')`,
  );
  await shot("nexus-midnight-checkout");
  await ev(`document.querySelector('input[type=checkbox]').click()`);
  await pause(40);
  await click("Simulează rezervarea · 75.00 RON");
  await pause(850);
  await assert(
    "Nexus midnight pass coherent",
    `document.querySelector('.admission-ticket').textContent.includes('Mâine, 03:00')&&document.querySelector('.ticket-balance').textContent.includes('250.00 RON')`,
  );
  await click("Prelungește · +1h");
  await assert(
    "Extension updates next day04 and total300",
    `document.querySelector('.ticket-time').textContent.includes('Mâine, 04:00')&&document.querySelector('.ticket-balance').textContent.includes('300.00 RON')`,
  );
  await click("Asistență");
  await shot("nexus-extension");
  await click("Explorează");
  await ev(`document.querySelectorAll('.venue-row')[1].click()`);
  await pause(50);
  await click("Alege un loc în demo →");
  await click("18:00");
  await click("2h");
  await assert(
    "Cluj selects own inventory only",
    `document.querySelector('.reserve-page').textContent.includes('CyberSphere')&&document.querySelector('.selected-detail').textContent.includes('CJ-01')&&document.querySelector('.selected-detail').textContent.includes('30 RON')&&!document.querySelector('.mobile-floor').textContent.includes('VIP')&&!document.querySelector('.selected-detail').textContent.includes('4090')`,
  );
  await shot("cluj-reserve");
  await click("Vezi totalul →");
  await pause(120);
  await assert(
    "Cluj checkout venue station60 and rate30",
    `document.querySelector('.checkout-summary').textContent.includes('CyberSphere')&&document.querySelector('.checkout-summary').textContent.includes('CJ-01')&&document.querySelector('.checkout-money').textContent.includes('60.00 RON')&&document.querySelector('.checkout-money').textContent.includes('30.00 RON')`,
  );
  await ev(`document.querySelector('input[type=checkbox]').click()`);
  await pause(30);
  await click("Simulează rezervarea · 18.00 RON");
  await pause(850);
  await click("Prelungește · +1h");
  await assert(
    "Cluj pass extension uses30 and21:00",
    `document.querySelector('.admission-ticket').textContent.includes('CyberSphere')&&document.querySelector('.admission-ticket').textContent.includes('CJ-01')&&document.querySelector('.ticket-time').textContent.includes('21:00')&&document.querySelector('.ticket-balance').textContent.includes('90.00 RON')`,
  );
  await shot("cluj-pass");
  await click("Bar");
  await ev(
    `document.querySelectorAll('.menu-quantity')[0].querySelector('button').click()`,
  );
  await pause(30);
  await ev(
    `document.querySelectorAll('.menu-quantity')[0].querySelector('.btn-primary').click();document.querySelectorAll('.menu-quantity')[2].querySelector('button').click()`,
  );
  await pause(40);
  await assert(
    "Cart two RedBull+cola=37",
    `document.querySelector('.booking-sticky').textContent.includes('37.00')`,
  );
  await ev(
    `document.querySelectorAll('.menu-quantity')[0].querySelector('.btn-secondary').click()`,
  );
  await pause(40);
  await assert(
    "Cart remove RedBull=23",
    `document.querySelector('.booking-sticky').textContent.includes('23.00')`,
  );
  await click("Explorează");
  await click("Bar");
  await assert(
    "Cart retained across tabs=23",
    `document.querySelector('.booking-sticky').textContent.includes('23.00')`,
  );
  await click("Simulează comanda");
  await click("Anulează");
  await assert(
    "Cancel dialog retains cart23",
    `document.querySelector('.booking-sticky').textContent.includes('23.00')`,
  );
  await click("Simulează comanda");
  await click("Confirmă comanda demo");
  await assert(
    "Confirmed order clears cart once",
    `!document.querySelector('.booking-sticky')&&window.previewEvents.filter(e=>e.type==='ORDER_CREATED').length===1`,
  );
  await shot("order-confirmed");
  await click("Înapoi la meniu");
  const events = await ev(
    "window.previewEvents.map(e=>({type:e.type,venueId:e.venueId,previewOnly:e.previewOnly}))",
  );
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    mobile: false,
    deviceScaleFactor: 1,
  });
  await navigate("http://127.0.0.1:5173");
  await observe();
  await ev(
    `window.previewObserver.postMessage({previewOnly:true,type:'STAFF_CALL',venueId:'v-cyber-cluj-02',stationId:'PC-01 (RTX 4090)',data:{}})`,
  );
  await pause(100);
  await assert(
    "Cluj event cannot change Nexus attention",
    `!document.querySelector('.attention-queue').textContent.includes('Asistență solicitată')`,
  );
  await ev(
    `window.previewObserver.postMessage({previewOnly:true,type:'STAFF_CALL',venueId:'v-arena-bucharest-01',stationId:'PC-01 (RTX 4090)',data:{}})`,
  );
  await pause(100);
  await assert(
    "Same-origin local channel updates matching venue",
    `document.querySelector('.attention-queue').textContent.includes('Asistență solicitată')`,
  );
  await click("Comenzi");
  await pause(250);
  await shot("dashboard-orders");
  const buttons = await ev(
    `[...document.querySelectorAll('main button')].map(b=>b.textContent.trim())`,
  );
  const advance = buttons.find(
    (t) => t.includes("Accept") || t.includes("Start Preparing") || t === "Prep →",
  );
  if (advance) {
    await click(advance);
    await assert('Dashboard status event stays local', `window.previewEvents.some(e=>e.type==='ORDER_STATUS_CHANGED'&&e.previewOnly===true)`);
    checks.push({
      name: "Dashboard simulated transition exercised",
      result: "PASS",
      button: advance,
    });
  } else
    checks.push({
      name: "Dashboard simulated transition action",
      result: "NOT RUN",
      buttons,
    });
  await click("Încasări");
  await pause(200);
  await assert(
    "Financial copy has no fiscal certification",
    `!document.querySelector('main').textContent.includes('ANAF')&&!document.querySelector('main').textContent.includes('Live fiscal')`,
  );
  await shot("dashboard-money");
  await click("Ghiduri operaționale");
  await assert(
    "Runbook does not claim launch decision/refund dispatch",
    `!document.querySelector('main').textContent.includes('GO FOR LAUNCH')&&!document.querySelector('main').textContent.includes('100% venue staff certified')`,
  );
  const posts = requests.filter((r) => r.method === "POST");
  checks.push({
    name: "Booking/extension/support/order/dashboard simulation network POST count",
    result: posts.length === 0 ? "PASS" : "FAIL",
    count: posts.length,
    posts,
  });
  await fs.writeFile(
    new URL("correction1-web-results.json", root),
    JSON.stringify({ checks, events, requests }, null, 2),
  );
  console.log(JSON.stringify(checks));
  if (posts.length) throw Error("Unexpected POST");
} catch (error) {
  await fs.writeFile(
    new URL("correction1-web-failure.json", root),
    JSON.stringify({ error: String(error), checks, requests }, null, 2),
  );
  await shot("failure");
  console.error(error);
  process.exitCode = 1;
} finally {
  await call("Browser.close");
}
