/* End-to-end verification of:
   1. PC & Tablet Client Login System:
      - Pre-commissioning hosted demo evaluation login (`LOMAMO2026` on server-scrubbed DB) + permanent lock after commissioning/activation
      - Full 4-Step Setup -> Chief Login (deferred SESSION.start during mustChange) -> 3,333-patient Auto-Feed -> Global Activation -> Staff `status === 'active'`
      - Hosted PC & Tablet Staff Login by username AND official email (`POST /api/credentials/provision`), password visibility toggle (`toggle-pw`), `ACT-*` activation & `EMG-*` emergency recovery codes, and dark-mode hosted session unlock (`FORMS.unlock`)
      - Zero data wipe & zero false logout under `SYNC.tick()` + `LIVE.start()` (`unchanged: true`, incremental `patches`, `pagedCollections` -> `pullFull()`, and lightweight `DB.persistState()`)
   2. Themes System:
      - Complete CSS variable coverage (`--text`, `--text-2`, `--text-3`, `--border`, `--border-strong`, `--ok-bd`, `--warn-bd`, `--crit-bd`, `--info-bd`) across all 20 themes
      - All 10 `LANDING_THEMES` `.ld[data-theme="..."]` palettes + unauthenticated client `GET /api/health` `landingTheme` inheritance
      - Cloud `personalPrefs` sync (`wtheme`, `font`, `textScale`, studio) across Tablet A -> PC B + survival across `SYNC.pullFull()`
      - Custom Visual Pack JSON `theme` persistence, rehydration on a fresh client (`WTHEME.syncCustomThemes()`), Default Inter font preview, and balanced CSS braces */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeCtx } = require('./dom');

process.env.KV_REST_API_URL = 'https://kv-login-themes.test';
process.env.KV_REST_API_TOKEN = 'login-themes-token';
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const kv = new Map();
let shardGets = 0;

function kvResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}
function keyFromPath(url, prefix) {
  return decodeURIComponent(url.pathname.slice(prefix.length));
}

global.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  assert.equal(url.origin, 'https://kv-login-themes.test');
  const rawBody = String(init.body || '');
  const bodyBytes = Buffer.byteLength(rawBody);
  if (url.pathname.startsWith('/get/')) {
    const key = keyFromPath(url, '/get/');
    if (/_s\d+$/.test(key)) shardGets++;
    return kvResponse({ result: kv.has(key) ? kv.get(key) : null });
  }
  if (url.pathname.startsWith('/set/')) {
    const key = keyFromPath(url, '/set/');
    assert.ok(bodyBytes <= 1024 * 1024, `KV write ${key} exceeded 1 MiB Free-Tier cap (${bodyBytes} bytes)`);
    kv.set(key, rawBody);
    return kvResponse({ result: 'OK' });
  }
  if (url.pathname.startsWith('/del/')) {
    const key = keyFromPath(url, '/del/');
    kv.delete(key);
    return kvResponse({ result: 1 });
  }
  throw new Error(`Unexpected KV request: ${url.pathname}`);
};

(async () => {
  const { default: handler } = await import('../../api/index.js');

  async function apiFetch(url, opts = {}) {
    const headers = { host: 'carelink.test' };
    for (const [k, v] of Object.entries(opts.headers || {})) headers[k.toLowerCase()] = v;
    const req = { url: url.startsWith('/') ? url : `/${url}`, method: opts.method || 'GET', headers, body: opts.body || {}, on() {} };
    let status = 0;
    let rawResponse = '';
    const res = {
      set statusCode(v) { status = v; },
      get statusCode() { return status; },
      setHeader() {},
      end(chunk = '') { rawResponse = String(chunk); },
    };
    await handler(req, res);
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => rawResponse,
      json: async () => JSON.parse(rawResponse),
    };
  }

  function makeHostedClient(deviceType = 'pc') {
    const ua = deviceType === 'tablet'
      ? 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36';
    const c = makeCtx({
      location: { hash: '#/', search: '', pathname: '/carelink-v6.html', protocol: 'https:', hostname: 'carelink.test', origin: 'https://carelink.test' },
      navigator: { userAgent: ua, clipboard: { writeText: async () => {} }, maxTouchPoints: deviceType === 'tablet' ? 5 : 0 },
      fetch: apiFetch,
      performance: { now: () => Date.now() },
    });
    c.ctx.__fd = (fields) => ({ get: (k) => (k in fields ? fields[k] : null) });
    return c;
  }

  /* ------------------------------------------------------------------
     1. CSS Brace Integrity + Complete Theme Token & Landing Palette Check
     ------------------------------------------------------------------ */
  const srcDir = path.join(__dirname, '..', 'src');
  for (const cssFile of fs.readdirSync(srcDir).filter(f => f.endsWith('.css'))) {
    const raw = fs.readFileSync(path.join(srcDir, cssFile), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const opens = (raw.match(/\{/g) || []).length;
    const closes = (raw.match(/\}/g) || []).length;
    assert.equal(opens, closes, `${cssFile} has unbalanced CSS braces (${opens} '{' vs ${closes} '}')`);
  }
  const console6Css = fs.readFileSync(path.join(srcDir, 'console6.css'), 'utf8');
  for (const lid of ['heritage', 'dawn', 'clinic', 'editorial', 'canopy', 'signal', 'sand', 'violet', 'paper', 'spectrum']) {
    assert.match(console6Css, new RegExp(`\\.ld\\[data-theme="${lid}"\\]`), `Missing .ld[data-theme="${lid}"] rule in console6.css`);
  }
  assert.match(console6Css, /font-size:\s*16px\s*!important/, 'Tablet login inputs must set 16px font-size to prevent iOS/iPadOS auto-zoom');

  /* ------------------------------------------------------------------
     2. Pre-Commissioning Hosted Demo Login (`LOMAMO2026`) on Scrubbed DB
     ------------------------------------------------------------------ */
  const evalSeeder = makeHostedClient('pc');
  evalSeeder.run('DB.load(); DB.seedOfficial({ patients: 24, mustChange: false });');
  const bootRes = await evalSeeder.run(`SYNC._json('api/public/demo-bootstrap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ db: DB.db })
  })`);
  assert.equal(bootRes.ok, true, 'Fresh evaluation host must accept demo-bootstrap');

  const evalTablet = makeHostedClient('tablet');
  await evalTablet.run('(async () => { DB.load(); APPX.screen = "login"; APPX.host = await hostProbe(); SYNC.server = APPX.host; })()');
  /* Even before local demo users have hashes, hosted quick-login authenticates online with LOMAMO2026 */
  await evalTablet.run('ACTIONS["quick-login"]({ u: "director" })');
  assert.equal(evalTablet.run('AUTH.user && AUTH.user.username'), 'director', 'Hosted tablet quick-login must sign in to demo evaluation installation');
  assert.equal(evalTablet.run('DB.db.patients.length'), 24, 'Hosted tablet demo login must pull demo patients');

  /* Reset evaluation host cleanly so we can run official 4-step commissioning */
  kv.clear();

  /* ------------------------------------------------------------------
     3. Official 4-Step Setup -> Chief Login -> 3,333-Patient Cloud Auto-Feed -> Global Activation
     ------------------------------------------------------------------ */
  const pcAdmin = makeHostedClient('pc');
  await pcAdmin.run('boot()');
  const chiefTempPw = 'Kx9!vQ2#mTz7Lp';
  const commissioned = await pcAdmin.run(`PROD_SETUP.completeFourStepHostSetup({
    orgNameVal: 'LOMAMO Foundation Kenya',
    shortNameVal: 'LOMAMO',
    seedMode: 'empty',
    chiefUsername: 'system.admin',
    chiefPassword: ${JSON.stringify(chiefTempPw)},
    loginUrl: 'https://carelink.test'
  })`);
  assert.equal(commissioned.cloudVerified, true, '4-step commissioning must succeed');

  await pcAdmin.run(`FORMS.login6(__fd(${JSON.stringify({ username: 'system.admin', password: chiefTempPw })}))`);
  assert.equal(pcAdmin.run('Boolean(AUTH.user && AUTH.mustChange)'), true, 'Chief first login enters mustChange');
  assert.equal(pcAdmin.run('Boolean(SESSION._beat)'), false, 'SESSION.start() must be deferred while AUTH.mustChange is true');

  const chiefPrivPw = 'Safe#Vault2027!Xy9';
  await pcAdmin.run(`FORMS.mustchange6(__fd(${JSON.stringify({
    current: chiefTempPw,
    password: chiefPrivPw,
    password2: chiefPrivPw,
    autoFeedCloudMaster: '1',
  })}))`);
  assert.equal(pcAdmin.run('AUTH.mustChange'), false);
  assert.equal(pcAdmin.run('DB.db.patients.length'), 3333, 'Chief auto-feed must load all 3,333 patients');
  assert.equal(pcAdmin.run('Boolean(Store.get(DB.KEY))'), false, 'Hosted >500-patient client must NOT serialize 72.8 MB DB into localStorage');
  assert.equal(pcAdmin.run('Boolean(Store.get(DB.PREFS_KEY))'), true, 'Lightweight preferences snapshot must be stored locally');

  /* Demo login must be strictly refused once commissioned */
  const demoAfterSetup = await apiFetch('api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'director', password: 'LOMAMO2026' }),
  });
  assert.equal(demoAfterSetup.ok, false, 'Demo password must be refused once host is commissioned');

  /* Set Landing Theme to 'canopy' as Chief Admin and push to cloud */
  pcAdmin.run('ACTIONS["set-landing-theme"]({ id: "canopy" })');
  await pcAdmin.run('SYNC.push()');

  /* Activate System Globally */
  const actPack = await pcAdmin.run('PROD_SETUP.activateSystemGlobally(AUTH.user)');
  assert.ok(actPack && actPack.count > 0 && Array.isArray(actPack.rows), 'Global activation must succeed');
  const nyalendaEntry = actPack.rows.find(e => e.username === 'caregiver.nyalenda');
  assert.ok(nyalendaEntry && nyalendaEntry.tempPassword, 'WhatsApp credential issued for caregiver.nyalenda');

  /* Provision a new county staff account with official email via /api/credentials/provision */
  const customTempPw = 'Temp#Seed9876!Ab';
  const provRes = await pcAdmin.run(`SYNC._json('api/credentials/provision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(${JSON.stringify({
      id: 'u-nurse-extra',
      username: 'nurse.extra',
      email: 'nurse.extra@lomamo.org',
      password: customTempPw,
      roleId: 'nurse',
      mustChange: true,
    })})
  })`);
  assert.equal(provRes.ok, true, 'Credential provisioning with official email must succeed');
  pcAdmin.run(`
    DB.db.users.push({
      id: 'u-nurse-extra', name: 'Extra County Nurse', username: 'nurse.extra',
      email: 'nurse.extra@lomamo.org', roleId: 'nurse', jobTitle: 'Clinical Nurse',
      departmentId: 'clinical', countyId: 'kisumu', areaIds: ['nyalenda'],
      status: 'active', active: true, mustChange: true
    });
    DB.save();
  `);
  await pcAdmin.run('SYNC.push()');

  /* ------------------------------------------------------------------
     4. Unauthenticated Tablet Sees Live Host Landing Theme + Staff Login + Zero-Wipe Sync
     ------------------------------------------------------------------ */
  const tabletA = makeHostedClient('tablet');
  await tabletA.run('boot()');
  assert.equal(tabletA.run('APPX.host && APPX.host.landingTheme'), 'canopy', '/api/health must expose landingTheme');
  assert.equal(tabletA.run('landingTheme().id'), 'canopy', 'Unauthenticated tablet must render host landingTheme immediately');

  /* Test password visibility toggle markup & handler on Sign-In screen */
  tabletA.run('APPX.screen = "login"; render();');
  const signInHtml = tabletA.run('document.querySelector("#root").innerHTML');
  assert.match(signInHtml, /data-act="toggle-pw"/, 'Sign-In screen must render Show/Hide password button');
  tabletA.run(`(() => {
    const inp = { type: 'password', focus(){} };
    const btn = { innerHTML: '', attrs: {}, setAttribute(k, v){ this.attrs[k] = v; }, closest(){ return { querySelector(){ return inp; } }; } };
    ACTIONS['toggle-pw']({}, btn);
    if (inp.type !== 'text' || btn.attrs['aria-label'] !== 'Hide password') throw new Error('toggle-pw failed to show');
    ACTIONS['toggle-pw']({}, btn);
    if (inp.type !== 'password' || btn.attrs['aria-label'] !== 'Show password') throw new Error('toggle-pw failed to hide');
  })()`);

  /* Official Email login works for newly provisioned account */
  const emailLoginRes = await apiFetch('api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'nurse.extra@lomamo.org', password: customTempPw }),
  });
  assert.equal(emailLoginRes.ok, true, 'Official email login must succeed for newly provisioned staff');

  /* Sign in as caregiver.nyalenda on Tablet A, complete first-login password change, verify RBAC & 3,333 patients */
  await tabletA.run(`FORMS.login6(__fd(${JSON.stringify({ username: 'caregiver.nyalenda', password: nyalendaEntry.tempPassword })}))`);
  assert.equal(tabletA.run('AUTH.mustChange'), true);
  const nyalendaPrivPw = 'River#Lake2027!Qw';
  await tabletA.run(`FORMS.mustchange6(__fd(${JSON.stringify({
    current: nyalendaEntry.tempPassword,
    password: nyalendaPrivPw,
    password2: nyalendaPrivPw,
  })}))`);
  assert.equal(tabletA.run('AUTH.mustChange'), false);
  assert.equal(tabletA.run('AUTH.user.status'), 'active', 'Staff user status must be active');
  assert.equal(tabletA.run('RBAC.can(AUTH.user, "patient.list").ok'), true, 'Caregiver must pass RBAC.can("patient.list")');
  assert.equal(tabletA.run('DB.db.patients.length'), 3333, 'Tablet A must hold all 3,333 patients');

  /* CRITICAL: Run SYNC.tick() and LIVE.start() when unchanged -> 0 shard reads, 3,333 patients preserved, no logout! */
  shardGets = 0;
  tabletA.run('LIVE.start()');
  assert.equal(tabletA.run('LIVE._timer'), null, 'LIVE must delegate to SYNC on hosted sessions without starting a duplicate 500ms timer');
  assert.equal(tabletA.run('LIVE.state'), 'live', 'LIVE indicator must reflect live SYNC state');
  await tabletA.run('SYNC.tick()');
  assert.equal(shardGets, 0, 'Unchanged SYNC.tick() must NOT download KV shards');
  assert.equal(tabletA.run('DB.db.patients.length'), 3333, 'SYNC.tick() must preserve all 3,333 patients');
  assert.equal(tabletA.run('Boolean(AUTH.user)'), true, 'Client must remain signed in across SYNC.tick()');

  /* Even if AUTH.user.id differed from db.users[i].id (e.g. u-chief-admin vs u-chief), LIVE.adopt must NOT logout */
  pcAdmin.run('AUTH.user = Object.assign({}, AUTH.user, { id: "u-chief-admin" });');
  await pcAdmin.run('SYNC.tick()');
  assert.equal(pcAdmin.run('Boolean(AUTH.user)'), true, 'Chief admin must never be logged out by id alias mismatch');
  assert.equal(pcAdmin.run('DB.db.patients.length'), 3333, 'PC Admin must keep all 3,333 patients across SYNC.tick()');

  /* ------------------------------------------------------------------
     5. Personal Theme, Studio Font & Custom Visual Pack Cloud Sync (Tablet A -> PC B)
     ------------------------------------------------------------------ */
  /* Verify all 20 workspace themes emit every required CSS variable */
  const allThemeIds = tabletA.run('WTHEMES.map(t => t.id)');
  assert.ok(allThemeIds.length >= 20, 'All 20 workspace themes must be present');
  for (const tid of allThemeIds) {
    const vars = tabletA.run(`WTHEME.vars(WTHEME.byId(${JSON.stringify(tid)}), '#0E7490', '')`);
    for (const reqVar of ['--text', '--text-2', '--text-3', '--border', '--border-strong', '--ok-bd', '--warn-bd', '--crit-bd', '--info-bd', '--surface', '--ink']) {
      assert.ok(vars[reqVar], `Theme ${tid} missing CSS variable ${reqVar}`);
    }
  }

  /* Verify openThemePicker('fonts') renders explicit Inter font-family (never inherit/null) on Default card */
  tabletA.run('openThemePicker("fonts")');
  const fontModalHtml = tabletA.nodes[tabletA.nodes.length - 1].innerHTML;
  assert.match(fontModalHtml, /Inter Institutional \(Default\)[\s\S]{0,180}font-family:&#39;Inter&#39;|font-family:'Inter'/, 'Default font preview must explicitly render Inter stack');
  tabletA.run('closeModal(true)');

  /* Tablet A caregiver chooses Harbour Dusk ('harbour'), Editorial font, and 110% textScale */
  tabletA.run(`
    WTHEME.choose(AUTH.user, 'harbour');
    WTHEME.setStudio(AUTH.user, 'font', 'editorial');
    DB.db.personalPrefs[AUTH.user.id].textScale = 110;
    DB.save();
    applyTheme();
  `);
  await tabletA.run('SYNC.push()');

  /* Pulling full state on Tablet A must NOT wipe personalPrefs */
  await tabletA.run('SYNC.pullFull()');
  assert.equal(tabletA.run('WTHEME.resolveId(AUTH.user)'), 'harbour', 'Personal theme must survive SYNC.pullFull()');
  assert.equal(tabletA.run('WTHEME.studio(AUTH.user).font'), 'editorial', 'Personal studio font must survive SYNC.pullFull()');

  /* Sign in as the SAME caregiver.nyalenda on a brand-new PC B -> personal theme & font sync from Cloud! */
  const pcCaregiverB = makeHostedClient('pc');
  await pcCaregiverB.run('boot()');
  await pcCaregiverB.run(`FORMS.login6(__fd(${JSON.stringify({ username: 'caregiver.nyalenda', password: nyalendaPrivPw })}))`);
  assert.equal(pcCaregiverB.run('WTHEME.resolveId(AUTH.user)'), 'harbour', 'Cloud personalPrefs must sync harbour theme to PC B');
  assert.equal(pcCaregiverB.run('WTHEME.studio(AUTH.user).font'), 'editorial', 'Cloud personalPrefs must sync editorial font to PC B');
  assert.equal(pcCaregiverB.run('DB.db.personalPrefs[AUTH.user.id].textScale'), 110, 'Cloud personalPrefs must sync textScale to PC B');
  assert.equal(pcCaregiverB.run('DB.db.patients.length'), 3333, 'PC B must also load all 3,333 patients');

  /* Install a Custom Visual Pack with a custom dark theme on Chief Admin PC -> rehydrates on Tablet A via SYNC.tick()! */
  const customPackRes = pcAdmin.run(`WTHEME.installCustomPack(AUTH.user, JSON.stringify({
    name: 'Lake Victoria Midnight Pack',
    version: '1.2',
    blurb: 'Custom midnight teal theme for Kisumu & Homa Bay.',
    theme: {
      name: 'Victoria Midnight',
      mode: 'dark',
      accent: '#14B8A6',
      brand: '#0F766E',
      gold: '#F59E0B',
      t: { bg: '#07171D', surface: '#0D242C', surface2: '#13313B', ink: '#F0FDFA', ink2: '#CCFBF1', muted: '#99F6E4', line: '#1E4652', line2: '#163842' }
    },
    config: { font: 'clinical', corners: 'round', backdrop: 'dots', hero: 'gradient', cards: 'lifted', kpiStyle: 'vivid' }
  }))`);
  assert.equal(customPackRes.ok, true, 'Custom visual pack with custom theme must install cleanly');
  const exportedJson = JSON.parse(pcAdmin.run('WTHEME.exportActivePack(AUTH.user)'));
  assert.ok(exportedJson.theme && exportedJson.theme.t, 'Exported custom pack must preserve custom theme tokens');
  await pcAdmin.run('SYNC.push()');

  /* Tablet A polls incremental delta via SYNC.tick() -> receives settings patch + rehydrates custom theme without losing 3,333 patients! */
  await tabletA.run('SYNC.tick()');
  assert.equal(tabletA.run('DB.db.patients.length'), 3333, 'Incremental settings patch on Tablet A must keep all 3,333 patients');
  const customThemeId = customPackRes.pack.config.wtheme;
  assert.ok(tabletA.run(`Boolean(WTHEME.byId(${JSON.stringify(customThemeId)}))`), 'Custom pack theme must rehydrate on Tablet A via WTHEME.syncCustomThemes()');

  /* ------------------------------------------------------------------
     6. Dark-Mode Hosted Session Lock & Online Unlock + ACT-* & EMG-* Code Redemption
     ------------------------------------------------------------------ */
  /* Lock Tablet A while in dark 'harbour' theme -> verify renderLocked() uses CSS variables (no #fff) and unlocks cleanly */
  tabletA.run('AUTH.session.last = Date.now() - 25 * 60 * 1000; SESSION.last = Date.now() - 880 * 1000; render();');
  assert.equal(tabletA.run('AUTH.locked()'), true, 'Session must lock after inactivity threshold');
  const lockedHtml = tabletA.run('document.querySelector("#root").innerHTML');
  assert.ok(!/background:#fff\b/i.test(lockedHtml), 'renderLocked() must not hardcode white background in dark themes');
  assert.match(lockedHtml, /var\(--surface/, 'renderLocked() must use theme surface token');

  /* Clear local device verifier to prove online fallback unlock works on hosted tablets */
  tabletA.run('Store.del("lomamo.auth.v6")');
  await tabletA.run(`FORMS.unlock(__fd(${JSON.stringify({ password: nyalendaPrivPw })}))`);
  assert.equal(tabletA.run('AUTH.locked()'), false, 'Hosted tablet session must unlock via online verification');
  assert.ok(tabletA.run('SESSION.idleSeconds()') < 5, 'Unlocking session must also reset SESSION idle timer');

  /* Issue an ACT-* code and an EMG-* code from Chief Admin, sync to cloud, and redeem both via public endpoints */
  pcAdmin.run(`
    DB.db.pendingActivations = DB.db.pendingActivations || [];
    DB.db.pendingActivations.push({
      id: 'act-test-1', username: 'nurse.extra', code: 'ACT-778899',
      used: false, expiresAt: new Date(Date.now() + 86400000).toISOString()
    });
    DB.db.emergencyCodes = DB.db.emergencyCodes || [];
    DB.db.emergencyCodes.push({
      id: 'emg-test-1', username: 'caregiver.nyalenda', code: 'EMG-4455',
      used: false, expiresAt: new Date(Date.now() + 86400000).toISOString()
    });
    DB.save();
  `);
  await pcAdmin.run('SYNC.push()');

  const nurseActivatedPw = 'Ward#Orbit2027!Safe9';
  const freshBrowser = makeHostedClient('tablet');
  await freshBrowser.run('boot()');
  await freshBrowser.run(`FORMS.activate6(__fd(${JSON.stringify({
    username: 'nurse.extra',
    code: 'ACT-778899',
    password: nurseActivatedPw,
    password2: nurseActivatedPw,
  })}))`);
  assert.match(freshBrowser.run('LOGIN6.notice'), /Account activated/i, 'ACT code redemption must succeed on hosted client');
  await freshBrowser.run(`FORMS.login6(__fd(${JSON.stringify({ username: 'nurse.extra@lomamo.org', password: nurseActivatedPw })}))`);
  assert.equal(freshBrowser.run('AUTH.user && AUTH.user.username'), 'nurse.extra', 'Activated account must sign in with new password via official email');
  assert.equal(freshBrowser.run('AUTH.mustChange'), false, 'ACT-redeemed account must have mustChange cleared');

  const emgNewPw = 'Solar#Peak2027!Safe8';
  const recBrowser = makeHostedClient('pc');
  await recBrowser.run('boot()');
  await recBrowser.run(`FORMS.emergency6(__fd(${JSON.stringify({
    username: 'caregiver.nyalenda',
    code: 'EMG-4455',
    password: emgNewPw,
  })}))`);
  assert.match(recBrowser.run('LOGIN6.notice'), /emergency code|Sign in now/i, 'EMG code redemption must succeed on hosted client');
  await recBrowser.run(`FORMS.login6(__fd(${JSON.stringify({ username: 'caregiver.nyalenda', password: emgNewPw })}))`);
  assert.equal(recBrowser.run('AUTH.user && AUTH.user.username'), 'caregiver.nyalenda', 'EMG-recovered account must sign in immediately with new password');

  console.log('client-login-and-themes-e2e: PC & Tablet login, ACT/EMG recovery, dark-mode unlock, zero-wipe live sync, personalPrefs cloud sync, 10 landing themes & custom visual packs passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
