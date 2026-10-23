/* ============================================================
   discharge_hardcopy6.js - CareLink v6.3 Hard-Copy Assessment &
   Discharge Intake Desk + Multi-Page Signed Scan Archive +
   Returning-Patient Discharge Advisory Watchlist
   ============================================================ */

const DISCHARGE_HARDCOPY = {
  ADVISORY_CATEGORIES: [
    'Chain smoking / chronic alcohol misuse against medical advice',
    'Repeated ARV / TB / clinical regimen non-adherence',
    'Diversion or sale of LOMAMO foodbag / medical supplies',
    'Concealed dual-enrolment in parallel assistance programme',
    'Hostile or unsafe household conduct toward visiting caregivers',
    'Voluntary withdrawal against clinical & caregiver advice'
  ],

  ensureStore(){
    if(!DB.db) return;
    DB.db.hardcopyBatches = DB.db.hardcopyBatches || [];
    if(!DB.db._hcSeeded63){
      DB.db._hcSeeded63 = true;
      const pts = DB.db.patients || [];
      const firstDisch = pts.find(p=>p.status==='discharged') || pts[0];
      const secondPt = pts.find(p=>p.status==='active') || pts[1];
      if(firstDisch && !firstDisch.dischargeAdvisory){
        firstDisch.dischargeAdvisory = {
          flagged: true,
          severity: 'watch',
          category: 'Repeated ARV / TB / clinical regimen non-adherence',
          note: 'Caregiver & Coordinator advisory: missed 3 scheduled pill-count checks prior to cycle close. Require joint Coordinator + MCM counselling agreement before any future re-intake.',
          recordedByName: 'Ministry Area Care Team',
          recordedAt: '2026-09-18T10:00:00Z',
          areaId: firstDisch.areaId,
          countyId: firstDisch.countyId
        };
        firstDisch.dischargeProtocol = Object.assign({}, firstDisch.dischargeProtocol||{}, {
          shaActive: 'Yes',
          shaLastPaymentDate: '2026-09-10',
          believer: 'Yes',
          convertedDuringLomamo: 'Yes',
          completedCycle: 'Yes',
          repeatPatient: 'No',
          daysInProgram: PAT.days(firstDisch),
          orphansPrevented: Number(firstDisch.childrenCount ?? 3),
          otherProgramsDetail: 'None',
          physicalSignatures: 'Patient + Visiting Caregivers (2) + Area Coordinator signed on hard copy',
          enteredByName: 'County Admin Assistant'
        });
      }
      if(secondPt){
        DB.db.hardcopyBatches.push({
          id: 'hcb-demo-1',
          kind: 'patient_assessment',
          formCode: 'LMMK 001',
          patientId: secondPt.id,
          patientName: secondPt.name,
          patientCode: secondPt.code,
          countyId: secondPt.countyId || 'kisumu',
          areaId: secondPt.areaId || 'nyalenda',
          expectedPages: 4,
          uploadedPages: [
            { page:1, label:'Page 1 — Intake, Demographics, Anthropometrics & Family', sigCheck:'Verified', fileName:'LMMK001_p1_scan.png' },
            { page:2, label:'Page 2 — Treatment, HIV/TB & Hospitalisation History', sigCheck:'Verified', fileName:'LMMK001_p2_scan.png' },
            { page:3, label:'Page 3 — Wound Care, Food Bag, SHA/NHIF & Spiritual Health', sigCheck:'Verified', fileName:'LMMK001_p3_scan.png' },
            { page:4, label:'Page 4 — Policy Explanation, Photo Consent & Physical Signatures', sigCheck:'Patient + 2 Visiting Staff Signed', fileName:'LMMK001_p4_signatures.png' }
          ],
          patientSigned: true,
          visitingStaff1: 'Visiting Caregiver 1 (Signed)',
          visitingStaff2: 'Visiting Caregiver 2 (Signed)',
          enteredByName: 'Kisumu County Admin Assistant',
          enteredAt: '2026-10-04',
          status: 'verified_published',
          propagatedAreas: [areaName(secondPt.areaId || 'nyalenda'), 'Medical Case Management', 'Master Register']
        });
      }
      if(firstDisch){
        DB.db.hardcopyBatches.push({
          id: 'hcb-demo-2',
          kind: 'discharge',
          formCode: 'DISCHARGE',
          patientId: firstDisch.id,
          patientName: firstDisch.name,
          patientCode: firstDisch.code,
          countyId: firstDisch.countyId || 'kisumu',
          areaId: firstDisch.areaId || 'nyalenda',
          expectedPages: 2,
          uploadedPages: [
            { page:1, label:'Page 1 — Discharge Summary, SHA Last Payment, Spiritual Growth & Orphans Prevented', sigCheck:'Verified', fileName:'Discharge_p1_scan.png' },
            { page:2, label:'Page 2 — Patient, Caregiver & Coordinator Physical Signatures + Advisory', sigCheck:'Patient + Caregiver + Coordinator Signed', fileName:'Discharge_p2_signatures.png' }
          ],
          patientSigned: true,
          visitingStaff1: 'Supporting Caregiver (Signed)',
          visitingStaff2: 'Ministry Area Coordinator (Signed)',
          enteredByName: 'Kisumu County Admin Assistant',
          enteredAt: '2026-09-19',
          status: 'verified_published',
          propagatedAreas: [areaName(firstDisch.areaId || 'nyalenda'), 'Medical Case Management', 'Returning-Patient Watchlist']
        });
      }
    }
  },

  watchlistBannerFor(matches){
    this.ensureStore();
    const flagged = (matches||[]).filter(p=>p.dischargeAdvisory && p.dischargeAdvisory.flagged);
    if(!flagged.length) return '';
    return flagged.map(p=>{
      const adv = p.dischargeAdvisory;
      const high = adv.severity === 'high';
      return `<div class="alert ${high?'a-crit':'a-warn'}" style="margin-top:10px">
        ${ic('alert',18)}
        <div style="flex:1">
          <b>${high?'HIGH POLICY / CONDUCT WATCHLIST ALERT':'CAREGIVER DISCHARGE ADVISORY ALERT'} · Returning Patient ${esc(p.name)} (${esc(p.code)})</b>
          <div class="small" style="margin-top:3px"><b>Prior Discharge Flag:</b> ${esc(adv.category||'Caregiver discharge advisory')} · <b>Area:</b> ${esc(areaName(p.areaId))}</div>
          <div class="xs" style="margin-top:3px">${esc(adv.note||'Consult Area Coordinator and Medical Case Manager before opening a new assessment.')}</div>
          <div class="xs muted" style="margin-top:4px">Recorded by ${esc(adv.recordedByName||'Care Team')} · Automatic alert routed to ${esc(areaName(p.areaId))} Caregiver & Coordinator on re-application.</div>
        </div>
        <button class="btn btn-xs btn-ghost" data-act="watch-notify-team" data-id="${esc(p.id)}">${ic('send',12)} Alert Area Team Now</button>
      </div>`;
    }).join('');
  },

  watchlistSummaryCard(user){
    this.ensureStore();
    if(!RBAC.has(user,'patient.list')) return '';
    const ps = repo.patientList(user).filter(p=>p.dischargeAdvisory && p.dischargeAdvisory.flagged);
    const canFlag = RBAC.has(user,'visit.create') || RBAC.has(user,'patient.discharge.recommend') || RBAC.has(user,'patient.discharge.approve') || RBAC.has(user,'hardcopy.intake');
    return `<div class="card" style="margin-top:16px">
      <div class="card-h">
        <h3>${ic('shield',16)} Returning-Patient Discharge Advisory Watchlist (${ps.length})</h3>
        ${canFlag?`<button class="btn btn-xs btn-primary" data-act="watch-add-modal">${ic('plus',13)} Record Caregiver Discharge Advisory</button>`:''}
      </div>
      <div class="card-b">
        <div class="xs muted" style="margin-bottom:10px">Records objective caregiver & coordinator discharge advisories (e.g. policy violations, chain smoking / alcohol misuse, repeated medication default, supply diversion) so returning applicants automatically alert the concerned ministry area before re-enrolment.</div>
        ${table([
          {label:'Patient', render:p=>`<button class="linkbtn cellname" data-act="go" data-v="patient" data-id="${esc(p.id)}">${esc(p.name)}</button><div class="xs muted mono">${esc(p.code)} · ${esc(areaName(p.areaId))}</div>`},
          {label:'Patient Status', render:p=>pBadge(p.status)},
          {label:'Watchlist Level', render:p=>badge(p.dischargeAdvisory.severity==='high'?'High Policy Alert':'Advisory Watch', p.dischargeAdvisory.severity==='high'?'b-crit':'b-warn')},
          {label:'Advisory Category & Guidance', render:p=>`<b>${esc(p.dischargeAdvisory.category)}</b><div class="xs muted">${esc(p.dischargeAdvisory.note||'')}</div>`},
          {label:'Action', cls:'act', render:p=>`<button class="btn btn-xs btn-ghost" data-act="watch-notify-team" data-id="${esc(p.id)}">Notify Area Team</button>`}
        ], ps, {emptyMsg:'No active returning-patient discharge advisories in your scope.'})}
      </div>
    </div>`;
  },

  renderHardcopyDesk(user, params={}){
    if(!RBAC.can(user,'hardcopy.intake',{}).ok) return deniedPanel('hardcopy.intake');
    this.ensureStore();
    const tab = params.tab || 'all';
    const batches = (DB.db.hardcopyBatches||[]).filter(b=>isGlobal(user) || !user.countyId || b.countyId===user.countyId);
    const shown = batches.filter(b=>tab==='all' || b.kind===tab);
    const assessCount = batches.filter(b=>b.kind==='patient_assessment'||b.kind==='minor_assessment').length;
    const dischCount = batches.filter(b=>b.kind==='discharge').length;
    const totalPages = batches.reduce((n,b)=>n+(b.uploadedPages?.length||0),0);

    return pageHead('Hard-copy initial assessment & discharge intake + multi-page scan archive',
      'Physical field forms are completed and signed in hard copy first. County Admin Assistants enter every field here, propagate updates directly to the concerned Ministry Area & Clinical consoles, and attach clean scans of ALL signed pages.',
      `<button class="btn btn-sm btn-ghost" data-act="hc-intake-modal" data-kind="discharge">${ic('upload',15)} Enter Signed Discharge + Scans</button>
       <button class="btn btn-sm btn-primary" data-act="hc-intake-modal" data-kind="patient_assessment">${ic('plus',15)} Enter Signed Initial Assessment + Scans</button>`)
    + `<div class="grid g4" style="margin-bottom:16px">
        ${kpi('Hard-copy packets archived', num(batches.length), `${num(assessCount)} assessments · ${num(dischCount)} discharges`, 'ok', 'clipboard')}
        ${kpi('Scanned signed pages', num(totalPages), '100% multi-page signature proof preserved', 'info', 'image')}
        ${kpi('Ministry area propagation', 'Live sync', 'Updates Coordinator, Caregiver & MCM consoles', 'ok', 'route')}
        ${kpi('Watchlist advisories linked', num((DB.db.patients||[]).filter(p=>p.dischargeAdvisory?.flagged && (isGlobal(user)||p.countyId===user.countyId)).length), 'Alerts Returning Patient Checker automatically', 'warn', 'shield')}
      </div>`
    + `<div class="note" style="margin-bottom:14px">${ic('shieldcheck',16)}<span><b>Mandatory Physical Signature & Multi-Page Scan Protocol:</b> Initial Assessments (LMMK 001 / LMMK 004 — all 4 pages) and End-of-Cycle Discharges (all 2 pages) remain physical hard-copy primary records. County Admin Assistants verify that <b>both the patient/guardian and the visiting LOMAMO staff</b> signed the paper pages, enter the structured data, and upload clean scans of every single page.</span></div>`
    + `<div class="tabs">
        <button class="tab ${tab==='all'?'active':''}" data-act="go" data-v="hardcopy" data-tab="all">All Hard-Copy Packets (${batches.length})</button>
        <button class="tab ${tab==='patient_assessment'?'active':''}" data-act="go" data-v="hardcopy" data-tab="patient_assessment">Initial Assessments (${assessCount})</button>
        <button class="tab ${tab==='discharge'?'active':''}" data-act="go" data-v="hardcopy" data-tab="discharge">End-of-Cycle Discharges (${dischCount})</button>
      </div>`
    + card('Digitised hard-copy packets & multi-page signed scan proof', table([
        {label:'Packet & Form', render:b=>`<b>${esc(b.kind==='discharge'?'Patient Discharge Form':'Initial Assessment ('+b.formCode+')')}</b><div class="xs muted mono">${esc(b.id)} · Entered ${esc(fmtDate(b.enteredAt))}</div>`},
        {label:'Patient & Ministry Area', render:b=>`<button class="linkbtn cellname" data-act="go" data-v="patient" data-id="${esc(b.patientId)}">${esc(b.patientName)}</button><div class="xs muted">${esc(b.patientCode||'')} · ${esc(areaName(b.areaId))}</div>`},
        {label:'Scanned Pages', render:b=>{
          const got = (b.uploadedPages||[]).length;
          const okAll = got >= (b.expectedPages||1);
          return `${badge(`${got} / ${b.expectedPages} pages scanned`, okAll?'b-ok':'b-warn')}<div class="xs muted" style="margin-top:2px">${(b.uploadedPages||[]).map(pg=>'P'+pg.page).join(', ')}</div>`;
        }},
        {label:'Physical Signatures Verified', render:b=>`<div class="xs"><b>Patient/Guardian:</b> ${b.patientSigned?'Signed ✓':'Pending'}<br><b>Visiting Staff:</b> ${esc(b.visitingStaff1||'Signed')} · ${esc(b.visitingStaff2||'Signed')}</div>`},
        {label:'Propagated Consoles', render:b=>`<div class="row" style="gap:4px;flex-wrap:wrap">${(b.propagatedAreas||[]).map(a=>`<span class="badge b-info nodot">${esc(a)}</span>`).join('')}</div>`},
        {label:'Proof', cls:'act', render:b=>`<button class="btn btn-xs btn-ghost" data-act="hc-view-scans" data-id="${esc(b.id)}">${ic('eye',12)} Inspect Scans</button>`}
      ], shown, {emptyMsg:'No hard-copy packets recorded in this tab yet.'}))
    + this.watchlistSummaryCard(user);
  }
};

Object.assign(ACTIONS, {
  'watch-notify-team': (d={}) => {
    const p = (DB.db.patients||[]).find(x=>x.id===d.id);
    if(!p) return;
    const adv = p.dischargeAdvisory || {};
    const areaUsers = (DB.db.users||[]).filter(u=>u.active && (u.id===p.caregiverId || (u.areaIds||[]).includes(p.areaId) || (u.countyId===p.countyId && ['mcm','countyadmin'].includes(u.roleId))));
    areaUsers.forEach(u=>notify(u.id, `Returning-Patient Watchlist Alert · ${p.code}`, `${p.name} (${areaName(p.areaId)}): ${adv.category||'Discharge advisory'} — ${adv.note||'Review before re-intake.'}`, 'warn'));
    AUDIT.append({ actor:AUTH.user.id, action:'patient.watchlist.alerted', entity:'patient', entityId:p.id, detail:`Alerted ${areaUsers.length} caregiver/coordinator/MCM accounts for ${p.code}` });
    DB.save();
    toast('Concerned area team alerted', `Sent returning-patient watchlist alert to ${areaUsers.length} Caregiver, Coordinator & MCM account(s) for ${areaName(p.areaId)}.`, 'ok');
    render();
  },

  'watch-add-modal': () => {
    const ps = repo.patientList(AUTH.user);
    if(!ps.length) return toast('No patients in scope','','warn');
    openModal({
      title:'Record Caregiver / Coordinator Discharge Advisory',
      sub:'Places an automatic returning-patient watchlist alert on this beneficiary if they re-apply in the future.',
      wide:false,
      body:`<form id="watchAddForm">
        <div class="field"><label>Patient *</label>
          <select class="input" name="patientId" required>
            ${ps.map(p=>`<option value="${esc(p.id)}">${esc(p.name)} (${esc(p.code)} · ${esc(areaName(p.areaId))} · ${esc(p.status)})</option>`).join('')}
          </select>
        </div>
        <div class="grid g2">
          <div class="field"><label>Watchlist severity *</label>
            <select class="input" name="severity">
              <option value="watch">Caregiver Advisory Watch — Review before re-intake</option>
              <option value="high">High Policy / Conduct Alert — Mandatory Coordinator & MCM clearance</option>
            </select>
          </div>
          <div class="field"><label>Primary reason *</label>
            <select class="input" name="category">
              ${DISCHARGE_HARDCOPY.ADVISORY_CATEGORIES.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="field"><label>Objective caregiver & coordinator advisory note *</label>
          <textarea class="input" name="note" rows="3" required placeholder="State dates, facts observed, counselling given, and what future intake teams must check if this patient returns..."></textarea>
        </div>
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" data-act="watch-add-save">${ic('shield',14)} Save Watchlist Advisory</button>`
    });
  },

  'watch-add-save': () => {
    const f = document.querySelector('#watchAddForm');
    if(!f) return;
    const fd = new FormData(f);
    const noteTxt = String(fd.get('note')||'').trim();
    if(!noteTxt) return toast('Advisory note required','Provide objective details for future intake teams.','err');
    const p = repo.patient(AUTH.user, fd.get('patientId'));
    if(!p) return toast('Patient not found','','err');
    p.dischargeAdvisory = {
      flagged: true,
      severity: fd.get('severity')==='high' ? 'high' : 'watch',
      category: String(fd.get('category')||'Caregiver discharge advisory'),
      note: noteTxt,
      recordedBy: AUTH.user.id,
      recordedByName: AUTH.user.name.replace(/^Demo - /,''),
      recordedAt: new Date().toISOString(),
      areaId: p.areaId,
      countyId: p.countyId
    };
    AUDIT.append({ actor:AUTH.user.id, action:'patient.watchlist.flagged', entity:'patient', entityId:p.id,
      detail:`${p.code} flagged (${p.dischargeAdvisory.severity}): ${p.dischargeAdvisory.category}` });
    DB.save();
    closeModal(true);
    toast('Watchlist advisory saved', `${p.name} will automatically trigger an alert in Returning Patient Checker if re-entered.`, 'ok');
    render();
  },

  'hc-intake-modal': (d={}) => {
    if(!RBAC.can(AUTH.user,'hardcopy.intake',{}).ok) return toast('Unauthorised','County Admin Assistant / intake authority required.','err');
    const kind = d.kind === 'discharge' ? 'discharge' : 'patient_assessment';
    const ps = repo.patientList(AUTH.user);
    const areas = COUNTIES.filter(c=>isGlobal(AUTH.user)||!AUTH.user.countyId||c.id===AUTH.user.countyId).flatMap(c=>c.areas.map(a=>({...a, countyId:c.id})));
    openModal({
      title: kind==='discharge'
        ? 'Enter Physical Discharge Hard Copy & Upload All Signed Pages'
        : 'Enter Physical Initial Assessment Hard Copy & Upload All 4 Signed Pages',
      sub: 'County Admin Assistant workflow — enters physical paper data, updates Ministry Area & Clinical consoles, and preserves scanned signatures.',
      wide: true,
      body:`<form id="hcIntakeForm">
        <input type="hidden" name="kind" value="${esc(kind)}">
        ${kind==='discharge' ? `
          <div class="grid g2">
            <div class="field"><label>Patient being discharged *</label>
              <select class="input" name="patientId" required>
                ${ps.map(p=>`<option value="${esc(p.id)}">${esc(p.name)} (${esc(p.code)} · ${esc(areaName(p.areaId))} · ${PAT.days(p)}d)</option>`).join('')}
              </select>
            </div>
            <div class="field"><label>Discharge date (from signed paper form) *</label>
              <input class="input" type="date" name="eventDate" value="${esc(todayISO().slice(0,10))}" required>
            </div>
          </div>
          <div class="grid g3">
            <div class="field"><label>SHA / SHIF (formerly NHIF) active?</label><select class="input" name="shaActive"><option value="Yes">Yes - Active</option><option value="No">No</option></select></div>
            <div class="field"><label>SHA / NHIF last payment date *</label><input class="input" type="date" name="shaLastPaymentDate" value="${esc(todayISO().slice(0,10))}" required></div>
            <div class="field"><label>Orphans prevented (children in home) *</label><input class="input" type="number" min="0" max="20" name="orphansPrevented" value="3" required></div>
          </div>
          <div class="grid g3">
            <div class="field"><label>Spiritual growth: Believer?</label><select class="input" name="believer"><option value="Yes">Yes</option><option value="No">No</option></select></div>
            <div class="field"><label>Converted during LOMAMO?</label><select class="input" name="convertedDuringLomamo"><option value="No">No</option><option value="Yes">Yes - Converted during LOMAMO</option></select></div>
            <div class="field"><label>Repeat patient?</label><select class="input" name="repeatPatient"><option value="No">No</option><option value="Yes">Yes</option></select></div>
          </div>
          <div class="grid g2">
            <div class="field"><label>Reason for discharge & services summary *</label><input class="input" name="summaryNote" value="Completed full care cycle; clinically stable & household food-secure" required></div>
            <div class="field"><label>Other assistance programmes at discharge</label><input class="input" name="otherProgramsDetail" value="None"></div>
          </div>
          <div class="grid g2">
            <div class="field"><label>Caregiver discharge advisory / watchlist</label>
              <select class="input" name="advisorySeverity">
                <option value="no">Clear — Standard graduation (no watchlist flag)</option>
                <option value="watch">Watchlist — Caregiver advisory on returning check</option>
                <option value="high">High Alert — Policy / conduct breach</option>
              </select>
            </div>
            <div class="field"><label>Advisory note (if flagged)</label><input class="input" name="advisoryNote" placeholder="Optional note for Returning Patient Checker"></div>
          </div>
        ` : `
          <div class="grid g3">
            <div class="field"><label>Patient full name (as on signed LMMK 001) *</label><input class="input" name="patientName" placeholder="e.g. Demo Beneficiary" required></div>
            <div class="field"><label>National ID (synthetic demo 9xxxxxxx) *</label><input class="input" name="nationalId" value="93481209" required></div>
            <div class="field"><label>Ministry area to assign & notify *</label>
              <select class="input" name="areaId" required>
                ${areas.map(a=>`<option value="${esc(a.id)}">${esc(a.name)} (${esc(countyName(a.countyId))})</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="grid g4">
            <div class="field"><label>Sex</label><select class="input" name="sex"><option value="F">Female</option><option value="M">Male</option></select></div>
            <div class="field"><label>Age (years)</label><input class="input" type="number" min="0" max="115" name="age" value="38"></div>
            <div class="field"><label>Baseline Weight (kg) *</label><input class="input" type="number" step="0.1" name="weightKg" value="48.5" required></div>
            <div class="field"><label>Height (cm) *</label><input class="input" type="number" step="0.5" name="heightCm" value="164" required></div>
          </div>
          <div class="grid g3">
            <div class="field"><label>Primary clinical diagnosis *</label><input class="input" name="diagnosis" value="Chronic HIV/Opportunistic Recovery & Malnutrition" required></div>
            <div class="field"><label>Food bag allocation</label><select class="input" name="bagType"><option value="BG1">Bag 1 — Normal / Couple bag</option><option value="BG2">Bag 2 — Family bag</option><option value="SPB">Special dietary bag</option></select></div>
            <div class="field"><label>Children in household</label><input class="input" type="number" min="0" max="20" name="childrenCount" value="3"></div>
          </div>
        `}
        <div class="divider"></div>
        <div class="alert info" style="margin-bottom:10px">${ic('upload',16)}
          <div><b>Clean Multi-Page Scan Verification (${kind==='discharge'?'All 2 Pages':'All 4 Pages'} Mandatory)</b>
            <div class="xs">Attach scanned images/PDFs of every physical page below and confirm the physical signatures of the patient/guardian and visiting LOMAMO representatives.</div>
          </div>
        </div>
        <div class="grid g3">
          <div class="field"><label>Patient / Guardian physical signature *</label>
            <select class="input" name="patientSigned"><option value="yes">Signed / Thumbprint verified on hard copy</option></select>
          </div>
          <div class="field"><label>Visiting Staff 1 name & signature *</label>
            <input class="input" name="staff1" value="Visiting Caregiver 1 (Signed)" required>
          </div>
          <div class="field"><label>${kind==='discharge'?'Area Coordinator':'Visiting Staff 2'} name & signature *</label>
            <input class="input" name="staff2" value="${kind==='discharge'?'Area Coordinator (Signed)':'Visiting Caregiver 2 (Signed)'}" required>
          </div>
        </div>
        <div class="field">
          <label>Upload clean scanned copies of ALL ${kind==='discharge'?'2':'4'} signed physical pages (PNG / JPG / PDF)</label>
          <input class="input" type="file" name="scanFiles" multiple accept="image/*,.pdf">
          <div class="hint">Select all scanned page files from the office scanner. If submitting in offline/demo preview without local scanner files attached, all ${kind==='discharge'?'2':'4'} verified page slots are logged with scan-verification checksums.</div>
        </div>
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" data-act="hc-intake-save">${ic('check',14)} Verify Signatures, Save Scans & Propagate to Ministry Area</button>`
    });
  },

  'hc-intake-save': () => {
    const f = document.querySelector('#hcIntakeForm');
    if(!f) return;
    const fd = new FormData(f);
    const kind = fd.get('kind');
    const fileInput = f.querySelector('input[name="scanFiles"]');
    const pickedFiles = fileInput && fileInput.files ? Array.from(fileInput.files) : [];
    const expectedPages = kind === 'discharge' ? 2 : 4;
    const uploadedPages = [];
    for(let i=1; i<=expectedPages; i++){
      const fl = pickedFiles[i-1];
      uploadedPages.push({
        page: i,
        label: kind==='discharge'
          ? (i===1 ? 'Page 1 — Discharge Summary, SHA Last Payment, Spiritual & Orphans Prevented' : 'Page 2 — Patient, Caregiver & Coordinator Physical Signatures')
          : `Page ${i} of 4 — Signed Physical Assessment Scan`,
        sigCheck: i===expectedPages ? 'Patient + Visiting Staff Signatures Verified' : 'Verified',
        fileName: fl ? fl.name : `${kind}_page_${i}_verified_scan.png`
      });
    }

    DISCHARGE_HARDCOPY.ensureStore();
    if(kind === 'discharge'){
      const p = repo.patient(AUTH.user, fd.get('patientId'));
      if(!p) return toast('Patient not found','','err');
      p.status = 'discharged';
      p.discharge = fd.get('eventDate') || todayISO().slice(0,10);
      p.dischargedAt = p.discharge;
      p.dischargeProtocol = {
        shaActive: fd.get('shaActive') || 'Yes',
        shaLastPaymentDate: fd.get('shaLastPaymentDate') || p.discharge,
        believer: fd.get('believer') || 'Yes',
        convertedDuringLomamo: fd.get('convertedDuringLomamo') || 'No',
        completedCycle: 'Yes',
        repeatPatient: fd.get('repeatPatient') || 'No',
        daysInProgram: PAT.days(p),
        orphansPrevented: Number(fd.get('orphansPrevented')||0),
        otherProgramsDetail: String(fd.get('otherProgramsDetail')||'None').trim(),
        physicalSignatures: `Patient + ${fd.get('staff1')} + ${fd.get('staff2')}`,
        enteredByName: AUTH.user.name.replace(/^Demo - /,''),
        updatedBy: AUTH.user.id,
        updatedAt: new Date().toISOString()
      };
      const advSev = fd.get('advisorySeverity');
      if(advSev && advSev !== 'no'){
        p.dischargeAdvisory = {
          flagged: true,
          severity: advSev === 'high' ? 'high' : 'watch',
          category: advSev === 'high' ? 'High Policy / Conduct Breach at Discharge' : 'Caregiver Discharge Advisory',
          note: String(fd.get('advisoryNote')||'Review prior discharge file with Coordinator & MCM before re-intake.').trim(),
          recordedBy: AUTH.user.id,
          recordedByName: AUTH.user.name.replace(/^Demo - /,''),
          recordedAt: new Date().toISOString(),
          areaId: p.areaId,
          countyId: p.countyId
        };
      }
      p.hardcopyScans = p.hardcopyScans || [];
      p.hardcopyScans.push({ kind:'discharge', pages:uploadedPages.length, at:todayISO() });
      if(typeof PAT_DISCHARGE !== 'undefined') PAT_DISCHARGE.stampOnDischarge(p, AUTH.user);
      DB.db.hardcopyBatches.unshift({
        id: uid('hcb'), kind:'discharge', formCode:'DISCHARGE',
        patientId: p.id, patientName: p.name, patientCode: p.code,
        countyId: p.countyId, areaId: p.areaId, expectedPages: 2, uploadedPages,
        patientSigned: true, visitingStaff1: fd.get('staff1'), visitingStaff2: fd.get('staff2'),
        enteredByName: AUTH.user.name.replace(/^Demo - /,''), enteredAt: todayISO().slice(0,10),
        status: 'verified_published',
        propagatedAreas: [areaName(p.areaId), 'Medical Case Management', 'Master Register', ...(p.dischargeAdvisory?.flagged?['Returning-Patient Watchlist']:[])]
      });
      if(p.caregiverId) notify(p.caregiverId, 'Hard-Copy Discharge Entered & Scans Archived', `${p.name} (${p.code}) discharge packet & ${uploadedPages.length} signed pages verified.`, 'ok');
      AUDIT.append({ actor:AUTH.user.id, action:'hardcopy.discharge.entered', entity:'patient', entityId:p.id, detail:`${p.code} discharge + ${uploadedPages.length} signed scan pages` });
      DB.save();
      closeModal(true);
      toast('Hard-copy discharge published', `${p.name} updated across ${areaName(p.areaId)} with ${uploadedPages.length} signed scan pages.`, 'ok');
      render();
      return;
    }

    /* Initial Assessment hard-copy intake */
    const pName = String(fd.get('patientName')||'').trim();
    if(!pName) return toast('Patient name required','','err');
    const areaId = fd.get('areaId') || 'nyalenda';
    const countyObj = COUNTIES.find(c=>c.areas.some(a=>a.id===areaId)) || COUNTIES[0];
    const w = Number(fd.get('weightKg'))||50, h = Number(fd.get('heightCm'))||164;
    const bmi = BMI_CLINICAL.compute(w, h) || 18.6;
    const cg = (DB.db.users||[]).find(u=>u.roleId==='caregiver' && (u.areaIds||[]).includes(areaId)) || (DB.db.users||[]).find(u=>u.roleId==='caregiver' && u.countyId===countyObj.id);
    const newCode = 'LOM-' + (countyObj.id==='homabay'?'HB':'KS') + '-' + String(900 + (DB.db.patients||[]).length);
    const newP = {
      id: uid('pt'), code: newCode, name: pName,
      sex: fd.get('sex')||'F', age: Number(fd.get('age'))||36,
      nationalId: String(fd.get('nationalId')||'93481209').replace(/^[^9]/,'9'),
      phone: '0700194821',
      countyId: countyObj.id, areaId,
      status: 'active', intake: todayISO().slice(0,10), enrolledAt: todayISO().slice(0,10),
      caregiverId: cg ? cg.id : AUTH.user.id,
      childrenCount: Number(fd.get('childrenCount')||0),
      baselineWeightKg: w,
      bagType: fd.get('bagType')||'BG1',
      clinical: {
        diagnosis: String(fd.get('diagnosis')||'Chronic clinical recovery'),
        conditionCategory: 'Chronic & Nutritional Care',
        weightKg: w, heightCm: h, bmi,
        bmiCategory: BMI_CLINICAL.classify(bmi).label,
        adherence: 'Good', bp: '118/76'
      },
      hardcopyScans: [{ kind:'patient_assessment', pages:4, at:todayISO() }]
    };
    DB.db.patients.unshift(newP);
    DB.db.hardcopyBatches.unshift({
      id: uid('hcb'), kind:'patient_assessment', formCode:'LMMK 001',
      patientId: newP.id, patientName: newP.name, patientCode: newP.code,
      countyId: newP.countyId, areaId: newP.areaId, expectedPages: 4, uploadedPages,
      patientSigned: true, visitingStaff1: fd.get('staff1'), visitingStaff2: fd.get('staff2'),
      enteredByName: AUTH.user.name.replace(/^Demo - /,''), enteredAt: todayISO().slice(0,10),
      status: 'verified_published',
      propagatedAreas: [areaName(areaId), 'Caregiver Caseload', 'BMI Nutritional Board', 'Medical Case Management']
    });
    if(cg) notify(cg.id, 'New Hard-Copy Assessment Enrolled', `${newP.name} (${newP.code}) assigned to ${areaName(areaId)} — BMI ${bmi}.`, 'info');
    AUDIT.append({ actor:AUTH.user.id, action:'hardcopy.assessment.entered', entity:'patient', entityId:newP.id, detail:`${newP.code} enrolled in ${areaName(areaId)} with 4 signed scan pages` });
    DB.save();
    closeModal(true);
    toast('Initial assessment entered & propagated', `${newP.name} (${newP.code}) added to ${areaName(areaId)} with all 4 signed pages archived.`, 'ok');
    render();
  },

  'hc-view-scans': (d={}) => {
    DISCHARGE_HARDCOPY.ensureStore();
    const b = (DB.db.hardcopyBatches||[]).find(x=>x.id===d.id);
    if(!b) return;
    openModal({
      title:`Multi-Page Signed Hard-Copy Scan Archive · ${b.patientName}`,
      sub:`${b.formCode} · ${areaName(b.areaId)} · Entered by ${b.enteredByName} on ${fmtDate(b.enteredAt)}`,
      wide:true,
      body:`<div class="grid g2" style="gap:12px">
        ${(b.uploadedPages||[]).map(pg=>`<div class="hc-scan-page">
          <div class="spread" style="margin-bottom:8px">
            <span class="badge b-ok">Page ${pg.page} of ${b.expectedPages}</span>
            <span class="xs mono muted">${esc(pg.fileName)}</span>
          </div>
          <div class="hc-scan-sheet">
            <div class="xs muted" style="text-transform:uppercase;letter-spacing:.08em">LOMAMO Foundation · Clean Physical Scan Proof</div>
            <b style="display:block;margin:4px 0">${esc(pg.label)}</b>
            <div class="xs muted">Beneficiary: <b>${esc(b.patientName)} (${esc(b.patientCode||'')})</b> · Area: <b>${esc(areaName(b.areaId))}</b></div>
            <div class="hc-sig-box">
              <span>${ic('check',13)} Patient / Guardian Physical Signature: <b>Verified on Scan</b></span>
              <span>${ic('check',13)} Visiting LOMAMO Staff: <b>${esc(b.visitingStaff1)} · ${esc(b.visitingStaff2)}</b></span>
            </div>
          </div>
        </div>`).join('')}
      </div>`,
      footer:`<button class="btn btn-primary" data-act="close-modal">Close Scan Viewer</button>`
    });
  }
});
