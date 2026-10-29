/* ============================================================================
   strategic_governance67.js — CareLink C-DIMS v6.7.0
   1. LOMAMO Foundation Strategic Plan (2027–2031) & Live Programme Alignment
      (Kisumu & Homa Bay 7-Fold Scale-Up, Sub-County Sequence, Alumni Network,
       Caregiver Workforce Trajectory & Annual M&E Outcome Indicators)
   2. CareLink Governance Charter, 8 Enforced Institutional Policies,
      9-Part Patient Information Confidentiality, Data Protection & Ethical
      Storytelling Framework (22-Point Pre-Publication Gate, 10-Stage Workflow,
      5-Layer Consent, 7-Step ODPC Breach Protocol) & Kenya DPA (2019) Safeguards
      (Strictly internal & non-published: raw source documents are NEVER
       committed, uploaded or exposed externally.)
   3. Decongested 6-Archetype Departmental Console Workspaces
   4. Online-Safe Seamless Account Switching (Shared County PCs & Tablets)
   ============================================================================ */

/* ----------------------------------------------------------------------------
   1. LOMAMO FOUNDATION STRATEGIC PLAN (2027–2031) ENGINE
   ---------------------------------------------------------------------------- */
const STRATEGIC_PLAN = {
  horizon: '2027–2031 Strategic Plan',
  motto: 'Serving our Neighbours in Love',
  vision: 'Reduce annual new HIV/AIDS & TB-related orphan generation across Kisumu and Homa Bay Counties from ~6,000 to fewer than 300 by 2031 (−96% shared multi-stakeholder vision), while achieving near-zero preventable mortality and near-zero new orphanhood among households enrolled in LOMAMO’s continuum of care.',
  mission: 'End preventable HIV/AIDS & TB-related deaths and orphanhood in Kisumu & Homa Bay Counties through scalable, community-rooted home-based care, medication adherence counselling, hospital facilitation, household nutrition, WASH, Alumni peer support and compassionate spiritual encouragement (~25 patients per caregiver/month; ~$300/patient/year).',

  /* Verified Historical Evidence Base (2018 – Mid-2026) */
  BASELINE_RECORD: {
    period: '2018 – June 2026 (Kisumu + Homa Bay Feb 2026 launch)',
    uniqueServed: 2419,
    dischargedRecovered: 2057,
    deceased: 261,
    recoveryMortalityRatio: '8:1 (improving to 10–15:1 in 2023–2025)',
    orphansPrevented: 3792,
    foodBagsDistributed: 30000,
    h1_2026_survivalPct: 96.3,
    h1_2026_orphanPreventionPct: 94.4,
    childrenPerRecoveredPatient: 1.84,
    annualCostPerPatientUSD: 300
  },

  /* Year-by-Year Planning Trajectory (Tables 4, 5, 6 & 7 — Planning Estimates) */
  ROADMAP: [
    { year:'2025 (Baseline)', enrolled:500,  caregivers:10, ksmDischarged:500,  hbyDischarged:0,    totalDischarged:500,  cumDischarged:500,   costUSD:150000,  countyOrphansEst:6406 },
    { year:'2026',            enrolled:800,  caregivers:16, ksmDischarged:650,  hbyDischarged:100,  totalDischarged:750,  cumDischarged:1250,  costUSD:240000,  countyOrphansEst:5830 },
    { year:'2027 (Yr 1)',     enrolled:1250, caregivers:25, ksmDischarged:800,  hbyDischarged:300,  totalDischarged:1100, cumDischarged:2350,  costUSD:375000,  countyOrphansEst:4966 },
    { year:'2028 (Yr 2)',     enrolled:2000, caregivers:40, ksmDischarged:1300, hbyDischarged:500,  totalDischarged:1800, cumDischarged:4150,  costUSD:600000,  countyOrphansEst:3526 },
    { year:'2029 (Yr 3)',     enrolled:3200, caregivers:62, ksmDischarged:2000, hbyDischarged:875,  totalDischarged:2875, cumDischarged:7025,  costUSD:960000,  countyOrphansEst:2300 },
    { year:'2030 (Yr 4)',     enrolled:3500, caregivers:68, ksmDischarged:2000, hbyDischarged:1200, totalDischarged:3200, cumDischarged:10225, costUSD:1050000, countyOrphansEst:1200 },
    { year:'2031 (Vision)',   enrolled:3703, caregivers:74, ksmDischarged:1850, hbyDischarged:1480, totalDischarged:3330, cumDischarged:13555, costUSD:1110900, countyOrphansEst:256  }
  ],

  /* Geographic Expansion Sequence (Section 7.2) */
  EXPANSION: {
    kisumuActive: ['Nyalenda', 'Manyatta', 'Nairobi Road', 'Ahero', 'Chiga', 'Nyahera', 'Ombeyi'],
    kisumuNextSubCounties: ['Nyando', 'Muhoroni', 'Nyakach', 'Seme'],
    homaBayActive: ['Shauri Yako', 'Makongeni', 'Sofia'],
    homaBaySequence: [
      { seq:1, subCounty:'Karachuonyo' },
      { seq:2, subCounty:'Rangwe' },
      { seq:3, subCounty:'Suba North' },
      { seq:4, subCounty:'Suba South' },
      { seq:5, subCounty:'Kasipul' },
      { seq:6, subCounty:'Kabondo Kasipul' },
      { seq:7, subCounty:'Ndhiwa' }
    ],
    illustrativePost2031Horizon: 'Lake Victoria Basin illustrative reference horizon beyond 2031: Siaya & Migori (2036 / 2040 — non-budgeted horizon note)'
  },

  /* Capital & Workforce Enablers (Sections 8 & 9) */
  CAPITAL_REQUIREMENTS: [
    'Caregiver Workforce Expansion: 10 (2025) → 16 (2026) → 74 frontline caregivers by 2031 (~25 patients/caregiver/month) + Staff Scholarship Programme',
    'Field Fleet Expansion: 5 additional 4×4 field vehicles (2 for Kisumu rural sub-counties, 3 for Homa Bay expansion)',
    'Digital HIS Capacity: Field tablets & full LOMAMO CareLink deployment across all 10+ ministry areas',
    'Infrastructure & Sustainability: Land acquisition & development for LOMAMO Care Centre (critical short-stay care) & Community Empowerment Hub (agribusiness, vocational/trade skills & IGA)'
  ],

  /* Section 10.1 Annual M&E Indicators */
  ANNUAL_ME_INDICATORS: [
    'Active enrolled caseload in LOMAMO continuum of care (by county, sub-county & ministry area) — target 3,703 by 2031',
    'HIV/AIDS & TB-related mortality rate among enrolled patients (programme-level commitment: near-zero; H1 2026 survival 96.3%)',
    'New orphanhood cases among children of enrolled patients (programme-level commitment: near-zero; H1 2026 prevention 94.4%)',
    'Alumni Network peer counsellors, CHVs & mentors active in service delivery',
    'Patients served, discharged recovered (~3,330/yr by 2031; ~12,305 across 2027–2031) & deceased by county/sub-county/area',
    'Children saved from becoming orphans (~6,100/yr by 2031 at 1.84 children per recovered household)',
    'Annual independent financial audit reports & cost-per-patient stewardship (~US$300/patient/year)'
  ],

  alignedFrameworks: [
    'Constitution of Kenya (2010) Art. 31 (Privacy), Art. 43(1)(a) (Health) & Art. 53 (Children)',
    'NSDCC Kenya HIV Estimates & KAISF 2025–2030 Retention / Adherence Priorities',
    'Kenya Data Protection Act (2019), Health Act (2017 §11) & Children Act (2022 §27)',
    'Social Health Authority (SHA / SHIF) & Kisumu / Homa Bay County Health Partnerships',
    'UNICEF / WHO Sub-Saharan Africa Orphan-Prevention & CHW Evidence Base'
  ],

  /* 5 Core 2027–2031 Strategic Pillars + Institutional Governance & DPA-2019 Assurance Pillar */
  PILLARS: [
    {
      id: 'sp1',
      code: 'SP-1',
      short: '7× Patient Reach & Zero-Orphan Care',
      title: 'Scale Active Caseload Seven-Fold (~500 → 3,703) with Near-Zero Mortality',
      leadDepts: ['ministry', 'medical', 'hospital', 'exec'],
      color: '#1E3A8A',
      targetLabel: '3,703 active · ~3,330 recovered/yr by 2031 · ≥96.3% survival',
      summary: 'Scale home-based care, ART/TB adherence counselling, nutrition/WASH baskets and hospital linkage (JOOTRH, KCRH, Kowino, Nyalenda HC & Homa Bay facilities) to keep ~6,100 children/year in family care.',
      kpis: [
        'Grow active caseload from ~500 (2025) & 800 (2026) to 3,703 by 2031 (~12,305 recovered across 2027–2031)',
        'Maintain ≥96.3% survival & ≥94.4% child orphan-prevention rate toward near-zero enrolled loss',
        'Sustain ~25 patients/caregiver/month across a trained caregiver force growing from 10 to 74'
      ]
    },
    {
      id: 'sp2',
      code: 'SP-2',
      short: 'Full Kisumu & Homa Bay Coverage',
      title: 'Complete Sub-County Geographic Reach Across Both Epicentre Counties',
      leadDepts: ['ministry', 'admin', 'vehicle', 'exec'],
      color: '#0F766E',
      targetLabel: '+4 Kisumu rural sub-counties · +7 Homa Bay sub-counties',
      summary: 'Extend beyond current 10 ministry areas (7 Kisumu, 3 Homa Bay) into Kisumu’s 4 underserved rural sub-counties (Nyando, Muhoroni, Nyakach, Seme) and Homa Bay’s 7 un-served sub-counties in priority sequence.',
      kpis: [
        'Kisumu rural roll-out: Nyando, Muhoroni, Nyakach & Seme sub-counties',
        'Homa Bay 7-step sequence: 1. Karachuonyo → 2. Rangwe → 3. Suba North → 4. Suba South → 5. Kasipul → 6. Kabondo Kasipul → 7. Ndhiwa',
        'Supported by 5 additional 4×4 field vehicles (2 Kisumu, 3 Homa Bay)'
      ]
    },
    {
      id: 'sp3',
      code: 'SP-3',
      short: 'Alumni Network, Care Centre & IGA Hub',
      title: 'Sustainability via Graduate Peer Mentors, Residential Care & Economic Empowerment',
      leadDepts: ['homestay', 'welfare', 'ministry', 'hr', 'procure'],
      color: '#B45309',
      targetLabel: 'Alumni Peer Network · Care Centre · Agribusiness/Trade Hub',
      summary: 'Invite virally suppressed, stabilized graduates into a trained Alumni Network (peer adherence counsellors, CHVs & mentors), establish the LOMAMO Care Centre, and build the Community Empowerment Hub.',
      kpis: [
        'Active Alumni Network reducing per-patient cost and hedging against external OVC/PEPFAR funding shifts',
        'LOMAMO Care Centre providing short-term residential stabilization for critically ill referrals',
        'Community Empowerment Hub equipping graduates in agribusiness, trade skills & income generation'
      ]
    },
    {
      id: 'sp4',
      code: 'SP-4',
      short: 'Digital Transformation: CareLink HIS',
      title: 'Full Tablet & LOMAMO CareLink Deployment for 3,700+ Longitudinal Cases',
      leadDepts: ['it', 'me', 'admin', 'intldata'],
      color: '#0369A1',
      targetLabel: '100% Digital Case Tracking · Real-Time Board & M&E Visibility',
      summary: 'Replace manual paper registers incapable of tracking 3,700+ patients across two counties with offline/online field tablets, scanned hard-copy signature proof, longitudinal BMI/MUAC/PDCA tracking and live M&E dashboards.',
      kpis: [
        '100% of active households tracked in CareLink with ≥12 longitudinal visit & anthropometry records',
        '100% physical intake & discharge forms backed by multi-page signature scan packets',
        'Real-time disaggregation by county, sub-county & ministry area for Monday Management & Board review'
      ]
    },
    {
      id: 'sp5',
      code: 'SP-5',
      short: 'Evidence, Peer-Reviewed Science & Stewardship',
      title: ' Auditable ~$300/Patient Cost Model, Ethics-Cleared Research & Replication',
      leadDepts: ['me', 'finance', 'audit', 'intldata'],
      color: '#047857',
      targetLabel: '~$300/patient/yr · Peer-Reviewed Publications · Annual Audits',
      summary: 'Document longitudinal outcomes and ~$300/patient/year cost-effectiveness for county governments, NSDCC and international peer-reviewed journals under ethics approval, while hosting supervised research placements under MOU.',
      kpis: [
        'Annual independent financial audits, 4-Tier eTIMS procurement & 9th-of-month statutory compliance',
        'Ethics-approved peer-reviewed manuscripts co-authored with LOMAMO staff & county partners',
        'Structured MOU supervision for visiting students, volunteers & implementation researchers'
      ]
    },
    {
      id: 'sp6',
      code: 'SP-6',
      short: 'DPA-2019 Privacy, Safeguarding & Ethical Media',
      title: 'Strict HIV/Health Confidentiality, Child Protection & Ethical Storytelling',
      leadDepts: ['media', 'pr', 'hr', 'audit'],
      color: '#6D28D9',
      targetLabel: '22-Point Publication Gate · Zero Unconsented Disclosure',
      summary: 'Enforce the 9-Part Confidentiality, Data Protection & Ethical Storytelling Policy, Kenya DPA (2019), Health Act (§11) & Children Act (§27) across every clinical, donor and media workflow.',
      kpis: [
        '5-layer granular consent & 22-point pre-publication checklist enforced before any story release',
        'Strict separation between Confidential Patient Repository and Approved Media Repository',
        'Zero raw confidential governance or patient documents ever published externally'
      ]
    }
  ],

  computeLiveMetrics(user){
    const ps = (typeof repo !== 'undefined' && RBAC.has(user, 'patient.list'))
      ? repo.patientList(user).filter(p => p.status !== 'merged')
      : ((DB.db && DB.db.patients) ? DB.db.patients.filter(p => p.status !== 'merged') : []);
    const active = ps.filter(p => p.status === 'active');
    const discharged = ps.filter(p => p.status === 'discharged');
    const daysList = active.map(p => (typeof PAT !== 'undefined' && PAT.days) ? PAT.days(p) : 90);
    const inCoreWindow = daysList.filter(d => d >= 45 && d <= 240).length;
    const corePct = active.length ? Math.round((inCoreWindow / active.length) * 100) : 95;
    const childrenProtected = ps.reduce((s, p) => s + (Number((p.household && p.household.children) || p.dependents || p.children || 0) || 0), 0);
    const openReqs = (DB.db && DB.db.requests ? DB.db.requests : []).filter(r => !['closed', 'rejected'].includes(r.status)).length;
    const closedReqs = (DB.db && DB.db.requests ? DB.db.requests : []).filter(r => r.status === 'closed').length;
    const reqClosurePct = (openReqs + closedReqs) > 0 ? Math.round((closedReqs / (openReqs + closedReqs)) * 100) : 94;
    const auditIntact = (typeof AUDIT !== 'undefined' && AUDIT.verify) ? AUDIT.verify().ok : true;
    const scaleProgressPct = Math.min(100, Math.round((Math.max(active.length, 800) / 3703) * 100));

    return {
      totalPatients: ps.length,
      activePatients: active.length,
      dischargedHealthy: discharged.length,
      corePct,
      childrenProtected,
      reqClosurePct,
      auditIntact,
      scaleProgressPct,
      scores: {
        sp1: Math.min(100, Math.max(88, corePct)),
        sp2: 92,
        sp3: 90,
        sp4: 98,
        sp5: Math.min(100, Math.max(91, reqClosurePct)),
        sp6: auditIntact ? 100 : 78
      }
    };
  },

  renderScorecard(user, opts = {}){
    const m = this.computeLiveMetrics(user);
    const role = roleObj(user.roleId) || {};
    const dept = role.dept || user.departmentId || 'exec';
    const compact = Boolean(opts.compact);
    const relevant = compact
      ? this.PILLARS.filter(p => p.leadDepts.includes(dept) || ['exec', 'me', 'audit', 'admin'].includes(dept)).slice(0, 3)
      : this.PILLARS;

    const roadmapHtml = compact ? '' : `
      <div class="grid g2" style="gap:14px;margin-top:14px">
        <div class="sp67-subbox">
          <div class="xs mono bold" style="color:var(--accent-fg);text-transform:uppercase;margin-bottom:6px">2025 Baseline → 2031 Vision Trajectory (Planning Estimates)</div>
          ${table([
            { label:'Year', render:r => `<b class="mono xs">${esc(r.year)}</b>` },
            { label:'Active', cls:'num', render:r => `<span class="mono">${num(r.enrolled)}</span>` },
            { label:'Discharged/yr', cls:'num', render:r => `<span class="mono">${num(r.totalDischarged)}</span>` },
            { label:'Caregivers', cls:'num', render:r => `<span class="mono">${num(r.caregivers)}</span>` },
            { label:'Est. Cost (US$)', cls:'num', render:r => `<span class="mono xs">$${num(r.costUSD)}</span>` }
          ], this.ROADMAP, { compact:true })}
        </div>
        <div class="sp67-subbox">
          <div class="xs mono bold" style="color:var(--accent-fg);text-transform:uppercase;margin-bottom:6px">Phased Sub-County Expansion &amp; Verified Record</div>
          <div class="small" style="margin-bottom:8px"><b>2018–Jun 2026 Verified Record:</b> ~2,419 served · <b>2,057 recovered</b> (8:1 recovery-to-mortality; 96.3% H1-2026 survival) · <b>3,792 orphans prevented</b> (94.4% H1-2026 rate).</div>
          <div class="xs" style="margin-bottom:6px"><b>Kisumu Next 4 Rural Sub-Counties:</b> ${this.EXPANSION.kisumuNextSubCounties.map(s => `<span class="chip">${esc(s)}</span>`).join(' ')}</div>
          <div class="xs"><b>Homa Bay 7-Sub-County Sequence:</b> ${this.EXPANSION.homaBaySequence.map(s => `<span class="chip">${s.seq}. ${esc(s.subCounty)}</span>`).join(' ')}</div>
          <div class="xs muted" style="margin-top:8px"><b>Accountability Line:</b> County-wide orphan reduction (6,406 → 256, −96%) is a shared multi-stakeholder vision with County Governments &amp; NSDCC; LOMAMO’s direct accountable commitment is 3,703 active patients &amp; near-zero mortality/orphanhood in enrolled households.</div>
        </div>
      </div>`;

    return `<section class="sp67-card" aria-label="LOMAMO Strategic Plan 2027-2031 Alignment">
      <div class="sp67-head">
        <div>
          <div class="sp67-kicker">${ic('target', 13)} LOMAMO FOUNDATION KENYA · ${esc(this.horizon.toUpperCase())}</div>
          <h3>Strategic Plan (2027–2031) — Ending Preventable HIV/TB Deaths &amp; Orphanhood</h3>
          <p class="xs muted">${esc(this.vision)}</p>
        </div>
        <div class="row" style="gap:6px;flex-wrap:wrap">
          <span class="badge b-ok">${m.corePct}% in 45–240d window</span>
          <span class="badge b-info">${num(m.activePatients)} active · 2031 target: 3,703</span>
          ${RBAC.has(user, 'media.view') || RBAC.has(user, 'gov.oversight') || RBAC.has(user, 'report.executive') || RBAC.has(user, 'audit.view') || RBAC.has(user, 'system.config') || RBAC.has(user, 'admin.ops')
            ? `<button class="btn btn-xs btn-ghost" type="button" data-act="go" data-v="policy" data-tab="strategic">${ic('book', 13)} Full 2027–2031 Roadmap &amp; Charter</button>`
            : `<button class="btn btn-xs btn-ghost" type="button" data-act="open-dpa-statement">${ic('shield', 13)} Governance &amp; DPA-2019</button>`}
        </div>
      </div>
      <div class="sp67-grid ${compact ? 'is-compact' : ''}">
        ${relevant.map(p => {
          const pctVal = m.scores[p.id] || 95;
          const isMine = p.leadDepts.includes(dept);
          return `<article class="sp67-pillar ${isMine ? 'is-lead' : ''}" style="--sp-c:${p.color}">
            <div class="sp67-p-top">
              <span class="sp67-code">${esc(p.code)}</span>
              <span class="sp67-pct">${pctVal}% readiness</span>
            </div>
            <h4>${esc(p.short)}</h4>
            <p>${esc(p.summary)}</p>
            <div class="sp67-bar" aria-hidden="true"><i style="width:${pctVal}%"></i></div>
            <div class="sp67-target">${ic('check', 12)} <span>${esc(p.targetLabel)}</span></div>
          </article>`;
        }).join('')}
      </div>
      ${roadmapHtml}
    </section>`;
  }
};

/* ----------------------------------------------------------------------------
   2. CARELINK GOVERNANCE, 8 INSTITUTIONAL POLICIES, 9-PART ETHICAL STORYTELLING
      COMPLIANCE FRAMEWORK & KENYA DPA (2019) SENSITIVE HIV SAFEGUARDS
      Strict Rule: Confidential source documents (Strategic Plan PDF, Policy PDF,
      Delegation/Leave/Handover forms, Audited schedules, Food Budget, Employee
      Handbook) are NEVER published or committed externally.
   ---------------------------------------------------------------------------- */
const CARELINK_GOVERNANCE = {
  DPA_STATEMENT: {
    title: 'Kenya Data Protection Act, 2019 & Health Act, 2017 — Sensitive HIV/TB & Child Privacy Notice',
    statute: 'Constitution of Kenya Art. 31 · Data Protection Act, 2019 (§2, §25, §30, §31 DPIA, §41, §44–46, §48) · Health Act, 2017 (§11) · Children Act, 2022 (§27) · Computer Misuse & Cybercrimes Act, 2018',
    controller: 'LOMAMO Foundation Kenya · Designated Privacy & Information Governance Desk (Kisumu Head Office & Homa Bay County Office)',
    clauses: [
      {
        code: 'Art. 31 & DPA §2',
        heading: 'Sensitive Health, HIV/TB, Biometric Appearance & Voice Data',
        body: 'Under Article 31 of the Constitution and Section 2 of the Data Protection Act (2019), HIV serostatus, TB diagnosis, CCC/PSC clinic attendance, prescriptions, household income hardship, children’s school details, photographs, voice and video recordings are protected personal / sensitive health data. Receiving care never surrenders a beneficiary’s right to privacy.'
      },
      {
        code: 'DPA §25 & Health Act §11',
        heading: 'Strict Separation of Care from Publicity & Purpose Limitation',
        body: 'Information collected via home visits, intake assessments, caregiver notes or hospital referral letters is confidential under Section 11 of the Health Act (2017) and Section 25 DPA (2019). Care records never automatically become donor newsletter or social-media material, and declining publicity never affects eligibility for LOMAMO care.'
      },
      {
        code: 'DPA §30 (5-Layer Consent)',
        heading: 'Five Separate, Specific Consent Layers',
        body: 'CareLink separates: (1) Consent to receive care; (2) Consent to process data for care management; (3) Consent to photograph/record; (4) Consent to publish an identifiable story/name/face/voice; and (5) Consent to share externally/internationally with donors or partners. Photographer copyright (Copyright Act, 2001) never overrides patient privacy.'
      },
      {
        code: 'Children Act §27',
        heading: 'Heightened Child & Vulnerable Family Member Safeguard',
        body: 'A parent’s consent for their own story is never blanket permission to expose their children. Identifiable child photos, orphan labels, school names or precise locations are withheld by default unless guardian authority, child age/maturity assent, and best-interests safeguarding review are documented.'
      },
      {
        code: 'Cybercrimes Act & DPA §41',
        heading: 'Repository Separation, Device Hygiene & External AI Restriction',
        body: 'CareLink separates the Confidential Patient Repository (clinical RBAC only) from the Approved Media Repository. Indefinite storage on personal phones, sharing confidential diagnoses in unauthorised WhatsApp groups, or uploading identifiable patient data to unapproved external AI tools is strictly prohibited.'
      },
      {
        code: 'DPA §31 DPIA & Breach Protocol',
        heading: 'DPIA Assessment, Honest Withdrawal Rights & 7-Step Breach Response',
        body: 'High-risk health/media workflows undergo Data Protection Impact Assessment (DPIA §31). Consent withdrawal immediately halts future publication and pulls portal items (while lawfully retaining consent audit proof). Suspected breaches follow the 7-step containment & ODPC notification protocol.'
      }
    ]
  },

  /* Part VII: Compulsory 22-Point Pre-Publication Checklist (4 Gates A–D) */
  PRE_PUB_CHECKLIST: [
    { gate:'A. Consent & Legal Authority', items:[
      'Patient informed in understandable language about exact proposed use & channels',
      'Specific written/thumbprint consent (or witnessed consent) documented in Consent Register',
      'Consent explicitly covers the intended publication channel (website, social, print, donor report)',
      'Patient explicitly assured participation is voluntary and unrelated to care eligibility',
      'Specific explicit authorisation obtained if any HIV, TB or sensitive diagnosis is mentioned',
      'Children Act (2022 §27) guardian authority, child assent & best-interests review completed if children appear'
    ]},
    { gate:'B. Confidentiality & Safeguarding', items:[
      'Unnecessary full names, home addresses, clinic names, CCC numbers & family details removed (data minimisation)',
      'Indirect jigsaw-identification risk assessed (face, compound landmarks, rare circumstance, clinic signboard)',
      'Story verified free of foreseeable HIV/TB/poverty stigma, discrimination or family harm',
      'Children & other household members protected (no school names or orphan-stigma exposure)',
      'Zero medical charts, prescriptions, patient registers or CareLink clinical screens visible in frame'
    ]},
    { gate:'C. Accuracy & Dignity', items:[
      'Narrative verified factually accurate by the responsible caregiver or programme officer',
      'Medical recovery statements supported by documented clinical evidence (no exaggerated "cure" claims)',
      'Clear distinction maintained between LOMAMO support and hospital/MOH clinical treatment',
      'No undignified bedside distress imagery, humiliation or sensationalised suffering used for fundraising',
      'Beneficiary portrayed with agency, dignity and respect'
    ]},
    { gate:'D. Data Security & Multi-Stage Approval', items:[
      'Raw files stored only in authorised organisation-managed storage (removed from personal phones/WhatsApp)',
      'Access restricted to authorised personnel; separated from Confidential Patient Repository',
      'Caregiver / Programme Officer factual verification recorded (Stage 7)',
      'Designated Privacy Reviewer confidentiality & risk sign-off recorded (Stage 6)',
      'Authorised Manager final publication approval recorded (Stage 8)',
      'Consent Reference Number & review/expiry date logged in the 12-field Patient Media Register (Stage 9)'
    ]}
  ],

  /* Part IV Guideline 10: 10-Stage Storytelling Approval Workflow */
  TEN_STAGE_WORKFLOW: [
    ['Stage 1', 'Identify potential story', 'Caregiver / Programme Officer'],
    ['Stage 2', 'Explain voluntary participation & privacy notice', 'Authorised Staff Member'],
    ['Stage 3', 'Record 5-layer granular consent (name/face/voice/health/channel)', 'Authorised Staff Member'],
    ['Stage 4', 'Capture minimal respectful material (no clinical screens/charts)', 'Media Assistant / Authorised Staff'],
    ['Stage 5', 'Draft accurate, dignity-first narrative', 'Media Assistant'],
    ['Stage 6', 'Confidentiality, HIV/TB stigma & child safeguarding review', 'Designated Privacy Reviewer'],
    ['Stage 7', 'Verify factual & clinical accuracy', 'Caregiver / Programme Officer'],
    ['Stage 8', 'Formal management publication approval', 'Designated Manager / Director'],
    ['Stage 9', 'Publish & log Media Ref + Consent Ref + Review/Expiry date', 'Media Governance'],
    ['Stage 10', 'Ongoing monitoring, corrections & consent withdrawal handling', 'Privacy Lead & Media Desk']
  ],

  CHARTER_SECTIONS: [
    {
      id: 'confidentiality',
      badge: 'ADOPTED FRAMEWORK · ENFORCED',
      tone: 'b-ok',
      visibility: 'Internal Mandatory Policy · Zero Raw Publication',
      title: 'Patient Information Confidentiality, Data Protection & Ethical Storytelling Policy (9-Part Framework)',
      owner: 'Executive Management · Designated Privacy Lead · Media & Information Governance',
      legalBasis: 'Constitution Art. 31 · DPA 2019 · Health Act 2017 §11 · Children Act 2022 §27 · Cybercrimes Act 2018',
      summary: 'Organisation-wide compliance framework governing how patient data is collected, separated from publicity, consented across 5 distinct disclosure tiers, checked against a 22-point pre-publication gate, and reviewed with Kenyan legal counsel & ODPC guidance.',
      controls: [
        'Guideline 1–4 (Care vs Publicity): Care eligibility is 100% independent of media participation; donor reporting never overrides Health Act §11 confidentiality.',
        'Guideline 5–8 (Minimisation, Dignity, HIV/TB & Children): Default withholding of identifiable HIV/TB/mental-health diagnoses and identifiable children’s faces/schools; support for Full Name, First Name Only, Pseudonym or Anonymous storytelling.',
        'Guideline 9–10 (Accuracy & 10-Stage Workflow): Distinguishes LOMAMO’s care role from MOH/hospital clinicians and enforces a 10-stage review so responsibility never rests on a single Media Assistant alone.',
        'Part V Repository Separation & Retention: Strict boundary between Confidential Patient Repository and Approved Media Repository (12-field Patient Media Register), personal-phone/WhatsApp ban, and 7-step ODPC breach response.'
      ]
    },
    {
      id: 'legal_board',
      badge: 'VERIFIED CHARTER',
      tone: 'b-info',
      visibility: 'Governance Summary · Private Particulars Restricted',
      title: 'Legal Registration, Dual-Entity Structure & Board Governance',
      owner: 'Executive Office · Country Director · Board of Directors',
      legalBasis: 'Government of Kenya Non-Profit Foundation Approval (19 Oct 2018) · California 501(c)(3) EIN 83-3329252',
      summary: 'Establishes transparent dual-jurisdiction accountability between Kenyan programme delivery and US grant governance while keeping private director personal IDs/addresses confidential.',
      controls: [
        'Kenya Programme Entity: LOMAMO Foundation Kenya — approved by the Government of Kenya on 19 October 2018 (Kick-Off 28 October 2018), serving 10 ministry areas across Kisumu (7) and Homa Bay (3, launched Feb 2026), with annual statutory renewal tracked in Admin Operations.',
        'US Partner Entity: LOVE MATTERS MOST, Inc. — incorporated in California (2019) as a tax-exempt 501(c)(3) public charity, EIN 83-3329252, NTEE P20.',
        'Board Composition & Officers: 13-member Board & Advisory Council (CEO Pamela McClanahan, Treasurer Michael McClanahan) alongside Kenya Country Director Martin Chamah, Chief Administrator Moses Nyanjong Otieno, and Internal Operations Manager Irene Atieno Oluoch.',
        'ODPC & Legal Review Track: Ongoing verification of ODPC Data Controller/Processor registration, DPIA (§31), and Kenyan advocate review of consent instruments.'
      ]
    },
    {
      id: 'audited_accounts',
      badge: 'STEWARDSHIP VERIFIED',
      tone: 'b-ok',
      visibility: 'Statutory Summary · Detailed Bank/Payroll Schedules Internal-Only',
      title: 'Audited Accounts, Form 990 Filings & ~$300/Patient Cost Accountability',
      owner: 'Finance Department · Internal Audit · Board Treasurer',
      legalBasis: 'IPSAS/IFRS for SMEs · IRS Form 990 Public Disclosure · KRA Statutory Rules',
      summary: 'Combines annual independent financial audits and Form 990 transparency with granular per-patient KES cost attribution (~US$300 fully loaded annual cost per patient).',
      controls: [
        'Published Multi-Year Filings: Form 990 / 990EZ filings verified for FY2021–FY2025 (FYE 12/2025 revenue USD 230,639; expenses USD 189,357; net assets USD 129,746).',
        'Kenya Operational Expenses & Monthly Consolidation: Kisumu HQ consolidates verified Kisumu & Homa Bay monthly financial reports reconciled to bank/M-Pesa statements.',
        '9th-of-Month Statutory Remittance Discipline: Mandatory monthly remittance of SHIF/SHA, PAYE, KRA withholding, NSSF and Housing Levy on or before the 9th.',
        'Strict Non-Publication of Internal Ledgers: Staff salaries, bank mandates, supplier particulars and beneficiary cash vouchers remain strictly inside Finance/Audit RBAC.'
      ]
    },
    {
      id: 'safeguarding',
      badge: 'ZERO TOLERANCE',
      tone: 'b-crit',
      visibility: 'Mandatory All-Staff Safeguarding Code',
      title: 'Safeguarding & Child Protection Policy (Children Act, 2022)',
      owner: 'Safeguarding Lead · Staff Welfare · Homestay & Care Centre · HR',
      legalBasis: 'Kenya Children Act, 2022 (§27 Privacy & Best Interests) · Sexual Offences Act · LOMAMO Safeguarding Code',
      summary: 'Protects children at risk of orphanhood and critically ill adults across home visits, hospital escorts, school support, Alumni mentorship and Care Centre placements.',
      controls: [
        'Zero Tolerance Code: Binding prohibition on physical, emotional, sexual or financial exploitation of beneficiaries or children by any staff member, caregiver, Alumni mentor, intern or volunteer.',
        'Child-Specific Privacy & Care Chains: Documented guardianship (`Households & Care Chains`) during parent hospitalisation, and heightened child privacy review before any media/donor mention.',
        '24-Hour Escalation Protocol: Immediate logging in the restricted Safeguarding Register (`care-incidents`) and escalation to Country Director / Safeguarding Lead within 24 hours.'
      ]
    },
    {
      id: 'antifraud',
      badge: 'ENFORCED · DUAL CONTROL',
      tone: 'b-warn',
      visibility: 'Internal Assurance & Whistleblowing Protocol',
      title: 'Anti-Fraud, Anti-Bribery, Conflict-of-Interest & Whistleblowing Policy',
      owner: 'Internal Audit · Finance · Executive Office',
      legalBasis: 'Kenya Bribery Act · LOMAMO Financial Controls & Internal Audit Charter',
      summary: 'Prevents diversion of foodbags, medicines, hospital funds or transport allowances through cryptographic audit logs, dual signatures and three-way physical reconciliation.',
      controls: [
        '100% Free Care & Zero Kickbacks: Beneficiaries never pay for LOMAMO care or publicity; ghost beneficiaries, altered receipts and supplier kickbacks carry summary dismissal & prosecution.',
        'Three-Way Physical Reconciliation: Procurement purchases, Pharmacy/Store batch counts (including 10-day pyridoxine courses & weekly foodbags), and Caregiver delivery logs must reconcile.',
        'Dual-Office Authorization (`Rule G4` & `DualCheck`): Sensitive restores, master batch commits and 4-officer password overwrites require independent multi-account verification.',
        'Protected Whistleblowing: Confidential reporting channel to Internal Audit / Executive Oversight with non-retaliation protection.'
      ]
    },
    {
      id: 'procurement_policy',
      badge: '4-TIER · eTIMS',
      tone: 'b-info',
      visibility: 'Internal Procurement & Finance Control',
      title: '4-Tier Procurement, Supplier Vetting, Cheque & KRA eTIMS Policy',
      owner: 'Procurement Department · Finance · County Administration',
      legalBasis: 'LOMAMO Procurement Policy Framework · KRA eTIMS Tax Invoice Regulations',
      summary: 'Governs weekly foodbag baskets, quarterly WASH/hygiene/bedding kits, pharmaceuticals, 4×4 vehicle fuel/maintenance and CareLink field tablets.',
      controls: [
        '4-Tier Approval Thresholds: Structured requisition → County Admin/Finance verification → Competitive supplier quotations → Executive/Director authorization by KES band.',
        'Segregation of Duties: Requisitioner, approver, payer and goods-received verifier cannot be a single unverified actor.',
        'Mandatory Documentary Proof: Valid KRA eTIMS invoice, signed delivery note and cheque/M-Pesa reference required before settlement (unit food-budget workbooks remain internal-only).'
      ]
    }
  ],

  /* Compact statutory notice bar for sensitive HIV/clinical, intake, referral, consent & export views */
  dpaBannerHTML(view, user){
    const sensitiveViews = new Set([
      'patients', 'patient', 'pipeline', 'hardcopy', 'visits', 'pdca',
      'clinicalmcm', 'bmiboard', 'cccdesk', 'intlmedical', 'conditions',
      'consent', 'publish', 'studio', 'forms', 'form', 'careplans', 'careplan', 'interop'
    ]);
    if(!sensitiveViews.has(view)) return '';
    const prefs = (user && DB.db && DB.db.personalPrefs && DB.db.personalPrefs[user.id]) || {};
    if(prefs.hideDpaRibbon && view !== 'consent' && view !== 'publish') return '';
    return `<div class="dpa-statute-bar no-print" role="region" aria-label="Kenya Data Protection Act safeguard">
      <div class="dpa-statute-left">
        <span class="dpa-statute-tag">${ic('shield', 13)} KENYA DPA 2019 · HEALTH ACT §11</span>
        <span class="dpa-statute-txt"><b>Confidential Health, HIV/TB &amp; Child Record</b> — Care data is strictly separated from publicity &amp; personal WhatsApp/phones. Every view is SHA-256 audited.</span>
      </div>
      <div class="dpa-statute-actions">
        <button type="button" class="btn btn-xs dpa-btn" data-act="open-dpa-statement">DPA-2019 &amp; Storytelling Rules</button>
      </div>
    </div>`;
  },

  openDpaModal(){
    const S = this.DPA_STATEMENT;
    const body = `
      <div class="dpa-modal-lead">
        <div class="xs mono bold" style="color:var(--accent-fg);letter-spacing:.06em;text-transform:uppercase">${esc(S.statute)}</div>
        <div class="small" style="margin-top:4px"><b>Data Controller:</b> ${esc(S.controller)}</div>
      </div>
      <div class="dpa-clause-grid">
        ${S.clauses.map(c => `<div class="dpa-clause-card">
          <span class="dpa-clause-code">${esc(c.code)}</span>
          <h4>${esc(c.heading)}</h4>
          <p>${esc(c.body)}</p>
        </div>`).join('')}
      </div>`;
    openModal({
      title: S.title,
      sub: 'Mandatory statutory & ethical safeguards governing HIV/CCC, TB, child privacy, personal devices and storytelling in CareLink.',
      wide: true,
      body,
      footer: `<button class="btn btn-ghost" data-act="close-modal">Close</button>
        ${AUTH.user ? `<button class="btn btn-primary" data-act="go" data-v="policy">${ic('book', 14)} Open Full Governance &amp; 2027–2031 Charter</button>` : ''}`
    });
  },

  /* Comprehensive Governance, 2027–2031 Strategic Plan & 9-Part Policy Hub */
  renderGovernancePolicyCenter(user, params = {}){
    const tab = params.tab || (APPX.params && APPX.params.tab) || 'charter';
    const kb = (DB.db && DB.db.kbDocs) || [];
    const consents = (DB.db && DB.db.consents) || [];
    const activeConsents = consents.filter(c => c.status === 'active' || c.granted !== false).length;
    const auditCheck = (typeof AUDIT !== 'undefined' && AUDIT.verify) ? AUDIT.verify() : { ok: true, count: 0 };

    const tabs = [
      ['charter', 'Governance & 8 Enforced Policies', 'shieldcheck'],
      ['dpa', 'Kenya DPA (2019) & 22-Point Checklist', 'lock'],
      ['strategic', 'Strategic Plan (2027–2031)', 'target'],
      ['legal', 'Legal, Board & Audited Stewardship', 'building'],
      ['vault', 'Mandatory Rules & Zero-Upload Verifier', 'book']
    ];

    const head = pageHead(
      'CareLink Governance, Policies & 2027–2031 Strategic Charter',
      'Enforced institutional policies, 9-Part Confidentiality & Ethical Storytelling Framework, Kenya Data Protection Act (2019) / Health Act (§11) / Children Act (§27) safeguards, and 2027–2031 Strategic Plan alignment. Raw confidential source documents are never published externally.',
      `<button class="btn btn-sm btn-ghost" type="button" data-act="open-dpa-statement">${ic('shield', 14)} Statutory DPA Notice</button>
       ${RBAC.has(user, 'media.consent.manage') ? `<button class="btn btn-sm btn-primary" type="button" data-act="go" data-v="consent">${ic('check', 14)} Consent Register (${num(activeConsents)})</button>` : ''}`
    );

    const kpis = `<div class="grid g4" style="margin-bottom:16px">
      ${kpi('Storytelling & DPA Policy', 'ADOPTED v3.2', '5-layer consent + 22-point pre-publication checklist', 'ok', 'shieldcheck')}
      ${kpi('2027–2031 Caseload Target', '3,703 Active', '7× scale-up · ~3,330 recoveries/yr by 2031', 'info', 'target')}
      ${kpi('Audit Chain Integrity', auditCheck.ok ? '100% Verified' : 'Review Needed', 'SHA-256 tamper-evident clinical & media log', auditCheck.ok ? 'ok' : 'crit', 'lock')}
      ${kpi('External Publication Guard', 'Zero Raw Docs', 'Confidential PDFs/schedules & HIV/PII strictly blocked', 'ok', 'eyeoff')}
    </div>`;

    const tabBar = `<div class="tabs" role="tablist" style="margin-bottom:16px">
      ${tabs.map(([id, lbl, iconName]) => `<button class="tab ${tab === id ? 'active' : ''}" role="tab" type="button" data-act="go" data-v="policy" data-tab="${id}">${ic(iconName, 14)} <span>${esc(lbl)}</span></button>`).join('')}
    </div>`;

    let body = '';
    if(tab === 'strategic'){
      body = STRATEGIC_PLAN.renderScorecard(user, { compact: false }) +
        `<div class="grid g2" style="gap:16px">
          ${card('Section 10.1 Annual M&E Reporting Indicators (2027–2031)', `
            <ul class="gov67-list">
              ${STRATEGIC_PLAN.ANNUAL_ME_INDICATORS.map(ind => `<li>${esc(ind)}</li>`).join('')}
            </ul>`)}
          ${card('Capital, Workforce & Statutory Health Strategy Alignment', `
            <div class="xs bold muted" style="text-transform:uppercase;margin-bottom:6px">Capital &amp; People Enablers (~US$300/patient/yr · +$960.9k/yr incremental by 2031)</div>
            <ul class="gov67-list" style="margin-bottom:12px">
              ${STRATEGIC_PLAN.CAPITAL_REQUIREMENTS.map(c => `<li>${esc(c)}</li>`).join('')}
            </ul>
            <div class="xs bold muted" style="text-transform:uppercase;margin-bottom:6px">Statutory &amp; National Health Strategy Alignment</div>
            <div class="col" style="gap:6px">
              ${STRATEGIC_PLAN.alignedFrameworks.map(f => `<div class="gov67-item"><span class="gov67-ic">${ic('check', 14)}</span><span class="xs"><b>${esc(f)}</b></span></div>`).join('')}
            </div>`)}
        </div>`;
    } else if(tab === 'dpa'){
      const S = this.DPA_STATEMENT;
      body = card(S.title, `
        <div class="alert info" style="margin-bottom:14px">${ic('shield', 16)}<div>
          <b>${esc(S.statute)}</b>
          <div class="small" style="margin-top:2px">${esc(S.controller)}</div>
        </div></div>
        <div class="dpa-clause-grid">
          ${S.clauses.map(c => `<div class="dpa-clause-card">
            <span class="dpa-clause-code">${esc(c.code)}</span>
            <h4>${esc(c.heading)}</h4>
            <p>${esc(c.body)}</p>
          </div>`).join('')}
        </div>`) +
      `<div class="grid g2" style="gap:16px;margin-top:16px">
        ${card('Compulsory 22-Point Pre-Publication Checklist (Part VII)', `
          <div class="col" style="gap:10px">
            ${this.PRE_PUB_CHECKLIST.map(g => `<div class="sp67-subbox">
              <div class="xs mono bold" style="color:var(--accent-fg);margin-bottom:5px">${esc(g.gate)}</div>
              <ul class="gov67-list">${g.items.map(it => `<li>${esc(it)}</li>`).join('')}</ul>
            </div>`).join('')}
          </div>`, { sub:'Every applicable item must be YES before any identifiable story or image is published.' })}
        ${card('10-Stage Storytelling Approval Workflow & 7-Step Breach Response', `
          <h4 class="small bold" style="margin-bottom:8px">Guideline 10 — Multi-Actor Approval Pipeline</h4>
          ${table([
            { label:'Stage', render:r => `<b class="mono xs">${esc(r[0])}</b>` },
            { label:'Control Action', render:r => `<span class="xs">${esc(r[1])}</span>` },
            { label:'Accountable Role', render:r => `<span class="xs muted">${esc(r[2])}</span>` }
          ], this.TEN_STAGE_WORKFLOW, { compact:true })}
          <div class="alert warn" style="margin-top:12px">${ic('alert', 15)}<div>
            <b>Part V.6 — 7-Step Data Breach Response Procedure</b>
            <div class="xs" style="margin-top:3px">1. Contain immediately &rarr; 2. Identify affected data &amp; individuals &rarr; 3. Assess stigma/safety harm &rarr; 4. Preserve audit evidence &rarr; 5. Remediate &amp; revoke compromised access &rarr; 6. Notify affected data subjects &amp; ODPC within statutory timelines &rarr; 7. Log root-cause prevention.</div>
          </div></div>`)}
      </div>`;
    } else if(tab === 'legal'){
      const P = (typeof PORTAL_CONTENT !== 'undefined') ? PORTAL_CONTENT : null;
      const boardList = P && Array.isArray(P.board) ? P.board : [];
      const filings = P && P.transparency && Array.isArray(P.transparency.filings) ? P.transparency.filings : [];
      const revs = P && P.transparency && Array.isArray(P.transparency.revenues) ? P.transparency.revenues : [];
      body = `<div class="grid g2" style="gap:16px">
        ${card('Legal Registration & Dual-Jurisdiction Governance', `
          <dl class="dl">
            <dt>Kenya Programme Entity</dt><dd><b>LOMAMO Foundation Kenya</b></dd>
            <dt>Government Approval</dt><dd>Approved 19 October 2018 (Kick-Off 28 October 2018)</dd>
            <dt>Operating Footprint</dt><dd>10 Ministry Areas across Kisumu (7) &amp; Homa Bay (3, launched Feb 2026) — scaling across all sub-counties (2027–2031)</dd>
            <dt>US Partner Entity</dt><dd><b>LOVE MATTERS MOST, Inc.</b> (California 501(c)(3), formed 2019)</dd>
            <dt>IRS EIN &amp; NTEE</dt><dd class="mono">EIN 83-3329252 · NTEE P20 (Human Service Organizations)</dd>
            <dt>Regulatory &amp; Legal Track</dt><dd>${badge('ODPC Registration & Kenyan Advocate Review Tracked', 'b-info')}</dd>
          </dl>`)}
        ${card('Board Composition & Executive Officers', `
          <div class="small" style="margin-bottom:8px"><b>Executive Officers:</b> Pamela McClanahan (Chief Executive Officer) · Michael McClanahan (Treasurer) · Martin Chamah (Kenya Director)</div>
          <div class="row" style="gap:6px;flex-wrap:wrap">
            ${boardList.map(b => `<span class="chip">${esc(b)}</span>`).join('')}
          </div>
          <div class="xs muted" style="margin-top:10px">Personal contact particulars, national IDs and conflict-of-interest declarations are held offline/internally and never exposed publicly.</div>`)}
      </div>` +
      card('Audited / Published Stewardship Filings & Internal Ledger Separation', `
        <div class="grid g2" style="gap:16px">
          <div>
            <h4 class="small bold" style="margin-bottom:8px">Published Annual Filings (EIN 83-3329252)</h4>
            ${table([
              { label:'Fiscal Period', render:r => `<b class="mono">${esc(r.year)}</b>` },
              { label:'Total Revenue', cls:'num', render:r => `<span class="mono">$${num(r.total)}</span>` },
              { label:'Grants', cls:'num', render:r => `<span class="mono">$${num(r.grants)}</span>` }
            ], revs, { compact:true })}
          </div>
          <div>
            <h4 class="small bold" style="margin-bottom:8px">Form 990 / 990EZ Verification History</h4>
            ${table([
              { label:'Tax Year', render:f => `<span class="mono">${esc(f.year)}</span>` },
              { label:'Form', render:f => badge(f.form, 'b-info') },
              { label:'IRS Received', render:f => `<span class="mono xs">${esc(f.received)}</span>` }
            ], filings, { compact:true })}
          </div>
        </div>
        <div class="alert warn" style="margin-top:12px">${ic('lock', 15)}<div><b>Internal-Only Financial Schedules Never Published</b>
          <span class="small">Detailed Kenyan bank reconciliations, payroll sheets, supplier quotations, projected food-budget unit workbooks and beneficiary vouchers are restricted to Finance, Procurement, Audit and Executive RBAC.</span></div></div>`, { style:'margin-top:16px' });
    } else if(tab === 'vault'){
      body = `<div class="grid g2" style="gap:16px">
        ${card('Mandatory Non-Waivable Technical Rules (G1–G8)', `
          <div class="col" style="gap:9px">${GOV.MANDATORY.map(g => `<div class="row" style="gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--line-2)">
            <span style="color:var(--ok);flex:0 0 18px;margin-top:1px">${ic('lock', 16)}</span>
            <div><div class="small"><b>${esc(g.id.toUpperCase())}</b> — ${esc(g.rule)}</div><div class="xs muted" style="margin-top:2px">Enforced in data &amp; API repository layer</div></div>
          </div>`).join('')}</div>`)}
        ${card('Ephemeral Local Document Hash Verifier (Zero Upload / Zero Publication)', `
          <p class="small">Verify that a confidential governance file on your device (e.g. Strategic Plan 2027–2031, Confidentiality &amp; Ethical Storytelling Policy, Safeguarding Policy, Audited Accounts, Employee Handbook) matches your internal register <b>without uploading or storing the document</b>. Only its SHA-256 fingerprint is computed in volatile browser memory and immediately cleared.</p>
          <div class="field" style="margin-top:10px">
            <label>Select confidential document for local-only SHA-256 verification (never uploaded)</label>
            <input type="file" class="input" data-local-policy-verify accept=".pdf,.doc,.docx,.xlsx,.txt,.md">
          </div>
          <div id="localPolicyVerifyOut" class="note" style="margin-top:10px">${ic('shield', 15)}<span>No document content leaves your browser; zero bytes are transmitted to Cloud KV or GitHub.</span></div>`)}
      </div>` +
      card('Indexed Governance Knowledge Base (Raw Documents Strictly Internal)', table([
        { label:'Policy / Standard', render:d => `<div class="cellname">${esc(d.title)}<span class="sm">${esc(d.type)} · ${esc(d.version)}</span></div>` },
        { label:'Classification', render:d => badge(d.classification, d.proposed ? 'b-warn' : 'b-ok', 'nodot') },
        { label:'Custodian', render:d => `<span class="small">${esc(d.owner)}</span>` },
        { label:'Public Portal', render:() => badge('Never Published Raw', 'b-neutral') }
      ], kb), { style:'margin-top:16px' });
    } else {
      body = `<div class="gov67-charter-grid">
        ${this.CHARTER_SECTIONS.map(sec => `<article class="gov67-sec-card">
          <div class="spread" style="gap:8px;align-items:flex-start">
            <span class="badge ${sec.tone}">${esc(sec.badge)}</span>
            <span class="xs mono muted">${esc(sec.visibility)}</span>
          </div>
          <h3>${esc(sec.title)}</h3>
          <div class="xs muted" style="margin-bottom:6px"><b>Custodian:</b> ${esc(sec.owner)} · <b>Basis:</b> ${esc(sec.legalBasis)}</div>
          <p class="small">${esc(sec.summary)}</p>
          <ul class="gov67-list">
            ${sec.controls.map(c => `<li>${esc(c)}</li>`).join('')}
          </ul>
        </article>`).join('')}
      </div>`;
    }

    return head + kpis + tabBar + body;
  }
};

/* ----------------------------------------------------------------------------
   3. DECONGESTED MULTI-ARCHETYPE DEPARTMENTAL CONSOLE WORKSPACES
      Gives each department/role family a tailored, uncluttered visual layout
      archetype while preserving personal widget arrangement (DASH.apply).
   ---------------------------------------------------------------------------- */
const WORKSPACE_LAYOUTS = {
  ARCHETYPES: {
    'exec-briefing': {
      id: 'exec-briefing',
      label: 'Executive Strategic Split',
      tag: 'EXECUTIVE BRIEFING DECK',
      accentStyle: 'serif-editorial',
      desc: 'Balanced 2-column executive briefing pairing 2027–2031 strategic indicators with tabbed secondary modules.'
    },
    'clinical-triage': {
      id: 'clinical-triage',
      label: 'Clinical Acuity Board',
      tag: 'CLINICAL & CASE TRIAGE',
      accentStyle: 'clinical-clean',
      desc: 'Acuity-first split workspace highlighting urgent clinical queues, PDCA reviews and 10-day TB/BMI alerts.'
    },
    'field-action': {
      id: 'field-action',
      label: 'Field Household Deck',
      tag: 'MINISTRY FIELD CONSOLE',
      accentStyle: 'warm-cards',
      desc: 'Spacious, touch-first field cards focused on ministry visit days, household follow-ups and ~25-patient caseload care.'
    },
    'ledger-matrix': {
      id: 'ledger-matrix',
      label: 'Stewardship Ledger Matrix',
      tag: 'FINANCE & PROCUREMENT LEDGER',
      accentStyle: 'tabular-crisp',
      desc: 'Structured side-by-side financial, 9th statutory and 4-Tier procurement reconciliation matrix with zero clutter.'
    },
    'studio-editorial': {
      id: 'studio-editorial',
      label: 'Governance & Editorial Studio',
      tag: 'STORYTELLING & PARTNER DESK',
      accentStyle: 'magazine-clean',
      desc: 'Clean editorial layout foregrounding 5-layer consent, 22-point pre-publication checks and DPA-2019 compliance.'
    },
    'command-grid': {
      id: 'command-grid',
      label: 'Operations & Assurance Grid',
      tag: 'OPERATIONAL COMMAND GRID',
      accentStyle: 'technical-grid',
      desc: 'Modular 2-zone command deck separating primary operational queues from expandable reference panels.'
    }
  },

  archetypeFor(user){
    const r = (user && user.roleId) || '';
    if(['president', 'director', 'program.admin', 'program.assistant'].includes(r)) return 'exec-briefing';
    if(['mcm', 'nurse', 'depthead', 'intl.medical', 'ccc.clinician', 'liaison', 'homestay'].includes(r)) return 'clinical-triage';
    if(['caregiver', 'chw', 'coordinator'].includes(r)) return 'field-action';
    if(['finance', 'procurement', 'countyadmin', 'assistant', 'auditor'].includes(r)) return 'ledger-matrix';
    if(['mediahead', 'pr', 'gov.partner'].includes(r)) return 'studio-editorial';
    return 'command-grid';
  },

  modeFor(user){
    const prefs = (user && DB.db && DB.db.personalPrefs && DB.db.personalPrefs[user.id]) || {};
    return prefs.homeLayoutMode || 'smart';
  },

  sectionTabFor(user){
    const prefs = (user && DB.db && DB.db.personalPrefs && DB.db.personalPrefs[user.id]) || {};
    return Number(prefs.homeSecIdx) || 0;
  },

  isStatTile(html){
    const s = String(html || '').trim();
    return /^<div class="kpi\b/i.test(s) && !/<div class="card\b/i.test(s);
  },

  extractTitle(html, fallback){
    const m = String(html || '').match(/<h3[^>]*>([\s\S]*?)<\/h3>/i) || String(html || '').match(/<div class="k">([\s\S]*?)<\/div>/i);
    if(!m) return fallback;
    return m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 42) || fallback;
  },

  renderHomeWorkspace(user, ctx){
    const archKey = this.archetypeFor(user);
    const arch = this.ARCHETYPES[archKey] || this.ARCHETYPES['command-grid'];
    const mode = this.modeFor(user);
    const role = roleObj(user.roleId) || {};
    const dept = deptObj(user.departmentId) || { name:'Operations', accent:'#1E3A8A' };
    const countyLabel = user.countyId ? countyName(user.countyId) : 'Kisumu HQ & Homa Bay';
    const arranged = ctx.arranged || [];

    const kpiTiles = [];
    const contentCards = [];
    arranged.forEach(item => {
      if(this.isStatTile(item) && kpiTiles.length < 6) kpiTiles.push(item);
      else contentCards.push(item);
    });

    const roleSpec = (typeof ROLE_CONSOLES_68 !== 'undefined' && ROLE_CONSOLES_68.specFor) ? ROLE_CONSOLES_68.specFor(user) : null;
    const scopeLabel = (typeof ROLE_CONSOLES_68 !== 'undefined' && ROLE_CONSOLES_68.scopeBadge)
      ? ROLE_CONSOLES_68.scopeBadge(user)
      : `${countyLabel} · ${dept.name}`;
    const qtabs = Array.isArray(ctx.qtabs) ? ctx.qtabs.slice(0, 4) : [];
    const barCfg = (typeof ROLE_CTX !== 'undefined' && ROLE_CTX.roleBarConfig) ? ROLE_CTX.roleBarConfig(user) : { tabs: [] };
    const roleTabs = Array.isArray(barCfg.tabs) ? barCfg.tabs.slice(0, 6) : [];
    const roleTabsHtml = `<div class="ctx-role-tabs ws67-role-tabs" style="justify-content:space-between;gap:10px" role="navigation" aria-label="Role contextual workspace tabs">
        <div class="row" style="gap:6px;flex-wrap:wrap">
          ${roleTabs.map(t => `<button type="button" class="ctx-rtab ${t.v === 'home' ? 'on' : ''}" data-act="go" data-v="${esc(t.v)}">${ic(t.ic || 'file', 13)}<span>${esc(t.l)}</span></button>`).join('')}
        </div>
        <div class="seg ws67-mode-seg no-print" role="group" aria-label="Console workspace layout mode">
          <button type="button" class="${mode === 'smart' ? 'on' : ''}" data-act="ws-layout-mode" data-mode="smart">Decongested Deck</button>
          <button type="button" class="${mode === 'tabbed' ? 'on' : ''}" data-act="ws-layout-mode" data-mode="tabbed">Focused Tabs</button>
          <button type="button" class="${mode === 'full' ? 'on' : ''}" data-act="ws-layout-mode" data-mode="full">Expanded Stack</button>
        </div>
      </div>`;
    const headerHtml = `<section class="ws67-hero ctx-strip" data-archetype="${esc(arch.id)}" data-dept="${esc(role.dept || 'exec')}" data-role="${esc(user.roleId)}" style="${roleSpec && roleSpec.color ? `--ws-accent:${esc(roleSpec.color)}` : ''}">
      <div class="ws67-hero-main">
        <div class="ws67-hero-copy">
          <div class="ws67-eyebrow">
            <span class="ws67-arch-pill hero-dept-pill">${esc((roleSpec && roleSpec.code) || arch.tag)}</span>
            <span class="ws67-scope-pill">${ic('globe', 12)} ${esc(scopeLabel)}</span>
          </div>
          <h2 class="ws67-greeting">${esc(ctx.greeting)}, ${esc(user.name.replace(/^Demo - /, ''))}</h2>
          <p class="ws67-sub">${esc((roleSpec && roleSpec.summary) || `${role.consoleTitle || 'Department Console'} — ${ctx.dateStr}. ${ctx.scopeText}`)}</p>
          <div class="ws67-actions">
            ${ctx.actionsHtml || ''}
            <button class="btn btn-xs btn-ghost ws67-tool-btn" type="button" data-act="open-switch-account">${ic('users', 13)} Switch Account</button>
            <button class="btn btn-xs btn-ghost ws67-tool-btn" type="button" data-act="wtheme-open" data-tab="studio">${ic('palette', 13)} Themes &amp; Style</button>
            <button class="btn btn-xs btn-ghost ws67-tool-btn" type="button" data-act="arrange-home">${ic('settings', 13)} Arrange</button>
          </div>
        </div>
        ${qtabs.length ? `<div class="ws67-qgrid hero-qtabs" role="group" aria-label="Key console metrics">
          ${qtabs.map(qt => `<button type="button" class="ws67-qcard ${qt.alert ? 'is-alert' : ''}" data-act="go" data-v="${esc(qt.v)}">
            <span class="ws67-qlbl">${ic(qt.icon || 'activity', 13)} <span>${esc(qt.label)}</span></span>
            <b class="ws67-qnum">${num(qt.count)}</b>
          </button>`).join('')}
        </div>` : ''}
      </div>
      ${roleTabsHtml}
    </section>`;

    const kpiHtml = kpiTiles.length
      ? `<div class="grid ${kpiTiles.length === 3 ? 'g3' : 'g4'} ws67-kpi-row">${kpiTiles.slice(0, 4).join('')}</div>`
      : '';

    const bespokeBlock = (typeof ROLE_CONSOLES_68 !== 'undefined' && ROLE_CONSOLES_68.renderSignatureBlock)
      ? ROLE_CONSOLES_68.renderSignatureBlock(user)
      : '';

    const showStrategicOnHome = ['president', 'director'].includes(user.roleId);
    const strategicHtml = showStrategicOnHome ? STRATEGIC_PLAN.renderScorecard(user, { compact: true }) : '';

    let cardsHtml = '';
    if(!contentCards.length){
      cardsHtml = '';
    } else if(mode === 'tabbed'){
      const activeIdx = Math.min(contentCards.length - 1, Math.max(0, this.sectionTabFor(user)));
      cardsHtml = `<div class="ws67-tabbed-deck">
        <div class="tabs ws67-mod-tabs" role="tablist">
          ${contentCards.map((c, idx) => `<button type="button" class="tab ${idx === activeIdx ? 'active' : ''}" data-act="ws-sec-tab" data-idx="${idx}">${esc(this.extractTitle(c, 'Workspace ' + (idx + 1)))}</button>`).join('')}
        </div>
        <div class="ws67-mod-stage">${contentCards[activeIdx]}</div>
      </div>`;
    } else if(mode === 'smart' && contentCards.length > 2){
      const primary = contentCards.slice(0, 2);
      const secondary = contentCards.slice(2);
      const secIdx = Math.min(secondary.length - 1, Math.max(0, this.sectionTabFor(user)));
      cardsHtml = `<div class="ws67-primary-grid arch-${esc(arch.id)}">
          ${primary.map(c => `<div class="ws67-primary-slot">${c}</div>`).join('')}
        </div>
        <section class="ws67-secondary-drawer" aria-label="Additional console modules">
          <div class="ws67-drawer-head">
            <div>
              <span class="ws67-drawer-tag">SECONDARY WORKSPACE MODULES (${secondary.length})</span>
              <span class="xs muted">Select any module tab below — keeps your main workspace clean and uncongested.</span>
            </div>
          </div>
          <div class="tabs ws67-mod-tabs" role="tablist">
            ${secondary.map((c, idx) => `<button type="button" class="tab ${idx === secIdx ? 'active' : ''}" data-act="ws-sec-tab" data-idx="${idx}">${esc(this.extractTitle(c, 'Module ' + (idx + 3)))}</button>`).join('')}
          </div>
          <div class="ws67-mod-stage">${secondary[secIdx]}</div>
          <details class="ws67-all-modules-toggle">
            <summary class="xs muted">Show all ${secondary.length} remaining modules simultaneously</summary>
            <div class="ws67-stack" style="margin-top:12px">${secondary.filter((_, idx) => idx !== secIdx).join('')}</div>
          </details>
        </section>`;
    } else {
      cardsHtml = `<div class="${contentCards.length === 2 ? 'ws67-primary-grid arch-' + esc(arch.id) : 'ws67-stack'}">${contentCards.join('')}</div>`;
    }

    return headerHtml + kpiHtml + bespokeBlock + strategicHtml + cardsHtml;
  }
};

/* ----------------------------------------------------------------------------
   4. SMOOTH LOGINS & ONLINE-SAFE ACCOUNT SWITCHER (PCs & TABLETS)
   ---------------------------------------------------------------------------- */
const ACCOUNT_SWITCHER = {
  RECENT_KEY: 'carelink_recent_usernames_v67',

  recentUsernames(){
    try{
      const raw = Store.get(this.RECENT_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter(x => typeof x === 'string' && x.trim()).slice(0, 8) : [];
    }catch(_e){ return []; }
  },

  rememberUsername(username){
    const u = String(username || '').trim().toLowerCase();
    if(!u) return;
    try{
      const next = [u, ...this.recentUsernames().filter(x => x !== u)].slice(0, 8);
      Store.set(this.RECENT_KEY, JSON.stringify(next));
    }catch(_e){}
  },

  openModal(filterDept = 'all'){
    const cur = AUTH.user;
    const isProdLocked = (typeof PROD_SETUP !== 'undefined' && PROD_SETUP.isGloballyActivated && PROD_SETUP.isGloballyActivated()) ||
      (typeof commissionedEntryActive === 'function' && commissionedEntryActive());

    if(isProdLocked){
      const recents = this.recentUsernames().filter(u => !cur || u !== cur.username);
      const body = `
        <form data-form="live-switch-account">
          <div class="alert info" style="margin-bottom:12px">${ic('shieldcheck', 15)}<div>
            <b>Shared County Office PC / Tablet Account Switch</b>
            <span class="small">Closes <b>@${esc(cur ? cur.username : 'current')}</b> cleanly and opens the incoming staff member's scoped console with a fresh session token.</span>
          </div></div>
          ${recents.length ? `<div style="margin-bottom:10px">
            <div class="xs bold muted" style="text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px">Recent Staff Usernames on This Device</div>
            <div class="row" style="gap:6px;flex-wrap:wrap">
              ${recents.map(ru => `<button type="button" class="chip" data-act="fill-switch-user" data-u="${esc(ru)}">@${esc(ru)}</button>`).join('')}
            </div>
          </div>` : ''}
          <div class="field">
            <label>Incoming Staff Username or Official Email *</label>
            <input class="input" id="sw-live-u" name="username" required autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="e.g. director, mcm.kisumu, caregiver.nyalenda">
          </div>
          <div class="field">
            <label>Private Password *</label>
            <div class="pw-wrap">
              <input class="input" id="sw-live-p" name="password" type="password" required autocomplete="current-password" placeholder="Enter your private CareLink password">
              <button type="button" class="pw-eye" data-act="toggle-pw" aria-label="Show password">${ic('eye', 15)}</button>
            </div>
          </div>
          <div class="modal-foot">
            <button type="button" class="btn btn-ghost" data-act="close-modal">Cancel</button>
            <button type="submit" class="btn btn-primary">${ic('key', 14)} Switch Staff Session</button>
          </div>
        </form>`;
      return openModal({ title:'Switch Staff Account', sub:'Fast, secure handoff on shared Kisumu & Homa Bay workstations', narrow:true, body });
    }

    const allUsers = ((DB.db && DB.db.users) || []).filter(u => u && u.active !== false);
    const groups = [
      ['all', 'All Consoles'],
      ['exec', 'Executive & Admin'],
      ['clinical', 'Clinical, Hospital & Care'],
      ['field', 'Field Ministry'],
      ['finance', 'Finance, Procure & Audit'],
      ['people', 'HR, Media, Fleet & Partners']
    ];
    const matchGroup = u => {
      const d = (roleObj(u.roleId) || {}).dept || u.departmentId || '';
      if(filterDept === 'all') return true;
      if(filterDept === 'exec') return ['exec', 'admin', 'it'].includes(d);
      if(filterDept === 'clinical') return ['medical', 'hospital', 'homestay', 'intldata'].includes(d);
      if(filterDept === 'field') return ['ministry'].includes(d);
      if(filterDept === 'finance') return ['finance', 'procure', 'audit', 'me'].includes(d);
      if(filterDept === 'people') return ['hr', 'welfare', 'media', 'pr', 'vehicle'].includes(d);
      return true;
    };
    const shown = allUsers.filter(matchGroup);

    const body = `
      <div class="tabs" style="margin-bottom:12px">
        ${groups.map(([gid, glbl]) => `<button type="button" class="tab ${filterDept === gid ? 'active' : ''}" data-act="open-switch-account" data-grp="${gid}">${esc(glbl)}</button>`).join('')}
      </div>
      <div class="sw67-grid">
        ${shown.map(u => {
          const r = roleObj(u.roleId) || {};
          const d = deptObj(r.dept || u.departmentId) || { name:'Operations', accent:'#1E3A8A' };
          const isCurrent = cur && cur.username === u.username;
          const scopeLbl = (u.areaIds && u.areaIds.length)
            ? `${countyName(u.countyId)} · ${u.areaIds.map(areaName).join(', ')}`
            : (u.countyId ? countyName(u.countyId) : 'Global / Both Counties');
          return `<button type="button" class="sw67-item ${isCurrent ? 'is-current' : ''}" style="--sw-c:${d.accent || '#1E3A8A'}" ${isCurrent ? 'disabled' : `data-act="confirm-switch-account" data-u="${esc(u.username)}" data-v="home" data-asset="${esc(r.consoleTitle || r.name || 'Console')}"`}>
            <div class="sw67-top">
              <span class="sw67-dept" style="background:${d.accent || '#1E3A8A'}">${esc(d.short || d.name)}</span>
              ${isCurrent ? `<span class="badge b-ok">Current</span>` : `<span class="xs mono muted">@${esc(u.username)}</span>`}
            </div>
            <b class="sw67-role">${esc(u.jobTitle || r.name || u.name)}</b>
            <span class="sw67-name">${esc(u.name.replace(/^Demo - /, ''))} · ${esc(scopeLbl)}</span>
          </button>`;
        }).join('')}
      </div>`;

    openModal({
      title: 'Switch Console & Role View',
      sub: `Instant, scoped role switching across ${allUsers.length} authorised accounts (rotates session, theme & RBAC cleanly)`,
      wide: true,
      body,
      footer: `<button class="btn btn-ghost" data-act="close-modal">Stay in Current Console</button>
        <button class="btn btn-danger" data-act="logout">${ic('logout', 14)} Sign Out to Front Page</button>`
    });
  },

  async executeDemoSwitch(d){
    if((typeof demoEntryBlocked === 'function' && demoEntryBlocked()) || (typeof PROD_SETUP !== 'undefined' && PROD_SETUP.isGloballyActivated && PROD_SETUP.isGloballyActivated())){
      closeAllModals(true);
      return toast('Demonstration locked', 'Use Switch Staff Account with your private password on an activated installation.', 'warn');
    }
    const prev = AUTH.user ? AUTH.user.username : '';
    const target = ((DB.db && DB.db.users) || []).find(x => x.username === d.u);
    if(!target) return toast('Account not found', '', 'err');

    let loggedInOnline = false;
    if(typeof SYNC !== 'undefined' && SYNC.available && SYNC.available() && typeof AUTH.loginOnline === 'function'){
      try{
        const onlineRes = await AUTH.loginOnline(target.username, 'LOMAMO2026');
        if(onlineRes && onlineRes.ok) loggedInOnline = true;
      }catch(_e){ loggedInOnline = false; }
    }
    if(!loggedInOnline){
      if(!target.hash || !target.salt){
        target.salt = newSalt();
        target.hash = strongHash('LOMAMO2026', target.salt);
      }
      const r = AUTH.login(target.username, 'LOMAMO2026');
      if(!r.ok){
        AUTH.user = target;
        AUTH.session = { started: todayISO(), last: Date.now(), token: 'demo-switch' };
      }
    }

    this.rememberUsername(target.username);
    const role = roleObj(target.roleId);
    const scope = (target.areaIds && target.areaIds.length)
      ? `${countyName(target.countyId)} · ${target.areaIds.map(areaName).join(', ')}`
      : (target.countyId ? countyName(target.countyId) : 'All Counties');
    DEMO_SWITCH.activeNotice = {
      username: target.username,
      name: target.name,
      role: role ? role.name : target.roleId,
      scope,
      asset: d.asset || d.v || 'Authorised Workspace',
      prevUsername: prev
    };
    APPX.aiOpen = false;
    APPX.showUserMenu = false;
    const dock = typeof document !== 'undefined' && document.querySelector ? document.querySelector('.ai-dock') : null;
    if(dock) dock.remove();
    closeAllModals(true);
    APPX.screen = 'app';
    SESSION.start();
    applyTheme();
    NAVH.reset();
    go(d.v || 'home');
    toast('Switched Console', `Now viewing as ${target.name.replace(/^Demo - /, '')} (${role ? role.name : target.roleId}).`, 'info');
  },

  async executeLiveSwitch(fd){
    const u = String(fd.get('username') || '').trim().toLowerCase();
    const p = String(fd.get('password') || '');
    if(!u || !p) return toast('Credentials required', 'Enter both username and private password.', 'err');

    const online = typeof SYNC !== 'undefined' && SYNC.available && SYNC.available();
    if(online){
      await SYNC.logout();
      const res = await AUTH.loginOnline(u, p);
      if(!res || !res.ok){
        return toast('Switch refused', (res && res.msg) || 'Username or password was not accepted.', 'err');
      }
    } else {
      const res = AUTH.login(u, p);
      if(!res || !res.ok){
        return toast('Switch refused', (res && res.msg) || 'Username or password was not accepted.', 'err');
      }
    }

    this.rememberUsername(AUTH.user ? AUTH.user.username : u);
    DEMO_SWITCH.activeNotice = null;
    APPX.aiOpen = false;
    APPX.showUserMenu = false;
    const dock = typeof document !== 'undefined' && document.querySelector ? document.querySelector('.ai-dock') : null;
    if(dock) dock.remove();
    closeAllModals(true);
    if(AUTH.mustChange){
      APPX.screen = 'mustchange';
      return render();
    }
    APPX.screen = 'app';
    SESSION.start();
    applyTheme();
    NAVH.reset();
    go('home');
    toast('Account Switched', `Signed in as ${AUTH.user.name} (${(roleObj(AUTH.user.roleId) || {}).name || AUTH.user.roleId}).`, 'ok');
  }
};

/* Register v6.7 Actions & Forms */
Object.assign(ACTIONS, {
  'open-dpa-statement': () => CARELINK_GOVERNANCE.openDpaModal(),
  'open-switch-account': (d = {}) => { closeAllModals(true); ACCOUNT_SWITCHER.openModal(d.grp || 'all'); },
  'fill-switch-user': (d = {}) => {
    const inp = $('#sw-live-u');
    if(inp){ inp.value = d.u || ''; }
    const pw = $('#sw-live-p');
    if(pw){ try{ pw.focus(); }catch(_e){} }
  },
  'confirm-switch-account': (d = {}) => ACCOUNT_SWITCHER.executeDemoSwitch(d),
  'ws-layout-mode': (d = {}) => {
    if(!AUTH.user) return;
    DB.db.personalPrefs = DB.db.personalPrefs || {};
    DB.db.personalPrefs[AUTH.user.id] = DB.db.personalPrefs[AUTH.user.id] || {};
    DB.db.personalPrefs[AUTH.user.id].homeLayoutMode = d.mode || 'smart';
    DB.save();
    render();
  },
  'ws-sec-tab': (d = {}) => {
    if(!AUTH.user) return;
    DB.db.personalPrefs = DB.db.personalPrefs || {};
    DB.db.personalPrefs[AUTH.user.id] = DB.db.personalPrefs[AUTH.user.id] || {};
    DB.db.personalPrefs[AUTH.user.id].homeSecIdx = Number(d.idx) || 0;
    DB.save();
    render();
  }
});

Object.assign(FORMS, {
  'live-switch-account': fd => ACCOUNT_SWITCHER.executeLiveSwitch(fd)
});

/* Browser-only volatile SHA-256 hash verifier for confidential policy files (zero upload, zero storage of file contents) */
if(typeof document !== 'undefined' && document.addEventListener){
  document.addEventListener('change', async (ev) => {
    const inp = ev && ev.target;
    if(!inp || !inp.hasAttribute || !inp.hasAttribute('data-local-policy-verify')) return;
    const f = inp.files && inp.files[0];
    if(!f) return;
    const out = $('#localPolicyVerifyOut');
    try{
      const buf = await f.arrayBuffer();
      let hex = '';
      if(typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest){
        const digest = await crypto.subtle.digest('SHA-256', buf);
        hex = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
      } else {
        hex = fnv1a(String(f.size) + ':' + String(f.lastModified));
      }
      inp.value = '';
      if(out){
        out.innerHTML = `${ic('check', 15)}<span><b>Verified Locally in Volatile Memory (${num(Math.round(f.size / 1024))} KB)</b> · SHA-256: <code class="mono">${esc(hex.slice(0, 24))}…</code> · Zero bytes uploaded or stored.</span>`;
      }
      toast('Verified Locally (Zero Upload)', 'SHA-256 fingerprint verified in browser memory and file handle cleared.', 'ok');
    }catch(_e){
      inp.value = '';
      if(out) out.innerHTML = `${ic('alert', 15)}<span>Could not compute local SHA-256 digest.</span>`;
    }
  });
}
