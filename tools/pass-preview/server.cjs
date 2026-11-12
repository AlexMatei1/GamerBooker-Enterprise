const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomBytes } = require('node:crypto');
const { Store, venues } = require('./model.cjs');
const root = path.resolve(__dirname, '../..');
function start(options = {}) {
  const store = new Store(options.file || path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'GamerBooker-pass-preview', 'state.json'), options.now);
  const staffCapability = randomBytes(32).toString('base64url');
  const servers = [];
  for (const role of ['customer','staff']) {
    const port = role === 'customer' ? (options.customerPort || 8787) : (options.staffPort || 8788);
    const origin = `http://127.0.0.1:${port}`;
    const server = http.createServer(async (req,res) => {
      const send = (status, data) => { res.writeHead(status, {'Content-Type':'application/json','X-Preview-Now':String(store.now())}); res.end(JSON.stringify(data)); };
      res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff');
      res.setHeader('Cross-Origin-Resource-Policy','same-origin'); res.setHeader('X-Frame-Options','DENY');
      try {
        if (req.headers.host !== `127.0.0.1:${port}`) return send(403,{error:'HOST_DENIED_USE_127_0_0_1'});
        if (req.headers.origin && req.headers.origin !== origin) return send(403,{error:'ORIGIN_DENIED'});
        if (req.headers['sec-fetch-site'] && !['same-origin','none'].includes(req.headers['sec-fetch-site'])) return send(403,{error:'CROSS_SITE_DENIED'});
        const url = new URL(req.url, origin), route = url.pathname;
        if (route.startsWith('/v1')) return send(404,{error:'PRODUCTION_API_DISABLED'});
        if (route.startsWith('/preview/')) {
          if (req.headers['x-preview-client'] !== role) return send(403,{error:'CLIENT_ROLE_REQUIRED'});
          if (role === 'staff' && req.headers.authorization !== `Bearer ${staffCapability}`) return send(403,{error:'STAFF_CAPABILITY_REQUIRED'});
          if (!route.startsWith(`/preview/${role}/`)) return send(403,{error:'ROLE_ENDPOINT_DENIED'});
          let body = {}; if (req.method === 'POST') {
            if (!String(req.headers['content-type']).startsWith('application/json')) return send(415,{error:'JSON_REQUIRED'});
            let text = ''; for await (const part of req) { text += part; if (text.length > 8192) throw Object.assign(new Error('BODY_TOO_LARGE'), {status:413}); }
            body = JSON.parse(text || '{}');
          }
          const owner = String(req.headers.authorization || '').replace(/^Bearer /,'');
          if (req.method === 'POST' && route === '/preview/customer/session') return send(201,{session:store.session()});
          if (req.method === 'GET' && route === '/preview/customer/passes') return send(200,store.list(owner));
          if (req.method === 'GET' && route === '/preview/customer/venues') return send(200,venues.map(v => ({...v,policy:store.state.policies[v.id]})));
          if (req.method === 'POST' && route === '/preview/customer/quote') return send(200,store.quote(owner,body));
          if (req.method === 'POST' && route === '/preview/customer/book') return send(201,store.book(owner,body.quoteId,body.requestId));
          if (req.method === 'POST' && route === '/preview/customer/cancel') return send(200,store.cancel(owner,body.id));
          if (req.method === 'POST' && route === '/preview/customer/bar-eligibility') return send(200,store.barEligibility(owner,body.id));
          if (req.method === 'GET' && route === '/preview/staff/venues') return send(200,venues.map(v => ({...v,policy:store.state.policies[v.id]})));
          if (req.method === 'POST' && route === '/preview/staff/policy') return send(200,store.policy(body.venueId,body.cancelHours));
          if (req.method === 'POST' && route === '/preview/staff/scan') return send(200,store.scan(body.venueId,body.code));
          return send(404,{error:'UNKNOWN_PREVIEW_ENDPOINT'});
        }
        if (req.method !== 'GET') return send(405,{error:'METHOD_NOT_ALLOWED'});
        const base = path.join(root, role === 'customer' ? 'apps/mobile-app/dist' : 'apps/venue-dashboard/dist');
        let file = path.resolve(base, '.' + decodeURIComponent(route));
        if (!file.startsWith(base + path.sep) && file !== base) return send(403,{error:'PATH_DENIED'});
        if (!path.extname(file) || route === '/') file = path.join(base,'index.html');
        if (!fs.existsSync(file)) return send(404,{error:'BUILD_CLIENT_FIRST'});
        let data = fs.readFileSync(file);
        const ext = path.extname(file);
        if (ext === '.html' && role === 'staff') data = Buffer.from(data.toString().replace('<head>',`<head><meta name="preview-staff-capability" content="${staffCapability}">`));
        res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png'})[ext] || 'application/octet-stream'}); res.end(data);
      } catch (e) { send(e.status || (e instanceof SyntaxError ? 400 : 500),{error:e.status || e instanceof SyntaxError ? e.message : 'LOCAL_SERVICE_FAILURE'}); }
    });
    server.listen(port,'127.0.0.1'); servers.push(server);
  }
  return {servers,store,staffCapability,close:() => Promise.all(servers.map(s => new Promise(resolve => s.close(resolve))))};
}
if (require.main === module) { start(); console.log('Local preview: customer http://127.0.0.1:8787 | staff http://127.0.0.1:8788 | Ctrl+C stops both. No production API.'); }
module.exports = {start};
