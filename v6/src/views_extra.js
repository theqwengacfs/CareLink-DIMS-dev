/* ============================================================
   views_extra.js - Calendar, organisational registry, PR console
   Three workspaces that were missing, each reading the same
   authoritative records rather than keeping a second copy.
   ============================================================ */

/* ---------------- Calendar ---------------- */
function calendarEvents(user){
  const ev = [];
  const mine = p => repo.patient(user, p.id);
  if(RBAC.has(user,'patient.list')){
    repo.patientList(user).forEach(p=>{
      const v = DB.db.visits.filter(x=>x.patientId===p.id).sort((a,b)=>new Date(b.date)-new Date(a.date))[0];
      if(v && v.nextDue) ev.push({ at:v.nextDue, kind:'visit', title:'Home visit due - '+p.code, detail:areaName(p.areaId), tone:'ok', ref:p.id, sensitive:true });
    });
    repo.requests(user).filter(r=>['approved','assigned'].includes(r.status)).forEach(r=>{
      if(r.appointment) ev.push({ at:r.appointment, kind:'hospital', title:'Hospital appointment - '+r.no, detail:titleCase(r.priority)+' priority', tone:'crit', ref:r.id, sensitive:true });
    });
  }
  if(RBAC.has(user,'hr.view')){
    DB.db.leaveRequests.filter(l=>l.status==='approved').forEach(l=>{
      const e = DB.db.employees.find(x=>x.id===l.employeeId);
      ev.push({ at:l.from, kind:'leave', title:(e?.name||'Staff')+' on leave', detail:titleCase(l.type)+' until '+fmtDate(l.to), tone:'warn' });
    });
  }
  (DB.db.workPlans||[]).filter(w=>w.userId===user.id||w.supervisorId===user.id).forEach(w=>{
    ev.push({ at:w.period+'-01', kind:'workplan', title:'Work plan due - '+w.period, detail:'Submitted by the last day of the previous month', tone:'info' });
  });
  (DB.db.publications||[]).filter(p=>['scheduled','approved'].includes(p.status)&&p.scheduledAt).forEach(p=>{
    if(RBAC.has(user,'media.view')) ev.push({ at:p.scheduledAt, kind:'media', title:'Publication - '+p.title, detail:titleCase(p.status), tone:'info' });
  });
  (DB.db.calendarEvents||[]).filter(e=>e.visibleTo==='all'||(e.visibleTo||[]).includes(user.id)).forEach(e=>{
    ev.push({ at:e.at, kind:e.kind||'event', title:e.title, detail:e.detail||'', tone:'info' });
  });
  return ev.filter(e=>e.at).sort((a,b)=>new Date(a.at)-new Date(b.at));
}

function renderCalendar(user, params={}){
  const all = calendarEvents(user);
  const now = new Date();
  const monthParam = params.month || (now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0'));
  const [yy,mm] = monthParam.split('-').map(Number);
  const first = new Date(yy, mm-1, 1);
  const days = new Date(yy, mm, 0).getDate();
  const startDow = (first.getDay()+6)%7;                 /* Monday first */
  const byDay = {};
  all.forEach(e=>{ const d=new Date(e.at); if(d.getFullYear()===yy && d.getMonth()===mm-1) (byDay[d.getDate()]=byDay[d.getDate()]||[]).push(e); });
  const upcoming = all.filter(e=>new Date(e.at) >= new Date(now.toDateString())).slice(0,8);
  const cells = [];
  for(let i=0;i<startDow;i++) cells.push('<div class="cal-cell empty"></div>');
  for(let day=1; day<=days; day++){
    const list = byDay[day]||[];
    const isToday = day===now.getDate() && mm===now.getMonth()+1 && yy===now.getFullYear();
    cells.push(`<div class="cal-cell ${isToday?'today':''}">
      <div class="cal-d">${day}</div>
      ${list.slice(0,3).map(e=>`<div class="cal-ev ${e.tone}">${esc(e.title)}</div>`).join('')}
      ${list.length>3?`<div class="cal-more">+${list.length-3} more</div>`:''}</div>`);
  }
  const prev = new Date(yy, mm-2, 1), next = new Date(yy, mm, 1);
  const label = first.toLocaleString('en-GB',{month:'long',year:'numeric'});
  return pageHead('Calendar','Visits, appointments, leave, plan deadlines and approved publications, from the records themselves.',
    `<div class="seg"><button data-act="go" data-v="calendar" data-month="${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,'0')}">Previous</button>
      <button class="on">${esc(label)}</button>
      <button data-act="go" data-v="calendar" data-month="${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}">Next</button></div>`)
  + `<div class="grid g4" style="margin-bottom:16px">
      ${kpi('Next seven days', num(all.filter(e=>{const d=new Date(e.at);return d>=new Date(now.toDateString())&&d<new Date(now.getTime()+7*86400000);}).length),'Across what you may see','','calendar')}
      ${kpi('Visits due', num(all.filter(e=>e.kind==='visit').length),'From the last recorded visit','ok','activity')}
      ${kpi('Hospital appointments', num(all.filter(e=>e.kind==='hospital').length),'Approved and assigned','crit','hospital')}
      ${kpi('Staff on leave', num(all.filter(e=>e.kind==='leave').length),'Approved leave starting this month',all.some(e=>e.kind==='leave')?'warn':'','users')}
    </div>`
  + `<div class="grid g2">
      ${card('Month', `<div class="cal-grid">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>`<div class="cal-h">${d}</div>`).join('')}${cells.join('')}</div>`)}
      ${card('Next up', `<div class="col" style="gap:8px">${upcoming.length? upcoming.map(e=>`<div class="cal-row">
          <div class="cal-date"><b>${new Date(e.at).getDate()}</b><span>${new Date(e.at).toLocaleString('en-GB',{month:'short'})}</span></div>
          <div><b style="font-size:13px">${esc(e.title)}</b><div class="xs muted">${esc(e.detail||'')}</div></div>
          <span class="cal-kind ${e.tone}">${esc(titleCase(e.kind))}</span></div>`).join('') : `<p class="small muted">Nothing scheduled in the coming days.</p>`}</div>`,
        {sub:'Sensitive events show a reference and area, never a clinical detail.'})}
    </div>`;
}

/* ---------------- Organisational registry ---------------- */
function registryChecks(){
  const checks = [];
  const areas = COUNTIES.flatMap(c=>c.areas.map(a=>({...a, county:c.id})));
  const dupAreas = areas.filter((a,i)=>areas.findIndex(b=>b.name.toLowerCase()===a.name.toLowerCase())!==i);
  checks.push({ name:'Ministry area names are unique', ok:dupAreas.length===0, detail:dupAreas.length?dupAreas.map(a=>a.name).join(', '):areas.length+' areas' });
  const dupDepts = DEPARTMENTS.filter((d,i)=>DEPARTMENTS.findIndex(x=>x.name.toLowerCase()===d.name.toLowerCase())!==i);
  checks.push({ name:'Department names are unique', ok:dupDepts.length===0, detail:dupDepts.length?dupDepts.map(d=>d.name).join(', '):DEPARTMENTS.length+' departments' });
  const orphanUsers = (DB.db.users||[]).filter(u=>u.areaIds?.length && u.areaIds.some(id=>!areas.find(a=>a.id===id)));
  checks.push({ name:'Every staff assignment points at a known ministry area', ok:orphanUsers.length===0, detail:orphanUsers.length?orphanUsers.map(u=>u.username).join(', '):'No orphaned assignments' });
  const roleless = (DB.db.users||[]).filter(u=>!roleObj(u.roleId));
  checks.push({ name:'Every account holds a defined role', ok:roleless.length===0, detail:roleless.length?roleless.map(u=>u.username).join(', '):'All accounts mapped' });
  const nobody = ROLES.filter(r=>!(DB.db.users||[]).some(u=>u.roleId===r.id)).map(r=>r.name);
  checks.push({ name:'Every role in the structure is held by at least one person', ok:nobody.length===0, detail:nobody.length?nobody.join(', '):'All '+ROLES.length+' roles held' });
  const dupStaff = (DB.db.employees||[]).filter((e,i)=>DB.db.employees.findIndex(x=>x.name.toLowerCase()===e.name.toLowerCase())!==i);
  checks.push({ name:'No duplicate staff records', ok:dupStaff.length===0, detail:dupStaff.length?dupStaff.map(e=>e.name).join(', '):(DB.db.employees||[]).length+' staff records' });
  return checks;
}

function renderRegistry(user){
  const checks = registryChecks();
  const failed = checks.filter(c=>!c.ok);
  const areas = COUNTIES.flatMap(c=>c.areas.map(a=>({...a, county:c.name})));
  const history = (DB.db.audit||[]).filter(a=>['registry','setting','role','user'].includes(a.entity)||String(a.action).startsWith('registry')).slice(-12).reverse();
  return pageHead('Organisational registry',
    'The authoritative list of counties, ministry areas, departments, roles and staff assignments. Other consoles read from here; they do not keep their own copy.',
    `<button class="btn btn-sm btn-ghost" data-act="export-registry-xlsx">${ic('download',14)} Excel</button>
     <button class="btn btn-sm btn-ghost" data-act="go" data-v="org">${ic('building',14)} Edit structure</button>`)
  + `<div class="grid g4" style="margin-bottom:16px">
      ${kpi('Counties', num(COUNTIES.length),'County offices','','building')}
      ${kpi('Ministry areas', num(areas.length),'Programme catchment','','target')}
      ${kpi('Departments', num(DEPARTMENTS.length),'Functional units','','layers')}
      ${kpi('Integrity checks', failed.length? failed.length+' failing':'All passing', failed.length?'Needs attention':'Structure is consistent', failed.length?'crit':'ok','check')}
    </div>`
  + card('Data-quality checks', `<div class="col" style="gap:8px">${checks.map(c=>`
      <div class="row" style="gap:9px;align-items:flex-start">
        <span style="color:${c.ok?'var(--ok)':'var(--crit)'};flex:0 0 16px">${ic(c.ok?'check':'alert',15)}</span>
        <div style="flex:1"><span class="small">${esc(c.name)}</span><div class="xs muted">${esc(c.detail)}</div></div>
      </div>`).join('')}</div>`,
    {sub:'Run on the live records every time this page opens. A failing check is a finding, not a warning to be dismissed.'})
  + `<div class="grid g2" style="margin-top:16px">
      ${card('Ministry areas and county offices', table([
        {label:'Area',render:a=>`<div class="cellname">${esc(a.name)}<span class="sm">${esc(a.county)}</span></div>`},
        {label:'Patients',cls:'num',render:a=>num((DB.db.patients||[]).filter(p=>p.areaId===a.id).length)},
        {label:'Caregivers',cls:'num',render:a=>num((DB.db.users||[]).filter(u=>(u.areaIds||[]).includes(a.id)).length)}
      ], areas), {sub:'Adding or renaming an area is a configurable change; existing records are never rewritten silently.'})}
      ${card('Roles and holders', table([
        {label:'Role',render:r=>`<div class="cellname">${esc(r.name)}<span class="sm">${esc(deptName(r.dept))}</span></div>`},
        {label:'Capabilities',cls:'num',render:r=>num(RBAC.expandedPerms(r.id).length)},
        {label:'Holders',cls:'num',render:r=>{const n=(DB.db.users||[]).filter(u=>u.roleId===r.id).length;return n?num(n):badge('None','b-warn','nodot');}}
      ], ROLES), {sub:'A role with no holder is not an error, but it is worth a decision.'})}
    </div>`
  + `<div style="margin-top:16px">${card('Recent changes to organisational records', table([
      {label:'When',render:a=>fmtDateTime(a.at)},
      {label:'Who',render:a=>esc(userName(a.actor))},
      {label:'Change',render:a=>esc(a.action)},
      {label:'Detail',render:a=>`<span class="small muted">${esc(a.detail||'')}</span>`}
    ], history, {emptyMsg:'No organisational changes recorded yet.'}))}</div>`;
}

/* ---------------- Public relations console ---------------- */
function renderPR(user){
  const stakes = DB.db.stakeholders||[];
  const enquiries = DB.db.enquiries||[];
  const openQ = enquiries.filter(e=>e.status==='open');
  const releases = (DB.db.publications||[]).filter(p=>['draft','review','approved'].includes(p.status));
  return pageHead('Public relations','Stakeholder engagement, public enquiries and approved external communication.',
    `<button class="btn btn-sm btn-primary" data-act="new-enquiry">${ic('plus',15)} Log an enquiry</button>`)
  + `<div class="grid g4" style="margin-bottom:16px">
      ${kpi('Open enquiries', num(openQ.length),'Awaiting a reply',openQ.length?'warn':'ok','bell')}
      ${kpi('Stakeholders', num(stakes.length),'Partner and media contacts','','users')}
      ${kpi('Awaiting approval', num(releases.filter(r=>r.status==='review').length),'Communication items','','eye')}
      ${kpi('Approved factsheets', num((DB.db.kbDocs||[]).filter(d=>d.classification==='Donor-facing (approved)').length),'Reusable public material','ok','file')}
    </div>`
  + `<div class="grid g2">
      ${card('Public enquiries', table([
        {label:'From',render:e=>`<div class="cellname">${esc(e.from)}<span class="sm">${esc(e.channel||'phone')}</span></div>`},
        {label:'Subject',render:e=>esc(e.subject)},
        {label:'Received',render:e=>`<span class="small">${fmtDate(e.at)}</span>`},
        {label:'Status',render:e=>badge(titleCase(e.status), e.status==='open'?'b-warn':'b-ok')},
        {label:'',cls:'act',render:e=>e.status==='open'?`<button class="btn btn-xs btn-ghost" data-act="answer-enquiry" data-id="${e.id}">Answer</button>`:''}
      ], enquiries, {emptyMsg:'Public questions logged here are answered within the published service standard.'}))}
      ${card('Stakeholders', table([
        {label:'Organisation',render:s=>`<div class="cellname">${esc(s.name)}<span class="sm">${esc(s.type||'Partner')}</span></div>`},
        {label:'Contact',render:s=>`<span class="small">${esc(s.contact||'-')}</span>`},
        {label:'Last contact',render:s=>s.lastContact?fmtDate(s.lastContact):'-'}
      ], stakes, {emptyMsg:'Add partners, media houses and county offices you correspond with.'}),
        {sub:'A stakeholder record holds organisational contacts only. It never holds patient information.'})}
    </div>
    <div style="margin-top:16px">${card('Communication awaiting approval', table([
        {label:'Item',render:p=>`<div class="cellname">${esc(p.title)}<span class="sm">${esc(titleCase(p.category))}</span></div>`},
        {label:'State',render:p=>pubBadge(p.status)},
        {label:'Owner',render:p=>esc(userName(p.createdBy))},
        {label:'',cls:'act',render:p=>`<button class="btn btn-xs btn-ghost" data-act="publication-open" data-id="${p.id}">Open</button>`}
      ], releases, {emptyMsg:'Nothing awaiting approval.'}),
      {sub:'Approval authority sits with the Media and Information Governance function, not with Public Relations alone.'})}</div>`;
}
