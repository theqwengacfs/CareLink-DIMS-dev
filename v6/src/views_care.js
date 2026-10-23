/* ============================================================
   views_care.js - Care centre, condition register, delegation,
   donor summary and the care-plan review screens.

   The care centre is deliberately not a second hospital console.
   It is an operational unit: beds, daily care, handover, meals,
   safeguarding, cleaning and maintenance, with its own authority
   separate from clinical records.
   ============================================================ */

function renderCare(user){
  if(!RBAC.has(user,'care.view')) return deniedPanel('care.view');
  const occ = CARE.occupancy(user);
  const residents = CARE.residents(user);
  const logs = CARE.logs(user).slice(0,8);
  const incidents = CARE.incidents(user);
  const openIncidents = incidents.filter(i=>i.status==='open');
  const today = new Date().toISOString().slice(0,10);
  const todayLogs = CARE.logs(user).filter(l=>l.at.slice(0,10)===today);

  const shifts = ['Morning','Afternoon','Evening'].map(s=>{
    const done = residents.filter(r=>todayLogs.some(l=>l.residentId===r.id && l.shift===s)).length;
    return { shift:s, done, total:residents.length };
  });

  return `${pageHead('Care centre', 'Homestay and respite care, separated from the hospital workflow and from clinical records.',
      RBAC.has(user,'care.log')?`<button class="btn btn-primary btn-sm" data-act="care-log">${ic('plus',15)} Record daily care</button>`:'')}
    <div class="grid g4" style="margin-bottom:16px">
      ${kpi('Beds occupied', `${occ.occupied}<span class="small muted"> of ${occ.beds}</span>`, `${occ.rate}% occupancy`, '', 'bed')}
      ${kpi('Residents', residents.length, 'Receiving residential or respite care', '', 'users')}
      ${kpi('Daily records today', todayLogs.length, `Across ${shifts.filter(s=>s.done).length} of 3 shifts`, todayLogs.length?'':'warn', 'clipboard')}
      ${kpi('Open incidents', openIncidents.length, openIncidents.length?'Requires safeguarding follow-up':'None open', openIncidents.length?'crit':'ok', 'shield')}
    </div>

    <div class="grid g2" style="margin-bottom:16px">
      ${card('Beds', `<div class="bed-grid">${CARE.beds(user).map(b=>{
        const r = residents.find(x=>x.bedId===b.id);
        return `<div class="bed ${r?'occupied':''}">
          <div class="n">${esc(b.label)}</div>
          <div class="s">${esc(b.room)} · ${esc(b.type)}</div>
          <div class="s" style="margin-top:6px">${r?badge('Occupied','b-ok'):badge('Available','b-neutral')}</div>
          ${r?`<div class="xs" style="margin-top:6px">${esc(r.patient.code)}</div>`:''}
        </div>`;
      }).join('')}</div>`, {sub:'Live bed state. A resident is linked to a patient record, never duplicated.'})}
      ${card('Today\'s handover', shifts.map(s=>`
        <div style="margin-bottom:13px">
          <div class="spread" style="margin-bottom:5px"><span class="small bold">${esc(s.shift)}</span>
            <span class="xs muted">${s.done} of ${s.total} residents recorded</span></div>
          ${progressBar(s.done, s.total||1, s.done===s.total&&s.total?'ok':'')}
        </div>`).join('') + `<div class="note" style="margin-top:12px">${ic('info',14)}<span>Handover is a written record, not a message. Each entry names the shift, the person and the time.</span></div>`,
        {sub:'Three shifts per day. The evening handover is due at '+esc(String(DB.db.settings.care?.handoverHour||19))+':00.'})}
    </div>

    <div class="grid g2">
      ${card('Residents', table([
        {label:'Resident', render:r=>`<b>${esc(r.patient.code)}</b><div class="xs muted">${esc(r.patient.areaId?areaName(r.patient.areaId):'')}</div>`},
        {label:'Bed', render:r=>esc(r.bedId.replace('bed-','B'))},
        {label:'Key worker', render:r=>esc(userName(r.keyWorker))},
        {label:'Next review', render:r=>{
          const d = Math.round((new Date(r.nextReview)-Date.now())/86400000);
          return d<0? badge('Overdue '+Math.abs(d)+'d','b-crit') : d<=7? badge('Due in '+d+'d','b-warn') : `<span class="small">${esc(r.nextReview.slice(0,10))}</span>`;
        }},
        {label:'', cls:'right', render:r=>`<button class="btn btn-ghost btn-sm" data-act="go" data-v="care-resident" data-id="${r.id}">Open</button>`}
      ], residents), {sub:'Only residents whose patient record you may see.'})}
      ${card('Latest daily entries', logs.length? `<div class="care-log">${logs.map(l=>{
        const r = residents.find(x=>x.id===l.residentId);
        return `<div class="care-entry"><div class="t">${esc(l.at.slice(11,16))}<div class="xs muted">${esc(l.shift)}</div></div>
          <div><div class="k">${esc(r?r.patient.code:'Resident')}</div>
            <div class="small">Ate ${esc(l.eaten)} · fluids ${esc(l.fluids)} · mood ${esc(l.mood)}</div>
            ${l.note?`<div class="xs muted" style="margin-top:3px">${esc(l.note)}</div>`:''}</div>
          <div class="xs muted">${esc(userName(l.by))}</div></div>`;
      }).join('')}</div>` : emptyState('No entries yet','Daily care entries appear here as they are recorded.','clipboard'), {sub:'Written entries, newest first.'})}
    </div>

    ${RBAC.has(user,'care.incident')?`<div style="margin-top:16px">${card('Safeguarding and incidents',
      incidents.length? table([
        {label:'When', render:i=>esc(i.at.slice(0,10))},
        {label:'Resident', render:i=>esc((residents.find(r=>r.id===i.residentId)||{}).patient?.code||'-')},
        {label:'Type', render:i=>esc(i.type)},
        {label:'Severity', render:i=>badge(titleCase(i.severity), i.severity==='high'||i.severity==='serious'?'b-crit':i.severity==='moderate'?'b-warn':'b-neutral')},
        {label:'Status', render:i=>badge(titleCase(i.status), i.status==='open'?'b-warn':'b-ok')},
        {label:'', cls:'right', render:i=>i.status==='open'?`<button class="btn btn-ghost btn-sm" data-act="care-incident-close" data-id="${i.id}">Close</button>`:''}
      ], incidents) : emptyState('No incidents recorded','Safeguarding entries are restricted to roles with care incident authority.','shield'),
      {sub:'Restricted register. Reading or writing an entry is auditable.', actions:`<button class="btn btn-ghost btn-sm" data-act="care-incident">${ic('plus',14)} Report incident</button>`})}</div>`:''}
  `;
}

function renderCareResident(user, params){
  if(!RBAC.has(user,'care.view')) return deniedPanel('care.view');
  const r = CARE.resident(user, params.id);
  if(!r) return emptyState('Resident not found','This resident is not in your scope, or the record has been discharged.','users');
  const logs = CARE.logs(user, r.id);
  const conds = COND.list(user, r.patientId);
  const plan = PDCAX.plan(r.patient);
  const incs = CARE.incidents(user).filter(i=>i.residentId===r.id);

  return `${pageHead('Care centre · '+r.patient.code, `Bed ${r.bedId.replace('bed-','B')} · admitted ${r.admittedAt.slice(0,10)} · key worker ${userName(r.keyWorker)}`,
      `<button class="btn btn-ghost btn-sm" data-act="go" data-v="patient" data-id="${r.patientId}">Patient record</button>
       ${RBAC.has(user,'care.log')?`<button class="btn btn-primary btn-sm" data-act="care-log" data-id="${r.id}">${ic('plus',14)} Daily entry</button>`:''}`)}
    <div class="grid g4" style="margin-bottom:16px">
      ${kpi('Mobility', esc(r.mobility), 'Recorded at admission', '', 'activity')}
      ${kpi('Diet', esc(r.diet), 'Current support', '', 'heart')}
      ${kpi('Next review', esc(r.nextReview.slice(0,10)), Math.round((new Date(r.nextReview)-Date.now())/86400000)+' days', '', 'calendar')}
      ${kpi('Conditions recorded', conds.rows.length, conds.withheld? `${conds.withheld} withheld from your role`:'Visible to your role', '', 'clipboard')}
    </div>
    <div class="grid g2">
      ${card('Care plan', plan? `
        <div class="grid" style="gap:12px">
          <div><div class="k xs muted">IDENTIFIED NEED</div><div class="small">${esc(plan.needs)}</div></div>
          <div><div class="k xs muted">OBJECTIVE</div><div class="small">${esc(plan.objectives)}</div></div>
          <div><div class="k xs muted">PLANNED INTERVENTION</div><div class="small">${esc(plan.interventions)}</div></div>
          <div class="row" style="gap:20px"><div><div class="k xs muted">RESPONSIBLE</div><div class="small">${esc(userName(plan.responsible))}</div></div>
          <div><div class="k xs muted">EXPECTED DURATION</div><div class="small">${plan.expectedDays} days</div></div>
          <div><div class="k xs muted">VERSION</div><div class="small">v${plan.version}</div></div></div>
          <div class="xs muted">${esc(plan.rationale)}</div>
        </div>` : emptyState('No care plan recorded','A care plan is required at enrolment. This is a data-quality finding, not a blank page.','alert'))}
      ${card('Conditions', conds.allowed
        ? (conds.rows.length
            ? table([
                {label:'Condition', render:c=>`${esc(c.label)}${c.sensitive?' '+badge('Sensitive','b-warn'):''}`},
                {label:'Status', render:c=>badge(CONDITION_STATUS[c.status]||c.status, c.status==='confirmed'?'b-ok':c.status==='suspected'?'b-warn':'b-neutral')},
                {label:'Recorded by', render:c=>esc(userName(c.recordedBy))},
                {label:'', cls:'right', render:c=>!c.confirmedBy && RBAC.has(user,'condition.confirm')
                  ? `<button class="btn btn-ghost btn-sm" data-act="condition-confirm" data-id="${c.id}">Confirm</button>`
                  : (c.confirmedBy?`<span class="xs muted">${esc(userName(c.confirmedBy))}</span>`:'')}
              ], conds.rows)
            : emptyState('No conditions recorded','Conditions are recorded deliberately, never inferred from symptoms or medication.','clipboard'))
        : note('Your role may not view clinical conditions.'),
        conds.allowed ? { sub: conds.withheld? `${conds.withheld} sensitive condition${conds.withheld===1?'':'s'} withheld from your role.`:'',
          actions: RBAC.has(user,'condition.record')?`<button class="btn btn-ghost btn-sm" data-act="condition-record" data-id="${r.patientId}">${ic('plus',14)} Record</button>`:'' } : {})}
    </div>
    <div class="grid g2" style="margin-top:16px">
      ${card('Daily care record', logs.length? table([
        {label:'Date', render:l=>esc(l.at.slice(0,10))},
        {label:'Shift', render:l=>esc(l.shift)},
        {label:'Ate', render:l=>esc(l.eaten)},
        {label:'Mood', render:l=>esc(l.mood)},
        {label:'By', render:l=>esc(userName(l.by))}
      ], logs) : emptyState('No entries','Record the first daily entry.','clipboard'))}
      ${RBAC.has(user,'care.incident')? card('Incidents for this resident', incs.length? incs.map(i=>
        `<div style="padding:10px 0;border-bottom:1px solid var(--line-2)">
          <div class="spread"><b class="small">${esc(i.type)}</b>${badge(titleCase(i.status), i.status==='open'?'b-warn':'b-ok')}</div>
          <div class="xs muted" style="margin-top:3px">${esc(i.at.slice(0,10))} · ${esc(i.severity)} · reported by ${esc(userName(i.reportedBy))}</div>
          <div class="small" style="margin-top:4px">${esc(i.actions)}</div>
        </div>`).join('') : emptyState('No incidents','Nothing recorded for this resident.','shield')) : ''}
    </div>
    ${!plan? `<div class="alert warn" style="margin-top:14px">${ic('alert',16)}<div><b>Care plan missing</b>
      <span class="small">A patient in the care centre must have an initial care plan. This appears in the data-quality report until it is recorded.</span></div></div>`:''}
  `;
}

function renderCareIncidents(user){
  if(!RBAC.has(user,'care.incident')) return deniedPanel('care.incident');
  const incs = CARE.incidents(user);
  const residents = CARE.residents(user);
  return `${pageHead('Safeguarding register','Incidents in the care centre, restricted to roles with safeguarding authority.',
      `<button class="btn btn-primary btn-sm" data-act="care-incident">${ic('plus',15)} Report incident</button>`)}
    ${card('Register', table([
      {label:'When', render:i=>esc(i.at.slice(0,10))},
      {label:'Resident', render:i=>esc((residents.find(r=>r.id===i.residentId)||{}).patient?.code||'-')},
      {label:'Type', render:i=>esc(i.type)},
      {label:'Severity', render:i=>badge(titleCase(i.severity), ['high','serious'].includes(i.severity)?'b-crit':i.severity==='moderate'?'b-warn':'b-neutral')},
      {label:'Action taken', render:i=>`<span class="small">${esc(i.actions)}</span>`},
      {label:'Status', render:i=>badge(titleCase(i.status), i.status==='open'?'b-warn':'b-ok')},
      {label:'', cls:'right', render:i=>i.status==='open'?`<button class="btn btn-ghost btn-sm" data-act="care-incident-close" data-id="${i.id}">Close</button>`:''}
    ], incs), {sub:'Reading this register is recorded. Entries cannot be deleted, only closed with a resolution.'})}
    <div class="note" style="margin-top:14px">${ic('info',14)}<span>This register supports safeguarding practice. It is not a substitute for the organisation's approved safeguarding policy, which must be adopted before production use.</span></div>`;
}

/* ------------------------------------------------------------------ */
function renderConditions(user){
  const canAgg = RBAC.has(user,'condition.aggregate')||RBAC.has(user,'condition.sensitive');
  if(!canAgg) return deniedPanel('condition.aggregate');
  const counties = COUNTIES.filter(c=>isGlobal(user)||c.id===user.countyId);
  const countyId = APPX.params.countyId || (isGlobal(user)?'all':user.countyId);
  const agg = COND.aggregate(user,{countyId});
  const patients = repo.patientList(user,{countyId:countyId==='all'?null:countyId});

  const withCond = new Set((DB.db.patientConditions||[]).map(c=>c.patientId));
  const coverage = patients.length? Math.round(100*patients.filter(p=>withCond.has(p.id)).length/patients.length):0;

  return `${pageHead('Condition register','Recorded conditions across the patients you may see, with small-group suppression applied.',
      `<select class="input input-sm" data-set="cond-county" style="width:auto">
        ${isGlobal(user)?`<option value="all" ${countyId==='all'?'selected':''}>Both counties</option>`:''}
        ${counties.map(c=>`<option value="${c.id}" ${countyId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}
      </select>`)}
    <div class="grid g4" style="margin-bottom:16px">
      ${kpi('Patients in scope', patients.length, 'Verified register', '', 'users')}
      ${kpi('With a recorded condition', patients.filter(p=>withCond.has(p.id)).length, coverage+'% coverage', coverage<80?'warn':'ok', 'clipboard')}
      ${kpi('Conditions recorded', agg.rows.reduce((a,r)=>a+(r.n||0),0), 'Excludes withheld categories', '', 'layers')}
      ${kpi('Small groups suppressed', agg.suppressed, 'Fewer than five patients', '', 'shield')}
    </div>
    <div class="grid g2">
      ${card('Distribution', chartRows({ rows:agg.rows.map(r=>({label:r.label, value:r.n===null?5:r.n})), unit:'patients',
        title:'Recorded conditions' }), {sub: agg.note || 'Counts are of patients, not episodes. A patient with two conditions appears twice.'})}
      ${card('Register', table([
        {label:'Condition', render:r=>`${esc(r.label)}${r.sensitive?' '+badge('Sensitive','b-warn'):''}`},
        {label:'Classification', render:r=>esc((COND.def(r.key)||{}).cls||'-')},
        {label:'Patients', cls:'right', render:r=>r.n===null?`<span class="small muted">${esc(r.band)}</span>`:`<b>${r.n}</b>`}
      ], agg.rows), {sub:'Sensitive categories are only counted for roles with explicit authority.'})}
    </div>
    ${!agg.maySeeSensitive? `<div class="note" style="margin-top:14px">${ic('shield',14)}<span>HIV, tuberculosis, co-infection, cancer and cryptococcal meningitis are withheld from this view. They are not zero; they are not shown.</span></div>`:''}
  `;
}

/* ------------------------------------------------------------------ */
function renderDelegation(user){
  if(!RBAC.has(user,'delegation.manage') && !(DELEGATION.forUser(user).length)) return deniedPanel('delegation.manage');
  const issued = DELEGATION.issuedBy(user);
  const received = DELEGATION.forUser(user);
  const active = received.filter(d=>d.status==='active');
  const candidates = DB.db.users.filter(u=>u.status==='active' && u.id!==user.id &&
    (isGlobal(user) || u.countyId===user.countyId));
  const myCaps = RBAC.expandedPerms(user.roleId).filter(c=>CAPS[c]);

  return `${pageHead('Delegation','Time-bound authority given to a named colleague. Never a shared password.',
      RBAC.has(user,'delegation.manage')?`<button class="btn btn-primary btn-sm" data-act="delegation-issue">${ic('plus',15)} Issue delegation</button>`:'')}
    ${active.length? `<div class="alert info" style="margin-bottom:16px">${ic('info',16)}<div><b>You are acting under delegated authority</b>
      <span class="small">${active.map(d=>`${esc(d.caps.map(c=>capLabel(c)).join(', '))} from ${esc(d.fromName)} until ${esc(d.to.slice(0,10))}`).join('; ')}. The delegation expires automatically and every action remains recorded against your own name.</span></div></div>`:''}
    <div class="grid g2">
      ${card('Authority you have issued', issued.length? table([
        {label:'Delegate', render:d=>`<b>${esc(userName(d.delegateId))}</b>`},
        {label:'Responsibilities', render:d=>`<span class="small">${esc(d.caps.map(c=>capLabel(c)).join(', '))}</span>`},
        {label:'Window', render:d=>`<span class="small">${esc(d.from.slice(0,10))} to ${esc(d.to.slice(0,10))}</span>`},
        {label:'Status', render:d=>badge(titleCase(d.status), d.status==='active'?'b-ok':d.status==='expired'?'b-neutral':'b-warn')},
        {label:'', cls:'right', render:d=>d.status==='active'?`<button class="btn btn-ghost btn-sm" data-act="delegation-revoke" data-id="${d.id}">Revoke</button>`:''}
      ], issued) : emptyState('Nothing issued','Use a delegation to cover planned absence without sharing credentials.','key'))}
      ${card('Authority delegated to you', received.length? table([
        {label:'From', render:d=>esc(d.fromName)},
        {label:'Responsibilities', render:d=>`<span class="small">${esc(d.caps.map(c=>capLabel(c)).join(', '))}</span>`},
        {label:'Until', render:d=>esc(d.to.slice(0,10))},
        {label:'Status', render:d=>badge(titleCase(d.status), d.status==='active'?'b-ok':'b-neutral')}
      ], received) : emptyState('Nothing delegated to you','Your permissions are your own role permissions.','key'))}
    </div>
    <div class="note" style="margin-top:14px">${ic('shield',14)}<span>A delegation can only contain responsibilities the delegating officer holds, lasts no longer than 120 days, and is withdrawn the moment it is revoked or expires. It never transfers identity: the audit trail records both people.</span></div>
  `;
}

/* ------------------------------------------------------------------
   Donor summary: programme reach without a single identity.
   Only verified figures are shown; every line states its definition
   and its source, and an explicit limitations block follows.
   ------------------------------------------------------------------ */
function donorFigures(user){
  const counties = COUNTIES.filter(c=>isGlobal(user)||c.id===user.countyId);
  const countyId = APPX.params?.countyId || (isGlobal(user)?'all':user.countyId);
  const patients = DB.db.patients.filter(p=>
    (countyId==='all'||p.countyId===countyId) && RBAC.patientVisible(user,p));
  const ids = new Set(patients.map(p=>p.id));
  const visits = DB.db.visits.filter(v=>ids.has(v.patientId));
  const closed = DB.db.requests.filter(r=>ids.has(r.patientId) && r.status==='closed');
  const support = DB.db.supportIssues.filter(s=>ids.has(s.patientId));
  const active = patients.filter(p=>p.status==='active'||p.status==='extension');
  const discharged = patients.filter(p=>p.status==='discharged');
  const withPlan = patients.filter(p=>p.carePlan).length;
  let finance = null;
  try{
    if(RBAC.has(user,'finance.view')||RBAC.has(user,'report.expenditure')){
      const e = REPORTS.expenditure(user,{countyId});
      finance = e.tot;
    }
  }catch(err){ finance = null; }
  return { counties, countyId, patients, active, discharged, visits, closed, support, withPlan, finance };
}

function renderDonor(user){
  const f = donorFigures(user);
  const period = APPX.params?.period || '2026-H2';
  const cname = f.countyId==='all'? 'Both county offices' : countyName(f.countyId);

  return `${pageHead('Donor summary', `${esc(cname)} · period ${esc(period)}. Aggregate only. No patient is identifiable anywhere in this view.`,
      `<button class="btn btn-ghost btn-sm" data-act="print">${ic('download',14)} Print or save as PDF</button>`)}
    <div class="grid g4" style="margin-bottom:16px">
      ${kpi('Patients in the programme', num(f.patients.length), 'Verified register', '', 'users')}
      ${kpi('Currently receiving care', num(f.active.length), 'Status active or extended', '', 'heart')}
      ${kpi('Discharged through the programme', num(f.discharged.length), 'Documented discharge only', '', 'check')}
      ${kpi('Home visits recorded', num(f.visits.length), 'All visits, verified', '', 'activity')}
    </div>

    <div class="grid g2">
      ${card('Reach by ministry area', chartRows({
        rows: f.counties.flatMap(c=>c.areas.map(a=>({
          label:a.name, value:f.patients.filter(p=>p.areaId===a.id).length
        }))).filter(r=>r.value>0),
        title:'Patients by ministry area', unit:'patients' }),
        {sub:'A patient is counted once, in the ministry area that holds their record.'})}
      ${card('Support delivered', table([
        {label:'Item', render:r=>esc(r.item)},
        {label:'Quantity', cls:'right', render:r=>`<b>${r.qty}</b>`},
        {label:'Ministry areas reached', cls:'right', render:r=>String(new Set(f.patients.filter(p=>f.support.some(s=>s.patientId===p.id&&s.item===r.item)).map(p=>p.areaId)).size)}
      ], Object.values(f.support.reduce((a,s)=>{ (a[s.item]=a[s.item]||{item:s.item,qty:0}).qty+=s.qty; return a; },{}))),
        {sub:'From recorded distribution, not from a plan.'})}
    </div>

    <div class="grid g2" style="margin-top:16px">
      ${card('Referrals and hospital coordination', `
        <div class="sync-row"><span>Referrals recorded</span><b>${num(DB.db.requests.filter(r=>f.patients.some(p=>p.id===r.patientId)).length)}</b></div>
        <div class="sync-row"><span>Closed with a clinical report</span><b>${num(f.closed.length)}</b></div>
        <div class="sync-row"><span>Care plans on file</span><b>${num(f.withPlan)} of ${num(f.patients.length)}</b></div>
        <div class="sync-row"><span>Patients with a recorded condition</span><b>${num(new Set((DB.db.patientConditions||[]).filter(c=>f.patients.some(p=>p.id===c.patientId)).map(c=>c.patientId)).size)}</b></div>`)}
      ${card('Resources', f.finance? `
        <div class="sync-row"><span>Approved budget</span><b>${money(f.finance.budget)}</b></div>
        <div class="sync-row"><span>Committed</span><b>${money(f.finance.committed||0)}</b></div>
        <div class="sync-row"><span>Paid and reconciled</span><b>${money(f.finance.paid)}</b></div>
        <div class="sync-row"><span>Remaining</span><b>${money(f.finance.remaining)}</b></div>`
        : note('Financial figures are shown only to roles with financial authority. They are not withheld from this summary because they are secret, but because they are outside your remit.'))}
    </div>

    ${card('What these figures do and do not say', `
      <div class="grid g2" style="gap:16px">
        <div><b class="small">The figures are</b><ul class="small muted" style="margin:6px 0 0 18px;padding:0;line-height:1.65">
          <li>counts of verified records in this installation</li>
          <li>for the period and county shown at the top</li>
          <li>produced from the same source as the Monday management reports</li></ul></div>
        <div><b class="small">The figures are not</b><ul class="small muted" style="margin:6px 0 0 18px;padding:0;line-height:1.65">
          <li>a claim that a health outcome was caused by a service</li>
          <li>a count of people reached outside the registered caseload</li>
          <li>complete where records are missing, and missing records are shown above, not hidden</li></ul></div>
      </div>
      <div class="note" style="margin-top:14px">${ic('shield',14)}<span>No name, photograph, patient code, diagnosis or narrative appears in this summary. Patient stories require separate, documented consent and governance approval before any use.</span></div>`)}
  `;
}

/* ============================================================
   Studio - media production and publishing
   One register, seven editorial states. Publication is a state
   transition with a named approver, not a checkbox.
   ============================================================ */
const EDITORIAL_STATES = ['draft','review','approved','scheduled','published','unpublished','archived'];
function pubBadge(st){
  const map={draft:'b-neutral',review:'b-warn',approved:'b-info',scheduled:'b-info',published:'b-ok',unpublished:'b-crit',archived:'b-neutral'};
  return badge(titleCase(st), map[st]||'b-neutral');
}
function renderStudio(user){
  const items = (DB.db.publications||[]).slice().sort((a,b)=>new Date(b.updatedAt||b.createdAt||0)-new Date(a.updatedAt||a.createdAt||0));
  const mine = items.filter(p=>p.createdBy===user.id);
  const count = st => items.filter(p=>p.status===st).length;
  const canApprove = RBAC.has(user,'media.publish');
  return pageHead('Media studio',
    'Production, editorial review and publication in one register. Nothing reaches the public portal until an authorised person publishes it.',
    `<button class="btn btn-sm btn-primary" data-act="new-publication">${ic('plus',15)} New item</button>`)
  + `<div class="grid g5" style="margin-bottom:16px">
      ${kpi('Drafts', num(count('draft')),'Not submitted','','file')}
      ${kpi('In review', num(count('review')),'Awaiting editorial decision',count('review')?'warn':'','eye')}
      ${kpi('Approved', num(count('approved')),'Ready to publish',count('approved')?'ok':'','check')}
      ${kpi('Published', num(count('published')),'Live on the public portal','ok','send')}
      ${kpi('Scheduled', num(count('scheduled')),'With a publication date',count('scheduled')?'info':'','calendar')}
    </div>`
  + `<div class="grid g2">
      ${card('Editorial register', table([
        {label:'Item',render:p=>`<div class="cellname">${esc(p.title)}<span class="sm">${esc(titleCase(p.category))}${p.duration?' · '+esc(p.duration):''} · ${esc(p.ownerLabel||userName(p.createdBy))}</span></div>`},
        {label:'State',render:p=>pubBadge(p.status)},
        {label:'Public',render:p=>p.public?badge('Listed','b-ok','nodot'):badge('Withheld','b-neutral','nodot')},
        {label:'Updated',render:p=>`<span class="small">${fmtDate(p.updatedAt||p.createdAt)}</span>`},
        {label:'',cls:'act',render:p=>`<button class="btn btn-xs btn-ghost" data-act="publication-open" data-id="${p.id}">Open</button>`}
      ], items, {empty:emptyState('Nothing in production','Create a news item, story, video feature, audio piece or announcement.','image')}),
        {sub:'Seven states: draft, review, approved, scheduled, published, unpublished, archived.'})}
      ${card('Publication rules', `<div class="col" style="gap:10px">
        <div class="row" style="gap:8px;align-items:flex-start"><span style="color:var(--ok);flex:0 0 16px">${ic('check',15)}</span><span class="small">Only the state <b>published</b> appears on the public portal, and only when the item is marked public.</span></div>
        <div class="row" style="gap:8px;align-items:flex-start"><span style="color:var(--ok);flex:0 0 16px">${ic('check',15)}</span><span class="small">Approval requires the publication authority. The person who creates an item may not approve it alone if policy requires a second person.</span></div>
        <div class="row" style="gap:8px;align-items:flex-start"><span style="color:var(--ok);flex:0 0 16px">${ic('check',15)}</span><span class="small">A story about a patient must carry a recorded, unwithdrawn storytelling consent. The rule is checked again at the moment of publication.</span></div>
        <div class="row" style="gap:8px;align-items:flex-start"><span style="color:var(--warn);flex:0 0 16px">${ic('alert',15)}</span><span class="small">Withdrawing consent pulls a published item automatically. Nothing is deleted; the item becomes unpublished with the reason recorded.</span></div>
        <div class="divider"></div>
        <div class="xs muted">${items.length} items in the register · ${mine.length} created by you · ${count('published')} live${canApprove?' · you may approve':' · you may not approve'}</div>
      </div>`)}
    </div>`;
}

/* ============================================================
   Presence and internal messaging
   Presence is derived from a heartbeat that only the signed-in
   person can send for themselves. Messaging is deliberately not
   a place for clinical detail: an obvious patient identifier is
   refused and the person is pointed at the protected workflow.
   ============================================================ */
const PRESENCE_STATES = [
  { id:'online', label:'Online', tone:'ok' },
  { id:'away',   label:'Away',   tone:'warn' },
  { id:'busy',   label:'Busy',   tone:'crit' },
  { id:'offline',label:'Offline',tone:'' }
];

function presenceOf(userId){
  const p = (DB.db.presence||{})[userId];
  if(!p || !p.at) return { state:'offline', label:'Offline', tone:'', minutes:null };
  const mins = Math.floor((Date.now()-new Date(p.at).getTime())/60000);
  if(mins < 2) return { state:'online', label:'Online', tone:'ok', minutes:mins };
  if(mins < 15) return { state:'away', label:'Away '+mins+' min', tone:'warn', minutes:mins };
  return { state:'offline', label:'Offline', tone:'', minutes:mins };
}
function presenceTag(userId){
  const p = presenceOf(userId);
  const colour = p.tone==='ok'?'var(--ok)':p.tone==='warn'?'#D28A00':p.tone==='crit'?'var(--crit)':'var(--muted-2)';
  return `<span class="presence" title="${esc(p.label)}"><i style="background:${colour}"></i>${esc(p.label)}</span>`;
}

function messageThreads(user){
  const msgs = DB.db.messages||[];
  const mine = msgs.filter(m=>m.to.includes(user.id)||m.from===user.id);
  const map = new Map();
  mine.forEach(m=>{
    if(!map.has(m.thread)) map.set(m.thread, { thread:m.thread, kind:m.kind, msgs:[] });
    map.get(m.thread).msgs.push(m);
  });
  return [...map.values()].map(t=>({
    ...t,
    msgs:t.msgs.sort((a,b)=>new Date(a.at)-new Date(b.at)),
    last: t.msgs[t.msgs.length-1],
    unread: t.msgs.filter(m=>m.from!==user.id && !(m.readBy||[]).includes(user.id)).length
  })).sort((a,b)=>new Date(b.last.at)-new Date(a.last.at));
}

function renderMessages(user, params={}){
  const threads = messageThreads(user);
  const activeId = params.thread || threads[0]?.thread || null;
  const active = threads.find(t=>t.thread===activeId)||null;
  const colleagues = DB.db.users.filter(u=>MESSAGING.inReach(user,u));
  const online = colleagues.filter(u=>presenceOf(u.id).state==='online');
  const flagged = RBAC.has(user,'hr.view')? (DB.db.messages||[]).filter(m=>m.flagged) : [];
  const threadLabel = t => {
    if(t.kind==='dept') return { title:deptName(t.thread.replace('dept:','')), sub:'Department channel' };
    const other = t.msgs.find(m=>m.from!==user.id)?.from || t.msgs[0]?.to.find(x=>x!==user.id);
    return { title:userName(other||''), sub:'Direct message' };
  };
  return pageHead('Messages', 'Internal communication for coordination. Patient-specific detail belongs in the patient record, not in a chat.',
    PAGER.record(threads.map(t=>({id:t.thread,label:threadLabel(t).title})), activeId, 'messages','thread','','Conversation')+`<button class="btn btn-sm btn-primary" data-act="compose-message">${ic('plus',15)} New message</button>`)
  + `<div class="grid g4" style="margin-bottom:16px">
      ${kpi('Unread', num(threads.reduce((n,t)=>n+t.unread,0)),'Across your conversations',threads.some(t=>t.unread)?'warn':'ok','bell')}
      ${kpi('Colleagues online', num(online.length),'In your county or organisation','ok','users')}
      ${kpi('Conversations', num(threads.length),'Direct and departmental','','send')}
      ${RBAC.has(user,'hr.view')? kpi('Flagged for review', num(flagged.length),'By the local assistant, pending a person',flagged.length?'warn':'','alert') : kpi('Messages sent', num((DB.db.messages||[]).filter(m=>m.from===user.id).length),'By you, in all conversations','','send')}
    </div>`
  + `<div class="msg-layout">
      <aside class="msg-list">
        <div class="msg-list-h">Conversations</div>
        ${threads.length? threads.map(t=>{const l=threadLabel(t);return `
          <button class="msg-thread ${t.thread===activeId?'on':''}" data-act="open-thread" data-thread="${esc(t.thread)}">
            <div class="row" style="gap:8px;align-items:center">
              <b>${esc(l.title)}</b>${t.unread?`<span class="msg-dot">${t.unread}</span>`:''}
            </div>
            <span>${esc((t.last?.text||'').slice(0,60))}</span>
            <em>${esc(fmtDateTime(t.last?.at))}</em>
          </button>`; }).join('') : `<div class="empty" style="padding:20px"><p class="small muted">No conversations yet. Start one with a colleague.</p></div>`}
      </aside>
      <section class="msg-pane">
        ${active? `
          <div class="msg-pane-h">
            <div><b>${esc(threadLabel(active).title)}</b><span>${esc(threadLabel(active).sub)} · ${active.msgs.length} messages</span></div>
            ${active.kind==='direct'?presenceTag(active.msgs.find(m=>m.from!==user.id)?.from||''):''}
          </div>
          <div class="msg-scroll">
            ${active.msgs.map(m=>`<div class="msg ${m.from===user.id?'mine':''}">
              <div class="msg-meta">${esc(userName(m.from))} · ${fmtDateTime(m.at)}${m.flagged?' · flagged':''}</div>
              <div class="msg-body">${esc(m.text)}</div>
              ${m.flagged?`<div class="msg-flag">${ic('alert',12)} Flagged locally: ${esc(m.flagReason||'')} - a person decides what happens next.</div>`:''}
            </div>`).join('')}
          </div>
          <form class="msg-compose" data-form="message" id="msgForm">
            <input type="hidden" name="thread" value="${esc(active.thread)}">
            <textarea class="input" name="text" rows="2" placeholder="Write a coordination message. Do not include patient identifiers." required></textarea>
            <button class="btn btn-primary" type="submit">Send</button>
          </form>` : `
          <div class="msg-empty">${emptyState('Select a conversation','Or start a new one. Messages are for coordination, not for clinical records.','send')}</div>`}
      </section>
      <aside class="msg-side">
        ${card(`People (${colleagues.length})`, `
          <div class="msg-filter-wrap" style="margin-bottom:8px">
            <input class="input" type="search" placeholder="Filter ${colleagues.length} colleagues..." oninput="const q=this.value.toLowerCase();this.closest('.card-b').querySelectorAll('.msg-person-row').forEach(el=>{el.style.display=el.dataset.search.includes(q)?'flex':'none';});">
          </div>
          <div class="col msg-people-scroll" style="gap:6px">${colleagues.map(u=>`
          <div class="row msg-person-row" data-search="${esc((u.name+' '+(roleObj(u.roleId)?.name||'')+' '+u.username).toLowerCase())}" style="gap:8px;justify-content:space-between">
            <button class="msg-person" data-act="compose-message" data-to="${u.id}">
              <span class="avatar" style="width:24px;height:24px;font-size:10px;background:${WTHEME.safeFill((deptObj((roleObj(u.roleId)||{}).dept)||{}).accent||'#475569')}">${initials(u.name)}</span>
              <span><b>${esc(u.name.replace(/^Demo - /,''))}</b><em>${esc(roleObj(u.roleId)?.name||'')}</em></span>
            </button>
            ${presenceTag(u.id)}
          </div>`).join('')}</div>`, {sub:`All ${colleagues.length} online & offline colleagues in scope — scroll to view everyone.`})}
        ${flagged.length && RBAC.has(user,'hr.view')? card('Flagged messages', `<div class="col" style="gap:8px">
          ${flagged.slice(0,5).map(m=>`<div><div class="xs muted">${esc(userName(m.from))} · ${fmtDateTime(m.at)}</div><div class="small">${esc(m.text.slice(0,140))}</div>
            <div class="xs" style="color:var(--warn)">${esc(m.flagReason||'')}</div></div>`).join('')}
          <p class="xs muted" style="margin:0">A flag is a suggestion from the local assistant. It is never a disciplinary finding and never acts on its own.</p>
        </div>`, {sub:'Visible to HR for review only'}) : ''}
      </aside>
    </div>`;
}
