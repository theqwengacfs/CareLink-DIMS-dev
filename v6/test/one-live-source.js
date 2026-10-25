/* Regression coverage for the server-authoritative global-activation/demo boundary. */
const assert = require('node:assert/strict');
const { makeCtx } = require('./dom');

const { run } = makeCtx();
let passed = 0;
function check(name, condition) {
  assert.ok(condition, name);
  passed++;
  console.log(`  ok  ${name}`);
}

(async () => {
  run(`(()=>{
    DB.db = DB.blank();
    DB.db.settings.onboarding.complete = true;
    DB.db.settings.globallyActivated = false;
    DB.db.meta.globallyActivated = false;
    DB.db.meta.demoDisabled = false;
    APPX.host = { setup:true, globallyActivated:true, rev:42 };
    APPX.screen = 'login';
    LOGIN6.tab = 'demo';
    AUTH.logout();
  })()`);

  check('host globallyActivated flag wins without any local demo/activation marker', run('PROD_SETUP.isGloballyActivated()') === true);

  const login = String(run('renderLogin6()'));
  check('server-activated Sign-In forces the demo tab back to official sign-in', run('LOGIN6.tab') === 'signin');
  check('server-activated Sign-In hides demo accounts, demo loading and host setup',
    !login.includes('data-tab="demo"') &&
    !/Explore demo accounts|LOMAMO2026|Live host setup|data-act="load-demo"/i.test(login));

  const onboarding = String(run(`(()=>{ APPX.screen='onboard'; ONB.step=1; return renderOnboarding6(); })()`));
  check('a stale #/setup or direct onboarding render cannot expose demo/setup controls',
    run('APPX.screen') === 'login' && !/data-act="load-demo"|First-Run Production Setup/i.test(onboarding));

  run(`ACTIONS['login-tab']({tab:'demo'})`);
  check('a stale login-tab action cannot reopen the demo tab', run('LOGIN6.tab') === 'signin');

  const before = run('JSON.stringify(DB.db)');
  await run(`(async()=>{ await ACTIONS['load-demo'](); })()`);
  check('a stale load-demo action cannot mutate the database after activation', run('JSON.stringify(DB.db)') === before);
  check('the stale load-demo action leaves the user on official sign-in', run(`APPX.screen==='login' && LOGIN6.tab==='signin'`) === true);

  await assert.rejects(
    run(`(async()=>{ await activateFullDemoDataset(); })()`),
    /locked after global activation/
  );
  check('direct demo seeding is refused before it touches local data', run('JSON.stringify(DB.db)') === before);

  run(`(()=>{ APPX.host={setup:true,globallyActivated:false}; SYNC.server={globallyActivated:true}; })()`);
  check('the latest SYNC health snapshot also hides demo immediately', run('PROD_SETUP.isGloballyActivated()') === true);

  run(`(()=>{ APPX.host={setup:false,globallyActivated:false}; SYNC.server=null; LOGIN6.tab='signin'; })()`);
  const evaluationLogin = String(run('renderLogin6()'));
  check('pre-activation evaluation mode still exposes the demo tab (control)', evaluationLogin.includes('data-tab="demo"'));

  console.log(`one-live-source UI: ${passed} checks passed`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
