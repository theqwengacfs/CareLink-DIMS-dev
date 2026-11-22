import { dispatchWithDeviceCookie } from './device-cookies.cjs';
import * as requireCrypto from 'node:crypto';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

/* A strict in-memory implementation of the Upstash/Vercel KV REST contract.
   The API under test still has only one source of truth: this remote mock. */
const kv = new Map();
let failReads = false;
let failWrites = false;
const response = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  assert.equal(url.origin, 'https://kv.test');
  assert.equal(init.headers?.Authorization, 'Bearer test-token');
  if (url.pathname === '/get/carelink_cloud_v66') {
    if (failReads) return response({ error: 'read unavailable' }, 503);
    return response({ result: kv.has('carelink_cloud_v66') ? kv.get('carelink_cloud_v66') : null });
  }
  if (url.pathname === '/set/carelink_cloud_v66') {
    if (failWrites) return response({ error: 'write unavailable' }, 503);
    const serialized = JSON.parse(init.body);
    assert.equal(typeof serialized, 'string');
    kv.set('carelink_cloud_v66', serialized);
    return response({ result: 'OK' });
  }
  if (url.pathname === '/' && init.method === 'POST') {
    const [op, ...args] = JSON.parse(init.body);
    if (failWrites && !(op === 'EVAL' && args[0] === "return redis.call('GET', KEYS[1])")) return response({ error: 'write unavailable' }, 503);
    if (op === 'SET') {
      const [key, value, ...options] = args;
      if (options.includes('NX') && kv.has(key)) return response({ result: null });
      kv.set(key, String(value));
      return response({ result: 'OK' });
    }
    if (op === 'GET') return response({ result: kv.has(args[0]) ? kv.get(args[0]) : null });
    if (op === 'EVAL') {
      const script = args[0]; const keyCount = Number(args[1]) || 0;
      const key = args[2]; const value = args[2 + keyCount];
      if (failReads && script === "return redis.call('GET', KEYS[1])") return response({ error: 'read unavailable' }, 503);
      if (script.includes('redis.sha1hex')) {
        const actual = kv.has(key) ? requireCrypto.createHash('sha1').update(String(kv.get(key))).digest('hex') : 'missing';
        if (actual !== value) return response({ result: kv.get(key) === String(args[3 + keyCount]) ? 2 : 0 });
        kv.set(key, String(args[3 + keyCount]));
        return response({ result: 1 });
      }
      if (script === "return redis.call('GET', KEYS[1])") return response({ result: kv.has(key) ? kv.get(key) : null });
      if (kv.get(key) !== String(value)) return response({ result: 0 });
      if (/EXPIRE/.test(script)) return response({ result: 1 });
      if (/DEL/.test(script)) { kv.delete(key); return response({ result: 1 }); }
    }
    throw new Error(`Unexpected Redis command: ${op}`);
  }
  throw new Error(`Unexpected KV request: ${url.pathname}`);
};

process.env.KV_REST_API_URL = 'https://kv.test';
process.env.KV_REST_API_TOKEN = 'test-token';
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.OPENAI_API_KEY;

const { default: handler } = await import('../../api/index.js');

async function call(route, { method = 'GET', body, token } = {}) {
  const req = {
    url: `/api/${route}`,
    method,
    headers: { host: 'localhost', ...(token ? { 'x-carelink-session': token } : {}) },
    body: body === undefined ? {} : body,
    on() {},
  };
  let status = 0; let raw = '';
  const res = { set statusCode(v) { status = v; }, get statusCode() { return status; }, setHeader() {}, end(s) { raw = s || ''; } };
  await dispatchWithDeviceCookie(handler,req,res);
  return { status, body: raw ? JSON.parse(raw) : {} };
}

let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const ADMIN_PW = 'Kx9!vQ2#mTz7Lp';

await check('missing mandatory KV fails closed instead of using process/local state', async () => {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  globalThis.__CARELINK_CLOUD__ = { setup: true, rev: 999 };
  const r = await call('health');
  assert.equal(r.status, 503);
  assert.equal(r.body.code, 'kv_required');
  delete globalThis.__CARELINK_CLOUD__;
  process.env.KV_REST_API_URL = url;
  process.env.KV_REST_API_TOKEN = token;
});

await check('KV read outages fail closed and never initialize a fresh installation', async () => {
  failReads = true;
  const r = await call('health');
  failReads = false;
  assert.equal(r.status, 503);
  assert.equal(r.body.code, 'kv_unavailable');
  assert.equal(kv.size, 0);
});

await check('first-run setup succeeds', async () => {
  const r = await call('setup', { method: 'POST', body: {
    admin: { username: 'chief.admin', password: ADMIN_PW, name: 'Chief Admin' },
    db: {
      meta: { schema: 6, label: 'production-test' }, settings: { org: { emailDomain: 'lomamofoundation.org' } }, users: [],
      patients: [
        { id: 'ksm-patient-1', code: 'KSM-1', name: 'Private Kisumu Case', countyId: 'kisumu', areaId: 'nyalenda', demo: false },
        { id: 'hby-patient-2', code: 'HBY-2', name: 'Private Homa Bay Case', countyId: 'homabay', areaId: 'makongeni', demo: false },
        { id: 'other-patient-3', code: 'OTHER-3', name: 'Other County Case', countyId: 'other', areaId: 'elsewhere', demo: false },
      ],
      visits: [
        { id: 'v-ksm-1', patientId: 'ksm-patient-1', countyId: 'kisumu', areaId: 'nyalenda' },
        { id: 'v-hby-2', patientId: 'hby-patient-2', countyId: 'homabay', areaId: 'makongeni' },
      ], pdcas: [], requests: [],
      transactions: [
        { id: 'tx-ksm', patientId: 'ksm-patient-1', requestId: 'req-ksm', countyId: 'kisumu', areaId: 'nyalenda', amount: 100, status: 'paid', note: 'private note' },
        { id: 'tx-hby', patientId: 'hby-patient-2', requestId: 'req-hby', countyId: 'homabay', areaId: 'makongeni', amount: 200, status: 'paid', note: 'private note' },
      ],
      adminOpsPayg: [
        { id: 'payg-ksm', patientId: 'ksm-patient-1', patientLabel: 'Private Kisumu Case', countyId: 'kisumu', amount: 100 },
        { id: 'payg-hby', patientId: 'hby-patient-2', patientLabel: 'Private Homa Bay Case', countyId: 'homabay', amount: 200 },
      ],
      urgentCases: [
        { id: 'urgent-ksm', patientId: 'ksm-patient-1', countyId: 'kisumu', areaId: 'nyalenda', name: 'Private case' },
        { id: 'urgent-hby', patientId: 'hby-patient-2', countyId: 'homabay', areaId: 'makongeni', name: 'Other private case' },
      ],
      waitingList: [
        { id: 'waiting-ksm', name: 'Waiting Kisumu household', countyId: 'kisumu', areaId: 'nyalenda', status: 'waiting' },
        { id: 'waiting-hby', name: 'Waiting Homa Bay household', countyId: 'homabay', areaId: 'makongeni', status: 'waiting' },
      ],
      calendarEvents: [{ id: 'planned-hby', kind: 'planned_visit', title: 'Private planned visit', patientId: 'hby-patient-2', countyId: 'homabay', areaId: 'makongeni', visibleTo: 'all' }],
    },
  } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
});

await check('health reports the mandatory KV driver and committed setup state', async () => {
  const r = await call('health');
  assert.equal(r.status, 200);
  assert.equal(r.body.storageDriver, 'cloud-kv-redis');
  assert.equal(r.body.setup, true);
  assert.equal(r.body.globallyActivated, false);
});

await check('anonymous re-commission is refused', async () => {
  const r = await call('setup', { method: 'POST', body: { forceRecommission: true, admin: { username: 'evil', password: ADMIN_PW } } });
  assert.equal(r.status, 409);
});

await check('global activation needs a chief session', async () => {
  const r = await call('setup/activate-global', { method: 'POST', body: {} });
  assert.equal(r.status, 403);
});

await check('__proto__ is not a valid session token', async () => {
  const r = await call('session/whoami', { token: '__proto__' });
  assert.notEqual(r.status, 200);
});

await check('anonymous credentials listing is refused', async () => {
  const r = await call('credentials');
  assert.ok(r.status === 401 || r.status === 403, `got ${r.status}`);
});

await check('repeated bad logins lock the account', async () => {
  let last;
  for (let i = 0; i < 12; i++) {
    last = await call('auth/login', { method: 'POST', body: { username: 'chief.admin', password: 'wrong-password' } });
  }
  assert.equal(last.status, 429);
  const good = await call('auth/login', { method: 'POST', body: { username: 'chief.admin', password: ADMIN_PW } });
  assert.equal(good.status, 429, 'correct password must not bypass an active lockout');
});

await check('anonymous demo bootstrap is refused on a fresh installation', async () => {
  kv.clear();
  const r = await call('public/demo-bootstrap', {
    method: 'POST',
    body: { db: { meta: { demoSeeded: '2026-10-24T00:00:00.000Z' }, settings: {}, users: [], patients: [] } },
  });
  assert.equal(r.status, 403, JSON.stringify(r.body));
  assert.equal(r.body.code, 'demo_bootstrap_disabled');
  assert.equal(kv.has('carelink_cloud_v66'), false, 'rejected anonymous demo request must not write KV');
  const demoLogin = await call('auth/login', { method: 'POST', body: { username: 'director', password: 'LOMAMO2026' } });
  assert.equal(demoLogin.status, 401, 'the legacy shared demo password cannot authenticate before commissioning');
});

await check('public setup cannot self-declare global activation', async () => {
  const r = await call('setup', {
    method: 'POST',
    body: { globallyActivated: true, admin: { username: 'chief.admin', password: ADMIN_PW }, db: {
      users: [], settings: {}, meta: { label: 'production-test' },
      patients: [
        { id: 'ksm-patient-1', code: 'KSM-1', name: 'Private Kisumu Case', countyId: 'kisumu', areaId: 'nyalenda', demo: false },
        { id: 'hby-patient-2', code: 'HBY-2', name: 'Private Homa Bay Case', countyId: 'homabay', areaId: 'makongeni', demo: false },
        { id: 'other-patient-3', code: 'OTHER-3', name: 'Other County Case', countyId: 'other', areaId: 'elsewhere', demo: false },
      ],
      visits: [
        { id: 'v-ksm-1', patientId: 'ksm-patient-1', countyId: 'kisumu', areaId: 'nyalenda' },
        { id: 'v-hby-2', patientId: 'hby-patient-2', countyId: 'homabay', areaId: 'makongeni' },
      ], pdcas: [], requests: [],
      transactions: [
        { id: 'tx-ksm', patientId: 'ksm-patient-1', requestId: 'req-ksm', countyId: 'kisumu', areaId: 'nyalenda', amount: 100, status: 'paid', note: 'private note' },
        { id: 'tx-hby', patientId: 'hby-patient-2', requestId: 'req-hby', countyId: 'homabay', areaId: 'makongeni', amount: 200, status: 'paid', note: 'private note' },
      ],
      adminOpsPayg: [
        { id: 'payg-ksm', patientId: 'ksm-patient-1', patientLabel: 'Private Kisumu Case', countyId: 'kisumu', amount: 100 },
        { id: 'payg-hby', patientId: 'hby-patient-2', patientLabel: 'Private Homa Bay Case', countyId: 'homabay', amount: 200 },
      ],
      urgentCases: [
        { id: 'urgent-ksm', patientId: 'ksm-patient-1', countyId: 'kisumu', areaId: 'nyalenda', name: 'Private case' },
        { id: 'urgent-hby', patientId: 'hby-patient-2', countyId: 'homabay', areaId: 'makongeni', name: 'Other private case' },
      ],
      waitingList: [
        { id: 'waiting-ksm', name: 'Waiting Kisumu household', countyId: 'kisumu', areaId: 'nyalenda', status: 'waiting' },
        { id: 'waiting-hby', name: 'Waiting Homa Bay household', countyId: 'homabay', areaId: 'makongeni', status: 'waiting' },
      ],
      calendarEvents: [
        { id: 'planned-hby', kind: 'planned_visit', title: 'Private planned visit', patientId: 'hby-patient-2', countyId: 'homabay', areaId: 'makongeni', visibleTo: 'all' },
        { id: 'private-meeting', kind: 'meeting', title: 'Invite-only', meetingUrl: 'https://provider.example/private-room',
        visibleTo: ['u-caregiver-one'], participantUserIds: ['u-caregiver-one'], status: 'scheduled' }],
      messages: [
        { id: 'msg-private', thread: 'dm:u-caregiver-one:u-finance-one', kind: 'direct', from: 'u-caregiver-one', to: ['u-finance-one'], text: 'Private staff message', readBy: ['u-caregiver-one'], at: '2026-10-23T10:00:00.000Z' },
        { id: 'msg-legacy-clinical', thread: 'dm:u-caregiver-one:u-finance-one', kind: 'direct', from: 'u-caregiver-one', to: ['u-finance-one'], text: 'Private Kisumu Case needs urgent review', readBy: [], at: '2026-10-23T10:01:00.000Z' },
        { id: 'msg-forged-legacy', thread: 'dm:u-caregiver-one:u-finance-one', kind: 'direct', from: 'u-caregiver-one', to: ['u-finance-one', 'u-staff-one'], text: 'Misrouted legacy content', readBy: [], at: '2026-10-23T10:02:00.000Z' },
      ],
      notifications: [{ id: 'n-caregiver', userId: 'u-caregiver-one', title: 'Private clinical alert', body: 'Nyalenda case requires review', kind: 'warn', read: false }],
      teamCalls: [
        /* A legitimate invitation between two Kisumu colleagues. */
        { id: 'call-legit', thread: 'dm:u-caregiver-one:u-finance-one', kind: 'audio', state: 'ringing',
          callerId: 'u-caregiver-one', callerName: 'Caregiver One', participantIds: ['u-caregiver-one', 'u-finance-one'],
          createdAt: new Date().toISOString(), signal: { offer: 'legit-offer', callerCandidates: [] } },
        /* A record that names an extra participant nobody may reach. */
        { id: 'call-widened', thread: 'dm:u-caregiver-one:u-finance-one', kind: 'audio', state: 'ringing',
          callerId: 'u-caregiver-one', participantIds: ['u-caregiver-one', 'u-finance-one', 'u-staff-one'],
          createdAt: new Date().toISOString(), signal: {} },
        /* A record between two other people: a third party may never see it. */
        { id: 'call-other-pair', thread: 'dm:u-staff-one:u-mcm-kisumu', kind: 'video', state: 'ringing',
          callerId: 'u-staff-one', participantIds: ['u-staff-one', 'u-mcm-kisumu'],
          createdAt: new Date().toISOString(), signal: { offer: 'other-offer' } },
      ],
    } },
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const health = await call('health');
  assert.equal(health.body.globallyActivated, false);
});

const issuedPasswords=new Map();
async function personalLogin(username){
  const password=issuedPasswords.get(username);
  const login=await call('auth/login',{method:'POST',body:{username,password}});
  assert.equal(login.status,200,JSON.stringify(login.body));
  if(login.body.passwordBeforeWorkspace){
    const next='Private#2027!'+requireCrypto.createHash('sha256').update(username).digest('hex').slice(0,8);
    const change=await call('auth/change-password',{method:'POST',token:login.body.token,body:{current:password,password:next}});
    assert.equal(change.status,200,JSON.stringify(change.body));issuedPasswords.set(username,next);
  }
  return login;
}
let chiefToken = '';
let staffToken = '';
let caregiverToken = '';
await check('anonymous demo bootstrap remains disabled once the installation is commissioned', async () => {
  const before = kv.get('carelink_cloud_v66');
  const r = await call('public/demo-bootstrap', {
    method: 'POST',
    body: { db: { meta: { demoSeeded: 'replacement' }, users: [], patients: [] } },
  });
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'demo_bootstrap_disabled');
  assert.equal(kv.get('carelink_cloud_v66'), before, 'a refused demo request must not write KV');
  const login = await call('auth/login', { method: 'POST', body: { username: 'chief.admin', password: ADMIN_PW } });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  chiefToken = login.body.token;
});

await check('ordinary patches cannot self-activate or publish activation deltas', async () => {
  const r = await call('state', {
    method: 'PUT',
    token: chiefToken,
    body: { patches: [{ c: 'settings', id: 'settings', set: { value: { globallyActivated: true, demoDisabled: true, theme: 'heritage' } } }] },
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const stored = JSON.parse(kv.get('carelink_cloud_v66'));
  assert.equal(stored.globallyActivated, false);
  assert.equal(stored.db.settings.globallyActivated, false);
  assert.equal(stored.db.settings.theme, 'heritage');
  const deltaValue = stored.deltas.at(-1).patches[0].set.value;
  assert.equal(Object.hasOwn(deltaValue, 'globallyActivated'), false);
  assert.equal(Object.hasOwn(deltaValue, 'demoDisabled'), false);
});

await check('global activation is committed to top-level and nested authoritative flags', async () => {
  const r = await call('setup/activate-global', {
    method: 'POST',
    token: chiefToken,
    body: {
      settings: { globallyActivated: false }, meta: { globallyActivated: false, demoDisabled: false },
      users: [
        { id: 'u-staff-one', username: 'staff.one', name: 'Staff One', roleId: 'me', countyId: 'kisumu', status: 'pending_activation', active: true },
        { id: 'u-caregiver-one', username: 'caregiver.one', name: 'Caregiver One', roleId: 'caregiver', countyId: 'kisumu', areaIds: ['nyalenda'], status: 'pending_activation', active: true },
        { id: 'u-finance-one', username: 'finance.one', name: 'Finance One', roleId: 'finance', countyId: 'kisumu', status: 'pending_activation', active: true },
        { id: 'u-mcm-kisumu', username: 'mcm.kisumu', name: 'Lead MCM', roleId: 'mcm', countyId: 'kisumu', status: 'pending_activation', active: true },
        { id: 'u-mcm-homabay', username: 'mcm.localtest', name: 'Homa Bay MCM', roleId: 'mcm', countyId: 'homabay', status: 'pending_activation', active: true },
      ],
      accounts: [
        { id: 'u-staff-one', username: 'staff.one', name: 'Staff One', roleId: 'me', countyId: 'kisumu', password: 'TempStaff#2026!' },
        { id: 'u-caregiver-one', username: 'caregiver.one', name: 'Caregiver One', roleId: 'caregiver', countyId: 'kisumu', password: 'TempCaregiver#2026!' },
        { id: 'u-finance-one', username: 'finance.one', name: 'Finance One', roleId: 'finance', countyId: 'kisumu', password: 'TempFinance#2026!' },
        { id: 'u-mcm-kisumu', username: 'mcm.kisumu', name: 'Lead MCM', roleId: 'mcm', countyId: 'kisumu', password: 'TempLeadMcm#2026!' },
        { id: 'u-mcm-homabay', username: 'mcm.localtest', name: 'Homa Bay MCM', roleId: 'mcm', countyId: 'homabay', password: 'TempHomaMcm#2026!' },
      ],
    },
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.issued.length, 5);
  r.body.issued.forEach(row=>issuedPasswords.set(row.username,row.password));
  assert.deepEqual(r.body.issued.map((u) => u.username).sort(), ['caregiver.one', 'finance.one', 'mcm.kisumu', 'mcm.localtest', 'staff.one']);
  const health = await call('health');
  assert.equal(health.body.globallyActivated, true);
  const stored = JSON.parse(kv.get('carelink_cloud_v66'));
  assert.equal(stored.globallyActivated, true);
  assert.equal(stored.db.settings.globallyActivated, true);
  assert.equal(stored.db.settings.awaitingGlobalActivation, false);
  assert.equal(stored.db.meta.globallyActivated, true);
  assert.equal(stored.db.meta.demoDisabled, true);
});

await check('globally issued staff credentials work from a fresh online session', async () => {
  const first = await call('auth/login', { method: 'POST', body: { username: 'staff.one', password: issuedPasswords.get('staff.one'), device: 'tablet-test' } });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.mustChange, true);
  const blocked = await call('state', { token: first.body.token });
  assert.equal(blocked.status,403);
  assert.equal(blocked.body.code,'password_change_required');
  const staff = first.body.user;
  assert.ok(staff);
  assert.equal(Object.hasOwn(staff, 'hash'), false);
  assert.equal(Object.hasOwn(staff, 'salt'), false);
  const changed = await call('auth/change-password', {
    method: 'POST', token: first.body.token,
    body: { current: issuedPasswords.get('staff.one'), password: 'PrivateStaff#2027!' },
  });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  const concurrent = await call('auth/login', { method: 'POST', body: { username: 'staff.one', password: 'PrivateStaff#2027!', device: 'pc-test' } });
  assert.equal(concurrent.status, 409, 'A second device must not establish a simultaneous account session');
  assert.equal(concurrent.body.code, 'session_active');
  const signout = await call('auth/logout', { method: 'POST', token: first.body.token });
  assert.equal(signout.status, 200);
  const second = await call('auth/login', { method: 'POST', body: { username: 'staff.one', password: 'PrivateStaff#2027!', device: 'pc-test' } });
  assert.equal(second.status, 200, JSON.stringify(second.body));
  assert.equal(second.body.mustChange, false);
  staffToken = second.body.token;
});

await check('only the Kisumu lead MCM receives two-county clinical oversight', async () => {
  const lead = await personalLogin('mcm.kisumu');
  const local = await personalLogin('mcm.localtest');
  assert.equal(lead.status, 200); assert.equal(local.status, 200);
  const leadState = await call('state', { token: lead.body.token });
  const localState = await call('state', { token: local.body.token });
  assert.deepEqual(leadState.body.db.patients.map(p => p.id).sort(), ['hby-patient-2', 'ksm-patient-1']);
  assert.deepEqual(localState.body.db.patients.map(p => p.id), ['hby-patient-2']);
  assert.deepEqual(leadState.body.db.waitingList.map(p => p.id).sort(), ['waiting-hby', 'waiting-ksm']);
  assert.deepEqual(localState.body.db.waitingList.map(p => p.id), ['waiting-hby']);
  const page = await call('state/collection?name=patients&offset=0', { token: lead.body.token });
  assert.deepEqual(page.body.records.map(p => p.id).sort(), ['hby-patient-2', 'ksm-patient-1']);
  const update = await call('state', { method:'PUT', token: lead.body.token, body:{ patches:[
    { c:'patients', id:'hby-patient-2', set:{ review:'lead reviewed' } },
    { c:'patients', id:'other-patient-3', set:{ review:'outside remit' } },
  ] } });
  assert.equal(update.status, 200);
  assert.equal(update.body.rejected.length, 1);
  assert.equal(update.body.rejected[0].id, 'other-patient-3');
  const localUpdate = await call('state', { method:'PUT', token: local.body.token, body:{ patches:[
    { c:'patients', id:'ksm-patient-1', set:{ review:'outside remit' } },
  ] } });
  assert.equal(localUpdate.body.rejected.length, 1);
  await call('auth/logout', { method:'POST', token:lead.body.token });
  await call('auth/logout', { method:'POST', token:local.body.token });
});

await check('server-side state and paged collection reads deny clinical records to non-clinical M&E roles', async () => {
  const snapshot = await call('state', { token: staffToken });
  assert.equal(snapshot.status, 200);
  assert.deepEqual(snapshot.body.db.patients, []);
  assert.deepEqual(snapshot.body.db.visits, []);
  assert.deepEqual(snapshot.body.db.transactions, []);
  assert.ok(snapshot.body.db.urgentCases.every((c) => !Object.hasOwn(c, 'patientId') && c.name === 'Confidential beneficiary'),
    'M&E may receive aggregate urgent-case costs without patient identifiers or case descriptions');
  assert.deepEqual(snapshot.body.db.waitingList, []);
  assert.deepEqual(snapshot.body.db.messages, [], 'non-participants must not receive private staff messages');
  assert.deepEqual(snapshot.body.db.notifications, [], 'staff receive only their own notifications');
  assert.equal(snapshot.body.db.calendarEvents.some((e) => e.id === 'private-meeting' || e.id === 'planned-hby'), false, 'non-invitees must not receive private meeting links or planned patient visits');
  const deltaState = JSON.parse(kv.get('carelink_cloud_v66'));
  const deltaBaseRev = Number(deltaState.rev) || 0;
  deltaState.rev = deltaBaseRev + 1;
  deltaState.deltas = Array.isArray(deltaState.deltas) ? deltaState.deltas : [];
  deltaState.deltas.push({ rev: deltaState.rev, patches: [{ c: 'calendarEvents', id: 'private-meeting', set: {
    id: 'private-meeting', kind: 'meeting', title: 'Invite-only', meetingUrl: 'https://provider.example/secret-delta', visibleTo: ['u-caregiver-one'],
  } }] });
  kv.set('carelink_cloud_v66', JSON.stringify(deltaState));
  const hiddenDelta = await call(`state?since=${deltaBaseRev}`, { token: staffToken });
  assert.equal(hiddenDelta.body.patches.some((p) => p.id === 'private-meeting'), false, 'non-invitees must not receive meeting links through deltas');
  const page = await call('state/collection?name=patients&offset=0', { token: staffToken });
  assert.equal(page.status, 200);
  assert.deepEqual(page.body.records, []);
  assert.equal(page.body.total, 0);
});

await check('finance receives county-limited accounting data with patient fields redacted and can only update financial fields', async () => {
  const login = await personalLogin('finance.one');
  assert.equal(login.status, 200, JSON.stringify(login.body));
  const financeToken = login.body.token;
  const snapshot = await call('state', { token: financeToken });
  assert.deepEqual(snapshot.body.db.transactions.map((t) => t.id), ['tx-ksm']);
  assert.equal(Object.hasOwn(snapshot.body.db.transactions[0], 'patientId'), false);
  assert.equal(Object.hasOwn(snapshot.body.db.transactions[0], 'requestId'), false);
  assert.equal(Object.hasOwn(snapshot.body.db.transactions[0], 'note'), false);
  assert.deepEqual(snapshot.body.db.adminOpsPayg.map((r) => r.id), ['payg-ksm']);
  assert.equal(Object.hasOwn(snapshot.body.db.adminOpsPayg[0], 'patientLabel'), false);
  assert.deepEqual(snapshot.body.db.messages.map((m) => m.id), ['msg-private'], 'finance cannot read legacy chat content naming a patient or messages with forged recipient lists');
  const reconcile = await call('state', { method: 'PUT', token: financeToken, body: { patches: [
    { c: 'transactions', id: 'tx-ksm', set: { status: 'reconciled', reconciledBy: 'u-finance-one' } },
  ] } });
  assert.equal(reconcile.body.rejected.length, 0);
  const hijack = await call('state', { method: 'PUT', token: financeToken, body: { patches: [
    { c: 'transactions', id: 'tx-ksm', set: { patientId: 'hby-patient-2', countyId: 'homabay' } },
  ] } });
  assert.equal(hijack.body.rejected[0].reason, 'clinical_scope_denied');
  await call('auth/logout', { method: 'POST', token: financeToken });
});

await check('meeting invite links are visible only to invitees/managers; non-managers cannot create meetings server-side', async () => {
  const r = await call('state', { method: 'PUT', token: staffToken, body: { patches: [
    { c: 'calendarEvents', id: 'forged-meeting', set: { id: 'forged-meeting', kind: 'meeting', title: 'Private meeting',
      meetingUrl: 'https://provider.example/secret', visibleTo: ['u-staff-one'], governance: { confidentialityAcknowledged: true, approvedProviderAcknowledged: true } } },
  ] } });
  assert.equal(r.status, 200);
  assert.equal(r.body.rejected[0].reason, 'meeting_manager_required');
  const stored = JSON.parse(kv.get('carelink_cloud_v66'));
  assert.equal((stored.db.calendarEvents || []).some((e) => e.id === 'forged-meeting'), false);
});

await check('clinical state is county/area scoped and out-of-scope writes are refused by the API', async () => {
  const login = await personalLogin('caregiver.one');
  assert.equal(login.status, 200, JSON.stringify(login.body));
  caregiverToken = login.body.token;
  const preDemotionPackResponse = await call('state?fast=1', { token: caregiverToken });
  const preDemotionPack = preDemotionPackResponse.body;
  assert.equal(preDemotionPack.fastPack, true);
  assert.equal(preDemotionPack.totalParts, 1);
  const previousScopedDb = JSON.parse(zlib.gunzipSync(Buffer.from(preDemotionPack.part0, 'base64')).toString('utf8')).db;
  assert.deepEqual(previousScopedDb.patients.map((p) => p.id), ['ksm-patient-1']);
  await call('state', { method: 'PUT', token: caregiverToken, body: { patches: [
    { c: 'users', id: 'u-caregiver-one', set: { areaIds: ['nyalenda', 'makongeni'] } },
  ] } });
  const selfProfile = JSON.parse(kv.get('carelink_cloud_v66')).db.users.find((u) => u.id === 'u-caregiver-one');
  assert.deepEqual(selfProfile.areaIds, ['nyalenda'], 'users cannot self-expand the clinical areas used by server authorization');
  const demote = await call('state', { method: 'PUT', token: chiefToken, body: { patches: [
    { c: 'users', id: 'u-caregiver-one', set: { roleId: 'me' } },
  ] } });
  assert.equal(demote.body.rejected.length, 0);
  const revokedSnapshot = await call('state', { token: caregiverToken });
  assert.deepEqual(revokedSnapshot.body.db.patients, [], 'an existing session loses clinical access immediately after an administrator demotes its account');
  const revokedPackResponse = await call(`state?fast=1&targetRev=${preDemotionPack.rev}`, { token: caregiverToken });
  const revokedPack = JSON.parse(zlib.gunzipSync(Buffer.from(revokedPackResponse.body.part0, 'base64')).toString('utf8'));
  assert.deepEqual(revokedPack.db.patients, [], 'fast-pack cache keys change when a role is demoted');
  await call('state', { method: 'PUT', token: chiefToken, body: { patches: [
    { c: 'users', id: 'u-caregiver-one', set: { roleId: 'caregiver' } },
  ] } });
  const snapshot = await call('state', { token: caregiverToken });
  assert.deepEqual(snapshot.body.db.patients.map((p) => p.id), ['ksm-patient-1']);
  assert.deepEqual(snapshot.body.db.visits.map((v) => v.patientId), ['ksm-patient-1']);
  assert.deepEqual(snapshot.body.db.transactions.map((t) => t.id), ['tx-ksm']);
  assert.deepEqual(snapshot.body.db.urgentCases.map((c) => c.id), ['urgent-ksm']);
  assert.deepEqual(snapshot.body.db.waitingList.map((w) => w.id), ['waiting-ksm']);
  assert.equal(snapshot.body.db.calendarEvents.some((e) => e.id === 'planned-hby'), false, 'caregiver cannot receive an out-of-area planned visit');
  assert.equal(snapshot.body.db.calendarEvents.some((e) => e.id === 'private-meeting'), true, 'invited participants may receive their meeting link');
  assert.equal(snapshot.body.db.messages.some((m) => m.id === 'msg-private'), true, 'participants may see their private thread');
  assert.equal(snapshot.body.db.messages.some((m) => m.id === 'msg-legacy-clinical'), true, 'clinical recipients may see legacy clinical content within their patient scope');
  assert.equal(snapshot.body.db.notifications.some((n) => n.id === 'n-caregiver'), true, 'recipient receives their own clinical alert');
  const page = await call('state/collection?name=patients&offset=0', { token: caregiverToken });
  assert.deepEqual(page.body.records.map((p) => p.id), ['ksm-patient-1']);
  assert.equal(page.body.total, 1);
  const forgedBroadcast = await call('state', { method: 'PUT', token: caregiverToken, body: { patches: [
    { c: 'messages', id: 'msg-forged-broadcast', set: { id: 'msg-forged-broadcast', thread: 'global:all', kind: 'global',
      from: 'u-caregiver-one', to: ['u-staff-one'], text: 'Only one chosen recipient', readBy: ['u-caregiver-one'] } },
  ] } });
  assert.equal(forgedBroadcast.body.rejected[0].reason, 'message_scope_denied', 'sender cannot forge a broadcast recipient list');
  const patientNameMessage = await call('state', { method: 'PUT', token: caregiverToken, body: { patches: [
    { c: 'messages', id: 'msg-patient-name', set: { id: 'msg-patient-name', thread: 'dm:u-caregiver-one:u-finance-one', kind: 'direct',
      from: 'u-caregiver-one', to: ['u-finance-one'], text: 'Private Kisumu Case needs a review', readBy: ['u-caregiver-one'] } },
  ] } });
  assert.equal(patientNameMessage.body.rejected[0].reason, 'message_scope_denied', 'server blocks patient-identifying content in chat');
  const validMessage = await call('state', { method: 'PUT', token: caregiverToken, body: { patches: [
    { c: 'messages', id: 'msg-valid-direct', set: { id: 'msg-valid-direct', thread: 'dm:u-caregiver-one:u-finance-one', kind: 'direct',
      from: 'u-caregiver-one', to: ['u-finance-one'], text: 'Please confirm the meeting time.', readBy: ['u-caregiver-one'] } },
  ] } });
  assert.equal(validMessage.body.rejected.length, 0, JSON.stringify(validMessage.body.rejected));
  const storedMessageState = JSON.parse(kv.get('carelink_cloud_v66'));
  assert.ok(storedMessageState.db.messages.some((m) => m.id === 'msg-valid-direct'), 'the server stores a validated message for its participants');
  const sentAudit = (storedMessageState.audit || []).some((a) => a.action === 'message.sent' && a.entityId === 'msg-valid-direct');
  assert.equal(sentAudit, true, 'accepted messages generate a server-side audit record');
  const unsafeNotification = await call('state', { method: 'PUT', token: caregiverToken, body: { patches: [
    { c: 'notifications', id: 'n-forged-clinical', set: { id: 'n-forged-clinical', userId: 'u-finance-one', title: 'Private Kisumu Case', body: 'Private Kisumu Case requires clinical review.', kind: 'warn' } },
  ] } });
  assert.equal(unsafeNotification.body.rejected[0].reason, 'notification_scope_denied', 'clinical alerts cannot be routed to a recipient without clinical scope');
  const safeNotification = await call('state', { method: 'PUT', token: caregiverToken, body: { patches: [
    { c: 'notifications', id: 'n-safe', set: { id: 'n-safe', userId: 'u-finance-one', title: 'Meeting reminder', body: 'Please confirm the department meeting time.', kind: 'info' } },
  ] } });
  assert.equal(safeNotification.body.rejected.length, 0);
  const financeLogin = await personalLogin('finance.one');
  const financeMessageView = await call('state', { token: financeLogin.body.token });
  assert.ok(financeMessageView.body.db.messages.some((m) => m.id === 'msg-valid-direct'), 'the notified participant can read the server-authorized message');
  assert.ok(financeMessageView.body.db.notifications.some((n) => n.id === 'n-safe'), 'only the addressed account receives the permitted notification');
  await call('auth/logout', { method: 'POST', token: financeLogin.body.token });
  const denied = await call('state', { method: 'PUT', token: caregiverToken, body: { patches: [
    { c: 'patients', id: 'hby-patient-2', set: { name: 'Attempted cross-county edit' } },
  ] } });
  assert.equal(denied.status, 200);
  assert.equal(denied.body.rejected[0].reason, 'clinical_scope_denied');
  const deniedWaiting = await call('state', { method: 'PUT', token: caregiverToken, body: { patches: [
    { c: 'waitingList', id: 'waiting-hby', set: { name: 'Cross-county waiting-list edit' } },
  ] } });
  assert.equal(deniedWaiting.body.rejected[0].reason, 'clinical_scope_denied');
  const deniedPlannedVisit = await call('state', { method: 'PUT', token: caregiverToken, body: { patches: [
    { c: 'calendarEvents', id: 'planned-hby', set: { title: 'Cross-county calendar edit' } },
  ] } });
  assert.equal(deniedPlannedVisit.body.rejected[0].reason, 'clinical_scope_denied');
  const forgedBefore = await call('state', { method: 'PUT', token: caregiverToken, body: { patches: [
    { c: 'visits', id: 'v-hby-2', before: { patientId: 'ksm-patient-1' }, set: { note: 'Forged merge metadata' } },
  ] } });
  assert.equal(forgedBefore.body.rejected[0].reason, 'clinical_scope_denied', 'client-provided before metadata cannot grant clinical access');
  const moveForeignPatient = await call('state', { method: 'PUT', token: caregiverToken, body: { patches: [
    { c: 'patients', id: 'hby-patient-2', set: { countyId: 'kisumu', areaId: 'nyalenda', name: 'Moved into scope' } },
  ] } });
  assert.equal(moveForeignPatient.body.rejected[0].reason, 'clinical_scope_denied', 'out-of-scope patient cannot be reassigned into caregiver scope');
  const stored = JSON.parse(kv.get('carelink_cloud_v66'));
  assert.equal(stored.db.patients.find((p) => p.id === 'hby-patient-2').name, 'Private Homa Bay Case');
  assert.equal(stored.db.visits.find((v) => v.id === 'v-hby-2').note, undefined);
});

await check('repeated activation preserves private staff passwords instead of issuing a false replacement sheet', async () => {
  const r = await call('setup/activate-global', {
    method: 'POST', token: chiefToken,
    body: {
      users: [
        { id: 'u-chief-admin', username: 'chief.admin', roleId: 'chief', status: 'active' },
        { id: 'u-staff-one', username: 'staff.one', roleId: 'me', status: 'pending_activation', mustChange: true },
      ],
      accounts: [{ id: 'u-staff-one', username: 'staff.one', roleId: 'me', password: 'ReplacementTemp#2028!' }],
    },
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.issued.length, 0);
  assert.deepEqual(r.body.preserved, ['staff.one']);
  const denied = await call('auth/login', { method: 'POST', body: { username: 'staff.one', password: 'PrivateStaff#2027!' } });
  assert.equal(denied.status, 409, 'Reissued temp credentials must not let a second device bypass the active session');
  const signedOut = await call('auth/logout', { method: 'POST', token: staffToken });
  assert.equal(signedOut.status, 200);
  const login = await call('auth/login', { method: 'POST', body: { username: 'staff.one', password: 'PrivateStaff#2027!' } });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  assert.equal(login.body.mustChange, false);
  staffToken = login.body.token;
  const state = await call('state', { token: chiefToken });
  assert.equal(state.body.db.users.find((u) => u.username === 'staff.one').mustChange, false);
});

await check('parallel account sign-ins create one atomic winner and one active-session denial', async () => {
  const previousLogout = await call('auth/logout', { method: 'POST', token: staffToken });
  assert.equal(previousLogout.status, 200);
  const [a, b] = await Promise.all([
    call('auth/login', { method: 'POST', body: { username: 'staff.one', password: 'PrivateStaff#2027!', loginAttemptId: 'parallel-device-a-2026' } }),
    call('auth/login', { method: 'POST', body: { username: 'staff.one', password: 'PrivateStaff#2027!', loginAttemptId: 'parallel-device-b-2026' } }),
  ]);
  const outcomes = [a, b].sort((x, y) => x.status - y.status);
  assert.equal(outcomes[0].status, 200, 'Exactly one parallel login must acquire the lease');
  assert.equal(outcomes[1].status, 409, 'The competing parallel login must be refused');
  assert.equal(outcomes[1].body.code, 'session_active');
  const winner = outcomes[0];
  const beat = await call('session/beat', { method: 'POST', token: winner.body.token });
  assert.equal(beat.status, 200, JSON.stringify(beat.body));
  assert.ok(beat.body.token, 'Heartbeat must refresh a token while retaining its stable account lease');
  const other = await call('auth/login', { method: 'POST', body: { username: 'staff.one', password: 'PrivateStaff#2027!' } });
  assert.equal(other.status, 409, 'Heartbeat renewal must keep the second-device lock active');
  const released = await call('auth/logout', { method: 'POST', token: beat.body.token });
  assert.equal(released.status, 200);
  const attempt = 'replayed-network-attempt-2026';
  const original = await call('auth/login', { method: 'POST', body: { username: 'staff.one', password: 'PrivateStaff#2027!', loginAttemptId: attempt } });
  const retry = await call('auth/login', { method: 'POST', body: { username: 'staff.one', password: 'PrivateStaff#2027!', loginAttemptId: attempt } });
  assert.equal(original.status, 200);
  assert.equal(retry.status, 200, 'A retried request with its original random attempt ID can recover a lost response');
  const unrelated = await call('auth/login', { method: 'POST', body: { username: 'staff.one', password: 'PrivateStaff#2027!' } });
  assert.equal(unrelated.status, 409, 'A separate login attempt remains blocked even while an idempotent retry is accepted');
  const retryLogout = await call('auth/logout', { method: 'POST', token: retry.body.token });
  assert.equal(retryLogout.status, 200);
});

await check('anonymous demo bootstrap is permanently refused after global activation', async () => {
  const before = kv.get('carelink_cloud_v66');
  const r = await call('public/demo-bootstrap', {
    method: 'POST',
    body: { db: { meta: { demoSeeded: 'post-activation-demo' }, users: [], patients: [] } },
  });
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'demo_bootstrap_disabled');
  assert.equal(kv.get('carelink_cloud_v66'), before);
  const setup = await call('setup', {
    method: 'POST',
    token: chiefToken,
    body: { forceRecommission: true, admin: { username: 'chief.admin', password: ADMIN_PW } },
  });
  assert.equal(setup.status, 409);
  assert.equal(setup.body.code, 'globally_activated');
});

await check('ordinary settings patches cannot reopen demo mode', async () => {
  const r = await call('state', {
    method: 'PUT',
    token: chiefToken,
    body: { patches: [{ c: 'settings', id: 'settings', set: { value: { globallyActivated: false, awaitingGlobalActivation: true, theme: 'foundation' } } }] },
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const stored = JSON.parse(kv.get('carelink_cloud_v66'));
  assert.equal(stored.db.settings.globallyActivated, true);
  assert.equal(stored.db.settings.awaitingGlobalActivation, false);
  assert.equal(stored.db.settings.theme, 'foundation');
  assert.equal(stored.deltas.at(-1).patches[0].set.value.globallyActivated, true, 'published deltas must be sanitized too');
});

await check('KV write failures return 503 and are never acknowledged as saves', async () => {
  const before = kv.get('carelink_cloud_v66');
  failWrites = true;
  const r = await call('public/account-request', { method: 'POST', body: { name: 'Test User', countyId: 'kisumu' } });
  failWrites = false;
  assert.equal(r.status, 503);
  assert.equal(r.body.code, 'kv_write_failed');
  assert.equal(kv.get('carelink_cloud_v66'), before);
});

/* The earlier session tests deliberately end every lease; open one for the
   calling checks and close it again afterwards. */
let callStaffToken = '';
let callCaregiverToken = '';
await check('a calling session can be opened for the coordination checks', async () => {
  const staff = await call('auth/login', { method: 'POST', body: { username: 'staff.one', password: 'PrivateStaff#2027!' } });
  assert.equal(staff.status, 200, JSON.stringify(staff.body));
  callStaffToken = staff.body.token;
  /* One live session per account: the earlier clinical session is closed first. */
  await call('auth/logout', { method: 'POST', token: caregiverToken });
});

await check('a call invitation can only ring the people the server says are in that thread', async () => {
  const forged = await call('state', { method: 'PUT', token: callStaffToken, body: { patches: [
    { c: 'teamCalls', id: 'call-forged', set: { id: 'call-forged', thread: 'dm:u-caregiver-one:u-finance-one',
      kind: 'video', state: 'ringing', callerId: 'u-staff-one', participantIds: ['u-staff-one', 'u-caregiver-one', 'u-mcm-kisumu'],
      createdAt: new Date().toISOString(), signal: {} } },
  ] } });
  assert.equal(forged.status, 200, JSON.stringify(forged.body));
  assert.equal(forged.body.rejected[0].reason, 'call_scope_denied');
  assert.equal(JSON.parse(kv.get('carelink_cloud_v66')).db.teamCalls.some((c) => c.id === 'call-forged'), false);
  /* The audience is taken from the thread, so the caller's own list is refused. */
  const spoofed = await call('state', { method: 'PUT', token: callStaffToken, body: { patches: [
    { c: 'teamCalls', id: 'call-spoofed', set: { id: 'call-spoofed', thread: 'dm:u-staff-one:u-caregiver-one',
      kind: 'audio', state: 'ringing', callerId: 'u-staff-one', participantIds: ['u-staff-one', 'u-finance-one'],
      createdAt: new Date().toISOString(), signal: {} } },
  ] } });
  assert.equal(spoofed.body.rejected[0].reason, 'call_scope_denied');
});

await check('call records are readable and writable only by their two sides', async () => {
  const guest = await personalLogin('caregiver.one');
  assert.equal(guest.status, 200, JSON.stringify(guest.body));
  callCaregiverToken = guest.body.token;
  const snapshot = await call('state', { token: callCaregiverToken });
  const ids = (snapshot.body.db.teamCalls || []).map((c) => c.id);

  assert.equal(ids.includes('call-legit'), true, 'the invited participant receives the invitation');
  assert.equal(ids.includes('call-other-pair'), false, 'a third party never receives someone else\'s call');
  assert.equal(ids.includes('call-widened'), false, 'a record that widens its own audience is never served');
  assert.equal(JSON.stringify(snapshot.body.db.teamCalls.find((c) => c.id === 'call-legit').signal).includes('legit-offer'), true,
    'the handshake reaches the invited participant so the call can connect');
  const outsider = await call('state', { method: 'PUT', token: callStaffToken, body: { patches: [
    { c: 'teamCalls', id: 'call-legit', set: { state: 'ended', endedBy: 'u-staff-one' } },
  ] } });
  assert.equal(outsider.body.rejected[0].reason, 'call_scope_denied');
  const rewrite = await call('state', { method: 'PUT', token: callCaregiverToken, body: { patches: [
    { c: 'teamCalls', id: 'call-legit', set: { participantIds: ['u-caregiver-one', 'u-mcm-kisumu'] } },
  ] } });
  assert.equal(rewrite.body.rejected[0].reason, 'call_scope_denied', 'nobody may rewrite who took part');
  const answered = await call('state', { method: 'PUT', token: callCaregiverToken, body: { patches: [
    { c: 'teamCalls', id: 'call-legit', set: {
      state: 'accepted',
      answeredBy: ['u-finance-one'],
      signal: { offer: 'legit-offer', answer: 'legit-answer', callerCandidates: [], calleeCandidates: ['cand-1'] },
    } },
  ] } });
  assert.equal(answered.body.rejected.length, 0, JSON.stringify(answered.body));
  const stored = JSON.parse(kv.get('carelink_cloud_v66')).db.teamCalls.find((c) => c.id === 'call-legit');
  assert.equal(stored.signal.offer, 'legit-offer', 'answering never overwrites the caller half of the handshake');
  assert.equal(stored.signal.answer, 'legit-answer');
  assert.deepEqual(stored.signal.calleeCandidates, ['cand-1']);
  const deltas = await call('state?since=1', { token: callCaregiverToken });
  const leaked = JSON.stringify(deltas.body.patches || []).includes('call-other-pair');
  assert.equal(leaked, false, 'live deltas never leak another pair\'s call');
  await call('auth/logout', { method: 'POST', token: callCaregiverToken });
  await call('auth/logout', { method: 'POST', token: callStaffToken });
});

console.log(`api-security: ${passed} checks passed`);
