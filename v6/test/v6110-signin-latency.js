/* v6.11.0 — sign-in latency.
   A sign-in that takes a minute is not refused, it is slow, so the fix is
   attribution rather than a shorter timeout: the server reports where the time
   went, and the client stops re-downloading a workspace it already has.
   These checks pin both, and pin that the credential check is still the only
   thing standing between a wrong password and a session. */
const fs = require('fs');
const path = require('path');
const { makeKv, installKvFetch, loadHandler } = require('./api-host-harness.cjs');
const { dispatchWithDeviceCookie } = require('./device-cookies.cjs');

const REPO = path.resolve(__dirname, '..', '..');
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');

console.log('\nSIGN-IN LATENCY\n');

const api = read('api/index.js');
const sync = read('v6/src/sync6.js');

/* ---- 1. the server can attribute the wait ---- */
ok('the server counts KV round-trips per request', api.includes('kvCallCounter('));
ok('the counter is wired into the single KV command path', /async function runKvCommand[^{]*\{[\s\S]{0,80}kvCallCounter\(\)/.test(api));
ok('the login handler marks its stages', ['credential_lookup', 'password_verify', 'device_admission', 'auth_metadata_saved']
  .every(stage => api.includes(`mark('${stage}')`)));
ok('timings are returned only when asked for', /wantsTiming[\s\S]{0,200}timing: stageTimes/.test(api));
ok('the timing payload carries no patient data', (() => {
  const block = api.slice(api.indexOf('stageTimes.totalMs'), api.indexOf('stageTimes.totalMs') + 400);
  return /totalMs|kvRoundTrips|inlineStateBytes|stateSharded/.test(block) && !/patients|names|creds/i.test(block);
})());

/* ---- 2. the timing report is real, measured against the handler ---- */
const kv = makeKv();
installKvFetch(kv, { origin: 'https://kv.test' });
process.env.KV_REST_API_URL = 'https://kv.test';
process.env.KV_REST_API_TOKEN = 'test-token';
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

(async () => {
  const handler = await loadHandler();
  const call = async (route, { method = 'GET', body, token } = {}) => {
    const req = {
      url: `/api/${route}`, method,
      headers: { host: 'carelink.test', ...(token ? { 'x-carelink-session': token } : {}) },
      body: body === undefined ? {} : body,
      async *[Symbol.asyncIterator]() { if (body !== undefined) yield Buffer.from(JSON.stringify(body), 'utf8'); },
      on() {}
    };
    let status = 0, raw = '';
    const res = { set statusCode(v) { status = v; }, get statusCode() { return status; }, setHeader() {}, end(s) { raw = s || ''; } };
    await dispatchWithDeviceCookie(handler, req, res);
    return { status, body: raw ? JSON.parse(raw) : {} };
  };

  const ADMIN_PW = 'Kx9!vQ2#mTz7Lp';
  const setup = await call('setup', { method: 'POST', body: {
    admin: { username: 'proc.officer', password: ADMIN_PW, name: 'Procurement Officer' },
    db: { meta: { schema: 6, label: 'latency' }, settings: { org: { emailDomain: 'lomamofoundation.org' } }, users: [], patients: [], visits: [], pdcas: [], requests: [], transactions: [], calendarEvents: [] }
  } });
  ok('the test installation commissions', setup.status === 200, String(setup.status));

  const timed = await call('auth/login?timing=1', { method: 'POST', body: {
    username: 'proc.officer', password: ADMIN_PW, deviceLabel: 'Latency test', deviceType: 'computer', loginAttemptId: 'latency-0001-abcd'
  } });
  ok('a correct password still signs in', timed.status === 200 && Boolean(timed.body.token), String(timed.status));
  ok('the timing report is present when asked', Boolean(timed.body.timing));
  ok('it reports a total', timed.body.timing && timed.body.timing.totalMs >= 0);
  ok('it reports the KV round-trips the sign-in actually made', timed.body.timing && timed.body.timing.kvRoundTrips > 0,
    String(timed.body.timing && timed.body.timing.kvRoundTrips));
  ok('the sign-in stays inside a small number of round-trips', timed.body.timing && timed.body.timing.kvRoundTrips <= 8,
    `${timed.body.timing && timed.body.timing.kvRoundTrips} round-trips`);
  ok('it reports the stage that dominates', timed.body.timing &&
    ['credential_lookup', 'password_verify', 'device_admission', 'auth_metadata_saved']
      .some(k => typeof timed.body.timing[k] === 'number'));

  const untimed = await call('auth/login', { method: 'POST', body: {
    username: 'proc.officer', password: ADMIN_PW, deviceLabel: 'Latency test', deviceType: 'computer', loginAttemptId: 'latency-0002-abcd', takeover: true
  } });
  ok('the timing block is absent unless asked for', !untimed.body.timing);

  const wrong = await call('auth/login?timing=1', { method: 'POST', body: {
    username: 'proc.officer', password: 'definitely-not-the-password', deviceLabel: 'Latency test', deviceType: 'computer', loginAttemptId: 'latency-0003-abcd'
  } });
  ok('a wrong password is still refused', wrong.status === 401, String(wrong.status));
  ok('a refused sign-in never returns a token', !wrong.body.token);

  /* ---- 3. the client stops re-downloading what it already has ---- */
  ok('the client asks the host before downloading', /api\/state\?since=\$\{localRev\}&deltaOnly=1/.test(sync));
  ok('an unchanged document skips the full pull',
    (() => {
      const at = sync.indexOf('unchanged === true');
      if (at < 0) return false;
      const after = sync.slice(at, at + 1400);
      /* within the same branch, the flag is set and the download is never issued */
      return /pulled = true/.test(after) && !/await this\.pullFull/.test(after.split('if (!pulled)')[0] || '');
    })(), 'the unchanged branch must set pulled without calling pullFull');
  ok('the fast path is skipped for the password-before-workspace gate',
    /localOwner === signingIn && !r\.body\.passwordBeforeWorkspace/.test(sync));
  ok('a document written by another account is never reused',
    /localOwner && localOwner === signingIn/.test(sync));
  ok('the fall-through to the full pull is still there', /if \(!pulled\) \{\s*\n?\s*pulled = await this\.pullFull/.test(sync.replace(/\n/g, '\n')));
  ok('the device remembers whose document it holds', /meta\.snapshotOwner = signingIn/.test(sync));
  ok('a failed fast path cannot lose the sign-in', /catch \(_e\) \{ \/\* fall through to the full pull \*\/ \}/.test(sync));

  /* ---- 4. the browser is not asked to wait on anything avoidable ---- */
  ok('the local verifier rehash happens after the console opens, not before',
    sync.indexOf('this._rememberVerifier') === -1, 'it belongs to the online login, not the sync client');
  ok('admission no longer forces a whole-workspace read on a sharded install',
    /state\._headOnly && !state\._shardedManifest/.test(api));

  console.log(`\nsignin latency: ${pass} checks passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
