/* ============================================================================
   v665-ux-nav-login-e2e.js — End-to-End Verification for CareLink v6.6.5:
   1. Default White Themes ('foundation' & 'heritage'), Zero White-Haze &
      Dominant Multi-Stop Spectrum Console Banners (all 17 depts & 29 roles)
   2. Fast, Error-Free Online Login on 3,333-Patient Sharded Upstash KV:
      - Zero shard reads on /api/auth/login (manifest head + authVault)
      - 2-request fastPack initial pull (zero 16-collection page walk)
      - Concurrent-write rev tolerance during pagedCollections (zero onlineWarning)
   3. 30 High-Contrast Workspace Themes (+10 new) & Expanded Studio Controls
   4. Strictly Role-Scoped Left Navigation Panes Across All 29 Roles
   5. Zero-Scroll Landing Page (1366x768+) & Deduplicated Action Controls
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const { makeCtx } = require('./dom');

process.env.KV_REST_API_URL = 'https://kv-v665.test';
process.env.KV_REST_API_TOKEN = 'v665-token';
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
  if (url.origin !== 'https://kv-v665.test') throw new Error('Unexpected fetch: ' + url.href);
  const rawBody = String(init.body || '');
  if (url.pathname.startsWith('/get/')) {
    const key = keyFromPath(url, '/get/');
    if (/(:s\d+|_s\d+)$/.test(key)) shardGets++;
    return kvResponse({ result: kv.has(key) ? kv.get(key) : null });
  }
  if (url.pathname.startsWith('/set/')) {
    const key = keyFromPath(url, '/set/');
    if (Buffer.byteLength(rawBody) > 1024 * 1024) {
      return kvResponse({ error: 'ERR max request size exceeded (1048576 bytes)' }, 413);
    }
    kv.set(key, rawBody);
    return kvResponse({ result: 'OK' });
  }
  if (url.pathname.startsWith('/del/')) {
    const key = keyFromPath(url, '/del/');
    kv.delete(key);
    return kvResponse({ result: 1 });
  }
  throw new Error('Unexpected KV path: ' + url.pathname);
};

const REPO = path.resolve(__dirname, '..', '..');
let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, detail = '') {
  if (cond) pass++;
  else { fail++; fails.push(name + (detail ? ' — ' + detail : '')); }
}

(async () => {
  const { run } = makeCtx();
  run('DB.load(); DB.seedOfficial({patients:180});');

  /* 1. Default White Themes, Zero White-Haze & Spectrum Console Banners */
  const defaults = JSON.parse(run(`JSON.stringify({
    wtDefault: WT_DEFAULT,
    devWtheme: WTHEME.resolveId(DB.db.users[0]),
    foundation: WTHEMES.find(t => t.id === 'foundation'),
    landingDefault: LANDING_THEMES[0],
    wthemeCount: WTHEMES.length,
    presetCount: STUDIO_PRESETS.length,
    packCount: INSTALLABLE_VISUAL_PACKS.length,
    studioKeys: Object.keys(STUDIO),
    accents: STUDIO.accentPick.opts.filter(o => o.v).map(o => o.v),
    auditFails: VISUALX.contrastAudit().filter(r => r.fails && r.fails.length > 0).length
  })`));

  ok('Default workspace theme is Foundation White across devices',
    defaults.wtDefault === 'foundation' && defaults.devWtheme === 'foundation' &&
    defaults.foundation && defaults.foundation.name === 'Foundation White' &&
    defaults.foundation.mode === 'light' && defaults.foundation.t.surface === '#FFFFFF');
  ok('Default landing theme is Heritage White (light mode)',
    defaults.landingDefault && defaults.landingDefault.id === 'heritage' &&
    defaults.landingDefault.name === 'Heritage White' && defaults.landingDefault.mode === 'light');
  ok('30 workspace themes (including 10 new themes) pass 100% of contrast audits',
    defaults.wthemeCount === 30 && defaults.auditFails === 0,
    `count=${defaults.wthemeCount}, auditFails=${defaults.auditFails}`);

  const newThemeIds = ['alabaster','vellum','glacier','pearl','coral','marigold','indigo','sage','obsidian','ruby'];
  const presentNew = JSON.parse(run(`JSON.stringify(${JSON.stringify(newThemeIds)}.filter(id => WTHEMES.some(t => t.id === id)))`));
  ok('All 10 newly added colour themes are registered', presentNew.length === 10, presentNew.join(','));

  ok('Studio customizations include bannerStyle, tabStyle, borderWeight, tableStripe, 15 accents, 12 presets & 10 visual packs',
    ['bannerStyle','tabStyle','borderWeight','tableStripe'].every(k => defaults.studioKeys.includes(k)) &&
    defaults.accents.length >= 15 && defaults.presetCount === 12 && defaults.packCount === 10);

  const css63 = fs.readFileSync(path.join(REPO, 'v6', 'src', 'carelink63.css'), 'utf8');
  const allRoles = JSON.parse(run(`JSON.stringify(ROLES.map(r => r.id))`));
  const allDepts = JSON.parse(run(`JSON.stringify(DEPARTMENTS.map(d => d.id))`));
  const missingRoleBanners = allRoles.filter(r => !css63.includes(`.topbar.cbar[data-role="${r}"]`));
  const missingDeptBanners = allDepts.filter(d => !css63.includes(`.topbar.cbar[data-dept="${d}"]`));
  ok('All 29 roles have dedicated spectrum .topbar.cbar banner palettes', missingRoleBanners.length === 0, missingRoleBanners.join(','));
  ok('All 17 departments have dedicated spectrum .topbar.cbar banner palettes', missingDeptBanners.length === 0, missingDeptBanners.join(','));
  ok('Dominant console banner uses large bold console identity typography (>=18px)',
    /\.topbar\.cbar\s+h1\{[\s\S]{0,240}clamp\(18px/.test(css63));

  /* 2. Zero-Scroll Landing Page (1366x768+) & Zero Duplicate Action Controls */
  const css6 = fs.readFileSync(path.join(REPO, 'v6', 'src', 'console6.css'), 'utf8');
  ok('Landing CSS keeps 100dvh zero-scroll on 1366x768 laptops (unlocks only below 860px / 560px)',
    !/@media\s*\(max-height:820px\)/.test(css6) && /@media\s*\(max-width:860px\),\s*\(max-height:560px\)/.test(css6));

  const landingHtml = String(run('renderLanding6()'));
  const actMatches = [...landingHtml.matchAll(/data-act="([^"]+)"/g)].map(m => m[1]);
  const actCounts = actMatches.reduce((acc, a) => ((acc[a] = (acc[a] || 0) + 1), acc), {});
  const dupActs = Object.entries(actCounts).filter(([, n]) => n > 1);
  ok('Landing page has zero duplicate action tabs/buttons and zero .ld-spark overflow row',
    dupActs.length === 0 && !landingHtml.includes('class="ld-spark"') &&
    actCounts['goto-login'] === 1 && actCounts['goto-architecture'] === 1 && actCounts['goto-public'] === 1,
    JSON.stringify(actCounts));

  /* 3. Strict Role-Scoped Left Navigation Panes Across All 29 Roles */
  const navAudit = JSON.parse(run(`JSON.stringify((()=>{
    const byRole = roleId => DB.db.users.find(u => u.roleId === roleId);
    const idsFor = u => navModel(u).flatMap(g => g.items.map(i => i.id));
    const dir = byRole('director'), cg = byRole('caregiver'), mcm = byRole('mcm'),
          fin = byRole('finance'), hr = byRole('hr'), med = byRole('mediahead'),
          ccc = byRole('ccc.clinician'), gov = byRole('gov.partner');
    const dirIds = idsFor(dir), cgIds = idsFor(cg),
          finIds = idsFor(fin), hrIds = idsFor(hr), medIds = idsFor(med),
          cccIds = idsFor(ccc), govIds = idsFor(gov);

    let awkwardLabels = [];
    const seen = new Set();
    for (const u of DB.db.users) {
      if (seen.has(u.roleId)) continue;
      seen.add(u.roleId);
      for (const g of NAVP.groups(u)) {
        const disp = g.displayLabel || g.label;
        if (disp.includes('·') || /\\/\\s*(Home|Smart|Drafts|Preferences)/.test(g.items.map(x=>x.label).join(' '))) {
          awkwardLabels.push(u.roleId + ':' + disp);
        }
      }
    }

    const cgClone = Object.assign({}, cg, { permOverrides: { grant: ['finance.view'], revoke: [] } });
    const cgGrantedFinance = idsFor(cgClone).includes('finance');

    return {
      cgNoExecOrFinOrHr: !cgIds.includes('executive') && !cgIds.includes('finance') && !cgIds.includes('staff') && !cgIds.includes('governance') && !cgIds.includes('pivot'),
      dirNoCaregiverRouteOrSoap: !dirIds.includes('visitplan') && !dirIds.includes('clinicalmcm') && !dirIds.includes('pharmacy'),
      finScoped: finIds.includes('finance') && !finIds.includes('patients') && !finIds.includes('clinicalmcm') && !finIds.includes('staff'),
      hrScoped: hrIds.includes('staff') && !hrIds.includes('patients') && !hrIds.includes('finance') && !hrIds.includes('clinicalmcm'),
      medScoped: medIds.includes('media') && medIds.includes('consent') && !medIds.includes('patients') && !medIds.includes('finance') && !medIds.includes('staff'),
      cccScoped: cccIds.includes('cccdesk') && !cccIds.includes('finance') && !cccIds.includes('staff'),
      govScoped: govIds.includes('govdashboard') && !govIds.includes('patients') && !govIds.includes('messages') && !govIds.includes('drafts'),
      dirVsCgDistinctFirstGroup: (NAVP.groups(dir)[0].displayLabel !== NAVP.groups(cg)[0].displayLabel),
      awkwardLabels,
      cgGrantedFinance
    };
  })())`));

  ok('Caregiver left pane excludes executive, finance, HR roster, governance & pivot modules', navAudit.cgNoExecOrFinOrHr);
  ok('Country Director left pane focuses on national governance and excludes caregiver route learner & SOAP/pharmacy entry', navAudit.dirNoCaregiverRouteOrSoap);
  ok('Finance, HR, Media, CCC Clinician & Gov Partner panes each show only role-scoped modules',
    navAudit.finScoped && navAudit.hrScoped && navAudit.medScoped && navAudit.cccScoped && navAudit.govScoped,
    JSON.stringify(navAudit));
  ok('All 29 roles use bespoke domain-accurate category & item labels with zero generic fallbacks',
    navAudit.awkwardLabels.length === 0 && navAudit.dirVsCgDistinctFirstGroup,
    navAudit.awkwardLabels.join(', '));
  ok('Explicit capability grants (permOverrides/delegations) cleanly unlock excluded views when authorised',
    navAudit.cgGrantedFinance === true);

  /* 4. Fast, Error-Free Online Login on 3,333-Patient Sharded Upstash KV */
  const { default: handler } = await import('../../api/index.js');

  async function rawApiFetch(url, opts = {}) {
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

  function makeHostedClient(customFetch = rawApiFetch, withWebStreams = true) {
    const streamGlobals = withWebStreams ? { Blob, Response, DecompressionStream, atob, btoa, Uint8Array } : {};
    const c = makeCtx(Object.assign({
      location: { hash: '#/', search: '', pathname: '/carelink-v6.html', protocol: 'https:', hostname: 'carelink.test', origin: 'https://carelink.test' },
      navigator: { userAgent: 'Mozilla/5.0 Chrome/126.0.0.0 Safari/537.36', clipboard: { writeText: async () => {} }, maxTouchPoints: 0 },
      fetch: customFetch,
      performance: { now: () => Date.now() },
    }, streamGlobals));
    c.ctx.__fd = fields => ({ get: k => (k in fields ? fields[k] : null) });
    return c;
  }

  const pcAdmin = makeHostedClient();
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
  ok('4-step commissioning succeeds on Upstash KV', commissioned.cloudVerified === true);

  await pcAdmin.run(`FORMS.login6(__fd(${JSON.stringify({ username: 'system.admin', password: chiefTempPw })}))`);
  const chiefPrivPw = 'Safe#Vault2027!Xy9';
  await pcAdmin.run(`FORMS.mustchange6(__fd(${JSON.stringify({
    current: chiefTempPw,
    password: chiefPrivPw,
    password2: chiefPrivPw,
    autoFeedCloudMaster: '1',
  })}))`);
  ok('Chief auto-feed populates all 3,333 patients across sharded Upstash KV',
    pcAdmin.run('DB.db.patients.length') === 3333 && kv.size >= 2, `kvKeys=${[...kv.keys()].join(',')}`);

  const actPack = await pcAdmin.run('PROD_SETUP.activateSystemGlobally(AUTH.user)');
  const cgCred = actPack.rows.find(e => e.username === 'caregiver.nyalenda');
  ok('Global activation issues staff credentials across all active accounts', Boolean(cgCred && cgCred.tempPassword));

  /* 4a. Verify /api/auth/login reads ONLY manifest head (0 shard GETs!) */
  shardGets = 0;
  const authOnly = await rawApiFetch('api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'system.admin', password: chiefPrivPw })
  });
  const authBody = await authOnly.json();
  ok('POST /api/auth/login authenticates from sharded manifest head with ZERO shard reads',
    authOnly.ok === true && Boolean(authBody.token) && shardGets === 0, `shardGets=${shardGets}`);

  /* 4b. Verify fresh browser client logs in via 2-part fastPack (zero 16-collection page walk, zero onlineWarning) */
  const fastRequests = [];
  const fastTablet = makeHostedClient(async (u, opts) => {
    fastRequests.push(String(u));
    return rawApiFetch(u, opts);
  });
  await fastTablet.run('boot()');
  fastRequests.length = 0;
  const fastLoginRes = JSON.parse(await fastTablet.run(`AUTH.loginOnline('system.admin', ${JSON.stringify(chiefPrivPw)}).then(r => JSON.stringify({
    ok: r.ok, warn: r.onlineWarning || '', syncState: SYNC.state, patients: DB.db.patients.length
  }))`));
  const pageWalkCalls = fastRequests.filter(u => u.includes('api/state/collection'));
  ok('Fresh client login loads all 3,333 patients via fastPack with zero collection-page walk and zero onlineWarning',
    fastLoginRes.ok === true && fastLoginRes.warn === '' && fastLoginRes.patients === 3333 && pageWalkCalls.length === 0,
    JSON.stringify({ fastLoginRes, fastRequests }));

  /* 4c. Verify pagedCollections fallback tolerates concurrent tablet write incrementing rev mid-pull with ZERO onlineWarning */
  let injectedMidPullWrite = false;
  const pagedPc = makeHostedClient(async (u, opts) => {
    const urlStr = String(u);
    if (urlStr.includes('api/state/collection?') && !injectedMidPullWrite) {
      injectedMidPullWrite = true;
      pcAdmin.run(`
        DB.db.concerns = DB.db.concerns || [];
        DB.db.concerns.push({ id: 'conc-midpull-v665', patientId: DB.db.patients[0].id, status: 'open', note: 'Saved concurrently during login' });
        DB.save();
      `);
      await pcAdmin.run('SYNC.push()');
    }
    return rawApiFetch(urlStr, opts);
  }, false);
  await pagedPc.run('boot()');
  const pagedLoginRes = JSON.parse(await pagedPc.run(`(async () => {
    const r = await AUTH.loginOnline('system.admin', ${JSON.stringify(chiefPrivPw)});
    if (SYNC._pushPromise) await SYNC._pushPromise;
    return JSON.stringify({
      ok: r.ok, warn: r.onlineWarning || '', syncState: SYNC.state, patients: DB.db.patients.length,
      hasConcurrentConcern: (DB.db.concerns || []).some(c => c.id === 'conc-midpull-v665')
    });
  })()`));
  ok('Concurrent write mid-login does NOT fail online state load and catches up cleanly via delta merge',
    pagedLoginRes.ok === true && pagedLoginRes.warn === '' &&
    ['connected', 'merge'].includes(pagedLoginRes.syncState) &&
    pagedLoginRes.patients === 3333 && pagedLoginRes.hasConcurrentConcern === true,
    JSON.stringify(pagedLoginRes));

  if (fails.length) {
    console.error('v665-ux-nav-login-e2e FAILED:\n  ✗ ' + fails.join('\n  ✗ '));
    process.exit(1);
  }
  console.log(`v665-ux-nav-login-e2e: all ${pass} assertions passed`);
})();
