import fs from "node:fs/promises";
const base = new URL(".", import.meta.url);
const tabs = await fetch("http://127.0.0.1:9225/json/list").then((r) =>
  r.json(),
);
const ws = new WebSocket(
  tabs.find((t) => t.type === "page").webSocketDebuggerUrl,
);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
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
async function evaluate(expression) {
  const r = await call("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) throw Error(r.exceptionDetails.text);
  return r.result.value;
}
async function click(text) {
  const found = await evaluate(
    `(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)return false;b.click();return true})()`,
  );
  if (!found) throw Error("Button missing: " + text);
  await new Promise((r) => setTimeout(r, 150));
}
async function screenshot(file) {
  const { data } = await call("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  await fs.writeFile(new URL(file, base), Buffer.from(data, "base64"));
}
async function metrics(width, height) {
  await call("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 600,
  });
}
async function navigate(url) {
  await call("Page.navigate", { url });
  await new Promise((r) => setTimeout(r, 1800));
}
await call("Page.enable");
const checks = [];
await metrics(1440, 900);
await navigate("http://127.0.0.1:5173");
await screenshot("dashboard-1440.png");
checks.push({
  test: "Dashboard layout",
  width: await evaluate("document.documentElement.scrollWidth"),
  viewport: 1440,
});
await click("Scanează rezervarea");
await evaluate(
  `(()=>{const input=document.querySelector('input[aria-label="Cod rezervare"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'UNKNOWN');input.dispatchEvent(new Event('input',{bubbles:true}))})()`,
);
await click("Verifică în datele demo");
checks.push({
  test: "Unknown scan rejected",
  pass: await evaluate(
    "document.body.textContent.includes('Cod negăsit în coada demo')",
  ),
});
await screenshot("dashboard-scan.png");
await navigate("http://127.0.0.1:5174");
for (const width of [360, 390, 412]) {
  await metrics(width, 844);
  await screenshot(`mobile-explore-${width}.png`);
  checks.push({
    test: "Mobile Explore " + width,
    width: await evaluate("document.documentElement.scrollWidth"),
    viewport: width,
  });
}
await metrics(390, 844);
await click("Rezervă");
await screenshot("mobile-reserve-390.png");
await evaluate("window.scrollTo(0,480)");
await screenshot("mobile-reserve-floor-390.png");
await evaluate("window.scrollTo(0,0)");
checks.push({
  test: "Reserve one sticky CTA",
  count: await evaluate("document.querySelectorAll('.booking-sticky').length"),
});
await click("Vezi totalul →");
await new Promise((r) => setTimeout(r, 700));
await screenshot("mobile-checkout-390.png");
await evaluate(
  `(()=>{const input=document.querySelector('input[aria-label="Cod promo"]');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,'ENTERPRISE10');input.dispatchEvent(new Event('input',{bubbles:true}))})()`,
);
await click("Aplică");
checks.push({
  test: "Promo",
  text: await evaluate("document.querySelector('.promo-message').textContent"),
});
await evaluate(`document.querySelector('input[type=checkbox]').click()`);
await screenshot("mobile-checkout-promo-390.png");
await evaluate(`document.querySelector('.checkout-submit').click()`);
await new Promise((r) => setTimeout(r, 1000));
await screenshot("mobile-pass-390.png");
await evaluate("window.scrollTo(0,500)");
await screenshot("mobile-pass-balance-390.png");
await evaluate("window.scrollTo(0,0)");
const before = await evaluate(
  "document.querySelector('.ticket-balance').textContent",
);
await click("Prelungește · +1h");
checks.push({
  test: "Pass extension",
  before,
  after: await evaluate(
    "document.querySelector('.ticket-balance').textContent",
  ),
});
await click("Bar");
await evaluate(`document.querySelector('.menu-quantity button').click()`);
await screenshot("mobile-bar-390.png");
checks.push({
  test: "Bar quantity/cart",
  text: await evaluate("document.querySelector('.booking-sticky').textContent"),
});
await click("Simulează comanda");
await screenshot("mobile-order-dialog-390.png");
await evaluate(`document.querySelector('.dialog-close').click()`);
await click("Cont");
await screenshot("mobile-account-390.png");
await fs.writeFile(
  new URL("web-observations.json", base),
  JSON.stringify(checks, null, 2),
);
console.log(JSON.stringify(checks));
await call("Browser.close");
