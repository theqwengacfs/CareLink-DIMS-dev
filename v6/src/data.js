/* ============================================================
   data.js - Organisational configuration & reference data
   LOMAMO Foundation Kenya · LOMAMO C-DIMS v5.1
   ------------------------------------------------------------
   EVERYTHING here is configuration, not hard-coded policy.
   The Chief System Administrator can change roles, scopes and
   org units at runtime (persisted in the database).
   Demo records are synthetic and tagged DEMO. No real patient,
   staff, donor or financial records are embedded.
   ============================================================ */

const APP = {
  /* CareLink is the unified Operating System name uniting all LOMAMO Foundation
     departments and external partners; CareLink C-DIMS is the browser tab title.
     "LOMAMO C-DIMS" and "CareLink DIMS" are preserved so earlier documents and
     offline field kits resolve seamlessly. */
  osName: 'CareLink',
  name: 'CareLink',
  tabTitle: 'CareLink C-DIMS',
  shortName: 'CareLink',
  formerName: 'LOMAMO C-DIMS',
  full: 'CareLink — LOMAMO Foundation Unified Operating System (CareLink C-DIMS)',
  version: '6.6.8',
  build: '2026.10.25',
  schema: 6,
  org: 'LOMAMO Foundation Kenya',
  motto: 'Love Matters Most',
  tagline: 'Serving our neighbours in love',
  tz: 'Africa/Nairobi',
  reportHour: 8,          // Monday 08:00 EAT
  currency: 'KES'
};

/* ---------- 1. CAPABILITY REGISTRY ----------
   Grouped capabilities. `sensitive:true` capabilities are subject to
   mandatory governance rules that ordinary administration cannot
   switch off (see core.js NON_OVERRIDABLE). */
const CAPS = {
  'user.view':        { g:'Access & identity', l:'View user directory' },
  'user.create':      { g:'Access & identity', l:'Initiate account requests' },
  'user.approve':     { g:'Access & identity', l:'Approve / reject accounts' },
  'user.manage':      { g:'Access & identity', l:'Edit, suspend, deactivate accounts' },
  'role.manage':      { g:'Access & identity', l:'Define roles & permission templates', sensitive:true },
  'org.manage':       { g:'Access & identity', l:'Configure counties, areas & departments' },
  'system.config':    { g:'System', l:'System settings & workflow configuration', sensitive:true },
  'system.health':    { g:'System', l:'System health & diagnostics' },
  'system.audit':     { g:'System', l:'Read the audit trail', sensitive:true },
  'system.backup':    { g:'System', l:'Create and verify backups', sensitive:true },
  'system.restore':   { g:'System', l:'Restore a database (dual approval)', sensitive:true, dual:true },
  'system.import':    { g:'System', l:'Master workbook import / data migration', sensitive:true },
  'system.export':    { g:'System', l:'Full database export', sensitive:true, dual:true },

  'patient.list':     { g:'Patients', l:'See patient lists (scoped)' },
  'patient.view.basic':    { g:'Patients', l:'View basic patient identity' },
  'patient.view.clinical': { g:'Patients', l:'View clinical information', sensitive:true },
  'patient.assess.create': { g:'Patients', l:'Initiate a patient assessment' },
  'patient.digitise': { g:'Patients', l:'Digitise a physical assessment form' },
  'patient.verify':   { g:'Patients', l:'Verify a digitised record' },
  'patient.enrol':    { g:'Patients', l:'Approve enrolment', sensitive:true },
  'patient.return':   { g:'Patients', l:'Return a record for correction' },
  'patient.discharge.recommend': { g:'Patients', l:'Recommend discharge' },
  'patient.discharge.approve':   { g:'Patients', l:'Approve discharge', sensitive:true },
  'patient.edit':     { g:'Patients', l:'Correct patient records' },
  'patient.export':   { g:'Patients', l:'Export patient data (scoped, audited)', sensitive:true },

  'condition.view':   { g:'Clinical', l:'View recorded conditions', sensitive:true },
  'condition.record': { g:'Clinical', l:'Record a presenting condition', sensitive:true },
  'condition.confirm':{ g:'Clinical', l:'Confirm a diagnosis', sensitive:true },
  'condition.sensitive': { g:'Clinical', l:'View HIV, TB and counselling detail', sensitive:true },
  'condition.aggregate': { g:'Clinical', l:'Condition statistics without identities' },

  'care.view':        { g:'Care centre', l:'View care centre occupancy and residents' },
  'care.log':         { g:'Care centre', l:'Record daily care, meals and handover' },
  'care.incident':    { g:'Care centre', l:'Record and read safeguarding incidents', sensitive:true },
  'care.manage':      { g:'Care centre', l:'Manage beds, rosters and care plans', sensitive:true },

  'delegation.manage':{ g:'Access & identity', l:'Issue time-boxed delegations', sensitive:true },

  'visit.create':     { g:'Field & care', l:'Record home visits' },
  'visit.view':       { g:'Field & care', l:'View visit history' },
  'pdca.create':      { g:'Field & care', l:'Create PDCA follow-up cycles' },
  'pdca.review':      { g:'Field & care', l:'Review PDCA documentation' },
  'media.upload':     { g:'Field & care', l:'Upload patient documents & photographs' },
  'story.submit':     { g:'Field & care', l:'Submit potential success-story material' },

  'form.view':        { g:'Patients', l:'View digitised paper forms' },
  'form.create':      { g:'Patients', l:'Enter a paper form' },
  'form.verify':      { g:'Patients', l:'Verify a paper form against the original' },

  'clinical.prescribe': { g:'Clinical', l:'Prescribe medication', sensitive:true },
  'clinical.dispense':  { g:'Pharmacy', l:'Dispense medication' },
  'pharmacy.view':      { g:'Pharmacy', l:'View pharmacy stock and prescriptions' },
  'pharmacy.manage':    { g:'Pharmacy', l:'Receive and adjust pharmacy stock', sensitive:true },
  'careplan.view':      { g:'Clinical', l:'View care plans', sensitive:true },
  'careplan.manage':    { g:'Clinical', l:'Draft, rate and edit care plans', sensitive:true },
  'careplan.approve':   { g:'Clinical', l:'Approve a care plan', sensitive:true },

  'hosp.request.create': { g:'Hospital', l:'Submit hospital appointment / transport requests' },
  'hosp.request.review': { g:'Hospital', l:'Review hospital requests (clinical)' },
  'hosp.request.assign': { g:'Hospital', l:'Assign hospital focal persons' },
  'hosp.visit.record':   { g:'Hospital', l:'Record hospital service delivery' },
  'hosp.receipt.submit': { g:'Hospital', l:'Submit receipts & expense evidence' },
  'hosp.receipt.review': { g:'Hospital', l:'Review / reconcile hospital expenses', sensitive:true },
  'hosp.close':          { g:'Hospital', l:'Close hospital cases' },

  'finance.view':        { g:'Finance', l:'View financial records (scoped)' },
  'finance.budget.manage': { g:'Finance', l:'Manage budget lines & versions' },
  'finance.commit':      { g:'Finance', l:'Commit / authorise expenditure' },
  'finance.pay':         { g:'Finance', l:'Record payments' },
  'finance.reconcile':   { g:'Finance', l:'Reconcile expenditure', sensitive:true },
  'finance.report':      { g:'Finance', l:'Generate expenditure reports' },
  'procurement.view':    { g:'Finance', l:'View procurement pipeline' },
  'procurement.manage':  { g:'Finance', l:'Manage procurement requests' },

  'hr.view':          { g:'People', l:'View staff records (HR scope)' },
  'hr.manage':        { g:'People', l:'Manage staff records', sensitive:true },
  'hr.leave.approve': { g:'People', l:'Approve leave & off-days' },
  'hr.documents':     { g:'People', l:'Manage staff documents', sensitive:true },
  'welfare.view':     { g:'People', l:'View welfare activities' },
  'welfare.manage':   { g:'People', l:'Manage welfare contributions', sensitive:true },

  'media.view':       { g:'Media & governance', l:'Access media library' },
  'media.consent.manage': { g:'Media & governance', l:'Record & verify patient consent', sensitive:true },
  'media.publish':    { g:'Media & governance', l:'Approve publication', sensitive:true },
  'media.library.manage': { g:'Media & governance', l:'Manage media assets' },
  'policy.manage':    { g:'Media & governance', l:'Manage governance policy', sensitive:true },
  'kb.manage':        { g:'Media & governance', l:'Manage organisational knowledge base' },

  'audit.view':       { g:'Audit', l:'Inspect records & find findings' },
  'audit.manage':     { g:'Audit', l:'Manage audit findings', sensitive:true },

  'vehicle.view':     { g:'Transport', l:'View vehicle & transport records' },
  'vehicle.manage':   { g:'Transport', l:'Manage vehicles, trips & maintenance' },
  'trip.log':         { g:'Transport', l:'Log trips & fuel' },

  'report.patient_days':   { g:'Reporting', l:'Patient-Days report' },
  'report.patient_figures':{ g:'Reporting', l:'Patient Figures report' },
  'report.expenditure':    { g:'Reporting', l:'Expenditure report' },
  'report.referral':       { g:'Reporting', l:'Master Referral Document' },
  'report.departmental':   { g:'Reporting', l:'Departmental reports' },
  'report.executive':      { g:'Reporting', l:'Executive & leadership reports' },
  'report.targets.manage': { g:'Reporting', l:'Set & version targets' },

  'pr.view':          { g:'Comms', l:'Public relations workspace' },
  'pr.publish':       { g:'Comms', l:'Publish approved external content', sensitive:true },
  'message.use':      { g:'Comms', l:'Send and receive internal messages' },
  'ai.use':           { g:'Assistant', l:'Use the CareLink assistant' },

  /* CareLink v6.3 strict departmental, clinical & partner capabilities */
  'pmi.check':        { g:'Patients', l:'Check returning-patient history & discharge advisories' },
  'monday.meeting':   { g:'Coordination', l:'Join the Monday Management Meeting workspace' },
  'monday.manage':    { g:'Coordination', l:'Prepare and push County Monday Meeting agendas', sensitive:true },
  'clinical.mcm':     { g:'Clinical', l:'Open Medical Case Manager & Clinical Assistant console', sensitive:true },
  'hardcopy.intake':  { g:'Patients', l:'Digitise physical assessment & discharge forms with scanned pages', sensitive:true },
  'ccc.desk':         { g:'Partners', l:'Submit & track CCC / PSC / Hospital clinical referrals' },
  'gov.oversight':    { g:'Partners', l:'View privacy-safe County & National Government impact dashboard' },
  'intl.medical':     { g:'Clinical', l:'Review 120+ day PDCA overstay reports & international clinical oversight', sensitive:true },
  'handover.use':     { g:'People', l:'Manage delegation plans, reliever scope & role handovers' },

  /* CareLink v6.4 Production Operations, Dev Console & Audited Silent Override */
  'admin.ops':        { g:'Finance & operations', l:'Manage daily PAYG, weekly suppliers, 9th statutory, Operational Expenses & annual societies' },
  'admin.ops.kisumu_hq': { g:'Finance & operations', l:'Prepare consolidated Kenya & Homa Bay monthly financial reports (Kisumu Head Office)', sensitive:true },
  'dev.console':      { g:'System', l:'Access the CareLink Development Console & live diagnostics', sensitive:true },
  'system.override.silent': { g:'System', l:'Silently inspect user workspaces & left-panel navigation (Chief System Admin, audited)', sensitive:true }
};

/* ---------- 2. ORGANISATIONAL STRUCTURE ---------- */
const DEPARTMENTS = [
  { id:'exec',      name:'Executive Leadership',       accent:'#111827', short:'EXE' },
  { id:'admin',     name:'Administration',             accent:'#C8102E', short:'ADM' },
  { id:'medical',   name:'Medical & Clinical Services',accent:'#0E7490', short:'MED' },
  { id:'ministry',  name:'Ministry & Field Programmes',accent:'#B45309', short:'MIN' },
  { id:'media',     name:'Media & Information Governance', accent:'#7C3AED', short:'MIG' },
  { id:'finance',   name:'Finance',                    accent:'#1D4ED8', short:'FIN' },
  { id:'procure',   name:'Procurement',                accent:'#EA580C', short:'PRC' },
  { id:'me',        name:'Data Management & M&E',      accent:'#0891B2', short:'ME' },
  { id:'audit',     name:'Audit',                      accent:'#B45309', short:'AUD' },
  { id:'hr',        name:'Human Resources',            accent:'#059669', short:'HR' },
  { id:'welfare',   name:'Staff Welfare',              accent:'#DB2777', short:'WLF' },
  { id:'vehicle',   name:'Vehicle & Transport',        accent:'#475569', short:'VTM' },
  { id:'pr',        name:'Public Relations & Communications', accent:'#9333EA', short:'PR' }
];

/* Ministry areas, with the sub-county grouping printed on the KCO organogram.
   "sofia" is carried because the earlier requirements named it, but the
   organogram shows only Makongeni and Shauri Yako for Homa Bay Town, so it is
   flagged unverified rather than presented as confirmed. */
const COUNTIES = [
  { id:'kisumu', name:'Kisumu County Office', code:'KSM', accent:'#0E7490',
    areas:[
      { id:'nyalenda',  name:'Nyalenda',     subCounty:'Kisumu Central A', cls:'urban' },
      { id:'nairobird', name:'Nairobi Road', subCounty:'Kisumu Central B', cls:'urban' },
      { id:'manyatta',  name:'Manyatta',     subCounty:'Kisumu Central C', cls:'urban' },
      { id:'nyahera',   name:'Nyahera',      subCounty:'Kisumu West',      cls:'village' },
      { id:'chiga',     name:'Chiga',        subCounty:'Kisumu East',      cls:'village' },
      { id:'ombeyi',    name:'Ombeyi',       subCounty:'Muhoroni',         cls:'village' },
      { id:'ahero',     name:'Ahero',        subCounty:'Nyando',           cls:'village' }
    ]},
  { id:'homabay', name:'Homa Bay County Office', code:'HBY', accent:'#7C3AED',
    areas:[
      { id:'makongeni', name:'Makongeni',   subCounty:'Homa Bay Town', cls:'urban' },
      { id:'shauriyako',name:'Shauri Yako', subCounty:'Homa Bay Town', cls:'urban' },
      { id:'sofia',     name:'Sofia',       subCounty:'Homa Bay Town', cls:'urban', unverified:true }
    ]}
];
const AREA_CLASS_LABEL = { urban:'Urban / slum-based', village:'Village-based' };

/* Verification notes surfaced in Org Config - nothing is silently assumed. */
const ORG_NOTES = [
  { id:'hb-areas', level:'warn', title:'Homa Bay ministry areas require verification',
    body:'The requirements name Makongeni, Sofia and Shauri Yako. The KCO organogram shows only Makongeni and Shauri Yako under Homa Bay Town. Sofia is loaded but marked unverified. Confirm it, or remove it, before importing Homa Bay field data.' },
  { id:'area-class', level:'info', title:'Ministry-area classification is editable',
    body:'Kisumu: Ombeyi, Nyahera, Ahero and Chiga are village-based; Nyalenda, Nairobi Road and Manyatta are urban/slum-based. These are stored as configurable attributes, not code.' },
  { id:'roles', level:'info', title:'20 account categories reconciled with the organogram',
    body:'Account categories from the requirements were reconciled against the KCO organogram and job functions. Where a responsibility is not documented, it is marked PROPOSED in the RBAC matrix and requires leadership confirmation.' },
  { id:'gov', level:'crit', title:'Media & Information Governance separation of duties',
    body:'Governance policy is enforced as a rule engine, not as a super-user. The Chief System Administrator cannot disable mandatory privacy controls; publication and full-database export require governance clearance and are audited.' }
];

/* ---------- 3. ROLE TEMPLATES ----------
   scope.geo: 'global' | 'county' | 'areas'
   scope.records: 'global' | 'county' | 'areas' | 'department' | 'assigned' | 'own'
   Every permission here is a template; Chief Admin may clone & edit. */
const ROLES = [
  { id:'chief', name:'Chief System Administrator', dept:'admin', accent:'#C8102E', consoleTitle:'System Administration',
    scope:{ geo:'global', records:'global', crossCounty:true },
    perms:['user.*','role.manage','org.manage','system.*','patient.list','patient.view.basic','report.departmental','report.executive','ai.use','delegation.manage'] },

  { id:'president', name:'President', dept:'exec', accent:'#111827', consoleTitle:'Presidential Console',
    scope:{ geo:'global', records:'global', crossCounty:true },
    perms:['patient.list','report.executive','report.departmental','finance.view','hr.view','ai.use','system.audit'] },

  { id:'director', name:'Country Director', dept:'exec', accent:'#1F2937', consoleTitle:'Leadership Console',
    scope:{ geo:'global', records:'global', crossCounty:true },
    perms:['patient.list','patient.view.basic','report.executive','report.patient_figures','report.expenditure','finance.view','hr.view','audit.view','ai.use', 'delegation.manage', 'condition.aggregate', 'care.view',
     'hr.leave.approve'] },

  { id:'countyadmin', name:'County Office Administrator', dept:'admin', accent:'#C8102E', consoleTitle:'County Administration',
    scope:{ geo:'county', records:'county' },
    perms:['user.view','user.create','user.approve','patient.list','patient.view.basic','patient.view.clinical','patient.verify','patient.enrol','patient.discharge.approve','patient.edit','patient.return',
      'finance.view','finance.commit','finance.pay','finance.reconcile','finance.report','finance.budget.manage','procurement.view',
      'hosp.request.create','hosp.request.assign','hosp.receipt.review','hosp.close','patient.export',
      'report.patient_days','report.patient_figures','report.expenditure','report.targets.manage','report.departmental','audit.view','hr.view','ai.use','welfare.view','vehicle.view',
      'condition.aggregate', 'care.view', 'care.manage', 'delegation.manage'] },

  { id:'assistant', name:'Administrative Assistant', dept:'admin', accent:'#B00020', consoleTitle:'Administration Desk',
    scope:{ geo:'county', records:'county' },
    perms:['patient.list','patient.view.basic','patient.view.clinical','patient.digitise','patient.verify','patient.return','patient.edit',
      'report.patient_days','report.patient_figures','report.departmental','hosp.request.create','ai.use',
      'condition.view', 'condition.record', 'care.view', 'care.log'] },

  { id:'coordinator', name:'Ministry Area Coordinator', dept:'ministry', accent:'#B45309', consoleTitle:'Ministry Area Console',
    scope:{ geo:'areas', records:'areas' },
    perms:['user.view','user.create','patient.list','patient.view.basic','patient.discharge.recommend','visit.view','visit.create','pdca.create','report.patient_days','report.departmental','hosp.request.create','ai.use', 'condition.view', 'care.view'] },

  { id:'caregiver', name:'Supporting Caregiver', dept:'ministry', accent:'#C2410C', consoleTitle:'Caregiver Field Console',
    scope:{ geo:'areas', records:'areas' },
    perms:['patient.list','patient.view.basic','patient.view.clinical','patient.assess.create','patient.discharge.recommend',
      'visit.create','visit.view','pdca.create','media.upload','story.submit','hosp.request.create','report.departmental','ai.use',
      'condition.view', 'condition.record', 'care.view', 'care.log'] },

  { id:'chw', name:'Approved Community Health Worker', dept:'ministry', accent:'#D97706', consoleTitle:'Community Health Console',
    scope:{ geo:'areas', records:'areas' },
    perms:['patient.list','patient.view.basic','visit.create','visit.view','pdca.create','media.upload','ai.use'] },

  { id:'mcm', name:'Medical Case Manager', dept:'medical', accent:'#0E7490', consoleTitle:'Medical Case Management',
    scope:{ geo:'county', records:'county' },
    perms:['user.view','user.create','patient.list','patient.view.basic','patient.view.clinical','patient.discharge.recommend','patient.discharge.approve','patient.edit','patient.export',
      'pdca.review','visit.view','visit.create','pdca.create','hosp.request.create','hosp.request.review','hosp.request.assign','hosp.receipt.review','hosp.close',
      'report.referral','report.patient_days','report.departmental','ai.use','media.consent.manage',
      'condition.view', 'condition.record', 'condition.confirm', 'condition.sensitive', 'condition.aggregate', 'care.view', 'care.log', 'care.incident', 'care.manage'] },

  { id:'liaison', name:'Hospital Liaison Person', dept:'medical', accent:'#0891B2', consoleTitle:'Hospital Liaison Desk',
    scope:{ geo:'county', records:'assigned' },
    perms:['patient.list','patient.view.basic','patient.view.clinical','hosp.visit.record','hosp.receipt.submit','media.upload','report.departmental','ai.use', 'condition.view', 'care.view'] },

  { id:'nurse', name:'Nurse / Clinical Officer', dept:'medical', accent:'#0F766E', consoleTitle:'Clinical Console',
    scope:{ geo:'county', records:'county' },
    perms:['patient.list','patient.view.basic','patient.view.clinical','patient.assess.create','visit.create','visit.view','pdca.create','pdca.review','media.upload','report.departmental','ai.use', 'condition.view', 'condition.record', 'condition.confirm', 'condition.sensitive', 'care.view', 'care.log', 'care.incident'] },

  { id:'mediahead', name:'Media & Information Governance Head', dept:'media', accent:'#7C3AED', consoleTitle:'Media & Governance',
    scope:{ geo:'global', records:'global', crossCounty:true },
    perms:['media.view','media.consent.manage','media.publish','media.library.manage','policy.manage','kb.manage',
      'patient.list','patient.view.basic','report.departmental','ai.use','system.backup','system.audit'] },

  { id:'finance', name:'Finance Officer', dept:'finance', accent:'#1D4ED8', consoleTitle:'Finance Console',
    scope:{ geo:'county', records:'county' },
    perms:['finance.*','procurement.view','hosp.receipt.review','report.expenditure','report.departmental','patient.list','ai.use'] },

  { id:'procurement', name:'Procurement Officer', dept:'procure', accent:'#EA580C', consoleTitle:'Procurement Console',
    scope:{ geo:'county', records:'county' },
    perms:['procurement.view','procurement.manage','finance.view','report.expenditure','report.departmental','ai.use'] },

  { id:'me', name:'M&E / Data Officer', dept:'me', accent:'#0891B2', consoleTitle:'Monitoring & Evaluation',
    scope:{ geo:'county', records:'county' },
    perms:['patient.list','patient.view.basic','patient.export','report.patient_days','report.patient_figures','report.referral','report.departmental','report.targets.manage','audit.view','ai.use','condition.aggregate'] },

  { id:'auditor', name:'Auditor', dept:'audit', accent:'#B45309', consoleTitle:'Audit & Assurance',
    scope:{ geo:'global', records:'global', crossCounty:true, readOnly:true },
    perms:['audit.view','audit.manage','patient.list','patient.view.basic','finance.view','report.expenditure','report.patient_figures','system.audit','ai.use','hr.view', 'condition.aggregate'] },

  { id:'hr', name:'Human Resource Officer', dept:'hr', accent:'#059669', consoleTitle:'Human Resources',
    scope:{ geo:'global', records:'department' },
    perms:['hr.view','hr.manage','hr.leave.approve','hr.documents','user.view','user.create','report.departmental','ai.use','welfare.view','care.view'] },

  { id:'welfare', name:'Staff Welfare Officer', dept:'welfare', accent:'#DB2777', consoleTitle:'Staff Welfare',
    scope:{ geo:'global', records:'department' },
    perms:['welfare.view','welfare.manage','hr.view','report.departmental','ai.use'] },

  { id:'vehicle', name:'Vehicle & Transport Officer', dept:'vehicle', accent:'#475569', consoleTitle:'Fleet & Transport',
    scope:{ geo:'county', records:'county' },
    perms:['vehicle.view','vehicle.manage','trip.log','report.departmental','report.expenditure','ai.use'] },

  { id:'pr', name:'Public Relations Officer', dept:'pr', accent:'#9333EA', consoleTitle:'Public Relations',
    scope:{ geo:'global', records:'global', crossCounty:true },
    perms:['pr.view','pr.publish','media.view','report.departmental','ai.use'] },

  { id:'depthead', name:'Department Head', dept:'medical', accent:'#334155', consoleTitle:'Department Head',
    scope:{ geo:'county', records:'county' },
    perms:['user.view','user.create','patient.list','patient.view.basic','report.departmental','report.patient_days','report.expenditure','ai.use','hr.view', 'condition.view', 'condition.aggregate', 'care.view'] },

  /* External & Partner Consoles (strictly scoped to partner responsibilities) */
  { id:'ccc.clinician', name:'CCC / PSC / Hospital Clinician', dept:'medical', accent:'#0E7490', consoleTitle:'CCC / PSC Hospital Referral Console',
    external:true,
    scope:{ geo:'county', records:'own' },
    perms:['ccc.desk','pmi.check','message.use'] },

  { id:'gov.partner', name:'County & National Government Partner', dept:'exec', accent:'#1D4ED8', consoleTitle:'Government Health Partnership Console',
    external:true,
    scope:{ geo:'global', records:'own', crossCounty:true, readOnly:true },
    perms:['gov.oversight','condition.aggregate','message.use'] },

  { id:'intl.medical', name:'International Medical Team', dept:'medical', accent:'#7C3AED', consoleTitle:'International Medical & PDCA Console',
    external:true,
    scope:{ geo:'global', records:'global', crossCounty:true },
    perms:['intl.medical','clinical.mcm','pmi.check','patient.list','patient.view.basic','patient.view.clinical',
      'pdca.review','condition.view','condition.aggregate','careplan.view','report.patient_days','report.departmental','message.use','ai.use'] }
];
/* The capabilities added for prescribing, pharmacy stock, care plans and the
   digitised paper forms are granted here, in one place, so the matrix can be
   read as a whole. Every entry names a capability that exists above. */
const ROLE_ADDITIONS = {
  chief:['form.view','form.verify','pharmacy.view','careplan.view','pmi.check','monday.meeting','monday.manage','hardcopy.intake','ccc.desk','gov.oversight','intl.medical','handover.use','dev.console','admin.ops','admin.ops.kisumu_hq','system.override.silent'],
  president:['monday.meeting','gov.oversight','handover.use','admin.ops'],
  director:['form.view','careplan.view','pharmacy.view','hr.leave.approve','pmi.check','monday.meeting','monday.manage','clinical.mcm','hardcopy.intake','ccc.desk','gov.oversight','intl.medical','handover.use','admin.ops','admin.ops.kisumu_hq'],
  countyadmin:['form.view','form.verify','pharmacy.view','careplan.view','hr.leave.approve','pmi.check','monday.meeting','monday.manage','hardcopy.intake','ccc.desk','gov.oversight','handover.use','admin.ops'],
  assistant:['form.view','form.create','form.verify','careplan.view','pmi.check','monday.meeting','monday.manage','hardcopy.intake','ccc.desk','handover.use','admin.ops'],
  coordinator:['form.view','form.verify','careplan.view','pharmacy.view','pmi.check','monday.meeting','ccc.desk','handover.use'],
  caregiver:['form.view','form.create','careplan.view','pmi.check','monday.meeting','ccc.desk','handover.use'],
  chw:['form.view','form.create','pmi.check','monday.meeting','handover.use'],
  mcm:['form.view','form.create','form.verify','clinical.prescribe','clinical.dispense','pharmacy.view','pharmacy.manage',
       'careplan.view','careplan.manage','careplan.approve','pmi.check','monday.meeting','clinical.mcm','hardcopy.intake','ccc.desk','intl.medical','handover.use'],
  liaison:['form.view','form.create','pharmacy.view','pmi.check','monday.meeting','ccc.desk','handover.use'],
  nurse:['form.view','form.create','form.verify','clinical.prescribe','clinical.dispense','pharmacy.view',
         'pharmacy.manage','careplan.view','careplan.manage','careplan.approve','pmi.check','monday.meeting','clinical.mcm','ccc.desk','handover.use'],
  depthead:['form.view','careplan.view','pharmacy.view','hr.leave.approve','monday.meeting','clinical.mcm','intl.medical','handover.use'],
  mediahead:['monday.meeting','gov.oversight','handover.use'],
  finance:['monday.meeting','handover.use','admin.ops','admin.ops.kisumu_hq'],
  procurement:['monday.meeting','handover.use','admin.ops'],
  me:['form.view','careplan.view','monday.meeting','gov.oversight','handover.use'],
  auditor:['monday.meeting','admin.ops'],
  hr:['monday.meeting','handover.use'],
  welfare:['monday.meeting','handover.use'],
  vehicle:['monday.meeting','handover.use'],
  pr:['monday.meeting','gov.oversight','handover.use']
};
ROLES.forEach(r=>{ (ROLE_ADDITIONS[r.id]||[]).forEach(c=>{ if(!r.perms.includes(c)) r.perms.push(c); }); });

/* Every member of staff may coordinate with colleagues. Messaging carries no
   record access of its own: a message is visible only to its participants. */
ROLES.forEach(r=>{ if(!r.perms.includes('message.use')) r.perms.push('message.use'); });
const ROLE = id => ROLES.find(r=>r.id===id);

/* ---------- 4. FINANCE REFERENCE ---------- */
const BUDGET_CATEGORIES = [
  { id:'food',             name:'Food & foodbags (Weekly Suppliers)', group:'Programme' },
  { id:'patient_payg',     name:'Patient expenses (Daily Pay-As-You-Go)', group:'Programme' },
  { id:'staff_tpt',        name:'Staff transport (Daily)',        group:'Operations' },
  { id:'patient_tpt',      name:'Patient transport',              group:'Programme' },
  { id:'medication',       name:'Medication',                     group:'Medical' },
  { id:'outpatient',       name:'Outpatient expenses',            group:'Medical' },
  { id:'shif',             name:'SHIF / SHA contributions',       group:'Statutory (9th)' },
  { id:'statutory_9th',    name:'Statutory remittances (9th: SHIF, PAYE, KRA, NSSF)', group:'Statutory (9th)' },
  { id:'utilities_rent',   name:'Monthly utilities & bills (water, garbage, electricity, rent, salaries)', group:'Operations' },
  { id:'op_expenses',      name:'Operational Expenses (Operational wages, Admin wages & Monthly financial reports)', group:'Operational Expenses' },
  { id:'annual_societies', name:'Filing of Societies & annual license renewals', group:'Governance' },
  { id:'fuel',             name:'Vehicle fuel',                   group:'Transport' },
  { id:'maint',            name:'Vehicle maintenance',            group:'Transport' },
  { id:'other',            name:'Other approved support',         group:'Programme' }
];

const SUPPORT_ITEMS = ['Foodbag','Bible','Mosquito net','Mattress','Blanket','Special bag','Hygiene kit'];

/* ---------- 5. INDICATOR DICTIONARY (report definitions) ---------- */
const INDICATORS = {
  active_caseload:{ l:'Active patients at cut-off', def:'Patients whose status is Enrolled/Active at 23:59 EAT on the cut-off date, less any discharge, death, transfer or lost-to-follow-up effective on or before the cut-off.', src:'patient.status + status_effective_date' },
  new_assessed:{ l:'New patients assessed', def:'Distinct patients whose initial assessment was submitted (physical form received) within the reporting period. A patient is counted once, on first assessment date.', src:'assessment.submitted_at' },
  approved_enrol:{ l:'Patients approved for enrolment', def:'Distinct patients whose enrolment decision (Approve) was recorded within the period, regardless of when the assessment occurred.', src:'enrolment.approved_at' },
  enrolled_week:{ l:'Patients enrolled in the previous week', def:'Patients whose enrolment became effective in the seven days preceding the cut-off.', src:'enrolment.effective_date' },
  discharged_week:{ l:'Patients discharged in the previous week', def:'Patients whose discharge was approved and became effective in the seven days preceding the cut-off.', src:'discharge.effective_date' },
  discharged_month:{ l:'Patients discharged month to date', def:'Approved discharges effective from the first day of the cut-off month to the cut-off.', src:'discharge.effective_date' },
  followup_required:{ l:'Patients requiring follow-up', def:'Active patients with an open follow-up action, an overdue visit, an unresolved concern, or a PDCA cycle past its check date. A patient is counted once.', src:'followup + visit + pdca' },
  not_found:{ l:'Not found at home (previous week)', def:'Documented failed home visits in the previous week where the patient could not be located. Repeat attempts in the same week count once per patient.', src:'visit.outcome="not_found"' },
  inpatient:{ l:'Inpatients', def:'Patients with an open hospital admission record at cut-off (admission recorded, discharge not yet recorded).', src:'hospital_encounter.admitted_at' },
  outpatient:{ l:'Outpatients (tracked)', def:'Hospital outpatient encounters recorded in the period, de-duplicated per patient per day.', src:'hospital_encounter.type="outpatient"' },
  support:{ l:'Support items issued', def:'Physical items (foodbags, Bibles, nets, mattresses, blankets, special bags) issued and evidenced in the period, by item type. Not monetary transfers.', src:'support_issue' },
  orphans_prevented:{ l:'Children supported by orphan-prevention work', def:'Children in enrolled households who meet the approved orphan-prevention outcome definition (education continuity + nutrition + guardian care plan, verified at assessment and review). NOT every child in a household.', src:'household_child + outcome_verification' },
  salvation:{ l:'Reported faith engagement', def:'Patients who voluntarily record a faith decision, where the patient consents to its recording. Restricted field: visible only to authorised ministry and leadership roles. Never used as a performance target for staff.', src:'patient.faith_record (restricted)' },
  hosp_submitted:{ l:'Hospital requests submitted', def:'Hospital appointment/transport requests submitted in the period.', src:'hospital_request.submitted_at' },
  hosp_approved:{ l:'Hospital requests approved', def:'Requests approved by the Medical Case Manager in the period.', src:'hospital_request.decided_at' },
  hosp_completed:{ l:'Hospital requests completed', def:'Requests where hospital service delivery was recorded as completed in the period.', src:'hospital_request.service_completed_at' },
  hosp_outstanding:{ l:'Hospital requests outstanding', def:'Requests not yet closed at cut-off: awaiting review, approved but not served, served but unreconciled, or missing evidence.', src:'hospital_request.status' }
};

/* ---------- 6. DEMO DATASET (synthetic) ----------
   Deterministic, seeded, clearly labelled. Never presented as real. */
function seedDemo(db, now){
  const T = new Date(now); T.setHours(9,0,0,0);
  const DAY = 86400000, d = n => new Date(T.getTime() - n*DAY);
  const iso = x => new Date(x).toISOString();
  const rnd = (function(s){ return function(){ s = (s*1664525 + 1013904223) % 4294967296; return s/4294967296; }; })(20261018);
  const pick = a => a[Math.floor(rnd()*a.length)];
  const int = (a,b) => a + Math.floor(rnd()*(b-a+1));

  /* --- users --- */
  const demoSalt = 'lomamo-demo-salt-v4';
  const U = (id,name,username,roleId,countyId,areaIds,extra={}) => ({
    id, name, username, roleId, countyId, areaIds, departmentId:(extra.dept||ROLE(roleId).dept),
    jobTitle:(extra.job||ROLE(roleId).name), reportsTo:extra.reportsTo||null, status:'active',
    /* Reserved space for invented people: the .example TLD is RFC 2606, so a
       seeded mailbox can never belong to a real person. Telephone numbers and
       clinic numbers follow the same rule - see the demo patient seed below. */
    email:username+'@lomamo.example', phone:'', createdBy:'u-chief', approvedBy:'u-chief',
    salt: demoSalt, hash: strongHash('LOMAMO2026', demoSalt),
    created:iso(d(420)), lastLogin:null, mustChange:false, demo:true, ...extra
  });
  const users = [
    U('u-chief','Demo - Chief System Administrator','chief.admin','chief','kisumu',[],{dept:'admin',job:'Chief System Administrator'}),
    U('u-president','Demo - President','president','president','kisumu',[],{reportsTo:'u-chief'}),
    U('u-director','Demo - Country Director','director','director','kisumu',[],{reportsTo:'u-president'}),
    U('u-ksm-admin','Demo - Kisumu County Administrator','kisumu.admin','countyadmin','kisumu',[],{reportsTo:'u-director'}),
    U('u-hby-admin','Demo - Homa Bay County Administrator','homabay.admin','countyadmin','homabay',[],{reportsTo:'u-director'}),
    U('u-ksm-assist','Demo - Administrative Assistant (Kisumu)','kisumu.assistant','assistant','kisumu',[],{reportsTo:'u-ksm-admin'}),
    U('u-hby-assist','Demo - Administrative Assistant (Homa Bay)','homabay.assistant','assistant','homabay',[],{reportsTo:'u-hby-admin'}),
    U('u-coord-nyal','Demo - Coordinator, Nyalenda','coord.nyalenda','coordinator','kisumu',['nyalenda','nairobird'],{reportsTo:'u-ksm-admin'}),
    U('u-coord-omb','Demo - Coordinator, Ombeyi','coord.ombeyi','coordinator','kisumu',['ombeyi','chiga'],{reportsTo:'u-ksm-admin'}),
    U('u-coord-hby','Demo - Coordinator, Homa Bay','coord.homabay','coordinator','homabay',['makongeni','sofia','shauriyako'],{reportsTo:'u-hby-admin'}),
    U('u-cg-nyal','Demo - Caregiver, Nyalenda','caregiver.nyalenda','caregiver','kisumu',['nyalenda'],{reportsTo:'u-coord-nyal'}),
    U('u-cg-many','Demo - Caregiver, Manyatta','caregiver.manyatta','caregiver','kisumu',['manyatta'],{reportsTo:'u-coord-nyal'}),
    U('u-cg-omb','Demo - Caregiver, Ombeyi','caregiver.ombeyi','caregiver','kisumu',['ombeyi'],{reportsTo:'u-coord-omb'}),
    U('u-cg-ahero','Demo - Caregiver, Ahero','caregiver.ahero','caregiver','kisumu',['ahero'],{reportsTo:'u-coord-omb'}),
    U('u-cg-hby','Demo - Caregiver, Makongeni','caregiver.makongeni','caregiver','homabay',['makongeni'],{reportsTo:'u-coord-hby'}),
    U('u-mcm','Demo - Medical Case Manager','mcm.kisumu','mcm','kisumu',[],{reportsTo:'u-director'}),
    U('u-nurse','Demo - Nurse / Clinical Officer','nurse.kisumu','nurse','kisumu',[],{reportsTo:'u-mcm'}),
    U('u-lia-ksm','Demo - Hospital Focal Person (Kisumu)','liaison.kisumu','liaison','kisumu',[],{reportsTo:'u-mcm'}),
    U('u-lia-hby','Demo - Hospital Focal Person (Homa Bay)','liaison.homabay','liaison','homabay',[],{reportsTo:'u-mcm'}),
    U('u-media','Demo - Media & Governance Head','media.head','mediahead','kisumu',[],{reportsTo:'u-director'}),
    U('u-fin-ksm','Demo - Finance Officer (Kisumu)','finance.kisumu','finance','kisumu',[],{reportsTo:'u-ksm-admin'}),
    U('u-fin-hby','Demo - Finance Officer (Homa Bay)','finance.homabay','finance','homabay',[],{reportsTo:'u-hby-admin'}),
    U('u-proc','Demo - Procurement Officer','procurement','procurement','kisumu',[],{reportsTo:'u-fin-ksm'}),
    U('u-me','Demo - M&E / Data Officer','me.kisumu','me','kisumu',[],{reportsTo:'u-director'}),
    U('u-audit','Demo - Auditor','auditor','auditor','kisumu',[],{reportsTo:'u-director'}),
    U('u-hr','Demo - HR Officer','hr.officer','hr','kisumu',[],{reportsTo:'u-director'}),
    U('u-welfare','Demo - Staff Welfare Officer','welfare.officer','welfare','kisumu',[],{reportsTo:'u-hr'}),
    U('u-vehicle','Demo - Vehicle & Transport Officer','vehicle.officer','vehicle','kisumu',[],{reportsTo:'u-ksm-admin'}),
    U('u-pr','Demo - Public Relations Officer','pr.officer','pr','kisumu',[],{reportsTo:'u-media'}),
    U('u-depthead','Demo - Head of Medical Department','depthead.medical','depthead','kisumu',[],{reportsTo:'u-director'}),
    U('u-ccc-jootrh','Demo - CCC Clinician, JOOTRH (Kisumu)','ccc.jootrh','ccc.clinician','kisumu',[],{facility:'Demo County Referral Hospital',facilityType:'CCC / Referral Hospital',cadre:'Clinical Officer'}),
    U('u-gov-ksm','Demo - County Health Partnership Desk (Kisumu)','gov.kisumu','gov.partner','kisumu',[],{agency:'County Government of Kisumu · Dept. of Medical Services, Public Health & Sanitation'}),
    U('u-intl-med','Demo - International Medical Team Lead','intl.medical','intl.medical','kisumu',[],{specialty:'Infectious Disease & Nutritional Recovery PDCA'})
  ];

  /* --- referral entities --- */
  const referralEntities = [
    { id:'rf1', name:'Demo County Referral Hospital', type:'Hospital', county:'Kisumu', location:'Kisumu Central', status:'verified', active:true, added:'2026-01-12', notes:'Synthetic demo entity.' },
    { id:'rf2', name:'Demo CCC - Nyalenda Health Centre', type:'CCC', county:'Kisumu', location:'Nyalenda', status:'verified', active:true, added:'2026-01-12' },
    { id:'rf3', name:'Demo PSC - Manyatta', type:'PSC', county:'Kisumu', location:'Manyatta', status:'verified', active:true, added:'2026-02-03' },
    { id:'rf4', name:'Demo Sub-County Hospital (Homa Bay)', type:'Hospital', county:'Homa Bay', location:'Homa Bay Town', status:'verified', active:true, added:'2026-01-20' },
    { id:'rf5', name:'Unverified Community Clinic', type:'CCC', county:'Kisumu', location:'Ahero', status:'pending', active:true, added:'2026-09-02', notes:'Awaiting verification by Medical Case Manager.' }
  ];

  /* --- patients --- */
  const firstM=['Demo','Sample','Test','Example'], given=['Patient A','Patient B','Patient C','Patient D','Patient E','Patient F','Patient G','Patient H','Patient I','Patient J','Patient K','Patient L'];
  const areas = COUNTIES.flatMap(c=>c.areas.map(a=>({...a, countyId:c.id})));
  const cgByArea = { nyalenda:'u-cg-nyal', manyatta:'u-cg-many', ombeyi:'u-cg-omb', ahero:'u-cg-ahero', makongeni:'u-cg-hby' };
  const patients=[], visits=[], pdcas=[], requests=[], transactions=[], documents=[], supportIssues=[], encounters=[], concerns=[];

  for(let i=1;i<=46;i++){
    const area = i<=32 ? areas[int(0,6)] : areas[7+int(0,2)];
    const caregiver = cgByArea[area.id] || (area.countyId==='homabay'?'u-cg-hby':'u-cg-nyal');
    const intakeDays = int(4, 400);
    const intake = d(intakeDays);
    let status;
    if(intakeDays>180 && rnd()<.42) status='discharged';
    else if(intakeDays>110 && rnd()<.18) status='extension';
    else status='active';
    const referral = pick(referralEntities.filter(r=>r.status==='verified'));
    const pid = 'p'+String(i).padStart(3,'0');
    const name = 'DEMO Patient '+String(i).padStart(3,'0');
    patients.push({
      id:pid, code:'LOM-'+area.id.slice(0,3).toUpperCase()+'-'+String(1000+i),
      name, sex: rnd()>.45?'F':'M', age:int(2,74), dob:null,
      countyId:area.countyId, areaId:area.id, caregiverId:caregiver,
      status, intake:iso(intake), discharge: status==='discharged'?iso(d(int(intakeDays>60?intakeDays-30:1, intakeDays>30?intakeDays-1:1))) : null,
      referralEntityId: referral.id,
      /* Clinic numbers and telephone numbers for invented patients are drawn
         from bands the demo estate owns: CCC/9xxxx and 0700 1xxxxx. A random
         real-format number could belong to a real patient or a real subscriber,
         and publishing it beside a diagnosis would be that person's breach. */
      ccc: 'CCC/9'+int(1000,9999),
      phone:'0700'+String(100000+int(0,99998)).padStart(6,'0'),
      clinical:{ diagnosis: pick(['HIV - on ART','HIV - newly initiated','TB - treatment','Hypertension','Diabetes','Malnutrition (child)','Post-CVA care']),
        art: rnd()>.35, weightKg: int(9,82), heightCm:int(70,178), adherence: pick(['Good','Fair','Poor','Not recorded']),
        allergies: pick([[], [], ['Penicillin'], ['Sulfa'], ['NSAID'], ['Penicillin','Sulfa']]),
        allergyClasses: [] },
      household:{ children:int(0,5), orphansSupported:int(0,3), guardian:pick(['Both parents','Single parent','Grandparent','Sibling']) },
      consent:(()=>{ const status=pick(['granted','granted','pending','withdrawn','not_requested']); const scope=pick(['internal','storytelling','donor_report']);
        return { status, scope, date:'2026-08-'+String(int(10,28)),
          purposes:{ care:true, internal:status==='granted', photography:scope!=='internal'&&status==='granted',
            storytelling:scope==='storytelling'&&status==='granted', donor:scope!=='internal'&&status==='granted', research:false } }; })(),
      faithRecord: rnd()>.72 ? 'reported' : 'not_recorded',
      docsVerified: rnd()>.25,
      flags: [], pdcaStage: pick(['Plan','Do','Check','Act']),
      demo:true
    });
    const nVisits = int(2,9);
    for(let v=0; v<nVisits; v++){
      const vd = d(int(1, Math.max(6,intakeDays-2)));
      visits.push({ id:'v'+pid+'-'+v, patientId:pid, caregiverId:caregiver, date:iso(vd), type:pick(['home','home','home','clinical']),
        weight: int(9,80), bp: int(90,150)+'/'+int(55,95),
        outcome: pick(['seen','seen','seen','not_found','seen']),
        notes: pick(['Adherence discussed; foodbag issued.','Patient weak, referred for review.','Missed ART refill, counselled.','Weight improving.','Household assessment completed.','Patient absent; neighbour confirmed household present.']),
        nextDue: iso(new Date(vd.getTime()+14*DAY)), demo:true });
    }
    const nP = int(0,2);
    for(let q=0;q<nP;q++) pdcas.push({ id:'pd'+pid+'-'+q, patientId:pid, stage:pick(['Plan','Do','Check','Act']),
      plan:pick(['Nutrition support & adherence review','Hospital follow-up & transport','Household hygiene improvement','Discharge readiness evaluation']),
      doNote:'', checkNote:'', actNote:'', due:iso(d(int(-10,25))), owner:caregiver, status:pick(['open','open','closed']), demo:true });

    /* support issues */
    const nS = int(0,3);
    for(let s=0;s<nS;s++) supportIssues.push({ id:'si'+pid+'-'+s, patientId:pid, item:pick(SUPPORT_ITEMS), qty:1, date:iso(d(int(1,120))), issuedBy:caregiver, demo:true });

    /* hospital requests */
    if(rnd()<.5){
      const st = pick(['submitted','approved','assigned','completed','reconciled','closed','returned','rejected']);
      const rid='hr'+pid;
      const reqDate = d(int(1,90));
      const amount = int(800, 9500);
      requests.push({ id:rid, no:'HR-2026-'+String(1000+requests.length),
        patientId:pid, countyId:area.countyId, areaId:area.id, requestedBy:caregiver, submittedAt:iso(reqDate),
        reason: pick(['ART refill and clinical review','Persistent fever - urgent review','TB sputum test follow-up','Malnutrition assessment','Post-discharge review','Laboratory investigations']),
        priority: pick(['routine','routine','urgent','critical']),
        facility: pick(['Demo County Referral Hospital','Demo Sub-County Hospital','Demo CCC - Nyalenda Health Centre']),
        preferredDate: iso(new Date(reqDate.getTime()+7*DAY)),
        transport:{ required: rnd()>.35, fare: int(300,1800), persons:int(1,3), journey:'Home ↔ Facility', approved:false },
        status: st, assignedTo: ['assigned','completed','reconciled','closed'].includes(st)?(area.countyId==='kisumu'?'u-lia-ksm':'u-lia-hby'):null,
        decision: st==='rejected'?{by:'u-mcm',at:iso(reqDate),reason:'Insufficient clinical justification - please attach recent lab results.'}:null,
        serviceCompletedAt: ['completed','reconciled','closed'].includes(st)?iso(d(int(0,10))):null,
        clinicalReport: ['completed','reconciled','closed'].includes(st)?'Reviewed by clinician. Treatment provided; follow-up in 4 weeks.':null,
        expenses: [], demo:true });
      /* transactions & receipt status */
      const exp = int(500, amount);
      const paid = ['reconciled','closed','completed'].includes(st);
      transactions.push({ id:'tx'+pid+'-h', no:'TX-'+String(4000+transactions.length), patientId:pid, requestId:rid,
        countyId:area.countyId, category:pick(['consultation','lab','medication','transport','entry']),
        amount: exp, currency:'KES', date:iso(d(int(0,20))),
        payer:'LOMAMO Foundation', payee:'Demo Facility', ref: rnd()>.15?('MPESA'+int(100000,999999)):'',
        budgetLine: pick(['medication','outpatient','patient_tpt']), receipt: rnd()>.3,
        enteredBy:'u-lia-ksm', reviewedBy: paid?'u-fin-ksm':null,
        status: paid?'reconciled':'paid', flags: [], note:'Demo transaction - synthetic.', demo:true });
    }
    /* documents */
    if(rnd()<.55) documents.push({ id:'doc'+pid, patientId:pid, kind:pick(['assessment_form','ccc_card','hospital_record','wound_photo','story_photo']),
      classification: pick(['clinical','identification','hospital','internal_photo','story_material']),
      uploadedBy:caregiver, uploadedAt:iso(d(int(1,80))), consent: patients[patients.length-1].consent.status,
      publication: pick(['not_eligible','pending_review','approved','rejected']), restricted: rnd()>.6, demo:true });
  }

  /* pending assessment pipeline (demonstrates handover states) */
  ['digital_entered','awaiting_verification','returned','approved_enrolment'].forEach((st,i)=>{
    const area = areas[i]; const pid='pp'+i;
    patients.push({ id:pid, code:'LOM-'+area.id.slice(0,3).toUpperCase()+'-P0'+i, name:'DEMO Applicant '+(i+1),
      sex:i%2?'F':'M', age:int(3,66), countyId:area.countyId, areaId:area.id, caregiverId:cgByArea[area.id]||'u-cg-nyal',
      status:st, intake:iso(d(int(1,8))), discharge:null, referralEntityId:'rf5',
      ccc:'', phone:'0700'+String(100000+int(0,99998)).padStart(6,'0'),
      clinical:{diagnosis:'Pending verification',art:false,weightKg:int(10,70),heightCm:int(80,175),adherence:'Not recorded'},
      household:{children:int(0,4),orphansSupported:0,guardian:'Single parent'},
      consent:{status:'pending',scope:'internal',date:null}, faithRecord:'not_recorded',
      docsVerified:false, flags:['duplicate_check_pending'], pdcaStage:'Plan', demo:true });
  });

  /* --- budgets (monthly, versioned) --- */
  const budgets=[];
  const perCounty = { kisumu:{food:780000,staff_tpt:240000,patient_tpt:130000,medication:360000,outpatient:210000,shif:180000,fuel:150000,maint:90000,other:110000},
                      homabay:{food:380000,staff_tpt:120000,patient_tpt:70000,medication:180000,outpatient:105000,shif:90000,fuel:80000,maint:45000,other:60000} };
  Object.entries(perCounty).forEach(([c,lines])=>{
    Object.entries(lines).forEach(([line,amount])=>{
      budgets.push({ id:'b-'+c+'-'+line, countyId:c, line, amount, period:'2026-10', version:1, effectiveFrom:'2026-10-01', setBy:'u-ksm-admin', demo:true });
    });
  });

  /* --- targets (versioned, sourced from Mid-Year baseline where noted) --- */
  const targets = [
    { id:'t1', countyId:'kisumu', indicator:'active_caseload', period:'2026-10', value:180, version:1, note:'October monthly target', setBy:'u-ksm-admin', setAt:'2026-09-28' },
    { id:'t2', countyId:'kisumu', indicator:'new_assessed', period:'2026-10', value:22, version:1, note:'October monthly target', setBy:'u-ksm-admin', setAt:'2026-09-28' },
    { id:'t3', countyId:'kisumu', indicator:'discharged_month', period:'2026-10', value:18, version:1, note:'October monthly target', setBy:'u-ksm-admin', setAt:'2026-09-28' },
    { id:'t4', countyId:'kisumu', indicator:'active_caseload', period:'2026-H1', value:315, version:1, note:'BASELINE - Mid-Year Report Jan-Jun 2026 (315 discharged H1)', setBy:'u-me', setAt:'2026-07-15' },
    { id:'t5', countyId:'homabay', indicator:'new_assessed', period:'2026-10', value:8, version:1, note:'October monthly target', setBy:'u-hby-admin', setAt:'2026-09-29' }
  ];

  /* --- HR / leave (from STAFF_LEAVE_MANAGER_SPEC); no real identities ---
     One staff list. The office staff below carry demonstration names. The
     field roster is the one supplied in the leave specification, with the
     placeholder names kept exactly as they were given, so nobody is invented. */
  const employees = users.filter(u=>u.id!=='u-chief').slice(0,14).map((u,i)=>({
    id:'emp'+(i+1), userId:u.id, name:u.name, dept:u.departmentId, county:u.countyId,
    role:u.jobTitle, contract:'permanent', start:'2024-0'+((i%9)+1)+'-01',
    annualEntitlement: u.roleId==='chief'?0:15, casualEntitlement:3, leaveTaken:0, status:'active',
    staffType:'permanent', staffGroup:'Office staff', leaveGroup:'office', canLeaveMonday:false, demo:true
  }));
  /* Field roster reprogrammed from the Administration's own staff list
     (ministry area coordinators, assisting caregivers, department heads and
     the Monday management-meeting rule). Names are the ones supplied by the
     Administration; seats that Administration has not yet named carry a seat
     label rather than an invented person, and are flagged `unconfirmed`. */
  const FIELD_ROSTER = [
    { id:'ls-daniel',     name:'Daniel Naphtaly Ombija',  group:'Ministry Area Coordinator', type:'permanent', monday:false, username:'coord.nyalenda',
      post:'Coordinator · Nyalenda — Head of Media (Kisumu)' },
    { id:'ls-cathy',      name:'Catherine Awuor Obila',   group:'Ministry Area Coordinator', type:'permanent', monday:false, username:'coord.nairobird',
      post:'Coordinator · Nairobi Road — In charge of Public Relations' },
    { id:'ls-washington', name:'Washington Ayub Odero',   group:'Ministry Area Coordinator', type:'permanent', monday:false, username:'coord.manyatta',
      post:'Coordinator · Manyatta — Head of Hospital Department' },
    { id:'ls-allan',      name:'Allan Dennis Wayodi',     group:'Ministry Area Coordinator', type:'permanent', monday:false, username:'coord.ombeyi',
      post:'Coordinator · Ombeyi — Head of Procurement — Head of Vehicle & Transport' },
    { id:'ls-john',       name:'John Shikuku Omolo',      group:'Ministry Area Coordinator', type:'permanent', monday:false, username:'coord.nyahera',
      post:'Coordinator · Nyahera — Deputy, Procurement & Vehicle/Transport (driver)' },
    { id:'ls-evans',      name:'Evans Omondi Odiyo',      group:'Ministry Area Coordinator', type:'permanent', monday:false, username:'caregiver.ombeyi',
      post:'Coordinator · Ahero — Assists Ombeyi (driver)' },
    { id:'ls-wickliff',   name:'Wycliff Otieno',          group:'Hospital Ministry',        type:'permanent', monday:true,  username:'coord.chiga',
      post:'Coordinator · Chiga — Hospital ministry duties; may leave on a Monday to assist patients at the hospital' },
    { id:'ls-ashar',      name:'Ashar Anyango Omondi',    group:'Supporting Caregiver',     type:'permanent', monday:false, username:'caregiver.nairobird',
      post:'Assists Nairobi Road & Nyahera — Head of Staff Welfare' },
    { id:'ls-susan',      name:'Susan Mildred',           group:'Community Health Partner', type:'permanent', monday:false, username:'chw.nyalenda',
      post:'Nyalenda CHP — Assists Friday hospital visits; stands in for the Head of Hospital Department' },
    { id:'ls-staff8',     name:'Office staff (seat to be confirmed)', group:'Office staff', type:'permanent', monday:false, placeholder:true, unconfirmed:true },
    { id:'ls-staff9',     name:'Office staff (seat to be confirmed)', group:'Office staff', type:'permanent', monday:false, placeholder:true, unconfirmed:true },
    { id:'ls-staff10',    name:'Office staff (seat to be confirmed)', group:'Office staff', type:'permanent', monday:false, placeholder:true, unconfirmed:true },
    { id:'ls-staff11',    name:'Office staff (seat to be confirmed)', group:'Office staff', type:'permanent', monday:false, placeholder:true, unconfirmed:true },
    /* Casual workers / Community Health Volunteers registered by the concerned
       admin office. They cover Manyatta and any ministry location short of a
       permanent post on the day (rule R4). */
    { id:'ls-casual1',    name:'Iscah Abuto',              group:'Casual cover / CHV', type:'casual', monday:false, post:'Manyatta pool' },
    { id:'ls-casual2',    name:'Millicent Achieng Otieno', group:'Casual cover / CHV', type:'casual', monday:false, post:'Manyatta pool' },
    { id:'ls-casual3',    name:'Caroline (casual caregiver)', group:'Casual cover / CHV', type:'casual', monday:false, post:'Manyatta pool', surnamePending:true },
    { id:'ls-casual4',    name:'Maureen (casual caregiver)',  group:'Casual cover / CHV', type:'casual', monday:false, post:'Manyatta pool', surnamePending:true }
  ];
  /* One staff list: a roster record that is linked to an account replaces the
     generic office record for that account, so nobody appears twice. */
  const linked=new Set(FIELD_ROSTER.map(r=>(users.find(u=>u.username===r.username)||{}).id).filter(Boolean));
  for(let i=employees.length-1;i>=0;i--){ if(linked.has(employees[i].userId)) employees.splice(i,1); }
  FIELD_ROSTER.forEach((r,i)=>employees.push({
    id:r.id,
    /* The link is by username, not by a hard-coded id, so the same roster works
       in the demonstration seed and in the official installation. */
    userId:(users.find(u=>u.username===r.username)||{}).id||null,
    username:r.username||null,
    name:r.name, dept:'ministry', county:'kisumu',
    role:r.post||r.group, contract:r.type==='casual'?'casual':'permanent', start:'2023-0'+((i%9)+1)+'-15',
    annualEntitlement:15, casualEntitlement:3, leaveTaken:0, status:'active',
    staffType:r.type, staffGroup:r.group, leaveGroup:r.id==='ls-wickliff'?'hospital':(r.type==='casual'?'casual':'field'),
    canLeaveMonday:r.monday, placeholder:!!r.placeholder, unconfirmed:!!r.unconfirmed,
    surnamePending:!!r.surnamePending, post:r.post||'', demo:true
  }));
  const leaveRequests=[
    { id:'lv1', employeeId:'emp2', type:'annual', from:'2026-10-26', to:'2026-10-30', days:5, status:'pending', reason:'Family commitment', appliedAt:'2026-10-12', demo:true },
    { id:'lv2', employeeId:'emp5', type:'casual', from:'2026-10-21', to:'2026-10-21', days:1, status:'pending', reason:'Medical appointment', appliedAt:'2026-10-15', demo:true },
    { id:'lv3', employeeId:'emp3', type:'annual', from:'2026-11-02', to:'2026-11-13', days:10, status:'approved', reason:'Annual leave', appliedAt:'2026-09-30', decidedBy:'u-hr', demo:true }
  ];

  /* --- Welfare --- */
  const welfareActs=[
    { id:'w1', title:'Bereavement support - staff family', type:'Funeral', openedAt:'2026-09-14', targetAmount:120000, perHead:1000, deadline:'2026-09-30', status:'open', demo:true },
    { id:'w2', title:'Baby shower - staff member', type:'Baby shower', openedAt:'2026-08-03', targetAmount:45000, perHead:500, deadline:'2026-08-20', status:'closed', demo:true }
  ];
  const contributions=[
    { id:'wc1', activityId:'w1', employeeId:'emp1', amount:1000, date:'2026-09-16', status:'received', demo:true },
    { id:'wc2', activityId:'w1', employeeId:'emp2', amount:1000, date:'2026-09-17', status:'received', demo:true },
    { id:'wc3', activityId:'w1', employeeId:'emp3', amount:0, date:null, status:'outstanding', demo:true },
    { id:'wc4', activityId:'w2', employeeId:'emp1', amount:500, date:'2026-08-06', status:'received', demo:true }
  ];

  /* --- Vehicles --- */
  const vehicles=[
    { id:'veh1', reg:'KDX 001A', model:'Toyota Hiace (ambulance-fit)', countyId:'kisumu', status:'active', driver:'Demo Driver 1',
      insuranceExpiry:'2027-03-14', inspection:'2026-12-01', odometer:184320, nextService:185000, demo:true },
    { id:'veh2', reg:'KDG 442B', model:'Toyota Land Cruiser', countyId:'kisumu', status:'maintenance', driver:'Demo Driver 2',
      insuranceExpiry:'2026-11-20', inspection:'2026-11-15', odometer:241880, nextService:242000, demo:true },
    { id:'veh3', reg:'KCC 887C', model:'Nissan Vanette', countyId:'homabay', status:'active', driver:'Demo Driver 3',
      insuranceExpiry:'2027-01-09', inspection:'2027-01-05', odometer:97640, nextService:98000, demo:true }
  ];
  const trips=[
    { id:'tr1', vehicleId:'veh1', countyId:'kisumu', date:iso(d(2)), purpose:'Patient transport - hospital', requestId:'hrp001', km:42, fuel:2100, driver:'Demo Driver 1', demo:true },
    { id:'tr2', vehicleId:'veh3', countyId:'homabay', date:iso(d(4)), purpose:'Field supervision - Makongeni', km:88, fuel:3900, driver:'Demo Driver 3', demo:true }
  ];

  /* --- concerns (patient attention engine) --- */
  patients.forEach((p,i)=>{
    if(i%5===0) concerns.push({ id:'cn'+p.id, patientId:p.id, type:'weight_decline', level:'clinical', opened:iso(d(int(1,20))),
      detail:'Recorded weight decreased across two consecutive visits.', by:p.caregiverId, status:'open', demo:true });
    if(i%7===0) concerns.push({ id:'cn2'+p.id, patientId:p.id, type:'overdue_visit', level:'administrative', opened:iso(d(int(1,30))),
      detail:'Next home visit overdue by more than 14 days.', by:'system', status:'open', demo:true });
    if(i%11===0) concerns.push({ id:'cn3'+p.id, patientId:p.id, type:'missed_followup', level:'clinical', opened:iso(d(int(1,25))),
      detail:'Hospital follow-up not evidenced after referral approval.', by:'u-mcm', status:'open', demo:true });
  });

  /* --- structured conditions (synthetic) --------------------------------
     Recorded as data, never inferred. Every row carries who recorded it,
     its certainty, and whether it is clinically confirmed. */
  const CONDITION_SET = [
    { key:'hiv',        label:'HIV',                        sensitive:true,  cls:'Infectious' },
    { key:'tb',         label:'Tuberculosis',               sensitive:true,  cls:'Infectious' },
    { key:'hiv_tb',     label:'HIV and TB co-infection',    sensitive:true,  cls:'Infectious' },
    { key:'cancer',     label:'Cancer (documented type)',   sensitive:true,  cls:'Non-communicable' },
    { key:'wound',      label:'Wound care',                 sensitive:false, cls:'Surgical' },
    { key:'crypto',     label:'Cryptococcal meningitis',    sensitive:true,  cls:'Infectious' },
    { key:'diarrhoea',  label:'Diarrhoeal illness',         sensitive:false, cls:'Infectious' },
    { key:'malaria',    label:'Malaria',                    sensitive:false, cls:'Infectious' },
    { key:'pneumonia',  label:'Pneumonia',                  sensitive:false, cls:'Respiratory' },
    { key:'malnutrition', label:'Malnutrition',             sensitive:false, cls:'Nutrition' },
    { key:'hypertension', label:'Hypertension',             sensitive:false, cls:'Non-communicable' },
    { key:'diabetes',   label:'Diabetes mellitus',          sensitive:false, cls:'Non-communicable' }
  ];
  const COND_STATUS = ['suspected','documented','confirmed','historical','resolved','follow_up'];
  const patientConditions = [];
  patients.forEach((p,i)=>{
    const n = 1 + (i % 3 === 0 ? 1 : 0);
    for(let c=0;c<n;c++){
      const def = CONDITION_SET[(i*3+c) % CONDITION_SET.length];
      const status = COND_STATUS[(i+c) % COND_STATUS.length];
      patientConditions.push({
        id:'pc-'+p.id+'-'+c, patientId:p.id, key:def.key, label:def.label, cls:def.cls,
        status, sensitive:def.sensitive,
        recordedBy: status==='suspected' ? p.caregiverId : 'u-nurse',
        recordedAt: iso(d(int(30, 365)) ),
        confirmedBy: (status==='confirmed'||status==='documented') ? 'u-mcm' : null,
        confirmedAt: (status==='confirmed'||status==='documented') ? iso(d(int(2,60))) : null,
        note:'Synthetic demonstration condition, not a clinical record.', demo:true
      });
    }
  });

  /* --- care centre (synthetic) ---------------------------------------- */
  const careBeds = Array.from({length:12},(_,i)=>({
    id:'bed-'+String(i+1).padStart(2,'0'), label:'B'+String(i+1).padStart(2,'0'),
    room:'Room '+(1+Math.floor(i/4)), type: i<8?'Residential':'Respite', status: i<7?'occupied':'available', demo:true
  }));
  const careResidents = patients.slice(0,7).map((p,i)=>({
    id:'res-'+(i+1), patientId:p.id, bedId:'bed-'+String(i+1).padStart(2,'0'),
    admittedAt: iso(d(10+i*9)), status:'resident', keyWorker:p.caregiverId,
    mobility: ['Independent','Assisted','Bed-bound'][i%3],
    diet: ['Normal','Soft','Diabetic'][i%3],
    nextReview: iso(d(-(3+(i*4)))), demo:true
  }));
  const careLogs = [];
  careResidents.forEach((r,i)=>{
    ['Morning','Afternoon','Evening'].forEach((shift,si)=>{
      careLogs.push({ id:`cl-${r.id}-${si}`, residentId:r.id, bedId:r.bedId, shift,
        at: iso(d(1+ (i%2))), by: r.keyWorker,
        eaten: ['All','Most','Half','Refused'][ (i+si)%4 ], fluids:'Adequate',
        hygiene: si===0?'Assisted wash completed':'Checked',
        mood: ['Settled','Quiet','Anxious','Cheerful'][(i+si)%4],
        note: si===0?'Synthetic daily care entry.':'' , demo:true });
    });
  });
  const careIncidents = [
    { id:'ci1', residentId:'res-2', bedId:'bed-02', type:'Fall', severity:'moderate', at:iso(d(6)),
      reportedBy:'u-nurse', status:'closed', actions:'Assessed, no injury. Bed rails reviewed.',
      restricted:true, demo:true },
    { id:'ci2', residentId:'res-5', bedId:'bed-05', type:'Medication delay', severity:'low', at:iso(d(2)),
      reportedBy:'u-mcm', status:'open', actions:'Dose given 40 minutes late. Pharmacy notified.',
      restricted:true, demo:true }
  ];

  /* --- delegations (synthetic) ---------------------------------------- */
  const delegations = [
    { id:'dlg1', fromId:'u-ksm-admin', fromName:'Demo - Kisumu County Administrator', delegateId:'u-ksm-assist',
      caps:['patient.enrol','patient.verify'], from: iso(d(4)), to: iso(d(-8)), status:'active',
      reason:'Cover during county office travel', issuedBy:'u-director', issuedAt: iso(d(5)), demo:true },
    { id:'dlg2', fromId:'u-chief', fromName:'Demo - Chief System Administrator', delegateId:'u-media',
      caps:['system.backup'], from: iso(d(30)), to: iso(d(2)), status:'expired',
      reason:'Quarterly backup cover', issuedBy:'u-chief', issuedAt: iso(d(32)), demo:true }
  ];

  /* --- care plans and the 30-day review cycle (synthetic) ------------- */
  patients.forEach((p,i)=>{
    const days = Math.floor((T - new Date(p.intake))/DAY);
    const expected = [60,75,90,120,180][i%5];
    const hasPlan = i % 7 !== 0;              /* some patients deliberately lack one */
    if(hasPlan){
      p.carePlan = {
        needs: ['Nutrition and household food security','Adherence support and clinic escort',
                'Wound care and hygiene','Psychosocial support and school re-entry',
                'Transport to hospital appointments'][i%5],
        objectives: ['Stable weight across three consecutive visits','No missed clinical appointment in the quarter',
                     'Caregiver able to describe the treatment plan','Household able to sustain care without support'][i%4],
        interventions: ['Fortnightly home visit','Nutrition support','Hospital escort','Wound dressing','Household counselling'][i%5],
        responsible: p.caregiverId,
        expectedDays: expected,
        rationale: 'Estimated from presenting condition, household capacity and clinical advice at assessment.',
        reviewDate: iso(d(-(7+(i%20)))),
        version: 1, createdBy: p.caregiverId, createdAt: p.intake,
        approvedBy: 'u-mcm', approvedAt: iso(new Date(new Date(p.intake).getTime()+3*DAY))
      };
    }
    const reviews = Math.min(12, Math.floor(days/30));
    const completed = Math.max(0, reviews - (i%4===0?2:i%5===0?1:0));
    for(let k=1;k<=reviews;k++){
      const due = new Date(new Date(p.intake).getTime()+k*30*DAY);
      const done = k<=completed;
      pdcas.push({ id:'rv-'+p.id+'-'+k, patientId:p.id, kind:'review', dueDay:k*30,
        stage:'Check', plan:'Scheduled 30-day care plan review',
        due:iso(due), completedAt: done? iso(new Date(due.getTime()+ (i%3)*DAY)) : null,
        owner:p.caregiverId, reviewedBy: done?'u-mcm':null,
        status: done?'closed': (due < T ? 'open':'open'),
        overdue: !done && due < T, demo:true });
    }
  });

  /* --- monthly work plans (synthetic) --------------------------------- */
  const periodOf = dt => dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0');
  const workPlans = [];
  const supervisors = { 'u-cg-nyal':'u-ksm-admin', 'u-cg-many':'u-coord-nyal', 'u-mcm':'u-director', 'u-ksm-admin':'u-director' };
  const planSeeds = [
    { for:'u-cg-nyal', focus:'Every enrolled household visited at least twice.',
      objectives:[{text:'Visit all 38 households in Nyalenda twice',measure:'Visit records per household',target:'76 visits'},
                  {text:'Complete every overdue 30-day review',measure:'Reviews closed by their due date',target:'100%'}],
      support:'Two extra litres of fuel each week.', risks:'Flooding on the lakeside road in heavy rain.', status:'approved' },
    { for:'u-mcm', focus:'Clear the hospital review backlog.',
      objectives:[{text:'Review every hospital request older than seven days',measure:'Requests awaiting review',target:'0'},
                  {text:'Close the open safeguarding incident',measure:'Incidents with a written resolution',target:'1'}],
      support:'A second clinical officer on Wednesdays.', risks:'', status:'returned',
      decisionNote:'The second objective belongs to the care centre lead, not clinical case management. Replace it with a clinical measure.' },
    { for:'u-ksm-admin', focus:'Close the quarter with a verified account register.',
      objectives:[{text:'Verify every staff account against the organogram',measure:'Accounts verified',target:'30 of 30'},
                  {text:'Resolve every pending account request within five days',measure:'Requests older than five days',target:'0'}],
      support:'', risks:'', status:'submitted' }
  ];
  planSeeds.forEach((p,i)=>{
    const submitted = d(24 - i*5);
    workPlans.push({ id:'wp-'+(i+1), userId:p.for, period:periodOf(T), focus:p.focus,
      objectives:p.objectives, support:p.support, risks:p.risks,
      supervisorId:supervisors[p.for]||'u-director', status:p.status, version:p.status==='returned'?2:1,
      submittedAt:iso(submitted), late:false, decisionNote:p.decisionNote||null,
      approvedAt: p.status==='approved'? iso(d(20-i*4)) : null, approvedBy: p.status==='approved'?'u-director':null,
      history:[{at:iso(submitted),by:p.for,action:'submitted',version:1}], demo:true });
  });

  /* --- public publications (synthetic, clearly labelled) -------------- */
  const publications = [
    { id:'pub1', title:'LOMAMO opens a second care centre in Kisumu', category:'news', format:'article',
      summary:'The new residence adds twelve beds for patients who have no safe place to recover after hospital treatment.',
      body:'A second residence has opened in Kisumu. It provides twelve beds, round-the-clock care and a kitchen.\n\nThe residence is managed by the Medical Case Manager and supported by the care team. Admission is by referral from the hospital liaison team.',
      status:'published', public:true, publishedAt: iso(d(9)), createdBy:'u-media', createdAt: iso(d(12)),
      versions:[{at:iso(d(9)),by:'u-media',action:'published'}], demo:true },
    { id:'pub2', title:'The Upper Room: a discipleship conversation', category:'audio', format:'podcast', duration:'21 min',
      summary:'A conversation recorded at the Homestay about faith, rest and caring for people at the end of life.',
      body:'Episode notes: recorded at the Homestay. This is a demonstration entry in the portal and not a real recording.',
      status:'published', public:true, publishedAt: iso(d(16)), createdBy:'u-media', createdAt: iso(d(20)),
      versions:[{at:iso(d(16)),by:'u-media',action:'published'}], demo:true },
    { id:'pub3', title:'A household back on its feet', category:'story', format:'article',
      summary:'How a grandmother, two grandchildren and a fortnightly visit changed a household.',
      body:'This story is illustrative. In production every published story carries a recorded storytelling consent, verified by the Media and Information Governance Head, and names are changed or omitted.',
      status:'published', public:true, publishedAt: iso(d(23)), createdBy:'u-media', createdAt: iso(d(28)),
      versions:[{at:iso(d(23)),by:'u-media',action:'published'}], demo:true },
    { id:'pub4', title:'October programme update', category:'programme', format:'article',
      summary:'Caseload, discharges and hospital coordination for the month, in aggregate.',
      body:'Aggregate update only. No patient is identifiable. Figures are drawn from the Monday management reports.',
      status:'approved', public:true, publishedAt:null, createdBy:'u-media', createdAt: iso(d(3)),
      versions:[{at:iso(d(2)),by:'u-director',action:'approved'}], demo:true },
    { id:'pub5', title:'World AIDS Day: a message from the Foundation', category:'announcement', format:'video', duration:'1 min 40 s',
      summary:'A short message ahead of the county commemorations.',
      body:'', status:'review', public:true, publishedAt:null, createdBy:'u-pr', createdAt: iso(d(1)),
      versions:[], demo:true },
    { id:'pub6', title:'Frequently asked questions for new caregivers', category:'news', format:'article',
      summary:'Practical answers about paperwork, transport and reporting.',
      body:'Draft, not published.', status:'draft', public:false, publishedAt:null, createdBy:'u-media', createdAt: iso(d(0)),
      versions:[], demo:true }
  ];

  /* --- knowledge base --- */
  const kbDocs=[
    { id:'kb1', title:'LOMAMO Constitution & Bylaws (for review, 22 Jul 2025)', type:'Policy', classification:'Internal organisational', version:'2025.07', owner:'Executive', updated:'2025-07-22', indexed:true },
    { id:'kb2', title:'KCO Organogram with Sub-Counties', type:'Organisational', classification:'Internal organisational', version:'2026', owner:'Administration', updated:'2026-01-01', indexed:true },
    { id:'kb3', title:'Patient Confidentiality & Ethical Storytelling Policy', type:'Policy', classification:'Restricted departmental', version:'PROPOSED v1.0', owner:'Media & Information Governance', updated:'2026-10-18', indexed:true, proposed:true },
    { id:'kb4', title:'Staff Leave Management Specification', type:'Procedure', classification:'Internal organisational', version:'v1.0', owner:'Human Resources', updated:'2026-06-01', indexed:true },
    { id:'kb5', title:'Omaha System - Problem Classification Scheme reference', type:'Reference', classification:'Internal organisational', version:'2019', owner:'Medical', updated:'2026-02-01', indexed:true },
    { id:'kb6', title:'PDCA formulation - HIV/AIDS & TB (example)', type:'Guideline', classification:'Internal organisational', version:'example', owner:'Medical', updated:'2026-02-01', indexed:true },
    { id:'kb7', title:'Mid-Year Report Jan-Jun 2026 (REVIEWED)', type:'Report baseline', classification:'Donor-facing (approved)', version:'final', owner:'M&E', updated:'2026-07-15', indexed:true }
  ];

  /* --- digitised paper forms (synthetic) --------------------------------
     The records carry the fields of the six supplied forms. Values are
     demonstration values, never a real person's clinical history. */
  const demoPatient = i => patients[i % patients.length];
  const formRecords = [
    { id:'frm-demo-1', kind:'patient_assessment', code:'LMMK 001', title:'LOMAMO Patient Assessment Form',
      patientId:demoPatient(0).id, patientName:demoPatient(0).name, countyId:demoPatient(0).countyId, areaId:demoPatient(0).areaId,
      status:'verified', visitDate:iso(d(18)), enteredBy:'u-ksm-assist', createdAt:iso(d(19)), enteredAt:iso(d(19)),
      submittedAt:iso(d(19)), verifiedBy:'u-mcm', verifiedAt:iso(d(18)), version:2, demo:true,
      data:{ assessmentDate:iso(d(18)), intakeDate:iso(d(18)), name:demoPatient(0).name, sex:'F', age:38, weightKg:58, heightCm:162,
        bmi:'22.1', chiefComplaints:'Fatigue for three weeks and weight loss.', hivPositive:'Yes', cardNumber:'CCC/91234',
        clinicName:'Demo CCC - Nyalenda Health Centre', arvs:['TDL'], medicationAllergies:'No', nhif:'Yes', religion:'Christian',
        saved:'Yes', hasBible:'Yes', dataEnteredBy:'Demo - Administrative Assistant (Kisumu)' } },
    { id:'frm-demo-2', kind:'home_visit', code:'LMMK-', title:'LOMAMO Home Visit Form',
      patientId:demoPatient(1).id, patientName:demoPatient(1).name, countyId:demoPatient(1).countyId, areaId:demoPatient(1).areaId,
      status:'submitted', visitDate:iso(d(2)), enteredBy:'u-cg-nyal', createdAt:iso(d(2)), enteredAt:iso(d(2)), submittedAt:iso(d(2)), version:1, demo:true,
      data:{ visitDate:iso(d(2)), atHome:'Yes', conditionToday:'Patient reports improved appetite; no fever.', healthRisks:'No',
        referred:'No', otherDrugs:'No', arvsAsPrescribed:'Yes', tbMeds:'N/A', medicationDefault:'No',
        woundCareNeeded:'N/A', foodBagDelivered:'Normal bag', personsSharing:4, multivitaminsGiven:'Yes',
        frequencyStatus:'Same', frequencyChoice:'Every other week', hygieneQuarter:'September', fullContents:'Yes',
        extraInfo:['Bible'], caregiverRecommendation:'Continue the current food bag and review in two weeks.' } },
    { id:'frm-demo-3', kind:'minor_assessment', code:'LMMK 004', title:'LOMAMO Minor Child Assessment / Intake Form',
      patientId:demoPatient(2).id, patientName:demoPatient(2).name, countyId:demoPatient(2).countyId, areaId:demoPatient(2).areaId,
      status:'submitted', visitDate:iso(d(5)), enteredBy:'u-ksm-assist', createdAt:iso(d(6)), enteredAt:iso(d(6)), submittedAt:iso(d(6)), version:1, demo:true,
      data:{ assessmentDate:iso(d(5)), areaLocation:COUNTIES.flatMap(c=>c.areas).find(a=>a.id===demoPatient(2).areaId)?.name||'', name:demoPatient(2).name, sex:'M', age:7,
        weightKg:18, heightCm:112, birthCertificate:'Yes', parentName:'Guardian of '+demoPatient(2).name,
        chiefComplaint:'Poor appetite and repeated illness.', hivPositive:'No', tbDiagnosis:'No', medicationAllergies:'No',
        nhif:'No', saved:'No', schoolName:'Demo Primary School', schoolContact:'0700000000' } },
    { id:'frm-demo-4', kind:'hospital_outpatient', code:'LMMK 020', title:'LOMAMO Outpatient Hospital Visit Form',
      patientId:demoPatient(3).id, patientName:demoPatient(3).name, countyId:demoPatient(3).countyId, areaId:demoPatient(3).areaId,
      status:'verified', visitDate:iso(d(9)), enteredBy:'u-lia-ksm', createdAt:iso(d(9)), enteredAt:iso(d(9)), submittedAt:iso(d(9)),
      verifiedBy:'u-mcm', verifiedAt:iso(d(8)), version:1, demo:true,
      data:{ visitDate:iso(d(9)), hospital:'Demo County Referral Hospital', reason:'ART refill and review', diagnosis:'HIV - stable on ART',
        treatmentPlan:'Continue TLD; review in three months.', conditionToday:'Stable, no new complaints.', medicationGiven:'TLD 90 tablets',
        referredSpecialist:'No', issuesAtHome:'No', foodBagOnDischarge:'Normal bag', visitFrequency:'Every other week',
        investigationAmount:1200, medicationAmount:0, caregiverName:'Demo - Hospital Focal Person (Kisumu)', dateSigned:iso(d(9)) } },
    { id:'frm-demo-5', kind:'discharge', code:'DISCHARGE', title:'Patient Discharge Form',
      patientId:demoPatient(4).id, patientName:demoPatient(4).name, countyId:demoPatient(4).countyId, areaId:demoPatient(4).areaId,
      status:'draft', visitDate:iso(d(0)), enteredBy:'u-cg-nyal', createdAt:iso(d(0)), enteredAt:iso(d(0)), version:1, demo:true,
      data:{ dischargeDate:iso(d(0)), residentialArea:COUNTIES.flatMap(c=>c.areas).find(a=>a.id===demoPatient(4).areaId)?.name||'', reasonDischarge:'Completed the programme cycle and is stable.',
        completedCycle:'Yes', otherPrograms:'No', believer:'Yes', convertedDuring:'No', orphansPrevented:2 } }
  ];

  /* --- pharmacy stock and prescriptions (synthetic) -------------------- */
  const stockLots=[];
  const stockMoves=[];
  const seedStock = (countyId, itemId, name, batch, expiry, qty, supplier) => {
    const lot={ id:'lot-'+countyId+'-'+itemId+'-'+batch, countyId, itemId, name, batch, expiry, qty,
      receivedAt:iso(d(30)), receivedBy:'u-mcm', supplier, unitCost:0, demo:true };
    stockLots.push(lot);
    stockMoves.push({ id:'mv-'+lot.id, countyId, itemId, lotId:lot.id, batch, qty, kind:'receipt', at:iso(d(30)), by:'u-mcm', note:'Demonstration stock receipt', demo:true });
    return lot;
  };
  seedStock('kisumu','para500','Paracetamol 500 mg tablet','P24-118',iso(d(-260)),420,'Demo Medical Supplies');
  seedStock('kisumu','amox500','Amoxicillin 500 mg capsule','A24-042',iso(d(-120)),180,'Demo Medical Supplies');
  seedStock('kisumu','tld','Tenofovir/lamivudine/dolutegravir 300/300/50','T24-311',iso(d(-500)),540,'Demo ARV Store');
  seedStock('kisumu','rhze','Rifampicin/isoniazid/pyrazinamide/ethambutol','R24-077',iso(d(-45)),120,'Demo TB Programme');
  seedStock('kisumu','cotrim','Cotrimoxazole 960 mg tablet','C24-201',iso(d(-300)),260,'Demo Medical Supplies');
  seedStock('kisumu','ferrous','Ferrous sulphate with folic acid','F24-093',iso(d(-200)),310,'Demo Medical Supplies');
  seedStock('kisumu','ors','Oral rehydration salts sachet','O24-015',iso(d(-400)),90,'Demo Medical Supplies');
  seedStock('kisumu','saline','Normal saline 0.9 per cent 500 ml','S24-066',iso(d(-90)),22,'Demo Medical Supplies');
  seedStock('kisumu','flucon','Fluconazole 200 mg capsule','FL24-020',iso(d(-25)),18,'Demo Medical Supplies');
  seedStock('kisumu','povidone','Povidone iodine 10 per cent solution','PV24-010',iso(d(-330)),14,'Demo Medical Supplies');
  seedStock('homabay','para500','Paracetamol 500 mg tablet','P24-119',iso(d(-200)),150,'Demo Medical Supplies');
  seedStock('homabay','amox500','Amoxicillin 500 mg capsule','A24-043',iso(d(-90)),60,'Demo Medical Supplies');
  seedStock('homabay','tld','Tenofovir/lamivudine/dolutegravir 300/300/50','T24-312',iso(d(-420)),240,'Demo ARV Store');
  seedStock('homabay','cotrim','Cotrimoxazole 960 mg tablet','C24-202',iso(d(-150)),90,'Demo Medical Supplies');
  seedStock('homabay','multivit','Multivitamin tablet','M24-055',iso(d(-260)),44,'Demo Medical Supplies');

  const clinicalRx=[
    { id:'rx-demo-1', no:'RX-2026-0001', patientId:demoPatient(3).id, patientName:demoPatient(3).name,
      countyId:demoPatient(3).countyId, areaId:demoPatient(3).areaId, prescribedBy:'u-mcm', prescribedAt:iso(d(9)),
      lines:[{ itemId:'tld', name:'Tenofovir/lamivudine/dolutegravir 300/300/50', dose:'1 tablet', route:'Oral',
        frequency:'Once daily at night', days:90, qty:90, instructions:'Take at the same time each night.' }],
      reason:'Continuing antiretroviral therapy after a stable review.', alerts:[], overrideReason:'',
      status:'dispensed', dispensed:[{ lineIndex:0, itemId:'tld', lotId:'lot-kisumu-tld-T24-311', batch:'T24-311', expiry:iso(d(-500)), qty:90, at:iso(d(9)), by:'u-nurse' }],
      allDispensed:true, dispensedBy:'u-nurse', dispensedAt:iso(d(9)), demo:true },
    { id:'rx-demo-2', no:'RX-2026-0002', patientId:demoPatient(1).id, patientName:demoPatient(1).name,
      countyId:demoPatient(1).countyId, areaId:demoPatient(1).areaId, prescribedBy:'u-nurse', prescribedAt:iso(d(1)),
      lines:[{ itemId:'cotrim', name:'Cotrimoxazole 960 mg tablet', dose:'1 tablet', route:'Oral',
        frequency:'Once daily', days:30, qty:30, instructions:'Take with food.' }],
      reason:'Prophylaxis for a patient starting TB treatment.', alerts:[], overrideReason:'',
      status:'prescribed', dispensed:[], allDispensed:false, demo:true }
  ];

  /* --- Omaha care plans (synthetic) ------------------------------------ */
  const omahaPlans=[
    { id:'om-demo-1', patientId:demoPatient(3).id, patientName:demoPatient(3).name,
      countyId:demoPatient(3).countyId, areaId:demoPatient(3).areaId, title:'HIV and TB co-infection - adherence and nutrition',
      templateId:'hiv_tb', status:'active', version:1, createdBy:'u-mcm', createdAt:iso(d(21)),
      approvedBy:'u-nurse', approvedAt:iso(d(20)), updatedAt:iso(d(20)), demo:true,
      problems:[
        { code:'F11', domain:'physiological', category:'Communicable condition', problem:'Communicable or infectious condition',
          rating:{knowledge:3,behaviour:3,status:3}, ratings:[], note:'' },
        { code:'H01', domain:'behaviour', category:'Nutrition', problem:'Nutrition',
          rating:{knowledge:2,behaviour:2,status:2}, ratings:[], note:'Weight loss of six kilograms in one month at intake.' },
        { code:'H02', domain:'behaviour', category:'Medication regimen', problem:'Medication regimen',
          rating:{knowledge:4,behaviour:3,status:3}, ratings:[], note:'' }
      ],
      interventions:[
        { problemCode:'F11', category:'TP', target:'Infection prevention', detail:'Apply isolation and personal protective equipment according to the national guidance.', frequency:'Each contact', responsible:'Caregiver' },
        { problemCode:'H01', category:'TGC', target:'Diet', detail:'Instruct on energy and protein rich food and small frequent meals.', frequency:'Each visit', responsible:'Caregiver' },
        { problemCode:'H01', category:'SUR', target:'Weight', detail:'Weigh at every visit and plot the trend.', frequency:'Every visit', responsible:'Caregiver' },
        { problemCode:'H02', category:'SUR', target:'Adherence', detail:'Count tablets or ask about missed doses at every contact.', frequency:'Every week', responsible:'Caregiver' }
      ] }
  ];

  /* Normalise all seeded patient durations to 95%+ in 45-240 days and ~5% in 241-330 days (zero <45 or >330) */
  const _nowT = new Date(); _nowT.setHours(9,0,0,0);
  patients.forEach((p, idx)=>{
    const isTail = idx >= Math.ceil(patients.length * 0.95);
    const stay = isTail ? (246 + ((idx * 37) % 80)) : (45 + ((idx * 41) % 196));
    if(p.status === 'discharged'){
      p.intake = new Date(_nowT.getTime() - (stay + 14)*86400000).toISOString();
      p.discharge = new Date(_nowT.getTime() - 14*86400000).toISOString();
    } else {
      p.intake = new Date(_nowT.getTime() - stay*86400000).toISOString();
      p.discharge = null;
    }
    p.plannedDays = p.plannedDays || 180;
  });
  pdcas.forEach(x=>{
    if(x.kind === 'review' && x.dueDay){
      const pt = patients.find(q=>q.id===x.patientId);
      if(pt) x.due = new Date(new Date(pt.intake).getTime() + x.dueDay*86400000).toISOString();
    }
  });
  return { users, patients, visits, pdcas, requests, transactions, documents, supportIssues, encounters,
    concerns, referralEntities, budgets, targets, employees, leaveRequests, welfareActs, contributions,
    vehicles, trips, kbDocs, patientConditions, careBeds, careResidents, careLogs, careIncidents,
    delegations, workPlans, publications, formRecords, stockLots, stockMoves, clinicalRx, omahaPlans,
    seededAt: iso(T) };
}
