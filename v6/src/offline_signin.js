/* ============================================================================
   offline_signin.js — signing in when the network is gone, without inventing an
   account and without keeping a copy of the server's password digest.

   The Foundation asked for offline login (C1). It is the one request in the set
   that can quietly undo the rest, so it is built to a narrow shape:

     * **Opt-in, per person, at the moment they are online.** A device only holds
       an offline credential because its owner turned it on while signed in. It is
       never created as a side effect of a failed sign-in, and never seeded.
     * **A separate verifier.** What is stored is a fresh PBKDF2 digest derived
       here, with its own salt and 210,000 iterations. The server's digest is never
       copied to the device, so a stolen tablet yields nothing that works against
       the server.
     * **A shelf life.** The record stops working after `maxDays` (14 by default)
       without a successful online sign-in. An offline device is a temporary
       allowance, not a permanent bypass of the account's status.
     * **No promotion.** The cached record carries the role and county that were
       true when it was written. An offline sign-in cannot grant a capability the
       account does not have, and it cannot act on records outside that scope.
     * **A visible, says-so session.** Offline sign-in marks the session as offline
       so the console can say plainly that shared saves are queued, not confirmed.
   ============================================================================ */
const OFFLINE_SIGNIN = (() => {
  const STORE_KEY = 'carelink.offline.signin.v1';
  const ITERATIONS = 210000;
  const DEFAULT_MAX_DAYS = 14;

  /* localStorage is used rather than the database because the point of the record
     is to exist when the shared database cannot be reached. Anything unreadable is
     treated as "no record" - failing closed is the only safe reading here. */
  function readAll() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_e) { return {}; }
  }
  function writeAll(all) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(all)); return true; }
    catch (_e) { return false; }
  }

  function policy(db) {
    const sec = (db && db.settings && db.settings.security) || {};
    const allow = sec.offlineSignIn !== false;
    const days = Number(sec.offlineSignInDays);
    return { allow, maxDays: Number.isFinite(days) && days > 0 ? Math.min(days, 60) : DEFAULT_MAX_DAYS };
  }

  function cryptoApi() {
    try { return (typeof globalThis !== 'undefined' && globalThis.crypto) || null; } catch (_e) { return null; }
  }
  function toHex(buf) {
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function fromHex(hex) {
    const out = new Uint8Array(String(hex).length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(String(hex).substr(i * 2, 2), 16);
    return out;
  }

  async function derive(password, saltHex) {
    const c = cryptoApi();
    if (!c || !c.subtle) throw new Error('This browser cannot create an offline credential securely.');
    const key = await c.subtle.importKey('raw', new TextEncoder().encode(String(password)), 'PBKDF2', false, ['deriveBits']);
    const bits = await c.subtle.deriveBits({ name: 'PBKDF2', salt: fromHex(saltHex), iterations: ITERATIONS, hash: 'SHA-256' }, key, 256);
    return toHex(bits);
  }

  async function newSalt() {
    const c = cryptoApi();
    if (!c || !c.getRandomValues) throw new Error('This browser cannot create an offline credential securely.');
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    return toHex(bytes.buffer);
  }

  function deviceStamp() {
    try {
      if (typeof CLIENT_UI !== 'undefined' && CLIENT_UI.snapshot) {
        const s = CLIENT_UI.snapshot();
        return String((s && (s.label || s.type)) || 'This browser').slice(0, 100);
      }
    } catch (_e) {}
    return 'This browser';
  }

  /* Record the device while the person is signed in and online. Called only from a
     place where the password has just been verified by the server. */
  async function remember(user, password, opts = {}) {
    if (!user || !password) return { ok: false, msg: 'Nothing to remember.' };
    const pol = policy(opts.db);
    if (!pol.allow) return { ok: false, msg: 'Offline sign-in is switched off for this installation.' };
    const salt = await newSalt();
    const digest = await derive(password, salt);
    const all = readAll();
    const key = String(user.username || '').toLowerCase();
    all[key] = {
      username: key,
      userId: user.id,
      name: String(user.name || '').slice(0, 160),
      roleId: user.roleId,
      countyId: user.countyId || '',
      areaIds: Array.isArray(user.areaIds) ? user.areaIds.slice(0, 40) : [],
      departmentId: user.departmentId || user.dept || '',
      salt, digest, iterations: ITERATIONS,
      device: opts.device || deviceStamp(),
      createdAt: new Date().toISOString(),
      lastOnlineAt: new Date().toISOString(),
    };
    const saved = writeAll(all);
    return saved ? { ok: true, record: all[key] } : { ok: false, msg: 'This browser refused to keep the credential; offline sign-in will not be offered.' };
  }

  /* Extend the shelf life after a successful online sign-in. */
  function touch(username) {
    const all = readAll();
    const key = String(username || '').toLowerCase();
    const rec = all[key];
    if (!rec) return false;
    rec.lastOnlineAt = new Date().toISOString();
    return writeAll(all);
  }

  function forget(username) {
    const all = readAll();
    const key = String(username || '').toLowerCase();
    if (!all[key]) return false;
    delete all[key];
    return writeAll(all);
  }
  function forgetAll() { return writeAll({}); }

  function recordFor(username) {
    const rec = readAll()[String(username || '').toLowerCase()];
    return rec && rec.digest && rec.salt ? rec : null;
  }

  /* Whether an offline sign-in should be offered at all for this name, and if not,
     why not. The reason is shown to the person, because "it just did not work" is
     how people come to distrust a system. */
  function availability(username, db, now = Date.now()) {
    const pol = policy(db);
    if (!pol.allow) return { ok: false, reason: 'Offline sign-in is switched off for this installation.' };
    const rec = recordFor(username);
    if (!rec) return { ok: false, reason: 'This device has no offline credential for that account. Sign in online once with "Remember this device" ticked.' };
    const ageDays = (now - new Date(rec.lastOnlineAt || rec.createdAt).getTime()) / 86400000;
    if (ageDays > pol.maxDays) {
      return { ok: false, reason: `The offline credential for this account expired after ${pol.maxDays} days without an online sign-in. Connect to the network and sign in once to renew it.` };
    }
    return { ok: true, record: rec, daysLeft: Math.max(0, Math.ceil(pol.maxDays - ageDays)) };
  }

  /* The sign-in itself. Returns a user object shaped like the register's, built
     only from the cached record, so no capability is invented at this point. */
  async function attempt(username, password, opts = {}) {
    const db = opts.db;
    const avail = availability(username, db, opts.now);
    if (!avail.ok) return { ok: false, code: 'offline_unavailable', msg: avail.reason };
    const rec = avail.record;
    let digest;
    try { digest = await derive(password, rec.salt); }
    catch (e) { return { ok: false, code: 'offline_unavailable', msg: e.message }; }
    if (digest !== rec.digest) {
      return { ok: false, code: 'offline_denied', msg: 'That password does not match the offline credential held on this device.' };
    }
    /* The register may have been loaded from a previous session; if the account is
       present and has since been deactivated or locked, an offline sign-in must
       honour that rather than resurrect it. */
    const local = db && Array.isArray(db.users)
      ? db.users.find(u => String(u.username || '').toLowerCase() === rec.username || u.id === rec.userId)
      : null;
    if (local && (local.status === 'locked' || local.status === 'inactive' || local.status === 'revoked' || local.active === false)) {
      return { ok: false, code: 'offline_denied', msg: `This account is ${local.status || 'not active'}. It cannot be used offline.` };
    }
    return {
      ok: true,
      offline: true,
      user: local || {
        id: rec.userId, username: rec.username, name: rec.name, roleId: rec.roleId,
        countyId: rec.countyId, areaIds: rec.areaIds, departmentId: rec.departmentId,
        status: 'active', active: true, offlineCredential: true,
      },
      record: rec,
      daysLeft: avail.daysLeft,
    };
  }

  /* What the console must say while running on an offline credential. */
  function banner(daysLeft) {
    return {
      title: 'Offline session',
      body: `You are working from the credential this device remembered${Number.isFinite(daysLeft) ? `, valid for ${daysLeft} more day${daysLeft === 1 ? '' : 's'}` : ''}. Records you change are held on this device and offered to the server when the network returns. Nothing here is confirmed as saved centrally until then.`,
      tone: 'warn',
    };
  }

  return { STORE_KEY, ITERATIONS, DEFAULT_MAX_DAYS, policy, remember, touch, forget, forgetAll, recordFor,
    availability, attempt, banner, derive, newSalt };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = OFFLINE_SIGNIN;
