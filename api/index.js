/* ============================================================
   CareLink C-DIMS v6.4 — Unified Online Site Database, First-Run
   Commissioning Vault & Shared Online Intelligence Engine
   ------------------------------------------------------------
   Vercel / Cloud Serverless Handler (/api/*)
   - Hosts ONE shared online database for all users & accounts.
   - Stores passwords ONLY as PBKDF2-HMAC-SHA256 salted hashes;
     browser clients never receive password hashes from the cloud.
   - Enforces First-Run Chief System Administrator setup, unique
     strong SMS credential generation, first-login privacy password
     replacement, Chief System Admin silent override audit logging,
     and Shared Online Intelligence across all accounts.
   ============================================================ */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const CLOUD_FILE = process.env.CARELINK_CLOUD_FILE || '/tmp/carelink-online-db-v64.json';
const PBKDF2_ROUNDS = 160000;
const IDLE_SECONDS = 1800;

function nowISO() {
  return new Date().toISOString();
}

function sha256Hex(str) {
  return crypto.createHash('sha256').update(String(str)).digest('hex');
}

function hashPassword(password, saltHex) {
  const salt = saltHex || crypto.randomBytes(16).toString('hex');
  const digest = crypto.pbkdf2Sync(String(password), Buffer.from(salt, 'hex'), PBKDF2_ROUNDS, 32, 'sha256').toString('hex');
  return { salt, digest };
}

function verifyPassword(password, saltHex, expectedHex) {
  if (!saltHex || !expectedHex) return false;
  try {
    const actual = crypto.pbkdf2Sync(String(password), Buffer.from(saltHex, 'hex'), PBKDF2_ROUNDS, 32, 'sha256');
    const exp = Buffer.from(expectedHex, 'hex');
    return actual.length === exp.length && crypto.timingSafeEqual(actual, exp);
  } catch {
    return false;
  }
}

function generateStrongPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const syms = '!@#$%&*+?';
  const all = upper + lower + digits + syms;
  const pick = (pool) => pool[crypto.randomInt(0, pool.length)];
  const chars = [
    pick(upper), pick(upper),
    pick(lower), pick(lower), pick(lower),
    pick(digits), pick(digits), pick(digits),
    pick(syms), pick(syms),
  ];
  while (chars.length < 14) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function validatePrivacyPassword(pw, username = '', previousPw = '') {
  const s = String(pw || '');
  if (s.length < 12) return 'Password must be at least 12 characters long under CareLink data-protection policy.';
  if (!/[A-Z]/.test(s)) return 'Include at least one uppercase letter (A–Z).';
  if (!/[a-z]/.test(s)) return 'Include at least one lowercase letter (a–z).';
  if (!/[0-9]/.test(s)) return 'Include at least one digit (0–9).';
  if (!/[^A-Za-z0-9]/.test(s)) return 'Include at least one special character (e.g. ! @ # $ % & *).';
  const low = s.toLowerCase();
  if (username && low.includes(String(username).toLowerCase())) return 'Password must not contain your username.';
  if (/(lomamo|carelink|password|123456|qwerty)/i.test(s)) return 'Choose a private password that does not contain organisation or common words.';
  if (previousPw && s === previousPw) return 'Your new private password must be different from the temporary SMS password.';
  return null;
}

function kvConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
  return url && token ? { url: url.replace(/\/+$/, ''), token } : null;
}

function blankStore() {
  return {
    setup: false,
    rev: 0,
    saved: null,
    org: { name: 'LOMAMO Foundation Kenya', county: 'kisumu', shortName: 'CareLink' },
    db: null,
    creds: {},       // username -> { id, username, name, roleId, salt, digest, mustChange, updatedAt }
    sessions: {},    // token -> { username, userId, roleId, createdAt, lastSeen }
    deltas: [],      // [{ rev, at, patches }]
    mergeJournal: [],
    audit: [],
    activations: [],
    emergencies: [],
    accountRequests: [],
  };
}

async function loadCloudState() {
  const kv = kvConfig();
  if (kv) {
    try {
      const r = await fetch(`${kv.url}/get/carelink_cloud_v64`, {
        headers: { Authorization: `Bearer ${kv.token}` },
      });
      if (r.ok) {
        const j = await r.json();
        if (j && j.result) {
          const parsed = typeof j.result === 'string' ? JSON.parse(j.result) : j.result;
          globalThis.__CARELINK_CLOUD__ = parsed;
          return { state: parsed, driver: 'cloud-kv-redis' };
        }
      }
    } catch {
      /* fall through to warm/disk cache */
    }
  }
  if (globalThis.__CARELINK_CLOUD__) {
    return { state: globalThis.__CARELINK_CLOUD__, driver: 'cloud-memory+tmp' };
  }
  try {
    if (fs.existsSync(CLOUD_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(CLOUD_FILE, 'utf8'));
      globalThis.__CARELINK_CLOUD__ = parsed;
      return { state: parsed, driver: 'cloud-memory+tmp' };
    }
  } catch {
    /* initialize fresh */
  }
  const fresh = blankStore();
  globalThis.__CARELINK_CLOUD__ = fresh;
  return { state: fresh, driver: kv ? 'cloud-kv-redis' : 'cloud-memory+tmp' };
}

async function saveCloudState(state) {
  state.saved = nowISO();
  globalThis.__CARELINK_CLOUD__ = state;
  try {
    fs.mkdirSync(path.dirname(CLOUD_FILE), { recursive: true });
    fs.writeFileSync(CLOUD_FILE, JSON.stringify(state));
  } catch {
    /* read-only fs fallback uses warm memory + KV */
  }
  const kv = kvConfig();
  if (kv) {
    try {
      await fetch(`${kv.url}/set/carelink_cloud_v64`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${kv.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(JSON.stringify(state)),
      });
    } catch {
      /* local/tmp copy already persisted */
    }
  }
}

function appendServerAudit(state, actor, action, entity, entityId, detail, meta = {}) {
  state.audit = state.audit || [];
  const prevHash = state.audit.length ? state.audit[state.audit.length - 1].hash : 'GENESIS';
  const entry = {
    seq: state.audit.length + 1,
    ts: nowISO(),
    actor: actor || 'system',
    action,
    entity: entity || '-',
    entityId: entityId || '-',
    detail: detail || '',
    meta,
    prevHash,
  };
  entry.hash = sha256Hex(`${entry.seq}|${entry.ts}|${entry.actor}|${entry.action}|${entry.entity}|${entry.entityId}|${entry.detail}|${entry.prevHash}`).slice(0, 16);
  state.audit.push(entry);
  if (state.audit.length > 5000) state.audit.splice(0, state.audit.length - 5000);
  if (state.db && Array.isArray(state.db.audit)) {
    state.db.audit.push(entry);
    if (state.db.audit.length > 5000) state.db.audit.splice(0, state.db.audit.length - 5000);
  }
  return entry;
}

function sanitizeDbForClient(db) {
  if (!db || typeof db !== 'object') return db;
  const copy = { ...db };
  if (Array.isArray(db.users)) {
    copy.users = db.users.map((u) => {
      const clean = { ...u };
      delete clean.hash;
      delete clean.salt;
      return clean;
    });
  }
  return copy;
}

function getSession(state, req) {
  const tok = req.headers['x-carelink-session'] || '';
  if (!tok || !state.sessions || !state.sessions[tok]) return null;
  const s = state.sessions[tok];
  const age = (Date.now() - new Date(s.lastSeen || s.createdAt).getTime()) / 1000;
  if (age > IDLE_SECONDS) {
    delete state.sessions[tok];
    return null;
  }
  s.lastSeen = nowISO();
  return { token: tok, ...s };
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.trim()) {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.end(JSON.stringify(payload));
}

/* Shared Online Intelligence responder grounded in live online DB */
async function answerOnlineIntelligence(state, session, body) {
  const prompt = String(body.prompt || body.message || '').trim();
  const db = state.db || {};
  const user = (db.users || []).find((u) => u.username === (session?.username || '')) || body.userContext || {};
  const countyId = user.countyId || 'kisumu';
  const isGlobalScope = ['chief', 'director', 'president', 'program.admin', 'auditor', 'intldata', 'it'].includes(user.roleId);
  const patients = (db.patients || []).filter((p) => isGlobalScope || p.countyId === countyId);
  const activePatients = patients.filter((p) => ['active', 'extended', 'enrolled'].includes(p.status));
  const requests = (db.requests || []).filter((r) => isGlobalScope || r.countyId === countyId);
  const openReqs = requests.filter((r) => !['closed', 'rejected', 'reconciled'].includes(r.status));
  const txs = (db.transactions || []).filter((t) => isGlobalScope || t.countyId === countyId);
  const adminOps = db.adminOps || {};
  const statutory = (adminOps.statutory || []).filter((s) => isGlobalScope || s.countyId === countyId);
  const pendingStat = statutory.filter((s) => s.status !== 'paid');
  const dayOfMonth = new Date().getDate();
  const daysTo9th = dayOfMonth <= 9 ? 9 - dayOfMonth : 0;

  /* Optional external cloud LLM enrichment if key configured on deployment */
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (apiKey && prompt) {
    try {
      const sys = `You are CareLink Online Intelligence serving LOMAMO Foundation Kenya from the unified online CareLink C-DIMS database.
Signed-in role: ${user.roleId || 'staff'} (${isGlobalScope ? 'All Counties' : countyId}).
Live scoped counts: ${patients.length} patients (${activePatients.length} active), ${openReqs.length} open hospital requests, ${txs.length} financial transactions, ${pendingStat.length} pending 9th-of-month statutory remittances (SHIF, PAYE, KRA, NSSF).
Never diagnose or prescribe. Keep responses concise, structured, and grounded in these verified figures.`;
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: process.env.CARELINK_OPENAI_MODEL || 'gpt-4o-mini',
          temperature: 0.2,
          messages: [{ role: 'system', content: sys }, { role: 'user', content: prompt }],
        }),
      });
      if (r.ok) {
        const j = await r.json();
        const text = j.choices?.[0]?.message?.content;
        if (text) return { ok: true, engine: 'CareLink Online Cloud Intelligence', reply: text };
      }
    } catch {
      /* fall through to deterministic CareLink Online Domain Intelligence */
    }
  }

  const lines = [
    `CareLink Shared Online Intelligence · Live Cloud Database (rev ${state.rev})`,
    `Scope: ${isGlobalScope ? 'Kisumu Head Office & Homa Bay County (Organisation-Wide)' : countyId.toUpperCase() + ' County Scope'}`,
    `• Scoped Caseload: ${activePatients.length.toLocaleString('en-KE')} active of ${patients.length.toLocaleString('en-KE')} registered beneficiaries.`,
    `• Hospital Pipeline: ${openReqs.length.toLocaleString('en-KE')} open referral/transport requests awaiting clinical, focal desk, or receipt closure.`,
    `• Admin & Finance Cadence: Daily Patient Pay-As-You-Go & Daily Staff Transport active; Weekly Supplier schedule tracked; ${
      dayOfMonth <= 9
        ? `${daysTo9th} day(s) remaining before the 9th statutory deadline (SHIF, PAYE, KRA, NSSF)`
        : `9th statutory window passed for current month (${pendingStat.length} item(s) still open)`
    }.`,
    `• Operational Expenses & Reporting: Monthly Operational Wages, Administrative Wages, and Monthly Financial Reports tracked (Homa Bay reports for Kenya prepared by Kisumu Head Office Admin).`,
  ];
  return { ok: true, engine: 'CareLink Shared Online Intelligence', reply: lines.join('\n') };
}

export default async function handler(req, res) {
  const urlObj = new URL(req.url || '/api/health', `http://${req.headers.host || 'localhost'}`);
  const rewritten = urlObj.searchParams.get('__path');
  const route = rewritten
    ? rewritten.replace(/^\/+|\/+$/g, '')
    : urlObj.pathname.replace(/^\/?api\/?/, '').replace(/\/+$/, '');
  const method = (req.method || 'GET').toUpperCase();

  const { state, driver } = await loadCloudState();

  /* 1. Health, bootstrap & revision probes */
  if ((route === 'health' || route === 'bootstrap') && method === 'GET') {
    const admins = Object.values(state.creds || {}).filter((c) => c.roleId === 'chief').map((c) => c.username);
    return sendJson(res, 200, {
      ok: true,
      cloud: true,
      onlineDatabase: true,
      mode: 'online-site-db',
      storageMode: driver,
      storageDriver: driver,
      setup: Boolean(state.setup && Object.keys(state.creds || {}).length > 0),
      globallyActivated: Boolean(state.globallyActivated || (state.db && state.db.settings && state.db.settings.globallyActivated)),
      rev: state.rev || 0,
      saved: state.saved,
      org: state.org,
      accounts: Object.keys(state.creds || {}).length,
      admins,
      host: req.headers.host || 'carelink-cloud',
      ai: { online: true, engine: 'CareLink Shared Online Intelligence' },
    });
  }

  if (route === 'rev' && method === 'GET') {
    return sendJson(res, 200, { ok: true, rev: state.rev || 0, saved: state.saved, setup: Boolean(state.setup) });
  }

  if (route === 'public/status' && method === 'GET') {
    return sendJson(res, 200, { ok: true, setup: Boolean(state.setup), org: state.org, rev: state.rev || 0 });
  }

  /* 2. First-Run Production Setup */
  if (route === 'setup' && method === 'POST') {
    const body = await readJsonBody(req);
    if (state.setup && Object.keys(state.creds || {}).length > 0 && !body.forceRecommission) {
      return sendJson(res, 409, {
        ok: false,
        code: 'already_setup',
        accounts: Object.keys(state.creds).length,
        admins: Object.values(state.creds).filter((c) => c.roleId === 'chief').map((c) => c.username),
        error: 'This online CareLink site database is already commissioned.',
      });
    }
    const admin = body.admin || {};
    const username = String(admin.username || 'chief.admin').trim().toLowerCase();
    const pwErr = validatePrivacyPassword(admin.password, username);
    if (pwErr) return sendJson(res, 400, { ok: false, error: pwErr });

    const { salt, digest } = hashPassword(admin.password);
    state.org = body.org || state.org;
    state.db = sanitizeDbForClient(body.db || { meta: { schema: 6, version: '6.6.0' }, users: [], audit: [] });
    state.creds = {
      [username]: {
        id: 'u-chief-admin',
        username,
        email: admin.email || `${username}@${(body.org && body.org.emailDomain) || 'lomamo.example'}`,
        name: admin.name || 'Chief System Administrator',
        roleId: 'chief',
        countyId: (body.org && body.org.county) || 'kisumu',
        salt,
        digest,
        mustChange: Boolean(admin.mustChange),
        privacyProtected: true,
        updatedAt: nowISO(),
      },
    };
    state.setup = true;
    state.globallyActivated = Boolean(body.globallyActivated);
    state.rev = (state.rev || 0) + 1;
    appendServerAudit(state, username, 'setup.commissioned', 'installation', 'online-cloud',
      `First-Run Production Setup completed by Chief System Administrator (@${username})`);
    await saveCloudState(state);
    return sendJson(res, 200, { ok: true, rev: state.rev, admin: username });
  }

  /* 2b. Global System Activation (Chief System Administrator) */
  if (route === 'setup/activate-global' && method === 'POST') {
    const sess = getSession(state, req);
    const body = await readJsonBody(req);
    if (sess && sess.roleId !== 'chief') {
      return sendJson(res, 403, { ok: false, error: 'Only the Chief System Administrator may activate CareLink globally.' });
    }
    state.globallyActivated = true;
    state.db = state.db || {};
    if (body.settings) state.db.settings = { ...(state.db.settings || {}), ...body.settings, globallyActivated: true };
    if (body.meta) state.db.meta = { ...(state.db.meta || {}), ...body.meta, globallyActivated: true };
    if (Array.isArray(body.users)) {
      state.db.users = sanitizeDbForClient({ users: body.users }).users;
    }
    state.rev = (state.rev || 0) + 1;
    appendServerAudit(state, (sess && sess.username) || body.activatedBy || 'chief.admin', 'system.activated_globally', 'system', 'global-activation',
      `CareLink activated globally (@${body.emailDomain || 'lomamo.example'}); demo & host-setup screens permanently removed.`);
    await saveCloudState(state);
    return sendJson(res, 200, { ok: true, globallyActivated: true, rev: state.rev });
  }

  /* 3. Demo bootstrap (only when unprovisioned or explicitly allowed for evaluation) */
  if (route === 'public/demo-bootstrap' && method === 'POST') {
    if (state.setup && Object.keys(state.creds || {}).length > 0) {
      return sendJson(res, 200, { ok: true, skipped: true, reason: 'Live production installation protected' });
    }
    const body = await readJsonBody(req);
    if (body && body.db) {
      state.db = sanitizeDbForClient(body.db);
      state.rev = (state.rev || 0) + 1;
      await saveCloudState(state);
    }
    return sendJson(res, 200, { ok: true, rev: state.rev });
  }

  /* 4. Authentication & DPA First-Login Password Replacement */
  if (route === 'auth/login' && method === 'POST') {
    const body = await readJsonBody(req);
    const rawId = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    const cred = (state.creds || {})[rawId] || Object.values(state.creds || {}).find((c) => String(c.email || '').toLowerCase() === rawId);
    const username = cred ? cred.username : rawId;
    if (!cred || !verifyPassword(password, cred.salt, cred.digest)) {
      appendServerAudit(state, username || 'anonymous', 'auth.failed', 'user', username, 'Online credential check failed');
      await saveCloudState(state);
      return sendJson(res, 401, { ok: false, code: 'invalid_credentials', error: 'Invalid username or password.' });
    }
    const token = crypto.randomBytes(24).toString('base64url');
    state.sessions = state.sessions || {};
    state.sessions[token] = {
      username,
      userId: cred.id,
      roleId: cred.roleId,
      createdAt: nowISO(),
      lastSeen: nowISO(),
      device: String(body.device || '').slice(0, 120),
    };
    const userRec = ((state.db && state.db.users) || []).find((u) => String(u.username).toLowerCase() === username) || {
      id: cred.id,
      username: cred.username,
      name: cred.name,
      roleId: cred.roleId,
      countyId: cred.countyId || 'kisumu',
      status: 'active',
      active: true,
      mustChange: Boolean(cred.mustChange),
    };
    userRec.mustChange = Boolean(cred.mustChange);
    appendServerAudit(state, cred.id || username, 'auth.login', 'user', cred.id || username,
      `Online sign-in verified (${cred.mustChange ? 'first-login password change required' : 'personal password'})`);
    await saveCloudState(state);
    return sendJson(res, 200, {
      ok: true,
      token,
      rev: state.rev || 0,
      user: userRec,
      username,
      mustChange: Boolean(cred.mustChange),
      idleSeconds: IDLE_SECONDS,
    });
  }

  if (route === 'auth/logout' && method === 'POST') {
    const sess = getSession(state, req);
    if (sess) {
      delete state.sessions[sess.token];
      appendServerAudit(state, sess.userId || sess.username, 'auth.logout', 'user', sess.userId || sess.username, 'Signed out from online database');
      await saveCloudState(state);
    }
    return sendJson(res, 200, { ok: true });
  }

  if (route === 'session/beat' && method === 'POST') {
    const sess = getSession(state, req);
    if (!sess) return sendJson(res, 401, { ok: false, error: 'Session expired' });
    await saveCloudState(state);
    return sendJson(res, 200, { ok: true, expiresIn: IDLE_SECONDS });
  }

  if (route === 'session/whoami' && method === 'GET') {
    const sess = getSession(state, req);
    if (!sess) return sendJson(res, 401, { ok: false, error: 'Not signed in' });
    return sendJson(res, 200, { ok: true, session: sess, rev: state.rev });
  }

  if (route === 'auth/change-password' && method === 'POST') {
    const sess = getSession(state, req);
    if (!sess) return sendJson(res, 401, { ok: false, error: 'Sign in again to set your password.' });
    const body = await readJsonBody(req);
    const cred = (state.creds || {})[sess.username];
    if (!cred) return sendJson(res, 404, { ok: false, error: 'Account credential record not found.' });
    if (body.current && !verifyPassword(body.current, cred.salt, cred.digest)) {
      return sendJson(res, 400, { ok: false, error: 'Current/temporary password did not match.' });
    }
    const newPw = body.password || body.next || body.newPassword || '';
    const err = validatePrivacyPassword(newPw, sess.username, body.current || '');
    if (err) return sendJson(res, 400, { ok: false, error: err });
    const { salt, digest } = hashPassword(newPw);
    cred.salt = salt;
    cred.digest = digest;
    cred.mustChange = false;
    cred.privateSetAt = nowISO();
    cred.updatedAt = nowISO();
    if (state.db && Array.isArray(state.db.users)) {
      const u = state.db.users.find((x) => String(x.username).toLowerCase() === sess.username);
      if (u) {
        u.mustChange = false;
        u.privacyPasswordSet = true;
        u.privacyPasswordAt = cred.privateSetAt;
        delete u.hash;
        delete u.salt;
      }
    }
    state.rev = (state.rev || 0) + 1;
    appendServerAudit(state, sess.userId || sess.username, 'auth.privacy_password_set', 'user', sess.userId || sess.username,
      'User established personal privacy-protected password (salted PBKDF2-SHA256; undisclosed to Chief System Admin)');
    await saveCloudState(state);
    return sendJson(res, 200, { ok: true, rev: state.rev });
  }

  /* 5. Provision Unique Strong SMS Credential Pack (Chief System Admin) */
  if (route === 'credentials/provision' && method === 'POST') {
    const sess = getSession(state, req);
    if (!sess || sess.roleId !== 'chief') {
      return sendJson(res, 403, { ok: false, error: 'Only the Chief System Administrator may provision user credential packs.' });
    }
    const body = await readJsonBody(req);
    const accounts = Array.isArray(body.accounts) ? body.accounts : [];
    const issued = [];
    const origin = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host || 'carelink-dims.vercel.app'}`;
    for (const acc of accounts) {
      const uname = String(acc.username || '').trim().toLowerCase();
      if (!uname || uname === sess.username) continue;
      const tempPassword = generateStrongPassword();
      const { salt, digest } = hashPassword(tempPassword);
      state.creds[uname] = {
        id: acc.id || `u-${uname.replace(/\./g, '-')}`,
        username: uname,
        name: acc.name || uname,
        roleId: acc.roleId || 'staff',
        countyId: acc.countyId || 'kisumu',
        salt,
        digest,
        mustChange: true,
        updatedAt: nowISO(),
      };
      if (state.db && Array.isArray(state.db.users)) {
        const u = state.db.users.find((x) => String(x.username).toLowerCase() === uname);
        if (u) {
          u.mustChange = true;
          u.demo = false;
          u.status = 'active';
          u.active = true;
          delete u.hash;
          delete u.salt;
        }
      }
      const smsText = `CareLink C-DIMS (${state.org?.shortName || 'LOMAMO'}): Hello ${acc.name || uname}, your ${acc.role || acc.roleName || 'Console'} account is ready at ${origin} | Username: ${uname} | Temp Password: ${tempPassword} | You must set your private password on first login.`;
      issued.push({
        id: state.creds[uname].id,
        name: acc.name || uname,
        username: uname,
        phone: acc.phone || '',
        role: acc.role || acc.roleName || acc.roleId || '-',
        county: acc.county || '',
        password: tempPassword,
        mustChange: true,
        smsText,
      });
    }
    state.rev = (state.rev || 0) + 1;
    appendServerAudit(state, sess.userId || sess.username, 'credentials.sms_pack_provisioned', 'credentials', 'bulk-sms-pack',
      `Generated unique strong temporary passwords for ${issued.length} accounts (mandatory first-login change enforced)`);
    await saveCloudState(state);
    return sendJson(res, 200, { ok: true, rev: state.rev, issued });
  }

  if (route === 'credentials' && method === 'GET') {
    const sess = getSession(state, req);
    if (!sess) return sendJson(res, 401, { ok: false, error: 'Authentication required' });
    const list = Object.values(state.creds || {}).map((c) => ({
      id: c.id,
      username: c.username,
      name: c.name,
      roleId: c.roleId,
      mustChange: Boolean(c.mustChange),
      privateSetAt: c.privateSetAt || null,
      updatedAt: c.updatedAt,
    }));
    return sendJson(res, 200, { ok: true, accounts: list });
  }

  if (route === 'credentials/temp' && method === 'POST') {
    const sess = getSession(state, req);
    if (!sess || sess.roleId !== 'chief') {
      return sendJson(res, 403, { ok: false, error: 'Only the Chief System Administrator may re-issue a temporary SMS password.' });
    }
    const body = await readJsonBody(req);
    const uname = String(body.username || '').trim().toLowerCase();
    const cred = (state.creds || {})[uname];
    if (!cred) return sendJson(res, 404, { ok: false, error: 'Account not found.' });
    const tempPassword = generateStrongPassword();
    const { salt, digest } = hashPassword(tempPassword);
    cred.salt = salt;
    cred.digest = digest;
    cred.mustChange = true;
    cred.updatedAt = nowISO();
    if (state.db && Array.isArray(state.db.users)) {
      const u = state.db.users.find((x) => String(x.username).toLowerCase() === uname);
      if (u) u.mustChange = true;
    }
    state.rev = (state.rev || 0) + 1;
    appendServerAudit(state, sess.userId || sess.username, 'credentials.temp_reissued', 'user', uname,
      `Temporary SMS reset password issued for @${uname}; mandatory first-login privacy reset armed`);
    await saveCloudState(state);
    return sendJson(res, 200, { ok: true, username: uname, password: tempPassword, mustChange: true });
  }

  /* 6. Shared Online Database State & Field-Level Patch Merge */
  if (route === 'state' && method === 'GET') {
    const sess = getSession(state, req);
    if (!sess) return sendJson(res, 401, { ok: false, error: 'Sign in required to read the online database.' });
    const since = Number(urlObj.searchParams.get('since') || '0');
    if (since > 0 && since < (state.rev || 0)) {
      const deltas = (state.deltas || []).filter((d) => d.rev > since);
      if (deltas.length) {
        return sendJson(res, 200, {
          ok: true,
          rev: state.rev,
          saved: state.saved,
          patches: deltas.flatMap((d) => d.patches || []),
        });
      }
    }
    return sendJson(res, 200, {
      ok: true,
      rev: state.rev || 0,
      saved: state.saved,
      db: sanitizeDbForClient(state.db || {}),
    });
  }

  if (route === 'state' && method === 'PUT') {
    const sess = getSession(state, req);
    if (!sess) return sendJson(res, 401, { ok: false, error: 'Sign in required to write to the online database.' });
    const body = await readJsonBody(req);
    const patches = Array.isArray(body.patches) ? body.patches : [];
    state.db = state.db || { meta: { schema: 6, version: '6.6.0' } };
    let merged = 0;

    for (const p of patches) {
      if (!p || !p.c) continue;
      if (p.c === 'settings') {
        if (p.set && p.set.value) state.db.settings = { ...(state.db.settings || {}), ...p.set.value };
        continue;
      }
      if (p.c === 'audit') {
        state.db.audit = state.db.audit || [];
        if (p.set && !state.db.audit.some((a) => a.hash === p.set.hash && a.seq === p.set.seq)) {
          state.db.audit.push(p.set);
        }
        continue;
      }
      if (!Array.isArray(state.db[p.c])) state.db[p.c] = [];
      const col = state.db[p.c];
      const idx = col.findIndex((r) => r && r.id === p.id);
      if (p.del) {
        if (idx >= 0) col.splice(idx, 1);
        continue;
      }
      if (idx < 0) {
        const rec = { ...(p.set || {}), id: p.id };
        if (p.c === 'users') { delete rec.hash; delete rec.salt; }
        col.push(rec);
      } else {
        const cur = col[idx];
        const before = p.before || {};
        for (const [k, v] of Object.entries(p.set || {})) {
          if (p.c === 'users' && (k === 'hash' || k === 'salt')) continue;
          if (k in before && JSON.stringify(cur[k]) !== JSON.stringify(before[k]) && JSON.stringify(cur[k]) !== JSON.stringify(v)) {
            merged++;
            state.mergeJournal = state.mergeJournal || [];
            state.mergeJournal.unshift({
              id: `mj-${Date.now()}-${merged}`,
              at: nowISO(),
              actor: sess.username,
              collection: p.c,
              recordId: p.id,
              field: k,
              kept: v,
              replaced: cur[k],
            });
          }
          if (v === null) delete cur[k];
          else cur[k] = v;
        }
      }
    }

    state.rev = (state.rev || 0) + 1;
    state.deltas = state.deltas || [];
    state.deltas.push({ rev: state.rev, at: nowISO(), actor: sess.username, patches });
    if (state.deltas.length > 60) state.deltas.splice(0, state.deltas.length - 60);
    await saveCloudState(state);
    return sendJson(res, 200, { ok: true, rev: state.rev, merged, saved: state.saved });
  }

  /* 7. Chief System Administrator Audited Silent Override */
  if (route === 'admin/silent-override' && method === 'POST') {
    const sess = getSession(state, req);
    if (!sess || sess.roleId !== 'chief') {
      return sendJson(res, 403, { ok: false, error: 'Silent workspace override is restricted strictly to the Chief System Administrator.' });
    }
    const body = await readJsonBody(req);
    const phase = String(body.phase || 'start');
    const targetUsername = String(body.targetUsername || '-');
    const targetRole = String(body.targetRole || '-');
    const reason = String(body.reason || 'Workspace & navigation inspection');
    const view = String(body.view || 'home');
    const entry = appendServerAudit(
      state,
      sess.userId || sess.username,
      `admin.silent_override.${phase}`,
      'user',
      body.targetUserId || targetUsername,
      `Chief System Admin (@${sess.username}) silent override [${phase}] -> @${targetUsername} (${targetRole}) · view=${view} · reason: ${reason}`,
      { silent: true, userNotified: false, targetUsername, targetRole, view, reason }
    );
    await saveCloudState(state);
    return sendJson(res, 200, { ok: true, auditSeq: entry.seq, hash: entry.hash });
  }

  /* 8. Merge Journal & Audit */
  if (route === 'merge-journal' && method === 'GET') {
    const sess = getSession(state, req);
    if (!sess) return sendJson(res, 401, { ok: false, error: 'Authentication required' });
    return sendJson(res, 200, { ok: true, entries: (state.mergeJournal || []).slice(0, 200) });
  }

  if (route === 'audit' && method === 'GET') {
    const sess = getSession(state, req);
    if (!sess) return sendJson(res, 401, { ok: false, error: 'Authentication required' });
    return sendJson(res, 200, { ok: true, entries: (state.audit || []).slice(-500) });
  }

  /* 9. Shared Online Intelligence (/api/ai/probe & /api/ai/chat) */
  if (route === 'ai/probe' && (method === 'GET' || method === 'POST')) {
    return sendJson(res, 200, {
      ok: true,
      online: true,
      mode: 'online-cloud',
      model: process.env.OPENAI_API_KEY ? (process.env.CARELINK_OPENAI_MODEL || 'gpt-4o-mini') : 'carelink-online-intelligence-v6.4',
      engine: 'CareLink Shared Online Intelligence',
    });
  }

  if (route === 'ai/chat' && method === 'POST') {
    const sess = getSession(state, req);
    const body = await readJsonBody(req);
    const ans = await answerOnlineIntelligence(state, sess, body);
    return sendJson(res, 200, ans);
  }

  /* 10. Public County-Routed Urgent Account Request / Recovery */
  if (route === 'public/account-request' && method === 'POST') {
    const body = await readJsonBody(req);
    const ref = 'REQ-' + Math.floor(100000 + Math.random() * 900000);
    const countyId = body.assignedCountyId || body.countyId || 'kisumu';
    const assignedAdminUsername = countyId === 'homabay' ? 'homabay.admin' : 'kisumu.admin';
    const rec = { id: ref, ref, ...body, countyId, assignedCountyId: countyId, assignedAdminUsername, urgent: true, status: 'open', submittedAt: nowISO() };
    state.accountRequests = state.accountRequests || [];
    state.accountRequests.unshift(rec);
    if (state.db) {
      state.db.accountRequests = state.db.accountRequests || [];
      state.db.accountRequests.unshift(rec);
    }
    appendServerAudit(state, 'public', 'account.requested.county_urgent', 'accountRequest', ref, `URGENT -> ${assignedAdminUsername}: ${body.name || ''} (${body.jobTitle || ''})`);
    await saveCloudState(state);
    return sendJson(res, 200, { ok: true, ref, assignedCountyId: countyId, assignedAdminUsername });
  }

  if (route === 'auth/forgot' && method === 'POST') {
    const body = await readJsonBody(req);
    const ref = 'REC-' + Math.floor(10000 + Math.random() * 90000);
    const countyId = body.assignedCountyId || body.countyId || 'kisumu';
    const assignedAdminUsername = countyId === 'homabay' ? 'homabay.admin' : 'kisumu.admin';
    const rec = { id: ref, reference: ref, ...body, countyId, assignedCountyId: countyId, assignedAdminUsername, urgent: true, status: 'open', at: nowISO() };
    state.recoveryRequests = state.recoveryRequests || [];
    state.recoveryRequests.unshift(rec);
    if (state.db) {
      state.db.recoveryRequests = state.db.recoveryRequests || [];
      state.db.recoveryRequests.unshift(rec);
    }
    appendServerAudit(state, body.username || 'unknown', 'auth.recovery_requested.county_urgent', 'user', body.username || '-', `URGENT -> ${assignedAdminUsername} · Recovery ${ref}`);
    await saveCloudState(state);
    return sendJson(res, 200, { ok: true, reference: ref, assignedCountyId: countyId, assignedAdminUsername });
  }

  return sendJson(res, 404, { ok: false, error: `Unknown CareLink API endpoint: /api/${route}` });
}
