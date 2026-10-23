/* ============================================================
   master_registry.js - The Administration's master patient workbook,
   mapped into LOMAMO C-DIMS.

   Source studied: "20260101 LOMAMO registration patients 2026.xlsx"
   (21 sheets, 145 columns per ministry-area sheet, live formulas,
   data-validation lists, week grids and cost columns).

   The workbook is the Administration's current master record of all
   patient data. Nothing in it is thrown away: every sheet, column,
   formula, validation list and note is mapped here to a place in
   LOMAMO C-DIMS, and the mapping is what drives

     * the patient registration / data-entry form (field by field),
     * the master workbook importer (column by column),
     * the derived measures (days in programme, minimal care beyond
       183 days, orphan prevention, bag counts, cost per patient),
     * the report index (every topic the INDEX sheet lists).

   The workbook file itself is NOT stored in this repository: patient
   identities are personal data and the repository is public. What is
   kept is the structure, the vocabulary, the rules and the mapping.
   ============================================================ */

/* ---------------- 1. The workbook as studied ---------------- */
const MASTER_WORKBOOK = {
  file:'20260101 LOMAMO registration patients 2026.xlsx',
  studiedAt:'2026-10-22',
  owner:'Administration (Kisumu Admin / Chief Admin)',
  sheets:[
    { name:'INDEX',        kind:'Report index',        rows:21,   mapsTo:'Report centre & Analytics hub', note:'Lists every report topic the Administration reads: main data this year, slum/village ratio, development of total days in programme, foodbags up to a month, hygiene packs, actual expenses versus budget, costprice calculations, costprice food per visited patient per month, average cost per unique patient, costs of medication/transport/outpatient, TB and cancer patients.' },
    { name:'Extra MI',     kind:'Cost & ratio analysis',rows:104, mapsTo:'Cost per patient engine (costing.js)', note:'Holds "KISUMU Costprice food per visited patient": month, expenses food, visited patients, cost p.p.p. month = C/D, plus the average costprice food per unique patient and the slum versus village ratio per month.' },
    { name:'MI 2026',      kind:'Monthly indicators',  rows:429,  mapsTo:'Indicators, Patient Figures & Analytics hub', note:'Main data per ministry area per month: patients at 31 December last year, new patients, total this year, in programme at end of period, discharged, deceased, hospital out, hospital in, prevented becoming orphans, became orphans, repeat patients, got a bible, saved; plus controls, care duration, gradients, disease specification (HIV, TB, wound, meningitis, stroke, cancer, malaria, others), TB pulmonary/extrapulmonary, cancer by site, hospital averages, viral load & CD4 known, woundcare.' },
    { name:'Data',         kind:'Multi-year data',     rows:99,   mapsTo:'Analytics hub (year comparison) & Waiting list', note:'Waiting list per area per month with a control total, intake per month, and visited patients per year 2018 to 2026.' },
    { name:'Foodbags',     kind:'Supply issue grid',   rows:51,   mapsTo:'Cost engine (bags & supplies) + Support register', note:'Total bags per week (Week 1 to Week 53) for Bag 1, Bag 2 and Special bag, per ministry area, plus quarterly hygiene packs.' },
    { name:'CCC1',         kind:'Cost & days summary', rows:59,   mapsTo:'Cost per patient engine', note:'Foodbags up to a month against visited patients, average food per patient, totals per bag type, and days in programme per ministry area.' },
    { name:'Manyatta',     kind:'Ministry area register', rows:253, mapsTo:'Patient register (ministry area scope)', note:'One row per patient; 145 columns; weekly bag grid; cost columns.' },
    { name:'Nyahera',      kind:'Ministry area register', rows:252, mapsTo:'Patient register (ministry area scope)' },
    { name:'Nyalenda',     kind:'Ministry area register', rows:253, mapsTo:'Patient register (ministry area scope)' },
    { name:'Ombeyi',       kind:'Ministry area register', rows:253, mapsTo:'Patient register (ministry area scope)' },
    { name:'Nairobi Road', kind:'Ministry area register', rows:253, mapsTo:'Patient register (ministry area scope)' },
    { name:'Ahero',        kind:'Ministry area register', rows:253, mapsTo:'Patient register (ministry area scope)' },
    { name:'Chiga',        kind:'Ministry area register', rows:253, mapsTo:'Patient register (ministry area scope)' },
    { name:'Basic',        kind:'Template (hidden)',   rows:257,  mapsTo:'Registration blueprint', note:'The empty template a new ministry area is copied from: same columns, formulas pre-filled, no patients.' },
    { name:'NEW',          kind:'Draft area (hidden)', rows:254,  mapsTo:'Organisation configuration (new area)', note:'Draft design for a new ministry area, including Homa Bay.' },
    { name:'URGCAS',       kind:'Urgent cases & budget',rows:75,  mapsTo:'Hospital requests (urgent) + Budget', note:'NAME, WHAT, COSTS, Budget, total costs month, total cost year: urgent cases with their cost against budget, per month.' },
    { name:'Homabay',      kind:'County register (hidden)', rows:253, mapsTo:'Patient register (Homa Bay County Office)', note:'Same column structure as a Kisumu ministry area; Homa Bay field days to be added later.' },
    { name:'Waiting List', kind:'Waiting list',        rows:263,  mapsTo:'Assessment pipeline & waiting list', note:'Name patient, telephone number, date on the waiting list, date in programme, deceased, other information (for example "Patient balancing versus budget", "Relocated to the village").' },
    { name:'Tabel',        kind:'Validation lists',    rows:55,   mapsTo:'Reference data & data entry dropdowns', note:'Every dropdown in the workbook: months, weekdays, schedule codes, yes/no/active, markers, caregiver names, disease sites, bag codes, insurance, ministry areas and the 53-week Monday-to-Saturday calendar for 2026.' },
    { name:"Goals '26",    kind:'Leadership goals',    rows:12,   mapsTo:'Targets & baselines (national level)', note:"LoMaMo / Martin's goals for 2026 - the national targets the Director sets." },
    { name:'Discharged',   kind:'Discharge register',  rows:151,  mapsTo:'Discharge register & Patient Figures', note:'Discharged patients by ministry area and month; formulas reference the area sheets (some references are broken in the source and are rebuilt here).' }
  ]
};

/* ---------------- 2. The 145 columns of a ministry area sheet ----------------
   g  = group, c = Excel column letter, l = label as printed,
   t  = type, o = validation list from Tabel, f = formula as written,
   m  = where it lives in LOMAMO C-DIMS, d = derived (computed, never typed). */
const MASTER_COLUMNS = [
  { g:'Identity', c:'A', l:'Name patient', t:'text', req:true, m:'patients.name', note:'Full name as written on the LOMAMO patient assessment form.' },
  { g:'Identity', c:'B', l:"Patient's ID", t:'text', m:'patients.nationalId', o:'National ID, or "No ID" where the person has none', note:'Used by the returning-beneficiary check before a new assessment is opened.' },
  { g:'Identity', c:'C', l:"Spouses ID", t:'text', m:'patients.master.spouseId', note:'Links two records in the same household.' },
  { g:'Identity', c:'D', l:'NHIF', t:'select', o:['NHIF','LMM','Other'], m:'patients.master.insurance', note:'Who covers the patient: NHIF/SHA, LOMAMO (LMM) or other.' },
  { g:'Identity', c:'E', l:'New in month', t:'month', m:'patients.enrolledAt', note:"Written as Month'YY, for example October'25." },
  { g:'Identity', c:'F', l:'In program', t:'flag', m:'patients.status', note:'Whether the patient counts as in programme for the month.' },
  { g:'Identity', c:'G', l:'Minimal Care Patients', t:'flag', m:'patients.master.minimalCare', note:'Marked by hand where a patient receives minimal care only.' },
  { g:'Programme days', c:'H', l:'Minimal care flag (derived)', t:'derived', d:true, f:'=IF(AND(L="";K>183);"x";"")', m:'patients.master.minimalCareFlag', note:'A patient still in programme beyond 183 days is flagged for minimal-care review.' },
  { g:'Programme days', c:'I', l:'Date in', t:'date', req:true, m:'patients.intake / enrolledAt' },
  { g:'Programme days', c:'J', l:'Date out: ONLY CHANGE DATE WHEN DISCHARGED OR DECEASED', t:'date', m:'patients.discharge / dischargedAt', note:'The instruction printed on the column: the date out changes only on discharge or death.' },
  { g:'Programme days', c:'K', l:'Counted days in program', t:'derived', d:true, f:'=IF(I="";0;J-I)', m:'patients.programDays', note:'Days in programme, the denominator of cost per patient-day.' },
  { g:'Programme days', c:'L', l:'Discharge in month', t:'month', m:'patients.master.dischargeMonth' },
  { g:'Programme days', c:'M', l:'Deceased in month', t:'month', m:'patients.master.deceasedMonth' },
  { g:'Programme days', c:'N', l:'Repeat patients', t:'flag', m:'patients.master.repeatPatient', note:'A returning beneficiary: feeds the Repeat Patients indicator.' },
  { g:'Programme days', c:'O', l:'Relocated patient', t:'flag', m:'patients.master.relocated' },
  { g:'Household & children', c:'P', l:'Male children', t:'number', m:'patients.household.maleChildren' },
  { g:'Household & children', c:'Q', l:'Female children', t:'number', m:'patients.household.femaleChildren' },
  { g:'Household & children', c:'R', l:'Total children', t:'derived', d:true, f:'=P+Q', m:'patients.household.children' },
  { g:'Household & children', c:'S', l:'Prevented becoming orphan', t:'derived', d:true, f:'=IF(L="";"";R)', m:'indicators.orphans_prevented', note:'When a patient is discharged, the children in the household count as rescued from becoming orphans.' },
  { g:'Household & children', c:'T', l:'Became orphans', t:'derived', d:true, f:'=IF(M="";"";R)', m:'indicators.orphaned', note:'When a patient dies, the children count as having become orphans.' },
  { g:'Print & schedule', c:'U', l:'Print list (mirror of name)', t:'derived', d:true, f:'=A', m:'(print list only)' },
  { g:'Print & schedule', c:'V', l:'NORMAL BAG', t:'flag', m:'patients.master.normalBag' },
  { g:'Print & schedule', c:'W', l:'SPECIAL BAG', t:'flag', m:'patients.master.specialBag' },
  { g:'Print & schedule', c:'X', l:'Medical only', t:'flag', m:'patients.master.medicalOnly' },
  { g:'Print & schedule', c:'Y', l:'Schedule', t:'select', o:['EW','EOW','Twice Week','1 Month'], m:'patients.visitFrequency', note:'EW = every week, EOW = every other week; the visit planner reads this.' },
  { g:'Weekly bag grid', c:'AB..CB', l:'Week 1 to Week 53', t:'grid', o:['BG1','BG2','SPB'], m:'support issues + cost engine', note:'One cell per week per patient: BG1 (Bag 1), BG2 (Bag 2) or SPB (Special bag). The Foodbags sheet totals each column; CCC1 totals up to a month.' },
  { g:'Bag totals', c:'CC', l:'Bag 1', t:'derived', d:true, f:'=COUNTIF(AB:CB;Tabel!$I$5)', m:'cost engine (bags & supplies)' },
  { g:'Bag totals', c:'CD', l:'Bag 2', t:'derived', d:true, f:'=COUNTIF(AB:CB;Tabel!$I$6)', m:'cost engine (bags & supplies)' },
  { g:'Bag totals', c:'CE', l:'Special bag', t:'derived', d:true, f:'=COUNTIF(AB:CB;Tabel!$I$7)', m:'cost engine (bags & supplies)' },
  { g:'Bag totals', c:'CF', l:'Total bags', t:'derived', d:true, f:'=CC+CD+CE', m:'cost engine (bags & supplies)' },
  { g:'Hygiene packs', c:'CG..CN', l:'Hygiene packs & extra Water Guard, Q1 to Q4', t:'number', m:'support issues (hygiene)', note:'Two columns per quarter: number of hygiene packs and number of extra Water Guard.' },
  { g:'Hygiene packs', c:'CO', l:'Total number of HP', t:'derived', d:true, f:'=CG+CI+CK+CM', m:'support issues (hygiene)' },
  { g:'Hygiene packs', c:'CP', l:'Total number of extra WG', t:'derived', d:true, f:'=CH+CJ+CL+CN', m:'support issues (hygiene)' },
  { g:'Medication & TB', c:'CQ', l:'Vitamins', t:'number', m:'pharmacy / TB dispensing control' },
  { g:'Medication & TB', c:'CR', l:'Last month given', t:'month', m:'TB dispensing control (last course)' },
  { g:'Medication & TB', c:'CS', l:'(Extra)pulmonary TB', t:'select', o:['Pulmonary TB','Extra pulmonary TB'], m:'patientConditions (TB)' },
  { g:'Medication & TB', c:'CT', l:'TB Discharged', t:'derived', d:true, f:'=IF(AND(CS<>"";L<>"");K;"")', m:'report: average days discharged TB patients' },
  { g:'Medication & TB', c:'CU', l:'TB Deceased', t:'derived', d:true, f:'=IF(AND(CS<>"";M<>"");K;"")', m:'report: average days deceased TB patients' },
  { g:'Medication & TB', c:'CV', l:'TB', t:'flag', m:'patientConditions (TB in programme)' },
  { g:'Grants & conditions', c:'CY', l:'Extra', t:'text', m:'patient record notes' },
  { g:'Grants & conditions', c:'DB', l:'TB Grant ZvAfrika', t:'flag', m:'donor attribution (Zorg voor Afrika)', note:'Patients carried by the ZvAfrika TB grant; counted separately in the report index.' },
  { g:'Grants & conditions', c:'DC', l:'ZVAfrika Discharged', t:'derived', d:true, f:'=IF(AND(DB<>"";L<>"");K;"")', m:'donor report' },
  { g:'Grants & conditions', c:'DD', l:'ZVAfrika Deceased', t:'derived', d:true, f:'=IF(AND(DB<>"";M<>"");K;"")', m:'donor report' },
  { g:'Grants & conditions', c:'DE', l:'Wound', t:'flag', m:'patientConditions (wound / woundcare)' },
  { g:'Grants & conditions', c:'DF', l:'Meningitis', t:'flag', m:'patientConditions' },
  { g:'Grants & conditions', c:'DG', l:'Stroke', t:'flag', m:'patientConditions (post-CVA care)' },
  { g:'Grants & conditions', c:'DH', l:'Cancer NEW', t:'select', o:['Cervical','KS','Uterine','Esophageal and stomach','Lung','Others'], m:'patientConditions (oncology)' },
  { g:'Grants & conditions', c:'DI', l:'Cancer Discharged', t:'derived', d:true, f:'=IF(AND(DH<>"";L<>"");K;"")', m:'report: average days discharged cancer patients' },
  { g:'Grants & conditions', c:'DJ', l:'Cancer Deceased', t:'derived', d:true, f:'=IF(AND(DH<>"";M<>"");K;"")', m:'report: average days deceased cancer patients' },
  { g:'Grants & conditions', c:'DK', l:'Malaria', t:'flag', m:'patientConditions' },
  { g:'Grants & conditions', c:'DL', l:'Others', t:'flag', m:'patientConditions (other)' },
  { g:'Faith & support items', c:'DM', l:'Photo', t:'flag', m:'media consent register', note:'A photo is never taken without consent; the flag maps to the consent register, not to a picture.' },
  { g:'Faith & support items', c:'DN', l:'Intake', t:'flag', m:'report: intake' },
  { g:'Faith & support items', c:'DO', l:'Saved', t:'flag', m:'patients.faithRecord (restricted)', note:'Restricted field: visible only to authorised ministry and leadership roles; never a staff performance target.' },
  { g:'Faith & support items', c:'DP', l:'Mosquito net', t:'flag', m:'support issues' },
  { g:'Faith & support items', c:'DQ', l:'Viral Load & CD4 Known', t:'flag', m:'clinical (HIV monitoring)' },
  { g:'Faith & support items', c:'DR', l:'Default Patient', t:'flag', m:'attention queue (medication default)' },
  { g:'Faith & support items', c:'DS', l:'Woundcare', t:'flag', m:'care plans (woundcare)' },
  { g:'Faith & support items', c:'DT', l:'Bible', t:'flag', m:'support issues + indicator "Got a bible"' },
  { g:'Faith & support items', c:'DU', l:"ARV's", t:'flag', m:'pharmacy (ART)' },
  { g:'Faith & support items', c:'DV', l:'PSC', t:'flag', m:'clinical (PSC / prophylaxis)' },
  { g:'Hospital', c:'DW', l:'Hospital Out Patient visits Number', t:'number', m:'hospital encounters (outpatient)' },
  { g:'Hospital', c:'DX', l:'Number of patients Hospital In', t:'number', m:'hospital encounters (inpatient)' },
  { g:'Hospital', c:'DY', l:'Number of hospital visits', t:'number', m:'hospital requests' },
  { g:'Hospital', c:'DZ', l:'Deceased in hospital', t:'flag', m:'hospital encounters + mortality' },
  { g:'Cost', c:'EA', l:'Transportcost patients In and Out Hospital', t:'money', m:'cost engine (patient transport)', note:'Column EA of the master sheet is the transport cost the cost engine reads first.' },
  { g:'Cost', c:'EB', l:'Fill in OTHER PATIENT COST - Medications Costs', t:'money', m:'cost engine (medication)' },
  { g:'Cost', c:'EC', l:'Transport Costs', t:'money', m:'cost engine (transport)' },
  { g:'Cost', c:'ED', l:'Out patient Costs', t:'money', m:'cost engine (outpatient)' },
  { g:'Cost', c:'EE', l:'SHIF', t:'money', m:'cost engine (SHIF / SHA contributions)' },
  { g:'Cost', c:'EF', l:'Total OTHER Cost', t:'derived', d:true, f:'=SUM(EB:EE)', m:'cost engine (subtotal)' },
  { g:'Cost', c:'EG', l:'Fill in IN PATIENT COST - Cost 1', t:'money', m:'cost engine (in-patient)' },
  { g:'Cost', c:'EH', l:'Cost 2', t:'money', m:'cost engine (in-patient)' },
  { g:'Cost', c:'EI', l:'Cost 3', t:'money', m:'cost engine (in-patient)' },
  { g:'Cost', c:'EJ', l:'Cost 4', t:'money', m:'cost engine (in-patient)' },
  { g:'Cost', c:'EK', l:'In-Patient Cost', t:'derived', d:true, f:'=SUM(EG:EJ)', m:'cost engine (in-patient subtotal)' },
  { g:'Cost', c:'EL', l:'Total cost', t:'derived', d:true, f:'=EF+EK', m:'cost engine (patient total)' }
];
const MASTER_GROUPS = [...new Set(MASTER_COLUMNS.map(c=>c.g))];

/* ---------------- 3. Validation vocabulary (sheet "Tabel") ---------------- */
const MASTER_VOCAB = {
  months:["January'26","February'26","March'26","April'26","May'26","June'26","July'26","August'26","September'26","October'26","November'26","December'26"],
  weekdays:['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],
  schedule:['EW','EOW','1 Month','Pulmonary TB','Extra pulmonary TB'],
  scheduleMeaning:{ EW:'Every week', EOW:'Every other week', '1 Month':'Once a month' },
  yesno:['Yes','No'],
  activity:['Active','Non Active'],
  marker:['x'],
  caregivers:['Desmond','ZVA','Other'],
  cancerSites:['Cervical','KS','Uterine','Esophageal and stomach','Lung','Others'],
  bagCodes:['BG1','BG2','SPB'],
  bagNames:{ BG1:'Bag 1 - normal household food bag', BG2:'Bag 2 - family / couple food bag', SPB:'Special bag' },
  insurance:['NHIF','LMM','Other'],
  insuranceMeaning:{ NHIF:'NHIF / SHA cover', LMM:'Covered by LOMAMO (Love Matters Most)', Other:'Other cover' },
  areas:['Manyatta','Nyahera','Nyalenda','Ombeyi','Nairobi Rd.','Ahero','Chiga','Homabay','New area 4','New area 5'],
  areaIdMap:{ 'Manyatta':'manyatta', 'Nyahera':'nyahera', 'Nyalenda':'nyalenda', 'Ombeyi':'ombeyi',
    'Nairobi Rd.':'nairobird', 'Ahero':'ahero', 'Chiga':'chiga', 'Homabay':'makongeni' },
  weekRule:'A week number means Monday up to and including Saturday.',
  /* The 2026 week calendar as printed in the workbook (week 1 starts 1 January). */
  weeks2026:[
    [1,'2026-01-01','2026-01-04'],[2,'2026-01-05','2026-01-11'],[3,'2026-01-12','2026-01-18'],[4,'2026-01-19','2026-01-25'],
    [5,'2026-01-26','2026-02-01'],[6,'2026-02-02','2026-02-08'],[7,'2026-02-09','2026-02-15'],[8,'2026-02-16','2026-02-22'],
    [9,'2026-02-23','2026-03-01'],[10,'2026-03-02','2026-03-08'],[11,'2026-03-09','2026-03-15'],[12,'2026-03-16','2026-03-22'],
    [13,'2026-03-23','2026-03-29'],[14,'2026-03-30','2026-04-05'],[15,'2026-04-06','2026-04-12'],[16,'2026-04-13','2026-04-19'],
    [17,'2026-04-20','2026-04-26'],[18,'2026-04-27','2026-05-03'],[19,'2026-05-04','2026-05-10'],[20,'2026-05-11','2026-05-17'],
    [21,'2026-05-18','2026-05-24'],[22,'2026-05-25','2026-05-31'],[23,'2026-06-01','2026-06-07'],[24,'2026-06-08','2026-06-14'],
    [25,'2026-06-15','2026-06-21'],[26,'2026-06-22','2026-06-28'],[27,'2026-06-29','2026-07-05'],[28,'2026-07-06','2026-07-12'],
    [29,'2026-07-13','2026-07-19'],[30,'2026-07-20','2026-07-26'],[31,'2026-07-27','2026-08-02'],[32,'2026-08-03','2026-08-09'],
    [33,'2026-08-10','2026-08-16'],[34,'2026-08-17','2026-08-23'],[35,'2026-08-24','2026-08-30'],[36,'2026-08-31','2026-09-06'],
    [37,'2026-09-07','2026-09-13'],[38,'2026-09-14','2026-09-20'],[39,'2026-09-21','2026-09-27'],[40,'2026-09-28','2026-10-04'],
    [41,'2026-10-05','2026-10-11'],[42,'2026-10-12','2026-10-18'],[43,'2026-10-19','2026-10-25'],[44,'2026-10-26','2026-11-01'],
    [45,'2026-11-02','2026-11-08'],[46,'2026-11-09','2026-11-15'],[47,'2026-11-16','2026-11-22'],[48,'2026-11-23','2026-11-29'],
    [49,'2026-11-30','2026-12-06'],[50,'2026-12-07','2026-12-13'],[51,'2026-12-14','2026-12-20'],[52,'2026-12-21','2026-12-27'],
    [53,'2026-12-28','2026-12-31']
  ]
};

/* ---------------- 4. The INDEX sheet, mapped to a place in the app -------- */
const MASTER_INDEX_MAP = [
  { topic:'Main data this year',                       view:'reports',      report:'patient_figures', note:'MI 2026 main data block.' },
  { topic:'Ratio of patients slums versus villages',   view:'analytics',    report:'pivot', note:'Extra MI columns Q to U; area classification (urban/village) is on the county configuration.' },
  { topic:'Development total days patients in program',view:'programdays',  report:'patient_days', note:'MI 2026 rows 58 to 71; CCC1 days per area.' },
  { topic:'Main data over the years',                  view:'analytics',    report:'pivot', note:'Data sheet: visited patients 2018 to 2026.' },
  { topic:'Development average days in program',       view:'programdays',  report:'patient_days' },
  { topic:'Foodbags up and until month',               view:'costing',      report:'cost_bags', note:'CCC1 and the Foodbags sheet; the cost engine counts Bag 1, Bag 2 and Special bag.' },
  { topic:'Number of hygiene packs',                   view:'costing',      report:'cost_bags', note:'Columns CG to CP per quarter.' },
  { topic:'Actual expenses versus budget with notable items', view:'finance', report:'expenditure', note:'URGCAS: urgent cases costed against budget.' },
  { topic:'Costprice calculations and compare previous', view:'costing',     report:'cost_per_patient', note:'Extra MI: cost p.p.p. per month and the average per unique patient.' },
  { topic:'Costprice food per visited patient per month', view:'costing',    report:'cost_per_patient' },
  { topic:'Main data per month and up and until month', view:'reports',      report:'patient_figures' },
  { topic:'Average costprice food per unique patient',  view:'costing',      report:'cost_per_patient' },
  { topic:'Average cost per unique patient',            view:'costing',      report:'cost_per_patient' },
  { topic:'Costs medication, transport, outpatient',    view:'costing',      report:'cost_categories', note:'Columns EA to EL.' },
  { topic:'Patients with TB',                           view:'tbcare',       report:'condition', note:'Columns CS to CV; TB dispensing control tracks the ten-day pyridoxine cycle.' },
  { topic:'Zorg voor Afrika patients with TB',          view:'donor',        report:'donor', note:'Columns DB to DD: the ZvAfrika TB grant.' },
  { topic:'Patients with cancer',                       view:'conditions',   report:'condition', note:'Columns DH to DJ, with the cancer site list from Tabel.' },
  { topic:'Children Rescued from Becoming Orphans',     view:'reports',      report:'patient_figures', note:'Column S: total children when the patient is discharged.' },
  { topic:'Children who Became Orphans',                view:'reports',      report:'patient_figures', note:'Column T: total children when the patient dies.' },
  { topic:'New Patients / Repeat Patients',             view:'pipeline',     report:'patient_figures', note:'Columns E and N; the returning-beneficiary check runs on the National ID.' },
  { topic:'Saved / Got a bible',                        view:'reports',      report:'patient_figures', note:'Columns DO and DT. "Saved" is a restricted faith record, never a staff target.' },
  { topic:'Total days discharged / deceased patients in program, and averages', view:'programdays', report:'patient_days', note:'Columns CT, CU, DI, DJ.' },
  { topic:"Martin's goals for 2026",                    view:'targets',      report:'targets', note:"Sheet Goals '26: national-level targets, set only at national authority." }
];

/* ---------------- 5. The derived rules, executable ---------------- */
const MASTER_RULES = {
  /* K: =IF(I="";0;J-I) */
  daysInProgramme(dateIn, dateOut){
    if(!dateIn) return 0;
    const a = new Date(String(dateIn).slice(0,10)), b = dateOut? new Date(String(dateOut).slice(0,10)) : new Date();
    if(isNaN(a)) return 0;
    return Math.max(0, Math.round((b-a)/86400000));
  },
  /* H: =IF(AND(L="";K>183);"x";"") */
  minimalCareFlag(days, dischargeMonth){ return (!dischargeMonth && Number(days)>183) ? 'x' : ''; },
  minimalCareThreshold:183,
  /* R: =P+Q */
  totalChildren(male, female){ return (Number(male)||0)+(Number(female)||0); },
  /* S: =IF(L="";"";R) */
  orphansPrevented(totalChildren, dischargeMonth){ return dischargeMonth? Number(totalChildren)||0 : ''; },
  /* T: =IF(M="";"";R) */
  becameOrphans(totalChildren, deceasedMonth){ return deceasedMonth? Number(totalChildren)||0 : ''; },
  /* CC/CD/CE: =COUNTIF(week grid, code) */
  bagCounts(weekGrid){
    const g = Object.values(weekGrid||{}).map(v=>String(v||'').trim().toUpperCase());
    return { BG1:g.filter(v=>v==='BG1').length, BG2:g.filter(v=>v==='BG2').length, SPB:g.filter(v=>v==='SPB').length,
      total:g.filter(v=>['BG1','BG2','SPB'].includes(v)).length };
  },
  /* EF: =SUM(EB:EE) and EK: =SUM(EG:EJ) and EL: =EF+EK */
  costs(c={}){
    const other = ['medications','transport','outpatient','shif'].reduce((n,k)=>n+(Number(c[k])||0),0);
    const inpatient = [1,2,3,4].reduce((n,i)=>n+(Number(c['inpatient'+i])||0),0);
    return { other, inpatient, total:other+inpatient };
  },
  /* Extra MI E: =C/D  - costprice food per visited patient, per month */
  costPerVisitedPatient(expensesFood, visitedPatients){
    const v = Number(visitedPatients)||0;
    return v? (Number(expensesFood)||0)/v : 0;
  },
  /* Extra MI E20: =C20/D20 - average costprice food per unique patient */
  averageCostPerUniquePatient(totalExpenses, uniquePatients){
    const u = Number(uniquePatients)||0;
    return u? (Number(totalExpenses)||0)/u : 0;
  },
  /* Extra MI Q to U: slums versus villages ratio */
  slumVillageRatio(slums, villages){
    const all = (Number(slums)||0)+(Number(villages)||0);
    return all? { slums:Number(slums)||0, villages:Number(villages)||0, all, slumPct:(Number(slums)||0)/all, villagePct:(Number(villages)||0)/all } : null;
  },
  /* MI 2026 controls: end last year + new - discharged - deceased = in programme */
  closingControl({endLastYear=0, newPatients=0, discharged=0, deceased=0, inProgramme=0}){
    const subtotal = Number(endLastYear)+Number(newPatients);
    const computed = subtotal - Number(discharged) - Number(deceased);
    return { subtotal, computed, inProgramme:Number(inProgramme), difference:Number(inProgramme)-computed };
  },
  /* MI 2026: % patients beyond 183 days */
  longStayShare(beyond183, inProgramme){ return Number(inProgramme)? Number(beyond183)/Number(inProgramme) : 0; },
  /* MI 2026 rows 349-357: hospital averages */
  hospitalAverage(patients, visits){ return Number(patients)? Number(visits)/Number(patients) : 0; },
  /* The TB ten-day rule, mirrored from tb_dispensing.js so the mapping is complete */
  nextDoseDay(dispensedOn, coverDays=10){
    const d = new Date(String(dispensedOn).slice(0,10));
    return { windowStart:new Date(d.getTime()+8*86400000).toISOString().slice(0,10),
      windowEnd:new Date(d.getTime()+9*86400000).toISOString().slice(0,10),
      exhausts:new Date(d.getTime()+Number(coverDays)*86400000).toISOString().slice(0,10) };
  }
};

/* ---------------- 6. The service ---------------- */
const MASTERX = {
  workbook(){ return MASTER_WORKBOOK; },
  columns(){ return MASTER_COLUMNS; },
  groups(){ return MASTER_GROUPS; },
  vocab(){ return MASTER_VOCAB; },
  rules(){ return MASTER_RULES; },
  indexMap(){ return MASTER_INDEX_MAP; },

  /* The week number of a date, using the workbook's own Monday-Saturday rule. */
  weekOf(date){
    const d = new Date(String(date).slice(0,10)); if(isNaN(d)) return null;
    const iso = d.toISOString().slice(0,10);
    const w = MASTER_VOCAB.weeks2026.find(x=> iso>=x[1] && iso<=x[2]);
    return w? { week:w[0], from:w[1], to:w[2] } : null;
  },

  /* The registration blueprint: what a person typing a new patient sees,
     grouped exactly as the master workbook groups it. */
  registrationBlueprint(){
    const out = [];
    MASTER_GROUPS.forEach(g=>{
      const cols = MASTER_COLUMNS.filter(c=>c.g===g && !c.d && !/^AB\.\./.test(c.c) && !/^CG\.\./.test(c.c));
      if(!cols.length) return;
      out.push({ group:g, fields:cols.map(c=>({
        key:'master.'+ (c.m||'').replace(/^patients\./,'').replace(/[^a-zA-Z0-9.]/g,'_').split('.').pop(),
        column:c.c, label:c.l, type:c.t, options:c.o||null, required:!!c.req,
        mapsTo:c.m, note:c.note||'', derived:!!c.d
      })) });
    });
    return out;
  },

  /* Turn one row of the master workbook into CareLink records.
     `row` is keyed by Excel column letter OR by the printed label. */
  mapRow(row, opts={}){
    const byLetter = {}, byLabel = {};
    MASTER_COLUMNS.forEach(c=>{ byLabel[c.l.toLowerCase()] = c.c; });
    const get = (...keys)=>{
      for(const k of keys){
        if(row[k]!==undefined && row[k]!=='') return row[k];
        const col = byLetter[String(k).toLowerCase()];
        if(col && row[col]!==undefined && row[col]!=='') return row[col];
      }
      return '';
    };
    const name = String(get('A','Name patient')||'').trim();
    if(!name) return { ok:false, msg:'A row without a patient name cannot be mapped.' };
    const dateIn = get('I','Date in'), dateOut = get('J','Date out');
    const dischargeMonth = get('L','Discharge in month'), deceasedMonth = get('M','Deceased in month');
    const male = Number(get('P','Male children'))||0, female = Number(get('Q','Female children'))||0;
    const days = MASTER_RULES.daysInProgramme(dateIn, dateOut);
    const totalChildren = MASTER_RULES.totalChildren(male, female);
    const areaLabel = opts.areaName || String(get('area','Ministry area')||'');
    const areaId = MASTER_VOCAB.areaIdMap[areaLabel] || (areaLabel? String(areaLabel).toLowerCase().replace(/[^a-z]/g,'') : '') || opts.areaId || '';
    const weekGrid = {};
    for(let w=1; w<=53; w++){
      const v = row['week'+w]!==undefined? row['week'+w] : row[String(w)];
      if(v) weekGrid[w] = String(v).trim().toUpperCase();
    }
    const bags = MASTER_RULES.bagCounts(weekGrid);
    const costs = MASTER_RULES.costs({
      medications:get('EB'), transport:(Number(get('EA'))||0)+(Number(get('EC'))||0),
      outpatient:get('ED'), shif:get('EE'),
      inpatient1:get('EG'), inpatient2:get('EH'), inpatient3:get('EI'), inpatient4:get('EJ')
    });
    const conditions = [];
    if(get('CS','(extra(pulmonaral TB')||get('CV','TB ')) conditions.push({ category:'infectious', label:String(get('CS')||'TB'), sensitive:true });
    if(get('DE','Wound')) conditions.push({ category:'chronic', label:'Chronic wound' });
    if(get('DF','Meningitis')) conditions.push({ category:'infectious', label:'Cryptococcal meningitis', sensitive:true });
    if(get('DG','Stroke')) conditions.push({ category:'chronic', label:'Post-CVA care' });
    if(get('DH','Cancer NEW')) conditions.push({ category:'oncology', label:String(get('DH'))+' cancer' });
    if(get('DK','Malaria')) conditions.push({ category:'infectious', label:'Severe malaria' });
    if(get('DU',"ARV's")) conditions.push({ category:'infectious', label:'HIV - on ART', sensitive:true });

    return {
      ok:true, name, areaId, areaLabel,
      patient:{
        name, nationalId:String(get('B',"Patient's ID")||'').replace(/no id/i,'').trim(),
        spouseId:String(get('C',"Spouses ID")||''), insurance:String(get('D','NHIF')||''),
        status: deceasedMonth? 'deceased' : dischargeMonth? 'discharged' : 'active',
        intake:dateIn? new Date(dateIn).toISOString() : '', enrolledAt:dateIn? String(dateIn).slice(0,10) : '',
        discharge:dateOut? new Date(dateOut).toISOString() : null, dischargedAt:dateOut? String(dateOut).slice(0,10) : null,
        programDays:days, visitFrequency:(()=>{ const s=String(get('Y','Schedule')||''); return s==='EW'?'Every week':s==='EOW'?'Every other week':s==='1 Month'?'Once a month':''; })(),
        household:{ children:totalChildren, maleChildren:male, femaleChildren:female,
          orphansSupported:Number(MASTER_RULES.orphansPrevented(totalChildren, dischargeMonth))||0 },
        master:{
          insurance:String(get('D','NHIF')||''), spouseId:String(get('C',"Spouses ID")||''),
          newInMonth:String(get('E','New in month')||''), inProgramme:String(get('F','In program')||''),
          minimalCare:String(get('G','Minimal Care Patients')||''),
          minimalCareFlag:MASTER_RULES.minimalCareFlag(days, dischargeMonth),
          dischargeMonth:String(dischargeMonth||''), deceasedMonth:String(deceasedMonth||''),
          repeatPatient:String(get('N','Repeat patients')||''), relocated:String(get('O','Relocated patient')||''),
          normalBag:String(get('V','NORMAL BAG')||''), specialBag:String(get('W','SPECIAL BAG')||''),
          medicalOnly:String(get('X','Medical only')||''), schedule:String(get('Y','Schedule')||''),
          weekGrid, bags, hygienePacks:Number(get('CO'))||0, waterGuard:Number(get('CP'))||0,
          vitamins:Number(get('CQ','Vitamins'))||0, lastMonthGiven:String(get('CR','Last month given')||''),
          tbType:String(get('CS')||''), tbFlag:String(get('CV')||''), zvAfrika:String(get('DB')||''),
          photo:String(get('DM','Photo')||''), intakeFlag:String(get('DN','Intake')||''),
          saved:String(get('DO','Saved')||''), mosquitoNet:String(get('DP','Mosquito net')||''),
          viralLoadKnown:String(get('DQ')||''), defaultPatient:String(get('DR','Default Patient')||''),
          woundcare:String(get('DS','Woundcare')||''), bible:String(get('DT','Bible')||''),
          arv:String(get('DU')||''), psc:String(get('DV','PSC')||''),
          hospitalOut:Number(get('DW'))||0, hospitalIn:Number(get('DX'))||0, hospitalVisits:Number(get('DY'))||0,
          deceasedInHospital:String(get('DZ'))||'', costs,
          orphansPrevented:MASTER_RULES.orphansPrevented(totalChildren, dischargeMonth),
          becameOrphans:MASTER_RULES.becameOrphans(totalChildren, deceasedMonth),
          sourceWorkbook:MASTER_WORKBOOK.file, sourceSheet:opts.sheetName||'', sourceRow:opts.rowNumber||null
        }
      },
      conditions,
      support:[
        ...Array(bags.BG1).fill(0).map(()=>({ item:'Bag 1 - normal household food bag', bag:'BG1' })),
        ...Array(bags.BG2).fill(0).map(()=>({ item:'Bag 2 - family / couple food bag', bag:'BG2' })),
        ...Array(bags.SPB).fill(0).map(()=>({ item:'Special bag', bag:'SPB' })),
        ...(Number(get('DT','Bible'))? [{ item:'Bible' }] : []),
        ...(Number(get('DP','Mosquito net'))? [{ item:'Mosquito net' }] : []),
        ...(Number(get('CO'))? [{ item:'Hygiene pack', qty:Number(get('CO')) }] : [])
      ],
      costs
    };
  },

  /* A CSV template the Administration can fill from the workbook and import. */
  csvTemplate(){
    const head = ['A Name patient','B Patient ID','C Spouse ID','D Insurance (NHIF/LMM/Other)','E New in month',
      'I Date in (YYYY-MM-DD)','J Date out (YYYY-MM-DD)','L Discharge month','M Deceased month','N Repeat patient',
      'O Relocated','P Male children','Q Female children','V Normal bag','W Special bag','X Medical only',
      'Y Schedule (EW/EOW/1 Month)','Bags BG1 count','Bags BG2 count','Bags SPB count','Hygiene packs','Water Guard',
      'CS TB type','DH Cancer site','DK Malaria','DE Wound','DG Stroke','DU ARVs','DT Bible','DP Mosquito net',
      'DW Hospital outpatient visits','DX Hospital inpatients','EA Transport cost hospital','EB Medication cost',
      'EC Transport cost','ED Outpatient cost','EE SHIF','EG In-patient cost 1','EH In-patient cost 2',
      'EI In-patient cost 3','EJ In-patient cost 4','Ministry area','Notes'];
    const example = ['Example Patient (delete this row)','12345678','','LMM',"October'26",'2026-10-05','','','',
      '','','1','1','X','','','EOW','2','1','0','1','0','Pulmonary TB','','','','','','X','','',
      '1','0','600','450','300','1200','0','0','0','0','0','Manyatta','Mapped from the master workbook template'];
    download('LOMAMO-master-patient-import-template.csv', '\uFEFF'+[head,example].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n'), 'text/csv');
  },

  /* ---------------- console ---------------- */
  render(user){
    if(!RBAC.has(user,'system.import') && !RBAC.has(user,'audit.view')) return deniedPanel('system.import');
    const bp = this.registrationBlueprint();
    const derived = MASTER_COLUMNS.filter(c=>c.d);
    const colours = chartColours(10);
    return pageHead('Master registry mapping',
      'The Administration\u2019s master patient workbook, sheet by sheet, column by column, formula by formula, mapped into LOMAMO C-DIMS. The workbook file itself is not stored in this repository: patient identities are personal data.',
      `<button class="btn btn-sm btn-ghost" data-act="master-template">${ic('download',15)} Import template (CSV)</button>
       <button class="btn btn-sm btn-primary" data-act="go" data-v="import">${ic('upload',15)} Master data import</button>`)
    + `<div class="grid g4" style="margin-bottom:16px">
        ${kpi('Sheets mapped', num(MASTER_WORKBOOK.sheets.length), 'Every sheet has a home in the system', 'ok', 'layers')}
        ${kpi('Columns mapped', num(MASTER_COLUMNS.length), 'Across '+num(MASTER_GROUPS.length)+' column groups', 'info', 'columns')}
        ${kpi('Formulas rebuilt', num(derived.length), 'Derived in the system, never typed by hand', 'warn', 'flow')}
        ${kpi('Report topics traced', num(MASTER_INDEX_MAP.length), 'Every topic on the INDEX sheet', 'ok', 'file')}
      </div>`
    + card('How the workbook became the system', `<ol class="rule-steps">
        <li><b>Read the structure, not the people.</b> Every sheet, column, validation list, formula and note was studied. No patient identity from the workbook is stored in this repository or embedded in the application.</li>
        <li><b>Registration follows the workbook.</b> The patient registration form is generated from the same column groups, with the same dropdown lists (NHIF/LMM/Other, EW/EOW, BG1/BG2/SPB, cancer sites, TB type).</li>
        <li><b>Derived columns are computed.</b> Days in programme, the minimal-care flag beyond 183 days, total children, orphans prevented, became orphans, bag counts and every cost total are calculated, so they can never disagree with the record.</li>
        <li><b>Costs feed the cost engine.</b> Columns EA to EL (transport, medication, outpatient, SHIF, in-patient 1 to 4, total) and the weekly bag grid become cost lines attributed to the patient.</li>
        <li><b>Reports keep the workbook's own questions.</b> Every topic listed on the INDEX sheet resolves to a report, a pivot or a console in the system.</li>
      </ol>`)
    + `<div style="margin-top:16px">${card('Sheet by sheet', table([
        {label:'Sheet',render:s=>`<div class="cellname">${esc(s.name)}</div><div class="xs muted">${esc(s.kind)}</div>`},
        {label:'Rows',cls:'num',render:s=>num(s.rows)},
        {label:'Mapped to',render:s=>esc(s.mapsTo)},
        {label:'What it holds',render:s=>`<span class="xs">${esc(s.note||'')}</span>`}
      ], MASTER_WORKBOOK.sheets))}</div>`
    + `<div style="margin-top:16px">${card('Column map ('+MASTER_COLUMNS.length+' columns)', `
        <div class="tabs cost-tabs" style="margin-bottom:12px">${MASTER_GROUPS.map((g,i)=>`<button class="tab ${i===0?'active':''}" data-act="master-group" data-g="${esc(g)}">${esc(g)}</button>`).join('')}</div>
        <div id="masterGroupBody">${this.groupTable(MASTER_GROUPS[0])}</div>`,
        {foot:'<span>Click a group to see its columns, the formula as written in the workbook, and where each one lives in LOMAMO C-DIMS.</span>'})}</div>`
    + `<div style="margin-top:16px">${card('Derived rules, rebuilt as code', table([
        {label:'Rule',render:r=>`<div class="cellname">${esc(r.name)}</div><div class="xs muted mono">${esc(r.formula)}</div>`},
        {label:'Column',render:r=>`<span class="mono">${esc(r.col)}</span>`},
        {label:'In LOMAMO C-DIMS',render:r=>esc(r.mapsTo)},
        {label:'Worked example',render:r=>`<span class="xs mono">${esc(r.example)}</span>`}
      ], [
        {name:'Counted days in programme', formula:'=IF(I="";0;J-I)', col:'K', mapsTo:'patients.programDays', example:'2025-07-15 to 2026-01-29 = '+MASTER_RULES.daysInProgramme('2025-07-15','2026-01-29')+' days'},
        {name:'Minimal care beyond 183 days', formula:'=IF(AND(L="";K>183);"x";"")', col:'H', mapsTo:'master.minimalCareFlag', example:'198 days, not discharged = "'+MASTER_RULES.minimalCareFlag(198,'')+'"'},
        {name:'Total children', formula:'=P+Q', col:'R', mapsTo:'household.children', example:'1 male + 2 female = '+MASTER_RULES.totalChildren(1,2)},
        {name:'Children rescued from becoming orphans', formula:'=IF(L="";"";R)', col:'S', mapsTo:'indicator orphans_prevented', example:'discharged in March with 3 children = '+MASTER_RULES.orphansPrevented(3,"March'26")},
        {name:'Children who became orphans', formula:'=IF(M="";"";R)', col:'T', mapsTo:'indicator orphaned', example:'deceased in February with 2 children = '+MASTER_RULES.becameOrphans(2,"February'26")},
        {name:'Bag 1 / Bag 2 / Special bag counts', formula:'=COUNTIF(AB:CB;Tabel!$I$5..7)', col:'CC-CE', mapsTo:'cost engine (bags & supplies)', example:'grid BG1,BG2,BG1,SPB = '+JSON.stringify(MASTER_RULES.bagCounts({1:'BG1',2:'BG2',3:'BG1',4:'SPB'}))},
        {name:'Total other patient cost', formula:'=SUM(EB:EE)', col:'EF', mapsTo:'cost engine subtotal', example:'450+300+1200+0 = '+money(MASTER_RULES.costs({medications:450,transport:300,outpatient:1200,shif:0}).other)},
        {name:'Total cost for the patient', formula:'=EF+EK', col:'EL', mapsTo:'cost engine patient total', example:'1950 other + 2800 in-patient = '+money(MASTER_RULES.costs({medications:450,transport:300,outpatient:1200,shif:0,inpatient1:2800}).total)},
        {name:'Costprice food per visited patient', formula:'=C/D (Expenses food / Visited patients)', col:'Extra MI E', mapsTo:'cost engine: average per patient', example:'KES 511,313 / 129 visited = '+money(Math.round(MASTER_RULES.costPerVisitedPatient(511313,129)))},
        {name:'Slums versus villages ratio', formula:'=Q/S and =R/S', col:'Extra MI T,U', mapsTo:'analytics pivot (area classification)', example:'73 slum / 56 village = '+(MASTER_RULES.slumVillageRatio(73,56).slumPct*100).toFixed(1)+'% / '+(MASTER_RULES.slumVillageRatio(73,56).villagePct*100).toFixed(1)+'%'},
        {name:'Closing control', formula:'=D-(E+F) versus H', col:'MI 2026 G,H,I', mapsTo:'Patient Figures closing calculation', example:'16+22-18-2 = '+MASTER_RULES.closingControl({endLastYear:16,newPatients:22,discharged:18,deceased:2,inProgramme:18}).computed},
        {name:'Long-stay share (>183 days)', formula:'=B51/B50', col:'MI 2026 row 52', mapsTo:'Programme days report', example:'41 of 129 = '+(MASTER_RULES.longStayShare(41,129)*100).toFixed(1)+'%'},
        {name:'Hospital average per patient', formula:'=B351/B350', col:'MI 2026 row 352', mapsTo:'Hospital operations report', example:'214 visits / 96 patients = '+MASTER_RULES.hospitalAverage(96,214).toFixed(2)},
        {name:'TB ten-day pyridoxine cycle', formula:'dispensed + 9 to 10 days', col:'CR Last month given', mapsTo:'TB dispensing control', example:'given 2026-10-05 = next due '+JSON.stringify(MASTER_RULES.nextDoseDay('2026-10-05'))}
      ]))}</div>`
    + `<div style="margin-top:16px">${card('Registration blueprint (what data entry shows)', bp.map(g=>`
        <details class="bp-group" ${g.group==='Identity'?'open':''}><summary><b>${esc(g.group)}</b><span class="xs muted">${num(g.fields.length)} fields</span></summary>
          <div class="tbl-wrap"><table class="tbl align-sym"><thead><tr><th>Field</th><th style="width:70px">Column</th><th style="width:110px">Type</th><th>Allowed values / rule</th><th style="width:190px">Stored as</th></tr></thead>
          <tbody>${g.fields.map(f=>`<tr>
            <td><div class="cellname">${esc(f.label)}${f.required?` ${badge('required','b-crit')}`:''}</div>${f.note?`<div class="xs muted">${esc(f.note)}</div>`:''}</td>
            <td class="mono">${esc(f.column)}</td>
            <td>${esc(f.type)}</td>
            <td class="xs">${Array.isArray(f.options)? f.options.map(o=>`<span class="chip">${esc(String(o))}</span>`).join(' ') : esc(String(f.options||'Free text'))}</td>
            <td class="xs mono muted">${esc(f.mapsTo||'')}</td></tr>`).join('')}</tbody></table></div>
        </details>`).join(''),
        {foot:'<span>The weekly bag grid (AB to CB) and the quarterly hygiene columns (CG to CN) are entered on the visit record, not on registration: they are events, not identity.</span>'})}</div>`
    + `<div style="margin-top:16px">${card('INDEX sheet topics traced into the system', table([
        {label:'Topic on the INDEX sheet',render:m=>`<div class="cellname">${esc(m.topic)}</div>`},
        {label:'Opens',render:m=>`<button class="btn btn-xs btn-ghost" data-act="go" data-v="${esc(m.view)}">${ic('chevron',12)} ${esc(m.view)}</button>`},
        {label:'Report',render:m=>`<span class="mono xs">${esc(m.report)}</span>`},
        {label:'Where the figures come from',render:m=>`<span class="xs muted">${esc(m.note||'')}</span>`}
      ], MASTER_INDEX_MAP))}</div>`
    + `<div style="margin-top:16px">${card('Validation vocabulary (sheet "Tabel")', `
        <div class="grid g3">
          ${[['Months',MASTER_VOCAB.months],['Weekdays',MASTER_VOCAB.weekdays],['Schedule codes',MASTER_VOCAB.schedule],
             ['Bag codes',MASTER_VOCAB.bagCodes],['Insurance',MASTER_VOCAB.insurance],['Cancer sites',MASTER_VOCAB.cancerSites],
             ['Yes / No',MASTER_VOCAB.yesno],['Activity',MASTER_VOCAB.activity],['Ministry areas',MASTER_VOCAB.areas]]
            .map(([label,list])=>`<div class="vocab"><b class="xs muted">${esc(label)}</b><div class="row" style="gap:4px;flex-wrap:wrap;margin-top:6px">${list.map(v=>`<span class="chip">${esc(String(v))}</span>`).join('')}</div></div>`).join('')}
        </div>
        <div style="margin-top:12px">${note('Week numbering: '+esc(MASTER_VOCAB.weekRule)+' Week 1 of 2026 runs '+esc(MASTER_VOCAB.weeks2026[0][1])+' to '+esc(MASTER_VOCAB.weeks2026[0][2])+'; week 53 ends '+esc(MASTER_VOCAB.weeks2026[52][2])+'.','calendar')}</div>`)}
      </div>`
    + `<div style="margin-top:16px">${card('Personal data: what was done and why', alertBox('warn','The workbook is not stored in this repository',
        `<span class="small">The master workbook contains patient names, National IDs, telephone numbers and household details. The repository that serves this application is public, so the file was studied, mapped and then removed from it. The structure, vocabulary, formulas and rules above are what remain, and they contain no patient identity. To load real records, use <b>Master data import</b> with the CSV template: the file is processed on the office host computer and never committed to the repository.</span>`))}</div>`;
  },

  groupTable(group){
    const cols = MASTER_COLUMNS.filter(c=>c.g===group);
    return table([
      {label:'Column',render:c=>`<span class="mono">${esc(c.c)}</span>`},
      {label:'Label as printed in the workbook',render:c=>`<div class="cellname">${esc(c.l)}${c.req?` ${badge('required','b-crit')}`:''}${c.d?` ${badge('derived','b-accent')}`:''}</div>${c.note?`<div class="xs muted">${esc(c.note)}</div>`:''}`},
      {label:'Type',render:c=>esc(c.t)},
      {label:'Allowed values',render:c=>Array.isArray(c.o)? c.o.map(o=>`<span class="chip">${esc(String(o))}</span>`).join(' ') : esc(c.o||'-')},
      {label:'Formula',render:c=>c.f?`<span class="mono xs">${esc(c.f)}</span>`:'<span class="xs muted">Typed in</span>'},
      {label:'In LOMAMO C-DIMS',render:c=>`<span class="xs mono">${esc(c.m||'')}</span>`}
    ], cols);
  }
};

Object.assign(ACTIONS, {
  'master-group': d => {
    const host = $('#masterGroupBody'); if(!host) return;
    host.innerHTML = MASTERX.groupTable(String(d.g||''));
    document.querySelectorAll('[data-act="master-group"]').forEach(b=>b.classList.toggle('active', b.dataset.g===d.g));
  },
  'master-template': () => {
    MASTERX.csvTemplate();
    AUDIT.append({actor:AUTH.user.id, action:'master.template.downloaded', entity:'import', detail:'LOMAMO master patient import template (CSV)'});
    toast('Template downloaded','Fill it from the master workbook and import it on the office host. No patient data belongs in the repository.','ok');
  }
});
