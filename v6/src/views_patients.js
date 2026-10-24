/* ============================================================
   views_patients.js - Console home, patient register,
   patient record, assessment pipeline, attention engine,
   visits and PDCA.
   ============================================================ */

const PAT = {
  days:p => Math.max(0, daysBetween(p.intake||p.created||new Date(), p.status==='discharged'&&p.discharge? p.discharge: new Date())),
  lastVisit:p => DB.visitsFor(p.id)[0]||null,
  openPdca:p => DB.db.pdcas.filter(x=>x.patientId===p.id&&x.status==='open').length,
  concerns:p => DB.db.concerns.filter(c=>c.patientId===p.id&&c.status==='open'),
  openRequest:p => DB.db.requests.filter(r=>r.patientId===p.id&&!['closed','rejected'].includes(r.status))[0]||null
};

/* ---------------- Home ---------------- */
function renderHome(user){
  const role = roleObj(user.roleId)||{}; const st = repo.stats(user);
  const figs = (RBAC.has(user,'report.patient_figures')) ? REPORTS.patientFigures(user,{}) : null;
  const today = new Date();
  const monday = REPORTS.mondayStatus();

  const qtabs = (typeof ROLE_CTX!=='undefined' && ROLE_CTX.heroQuickTabs) ? ROLE_CTX.heroQuickTabs(user) : [];
  const qtabsHtml = qtabs.length
    ? `<div class="hero-qtabs">${qtabs.map(qt=>`
        <button class="hero-qtab ${qt.alert?'is-alert':''}" data-act="go" data-v="${esc(qt.v)}">
          <span class="hq-top">${ic(qt.icon||'file',13)} <span class="hq-lbl">${esc(qt.label)}</span></span>
          <b class="hq-num">${num(qt.count)}</b>
        </button>`).join('')}</div>`
    : '';

  const hero = `<div class="panel home-hero" style="margin-bottom:18px">
    <div class="spread hero-row" style="align-items:flex-start;position:relative;gap:16px">
      <div class="hero-text">
        <div class="hero-dept-pill">${esc(countyName(user.countyId))} · ${esc(deptName(user.departmentId))}</div>
        <h2 style="margin-top:8px">${greeting()}, ${esc(user.name.replace(/^Demo - /,''))}</h2>
        <p>${esc(role.consoleTitle||'Console')} - ${esc(today.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'}))}. ${scopeSentence(user)}</p>
        <div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap">${homeHeroActions(user)}</div>
      </div>
      ${qtabsHtml}
    </div>
  </div>`;

  const mods = [];
  const id = user.roleId;

  if(['caregiver','chw'].includes(id)) mods.push(...caregiverHome(user,st));
  else if(id==='coordinator') mods.push(...coordinatorHome(user,st,figs));
  else if(id==='assistant') mods.push(...assistantHome(user,st,figs));
  else if(id==='countyadmin') mods.push(...countyAdminHome(user,st,figs));
  else if(id==='mcm') mods.push(...mcmHome(user,st));
  else if(id==='liaison') mods.push(...liaisonHome(user,st));
  else if(id==='nurse'||id==='homestay') mods.push(...nurseHome(user,st));
  else if(id==='finance') mods.push(...financeHome(user));
  else if(id==='procurement') mods.push(...procurementHome(user));
  else if(id==='me'||id==='intldata') mods.push(...meHome(user));
  else if(id==='auditor') mods.push(...auditorHome(user));
  else if(id==='mediahead') mods.push(...mediaHome(user));
  else if(id==='hr'||id==='welfare') mods.push(...peopleHome(user));
  else if(id==='vehicle') mods.push(...fleetHome(user));
  else if(id==='pr') mods.push(...mediaHome(user));
  else if(['chief','director','president','depthead','it','program','program.admin','program.assistant'].includes(id)) mods.push(...leadershipHome(user,st));

  /* Every departmental console carries the cost of its own service. */
  const deptCost = departmentCostCard(user);
  if(deptCost) mods.push(deptCost);

  if(!mods.length) mods.push(card('Your workspace', emptyState('Console ready','This role has no operational modules configured yet.','info')));

  /* The arrangement is personal. DASH.apply keeps the modules the role can
     already use and reorders or hides them as this person chose. */
  DASH.remember(mods);
  const arranged = DASH.apply(user, mods);
  const tiles = arranged.slice(0,4), rest = arranged.slice(4);
  const arrangeBtn = `<div class="row" style="justify-content:flex-end;margin:-6px 0 10px">
    <button class="btn btn-xs btn-ghost" data-act="arrange-home">${ic('settings',13)} Arrange this console</button></div>`;
  return hero + arrangeBtn + `<div class="grid g4" style="margin-bottom:18px">${tiles.join('')}</div>` + rest.join('');
}
function greeting(){ const h=new Date().getHours(); return h<12?'Good morning':h<17?'Good afternoon':'Good evening'; }
function scopeSentence(user){
  const s = (roleObj(user.roleId)||{}).scope||{};
  if(s.geo==='global') return 'Your authority covers both county offices.';
  if(s.records==='assigned') return 'You see only assignments made to you.';
  if(s.geo==='areas') return 'Your authority covers '+(user.areaIds||[]).map(areaName).join(', ')+'.';
  return 'Your authority covers '+countyName(user.countyId)+'.';
}
function homeHeroActions(user){
  const b=[];
  if(RBAC.has(user,'patient.assess.create')) b.push(`<button class="btn btn-primary" data-act="new-assessment">${ic('plus',16)} New assessment</button>`);
  if(RBAC.has(user,'patient.digitise')) b.push(`<button class="btn btn-primary" data-act="go" data-v="pipeline">${ic('clipboard',16)} Digitise forms</button>`);
  if(RBAC.has(user,'report.patient_figures')) b.push(`<button class="btn btn-ghost" data-act="go" data-v="reports">${ic('file',16)} Reports</button>`);
  if(RBAC.has(user,'hosp.request.review')) b.push(`<button class="btn btn-ghost" data-act="go" data-v="requests">${ic('hospital',16)} Review requests</button>`);
  if(!b.length){
    /* The role's own lead page, so the button never leads somewhere the role is refused. */
    const lead = NAVP.groups(user).filter(g=>g.label!=='Overview').map(g=>g.items[0]).filter(Boolean)[0];
    if(lead) b.push(`<button class="btn btn-ghost" data-act="go" data-v="${esc(lead.id)}">${ic(lead.icon,16)} ${esc(lead.label)}</button>`);
  }
  return b.join('');
}

/* The field console answers the two questions a coordinator and a caregiver are
   accountable for: what did serving my households cost, and when am I in the
   field? Both are read from the same tables the finance and HR consoles read,
   inside this person's own ministry area - never the ledger of another area. */
function ministryAreaCostCard(user){
  if(typeof COSTX==='undefined' || !(RBAC.has(user,'cost.view')||RBAC.has(user,'finance.view'))) return '';
  const areas = user.areaIds||[];
  const rows = areas.map(id=>{
    const c = COSTX.areaCost(user, id);
    const t = (typeof TEAMX!=='undefined')? TEAMX.byArea(id) : null;
    return { areaId:id, ...c, team:t };
  });
  if(!rows.length) return '';
  const total = rows.reduce((n,r)=>n+r.total,0);
  const patients = rows.reduce((n,r)=>n+r.patients,0);
  const colours = chartColours(6);
  return card('Cost of serving my ministry area'+(rows.length>1?'s':''), `
    <div class="grid g3 cost-mini" style="margin-bottom:12px">
      <div class="cm"><span class="cm-l">Total expenditure</span><b class="cm-v">${money(Math.round(total))}</b><span class="cm-s">Attributed to patients you serve</span></div>
      <div class="cm"><span class="cm-l">Average per patient</span><b class="cm-v">${money(Math.round(patients? total/patients : 0))}</b><span class="cm-s">${num(patients)} patients with a recorded cost</span></div>
      <div class="cm"><span class="cm-l">Field days</span><b class="cm-v">${esc(rows.map(r=>r.team && (r.team.visitDays||[]).length? r.team.visitDays.map(d=>DAY_SHORT[d]).join('/') : '—').filter((v,i,a)=>a.indexOf(v)===i).join(' · '))}</b><span class="cm-s">${esc(rows.map(r=>areaName(r.areaId)).join(', '))}</span></div>
    </div>
    ${chartRows({ rows: rows.map((r,i)=>({ label:areaName(r.areaId), value:Math.round(r.total) })), fmt:v=>money(v),
      title:'Expenditure by ministry area', valueHead:'Expenditure', labelHead:'Ministry area', unit:'KES',
      colours:colours })}
    <div style="margin-top:12px">${table([
      {label:'Ministry area',render:r=>`<div class="cellname">${esc(areaName(r.areaId))}</div>${r.team&&r.team.confirmed===false?`<div class="xs muted">Visit day provisional</div>`:''}`},
      {label:'Expenditure',cls:'num',render:r=>money(Math.round(r.total))},
      {label:'Patients',cls:'num',render:r=>num(r.patients)},
      {label:'Average / patient',cls:'num',render:r=>`<b>${money(Math.round(r.avg))}</b>`},
      {label:'Largest cost',render:r=>{ const top=(r.byCat||[])[0]; return top? `${esc(costCatName(top.key))}<div class="xs muted">${money(Math.round(top.total))}</div>` : '<span class="xs muted">-</span>'; }},
      {label:'Home visit day',render:r=>r.team&&r.team.visitDays&&r.team.visitDays.length? esc(r.team.visitDays.map(d=>DAY_NAMES[d]).join(' & ')) : '<span class="xs muted">To be fixed</span>'}
    ], rows)}</div>`,
    { sub:'Food bags by type, transport, hospital fees, medication, SHIF and in-patient care, attributed to the patients you serve.',
      actions:`<button class="btn btn-xs btn-ghost" data-act="go" data-v="costing" data-tab="area">${ic('chart',13)} Full cost analysis</button>`,
      foot:'<span>You see the cost of your own ministry areas. Another area\u2019s ledger is not returned by the data layer.</span>' });
}

/* Every department sees the cost of its own service in its own console - the
   pharmacy sees drugs, the hospital desk sees hospital fees, the fleet sees
   transport, procurement sees what it bought, Finance and Audit see the whole
   picture inside their reach. It is the same engine, the same numbers and the
   same scope rules as the Cost per patient console; only the lens differs. */
function departmentCostCard(user){
  if(typeof COSTX==='undefined') return '';
  if(!(RBAC.has(user,'cost.view')||RBAC.has(user,'finance.view'))) return '';
  const lens = COSTX.lensFor(user);
  const s = COSTX.summary(user, {});
  if(!s.lineCount) return '';
  const colours = chartColours(8);
  const months = s.byMonth.slice(-8);
  const role = roleObj(user.roleId)||{};
  const isField = ['caregiver','coordinator','chw'].includes(user.roleId);
  if(isField) return '';   /* the field consoles carry ministryAreaCostCard instead */
  return card(`Cost of ${esc(lens.label.toLowerCase())}`, `
    <div class="grid g3 cost-mini" style="margin-bottom:12px">
      <div class="cm"><span class="cm-l">Expenditure in your lens</span><b class="cm-v">${money(Math.round(s.total))}</b><span class="cm-s">${num(s.lineCount)} attributed cost lines</span></div>
      <div class="cm"><span class="cm-l">Average per patient</span><b class="cm-v">${money(Math.round(s.avgPerPatient))}</b><span class="cm-s">${num(s.patientCount)} patients</span></div>
      <div class="cm"><span class="cm-l">Cost per patient-day</span><b class="cm-v">${money(Math.round(s.costPerPatientDay*100)/100)}</b><span class="cm-s">${num(s.patientDays)} patient-days</span></div>
    </div>
    <div class="grid g2">
      <div>${chartDonut(s.byCat.slice(0,6).map((c,i)=>({label:costCatName(c.key), value:Math.round(c.total), color:(COST_CAT[c.key]||{}).colour||colours[i%colours.length]})),
        {title:'Cost mix in your lens', size:158, fmt:v=>money(v), centerValue:money(Math.round(s.total)), centerLabel:'LENS TOTAL'})}</div>
      <div>${months.length>1? chartLine({labels:months.map(m=>m.key.slice(5)+'/'+m.key.slice(2,4)),
        series:[{label:'Expenditure', values:months.map(m=>Math.round(m.total)), color:colours[0]},
                {label:'Average per patient', values:months.map(m=>Math.round(m.avg)), color:colours[2]}],
        fmt:v=>money(v), height:190, title:'Monthly cost in your lens', values:false, markers:false})
        : chartRows({rows:s.byArea.slice(0,6).map(a=>({label:areaName(a.key), value:Math.round(a.total)})), fmt:v=>money(v), title:'Expenditure by ministry area', valueHead:'Expenditure'})}</div>
    </div>`,
    { sub:`${esc((deptObj(user.departmentId)||{}).name||role.name||'Your department')} · reach: ${esc(lens.label)}. ${s.canSeeDisease? 'Disease-level cost is available in the full analysis.' : 'Disease-level cost needs clinical aggregate authority.'}`,
      actions:`<button class="btn btn-xs btn-ghost" data-act="go" data-v="costing" data-tab="${lens.scope==='department'?'dept':'overview'}">${ic('chart',13)} Open cost analysis</button>`,
      foot:'<span>Attributed from transactions, support issues, visit forms, hospital requests and TB dispensing. Receipts take precedence over unit cost standards.</span>' });
}

function caregiverHome(user,st){
  const ps = repo.patientList(user,{}).filter(p=>['active','extension','discharge_recommended'].includes(p.status));
  const overdue = ps.filter(p=>{ const lv=PAT.lastVisit(p); return !lv || daysBetween(lv.date)>21; });
  const reqs = repo.requests(user).filter(r=>!['closed','rejected'].includes(r.status));
  const visitsWeek = DB.db.visits.filter(v=>v.caregiverId===user.id && daysBetween(v.date)<7);
  return [
    kpi('My active patients', num(ps.length), `${(user.areaIds||[]).map(areaName).join(' · ')||'-'}`,'',"users"),
    kpi('Visits this week', num(visitsWeek.length), visitsWeek.length?`Last: ${fmtDate(visitsWeek[0].date)}`:'No visit recorded yet','info','activity'),
    kpi('Overdue follow-up', num(overdue.length), overdue.length?'Patients past 21 days without a visit':'All visits current', overdue.length?'crit':'ok','clock'),
    kpi('Open hospital requests', num(reqs.length), `${reqs.filter(r=>r.status==='submitted').length} awaiting clinical review`,'',"hospital"),
    kpi('Care-plan reviews due', num(PDCAX.due(user,{days:14}).length), PDCAX.due(user,{days:14}).filter(x=>x.review.status==='overdue').length+' overdue', PDCAX.due(user,{days:14}).some(x=>x.review.status==='overdue')?'crit':'','repeat'),
    ...(PDCAX.due(user,{days:14}).length? [card('Reviews due', table([
        {label:'Patient', render:x=>`<div class="cellname">${esc(x.patient.code)}<span class="sm">${esc(areaName(x.patient.areaId))}</span></div>`},
        {label:'Review', render:x=>`Day ${x.review.day}`},
        {label:'Due', render:x=>`${fmtDate(x.review.due)} ${x.review.status==='overdue'?badge('Overdue','b-crit'):badge('Due in '+x.days+'d','b-warn')}`},
        {label:'', cls:'right', render:x=>`<button class="btn btn-xs btn-primary" data-act="pdca-complete" data-id="${x.patient.id}" data-day="${x.review.day}">Record</button>`}
      ], PDCAX.due(user,{days:14}).slice(0,6)), {sub:'Every 30 days from enrolment. Late completion stays visible as late.'})] : []),
    ...(ministryAreaCostCard(user)? [ministryAreaCostCard(user)] : []),
    card('Quick actions', `<div class="action-grid">
      ${actionCard('patient.assess.create','New patient assessment','Start from the paper form','clipboard','new-assessment')}
      ${actionCard('visit.create','Record home visit','Visit findings & weight','activity','record-visit')}
      ${actionCard('hosp.request.create','Hospital request','Referral, transport & escort','hospital','new-request')}
      ${actionCard('media.upload','Upload documents','Forms, CCC card, photographs','upload','upload-doc')}
      ${actionCard('pdca.create','PDCA cycle','Plan-Do-Check-Act','repeat','new-pdca')}
      ${actionCard('patient.discharge.recommend','Recommend discharge','With documented evidence','check','discharge-review')}
    </div>`, {sub:'Every action is recorded against your ministry area and is auditable.'}),
    card('My patients - longest in programme',
      table([
        {label:'Patient',render:p=>`<div class="cellname">${esc(p.name)}<span class="sm">${esc(p.code)} · ${esc(areaName(p.areaId))}</span></div>`},
        {label:'Status',render:p=>pBadge(p.status)},
        {label:'Days',cls:'num',render:p=>`<b>${PAT.days(p)}</b>`},
        {label:'Last visit',render:p=>{const v=PAT.lastVisit(p);return v?`${fmtDate(v.date)}<span class="xs muted"> ${esc(v.outcome)}</span>`:'<span class="badge b-crit">none</span>';}},
        {label:'',cls:'act',render:p=>`<button class="btn btn-xs btn-ghost" data-act="open-patient" data-id="${p.id}">Open</button>`}
      ], ps.sort((a,b)=>PAT.days(b)-PAT.days(a)).slice(0,7), {click:false}),
      {foot:`<span>${ic('info',13)} Programme duration alone never triggers discharge - a documented evaluation does.</span>`,
       actions:`<button class="btn btn-xs btn-ghost" data-act="go" data-v="patients">All patients ${ic('chevron',13)}</button>`}),
    attentionCard(user, ps)
  ];
}
function coordinatorHome(user,st,figs){
  const ps = repo.patientList(user,{});
  const byCare = {};
  ps.forEach(p=>{ byCare[p.caregiverId]=(byCare[p.caregiverId]||0)+1; });
  const rows = Object.entries(byCare).map(([k,v])=>({label:userName(k).replace(/^Demo - /,''),value:v})).sort((a,b)=>b.value-a.value);
  return [
    kpi('Ministry-area caseload', num(ps.filter(p=>['active','extension'].includes(p.status)).length), (user.areaIds||[]).map(areaName).join(' · '),'',"users"),
    kpi('New this week', num(figs?figs.enrolledPeriod.length:0), 'Enrolments in the reporting week','info','plus'),
    kpi('Discharge recommendations', num(ps.filter(p=>p.status==='discharge_recommended').length), 'Awaiting county approval','warn','check'),
    kpi('Open concerns', num(DB.db.concerns.filter(c=>ps.some(p=>p.id===c.patientId)&&c.status==='open').length), 'Clinical and administrative','',"alert"),
    card('Caregiver caseload distribution', rows.length?barChart(rows):emptyState('No caregivers assigned','Assign caregivers to these ministry areas.','users'), {sub:'Distribution across your area only. Patient counts are never used to rank staff without context.'}),
    ...(ministryAreaCostCard(user)? [ministryAreaCostCard(user)] : []),
    attentionCard(user, ps.filter(p=>['active','extension'].includes(p.status))),
    card('Discharge recommendations', (()=>{
      const rows = ps.filter(p=>p.status==='discharge_recommended');
      return table([
        {label:'Patient',render:p=>`<div class="cellname">${esc(p.name)}<span class="sm">${esc(p.code)}</span></div>`},
        {label:'Days',cls:'num',render:p=>PAT.days(p)},
        {label:'Recommended by',render:p=>esc(userName(p.dischargeRecommendation?.by))},
        {label:'',cls:'act',render:p=>`<button class="btn btn-xs btn-ghost" data-act="open-patient" data-id="${p.id}">Review</button>`}
      ],rows,{empty:emptyState('No pending recommendations','Discharge recommendations appear here for clinical and administrative review.','check')});
    })())
  ];
}
function assistantHome(user,st,figs){
  const pipe = repo.patientList(user,{}).filter(p=>['digital_entered','awaiting_verification','returned','approved_enrolment'].includes(p.status));
  const toVerify = pipe.filter(p=>p.status==='awaiting_verification');
  return [
    kpi('Awaiting digitisation', num(pipe.filter(p=>p.status==='digital_entered'||p.status==='returned').length), 'Physical forms received','',"clipboard"),
    kpi('Awaiting verification', num(toVerify.length), 'Check against source documents', toVerify.length?'warn':'ok','eye'),
    kpi('Approved for enrolment', num(pipe.filter(p=>p.status==='approved_enrolment').length), 'Ready to enrol','info','check'),
    kpi('Active caseload', num(st.active), countyName(user.countyId),'','users'),
    card('Verification queue - highest priority first', table([
      {label:'Applicant',render:p=>`<div class="cellname">${esc(p.name)}<span class="sm">${esc(p.code)} · ${esc(areaName(p.areaId))}</span></div>`},
      {label:'State',render:p=>pBadge(p.status)},
      {label:'Received',render:p=>fmtDate(p.intake)},
      {label:'Duplicate check',render:p=>p.flags?.includes('duplicate_check_pending')?badge('pending','b-warn'):badge('clear','b-ok')},
      {label:'',cls:'act',render:p=>`<button class="btn btn-xs btn-primary" data-act="open-patient" data-id="${p.id}">Process</button>`}
    ], pipe.slice(0,8), {empty:emptyState('Queue clear','All submitted physical forms have been processed.','check')}),
      {foot:'<span>'+ic('shield',13)+' Source documents are preserved; every correction is versioned.</span>',
       actions:`<button class="btn btn-xs btn-ghost" data-act="go" data-v="pipeline">Full pipeline ${ic('chevron',13)}</button>`}),
    card('This week at a glance', figs?`<div class="grid g2">
      <div class="dl">
        <dt>New assessed</dt><dd>${figs.newAssessed.length}</dd>
        <dt>Enrolled</dt><dd>${figs.enrolledPeriod.length}</dd>
        <dt>Discharged</dt><dd>${figs.dischargedPeriod.length}</dd>
        <dt>Requiring follow-up</dt><dd>${figs.followup.length}</dd>
      </div>
      <div class="dl">
        <dt>Foodbags issued</dt><dd>${figs.support['Foodbag']||0}</dd>
        <dt>Bibles</dt><dd>${figs.support['Bible']||0}</dd>
        <dt>Mosquito nets</dt><dd>${figs.support['Mosquito net']||0}</dd>
        <dt>Not found at home</dt><dd>${figs.notFound.length}</dd>
      </div></div>
      <div class="divider"></div>
      ${note('Figures follow the documented indicator definitions. Every number in the Monday report is traceable to a source record.')}`:'', {sub:'Reporting week: '+PERIOD.week().label}),
    card('Monday management reports', mondayCardBody(user))
  ];
}
function countyAdminHome(user,st,figs){
  let fin=null; try{ fin=REPORTS.expenditure(user,{}); }catch(e){}
  const pendingAccounts = DB.db.accountRequests.filter(a=>a.countyId===user.countyId&&['submitted','under_review'].includes(a.status));
  const awaitingAssign = repo.requests(user).filter(r=>r.status==='approved');
  return [
    kpi('Active caseload', num(st.active), `${countyName(user.countyId)} · ${st.pipeline} in pipeline`,'','users'),
    kpi('Awaiting verification', num(st.pipeline), 'Administrative bottleneck measure', st.pipeline>6?'warn':'ok','clipboard'),
    fin?kpi('Budget remaining', money(fin.tot.remaining), `${pct(fin.tot.paid+fin.tot.committed,fin.tot.budget)}% of ${money(fin.tot.budget)} used`, fin.tot.remaining<0?'crit':'',"wallet"):'',
    kpi('Hospital queue', num(awaitingAssign.length), 'Approved, awaiting focal person assignment', awaitingAssign.length?'warn':'ok','hospital'),
    card('Finance position this month', fin?`<div class="grid g2" style="align-items:center">
      <div>${barChart(fin.rows.filter(r=>r.budget).slice(0,6).map(r=>({label:r.cat.name,value:r.paid})),{fmt:v=>money(v)})}</div>
      <div><div class="dl">
        <dt>Budgeted</dt><dd>${money(fin.tot.budget)}</dd>
        <dt>Committed</dt><dd>${money(fin.tot.committed)}</dd>
        <dt>Paid</dt><dd>${money(fin.tot.paid)}</dd>
        <dt>Reconciled</dt><dd>${money(fin.tot.reconciled)}</dd>
        <dt><b>Remaining available</b></dt><dd><b>${money(fin.tot.remaining)}</b></dd>
      </div><div style="margin-top:12px">${fin.flags.length?alertBox('warn',fin.flags.length+' evidence exceptions','Missing receipts or duplicate references require action before reconciliation.'):alertBox('ok','Evidence complete','No receipt exceptions detected.')}</div></div>
    </div>`:'', {sub:fin?fin.period.label:'', actions:`<button class="btn btn-xs btn-ghost" data-act="go" data-v="finance">Finance console ${ic('chevron',13)}</button>`}),
    card('Approved requests awaiting assignment', table([
      {label:'Request',render:r=>`<div class="cellname">${esc(r.no)}<span class="sm">${esc(r.reason.slice(0,52))}</span></div>`},
      {label:'Patient',render:r=>esc(DB.db.patients.find(p=>p.id===r.patientId)?.name||'-')},
      {label:'Priority',render:r=>badge(titleCase(r.priority), r.priority==='critical'?'b-crit':r.priority==='urgent'?'b-warn':'b-neutral')},
      {label:'',cls:'act',render:r=>`<button class="btn btn-xs btn-ghost" data-act="open-request" data-id="${r.id}">Assign</button>`}
    ],awaitingAssign.slice(0,6),{empty:emptyState('Nothing awaiting assignment','Approved requests are assigned to liaison persons immediately.','check')})),
    card('Account requests', table([
      {label:'Name',render:a=>`<div class="cellname">${esc(a.name)}<span class="sm">${esc(a.jobTitle||'')}</span></div>`},
      {label:'Requested by',render:a=>esc(userName(a.requestedBy))},
      {label:'Status',render:a=>badge(titleCase(a.status),a.status==='submitted'?'b-warn':'b-neutral')},
      {label:'',cls:'act',render:a=>`<button class="btn btn-xs btn-primary" data-act="review-account" data-id="${a.id}">Review</button>`}
    ],pendingAccounts,{empty:emptyState('No pending account requests','Account requests from coordinators and department heads appear here for approval.','userplus')}))
  ];
}
function mcmHome(user,st){
  const reqs = repo.requests(user);
  const review = reqs.filter(r=>r.status==='submitted');
  const ps = repo.patientList(user);
  const clinical = DB.db.concerns.filter(c=>c.level==='clinical'&&c.status==='open'&&ps.some(p=>p.id===c.patientId));
  const refsUnverified = DB.db.referralEntities.filter(e=>e.status!=='verified');
  return [
    kpi('Awaiting clinical review', num(review.length), review.filter(r=>r.priority!=='routine').length+' urgent or critical', review.length?'warn':'ok','hospital'),
    kpi('Clinical concerns open', num(new Set(clinical.map(c=>c.patientId)).size), 'Evidence-based, not administrative', 'crit','alert'),
    kpi('Discharge approvals', num(ps.filter(p=>p.status==='discharge_recommended').length), 'Requires documented evidence','warn','check'),
    kpi('Referral entities to verify', num(refsUnverified.length), 'Master Referral register','','link'),
    kpi('Extended cases to review', num(ps.filter(p=>PDCAX.extensionRequired(p)).length), 'Beyond the approved programme threshold', ps.some(p=>PDCAX.extensionRequired(p))?'warn':'ok','repeat'),
    card('Requests awaiting your clinical decision', table([
      {label:'Request',render:r=>`<div class="cellname">${esc(r.no)} <span class="badge ${r.priority==='critical'?'b-crit':r.priority==='urgent'?'b-warn':'b-neutral'} nodot" style="margin-left:6px">${esc(r.priority)}</span><span class="sm">${esc(r.reason)}</span></div>`},
      {label:'Patient',render:r=>{const p=DB.db.patients.find(x=>x.id===r.patientId);return p?`${esc(p.name)}<span class="xs muted"> ${esc(areaName(p.areaId))}</span>`:'-';}},
      {label:'Submitted',render:r=>fmtDate(r.submittedAt)},
      {label:'',cls:'act',render:r=>`<button class="btn btn-xs btn-primary" data-act="open-request" data-id="${r.id}">Review ${ic('chevron',12)}</button>`}
    ], review, {empty:emptyState('No requests awaiting review','All clinical decisions are up to date.','check')}),
      {foot:`<span>${ic('shield',13)} Approval of a medical request does not authorise payment. Financial authorisation is a separate step.</span>`}),
    card('Clinical priority list', table([
      {label:'Patient',render:c=>{const p=DB.db.patients.find(x=>x.id===c.patientId);return p?`<div class="cellname">${esc(p.name)}<span class="sm">${esc(areaName(p.areaId))} · ${esc(PAT.days(p))} days</span></div>`:'-';}},
      {label:'Concern',render:c=>esc(titleCase(c.type))},
      {label:'Evidence',render:c=>`<span class="small muted">${esc(c.detail)}</span>`},
      {label:'',cls:'act',render:c=>`<button class="btn btn-xs btn-ghost" data-act="open-patient" data-id="${c.patientId}">Case</button>`}
    ], clinical.slice(0,8), {empty:emptyState('No clinical concerns','Clinical concerns raised by authorised personnel appear here.','check')}),
      {sub:'Clinical urgency is separated from administrative urgency.'}),
    card('Referral register status', table([
      {label:'Entity',render:e=>`<div class="cellname">${esc(e.name)}<span class="sm">${esc(e.type)} · ${esc(e.county)}</span></div>`},
      {label:'Status',render:e=>badge(titleCase(e.status),e.status==='verified'?'b-ok':'b-warn')},
      {label:'Patients',cls:'num',render:e=>repo.patientList(user,{}).filter(p=>p.referralEntityId===e.id).length},
      {label:'',cls:'act',render:e=>e.status==='verified'?'':`<button class="btn btn-xs btn-ghost" data-act="verify-referral" data-id="${e.id}">Verify</button>`}
    ], DB.db.referralEntities),
      {actions:`<button class="btn btn-xs btn-primary" data-act="generate" data-type="referral">${ic('file',12)} Master Referral Document</button>`})
  ];
}
function liaisonHome(user,st){
  const mine = repo.requests(user);
  const active = mine.filter(r=>r.status==='assigned');
  const pendingEvidence = mine.filter(r=>r.status==='completed');
  const result = mine.filter(r=>r.status==='reconciled');
  return [
    kpi('My active assignments', num(active.length), 'Approved & assigned to you','','route'),
    kpi('Evidence pending', num(pendingEvidence.length), 'Service done, receipts or report outstanding', pendingEvidence.length?'warn':'ok','receipt'),
    kpi('Reconciled', num(result.length), 'Reviewed by finance','ok','check'),
    kpi('Next appointment', (()=>{const n=active.filter(r=>r.preferredDate).sort((a,b)=>new Date(a.preferredDate)-new Date(b.preferredDate))[0];return n?fmtDate(n.preferredDate):'-';})(), 'Across your assignments','info','calendar'),
    card('My assignments', table([
      {label:'Request',render:r=>`<div class="cellname">${esc(r.no)}<span class="sm">${esc(r.facility)}</span></div>`},
      {label:'Patient',render:r=>esc(DB.db.patients.find(p=>p.id===r.patientId)?.name||'-')},
      {label:'Appointment',render:r=>fmtDate(r.preferredDate)},
      {label:'Transport',render:r=>r.transport?.required?badge('Required '+money(r.transport.fare),'b-info'):badge('Not requested','b-neutral')},
      {label:'Status',render:r=>rBadge(r.status)},
      {label:'',cls:'act',render:r=>`<button class="btn btn-xs ${r.status==='assigned'?'btn-primary':'btn-ghost'}" data-act="open-request" data-id="${r.id}">${r.status==='assigned'?'Record service':'Open'}</button>`}
    ], mine.slice(0,10), {empty:emptyState('No assignments','Assigned hospital visits appear here.','route')}),
      {foot:`<span>${ic('lock',13)} You see only the patients assigned to you - not the wider caseload.</span>`}),
    card('Transport & escort arrangements', (()=>{
      const t = mine.filter(r=>r.transport?.required&&r.status!=='closed');
      return table([
        {label:'Patient',render:r=>esc(DB.db.patients.find(p=>p.id===r.patientId)?.name||'-')},
        {label:'Journey',render:r=>esc(r.transport.journey)},
        {label:'Persons',cls:'num',render:r=>r.transport.persons},
        {label:'Est. fare',cls:'num',render:r=>money(r.transport.fare)},
        {label:'Payment',render:r=>badge(['approved','assigned','completed'].includes(r.status)?'Authorised':'Pending','b-ok')}
      ], t, {empty:emptyState('No transport arrangements','Transport requests appear once approved by the clinical team.','car')});
    })())
  ];
}
function nurseHome(user,st){
  const ps = repo.patientList(user,{}).filter(p=>['active','extension'].includes(p.status));
  const clinical = DB.db.concerns.filter(c=>c.level==='clinical'&&c.status==='open'&&ps.some(p=>p.id===c.patientId));
  const pdca = DB.db.pdcas.filter(x=>x.status==='open'&&ps.some(p=>p.id===x.patientId));
  const pSet = new Set(ps.map(p=>p.id));
  return [
    kpi('Clinical caseload', num(ps.length), countyName(user.countyId),'','users'),
    kpi('Clinical concerns', num(clinical.length), 'Evidence recorded by clinicians','crit','alert'),
    kpi('PDCA cycles open', num(pdca.length), 'Awaiting check or act','warn','repeat'),
    kpi('Visits recorded (7 days)', num(DB.db.visits.filter(v=>pSet.has(v.patientId)&&daysBetween(v.date)<7).length), 'Across your county','info','activity'),
    card('Patients with clinical concerns', table([
      {label:'Patient',render:c=>{const p=DB.db.patients.find(x=>x.id===c.patientId);return p?`<div class="cellname">${esc(p.name)}<span class="sm">${esc(p.clinical.diagnosis)}</span></div>`:'-';}},
      {label:'Concern',render:c=>esc(titleCase(c.type))},
      {label:'Recorded',render:c=>fmtDate(c.opened)},
      {label:'',cls:'act',render:c=>`<button class="btn btn-xs btn-ghost" data-act="open-patient" data-id="${c.patientId}">Open case</button>`}
    ], clinical,{empty:emptyState('No clinical concerns','Clinical concerns raised by authorised personnel appear here.','check')})),
    card('PDCA follow-up requiring review', table([
      {label:'Patient',render:c=>esc(DB.db.patients.find(x=>x.id===c.patientId)?.name||'-')},
      {label:'Plan',render:c=>`<span class="small">${esc(c.plan)}</span>`},
      {label:'Stage',render:c=>badge(c.stage,'b-info')},
      {label:'Due',render:c=>fmtDate(c.due)},
      {label:'',cls:'act',render:c=>`<button class="btn btn-xs btn-ghost" data-act="open-pdca" data-id="${c.id}">Review</button>`}
    ], pdca.slice(0,8),{empty:emptyState('No open PDCA cycles','','check')}))
  ];
}
function financeHome(user){
  const e = REPORTS.expenditure(user,{});
  const missing = e.flags.filter(f=>f.text.startsWith('Missing receipt')).length;
  const dup = e.flags.filter(f=>f.text.startsWith('Duplicate')).length;
  return [
    kpi('Budget this month', money(e.tot.budget), e.period.label,'','wallet'),
    kpi('Paid to date', money(e.tot.paid), `${pct(e.tot.paid,e.tot.budget)}% of budget`, 'info','check'),
    kpi('Remaining available', money(e.tot.remaining), `Committed ${money(e.tot.committed)}`, e.tot.remaining<0?'crit':'ok','layers'),
    kpi('Evidence exceptions', num(missing+dup), `${missing} missing receipts · ${dup} duplicate references`, (missing+dup)?'warn':'ok','alert'),
    card('Budget vs actual by category', barChart(e.rows.filter(r=>r.budget||r.paid).map(r=>({label:r.cat.name,value:r.paid})),{fmt:v=>money(v)}), {sub:e.period.label}),
    card('Reconciliation queue', table([
      {label:'Transaction',render:t=>`<div class="cellname">${esc(t.no)}<span class="sm">${esc(t.payee)}</span></div>`},
      {label:'Patient',render:t=>esc(DB.db.patients.find(p=>p.id===t.patientId)?.name||'-')},
      {label:'Amount',cls:'num',render:t=>money(t.amount)},
      {label:'Receipt',render:t=>t.receipt?badge('Attached','b-ok'):badge('Missing','b-crit')},
      {label:'',cls:'act',render:t=>`<button class="btn btn-xs btn-primary" data-act="reconcile-tx" data-id="${t.id}">Reconcile</button>`}
    ], e.tx.filter(t=>t.status!=='reconciled').slice(0,8),{empty:emptyState('All reconciled','Every transaction in scope has been reviewed.','check')}),
      {foot:'<span>Approval of a medical request does not mean payment has been made. These are separate records.</span>'})
  ];
}
function procurementHome(user){
  const reqs = repo.requests(user);
  return [
    kpi('Open procurement needs', num(4), 'Derived from hospital & programme demand','',"package"),
    kpi('Approved requests', num(reqs.filter(r=>['approved','assigned'].includes(r.status)).length), 'Potential service commitments','info','check'),
    kpi('Awaiting delivery evidence', num(reqs.filter(r=>r.status==='completed').length), 'Goods/services received, documentation pending','warn','receipt'),
    kpi('County', esc(countyName(user.countyId)), 'Procurement scope','','building'),
    card('Procurement pipeline', emptyState('Procurement register ready','Procurement requests are created from approved operational needs. Supplier, quotation and LPO records will appear here.','package'), {sub:'Configurable per county office'})
  ];
}
function meHome(user){
  const q = REPORTS.dataQuality(user);
  const monday = REPORTS.mondayStatus();
  return [
    kpi('Data quality issues', num(q.length), `${q.filter(i=>i.level==='crit').length} critical`,'warn','alert'),
    kpi('Reports archived', num(DB.db.reports.length), 'Versioned & immutable','info','archive'),
    kpi('Next scheduled reports', fmtDate(monday.nextRun,{hour:'2-digit',minute:'2-digit'}), monday.label,'','clock'),
    kpi('Indicators defined', Object.keys(INDICATORS).length, 'Each with a written definition','ok','file'),
    card('Data quality findings', table([
      {label:'Severity',render:i=>badge(titleCase(i.level),i.level==='crit'?'b-crit':i.level==='warn'?'b-warn':'b-info')},
      {label:'Finding',render:i=>esc(i.text)},
      {label:'Route',render:i=>badge(i.level==='crit'?'Responsible department':'Data officer','b-neutral')}
    ], q.slice(0,10), {empty:emptyState('No data-quality issues','All scoped records pass the current validation rules.','check')}),
      {foot:'<span>The M&E officer identifies issues; corrections are performed by the responsible department and recorded.</span>'}),
    card('Indicator dictionary', `<div class="col" style="gap:12px">${Object.entries(INDICATORS).slice(0,6).map(([k,v])=>`<div><div class="bold small">${esc(v.l)}</div><div class="xs muted" style="margin-top:2px">${esc(v.def)}</div></div>`).join('')}</div>`, {actions:`<button class="btn btn-xs btn-ghost" data-act="go" data-v="reports">Report centre ${ic('chevron',12)}</button>`})
  ];
}
function auditorHome(user){
  const q = REPORTS.dataQuality(user);
  const last = DB.db.securityTests[0];
  const integrity = AUDIT.verify();
  return [
    kpi('Open findings', num(q.length), 'Detected from scoped records','warn','shieldcheck'),
    kpi('Audit trail entries', num(DB.db.audit.length), 'Hash-chained, append-only','info','history'),
    kpi('Chain integrity', integrity.ok?'Intact':'Broken', integrity.ok?`${integrity.entries} entries verified`:`Broken at sequence ${integrity.broken.join(', ')}`, integrity.ok?'ok':'crit','lock'),
    kpi('Last security test', last?`${last.passed}/${last.total}`:'-', last?fmtDate(last.at):'Not yet run', last&&last.passed===last.total?'ok':'warn','shield'),
    card('Audit findings requiring action', table([
      {label:'Severity',render:i=>badge(titleCase(i.level),i.level==='crit'?'b-crit':i.level==='warn'?'b-warn':'b-info')},
      {label:'Finding',render:i=>esc(i.text)},
      {label:'Correction route',render:i=>badge('Responsible department','b-neutral')}
    ], q.slice(0,9), {empty:emptyState('No findings','No discrepancies detected in the current data.','check')}),
      {foot:'<span>Auditors are read-only. Corrections are made by the responsible department with a recorded reason.</span>'}),
    card('Integrity verification', `<div class="dl">
        <dt>Audit chain</dt><dd>${integrity.ok?badge('Verified','b-ok'):badge('Broken','b-crit')}</dd>
        <dt>Entries</dt><dd>${num(integrity.entries)}</dd>
        <dt>Last verification</dt><dd>${fmtDateTime(new Date())}</dd>
        <dt>Denied access events</dt><dd>${num(DB.db.audit.filter(a=>a.action==='access.denied').length)}</dd>
      </div><div class="divider"></div>${note('Every authorisation denial is recorded. A pattern of denials is an early indicator of misconfigured access or of an attempted breach.')}`,
      {actions:`<button class="btn btn-xs btn-primary" data-act="run-security-test">${ic('lock',12)} Run self-test</button>`})
  ];
}
function mediaHome(user){
  const docs = repo.documents(user);
  const pending = docs.filter(d=>d.publication==='pending_review');
  const noConsent = docs.filter(d=>{const p=DB.db.patients.find(x=>x.id===d.patientId);return p&&p.consent.status!=='granted';});
  return [
    kpi('Media assets', num(docs.length), 'Library under governance','',"image"),
    kpi('Awaiting publication review', num(pending.length), 'Consent & ethics check required','warn','send'),
    kpi('Consent gaps', num(noConsent.length), 'Publication blocked by rule engine','crit','shield'),
    kpi('Approved assets', num(docs.filter(d=>d.publication==='approved').length), 'Cleared for use','ok','check'),
    card('Publication queue', table([
      {label:'Asset',render:d=>`<div class="cellname">${esc(titleCase(d.kind))}<span class="sm">${esc(DB.db.patients.find(p=>p.id===d.patientId)?.name||'Unlinked')}</span></div>`},
      {label:'Classification',render:d=>badge(titleCase(d.classification),'b-neutral')},
      {label:'Consent',render:d=>{const p=DB.db.patients.find(x=>x.id===d.patientId);return p?badge(titleCase(p.consent.status),p.consent.status==='granted'?'b-ok':'b-crit'):badge('-','b-neutral');}},
      {label:'',cls:'act',render:d=>`<button class="btn btn-xs btn-primary" data-act="review-media" data-id="${d.id}">Review</button>`}
    ], pending,{empty:emptyState('Nothing awaiting review','New storytelling submissions appear here for consent and ethics review.','check')}),
      {foot:`<span>${ic('lock',13)} Patient photographs are never published merely because they were uploaded.</span>`}),
    card('Governance policy', `<div class="col" style="gap:10px">
      <div class="bold small">Patient Confidentiality & Ethical Storytelling Policy</div>
      ${note('Implemented as a rule engine, not a super-user account. The Chief System Administrator cannot switch these controls off.')}
      <div class="dl">
        <dt>Status</dt><dd>${badge('PROPOSED v1.0','b-warn')}</dd>
        <dt>Owner</dt><dd>Media & Information Governance</dd>
      </div></div>`, {actions:`<button class="btn btn-xs btn-ghost" data-act="go" data-v="policy">Open policy ${ic('chevron',12)}</button>`})
  ];
}
function peopleHome(user){
  const hrView = RBAC.has(user,'hr.view');
  const pending = hrView? DB.db.leaveRequests.filter(l=>l.status==='pending') : [];
  return [
    kpi('Staff records', num(DB.db.employees.length), 'No fabricated identities','',"idcard"),
    kpi('Leave awaiting approval', num(pending.length), 'Approve or decline with reason', pending.length?'warn':'ok','calendar'),
    kpi('On leave today', num(0), 'Recorded absence','','clock'),
    kpi('Welfare activities open', num(DB.db.welfareActs.filter(w=>w.status==='open').length), 'Contributions in progress','info','heart'),
    hrView? card('Leave requests requiring decision', table([
      {label:'Employee',render:l=>esc(DB.db.employees.find(e=>e.id===l.employeeId)?.name||'-')},
      {label:'Type',render:l=>badge(titleCase(l.type),'b-neutral')},
      {label:'Period',render:l=>`${fmtDate(l.from)} → ${fmtDate(l.to)}`},
      {label:'Days',cls:'num',render:l=>l.days},
      {label:'',cls:'act',render:l=>`<button class="btn btn-xs btn-primary" data-act="review-leave" data-id="${l.id}">Decide</button>`}
    ], pending,{empty:emptyState('No pending leave','All leave requests have been decided.','check')}),
      {foot:'<span>Leave rules follow the LOMAMO Staff Leave specification (BR-01…BR-08).</span>',actions:`<button class="btn btn-xs btn-ghost" data-act="go" data-v="leave">Leave register ${ic('chevron',12)}</button>`}) : ''
  ].filter(Boolean);
}
function fleetHome(user){
  const vs = DB.db.vehicles.filter(v=>v.countyId===user.countyId);
  const due = vs.filter(v=>v.nextService-v.odometer<1500);
  return [
    kpi('Vehicles', num(vs.length), countyName(user.countyId),'','car'),
    kpi('In maintenance', num(vs.filter(v=>v.status==='maintenance').length), 'Unavailable for assignment', 'warn','settings'),
    kpi('Service due', num(due.length), 'Within 1,500 km','warn','clock'),
    kpi('Trips (30 days)', num(DB.db.trips.filter(t=>daysBetween(t.date)<30).length), 'Logged journeys','info','route'),
    card('Vehicle register', table([
      {label:'Vehicle',render:v=>`<div class="cellname">${esc(v.reg)}<span class="sm">${esc(v.model)}</span></div>`},
      {label:'Status',render:v=>badge(titleCase(v.status),v.status==='active'?'b-ok':'b-warn')},
      {label:'Insurance',render:v=>`${fmtDate(v.insuranceExpiry)} ${daysBetween(new Date(),v.insuranceExpiry)<60?badge('Expiring','b-warn'):''}`},
      {label:'Odometer',cls:'num',render:v=>num(v.odometer)+' km'},
      {label:'Service',render:v=>v.nextService-v.odometer<1500?badge('Due','b-warn'):badge('OK','b-ok')}
    ], vs),
      {actions:`<button class="btn btn-xs btn-ghost" data-act="log-trip">${ic('plus',12)} Log trip</button>`}),
    card('Fuel & maintenance alerts', `${due.length?alertBox('warn','Maintenance due',due.map(v=>esc(v.reg)).join(', ')+' within 1,500 km of scheduled service.'):alertBox('ok','Fleet healthy','No immediate maintenance alerts.')}
      <div class="divider"></div>${note('Transport records link to the authorised hospital request without exposing unrelated patient information.')}`)
  ];
}
function leadershipHome(user,st){
  const ex = REPORTS.executive(user);
  const totalActive = ex.counties.reduce((n,c)=>n+c.active,0);
  return [
    kpi('Organisation caseload', num(totalActive), ex.counties.map(c=>`${c.county.code} ${c.active}`).join(' · '),'','users'),
    kpi('Requests in system', num(ex.counties.reduce((n,c)=>n+c.requests,0)), 'All hospital requests','info','hospital'),
    kpi('Data quality issues', num(ex.quality.length), `${ex.quality.filter(i=>i.level==='crit').length} critical`, ex.quality.filter(i=>i.level==='crit').length?'warn':'ok','alert'),
    kpi('County offices', num(ex.counties.length), 'Configurable for expansion','ok','building'),
    card('County performance at a glance', table([
      {label:'County office',render:c=>`<div class="cellname">${esc(c.county.name)}<span class="sm">${c.county.areas.length} ministry areas</span></div>`},
      {label:'Active',cls:'num',render:c=>num(c.active)},
      {label:'Discharged',cls:'num',render:c=>num(c.discharged)},
      {label:'Requests',cls:'num',render:c=>num(c.requests)},
      {label:'Budget (month)',cls:'num',render:c=>RBAC.has(user,'finance.view')?money(c.budget):'-'}
    ], ex.counties),
      {foot:'<span>Aggregated view only. Leadership visibility of sensitive clinical detail remains restricted to the appropriate role.</span>',
       actions:`<button class="btn btn-xs btn-ghost" data-act="go" data-v="executive">Executive summary ${ic('chevron',12)}</button>`}),
    card('Matters requiring leadership attention', (()=>{
      const items=[];
      const critQ = ex.quality.filter(i=>i.level==='crit');
      if(critQ.length) items.push({l:'critical',t:`${critQ.length} critical data-integrity findings`,d:'Route to the responsible department for correction; audit retains the trail.'});
      const approvals = DB.db.approvals.filter(a=>a.status==='pending');
      if(approvals.length) items.push({l:'warn',t:`${approvals.length} dual-approval request(s) awaiting a second signature`,d:'Full-database export and restoration require two independent approvals.'});
      const unverified = DB.db.referralEntities.filter(e=>e.status!=='verified').length;
      if(unverified) items.push({l:'info',t:`${unverified} referral entities not yet verified`,d:'Unrecognised referral sources are flagged, never auto-approved.'});
      if(!items.length) items.push({l:'ok',t:'No matters escalated',d:'Counties are operating within the current control threshold.'});
      return items.map(i=>`<div style="margin-bottom:12px">${alertBox(i.l,i.t,`<span class="small">${esc(i.d)}</span>`)}</div>`).join('');
    })())
  ];
}
function actionCard(cap, label, sub, icon, act){
  const ok = RBAC.has(AUTH.user,cap);
  return `<button class="action-card" ${ok?`data-act="${act}"`:'disabled style="opacity:.45;cursor:not-allowed"'} title="${ok?'':capLabel(cap)+' not held by your role'}">
    <div class="ic">${ic(icon,19)}</div><b>${esc(label)}</b><span>${esc(sub)}</span></button>`;
}
function attentionCard(user, ps){
  const ids = new Set((ps||repo.patientList(user)).map(p=>p.id));
  const cs = DB.db.concerns.filter(c=>ids.has(c.patientId)&&c.status==='open');
  const clinical = [...new Set(cs.filter(c=>c.level==='clinical').map(c=>c.patientId))];
  const admin = [...new Set(cs.filter(c=>c.level!=='clinical').map(c=>c.patientId))].filter(id=>!clinical.includes(id));
  return card('Patients requiring attention', `<div class="grid g2" style="gap:14px">
      <div><div class="spread" style="margin-bottom:9px"><b class="small" style="color:var(--crit)">Clinical priority · ${clinical.length}</b>${badge('Escalate','b-crit','nodot')}</div>
        ${clinical.slice(0,4).map(id=>{const p=DB.db.patients.find(x=>x.id===id);return p?`<div class="row" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line-2)">
          <div><div class="small bold">${esc(p.name)}</div><div class="xs muted">${esc(areaName(p.areaId))} · ${PAT.days(p)} days</div></div>
          <button class="btn btn-xs btn-ghost" data-act="open-patient" data-id="${p.id}">Open</button></div>`:''}).join('')||'<div class="xs muted">None recorded</div>'}
      </div>
      <div><div class="spread" style="margin-bottom:9px"><b class="small" style="color:var(--warn)">Administrative · ${admin.length}</b>${badge('Routine','b-warn','nodot')}</div>
        ${admin.slice(0,4).map(id=>{const p=DB.db.patients.find(x=>x.id===id);return p?`<div class="row" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line-2)">
          <div><div class="small bold">${esc(p.name)}</div><div class="xs muted">${esc(cs.find(c=>c.patientId===id)?.detail?.slice(0,44)||'')}</div></div>
          <button class="btn btn-xs btn-ghost" data-act="open-patient" data-id="${p.id}">Open</button></div>`:''}).join('')||'<div class="xs muted">None recorded</div>'}
      </div>
    </div>`, {sub:'A missed form is never labelled a medical emergency.', actions:`<button class="btn btn-xs btn-ghost" data-act="go" data-v="attention">All ${ic('chevron',12)}</button>`});
}
function mondayCardBody(user){
  const m = REPORTS.mondayStatus();
  const next = m.nextRun;
  return `<div class="spread" style="align-items:flex-start">
    <div>
      <div class="row" style="gap:8px;margin-bottom:8px">${badge(m.enabled?'Automation armed':'Paused', m.enabled?'b-ok':'b-warn','nodot')} ${badge(m.label,'b-neutral','nodot')}</div>
      <div class="small muted">Next run <b style="color:var(--ink)">${fmtDateTime(next)}</b>${m.lastRun?` · last run ${fmtDateTime(m.lastRun)}`:' · no scheduled run yet'}</div>
      <div class="xs muted" style="margin-top:6px">Patient Figures · Patient-Days · Expenditure, per county office. Reports are archived with a period, version and integrity block.</div>
    </div>
    <div class="row">
      ${RBAC.has(user,'report.patient_figures')?`<button class="btn btn-sm btn-primary" data-act="generate" data-type="patient_figures">${ic('refresh',14)} Generate now</button>`:''}
      ${RBAC.has(user,'report.patient_days')?`<button class="btn btn-sm btn-ghost" data-act="go" data-v="reports">Report centre</button>`:''}
    </div></div>`;
}

/* ---------------- Patient register ---------------- */
function renderPatients(user, params){
  const f = { countyId: params.county, areaId: params.area, status: params.status, q: params.q };
  let rows = repo.patientList(user, f);
  const total = rows.length;
  /* A register that silently stops at 120 rows is a dead end. Pages keep the
     whole register reachable on a tablet without a scroll marathon. */
  const perPage = [50,100,200].includes(Number(DB.db?.settings?.rowsPerPage)) ? Number(DB.db.settings.rowsPerPage) : 50;
  const pageCount = Math.max(1, Math.ceil(rows.length / perPage));
  const page = Math.min(pageCount, Math.max(1, Number(params.page)||1));
  const pageRows = rows.slice((page-1)*perPage, page*perPage);
  const statuses = ['active','extension','discharge_recommended','awaiting_verification','digital_entered','approved_enrolment','returned','discharged'];
  const areas = COUNTIES.filter(c=>roleObj(user.roleId)?.scope?.geo==='global'||roleObj(user.roleId)?.scope?.crossCounty||c.id===user.countyId).flatMap(c=>c.areas);
  return pageHead('Patient register', `${num(total)} records visible within your authority · ${scopeSentence(user)}`,
    `${RBAC.has(user,'system.export')?`<button class="btn btn-sm btn-ghost" data-act="request-export">${ic('download',14)} Full export (dual approval)</button>`:''}
     ${RBAC.has(user,'patient.assess.create')?`<button class="btn btn-sm btn-primary" data-act="new-assessment">${ic('plus',15)} New assessment</button>`:''}`)
  + card('', `
    <div class="row" style="margin-bottom:14px">
      <div class="searchbox" style="display:block;flex:1;min-width:200px"><span>${ic('search',16)}</span>
        <input class="input" style="padding-left:38px;height:42px" placeholder="Search name, code or CCC number" value="${esc(params.q||'')}" data-filter="q" data-view="patients"></div>
      <select class="input" style="width:auto;min-width:150px" data-filter="area" data-view="patients">
        <option value="">All ministry areas</option>
        ${areas.map(a=>`<option value="${a.id}" ${params.area===a.id?'selected':''}>${esc(a.name)}</option>`).join('')}
      </select>
      <select class="input" style="width:auto;min-width:170px" data-filter="status" data-view="patients">
        <option value="">All statuses</option>
        ${statuses.map(s=>`<option value="${s}" ${params.status===s?'selected':''}>${WORKFLOW.patient.labels[s]}</option>`).join('')}
      </select>
      ${RBAC.has(user,'patient.export')?`<button class="btn btn-sm btn-ghost" data-act="export-patients">${ic('download',14)} CSV</button>
        <button class="btn btn-sm btn-ghost" data-act="export-patients-xlsx">${ic('download',14)} Excel</button>`:''}
    </div>
    <div class="tbl-scroll">${table([
      {label:'Beneficiary & Area',render:p=>`<div class="cellname">${esc(p.name)}<span class="sm">${esc(p.code)} · ${esc(areaName(p.areaId))} (${p.sex==='F'?'F':'M'}, ${p.age}y)</span></div>`},
      {label:'Contact & Household GPS',render:p=>`<div class="small"><span class="mono">${esc(p.phone||'-')}</span><div class="xs muted">${esc(p.village||areaName(p.areaId))}${p.gps?` · <span class="mono">${(+p.gps.lat).toFixed(3)}, ${(+p.gps.lon).toFixed(3)}</span>`:''}</div></div>`},
      {label:'Anthropometry',render:p=>{const c=p.clinical||{}; return `<div class="small mono">${c.weightKg?c.weightKg+' kg':'-'} · ${c.heightCm?c.heightCm+' cm':'-'}<div class="xs muted">BMI ${c.bmi||'-'}${c.muacCm?` · MUAC ${c.muacCm}cm`:''}</div></div>`;}},
      {label:'Status',render:p=>pBadge(p.status)},
      {label:'Days',cls:'num',render:p=>`<b class="tnum">${PAT.days(p)}</b>`},
      {label:'Caregiver',render:p=>`<span class="small">${esc(userName(p.caregiverId).replace(/^Demo - /,''))}</span>`},
      {label:'Visits & Last Seen',render:p=>{const v=PAT.lastVisit(p); const vn=(DB.visitsFor?DB.visitsFor(p.id).length:0); return v?`<div class="small"><b>${vn} visits</b><div class="xs muted">Last ${fmtDate(v.date)}</div></div>`:`<span class="badge b-crit">none</span>`;}},
      {label:'Alerts',render:p=>{const c=PAT.concerns(p);return c.length?badge(c.length+' open',c.some(x=>x.level==='clinical')?'b-crit':'b-warn','nodot'):'<span class="muted">-</span>';}},
      {label:'',cls:'act',render:p=>`<button class="btn btn-xs btn-ghost" data-act="open-patient" data-id="${p.id}">Open ${ic('chevron',11)}</button>`}
    ], pageRows, {emptyMsg:'No patients match these filters.', click:true,
      rowAttr:p=>`data-act="open-patient" data-id="${p.id}"`})}</div>`,
    {foot:`<span>${ic('lock',13)} Records outside your county or ministry area are not returned by the data layer, even if a link is constructed manually.</span>
      <span style="margin-left:auto;display:flex;align-items:center;gap:8px">
        <span>Showing ${rows.length?((page-1)*perPage+1):0}-${Math.min(page*perPage,rows.length)} of ${num(rows.length)}</span>
        ${pageCount>1?`
          <button class="btn btn-xs btn-ghost" ${page<=1?'disabled':''} data-act="page" data-page="${page-1}" ${page<=1?'data-skip="1"':''}>Previous</button>
          <span>Page ${page} of ${pageCount}</span>
          <button class="btn btn-xs btn-ghost" ${page>=pageCount?'disabled':''} data-act="page" data-page="${page+1}" ${page>=pageCount?'data-skip="1"':''}>Next</button>`:''}
      </span>`});
}

/* ---------------- Patient record ---------------- */
function renderPatient(user, params){
  const p = repo.patient(user, params.id);
  if(!p) return card('Access denied', emptyState('This record is outside your authority','The request was logged. Records are filtered by county, ministry area and assignment before they reach the interface.','lock',`<button class="btn btn-sm btn-ghost" data-act="go" data-v="patients">Back to register</button>`));
  const tab = params.tab||'overview';
  const clinical = RBAC.can(user,'patient.view.clinical',{countyId:p.countyId,areaId:p.areaId}).ok;
  const days = PAT.days(p);
  const lastVisit = PAT.lastVisit(p);
  const tabs = [
    ['overview','Overview'],['clinical','Clinical'],['visits','Visits'],['pdca','PDCA'],
    ['hospital','Hospital'],['documents','Documents'],['timeline','History'],
    ['discharge', p.status==='discharged' ? 'Discharge summary' : 'Care & discharge summary']
  ].filter(([k])=>k!=='clinical'||clinical);

  const header = `<div class="card" style="margin-bottom:16px"><div class="card-b">
    <div class="spread" style="align-items:flex-start;flex-wrap:wrap">
      <div class="row" style="gap:14px;align-items:flex-start">
        <div class="avatar-img" style="width:52px;height:52px;font-size:16px">${initials(p.name)}</div>
        <div>
          <div class="row" style="gap:9px"><h2 style="font-size:20px">${esc(p.name)}</h2>${pBadge(p.status)}</div>
          <div class="small muted" style="margin-top:3px">${esc(p.code)} · ${esc(areaName(p.areaId))} · ${esc(countyName(p.countyId))} · ${p.sex==='F'?'Female':'Male'}, ${p.age}y</div>
          <div class="row" style="margin-top:9px;gap:8px">
            <span class="chip">${ic('clock',13)} ${days} days in programme</span>
            <span class="chip">${ic('activity',13)} ${lastVisit? 'Last visit '+fmtDate(lastVisit.date):'No visit recorded'}</span>
            <span class="chip">${ic('userplus',13)} ${esc(userName(p.caregiverId).replace(/^Demo - /,''))}</span>
            ${p.consent?`<span class="chip">${ic('shield',13)} Consent: ${esc(titleCase(p.consent.status))}</span>`:''}
          </div>
        </div>
      </div>
      <div class="row" style="flex-wrap:wrap;gap:8px">
        ${typeof PAT_DISCHARGE!=='undefined' ? `<button class="btn btn-sm ${p.status==='discharged'?'btn-primary':'btn-ghost'}" data-act="open-discharge-summary" data-id="${p.id}">${ic('printer',14)} ${p.status==='discharged'?'Discharge Summary':'Preview Discharge Summary'}</button>` : ''}
        ${workflowActions('patient',p,user)}
      </div>
    </div></div>
    <div class="tabs" style="padding:0 12px">${tabs.map(([k,l])=>`<button class="tab ${tab===k?'active':''}" data-act="patient-tab" data-id="${p.id}" data-tab="${k}">${l}</button>`).join('')}</div>
  </div>`;

  const body = tab==='overview' ? patientOverview(user,p)
    : tab==='clinical' ? (clinical? patientClinical(user,p) : '')
    : tab==='visits' ? patientVisits(user,p,params)
    : tab==='pdca' ? patientPdca(user,p)
    : tab==='hospital' ? patientHospital(user,p)
    : tab==='documents' ? patientDocuments(user,p)
    : tab==='timeline' ? patientTimeline(user,p)
    : tab==='discharge' ? (typeof PAT_DISCHARGE!=='undefined' ? PAT_DISCHARGE.renderSheet(p.id, user) : '')
    : '';

  const list = repo.patientList(user,{}).map(x=>({id:x.id,label:x.name}));
  return `<div class="spread" style="margin-bottom:12px;flex-wrap:wrap;gap:8px"><button class="btn btn-xs btn-ghost" data-act="go" data-v="patients">${ic("back",12)} Patient register</button>${PAGER.record(list,p.id,'patient','id',`data-tab="${esc(tab)}"`,'Patient')}</div>`+header+body+PAGER.tabs(tabs,tab,'patient-tab',`data-id="${p.id}"`);
}
function patientOverview(user,p){
  const days=PAT.days(p), lv=PAT.lastVisit(p), req=PAT.openRequest(p);
  const pVisits = DB.visitsFor ? DB.visitsFor(p.id) : DB.db.visits.filter(v=>v.patientId===p.id);
  const milestone = days>=180?'180+':days>=120?'120+':days>=100?'100+':days>=60?'60+':'Under 60';
  return `<div class="grid g4" style="margin-bottom:16px">
      ${kpi('Days in programme', days, `Milestone band ${milestone}`,'',"clock")}
      ${kpi('Visits recorded', pVisits.length, lv?`Last ${fmtDate(lv.date)}`:'-','info','activity')}
      ${kpi('Open PDCA actions', PAT.openPdca(p), 'Plan-Do-Check-Act','',"repeat")}
      ${kpi('Hospital request', req?titleCase(req.status):'None', req?req.no:'No open request', req?'warn':'','hospital')}
    </div>
    <div class="grid g2">
      ${card('Beneficiary Enrolment, Anthropometry & Geolocation Metadata', `<dl class="dl">
        <dt>Beneficiary code</dt><dd class="mono">${esc(p.code)}</dd>
        <dt>National ID / Birth Cert</dt><dd class="mono">${esc(p.nationalId||'-')}</dd>
        <dt>Verified telephone</dt><dd class="mono"><b>${esc(p.phone||'-')}</b></dd>
        <dt>SHA / Health cover</dt><dd class="mono">${esc(p.sha||'-')}</dd>
        <dt>Weight · Height · BMI · MUAC</dt><dd class="mono"><b>${p.clinical?.weightKg||'-'} kg</b> · <b>${p.clinical?.heightCm||'-'} cm</b> · BMI <b>${p.clinical?.bmi||'-'}</b>${p.clinical?.muacCm?` · MUAC <b>${p.clinical.muacCm} cm</b>`:''}</dd>
        <dt>Ministry area &amp; county</dt><dd>${esc(areaName(p.areaId))} · ${esc(countyName(p.countyId))}</dd>
        <dt>Village &amp; ward</dt><dd>${esc(p.location?.village||p.village||'-')}${p.location?.ward?' · '+esc(p.location.ward):''}</dd>
        <dt>Field landmark</dt><dd>${esc(p.location?.landmark||'Recorded on household intake sheet')}</dd>
        <dt>Household GPS coordinates</dt><dd class="mono">${p.gps?`${(+p.gps.lat).toFixed(5)}, ${(+p.gps.lon).toFixed(5)} (±${p.gps.accuracyM||8}m)`:'Not shared'}</dd>
        <dt>Intake date</dt><dd>${fmtDate(p.intake)}</dd>
        <dt>Referral facility</dt><dd>${esc(DB.db.referralEntities.find(e=>e.id===p.referralEntityId)?.name||'Not recorded')}</dd>
        <dt>Assigned caregiver</dt><dd>${esc(userName(p.caregiverId).replace(/^Demo - /,''))}</dd>
        <dt>Hard-copy verification</dt><dd>${p.docsVerified?badge('Source documents verified','b-ok'):badge('Pending verification','b-warn')}</dd>
        <dt>Informed consent</dt><dd>${badge(titleCase(p.consent?.status||'not requested'), p.consent?.status==='granted'?'b-ok':'b-warn')}</dd>
        ${masterRegistryRows(p)}
      </dl>`,
        {foot:'<span>100% beneficiary metadata completeness: verified identity, telephone, anthropometry, household GPS coordinates and Administration master workbook columns.</span>'})}
      ${card('Discharge readiness', `<div class="row" style="gap:10px;margin-bottom:12px">${badge(milestone+' day band', days>=180?'b-crit':days>=120?'b-warn':'b-neutral','nodot')}</div>
        <p class="small muted">${days>=180?'This patient has passed 180 days. An approved discharge evaluation with supporting evidence is required - duration alone does not discharge a patient.' : days>=120?'Extension review required. Record the documented reason for continued enrolment.' : 'Within the planned programme duration.'}</p>
        ${p.dischargeRecommendation?`<div class="alert info" style="margin-top:10px">${ic('info',17)}<div><b>Recommendation on file</b><span class="small">${esc(p.dischargeRecommendation.reason||'')} - ${esc(userName(p.dischargeRecommendation.by))}, ${fmtDate(p.dischargeRecommendation.at)}</span></div></div>`:''}
        ${p.dischargeReferral && p.dischargeReferral.required!==false ? `<div class="alert ok" style="margin-top:10px">${ic('send',16)}<div><b>Discharge referral plan: ${esc(p.dischargeReferral.clinic||'Outpatient review')}</b><span class="small"> Destination: <b>${esc(p.dischargeReferral.facility||'Referral hospital')}</b> (${fmtDate(p.dischargeReferral.appointmentDate)}). ${esc(p.dischargeReferral.instructions||'')}</span></div></div>` : ''}
        <div class="divider"></div>
        ${note('Programme duration never triggers automatic discharge. Clinical and administrative review must both be documented.')}`)}
    </div>
    ${card('Open concerns', (()=>{ const c=PAT.concerns(p); if(!c.length) return emptyState('No open concerns','This patient has no recorded concerns.','check');
      return `<div class="col" style="gap:10px">${c.map(x=>`<div class="alert ${x.level==='clinical'?'crit':'warn'}">${ic('alert',17)}<div><b>${esc(titleCase(x.type))} · ${x.level==='clinical'?'Clinical':'Administrative'}</b><span class="small">${esc(x.detail)}</span><div class="xs muted" style="margin-top:4px">Raised ${fmtDate(x.opened)} by ${esc(userName(x.by))}</div></div>
        ${RBAC.has(user,'patient.edit')||RBAC.has(user,'pdca.review')?`<button class="btn btn-xs btn-ghost" style="margin-left:auto" data-act="resolve-concern" data-id="${x.id}">Resolve</button>`:''}</div>`).join('')}</div>`; })())}
    ${(typeof HOUSEHOLD!=='undefined' && RBAC.has(user,'household.view'))? `<div style="margin-top:16px">${HOUSEHOLD.patientPanel(user,p)}</div>` : ''}
    ${(typeof TBCARE!=='undefined' && RBAC.has(user,'tb.view'))? `<div style="margin-top:16px">${TBCARE.patientPanel(user,p)}</div>` : ''}
    ${(typeof COSTX!=='undefined' && (RBAC.has(user,'cost.view')||RBAC.has(user,'finance.view')))? `<div style="margin-top:16px">${COSTX.patientPanel(user,p)}</div>` : ''}
    ${(typeof TEAMX!=='undefined' && RBAC.has(user,'team.view'))? `<div style="margin-top:16px">${card('Ministry team & visit days for this area', (()=>{
        const t = TEAMX.byArea(p.areaId);
        if(!t) return emptyState('No team recorded','This ministry area is not on the team table yet.','route');
        return `<div class="grid g3">
          <div class="kv"><span>Coordinator</span><b>${esc(TEAMX.nameOf(t.coordinator))}</b></div>
          <div class="kv"><span>Home visit days</span><b>${(t.visitDays||[]).length? esc(t.visitDays.map(d=>DAY_NAMES[d]).join(' & ')) : 'To be fixed'}</b></div>
          <div class="kv"><span>Assisting</span><b>${esc((t.assistants||[]).map(a=>TEAMX.nameOf(a.username)).join(', ')||'None named')}</b></div>
        </div>${t.note?`<p class="xs muted" style="margin-top:10px">${ic('info',12)} ${esc(t.note)}</p>`:''}
        ${t.confirmed? '':`<div style="margin-top:8px">${badge('Provisional visit day','b-warn')}</div>`}`;
      })(), {actions:`<button class="btn btn-xs btn-ghost" data-act="go" data-v="teams">${ic('route',13)} Ministry teams</button>`})}</div>` : ''}`;
}

/* The master workbook columns that belong on the patient's own record. Only the
   ones that carry a value are shown, so an imported record and a newly
   registered one read the same way. */
function masterRegistryRows(p){
  const m = p.master||{};
  const rows = [];
  const add = (k,v)=>{ if(v!==undefined && v!==null && v!=='') rows.push(`<dt>${esc(k)}</dt><dd>${v}</dd>`); };
  add('Cover (NHIF / LMM / Other)', esc(m.insurance||p.insurance||''));
  add("Spouse's ID", esc(m.spouseId||p.spouseId||''));
  add('New in month', esc(m.newInMonth||''));
  add('Repeat patient', m.repeatPatient? badge('Yes - returning beneficiary','b-info') : '');
  add('Relocated', m.relocated? badge('Relocated','b-warn') : '');
  add('Male / female children', (p.household && (p.household.maleChildren!==undefined||p.household.femaleChildren!==undefined))
    ? `${num(p.household.maleChildren||0)} male · ${num(p.household.femaleChildren||0)} female` : '');
  add('Children rescued from becoming orphans', m.orphansPrevented!==''&&m.orphansPrevented!==undefined? num(m.orphansPrevented) : '');
  add('Children who became orphans', m.becameOrphans!==''&&m.becameOrphans!==undefined? num(m.becameOrphans) : '');
  add('Minimal care review (>183 days)', m.minimalCareFlag==='x'? badge('Flagged for minimal-care review','b-warn') : '');
  add('Visit schedule', esc(m.schedule? (MASTER_VOCAB.scheduleMeaning[m.schedule]||m.schedule) : (p.visitFrequency||'')));
  if(m.bags) add('Foodbags issued (Bag 1 / Bag 2 / Special)', `${num(m.bags.BG1||0)} · ${num(m.bags.BG2||0)} · ${num(m.bags.SPB||0)}`);
  if(m.costs) add('Cost recorded on this record', `${money(Math.round(m.costs.total||0))} <span class="xs muted">(other ${money(Math.round(m.costs.other||0))} + in-patient ${money(Math.round(m.costs.inpatient||0))})</span>`);
  add('Source', m.sourceWorkbook? `<span class="xs muted">${esc(m.sourceWorkbook)}${m.sourceSheet?' · sheet '+esc(m.sourceSheet):''}${m.sourceRow?' · row '+esc(m.sourceRow):''}</span>` : '');
  return rows.join('');
}
function patientClinical(user,p){
  const c=p.clinical||{};
  const allergies=[].concat(c.allergies||[],c.allergyClasses||[]);
  const bi = (typeof BMI_CLINICAL!=='undefined') ? BMI_CLINICAL.patientBmiInfo(p) : null;
  return `${allergies.length
      ? `<div class="alert crit" style="margin-bottom:14px">${ic('alert',17)}<div><b>Recorded allergies: ${esc(allergies.join(', '))}</b><span class="small">A medicine matching a recorded allergy cannot be prescribed, on this screen or any other. Record any reaction in the visit notes.</span></div></div>`
      : `<div class="alert info" style="margin-bottom:14px">${ic('info',15)}<div><span class="small">No medication allergy recorded. That is not the same as no allergy: ask at every visit and record the answer.</span></div></div>`}
    <div class="grid g4" style="margin-bottom:16px">
      ${kpi('Weight & Height', c.weightKg?`${c.weightKg} kg · ${c.heightCm||'-'} cm`:'-', bi?`Baseline ${bi.baselineWeightKg} kg (${bi.weightDeltaKg>=0?'+':''}${bi.weightDeltaKg} kg)`:'Most recently recorded','','activity')}
      ${kpi(p.age<18?'WHO BMI-for-Age':'Adult BMI', bi?`${bi.bmi} kg/m²`:'-', bi?bi.band.short:'Nutritional band','info','heart')}
      ${kpi('MUAC Arm Tape', bi?`${bi.muacCm} cm (${bi.muacMm} mm)`:'-', bi?bi.muacBand.short:'Arm circumference', bi&&bi.muacBand.id==='sam'?'crit':(bi&&bi.muacBand.id==='mam'?'warn':'ok'),'shield')}
      ${kpi('Adherence', c.adherence||'-','Self-reported at visit','',"check")}
    </div>
    ${typeof BMI_CLINICAL!=='undefined' && BMI_CLINICAL.renderPatientGrowthCharts ? `<div style="margin-bottom:16px">${card(p.age<18?`Child Weight, BMI-for-Age & MUAC Growth Charts (${p.age} yrs)`:'Longitudinal Weight, BMI & MUAC Surveillance', BMI_CLINICAL.renderPatientGrowthCharts(p), {sub:'Plotted across all recorded Home, Hospital & Homestay visits.'})}</div>` : ''}
    <div class="grid g3">
      ${card('Clinical summary', `<dl class="dl">
        <dt>Primary diagnosis</dt><dd>${esc(c.diagnosis||'-')}</dd>
        <dt>On ART</dt><dd>${c.art?'Yes':'No'}</dd>
        <dt>Height</dt><dd>${c.heightCm? c.heightCm+' cm':'-'}</dd>
        <dt>Household children</dt><dd>${p.household?.children??'-'}</dd>
        <dt>Orphan-prevention beneficiaries</dt><dd>${p.household?.orphansSupported??'-'}</dd>
        <dt>Guardian arrangement</dt><dd>${esc(p.household?.guardian||'-')}</dd>
      </dl>`, {foot:`<span>${ic('lock',13)} Visible only to clinical-authorised roles. Every view is auditable.</span>`})}
      ${card('Recorded conditions', (()=>{
        const c = COND.list(user,p.id);
        if(!c.allowed) return note('Your role may not view clinical conditions.');
        if(!c.rows.length) return emptyState('No conditions recorded','Conditions are recorded deliberately, never inferred.','clipboard',
          RBAC.has(user,'condition.record')?`<button class="btn btn-sm btn-ghost" data-act="condition-record" data-id="${p.id}">Record a condition</button>`:'');
        return table([
          {label:'Condition', render:x=>`${esc(x.label)}${x.sensitive?' '+badge('Sensitive','b-warn'):''}<div class="xs muted">${fmtDate(x.recordedAt)} · ${esc(userName(x.recordedBy))}</div>`},
          {label:'Status', render:x=>badge(CONDITION_STATUS[x.status]||x.status, x.status==='confirmed'?'b-ok':x.status==='suspected'?'b-warn':'b-neutral')},
          {label:'', cls:'act', render:x=>!x.confirmedBy && RBAC.has(user,'condition.confirm')
            ? `<button class="btn btn-xs btn-ghost" data-act="condition-confirm" data-id="${x.id}">Confirm</button>`
            : (x.confirmedBy?`<span class="xs muted">Confirmed</span>`:'')}
        ], c.rows, {compact:true}) + (c.withheld? `<div class="xs muted" style="margin-top:8px">${c.withheld} sensitive condition${c.withheld===1?'':'s'} withheld from your role.</div>`:'');
      })(), {actions:RBAC.has(user,'condition.record')?`<button class="btn btn-xs btn-primary" data-act="condition-record" data-id="${p.id}">${ic('plus',12)} Record</button>`:''})}
      ${card('Clinical actions', `<div class="col" style="gap:10px">
        ${RBAC.has(user,'visit.create')?`<button class="btn btn-ghost btn-block" data-act="record-visit" data-patient="${p.id}">${ic('activity',15)} Record clinical visit</button>`:''}
        ${RBAC.has(user,'pdca.create')?`<button class="btn btn-ghost btn-block" data-act="new-pdca" data-patient="${p.id}">${ic('repeat',15)} New PDCA cycle</button>`:''}
        ${RBAC.has(user,'hosp.request.create')?`<button class="btn btn-ghost btn-block" data-act="new-request" data-patient="${p.id}">${ic('hospital',15)} Hospital request</button>`:''}
        ${RBAC.has(user,'media.upload')?`<button class="btn btn-ghost btn-block" data-act="upload-doc" data-patient="${p.id}">${ic('upload',15)} Upload document</button>`:''}
        ${!(RBAC.has(user,'visit.create')||RBAC.has(user,'pdca.create')||RBAC.has(user,'hosp.request.create'))?emptyState('Read-only clinical view','Your role may review clinical information but not modify it.','eye'):''}
      </div>`)}
    </div>`
  + `<div class="grid g2" style="margin-top:16px">
      ${card('Prescriptions', (()=>{
        if(!(RBAC.has(user,'pharmacy.view')||RBAC.has(user,'clinical.prescribe'))) return note('Your role may not view prescriptions.');
        const rows=RX.prescriptions(user,{patientId:p.id});
        return rows.length? table([
          {label:'Reference',render:r=>`<div class="cellname">${esc(r.no)}<span class="sm">${esc(r.lines.map(l=>l.name).join('; ').slice(0,54))}</span></div>`},
          {label:'Prescribed',render:r=>fmtDate(r.prescribedAt)},
          {label:'Status',render:r=>badge(titleCase(String(r.status).replace(/_/g,' ')), r.status==='dispensed'?'b-ok':r.status==='cancelled'?'b-crit':r.status==='partially_dispensed'?'b-warn':'b-neutral')},
          {label:'',cls:'act',render:r=>`<button class="btn btn-xs btn-ghost" data-act="open-rx" data-id="${r.id}">Open</button>`}
        ], rows, {emptyMsg:'No prescription recorded.'}) : emptyState('No prescriptions','Nothing has been prescribed for this patient.','package');
      })(), {actions:RBAC.has(user,'clinical.prescribe')?`<button class="btn btn-xs btn-primary" data-act="new-prescription" data-patient="${p.id}">${ic('plus',12)} Prescribe</button>`:''})}
      ${card('Care plans (Omaha)', (()=>{
        if(!RBAC.has(user,'careplan.view')) return note('Your role may not view care plans.');
        const rows=OMAHAS.plans(user,{patientId:p.id});
        return rows.length? table([
          {label:'Plan',render:r=>`<div class="cellname">${esc(r.title)}<span class="sm">${r.problems.length} problem(s) · version ${r.version||1}</span></div>`},
          {label:'Status',render:r=>badge(titleCase(r.status), r.status==='active'?'b-ok':r.status==='archived'?'b-neutral':'b-warn')},
          {label:'Updated',render:r=>fmtDate(r.updatedAt||r.createdAt)},
          {label:'',cls:'act',render:r=>`<button class="btn btn-xs btn-ghost" data-act="open-careplan" data-id="${r.id}">Open</button>`}
        ], rows, {emptyMsg:'No care plan yet.'}) : emptyState('No care plan','A care plan records the agreed problems, interventions and ratings.','clipboard');
      })(), {actions:RBAC.has(user,'careplan.manage')?`<button class="btn btn-xs btn-primary" data-act="new-careplan" data-patient="${p.id}">${ic('plus',12)} New plan</button>`:''})}
    </div>`
  + `<div style="margin-top:16px">${card('Digitised paper forms', (()=>{
      if(!RBAC.has(user,'form.view')) return note('Your role may not view paper forms.');
      const rows=FORMSX.records(user,{patientId:p.id});
      return table([
        {label:'Form',render:f=>`<div class="cellname">${esc(f.title)}<span class="sm">${esc(f.code)} · ${f.kind==='discharge'?'one page supplied':'full form'}</span></div>`},
        {label:'Visit date',render:f=>fmtDate(f.visitDate)},
        {label:'Status',render:f=>badge(titleCase(f.status), f.status==='verified'?'b-ok':f.status==='returned'?'b-crit':f.status==='submitted'?'b-warn':'b-neutral')},
        {label:'Entered',render:f=>fmtDate(f.enteredAt||f.createdAt)},
        {label:'',cls:'act',render:f=>`<button class="btn btn-xs btn-ghost" data-act="open-form" data-id="${f.id}">Open</button>`}
      ], rows, {emptyMsg:'No paper form entered for this patient.'});
    })(), {foot:'<span>Each form is entered once per visit and verified against the signed paper copy by a second officer.</span>',
      actions:RBAC.has(user,'form.create')?`<button class="btn btn-xs btn-primary" data-act="new-form-for" data-patient="${p.id}">${ic('plus',12)} Enter a form</button>`:''})}</div>`;
}
function patientVisits(user,p,params={}){
  const vs = repo.visits(user,p.id);
  const vtype = params.vtype || '';
  const homeN = vs.filter(v=>v.type==='home'||v.type==='clinical').length;
  const hospN = vs.filter(v=>v.type==='hospital').length;
  const hsN = vs.filter(v=>v.type==='homestay').length;
  const shown = !vtype ? vs : vs.filter(v=>vtype==='home' ? (v.type==='home'||v.type==='clinical') : v.type===vtype);
  const growthPanel = (typeof BMI_CLINICAL!=='undefined' && BMI_CLINICAL.renderPatientGrowthCharts && (p.age < 18 || RBAC.has(user,'patient.view.clinical') || RBAC.has(user,'visit.create')))
    ? `<div style="margin-bottom:16px">${card(p.age<18?`Child Growth Curves — Weight, BMI-for-Age & MUAC (${p.age} yrs)`:'Anthropometric Growth Trajectory Across Visits', BMI_CLINICAL.renderPatientGrowthCharts(p))}</div>`
    : '';
  return `<div class="grid g4" style="margin-bottom:14px">
      ${kpi('Total visits recorded', num(vs.length), 'Longitudinal care continuum','info','activity')}
      ${kpi('Home & MCM visits', num(homeN), 'Household caregiver & clinical follow-up','ok','home')}
      ${kpi('Hospital clinic visits', num(hospN), 'Outpatient & specialist referral reviews', hospN?'info':'','hospital')}
      ${kpi('Homestay / Care Centre', num(hsN), hsN?'Short-term clinical stabilization':'Household-only care (no homestay)', hsN?'warn':'','heart')}
    </div>`
    + growthPanel
    + card(`Visit history (${num(shown.length)} of ${num(vs.length)})`,
      `<div class="row" style="gap:8px;margin-bottom:12px;flex-wrap:wrap">
        <button class="btn btn-xs ${!vtype?'btn-primary':'btn-ghost'}" data-act="go" data-v="patient" data-id="${esc(p.id)}" data-tab="visits">All Settings (${vs.length})</button>
        <button class="btn btn-xs ${vtype==='home'?'btn-primary':'btn-ghost'}" data-act="go" data-v="patient" data-id="${esc(p.id)}" data-tab="visits" data-vtype="home">Home & MCM (${homeN})</button>
        <button class="btn btn-xs ${vtype==='hospital'?'btn-primary':'btn-ghost'}" data-act="go" data-v="patient" data-id="${esc(p.id)}" data-tab="visits" data-vtype="hospital">Hospital Clinic (${hospN})</button>
        <button class="btn btn-xs ${vtype==='homestay'?'btn-primary':'btn-ghost'}" data-act="go" data-v="patient" data-id="${esc(p.id)}" data-tab="visits" data-vtype="homestay">Homestay / Care Centre (${hsN})</button>
      </div>`
      + (shown.length? `<div class="timeline">${shown.map(v=>`<div class="tl-item done">
      <div class="spread" style="gap:8px;flex-wrap:wrap">
        <div class="t">${esc(v.type==='homestay'?'Homestay / Care Centre Stabilization':(v.type==='hospital'?'Hospital Outpatient / Referral':titleCase(v.type)))} visit — ${esc(titleCase(v.outcome))}</div>
        <div class="row" style="gap:6px">
          ${v.type==='homestay'?badge('Homestay','b-warn'):(v.type==='hospital'?badge('Hospital','b-info'):badge(v.type==='clinical'?'MCM Clinical':'Home','b-ok'))}
          ${v.foodBag?badge('Bag '+v.foodBag,'b-info','nodot'):''}
        </div>
      </div>
      <div class="m">${fmtDate(v.date)} · recorded by ${esc(userName(v.by||v.caregiverId))}${v.facility?` · <b>${esc(v.facility)}</b>`:''}${v.weight?` · Wt <b>${v.weight} kg</b>`:''}${v.bmi?` · BMI <b>${v.bmi}</b>`:''}${v.muacCm?` · MUAC <b>${v.muacCm} cm</b>`:''}${v.bp?` · BP ${v.bp}`:''}</div>
      <div class="small" style="margin-top:5px;color:var(--ink-2)">${esc(v.notes)}</div></div>`).join('')}</div>`
    : emptyState('No visits in this filter','Select All Settings or record a new visit.','activity',
      RBAC.has(user,'visit.create')?`<button class="btn btn-sm btn-primary" data-act="record-visit" data-patient="${p.id}">Record visit</button>`:'')),
    {actions:RBAC.has(user,'visit.create')?`<button class="btn btn-xs btn-primary" data-act="record-visit" data-patient="${p.id}">${ic('plus',12)} Record visit</button>`:''});
}
function patientPdca(user,p){
  const plan = PDCAX.plan(p);
  const sched = PDCAX.schedule(p);
  const sum = PDCAX.summary(p);
  const cycles = DB.db.pdcas.filter(x=>x.patientId===p.id && x.kind!=='review');
  const ext = PDCAX.extensionRequired(p);

  const planCard = card('Care plan', plan? `
    <dl class="dl">
      <dt>Identified need</dt><dd>${esc(plan.needs)}</dd>
      <dt>Agreed objective</dt><dd>${esc(plan.objectives)}</dd>
      <dt>Planned intervention</dt><dd>${esc(plan.interventions)}</dd>
      <dt>Responsible</dt><dd>${esc(userName(plan.responsible))}</dd>
      <dt>Expected duration</dt><dd>${plan.expectedDays} days <span class="xs muted">(an estimate, not a discharge date)</span></dd>
      <dt>Rationale</dt><dd>${esc(plan.rationale)}</dd>
      <dt>Approved</dt><dd>${esc(userName(plan.approvedBy)||'-')} · ${fmtDate(plan.approvedAt)}</dd>
      <dt>Version</dt><dd>v${plan.version}</dd>
    </dl>`
    : emptyState('No care plan on file','A care plan is required at enrolment. This record appears in the data-quality report until one is recorded.','alert'),
    {sub:'The plan belongs to the patient, not to a reporting period.'});

  const schedCard = card('30-day review schedule', `
    <div class="grid g4" style="margin-bottom:14px">
      ${kpi('Completed', sum.completed, 'Of '+sum.total+' scheduled','','check')}
      ${kpi('Overdue', sum.overdue, sum.overdue?'Requires action':'None overdue', sum.overdue?'crit':'ok','alert')}
      ${kpi('Next due', sum.nextDue?fmtDate(sum.nextDue):'-', sum.nextDue?Math.round((new Date(sum.nextDue)-Date.now())/86400000)+' days':'','','calendar')}
      ${kpi('Adherence', sum.adherence===null?'-':sum.adherence+'%', 'Completed against due','','repeat')}
    </div>
    ${table([
      {label:'Review', render:r=>`Day ${r.day}`},
      {label:'Due', render:r=>fmtDate(r.due)},
      {label:'Status', render:r=>badge(titleCase(r.status), r.status==='completed'?'b-ok':r.status==='overdue'?'b-crit':'b-neutral')},
      {label:'Completed', render:r=>r.completed? `${fmtDate(r.completed)}${r.slipDays>0?` <span class="xs" style="color:var(--warn)">+${r.slipDays}d</span>`:''}`:'-'},
      {label:'', cls:'right', render:r=>r.status!=='completed' && (RBAC.has(user,'pdca.create')||RBAC.has(user,'pdca.review'))
        ? `<button class="btn btn-xs btn-ghost" data-act="pdca-complete" data-id="${p.id}" data-day="${r.day}">Record</button>`:''}
    ], sched.slice(0,Math.max(4, Math.min(12, Math.ceil((PDCAX.daysInProgramme(p)+30)/30)))))}
    <div class="xs muted" style="margin-top:10px">A review keeps the date it was due. Late completion is shown as late, never reset.</div>`,
    {sub:'Every 30 days from the programme start date.'});

  const extBanner = ext? `<div class="alert warn" style="margin-bottom:16px">${ic('alert',16)}<div>
    <b>Extended case, review required</b>
    <span class="small">This patient has been in the programme for ${PDCAX.daysInProgramme(p)} days, beyond the approved threshold of ${DB.db.settings.programme.maxDays}. A documented extension review is required before the case can be closed.</span>
    <div class="row" style="margin-top:8px">${(RBAC.has(user,'pdca.review')||RBAC.has(user,'pdca.create'))?`<button class="btn btn-sm btn-primary" data-act="pdca-extension" data-id="${p.id}">Record extension review</button>`:''}</div>
  </div></div>`:'';

  return `${extBanner}
    <div class="grid g2" style="margin-bottom:16px">${planCard}${schedCard}</div>
    ${card('PDCA cycles', table([
      {label:'Plan',render:x=>`<div class="cellname">${esc(x.plan)}<span class="sm">Owner ${esc(userName(x.owner).replace(/^Demo - /,''))}</span></div>`},
      {label:'Stage',render:x=>badge(x.stage, x.stage==='Act'?'b-ok':'b-info')},
      {label:'Due',render:x=>`${fmtDate(x.due)} ${new Date(x.due)<new Date()&&x.status==='open'?badge('overdue','b-crit'):''}`},
      {label:'Status',render:x=>badge(titleCase(x.status), x.status==='open'?'b-warn':'b-ok')},
      {label:'',cls:'act',render:x=>RBAC.has(user,'pdca.review')||x.owner===user.id?`<button class="btn btn-xs btn-ghost" data-act="open-pdca" data-id="${x.id}">Open</button>`:''}
    ], cycles, {empty:emptyState('No PDCA cycle','Create a Plan-Do-Check-Act cycle to structure follow-up.','repeat')}),
      {actions:RBAC.has(user,'pdca.create')?`<button class="btn btn-xs btn-primary" data-act="new-pdca" data-patient="${p.id}">${ic('plus',12)} New cycle</button>`:''})}`;
}
function patientHospital(user,p){
  const rows = DB.db.requests.filter(r=>r.patientId===p.id);
  return card('Hospital requests & encounters', table([
    {label:'Request',render:r=>`<div class="cellname">${esc(r.no)}<span class="sm">${esc(r.reason.slice(0,54))}</span></div>`},
    {label:'Facility',render:r=>`<span class="small">${esc(r.facility)}</span>`},
    {label:'Priority',render:r=>badge(titleCase(r.priority),r.priority==='critical'?'b-crit':r.priority==='urgent'?'b-warn':'b-neutral')},
    {label:'Status',render:r=>rBadge(r.status)},
    {label:'',cls:'act',render:r=>`<button class="btn btn-xs btn-ghost" data-act="open-request" data-id="${r.id}">Open</button>`}
  ], rows, {empty:emptyState('No hospital requests','Requests appear here after clinical submission.','hospital')}),
    {actions:RBAC.has(user,'hosp.request.create')?`<button class="btn btn-xs btn-primary" data-act="new-request" data-patient="${p.id}">${ic('plus',12)} New request</button>`:''});
}
function patientDocuments(user,p){
  const docs = repo.documents(user).filter(d=>d.patientId===p.id);
  return card('Patient documents', table([
    {label:'Document',render:d=>`<div class="cellname">${esc(titleCase(d.kind))}<span class="sm">${esc(titleCase(d.classification))}</span></div>`},
    {label:'Uploaded',render:d=>`${fmtDate(d.uploadedAt)}<span class="xs muted"> ${esc(userName(d.uploadedBy).replace(/^Demo - /,''))}</span>`},
    {label:'Consent',render:d=>badge(titleCase(d.consent||p.consent.status), (d.consent||p.consent.status)==='granted'?'b-ok':'b-warn')},
    {label:'Publication',render:d=>badge(titleCase(d.publication), d.publication==='approved'?'b-ok':d.publication==='rejected'?'b-crit':'b-neutral')},
    {label:'File',render:d=>d.fileStored?badge('Stored','b-ok'):badge('No file','b-warn')},
    {label:'',cls:'act',render:d=>d.restricted?badge('Restricted','b-dark'):`<button class="btn btn-xs btn-ghost" data-act="view-doc" data-id="${d.id}">View</button>`}
  ], docs, {empty:emptyState('No documents','Upload the signed form, CCC card or supporting evidence.','upload')}),
    {foot:`<span>${ic('shield',13)} Document access is classified. A clinical record is not automatically a media asset.</span>`,
     actions:RBAC.has(user,'media.upload')?`<button class="btn btn-xs btn-primary" data-act="upload-doc" data-patient="${p.id}">${ic('upload',12)} Upload</button>`:''});
}
function patientTimeline(user,p){
  const ev = DB.db.audit.filter(a=>a.entityId===p.id||a.detail?.includes(p.code)).slice(-12).reverse();
  const rows = DB.db.visits.filter(v=>v.patientId===p.id).map(v=>({at:v.date,t:'Home visit',d:titleCase(v.outcome)+' - '+v.notes,by:v.caregiverId}))
    .concat(DB.db.requests.filter(r=>r.patientId===p.id).map(r=>({at:r.submittedAt,t:'Hospital request '+r.no,d:r.reason,by:r.requestedBy})))
    .concat(ev.map(e=>({at:e.ts,t:e.action,d:e.detail,by:e.actor})))
    .sort((a,b)=>new Date(b.at)-new Date(a.at)).slice(0,25);
  return card('Record history', `<div class="timeline">${rows.map(r=>`<div class="tl-item"><div class="t">${esc(titleCase(r.t))}</div>
      <div class="m">${fmtDateTime(r.at)} · ${esc(userName(r.by).replace(/^Demo - /,''))}</div>
      <div class="small muted" style="margin-top:3px">${esc(r.d)}</div></div>`).join('')}</div>`,
    {sub:'Append-only. Clinical, financial and administrative events are interleaved chronologically.'});
}

/* ---------------- Workflow action buttons ---------------- */
function whoCan(cap, countyId){
  /* Which roles could perform this step, so the current user knows who to hand to. */
  return ROLES.filter(r=>RBAC.expandedPerms(r.id).includes(cap))
    .filter(r=>{
      const s=r.scope||{};
      if(s.geo==='global'||s.crossCounty) return true;
      return !countyId || true; /* county binding is per-account, not per-template */
    })
    .map(r=>r.name).slice(0,2);
}
function workflowActions(kind, rec, user){
  const cfg = WORKFLOW[kind];
  const avail = WORKFLOW.next(cfg, rec.status).filter(t=>RBAC.can(user,t.cap,{countyId:rec.countyId,areaId:rec.areaId,assignedTo:rec.assignedTo}).ok);
  if(avail.length)
    return avail.map(t=>`<button class="btn btn-sm ${t.a==='approve'||t.a==='enrol'||t.a==='verify'?'btn-primary':t.a==='reject'?'btn-danger':'btn-ghost'}"
      data-act="wf" data-kind="${kind}" data-id="${rec.id}" data-t="${t.a}">${esc(t.label)}</button>`).join('');
  /* Nothing this user may do: say plainly who the next step belongs to. */
  const next = WORKFLOW.next(cfg, rec.status);
  if(!next.length) return '';
  const owner = next.map(t=>`${t.label} → ${whoCan(t.cap, rec.countyId).join(' / ')||'authorised officer'}`)[0];
  return `<span class="chip" style="background:var(--surface-2);color:var(--muted);font-weight:500">${ic('info',13)} Next step: ${esc(owner)}</span>`;
}

/* ---------------- Assessment pipeline ---------------- */
function renderPipeline(user){
  const ps = DB.db.patients.filter(p=>RBAC.patientVisible(user,p)&&['assessment_initiated','form_submitted','digital_entered','awaiting_verification','approved_enrolment','returned'].includes(p.status));
  const cols = [
    { k:'digital_entered', l:'Digital record entered', hint:'Entered by the Administrative Assistant' },
    { k:'awaiting_verification', l:'Awaiting verification', hint:'Check against the physical form' },
    { k:'approved_enrolment', l:'Approved for enrolment', hint:'Enrolment execution pending' },
    { k:'returned', l:'Returned for correction', hint:'Caregiver or assistant action required' }
  ];
  return pageHead('Assessment pipeline', 'The paper form is the primary field record. The Administrative Assistant digitises and verifies; the caregiver initiates and recommends.',
    RBAC.has(user,'patient.assess.create')?`<button class="btn btn-sm btn-primary" data-act="new-assessment">${ic('plus',15)} New assessment</button>`:'')
  + `<div class="alert neutral" style="margin-bottom:16px">${ic('info',18)}<div><b>Handover states are explicit</b>
      <span class="small">Assessment initiated → physical form submitted → digital record entered → awaiting verification → approved for enrolment → enrolled. Records returned for correction keep their full history; duplicate patients are never created when a form is digitised.</span></div></div>`
  + `<div class="grid g4">${cols.map(c=>{
      const items = ps.filter(p=>p.status===c.k);
      return card(`${c.l} <span class="badge b-neutral nodot" style="margin-left:4px">${items.length}</span>`,
        items.length? `<div class="col" style="gap:9px">${items.map(p=>`<div class="patient-card">
          <div class="spread" style="align-items:flex-start"><div><div class="b1">${esc(p.name)}</div><div class="b2">${esc(p.code)} · ${esc(areaName(p.areaId))}</div></div>
          <button class="btn btn-xs ${c.k==='awaiting_verification'?'btn-primary':'btn-ghost'}" data-act="open-patient" data-id="${p.id}">Open</button></div>
          <div class="row xs muted" style="margin-top:8px;gap:10px">${ic('clock',12)} ${fmtDate(p.intake)} ${p.flags?.includes('duplicate_check_pending')?badge('dup check','b-warn','nodot'):''}</div>
        </div>`).join('')}</div>` : `<div class="xs muted" style="padding:8px 0">${esc(c.hint)}</div>
          <div style="margin-top:10px;color:var(--muted-2);font-size:12px">No records</div>`, {sub:c.hint});
    }).join('')}</div>`;
}

/* ---------------- Attention engine ---------------- */
function renderAttention(user){
  const ps = repo.patientList(user);
  const ids = new Set(ps.map(p=>p.id));
  const cs = DB.db.concerns.filter(c=>ids.has(c.patientId)&&c.status==='open');
  const clinical = cs.filter(c=>c.level==='clinical');
  const admin = cs.filter(c=>c.level!=='clinical');
  const overdue = ps.filter(p=>{const lv=PAT.lastVisit(p);return ['active','extension'].includes(p.status)&&(!lv||daysBetween(lv.date)>21);});
  const noVisit = ps.filter(p=>!PAT.lastVisit(p)&&['active','extension'].includes(p.status));
  const longStay = ps.filter(p=>PAT.days(p)>=180&&['active','extension'].includes(p.status));
  const unresolved = repo.requests(user).filter(r=>r.status==='completed');
  const block = (title,tone,icon,body,sub)=>`<div class="card" style="margin-bottom:16px"><div class="card-h"><div style="color:${tone}">${ic(icon,18)}</div><div><h3 style="margin-left:4px">${title}</h3>${sub?`<div class="sub">${sub}</div>`:''}</div></div><div class="card-b ${body?'':'tight'}">${body||emptyState('Nothing outstanding','No records meet this criterion.','check')}</div></div>`;
  return pageHead('Patients requiring attention','Evidence-based alerts. Clinical urgency is separated from administrative urgency, and every alert names its evidence.',
    `<button class="btn btn-sm btn-ghost" data-act="go" data-v="reports">${ic('file',14)} Patient-Days report</button>`)
  + `<div class="grid g5" style="margin-bottom:16px">
      ${kpi('Clinical concerns', num(new Set(clinical.map(c=>c.patientId)).size),'Escalate per protocol','crit','alert')}
      ${kpi('Administrative', num(new Set(admin.map(c=>c.patientId)).size),'Routine follow-up','warn','clipboard')}
      ${kpi('Overdue visits', num(overdue.length),'> 21 days since last visit','',"clock")}
      ${kpi('No visit recorded', num(noVisit.length),'Enrolled, no field visit','warn','activity')}
      ${kpi('Past 180 days', num(longStay.length),'Discharge evaluation due','crit','target')}
    </div>`
  + block('Clinical priority', 'var(--crit)', 'alert', clinical.length? `<div class="col" style="gap:10px">${clinical.map(c=>{const p=DB.db.patients.find(x=>x.id===c.patientId);return p?`<div class="alert crit">${ic('alert',18)}<div style="flex:1"><b>${esc(p.name)} - ${esc(titleCase(c.type))}</b><span class="small">${esc(c.detail)}</span>
      <div class="xs" style="margin-top:5px;opacity:.75">${esc(areaName(p.areaId))} · ${PAT.days(p)} days · raised ${fmtDate(c.opened)} by ${esc(userName(c.by))}</div></div>
      <button class="btn btn-xs btn-ghost" data-act="open-patient" data-id="${p.id}">Open case</button></div>`:''}).join('')}</div>` : '', 'Documented by an authorised healthcare professional. Never generated from administrative absence alone.')
  + block('Administrative follow-up', 'var(--warn)', 'clipboard', admin.length? table([
      {label:'Patient',render:c=>{const p=DB.db.patients.find(x=>x.id===c.patientId);return p?`<div class="cellname">${esc(p.name)}<span class="sm">${esc(areaName(p.areaId))}</span></div>`:'-';}},
      {label:'Item',render:c=>esc(titleCase(c.type))},
      {label:'Evidence',render:c=>`<span class="small muted">${esc(c.detail)}</span>`},
      {label:'',cls:'act',render:c=>`<button class="btn btn-xs btn-ghost" data-act="open-patient" data-id="${c.patientId}">Open</button>`}
    ], admin) : '', 'Missing forms and overdue paperwork are administrative - not medical emergencies.')
  + block('Overdue home visits', 'var(--warn)', 'clock', overdue.length? table([
      {label:'Patient',render:p=>`<div class="cellname">${esc(p.name)}<span class="sm">${esc(areaName(p.areaId))}</span></div>`},
      {label:'Last visit',render:p=>{const v=PAT.lastVisit(p);return v?`${fmtDate(v.date)} <span class="badge b-warn nodot">${daysBetween(v.date)} days</span>`:'<span class="badge b-crit">never</span>';}},
      {label:'Caregiver',render:p=>esc(userName(p.caregiverId).replace(/^Demo - /,''))},
      {label:'',cls:'act',render:p=>`<button class="btn btn-xs btn-ghost" data-act="open-patient" data-id="${p.id}">Open</button>`}
    ], overdue.slice(0,10)) : '')
  + block('Hospital cases with outstanding reconciliation', 'var(--info)', 'receipt', unresolved.length? table([
      {label:'Request',render:r=>`<div class="cellname">${esc(r.no)}<span class="sm">${esc(r.facility)}</span></div>`},
      {label:'Patient',render:r=>esc(DB.db.patients.find(p=>p.id===r.patientId)?.name||'-')},
      {label:'Status',render:r=>rBadge(r.status)},
      {label:'',cls:'act',render:r=>`<button class="btn btn-xs btn-ghost" data-act="open-request" data-id="${r.id}">Open</button>`}
    ], unresolved.slice(0,8)) : '');
}

/* ---------------- Visits & PDCA ---------------- */
function renderVisits(user, params){
  const ids = new Set(repo.patientList(user).map(p=>p.id));
  const vs = DB.db.visits.filter(v=>ids.has(v.patientId)).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const week = vs.filter(v=>daysBetween(v.date)<7);
  const nf = week.filter(v=>v.outcome==='not_found');
  return pageHead('Visits & progress', `${num(vs.length)} visits recorded in your scope · ${week.length} in the last 7 days`,
    RBAC.has(user,'visit.create')?`<button class="btn btn-sm btn-primary" data-act="record-visit">${ic('plus',15)} Record visit</button>`:'')
  + `<div class="grid g4" style="margin-bottom:16px">
      ${kpi('Visits this week', num(week.length),'Home & clinical','info','activity')}
      ${kpi('Not found at home', num(nf.length),'Previous 7 days',nf.length?'warn':'ok','alert')}
      ${kpi('Patients seen', num(new Set(week.map(v=>v.patientId)).size),'Distinct patients','','users')}
      ${kpi('Average visits / patient', (new Set(vs.map(v=>v.patientId)).size? (vs.length/new Set(vs.map(v=>v.patientId)).size).toFixed(1):'0'),'Across your scope','','chart')}
    </div>`
  + card('Visit log', table([
      {label:'Date',render:v=>fmtDate(v.date)},
      {label:'Patient',render:v=>`<div class="cellname">${esc(DB.db.patients.find(p=>p.id===v.patientId)?.name||'-')}<span class="sm">${esc(areaName(DB.db.patients.find(p=>p.id===v.patientId)?.areaId))}</span></div>`},
      {label:'Type',render:v=>badge(titleCase(v.type),'b-neutral')},
      {label:'Outcome',render:v=>badge(titleCase(v.outcome),v.outcome==='not_found'?'b-warn':'b-ok')},
      {label:'Weight',cls:'num',render:v=>v.weight?v.weight+' kg':'-'},
      {label:'Notes',render:v=>`<span class="small muted">${esc((v.notes||'').slice(0,58))}</span>`},
      {label:'',cls:'act',render:v=>`<button class="btn btn-xs btn-ghost" data-act="open-patient" data-id="${v.patientId}">Open</button>`}
    ], vs.slice(0,40)), {foot:`<span>${ic('info',13)} A failed visit is documented with an outcome - never silently omitted.</span>`});
}
function renderPdca(user, params){
  const ids = new Set(repo.patientList(user).map(p=>p.id));
  const rows = DB.db.pdcas.filter(x=>ids.has(x.patientId) && x.kind!=='review');
  const byStage = ['Plan','Do','Check','Act'].map(s=>({label:s,value:rows.filter(r=>r.stage===s&&r.status==='open').length}));
  const dueList = PDCAX.due(user,{days:30});
  const ext = repo.patientList(user,{status:'active'}).filter(p=>PDCAX.extensionRequired(p));
  return pageHead('PDCA follow-up','Care plans, the 30-day review cycle and Plan-Do-Check-Act cycles in one place.',
    RBAC.has(user,'pdca.create')?`<button class="btn btn-sm btn-primary" data-act="new-pdca">${ic('plus',15)} New cycle</button>`:'')
  + `<div class="grid g4" style="margin-bottom:16px">
      ${kpi('Reviews due or overdue', dueList.length, dueList.filter(x=>x.review.status==='overdue').length+' overdue', dueList.some(x=>x.review.status==='overdue')?'crit':'', 'repeat')}
      ${kpi('Extended cases', ext.length, ext.length?'Review required':'Within programme', ext.length?'warn':'ok', 'alert')}
      ${kpi('Plans on file', repo.patientList(user).filter(p=>p.carePlan).length, 'Of '+repo.patientList(user).length+' patients', '', 'clipboard')}
      ${kpi('Open cycles', rows.filter(r=>r.status==='open'&&r.kind!=='review').length, 'PDCA actions', '', 'layers')}
    </div>
    ${dueList.length? card('Reviews requiring action', table([
      {label:'Patient', render:x=>`<div class="cellname">${esc(x.patient.name)}<span class="sm">${esc(x.patient.code)}</span></div>`},
      {label:'Review', render:x=>`Day ${x.review.day}`},
      {label:'Due', render:x=>fmtDate(x.review.due)},
      {label:'Status', render:x=>x.review.status==='overdue'?badge('Overdue','b-crit'):badge('Due in '+x.days+'d','b-warn')},
      {label:'', cls:'right', render:x=>`<button class="btn btn-xs btn-ghost" data-act="pdca-complete" data-id="${x.patient.id}" data-day="${x.review.day}">Record</button>`}
    ], dueList.slice(0,10))) : ''}
    <div class="grid g2" style="margin-bottom:16px">
      ${card('Open cycles by stage', barChart(byStage,{fmt:v=>num(v)}))}
      ${card('Cycle health', `<div class="dl">
        <dt>Open cycles</dt><dd>${rows.filter(r=>r.status==='open').length}</dd>
        <dt>Overdue check</dt><dd>${rows.filter(r=>r.status==='open'&&new Date(r.due)<new Date()).length}</dd>
        <dt>Closed</dt><dd>${rows.filter(r=>r.status==='closed').length}</dd>
        <dt>Completion</dt><dd>${pct(rows.filter(r=>r.status==='closed').length,rows.length||1)}%</dd>
      </div>`, {sub:'PDCA structures follow the Omaha System problem-classification approach used by LOMAMO.'})}
    </div>`
  + card('All cycles', table([
      {label:'Patient',render:x=>esc(DB.db.patients.find(p=>p.id===x.patientId)?.name||'-')},
      {label:'Plan',render:x=>`<span class="small">${esc(x.plan)}</span>`},
      {label:'Stage',render:x=>badge(x.stage,'b-info')},
      {label:'Due',render:x=>`${fmtDate(x.due)} ${new Date(x.due)<new Date()&&x.status==='open'?badge('overdue','b-crit'):''}`},
      {label:'Owner',render:x=>esc(userName(x.owner).replace(/^Demo - /,''))},
      {label:'',cls:'act',render:x=>`<button class="btn btn-xs btn-ghost" data-act="open-pdca" data-id="${x.id}">Open</button>`}
    ], rows.slice(0,40)));
}
