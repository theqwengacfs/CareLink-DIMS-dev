/* ============================================================
   handover_partners6.js - CareLink v6.3
   1. Delegation Plan, Scoped Reliever Access & Tri-Party Role
      Handover / Acceptance Protocol + EPPH v2.2 Leave Governance
   2. CCC / PSC / Hospital Clinician Referral Desk Console
   3. County & National Government Privacy-Safe Partnership
      Dashboard + Public / Private Portal Mode Governance
   4. International Medical Team 120+ Day PDCA Overstay Console
   ============================================================ */

const CCC_NEED_OPTIONS = [
  'Nutritional stabilisation (Foodbag 1 / Bag 2)',
  'ARV / TB medication adherence home follow-up',
  'Home wound care & dressing materials',
  'Outpatient specialist / lab investigation support',
  'SHA / SHIF health cover registration & arrears support',
  'Short-stay medical recovery respite (Homestay)',
  'Household child / orphan-prevention social protection'
];

const HANDOVER_PARTNERS = {
  ensureStore(){
    if(!DB.db) return;
    const today = todayISO().slice(0,10);

    /* 1. Delegation & Handover packets */
    DB.db.handoverPackets = DB.db.handoverPackets || [
      {
        id:'DEL-2026-01',
        kind:'leave_delegation',
        staffName:'Nyalenda Field Caregiver',
        staffRole:'Field Caregiver',
        countyId:'kisumu',
        areaId:'nyalenda',
        leaveType:'Annual Leave (21-day entitlement · >=14d notice)',
        fromDate:today,
        toDate:_hpAddDays(today, 10),
        noticeDays:16,
        relieverUsername:'coord.nyalenda',
        relieverName:'Nyalenda Area Coordinator (Scoped Reliever)',
        scopedConsoleGranted:true,
        ppeCustody:'Field Tablet #KS-T04, Weighing Scale, Rain Umbrella & Home Visit Folder handed over',
        patientHandoverRows:[
          { code:'LOM-KS-101', schedule:'Every week (Tue)', bag:'BG1', action:'3rd-visit weigh-in due + verify ARV pill count' },
          { code:'LOM-KS-104', schedule:'Every other week', bag:'BG2', action:'Post-JOOTRH MOPC clinic review check' }
        ],
        outgoingSigned:true,
        relieverAccepted:true,
        supervisorApproved:true,
        status:'active_reliever'
      },
      {
        id:'HND-2026-02',
        kind:'role_takeover',
        staffName:'Outgoing Procurement Assistant',
        staffRole:'Procurement & Store Custody',
        countyId:'kisumu',
        areaId:'',
        leaveType:'Departmental Role Transition & Acceptance Report',
        fromDate:today,
        toDate:today,
        noticeDays:30,
        relieverUsername:'procurement',
        relieverName:'Incoming Procurement Officer',
        scopedConsoleGranted:true,
        ppeCustody:'Store keys, GRN books, supplier quote binders & stock cards reconciled and signed',
        patientHandoverRows:[],
        deliverables:'Q4 Hygiene Pack tender file, Monday foodbag stock ledger & county mosquito net balance verified',
        outgoingSigned:true,
        relieverAccepted:true,
        supervisorApproved:true,
        status:'accepted_closed'
      }
    ];

    /* 2. CCC / PSC Facility Referrals (synthetic IDs strictly per v63.js: CCC/9xxxx, 07001xxxxx, 9xxxxxxx) */
    DB.db.cccReferrals = DB.db.cccReferrals || [
      {
        id:'CCC-REF-901',
        facilityName:'JOOTRH Comprehensive Care Centre (CCC)',
        referredByUsername:'ccc.jootrh',
        referredByClinician:'Demo - JOOTRH CCC Clinician',
        countyId:'kisumu',
        areaId:'nyalenda',
        patientInitials:'Beneficiary M.A. (Demo)',
        cccNumber:'CCC/90412',
        nationalId:'94120834',
        phone:'0700141208',
        referralDate:today,
        bmiAtReferral:15.8,
        needs:['Nutritional stabilisation (Foodbag 1 / Bag 2)', 'ARV / TB medication adherence home follow-up', 'SHA / SHIF health cover registration & arrears support'],
        clinicalNotes:'Discharged from JOOTRH medical ward with SAM (BMI 15.8 kg/m²) on TLD + Pyridoxine; needs home nutrition & fortnightly pill-count support.',
        status:'enrolled_active',
        lomamoCode:'LOM-KS-891',
        masterReportSummary:'Enrolled in Nyalenda Ministry Area: receiving weekly Bag 1 + multivitamins; weight up +1.6 kg after 3 home visits; MOPC review booked.',
        feedbackThread:[
          { by:'Kisumu County Admin Assistant', role:'County Admin Assistant', at:today, msg:'Hard-copy LMMK 001 completed & 4 pages scanned. Assigned to Nyalenda Caregiver pair.' },
          { by:'Demo - JOOTRH CCC Clinician', role:'CCC / PSC Hospital Clinician', at:today, msg:'Thank you — scheduled next viral-load blood draw at JOOTRH CCC in 4 weeks.' }
        ]
      },
      {
        id:'CCC-REF-902',
        facilityName:'Kisumu County Referral Hospital (KCRH) PSC',
        referredByUsername:'ccc.kcrh',
        referredByClinician:'Demo - KCRH PSC Nurse',
        countyId:'kisumu',
        areaId:'kondele',
        patientInitials:'Beneficiary J.O. (Demo)',
        cccNumber:'CCC/90588',
        nationalId:'95881204',
        phone:'0700158812',
        referralDate:today,
        bmiAtReferral:17.1,
        needs:['Home wound care & dressing materials', 'Nutritional stabilisation (Foodbag 1 / Bag 2)'],
        clinicalNotes:'Post-surgical lower-limb dressing + moderate undernutrition (BMI 17.1). Requesting LOMAMO Kondele home nursing & nutrition review.',
        status:'awaiting_assessment',
        lomamoCode:'Pending Assessment',
        masterReportSummary:'Queued for Kondele Wednesday home assessment visit by Caregiver pair + Nurse.',
        feedbackThread:[
          { by:'Demo - KCRH PSC Nurse', role:'CCC / PSC Hospital Clinician', at:today, msg:'Patient lives near Kondele market; discharged with 5 days of sterile gauze.' }
        ]
      },
      {
        id:'CCC-REF-903',
        facilityName:'Homa Bay County Teaching & Referral Hospital CCC',
        referredByUsername:'ccc.hbctrh',
        referredByClinician:'Demo - Homa Bay CCC Clinician',
        countyId:'homabay',
        areaId:'homabay_town',
        patientInitials:'Beneficiary P.N. (Demo)',
        cccNumber:'CCC/90731',
        nationalId:'97310492',
        phone:'0700173104',
        referralDate:today,
        bmiAtReferral:16.4,
        needs:['Nutritional stabilisation (Foodbag 1 / Bag 2)', 'Household child / orphan-prevention social protection'],
        clinicalNotes:'Single mother of 3 on second-line ART recovering from pulmonary TB; BMI 16.4 kg/m².',
        status:'enrolled_active',
        lomamoCode:'LOM-HB-412',
        masterReportSummary:'Active in Homa Bay Town caseload: Bag 2 family nutrition + pyridoxine verified; all 3 children retained in school.',
        feedbackThread:[]
      }
    ];

    /* 3. 120+ Day PDCA International Medical Dossiers */
    DB.db.intlPdcaDossiers = DB.db.intlPdcaDossiers || (()=>{
      const overPts = (DB.db.patients||[]).filter(p=>p.status==='active' && PAT.days(p)>=120).slice(0,4);
      if(overPts.length){
        return overPts.map((p,idx)=>({
          id:'PDCA120-'+(101+idx),
          patientId:p.id,
          patientCode:p.code,
          patientName:p.name,
          countyId:p.countyId || 'kisumu',
          areaId:p.areaId || 'nyalenda',
          daysInProgram:PAT.days(p),
          bmi: (typeof BMI_CLINICAL!=='undefined' && BMI_CLINICAL.patientBmiInfo(p)?.bmi) || 17.8,
          diagnosis: p.clinical?.diagnosis || 'Complex multi-morbid chronic recovery',
          planStage:'Target BMI >= 18.5 kg/m², complete specialist MOPC workup & stabilise household food security within 30-day extension.',
          doStage:'Weekly home visits, Bag 1 + therapeutic protein, supervised pill count & escorted hospital clinic review.',
          checkStage:'Weight improved +1.9 kg since day 90; residual neuropathy & wound epithelialisation at 80%.',
          actStage:'Request 30-day clinical extension (Day 120 -> Day 150) prior to structured graduation.',
          submittedBy:'Medical Case Manager',
          submittedAt:today,
          intlStatus: idx===0 ? 'reviewed_concurred' : 'awaiting_intl_review',
          intlReviewer: idx===0 ? 'International Medical Team' : '',
          intlRecommendation: idx===0 ? 'Concur with 30-day extension to Day 150; repeat Hb & renal panel at JOOTRH MOPC and maintain pyridoxine B6.' : ''
        }));
      }
      return [{
        id:'PDCA120-101', patientId:'p-overstay-demo', patientCode:'LOM-KS-774', patientName:'Demo Extended-Care Beneficiary',
        countyId:'kisumu', areaId:'nyalenda', daysInProgram:138, bmi:17.6,
        diagnosis:'Extrapulmonary TB + Severe Malnutrition Recovery',
        planStage:'Achieve BMI >= 18.5 & complete continuation-phase TB milestones.',
        doStage:'Weekly home nursing, Bag 1 + Pyridoxine 25mg, monthly chest clinic review.',
        checkStage:'BMI rose from 15.2 -> 17.6 kg/m²; sputum conversion confirmed.',
        actStage:'30-day clinical extension approved toward safe graduation at Day 165.',
        submittedBy:'Kisumu Medical Case Manager', submittedAt:today,
        intlStatus:'awaiting_intl_review', intlReviewer:'', intlRecommendation:''
      }];
    })();
  },

  /* =====================================================================
     1. DELEGATION PLAN, SCOPED RELIEVER ACCESS & ROLE HANDOVER + EPPH v2.2
     ===================================================================== */
  renderHandover(user, params={}){
    if(!RBAC.can(user,'handover.use',{}).ok) return deniedPanel('handover.use');
    this.ensureStore();
    const tab = params.tab || 'delegation';
    const packets = (DB.db.handoverPackets||[]).filter(h=>isGlobal(user) || !user.countyId || h.countyId===user.countyId);
    const leaveDelegations = packets.filter(h=>h.kind==='leave_delegation');
    const roleTakeovers = packets.filter(h=>h.kind==='role_takeover');

    let body = '';
    if(tab==='delegation'){
      body = `<div class="note" style="margin-bottom:14px">${ic('key',16)}<span><b>CareLink Scoped Reliever Console Protocol:</b> When a caregiver, coordinator, or officer goes on planned leave (>=14 days notice) or urgent duty, filing a Delegation Plan assigns a named reliever, itemises every patient/task action, records PPE/tablet custody, and grants time-bounded reliever console visibility once accepted by the reliever and approved by the supervisor.</span></div>`
      + leaveDelegations.map(h=>`<div class="card" style="margin-bottom:14px">
          <div class="card-h">
            <div>
              <h3>${esc(h.id)} · ${esc(h.staffName)} -> ${esc(h.relieverName)}</h3>
              <div class="xs muted">${esc(h.leaveType)} · Period: <b>${esc(fmtDate(h.fromDate))} -> ${esc(fmtDate(h.toDate))}</b> (${h.noticeDays}d advance notice)</div>
            </div>
            <div class="row" style="gap:6px;flex-wrap:wrap">
              ${h.scopedConsoleGranted ? badge('Scoped Reliever Console Active','b-ok') : badge('Awaiting Reliever / Supervisor Sign-Off','b-warn')}
              ${!h.relieverAccepted ? `<button class="btn btn-xs btn-primary" data-act="handover-accept" data-id="${esc(h.id)}">${ic('check',12)} Accept as Reliever</button>` : ''}
            </div>
          </div>
          <div class="card-b">
            <div class="grid g3 small" style="gap:10px;margin-bottom:10px">
              <div><span class="muted">County / Ministry Area:</span> <b>${esc(countyName(h.countyId))}${h.areaId?' · '+esc(areaName(h.areaId)):''}</b></div>
              <div><span class="muted">PPE & Field Kit Custody:</span> <b>${esc(h.ppeCustody)}</b></div>
              <div><span class="muted">3-Party Sign-Off:</span> <b>Outgoing ${h.outgoingSigned?'✓':'…'} · Reliever ${h.relieverAccepted?'✓':'Pending'} · Supervisor ${h.supervisorApproved?'✓':'Pending'}</b></div>
            </div>
            ${(h.patientHandoverRows||[]).length ? table([
              {label:'Patient Code', cls:'mono', render:r=>`<b>${esc(r.code)}</b>`},
              {label:'Visit Cadence', render:r=>esc(r.schedule)},
              {label:'Foodbag', cls:'mono', render:r=>badge(r.bag,'b-info','nodot')},
              {label:'Mandatory Reliever Action During Leave', render:r=>esc(r.action)}
            ], h.patientHandoverRows) : ''}
          </div>
        </div>`).join('');
    }

    if(tab==='takeover'){
      body = `<div class="note" style="margin-bottom:14px">${ic('clipboard',16)}<span><b>Permanent / Transition Role Handover & Acceptance Report:</b> Requires tri-party execution (<b>Outgoing Staff</b>, <b>Incoming Officer</b>, and <b>Witnessing Supervisor / HR</b>) verifying pending deliverables, physical registers, asset/key custody, and system credential transition.</span></div>`
      + card('Executed & Pending Role Handover / Takeover Acceptance Reports', table([
          {label:'Report Ref', cls:'mono', render:h=>`<b>${esc(h.id)}</b>`},
          {label:'Outgoing -> Incoming', render:h=>`<b>${esc(h.staffName)}</b> -> <b>${esc(h.relieverName)}</b><div class="xs muted">${esc(h.staffRole)} · ${esc(countyName(h.countyId))}</div>`},
          {label:'Deliverables & Custody Verified', render:h=>`<span class="small">${esc(h.deliverables||h.ppeCustody)}</span>`},
          {label:'Tri-Party Signatures', render:h=>`<span class="xs">Outgoing ${h.outgoingSigned?'✓':''} · Incoming ${h.relieverAccepted?'✓':'Pending'} · Witness ${h.supervisorApproved?'✓':'Pending'}</span>`},
          {label:'Status', render:h=>badge(h.relieverAccepted?'Accepted & Signed':'Awaiting Takeover Sign-Off', h.relieverAccepted?'b-ok':'b-warn')}
        ], roleTakeovers, {emptyMsg:'No permanent role transition reports filed yet.'}));
    }

    if(tab==='epph'){
      const ledgerRows = [
        { type:'Annual Leave', ent:'21 working days / yr', cf:'<= 10 days (forfeit after 31 Mar)', acc:'1.75 days / month', taken:'9 days', bal:'16 days', rule:'Submit >= 14 days in advance with signed Reliever Delegation Plan' },
        { type:'Sick Leave', ent:'30d full + 15d half pay', cf:'0 days', acc:'Statutory per yr', taken:'2 days', bal:'28d full', rule:'Medical certificate from licensed practitioner mandatory if > 3 days' },
        { type:'Maternity / Paternity', ent:'90 cal. days / 14 cal. days', cf:'0 days', acc:'Statutory event', taken:'0 days', bal:'Eligible', rule:'Employment Act (Kenya) full pay protection & return-to-role handover' },
        { type:'Compassionate Leave', ent:'Up to 7 days / yr', cf:'0 days', acc:'Event-verified', taken:'0 days', bal:'7 days', rule:'Immediate supervisor + HR notification with emergency reliever cover' }
      ];
      body = card('LOMAMO Employee Policies & Procedures Handbook (EPPH v2.2) — 6-Column Leave Ledger & Statutory Rules',
        table([
          {label:'Leave Category', render:r=>`<b>${esc(r.type)}</b>`},
          {label:'Annual Entitlement', render:r=>esc(r.ent)},
          {label:'Carry-Forward Cap', render:r=>esc(r.cf)},
          {label:'Monthly Accrual', cls:'mono', render:r=>esc(r.acc)},
          {label:'Sample Balance', cls:'mono', render:r=>`<b>${esc(r.bal)}</b>`},
          {label:'EPPH v2.2 Governance Rule', render:r=>`<span class="small">${esc(r.rule)}</span>`}
        ], ledgerRows),
        {sub:'Absence without leave or lawful cause exceeding 7 consecutive days triggers Employment Act s.44(4)(a) gross-misconduct disciplinary review. Progressive ladder: Verbal Counselling -> 1st Written Warning -> Final Written Warning -> Show-Cause Hearing -> Separation Appeal.'});
    }

    return pageHead('Delegation plans, scoped reliever handover & EPPH v2.2 governance',
      'Ensures zero gap in patient care when staff take leave or transition roles: binds leave requests (>=14d notice) to per-patient action tables, PPE custody, scoped reliever console access, and formal takeover acceptance.',
      `<button class="btn btn-sm btn-ghost" data-act="go" data-v="leave">${ic('calendar',15)} Leave & Field Roster</button>
       <button class="btn btn-sm btn-ghost" data-act="handover-new-modal" data-kind="role_takeover">${ic('clipboard',15)} New Role Handover Report</button>
       <button class="btn btn-sm btn-primary" data-act="handover-new-modal" data-kind="leave_delegation">${ic('plus',15)} New Leave Delegation Plan</button>`)
    + `<div class="grid g4" style="margin-bottom:14px">
        ${kpi('Active reliever delegations', num(leaveDelegations.filter(x=>x.scopedConsoleGranted).length), 'Scoped console access active', 'ok', 'key')}
        ${kpi('Role takeover reports', num(roleTakeovers.length), 'Tri-party signed custody trail', 'info', 'clipboard')}
        ${kpi('Advance notice standard', '≥ 14 days', 'Annual leave (21d · 1.75d/mo accrual)', 'ok', 'calendar')}
        ${kpi('Carry-over cut-off', 'Max 10d -> 31 Mar', 'EPPH v2.2 & Employment Act compliant', 'warn', 'shieldcheck')}
      </div>`
    + `<div class="tabs">
        <button class="tab ${tab==='delegation'?'active':''}" data-act="go" data-v="handover" data-tab="delegation">Leave Delegation & Scoped Reliever Access (${leaveDelegations.length})</button>
        <button class="tab ${tab==='takeover'?'active':''}" data-act="go" data-v="handover" data-tab="takeover">Permanent Role Handover & Acceptance (${roleTakeovers.length})</button>
        <button class="tab ${tab==='epph'?'active':''}" data-act="go" data-v="handover" data-tab="epph">EPPH v2.2 Leave Ledger & Policy Rules</button>
      </div>`
    + body;
  },

  /* =====================================================================
     2. CCC / PSC / HOSPITAL DESK CONSOLE (External Facility Clinicians)
     ===================================================================== */
  renderCccDesk(user, params={}){
    if(!RBAC.can(user,'ccc.desk',{}).ok) return deniedPanel('ccc.desk');
    this.ensureStore();
    const tab = params.tab || 'referrals';
    const isExtClinician = user.roleId === 'ccc.clinician';

    /* STRICT DATA ISOLATION: External CCC clinicians see ONLY referrals they / their facility submitted! */
    const allRefs = DB.db.cccReferrals || [];
    const myRefs = isExtClinician
      ? allRefs.filter(r=>r.referredByUsername===user.username)
      : allRefs.filter(r=>isGlobal(user) || !user.countyId || r.countyId===user.countyId);

    let body = '';
    if(tab==='referrals'){
      body = `${isExtClinician ? `<div class="note" style="margin-bottom:14px">${ic('lock',15)}<span><b>Strict Facility Referral Privacy Scope:</b> Signed in as <b>${esc(user.name)}</b>. You view <b>only patients referred by your facility desk</b> (${myRefs.length} record${myRefs.length===1?'':'s'}), receive Master Referral updates from LOMAMO Ministry Areas, and exchange clinical coordination notes with County Admin Assistants and Caregivers.</span></div>` : ''}
      ${card(isExtClinician ? 'Patients Referred by My CCC / PSC Facility Desk' : 'Incoming CCC / PSC & Public Hospital Referrals', table([
        {label:'Referral # & Facility', render:r=>`<b class="mono">${esc(r.id)}</b><div class="xs muted">${esc(r.facilityName)} · ${esc(fmtDate(r.referralDate))}</div>`},
        {label:'Patient & CCC No.', render:r=>`<b>${esc(r.patientInitials)}</b><div class="xs mono muted">${esc(r.cccNumber)} · LOMAMO: ${esc(r.lomamoCode)}</div>`},
        {label:'Target Ministry Area', render:r=>`${esc(areaName(r.areaId))}<div class="xs muted">${esc(countyName(r.countyId))}</div>`},
        {label:'Selected Support Needs', render:r=>`<div class="row" style="gap:4px;flex-wrap:wrap">${(r.needs||[]).map(n=>`<span class="badge b-info nodot">${esc(n.split('(')[0].trim())}</span>`).join('')}</div><div class="xs muted" style="margin-top:3px">${esc(r.clinicalNotes)}</div>`},
        {label:'BMI at Referral', render:r=>typeof BMI_CLINICAL!=='undefined' ? BMI_CLINICAL.badgeHTML(r.bmiAtReferral, true) : esc(String(r.bmiAtReferral))},
        {label:'Status', render:r=>badge(r.status==='enrolled_active'?'Enrolled & Active':'Awaiting Assessment', r.status==='enrolled_active'?'b-ok':'b-warn')},
        {label:'Feedback', cls:'act', render:r=>`<button class="btn btn-xs btn-ghost" data-act="ccc-feedback-modal" data-id="${esc(r.id)}">${ic('send',12)} Feedback (${(r.feedbackThread||[]).length})</button>`}
      ], myRefs, {emptyMsg:'No facility referrals submitted from this desk yet — click "+ Submit Patient Referral" above.'}))}`;
    }

    if(tab==='master'){
      body = card('Master Referral Reports Returned from LOMAMO Ministry Areas', table([
        {label:'Referral / LOMAMO Code', cls:'mono', render:r=>`<b>${esc(r.lomamoCode)}</b><div class="xs muted">${esc(r.id)} · ${esc(r.cccNumber)}</div>`},
        {label:'Referring Facility', render:r=>esc(r.facilityName)},
        {label:'Ministry Area', render:r=>esc(areaName(r.areaId))},
        {label:'Ministry Area & MCM Master Referral Progress Report', render:r=>`<span class="small">${esc(r.masterReportSummary)}</span>`},
        {label:'Action', cls:'act', render:r=>`<button class="btn btn-xs btn-primary" data-act="ccc-feedback-modal" data-id="${esc(r.id)}">Send Clinical Reply</button>`}
      ], myRefs, {emptyMsg:'Master Referral progress summaries appear here once a referred patient is assessed.'}));
    }

    return pageHead('CCC / PSC & Hospital Clinician Referral Desk',
      'Secure clinical bridge for government & partner hospital doctors, clinical officers, nurses, and CHVs to refer vulnerable patients, track ONLY their referred caseload, receive Master Referral reports, and message County Admin Assistants & caregivers.',
      `<button class="btn btn-sm btn-primary" data-act="ccc-new-referral-modal">${ic('plus',15)} Submit Patient Referral</button>`)
    + `<div class="grid g4" style="margin-bottom:14px">
        ${kpi('Referrals in my scope', num(myRefs.length), isExtClinician?'Strictly isolated to your facility':'Across partner CCC/PSC desks', 'info', 'hospital')}
        ${kpi('Enrolled in Ministry Areas', num(myRefs.filter(r=>r.status==='enrolled_active').length), 'Active home nutrition & adherence care', 'ok', 'check')}
        ${kpi('Master Referral reports', num(myRefs.filter(r=>r.masterReportSummary).length), 'Returned from Ministry Areas & MCM', 'ok', 'file')}
        ${kpi('Two-way feedback notes', num(myRefs.reduce((n,r)=>n+(r.feedbackThread?.length||0),0)), 'With County Admin Assistants & Caregivers', 'info', 'send')}
      </div>`
    + `<div class="tabs">
        <button class="tab ${tab==='referrals'?'active':''}" data-act="go" data-v="cccdesk" data-tab="referrals">Referred Patients & Needs (${myRefs.length})</button>
        <button class="tab ${tab==='master'?'active':''}" data-act="go" data-v="cccdesk" data-tab="master">Master Referral Reports from Ministry Areas</button>
      </div>`
    + body;
  },

  /* =====================================================================
     3. COUNTY & NATIONAL GOVERNMENT PRIVACY-SAFE PARTNERSHIP DASHBOARD
     ===================================================================== */
  renderGovDashboard(user, params={}){
    if(!RBAC.can(user,'gov.oversight',{}).ok) return deniedPanel('gov.oversight');
    const cgk = (typeof PORTAL_EXTENDED_IMPACT !== 'undefined' && PORTAL_EXTENDED_IMPACT.cgkPartnership) || {};
    const ext = (typeof PORTAL_EXTENDED_IMPACT !== 'undefined' && PORTAL_EXTENDED_IMPACT) || {};
    const countyFocus = user.countyId || params.county || 'all';
    const canConfigurePortal = RBAC.has(user,'media.publish') || RBAC.has(user,'system.config') || ['director','program.admin'].includes(user.roleId);
    const partnerPortalEnabled = !(DB.db && DB.db.settings && DB.db.settings.partnerPortalDisabled);

    const subCountyRows = [
      { subCounty:'Kisumu Central', county:'Kisumu', areas:'Nyalenda, Kaloleni / Milimani corridor', facilities:'JOOTRH, Kisumu County Referral Hospital (KCRH), Lumumba Sub-County Hospital', status:'Active Community-to-Facility Continuum' },
      { subCounty:'Kisumu East',    county:'Kisumu', areas:'Manyatta, Kasagam, Kajulu, Gita',       facilities:'Migosi Sub-County Hospital, Gita Sub-County Hospital, Simba Opepo', status:'Active Community-to-Facility Continuum' },
      { subCounty:'Kisumu West',    county:'Kisumu', areas:'Kisian, Ojolla, Otonglo',               facilities:'Chulaimbo County Hospital, Ober Kamoth Sub-County Hospital, Airport HC', status:'Active Community-to-Facility Continuum' },
      { subCounty:'Nyando',         county:'Kisumu', areas:'Ahero, Korowe, Nyamasaria corridor',    facilities:'Ahero County Hospital, Rabuor Sub-County Hospital', status:'Active Community-to-Facility Continuum' },
      { subCounty:'Seme',           county:'Kisumu', areas:'Kombewa outreach linkage',              facilities:'Kombewa County Referral Hospital', status:'Active Referral Linkage' },
      { subCounty:'Homa Bay Town & Ndhiwa', county:'Homa Bay', areas:'Homa Bay Town, Sofia, Makongeni, Shauri Yako', facilities:'Homa Bay County Teaching & Referral Hospital', status:'Active Community-to-Facility Continuum' }
    ].filter(r=>countyFocus==='all' || r.county.toLowerCase().replace(/\s+/g,'')===countyFocus);

    const impactIndicators = [
      { indicator:'Healthy Programme Graduations (2018–2026)', verified:'2,012 patients', alignment:'Art. 43(1)(a) Right to Highest Attainable Standard of Health' },
      { indicator:'Orphans Prevented Through Parental Recovery', verified:'3,722 children', alignment:'National OVC & Household Resilience Priority' },
      { indicator:'Household Nutritional Foodbags Delivered', verified:'29,010 foodbags', alignment:'KAISF 2025–2030 Nutrition & ART/TB Adherence Pillar' },
      { indicator:'Verified Clinical & Nutritional Recovery Rate', verified:'89% recovery', alignment:'Post-Discharge Hospital Readmission Reduction' },
      { indicator:'Quarterly Hygiene Packs Distributed', verified:'1,336 packs', alignment:'WASH & Opportunistic Infection Prevention' },
      { indicator:'Recovery Mattresses, Blankets & LLIN Mosquito Nets', verified:'226 bedding · 216 nets', alignment:'Malaria Vector Control & Dignified Home Recovery' },
      { indicator:'Spiritual Care & Holistic Counselling', verified:'798 saved · 787 Bibles', alignment:'Whole-Person Psychosocial & Household Hope' }
    ];

    return pageHead('County & National Government Health Partnership Console',
      'Aligned to Constitution of Kenya Art. 43(1)(a), KAISF 2025–2030, County Department of Medical Services, Public Health & Sanitation priorities, and strict Kenya Data Protection Act 2019 de-identification.',
      `<button class="btn btn-sm btn-ghost" data-act="portal-mode" data-mode="public">${ic('eye',15)} Open Public Portal</button>
       <button class="btn btn-sm btn-primary" data-act="portal-mode" data-mode="partner">${ic('shieldcheck',15)} Open Private Partner Portal View</button>`)
    + `<div class="alert ok" style="margin-bottom:14px">${ic('shieldcheck',18)}
        <div><b>Kenya Data Protection Act (2019) Zero-PII Guarantee Active:</b> This government oversight console exposes <b>verified aggregate health-system indicators, sub-county facility linkages, and programme narratives only</b>. Individual beneficiary names, national IDs, CCC numbers, and identifiable disease profiles are stripped at the data layer.</div>
      </div>`
    + `<div class="grid g4" style="margin-bottom:16px">
        ${kpi('Healthy discharges', '2,012', '89% verified recovery rate (2018–2026)', 'ok', 'check')}
        ${kpi('Orphans prevented', '3,722', 'Children kept in intact households', 'ok', 'heart')}
        ${kpi('Foodbags delivered', '29,010', 'Weekly Bag 1, Bag 2 & Special dietary', 'info', 'package')}
        ${kpi('Public facilities linked', '13+ facilities', '5 of 7 Kisumu sub-counties + Homa Bay', 'info', 'hospital')}
      </div>`
    + `<div class="grid g2" style="margin-bottom:16px">
        ${card('Verified 2018–2026 Health-System Partnership Indicators', table([
          {label:'Programme Indicator', render:r=>`<b>${esc(r.indicator)}</b>`},
          {label:'Verified Cumulative Output', cls:'mono', render:r=>`<b>${esc(r.verified)}</b>`},
          {label:'Policy & Strategic Alignment', render:r=>`<span class="xs muted">${esc(r.alignment)}</span>`}
        ], impactIndicators))}
        ${card('Public vs Governed Private Partner Portal Mode', `
          <p class="small">CareLink operates two governed external transparency tiers so the general public and authorised government/institutional partners each see the exact depth appropriate to their mandate:</p>
          <div class="col" style="gap:10px;margin-top:10px">
            <div style="padding:12px;border-radius:10px;border:1px solid var(--line);background:var(--surface-2)">
              <div class="spread"><b>1. Open Public Mode</b>${badge('Always Public · Zero PII','b-ok')}</div>
              <div class="xs muted" style="margin-top:4px">Headline mission metrics, consent-verified human stories, US 501(c)(3) & Kenya NGO accountability, and partnership inquiry desk.</div>
            </div>
            <div style="padding:12px;border-radius:10px;border:1px solid var(--line);background:var(--surface-2)">
              <div class="spread"><b>2. Governed Private Partner Mode</b>${badge(partnerPortalEnabled?'Admin-Granted Active':'Restricted','b-info')}</div>
              <div class="xs muted" style="margin-top:4px">Unlocked ONLY for authenticated Government, CCC Facility, International Medical, and Executive accounts — adds sub-county health-system tables, 13+ public hospital referral corridors, and KAISF 2025–2030 indicators while keeping zero patient PII.</div>
            </div>
          </div>
          ${canConfigurePortal ? `<div style="margin-top:12px">
            <button class="btn btn-xs btn-ghost" data-act="gov-toggle-partner-portal">${ic('settings',13)} ${partnerPortalEnabled?'Pause Private Partner Portal Layer':'Enable Private Partner Portal Layer'}</button>
          </div>` : ''}
        `)}
      </div>`
    + card('Sub-County Coverage & Public Hospital Continuum Corridors', table([
        {label:'Sub-County', render:r=>`<b>${esc(r.subCounty)}</b><div class="xs muted">${esc(r.county)} County</div>`},
        {label:'Ministry Area Catchments', render:r=>esc(r.areas)},
        {label:'Linked Government & Referral Hospitals', render:r=>`<span class="small">${esc(r.facilities)}</span>`},
        {label:'Continuum Status', render:r=>badge(r.status,'b-ok','nodot')}
      ], subCountyRows));
  },

  /* =====================================================================
     4. INTERNATIONAL MEDICAL TEAM & 120+ DAY PDCA OVERSTAY CONSOLE
     ===================================================================== */
  renderIntlMedical(user, params={}){
    if(!RBAC.can(user,'intl.medical',{}).ok) return deniedPanel('intl.medical');
    this.ensureStore();
    const dossiers = DB.db.intlPdcaDossiers || [];
    const filter = params.status || 'all';
    const shown = dossiers.filter(d=>filter==='all' || d.intlStatus===filter);
    const pendingCount = dossiers.filter(d=>d.intlStatus==='awaiting_intl_review').length;

    /* Aggregate clinical oversight across counties */
    const allPts = (DB.db.patients||[]).filter(p=>p.status==='active');
    const over120Live = allPts.filter(p=>PAT.days(p)>=120).length;
    const avgStay = allPts.length ? Math.round(allPts.reduce((n,p)=>n+PAT.days(p),0)/allPts.length) : 84;

    return pageHead('International Medical Team · 120+ Day PDCA & Global Clinical Oversight',
      'Dedicated clinical governance console receiving every 120+ day overstay Plan-Do-Check-Act (PDCA) report from Kisumu and Homa Bay Medical Case Managers for specialist review and extension sign-off.',
      `${RBAC.has(user,'clinical.mcm')?`<button class="btn btn-sm btn-ghost" data-act="go" data-v="clinicalmcm">${ic('activity',15)} MCM Clinical Console</button>`:''}
       <button class="btn btn-sm btn-ghost" data-act="portal-mode" data-mode="partner">${ic('building2',15)} Partner Impact Brief</button>`)
    + `<div class="grid g4" style="margin-bottom:16px">
        ${kpi('120+ Day PDCA dossiers', num(dossiers.length), `${num(pendingCount)} awaiting International Medical review`, pendingCount?'warn':'ok', 'pulse')}
        ${kpi('Live 120+ day caseload', num(over120Live), 'Across Kisumu & Homa Bay counties', over120Live?'warn':'ok', 'clock')}
        ${kpi('Mean active stay', `${avgStay} days`, 'Target graduation cycle: 90–120 days', 'info', 'activity')}
        ${kpi('Historical recovery rate', '89%', '2,012 healthy discharges (2018–2026)', 'ok', 'shieldcheck')}
      </div>`
    + `<div class="tabs">
        <button class="tab ${filter==='all'?'active':''}" data-act="go" data-v="intlmedical" data-status="all">All 120+ Day PDCA Dossiers (${dossiers.length})</button>
        <button class="tab ${filter==='awaiting_intl_review'?'active':''}" data-act="go" data-v="intlmedical" data-status="awaiting_intl_review">Awaiting International Review (${pendingCount})</button>
        <button class="tab ${filter==='reviewed_concurred'?'active':''}" data-act="go" data-v="intlmedical" data-status="reviewed_concurred">Reviewed & Concurred (${dossiers.length - pendingCount})</button>
      </div>`
    + shown.map(d=>`<div class="card" style="margin-bottom:14px">
        <div class="card-h">
          <div>
            <h3>${esc(d.id)} · ${esc(d.patientName)} (${esc(d.patientCode)}) — <span style="color:var(--crit)">${d.daysInProgram} Days in Care</span></h3>
            <div class="xs muted">${esc(countyName(d.countyId))} · ${esc(areaName(d.areaId))} · Primary Diagnosis: <b>${esc(d.diagnosis)}</b> · Submitted by ${esc(d.submittedBy)}</div>
          </div>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            ${typeof BMI_CLINICAL!=='undefined' ? BMI_CLINICAL.badgeHTML(d.bmi, true) : ''}
            ${badge(d.intlStatus==='reviewed_concurred'?'Intl Medical Concurred':'Awaiting Intl Medical Review', d.intlStatus==='reviewed_concurred'?'b-ok':'b-warn')}
            <button class="btn btn-xs btn-primary" data-act="intl-review-modal" data-id="${esc(d.id)}">${ic('check',12)} ${d.intlStatus==='reviewed_concurred'?'Update Advisory':'Record Intl Medical Review'}</button>
          </div>
        </div>
        <div class="card-b">
          <div class="grid g4 small" style="gap:10px">
            <div class="pdca-quad"><b>P — PLAN</b><div class="xs muted" style="margin-top:4px">${esc(d.planStage)}</div></div>
            <div class="pdca-quad"><b>D — DO</b><div class="xs muted" style="margin-top:4px">${esc(d.doStage)}</div></div>
            <div class="pdca-quad"><b>C — CHECK</b><div class="xs muted" style="margin-top:4px">${esc(d.checkStage)}</div></div>
            <div class="pdca-quad"><b>A — ACT</b><div class="xs muted" style="margin-top:4px">${esc(d.actStage)}</div></div>
          </div>
          ${d.intlRecommendation ? `<div class="alert ok" style="margin-top:10px">${ic('shieldcheck',16)}
            <div><b>International Medical Team Recommendation (${esc(d.intlReviewer||'International Medical')}):</b>
              <div class="xs">${esc(d.intlRecommendation)}</div>
            </div>
          </div>` : ''}
        </div>
      </div>`).join('');
  }
};

function _hpAddDays(isoDate, n){
  const d = new Date(isoDate+'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0,10);
}

Object.assign(ACTIONS, {
  'handover-new-modal': (d={}) => {
    const kind = d.kind === 'role_takeover' ? 'role_takeover' : 'leave_delegation';
    const colleagues = (DB.db.users||[]).filter(u=>u.active && u.id!==AUTH.user.id && (!AUTH.user.countyId || isGlobal(AUTH.user) || u.countyId===AUTH.user.countyId));
    const today = todayISO().slice(0,10);
    openModal({
      title: kind==='role_takeover' ? 'New Permanent / Transition Role Handover & Acceptance Report' : 'New Leave Delegation Plan & Scoped Reliever Console Grant',
      sub: kind==='role_takeover' ? 'Tri-party custody & deliverable transfer protocol.' : 'EPPH v2.2 >=14-day advance notice rule with per-patient reliever action table.',
      wide: true,
      body:`<form id="handoverNewForm">
        <input type="hidden" name="kind" value="${esc(kind)}">
        <div class="grid g2">
          <div class="field"><label>${kind==='role_takeover'?'Incoming Officer':'Designated Reliever (receives scoped console access)'} *</label>
            <select class="input" name="relieverUsername" required>
              ${colleagues.map(u=>`<option value="${esc(u.username)}">${esc(u.name.replace(/^Demo - /,''))} (${esc((roleObj(u.roleId)||{}).name||u.roleId)})</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>Leave / Handover category *</label>
            <input class="input" name="leaveType" value="${kind==='role_takeover'?'Departmental Role Transition & Acceptance':'Annual Leave (>=14 days advance notice)'}" required>
          </div>
        </div>
        <div class="grid g3">
          <div class="field"><label>Effective from *</label><input class="input" type="date" name="fromDate" value="${esc(_hpAddDays(today,14))}" required></div>
          <div class="field"><label>Effective to *</label><input class="input" type="date" name="toDate" value="${esc(_hpAddDays(today,24))}" required></div>
          <div class="field"><label>Advance notice (days)</label><input class="input" type="number" min="0" name="noticeDays" value="14"></div>
        </div>
        <div class="field"><label>PPE, Field Tablet, Keys & Register Custody Handover *</label>
          <input class="input" name="ppeCustody" value="Field Tablet, Weighing Scale, Home Visit Folder & Keys verified" required>
        </div>
        <div class="field"><label>${kind==='role_takeover'?'Pending Deliverables, Files & Financial/Stock Clearance *':'Caseload / Departmental Priority Actions for Reliever *'}</label>
          <textarea class="input" name="deliverables" rows="3" required placeholder="List patients due for 3rd-visit weigh-in, hospital clinic reviews, foodbag codes, or pending departmental tasks..."></textarea>
        </div>
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" data-act="handover-new-save">${ic('check',14)} Sign & Route to Reliever & Supervisor</button>`
    });
  },

  'handover-new-save': () => {
    const f = document.querySelector('#handoverNewForm');
    if(!f) return;
    const fd = new FormData(f);
    const deliv = String(fd.get('deliverables')||'').trim();
    if(!deliv) return toast('Handover details required','','err');
    const rel = (DB.db.users||[]).find(u=>u.username===fd.get('relieverUsername'));
    HANDOVER_PARTNERS.ensureStore();
    const kind = fd.get('kind');
    const pkt = {
      id: (kind==='role_takeover'?'HND-2026-':'DEL-2026-') + String(10 + DB.db.handoverPackets.length),
      kind,
      staffName: AUTH.user.name.replace(/^Demo - /,''),
      staffRole: (roleObj(AUTH.user.roleId)||{}).name || AUTH.user.roleId,
      countyId: AUTH.user.countyId || 'kisumu',
      areaId: (AUTH.user.areaIds&&AUTH.user.areaIds[0]) || '',
      leaveType: String(fd.get('leaveType')||'Annual Leave'),
      fromDate: fd.get('fromDate') || todayISO().slice(0,10),
      toDate: fd.get('toDate') || todayISO().slice(0,10),
      noticeDays: Number(fd.get('noticeDays')||14),
      relieverUsername: rel ? rel.username : '',
      relieverName: rel ? rel.name.replace(/^Demo - /,'') : 'Assigned Reliever',
      scopedConsoleGranted: false,
      ppeCustody: String(fd.get('ppeCustody')||'Verified'),
      deliverables: deliv,
      patientHandoverRows: kind==='leave_delegation' ? [{ code:'Caseload Action Plan', schedule:'Per weekly roster', bag:'BG1/BG2', action:deliv }] : [],
      outgoingSigned: true,
      relieverAccepted: false,
      supervisorApproved: false,
      status: 'pending_acceptance'
    };
    DB.db.handoverPackets.unshift(pkt);
    if(rel) notify(rel.id, 'Delegation / Handover Acceptance Requested', `${pkt.staffName} routed ${pkt.id} to you for acceptance.`, 'info');
    AUDIT.append({ actor:AUTH.user.id, action:'handover.created', entity:'handover', entityId:pkt.id, detail:`${pkt.kind} -> ${pkt.relieverName}` });
    DB.save();
    closeModal(true);
    toast('Handover packet filed', `${pkt.id} routed to ${pkt.relieverName} for acceptance.`, 'ok');
    render();
  },

  'handover-accept': (d={}) => {
    HANDOVER_PARTNERS.ensureStore();
    const pkt = (DB.db.handoverPackets||[]).find(x=>x.id===d.id);
    if(!pkt) return;
    pkt.relieverAccepted = true;
    pkt.supervisorApproved = true;
    pkt.scopedConsoleGranted = true;
    pkt.status = pkt.kind==='role_takeover' ? 'accepted_closed' : 'active_reliever';
    AUDIT.append({ actor:AUTH.user.id, action:'handover.accepted', entity:'handover', entityId:pkt.id, detail:`Reliever acceptance & scoped console grant activated` });
    DB.save();
    toast('Handover accepted & scoped access active', `${pkt.id} is now active with full audit attribution.`, 'ok');
    render();
  },

  'ccc-new-referral-modal': () => {
    const areas = COUNTIES.filter(c=>isGlobal(AUTH.user)||!AUTH.user.countyId||c.id===AUTH.user.countyId).flatMap(c=>c.areas.map(a=>({...a,countyId:c.id})));
    openModal({
      title:'Submit CCC / PSC Hospital Patient Referral to LOMAMO',
      sub:'Routes directly to the County Admin Assistant & target Ministry Area Coordinator.',
      wide:true,
      body:`<form id="cccRefForm">
        <div class="grid g3">
          <div class="field"><label>Referring Hospital / CCC / PSC Desk *</label>
            <input class="input" name="facilityName" value="${esc(AUTH.user.name.includes('KCRH')?'Kisumu County Referral Hospital PSC':AUTH.user.name.includes('Homa Bay')?'Homa Bay County Teaching & Referral Hospital CCC':'JOOTRH Comprehensive Care Centre (CCC)')}" required>
          </div>
          <div class="field"><label>Patient name / initials *</label>
            <input class="input" name="patientInitials" placeholder="e.g. Beneficiary K.O." required>
          </div>
          <div class="field"><label>CCC / Clinic Number (format CCC/9xxxx) *</label>
            <input class="input" name="cccNumber" value="CCC/90845" required>
          </div>
        </div>
        <div class="grid g3">
          <div class="field"><label>Target residential Ministry Area *</label>
            <select class="input" name="areaId" required>
              ${areas.map(a=>`<option value="${esc(a.id)}">${esc(a.name)} (${esc(countyName(a.countyId))})</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>Current Weight (kg) *</label><input class="input" type="number" step="0.1" name="weightKg" value="44.5" required></div>
          <div class="field"><label>Height (cm) *</label><input class="input" type="number" step="0.5" name="heightCm" value="165" required></div>
        </div>
        <div class="field"><label>Select patient clinical & household support needs *</label>
          <div class="checkgrid">
            ${CCC_NEED_OPTIONS.map((n,i)=>`<label class="check"><input type="checkbox" name="needs" value="${esc(n)}" ${i<2?'checked':''}> ${esc(n)}</label>`).join('')}
          </div>
        </div>
        <div class="field"><label>Clinical summary, regimen & home follow-up notes *</label>
          <textarea class="input" name="clinicalNotes" rows="3" required placeholder="Diagnosis, current ART/TB/chronic regimen, next clinic review date, and household vulnerability notes..."></textarea>
        </div>
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" data-act="ccc-new-referral-save">${ic('send',14)} Transmit Referral to County Admin Assistant</button>`
    });
  },

  'ccc-new-referral-save': () => {
    const f = document.querySelector('#cccRefForm');
    if(!f) return;
    const fd = new FormData(f);
    const notes = String(fd.get('clinicalNotes')||'').trim();
    const patName = String(fd.get('patientInitials')||'').trim();
    if(!patName || !notes) return toast('Patient & clinical notes required','','err');
    const needs = fd.getAll ? fd.getAll('needs') : [CCC_NEED_OPTIONS[0]];
    const areaId = fd.get('areaId') || 'nyalenda';
    const countyObj = COUNTIES.find(c=>c.areas.some(a=>a.id===areaId)) || COUNTIES[0];
    const bmi = (typeof BMI_CLINICAL!=='undefined' && BMI_CLINICAL.compute(fd.get('weightKg'), fd.get('heightCm'))) || 16.3;
    let cccNo = String(fd.get('cccNumber')||'CCC/90845').trim();
    if(!/^CCC\/9\d{4}$/.test(cccNo)) cccNo = 'CCC/90845';
    HANDOVER_PARTNERS.ensureStore();
    const ref = {
      id: 'CCC-REF-' + (910 + DB.db.cccReferrals.length),
      facilityName: String(fd.get('facilityName')||'Partner CCC Desk').trim(),
      referredByUsername: AUTH.user.username,
      referredByClinician: AUTH.user.name,
      countyId: countyObj.id,
      areaId,
      patientInitials: patName,
      cccNumber: cccNo,
      nationalId: '98451209',
      phone: '0700184512',
      referralDate: todayISO().slice(0,10),
      bmiAtReferral: bmi,
      needs: needs.length ? needs : [CCC_NEED_OPTIONS[0]],
      clinicalNotes: notes,
      status: 'awaiting_assessment',
      lomamoCode: 'Queued for Hard-Copy Assessment',
      masterReportSummary: `Received by ${countyName(countyObj.id)} County Admin Assistant — scheduled for ${areaName(areaId)} physical home assessment.`,
      feedbackThread: [{ by:AUTH.user.name, role:'Referring Clinician', at:todayISO().slice(0,10), msg:'Referral submitted via CareLink CCC Desk.' }]
    };
    DB.db.cccReferrals.unshift(ref);
    (DB.db.users||[]).filter(u=>u.active && u.countyId===countyObj.id && ['assistant','countyadmin','mcm'].includes(u.roleId))
      .forEach(u=>notify(u.id, `New CCC Facility Referral · ${ref.id}`, `${ref.facilityName} referred ${patName} (${areaName(areaId)}, BMI ${bmi}).`, 'info'));
    AUDIT.append({ actor:AUTH.user.id, action:'ccc.referral.submitted', entity:'ccc_referral', entityId:ref.id, detail:`${ref.facilityName} -> ${areaName(areaId)}` });
    DB.save();
    closeModal(true);
    toast('Facility referral transmitted', `${ref.id} routed to ${countyName(countyObj.id)} County Admin Assistant & ${areaName(areaId)} team.`, 'ok');
    render();
  },

  'ccc-feedback-modal': (d={}) => {
    HANDOVER_PARTNERS.ensureStore();
    const r = (DB.db.cccReferrals||[]).find(x=>x.id===d.id);
    if(!r) return;
    openModal({
      title:`CCC <-> CareLink Feedback Thread · ${r.id}`,
      sub:`${r.patientInitials} (${r.cccNumber}) · ${r.facilityName} <-> ${areaName(r.areaId)}`,
      wide:false,
      body:`<div>
        <div class="note" style="margin-bottom:10px">${ic('file',14)}<span><b>Master Referral Summary:</b> ${esc(r.masterReportSummary)}</span></div>
        <div class="col" style="gap:8px;max-height:220px;overflow-y:auto;margin-bottom:12px">
          ${(r.feedbackThread||[]).map(m=>`<div style="padding:8px 10px;border-radius:8px;background:var(--surface-2);border:1px solid var(--line)">
            <div class="xs muted"><b>${esc(m.by)}</b> (${esc(m.role)}) · ${esc(m.at)}</div>
            <div class="small" style="margin-top:2px">${esc(m.msg)}</div>
          </div>`).join('') || `<div class="xs muted">No feedback messages yet.</div>`}
        </div>
        <form id="cccFbForm">
          <input type="hidden" name="id" value="${esc(r.id)}">
          <div class="field"><label>Send feedback to County Admin Assistant, Caregiver & Referring Clinician *</label>
            <textarea class="input" name="msg" rows="2" required placeholder="Share appointment feedback, lab/viral-load readiness, or home adherence update..."></textarea>
          </div>
        </form>
      </div>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Close</button>
        <button class="btn btn-primary" data-act="ccc-feedback-save">${ic('send',14)} Send Feedback</button>`
    });
  },

  'ccc-feedback-save': () => {
    const f = document.querySelector('#cccFbForm');
    if(!f) return;
    const fd = new FormData(f);
    const msg = String(fd.get('msg')||'').trim();
    if(!msg) return toast('Message required','','err');
    const r = (DB.db.cccReferrals||[]).find(x=>x.id===fd.get('id'));
    if(!r) return;
    r.feedbackThread = r.feedbackThread || [];
    r.feedbackThread.push({ by:AUTH.user.name.replace(/^Demo - /,''), role:(roleObj(AUTH.user.roleId)||{}).name||'Care Team', at:todayISO().slice(0,10), msg });
    AUDIT.append({ actor:AUTH.user.id, action:'ccc.feedback.sent', entity:'ccc_referral', entityId:r.id, detail:msg.slice(0,80) });
    DB.save();
    closeModal(true);
    toast('Feedback delivered', 'Shared across CCC Desk, County Admin Assistant & Caregiver.', 'ok');
    render();
  },

  'gov-toggle-partner-portal': () => {
    DB.db.settings = DB.db.settings || {};
    DB.db.settings.partnerPortalDisabled = !DB.db.settings.partnerPortalDisabled;
    AUDIT.append({ actor:AUTH.user.id, action:'portal.partner_mode.toggled', entity:'portal', entityId:'partner_mode', detail:DB.db.settings.partnerPortalDisabled?'paused':'enabled' });
    DB.save();
    toast('Partner portal governance updated', DB.db.settings.partnerPortalDisabled ? 'Private Partner layer paused.' : 'Private Partner layer active for authorised accounts.', 'ok');
    render();
  },

  'intl-file-pdca120': (d={}) => {
    HANDOVER_PARTNERS.ensureStore();
    const p = (DB.db.patients||[]).find(x=>x.id===d.id);
    if(!p) return;
    const exists = DB.db.intlPdcaDossiers.find(x=>x.patientId===p.id);
    if(exists){ go('intlmedical'); return; }
    const bi = typeof BMI_CLINICAL!=='undefined' ? BMI_CLINICAL.patientBmiInfo(p) : { bmi:18.1 };
    const dos = {
      id: 'PDCA120-' + (110 + DB.db.intlPdcaDossiers.length),
      patientId: p.id, patientCode: p.code, patientName: p.name,
      countyId: p.countyId, areaId: p.areaId, daysInProgram: PAT.days(p), bmi: bi.bmi,
      diagnosis: p.clinical?.diagnosis || 'Extended chronic clinical recovery',
      planStage: 'Stabilise nutritional BMI & complete specialist outpatient review within 30-day extension.',
      doStage: 'Fortnightly home visits, Bag 1 support & supervised adherence check.',
      checkStage: `${PAT.days(p)} days in programme; current BMI ${bi.bmi} kg/m².`,
      actStage: 'Transmitted to International Medical Team for 120+ day clinical review.',
      submittedBy: AUTH.user.name.replace(/^Demo - /,''),
      submittedAt: todayISO().slice(0,10),
      intlStatus: 'awaiting_intl_review', intlReviewer:'', intlRecommendation:''
    };
    DB.db.intlPdcaDossiers.unshift(dos);
    AUDIT.append({ actor:AUTH.user.id, action:'pdca120.transmitted', entity:'patient', entityId:p.id, detail:`${dos.id} (${dos.daysInProgram}d) -> International Medical` });
    DB.save();
    toast('120+ Day PDCA dossier transmitted', `${dos.id} is now in the International Medical Team review queue.`, 'ok');
    go('intlmedical');
  },

  'intl-review-modal': (d={}) => {
    HANDOVER_PARTNERS.ensureStore();
    const dos = (DB.db.intlPdcaDossiers||[]).find(x=>x.id===d.id);
    if(!dos) return;
    openModal({
      title:`International Medical Review · ${dos.id} (${dos.daysInProgram} Days)`,
      sub:`${dos.patientName} (${dos.patientCode}) · ${countyName(dos.countyId)} · ${areaName(dos.areaId)}`,
      wide:false,
      body:`<form id="intlRevForm">
        <input type="hidden" name="id" value="${esc(dos.id)}">
        <div class="field"><label>Clinical concurrence & extension decision *</label>
          <select class="input" name="decision">
            <option value="reviewed_concurred">Concur with 30-Day PDCA Extension & Specialist Plan</option>
            <option value="awaiting_intl_review">Request Additional Diagnostics from County MCM</option>
          </select>
        </div>
        <div class="field"><label>International Medical Team specialist recommendation *</label>
          <textarea class="input" name="recommendation" rows="3" required placeholder="Clinical guidance on nutrition, specialist referral, diagnostics, and graduation milestone...">${esc(dos.intlRecommendation||'Concur with 30-day clinical extension; monitor 3-visit BMI trajectory and confirm specialist outpatient review before graduation.')}</textarea>
        </div>
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" data-act="intl-review-save">${ic('check',14)} Sign & Return to County MCM</button>`
    });
  },

  'intl-review-save': () => {
    const f = document.querySelector('#intlRevForm');
    if(!f) return;
    const fd = new FormData(f);
    const rec = String(fd.get('recommendation')||'').trim();
    if(!rec) return toast('Recommendation required','','err');
    const dos = (DB.db.intlPdcaDossiers||[]).find(x=>x.id===fd.get('id'));
    if(!dos) return;
    dos.intlStatus = fd.get('decision') || 'reviewed_concurred';
    dos.intlReviewer = AUTH.user.name.replace(/^Demo - /,'');
    dos.intlRecommendation = rec;
    AUDIT.append({ actor:AUTH.user.id, action:'pdca120.intl_reviewed', entity:'pdca120', entityId:dos.id, detail:rec.slice(0,80) });
    DB.save();
    closeModal(true);
    toast('International Medical review recorded', `Published back to ${countyName(dos.countyId)} Medical Case Management.`, 'ok');
    render();
  }
});
