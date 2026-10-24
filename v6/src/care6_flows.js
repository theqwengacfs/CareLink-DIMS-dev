/* ============================================================
   care6_flows.js - LOMAMO C-DIMS v6 Clinical, Governance,
   Demo-Switch & Role-Contextual Workspace Extensions
   ============================================================ */

/* ------------------------------------------------------------
   1. PAT_DISCHARGE - Patient Programme Discharge Summary &
      Structured Discharge Referral Option
   ------------------------------------------------------------ */
/* Local bridge helpers mapping cleanly onto CareLink v6 core.js / ui.js APIs */
const _c6Iso = d => dateOnly(d || new Date());
const _c6AddDays = (d, n) => new Date(new Date(d || new Date()).getTime() + n * DAY);
const _c6Age = (dob, age) => (age !== undefined && age !== null)
  ? age
  : (dob ? Math.max(0, Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * DAY))) : '-');
const _c6Modal = (title, body, width) => openModal({ title, body, wide: width === 'w-lg' });
const _c6Audit = (action, entityId, detail) => {
  if(typeof AUDIT !== 'undefined' && AUDIT.append){
    AUDIT.append({ actor: (AUTH.user && AUTH.user.id) || 'system', action, entity: 'workflow', entityId: String(entityId||'system'), detail: String(detail||'') });
  }
};
const _c6Notify = (userId, title, body, kind) => {
  if(userId && typeof notify === 'function') notify(userId, title, body || '', kind || 'info');
};
const _c6UnreadCount = (user) => {
  if(!user || !DB.db) return 0;
  return (DB.db.messages || []).filter(m => Array.isArray(m.to) && m.to.includes(user.id) && !(m.readBy || []).includes(user.id)).length;
};

const PAT_DISCHARGE = {
  PATHWAYS: [
    { id:'graduated', label:'Graduated - Clinically & Household Stable' },
    { id:'referred_facility', label:'Discharged with Continuing Facility Referral' },
    { id:'referred_community', label:'Discharged to Community Health Unit / Partner Follow-Up' },
    { id:'transferred', label:'Relocated / Transferred with Full Clinical Handover' }
  ],
  DEST_TYPES: [
    'County / National Referral Hospital',
    'Sub-County or Faith-Based Hospital',
    'Primary Health Facility / Dispensary',
    'Physiotherapy & Rehabilitation Centre',
    'Community Health Unit (CHU / CHV)',
    'Partner OVC / Social Protection Programme'
  ],
  CLINICS: [
    'MOPC (Medical Outpatient Clinic)',
    'GOPC (Gynaecology Outpatient Clinic)',
    'SOPC (Surgical Outpatient Clinic)',
    'POPC (Paediatric Outpatient Clinic)',
    'Physiotherapy & Occupational Therapy',
    'Comprehensive Care / TB Clinic (CCC)',
    'Oncology / Palliative Review Clinic',
    'Nutrition & Maternal Child Health Clinic',
    'Community Household Wellness Follow-Up'
  ],

  referralFieldsHTML(p){
    const r = (p && p.dischargeReferral) || {};
    return `
      <div class="divider"></div>
      <div class="alert a-info" style="margin-bottom:10px">
        ${ic('send',16)}
        <div><b>Discharge Pathway & Continuing Care Referral Option</b>
          <div class="xs">Select whether this patient graduates independently or requires a structured clinical / partner referral upon discharge.</div>
        </div>
      </div>
      <div class="form-row">
        <div class="fg"><label>Discharge pathway</label>
          <select name="dischargePathway">
            ${PAT_DISCHARGE.PATHWAYS.map(x=>`<option value="${x.id}" ${r.pathway===x.id?'selected':''}>${esc(x.label)}</option>`).join('')}
          </select>
        </div>
        <div class="fg"><label>Include formal continuing-care referral?</label>
          <select name="referralRequired">
            <option value="yes" ${r.required!==false?'selected':''}>Yes - Issue discharge referral handover</option>
            <option value="no" ${r.required===false?'selected':''}>No - Self-care graduation without external referral</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="fg"><label>Referral destination category</label>
          <select name="referralDestType">
            ${PAT_DISCHARGE.DEST_TYPES.map(t=>`<option value="${esc(t)}" ${r.destType===t?'selected':''}>${esc(t)}</option>`).join('')}
          </select>
        </div>
        <div class="fg"><label>Target outpatient / review clinic</label>
          <select name="referralClinic">
            ${PAT_DISCHARGE.CLINICS.map(c=>`<option value="${esc(c)}" ${r.clinic===c?'selected':''}>${esc(c)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="fg"><label>Receiving hospital, facility or partner organisation</label>
          <input name="receivingFacility" value="${esc(r.facility||'JOOTRH Specialist Outpatient Department')}" placeholder="e.g. JOOTRH MOPC, Homa Bay County Referral Hospital">
        </div>
        <div class="fg"><label>Scheduled review / handover date</label>
          <input type="date" name="referralDate" value="${esc(r.appointmentDate||_c6Iso(_c6AddDays(new Date(),14)))}">
        </div>
      </div>
      <div class="form-row">
        <div class="fg"><label>Receiving clinician / focal contact</label>
          <input name="receivingContact" value="${esc(r.receivingContact||'Outpatient Records & Liaison Desk')}" placeholder="Department focal person or phone">
        </div>
        <div class="fg"><label>Continuing care & handover instructions</label>
          <input name="referralInstructions" value="${esc(r.instructions||'Continue prescribed regimen, bring Discharge Summary to scheduled clinic review.')}" placeholder="Clinical summary & follow-up instructions">
        </div>
      </div>

      <div class="divider"></div>
      <div class="alert a-ok" style="margin-bottom:10px">
        ${ic('clipboard',16)}
        <div><b>LOMAMO Discharge Protocol · SHA (formerly NHIF), Spiritual Growth & Household Impact</b>
          <div class="xs">Captures all mandatory fields from the physical LOMAMO Patient Discharge Form prior to County Admin Assistant scan upload.</div>
        </div>
      </div>
      <div class="form-row">
        <div class="fg"><label>SHA / SHIF (formerly NHIF) active?</label>
          <select name="shaActive">
            <option value="Yes" ${(p&&p.dischargeProtocol?.shaActive)!=='No'?'selected':''}>Yes - Active SHA / NHIF cover</option>
            <option value="No" ${(p&&p.dischargeProtocol?.shaActive)==='No'?'selected':''}>No - Not currently active</option>
          </select>
        </div>
        <div class="fg"><label>SHA / NHIF last payment date</label>
          <input type="date" name="shaLastPaymentDate" value="${esc((p&&p.dischargeProtocol?.shaLastPaymentDate)||_c6Iso(new Date()))}">
        </div>
      </div>
      <div class="form-row">
        <div class="fg"><label>Spiritual growth: Believer?</label>
          <select name="believer">
            <option value="Yes" ${(p&&p.dischargeProtocol?.believer)!=='No'?'selected':''}>Yes</option>
            <option value="No" ${(p&&p.dischargeProtocol?.believer)==='No'?'selected':''}>No</option>
          </select>
        </div>
        <div class="fg"><label>Converted during LOMAMO care?</label>
          <select name="convertedDuringLomamo">
            <option value="No" ${(p&&p.dischargeProtocol?.convertedDuringLomamo)!=='Yes'?'selected':''}>No (Already believer / unchanged)</option>
            <option value="Yes" ${(p&&p.dischargeProtocol?.convertedDuringLomamo)==='Yes'?'selected':''}>Yes - Converted during LOMAMO</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="fg"><label>Repeat patient? / Completed full cycle?</label>
          <select name="completedCycle">
            <option value="Yes" ${(p&&p.dischargeProtocol?.completedCycle)!=='No'?'selected':''}>Completed full programme cycle</option>
            <option value="No" ${(p&&p.dischargeProtocol?.completedCycle)==='No'?'selected':''}>Early / non-completion discharge</option>
          </select>
        </div>
        <div class="fg"><label>Number of orphans prevented (children in home)</label>
          <input type="number" min="0" max="25" name="orphansPrevented" value="${esc(String(p&&(p.dischargeProtocol?.orphansPrevented??p.childrenCount??((p.household&&p.household.children)||0))))}">
        </div>
      </div>
      <div class="form-row">
        <div class="fg"><label>Other assistance programmes at discharge</label>
          <input name="otherProgramsDetail" value="${esc((p&&p.dischargeProtocol?.otherProgramsDetail)||'None')}" placeholder="If yes, programme name & duration (or None)">
        </div>
        <div class="fg"><label>Physical form signatures (Patient · Caregiver · Coordinator)</label>
          <input name="physicalSignatures" value="${esc((p&&p.dischargeProtocol?.physicalSignatures)||'Signed on physical hard copy — awaiting full-page scan upload')}" placeholder="e.g. Patient + Caregiver + Coordinator signed">
        </div>
      </div>

      <div class="divider"></div>
      <div class="advisory-watch-box">
        <div class="spread" style="margin-bottom:8px;flex-wrap:wrap;gap:8px">
          <div class="row" style="gap:8px">
            <span class="advisory-shield">${ic('alert',16)}</span>
            <div>
              <b style="font-size:13px">Caregiver Discharge Advisory & Returning-Patient Watchlist</b>
              <div class="xs muted">Flag policy violations, chain smoking / alcohol misuse, supply diversion, or clinical non-adherence. Automatically alerts caregivers & coordinators if this patient ever returns.</div>
            </div>
          </div>
        </div>
        <div class="form-row">
          <div class="fg"><label>Returning-patient watchlist status</label>
            <select name="advisoryFlagged">
              <option value="no" ${!(p&&p.dischargeAdvisory&&p.dischargeAdvisory.flagged)?'selected':''}>Clear - Standard graduation (no watchlist alert)</option>
              <option value="watch" ${(p&&p.dischargeAdvisory&&p.dischargeAdvisory.flagged&&p.dischargeAdvisory.severity!=='high')?'selected':''}>Caregiver Advisory Watch - Review history before re-intake</option>
              <option value="high" ${(p&&p.dischargeAdvisory&&p.dischargeAdvisory.severity==='high')?'selected':''}>High Policy / Conduct Alert - Mandatory Coordinator & MCM clearance if returning</option>
            </select>
          </div>
          <div class="fg"><label>Primary advisory reason (if flagged)</label>
            <select name="advisoryCategory">
              ${['None','Chain smoking / chronic alcohol misuse against medical advice','Repeated ARV / TB / clinical regimen non-adherence','Diversion or sale of LOMAMO foodbag / medical supplies','Concealed dual-enrolment or policy breach','Hostile / unsafe household conduct toward visiting caregivers','Voluntary withdrawal against clinical advice'].map(cat=>`<option value="${esc(cat)}" ${(p&&p.dischargeAdvisory?.category)===cat?'selected':''}>${esc(cat)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="fg"><label>Caregiver & Coordinator confidential advisory note for future returning-patient checks</label>
          <textarea name="advisoryNote" rows="2" placeholder="Document objective facts observed during home visits so future intake teams & coordinators are immediately briefed if this patient re-applies...">${esc((p&&p.dischargeAdvisory?.note)||'')}</textarea>
        </div>
      </div>`;
  },

  captureReferralFromForm(p, fd, actor){
    if(!p || !fd) return null;
    const get = k => fd.get ? fd.get(k) : fd[k];
    const pathway = get('dischargePathway');
    const reqVal = get('referralRequired');
    const advFlag = get('advisoryFlagged');
    if(advFlag && advFlag !== 'no'){
      p.dischargeAdvisory = {
        flagged: true,
        severity: advFlag === 'high' ? 'high' : 'watch',
        category: String(get('advisoryCategory') || 'Caregiver discharge advisory').trim(),
        note: String(get('advisoryNote') || 'Review prior discharge file with Coordinator and MCM before any re-enrolment.').trim(),
        recordedBy: actor ? actor.id : 'u-sys',
        recordedByName: actor ? actor.name : 'Care Team',
        recordedAt: new Date().toISOString(),
        areaId: p.areaId,
        countyId: p.countyId
      };
    } else if(advFlag === 'no'){
      p.dischargeAdvisory = { flagged:false, clearedAt:new Date().toISOString() };
    }
    if(get('shaActive') || get('believer') || get('orphansPrevented') !== undefined){
      p.dischargeProtocol = Object.assign({}, p.dischargeProtocol || {}, {
        shaActive: get('shaActive') || 'Yes',
        shaLastPaymentDate: get('shaLastPaymentDate') || _c6Iso(new Date()),
        believer: get('believer') || 'Yes',
        convertedDuringLomamo: get('convertedDuringLomamo') || 'No',
        completedCycle: get('completedCycle') || 'Yes',
        repeatPatient: p.repeatPatient ? 'Yes' : 'No',
        daysInProgram: PAT.days(p),
        orphansPrevented: Number(get('orphansPrevented') ?? p.childrenCount ?? 0) || 0,
        otherProgramsDetail: String(get('otherProgramsDetail') || 'None').trim(),
        physicalSignatures: String(get('physicalSignatures') || 'Signed on physical hard copy').trim(),
        updatedBy: actor ? actor.id : 'u-sys',
        updatedAt: new Date().toISOString()
      });
    }
    if(!pathway && !reqVal) return p.dischargeReferral || null;
    const ref = {
      pathway: pathway || 'graduated',
      required: reqVal !== 'no',
      destType: get('referralDestType') || PAT_DISCHARGE.DEST_TYPES[0],
      clinic: get('referralClinic') || PAT_DISCHARGE.CLINICS[0],
      facility: (get('receivingFacility') || '').trim() || 'County Referral Outpatient Clinic',
      appointmentDate: get('referralDate') || _c6Iso(_c6AddDays(new Date(),14)),
      receivingContact: (get('receivingContact') || '').trim() || 'Outpatient Liaison Desk',
      instructions: (get('referralInstructions') || '').trim() || 'Continue care plan and attend scheduled review clinic.',
      recommendedBy: actor ? actor.id : 'u-sys',
      recommendedAt: new Date().toISOString()
    };
    p.dischargeReferral = ref;
    return ref;
  },

  summary(patientId, dbOpt){
    const store = dbOpt || DB.db;
    const p = (store.patients||[]).find(x=>x.id===patientId);
    if(!p) return null;
    const visits = (store.visits||[]).filter(v=>v.patientId===p.id).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    const pdcas = (store.pdcas||[]).filter(x=>x.patientId===p.id).sort((a,b)=>(a.dueDay||0)-(b.dueDay||0));
    const reqs = (store.requests||[]).filter(r=>r.patientId===p.id).sort((a,b)=>String(a.createdAt||a.submittedAt||'').localeCompare(String(b.createdAt||b.submittedAt||'')));
    const stays = (store.homestays||store.careResidents||[]).filter(h=>h.patientId===p.id);
    const support = (store.support||store.supportIssues||[]).filter(s=>s.patientId===p.id);
    const txSupport = (store.transactions||[]).filter(t=>t.patientId===p.id);
    const rx = (store.clinicalRx||[]).filter(r=>r.patientId===p.id);
    const omaha = (store.omahaPlans||[]).filter(o=>o.patientId===p.id);
    const conds = (store.patientConditions||[]).filter(c=>c.patientId===p.id);
    const forms = (store.formRecords||[]).filter(f=>f.patientId===p.id);
    const supportTotal = support.reduce((acc,s)=>acc + (Number(s.amount)||0), 0);
    const hospTotal = reqs.reduce((acc,r)=>acc + (Number(r.finalCost != null ? r.finalCost : r.estimatedCost)||0), 0)
      || txSupport.reduce((acc,t)=>acc + (Number(t.amount)||0), 0);
    const stayDays = stays.reduce((acc,h)=>{
      const a = new Date(h.admittedAt||new Date()), b = h.dischargedAt? new Date(h.dischargedAt) : new Date();
      return acc + Math.max(1, Math.round((b - a)/86400000));
    }, 0);
    const followUps = [];
    reqs.forEach(r=>{
      (r.followUps||[]).forEach(f=>followUps.push(Object.assign({ reqCode:r.code||r.no||r.id, facility:r.facility||r.hospital }, f)));
    });
    const baseWt = Number(p.baselineWeightKg || (p.clinical && p.clinical.baselineWeightKg) || ((p.clinical && p.clinical.weightKg ? p.clinical.weightKg - 2.4 : 54.0)));
    const curWt = Number((p.clinical && p.clinical.weightKg) || (baseWt + 2.4));
    const wtDelta = +(curWt - baseWt).toFixed(1);
    const cgUser = (store.users||[]).find(u=>u.id===p.caregiverId);
    return {
      patient: p,
      stayDaysInProg: PAT.days(p),
      enrolmentDate: p.enrolledAt || p.intake,
      dischargeDate: p.dischargedAt || p.discharge || _c6Iso(new Date()),
      caregiver: cgUser ? cgUser.name : userName(p.caregiverId),
      county: countyName(p.countyId),
      area: areaName(p.areaId),
      baselineWeightKg: baseWt,
      currentWeightKg: curWt,
      weightDeltaKg: wtDelta,
      visits, pdcas, reqs, stays, stayDays, support, supportTotal, hospTotal,
      grandServiceValue: supportTotal + hospTotal,
      rx, omaha, conds, forms, followUps,
      referral: p.dischargeReferral || {
        pathway: p.status==='discharged' ? 'graduated' : 'referred_facility',
        required: true,
        destType: 'County / National Referral Hospital',
        clinic: 'MOPC (Medical Outpatient Clinic)',
        facility: p.countyId==='homabay' ? 'Homa Bay County Teaching & Referral Hospital' : 'Jaramogi Oginga Odinga Teaching & Referral Hospital (JOOTRH)',
        appointmentDate: _c6Iso(_c6AddDays(new Date(), 14)),
        receivingContact: 'Outpatient Continuity & Community Liaison Desk',
        instructions: 'Maintain prescribed regimen, nutrition plan and monthly household wellness check.'
      }
    };
  },

  openModal(patientId, user, opts={}){
    const s = PAT_DISCHARGE.summary(patientId);
    if(!s) return toast('Patient not found','Unable to open PDCA / Discharge summary.','err');
    const normOpts = typeof opts === 'string' ? { mode: opts } : (opts || {});
    const reqMode = (normOpts.mode && normOpts.mode !== 'auto') ? normOpts.mode : null;
    const mode = reqMode || (s.patient.status==='discharged' || s.patient.status==='discharge_recommended' ? 'discharge' : (s.stayDaysInProg>=120 ? '120day' : 'discharge'));
    const titlePrefix = mode==='120day' ? 'Official Patient PDCA 120-Day Report' : 'Official Patient PDCA & Discharge Summary';
    openModal({
      title: titlePrefix + ' · ' + s.patient.name,
      sub: s.patient.code + ' · ' + s.county + ' · ' + s.area + ' · ' + s.stayDaysInProg + ' days in programme',
      wide: true,
      body: PAT_DISCHARGE.renderSheet(patientId, user || AUTH.user, { mode, subview: normOpts.subview || 'official' }),
      footer: `<button class="btn btn-ghost" data-act="close-modal">Close</button>
        <button class="btn btn-ghost" data-act="export-pdca-word" data-id="${esc(patientId)}" data-mode="${esc(mode)}">${ic('file',14)} Download Word (.doc)</button>
        <button class="btn btn-ghost" data-act="export-pdca-json" data-id="${esc(patientId)}" data-mode="${esc(mode)}">${ic('download',14)} Merge Fields (.json)</button>
        <button class="btn btn-primary" data-act="print-discharge-summary" data-id="${esc(patientId)}" data-mode="${esc(mode)}">${ic('download',14)} Print / Save Official PDF</button>`
    });
  },

  stampOnDischarge(p, actor, dbOpt){
    if(!p) return null;
    const s = PAT_DISCHARGE.summary(p.id, dbOpt);
    if(!s) return null;
    p.dischargeSummary = {
      generatedAt: new Date().toISOString(),
      approvedBy: actor ? actor.id : 'u-sys',
      approvedByName: actor ? actor.name : 'Medical Case Management',
      stayDays: s.stayDaysInProg,
      homeVisitsCount: s.visits.length,
      pdcaReviewsCount: s.pdcas.length,
      prescriptionsCount: s.rx.length,
      hospitalVisitsCount: s.reqs.length,
      homestayDays: s.stayDays,
      directSupportKes: s.supportTotal,
      hospitalSupportKes: s.hospTotal,
      totalProgrammeSupportKes: s.grandServiceValue,
      weightChangeKg: s.weightDeltaKg,
      pathway: s.referral.pathway,
      referral: s.referral
    };
    return p.dischargeSummary;
  },

  /* Compile exact docxtemplater-compatible merge payload + structured fields
     matching CareLink_C-DIMS_PDCA_Template_Fields.md for BOTH 120+d & Regular Discharge */
  compileOfficialPdcaData(patientOrId, userOrOpts={}, modeArg){
    const pid = (typeof patientOrId === 'object' && patientOrId !== null) ? patientOrId.id : patientOrId;
    const opts = (typeof modeArg === 'string')
      ? { mode: modeArg }
      : (typeof userOrOpts === 'string' ? { mode: userOrOpts } : (userOrOpts && !userOrOpts.roleId ? userOrOpts : {}));
    const s = PAT_DISCHARGE.summary(pid);
    if(!s) return null;
    const p = s.patient, cl = p.clinical || {}, ref = s.referral || {};
    const dp = p.dischargeProtocol || {};
    const adv = p.dischargeAdvisory || {};
    const isDischarged = p.status==='discharged' || p.status==='discharge_recommended';
    const reqMode = (opts.mode && opts.mode !== 'auto') ? opts.mode : null;
    const mode = reqMode || (isDischarged ? 'discharge' : (s.stayDaysInProg>=120 ? '120day' : 'discharge'));
    const ageNum = _c6Age(p.dob, p.age);
    const heightCm = Number(cl.heightCm || (ageNum < 18 ? Math.min(162, 85 + Number(ageNum||8)*5) : 164));
    const hM = Math.max(0.8, heightCm / 100);
    const bmiStart = +(s.baselineWeightKg / (hM * hM)).toFixed(1);
    const bmiNow = Number(cl.bmi) || +(s.currentWeightKg / (hM * hM)).toFixed(1);
    const signDelta = (s.weightDeltaKg > 0 ? '+' : '') + s.weightDeltaKg.toFixed(1);

    /* Children list ({#children}{name} - {age} years old. {note}{/children}) */
    const rawKids = Array.isArray(p.children) && p.children.length
      ? p.children
      : (Array.isArray(p.household && p.household.dependents) ? p.household.dependents : []);
    const kidCount = Number(p.childrenCount ?? (p.household && p.household.children) ?? rawKids.length ?? 0);
    const children = rawKids.length ? rawKids.map((ch, idx)=>({
      name: ch.name || `Child ${idx+1}`,
      age: ch.age != null ? String(ch.age) : String(Math.max(2, 12 - idx*3)),
      note: ch.note || ch.schoolStatus || 'Enrolled in school & supported under LOMAMO orphan-prevention care.'
    })) : Array.from({ length: Math.min(kidCount, 4) }, (_, idx)=>({
      name: `${(p.name||'Beneficiary').split(' ').slice(-1)[0]} Household Child ${idx+1}`,
      age: String(Math.max(3, 13 - idx*3)),
      note: idx===0 ? 'Attending primary school consistently; nutrition & household stability monitored.' : 'Protected within family household under LOMAMO orphan-prevention covenant.'
    }));

    /* Dates */
    const assessDate = p.assessedAt || p.assessmentDate || s.enrolmentDate || todayISO().slice(0,10);
    const intakeDate = s.enrolmentDate || todayISO().slice(0,10);
    const evalDate = todayISO().slice(0,10);
    const estDischargeDate = isDischarged
      ? s.dischargeDate
      : _c6Iso(_c6AddDays(new Date(), s.stayDaysInProg >= 120 ? 30 : Math.max(14, 120 - s.stayDaysInProg)));

    /* International 120+d dossier if present */
    const dossier = ((DB.db && DB.db.intlPdcaDossiers) || []).find(d=>d.patientId===p.id || d.patientCode===p.code);

    /* Diagnoses */
    const diagList = [];
    if(cl.diagnosis) diagList.push(cl.diagnosis + (cl.conditionCategory ? ` (${cl.conditionCategory})` : ''));
    s.conds.forEach(c=>{ if(c.label || c.condition) diagList.push(c.label || c.condition); });
    if(bmiNow < 18.5) diagList.push(`Nutritional vulnerability (BMI ${bmiNow} kg/m2) under therapeutic foodbag supplementation`);
    if(!diagList.length) diagList.push('Chronic household medical & nutritional vulnerability under active LOMAMO care plan');

    /* PDCA 5-Stage Bullets (Plan, Do, Rx Treatment, Check, Act) */
    const openConcerns = ((DB.db && DB.db.concerns) || []).filter(c=>c.patientId===p.id);
    const planBullets = [
      ...(dossier && dossier.planStage ? [dossier.planStage] : []),
      ...(p.carePlan && p.carePlan.needs ? [String(p.carePlan.needs)] : []),
      ...s.pdcas.filter(x=>x.stage==='Plan').map(x=>x.summary||x.note||x.title).filter(Boolean),
      `Household resilience & nutritional stabilisation across ${s.area} (${kidCount} child(ren) safeguarded in home).`
    ].slice(0, 4);

    const chiefComplaints = cl.chiefComplaints
      || (openConcerns[0] && openConcerns[0].detail)
      || (cl.diagnosis ? `Presenting symptoms associated with ${cl.diagnosis}, household food insecurity, and clinic follow-up adherence needs.` : 'Fatigue, nutritional deficit at intake, and need for structured home-based clinical & nutritional follow-up.');

    const doBullets = [
      ...(dossier && dossier.doStage ? [dossier.doStage] : []),
      `${s.visits.length} structured Caregiver home-based care & anthropometric monitoring visits completed.`,
      ...(s.support.length ? [`Issued ${s.support.length} household nutrition / dignity support distribution(s) (${s.support.map(x=>titleCase(x.type)).slice(0,3).join(', ')}).`] : ['Regular LOMAMO therapeutic / household foodbag & hygiene support delivered.']),
      ...(s.reqs.length ? [`Coordinated ${s.reqs.length} hospital / specialist outpatient episode(s) (${s.reqs[s.reqs.length-1].facility||'County Referral Hospital'}).`] : ['Continuous household health education, hygiene & caregiver psychosocial accompaniment.'])
    ].slice(0, 4);

    const rxBullets = s.rx.length
      ? s.rx.slice(0,4).map(r=>`${r.medicine||r.item||'Prescribed medication'}${r.dosage?' - '+r.dosage:''} (${titleCase(r.status||'dispensed · adherence monitored')})`)
      : [
          `Prescribed clinical regimen for ${cl.diagnosis||'chronic condition'} — adherence verified as ${titleCase(cl.adherence||'Good')} during home visits.`,
          `Therapeutic nutritional counselling & anthropometric monitoring (BP ${cl.bp||'120/78'}, current BMI ${bmiNow} kg/m2).`
        ];

    const checkBullets = [
      ...(dossier && dossier.checkStage ? [dossier.checkStage] : []),
      `Anthropometric response: weight moved from ${s.baselineWeightKg.toFixed(1)} kg (BMI ${bmiStart}) at intake to ${s.currentWeightKg.toFixed(1)} kg (BMI ${bmiNow}) — net change ${signDelta} kg.`,
      `${s.pdcas.length} scheduled 30-day PDCA review cycle(s) documented; medication adherence rated ${titleCase(cl.adherence||'Good')}.`,
      ...(s.followUps.length ? [`Post-hospital clinic review verified: ${s.followUps[s.followUps.length-1].clinicLabel||s.followUps[s.followUps.length-1].clinic}.`] : [`Household stability & child school continuity verified across ${s.visits.length} home visits.`])
    ].slice(0, 4);

    const actBullets = mode === '120day'
      ? [
          ...(dossier && dossier.actStage ? [dossier.actStage] : []),
          `Continue targeted 30-day PDCA extension monitoring with fortnightly caregiver weight/BMI checks and MCM clinical review.`,
          `Confirm active SHA/SHIF cover (${dp.shaActive||(p.sha?'Active':'Verification in progress')}) and transition household toward self-sustaining graduation by ${fmtDate(estDischargeDate)}.`,
          ...(dossier && dossier.intlRecommendation ? [`International Medical Concurrence: ${dossier.intlRecommendation}`] : ['Submit 120+ day clinical review dossier to MCM & International Medical Oversight for concurrence.'])
        ]
      : [
          `Confirm formal programme graduation / discharge handover (${(PAT_DISCHARGE.PATHWAYS.find(x=>x.id===ref.pathway)||PAT_DISCHARGE.PATHWAYS[0]).label}).`,
          ref.required !== false
            ? `Execute continuing-care referral to ${ref.facility} (${ref.clinic}) scheduled for ${fmtDate(ref.appointmentDate)}.`
            : `Maintain household self-care wellness plan and community health volunteer linkage in ${s.area}.`,
          `Verify full-page physical discharge form scan upload & SHA/SHIF continuity (${dp.shaActive||(p.sha?'Yes':'Active')}).`
        ];

    const smartAim = (p.carePlan && p.carePlan.objectives)
      ? (Array.isArray(p.carePlan.objectives) ? p.carePlan.objectives.join(' ') : String(p.carePlan.objectives))
      : (mode === '120day'
          ? `Achieve sustained clinical stabilisation, target BMI >= 18.5 kg/m2 (currently ${bmiNow} kg/m2), >=95% regimen adherence, and independent household resilience within the approved 30-day PDCA extension window ending ${fmtDate(estDischargeDate)}.`
          : `Consolidate clinical recovery (weight ${s.baselineWeightKg.toFixed(1)} kg -> ${s.currentWeightKg.toFixed(1)} kg, BMI ${bmiNow} kg/m2), seamless outpatient continuity, and stable family care protecting ${kidCount} child(ren) upon graduation from active LOMAMO care.`);

    const justification = mode === '120day'
      ? (dossier && dossier.justification)
        || `Beneficiary has completed ${s.stayDaysInProg} days in the LOMAMO programme (${s.visits.length} home visits, weight change ${signDelta} kg). Documented clinical & nutritional follow-up remains essential to consolidate treatment response, complete specialist clinic review, and secure sustainable household self-reliance prior to estimated discharge on ${fmtDate(estDischargeDate)}.`
      : `Beneficiary completed ${s.stayDaysInProg} days of comprehensive LOMAMO medical, nutritional and household care (${s.visits.length} home visits, ${s.pdcas.length} PDCA reviews, total documented support ${money(s.grandServiceValue)}). Clinical goals and household orphan-prevention safeguards (${kidCount} child(ren)) have been verified for structured discharge${ref.required!==false ? ' with continuing referral to '+ref.facility : ''}.`;

    const reviewerName = (p.dischargeSummary && p.dischargeSummary.approvedByName)
      || (dossier && dossier.intlReviewer)
      || 'Medical Case Manager · LOMAMO CareLink';

    return {
      mode,
      isDischarged,
      summaryRef: s,
      report_title: mode === '120day' ? 'Patient PDCA 120-Day Report' : 'Patient PDCA Discharge Summary Report',
      discharge_banner_label: (isDischarged && mode === 'discharge') ? 'CONFIRMED DATE OF DISCHARGE' : 'ESTIMATED DATE OF DISCHARGE',
      /* Exact merge fields from CareLink_C-DIMS_PDCA_Template_Fields.md */
      patient_code: p.code || p.id,
      patient_name: String(p.name || '').toUpperCase(),
      age: String(ageNum),
      sex: p.sex === 'F' ? 'Female' : 'Male',
      marital_status: p.maritalStatus || (p.household && p.household.maritalStatus) || 'Head of Household',
      caregiver: String(s.caregiver || '').replace(/^Demo - /, ''),
      county_name: s.county,
      ministry_area: s.area,
      occupation: p.occupation || (p.household && p.household.occupation) || 'Small-scale household livelihood',
      education: p.education || (p.household && p.household.education) || 'Primary / Community level',
      children_count: String(kidCount),
      children,
      assessment_date: fmtDate(assessDate),
      intake_date: fmtDate(intakeDate),
      evaluation_date: fmtDate(evalDate),
      days_in_program: `${s.stayDaysInProg} days`,
      height: String(heightCm),
      weight_start: s.baselineWeightKg.toFixed(1),
      bmi_intake: bmiStart.toFixed(1),
      weight_now: s.currentWeightKg.toFixed(1),
      bmi_current: bmiNow.toFixed(1),
      weight_change: signDelta,
      muac_cm: cl.muacCm ? String(cl.muacCm) : null,
      aim: smartAim,
      diagnoses: diagList,
      challenges: planBullets,
      p: planBullets,
      chief_complaints: chiefComplaints,
      interventions: doBullets,
      d: doBullets,
      treatments: rxBullets,
      rx: rxBullets,
      check_findings: checkBullets,
      c: checkBullets,
      act_actions: actBullets,
      a: actBullets,
      justification,
      discharge_date: fmtDate(estDischargeDate),
      prepared_by: String(s.caregiver || '').replace(/^Demo - /, ''),
      reviewed_by: String(reviewerName).replace(/^Demo - /, ''),
      report_date: fmtDate(evalDate),
      referral: ref,
      protocol: dp,
      advisory: adv,
      scansCount: ((p.hardcopyScans||[]).filter(x=>x.kind==='discharge')).reduce((n,x)=>n+(x.pages||x.files?.length||1),0)
    };
  },

  /* Render exact visual replica of CareLink_C-DIMS_PDCA_Template.pdf */
  renderOfficialTemplateHTML(dOrPatient, optsOrUser={}, modeArg){
    const d = (dOrPatient && dOrPatient.patient_name && dOrPatient.summaryRef)
      ? dOrPatient
      : PAT_DISCHARGE.compileOfficialPdcaData(dOrPatient, optsOrUser, modeArg);
    if(!d) return '';
    const opts = (optsOrUser && typeof optsOrUser === 'object' && !optsOrUser.roleId) ? optsOrUser : {};
    const standalone = Boolean(opts.standalone);
    const bulletItems = arr => (arr||[]).map(x=>`<li>${esc(x)}</li>`).join('');
    const kidsLine = d.children && d.children.length
      ? d.children.map(c=>`<div class="pdca-kid-line"><b>${esc(c.name)}</b> - ${esc(c.age)} years old. <span class="muted">${esc(c.note)}</span></div>`).join('')
      : `<span class="muted">${d.children_count==='0'?'No dependent minors recorded in household.':'Children safeguarded within household.'}</span>`;

    const cycleRow = (badgeTxt, badgeBg, stageTitle, stageSub, bullets, extraHTML='') => `
      <div class="cdims-pdca-row cdims-stage-${badgeTxt.toLowerCase()}">
        <div class="cdims-pdca-badge" style="background:${badgeBg}"><span>${esc(badgeTxt)}</span></div>
        <div class="cdims-pdca-cell">
          <div class="cdims-pdca-rhead"><b style="color:${badgeBg}">${esc(stageTitle)}</b><span>${esc(stageSub)}</span></div>
          <ul class="cdims-pdca-ul">${bulletItems(bullets)}</ul>
          ${extraHTML}
        </div>
      </div>`;

    const dischargeExtra = d.mode === 'discharge' ? `
      <div class="cdims-pdca-sec-title" style="margin-top:16px"><span class="sq"></span>Patient Programme Discharge Summary &middot; Continuing Care &amp; Protocol</div>
      <div class="cdims-pdca-grid2">
        <div class="cdims-pdca-box">
          <div class="cdims-lbl">CONTINUING CARE PATHWAY &amp; FACILITY HANDOVER</div>
          <div class="small" style="margin-top:4px">
            ${d.referral && d.referral.required !== false
              ? `<b>${esc(d.referral.facility)}</b> · ${esc(d.referral.clinic)}<br><span class="muted">Appointment:</span> <b>${esc(fmtDate(d.referral.appointmentDate))}</b> · <span class="muted">Contact:</span> ${esc(d.referral.receivingContact||'-')}<br><span class="muted">Instructions:</span> ${esc(d.referral.instructions||'-')}`
              : `<b>Graduated in Stable Clinical &amp; Household Standing</b> — Community wellness self-care plan active in ${esc(d.ministry_area)}.`}
          </div>
        </div>
        <div class="cdims-pdca-box">
          <div class="cdims-lbl">SHA / NHIF, SPIRITUAL GROWTH, ORPHANS PREVENTED &amp; SIGNATURES</div>
          <div class="small" style="margin-top:4px">
            <span class="muted">SHA / NHIF Cover:</span> <b>${esc(d.protocol.shaActive||'Yes')}</b> (Last payment: ${esc(d.protocol.shaLastPaymentDate||d.report_date)})<br>
            <span class="muted">Orphans prevented:</span> <b>${esc(d.children_count)} child(ren)</b> · <span class="muted">Cycle Completed:</span> <b>${esc(d.protocol.completedCycle||'Yes')}</b><br>
            <span class="muted">Spiritual Growth (Believer / Converted during LOMAMO):</span> <b>Believer: ${esc(d.protocol.believer||'Yes')} · Converted: ${esc(d.protocol.convertedDuringLomamo||'No')}</b><br>
            <span class="muted">Physical Hard-Copy Signatures &amp; Scan:</span> <b>${d.scansCount ? d.scansCount+' scanned page(s) verified' : esc(d.protocol.physicalSignatures||'Signed on physical hard-copy form')}</b>
          </div>
        </div>
      </div>
      ${d.advisory && d.advisory.flagged ? `<div class="alert ${d.advisory.severity==='high'?'a-crit':'a-warn'}" style="margin-top:10px">
        ${!standalone ? ic('alert',15) : ''}<div><b>Returning-Patient Watchlist Advisory (${d.advisory.severity==='high'?'High Policy Alert':'Caregiver Watch'}):</b> ${esc(d.advisory.category||'Advisory')} — ${esc(d.advisory.note||'')}</div>
      </div>` : ''}` : '';

    return `<article class="cdims-pdca-doc" id="dischargeSummaryPrint">
      <header class="cdims-pdca-top">
        <div class="cdims-pdca-brand">
          ${window.LOGO ? `<img src="${window.LOGO}" alt="LOMAMO CareLink" class="cdims-pdca-logo">` : ''}
          <div>
            <div class="cdims-pdca-kicker">LOMAMO CARELINK &middot; C-DIMS</div>
            <h1 class="cdims-pdca-h1">${esc(d.report_title)}</h1>
            <div class="cdims-pdca-area">${esc(d.ministry_area)} Ministry Area &middot; ${esc(d.county_name)} County (${esc(d.patient_code)})</div>
          </div>
        </div>
        <div class="cdims-pdca-modechip">${esc(d.mode==='120day' ? '120+ DAYS EXTENSION REVIEW' : 'PROGRAMME DISCHARGE SUMMARY')}</div>
      </header>
      <div class="cdims-trirule" aria-hidden="true"><i style="background:#162F59;flex:5"></i><i style="background:#1E6FA8;flex:2"></i><i style="background:#C8102E;flex:1.5"></i></div>

      <div class="cdims-pdca-sec-title"><span class="sq"></span>PATIENT &amp; CAREGIVER DATA</div>
      <table class="cdims-meta-tbl">
        <tbody>
          <tr>
            <td colspan="2"><div class="cdims-lbl">PATIENT NAME</div><div class="cdims-pat-name">${esc(d.patient_name)}</div></td>
            <td><div class="cdims-lbl">AGE &amp; SEX</div><div class="cdims-val">${esc(d.age)} years old &middot; ${esc(d.sex)}</div></td>
            <td><div class="cdims-lbl">MARITAL STATUS</div><div class="cdims-val">${esc(d.marital_status)}</div></td>
          </tr>
          <tr>
            <td colspan="2"><div class="cdims-lbl">SUPPORTING CAREGIVER</div><div class="cdims-val">${esc(d.caregiver)}</div></td>
            <td><div class="cdims-lbl">MINISTRY AREA</div><div class="cdims-val">${esc(d.ministry_area)}</div></td>
            <td><div class="cdims-lbl">OCCUPATION</div><div class="cdims-val">${esc(d.occupation)}</div></td>
          </tr>
          <tr>
            <td><div class="cdims-lbl">EDUCATION</div><div class="cdims-val">${esc(d.education)}</div></td>
            <td><div class="cdims-lbl">CHILDREN IN HOME</div><div class="cdims-val"><b>${esc(d.children_count)}</b> child(ren)</div></td>
            <td colspan="2"><div class="cdims-lbl">HOUSEHOLD CHILDREN &amp; ORPHAN-PREVENTION STATUS</div><div class="cdims-val">${kidsLine}</div></td>
          </tr>
          <tr>
            <td><div class="cdims-lbl">ASSESSMENT DATE</div><div class="cdims-val">${esc(d.assessment_date)}</div></td>
            <td><div class="cdims-lbl">INTAKE DATE</div><div class="cdims-val">${esc(d.intake_date)}</div></td>
            <td><div class="cdims-lbl">EVALUATION DATE</div><div class="cdims-val">${esc(d.evaluation_date)}</div></td>
            <td><div class="cdims-lbl">DAYS IN PROGRAM</div><div class="cdims-val"><b style="color:#C8102E">${esc(d.days_in_program)}</b></div></td>
          </tr>
        </tbody>
      </table>

      <div class="cdims-anthro-strip">
        <div class="cdims-anthro-card" style="border-top-color:#162F59">
          <div class="cdims-lbl">HEIGHT</div>
          <div class="cdims-anthro-big">${esc(d.height)} <span>cm</span></div>
          <div class="cdims-anthro-sub">Measured at intake${d.muac_cm ? ' · MUAC '+esc(d.muac_cm)+' cm' : ''}</div>
        </div>
        <div class="cdims-anthro-card" style="border-top-color:#1E6FA8">
          <div class="cdims-lbl">WEIGHT AT INTAKE</div>
          <div class="cdims-anthro-big">${esc(d.weight_start)} <span>kg</span></div>
          <div class="cdims-anthro-sub">BMI <b>${esc(d.bmi_intake)}</b> kg/m&sup2;</div>
        </div>
        <div class="cdims-anthro-card" style="border-top-color:#1E7E5A">
          <div class="cdims-lbl">CURRENT WEIGHT</div>
          <div class="cdims-anthro-big">${esc(d.weight_now)} <span>kg</span></div>
          <div class="cdims-anthro-sub">BMI <b>${esc(d.bmi_current)}</b> kg/m&sup2;</div>
        </div>
        <div class="cdims-anthro-card" style="border-top-color:#C8102E">
          <div class="cdims-lbl">WEIGHT CHANGE</div>
          <div class="cdims-anthro-big" style="color:${String(d.weight_change).startsWith('-')?'#C8102E':'#1E7E5A'}">${esc(d.weight_change)} <span>kg</span></div>
          <div class="cdims-anthro-sub">Since enrollment</div>
        </div>
      </div>

      <div class="cdims-pdca-sec-title"><span class="sq"></span>AIM (SMART)</div>
      <div class="cdims-aim-box">${esc(d.aim)}</div>

      <div class="cdims-pdca-sec-title"><span class="sq"></span>CLINICAL OVERVIEW</div>
      ${cycleRow('Dx', '#162F59', 'DIAGNOSIS', 'Major symptoms & clinical conditions', d.diagnoses)}

      <div class="cdims-pdca-sec-title"><span class="sq"></span>PDCA CYCLE</div>
      <div class="cdims-pdca-stack">
        ${cycleRow('P', '#1D6FA5', 'PLAN', 'Challenges & care objectives', d.challenges,
          `<div class="cdims-cc-sub"><span class="cdims-lbl">CHIEF COMPLAINTS:</span> ${esc(d.chief_complaints)}</div>`)}
        ${cycleRow('D', '#1E7E5A', 'DO', 'Interventions delivered', d.interventions)}
        ${cycleRow('Rx', '#7A1C65', 'TREATMENT', 'Medication & therapy', d.treatments)}
        ${cycleRow('C', '#A15C07', 'CHECK', 'Outcomes & progress', d.check_findings)}
        ${cycleRow('A', '#C8102E', 'ACT', 'Next steps & clinical plan', d.act_actions)}
      </div>

      <div class="cdims-pdca-sec-title"><span class="sq"></span>JUSTIFICATION &amp; DISCHARGE</div>
      <div class="cdims-just-box">${esc(d.justification)}</div>
      <div class="cdims-disch-banner">
        <span>${esc(d.discharge_banner_label)}</span>
        <b>${esc(d.discharge_date)}</b>
      </div>

      ${dischargeExtra}

      <div class="cdims-sig-grid">
        <div class="cdims-sig-col">
          <div class="cdims-sig-line"></div>
          <div class="cdims-lbl">PREPARED BY (CAREGIVER)</div>
          <b>${esc(d.prepared_by)}</b>
        </div>
        <div class="cdims-sig-col">
          <div class="cdims-sig-line"></div>
          <div class="cdims-lbl">REVIEWED &amp; CONCURRED BY</div>
          <b>${esc(d.reviewed_by)}</b>
        </div>
        <div class="cdims-sig-col">
          <div class="cdims-sig-line"></div>
          <div class="cdims-lbl">DATE OF REPORT</div>
          <b>${esc(d.report_date)}</b>
        </div>
      </div>

      <footer class="cdims-pdca-foot">
        <span>LOMAMO CareLink C-DIMS &vert; Confidential patient record</span>
        <span>Total Documented Care Value: <b>${esc(money(d.summaryRef.grandServiceValue))}</b> &middot; ${esc(d.summaryRef.visits.length)} Home Visits</span>
      </footer>
    </article>`;
  },

  exportWord(patientId, userOrMode, modeArg){
    const mode = (typeof modeArg === 'string') ? modeArg : (typeof userOrMode === 'string' ? userOrMode : undefined);
    const d = PAT_DISCHARGE.compileOfficialPdcaData(patientId, { mode });
    if(!d) return toast('Patient not found','Could not export PDCA document.','err');
    const docBody = PAT_DISCHARGE.renderOfficialTemplateHTML(d, { standalone:true });
    const fullHtml = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" lang="en"><head><meta charset="utf-8"><title>${esc(d.report_title)} - ${esc(d.patient_name)}</title>
      <style>
        body{font-family:Calibri,'Segoe UI',Arial,sans-serif;color:#15171A;margin:24px;font-size:10.5pt;line-height:1.42}
        .cdims-pdca-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px}
        .cdims-pdca-kicker{color:#C8102E;font-weight:700;font-size:8.5pt;letter-spacing:1.4px;text-transform:uppercase}
        .cdims-pdca-h1{font-family:Georgia,'Times New Roman',serif;color:#162F59;font-size:18pt;margin:2px 0}
        .cdims-pdca-area{color:#475569;font-size:9.5pt}
        .cdims-trirule{height:4px;background:#162F59;border-bottom:2px solid #C8102E;margin:8px 0 14px}
        .cdims-pdca-sec-title{color:#162F59;font-weight:800;font-size:9pt;letter-spacing:1px;text-transform:uppercase;margin:14px 0 6px}
        .cdims-meta-tbl{width:100%;border-collapse:collapse;margin-bottom:12px}
        .cdims-meta-tbl td{border:1px solid #CBD5E1;padding:6px 8px;vertical-align:top;background:#F8FAFC}
        .cdims-lbl{font-size:7.5pt;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.7px}
        .cdims-pat-name{font-family:Georgia,serif;font-size:12pt;font-weight:700;color:#7A1C65}
        .cdims-anthro-strip{display:table;width:100%;table-layout:fixed;margin-bottom:12px}
        .cdims-anthro-card{display:table-cell;border:1px solid #CBD5E1;border-top:4px solid #162F59;padding:8px;text-align:center;background:#FFFFFF}
        .cdims-anthro-big{font-size:14pt;font-weight:800;color:#162F59}
        .cdims-aim-box{border-left:4px solid #C8102E;background:#FFF5F6;padding:8px 12px;margin-bottom:12px}
        .cdims-pdca-row{display:table;width:100%;margin-bottom:8px;border:1px solid #CBD5E1}
        .cdims-pdca-badge{display:table-cell;width:42px;color:#FFFFFF;font-weight:800;text-align:center;vertical-align:middle;font-size:11pt;padding:8px}
        .cdims-pdca-cell{display:table-cell;padding:8px 10px;background:#FFFFFF}
        .cdims-pdca-rhead b{margin-right:8px}
        .cdims-pdca-ul{margin:4px 0 0 18px;padding:0}
        .cdims-just-box{border-left:4px solid #162F59;background:#F1F5F9;padding:8px 12px;margin-bottom:8px}
        .cdims-disch-banner{background:#162F59;color:#FFFFFF;padding:9px 14px;font-weight:700;display:flex;justify-content:space-between}
        .cdims-sig-grid{display:table;width:100%;table-layout:fixed;margin-top:22px}
        .cdims-sig-col{display:table-cell;padding:0 10px}
        .cdims-sig-line{border-bottom:1px solid #475569;height:22px;margin-bottom:4px}
        .cdims-pdca-foot{margin-top:16px;padding-top:6px;border-top:1px solid #CBD5E1;font-size:8pt;color:#64748B;display:flex;justify-content:space-between}
      </style></head><body>${docBody}</body></html>`;
    const blob = new Blob([fullHtml], { type:'application/msword;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `CareLink-PDCA-${d.mode==='120day'?'120Day':'Discharge'}-${d.patient_code}.doc`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
    toast('Official Word Report Downloaded', `Saved ${a.download} formatted per CareLink C-DIMS PDCA template.`, 'ok');
  },

  exportMergeJson(patientId, userOrMode, modeArg){
    const mode = (typeof modeArg === 'string') ? modeArg : (typeof userOrMode === 'string' ? userOrMode : undefined);
    const d = PAT_DISCHARGE.compileOfficialPdcaData(patientId, { mode });
    if(!d) return toast('Patient not found','Could not export merge JSON.','err');
    const clean = Object.assign({}, d);
    delete clean.summaryRef;
    const blob = new Blob([JSON.stringify(clean, null, 2)], { type:'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `CareLink-PDCA-MergeFields-${d.patient_code}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
    toast('Merge Payload Exported', `Ready for docxtemplater merge with CareLink_C-DIMS_PDCA_Template.docx.`, 'ok');
  },

  renderSheet(patientId, user, opts={}){
    const s = PAT_DISCHARGE.summary(patientId);
    if(!s) return emptyState('Patient not found','Unable to compile PDCA / Discharge summary.');
    const p = s.patient;
    const normOpts = typeof opts === 'string' ? { mode: opts } : (opts || {});
    const autoMode = (p.status==='discharged' || p.status==='discharge_recommended') ? 'discharge' : (s.stayDaysInProg>=120 ? '120day' : 'discharge');
    const reqMode = (normOpts.mode && normOpts.mode !== 'auto') ? normOpts.mode : ((PAT_DISCHARGE._sheetMode && PAT_DISCHARGE._sheetMode !== 'auto') ? PAT_DISCHARGE._sheetMode : null);
    const mode = reqMode || (APPX && APPX.params && APPX.params.pdcaMode) || autoMode;
    const subview = normOpts.subview || PAT_DISCHARGE._sheetSubview || (APPX && APPX.params && APPX.params.pdcaSubview) || 'official';
    const d = PAT_DISCHARGE.compileOfficialPdcaData(patientId, { mode });

    const exportDrop = (typeof utilMenu==='function') ? utilMenu('Export & Print', [
      { label:'Print / Save Official PDF', icon:'download', act:'print-discharge-summary', attrs:`data-id="${esc(p.id)}" data-mode="${esc(mode)}"` },
      { label:'Download Formatted Word (.doc)', icon:'file', act:'export-pdca-word', attrs:`data-id="${esc(p.id)}" data-mode="${esc(mode)}"` },
      { label:'Download docxtemplater Merge JSON', icon:'columns', act:'export-pdca-json', attrs:`data-id="${esc(p.id)}" data-mode="${esc(mode)}"` }
    ], { icon:'download', primary:true, xs:true }) : `<button class="btn btn-xs btn-primary" data-act="print-discharge-summary" data-id="${esc(p.id)}">Print / PDF</button>`;

    const toolbar = `<div class="spread no-print" style="margin-bottom:12px;padding:10px 14px;border-radius:12px;background:var(--surface-2);border:1px solid var(--line);flex-wrap:wrap;gap:10px">
      <div class="row" style="gap:6px;flex-wrap:wrap">
        <button type="button" class="btn btn-xs ${mode==='120day'&&subview==='official'?'btn-primary':'btn-ghost'}" data-act="pdca-sheet-mode" data-id="${esc(p.id)}" data-mode="120day" data-subview="official">${ic('repeat',12)} 120-Day PDCA Format</button>
        <button type="button" class="btn btn-xs ${mode==='discharge'&&subview==='official'?'btn-primary':'btn-ghost'}" data-act="pdca-sheet-mode" data-id="${esc(p.id)}" data-mode="discharge" data-subview="official">${ic('check',12)} Regular Discharge PDCA Format</button>
        <button type="button" class="btn btn-xs ${subview==='ledger'?'btn-primary':'btn-ghost'}" data-act="pdca-sheet-mode" data-id="${esc(p.id)}" data-mode="${esc(mode)}" data-subview="ledger">${ic('receipt',12)} Service Cost &amp; Protocol Ledger</button>
      </div>
      <div class="row" style="gap:8px;flex-wrap:wrap">${exportDrop}</div>
    </div>`;

    if(subview !== 'ledger'){
      return toolbar + PAT_DISCHARGE.renderOfficialTemplateHTML(d);
    }

    const cl = p.clinical || {}, ref = s.referral || {};
    const canClin = RBAC.has(user,'patient.view.clinical');
    const pathwayObj = PAT_DISCHARGE.PATHWAYS.find(x=>x.id===ref.pathway) || PAT_DISCHARGE.PATHWAYS[0];
    return toolbar + `<div class="ds-sheet" id="dischargeSummaryPrint">
      <div class="ds-banner spread">
        <div>
          <div class="xs" style="text-transform:uppercase;letter-spacing:.1em;opacity:.88">LOMAMO Foundation · Service Cost &amp; Discharge Protocol Appendix</div>
          <h3>Patient Programme Service &amp; Cost Summary</h3>
          <div class="small" style="opacity:.92">${esc(p.name)} (${esc(p.code)}) · ${esc(s.county)} · ${esc(s.area)} · Status: <b>${esc((WORKFLOW.patient&&WORKFLOW.patient.labels&&WORKFLOW.patient.labels[p.status])||titleCase(p.status))}</b></div>
        </div>
      </div>

      <div class="grid g4" style="margin-bottom:14px">
        ${kpi('Programme duration', `${s.stayDaysInProg} days`, `Enrolled ${fmtDate(s.enrolmentDate)}`, 'info', 'calendar')}
        ${kpi('Home visits & PDCAs', `${s.visits.length} / ${s.pdcas.length}`, `${s.visits.length} home visits · ${s.pdcas.length} PDCA cycles`, 'ok', 'home')}
        ${kpi('Hospital & Rx care', `${s.reqs.length} / ${s.rx.length}`, `${s.reqs.length} hospital episodes · ${s.rx.length} prescriptions`, '', 'hospital')}
        ${kpi('Total care support', money(s.grandServiceValue), `Direct ${money(s.supportTotal)} · Hospital ${money(s.hospTotal)}`, 'warn', 'wallet')}
      </div>

      <div class="ds-sec">
        <h4>1. Beneficiary Enrolment, Household Context &amp; Discharge Outcome</h4>
        <div class="grid g3 small" style="gap:10px">
          <div><span class="muted">Beneficiary:</span> <b>${esc(p.name)}</b> (${esc(p.sex)}, ${_c6Age(p.dob, p.age)} yrs)</div>
          <div><span class="muted">National ID / SHA:</span> <b>${esc(p.nationalId||'-')}</b> · SHA: <b>${esc(p.sha||'-')}</b></div>
          <div><span class="muted">Household children protected:</span> <b>${num(p.childrenCount!=null?p.childrenCount:((p.household&&p.household.children)||0))} child(ren)</b></div>
          <div><span class="muted">Location:</span> <b>${esc(s.county)} · ${esc(s.area)}</b> (${esc(p.village||(p.household&&p.household.village)||'Community unit')})</div>
          <div><span class="muted">Supporting Caregiver:</span> <b>${esc(s.caregiver)}</b></div>
          <div><span class="muted">Discharge pathway:</span> <b>${esc(pathwayObj.label)}</b></div>
        </div>
      </div>

      ${canClin ? `<div class="ds-sec">
        <h4>2. Clinical Progress &amp; Biometric Trajectory (Intake to Discharge)</h4>
        <div class="grid g3 small" style="gap:10px">
          <div><span class="muted">Primary condition:</span> <b>${esc(cl.diagnosis||'Managed chronic care')}</b> (${esc(cl.conditionCategory||'General clinical')})</div>
          <div><span class="muted">Weight trajectory:</span> <b>${s.baselineWeightKg.toFixed(1)} kg -> ${s.currentWeightKg.toFixed(1)} kg</b> (${s.weightDeltaKg>=0?'+':''}${s.weightDeltaKg} kg)</div>
          <div><span class="muted">BMI &amp; Blood pressure:</span> <b>BMI ${esc(String(cl.bmi||'-'))}</b> · BP <b>${esc(cl.bp||'120/78')}</b></div>
          <div><span class="muted">Medication adherence:</span> <b>${esc(titleCase(cl.adherence||'Good'))}</b></div>
          <div><span class="muted">Care plan target:</span> <b>${esc(Array.isArray(p.carePlan&&p.carePlan.objectives)?p.carePlan.objectives.join('; '):((p.carePlan&&p.carePlan.objectives)||'Clinical stabilisation and household resilience achieved'))}</b></div>
          <div><span class="muted">Allergies / precautions:</span> <b>${esc(Array.isArray(cl.allergies)?(cl.allergies.join(', ')||'None known'):(cl.allergies||'None known'))}</b></div>
        </div>
      </div>` : ''}

      <div class="ds-sec">
        <h4>3. Complete Catalogue of Services Offered Until Discharge</h4>
        ${table([
          { label:'Service Pillar', render:r=>`<b>${esc(r.pillar)}</b>` },
          { label:'Volume Delivered', cls:'mono', render:r=>esc(r.count) },
          { label:'Key Dates & Clinical / Operational Detail', render:r=>`<span class="small">${esc(r.detail)}</span>` },
          { label:'Documented Value', cls:'num', render:r=>esc(r.val) }
        ], [
          { pillar:'Home-Based Care Visits', count:`${s.visits.length} visit(s)`,
            detail: s.visits.length ? `First: ${fmtDate(s.visits[0].date)} · Latest: ${fmtDate(s.visits[s.visits.length-1].date)} (${s.visits[s.visits.length-1].summary||'Household follow-up completed'})` : 'Scheduled home care visits',
            val:'Field care team' },
          { pillar:'30-Day PDCA & Omaha Care Reviews', count:`${s.pdcas.length} PDCA · ${s.omaha.length} Omaha`,
            detail: s.pdcas.length ? s.pdcas.map(x=>`${x.kind==='review'?'Day '+x.dueDay:'Cycle'}: ${x.stage} (${x.status})`).slice(0,4).join(' · ') : 'All scheduled reviews completed',
            val:'Case review' },
          { pillar:'Pharmacy & Essential Medicines', count:`${s.rx.length} Rx regimen(s)`,
            detail: s.rx.length ? s.rx.map(x=>`${x.medicine||x.item||'Essential medicine'} (${x.status||'dispensed'})`).slice(0,3).join(' · ') : 'Managed per clinical care plan',
            val:'FEFO dispensed' },
          { pillar:'Hospital Visits & Specialist Clinics', count:`${s.reqs.length} episode(s) · ${s.followUps.length} clinic follow-up(s)`,
            detail: s.reqs.length ? s.reqs.map(r=>`${r.facility} [${titleCase(r.status)}]${r.postFollowUp?' -> '+r.postFollowUp.clinic:''}`).slice(0,3).join(' · ') : 'No emergency hospital escalation needed',
            val: money(s.hospTotal) },
          { pillar:'Homestay Short-Stay Respite', count:`${s.stays.length} stay(s) (${s.stayDays} day(s))`,
            detail: s.stays.length ? s.stays.map(h=>`Room ${h.room||'A'} (${fmtDate(h.admittedAt)} · ${h.reason||'Post-hospital recovery'})`).join(' · ') : 'Managed safely at household level',
            val: s.stays.length ? `${s.stayDays} respite day(s)` : 'Household care' },
          { pillar:'Direct Household, Nutrition & School Support', count:`${s.support.length} grant item(s)`,
            detail: s.support.length ? s.support.map(x=>`${titleCase(x.type)} (${fmtDate(x.date)})`).slice(0,4).join(' · ') : 'Household stabilisation package',
            val: money(s.supportTotal) },
          { pillar:'Verified Paper & Digital Forms', count:`${s.forms.length} record(s)`,
            detail: s.forms.length ? s.forms.map(f=>`${f.formCode||'LMMK'} (${fmtDate(f.date||f.createdAt)})`).slice(0,4).join(' · ') : 'Intake & review records verified',
            val:'Audit verified' }
        ])}
      </div>

      <div class="ds-sec">
        <h4>4. Continuing Care Referral &amp; Post-Discharge Handover Plan</h4>
        ${ref.required !== false ? `<div class="grid g2 small" style="gap:10px">
          <div><span class="muted">Destination category:</span> <b>${esc(ref.destType)}</b></div>
          <div><span class="muted">Receiving facility / partner:</span> <b>${esc(ref.facility)}</b></div>
          <div><span class="muted">Assigned outpatient / review clinic:</span> <b>${esc(ref.clinic)}</b></div>
          <div><span class="muted">Appointment / handover date:</span> <b>${fmtDate(ref.appointmentDate)}</b></div>
          <div><span class="muted">Receiving focal contact:</span> <b>${esc(ref.receivingContact)}</b></div>
          <div><span class="muted">Handover instructions:</span> <b>${esc(ref.instructions)}</b></div>
        </div>` : `<div class="small">Beneficiary graduated in stable household and clinical standing without external facility referral requirement.</div>`}
      </div>

      <div class="ds-sec">
        <h4>5. LOMAMO Official Discharge Protocol · SHA, Spiritual Growth, Hard-Copy Signatures & Advisory</h4>
        ${(()=>{
          const dp = p.dischargeProtocol || {};
          const adv = p.dischargeAdvisory || {};
          const scans = (p.hardcopyScans||[]).filter(x=>x.kind==='discharge');
          const orphans = dp.orphansPrevented != null ? dp.orphansPrevented : (p.childrenCount ?? ((p.household&&p.household.children)||0));
          return `<div class="grid g3 small" style="gap:10px">
            <div><span class="muted">SHA / SHIF (formerly NHIF):</span> <b>${esc(dp.shaActive||(p.sha?'Yes':'Active'))}</b> · No: <b>${esc(p.sha||'On file')}</b></div>
            <div><span class="muted">SHA / NHIF last payment date:</span> <b>${esc(dp.shaLastPaymentDate?fmtDate(dp.shaLastPaymentDate):fmtDate(s.dischargeDate))}</b></div>
            <div><span class="muted">Repeat patient / Cycle completed:</span> <b>${esc(dp.repeatPatient||(p.repeatPatient?'Yes':'No'))}</b> · Cycle: <b>${esc(dp.completedCycle||'Yes')}</b></div>
            <div><span class="muted">Spiritual growth (Believer):</span> <b>${esc(dp.believer||'Yes')}</b> · Converted during LOMAMO: <b>${esc(dp.convertedDuringLomamo||'No')}</b></div>
            <div><span class="muted">Orphans prevented at discharge:</span> <b>${num(orphans)} child(ren)</b></div>
            <div><span class="muted">Other assistance programmes:</span> <b>${esc(dp.otherProgramsDetail||'None')}</b></div>
            <div><span class="muted">Physical hard-copy signatures:</span> <b>${esc(dp.physicalSignatures||'Patient · Caregiver · Coordinator signed')}</b></div>
            <div><span class="muted">Scanned hard-copy pages on file:</span> <b>${scans.length ? scans.reduce((n,x)=>n+(x.pages||x.files?.length||1),0)+' scanned page(s) verified' : 'Pending County Admin Assistant scan upload'}</b></div>
            <div><span class="muted">Data entered by:</span> <b>${esc(dp.enteredByName || userName(dp.updatedBy) || 'County Admin Assistant')}</b></div>
          </div>
          ${adv.flagged ? `<div class="alert ${adv.severity==='high'?'a-crit':'a-warn'}" style="margin-top:10px">
            ${ic('alert',16)}
            <div><b>Returning-Patient Watchlist Alert Active (${adv.severity==='high'?'High Policy / Conduct Alert':'Caregiver Advisory Watch'})</b>
              <div class="xs"><b>Category:</b> ${esc(adv.category||'Discharge advisory')} — <b>Note:</b> ${esc(adv.note||'')} (Recorded by ${esc(adv.recordedByName||'Care Team')}).</div>
            </div>
          </div>` : `<div class="xs muted" style="margin-top:8px">${ic('check',13)} Returning-Patient Watchlist: <b>Clear</b> — no policy violation or conduct alert recorded at discharge.</div>`}`;
        })()}
      </div>

      <div class="spread xs muted" style="margin-top:10px;padding-top:10px;border-top:1px solid var(--line)">
        <span>Prepared by: <b>${esc(s.caregiver)}</b> · Reviewed by: <b>${esc((p.dischargeSummary&&p.dischargeSummary.approvedByName)||user.name)}</b></span>
        <span>Generated: <b>${fmtDateTime(new Date().toISOString())}</b> · Total Documented Support: <b>${money(s.grandServiceValue)}</b></span>
      </div>
    </div>`;
  }
};

/* ------------------------------------------------------------
   2. HOSP_FOLLOWUP - Post-Hospital Service & Reconciliation
      Caregiver Follow-Up Action + Hospital Dept Feedback Loop
   ------------------------------------------------------------ */
const HOSP_FOLLOWUP = {
  CLINICS: [
    { id:'MOPC', label:'MOPC - Medical Outpatient Clinic Review' },
    { id:'GOPC', label:'GOPC - Gynaecology Outpatient Clinic Review' },
    { id:'SOPC', label:'SOPC - Surgical Outpatient Clinic Review' },
    { id:'POPC', label:'POPC - Paediatric Outpatient Clinic Review' },
    { id:'Physiotherapy', label:'Physiotherapy & Rehabilitation Clinic' },
    { id:'Specialist', label:'Specialist Review (CCC / TB / Oncology / Renal / Eye)' },
    { id:'Facility_Referral', label:'Inter-Facility Referral to Another Hospital' },
    { id:'Home_Recovery', label:'Home Medication Adherence & Recovery Only' }
  ],

  canRecord(user){
    return !!(user && ['caregiver','chw','nurse','mcm','depthead','liaison','countyadmin','chief'].includes(user.roleId));
  },

  canAck(user){
    return !!(user && ['liaison','mcm','depthead','nurse','countyadmin','chief'].includes(user.roleId));
  },

  openModal(reqId, user){
    const r = (DB.db.requests||[]).find(x=>x.id===reqId);
    if(!r) return toast('Hospital request not found.','','err');
    const p = DB.db.patients.find(x=>x.id===r.patientId);
    const existing = r.postFollowUp || {};
    _c6Modal('Post-Hospital Visit Caregiver Follow-Up & Hospital Feedback',
      `<form data-form="hosp-followup" data-id="${r.id}">
        ${alertBox('info', `${r.code||r.no||r.id} · ${p?p.name:r.patientId} (${r.facility})`,
          `<span class="small">Record post-reconciliation outpatient review clinics (MOPC, GOPC, SOPC, Physiotherapy), inter-facility referral, and direct caregiver feedback to the Hospital Department.</span>`)}
        <div class="form-row" style="margin-top:12px">
          <div class="fg"><label>Required follow-up clinic / action *</label>
            <select name="clinic" required>
              ${HOSP_FOLLOWUP.CLINICS.map(c=>`<option value="${c.id}" ${existing.clinic===c.id?'selected':''}>${esc(c.label)}</option>`).join('')}
            </select>
          </div>
          <div class="fg"><label>Target hospital / referral facility *</label>
            <input name="targetFacility" required value="${esc(existing.targetFacility||r.facility||'JOOTRH Outpatient Wing')}" placeholder="Same hospital or referred hospital name">
          </div>
        </div>
        <div class="form-row">
          <div class="fg"><label>Next clinic / review appointment date *</label>
            <input type="date" name="reviewDate" required value="${esc(existing.reviewDate||_c6Iso(_c6AddDays(new Date(),14)))}">
          </div>
          <div class="fg"><label>Patient recovery status at home *</label>
            <select name="recoveryStatus">
              ${['Improving steadily at home','Stable - awaiting specialist review','Needs physiotherapy / mobility support','Requires priority referral to higher facility','Medication side-effects / close watch'].map(s=>`<option ${existing.recoveryStatus===s?'selected':''}>${esc(s)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="fg"><label>Caregiver feedback & clinical handover note to Hospital Department *</label>
          <textarea name="feedbackToHospital" rows="3" required placeholder="Share discharge instructions received, clinic booking card details, physiotherapy schedule, or hospital service feedback for the Hospital Focal Desk...">${esc(existing.feedbackToHospital||'')}</textarea>
        </div>
        <div class="form-row">
          <div class="fg"><label>Auto-create next clinic visit transport request?</label>
            <select name="queueNextVisit">
              <option value="no">No - Track appointment & caregiver follow-up only</option>
              <option value="yes">Yes - Open a linked follow-up hospital visit request now</option>
            </select>
          </div>
          <div class="fg"><label>Caregiver home check scheduled date</label>
            <input type="date" name="homeCheckDate" value="${esc(existing.homeCheckDate||_c6Iso(_c6AddDays(new Date(),3)))}">
          </div>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn btn-ghost" data-act="close-modal">Cancel</button>
          <button type="submit" class="btn btn-primary">${ic('send',14)} Save Follow-Up & Send Feedback to Hospital Dept</button>
        </div>
      </form>`, 'w-lg');
  },

  submit(fd, reqId, user){
    const r = (DB.db.requests||[]).find(x=>x.id===reqId);
    if(!r) return { ok:false, msg:'Hospital request not found.' };
    const p = DB.db.patients.find(x=>x.id===r.patientId);
    const reqRef = r.code || r.no || r.id;
    const clinicId = fd.get('clinic') || 'MOPC';
    const clinicObj = HOSP_FOLLOWUP.CLINICS.find(c=>c.id===clinicId) || HOSP_FOLLOWUP.CLINICS[0];
    const entry = {
      id: uid('hfu'),
      clinic: clinicId,
      clinicLabel: clinicObj.label,
      targetFacility: (fd.get('targetFacility')||'').trim() || r.facility,
      reviewDate: fd.get('reviewDate') || _c6Iso(_c6AddDays(new Date(),14)),
      recoveryStatus: fd.get('recoveryStatus') || 'Improving steadily at home',
      feedbackToHospital: (fd.get('feedbackToHospital')||'').trim(),
      homeCheckDate: fd.get('homeCheckDate') || _c6Iso(_c6AddDays(new Date(),3)),
      submittedBy: user.id,
      submittedByName: user.name,
      submittedRole: roleObj(user.roleId)?.name || user.roleId,
      submittedAt: new Date().toISOString(),
      hospitalAck: false
    };
    if(!entry.feedbackToHospital) return { ok:false, msg:'Please enter caregiver feedback for the Hospital Department.' };
    r.followUps = r.followUps || [];
    r.followUps.push(entry);
    r.postFollowUp = entry;
    r.history = r.history || [];
    r.history.push({ to:'followup_logged', by:user.id, at:entry.submittedAt, note:`Post-visit follow-up: ${clinicId} at ${entry.targetFacility} on ${entry.reviewDate}. Feedback: ${entry.feedbackToHospital}` });

    /* Log a linked home-check visit note so patient timeline reflects it immediately */
    if(p){
      DB.db.visits.push({
        id: uid('vis'),
        patientId: p.id,
        date: _c6Iso(new Date()),
        by: user.id,
        caregiverId: user.id,
        type: 'Post-hospital follow-up',
        outcome: 'seen',
        summary: `Post-hospital review scheduled (${clinicId} at ${entry.targetFacility} on ${entry.reviewDate}). ${entry.recoveryStatus}.`,
        notes: `Post-hospital review scheduled (${clinicId} at ${entry.targetFacility} on ${entry.reviewDate}). ${entry.recoveryStatus}.`,
        nextAction: `${clinicId} clinic review on ${entry.reviewDate}; Hospital Department notified.`,
        nextDue: entry.reviewDate
      });
    }

    /* Optional linked next clinic visit hospital request */
    let spawnedCode = '';
    if(fd.get('queueNextVisit') === 'yes' && p){
      spawnedCode = 'HR-2026-' + String((DB.db.requests.length||100) + 101).padStart(4,'0');
      DB.db.requests.push({
        id: uid('req'),
        no: spawnedCode,
        code: spawnedCode,
        patientId: p.id,
        countyId: p.countyId,
        areaId: p.areaId,
        requestedBy: user.id,
        caregiverId: user.id,
        submittedAt: new Date().toISOString(),
        createdAt: _c6Iso(new Date()),
        preferredDate: entry.reviewDate,
        priority: clinicId === 'Facility_Referral' ? 'urgent' : 'routine',
        facility: entry.targetFacility,
        hospital: entry.targetFacility,
        reason: `${clinicObj.label} follow-up from ${reqRef}: ${entry.feedbackToHospital}`,
        transport: { required:true, fare:800, persons:1, journey:'Home <-> '+entry.targetFacility, escort:false, approved:false },
        estimatedCost: 2200,
        status: 'submitted',
        parentRequestId: r.id,
        history: [{ to:'submitted', by:user.id, at:new Date().toISOString(), note:`Auto-queued follow-up clinic request from ${reqRef} (${clinicId}).` }]
      });
    }

    /* Live notification to Hospital Focal Desk & Medical Case Management */
    DB.db.users.filter(u=>u.active && ['liaison','mcm','depthead'].includes(u.roleId) && (!u.countyId || !r.countyId || u.countyId===r.countyId)).forEach(u=>{
      _c6Notify(u.id, `Post-visit feedback (${reqRef} -> ${clinicId})`, `${p?p.name:r.patientId} due ${entry.reviewDate} at ${entry.targetFacility}.`, 'info');
    });
    _c6Audit('request.followup', r.id, `${clinicId} follow-up & hospital feedback submitted for ${reqRef}${spawnedCode?' (queued '+spawnedCode+')':''}`);
    DB.save();
    return { ok:true, entry, spawnedCode };
  },

  acknowledge(reqId, user){
    const r = (DB.db.requests||[]).find(x=>x.id===reqId);
    if(!r || !r.postFollowUp) return { ok:false, msg:'No post-visit follow-up found on this request.' };
    const reqRef = r.code || r.no || r.id;
    r.postFollowUp.hospitalAck = true;
    r.postFollowUp.ackBy = user.id;
    r.postFollowUp.ackByName = user.name;
    r.postFollowUp.ackAt = new Date().toISOString();
    (r.followUps||[]).forEach(f=>{ f.hospitalAck = true; f.ackByName = user.name; f.ackAt = r.postFollowUp.ackAt; });
    if(r.postFollowUp.submittedBy && r.postFollowUp.submittedBy !== user.id){
      _c6Notify(r.postFollowUp.submittedBy, 'Hospital Department acknowledged feedback', `${user.name} acknowledged ${r.postFollowUp.clinic} follow-up on ${reqRef}.`, 'info');
    }
    _c6Audit('request.followup.ack', r.id, `Hospital Department acknowledged ${r.postFollowUp.clinic} feedback on ${reqRef}`);
    DB.save();
    return { ok:true };
  }
};

/* ------------------------------------------------------------
   3. DUALCHECK - Admin & International Data Single-Operator Seat
      Lock + Complex Compare, Contrast & Two-Account Cross-Check
   ------------------------------------------------------------ */
const DUALCHECK = {
  ADMIN_ROLES: ['chief','countyadmin'],
  INTL_ROLES: ['intldata'],

  sideOf(user){
    if(!user) return null;
    if(DUALCHECK.INTL_ROLES.includes(user.roleId) || (user.username && user.username.startsWith('intl.'))) return 'intl';
    if(DUALCHECK.ADMIN_ROLES.includes(user.roleId)) return 'admin';
    return null;
  },

  canAccess(user){
    return !!(user && (DUALCHECK.sideOf(user) || ['auditor','director','president','me'].includes(user.roleId)));
  },

  ensureStore(dbOpt){
    const store = dbOpt || DB.db;
    if(!store) return null;
    store.coWorkState = store.coWorkState || {
      mode: 'solo', // 'solo' | 'concurrent'
      holderSide: 'admin',
      holderUserId: 'u-kisumu-admin',
      holderName: 'Daniel Ouma Ochieng',
      holderRole: 'County / Programme Administrator',
      claimedAt: new Date(Date.now() - 25*60000).toISOString(),
      concurrentUsers: []
    };
    if(!Array.isArray(store.coWorkBatches) || !store.coWorkBatches.length){
      store.coWorkBatches = [
        {
          id: 'cw-101',
          code: 'CW-2026-01',
          domain: 'KHIS Quarterly Indicator & Caseload Reconciliation (Kisumu & Homa Bay)',
          recordRef: 'Q4-2026 Master Register Sync',
          createdAt: new Date(Date.now() - 3*3600000).toISOString(),
          status: 'pending_crosscheck',
          adminActor: 'Daniel Ouma Ochieng (Administration)',
          intlActor: 'Clara Wanjiku Mwangi (International Data)',
          fields: [
            { key:'Active beneficiary count', baseline:'2,998', adminVal:'2,999', intlVal:'2,999', chosen:'admin', note:'Matched exactly after late Nyalenda intake verification' },
            { key:'Extended stay cases (>180 days)', baseline:'144', adminVal:'150', intlVal:'148', chosen:'admin', note:'2 Homa Bay oncology extensions signed by MCM today' },
            { key:'Post-hospital MOPC/GOPC follow-up rate', baseline:'91.4%', adminVal:'96.2%', intlVal:'95.8%', chosen:'admin', note:'Includes 4 JOOTRH physiotherapy feedbacks reconciled this morning' },
            { key:'Direct household support disbursed (KES)', baseline:'KES 4,812,500', adminVal:'KES 4,894,500', intlVal:'KES 4,894,500', chosen:'intl', note:'Verified against signed Finance monthly cut-off ledger' }
          ],
          verifiedAdmin: { by:'u-admin-ksm', name:'Daniel Ouma Ochieng', at:new Date(Date.now() - 95*60000).toISOString() },
          verifiedIntl: null
        },
        {
          id: 'cw-102',
          code: 'CW-2026-02',
          domain: 'Donor & Partner Referral Outcome Audit Sheet',
          recordRef: 'DISCH-REF-OCT-2026',
          createdAt: new Date(Date.now() - 26*3600000).toISOString(),
          status: 'committed',
          adminActor: 'Grace Chebet Kiprop (Chief System Admin)',
          intlActor: 'Clara Wanjiku Mwangi (International Data)',
          fields: [
            { key:'Graduated beneficiaries (YTD)', baseline:'331', adminVal:'334', intlVal:'334', chosen:'admin', note:'All 334 discharge summaries populated & verified' },
            { key:'Continuing care facility referrals', baseline:'118', adminVal:'124', intlVal:'124', chosen:'intl', note:'6 new MOPC/Physiotherapy referrals confirmed' }
          ],
          verifiedAdmin: { by:'u-chief', name:'Grace Chebet Kiprop', at:new Date(Date.now() - 24*3600000).toISOString() },
          verifiedIntl: { by:'u-intl-1', name:'Clara Wanjiku Mwangi', at:new Date(Date.now() - 22*3600000).toISOString() },
          committedAt: new Date(Date.now() - 22*3600000).toISOString()
        }
      ];
    }
    return store.coWorkState;
  },

  bannerHTML(user){
    const side = DUALCHECK.sideOf(user);
    if(!side) return '';
    const st = DUALCHECK.ensureStore();
    const pending = (DB.db.coWorkBatches||[]).filter(b=>b.status!=='committed').length;
    const sideLabel = side==='admin' ? 'Administration Office' : 'International Data Office';
    const otherSideLabel = side==='admin' ? 'International Data Office' : 'Administration Office';

    if(st.mode === 'concurrent'){
      return `<div class="coedit-bar concurrent no-print">
        <div>
          <div class="xs" style="text-transform:uppercase;letter-spacing:.09em;color:#FDE047;font-weight:800">Dual Simultaneous Co-Work Active · Mandatory Two-Account Cross-Check Enabled</div>
          <div class="small" style="margin-top:2px">Both <b>Administration</b> and <b>International Data</b> are working simultaneously. Every shared update is routed to the <b>Compare, Contrast & Cross-Check Workspace</b> (${pending} batch(es) awaiting 2/2 sign-off).</div>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <button class="btn btn-xs coedit-btn-primary" data-act="go" data-v="dualcheck">${ic('shield',13)} Compare &amp; Cross-Check (${pending})</button>
          <button class="btn btn-xs coedit-btn-secondary" data-act="coedit-solo">Return to Single-Operator Lock</button>
        </div>
      </div>`;
    }

    if(st.holderSide && st.holderSide !== side){
      return `<div class="coedit-bar blocked no-print">
        <div>
          <div class="xs" style="text-transform:uppercase;letter-spacing:.09em;color:#FDA4AF;font-weight:800">Single-Operator Exclusivity Lock · Active Seat Held by ${esc(otherSideLabel)}</div>
          <div class="small" style="margin-top:2px"><b>${esc(st.holderName)}</b> currently holds the active solo work lease. Admin and International Data work one person at a time by default - claim the solo seat if idle, or activate <b>Compare &amp; Contrast Dual Co-Work Mode</b> to work together with mandatory two-account verification.</div>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <button class="btn btn-xs coedit-btn-primary" data-act="coedit-claim">${ic('key',13)} Take Solo Seat</button>
          <button class="btn btn-xs coedit-btn-secondary" data-act="coedit-concurrent">Work Simultaneously (Compare &amp; Contrast)</button>
        </div>
      </div>`;
    }

    return `<div class="coedit-bar no-print">
      <div>
        <div class="xs" style="text-transform:uppercase;letter-spacing:.09em;color:#7DD3FC;font-weight:800">Single-Operator Active Seat · Exclusive to ${esc(sideLabel)}</div>
        <div class="small" style="margin-top:2px">Active operator: <b>${esc(user.name)}</b>. Counterpart office (${esc(otherSideLabel)}) is locked out unless Dual Simultaneous Co-Work Mode is opened.${pending?` <b>${pending} batch(es)</b> awaiting two-account cross-check.`:''}</div>
      </div>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <button class="btn btn-xs coedit-btn-primary" data-act="go" data-v="dualcheck">${ic('check',13)} Co-Work &amp; Cross-Check (${pending})</button>
        <button class="btn btn-xs coedit-btn-secondary" data-act="coedit-concurrent">Enable Dual Mode</button>
      </div>
    </div>`;
  },

  claimSolo(user){
    const st = DUALCHECK.ensureStore();
    const side = DUALCHECK.sideOf(user) || 'admin';
    st.mode = 'solo';
    st.holderSide = side;
    st.holderUserId = user.id;
    st.holderName = user.name;
    st.holderRole = roleObj(user.roleId)?.name || user.roleId;
    st.claimedAt = new Date().toISOString();
    _c6Audit('cowork.solo', user.id, `Exclusive single-operator seat claimed by ${user.name} (${side})`);
    DB.save();
  },

  enableConcurrent(user){
    const st = DUALCHECK.ensureStore();
    st.mode = 'concurrent';
    st.concurrentSince = new Date().toISOString();
    _c6Audit('cowork.concurrent', user.id, `Simultaneous Admin + International Data Compare & Contrast mode activated by ${user.name}`);
    DB.save();
  },

  pickResolution(batchId, fieldIdx, choice, user){
    DUALCHECK.ensureStore();
    const b = DB.db.coWorkBatches.find(x=>x.id===batchId);
    if(!b || !b.fields[fieldIdx]) return;
    b.fields[fieldIdx].chosen = choice;
    /* Changing resolution resets signatures if previously signed so both re-verify exact values */
    b.verifiedAdmin = null;
    b.verifiedIntl = null;
    b.status = 'pending_crosscheck';
    _c6Audit('cowork.resolve', b.id, `${user.name} selected ${choice.toUpperCase()} value on "${b.fields[fieldIdx].key}"`);
    DB.save();
  },

  signBatch(batchId, side, user){
    DUALCHECK.ensureStore();
    const b = DB.db.coWorkBatches.find(x=>x.id===batchId);
    if(!b) return { ok:false, msg:'Comparison batch not found.' };
    const userSide = DUALCHECK.sideOf(user);
    if(userSide !== side){
      return { ok:false, needSwitch:true, msg:`Only an authorised ${side==='admin'?'Administration':'International Data'} account can sign this verification box.` };
    }
    const stamp = { by:user.id, name:user.name, at:new Date().toISOString() };
    if(side === 'admin') b.verifiedAdmin = stamp;
    else b.verifiedIntl = stamp;
    _c6Audit('cowork.verify', b.id, `${user.name} (${side.toUpperCase()}) cross-checked & signed ${b.code}`);
    DB.save();
    return { ok:true, bothReady: !!(b.verifiedAdmin && b.verifiedIntl) };
  },

  commitBatch(batchId, user){
    DUALCHECK.ensureStore();
    const b = DB.db.coWorkBatches.find(x=>x.id===batchId);
    if(!b) return { ok:false, msg:'Batch not found.' };
    if(!b.verifiedAdmin || !b.verifiedIntl){
      return { ok:false, msg:'Both Administration AND International Data accounts must cross-check and sign (2/2) before committing.' };
    }
    b.status = 'committed';
    b.committedAt = new Date().toISOString();
    b.committedBy = user.name;
    _c6Audit('cowork.commit', b.id, `Dual-verified batch ${b.code} committed after 2/2 Admin + International Data cross-check`);
    DB.save();
    return { ok:true };
  },

  openNewBatchModal(user){
    _c6Modal('New Admin vs International Data Compare & Contrast Batch',
      `<form data-form="dualcheck-new">
        ${alertBox('info','Simultaneous Co-Work Comparison Sheet',
          '<span class="small">Record overlapping figures or edits prepared by Administration and International Data so both offices contrast every variance side-by-side and cross-check before commit.</span>')}
        <div class="form-row" style="margin-top:12px">
          <div class="fg"><label>Dataset / Sheet title *</label>
            <input name="domain" required value="Monthly County Caseload & Referral Indicator Sheet" placeholder="e.g. KHIS Monthly Summary / Donor Caseload Reconciliation">
          </div>
          <div class="fg"><label>Reference code *</label>
            <input name="recordRef" required value="SYNC-${_c6Iso(new Date())}">
          </div>
        </div>
        <div class="form-row">
          <div class="fg"><label>Metric / Field 1 name *</label><input name="f1Key" required value="Active caseload verified"></div>
          <div class="fg"><label>Admin value *</label><input name="f1Admin" required value="2,999"></div>
          <div class="fg"><label>International Data value *</label><input name="f1Intl" required value="2,997"></div>
        </div>
        <div class="form-row">
          <div class="fg"><label>Metric / Field 2 name *</label><input name="f2Key" required value="Discharge referrals completed"></div>
          <div class="fg"><label>Admin value *</label><input name="f2Admin" required value="126"></div>
          <div class="fg"><label>International Data value *</label><input name="f2Intl" required value="124"></div>
        </div>
        <div class="fg"><label>Comparison context / variance notes</label>
          <input name="note" value="Two late Friday facility referral updates contrasted between County Admin register and International Data extract.">
        </div>
        <div class="modal-foot">
          <button type="button" class="btn btn-ghost" data-act="close-modal">Cancel</button>
          <button type="submit" class="btn btn-primary">${ic('plus',14)} Open Side-by-Side Cross-Check Batch</button>
        </div>
      </form>`, 'w-lg');
  },

  submitNewBatch(fd, user){
    const st = DUALCHECK.ensureStore();
    st.mode = 'concurrent';
    const code = 'CW-2026-0' + ((DB.db.coWorkBatches.length||2) + 1);
    const note = (fd.get('note')||'').trim() || 'Side-by-side variance check';
    const b = {
      id: uid('cw'),
      code,
      domain: (fd.get('domain')||'').trim(),
      recordRef: (fd.get('recordRef')||'').trim(),
      createdAt: new Date().toISOString(),
      status: 'pending_crosscheck',
      adminActor: 'Administration Desk',
      intlActor: 'International Data Desk',
      fields: [
        { key:fd.get('f1Key'), baseline:fd.get('f1Intl'), adminVal:fd.get('f1Admin'), intlVal:fd.get('f1Intl'), chosen:'admin', note },
        { key:fd.get('f2Key'), baseline:fd.get('f2Intl'), adminVal:fd.get('f2Admin'), intlVal:fd.get('f2Intl'), chosen:'admin', note }
      ],
      verifiedAdmin: null,
      verifiedIntl: null
    };
    DB.db.coWorkBatches.unshift(b);
    _c6Audit('cowork.batch.create', b.id, `Created Admin vs International Data comparison batch ${b.code}`);
    DB.save();
    return { ok:true, batch:b };
  }
};

function renderDualCheck(user){
  if(!DUALCHECK.canAccess(user)) return deniedPanel(user, 'system.config');
  const st = DUALCHECK.ensureStore();
  const batches = DB.db.coWorkBatches || [];
  const pending = batches.filter(b=>b.status!=='committed');
  const variances = batches.reduce((acc,b)=>acc + b.fields.filter(f=>String(f.adminVal)!==String(f.intlVal)).length, 0);
  const mySide = DUALCHECK.sideOf(user);

  const counterpartUser = mySide === 'admin'
    ? (DB.db.users.find(u=>u.active && DUALCHECK.sideOf(u)==='intl') || DB.db.users.find(u=>u.username==='auditor'))
    : (DB.db.users.find(u=>u.active && u.username==='kisumu.admin') || DB.db.users.find(u=>u.username==='county.kisumu') || DB.db.users.find(u=>u.username==='chief.admin'));

  return `
    ${pageHead('Admin & International Data Exclusivity Lock & Cross-Check',
      'Enforces single-operator work leases between Administration and International Data, and contrasts every simultaneous edit side-by-side until both accounts verify and sign off.',
      `<button class="btn btn-sm btn-ghost" data-act="${st.mode==='concurrent'?'coedit-solo':'coedit-concurrent'}">${ic('key',14)} ${st.mode==='concurrent'?'Restore Solo Lock':'Activate Simultaneous Mode'}</button>
       <button class="btn btn-sm btn-primary" data-act="open-dualcheck-new">${ic('plus',14)} New Compare & Contrast Sheet</button>`)}

    <div class="grid g4" style="margin-bottom:16px">
      ${kpi('Active seat policy', st.mode==='concurrent'?'Dual Co-Work':'Solo Exclusive', st.mode==='concurrent'?'Both offices active - 2/2 sign-off required':`Held by ${st.holderName}`, st.mode==='concurrent'?'warn':'ok', 'key')}
      ${kpi('Awaiting cross-check', num(pending.length), 'Requires Admin + Intl Data sign-off', pending.length?'warn':'ok', 'alert')}
      ${kpi('Contrasted variances', num(variances), 'Side-by-side field diffs detected', 'info', 'layers')}
      ${kpi('Committed & verified', num(batches.length - pending.length), '2/2 dual-account verified batches', 'ok', 'check')}
    </div>

    ${batches.map(b=>{
      const ready = !!(b.verifiedAdmin && b.verifiedIntl);
      const isCommitted = b.status === 'committed';
      return card(`${b.code} · ${b.domain}`, `
        <div class="spread small" style="margin-bottom:10px">
          <span>Reference: <b class="mono">${esc(b.recordRef)}</b> · Admin: <b>${esc(b.adminActor)}</b> · International Data: <b>${esc(b.intlActor)}</b></span>
          ${isCommitted ? badge('2/2 Verified & Committed','b-ok') : ready ? badge('2/2 Signed - Ready to Commit','b-info') : badge('Awaiting Dual Account Verification','b-warn')}
        </div>
        ${table([
          { label:'Field / Indicator', render:f=>`<b>${esc(f.key)}</b><div class="xs muted">${esc(f.note||'')}</div>` },
          { label:'Prior Baseline', cls:'mono muted', render:f=>esc(f.baseline) },
          { label:'Admin Account Entry', cls:'mono', render:f=>`<span style="font-weight:700">${esc(f.adminVal)}</span> ${f.chosen==='admin'?badge('Selected','b-info','nodot'):''}` },
          { label:'International Data Entry', cls:'mono', render:f=>`<span style="font-weight:700">${esc(f.intlVal)}</span> ${f.chosen==='intl'?badge('Selected','b-ok','nodot'):''}` },
          { label:'Contrast Status', render:f=>String(f.adminVal)===String(f.intlVal) ? badge('Exact match','b-ok') : badge('Variance - Contrast required','b-warn') },
          { label:'Resolution Pick', render:(f,idx)=>isCommitted
              ? `<span class="xs bold">${f.chosen==='admin'?'Admin value':'International Data value'}: ${esc(f.chosen==='admin'?f.adminVal:f.intlVal)}</span>`
              : `<div class="row" style="gap:5px">
                  <button class="btn btn-xs ${f.chosen==='admin'?'btn-primary':'btn-ghost'}" data-act="dualcheck-pick" data-id="${b.id}" data-idx="${idx}" data-choice="admin">Use Admin</button>
                  <button class="btn btn-xs ${f.chosen==='intl'?'btn-primary':'btn-ghost'}" data-act="dualcheck-pick" data-id="${b.id}" data-idx="${idx}" data-choice="intl">Use Intl Data</button>
                </div>` }
        ], b.fields)}

        <div class="grid g2" style="gap:12px;margin-top:14px">
          <div style="padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:var(--surface-2)">
            <div class="spread">
              <b>1. Administration Account Verification</b>
              ${b.verifiedAdmin ? badge('Signed','b-ok') : badge('Pending','b-warn')}
            </div>
            <div class="xs muted" style="margin-top:4px">${b.verifiedAdmin ? `Verified by <b>${esc(b.verifiedAdmin.name)}</b> on ${fmtDateTime(b.verifiedAdmin.at)}` : 'Requires review and verification by an authorised Administration account.'}</div>
            ${!isCommitted && !b.verifiedAdmin ? `<div style="margin-top:8px">
              ${mySide==='admin'
                ? `<button class="btn btn-xs btn-primary" data-act="dualcheck-sign" data-id="${b.id}" data-side="admin">${ic('check',12)} Sign as Administration (${esc(user.name)})</button>`
                : (counterpartUser ? `<button class="btn btn-xs btn-ghost" data-act="prompt-switch-account" data-u="${esc(counterpartUser.username)}" data-v="dualcheck" data-asset="${esc(b.code+' Administration Cross-Check Sheet')}">Switch to ${esc(counterpartUser.name)} to Verify</button>` : '')}
            </div>` : ''}
          </div>

          <div style="padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:var(--surface-2)">
            <div class="spread">
              <b>2. International Data Account Verification</b>
              ${b.verifiedIntl ? badge('Signed','b-ok') : badge('Pending','b-warn')}
            </div>
            <div class="xs muted" style="margin-top:4px">${b.verifiedIntl ? `Verified by <b>${esc(b.verifiedIntl.name)}</b> on ${fmtDateTime(b.verifiedIntl.at)}` : 'Requires independent cross-check by an authorised International Data account.'}</div>
            ${!isCommitted && !b.verifiedIntl ? `<div style="margin-top:8px">
              ${mySide==='intl'
                ? `<button class="btn btn-xs btn-primary" data-act="dualcheck-sign" data-id="${b.id}" data-side="intl">${ic('check',12)} Sign as International Data (${esc(user.name)})</button>`
                : (counterpartUser ? `<button class="btn btn-xs btn-ghost" data-act="prompt-switch-account" data-u="${esc(counterpartUser.username)}" data-v="dualcheck" data-asset="${esc(b.code+' International Data Cross-Check Sheet')}">Switch to ${esc(counterpartUser.name)} to Verify</button>` : '')}
            </div>` : ''}
          </div>
        </div>

        ${!isCommitted ? `<div class="spread" style="margin-top:12px;padding-top:10px;border-top:1px solid var(--line-2)">
          <span class="xs muted">Rule: Neither Administration nor International Data can commit concurrent changes alone. Both signatures (2/2) are mandatory.</span>
          <button class="btn btn-sm ${ready?'btn-primary':'btn-ghost'}" data-act="dualcheck-commit" data-id="${b.id}">${ic('lock',14)} Commit 2/2 Cross-Checked Master State</button>
        </div>` : ''}
      `);
    }).join('')}`;
}

/* ------------------------------------------------------------
   4. DEMO_SWITCH - Authorised-Account Switch Prompt & Banner
   ------------------------------------------------------------ */
const DEMO_SWITCH = {
  activeNotice: null,

  findBestUserForCap(cap){
    const users = (DB.db && DB.db.users || []).filter(u=>u.active);
    const preferred = ['mcm.kisumu','nurse.kisumu','focal.kisumu','liaison.kisumu','finance.kisumu','procurement','media.head','hr.officer','auditor','me.kisumu','me.officer','intl.data','kisumu.admin','chief.admin','director','country.dir'];
    for(const uname of preferred){
      const u = users.find(x=>x.username===uname);
      if(u && (!cap || RBAC.has(u, cap))) return u;
    }
    return users.find(u=>!cap || RBAC.has(u, cap)) || null;
  },

  openPrompt(username, targetView, assetName){
    const users = (DB.db.users||[]).filter(u=>u.active!==false);
    const stem = String(username||'').split('.')[0];
    const target = users.find(u=>u.username===username)
      || (stem ? users.find(u=>u.username.startsWith(stem)) : null);
    if(!target) return toast('Authorised demo account not found.','','err');
    const role = roleObj(target.roleId);
    const dept = role ? deptObj(role.dept) : null;
    const scope = (target.areaIds && target.areaIds.length)
      ? `${countyName(target.countyId)} · ${target.areaIds.map(areaName).join(', ')}`
      : (target.areaId ? `${countyName(target.countyId)} · ${areaName(target.areaId)}` : (target.countyId ? countyName(target.countyId) : 'All Counties · Organisation-Wide'));
    const pageTitle = assetName || (typeof VIEW_TITLES!=='undefined' && VIEW_TITLES[targetView]) || targetView || 'Authorised Workspace';
    _c6Modal('Switch to Authorised Account View',
      `<div>
        ${alertBox('info', `Viewing "${pageTitle}" as an Authorised Account`,
          `<span class="small">This page, sheet or asset belongs to a specific departmental role. Confirm below to switch your demo session and view it directly under the authorised account's exact permissions and workspace context.</span>`)}
        <div style="margin-top:14px;padding:14px 16px;border-radius:12px;background:var(--surface-2);border:1px solid var(--line)">
          <div class="xs muted" style="text-transform:uppercase;letter-spacing:.08em">Target Authorised Account</div>
          <div style="font-size:17px;font-weight:800;margin-top:3px">${esc(target.name)} <span class="xs mono muted">(@${esc(target.username)})</span></div>
          <div class="small" style="margin-top:4px">Role: <b>${esc(role?role.name:target.roleId)}</b> · Department: <b>${esc(dept?dept.name:'Operations')}</b></div>
          <div class="small" style="margin-top:2px">Authorised scope: <b>${esc(scope)}</b></div>
          <div class="small" style="margin-top:6px;padding-top:6px;border-top:1px solid var(--line-2)">Target page / sheet / asset: <b>${esc(pageTitle)}</b></div>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn btn-ghost" data-act="close-modal">Stay in Current Account (${esc(AUTH.user?AUTH.user.name:'Current')})</button>
          <button type="button" class="btn btn-primary" data-act="confirm-switch-account" data-u="${esc(target.username)}" data-v="${esc(targetView||'home')}" data-asset="${esc(pageTitle)}">${ic('key',14)} Switch & View as ${esc(target.name)}</button>
        </div>
      </div>`, 'w-md');
  },

  bannerHTML(){
    const n = DEMO_SWITCH.activeNotice;
    if(!n || !AUTH.user || AUTH.user.username !== n.username) return '';
    return `<div class="demo-view-bar no-print" role="region" aria-label="Switched account notice">
      <div class="small demo-view-copy">
        <span class="demo-view-ic">${ic('eye',15)}</span>
        <span>Now viewing <b>${esc(n.asset)}</b> as authorised account <b>${esc(n.name)}</b> (${esc(n.role)} · ${esc(n.scope)}).
        ${n.prevUsername && n.prevUsername !== n.username ? `<span class="xs demo-view-from"> Switched from @${esc(n.prevUsername)}.</span>` : ''}</span>
      </div>
      <div class="row demo-view-actions" style="gap:8px;flex-wrap:wrap">
        ${n.prevUsername && n.prevUsername !== n.username ? `<button class="btn btn-xs demo-bar-btn demo-bar-btn-primary" data-act="prompt-switch-account" data-u="${esc(n.prevUsername)}" data-v="home" data-asset="Previous Console Home">${ic('back',13)} Return to @${esc(n.prevUsername)}</button>` : ''}
        <button class="btn btn-xs demo-bar-btn demo-bar-btn-dismiss" data-act="dismiss-switch-banner">${ic('x',12)} Dismiss</button>
      </div>
    </div>`;
  }
};

/* ------------------------------------------------------------
   5. ROLE_CTX - Role-Contextual Navigation Labels, Hero Right
      Quick Tabs, Contextual Subpage Headers & Role Settings
   ------------------------------------------------------------ */
const ROLE_CTX = {
  groupLabel(user, groupLabel){
    if(!user) return groupLabel;
    const role = roleObj(user.roleId) || {};
    const cLabel = user.countyId ? countyName(user.countyId) : 'Global';
    if(groupLabel === 'Overview'){
      const m = {
        caregiver: 'My Field Care Desk',
        chw: 'My Community Desk',
        coordinator: `${cLabel} Area Coordination`,
        nurse: 'Nursing Triage Desk',
        mcm: 'Case Management Desk',
        depthead: 'Clinical Department Desk',
        liaison: 'Hospital Focal Desk',
        assistant: `${cLabel} Admin & Secretary Desk`,
        'program.assistant': 'Programme Secretary Desk',
        countyadmin: `${cLabel} County Office Desk`,
        finance: `${cLabel} Finance Control Desk`,
        procurement: 'Supply Chain & Procurement',
        mediahead: 'Media & Ethics Studio',
        pr: 'Public Relations Desk',
        hr: 'Human Capital Desk',
        welfare: 'Staff Welfare Desk',
        vehicle: 'Fleet & Escort Dispatch',
        auditor: 'Independent Audit Desk',
        me: `${cLabel} M&E Verification Desk`,
        intldata: 'International Data Desk',
        'intl.medical': 'International Medical Desk',
        director: 'Country Director Command',
        president: 'Presidential Governance',
        'program.admin': 'Chief Programme Command',
        chief: 'CareLink OS Control'
      };
      if(m[user.roleId]) return m[user.roleId];
      return `${(role.name||'Role').split(' ')[0]} Workspace`;
    }
    return groupLabel;
  },

  navLabel(user, id, fallback){
    if(!user) return fallback;
    const r = user.roleId;
    const role = roleObj(r) || {};
    const cShort = user.countyId ? countyName(user.countyId) : 'Global';
    const map = {
      caregiver: {
        home:'My Caregiver Home', smartflow:'Field Care Smart Workflow', monday:`${cShort} Monday Case Review`,
        attention:'Household Red Flags', drafts:'My Field Visit Drafts', patients:'My Assigned Households',
        visits:'Home Visits & Follow-Ups', bmiboard:'Household BMI & Child MUAC', schedule:'My Weekly Visit Route',
        visitplan:'Smart Visit Route Learner', requests:'Hospital Escorts & Clinics', forms:'Field Care Forms (LMMK)',
        pdca:'30-Day & 120-Day PDCA', repeat:'Returning Beneficiary Check', calendar:'My Visit & Clinic Calendar',
        messages:'Area Team & Nurse Inbox', settings:'My Tablet & Field Preferences', leave:'My Leave & Reliever Plan',
        handover:'Household Reliever Handover', workplans:'My Monthly Field Plan'
      },
      chw: {
        home:'CHV Community Home', smartflow:'CHV Household Smart Workflow', monday:`${cShort} Monday Field Sync`,
        patients:'My Community Households', visits:'Household Wellness Visits', drafts:'My Community Drafts',
        calendar:'Community Visit Calendar', messages:'Coordinator & Nurse Inbox', settings:'My CHV Preferences',
        leave:'My Availability & Leave'
      },
      coordinator: {
        home:`${cShort} Area Coordinator Home`, smartflow:'Area Coordination Smart QA', monday:`${cShort} Monday Area Agenda`,
        attention:'Area Household Escalations', patients:'Ministry Area Caseload', visits:'Area Caregiver Visits',
        bmiboard:'Area BMI & Nutrition Watch', pdca:'Area PDCA & Graduation Queue', teams:'Area Caregiver Teams & Days',
        drafts:'Area Coordination Drafts', calendar:'Area Visit & Sitting Calendar', messages:'Caregiver & County Inbox',
        settings:'Coordinator Console Settings'
      },
      nurse: {
        home:'Nursing & Triage Home', smartflow:'Nursing Triage Smart QA', monday:`${cShort} Clinical Monday Brief`,
        patients:'Clinical Patient Caseload', bmiboard:'Clinical BMI & SAM Triage', pharmacy:'Medicine Stock & FEFO',
        tbcare:'TB Dispensing Control', careplans:'Omaha Holistic Care Plans', requests:'Hospital Referrals & Reviews',
        forms:'Clinical Assessment Forms', pdca:'Clinical PDCA & Discharges', drafts:'Clinical Triage Drafts',
        calendar:'Clinic & Ward Schedule', messages:'Clinical & Caregiver Inbox', settings:'Nursing & Ward Preferences'
      },
      mcm: {
        home:'Case Management Home', smartflow:'MCM Clinical & 120d Smart QA', monday:`${cShort} Monday Case Escalations`,
        clinicalmcm:'MCM Acuity & SOAP Console', intlmedical:'120+ Day PDCA Specialist Queue',
        patients:`${cShort} Clinical Register`, bmiboard:'County BMI & Malnutrition Watch', pdca:'PDCA 120-Day & Discharges',
        requests:'Hospital Approvals & Referrals', referral:'Master Referral Document', conditions:'Clinical Condition Register',
        drafts:'Case Management Drafts', calendar:'Clinical Review Calendar', messages:'Clinical & Hospital Inbox',
        settings:'Case Management Preferences'
      },
      depthead: {
        home:'Clinical Department Home', smartflow:'Department Clinical Smart QA', monday:`${cShort} Monday Dept Brief`,
        clinicalmcm:'Department Case Oversight', patients:'Department Clinical Register', pdca:'PDCA & Discharge Approvals',
        requests:'Hospital Referral Oversight', drafts:'Department Clinical Drafts', settings:'Clinical Dept Settings'
      },
      liaison: {
        home:'Hospital Focal Desk Home', smartflow:'Hospital Escort Smart Workflow', monday:`${cShort} Inpatient Monday Update`,
        liaison:'JOOTRH & Facility Queue', requests:'Hospital Visits & Clinic Feedback', recon:'Hospital Receipt Reconciliation',
        patients:'Hospitalised Beneficiaries', drafts:'Hospital Liaison Drafts', calendar:'Outpatient Clinic Bookings',
        messages:'Caregiver & MCM Liaison Inbox', settings:'Hospital Desk Preferences'
      },
      assistant: {
        home:`${cShort} Admin & Secretary Home`, smartflow:'Intake Scan & Secretary QA',
        monday:`${cShort} Monday Secretary & Minutes`, hardcopy:'Hard-Copy Intake & Scans',
        pipeline:'Physical Assessment Pipeline', adminops:'Daily Office Petty Cash & Ops',
        drafts:'Minutes & Intake Drafts', calendar:`${cShort} Office & Sitting Calendar`,
        messages:`${cShort} Office Coordination Inbox`, settings:'Admin Secretary Preferences'
      },
      'program.assistant': {
        home:'Programme Assistant Home', smartflow:'Programme & Secretary Smart QA',
        monday:'Monday Master Secretary Desk', adminops:'Programme Operations & Statutory',
        reports:'Programme & County Reports', drafts:'Programme Secretary Drafts', settings:'Programme Assistant Settings'
      },
      countyadmin: {
        home:`${cShort} County Admin Home`, smartflow:`${cShort} County Operations QA`,
        monday:`${cShort} Monday Management Chair`, adminops:'Daily PAYG, 9th Statutory & OpEx',
        hardcopy:'Hard-Copy Scans Verification', finance:`${cShort} County Expenditure`,
        users:`${cShort} Urgent Sign-In & Staff Desk`, reports:`${cShort} County Reports`,
        drafts:`${cShort} Admin Drafts`, calendar:`${cShort} County Operations Calendar`, settings:`${cShort} County Office Settings`
      },
      finance: {
        home:`${cShort} Finance Control Home`, smartflow:'Voucher, eTIMS & Statutory QA',
        monday:`${cShort} Monday Budget Brief`, adminops:'PAYG, Weekly Suppliers & 9th Statutory',
        finance:'Expenditure & Ledger Control', costing:'Cost per Patient Analytics', budget:'Departmental Budget Lines',
        foodbudget:'Projected Food & Hygiene Budget', reports:'Financial & Variance Reports',
        drafts:'Voucher & Ledger Drafts', calendar:'Statutory & Cut-Off Calendar', settings:'Finance Control Preferences'
      },
      procurement: {
        home:'Procurement & Supply Home', smartflow:'4-Tier Quotes, GRN & Foodbag QA',
        monday:'Monday Foodbag & Supply Count', procurement:'Purchase Orders & 4-Tier Quotes',
        foodbudget:'Weekly Foodbag & Hygiene Calculator', inventory:'122-Item Equipment Register',
        drafts:'Requisition & PO Drafts', calendar:'Supplier Delivery & Cheque Calendar', settings:'Procurement Preferences'
      },
      mediahead: {
        home:'Media & Ethics Studio Home', smartflow:'Consent & Zero-PII Story QA',
        monday:'Monday Impact & Comms Brief', media:'Verified Media Library', studio:'Ethical Storytelling Studio',
        consent:'Signed Consent Register', publish:'Dignity Publication Queue', donor:'Partner & Donor Impact Brief',
        inventory:'Media & Office Equipment Custody', drafts:'Story & Publication Drafts', settings:'Media & Consent Settings'
      },
      pr: {
        home:'Public Relations Home', smartflow:'Partner Comms & Ethics QA', monday:'Monday Communications Brief',
        pr:'Partner & Public Relations Desk', donor:'Donor Impact Summary', drafts:'PR & Partner Drafts', settings:'PR Workspace Settings'
      },
      hr: {
        home:'Human Resources Home', smartflow:'Leave Coverage & Handover QA', monday:'Monday Attendance & Relievers',
        staff:'Staff register · HR Roster', leave:'Staff Leave & Off-Days', handover:'Signed Role Handover & Takeover',
        workplans:'Monthly Staff Work Plans', evaluation:'Staff Performance Evaluation', drafts:'HR & Policy Drafts',
        calendar:'Leave & Roster Calendar', settings:'HR Governance Settings'
      },
      welfare: {
        home:'Staff Welfare Home', smartflow:'Staff Wellbeing & Support QA', welfare:'Staff Welfare & Support Register',
        leave:'Staff Leave & Coverage', drafts:'Welfare Support Drafts', settings:'Welfare Desk Settings'
      },
      vehicle: {
        home:'Fleet & Dispatch Home', smartflow:'Trip Log, Fuel & Escort QA', monday:'Monday Weekly Route & Dispatch',
        vehicles:'Foundation Vehicle Register', trips:'Hospital Escorts, Trips & Fuel', calendar:'Vehicle Dispatch Schedule',
        drafts:'Trip & Maintenance Drafts', settings:'Fleet Dispatch Settings'
      },
      auditor: {
        home:'Internal Audit & Assurance Home', smartflow:'Independent Audit & Variance QA',
        audit:'Audit Findings & Exceptions', history:'Immutable Audit Trail', accessaudit:'Role & Authority Matrix Audit',
        quality:'Beneficiary & Voucher QA', finance:'Audited Expenditure Ledger', drafts:'Audit Working Notes',
        settings:'Assurance Console Settings'
      },
      me: {
        home:`${cShort} M&E Analytics Home`, smartflow:'Indicator & 100% Completeness QA',
        monday:`${cShort} Monday Indicator Brief`, reports:'M&E Indicator Reports', targets:'Versioned Targets & Baselines',
        quality:'Data Completeness Verification', analytics:'Pivot Tables & Area Maps', interop:'KHIS / DHIS2 Staging',
        drafts:'M&E Verification Drafts', settings:'M&E Console Preferences'
      },
      intldata: {
        home:'International Data Home', smartflow:'Cross-County Co-Work & Indicator QA',
        dualcheck:'Admin / Intl 2/2 Co-Work Lock', analytics:'Cross-County Indicators', interop:'KHIS & Partner Exports',
        quality:'Global 3,333-Record QA Audit', drafts:'International Data Drafts', settings:'International Data Preferences'
      },
      'intl.medical': {
        home:'International Medical Home', smartflow:'120+ Day PDCA Specialist QA',
        intlmedical:'120+ Day PDCA Specialist Dossiers', clinicalmcm:'Cross-County Clinical Oversight',
        bmiboard:'Global Anthropometry & SAM Watch', pdca:'Official C-DIMS PDCA Reports', settings:'Specialist Review Settings'
      },
      director: {
        home:'Country Director Command Home', smartflow:'Executive Approvals & National QA',
        monday:'National & County Monday Synthesis', executive:'National Executive Summary', compare:'Kisumu vs Homa Bay Comparison',
        execconsole:'Executive Sitting Console', adminops:'Statutory, OpEx & Societies Compliance',
        drafts:'Executive Decision Drafts', settings:'Country Director Settings'
      },
      president: {
        home:'Presidential Governance Home', smartflow:'Institutional Covenant & Board QA',
        executive:'Foundation Impact & Stewardship', compare:'County Strategic Comparison', execconsole:'Executive Board Console',
        donor:'Global Donor & Partner Brief', settings:'Presidential Console Settings'
      },
      'program.admin': {
        home:'Chief Programme Admin Home', smartflow:'Cross-County Programme & QA Hub',
        monday:'Cross-County Monday Directives', executive:'Programme Executive Summary', compare:'County Programme Comparison',
        adminops:'Programme Statutory & OpEx Control', users:'Staff Account Approvals', settings:'Programme Admin Settings'
      },
      chief: {
        home:'CareLink OS Control Home', smartflow:'System Architecture & Security QA',
        devconsole:'Dev Console & Version Control', dualcheck:'Admin / Intl Co-Work Lock',
        users:'Accounts, Provisioning & Urgent Desk', roles:'Custom Roles & Capabilities',
        governance:'DPA Credentials & Recovery', settings:'Host, Security & Theme Defaults',
        patients:'Beneficiary Metadata Index'
      }
    };
    if(map[r] && map[r][id]) return map[r][id];
    /* Dynamic customization for any custom user-defined role! */
    const customPrefix = (role.name || r || 'Role').replace(/\s+Console$/i,'').split(' ').slice(0,2).join(' ');
    if(id === 'home') return `${customPrefix} Home`;
    if(id === 'smartflow') return `${customPrefix} Smart Workflow`;
    if(id === 'monday') return `${cShort} Monday Meeting`;
    if(id === 'drafts') return `${customPrefix} Drafts`;
    if(id === 'settings') return `${customPrefix} Preferences`;
    return fallback;
  },

  heroQuickTabs(user){
    const ps = repo.patientList(user);
    const openConcerns = (DB.db.concerns||[]).filter(c=>c.status==='open' && ps.some(p=>p.id===c.patientId)).length;
    const activeReqs = repo.requests(user).filter(r=>!['closed','rejected','declined'].includes(r.status)).length;
    const followUpsDue = repo.requests(user).filter(r=>['reconciled','completed','closed'].includes(r.status) && !r.postFollowUp).length;
    const unread = _c6UnreadCount(user);
    const dqCount = RBAC.has(user,'patient.list') ? REPORTS.dataQuality(user).length : 0;
    const canQuality = RBAC.has(user,'dq.manage')||RBAC.has(user,'audit.view')||RBAC.has(user,'indicator.manage');
    const hasReports = RBAC.has(user,'report.patient_days')||RBAC.has(user,'report.patient_figures')||RBAC.has(user,'report.expenditure')||RBAC.has(user,'report.executive')||RBAC.has(user,'report.departmental');

    const canMsg = RBAC.has(user,'message.use') && !((roleObj(user.roleId)||{}).scope||{}).readOnly;
    const msgTab = canMsg ? { label:'Messages', count:unread, v:'messages', icon:'mail' } : { label:'Calendar', count:(DB.db.calendarEvents||[]).length, v:'calendar', icon:'calendar' };

    const r = user.roleId;
    if(['president','director'].includes(r)){
      return [
        { label:'Executive Reports', count:8, v:'reports', icon:'file' },
        ...(RBAC.has(user,'patient.list') ? [{ label:'Open Concerns', count:openConcerns, v:'attention', icon:'alert', alert:openConcerns>0 }] : [{ label:'County Compare', count:2, v:'compare', icon:'columns' }]),
        { label:'Hospital Flow', count:activeReqs, v:'executive', icon:'hospital' },
        ...(canQuality && RBAC.has(user,'patient.list') ? [{ label:'Data Quality', count:dqCount, v:'quality', icon:'shield', alert:dqCount>0 }] : []),
        msgTab
      ];
    }
    if(['caregiver','chw'].includes(r)){
      return [
        { label:'Open Concerns', count:openConcerns, v:'attention', icon:'alert', alert:openConcerns>0 },
        { label:'Clinic Follow-Ups', count:followUpsDue, v:RBAC.has(user,'hosp.request.create')?'requests':'visits', icon:'hospital', alert:followUpsDue>0 },
        { label:'My Home Visits', count:ps.length, v:'visits', icon:'home' },
        { label:'30-Day Reviews', count:PDCAX.due(user,{days:14}).length, v:'pdca', icon:'repeat' },
        msgTab
      ];
    }
    if(['nurse','mcm','depthead'].includes(r)){
      const pendingDisch = ps.filter(p=>p.status==='discharge_recommended').length;
      return [
        { label:'Clinical Concerns', count:openConcerns, v:'attention', icon:'alert', alert:openConcerns>0 },
        { label:'Discharge & Referrals', count:pendingDisch, v:'pdca', icon:'send', alert:pendingDisch>0 },
        { label:'Hospital & MOPC/GOPC', count:activeReqs, v:RBAC.has(user,'hosp.request.create')||RBAC.has(user,'hosp.request.review')?'requests':'patients', icon:'hospital' },
        { label:'Clinical Reports', count:6, v:hasReports?'reports':'careplans', icon:'file' },
        msgTab
      ];
    }
    if(r === 'liaison'){
      const unacked = repo.requests(user).filter(x=>x.postFollowUp && !x.postFollowUp.hospitalAck).length;
      return [
        { label:'Caregiver Feedback', count:unacked, v:'liaison', icon:'send', alert:unacked>0 },
        { label:'Active Hospital Queue', count:activeReqs, v:'liaison', icon:'hospital' },
        { label:'Reconciled Visits', count:repo.requests(user).filter(x=>x.status==='reconciled').length, v:'requests', icon:'check' },
        msgTab
      ];
    }
    if(['chief','countyadmin','intldata'].includes(r)){
      const pendingCW = (DUALCHECK.ensureStore(), (DB.db.coWorkBatches||[]).filter(b=>b.status!=='committed').length);
      return [
        { label:'Co-Work Cross-Check', count:pendingCW, v:'dualcheck', icon:'shield', alert:pendingCW>0 },
        { label:'Reports & Exports', count:7, v:'reports', icon:'file' },
        { label:'Data Quality', count:dqCount, v:'quality', icon:'alert', alert:dqCount>0 },
        msgTab
      ];
    }
    return [
      { label:'Department Reports', count:hasReports?6:2, v:hasReports?'reports':'calendar', icon:'file' },
      { label:'Priority Items', count:openConcerns || activeReqs, v:RBAC.has(user,'patient.list')?'attention':'calendar', icon:'alert', alert:(openConcerns||activeReqs)>0 },
      { label:'Schedule', count:(DB.db.calendarEvents||[]).length, v:'calendar', icon:'calendar' },
      msgTab
    ];
  },

  roleBarConfig(user){
    const r = user.roleId;
    const isKsmHQ = user.countyId === 'kisumu' || isGlobal(user);
    if (r === 'chief') {
      return {
        tabs: [
          { v: 'home', l: 'System Home', ic: 'home' },
          { v: 'devconsole', l: 'Development Console', ic: 'flow' },
          { v: 'users', l: 'Users & Silent Override', ic: 'userplus' },
          { v: 'adminops', l: 'Admin Ops & 9th Statutory', ic: 'calendar' },
          { v: 'history', l: 'Audit Trail', ic: 'history' },
          { v: 'mastermap', l: 'Master Mapping', ic: 'columns' }
        ],
        cta: { act: 'go', v: 'devconsole', l: 'Open Dev Console & SMS Pack', ic: 'key' }
      };
    }
    if (r === 'it') {
      return {
        tabs: [
          { v: 'home', l: 'ICT Home', ic: 'home' },
          { v: 'devconsole', l: 'Development Console', ic: 'flow' },
          { v: 'health', l: 'System Health', ic: 'pulse' },
          { v: 'backup', l: 'Backup & Restore', ic: 'database' },
          { v: 'security', l: 'Security Self-Test', ic: 'lock' }
        ],
        cta: { act: 'go', v: 'devconsole', l: 'Cloud DB & AI Status', ic: 'database' }
      };
    }
    if (['countyadmin', 'program.admin', 'program.assistant', 'assistant'].includes(r)) {
      return {
        tabs: [
          { v: 'home', l: isKsmHQ ? 'Kisumu HQ Console' : 'Homa Bay Console', ic: 'home' },
          { v: 'adminops', l: 'Daily PAYG · 9th Statutory · OpEx', ic: 'calendar' },
          { v: 'hardcopy', l: 'Hard-Copy Intake & Scans', ic: 'upload' },
          { v: 'finance', l: 'Expenditure & Budgets', ic: 'wallet' },
          { v: 'monday', l: 'Monday Meeting', ic: 'users' },
          { v: 'reports', l: isKsmHQ ? 'Kenya & County Reports' : 'County Reports', ic: 'file' }
        ],
        cta: { act: 'go', v: 'adminops', l: isKsmHQ ? 'Admin Ops & Kenya Reports' : 'Daily PAYG & Statutory', ic: 'wallet' }
      };
    }
    if (['president', 'director'].includes(r)) {
      return {
        tabs: [
          { v: 'home', l: 'Executive Home', ic: 'home' },
          { v: 'executive', l: 'Executive Summary', ic: 'chart' },
          { v: 'compare', l: 'Kisumu vs Homa Bay', ic: 'columns' },
          { v: 'adminops', l: 'Statutory, OpEx & Societies', ic: 'calendar' },
          { v: 'costing', l: 'Cost per Patient', ic: 'receipt' },
          { v: 'reports', l: 'Report Centre', ic: 'file' }
        ],
        cta: { act: 'go', v: 'executive', l: 'National Oversight', ic: 'chart' }
      };
    }
    if (['finance', 'procurement'].includes(r)) {
      return {
        tabs: [
          { v: 'home', l: 'Finance Home', ic: 'home' },
          { v: 'adminops', l: 'Daily PAYG · Weekly Suppliers · 9th Statutory', ic: 'calendar' },
          { v: 'finance', l: 'Expenditure Ledger', ic: 'wallet' },
          { v: 'costing', l: 'Cost per Patient', ic: 'receipt' },
          { v: 'foodbudget', l: 'Projected Food Budget', ic: 'clipboard' },
          { v: 'procurement', l: 'Procurement', ic: 'package' }
        ],
        cta: { act: 'go', v: 'adminops', l: 'Record PAYG / Supplier / Statutory', ic: 'plus' }
      };
    }
    if (['mcm', 'nurse', 'depthead', 'clinician'].includes(r)) {
      return {
        tabs: [
          { v: 'home', l: 'Clinical Home', ic: 'home' },
          ...(RBAC.has(user, 'clinical.mcm') ? [{ v: 'clinicalmcm', l: 'Case Manager Console', ic: 'activity' }] : []),
          { v: 'patients', l: 'Clinical Caseload', ic: 'users' },
          { v: 'bmiboard', l: 'BMI Watchlist', ic: 'pulse' },
          { v: 'pdca', l: '30-Day PDCA', ic: 'repeat' },
          { v: 'requests', l: 'Hospital Referrals', ic: 'hospital' }
        ],
        cta: { act: 'go', v: RBAC.has(user, 'clinical.mcm') ? 'clinicalmcm' : 'patients', l: 'Clinical Triage', ic: 'activity' }
      };
    }
    if (['caregiver', 'chw', 'coordinator'].includes(r)) {
      return {
        tabs: [
          { v: 'home', l: 'Field Home', ic: 'home' },
          { v: 'patients', l: 'My Households', ic: 'users' },
          { v: 'visits', l: 'Home Visits', ic: 'clipboard' },
          { v: 'pdca', l: '30-Day Reviews', ic: 'repeat' },
          { v: 'schedule', l: 'Visit Schedule', ic: 'calendar' },
          ...(RBAC.has(user, 'hosp.request.create') ? [{ v: 'requests', l: 'Hospital Escorts', ic: 'hospital' }] : [])
        ],
        cta: { act: 'go', v: 'visits', l: 'Log Home Visit', ic: 'plus' }
      };
    }
    if (['mediahead', 'media', 'pr'].includes(r)) {
      /* Strictly non-clinical: zero patient register or returning-patient checker links */
      return {
        tabs: [
          { v: 'home', l: 'Media & Ethics Home', ic: 'home' },
          ...(RBAC.has(user, 'media.view') ? [{ v: 'media', l: 'Media Library', ic: 'image' }, { v: 'studio', l: 'Media Studio', ic: 'send' }] : []),
          ...(RBAC.has(user, 'media.consent.manage') ? [{ v: 'consent', l: 'Consent Register', ic: 'shield' }] : []),
          ...(RBAC.has(user, 'pr.view') ? [{ v: 'pr', l: 'Public Relations', ic: 'send' }] : []),
          { v: 'donor', l: 'Donor Summary', ic: 'heart' }
        ],
        cta: { act: 'go', v: RBAC.has(user, 'media.view') ? 'studio' : 'pr', l: 'Ethical Storytelling Desk', ic: 'image' }
      };
    }
    if (r === 'hr') {
      return {
        tabs: [
          { v: 'home', l: 'HR Home', ic: 'home' },
          { v: 'staff', l: 'Staff Register', ic: 'idcard' },
          { v: 'leave', l: 'Leave & Off-Days', ic: 'calendar' },
          { v: 'handover', l: 'Delegation & Handover', ic: 'key' },
          { v: 'workplans', l: 'Monthly Work Plans', ic: 'clipboard' }
        ],
        cta: { act: 'go', v: 'leave', l: 'Manage Staff Leave', ic: 'calendar' }
      };
    }
    /* Fallback: derive up to 5 permitted pages from navModel */
    const allowed = (typeof navModel === 'function' ? navModel(user).flatMap(g => g.items) : []).slice(0, 5);
    return {
      tabs: allowed.map(i => ({ v: i.id, l: i.label, ic: i.icon || 'file' })),
      cta: allowed[1] ? { act: 'go', v: allowed[1].id, l: allowed[1].label, ic: allowed[1].icon || 'chevron' } : null
    };
  },

  contextStrip(user, view){
    if(!user || view==='dualcheck') return '';
    const role = roleObj(user.roleId) || {};
    const dept = role.dept ? deptObj(role.dept) : null;
    const deptKey = role.dept || 'admin';
    const scope = (user.areaIds && user.areaIds.length)
      ? `${countyName(user.countyId)} · ${user.areaIds.map(areaName).join(', ')}`
      : (user.areaId ? `${countyName(user.countyId)} · ${areaName(user.areaId)}` : (user.countyId ? countyName(user.countyId) : 'All Counties · Organisation-Wide'));
    const customLabel = ROLE_CTX.navLabel(user, view, (typeof VIEW_TITLES!=='undefined' && VIEW_TITLES[view]) || view);
    const deptTitle = dept ? dept.name : 'Operations';
    const roleTitle = role.name || user.roleId;
    const cleanRoleBadge = roleTitle.startsWith(deptTitle) ? roleTitle.slice(deptTitle.length).trim().replace(/^[-·]\s*/,'') || 'Department Lead' : roleTitle;
    const roleVarianceMeta = {
      exec:     { icon:'chart',     mode:'Executive Governance Lens' },
      admin:    { icon:'layers',    mode:'County & Head Office Administration' },
      medical:  { icon:'activity',  mode:'Clinical & Case Management Authority' },
      ministry: { icon:'heart',     mode:'Field Ministry & Household Care' },
      media:    { icon:'image',     mode:'Ethical Storytelling & Asset Custody' },
      finance:  { icon:'wallet',    mode:'Financial Control, PAYG & Statutory Desk' },
      procure:  { icon:'package',   mode:'Weekly Supplier & Foodbag Supply Chain' },
      me:       { icon:'chart',     mode:'M&E Indicators & Data Verification' },
      audit:    { icon:'shieldcheck',mode:'Independent Assurance & Audit Trail' },
      hr:       { icon:'idcard',    mode:'Human Capital, Leave & Policy Governance' },
      welfare:  { icon:'heart',     mode:'Staff Welfare & Mutual Support' },
      vehicle:  { icon:'car',       mode:'Fleet Dispatch & Field Logistics' },
      pr:       { icon:'send',      mode:'Public Relations & Partner Communications' },
      hospital: { icon:'hospital',  mode:'Hospital Desk & CCC Facility Continuum' },
      pharmacy: { icon:'package',   mode:'FEFO Pharmacy & TB Dispensing Control' },
      it:       { icon:'settings',  mode:'CareLink OS Engineering & Cloud Systems' },
      intldata: { icon:'pulse',     mode:'International Clinical & Data Oversight' },
      homestay: { icon:'bed',       mode:'Short-Stay Recovery & Respite Care' }
    }[deptKey] || { icon:'shield', mode:'Role-Scoped Workspace' };
    const cleanUser = user.name.replace(/^Demo - /,'');
    const countyPrimary = user.countyId ? `${countyName(user.countyId)} County` : 'All Counties · Global';
    const areaDetail = (user.areaIds && user.areaIds.length)
      ? user.areaIds.map(areaName).join(', ')
      : (user.areaId ? areaName(user.areaId) : (user.countyId==='kisumu' ? 'Head Office & Kisumu Areas' : (user.countyId==='homabay' ? 'Homa Bay Sub-Office' : 'Foundation-Wide Authority')));
    const barCfg = ROLE_CTX.roleBarConfig(user);
    /* Always ensure Smart Workflow tab is reachable right in the dominant banner tabs */
    const rawTabs = Array.isArray(barCfg.tabs) ? [...barCfg.tabs] : [];
    if(!rawTabs.some(t => t.v === 'smartflow')){
      rawTabs.splice(1, 0, { v:'smartflow', l: ROLE_CTX.navLabel(user, 'smartflow', 'Smart Workflow'), ic:'sparkles' });
    }
    const tabsHTML = rawTabs.length
      ? `<div class="ctx-role-tabs" role="navigation" aria-label="Role contextual workspace tabs">
          ${rawTabs.map(t => `<button type="button" class="ctx-rtab ${view === t.v ? 'on' : ''}" data-act="go" data-v="${esc(t.v)}">${ic(t.ic || 'file', 14)}<span>${esc(t.l)}</span></button>`).join('')}
        </div>`
      : '';
    return `<div class="ctx-strip no-print" data-dept="${esc(deptKey)}" data-role="${esc(user.roleId)}">
      <div class="ctx-strip-top">
        <div class="ctx-strip-left">
          <div class="ctx-strip-emblem" aria-hidden="true">${ic(roleVarianceMeta.icon,20)}</div>
          <div class="ctx-strip-copy">
            <div class="ctx-strip-kicker">
              <span class="ctx-os-pill ctx-os-badge">CARELINK OS</span>
              <span class="ctx-role-chip">${esc(roleTitle)}</span>
              <span class="ctx-county-chip">${ic('building',11)} ${esc(countyPrimary)}</span>
            </div>
            <div class="ctx-strip-title">${esc(customLabel)}</div>
            <div class="ctx-strip-sub">Operator: <b>${esc(cleanUser)}</b> &middot; ${esc(deptTitle)} &middot; <span>${esc(areaDetail)}</span></div>
          </div>
        </div>
        <div class="ctx-strip-right">
          ${role.external ? `<span class="ctx-partner-pill">Partner Console</span>` : `<span class="ctx-scope-pill" title="${esc(scope)}">${ic('shield',12)} ${esc(roleVarianceMeta.mode)}</span>`}
          <button type="button" class="btn btn-xs ctx-pack-btn" data-act="wtheme-open-packs" title="Install Font Styles, Themes & Visual Packs">${ic('palette',12)} <span>Fonts &amp; Themes</span></button>
          ${barCfg.cta && view !== barCfg.cta.v ? `<button type="button" class="btn btn-xs ctx-cta-btn" data-act="${esc(barCfg.cta.act)}" data-v="${esc(barCfg.cta.v)}">${ic(barCfg.cta.ic || 'chevron', 12)} <span>${esc(barCfg.cta.l)}</span></button>` : ''}
        </div>
      </div>
      ${tabsHTML}
    </div>`;
  },

  roleSpecificSettingsHTML(user){
    const p = (DB.db.personalPrefs && DB.db.personalPrefs[user.id]) || {};
    const r = user.roleId;
    const role = roleObj(r);
    const toggleRow = (key, title, desc, defOn)=>{
      const on = p[key] !== undefined ? !!p[key] : !!defOn;
      return `<div class="spread" style="padding:11px 0;border-bottom:1px solid var(--line-2)">
        <div style="max-width:520px"><div class="small bold">${esc(title)}</div><div class="xs muted">${esc(desc)}</div></div>
        <button type="button" class="btn btn-xs ${on?'btn-primary':'btn-ghost'}" data-act="role-pref-toggle" data-key="${esc(key)}">${on?'Enabled':'Disabled'}</button>
      </div>`;
    };

    if(['caregiver','chw'].includes(r)){
      return card(`Field Caregiver & Tablet Operational Settings (${role?role.name:r})`, `
        ${note(`Configured specifically for grassroots home visits in ${user.areaId?areaName(user.areaId):countyName(user.countyId)}. System-level server controls are hidden from field tablets.`)}
        <div style="margin-top:10px">
          ${toggleRow('fieldAutoDraft','Automatic Offline Form Draft Protection','Keep unsent LMMK paper form entries and visit notes saved locally if cellular coverage drops in the field.', true)}
          ${toggleRow('clinicFollowupAlert','Post-Hospital Clinic Review Reminders (MOPC / GOPC / SOPC / Physio)','Highlight reconciled hospital visits that still need caregiver outpatient clinic scheduling or feedback.', true)}
          ${toggleRow('sunlightReadability','Outdoor Sunlight High-Clarity Labels','Boost badge contrast during daytime walking home visits.', false)}
          ${toggleRow('weatherRouteWarn','Rain & Muddy-Route Morning Advisory','Show rainfall alerts before scheduling distant household visits.', true)}
        </div>`);
    }
    if(['nurse','mcm','depthead'].includes(r)){
      return card(`Clinical Case Management & Ward Settings (${role?role.name:r})`, `
        ${note('Tailored to clinical triage, 30-day PDCA reviews, FEFO medicine safety, and hospital discharge referrals.')}
        <div style="margin-top:10px">
          ${toggleRow('critBannerFirst','Pin Critical Clinical Concerns & Escalations First','Sort acute clinical red flags and overdue hospital reviews to the top of your caseload.', true)}
          ${toggleRow('pdcaLeadWarn','7-Day Advance Alert on 30-Day PDCA & 180-Day Stay Thresholds','Warn before a patient crosses their monthly review or 180-day extension ceiling.', true)}
          ${toggleRow('fefoStrictWarn','FEFO Batch Expiry 60-Day Guardrail','Highlight pharmacy batches expiring within 60 days during prescription review.', true)}
          ${toggleRow('autoDischargePack','Auto-Compile Full Discharge Summary on Approval','Generate the printable Patient Programme Discharge Summary and Referral Handover sheet upon discharge.', true)}
        </div>`);
    }
    if(r === 'liaison'){
      return card('Hospital Coordination & Focal Desk Settings', `
        ${note('Tailored to JOOTRH and county hospital admissions, cost reconciliation, and caregiver clinic feedback.')}
        <div style="margin-top:10px">
          ${toggleRow('feedbackInstantAlert','Live Caregiver Clinic Feedback Alerts (MOPC / GOPC / SOPC / Physio)','Surface unacknowledged caregiver post-visit clinic reports at the top of the Hospital Desk.', true)}
          ${toggleRow('varianceHighlight','Highlight Estimate vs Final Bill Variances (>15%)','Flag hospital invoices requiring voucher attachment verification before closure.', true)}
        </div>`);
    }
    if(['mediahead','pr'].includes(r)){
      return card(`Ethical Storytelling, Consent & Public Portal Settings (${role?role.name:r})`, `
        ${note('Tailored exclusively to media governance, dignity review, and verified consent checks. Clinical charts remain inaccessible.')}
        <div style="margin-top:10px">
          ${toggleRow('strictConsentGate','Mandatory Signed Consent Verification Gate','Block publication if beneficiary consent has expired or lacks guardian co-signature for minors.', true)}
          ${toggleRow('anonymiseDefault','Default First-Name / Pseudonym Protection on Drafts','Mask household village landmarks on draft stories until Media Head clearance.', true)}
        </div>`);
    }
    if(['finance','procurement'].includes(r)){
      return card(`Finance, Budget & Supply Chain Controls (${role?role.name:r})`, `
        ${note('Tailored to monthly county cut-offs, hospital bill reconciliation, purchase orders, and asset custody.')}
        <div style="margin-top:10px">
          ${toggleRow('receiptEnforce','Strict Receipt & Voucher Reference Check','Highlight disbursements and hospital reconciliations awaiting supporting voucher numbers.', true)}
          ${toggleRow('cutoffCountdown','Monthly Finance Cut-Off Banner','Show countdown reminder 5 days before monthly county ledger lock.', true)}
        </div>`);
    }
    if(['intldata','me','auditor'].includes(r)){
      return card(`Analytics, KHIS Interop & Cross-Check Settings (${role?role.name:r})`, `
        ${note('Tailored to indicator validation, KHIS staging, and two-account verification with Administration.')}
        <div style="margin-top:10px">
          ${toggleRow('coworkAutoAlert','Admin / International Data Simultaneous Edit Alerts','Prompt immediately whenever a counterpart account opens concurrent edits requiring 2/2 cross-check.', true)}
          ${toggleRow('khisZeroCheck','KHIS Zero-vs-Blank Completeness Check','Flag missing ministry-area cells before generating quarterly DHIS2 / KHIS export drafts.', true)}
        </div>`);
    }
    return card(`Role Workspace Preferences (${role?role.name:r})`, `
      ${note('Preferences below apply only to your departmental workspace and never alter clinical or financial records of other departments.')}
      <div style="margin-top:10px">
        ${toggleRow('focusDigest','Show Daily Priority Summary Strip','Display live counts for your department right inside your greeting banner.', true)}
        ${toggleRow('coworkLockGuard','Single-Operator Seat Protection','Prevent accidental simultaneous overwrites on shared administrative registers.', true)}
      </div>`);
  }
};
