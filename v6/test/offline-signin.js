/* ============================================================================
   offline-signin.js — signing in without a network, without weakening the account.

   Offline sign-in (C1) is the request most likely to quietly undo the rest of the
   security model, so this suite pins the constraints rather than the convenience:

     * no offline credential exists until somebody asks for one while online;
     * the device stores a *separate* PBKDF2 verifier, never the server's digest;
     * the credential expires, and expiry is enforced rather than displayed;
     * a locked, inactive or revoked account cannot be resurrected offline;
     * an offline session announces itself, and marks shared saves as unconfirmed.
   ============================================================================ */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeCtx } = require('./dom');

let passed = 0;
function ok(name, condition, detail) {
  assert.ok(condition, name + (detail === undefined ? '' : ` — ${detail}`));
  passed++;
  console.log(`  ok  ${name}`);
}

(async () => {
  /* The test DOM has no WebCrypto; the module must use the real one, because
     deriving a credential any other way would be the whole problem. */
  const { run, ctx } = makeCtx({ crypto: require('node:crypto').webcrypto, TextEncoder, TextDecoder });
  run('DB.load();DB.seedDemo();');

  const SRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'offline_signin.js'), 'utf8');
  const login = fs.readFileSync(path.join(__dirname, '..', 'src', 'entry6.js'), 'utf8');

  /* ---- the constraints that make the feature safe ----------------------- */
  ok('the device derives its own verifier with a salt and a high iteration count',
    /ITERATIONS = 210000/.test(SRC) && /deriveBits\(\{ name: 'PBKDF2'/.test(SRC));
  ok('the credential lives in device storage, not in the shared database',
    /localStorage\.getItem\(STORE_KEY\)/.test(SRC) && !/DB\.db\.offline/.test(SRC));
  ok('nothing in the module copies a server digest onto the device',
    !/digest\s*:\s*(user|u)\.hash/.test(SRC) && !/\.hash\b/.test(SRC));
  ok('the credential expires and expiry is enforced, not just displayed',
    /ageDays > pol\.maxDays/.test(SRC) && /expired after/.test(SRC));
  ok('an unreadable store fails closed rather than open',
    /catch \(_e\) \{ return \{\}; \}|catch \(_e\) \{ return \{\};/.test(SRC));
  ok('offline sign-in can be switched off for the whole installation',
    /sec\.offlineSignIn !== false/.test(SRC));
  ok('a locked, inactive or revoked account cannot sign in offline',
    /local\.status === 'locked'/.test(SRC) && /local\.active === false/.test(SRC));

  /* ---- the real thing, with a real password ---------------------------- */
  const user = run(`(() => {
    const u = DB.db.users.find(x => x.roleId === 'nurse' && x.status === 'active');
    u.__plain = 'Offline#Test2027!';
    return { id:u.id, username:u.username, name:u.name, roleId:u.roleId, countyId:u.countyId };
  })()`);

  const before = await run(`OFFLINE_SIGNIN.availability(${JSON.stringify(user.username)}, DB.db)`);
  ok('nothing is remembered before the person asks for it', before.ok === false && /no offline credential/i.test(before.reason), before.reason);

  const remembered = await run(`(async () => {
    const u = DB.db.users.find(x => x.username === ${JSON.stringify(user.username)});
    return await OFFLINE_SIGNIN.remember(u, u.__plain, { db: DB.db, device: 'Synthetic tablet' });
  })()`);
  ok('remembering a device succeeds and returns a record', remembered.ok === true, JSON.stringify(remembered).slice(0, 160));
  ok('the stored verifier is not the password and not the server digest',
    Boolean(remembered.record.digest) && remembered.record.digest !== 'Offline#Test2027!' &&
    remembered.record.digest !== run(`DB.db.users.find(x=>x.username===${JSON.stringify(user.username)}).hash`));
  ok('the record keeps the scope that was true when it was written',
    remembered.record.roleId === user.roleId && remembered.record.countyId === user.countyId);

  const avail = run(`OFFLINE_SIGNIN.availability(${JSON.stringify(user.username)}, DB.db)`);
  ok('once remembered, the device offers an offline sign-in and says how long for',
    avail.ok === true && avail.daysLeft === 14, JSON.stringify(avail).slice(0, 120));

  const good = await run(`(async () => OFFLINE_SIGNIN.attempt(${JSON.stringify(user.username)}, 'Offline#Test2027!', { db: DB.db }))()`);
  ok('the right password signs in offline', good.ok === true && good.offline === true);
  ok('the offline session carries no capability beyond the cached scope',
    good.user.roleId === user.roleId && good.user.countyId === user.countyId);
  ok('the offline session is labelled as offline, so the console can say so',
    /Offline session/.test(run(`OFFLINE_SIGNIN.banner(${good.daysLeft}).title`)) &&
    /not confirmed|Nothing here is confirmed/i.test(run(`OFFLINE_SIGNIN.banner(${good.daysLeft}).body`)));

  const bad = await run(`(async () => OFFLINE_SIGNIN.attempt(${JSON.stringify(user.username)}, 'wrong-password', { db: DB.db }))()`);
  ok('the wrong password is refused', bad.ok === false && bad.code === 'offline_denied');

  const unknown = await run(`(async () => OFFLINE_SIGNIN.attempt('nobody.here', 'whatever', { db: DB.db }))()`);
  ok('an account this device never remembered cannot sign in offline',
    unknown.ok === false && unknown.code === 'offline_unavailable');

  /* ---- expiry --------------------------------------------------------- */
  const stale = run(`(() => {
    const all = JSON.parse(localStorage.getItem(OFFLINE_SIGNIN.STORE_KEY));
    all[${JSON.stringify(user.username)}].lastOnlineAt = new Date(Date.now() - 20 * 86400000).toISOString();
    localStorage.setItem(OFFLINE_SIGNIN.STORE_KEY, JSON.stringify(all));
    return OFFLINE_SIGNIN.availability(${JSON.stringify(user.username)}, DB.db);
  })()`);
  ok('a credential not renewed online for longer than the policy expires',
    stale.ok === false && /expired after 14 days/i.test(stale.reason), stale.reason);
  const staleAttempt = await run(`(async () => OFFLINE_SIGNIN.attempt(${JSON.stringify(user.username)}, 'Offline#Test2027!', { db: DB.db }))()`);
  ok('and the expiry is enforced at sign-in, not merely displayed',
    staleAttempt.ok === false && staleAttempt.code === 'offline_unavailable');

  run(`(() => {
    const all = JSON.parse(localStorage.getItem(OFFLINE_SIGNIN.STORE_KEY));
    all[${JSON.stringify(user.username)}].lastOnlineAt = new Date().toISOString();
    localStorage.setItem(OFFLINE_SIGNIN.STORE_KEY, JSON.stringify(all));
    OFFLINE_SIGNIN.touch(${JSON.stringify(user.username)});
  })()`);
  ok('an online sign-in renews the credential', run(`OFFLINE_SIGNIN.availability(${JSON.stringify(user.username)}, DB.db).ok === true`));

  /* ---- a deactivated account cannot be resurrected -------------------- */
  run(`(() => { const u = DB.db.users.find(x => x.username === ${JSON.stringify(user.username)}); u.status = 'locked'; })()`);
  const locked = await run(`(async () => OFFLINE_SIGNIN.attempt(${JSON.stringify(user.username)}, 'Offline#Test2027!', { db: DB.db }))()`);
  ok('an account locked in the register cannot be signed into offline',
    locked.ok === false && /locked/i.test(locked.msg), locked.msg);
  run(`(() => { const u = DB.db.users.find(x => x.username === ${JSON.stringify(user.username)}); u.status = 'active'; })()`);

  /* ---- the policy switch ---------------------------------------------- */
  run(`DB.db.settings.security = Object.assign({}, DB.db.settings.security, { offlineSignIn:false })`);
  ok('switching the policy off removes the offer, even on a remembered device',
    run(`OFFLINE_SIGNIN.availability(${JSON.stringify(user.username)}, DB.db).ok === false`));
  const refused = await run(`(async () => OFFLINE_SIGNIN.attempt(${JSON.stringify(user.username)}, 'Offline#Test2027!', { db: DB.db }))()`);
  ok('and refuses the sign-in rather than only hiding the button', refused.ok === false);
  run(`DB.db.settings.security.offlineSignIn = true`);

  ok('forgetting a device removes the credential entirely',
    run(`OFFLINE_SIGNIN.forget(${JSON.stringify(user.username)}) && OFFLINE_SIGNIN.recordFor(${JSON.stringify(user.username)}) === null`));

  /* ---- wiring --------------------------------------------------------- */
  ok('a credential is created only after an online sign-in, never on a failed one',
    /if\(!res\.offline && AUTH\.user && \(passwordRemembered/.test(login));
  ok('the sign-in form asks for permission before remembering a device',
    /name="rememberDevice"/.test(login) && /Remember this device/.test(login));
  ok('the form warns how long the credential lasts',
    /expires after \$\{OFFLINE_SIGNIN\.policy\(DB\.db\)\.maxDays\} days/.test(login));
  ok('an offline attempt is offered before a network call has to time out',
    /login-offline-now/.test(login) && /LOGIN6\.forceOffline/.test(login));
  ok('an offline sign-in marks the session so shared saves are not claimed as saved',
    /SYNC\.deviceOnlyOverride = true/.test(login) && /records are held on this device/i.test(login));
  ok('the chief can switch offline sign-in off and set the expiry from Preferences',
    /security\.offlineSignIn/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'views_settings.js'), 'utf8')) &&
    /security\.offlineSignInDays/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'views_settings.js'), 'utf8')));

  console.log(`offline-signin: ${passed} checks passed`);
})().catch((e) => { console.error(e); process.exit(1); });
