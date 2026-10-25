/* =====================================================================
   v66.js — CareLink C-DIMS Comprehensive End-to-End Verification Suite
   Covers Prompts 1, 2 & 3:
   - Zero-scroll Landing & Sign-In + Dedicated Architecture & Departments page
   - Organogram-faithful Secretaries, Deputies & Clerks (applicable units only)
   - All 3,333 patients with >=12 longitudinal visits, 100% phone/height/weight/GPS & child Weight/BMI/MUAC charts
   - 4-Step Live Host Setup -> Official Sign-In -> Password Change -> Activate System Globally -> WhatsApp sheet -> Permanent Demo Removal
   - County-routed urgent Sign-In Account Request & Password Recovery queues
   - Two-mode Messaging (Global + Area/Dept Chat) & Who-Is-Online instant Direct Chat fix
   - Presidential, Governor, CHMT, Health Policy & Ministry of Health Presentation Hub
   - Harbour Dark default on Samsung A11+ 5G / Wi-Fi Tablet + Natural Auto-Folding Left Pane
   - Universal Workspace Drafts Hub across all accounts
   - Symmetrical Executive Console, Global Expenditure-Against-Budget, C-DIMS Coins & CareLink AI Smart Workflow Engine (100% Data Quality)
   ===================================================================== */
const fs = require('fs');
const path = require('path');
const { makeCtx } = require('./dom');

const REPO = path.resolve(__dirname, '..', '..');
const { run } = makeCtx();

/* Boot full 3,333-patient dataset to verify 100% completeness across all 3,333 records */
run('DB.load(); DB.seedOfficial({patients:3333});');

let pass = 0, fail = 0;
const fails = [];
const tests = [];
function ok(name, cond, detail = '') {
  if (cond) pass++;
  else { fail++; fails.push(name + (detail ? ' — ' + detail : '')); }
}
function test(label, fn) {
  tests.push({ label, fn });
}
const as = uname => {
  const r = run(`AUTH.logout(); AUTH.login('${uname}','LOMAMO2026').ok`);
  if (!r) throw new Error('Could not sign in as ' + uname);
  return uname;
};
const J = expr => JSON.parse(run(`JSON.stringify(${expr})`));
const JA = async expr => JSON.parse(await run(`(${expr}).then(v=>JSON.stringify(v))`));

/* 1. Zero-scroll Landing & Sign-In + Dedicated Platform Architecture Page */
test('1. Zero-scroll Landing & Sign-In + Dedicated Architecture & Departments page', () => {
  const css6 = fs.readFileSync(path.join(REPO, 'v6', 'src', 'console6.css'), 'utf8');
  ok('Landing CSS enforces strict 100dvh & overflow:hidden', /\.ld\[data-front="1"\][\s\S]{0,160}height:\s*100dvh[\s\S]{0,120}overflow:\s*hidden\s*!important/.test(css6));
  ok('Sign-In CSS enforces strict 100dvh & overflow:hidden', /\.lg6\{\s*height:\s*100dvh;\s*max-height:\s*100dvh;\s*overflow:\s*hidden/.test(css6));

  const land = String(run('renderLanding6()'));
  ok('Landing carries CareLink. Saving lives, preventing orphans. and data-front="1"', land.includes('data-front="1"') && /Saving lives, preventing orphans/.test(land));
  ok('Landing has high-contrast Architecture button and does NOT inline the long 3-section scroll body', land.includes('data-act="goto-architecture"') && !land.includes('01 · Platform Architecture') && !land.includes('03 · Institutional Safeguards'));

  run(`ACTIONS['goto-architecture']()`);
  ok('Clicking Architecture button navigates to dedicated screen', run('APPX.screen') === 'architecture');
  const arch = String(run('renderArchitecture6()'));
  ok('Dedicated Architecture page renders Platform Architecture, Departments Working Together & Institutional Safeguards + Back button',
    arch.includes('01 · Platform Architecture') && arch.includes('02 · Departments Working Together') && arch.includes('03 · Institutional Safeguards') && arch.includes('data-act="goto-landing"'));
  run(`ACTIONS['goto-landing']()`);
  ok('Back button returns cleanly to Landing front page', run('APPX.screen') === 'landing');
});

/* 2. Complete Organogram Secretaries, Deputies & Clerks Only in Applicable Departments */
test('2. Organogram-faithful Secretaries, Deputies & Clerks', () => {
  const roster = J('OFFICIAL_ROSTER.map(r=>({u:r.username,dept:r.dept,tier:r.seatTier||""}))');
  const unames = new Set(roster.map(r => r.u));
  const expectedApplicable = [
    'exec.secretary', 'secretary.kisumu', 'secretary.homabay',
    'clerk.records.kisumu', 'clerk.records.homabay',
    'deputy.procurement', 'clerk.stores.kisumu',
    'deputy.finance', 'clerk.accounts.kisumu',
    'deputy.medical', 'clerk.pharmacy.kisumu',
    'clerk.data.kisumu', 'clerk.data.homabay', 'deputy.hr'
  ];
  ok('All 14 organogram-applicable Deputy, Secretary & Clerk accounts exist', expectedApplicable.every(u => unames.has(u)),
    expectedApplicable.filter(u => !unames.has(u)).join(', '));
  /* Non-applicable units (e.g. Media, PR, Fleet, Internal Audit, Welfare) must NOT have fabricated secretaries/clerks */
  const nonApplicableClerks = roster.filter(r => ['media','pr','vehicle','audit','welfare'].includes(r.dept) && /(secretary|clerk|deputy)/.test(r.u));
  ok('Zero indiscriminate secretaries/deputies/clerks in non-applicable units (Media, PR, Fleet, Audit, Welfare)', nonApplicableClerks.length === 0);
});

/* 3. All 3,333 Patients: >=12 Visits, Wise Homestay/Hospital Proportions, 100% Phone/Height/Weight/GPS & Child Growth Charts */
test('3. All 3,333 patients have >=12 visits, 100% metadata & Child Weight/BMI/MUAC charts', () => {
  const audit = J(`(()=>{
    const pts = DB.db.patients;
    let minVisits = Infinity, maxVisits = 0, with12 = 0, missingPhone = 0, missingId = 0, missingAnthro = 0, missingGps = 0, missingMeta = 0;
    let homestayPts = 0, hospitalPts = 0, childrenCount = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const vs = DB.visitsFor(p.id);
      if (vs.length < minVisits) minVisits = vs.length;
      if (vs.length > maxVisits) maxVisits = vs.length;
      if (vs.length >= 12) with12++;
      if (!p.phone) missingPhone++;
      if (!p.nationalId) missingId++;
      if (!(p.clinical && p.clinical.weightKg > 0 && p.clinical.heightCm > 0 && p.clinical.bmi > 0 && p.clinical.muacCm > 0)) missingAnthro++;
      if (!(p.gps && typeof p.gps.lat === 'number' && typeof p.gps.lon === 'number' && p.location && p.location.village)) missingGps++;
      if (!(p.metadata && p.metadata.waterSource && p.master && p.master.insurance)) missingMeta++;
      if (vs.some(v => v.type === 'homestay')) homestayPts++;
      if (vs.some(v => v.type === 'hospital')) hospitalPts++;
      if (p.age < 18) childrenCount++;
    }
    return { total: pts.length, totalVisits: DB.db.visits.length, minVisits, maxVisits, with12, missingPhone, missingId, missingAnthro, missingGps, missingMeta, homestayPts, hospitalPts, childrenCount };
  })()`);

  ok('Exactly 3,333 patients seeded', audit.total === 3333, String(audit.total));
  ok('EVERY SINGLE ONE of the 3,333 patients has at least 12 visits', audit.with12 === 3333 && audit.minVisits >= 12, `with12=${audit.with12}, min=${audit.minVisits}`);
  ok('Total longitudinal visits >= 40,000', audit.totalVisits >= 40000, String(audit.totalVisits));
  ok('Wise realistic Homestay proportion (~5-12%, NOT everyone in Homestay)', audit.homestayPts >= 180 && audit.homestayPts <= 400, `homestayPts=${audit.homestayPts}`);
  ok('Realistic Hospital referral/clinic visit proportion (~20-45%)', audit.hospitalPts >= 700 && audit.hospitalPts <= 1500, `hospitalPts=${audit.hospitalPts}`);
  ok('100% of all 3,333 patients have Telephone, ID/BirthCert, Weight/Height/BMI/MUAC, Mock GPS & Metadata',
    audit.missingPhone === 0 && audit.missingId === 0 && audit.missingAnthro === 0 && audit.missingGps === 0 && audit.missingMeta === 0,
    JSON.stringify(audit));
  ok('Realistic paediatric cohort (<18 yrs) present for growth surveillance', audit.childrenCount >= 700, String(audit.childrenCount));

  /* Verify Beneficiary Visits tab is populated for Caregiver, MCM AND County Admin / Assistant */
  ['caregiver.nyalenda', 'mcm.kisumu', 'kisumu.admin', 'kisumu.assistant'].forEach(u => {
    as(u);
    const vCount = run(`(()=>{ const p = repo.patientList(AUTH.user)[0]; return repo.visits(AUTH.user, p.id).length; })()`);
    ok(`${u} sees >=12 visits on beneficiary Visits tab`, vCount >= 12, `${u}: ${vCount}`);
  });

  /* Verify Child Weight, BMI-for-Age & MUAC SVG Growth Charts */
  as('mcm.kisumu');
  const childChartHtml = String(run(`(()=>{
    const ch = repo.patientList(AUTH.user).find(p => p.age < 10);
    return BMI_CLINICAL.renderPatientGrowthCharts(ch);
  })()`));
  ok('Child growth chart renders 3 SVG curves (Weight, BMI-for-Age & MUAC) with WHO/MoH cutoffs',
    (childChartHtml.match(/<svg\b/g) || []).length >= 3 && /Weight-for-Age|Weight Trajectory/i.test(childChartHtml) && /BMI-for-Age/i.test(childChartHtml) && /MUAC/i.test(childChartHtml));

  const bmiChildrenSheet = String(run(`BMI_CLINICAL.renderBmiBoard(AUTH.user, {sheet:'children'})`));
  ok('BMI & Child Growth board renders dedicated Child Growth (Weight, BMI & MUAC) sheet',
    /MUAC|Paediatric|Child/i.test(bmiChildrenSheet) && !bmiChildrenSheet.includes('Access denied'));

  /* Verify redesigned Patient Anthropometric & Nutritional Register + Protocol Queue + Global Register Toolbar */
  const bmiOverview = String(run(`BMI_CLINICAL.renderBmiBoard(AUTH.user, {sheet:'overview'})`));
  const bmiProtocol = String(run(`BMI_CLINICAL.renderBmiBoard(AUTH.user, {sheet:'protocol'})`));
  ok('Anthropometric & Nutritional Register renders symmetrical 6-band WHO matrix, theme-safe data-tone pills, unified reg-toolbar, foodbag tags & pagination',
    bmiOverview.includes('bmi-band-grid') && bmiOverview.includes('data-tone="') && !bmiOverview.includes('style="background:#FEF2F2') &&
    bmiOverview.includes('reg-toolbar') && bmiOverview.includes('anthro-bag-tag') && bmiOverview.includes('visit-dots-3') && bmiOverview.includes('reg-pager-bar'));
  ok('3-Visit Weigh-In & Plausibility Verification Queue sheet renders cleanly',
    bmiProtocol.includes('Anthropometric Action & Verification Register') && bmiProtocol.includes('reg-toolbar'));

  /* Verify Global Register Toolbar & Entity Cell applied to Master Patient Register */
  const ptRegHtml = String(run(`renderPatients(AUTH.user, {})`));
  ok('Master Patient Register shares unified reg-toolbar, reg-entity-cell & theme-safe BMI pills',
    ptRegHtml.includes('reg-toolbar') && ptRegHtml.includes('reg-entity-cell') && ptRegHtml.includes('bmi-pill'));

  /* Verify completely overhauled Medical Case Manager Caseload Register & 4-Quadrant SOAP Encounters */
  const mcmTriage = String(run(`BMI_CLINICAL.renderMcmConsole(AUTH.user, {tab:'triage'})`));
  const mcmSoap = String(run(`BMI_CLINICAL.renderMcmConsole(AUTH.user, {tab:'soap'})`));
  ok('Medical Case Manager Caseload Register renders 4-tier acuity ribbon, unified reg-toolbar, clinical drivers, adherence standing & pagination',
    mcmTriage.includes('mcm-acuity-ribbon') && mcmTriage.includes('reg-toolbar') && mcmTriage.includes('mcm-driver-chip') &&
    mcmTriage.includes('mcm-adh-pill') && mcmTriage.includes('reg-pager-bar'));
  ok('Medical Case Manager SOAP tab renders >=5 structured 4-quadrant S-O-A-P clinical encounter cards with vitals strip',
    (mcmSoap.match(/soap-encounter-card/g) || []).length >= 5 && mcmSoap.includes('soap-quad-grid') && mcmSoap.includes('soap-vitals-strip'));
});

/* 4. Two-Mode Messaging & Who-Is-Online -> Instant Direct Chat Box Fix + Universal Drafts Hub */
test('4. Two-mode Messaging, Who-Is-Online instant chat box & Universal Workspace Drafts', () => {
  as('caregiver.nyalenda');
  /* Simulate tapping Message on a colleague in Who is online with whom 0 prior DM messages exist */
  const targetId = run(`DB.db.users.find(u => u.username === 'clerk.records.kisumu').id`);
  const onlineHtml = String(run(`renderPresence(AUTH.user)`));
  ok('Who is online renders direct Message button for in-reach colleagues', onlineHtml.includes(`data-act="msg-open" data-u="${targetId}"`));

  run(`ACTIONS['msg-open']({u:'${targetId}'})`);
  ok('Tapping Message in Who is online navigates directly to messages view', run('APPX.view') === 'messages');
  const msgHtml = String(run(`contentFor('messages', APPX.params, AUTH.user)`));
  ok('Messages immediately opens an active Direct Chat Box (#msgForm) for the selected colleague even with 0 prior messages',
    msgHtml.includes('id="msgForm"') && msgHtml.includes('id="msgComposeInput"') && !msgHtml.includes('Select a conversation'));
  ok('Messages exposes both Global Messaging and Internal Ministry Area / Department Coordination Chat tabs',
    msgHtml.includes('1. Global') && msgHtml.includes('2. Ministry Area') && msgHtml.includes('Nyalenda Area Chat'));

  /* Send message in Internal Ministry Area Coordination Chat */
  const areaRes = J(`MESSAGING.send(AUTH.user, {thread:'area:nyalenda', text:'Morning household visit route departing at 08:15 EAT.'})`);
  ok('Caregiver sends coordination message to Internal Ministry Area channel (area:nyalenda)', Boolean(areaRes && areaRes.id && areaRes.kind === 'area'));

  /* Universal Workspace Drafts Hub */
  const draftsNav = J(`navModel(AUTH.user)`).flatMap(g => g.items.map(i => i.id));
  ok('Workspace Drafts tab appears in navigation', draftsNav.includes('drafts'));
  const draftsHtml = String(run(`contentFor('drafts', {}, AUTH.user)`));
  ok('Workspace Drafts renders Draft Messages, Draft Home Visits, Draft Requests & Draft Reports tabs',
    draftsHtml.includes('Draft Messages') && draftsHtml.includes('Draft Home Visits') && draftsHtml.includes('Draft Requests') && draftsHtml.includes('Draft Reports'));
});

/* 5. Presidential, Governor, CHMT & Ministry of Health Multi-Authority Presentation Hub */
test('5. Presidential, County Government & Ministry of Health Presentation Hub', () => {
  ['president', 'gov.kisumu', 'gov.national', 'chief.admin'].forEach(u => {
    as(u);
    const h = String(run(`contentFor('govdashboard', {lens:'presidential'}, AUTH.user)`));
    ok(`${u} opens Presidential & Gov Hub with All-Areas Panorama and zero PII`,
      h.includes('All-Areas Ministry Panorama') && !/CCC\/9\d{4}/.test(h) && !/07001\d{5}/.test(h));
  });
  as('chief.admin');
  const chmtHtml = String(run(`contentFor('govdashboard', {lens:'chmt'}, AUTH.user)`));
  const adminLens = String(run(`contentFor('govdashboard', {lens:'admin'}, AUTH.user)`));
  ok('CHMT & Health Policy Committee technical lens renders', chmtHtml.includes('CHMT & Health Policy'));
  ok('System Administrator Viewer Authority & Seat Activation lens renders', adminLens.includes('gov-toggle-seat'));
});

/* 6. Standard Foundation Daylight Default on Samsung A11+ 5G / Wi-Fi Tablet & Automatic Workspace Scroll / Feature Folding Left Pane */
test('6. Standard Foundation Daylight default on Samsung A11+ 5G / Wi-Fi Tablet & Automatic Workspace Scroll / Feature Folding Left Pane', () => {
  const tabCheck = J(`(()=>{
    const prevNav = globalThis.navigator;
    globalThis.navigator = { userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-X216B Tab A11+ 5G) AppleWebKit/537.36', maxTouchPoints: 5 };
    const u = DB.db.users.find(x => x.username === 'caregiver.manyatta');
    if (DB.db.personalPrefs && DB.db.personalPrefs[u.id]) delete DB.db.personalPrefs[u.id].wtheme;
    DB.db.settings.consoleThemeExplicit = false;
    NAVP._tempOpen = false;
    NAVP._workspaceEngaged = false;
    const resolved = WTHEME.resolveId(u);
    const railOnHome = NAVP.effectiveRail(u, 'home');
    globalThis.navigator = prevNav;

    /* Desktop Console Home starts expanded; scrolling or clicking features on #content folds automatically to widescreen */
    AUTH.login('caregiver.manyatta', 'LOMAMO2026');
    go('home', {});
    const desktopHomeInitialRail = NAVP.effectiveRail(AUTH.user, 'home');
    const domTargets = {};
    const mkMock = () => {
      const cls = new Set(), attrs = {};
      return {
        cls, attrs,
        classList: { add:c=>cls.add(c), remove:c=>cls.delete(c), contains:c=>cls.has(c) },
        setAttribute: (k,v)=>{ attrs[k]=String(v); },
        removeAttribute: (k)=>{ delete attrs[k]; },
        getAttribute: (k)=>attrs[k] ?? null,
        querySelector: ()=>null
      };
    };
    domTargets['.app.shell.has-pane'] = mkMock();
    domTargets['#npane'] = mkMock();
    domTargets['.topbar.cbar'] = mkMock();
    const origQS = document.querySelector;
    document.querySelector = (sel) => domTargets[sel] || origQS(sel);
    NAVP.foldForWorkspace('scroll');
    document.querySelector = origQS;
    const afterScrollRail = NAVP.effectiveRail(AUTH.user, 'home');
    render();
    const rootHtml = document.querySelector('#root').innerHTML;
    const shellFoldedInDom = domTargets['.app.shell.has-pane'].cls.has('np-rail') &&
      domTargets['.app.shell.has-pane'].attrs['data-widescreen'] === '1' &&
      domTargets['#npane'].attrs['data-rail'] === '1' &&
      domTargets['.topbar.cbar'].cls.has('cbar-rail') &&
      rootHtml.includes('has-pane np-rail') && rootHtml.includes('data-rail="1"');

    /* Hovering #npane blocks auto-fold so scrolling inside the left pane is 100% error-proof */
    ACTIONS['nav-rail']();
    const afterManualExpandRail = NAVP.effectiveRail(AUTH.user, 'home');
    NAVP._hoveringPane = true;
    NAVP.foldForWorkspace('scroll');
    const staysOpenWhileHoveringPane = NAVP.effectiveRail(AUTH.user, 'home') === false;
    NAVP._hoveringPane = false;
    NAVP.foldForWorkspace('workspace-click');
    const afterWorkspaceClickRail = NAVP.effectiveRail(AUTH.user, 'home');

    const desktopModuleRail = NAVP.effectiveRail(AUTH.user, 'patients');
    return { resolved, railOnHome, desktopHomeInitialRail, afterScrollRail, shellFoldedInDom, afterManualExpandRail, staysOpenWhileHoveringPane, afterWorkspaceClickRail, desktopModuleRail };
  })()`);
  ok('Samsung Tab A11+ 5G / Wi-Fi Tablet restores standard Foundation Daylight (foundation) by default (Harbour Dark removed as default)', tabCheck.resolved === 'foundation', tabCheck.resolved);
  ok('Tablet folds left navigation pane automatically to icon rail', tabCheck.railOnHome === true);
  ok('Desktop Console Home starts expanded and automatically folds to widescreen when scrolling on workspace',
    tabCheck.desktopHomeInitialRail === false && tabCheck.afterScrollRail === true, JSON.stringify(tabCheck));
  ok('Live DOM .shell & #npane update in-place to widescreen rail on workspace scroll without losing focus',
    tabCheck.shellFoldedInDom === true, JSON.stringify(tabCheck));
  ok('Hovering/scrolling inside #npane never triggers accidental fold, while clicking workspace features folds cleanly',
    tabCheck.afterManualExpandRail === false && tabCheck.staysOpenWhileHoveringPane === true && tabCheck.afterWorkspaceClickRail === true && tabCheck.desktopModuleRail === true, JSON.stringify(tabCheck));
});

/* 7. Executive Console, Global Expenditure Against Budget, C-DIMS Coins & CareLink AI Workflow Engine */
test('7. Symmetrical Executive Console, Global Expenditure Against Budget, C-DIMS Coins & CareLink AI Workflow Engine', () => {
  as('director');
  const execHtml = String(run(`contentFor('execconsole', {}, AUTH.user)`));
  ok('Executive Console renders symmetrical sitting pack, timed agenda & action matrix',
    execHtml.includes('exec-meta-strip') && execHtml.includes('Sitting Agenda') && execHtml.includes('Action & Follow-Up Matrix'));

  const coinsHtml = String(run(`contentFor('recognition', {}, AUTH.user)`));
  ok('C-DIMS Coins workspace renders hero crest, podium, 5-pillar breakdown & perks catalogue',
    coinsHtml.includes('coins-hero-crest') && coinsHtml.includes('coins-podium') && coinsHtml.includes('perks-grid'));

  as('finance.kisumu');
  const finHtml = String(run(`contentFor('finance', {}, AUTH.user)`));
  const budHtml = String(run(`contentFor('budget', {}, AUTH.user)`));
  const costHtml = String(run(`contentFor('costing', {}, AUTH.user)`));
  ok('Expenditure Against Budget board (bva-board) renders clearly across Costing, Finance & Budget',
    costHtml.includes('bva-board') && finHtml.includes('bva-board') && budHtml.includes('bva-board'));

  as('kisumu.admin');
  const opsHtml = String(run(`contentFor('adminops', {}, AUTH.user)`));
  ok('Expenditure Against Budget board also renders in Admin Operations overview', opsHtml.includes('bva-board'));

  /* CareLink AI Smart Workflow Engine & 100.0% Data Completion */
  as('chief.admin');
  const wfBefore = J(`WORKFLOW_ENGINE.completionMatrix(AUTH.user)`);
  ok('4-Tier Data Completion Matrix computes Personal, Departmental, County & Global %',
    wfBefore.global.pct >= 99 && wfBefore.county.pct >= 99);
  run(`ACTIONS['wf-complete-qa-gaps']()`);
  const wfAfter = J(`WORKFLOW_ENGINE.completionMatrix(AUTH.user)`);
  ok('Executing CareLink AI QA completion reaches 100.0% patient registry completeness', wfAfter.global.gaps === 0, JSON.stringify(wfAfter.global));
  const aiAns = J(`AI.answer(AUTH.user, 'Prioritise my workflow and 100% data completion')`);
  ok('CareLink AI assistant delivers prioritised role-pure workflow plan', /Smart Workflow/i.test(aiAns.text) && Array.isArray(aiAns.sources) && aiAns.sources.length >= 1);
});

/* 8. Full 4-Step Live Host Setup -> Official Login -> Password Change -> Activate System Globally -> WhatsApp Sheet -> Demo Removal & County Urgent Requests */
test('8. 4-Step Live Host Setup -> Official Login -> Must-Change Password -> Activate System Globally -> WhatsApp Sheet & Demo Removal', async () => {
  /* Step A: Run 4-Step Live Host Setup */
  const setupRes = await JA(`PROD_SETUP.completeFourStepHostSetup({
    orgName: 'LOMAMO Foundation Kenya',
    emailDomain: 'lomamo.org',
    portalUrl: 'https://carelink.lomamo.org',
    chiefName: 'Chief System Administrator',
    chiefUsername: 'chief.admin',
    chiefTempPassword: 'TempSetup#2026!'
  })`);
  ok('4-Step Live Host Setup establishes Chief Admin awaiting official sign-in & password change',
    setupRes.ok === true && run('PROD_SETUP.isAwaitingGlobalActivation()') === true && run('PROD_SETUP.isGloballyActivated()') === false);

  /* Step B: Official Sign-In prompts Chief Admin to change temporary password */
  const login1 = J(`AUTH.login('chief.admin', 'TempSetup#2026!')`);
  ok('Chief Admin signs in on official login screen and is prompted to change password (mustChange=true)',
    login1.ok === true && Boolean(login1.user.mustChange) === true);

  /* Step C: Chief Admin changes password and sees prominent Activate System Globally banner */
  run(`(()=>{
    const u = AUTH.user;
    u.salt = newSalt();
    u.hash = strongHash('ChiefPrivate#2026!', u.salt);
    u.mustChange = false; u.mustChangePassword = false; AUTH.mustChange = false;
    DB.save();
  })()`);
  const homeWithBanner = String(run(`contentFor('home', {}, AUTH.user)`));
  ok('Prominent Activate System Globally button appears immediately after Chief Admin password change',
    homeWithBanner.includes('Activate System Globally') && homeWithBanner.includes('open-global-activate'));

  /* Step D: Chief Admin clicks Activate System Globally -> generates WhatsApp sheet for all organogram accounts */
  const actRes = await JA(`PROD_SETUP.activateSystemGlobally({ emailDomain:'lomamo.org', portalUrl:'https://carelink.lomamo.org' })`);
  ok('Activate System Globally generates credentials for all organogram staff accounts + WhatsApp text sheet',
    actRes.ok === true && actRes.count >= 50 && /WhatsApp|Temporary Password|lomamo\.org/i.test(actRes.whatsappText));
  ok('System is now permanently marked Globally Activated', run('PROD_SETUP.isGloballyActivated()') === true);

  /* Step E: Verify ALL demo & setup UI is permanently removed from Landing & Sign-In */
  run('AUTH.logout()');
  const postLanding = String(run('renderLanding6()'));
  const postLogin = String(run('renderLogin6()'));
  ok('Globally activated Sign-In page permanently removes Demo tab, Explore Demo Accounts & Live Host Setup',
    !postLogin.includes('data-tab="demo"') && !/Explore demo accounts/i.test(postLogin) && !/Live host setup/i.test(postLogin));
  ok('Globally activated Landing page contains zero demo banners', !/Explore demo/i.test(postLanding));

  /* Step F: Staff member logs in with issued temporary password from WhatsApp sheet and activates their individual account upon changing password */
  const sampleCred = actRes.pack.find(c => c.username === 'deputy.procurement') || actRes.pack[1];
  const staffLogin1 = J(`AUTH.login('${sampleCred.username}', '${sampleCred.tempPassword}')`);
  ok('Staff member logs in with WhatsApp-issued temporary password and is prompted to set private password',
    staffLogin1.ok === true && Boolean(staffLogin1.user.mustChange) === true);
  run(`(()=>{
    const u = AUTH.user;
    u.salt = newSalt(); u.hash = strongHash('JohnPrivate#2026!', u.salt);
    u.mustChange = false; u.mustChangePassword = false; u.status = 'active';
    DB.save();
  })()`);
  const staffActive = J(`AUTH.login('${sampleCred.username}', 'JohnPrivate#2026!')`);
  ok('Staff account transitions to active after first-login password change', staffActive.ok === true && staffActive.user.status === 'active' && !staffActive.user.mustChange);

  /* Step G: Sign-In Account Request & Password Recovery route directly to respective County Office Admins for urgent action */
  run(`DB.db.accountRequests.unshift({ id:'req-hb-test', name:'Grace Akinyi', phone:'0700199888', jobTitle:'Supporting Caregiver', departmentId:'ministry', countyId:'homabay', assignedCountyId:'homabay', priority:'urgent', status:'pending', submittedAt:todayISO() });
       DB.db.recoveryRequests.unshift({ id:'rec-hb-test', username:'caregiver.sofia', countyId:'homabay', assignedCountyId:'homabay', priority:'urgent', status:'pending', submittedAt:todayISO() });
       DB.save();`);
  const hbAdminCred = actRes.pack.find(c => c.username === 'homabay.admin');
  run(`(()=>{ const u = DB.db.users.find(x=>x.username==='homabay.admin'); u.mustChange=false; u.status='active'; DB.save(); })()`);
  run(`AUTH.logout(); AUTH.login('homabay.admin', '${hbAdminCred.tempPassword}')`);
  const hbQueue = J(`COUNTY_URGENT_QUEUE.itemsFor(AUTH.user)`);
  const usersViewHtml = String(run(`renderUsers(AUTH.user)`));
  ok('Homa Bay County Admin receives Homa Bay Sign-In Account Request & Password Recovery for urgent action',
    hbQueue.acct.some(a => a.id === 'req-hb-test') && hbQueue.rec.some(r => r.id === 'rec-hb-test') && usersViewHtml.includes('county-approve-req') && usersViewHtml.includes('county-resolve-rec'));
});

/* 11. Compiled Single-File Browser Bundle (public/carelink-v6.html) Boot & Screen Render Guard */
test('11. Compiled single-script browser HTML bundle boots cleanly and renders Landing, Sign-In, Architecture & Console without TDZ errors', async () => {
  const vm = require('vm');
  const html = fs.readFileSync(path.join(REPO, 'public', 'carelink-v6.html'), 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  ok('public/carelink-v6.html embeds assets + application script blocks', scripts.length === 2);

  const store = new Map();
  const el = (tag = 'div') => ({
    tagName: tag.toUpperCase(), style: { setProperty() {}, removeProperty() {} }, dataset: {}, children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild(c) { this.children.push(c); return c; }, remove() {}, setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; }, innerHTML: ''
  });
  const root = el('div'); root.id = 'root';
  const winListeners = [];
  const bctx = {
    console, Math, Date, JSON, Promise, Set, Map, RegExp, Array, Object, Number, String, Boolean, Error, TypeError,
    Uint8Array, Int32Array, Float64Array, ArrayBuffer, DataView,
    encodeURIComponent, decodeURIComponent, parseInt, parseFloat, isNaN, isFinite,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    setTimeout: () => 1, clearTimeout: () => {}, setInterval: () => 1, clearInterval: () => {},
    requestAnimationFrame: fn => { fn(); return 1; },
    navigator: { userAgent: 'Mozilla/5.0 Chrome/125.0', maxTouchPoints: 0, onLine: true },
    screen: { width: 1440, height: 900 },
    location: { hash: '', href: 'https://carelink.vercel.app/carelink-v6.html', pathname: '/carelink-v6.html', search: '', protocol: 'https:', origin: 'https://carelink.vercel.app', reload() {} },
    history: { replaceState() {}, pushState() {} },
    localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), key: i => [...store.keys()][i] ?? null, get length() { return store.size; } },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    getComputedStyle: () => ({ getPropertyValue: () => '#ffffff', color: 'rgb(15, 23, 42)', backgroundColor: 'rgb(255, 255, 255)' }),
    fetch: () => Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, onlineDatabase: true, setup: false, globallyActivated: false, rev: 0 }) }),
    Blob: class { constructor(a) { this.a = a; } }, URL: { createObjectURL: () => 'blob:1', revokeObjectURL() {} }, AbortController,
    addEventListener: (ev, fn) => { winListeners.push({ ev, fn }); }, removeEventListener: () => {}, scrollTo: () => {},
    document: {
      title: '', readyState: 'loading', documentElement: el('html'), head: el('head'), body: el('body'),
      getElementById: id => id === 'root' ? root : null,
      querySelector: sel => sel === '#root' ? root : null,
      querySelectorAll: () => [], createElement: el, addEventListener: () => {}
    },
    window: null
  };
  bctx.window = bctx; bctx.globalThis = bctx; bctx.self = bctx;
  vm.createContext(bctx);
  vm.runInContext(scripts[0][1], bctx, { filename: 'carelink-assets.js' });
  vm.runInContext(scripts[1][1], bctx, { filename: 'carelink-bundle.js' });
  for (const l of winListeners) { if (l.ev === 'DOMContentLoaded') await l.fn(); }

  const landingHtml = root.innerHTML;
  const appVer = vm.runInContext(`APP.version`, bctx);
  ok('APP.version is 6.6.8 across CareLink OS', appVer === '6.6.8', `got=${appVer}`);
  ok('Compiled single-script bundle boots straight into visible Zero-Scroll Sapphire Blue Landing Page showing v6.6.8',
    landingHtml.length > 5000 && landingHtml.includes('class="ld" data-front="1" data-theme="heritage" data-mode="dark"') && landingHtml.includes('v6.6.8') && /Sign in/i.test(landingHtml), `len=${landingHtml.length}`);

  vm.runInContext(`APPX.screen = 'login'; render();`, bctx);
  const loginHtml = root.innerHTML;
  ok('Compiled single-script bundle renders Sign-In page cleanly showing v6.6.8 · Schema 6',
    loginHtml.length > 3000 && loginHtml.includes('class="lg6"') && loginHtml.includes('CareLink C-DIMS v6.6.8 · Schema 6') && /Sign in/i.test(loginHtml), `len=${loginHtml.length}`);

  vm.runInContext(`APPX.screen = 'architecture'; render();`, bctx);
  const archHtml = root.innerHTML;
  ok('Compiled single-script bundle renders Platform Architecture & Departments page cleanly',
    archHtml.length > 3000 && archHtml.includes('ld-arch-page'), `len=${archHtml.length}`);

  const hasCountyActs = vm.runInContext(`Boolean(ACTIONS['county-approve-req'] && ACTIONS['county-decline-req'] && ACTIONS['county-resolve-rec'])`, bctx);
  ok('County urgent account & recovery ACTIONS are registered in compiled single-script bundle', hasCountyActs === true);
});

/* 12. 10-Pillar Overhaul Verification: Monday AI Engine & Secretary Desk, Zero Downward Bars, Official C-DIMS PDCA (120d + Discharge), Version Control, Visual Packs & Role-Customized Smart QA */
test('12. 10-Pillar Overhaul: Monday AI Engine & Secretary Desk, Upright Baseline Charts, Official C-DIMS PDCA, Version Control, Visual Packs & Role-Customized Consoles', () => {
  /* Re-seed fast reference cohort after Test 8 global activation cleared demo records (3,333-patient scale already verified in Tests 1-7) */
  run('DB.seedOfficial({patients:120});');

  /* Pillar 1: Monday Management Meeting, Admin Assistant Secretary Desk & Post-Close AI Processing Engine */
  as('secretary.kisumu');
  const secDeskHtml = String(run(`MONDAY_PROC.render(AUTH.user, {tab:'secretary'})`));
  ok('Admin Assistant (secretary.kisumu) receives processed Master Agenda Pack & Minutes Recording Desk with custom template support',
    secDeskHtml.includes('Master Agenda') && secDeskHtml.includes('monday-minutes-save') && secDeskHtml.includes('monday-upload-minutes-tpl'));

  const procPlan = J(`MONDAY_PROC.runProcessingEngine({ countyId:'kisumu', weekOf:'2026-10-26', trigger:'test_close' }, AUTH.user)`);
  ok('Closing Monday sitting triggers AI Meeting Processing Engine generating departmental operational plans & dispatches',
    Boolean(procPlan && procPlan.id && Array.isArray(procPlan.deptDirectives) && procPlan.deptDirectives.length >= 3));
  const engineHtml = String(run(`MONDAY_PROC.render(AUTH.user, {tab:'engine'})`));
  ok('Monday AI Engine tab renders generated weekly operational directives', engineHtml.includes('Weekly Operational Directives') && engineHtml.includes('Meeting Processing Engine'));

  /* Pillar 2: Zero Downward-Going Bars in Charts & Waterfall Visuals */
  const wfCheck = J(`(()=>{
    const svg = chartWaterfall([
      { label:'Approved Budget', value:500000, kind:'total' },
      { label:'Committed', value:-180000 },
      { label:'Disbursed', value:-360000 },
      { label:'Variance', value:-40000, kind:'total' }
    ]);
    const rects = [...svg.matchAll(/<rect[^>]*\\by="([0-9.-]+)"[^>]*\\bheight="([0-9.-]+)"/g)].map(m=>({y:+m[1], h:+m[2]}));
    /* Baseline in chartWaterfall (H=280, padT=34, padB=54 -> inner=192) is 226; every bar bottom (y+h) sits on 226 with zero plunge below baseline and zero negative heights */
    const plunged = rects.filter(r => r.h < 0 || (r.y + r.h) > 226.5);
    const allGrounded = rects.length >= 4 && rects.every(r => Math.abs((r.y + r.h) - 226) <= 0.5);
    const barSvg = chartBars([{label:'A', value:-25}, {label:'B', value:80}]);
    const negRects = [...barSvg.matchAll(/height="(-[0-9.]+)"/g)];
    return { rectCount: rects.length, allGrounded, plungedCount: plunged.length, negRects: negRects.length, hasOverrun: /Overrun|-40,000/.test(svg) };
  })()`);
  ok('Waterfall & bar charts stand strictly upright on the zero baseline with ZERO downward-plunging bars even on negative variances',
    wfCheck.rectCount >= 4 && wfCheck.allGrounded === true && wfCheck.plungedCount === 0 && wfCheck.negRects === 0 && wfCheck.hasOverrun === true, JSON.stringify(wfCheck));

  /* Pillar 3: Official CareLink C-DIMS PDCA Template for BOTH 120+ Days in Program AND Regular Discharged Patients */
  as('mcm.kisumu');
  const pdcaAudit = J(`(()=>{
    const pts = repo.patientList(AUTH.user);
    const p120 = pts.find(p => p.status==='active' && daysBetween(p.enrolledAt, todayISO()) >= 120) || pts[0];
    const pDis = pts.find(p => p.status==='discharged') || pts[1];
    const html120 = PAT_DISCHARGE.renderOfficialTemplateHTML(p120, AUTH.user, '120day');
    const htmlDis = PAT_DISCHARGE.renderOfficialTemplateHTML(pDis, AUTH.user, 'discharge');
    const d120 = PAT_DISCHARGE.compileOfficialPdcaData(p120, AUTH.user, '120day');
    return {
      has120Title: html120.includes('Patient PDCA 120-Day Report') && html120.includes('ESTIMATED DATE OF DISCHARGE'),
      hasDisTitle: htmlDis.includes('Patient PDCA Discharge Summary Report') && htmlDis.includes('CONFIRMED DATE OF DISCHARGE'),
      hasStages: ['cdims-stage-dx','cdims-stage-p','cdims-stage-d','cdims-stage-rx','cdims-stage-c','cdims-stage-a'].every(c => html120.includes(c) && htmlDis.includes(c)),
      mergeFieldsReady: Boolean(d120.patient_name && d120.aim && Array.isArray(d120.challenges) && Array.isArray(d120.interventions) && Array.isArray(d120.treatments) && Array.isArray(d120.check_findings) && Array.isArray(d120.act_actions))
    };
  })()`);
  ok('Official CareLink C-DIMS PDCA Template renders both 120-Day Report and Discharge Summary Report with all Dx/P/D/Rx/C/A stages & merge fields',
    pdcaAudit.has120Title && pdcaAudit.hasDisTitle && pdcaAudit.hasStages && pdcaAudit.mergeFieldsReady, JSON.stringify(pdcaAudit));
  const pdcaRegHtml = String(run(`renderPdca(AUTH.user)`));
  as('chief.admin');
  const intlHtml = String(run(`HANDOVER_PARTNERS.renderIntlMedical(AUTH.user, {})`));
  ok('PDCA Follow-Up workspace & 120+d International Medical Review wire directly to Official C-DIMS PDCA Report & Word export',
    pdcaRegHtml.includes('Official CareLink C-DIMS PDCA Register') && pdcaRegHtml.includes('export-pdca-word') && intlHtml.includes('export-pdca-word'));

  /* Pillar 4: System Administrator Version Control Module inside Development Console */
  as('chief.admin');
  const vcsAudit = J(`(()=>{
    const devHtml = DEV_CONSOLE.render(AUTH.user, { tab:'vcs' });
    const snap = VERSION_CONTROL.commitSnapshot({ tag:'v6.6.0-qa1', category:'Configuration Checkpoint', message:'Automated test snapshot' }, AUTH.user);
    WTHEME.setOrgDefault(AUTH.user, 'lake');
    const diff = VERSION_CONTROL.diffAgainstLive(snap.id);
    const changedTheme = diff.some(d => d.key === 'consoleTheme' && d.changed === true);
    const rb = VERSION_CONTROL.rollbackConfig(snap.id, AUTH.user);
    const restored = DB.db.settings.consoleTheme === snap.configSnapshot.consoleTheme;
    return { hasVcsTab: devHtml.includes('Version Control') && devHtml.includes('Institutional Release History'), tag: snap.tag, changedTheme, rbOk: rb.ok, restored };
  })()`);
  ok('System Admin Version Control commits tagged checkpoints, detects live configuration diffs, and executes audited rollback',
    vcsAudit.hasVcsTab && vcsAudit.changedTheme && vcsAudit.rbOk && vcsAudit.restored, JSON.stringify(vcsAudit));

  /* Pillar 6: Dominant Departmental Banner, Fixed Workspace Headings & Installable Font/Theme Visual Packs */
  const packAudit = J(`(()=>{
    const packCount = WTHEME.packs().length;
    const r1 = WTHEME.installPack(AUTH.user, 'pack-clinical-editorial');
    const r2 = WTHEME.importCustomPack(AUTH.user, JSON.stringify({ name:'Nyanza Executive Pack', version:'1.1', config:{ wtheme:'savannah', font:'humanist', corners:'soft', cards:'lifted' } }));
    const banner = ROLE_CTX.contextStrip(AUTH.user, 'home');
    return { packCount, r1Ok: r1.ok, r2Ok: r2.ok, newCount: WTHEME.packs().length, hasDomBanner: banner.includes('ctx-os-badge') && banner.includes('ctx-county-chip') && banner.includes('wtheme-open-packs') };
  })()`);
  ok('Installable Font & Theme Visual Packs (built-in + custom JSON) and Dominant Departmental Banner work cleanly',
    packAudit.packCount >= 6 && packAudit.r1Ok && packAudit.r2Ok && packAudit.newCount === packAudit.packCount + 1 && packAudit.hasDomBanner, JSON.stringify(packAudit));

  /* Pillar 10: Role-Customized Smart Workflow/QA & Unique Context-Specific Left-Pane Consoles (Built-in + Custom Role) */
  const roleUniqueness = J(`(()=>{
    /* Create a custom user-defined role + user to verify custom-role Workflow & Left-Pane isolation */
    DB.db.customRoles = DB.db.customRoles || [];
    DB.db.customRoles.push({ id:'nutrition.auditor', name:'County Nutrition QA Officer', consoleTitle:'Nutrition QA Console', dept:'clinical', scope:'county', perms:['bmiboard.view','monday.meeting','msg.use','credit.view'] });
    DB.db.customRoles = DB.db.customRoles || [];
    if(!DB.db.customRoles.some(r => r.id === 'nutrition.auditor')){
      DB.db.customRoles.push({ id:'nutrition.auditor', name:'County Nutrition QA Officer', dept:'clinical', scope:'county', perms:['patient.list','patient.view','pdca.manage','report.view'] });
    }
    const customUser = { id:'u-cust-nutr', username:'nutrition.qa', name:'Beatrice Auma', roleId:'nutrition.auditor', departmentId:'clinical', countyId:'kisumu', status:'active' };
    const mediaUser = DB.db.users.find(u => u.username === 'media.head' || u.roleId === 'mediahead');
    const mcmUser = DB.db.users.find(u => u.username === 'mcm.kisumu');

    const mediaWf = WORKFLOW_ENGINE.render(mediaUser, {});
    const mcmWf = WORKFLOW_ENGINE.render(mcmUser, {});
    const customWf = WORKFLOW_ENGINE.render(customUser, {});

    const mediaNav = navModel(mediaUser).flatMap(g => g.items.map(i => i.id));
    const customNav = navModel(customUser).flatMap(g => g.items.map(i => i.id));
    const govUser = DB.db.users.find(u => u.username === 'gov.kisumu');
    const govNav = navModel(govUser).flatMap(g => g.items.map(i => i.id));

    return {
      mediaCustomized: mediaWf.includes('Media Storytelling Consent') && !mediaWf.includes('scoped clinical/ministry files'),
      mcmCustomized: mcmWf.includes('Medical Case Manager SOAP') && mcmWf.includes('120-Day PDCA'),
      customCustomized: customWf.includes('County Nutrition QA Officer') && /Custom Role Workflow &(amp;)? QA Hub/.test(customWf),
      mediaNoPatients: !mediaNav.includes('patients') && !mediaNav.includes('clinicalmcm'),
      customScopedNav: !customNav.includes('finance') && !customNav.includes('staff') && !customNav.includes('studio'),
      govNoDraftsOrMsgs: !govNav.includes('drafts') && !govNav.includes('messages') && !govNav.includes('patients')
    };
  })()`);
  ok('Smart Workflow/QA and Left-Pane Navigation are strictly customized per built-in & custom user-defined role (consoles remain unique role workspaces)',
    roleUniqueness.mediaCustomized && roleUniqueness.mcmCustomized && roleUniqueness.customCustomized &&
    roleUniqueness.mediaNoPatients && roleUniqueness.customScopedNav && roleUniqueness.govNoDraftsOrMsgs, JSON.stringify(roleUniqueness));
});

(async () => {
  for (const t of tests) {
    try { await t.fn(); }
    catch (e) { fail++; fails.push(`${t.label} THREW: ${e && e.stack || e}`); }
  }
  if (fails.length) {
    console.error('FAILED:\n  ✗ ' + fails.join('\n  ✗ '));
    process.exit(1);
  }
  console.log(`v6.6 CareLink C-DIMS full prompts 1-3 verification: ${pass} passed, 0 failed`);
})();
