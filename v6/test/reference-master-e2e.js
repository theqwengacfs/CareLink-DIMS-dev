/* Full reference-master proof using the actual downloadable package. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { makeCtx } = require('./dom');

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'master', 'CareLink-Reference-Master-v6.6.json'), 'utf8'));
const kv = new Map();
let maxKvRequestBytes = 0;
let maxApiResponseBytes = 0;
const kvResponse = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const keyFromPath = (url, prefix) => decodeURIComponent(url.pathname.slice(prefix.length));

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  assert.equal(url.origin, 'https://kv.test');
  assert.equal(init.headers?.Authorization, 'Bearer reference-e2e-token');
  const bodyBytes = init.body ? Buffer.byteLength(String(init.body)) : 0;
  maxKvRequestBytes = Math.max(maxKvRequestBytes, bodyBytes);
  assert.ok(bodyBytes <= 10 * 1024 * 1024, `KV request exceeded 10 MB: ${bodyBytes}`);
  if (url.pathname.startsWith('/get/')) {
    const key = keyFromPath(url, '/get/');
    return kvResponse({ result: kv.has(key) ? kv.get(key) : null });
  }
  if (url.pathname.startsWith('/set/')) {
    const key = keyFromPath(url, '/set/');
    const value = JSON.parse(init.body);
    assert.equal(typeof value, 'string');
    kv.set(key, value);
    return kvResponse({ result: 'OK' });
  }
  if (url.pathname.startsWith('/del/')) {
    const key = keyFromPath(url, '/del/');
    kv.delete(key);
    return kvResponse({ result: 1 });
  }
  throw new Error(`Unexpected KV request: ${url.pathname}`);
};
process.env.KV_REST_API_URL = 'https://kv.test';
process.env.KV_REST_API_TOKEN = 'reference-e2e-token';
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

(async () => {
  const encoded = manifest.chunks.join('');
  assert.equal(encoded.length, manifest.base64Length);
  const compressed = Buffer.from(encoded, 'base64');
  assert.equal(compressed.length, manifest.compressedBytes);
  assert.equal(crypto.createHash('sha256').update(compressed).digest('hex'), manifest.compressedDigest);
  const raw = zlib.brotliDecompressSync(compressed).toString('utf8');
  assert.equal(Buffer.byteLength(raw), manifest.rawBytes);
  assert.equal(crypto.createHash('sha256').update(raw).digest('hex'), manifest.digest);
  const payload = JSON.parse(raw);
  assert.equal(payload.db.patients.length, 3333);
  assert.ok(payload.db.users.every((u) => !u.hash && !u.salt), 'public master must not contain credential material');
  assert.equal(payload.quality.passed, true);
  assert.equal(payload.quality.workflowMatrix.pct, 100);
  assert.equal(payload.quality.dataQualityFindings, 0);

  const { default: handler } = await import('../../api/index.js');
  async function apiFetch(url, opts = {}) {
    const headers = { host: 'carelink.test' };
    for (const [key, value] of Object.entries(opts.headers || {})) headers[key.toLowerCase()] = value;
    const req = { url: `/${url}`, method: opts.method || 'GET', headers, body: opts.body || {}, on() {} };
    let status = 0; let rawResponse = '';
    const res = {
      set statusCode(value) { status = value; }, get statusCode() { return status; },
      setHeader() {}, end(value) { rawResponse = value || ''; },
    };
    await handler(req, res);
    const bytes = Buffer.byteLength(rawResponse);
    maxApiResponseBytes = Math.max(maxApiResponseBytes, bytes);
    assert.ok(bytes <= 4.5 * 1024 * 1024, `Vercel response exceeded 4.5 MB for ${url}: ${bytes}`);
    return { ok: status >= 200 && status < 300, status, json: async () => rawResponse ? JSON.parse(rawResponse) : {} };
  }
  function client() {
    return makeCtx({
      location: { hash: '', protocol: 'https:', origin: 'https://carelink.test', host: 'carelink.test' },
      navigator: { userAgent: 'reference-master-e2e' },
      performance: { now: () => Date.now() },
      sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
      fetch: apiFetch,
    });
  }

  const initialPassword = 'Kx9!vQ2#mTz7Lp';
  const privatePassword = 'Private#2027!xQ';
  const pc = client();
  pc.run('SYNC.queue = () => {};');
  const setup = await pc.run(`PROD_SETUP.completeFourStepHostSetup({
    orgNameVal:'Reference E2E Organisation', shortNameVal:'REF', seedMode:'empty',
    chiefUsername:'chief.admin', chiefPassword:${JSON.stringify(initialPassword)}, loginUrl:'https://carelink.test'
  })`);
  assert.equal(setup.cloudVerified, true);
  const chiefLogin = await pc.run(`AUTH.loginOnline('chief.admin', ${JSON.stringify(initialPassword)}, 'pc')`);
  assert.equal(chiefLogin.ok, true, JSON.stringify(chiefLogin));
  pc.run(`__form = { current:${JSON.stringify(initialPassword)}, password:${JSON.stringify(privatePassword)}, password2:${JSON.stringify(privatePassword)} }; AUTH.mustChange = true;`);
  await pc.run('FORMS.mustchange6(new FormData())');
  assert.equal(pc.run('AUTH.mustChange'), false);

  pc.run(`REFERENCE_MASTER.inspect(${JSON.stringify(manifest)}, {name:'CareLink-Reference-Master-v6.6.json'});`);
  const importHtml = pc.run('renderImport(AUTH.user)');
  assert.ok(/3,333/.test(importHtml) && /reference-master-upload/.test(importHtml) && /Automated quality evidence/.test(importHtml));
  await pc.run('REFERENCE_MASTER.upload()');
  assert.equal(pc.run('REFERENCE_MASTER.phase'), 'done', pc.run('REFERENCE_MASTER.error'));
  assert.equal(pc.run('REFERENCE_MASTER.result.quality.patientRegistryCompleteness'), 100);
  assert.equal(pc.run('DB.db.patients.length'), 3333);
  assert.equal(pc.run('DB.db.visits.length'), 44995);
  assert.equal(pc.run('DB.db.pdcas.length'), 18060);
  assert.equal(pc.run('DB.db.settings.org.name'), 'Reference E2E Organisation', 'live organisation settings must be preserved');
  assert.equal(pc.run('WORKFLOW_ENGINE.completionMatrix(AUTH.user).global.pct'), 100);
  assert.equal(pc.run('REPORTS.dataQuality(AUTH.user).length'), 0);
  assert.equal(pc.run('DB.db.meta.referenceMaster.quality.passed'), true);
  assert.ok(![...kv.keys()].some((key) => key.startsWith('carelink_reference_master_v1_')), 'temporary chunks must be removed after commit');
  const storedEnvelope = JSON.parse(kv.get('carelink_cloud_v66'));
  assert.equal(storedEnvelope.format, 'carelink-cloud-gzip-v1', 'large shared state must use compressed KV storage');

  const pack = await pc.run('PROD_SETUP.activateSystemGlobally({})');
  assert.ok(pack && pack.count > 0, 'global activation must follow the completed reference import');
  const staff = pack.rows[0];

  const tablet = client();
  tablet.run('SYNC.queue = () => {}; DB.load();');
  const health = await tablet.run('hostProbe()');
  tablet.run(`APPX.host = ${JSON.stringify(health)}; SYNC.server = APPX.host;`);
  assert.equal(health.globallyActivated, true);
  const tabletLogin = await tablet.run(`AUTH.loginOnline(${JSON.stringify(staff.username)}, ${JSON.stringify(staff.tempPassword)}, 'tablet')`);
  assert.equal(tabletLogin.ok, true, JSON.stringify(tabletLogin));
  assert.equal(tablet.run('DB.db.patients.length'), 3333, 'fresh tablet must reconstruct every paged patient');
  assert.equal(tablet.run('DB.db.visits.length'), 44995, 'fresh tablet must reconstruct every paged visit');
  assert.equal(tablet.run('DB.db.settings.globallyActivated'), true);
  const loginHtml = tablet.run(`(()=>{ AUTH.logout(); APPX.screen='login'; LOGIN6.tab='demo'; return renderLogin6(); })()`);
  assert.ok(!/data-tab="demo"|data-act="load-demo"|First-run online setup|Live host setup/i.test(loginHtml));

  console.log(`reference-master-e2e: actual master file + ${manifest.chunkCount} chunks + PC/tablet paged sync passed`);
  console.log(`  3,333 patients · 44,995 visits · 18,060 PDCAs · 100% workflow QA · 0 data-quality findings`);
  console.log(`  largest API response ${(maxApiResponseBytes / 1048576).toFixed(2)} MiB · largest KV request ${(maxKvRequestBytes / 1048576).toFixed(2)} MiB`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
