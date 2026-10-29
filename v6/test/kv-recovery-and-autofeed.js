/* End-to-end verification of:
   1. Real Upstash REST verbatim-body KV behavior (double-JSON-string prevention & healing)
   2. Pre-activation First-Run Reset (`POST /api/setup/reset-first-run`) + permanent post-activation 409 lock
   3. Zero-local-drive Cloud Auto-Feed of the 100%-complete 3,333-patient dataset (`POST /api/master-import/auto-seed`)
   4. Automatic Upstash Free-Tier (<1 MB per command) sharded KV fallback & paged Tablet reconstruction
   5. Intact manual CSV Master Import (`IMPORTER`) after Cloud Auto-Feed */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { makeCtx } = require('./dom');

process.env.KV_REST_API_URL = 'https://kv-upstash-real.test';
process.env.KV_REST_API_TOKEN = 'real-upstash-token';
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const kv = new Map();
const kvPrev = new Map();
const staleReadsRemaining = new Map();
let enforceOneMegabyteFreeTierCap = false;
let simulateReadReplicaLag = false;
let maxShardWriteBytes = 0;
let shardWritesWithTtl = 0;
let kvSetCounter = 0;

function kvResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}
function keyFromPath(url, prefix) {
  return decodeURIComponent(url.pathname.slice(prefix.length));
}

/* IMPORTANT: Unlike earlier unit mocks that parsed init.body, real Upstash REST
   `POST /set/<key>` stores `init.body` verbatim as the Redis string value! */
global.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  assert.equal(url.origin, 'https://kv-upstash-real.test');
  assert.equal(init.headers?.Authorization, 'Bearer real-upstash-token');
  const rawBody = String(init.body || '');
  const bodyBytes = Buffer.byteLength(rawBody);

  if (url.pathname.startsWith('/get/')) {
    const key = keyFromPath(url, '/get/');
    const lag = staleReadsRemaining.get(key) || 0;
    if (simulateReadReplicaLag && lag > 0) {
      staleReadsRemaining.set(key, lag - 1);
      return kvResponse({ result: kvPrev.has(key) ? kvPrev.get(key) : null });
    }
    return kvResponse({ result: kv.has(key) ? kv.get(key) : null });
  }
  if (url.pathname.startsWith('/set/')) {
    const key = keyFromPath(url, '/set/');
    if (enforceOneMegabyteFreeTierCap && bodyBytes > 1024 * 1024) {
      return kvResponse({ error: 'ERR max request size exceeded' }, 400);
    }
    if (enforceOneMegabyteFreeTierCap) {
      maxShardWriteBytes = Math.max(maxShardWriteBytes, bodyBytes);
      if (/_w[^/]+_s\d+$/.test(key) && url.searchParams.has('EX')) shardWritesWithTtl++;
    }
    kvSetCounter++;
    if (kv.has(key)) kvPrev.set(key, kv.get(key));
    else kvPrev.delete(key);
    /* Store rawBody VERBATIM just like real Upstash Redis REST! */
    kv.set(key, rawBody);
    if (simulateReadReplicaLag && key === 'carelink_cloud_v66') {
      staleReadsRemaining.set(key, 1);
    }
    return kvResponse({ result: 'OK' });
  }
  if (url.pathname.startsWith('/del/')) {
    const key = keyFromPath(url, '/del/');
    kv.delete(key);
    return kvResponse({ result: 1 });
  }
  if (url.pathname === '/' && init.method === 'POST') {
    const command = JSON.parse(rawBody);
    const [op, ...args] = command;
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

(async () => {
  const { default: handler, __resetCloudCachesForTests } = await import('../../api/index.js');

  async function apiFetch(url, opts = {}) {
    const headers = { host: 'carelink.test' };
    for (const [k, v] of Object.entries(opts.headers || {})) headers[k.toLowerCase()] = v;
    const req = { url: `/${url}`, method: opts.method || 'GET', headers, body: opts.body || {}, on() {} };
    let status = 0;
    let rawResponse = '';
    const res = {
      set statusCode(v) { status = v; },
      get statusCode() { return status; },
      setHeader() {},
      end(v) { rawResponse = v || ''; },
    };
    await handler(req, res);
    const bytes = Buffer.byteLength(rawResponse);
    assert.ok(bytes <= 4.5 * 1024 * 1024, `Vercel response exceeded 4.5 MB for ${url}: ${bytes}`);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => (rawResponse ? JSON.parse(rawResponse) : {}),
    };
  }

  function client() {
    const ss = new Map();
    return makeCtx({
      location: { hash: '', protocol: 'https:', origin: 'https://carelink.test', host: 'carelink.test' },
      navigator: { userAgent: 'kv-recovery-and-autofeed-test' },
      performance: { now: () => Date.now() },
      sessionStorage: {
        getItem: (k) => (ss.has(k) ? ss.get(k) : null),
        setItem: (k, v) => ss.set(k, String(v)),
        removeItem: (k) => ss.delete(k),
      },
      fetch: apiFetch,
    });
  }

  /* 1. Simulate a previously broken / corrupted KV document on live Vercel KV */
  kv.set('carelink_cloud_v66', '"not-an-object-legacy-broken-kv-value"');
  const brokenHealth = await apiFetch('api/health');
  assert.equal(brokenHealth.status, 503);
  const brokenBody = await brokenHealth.json();
  assert.equal(brokenBody.code, 'kv_invalid_state');

  /* 2. Repair & reset via UI action `reset-first-run-fresh` -> `POST /api/setup/reset-first-run` */
  const pc = client();
  pc.run('SYNC.queue = () => {}; LOGIN6.error = "CareLink KV contains an invalid online database document; it was not replaced.";');
  const brokenLoginHtml = pc.run('renderLogin6()');
  assert.ok(/data-act="reset-first-run-fresh"/.test(brokenLoginHtml), 'Sign-In must surface 1-click KV repair button when pre-activation KV error occurs');

  await pc.run(`ACTIONS['reset-first-run-fresh']()`);
  assert.equal(pc.run('APPX.screen'), 'onboard', 'Resetting pre-activation KV must bring user cleanly to Step 1 of First-Run Setup');
  assert.equal(pc.run('ONB.step'), 1);
  assert.equal(pc.run('APPX.host.setup'), false);

  /* 3. Enforce Upstash Free-Tier 1 MB single-key cap + Upstash Global Read-Replica Lag
        while commissioning `system.admin` + auto-feeding 3,333 patients! */
  enforceOneMegabyteFreeTierCap = true;
  const setupPw = 'Kx9!vQ2#mTz7Lp';
  const privatePw = 'Private#2027!xQ';

  const setup = await pc.run(`PROD_SETUP.completeFourStepHostSetup({
    orgNameVal:'LOMAMO Foundation Kenya', shortNameVal:'LOMAMO', seedMode:'empty',
    chiefUsername:'system.admin', chiefPassword:${JSON.stringify(setupPw)}, loginUrl:'https://carelink.test'
  })`);
  assert.equal(setup.cloudVerified, true, '4-Step commissioning must succeed against real verbatim-body Upstash KV');

  /* Enable Upstash Global Read-Replica Lag so immediate GETs after login/save see the pre-write replica! */
  simulateReadReplicaLag = true;

  const loginRes = await pc.run(`AUTH.loginOnline('system.admin', ${JSON.stringify(setupPw)}, 'pc')`);
  assert.equal(loginRes.ok, true, JSON.stringify(loginRes));
  const mustChangeHtml = pc.run('renderMustChange()');
  assert.ok(/autoFeedCloudMaster/.test(mustChangeHtml), 'Chief first-login password screen must offer pre-checked 3,333-patient Cloud Auto-Feed');

  pc.run(`__form = { current:${JSON.stringify(setupPw)}, password:${JSON.stringify(privatePw)}, password2:${JSON.stringify(privatePw)}, autoFeedCloudMaster:'1' }; AUTH.mustChange = true;`);
  await pc.run('FORMS.mustchange6(new FormData())');
  assert.equal(pc.run('AUTH.mustChange'), false);

  /* Verify all 3,333 patients, 44,995 visits & 18,060 PDCAs were auto-fed with ZERO local file upload! */
  assert.equal(pc.run('DB.db.patients.length'), 3333, 'Chief Sign-In auto-feed must load all 3,333 patients');
  assert.equal(pc.run('DB.db.visits.length'), 44995, 'Chief Sign-In auto-feed must load all 44,995 visits');
  assert.equal(pc.run('DB.db.pdcas.length'), 18060, 'Chief Sign-In auto-feed must load all 18,060 PDCAs');
  assert.equal(pc.run('WORKFLOW_ENGINE.completionMatrix(AUTH.user).global.pct'), 100);
  assert.equal(pc.run('REPORTS.dataQuality(AUTH.user).length'), 0);
  assert.ok(maxShardWriteBytes > 0 && maxShardWriteBytes <= 1024 * 1024, `Every Free-Tier KV shard write stayed <= 1 MiB (max ${maxShardWriteBytes})`);

  /* 4. Verify manual CSV Master Import (`IMPORTER`) still works cleanly alongside the 3,333-patient dataset */
  pc.run(`(()=>{
    const csv = 'Patient Name,File Number,Ministry Area,CCC Number,Phone,Sex,Age,Intake Date,Status,Referral Source,Caregiver,Weight (kg),Diagnosis,Household Children,Discharge Date\\n"Jane Atieno Test","LOM-IMP-9999","Nyalenda","CCC/99999","0712345678","F",36,"2026-04-10","Active","JOOTRH","Caregiver Nyalenda",60,"HIV - on ART",2,""';
    const parsed = IMPORTER.parseCSV(csv);
    IMPORTER.reset();
    IMPORTER.file = { name:'incremental-intake.csv' };
    IMPORTER.headers = parsed.headers;
    IMPORTER.rows = parsed.data;
    IMPORTER.mapping = IMPORTER.detectMapping(parsed.headers);
    IMPORTER.validate();
    IMPORTER.commit();
  })()`);
  assert.equal(pc.run('DB.db.patients.length'), 3334, 'Manual CSV Master Import must still create incremental patient records cleanly');

  /* 5. Activate System Globally and verify permanent First-Run Reset lock + fresh Tablet reconstruction */
  const pack = await pc.run('PROD_SETUP.activateSystemGlobally({})');
  assert.ok(pack && pack.count > 0, 'Global activation must succeed over sharded Free-Tier KV');

  const lockedReset = await apiFetch('api/setup/reset-first-run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: 'RESET-FIRST-RUN' }),
  });
  assert.equal(lockedReset.status, 409, 'Post-activation First-Run Reset must be permanently refused with 409');

  /* Turn off replica lag before synchronous single-call health probe on fresh tablet, then re-enable for tablet login! */
  simulateReadReplicaLag = false;
  const staff = pack.rows[0];
  const tablet = client();
  tablet.run('SYNC.queue = () => {}; DB.load();');
  const health = await tablet.run('hostProbe()');
  tablet.run(`APPX.host = ${JSON.stringify(health)}; SYNC.server = APPX.host;`);
  assert.equal(health.globallyActivated, true);
  simulateReadReplicaLag = true;
  const tabletLogin = await tablet.run(`AUTH.loginOnline(${JSON.stringify(staff.username)}, ${JSON.stringify(staff.tempPassword)}, 'tablet')`);
  assert.equal(tabletLogin.ok, true, JSON.stringify(tabletLogin));
  assert.equal(tablet.run('DB.db.patients.length'), 3333, 'Fresh tablet pulls full 3,333-patient cloud state from sharded Upstash KV even under replica lag');
  assert.equal(shardWritesWithTtl, 0, 'New immutable shard writes must not use Redis TTLs that can expire/evict active records');

  /* Corrupt the active shard 2, then verify recovery from the retained prior
     complete shard snapshot, preserving every real cloud record and repairing KV. */
  simulateReadReplicaLag = false;
  const activeManifestRaw = kv.get('carelink_cloud_v66');
  const activeManifest = JSON.parse(JSON.parse(activeManifestRaw));
  assert.ok(Array.isArray(activeManifest.prevShardKeys) && activeManifest.prevShardKeys.length > 0,
    'Each sharded manifest retains its previous immutable snapshot for safe recovery');
  const activeShard2Key = activeManifest.shardKeys[1];
  assert.ok(activeShard2Key, 'Large CareLink data set must have a second active shard');
  kv.set(activeShard2Key, 'corrupted-shard-2');
  __resetCloudCachesForTests(); /* emulate a fresh serverless instance with no trusted in-memory snapshot */
  const repairedRead = await apiFetch('api/state', {
    headers: { Authorization: `Bearer ${tablet.run('SYNC.sessionToken')}` },
  });
  assert.equal(repairedRead.status, 200, 'A valid previous full snapshot must automatically recover a corrupted active shard');
  const repairedManifest = JSON.parse(JSON.parse(kv.get('carelink_cloud_v66')));
  assert.notEqual(repairedManifest.shardKeys[1], activeShard2Key, 'Recovery must publish fresh immutable shard keys');
  assert.equal(repairedManifest.head.globallyActivated, true, 'Recovery must preserve Global System Activation from authoritative head metadata');
  assert.equal(repairedManifest.head.hasLargeCollections, true, 'Recovery must preserve large live database metadata');
  const repairedShard = JSON.parse(kv.get(repairedManifest.shardKeys[1]));
  assert.equal(crypto.createHash('sha256').update(repairedShard).digest('hex'), repairedManifest.shardDigests[1],
    'Repaired shard 2 must match its committed SHA-256 digest');
  assert.equal(tablet.run('DB.db.patients.length'), 3333, 'Shard repair must not replace/remove the live patient registry');


  /* 6. Regression proof for "Verifying..." hang prevention:
        - Buffer req.body + readableEnded=true empty stream never hang readJsonBody
        - Login acquires one atomic account lease; heartbeat renews it without rewriting the database
        - Transient network drop on login retries automatically and succeeds
        - Persistent network/timeout error resets LOGIN6.busy = false (never stuck on Verifying...)
        - Overlapping logout + fresh sharded login never triggers 503 torn shard reads */
  simulateReadReplicaLag = false;
  const setsBeforeBeat = kvSetCounter;
  const beatEmptyStream = await (async () => {
    const token = tablet.run('SYNC.sessionToken');
    const req = {
      url: '/api/session/beat',
      method: 'POST',
      headers: { host: 'carelink.test', authorization: `Bearer ${token}` },
      readableEnded: true,
      on() { /* never fires 'end' on pre-drained serverless stream */ },
    };
    let status = 0; let raw = '';
    const res = { set statusCode(v) { status = v; }, get statusCode() { return status; }, setHeader() {}, end(v) { raw = v || ''; } };
    await handler(req, res);
    return { status, body: JSON.parse(raw) };
  })();
  assert.equal(beatEmptyStream.status, 200, 'Pre-drained readableEnded stream must resolve immediately without hanging');
  assert.equal(beatEmptyStream.body.ok, true);
  assert.equal(kvSetCounter, setsBeforeBeat, 'Stateless session heartbeat must perform zero KV writes');

  assert.ok(pack.rows.length > 1, 'Activation must issue multiple staff accounts for isolated login tests');
  const secondStaff = pack.rows[1];
  const setsBeforeLogin = kvSetCounter;
  const bufferLogin = await (async () => {
    const req = {
      url: '/api/auth/login',
      method: 'POST',
      headers: { host: 'carelink.test', 'content-type': 'application/json' },
      body: Buffer.from(JSON.stringify({ username: secondStaff.username, password: secondStaff.tempPassword }), 'utf8'),
      readableEnded: true,
      on() {},
    };
    let status = 0; let raw = '';
    const res = { set statusCode(v) { status = v; }, get statusCode() { return status; }, setHeader() {}, end(v) { raw = v || ''; } };
    await handler(req, res);
    return { status, body: JSON.parse(raw) };
  })();
  assert.equal(bufferLogin.status, 200, 'Buffer req.body on /api/auth/login must parse cleanly');
  assert.equal(bufferLogin.body.ok, true);
  assert.equal(kvSetCounter, setsBeforeLogin, 'Login must not rewrite the large cloud manifest; its small session lease uses an atomic Redis command');
  const bufferLogout = await apiFetch('api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${bufferLogin.body.token}` }, body: '{}' });
  assert.equal(bufferLogout.status, 200, 'The isolated API login must be releasable before retry tests');

  /* Transient first-attempt drop on login recovers automatically, and LOGIN6.busy resets to false */
  let dropFirstLogin = true;
  const flakyLaptop = makeCtx({
    location: { hash: '', protocol: 'https:', origin: 'https://carelink.test', host: 'carelink.test' },
    navigator: { userAgent: 'flaky-login-test' },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    fetch: async (url, opts) => {
      if (dropFirstLogin && String(url).includes('api/auth/login')) {
        dropFirstLogin = false;
        throw new Error('The shared online service timed out while responding.');
      }
      return apiFetch(url, opts);
    },
  });
  flakyLaptop.run(`APPX.host = ${JSON.stringify(health)}; SYNC.server = APPX.host;`);
  flakyLaptop.ctx.__form = { username: secondStaff.username, password: secondStaff.tempPassword };
  await flakyLaptop.run('FORMS.login6(new FormData())');
  assert.equal(flakyLaptop.run('LOGIN6.busy'), false, 'LOGIN6.busy must clear after recovered login');
  assert.equal(flakyLaptop.run('APPX.screen'), 'app', 'Transient login drop must recover automatically via retry');
  assert.equal(flakyLaptop.run('DB.db.patients.length'), 3333);
  await apiFetch('api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${flakyLaptop.run('SYNC.sessionToken')}` }, body: '{}' });

  /* Persistent outage resets LOGIN6.busy = false (never stuck on "Verifying...") */
  const offlineHosted = makeCtx({
    location: { hash: '', protocol: 'https:', origin: 'https://carelink.test', host: 'carelink.test' },
    navigator: { userAgent: 'offline-hosted-test' },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    fetch: async () => { throw new Error('The shared online service timed out while responding.'); },
  });
  offlineHosted.run(`APPX.host = ${JSON.stringify(health)}; SYNC.server = APPX.host;`);
  offlineHosted.ctx.__form = { username: secondStaff.username, password: secondStaff.tempPassword };
  await offlineHosted.run('FORMS.login6(new FormData())');
  assert.equal(offlineHosted.run('LOGIN6.busy'), false, 'LOGIN6.busy must never remain stuck on Verifying...');
  assert.ok(!/Verifying\.\.\./.test(offlineHosted.run('renderLogin6()')), 'Rendered Sign-In button must not stay on Verifying...');
  assert.ok(offlineHosted.run('LOGIN6.error.length > 0'), 'Sign-In must display a clear error message on timeout');

  /* 10. Regression checks for 0 ms boot listeners, /public/ API path resolution,
     GitHub Pages static-host detection, system.admin <-> chief.admin alias sign-in,
     setup lockout clearing, and onboarding loop prevention. */
  {
    const docListeners = [];
    let releaseHealth;
    const healthGate = new Promise((r) => { releaseHealth = r; });
    const slowBoot = makeCtx({
      location: { hash: '#/login', protocol: 'https:', origin: 'https://carelink.test', host: 'carelink.test', hostname: 'carelink.test', pathname: '/carelink-v6.html' },
      navigator: { userAgent: 'boot-listener-race-test' },
      document: {
        title: '',
        body: { style: {}, dataset: {} },
        documentElement: { style: { setProperty() {}, removeProperty() {} }, dataset: {} },
        getElementById() { return { innerHTML: '', style: {}, classList: { add() {}, remove() {}, toggle() {} }, dataset: {}, addEventListener() {}, appendChild() {}, querySelector() { return null; }, querySelectorAll() { return []; } }; },
        querySelector(sel) { return sel === '.ai-dock' ? null : { innerHTML: '', style: {}, classList: { add() {}, remove() {}, toggle() {} }, dataset: {}, remove() {}, addEventListener() {}, appendChild() {}, querySelector() { return null; }, querySelectorAll() { return []; } }; },
        querySelectorAll() { return []; },
        createElement() { return { innerHTML: '', style: {}, classList: { add() {}, remove() {} }, dataset: {}, addEventListener() {}, appendChild() {} }; },
        addEventListener(ev) { docListeners.push(ev); },
      },
      fetch: async () => {
        await healthGate;
        return { ok: true, status: 200, json: async () => ({ ok: true, setup: true, rev: 1 }) };
      },
    });
    const bootPromise = slowBoot.run('boot()');
    assert.ok(docListeners.includes('click') && docListeners.includes('submit') && docListeners.includes('change'),
      'boot() must attach click/submit/change listeners synchronously at 0 ms before hostProbe() resolves');
    assert.equal(slowBoot.run('APPX.screen'), 'login', 'boot() must honour #/login immediately at 0 ms');
    releaseHealth();
    await bootPromise;

    assert.equal(
      slowBoot.run(`(()=>{ location.pathname = '/public/carelink-v6.html'; return SYNC.resolveApiUrl('api/auth/login'); })()`),
      '../api/auth/login',
      '/public/carelink-v6.html must rewrite api/... to ../api/... so serverless routes do not 404',
    );
    assert.equal(
      slowBoot.run(`(()=>{ location.pathname = '/carelink-v6.html'; return SYNC.resolveApiUrl('api/auth/login'); })()`),
      'api/auth/login',
      'Root /carelink-v6.html must keep relative api/... path untouched',
    );
    assert.equal(
      slowBoot.run(`(()=>{ location.hostname = 'theqwengacfs.github.io'; return SYNC.available(); })()`),
      false,
      'Static *.github.io preview host has no serverless /api/* and must run cleanly in static/offline mode',
    );
    assert.equal(
      slowBoot.run(`(()=>{ location.hostname = 'care-link-dims-dev.vercel.app'; return SYNC.available(); })()`),
      true,
      'Vercel production host must report SYNC.available() === true',
    );
  }

  /* 11. Pre-activation setup under chief.admin allows signing in as system.admin (and clears prior lockouts + onboarding loop) */
  {
    kv.clear();
    const aliasSetupPw = 'Zx8#pL4!qW9@mN2';
    /* Verify POST /api/setup wipes loginFailures and sets onboarding.complete = true */
    const setupRes = await apiFetch('api/setup', {
      method: 'POST',
      body: {
        org: { name: 'LOMAMO Foundation', shortName: 'LOMAMO', county: 'kisumu' },
        admin: { username: 'chief.admin', name: 'Chief System Administrator', password: aliasSetupPw, mustChange: true },
        db: { meta: { schema: 6, version: '6.6.0' }, settings: { onboarding: { complete: false, step: 1 } }, users: [{ id: 'u-chief-admin', username: 'chief.admin', roleId: 'chief', name: 'Chief System Administrator', status: 'active' }] },
      },
    });
    assert.equal(setupRes.status, 200);
    const badAliasRes = await apiFetch('api/auth/login', {
      method: 'POST',
      body: { username: 'system.admin', password: 'WrongPassword123!' },
    });
    const badAliasBody = await badAliasRes.json();
    assert.equal(badAliasRes.status, 401, 'Wrong password via system.admin alias must still be rejected');
    assert.match(badAliasBody.error || '', /system\.admin|Reset 4-Step Setup/i, 'Pre-activation 401 should give actionable guidance');

    const aliasClient = makeCtx({
      location: { hash: '', protocol: 'https:', origin: 'https://carelink.test', host: 'carelink.test', hostname: 'carelink.test', pathname: '/carelink-v6.html' },
      navigator: { userAgent: 'chief-alias-test' },
      sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
      fetch: apiFetch,
    });
    const aliasHealth = await (await apiFetch('api/health')).json();
    aliasClient.run(`APPX.host = ${JSON.stringify(aliasHealth)}; SYNC.server = APPX.host; APPX.screen = 'login';`);
    aliasClient.ctx.__form = { username: 'system.admin', password: aliasSetupPw };
    await aliasClient.run('FORMS.login6(new FormData())');
    assert.equal(aliasClient.run('Boolean(AUTH.user && AUTH.user.roleId === "chief")'), true,
      'Signing in as system.admin must resolve to the Chief System Administrator provisioned in Step 2');
    assert.equal(aliasClient.run('AUTH.mustChange'), true, 'First login via alias must still enforce temporary password replacement');
    assert.equal(aliasClient.run('Boolean(DB.db.settings.onboarding && DB.db.settings.onboarding.complete)'), true,
      'Setup and login must mark onboarding.complete = true so authenticated users never bounce back to onboarding');
  }

  /* If neither active nor retained snapshots decode, preserve the manifest and
     refuse to substitute the bundled demo reference dataset for live records. */
  const irrecoverableManifest = {
    format: 'carelink-cloud-gzip-sharded-v1',
    shardCount: 1,
    shardKeys: ['carelink_cloud_v66_unrecoverable_s0'],
    shardDigests: [crypto.createHash('sha256').update('expected-data').digest('hex')],
    rev: 999,
    saved: new Date().toISOString(),
    head: { setup: true, globallyActivated: true, hasLargeCollections: true, creds: {}, users: [] },
  };
  kv.set(irrecoverableManifest.shardKeys[0], 'tampered-data');
  const irrecoverableRaw = JSON.stringify(irrecoverableManifest);
  kv.set('carelink_cloud_v66', JSON.stringify(irrecoverableRaw));
  const safeFailure = await apiFetch('api/state');
  assert.equal(safeFailure.status, 503, 'Unrecoverable shard corruption must fail closed');
  assert.match((await safeFailure.json()).error || '', /shard 1 failed integrity verification/i);
  assert.equal(kv.get('carelink_cloud_v66'), JSON.stringify(irrecoverableRaw),
    'Unrecoverable integrity failure must leave the original online manifest untouched');


  console.log('kv-recovery-and-autofeed: real Upstash verbatim KV + reset-first-run + 3,333-patient zero-file Cloud Auto-Feed + Free-Tier <1 MiB KV sharding + Verifying-hang prevention + 0ms boot/alias/path fixes + intact Master Import passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
