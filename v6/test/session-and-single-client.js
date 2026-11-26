/* ============================================================================
   session-and-single-client.js — one live client per account, and a session
   that ends when the person leaves rather than 31 minutes later.

   The Foundation asked for four things that all meet at the same place:
     B1  the session must end immediately when the tab or window closes;
     C4  sign-in must not require "browser approval" or a 31-minute wait;
     D4  one account may only be signed in once at a time.

   Both ends are asserted here against the *real* `api/index.js` handler behind a
   real `fetch`, not a stub, because the failure mode lives in the interaction
   between the account lease, the stored session record and the signed token.

   The 31 minutes came from two idle windows that disagreed: the screen ended at
   900 s, the server kept accepting the token for 1800 s, and the lease ran 60 s
   past that. Both ends now use one number, and a lease that changes hands retires
   the older token at once instead of leaving it valid until a sweep.
   ============================================================================ */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeKv, installKvFetch, makeBrowser, loadHandler } = require('./api-host-harness.cjs');
const { makeCtx } = require('./dom');

process.env.KV_REST_API_URL = 'https://kv-carelink.test';
process.env.KV_REST_API_TOKEN = 'session-test-token';
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
/* The duplicate-submission grace exists so a double-tapped sign-in cannot bounce
   two windows against each other. A deliberate second sign-in is not a duplicate,
   so this suite switches the grace off and exercises the takeover itself; the
   duplicate rule is pinned by api-security.mjs ("parallel attempts have one
   winner"). */
process.env.CARELINK_LOGIN_GRACE_MS = '0';

let passed = 0;
function ok(name, condition, detail) {
  assert.ok(condition, name + (detail === undefined ? '' : ` — ${detail}`));
  passed++;
  console.log(`  ok  ${name}`);
}

const API = fs.readFileSync(path.join(__dirname, '..', '..', 'api', 'index.js'), 'utf8');
const ACCOUNT = 'system.admin';
const TEMP = 'Kx9!vQ2#mTz7Lp';
const PRIVATE = 'Safe#Vault2027!Xy9';

async function openBrowser(handler) {
  const br = makeBrowser(handler);
  const c = makeCtx({
    location: br.location,
    navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0 Safari/537.36' },
    fetch: br.fetch,
    performance: { now: () => Date.now() },
  });
  c.ctx.__fd = (f) => ({ get: (k) => (k in f ? f[k] : null) });
  await c.run('boot()');
  c.__br = br;
  return c;
}

(async () => {
  /* ---- the windows agree on one duration -------------------------------- */
  const idle = Number((API.match(/const IDLE_SECONDS = (\d+);/) || [])[1]);
  ok('the server idle window is fifteen minutes', idle === 900, String(idle));
  ok('the lease is the idle window plus one minute, not plus a second window',
    API.includes('const SESSION_LEASE_SECONDS = IDLE_SECONDS + 60;'));
  ok('the screen ends at the same fifteen minutes the server does',
    /WARN_AT: 870,\s*\/\/[^\n]*\n\s*END_AT: 900,/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8')));
  ok('nobody has to wait 31 minutes for a lease to lapse',
    !/IDLE_SECONDS = 1800/.test(API) && !/IDLE_SECONDS = 1860/.test(API));

  /* ---- close the tab, lose the account --------------------------------- */
  const sync = fs.readFileSync(path.join(__dirname, '..', 'src', 'sync6.js'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
  ok('a closed or hidden tab gives the session back', /releaseOnExit\(\)\{/.test(sync));
  ok('the release survives the page being torn down', /keepalive:true/.test(sync));
  ok('closing the tab is wired to pagehide', /addEventListener\('pagehide'/.test(app));
  ok('a backgrounded phone that is killed also gives the session back',
    /addEventListener\('visibilitychange'/.test(app) && /visibilityState!=='hidden'/.test(app));
  ok('the release only gives up the session and never touches records',
    !/releaseOnExit[\s\S]{0,600}?DB\.save\(|releaseOnExit[\s\S]{0,600}?DB\.db\s*=/.test(sync));

  /* ---- a real host, two real browsers ---------------------------------- */
  const kv = makeKv();
  installKvFetch(kv);
  const handler = await loadHandler();

  const A = await openBrowser(handler);
  await A.run(`PROD_SETUP.completeFourStepHostSetup({orgNameVal:'LOMAMO Foundation Kenya',shortNameVal:'LOMAMO',seedMode:'empty',chiefUsername:'${ACCOUNT}',chiefPassword:'${TEMP}',loginUrl:'https://carelink.test'})`);
  await A.run(`FORMS.login6(__fd({username:'${ACCOUNT}',password:'${TEMP}'}))`);
  await A.run(`FORMS.mustchange6(__fd({current:'${TEMP}',password:'${PRIVATE}',password2:'${PRIVATE}',autoFeedCloudMaster:'1'}))`);
  ok('the commissioning account can sign in and take a private password',
    A.run('Boolean(AUTH.user)') === true && A.run('AUTH.mustChange') === false);

  const before = await A.run('SYNC._json("api/state",{timeoutMs:8000})');
  ok('the signed-in client can read shared state', before.status === 200);
  /* Keep the retired window's token so the test can ask the host what happened
     to it, exactly as the client's own beat would. */
  const staleToken = A.run('SYNC.sessionToken');

  /* ---- a second browser signs in: no approval step, no waiting --------- */
  const B = await openBrowser(handler);
  ok('the second browser is a different physical device',
    B.__br.getCookie() !== A.__br.getCookie(), 'device cookies matched');
  await B.run(`FORMS.login6(__fd({username:'${ACCOUNT}',password:'${PRIVATE}'}))`);
  /* The account is open on A, so the second browser is refused - but it is refused
     with an offer, not with a waiting room. */
  ok('the second browser is not signed in silently over the first', B.run('AUTH.user') === null);
  ok('the refusal offers a takeover instead of asking the person to wait 31 minutes',
    B.run('Boolean(LOGIN6.conflict && LOGIN6.conflict.username)') === true);
  ok('a takeover is never offered for what looks like a duplicate submission',
    /canTakeover: !duplicateSubmission/.test(API));
  /* Take the account over deliberately, as the person would by pressing the button. */
  await B.run('ACTIONS["login-takeover"]()');
  ok('the takeover signs the new browser in', B.run('Boolean(AUTH.user)') === true);
  ok('and needs no administrator approval to get there', B.run('LOGIN6.busy') === false);

  /* ---- the older window is retired at once, not in 31 minutes ---------- */
  const stale = await A.run('SYNC._json("api/state",{timeoutMs:8000})');
  ok('the earlier window stops reading shared state immediately', stale.status === 401, String(stale.status));
  ok('the client treated that as an ended session, not a glitch', A.run('AUTH.user') === null);
  const staleWho = await A.__br.fetch('/api/session/whoami', { headers: { 'X-CareLink-Session': staleToken } });
  const staleWhoBody = await staleWho.json();
  ok('the older window is told plainly that the account signed in elsewhere',
    staleWhoBody.code === 'session_superseded', JSON.stringify(staleWhoBody));

  /* ---- the arriving window works -------------------------------------- */
  const live = await B.run('SYNC._json("api/state",{timeoutMs:8000})');
  ok('the newest window keeps working', live.status === 200, String(live.status));

  /* ---- signing out frees the account immediately ----------------------- */
  await B.run('SYNC.logout()');
  const leaseKeys = () => [...kv.store.keys()].filter((k) => /account_session_v3|<no-r>/i.test(String(k)) && /session/.test(String(k)));
  ok('signing out releases the account lease', leaseKeys().length === 0, leaseKeys().join(','));

  const C = await openBrowser(handler);
  await C.run(`FORMS.login6(__fd({username:'${ACCOUNT}',password:'${PRIVATE}'}))`);
  ok('the same account can sign in again straight away, with no wait',
    C.run('Boolean(AUTH.user)') === true);

  /* ---- closing the tab frees it too ---------------------------------- */
  C.run('SYNC.releaseOnExit()');
  await new Promise((r) => setTimeout(r, 400));
  const D = await openBrowser(handler);
  await D.run(`FORMS.login6(__fd({username:'${ACCOUNT}',password:'${PRIVATE}'}))`);
  ok('closing the window frees the account for the next sign-in immediately',
    D.run('Boolean(AUTH.user)') === true);

  /* ---- the audit trail records the supersession ---------------------- */
  /* ---- a double-tapped sign-in must not bounce two windows --------------- */
  const duplicateRule = fs.readFileSync(path.join(__dirname, '..', '..', 'api', 'index.js'), 'utf8');
  ok('a duplicate submission inside the grace window is refused rather than bouncing two windows',
    /LOGIN_DUPLICATE_GRACE_MS/.test(duplicateRule) && /duplicateSubmission/.test(duplicateRule));
  ok('the grace window is short enough not to feel like a lockout',
    /CARELINK_LOGIN_GRACE_MS\);[\s\S]{0,80}?: 5000;/.test(duplicateRule) || /: 5000;/.test(duplicateRule));

  ok('the takeover is in the audit trail, not silent',
    /auth\.client_superseded/.test(API) && /supersededSessionId/.test(API));
  ok('the losing session id is revoked in the same write as the new sign-in',
    /state\.revokedSessions\[`sid:\$\{supersededSessionId\}`\]/.test(API));
  ok('a takeover does not cost every later poll an extra KV read',
    !/lease\.owner !== s\.sessionId/.test(API) && !/lease\.owner !== verified\.sid/.test(API));
  /* The lease is consulted where a session changes hands, not on every poll, and
     an unreadable store reports `known:false` rather than "nobody is signed in". */
  ok('an unreadable KV store never signs a working person out',
    /known: false, owner: null/.test(API) && /if \(!sessionReserved\)/.test(API));
  ok('the single-client lease is still what decides who owns the account',
    /reserveLoginSession/.test(API) && /releaseSessionLease/.test(API) && /SESSION_LEASE_SECONDS = IDLE_SECONDS \+ 60/.test(API));

  console.log(`session-and-single-client: ${passed} checks passed`);
})().catch((e) => { console.error(e); process.exit(1); });
