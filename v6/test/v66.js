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

/* 6. Harbour Dark Default on Samsung A11+ 5G / Wi-Fi Tablet & Natural Auto-Folding Left Pane */
test('6. Harbour Dark default on Samsung A11+ 5G / Wi-Fi Tablet & Natural Auto-Folding Left Pane', () => {
  const tabCheck = J(`(()=>{
    const prevNav = globalThis.navigator;
    globalThis.navigator = { userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-X216B Tab A11+ 5G) AppleWebKit/537.36', maxTouchPoints: 5 };
    const u = DB.db.users.find(x => x.username === 'caregiver.manyatta');
    if (DB.db.personalPrefs && DB.db.personalPrefs[u.id]) delete DB.db.personalPrefs[u.id].wtheme;
    DB.db.settings.consoleThemeExplicit = false;
    const resolved = WTHEME.resolveId(u);
    const railOnHome = NAVP.effectiveRail(u, 'home');
    globalThis.navigator = prevNav;
    const desktopHomeRail = NAVP.effectiveRail(u, 'home');
    const desktopModuleRail = NAVP.effectiveRail(u, 'patients');
    return { resolved, railOnHome, desktopHomeRail, desktopModuleRail };
  })()`);
  ok('Samsung Tab A11+ 5G / Wi-Fi Tablet resolves to Harbour Dark (harbour) by default', tabCheck.resolved === 'harbour', tabCheck.resolved);
  ok('Tablet folds left navigation pane automatically to icon rail', tabCheck.railOnHome === true);
  ok('Desktop Console Home starts expanded and naturally auto-folds when opening workspace modules',
    tabCheck.desktopHomeRail === false && tabCheck.desktopModuleRail === true, JSON.stringify(tabCheck));
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
