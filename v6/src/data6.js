/* ============================================================
   data6.js - v6 additions to the reference data
   ------------------------------------------------------------
   Three things live here and nowhere else:

   1. The capabilities, roles and departments added in v6.
   2. The official staff roster across leadership, all departments,
      both county offices (Kisumu & Homa Bay) and all 10 ministry areas.
   3. seedOfficial() and enrichV6Collections(): 100% realistic, richly
      populated programme & departmental records across all 3,333 patients
      (95% in 45-240 days, 5% in 241-330 days, zero at 900 days) and
      every operational workspace.
   ============================================================ */

/* ---------------- 1. New capabilities ---------------- */
Object.assign(CAPS, {
  'library.read':      { g:'Department library', l:'Read the department library' },
  'library.borrow':    { g:'Department library', l:'Request to borrow material' },
  'library.manage':    { g:'Department library', l:'Manage the library and its loans', sensitive:true },
  'credit.view':       { g:'Recognition', l:'See C-DIMS coins and usage scores' },
  'credit.manage':     { g:'Recognition', l:'Adjust scores and award coins', sensitive:true },
  'exec.agenda':       { g:'Executive', l:'Read the executive team console', sensitive:true },
  'exec.manage':       { g:'Executive', l:'Publish agendas, minutes and decisions', sensitive:true },
  'inventory.view':    { g:'Assets', l:'View the office equipment register' },
  'inventory.manage':  { g:'Assets', l:'Add, transfer and audit equipment', sensitive:true },
  'intern.view':       { g:'Students & research', l:'View the students and interns register' },
  'intern.manage':     { g:'Students & research', l:'Supervise students, interns and research requests', sensitive:true },
  'ohs.view':          { g:'Occupational safety', l:'View occupational health and safety records' },
  'ohs.manage':        { g:'Occupational safety', l:'Record and manage safety incidents', sensitive:true },
  'indicator.manage':  { g:'Data & indicators', l:'Define data elements and indicators', sensitive:true },
  'dq.manage':         { g:'Data & indicators', l:'Resolve data-quality exceptions', sensitive:true },
  'pmi.merge':         { g:'Patients', l:'Merge duplicate patient identities', sensitive:true },
  'presence.view':     { g:'System', l:'See who is on the network and where' },
  'weather.view':      { g:'System', l:'Open the field weather board' }
});

/* ---------------- 2. Departments added in v6 (15 total LOMAMO departments) ---------------- */
if(!DEPARTMENTS.some(d=>d.id==='it')) DEPARTMENTS.push(
  { id:'it',       name:'ICT & Technical Services',             accent:'#0F172A', short:'ICT' },
  { id:'hospital', name:'Hospital Coordination',                accent:'#BE123C', short:'HOS' },
  { id:'intldata', name:'International Data & Verification',    accent:'#0369A1', short:'INT' }
);
if(!DEPARTMENTS.some(d=>d.id==='intldata')) DEPARTMENTS.push(
  { id:'intldata', name:'International Data & Verification',    accent:'#0369A1', short:'INT' }
);

/* ---------------- 3. Roles ---------------- */
/* "Hospital Liaison Person" is renamed to Hospital Focal Person everywhere it is
   shown. The stored id stays 'liaison' so existing records, delegations and
   audit entries keep pointing at the same role. */
const LIAISON_ROLE = ROLES.find(r=>r.id==='liaison');
if(LIAISON_ROLE){
  LIAISON_ROLE.name = 'Hospital Focal Person';
  LIAISON_ROLE.consoleTitle = 'Hospital Focal Desk';
}
const CCC_CLINICIAN_ROLE = ROLES.find(r=>r.id==='ccc.clinician');
if(CCC_CLINICIAN_ROLE) CCC_CLINICIAN_ROLE.dept = 'hospital';

if(!ROLES.some(r=>r.id==='program.admin')) ROLES.push(
  { id:'program.admin', name:'Chief Program Administrator', dept:'exec', accent:'#7C2D12', consoleTitle:'Programme Administration',
    scope:{ geo:'global', records:'global', crossCounty:true },
    perms:['user.view','user.approve','patient.list','patient.view.basic','report.executive','report.departmental',
           'finance.view','hr.view','audit.view','library.read','library.manage','credit.view','credit.manage',
           'exec.agenda','exec.manage','inventory.view','intern.view','intern.manage','ohs.view','ohs.manage',
           'indicator.manage','dq.manage','message.use','ai.use','presence.view','weather.view','care.view'] },
  { id:'program.assistant', name:'Chief Program Administrator Assistant', dept:'exec', accent:'#B45309', consoleTitle:'Programme Office',
    scope:{ geo:'global', records:'global', crossCounty:true },
    perms:['user.view','patient.list','patient.view.basic','report.departmental','report.executive','library.read',
           'credit.view','exec.agenda','exec.manage','inventory.view','intern.view','intern.manage','ohs.view',
           'message.use','ai.use','presence.view','weather.view'] }
);

if(!ROLES.some(r=>r.id==='it')) ROLES.push(
  { id:'it', name:'ICT & Technical Officer', dept:'it', accent:'#0F172A', consoleTitle:'ICT & Technical Services',
    scope:{ geo:'global', records:'global', crossCounty:true },
    perms:['user.view','system.health','system.backup','org.manage','inventory.view','inventory.manage',
           'library.read','library.manage','presence.view','weather.view','ohs.view','message.use','ai.use'] }
);

if(!ROLES.some(r=>r.id==='homestay')) ROLES.push(
  { id:'homestay', name:'Homestay & Care Centre Coordinator', dept:'homestay', accent:'#C2410C', consoleTitle:'Homestay & Care Centre Console',
    scope:{ geo:'county', records:'county' },
    perms:['patient.list','patient.view.basic','patient.view.clinical','care.view','care.log','care.incident','care.manage',
           'visit.view','pdca.create','hosp.request.create','report.departmental','credit.view','message.use','ai.use'] }
);

if(!ROLES.some(r=>r.id==='intldata')) ROLES.push(
  { id:'intldata', name:'International Data Officer', dept:'intldata', accent:'#0369A1', consoleTitle:'International Data & Cross-Check Console',
    scope:{ geo:'global', records:'global', crossCounty:true },
    perms:['patient.list','patient.view.basic','report.patient_days','report.patient_figures','report.referral','report.executive','report.departmental',
           'condition.aggregate','indicator.manage','dq.manage','audit.view','message.use','ai.use'] }
);

/* Strictly contextual v6 role grants: each role receives ONLY capabilities relevant to its daily context. */
const V6_ROLE_GRANTS = {
  chief:        ['inventory.view','inventory.manage','indicator.manage','dq.manage','pmi.merge','presence.view','message.use'],
  president:    ['exec.agenda','credit.view','message.use'],
  director:     ['exec.agenda','exec.manage','credit.view','credit.manage','dq.manage','message.use'],
  program:      ['exec.agenda','exec.manage','credit.view','library.read'],
  countyadmin:  ['inventory.view','inventory.manage','intern.view','intern.manage','ohs.view','ohs.manage','dq.manage','pmi.merge','presence.view','message.use'],
  assistant:    ['inventory.view','dq.manage','pmi.merge','message.use'],
  coordinator:  ['credit.view','weather.view','pmi.merge','message.use'],
  caregiver:    ['credit.view','weather.view','message.use'],
  chw:          ['credit.view','weather.view','message.use'],
  mcm:          ['intern.view','intern.manage','dq.manage','pmi.merge','library.read','message.use'],
  liaison:      ['credit.view','message.use'],
  nurse:        ['library.read','credit.view','message.use'],
  /* The media department holds the office equipment register: it owns the
     asset labels, the count sheets and the movement ledger. */
  mediahead:    ['library.read','library.manage','library.borrow','inventory.view','inventory.manage','message.use'],
  finance:      ['credit.view','message.use'],
  procurement:  ['inventory.view','inventory.manage','message.use'],
  me:           ['indicator.manage','dq.manage','library.read','message.use'],
  intldata:     ['indicator.manage','dq.manage','library.read','message.use','monday.meeting','intl.medical','gov.oversight','handover.use'],
  auditor:      ['dq.manage','message.use'],
  hr:           ['credit.view','credit.manage','intern.view','intern.manage','ohs.view','ohs.manage','message.use'],
  welfare:      ['credit.view','ohs.view','ohs.manage','message.use'],
  vehicle:      ['inventory.view','weather.view','message.use'],
  pr:           ['library.read','library.borrow','message.use'],
  depthead:     ['credit.view','intern.view','library.read','message.use'],
  it:           ['inventory.view','inventory.manage','presence.view','message.use','monday.meeting','handover.use','dev.console'],
  homestay:     ['credit.view','message.use','monday.meeting','pmi.check','handover.use'],
  'program.admin':     ['library.*','credit.*','exec.*','inventory.*','intern.*','ohs.*','presence.view','weather.view','message.use','indicator.manage','dq.manage','pmi.merge','monday.meeting','monday.manage','pmi.check','hardcopy.intake','gov.oversight','handover.use','admin.ops','admin.ops.kisumu_hq'],
  'program.assistant': ['library.read','library.borrow','credit.view','exec.agenda','inventory.view','intern.view','presence.view','monday.meeting','monday.manage','handover.use','admin.ops']
};
ROLES.forEach(r=>{
  (V6_ROLE_GRANTS[r.id]||[]).forEach(p=>{
    if(p.endsWith('.*')){
      const pre=p.slice(0,-1);
      Object.keys(CAPS).forEach(c=>{ if(c.startsWith(pre) && !r.perms.includes(c)) r.perms.push(c); });
    } else if(!r.perms.includes(p)) r.perms.push(p);
  });
});

const EXEC_DEFAULT = ['chief.admin','director','president','program.admin','program.assistant','mcm.kisumu','kisumu.admin','homabay.admin'];

/* ---------------- 4. Programme duration reference ---------------- */
const PROGRAM_DURATIONS = [30,45,60,75,90,105,120,135,150,165,180,195,210,225,240,255,270,285,300,315,330,345,360];
const PROGRAM_DURATION_DEFAULT = [30,60,90,120,150,180,210,240,270,300,330,360];
const PROGRAM_DAYS_PROFILE = { core:[45,240], tail:[241,330], coreShare:0.95 };

function durationLabel(d){ return d+' days'; }

/* ---------------- 5. Complete Official & Departmental Staff Roster ----------------
   Covers every leadership seat, both County Offices (Kisumu & Homa Bay),
   every department, and every one of the 10 Ministry Areas. */
const OFFICIAL_ROSTER = [
  /* ============================================================
     Roster reprogrammed from the Administration's own staff list.
     People named by Administration carry their own name. A seat that
     Administration has not yet named keeps a SEAT LABEL and is flagged
     `unconfirmed:true` - the system never invents a person. Dual-hatting
     is explicit: one account per workspace, same person where the
     Administration gave one person two responsibilities.
     ============================================================ */

  /* Executive & Foundation Leadership */
  { name:'Martin Mito Chamah',             username:'director',            roleId:'director',          countyId:'kisumu',  areas:[], dept:'exec',     job:'Organisation Director, LOMAMO Foundation' },
  { name:'President / Board Chair (seat to be confirmed)', username:'president', roleId:'president',   countyId:'kisumu',  areas:[], dept:'exec',     job:'President, LOMAMO Foundation', unconfirmed:true },
  { name:'Irene Otieno',                   username:'program.admin',       roleId:'program.admin',     countyId:'kisumu',  areas:[], dept:'exec',     job:'Internal Operations Manager' },
  { name:'Programme Office Assistant (seat to be confirmed)', username:'program.assistant', roleId:'program.assistant', countyId:'kisumu', areas:[], dept:'exec', job:'Program Administrator Assistant', unconfirmed:true },

  /* Chief Administration - Kisumu Admin is also the Chief Admin */
  { name:'Moses Otieno',                   username:'chief.admin',         roleId:'chief',             countyId:'kisumu',  areas:[], dept:'admin',    job:'Chief Administrator (Kisumu Admin & Chief Admin)' },
  { name:'Moses Otieno',                   username:'kisumu.admin',        roleId:'countyadmin',       countyId:'kisumu',  areas:[], dept:'admin',    job:'County Office Administrator (Kisumu) - held concurrently with Chief Admin' },
  { name:'Julie Oguta',                    username:'kisumu.assistant',    roleId:'assistant',         countyId:'kisumu',  areas:[], dept:'admin',    job:'Chief Admin Assistant / Kisumu Admin Assistant' },
  { name:'Oscar Lubalo',                   username:'homabay.admin',       roleId:'countyadmin',       countyId:'homabay', areas:[], dept:'admin',    job:'County Office Administrator (Homa Bay)' },
  { name:'Homa Bay Admin Assistant (seat to be confirmed)', username:'homabay.assistant', roleId:'assistant', countyId:'homabay', areas:[], dept:'admin', job:'Administrative Assistant (Homa Bay)', unconfirmed:true },

  /* Ministry Area Coordinators - one per ministry area, with the home-visit days
     Administration fixed. `visitDays` drives leave coverage, the visit planner
     and the ministry-area console. 1=Monday ... 5=Friday. */
  { name:'Daniel Naphtaly Ombija',         username:'coord.nyalenda',      roleId:'coordinator',       countyId:'kisumu',  areas:['nyalenda'], dept:'ministry', job:'Ministry Area Coordinator · Nyalenda', visitDays:[2,3], visitDaysNote:'Provisional: carried over from the previous schedule until Administration fixes a Nyalenda day.' },
  { name:'Catherine Awuor Obila',          username:'coord.nairobird',     roleId:'coordinator',       countyId:'kisumu',  areas:['nairobird'], dept:'ministry', job:'Ministry Area Coordinator · Nairobi Road', visitDays:[2,4], visitDaysNote:'Home visits Tuesday and Thursday.' },
  { name:'Washington Ayub Odero',          username:'coord.manyatta',      roleId:'coordinator',       countyId:'kisumu',  areas:['manyatta'], dept:'ministry', job:'Ministry Area Coordinator · Manyatta', visitDays:[3], visitDaysNote:'Home visits Wednesday only.' },
  { name:'Allan Dennis Wayodi',            username:'coord.ombeyi',        roleId:'coordinator',       countyId:'kisumu',  areas:['ombeyi','ahero','chiga'], dept:'ministry', job:'Ministry Area Coordinator · Ombeyi (drives for Ahero & Chiga when available)', visitDays:[2,4,5], visitDaysNote:'Ombeyi Tuesday; alternate driver for Ahero Thursday and Chiga Friday.',
    permOverrides:{ grant:['procurement.view','procurement.manage','vehicle.view','vehicle.manage','trip.log','finance.view'] } },
  { name:'John Shikuku Omolo',             username:'coord.nyahera',       roleId:'coordinator',       countyId:'kisumu',  areas:['nyahera','ahero','chiga'], dept:'ministry', job:'Ministry Area Coordinator · Nyahera (drives for Ahero & Chiga when available)', visitDays:[3,4,5], visitDaysNote:'Nyahera Wednesday; assists Ahero Thursday and Chiga Friday.',
    permOverrides:{ grant:['procurement.view','procurement.manage','vehicle.view','vehicle.manage','trip.log'] } },
  { name:'Evans Omondi Odiyo',             username:'coord.ahero',         roleId:'coordinator',       countyId:'kisumu',  areas:['ahero','ombeyi'], dept:'ministry', job:'Ministry Area Coordinator · Ahero', visitDays:[4,2], visitDaysNote:'Ahero Thursday; assists Ombeyi Tuesday.' },
  { name:'Wycliff Otieno',                 username:'coord.chiga',         roleId:'coordinator',       countyId:'kisumu',  areas:['chiga'], dept:'ministry', job:'Ministry Area Coordinator · Chiga (hospital ministry duties)', visitDays:[5], visitDaysNote:'Chiga Friday. May leave on a Monday to assist patients at the hospital.', canLeaveMonday:true },
  { name:'Daniel Ondu',                    username:'coord.homabay',       roleId:'coordinator',       countyId:'homabay', areas:['makongeni','shauriyako','sofia'], dept:'ministry', job:'Homa Bay County Coordinator (the Director\u2019s eyes in Homa Bay County)', visitDays:[], visitDaysNote:'Homa Bay field days will be added later.' },

  /* Supporting caregivers - one seat per ministry area. Seats Administration has
     not yet named keep a seat label; nobody is invented. */
  { name:'Ashar Anyango Omondi',           username:'caregiver.nairobird', roleId:'caregiver',         countyId:'kisumu',  areas:['nairobird','nyahera'], dept:'ministry', job:'Supporting Caregiver · Nairobi Road (Tue & Thu) and Nyahera (Wed)', visitDays:[2,3,4] },
  { name:'Evans Omondi Odiyo',             username:'caregiver.ombeyi',    roleId:'caregiver',         countyId:'kisumu',  areas:['ombeyi'],   dept:'ministry', job:'Supporting Caregiver · Ombeyi (Tuesday)', visitDays:[2] },
  { name:'Manyatta Care Team (rotating caregiver, casual worker or CHV)', username:'caregiver.manyatta', roleId:'caregiver', countyId:'kisumu', areas:['manyatta'], dept:'ministry', job:'Supporting Caregiver · Manyatta (Wednesday)', visitDays:[3], unconfirmed:true,
    note:'Assisted by any available caregiver, casual worker or Community Health Volunteer registered by the concerned admin office.' },
  { name:'Ahero Care Team (John Shikuku Omolo or Allan Dennis Wayodi)', username:'caregiver.ahero', roleId:'caregiver', countyId:'kisumu', areas:['ahero'], dept:'ministry', job:'Supporting Caregiver · Ahero (Thursday)', visitDays:[4], unconfirmed:true,
    note:'Whoever of the two drivers is available assists Evans.' },
  { name:'Chiga Care Team (John Shikuku Omolo or Allan Dennis Wayodi)', username:'caregiver.chiga', roleId:'caregiver', countyId:'kisumu', areas:['chiga'], dept:'ministry', job:'Supporting Caregiver · Chiga (Friday)', visitDays:[5], unconfirmed:true,
    note:'Whoever of the two drivers is available assists Wycliff.' },
  { name:'Nyalenda Care Team (caregiver seat to be confirmed)', username:'caregiver.nyalenda', roleId:'caregiver', countyId:'kisumu', areas:['nyalenda'], dept:'ministry', job:'Supporting Caregiver · Nyalenda', visitDays:[2,3], unconfirmed:true },
  { name:'Nyahera Care Team (caregiver seat to be confirmed)', username:'caregiver.nyahera', roleId:'caregiver', countyId:'kisumu', areas:['nyahera'], dept:'ministry', job:'Supporting Caregiver · Nyahera (Wednesday)', visitDays:[3], unconfirmed:true },
  { name:'Julia Orwa',                     username:'caregiver.makongeni', roleId:'caregiver',         countyId:'homabay', areas:['makongeni'], dept:'ministry', job:'Supporting Caregiver · Homa Bay (Makongeni)', visitDays:[] },
  { name:'Shauri Yako Care Team (seat to be confirmed)', username:'caregiver.shauriyako', roleId:'caregiver', countyId:'homabay', areas:['shauriyako'], dept:'ministry', job:'Supporting Caregiver · Shauri Yako', visitDays:[], unconfirmed:true },
  { name:'Sofia Care Team (seat to be confirmed)', username:'caregiver.sofia', roleId:'caregiver', countyId:'homabay', areas:['sofia'], dept:'ministry', job:'Supporting Caregiver · Sofia', visitDays:[], unconfirmed:true },

  /* Community Health Partners, Volunteers and the casual pool */
  { name:'Susan Mildred',                  username:'chw.nyalenda',        roleId:'chw',               countyId:'kisumu',  areas:['nyalenda'], dept:'ministry', job:'Nyalenda Community Health Partner - assists Friday hospital visits' },
  { name:'Iscah Abuto',                    username:'chw.manyatta.iscah',  roleId:'chw',               countyId:'kisumu',  areas:['manyatta'], dept:'ministry', job:'Community Health Volunteer · Manyatta pool' },
  { name:'Millicent Achieng Otieno',       username:'chw.manyatta.millicent', roleId:'chw',            countyId:'kisumu',  areas:['manyatta'], dept:'ministry', job:'Community Health Volunteer · Manyatta pool' },
  { name:'Caroline (casual caregiver)',    username:'chw.manyatta.caroline', roleId:'chw',             countyId:'kisumu',  areas:['manyatta'], dept:'ministry', job:'Casual caregiver · Manyatta pool', surnamePending:true },
  { name:'Maureen (casual caregiver)',     username:'chw.manyatta.maureen', roleId:'chw',              countyId:'kisumu',  areas:['manyatta'], dept:'ministry', job:'Casual caregiver · Manyatta pool', surnamePending:true },

  /* Homestay & Care Centre Coordinators */
  { name:'Homestay Coordinator, Kisumu (seat to be confirmed)',  username:'homestay.kisumu',  roleId:'homestay', countyId:'kisumu',  areas:[], dept:'ministry', job:'Homestay & Care Centre Coordinator (Kisumu)', unconfirmed:true },
  { name:'Homestay Coordinator, Homa Bay (seat to be confirmed)',username:'homestay.homabay', roleId:'homestay', countyId:'homabay', areas:[], dept:'ministry', job:'Homestay & Care Centre Coordinator (Homa Bay)', unconfirmed:true },

  /* Hospital Ministry / Department - Washington heads it and may assign Susan */
  { name:'Washington Ayub Odero',          username:'focal.kisumu',        roleId:'liaison',           countyId:'kisumu',  areas:[], dept:'hospital', job:'Head of Hospital Department · Hospital Focal Person (Friday hospital visits)' },
  { name:'Susan Mildred',                  username:'liaison.kisumu',      roleId:'liaison',           countyId:'kisumu',  areas:[], dept:'hospital', job:'Hospital Focal Person (Kisumu) - assigned by the Head of Hospital Department when he is unavailable' },
  { name:'Hospital Focal Person, Homa Bay (seat to be confirmed)', username:'focal.homabay', roleId:'liaison', countyId:'homabay', areas:[], dept:'hospital', job:'Hospital Focal Person · Homa Bay Referral', unconfirmed:true },
  { name:'Hospital Focal Person, Homa Bay (seat to be confirmed)', username:'liaison.homabay', roleId:'liaison', countyId:'homabay', areas:[], dept:'hospital', job:'Hospital Focal Person (Homa Bay)', unconfirmed:true },

  /* Medical, Clinical & Pharmacy */
  { name:'Head of Medical Department (seat to be confirmed)', username:'depthead.medical', roleId:'depthead', countyId:'kisumu', areas:[], dept:'medical', job:'Head of Medical Department', unconfirmed:true },
  { name:'Medical Case Manager, Kisumu (seat to be confirmed)', username:'mcm.kisumu', roleId:'mcm', countyId:'kisumu', areas:[], dept:'medical', job:'Medical Case Manager (Kisumu) - answers TB pyridoxine requests', unconfirmed:true },
  { name:'Medical Case Manager, Homa Bay (seat to be confirmed)', username:'mcm.homabay', roleId:'mcm', countyId:'homabay', areas:[], dept:'medical', job:'Medical Case Manager (Homa Bay)', unconfirmed:true },
  { name:'Clinical Officer, Kisumu (seat to be confirmed)', username:'nurse.kisumu', roleId:'nurse', countyId:'kisumu', areas:[], dept:'medical', job:'Clinical Officer & Pharmacy Lead (Kisumu)', unconfirmed:true },
  { name:'Clinical Officer, Homa Bay (seat to be confirmed)', username:'nurse.homabay', roleId:'nurse', countyId:'homabay', areas:[], dept:'medical', job:'Clinical Officer & Nurse (Homa Bay)', unconfirmed:true },
  { name:'Clinical Pharmacist, Kisumu (seat to be confirmed)', username:'pharmacy.kisumu', roleId:'nurse', countyId:'kisumu', areas:[], dept:'pharmacy', job:'Clinical Pharmacist & FEFO Officer (Kisumu)', unconfirmed:true },

  /* Department heads named by Administration */
  { name:'Allan Dennis Wayodi',            username:'procurement',         roleId:'procurement',       countyId:'kisumu',  areas:[], dept:'procure',  job:'Head of Procurement Department' },
  { name:'John Shikuku Omolo',             username:'vehicle.officer',     roleId:'vehicle',           countyId:'kisumu',  areas:[], dept:'vehicle',  job:'Deputy Head of Vehicle & Transport and of Procurement (Allan Dennis Wayodi heads both)',
    permOverrides:{ grant:['procurement.view','procurement.manage'] } },
  { name:'Daniel Naphtaly Ombija',         username:'media.head',          roleId:'mediahead',         countyId:'kisumu',  areas:[], dept:'media',    job:'Head of Media Department (Kisumu)' },
  { name:'Oscar Lubalo',                   username:'media.homabay',       roleId:'mediahead',         countyId:'homabay', areas:[], dept:'media',    job:'Head of Media Department (Homa Bay) - equal privileges in the department workspace' },
  { name:'Catherine Awuor Obila',          username:'pr.officer',          roleId:'pr',                countyId:'kisumu',  areas:[], dept:'pr',       job:'In charge of the Public Relations Office' },
  { name:'Ashar Anyango Omondi',           username:'welfare.officer',     roleId:'welfare',           countyId:'kisumu',  areas:[], dept:'welfare',  job:'Head of Staff Welfare Department' },

  /* Finance, M&E, Audit, HR, ICT & International Data */
  { name:'Finance Officer, Kisumu (seat to be confirmed)', username:'finance.kisumu', roleId:'finance', countyId:'kisumu', areas:[], dept:'finance', job:'Finance Officer (Kisumu)', unconfirmed:true },
  { name:'Finance Officer, Homa Bay (seat to be confirmed)', username:'finance.homabay', roleId:'finance', countyId:'homabay', areas:[], dept:'finance', job:'Finance Officer (Homa Bay)', unconfirmed:true },
  { name:'M&E / Data Officer, Kisumu (seat to be confirmed)', username:'me.kisumu', roleId:'me', countyId:'kisumu', areas:[], dept:'me', job:'Monitoring, Evaluation & Data Officer (Kisumu)', unconfirmed:true },
  { name:'M&E / Data Officer, Homa Bay (seat to be confirmed)', username:'me.homabay', roleId:'me', countyId:'homabay', areas:[], dept:'me', job:'Monitoring & Evaluation Officer (Homa Bay)', unconfirmed:true },
  { name:'International Data Lead (seat to be confirmed)', username:'intl.data', roleId:'intldata', countyId:'kisumu', areas:[], dept:'intldata', job:'International Data & Global Verification Lead', unconfirmed:true },
  { name:'International Data Analyst (seat to be confirmed)', username:'intl.analyst', roleId:'intldata', countyId:'kisumu', areas:[], dept:'intldata', job:'International Data Analyst', unconfirmed:true },
  { name:'Internal Auditor (seat to be confirmed)', username:'auditor', roleId:'auditor', countyId:'kisumu', areas:[], dept:'audit', job:'Internal Auditor & Compliance Officer', unconfirmed:true },
  { name:'Human Resource Officer (seat to be confirmed)', username:'hr.officer', roleId:'hr', countyId:'kisumu', areas:[], dept:'hr', job:'Human Resource Officer', unconfirmed:true },
  { name:'ICT & Host Officer (seat to be confirmed)', username:'ict.officer', roleId:'it', countyId:'kisumu', areas:[], dept:'it', job:'ICT, Network & CareLink Host Officer', unconfirmed:true },

  /* External Health Facility CCC / PSC Clinicians, Government Partners & International Medical Team */
  { name:'CCC / PSC Clinician · JOOTRH (seat to be confirmed)', username:'ccc.jootrh', roleId:'ccc.clinician', countyId:'kisumu', areas:[], dept:'hospital', job:'CCC / PSC Referral Clinician · JOOTRH Kisumu', facility:'Jaramogi Oginga Odinga Teaching & Referral Hospital (JOOTRH)', facilityType:'Referral Hospital CCC', cadre:'Clinical Officer', unconfirmed:true },
  { name:'CCC / PSC Clinician · KCRH (seat to be confirmed)', username:'ccc.kcrh', roleId:'ccc.clinician', countyId:'kisumu', areas:[], dept:'hospital', job:'CCC / PSC Referral Clinician · Kisumu County Referral Hospital', facility:'Kisumu County Referral Hospital (KCRH)', facilityType:'County Hospital PSC', cadre:'Nursing Officer', unconfirmed:true },
  { name:'CCC / PSC Clinician · Homa Bay Referral (seat to be confirmed)', username:'ccc.homabay', roleId:'ccc.clinician', countyId:'homabay', areas:[], dept:'hospital', job:'CCC / PSC Referral Clinician · Homa Bay County Referral Hospital', facility:'Homa Bay County Teaching & Referral Hospital', facilityType:'Referral Hospital CCC', cadre:'Clinical Officer', unconfirmed:true },
  { name:'County Health Partnership Desk · Kisumu (seat to be confirmed)', username:'gov.kisumu', roleId:'gov.partner', countyId:'kisumu', areas:[], dept:'exec', job:'County Government of Kisumu · Dept. of Medical Services, Public Health & Sanitation', agency:'County Government of Kisumu (CGK)', unconfirmed:true },
  { name:'County Health Partnership Desk · Homa Bay (seat to be confirmed)', username:'gov.homabay', roleId:'gov.partner', countyId:'homabay', areas:[], dept:'exec', job:'County Government of Homa Bay · County Health Management Team', agency:'County Government of Homa Bay', unconfirmed:true },
  { name:'National Health Oversight Desk · MOH / NASCOP (seat to be confirmed)', username:'gov.national', roleId:'gov.partner', countyId:'kisumu', areas:[], dept:'exec', job:'Ministry of Health Kenya · NASCOP & Community Health Partnership', agency:'Ministry of Health Kenya', unconfirmed:true },
  { name:'International Medical Team Specialist (seat to be confirmed)', username:'intl.medical', roleId:'intl.medical', countyId:'kisumu', areas:[], dept:'medical', job:'International Medical Team · 120+ Day PDCA & Global Clinical Review', specialty:'Infectious Disease & Nutritional Recovery', unconfirmed:true },
  { name:'International Medical PDCA Lead (seat to be confirmed)', username:'intl.pdca', roleId:'intl.medical', countyId:'kisumu', areas:[], dept:'medical', job:'International Medical PDCA Overstay Review Lead', specialty:'HIV/TB Resistance & Complex Case PDCA', unconfirmed:true },

  /* Organogram-applicable Deputies, Secretaries & Departmental Clerks (strictly in applicable offices/levels only) */
  { name:'Executive & Management Meeting Secretary (seat to be confirmed)', username:'exec.secretary', roleId:'program.assistant', countyId:'kisumu', areas:[], dept:'exec', job:'Executive & Management Meeting Secretary · Head Office Kisumu', seatTier:'secretary', unconfirmed:true },
  { name:'County Office Secretary · Kisumu (seat to be confirmed)', username:'secretary.kisumu', roleId:'assistant', countyId:'kisumu', areas:[], dept:'admin', job:'County Office Secretary & Receptionist · Kisumu Head Office', seatTier:'secretary', unconfirmed:true },
  { name:'County Office Secretary · Homa Bay (seat to be confirmed)', username:'secretary.homabay', roleId:'assistant', countyId:'homabay', areas:[], dept:'admin', job:'County Office Secretary & Receptionist · Homa Bay Office', seatTier:'secretary', unconfirmed:true },
  { name:'Records & Hard-Copy Intake Clerk · Kisumu (seat to be confirmed)', username:'clerk.records.kisumu', roleId:'assistant', countyId:'kisumu', areas:[], dept:'admin', job:'Records & Hard-Copy Assessment Filing Clerk · Kisumu Head Office', seatTier:'clerk', unconfirmed:true },
  { name:'Records & Hard-Copy Intake Clerk · Homa Bay (seat to be confirmed)', username:'clerk.records.homabay', roleId:'assistant', countyId:'homabay', areas:[], dept:'admin', job:'Records & Hard-Copy Assessment Filing Clerk · Homa Bay Office', seatTier:'clerk', unconfirmed:true },
  { name:'John Shikuku Omolo', username:'deputy.procurement', roleId:'procurement', countyId:'kisumu', areas:[], dept:'procure', job:'Deputy Head of Procurement Department (deputises Allan Dennis Wayodi)', seatTier:'deputy',
    permOverrides:{ grant:['vehicle.view','trip.log'] } },
  { name:'Procurement & Foodbag Stores Clerk · Kisumu (seat to be confirmed)', username:'clerk.stores.kisumu', roleId:'procurement', countyId:'kisumu', areas:[], dept:'procure', job:'Procurement & Foodbag Stores Clerk (Bag 1 / Bag 2 / Special tally)', seatTier:'clerk', unconfirmed:true },
  { name:'Deputy Finance Officer · Head Office (seat to be confirmed)', username:'deputy.finance', roleId:'finance', countyId:'kisumu', areas:[], dept:'finance', job:'Deputy Finance Officer · Kisumu Head Office', seatTier:'deputy', unconfirmed:true },
  { name:'Accounts & Voucher Reconciliation Clerk · Kisumu (seat to be confirmed)', username:'clerk.accounts.kisumu', roleId:'finance', countyId:'kisumu', areas:[], dept:'finance', job:'Accounts & Hospital Receipt Reconciliation Clerk · Kisumu', seatTier:'clerk', unconfirmed:true },
  { name:'Deputy Head of Medical & Clinical Services (seat to be confirmed)', username:'deputy.medical', roleId:'mcm', countyId:'kisumu', areas:[], dept:'medical', job:'Deputy Head of Medical & Clinical Services · Kisumu', seatTier:'deputy', unconfirmed:true },
  { name:'Pharmacy & TB Stock Tally Clerk · Kisumu (seat to be confirmed)', username:'clerk.pharmacy.kisumu', roleId:'nurse', countyId:'kisumu', areas:[], dept:'medical', job:'Pharmacy Dispensing & TB Pyridoxine Tally Clerk · Kisumu', seatTier:'clerk', unconfirmed:true },
  { name:'M&E Data Verification Clerk · Kisumu (seat to be confirmed)', username:'clerk.data.kisumu', roleId:'me', countyId:'kisumu', areas:[], dept:'me', job:'M&E Data Entry & Area Sheet Verification Clerk · Kisumu', seatTier:'clerk', unconfirmed:true },
  { name:'M&E Data Verification Clerk · Homa Bay (seat to be confirmed)', username:'clerk.data.homabay', roleId:'me', countyId:'homabay', areas:[], dept:'me', job:'M&E Data Entry & Area Sheet Verification Clerk · Homa Bay', seatTier:'clerk', unconfirmed:true },
  { name:'Deputy Human Resource Officer (seat to be confirmed)', username:'deputy.hr', roleId:'hr', countyId:'kisumu', areas:[], dept:'hr', job:'Deputy Human Resource Officer · Kisumu Head Office', seatTier:'deputy', unconfirmed:true }
];

/* Every name on the official roster, lower-cased, so the generated reference
   register can be checked against it. */
const STAFF_NAMES = new Set([
  'moses nyanjong', 'moses otieno', 'john shikuku', 'john omolo',
  ...OFFICIAL_ROSTER.flatMap(r=>{
    const n = String(r.name||'').replace(/\(.*?\)/g,'').trim().toLowerCase();
    const w = n.split(/\s+/).filter(Boolean);
    return w.length >= 2 ? [n, w[0]+' '+w[1], w[0]+' '+w[w.length-1]] : [n];
  })
]);

/* ---------------- 6. Names for the reference register ---------------- */
const KENYAN_GIVEN_F = ['Addah','Anyango','Akinyi','Achieng','Atieno','Awuor','Adhiambo','Njeri','Wanjiku','Amina','Faith','Grace','Mercy','Esther','Linet','Millicent','Pamela','Rosemary','Beatrice','Caroline','Hellen','Jane','Judith','Keziah','Lydia','Margaret','Nancy','Purity','Rachael','Sarah','Sharon','Susan','Tabitha','Violet','Winnie','Zainabu'];
const KENYAN_GIVEN_M = ['Daniel','Naphtaly','Ombija','Otieno','Omondi','Odhiambo','Ouma','Onyango','Wafula','Wekesa','Barasa','Kipchoge','Mutiso','Kamau','Njoroge','Brian','Collins','Dennis','Elijah','Emmanuel','Evans','Felix','George','Isaac','James','John','Joseph','Kevin','Martin','Moses','Patrick','Peter','Samuel','Stephen','Victor'];
const KENYAN_SURNAMES = ['Odongo','Ombija','Otieno','Omondi','Odhiambo','Ouma','Onyango','Owino','Ogutu','Okoth','Achieng','Anyango','Awuor','Adhiambo','Nyambura','Wanjiru','Njoroge','Kamau','Mwangi','Ochieng','Obila','Odiyo','Odero','Nyanjong','Lubalo','Oduor','Owuor','Atieno','Nyongesa','Barasa','Wanyama','Kiptoo','Cheruiyot','Mutiso','Musyoka','Kilonzo','Wambua','Muthoni','Chebet','Kemboi'];
const KENYAN_GUARDIANS = ['Both parents','Single parent','Grandparent','Sibling','Aunt','Community guardian'];

/* ---------------- 7. The reference register & rich v6 collections ---------------- */
function rng6(seed){
  let s = seed >>> 0;
  return function(){ s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

/* Attach rich v6 operational collections to any database (seedDemo or seedOfficial)
   so zero departmental workspaces ever open empty. */
function enrichV6Collections(db, T){
  const now = T ? new Date(T) : new Date();
  const DAY = 86400000;
  const iso = d => new Date(d).toISOString();
  const ago = n => iso(new Date(now.getTime() - n*DAY));
  const ahead = n => iso(new Date(now.getTime() + n*DAY));
  const users = db.users || [];
  const patients = db.patients || [];
  const visits = db.visits || [];

  db.libraryItems = librarySeed(users);
  const lib0 = db.libraryItems[0], lib4 = db.libraryItems[4], lib8 = db.libraryItems[8];
  const uFin = (users.find(u=>u.roleId==='finance')||users[0]||{}).id || 'u-chief';
  const uCg  = (users.find(u=>u.roleId==='caregiver')||users[0]||{}).id || 'u-chief';
  const uMcm = (users.find(u=>u.roleId==='mcm')||users[0]||{}).id || 'u-chief';
  const uMed = (users.find(u=>u.roleId==='mediahead')||users[0]||{}).id || 'u-chief';
  const uPr  = (users.find(u=>u.roleId==='pr')||users[0]||{}).id || 'u-chief';
  const uHr  = (users.find(u=>u.roleId==='hr')||users[0]||{}).id || 'u-chief';
  const uVeh = (users.find(u=>u.roleId==='vehicle')||users[0]||{}).id || 'u-chief';
  const uLia = (users.find(u=>u.roleId==='liaison')||users[0]||{}).id || 'u-chief';
  const uDir = (users.find(u=>u.roleId==='director')||users[0]||{}).id || 'u-chief';

  db.borrowRequests = [
    { id:'brw-001', itemId:lib4.id, title:lib4.title, department:lib4.department, requesterId:uCg,
      purpose:'Field refresher on updated adult intake vitals section', status:'approved',
      requestedAt:ago(6), approvedBy:uMcm, approvedAt:ago(5), expiresAt:ahead(9) },
    { id:'brw-002', itemId:lib8.id, title:lib8.title, department:lib8.department, requesterId:uMcm,
      purpose:'Cross-checking medical transport cost ceilings for Q4 review', status:'pending',
      requestedAt:ago(1), approvedBy:null, approvedAt:null, expiresAt:ahead(13) },
    { id:'brw-003', itemId:lib0.id, title:lib0.title, department:lib0.department, requesterId:uPr,
      purpose:'Donor newsletter consent verification checklist', status:'approved',
      requestedAt:ago(12), approvedBy:uMed, approvedAt:ago(11), expiresAt:ahead(3) }
  ];

  db.credits = creditsSeed(users, patients, visits);
  db.rewardEvents = [
    { id:'rw-001', userId:uCg, by:uDir, delta:15, kind:'award', reason:'100% timely home-visit and PDCA documentation across Nyalenda cluster', at:ago(9) },
    { id:'rw-002', userId:uLia, by:uMcm, delta:12, kind:'award', reason:'Same-day JOOTRH cervical screening dispatch and receipt reconciliation', at:ago(5) },
    { id:'rw-003', userId:uFin, by:uDir, delta:10, kind:'award', reason:'Zero unverified expenditure vouchers on monthly county close', at:ago(3) }
  ];
  db.rewardEvents.forEach(ev=>{
    if(db.credits[ev.userId]) db.credits[ev.userId].coins = (db.credits[ev.userId].coins||0) + ev.delta;
  });

  db.execMeetings = typeof execSeed === 'function' ? execSeed(now, users) : [];
  db.inventoryItems = typeof inventorySeed === 'function' ? inventorySeed() : (db.inventoryItems || []);
  db.inventoryMoves = [
    { id:'imv-001', itemId:(db.inventoryItems[0]||{}).id||'inv-001', action:'audit', by:uVeh,
      from:'Main Office Store', to:'Field Operations Desk', qty:2, note:'Quarterly physical asset verification completed', at:ago(10) },
    { id:'imv-002', itemId:(db.inventoryItems[2]||{}).id||'inv-003', action:'transfer', by:uMed,
      from:'Media Studio', to:'Homa Bay County Office', qty:1, note:'Field documentation kit issued for Homa Bay outreach week', at:ago(4) }
  ];
  db.interns = typeof internSeed === 'function' ? internSeed(now) : [];
  db.ohsIncidents = typeof ohsSeed === 'function' ? ohsSeed(now, users) : [];
  db.ohsChecks = [
    { id:'chk-001', area:'Kisumu Main Office & Pharmacy', inspector:uHr, at:ago(7), pass:true, note:'Fire extinguishers charged, first-aid kits stocked, cold-box thermometer calibrated.' },
    { id:'chk-002', area:'Fleet & Compound Dispatch Bay', inspector:uVeh, at:ago(3), pass:true, note:'Tyre tread depth, reflective triangles, first-aid box and reversing marshal protocol verified.' }
  ];
  db.dataElements = typeof dataElementSeed === 'function' ? dataElementSeed() : (db.dataElements || []);
  db.indicators = typeof indicatorSeed === 'function' ? indicatorSeed() : (db.indicators || []);
  db.dqIssues = db.dqIssues || [];

  /* Public Relations stakeholders, enquiries, media studio projects, messages & calendar */
  if(!db.stakeholders || !db.stakeholders.length){
    db.stakeholders = [
      { id:'stk-001', name:'JOOTRH Social Work & Oncology Unit', kind:'Referral hospital', county:'Kisumu', contact:'Focal Desk · 0712 340 890', status:'active', note:'Primary tertiary referral partner for oncology, TB & complex inpatient care.' },
      { id:'stk-002', name:'Kisumu County Department of Health (CHMT)', kind:'County government', county:'Kisumu', contact:'Sub-County CHS Coordinator', status:'active', note:'Community health strategy & non-official data verification alignment.' },
      { id:'stk-003', name:'Homa Bay County Referral Hospital', kind:'Referral hospital', county:'Homa Bay', contact:'Outpatient Liaison Desk', status:'active', note:'Homa Bay Town cluster referral & SHA verification partner.' },
      { id:'stk-004', name:'Local Church & Community Orphan-Prevention Network', kind:'Community partner', county:'Kisumu', contact:'Pastoral & Household Support Desk', status:'active', note:'Household nutrition, Upper Room discipleship and guardian support.' }
    ];
  }
  if(!db.enquiries || !db.enquiries.length){
    db.enquiries = [
      { id:'enq-001', from:'Nyalenda Community Health Committee', channel:'walk_in', subject:' Joint community nutrition & cervical screening awareness day',
        detail:'Requesting LOMAMO participation in next month community health dialogue day.', at:ago(6), status:'answered',
        loggedBy:uPr, answeredBy:uPr, answeredAt:ago(5), answer:'Confirmed joint health education desk with Medical Case Manager and Nyalenda Caregiver team.', referral:'data', demo:true },
      { id:'enq-002', from:'Partner Donor Programme Desk', channel:'email', subject:'Q3 Orphan Prevention Household Impact Summary',
        detail:'Requesting verified Q3 aggregate patient-day and household stability summary.', at:ago(2), status:'open',
        loggedBy:uPr, demo:true }
    ];
  }
  if(!db.mediaProjects || !db.mediaProjects.length){
    db.mediaProjects = [
      { id:'mpj-001', title:'Saving Lives, Preventing Orphans: Kisumu Rural Caregivers Documentary', kind:'video', stage:'review', lead:uMed, due:ahead(12), consentCleared:true, summary:'Short documentary highlighting cross-departmental care in Ombeyi, Chiga and Ahero without identifying clinical status.' },
      { id:'mpj-002', title:'Upper Room Discipleship Podcast · Series 4 Audio Mastering', kind:'podcast', stage:'production', lead:uMed, due:ahead(5), consentCleared:true, summary:'Weekly encouragement episodes for caregivers, homestay residents and community families.' },
      { id:'mpj-003', title:'Annual Donor Impact Visual Report FY2026', kind:'report', stage:'planning', lead:uPr, due:ahead(24), consentCleared:true, summary:'Verified aggregate outcomes across all 10 ministry areas.' }
    ];
  }
  if(!db.messages || !db.messages.length){
    const medIds = users.filter(u=>u.departmentId==='medical'||u.departmentId==='hospital').map(u=>u.id);
    const minIds = users.filter(u=>u.departmentId==='ministry'||u.roleId==='director').map(u=>u.id);
    db.messages = [
      { id:'msg-001', thread:'dept:medical', kind:'dept', from:uMcm, to:medIds.length?medIds:[uMcm,uLia], at:ago(1), readBy:medIds.length?[...medIds]:[uMcm, uLia], text:'Morning team: please ensure all Friday JOOTRH outpatient review slips have SHA status verified before 15:00 today.' },
      { id:'msg-002', thread:'dept:medical', kind:'dept', from:uLia, to:medIds.length?medIds:[uMcm,uLia], at:ago(0.8), readBy:medIds.length?[...medIds]:[uMcm, uLia], text:'Confirmed. Four transport dispatches and two lab follow-ups are already scheduled with the vehicle desk.' },
      { id:'msg-003', thread:'dept:ministry', kind:'dept', from:uDir, to:minIds.length?minIds:[uDir,uCg], at:ago(2), readBy:minIds.length?[...minIds]:[uDir, uCg], text:'Thank you to every coordinator and caregiver across Kisumu and Homa Bay for achieving 96% timely 30-day PDCA reviews this week.' }
    ];
  }
  if(!db.calendarEvents || !db.calendarEvents.length){
    db.calendarEvents = [
      { id:'cal-001', date:iso(now).slice(0,10), title:'Monday 08:00 Management & County Figures Review', kind:'meeting', countyId:'kisumu', ownerId:uDir, detail:'Weekly review of Patient Figures, Patient-Days and Hospital Dispatch queue.' },
      { id:'cal-002', date:ahead(2).slice(0,10), title:'JOOTRH Specialist Clinic & Screening Dispatch Day', kind:'hospital', countyId:'kisumu', ownerId:uLia, detail:'Coordinated vehicle dispatch with Hospital Focal Desk and Medical Case Manager.' },
      { id:'cal-003', date:ahead(4).slice(0,10), title:'Homa Bay Cluster Supervision & Pharmacy Stock Audit', kind:'field', countyId:'homabay', ownerId:uMcm, detail:'Makongeni, Shauri Yako and Sofia caregiver supervision and batch check.' }
    ];
  }
  /* Ensure Upper Room Discipleship Podcast & richly illustrated public items exist */
  db.publications = db.publications || [];
  if(!db.publications.some(p=>/Upper Room/i.test(p.title||''))){
    db.publications.unshift(
      { id:'pub-upper-room', title:'Upper Room Discipleship Podcast: Hope & Strength for Every Household', category:'audio', format:'podcast',
        duration:'24 min 15 s', status:'published', public:true, publishedAt:ago(2), createdAt:ago(4), createdBy:uMed,
        photoKey:'united_hands',
        summary:'Weekly devotional, family resilience and caregiver encouragement recorded by the LOMAMO Foundation ministry team across Kisumu and Homa Bay.',
        body:'Welcome to the Upper Room Discipleship Podcast from LOMAMO Foundation Kenya.\n\nEach week our pastoral, caregiving and homestay teams share practical encouragement on walking alongside vulnerable families in love, strengthening guardians, and ensuring every child grows up safe within a supported household.',
        versions:[{at:ago(2), by:uMed, action:'published'}], demo:true },
      { id:'pub-teamwork-story', title:'How Eight Departments Unite Around One Household to Prevent Orphans', category:'programme', format:'article',
        duration:'5 min read', status:'published', public:true, publishedAt:ago(6), createdAt:ago(8), createdBy:uPr,
        photoKey:'analytics_screen',
        summary:'From the first household visit and National ID check to clinical care, nutrition bags, hospital coordination and family stability, every department plays a connected part.',
        body:'At LOMAMO Foundation Kenya, preventing children from becoming orphans begins long before a crisis.\n\nSupporting caregivers, clinical officers, hospital focal persons, nutrition procurement, finance and leadership work from one shared care plan with formal 30-day PDCA reviews until each household stands healthy and self-sustaining.',
        versions:[{at:ago(6), by:uMed, action:'published'}], demo:true }
    );
  }
  /* Ensure International Data accounts exist in both seedDemo and seedOfficial */
  if(Array.isArray(db.users) && !db.users.some(u=>u.username==='intl.data')){
    const salt = 'lom6-intl.data';
    db.users.push({
      id:'u-intl-data', name:'Clara Wanjiku Mwangi', username:'intl.data', roleId:'intldata',
      countyId:'kisumu', areaIds:[], departmentId:'intldata', jobTitle:'International Data & Global Verification Lead',
      reportsTo:'u-chief', status:'active', active:true, mustChange:false, provisioned:true, demo:true,
      salt, hash:strongHash('LOMAMO2026', salt), /* The address uses the .example TLD reserved by RFC 2606: it cannot be a
         real mailbox, so a seeded seat never points mail at a person. */
      email:'intl.data@lomamo.example', phone:'0700000010',
      createdBy:'u-chief', created:ago(180), lastLogin:ago(1)
    });
  }

  /* Ensure reconciled hospital requests carry realistic post-visit caregiver follow-ups (MOPC/GOPC/SOPC/Physio/Referral) */
  const fupClinics = [
    ['MOPC', 'MOPC - Medical Outpatient Clinic Review', 'JOOTRH Medical Outpatient Clinic (MOPC)', 'Specialist medical review completed; ART & hypertension regimen adjusted, 4-week MOPC review booked.'],
    ['GOPC', 'GOPC - Gynaecology Outpatient Clinic Review', 'JOOTRH Gynaecology & Cervical Screening Clinic (GOPC)', 'Screening results collected with caregiver escort; follow-up colposcopy review scheduled at GOPC.'],
    ['SOPC', 'SOPC - Surgical Outpatient Clinic Review', 'Kisumu County Referral Surgical Outpatient Clinic (SOPC)', 'Surgical wound dressing & review completed; weekly sterile dressing plan handed over to LOMAMO nurse.'],
    ['Physiotherapy', 'Physiotherapy & Rehabilitation Clinic', 'JOOTRH Physiotherapy & Neuro-Rehabilitation Unit', 'Post-CVA gait and upper-limb physiotherapy session completed; twice-weekly rehab schedule set.'],
    ['POPC', 'POPC - Paediatric Outpatient Clinic Review', 'Homa Bay County Hospital Paediatric Outpatient Clinic (POPC)', 'Paediatric growth, haemoglobin and nutrition check completed; enriched food bag continues.'],
    ['Facility_Referral', 'Inter-Facility Referral to Another Hospital', 'JOOTRH Regional Oncology & Diagnostic Centre', 'Referred onward from county outpatient clinic to regional oncology unit with full lab folder.']
  ];
  (db.requests || []).forEach((r, idx)=>{
    if(!r.code) r.code = r.no || ('HR-2026-' + String(1000 + idx));
    if(!r.no) r.no = r.code;
    if(!r.createdAt) r.createdAt = r.submittedAt || ago(10);
    if(!r.submittedAt) r.submittedAt = r.createdAt;
    if(r.estimatedCost == null) r.estimatedCost = (r.transport && r.transport.fare ? r.transport.fare + 1850 : 2400);
    if(['reconciled','completed','closed'].includes(r.status) && !r.postFollowUp){
      const pickF = fupClinics[idx % fupClinics.length];
      /* Leave ~35% of reconciled requests awaiting caregiver follow-up so caregivers ALSO see live due items, and ~65% populated (half pending Hospital Desk ack, half acknowledged) */
      if(idx % 3 !== 2){
        const entry = {
          id: 'hfup-seed-' + idx,
          clinic: pickF[0],
          clinicLabel: pickF[1],
          targetFacility: pickF[2],
          reviewDate: ahead(7 + (idx % 21)).slice(0, 10),
          recoveryStatus: idx % 2 === 0 ? 'Improving steadily at home' : 'Stable - awaiting specialist review',
          feedbackToHospital: pickF[3],
          homeCheckDate: ahead(3).slice(0, 10),
          submittedBy: r.caregiverId || r.requestedBy || uCg,
          submittedByName: 'Caregiver Field Follow-Up',
          submittedRole: 'Supporting Caregiver',
          submittedAt: ago(2),
          hospitalAck: idx % 2 === 1,
          ackBy: idx % 2 === 1 ? uLia : null,
          ackByName: idx % 2 === 1 ? 'Hospital Focal Person' : null,
          ackAt: idx % 2 === 1 ? ago(1) : null
        };
        r.followUps = [entry];
        r.postFollowUp = entry;
      }
    }
  });

  /* Ensure discharged & discharge-recommended patients carry structured referral + intake-to-discharge summaries */
  (db.patients || []).forEach((p, idx)=>{
    if((p.status === 'discharged' || p.status === 'discharge_recommended') && !p.dischargeReferral){
      const hasRef = (idx % 4 !== 3);
      p.dischargeReferral = hasRef ? {
        pathway: ['graduated','referred_facility','referred_partner','community_chu'][idx % 4],
        required: true,
        destType: ['County / National Referral Hospital','Specialist Outpatient / Physiotherapy Unit','Faith / Partner NGO Health Programme','Community Health Unit (CHU)'][idx % 4],
        clinic: ['MOPC (Medical Outpatient Clinic)','GOPC (Gynaecology Outpatient Clinic)','Physiotherapy & Rehabilitation','CCC / Specialist Review'][idx % 4],
        facility: p.countyId === 'homabay'
          ? 'Homa Bay County Teaching & Referral Hospital'
          : ['Jaramogi Oginga Odinga Teaching & Referral Hospital (JOOTRH)','Kisumu County Referral Hospital (KCRH)','JOOTRH Physiotherapy & Rehab Unit','Nyalenda Community Health Unit (CHU)'][idx % 4],
        appointmentDate: ahead(14 + (idx % 14)).slice(0, 10),
        receivingContact: 'Outpatient Continuity & Liaison Desk',
        instructions: 'Graduated from intensive LOMAMO household programme in stable health; bring printed Programme Discharge Summary to scheduled clinic review.',
        recommendedBy: p.caregiverId || uCg,
        recommendedAt: p.dischargedAt || p.discharge || ago(5)
      } : {
        pathway: 'graduated',
        required: false,
        destType: 'Household Self-Reliance (No Facility Referral Needed)',
        clinic: 'Community Wellness Follow-Up Only',
        facility: '',
        appointmentDate: '',
        receivingContact: '',
        instructions: 'Full household and clinical stabilisation achieved; no onward hospital referral required.',
        recommendedBy: p.caregiverId || uCg,
        recommendedAt: p.dischargedAt || p.discharge || ago(5)
      };
    }
    if(p.status === 'discharged' && !p.dischargeSummary && typeof PAT_DISCHARGE !== 'undefined'){
      PAT_DISCHARGE.stampOnDischarge(p, { id:uMcm, name:'Medical Case Management' }, db);
    }
  });

  /* County-routed Sign-In Account Requests & Urgent Password Recovery Requests for Kisumu & Homa Bay County Office Admins */
  if(!Array.isArray(db.accountRequests) || db.accountRequests.length < 2){
    db.accountRequests = [
      { id:'acr-seed-1', at:ago(1), name:'Beatrice Akinyi Ochieng', roleId:'caregiver', countyId:'kisumu', assignedCountyId:'kisumu',
        assignedAdminUsername:'kisumu.admin', urgent:true, contact:'0700201104', email:'beatrice.akinyi@lomamo.example',
        reason:'Newly assigned Nyalenda Cluster B field caregiver — requires mobile tablet sign-in before Monday area briefing.', status:'open', demo:true },
      { id:'acr-seed-2', at:ago(2), name:'Samuel Odhiambo Otieno', roleId:'assistant', countyId:'homabay', assignedCountyId:'homabay',
        assignedAdminUsername:'homabay.admin', urgent:true, contact:'0700201198', email:'samuel.otieno@lomamo.example',
        reason:'Homa Bay County Office hard-copy intake filing desk support — requires verified County Office account.', status:'open', demo:true }
    ];
  }
  if(!Array.isArray(db.recoveryRequests) || db.recoveryRequests.length < 2){
    db.recoveryRequests = [
      { id:'rec-seed-1', at:ago(0.4), identifier:'caregiver.manyatta', username:'caregiver.manyatta', countyId:'kisumu', assignedCountyId:'kisumu',
        assignedAdminUsername:'kisumu.admin', urgent:true, contact:'0700304411',
        reason:'Field tablet replaced after rain screen damage; urgent temporary password reset needed before household visits.', status:'open', demo:true },
      { id:'rec-seed-2', at:ago(0.8), identifier:'caregiver.ndhiwa', username:'caregiver.ndhiwa', countyId:'homabay', assignedCountyId:'homabay',
        assignedAdminUsername:'homabay.admin', urgent:true, contact:'0700304482',
        reason:'Locked out after 5 offline PIN retries in Ndhiwa cluster; urgent County Office Admin reset requested.', status:'open', demo:true }
    ];
  }

  /* Populate Waiting List & Urgent Cases across Kisumu & Homa Bay if sparse */
  if(!Array.isArray(db.waitingList) || db.waitingList.length < 6){
    const wlAreas = ['nyalenda','manyatta','kondele','ahero','hb_town','ndhiwa','kendu','ombeyi'];
    db.waitingList = wlAreas.map((aid, wIdx)=>({
      id:'wl-seed-'+(wIdx+1), code:'WL-2026-'+String(101+wIdx),
      name:['Grace Atieno Ouma','Peter Omondi Owino','Millicent Akoth Onyango','Josephine Auma Okoth','Daniel Otieno Odongo','Eunice Adhiambo Oloo','Caleb Ochieng Juma','Rosemary Anyango Otieno'][wIdx],
      age:[34, 7, 42, 4, 51, 29, 9, 63][wIdx], sex:wIdx%2===0?'F':'M',
      countyId:['hb_town','ndhiwa','kendu'].includes(aid)?'homabay':'kisumu', areaId:aid,
      priority:wIdx%3===0?'high':(wIdx%3===1?'medium':'standard'),
      reason:wIdx%2===0?'Post-discharge oncology/HIV household vulnerability & 3 school-age children':'Paediatric malnutrition follow-up & household food insecurity',
      referredBy:wIdx%2===0?'JOOTRH Social Work Desk':'Area Coordinator Screening',
      addedAt:ago(12 - wIdx).slice(0,10), status:wIdx<6?'waiting':'scheduled_assessment', demo:true
    }));
  }
  if(!Array.isArray(db.urgentCases) || db.urgentCases.length < 6){
    const activePts = (db.patients||[]).filter(p=>p.status==='active');
    if(activePts.length >= 6){
      db.urgentCases = activePts.slice(0, 8).map((pt, uIdx)=>({
        id:'urg-seed-'+(uIdx+1), code:'URGCAS-'+String(201+uIdx),
        patientId:pt.id, patientName:pt.name, countyId:pt.countyId, areaId:pt.areaId,
        severity:uIdx<3?'critical':'high',
        category:['Emergency Hospital Transfer','Severe Paediatric MUAC Alert','Acute Medication Stockout Risk','Post-Operative Wound Review'][uIdx%4],
        summary:`Urgent clinical & household escalation for ${pt.name} (${pt.clinical?.diagnosis||'Active Care'}) — coordinated between Caregiver, MCM and Hospital Focal Desk.`,
        raisedBy:pt.caregiverId || uCg, raisedAt:ago(5 - Math.min(4, uIdx)),
        owner:pt.countyId==='homabay' ? 'u-mcm-homabay' : uMcm,
        status:uIdx<5?'open':'stabilised', demo:true
      }));
    }
  }

  /* Seed Global Broadcast + Departmental + Ministry Area Coordination Chat channels (readBy includes recipients so unread starts at 0) */
  if(!Array.isArray(db.messages) || !db.messages.some(m=>m.kind==='global' || m.kind==='area')){
    db.messages = db.messages || [];
    const activeIds = (db.users||[]).filter(u=>u.status==='active' && !['gov.partner','ccc.partner'].includes(u.roleId)).map(u=>u.id);
    const seedMsg = (id, thread, kind, fromId, toIds, text, daysBack) => {
      if(db.messages.some(x=>x.id===id)) return;
      const recips = toIds.filter(x=>x && x!==fromId);
      db.messages.push({
        id, thread, kind, from:fromId, to:recips, text,
        at:ago(daysBack), readBy:[fromId, ...recips], flagged:false, flagReason:'', demo:true
      });
    };
    seedMsg('msg-glob-1','global:all','global','u-director', activeIds,
      'Global Coordination Notice: Monday cross-county reporting closes at 08:30 EAT. Please ensure all 30-day PDCA reviews, paediatric MUAC measurements and hospital receipts are verified in your workspace.', 2);
    seedMsg('msg-glob-2','global:kisumu','global','u-kisumu-admin', (db.users||[]).filter(u=>u.countyId==='kisumu').map(u=>u.id),
      'Kisumu County Office: Field vehicle dispatch for JOOTRH & KCRH specialist clinics departs at 07:45 EAT tomorrow. Confirm escort manifests with Transport Coordinator.', 1);
    seedMsg('msg-glob-3','global:homabay','global','u-homabay-admin', (db.users||[]).filter(u=>u.countyId==='homabay').map(u=>u.id),
      'Homa Bay County Office: Weekly nutritional Bag 1, Bag 2 & Special Therapeutic Bag consignments verified at Homa Bay store ahead of Makongeni, Shauri Yako & Sofia home visits.', 1);
    /* Internal Ministry Area Coordination Channels across all 10 Ministry Areas */
    const areaNotes = {
      nyalenda:'Nyalenda Area Team: Tuesday household route confirmed; prioritise 3-visit anthropometry & child MUAC follow-ups near Ring Road corridor.',
      nairobird:'Nairobi Road Corridor Team: Coordinate Wednesday home visits with Nyamasaria CHW focal point before midday rain window.',
      manyatta:'Manyatta Area Team: Kondele & Manyatta B nutrition foodbag distribution ready for morning collection from Kisumu store.',
      nyahera:'Nyahera Area Team: Chulaimbo outpatient referral reviews scheduled for Thursday morning; transport escort confirmed.',
      chiga:'Chiga Area Team: Household WASH & LLIN mosquito net verification scheduled across Kolwa East cluster.',
      ombeyi:'Ombeyi Area Team: Fortnightly adherence check and Bag 1 household delivery aligned with Ombeyi Health Centre clinic day.',
      ahero:'Ahero Area Team: Nyando corridor home visits and Ahero County Hospital outpatient follow-ups coordinated for Wednesday.',
      makongeni:'Makongeni Area Team: Homa Bay East caregiver & coordinator morning briefing at 08:00 EAT prior to household rounds.',
      shauriyako:'Shauri Yako Area Team: Outpatient clinic escort handover with Homa Bay Teaching & Referral Hospital Focal Person complete.',
      sofia:'Sofia Area Team: Paediatric growth & maternal recovery visits scheduled across Homa Bay West households.'
    };
    Object.entries(areaNotes).forEach(([aid, txt], idx)=>{
      const aUsers = (db.users||[]).filter(u=>u.status==='active' && ((u.areaIds||[]).includes(aid) || ['countyadmin','assistant','mcm','coordinator'].includes(u.roleId))).map(u=>u.id);
      const sender = (db.users||[]).find(u=>(u.areaIds||[]).includes(aid))?.id || 'u-kisumu-admin';
      seedMsg('msg-area-'+aid, 'area:'+aid, 'area', sender, aUsers, txt, (idx % 4) + 1);
    });
    /* Internal Departmental Coordination Channels */
    [
      ['ministry','u-coord-kisumu','Ministry & Field Care Coordination: Ensure all hard-copy initial assessment scans are handed to County Admin Assistants by 16:30 EAT.'],
      ['medical','u-mcm-kisumu','Medical Case Management: 120+ day PDCA clinical extension dossiers reviewed ahead of International Medical Team concurrence.'],
      ['hospital','u-focal-kisumu','Hospital Continuum Desk: All JOOTRH & Homa Bay outpatient discharge summaries and SHA claim receipts uploaded for reconciliation.'],
      ['finance','u-finance-kisumu','Finance & Accounts: Operational Expenses and statutory deductions prepared ahead of the 9th-of-month compliance deadline.'],
      ['procure','u-procure-kisumu','Procurement & Stores: Supplier batch inspection for Bag 1, Bag 2 and Special Therapeutic Food Bags completed with zero variance.'],
      ['hr','u-hr-lead','Human Resources & Welfare: Verify signed leave handover & role acceptance reports before approving upcoming off-days.'],
      ['media','u-media-head','Media & Governance: Written informed storytelling consents verified on all scheduled impact features; quarterly 122-item asset check complete.']
    ].forEach(([did, fromU, txt], idx)=>{
      const dUsers = (db.users||[]).filter(u=>u.status==='active' && (u.departmentId===did || ['chief','director','program.admin'].includes(u.roleId))).map(u=>u.id);
      seedMsg('msg-dept-'+did, 'dept:'+did, 'dept', fromU, dUsers, txt, (idx % 3) + 1);
    });
  }

  /* Seed Universal Workspace Drafts across accounts (Draft Messages, Draft Home Visits, Draft Requests, Draft Reports) */
  if(!Array.isArray(db.workspaceDrafts) || !db.workspaceDrafts.length){
    const p0 = (db.patients||[])[0] || { id:'p00001', code:'LOM-NYA-10001', name:'Beneficiary', countyId:'kisumu', areaId:'nyalenda' };
    const p1 = (db.patients||[])[12] || p0;
    db.workspaceDrafts = [
      { id:'wdr-1', kind:'visit', title:`Draft Home Visit — ${p0.code} (${p0.village||'Nyalenda'})`, ownerId:'u-caregiver-nyalenda', countyId:'kisumu', dept:'ministry',
        targetView:'patient', targetParams:{id:p0.id, tab:'visits'}, patientId:p0.id,
        summary:`Weight ${p0.clinical?.weightKg||54} kg, MUAC ${p0.clinical?.muacCm||23.5} cm, Bag 1 delivered; awaiting final caregiver review before syncing to central register.`,
        payload:{ patientId:p0.id, weight:p0.clinical?.weightKg||54, muacCm:p0.clinical?.muacCm||23.5, notes:'Household visit completed; medication adherence good; awaiting supervisor note before final sync.' },
        updatedAt:ago(1), status:'draft' },
      { id:'wdr-2', kind:'message', title:'Draft Area Coordination Note — Thursday JOOTRH Escort', ownerId:'u-caregiver-nyalenda', countyId:'kisumu', dept:'ministry',
        targetView:'messages', targetParams:{thread:'area:nyalenda', mode:'internal'},
        summary:'Confirming two ambulatory outpatient escorts for Thursday 08:00 EAT departure from Nyalenda stage (zero patient PII in chat).',
        payload:{ thread:'area:nyalenda', text:'Team: confirming two outpatient escorts ready for Thursday 08:00 EAT pickup at Nyalenda stage.' },
        updatedAt:ago(1), status:'draft' },
      { id:'wdr-3', kind:'request', title:`Draft Hospital Specialist Referral — ${p1.code}`, ownerId:'u-mcm-kisumu', countyId:'kisumu', dept:'medical',
        targetView:'requests', targetParams:{}, patientId:p1.id,
        summary:'Outpatient nutritional & clinical review referral to JOOTRH; awaiting latest lab slip attachment before submission.',
        payload:{ patientId:p1.id, facility:'JOOTRH Outpatient Specialist Clinic', priority:'urgent', reason:'30-day clinical & nutritional review' },
        updatedAt:ago(2), status:'draft' },
      { id:'wdr-4', kind:'report', title:'Draft Monthly Operational Expenses & Budget Variance Narrative', ownerId:'u-finance-kisumu', countyId:'kisumu', dept:'finance',
        targetView:'finance', targetParams:{},
        summary:'Kisumu & Homa Bay monthly expenditure-against-budget commentary prepared for Country Director & Chief Program Administrator review.',
        payload:{ period:'2026-10', notes:'All statutory NSSF, SHA & Housing Levy lines within approved ceiling; hospital referral receipts 98% reconciled.' },
        updatedAt:ago(2), status:'draft' },
      { id:'wdr-5', kind:'report', title:'Draft Executive Sitting Briefing — Q4 Child Nutrition & Orphan Prevention', ownerId:'u-chief-admin', countyId:'kisumu', dept:'admin',
        targetView:'execconsole', targetParams:{},
        summary:'Cross-county executive briefing covering 3,333 longitudinal patient files, paediatric MUAC recovery curves and county urgent desk SLA.',
        payload:{ period:'2026-Q4', notes:'Prepared for Executive Sitting agenda item #2.' },
        updatedAt:ago(1), status:'draft' },
      { id:'wdr-6', kind:'message', title:'Draft Homa Bay Team Notice — Friday Home Visit Schedule', ownerId:'u-homabay-admin', countyId:'homabay', dept:'admin',
        targetView:'messages', targetParams:{thread:'global:homabay', mode:'global'},
        summary:'Reminder to Makongeni, Shauri Yako & Sofia caregivers to sync offline tablet drafts by 16:00 EAT Friday.',
        payload:{ thread:'global:homabay', text:'Homa Bay Team: kindly review and sync all draft home visits and field forms before 16:00 EAT on Friday.' },
        updatedAt:ago(1), status:'draft' }
    ];
  }

  /* Reset seed coWork state cleanly so DUALCHECK.ensureStore() populates canonical dual-verification batches */
  delete db.coWorkState;
  delete db.coWorkBatches;

  return db;
}

function seedOfficial(db, now, opts={}){
  /* Anchored to midnight, not to 09:00. Days in programme are counted from the
     intake timestamp to now; with a 09:00 anchor a run before nine in the
     morning made every patient one day shorter than the seed intended, which
     moved the 45-240 / 241-330 distribution off its stated profile. */
  const T = new Date(now); T.setHours(0,0,0,0);
  const DAY = 86400000;
  const rnd = rng6(20261022);
  const pick = a => a[Math.floor(rnd()*a.length)];
  const int = (a,b) => a + Math.floor(rnd()*(b-a+1));
  const iso = d => new Date(d).toISOString();
  const count = opts.patients !== undefined ? Math.max(0, Math.min(20000, opts.patients)) : 3333;
  const mustChangeFlag = Boolean(opts.mustChange);

  /* First seed baseline departmental structures from seedDemo so finance budgets,
     HR staff/leave/welfare, fleet vehicles/trips, care centre beds/residents,
     pharmacy stock/prescriptions, 6 paper forms & Omaha care plans are 100% present. */
  const demoBase = (typeof seedDemo === 'function') ? seedDemo(db, T) : null;
  if(demoBase){
    ['budgets','targets','employees','leaveRequests','welfareActs','contributions',
     'vehicles','trips','kbDocs','referralEntities','careBeds','careResidents','careLogs',
     'careIncidents','delegations','workPlans','publications','formRecords',
     'stockLots','stockMoves','clinicalRx','omahaPlans'].forEach(k=>{
      if(Array.isArray(demoBase[k])) db[k] = demoBase[k];
    });
  }

  /* Update referral entities to authentic Western Kenya facilities */
  db.referralEntities = [
    { id:'rf1', name:'Jaramogi Oginga Odinga Teaching & Referral Hospital (JOOTRH)', type:'Referral Hospital', county:'Kisumu', location:'Kisumu Central', status:'verified', active:true, added:'2026-01-10', notes:'Primary tertiary surgical, oncology and specialist referral hospital.' },
    { id:'rf2', name:'Kisumu County Referral Hospital (KCRH)', type:'County Hospital', county:'Kisumu', location:'Kisumu Central', status:'verified', active:true, added:'2026-01-12', notes:'Outpatient, laboratory, imaging and CCC review partner.' },
    { id:'rf3', name:'Nyalenda Health Centre CCC', type:'Health Centre / CCC', county:'Kisumu', location:'Nyalenda', status:'verified', active:true, added:'2026-01-18' },
    { id:'rf4', name:'Homa Bay County Teaching & Referral Hospital', type:'Referral Hospital', county:'Homa Bay', location:'Homa Bay Town', status:'verified', active:true, added:'2026-01-20' },
    { id:'rf5', name:'Ahero Sub-County Hospital', type:'Sub-County Hospital', county:'Kisumu', location:'Ahero', status:'verified', active:true, added:'2026-02-04' },
    { id:'rf6', name:'Chulaimbo County Hospital', type:'Sub-County Hospital', county:'Kisumu', location:'Kisumu West / Nyahera', status:'pending', active:true, added:'2026-09-02', notes:'Pending annual MOU verification by Medical Case Manager.' }
  ];

  const areas = COUNTIES.flatMap(c=>c.areas.map(a=>({...a, countyId:c.id})));
  const caregiverFor = {
    nyalenda:'u-caregiver-nyalenda',
    nairobird:'u-caregiver-nairobird',
    manyatta:'u-caregiver-manyatta',
    nyahera:'u-caregiver-nyahera',
    chiga:'u-caregiver-chiga',
    ombeyi:'u-caregiver-ombeyi',
    ahero:'u-caregiver-ahero',
    makongeni:'u-caregiver-makongeni',
    shauriyako:'u-caregiver-shauriyako',
    sofia:'u-caregiver-sofia'
  };

  db.meta = db.meta || {};
  db.meta.label = 'LOMAMO Full Programme & Departmental Dataset (3,333 Patients)';
  db.meta.seeded = 'official';
  db.meta.seedProfile = PROGRAM_DAYS_PROFILE;
  db.settings = db.settings || {};
  db.settings.onboarding = { complete:true, step:9 };
  db.settings.programme = Object.assign({}, db.settings.programme,
    { defaultDays:75, maxDays:180, maxPlanDays:360, reviewCadence:30, maxReviews:12, durations:PROGRAM_DURATIONS,
      defaultDurations:PROGRAM_DURATION_DEFAULT });

  /* --- Complete staff accounts across ALL leadership, departments & 10 ministry areas --- */
  const users = OFFICIAL_ROSTER.map((r,i)=>{
    const salt = 'lom6-' + r.username;
    return {
      id: r.username==='chief.admin' ? 'u-chief-admin' : ('u-' + r.username.replace(/[.]/g,'-')),
      name:r.name, username:r.username, roleId:r.roleId, countyId:r.countyId, areaIds:r.areas||[],
      departmentId:r.dept, jobTitle:r.job,
      reportsTo:r.roleId==='president'||r.username==='chief.admin'?null:'u-chief-admin',
      status:'active', active:true, mustChange:mustChangeFlag, provisioned:true, demo:true,
      salt, hash:strongHash('LOMAMO2026', salt),
      email:r.username+'@lomamo.example', phone:'0700' + String(300000 + (i*13799) % 99999).padStart(6,'0'),
      createdBy:'u-chief-admin', created:iso(new Date(T.getTime()-420*DAY)), lastLogin:iso(new Date(T.getTime()-(i%7)*DAY)),
      execTeam:EXEC_DEFAULT.includes(r.username),
      /* Administration's own scheduling data, carried on the account so the
         ministry console, the visit planner and leave coverage all read one
         source. `unconfirmed` marks a seat Administration has not yet named. */
      unconfirmed:!!r.unconfirmed, surnamePending:!!r.surnamePending,
      seatNote:r.note||'', visitDays:r.visitDays||[], visitDaysNote:r.visitDaysNote||'',
      canLeaveMonday:!!r.canLeaveMonday,
      permOverrides:r.permOverrides||undefined
    };
  });
  db.users = users;

  /* --- Re-link the HR / leave roster onto the official accounts -------------
     The roster is seeded from the demonstration set, whose user ids differ from
     the official ones. Without this, leave coverage and the visit planner could
     not find the person behind an account. Links are made by USERNAME, and the
     roster record then takes the official name, department, county and post so
     there is one staff list, not two. */
  const demoUsers = (demoBase && Array.isArray(demoBase.users)) ? demoBase.users : [];
  const demoIdToUsername = new Map(demoUsers.map(u=>[u.id, u.username]));
  const byUsername = new Map(users.map(u=>[u.username, u]));
  (db.employees||[]).forEach(e=>{
    if(!e.username && e.userId) e.username = demoIdToUsername.get(e.userId) || null;
    const u = e.username ? byUsername.get(e.username) : null;
    if(!u) return;
    e.userId = u.id;
    if(!e.placeholder){ e.name = u.name; e.dept = u.departmentId || e.dept; e.county = u.countyId || e.county; }
    if(u.jobTitle) e.role = u.jobTitle;
    if(u.visitDays && u.visitDays.length){ e.visitDays = u.visitDays; e.visitDaysNote = u.visitDaysNote||''; }
    if(u.canLeaveMonday) e.canLeaveMonday = true;
    if(u.unconfirmed) e.unconfirmed = true;
  });
  /* Every official account that is not already on the roster gets a roster line,
     so leave, off-days and the Monday management-meeting rule apply to all staff. */
  const onRoster = new Set((db.employees||[]).map(e=>e.userId).filter(Boolean));
  users.forEach((u,i)=>{
    if(onRoster.has(u.id)) return;
    const office = ['chief','director','president','program.admin','program.assistant','countyadmin','assistant',
      'finance','procurement','me','intldata','auditor','hr','welfare','it','mediahead','pr','depthead',
      'mcm','nurse','liaison','homestay','vehicle'].includes(u.roleId);
    db.employees.push({
      id:'emp-of-'+u.username.replace(/[^a-z0-9]/gi,'-'), userId:u.id, username:u.username, name:u.name,
      dept:u.departmentId||'admin', county:u.countyId||'kisumu', role:u.jobTitle||'',
      contract:'permanent', start:'2024-0'+((i%9)+1)+'-01',
      annualEntitlement:u.roleId==='chief'?15:15, casualEntitlement:3, leaveTaken:0, status:'active',
      staffType:'permanent', staffGroup:office?'Office staff':'Field staff', leaveGroup:office?'office':'field',
      canLeaveMonday:!!u.canLeaveMonday, visitDays:u.visitDays||[], visitDaysNote:u.visitDaysNote||'',
      unconfirmed:!!u.unconfirmed, demo:true
    });
  });

  /* --- Patients, Visits, PDCAs, JOOTRH Requests, Concerns, Encounters & Finance --- */
  const patients = [], visits = [], pdcas = [], requests = [], transactions = [],
        concerns = [], encounters = [], documents = [], supportIssues = [], patientConditions = [];
  const diagnoses = ['HIV - on ART','HIV and TB co-infection','TB - treatment','Cervical cancer screening',
    'Kaposi sarcoma','Breast cancer','Chronic wound','Cryptococcal meningitis','Acute diarrhoea',
    'Severe malaria','Pneumonia','Malnutrition (child)','Post-CVA care','Hypertension','Diabetes'];
  const pipelineStatuses = ['assessment_initiated','physical_completed','digital_entered','awaiting_verification','returned','approved_enrolment'];
  const coreCutoff = Math.ceil(count * 0.95);

  const villagesByArea = {
    nyalenda:['Nyalenda A','Nyalenda B','Kilo','Western'],
    nairobird:['Migosi','Lolwe','Nairobi Road','Kondele'],
    manyatta:['Manyatta A','Manyatta B','Kosawo','Gonda'],
    nyahera:['Nyahera Market','Bar Korwa','Dago','Mamboleo'],
    chiga:['Chiga Centre','Kibigori','Buoye','Mayenya'],
    ombeyi:['Ombeyi Market','Kore','Ramula','Obumba'],
    ahero:['Ahero Town','Kakola','Oren','Kochogo'],
    makongeni:['Makongeni East','Makongeni West','Kanyabala'],
    shauriyako:['Shauri Yako A','Shauri Yako B','Posta'],
    sofia:['Sofia Estate','Asego','Salama']
  };
  const careObjectives = [
    ['ART adherence >=95% & viral suppression','Monthly nutrition basket & +3 kg weight recovery','All household children retained in school'],
    ['Complete specialist hospital review & diagnostics','Stabilise blood pressure / blood glucose within target','Strengthen guardian household income resilience'],
    ['Complete full TB / infection treatment course','Clean wound healing & pain-free mobility','30-day PDCA household hygiene & safe water check'],
    ['Prevent maternal/guardian hospital readmission','Immunisation & MUAC growth catch-up for under-5s','Prepare household graduation & CHU continuity link']
  ];
  const visitSummaries = [
    'Home visit completed with guardian; ART & medication adherence >=95%, monthly nutrition basket verified, children attending school regularly.',
    'Vitals and weight checked at household; steady clinical improvement noted, safe water & hygiene counselling reinforced.',
    '30-day PDCA household assessment conducted; caregiver reviewed clinic appointment card, nutrition progress and child welfare.',
    'Follow-up after hospital clinic review; prescriptions taken as directed, appetite and functional mobility improving well.'
  ];

  for(let i=1;i<=count;i++){
    const area = areas[(i - 1) % areas.length];
    const caregiver = caregiverFor[area.id] || 'u-caregiver-nyalenda';
    /* Strict duration distribution: >=95% in 45-240 days, remainder in 241-330 days (zero <45 or >330) */
    const tail = i > coreCutoff;
    const days = tail ? int(241, 330) : int(45, 240);
    const sex = rnd() > 0.46 ? 'F' : 'M';
    let given = sex==='F' ? pick(KENYAN_GIVEN_F) : pick(KENYAN_GIVEN_M);
    let surname = pick(KENYAN_SURNAMES);
    /* A synthetic patient must never wear the name of a real member of staff.
       The reference register is generated, the roster is not. */
    let guard = 0;
    while(guard++ < 12 && STAFF_NAMES.has((given+' '+surname).toLowerCase())){
      given = sex==='F' ? pick(KENYAN_GIVEN_F) : pick(KENYAN_GIVEN_M);
      surname = pick(KENYAN_SURNAMES);
    }
    const age = (i % 4 === 0) ? (1 + (i % 17)) : int(18, 84);
    const ageMonths = age < 5 ? (age * 12 + (i % 11)) : (age * 12);
    const dobDate = new Date(T.getTime() - (age*365 + int(10, 340))*DAY);
    const dob = iso(dobDate).slice(0, 10);
    const planned = tail ? 240 : pick(PROGRAM_DURATION_DEFAULT);
    const isPipeline = i <= 18 && !tail;
    const isDisRec = !isPipeline && (i >= 19 && i <= 34);
    const status = isPipeline
      ? pipelineStatuses[(i - 1) % pipelineStatuses.length]
      : (isDisRec ? 'discharge_recommended'
      : ((days >= planned && rnd() < 0.45) ? 'discharged' : (days > planned ? 'extension' : 'active')));
    const agoDays = status==='discharged' ? int(3, 45) : 0;
    const intake = new Date(T.getTime() - (days + agoDays)*DAY);
    const intakeIso = iso(intake);
    const intakeDate = intakeIso.slice(0, 10);
    const dischargeIso = status==='discharged' ? iso(new Date(T.getTime() - agoDays*DAY)) : null;
    const dischargeDate = dischargeIso ? dischargeIso.slice(0, 10) : null;
    const pid = 'p' + String(i).padStart(5,'0');
    /* Keep 2 PMI duplicate-ID candidates on i=5..6 for DQ6 blocking tests, while EVERY SINGLE ONE of the 3,333 patients has a complete National ID / Birth Cert and verified Kenyan telephone */
    const duplicateOf = (i === 5 || i === 6) ? 'p' + String(i - 4).padStart(5,'0') : null;
    const nationalId = duplicateOf
      ? (patients.find(p=>p.id===duplicateOf)||{}).nationalId || String(int(90000000,99999999))
      : (age < 18 ? 'BC-' + String(10000000 + i) : String(90000000 + (i*7919) % 9999999));
    const phone = '0700' + String(100000 + ((i * 7919) % 99999)).padStart(6,'0');
    const diag = age < 5
      ? ['Malnutrition (child)','Pneumonia','Severe malaria','Acute diarrhoea','HIV - on ART','TB - treatment'][(i - 1) % 6]
      : (age < 15
        ? ['Malnutrition (child)','HIV - on ART','TB - treatment','Severe malaria','Pneumonia','Chronic wound'][(i - 1) % 6]
        : diagnoses[(i - 1) % diagnoses.length]);
    const condCat = /HIV|TB|Cryptococcal/i.test(diag) ? 'infectious'
      : (/cancer|Kaposi/i.test(diag) ? 'oncology'
      : (/Malnutrition/i.test(diag) ? 'nutrition' : 'chronic'));

    /* WHO / Kenya MoH age-calibrated height (cm), weight (kg), BMI-for-Age & MUAC (mm) */
    let baseHtCm, htCm, baseBmiTarget, gainBmi, baseMuacMm, currMuacMm;
    const nutProfile = i % 10; /* 0 = recovering SAM, 1..2 = recovering MAM, 3..8 = normal growth, 9 = higher BMI */
    if(age < 5){
      baseHtCm = Math.round(74 + (age - 1) * 8.5 + (i % 5));
      htCm = Math.round(baseHtCm + Math.min(3, Math.max(1, Math.round(days / 90))));
      baseBmiTarget = nutProfile === 0 ? 12.6 : (nutProfile <= 2 ? 13.6 : (nutProfile <= 8 ? (15.0 + (i % 3) * 0.5) : 17.4));
      gainBmi = nutProfile <= 2 ? 1.5 : 0.6;
      baseMuacMm = nutProfile === 0 ? (109 + (i % 5)) : (nutProfile <= 2 ? (116 + (i % 7)) : (128 + (i % 16)));
      currMuacMm = Math.min(162, baseMuacMm + (nutProfile <= 2 ? 12 : 6));
    } else if(age < 10){
      baseHtCm = Math.round(108 + (age - 5) * 5.8 + (i % 5));
      htCm = Math.round(baseHtCm + Math.min(2, Math.max(1, Math.round(days / 110))));
      baseBmiTarget = nutProfile === 0 ? 13.0 : (nutProfile <= 2 ? 14.0 : (nutProfile <= 8 ? (15.4 + (i % 4) * 0.45) : 18.6));
      gainBmi = nutProfile <= 2 ? 1.4 : 0.5;
      baseMuacMm = nutProfile === 0 ? (128 + (i % 5)) : (nutProfile <= 2 ? (136 + (i % 7)) : (149 + (i % 18)));
      currMuacMm = Math.min(190, baseMuacMm + (nutProfile <= 2 ? 11 : 5));
    } else if(age < 18){
      baseHtCm = Math.round(138 + (age - 10) * 4.1 + (i % 6));
      htCm = Math.round(baseHtCm + (days >= 120 ? 1 : 0));
      baseBmiTarget = nutProfile === 0 ? 14.8 : (nutProfile <= 2 ? 16.1 : (nutProfile <= 8 ? (18.2 + (i % 4) * 0.7) : 23.2));
      gainBmi = nutProfile <= 2 ? 1.5 : 0.6;
      baseMuacMm = nutProfile === 0 ? (152 + (i % 6)) : (nutProfile <= 2 ? (164 + (i % 12)) : (188 + (i % 24)));
      currMuacMm = Math.min(248, baseMuacMm + (nutProfile <= 2 ? 13 : 6));
    } else {
      baseHtCm = 154 + (i % 26);
      htCm = baseHtCm;
      baseBmiTarget = nutProfile === 0 ? 15.2 : (nutProfile <= 2 ? 17.1 : (nutProfile <= 7 ? (20.4 + (i % 4) * 0.9) : (nutProfile === 8 ? 26.8 : 30.8)));
      gainBmi = nutProfile <= 2 ? 1.6 : (nutProfile >= 8 ? -0.4 : 0.6);
      baseMuacMm = nutProfile === 0 ? (181 + (i % 7)) : (nutProfile <= 2 ? (196 + (i % 18)) : (236 + (i % 38)));
      currMuacMm = Math.min(315, baseMuacMm + (nutProfile <= 2 ? 14 : 5));
    }
    const baseWt = Math.round(baseBmiTarget * Math.pow(baseHtCm / 100, 2) * 10) / 10;
    const currWt = Math.round((baseBmiTarget + gainBmi) * Math.pow(htCm / 100, 2) * 10) / 10;
    const bmi = Math.round((currWt / Math.pow(htCm/100, 2)) * 10) / 10;
    const bpStr = age < 8 ? '96/60' : ((108 + (i % 28)) + '/' + (68 + (i % 18)));
    const guardianName = pick(KENYAN_GUARDIANS);
    const kids = age < 18 ? int(1, 4) : int(1, 5);
    const maleKids = Math.floor(kids / 2) + (i % 2);
    const femaleKids = Math.max(0, kids - maleKids);
    const village = pick(villagesByArea[area.id] || ['Central Sub-Location']);
    const areaGeo = {
      nyalenda:   { lat:-0.1142, lon:34.7695, sub:'Kisumu Central', ward:'Nyalenda A / B', landmark:'Near Nyalenda Health Centre & Ring Road Stage' },
      nairobird:  { lat:-0.1065, lon:34.7882, sub:'Kisumu Central', ward:'Migosi / Nyamasaria Corridor', landmark:'Off Nairobi Highway by Nyamasaria Footbridge' },
      manyatta:   { lat:-0.0948, lon:34.7798, sub:'Kisumu East',    ward:'Manyatta B / Kondele', landmark:'Near Manyatta Primary & Kondele Junction' },
      nyahera:    { lat:-0.0245, lon:34.7160, sub:'Kisumu West',    ward:'North West Kisumu', landmark:'Near Nyahera Sub-County Hospital Market' },
      chiga:      { lat:-0.1095, lon:34.8490, sub:'Kisumu East',    ward:'Kolwa East', landmark:'Near Chiga Market & Health Dispensary' },
      ombeyi:     { lat:-0.1290, lon:34.9720, sub:'Muhoroni / Miwani', ward:'Ombeyi', landmark:'Near Ombeyi Chief Camp & Health Centre' },
      ahero:      { lat:-0.1744, lon:34.9169, sub:'Nyando',         ward:'Ahero Town', landmark:'Near Ahero County Hospital & Kochogo Road' },
      makongeni:  { lat:-0.5318, lon:34.4628, sub:'Homa Bay Town',  ward:'Homa Bay East', landmark:'Near Makongeni Primary & Pier Corridor' },
      shauriyako: { lat:-0.5255, lon:34.4545, sub:'Homa Bay Town',  ward:'Homa Bay Central', landmark:'Near Homa Bay Teaching & Referral Hospital' },
      sofia:      { lat:-0.5382, lon:34.4589, sub:'Homa Bay Town',  ward:'Homa Bay West', landmark:'Near Sofia Market & St. Paul Junction' }
    }[area.id] || { lat:-0.1022, lon:34.7617, sub:'Kisumu Central', ward:'Central Ward', landmark:'Near Ministry Area Focal Point' };
    const ptLat = +(areaGeo.lat + (((i * 37) % 140) - 70) * 0.00012).toFixed(5);
    const ptLon = +(areaGeo.lon + (((i * 53) % 140) - 70) * 0.00012).toFixed(5);
    const gpsObj = { lat:ptLat, lon:ptLon, accuracyM: 6 + (i % 9) };
    const locationObj = {
      county: area.countyId==='homabay' ? 'Homa Bay' : 'Kisumu',
      subCounty: areaGeo.sub,
      ward: areaGeo.ward,
      village,
      landmark: areaGeo.landmark,
      gpsText: `${ptLat.toFixed(4)}, ${ptLon.toFixed(4)} (±${gpsObj.accuracyM}m)`
    };
    const objSet = careObjectives[i % careObjectives.length];
    /* Wise realistic setting proportions:
       - ~30.8% (i % 13 < 4) have Hospital Referral/Outpatient visits alongside Home Visits
       - Only ~7.1% (i % 14 === 3 = 238 of 3,333 patients) ever required Homestay / Care Centre admission/respite */
    const hasHospitalVisits = (i % 13 < 4) || (i % 10 === 1) || (i <= 30);
    const hadHomestay = (i % 14 === 3);

    const pObj = {
      id:pid, code:'LOM-'+area.id.slice(0,3).toUpperCase()+'-'+String(10000+i),
      name:given+' '+surname, sex, age, ageMonths, dob, nationalId,
      sha:'SHA-KE-' + String(100000 + i),
      phone,
      village,
      gps: gpsObj,
      location: locationObj,
      guardian:guardianName,
      childrenCount:kids,
      baselineWeightKg:baseWt,
      hadHomestay,
      countyId:area.countyId, areaId:area.id, caregiverId:caregiver,
      status,
      intake:intakeIso, enrolledAt:intakeDate,
      discharge:dischargeIso, dischargedAt:dischargeDate,
      programDays:days,
      plannedDays:planned,
      referralEntityId: area.countyId==='homabay' ? 'rf4' : (rnd()<0.55 ? 'rf1' : (rnd()<0.5?'rf2':'rf3')),
      ccc: /HIV/i.test(diag) ? 'CCC/9'+int(1000,9999) : '',   /* demo band - see data.js */
      clinical:{
        diagnosis: diag,
        conditionCategory: condCat,
        hivStatus: /HIV/i.test(diag) ? 'Positive - on ART' : 'Negative / counselled',
        tbScreen: /TB/i.test(diag) ? 'Confirmed - on anti-TB therapy' : 'Negative on symptom screen',
        art: /HIV/i.test(diag),
        baselineWeightKg: baseWt,
        weightKg: currWt,
        baselineHeightCm: baseHtCm,
        heightCm: htCm,
        bmi: bmi,
        baselineMuacMm: baseMuacMm,
        muacMm: currMuacMm,
        muacCm: +(currMuacMm / 10).toFixed(1),
        bp: bpStr,
        adherence: pick(['Good','Good','Good','Fair']),
        functionalStatus: pick(['Ambulatory','Ambulatory','Assisted mobility']),
        allergies: pick([[], [], ['Penicillin'], ['Sulfa'], ['NSAID']]),
        allergyClasses:[],
        notes: 'Enrolled under ' + area.name + ' cluster; 30-day PDCA clinical & household nutrition plan active.'
      },
      carePlan:{
        needs: diag + ' clinical stabilisation, household food security and child schooling continuity in ' + village,
        objectives: objSet,
        interventions: 'Bi-weekly caregiver home visits, monthly nutrition support, 30-day PDCA review and hospital clinic linkage.',
        responsible: caregiver,
        expectedDays: planned,
        reviewCadence: 30,
        updatedAt: intakeDate
      },
      household:{ children:kids, maleChildren:maleKids, femaleChildren:femaleKids, orphansSupported:int(0,2), guardian:guardianName, village },
      metadata:{
        householdSize: kids + (age < 18 ? 2 : 1) + (i % 2),
        dependentsUnder18: kids,
        housingType: ['Semi-permanent iron-sheet dwelling','Permanent masonry household','Rental single-room compound'][i % 3],
        waterSource: ['Piped municipal standpipe','Protected community borehole','Treated rainwater tank'][i % 3],
        nearestFacility: area.countyId==='homabay' ? 'Homa Bay County Teaching & Referral Hospital' : 'JOOTRH / Sub-County Hospital',
        primaryCaregiverRelation: age < 18 ? 'Parent / Maternal Guardian' : 'Spouse / Adult Household Kin',
        shaStatus: 'Active SHA Verified',
        enrolledBy: caregiver,
        lastVerifiedAt: intakeDate
      },
      master:{
        insurance: 'SHA + LOMAMO Medical Safety Net',
        spouseId: age >= 20 ? String(28000000 + ((i * 3571) % 8999999)) : '',
        newInMonth: days <= 30 ? 'Yes (Current Cycle)' : 'Continuing Cohort',
        repeatPatient: (i % 29 === 0),
        relocated: false,
        orphansPrevented: kids,
        becameOrphans: 0,
        minimalCareFlag: days > 183 ? 'x' : '',
        schedule: 'Bi-weekly Home Visit & 30-Day PDCA',
        bags: { BG1: nutProfile > 2 && kids < 4 ? 6 : 2, BG2: kids >= 4 ? 6 : 0, SPB: nutProfile <= 2 ? 5 : 0 },
        costs: { other: 14500 + (i % 9) * 1850, inpatient: hasHospitalVisits ? (12000 + (i % 5) * 4200) : 0, total: (14500 + (i % 9) * 1850) + (hasHospitalVisits ? (12000 + (i % 5) * 4200) : 0) },
        sourceWorkbook: 'CareLink Unified Longitudinal Registry v6.5',
        sourceSheet: area.name
      },
      consent:(()=>{
        const st = pick(['granted','granted','granted','pending','withdrawn']);
        const scope = pick(['internal','storytelling','donor_report']);
        return { status:st, scope, date:'2026-0'+int(1,9)+'-'+String(int(10,28)).padStart(2,'0'),
          purposes:{ care:true, internal:st==='granted', photography:scope!=='internal'&&st==='granted',
            storytelling:scope==='storytelling'&&st==='granted', donor:scope!=='internal'&&st==='granted', research:false } };
      })(),
      faithRecord: rnd()>0.45 ? 'reported' : 'not_recorded',
      docsVerified: i > 2,
      flags: isPipeline ? ['duplicate_check_pending'] : [],
      pdcaStage: ['Plan','Do','Check','Act'][i % 4],
      demo:true, source:'reference-register'
    };
    patients.push(pObj);

    /* 100% OF ALL 3,333 PATIENTS: 12 to 15 longitudinal Home + Hospital / Homestay visits
       with realistic progressive Weight (kg), Height (cm), BMI & MUAC (mm/cm) measurements */
    const visitCount = 12 + (i % 4); /* 12, 13, 14 or 15 visits for every single patient */
    const hospFacility = area.countyId==='homabay'
      ? 'Homa Bay County Teaching & Referral Hospital'
      : (i % 2 === 0 ? 'JOOTRH Outpatient Specialist Clinic' : 'Kisumu County Referral Hospital');
    for(let v=0; v<visitCount; v++){
      const frac = (v + 1) / visitCount;
      const offsetDays = Math.max(1, Math.min(days, Math.round(days * frac)));
      const vd = new Date(intake.getTime() + offsetDays * DAY);
      const vdIso = iso(vd);
      const vHt = Math.round((baseHtCm + (htCm - baseHtCm) * frac) * 10) / 10;
      const vWt = Math.round((baseWt + (currWt - baseWt) * frac) * 10) / 10;
      const vBmi = Math.round((vWt / Math.pow(vHt / 100, 2)) * 10) / 10;
      const vMuac = Math.round(baseMuacMm + (currMuacMm - baseMuacMm) * frac);
      let vType = 'home';
      let vActor = caregiver;
      let sumTxt = visitSummaries[(i + v) % visitSummaries.length];
      if(hadHomestay && (v === 2 || (v === 5 && i % 28 === 3))){
        vType = 'homestay';
        vActor = area.countyId==='homabay' ? 'u-homestay-homabay' : 'u-homestay-kisumu';
        sumTxt = age < 18
          ? `Short-term Care Centre / Homestay therapeutic nutrition & guardian respite review (MUAC ${(vMuac/10).toFixed(1)} cm, Wt ${vWt} kg).`
          : `Short-term Homestay post-discharge stabilization & supervised medication check completed (Wt ${vWt} kg, BP ${bpStr}).`;
      } else if(hasHospitalVisits && (v === 4 || (v === 9 && i % 6 === 0))){
        vType = 'hospital';
        vActor = area.countyId==='homabay' ? 'u-focal-homabay' : 'u-focal-kisumu';
        sumTxt = `Escorted outpatient clinical review at ${hospFacility}; labs, prescription refill & next review date verified.`;
      } else if(v === visitCount - 1 && i % 5 === 0){
        vType = 'clinical';
        vActor = area.countyId==='homabay' ? 'u-mcm-homabay' : 'u-mcm-kisumu';
      }
      const bagCode = (vType === 'home' && v % 2 === 0) ? (nutProfile <= 2 ? 'SPB' : (kids >= 4 ? 'BG2' : 'BG1')) : '';
      visits.push({
        id:'v'+pid+'-'+v, patientId:pid,
        by:vActor, caregiverId:caregiver,
        countyId:area.countyId, areaId:area.id,
        date:vdIso.slice(0,10), recordedAt:vdIso,
        type:vType,
        facility: vType==='hospital' ? hospFacility : (vType==='homestay' ? 'LOMAMO Homestay & Care Centre' : ''),
        weight:vWt, heightCm:vHt, bmi:vBmi, muacMm:vMuac, muacCm:+(vMuac/10).toFixed(1),
        foodBag:bagCode, bp:bpStr, adherence:pObj.clinical.adherence,
        gps: gpsObj, location: village + ' (' + locationObj.gpsText + ')',
        outcome:'seen',
        summary:sumTxt, notes:sumTxt,
        nextAction:'Scheduled 30-day PDCA & household check',
        nextDue:iso(new Date(vd.getTime()+14*DAY)).slice(0,10),
        demo:true
      });
    }

    /* 100% OF ALL 3,333 PATIENTS: Complete 30-day review milestones + active/closed PDCA quality cycle */
    const completedReviews = Math.min(11, Math.max(1, Math.floor(days / 30)));
    const revEntries = [];
    for(let rv=1; rv<=completedReviews; rv++){
      const dueD = rv * 30;
      const revDate = iso(new Date(intake.getTime() + dueD * DAY)).slice(0, 10);
      const revItem = {
        id:'pd-rev-'+pid+'-'+rv,
        patientId:pid,
        kind:'review',
        dueDay:dueD,
        stage:'Check',
        title:'Day-' + dueD + ' Formal 30-Day Care Plan Review',
        plan:'Review clinical stability (' + diag + '), weight recovery and child schooling at Day ' + dueD + '.',
        doNote:'Household visit and guardian review completed on schedule.',
        checkNote:'Weight ' + currWt + ' kg, adherence ' + pObj.clinical.adherence + '; all children in school.',
        actNote: dueD >= planned ? 'Prepare graduation readiness & continuity referral.' : 'Continue active care plan to next 30-day milestone.',
        due:revDate,
        completedAt:revDate,
        at:revDate,
        owner:caregiver,
        by:caregiver,
        status:'closed',
        demo:true
      };
      revEntries.push(revItem);
      pdcas.push(revItem);
    }
    const nextDueDay = (completedReviews + 1) * 30;
    pdcas.push({
      id:'pd'+pid,
      patientId:pid,
      kind: tail ? 'extension' : 'pdca',
      dueDay: nextDueDay,
      stage: pObj.pdcaStage,
      title: tail
        ? 'Extended Stay Justification & Specialist Continuity Cycle (' + days + 'd)'
        : 'Active PDCA Household & Clinical Cycle (' + pObj.pdcaStage + ')',
      plan: objSet[0] + '; ' + objSet[1],
      doNote:'Caregiver home follow-up, nutrition support and adherence check executed with guardian.',
      checkNote:'Baseline ' + baseWt + ' kg -> current ' + currWt + ' kg; BP ' + bpStr + '; adherence ' + pObj.clinical.adherence + '.',
      actNote: status==='discharged'
        ? 'Graduated with complete Programme Discharge Summary and continuity referral.'
        : 'Maintain scheduled 30-day review cycle and clinic linkage.',
      due: iso(new Date(T.getTime() + ((i % 26) - 4) * DAY)).slice(0, 10),
      reviews: revEntries,
      owner:caregiver,
      by:caregiver,
      status: status==='discharged' ? 'closed' : (i % 5 === 0 ? 'closed' : 'open'),
      demo:true
    });

    /* 100% OF ALL 3,333 PATIENTS: Confirmed Condition Register + Household Support + Verified Document */
    patientConditions.push({
      id:'cond-'+pid, patientId:pid, countyId:area.countyId, areaId:area.id,
      category:condCat, label:diag, sensitive:/HIV|TB/i.test(diag), status:'confirmed',
      recordedBy:area.countyId==='homabay'?'u-mcm-homabay':'u-mcm-kisumu', recordedAt:intakeIso,
      confirmedBy:area.countyId==='homabay'?'u-mcm-homabay':'u-mcm-kisumu', confirmedAt:intakeIso, demo:true
    });
    const supAmt = 1400 + (i % 6) * 450;
    const supItem = pick(['Enriched nutrition food bag','Normal household food bag','Hygiene & clean-water pack','Child school uniform & books','Emergency medical transport support']);
    const supDate = iso(new Date(intake.getTime() + 14 * DAY)).slice(0, 10);
    supportIssues.push({
      id:'sup-'+pid, patientId:pid, countyId:area.countyId, areaId:area.id,
      type:'Nutrition & Household Support', item:supItem, description:supItem,
      amount:supAmt, qty:1, date:supDate, by:caregiver, issuedBy:caregiver, demo:true
    });
    documents.push({
      id:'doc-'+pid, patientId:pid, kind:pick(['assessment_form','ccc_card','hospital_record','consent_form']),
      classification:pick(['clinical','identification','hospital']),
      uploadedBy:caregiver, uploadedAt:intakeIso,
      consent:pObj.consent.status, publication:pObj.consent.status==='granted'?'approved':'not_eligible',
      restricted:false, demo:true
    });

    /* Rich hospital requests (~340 across all 10 areas & both counties) + transactions */
    if(i % 10 === 1 || i <= 30){
      const st = ['submitted','approved','assigned','completed','reconciled','closed'][requests.length % 6];
      const rid = 'rq'+pid;
      const fac = area.countyId==='homabay' ? 'Homa Bay County Teaching & Referral Hospital' : pick(['JOOTRH','Kisumu County Referral Hospital']);
      const amt = int(850, 7800);
      const reqNo = 'HR-2026-'+String(1000+requests.length);
      const subIso = iso(new Date(T.getTime()-int(1,45)*DAY));
      requests.push({
        id:rid, no:reqNo, code:reqNo, patientId:pid,
        requestedBy:caregiver, caregiverId:caregiver, countyId:area.countyId, areaId:area.id,
        status:st, submittedAt:subIso, createdAt:subIso.slice(0,10),
        patientContact: pObj.phone || '0700000000',
        shaStatus: pick(['Active','Active','Pending registration']),
        chiefComplaints: pick(['Cervical screening & GOPC review','Persistent cough & MOPC chest review','Chronic wound SOPC review','Physiotherapy neuro-rehab session','Paediatric POPC growth review']),
        reason: pick(['Specialist MOPC clinical review & lab panel at '+fac,'GOPC screening results & treatment plan at '+fac,'SOPC surgical wound review at '+fac,'Physiotherapy rehabilitation session at '+fac,'Onward specialist clinic review at '+fac]),
        priority: pick(['routine','routine','urgent','critical']),
        facility: fac, hospital: fac,
        estimatedCost: amt,
        finalCost: ['reconciled','closed'].includes(st) ? amt : undefined,
        preferredDate: iso(new Date(T.getTime()+int(1,9)*DAY)).slice(0,10),
        transport:{ required:true, fare:int(400,1600), persons:int(1,2), journey:'Home <-> '+fac, escort:rnd()>0.5, approved:st!=='submitted' },
        assignedTo: ['assigned','completed','reconciled','closed'].includes(st) ? (area.countyId==='homabay'?'u-focal-homabay':'u-focal-kisumu') : null,
        clinicalReport: ['completed','reconciled','closed'].includes(st) ? 'Attended specialist clinic with Hospital Focal Person; prescriptions, clinic card and next MOPC/GOPC/SOPC review recorded.' : null,
        expenses:[], demo:true
      });
      const paid = ['reconciled','closed','completed'].includes(st);
      transactions.push({
        id:'tx-'+rid, no:'TX-'+String(5000+transactions.length), patientId:pid, requestId:rid,
        countyId:area.countyId, category:pick(['consultation','lab','medication','transport','food']),
        amount:amt, currency:'KES', date:iso(new Date(T.getTime()-int(0,25)*DAY)).slice(0,10),
        payer:'LOMAMO Foundation', payee:fac, ref:rnd()>0.08?('SHK'+int(1000000,9999999)):'',
        budgetLine:pick(['medication','outpatient','patient_tpt','food','shif']),
        receipt:rnd()>0.10,
        enteredBy:area.countyId==='homabay'?'u-focal-homabay':'u-focal-kisumu',
        reviewedBy:paid?(area.countyId==='homabay'?'u-finance-homabay':'u-finance-kisumu'):null,
        status:paid?'reconciled':'paid', flags:[], note:'Hospital & programme support voucher', demo:true
      });
    }
    if(i <= 36){
      concerns.push({
        id:'cn-'+pid, patientId:pid, countyId:area.countyId, areaId:area.id,
        type:i%3===0?'missed_appointment':'clinical_followup',
        level:i%3===0?'administrative':'clinical', opened:iso(new Date(T.getTime()-int(1,14)*DAY)),
        detail:i%3===0?'SHA card verification awaiting confirmation at county desk.':'Weight & specialist clinic follow-up flagged for Medical Case Manager review.',
        by:caregiver, status:i%4===0?'resolved':'open', demo:true
      });
    }
  }

  /* Remap sample records & enrich Homestay / Care Centre, Waiting List, Urgent Cases & departmental registers */
  if(patients.length >= 6){
    (db.formRecords||[]).forEach((fr, idx)=>{
      const pt = patients[idx % Math.min(24, patients.length)];
      fr.patientId = pt.id; fr.patientName = pt.name; fr.countyId = pt.countyId; fr.areaId = pt.areaId;
      fr.enteredBy = pt.caregiverId; fr.verifiedBy = fr.status==='verified' ? 'u-mcm-kisumu' : undefined;
    });
    (db.clinicalRx||[]).forEach((rx, idx)=>{
      const pt = patients[idx % Math.min(20, patients.length)];
      rx.patientId = pt.id; rx.patientName = pt.name; rx.countyId = pt.countyId; rx.areaId = pt.areaId;
      rx.prescribedBy = pt.countyId==='homabay' ? 'u-mcm-homabay' : 'u-mcm-kisumu';
      rx.dispensedBy = rx.status==='dispensed' ? (pt.countyId==='homabay' ? 'u-nurse-homabay' : 'u-nurse-kisumu') : undefined;
    });
    (db.omahaPlans||[]).forEach((om, idx)=>{
      const pt = patients[idx % Math.min(20, patients.length)];
      om.patientId = pt.id; om.patientName = pt.name; om.countyId = pt.countyId; om.areaId = pt.areaId;
      om.createdBy = pt.countyId==='homabay' ? 'u-mcm-homabay' : 'u-mcm-kisumu';
      om.approvedBy = pt.countyId==='homabay' ? 'u-nurse-homabay' : 'u-nurse-kisumu';
    });
    const homestayPool = patients.filter(p=>p.hadHomestay && p.status==='active');
    const hsPick = homestayPool.length >= 9 ? homestayPool.slice(0, 9) : patients.slice(0, Math.min(6, patients.length));
    db.careBeds = Array.from({length:12}, (_, bIdx)=>{
      const occ = bIdx < hsPick.length ? hsPick[bIdx] : null;
      const wing = bIdx < 4 ? 'Paediatric & Nutrition Wing' : (bIdx < 8 ? 'Female Recovery Wing' : 'Male Stabilization Wing');
      return {
        id:'bed-'+(bIdx+1), code:'CC-B'+String(bIdx+1).padStart(2,'0'), wing,
        countyId: bIdx >= 9 ? 'homabay' : 'kisumu',
        status: occ ? 'occupied' : (bIdx === 10 ? 'cleaning' : 'available'),
        residentId: occ ? ('res-'+(bIdx+1)) : null,
        patientId: occ ? occ.id : null, demo:true
      };
    });
    db.careResidents = hsPick.map((pt, rIdx)=>({
      id:'res-'+(rIdx+1), patientId:pt.id, name:pt.name, bedId:'bed-'+(rIdx+1),
      countyId:pt.countyId, areaId:pt.areaId,
      admitted:iso(new Date(T.getTime() - (6 + (rIdx % 12))*DAY)).slice(0,10),
      expectedDischarge:iso(new Date(T.getTime() + (5 + (rIdx % 9))*DAY)).slice(0,10),
      reason: pt.age < 18
        ? 'Short-term therapeutic nutritional stabilization & supervised MUAC catch-up'
        : 'Post-hospital clinical respite, wound/medication supervision & household readiness',
      status:'admitted', dietary: pt.age < 18 ? 'High-protein F-100 / Enriched Paediatric Diet' : 'Balanced therapeutic recovery diet',
      demo:true
    }));
    db.careLogs = hsPick.slice(0, 8).map((pt, lIdx)=>({
      id:'clog-'+(lIdx+1), residentId:'res-'+(lIdx+1), patientId:pt.id, countyId:pt.countyId,
      at:iso(new Date(T.getTime() - (lIdx % 4)*DAY)),
      shift: lIdx % 2 === 0 ? 'Morning (07:00–15:00)' : 'Evening (15:00–22:00)',
      by: pt.countyId==='homabay' ? 'u-homestay-homabay' : 'u-homestay-kisumu',
      meals:'Breakfast, enriched midday meal & evening porridge completed (100% intake)',
      vitals:`Wt ${pt.clinical.weightKg} kg · MUAC ${pt.clinical.muacCm} cm · BP ${pt.clinical.bp}`,
      note:'Resident comfortable, medications taken on schedule, guardian updated by Homestay Coordinator.',
      demo:true
    }));
  }

  db.patients = patients;
  db.visits = visits;
  db.pdcas = pdcas;
  db.requests = requests;
  db.transactions = transactions;
  db.concerns = concerns;
  db.encounters = encounters;
  db.documents = documents;
  db.support = supportIssues;
  db.supportIssues = supportIssues;
  db.patientConditions = patientConditions;

  enrichV6Collections(db, T);
  if(typeof DUALCHECK !== 'undefined' && DUALCHECK.ensureStore) DUALCHECK.ensureStore(db);
  return db;
}

/* ---------- department library ---------- */
function librarySeed(users){
  const fallback = (users[0]||{}).id || 'u-chief';
  const owner = idx => (users[Math.min(Math.max(0, users.length-1), idx)]||{}).id || fallback;
  const base = [
    ['Programme','LOMAMO Patient Confidentiality and Ethical Storytelling Policy','policy','v3, approved','The consent and storytelling rules that bind every media and case-management workflow.'],
    ['Programme','LOMAMO Foundation Procurement Policy Framework','policy','v2, approved','Thresholds, approvals and separation of duties used by the procurement console.'],
    ['Programme','LOMAMO Constitution and Bylaws (Governance Reference)','governance','22 July 2025','Governing constitution and board accountability framework.'],
    ['Programme','LOMAMO C-DIMS Trial Usage Report, 31 August 2026','research','final','Findings from the field trial and user journey refinements closed in v6.'],
    ['Medical','LOMAMO Adult Patient Assessment Form (LMMK 001)','form','current','Paper form reproduced field for field with National ID returning-patient check first.'],
    ['Medical','LOMAMO Minor Child Assessment & Orphan Prevention Form (LMMK 004)','form','current','Child health, guardian household capacity and schooling protection form.'],
    ['Medical','LOMAMO Outpatient & Inpatient Hospital Visit Forms (LMMK 020)','form','current','Used by Hospital Focal Persons at JOOTRH, Kisumu County Referral and Homa Bay Referral.'],
    ['Medical','Omaha System Care Plan & KBS Rating Reference','reference','v2','Worked HIV/TB, nutrition and chronic care plans used in clinical case management.'],
    ['Finance','County Monthly Budget & Expenditure Controls Workbook FY2026','workbook','October 2026','Configurable expenditure categories, MPESA reference rules and reconciliation checks.'],
    ['Media','Ethical Storytelling Shot List & Informed Consent Release Kit','template','v2','Written and recorded patient consent release templates prior to any publication.'],
    ['Media','LOMAMO Master Office Equipment Inventory Register','register','October 2026','122-item multi-department asset workbook assimilated directly into LOMAMO C-DIMS.'],
    ['ICT','Automatic Office Wi-Fi & Firewall Host Setup Guide','guide','v6.0','Zero-hindrance LAN server setup for office PCs, Android tablets and iPads.'],
    ['HR','Staff Leave, Handover Coverage & Monday Discipline Policy','spec','v5','Leave entitlement, mandatory handover cover and Monday reporting rules.'],
    ['HR','Occupational Health, Field Safety & Incident Register SOP','template','v1.2','Field footwear, compound vehicle marshal and clinic safety protocols.'],
    ['Students','University Attachment, Internship & Aggregate Research Protocol','guide','v1.1','Supervision, ethics clearance and strict non-PII rules for interns and students.']
  ];
  return base.map((b,i)=>({
    id:'lib-'+String(i+1).padStart(3,'0'), title:b[1], department:b[0], type:b[2], version:b[3], summary:b[4],
    classification: b[0]==='Medical' ? 'internal-clinical' : (b[0]==='HR' ? 'internal-staff' : 'internal'),
    public:false, ownerId: owner(i),
    added:'2026-0'+((i%9)+1)+'-1'+((i%9)), size:(140 + i*35)+' KB', tags:[b[0].toLowerCase(), b[2]],
    borrowable:true, downloads: 3 + (i*4)%19
  }));
}

/* ---------- recognition: initial scores ---------- */
function creditsSeed(users, patients, visits){
  const out = {};
  const visitsByCg = Object.create(null);
  (visits||[]).forEach(v=>{
    const cid = v.caregiverId || v.by;
    if(cid) visitsByCg[cid] = (visitsByCg[cid] || 0) + 1;
  });
  const ptsByCg = Object.create(null);
  const docsByCg = Object.create(null);
  const ptsByCounty = Object.create(null);
  const docsByCounty = Object.create(null);
  (patients||[]).forEach(p=>{
    if(p.caregiverId){
      ptsByCg[p.caregiverId] = (ptsByCg[p.caregiverId] || 0) + 1;
      if(p.docsVerified) docsByCg[p.caregiverId] = (docsByCg[p.caregiverId] || 0) + 1;
    }
    if(p.countyId){
      ptsByCounty[p.countyId] = (ptsByCounty[p.countyId] || 0) + 1;
      if(p.docsVerified) docsByCounty[p.countyId] = (docsByCounty[p.countyId] || 0) + 1;
    }
  });
  users.forEach((u, idx)=>{
    const isCg = u.roleId==='caregiver';
    const mineCount = isCg ? (ptsByCg[u.id] || 0) : ((ptsByCg[u.id] || 0) + (ptsByCounty[u.countyId] || 0));
    const recorded = visitsByCg[u.id] || 0;
    const documented = isCg ? (docsByCg[u.id] || 0) : (docsByCounty[u.countyId] || 0);
    out[u.id] = { coins: 8 + (idx % 6)*4, used: (idx % 3)*2, lastAward:null, manual:0,
      base: { patients: isCg ? mineCount : 0, visits: recorded, documented } };
  });
  return out;
}

/* ---------- executive team console ---------- */
function execSeed(T, users){
  const iso = d => new Date(d).toISOString();
  const d = n => iso(new Date(T.getTime()-n*86400000));
  const idOf = u => ((users||[]).find(x=>x.username===u)||{}).id || ('u-'+u.replace(/[.]/g,'-'));
  return [
    { id:'ex-001', date:d(21), title:'October Cross-County Executive Review', status:'minuted',
      venue:'Kisumu Head Office Boardroom & Homa Bay Video Link', cadence:'Monthly Statutory Sitting',
      chair:idOf('director'), secretary:idOf('exec.secretary'),
      members:['director','president','program.admin','chief.admin','program.assistant','exec.secretary','kisumu.admin','homabay.admin','mcm.kisumu'].map(idOf),
      agenda:[
        { time:'09:00', duration:'25 min', category:'Programme Caseload', text:'Q3 Orphan Prevention caseload review across all 10 ministry areas (3,333 households)', owner:idOf('program.admin') },
        { time:'09:25', duration:'25 min', category:'Clinical & Child Growth', text:'Programme stay profile (45-240d core, 241-330d extended) & paediatric Weight/BMI/MUAC surveillance', owner:idOf('mcm.kisumu') },
        { time:'09:50', duration:'20 min', category:'Hospital Linkage', text:'JOOTRH & Homa Bay Hospital Focal Desk turnaround & SHA enrolment drive', owner:idOf('focal.kisumu') },
        { time:'10:10', duration:'20 min', category:'Digital Infrastructure', text:'CareLink C-DIMS v6.5 global activation & county office tablet sync audit', owner:idOf('chief.admin') }
      ],
      minutes:[
        { n:1, decision:'verified', text:'Active household caseload verified across Kisumu (7 areas) and Homa Bay (3 areas) with ≥12 longitudinal visits per enrolled beneficiary.' },
        { n:2, decision:'approved', text:'Hospital Focal Desk cleared 94% of urgent oncology, paediatric nutrition and TB referrals within 72 hours.' },
        { n:3, decision:'confirmed', text:'Finance & Procurement confirmed 100% expenditure-against-budget voucher reconciliation prior to monthly county close.' }
      ],
      actions:[
        { id:'exa-1', owner:idOf('program.admin'), due:d(-5), priority:'high', status:'open', text:'Complete Homa Bay Sofia boundary verification with County Office Administrator' },
        { id:'exa-2', owner:idOf('focal.kisumu'), due:d(-8), priority:'medium', status:'open', text:'Reconcile remaining October JOOTRH outpatient transport vouchers' },
        { id:'exa-3', owner:idOf('chief.admin'), due:d(2), priority:'high', status:'done', text:'Deploy automatic Windows Wi-Fi firewall rule across main office host' }
      ] },
    { id:'ex-002', date:d(-7), title:'November Programme, Nutrition & Budget Sitting', status:'agenda',
      venue:'Kisumu Head Office Executive Suite', cadence:'Monthly Budget & Operations Sitting',
      chair:idOf('director'), secretary:idOf('exec.secretary'),
      members:['director','program.admin','chief.admin','program.assistant','exec.secretary','finance.kisumu','procurement','mcm.kisumu'].map(idOf),
      agenda:[
        { time:'09:00', duration:'30 min', category:'Budget vs Expenditure', text:'November Operational Expenses & food-bag procurement ceiling vs October actuals', owner:idOf('finance.kisumu') },
        { time:'09:30', duration:'25 min', category:'Clinical Graduation', text:'End-of-year graduation readiness for 180-day clinically stable households', owner:idOf('mcm.kisumu') },
        { time:'09:55', duration:'20 min', category:'Homestay Capacity', text:'Care Centre & Homestay stabilization occupancy audit (paediatric & post-op wings)', owner:idOf('homestay.kisumu') },
        { time:'10:15', duration:'15 min', category:'HR & Attachments', text:'University intern cohort aggregate research presentations & handover calendar', owner:idOf('hr.officer') }
      ],
      minutes:[
        { n:1, decision:'noted', text:'Pre-sitting Operational Expenses vs Approved Budget pack circulated by Head Office Admin 48 hours ahead of sitting.' }
      ],
      actions:[
        { id:'exa-4', owner:idOf('finance.kisumu'), due:d(-3), priority:'high', status:'open', text:'Publish consolidated Kisumu & Homa Bay Operational Expenses variance sheet before 09:00 sitting' },
        { id:'exa-5', owner:idOf('procurement'), due:d(-4), priority:'medium', status:'open', text:'Table Monday Bag 1 / Bag 2 / Special Therapeutic Bag unit-price comparison' }
      ] },
    { id:'ex-003', date:d(48), title:'September Statutory Governance & Safeguards Audit', status:'closed',
      venue:'Kisumu Head Office Boardroom', cadence:'Quarterly Governance Sitting',
      chair:idOf('president'), secretary:idOf('exec.secretary'),
      members:['president','director','program.admin','chief.admin','auditor','media.head'].map(idOf),
      agenda:[
        { time:'10:00', duration:'30 min', category:'Safeguards', text:'Zero-PII public storytelling & written consent audit across Media releases', owner:idOf('media.head') },
        { time:'10:30', duration:'30 min', category:'Internal Audit', text:'Dual-verification compliance on initial hard-copy intake & discharge scans', owner:idOf('auditor') }
      ],
      minutes:[
        { n:1, decision:'approved', text:'100% of external media stories carried verified written consent release; zero unconsented photographs found.' },
        { n:2, decision:'confirmed', text:'Physical hard-copy-first signature scan policy reaffirmed across Kisumu and Homa Bay County Admin desks.' }
      ],
      actions:[
        { id:'exa-6', owner:idOf('auditor'), due:d(20), priority:'medium', status:'done', text:'Sign off Q3 physical-to-digital intake verification sample across all 10 areas' }
      ] }
  ];
}

/* ---------- students and interns ---------- */
function internSeed(T){
  const iso = d => new Date(d).toISOString();
  const d = n => iso(new Date(T.getTime()-n*86400000));
  return [
    { id:'int-001', name:'Mercy Akoth Odhiambo', institution:'Maseno University · Public Health', department:'M&E / Data',
      supervisor:'me.kisumu', countyId:'kisumu', start:d(45), end:d(-45), status:'active', ethicsCleared:true,
      dataAccess:'aggregate-only', project:'Timeliness of 30-day PDCA household reviews across urban vs rural clusters', log:[{at:d(10), note:'Completed anonymised pivot table validation with M&E Lead.'}] },
    { id:'int-002', name:'Brian Omondi Onyango', institution:'KMTC Kisumu · Clinical Medicine', department:'Medical Case Management',
      supervisor:'mcm.kisumu', countyId:'kisumu', start:d(32), end:d(-58), status:'active', ethicsCleared:true,
      dataAccess:'supervised-clinical', project:'Nutrition recovery trajectories in HIV/TB co-infected adults', log:[{at:d(6), note:'Observed 6 supervised home follow-ups in Nyalenda and Manyatta.'}] },
    { id:'int-003', name:'Sharon Chepkoech Bett', institution:'Rongo University · Health Records & IT', department:'Administration & Records',
      supervisor:'homabay.admin', countyId:'homabay', start:d(60), end:d(-30), status:'active', ethicsCleared:true,
      dataAccess:'aggregate-only', project:'Paper-to-digital form verification turnaround in Homa Bay Town', log:[{at:d(4), note:'Audited 40 LMMK 001 & 020 forms against digital entries.'}] }
  ];
}

/* ---------- occupational health and safety ---------- */
function ohsSeed(T, users){
  const uVeh = (users.find(u=>u.roleId==='vehicle')||{}).id || 'u-vehicle-officer';
  const uCg  = (users.find(u=>u.roleId==='caregiver')||{}).id || 'u-caregiver-nyalenda';
  const uHr  = (users.find(u=>u.roleId==='hr')||{}).id || 'u-hr-officer';
  const iso = d => new Date(d).toISOString();
  const d = n => iso(new Date(T.getTime()-n*86400000));
  return [
    { id:'ohs-001', date:d(26), type:'Near miss', severity:'low', location:'LOMAMO Kisumu office compound',
      reportedBy:uVeh, summary:'Vehicle reversing without a marshal in the compound.',
      action:'Reversing marshal named for every movement; mirrored check added to the daily checklist.',
      status:'closed', closed:d(19) },
    { id:'ohs-002', date:d(11), type:'Injury', severity:'moderate', location:'Nyalenda ministry area',
      reportedBy:uCg, summary:'Caregiver slipped on wet ground during rainy-season home visit; minor wrist sprain.',
      action:'First aid given, clinical check completed, gumboots and wet-weather kit issued to all field teams.',
      status:'open', closed:null },
    { id:'ohs-003', date:d(4), type:'Hazard', severity:'high', location:'Care Centre Kitchen',
      reportedBy:uHr, summary:'LPG cylinder positioned too close to main cooking burner.',
      action:'Cylinder relocated outside in ventilated cage with chain restraint; fire blanket mounted.', status:'open', closed:null }
  ];
}

/* ---------- data elements and indicators ---------- */
function dataElementSeed(){
  return [
    { id:'de-001', name:'Home visits completed', type:'integer', unit:'visits', source:'visit.create', freq:'weekly', agg:'count', sensitivity:'internal', active:true },
    { id:'de-002', name:'Patients active in the programme', type:'integer', unit:'patients', source:'patient.status', freq:'monthly', agg:'count', sensitivity:'internal', active:true },
    { id:'de-003', name:'Patients overdue for a review', type:'integer', unit:'patients', source:'pdca.due', freq:'weekly', agg:'count', sensitivity:'internal', active:true },
    { id:'de-004', name:'Referrals completed', type:'integer', unit:'referrals', source:'request.status', freq:'monthly', agg:'count', sensitivity:'internal', active:true },
    { id:'de-005', name:'Programme expenditure', type:'decimal', unit:'KES', source:'transaction.paid', freq:'monthly', agg:'sum', sensitivity:'finance', active:true },
    { id:'de-006', name:'TB screening offered', type:'integer', unit:'screenings', source:'form.tb_screen', freq:'monthly', agg:'count', sensitivity:'clinical', active:true },
    { id:'de-007', name:'Viral load results received', type:'integer', unit:'results', source:'clinical.lab', freq:'quarterly', agg:'count', sensitivity:'clinical', active:true },
    { id:'de-008', name:'Staff trained', type:'integer', unit:'staff', source:'hr.training', freq:'quarterly', agg:'count', sensitivity:'internal', active:true }
  ];
}
function indicatorSeed(){
  return [
    { id:'ind-001', name:'Visit coverage', version:3, effective:'2026-10-01', unit:'%', approval:'approved',
      numerator:'de-001', denominator:'de-002', filters:'county, ministry area, month',
      definition:'Home visits completed divided by patients active in the programme, for the reporting month.',
      immutable:true },
    { id:'ind-002', name:'Review timeliness', version:2, effective:'2026-10-01', unit:'%', approval:'approved',
      numerator:'de-003', denominator:'de-002', filters:'county, coordinator',
      definition:'Patients whose 30-day review was completed on or before the due date, as a share of patients due.',
      immutable:true },
    { id:'ind-003', name:'Referral completion', version:1, effective:'2026-07-01', unit:'%', approval:'approved',
      numerator:'de-004', denominator:'de-004', filters:'hospital, month',
      definition:'Referrals completed divided by referrals raised in the same period.', immutable:true }
  ];
}

/* ---------------- 8. Small helpers shared by v6 modules ---------------- */
const nationalIdClean = v => String(v||'').replace(/[^0-9A-Za-z]/g,'').toUpperCase();
function patientsByNationalId(db, id){
  const key = nationalIdClean(id);
  if(!key) return [];
  return (db.patients||[]).filter(p=>nationalIdClean(p.nationalId)===key);
}
function isExecutive(user){
  if(!user) return false;
  if(user.execTeam) return true;
  if(user.roleId==='director' || user.roleId==='chief' || user.roleId==='president') return true;
  return EXEC_DEFAULT.includes(user.username);
}
let _usageScoreCache = null;
function _ensureUsageScoreCache(db){
  const pts = db.patients || [];
  const vis = db.visits || [];
  const pds = db.pdcas || [];
  if(_usageScoreCache && _usageScoreCache.pts===pts && _usageScoreCache.ptsLen===pts.length
    && _usageScoreCache.vis===vis && _usageScoreCache.visLen===vis.length
    && _usageScoreCache.pds===pds && _usageScoreCache.pdsLen===pds.length){
    return _usageScoreCache;
  }
  const visByCg = Object.create(null);
  for(let i=0;i<vis.length;i++){
    const c = vis[i].caregiverId || vis[i].by;
    if(c) visByCg[c] = (visByCg[c] || 0) + 1;
  }
  const openPdcaByOwner = Object.create(null);
  for(let i=0;i<pds.length;i++){
    if(pds[i].status==='open' && pds[i].owner){
      openPdcaByOwner[pds[i].owner] = (openPdcaByOwner[pds[i].owner] || 0) + 1;
    }
  }
  const cgStats = Object.create(null);
  const countyStats = Object.create(null);
  for(let i=0;i<pts.length;i++){
    const p = pts[i];
    if(p.caregiverId){
      const s = cgStats[p.caregiverId] || (cgStats[p.caregiverId] = { n:0, doc:0, id:0 });
      s.n++; if(p.docsVerified) s.doc++; if(p.nationalId) s.id++;
    }
    if(p.countyId){
      const cs = countyStats[p.countyId] || (countyStats[p.countyId] = { n:0, doc:0, id:0 });
      cs.n++; if(p.docsVerified) cs.doc++; if(p.nationalId) cs.id++;
    }
  }
  _usageScoreCache = { pts, ptsLen:pts.length, vis, visLen:vis.length, pds, pdsLen:pds.length, visByCg, openPdcaByOwner, cgStats, countyStats };
  return _usageScoreCache;
}
function usageScore(user, db){
  if(!user) return 0;
  const c = _ensureUsageScoreCache(db || {});
  const bucket = user.roleId==='caregiver'
    ? (c.cgStats[user.id] || { n:0, doc:0, id:0 })
    : (c.countyStats[user.countyId] || c.cgStats[user.id] || { n:0, doc:0, id:0 });
  const mineLen = bucket.n;
  const documented = bucket.doc;
  const withId = bucket.id;
  const visitLen = c.visByCg[user.id] || 0;
  const openPdca = c.openPdcaByOwner[user.id] || 0;
  const parts = [
    { k:'Records registered', w:30, v: mineLen ? Math.min(1, mineLen/Math.max(20, mineLen*0.85)) : 0, note:mineLen+' patients in scope' },
    { k:'Field documentation', w:25, v: mineLen ? documented/mineLen : 0, note:documented+' of '+mineLen+' verified' },
    { k:'Activity recorded', w:20, v: Math.min(1, visitLen/Math.max(12, mineLen*0.35||1)), note:visitLen+' visits' },
    { k:'Identity completeness', w:15, v: mineLen ? withId/mineLen : 0, note:withId+' national IDs captured' },
    { k:'Follow-up discipline', w:10, v: mineLen ? Math.max(0, 1 - openPdca/Math.max(1,mineLen)) : 0, note:openPdca+' open PDCA' }
  ];
  const score = Math.round(parts.reduce((n,p)=>n + p.w*p.v, 0));
  return { score, parts };
}
function scoreBand(score){
  if(score>=90) return { name:'Platinum', tone:'ok', coins:4 };
  if(score>=75) return { name:'Gold', tone:'warn', coins:3 };
  if(score>=60) return { name:'Silver', tone:'neutral', coins:2 };
  if(score>=40) return { name:'Bronze', tone:'neutral', coins:1 };
  return { name:'Building', tone:'crit', coins:0 };
}
