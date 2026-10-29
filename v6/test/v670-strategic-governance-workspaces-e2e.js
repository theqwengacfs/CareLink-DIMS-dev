/* ============================================================================
   v670-strategic-governance-workspaces-e2e.js — End-to-End Verification for
   CareLink C-DIMS v6.7.0 (5-Pillar Overhaul):
   1. LOMAMO Strategic Plan (2025–2029) & Live Programme Alignment Scorecard
   2. CareLink Governance Charter, 8 Adopted Institutional Policies, Strict
      Non-Publication Guard & Kenya Data Protection Act (2019) HIV Safeguards
   3. Decongested 6-Archetype Departmental Consoles + 100% Zero White-Out Text
   4. Distinct 5-Tier Banner & Bar Visual / Typographic Hierarchy
   5. Smooth Logins & Online-Safe Seamless Account Switching (Pre- & Post-Activation)
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const { makeCtx } = require('./dom');

process.env.KV_REST_API_URL = 'https://kv-v670.test';
process.env.KV_REST_API_TOKEN = 'v670-token';
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const kv = new Map();
function kvResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body), json: async () => body };
}
function keyFromPath(url, prefix) {
  return decodeURIComponent(url.pathname.slice(prefix.length));
}

global.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  if (url.origin !== 'https://kv-v670.test') throw new Error('Unexpected fetch: ' + url.href);
  const rawBody = String(init.body || '');
  if (url.pathname.startsWith('/get/')) {
    const key = keyFromPath(url, '/get/');
    return kvResponse({ result: kv.has(key) ? kv.get(key) : null });
  }
  if (url.pathname.startsWith('/set/')) {
    const key = keyFromPath(url, '/set/');
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
  run('DB.load(); DB.seedDemo();');

  /* ==========================================================================
     PILLAR 1: Strategic Plan (2027–2031) & Live Programme Alignment
     ========================================================================== */
  const spAudit = JSON.parse(run(`JSON.stringify((() => {
    const dir = DB.db.users.find(u => u.username === 'director');
    const me = DB.db.users.find(u => u.username === 'me.kisumu');
    const metrics = STRATEGIC_PLAN.computeLiveMetrics(dir);
    const execHtml = renderExecutive(dir);
    const targetsHtml = renderTargets(me);
    const polStrategic = CARELINK_GOVERNANCE.renderGovernancePolicyCenter(dir, { tab: 'strategic' });
    const y2031 = (STRATEGIC_PLAN.ROADMAP || []).find(r => /2031/.test(r.year));
    const hbSeq = (STRATEGIC_PLAN.EXPANSION && STRATEGIC_PLAN.EXPANSION.homaBaySequence || []).map(x => x.subCounty);
    const ksmNext = (STRATEGIC_PLAN.EXPANSION && STRATEGIC_PLAN.EXPANSION.kisumuNextSubCounties || []);
    return {
      horizon: STRATEGIC_PLAN.horizon,
      pillarCount: STRATEGIC_PLAN.PILLARS.length,
      pillarCodes: STRATEGIC_PLAN.PILLARS.map(p => p.code),
      frameworkCount: STRATEGIC_PLAN.alignedFrameworks.length,
      roadmapOk: Boolean(y2031 && y2031.enrolled === 3703 && y2031.caregivers === 74 && y2031.totalDischarged === 3330),
      expansionOk: ksmNext.length === 4 && hbSeq.length === 7 && hbSeq[0] === 'Karachuonyo' && hbSeq[6] === 'Ndhiwa',
      meIndicatorsCount: (STRATEGIC_PLAN.ANNUAL_ME_INDICATORS || []).length,
      metricsOk: metrics.totalPatients > 0 && metrics.corePct >= 80,
      inExec: execHtml.includes('sp67-card') && execHtml.includes('2027–2031 STRATEGIC PLAN'),
      inTargets: targetsHtml.includes('sp67-card'),
      inPolicy: /Section 10\.1 Annual M&(amp;)?E Reporting Indicators/.test(polStrategic) && polStrategic.includes('KAISF 2025–2030')
    };
  })())`));

  ok('Strategic Plan (2027–2031) defines all 6 LOMAMO strategic pillars (SP-1..SP-6), 2025→2031 trajectory (3,703 active, 74 caregivers, 3,330/yr discharged), Kisumu+Homa Bay sub-county sequence & 7 annual M&E indicators',
    spAudit.horizon === '2027–2031 Strategic Plan' &&
    spAudit.pillarCount === 6 &&
    spAudit.pillarCodes.join(',') === 'SP-1,SP-2,SP-3,SP-4,SP-5,SP-6' &&
    spAudit.roadmapOk &&
    spAudit.expansionOk &&
    spAudit.meIndicatorsCount === 7, JSON.stringify(spAudit));
  ok('Strategic Plan (2027–2031) scorecard computes live metrics and renders in Executive Summary, Targets & Governance Charter',
    spAudit.metricsOk && spAudit.inExec && spAudit.inTargets && spAudit.inPolicy, JSON.stringify(spAudit));

  /* ==========================================================================
     PILLAR 2: CareLink Governance, 8 Adopted Policies, Non-Publication Guard
               & Kenya Data Protection Act (2019) HIV/Health Safeguards
     ========================================================================== */
  const govAudit = JSON.parse(run(`JSON.stringify((() => {
    const dir = DB.db.users.find(u => u.username === 'director');
    const med = DB.db.users.find(u => u.username === 'media.head');
    const mcm = DB.db.users.find(u => u.username === 'mcm.kisumu');
    const hr = DB.db.users.find(u => u.username === 'hr.officer');
    const fin = DB.db.users.find(u => u.username === 'finance.kisumu');

    const kb3 = DB.db.kbDocs.find(d => d.id === 'kb3');
    const charterHtml = renderPolicy(med);
    const dpaTabHtml = CARELINK_GOVERNANCE.renderGovernancePolicyCenter(dir, { tab: 'dpa' });
    const legalTabHtml = CARELINK_GOVERNANCE.renderGovernancePolicyCenter(dir, { tab: 'legal' });
    const vaultTabHtml = CARELINK_GOVERNANCE.renderGovernancePolicyCenter(dir, { tab: 'vault' });
    const mediaHomeHtml = mediaHome(med).join('');

    /* Verify sensitive clinical/HIV views emit Kenya DPA-2019 banner */
    const dpaOnPatients = CARELINK_GOVERNANCE.dpaBannerHTML('patients', mcm);
    const dpaOnCcc = CARELINK_GOVERNANCE.dpaBannerHTML('cccdesk', mcm);
    const dpaOnConsent = CARELINK_GOVERNANCE.dpaBannerHTML('consent', med);
    const dpaOnFinance = CARELINK_GOVERNANCE.dpaBannerHTML('finance', fin);

    /* Open DPA Modal */
    AUTH.user = mcm;
    ACTIONS['open-dpa-statement']();
    const modalHtml = (modalStack && modalStack.length ? modalStack.map(m => m.innerHTML || '').join('') : '') + (document.body ? document.body.innerHTML : '');
    closeAllModals(true);

    /* Strict Non-Publication Guard: Public portal items must NEVER contain internal policy docs or patient PII */
    const pubItems = (typeof PUBLIC !== 'undefined' && PUBLIC.publicItems) ? PUBLIC.publicItems() : (DB.db.publications || []).filter(p => p.public && p.status === 'published');
    const leakedInternalInPublic = pubItems.some(p => /Employee Handbook|Delegation Plan|Audited Account|CCC\\\/9|Safeguarding Policy/i.test(JSON.stringify(p)));

    /* Strict HIV/Clinical RBAC isolation */
    const hrBlockedClinical = !RBAC.can(hr, 'patient.view.clinical').ok && !RBAC.can(hr, 'condition.sensitive').ok;
    const finBlockedClinical = !RBAC.can(fin, 'patient.view.clinical').ok && !RBAC.can(fin, 'condition.sensitive').ok;
    const medBlockedClinical = !RBAC.can(med, 'patient.view.clinical').ok && !RBAC.can(med, 'condition.sensitive').ok;

    return {
      kb3Adopted: kb3 && kb3.proposed === false && /ADOPTED v3\.2/.test(kb3.version),
      noProposedStorytelling: !charterHtml.includes('PROPOSED v1.0') && !mediaHomeHtml.includes('PROPOSED v1.0'),
      hasAllDomains: charterHtml.includes('Ethical Storytelling') &&
                     charterHtml.includes('Legal Registration') &&
                     charterHtml.includes('Audited Accounts') &&
                     charterHtml.includes('Safeguarding &amp; Child Protection') &&
                     charterHtml.includes('Anti-Fraud') &&
                     charterHtml.includes('Procurement'),
      hasDpaSections: dpaTabHtml.includes('Art. 31 &amp; DPA §2') && dpaTabHtml.includes('HIV serostatus') && dpaTabHtml.includes('5-Layer Consent') && dpaTabHtml.includes('Children Act §27'),
      checklistItems: (CARELINK_GOVERNANCE.PRE_PUB_CHECKLIST || []).reduce((n, g) => n + g.items.length, 0),
      workflowStages: (CARELINK_GOVERNANCE.TEN_STAGE_WORKFLOW || []).length,
      hasLegalBoard: legalTabHtml.includes('19 October 2018') && legalTabHtml.includes('83-3329252') && legalTabHtml.includes('Pamela McClanahan'),
      hasZeroUploadVerifier: vaultTabHtml.includes('data-local-policy-verify') && /zero bytes are transmitted/i.test(vaultTabHtml),
      dpaBannersOk: dpaOnPatients.includes('KENYA DPA 2019') && dpaOnCcc.includes('KENYA DPA 2019') && dpaOnConsent.includes('KENYA DPA 2019') && dpaOnFinance === '',
      dpaModalOpened: modalHtml.includes('Kenya Data Protection Act, 2019'),
      leakedInternalInPublic,
      rbacIsolated: hrBlockedClinical && finBlockedClinical && medBlockedClinical
    };
  })())`));

  ok('Patient Information Confidentiality, Data Protection & Ethical Storytelling Policy is ADOPTED v3.2 (9-Part Framework, 22-Point Pre-Pub Checklist & 10-Stage Workflow)',
    govAudit.kb3Adopted && govAudit.noProposedStorytelling && govAudit.checklistItems === 22 && govAudit.workflowStages === 10, JSON.stringify(govAudit));
  ok('Governance Charter covers Legal Registration (19 Oct 2018 + EIN 83-3329252), Board, Audited Accounts, Safeguarding, Child Protection, Anti-Fraud & 4-Tier Procurement',
    govAudit.hasAllDomains && govAudit.hasLegalBoard);
  ok('Kenya Data Protection Act (2019), Health Act (§11) & Children Act (§27) Sensitive HIV/Health statement & statutory view banners work cleanly',
    govAudit.hasDpaSections && govAudit.dpaBannersOk && govAudit.dpaModalOpened, JSON.stringify(govAudit));
  ok('Strict Non-Publication & RBAC Guard: confidential governance docs never publish & HR/Finance/Media are blocked from HIV/clinical fields',
    govAudit.leakedInternalInPublic === false && govAudit.rbacIsolated === true);
  ok('Zero-Upload Ephemeral Local SHA-256 Policy Verifier is available for internal verification without uploading files',
    govAudit.hasZeroUploadVerifier === true);

  /* Confirm zero confidential policy/governance PDF/DOCX/XLSX files were added or staged in this branch */
  const { execSync } = require('child_process');
  const gitPorcelain = execSync('git status --porcelain', { cwd: REPO, encoding: 'utf8' });
  ok('Zero confidential policy/governance PDF/DOCX/XLSX files added or modified in git working tree',
    !gitPorcelain.split('\n').some(line => /\.(pdf|docx?|xlsx?)$/i.test(line.trim())));

  /* ==========================================================================
     PILLAR 3 & 4: Decongested 6-Archetype Consoles, 100% Zero White-Out Text
                   & 5-Tier Distinct Banner Typography
     ========================================================================== */
  const uxAudit = JSON.parse(run(`JSON.stringify((() => {
    const archetypesSeen = new Set();
    const brokenHomes = [];
    DB.db.users.forEach(u => {
      AUTH.user = u;
      APPX.view = 'home';
      const h = renderHome(u);
      const banner = workspaceHeroBanner('home', u);
      const arch = WORKSPACE_LAYOUTS.archetypeFor(u);
      archetypesSeen.add(arch);
      if (!h.includes('ws67-hero') || !h.includes('data-archetype="' + arch + '"')) brokenHomes.push(u.username + ':no-ws67-hero');
      /* workspaceHeroBanner('home', u) must NOT emit a separate duplicate .ctx-strip OR stacked .wf-slim-ribbon above .ws67-hero */
      if (banner.includes('ctx-strip')) brokenHomes.push(u.username + ':duplicate-ctx-strip-on-home');
      if (banner.includes('wf-slim-ribbon')) brokenHomes.push(u.username + ':stacked-wf-ribbon-on-home');
    });

    /* Inner view ('patients') MUST still render .ctx-strip, .dpa-statute-bar & sleek collapsible .wf-slim-ribbon cleanly */
    const mcm = DB.db.users.find(u => u.username === 'mcm.kisumu');
    const innerBanner = workspaceHeroBanner('patients', mcm);

    /* Partner roles have bespoke Console Home content */
    const cccU = DB.db.users.find(u => u.roleId === 'ccc.clinician');
    const govU = DB.db.users.find(u => u.roleId === 'gov.partner');
    const intlU = DB.db.users.find(u => u.roleId === 'intl.medical');
    const partnerHomesOk = renderHome(cccU).includes('Bidirectional CCC / PSC Referral Desk') &&
                           renderHome(govU).includes('County Health Partnership') &&
                           renderHome(intlU).includes('International Medical Specialist Review Board');

    /* Layout mode switcher ('smart' -> 'tabbed' -> 'full') */
    AUTH.user = mcm;
    ACTIONS['ws-layout-mode']({ mode: 'tabbed' });
    const tabbedHtml = renderHome(mcm);
    ACTIONS['ws-layout-mode']({ mode: 'full' });
    const fullHtml = renderHome(mcm);
    ACTIONS['ws-layout-mode']({ mode: 'smart' });

    /* Contrast audit across all 30 themes including fieldInput & tab bar */
    const contrastRes = VISUALX.contrastAudit();
    const contrastFailures = contrastRes.filter(r => r.failures && r.failures.length > 0);

    return {
      archetypeCount: archetypesSeen.size,
      archetypes: [...archetypesSeen].sort(),
      brokenHomes,
      innerHasCtxAndDpa: innerBanner.includes('ctx-strip') && innerBanner.includes('dpa-statute-bar'),
      partnerHomesOk,
      layoutSwitchOk: tabbedHtml.includes('ws67-tabbed-deck') && fullHtml.includes('ws67-stack'),
      themeCount: contrastRes.length,
      contrastFailureCount: contrastFailures.length
    };
  })())`));

  ok('All 6 distinct departmental console workspace archetypes render cleanly across every role with zero duplicate home banners',
    uxAudit.archetypeCount === 6 && uxAudit.brokenHomes.length === 0,
    JSON.stringify({ archetypes: uxAudit.archetypes, broken: uxAudit.brokenHomes }));
  ok('External partner roles (CCC Clinician, County Gov Partner, Intl Medical) render dedicated Console Home workspaces',
    uxAudit.partnerHomesOk === true);
  ok('Console workspace layout switcher (Decongested Deck / Focused Tabs / Expanded Stack) switches cleanly per user',
    uxAudit.layoutSwitchOk === true && uxAudit.innerHasCtxAndDpa === true);
  ok('All 30 workspace themes pass 100% of contrast pairs including Text Box Field Ink & Tab Bar Ink (0 whitened-out pairs)',
    uxAudit.themeCount === 30 && uxAudit.contrastFailureCount === 0, `themes=${uxAudit.themeCount}, fails=${uxAudit.contrastFailureCount}`);

  /* Verify CSS white-out & 5-Tier Banner Hierarchy selectors in stylesheets */
  const cssCombined = ['styles.css', 'console6.css', 'audit6.css', 'carelink63.css']
    .map(f => fs.readFileSync(path.join(REPO, 'v6', 'src', f), 'utf8')).join('\n');

  ok('CSS eliminates white-on-white in Outlined KPIs, Portal gov/partner cards, Sign-In tabs/autofill, active tab counters & <select> options',
    cssCombined.includes('html:not([data-kpistyle="tinted"]):not([data-kpistyle="outlined"]) .kpi') &&
    cssCombined.includes('html[data-kpistyle="outlined"] .kpi{background:var(--surface);color:var(--ink)}') &&
    cssCombined.includes('.pp-gov-strip{') && cssCombined.includes('color:#0F172A !important') &&
    cssCombined.includes('.lg-tab.on{ background:#1E3A8A; color:#FFFFFF') &&
    cssCombined.includes('select option, select optgroup') &&
    cssCombined.includes('input:-webkit-autofill'));

  ok('CSS enforces 5 distinct banner & bar typographic/structural tiers (.topbar.cbar vs .ctx-strip/.ws67-hero serif vs .dpa-statute-bar mono vs .wf-slim-ribbon)',
    cssCombined.includes('.topbar.cbar .cb-os-tag') &&
    cssCombined.includes('.ctx-strip .ctx-title') &&
    cssCombined.includes("Georgia,'Iowan Old Style'") &&
    cssCombined.includes('.dpa-statute-tag') &&
    cssCombined.includes('details.wf-strip.wf-slim-ribbon'));

  /* ==========================================================================
     PILLAR 5: Smooth Logins & Online-Safe Seamless Account Switching
     ========================================================================== */
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

  function makeHostedClient() {
    const c = makeCtx({
      location: { hash: '#/', search: '', pathname: '/carelink-v6.html', protocol: 'https:', hostname: 'carelink.test', origin: 'https://carelink.test' },
      navigator: { userAgent: 'Mozilla/5.0 Chrome/126.0.0.0 Safari/537.36', clipboard: { writeText: async () => {} }, maxTouchPoints: 0 },
      fetch: rawApiFetch,
      performance: { now: () => Date.now() },
      Blob, Response, DecompressionStream, atob, btoa, Uint8Array
    });
    c.ctx.__fd = fields => ({ get: k => (k in fields ? fields[k] : null) });
    return c;
  }

  /* 5a. Pre-commissioning Online Evaluation Mode: 1-click Account Switch rotates online sessionToken cleanly */
  const evalClient = makeHostedClient();
  await evalClient.run('boot()');
  await evalClient.run(`(async () => {
    DB.seedDemo();
    await SYNC._json('api/public/demo-bootstrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ db: DB.db })
    });
    APPX.host = await hostProbe();
  })()`);
  await evalClient.run(`AUTH.loginOnline('chief.admin', 'LOMAMO2026')`);
  const evalTokenBefore = evalClient.run('SYNC.sessionToken');
  await evalClient.run(`ACCOUNT_SWITCHER.executeDemoSwitch({ u: 'director', v: 'home', asset: 'Country Director Console' })`);
  const switchedEval = JSON.parse(evalClient.run(`JSON.stringify({
    username: AUTH.user && AUTH.user.username,
    tokenAfter: SYNC.sessionToken,
    screen: APPX.screen,
    view: APPX.view
  })`));
  ok('Evaluation-mode 1-click Account Switch rotates online sessionToken & opens target role console smoothly',
    switchedEval.username === 'director' && Boolean(switchedEval.tokenAfter) && switchedEval.tokenAfter !== evalTokenBefore && switchedEval.screen === 'app',
    JSON.stringify(switchedEval));

  /* Now commission 4-step production setup on fresh KV */
  kv.clear();
  const client = makeHostedClient();
  await client.run('boot()');
  const chiefTempPw = 'Kx9!vQ2#mTz7Lp';
  await client.run(`PROD_SETUP.completeFourStepHostSetup({
    orgNameVal: 'LOMAMO Foundation Kenya',
    shortNameVal: 'LOMAMO',
    seedMode: 'empty',
    chiefUsername: 'system.admin',
    chiefPassword: ${JSON.stringify(chiefTempPw)},
    loginUrl: 'https://carelink.test'
  })`);

  await client.run(`FORMS.login6(__fd(${JSON.stringify({ username: 'system.admin', password: chiefTempPw })}))`);
  const chiefPrivPw = 'Safe#Vault2027!Xy9';
  await client.run(`FORMS.mustchange6(__fd(${JSON.stringify({
    current: chiefTempPw,
    password: chiefPrivPw,
    password2: chiefPrivPw,
    autoFeedCloudMaster: '1',
  })}))`);

  const actPack = await client.run('PROD_SETUP.activateSystemGlobally(AUTH.user)');
  const mcmCred = actPack.rows.find(r => r.username === 'mcm.kisumu');

  /* 5b. Post-Activation Production Account Switch: opens credential handoff modal & switches cleanly */
  client.run(`ACTIONS['open-switch-account']()`);
  const switchModalHtml = client.run(`(modalStack && modalStack.length ? modalStack.map(m => m.innerHTML || '').join('') : '')`);
  ok('Post-activation Switch Account opens secure shared-PC/tablet staff credential handoff modal (zero demo list)',
    switchModalHtml.includes('data-form="live-switch-account"') && !switchModalHtml.includes('sw67-grid'));

  const tokenChief = client.run('SYNC.sessionToken');
  await client.run(`FORMS['live-switch-account'](__fd(${JSON.stringify({ username: 'mcm.kisumu', password: mcmCred.tempPassword })}))`);
  const switchedProd = JSON.parse(client.run(`JSON.stringify({
    username: AUTH.user && AUTH.user.username,
    mustChange: Boolean(AUTH.mustChange),
    tokenMcm: SYNC.sessionToken,
    recents: ACCOUNT_SWITCHER.recentUsernames()
  })`));
  ok('Live Staff Account Switch logs out prior session, authenticates incoming staff account & remembers recent usernames (never passwords)',
    switchedProd.username === 'mcm.kisumu' && Boolean(switchedProd.tokenMcm) && switchedProd.tokenMcm !== tokenChief &&
    switchedProd.recents.includes('mcm.kisumu') && switchedProd.recents.includes('system.admin'),
    JSON.stringify(switchedProd));

  console.log(`\nv670-strategic-governance-workspaces-e2e: ${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.error('FAILURES:\n - ' + fails.join('\n - '));
    process.exit(1);
  }
})();
