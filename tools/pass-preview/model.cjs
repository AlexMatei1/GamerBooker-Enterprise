const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const QRCode = require('./vendor/QRCode');
const token = () => randomBytes(24).toString('base64url');
const venues = [
  { id: 'v-arena-bucharest-01', name: 'Nexus Gaming Arena Bucharest', stations: ['VIP-01','VIP-02','POD-A1','POD-A2','POD-A3','PS5-LOUNGE-A'] },
  { id: 'v-cyber-cluj-02', name: 'CyberSphere Esports Cluj', stations: ['CJ-01','CJ-02','CJ-03'] },
];
function fail(message, status = 409) { throw Object.assign(new Error(message), { status }); }
class Store {
  constructor(file, now = Date.now) {
    this.file = file; this.now = now;
    this.state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { sessions: [], passes: [], quotes: [], policies: Object.fromEntries(venues.map(v => [v.id, { cancelHours: 3, revision: 1 }])) };
  }
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = this.file + '.tmp';
    const fd = fs.openSync(temp, 'w', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(this.state)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temp, this.file);
  }
  session() { const id = token(); this.state.sessions.push(id); this.save(); return id; }
  owner(id) { if (!this.state.sessions.includes(id)) fail('SESSION_REQUIRED', 401); return id; }
  venue(id) { const v = venues.find(v => v.id === id); if (!v) fail('INVALID_VENUE', 400); return v; }
  policy(id, hours) {
    this.venue(id);
    if (!Number.isInteger(hours) || hours < 0 || hours > 168) fail('INVALID_CANCEL_HOURS', 400);
    this.state.policies[id] = { cancelHours: hours, revision: this.state.policies[id].revision + 1 };
    this.save(); return this.state.policies[id];
  }
  quote(owner, input) {
    this.owner(owner); const v = this.venue(input.venueId);
    if (!v.stations.includes(input.stationName) || ![1,2,3,5].includes(input.durationHours)) fail('INVALID_SELECTION', 400);
    let startAt;
    if (input.start === 'DEMO+15s') startAt = this.now() + 15000;
    else {
      if (!/^\d{2}:\d{2}$/.test(input.start || '')) fail('INVALID_TIME', 400);
      const [h,m] = input.start.split(':').map(Number); if (h > 23 || m > 59) fail('INVALID_TIME',400);
      const date = new Date(this.now()); date.setHours(h,m,0,0); startAt = date.getTime();
    }
    if (startAt <= this.now()) fail('PAST_SLOT_SELECT_FUTURE_TIME');
    const policy = { ...this.state.policies[v.id] };
    const rate = v.id === 'v-cyber-cluj-02' ? 3000 : input.stationName.startsWith('VIP-') ? 5000 : input.stationName.startsWith('PS5-') ? 4000 : 3500;
    const subtotal = rate * input.durationHours, baseDeposit = Math.round(subtotal * 0.3);
    const promo = String(input.promo || '').trim().toUpperCase();
    if (promo && promo !== 'ENTERPRISE10') fail('INVALID_PROMO',400);
    const discount = promo ? Math.round(baseDeposit * 0.1) : 0;
    const amounts = { rate, subtotal, baseDeposit, discount, deposit:baseDeposit-discount, remaining:subtotal-baseDeposit, total:subtotal-discount, promo };
    const q = { id: token(), owner, venueId: v.id, venueName: v.name, stationName: input.stationName,
      durationHours: input.durationHours, startAt, endAt: startAt + input.durationHours * 3600000,
      cancellationDeadline: startAt - policy.cancelHours * 3600000, policy, amounts,
      expiresAt: Math.min(startAt, this.now() + 300000), demoNearNow: input.start === 'DEMO+15s' };
    this.state.quotes = this.state.quotes.filter(q => q.expiresAt > this.now());
    this.state.quotes.push(q); this.save(); return q;
  }
  book(owner, quoteId, requestId) {
    this.owner(owner);
    if (!/^[a-zA-Z0-9_-]{12,100}$/.test(requestId || '')) fail('INVALID_REQUEST_ID',400);
    const prior = this.state.passes.find(p => p.owner === owner && p.requestId === requestId);
    if (prior) return this.view(prior);
    const q = this.state.quotes.find(q => q.id === quoteId && q.owner === owner);
    if (!q) fail('QUOTE_NOT_FOUND',404);
    if (this.now() >= q.expiresAt || this.now() >= q.startAt) fail('QUOTE_EXPIRED');
    if (this.state.passes.some(p => p.venueId === q.venueId && p.stationName === q.stationName && p.status !== 'CANCELLED' && p.startAt < q.endAt && q.startAt < p.endAt)) fail('STATION_INTERVAL_UNAVAILABLE');
    const p = { ...q, id: 'LOCAL-' + token(), requestId, code: 'GBLOCAL-' + token(), status: 'CONFIRMED', createdAt: this.now(), checkedInAt: null };
    this.state.passes.unshift(p); this.state.quotes = this.state.quotes.filter(x => x.id !== q.id); this.save(); return this.view(p);
  }
  view(p) {
    const { owner, requestId, ...safe } = p;
    const qr = new QRCode(-1, 1); qr.addData(p.code); qr.make();
    return { ...safe, qr: qr.modules, status: p.status === 'ACTIVE' && this.now() >= p.activeEndAt ? 'COMPLETED' : p.status,
      canCancel: p.status === 'CONFIRMED' && this.now() <= p.cancellationDeadline,
      serverNow: this.now() };
  }
  list(owner) { this.owner(owner); return this.state.passes.filter(p => p.owner === owner).map(p => this.view(p)); }
  barEligibility(owner, id) {
    this.owner(owner); const p = this.state.passes.find(p => p.id === id && p.owner === owner);
    if (!p) fail('PASS_NOT_FOUND',404);
    if (p.status !== 'ACTIVE' || this.now() < p.startAt || this.now() >= p.endAt) fail('BAR_REQUIRES_ACTIVE_PASS');
    return this.view(p);
  }
  cancel(owner, id) {
    this.owner(owner); const p = this.state.passes.find(p => p.id === id && p.owner === owner);
    if (!p) fail('PASS_NOT_FOUND',404);
    if (p.status !== 'CONFIRMED') fail('CANCELLATION_REQUIRES_CONFIRMED');
    if (this.now() > p.cancellationDeadline) fail('CANCELLATION_WINDOW_CLOSED');
    p.status = 'CANCELLED'; p.cancelledAt = this.now(); this.save(); return this.view(p);
  }
  scan(venueId, code) {
    this.venue(venueId);
    if (!/^GBLOCAL-[A-Za-z0-9_-]{32}$/.test(code || '')) fail('INVALID_CODE',400);
    const p = this.state.passes.find(p => p.code === code);
    if (!p) fail('UNKNOWN_CODE',404);
    if (p.venueId !== venueId) fail('WRONG_VENUE');
    if (p.status !== 'CONFIRMED') fail(p.status === 'ACTIVE' ? 'ALREADY_CHECKED_IN' : 'PASS_' + p.status);
    if (this.now() < p.startAt) fail('TOO_EARLY');
    if (this.now() >= p.endAt) fail('CHECK_IN_WINDOW_EXPIRED');
    // Late check-in never extends the disclosed contractual end.
    const activeEndAt = this.sessionEnd(p);
    p.status = 'ACTIVE'; p.checkedInAt = this.now(); p.activeEndAt = activeEndAt;
    this.save(); return this.view(p);
  }
  sessionEnd(p) { return p.endAt; }
}
module.exports = { Store, venues };
