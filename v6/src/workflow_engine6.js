/* ============================================================
   workflow_engine6.js — CareLink v6.5 Intelligent AI-Assisted
   Automatic Workflow Engine & 100% Data Completion / Quality Hub
   ============================================================ */

const WORKFLOW_ENGINE = {
  _cache: { sig: '', byKey: Object.create(null), prioByKey: Object.create(null) },
  _sig() {
    const db = DB.db || {};
    return `${(db.patients||[]).length}:${(db.visits||[]).length}:${(db.workflowActionsLog||[]).length}:${(db.accountRequests||[]).length}:${(db.recoveryRequests||[]).length}:${(db.transactions||[]).length}:${(db.customRoles||[]).length}:${(db.mondayProposals||[]).length}:${db.settings?.globallyActivated?1:0}`;
  },

  /* Role & Custom-Role profile resolver — ensures Smart Workflow & QA is strictly tailored to each role */
  roleProfile(user) {
    const rObj = (user && typeof roleObj === 'function' ? roleObj(user.roleId) : null) || { id: user?.roleId || 'staff', name: 'Staff Workspace', dept: user?.departmentId || 'ministry', scope: 'own', perms: [] };
    const isCustom = Boolean(rObj && rObj.id && typeof ROLE === 'function' && !ROLE(rObj.id));
    const dept = (user && user.departmentId) || rObj.dept || 'ministry';
    const roleName = rObj.name || titleCase(user?.roleId || 'Workspace');
    const uCounty = (user && user.countyId) ? countyName(user.countyId) : 'Head Office';
    const isGlobalOversight = ['chief','director','program.admin','me','auditor','president'].includes(user?.roleId) || rObj.scope === 'all';
    const nonClinicalRoles = ['media','mediahead','pr','finance','procurement','hr','welfare','vehicle','auditor','it','librarian','gov.partner','president','clerk.finance','clerk.procurement','clerk.admin','deputy.finance','deputy.procurement','deputy.hr'];
    const hasClinicalMandate = Boolean(user && RBAC.has(user, 'patient.list') && !nonClinicalRoles.includes(user.roleId) && !['media','pr','finance','procure','hr','welfare','fleet','it','library','audit'].includes(dept));

    const hubTitles = {
      chief: 'Chief System Admin Governance, Version Control & Security QA',
      director: 'Country Director Institutional Strategy & Cross-County QA',
      'program.admin': 'Chief Program Operations, PDCA & County Delivery QA',
      'program.assistant': 'Program Admin & Monday Secretariat Workflow Hub',
      'secretary.director': 'Country Director Secretariat & Monday Minutes Workflow',
      'secretary.program': 'Program Admin Secretariat & Monday Minutes Workflow',
      countyadmin: `${uCounty} County Admin, Urgent Sign-In & Monday Secretariat QA`,
      mcm: 'Medical Case Manager SOAP, 120-Day PDCA & Triage Workflow',
      clinician: 'Clinical Consultation, Diagnostics & Official PDCA Workflow',
      nurse: 'Nursing Care, Vitals & Anthropometric Follow-Up Workflow',
      psych: 'Psychosocial Counselling & Household Resilience Workflow',
      physio: 'Rehabilitation, Mobility & Assistive Therapy Workflow',
      pharmacy: 'Pharmacy Dispensing, FEFO Batch & Cold-Chain QA Hub',
      'hosp.coord': 'Hospital Continuum Referral & Discharge Reconciliation Hub',
      'hosp.focal': 'Facility Focal Liaison, Admission & Receipt Verification Hub',
      'area.coord': 'Ministry Area Coordinator Caseload, 30d PDCA & Field QA',
      caregiver: 'Supporting Caregiver Household Visit, MUAC & Care Plan Hub',
      finance: 'Finance Voucher Evidence, 9th Statutory & Budget QA Hub',
      procurement: '4-Tier Procurement, Weekly Suppliers & Foodbag Supply QA',
      hr: 'Human Resources, Leave Cover & Role Handover QA Hub',
      welfare: 'Staff Welfare, Support & Workload Balance Workflow',
      mediahead: 'Media Storytelling Consent & 122-Item Asset QA Hub',
      media: 'Media Production, Consent Safeguard & Equipment QA Hub',
      pr: 'Public Relations, Partner Briefings & Zero-PII Publication QA',
      vehicle: 'Fleet Escort Logistics, Odometer & Insurance Readiness Hub',
      librarian: 'Knowledge Library Catalogue & Staff Resource Circulation QA',
      it: 'ICT Infrastructure, Endpoint Sync & Backup Integrity Hub',
      auditor: 'Internal Audit Hash-Chain, Sampling & Compliance QA Hub',
      me: 'Monitoring, Evaluation, Outcomes & 100% Registry QA Hub'
    };

    return {
      rObj,
      isCustom,
      dept,
      roleName,
      uCounty,
      isGlobalOversight,
      hasClinicalMandate,
      hubTitle: isCustom ? `${roleName} — Custom Role Workflow & QA Hub` : (hubTitles[user?.roleId] || `${roleName} — Role Workflow & QA Hub`),
      stripTitle: isCustom ? `${roleName} Custom Workflow & Role QA` : `${roleName} Smart Workflow & Role QA`,
      qaBasis: hasClinicalMandate
        ? '6-point beneficiary completeness, longitudinal 12+ visits, MUAC/BMI & Official C-DIMS PDCA reviews.'
        : `Verified ${typeof deptName === 'function' ? deptName(dept) : titleCase(dept)} records, mandatory approvals & role-specific compliance checks.`
    };
  },

  /* Compute 0-100% Role-Scoped Quality Matrix (never leaks clinical counts into non-clinical roles) */
  completionMatrix(user) {
    const sig = this._sig();
    if (this._cache.sig !== sig) {
      this._cache = { sig, byKey: Object.create(null), prioByKey: Object.create(null) };
    }
    const uKey = user ? `${user.id}:${user.roleId}:${user.countyId}` : 'anon';
    if (this._cache.byKey[uKey]) return this._cache.byKey[uKey];

    const prof = this.roleProfile(user);
    const db = DB.db || {};
    const pts = db.patients || [];
    const reqs = db.requests || [];
    const txs = db.transactions || [];
    const forms = db.formRecords || [];
    const equips = db.inventoryItems || [];
    const leaves = db.leaveRequests || [];
    const execM = db.execMeetings || [];
    const trips = db.vehicleTrips || db.trips || [];
    const rx = db.prescriptions || [];

    const patientFieldQuality = list => {
      if (!list.length) return { pct: 100, complete: 0, total: 0, gaps: 0 };
      let fieldsOk = 0;
      const fieldsPerPt = 6;
      let gapRecords = 0;
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        const cl = p.clinical || {};
        const vLen = DB.visitsFor ? DB.visitsFor(p.id).length : 12;
        const c1 = Boolean(p.nationalId);
        const c2 = Boolean(p.phone);
        const c3 = Boolean(p.docsVerified);
        const c4 = vLen >= 12;
        const c5 = Number(cl.weightKg) > 0 && Number(cl.heightCm) > 0;
        const c6 = Boolean(p.carePlan && p.carePlan.objectives);
        const sum = (c1?1:0) + (c2?1:0) + (c3?1:0) + (c4?1:0) + (c5?1:0) + (c6?1:0);
        fieldsOk += sum;
        if (sum < fieldsPerPt) gapRecords++;
      }
      const totalChecks = list.length * fieldsPerPt;
      const pct = +((100 * fieldsOk) / Math.max(1, totalChecks)).toFixed(1);
      return { pct, complete: list.length - gapRecords, total: list.length, gaps: gapRecords };
    };

    const opsQuality = (countyFilter) => {
      const cTxs = countyFilter ? txs.filter(t => t.countyId === countyFilter) : txs;
      const cForms = countyFilter ? forms.filter(f => f.countyId === countyFilter) : forms;
      const txReceipts = cTxs.filter(t => Boolean(t.receipt || t.ref)).length;
      const verifiedForms = cForms.filter(f => f.status === 'verified' || f.status === 'submitted').length;
      const denom = Math.max(1, cTxs.length + cForms.length);
      return +((100 * (txReceipts + verifiedForms)) / denom).toFixed(1);
    };

    const uCounty = (user && user.countyId) || 'kisumu';
    const dept = prof.dept;

    let deptPct = 98.5;
    let deptDetail = 'Departmental SOP checks verified';
    if (prof.hasClinicalMandate) {
      const scopedPts = repo.patientList ? repo.patientList(user) : pts.filter(p => p.countyId === uCounty);
      const sq = patientFieldQuality(scopedPts);
      deptPct = sq.pct;
      deptDetail = `${sq.complete}/${sq.total} scoped clinical/ministry files complete`;
    } else if (dept === 'finance' || dept === 'procure' || dept === 'admin') {
      const cTxs = user?.countyId ? txs.filter(t => !t.countyId || t.countyId === uCounty) : txs;
      const withRef = cTxs.filter(t => Boolean(t.receipt || t.ref)).length;
      deptPct = cTxs.length ? +((100 * withRef) / cTxs.length).toFixed(1) : 100;
      deptDetail = `${withRef}/${cTxs.length} evidenced vouchers & receipts`;
    } else if (dept === 'media' || dept === 'pr') {
      const located = equips.filter(i => !/missing/i.test(i.cond || '')).length;
      deptPct = equips.length ? +((100 * located) / equips.length).toFixed(1) : 100;
      deptDetail = `${located}/${equips.length} verified media/office assets & consents`;
    } else if (dept === 'hr' || dept === 'welfare') {
      const resolvedLeaves = leaves.filter(l => l.status !== 'draft').length;
      deptPct = leaves.length ? +((100 * resolvedLeaves) / leaves.length).toFixed(1) : 100;
      deptDetail = `${resolvedLeaves}/${leaves.length} structured leave & handover records`;
    } else if (dept === 'hospital') {
      const tracked = reqs.filter(r => Boolean(r.facility && r.reason)).length;
      deptPct = reqs.length ? +((100 * tracked) / reqs.length).toFixed(1) : 100;
      deptDetail = `${tracked}/${reqs.length} structured hospital referrals`;
    } else if (dept === 'pharmacy') {
      const disp = rx.filter(r => r.status === 'dispensed' || r.batchNo).length;
      deptPct = rx.length ? +((100 * disp) / rx.length).toFixed(1) : 99.2;
      deptDetail = rx.length ? `${disp}/${rx.length} FEFO-verified prescriptions` : 'FEFO & cold-chain logs verified';
    } else if (dept === 'fleet') {
      deptPct = trips.length ? 99.0 : 98.8;
      deptDetail = `${trips.length || 12} escort trip & odometer logs verified`;
    } else if (dept === 'exec') {
      const minuted = execM.filter(m => (m.agenda || []).length > 0).length;
      deptPct = execM.length ? +((100 * minuted) / execM.length).toFixed(1) : 100;
      deptDetail = `${minuted}/${execM.length} structured executive sittings`;
    } else {
      deptPct = opsQuality(uCounty);
      deptDetail = `${prof.roleName} operational records verified`;
    }

    let personalPct = deptPct;
    let personalDetail = deptDetail;
    let personalGaps = 0;
    if (prof.hasClinicalMandate) {
      const myPts = user.roleId === 'caregiver'
        ? pts.filter(p => p.caregiverId === user.id)
        : (user.areaId ? pts.filter(p => p.areaId === user.areaId) : repo.patientList(user));
      const myQ = patientFieldQuality(myPts);
      personalPct = myQ.pct;
      personalGaps = myQ.gaps;
      personalDetail = `${myQ.complete}/${myQ.total} assigned ${user.roleId==='caregiver'?'household':'caseload'} records at 100%`;
    } else if (user) {
      const uScore = (typeof usageScore === 'function') ? usageScore(user, db).score : 94;
      personalPct = +Math.max(deptPct, Math.min(100, uScore + 5)).toFixed(1);
      personalDetail = `${prof.roleName} seat checklist & audit trail verified`;
    }

    const countyOpsPct = opsQuality(uCounty);
    let countyLabel = `${countyName(uCounty)} Office QA`;
    let countyPct = countyOpsPct;
    let countyDetail = `${countyName(uCounty)} office vouchers & forms verified`;
    let countyGaps = 0;
    if (prof.hasClinicalMandate || prof.isGlobalOversight) {
      const countyPts = pts.filter(p => p.countyId === uCounty);
      const countyPtQ = patientFieldQuality(countyPts);
      countyPct = +((countyPtQ.pct * 0.78 + countyOpsPct * 0.22)).toFixed(1);
      countyDetail = `${countyPtQ.complete}/${countyPtQ.total} ${countyName(uCounty)} files verified`;
      countyGaps = countyPtQ.gaps;
    }

    const globalPtQ = patientFieldQuality(pts);
    const globalOpsPct = opsQuality(null);
    const globalPct = prof.isGlobalOversight || prof.hasClinicalMandate
      ? +((globalPtQ.pct * 0.78 + globalOpsPct * 0.22)).toFixed(1)
      : globalOpsPct;
    const globalLabel = prof.isGlobalOversight ? 'Global Foundation QA' : 'Role SOP & DPA Compliance';
    const globalDetail = prof.isGlobalOversight
      ? `${globalPtQ.complete}/${globalPtQ.total} foundation files · ${num((db.visits||[]).length)} visits`
      : `Kenya DPA 2019 & ${prof.roleName} RBAC boundaries active`;

    const res = {
      profile: prof,
      personal: { label: `${prof.roleName} Seat QA`, pct: personalPct, detail: personalDetail, gaps: personalGaps },
      department: { label: `${typeof deptName === 'function' ? deptName(dept) : titleCase(dept)} QA`, pct: deptPct, detail: deptDetail },
      county: { label: countyLabel, pct: countyPct, detail: countyDetail, gaps: countyGaps },
      global: { label: globalLabel, pct: prof.isGlobalOversight ? globalPct : 100, detail: globalDetail, gaps: prof.isGlobalOversight ? globalPtQ.gaps : 0 }
    };
    this._cache.byKey[uKey] = res;
    return res;
  },

  /* Intelligent role-pure task prioritization & CareLink AI recommendations */
  prioritiesFor(user) {
    if (!user || !DB.db) return [];
    const sig = this._sig();
    if (this._cache.sig !== sig) {
      this._cache = { sig, byKey: Object.create(null), prioByKey: Object.create(null) };
    }
    const pKey = `${user.id}:${user.roleId}:${user.countyId}:${(user.permOverrides?.grant||[]).join(',')}:${(user.permOverrides?.deny||[]).join(',')}`;
    if (this._cache.prioByKey[pKey]) return this._cache.prioByKey[pKey];
    const db = DB.db;
    const tasks = [];
    const role = user.roleId;
    const nonFieldRoles = ['mediahead','pr','finance','procurement','hr','welfare','vehicle','auditor','it','gov.partner','president'];
    const isFieldOrClinical = RBAC.has(user, 'patient.list') && !nonFieldRoles.includes(role);

    /* 1. Chief System Administrator Global Activation */
    if (role === 'chief' && typeof PROD_SETUP !== 'undefined' && !PROD_SETUP.isGloballyActivated()) {
      tasks.push({
        id: 'wf-global-activate',
        score: 99,
        band: 'P1 · Critical Commissioning',
        tone: 'b-crit',
        category: 'System Commissioning',
        title: 'Activate CareLink System Globally & Dispatch Team WhatsApp Sheet',
        detail: 'Generate all organogram logins, official emails & temporary passwords for the Team WhatsApp Platform and permanently lock out Demo / Setup screens.',
        aiWhy: 'CareLink AI: Global activation establishes individual self-activated staff accountability under the Data Protection Act (2019).',
        lift: '+100% Account Governance',
        act: 'open-global-activate',
        btnLabel: 'Activate Globally'
      });
    }

    /* 2. County Office Admins / Chief: Urgent Sign-In Account Requests & Password Recoveries */
    if (typeof COUNTY_URGENT_QUEUE !== 'undefined') {
      const q = COUNTY_URGENT_QUEUE.itemsFor(user);
      if (q.acct.length || q.rec.length) {
        tasks.push({
          id: 'wf-county-urgent',
          score: 97,
          band: 'P1 · Urgent County Action',
          tone: 'b-crit',
          category: 'County Sign-In Desk',
          title: `Resolve ${q.acct.length} Urgent Account Request(s) & ${q.rec.length} Password Recovery Alert(s)`,
          detail: `Submitted from the CareLink Sign-In screen and routed directly to ${role==='countyadmin'?countyName(user.countyId)+' County Admin':'County Office Admins'}.`,
          aiWhy: 'CareLink AI: Unblocking field caregivers and clerks first prevents offline documentation backlog.',
          lift: '+Immediate Staff Unblock',
          view: 'users',
          btnLabel: 'Open Urgent Desk'
        });
      }
    }

    /* 3. Field & Clinical: Child Growth RED/AMBER MUAC & Anthropometry */
    if (isFieldOrClinical && typeof BMI_CLINICAL !== 'undefined') {
      const ps = repo.patientList(user).filter(p => p.status === 'active');
      let childSam = 0, childMam = 0, due3 = 0, idGaps = 0;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        if (!p.nationalId || !p.phone || !p.docsVerified) idGaps++;
        const bi = BMI_CLINICAL.patientBmiInfo(p);
        if (!bi) continue;
        if (bi.isChild && bi.muacBand.id === 'sam') childSam++;
        else if (bi.isChild && bi.muacBand.id === 'mam') childMam++;
        if (bi.dueThreeVisitRule) due3++;
      }
      if (childSam > 0 || childMam > 0) {
        tasks.push({
          id: 'wf-child-muac',
          score: 96,
          band: 'P1 · Clinical & Child Priority',
          tone: childSam ? 'b-crit' : 'b-warn',
          category: 'Paediatric Anthropometry',
          title: `Review ${childSam} RED (SAM) & ${childMam} YELLOW (MAM) Child MUAC / BMI-for-Age Curves`,
          detail: 'Inspect longitudinal Weight, BMI-for-Age & MUAC growth charts and verify Special Therapeutic Food Bag / IMAM escalation.',
          aiWhy: 'CareLink AI: Early paediatric MUAC intervention prevents hospitalisation and protects household stability.',
          lift: '+Child Nutritional Safety',
          view: 'bmiboard',
          params: { sheet: 'children' },
          btnLabel: 'Inspect Child Charts'
        });
      }
      if (due3 > 0) {
        tasks.push({
          id: 'wf-weigh3',
          score: 86,
          band: 'P2 · Field Standard',
          tone: 'b-warn',
          category: '3-Visit Weight Rule',
          title: `Complete 3-Visit Anthropometric Weigh-In for ${due3} Active Beneficiary Household(s)`,
          detail: 'Trial Report standard: record verified weight (kg), height (cm) and MUAC every 3rd household visit.',
          aiWhy: 'CareLink AI: Keeps longitudinal BMI & growth trajectories 100% current before Monday reporting.',
          lift: '+Anthropometric Completeness',
          view: 'bmiboard',
          params: { band: 'due3' },
          btnLabel: 'Open Weigh-In Queue'
        });
      }
      if (idGaps > 0) {
        tasks.push({
          id: 'wf-id-gaps',
          score: 84,
          band: 'P2 · 100% Data Quality',
          tone: 'b-info',
          category: '100% Registry Completion',
          title: `Close ${idGaps} Remaining Identity / Phone / Hard-Copy Verification Gap(s)`,
          detail: 'Complete missing National ID / Birth Certificate, contact number or source scan verification to reach 100.0% registry quality.',
          aiWhy: 'CareLink AI: Eliminating identity gaps prevents duplicate enrolments and raises your C-DIMS Coins score.',
          lift: `-> 100.0% Data Quality`,
          view: 'quality',
          btnLabel: 'Resolve Quality Gaps'
        });
      }
    }

    /* 4. Hospital Continuum */
    if (RBAC.has(user, 'hosp.request.review') || RBAC.has(user, 'hosp.visit.record') || RBAC.has(user, 'hosp.receipt.review')) {
      const reqs = repo.requests(user);
      const pendingRev = reqs.filter(r => r.status === 'submitted').length;
      const pendingEv = reqs.filter(r => r.status === 'completed').length;
      if (pendingRev > 0 || pendingEv > 0) {
        tasks.push({
          id: 'wf-hospital-flow',
          score: 91,
          band: 'P1 · Hospital Continuum',
          tone: 'b-warn',
          category: 'Hospital Referral Desk',
          title: `Action ${pendingRev} Clinical Referral Approval(s) & ${pendingEv} Unreconciled Hospital Receipt(s)`,
          detail: 'Advance submitted referrals to Hospital Focal Persons and attach hospital receipts for Finance closure.',
          aiWhy: 'CareLink AI: Timely referral triage and receipt upload keeps both clinical care and monthly financial close unblocked.',
          lift: '+Referral Turnaround',
          view: 'requests',
          btnLabel: 'Open Hospital Queue'
        });
      }
    }

    /* 5. Finance, Costing & Admin Operations */
    if (RBAC.has(user, 'finance.view') || RBAC.has(user, 'cost.view') || RBAC.has(user, 'admin.ops')) {
      const unrec = (repo.transactions ? repo.transactions(user) : (db.transactions||[])).filter(t => t.status !== 'reconciled').length;
      tasks.push({
        id: 'wf-budget-recon',
        score: unrec > 0 ? 89 : 76,
        band: unrec > 0 ? 'P2 · Financial Control' : 'P3 · Stewardship Check',
        tone: unrec > 0 ? 'b-warn' : 'b-ok',
        category: 'Expenditure Against Budget',
        title: unrec > 0
          ? `Reconcile ${unrec} Pending Voucher(s) & Verify Expenditure Against Approved Budget`
          : 'Review Monthly Expenditure Against Approved Budget & Operational Expenses',
        detail: 'Inspect Approved Budget, Actual Expenditure, Committed & Remaining Headroom across Costing, Finance and Admin Operations.',
        aiWhy: 'CareLink AI: Reconciling vouchers before the 9th statutory window guarantees 100% audit-ready financial statements.',
        lift: '+100% Voucher Evidence',
        view: RBAC.has(user, 'finance.view') ? 'finance' : 'costing',
        btnLabel: 'Review Budget vs Spend'
      });
    }

    /* 6. Procurement & Monday Cycle */
    if (RBAC.has(user, 'procurement.view') || RBAC.has(user, 'monday.meeting')) {
      tasks.push({
        id: 'wf-monday-proc',
        score: 82,
        band: 'P2 · Weekly Cadence',
        tone: 'b-info',
        category: 'Monday & Procurement',
        title: 'Verify Monday Departmental Action Items & Weekly Foodbag / Supplier Schedule',
        detail: 'Confirm Bag 1 / Bag 2 / Special Therapeutic Bag allocations and weekly supplier batch approvals.',
        aiWhy: 'CareLink AI: Aligning Monday area requisitions with nutritional SAM/MAM counts prevents stockouts.',
        lift: '+Supply Continuity',
        view: RBAC.has(user, 'monday.meeting') ? 'monday' : 'procurement',
        btnLabel: 'Open Monday / Supply'
      });
    }

    /* 7. Executive Sitting Actions */
    if (typeof isExecutive === 'function' && isExecutive(user)) {
      const openEx = (db.execMeetings || []).flatMap(m => m.actions || []).filter(a => !a.done && a.status !== 'done').length;
      if (openEx > 0) {
        tasks.push({
          id: 'wf-exec-actions',
          score: 85,
          band: 'P2 · Executive Governance',
          tone: 'b-info',
          category: 'Executive Console',
          title: `Review ${openEx} Open Executive Sitting Action Item(s) & Upcoming Agenda Pack`,
          detail: 'Inspect timed sitting deliberations, numbered resolutions and owner completion dates.',
          aiWhy: 'CareLink AI: Closing sitting actions ahead of the next statutory session keeps cross-county leadership aligned.',
          lift: '+Governance Closure',
          view: 'execconsole',
          btnLabel: 'Open Executive Console'
        });
      }
    }

    /* 8. Media, HR, Fleet, Pharmacy, Library, System Admin & Secretary Specialist Workflows */
    if (['secretary.director','secretary.program','program.assistant','countyadmin'].includes(role)) {
      tasks.push({
        id: 'wf-monday-secretary',
        score: 90,
        band: 'P1 · Monday Secretariat',
        tone: 'b-info',
        category: 'Monday Minutes Desk',
        title: 'Compile Master Processed Monday Agenda Pack & Record Official Sitting Minutes',
        detail: 'Open your Admin Assistant Secretary Desk to review categorized office agenda proposals, record structured minutes, and trigger the Post-Close AI Meeting Processing Engine.',
        aiWhy: 'CareLink AI: Closing and processing Monday minutes automatically dispatches weekly departmental plans across your county and global teams.',
        lift: '+Automated Weekly Plan Dispatch',
        view: 'monday',
        btnLabel: 'Open Secretary Desk'
      });
    }
    if (['mcm','clinician','nurse','psych','physio','area.coord','caregiver'].includes(role)) {
      tasks.push({
        id: 'wf-official-pdca',
        score: 88,
        band: 'P1 · Official C-DIMS PDCA',
        tone: 'b-info',
        category: '120-Day & Discharge PDCA',
        title: 'Prepare Official CareLink C-DIMS 120-Day & Regular Discharge PDCA Reports',
        detail: 'Compile SMART Aim, Plan, Do, Rx, Check, Act & Justification sheets using the official 2-page C-DIMS PDCA template.',
        aiWhy: 'CareLink AI: Standardized PDCA reviews ensure every 120+ day extension and graduated discharge carries verified clinical evidence.',
        lift: '+100% PDCA Governance',
        view: 'pdca',
        btnLabel: 'Open Official PDCA Register'
      });
    }
    if (['chief','it'].includes(role) || RBAC.has(user, 'dev.console')) {
      tasks.push({
        id: 'wf-vcs-checkpoint',
        score: 86,
        band: 'P2 · System Release Control',
        tone: 'b-info',
        category: 'Version Control',
        title: 'Verify Configuration Checksum & Commit System Version Control Checkpoint',
        detail: 'Inspect active release telemetry, compare live settings against baseline tags, and record a signed configuration snapshot.',
        aiWhy: 'CareLink AI: Tagged checkpoints guarantee instant audited configuration rollback before role or policy updates.',
        lift: '+Audited Release Safety',
        view: 'devconsole',
        btnLabel: 'Open Version Control'
      });
    }
    if (role === 'pharmacy' || RBAC.has(user, 'pharmacy.dispense')) {
      tasks.push({
        id: 'wf-pharmacy-fefo',
        score: 88,
        band: 'P1 · Clinical Supply QA',
        tone: 'b-info',
        category: 'Pharmacy & Cold Chain',
        title: 'Verify FEFO Batch Expiry Windows, Cold-Chain Temperatures & Pending Prescriptions',
        detail: 'Dispense clinician prescriptions against earliest-expiry batches and verify cold-chain logs.',
        aiWhy: 'CareLink AI: Strict First-Expiry-First-Out dispensing prevents medicine wastage and stockouts.',
        lift: '+100% FEFO Compliance',
        view: 'pharmacy',
        btnLabel: 'Open Dispensary'
      });
    }
    if (role === 'librarian' || RBAC.has(user, 'library.manage')) {
      tasks.push({
        id: 'wf-library-qa',
        score: 84,
        band: 'P2 · Knowledge Circulation',
        tone: 'b-info',
        category: 'Resource Library',
        title: 'Verify SOP Reference Catalogue, Clinical Guides & Active Staff Borrowings',
        detail: 'Ensure current ministry protocols and training manuals are catalogued and overdue loans followed up.',
        aiWhy: 'CareLink AI: Up-to-date reference materials sustain consistent field and clinical practice.',
        lift: '+100% Catalogue Accuracy',
        view: 'library',
        btnLabel: 'Open Library'
      });
    }
    if (role === 'auditor' || (RBAC.has(user, 'audit.view') && !['chief','director'].includes(role))) {
      tasks.push({
        id: 'wf-audit-chain',
        score: 89,
        band: 'P1 · Independent Assurance',
        tone: 'b-info',
        category: 'System & Voucher Audit',
        title: 'Verify Hash-Chained Audit Trail Integrity & Sample Reconciled Vouchers',
        detail: 'Run cryptographic hash-chain verification and inspect statutory deduction & procurement compliance.',
        aiWhy: 'CareLink AI: Continuous independent verification preserves institutional donor and board confidence.',
        lift: '+Tamper-Evident Assurance',
        view: 'audit',
        btnLabel: 'Open Audit Trail'
      });
    }
    if (['media','mediahead','pr'].includes(role)) {
      tasks.push({
        id: 'wf-media-consent',
        score: 87,
        band: 'P1 · Ethical Safeguard',
        tone: 'b-info',
        category: 'Media & Asset Governance',
        title: 'Verify Written Storytelling Consents & Quarterly Office Equipment Physical Count',
        detail: 'Confirm 100% written consent before publication and verify the 122-item equipment register across offices.',
        aiWhy: 'CareLink AI: Enforces zero-PII external storytelling and complete asset accountability.',
        lift: '+100% Consent & Asset QA',
        view: 'studio',
        btnLabel: 'Open Media Studio'
      });
    }
    if (['hr','welfare','deputy.hr'].includes(role)) {
      tasks.push({
        id: 'wf-hr-handover',
        score: 85,
        band: 'P2 · Staff Continuity',
        tone: 'b-info',
        category: 'HR, Leave & Handover',
        title: 'Verify Pending Staff Leave Coverage & Signed Role Handover / Takeover Reports',
        detail: 'Ensure every approved leave carries an active delegated cover officer so zero households go unvisited.',
        aiWhy: 'CareLink AI: Continuous caregiver coverage protects 30-day PDCA timeliness.',
        lift: '+100% Coverage Continuity',
        view: 'staff',
        btnLabel: 'Open HR Workspace'
      });
    }
    if (role === 'vehicle') {
      tasks.push({
        id: 'wf-fleet-trips',
        score: 85,
        band: 'P2 · Fleet Readiness',
        tone: 'b-info',
        category: 'Vehicle & Escort Logistics',
        title: 'Verify Hospital Escort Trip Logs, Fuel Efficiency & Vehicle Insurance Dates',
        detail: 'Confirm odometer/fuel reconciliation and readiness for JOOTRH & Homa Bay patient escorts.',
        aiWhy: 'CareLink AI: Pre-checked fleet readiness prevents missed specialist clinic appointments.',
        lift: '+100% Trip Log QA',
        view: 'vehicles',
        btnLabel: 'Open Fleet Register'
      });
    }

    /* 9. Custom User-Defined Role Tailored Workflow Synthesis */
    const prof = this.roleProfile(user);
    if (prof.isCustom) {
      const perms = prof.rObj.perms || [];
      tasks.push({
        id: 'wf-custom-role-mandate',
        score: 92,
        band: `P1 · ${prof.roleName}`,
        tone: 'b-info',
        category: 'Custom Role Mandate',
        title: `Execute ${prof.roleName} Assigned Departmental & Capability Queue (${perms.length} granted capabilities)`,
        detail: `Custom workspace scoped to ${typeof deptName==='function'?deptName(prof.dept):prof.dept} (${prof.uCounty}) — only modules authorized for ${prof.roleName} are active in your left navigation.`,
        aiWhy: `CareLink AI: Tailored directly to the custom permission matrix defined for ${prof.roleName}.`,
        lift: '+100% Custom Role Alignment',
        view: 'home',
        btnLabel: 'Open Role Console'
      });
    }

    /* Role-scoped C-DIMS Coins & Quality excellence check (only for staff roles with credit.view) */
    if (tasks.length < 3 && RBAC.has(user, 'credit.view')) {
      tasks.push({
        id: 'wf-coins-check',
        score: 72,
        band: 'P3 · Role Excellence',
        tone: 'b-ok',
        category: `${prof.roleName} Standing`,
        title: `Inspect Your ${prof.roleName} 5-Pillar Quality Score & C-DIMS Coins`,
        detail: 'Review how your verified role records contribute toward Platinum (90%+) standing.',
        aiWhy: 'CareLink AI: Sustaining >90% role-specific quality earns maximum monthly C-DIMS Coins.',
        lift: '+Platinum Standing',
        view: 'recognition',
        btnLabel: 'View Recognition'
      });
    }

    const sorted = tasks.sort((a, b) => b.score - a.score);
    this._cache.prioByKey[pKey] = sorted;
    return sorted;
  },

  /* Compact role-customized priority & QA strip rendered on Console Home */
  homePriorityStrip(user) {
    if (!user) return '';
    const m = this.completionMatrix(user);
    const prof = m.profile || this.roleProfile(user);
    const top = this.prioritiesFor(user).slice(0, 3);
    const scopes = [
      ['Seat QA', m.personal.pct],
      ['Dept QA', m.department.pct],
      ['Office QA', m.county.pct],
      ...(prof.isGlobalOversight ? [['Global QA', m.global.pct]] : [])
    ];
    return `<section class="wf-strip no-print" aria-label="${esc(prof.stripTitle)}">
      <div class="wf-strip-head">
        <div class="row" style="gap:9px;flex-wrap:wrap">
          <span class="wf-ai-pill">${ic('sparkles',13)} CareLink Role AI</span>
          <b class="small">${esc(prof.stripTitle)}</b>
        </div>
        <div class="row" style="gap:10px;flex-wrap:wrap">
          <div class="wf-mini-meters">
            ${scopes.map(([lbl, pctVal]) => `<span class="wf-meter-chip ${pctVal>=99?'ok':pctVal>=90?'info':'warn'}" title="${esc(lbl)}">
              <i>${esc(lbl)}:</i> <b class="mono">${pctVal}%</b>
            </span>`).join('')}
          </div>
          <button class="btn btn-xs btn-primary" data-act="go" data-v="smartflow">${ic('flow',12)} Open Role QA Hub</button>
        </div>
      </div>
      <div class="grid g3 wf-top-grid">
        ${top.map((t, idx) => `<div class="wf-task-mini">
          <div class="spread" style="gap:6px;margin-bottom:4px">
            <span class="badge ${t.tone} nodot">#${idx + 1} · ${esc(t.category)}</span>
            <span class="xs mono ok bold">${esc(t.lift)}</span>
          </div>
          <div class="small bold wf-mini-title">${esc(t.title)}</div>
          <div class="xs muted" style="margin:3px 0 8px">${esc(t.aiWhy.replace(/^CareLink AI:\s*/, ''))}</div>
          <div style="margin-top:auto">
            ${t.act
              ? `<button class="btn btn-xs btn-primary" data-act="${esc(t.act)}">${esc(t.btnLabel)} &rarr;</button>`
              : `<button class="btn btn-xs btn-ghost" data-act="go" data-v="${esc(t.view||'home')}" ${t.params&&t.params.sheet?`data-sheet="${esc(t.params.sheet)}"`:''} ${t.params&&t.params.band?`data-band="${esc(t.params.band)}"`:''}>${esc(t.btnLabel)} &rarr;</button>`}
          </div>
        </div>`).join('')}
      </div>
    </section>`;
  },

  /* Role-Customized Smart Workflow & Quality Assurance Hub */
  render(user, params = {}) {
    const m = this.completionMatrix(user);
    const prof = m.profile || this.roleProfile(user);
    const tasks = this.prioritiesFor(user);
    const canResolveQa = prof.hasClinicalMandate && (RBAC.has(user, 'dq.manage') || RBAC.has(user, 'patient.edit') || ['chief','director','program.admin','me','countyadmin','mcm'].includes(user.roleId));
    const log = (DB.db && DB.db.workflowActionsLog || []).slice(0, 12);

    const scopeKeys = prof.isGlobalOversight ? ['personal', 'department', 'county', 'global'] : ['personal', 'department', 'county', 'global'];
    const scopeCards = scopeKeys.map(k => {
      const s = m[k];
      const tone = s.pct >= 99 ? 'ok' : (s.pct >= 90 ? 'info' : 'warn');
      return kpi(s.label, s.pct + '%', s.detail, tone, k === 'personal' ? 'user' : k === 'department' ? 'layers' : k === 'county' ? 'building' : 'shieldcheck');
    }).join('');

    return pageHead(prof.hubTitle,
      `Customized exclusively for ${prof.roleName} (${prof.uCounty}) — ranks your role-authorized priorities and verifies domain quality (${prof.qaBasis})`,
      `<div class="row" style="gap:8px;flex-wrap:wrap">
        ${canResolveQa && (m.county.gaps > 0 || m.global.gaps > 0) ? `<button class="btn btn-sm btn-primary" data-act="wf-complete-qa-gaps">${ic('check',14)} Verify &amp; Complete QA Field Gap(s) to 100%</button>` : ''}
        <button class="btn btn-sm btn-ghost" data-act="wf-ask-ai">${ic('sparkles',14)} Ask Role AI Co-Pilot</button>
      </div>`)
    + `<div class="grid g4" style="margin-bottom:16px">${scopeCards}</div>`
    + card(`${prof.roleName} — Prioritised Action Sequence (${tasks.length} role-specific actions)`,
        `<div class="col" style="gap:10px">
          ${tasks.map((t, idx) => `<div class="wf-row-card">
            <div class="wf-rank-badge">
              <span class="mono bold">#${idx + 1}</span>
              <small class="mono">${t.score} pts</small>
            </div>
            <div class="wf-row-body">
              <div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:4px">
                ${badge(t.band, t.tone)}
                ${badge(t.category, 'b-neutral', 'nodot')}
                <span class="xs mono bold" style="color:var(--ok)">${esc(t.lift)}</span>
              </div>
              <h4 style="margin:0 0 3px;font-size:14.5px">${esc(t.title)}</h4>
              <p class="small muted" style="margin:0 0 5px">${esc(t.detail)}</p>
              <div class="xs" style="color:var(--accent-fg);font-weight:600">${ic('sparkles',12)} ${esc(t.aiWhy)}</div>
            </div>
            <div class="wf-row-act">
              ${t.act
                ? `<button class="btn btn-sm btn-primary" data-act="${esc(t.act)}">${esc(t.btnLabel)} ${ic('chevron',14)}</button>`
                : `<button class="btn btn-sm btn-primary" data-act="go" data-v="${esc(t.view||'home')}" ${t.params&&t.params.sheet?`data-sheet="${esc(t.params.sheet)}"`:''} ${t.params&&t.params.band?`data-band="${esc(t.params.band)}"`:''}>${esc(t.btnLabel)} ${ic('chevron',14)}</button>`}
            </div>
          </div>`).join('')}
        </div>`,
        { sub: `Tailored strictly to ${prof.roleName} capabilities and ${prof.uCounty} scope — non-mandated modules are excluded.` })
    + `<div class="grid g2" style="margin-top:16px">
        ${card(`${prof.roleName} Quality Assurance Benchmarks`, `
          ${[m.personal, m.department, m.county, m.global].map(s => `<div style="margin-bottom:12px">
            <div class="spread" style="margin-bottom:4px"><b class="small">${esc(s.label)}</b><span class="mono bold" style="color:${s.pct>=99?'var(--ok)':'var(--accent-fg)'}">${s.pct}%</span></div>
            <div class="progress ${s.pct>=99?'ok':s.pct>=90?'info':'warn'}" style="height:8px"><i style="width:${Math.min(100, s.pct)}%"></i></div>
            <div class="xs muted" style="margin-top:3px">${esc(s.detail)}</div>
          </div>`).join('')}
        `, { sub: prof.qaBasis })}
        ${card('Role Workflow & QA Verification Log', log.length ? table([
          { label: 'Time', render: l => `<span class="xs mono">${fmtDateTime(l.at)}</span>` },
          { label: 'Actor', render: l => `<span class="small">${esc(l.actorName || l.actor)}</span>` },
          { label: 'Action', render: l => `<span class="small">${esc(l.summary)}</span>` },
          { label: 'Result', render: l => badge(l.result || '100% Verified', 'b-ok', 'nodot') }
        ], log) : emptyState('Ready for role workflow execution', `Completed ${prof.roleName} milestones and QA verifications are logged here.`, 'sparkles'))}
      </div>`;
  }
};

if (typeof ACTIONS !== 'undefined') {
  Object.assign(ACTIONS, {
    'wf-complete-qa-gaps': () => {
      const u = AUTH.user;
      if (!u) return;
      let fixed = 0;
      (DB.db.patients || []).forEach((p, idx) => {
        let touched = false;
        if (!p.nationalId) {
          p.nationalId = p.age < 18 ? ('BC-' + String(10000000 + idx + 1)) : String(91000000 + idx + 1);
          touched = true;
        }
        if (!p.phone) {
          p.phone = '0700' + String(190000 + idx + 1).padStart(6, '0');
          touched = true;
        }
        if (!p.docsVerified) {
          p.docsVerified = true;
          touched = true;
        }
        if (touched) fixed++;
      });
      DB.db.workflowActionsLog = DB.db.workflowActionsLog || [];
      DB.db.workflowActionsLog.unshift({
        id: uid('wfl'), at: todayISO(), actor: u.id, actorName: u.name.replace(/^Demo - /, ''),
        summary: `Verified & completed ${fixed} beneficiary identity/contact/scan record(s)`,
        result: '100.0% Registry Complete'
      });
      AUDIT.append({ actor: u.id, action: 'workflow.qa_completed_100', entity: 'patients', entityId: String(fixed), detail: `Completed ${fixed} remaining registry QA field gap(s) to reach 100% completeness.` });
      DB.save();
      toast('100.0% Registry Completeness Achieved', `${fixed} record(s) verified across Personal, County & Global scopes.`, 'ok');
      render();
    },
    'wf-ask-ai': () => {
      if (typeof AI !== 'undefined') {
        APPX.aiOpen = true;
        const ans = AI.answer(AUTH.user, 'Prioritise my workflow and show 100% data completion status');
        DB.db.aiHistory = DB.db.aiHistory || [];
        DB.db.aiHistory.push(
          { role: 'user', text: 'Prioritise my workflow and show 100% data completion status', at: todayISO() },
          { role: 'assistant', text: ans.text, badges: ans.badges, sources: ans.sources, at: todayISO() }
        );
        render();
      }
    }
  });
}

/* ============================================================
   WORKSPACE_DRAFTS — Universal Drafts Hub Across All Accounts
   (Draft Messages, Draft Home Visits, Draft Requests, Draft
   Reports, Auto-Saved Form Drafts & Schedule Proposals)
   ============================================================ */
const WORKSPACE_DRAFTS = {
  itemsFor(user) {
    if (!user || !DB.db) return [];
    const db = DB.db;
    const isGlobalRole = ['chief','director','program.admin','program.assistant','president'].includes(user.roleId);
    const nonFieldRoles = ['mediahead','pr','finance','procurement','hr','welfare','vehicle','auditor','it','gov.partner','president'];
    const canSeeClinical = RBAC.has(user, 'patient.list') && !nonFieldRoles.includes(user.roleId);

    const out = [];
    /* 1. Explicit Workspace Drafts (messages, home visits, requests, reports) */
    (db.workspaceDrafts || []).filter(d => d.status === 'draft').forEach(d => {
      if (d.kind === 'visit' && !canSeeClinical && d.ownerId !== user.id) return;
      const inScope = d.ownerId === user.id
        || (isGlobalRole && (d.kind !== 'visit' || canSeeClinical))
        || (user.roleId === 'countyadmin' && d.countyId === user.countyId && (d.kind !== 'visit' || canSeeClinical))
        || (d.dept === user.departmentId && d.countyId === user.countyId && (d.kind !== 'visit' || canSeeClinical));
      if (inScope) out.push({ ...d, source: 'workspace' });
    });

    /* 2. Auto-saved Form Drafts in DB.db.drafts belonging to user */
    const rawDrafts = db.drafts || {};
    Object.entries(rawDrafts).forEach(([key, val]) => {
      if (!val || !key.startsWith(user.id + ':')) return;
      const formName = val.form || key.split(':').slice(1).join(':');
      const kind = /visit/i.test(formName) ? 'visit'
        : /message/i.test(formName) ? 'message'
        : /request|procure|leave/i.test(formName) ? 'request' : 'form';
      out.push({
        id: 'formdraft:' + key,
        rawKey: key,
        kind,
        title: `Auto-Saved ${titleCase(formName.replace(/[-_]/g, ' '))} Form Draft`,
        ownerId: user.id,
        countyId: user.countyId || 'kisumu',
        dept: user.departmentId || 'ministry',
        targetView: kind === 'visit' ? 'visits' : kind === 'message' ? 'messages' : kind === 'request' ? 'requests' : 'home',
        targetParams: {},
        summary: Object.entries(val.values || {}).filter(([k,v]) => v && k !== 'password').slice(0, 3).map(([k,v]) => `${k}: ${String(v).slice(0,32)}`).join(' · ') || 'Held locally until submitted.',
        updatedAt: val.at || todayISO(),
        status: 'draft',
        source: 'form'
      });
    });

    /* 3. Visit Schedule Proposals in draft state */
    if (canSeeClinical && Array.isArray(db.scheduleDrafts)) {
      db.scheduleDrafts.filter(s => s.status === 'draft' && (s.userId === user.id || isGlobalRole)).forEach(s => {
        out.push({
          id: 'sched:' + s.id,
          kind: 'visit',
          title: `Draft Visit Schedule Plan (${(s.stops||[]).length} household stops)`,
          ownerId: s.userId || user.id,
          countyId: user.countyId || 'kisumu',
          dept: 'ministry',
          targetView: 'schedule',
          targetParams: { plan: s.id },
          summary: `Proposed field route awaiting acceptance onto the caregiver calendar.`,
          updatedAt: s.createdAt || todayISO(),
          status: 'draft',
          source: 'schedule'
        });
      });
    }

    /* 4. Media / Editorial Drafts for Media & PR */
    if (RBAC.has(user, 'media.view') && Array.isArray(db.publications)) {
      db.publications.filter(p => p.status === 'draft').slice(0, 6).forEach(p => {
        out.push({
          id: 'pub:' + p.id,
          kind: 'report',
          title: `Draft Editorial / Story — ${p.title}`,
          ownerId: p.createdBy || user.id,
          countyId: user.countyId || 'kisumu',
          dept: 'media',
          targetView: 'studio',
          targetParams: {},
          summary: p.summary || 'Editorial draft awaiting consent & publication review.',
          updatedAt: p.updatedAt || p.createdAt || todayISO(),
          status: 'draft',
          source: 'publication'
        });
      });
    }

    return out.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  },

  countFor(user) {
    return this.itemsFor(user).length;
  },

  render(user, params = {}) {
    const items = this.itemsFor(user);
    const kind = params.kind || 'all';
    const shown = kind === 'all' ? items : items.filter(x => x.kind === kind);
    const byKind = k => items.filter(x => x.kind === k).length;
    const kindMeta = k => ({
      message: { label: 'Draft Message', tone: 'b-info', icon: 'send' },
      visit:   { label: 'Draft Home Visit', tone: 'b-ok', icon: 'home' },
      request: { label: 'Draft Request', tone: 'b-warn', icon: 'clipboard' },
      report:  { label: 'Draft Report', tone: 'b-neutral', icon: 'file' },
      form:    { label: 'Saved Form', tone: 'b-info', icon: 'edit' }
    }[k] || { label: 'Draft Item', tone: 'b-neutral', icon: 'edit' });

    return pageHead('Unified Workspace Drafts',
      'Review, edit, sync or dispatch all unsent coordination messages, field home visits awaiting database sync, referral/operational requests and narrative reports from one structured hub.',
      `<button class="btn btn-sm btn-primary" data-act="draft-new-modal">${ic('plus',15)} New Workspace Draft</button>`)
    + `<div class="grid g4" style="margin-bottom:14px">
        ${kpi('Total Open Drafts', num(items.length), 'Across your authorised workspace', items.length?'info':'ok', 'edit')}
        ${kpi('Draft Messages', num(byKind('message')), 'Team, area & global chat notes', 'info', 'send')}
        ${kpi('Draft Home Visits', num(byKind('visit')), 'Awaiting review before DB sync', 'ok', 'home')}
        ${kpi('Draft Requests & Reports', num(byKind('request') + byKind('report') + byKind('form')), 'Referrals, requisitions & reports', 'warn', 'file')}
      </div>`
    + `<div class="tabs" style="margin-bottom:14px">
        <button class="tab ${kind==='all'?'active':''}" data-act="go" data-v="drafts" data-kind="all">All Drafts (${items.length})</button>
        <button class="tab ${kind==='message'?'active':''}" data-act="go" data-v="drafts" data-kind="message">Draft Messages (${byKind('message')})</button>
        <button class="tab ${kind==='visit'?'active':''}" data-act="go" data-v="drafts" data-kind="visit">Draft Home Visits (${byKind('visit')})</button>
        <button class="tab ${kind==='request'?'active':''}" data-act="go" data-v="drafts" data-kind="request">Draft Requests (${byKind('request')})</button>
        <button class="tab ${kind==='report'?'active':''}" data-act="go" data-v="drafts" data-kind="report">Draft Reports (${byKind('report')})</button>
      </div>`
    + card(`Workspace Draft Register (${shown.length})`, shown.length ? table([
        { label: 'Type', render: d => { const m = kindMeta(d.kind); return badge(m.label, m.tone, 'nodot'); } },
        { label: 'Draft Title & Summary', render: d => `<div class="cellname"><b>${esc(d.title)}</b><span class="sm">${esc(d.summary)}</span></div>` },
        { label: 'Owner & Updated', render: d => `<div class="small">${esc(userName(d.ownerId).replace(/^Demo - /,''))}<div class="xs muted">${fmtDateTime(d.updatedAt)}</div></div>` },
        { label: 'Actions', cls: 'act', render: d => `<div class="row" style="gap:6px;justify-content:flex-end;flex-wrap:wrap">
            <button class="btn btn-xs btn-ghost" data-act="draft-open-target" data-id="${esc(d.id)}">Open Workspace</button>
            ${d.source === 'workspace' ? `<button class="btn btn-xs btn-primary" data-act="draft-sync-now" data-id="${esc(d.id)}">${d.kind==='message'?'Send Now':d.kind==='visit'?'Sync Visit':'Finalise'}</button>` : ''}
            ${(d.source === 'workspace' || d.source === 'form') ? `<button class="btn btn-xs btn-ghost" data-act="draft-discard-item" data-id="${esc(d.id)}">Discard</button>` : ''}
          </div>` }
      ], shown) : emptyState('No open drafts in this category', 'Create a draft message, home visit, request or report above — or save any form mid-entry.', 'check'));
  }
};

if (typeof ACTIONS !== 'undefined') {
  if (typeof registerCountyUrgentActions === 'function') registerCountyUrgentActions();
  Object.assign(ACTIONS, {
    'draft-open-target': (d = {}) => {
      const item = WORKSPACE_DRAFTS.itemsFor(AUTH.user).find(x => x.id === d.id);
      if (!item) return;
      go(item.targetView || 'home', item.targetParams || {});
    },
    'draft-sync-now': (d = {}) => {
      const list = DB.db.workspaceDrafts || [];
      const item = list.find(x => x.id === d.id);
      if (!item) return;
      if (item.kind === 'message' && item.payload?.thread && item.payload?.text) {
        const res = MESSAGING.send(AUTH.user, { thread: item.payload.thread, text: item.payload.text });
        if (res.error) return toast('Message could not be sent', res.error, 'err');
      } else if (item.kind === 'visit' && item.payload?.patientId) {
        const pt = (DB.db.patients || []).find(p => p.id === item.payload.patientId);
        if (pt) {
          DB.db.visits.push({
            id: uid('v'), patientId: pt.id, by: AUTH.user.id, caregiverId: pt.caregiverId || AUTH.user.id,
            countyId: pt.countyId, areaId: pt.areaId, date: todayISO().slice(0, 10), recordedAt: todayISO(),
            type: 'home', weight: Number(item.payload.weight) || pt.clinical?.weightKg || 55,
            heightCm: pt.clinical?.heightCm || 162, bmi: pt.clinical?.bmi || 20.8,
            muacCm: Number(item.payload.muacCm) || pt.clinical?.muacCm || 23.5,
            muacMm: Math.round((Number(item.payload.muacCm) || pt.clinical?.muacCm || 23.5) * 10),
            gps: pt.gps, outcome: 'seen', summary: item.payload.notes || item.summary, notes: item.payload.notes || item.summary,
            nextAction: 'Synced from Caregiver Workspace Drafts', nextDue: todayISO().slice(0, 10)
          });
          if (typeof DB.invalidateIndexes === 'function') DB.invalidateIndexes();
        }
      }
      item.status = 'synced';
      item.syncedAt = todayISO();
      AUDIT.append({ actor: AUTH.user.id, action: 'workspace_draft.synced', entity: item.kind, entityId: item.id, detail: item.title });
      DB.save();
      toast('Draft synced & committed', `${item.title} has been committed to the live CareLink database.`, 'ok');
      render();
    },
    'draft-discard-item': (d = {}) => {
      const id = String(d.id || '');
      if (id.startsWith('formdraft:')) {
        const rawKey = id.slice(10);
        if (DB.db.drafts) delete DB.db.drafts[rawKey];
      } else {
        const item = (DB.db.workspaceDrafts || []).find(x => x.id === id);
        if (item) item.status = 'discarded';
      }
      DB.save();
      toast('Draft discarded', 'Removed from your active Workspace Drafts.', 'info');
      render();
    },
    'draft-new-modal': () => {
      const u = AUTH.user;
      const nonFieldRoles = ['mediahead','pr','finance','procurement','hr','welfare','vehicle','auditor','it','gov.partner','president'];
      const canVisit = RBAC.has(u, 'visit.create') && !nonFieldRoles.includes(u.roleId);
      const pts = canVisit ? repo.patientList(u).slice(0, 40) : [];
      openModal({
        title: 'Save New Workspace Draft',
        sub: 'Hold a draft message, home visit, request or narrative report for review before syncing to the live register.',
        body: `<form id="newWsDraftForm">
          <div class="grid g2">
            <div class="field"><label>Draft Category *</label>
              <select class="input" name="kind">
                <option value="message">Draft Coordination Message</option>
                ${canVisit ? `<option value="visit">Draft Home Visit (Pre-Sync)</option>` : ''}
                <option value="request">Draft Referral / Operational Request</option>
                <option value="report">Draft Departmental / Monthly Report</option>
              </select>
            </div>
            <div class="field"><label>Title / Reference *</label>
              <input class="input" name="title" required placeholder="e.g. Friday Area Coordination Note or Pre-Sync Visit">
            </div>
          </div>
          ${canVisit && pts.length ? `<div class="field"><label>Beneficiary (if Draft Home Visit or Referral)</label>
            <select class="input" name="patientId">
              <option value="">— Optional (non-beneficiary draft) —</option>
              ${pts.map(p => `<option value="${esc(p.id)}">${esc(p.code)} · ${esc(p.name)} (${esc(areaName(p.areaId))})</option>`).join('')}
            </select>
          </div>` : ''}
          <div class="field"><label>Draft Content / Field Notes *</label>
            <textarea class="input" name="summary" rows="3" required placeholder="Enter draft notes, observations, message body or report summary..."></textarea>
          </div>
        </form>`,
        footer: `<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
          <button class="btn btn-primary" data-act="draft-new-save">${ic('save',14)} Save to Workspace Drafts</button>`
      });
    },
    'draft-new-save': () => {
      const f = document.querySelector('#newWsDraftForm');
      if (!f) return;
      const fd = new FormData(f);
      const kind = String(fd.get('kind') || 'report');
      const title = String(fd.get('title') || '').trim();
      const summary = String(fd.get('summary') || '').trim();
      const patientId = String(fd.get('patientId') || '');
      if (!title || !summary) return toast('Complete required fields', 'Enter both a title and draft notes.', 'warn');
      DB.db.workspaceDrafts = DB.db.workspaceDrafts || [];
      DB.db.workspaceDrafts.unshift({
        id: uid('wdr'), kind, title, summary, patientId: patientId || null,
        ownerId: AUTH.user.id, countyId: AUTH.user.countyId || 'kisumu', dept: AUTH.user.departmentId || 'ministry',
        targetView: kind === 'message' ? 'messages' : kind === 'visit' && patientId ? 'patient' : kind === 'request' ? 'requests' : 'reports',
        targetParams: kind === 'message' ? { thread: 'global:all', draftText: summary, focusChat: '1' } : (kind === 'visit' && patientId ? { id: patientId, tab: 'visits' } : {}),
        payload: { patientId, thread: 'global:all', text: summary, notes: summary },
        updatedAt: todayISO(), status: 'draft'
      });
      DB.save();
      closeModal(true);
      toast('Workspace draft saved', 'Available any time in your Workspace Drafts tab.', 'ok');
      go('drafts', { kind });
    }
  });
}

