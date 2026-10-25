import assert from 'node:assert/strict';

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
  if (url.pathname === '/get/carelink_cloud_v64') {
    if (failReads) return response({ error: 'read unavailable' }, 503);
    return response({ result: kv.has('carelink_cloud_v64') ? kv.get('carelink_cloud_v64') : null });
  }
  if (url.pathname === '/set/carelink_cloud_v64') {
    if (failWrites) return response({ error: 'write unavailable' }, 503);
    const serialized = JSON.parse(init.body);
    assert.equal(typeof serialized, 'string');
    kv.set('carelink_cloud_v64', serialized);
    return response({ result: 'OK' });
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
  await handler(req, res);
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
  const r = await call('setup', { method: 'POST', body: { admin: { username: 'chief.admin', password: ADMIN_PW } } });
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

await check('demo bootstrap works only on a fresh evaluation installation', async () => {
  kv.clear();
  const r = await call('public/demo-bootstrap', {
    method: 'POST',
    body: { db: { meta: { demoSeeded: '2026-10-24T00:00:00.000Z' }, settings: {}, users: [], patients: [] } },
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.demo, true);
  const health = await call('health');
  assert.equal(health.body.setup, false);
  assert.equal(health.body.globallyActivated, false);
});

await check('public setup cannot self-declare global activation', async () => {
  const r = await call('setup', {
    method: 'POST',
    body: { globallyActivated: true, admin: { username: 'chief.admin', password: ADMIN_PW }, db: { users: [], settings: {}, meta: {} } },
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const health = await call('health');
  assert.equal(health.body.globallyActivated, false);
});

let chiefToken = '';
await check('demo bootstrap is locked once the installation is commissioned', async () => {
  const before = kv.get('carelink_cloud_v64');
  const r = await call('public/demo-bootstrap', {
    method: 'POST',
    body: { db: { meta: { demoSeeded: 'replacement' }, users: [], patients: [] } },
  });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'demo_bootstrap_locked');
  assert.equal(kv.get('carelink_cloud_v64'), before, 'a refused demo request must not write KV');
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
  const stored = JSON.parse(kv.get('carelink_cloud_v64'));
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
      users: [{ id: 'u-staff-one', username: 'staff.one', name: 'Staff One', roleId: 'me', status: 'pending_activation', active: true }],
      accounts: [{ id: 'u-staff-one', username: 'staff.one', name: 'Staff One', roleId: 'me', password: 'TempStaff#2026!' }],
    },
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.issued.length, 1);
  assert.equal(r.body.issued[0].username, 'staff.one');
  const health = await call('health');
  assert.equal(health.body.globallyActivated, true);
  const stored = JSON.parse(kv.get('carelink_cloud_v64'));
  assert.equal(stored.globallyActivated, true);
  assert.equal(stored.db.settings.globallyActivated, true);
  assert.equal(stored.db.settings.awaitingGlobalActivation, false);
  assert.equal(stored.db.meta.globallyActivated, true);
  assert.equal(stored.db.meta.demoDisabled, true);
});

await check('globally issued staff credentials work from a fresh online session', async () => {
  const first = await call('auth/login', { method: 'POST', body: { username: 'staff.one', password: 'TempStaff#2026!', device: 'tablet-test' } });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.mustChange, true);
  const state = await call('state', { token: first.body.token });
  assert.equal(state.status, 200, JSON.stringify(state.body));
  const staff = state.body.db.users.find((u) => u.username === 'staff.one');
  assert.ok(staff);
  assert.equal(Object.hasOwn(staff, 'hash'), false);
  assert.equal(Object.hasOwn(staff, 'salt'), false);
  const changed = await call('auth/change-password', {
    method: 'POST', token: first.body.token,
    body: { current: 'TempStaff#2026!', password: 'PrivateStaff#2027!' },
  });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  const second = await call('auth/login', { method: 'POST', body: { username: 'staff.one', password: 'PrivateStaff#2027!', device: 'pc-test' } });
  assert.equal(second.status, 200, JSON.stringify(second.body));
  assert.equal(second.body.mustChange, false);
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
  const login = await call('auth/login', { method: 'POST', body: { username: 'staff.one', password: 'PrivateStaff#2027!' } });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  assert.equal(login.body.mustChange, false);
  const state = await call('state', { token: chiefToken });
  assert.equal(state.body.db.users.find((u) => u.username === 'staff.one').mustChange, false);
});

await check('demo bootstrap is permanently refused after global activation', async () => {
  const before = kv.get('carelink_cloud_v64');
  const r = await call('public/demo-bootstrap', {
    method: 'POST',
    body: { db: { meta: { demoSeeded: 'post-activation-demo' }, users: [], patients: [] } },
  });
  assert.equal(r.status, 403);
  assert.equal(r.body.reason, 'globally_activated');
  assert.equal(kv.get('carelink_cloud_v64'), before);
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
  const stored = JSON.parse(kv.get('carelink_cloud_v64'));
  assert.equal(stored.db.settings.globallyActivated, true);
  assert.equal(stored.db.settings.awaitingGlobalActivation, false);
  assert.equal(stored.db.settings.theme, 'foundation');
  assert.equal(stored.deltas.at(-1).patches[0].set.value.globallyActivated, true, 'published deltas must be sanitized too');
});

await check('KV write failures return 503 and are never acknowledged as saves', async () => {
  const before = kv.get('carelink_cloud_v64');
  failWrites = true;
  const r = await call('public/account-request', { method: 'POST', body: { name: 'Test User', countyId: 'kisumu' } });
  failWrites = false;
  assert.equal(r.status, 503);
  assert.equal(r.body.code, 'kv_write_failed');
  assert.equal(kv.get('carelink_cloud_v64'), before);
});

console.log(`api-security: ${passed} checks passed`);
