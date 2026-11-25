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
import net from 'node:net';
import path from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { AsyncLocalStorage } from 'node:async_hooks';
import officialStructure from './official-structure.mjs';
import {executiveMember,referralVisible,canSubmitMasterReport,BOARD_ROLES,boardSnapshot} from './coordination-policy.mjs';
import { generateReferenceManifest } from './synthetic-reference.mjs';
import careRules from '../v6/src/care_rules.js';
import careWorkflow from '../v6/src/care_workflow.js';
import devotionRules from '../v6/src/devotion_rules.js';

/* The interactive evaluation deployment must be explicitly configured and
   backed by its own KV database. Its namespace must never address live keys. */
const TRIAL_MODE = process.env.CARELINK_TRIAL_MODE === 'isolated-v1';
const LIVE_CLOUD_KEY = 'carelink_cloud_v66';
const CLOUD_KEY = TRIAL_MODE ? 'carelink_trial_cloud_v1' : LIVE_CLOUD_KEY;
/* Every request remembers the exact primary snapshot it read. Atomic compare-
   and-swap prevents a long-running/stale request from replacing newer accounts
   or records, including saves that do not increment the public revision. */
const requestSnapshot = new AsyncLocalStorage();
const PRIMARY_READ_LUA = "return redis.call('GET', KEYS[1])";
/* Redis hashes the exact current value on its writable primary. An unchanged
   response omits the payload, NOT the online check. No public revision, TTL or
   locally cached authorization can stand in for this digest verification. The
   protocol uses Redis arrays/strings (not cjson re-encoding of stored data). */
const PRIMARY_SNAPSHOT_LUA = "-- carelink-primary-snapshot-v1\nlocal current=redis.call('GET',KEYS[1]); if not current then return {'missing',false} end; local digest=redis.sha1hex(current); if digest==ARGV[1] then return {digest,false} end; return {digest,current}";
let _primarySnapshotCache = null; /* one immutable raw root, verified afresh on every use */
const CLOUD_CAS_LUA = "local current=redis.call('GET',KEYS[1]); local digest=current and redis.sha1hex(current) or 'missing'; if digest~=ARGV[1] then if current==ARGV[2] then return 2 else return 0 end end; redis.call('SET',KEYS[1],ARGV[2]); return 1";
function snapshotDigest(value) {
  return value == null ? 'missing' : crypto.createHash('sha1').update(String(value)).digest('hex');
}
async function commitCloudSnapshot(value, { timeoutMs = 10000 } = {}) {
  const ctx = requestSnapshot.getStore();
  if (!ctx || !ctx.snapshotKnown) throw new CloudStorageError('kv_snapshot_missing', 'The online snapshot could not be verified; no change was saved.');
  const result = await runKvCommand(['EVAL', CLOUD_CAS_LUA, '1', CLOUD_KEY, ctx.snapshot, String(value)], timeoutMs);
  if (![1, 2].includes(Number(result))) {
    const err = new CloudStorageError('state_conflict', 'The online database changed while this request was running. Refresh and retry; no change was saved.');
    err.statusCode = 409;
    throw err;
  }
  ctx.snapshot = snapshotDigest(value);
  invalidateManifestCache();
}

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

async function verifyLoginPassword(password, saltHex, expectedHex) {
  if(!saltHex || !expectedHex) return false;
  try {
    const actual = await new Promise((resolve,reject)=>crypto.pbkdf2(String(password),Buffer.from(saltHex,'hex'),PBKDF2_ROUNDS,32,'sha256',(error,key)=>error?reject(error):resolve(key)));
    const expected = Buffer.from(expectedHex,'hex');
    return actual.length===expected.length && crypto.timingSafeEqual(actual,expected);
  } catch { return false; }
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

function cleanKvUrl(raw) {
  let s = String(raw || '').trim().replace(/^["']+|["']+$/g, '').trim();
  if (!s) return '';
  if (/^[a-z0-9.-]+\.upstash\.io(?::\d+)?(\/.*)?$/i.test(s)) s = `https://${s}`;
  return s.replace(/\/+$/, '');
}

function cleanKvToken(raw) {
  return String(raw || '')
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .trim()
    .replace(/^Bearer\s+/i, '')
    .trim();
}

let _pinnedKvIndex = 0;

function kvCandidates({ allowReadOnlyFallback = false } = {}) {
  /* Trial has no fallback to a production KV variable or replica token. */
  if (TRIAL_MODE) {
    const url = cleanKvUrl(process.env.CARELINK_TRIAL_KV_REST_API_URL);
    const token = cleanKvToken(process.env.CARELINK_TRIAL_KV_REST_API_TOKEN);
    return url && token ? [{url, token, readOnly:false}] : [];
  }
  const pairs = [
    [process.env.CARELINK_KV_REST_API_URL, process.env.CARELINK_KV_REST_API_TOKEN],
    [process.env.KV_REST_API_URL, process.env.KV_REST_API_TOKEN],
    [process.env.UPSTASH_REDIS_REST_URL, process.env.UPSTASH_REDIS_REST_TOKEN],
    [process.env.STORAGE_REST_API_URL, process.env.STORAGE_REST_API_TOKEN],
  ];
  const out = [];
  const seen = new Set();
  const add = (u, t, readOnly = false) => {
    const url = cleanKvUrl(u);
    const token = cleanKvToken(t);
    if (!url || !token) return;
    const id = `${url}|${token}`;
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ url, token, readOnly });
  };
  for (const [u, t] of pairs) add(u, t, false);
  /* Fallback cross-pairing only when env vars used mixed prefixes (e.g. KV_REST_API_URL + UPSTASH_REDIS_REST_TOKEN) */
  if (!out.length) {
    const anyUrl = process.env.CARELINK_KV_REST_API_URL || process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.STORAGE_REST_API_URL || '';
    const anyTok = process.env.CARELINK_KV_REST_API_TOKEN || process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.STORAGE_REST_API_TOKEN || '';
    add(anyUrl, anyTok, false);
  }
  if (allowReadOnlyFallback) {
    add(process.env.KV_REST_API_URL, process.env.KV_REST_API_READ_ONLY_TOKEN, true);
    add(process.env.UPSTASH_REDIS_REST_URL, process.env.UPSTASH_REDIS_REST_READ_ONLY_TOKEN, true);
  }
  if (out.length > 1 && _pinnedKvIndex > 0 && _pinnedKvIndex < out.length) {
    const pinned = out[_pinnedKvIndex];
    return [pinned, ...out.filter((_, idx) => idx !== _pinnedKvIndex)];
  }
  return out;
}

function kvConfig() {
  const list = kvCandidates();
  return list.length ? list[0] : null;
}

function redisTcpCandidates() {
  if (TRIAL_MODE) return [];
  const raws = [
    process.env.CARELINK_REDIS_URL,
    process.env.KV_URL,
    process.env.REDIS_URL,
    process.env.UPSTASH_REDIS_URL,
    process.env.STORAGE_URL,
  ];
  const out = [];
  const seen = new Set();
  for (const r of raws) {
    const clean = String(r || '').trim().replace(/^["']+|["']+$/g, '').trim();
    if (!/^rediss?:\/\//i.test(clean)) continue;
    try {
      const u = new URL(clean);
      const id = `${u.protocol}//${u.username}:${u.password}@${u.host}${u.pathname}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const dbMatch = /^\/(\d+)$/.exec(u.pathname || '');
      out.push({
        protocol: u.protocol.toLowerCase(),
        host: u.hostname,
        port: Number(u.port) || 6379,
        username: u.username ? decodeURIComponent(u.username) : '',
        password: u.password ? decodeURIComponent(u.password) : '',
        db: dbMatch ? Number(dbMatch[1]) : 0,
      });
    } catch { /* ignore malformed URL */ }
  }
  return out;
}

/* A request that has selected a backing store must never read its snapshot
   from one database and commit it to a different failover database. */
function restStorageId(kv) { return `rest:${kv.url}|${kv.token}`; }
function tcpStorageId(kv) { return `tcp:${kv.protocol}|${kv.host}|${kv.port}|${kv.username}|${kv.password}|${kv.db}`; }
function boundRestCandidates(options = {}) {
  const selected = requestSnapshot.getStore()?.storageId;
  return kvCandidates(options).filter(kv => !selected || restStorageId(kv) === selected);
}
function boundTcpCandidates() {
  const selected = requestSnapshot.getStore()?.storageId;
  return redisTcpCandidates().filter(kv => !selected || tcpStorageId(kv) === selected);
}
function bindRequestStore(id) {
  const ctx = requestSnapshot.getStore();
  if (ctx && !ctx.storageId) ctx.storageId = id;
}

function encodeRespCommand(args) {
  const chunks = [Buffer.from(`*${args.length}\r\n`, 'utf8')];
  for (const arg of args) {
    const b = Buffer.isBuffer(arg) ? arg : Buffer.from(String(arg), 'utf8');
    chunks.push(Buffer.from(`$${b.length}\r\n`, 'utf8'), b, Buffer.from('\r\n', 'utf8'));
  }
  return Buffer.concat(chunks);
}

function parseNextRespReply(buf, offset = 0, depth = 0) {
  if (depth > 8) return { ok:false, error:'Redis response nesting is too deep', next:offset };
  const crlf = buf.indexOf('\r\n', offset);
  if (crlf === -1) return null;
  const prefix = buf[offset];
  const head = buf.subarray(offset + 1, crlf).toString('utf8');
  if (prefix === 43) return { ok: true, value: head, next: crlf + 2 }; // '+'
  if (prefix === 45) return { ok: false, error: head, next: crlf + 2 }; // '-'
  if (prefix === 58) return { ok: true, value: Number(head), next: crlf + 2 }; // ':'
  if (prefix === 36) { // '$'
    const byteLen = Number(head);
    if (byteLen === -1) return { ok: true, value: null, next: crlf + 2 };
    const end = crlf + 2 + byteLen;
    if (buf.length < end + 2) return null;
    const strVal = buf.subarray(crlf + 2, end).toString('utf8');
    return { ok: true, value: strVal, next: end + 2 };
  }
  if (prefix === 42) { // '*' — conditional primary reads return [digest, payload-or-null]
    const count = Number(head);
    if (count === -1) return { ok:true, value:null, next:crlf+2 };
    if (!Number.isSafeInteger(count) || count < 0 || count > 1024) return { ok:false, error:'Invalid Redis array response', next:crlf+2 };
    const values = []; let next = crlf + 2;
    for (let i = 0; i < count; i++) {
      const part = parseNextRespReply(buf, next, depth + 1);
      if (!part || !part.ok) return part;
      values.push(part.value); next = part.next;
    }
    return { ok:true, value:values, next };
  }
  return { ok: false, error: `Unexpected RESP prefix ${String.fromCharCode(prefix)}`, next: crlf + 2 };
}

function execRedisTcpCommand(cfg, cmdArgs, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const pipeline = [];
    if (cfg.password) {
      pipeline.push(cfg.username ? ['AUTH', cfg.username, cfg.password] : ['AUTH', cfg.password]);
    }
    if (cfg.db > 0) pipeline.push(['SELECT', String(cfg.db)]);
    pipeline.push(cmdArgs);
    const expectedReplies = pipeline.length;
    const payload = Buffer.concat(pipeline.map(encodeRespCommand));

    let settled = false;
    let recv = Buffer.alloc(0);
    const finish = (err, val) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { sock.destroy(); } catch { /* ignore */ }
      if (err) reject(err);
      else resolve(val);
    };

    const sock = cfg.protocol === 'rediss:'
      ? tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host })
      : net.createConnection({ host: cfg.host, port: cfg.port });

    const timer = setTimeout(() => {
      finish(new Error(`Redis TCP connection timed out (${cfg.host}:${cfg.port})`));
    }, timeoutMs);

    sock.once('error', (err) => finish(err));
    sock.once('connect', () => {
      if (cfg.protocol !== 'rediss:') sock.write(payload);
    });
    sock.once('secureConnect', () => {
      sock.write(payload);
    });
    sock.on('data', (chunk) => {
      recv = recv.length ? Buffer.concat([recv, chunk]) : chunk;
      let pos = 0;
      const replies = [];
      while (replies.length < expectedReplies) {
        const parsed = parseNextRespReply(recv, pos);
        if (!parsed) return;
        pos = parsed.next;
        replies.push(parsed);
      }
      for (const r of replies) {
        if (!r.ok) return finish(new Error(r.error || 'Redis error'));
      }
      return finish(null, replies[replies.length - 1].value);
    });
    sock.once('end', () => {
      if (!settled) finish(new Error(`Redis connection closed before reply (${cfg.host})`));
    });
  });
}

function requireKv(opts = {}) {
  const list = kvCandidates(opts);
  const tcpList = redisTcpCandidates();
  if (!list.length && !tcpList.length) {
    throw new CloudStorageError(
      'kv_required',
      'CareLink online storage is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL / REDIS_URL / KV_URL) in Vercel; no local fallback is used.'
    );
  }
  return list[0] || { tcp: tcpList[0] };
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
    revokedSessions: {}, // token -> epochMs (revokes stateless HMAC tokens on explicit logout)
    deltas: [],      // [{ rev, at, patches }]
    mergeJournal: [],
    audit: [],
    activations: [],
    emergencies: [],
    accountRequests: [],
    recoveryRequests: [],
    masterImports: [],
    loginFailures: {},
    devices: {},
    devicePolicyInstalled: false,
    credentialExports: [],
    mailboxes: {},
  };
}

function normalizeStore(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CloudStorageError('kv_invalid_state', 'CareLink KV contains an invalid online database document; it was not replaced.');
  }
  /* Keep forwards/backwards-compatible defaults without ever treating a local
     object as the stored state.  The object returned here came from KV. */
  const state = { ...blankStore(), ...value };
  for (const key of ['creds', 'sessions', 'revokedSessions', 'loginFailures', 'devices', 'mailboxes']) {
    if (!state[key] || typeof state[key] !== 'object' || Array.isArray(state[key])) state[key] = {};
  }
  for (const key of ['deltas', 'mergeJournal', 'audit', 'activations', 'emergencies', 'accountRequests', 'recoveryRequests', 'masterImports', 'credentialExports']) {
    if (!Array.isArray(state[key])) state[key] = [];
  }
  return state;
}

const CLOUD_GZIP_FORMAT = 'carelink-cloud-gzip-v1';
const CLOUD_COMPRESS_THRESHOLD = 128 * 1024;
const MAX_CLOUD_STATE_BYTES = 128 * 1024 * 1024;

let _manifestReadCache = null; /* { url, at, value } — short burst coalescer on production Upstash hosts */
let _manifestReadInflight = null;

function isTestKvHost(urlStr) {
  try {
    return /\.test$|\.local$|^localhost$/i.test(new URL(urlStr).hostname);
  } catch {
    return true;
  }
}

function invalidateManifestCache() {
  _manifestReadCache = null;
  _manifestReadInflight = null;
}

function cleanKvErrorSnippet(rawText) {
  const s = String(rawText || '').trim();
  if (!s) return '';
  if (/<!doctype html|<html/i.test(s)) {
    if (/cloudflare|just a moment|attention required/i.test(s)) {
      return 'Cloudflare WAF blocked the request with an HTML 403 challenge';
    }
    const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(s);
    if (titleMatch && titleMatch[1]) return titleMatch[1].replace(/\s+/g, ' ').trim().slice(0, 120);
    return 'HTML error page returned instead of Upstash JSON (verify KV_REST_API_URL points to https://<endpoint>.upstash.io)';
  }
  return s.replace(/\s+/g, ' ').slice(0, 160);
}

function hostLabelOf(urlStr) {
  try { return new URL(urlStr).host; } catch { return ''; }
}

function isKvQuotaFailure(status, text) {
  return status === 429 || /max[\w\s-]*(daily|monthly|requests?\s+limit|bandwidth|data\s*size)|quota|limit\s*exceeded|reached[\w\s-]*plan\s+limits|(?:monthly\s+)?bandwidth\s+limit/i.test(String(text || ''));
}

function classifyKvFailure(op, status, errText, hostHint = '') {
  const msg = cleanKvErrorSnippet(errText);
  const hostNote = hostHint && !/\.test$|\.local$|^localhost$/i.test(hostHint) ? ` on ${hostHint}` : '';
  if (/WRONGTYPE/i.test(msg)) {
    return new CloudStorageError(
      'kv_invalid_state',
      'CareLink KV holds a wrong-type or corrupted database key (WRONGTYPE); click Reset 4-Step Setup to clear and re-initialise it.'
    );
  }
  if (op === 'write' && (status === 413 || /max[\w\s-]*(request|value|record)[\w\s-]*size|too large|entity too large/i.test(msg))) {
    return new CloudStorageError('kv_payload_too_large', msg || 'KV command exceeded single-key size limit.');
  }
  if (isKvQuotaFailure(status, errText)) {
    const err = new CloudStorageError(
      'kv_quota_exceeded',
      `The mandatory CareLink KV store${hostNote} refused the ${op} because an Upstash usage limit was reached${status ? ' (HTTP ' + status + ')' : ''}: ${msg || 'request limit reached'}. This is a database quota, not a staff password or KV-token rejection. Check bandwidth, commands and storage in the Upstash console, then confirm when service can resume. Reducing traffic cannot reset usage already counted. Do not reset setup or rotate passwords to repair a quota; no local fallback is used and no change is acknowledged.`
    );
    err.retryAfterSeconds = 300;
    return err;
  }
  if (/archived|paused|suspended/i.test(msg)) {
    return new CloudStorageError(
      op === 'write' ? 'kv_write_failed' : 'kv_unavailable',
      `The mandatory CareLink KV store${hostNote} refused the ${op} (Upstash database is paused/archived${status ? ' HTTP ' + status : ''}: ${msg}). Check its status in the Upstash console; do not reset this installation. No local fallback is used.`
    );
  }
  if (status === 401 || status === 403 || /unauthorized|invalid[\w\s-]*token|wrongpass|noperm|no permissions|forbidden/i.test(msg)) {
    const readOnlyHint = /noperm|no permissions/i.test(msg)
      ? ' — a Read-Only token is configured instead of the Read/Write REST token'
      : '';
    const rawDetail = msg && !/^unauthorized$/i.test(msg) ? ` [${msg}]` : '';
    return new CloudStorageError(
      op === 'write' ? 'kv_write_failed' : 'kv_unavailable',
      `The mandatory CareLink KV store${hostNote} refused the ${op} (HTTP ${status || 401}: Upstash rejected the KV credentials${readOnlyHint}${rawDetail} — verify KV_REST_API_URL & KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL & UPSTASH_REDIS_REST_TOKEN in Vercel Environment Variables match an active Upstash database without IP allowlist restrictions, then Redeploy); no local fallback is used.`
    );
  }
  if (op === 'write') {
    const extra = msg && msg !== 'write unavailable' ? ` (${status ? 'HTTP ' + status + ': ' : ''}${msg})` : '';
    return new CloudStorageError('kv_write_failed', `CareLink KV${hostNote} refused the write${extra}; the change was not acknowledged.`);
  }
  const extra = msg && msg !== 'read unavailable' ? ` (${status ? 'HTTP ' + status + ': ' : ''}${msg})` : '';
  return new CloudStorageError('kv_unavailable', `The mandatory CareLink KV store${hostNote} refused the read${extra}; no local fallback is used.`);
}

async function parseKvHttpResponse(response) {
  if (typeof response.text === 'function') {
    const raw = await response.text();
    try {
      return { payload: JSON.parse(raw), rawText: raw };
    } catch {
      return { payload: undefined, rawText: raw };
    }
  }
  try {
    const payload = await response.json();
    return { payload, rawText: '' };
  } catch {
    return { payload: undefined, rawText: '' };
  }
}

function unwrapUpstashStringResult(result) {
  let out = result;
  if (typeof out === 'string' && out.length >= 2 && out.startsWith('"') && out.endsWith('"')) {
    try {
      const unwrapped = JSON.parse(out);
      if (typeof unwrapped === 'string') out = unwrapped;
    } catch {
      /* keep raw result string */
    }
  }
  return out;
}

async function fetchKvWithRetry(url, init = {}, timeoutMs = 8000) {
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    let timer = null;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let inSetup = true;
    if (controller && timeoutMs > 0) {
      timer = setTimeout(() => {
        if (inSetup) return;
        try { controller.abort(); } catch { /* ignore */ }
      }, timeoutMs);
    }
    inSetup = false;
    try {
      const reqInit = controller ? { ...init, signal: controller.signal } : init;
      return await fetch(url, reqInit);
    } catch (err) {
      lastErr = err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  throw lastErr || new Error('KV request failed');
}

async function readKvStringFromCandidate(kv, key) {
  const isMock = isTestKvHost(kv.url);
  const hostHint = hostLabelOf(kv.url);
  const baseHeaders = isMock
    ? { Authorization: `Bearer ${kv.token}` }
    : { Authorization: `Bearer ${kv.token}`, Accept: 'application/json', 'User-Agent': 'upstash-redis-js/1.34.0' };
  let response;
  try {
    response = await fetchKvWithRetry(`${kv.url}/get/${key}`, { headers: baseHeaders });
  } catch {
    throw new CloudStorageError('kv_unavailable', 'The mandatory CareLink KV store could not be read; no local fallback is used.');
  }
  let { payload, rawText } = await parseKvHttpResponse(response);
  /* On real Upstash/WAF endpoints, if GET /get/<key> returned 403/404/405, retry
     using Upstash's canonical POST root JSON command API (["GET", key]). */
  if (!isMock && !response.ok && (response.status === 403 || response.status === 404 || response.status === 405)
      && !isKvQuotaFailure(response.status, payload?.error || rawText)) {
    try {
      const postResp = await fetchKvWithRetry(kv.url, {
        method: 'POST',
        headers: { ...baseHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(['GET', key]),
      });
      if (postResp.ok) {
        response = postResp;
        ({ payload, rawText } = await parseKvHttpResponse(postResp));
      }
    } catch { /* keep original response error */ }
  }
  if (payload === undefined) {
    if (!response.ok) {
      throw classifyKvFailure('read', response.status, rawText, hostHint);
    }
    throw new CloudStorageError('kv_invalid_response', 'CareLink KV returned an unreadable response; no local fallback is used.');
  }
  const errMsg = payload && typeof payload === 'object' && payload.error ? String(payload.error) : '';
  if (!response.ok || errMsg) {
    throw classifyKvFailure('read', response.status, errMsg || rawText, hostHint);
  }
  if (!payload || !Object.prototype.hasOwnProperty.call(payload, 'result')) {
    throw new CloudStorageError('kv_invalid_response', 'CareLink KV returned an invalid response; no local fallback is used.');
  }
  return unwrapUpstashStringResult(payload.result);
}

async function readKvString(key) {
  if (requestSnapshot.getStore()) {
    /* Lua executes on the writable primary, avoiding lagging replica snapshots
       for both authorization and mutations. Capture the immutable cache entry
       before awaiting: concurrent requests may replace the global entry. */
    let value;
    if (key === CLOUD_KEY) {
      const cached = _primarySnapshotCache;
      const result = await runKvCommand(['EVAL', PRIMARY_SNAPSHOT_LUA, '1', key, cached ? cached.digest : ''], 10000, 'read');
      if (!Array.isArray(result) || result.length !== 2 || !/^(?:missing|[a-f0-9]{40})$/.test(result[0])) {
        throw new CloudStorageError('kv_invalid_response', 'CareLink KV returned an invalid primary snapshot check; no cached state was used.');
      }
      const [digest, payload] = result;
      if (digest === 'missing' && payload == null) value = null;
      else if (payload == null && cached && cached.digest === digest) value = cached.value;
      else if (typeof payload === 'string' && snapshotDigest(payload) === digest) value = payload;
      else throw new CloudStorageError('kv_invalid_response', 'CareLink KV could not verify the current primary snapshot; no cached state was used.');
      /* Bound process memory. Even a warm cache is never a fallback: an error,
         missing key or different primary digest cannot reuse its old payload. */
      _primarySnapshotCache = typeof value === 'string' && Buffer.byteLength(value) <= 16 * 1024 * 1024
        ? { digest, value } : null;
      const ctx = requestSnapshot.getStore();
      ctx.snapshot = digest;
      ctx.snapshotKnown = true;
    } else {
      value = await runKvCommand(['EVAL', PRIMARY_READ_LUA, '1', key], 10000, 'read');
    }
    return unwrapUpstashStringResult(value);
  }
  const candidates = kvCandidates({ allowReadOnlyFallback: true });
  const tcpCandidates = redisTcpCandidates();
  if (!candidates.length && !tcpCandidates.length) requireKv();
  const primaryUrl = candidates[0] ? candidates[0].url : `tcp://${tcpCandidates[0].host}`;
  const canBurstCache = key === CLOUD_KEY && !isTestKvHost(primaryUrl);
  if (canBurstCache) {
    if (_manifestReadCache && _manifestReadCache.url === primaryUrl && (Date.now() - _manifestReadCache.at) < 1500) {
      return _manifestReadCache.value;
    }
    if (_manifestReadInflight) return _manifestReadInflight;
  }
  const runRead = async () => {
    let lastErr = null;
    for (let idx = 0; idx < candidates.length; idx++) {
      const cand = candidates[idx];
      try {
        const val = await readKvStringFromCandidate(cand, key);
        if (idx > 0 && !cand.readOnly) _pinnedKvIndex = idx;
        if (key === CLOUD_KEY && !isTestKvHost(cand.url)) {
          _manifestReadCache = { url: primaryUrl, at: Date.now(), value: val };
        }
        return val;
      } catch (err) {
        lastErr = err;
        if (err && err.code === 'kv_invalid_state') throw err;
      }
    }
    for (const tcpCfg of tcpCandidates) {
      try {
        const rawVal = await execRedisTcpCommand(tcpCfg, ['GET', key]);
        const val = unwrapUpstashStringResult(rawVal);
        if (key === CLOUD_KEY && !isTestKvHost(`https://${tcpCfg.host}`)) {
          _manifestReadCache = { url: primaryUrl, at: Date.now(), value: val };
        }
        return val;
      } catch (err) {
        const msg = String((err && err.message) || '');
        if (/WRONGTYPE/i.test(msg)) throw classifyKvFailure('read', 400, msg, tcpCfg.host);
        if (!lastErr) lastErr = classifyKvFailure('read', 503, msg, tcpCfg.host);
      }
    }
    throw lastErr;
  };
  if (!canBurstCache) return runRead();
  _manifestReadInflight = runRead().finally(() => { _manifestReadInflight = null; });
  return _manifestReadInflight;
}

async function writeKvString(key, value, { exSeconds = 0, timeoutMs = 10000 } = {}) {
  invalidateManifestCache();
  const candidates = boundRestCandidates({ allowReadOnlyFallback: false });
  const tcpCandidates = boundTcpCandidates();
  if (!candidates.length && !tcpCandidates.length) { if (requestSnapshot.getStore()?.storageId) throw new CloudStorageError('kv_unavailable', 'The selected online store is unavailable; retry the request.'); requireKv(); }
  const strVal = String(value);
  let lastErr = null;
  for (let idx = 0; idx < candidates.length; idx++) {
    const kv = candidates[idx];
    const isMock = isTestKvHost(kv.url);
    const hostHint = hostLabelOf(kv.url);
    const hdrs = isMock
      ? { Authorization: `Bearer ${kv.token}`, 'Content-Type': 'application/json' }
      : { Authorization: `Bearer ${kv.token}`, 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'upstash-redis-js/1.34.0' };
    let response;
    try {
      response = await fetchKvWithRetry(`${kv.url}/set/${key}${exSeconds ? `?EX=${Math.max(60, Math.floor(exSeconds))}` : ''}`, {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify(strVal),
      }, timeoutMs);
    } catch (err) {
      const network = timeoutMs > 10000
        ? (err && err.name === 'AbortError' ? ' The connection timed out.' : ' The network connection failed.') : '';
      lastErr = new CloudStorageError('kv_write_failed', `CareLink could not commit to the mandatory KV store; the change was not acknowledged.${network}`);
      continue;
    }
    let { payload, rawText } = await parseKvHttpResponse(response);
    if (!isMock && !response.ok && (response.status === 403 || response.status === 404 || response.status === 405)
        && !isKvQuotaFailure(response.status, payload?.error || rawText)) {
      try {
        const cmd = exSeconds
          ? ['SET', key, strVal, 'EX', String(Math.max(60, Math.floor(exSeconds)))]
          : ['SET', key, strVal];
        const postResp = await fetchKvWithRetry(kv.url, {
          method: 'POST',
          headers: hdrs,
          body: JSON.stringify(cmd),
        }, timeoutMs);
        if (postResp.ok) {
          response = postResp;
          ({ payload, rawText } = await parseKvHttpResponse(postResp));
        }
      } catch { /* keep original response error */ }
    }
    const errMsg = payload && payload.error ? String(payload.error) : '';
    if (!response.ok || errMsg) {
      const classified = classifyKvFailure('write', response.status, errMsg || rawText, hostHint);
      if (classified.code === 'kv_payload_too_large' || classified.code === 'kv_quota_exceeded') throw classified;
      lastErr = classified;
      continue;
    }
    if (idx > 0) _pinnedKvIndex = idx;
    return;
  }
  for (const tcpCfg of tcpCandidates) {
    try {
      const cmd = exSeconds
        ? ['SET', key, strVal, 'EX', String(Math.max(60, Math.floor(exSeconds)))]
        : ['SET', key, strVal];
      await execRedisTcpCommand(tcpCfg, cmd, 10000);
      return;
    } catch (err) {
      const msg = String((err && err.message) || '');
      const classified = classifyKvFailure('write', 503, msg, tcpCfg.host);
      if (classified.code === 'kv_payload_too_large' || classified.code === 'kv_quota_exceeded') throw classified;
      if (!lastErr) lastErr = classified;
    }
  }
  throw lastErr || new CloudStorageError('kv_write_failed', 'CareLink KV refused the write; the change was not acknowledged.');
}

async function deleteKvKey(key) {
  invalidateManifestCache();
  const candidates = boundRestCandidates({ allowReadOnlyFallback: false });
  const tcpCandidates = boundTcpCandidates();
  for (const kv of candidates) {
    try {
      const response = await fetchKvWithRetry(`${kv.url}/del/${key}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${kv.token}`, 'Content-Type': 'application/json' },
        body: '[]',
      }, 5000);
      if (response.ok) return true;
    } catch { /* try next */ }
  }
  for (const tcpCfg of tcpCandidates) {
    try {
      await execRedisTcpCommand(tcpCfg, ['DEL', key], 5000);
      return true;
    } catch { /* try next */ }
  }
  return false;
}

/* Atomic Redis commands back the individual online session leases. These
   commands deliberately use the writable primary, never a read replica. */
async function runKvCommand(args, timeoutMs = 10000, op = 'write') {
  const candidates = boundRestCandidates({ allowReadOnlyFallback: false });
  const tcpCandidates = boundTcpCandidates();
  if (!candidates.length && !tcpCandidates.length) { if (requestSnapshot.getStore()?.storageId) throw new CloudStorageError('kv_unavailable', 'The selected online store is unavailable; retry the request.'); requireKv(); }
  let lastErr = null;
  for (const kv of candidates) {
    try {
      const response = await fetchKvWithRetry(kv.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${kv.token}`, 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'upstash-redis-js/1.34.0' },
        body: JSON.stringify(args),
      }, timeoutMs);
      const { payload, rawText } = await parseKvHttpResponse(response);
      const errMsg = payload && payload.error ? String(payload.error) : '';
      if (!response.ok || errMsg) {
        lastErr = classifyKvFailure(op, response.status, errMsg || rawText, hostLabelOf(kv.url));
        continue;
      }
      if (!payload || !Object.prototype.hasOwnProperty.call(payload, 'result')) {
        lastErr = new CloudStorageError('kv_invalid_response', 'CareLink KV returned an invalid atomic-command response.');
        continue;
      }
      if (!kv.readOnly) _pinnedKvIndex = Math.max(_pinnedKvIndex, candidates.indexOf(kv));
      bindRequestStore(restStorageId(kv));
      return payload.result;
    } catch (err) {
      lastErr = err instanceof CloudStorageError ? err : new CloudStorageError('kv_unavailable', 'CareLink could not reach the mandatory KV store.');
    }
  }
  for (const tcpCfg of tcpCandidates) {
    try { const result = await execRedisTcpCommand(tcpCfg, args, timeoutMs); bindRequestStore(tcpStorageId(tcpCfg)); return result; }
    catch (err) { if (!lastErr) lastErr = classifyKvFailure(op, 503, String((err && err.message) || ''), tcpCfg.host); }
  }
  throw lastErr || new CloudStorageError(op === 'read' ? 'kv_unavailable' : 'kv_write_failed', 'CareLink KV refused an atomic primary command.');
}

const SESSION_LEASE_SECONDS = IDLE_SECONDS + 60;
const SESSION_LEASE_RENEW_LUA = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('EXPIRE', KEYS[1], ARGV[2]) else return 0 end";
const SESSION_LEASE_RELEASE_LUA = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";

function sessionLeaseKey(username, epoch = '', sessionId = '') {
  const canonical = String(username || '').trim().toLowerCase();
  // One atomic account/credential-epoch lease, regardless of client or device.
  // Its value is the owner session ID; renew/release compare it before writing.
  const digest = crypto.createHash('sha256').update(JSON.stringify([canonical, epoch])).digest('hex').slice(0, 40);
  return `${TRIAL_MODE ? 'carelink_trial_account_session_v3_' : 'carelink_account_session_v3_'}${digest}`;
}

function loginSessionId(username, attemptId, deviceId = '') {
  const attempt = String(attemptId || '').trim();
  if (/^[A-Za-z0-9_-]{8,128}$/.test(attempt)) {
    return crypto.createHmac('sha256', sessionSigningSecret())
      .update(`carelink-login-attempt-v1:${String(username || '').toLowerCase()}:${deviceId}:${attempt}`)
      .digest('base64url');
  }
  return crypto.randomBytes(32).toString('base64url');
}

async function reserveLoginSession(username, sessionId, epoch = '') {
  const key = sessionLeaseKey(username, epoch, sessionId);
  const result = await runKvCommand(['SET', key, sessionId, 'NX', 'EX', String(SESSION_LEASE_SECONDS)]);
  if (result === 'OK') return true;
  // Retries with the same attempt ID remain idempotent.
  return (await runKvCommand(['GET', key])) === sessionId;
}

async function renewSessionLease(username, sessionId, epoch = '') {
  if (!sessionId) return false;
  return Number(await runKvCommand([
    'EVAL', SESSION_LEASE_RENEW_LUA, '1', sessionLeaseKey(username, epoch, sessionId), sessionId, String(SESSION_LEASE_SECONDS),
  ])) === 1;
}

async function releaseSessionLease(username, sessionId, epoch = '') {
  if (!sessionId) return false;
  return Number(await runKvCommand([
    'EVAL', SESSION_LEASE_RELEASE_LUA, '1', sessionLeaseKey(username, epoch, sessionId), sessionId,
  ])) === 1;
}

async function ensureSessionLease(sess) {
  const sessionId = sess.sessionId || crypto.createHash('sha256').update(sess.token).digest('base64url');
  if (!sess.sessionId && !await reserveLoginSession(sess.username, sessionId, sess.sessionEpoch)) return null;
  if (await renewSessionLease(sess.username, sessionId, sess.sessionEpoch)) return sessionId;
  // A signed session from the previous release may still have its original
  // account-wide lease. Migrate only if that exact, unexpired lease matches.
  const canonical = String(sess.username || '').trim().toLowerCase();
  const digest = crypto.createHash('sha256').update(sess.sessionEpoch ? `${canonical}:${sess.sessionEpoch}` : canonical).digest('hex').slice(0,40);
  const oldKey = `${TRIAL_MODE ? 'carelink_trial_active_session_v1_' : 'carelink_active_session_v1_'}${digest}`;
  const v2Digest = crypto.createHash('sha256').update(JSON.stringify([canonical, sess.sessionEpoch || '', sessionId])).digest('hex').slice(0,40);
  const v2Key = `${TRIAL_MODE ? 'carelink_trial_session_v2_' : 'carelink_session_v2_'}${v2Digest}`;
  if ((await runKvCommand(['GET', oldKey])) !== sessionId && (await runKvCommand(['GET', v2Key])) !== sessionId) return null;
  // During migration, only the first still-valid old session can own the account.
  if (!await reserveLoginSession(sess.username, sessionId, sess.sessionEpoch)) return null;
  return sessionId;
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

let _decodedCache = null; /* { cacheKey, rawJson, state } — verified against live KV manifest/envelope on every request */
let _shardedCapUrl = '';  /* KV URL confirmed to enforce <1 MB single-key command limit */

function cloudShardKey(index, rev = 0, writeNonce = '') {
  if (writeNonce) return `${CLOUD_KEY}_w${rev}_${writeNonce}_s${index}`;
  return rev > 0 ? `${CLOUD_KEY}_r${rev}_s${index}` : `${CLOUD_KEY}_shard_${index}`;
}

function replayHeadDeltasOnDb(db, deltas) {
  if (!db || typeof db !== 'object' || !Array.isArray(deltas)) return;
  for (const d of deltas) {
    const patches = d && Array.isArray(d.patches) ? d.patches : [];
    for (const p of patches) {
      if (!p || typeof p !== 'object' || !p.c || FORBIDDEN_KEYS.has(p.c)) continue;
      if (p.c === 'personalPrefs' && p.id && !FORBIDDEN_KEYS.has(p.id)) {
        db.personalPrefs = db.personalPrefs && typeof db.personalPrefs === 'object' ? db.personalPrefs : {};
        db.personalPrefs[p.id] = { ...(db.personalPrefs[p.id] || {}), ...(p.set && typeof p.set === 'object' ? p.set : {}) };
        continue;
      }
      if (p.c === 'settings' && p.set && p.set.value && typeof p.set.value === 'object') {
        db.settings = { ...(db.settings || {}), ...p.set.value };
        continue;
      }
      if (p.c === 'audit' && p.set && typeof p.set === 'object') {
        db.audit = Array.isArray(db.audit) ? db.audit : [];
        if (!db.audit.some((a) => a && a.hash === p.set.hash && a.seq === p.set.seq)) {
          db.audit.push({ ...p.set });
        }
        continue;
      }
      if (!/^[a-zA-Z][a-zA-Z0-9_]{0,48}$/.test(p.c)) continue;
      if (!Array.isArray(db[p.c])) db[p.c] = [];
      const col = db[p.c];
      const idx = col.findIndex((r) => r && r.id === p.id);
      if (p.del) {
        if (idx >= 0) col.splice(idx, 1);
      } else if (idx < 0 && p.id) {
        const rec = { ...(p.set && typeof p.set === 'object' ? p.set : {}), id: p.id };
        if (p.c === 'users') { delete rec.hash; delete rec.salt; }
        col.push(rec);
      } else if (idx >= 0 && p.set && typeof p.set === 'object') {
        for (const [k, v] of Object.entries(p.set)) {
          if (FORBIDDEN_KEYS.has(k) || (p.c === 'users' && (k === 'hash' || k === 'salt'))) continue;
          if (v === null) delete col[idx][k];
          else col[idx][k] = v;
        }
      }
    }
  }
}

function mergeHeadAudit(state, entries) {
  if (!state || !Array.isArray(entries)) return;
  state.audit = Array.isArray(state.audit) ? state.audit : [];
  state.db = state.db && typeof state.db === 'object' ? state.db : {};
  state.db.audit = Array.isArray(state.db.audit) ? state.db.audit : [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    if (!state.audit.some((a) => a && a.hash === entry.hash)) state.audit.push(entry);
    if (!state.db.audit.some((a) => a && a.hash === entry.hash)) state.db.audit.push(entry);
  }
  if (state.audit.length > 5000) state.audit.splice(0, state.audit.length - 5000);
  if (state.db.audit.length > 5000) state.db.audit.splice(0, state.db.audit.length - 5000);
}

function overlayAuthoritativeHead(state, head, manifestRev = 0, manifestSaved = null) {
  if (!head || typeof head !== 'object') return state;
  if (typeof head.setup === 'boolean') state.setup = head.setup;
  if (typeof head.globallyActivated === 'boolean') state.globallyActivated = head.globallyActivated;
  if (head.org && typeof head.org === 'object') state.org = head.org;
  state.devices = head.devices || {};
  state.devicePolicyInstalled = Boolean(head.devicePolicyInstalled);
  if (head.creds && typeof head.creds === 'object' && !Array.isArray(head.creds)) state.creds = head.creds;
  if (head.sessions && typeof head.sessions === 'object' && !Array.isArray(head.sessions)) state.sessions = head.sessions;
  if (head.revokedSessions && typeof head.revokedSessions === 'object' && !Array.isArray(head.revokedSessions)) state.revokedSessions = head.revokedSessions;
  if (head.loginFailures && typeof head.loginFailures === 'object' && !Array.isArray(head.loginFailures)) state.loginFailures = head.loginFailures;
  const baseRev = Number(state.rev) || 0;
  const targetRev = Math.max(baseRev, Number(manifestRev) || 0, Number(head.rev) || 0);
  if (Array.isArray(head.deltas) && head.deltas.length) {
    const newer = head.deltas.filter((d) => d && Number(d.rev) > baseRev);
    if (newer.length && state.db && typeof state.db === 'object') {
      replayHeadDeltasOnDb(state.db, newer);
      state.deltas = [...(Array.isArray(state.deltas) ? state.deltas : []), ...newer].slice(-60);
    }
  }
  state.rev = targetRev;
  if (manifestSaved || head.saved) state.saved = manifestSaved || head.saved;
  state.db = state.db && typeof state.db === 'object' ? state.db : { meta: { schema: 6, version: '6.9.6' }, users: [], audit: [] };
  if (Array.isArray(head.users) && head.users.length) {
    state.db.users = Array.isArray(state.db.users) ? state.db.users : [];
    for (const hu of head.users) {
      if (!hu || typeof hu !== 'object') continue;
      const uname = String(hu.username || '').toLowerCase();
      const idx = state.db.users.findIndex(
        (u) => u && ((hu.id && u.id === hu.id) || (uname && String(u.username || '').toLowerCase() === uname)),
      );
      if (idx >= 0) {
        state.db.users[idx] = { ...state.db.users[idx], ...hu };
        delete state.db.users[idx].hash;
        delete state.db.users[idx].salt;
      } else {
        const cleanHu = { ...hu };
        delete cleanHu.hash;
        delete cleanHu.salt;
        state.db.users.push(cleanHu);
      }
    }
  }
  state.db.settings = {
    ...(state.db.settings || {}),
    ...(head.landingTheme ? { landingTheme: head.landingTheme } : {}),
    ...(head.consoleTheme ? { consoleTheme: head.consoleTheme } : {}),
    ...(head.uiEpoch ? { uiEpoch: Number(head.uiEpoch) } : {}),
    ...(head.system ? { system: head.system } : {}),
    globallyActivated: Boolean(state.globallyActivated),
    ...(state.setup ? { onboarding: { complete: true, step: 4 }, hostSetupComplete: true } : {}),
  };
  mergeHeadAudit(state, head.audit);
  state.db.meta = {
    ...(state.db.meta || {}),
    globallyActivated: Boolean(state.globallyActivated),
    demoDisabled: Boolean(state.globallyActivated),
    productionMode: Boolean(state.globallyActivated),
    ...(head.demoMode && !state.globallyActivated ? { demoMode: true } : {}),
  };
  return state;
}

function recoverySnapshotMatchesHead(state, head) {
  if (!state || !state.db || !head) return false;
  for (const name of ['patients', 'visits', 'pdcas']) {
    const expectedDigest = head.collectionDigests && head.collectionDigests[name];
    if (expectedDigest) {
      const collection = Array.isArray(state.db[name]) ? state.db[name] : [];
      if (sha256Hex(JSON.stringify(collection)) !== expectedDigest) return false;
    }
    const expectedCount = head.collectionCounts && Number(head.collectionCounts[name]);
    if (Number.isFinite(expectedCount) && expectedCount >= 0) {
      const collection = Array.isArray(state.db[name]) ? state.db[name] : [];
      if (collection.length !== expectedCount) return false;
    }
  }
  const expectedMasterDigest = head.referenceMasterDigest;
  if (expectedMasterDigest) {
    const actualMasterDigest = state.db.meta && state.db.meta.referenceMaster && state.db.meta.referenceMaster.digest;
    if (actualMasterDigest !== expectedMasterDigest) return false;
  }
  return true;
}

function tryDecodeShardParts(parts) {
  if (!Array.isArray(parts) || !parts.length) return null;
  if (!parts.every((p) => typeof p === 'string' && p.length > 0)) return null;
  try {
    const rawJson = decodeCompressedEnvelopeToRaw(parts.join(''));
    const parsedObj = JSON.parse(rawJson);
    return normalizeStore(parsedObj);
  } catch {
    return null;
  }
}

async function recoverShardedCloudState(unwrapped, currentParts) {
  const count = Number(unwrapped.shardCount) || 0;
  const manifestRev = Number(unwrapped.rev) || 0;
  const head = unwrapped.head && typeof unwrapped.head === 'object' ? unwrapped.head : null;

  const prepareCandidate = (parts, sourceKeys) => {
    const candidate = tryDecodeShardParts(parts);
    if (!candidate) return null;
    overlayAuthoritativeHead(candidate, head, manifestRev, unwrapped.saved);
    if (!recoverySnapshotMatchesHead(candidate, head)) return null;
    Object.defineProperty(candidate, '_activeShardKeys', { value: Array.isArray(sourceKeys) ? sourceKeys : [], enumerable: false, configurable: true });
    return candidate;
  };

  /* Stage 1A: If current shard keys form a valid compressed state despite stale
     SHA metadata, adopt only after authoritative collection digests match. */
  let recovered = prepareCandidate(currentParts, Array.isArray(unwrapped.shardKeys) ? unwrapped.shardKeys : []);

  /* Stage 1B: Probe intact previous/adjacent shard sets still present in KV
     (prevShardKeys recorded on manifest, rev-1, rev-2, rev+1, or un-revisioned). */
  if (!recovered) {
    const candidateKeySets = [];
    if (Array.isArray(unwrapped.prevShardKeys) && unwrapped.prevShardKeys.length > 0) {
      candidateKeySets.push(unwrapped.prevShardKeys);
    }
    const probeRevs = [];
    if (manifestRev > 1) probeRevs.push(manifestRev - 1);
    if (manifestRev > 2) probeRevs.push(manifestRev - 2);
    if (manifestRev >= 1) probeRevs.push(manifestRev + 1);
    for (const r of probeRevs) {
      for (const c of [count, count - 1, count + 1]) {
        if (c >= 1 && c <= 64) {
          candidateKeySets.push(Array.from({ length: c }, (_, idx) => cloudShardKey(idx, r)));
        }
      }
    }
    candidateKeySets.push(Array.from({ length: count }, (_, idx) => cloudShardKey(idx, 0)));

    for (const keys of candidateKeySets) {
      try {
        const candParts = await Promise.all(keys.map((k) => readKvString(k)));
        const decoded = prepareCandidate(candParts, keys);
        if (decoded) {
          recovered = decoded;
          break;
        }
      } catch (err) {
        if (err && err.code === 'kv_quota_exceeded') throw err;
        /* Try another stored generation only for an unavailable/broken part,
           never to work around a provider quota by downloading more shards. */
      }
    }
  }

  /* Never substitute a bundled demo/reference database for an unrecoverable
     production shard set. If no intact stored snapshot exists, fail closed and
     preserve the manifest and online records exactly as they are. */
  if (!recovered) return null;
  /* A pre-rebuild shard snapshot cannot reconstruct the wholesale account
     hierarchy from compact head data; fail closed rather than roll it back. */
  if (head && head.rebuildRevision && (Number(recovered.rebuildRevision) || 0) < Number(head.rebuildRevision)) return null;

  overlayAuthoritativeHead(recovered, head, manifestRev, unwrapped.saved);
  recovered.rev = Math.max(Number(recovered.rev) || 0, manifestRev) + 1;
  appendServerAudit(
    recovered,
    'system',
    'kv.shard_recovered',
    'storage',
    'cloud-kv-sharded',
    `Automatically healed degraded KV shard set from authoritative manifest state (rev ${manifestRev} -> ${recovered.rev}).`,
  );
  await saveCloudState(recovered);
  return recovered;
}

function decodeCompressedEnvelopeToRaw(dataB64) {
  if (typeof dataB64 !== 'string' || dataB64.length > 16 * 1024 * 1024) {
    throw new CloudStorageError('kv_invalid_state', 'CareLink KV contains an invalid compressed online document; it was not replaced.');
  }
  try {
    const raw = zlib.gunzipSync(Buffer.from(dataB64, 'base64'), {
      maxOutputLength: MAX_CLOUD_STATE_BYTES + 1,
    }).toString('utf8');
    if (Buffer.byteLength(raw) > MAX_CLOUD_STATE_BYTES) throw new Error('state too large');
    return raw;
  } catch {
    throw new CloudStorageError('kv_invalid_state', 'CareLink KV contains an unreadable compressed online document; it was not replaced.');
  }
}

const FAST_PACK_PART_CHARS = 2000000;
let _clientFastPackRing = [];

function buildStateHead(state) {
  const cleanUsers = sanitizeDbForClient({
    users: (state.db && Array.isArray(state.db.users)) ? state.db.users : [],
  }).users || [];
  const compactUsers = cleanUsers.slice(0, 500).map((u) => ({
    id: u.id,
    username: u.username,
    email: u.email,
    name: u.name,
    jobTitle: u.jobTitle,
    roleId: u.roleId,
    departmentId: u.departmentId,
    countyId: u.countyId,
    areaId: u.areaId,
    areaIds: Array.isArray(u.areaIds) ? u.areaIds : undefined,
    status: u.status,
    active: u.active,
    mustChange: u.mustChange,
    unconfirmed: u.unconfirmed,
  }));
  return {
    setup: Boolean(state.setup),
    globallyActivated: isGloballyActivated(state),
    demoMode: Boolean(state.db && state.db.meta && (
      state.db.meta.demoMode || state.db.meta.demoSeed || state.db.meta.demoSeeded || state.db.meta.freshSeeded ||
      /synthetic|demonstration/i.test(String(state.db.meta.label || ''))
    )),
    rev: state.rev || 0,
    rebuildRevision: Number(state.rebuildRevision) || 0,
    saved: state.saved,
    org: state.org,
    landingTheme: systemConfig(state).entryTheme,
    landingThemeExplicit: Boolean(state.db && state.db.settings && state.db.settings.landingThemeExplicit),
    consoleTheme: (state.db && state.db.settings && Number(state.db.settings.uiEpoch || 0) >= 690 && state.db.settings.consoleTheme) || 'foundation',
    uiEpoch: Number((state.db && state.db.settings && state.db.settings.uiEpoch) || 0),
    hasLargeCollections: Boolean(
      (state.db && Array.isArray(state.db.patients) && state.db.patients.length > 400) ||
      (state.db && Array.isArray(state.db.visits) && state.db.visits.length > 800) ||
      (state.db && Array.isArray(state.db.pdcas) && state.db.pdcas.length > 800)
    ),
    collectionCounts: {
      patients: (state.db && Array.isArray(state.db.patients)) ? state.db.patients.length : 0,
      visits: (state.db && Array.isArray(state.db.visits)) ? state.db.visits.length : 0,
      pdcas: (state.db && Array.isArray(state.db.pdcas)) ? state.db.pdcas.length : 0,
    },
    collectionDigests: {
      patients: sha256Hex(JSON.stringify((state.db && Array.isArray(state.db.patients)) ? state.db.patients : [])),
      visits: sha256Hex(JSON.stringify((state.db && Array.isArray(state.db.visits)) ? state.db.visits : [])),
      pdcas: sha256Hex(JSON.stringify((state.db && Array.isArray(state.db.pdcas)) ? state.db.pdcas : [])),
    },
    referenceMasterDigest: state.db && state.db.meta && state.db.meta.referenceMaster && state.db.meta.referenceMaster.digest || null,
    devices: state.devices || {},
    devicePolicyInstalled: Boolean(state.devicePolicyInstalled),
    system: (state.db && state.db.settings && state.db.settings.system) || {},
    creds: state.creds || {},
    loginFailures: state.loginFailures || {},
    sessions: state.sessions || {},
    revokedSessions: state.revokedSessions || {},
    audit: (Array.isArray(state.audit) ? state.audit : []).slice(-100),
    users: compactUsers,
    ...(() => {
      const allDeltas = Array.isArray(state.deltas) ? state.deltas : [];
      const recent = allDeltas.slice(-16);
      const rawLen = Buffer.byteLength(JSON.stringify(recent));
      if (rawLen <= 48 * 1024) {
        return { deltas: recent, deltasComplete: recent.length === allDeltas.length };
      }
      return { deltas: [], deltasComplete: allDeltas.length === 0 };
    })(),
  };
}

function getClientFastPack(state, targetRev = 0, sess = null) {
  const currentRev = Number(state.rev) || 0;
  const principal = sess ? principalScope(state, sess) : null;
  const scopeKey = principal
    ? `${String(sess.username || 'anonymous').toLowerCase()}|${sess.sessionEpoch || ''}|${principal.roleId}|${principal.countyId}|${principal.areaIds.slice().sort().join(',')}`
    : 'anonymous';
  if (targetRev > 0 && (!state.rebuildRevision || targetRev >= state.rebuildRevision)) {
    const hit = _clientFastPackRing.find((e) => e.rev === targetRev && e.scopeKey === scopeKey);
    if (hit) return hit;
  }
  const existing = _clientFastPackRing.find((e) => e.rev === currentRev && e.saved === state.saved && e.scopeKey === scopeKey);
  if (existing) return existing;
  const cleanClientDb = sess ? scopedDbForSession(state.db || {}, state, sess) : sanitizeDbForClient(state.db || {});
  if (state.setup && cleanClientDb && typeof cleanClientDb === 'object') {
    cleanClientDb.settings = {
      ...(cleanClientDb.settings || {}),
      onboarding: { complete: true, step: 4 },
    };
  }
  const payloadJson = JSON.stringify({
    rev: currentRev,
    saved: state.saved,
    db: cleanClientDb,
  });
  const gzB64 = zlib.gzipSync(Buffer.from(payloadJson, 'utf8'), { level: 1 }).toString('base64');
  const parts = [];
  for (let offset = 0; offset < gzB64.length; offset += FAST_PACK_PART_CHARS) {
    parts.push(gzB64.slice(offset, offset + FAST_PACK_PART_CHARS));
  }
  if (!parts.length) parts.push('');
  const entry = { rev: currentRev, saved: state.saved, parts, scopeKey };
  _clientFastPackRing = [entry, ..._clientFastPackRing.filter((e) => e.rev !== currentRev)].slice(0, 2);
  return entry;
}

async function loadCloudHead() {
  const stored = await readKvString(CLOUD_KEY);
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
    const cacheKey = `sharded:${unwrapped.rev || 0}:${unwrapped.saved || ''}:${digests.join(',')}`;
    /* Always take authentication metadata from the just-read primary head;
       a cached full snapshot may predate a logout or account change. */
    if (unwrapped.head && typeof unwrapped.head === 'object') {
      const h = unwrapped.head;
      const headState = {
        setup: Boolean(h.setup),
        globallyActivated: Boolean(h.globallyActivated),
        rev: Number(unwrapped.rev || h.rev) || 0,
        rebuildRevision: Number(h.rebuildRevision) || 0,
        saved: unwrapped.saved || h.saved || null,
        org: h.org || null,
        devices: h.devices || {},
        devicePolicyInstalled: Boolean(h.devicePolicyInstalled),
        creds: h.creds || {},
        loginFailures: h.loginFailures || {},
        sessions: h.sessions || {},
        revokedSessions: h.revokedSessions || {},
        audit: Array.isArray(h.audit) ? h.audit : [],
        db: {
          users: Array.isArray(h.users) ? h.users : [],
          audit: Array.isArray(h.audit) ? h.audit : [],
          settings: {
            landingTheme: ((Number(h.uiEpoch || 0) >= 691 || h.landingThemeExplicit) && h.landingTheme) ? h.landingTheme : 'clinic',
            landingThemeExplicit: Boolean(h.landingThemeExplicit),
            consoleTheme: (Number(h.uiEpoch || 0) >= 690 && h.consoleTheme) ? h.consoleTheme : 'foundation',
            uiEpoch: Number(h.uiEpoch || 0),
            system: h.system || {},
            globallyActivated: Boolean(h.globallyActivated),
            onboarding: { complete: Boolean(h.setup), step: 4 },
          },
          meta: {
            demoMode: Boolean(h.demoMode),
            globallyActivated: Boolean(h.globallyActivated),
          },
        },
        _headOnly: true,
        _hasLargeCollections: Boolean(h.hasLargeCollections),
        deltas: Array.isArray(h.deltas) ? h.deltas : [],
        _headDeltasTruncated: h.deltasComplete === false,
      };
      Object.defineProperty(headState, '_shardedManifest', { value: unwrapped, enumerable: false, configurable: true });
      Object.defineProperty(headState, '_activeShardKeys', { value: Array.isArray(unwrapped.shardKeys) ? unwrapped.shardKeys : [], enumerable: false, configurable: true });
      Object.defineProperty(headState, '_prevShardKeys', { value: Array.isArray(unwrapped.prevShardKeys) ? unwrapped.prevShardKeys : [], enumerable: false, configurable: true });
      return { driver: 'cloud-kv-redis', state: headState };
    }
  }
  if (unwrapped && unwrapped.format === CLOUD_GZIP_FORMAT && unwrapped.head && typeof unwrapped.head === 'object') {
    const h = unwrapped.head;
    return {
      driver: 'cloud-kv-redis',
      state: {
        setup: Boolean(h.setup),
        globallyActivated: Boolean(h.globallyActivated),
        rev: Number(unwrapped.rev || h.rev) || 0,
        rebuildRevision: Number(h.rebuildRevision) || 0,
        saved: unwrapped.saved || h.saved || null,
        org: h.org || null,
        devices: h.devices || {},
        devicePolicyInstalled: Boolean(h.devicePolicyInstalled),
        creds: h.creds || {},
        loginFailures: h.loginFailures || {},
        sessions: h.sessions || {},
        revokedSessions: h.revokedSessions || {},
        audit: Array.isArray(h.audit) ? h.audit : [],
        db: {
          users: Array.isArray(h.users) ? h.users : [],
          audit: Array.isArray(h.audit) ? h.audit : [],
          settings: {
            landingTheme: ((Number(h.uiEpoch || 0) >= 691 || h.landingThemeExplicit) && h.landingTheme) ? h.landingTheme : 'clinic',
            landingThemeExplicit: Boolean(h.landingThemeExplicit),
            consoleTheme: (Number(h.uiEpoch || 0) >= 690 && h.consoleTheme) ? h.consoleTheme : 'foundation',
            uiEpoch: Number(h.uiEpoch || 0),
            system: h.system || {},
            globallyActivated: Boolean(h.globallyActivated),
            onboarding: { complete: Boolean(h.setup), step: 4 },
          },
          meta: {
            demoMode: Boolean(h.demoMode),
            globallyActivated: Boolean(h.globallyActivated),
          },
        },
        _headOnly: true,
        _hasLargeCollections: Boolean(h.hasLargeCollections),
        deltas: Array.isArray(h.deltas) ? h.deltas : [],
        _headDeltasTruncated: h.deltasComplete === false,
      },
    };
  }
  /* Legacy values without an embedded head may enter device admission below.
     Clone their verified raw snapshot: a failed auth save must never leave
     an uncommitted approval in the shared decoded read-only cache. */
  return loadCloudState({ readOnly: false });
}

async function loadCloudState({ readOnly = false } = {}) {
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
    const cacheKey = `sharded:${unwrapped.rev || 0}:${unwrapped.saved || ''}:${digests.join(',')}`;
    if (_decodedCache && _decodedCache.cacheKey === cacheKey) {
      if (readOnly && _decodedCache.state) {
        const cached = _decodedCache.state;
        if (unwrapped.head && typeof unwrapped.head === 'object') {
          overlayAuthoritativeHead(cached, unwrapped.head, unwrapped.rev, unwrapped.saved);
        }
        Object.defineProperty(cached, '_shardedManifest', { value: unwrapped, enumerable: false, configurable: true });
        Object.defineProperty(cached, '_activeShardKeys', { value: Array.isArray(unwrapped.shardKeys) ? unwrapped.shardKeys : [], enumerable: false, configurable: true });
        Object.defineProperty(cached, '_prevShardKeys', { value: Array.isArray(unwrapped.prevShardKeys) ? unwrapped.prevShardKeys : [], enumerable: false, configurable: true });
        return { state: cached, driver: 'cloud-kv-redis' };
      }
      if (_decodedCache.rawJson) {
        const cloned = normalizeStore(JSON.parse(_decodedCache.rawJson));
        if (unwrapped.head && typeof unwrapped.head === 'object') {
          overlayAuthoritativeHead(cloned, unwrapped.head, unwrapped.rev, unwrapped.saved);
        }
        Object.defineProperty(cloned, '_shardedManifest', { value: unwrapped, enumerable: false, configurable: true });
        Object.defineProperty(cloned, '_activeShardKeys', { value: Array.isArray(unwrapped.shardKeys) ? unwrapped.shardKeys : [], enumerable: false, configurable: true });
        Object.defineProperty(cloned, '_prevShardKeys', { value: Array.isArray(unwrapped.prevShardKeys) ? unwrapped.prevShardKeys : [], enumerable: false, configurable: true });
        return { state: cloned, driver: 'cloud-kv-redis' };
      }
    }
    const shardKeys = Array.isArray(unwrapped.shardKeys) && unwrapped.shardKeys.length === count
      ? unwrapped.shardKeys
      : Array.from({ length: count }, (_, idx) => cloudShardKey(idx));
    const parts = await Promise.all(shardKeys.map((k) => readKvString(k)));
    let failedShardIdx = -1;
    for (let i = 0; i < count; i++) {
      if (typeof parts[i] !== 'string' || sha256Hex(parts[i]) !== digests[i]) {
        failedShardIdx = i;
        break;
      }
    }
    if (failedShardIdx >= 0) {
      const recovered = await recoverShardedCloudState(unwrapped, parts);
      if (recovered) {
        return {
          state: readOnly ? recovered : normalizeStore(JSON.parse(JSON.stringify(recovered))),
          driver: 'cloud-kv-redis',
        };
      }
      throw new CloudStorageError('kv_invalid_state', `CareLink KV shard ${failedShardIdx + 1} failed integrity verification; the online database was not replaced.`);
    }
    const rawJson = decodeCompressedEnvelopeToRaw(parts.join(''));
    let parsedObj;
    try { parsedObj = JSON.parse(rawJson); }
    catch { throw new CloudStorageError('kv_invalid_state', 'CareLink KV contains malformed JSON; the online database was not reset.'); }
    const normalized = normalizeStore(parsedObj);
    if (unwrapped.head && typeof unwrapped.head === 'object') {
      overlayAuthoritativeHead(normalized, unwrapped.head, unwrapped.rev, unwrapped.saved);
    }
    Object.defineProperty(normalized, '_shardedManifest', { value: unwrapped, enumerable: false, configurable: true });
    Object.defineProperty(normalized, '_activeShardKeys', { value: shardKeys, enumerable: false, configurable: true });
    Object.defineProperty(normalized, '_prevShardKeys', { value: Array.isArray(unwrapped.prevShardKeys) ? unwrapped.prevShardKeys : [], enumerable: false, configurable: true });
    _decodedCache = {
      cacheKey,
      rawJson,
      state: readOnly ? normalized : normalizeStore(rawJson ? JSON.parse(rawJson) : parsedObj),
    };
    return { state: normalized, driver: 'cloud-kv-redis' };
  }
  if (unwrapped && unwrapped.format === CLOUD_GZIP_FORMAT && typeof unwrapped.data === 'string') {
    const cacheKey = `gzip:${sha256Hex(unwrapped.data)}`;
    if (_decodedCache && _decodedCache.cacheKey === cacheKey) {
      const cached = readOnly && _decodedCache.state
        ? _decodedCache.state
        : (_decodedCache.rawJson ? normalizeStore(JSON.parse(_decodedCache.rawJson)) : null);
      if (cached) {
        overlayAuthoritativeHead(cached, unwrapped.head, unwrapped.rev, unwrapped.saved);
        return { state: cached, driver: 'cloud-kv-redis' };
      }
    }
    const rawJson = decodeCompressedEnvelopeToRaw(unwrapped.data);
    let parsedObj;
    try { parsedObj = JSON.parse(rawJson); }
    catch { throw new CloudStorageError('kv_invalid_state', 'CareLink KV contains malformed JSON; the online database was not reset.'); }
    const normalized = normalizeStore(parsedObj);
    overlayAuthoritativeHead(normalized, unwrapped.head, unwrapped.rev, unwrapped.saved);
    _decodedCache = {
      cacheKey,
      rawJson,
      state: readOnly ? normalized : normalizeStore(JSON.parse(rawJson)),
    };
    return { state: normalized, driver: 'cloud-kv-redis' };
  }
  return { state: decodeCloudState(unwrapped), driver: 'cloud-kv-redis' };
}

async function saveCloudState(state, { ownerRecovery = false, onProgress = null } = {}) {
  state.saved = nowISO();
  const rawJson = JSON.stringify(state);
  const rawBytes = Buffer.byteLength(rawJson);
  const headSnapshot = rawBytes > CLOUD_COMPRESS_THRESHOLD ? buildStateHead(state) : null;
  const serialized = rawBytes <= CLOUD_COMPRESS_THRESHOLD
    ? rawJson
    : JSON.stringify({
        format: CLOUD_GZIP_FORMAT,
        rev: state.rev || 0,
        saved: state.saved,
        head: headSnapshot,
        data: zlib.gzipSync(Buffer.from(rawJson), { level: 6 }).toString('base64'),
      });

  const currentKvUrl = (kvConfig() && kvConfig().url) || '';
  const shouldShardDirectly = (ownerRecovery && Buffer.byteLength(serialized) > 256 * 1024) ||
    (Buffer.byteLength(serialized) > 900 * 1024
      && (Boolean(_shardedCapUrl && _shardedCapUrl === currentKvUrl) || (currentKvUrl && !isTestKvHost(currentKvUrl))));

  if (!shouldShardDirectly) {
    try {
      await commitCloudSnapshot(serialized, { timeoutMs: ownerRecovery ? 90000 : 10000 });
      if (rawBytes > CLOUD_COMPRESS_THRESHOLD) {
        const env = JSON.parse(serialized);
        _decodedCache = {
          cacheKey: `gzip:${sha256Hex(env.data)}`,
          rawJson,
          state: normalizeStore(JSON.parse(rawJson)),
        };
      }
      return;
    } catch (err) {
      const canFallbackToShards = Buffer.byteLength(serialized) > 900 * 1024
        && err && (err.code === 'kv_payload_too_large' || err.code === 'kv_write_failed' || err.code === 'kv_unavailable');
      if (!canFallbackToShards) throw err;
      _shardedCapUrl = currentKvUrl;
    }
  }

  /* Automatic Upstash Free-Tier fallback: shard the gzip base64 payload into
     write-once non-expiring 700 KB chunks written in parallel before committing
     the manifest key. Unique write nonces guarantee that concurrent or same-rev
     saves NEVER overwrite active shard keys in place, and zero TTL ensures active
     shards are never evicted by Redis volatile-lru or expired during quiet weeks. */
  let envelope = null;
  try { envelope = JSON.parse(serialized); } catch { envelope = null; }
  const b64 = envelope && envelope.format === CLOUD_GZIP_FORMAT && typeof envelope.data === 'string'
    ? envelope.data
    : zlib.gzipSync(Buffer.from(rawJson), { level: 6 }).toString('base64');
  const revTag = Number(state.rev) || 1;
  const writeNonce = `${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
  const prevShardKeys = Array.isArray(state._activeShardKeys) ? state._activeShardKeys : [];
  const retiredShardKeys = Array.isArray(state._prevShardKeys) ? state._prevShardKeys : [];
  const shards = [];
  const shardKeys = [];
  const shardDigests = [];
  // For the interactive owner tool, smaller sequential uploads and a longer
  // timeout avoid saturating slow connections. Stay within the reader's 64-part
  // limit, the 16-part previous-generation recovery limit, and the normal
  // maximum value size; no active key is modified here.
  const shardSize = ownerRecovery ? Math.max(128 * 1024, Math.ceil(b64.length / 16)) : CLOUD_SHARD_SIZE;
  if (shardSize > CLOUD_SHARD_SIZE) throw new CloudStorageError('kv_payload_too_large', 'The database is too large to save safely in 16 recovery shards. No recovery was committed.');
  for (let offset = 0, idx = 0; offset < b64.length; offset += shardSize, idx++) {
    const part = b64.slice(offset, offset + shardSize);
    shards.push(part);
    shardKeys.push(cloudShardKey(idx, revTag, writeNonce));
    shardDigests.push(sha256Hex(part));
  }
  if (ownerRecovery) {
    for (let idx = 0; idx < shards.length; idx++) {
      try { await writeKvString(shardKeys[idx], shards[idx], { timeoutMs: 90000 }); }
      catch (err) {
        if (err && err.name === 'CloudStorageError') err.message = `Upload part ${idx + 1} of ${shards.length} failed before the password change was committed. ${err.message}`;
        throw err;
      }
      if (typeof onProgress === 'function') onProgress(idx + 1, shards.length);
    }
  } else {
    await Promise.all(shards.map((part, idx) => writeKvString(shardKeys[idx], part)));
  }
  const headObj = headSnapshot || buildStateHead(state);
  const keepPrev = prevShardKeys.filter((k) => !shardKeys.includes(k)).slice(0, 16);
  let manifestPayload = JSON.stringify({
    format: CLOUD_SHARDED_FORMAT,
    shardCount: shards.length,
    shardKeys,
    shardDigests,
    ...(keepPrev.length ? { prevShardKeys: keepPrev } : {}),
    saved: state.saved,
    rev: revTag,
    head: headObj,
  });
  if (Buffer.byteLength(manifestPayload) > CLOUD_SHARD_SIZE) {
    manifestPayload = JSON.stringify({
      format: CLOUD_SHARDED_FORMAT,
      shardCount: shards.length,
      shardKeys,
      shardDigests,
      ...(keepPrev.length ? { prevShardKeys: keepPrev } : {}),
      saved: state.saved,
      rev: revTag,
      head: { ...headObj, users: [] },
    });
  }
  await commitCloudSnapshot(manifestPayload, { timeoutMs: ownerRecovery ? 90000 : 10000 });
  Object.defineProperty(state, '_activeShardKeys', { value: shardKeys, enumerable: false, configurable: true });
  Object.defineProperty(state, '_prevShardKeys', { value: keepPrev, enumerable: false, configurable: true });
  _decodedCache = {
    cacheKey: `sharded:${revTag}:${state.saved}:${shardDigests.join(',')}`,
    rawJson,
    state: normalizeStore(JSON.parse(rawJson)),
  };
  /* Best-effort cleanup of retired shard keys from 2 writes ago (keep prevShardKeys
     from 1 write ago intact so in-flight readers and lagging Read Replicas never race). */
  const keysToDelete = new Set(retiredShardKeys.filter((k) => !shardKeys.includes(k) && !keepPrev.includes(k)));
  if (revTag > 2) {
    const oldRev = revTag - 2;
    for (let idx = 0; idx < shards.length + 2; idx++) {
      keysToDelete.add(cloudShardKey(idx, oldRev));
    }
  }
  if (keysToDelete.size > 0) {
    Promise.all([...keysToDelete].map((k) => deleteKvKey(k))).catch(() => {});
  }
}

async function saveCloudAuthMetadata(state) {
  const mf = state && state._shardedManifest;
  if (mf && mf.format === CLOUD_SHARDED_FORMAT && mf.head && typeof mf.head === 'object') {
    const updatedHead = {
      ...mf.head,
      creds: state.creds || mf.head.creds || {},
      devices: state.devices || {},
      devicePolicyInstalled: Boolean(state.devicePolicyInstalled),
      loginFailures: state.loginFailures || {},
      sessions: state.sessions || {},
      revokedSessions: state.revokedSessions || {},
      audit: (Array.isArray(state.audit) ? state.audit : Array.isArray(mf.head.audit) ? mf.head.audit : []).slice(-100),
    };
    const nextManifest = {
      ...mf,
      head: updatedHead,
    };
    await commitCloudSnapshot(JSON.stringify(nextManifest));
    Object.defineProperty(state, '_shardedManifest', { value: nextManifest, enumerable: false, configurable: true });
    if (_decodedCache && _decodedCache.state) {
      _decodedCache.state.devices = updatedHead.devices;
      _decodedCache.state.devicePolicyInstalled = updatedHead.devicePolicyInstalled;
      _decodedCache.state.creds = updatedHead.creds;
      _decodedCache.state.loginFailures = updatedHead.loginFailures;
      _decodedCache.state.sessions = updatedHead.sessions;
      _decodedCache.state.revokedSessions = updatedHead.revokedSessions;
      _decodedCache.state.audit = Array.isArray(_decodedCache.state.audit) ? _decodedCache.state.audit : [];
      for (const entry of updatedHead.audit) {
        if (entry && !_decodedCache.state.audit.some((a) => a && a.hash === entry.hash)) _decodedCache.state.audit.push(entry);
      }
    }
    return;
  }
  await saveCloudState(state);
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

const PATIENT_LINKED_COLLECTIONS = new Set([
  'patients', 'visits', 'pdcas', 'pdcaDiscussions', 'patientConditions', 'support', 'supportIssues',
  'documents', 'requests', 'transactions', 'adminOpsPayg', 'concerns', 'encounters', 'referrals', 'clinicalRx', 'omahaPlans',
  ...careWorkflow.OWNED, 'hardcopyBatches', 'homestays',
  'careResidents', 'formRecords', 'tbRequests', 'tbDispenses', 'intlPdcaDossiers', 'urgentCases', 'workspaceDrafts',
]);
const COUNTY_AREA_SCOPED_COLLECTIONS = new Set(['waitingList']);
const WAITING_LIST_READ_ROLES = new Set([
  'caregiver', 'coordinator', 'chw', 'mcm', 'nurse', 'liaison', 'homestay', 'countyadmin', 'assistant',
]);
const WAITING_LIST_WRITE_ROLES = new Set(['countyadmin', 'assistant', 'mcm', 'coordinator', 'caregiver']);
const URGENT_CASE_READ_ROLES = new Set([
  'mcm', 'nurse', 'liaison', 'depthead', 'countyadmin', 'finance', 'procurement', 'auditor', 'director', 'president',
  'program.admin', 'chief', 'assistant', 'caregiver', 'coordinator', 'homestay', 'me',
]);
const URGENT_CASE_WRITE_ROLES = new Set(['mcm', 'countyadmin', 'finance', 'liaison', 'depthead', 'program.admin', 'chief']);
const GLOBAL_DATA_ROLES = new Set(['chief', 'president', 'director', 'program.admin', 'auditor', 'hr']);
const GLOBAL_MESSAGE_ROLES = new Set(['chief', 'director', 'program.admin', 'program.assistant', 'president']);
const FINANCIAL_DATA_ROLES = new Set(['finance', 'procurement', 'countyadmin', 'director', 'president', 'program.admin', 'auditor']);
const CLINICAL_READ_ROLES = new Set([
  'countyadmin', 'assistant', 'caregiver', 'coordinator', 'chw', 'mcm', 'liaison', 'nurse', 'homestay',
]);
const AREA_SCOPED_ROLES = new Set(['caregiver', 'chw', 'coordinator']);
const CLINICAL_WRITE_ROLES = new Set(['countyadmin', 'assistant', 'caregiver', 'chw', 'mcm', 'nurse', 'homestay']);

/* Coordinators prepare scoped PDCAs and need the care history, not patient
   finance or hospital expense approval privileges. Never add them to the
   general clinical write set just to allow the new command endpoint. */
const COORDINATOR_CLINICAL_READ = new Set(['patients','visits','pdcas','pdcaDiscussions','patientConditions','support',
  'supportIssues','documents','encounters','clinicalRx','omahaPlans','formRecords',...careWorkflow.OWNED]);
function authorizedDossier(record, db) {
  if (!record?.sharedAt || !record.authorizedRevisionId) return false;
  const version = (db.careReviewRevisions || []).find(r=>r.id===record.authorizedRevisionId);
  return Boolean(version && version.event==='authorized' && version.reviewId===record.reviewId &&
    version.patientId===record.patientId && version.cycleId===record.cycleId && version.by===record.authorizedBy &&
    JSON.stringify(version.fields)===JSON.stringify(record.fields));
}
function clinicalPatchPolicy(patch, db, sess) {
  const current=(Array.isArray(db[patch.c])?db[patch.c]:[]).find(r=>r?.id===patch.id);
  const set=safeObject(patch.set), next={...(current||{}),...set};
  if(devotionRules.OWNED.includes(patch.c)) return 'devotion_command_required';
  if(careWorkflow.OWNED.includes(patch.c)||patch.c==='pdcas') return 'clinical_command_required';
  if(patch.c==='calendarEvents' && (current?.careReviewId || next.careReviewId || /pdca/i.test(String(current?.kind||'')+String(next.kind||'')) || next.source==='care-review')) return 'clinical_command_required';
  if(patch.c!=='patients') return '';
  if(set.id && set.id!==patch.id) return 'immutable_patient_identity';
  const locked=['careCycleId','cycleStartedAt','enrolledAt','enrolDate','enrolledBy','enrolledDecisionAt','enrolmentOfficeConfirmed',
    'discharge','dischargedAt','dischargedBy','dischargeEvidence','dischargeSummary','carePlan','assessmentKind'];
  if(locked.some(k=>Object.hasOwn(set,k)&&!(k==='assessmentKind'&&!current&&set[k]==='new')&&(current||set[k]!=null&&set[k]!=='')&&JSON.stringify(set[k])!==JSON.stringify(current?.[k]))) return 'clinical_command_required';
  if(current && careRules.supported(current)) {
    if(patch.del) return 'clinical_history_retained';
    if(['intake','countyId','areaId','nationalId'].some(k=>Object.hasOwn(set,k)&&JSON.stringify(set[k])!==JSON.stringify(current[k])))return 'clinical_history_retained';
    if(Object.hasOwn(set,'status')&&set.status!==current.status) {
      const transition=current.status==='active'||current.status==='extension'
        ? set.status==='discharge_recommended' && ['mcm','caregiver','coordinator','countyadmin'].includes(sess.roleId)
        : current.status==='discharge_recommended' && set.status==='active' && ['mcm','countyadmin'].includes(sess.roleId);
      if(!transition)return 'clinical_command_required';
    }
  } else {
    if(!current && (patch.del||!['assessment_initiated','form_submitted','digital_entered'].includes(next.status)))return 'mcm_office_enrolment_required';
    if(['active','extension','discharged','discharge_recommended'].includes(next.status))return 'mcm_office_enrolment_required';
    // A hidden out-of-scope exact ID match also refuses duplicate creation,
    // without returning the other patient's identity to the caller.
    const key=String(next.nationalId||'').replace(/[^a-z0-9]/gi,'').toLowerCase();
    if(key && (db.patients||[]).some(r=>r.id!==patch.id&&String(r.nationalId||'').replace(/[^a-z0-9]/gi,'').toLowerCase()===key))return 'identity_review_required';
  }
  return '';
}

function sanitizeDbForClient(db) {
  if (!db || typeof db !== 'object') return db;
  const copy = { ...db };
  for (const key of ['devices','devicesPending','passwordVault','creds','credentialExports','reactivationPack','mailboxes']) delete copy[key];
  if (Array.isArray(db.users)) {
    copy.users = db.users.map((u) => {
      const clean = { ...u };
      delete clean.hash;
      delete clean.salt;
      for(const key of ['digest','temporary','password','tempPassword','sessionEpoch']) delete clean[key];
      return clean;
    });
  }
  /* A call record keeps only a bounded, text-only handshake. The payload is
     read solely by the two sides of that call (callVisibleToScope), never by
     the shared register or by anyone else's console. */
  if (Array.isArray(db.teamCalls)) {
    copy.teamCalls = db.teamCalls.map((call) => {
      if (!call || typeof call !== 'object') return call;
      const clean = { ...call };
      const signal = call.signal && typeof call.signal === 'object' ? call.signal : null;
      const list = (value) => (Array.isArray(value) ? value.slice(-10) : []).map((item) => callSignalText(item)).filter(Boolean);
      clean.signal = signal ? {
        offer: callSignalText(signal.offer), answer: callSignalText(signal.answer),
        callerCandidates: list(signal.callerCandidates), calleeCandidates: list(signal.calleeCandidates),
        sdp: callSignalText(signal.sdp), candidate: callSignalText(signal.candidate),
        from: clipString(signal.from || '', 160),
        at: typeof signal.at === 'string' ? signal.at.slice(0, 40) : '',
      } : {};
      return clean;
    });
  }
  return copy;
}

/* Server-side clinical data scope. The browser's RBAC is presentation only;
   every initial, full, paged and delta read must use this boundary. */
function principalScope(state, sess) {
  const username = String(sess && sess.username || '').toLowerCase();
  const user = (state.db && Array.isArray(state.db.users) ? state.db.users : [])
    .find((u) => String(u.username || '').toLowerCase() === username) || {};
  const cred = state.creds && state.creds[username] || {};
  const areas = Array.isArray(user.areaIds) ? user.areaIds : (Array.isArray(cred.areaIds) ? cred.areaIds : []);
  return {
    userId: String((sess && sess.userId) || cred.id || user.id || ''),
    username,
    roleId: String((sess && sess.roleId) || cred.roleId || user.roleId || 'staff'),
    countyId: String((sess && sess.countyId) || cred.countyId || user.countyId || ''),
    areaIds: areas.map(String),
  };
}

function canManageServerMeetings(roleId) {
  return roleId === 'assistant' || roleId === 'mediahead';
}

/* The lead MCM oversees clinical work in these two counties only. This is an
   account-specific clinical exception, not an organisation-wide role grant. */
function leadMcmClinicalCounty(scope, countyId) {
  return scope.roleId === 'mcm' && scope.username === 'mcm.kisumu' &&
    ['kisumu', 'homabay'].includes(String(countyId || ''));
}

function patientInPrincipalScope(patient, scope) {
  if (!patient || typeof patient !== 'object' || !scope.countyId) return false;
  if (String(patient.countyId || '') !== scope.countyId && !leadMcmClinicalCounty(scope, patient.countyId)) return false;
  if (AREA_SCOPED_ROLES.has(scope.roleId)) return scope.areaIds.includes(String(patient.areaId || ''));
  if (scope.roleId === 'intl.medical') return false;
  return CLINICAL_READ_ROLES.has(scope.roleId);
}

function countyAreaRecordInScope(record, scope, collection) {
  if (!record || typeof record !== 'object') return false;
  const roleSet = collection === 'waitingList' ? WAITING_LIST_READ_ROLES : URGENT_CASE_READ_ROLES;
  if (!roleSet.has(scope.roleId)) return false;
  if (GLOBAL_DATA_ROLES.has(scope.roleId)) return true;
  if (!scope.countyId || (String(record.countyId || '') !== scope.countyId && !leadMcmClinicalCounty(scope, record.countyId))) return false;
  if (AREA_SCOPED_ROLES.has(scope.roleId)) return scope.areaIds.includes(String(record.areaId || ''));
  return true;
}

function patchPatientInScope(patientId, state, scope) {
  const patients = state.db && Array.isArray(state.db.patients) ? state.db.patients : [];
  const patient = patients.find((p) => p && String(p.id) === String(patientId));
  return Boolean(patient && patientInPrincipalScope(patient, scope));
}

function financialRecordInScope(record, scope) {
  return Boolean(record && FINANCIAL_DATA_ROLES.has(scope.roleId) &&
    (GLOBAL_DATA_ROLES.has(scope.roleId) || (scope.countyId && String(record.countyId || '') === scope.countyId)));
}

function redactFinancialLink(record) {
  const safe = { ...(record || {}) };
  for (const key of ['patientId', 'patientName', 'patientLabel', 'patientCode', 'requestId', 'clinicalReport', 'diagnosis', 'note', 'description', 'contact', 'phone', 'phoneNumber', 'householdId', 'medicalNotes']) delete safe[key];
  return safe;
}

function financialPatchInScope(patch, state, sess) {
  const scope = principalScope(state, sess);
  if (!['transactions', 'adminOpsPayg'].includes(patch.c)) return false;
  const current = (state.db && Array.isArray(state.db[patch.c]) ? state.db[patch.c] : [])
    .find((r) => r && String(r.id) === String(patch.id));
  if (patch.del) return Boolean(current && financialRecordInScope(current, scope));
  const candidate = { ...(current || {}), ...(patch.set || {}) };
  if ((current && !financialRecordInScope(current, scope)) || !financialRecordInScope(candidate, scope)) return false;
  if (candidate.patientId) {
    const patient = (state.db.patients || []).find((p) => p && String(p.id) === String(candidate.patientId));
    if (!patient || String(patient.countyId || '') !== scope.countyId) return false;
  }
  return true;
}

function activeServerUser(state, id) {
  return (state.db && Array.isArray(state.db.users) ? state.db.users : [])
    .find((u) => u && String(u.id) === String(id) && u.status === 'active' && u.active !== false) || null;
}

function serverMessageKind(thread) {
  const value = String(thread || '');
  if (value.startsWith('dm:')) return 'direct';
  const kind = value.split(':')[0];
  return ['dept', 'area', 'global'].includes(kind) ? kind : '';
}

function serverMessageRecipients(state, sess, thread) {
  const users = state.db && Array.isArray(state.db.users) ? state.db.users : [];
  const sender = activeServerUser(state, sess.userId);
  const value = String(thread || '');
  if (!sender) return null;
  const globalReach = GLOBAL_MESSAGE_ROLES.has(sess.roleId);
  const inReach = (u) => u && u.id !== sender.id && u.status === 'active' && u.active !== false &&
    (globalReach || String(u.countyId || '') === String(sender.countyId || ''));
  if (value.startsWith('dm:')) {
    const ids = value.slice(3).split(':');
    if (ids.length !== 2 || ids[0] === ids[1] || !ids.includes(sender.id)) return null;
    const recipient = activeServerUser(state, ids.find((id) => id !== sender.id));
    return inReach(recipient) ? [recipient.id] : null;
  }
  if (value.startsWith('dept:')) {
    const dept = value.slice(5);
    if (!dept || dept.length > 80) return null;
    const recipients = users.filter((u) => u.departmentId === dept && inReach(u)).map((u) => u.id);
    return recipients.length ? recipients : null;
  }
  if (value.startsWith('area:')) {
    const areaId = value.slice(5);
    const areaPatient = (state.db.patients || []).find((p) => String(p.areaId || '') === areaId);
    const areaUser = users.find((u) => (u.areaIds || []).map(String).includes(areaId));
    const countyId = (areaPatient && areaPatient.countyId) || (areaUser && areaUser.countyId);
    if (!areaId || !countyId) return null;
    const recipients = users.filter((u) => u.id !== sender.id && u.status === 'active' && u.active !== false &&
      ((u.areaIds || []).map(String).includes(areaId) || (u.countyId === countyId && ['countyadmin', 'assistant', 'mcm', 'coordinator', 'depthead'].includes(u.roleId))))
      .map((u) => u.id);
    return recipients.length ? recipients : null;
  }
  if (value.startsWith('global:')) {
    const countyId = value.slice(7);
    if (countyId !== 'all' && !['kisumu', 'homabay'].includes(countyId)) return null;
    const recipients = users.filter((u) => u.id !== sender.id && u.status === 'active' && u.active !== false &&
      !['gov.partner', 'ccc.partner'].includes(u.roleId) && (countyId === 'all' || u.countyId === countyId)).map((u) => u.id);
    return recipients.length ? recipients : null;
  }
  return null;
}

function serverMessageTextAllowed(text, state) {
  const body = String(text || '');
  if (!body.trim() || body.length > 2000 || /LOM-[A-Z]{3}-\d{4}/.test(body) || /CCC\s*\/?\s*\d{3,}/i.test(body) || /(?:\+254|\b254|\b0)[17]\d{8}\b/.test(body)) return false;
  const lower = body.toLowerCase();
  return !(state.db && Array.isArray(state.db.patients) && state.db.patients.some((patient) => patient && (
    (patient.name && patient.name.length > 6 && lower.includes(String(patient.name).toLowerCase())) ||
    (patient.code && lower.includes(String(patient.code).toLowerCase())) ||
    (patient.id && lower.includes(String(patient.id).toLowerCase()))
  )));
}

function messagePatchAllowed(patch, state, sess) {
  const messages = state.db && Array.isArray(state.db.messages) ? state.db.messages : [];
  const current = messages.find((message) => message && String(message.id) === String(patch.id));
  const set = patch.set && typeof patch.set === 'object' && !Array.isArray(patch.set) ? patch.set : {};
  if (!current) {
    if (patch.del || !set || String(set.from || '') !== String(sess.userId) || !Array.isArray(set.to) ||
        !serverMessageTextAllowed(set.text, state)) return false;
    const expected = serverMessageRecipients(state, sess, set.thread);
    const recipients = set.to.map(String);
    return Boolean(expected && set.kind === serverMessageKind(set.thread) && recipients.length === expected.length &&
      new Set(recipients).size === recipients.length && expected.every((id) => recipients.includes(String(id))));
  }
  if (patch.del || (current.from !== sess.userId && !(Array.isArray(current.to) && current.to.map(String).includes(String(sess.userId))))) return false;
  const keys = Object.keys(set);
  if (keys.some((key) => key !== 'readBy')) return false;
  if (set.readBy !== undefined) {
    const allowed = new Set([...(Array.isArray(current.readBy) ? current.readBy.map(String) : []), String(sess.userId)]);
    if (!Array.isArray(set.readBy) || set.readBy.some((id) => !allowed.has(String(id)))) return false;
  }
  return true;
}

/* ---- Team Chat audio / video calling -------------------------------------
   Calls are signalled through the same authenticated state channel: a single
   `teamCalls` record carries the invite (who, what kind, which thread) and the
   short-lived SDP/ICE handshake. The server decides who may invite whom; the
   browser never names its own participants. Media never leaves the devices
   directly between the two people (peer-to-peer WebRTC) and nothing is recorded. */
const CALL_KINDS = new Set(['audio', 'video']);
const CALL_STATES = new Set(['ringing', 'accepted', 'declined', 'ended', 'missed']);
const CALL_MAX_SIGNAL_CHARS = 20000;
const CALL_MAX_AGE_MS = 2 * 60 * 60 * 1000;

/* A signed-in account is always resolvable: the credential record carries its
   own role and county, so a call works even where the directory row was created
   by activation rather than by the roster import. */
function callAccount(state, id) {
  const user = activeServerUser(state, id);
  if (user) return user;
  const cred = Object.values(state.creds || {}).find((c) => c && String(c.id) === String(id));
  if (!cred) return null;
  const row = (state.db && Array.isArray(state.db.users) ? state.db.users : [])
    .find((u) => u && (String(u.username || '').toLowerCase() === String(cred.username || '').toLowerCase() ||
      String(u.id || '') === String(id)));
  if (row && (row.active === false || row.status === 'inactive' || row.status === 'disabled' || row.archivedByRebuild)) return null;
  return { id: cred.id, username: cred.username, roleId: cred.roleId, countyId: cred.countyId, status: 'active', active: true };
}

function callKindOf(value) { return CALL_KINDS.has(String(value || '')) ? String(value) : ''; }
function callStateOf(value) { return CALL_STATES.has(String(value || '')) ? String(value) : ''; }
function callSignalText(value) { return typeof value === 'string' ? value.slice(0, CALL_MAX_SIGNAL_CHARS) : ''; }

/* Only a direct colleague chat or a shared channel can carry a call, so an
   invitation can never reach someone outside the messaging reach rules. */
function callThreadRecipients(state, sess, thread) {
  const value = String(thread || '');
  if (!value || value.length > 200) return null;
  const account = callAccount(state, sess.userId);
  if (!account) return null;
  const resolved = { userId: account.id, roleId: account.roleId, countyId: account.countyId };
  /* A broadcast or department channel has one recipient per member, and the
     invitation must list exactly those people. */
  const people = serverMessageRecipients(state, resolved, value);
  if (people && people.length) return people;
  /* A direct chat between the signed-in person and one colleague is the one
     case the sender can address by name: the thread names both parties. */
  if (value.startsWith('dm:')) {
    const ids = value.slice(3).split(':');
    if (ids.length !== 2 || ids[0] === ids[1] || !ids.includes(String(account.id))) return null;
    const other = callAccount(state, ids.find((id) => id !== String(account.id)));
    if (!other) return null;
    return [other.id];
  }
  return null;
}

function callPatchAllowed(patch, state, sess) {
  const calls = state.db && Array.isArray(state.db.teamCalls) ? state.db.teamCalls : [];
  const current = calls.find((call) => call && String(call.id) === String(patch.id));
  const set = patch.set && typeof patch.set === 'object' && !Array.isArray(patch.set) ? patch.set : {};
  const me = String(sess.userId);
  const callerId = String((current && current.callerId) || set.callerId || '');
  const participantIds = current
    ? (Array.isArray(current.participantIds) ? current.participantIds.map(String) : [])
    : (Array.isArray(set.participantIds) ? set.participantIds.map(String) : []);
  if (!current) {
    /* A new call is always invited by the signed-in account to the people the
       server says are in that thread. The inviter cannot choose the audience. */
    if (patch.del) return false;
    if (callerId !== me) return false;
    if (!callKindOf(set.kind) || !callThreadRecipients(state, sess, set.thread)) return false;
    const expected = callThreadRecipients(state, sess, set.thread).map(String);
    if (!expected.length || participantIds.length !== expected.length + 1 ||
        !participantIds.includes(me) || !expected.every((id) => participantIds.includes(id))) return false;
    return callStateOf(set.state || 'ringing') === 'ringing';
  }
  /* Only the inviter or an invited person may change a call record. */
  if (callerId !== me && !participantIds.includes(me)) return false;
  const changed = Object.keys(set).filter((key) => key !== 'before');
  /* Signs are the handshake itself: either party may post the other's. */
  if (changed.length === 1 && changed[0] === 'signal') return typeof set.signal === 'object';
  /* Anything else is a lifecycle step: nobody may rewrite who took part. */
  if (changed.some((key) => ['callerId', 'participantIds', 'thread', 'kind', 'startedAt'].includes(key))) return false;
  return changed.every((key) => ['state', 'signal', 'answeredBy', 'endedBy', 'endedAt', 'reason'].includes(key));
}

function callVisibleToScope(call, state, scope) {
  if (!call || !call.id || !callStateOf(call.state)) return false;
  const participantIds = Array.isArray(call.participantIds) ? call.participantIds.map(String) : [];
  if (!participantIds.includes(String(scope.userId))) return false;
  const created = Date.parse(String(call.createdAt || ''));
  if (Number.isFinite(created) && Date.now() - created > CALL_MAX_AGE_MS) return false;
  /* The invitation must still resolve to real, in-reach colleagues. */
  const caller = callAccount(state, call.callerId);
  if (!caller) return false;
  const expected = callThreadRecipients(state, { userId: caller.id, roleId: caller.roleId, countyId: caller.countyId }, call.thread) || [];
  const invited = participantIds.filter((id) => id !== String(caller.id));
  return invited.length === expected.length && expected.every((id) => invited.includes(String(id)));
}

function messageVisibleToScope(message, state, scope) {
  if (!message || (String(message.from || '') !== scope.userId &&
      !(Array.isArray(message.to) && message.to.map(String).includes(scope.userId)))) return false;
  const sender = activeServerUser(state, message.from);
  const expected = sender && serverMessageRecipients(state, { userId: sender.id, roleId: sender.roleId }, message.thread);
  const actual = Array.isArray(message.to) ? message.to.map(String) : [];
  if (!expected || message.kind !== serverMessageKind(message.thread) || actual.length !== expected.length ||
      new Set(actual).size !== actual.length || !expected.every((id) => actual.includes(String(id)))) return false;
  const text = String(message.text || '');
  const patients = state.db && Array.isArray(state.db.patients) ? state.db.patients : [];
  const matches = patients.filter((patient) => patient && (
    (patient.name && patient.name.length > 6 && text.toLowerCase().includes(String(patient.name).toLowerCase())) ||
    (patient.code && text.toLowerCase().includes(String(patient.code).toLowerCase())) ||
    (patient.id && text.includes(String(patient.id)))
  ));
  if (matches.length && (!CLINICAL_READ_ROLES.has(scope.roleId) || !matches.every((patient) => patientInPrincipalScope(patient, scope)))) return false;
  if (/(?:LOM-[A-Z]{3}-\d{4}|CCC\s*\/?\s*\d{3,}|(?:\+254|\b254|\b0)[17]\d{8}\b)/i.test(text)) {
    if (!CLINICAL_READ_ROLES.has(scope.roleId)) return false;
  }
  return true;
}

function notificationPatchAllowed(patch, state, sess) {
  const notifications = state.db && Array.isArray(state.db.notifications) ? state.db.notifications : [];
  const current = notifications.find((notification) => notification && String(notification.id) === String(patch.id));
  const set = patch.set && typeof patch.set === 'object' && !Array.isArray(patch.set) ? patch.set : {};
  if (current) {
    if (patch.del || String(current.userId || '') !== String(sess.userId)) return false;
    return Object.keys(set).every((key) => ['read', 'seenAt'].includes(key));
  }
  if (patch.del || !set || !set.userId || typeof set.title !== 'string' || typeof set.body !== 'string' ||
      set.title.length > 240 || set.body.length > 1000) return false;
  const sender = activeServerUser(state, sess.userId);
  const recipient = activeServerUser(state, set.userId);
  if (!sender || !recipient) return false;
  const canReach = GLOBAL_MESSAGE_ROLES.has(sess.roleId) || String(sender.countyId || '') === String(recipient.countyId || '');
  if (!canReach) return false;
  const text = `${set.title} ${set.body} ${String(set.link || '')}`;
  const matches = (state.db && Array.isArray(state.db.patients) ? state.db.patients : []).filter((patient) => {
    if (!patient) return false;
    const lowerText = text.toLowerCase();
    return Boolean((patient.name && patient.name.length > 6 && lowerText.includes(String(patient.name).toLowerCase())) ||
      (patient.code && lowerText.includes(String(patient.code).toLowerCase())) ||
      (patient.id && text.includes(String(patient.id))));
  });
  if (!matches.length) return true;
  const senderScope = principalScope(state, sess);
  const recipientScope = principalScope(state, { username: recipient.username, userId: recipient.id, roleId: recipient.roleId, countyId: recipient.countyId });
  return matches.every((patient) => patientInPrincipalScope(patient, senderScope) && patientInPrincipalScope(patient, recipientScope));
}

function scopedDbForSession(db, state, sess) {
  if(BOARD_ROLES.has(sess.roleId))return boardSnapshot(db||{},sess);
  const copy = sanitizeDbForClient(db || {});
  const scope = principalScope(state, sess);
  for(const name of ['devotionRosters','devotionMeetings','mondaySittingMinutes'])if(Array.isArray(copy[name]))
    copy[name]=copy[name].filter(r=>devotionRules.visible({...scope,id:scope.userId},r,name));
  if(Array.isArray(copy.devotionCommandReceipts))copy.devotionCommandReceipts=[];
  copy.execIssues=executiveMember(db,sess,officialStructure.exec)?(copy.execIssues||[]):[];
  copy.execMeetings=executiveMember(db,sess,officialStructure.exec)?(copy.execMeetings||[]):[];
  copy.cccReferrals=(copy.cccReferrals||[]).filter(r=>referralVisible(r,sess,db));
  const patients = Array.isArray(copy.patients) ? copy.patients : [];
  const syntheticOnly = patients.length > 0 && patients.every((p) => p && (p.demo === true || p.synthetic === true));
  const demoPreview = !TRIAL_MODE && syntheticOnly && !isGloballyActivated(state) && isDemoDatabase(state);
  const visiblePatients = demoPreview
    ? patients
    : (CLINICAL_READ_ROLES.has(scope.roleId)
      ? patients.filter((p) => patientInPrincipalScope(p, scope)) : []);
  if (!ACCOUNT_ADMIN_ROLES.has(scope.roleId)) {
    for (const name of ['pendingActivations', 'emergencyCodes']) if (Array.isArray(copy[name])) copy[name] = [];
    for (const name of ['accountRequests', 'recoveryRequests']) if (Array.isArray(copy[name])) {
      copy[name] = copy[name].map(item => { const safe = { ...item }; delete safe.code; delete safe.activationCode; return safe; });
    }
  }
  const patientIds = new Set(visiblePatients.map((p) => String(p.id)));
  const scopedResidentIds = new Set((Array.isArray(db.careResidents) ? db.careResidents : [])
    .filter((r) => r && patientIds.has(String(r.patientId))).map((r) => String(r.id)));
  for (const name of PATIENT_LINKED_COLLECTIONS) {
    if (!Array.isArray(copy[name])) continue;
    if (name === 'patients') { copy[name] = visiblePatients; continue; }
    if (name === 'intlPdcaDossiers') {
      copy[name] = copy[name].filter(r=>authorizedDossier(r,db) &&
        (scope.roleId==='intl.medical' || patientIds.has(String(r.patientId))));
      continue;
    }
    if (name === 'careCommandReceipts' || (scope.roleId==='coordinator' && !COORDINATOR_CLINICAL_READ.has(name))) { copy[name]=[]; continue; }
    copy[name] = (CLINICAL_READ_ROLES.has(scope.roleId) || demoPreview)
      ? copy[name].filter((r) => r && r.patientId != null && patientIds.has(String(r.patientId)))
      : [];
  }
  for (const name of ['careLogs', 'careIncidents']) {
    if (Array.isArray(copy[name])) copy[name] = (CLINICAL_READ_ROLES.has(scope.roleId) || demoPreview)
      ? copy[name].filter((r) => r && scopedResidentIds.has(String(r.residentId))) : [];
  }
  for (const name of COUNTY_AREA_SCOPED_COLLECTIONS) {
    if (Array.isArray(copy[name])) copy[name] = copy[name].filter((r) => countyAreaRecordInScope(r, scope, name));
  }
  for (const name of ['transactions', 'adminOpsPayg']) {
    if (!Array.isArray(db[name]) || CLINICAL_READ_ROLES.has(scope.roleId)) continue;
    copy[name] = FINANCIAL_DATA_ROLES.has(scope.roleId)
      ? db[name].filter((record) => financialRecordInScope(record, scope)).map(redactFinancialLink)
      : [];
  }
  if (Array.isArray(db.urgentCases) && !CLINICAL_READ_ROLES.has(scope.roleId)) {
    copy.urgentCases = URGENT_CASE_READ_ROLES.has(scope.roleId)
      ? db.urgentCases.filter((r) => countyAreaRecordInScope(r, scope, 'urgentCases')).map((record) => {
        const safe = redactFinancialLink(record);
        safe.name = 'Confidential beneficiary';
        safe.what = 'Clinical details restricted to the care team';
        return safe;
      })
      : [];
  }
  if (Array.isArray(copy.workspaceDrafts)) {
    copy.workspaceDrafts = copy.workspaceDrafts.filter((draft) => draft && String(draft.ownerId || '') === scope.userId &&
      (!draft.patientId || patientIds.has(String(draft.patientId))));
  }
  if (Array.isArray(copy.notifications)) {
    copy.notifications = copy.notifications.filter((notification) => notification && String(notification.userId || '') === scope.userId);
  }
  if (Array.isArray(copy.messages)) {
    copy.messages = copy.messages.filter((message) => messageVisibleToScope(message, state, scope));
  }
  if (Array.isArray(copy.teamCalls)) {
    copy.teamCalls = copy.teamCalls.filter((call) => callVisibleToScope(call, state, scope));
  }
  if (copy.drafts && typeof copy.drafts === 'object' && !Array.isArray(copy.drafts)) {
    copy.drafts = Object.fromEntries(Object.entries(copy.drafts).filter(([key]) => key.startsWith(`${scope.userId}:`)));
  }
  if (copy.personalPrefs && typeof copy.personalPrefs === 'object' && !Array.isArray(copy.personalPrefs)) {
    copy.personalPrefs = Object.hasOwn(copy.personalPrefs, scope.userId) ? { [scope.userId]: copy.personalPrefs[scope.userId] } : {};
  }
  if (Array.isArray(copy.calendarEvents)) {
    copy.calendarEvents = copy.calendarEvents.filter((e) => {
      if (!e) return false;
      if (e.patientId != null && !patientIds.has(String(e.patientId))) return false;
      return e.kind !== 'meeting' || canManageServerMeetings(scope.roleId) ||
        (Array.isArray(e.visibleTo) && e.visibleTo.map(String).includes(scope.userId));
    });
  }
  return copy;
}

function patchInPrincipalScope(patch, state, sess) {
  const scope = principalScope(state, sess);
  const current = (state.db && Array.isArray(state.db[patch.c]) ? state.db[patch.c] : [])
    .find((r) => r && String(r.id) === String(patch.id));
  /* `before` is client-provided merge metadata, never an authorization source. */
  const candidate = { ...(current || {}), ...(patch.set || {}) };
  if (patch.c === 'waitingList') {
    return WAITING_LIST_WRITE_ROLES.has(scope.roleId) &&
      (!current || countyAreaRecordInScope(current, scope, 'waitingList')) &&
      countyAreaRecordInScope(candidate, scope, 'waitingList');
  }
  if (patch.c === 'workspaceDrafts') {
    if (!CLINICAL_READ_ROLES.has(scope.roleId) || String(candidate.ownerId || '') !== scope.userId ||
        (current && String(current.ownerId || '') !== scope.userId)) return false;
    return !candidate.patientId || patchPatientInScope(candidate.patientId, state, scope);
  }
  if (!CLINICAL_READ_ROLES.has(scope.roleId)) return false;
  if (patch.c === 'patients') {
    return (!current || patientInPrincipalScope(current, scope)) && patientInPrincipalScope(candidate, scope);
  }
  const patients = state.db && Array.isArray(state.db.patients) ? state.db.patients : [];
  const patientFor = (record) => patients.find((p) => p && String(p.id) === String(record && record.patientId));
  const currentPatient = current && patientFor(current);
  const candidatePatient = patientFor(candidate);
  return (!current || Boolean(currentPatient && patientInPrincipalScope(currentPatient, scope))) &&
    Boolean(candidatePatient && patientInPrincipalScope(candidatePatient, scope));
}

function scopedPatchesForSession(patches, state, sess) {
  const scope = principalScope(state, sess);
  const events = state.db && Array.isArray(state.db.calendarEvents) ? state.db.calendarEvents : [];
  return (patches || []).flatMap((patch) => {
    if (!patch) return [patch];
    if(BOARD_ROLES.has(sess.roleId)&&!['personalPrefs'].includes(patch.c))return [];
    if (!ACCOUNT_ADMIN_ROLES.has(scope.roleId)) {
      if (['pendingActivations','emergencyCodes'].includes(patch.c)) return [];
      if (['accountRequests','recoveryRequests'].includes(patch.c)) {
        const safe = { ...patch };
        for (const part of ['set','before']) if (safe[part]) { safe[part] = { ...safe[part] }; delete safe[part].code; delete safe[part].activationCode; }
        return [safe];
      }
    }
    if (['transactions', 'adminOpsPayg'].includes(patch.c) && FINANCIAL_DATA_ROLES.has(scope.roleId) && !CLINICAL_READ_ROLES.has(scope.roleId)) {
      if (!financialPatchInScope(patch, state, sess)) return [];
      const safePatch = { ...patch };
      if (patch.set) safePatch.set = redactFinancialLink(patch.set);
      if (patch.before) safePatch.before = redactFinancialLink(patch.before);
      return [safePatch];
    }
    if (patch.c === 'messages') {
      const current = (state.db.messages || []).find((m) => m && String(m.id) === String(patch.id));
      const candidate = current || patch.set || {};
      return messageVisibleToScope(candidate, state, scope) ? [patch] : [];
    }
    if (patch.c === 'notifications') {
      const current = (state.db.notifications || []).find((n) => n && String(n.id) === String(patch.id));
      const candidate = current || patch.set || {};
      return candidate && String(candidate.userId || '') === scope.userId ? [patch] : [];
    }
    if (patch.c === 'teamCalls') {
      const current = (state.db.teamCalls || []).find((call) => call && String(call.id) === String(patch.id));
      const candidate = current || patch.set || {};
      return callVisibleToScope(candidate, state, scope) ? [patch] : [];
    }
    if(['execIssues','execMeetings'].includes(patch.c)&&!executiveMember(state.db,sess,officialStructure.exec))return [];
    if(patch.c==='cccReferrals'){const record=(state.db.cccReferrals||[]).find(r=>r.id===patch.id)||patch.set;return referralVisible(record,sess,state.db)?[patch]:[];}
    if (patch.c==='careCommandReceipts'||patch.c==='devotionCommandReceipts') return [];
    if (['devotionRosters','devotionMeetings','mondaySittingMinutes'].includes(patch.c)) {
      const record=(state.db[patch.c]||[]).find(r=>r.id===patch.id)||patch.set;
      // Deltas may include earlier private drafts. Never replay historical draft
      // payloads to someone who can see only the now-shared current record.
      return devotionRules.visible({...scope,id:scope.userId},record,patch.c)?[{c:patch.c,id:patch.id,set:record}]:[];
    }
    if (patch.c==='intlPdcaDossiers') {
      const dossier=(state.db.intlPdcaDossiers||[]).find(r=>r.id===patch.id);
      return authorizedDossier(dossier,state.db) && (scope.roleId==='intl.medical'||patchPatientInScope(dossier.patientId,state,scope)) ? [patch] : [];
    }
    if (PATIENT_LINKED_COLLECTIONS.has(patch.c) || COUNTY_AREA_SCOPED_COLLECTIONS.has(patch.c)) {
      if(scope.roleId==='coordinator'&&!COORDINATOR_CLINICAL_READ.has(patch.c))return [];
      return patchInPrincipalScope(patch, state, sess) ? [patch] : [];
    }
    if (patch.c !== 'calendarEvents') return [patch];
    const current = events.find((event) => event && String(event.id) === String(patch.id));
    const candidate = { ...(current || {}), ...(patch.set || {}) };
    if (candidate.patientId != null && !patchInPrincipalScope({ ...patch, set: candidate }, state, sess)) return [];
    const isMeeting = (current && current.kind === 'meeting') || (patch.set && patch.set.kind === 'meeting');
    if (!isMeeting || canManageServerMeetings(scope.roleId)) return [patch];
    if (patch.del) return [{ c: 'calendarEvents', id: patch.id, del: true }];
    const visibleTo = current && Array.isArray(current.visibleTo) ? current.visibleTo.map(String) : [];
    const previousVisibleTo = patch.before && Array.isArray(patch.before.visibleTo) ? patch.before.visibleTo.map(String) : [];
    if (previousVisibleTo.includes(scope.userId) && !visibleTo.includes(scope.userId)) {
      return [{ c: 'calendarEvents', id: patch.id, del: true }];
    }
    return visibleTo.includes(scope.userId) ? [patch] : [];
  });
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

function sessionSigningSecret() {
  const kv = kvConfig();
  return crypto.createHash('sha256').update(`carelink-sess-v1:${(kv && kv.token) || 'local'}:${CLOUD_KEY}`).digest();
}

function mintSignedSessionToken(cred, username, sessionId, deviceId) {
  const payload = {
    u: String(username || '').toLowerCase(),
    uid: cred.id || `u-${username}`,
    r: cred.roleId || 'staff',
    c: cred.countyId || 'kisumu',
    ...(sessionId ? { sid: sessionId } : {}),
    ...(deviceId ? { d: deviceId } : {}),
    ...(cred.sessionEpoch ? { e: cred.sessionEpoch } : {}),
    iat: Math.floor(Date.now() / 1000),
    n: crypto.randomBytes(9).toString('base64url'),
  };
  const bodyB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sigB64 = crypto.createHmac('sha256', sessionSigningSecret()).update(`s1.${bodyB64}`).digest('base64url');
  return `s1.${bodyB64}.${sigB64}`;
}

function verifySignedSessionToken(tok) {
  if (!tok || typeof tok !== 'string' || !tok.startsWith('s1.')) return null;
  const parts = tok.split('.');
  if (parts.length !== 3 || !parts[1] || !parts[2]) return null;
  const expectedSig = crypto.createHmac('sha256', sessionSigningSecret()).update(`s1.${parts[1]}`).digest();
  let actualSig;
  try { actualSig = Buffer.from(parts[2], 'base64url'); } catch { return null; }
  if (actualSig.length !== expectedSig.length || !crypto.timingSafeEqual(actualSig, expectedSig)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch { return null; }
  if (!payload || typeof payload !== 'object' || !payload.u || FORBIDDEN_KEYS.has(payload.u)) return null;
  const age = Math.floor(Date.now() / 1000) - Number(payload.iat || 0);
  if (!Number.isFinite(age) || age < -60 || age > IDLE_SECONDS) return null;
  return payload;
}

function extractRequestToken(req) {
  const hdr = req.headers['x-carelink-session'];
  if (hdr && typeof hdr === 'string') return hdr.trim();
  const auth = req.headers.authorization;
  if (auth && typeof auth === 'string' && /^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim();
  return '';
}

function getSession(state, req) {
  const tok = extractRequestToken(req);
  if (!tok || FORBIDDEN_KEYS.has(tok)) return null;
  if (state.revokedSessions && Object.prototype.hasOwnProperty.call(state.revokedSessions, tok)) return null;
  if (state.sessions && Object.prototype.hasOwnProperty.call(state.sessions, tok)) {
    const s = state.sessions[tok];
    if (s.sessionId && state.revokedSessions && Object.hasOwn(state.revokedSessions, `sid:${s.sessionId}`)) return null;
    const age = (Date.now() - new Date(s.lastSeen || s.createdAt).getTime()) / 1000;
    if (age > IDLE_SECONDS) return null;
    const username = String(s.username || '').toLowerCase();
    const cred = state.creds && state.creds[username] || null;
    if (!cred || cred.revokedAt || cred.active === false || !accountIsActive(state,username) || (cred.sessionEpoch && s.sessionEpoch !== cred.sessionEpoch)) return null;
    if (!approvedSessionDevice(state, req, s.deviceId) || !validTemporarySession(cred, s.sessionId, s.deviceId)) return null;
    const user = state.db && Array.isArray(state.db.users)
      ? state.db.users.find((u) => String(u.username || '').toLowerCase() === username)
      : null;
    /* Refresh mutable authorization attributes from the server-owned account
       records on every request, so an old session cannot retain a demoted role
       or an area assignment that an administrator has revoked. */
    return {
      token: tok, ...s, username,
      userId: (cred && cred.id) || (user && user.id) || s.userId,
      roleId: (cred && cred.roleId) || (user && user.roleId) || s.roleId,
      countyId: (cred && cred.countyId) || (user && user.countyId) || s.countyId,
      areaIds: (cred && Array.isArray(cred.areaIds) ? cred.areaIds : null)
        || (user && Array.isArray(user.areaIds) ? user.areaIds : s.areaIds),
      lastSeen: nowISO(),
    };
  }
  /* Upstash Global Redis routes writes to Primary and immediate reads (~5-300 ms
     later) to Read Replicas where `state.sessions[tok]` may not have replicated
     yet. Verify the server-signed HMAC session token so immediate post-login
     `/api/state` and `/api/auth/change-password` calls never 401 on replica lag. */
  const verified = verifySignedSessionToken(tok);
  if (!verified) return null;
  if (verified.sid && state.revokedSessions && Object.hasOwn(state.revokedSessions, `sid:${verified.sid}`)) return null;
  if (!state.setup && Object.keys(state.creds || {}).length === 0 && (!isDemoDatabase(state) || isGloballyActivated(state))) return null;
  const cred = state.creds && Object.prototype.hasOwnProperty.call(state.creds, verified.u)
    ? state.creds[verified.u]
    : null;
  if (!cred || cred.revokedAt || cred.active === false || !accountIsActive(state,verified.u) || (cred.sessionEpoch && verified.e !== cred.sessionEpoch)) return null;
  if (!approvedSessionDevice(state, req, verified.d) || !validTemporarySession(cred, verified.sid, verified.d)) return null;
  return {
    token: tok,
    username: verified.u,
    sessionEpoch: cred.sessionEpoch || '',
    userId: (cred && cred.id) || verified.uid,
    roleId: (cred && cred.roleId) || verified.r,
    countyId: (cred && cred.countyId) || verified.c || 'kisumu',
    sessionId: verified.sid || null,
    deviceId: verified.d,
    createdAt: new Date(verified.iat * 1000).toISOString(),
    lastSeen: nowISO(),
  };
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
/* The synthetic reference register this installation expects. It is the same
   4,000-patient board register the client seeder produces; a package built from
   a different register is refused rather than half-imported. */
const REFERENCE_PATIENT_COUNT = 4000;
const MASTER_ENCODING = 'brotli-base64';
const MASTER_MAX_CHUNKS = 256;
const MASTER_MAX_CHUNK_CHARS = 600000;
const MASTER_MAX_RAW_BYTES = 160 * 1024 * 1024; /* the 4,000-patient register is ~78 MB uncompressed */
const MASTER_MAX_COMPRESSED_BYTES = 8 * 1024 * 1024;
const MASTER_CHUNK_PREFIX = TRIAL_MODE ? 'carelink_trial_reference_master_v1_' : 'carelink_reference_master_v1_';
const STATE_PAGE_MAX_BYTES = 3 * 1024 * 1024;
const STATE_PAGE_THRESHOLD = 512 * 1024;
const MASTER_PROTECTED_KEYS = new Set([
  'settings', 'meta', 'users', 'roles', 'audit', 'approvals', 'backups',
  'drafts', 'mergeJournal', 'presence', 'sessions', 'creds', 'deltas',
  ...careWorkflow.OWNED, ...devotionRules.OWNED,
]);

function retainsClinicalHistory(db={}) {
  return (db.patients||[]).some(p=>p?.demo!==true&&p?.synthetic!==true)||
    careWorkflow.OWNED.some(key=>Array.isArray(db[key])&&db[key].length>0);
}

/* Roles allowed to change who holds which role, county or account status. */
const ACCOUNT_ADMIN_ROLES = new Set(['chief', 'countyadmin', 'hr', 'director', 'president', 'program.admin']);
/* Fields on a user record that grant or revoke access. */
const PRIVILEGED_USER_FIELDS = new Set([
  'roleId', 'countyId', 'areaIds', 'departmentId', 'jobTitle', 'seatTier', 'unconfirmed',
  'permissions', 'scopes', 'status', 'active', 'username', 'mustChange', 'demo',
  'consoles', 'extraRoles', 'deptId', 'hash', 'salt',
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
  if(careWorkflow.OWNED.some(key=>db[key]!=null&&(!Array.isArray(db[key])||db[key].length))) {
    throw new MasterPackageError('A synthetic reference import cannot supply clinical decisions, evidence provenance, review authorizations or command receipts.', 'master_clinical_workflow_forbidden');
  }
  if(devotionRules.OWNED.some(key=>db[key]!=null&&(!Array.isArray(db[key])||db[key].length))) {
    throw new MasterPackageError('A synthetic reference import cannot supply staff devotion decisions or command receipts.', 'master_devotion_workflow_forbidden');
  }
  if(!patients.every(p=>p?.demo===true||p?.synthetic===true))throw new MasterPackageError('The reference-master route accepts synthetic patients only.', 'master_synthetic_only');
  if (patients.length !== REFERENCE_PATIENT_COUNT) throw new MasterPackageError(`The full reference master must contain exactly ${REFERENCE_PATIENT_COUNT.toLocaleString('en-GB')} patients; it contains ${patients.length}.`);
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
    { key: 'profiles', label: `${patients.length.toLocaleString('en-GB')} complete demographic, identity, anthropometric, adherence and care-plan profiles`, actual: patients.length - incompleteProfile, expected: patients.length },
    { key: 'identifiers', label: 'Unique patient code, CCC number and national identifier for every patient', actual: uniqueIdentifiers, expected: patients.length },
    { key: 'visits', label: 'At least 12 complete longitudinal visits for every patient', actual: patients.length - withoutTwelveVisits, expected: patients.length },
    { key: 'pdcas', label: 'A PDCA cycle with a completed, structured 30-day review for every patient', actual: patients.length - withoutReviewedPdca, expected: patients.length },
    { key: 'related', label: 'Condition, household-support and document coverage for every patient', actual: patients.length - withoutRelated, expected: patients.length },
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
  for (const [tok, ts] of Object.entries(state.revokedSessions || {})) {
    if (!Number.isFinite(Number(ts)) || (now - Number(ts)) / 1000 > IDLE_SECONDS) delete state.revokedSessions[tok];
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
  if (Buffer.isBuffer(req.body)) {
    if (req.body.length === 0 || req.body.length > MAX_BODY_BYTES) return {};
    try { return JSON.parse(req.body.toString('utf8')); } catch { return {}; }
  }
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    const trimmed = req.body.trim();
    if (!trimmed || trimmed.length > MAX_BODY_BYTES) return {};
    try { return JSON.parse(trimmed); } catch { return {}; }
  }
  /* If Vercel's runtime already consumed/ended the incoming stream (e.g. empty
     POST body where req.body === undefined), never wait on 'end' — it has
     already fired and would otherwise hang until Function maxDuration. */
  if (req.readableEnded || req.complete || typeof req.on !== 'function') return {};
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let done = false;
    let streamTimer = null;
    const finish = (v) => {
      if (!done) {
        done = true;
        if (streamTimer) clearTimeout(streamTimer);
        resolve(v);
      }
    };
    let inSetup = true;
    streamTimer = setTimeout(() => {
      if (inSetup) return;
      finish({});
    }, 10000);
    inSetup = false;
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
  return generateReferenceManifest();
}

async function ensureFreshStateMinRev(currentState, minRev) {
  const target = Number(minRev) || 0;
  let s = currentState;
  if (target <= 0 || (Number(s.rev) || 0) >= target) return s;
  const waits = [150, 350, 700];
  for (const ms of waits) {
    await new Promise((r) => setTimeout(r, ms));
    const reloaded = await loadCloudState();
    s = reloaded.state;
    if ((Number(s.rev) || 0) >= target) break;
  }
  return s;
}

/* The one-time handoff is encrypted with a key derived from the Chief's
   reauthentication password. It is never written in cleartext. A short-lived
   recovery copy protects against a lost HTTP response after a successful CAS. */
function sealCredentialPack(rows, password, chiefUsername) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(password, salt, PBKDF2_ROUNDS, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(chiefUsername));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(rows), 'utf8'), cipher.final()]);
  return { chiefUsername, expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: ciphertext.toString('base64') };
}
function openCredentialPack(pack, password, chiefUsername) {
  if (!pack || pack.chiefUsername !== chiefUsername || !Number.isFinite(pack.expiresAt) || pack.expiresAt <= Date.now()) return null;
  try {
    const key = crypto.pbkdf2Sync(password, Buffer.from(pack.salt, 'base64'), PBKDF2_ROUNDS, 32, 'sha256');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(pack.iv, 'base64'));
    decipher.setAAD(Buffer.from(chiefUsername));
    decipher.setAuthTag(Buffer.from(pack.tag, 'base64'));
    const rows = JSON.parse(Buffer.concat([decipher.update(Buffer.from(pack.data, 'base64')), decipher.final()]).toString('utf8'));
    return Array.isArray(rows) ? rows : null;
  } catch { return null; }
}
function chiefReauthenticated(state, sess, password) {
  const cred = sess && state.creds && state.creds[sess.username];
  return Boolean(sess && sess.roleId === 'chief' && cred && cred.roleId === 'chief' &&
    !cred.mustChange && typeof password === 'string' && verifyPassword(password, cred.salt, cred.digest));
}

/* Work addresses are never derived from a person's name or username. Only
   explicit Chief attestation in the server mailbox register makes an address
   eligible for export. Email/SMS delivery and provider verification are Phase 2. */
const OFFICIAL_EMAIL_DOMAIN = 'lomamofoundation.org';
/* Retain sign-in compatibility for an EXISTING legacy account address; this
   matching helper neither creates a mailbox nor makes it exportable. */
const ORG_ALIAS_DOMAINS = new Set([OFFICIAL_EMAIL_DOMAIN, 'lomamo.npo', 'lomamofoundation.co.ke']);
function aliasKey(value){
  const clean = String(value || '').trim().toLowerCase();
  const at = clean.lastIndexOf('@');
  if (at < 1) return clean;
  const local = clean.slice(0, at).replace(/[^a-z0-9._-]/g, '');
  const domain = clean.slice(at + 1);
  return `${local}@${ORG_ALIAS_DOMAINS.has(domain) ? '*' : domain}`;
}

function chiefUsernameOr(username){ return String(username || 'chief.admin').replace(/[^a-z0-9._-]/g, '') || 'chief.admin'; }

function rebuildOfficialAccounts(state, sess) {
  const db = state.db || (state.db = {});
  const existing = Array.isArray(db.users) ? db.users : [];
  const chiefCred = state.creds[sess.username];
  const chiefOld = existing.find(u => u && String(u.username || '').toLowerCase() === sess.username) || {};
  const chiefId = String(chiefCred.id || chiefOld.id || 'u-chief-admin');
  const byName = new Map(existing.filter(Boolean).map(u => [String(u.username || '').toLowerCase(), u]));
  const used = new Set([chiefId]);
  const ids = new Map([['chief.admin', chiefId]]);
  for (const r of officialStructure.roster) {
    if (r.roleId === 'chief') continue;
    const old = byName.get(r.username);
    const preferred = old && old.id ? String(old.id) : `u-${r.username.replace(/\./g, '-')}`;
    let id = preferred;
    if (used.has(id)) id = `u-rebuild-${r.username.replace(/[^a-z0-9]/g, '-')}`;
    if (used.has(id)) throw new Error('Duplicate official account identifier');
    used.add(id); ids.set(r.username, id);
  }
  const idByOfficialId = new Map([...ids].map(([username, id]) => [username === 'chief.admin' ? 'u-chief-admin' : `u-${username.replace(/\./g, '-')}`, id]));
  const now = nowISO();
  const nextCreds = { [sess.username]: { ...chiefCred } };
  const nextUsers = [];
  const rows = [];
  const passwords = new Set();
  for (const r of officialStructure.roster) {
    const chief = r.roleId === 'chief';
    const username = chief ? sess.username : r.username;
    const id = chief ? chiefId : ids.get(r.username);
    const email = chief ? (chiefCred.email || '') : rosterMailbox(state,r);
    const user = {
      id, username, name:r.name, roleId:r.roleId, countyId:r.countyId,
      areaIds:r.areas || [], departmentId:r.dept, jobTitle:r.job,
      reportsTo: idByOfficialId.get(r.reportsTo) || null,
      email, unconfirmed:Boolean(r.unconfirmed), surnamePending:Boolean(r.surnamePending),
      seatNote:r.note || '', visitDays:r.visitDays || [], visitDaysNote:r.visitDaysNote || '',
      canLeaveMonday:Boolean(r.canLeaveMonday), execTeam:officialStructure.exec.includes(r.username),
      ...(r.permOverrides ? { permOverrides:r.permOverrides } : {}),
      status: r.unconfirmed ? 'unconfirmed' : 'active', active:!r.unconfirmed,
      mustChange: !chief && !r.unconfirmed, mustChangePassword: !chief && !r.unconfirmed, dpaFirstLoginRequired: !chief && !r.unconfirmed,
      demo:false, provisioned:!r.unconfirmed, createdBy:chiefId, created:now,
    };
    if (chief) {
      user.mustChange = Boolean(chiefCred.mustChange);
      user.mustChangePassword = Boolean(chiefCred.mustChange);
      user.created = chiefOld.created || now;
      nextCreds[username].name = r.name;
    } else if (!r.unconfirmed) {
      let password;
      do { password = generateStrongPassword(); } while (passwords.has(password));
      passwords.add(password);
      const { salt, digest } = hashPassword(password);
      nextCreds[username] = { id, username, email, name:r.name, roleId:r.roleId, countyId:r.countyId,
        areaIds:r.areas || [], departmentId:r.dept, salt, digest, mustChange:true,
        temporary:temporaryMetadata(state,sess.username),
        issuedAt:now, issuedBy:sess.username,
        sessionEpoch:crypto.randomBytes(16).toString('hex'), updatedAt:now };
      rows.push({ id, name:r.name, username, email, tempPassword:password, roleId:r.roleId,
        role:(officialStructure.roles.find(x=>x.id===r.roleId) || {}).name || r.roleId,
        department:r.dept, county:r.countyId, jobTitle:r.job, expiresAt:new Date(nextCreds[username].temporary.expiresAt).toISOString() });
    }
    nextUsers.push(user);
  }
  /* Keep legacy identities as inactive attribution records; no credential or
     role authority survives for them. Preserve the old IDs used in demo data. */
  const newNames = new Set(nextUsers.map(u=>u.username));
  for (const old of existing) {
    if (!old || newNames.has(String(old.username || '').toLowerCase()) || used.has(String(old.id || ''))) continue;
    const clean = { ...old, status:'inactive', active:false, archivedByRebuild:true };
    delete clean.hash; delete clean.salt; delete clean.permOverrides;
    nextUsers.push(clean);
  }
  db.users = nextUsers;
  /* Relink the employee directory while preserving leave and other records. */
  const officialUsers = nextUsers.filter(u=>!u.archivedByRebuild);
  const employeeByName = new Map(officialUsers.map(u=>[u.username, u]));
  const oldUsernameById = new Map(existing.filter(Boolean).map(u=>[String(u.id || ''), String(u.username || '').toLowerCase()]));
  const linked = new Set();
  db.employees = Array.isArray(db.employees) ? db.employees : [];
  for (const employee of db.employees) {
    if (!employee) continue;
    const uname = String(employee.username || oldUsernameById.get(String(employee.userId || '')) || '').toLowerCase();
    const u = employeeByName.get(uname);
    if (!u) continue;
    employee.userId = u.id; employee.username = u.username; employee.name = u.name;
    employee.dept = u.departmentId; employee.county = u.countyId; employee.role = u.jobTitle;
    employee.unconfirmed = u.unconfirmed; employee.visitDays = u.visitDays;
    employee.visitDaysNote = u.visitDaysNote; employee.canLeaveMonday = u.canLeaveMonday;
    linked.add(u.id);
  }
  for (const u of officialUsers) if (!linked.has(u.id)) db.employees.push({
    id:`emp-official-${u.username.replace(/[^a-z0-9]/g, '-')}`, userId:u.id, username:u.username,
    name:u.name, dept:u.departmentId, county:u.countyId, role:u.jobTitle,
    status:u.unconfirmed ? 'unconfirmed' : 'active', unconfirmed:u.unconfirmed,
    visitDays:u.visitDays, visitDaysNote:u.visitDaysNote, canLeaveMonday:u.canLeaveMonday,
  });
  const officialRoleIds = new Set(officialStructure.roles.map(r=>r.id));
  db.roles = [...officialStructure.roles, ...(Array.isArray(db.roles) ? db.roles.filter(r=>r && !officialRoleIds.has(r.id)) : [])];
  state.creds = nextCreds;
  state.sessions = Object.fromEntries(Object.entries(state.sessions || {}).filter(([,s])=>s && String(s.username || '').toLowerCase()===sess.username));
  state.loginFailures = {};
  for (const field of ['pendingActivations', 'emergencyCodes']) {
    if (Array.isArray(db[field])) db[field] = db[field].filter(x=>x && String(x.username || '').toLowerCase()===sess.username);
  }
  for (const field of ['activations', 'emergencies']) {
    if (Array.isArray(state[field])) state[field] = state[field].filter(x=>x && String(x.username || '').toLowerCase()===sess.username);
  }
  state.org = { ...(state.org || {}), emailDomain:OFFICIAL_EMAIL_DOMAIN };
  db.settings = { ...(db.settings || {}), org:{ ...((db.settings && db.settings.org) || {}), emailDomain:OFFICIAL_EMAIL_DOMAIN } };
  state.rev = (Number(state.rev) || 0) + 1;
  state.rebuildRevision = state.rev;
  state.deltas = [];
  appendServerAudit(state, chiefId, 'system.accounts_rebuilt', 'installation', 'official-hierarchy',
    `Official hierarchy rebuilt; ${rows.length} named staff credentials issued, ${officialStructure.roster.filter(r=>r.unconfirmed).length} unconfirmed seats disabled. Chief credential preserved; non-account records retained.`,{deviceId:sess.deviceId,rowCount:rows.length});
  return rows;
}

/* The opaque browser proof is an HttpOnly same-origin cookie, not a supplied
   fingerprint. Password-verified browsers are enrolled automatically; tokens
   remain bound to that proof and explicitly revoked browsers remain blocked. */
const DEVICE_COOKIE = 'carelink_device_v1';
const ENTRY_THEME_IDS = new Set(['heritage', 'clinic']);
function systemConfig(state) {
  const settings = state.db && state.db.settings || {};
  const cfg = settings.system && settings.system.config || {};
  const entryTheme = ENTRY_THEME_IDS.has(cfg.entryTheme) ? cfg.entryTheme :
    (settings.landingThemeExplicit && ENTRY_THEME_IDS.has(settings.landingTheme) ? settings.landingTheme : 'clinic');
  const days = Number(cfg.temporaryPasswordDays);
  return { entryTheme, temporaryPasswordDays:Number.isInteger(days) && days >= 1 && days <= 30 ? days : 7 };
}
function deviceProof(req) {
  const cookie = String(req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(DEVICE_COOKIE + '='));
  const proof = cookie ? cookie.slice(DEVICE_COOKIE.length + 1) : '';
  return /^[A-Za-z0-9_-]{43}$/.test(proof) ? proof : '';
}
function setDeviceCookie(req, res, proof) {
  const host = String(req.headers.host || '').split(':')[0];
  const local = ['localhost','127.0.0.1','0.0.0.0'].includes(host);
  res.setHeader('Set-Cookie', `${DEVICE_COOKIE}=${proof}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${local && req.headers['x-forwarded-proto'] !== 'https' ? '' : '; Secure'}`);
}
function approvedSessionDevice(state, req, expected) {
  const proof = deviceProof(req);
  if (!proof || !expected || !state.devicePolicyInstalled) return false;
  const id = sha256Hex(proof);
  const record = state.devices && state.devices[id];
  return id === expected && record && record.status === 'approved';
}
function accountIsActive(state,username) {
  const user=(state.db && state.db.users || []).find(u=>u && String(u.username||'').toLowerCase()===username);
  return !user || (!user.unconfirmed && user.active!==false && !['inactive','unconfirmed','revoked'].includes(user.status));
}
function validTemporarySession(cred, sessionId, deviceId) {
  return !cred.temporary || (Number(cred.temporary.expiresAt) > Date.now() &&
    Boolean(cred.temporary.usedAt) && cred.temporary.sessionId === sessionId && cred.temporary.deviceId === deviceId);
}
function temporaryMetadata(state,issuedBy) {
  return {issuedBy,issuedAt:nowISO(),expiresAt:Date.now()+systemConfig(state).temporaryPasswordDays*86400000,usedAt:null,sessionId:null,deviceId:null};
}
async function hydrateSecurityState(state) {
  if (state._headOnly && !state._shardedManifest) {
    const full = (await loadCloudState()).state;
    Object.assign(state, full);
    delete state._headOnly;
  }
}
async function admitLoginDevice(state, req, res, body, cred, {save = true} = {}) {
  await hydrateSecurityState(state);
  const current = state.creds && state.creds[cred.username];
  if (!current || current.digest !== cred.digest || current.sessionEpoch !== cred.sessionEpoch) {
    return {ok:false,code:'state_conflict',error:'The account changed while signing in. Please retry.'};
  }
  let proof = deviceProof(req);
  if (!proof) { proof = crypto.randomBytes(32).toString('base64url'); setDeviceCookie(req, res, proof); }
  const id = sha256Hex(proof);
  state.devices = state.devices || {};
  let record = state.devices[id];
  if (record && ['rejected','revoked'].includes(record.status)) return {ok:false,code:'device_rejected',
    deviceId:id, deviceStatus:record.status, error:'This browser has been explicitly revoked. Contact the Chief System Administrator.'};
  if (record && record.status === 'approved' && state.devicePolicyInstalled) return {ok:true,deviceId:id};
  if (!record) {
    if (Object.keys(state.devices).length >= 5000) return {ok:false,code:'device_registry_full',error:'The browser register is full. Contact the Chief System Administrator.'};
    const type = ['computer','tablet','phone','other'].includes(body.deviceType) ? body.deviceType : 'other';
    record = state.devices[id] = {id, label:clipString(body.deviceLabel || (typeof body.device === 'string' ? body.device : '') || 'Staff browser',100),
      type, firstSeen:nowISO(), requestedBy:cred.username, users:[cred.username], status:'approved'};
    appendServerAudit(state, cred.username, 'device.enrolled', 'device', id, 'Browser automatically enrolled after successful credential verification.', {deviceId:id,type});
  } else if (record.status === 'pending') {
    record.status = 'approved';
    appendServerAudit(state, cred.username, 'device.enrolled', 'device', id, 'Pending browser enrolled after successful credential verification.', {deviceId:id});
  }
  if (record.status !== 'approved') return {ok:false,code:'device_rejected',error:'This browser registration cannot be used. Contact the Chief System Administrator.'};
  state.devicePolicyInstalled = true;
  const known = Array.isArray(record.users) ? record.users : [];
  record.users = [...new Set([...known, cred.username])].slice(-100);
  record.lastSeen = nowISO();
  if (save) await saveCloudAuthMetadata(state);
  return {ok:true,deviceId:id};
}
function rosterMailbox(state, seat) {
  if (TRIAL_MODE || seat.unconfirmed) return '';
  const attestation = state.mailboxes && state.mailboxes[seat.username];
  const address = String(attestation && attestation.email || '').trim().toLowerCase();
  return attestation && attestation.confirmedBy && /^[a-z0-9._-]+@lomamofoundation\.org$/.test(address) ? address : '';
}

function staffExportRoster(sess, state) {
  if (TRIAL_MODE) return (state.db?.users || []).filter(u=>u && u.synthetic === true && u.demo === true).map(u=>({
    username:u.username,name:u.name,roleId:u.roleId,countyId:u.countyId,areas:u.areaIds || [],dept:u.departmentId,job:u.jobTitle,unconfirmed:false,
  }));
  // A commissioned Chief may have chosen a different username. Do not export
  // a fictitious chief.admin login that does not exist on this installation.
  return officialStructure.roster.map(seat => seat.roleId === 'chief'
    ? {...seat, username:sess.username} : seat);
}

function credentialExportRow(state, seat) {
  return { username:seat.username, name:seat.name, roleId:seat.roleId, department:seat.dept, county:seat.countyId,
    jobTitle:seat.job, unconfirmed:Boolean(seat.unconfirmed), email:rosterMailbox(state,seat),
    mailboxConfirmed:Boolean(rosterMailbox(state,seat)), temporaryPassword:'', expiresAt:null };
}

async function handleRequest(req, res) {
  const urlObj = new URL(req.url || '/api/health', `http://${req.headers.host || 'localhost'}`);
  const queryPath = req.query && typeof req.query.__path === 'string' ? req.query.__path : null;
  const rewritten = urlObj.searchParams.get('__path') || queryPath;
  let route = rewritten
    ? rewritten.replace(/^\/+|\/+$/g, '')
    : urlObj.pathname.replace(/^\/?api\/?/, '').replace(/\/+$/, '');
  const method = (req.method || 'GET').toUpperCase();
  if (!['GET','HEAD','OPTIONS'].includes(method) && req.headers.origin) {
    let sameOrigin = false;
    try { sameOrigin = new URL(req.headers.origin).host === req.headers.host; } catch { /* fail closed */ }
    if (!sameOrigin) return sendJson(res, 403, {ok:false,code:'origin_denied',error:'Use this installation’s own origin for account and data changes.'});
  }
  if ((route === '' || route === 'index') && method === 'GET') route = 'health';

  if (!TRIAL_MODE && (process.env.CARELINK_TRIAL_MODE || process.env.CARELINK_TRIAL_HOST || process.env.CARELINK_TRIAL_SETUP_SECRET ||
      process.env.CARELINK_TRIAL_KV_REST_API_URL || process.env.CARELINK_TRIAL_KV_REST_API_TOKEN)) {
    return sendJson(res, 503, {ok:false,code:'trial_mode_invalid',error:'Incomplete or invalid isolated-trial configuration. No data was accessed.'});
  }
  if (TRIAL_MODE) {
    const host = String(req.headers.host || '').toLowerCase();
    const configuredHost = String(process.env.CARELINK_TRIAL_HOST || '').trim().toLowerCase();
    const protectedHosts = new Set(['care-link-dims-dev-three.vercel.app', 'care-link-dims-dev.vercel.app', 'theqwengacfs.github.io']);
    if (!configuredHost || host !== configuredHost || protectedHosts.has(host) || !/^[a-z0-9.-]+(?::[0-9]{1,5})?$/.test(host)) {
      return sendJson(res, 503, {ok:false,code:'trial_host_invalid',error:'The isolated trial host is not configured correctly. No data was accessed.'});
    }
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(String(process.env.CARELINK_TRIAL_SETUP_SECRET || ''))) {
      return sendJson(res, 503, {ok:false,code:'trial_setup_secret_required',error:'The isolated trial requires a 32-byte random base64url setup secret before it can run.'});
    }
    /* A distinct variable and key namespace are not a substitute for a
       separate KV database. Refuse a database containing the live root even
       if the operator accidentally supplied its credentials here. */
    const liveKeyExists = await runKvCommand(['EXISTS', LIVE_CLOUD_KEY], 10000, 'read');
    if (liveKeyExists !== 0 && liveKeyExists !== '0') {
      return sendJson(res, 503, {ok:false,code:'trial_live_store_detected',error:'This database contains a live CareLink root or could not be checked. Use a separate empty trial database; no trial data was written.'});
    }
    if (['setup', 'setup/reset-first-run', 'setup/activate-global'].includes(route) && method === 'POST') {
      return sendJson(res, 403, {ok:false,code:'trial_setup_locked',error:'The isolated trial is initialized only through its protected one-time setup. Production setup and activation are disabled.'});
    }
    if (route === 'trial/initialize' && method === 'POST') {
      const supplied = String(req.headers['x-carelink-trial-setup-secret'] || '');
      const expected = String(process.env.CARELINK_TRIAL_SETUP_SECRET || '');
      const a = crypto.createHash('sha256').update(supplied).digest();
      const b = crypto.createHash('sha256').update(expected).digest();
      if (!supplied || !crypto.timingSafeEqual(a, b)) return sendJson(res, 403, {ok:false,code:'trial_setup_denied',error:'Trial setup authorization failed.'});
    }
  }

  /* 0a. Safe Non-Sensitive KV Connection Diagnostics (never exposes tokens or PII) */
  if (route === 'kv-diagnostics' && method === 'GET') {
    const cands = kvCandidates({ allowReadOnlyFallback: true });
    const tcpCands = redisTcpCandidates();
    if (!cands.length && !tcpCands.length) {
      return sendJson(res, 503, {
        ok: false,
        configured: false,
        code: 'kv_required',
        error: 'CareLink online storage is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL / REDIS_URL / KV_URL) in Vercel.',
      });
    }
    const hosts = [
      ...cands.map((c) => { try { return new URL(c.url).host; } catch { return 'invalid-url'; } }),
      ...tcpCands.map((t) => `${t.protocol}//${t.host}:${t.port}`),
    ];
    try {
      const head = await loadCloudHead();
      return sendJson(res, 200, {
        ok: true,
        configured: true,
        candidateCount: cands.length + tcpCands.length,
        restCandidates: cands.length,
        tcpCandidates: tcpCands.length,
        hosts,
        rev: head.state.rev || 0,
        setup: Boolean(head.state.setup),
        globallyActivated: Boolean(head.state.globallyActivated),
      });
    } catch (err) {
      if (err.retryAfterSeconds) res.setHeader('Retry-After', String(err.retryAfterSeconds));
      return sendJson(res, err.statusCode || 503, {
        ok: false,
        configured: true,
        candidateCount: cands.length + tcpCands.length,
        restCandidates: cands.length,
        tcpCandidates: tcpCands.length,
        hosts,
        code: err.code || 'kv_unavailable',
        ...(err.retryAfterSeconds ? { retryAfterSeconds: err.retryAfterSeconds } : {}),
        error: err.message || 'CareLink KV diagnostic check failed.',
      });
    }
  }

  /* 0b. Pre-Activation Fresh First-Run Reset & Corrupted-KV Recovery:
     Handled before unconditional loadCloudState() so an unactivated or
     malformed/WRONGTYPE KV document can be cleanly reset to Step 1 of First-Run
     Setup without reading multi-megabyte shards, while any globally activated
     installation remains permanently locked. */
  if (route === 'setup/reset-first-run' && method === 'POST') {
    const body = await readJsonBody(req);
    if (!body || body.confirm !== 'RESET-FIRST-RUN') {
      return sendJson(res, 400, { ok: false, code: 'confirm_required', error: 'Pass confirm="RESET-FIRST-RUN" to reset an unactivated First-Run installation.' });
    }
    let existing = null;
    let hadCorruptedKey = false;
    try {
      const loaded = await loadCloudHead();
      existing = loaded.state;
    } catch (err) {
      /* If KV itself is unreachable or unconfigured, fail closed; only recover from kv_invalid_state / WRONGTYPE. */
      if (!err || err.code !== 'kv_invalid_state') throw err;
      hadCorruptedKey = true;
    }
    if (existing && isGloballyActivated(existing)) {
      return sendJson(res, 409, {
        ok: false,
        code: 'globally_activated',
        error: 'This installation is globally activated; First-Run setup reset is permanently locked.',
      });
    }
    /* Replace corrupt data with the same atomic snapshot check; never delete
       a key another request may have repaired after our read. */
    const fresh = blankStore();
    fresh.rev = existing && Number.isFinite(existing.rev) ? existing.rev + 1 : 1;
    appendServerAudit(fresh, 'setup-reset', 'setup.reset_first_run', 'installation', 'online-cloud',
      existing ? 'Unactivated First-Run installation reset for fresh commissioning' : 'Malformed KV state reset for fresh First-Run commissioning');
    await saveCloudState(fresh);
    return sendJson(res, 200, { ok: true, reset: true, rev: fresh.rev });
  }

  const sinceParam = route === 'state' && method === 'GET' ? Number(urlObj.searchParams.get('since') || '0') : 0;
  const isHeadRoute = (
    ((route === 'health' || route === 'bootstrap' || route === 'rev' || route === 'session/whoami') && method === 'GET') ||
    (route === 'state' && method === 'GET' && sinceParam > 0) ||
    ((route === 'auth/login' || route === 'auth/logout' || route === 'session/beat') && method === 'POST')
  );
  let { state, driver } = isHeadRoute
    ? await loadCloudHead()
    : await loadCloudState({ readOnly: method === 'GET' });

  /* One-time isolated trial initialization. The secret is server-configured,
     never a default or a URL parameter; an existing root is never replaced.
     Credentials are returned once and only salted hashes enter the store. */
  if (route === 'trial/initialize' && method === 'POST') {
    if (!TRIAL_MODE) return sendJson(res, 404, {ok:false,code:'not_found',error:'Not found.'});
    if (requestSnapshot.getStore()?.snapshot !== 'missing' || state.setup) {
      return sendJson(res, 409, {ok:false,code:'trial_already_initialized',error:'Trial storage is not empty. It will not be reset or replaced.'});
    }
    const manifest = generateReferenceManifest();
    const compressed = Buffer.from(manifest.chunks.join(''), 'base64');
    if (compressed.length !== manifest.compressedBytes || crypto.createHash('sha256').update(compressed).digest('hex') !== manifest.compressedDigest) throw new MasterPackageError('Synthetic reference checksum failed.', 'master_digest_mismatch');
    const raw = zlib.brotliDecompressSync(compressed, {maxOutputLength:manifest.rawBytes + 1});
    if (raw.length !== manifest.rawBytes || crypto.createHash('sha256').update(raw).digest('hex') !== manifest.digest) throw new MasterPackageError('Synthetic reference checksum failed.', 'master_digest_mismatch');
    const payload = JSON.parse(raw.toString('utf8'));
    const verified = validateReferencePayload(payload);
    const users = payload.db.users.filter(u => u && u.synthetic === true && u.demo === true && u.active !== false && u.status === 'active');
    /* A trial seat is not a claim that the corresponding real-world staff seat
       is occupied. Give unconfirmed seats explicit synthetic labels, only in
       this separate evaluation database, so every role can be exercised. */
    for (const user of users) if (user.unconfirmed) {
      user.name = `Synthetic trial seat · ${user.jobTitle || user.roleId}`;
      user.unconfirmed = false; user.surnamePending = false;
      user.seatNote = 'Synthetic trial account; not an attestation of a real staff appointment.';
    }
    if (users.filter(u=>u.roleId === 'chief').length !== 1) throw new MasterPackageError('Synthetic trial must have exactly one initial Chief.', 'trial_invalid_users');
    state.db = payload.db;
    state.db.meta = {...state.db.meta, trialMode:true, demoMode:true, demoSeeded:true,
      referenceMaster:{id:'TRIAL-INITIAL',importedAt:nowISO(),importedBy:'trial-initializer',digest:manifest.digest,counts:verified.counts,quality:verified.quality}};
    state.org = {name:'CareLink synthetic team trial',shortName:'CareLink trial',county:'kisumu',emailDomain:'lomamo.example'};
    state.creds = {};
    const issued = [];
    for (const user of users) {
      const username = String(user.username || '').toLowerCase();
      if (!/^[a-z0-9][a-z0-9._-]{2,119}$/.test(username) || FORBIDDEN_KEYS.has(username) || state.creds[username]) throw new MasterPackageError('Invalid synthetic trial account.', 'trial_invalid_users');
      const password = generateStrongPassword();
      const {salt,digest} = hashPassword(password);
      const chief = user.roleId === 'chief';
      user.mustChange = !chief; user.mustChangePassword = !chief;
      state.creds[username] = {id:user.id,username,name:user.name,roleId:user.roleId,countyId:user.countyId || 'kisumu',
        areaIds:Array.isArray(user.areaIds) ? user.areaIds : [],departmentId:user.departmentId || '',email:'',salt,digest,
        mustChange:!chief,privacyProtected:true,sessionEpoch:crypto.randomBytes(16).toString('hex'),
        ...(chief ? {privateSetAt:nowISO()} : {temporary:temporaryMetadata(state,'trial-initializer')}),updatedAt:nowISO()};
      issued.push({username,name:user.name,roleId:user.roleId,countyId:user.countyId || 'kisumu',password,mustChange:!chief,
        expiresAt:chief ? null : new Date(state.creds[username].temporary.expiresAt).toISOString()});
    }
    state.setup = true; state.globallyActivated = false; state.devicePolicyInstalled = false;
    state.sessions = {}; state.devices = {}; state.rev = 1; state.deltas = [];
    appendServerAudit(state,'trial-initializer','trial.initialized','installation','synthetic-trial',`Isolated trial initialized with ${verified.counts.patients} synthetic patients and ${issued.length} synthetic accounts.`);
    await saveCloudState(state);
    return sendJson(res, 200, {ok:true,trialMode:true,counts:verified.counts,quality:verified.quality,issued});
  }

  /* Newly issued credentials cannot access a workspace or modify records until
     their holder replaces the temporary password. Public login and recovery
     remain available; the signed-in user can only change password or sign out. */
  const gateSession = extractRequestToken(req) ? getSession(state, req) : null;
  const gateCred = gateSession && state.creds && state.creds[gateSession.username];
  const allowedBeforePassword = new Set(['auth/login', 'auth/logout', 'auth/change-password', 'auth/unlock', 'session/beat', 'session/whoami']);
  /* Every newly issued temporary credential (including legacy provisioning
     and rebuild controls) is barred from staff data until privately replaced. */
  if (gateCred && (gateCred.temporary || gateCred.sessionEpoch) && gateCred.mustChange && !allowedBeforePassword.has(route)) {
    return sendJson(res, 403, { ok:false, code:'password_change_required', error:'Set a private password before opening the workspace.' });
  }

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
      version: '6.9.6',
      cloud: true,
      onlineDatabase: true,
      mode: TRIAL_MODE ? 'isolated-synthetic-trial' : 'online-site-db',
      ...(TRIAL_MODE ? {trialMode:true} : {}),
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
      landingTheme: systemConfig(state).entryTheme,
      consoleTheme: (state.db && state.db.settings && Number(state.db.settings.uiEpoch || 0) >= 690 && state.db.settings.consoleTheme) || 'foundation',
      accounts: Object.keys(state.creds || {}).length,
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
    if(devotionRules.OWNED.some(key=>body.db?.[key]!=null&&(!Array.isArray(body.db[key])||body.db[key].length)))
      return sendJson(res,400,{ok:false,code:'devotion_workflow_forbidden',error:'Setup cannot import staff workflow decisions or command receipts.'});
    const admin = body.admin || {};
    const username = String(admin.username || 'chief.admin').trim().toLowerCase();
    const pwErr = validatePrivacyPassword(admin.password, username);
    if (pwErr) return sendJson(res, 400, { ok: false, error: pwErr });

    const { salt, digest } = hashPassword(admin.password);
    state.org = body.org || state.org;
    state.db = sanitizeDbForClient(body.db || { meta: { schema: 6, version: '6.9.6' }, users: [], audit: [] });
    // Setup has no authenticated mailbox attestation yet. A client-supplied or
    // guessed address is not evidence that an official work mailbox exists.
    const chiefEmail = '';
    const chiefDisplayName = admin.name || 'Chief System Administrator';
    let chiefUserId = 'u-chief-admin';
    /* Only the authenticated activation endpoint may set this flag.  Ignore a
       client-supplied true value during public first-run setup as well. */
    if (state.db && typeof state.db === 'object') {
      state.db.settings = {
        ...(state.db.settings || {}),
        onboarding: { complete: true, step: 4 },
        hostSetupComplete: true,
        globallyActivated: false,
      };
      state.db.meta = { ...(state.db.meta || {}), globallyActivated: false, demoDisabled: false, productionMode: false };
      if (Array.isArray(state.db.users)) {
        const dbChief = state.db.users.find((u) => u && (String(u.username || '').toLowerCase() === username || u.roleId === 'chief'));
        if (dbChief) {
          chiefUserId = dbChief.id || 'u-chief-admin';
          dbChief.username = username;
          dbChief.email = chiefEmail;
          dbChief.name = chiefDisplayName;
          dbChief.mustChange = Boolean(admin.mustChange);
          dbChief.mustChangePassword = Boolean(admin.mustChange);
        }
      }
    }
    state.creds = {
      [username]: {
        id: chiefUserId,
        username,
        email: chiefEmail,
        name: chiefDisplayName,
        roleId: 'chief',
        countyId: (body.org && body.org.county) || 'kisumu',
        salt,
        digest,
        mustChange: Boolean(admin.mustChange),
        privacyProtected: true,
        ...(admin.mustChange ? {sessionEpoch:crypto.randomBytes(16).toString('hex'),temporary:temporaryMetadata(state,username)} : {privateSetAt:nowISO()}),
        updatedAt: nowISO(),
      },
    };
    state.sessions = {};
    state.revokedSessions = {};
    state.loginFailures = {};
    state.setup = true;
    state.globallyActivated = false;
    state.devices = {};
    state.devicePolicyInstalled = false;
    await admitLoginDevice(state, req, res, { deviceLabel:'Commissioning browser', deviceType:'computer' }, state.creds[username], { save:false });
    state.rev = (state.rev || 0) + 1;
    appendServerAudit(state, username, 'setup.commissioned', 'installation', 'online-cloud',
      `First-Run Production Setup completed by Chief System Administrator (@${username})`);
    await saveCloudState(state);
    return sendJson(res, 200, { ok: true, rev: state.rev, admin: username });
  }

  /* Chief-owned server consoles. No normal sync patch can approve a device,
     confirm a mailbox, alter security config or read a credential export. */
  if(route === 'admin/reference-master' && method === 'GET') {
    const sess=getSession(state,req);
    if(!sess || sess.roleId!=='chief') return sendJson(res,403,{ok:false,error:'Chief session required to generate a synthetic reference export.'});
    return sendJson(res,200,{ok:true,manifest:generateReferenceManifest()});
  }

  if (route === 'admin/system-config' && ['GET','POST'].includes(method)) {
    const sess = getSession(state, req);
    if (!sess || sess.roleId !== 'chief') return sendJson(res,403,{ok:false,error:'Chief System Administrator access required.'});
    if (method === 'GET') return sendJson(res,200,{ok:true,config:systemConfig(state)});
    const body = await readJsonBody(req);
    const prior = systemConfig(state), next = {...prior};
    if (Object.hasOwn(body,'entryTheme')) {
      if (!ENTRY_THEME_IDS.has(body.entryTheme)) return sendJson(res,400,{ok:false,error:'Choose an official LOMAMO entry theme.'});
      next.entryTheme = body.entryTheme;
    }
    if (Object.hasOwn(body,'temporaryPasswordDays')) {
      const days = Number(body.temporaryPasswordDays);
      if (!Number.isInteger(days) || days < 1 || days > 30) return sendJson(res,400,{ok:false,error:'Temporary passwords must expire in 1–30 days.'});
      next.temporaryPasswordDays = days;
    }
    state.db.settings = {...(state.db.settings || {}), system:{config:next}, landingTheme:next.entryTheme, landingThemeExplicit:true, uiEpoch:691};
    state.rev = (state.rev || 0) + 1;
    state.deltas = []; // configuration must be read as a fresh, authoritative snapshot
    appendServerAudit(state,sess.username,'system.config_changed','system.config','entry-and-credentials',
      `${JSON.stringify(prior)} -> ${JSON.stringify(next)}`,{deviceId:sess.deviceId});
    await saveCloudState(state);
    return sendJson(res,200,{ok:true,config:next,rev:state.rev});
  }

  if (route === 'admin/devices' && method === 'GET') {
    const sess = getSession(state, req);
    if (!sess || sess.roleId !== 'chief') return sendJson(res,403,{ok:false,error:'Only the Chief System Administrator may review devices.'});
    return sendJson(res,200,{ok:true,currentDeviceId:sess.deviceId,devices:Object.values(state.devices || {})});
  }
  if (route === 'admin/devices/decision' && method === 'POST') {
    const sess = getSession(state, req), body = await readJsonBody(req);
    if (!chiefReauthenticated(state,sess,body.password)) return sendJson(res,403,{ok:false,code:'reauth_failed',error:'Chief session and private password required.'});
    const deviceId = String(body.deviceId || '');
    const record = Object.hasOwn(state.devices || {},deviceId) ? state.devices[deviceId] : null;
    if (!record || !['approved','rejected','revoked'].includes(body.decision)) return sendJson(res,400,{ok:false,error:'Choose a registered device and approval decision.'});
    if (record.id === sess.deviceId && body.decision !== 'approved') return sendJson(res,409,{ok:false,error:'Approve and sign in on another browser before revoking this Chief device.'});
    record.status = body.decision;
    record.decidedBy = sess.username; record.decidedAt = nowISO();
    state.rev = (state.rev || 0) + 1;
    appendServerAudit(state,sess.username,`device.${body.decision}`,'device',record.id,`Device ${record.label} ${body.decision}.`,{deviceId:sess.deviceId,targetDeviceId:record.id});
    await saveCloudState(state);
    return sendJson(res,200,{ok:true,device:record,rev:state.rev});
  }

  if (route === 'admin/staff-accounts' && method === 'GET') {
    const sess = getSession(state,req);
    if (!sess || sess.roleId !== 'chief') return sendJson(res,403,{ok:false,error:'Chief System Administrator access required.'});
    return sendJson(res,200,{ok:true,domain:TRIAL_MODE ? 'lomamo.example' : OFFICIAL_EMAIL_DOMAIN,config:systemConfig(state),rows:staffExportRoster(sess, state).map(seat => ({
      ...credentialExportRow(state,seat), credentialStatus:state.creds[seat.username]?.revokedAt ? 'revoked' : state.creds[seat.username]?.privateSetAt ? 'private password set' : 'not yet issued / temporary'
    }))});
  }
  if (route === 'admin/staff-accounts/mailbox' && method === 'POST') {
    if (TRIAL_MODE) return sendJson(res,403,{ok:false,code:'trial_mailbox_disabled',error:'Real staff mailbox attestations are disabled in the synthetic trial.'});
    const sess = getSession(state,req), body = await readJsonBody(req);
    if (!chiefReauthenticated(state,sess,body.password)) return sendJson(res,403,{ok:false,code:'reauth_failed',error:'Chief session and private password required.'});
    const seat = staffExportRoster(sess, state).find(r => r.username === body.username && !r.unconfirmed);
    const email = String(body.email || '').trim().toLowerCase();
    if (!seat || (email && (!/^[a-z0-9._-]+@lomamofoundation\.org$/.test(email) || body.confirm !== 'MAILBOX CONFIRMED'))) {
      return sendJson(res,400,{ok:false,error:'Use a confirmed roster seat, an existing @lomamofoundation.org mailbox and the explicit MAILBOX CONFIRMED attestation. Leave email blank to withdraw confirmation.'});
    }
    const user = (state.db.users || []).find(u => u && u.username === seat.username);
    state.mailboxes = state.mailboxes || {};
    if (email && Object.entries(state.mailboxes).some(([username,a]) => username !== seat.username && a.email === email)) return sendJson(res,409,{ok:false,error:'This confirmed mailbox already belongs to another seat.'});
    if(email) state.mailboxes[seat.username]={email,confirmedBy:sess.username,confirmedAt:nowISO()};
    else delete state.mailboxes[seat.username];
    if(user){user.email = email; user.mailboxConfirmed = Boolean(email); user.mailboxConfirmedAt = nowISO(); user.mailboxConfirmedBy = sess.username;}
    if (state.creds[seat.username]) state.creds[seat.username].email = email;
    state.rev = (state.rev || 0) + 1;
    appendServerAudit(state,sess.username,'staff.mailbox_confirmed','user',seat.username,email ? 'Chief attested that the official mailbox exists.' : 'Mailbox confirmation withdrawn.',{deviceId:sess.deviceId});
    await saveCloudState(state);
    return sendJson(res,200,{ok:true,rev:state.rev});
  }
  if (route === 'admin/staff-accounts/export' && method === 'POST') {
    const sess = getSession(state,req), body = await readJsonBody(req);
    if (!chiefReauthenticated(state,sess,body.password)) return sendJson(res,403,{ok:false,code:'reauth_failed',error:'Chief session and private password required.'});
    if (body.confirm !== 'ISSUE TEMPORARY PASSWORDS') return sendJson(res,400,{ok:false,error:'Confirm ISSUE TEMPORARY PASSWORDS to generate the confidential staff export.'});
    const wanted = Array.isArray(body.usernames) ? new Set(body.usernames.map(String)) : null;
    if (wanted && (!wanted.size || [...wanted].some(u => !staffExportRoster(sess, state).some(r => r.username === u)))) return sendJson(res,400,{ok:false,error:'Export selections must come from the official roster.'});
    const rows = [], exportId = crypto.randomUUID(), issuedAt = nowISO();
    const expiresAt = Date.now() + systemConfig(state).temporaryPasswordDays * 86400000;
    state.db.users = Array.isArray(state.db.users) ? state.db.users : [];
    let issuedCount = 0;
    for (const seat of staffExportRoster(sess, state).filter(r => !wanted || wanted.has(r.username))) {
      const row = credentialExportRow(state,seat), previous = state.creds[seat.username];
      if (seat.unconfirmed) { row.credentialStatus = 'unconfirmed seat — no credential'; rows.push(row); continue; }
      if (seat.roleId === 'chief' || (previous && previous.privateSetAt && !previous.mustChange && !previous.revokedAt)) {
        row.credentialStatus = 'private password retained — not exported'; rows.push(row); continue;
      }
      const password = generateStrongPassword(), {salt,digest} = hashPassword(password);
      const id = previous?.id || `u-${seat.username.replace(/\./g,'-')}`;
      state.creds[seat.username] = {id,username:seat.username,name:seat.name,roleId:seat.roleId,countyId:seat.countyId,areaIds:seat.areas || [],departmentId:seat.dept,
        email:row.email,salt,digest,mustChange:true,active:true,issuedAt,issuedBy:sess.username,updatedAt:issuedAt,
        sessionEpoch:crypto.randomBytes(16).toString('hex'),temporary:{...temporaryMetadata(state,sess.username),exportId,expiresAt}};
      const index = state.db.users.findIndex(u => u && u.username === seat.username);
      const user = {...(index >= 0 ? state.db.users[index] : {}),id,username:seat.username,name:seat.name,roleId:seat.roleId,countyId:seat.countyId,areaIds:seat.areas || [],departmentId:seat.dept,jobTitle:seat.job,
        email:row.email,unconfirmed:false,status:'active',active:true,mustChange:true,mustChangePassword:true,demo:TRIAL_MODE,synthetic:TRIAL_MODE};
      delete user.hash; delete user.salt;
      if (index >= 0) state.db.users[index] = user; else state.db.users.push(user);
      rows.push({...row,temporaryPassword:password,expiresAt:new Date(expiresAt).toISOString(),credentialStatus:'single-use temporary — change before workspace'});
      issuedCount++;
    }
    /* Only ciphertext (AES-GCM under Chief reauthentication) and hashes enter
       KV. The cleartext response is a deliberate confidential download, once;
       no static file, log, public collection or recovery endpoint exposes it. */
    const sealed = sealCredentialPack(rows,body.password,sess.username);
    state.credentialExports = [...(state.credentialExports || []).slice(-9),{id:exportId,issuedAt,expiresAt,exportedAt:issuedAt,issuedBy:sess.username,deviceId:sess.deviceId,rowCount:rows.length,issuedCount,pack:{...sealed,expiresAt}}];
    state.rev = (state.rev || 0) + 1;
    state.deltas = [];
    appendServerAudit(state,sess.username,'staff.credentials_exported','credential-export',exportId,
      `Confidential roster export: ${rows.length} rows; ${issuedCount} temporary credentials; expires ${new Date(expiresAt).toISOString()}.`,{who:sess.username,when:issuedAt,rowCount:rows.length,issuedCount,deviceId:sess.deviceId});
    await saveCloudState(state);
    return sendJson(res,200,{ok:true,exportId,domain:TRIAL_MODE ? 'lomamo.example' : OFFICIAL_EMAIL_DOMAIN,issuedAt,expiresAt:new Date(expiresAt).toISOString(),rows,rev:state.rev});
  }
  if (route === 'admin/staff-accounts/export-log' && method === 'POST') {
    const sess = getSession(state,req), body = await readJsonBody(req);
    if (!sess || sess.roleId !== 'chief') return sendJson(res,403,{ok:false,error:'Chief System Administrator access required.'});
    const formats = new Set(['html','csv','sms-text','whatsapp-text','clipboard','directory-text']);
    const usernames = Array.isArray(body.usernames) ? [...new Set(body.usernames.map(String))] : [];
    const rosterNames = new Set(staffExportRoster(sess, state).map(seat => seat.username));
    if (!formats.has(body.format) || !usernames.length || usernames.length > 500 || usernames.some(username =>
      !rosterNames.has(username) || (body.format !== 'directory-text' && !Object.hasOwn(state.creds,username)))) {
      return sendJson(res,400,{ok:false,error:'Export only official roster seats; confidential packs require existing issued accounts.'});
    }
    state.rev = (state.rev || 0) + 1;
    appendServerAudit(state,sess.username,'staff.export_download_requested','credential-export',body.format,
      `Chief requested ${body.format} handoff for ${usernames.length} existing accounts.`,
      {who:sess.username,when:nowISO(),rowCount:usernames.length,deviceId:sess.deviceId,format:body.format});
    await saveCloudState(state);
    return sendJson(res,200,{ok:true,rev:state.rev});
  }
  if (route === 'admin/staff-accounts/revoke' && method === 'POST') {
    const sess = getSession(state,req), body = await readJsonBody(req);
    if (!chiefReauthenticated(state,sess,body.password)) return sendJson(res,403,{ok:false,code:'reauth_failed',error:'Chief session and private password required.'});
    const username = String(body.username || '');
    const cred = Object.hasOwn(state.creds || {},username) ? state.creds[username] : null;
    if (!cred || cred.roleId === 'chief') return sendJson(res,400,{ok:false,error:'Choose an issued staff account; Chief recovery is a separate procedure.'});
    cred.revokedAt = nowISO(); cred.sessionEpoch = crypto.randomBytes(16).toString('hex');
    delete cred.temporary;
    state.rev = (state.rev || 0) + 1;
    appendServerAudit(state,sess.username,'staff.password_revoked','user',cred.username,'Password and all existing sessions revoked. Re-issue from the roster console.',{deviceId:sess.deviceId});
    await saveCloudState(state);
    return sendJson(res,200,{ok:true,rev:state.rev});
  }

  /* 2b. Global System Activation (Chief System Administrator) */
  if (route === 'setup/activate-global' && method === 'POST') {
    const body = await readJsonBody(req);
    state = await ensureFreshStateMinRev(state, body.minRev);
    const sess = getSession(state, req);
    if (!sess || sess.roleId !== 'chief') {
      return sendJson(res, 403, { ok: false, error: 'Only the Chief System Administrator may activate CareLink globally.' });
    }
    if (state.rebuildRevision) return sendJson(res, 409, { ok:false, code:'rebuild_already_active', error:'This installation has been rebuilt. Use the Chief reactivation controls instead.' });
    const entryConfig = systemConfig(state);
    const entrySystem = {...(state.db?.settings?.system || {}), config:entryConfig};
    state.globallyActivated = true;
    state.db = state.db || {};
    /* Write the activation markers into every server-side location, even when
       an older client omits settings/meta.  Health checks and later requests
       therefore see the same permanent boundary. */
    state.db.settings = {
      ...(state.db.settings || {}),
      ...safeObject(body.settings),
      system: entrySystem,
      landingTheme: entryConfig.entryTheme,
      landingThemeExplicit: true,
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
      const target=(state.db.users||[]).find(u=>u && u.username===uname);
      if(acc.roleId==='chief' || target?.unconfirmed || officialStructure.roster.some(r=>r.username===uname && r.unconfirmed)) continue;
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
      const tempPassword = generateStrongPassword();
      const { salt, digest } = hashPassword(tempPassword);
      state.creds[uname] = {
        id: clipString(acc.id || `u-${uname.replace(/\./g, '-')}`, 160),
        username: uname,
        name: clipString(acc.name || uname, 240),
        roleId: clipString(acc.roleId || 'staff', 80),
        countyId: clipString(acc.countyId || 'kisumu', 80),
        areaIds: Array.isArray(acc.areaIds) ? acc.areaIds.map((id) => clipString(id, 80)).slice(0, 20) : [],
        departmentId: clipString(acc.departmentId || '', 80),
        email: rosterMailbox(state,{username:uname}),
        salt,
        digest,
        mustChange: true,
        sessionEpoch:crypto.randomBytes(16).toString('hex'),
        temporary:temporaryMetadata(state,sess.username),
        updatedAt: nowISO(),
      };
      const user = (state.db.users || []).find((u) => String(u.username || '').toLowerCase() === uname);
      if (user) {
        user.mustChange = true;
        user.mustChangePassword = true;
        user.demo = false;
        user.status = 'active';
        user.active = true;
        delete user.hash;
        delete user.salt;
        delete user.privacyPasswordSet;
        delete user.privacyPasswordAt;
      }
      issued.push({ username: uname, email:state.creds[uname].email, password: tempPassword, mustChange: true, expiresAt:new Date(state.creds[uname].temporary.expiresAt).toISOString() });
    }
    state.rev = (state.rev || 0) + 1;
    appendServerAudit(state, (sess && sess.username) || body.activatedBy || 'chief.admin', 'system.activated_globally', 'system', 'global-activation',
      `CareLink activated globally; ${issued.length} single-use credentials issued, ${preserved.length} private credentials preserved; only attested work mailboxes included; demo & setup screens permanently removed.`,{deviceId:sess.deviceId,who:sess.username,when:nowISO(),rowCount:issued.length});
    await saveCloudState(state);
    return sendJson(res, 200, { ok: true, globallyActivated: true, rev: state.rev, issued, preserved });
  }

  /* Anonymous demo provisioning is disabled: first-run is reserved for
     chief-admin commissioning, then role accounts are issued securely. */
  if (route === 'public/demo-bootstrap' && method === 'POST') {
    return sendJson(res, 403, { ok: false, code: 'demo_bootstrap_disabled',
      error: 'Anonymous demonstration bootstrap is disabled. Commission the system first, then issue authorized role accounts.' });
  }

  /* 4. Authentication & DPA First-Login Password Replacement */
  if (route === 'auth/login' && method === 'POST') {
    const body = await readJsonBody(req);
    const rawId = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    /* A username is the canonical handle; the issued email alias signs in the
       same account. An alias shared by two accounts must never sign anyone in. */
    const typedAlias = aliasKey(rawId);
    const emailMatches = Object.values(state.creds || {}).filter((c) => {
      const stored = String((c && c.email) || '').toLowerCase();
      if (!stored) return false;
      return stored === rawId || aliasKey(stored) === typedAlias;
    });
    let cred = Object.prototype.hasOwnProperty.call(state.creds || {}, rawId)
      ? state.creds[rawId]
      : (emailMatches.length === 1 ? emailMatches[0] : null);
    if (!cred && emailMatches.length > 1) {
      return sendJson(res, 409, {
        ok: false,
        code: 'ambiguous_email_alias',
        error: 'That email alias is used by more than one account. Sign in with your username instead.',
      });
    }
    /* Canonical Chief System Administrator alias: Step 2 historically pre-filled
       `chief.admin` while operators often sign in as `system.admin` (or vice versa).
       When there is a single `chief` credential provisioned under either canonical
       handle, resolve it seamlessly while still enforcing full PBKDF2 verification. */
    if (!cred && (rawId === 'system.admin' || rawId === 'chief.admin')) {
      const chiefs = Object.values(state.creds || {}).filter((c) => c && c.roleId === 'chief');
      if (chiefs.length === 1 && (chiefs[0].username === 'chief.admin' || chiefs[0].username === 'system.admin')) {
        cred = chiefs[0];
      }
    }
    const username = clipString(cred ? cred.username : rawId, 120);
    const lockMs = loginLockRemainingMs(state, username);
    if (lockMs > 0) {
      return sendJson(res, 429, {
        ok: false,
        code: 'locked',
        retryAfterSeconds: Math.ceil(lockMs / 1000),
        error: `Too many failed sign-in attempts. Try again in ${Math.ceil(lockMs / 60000)} minute(s)${!TRIAL_MODE && !isGloballyActivated(state) ? ' or click "Reset 4-Step Setup & Set Fresh Password" below' : ' or ask your County Administrator to re-issue a temporary password'}.`,
      });
    }
    if (!cred || !await verifyLoginPassword(password, cred.salt, cred.digest)) {
      if (state._headOnly && !state._shardedManifest) {
        ({ state, driver } = await loadCloudState({ readOnly: false }));
      }
      recordLoginFailure(state, username || 'anonymous');
      appendServerAudit(state, username || 'anonymous', 'auth.failed', 'user', username, 'Online credential check failed');
      await saveCloudAuthMetadata(state);
      const preActHint = !TRIAL_MODE && state.setup && !isGloballyActivated(state)
        ? 'Invalid username or password. Enter the Chief System Administrator password from Step 2 (both system.admin and chief.admin are accepted), or click "Reset 4-Step Setup & Set Fresh Password" below.'
        : 'Invalid username or password.';
      return sendJson(res, 401, { ok: false, code: 'invalid_credentials', error: preActHint });
    }
    if (cred.revokedAt || cred.active === false) return sendJson(res, 403, { ok:false, code:'account_revoked', error:'This account has been revoked. Ask the Chief System Administrator.' });
    const candidateUser = (state.db && state.db.users || []).find(u => u && String(u.username || '').toLowerCase() === username);
    if (candidateUser && (candidateUser.unconfirmed || candidateUser.active === false || ['inactive','unconfirmed','revoked'].includes(candidateUser.status))) {
      return sendJson(res, 403, { ok:false, code:'account_inactive', error:'This staff seat is not active.' });
    }
    const admission = await admitLoginDevice(state, req, res, body, cred, {save:false});
    if (!admission.ok) return sendJson(res, 403, admission);
    const sessionId = loginSessionId(username, body.loginAttemptId, admission.deviceId);
    if (cred.temporary && (Number(cred.temporary.expiresAt) <= Date.now() ||
        (cred.temporary.usedAt && (cred.temporary.sessionId !== sessionId || cred.temporary.deviceId !== sha256Hex(deviceProof(req)))))) {
      return sendJson(res, 403, { ok:false, code:'temporary_password_unavailable', error:'This temporary password has expired or has already been used. Ask the Chief System Administrator to re-issue it.' });
    }
    cred = state.creds[username];
    const hadPriorFailures = Boolean(
      state.loginFailures && (
        Object.prototype.hasOwnProperty.call(state.loginFailures, username) ||
        (rawId && Object.prototype.hasOwnProperty.call(state.loginFailures, rawId))
      ),
    );
    if (hadPriorFailures) {
      if (state._headOnly && !state._shardedManifest) {
        ({ state, driver } = await loadCloudState({ readOnly: false }));
        const current = state.creds && state.creds[username];
        if (!current || current.digest !== cred.digest || current.sessionEpoch !== cred.sessionEpoch) {
          return sendJson(res, 409, { ok:false, code:'state_conflict', error:'The account changed while signing in. Please retry.' });
        }
        cred = current;
      }
      if (state.loginFailures) {
        delete state.loginFailures[username];
        if (rawId) delete state.loginFailures[rawId];
      }
      pruneSessions(state);
      if (!state._shardedManifest) {
        appendServerAudit(state, cred.id || username, 'auth.login', 'user', cred.id || username,
          `Online sign-in verified after prior failure reset (${cred.mustChange ? 'first-login password change required' : 'personal password'})`);
      }
      await saveCloudAuthMetadata(state);
    }
    const token = mintSignedSessionToken(cred, username, sessionId, admission.deviceId);
    const dbUsers = (state.db && Array.isArray(state.db.users)) ? state.db.users : [];
    const dbMatch = dbUsers.find((u) => String(u.username).toLowerCase() === username)
      || (cred.roleId === 'chief' ? dbUsers.find((u) => u && u.roleId === 'chief') : null);
    const userRec = sanitizeDbForClient({
      users: [dbMatch
        ? { ...dbMatch, username: cred.username, mustChange: Boolean(cred.mustChange) }
        : {
            id: cred.id,
            username: cred.username,
            name: cred.name,
            roleId: cred.roleId,
            countyId: cred.countyId || 'kisumu',
            status: 'active',
            active: true,
            mustChange: Boolean(cred.mustChange),
          }],
    }).users[0];
    /* Include non-paged initial state directly in the login response when under
       512 KB total so post-setup Chief sign-in adopts Primary state in a single
       <150 ms round-trip; the individual session lease is acquired atomically before returning.
       Skip expensive JSON serialisation immediately when sharded head or large
       patient/visit collections already prove the state exceeds 512 KB. */
    let inlineState = null;
    const obviouslyLarge = Boolean(
      state._headOnly ||
      state._hasLargeCollections ||
      (state.db && Array.isArray(state.db.patients) && state.db.patients.length > 400) ||
      (state.db && Array.isArray(state.db.visits) && state.db.visits.length > 800) ||
      (state.db && Array.isArray(state.db.pdcas) && state.db.pdcas.length > 800)
    );
    if (!obviouslyLarge && !((cred.temporary || cred.sessionEpoch) && cred.mustChange)) {
      const loginScope = { username, userId: cred.id, roleId: cred.roleId, countyId: cred.countyId || userRec.countyId || 'kisumu' };
      const cleanClientDb = scopedDbForSession(state.db || {}, state, loginScope);
      if (state.setup && cleanClientDb && typeof cleanClientDb === 'object') {
        cleanClientDb.settings = {
          ...(cleanClientDb.settings || {}),
          onboarding: { complete: true, step: 4 },
        };
      }
      const split = splitLargeStateCollections(cleanClientDb);
      if (split.pagedCollections.length === 0) {
        const dbBytes = Buffer.byteLength(JSON.stringify(split.db || {}));
        if (dbBytes <= 512 * 1024) {
          inlineState = { db: split.db, rev: state.rev || 0, saved: state.saved, pagedCollections: [] };
        }
      }
    }
    let sessionReserved = false;
    try { sessionReserved = await reserveLoginSession(username, sessionId, cred.sessionEpoch); }
    catch (err) {
      if (err && err.code === 'kv_quota_exceeded') throw err;
      return sendJson(res, 503, { ok: false, code: 'session_store_unavailable', error: 'Online session security could not be verified. Please try again.' });
    }
    if (!sessionReserved) return sendJson(res, 409, {
      ok: false, code: 'session_conflict', error: 'This account is already signed in on another client. Sign out there first, then sign in here. If that client is unavailable, wait for its idle session to expire or contact your administrator.',
    });
    const loginDevice = state.devices[admission.deviceId];
    if (loginDevice) {
      loginDevice.lastSeen = nowISO();
      if(['computer','tablet','phone','other'].includes(body.deviceType)) loginDevice.type=body.deviceType;
      if(body.deviceLabel) loginDevice.label=clipString(body.deviceLabel,100);
      loginDevice.users = [...new Set([...(loginDevice.users || []), username])].slice(-100);
      loginDevice.logins = [...(loginDevice.logins || []), {at:nowISO(), username,
        type:loginDevice.type, label:clipString(body.deviceLabel || loginDevice.label,100),
        browser:clipString(req.headers['user-agent'] || 'Unknown browser',160)}].slice(-50);
    }
    appendServerAudit(state, cred.id || username, 'auth.client_login', 'user', cred.id || username,
      'Successful single-instance sign-in.', {deviceId:admission.deviceId, clientType:loginDevice?.type || 'other'});
    if (cred.temporary && !cred.temporary.usedAt) {
      cred.temporary.usedAt = nowISO();
      cred.temporary.sessionId = sessionId;
      cred.temporary.deviceId = admission.deviceId;
      appendServerAudit(state, cred.id || username, 'credentials.temporary_consumed', 'user', username,
        'Single-use temporary password redeemed; workspace locked until private-password replacement.', { deviceId:admission.deviceId });
    }
    try { await saveCloudAuthMetadata(state); }
    catch (error) { await releaseSessionLease(username, sessionId, cred.sessionEpoch).catch(()=>{}); throw error; }
    return sendJson(res, 200, {
      ok: true,
      token,
      rev: state.rev || 0,
      saved: state.saved,
      user: userRec,
      username,
      mustChange: Boolean(cred.mustChange),
      passwordBeforeWorkspace: Boolean((cred.temporary || cred.sessionEpoch) && cred.mustChange),
      idleSeconds: IDLE_SECONDS,
      ...(inlineState ? { inlineState } : {}),
    });
  }

  if(route==='coordination/presence'&&method==='POST'){
    const sess=getSession(state,req);
    if(!sess)return sendJson(res,401,{ok:false,error:'Sign in online to continue.'});
    if(state._headOnly)({state,driver}=await loadCloudState({readOnly:false}));
    const board=BOARD_ROLES.has(sess.roleId);
    if(!board&&!executiveMember(state.db,sess,officialStructure.exec))return sendJson(res,403,{ok:false,error:'This workspace is not assigned to your account.'});
    const sid=await ensureSessionLease(sess);
    if(!sid)return sendJson(res,401,{ok:false,error:'This online session has ended.'});
    const presenceKey=name=>'carelink_presence_'+crypto.createHash('sha256').update(CLOUD_KEY+':'+name).digest('hex');
    const at=nowISO();
    await runKvCommand(['SET',presenceKey(sess.username),JSON.stringify({at,sid,epoch:sess.sessionEpoch||''}),'EX','90']);
    const members=(state.db.users||[]).filter(u=>u.status==='active'&&u.active!==false&&(board?BOARD_ROLES.has(u.roleId):executiveMember(state.db,{username:u.username,roleId:u.roleId},officialStructure.exec)));
    const presence={};
    await Promise.all(members.map(async user=>{
      const raw=await runKvCommand(['GET',presenceKey(user.username)]);if(!raw)return;
      let item;try{item=JSON.parse(raw);}catch{return;}
      if((await runKvCommand(['GET',sessionLeaseKey(user.username,item.epoch)]))===item.sid)presence[user.id]={at:item.at,state:'online'};
    }));
    return sendJson(res,200,{ok:true,presence});
  }

  if(route==='coordination/command'&&method==='POST'){
    const sess=getSession(state,req);
    if(!sess)return sendJson(res,401,{ok:false,error:'Sign in online to continue.'});
    if(state._headOnly)({state,driver}=await loadCloudState({readOnly:false}));
    const body=await readJsonBody(req),kind=String(body.kind||'');
    const text=clipString(body.text||'',5000).trim();
    const commandId=clipString(body.commandId||'',120);
    if(!/^[A-Za-z0-9_-]{8,120}$/.test(commandId))return sendJson(res,400,{ok:false,error:'A unique request identifier is required.'});
    let entity;
    if(kind.startsWith('exec.')){
      if(!executiveMember(state.db,sess,officialStructure.exec))return sendJson(res,403,{ok:false,error:'Executive committee membership is required.'});
      state.db.execIssues=state.db.execIssues||[];
      if(kind==='exec.issue'){
        const old=state.db.execIssues.find(x=>x.id===commandId);
        if(old)return sendJson(res,200,{ok:true,id:old.id});
        const title=clipString(body.title||'',160).trim();
        if(!title||!text)return sendJson(res,400,{ok:false,error:'Title and issue details are required.'});
        entity={id:commandId,title,by:sess.userId,at:nowISO(),status:'open',discussion:[{id:commandId,by:sess.userId,at:nowISO(),text}]};
        state.db.execIssues.push(entity);
      }else{
        entity=state.db.execIssues.find(x=>x.id===String(body.id));
        if(!entity)return sendJson(res,404,{ok:false,error:'Committee issue not found.'});
        if(kind==='exec.reply'){
          if(entity.status==='resolved')return sendJson(res,409,{ok:false,error:'This issue is resolved. Raise a follow-up issue.'});
          if(!text)return sendJson(res,400,{ok:false,error:'Enter a contribution.'});
          if((entity.discussion||[]).some(x=>x.id===commandId))return sendJson(res,200,{ok:true,id:entity.id});
          entity.discussion.push({id:commandId,by:sess.userId,at:nowISO(),text});
        }else if(kind==='exec.resolve'){
          if(!['director','chief','program.admin'].includes(sess.roleId))return sendJson(res,403,{ok:false,error:'The Director or authorised committee administrator records resolutions.'});
          if(!text)return sendJson(res,400,{ok:false,error:'Record the resolution.'});
          if(entity.resolution?.commandId===commandId)return sendJson(res,200,{ok:true,id:entity.id});
          if(entity.status==='resolved')return sendJson(res,409,{ok:false,error:'This resolution is already recorded.'});
          entity.status='resolved';entity.resolution={commandId,text,by:sess.userId,at:nowISO()};
        }else return sendJson(res,400,{ok:false,error:'Unknown committee action.'});
      }
    }else if(kind==='referral.report'){
      entity=(state.db.cccReferrals||[]).find(x=>x.id===String(body.id));
      if(!canSubmitMasterReport(entity,sess,state.db))return sendJson(res,403,{ok:false,error:'This referral is outside your report-submission scope.'});
      if(!text)return sendJson(res,400,{ok:false,error:'A progress report is required.'});
      entity.masterReports=entity.masterReports||[];
      if(entity.masterReports.some(x=>x.id===commandId))return sendJson(res,200,{ok:true,id:entity.id});
      entity.masterReports.push({id:commandId,at:nowISO(),by:sess.userId,text,recipient:entity.referredByUsername,facilityName:entity.facilityName});
      entity.masterReportSummary=text;
    }else return sendJson(res,400,{ok:false,error:'Unknown coordination action.'});
    state.rev=(state.rev||0)+1;
    appendServerAudit(state,sess.userId,kind,'coordination',entity.id,'Authorised coordination record saved.');
    await saveCloudState(state);
    return sendJson(res,200,{ok:true,id:entity.id,rev:state.rev});
  }

  if (route === 'auth/logout' && method === 'POST') {
    const token = extractRequestToken(req);
    let sess = getSession(state, req);
    // A prior request may have saved revocation but lost connectivity before
    // releasing the lease. Only that signed, cookie-bound owner may retry it.
    if (!sess) {
      const signed = verifySignedSessionToken(token);
      const cred = signed && state.creds && state.creds[signed.u];
      if (signed && signed.sid && cred && signed.e === cred.sessionEpoch &&
          approvedSessionDevice(state, req, signed.d) && state.revokedSessions &&
          Object.hasOwn(state.revokedSessions, `sid:${signed.sid}`)) {
        try { await releaseSessionLease(signed.u, signed.sid, signed.e); }
        catch { return sendJson(res,503,{ok:false,code:'logout_release_pending',error:'Sign-out is recorded but the online session could not be released. Retry while connected.'}); }
      }
      return sendJson(res,200,{ok:true});
    }
    if (state._headOnly && !state._shardedManifest) {
      ({ state, driver } = await loadCloudState({ readOnly: false }));
    }
    if (state.sessions) delete state.sessions[sess.token];
    state.revokedSessions = state.revokedSessions || {};
    pruneSessions(state);
    state.revokedSessions[sess.token] = Date.now();
    if (sess.sessionId) state.revokedSessions[`sid:${sess.sessionId}`] = Date.now();
    if (!state._shardedManifest) {
      appendServerAudit(state, sess.userId || sess.username, 'auth.logout', 'user', sess.userId || sess.username, 'Signed out from online database');
    }
    // Never free an account for a second client before the former token is
    // durably revoked. A failed release is retryable through the branch above.
    await saveCloudAuthMetadata(state);
    try { await releaseSessionLease(sess.username, sess.sessionId || crypto.createHash('sha256').update(sess.token).digest('base64url'), sess.sessionEpoch); }
    catch { return sendJson(res,503,{ok:false,code:'logout_release_pending',error:'Sign-out is recorded but the online session could not be released. Retry while connected before signing in on another client.'}); }
    return sendJson(res, 200, { ok: true });
  }

  if (route === 'auth/unlock' && method === 'POST') {
    const sess = getSession(state, req);
    if (!sess) return sendJson(res, 401, { ok: false, error: 'This session has expired. Sign in again.' });
    let sessionId;
    try { sessionId = await ensureSessionLease(sess); }
    catch (err) {
      if (err && err.code === 'kv_quota_exceeded') throw err;
      return sendJson(res, 503, { ok: false, error: 'Online session security could not be verified.' });
    }
    if (!sessionId) return sendJson(res, 401, { ok: false, error: 'This session has expired. Please sign in again.' });
    const body = await readJsonBody(req);
    const cred = (state.creds || {})[sess.username];
    if (!cred || !verifyPassword(String(body.password || ''), cred.salt, cred.digest)) {
      return sendJson(res, 401, { ok: false, error: 'Incorrect password.' });
    }
    return sendJson(res, 200, { ok: true });
  }

  if (route === 'session/beat' && method === 'POST') {
    const sess = getSession(state, req);
    if (!sess) return sendJson(res, 401, { ok: false, error: 'Session expired' });
    let sessionId;
    try { sessionId = await ensureSessionLease(sess); }
    catch (err) {
      if (err && err.code === 'kv_quota_exceeded') throw err;
      return sendJson(res, 503, { ok: false, error: 'Online session security could not be verified.' });
    }
    if (!sessionId) return sendJson(res, 401, { ok: false, error: 'This session has expired. Please sign in again.' });
    /* Stateless HMAC tokens slide their idle window by returning a refreshed
       signed token without rewriting the multi-megabyte database every 10s. */
    if (state.sessions && Object.prototype.hasOwnProperty.call(state.sessions, sess.token)) {
      if (state._headOnly) {
        ({ state, driver } = await loadCloudState({ readOnly: false }));
      }
      if (state.sessions && state.sessions[sess.token]) {
        state.sessions[sess.token].lastSeen = nowISO();
        await saveCloudState(state);
      }
      return sendJson(res, 200, { ok: true, expiresIn: IDLE_SECONDS });
    }
    const cred = (state.creds && state.creds[sess.username]) || {
      id: sess.userId,
      username: sess.username,
      roleId: sess.roleId,
      countyId: sess.countyId || 'kisumu',
    };
    const refreshedToken = mintSignedSessionToken(cred, sess.username, sessionId, sess.deviceId);
    return sendJson(res, 200, { ok: true, expiresIn: IDLE_SECONDS, token: refreshedToken });
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
    delete cred.temporary;
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

  /* Chief-authorised post-activation rebuild; the structure is compiled into
     the server, never accepted from a browser. */
  if (route === 'admin/reactivate' && method === 'POST') {
    const sess = getSession(state, req);
    const body = await readJsonBody(req);
    if (!sess || sess.roleId !== 'chief') return sendJson(res, 403, { ok:false, error:'Only the Chief System Administrator may rebuild the hierarchy.' });
    if (!isGloballyActivated(state)) return sendJson(res, 409, { ok:false, error:'Complete initial commissioning before rebuilding this installation.' });
    if (body.confirm !== 'REBUILD') return sendJson(res, 400, { ok:false, error:'Type REBUILD to confirm the account reset.' });
    if (!chiefReauthenticated(state, sess, body.password)) return sendJson(res, 403, { ok:false, code:'reauth_failed', error:'Chief password verification failed.' });
    if (state.reactivationPack && Number(state.reactivationPack.expiresAt) > Date.now()) {
      return sendJson(res, 409, { ok:false, code:'reactivation_pack_pending', error:'A recent rebuild already issued a pack. Recover it rather than resetting the accounts again; a new rebuild is available after the 24-hour recovery window.' });
    }
    const rows = rebuildOfficialAccounts(state, sess);
    state.reactivationPack = sealCredentialPack(rows, body.password, sess.username);
    await saveCloudState(state);
    return sendJson(res, 200, { ok:true, rev:state.rev, issued:rows, expiresAt:state.reactivationPack.expiresAt });
  }

  if (route === 'admin/reactivation-pack' && method === 'POST') {
    const sess = getSession(state, req);
    const body = await readJsonBody(req);
    if (!sess || sess.roleId !== 'chief' || !chiefReauthenticated(state, sess, body.password)) {
      return sendJson(res, 403, { ok:false, code:'reauth_failed', error:'Chief session and password are required.' });
    }
    const rows = openCredentialPack(state.reactivationPack, body.password, sess.username);
    if (!rows) return sendJson(res, 404, { ok:false, code:'pack_unavailable', error:'No recoverable pack is available, or the 24-hour recovery window has expired.' });
    /* Recovery excludes redeemed/expired/revoked temporaries and any account
       whose holder has since chosen a private password. */
    const usable = rows.filter(row => {
      const cred = state.creds[row.username];
      if (!cred || cred.revokedAt || !cred.temporary || cred.temporary.usedAt || Number(cred.temporary.expiresAt)<=Date.now()) return false;
      const issued = cred.issuedAt || state.saved || new Date().toISOString();
      const changedAfterIssue = Boolean(cred.privateSetAt && new Date(cred.privateSetAt).getTime() > new Date(issued).getTime());
      return !changedAfterIssue && verifyPassword(row.tempPassword, cred.salt, cred.digest);
    });
    appendServerAudit(state, sess.userId || sess.username, 'credentials.reactivation_pack_recovered', 'credentials', 'official-hierarchy',
      `Chief recovered ${usable.length} still-valid temporary credentials.`,{deviceId:sess.deviceId,who:sess.username,when:nowISO(),rowCount:usable.length});
    await saveCloudState(state);
    return sendJson(res, 200, { ok:true, rev:state.rev, issued:usable, expiresAt:state.reactivationPack.expiresAt });
  }

  /* 5. Provision Unique Strong SMS Credential Pack (Chief System Admin or Account Admin) */
  if (route === 'credentials/provision' && method === 'POST') {
    const sess = getSession(state, req);
    if (!sess || (sess.roleId !== 'chief' && !ACCOUNT_ADMIN_ROLES.has(sess.roleId))) {
      return sendJson(res, 403, { ok: false, error: 'Only an authorised account administrator may provision user credentials.' });
    }
    const body = await readJsonBody(req);
    const accounts = Array.isArray(body.accounts)
      ? body.accounts
      : (body && body.username ? [body] : []);
    if (Array.isArray(body.accounts) && sess.roleId !== 'chief') {
      return sendJson(res, 403, { ok: false, error: 'Only the Chief System Administrator may provision bulk user credential packs.' });
    }
    const issued = [];
    const origin = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host || 'care-link-dims-dev-three.vercel.app'}`;
    for (const acc of accounts) {
      const uname = clipString(acc && acc.username, 120).trim().toLowerCase();
      if (!uname || uname === sess.username || FORBIDDEN_KEYS.has(uname)) continue;
      /* Never silently demote or replace another Chief System Administrator through provisioning. */
      if (state.creds[uname] && state.creds[uname].roleId === 'chief') continue;
      if (acc.roleId === 'chief' && sess.roleId !== 'chief') continue;
      const currentUser=(state.db.users||[]).find(u=>u && u.username===uname);
      if(currentUser?.unconfirmed || (TRIAL_MODE ? (!currentUser || currentUser.synthetic !== true || currentUser.demo !== true) : officialStructure.roster.some(r=>r.username===uname && r.unconfirmed))) continue;
      if(sess.roleId!=='chief' && (!currentUser || currentUser.roleId==='chief' ||
        (sess.roleId==='countyadmin' && currentUser.countyId!==sess.countyId))) continue;
      if(sess.roleId!=='chief' && ((acc.roleId && acc.roleId!==currentUser.roleId) || (acc.countyId && acc.countyId!==currentUser.countyId))) continue;
      const tempPassword = generateStrongPassword();
      const { salt, digest } = hashPassword(tempPassword);
      const mustChangeFlag = true;
      state.creds[uname] = {
        id: acc.id || `u-${uname.replace(/\./g, '-')}`,
        username: uname,
        email: rosterMailbox(state,{username:uname}),
        name: acc.name || uname,
        roleId: acc.roleId || 'staff',
        countyId: acc.countyId || 'kisumu',
        areaIds: Array.isArray(acc.areaIds) ? acc.areaIds.map((id) => clipString(id, 80)).slice(0, 20) : [],
        departmentId: clipString(acc.departmentId || '', 80),
        sessionEpoch: crypto.randomBytes(16).toString('hex'),
        salt,
        digest,
        mustChange: mustChangeFlag,
        temporary:temporaryMetadata(state,sess.username),
        updatedAt: nowISO(),
      };
      if (state.db && Array.isArray(state.db.users)) {
        const u = state.db.users.find((x) => String(x.username).toLowerCase() === uname);
        if (u) {
          u.mustChange = mustChangeFlag;
          u.demo = TRIAL_MODE;
          u.status = 'active';
          u.active = true;
          if (Array.isArray(acc.areaIds)) u.areaIds = acc.areaIds.map((id) => clipString(id, 80)).slice(0, 20);
          if (acc.roleId) u.roleId = clipString(acc.roleId, 80);
          if (acc.countyId) u.countyId = clipString(acc.countyId, 80);
          delete u.hash;
          delete u.salt;
        }
      }
      const smsText = `CareLink C-DIMS (${state.org?.shortName || 'LOMAMO'}): Hello ${acc.name || uname}, your ${acc.role || acc.roleName || 'Console'} account is ready at ${origin} | Username: ${uname} | Temp Password: ${tempPassword} | You must set your private password on first login.`;
      issued.push({
        id: state.creds[uname].id,
        name: acc.name || uname,
        username: uname,
        email: state.creds[uname].email,
        roleId: state.creds[uname].roleId,
        departmentId: state.creds[uname].departmentId,
        countyId: state.creds[uname].countyId,
        phone: acc.phone || '',
        role: acc.role || acc.roleName || acc.roleId || '-',
        county: acc.county || '',
        password: tempPassword,
        mustChange: true,
        expiresAt: new Date(state.creds[uname].temporary.expiresAt).toISOString(),
        smsText,
      });
    }
    state.rev = (state.rev || 0) + 1;
    appendServerAudit(state, sess.userId || sess.username, 'credentials.sms_pack_provisioned', 'credentials', 'bulk-sms-pack',
      `Generated unique strong temporary passwords for ${issued.length} accounts (mandatory first-login change enforced)`,{deviceId:sess.deviceId,who:sess.username,when:nowISO(),rowCount:issued.length});
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
    cred.temporary = temporaryMetadata(state,sess.username);
    delete cred.revokedAt;
    delete cred.privateSetAt;
    cred.sessionEpoch = crypto.randomBytes(16).toString('hex');
    cred.updatedAt = nowISO();
    if (state.db && Array.isArray(state.db.users)) {
      const u = state.db.users.find((x) => String(x.username).toLowerCase() === uname);
      if (u) u.mustChange = true;
    }
    state.rev = (state.rev || 0) + 1;
    appendServerAudit(state, sess.userId || sess.username, 'credentials.temp_reissued', 'user', uname,
      `Temporary SMS reset password issued for @${uname}; mandatory first-login privacy reset armed`,{deviceId:sess.deviceId,rowCount:1});
    await saveCloudState(state);
    return sendJson(res, 200, { ok: true, username: uname, password: tempPassword, mustChange: true, expiresAt:new Date(cred.temporary.expiresAt).toISOString() });
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
    if(retainsClinicalHistory(state.db))return sendJson(res,409,{ok:false,code:'clinical_history_retained',error:'Synthetic reference import cannot replace real patient records or retained clinical workflow history.'});
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
    if(retainsClinicalHistory(state.db))return sendJson(res,409,{ok:false,code:'clinical_history_retained',error:'Synthetic reference import cannot replace real patient records or retained clinical workflow history.'});
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
      total: verified.counts.patients, created: verified.counts.patients, skipped: 0, review: 0,
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
      `Full synthetic reference master imported: ${verified.counts.patients.toLocaleString('en-GB')} patients; all ${verified.quality.checks.length} completeness groups passed; accounts/settings preserved.`);
    job.status = 'completed';
    job.completedAt = nowISO();
    job.updatedAt = nowISO();
    job.counts = verified.counts;
    job.quality = verified.quality;
    await saveCloudState(state);
    for (let i = 0; i < job.chunkCount; i++) await deleteKvKey(masterChunkKey(job.id, i));
    return sendJson(res, 200, { ok: true, rev: state.rev, saved: state.saved, counts: verified.counts, quality: verified.quality, importId });
  }

  /* 5d. Zero-local-drive automatic cloud feed of the bundled reference-master
     100%-complete synthetic reference master (Chief Admin, pre-activation). */
  if (route === 'master-import/auto-seed' && method === 'POST') {
    const body = await readJsonBody(req);
    state = await ensureFreshStateMinRev(state, body.minRev);
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
    if(retainsClinicalHistory(live))return sendJson(res,409,{ok:false,code:'clinical_history_retained',error:'Synthetic reference import cannot replace real patient records or retained clinical workflow history.'});
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
      total: verified.counts.patients, created: verified.counts.patients, skipped: 0, review: 0,
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
      `Cloud built-in 100%-complete synthetic reference master auto-fed into KV: ${verified.counts.patients.toLocaleString('en-GB')} patients, ${verified.counts.visits} visits, ${verified.counts.pdcas} PDCAs; accounts/settings preserved.`);
    await saveCloudState(state);
    return sendJson(res, 200, { ok: true, rev: state.rev, saved: state.saved, counts: verified.counts, quality: verified.quality, importId });
  }

  /* 6. Shared Online Database State & Field-Level Patch Merge */
  if (route === 'state/collection' && method === 'GET') {
    const sess = getSession(state, req);
    if (!sess) return sendJson(res, 401, { ok: false, error: 'Sign in required to read the online database.' });
    const name = String(urlObj.searchParams.get('name') || '');
    const scopedDb = scopedDbForSession(state.db || {}, state, sess);
    const source = Array.isArray(scopedDb[name]) ? scopedDb[name] : null;
    if (!SAFE_COLLECTION.test(name) || !source) return sendJson(res, 404, { ok: false, error: 'The requested online collection does not exist.' });
    const offset = Number(urlObj.searchParams.get('offset') || '0');
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > source.length) return sendJson(res, 400, { ok: false, error: 'The collection-page offset is invalid.' });
    const rawLimit = Number(urlObj.searchParams.get('limit') || '0');
    const maxRecords = Number.isSafeInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 10000) : Infinity;
    const records = [];
    let bytes = 0;
    let nextOffset = offset;
    while (nextOffset < source.length && records.length < maxRecords) {
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
    let sess = getSession(state, req);
    if (!sess) return sendJson(res, 401, { ok: false, error: 'Sign in required to read the online database.' });
    const since = Number(urlObj.searchParams.get('since') || '0');
    if (since > 0 && since < (state.rev || 0) && state._headOnly) {
      state = (await loadCloudState({ readOnly: true })).state;
      sess = getSession(state, req);
      if (!sess) return sendJson(res, 401, { ok:false, error:'Session changed while loading the online database. Sign in again.' });
    }
    if (since > 0 && since >= (state.rev || 0)) {
      return sendJson(res, 200, {
        ok: true,
        unchanged: true,
        rev: state.rev || 0,
        saved: state.saved,
      });
    }
    if (since > 0 && since < (state.rev || 0)) {
      if (state._headOnly && state._headDeltasTruncated) {
        const currentDeltas = (state.deltas || []).filter((d) => d.rev > since).sort((a, b) => a.rev - b.rev);
        if (!(currentDeltas.length > 0 && currentDeltas[0].rev <= since + 1)) {
          state = (await loadCloudState({ readOnly: true })).state;
      sess = getSession(state, req);
      if (!sess) return sendJson(res, 401, { ok:false, error:'Session changed while loading the online database. Sign in again.' });
        }
      }
      const deltas = (state.deltas || []).filter((d) => d.rev > since).sort((a, b) => a.rev - b.rev);
      if (deltas.length > 0 && deltas[0].rev <= since + 1) {
        return sendJson(res, 200, {
          ok: true,
          rev: state.rev,
          saved: state.saved,
          patches: scopedPatchesForSession(deltas.flatMap((d) => d.patches || []), state, sess),
        });
      }
      if (urlObj.searchParams.get('deltaOnly') === '1') {
        return sendJson(res, 200, {
          ok: true,
          deltaMiss: true,
          rev: state.rev || 0,
          saved: state.saved,
        });
      }
      if (state._headOnly) {
        state = (await loadCloudState({ readOnly: true })).state;
      sess = getSession(state, req);
      if (!sess) return sendJson(res, 401, { ok:false, error:'Session changed while loading the online database. Sign in again.' });
      }
    }
    if (urlObj.searchParams.get('fast') === '1') {
      const targetRev = Number(urlObj.searchParams.get('targetRev') || '0');
      if (targetRev && state.rebuildRevision && targetRev < state.rebuildRevision) return sendJson(res, 409, { ok:false, code:'rebuild_refresh_required', error:'The requested snapshot predates the hierarchy rebuild.' });
      const partParam = urlObj.searchParams.get('part');
      const pack = getClientFastPack(state, targetRev, sess);
      if (partParam !== null) {
        const partIdx = Number(partParam);
        if (!Number.isSafeInteger(partIdx) || partIdx < 0 || partIdx >= pack.parts.length) {
          return sendJson(res, 400, { ok: false, error: 'Invalid fast-pack part index.' });
        }
        return sendJson(res, 200, {
          ok: true,
          fastPack: true,
          rev: pack.rev,
          saved: pack.saved,
          part: partIdx,
          totalParts: pack.parts.length,
          data: pack.parts[partIdx],
        });
      }
      return sendJson(res, 200, {
        ok: true,
        fastPack: true,
        rev: pack.rev,
        saved: pack.saved,
        totalParts: pack.parts.length,
        part0: pack.parts[0],
      });
    }
    const split = splitLargeStateCollections(scopedDbForSession(state.db || {}, state, sess));
    return sendJson(res, 200, {
      ok: true,
      rev: state.rev || 0,
      saved: state.saved,
      db: split.db,
      ...(split.pagedCollections.length ? { pagedCollections: split.pagedCollections, pageMaxBytes: STATE_PAGE_MAX_BYTES } : {}),
    });
  }

  if(route==='devotions/command'&&method==='POST'){
    const sess=getSession(state,req);
    if(!sess)return sendJson(res,401,{ok:false,code:'sign_in_required',error:'Sign in online to continue.'});
    const body=await readJsonBody(req),command=clipString(body.command||'',80),payload=safeObject(body.payload);
    const requestId=clipString(body.requestId||'',100),scope=principalScope(state,sess),user={...scope,id:scope.userId};
    if(!/^[A-Za-z0-9_-]{12,100}$/.test(requestId))return sendJson(res,400,{ok:false,code:'request_id_required',error:'A unique request identifier is required.'});
    const digest=sha256Hex(JSON.stringify(payload)),receipt=(state.db.devotionCommandReceipts||[]).find(r=>r.id===requestId);
    if(receipt){
      if(receipt.actor!==scope.userId||receipt.command!==command||receipt.digest!==digest)return sendJson(res,409,{ok:false,code:'request_id_conflict',error:'This command identifier has already been used.'});
      if(!devotionRules.inCounty(user,receipt.countyId))return sendJson(res,403,{ok:false,code:'devotion_scope_denied',error:'This county is no longer in your scope.'});
      return sendJson(res,200,{ok:true,duplicate:true,refreshRequired:true,rev:state.rev,saved:state.saved,patches:[]});
    }
    const result=devotionRules.run(state.db,user,command,payload,{now:nowISO(),id:prefix=>prefix+'-'+crypto.randomUUID(),randomInt:upper=>crypto.randomInt(upper)});
    if(!result.ok)return sendJson(res,result.status||400,{ok:false,code:result.code,error:result.msg});
    devotionRules.apply(state.db,result.patches);
    (state.db.devotionCommandReceipts=state.db.devotionCommandReceipts||[]).push({id:requestId,actor:scope.userId,command,digest,countyId:result.rec.countyId,at:nowISO()});
    state.rev=(state.rev||0)+1;state.deltas=state.deltas||[];
    state.deltas.push({rev:state.rev,at:nowISO(),actor:scope.username,patches:result.patches});
    if(state.deltas.length>60)state.deltas.splice(0,state.deltas.length-60);
    appendServerAudit(state,scope.userId,result.event,'devotion',result.rec.id,'Staff devotion action; notes excluded from audit.');
    await saveCloudState(state);
    return sendJson(res,200,{ok:true,rec:result.rec,rev:state.rev,saved:state.saved,patches:scopedPatchesForSession(result.patches,state,sess)});
  }

  /* Every enrollment / cycle / PDCA decision is validated against the current
     primary record and atomically committed. Client role, `before`, author,
     workflow status, timestamps and claimed approval are NEVER trusted. */
  if (route === 'care/command' && method === 'POST') {
    const sess=getSession(state,req);
    if(!sess)return sendJson(res,401,{ok:false,code:'sign_in_required',error:'Sign in required.'});
    const body=await readJsonBody(req), command=clipString(body.command||'',80);
    const payload=safeObject(body.payload), scope=principalScope(state,sess);
    const requestId=clipString(body.requestId||'',100);
    if(!/^[A-Za-z0-9_-]{12,100}$/.test(requestId))return sendJson(res,400,{ok:false,code:'request_id_required',error:'Reopen this form to obtain a command request identifier.'});
    const receipt=(state.db.careCommandReceipts||[]).find(r=>r.id===requestId);
    if(receipt){
      if(receipt.actor!==scope.userId || receipt.command!==command || receipt.payloadDigest!==sha256Hex(JSON.stringify(payload)))return sendJson(res,409,{ok:false,code:'request_id_conflict',error:'This command identifier has already been used.'});
      const patient=(state.db.patients||[]).find(p=>p.id===receipt.patientId);
      const internationalCommand=['international_review','dossier_comment','dossier_reply'].includes(command) && scope.roleId==='intl.medical';
      const dossier=internationalCommand&&(state.db.intlPdcaDossiers||[]).find(d=>d.id===payload.id);
      if(!(internationalCommand?authorizedDossier(dossier,state.db):patientInPrincipalScope(patient,scope)))
        return sendJson(res,403,{ok:false,code:'clinical_scope_denied',error:'The saved command is no longer in this account’s clinical scope.'});
      // A receipt acknowledges the operation, not a snapshot. The client must
      // read from its previous revision to reconcile a lost response safely.
      return sendJson(res,200,{ok:true,duplicate:true,refreshRequired:true,rev:state.rev,saved:state.saved,patches:[]});
    }
    const result=careWorkflow.run(state.db,{...scope,id:scope.userId},command,payload,{
      visible:p=>patientInPrincipalScope(p,scope), now:nowISO(),id:prefix=>prefix+'-'+crypto.randomUUID(),randomInt:upper=>crypto.randomInt(upper)
    });
    if(!result.ok)return sendJson(res,result.status||400,{ok:false,code:result.code,error:result.msg});
    careWorkflow.apply(state.db,result.patches);
    (state.db.careCommandReceipts=state.db.careCommandReceipts||[]).push({id:requestId,actor:scope.userId,command,
      patientId:result.rec.patientId||result.rec.id,payloadDigest:sha256Hex(JSON.stringify(payload)),at:nowISO()});
    state.rev=(state.rev||0)+1;
    state.deltas=state.deltas||[];state.deltas.push({rev:state.rev,at:nowISO(),actor:scope.username,patches:result.patches});
    if(state.deltas.length>60)state.deltas.splice(0,state.deltas.length-60);
    appendServerAudit(state,scope.userId,result.event,'clinical_workflow',payload.patientId||payload.id,
      'Server-validated clinical decision; clinical content retained only in scoped record revisions.');
    await saveCloudState(state);
    return sendJson(res,200,{ok:true,rec:result.rec,rev:state.rev,saved:state.saved,
      patches:scopedPatchesForSession(result.patches,state,sess)});
  }

  if (route === 'state' && method === 'PUT') {
    const sess = getSession(state, req);
    if (!sess) return sendJson(res, 401, { ok: false, error: 'Sign in required to write to the online database.' });
    const body = await readJsonBody(req);
    if (state.rebuildRevision && (!Number.isSafeInteger(body.baseRev) || body.baseRev < state.rebuildRevision)) {
      return sendJson(res, 409, { ok:false, code:'rebuild_refresh_required', error:'The account hierarchy was rebuilt. Refresh the shared state before saving pending changes.' });
    }
    const patches = (Array.isArray(body.patches) ? body.patches : []).slice(0, MAX_PATCHES_PER_WRITE);
    state.db = state.db || { meta: { schema: 6, version: '6.9.6' } };
    const canAdminAccounts = ACCOUNT_ADMIN_ROLES.has(sess.roleId);
    const applied = [];
    const rejected = [];
    let merged = 0;

    for (const p of patches) {
      if (!p || typeof p.c !== 'string' || !SAFE_COLLECTION.test(p.c) || FORBIDDEN_KEYS.has(p.c)) continue;
      if(BOARD_ROLES.has(sess.roleId)&&p.c!=='personalPrefs'){rejected.push({c:p.c,id:p.id,reason:'oversight_read_only'});continue;}
      if (['devices','devicesPending','devicePolicyInstalled','creds','credentialExports','passwordVault','system','config','reactivationPack','mailboxes'].includes(p.c)) {
        rejected.push({c:p.c, id:p.id, reason:'server_owned_security'}); continue;
      }
      if(p.c==='execIssues'){rejected.push({c:p.c,id:p.id,reason:'coordination_command_required'});continue;}
      if(p.c==='execMeetings'&&(!executiveMember(state.db,sess,officialStructure.exec)||!['chief','director','program.admin'].includes(sess.roleId))){rejected.push({c:p.c,id:p.id,reason:'executive_scope_denied'});continue;}
      if(p.c==='cccReferrals'){
        const current=(state.db.cccReferrals||[]).find(r=>r.id===p.id);
        const candidate={...(current||{}),...(p.set||{})};
        if(p.del||!referralVisible(candidate,sess,state.db)||(current&&!referralVisible(current,sess,state.db))||
          (sess.roleId==='ccc.clinician'&&candidate.referredByUsername!==sess.username)||
          ['masterReports','masterReportSummary'].some(k=>Object.hasOwn(p.set||{},k)&&JSON.stringify(p.set[k])!==JSON.stringify(current?.[k])&&!(k==='masterReportSummary'&&!current&&!p.set[k]))){
          rejected.push({c:p.c,id:p.id,reason:'referral_scope_or_report_command_required'});continue;
        }
      }
      const clinicalRefusal=clinicalPatchPolicy(p,state.db,sess);
      if(clinicalRefusal){rejected.push({c:p.c,id:p.id,reason:clinicalRefusal});continue;}
      if (p.c === 'personalPrefs') {
        const prefKey = clipString(p.id || '', 160).trim();
        if (!prefKey || FORBIDDEN_KEYS.has(prefKey)) continue;
        const isOwnPref = prefKey === sess.userId || prefKey.toLowerCase() === sess.username || canAdminAccounts;
        if (!isOwnPref) {
          rejected.push({ c: p.c, id: prefKey, reason: 'not_permitted' });
          continue;
        }
        const incomingPref = safeObject(p.set);
        state.db.personalPrefs = safeObject(state.db.personalPrefs);
        state.db.personalPrefs[prefKey] = {
          ...safeObject(state.db.personalPrefs[prefKey]),
          ...incomingPref,
        };
        applied.push({ c: 'personalPrefs', id: prefKey, set: state.db.personalPrefs[prefKey], before: {} });
        continue;
      }
      if (p.c === 'settings') {
        if (sess.roleId !== 'chief') { rejected.push({c:p.c,id:p.id,reason:'chief_configuration_required'}); continue; }
        let appliedPatch = p;
        if (p.set && p.set.value) {
          const incoming = safeObject(p.set.value);
          delete incoming.system;
          delete incoming._landingPreview;
          delete incoming.landingTheme;
          delete incoming.landingThemeExplicit;
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
      if (['pendingActivations', 'emergencyCodes'].includes(p.c)) {
        const current = (Array.isArray(state.db[p.c]) ? state.db[p.c] : []).find(x=>x && String(x.id || '') === String(p.id || ''));
        const username = String((p.set && p.set.username) || (current && current.username) || '').toLowerCase();
        const target = (state.db.users || []).find(u=>u && String(u.username || '').toLowerCase() === username);
        const allowed = canAdminAccounts && target && (sess.roleId === 'chief' ||
          (target.roleId !== 'chief' && (sess.roleId !== 'countyadmin' || target.countyId === sess.countyId)));
        if (!allowed) { rejected.push({c:p.c, id:p.id, reason:'account_recovery_scope_denied'}); continue; }
      }
      if (p.c === 'messages' && !messagePatchAllowed(p, state, sess)) {
        rejected.push({ c: p.c, id: p.id, reason: 'message_scope_denied' });
        continue;
      }
      if (p.c === 'teamCalls' && !callPatchAllowed(p, state, sess)) {
        rejected.push({ c: p.c, id: p.id, reason: 'call_scope_denied' });
        continue;
      }
      if (p.c === 'notifications' && !notificationPatchAllowed(p, state, sess)) {
        rejected.push({ c: p.c, id: p.id, reason: 'notification_scope_denied' });
        continue;
      }
      if (!Array.isArray(state.db[p.c])) state.db[p.c] = [];
      const col = state.db[p.c];
      const idx = col.findIndex((r) => r && r.id === p.id);
      let set = safeObject(p.set);
      if (p.c === 'users') {
        for (const key of ['temporary','password','tempPassword','digest','mailboxConfirmed','mailboxConfirmedAt','mailboxConfirmedBy']) delete set[key];
      }
      /* A call record keeps only a bounded, text-only handshake. Each side owns
         one half of it, so an answer can never overwrite the caller's offer. */
      if (p.c === 'teamCalls' && set.signal && typeof set.signal === 'object') {
        const signal = set.signal;
        const list = (value) => (Array.isArray(value) ? value.slice(-10) : []).map((item) => callSignalText(item)).filter(Boolean);
        set = { ...set, signal: {
          offer: callSignalText(signal.offer), answer: callSignalText(signal.answer),
          callerCandidates: list(signal.callerCandidates), calleeCandidates: list(signal.calleeCandidates),
          sdp: callSignalText(signal.sdp), candidate: callSignalText(signal.candidate),
          at: typeof signal.at === 'string' ? signal.at.slice(0, 40) : nowISO(),
          from: clipString(signal.from || sess.userId, 160),
        } };
      }

      /* Clinical records are authorized by the server against the patient's
         trusted county/area, not merely by client-side navigation guards. */
      if (PATIENT_LINKED_COLLECTIONS.has(p.c)) {
        const financialWrite = ['transactions', 'adminOpsPayg'].includes(p.c) && financialPatchInScope(p, state, sess);
        const clinicalWrite = CLINICAL_WRITE_ROLES.has(sess.roleId) && patchInPrincipalScope(p, state, sess);
        if (!financialWrite && !clinicalWrite) {
          rejected.push({ c: p.c, id: p.id, reason: 'clinical_scope_denied' });
          continue;
        }
      }
      if (COUNTY_AREA_SCOPED_COLLECTIONS.has(p.c) && !patchInPrincipalScope(p, state, sess)) {
        rejected.push({ c: p.c, id: p.id, reason: 'clinical_scope_denied' });
        continue;
      }
      if (p.c === 'calendarEvents') {
        const existingMeeting = (state.db.calendarEvents || []).find((r) => r && String(r.id) === String(p.id));
        const candidate = { ...(existingMeeting || {}), ...set };
        if (candidate.patientId != null && (!CLINICAL_WRITE_ROLES.has(sess.roleId) || !patchInPrincipalScope({ ...p, set: candidate }, state, sess))) {
          rejected.push({ c: p.c, id: p.id, reason: 'clinical_scope_denied' });
          continue;
        }
        if ((candidate.kind === 'meeting' || (existingMeeting && existingMeeting.kind === 'meeting')) && !canManageServerMeetings(sess.roleId)) {
          rejected.push({ c: p.c, id: p.id, reason: 'meeting_manager_required' });
          continue;
        }
        if (candidate.kind === 'meeting') {
          let validHttps = false;
          try { const u = new URL(String(candidate.meetingUrl || '')); validHttps = u.protocol === 'https:' && !u.username && !u.password; } catch (_) {}
          if (!validHttps || !Array.isArray(candidate.visibleTo) || !candidate.visibleTo.length ||
              !candidate.governance || candidate.governance.confidentialityAcknowledged !== true ||
              candidate.governance.approvedProviderAcknowledged !== true) {
            rejected.push({ c: p.c, id: p.id, reason: 'meeting_policy_validation_failed' });
            continue;
          }
        }
      }

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
          if (Array.isArray(set.areaIds)) cred.areaIds = set.areaIds.map((id) => clipString(id, 80)).slice(0, 20);
          if (set.name) cred.name = set.name;
        }
      }
    }

    for (const patch of applied) {
      if (patch && patch.c === 'messages' && patch.set && patch.set.from === sess.userId && typeof patch.set.text === 'string') {
        appendServerAudit(state, sess.userId || sess.username, 'message.sent', 'message', patch.id,
          `Server-validated ${String(patch.set.kind || 'message')} message to ${Array.isArray(patch.set.to) ? patch.set.to.length : 0} recipient(s); text omitted from audit detail.`);
      }
    }
    state.rev = (state.rev || 0) + 1;
    state.deltas = state.deltas || [];
    state.deltas.push({ rev: state.rev, at: nowISO(), actor: sess.username, patches: applied });
    if (state.deltas.length > 60) state.deltas.splice(0, state.deltas.length - 60);
    if (rejected.length) {
      const collections = [...new Set(rejected.map((item) => String(item.c || 'unknown')))].sort();
      const reasons = [...new Set(rejected.map((item) => String(item.reason || 'not_permitted')))].sort();
      appendServerAudit(state, sess.userId || sess.username, 'sync.patch_rejected', 'collection', collections.join(','),
        `${rejected.length} patch(es) refused for role ${sess.roleId}; reason(s): ${reasons.join(', ')}.`);
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

  /* 10b. Public Account Activation Code (ACT-XXXXXX) & 24h Emergency Code (EMG-XXXX) Redemption */
  if (route === 'public/activate' && method === 'POST') {
    const body = await readJsonBody(req);
    const rawUser = String(body.username || '').trim().toLowerCase();
    const code = String(body.code || '').trim().toUpperCase();
    const newPw = String(body.password || '');
    if (!rawUser || !code || !newPw) {
      return sendJson(res, 400, { ok: false, error: 'Enter your username, activation code, and new password.' });
    }
    const dbUsers = (state.db && Array.isArray(state.db.users)) ? state.db.users : [];
    const matchedUser = dbUsers.find((u) => u && (String(u.username || '').toLowerCase() === rawUser || String(u.email || '').toLowerCase() === rawUser));
    const existingCred = Object.prototype.hasOwnProperty.call(state.creds || {}, rawUser)
      ? state.creds[rawUser]
      : Object.values(state.creds || {}).find((c) => String(c.email || '').toLowerCase() === rawUser);
    const uname = clipString((existingCred && existingCred.username) || (matchedUser && matchedUser.username) || rawUser, 120).toLowerCase();
    const pendingList = (state.db && Array.isArray(state.db.pendingActivations)) ? state.db.pendingActivations : [];
    const act = pendingList.find((a) => a && String(a.username || '').toLowerCase() === uname && String(a.code || '').toUpperCase() === code && !a.used && new Date(a.expiresAt) > new Date());
    if (!act || (!matchedUser && !existingCred)) {
      recordLoginFailure(state, uname || 'anonymous');
      await saveCloudState(state);
      return sendJson(res, 400, { ok: false, error: 'Invalid or expired activation code for that username.' });
    }
    const pwErr = validatePrivacyPassword(newPw, uname);
    if (pwErr) return sendJson(res, 400, { ok: false, error: pwErr });
    const { salt, digest } = hashPassword(newPw);
    act.used = true;
    act.usedAt = nowISO();
    state.creds = state.creds || {};
    state.creds[uname] = {
      ...(existingCred || {}),
      id: (existingCred && existingCred.id) || (matchedUser && matchedUser.id) || `u-${uname.replace(/\./g, '-')}`,
      username: uname,
      email: (existingCred && existingCred.email) || '',
      name: (existingCred && existingCred.name) || (matchedUser && matchedUser.name) || uname,
      roleId: (existingCred && existingCred.roleId) || (matchedUser && matchedUser.roleId) || 'staff',
      countyId: (existingCred && existingCred.countyId) || (matchedUser && matchedUser.countyId) || 'kisumu',
      salt,
      digest,
      sessionEpoch: crypto.randomBytes(16).toString('hex'),
      mustChange: false,
      privateSetAt: nowISO(),
      updatedAt: nowISO(),
    };
    delete state.creds[uname].temporary;
    delete state.creds[uname].revokedAt;
    if (matchedUser) {
      matchedUser.email = state.creds[uname].email;
      matchedUser.active = true;
      matchedUser.status = 'active';
      matchedUser.mustChange = false;
      matchedUser.mustChangePassword = false;
      matchedUser.dpaFirstLoginRequired = false;
      matchedUser.privacyPasswordSet = true;
      matchedUser.privacyPasswordAt = state.creds[uname].privateSetAt;
      delete matchedUser.hash;
      delete matchedUser.salt;
    }
    if (state.loginFailures) {
      delete state.loginFailures[uname];
      delete state.loginFailures[rawUser];
    }
    state.rev = (state.rev || 0) + 1;
    appendServerAudit(state, state.creds[uname].id, 'account.activated', 'user', state.creds[uname].id, `Account @${uname} activated via issued ACT code`);
    await saveCloudState(state);
    return sendJson(res, 200, { ok: true, rev: state.rev, username: uname });
  }

  if (route === 'auth/emergency' && method === 'POST') {
    const body = await readJsonBody(req);
    const rawUser = String(body.username || '').trim().toLowerCase();
    const code = String(body.code || '').trim().toUpperCase();
    const newPw = String(body.password || '');
    if (!rawUser || !code || !newPw) {
      return sendJson(res, 400, { ok: false, error: 'Enter your username, 24-hour EMG code, and new password.' });
    }
    const dbUsers = (state.db && Array.isArray(state.db.users)) ? state.db.users : [];
    const matchedUser = dbUsers.find((u) => u && (String(u.username || '').toLowerCase() === rawUser || String(u.email || '').toLowerCase() === rawUser));
    const existingCred = Object.prototype.hasOwnProperty.call(state.creds || {}, rawUser)
      ? state.creds[rawUser]
      : Object.values(state.creds || {}).find((c) => String(c.email || '').toLowerCase() === rawUser);
    const uname = clipString((existingCred && existingCred.username) || (matchedUser && matchedUser.username) || rawUser, 120).toLowerCase();
    const emgList = (state.db && Array.isArray(state.db.emergencyCodes)) ? state.db.emergencyCodes : [];
    const emg = emgList.find((e) => e && String(e.username || '').toLowerCase() === uname && String(e.code || '').toUpperCase() === code && !e.used && new Date(e.expiresAt) > new Date());
    if (!emg || (!matchedUser && !existingCred)) {
      recordLoginFailure(state, uname || 'anonymous');
      await saveCloudState(state);
      return sendJson(res, 400, { ok: false, error: 'Invalid or expired 24-hour emergency code for that username.' });
    }
    const pwErr = validatePrivacyPassword(newPw, uname);
    if (pwErr) return sendJson(res, 400, { ok: false, error: pwErr });
    const { salt, digest } = hashPassword(newPw);
    emg.used = true;
    emg.usedAt = nowISO();
    state.creds = state.creds || {};
    state.creds[uname] = {
      ...(existingCred || {}),
      id: (existingCred && existingCred.id) || (matchedUser && matchedUser.id) || `u-${uname.replace(/\./g, '-')}`,
      username: uname,
      email: (existingCred && existingCred.email) || '',
      name: (existingCred && existingCred.name) || (matchedUser && matchedUser.name) || uname,
      roleId: (existingCred && existingCred.roleId) || (matchedUser && matchedUser.roleId) || 'staff',
      countyId: (existingCred && existingCred.countyId) || (matchedUser && matchedUser.countyId) || 'kisumu',
      salt,
      digest,
      sessionEpoch: crypto.randomBytes(16).toString('hex'),
      mustChange: false,
      privateSetAt: nowISO(),
      updatedAt: nowISO(),
    };
    delete state.creds[uname].temporary;
    delete state.creds[uname].revokedAt;
    if (matchedUser) {
      matchedUser.email = state.creds[uname].email;
      matchedUser.active = true;
      matchedUser.status = 'active';
      matchedUser.mustChange = false;
      matchedUser.mustChangePassword = false;
      matchedUser.dpaFirstLoginRequired = false;
      matchedUser.failedLogins = 0;
      matchedUser.privacyPasswordSet = true;
      matchedUser.privacyPasswordAt = state.creds[uname].privateSetAt;
      delete matchedUser.hash;
      delete matchedUser.salt;
    }
    if (state.loginFailures) {
      delete state.loginFailures[uname];
      delete state.loginFailures[rawUser];
    }
    state.rev = (state.rev || 0) + 1;
    appendServerAudit(state, state.creds[uname].id, 'auth.emergency_reset', 'user', state.creds[uname].id, `Password reset via 24h emergency code for @${uname}`);
    await saveCloudState(state);
    return sendJson(res, 200, { ok: true, rev: state.rev, username: uname });
  }

  return sendJson(res, 404, { ok: false, error: `Unknown CareLink API endpoint: /api/${route}` });
}

/* Local owner-maintenance entry point, not an HTTP route. Possession of the
   writable database credentials is required. Use the interactive tool in
   tools/; never expose this function as an unauthenticated web endpoint. */
export async function ownerListChiefs() {
  return requestSnapshot.run({ snapshotKnown: false }, async () => {
    const { state } = await loadCloudHead();
    if (!state.setup) throw new Error('No commissioned CareLink installation was found in this database.');
    return Object.entries(state.creds || {})
      .filter(([username, cred]) => cred && cred.roleId === 'chief' &&
        username === String(cred.username || '').trim().toLowerCase())
      .map(([username, cred]) => ({ username, name: String(cred.name || 'Chief System Administrator') }));
  });
}

export async function ownerListPendingDevices(username) {
  const uname = String(username || '').trim().toLowerCase();
  return requestSnapshot.run({ snapshotKnown: false }, async () => {
    const { state } = await loadCloudHead();
    if (!state.setup || state.creds[uname]?.roleId !== 'chief') {
      throw new Error('That username is not an existing Chief account on this database.');
    }
    return Object.values(state.devices || {})
      .filter(device => device && device.status === 'pending' && device.users?.includes(uname))
      .map(({ id, label, type, firstSeen, requestedBy }) => ({ id, label, type, firstSeen, requestedBy }));
  });
}

export async function ownerRecoverChief({ username, password, deviceId = null, onProgress = null }) {
  const uname = String(username || '').trim().toLowerCase();
  if (!uname || typeof password !== 'string') throw new Error('A Chief username and new password are required.');
  const pwError = validatePrivacyPassword(password, uname);
  if (pwError) throw new Error(pwError);
  return requestSnapshot.run({ snapshotKnown: false }, async () => {
    const { state: head } = await loadCloudHead();
    const ctx = requestSnapshot.getStore();
    const expectedSnapshot = ctx.snapshot;
    const { state } = await loadCloudState({ readOnly: false });
    if (ctx.snapshot !== expectedSnapshot) throw new Error('The database changed during recovery. Run the tool again.');
    if (head._shardedManifest && !state._shardedManifest) {
      throw new Error('The current database shards could not be verified. No recovery was performed.');
    }
    if (state._shardedManifest && state._shardedManifest.head) {
      // Auth-only writes can update the manifest without changing its shards.
      state.creds = state._shardedManifest.head.creds || {};
    }
    const cred = state.creds && state.creds[uname];
    const user = (state.db && Array.isArray(state.db.users) ? state.db.users : [])
      .find(u => u && String(u.username || '').toLowerCase() === uname);
    if (!state.setup || !cred || cred.roleId !== 'chief' || (user && user.roleId !== 'chief')) {
      throw new Error('That username is not an existing Chief account on this database. No changes were made.');
    }
    if(deviceId!==null){
      const device=Object.hasOwn(state.devices || {},String(deviceId)) ? state.devices[String(deviceId)] : null;
      if(!device || device.status!=='pending' || !device.users?.includes(uname)) throw new Error('Choose the exact pending Chief device ID from the owner register; no browser was approved.');
      device.status='approved';device.decidedBy='database-owner';device.decidedAt=nowISO();
      state.devicePolicyInstalled=true;
      appendServerAudit(state,uname,'device.owner_recovery','device',device.id,'Database owner explicitly approved the pending Chief recovery browser.',{targetDeviceId:device.id});
    }
    const { salt, digest } = hashPassword(password);
    Object.assign(cred, { salt, digest, sessionEpoch: crypto.randomBytes(16).toString('hex'),
      mustChange: false, privateSetAt: nowISO(), updatedAt: nowISO() });
    delete cred.temporary;
    delete cred.revokedAt;
    if (user) {
      Object.assign(user, { active: true, status: 'active', mustChange: false, mustChangePassword: false,
        dpaFirstLoginRequired: false, failedLogins: 0, failedAttempts: 0, lockedUntil: null,
        privacyPasswordSet: true, privacyPasswordAt: cred.privateSetAt });
      delete user.hash; delete user.salt;
    }
    if (state.loginFailures) delete state.loginFailures[uname];
    for (const field of ['emergencyCodes', 'pendingActivations']) {
      if (Array.isArray(state.db[field])) state.db[field] = state.db[field]
        .filter(item => String(item && item.username || '').toLowerCase() !== uname);
    }
    state.rev = (Number(state.rev) || 0) + 1;
    appendServerAudit(state, cred.id || uname, 'auth.owner_recovery', 'user', cred.id || uname,
      'Chief password reset by database owner; previous sessions and recovery codes invalidated');
    await saveCloudState(state, { ownerRecovery: true, onProgress });
    return { username: uname, rev: state.rev };
  });
}

/* Convert storage/configuration failures into an explicit unavailable response.
   Most importantly, a failed KV read/write must never be reported as a successful
   online save or silently diverted to an ephemeral local copy. */
export function __resetCloudCachesForTests() {
  _primarySnapshotCache = null;
  _decodedCache = null;
  _manifestReadCache = null;
  _manifestReadInflight = null;
  _clientFastPackRing = [];
}

export default async function handler(req, res) {
  try {
    return await requestSnapshot.run({ snapshotKnown: false }, () => handleRequest(req, res));
  } catch (err) {
    if (res.writableEnded || res.finished) return;
    const storage = err && err.name === 'CloudStorageError';
    const master = err && err.name === 'MasterPackageError';
    const status = storage ? (err.statusCode || 503) : (master ? (err.statusCode || 400) : 500);
    if (storage && err.retryAfterSeconds) res.setHeader('Retry-After', String(err.retryAfterSeconds));
    return sendJson(res, status, {
      ok: false,
      code: storage || master ? err.code : 'internal_error',
      ...(storage && err.retryAfterSeconds ? { retryAfterSeconds: err.retryAfterSeconds } : {}),
      error: storage || master ? err.message : 'The CareLink online service could not complete that request.',
    });
  }
}
