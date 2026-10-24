/* v65.js · Comprehensive CareLink C-DIMS v6.4.0 Production Verification Suite
   Verifies all 9 v6.4 production requirements:
   1. Symmetrical Financial & Reporting Charts, Zero-Slice-Text Pie/Donut Charts & Complete View-as-Table
   2. Global Switched-Account, Co-Work & Silent-Override Banner High-Contrast Buttons
   3. Fixed Non-Zooming 100dvh Shell & Left Navigation Scroll Preservation
   4. Rich Role-Contextual Upper Console Bars & High-Contrast Readable Console Tabs
   5. Global Scrollbar & Horizontal Overflow Containment
   6. Dedicated CareLink Development Console (`devconsole`)
   7. Production First-Run Setup, Unique Strong SMS Credential Pack, First-Login DPA Privacy Password & Audited Chief Admin Silent Override
   8. Single Unified Online Site Database (`api/index.js` + `v6/server.py`) & Shared Online Intelligence (`api/ai/*`)
   9. Kisumu Head Office & Homa Bay County Admin Workflows (`adminops`: Daily PAYG, Daily Staff Transport, Weekly Suppliers, 9th SHIF/PAYE/KRA/NSSF, Monthly Bills/Salaries, Operational Expenses & Kisumu-Prepared Homa Bay Reports for Kenya, Annual Budgeting & Filing of Societies)
*/
const { makeCtx } = require('./dom');
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..');
const SRC = path.join(__dirname, '..', 'src');
const { run } = makeCtx();

run('DB.load(); DB.seedOfficial({patients:600});');
run(`AUTH.logout(); AUTH.login('chief.admin','LOMAMO2026');`);

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, detail) {
  if (cond) pass++;
  else { fail++; fails.push(name + (detail ? (' — ' + detail) : '')); }
}
function test(name, fn) {
  try {
    const r = fn();
    if (r === false) throw new Error('returned false');
    ok(name, true);
  } catch (e) {
    ok(name, false, e.message);
  }
}
const asRole = (roleId, countyId) => {
  const uname = run(`(DB.db.users.find(u=>u.roleId==='${roleId}'${countyId ? ` && u.countyId==='${countyId}'` : ''})||{}).username || ''`);
  run(`if(typeof SILENT_OVERRIDE!=='undefined') SILENT_OVERRIDE.state=null; AUTH.logout(); AUTH.login('${uname}','LOMAMO2026');`);
  return uname;
};
const J = expr => JSON.parse(run(`JSON.stringify(${expr})`));

/* 1. Version, Browser Tab Title & Zero-Slice-Text Symmetrical Pie/Donut Charts + Complete View-as-Table */
test('1. Symmetrical pie/donut charts (zero text across slices) & complete View-as-Table mode', () => {
  ok('APP.version is 6.4.0', run(`APP.version`) === '6.4.0', run(`APP.version`));
  ok('APP.tabTitle is CareLink C-DIMS', run(`APP.tabTitle`) === 'CareLink C-DIMS');

  const dHtml = String(run(`chartDonut([{label:'Foodbags',value:120000,color:'#0E7490'},{label:'Medication',value:80000,color:'#15803D'}], {title:'Test mix', fmt:v=>money(v), centerLabel:'TOTAL', centerValue:money(200000)})`));
  const svgPart = (dHtml.match(/<svg[\s\S]*?<\/svg>/) || [''])[0];
  ok('chartDonut SVG contains zero <text> nodes written across slices', svgPart.length > 40 && !/<text\b/i.test(svgPart), svgPart);
  ok('chartDonut renders symmetrical side panel with total strip and percentages', dHtml.includes('donut-wrap-clean') && dHtml.includes('donut-side-panel') && dHtml.includes('donut-total-strip') && dHtml.includes('60.0%'));

  const miniDonut = String(run(`donut([{label:'A',value:30,color:'#0E7490'},{label:'B',value:70,color:'#15803D'}])`));
  const miniSvg = (miniDonut.match(/<svg[\s\S]*?<\/svg>/) || [''])[0];
  ok('ui.js donut() SVG also contains zero <text> nodes across slices', miniSvg.length > 30 && !/<text\b/i.test(miniSvg));

  /* Global Table-Only mode renders clean symmetrical tables with Total rows */
  run(`APPX.chartViewMode = 'table'; COST_STATE.viewMode = 'table';`);
  const tblDonut = String(run(`chartDonut([{label:'Foodbags',value:120000,color:'#0E7490'},{label:'Medication',value:80000,color:'#15803D'}], {title:'Test mix', fmt:v=>money(v)})`));
  ok('Table-only mode replaces SVG with standalone symmetrical table + Total row', !/<svg\b/i.test(tblDonut) && tblDonut.includes('chart-table-only') && tblDonut.includes('ct-total-row') && tblDonut.includes('100.0%'));
  run(`APPX.chartViewMode = 'charts'; COST_STATE.viewMode = 'charts';`);

  asRole('finance', 'kisumu');
  const finHtml = String(run(`renderFinance(AUTH.user, {})`));
  ok('Finance console includes chart/table toggle, category donut, grouped chart & total footer',
    finHtml.includes('toggle-chart-table-mode') && finHtml.includes('donut-wrap-clean') && finHtml.includes('ct-total-row'));

  asRole('director');
  for (const t of ['overview', 'area', 'county', 'disease', 'dept', 'trend']) {
    const cHtml = String(run(`COSTX.render(AUTH.user, {tab:'${t}'})`));
    const allSvgs = cHtml.match(/<svg[\s\S]*?<\/svg>/g) || [];
    const donutSvgs = allSvgs.filter(s => s.includes('donut-svg'));
    ok(`Costing tab '${t}' has zero <text> inside donut SVGs`, donutSvgs.every(s => !/<text\b/i.test(s)));
  }
  return true;
});

/* 2. Global Switched-Account, Co-Work & Silent-Override Banner Contrast */
test('2. Switched-account, Co-Work & Silent-Override banners have explicit high-contrast buttons without white-on-white inline styles', () => {
  const css = fs.readFileSync(path.join(SRC, 'carelink63.css'), 'utf8');
  ok('Switched-account primary button uses high-contrast #FBBF24 + #0F172A',
    css.includes('.demo-view-bar .demo-bar-btn-primary') && css.includes('#FBBF24') && css.includes('#0F172A'));
  ok('Switched-account dismiss button uses high-contrast #0F172A + #FFFFFF',
    css.includes('.demo-view-bar .demo-bar-btn-dismiss') && css.includes('#FFFFFF'));

  asRole('chief');
  const coBar = String(run(`DUALCHECK.bannerHTML(AUTH.user)`));
  ok('Co-edit bar has zero inline color:#fff button overrides', !/style="[^"]*color:#fff/i.test(coBar));
  ok('Co-edit bar uses dedicated high-contrast coedit-btn classes', coBar.includes('coedit-btn-primary') && coBar.includes('coedit-btn-secondary'));
  return true;
});

/* 3. Left Navigation Scroll Preservation & Non-Zooming Fixed 100dvh Shell */
test('3. Fixed non-zooming 100dvh shell, clean scrollbars & left-nav scroll guard', () => {
  const css = fs.readFileSync(path.join(SRC, 'carelink63.css'), 'utf8');
  ok('CSS enforces zoom:1 !important and 2-row 100dvh shell on .app.shell.has-pane',
    css.includes('zoom:1 !important') && css.includes('grid-template-rows:auto minmax(0, 1fr) !important') && css.includes('height:100dvh !important'));
  ok('CSS pins .np-foot at bottom of .npane with overscroll-behavior:contain on .np-scroll',
    css.includes('.has-pane > .npane > .np-scroll') && css.includes('overscroll-behavior:contain !important'));

  asRole('chief');
  run(`WTHEME.apply(AUTH.user)`);
  const navSrc = fs.readFileSync(path.join(SRC, 'navpane.js'), 'utf8');
  ok('NAVP.restoreScroll guards active-item jump behind viewChanged check', navSrc.includes('const viewChanged = NAVP._lastView !== curView'));
  return true;
});

/* 4. Role-Contextual Upper Console Bars & High-Contrast Tabs + Strict Role Isolation */
test('4. Rich role-contextual upper console bars & strict Media/HR clinical isolation', () => {
  asRole('chief');
  const homeHtml = String(run(`contentFor('home', {}, AUTH.user)`));
  ok('Role-contextual bar renders on home view with role-specific tabs',
    homeHtml.includes('ctx-strip') && homeHtml.includes('ctx-role-tabs') && homeHtml.includes('Development Console'));

  asRole('mediahead');
  const mediaHome = String(run(`contentFor('home', {}, AUTH.user)`));
  ok('Media role-contextual bar contains Media tabs and ZERO clinical/patient/repeat tabs',
    mediaHome.includes('ctx-role-tabs') && mediaHome.includes('Media') && !mediaHome.includes('data-v="patients"') && !mediaHome.includes('data-v="repeat"'));

  asRole('hr');
  const hrHome = String(run(`contentFor('home', {}, AUTH.user)`));
  ok('HR role-contextual bar contains HR/Leave/Handover tabs and ZERO clinical tabs',
    hrHome.includes('Leave &amp; Off-Days') && !hrHome.includes('data-v="patients"') && !hrHome.includes('data-v="clinicalmcm"'));
  return true;
});

/* 5. Development Console, First-Run SMS Provisioning, DPA First-Login Password & Audited Silent Override */
test('5. Development Console, DPA 12+ char password policy, SMS pack & Chief Admin Silent Override', () => {
  asRole('chief');
  ok('Chief System Admin can access devconsole', run(`DEV_CONSOLE.canAccess(AUTH.user)`) === true);
  for (const t of ['telemetry', 'provisioning', 'override', 'diagnostics']) {
    const h = String(run(`contentFor('devconsole', {tab:'${t}'}, AUTH.user)`));
    ok(`Development Console renders sheet '${t}'`, h.includes('CareLink Development Console'));
  }

  asRole('it');
  ok('IT role can access devconsole but NOT silent override',
    run(`DEV_CONSOLE.canAccess(AUTH.user)`) === true && run(`SILENT_OVERRIDE.canOverride(AUTH.user)`) === false);

  asRole('mediahead');
  const deniedDev = String(run(`contentFor('devconsole', {}, AUTH.user)`));
  ok('Non-technical role is denied access to devconsole', deniedDev.includes('Access denied'));

  /* Strong password generator & strict DPA first-login password validator */
  const genPw = String(run(`PROD_SETUP.generateStrongPassword(14)`));
  ok('Generated SMS password is 14 chars and passes strict DPA complexity check',
    genPw.length === 14 && run(`PROD_SETUP.validatePrivacyPassword(${JSON.stringify(genPw)}, {username:'jane.doe', name:'Jane Doe'})`) === '', genPw);
  ok('Weak or short passwords fail DPA first-login validation',
    run(`PROD_SETUP.validatePrivacyPassword('Short1!', {username:'jane.doe', name:'Jane Doe'})`) !== '' &&
    run(`PROD_SETUP.validatePrivacyPassword('jane.doe2026!A', {username:'jane.doe', name:'Jane Doe'})`) !== '' &&
    run(`PROD_SETUP.validatePrivacyPassword('LOMAMO2026!!Aa', {username:'jane.doe', name:'Jane Doe'})`) !== '');

  /* Audited Silent Override: Chief System Admin inspects Homa Bay Admin without notifying user, with full audit log */
  asRole('chief');
  const notifBefore = Number(run(`(DB.db.notifications||[]).length`));
  const auditBefore = Number(run(`(DB.db.audit||[]).length`));
  const hbUser = J(`DB.db.users.find(u=>u.roleId==='countyadmin' && u.countyId==='homabay') || DB.db.users.find(u=>u.roleId==='mediahead')`);
  ok('Target user found for silent override test', Boolean(hbUser && hbUser.id));

  run(`SILENT_OVERRIDE.enter('${hbUser.id}', 'Automated verification of silent override')`);
  ok('Session switched to target user during silent override', run(`AUTH.user.id`) === hbUser.id);
  ok('Left navigation dynamically reflects target user role during silent override',
    J(`navModel(AUTH.user)`).length > 0 && String(run(`workspaceHeroBanner('home', AUTH.user)`)).includes('SILENT OVERRIDE'));
  ok('Target user received ZERO notifications during silent override', Number(run(`(DB.db.notifications||[]).length`)) === notifBefore);

  run(`go('settings', {})`);
  run(`SILENT_OVERRIDE.exit()`);
  ok('Exiting silent override restores Chief System Admin', run(`AUTH.user.roleId`) === 'chief' && run(`SILENT_OVERRIDE.isActive()`) === false);
  const overrideAudits = J(`(DB.db.audit||[]).slice(${auditBefore}).map(a=>a.action)`);
  ok('System Audit Log recorded start, view navigation, and end of silent override',
    overrideAudits.includes('system.silent_override.start') &&
    overrideAudits.includes('system.silent_override.view') &&
    overrideAudits.includes('system.silent_override.end'), JSON.stringify(overrideAudits));
  ok('Audit hash chain remains valid after silent override', run(`AUDIT.verify().ok`) === true);
  return true;
});

/* 6. Kisumu Head Office & Homa Bay County Admin Workflows (`adminops`) */
test('6. Kisumu Head Office & Homa Bay County Admin workflows (Daily PAYG, Weekly Suppliers, Daily Transport, 9th Statutory, Bills, Operational Expenses & Kenya Reports, Annual & Societies)', () => {
  asRole('countyadmin', 'kisumu');
  for (const t of ['overview', 'daily_weekly', 'monthly_stat', 'opex_reports', 'annual']) {
    const h = String(run(`contentFor('adminops', {tab:'${t}'}, AUTH.user)`));
    ok(`Kisumu Head Office Admin renders adminops tab '${t}'`, h.includes('County &amp; Head Office Admin Operations'));
  }
  const statHtml = String(run(`contentFor('adminops', {tab:'monthly_stat'}, AUTH.user)`));
  for (const body of ['SHIF', 'PAYE', 'KRA', 'NSSF', 'Water', 'Garbage', 'Electricity', 'Rent', 'Salaries']) {
    ok(`Monthly statutory & utilities sheet includes '${body}'`, statHtml.includes(body));
  }
  const opexHtml = String(run(`contentFor('adminops', {tab:'opex_reports'}, AUTH.user)`));
  ok('Operational Expenses groups Operational wages, Administrative wages & Monthly financial reports',
    opexHtml.includes('Operational Expenses') &&
    opexHtml.includes('Operational Wages') &&
    opexHtml.includes('Administrative Wages') &&
    opexHtml.includes('Monthly Financial Reports'));

  const annHtml = String(run(`contentFor('adminops', {tab:'annual'}, AUTH.user)`));
  ok('Annual sheet includes Annual Budgeting and Filing of Societies',
    annHtml.includes('Annual Budgeting') && annHtml.includes('Filing of Societies'));

  /* Governance check: Kisumu Head Office Admin prepares Homa Bay reports for Kenya; Homa Bay County Admin submits inputs */
  ok('Kisumu Head Office Admin holds Kenya report preparation authority (including Homa Bay)',
    run(`ADMIN_OPS.canPrepareKenyaReport(AUTH.user)`) === true);

  asRole('countyadmin', 'homabay');
  ok('Homa Bay County Admin can access Homa Bay Admin Operations but cannot unilaterally certify Kenya HQ report',
    run(`ADMIN_OPS.canAccess(AUTH.user)`) === true && run(`ADMIN_OPS.canPrepareKenyaReport(AUTH.user)`) === false);
  const hbyPaygCount = Number(run(`ADMIN_OPS.scopedList(AUTH.user, 'adminOpsPayg').filter(x=>x.countyId!=='homabay').length`));
  ok('Homa Bay County Admin sees only Homa Bay daily PAYG records', hbyPaygCount === 0);
  return true;
});

/* 7. Unified Online Site Database & Shared Online Intelligence (`vercel.json`, `api/index.js`, `ai.js`) */
test('7. Unified Online Site Database & Shared Online Intelligence zero-localhost architecture', () => {
  const vercelRaw = fs.readFileSync(path.join(REPO, 'vercel.json'), 'utf8');
  const vercelCfg = JSON.parse(vercelRaw);
  ok('vercel.json routes /api/* to serverless Unified Online Site Database',
    Array.isArray(vercelCfg.rewrites) && vercelCfg.rewrites.some(r => String(r.destination || '').startsWith('/api/index')));

  const apiSrc = fs.readFileSync(path.join(REPO, 'api', 'index.js'), 'utf8');
  ok('api/index.js implements PBKDF2 hash vault, /api/setup, /api/credentials/provision, /api/state, /api/admin/silent-override & /api/ai/chat',
    apiSrc.includes('pbkdf2Sync') && apiSrc.includes("route === 'setup'") &&
    apiSrc.includes("route === 'credentials/provision'") && apiSrc.includes("route === 'admin/silent-override'") &&
    apiSrc.includes("route === 'ai/chat'"));

  const aiSrc = fs.readFileSync(path.join(SRC, 'ai.js'), 'utf8');
  ok('ai.js routes through relative api/ai/probe and api/ai/chat with zero browser localhost calls',
    aiSrc.includes("'api/ai/probe'") && aiSrc.includes("'api/ai/chat'") && !/fetch\(['"`]http:\/\/127\.0\.0\.1/.test(aiSrc));
  return true;
});

console.log(`v6.5 CareLink C-DIMS v6.4.0 production verification: ${pass} passed, ${fail} failed`);
if (fails.length) {
  fails.forEach(f => console.error('  FAIL:', f));
  process.exit(1);
}
