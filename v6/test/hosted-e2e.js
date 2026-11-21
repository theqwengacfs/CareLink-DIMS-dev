/* End-to-end hosted commissioning proof: one KV document, a PC and a fresh tablet. */
const assert = require('node:assert/strict');
const { makeCtx } = require('./dom');

const kv = new Map();
const kvResponse = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  assert.equal(url.origin, 'https://kv.test');
  assert.equal(init.headers?.Authorization, 'Bearer e2e-token');
  if (url.pathname === '/get/carelink_cloud_v66') {
    return kvResponse({ result: kv.has('carelink_cloud_v66') ? kv.get('carelink_cloud_v66') : null });
  }
  if (url.pathname === '/set/carelink_cloud_v66') {
    const serialized = JSON.parse(init.body);
    assert.equal(typeof serialized, 'string');
    kv.set('carelink_cloud_v66', serialized);
    return kvResponse({ result: 'OK' });
  }
  if (url.pathname === '/' && init.method === 'POST') {
    const [op, ...args] = JSON.parse(String(init.body || '[]'));
    if (op === 'SET') {
      const [key, value, ...options] = args;
      if (options.includes('NX') && kv.has(key)) return kvResponse({ result: null });
      kv.set(key, String(value));
      return kvResponse({ result: 'OK' });
    }
    if (op === 'GET') return kvResponse({ result: kv.has(args[0]) ? kv.get(args[0]) : null });
    if (op === 'EVAL') {
      const script = args[0]; const keyCount = Number(args[1]) || 0;
      const key = args[2]; const value = args[2 + keyCount];
      if (kv.get(key) !== String(value)) return kvResponse({ result: 0 });
      if (/EXPIRE/.test(script)) return kvResponse({ result: 1 });
      if (/DEL/.test(script)) { kv.delete(key); return kvResponse({ result: 1 }); }
    }
    throw new Error(`Unexpected Redis command: ${op}`);
  }
  throw new Error(`Unexpected KV request: ${url.pathname}`);
};
process.env.KV_REST_API_URL = 'https://kv.test';
process.env.KV_REST_API_TOKEN = 'e2e-token';
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

(async () => {
  const { default: handler } = await import('../../api/index.js');

  async function apiFetch(url, opts = {}) {
    const headers = { host: 'carelink.test' };
    for (const [key, value] of Object.entries(opts.headers || {})) headers[key.toLowerCase()] = value;
    const req = { url: `/${url}`, method: opts.method || 'GET', headers, body: opts.body || {}, on() {} };
    let status = 0; let raw = '';
    const res = {
      set statusCode(value) { status = value; }, get statusCode() { return status; },
      setHeader() {}, end(value) { raw = value || ''; },
    };
    await handler(req, res);
    return { ok: status >= 200 && status < 300, status, json: async () => raw ? JSON.parse(raw) : {} };
  }

  function client() {
    return makeCtx({
      location: { hash: '', protocol: 'https:', origin: 'https://carelink.test', host: 'carelink.test' },
      navigator: { userAgent: 'hosted-e2e' },
      performance: { now: () => Date.now() },
      sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
      fetch: apiFetch,
    });
  }

  const chiefPassword = 'Kx9!vQ2#mTz7Lp';
  const pc = client();
  /* The test DOM executes timers immediately.  Disable only the background
     patch debounce so this test measures the explicit workflow requests. */
  pc.run('SYNC.queue = () => {};');
  const setup = await pc.run(`PROD_SETUP.completeFourStepHostSetup({
    orgNameVal:'Hosted E2E Organisation', shortNameVal:'E2E', seedMode:'empty',
    chiefUsername:'chief.admin', chiefPassword:${JSON.stringify(chiefPassword)}, loginUrl:'https://carelink.test'
  })`);
  assert.equal(setup.cloudVerified, true);

  const chiefLogin = await pc.run(`AUTH.loginOnline('chief.admin', ${JSON.stringify(chiefPassword)}, 'pc')`);
  assert.equal(chiefLogin.ok, true, JSON.stringify(chiefLogin));
  assert.equal(chiefLogin.mustChange, true);
  pc.run(`__form = { current:${JSON.stringify(chiefPassword)}, password:'Private#2027!xQ', password2:'Private#2027!xQ' }; AUTH.mustChange = true;`);
  await pc.run('FORMS.mustchange6(new FormData())');
  assert.equal(pc.run('AUTH.mustChange'), false, 'the hosted first-login form must complete through the server');
  assert.equal(pc.run('AUTH.user.mustChange'), false);

  const pack = await pc.run('PROD_SETUP.activateSystemGlobally({})');
  assert.ok(pack && pack.count > 0, 'global activation must issue a server-backed staff pack');
  const staff = pack.rows[0];

  const tablet = client();
  tablet.run('SYNC.queue = () => {}; DB.load();');
  assert.equal(tablet.run('DB.db.patients.length'), 0, 'fresh hosted tablet must not self-seed');
  const health = await tablet.run('hostProbe()');
  tablet.run(`APPX.host = ${JSON.stringify(health)}; SYNC.server = APPX.host;`);
  assert.equal(health.globallyActivated, true);
  const tabletLogin = await tablet.run(`AUTH.loginOnline(${JSON.stringify(staff.username)}, ${JSON.stringify(staff.tempPassword)}, 'tablet')`);
  assert.equal(tabletLogin.ok, true, JSON.stringify(tabletLogin));
  assert.equal(tabletLogin.mustChange, true);
  assert.equal(tablet.run('DB.db.settings.globallyActivated'), true);
  assert.equal(tablet.run(`DB.db.users.some(u => u.username === ${JSON.stringify(staff.username)})`), true);

  const loginHtml = tablet.run(`(()=>{
    AUTH.logout(); APPX.screen = 'login'; LOGIN6.tab = 'demo'; return renderLogin6();
  })()`);
  assert.equal(tablet.run("LOGIN6.tab"), 'signin');
  assert.ok(!/data-tab="demo"|data-act="load-demo"|First-run online setup|Live host setup/i.test(loginHtml));

  console.log(`hosted-e2e: PC setup + chief activation + fresh tablet staff login passed (${pack.count} issued accounts)`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
