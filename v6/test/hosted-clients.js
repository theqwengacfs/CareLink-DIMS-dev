/* Hosted PC/tablet regression coverage for the single online-source workflow. */
const assert = require('node:assert/strict');
const { makeCtx } = require('./dom');

let passed = 0;
function check(name, condition) {
  assert.ok(condition, name);
  passed++;
  console.log(`  ok  ${name}`);
}
function hostedCtx() {
  return makeCtx({
    location: { hash: '', protocol: 'https:', origin: 'https://carelink.test', host: 'carelink.test' },
    navigator: { userAgent: 'hosted-regression-test' },
    sessionStorage: { getItem(){ return null; }, setItem(){}, removeItem(){} },
  });
}
const setupHealth = {
  ok: true, cloud: true, onlineDatabase: true, setup: true, commissioned: true,
  demoMode: false, globallyActivated: false, demoDisabled: false, rev: 7,
  storageDriver: 'cloud-kv-redis', host: 'carelink.test',
};

(async () => {
  {
    const c = hostedCtx();
    c.run(`localStorage.removeItem(DB.KEY); DB.db = null; DB.load();`);
    check('a fresh hosted tablet does not auto-seed a device-local demo register',
      c.run(`DB.db.patients.length === 0 && DB.db.users.length === 0 && !DB.db.meta.freshSeeded`));
  }

  {
    const c = hostedCtx();
    c.run(`DB.db = DB.blank(); APPX.host = null; SYNC.server = null;
      SYNC._json = async () => ({ ok:false, status:503, body:{ ok:false, error:'KV unavailable' } });`);
    const before = c.run('JSON.stringify(DB.db)');
    await assert.rejects(
      c.run(`PROD_SETUP.completeFourStepHostSetup({ orgNameVal:'Test Org', shortNameVal:'TEST', seedMode:'empty', chiefPassword:'Kx9!vQ2#mTz7Lp' })`),
      /KV unavailable/
    );
    check('a failed hosted setup cannot report success or leave the commissioned local document behind',
      c.run('JSON.stringify(DB.db)') === before && c.run(`!DB.db.settings.hostSetupComplete && !APPX.host`));
  }

  {
    const c = hostedCtx();
    c.run(`DB.db = DB.blank(); APPX.host = null; SYNC.server = null;
      SYNC._json = async (url) => url === 'api/setup'
        ? { ok:true, status:200, body:{ ok:true, rev:7 } }
        : { ok:true, status:200, body:${JSON.stringify(setupHealth)} };`);
    const result = await c.run(`PROD_SETUP.completeFourStepHostSetup({ orgNameVal:'Test Org', shortNameVal:'TEST', seedMode:'empty', chiefPassword:'Kx9!vQ2#mTz7Lp' })`);
    check('hosted setup returns success only after the shared health state confirms commissioning',
      result && result.cloudVerified === true && c.run(`APPX.host.setup === true && APPX.host.commissioned === true`));

    const tabletLogin = c.run(`(()=>{
      /* Simulate a fresh tablet: no cached users, only the same health snapshot. */
      AUTH.user = null; DB.db = DB.blank(); APPX.screen = 'login'; LOGIN6.tab = 'demo';
      return renderLogin6();
    })()`);
    check('a fresh tablet with the commissioned health snapshot sees sign-in, not demo or first-run setup',
      c.run(`LOGIN6.tab === 'signin'`) &&
      !/data-tab="demo"|data-act="load-demo"|First-run online setup|Live host setup/i.test(tabletLogin));
  }

  {
    const c = hostedCtx();
    c.run(`DB.db = DB.blank(); APPX.host = { setup:false, commissioned:false, demoMode:false, globallyActivated:false }; SYNC.server = APPX.host;
      SYNC._json = async (url) => url === 'api/setup'
        ? { ok:true, status:200, body:{ ok:true, rev:8 } }
        : { ok:false, status:503, body:{ ok:false, error:'health unavailable' } };`);
    await assert.rejects(
      c.run(`PROD_SETUP.completeFourStepHostSetup({ orgNameVal:'Test Org', shortNameVal:'TEST', seedMode:'empty', chiefPassword:'Kx9!vQ2#mTz7Lp' })`),
      /fresh health read/
    );
    check('an accepted-but-unverified setup stays fail-closed without claiming completion',
      c.run(`APPX.host.commissioned === true && APPX.host.setup === true`) &&
      !/data-tab="demo"|First-run online setup/i.test(c.run(`(()=>{ APPX.screen='login'; LOGIN6.tab='demo'; return renderLogin6(); })()`)));
  }

  {
    const c = hostedCtx();
    c.run(`DB.db = DB.blank(); seedOfficial(DB.db, new Date(), { patients:0, mustChange:true });
      AUTH.user = DB.db.users.find(u => u.username === 'chief.admin');
      AUTH.session = { started:todayISO(), last:Date.now(), token:'chief-session' };
      APPX.host = { setup:true, commissioned:true, demoMode:false, globallyActivated:false };
      SYNC.server = APPX.host; SYNC.sessionToken = 'chief-session';
      SYNC._json = async () => ({ ok:false, status:503, body:{ ok:false, error:'KV write failed' } });`);
    const result = await c.run(`PROD_SETUP.activateSystemGlobally({})`);
    check('a failed hosted global activation returns no credential pack and rolls back the local activation flag',
      result === null && c.run(`!DB.db.settings.globallyActivated && !APPX.host.globallyActivated && !PROD_SETUP.lastPack`));
  }

  {
    const c = hostedCtx();
    c.run(`DB.db = DB.blank(); seedOfficial(DB.db, new Date(), { patients:0, mustChange:true });
      AUTH.user = DB.db.users.find(u => u.username === 'chief.admin');
      AUTH.session = { started:todayISO(), last:Date.now(), token:'chief-session' };
      APPX.host = { setup:true, commissioned:true, demoMode:false, globallyActivated:false };
      SYNC.server = APPX.host; SYNC.sessionToken = 'chief-session';
      SYNC._json = async (url, opts) => {
        if(url === 'api/setup/activate-global'){
          __activationRequest = JSON.parse(opts.body);
          return { ok:true, status:200, body:{ ok:true, rev:12,
            issued:__activationRequest.accounts.map(a => ({ username:a.username, password:a.password, mustChange:true })), preserved:[] } };
        }
        if(url === 'api/health') return { ok:true, status:200, body:{ ok:true, setup:true, commissioned:true,
          demoMode:false, globallyActivated:true, demoDisabled:true, rev:12, storageDriver:'cloud-kv-redis' } };
        throw new Error('unexpected request '+url);
      };`);
    const pack = await c.run(`PROD_SETUP.activateSystemGlobally({})`);
    check('hosted global activation sends the generated staff credentials to the online vault',
      pack && pack.count > 0 && c.run(`__activationRequest.accounts.length === ${pack.count} &&
        __activationRequest.accounts.every(a => a.username && a.password) && APPX.host.globallyActivated === true`));
  }

  {
    const c = hostedCtx();
    c.run(`DB.db = DB.blank(); APPX.screen = 'login'; APPX.host = { setup:true, commissioned:true, demoMode:false };
      AUTH.loginOnline = async () => ({ ok:false, code:'offline', error:'server unavailable' });
      AUTH.login = () => { throw new Error('hosted local fallback was called'); };
      __form = { username:'chief.admin', password:'not-a-local-password' };`);
    await c.run(`(async()=>{ await FORMS.login6(new FormData()); })()`);
    check('hosted sign-in never falls back to a local account or auto-demo after server failure',
      c.run(`!AUTH.user && DB.db.users.length === 0 && DB.db.patients.length === 0 && LOGIN6.error === 'server unavailable'`));
  }

  {
    const c = hostedCtx();
    c.run(`SYNC._json = async () => ({ ok:true, status:200, body:{ token:'tablet-token', rev:4,
      username:'staff.one', user:{ id:'u-staff-one', username:'staff.one' }, mustChange:false } });
      SYNC.pullFull = async () => { __pulledBeforeConsole = true; return true; };`);
    const result = await c.run(`SYNC.login('staff.one', 'temporary-password', 'tablet')`);
    check('successful online login pulls the shared state before returning to the console',
      result.ok === true && c.run(`__pulledBeforeConsole === true && SYNC.sessionToken === 'tablet-token'`));
  }

  {
    const c = hostedCtx();
    c.run(`SYNC._json = async () => ({ ok:true, status:200, body:{ token:'bad-state-token', rev:4,
      username:'staff.one', user:{ id:'u-staff-one', username:'staff.one' }, mustChange:false } });
      SYNC.pullFull = async () => false;`);
    const result = await c.run(`SYNC.login('staff.one', 'temporary-password', 'tablet')`);
    check('a login that cannot load shared state is rejected and its token is cleared',
      result.ok === false && result.code === 'state_unavailable' && c.run(`SYNC.sessionToken === null`));
  }

  console.log(`hosted-clients UI: ${passed} checks passed`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
