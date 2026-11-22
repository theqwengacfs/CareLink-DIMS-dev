const requireCrypto = require('node:crypto');
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
      if (script.includes('redis.sha1hex')) {
        const actual = kv.has(key) ? requireCrypto.createHash('sha1').update(String(kv.get(key))).digest('hex') : 'missing';
        if (actual !== value) return kvResponse({ result: kv.get(key) === String(args[3 + keyCount]) ? 2 : 0 });
        kv.set(key, String(args[3 + keyCount]));
        return kvResponse({ result: 1 });
      }
      if (script === "return redis.call('GET', KEYS[1])") return kvResponse({ result: kv.has(key) ? kv.get(key) : null });
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
  const freshHealth = await pc.run('hostProbe()');
  assert.ok(freshHealth && !freshHealth.commissioned);
  pc.run(`APPX.host = ${JSON.stringify(freshHealth)};`);
  const stepFour = pc.run(`(()=>{ APPX.screen='onboard'; ONB.step=4; return renderOnboarding6(); })()`);
  assert.match(stepFour, /Staff credential downloads follow global activation/);
  assert.doesNotMatch(stepFour, /data-act="dev-dl-sms-(csv|txt)"/, 'unauthenticated setup must not expose staff credentials');

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
  pc.run(`__downloads = []; download = (name, body, type) => __downloads.push({ name, body, type });
    PROD_SETUP.downloadCSV(); PROD_SETUP.downloadSMSText();`);
  const downloads = pc.run('__downloads');
  assert.equal(downloads.length, 2, 'authenticated chief can export both SMS pack formats');
  assert.match(downloads[0].name, /\.csv$/);
  assert.match(downloads[1].name, /\.txt$/);
  assert.ok(downloads.every(file => file.body.includes(pack.rows[0].tempPassword)), 'exports contain the issued temporary credential');


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

  /* The Chief's actual post-activation UI issues the server-owned roster and
     a fresh device is blocked until its holder changes their password. */
  pc.run(`APPX.dirty=false; __originalQuery = document.querySelector.bind(document);
    document.querySelector = sel => sel==='#reactivationPassword' ? {value:'Private#2027!xQ'} : sel==='#reactivationConfirm' ? {value:'REBUILD'} : __originalQuery(sel);`);
  await pc.run('PROD_SETUP.runReactivation(false)');
  const rebuilt = pc.run('PROD_SETUP.lastPack');
  assert.ok(rebuilt && rebuilt.rows.length > 0 && rebuilt.rows.some(r=>r.username==='director'));
  assert.equal(pc.run('DB.db.users.find(u=>u.username==="president").active'),false);
  pc.run(`__downloads = []; PROD_SETUP.downloadCredentialDocument();`);
  assert.ok(pc.run('__downloads[0].body.includes(esc(PROD_SETUP.lastPack.rows[0].tempPassword))'));
  const director = rebuilt.rows.find(r=>r.username==='director');
  const newTablet = client();
  newTablet.run('SYNC.queue = () => {}; DB.load();');
  const currentHealth = await newTablet.run('hostProbe()');
  newTablet.run(`APPX.host = ${JSON.stringify(currentHealth)}; SYNC.server = APPX.host;`);
  const newLogin = await newTablet.run(`AUTH.loginOnline(${JSON.stringify(director.email)}, ${JSON.stringify(director.tempPassword)}, 'tablet')`);
  assert.equal(newLogin.ok,true,JSON.stringify(newLogin));
  assert.equal(newLogin.mustChange,true);
  assert.equal(newTablet.run('SYNC._passwordBeforeWorkspace'),true);
  assert.equal(newTablet.run('DB.db.users.length'),1,'only the account record is present before password replacement');
  newTablet.run(`__form = {current:${JSON.stringify(director.tempPassword)}, password:'River#Lake2027!Qw', password2:'River#Lake2027!Qw'};`);
  await newTablet.run('FORMS.mustchange6(new FormData())');
  assert.equal(newTablet.run('AUTH.mustChange'),false);
  assert.equal(newTablet.run('SYNC._passwordBeforeWorkspace'),false);
  assert.ok(newTablet.run('DB.db.users.length')>1,'the real scoped workspace loads after the password change');
  assert.equal(newTablet.run('AUTH.user.username'),'director');
  console.log(`hosted-e2e: PC setup + chief activation + rebuild and fresh tablet staff password change passed (${rebuilt.count} issued accounts)`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
