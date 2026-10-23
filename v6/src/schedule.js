/* ============================================================
   schedule.js - Intelligent field scheduling.

   The system proposes, the person decides. A proposal is built from:
     - when each patient is next due, from their own visit record
     - the 30-day care-plan review calendar
     - approved hospital follow-ups
     - the caregiver's own field pattern and approved leave
     - how many visits one person can realistically make in a day
   Every proposal is a draft. Nothing reaches the calendar until the person
   accepts it, and an accepted plan names the day, the area and the reason.
   ============================================================ */

const SCHED = {
  maxPerDay: 6,

  frequencyDays(p){
    const f = String(p.visitFrequency||'').toLowerCase();
    if(f.includes('every week')) return 7;
    if(f.includes('every other')) return 14;
    if(f.includes('food only')||f.includes('medical only')) return 14;
    const forms = (DB.db.formRecords||[]).filter(r=>r.kind==='home_visit'&&r.patientId===p.id&&r.status==='verified')
      .sort((a,b)=>new Date(b.visitDate||b.submittedAt)-new Date(a.visitDate||a.submittedAt));
    const choice = forms[0]?.data?.frequencyChoice||'';
    if(/every week/i.test(choice)) return 7;
    return 14;
  },

  lastContact(p){
    const visit = (DB.db.visits||[]).filter(v=>v.patientId===p.id && v.outcome!=='not_found')
      .sort((a,b)=>new Date(b.date)-new Date(a.date))[0];
    const form = (DB.db.formRecords||[]).filter(r=>r.patientId===p.id && ['home_visit','hospital_outpatient','hospital_inpatient'].includes(r.kind) && r.status!=='draft')
      .sort((a,b)=>new Date(b.visitDate||0)-new Date(a.visitDate||0))[0];
    const dates=[visit?.date, form?.visitDate].filter(Boolean).map(d=>new Date(d).getTime());
    return dates.length? new Date(Math.max(...dates)) : null;
  },

  nextDue(p){
    const last=this.lastContact(p);
    const interval=this.frequencyDays(p);
    const base = last? last.getTime()+interval*86400000 : Date.now();
    const due = new Date(base);
    const drivers=[];
    if(!last) drivers.push('No recorded contact');
    else drivers.push(`Last contact ${fmtDate(last)}; ${interval}-day frequency`);
    let review=null;
    if(typeof PDCAX!=='undefined'){
      const s=PDCAX.schedule(p).find(x=>x.status!=='completed');
      if(s){ review=s.due; if(s.status==='overdue') drivers.push('Care-plan review overdue'); else drivers.push('Care-plan review due '+fmtDate(s.due)); }
    }
    if(p.status==='discharge_recommended') drivers.push('Discharge recommendation pending');
    const dueMs = due.getTime();
    const overdue = Math.max(0, Math.floor((Date.now()-dueMs)/86400000));
    return { due, days: Math.round((dueMs-Date.now())/86400000), overdue, drivers, interval, review };
  },

  employeeFor(user){
    return (DB.db.employees||[]).find(e=>e.userId===user.id)||null;
  },

  workingDays(user, weekStart){
    const start=new Date(weekStart);
    const dow=(start.getDay()+6)%7; /* 0 = Monday */
    const monday=new Date(start.getTime()-dow*86400000);
    const emp=this.employeeFor(user);
    const days=[];
    for(let i=0;i<5;i++){
      const d=new Date(monday.getTime()+i*86400000);
      const iso=d.toISOString().slice(0,10);
      const onLeave = emp? LEAVE.onLeave(emp.id, iso):null;
      days.push({ date:iso, weekday:i+1, leave:!!onLeave, leaveRecord:onLeave });
    }
    return { monday, days };
  },

  /* Where this person is normally sent on a weekday. Used to cluster work. */
  usualArea(user, weekday){
    const emp=this.employeeFor(user);
    if(!emp) return null;
    const slot=LEAVE_PATTERN.find(p=>p.weekday===weekday && p.staff===emp.id);
    return slot? slot.siteId:null;
  },

  propose(user, {weekStart, maxPerDay}={}){
    if(!RBAC.has(user,'visit.create')&&!RBAC.has(user,'pdca.create'))
      return {ok:false,msg:'Your role does not schedule field visits.'};
    const cap=Math.max(1,Math.min(10, Number(maxPerDay)||this.maxPerDay));
    const {monday,days}=this.workingDays(user, weekStart||nextMonday());
    const patients=repo.patientList(user).filter(p=>['active','extension','discharge_recommended'].includes(p.status));
    const dueList=patients.map(p=>({patient:p,due:this.nextDue(p)}))
      .filter(x=>x.due.days<=7)
      .sort((a,b)=>b.due.overdue-a.due.overdue || a.due.due-b.due.due);

    const workDays=days.filter(d=>!d.leave);
    const buckets=Object.fromEntries(workDays.map(d=>[d.date,[]]));
    const unscheduled=[];
    const areaOf = p => p.areaId;

    dueList.forEach(x=>{
      const p=x.patient;
      const usual = workDays.map(d=>this.usualArea(user,d.weekday)).filter(Boolean);
      /* Prefer a day that matches the area, so travel is shared; otherwise the
         day with the most room. Overdue patients always go first. */
      let candidates=workDays.filter(d=>buckets[d.date].length<cap);
      if(!candidates.length) return unscheduled.push({patient:p,due:x.due,reason:'No capacity in the week'});
      const preferred=candidates.filter(d=>{
        const a=this.usualArea(user,d.weekday);
        return a && LEAVE_SITES.find(s=>s.id===a)?.areaId===areaOf(p);
      });
      const pool = (x.due.overdue>0 || preferred.length===0)? candidates : preferred;
      pool.sort((a,b)=>buckets[a.date].length-buckets[b.date].length);
      const day=pool[0];
      buckets[day.date].push({ patientId:p.id, code:p.code, name:p.name, areaId:p.areaId,
        area:areaName(p.areaId), reason:x.due.drivers.join(' · '), overdue:x.due.overdue,
        priority: x.due.overdue>14?'urgent':x.due.overdue>0?'high':'routine' });
    });

    const plan={ id:uid('sp'), userId:user.id, countyId:user.countyId, weekStart:monday.toISOString().slice(0,10),
      status:'draft', createdAt:new Date().toISOString(), maxPerDay:cap,
      days:workDays.map(d=>({date:d.date,weekday:d.weekday,usualArea:this.usualArea(user,d.weekday),
        stops:buckets[d.date].sort((a,b)=>b.overdue-a.overdue)})),
      unscheduled:unscheduled.map(u=>({patientId:u.patient.id,code:u.patient.code,name:u.patient.name,reason:u.reason})),
      capacity:workDays.length*cap, demand:dueList.length };
    return {ok:true, plan, msg:`${dueList.length} patient(s) due this week; ${plan.unscheduled.length} could not be placed.`};
  },

  save(user, plan){
    if(!plan) return {ok:false,msg:'Nothing to save.'};
    DB.db.scheduleDrafts=DB.db.scheduleDrafts||[];
    const existing=DB.db.scheduleDrafts.find(x=>x.id===plan.id);
    if(existing) Object.assign(existing,plan); else DB.db.scheduleDrafts.unshift(plan);
    AUDIT.append({actor:user.id,action:'schedule.drafted',entity:'schedule',entityId:plan.id,
      detail:`Week of ${plan.weekStart} · ${plan.days.reduce((n,d)=>n+d.stops.length,0)} proposed visit(s)`});
    DB.save();
    return {ok:true,plan,msg:'Draft plan saved. It is not on the calendar until you accept it.'};
  },

  accept(user, id){
    const plan=(DB.db.scheduleDrafts||[]).find(p=>p.id===id);
    if(!plan) return {ok:false,msg:'Plan not found.'};
    if(plan.userId!==user.id && !RBAC.has(user,'system.config')) return {ok:false,msg:'You can only accept your own plan.'};
    if(plan.status==='accepted') return {ok:false,msg:'This plan has already been accepted.'};
    DB.db.calendarEvents=DB.db.calendarEvents||[];
    let n=0;
    plan.days.forEach(day=>day.stops.forEach(stop=>{
      const ev={ id:uid('ev'), at:day.date, kind:'planned_visit', title:`${stop.code} · ${stop.area}`,
        detail:`Planned visit · ${stop.priority} priority`, countyId:plan.countyId,
        visibleTo:[user.id], patientId:stop.patientId, planId:plan.id, createdBy:user.id,
        createdAt:new Date().toISOString() };
      DB.db.calendarEvents.push(ev); n++;
    }));
    plan.status='accepted'; plan.acceptedAt=new Date().toISOString(); plan.acceptedBy=user.id;
    AUDIT.append({actor:user.id,action:'schedule.accepted',entity:'schedule',entityId:plan.id,
      detail:`${n} visit(s) placed on the calendar for the week of ${plan.weekStart}`});
    DB.save();
    return {ok:true,plan,msg:`${n} visit(s) placed on your calendar.`};
  },

  drafts(user){
    return (DB.db.scheduleDrafts||[]).filter(p=>p.userId===user.id)
      .sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  },

  /* What the field plan asks of one person in a week, in numbers. */
  load(plan){
    const total=plan.days.reduce((n,d)=>n+d.stops.length,0);
    const areas=[...new Set(plan.days.flatMap(d=>d.stops.map(s=>s.area)))];
    return { total, areas:areas.length, days:plan.days.filter(d=>d.stops.length).length,
      busiest:Math.max(0,...plan.days.map(d=>d.stops.length)) };
  }
};

function nextMonday(){
  const d=new Date();
  const add=((8-d.getDay())%7)||7;
  return new Date(d.getTime()+add*86400000);
}

/* ---------------- views ---------------- */
function renderSchedule(user, params={}){
  if(!(RBAC.has(user,'visit.create')||RBAC.has(user,'pdca.create'))) return deniedPanel('visit.create');
  const drafts=SCHED.drafts(user);
  const latest=drafts[0]||null;
  const plan=APPX.params?.plan? drafts.find(p=>p.id===APPX.params.plan): null;
  const dueCount=repo.patientList(user).filter(p=>['active','extension'].includes(p.status))
    .map(p=>({p,d:SCHED.nextDue(p)})).filter(x=>x.d.days<=7).length;
  return pageHead('Field scheduling','A proposal built from what is due, where people already work and what one person can do in a day. You accept it before it reaches the calendar.',
    `<button class="btn btn-sm btn-primary" data-act="propose-schedule">${ic('sparkles',15)} Propose next week</button>
     <button class="btn btn-sm btn-ghost" data-act="download-schedule" data-id="${latest?.id||''}">${ic('download',15)} Export</button>`)
  + `<div class="grid g4" style="margin-bottom:16px">
      ${kpi('Due within 7 days', num(dueCount),'Patients in your scope','','calendar')}
      ${kpi('Drafts', num(drafts.filter(d=>d.status==='draft').length),'Not yet accepted','warn','file')}
      ${kpi('Accepted plans', num(drafts.filter(d=>d.status==='accepted').length),'On the calendar','ok','check')}
      ${kpi('Daily limit', num(SCHED.maxPerDay),'Visits per person','','activity')}
    </div>`
  + (latest? scheduleCard(user, plan||latest): card('No plan yet', emptyState('Nothing proposed','Press "Propose next week" to build a draft from the visit records, the 30-day reviews and approved hospital follow-ups.','sparkles')))
  + (drafts.length>1? card('Previous proposals', table([
      {label:'Week of',render:p=>esc(fmtDate(p.weekStart))},
      {label:'Visits',cls:'num',render:p=>SCHED.load(p).total},
      {label:'Areas',cls:'num',render:p=>SCHED.load(p).areas},
      {label:'Status',render:p=>badge(titleCase(p.status),p.status==='accepted'?'b-ok':'b-warn')},
      {label:'',cls:'act',render:p=>`<button class="btn btn-xs btn-ghost" data-act="open-schedule" data-id="${p.id}">Open</button>`}
    ], drafts.slice(1,8))) : '');
}

function scheduleCard(user, plan){
  const load=SCHED.load(plan);
  const accepted=plan.status==='accepted';
  return card(`Proposal for the week of ${fmtDate(plan.weekStart)}`, `
    <div class="row" style="gap:8px;margin-bottom:10px">
      ${badge(accepted?'Accepted':'Draft','' + (accepted?'b-ok':'b-warn'))}
      ${badge(load.total+' visit(s)','b-neutral','nodot')}
      ${badge(load.areas+' area(s)','b-neutral','nodot')}
      ${badge('Busiest day '+load.busiest,'b-neutral','nodot')}
      ${plan.unscheduled.length?badge(plan.unscheduled.length+' not placed','b-crit'):''}
    </div>
    <div class="grid g5">${plan.days.map(d=>`<div class="card" style="box-shadow:none">
      <div class="card-h" style="padding:9px 12px"><h3 style="font-size:12.5px">${new Date(d.date).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'short'})}</h3>
        <div class="r">${badge(d.stops.length+'/'+plan.maxPerDay,'b-neutral','nodot')}</div></div>
      <div class="card-b" style="padding:8px">
        ${d.usualArea?`<div class="xs muted" style="margin-bottom:6px">Usual location: ${esc(LEAVE.site(d.usualArea)?.name||d.usualArea)}</div>`:''}
        ${d.stops.length? d.stops.map(s=>`<div style="padding:6px 0;border-bottom:1px solid var(--line-2)">
          <div class="small"><b>${esc(s.code)}</b> ${esc(s.area)}</div>
          <div class="xs muted">${esc(s.reason)}</div>
          ${s.priority!=='routine'?`<span class="badge ${s.priority==='urgent'?'b-crit':'b-warn'}" style="margin-top:3px">${esc(titleCase(s.priority))}</span>`:''}
        </div>`).join('') : '<div class="xs muted">Free</div>'}
      </div></div>`).join('')}</div>
    ${plan.unscheduled.length?`<div class="alert warn" style="margin-top:12px">${ic('alert',16)}<div><b>${plan.unscheduled.length} patient(s) could not be placed</b>
      <span class="small">${plan.unscheduled.map(u=>esc(u.code+' - '+u.reason)).join('; ')}. Add a day, raise the daily limit or move a visit to the following week.</span></div></div>`:''}
    <div class="row" style="margin-top:12px">
      ${accepted?`<span class="small muted">Accepted on ${esc(fmtDate(plan.acceptedAt))}. The stops are on your calendar.</span>`
        :`<button class="btn btn-sm btn-primary" data-act="save-schedule" data-id="${plan.id}">Save draft</button>
          <button class="btn btn-sm btn-primary" data-act="accept-schedule" data-id="${plan.id}">Accept and place on the calendar</button>`}
      <span class="small muted">A proposal is not a commitment until you accept it.</span>
    </div>`,
    {foot:`<span>${ic('info',13)} Drivers come from the patient's own visit record, the care-plan review schedule and approved hospital requests. Nothing is invented.</span>`});
}
