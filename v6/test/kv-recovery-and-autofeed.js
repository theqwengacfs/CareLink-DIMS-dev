/* End-to-end verification of:
   1. Real Upstash REST verbatim-body KV behavior (double-JSON-string prevention & healing)
   2. Pre-activation First-Run Reset (`POST /api/setup/reset-first-run`) + permanent post-activation 409 lock
   3. Zero-local-drive Cloud Auto-Feed of the 100%-complete 3,333-patient dataset (`POST /api/master-import/auto-seed`)
   4. Automatic Upstash Free-Tier (<1 MB per command) sharded KV fallback & paged Tablet reconstruction
   5. Intact manual CSV Master Import (`IMPORTER`) after Cloud Auto-Feed */
const assert = require('node:assert/strict');
const { makeCtx } = require('./dom');

process.env.KV_REST_API_URL = 'https://kv-upstash-real.test';
process.env.KV_REST_API_TOKEN = 'real-upstash-token';
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const kv = new Map();
let enforceOneMegabyteFreeTierCap = false;
let maxShardWriteBytes = 0;

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
    return kvResponse({ result: kv.has(key) ? kv.get(key) : null });
  }
  if (url.pathname.startsWith('/set/')) {
    const key = keyFromPath(url, '/set/');
    if (enforceOneMegabyteFreeTierCap && bodyBytes > 1024 * 1024) {
      return kvResponse({ error: 'ERR max request size exceeded' }, 400);
    }
    if (enforceOneMegabyteFreeTierCap) {
      maxShardWriteBytes = Math.max(maxShardWriteBytes, bodyBytes);
    }
    /* Store rawBody VERBATIM just like real Upstash Redis REST! */
    kv.set(key, rawBody);
    return kvResponse({ result: 'OK' });
  }
  if (url.pathname.startsWith('/del/')) {
    const key = keyFromPath(url, '/del/');
    kv.delete(key);
    return kvResponse({ result: 1 });
  }
  throw new Error(`Unexpected KV request: ${url.pathname}`);
};

(async () => {
  const { default: handler } = await import('../../api/index.js');

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
  kv.set('carelink_cloud_v64', '"not-an-object-legacy-broken-kv-value"');
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

  /* 3. Enforce Upstash Free-Tier 1 MB single-key cap while commissioning + auto-feeding 3,333 patients! */
  enforceOneMegabyteFreeTierCap = true;
  const setupPw = 'Kx9!vQ2#mTz7Lp';
  const privatePw = 'Private#2027!xQ';

  const setup = await pc.run(`PROD_SETUP.completeFourStepHostSetup({
    orgNameVal:'LOMAMO Foundation Kenya', shortNameVal:'LOMAMO', seedMode:'empty',
    chiefUsername:'chief.admin', chiefPassword:${JSON.stringify(setupPw)}, loginUrl:'https://carelink.test'
  })`);
  assert.equal(setup.cloudVerified, true, '4-Step commissioning must succeed against real verbatim-body Upstash KV');

  /* Arm the Step 4 Cloud Auto-Feed flag just like finishing Step 4 in UI */
  pc.run(`ONB._pendingCloudAutoFeed = true;`);

  const loginRes = await pc.run(`AUTH.loginOnline('chief.admin', ${JSON.stringify(setupPw)}, 'pc')`);
  assert.equal(loginRes.ok, true, JSON.stringify(loginRes));

  pc.run(`__form = { current:${JSON.stringify(setupPw)}, password:${JSON.stringify(privatePw)}, password2:${JSON.stringify(privatePw)} }; AUTH.mustChange = true;`);
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

  const staff = pack.rows[0];
  const tablet = client();
  tablet.run('SYNC.queue = () => {}; DB.load();');
  const health = await tablet.run('hostProbe()');
  tablet.run(`APPX.host = ${JSON.stringify(health)}; SYNC.server = APPX.host;`);
  assert.equal(health.globallyActivated, true);
  const tabletLogin = await tablet.run(`AUTH.loginOnline(${JSON.stringify(staff.username)}, ${JSON.stringify(staff.tempPassword)}, 'tablet')`);
  assert.equal(tabletLogin.ok, true, JSON.stringify(tabletLogin));
  assert.equal(tablet.run('DB.db.patients.length'), 3333, 'Fresh tablet pulls full 3,333-patient cloud state from sharded Upstash KV');

  console.log('kv-recovery-and-autofeed: real Upstash verbatim KV + reset-first-run + 3,333-patient zero-file Cloud Auto-Feed + Free-Tier <1 MiB KV sharding + intact Master Import passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
