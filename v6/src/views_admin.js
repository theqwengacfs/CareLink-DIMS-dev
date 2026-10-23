/* ============================================================
   views_admin.js - Media & governance, people, fleet,
   assurance, system administration, leadership.
   ============================================================ */

/* ---------------- Media ---------------- */
function renderMedia(user){
  const docs = repo.documents(user);
  const groups = {
    storytelling: docs.filter(d=>d.classification==='story_material'),
    clinical: docs.filter(d=>d.classification==='clinical'),
    identification: docs.filter(d=>d.classification==='identification'),
    internal: docs.filter(d=>['internal_photo','hospital'].includes(d.classification))
  };
  const tile = d => {
    const p = DB.db.patients.find(x=>x.id===d.patientId);
    const consentOk = p && p.consent.status==='granted';
    return `<div class="card"><div class="card-b">
      <div class="spread" style="align-items:flex-start">
        <div class="row" style="gap:10px">
          <div style="width:44px;height:44px;border-radius:11px;background:var(--surface-2);display:grid;place-items:center;color:var(--muted)">${ic(d.classification==='story_material'?'image':'doc',20)}</div>
          <div><div class="bold small">${esc(titleCase(d.kind))}</div><div class="xs muted">${esc(p?.name||'Unlinked')} · ${esc(p?areaName(p.areaId):'')}</div></div>
        </div>
        ${d.restricted?badge('Restricted','b-dark'):badge(titleCase(d.classification),'b-neutral')}
      </div>
      <div class="divider" style="margin:12px 0"></div>
      <div class="row" style="justify-content:space-between;font-size:11.5px">
        <span class="muted">Consent</span>${badge(p?titleCase(p.consent.status):'-',consentOk?'b-ok':'b-crit')}
      </div>
      <div class="row" style="justify-content:space-between;font-size:11.5px;margin-top:6px">
        <span class="muted">Publication</span>${badge(titleCase(d.publication),d.publication==='approved'?'b-ok':d.publication==='rejected'?'b-crit':'b-neutral')}
      </div>
      <div class="row" style="margin-top:12px">${RBAC.has(user,'media.publish')?`<button class="btn btn-xs btn-ghost" data-act="review-media" data-id="${d.id}">Review</button>`:''}
      <button class="btn btn-xs btn-ghost" data-act="view-doc" data-id="${d.id}">Open</button></div>
    </div></div>`;
  };
  return pageHead('Media library','Every asset carries a classification, a consent status and a publication state.',
    `<button class="btn btn-sm btn-ghost" data-act="go" data-v="publish">${ic('send',14)} Publication queue</button>`)
  + `<div class="grid g4" style="margin-bottom:18px">
      ${kpi('Total assets', num(docs.length),'In your governance scope','','image')}
      ${kpi('Storytelling material', num(groups.storytelling.length),'Requires scoped consent','warn','book')}
      ${kpi('Approved', num(docs.filter(d=>d.publication==='approved').length),'Cleared for use','ok','check')}
      ${kpi('Restricted', num(docs.filter(d=>d.restricted).length),'Clinical / identification','crit','lock')}
    </div>
    <div class="grid g3">${docs.slice(0,18).map(tile).join('')||emptyState('No media assets','Uploaded patient documents and photographs appear here with their consent state.','image')}</div>`;
}

function renderConsent(user){
  const ps = repo.patientList(user);
  const groups = ['granted','pending','withdrawn','not_requested'].map(s=>({label:titleCase(s),value:ps.filter(p=>p.consent?.status===s).length,color:s==='granted'?'#0F7B4F':s==='pending'?'#D28A00':s==='withdrawn'?'#B00020':'#8A94A2'}));
  return pageHead('Consent register','Consent is scoped: internal use, storytelling, or donor reporting. Withdrawal immediately blocks publication.')
  + `<div class="grid g2" style="margin-bottom:16px">
      ${card('Consent status', `<div class="donut-wrap">${donut(groups)}${legend(groups)}</div>`)}
      ${card('Consent scopes', `<div class="dl">
        <dt>Internal use only</dt><dd>${ps.filter(p=>p.consent?.scope==='internal').length}</dd>
        <dt>Storytelling</dt><dd>${ps.filter(p=>p.consent?.scope==='storytelling').length}</dd>
        <dt>Donor reporting</dt><dd>${ps.filter(p=>p.consent?.scope==='donor_report').length}</dd>
        <dt>Blocked from publication</dt><dd>${ps.filter(p=>p.consent?.status!=='granted').length}</dd>
      </div><div class="divider"></div>${note('A photograph uploaded under internal-use consent cannot be reused for a success story. The rule is enforced at publication, not by convention.')}`)}
    </div>`
  + card('Patient consent records', table([
      {label:'Patient',render:p=>`<div class="cellname">${esc(p.name)}<span class="sm">${esc(areaName(p.areaId))}</span></div>`},
      {label:'Status',render:p=>badge(titleCase(p.consent?.status||'not requested'),p.consent?.status==='granted'?'b-ok':p.consent?.status==='withdrawn'?'b-crit':'b-warn')},
      {label:'Scope',render:p=>badge(titleCase(p.consent?.scope||'-'),'b-neutral')},
      {label:'Recorded',render:p=>fmtDate(p.consent?.date)},
      {label:'Assets',cls:'num',render:p=>DB.db.documents.filter(d=>d.patientId===p.id).length},
      {label:'',cls:'act',render:p=>`<button class="btn btn-xs btn-ghost" data-act="edit-consent" data-id="${p.id}">Update</button>`}
    ], ps.slice(0,40)),
    {foot:`<span>${ic('shield',13)} Consent changes are audited and cannot be back-dated silently.</span>`});
}

function renderPublish(user){
  const docs = repo.documents(user).filter(d=>['story_material','internal_photo'].includes(d.classification));
  const queue = docs.filter(d=>d.publication==='pending_review');
  return pageHead('Publication queue','Publication is blocked where consent is absent, incomplete, withdrawn or scoped too narrowly.')
  + `<div class="alert warn" style="margin-bottom:16px">${ic('shield',18)}<div><b>Mandatory governance control</b>
      <span class="small">This control cannot be disabled by any administrator. It is evaluated against the patient's live consent record at the moment of publication.</span></div></div>`
  + card('Awaiting publication decision', queue.length? `<div class="col" style="gap:12px">${queue.map(d=>{
      const p = DB.db.patients.find(x=>x.id===d.patientId);
      const gate = GOV.canPublish(d);
      return `<div class="alert ${gate.ok?'ok':'crit'}" style="align-items:center">
        <div style="flex:1"><b>${esc(titleCase(d.kind))} - ${esc(p?.name||'Unlinked')}</b>
          <span class="small">Consent: ${esc(p?titleCase(p.consent.status):'none')} · Scope: ${esc(p?titleCase(p.consent.scope):'-')}</span>
          ${!gate.ok?`<div class="small" style="margin-top:4px"><b>Blocked:</b> ${esc(gate.reason)}</div>`:''}
        </div>
        <button class="btn btn-xs ${gate.ok?'btn-primary':'btn-ghost'}" data-act="approve-publish" data-id="${d.id}" ${gate.ok?'':'disabled'}>${gate.ok?'Approve publication':'Blocked'}</button>
        <button class="btn btn-xs btn-ghost" data-act="reject-publish" data-id="${d.id}">Decline</button>
      </div>`;
    }).join('')}</div>` : emptyState('Queue clear', 'No storytelling assets are awaiting a publication decision.','check'))
  + card('Publication history', table([
      {label:'Asset',render:d=>esc(titleCase(d.kind))},
      {label:'Patient',render:d=>esc(DB.db.patients.find(p=>p.id===d.patientId)?.name||'-')},
      {label:'Decision',render:d=>badge(titleCase(d.publication),d.publication==='approved'?'b-ok':'b-neutral')},
      {label:'Uploaded',render:d=>fmtDate(d.uploadedAt)}
    ], docs.filter(d=>d.publication!=='pending_review')));
}

function renderPolicy(user){
  const kb = DB.db.kbDocs;
  return pageHead('Policy & knowledge base','Organisational documents indexed for authorised retrieval. Proposed changes follow Proposal → Review → Approval → Implementation → Testing → Versioning.')
  + card('Mandatory governance rules', `<div class="col" style="gap:10px">${GOV.MANDATORY.map(g=>`<div class="row" style="gap:10px;align-items:flex-start;padding:9px 0;border-bottom:1px solid var(--line-2)">
      <span style="color:var(--ok);flex:0 0 18px;margin-top:1px">${ic('lock',16)}</span>
      <div><div class="small">${esc(g.rule)}</div><div class="xs muted" style="margin-top:2px">Rule ${g.id.toUpperCase()} · enforced in the application layer</div></div></div>`).join('')}</div>`,
    {sub:'These rules cannot be waived through ordinary administration.'})
  + `<div class="grid g2" style="margin-top:16px">
      ${card('Knowledge base', table([
        {label:'Document',render:d=>`<div class="cellname">${esc(d.title)}<span class="sm">${esc(d.type)} · v${esc(d.version)}</span></div>`},
        {label:'Classification',render:d=>badge(d.classification,'b-neutral','nodot')},
        {label:'Owner',render:d=>`<span class="small">${esc(d.owner)}</span>`},
        {label:'Indexed',render:d=>d.indexed?badge('Yes','b-ok'):badge('No','b-warn')}
      ], kb), {sub:''+kb.length+' documents available to the local assistant'})}
      ${card('Policy status', `<dl class="dl">
        <dt>Patient Confidentiality & Ethical Storytelling</dt><dd>${badge('PROPOSED v1.0','b-warn')}</dd>
        <dt>Owner</dt><dd>Media & Information Governance</dd>
        <dt>Applies to</dt><dd>All accounts, including administrators</dd>
        <dt>Enforcement</dt><dd>Rule engine (g1-g8)</dd>
      </dl><div class="divider"></div>${note('The policy is not yet formally adopted. Until adoption it operates as a proposed framework; mandatory technical controls apply regardless.','info')}`)}
    </div>`;
}

/* ---------------- People ---------------- */
function renderStaff(user){
  const emps = repo.employees(user);
  return pageHead('Staff register','No fabricated identities. Authorised HR personnel enter and validate real staff information.',
    RBAC.has(user,'hr.manage')?`<button class="btn btn-sm btn-primary" data-act="add-staff">${ic('plus',15)} Add staff</button>`:'')
  + `<div class="grid g4" style="margin-bottom:16px">
      ${kpi('Staff records', num(emps.length),'Active employees','','idcard')}
      ${kpi('Departments', num(new Set(emps.map(e=>e.dept)).size),'Represented','','building')}
      ${kpi('Permanent', num(emps.filter(e=>e.contract==='permanent').length),'Contract type','','check')}
      ${kpi('Leave pending', num(DB.db.leaveRequests.filter(l=>l.status==='pending').length),'Awaiting decision','','calendar')}
    </div>`
  + card('Staff', table([
      {label:'Employee',render:e=>`<div class="row" style="gap:9px">${avatarFor(e.name,deptObj(e.dept)?.accent)}<div class="cellname">${esc(e.name)}<span class="sm">${esc(e.role)}</span></div></div>`},
      {label:'Department',render:e=>esc(deptName(e.dept))},
      {label:'County',render:e=>esc(countyName(e.county))},
      {label:'Contract',render:e=>badge(titleCase(e.contract),'b-neutral')},
      {label:'Annual leave',cls:'num',render:e=>`${e.annualEntitlement} d`},
      {label:'Status',render:e=>badge(titleCase(e.status),'b-ok')},
      {label:'',cls:'act',render:e=>RBAC.has(user,'hr.manage')?`<button class="btn btn-xs btn-ghost" data-act="edit-staff" data-id="${e.id}">Edit</button>`:''}
    ], emps),
    {foot:`<span>${ic('lock',13)} HR records are restricted to authorised HR personnel. Clinical data is never exposed to HR because it manages employee records.</span>`});
}

/* The leave view now lives in leave.js, where the coverage rules are
   computed rather than restated. Do not add a second renderLeave here. */

/* ---------------- Monthly work plans ----------------
   Every member of staff submits a plan for the month ahead, by the last day of
   the current month. A supervisor approves it or returns it with a reason. A
   returned plan is revised in place and the version number rises, so the
   agreed plan and every revision of it remain visible. */
const WORKPLAN = {
  period(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); },
  nextPeriod(){ const d=new Date(); d.setMonth(d.getMonth()+1); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); },
  label(p){ const [y,m]=p.split('-'); return new Date(+y,+m-1,1).toLocaleString('en-GB',{month:'long',year:'numeric'}); },
  dueDate(p){ const [y,m]=p.split('-'); return new Date(+y,+m,0); },       /* last day of the month */
  daysLeft(p){ return Math.ceil((this.dueDate(p)-new Date())/86400000); },
  mine(user,p){ return (DB.db.workPlans||[]).find(w=>w.userId===user.id&&w.period===p)||null; },
  visible(user){
    const all = DB.db.workPlans||[];
    if(RBAC.has(user,'hr.view')) return all;
    return all.filter(w=>w.userId===user.id || w.supervisorId===user.id);
  }
};

function renderWorkPlans(user){
  const period = WORKPLAN.period();
  const next = WORKPLAN.nextPeriod();
  const mineNext = WORKPLAN.mine(user, next);
  const mineCur = WORKPLAN.mine(user, period);
  const mine = mineNext || mineCur;
  const rows = WORKPLAN.visible(user);
  const left = WORKPLAN.daysLeft(period);
  const team = rows.filter(w=>w.period===next);
  const pending = team.filter(w=>w.status==='submitted');
  const approvedCount = rows.filter(w=>w.status==='approved').length;
  const canApprove = RBAC.has(user,'hr.view') || rows.some(w=>w.supervisorId===user.id);
  const activeStage = !mine ? 1 : mine.status==='draft' ? 1 : mine.status==='returned' ? 2 : mine.status==='submitted' ? 3 : mine.status==='approved' ? 4 : 1;
  const stages = [
    { n:1, title:'1. Draft Objectives', sub:'Write 2–4 measurable targets & field priorities', icon:'file' },
    { n:2, title:'2. Submit Before Month-End', sub:`Due ${WORKPLAN.dueDate(period).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}`, icon:'send' },
    { n:3, title:'3. Supervisor Decision', sub:'Line supervisor approves or returns with notes', icon:'shieldcheck' },
    { n:4, title:'4. Active Execution & Review', sub:'Evaluated against agreed targets at month close', icon:'target' }
  ];
  return pageHead('Monthly work plans',
    'One structured work plan per staff member per month, submitted before month-end and tracked from draft through supervisor sign-off and month-end evaluation.',
    `<div class="row" style="gap:8px;flex-wrap:wrap">
      <button class="btn btn-sm btn-ghost" data-act="workplan-edit" data-period="${period}">${ic('calendar',14)} ${mineCur?'View/Edit':'Draft'} ${esc(WORKPLAN.label(period))}</button>
      <button class="btn btn-sm btn-primary" data-act="workplan-edit" data-period="${next}">${ic(mineNext?'file':'plus',15)} ${mineNext?'Edit':'Prepare'} ${esc(WORKPLAN.label(next))} plan</button>
    </div>`)
  + `<div class="wp-hero-card">
      <div class="wp-hero-top">
        <div>
          <div class="wp-kicker">CARELINK MONTHLY ACCOUNTABILITY CYCLE · ${esc(WORKPLAN.label(next).toUpperCase())}</div>
          <h3>${mine ? `${esc(WORKPLAN.label(mine.period))} Work Plan — ${esc(titleCase(mine.status))} (v${mine.version})` : `Prepare Your ${esc(WORKPLAN.label(next))} Work Plan`}</h3>
          <div class="small muted">${mine ? `${mine.objectives.length} agreed objective(s) · Supervisor: ${esc(userName(mine.supervisorId||'')||'Department Lead')}` : `Submit 2–4 measurable objectives before ${fmtDate(WORKPLAN.dueDate(period))} so your supervisor can review before the 1st.`}</div>
        </div>
        <div class="wp-deadline-pill ${left<0?'late':left<5?'soon':'ok'}">
          ${ic('clock',15)}
          <span>${left>=0? `${left} day${left===1?'':'s'} until ${WORKPLAN.dueDate(period).toLocaleDateString('en-GB',{day:'2-digit',month:'short'})} cut-off` : `${Math.abs(left)} day${Math.abs(left)===1?'':'s'} past cut-off`}</span>
        </div>
      </div>
      <div class="wp-stepper">
        ${stages.map(s=>`<div class="wp-step ${activeStage>s.n?'done':activeStage===s.n?'active':''}">
          <div class="wp-step-ic">${activeStage>s.n?ic('check',15):ic(s.icon,15)}</div>
          <div class="wp-step-txt"><b>${esc(s.title)}</b><span>${esc(s.sub)}</span></div>
        </div>`).join('')}
      </div>
      ${mine && (mine.objectives||[]).length ? `<div class="wp-my-objs">
        ${mine.objectives.slice(0,4).map((o,idx)=>`<div class="wp-obj-chip">
          <span class="wp-obj-num">#${idx+1}</span>
          <div><b>${esc(o.title||o.text||o.objective||'Objective '+(idx+1))}</b>
            <div class="xs muted">${esc(o.measure||o.metric||'Target')}: <b>${esc(o.target||'Agreed deliverable')}</b></div>
          </div>
        </div>`).join('')}
      </div>` : ''}
    </div>`
  + `<div class="grid g4" style="margin:16px 0">
      ${kpi('My '+WORKPLAN.label(next)+' plan', mineNext? titleCase(mineNext.status) : 'Not started',
        mineNext? `Version ${mineNext.version} · ${mineNext.objectives.length} objectives` : 'Due '+fmtDate(WORKPLAN.dueDate(period)),
        mineNext? (mineNext.status==='approved'?'ok':mineNext.status==='returned'?'crit':'warn') : (left<5?'warn':''), 'calendar')}
      ${kpi('Submission cut-off', WORKPLAN.dueDate(period).toLocaleDateString('en-GB',{day:'2-digit',month:'short'}),
        left>=0? `${left} day${left===1?'':'s'} remaining` : `${Math.abs(left)} day${Math.abs(left)===1?'':'s'} overdue`, left<0?'crit':left<5?'warn':'ok','clock')}
      ${kpi('Approved in view', `${num(approvedCount)} / ${num(rows.length)}`, `${num(team.length)} filed for ${WORKPLAN.label(next)}`, 'ok', 'users')}
      ${kpi('Awaiting my decision', num(pending.length), pending.length?'Supervisor review required':'Queue clear', pending.length?'warn':'ok','check')}
    </div>`
  + `<div class="grid g2">
      ${card('Work plans in your scope', table([
        {label:'Staff member',render:w=>`<div class="cellname">${esc(userName(w.userId))}<span class="sm">${esc(roleObj(DB.db.users.find(u=>u.id===w.userId)?.roleId)?.name||'')}</span></div>`},
        {label:'Period & version',render:w=>`<b>${esc(WORKPLAN.label(w.period))}</b><div class="xs muted mono">Version v${w.version}${w.late?' · late':''}</div>`},
        {label:'Objectives',render:w=>`<span class="badge b-info nodot">${(w.objectives||[]).length} target${(w.objectives||[]).length===1?'':'s'}</span>`},
        {label:'Status',render:w=>badge(titleCase(w.status), w.status==='approved'?'b-ok':w.status==='returned'?'b-crit':w.status==='submitted'?'b-warn':'b-neutral')},
        {label:'Actions',cls:'act',render:w=>`<div class="row" style="gap:5px;flex-wrap:wrap;justify-content:flex-end">
          <button class="btn btn-xs btn-ghost" data-act="workplan-view" data-id="${w.id}">${ic('eye',12)} Open</button>
          ${w.userId===user.id && w.status!=='approved'?`<button class="btn btn-xs btn-ghost" data-act="workplan-edit" data-period="${esc(w.period)}">Edit</button>`:''}
          ${w.status==='submitted'&&canApprove&&w.userId!==user.id?`<button class="btn btn-xs btn-primary" data-act="workplan-approve" data-id="${w.id}">Approve</button>
            <button class="btn btn-xs btn-ghost" data-act="workplan-return" data-id="${w.id}">Return</button>`:''}
        </div>`}
      ], rows, {empty:emptyState('No plans yet','Click Prepare above to draft your monthly objectives and targets.','file')}),
        {sub:'Shows your own monthly plans plus direct reports you supervise (HR views organisation-wide).'})}
      ${card('Governance rules & monthly cadence', `<div class="wp-rules-list">
        ${[['1. Measurable monthly deliverables','Every staff member sets 2 to 4 concrete objectives with a verifiable measure and numeric/date target aligned to department KPIs.'],
           ['2. Month-end submission gate','Plans for the upcoming month are due by the last calendar day of the current month; late submissions remain permitted but carry an automatic late flag.'],
           ['3. Explicit supervisor sign-off','Your line supervisor (Coordinator, MCM, County Admin, or Department Head) approves or returns with written revision notes — silence never equals approval.'],
           ['4. Versioned audit history','Returned plans increment their version (v2, v3…) while preserving every earlier draft in the immutable audit log.'],
           ['5. Linked to Monday meetings & evaluation','Approved monthly targets anchor Monday Management Meeting updates and end-of-month recognition scoring.']
        ].map(([t,d])=>`<div class="wp-rule-item"><div class="wp-rule-dot">${ic('check',13)}</div><div><b>${esc(t)}</b><div class="xs muted" style="margin-top:2px">${esc(d)}</div></div></div>`).join('')}
      </div>`)}
    </div>`;
}

function renderWelfare(user){
  const acts = DB.db.welfareActs; const contribs = DB.db.contributions;
  return pageHead('Staff welfare','Contributions, disbursements and outstanding balances - restricted to the Welfare Officer.')
  + `<div class="grid g3" style="margin-bottom:16px">
      ${kpi('Open activities', num(acts.filter(a=>a.status==='open').length),'Collecting contributions','info','heart')}
      ${kpi('Received', money(contribs.filter(c=>c.status==='received').reduce((n,c)=>n+c.amount,0)),'Across all activities','ok','wallet')}
      ${kpi('Outstanding', num(contribs.filter(c=>c.status==='outstanding').length),'Contributions pending','warn','clock')}
    </div>`
  + `<div class="grid g2">
    ${card('Activities', table([
      {label:'Activity',render:a=>`<div class="cellname">${esc(a.title)}<span class="sm">${esc(a.type)} · deadline ${fmtDate(a.deadline)}</span></div>`},
      {label:'Target',cls:'num',render:a=>money(a.targetAmount)},
      {label:'Received',cls:'num',render:a=>money(contribs.filter(c=>c.activityId===a.id&&c.status==='received').reduce((n,c)=>n+c.amount,0))},
      {label:'Status',render:a=>badge(titleCase(a.status),a.status==='open'?'b-info':'b-neutral')}
    ], acts))}
    ${card('Contribution register', table([
      {label:'Employee',render:c=>esc(DB.db.employees.find(e=>e.id===c.employeeId)?.name||'-')},
      {label:'Activity',render:c=>esc(DB.db.welfareActs.find(a=>a.id===c.activityId)?.title||'-')},
      {label:'Amount',cls:'num',render:c=>money(c.amount)},
      {label:'Status',render:c=>badge(titleCase(c.status),c.status==='received'?'b-ok':'b-warn')}
    ], contribs))}
  </div>`;
}

/* ---------------- Fleet ---------------- */
function renderVehicles(user){
  const vs = repo.vehicles(user);
  return pageHead('Vehicle register','')
  + `<div class="grid g4" style="margin-bottom:16px">
      ${kpi('Vehicles', num(vs.length),'Across counties','','car')}
      ${kpi('Active', num(vs.filter(v=>v.status==='active').length),'Available','ok','check')}
      ${kpi('In maintenance', num(vs.filter(v=>v.status==='maintenance').length),'Unavailable','warn','settings')}
      ${kpi('Insurance expiring', num(vs.filter(v=>daysBetween(new Date(),v.insuranceExpiry)<60).length),'Within 60 days','warn','alert')}
    </div>`
  + card('Register', table([
      {label:'Vehicle',render:v=>`<div class="cellname">${esc(v.reg)}<span class="sm">${esc(v.model)}</span></div>`},
      {label:'County',render:v=>esc(countyName(v.countyId))},
      {label:'Status',render:v=>badge(titleCase(v.status),v.status==='active'?'b-ok':'b-warn')},
      {label:'Insurance',render:v=>fmtDate(v.insuranceExpiry)},
      {label:'Inspection',render:v=>fmtDate(v.inspection)},
      {label:'Odometer',cls:'num',render:v=>num(v.odometer)+' km'},
      {label:'Next service',cls:'num',render:v=>num(v.nextService)+' km'},
      {label:'Driver',render:v=>`<span class="small">${esc(v.driver)}</span>`}
    ], vs));
}
function renderTrips(user){
  const ts = repo.trips(user);
  return pageHead('Trips & fuel','Transport records link to authorised requests without exposing unrelated patient information.',
    RBAC.has(user,'trip.log')?`<button class="btn btn-sm btn-primary" data-act="log-trip">${ic('plus',15)} Log trip</button>`:'')
  + card('Trip log', table([
      {label:'Date',render:t=>fmtDate(t.date)},
      {label:'Vehicle',render:t=>esc(DB.db.vehicles.find(v=>v.id===t.vehicleId)?.reg||'-')},
      {label:'Purpose',render:t=>`<div class="cellname">${esc(t.purpose)}${t.requestId?`<span class="sm">Linked to request ${esc(t.requestId)}</span>`:''}</div>`},
      {label:'Driver',render:t=>esc(t.driver)},
      {label:'Distance',cls:'num',render:t=>num(t.km)+' km'},
      {label:'Fuel',cls:'num',render:t=>money(t.fuel)},
      {label:'Cost / km',cls:'num',render:t=>t.km?money(Math.round(t.fuel/t.km)):'-'}
    ], ts), {foot:'<span>Unusual fuel consumption and scheduling conflicts are flagged by the fleet console.</span>'});
}

/* ---------------- Assurance ---------------- */
function renderAudit(user){
  const q = REPORTS.dataQuality(user);
  const integrity = AUDIT.verify();
  const denials = DB.db.audit.filter(a=>a.action==='access.denied');
  return pageHead('Audit findings','Read-only inspection of data integrity, compliance and reconciliation.',
    `<button class="btn btn-sm btn-ghost" data-act="export-audit">${ic('download',14)} Export findings</button>`)
  + `<div class="grid g4" style="margin-bottom:16px">
      ${kpi('Findings', num(q.length),'Scoped to your authority','warn','shieldcheck')}
      ${kpi('Critical', num(q.filter(i=>i.level==='crit').length),'Require correction','crit','alert')}
      ${kpi('Denied access events', num(denials.length),'Authorisation enforcement','info','lock')}
      ${kpi('Chain integrity', integrity.ok?'Intact':'Broken', integrity.entries+' entries',integrity.ok?'ok':'crit','history')}
    </div>`
  + `<div class="grid g2">
      ${card('Findings register', table([
        {label:'Severity',render:i=>badge(titleCase(i.level),i.level==='crit'?'b-crit':i.level==='warn'?'b-warn':'b-info')},
        {label:'Finding',render:i=>esc(i.text)},
        {label:'Route',render:i=>badge('Responsible department','b-neutral','nodot')}
      ], q.slice(0,20), {empty:emptyState('No findings','No discrepancies detected.','check')}),
        {foot:'<span>Auditors cannot alter the records they audit. Corrections follow the departmental correction workflow.</span>'})}
      ${card('Access denials (most recent)', table([
        {label:'Time',render:a=>fmtDateTime(a.ts)},
        {label:'Actor',render:a=>`<span class="small">${esc(userName(a.actor).replace(/^Demo - /,''))}</span>`},
        {label:'Attempted',render:a=>badge(a.entityId,'b-neutral','nodot')},
        {label:'Reason',render:a=>`<span class="xs muted">${esc(a.reason||'')}</span>`}
      ], denials.slice(-10).reverse(), {empty:emptyState('No denials','No authorisation denials recorded.','check')}))}
    </div>`;
}

function renderHistory(user){
  const rows = repo.auditLog(user);
  return pageHead('Audit trail','Append-only and hash-chained. No role may edit or delete an entry.',
    `<button class="btn btn-sm btn-ghost" data-act="verify-chain">${ic('lock',14)} Verify chain</button>`)
  + card('', table([
      {label:'Seq',cls:'num',render:a=>`<span class="mono xs">${a.seq}</span>`},
      {label:'Time',render:a=>`<span class="small">${fmtDateTime(a.ts)}</span>`},
      {label:'Actor',render:a=>`<span class="small">${esc(userName(a.actor).replace(/^Demo - /,''))}</span>`},
      {label:'Action',render:a=>badge(a.action,a.action.includes('denied')||a.action.includes('failed')?'b-crit':a.action.includes('auth')?'b-info':'b-neutral','nodot')},
      {label:'Entity',render:a=>`<span class="mono xs">${esc(a.entity)}${a.entityId!=='-'?':'+esc(a.entityId):''}</span>`},
      {label:'Detail',render:a=>`<span class="small muted">${esc(a.detail)}</span>`},
      {label:'Hash',render:a=>`<span class="mono xs muted">${esc(a.hash)}</span>`}
    ], rows.slice(0,80)),
    {foot:`<span>${ic('lock',13)} ${rows.length} entries · each hash covers the previous entry, so tampering breaks the chain.</span>`});
}

function renderSecurity(user){
  const last = DB.db.securityTests[0];
  return pageHead('Security self-test','Exercises the authorisation matrix the way an attacker or curious user would.',
    `<button class="btn btn-sm btn-primary" data-act="run-security-test">${ic('play',14)} Run test</button>`)
  + (last? `<div class="grid g3" style="margin-bottom:16px">
      ${kpi('Passed', `${last.passed}/${last.total-(last.skipped||0)}`, (last.skipped? last.skipped+' skipped (no fixture) · ':'')+(last.passed===(last.total-(last.skipped||0))?'All controls effective':'Review failures'), last.passed===(last.total-(last.skipped||0))?'ok':'crit','shieldcheck')}
      ${kpi('Run at', fmtDate(last.at), fmtDateTime(last.at),'','clock')}
      ${kpi('Run by', esc(userName(last.by).replace(/^Demo - /,'')),'','','idcard')}
    </div>
    <div class="grid g3">
      ${last.tests.map(t=>`<div class="card"><div class="card-b">
        <div class="row" style="gap:9px;align-items:flex-start">
          <div style="color:${t.skipped?'var(--muted-2)':t.pass?'var(--ok)':'var(--crit)'};flex:0 0 20px;margin-top:1px">${ic(t.skipped?'info':t.pass?'check':'x',18)}</div>
          <div><div class="small bold">${esc(t.name)}</div>
          <div class="xs muted" style="margin-top:3px">${t.skipped?'Skipped - fixture not present in this installation':'Expected: '+(t.pass?'denied':'permitted')+' → '+(t.pass?'correct':'FAILED')}</div></div>
        </div></div></div>`).join('')}
    </div>` : card('No test run yet', emptyState('Run the self-test','The test attempts cross-county reads, cross-department access, self-approval and privilege escalation.','lock',
      `<button class="btn btn-sm btn-primary" data-act="run-security-test">Run now</button>`)))
  + `<div style="margin-top:16px">${card('Controls tested', `<div class="col" style="gap:8px">${GOV.MANDATORY.map(g=>`<div class="small row" style="gap:9px;align-items:flex-start"><span style="color:var(--ok);flex:0 0 16px">${ic('check',15)}</span>${esc(g.rule)}</div>`).join('')}</div>`)}</div>`;
}

/* ---------------- System: users & roles ---------------- */
function renderUsers(user){
  const us = DB.db.users.filter(u=>{
    const role = roleObj(user.roleId)||{scope:{}};
    if((role.scope||{}).geo==='global'||(role.scope||{}).crossCounty) return true;
    return u.countyId===user.countyId;
  });
  const pending = DB.db.accountRequests.filter(a=>['submitted','under_review'].includes(a.status));
  return pageHead('Users & accounts','Account type, job designation, department, county and ministry area are distinct fields - never interchangeable.',
    RBAC.has(user,'user.create')?`<button class="btn btn-sm btn-primary" data-act="new-account">${ic('plus',15)} Request account</button>`:'')
  + (pending.length? card('Account requests awaiting approval', table([
      {label:'Request',render:a=>`<div class="cellname">${esc(a.name)}<span class="sm">${esc(a.jobTitle||'')} · ${esc(deptName(a.departmentId))}</span></div>`},
      {label:'Proposed role',render:a=>badge(roleObj(a.roleId)?.name||a.roleId,'b-neutral')},
      {label:'County',render:a=>esc(countyName(a.countyId))},
      {label:'Requested by',render:a=>esc(userName(a.requestedBy))},
      {label:'Status',render:a=>badge(titleCase(a.status),'b-warn')},
      {label:'',cls:'act',render:a=>RBAC.has(user,'user.approve')?`<button class="btn btn-xs btn-primary" data-act="review-account" data-id="${a.id}">Review</button>`:badge('Pending','b-warn')}
    ], pending), {sub:'Creating a request never grants access. Approval by the County Office Administrator is required.'}) : '')
  + card('Directory', table([
      {label:'User',render:u=>`<div class="row" style="gap:9px">${avatarFor(u.name,roleObj(u.roleId)?.accent)}<div class="cellname">${esc(u.name)}<span class="sm">${esc(u.username)}</span></div></div>`},
      {label:'Role',render:u=>badge(roleObj(u.roleId)?.name||u.roleId,'b-neutral','nodot')},
      {label:'Department',render:u=>`<span class="small">${esc(deptName(u.departmentId))}</span>`},
      {label:'County',render:u=>`<span class="small">${esc(u.countyId?countyName(u.countyId):'-')}</span>`},
      {label:'Scope',render:u=>{const s=(roleObj(u.roleId)||{}).scope||{};return `<span class="xs muted">${s.geo==='global'?'Organisation':s.geo==='county'?countyName(u.countyId):(u.areaIds||[]).map(areaName).join(', ')}${s.readOnly?' · read-only':''}</span>`;}},
      {label:'Status',render:u=>badge(titleCase(u.status),u.status==='active'?'b-ok':u.status==='locked'?'b-crit':'b-warn')},
      {label:'Last login',render:u=>u.lastLogin?`<span class="xs">${fmtDateTime(u.lastLogin)}</span>`:'<span class="xs muted">never</span>'},
      {label:'',cls:'act',render:u=>RBAC.has(user,'user.manage')&&u.id!==user.id?`<button class="btn btn-xs btn-ghost" data-act="manage-user" data-id="${u.id}">Manage</button>`:''}
    ], us),
    {foot:`<span>${ic('lock',13)} Passwords are stored only as salted one-way hashes and are never displayed to any account.</span>`});
}

function renderRoles(user){
  const roles = (DB.db.roles?.length? DB.db.roles : ROLES);
  const groups = [...new Set(Object.values(CAPS).map(c=>c.g))];
  return pageHead('Roles & permissions','Backend-enforced capability templates with geographic, departmental and record-level scope.',
    `<button class="btn btn-sm btn-ghost" data-act="export-matrix">${ic('download',14)} Export matrix</button>`)
  + `<div class="alert neutral" style="margin-bottom:16px">${ic('info',18)}<div><b>Separation of duties</b>
      <span class="small">The Chief System Administrator configures the platform but does not hold clinical authority by default. Audit is read-only. The Media & Information Governance function cannot restore a database unilaterally.</span></div></div>`
  + card('Role matrix', `<div class="tbl-wrap"><table class="tbl" style="min-width:900px">
      <thead><tr><th style="width:220px">Role</th><th>Scope</th>${groups.map(g=>`<th class="center" style="font-size:9.5px">${esc(g)}</th>`).join('')}<th class="right">Caps</th></tr></thead>
      <tbody>${roles.map(r=>{
        const perms = RBAC.expandedPerms(r.id);
        return `<tr><td><div class="cellname" style="font-size:12.5px">${esc(r.name)}<span class="sm">${esc(deptName(r.dept))}</span></div></td>
          <td><span class="xs muted">${r.scope.geo==='global'?'Organisation':r.scope.geo==='county'?'County':'Areas'} · ${esc(r.scope.records)}${r.scope.readOnly?' · read-only':''}</span></td>
          ${groups.map(g=>{
            const inG = Object.entries(CAPS).filter(([k,v])=>v.g===g).map(([k])=>k);
            const held = inG.filter(k=>perms.includes(k)).length;
            return `<td class="center">${held? `<span class="badge b-neutral nodot" style="font-size:9.5px">${held}/${inG.length}</span>`:'<span class="muted xs">-</span>'}</td>`;
          }).join('')}
          <td class="right"><b>${perms.length}</b></td></tr>`;
      }).join('')}</tbody></table></div>`,
      {foot:`<span>Every capability is enforced in the data layer. Hiding a navigation item is a usability measure, never the security control.</span>`});
}

function renderOrg(user){
  return pageHead('Organisation configuration','Counties, ministry areas, classifications and departments - all editable without code changes.')
  + ORG_NOTES.map(n=>`<div style="margin-bottom:12px">${alertBox(n.level==='crit'?'crit':n.level==='warn'?'warn':'info',n.title,`<span class="small">${esc(n.body)}</span>`)}</div>`).join('')
  + `<div class="grid g2" style="margin-top:6px">
    ${COUNTIES.map(c=>card(c.name, `<div class="row" style="margin-bottom:12px"><span class="chip">${c.areas.length} ministry areas</span><span class="chip">Code ${esc(c.code)}</span></div>
      ${table([
        {label:'Ministry area',render:a=>`<div class="cellname">${esc(a.name)}<span class="sm">${esc(a.id)}</span></div>`},
        {label:'Classification',render:a=>badge(AREA_CLASS_LABEL[a.cls], a.cls==='urban'?'b-info':'b-ok','nodot')},
        {label:'Patients',cls:'num',render:a=>DB.db.patients.filter(p=>p.areaId===a.id).length},
        {label:'',cls:'act',render:a=>`<button class="btn btn-xs btn-ghost" data-act="edit-area" data-id="${a.id}">Edit</button>`}
      ], c.areas)}
      <div class="row" style="margin-top:12px"><button class="btn btn-sm btn-ghost btn-block" data-act="add-area" data-county="${c.id}">${ic('plus',14)} Add ministry area</button></div>`,
      {sub:esc(c.code)+' county office'})).join('')}
  </div>`
  + card('Departments', `<div class="grid g3">${DEPARTMENTS.map(d=>`<div class="row" style="gap:11px;padding:10px;border:1px solid var(--line);border-radius:10px">
      <span style="width:10px;height:34px;border-radius:4px;background:${d.accent}"></span>
      <div><div class="small bold">${esc(d.name)}</div><div class="xs muted">${esc(d.short)} · ${DB.db.users.filter(u=>u.departmentId===d.id).length} accounts</div></div></div>`).join('')}</div>`,
    {sub:'Departments define workspace identity and default data partitions.'});
}

function renderWorkflows(user){
  const machine = (kind)=>{
    const cfg = WORKFLOW[kind];
    return `<div class="card" style="margin-bottom:16px"><div class="card-h"><h3>${esc(cfg.label)}</h3><div class="r">${badge(cfg.states.length+' states','b-neutral','nodot')}</div></div>
      <div class="card-b">
        <div class="row" style="gap:6px;flex-wrap:wrap;margin-bottom:14px">${cfg.states.map((s,i)=>`
          <span class="chip" style="background:${i===0?'var(--accent-soft)':'var(--surface-2)'};border-color:${i===0?'var(--accent)':'var(--line)'}">${esc(cfg.labels[s])}</span>
          ${i<cfg.states.length-1?'<span class="muted xs">→</span>':''}`).join('')}</div>
        ${table([
          {label:'Action',render:t=>`<b class="small">${esc(t.label)}</b>`},
          {label:'From',render:t=>`<span class="xs muted">${t.from.map(s=>esc(cfg.labels[s])).join(', ')}</span>`},
          {label:'To',render:t=>badge(cfg.labels[t.to],'b-neutral','nodot')},
          {label:'Required capability',render:t=>`<span class="mono xs">${esc(t.cap)}</span>`},
          {label:'Controls',render:t=>`${t.needsReason?badge('reason','b-warn','nodot'):''} ${t.needsEvidence?badge('evidence','b-crit','nodot'):''} ${t.guard?badge('guard','b-info','nodot'):''}`}
        ], cfg.transitions)}
      </div></div>`;
  };
  return pageHead('Workflow configuration','Every state transition is capability-checked, guarded and audited. Workflows are configuration, not hard-coded screens.')
  + machine('patient') + machine('request');
}

/* ---------------- System health ---------------- */
function renderHealth(user){
  const integrity = AUDIT.verify();
  const failLogins = DB.db.audit.filter(a=>a.action==='auth.failed').length;
  const denials = DB.db.audit.filter(a=>a.action==='access.denied').length;
  const health = [
    { l:'Database', v:DB.db.meta.label||'Operational', tone:'ok', d:`${num(DB.stats().records)} records · schema v${DB.db.meta.schema}` },
    { l:'Storage', v: (DB.stats().bytes/1024/1024).toFixed(2)+' MB', tone:'ok', d: Store.durable? 'Persistent local storage':'Session memory (preview sandbox)' },
    { l:'Audit chain', v: integrity.ok?'Intact':'Broken', tone: integrity.ok?'ok':'crit', d:`${integrity.entries} entries verified` },
    { l:'Last backup', v: DB.db.settings.backup.lastBackup? fmtDate(DB.db.settings.backup.lastBackup):'Never', tone: DB.db.settings.backup.lastBackup?'ok':'warn', d: DB.db.settings.backup.schedule+' schedule' },
    { l:'Monday automation', v: DB.db.settings.mondayReport.enabled?'Armed':'Paused', tone: DB.db.settings.mondayReport.enabled?'ok':'warn', d: 'Next '+fmtDateTime(REPORTS.mondayStatus().nextRun) },
    { l:'Local AI model', v: DB.db.settings.ai.provider==='local'?'Ollama configured':'External (blocked)','tone':'info', d: DB.db.settings.ai.ollama },
    { l:'Authentication failures', v: String(failLogins), tone: failLogins>5?'warn':'ok', d:'Recorded in the audit trail' },
    { l:'Access denials', v: String(denials), tone:'info', d:'Authorisation enforcement events' }
  ];
  return pageHead('System health','Diagnostics are restricted to system administration and audit.')
  + `<div class="grid g4" style="margin-bottom:18px">${health.map(h=>kpi(h.l,h.v,h.d,h.tone)).join('')}</div>`
  + `<div class="grid g2">
      ${card('Data profile', table([
        {label:'Entity',render:r=>esc(r[0])},
        {label:'Records',cls:'num',render:r=>num(r[1])}
      ], [['Patients',DB.db.patients.length],['Visits',DB.db.visits.length],['PDCA cycles',DB.db.pdcas.length],['Hospital requests',DB.db.requests.length],['Transactions',DB.db.transactions.length],['Documents',DB.db.documents.length],['Users',DB.db.users.length],['Audit entries',DB.db.audit.length],['Archived reports',DB.db.reports.length]]))}
      ${card('Integrity checks', `<div class="col" style="gap:11px">
        ${[['Audit hash chain',integrity.ok],['No orphan patient references',DB.db.visits.every(v=>DB.db.patients.some(p=>p.id===v.patientId))],
           ['No duplicate patient codes',new Set(DB.db.patients.map(p=>p.code)).size===DB.db.patients.length],
           ['All users have a valid role',DB.db.users.every(u=>!!roleObj(u.roleId))],
           ['Transactions linked to requests',DB.db.transactions.filter(t=>t.requestId).length+'/'+DB.db.transactions.length]]
          .map(([l,ok])=>`<div class="row" style="justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--line-2)">
            <span class="small">${esc(l)}</span>${ok?badge('Pass','b-ok'):badge('Review','b-warn')}</div>`).join('')}
      </div>`, {foot:`<span>${ic('info',13)} Run the security self-test for authorisation controls.</span>`,
        actions:`<button class="btn btn-xs btn-ghost" data-act="run-security-test">Run test</button>`})}
    </div>`;
}

function renderBackup(user){
  const b = DB.db.settings.backup;
  const backups = DB.db.backups||[];
  const pending = DB.db.approvals.filter(a=>a.status==='pending' && a.type==='database restore');
  const canOperate = RBAC.has(user,'system.backup')||RBAC.has(user,'system.restore');
  return pageHead('Backup, validation and restore',
    'Five stages, each with a written result. A copy is never assumed sound because a file exists, and a restore never overwrites the live database without passing validation, verification and a second signature.',
    canOperate?`<button class="btn btn-sm btn-primary" data-act="create-backup">${ic('database',15)} Take a backup now</button>`:'')
  + `<div class="grid g4" style="margin-bottom:16px">
      ${kpi('Backups held', num(backups.length),'Inside this installation','','database')}
      ${kpi('Last backup', b.lastBackup?fmtDate(b.lastBackup):'Never', b.lastVerified?'Validated '+fmtDate(b.lastVerified):'Not yet validated', b.lastBackup?'ok':'warn','clock')}
      ${kpi('Last restore', b.lastRestore?fmtDate(b.lastRestore):'None', b.lastRestore?'Records replaced from a verified copy':'No restore has been executed','','refresh')}
      ${kpi('Awaiting second signature', num(pending.length),'Database restore',''+(pending.length?'warn':'ok'),'lock')}
    </div>`
  + card('The pipeline', `<div class="pipeline">${BACKUP_STEPS.map((s,i)=>`
      <div class="pipe-step"><span class="pipe-n">${i+1}</span><div><b>${esc(s)}</b><span>${esc([
        'A copy of the records with an integrity digest',
        'Structure, schema, audit chain and referential integrity',
        'The exact changes needed to move the copy to this version',
        'A rehearsal in isolation, with counts compared',
        'Dual approval, then apply and keep what was replaced'
      ][i])}</span></div></div>`).join('<div class="pipe-line"></div>')}</div>`,
    {sub:'Stages cannot be skipped. Activate is refused until Validate and Verify have both passed.'})
  + (pending.length? card('Awaiting the second signature', table([
      {label:'Operation',render:a=>badge(a.type,'b-warn','nodot')},
      {label:'Backup',render:a=>`<span class="mono">${esc(a.context?.backupId||'-')}</span>`},
      {label:'Requested by',render:a=>esc(userName(a.requestedBy))},
      {label:'At',render:a=>fmtDateTime(a.requestedAt)},
      {label:'Signatures',render:a=>`${a.approvals.length} of ${a.required} <span class="xs muted">(${a.approvals.map(x=>userName(x.userId).replace(/^Demo - /,'')).join(', ')})</span>`},
      {label:'',cls:'act',render:a=>`<button class="btn btn-xs btn-primary" data-act="approve-op" data-id="${a.id}" ${a.requestedBy===user.id?'disabled':''}>Approve</button>`}
    ], pending), {sub:'The requester cannot sign twice, and the executing officer must be a different person again where policy requires it.'}) : '')
  + card('Stored copies', table([
      {label:'Backup',render:x=>`<div class="cellname">${esc(x.id)}<span class="sm">${esc(x.label||'Manual')} · ${x.createdBy?esc(userName(x.createdBy)):'system'}</span></div>`},
      {label:'Taken',render:x=>`<span class="small">${fmtDateTime(x.at)}</span>`},
      {label:'Records',cls:'num',render:x=>`<span class="small">${x.counts? num(x.counts.patients||0)+' patients<br>'+num(x.counts.visits||0)+' visits':'-'}</span>`},
      {label:'Integrity',render:x=>`<span class="mono xs" title="Integrity digest">${esc(x.digest||x.hash||'-')}</span><div class="xs muted">${x.bytes?(x.bytes/1024).toFixed(0)+' KB':''}</div>`},
      {label:'Stage',render:x=>{const st=BACKUP.stageOf(x);return `<span class="badge ${st.tone==='ok'?'b-ok':st.tone==='crit'?'b-crit':st.tone==='warn'?'b-warn':'b-neutral'}">${esc(st.label)}</span>`;}},
      {label:'',cls:'act',render:x=>`<div class="row" style="gap:4px;flex-wrap:nowrap">
        ${canOperate?`<button class="btn btn-xs btn-ghost" data-act="backup-validate" data-id="${x.id}">Validate</button>`:''}
        ${canOperate?`<button class="btn btn-xs btn-ghost" data-act="backup-plan" data-id="${x.id}">Migrate plan</button>`:''}
        ${canOperate?`<button class="btn btn-xs btn-ghost" data-act="backup-verify" data-id="${x.id}">Verify</button>`:''}
        ${canOperate?`<button class="btn btn-xs btn-ghost" data-act="backup-activate" data-id="${x.id}">Activate</button>`:''}
        ${x.activation?.executed?`<button class="btn btn-xs btn-ghost" data-act="backup-execute" data-id="${x.activation.approvalId}" data-b="${x.id}">Run restore</button>`:''}
        <button class="btn btn-xs btn-ghost" data-act="backup-report" data-id="${x.id}">Report</button>
        <button class="btn btn-xs btn-ghost" data-act="download-backup" data-id="${x.id}">Download</button></div>`}
    ], backups, {empty:emptyState('No backups yet','Take a backup before any migration, import or restore.','database')}),
    {foot:`<span>${ic('lock',13)} Copies are held inside this installation and are included in every later backup. Download one to an off-device location as part of the weekly routine.</span>`})
  + `<div class="grid g2" style="margin-top:16px">
      ${card('What a restore does and does not do', `<div class="col" style="gap:9px">
        <div class="row" style="gap:8px;align-items:flex-start"><span style="color:var(--ok);flex:0 0 16px">${ic('check',15)}</span><span class="small">Replaces patient, clinical, care, hospital, finance, HR, fleet, media and target records with the copy.</span></div>
        <div class="row" style="gap:8px;align-items:flex-start"><span style="color:var(--ok);flex:0 0 16px">${ic('check',15)}</span><span class="small">Keeps the audit trail, the approval log and the account register as they stand, so a restore cannot rewrite history or change who may sign in.</span></div>
        <div class="row" style="gap:8px;align-items:flex-start"><span style="color:var(--ok);flex:0 0 16px">${ic('check',15)}</span><span class="small">Takes an automatic pre-restore snapshot first. Nothing is deleted by being replaced.</span></div>
        <div class="row" style="gap:8px;align-items:flex-start"><span style="color:var(--warn);flex:0 0 16px">${ic('alert',15)}</span><span class="small">Does not restore accounts, passwords or role templates. Account recovery is a separate, individually audited operation.</span></div>
      </div>`)}
      ${card('Routine', `<div class="col" style="gap:10px">
        <div class="spread"><span class="small">Schedule</span><b>${esc(titleCase(b.schedule||'daily'))}</b></div>
        <div class="spread"><span class="small">Retention</span><b>${esc(b.retention||'30 copies')}</b></div>
        <div class="spread"><span class="small">Off-device copy</span><b>${b.offDeviceAt?fmtDate(b.offDeviceAt):'Not recorded'}</b></div>
        <div class="divider"></div>
        <p class="small muted" style="margin:0">A backup held only on the same computer is not a backup. Download the weekly copy to the encrypted USB volume kept by the County Office Administrator, or to the approved off-site location named in the data protection policy.</p>
      </div>`, {actions:`<button class="btn btn-xs btn-ghost" data-act="go" data-v="settings">Backup settings</button>`})}
    </div>`;
}

/* ---------------- Settings ---------------- */
/* Superseded by views_settings.js renderSettings (13 grouped sections).
   Retained, not routed, so the earlier page can be inspected during review. */
function renderSettingsLegacy(user){
  const s = DB.db.settings;
  return pageHead('Settings','System configuration. Changes are audited and versioned.')
  + `<div class="grid g2">
      ${card('Appearance & behaviour', `
        <div class="field"><label>Department accent</label>
          <select class="input" data-set="accentMode">
            <option value="department" ${s.accentMode==='department'?'selected':''}>Follow department identity</option>
            <option value="lomamo" ${s.accentMode==='lomamo'?'selected':''}>LOMAMO crimson throughout</option>
          </select><div class="hint">Status colours (clinical red, financial amber, success green) are never overridden by theming.</div></div>
        <div class="field"><label>Density</label>
          <select class="input" data-set="density"><option value="comfortable" ${s.density==='comfortable'?'selected':''}>Comfortable (tablet)</option><option value="compact" ${s.density==='compact'?'selected':''}>Compact (desktop)</option></select></div>
        <div class="field"><label class="switch"><input type="checkbox" data-set="animations" ${s.animations?'checked':''}><span class="track"></span> Interface animation</label></div>
        <div class="field"><label class="switch"><input type="checkbox" data-set="sounds" ${s.sounds?'checked':''}><span class="track"></span> Notification sounds</label>
          <div class="hint">Sounds are suppressed during clinical and reconciliation workflows.</div></div>`)}
      ${card('Reporting automation', `
        <div class="field"><label class="switch"><input type="checkbox" data-set="mondayEnabled" ${s.mondayReport.enabled?'checked':''}><span class="track"></span> Generate Monday 08:00 EAT management reports</label></div>
        <div class="field"><label>Next scheduled run</label><input class="input" value="${fmtDateTime(REPORTS.mondayStatus().nextRun)}" disabled></div>
        <div class="field"><label>Last run</label><input class="input" value="${s.mondayReport.lastRun?fmtDateTime(s.mondayReport.lastRun):'Never'}" disabled></div>
        <div class="field"><label>Reporting cut-off</label><input class="input" data-set="reportCutoff" value="${esc(s.reportCutoff)}"></div>
        <div class="row"><button class="btn btn-sm btn-ghost" data-act="monday-now">${ic('refresh',14)} Run scheduled set now</button></div>`)}
      ${card('Local AI assistant', `
        <div class="field"><label class="switch"><input type="checkbox" data-set="aiEnabled" ${s.ai.enabled?'checked':''}><span class="track"></span> Enable assistant</label></div>
        <div class="field"><label>Provider</label><select class="input" data-set="aiProvider">
          <option value="local" ${s.ai.provider==='local'?'selected':''}>Local only (Ollama)</option>
          <option value="disabled" ${s.ai.provider==='disabled'?'selected':''}>Disabled</option></select>
          <div class="hint">External cloud providers are intentionally not offered. Patient data must not leave the organisation's control.</div></div>
        <div class="field"><label>Ollama endpoint</label><input class="input" data-set="ollama" value="${esc(s.ai.ollama)}"></div>
        <div class="field"><label>Model</label><input class="input" data-set="aiModel" value="${esc(s.ai.model)}"></div>
        <div class="row"><button class="btn btn-sm btn-ghost" data-act="probe-ai">${ic('pulse',14)} Test local model</button></div>`)}
      ${card('Security', `
        <div class="field"><label>Minimum password length</label><input class="input" type="number" data-set="pwMin" value="${s.security.passwordMinLength}"></div>
        <div class="field"><label>Idle lock (minutes)</label><input class="input" type="number" data-set="idle" value="${s.idleMinutes}"></div>
        <div class="field"><label class="switch"><input type="checkbox" data-set="sessionLock" ${s.security.sessionLock?'checked':''}><span class="track"></span> Lock session after inactivity</label></div>
        <div class="field"><label>Failed logins before lockout</label><input class="input" type="number" data-set="loginAttempts" value="${s.security.loginAttempts}"></div>
        <div class="divider"></div>
        <button class="btn btn-sm btn-danger" data-act="change-password">${ic('lock',14)} Change my password</button>`)}
    </div>`;
}

/* ---------------- Leadership ---------------- */
function renderExecutive(user){
  const ex = REPORTS.executive(user);
  const figs = COUNTIES.map(c=>({label:c.code, value:(()=>{try{return REPORTS.patientFigures(user,{countyId:c.id}).active.length}catch(e){return 0}})()}));
  return pageHead('Executive summary','Organisation-wide position within your authorised visibility.',
    `<button class="btn btn-sm btn-primary" data-act="generate" data-type="executive">${ic('file',14)} Generate report</button>`)
  + `<div class="grid g4" style="margin-bottom:16px">
      ${kpi('Active patients', num(ex.counties.reduce((n,c)=>n+c.active,0)),'Both county offices','','users')}
      ${kpi('Discharged', num(ex.counties.reduce((n,c)=>n+c.discharged,0)),'Cumulative','info','check')}
      ${kpi('Hospital requests', num(ex.counties.reduce((n,c)=>n+c.requests,0)),'All time','','hospital')}
      ${kpi('Critical data findings', num(ex.quality.filter(q=>q.level==='crit').length),'Require correction', ex.quality.filter(q=>q.level==='crit').length?'crit':'ok','alert')}
    </div>`
  + `<div class="grid g2" style="margin-bottom:16px">
      ${card('Active caseload by county', barChart(figs))}
      ${card('County comparison', table([
        {label:'County',render:c=>`<div class="cellname">${esc(c.county.name)}<span class="sm">${c.county.areas.length} areas</span></div>`},
        {label:'Active',cls:'num',render:c=>num(c.active)},
        {label:'Discharged',cls:'num',render:c=>num(c.discharged)},
        {label:'Requests',cls:'num',render:c=>num(c.requests)},
        {label:'Budget',cls:'num',render:c=>money(c.budget)}
      ], ex.counties))}
    </div>`
  + card('Organisational risk register', `<div class="col" style="gap:11px">
      ${alertBox('warn','Homa Bay ministry-area list unverified','<span class="small">Field import for Homa Bay should wait for confirmation of the full service-area list.</span>')}
      ${alertBox('info','Storytelling policy not yet adopted','<span class="small">The Patient Confidentiality & Ethical Storytelling Policy remains PROPOSED pending executive approval.</span>')}
      ${alertBox('warn','Hospital evidence gaps','<span class="small">Reconciliation depends on hospital focal person receipt submission; missing evidence is tracked per case and reported weekly.</span>')}
      ${alertBox('ok','Access control rebuilt','<span class="small">Cross-department and cross-county visibility is now denied at the data layer; the authorisation self-test passes.</span>')}
    </div>`);
}
function renderCompare(user){
  const ex = REPORTS.executive(user);
  const rows = ['active','discharged','requests'].map(k=>({
    label:titleCase(k),
    values:ex.counties.map(c=>({county:c.county.code, value:c[k]}))
  }));
  return pageHead('County comparison','Aggregate comparison only. Clinical detail remains restricted.')
  + `<div class="grid g2">${ex.counties.map(c=>card(c.county.name, `
      <div class="dl">
        <dt>Active patients</dt><dd>${num(c.active)}</dd>
        <dt>Discharged</dt><dd>${num(c.discharged)}</dd>
        <dt>Hospital requests</dt><dd>${num(c.requests)}</dd>
        <dt>Ministry areas</dt><dd>${c.county.areas.length}</dd>
        <dt>Monthly budget</dt><dd>${money(c.budget)}</dd>
      </div>`, {sub:esc(c.county.code)+' county office'}))
    .join('')}</div>`;
}
