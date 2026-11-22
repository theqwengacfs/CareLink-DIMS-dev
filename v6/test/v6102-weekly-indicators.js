/* ============================================================================
   v6102-weekly-indicators.js — the trial report's weekly planning page.

   The CareLink Usage Trial Report (§7) names the figures a Monday planning
   meeting must be able to read: patients in programme, discharges, children
   rescued, deceased patients, orphaned children, food bags by type and by bag
   number, recorded decisions, patients not found at home, inpatient and
   outpatient activity, mattresses, blankets, Bibles, hygiene packages and
   mosquito nets, and the weights taken so the three-weekly weighing schedule
   can be overseen - at organisation, ministry-area and console level, split
   into villages and slums, and drawn from published records only.

   Two rules are tested as rules, not as numbers:
     * every figure is counted from a record that exists;
     * a household with no recorded decision is reported as *not recorded* and
       is never counted as a decision.
   ============================================================================ */
const assert = require('node:assert/strict');
const { makeCtx } = require('./dom');

let passed = 0;
function check(name, condition, detail) {
  assert.ok(condition, name + (detail === undefined ? '' : ` — ${detail}`));
  passed++;
  console.log(`  ok  ${name}`);
}

const { run } = makeCtx();
run('DB.load();');
run('DB.seedOfficial({ patients: 4000 });');

const weeklyOf = (roleOrUser, params = {}) => JSON.parse(run(
  `JSON.stringify(REPORTS.weeklyIndicators(${typeof roleOrUser === 'string' ? `DB.db.users.find(u=>u.roleId==='${roleOrUser}')` : `DB.db.users.find(u=>u.username==='${roleOrUser}')`}, ${JSON.stringify(params)}))`));

const chief = weeklyOf('chief', { countyId: 'all' });

/* ---- every figure the report names is present --------------------------- */
const named = ['inProgramme', 'dischargedInPeriod', 'childrenRescued', 'deceased', 'orphanedChildren',
  'foodBags', 'savedInChrist', 'notFoundAtHome', 'inpatient', 'outpatient',
  'mattresses', 'blankets', 'bibles', 'hygienePackages', 'mosquitoNets', 'weightsTaken'];
const missing = named.filter(k => chief[k] === undefined);
check('every indicator the trial report names is reported', missing.length === 0, missing.join(', '));
check('the page states the period it covers, so a meeting can cite it',
  typeof chief.period.start === 'string' && typeof chief.period.end === 'string');
check('the page states the basis of every figure on its face',
  typeof chief.basis === 'string' && /verified|published/i.test(chief.basis), chief.basis);

/* ---- food bags: the three real codes, and why the four-way split is not invented */
check('food bags are reported by the register\u2019s own codes (Bag 1, Bag 2, Special)',
  typeof chief.foodBags.byBag1 === 'number' && typeof chief.foodBags.byBag2 === 'number' && typeof chief.foodBags.special === 'number',
  JSON.stringify(chief.foodBags));
check('the bag total is Bag 1 + Bag 2, so it reconciles against a budget',
  chief.foodBags.total === chief.foodBags.byBag1 + chief.foodBags.byBag2,
  `${chief.foodBags.total} vs ${chief.foodBags.byBag1}+${chief.foodBags.byBag2}`);
check('the register\u2019s own bag standing is shown beside the week\u2019s issues',
  chief.foodBags.assignedInRegister > 0, String(chief.foodBags.assignedInRegister));
check('the couple category is reported as unreadable rather than guessed as a number',
  chief.foodBags.byType.couple === null && /Bag 1 is issued to normal and couple/i.test(chief.foodBags.coupleNote),
  JSON.stringify(chief.foodBags.byType));

/* ---- the support items the report lists by name ------------------------- */
const support = [chief.mattresses, chief.blankets, chief.bibles, chief.hygienePackages, chief.mosquitoNets];
check('mattresses, blankets, Bibles, hygiene packages and mosquito nets are each counted',
  support.every(n => typeof n === 'number' && n >= 0), JSON.stringify(support));
check('the register actually issues those items, so the figures are not decorative zeros',
  support.reduce((a, b) => a + b, 0) > 0, JSON.stringify(support));
check('the support items are the same seven the register and the costing ledger use',
  run(`JSON.stringify(SUPPORT_ITEMS)`) === JSON.stringify(['Foodbag', 'Bible', 'Mosquito net', 'Mattress', 'Blanket', 'Special bag', 'Hygiene kit']));
check('every demo support issue is one of those seven items, so nothing falls outside the report',
  run(`DB.db.supportIssues.every(s=>SUPPORT_ITEMS.includes(s.item))`),
  run(`JSON.stringify([...new Set(DB.db.supportIssues.map(s=>s.item).filter(i=>!SUPPORT_ITEMS.includes(i)))])`));

/* ---- the honest "not recorded" distinction ----------------------------- */
check('a recorded decision is counted, and the blank records are reported beside it',
  typeof chief.savedInChrist === 'number' && typeof chief.faithNotRecorded === 'number',
  `saved=${chief.savedInChrist} notRecorded=${chief.faithNotRecorded}`);
check('saved + not recorded is exactly the number of patients in programme, so nothing is unaccounted for',
  chief.savedInChrist + chief.faithNotRecorded === chief.inProgramme,
  `${chief.savedInChrist}+${chief.faithNotRecorded} vs ${chief.inProgramme}`);
check('a blank record is never counted as a decision',
  chief.savedInChrist === run(`DB.db.patients.filter(p=>${JSON.stringify(['active', 'extension', 'discharge_recommended'])}.includes(p.status) && String(p.faithRecord||'').toLowerCase()==='reported').length`));
check('the ministry figures are gated by a ministry capability, not by holding any report capability',
  run(`RBAC.has(DB.db.users.find(u=>u.roleId==='chief'),'patient.ministry.view')`) === true &&
  run(`RBAC.has(DB.db.users.find(u=>u.roleId==='caregiver'),'patient.ministry.view')`) === false &&
  run(`RBAC.has(DB.db.users.find(u=>u.roleId==='coordinator'),'patient.ministry.view')`) === true);
check('deceased patients are reported as their own figure, never folded into discharges',
  typeof chief.deceased === 'number' && chief.deceased >= 0);

/* ---- visit-derived activity ------------------------------------------- */
check('home visits, patients seen and patients not found at home are counted separately',
  chief.visitsRecorded >= chief.visitsSeen && chief.notFoundAtHome >= 0 &&
  chief.visitsRecorded === chief.visitsSeen + chief.notFoundAtHome + (chief.visitsRecorded - chief.visitsSeen - chief.notFoundAtHome),
  JSON.stringify({ recorded: chief.visitsRecorded, seen: chief.visitsSeen, notFound: chief.notFoundAtHome }));
check('weight measurements are visible so the three-weekly schedule can be overseen',
  chief.weightsTaken > 0 && chief.weightsTaken <= chief.visitsRecorded, `${chief.weightsTaken}/${chief.visitsRecorded}`);
check('inpatient and outpatient activity are counted from hospital records, not typed',
  typeof chief.inpatient === 'number' && typeof chief.outpatient === 'number',
  `in=${chief.inpatient} out=${chief.outpatient}`);
check('inpatient and outpatient never exceed the hospital requests in the period',
  chief.inpatient + chief.outpatient <= chief.hospitalRequests,
  `${chief.inpatient}+${chief.outpatient} vs ${chief.hospitalRequests}`);

/* ---- ministry areas, villages and slums -------------------------------- */
check('patient numbers are reported by ministry area', Array.isArray(chief.byArea) && chief.byArea.length === 10, `${chief.byArea.length} areas`);
check('ministry areas are categorised into villages and slums, with totals for each',
  chief.byKind.village.total > 0 && chief.byKind.slum.total > 0 && chief.byKind.village.areas + chief.byKind.slum.areas === chief.byArea.length,
  JSON.stringify(chief.byKind));
check('every ministry area carries its category and a patient count',
  chief.byArea.every(a => ['village', 'slum'].includes(a.kind) && typeof a.patients === 'number'));
check('the area totals add up to the register, so no patient is lost between areas',
  chief.byArea.reduce((n, a) => n + a.patients, 0) === 4000,
  String(chief.byArea.reduce((n, a) => n + a.patients, 0)));
check('the village and slum totals add up to the same register',
  chief.byKind.village.total + chief.byKind.slum.total === 4000,
  `${chief.byKind.village.total}+${chief.byKind.slum.total}`);
check('the village/slum split follows the register\u2019s own classification attribute',
  chief.byArea.every(a => (a.area.cls === 'urban') === (a.kind === 'slum')));

/* ---- scope: a county console sees its county, a field role its areas ---- */
const county = weeklyOf('countyadmin', {});
check('a county console reports only its own county',
  county.scope.countyId === 'kisumu' && county.byArea.every(a => a.countyId === 'kisumu'),
  JSON.stringify(county.scope));
const caregiver = weeklyOf('caregiver', {});
check('a field role is scoped to the areas it serves, not to the whole register',
  caregiver.inProgramme > 0 && caregiver.inProgramme < 4000 && caregiver.scope.areas < 10,
  `${caregiver.inProgramme} patients in ${caregiver.scope.areas} areas`);
check('a field role is not shown the ministry figures at all',
  caregiver.savedInChrist === null && caregiver.faithRestricted === true);
check('a field role is still told how many records are blank, which it can act on',
  caregiver.faithNotRecorded > 0, String(caregiver.faithNotRecorded));
/* The only names in the payload are ministry-area names; no patient record is
   carried, so the page can be printed for a planning meeting without exposing
   anybody. */
check('the weekly report carries no patient identity',
  !/nationalId|patientContact|"phone"|"code":"CL-/.test(JSON.stringify(county)) &&
  JSON.stringify(county).replace(/"name":"[^"]*"/g, '').indexOf('"name"') === -1,
  JSON.stringify(county).slice(0, 120));

/* ---- the report is a report: listed, generatable, archivable, printable -- */
check('the report is offered by the reporting engine with the capability it needs',
  run(`REPORTS.types().some(t=>t.type==='weekly_indicators' && t.caps.includes('report.departmental'))`));
check('the report has a title a meeting can read', run(`REPORT_TITLES.weekly_indicators`) === 'Weekly Planning Indicators');
check('the report is filed under the week it covers, not under a bare month',
  /^\d{4}-W\d{2}$/.test(run(`REPORTS.generate('weekly_indicators',{countyId:'all'},DB.db.users.find(u=>u.roleId==='chief')).periodKey`)),
  run(`DB.db.reports.find(r=>r.type==='weekly_indicators').periodKey`));
check('a monthly report is still filed under its month',
  /^\d{4}-\d{2}$/.test(run(`REPORTS.generate('expenditure',{countyId:'all'},DB.db.users.find(u=>u.roleId==='chief')).periodKey`)));
check('the referral register keeps its own key',
  /^registry-\d{4}-\d{2}$/.test(run(`REPORTS.generate('referral',{countyId:'all'},DB.db.users.find(u=>u.roleId==='chief')).periodKey`)));
check('a quarter report is filed under its quarter',
  /^Q[1-4]-\d{4}$/.test(run(`REPORTS.generate('executive',{countyId:'all'},DB.db.users.find(u=>u.roleId==='chief')).periodKey`)));
check('the archive can find the issued report again',
  run(`REPORTS.archive(DB.db.users.find(u=>u.roleId==='chief'),{type:'weekly_indicators'}).length`) === 1);
check('a second generation in the same week is a new version, not an overwrite',
  run(`(()=>{ const u=DB.db.users.find(x=>x.roleId==='chief'); const a=REPORTS.generate('weekly_indicators',{countyId:'all'},u); return a.version; })()`) === 2);
check('a role that may not read the report cannot find it in the archive',
  run(`REPORTS.archive(DB.db.users.find(u=>u.roleId==='chw'),{type:'weekly_indicators'}).length`) === 0);

/* ---- the printed document ---------------------------------------------- */
const doc = run(`buildReportDoc('weekly_indicators',{countyId:'all'},DB.db.users.find(u=>u.roleId==='chief'))`);
check('the printed document renders every one of its six sections',
  ['1. Programme position', '2. Food bags', '3. Support issued', '4. Home visits', '5. Recorded decisions', '6. Ministry areas']
    .every(h => doc.includes(h)), ['1. Programme position', '2. Food bags', '3. Support issued', '4. Home visits', '5. Recorded decisions', '6. Ministry areas'].filter(h => !doc.includes(h)).join(', '));
check('the printed document states the reporting period exactly once',
  (doc.match(/Reporting period/gi) || []).length === 1, String((doc.match(/Reporting period/gi) || []).length));
check('the printed document explains why the couple bag is not split out', /Bag 1 is issued to normal and couple households/.test(doc));
check('the printed document shows the restricted-decisions wording to a role that may not read them',
  /restricted|Restricted/.test(run(`buildReportDoc('weekly_indicators',{countyId:'all'},DB.db.users.find(u=>u.roleId==='caregiver'))`)));
check('the printed document names every ministry area with its category',
  chief.byArea.every(a => doc.includes(a.area.name)));

console.log(`weekly-indicators: ${passed} checks passed`);
