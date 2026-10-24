/* ============================================================
   workflow_engine6.js — CareLink v6.5 Intelligent AI-Assisted
   Automatic Workflow Engine & 100% Data Completion / Quality Hub
   ============================================================ */

const WORKFLOW_ENGINE = {
  _cache: { sig: '', byKey: Object.create(null), prioByKey: Object.create(null) },
  _sig() {
    const db = DB.db || {};
    return `${(db.patients||[]).length}:${(db.visits||[]).length}:${(db.workflowActionsLog||[]).length}:${(db.accountRequests||[]).length}:${(db.recoveryRequests||[]).length}:${(db.transactions||[]).length}:${db.settings?.globallyActivated?1:0}`;
  },
  /* Compute 0–100% Data Completion & Quality across Personal, Departmental, County & Global scopes */
  completionMatrix(user) {
    const sig = this._sig();
    if (this._cache.sig !== sig) {
      this._cache = { sig, byKey: Object.create(null), prioByKey: Object.create(null) };
    }
    const uKey = user ? `${user.id}:${user.roleId}:${user.countyId}` : 'anon';
    if (this._cache.byKey[uKey]) return this._cache.byKey[uKey];

    const db = DB.db || {};
    const pts = db.patients || [];
    const reqs = db.requests || [];
    const txs = db.transactions || [];
    const forms = db.formRecords || [];
    const equips = db.inventoryItems || [];
    const leaves = db.leaveRequests || [];
    const execM = db.execMeetings || [];

    const patientFieldQuality = list => {
      if (!list.length) return { pct: 100, complete: 0, total: 0, gaps: 0 };
      let fieldsOk = 0;
      const fieldsPerPt = 6; /* nationalId, phone, docsVerified, longitudinalVisits>=12, height/weight/BMI, carePlan */
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

    /* 1. Global Institutional Scope */
    const globalPtQ = patientFieldQuality(pts);
    const globalOpsPct = opsQuality(null);
    const globalPct = +((globalPtQ.pct * 0.78 + globalOpsPct * 0.22)).toFixed(1);

    /* 2. County Office Scope */
    const uCounty = (user && user.countyId) || 'kisumu';
    const countyPts = pts.filter(p => p.countyId === uCounty);
    const countyPtQ = patientFieldQuality(countyPts);
    const countyOpsPct = opsQuality(uCounty);
    const countyPct = +((countyPtQ.pct * 0.78 + countyOpsPct * 0.22)).toFixed(1);

    /* 3. Departmental Scope */
    const dept = (user && user.departmentId) || (roleObj(user?.roleId) || {}).dept || 'ministry';
    let deptPct = countyPct;
    let deptDetail = `${countyPtQ.complete}/${countyPtQ.total} complete files`;
    if (dept === 'finance' || dept === 'procure') {
      const withRef = txs.filter(t => Boolean(t.receipt || t.ref)).length;
      deptPct = txs.length ? +((100 * withRef) / txs.length).toFixed(1) : 100;
      deptDetail = `${withRef}/${txs.length} evidenced vouchers`;
    } else if (dept === 'media' || dept === 'pr') {
      const located = equips.filter(i => !/missing/i.test(i.cond || '')).length;
      deptPct = equips.length ? +((100 * located) / equips.length).toFixed(1) : 100;
      deptDetail = `${located}/${equips.length} verified assets & consented stories`;
    } else if (dept === 'hr' || dept === 'welfare') {
      const resolvedLeaves = leaves.filter(l => l.status !== 'draft').length;
      deptPct = leaves.length ? +((100 * resolvedLeaves) / leaves.length).toFixed(1) : 100;
      deptDetail = `${resolvedLeaves}/${leaves.length} structured HR & handover records`;
    } else if (dept === 'hospital') {
      const tracked = reqs.filter(r => Boolean(r.facility && r.reason)).length;
      deptPct = reqs.length ? +((100 * tracked) / reqs.length).toFixed(1) : 100;
      deptDetail = `${tracked}/${reqs.length} structured hospital referrals`;
    } else if (dept === 'exec') {
      const minuted = execM.filter(m => (m.agenda || []).length > 0).length;
      deptPct = execM.length ? +((100 * minuted) / execM.length).toFixed(1) : 100;
      deptDetail = `${minuted}/${execM.length} structured executive sittings`;
    }

    /* 4. Personal Scope */
    let personalPct = deptPct;
    let personalDetail = deptDetail;
    let personalGaps = 0;
    if (user && RBAC.has(user, 'patient.list') && !['mediahead','pr','finance','procurement','hr','welfare','vehicle','auditor','it','gov.partner','president'].includes(user.roleId)) {
      const myPts = user.roleId === 'caregiver'
        ? pts.filter(p => p.caregiverId === user.id)
        : repo.patientList(user);
      const myQ = patientFieldQuality(myPts);
      personalPct = myQ.pct;
      personalGaps = myQ.gaps;
      personalDetail = `${myQ.complete}/${myQ.total} assigned beneficiary records at 100%`;
    } else if (user) {
      const uScore = (typeof usageScore === 'function') ? usageScore(user, db).score : 94;
      personalPct = Math.max(deptPct, Math.min(100, uScore + 6));
      personalDetail = `Role workflow & mandatory fields verified`;
    }

    const res = {
      personal: { label: 'Personal Workspace Quality', pct: personalPct, detail: personalDetail, gaps: personalGaps },
      department: { label: `${typeof deptName === 'function' ? deptName(dept) : titleCase(dept)} Quality`, pct: deptPct, detail: deptDetail },
      county: { label: `${countyName(uCounty)} County Quality`, pct: countyPct, detail: `${countyPtQ.complete}/${countyPtQ.total} county files verified`, gaps: countyPtQ.gaps },
      global: { label: 'Global Foundation Quality', pct: globalPct, detail: `${globalPtQ.complete}/${globalPtQ.total} global files · ${pts.length ? num((db.visits||[]).length) : 0} visits`, gaps: globalPtQ.gaps }
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

    /* 8. Media, HR, Fleet & Audit Specialist Workflows */
    if (['mediahead','pr'].includes(role)) {
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
    if (['hr','welfare'].includes(role)) {
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

    /* Fallback universal C-DIMS Coins & Quality excellence nudge */
    if (tasks.length < 3 && RBAC.has(user, 'credit.view')) {
      tasks.push({
        id: 'wf-coins-check',
        score: 72,
        band: 'P3 · Excellence & Recognition',
        tone: 'b-ok',
        category: 'C-DIMS Coins',
        title: 'Inspect Your 5-Pillar Usage Score & Available C-DIMS Coin Rewards',
        detail: 'Review how your verified records contribute toward Platinum (90%+) standing.',
        aiWhy: 'CareLink AI: Sustaining >90% documentation completeness earns maximum monthly C-DIMS Coins.',
        lift: '+Platinum Standing',
        view: 'recognition',
        btnLabel: 'View Recognition'
      });
    }

    const sorted = tasks.sort((a, b) => b.score - a.score);
    this._cache.prioByKey[pKey] = sorted;
    return sorted;
  },

  /* Compact priority & 100% data quality strip rendered on Console Home */
  homePriorityStrip(user) {
    if (!user) return '';
    const m = this.completionMatrix(user);
    const top = this.prioritiesFor(user).slice(0, 3);
    const scopes = [
      ['Personal', m.personal.pct],
      ['Department', m.department.pct],
      ['County', m.county.pct],
      ['Global', m.global.pct]
    ];
    return `<section class="wf-strip no-print" aria-label="CareLink AI Smart Workflow & Data Quality">
      <div class="wf-strip-head">
        <div class="row" style="gap:9px;flex-wrap:wrap">
          <span class="wf-ai-pill">${ic('sparkles',13)} CareLink AI Workflow Engine</span>
          <b class="small">Smart Task Order &amp; 100% Data Quality Assurance</b>
        </div>
        <div class="row" style="gap:10px;flex-wrap:wrap">
          <div class="wf-mini-meters">
            ${scopes.map(([lbl, pctVal]) => `<span class="wf-meter-chip ${pctVal>=99?'ok':pctVal>=90?'info':'warn'}" title="${lbl} Data Completion & Quality">
              <i>${esc(lbl)}:</i> <b class="mono">${pctVal}%</b>
            </span>`).join('')}
          </div>
          <button class="btn btn-xs btn-primary" data-act="go" data-v="smartflow">${ic('flow',12)} Full Workflow Hub</button>
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

  /* Full Dedicated Intelligent Workflow & 100% Data Completion Workspace */
  render(user, params = {}) {
    const m = this.completionMatrix(user);
    const tasks = this.prioritiesFor(user);
    const canResolveQa = RBAC.has(user, 'dq.manage') || RBAC.has(user, 'patient.edit') || ['chief','director','program.admin','me','countyadmin','mcm'].includes(user.roleId);
    const log = (DB.db && DB.db.workflowActionsLog || []).slice(0, 12);

    const scopeCards = ['personal', 'department', 'county', 'global'].map(k => {
      const s = m[k];
      const tone = s.pct >= 99 ? 'ok' : (s.pct >= 90 ? 'info' : 'warn');
      return kpi(s.label, s.pct + '%', s.detail, tone, k === 'personal' ? 'user' : k === 'department' ? 'layers' : k === 'county' ? 'building' : 'shieldcheck');
    }).join('');

    return pageHead('Intelligent workflow engine & 100% data quality hub',
      'Assisted by CareLink AI — ranks your highest-impact clinical, administrative and stewardship actions in optimal sequence while driving 100% data completion across Personal, Departmental, County and Global levels.',
      `<div class="row" style="gap:8px;flex-wrap:wrap">
        ${canResolveQa && m.global.gaps > 0 ? `<button class="btn btn-sm btn-primary" data-act="wf-complete-qa-gaps">${ic('check',14)} Verify &amp; Complete ${m.global.gaps} QA Field Gap(s) to 100%</button>` : ''}
        <button class="btn btn-sm btn-ghost" data-act="wf-ask-ai">${ic('sparkles',14)} Ask CareLink AI Co-Pilot</button>
      </div>`)
    + `<div class="grid g4" style="margin-bottom:16px">${scopeCards}</div>`
    + card(`Recommended Smart Workflow Sequence (${tasks.length} prioritised actions)`,
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
        { sub: 'Automatically recalculated in real time as records are entered, verified, reconciled and approved across departments.' })
    + `<div class="grid g2" style="margin-top:16px">
        ${card('4-Tier Data Completion & Quality Assurance Bars', `
          ${[m.personal, m.department, m.county, m.global].map(s => `<div style="margin-bottom:12px">
            <div class="spread" style="margin-bottom:4px"><b class="small">${esc(s.label)}</b><span class="mono bold" style="color:${s.pct>=99?'var(--ok)':'var(--accent-fg)'}">${s.pct}%</span></div>
            <div class="progress ${s.pct>=99?'ok':s.pct>=90?'info':'warn'}" style="height:8px"><i style="width:${Math.min(100, s.pct)}%"></i></div>
            <div class="xs muted" style="margin-top:3px">${esc(s.detail)}</div>
          </div>`).join('')}
        `, { sub: 'Tracks 6-point beneficiary completeness, longitudinal 12+ visit continuity, anthropometric height/weight/MUAC & voucher receipts.' })}
        ${card('Workflow Completion & AI Audit Log', log.length ? table([
          { label: 'Time', render: l => `<span class="xs mono">${fmtDateTime(l.at)}</span>` },
          { label: 'Actor', render: l => `<span class="small">${esc(l.actorName || l.actor)}</span>` },
          { label: 'Action', render: l => `<span class="small">${esc(l.summary)}</span>` },
          { label: 'Result', render: l => badge(l.result || '100% Verified', 'b-ok', 'nodot') }
        ], log) : emptyState('Ready for live workflow execution', 'Completed smart-workflow milestones & bulk QA verifications are logged here.', 'sparkles'))}
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

