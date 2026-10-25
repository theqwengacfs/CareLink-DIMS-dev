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
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const CLOUD_KEY = 'carelink_cloud_v66';
const PBKDF2_ROUNDS = 160000;
const IDLE_SECONDS = 1800;

/* Vercel instances are disposable and may serve different requests on every
   invocation.  KV is therefore not an optional cache: it is the only online
   system of record.  In particular, never fall back to process memory or the
   ephemeral filesystem when KV is missing or unavailable. */
class CloudStorageError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CloudStorageError';
    this.code = code;
    this.statusCode = 503;
  }
}

class MasterPackageError extends Error {
  constructor(message, code = 'invalid_master_package') {
    super(message);
    this.name = 'MasterPackageError';
    this.code = code;
    this.statusCode = 400;
  }
}

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

function requireKv() {
  const kv = kvConfig();
  if (!kv) {
    throw new CloudStorageError(
      'kv_required',
      'CareLink online storage is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN (or the Upstash equivalents) in Vercel; no local fallback is used.'
    );
  }
  return kv;
}

function blankStore() {
  return {
    setup: false,
    globallyActivated: false,
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
    recoveryRequests: [],
    masterImports: [],
    loginFailures: {},
  };
}

function normalizeStore(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CloudStorageError('kv_invalid_state', 'CareLink KV contains an invalid online database document; it was not replaced.');
  }
  /* Keep forwards/backwards-compatible defaults without ever treating a local
     object as the stored state.  The object returned here came from KV. */
  const state = { ...blankStore(), ...value };
  for (const key of ['creds', 'sessions', 'loginFailures']) {
    if (!state[key] || typeof state[key] !== 'object' || Array.isArray(state[key])) state[key] = {};
  }
  for (const key of ['deltas', 'mergeJournal', 'audit', 'activations', 'emergencies', 'accountRequests', 'recoveryRequests', 'masterImports']) {
    if (!Array.isArray(state[key])) state[key] = [];
  }
  return state;
}

const CLOUD_GZIP_FORMAT = 'carelink-cloud-gzip-v1';
const CLOUD_COMPRESS_THRESHOLD = 6 * 1024 * 1024;
const MAX_CLOUD_STATE_BYTES = 128 * 1024 * 1024;

async function readKvString(key) {
  const kv = requireKv();
  let response;
  try {
    response = await fetch(`${kv.url}/get/${key}`, {
      headers: { Authorization: `Bearer ${kv.token}` },
    });
  } catch {
    throw new CloudStorageError('kv_unavailable', 'The mandatory CareLink KV store could not be read; no local fallback is used.');
  }
  if (!response.ok) {
    throw new CloudStorageError('kv_unavailable', 'The mandatory CareLink KV store refused the read; no local fallback is used.');
  }
  let payload;
  try { payload = await response.json(); }
  catch { throw new CloudStorageError('kv_invalid_response', 'CareLink KV returned an unreadable response; no local fallback is used.'); }
  if (!payload || !Object.prototype.hasOwnProperty.call(payload, 'result')) {
    throw new CloudStorageError('kv_invalid_response', 'CareLink KV returned an invalid response; no local fallback is used.');
  }
  let result = payload.result;
  /* Upstash REST POST /set/<key> stores the raw HTTP body verbatim, whereas
     writeKvString sends JSON.stringify(String(value)). Unwrap one outer JSON
     string literal layer when present so real Upstash KV and unit-test mocks
     both return the exact underlying string. */
  if (typeof result === 'string' && result.length >= 2 && result.startsWith('"') && result.endsWith('"')) {
    try {
      const unwrapped = JSON.parse(result);
      if (typeof unwrapped === 'string') result = unwrapped;
    } catch {
      /* keep raw result string */
    }
  }
  return result;
}

async function writeKvString(key, value, { exSeconds = 0 } = {}) {
  const kv = requireKv();
  let response;
  try {
    response = await fetch(`${kv.url}/set/${key}${exSeconds ? `?EX=${Math.max(60, Math.floor(exSeconds))}` : ''}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${kv.token}`,
        'Content-Type': 'application/json',
      },
      /* Upstash's REST SET endpoint accepts a JSON string containing the
         serialized value. Await the write before acknowledging it. */
      body: JSON.stringify(String(value)),
    });
  } catch {
    throw new CloudStorageError('kv_write_failed', 'CareLink could not commit to the mandatory KV store; the change was not acknowledged.');
  }
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  const errMsg = payload && payload.error ? String(payload.error) : '';
  if (!response.ok || errMsg) {
    if (response.status === 413 || /max.*(request|value|record).*size|too large|entity too large/i.test(errMsg)) {
      throw new CloudStorageError('kv_payload_too_large', errMsg || 'KV command exceeded single-key size limit.');
    }
    throw new CloudStorageError('kv_write_failed', 'CareLink KV refused the write; the change was not acknowledged.');
  }
}

async function deleteKvKey(key) {
  const kv = requireKv();
  try {
    const response = await fetch(`${kv.url}/del/${key}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${kv.token}`, 'Content-Type': 'application/json' },
      body: '[]',
    });
    return response.ok;
  } catch {
    return false;
  }
}

function serializeCloudState(state) {
  const raw = JSON.stringify(state);
  if (Buffer.byteLength(raw) <= CLOUD_COMPRESS_THRESHOLD) return raw;
  /* A full reference installation is ~70 MB as JSON. Upstash's free tier
     rejects individual requests above 10 MB, so large states are stored as a
     gzip envelope. This is still one authoritative KV value, never a memory
     or filesystem fallback. Small installations keep the original format. */
  const data = zlib.gzipSync(Buffer.from(raw), { level: 6 }).toString('base64');
  return JSON.stringify({ format: CLOUD_GZIP_FORMAT, data });
}

function decodeCloudState(stored) {
  let parsed = stored;
  try {
    for (let depth = 0; depth < 3 && typeof parsed === 'string'; depth++) {
      parsed = JSON.parse(parsed);
    }
  } catch {
    throw new CloudStorageError('kv_invalid_state', 'CareLink KV contains malformed JSON; the online database was not reset.');
  }
  if (parsed && parsed.format === CLOUD_GZIP_FORMAT) {
    if (typeof parsed.data !== 'string' || parsed.data.length > 16 * 1024 * 1024) {
      throw new CloudStorageError('kv_invalid_state', 'CareLink KV contains an invalid compressed online document; it was not replaced.');
    }
    try {
      const raw = zlib.gunzipSync(Buffer.from(parsed.data, 'base64'), {
        maxOutputLength: MAX_CLOUD_STATE_BYTES + 1,
      }).toString('utf8');
      if (Buffer.byteLength(raw) > MAX_CLOUD_STATE_BYTES) throw new Error('state too large');
      parsed = JSON.parse(raw);
    } catch {
      throw new CloudStorageError('kv_invalid_state', 'CareLink KV contains an unreadable compressed online document; it was not replaced.');
    }
  }
  return normalizeStore(parsed);
}

const CLOUD_SHARDED_FORMAT = 'carelink-cloud-gzip-sharded-v1';
const CLOUD_SHARD_SIZE = 700 * 1024; /* safely under Upstash Free Tier 1 MB command limit */

function cloudShardKey(index) {
  return `${CLOUD_KEY}_shard_${index}`;
}

async function loadCloudState() {
  const stored = await readKvString(CLOUD_KEY);
  /* Upstash returns null for a missing key. Only that explicit result means a
     new installation; a network error or malformed value never looks empty. */
  if (stored === null || stored === undefined) {
    return { state: blankStore(), driver: 'cloud-kv-redis' };
  }
  let unwrapped = stored;
  try {
    for (let depth = 0; depth < 3 && typeof unwrapped === 'string'; depth++) {
      unwrapped = JSON.parse(unwrapped);
    }
  } catch {
    throw new CloudStorageError('kv_invalid_state', 'CareLink KV contains malformed JSON; the online database was not reset.');
  }
  if (unwrapped && unwrapped.format === CLOUD_SHARDED_FORMAT) {
    const count = Number(unwrapped.shardCount) || 0;
    const digests = Array.isArray(unwrapped.shardDigests) ? unwrapped.shardDigests : [];
    if (count < 1 || count > 64 || digests.length !== count) {
      throw new CloudStorageError('kv_invalid_state', 'CareLink KV contains an invalid sharded online manifest; it was not replaced.');
    }
    const parts = await Promise.all(
      Array.from({ length: count }, (_, idx) => readKvString(cloudShardKey(idx))),
    );
    for (let i = 0; i < count; i++) {
      if (typeof parts[i] !== 'string' || sha256Hex(parts[i]) !== digests[i]) {
        throw new CloudStorageError('kv_invalid_state', `CareLink KV shard ${i + 1} failed integrity verification; the online database was not replaced.`);
      }
    }
    return {
      state: decodeCloudState({ format: CLOUD_GZIP_FORMAT, data: parts.join('') }),
      driver: 'cloud-kv-redis',
    };
  }
  return { state: decodeCloudState(unwrapped), driver: 'cloud-kv-redis' };
}

async function saveCloudState(state) {
  state.saved = nowISO();
  const serialized = serializeCloudState(state);
  try {
    await writeKvString(CLOUD_KEY, serialized);
  } catch (err) {
    if (!err || err.code !== 'kv_payload_too_large') throw err;
    /* Automatic Upstash Free-Tier fallback: if a single-key write exceeds the
       1 MB Free-Tier command limit, shard the gzip base64 payload into 700 KB
       keys with SHA-256 verification before committing the manifest key. */
    let envelope;
    try { envelope = JSON.parse(serialized); } catch { throw err; }
    const b64 = envelope && envelope.format === CLOUD_GZIP_FORMAT && typeof envelope.data === 'string'
      ? envelope.data
      : zlib.gzipSync(Buffer.from(serialized), { level: 6 }).toString('base64');
    const shards = [];
    const shardDigests = [];
    for (let offset = 0; offset < b64.length; offset += CLOUD_SHARD_SIZE) {
      const part = b64.slice(offset, offset + CLOUD_SHARD_SIZE);
      shards.push(part);
      shardDigests.push(sha256Hex(part));
    }
    for (let i = 0; i < shards.length; i++) {
      await writeKvString(cloudShardKey(i), shards[i]);
    }
    await writeKvString(CLOUD_KEY, JSON.stringify({
      format: CLOUD_SHARDED_FORMAT,
      shardCount: shards.length,
      shardDigests,
      saved: state.saved,
      rev: state.rev || 1,
    }));
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

function isGloballyActivated(state) {
  return Boolean(
    state.globallyActivated ||
    (state.db && state.db.settings && state.db.settings.globallyActivated) ||
    (state.db && state.db.meta && state.db.meta.globallyActivated) ||
    (state.db && state.db.meta && state.db.meta.demoDisabled)
  );
}

function isDemoDatabase(state) {
  const meta = (state.db && state.db.meta) || {};
  return Boolean(
    meta.demoMode || meta.demoSeeded || meta.seeded === 'official' ||
    /synthetic|demonstration/i.test(String(meta.label || ''))
  );
}

function getSession(state, req) {
  const tok = req.headers['x-carelink-session'] || '';
  if (!tok || typeof tok !== 'string' || !state.sessions || !Object.prototype.hasOwnProperty.call(state.sessions, tok)) return null;
  const s = state.sessions[tok];
  const age = (Date.now() - new Date(s.lastSeen || s.createdAt).getTime()) / 1000;
  if (age > IDLE_SECONDS) {
    delete state.sessions[tok];
    return null;
  }
  s.lastSeen = nowISO();
  return { token: tok, ...s };
}

const MAX_BODY_BYTES = 24 * 1024 * 1024;
const MAX_PATCHES_PER_WRITE = 5000;
const MAX_PUBLIC_REQUESTS = 500;
const LOGIN_MAX_FAILURES = 8;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const SAFE_COLLECTION = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const MASTER_PACKAGE_FORMAT = 'carelink-reference-master-v1';
const MASTER_PAYLOAD_FORMAT = 'carelink-reference-payload-v1';
const MASTER_ENCODING = 'brotli-base64';
const MASTER_MAX_CHUNKS = 256;
const MASTER_MAX_CHUNK_CHARS = 600000;
const MASTER_MAX_RAW_BYTES = 100 * 1024 * 1024;
const MASTER_MAX_COMPRESSED_BYTES = 8 * 1024 * 1024;
const MASTER_CHUNK_PREFIX = 'carelink_reference_master_v1_';
const STATE_PAGE_MAX_BYTES = 3 * 1024 * 1024;
const STATE_PAGE_THRESHOLD = 512 * 1024;
const MASTER_PROTECTED_KEYS = new Set([
  'settings', 'meta', 'users', 'roles', 'audit', 'approvals', 'backups',
  'drafts', 'mergeJournal', 'presence', 'sessions', 'creds', 'deltas',
]);

/* Roles allowed to change who holds which role, county or account status. */
const ACCOUNT_ADMIN_ROLES = new Set(['chief', 'countyadmin', 'hr', 'director', 'president', 'program.admin']);
/* Fields on a user record that grant or revoke access. */
const PRIVILEGED_USER_FIELDS = new Set([
  'roleId', 'countyId', 'permissions', 'scopes', 'status', 'active', 'username',
  'mustChange', 'demo', 'consoles', 'extraRoles', 'deptId', 'hash', 'salt',
]);

function safeObject(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!FORBIDDEN_KEYS.has(k)) out[k] = v;
  }
  return out;
}

function clipString(v, max = 500) {
  return String(v == null ? '' : v).slice(0, max);
}

function masterChunkKey(uploadId, index) {
  return `${MASTER_CHUNK_PREFIX}${uploadId}_${index}`;
}

function ownedMasterImport(state, uploadId, sess) {
  const job = (state.masterImports || []).find((j) => j.id === uploadId && j.username === sess.username);
  if (!job) throw new MasterPackageError('The reference-master upload session was not found or does not belong to this Chief Administrator.', 'master_upload_not_found');
  return job;
}

function assertSafeJson(value) {
  const stack = [{ value, depth: 0 }];
  let visited = 0;
  while (stack.length) {
    const { value: current, depth } = stack.pop();
    if (!current || typeof current !== 'object') continue;
    if (depth > 40 || ++visited > 2500000) {
      throw new MasterPackageError('The reference master has an unsafe or excessively complex structure.');
    }
    for (const [key, child] of Object.entries(current)) {
      if (FORBIDDEN_KEYS.has(key)) throw new MasterPackageError('The reference master contains a forbidden object key.');
      if (child && typeof child === 'object') stack.push({ value: child, depth: depth + 1 });
    }
  }
}

function validateReferencePayload(payload) {
  if (!payload || payload.format !== MASTER_PAYLOAD_FORMAT || !payload.db || typeof payload.db !== 'object' || Array.isArray(payload.db)) {
    throw new MasterPackageError('This is not a CareLink full reference-master payload.');
  }
  const db = payload.db;
  assertSafeJson(db);
  const required = [
    'patients', 'visits', 'pdcas', 'patientConditions', 'support', 'documents',
    'requests', 'transactions', 'employees', 'inventoryItems', 'budgets',
    'referralEntities', 'careBeds', 'careResidents', 'stockLots', 'stockMoves',
  ];
  const missing = required.filter((key) => !Array.isArray(db[key]));
  if (missing.length) throw new MasterPackageError(`The reference master is missing required collection(s): ${missing.join(', ')}.`);
  const patients = db.patients;
  if (patients.length !== 3333) throw new MasterPackageError(`The full reference master must contain exactly 3,333 patients; it contains ${patients.length}.`);
  if ((db.users || []).some((u) => u && (u.hash || u.salt))) {
    throw new MasterPackageError('The reference master must not contain password hashes or salts.');
  }

  for (const [collection, records] of Object.entries(db)) {
    if (!Array.isArray(records)) continue;
    const ids = new Set();
    for (const record of records) {
      if (!record || typeof record !== 'object') throw new MasterPackageError(`Collection ${collection} contains an invalid record.`);
      if (record.id === undefined || record.id === null) continue;
      const id = String(record.id);
      if (ids.has(id)) throw new MasterPackageError(`Collection ${collection} contains duplicate record ID ${id}.`);
      ids.add(id);
    }
  }

  const patientIds = new Set(patients.map((p) => String(p.id)));
  for (const collection of ['visits', 'pdcas', 'patientConditions', 'support', 'supportIssues', 'documents', 'requests', 'concerns']) {
    for (const record of db[collection] || []) {
      if (record.patientId && !patientIds.has(String(record.patientId))) {
        throw new MasterPackageError(`Collection ${collection} contains a record linked to a missing patient.`);
      }
    }
  }

  const incompleteProfile = patients.filter((p) => !(
    p.id && p.code && p.name && p.dob && p.sha && p.village && p.guardian &&
    p.nationalId && p.ccc && p.phone && p.docsVerified && p.intake && p.carePlan && p.carePlan.objectives &&
    p.clinical && p.clinical.diagnosis && p.clinical.conditionCategory && p.clinical.adherence &&
    p.clinical.adherence !== 'Not recorded' && p.clinical.bp &&
    Number(p.clinical.weightKg) > 0 && Number(p.clinical.baselineWeightKg) > 0 &&
    Number(p.clinical.heightCm) > 0 && Number(p.clinical.bmi) > 0
  )).length;
  const visitCounts = new Map();
  (db.visits || []).filter((v) => v.date && v.type && v.outcome && v.summary && v.nextDue && v.by && Number(v.weight) > 0)
    .forEach((v) => visitCounts.set(v.patientId, (visitCounts.get(v.patientId) || 0) + 1));
  const withoutTwelveVisits = patients.filter((p) => (visitCounts.get(p.id) || 0) < 12).length;
  const reviewedPatients = new Set((db.pdcas || []).filter((p) => Array.isArray(p.reviews) && p.reviews.some((r) =>
    r && r.kind === 'review' && Number(r.dueDay) > 0 && Number(r.dueDay) % 30 === 0 &&
    r.completedAt && r.status === 'closed' && r.plan && r.doNote && r.checkNote && r.actNote
  )).map((p) => p.patientId));
  const withoutReviewedPdca = patients.filter((p) => !reviewedPatients.has(p.id)).length;
  const conditionPatients = new Set((db.patientConditions || []).map((r) => r.patientId));
  const supportPatients = new Set((db.support || []).map((r) => r.patientId));
  const documentPatients = new Set((db.documents || []).map((r) => r.patientId));
  const withoutRelated = patients.filter((p) => !conditionPatients.has(p.id) || !supportPatients.has(p.id) || !documentPatients.has(p.id)).length;
  const discharged = patients.filter((p) => p.status === 'discharged');
  const incompleteDischarge = discharged.filter((p) => !p.dischargeReferral || !p.dischargeSummary).length;
  const evidencedTransactions = (db.transactions || []).filter((t) => t.receipt || t.ref).length;
  const verifiedForms = (db.formRecords || []).filter((f) => f.status === 'verified' || f.status === 'submitted').length;
  const completedRequests = (db.requests || []).filter((r) => ['completed', 'reconciled'].includes(r.status));
  const reportedRequests = completedRequests.filter((r) => Boolean(r.clinicalReport)).length;
  const operationalExpected = (db.transactions || []).length + (db.formRecords || []).length + completedRequests.length;
  const operationalActual = evidencedTransactions + verifiedForms + reportedRequests;
  const codes = new Set(); const cccNumbers = new Set(); const nationalIds = new Set();
  let uniqueIdentifiers = 0;
  patients.forEach((p) => {
    const unique = p.code && p.ccc && p.nationalId && !codes.has(p.code) && !cccNumbers.has(p.ccc) && !nationalIds.has(p.nationalId);
    if (unique) uniqueIdentifiers++;
    codes.add(p.code); cccNumbers.add(p.ccc); nationalIds.add(p.nationalId);
  });

  const checks = [
    { key: 'profiles', label: '3,333 complete demographic, identity, anthropometric, adherence and care-plan profiles', actual: patients.length - incompleteProfile, expected: 3333 },
    { key: 'identifiers', label: 'Unique patient code, CCC number and national identifier for every patient', actual: uniqueIdentifiers, expected: 3333 },
    { key: 'visits', label: 'At least 12 complete longitudinal visits for every patient', actual: patients.length - withoutTwelveVisits, expected: 3333 },
    { key: 'pdcas', label: 'A PDCA cycle with a completed, structured 30-day review for every patient', actual: patients.length - withoutReviewedPdca, expected: 3333 },
    { key: 'related', label: 'Condition, household-support and document coverage for every patient', actual: patients.length - withoutRelated, expected: 3333 },
    { key: 'discharges', label: 'Structured referral and discharge summary for every discharged patient', actual: discharged.length - incompleteDischarge, expected: discharged.length },
    { key: 'operations', label: 'Receipts, verified forms and clinical completion reports for operational records', actual: operationalActual, expected: operationalExpected },
  ];
  const failed = checks.filter((c) => c.actual !== c.expected);
  if (failed.length) {
    throw new MasterPackageError(`The reference master did not pass every completeness check: ${failed.map((c) => `${c.key} ${c.actual}/${c.expected}`).join('; ')}.`, 'master_quality_failed');
  }

  const counts = {};
  for (const [key, value] of Object.entries(db)) if (Array.isArray(value)) counts[key] = value.length;
  return {
    counts,
    quality: {
      passed: true,
      patientRegistryCompleteness: 100,
      recordsChecked: Object.values(counts).reduce((sum, n) => sum + n, 0),
      patientsChecked: patients.length,
      fieldChecks: patients.length * 6,
      checks: checks.map((c) => ({ ...c, passed: true })),
    },
  };
}

function splitLargeStateCollections(db) {
  if (!db || typeof db !== 'object') return { db, pagedCollections: [] };
  const base = { ...db };
  const pagedCollections = [];
  for (const [key, value] of Object.entries(db)) {
    if (!Array.isArray(value)) continue;
    const bytes = Buffer.byteLength(JSON.stringify(value));
    if (bytes <= STATE_PAGE_THRESHOLD) continue;
    pagedCollections.push({ name: key, count: value.length, bytes });
    delete base[key];
  }
  return { db: base, pagedCollections };
}

function publicRef(prefix) {
  return `${prefix}-${crypto.randomInt(100000, 1000000)}`;
}

function pruneSessions(state) {
  const now = Date.now();
  for (const [tok, s] of Object.entries(state.sessions || {})) {
    const last = new Date(s.lastSeen || s.createdAt).getTime();
    if (!Number.isFinite(last) || (now - last) / 1000 > IDLE_SECONDS) delete state.sessions[tok];
  }
}

function loginLockRemainingMs(state, username) {
  const rec = (state.loginFailures || {})[username];
  if (!rec || !rec.lockedUntil) return 0;
  return Math.max(0, rec.lockedUntil - Date.now());
}

function recordLoginFailure(state, username) {
  state.loginFailures = state.loginFailures || {};
  const now = Date.now();
  const rec = state.loginFailures[username] || { count: 0, first: now };
  if (now - rec.first > LOGIN_WINDOW_MS) { rec.count = 0; rec.first = now; }
  rec.count += 1;
  if (rec.count >= LOGIN_MAX_FAILURES) rec.lockedUntil = now + LOGIN_LOCK_MS;
  state.loginFailures[username] = rec;
}

/* Unauthenticated forms keep only flat text fields of bounded size, so a public caller
   cannot override routing/status fields or bloat the shared database. */
function sanitizePublicSubmission(body) {
  const out = {};
  let count = 0;
  for (const [k, v] of Object.entries(safeObject(body))) {
    if (count >= 40 || !/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(k)) continue;
    if (['id', 'ref', 'reference', 'status', 'urgent', 'assignedAdminUsername', 'submittedAt', 'at'].includes(k)) continue;
    if (v == null || typeof v === 'object') continue;
    out[k] = clipString(v, 1000);
    count++;
  }
  return out;
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.trim()) {
    if (req.body.length > MAX_BODY_BYTES) return {};
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    req.on('data', (c) => {
      const buf = Buffer.isBuffer(c) ? c : Buffer.from(c);
      size += buf.length;
      if (size > MAX_BODY_BYTES) { finish({}); req.destroy?.(); return; }
      chunks.push(buf);
    });
    req.on('end', () => {
      if (!chunks.length) return finish({});
      try { finish(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { finish({}); }
    });
    req.on('error', () => finish({}));
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
  const prompt = clipString(body.prompt || body.message || '', 12000).trim();
  const db = state.db || {};
  /* Scope is derived from the verified session only - never from client-supplied context. */
  const cred = (state.creds || {})[session.username] || {};
  const dbUser = (db.users || []).find((u) => String(u.username || '').toLowerCase() === session.username) || {};
  const user = { ...dbUser, roleId: cred.roleId || dbUser.roleId, countyId: cred.countyId || dbUser.countyId };
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

function readBundledReferenceManifest() {
  const candidates = [];
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    candidates.push(path.resolve(here, '..', 'public', 'master', 'CareLink-Reference-Master-v6.6.json'));
  } catch { /* ignore */ }
  try {
    candidates.push(path.resolve(process.cwd(), 'public', 'master', 'CareLink-Reference-Master-v6.6.json'));
  } catch { /* ignore */ }
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      }
    } catch { /* try next */ }
  }
  return null;
}

async function handleRequest(req, res) {
  const urlObj = new URL(req.url || '/api/health', `http://${req.headers.host || 'localhost'}`);
  const rewritten = urlObj.searchParams.get('__path');
  const route = rewritten
    ? rewritten.replace(/^\/+|\/+$/g, '')
    : urlObj.pathname.replace(/^\/?api\/?/, '').replace(/\/+$/, '');
  const method = (req.method || 'GET').toUpperCase();

  /* 0. Pre-Activation Fresh First-Run Reset & Corrupted-KV Recovery:
     Handled before unconditional loadCloudState() so an unactivated or
     malformed KV document can be cleanly reset to Step 1 of First-Run Setup,
     while any globally activated installation remains permanently locked. */
  if (route === 'setup/reset-first-run' && method === 'POST') {
    const body = await readJsonBody(req);
    if (!body || body.confirm !== 'RESET-FIRST-RUN') {
      return sendJson(res, 400, { ok: false, code: 'confirm_required', error: 'Pass confirm="RESET-FIRST-RUN" to reset an unactivated First-Run installation.' });
    }
    let existing = null;
    try {
      const loaded = await loadCloudState();
      existing = loaded.state;
    } catch (err) {
      /* If KV itself is unreachable or unconfigured, fail closed; only recover from kv_invalid_state. */
      if (!err || err.code !== 'kv_invalid_state') throw err;
    }
    if (existing && isGloballyActivated(existing)) {
      return sendJson(res, 409, {
        ok: false,
        code: 'globally_activated',
        error: 'This installation is globally activated; First-Run setup reset is permanently locked.',
      });
    }
    const fresh = blankStore();
    fresh.rev = existing && Number.isFinite(existing.rev) ? existing.rev + 1 : 1;
    appendServerAudit(fresh, 'setup-reset', 'setup.reset_first_run', 'installation', 'online-cloud',
      existing ? 'Unactivated First-Run installation reset for fresh commissioning' : 'Malformed KV state reset for fresh First-Run commissioning');
    await saveCloudState(fresh);
    return sendJson(res, 200, { ok: true, reset: true, rev: fresh.rev });
  }

  const { state, driver } = await loadCloudState();

  /* 1. Health, bootstrap & revision probes */
  if ((route === 'health' || route === 'bootstrap') && method === 'GET') {
    /* Display names only: login usernames are never disclosed to unauthenticated callers. */
    const admins = Object.values(state.creds || {}).filter((c) => c.roleId === 'chief').map((c) => c.name || 'Chief System Administrator');
    const demoMode = Boolean(state.db && state.db.meta && (
      state.db.meta.demoMode || state.db.meta.demoSeed || state.db.meta.demoSeeded || state.db.meta.freshSeeded ||
      /synthetic|demonstration/i.test(String(state.db.meta.label || ''))
    ));
    return sendJson(res, 200, {
      ok: true,
      cloud: true,
      onlineDatabase: true,
      mode: 'online-site-db',
      storageMode: driver,
      storageDriver: driver,
      setup: Boolean(state.setup && Object.keys(state.creds || {}).length > 0),
      commissioned: Boolean(state.setup && Object.keys(state.creds || {}).length > 0 && !demoMode),
      demoMode,
      globallyActivated: isGloballyActivated(state),
      demoDisabled: isGloballyActivated(state),
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
    return sendJson(res, 200, {
      ok: true,
      rev: state.rev || 0,
      saved: state.saved,
      setup: Boolean(state.setup),
      globallyActivated: isGloballyActivated(state),
    });
  }

  if (route === 'public/status' && method === 'GET') {
    return sendJson(res, 200, {
      ok: true,
      setup: Boolean(state.setup),
      globallyActivated: isGloballyActivated(state),
      org: state.org,
      rev: state.rev || 0,
    });
  }

  /* 2. First-Run Production Setup */
  if (route === 'setup' && method === 'POST') {
    const body = await readJsonBody(req);
    /* Global activation is a one-way production boundary.  A setup/recommission
       request must never clear it and make the demo door available again. */
    if (isGloballyActivated(state)) {
      return sendJson(res, 409, {
        ok: false,
        code: 'globally_activated',
        error: 'This installation is globally activated; first-run setup and recommissioning are locked.',
      });
    }
    const commissioned = state.setup && Object.keys(state.creds || {}).length > 0;
    if (commissioned) {
      /* Re-commissioning wipes every account, so it needs a live Chief System Administrator session. */
      const sess = getSession(state, req);
      if (!body.forceRecommission || !sess || sess.roleId !== 'chief') {
        return sendJson(res, 409, {
          ok: false,
          code: 'already_setup',
          accounts: Object.keys(state.creds).length,
          error: 'This online CareLink site database is already commissioned.',
        });
      }
    }
    const admin = body.admin || {};
    const username = String(admin.username || 'chief.admin').trim().toLowerCase();
    const pwErr = validatePrivacyPassword(admin.password, username);
    if (pwErr) return sendJson(res, 400, { ok: false, error: pwErr });

    const { salt, digest } = hashPassword(admin.password);
    state.org = body.org || state.org;
    state.db = sanitizeDbForClient(body.db || { meta: { schema: 6, version: '6.6.0' }, users: [], audit: [] });
    /* Only the authenticated activation endpoint may set this flag.  Ignore a
       client-supplied true value during public first-run setup as well. */
    if (state.db && typeof state.db === 'object') {
      state.db.settings = { ...(state.db.settings || {}), globallyActivated: false };
      state.db.meta = { ...(state.db.meta || {}), globallyActivated: false, demoDisabled: false, productionMode: false };
    }
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
    state.globallyActivated = false;
    state.rev = (state.rev || 0) + 1;
    appendServerAudit(state, username, 'setup.commissioned', 'installation', 'online-cloud',
      `First-Run Production Setup completed by Chief System Administrator (@${username})`);
    await saveCloudState(state);
    return sendJson(res, 200, { ok: true, rev: state.rev, admin: username });
  }

  /* 2b. Global System Activation (Chief System Administrator) */
  if (route === 'setup/activate-global' && method === 'POST') {
    const sess = getSession(state, req);
    if (!sess || sess.roleId !== 'chief') {
      return sendJson(res, 403, { ok: false, error: 'Only the Chief System Administrator may activate CareLink globally.' });
    }
    const body = await readJsonBody(req);
    state.globallyActivated = true;
    state.db = state.db || {};
    /* Write the activation markers into every server-side location, even when
       an older client omits settings/meta.  Health checks and later requests
       therefore see the same permanent boundary. */
    state.db.settings = {
      ...(state.db.settings || {}),
      ...safeObject(body.settings),
      globallyActivated: true,
      awaitingGlobalActivation: false,
    };
    state.db.meta = {
      ...(state.db.meta || {}),
      ...safeObject(body.meta),
      globallyActivated: true,
      demoDisabled: true,
      productionMode: true,
    };
    if (Array.isArray(body.users)) {
      state.db.users = sanitizeDbForClient({ users: body.users }).users;
    }

    /* The browser prepares the human-readable credential sheet, but KV owns
       the credentials.  Without this step a sheet could contain passwords
       that no other PC or tablet could ever use.  Existing private passwords
       are never replaced by a repeated activation/reissue action. */
    const accounts = Array.isArray(body.accounts) ? body.accounts : [];
    const issued = [];
    const preserved = [];
    state.creds = state.creds || {};
    for (const acc of accounts) {
      const uname = clipString(acc && acc.username, 120).trim().toLowerCase();
      if (!uname || uname === sess.username || FORBIDDEN_KEYS.has(uname)) continue;
      const existing = state.creds[uname];
      if (existing && existing.roleId === 'chief') continue;
      if (existing && existing.privateSetAt && !existing.mustChange) {
        preserved.push(uname);
        const existingUser = (state.db.users || []).find((u) => String(u.username || '').toLowerCase() === uname);
        if (existingUser) {
          existingUser.mustChange = false;
          existingUser.mustChangePassword = false;
          existingUser.dpaFirstLoginRequired = false;
          existingUser.status = 'active';
          existingUser.active = true;
          existingUser.privacyPasswordSet = true;
          delete existingUser.hash;
          delete existingUser.salt;
        }
        continue;
      }
      const tempPassword = String(acc.password || acc.tempPassword || '') || generateStrongPassword();
      const { salt, digest } = hashPassword(tempPassword);
      state.creds[uname] = {
        id: clipString(acc.id || `u-${uname.replace(/\./g, '-')}`, 160),
        username: uname,
        name: clipString(acc.name || uname, 240),
        roleId: clipString(acc.roleId || 'staff', 80),
        countyId: clipString(acc.countyId || 'kisumu', 80),
        email: clipString(acc.email || `${uname}@${body.emailDomain || 'lomamo.example'}`, 240),
        salt,
        digest,
        mustChange: true,
        updatedAt: nowISO(),
      };
      const user = (state.db.users || []).find((u) => String(u.username || '').toLowerCase() === uname);
      if (user) {
        user.mustChange = true;
        user.mustChangePassword = true;
        user.demo = false;
        user.status = 'pending_activation';
        user.active = true;
        delete user.hash;
        delete user.salt;
        delete user.privacyPasswordSet;
        delete user.privacyPasswordAt;
      }
      issued.push({ username: uname, password: tempPassword, mustChange: true });
    }
    state.rev = (state.rev || 0) + 1;
    appendServerAudit(state, (sess && sess.username) || body.activatedBy || 'chief.admin', 'system.activated_globally', 'system', 'global-activation',
      `CareLink activated globally (@${body.emailDomain || 'lomamo.example'}); ${issued.length} credentials issued, ${preserved.length} private credentials preserved; demo & setup screens permanently removed.`);
    await saveCloudState(state);
    return sendJson(res, 200, { ok: true, globallyActivated: true, rev: state.rev, issued, preserved });
  }

  /* 3. Demo bootstrap is an evaluation-only, pre-commissioning operation.
     It is deliberately not a general public "replace the database" endpoint:
     once a live installation exists, and permanently after global activation,
     the request is refused before parsing or writing the supplied document. */
  if (route === 'public/demo-bootstrap' && method === 'POST') {
    if (isGloballyActivated(state)) {
      return sendJson(res, 403, {
        ok: false,
        code: 'demo_bootstrap_locked',
        reason: 'globally_activated',
        globallyActivated: true,
        error: 'Demonstration bootstrap is permanently disabled after global activation.',
      });
    }
    const commissioned = Boolean(state.setup || Object.keys(state.creds || {}).length);
    const hasNonDemoRevision = Boolean(state.rev && state.db && !isDemoDatabase(state));
    if (commissioned || hasNonDemoRevision) {
      return sendJson(res, 409, {
        ok: false,
        code: 'demo_bootstrap_locked',
        reason: 'live_installation',
        error: 'Demonstration bootstrap is locked because this online installation already contains a commissioned or non-demo database.',
      });
    }
    const body = await readJsonBody(req);
    if (!body || !body.db || typeof body.db !== 'object' || Array.isArray(body.db)) {
      return sendJson(res, 400, { ok: false, error: 'A demonstration database document is required.' });
    }
    const demoDb = sanitizeDbForClient(body.db);
    /* Do not allow a demo document to smuggle activation/setup markers into the
       public bootstrap path. */
    demoDb.settings = {
      ...(demoDb.settings || {}),
      globallyActivated: false,
      awaitingGlobalActivation: false,
    };
    demoDb.meta = {
      ...(demoDb.meta || {}),
      globallyActivated: false,
      demoDisabled: false,
      productionMode: false,
      demoMode: true,
    };
    state.db = demoDb;
    state.setup = false;
    state.globallyActivated = false;
    state.rev = (state.rev || 0) + 1;
    await saveCloudState(state);
    return sendJson(res, 200, { ok: true, rev: state.rev, demo: true });
  }

  /* 4. Authentication & DPA First-Login Password Replacement */
  if (route === 'auth/login' && method === 'POST') {
    const body = await readJsonBody(req);
    const rawId = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    const cred = Object.prototype.hasOwnProperty.call(state.creds || {}, rawId)
      ? state.creds[rawId]
      : Object.values(state.creds || {}).find((c) => String(c.email || '').toLowerCase() === rawId);
    const username = clipString(cred ? cred.username : rawId, 120);
    const lockMs = loginLockRemainingMs(state, username);
    if (lockMs > 0) {
      return sendJson(res, 429, {
        ok: false,
        code: 'locked',
        retryAfterSeconds: Math.ceil(lockMs / 1000),
        error: `Too many failed sign-in attempts. Try again in ${Math.ceil(lockMs / 60000)} minute(s) or ask your County Administrator to re-issue a temporary password.`,
      });
    }
    if (!cred || !verifyPassword(password, cred.salt, cred.digest)) {
      recordLoginFailure(state, username || 'anonymous');
      appendServerAudit(state, username || 'anonymous', 'auth.failed', 'user', username, 'Online credential check failed');
      await saveCloudState(state);
      return sendJson(res, 401, { ok: false, code: 'invalid_credentials', error: 'Invalid username or password.' });
    }
    if (state.loginFailures) delete state.loginFailures[username];
    const token = crypto.randomBytes(24).toString('base64url');
    state.sessions = state.sessions || {};
    pruneSessions(state);
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
    if (!body.current || !verifyPassword(body.current, cred.salt, cred.digest)) {
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
        u.mustChangePassword = false;
        u.dpaFirstLoginRequired = false;
        u.status = 'active';
        u.active = true;
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
      const uname = clipString(acc && acc.username, 120).trim().toLowerCase();
      if (!uname || uname === sess.username || FORBIDDEN_KEYS.has(uname)) continue;
      /* Never silently demote or replace another Chief System Administrator through a bulk pack. */
      if (state.creds[uname] && state.creds[uname].roleId === 'chief') continue;
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
    if (!ACCOUNT_ADMIN_ROLES.has(sess.roleId)) {
      return sendJson(res, 403, { ok: false, error: 'Only account administrators may list credential records.' });
    }
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

  /* 5c. Full reference-master import: authenticated, chunked and KV-backed.
     The four-step setup stays small; the complete synthetic reference package
     is a deliberate post-setup action by the Chief before global activation. */
  if (route === 'master-import/start' && method === 'POST') {
    const sess = getSession(state, req);
    if (!sess || sess.roleId !== 'chief') return sendJson(res, 403, { ok: false, error: 'Only the Chief System Administrator may import the full reference master.' });
    if (!state.setup || isGloballyActivated(state) || !(state.db && state.db.settings && state.db.settings.awaitingGlobalActivation)) {
      return sendJson(res, 409, { ok: false, code: 'master_import_locked', error: 'Import the reference master after the four-step setup and before global activation.' });
    }
    if (state.db.meta && state.db.meta.referenceMaster) {
      return sendJson(res, 409, { ok: false, code: 'master_already_imported', error: 'The full reference master has already been imported into this installation.' });
    }
    const body = await readJsonBody(req);
    const integer = (v) => Number.isSafeInteger(Number(v)) && Number(v) >= 0 ? Number(v) : -1;
    const rawBytes = integer(body.rawBytes);
    const compressedBytes = integer(body.compressedBytes);
    const base64Length = integer(body.base64Length);
    const chunkSize = integer(body.chunkSize);
    const chunkCount = integer(body.chunkCount);
    if (body.format !== MASTER_PACKAGE_FORMAT || body.encoding !== MASTER_ENCODING ||
        !/^[a-f0-9]{64}$/.test(String(body.digest || '')) || !/^[a-f0-9]{64}$/.test(String(body.compressedDigest || '')) ||
        rawBytes < 1 || rawBytes > MASTER_MAX_RAW_BYTES || compressedBytes < 1 || compressedBytes > MASTER_MAX_COMPRESSED_BYTES ||
        base64Length < 4 || chunkSize < 1 || chunkSize > MASTER_MAX_CHUNK_CHARS || chunkCount < 1 || chunkCount > MASTER_MAX_CHUNKS ||
        Math.ceil(base64Length / chunkSize) !== chunkCount) {
      return sendJson(res, 400, { ok: false, code: 'invalid_master_manifest', error: 'The reference-master manifest, sizes, encoding or chunk layout is invalid.' });
    }
    const job = {
      id: crypto.randomUUID(), username: sess.username, createdAt: nowISO(), updatedAt: nowISO(),
      status: 'uploading', fileName: clipString(body.fileName || 'CareLink-Reference-Master.json', 240),
      format: body.format, encoding: body.encoding, digest: body.digest, compressedDigest: body.compressedDigest,
      rawBytes, compressedBytes, base64Length, chunkSize, chunkCount, received: {},
    };
    state.masterImports = (state.masterImports || []).filter((j) => j.status === 'completed' || (Date.now() - new Date(j.createdAt).getTime()) < 86400000).slice(-15);
    state.masterImports.push(job);
    await saveCloudState(state);
    return sendJson(res, 200, { ok: true, uploadId: job.id, chunkCount, received: 0 });
  }

  if (route === 'master-import/chunk' && method === 'POST') {
    const sess = getSession(state, req);
    if (!sess || sess.roleId !== 'chief') return sendJson(res, 403, { ok: false, error: 'Only the Chief System Administrator may upload reference-master chunks.' });
    const body = await readJsonBody(req);
    const job = ownedMasterImport(state, clipString(body.uploadId, 80), sess);
    if (job.status === 'completed') return sendJson(res, 409, { ok: false, code: 'master_already_imported', error: 'This reference-master upload is already complete.' });
    const index = Number(body.index);
    const data = typeof body.data === 'string' ? body.data : '';
    if (!Number.isSafeInteger(index) || index < 0 || index >= job.chunkCount || !data || data.length > MASTER_MAX_CHUNK_CHARS || !/^[A-Za-z0-9+/=]+$/.test(data)) {
      return sendJson(res, 400, { ok: false, code: 'invalid_master_chunk', error: 'The reference-master chunk index or content is invalid.' });
    }
    const expected = Math.min(job.chunkSize, job.base64Length - (index * job.chunkSize));
    if (data.length !== expected) return sendJson(res, 400, { ok: false, code: 'invalid_master_chunk_size', error: `Chunk ${index + 1} has ${data.length} characters; ${expected} were expected.` });
    const chunkDigest = crypto.createHash('sha256').update(data).digest('hex');
    if (job.received && job.received[index]) {
      if (job.received[index] !== chunkDigest) return sendJson(res, 409, { ok: false, code: 'master_chunk_conflict', error: 'A different chunk is already stored at this position. Restart the import.' });
      return sendJson(res, 200, { ok: true, uploadId: job.id, index, received: Object.keys(job.received).length, duplicate: true });
    }
    await writeKvString(masterChunkKey(job.id, index), data, { exSeconds: 86400 });
    job.received = job.received || {};
    job.received[index] = chunkDigest;
    job.updatedAt = nowISO();
    await saveCloudState(state);
    return sendJson(res, 200, { ok: true, uploadId: job.id, index, received: Object.keys(job.received).length });
  }

  if (route === 'master-import/finalize' && method === 'POST') {
    const sess = getSession(state, req);
    if (!sess || sess.roleId !== 'chief') return sendJson(res, 403, { ok: false, error: 'Only the Chief System Administrator may finish the reference-master import.' });
    const body = await readJsonBody(req);
    const job = ownedMasterImport(state, clipString(body.uploadId, 80), sess);
    if (job.status === 'completed') {
      return sendJson(res, 200, { ok: true, rev: state.rev, counts: job.counts, quality: job.quality, alreadyCompleted: true });
    }
    if (isGloballyActivated(state)) return sendJson(res, 409, { ok: false, code: 'master_import_locked', error: 'The installation was globally activated before this import finished.' });
    if (!job.received || Object.keys(job.received).length !== job.chunkCount) {
      return sendJson(res, 409, { ok: false, code: 'master_chunks_missing', error: `Only ${Object.keys(job.received || {}).length} of ${job.chunkCount} chunks have been uploaded.` });
    }
    const parts = [];
    for (let i = 0; i < job.chunkCount; i++) {
      const part = await readKvString(masterChunkKey(job.id, i));
      if (typeof part !== 'string' || crypto.createHash('sha256').update(part).digest('hex') !== job.received[i]) {
        throw new MasterPackageError(`Reference-master chunk ${i + 1} is missing or failed its integrity check.`, 'master_chunk_integrity');
      }
      parts.push(part);
    }
    const base64 = parts.join('');
    if (base64.length !== job.base64Length) throw new MasterPackageError('The assembled reference master has the wrong encoded size.', 'master_size_mismatch');
    const compressed = Buffer.from(base64, 'base64');
    if (compressed.length !== job.compressedBytes || crypto.createHash('sha256').update(compressed).digest('hex') !== job.compressedDigest) {
      throw new MasterPackageError('The assembled reference master failed its compressed-file integrity check.', 'master_digest_mismatch');
    }
    let raw;
    try {
      raw = zlib.brotliDecompressSync(compressed, { maxOutputLength: job.rawBytes + 1 }).toString('utf8');
    } catch {
      throw new MasterPackageError('The reference master could not be decompressed safely.', 'master_decompression_failed');
    }
    if (Buffer.byteLength(raw) !== job.rawBytes || crypto.createHash('sha256').update(raw).digest('hex') !== job.digest) {
      throw new MasterPackageError('The decompressed reference master failed its size or SHA-256 integrity check.', 'master_digest_mismatch');
    }
    let payload;
    try { payload = JSON.parse(raw); } catch { throw new MasterPackageError('The reference-master payload is not valid JSON.'); }
    const verified = validateReferencePayload(payload);

    const live = state.db || {};
    if (live.meta && live.meta.referenceMaster) {
      return sendJson(res, 409, { ok: false, code: 'master_already_imported', error: 'Another reference-master upload has already been committed to this installation.' });
    }
    const liveImports = Array.isArray(live.imports) ? live.imports : [];
    for (const [key, value] of Object.entries(payload.db)) {
      if (!SAFE_COLLECTION.test(key) || MASTER_PROTECTED_KEYS.has(key) || key === 'imports') continue;
      live[key] = value;
    }
    live.imports = liveImports;
    const importId = `REF-${job.id.slice(0, 8).toUpperCase()}`;
    live.imports.unshift({
      id: importId, at: nowISO(), by: sess.userId || sess.username, file: job.fileName,
      total: 3333, created: 3333, skipped: 0, review: 0,
      checksum: job.digest, referenceMaster: true, quality: verified.quality,
    });
    live.meta = {
      ...(live.meta || {}),
      referenceMaster: {
        id: importId, importedAt: nowISO(), importedBy: sess.username,
        digest: job.digest, counts: verified.counts, quality: verified.quality,
      },
    };
    state.db = live;
    state.rev = (state.rev || 0) + 1;
    /* Other clients must take the full paged snapshot rather than replaying an
       older delta stream across this wholesale, audited reference import. */
    state.deltas = [];
    appendServerAudit(state, sess.userId || sess.username, 'data.reference_master_imported', 'import', importId,
      `Full synthetic reference master imported: 3,333 patients; all ${verified.quality.checks.length} completeness groups passed; accounts/settings preserved.`);
    job.status = 'completed';
    job.completedAt = nowISO();
    job.updatedAt = nowISO();
    job.counts = verified.counts;
    job.quality = verified.quality;
    await saveCloudState(state);
    for (let i = 0; i < job.chunkCount; i++) await deleteKvKey(masterChunkKey(job.id, i));
    return sendJson(res, 200, { ok: true, rev: state.rev, saved: state.saved, counts: verified.counts, quality: verified.quality, importId });
  }

  /* 5d. Zero-local-drive automatic cloud feed of the bundled 3,333-patient
     100%-complete synthetic reference master (Chief Admin, pre-activation). */
  if (route === 'master-import/auto-seed' && method === 'POST') {
    const sess = getSession(state, req);
    if (!sess || sess.roleId !== 'chief') {
      return sendJson(res, 403, { ok: false, error: 'Only the Chief System Administrator may load the full reference dataset.' });
    }
    if (!state.setup || isGloballyActivated(state)) {
      return sendJson(res, 409, { ok: false, code: 'master_import_locked', error: 'Load the full reference dataset after First-Run setup and before Global System Activation.' });
    }
    const live = state.db || {};
    if (live.meta && live.meta.referenceMaster) {
      return sendJson(res, 200, {
        ok: true,
        alreadyCompleted: true,
        rev: state.rev,
        saved: state.saved,
        counts: live.meta.referenceMaster.counts,
        quality: live.meta.referenceMaster.quality,
        importId: live.meta.referenceMaster.id,
      });
    }
    const manifest = readBundledReferenceManifest();
    if (!manifest || manifest.format !== MASTER_PACKAGE_FORMAT || !Array.isArray(manifest.chunks)) {
      return sendJson(res, 404, {
        ok: false,
        code: 'master_bundle_unavailable',
        error: 'Bundled reference master not found on server filesystem; falling back to same-origin chunk stream.',
      });
    }
    const base64 = manifest.chunks.join('');
    if (base64.length !== manifest.base64Length) throw new MasterPackageError('Bundled reference master has invalid encoded length.', 'master_size_mismatch');
    const compressed = Buffer.from(base64, 'base64');
    if (compressed.length !== manifest.compressedBytes || crypto.createHash('sha256').update(compressed).digest('hex') !== manifest.compressedDigest) {
      throw new MasterPackageError('Bundled reference master failed compressed SHA-256 verification.', 'master_digest_mismatch');
    }
    let raw;
    try {
      raw = zlib.brotliDecompressSync(compressed, { maxOutputLength: manifest.rawBytes + 1 }).toString('utf8');
    } catch {
      throw new MasterPackageError('Bundled reference master could not be decompressed.', 'master_decompression_failed');
    }
    if (Buffer.byteLength(raw) !== manifest.rawBytes || crypto.createHash('sha256').update(raw).digest('hex') !== manifest.digest) {
      throw new MasterPackageError('Bundled reference master failed decompressed SHA-256 verification.', 'master_digest_mismatch');
    }
    const payload = JSON.parse(raw);
    const verified = validateReferencePayload(payload);

    const liveImports = Array.isArray(live.imports) ? live.imports : [];
    for (const [key, value] of Object.entries(payload.db)) {
      if (!SAFE_COLLECTION.test(key) || MASTER_PROTECTED_KEYS.has(key) || key === 'imports') continue;
      live[key] = value;
    }
    live.imports = liveImports;
    const importId = `REF-AUTO-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    live.imports.unshift({
      id: importId, at: nowISO(), by: sess.userId || sess.username,
      file: 'CareLink-Reference-Master-v6.6.json (Cloud Built-In)',
      total: 3333, created: 3333, skipped: 0, review: 0,
      checksum: manifest.digest, referenceMaster: true, quality: verified.quality,
    });
    live.meta = {
      ...(live.meta || {}),
      referenceMaster: {
        id: importId, importedAt: nowISO(), importedBy: sess.username,
        digest: manifest.digest, counts: verified.counts, quality: verified.quality,
      },
    };
    state.db = live;
    state.rev = (state.rev || 0) + 1;
    state.deltas = [];
    appendServerAudit(state, sess.userId || sess.username, 'data.reference_master_autoseeded', 'import', importId,
      `Cloud built-in 100%-complete synthetic reference master auto-fed into KV: 3,333 patients, ${verified.counts.visits} visits, ${verified.counts.pdcas} PDCAs; accounts/settings preserved.`);
    await saveCloudState(state);
    return sendJson(res, 200, { ok: true, rev: state.rev, saved: state.saved, counts: verified.counts, quality: verified.quality, importId });
  }

  /* 6. Shared Online Database State & Field-Level Patch Merge */
  if (route === 'state/collection' && method === 'GET') {
    const sess = getSession(state, req);
    if (!sess) return sendJson(res, 401, { ok: false, error: 'Sign in required to read the online database.' });
    const name = String(urlObj.searchParams.get('name') || '');
    const source = state.db && Array.isArray(state.db[name]) ? state.db[name] : null;
    if (!SAFE_COLLECTION.test(name) || !source) return sendJson(res, 404, { ok: false, error: 'The requested online collection does not exist.' });
    const offset = Number(urlObj.searchParams.get('offset') || '0');
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > source.length) return sendJson(res, 400, { ok: false, error: 'The collection-page offset is invalid.' });
    const records = [];
    let bytes = 0;
    let nextOffset = offset;
    while (nextOffset < source.length) {
      let record = source[nextOffset];
      if (name === 'users') record = sanitizeDbForClient({ users: [record] }).users[0];
      const size = Buffer.byteLength(JSON.stringify(record));
      if (size > 3 * 1024 * 1024) return sendJson(res, 500, { ok: false, error: `Record ${record && record.id} is too large for a paged online response.` });
      if (records.length && bytes + size > STATE_PAGE_MAX_BYTES) break;
      records.push(record);
      bytes += size;
      nextOffset++;
      if (bytes >= STATE_PAGE_MAX_BYTES) break;
    }
    return sendJson(res, 200, {
      ok: true, name, offset, nextOffset, done: nextOffset >= source.length,
      total: source.length, records, bytes, rev: state.rev || 0, saved: state.saved,
    });
  }

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
    const split = splitLargeStateCollections(sanitizeDbForClient(state.db || {}));
    return sendJson(res, 200, {
      ok: true,
      rev: state.rev || 0,
      saved: state.saved,
      db: split.db,
      ...(split.pagedCollections.length ? { pagedCollections: split.pagedCollections, pageMaxBytes: STATE_PAGE_MAX_BYTES } : {}),
    });
  }

  if (route === 'state' && method === 'PUT') {
    const sess = getSession(state, req);
    if (!sess) return sendJson(res, 401, { ok: false, error: 'Sign in required to write to the online database.' });
    const body = await readJsonBody(req);
    const patches = (Array.isArray(body.patches) ? body.patches : []).slice(0, MAX_PATCHES_PER_WRITE);
    state.db = state.db || { meta: { schema: 6, version: '6.6.0' } };
    const canAdminAccounts = ACCOUNT_ADMIN_ROLES.has(sess.roleId);
    const applied = [];
    const rejected = [];
    let merged = 0;

    for (const p of patches) {
      if (!p || typeof p.c !== 'string' || !SAFE_COLLECTION.test(p.c) || FORBIDDEN_KEYS.has(p.c)) continue;
      if (p.c === 'settings') {
        let appliedPatch = p;
        if (p.set && p.set.value) {
          const incoming = safeObject(p.set.value);
          /* Global activation is controlled only by setup/activate-global.
             Ordinary browser patches may change preferences, but can neither
             switch demo mode back on nor activate the installation themselves. */
          if (isGloballyActivated(state)) {
            incoming.globallyActivated = true;
            incoming.awaitingGlobalActivation = false;
          } else {
            delete incoming.globallyActivated;
            delete incoming.demoDisabled;
          }
          state.db.settings = { ...(state.db.settings || {}), ...incoming };
          /* Deltas go to other browsers too; publish the sanitized values, not
             the client's original activation/demo flags. */
          appliedPatch = { ...p, set: { ...p.set, value: incoming } };
        }
        applied.push(appliedPatch);
        continue;
      }
      if (p.c === 'audit') {
        state.db.audit = state.db.audit || [];
        if (p.set && !state.db.audit.some((a) => a.hash === p.set.hash && a.seq === p.set.seq)) {
          state.db.audit.push(safeObject(p.set));
          if (state.db.audit.length > 5000) state.db.audit.splice(0, state.db.audit.length - 5000);
        }
        applied.push(p);
        continue;
      }
      if (!Array.isArray(state.db[p.c])) state.db[p.c] = [];
      const col = state.db[p.c];
      const idx = col.findIndex((r) => r && r.id === p.id);
      const set = safeObject(p.set);

      /* Access-granting changes to user records are reserved for account administrators;
         everyone else may only edit non-privileged fields on their own record. */
      if (p.c === 'users' && !canAdminAccounts) {
        const target = idx >= 0 ? col[idx] : null;
        const isSelf = target && (target.id === sess.userId || String(target.username || '').toLowerCase() === sess.username);
        if (p.del || !isSelf) { rejected.push({ c: p.c, id: p.id, reason: 'not_permitted' }); continue; }
        for (const k of Object.keys(set)) if (PRIVILEGED_USER_FIELDS.has(k)) delete set[k];
      }

      if (p.del) {
        if (idx >= 0) col.splice(idx, 1);
        applied.push(p);
        continue;
      }
      if (idx < 0) {
        const rec = { ...set, id: p.id };
        if (p.c === 'users') { delete rec.hash; delete rec.salt; }
        col.push(rec);
      } else {
        const cur = col[idx];
        const before = safeObject(p.before);
        for (const [k, v] of Object.entries(set)) {
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
      applied.push(p.c === 'users' ? { ...p, set } : p);

      /* Keep the server-side credential role/county in step with an administrator's edit,
         so the session role used for authorization never drifts from the user record. */
      if (p.c === 'users' && canAdminAccounts) {
        const rec = col.find((r) => r && r.id === p.id);
        const uname = rec && String(rec.username || '').toLowerCase();
        const cred = uname && Object.prototype.hasOwnProperty.call(state.creds || {}, uname) ? state.creds[uname] : null;
        if (cred && !(cred.roleId === 'chief' && sess.roleId !== 'chief')) {
          if (set.roleId && !(set.roleId === 'chief' && sess.roleId !== 'chief')) cred.roleId = set.roleId;
          if (set.countyId) cred.countyId = set.countyId;
          if (set.name) cred.name = set.name;
        }
      }
    }

    state.rev = (state.rev || 0) + 1;
    state.deltas = state.deltas || [];
    state.deltas.push({ rev: state.rev, at: nowISO(), actor: sess.username, patches: applied });
    if (state.deltas.length > 60) state.deltas.splice(0, state.deltas.length - 60);
    if (rejected.length) {
      appendServerAudit(state, sess.userId || sess.username, 'sync.patch_rejected', 'users', '-',
        `${rejected.length} user-record change(s) refused: role ${sess.roleId} may not edit account access`);
    }
    await saveCloudState(state);
    return sendJson(res, 200, { ok: true, rev: state.rev, merged, rejected, saved: state.saved });
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
    if (!sess) return sendJson(res, 401, { ok: false, error: 'Sign in to use Shared Online Intelligence.' });
    const body = await readJsonBody(req);
    const ans = await answerOnlineIntelligence(state, sess, body);
    return sendJson(res, 200, ans);
  }

  /* 10. Public County-Routed Urgent Account Request / Recovery */
  if (route === 'public/account-request' && method === 'POST') {
    const body = sanitizePublicSubmission(await readJsonBody(req));
    const ref = publicRef('REQ');
    const countyId = body.assignedCountyId === 'homabay' || body.countyId === 'homabay' ? 'homabay' : 'kisumu';
    const assignedAdminUsername = countyId === 'homabay' ? 'homabay.admin' : 'kisumu.admin';
    const rec = { ...body, id: ref, ref, countyId, assignedCountyId: countyId, assignedAdminUsername, urgent: true, status: 'open', submittedAt: nowISO() };
    state.accountRequests = state.accountRequests || [];
    state.accountRequests.unshift(rec);
    state.accountRequests.splice(MAX_PUBLIC_REQUESTS);
    if (state.db) {
      state.db.accountRequests = state.db.accountRequests || [];
      state.db.accountRequests.unshift(rec);
      state.db.accountRequests.splice(MAX_PUBLIC_REQUESTS);
    }
    appendServerAudit(state, 'public', 'account.requested.county_urgent', 'accountRequest', ref, `URGENT -> ${assignedAdminUsername}: ${body.name || ''} (${body.jobTitle || ''})`);
    await saveCloudState(state);
    return sendJson(res, 200, { ok: true, ref, assignedCountyId: countyId, assignedAdminUsername });
  }

  if (route === 'auth/forgot' && method === 'POST') {
    const body = sanitizePublicSubmission(await readJsonBody(req));
    const ref = publicRef('REC');
    const countyId = body.assignedCountyId === 'homabay' || body.countyId === 'homabay' ? 'homabay' : 'kisumu';
    const assignedAdminUsername = countyId === 'homabay' ? 'homabay.admin' : 'kisumu.admin';
    const rec = { ...body, id: ref, reference: ref, countyId, assignedCountyId: countyId, assignedAdminUsername, urgent: true, status: 'open', at: nowISO() };
    state.recoveryRequests = state.recoveryRequests || [];
    state.recoveryRequests.unshift(rec);
    state.recoveryRequests.splice(MAX_PUBLIC_REQUESTS);
    if (state.db) {
      state.db.recoveryRequests = state.db.recoveryRequests || [];
      state.db.recoveryRequests.unshift(rec);
      state.db.recoveryRequests.splice(MAX_PUBLIC_REQUESTS);
    }
    appendServerAudit(state, body.username || 'unknown', 'auth.recovery_requested.county_urgent', 'user', body.username || '-', `URGENT -> ${assignedAdminUsername} · Recovery ${ref}`);
    await saveCloudState(state);
    return sendJson(res, 200, { ok: true, reference: ref, assignedCountyId: countyId, assignedAdminUsername });
  }

  return sendJson(res, 404, { ok: false, error: `Unknown CareLink API endpoint: /api/${route}` });
}

/* Convert storage/configuration failures into an explicit unavailable response.
   Most importantly, a failed KV read/write must never be reported as a successful
   online save or silently diverted to an ephemeral local copy. */
export default async function handler(req, res) {
  try {
    return await handleRequest(req, res);
  } catch (err) {
    if (res.writableEnded || res.finished) return;
    const storage = err && err.name === 'CloudStorageError';
    const master = err && err.name === 'MasterPackageError';
    const status = storage ? (err.statusCode || 503) : (master ? (err.statusCode || 400) : 500);
    return sendJson(res, status, {
      ok: false,
      code: storage || master ? err.code : 'internal_error',
      error: storage || master ? err.message : 'The CareLink online service could not complete that request.',
    });
  }
}
