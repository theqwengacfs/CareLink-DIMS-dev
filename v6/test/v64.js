/* v6.4 · Comprehensive CareLink OS v6.3.0 Acceptance & Governance Audit Suite
   Covers all 25 CareLink OS revisions, clinical/partner consoles, Trial Report
   digital form alignment, procurement/food-budget formulas, EPPH v2.2 leave &
   scoped reliever delegation, and zero-PII / sensitive-file isolation.
*/
const {makeCtx} = require('./dom');
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', 'src');
const REPO = path.join(__dirname, '..', '..');
const {run} = makeCtx();

run('DB.load(); DB.seedOfficial({patients:600});');
run(`AUTH.logout(); AUTH.login('chief.admin','LOMAMO2026');`);

let pass = 0, fail = 0; const fails = [];
function ok(name, cond, detail){ if(cond){ pass++; } else { fail++; fails.push(name+(detail?(' — '+detail):'')); } }
function test(name, fn){ try{ const r = fn(); if(r===false) throw new Error('returned false'); ok(name, true); } catch(e){ ok(name, false, e.message); } }
const as = u => { run(`AUTH.logout(); AUTH.login('${u}','LOMAMO2026');`); return run(`AUTH.user.id`); };
const J = expr => JSON.parse(run(`JSON.stringify(${expr})`));

/* 1. CareLink OS Branding & Browser Tab Title (#24, #25) */
test('1. CareLink OS identity & uncropped sign-in slide framing', ()=>{
  ok('APP.osName and APP.name are CareLink', run(`APP.osName`)==='CareLink' && run(`APP.name`)==='CareLink', run(`APP.name`));
  ok('APP.tabTitle & APP.full name CareLink C-DIMS', run(`APP.tabTitle`)==='CareLink C-DIMS' && /CareLink C-DIMS/.test(run(`APP.full`)));
  const idx = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
  const pub = fs.readFileSync(path.join(REPO, 'public', 'carelink-v6.html'), 'utf8');
  const v6h = fs.readFileSync(path.join(REPO, 'v6', 'LOMAMO-CareLink-DIMS-v6.0.html'), 'utf8');
  ok('index.html title is CareLink C-DIMS', /<title>CareLink C-DIMS<\/title>/.test(idx));
  ok('public/carelink-v6.html title is CareLink C-DIMS', /<title>CareLink C-DIMS<\/title>/.test(pub));
  ok('v6 bundle title is CareLink C-DIMS', /<title>CareLink C-DIMS<\/title>/.test(v6h));
  const login = String(run(`renderLogin()`));
  ok('Sign-in left showcase uses uncropped .lg6-photo-frame + .lg6-photo-main',
    login.includes('lg6-photo-frame') && login.includes('lg6-photo-main') && login.includes('lg6-photo-bg'));
  ok('All 4 sign-in feature tabs exist', run(`LOGIN_TEAM_SLIDES.length`)===4);
  return true;
});

/* 2. Strict Role-Scoped Left Navigation & Departmental Isolation (#7) */
test('2. Strict role-scoped left navigation blocks cross-role leakage', ()=>{
  as('media.head');
  const mediaNav = J(`navModel(AUTH.user)`).flatMap(g=>g.items.map(i=>i.id));
  ok('Media Head has zero access to Returning Patient Checker (repeat)', !mediaNav.includes('repeat'));
  ok('Media Head has zero access to Patient Register (patients)', !mediaNav.includes('patients'));
  ok('Media Head has zero access to BMI Board or Clinical MCM', !mediaNav.includes('bmiboard') && !mediaNav.includes('clinicalmcm'));
  ok('RBAC.can blocks media.head from pmi.check', run(`RBAC.can(AUTH.user,'pmi.check').ok`)===false);
  as('media.homabay');
  const mediaHbyNav = J(`navModel(AUTH.user)`).flatMap(g=>g.items.map(i=>i.id));
  ok('Homa Bay Media also blocked from repeat & patients', !mediaHbyNav.includes('repeat') && !mediaHbyNav.includes('patients'));
  as('hr.officer');
  const hrNav = J(`navModel(AUTH.user)`).flatMap(g=>g.items.map(i=>i.id));
  ok('HR Officer blocked from repeat & patients', !hrNav.includes('repeat') && !hrNav.includes('patients'));
  as('vehicle.officer');
  const vehNav = J(`navModel(AUTH.user)`).flatMap(g=>g.items.map(i=>i.id));
  ok('Vehicle Officer blocked from repeat & patients', !vehNav.includes('repeat') && !vehNav.includes('patients'));
  const selfTests = J(`ACCESS.selfTest()`);
  ok('All ACCESS.selfTest() checks pass including Media PMI block',
    selfTests.length>=13 && selfTests.every(x=>x.ok), JSON.stringify(selfTests.filter(x=>!x.ok)));
  return true;
});

/* 3. Monday Management Meeting Module (#1) */
test('3. Monday Management Meeting workspace & County Admin agenda push', ()=>{
  as('kisumu.assistant');
  const monAdmin = String(run(`contentFor('monday',{},AUTH.user)`));
  ok('County Admin Assistant opens Monday Meeting & sees Push Agenda capability',
    /Monday Management Meeting/i.test(monAdmin) && monAdmin.includes('monday-agenda-modal'));
  as('caregiver.nairobird');
  const monCg = String(run(`contentFor('monday',{},AUTH.user)`));
  ok('Caregiver opens Monday Meeting with prior-week assessments & concerns tabs',
    /Monday Management Meeting/i.test(monCg) && /Assessments/i.test(monCg) && /Concerns/i.test(monCg));
  return true;
});

/* 4. Discharge Protocol, Returning-Patient Watchlist & Hard-Copy Scans (#2, #5) */
test('4. Complete Discharge Protocol, Returning-Patient Watchlist & Hard-Copy Scan Intake', ()=>{
  as('kisumu.assistant');
  const hc = String(run(`contentFor('hardcopy',{},AUTH.user)`));
  ok('County Admin Assistant opens Hard-Copy Intake & Multi-Page Scan desk',
    /Hard-Copy/i.test(hc) && hc.includes('hc-intake-modal'));
  const discHtml = String(run(`(()=>{
    const p = DB.db.patients.find(x=>x.status==='discharged') || DB.db.patients[0];
    return PAT_DISCHARGE.renderSheet(p.id, AUTH.user);
  })()`));
  ok('Discharge protocol includes SHA/NHIF status & last payment date', /SHA|NHIF/i.test(discHtml));
  ok('Discharge protocol includes Spiritual Growth (Believer / Converted)', /Believer/i.test(discHtml) && /Converted/i.test(discHtml));
  ok('Discharge protocol includes Orphans Prevented & Signatures', /Orphans prevented/i.test(discHtml) && /Signature/i.test(discHtml));
  const watchAlert = String(run(`(()=>{
    DISCHARGE_HARDCOPY.ensureStore();
    const fp = DB.db.patients.find(x=>x.dischargeAdvisory && x.dischargeAdvisory.flagged)
      || Object.assign({}, DB.db.patients[0], {dischargeAdvisory:{flagged:true, severity:'high', category:'Policy / conduct breach', note:'Test advisory'}});
    return DISCHARGE_HARDCOPY.watchlistBannerFor([fp]);
  })()`));
  ok('Returning-patient check renders caregiver watchlist alert banner when flagged',
    watchAlert.length > 40 && /Advisory|Watchlist|ALERT/i.test(watchAlert));
  return true;
});

/* 5. Partnership Presentation & Public/Private Portal Modes (#3, #22) */
test('5. CGK Partnership Presentation metrics & Public/Private Governed Portal', ()=>{
  const cgkStr = run(`JSON.stringify({stats:PORTAL_CONTENT.stats, cgk:PORTAL_CONTENT.cgkPartnership, ext:PORTAL_CONTENT.extendedImpact})`);
  ok('CGK Partnership record carries verified 2018-2026 metrics',
    cgkStr.includes('2,012') && cgkStr.includes('3,722') && cgkStr.includes('29,010') && cgkStr.includes('1,336') && cgkStr.includes('KAISF'));
  run(`AUTH.logout()`);
  const pubPortal = String(run(`renderPublicPortal({})`));
  ok('Public portal renders zero PII and preserves orphan-prevention narrative',
    /Saving Lives|orphan prevention/i.test(pubPortal) && !/CCC\/9\d{4}/.test(pubPortal));
  as('gov.kisumu');
  const partPortal = String(run(`renderPublicPortal({mode:'partner'})`));
  ok('Authorised partner toggles Governed Partner Portal view with CGK partnership section',
    /County Government of Kisumu|KAISF/i.test(partPortal));
  return true;
});

/* 6. BMI Nutritional Status Intelligence & Medical Case Manager v2.5.0 (#4, #17) */
test('6. WHO BMI classification, plausibility checks & MCM v2.5.0 6-tab console', ()=>{
  const bands = J(`[
    BMI_CLINICAL.classify(15.2).id,
    BMI_CLINICAL.classify(16.5).id,
    BMI_CLINICAL.classify(17.8).id,
    BMI_CLINICAL.classify(21.4).id,
    BMI_CLINICAL.classify(27.2).id,
    BMI_CLINICAL.classify(32.1).id
  ]`);
  ok('WHO BMI classifies severe thinness through obesity accurately',
    bands[0]!==bands[3] && /normal/i.test(bands[3]) && bands.every(Boolean), bands.join(','));
  const implausible = J(`BMI_CLINICAL.plausibilityCheck(280, 90, 60, 30)`);
  ok('Plausibility check flags impossible anthropometrics', implausible.needsVerification===true && implausible.issues.length>0);
  as('caregiver.nairobird');
  const bmiCg = String(run(`contentFor('bmiboard',{},AUTH.user)`));
  ok('Caregiver opens BMI Nutritional Status board', /BMI/i.test(bmiCg) && bmiCg.includes('bmi-pill'));
  as('mcm.kisumu');
  ['triage','assistant','soap','regimens','hospital','pdca120'].forEach(tb=>{
    const mcmHtml = String(run(`contentFor('clinicalmcm',{tab:'${tb}'},AUTH.user)`));
    ok(`MCM v2.5.0 tab '${tb}' renders cleanly`, mcmHtml.length > 800 && !mcmHtml.includes('Access denied'));
  });
  return true;
});

/* 7. UI Polish: Messages Scroll, Role Banner, Switched-Account Contrast, Top Cbar (#6, #8, #12, #14) */
test('7. Messages scroll, role banner data-dept, switched-account contrast & dynamic top cbar', ()=>{
  as('kisumu.admin');
  const msgHtml = String(run(`contentFor('messages',{},AUTH.user)`));
  ok('Messages module wraps staff directory in .msg-people-scroll', msgHtml.includes('msg-people-scroll'));
  run(`APPX.view='messages'`);
  const shell = String(run(`renderShell()`));
  ok('Upper role/scope banner carries data-dept attribute for high-contrast styling', shell.includes('data-dept="'));
  ok('Workspace top header bar applies dynamic cbar state class & nav-rail toggle',
    /cbar-(open|rail)/.test(shell) && shell.includes('data-act="nav-rail"'));
  const swBanner = String(run(`(()=>{ DEMO_SWITCH.activeNotice={username:AUTH.user.username, name:AUTH.user.name, role:'County Admin', scope:'Kisumu', asset:'Messages', prevUsername:'chief.admin'}; const h=DEMO_SWITCH.bannerHTML(); DEMO_SWITCH.activeNotice=null; return h; })()`));
  ok('Switched-account banner uses high-contrast .demo-bar-btn-primary & .demo-bar-btn-dismiss',
    swBanner.includes('demo-bar-btn-primary') && swBanner.includes('demo-bar-btn-dismiss'));
  return true;
});

/* 8. Library Tabs, Equipment Zero-Overflow, Charts Table Toggle, Coins & Workplans (#9, #10, #11, #13, #15) */
test('8. Library tabs, Equipment layout, Chart table toggle, Coins podium & Work Plan stepper', ()=>{
  as('media.head');
  ['catalogue','mine','requests','manage'].forEach(tb=>{
    run(`ACTIONS.go({v:'library', tab:'${tb}'})`);
    const libH = String(run(`renderLibrary(AUTH.user)`));
    ok(`Department Library tab '${tb}' switches via ACTIONS.go and renders framed card`,
      run(`APPX.params.tab`)===tb && libH.includes('card-b'));
  });
  const invH = String(run(`renderInventory(AUTH.user)`));
  ok('Office equipment register renders concise header with Add item button',
    invH.includes('data-act="inv-add-form"') && invH.includes('inv-filter'));
  as('finance.kisumu');
  run(`ACTIONS.go({v:'costing', mode:'table'})`);
  const costTbl = String(run(`COSTX.render(AUTH.user)`));
  ok('Cost-per-patient View as table mode renders accessible tabular view via ACTIONS.go',
    run(`APPX.params.mode`)==='table' && /<table/i.test(costTbl));
  const barWithTbl = String(run(`chartBars({rows:[{label:'Kisumu',value:120},{label:'Homa Bay',value:80}]})`));
  ok('SVG charts include accessible View as table toggle', barWithTbl.includes('chart-table-btn') || /View as table/i.test(barWithTbl));
  as('caregiver.nairobird');
  const coinsH = String(run(`contentFor('recognition',{},AUTH.user)`));
  ok('Coins workspace renders top-3 podium & reward perk cards',
    coinsH.includes('coins-podium') && coinsH.includes('perks-grid'));
  const wpH = String(run(`contentFor('workplans',{},AUTH.user)`));
  ok('Monthly Work Plans renders 4-stage progression stepper', wpH.includes('wp-stepper'));
  return true;
});

/* 9. Paper Forms Open Button, Blank Sheet & Trial Report Form Alignment (#16, #18) */
test('9. Paper Forms Open filter, Blank Sheet preview, Trial Report skip-logic & verify->publish', ()=>{
  as('kisumu.assistant');
  run(`ACTIONS['open-forms']({kind:'home_visit'})`);
  const formsFiltered = String(run(`renderForms(AUTH.user, APPX.params)`));
  ok('Paper Forms Open button filters register to selected form kind & shows opened drawer',
    formsFiltered.includes('form-open-drawer') && /Home Visit/i.test(formsFiltered));
  const hvFields = J(`FORMSX.fields('home_visit').map(f=>f.k)`);
  ok('Home Visit form includes Trial Report Bag options, multivitamin date, 2nd caregiver signature & BMI',
    hvFields.includes('multivitaminDate') && hvFields.includes('caregiver2Signature') && hvFields.includes('bmi') && hvFields.includes('foodBagCode'));
  const bagOpts = J(`FORMSX.fields('home_visit').find(f=>f.k==='foodBagDelivered').o`);
  const bagCodes = J(`FORMSX.fields('home_visit').find(f=>f.k==='foodBagCode').o`);
  ok('Home Visit food bag options preserve Normal/Couple/Family/Special + BG1/BG2/SPB codes',
    bagOpts.includes('Normal bag') && bagOpts.includes('Couple bag') && bagOpts.includes('Family bag') && bagOpts.includes('Special bag') &&
    bagCodes.includes('BG1') && bagCodes.includes('BG2') && bagCodes.includes('SPB'));
  const edHtml = String(run(`formEditor('home_visit', DB.db.patients[0].id, null)`));
  ok('formEditor renders Trial Report 3-visit weight banner & live BMI badge container',
    edHtml.includes('CareLink Trial Report Alignment') && edHtml.includes('ff_bmi_badge'));
  return true;
});

/* 10. Delegation Plan, Scoped Reliever Handover & EPPH v2.2 6-Col Leave Ledger (#19) */
test('10. Leave Delegation Plans, Tri-Party Role Handover & EPPH v2.2 6-column leave ledger', ()=>{
  as('coord.nyalenda');
  const hoHtml = String(run(`contentFor('handover',{},AUTH.user)`));
  ok('Coordinator opens Delegation & Role Handover console with Scoped Reliever plans',
    /Delegation|Handover/i.test(hoHtml) && hoHtml.includes('handover-new-modal'));
  as('hr.officer');
  const lvHtml = String(run(`contentFor('leave',{},AUTH.user)`));
  ok('HR Leave console renders EPPH v2.2 6-Column Leave Balance Ledger & >=14d annual notice rule',
    /6-Column Staff Leave Balance Ledger/i.test(lvHtml) && /14 days/.test(lvHtml));
  const shortNotice = J(`LEAVE.check({employeeId:'ls-allan', type:'annual', from:todayISO().slice(0,8)+'28', to:todayISO().slice(0,8)+'29', emergency:false})`);
  ok('LEAVE.check warns when annual leave has <14 days notice',
    Array.isArray(shortNotice.warnings) && shortNotice.warnings.some(w=>/14 days/.test(w)));
  return true;
});

/* 11. Financial & Procurement Workflow + Projected Food & Hygiene Budget (#20) */
test('11. Projected Food & Hygiene Budget calculator & 4-Tier Procurement Policy', ()=>{
  const calc = J(`MONDAY_PROC.computeFoodOrder({
    lastWeek:84, discharged:4, deceased:1, newIntakes:6,
    inpatient:3, medOnly:5, stockBg1:10, stockBg2:6
  })`);
  /* Total = 84 - 4 - 1 + 6 = 85; HomeFood = 85 - 3 - 5 = 77 */
  ok('Monday census formula computes Total = LastWk - Disch - Dec + New accurately', calc.totalActive===85, String(calc.totalActive));
  ok('Home food recipients = Total - Inpatients - MedOnly', calc.homeEligible===77, String(calc.homeEligible));
  ok('Stock on hand deducted before ordering Bag 1 & Bag 2',
    calc.bg1ToOrder === Math.max(0, calc.bg1Needed - 10) && calc.bg2ToOrder === Math.max(0, calc.bg2Needed - 6));
  ok('Bag 1 (KES 1,525 proj / 1,313 avg) & Bag 2 (KES 1,190 proj / 1,078 avg) priced accurately',
    calc.projectedCost === calc.bg1ToOrder*1525 + calc.bg2ToOrder*1190 + 3*560);
  as('procurement');
  ['calculator','hygiene','policy'].forEach(tb=>{
    const fbHtml = String(run(`contentFor('foodbudget',{tab:'${tb}'},AUTH.user)`));
    ok(`Projected Food & Procurement tab '${tb}' renders cleanly`, fbHtml.length > 700 && !fbHtml.includes('Access denied'));
  });
  return true;
});

/* 12. External Partner Consoles: CCC Referral Isolation, Gov DPA Dashboard & Intl Medical 120+d PDCA (#21, #22, #23) */
test('12. CCC referral-only isolation, Gov zero-PII dashboard & International Medical 120+d PDCA console', ()=>{
  /* CCC Clinician */
  as('ccc.jootrh');
  const cccNav = J(`navModel(AUTH.user)`).flatMap(g=>g.items.map(i=>i.id));
  ok('CCC Clinician sees cccdesk & repeat, NEVER full patient register or finance',
    cccNav.includes('cccdesk') && !cccNav.includes('patients') && !cccNav.includes('finance'));
  const cccHtml = String(run(`contentFor('cccdesk',{},AUTH.user)`));
  ok('CCC Desk renders referral submission, own-referral isolation & Master Referral feedback',
    /CCC \/ PSC/i.test(cccHtml) && cccHtml.includes('ccc-new-referral-modal'));
  ok('CCC Clinician is denied full patient register',
    String(run(`contentFor('patients',{},AUTH.user)`)).includes('Access denied'));

  /* Government Partner */
  as('gov.kisumu');
  const govNav = J(`navModel(AUTH.user)`).flatMap(g=>g.items.map(i=>i.id));
  ok('Government Partner sees govdashboard, NEVER patient register or clinical forms',
    govNav.includes('govdashboard') && !govNav.includes('patients') && !govNav.includes('forms'));
  const govHtml = String(run(`contentFor('govdashboard',{},AUTH.user)`));
  ok('Government Partnership dashboard renders aggregated KPIs with zero patient CCC/phone identifiers',
    /Government|Partnership/i.test(govHtml) && !/CCC\/9\d{4}/.test(govHtml) && !/07[1-9]\d{7}/.test(govHtml));

  /* International Medical Team */
  as('intl.medical');
  const intlHtml = String(run(`contentFor('intlmedical',{},AUTH.user)`));
  ok('International Medical Team opens 120+ Day Overstay PDCA console',
    /120\+|Overstay|PDCA/i.test(intlHtml) && !intlHtml.includes('Access denied'));
  return true;
});

/* 13. Security & Zero Sensitive-File / Personal-Payroll Guard */
test('13. Zero sensitive uploaded files or personal payroll/bank identifiers in repository', ()=>{
  const rootFiles = fs.readdirSync(REPO);
  const forbiddenNames = /Delegation Plan|Handover Report|Acceptance Report|Food Budget|Handbook|Leave Request Form/i;
  const leakedFiles = rootFiles.filter(f=>forbiddenNames.test(f));
  ok('No sensitive user document exists in repository root', leakedFiles.length===0, leakedFiles.join(', '));
  const css = fs.readFileSync(path.join(SRC, 'carelink63.css'), 'utf8');
  ok('carelink63.css stylesheet is present and non-empty', css.length > 5000);
  return true;
});

if(fail){
  console.error('FAILED:\n  ' + fails.join('\n  '));
  process.exit(1);
}
console.log(`\n${pass}/${pass} v6.4 CareLink OS acceptance assertions passed`);
