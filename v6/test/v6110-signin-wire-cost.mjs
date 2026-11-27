/* Measure what an actual sign-in costs over the wire, against the real
   `api/index.js` handler behind a real fetch, with a register at the
   contractual 4,000-patient size.

   This is the measurement the round was missing: the earlier harness served
   the workspace inline, so "bytes downloaded" was structurally zero and could
   not tell anybody where a minute went. Here every response body is counted as
   it is produced, and the fast pack is decompressed and compared with what the
   plain snapshot returns.

   Run: node v6/test/v6110-signin-wire-cost.mjs [patientCount] */
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { makeKv, installKvFetch, makeBrowser, loadHandler } from './api-host-harness.cjs';

const PATIENTS = Number(process.argv[2] || 4000);
/* The handler reads its storage from the environment, exactly as on Vercel. */
process.env.KV_REST_API_URL = 'https://kv-carelink.test';
process.env.KV_REST_API_TOKEN = 'test-token';
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
const kv = makeKv();
installKvFetch(kv);
const handler = await loadHandler();

/* ---- commission the installation the way a real deployment is commissioned ---- */
const browser = makeBrowser(handler, { origin: 'https://wire.test' });
const ADMIN_PW = 'WireTest-Admin-Pass-2026!';
const FIELD_PW = 'WireTest-Field-Pass-2026!';

const patients = [];
const visits = [];
for (let i = 0; i < PATIENTS; i++) {
  const id = `wire-p-${i + 1}`;
  const area = i % 3 === 0 ? 'nyalenda' : i % 3 === 1 ? 'makongeni' : 'manyatta';
  patients.push({
    id, code: `KSM-${String(i + 1).padStart(5, '0')}`, name: `Synthetic Wire ${i}`,
    countyId: 'kisumu', areaId: area, status: i % 11 === 0 ? 'discharged' : 'active',
    enrolledOn: '2026-01-15', householdId: `hh-${i % 900}`, demo: false,
  });
  visits.push({ id: `wire-v-${i + 1}`, patientId: id, countyId: 'kisumu', areaId: area, at: '2026-10-01T09:00:00.000Z', kind: 'home' });
}

const post = async (path, body, token) => {
  const res = await browser.fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

const setup = await post('api/setup', {
  admin: { username: 'chief.admin', password: ADMIN_PW, name: 'Wire Test Chief' },
  db: {
    meta: { schema: 6, label: 'wire-cost' },
    settings: { org: { emailDomain: 'lomamofoundation.org' } },
    users: [], patients, visits, pdcas: [], requests: [], transactions: [],
    urgentCases: [], waitingList: [], calendarEvents: [],
  },
});
if (setup.status !== 200) { console.error('setup failed:', JSON.stringify(setup.body).slice(0, 500)); process.exit(1); }

const chief = await post('api/auth/login', { username: 'chief.admin', password: ADMIN_PW });
if (!chief.body.token) { console.error('chief login failed:', JSON.stringify(chief.body).slice(0, 500)); process.exit(1); }
const chiefToken = chief.body.token;

/* Activate the installation and issue one field account over the API. */
const activate = await post('api/setup/activate-global', {
  settings: { globallyActivated: false }, meta: { globallyActivated: false, demoDisabled: false },
  users: [{ id: 'u-field-wire', username: 'caregiver.wire', name: 'Wire Field Officer', roleId: 'caregiver', countyId: 'kisumu', areaIds: ['nyalenda'], status: 'pending_activation', active: true }],
  accounts: [{ id: 'u-field-wire', username: 'caregiver.wire', name: 'Wire Field Officer', roleId: 'caregiver', countyId: 'kisumu', password: FIELD_PW }],
}, chiefToken);
if (activate.status !== 200) { console.error('activation failed:', JSON.stringify(activate.body).slice(0, 500)); process.exit(1); }

/* The issued temporary password, then the private one the officer sets on
   first sign-in - the exact two-step every real account walks. */
const issuedRow = (activate.body.issued || []).find((r) => r.username === 'caregiver.wire');
if (!issuedRow) { console.error('no field account issued:', JSON.stringify(activate.body).slice(0, 400)); process.exit(1); }
const tempLogin = await post('api/auth/login', { username: 'caregiver.wire', password: issuedRow.password, loginAttemptId: 'wire-temp-login-0001' });
if (!tempLogin.body.token) { console.error('temp login failed:', JSON.stringify(tempLogin.body).slice(0, 400)); process.exit(1); }
const change = await post('api/auth/change-password',
  { current: issuedRow.password, password: FIELD_PW }, tempLogin.body.token);
if (change.status !== 200) { console.error('password change failed:', JSON.stringify(change.body).slice(0, 400)); process.exit(1); }
/* Signing out releases the single-client lease, so the measured sign-in below
   is a clean one rather than a duplicate submission of the change-password
   session (which the API correctly refuses). */
await post('api/auth/logout', {}, tempLogin.body.token);

/* ---- count every byte that crosses the wire, in both directions ----------
   Two different costs matter and they were being conflated:
     * response bytes:   what the person's phone actually downloads;
     * KV bytes:         what the function reads from the store to answer.
   The first is the sign-in wait on a slow link; the second is the server's
   own cost and never reaches the device. Both are measured here. ---------- */
const calls = [];
let bytes = 0;
let kvBytes = 0;
let kvCalls = 0;
const kvFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const res = await kvFetch(input, init);
  const sized = {
    ...res,
    json: async () => {
      const body = await res.json();
      const n = Buffer.byteLength(JSON.stringify(body), 'utf8');
      kvBytes += n; kvCalls++;
      return body;
    },
  };
  return sized;
};

const responseFetch = browser.fetch;
browser.fetch = async (input, init) => {
  const res = await responseFetch(input, init);
  return {
    ...res,
    json: async () => {
      const body = await res.json();
      const n = Buffer.byteLength(JSON.stringify(body), 'utf8');
      bytes += n;
      calls.push({ url: String(input), size: n, status: res.status });
      return body;
    },
  };
};

/* ---- sign in, then pull the workspace the way the client does ---- */
const login = await browser.fetch('api/auth/login?timing=1', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'caregiver.wire', password: FIELD_PW, loginAttemptId: 'wire-measure-login-0002' }),
});
const loginBody = await login.json();
const token = loginBody.token;
if (!token) { console.error('login failed:', JSON.stringify(loginBody).slice(0, 400)); process.exit(1); }

const loginBytes = calls.reduce((n, c) => n + c.size, 0);
const loginCalls = calls.length;
const loginKvBytes = kvBytes, loginKvCalls = kvCalls;
calls.length = 0; bytes = 0; kvBytes = 0; kvCalls = 0;

/* the plain snapshot, for comparison */
const plain = await browser.fetch('api/state', { headers: { Authorization: `Bearer ${token}` } });
const plainBody = await plain.json();
const plainBytes = calls.reduce((n, c) => n + c.size, 0);

calls.length = 0; bytes = 0; kvBytes = 0; kvCalls = 0;

/* the compressed fast pack the client prefers */
const pack0 = await browser.fetch('api/state?fast=1', { headers: { Authorization: `Bearer ${token}` } });
const pack0Body = await pack0.json();
for (let p = 1; p < (pack0Body.totalParts || 1); p++) {
  await (await browser.fetch(`api/state?fast=1&part=${p}&targetRev=${pack0Body.rev}`, { headers: { Authorization: `Bearer ${token}` } })).json();
}
const packBytes = calls.reduce((n, c) => n + c.size, 0);
const packCalls = calls.length;

const unpacked = JSON.parse(zlib.gunzipSync(Buffer.from(pack0Body.part0, 'base64')).toString('utf8'));
const packPatients = (unpacked.db.patients || []).length;
const plainPatients = (plainBody.db.patients || []).length;

/* the sign-in fast path: same owner at the host revision downloads nothing */
calls.length = 0; bytes = 0;
const probe = await browser.fetch(`api/state?since=${pack0Body.rev}&deltaOnly=1`, { headers: { Authorization: `Bearer ${token}` } });
const probeBody = await probe.json();
const probeBytes = calls.reduce((n, c) => n + c.size, 0);

const mb = (n) => (n / 1048576).toFixed(2) + ' MB';
const kb = (n) => (n / 1024).toFixed(1) + ' KB';

console.log(`\n=== sign-in wire cost · ${PATIENTS} patients · ${packPatients} in scope ===`);
console.log(`login              ${String(loginCalls).padStart(2)} calls   ${kb(loginBytes).padStart(9)}`);
console.log(`  stages           ${JSON.stringify(loginBody.timing || {})}`);
console.log(`plain snapshot     ${String(1).padStart(2)} calls   ${mb(plainBytes).padStart(9)}   patients ${plainPatients}`);
console.log(`fast pack          ${String(packCalls).padStart(2)} calls   ${mb(packBytes).padStart(9)}   parts ${pack0Body.totalParts}   patients ${packPatients}   b64 ${String(pack0Body.part0).length}`);
console.log(`  pack payload     ${Object.keys(unpacked.db || {}).map(k => k + ':' + JSON.stringify(unpacked.db[k] || null).length).filter(x => Number(x.split(':')[1]) > 20000).join(' ')}`);
console.log(`  plain payload    ${Object.keys(plainBody.db || {}).map(k => k + ':' + JSON.stringify(plainBody.db[k] || null).length).filter(x => Number(x.split(':')[1]) > 20000).join(' ')}`);
console.log(`no-op rev probe    ${String(1).padStart(2)} calls   ${kb(probeBytes).padStart(9)}   unchanged=${probeBody.unchanged === true} deltaMiss=${probeBody.deltaMiss === true}`);
console.log(`saving vs plain    ${(100 - (packBytes / plainBytes) * 100).toFixed(1)}%`);

let bad = 0;
const check = (ok, name, detail) => { if (!ok) { bad++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); } };

check(pack0Body.fastPack === true, 'the fast pack says it is a fast pack');
check(packPatients > 0, 'the fast pack carries the scoped register, not an empty one', `patients=${packPatients}`);
check(packPatients === plainPatients, 'the fast pack matches the plain snapshot', `${packPatients} vs ${plainPatients}`);
check(unpacked.rev === pack0Body.rev, 'the pack revision survives the round-trip');
check(packBytes < plainBytes, 'the fast pack is smaller than the plain snapshot', `${packBytes} vs ${plainBytes}`);
check(Number(loginBody.timing?.kvRoundTrips) > 0, 'the login reports its KV round-trips', JSON.stringify(loginBody.timing));
check(probeBody.unchanged === true, 'an up-to-date device is told there is nothing to download', JSON.stringify(probeBody).slice(0, 200));
check(probeBytes < packBytes, 'the no-op probe costs less than a download', `${probeBytes} vs ${packBytes}`);
/* A sign-in must not carry the workspace: the register is fetched by the client
   on its own request, where the compressed pack can be used. Login staying
   near a kilobyte is what proves the minute was never spent in the handler. */
check(loginBytes < 64 * 1024, 'the login response does not embed the workspace', `${loginBytes} bytes`);
check(packBytes < plainBytes * 0.25, 'the compressed pack is at least four times smaller than the plain snapshot',
  `${packBytes} vs ${plainBytes}`);

/* The stage marks have to add up to the measured total, or they are decoration.
   credential_lookup is the first stage, so it is measured from the start of
   the request rather than from a mark that never existed. */
{
  const t = loginBody.timing || {};
  const sum = ['credential_lookup', 'password_verify', 'device_admission', 'auth_metadata_saved']
    .reduce((n, k) => n + (Number(t[k]) || 0), 0);
  const total = Number(t.totalMs) || 0;
  console.log(`  stage sum        ${sum} ms of ${total} ms total, ${t.kvRoundTrips} KV round-trips, ` +
    `login response ${kb(loginBytes)}, workspace KV read ${mb(loginKvBytes)} on the server`);
  check(sum <= total + 2 && sum >= total - 2, 'the reported stages add up to the reported total',
    `stages ${sum}ms vs total ${total}ms`);
  check(Number(t.kvRoundTrips) >= 1, 'a cold sign-in reports at least one KV round-trip', String(t.kvRoundTrips));
}

if (bad) { console.log(`\nwire cost: ${bad} FAILED`); process.exit(1); }
console.log('\nwire cost: all checks passed');
