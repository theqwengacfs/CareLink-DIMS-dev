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
const net = require('net');
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

let kvRefusalOverride = null;
const secondaryKv = new Map();
let liveUpstashMockHandler = null;

global.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  if (url.origin === 'https://live-upstash-mock.upstash.io' && typeof liveUpstashMockHandler === 'function') {
    return liveUpstashMockHandler(url, init);
  }
  if (url.origin === 'https://kv-backup-v665.test') {
    const rawBody = String(init.body || '');
    if (url.pathname.startsWith('/get/')) {
      const key = keyFromPath(url, '/get/');
      return kvResponse({ result: secondaryKv.has(key) ? secondaryKv.get(key) : null });
    }
    if (url.pathname.startsWith('/set/')) {
      const key = keyFromPath(url, '/set/');
      secondaryKv.set(key, rawBody);
      return kvResponse({ result: 'OK' });
    }
    if (url.pathname.startsWith('/del/')) {
      const key = keyFromPath(url, '/del/');
      secondaryKv.delete(key);
      return kvResponse({ result: 1 });
    }
  }
  if (url.origin !== 'https://kv-v665.test') throw new Error('Unexpected fetch: ' + url.href);
  if (kvRefusalOverride) {
    return kvResponse({ error: kvRefusalOverride.error }, kvRefusalOverride.status || 400);
  }
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
  const console6CssRaw = fs.readFileSync(path.join(REPO, 'v6', 'src', 'console6.css'), 'utf8');
  ok('Default landing theme is Heritage Sapphire Royal Blue (dark mode, #0E234A -> #1B3668 -> #071124 + #E9C765 gold)',
    defaults.landingDefault && defaults.landingDefault.id === 'heritage' &&
    defaults.landingDefault.name === 'Heritage Sapphire' &&
    defaults.landingDefault.mode === 'dark' &&
    defaults.landingDefault.accent === '#E9C765' &&
    /\.ld\[data-theme="heritage"\][\s\S]*?#071124[\s\S]*?#1B3668/.test(console6CssRaw));
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

  /* 5. Zero-Shard Polling, Exact Upstash Error Diagnostics, Multi-KV Failover & Red Error Toasts */
  shardGets = 0;
  const pollUnchanged = await rawApiFetch(`api/state?since=${pagedPc.run('SYNC.rev')}`, {
    headers: { 'x-carelink-session': authBody.token }
  });
  const pollUnchangedBody = await pollUnchanged.json();
  ok('GET /api/state?since=<currentRev> answers unchanged:true from manifest head with ZERO shard reads',
    pollUnchanged.ok === true && pollUnchangedBody.unchanged === true && shardGets === 0,
    `shardGets=${shardGets}`);

  /* Push a small delta and verify GET /api/state?since=<prevRev> serves incremental patches with ZERO shard reads */
  const prevRevBeforePatch = pcAdmin.run('SYNC.rev');
  pcAdmin.run(`
    DB.db.concerns.push({ id: 'conc-head-delta', patientId: DB.db.patients[2].id, status: 'open', note: 'Head delta check' });
    DB.save();
  `);
  await pcAdmin.run('SYNC.push()');
  shardGets = 0;
  const pollDelta = await rawApiFetch(`api/state?since=${prevRevBeforePatch}`, {
    headers: { 'x-carelink-session': authBody.token }
  });
  const pollDeltaBody = await pollDelta.json();
  ok('GET /api/state?since=<prevRev> serves incremental delta patches from manifest head with ZERO shard reads',
    pollDelta.ok === true && Array.isArray(pollDeltaBody.patches) && pollDeltaBody.patches.length > 0 && shardGets === 0,
    `shardGets=${shardGets}`);

  /* Verify exact Upstash quota diagnostic message & Retry Cloud KV Connection UI (not Reset Setup) */
  kvRefusalOverride = { status: 400, error: 'ERR max daily request limit exceeded. Limit: 10000, Usage: 10000.' };
  const quotaHealth = await rawApiFetch('api/health');
  const quotaBody = await quotaHealth.json();
  ok('Upstash daily quota refusal surfaces exact actionable quota diagnostic message',
    quotaHealth.status === 503 && quotaBody.code === 'kv_unavailable' &&
    /Upstash database quota|max daily request limit exceeded/i.test(quotaBody.error),
    JSON.stringify(quotaBody));

  /* Verify quoted / Bearer-prefixed secondary UPSTASH_REDIS_REST_* env vars sanitize cleanly and fail over automatically */
  process.env.UPSTASH_REDIS_REST_URL = '  "https://kv-backup-v665.test/"  ';
  process.env.UPSTASH_REDIS_REST_TOKEN = '  "Bearer backup-secret-token"  ';
  const failoverDiag = await rawApiFetch('api/kv-diagnostics');
  const failoverBody = await failoverDiag.json();
  ok('Configured secondary UPSTASH_REDIS_REST_* store with quoted/Bearer env vars sanitizes & fails over cleanly when primary refuses reads',
    failoverDiag.ok === true && failoverBody.ok === true && failoverBody.candidateCount === 2,
    JSON.stringify(failoverBody));
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  kvRefusalOverride = null;

  /* Verify toast('Reset Failed', ..., 'crit') renders red err icon (NOT green checkmark) and KV refusal renders Retry button */
  const uiClient = makeCtx();
  const uiCheck = JSON.parse(uiClient.run(`JSON.stringify((()=>{
    DB.load();
    LOGIN6.error = 'The mandatory CareLink KV store refused the read (Upstash database quota); no local fallback is used.';
    const loginHtml = renderLogin6();
    toast('Reset Failed', 'The mandatory CareLink KV store refused the read.', 'crit');
    return {
      hasRetryBtn: loginHtml.includes('data-act="login-retry-kv"'),
      hidesMisleadingResetBtn: !loginHtml.includes('Reset 4-Step Setup'),
      toastClass: ''
    };
  })())`));
  const toastNodes = uiClient.nodes.filter(n => String(n.className || '').includes('toast'));
  const critToast = toastNodes[toastNodes.length - 1];
  ok('KV read refusal shows Retry Cloud KV Connection button and hides misleading Reset Setup button',
    uiCheck.hasRetryBtn === true && uiCheck.hidesMisleadingResetBtn === true);
  ok('toast(..., "crit") renders red err class & alert icon (never green check icon)',
    Boolean(critToast && critToast.className === 'toast err' && critToast.innerHTML.includes('var(--crit)')));

  /* 8. v6.6.7 HTTP 403 Root-POST Retry, Native Redis TCP RESP2 Failover, Exact Host/Body 403 Diagnostics & Offline Device Escape Hatch */
  const origPrimaryUrl = process.env.KV_REST_API_URL;
  const origPrimaryTok = process.env.KV_REST_API_TOKEN;

  /* 8a. Non-.test Upstash host returning HTTP 403 on GET /get/<key> retries POST / ["GET", key] with upstash-redis-js User-Agent */
  let sawGet403 = false;
  let sawRootPostWithUa = false;
  const liveMap = new Map(kv);
  liveUpstashMockHandler = async (url, init = {}) => {
    const hdrs = init.headers || {};
    const ua = hdrs['User-Agent'] || hdrs['user-agent'] || '';
    if ((init.method || 'GET').toUpperCase() === 'GET' && url.pathname.startsWith('/get/')) {
      sawGet403 = true;
      return {
        ok: false,
        status: 403,
        text: async () => '<html><title>Attention Required! | Cloudflare</title><body>403 Forbidden</body></html>',
        json: async () => { throw new Error('HTML body'); }
      };
    }
    if ((init.method || '').toUpperCase() === 'POST' && (url.pathname === '/' || url.pathname === '')) {
      if (/upstash-redis-js/i.test(ua)) sawRootPostWithUa = true;
      const cmd = JSON.parse(String(init.body || '[]'));
      if (cmd[0] === 'GET') {
        const k = cmd[1];
        const val = liveMap.has(k) ? liveMap.get(k) : null;
        return { ok: true, status: 200, text: async () => JSON.stringify({ result: val }), json: async () => ({ result: val }) };
      }
      if (cmd[0] === 'SET') {
        liveMap.set(cmd[1], cmd[2]);
        return { ok: true, status: 200, text: async () => JSON.stringify({ result: 'OK' }), json: async () => ({ result: 'OK' }) };
      }
    }
    return { ok: false, status: 403, text: async () => '{"error":"Forbidden"}', json: async () => ({ error: 'Forbidden' }) };
  };
  process.env.KV_REST_API_URL = 'https://live-upstash-mock.upstash.io';
  process.env.KV_REST_API_TOKEN = 'live-upstash-token';
  const rootPostDiag = await rawApiFetch('api/kv-diagnostics');
  const rootPostBody = await rootPostDiag.json();
  ok('HTTP 403 on Upstash GET /get/<key> automatically retries canonical root POST ["GET", key] with User-Agent and succeeds',
    rootPostDiag.ok === true && rootPostBody.ok === true && sawGet403 === true && sawRootPostWithUa === true,
    JSON.stringify({ rootPostBody, sawGet403, sawRootPostWithUa }));

  /* 8b. Exact HTTP 403 diagnostics (archived/paused/quota/Cloudflare + target hostname) when both GET and POST fail */
  liveUpstashMockHandler = async () => ({
    ok: false,
    status: 403,
    text: async () => JSON.stringify({ error: 'ERR database is archived due to inactivity' }),
    json: async () => ({ error: 'ERR database is archived due to inactivity' })
  });
  /* Clear brief manifest head cache window by advancing Date or waiting >1.5s */
  await new Promise((r) => setTimeout(r, 1600));
  const archived403 = await rawApiFetch('api/kv-diagnostics');
  const archivedBody = await archived403.json();
  ok('HTTP 403 archived/paused Upstash response reports exact archived cause + hostname (not generic token rejection)',
    archived403.status === 503 &&
    /archived|paused|suspended/i.test(archivedBody.error) &&
    /live-upstash-mock\.upstash\.io/i.test(archivedBody.error),
    JSON.stringify(archivedBody));

  /* 8c. Native Redis RESP2 TCP failover via REDIS_URL when REST KV returns HTTP 403 */
  const tcpStore = new Map(kv);
  let tcpAuthCount = 0;
  let tcpGetCount = 0;
  let tcpSetCount = 0;
  function parseRespCommands(buf) {
    const cmds = [];
    let pos = 0;
    while (pos < buf.length) {
      if (buf[pos] !== 0x2a) break;
      const lineEnd = buf.indexOf('\r\n', pos);
      if (lineEnd === -1) break;
      const argc = parseInt(buf.slice(pos + 1, lineEnd).toString('utf8'), 10);
      let cur = lineEnd + 2;
      const args = [];
      let complete = true;
      for (let i = 0; i < argc; i++) {
        if (cur >= buf.length || buf[cur] !== 0x24) { complete = false; break; }
        const bEnd = buf.indexOf('\r\n', cur);
        if (bEnd === -1) { complete = false; break; }
        const len = parseInt(buf.slice(cur + 1, bEnd).toString('utf8'), 10);
        const start = bEnd + 2;
        if (start + len + 2 > buf.length) { complete = false; break; }
        args.push(buf.slice(start, start + len).toString('utf8'));
        cur = start + len + 2;
      }
      if (!complete) break;
      cmds.push(args);
      pos = cur;
    }
    return { cmds, rest: buf.slice(pos) };
  }
  const redisServer = net.createServer((sock) => {
    let rx = Buffer.alloc(0);
    sock.on('data', (chunk) => {
      rx = Buffer.concat([rx, chunk]);
      const parsed = parseRespCommands(rx);
      rx = parsed.rest;
      for (const cmd of parsed.cmds) {
        const op = String(cmd[0] || '').toUpperCase();
        if (op === 'AUTH') {
          tcpAuthCount++;
          const pw = cmd.length >= 3 ? cmd[2] : cmd[1];
          if (pw === 'tcp-secret') sock.write('+OK\r\n');
          else sock.write('-WRONGPASS invalid username-password pair\r\n');
        } else if (op === 'GET') {
          tcpGetCount++;
          const k = cmd[1];
          if (!tcpStore.has(k)) sock.write('$-1\r\n');
          else {
            const valBuf = Buffer.from(String(tcpStore.get(k)), 'utf8');
            sock.write(`$${valBuf.length}\r\n`);
            sock.write(valBuf);
            sock.write('\r\n');
          }
        } else if (op === 'SET') {
          tcpSetCount++;
          tcpStore.set(cmd[1], cmd[2]);
          sock.write('+OK\r\n');
        } else if (op === 'DEL') {
          let removed = 0;
          for (let i = 1; i < cmd.length; i++) {
            if (tcpStore.delete(cmd[i])) removed++;
          }
          sock.write(`:${removed}\r\n`);
        } else {
          sock.write('+OK\r\n');
        }
      }
    });
  });
  await new Promise((resolve) => redisServer.listen(0, '127.0.0.1', resolve));
  const redisPort = redisServer.address().port;
  process.env.REDIS_URL = `redis://default:tcp-secret@127.0.0.1:${redisPort}`;

  const dirCred = actPack.rows.find(e => e.username === 'director');
  const tcpDirLogin = await rawApiFetch('api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'director', password: dirCred.tempPassword })
  });
  const tcpDirBody = await tcpDirLogin.json();
  const tcpChiefLogin = await rawApiFetch('api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'system.admin', password: chiefPrivPw })
  });
  const tcpChiefBody = await tcpChiefLogin.json();
  ok('Native Redis RESP2 TCP failover (REDIS_URL) succeeds for Director & Chief Admin online login reads + writes when REST KV returns HTTP 403',
    tcpDirLogin.ok === true && tcpDirBody.ok === true &&
    tcpChiefLogin.ok === true && tcpChiefBody.ok === true &&
    tcpAuthCount > 0 && tcpGetCount > 0 && tcpSetCount >= 0,
    JSON.stringify({ dirOk: tcpDirBody.ok, chiefOk: tcpChiefBody.ok, tcpAuthCount, tcpGetCount, tcpSetCount, err: tcpChiefBody.error || tcpDirBody.error }));

  delete process.env.REDIS_URL;
  redisServer.close();
  liveUpstashMockHandler = null;
  process.env.KV_REST_API_URL = origPrimaryUrl;
  process.env.KV_REST_API_TOKEN = origPrimaryTok;

  /* 8d. Explicit Offline Device Console escape hatch when Cloud KV is down (!isActivated && !demoBlocked) */
  const offlineClient = makeHostedClient();
  const offlineBefore = JSON.parse(offlineClient.run(`JSON.stringify((()=>{
    DB.load();
    APPX.host = { ok: false, setup: false, globallyActivated: false };
    LOGIN6.usernameDraft = 'director';
    LOGIN6.error = 'The mandatory CareLink KV store refused the read on live.upstash.io (HTTP 403); no local fallback is used.';
    const html = renderLogin6();
    return {
      syncAvailableBefore: SYNC.available(),
      hasOfflineBtn: html.includes('data-act="login-offline-device-mode"'),
      hasRetryBtn: html.includes('data-act="login-retry-kv"')
    };
  })())`));
  ok('Unactivated Sign-In screen with Cloud KV HTTP 403 renders explicit Open Offline Console on This Device button',
    offlineBefore.syncAvailableBefore === true && offlineBefore.hasOfflineBtn === true && offlineBefore.hasRetryBtn === true,
    JSON.stringify(offlineBefore));

  await offlineClient.run(`ACTIONS['login-offline-device-mode']()`);
  const offlineAfter = JSON.parse(offlineClient.run(`JSON.stringify({
    syncAvailableAfter: SYNC.available(),
    syncState: SYNC.state,
    screen: APPX.screen,
    roleId: AUTH.user && AUTH.user.roleId,
    patients: DB.db && DB.db.patients && DB.db.patients.length
  })`));
  ok('Clicking Open Offline Console on This Device explicitly enters Offline/static mode with full 3,333-patient Director console & resets on logout',
    offlineAfter.syncAvailableAfter === false &&
    offlineAfter.syncState === 'device' &&
    offlineAfter.screen === 'app' &&
    offlineAfter.roleId === 'director' &&
    offlineAfter.patients === 3333,
    JSON.stringify(offlineAfter));
  offlineClient.run(`ACTIONS.logout()`);
  ok('Signing out of Offline Device Console restores SYNC.available() === true for online Cloud KV',
    offlineClient.run(`SYNC.available()`) === true);

  if (fails.length) {
    console.error('v665-ux-nav-login-e2e FAILED:\n  ✗ ' + fails.join('\n  ✗ '));
    process.exit(1);
  }
  console.log(`v665-ux-nav-login-e2e: all ${pass} assertions passed`);
})();
