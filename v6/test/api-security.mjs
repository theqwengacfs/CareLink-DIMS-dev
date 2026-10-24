import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const tmp = path.join(os.tmpdir(), `carelink-api-test-${process.pid}.json`);
process.env.CARELINK_CLOUD_FILE = tmp;
delete process.env.KV_REST_API_URL;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.OPENAI_API_KEY;
try { fs.unlinkSync(tmp); } catch {}

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

await check('first-run setup succeeds', async () => {
  const r = await call('setup', { method: 'POST', body: { admin: { username: 'chief.admin', password: ADMIN_PW } } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
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

try { fs.unlinkSync(tmp); } catch {}
console.log(`api-security: ${passed} checks passed`);
