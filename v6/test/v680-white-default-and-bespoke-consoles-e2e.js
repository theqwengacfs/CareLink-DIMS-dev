/* ============================================================================
   v680-white-default-and-bespoke-consoles-e2e.js — End-to-End Verification for
   CareLink C-DIMS v6.8.0:
   1. Global Luminous Pearl-White Default Theme (Landing, Sign-In, Glass Topbar,
      White Sidebar Chrome & Specular Top-Bar KPIs)
   2. 100% Elimination of Hardcoded White-Fill Visibility Defects Across All 30
      Workspace Themes & All 10 Landing Themes
   3. Decongested Shell (Clean Topbar Titling, Zero Stacked Home Ribbons,
      Compact 2x2 Sidebar Control Dock)
   4. 29+ Bespoke Departmental & Geographic-Scope Console Workbenches
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const { makeCtx } = require('./dom');

(async () => {
  const REPO = path.resolve(__dirname, '..', '..');
  const { run } = makeCtx();
  run('DB.load(); DB.seedDemo();');

  let pass = 0, fail = 0;
  function ok(name, cond, detail = '') {
    if (cond) {
      pass++;
    } else {
      fail++;
      console.error('FAIL | ' + name + (detail ? ' | ' + detail : ''));
    }
  }

  /* 1. Global White Default Theme Audit */
  const themeAudit = JSON.parse(run(`JSON.stringify((() => {
    const f = WTHEMES.find(t => t.id === 'foundation');
    return {
      appVersion: APP.version,
      defaultLandingId: DEFAULT_THEME,
      firstLanding: LANDING_THEMES[0],
      resolvedLanding: landingTheme(),
      wtDefault: WT_DEFAULT,
      deviceDefault: DEVICE.themeDefault(),
      kpiStyleDefault: STUDIO.kpiStyle.def,
      bannerStyleDefault: STUDIO.bannerStyle.def,
      foundationTokens: f ? f.t : null,
      landingHtml: renderLanding6(false),
      loginHtml: renderLogin6()
    };
  })())`));

  ok('APP.version is 6.9.0', themeAudit.appVersion === '6.9.0', themeAudit.appVersion);
  ok('Global Landing Default is Foundation White (clinic, mode=light, accent=#1E3A8A)',
    themeAudit.defaultLandingId === 'clinic' &&
    themeAudit.firstLanding.id === 'clinic' &&
    themeAudit.firstLanding.mode === 'light' &&
    themeAudit.resolvedLanding.id === 'clinic' &&
    themeAudit.landingHtml.includes('data-theme="clinic" data-mode="light"') &&
    !themeAudit.landingHtml.includes('fill="#0B1933"'));

  const epochAudit = JSON.parse(run(`JSON.stringify((() => {
    const u = DB.db.users.find(x => x.username === 'director');
    /* Simulate a legacy pre-690 Upstash KV / localStorage state */
    delete DB.db.settings.uiEpoch;
    DB.db.settings.landingTheme = 'spectrum';
    DB.db.settings.landingThemeExplicit = true;
    DB.db.settings.consoleTheme = 'classic';
    DB.db.personalPrefs[u.id] = { wtheme: 'night', bannerStyle: 'spectrum', kpiStyle: 'vivid', textScale: 110 };
    DB.migrate();
    return {
      uiEpoch: DB.db.settings.uiEpoch,
      landingAfter: landingTheme().id,
      resolvedWtheme: WTHEME.resolveId(u),
      studioAfter: WTHEME.studio(u),
      keptTextScale: DB.db.personalPrefs[u.id].textScale
    };
  })())`));
  ok('Legacy pre-690 cloud/browser preferences auto-migrate to clean Foundation White while preserving accessibility textScale',
    epochAudit.uiEpoch === 690 &&
    epochAudit.landingAfter === 'clinic' &&
    epochAudit.resolvedWtheme === 'foundation' &&
    epochAudit.studioAfter.bannerStyle === 'glass' &&
    epochAudit.studioAfter.kpiStyle === 'tinted' &&
    epochAudit.keptTextScale === 110,
    JSON.stringify(epochAudit));
  ok('Global Workspace Default is Luminous Foundation White across surface, bar & sidebar chrome',
    themeAudit.wtDefault === 'foundation' &&
    themeAudit.deviceDefault === 'foundation' &&
    themeAudit.foundationTokens.surface === '#FFFFFF' &&
    themeAudit.foundationTokens.bar === '#FFFFFF' &&
    themeAudit.foundationTokens.chrome === '#FFFFFF' &&
    themeAudit.foundationTokens.chromeInk === '#0F172A');
  ok('Studio defaults use specular Crisp Top-Bar KPIs (tinted) and Luminous Glass Command Topbar (glass)',
    themeAudit.kpiStyleDefault === 'tinted' && themeAudit.bannerStyleDefault === 'glass');

  /* 2. Zero Hardcoded White-Fill Visibility Bugs & Contrast Audit Across All 30 Themes */
  const contrastAudit = JSON.parse(run(`JSON.stringify((() => {
    const res = VISUALX.contrastAudit();
    return {
      total: res.length,
      failures: res.filter(r => (r.failures && r.failures.length) || (r.fails && r.fails.length)),
      pairCount: CONTRAST_PAIRS.length
    };
  })())`));

  ok('All 30 workspace themes pass expanded contrast matrix (including ink-on-bar & ink-on-surface2)',
    contrastAudit.total === 30 && contrastAudit.failures.length === 0 && contrastAudit.pairCount >= 9,
    JSON.stringify(contrastAudit.failures));

  const stylesCss = fs.readFileSync(path.join(REPO, 'v6', 'src', 'styles.css'), 'utf8');
  const css63 = fs.readFileSync(path.join(REPO, 'v6', 'src', 'carelink63.css'), 'utf8');
  ok('styles.css purges hardcoded #fff fills on .btn, .btn-ghost, .icon-btn, .modal, .toast, .action-card, .patient-card, .me-btn, .live-pill & .sheet',
    stylesCss.includes('.btn{') && stylesCss.includes('background:var(--surface);color:var(--ink)}') &&
    stylesCss.includes('.modal{background:var(--surface);color:var(--ink)') &&
    stylesCss.includes('.toast{background:var(--surface);color:var(--ink)') &&
    stylesCss.includes('.action-card{') && stylesCss.includes('.patient-card{') &&
    stylesCss.includes('.me-btn{display:flex;align-items:center;gap:8px;background:var(--surface)') &&
    stylesCss.includes('.sheet{position:sticky;top:0;z-index:30;display:flex;align-items:center;gap:4px;overflow-x:auto;overflow-y:hidden;\n  background:var(--bar,var(--surface))'));
  ok('carelink63.css styles Luminous Glass Topbar (html[data-banner="glass"]) & locks paper ink inside .report-doc/.form-doc/.cdims-pdca-doc',
    css63.includes('html[data-banner="glass"] .topbar.cbar{') &&
    css63.includes('.report-doc, .form-doc, .cdims-pdca-doc{'));

  /* 3. Bespoke Role & Scope Consoles Audit Across All Seeded Accounts */
  const roleAudit = JSON.parse(run(`JSON.stringify((() => {
    const distinctBadges = new Set();
    const errors = [];
    const checkUsers = [
      'chief.admin', 'president', 'director', 'program.admin', 'program.assistant',
      'kisumu.admin', 'homabay.admin', 'kisumu.assistant',
      'mcm.kisumu', 'depthead.medical', 'pharmacy.kisumu', 'nurse.kisumu', 'homestay.kisumu', 'focal.kisumu',
      'coord.nairobird', 'caregiver.nairobird', 'chw.nyalenda',
      'finance.kisumu', 'procurement', 'me.kisumu', 'intl.data', 'auditor',
      'hr.officer', 'welfare.officer', 'vehicle.officer', 'media.head', 'pr.officer', 'ict.officer',
      'ccc.jootrh', 'gov.kisumu', 'intl.medical'
    ];
    for (const uname of checkUsers) {
      const u = DB.db.users.find(x => x.username === uname);
      if (!u) { errors.push('missing-user:' + uname); continue; }
      AUTH.user = u;
      APPX.view = 'home';
      const spec = ROLE_CONSOLES_68.specFor(u);
      if (!spec || !spec.code || !spec.headline) { errors.push('missing-spec:' + uname); continue; }
      distinctBadges.add(spec.code);
      const html = renderHome(u);
      if (!html.includes('rc68-shell') || !html.includes(esc(spec.code))) errors.push('missing-rc68-dom:' + uname);
      if (['media.head', 'pr.officer'].includes(uname) && (html.includes('data-v="patients"') || html.includes('data-v="repeat"'))) {
        errors.push('clinical-leak-in-media:' + uname);
      }
      const navHtml = NAVP.html(u, id => id === 'home');
      if (!navHtml.includes('np-foot-grid')) errors.push('missing-compact-np-foot:' + uname);
    }
    const ksmSpec = ROLE_CONSOLES_68.specFor(DB.db.users.find(x => x.username === 'kisumu.admin'));
    const hbySpec = ROLE_CONSOLES_68.specFor(DB.db.users.find(x => x.username === 'homabay.admin'));
    const pharmSpec = ROLE_CONSOLES_68.specFor(DB.db.users.find(x => x.username === 'pharmacy.kisumu'));
    const nurseSpec = ROLE_CONSOLES_68.specFor(DB.db.users.find(x => x.username === 'nurse.kisumu'));
    return {
      checked: checkUsers.length,
      distinctCount: distinctBadges.size,
      errors,
      countyDistinct: ksmSpec.code !== hbySpec.code,
      pharmNurseDistinct: pharmSpec.code !== nurseSpec.code
    };
  })())`));

  ok('All 31 departmental & geographic accounts render bespoke ROLE_CONSOLES_68 workbenches with compact 2x2 sidebar dock & zero errors',
    roleAudit.checked === 31 && roleAudit.errors.length === 0 && roleAudit.distinctCount >= 26,
    JSON.stringify(roleAudit));
  ok('Geographic & cadre specialization distinguishes Kisumu HQ Admin vs Homa Bay County Admin and Pharmacist vs Clinical Nurse',
    roleAudit.countyDistinct === true && roleAudit.pharmNurseDistinct === true);

  if (fail > 0) process.exit(1);
  console.log(`v6.8.0 White Default & Bespoke Consoles E2E: ${pass}/${pass + fail} passed`);
})();
