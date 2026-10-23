/* ============================================================
   insight6.js - what the records say about themselves

   Two things live here because they answer the same question: is
   what we hold good enough to act on?

     1. The data-quality engine. Every finding is computed live from
        the record it refers to - nothing is a stored opinion. A
        finding is either BLOCKING (the record may not leave the
        system for a report until it is corrected) or a WARNING or
        an ADVISORY note. Warnings and advisories may be waived, by
        someone holding dq.manage, with a written reason, for ninety
        days; blocking findings may not be waived - they are
        corrected in the record itself.

     2. The visit-order learner. It reads the field days the team has
        actually entered and learns the sequence in which each
        caregiver moves between service areas. From that, and from
        what is due, it proposes the next patient to see. It never
        schedules anything by itself: a proposal becomes a calendar
        entry only when a person presses the button, and the reason
        travels with it.
   ============================================================ */

/* =====================================================================
   1. DATA QUALITY
   ===================================================================== */
const DQ6 = {
  WAIVER_DAYS: 90,

  LEVELS: {
    block:{ label:'Blocking', cls:'b-crit', rank:0,
      meaning:'Must be corrected in the record. It is not waivable, and the affected record is not certified for reporting.' },
    warn:{ label:'Warning',  cls:'b-warn', rank:1,
      meaning:'Should be corrected. It may be waived for a stated period with a written reason.' },
    info:{ label:'Advisory', cls:'b-neutral', rank:2,
      meaning:'Worth a look. It may be waived for a stated period with a written reason.' }
  },

  ensure(){ DB.db.dqIssues = DB.db.dqIssues || []; return DB.db.dqIssues; },

  /* Every finding carries a key built from the rule and the record it
     concerns, so a waiver survives the next scan. */
  scan(user){
    const out = [];
    const push = (level, rule, text, entity, entityId, extra={}) =>
      out.push({ key:rule+':'+entityId, level, rule, text, entity, entityId, ...extra });
    const ps = (typeof repo!=='undefined' && repo.patientList) ? repo.patientList(user) : [];
    const allowed = (typeof PROGRAM_DURATION_DEFAULT!=='undefined') ? PROGRAM_DURATION_DEFAULT : [];
    const cccSeen = {}, natSeen = {};

    ps.forEach(p=>{
      if(!p.intake) push('block','intake-missing',`${p.code} has no assessment intake date`,'patient',p.id);
      if(p.intake && p.discharge && new Date(p.discharge) < new Date(p.intake))
        push('block','dates-inverted',`${p.code} is discharged before the intake date`,'patient',p.id);
      if(!p.caregiverId) push('warn','no-caregiver',`${p.code} has no caregiver assigned`,'patient',p.id);
      if(!p.phone) push('warn','no-contact',`${p.code} has no contact number`,'patient',p.id);
      if(p.plannedDays && allowed.length && !allowed.includes(+p.plannedDays))
        push('warn','duration-unlisted',`${p.code} is enrolled for ${p.plannedDays} days, which is not a configured programme duration`,'patient',p.id);
      if(p.programDays && +p.programDays > 330)
        push('warn','duration-outlier',`${p.code} has accumulated ${p.programDays} programme days, beyond the 330-day ceiling`,'patient',p.id);
      if(!p.docsVerified) push('info','docs-unverified',`${p.code} source documents are not yet verified`,'patient',p.id);
      const ccc = String(p.ccc||'').trim();
      if(ccc){ if(cccSeen[ccc]) push('block','duplicate-ccc',`CCC number ${ccc} is held by ${cccSeen[ccc]} and ${p.code} - PMI review required`,'patient',p.id);
               else cccSeen[ccc] = p.code; }
      const nat = (typeof nationalIdClean==='function') ? nationalIdClean(p.nationalId) : String(p.nationalId||'');
      if(nat){ if(natSeen[nat]) push('block','duplicate-national-id',`National ID on ${natSeen[nat]} and ${p.code} match - PMI review required, never an automatic merge`,'patient',p.id);
               else natSeen[nat] = p.code; }
    });

    const inScope = new Set(ps.map(p=>p.id));
    (DB.db.requests||[]).filter(r=>inScope.has(r.patientId))
      .forEach(r=>{ if(['completed','reconciled'].includes(r.status) && !r.clinicalReport)
        push('warn','request-no-report',`${r.no||r.id} is closed without a clinical report`,'request',r.id); });

    (DB.db.visits||[]).forEach(v=>{
      if(!inScope.has(v.patientId)) return;
      const p = ps.find(x=>x.id===v.patientId);
      if(p && p.discharge && v.date && new Date(v.date) > new Date(p.discharge))
        push('warn','visit-after-discharge',`A visit to ${p.code} is dated after discharge`,'visit',v.id);
    });

    /* Financial findings only for roles entitled to see financial records,
       and only within the county they may inspect. */
    if(RBAC.has(user,'finance.view') || RBAC.has(user,'audit.view')){
      const role = (typeof roleObj==='function' ? roleObj(user.roleId) : null) || { scope:{} };
      const global = (role.scope||{}).geo === 'global' || (role.scope||{}).crossCounty;
      (DB.db.transactions||[]).filter(t=>global || t.countyId===user.countyId)
        .forEach(t=>{ if(!t.receipt) push('warn','receipt-missing',`${t.no||t.id} has no receipt on file`,'transaction',t.id); });
    }

    const rank = l => this.LEVELS[l].rank;
    return out.sort((a,b)=>rank(a.level)-rank(b.level) || a.text.localeCompare(b.text));
  },

  waiverFor(key){
    const w = this.ensure().find(x=>x.key===key && x.status==='waived');
    if(!w) return null;
    return (w.until && new Date(w.until) < new Date()) ? null : w;
  },

  open(user){
    const issues = this.scan(user);
    return issues.map(i=>({ ...i, waiver:this.waiverFor(i.key) })).filter(i=>!i.waiver);
  },

  counts(list){
    const c = { block:0, warn:0, info:0 };
    list.forEach(i=>{ c[i.level] = (c[i.level]||0)+1; });
    return c;
  },

  waive(user, key, reason, days){
    if(!RBAC.has(user,'dq.manage')) return { ok:false, error:'Your role may read data-quality findings but not waive them (dq.manage is required).' };
    const text = String(reason||'').trim();
    if(text.length < 12) return { ok:false, error:'Give a reason of at least twelve characters. A waiver without a reason is not a decision.' };
    const issue = this.scan(user).find(i=>i.key===key);
    if(!issue) return { ok:false, error:'That finding no longer exists, so there is nothing to waive.' };
    if(issue.level==='block') return { ok:false, error:'Blocking findings are corrected in the record, not waived.' };
    const span = Math.max(1, Math.min(365, +(days||this.WAIVER_DAYS)));
    const until = new Date(Date.now() + span*86400000).toISOString().slice(0,10);
    this.ensure().unshift({ id:uid('dq'), key, rule:issue.rule, level:issue.level, entity:issue.entity,
      entityId:issue.entityId, text:issue.text, reason:text, by:user.id, at:new Date().toISOString(),
      until, status:'waived' });
    AUDIT.append({ actor:user.id, action:'dataquality.waived', entity:issue.entity, entityId:issue.entityId,
      detail:`${issue.text} · until ${until} · ${text.slice(0,120)}` });
    DB.save();
    return { ok:true, until };
  },

  reopen(user, id){
    if(!RBAC.has(user,'dq.manage')) return { ok:false, error:'Your role may not reopen a finding.' };
    const w = this.ensure().find(x=>x.id===id);
    if(!w) return { ok:false, error:'That waiver no longer exists.' };
    w.status = 'reopened'; w.reopenedBy = user.id; w.reopenedAt = new Date().toISOString();
    AUDIT.append({ actor:user.id, action:'dataquality.reopened', entity:w.entity, entityId:w.entityId,
      detail:`${w.text} · waiver withdrawn` });
    DB.save();
    return { ok:true };
  },

  csv(user){
    const rows = [['Level','Finding','Rule','Record','Waived until','Reason']];
    this.open(user).forEach(i=>rows.push([this.LEVELS[i.level].label, i.text, i.rule, i.entityId, '', '']));
    this.ensure().filter(w=>w.status==='waived').forEach(w=>rows.push(['Waived', w.text, w.rule, w.entityId, w.until, w.reason]));
    return rows.map(r=>r.map(c=>`"${String(c==null?'':c).replace(/"/g,'""')}"`).join(',')).join('\n');
  }
};

function renderDataQuality(user){
  if(!RBAC.has(user,'patient.list')) return deniedPanel('patient.list');
  const params = APPX.params||{};
  const tab = params.tab || 'all';
  const rule = params.rule || '';
  const page = Math.max(1, +params.page || 1), per = 40;

  const all = DQ6.scan(user);
  const c = DQ6.counts(all);
  const waived = DQ6.ensure().filter(w=>w.status==='waived');
  const active = waived.filter(w=>!w.until || new Date(w.until) >= new Date());
  const waiverBy = new Map(waived.filter(w=>!w.until || new Date(w.until) >= new Date()).map(w=>[w.key, w]));
  const open = all.filter(i=>!waiverBy.has(i.key));

  const byTab = tab==='all' ? open : open.filter(i=>i.level===tab);
  const ruleCount = new Map();
  byTab.forEach(i=>ruleCount.set(i.rule, (ruleCount.get(i.rule)||0)+1));
  const rows = rule ? byTab.filter(i=>i.rule===rule) : byTab;
  const pages = Math.max(1, Math.ceil(rows.length/per));
  const slice = rows.slice((page-1)*per, page*per);
  const canWaive = RBAC.has(user,'dq.manage');
  const tabBtn = (id,label,count)=>`<button class="btn btn-sm ${tab===id?'btn-primary':'btn-ghost'}" data-act="dq-tab" data-tab="${id}">${label}${count!==undefined?` <b>${num(count)}</b>`:''}</button>`;
  const ruleBtn = r => `<button class="btn btn-xs ${rule===r?'btn-primary':'btn-ghost'}" data-act="dq-rule" data-rule="${esc(r)}">${esc(ruleLabel(r))}</button>`;

  return pageHead('Data quality',
    'Findings are computed from the records each time this page opens, never stored as an opinion. Blocking findings are corrected in the record; warnings and advisories may be waived, with a written reason, for a stated period.',
    `<button class="btn btn-sm btn-ghost" data-act="dq-export">${ic('download',15)} Export CSV</button>`)
  + `<div class="grid g4" style="margin-bottom:16px">
      ${kpi('Blocking', num(c.block), 'Must be corrected in the record', c.block?'crit':'ok','alert')}
      ${kpi('Warnings', num(c.warn), 'Waivable for a stated period', c.warn?'warn':'ok','alert')}
      ${kpi('Advisory', num(c.info), 'For review', '', 'info')}
      ${kpi('Active waivers', num(active.length), 'Each carries a reason and an end date', '', 'file')}
    </div>`
  + `<div class="note">${ic('info',15)}<span><b>Blocking</b> means the affected record is not certified for a report until it is corrected; the register stays readable.
      <b>Warning</b> and <b>advisory</b> findings never stop work. A waiver records who accepted the finding, why, and until when  -  after that it returns to this list by itself.</span></div>`
  + `<div class="row" style="gap:8px;margin:16px 0;flex-wrap:wrap">
      ${tabBtn('all','All findings', open.length)}${tabBtn('block','Blocking', c.block)}${tabBtn('warn','Warnings', c.warn)}${tabBtn('info','Advisory', c.info)}
    </div>`
  + card('What is being found', table([
      { label:'Finding type', render:r=>ruleBtn(r.rule)+(rule===r.rule?' <span class="badge b-neutral nodot">filtering</span>':'') },
      { label:'Level', render:r=>badge(DQ6.LEVELS[r.level].label, DQ6.LEVELS[r.level].cls, false) },
      { label:'Records', cls:'num', render:r=>num(ruleCount.get(r.rule)) }
    ], [...ruleCount.entries()].sort((a,b)=>b[1]-a[1]).map(([r,n])=>({ rule:r, level:(byTab.find(i=>i.rule===r)||{}).level||'warn', n })),
      { compact:true, empty:emptyState('Nothing outstanding','No finding matches this filter. That is a statement about the records, not a blank page.','check') }))
  + (rule? `<div class="row" style="gap:8px;margin:12px 0">${ruleBtn('')}<span class="xs muted">Filtered to ${esc(ruleLabel(rule))} · ${num(rows.length)} record(s)</span></div>` : '')
  + card(`${num(rows.length)} finding${rows.length===1?'':'s'}${pages>1?` · page ${page} of ${pages}`:''}`, table([
      { label:'Level', w:'110px', render:i=>badge(DQ6.LEVELS[i.level].label, DQ6.LEVELS[i.level].cls, false) },
      { label:'Finding', render:i=>`${esc(i.text)}<span class="sm xs muted"> · ${esc(ruleLabel(i.rule))}</span>` },
      { label:'Record', render:i=>i.entity==='patient'
          ? `<button class="btn btn-xs btn-ghost" data-act="dq-open" data-id="${i.entityId}">Open record</button>`
          : `<span class="xs muted">${esc(i.entity)}</span>` },
      { label:'Decision', render:i=>{
          if(i.level==='block') return `<span class="xs muted">Correct the record</span>`;
          return canWaive ? `<button class="btn btn-xs btn-ghost" data-act="dq-waive-form" data-key="${esc(i.key)}">Waive…</button>` : `<span class="xs muted">dq.manage required</span>`;
        } }
    ], slice, { empty:emptyState('Nothing outstanding','No finding matches this filter. That is a statement about the records, not a blank page.','check') })
    + (pages>1? `<div class="pager">${Array.from({length:Math.min(pages,10)},(_,i)=>`<button class="pg ${page===i+1?'on':''}" data-act="dq-page" data-p="${i+1}">${i+1}</button>`).join('')}<span class="xs muted">${num(rows.length)} findings</span></div>`:''))
  + (waived.length ? card('Waiver register', table([
      { label:'Finding', render:w=>esc(w.text) },
      { label:'Reason', render:w=>`<span class="xs">${esc(w.reason)}</span>` },
      { label:'Until', render:w=>`<span class="mono xs">${esc(w.until)}</span>${w.status==='reopened'?' <span class="badge b-neutral nodot">withdrawn</span>':(w.until && new Date(w.until)<new Date()?' <span class="badge b-warn nodot">expired</span>':'')}` },
      { label:'', render:w=>canWaive && w.status==='waived' ? `<button class="btn btn-xs btn-ghost" data-act="dq-reopen" data-id="${w.id}">Withdraw</button>` : '' }
    ], waived.slice(0,40))) : '');
}

/* Plain-language names for the rules, so a finding reads as a sentence a
   department head can act on rather than as a code. */
function ruleLabel(rule){
  return ({
    'intake-missing':'Missing assessment date',
    'dates-inverted':'Discharge before intake',
    'no-caregiver':'No caregiver assigned',
    'no-contact':'No contact number',
    'duration-unlisted':'Unlisted programme duration',
    'duration-outlier':'Programme days beyond the ceiling',
    'docs-unverified':'Source documents unverified',
    'duplicate-ccc':'Duplicate CCC number',
    'duplicate-national-id':'Duplicate national ID',
    'request-no-report':'Service closed without a report',
    'visit-after-discharge':'Visit after discharge',
    'receipt-missing':'Receipt missing'
  })[rule] || rule;
}

/* =====================================================================
   2. VISIT-ORDER LEARNER
   ---------------------------------------------------------------------
   The order in which visits are recorded on a field day is the only
   evidence the system has of the route a caregiver walked. It is
   inferred, and it says so. Once a caregiver's days are entered, the
   learner can answer: "given where you finished, who is next?".
   ===================================================================== */
const PLAN6 = {
  LOOKBACK_DAYS: 70,

  visits(user){
    const since = Date.now() - this.LOOKBACK_DAYS*86400000;
    return (DB.db.visits||[]).map((v,i)=>({ ...v, _seq:i }))
      .filter(v=>user && v.caregiverId===user.id && v.date && new Date(v.date).getTime() >= since)
      .sort((a,b)=> a.date===b.date ? a._seq-b._seq : (a.date<b.date?-1:1));
  },

  /* One entry per field day, in recorded order. */
  fieldDays(user){
    const byDate = {};
    this.visits(user).forEach(v=>{ (byDate[v.date] = byDate[v.date]||[]).push(v); });
    return Object.keys(byDate).sort().map(date=>{
      const stops = byDate[date].map(v=>{
        const p = (DB.db.patients||[]).find(x=>x.id===v.patientId) || {};
        return { patientId:v.patientId, code:p.code||' - ', areaId:p.areaId||v.areaId||null,
          area:(typeof areaName==='function'&&p.areaId)?areaName(p.areaId):'Unknown area', outcome:v.outcome||'seen' };
      });
      return { date, stops, seen:stops.filter(s=>s.outcome==='seen').length,
        notFound:stops.filter(s=>s.outcome==='not_found').length };
    });
  },

  patterns(user){
    const days = this.fieldDays(user);
    const transitions = new Map();
    days.forEach(d=>{
      for(let i=1;i<d.stops.length;i++){
        const a = d.stops[i-1].area, b = d.stops[i].area;
        if(!a || !b) continue;
        const k = a+'|'+b;
        transitions.set(k, (transitions.get(k)||0)+1);
      }
    });
    const lastArea = days.length ? (days[days.length-1].stops.slice(-1)[0]||{}).area : null;
    const nextFromLast = [...transitions.entries()]
      .filter(([k])=>lastArea && k.split('|')[0]===lastArea)
      .map(([k,n])=>({ to:k.split('|')[1], n })).sort((a,b)=>b.n-a.n);
    const totalStops = days.reduce((n,d)=>n+d.stops.length,0);
    return { days, lastArea, transitions:[...transitions.entries()].map(([k,n])=>({ from:k.split('|')[0], to:k.split('|')[1], n }))
      .sort((a,b)=>b.n-a.n), nextFromLast, totalStops,
      avgStops: days.length ? +(totalStops/days.length).toFixed(1) : 0 };
  },

  due(user){
    if(typeof SCHED==='undefined') return [];
    return repo.patientList(user)
      .filter(p=>['active','extension','discharge_recommended'].includes(p.status))
      .map(p=>({ p, due:SCHED.nextDue(p) }));
  },

  /* The suggestion is a ranking with its reasons attached. Nothing here
     changes a record; the caller decides. */
  MIN_FIELD_DAYS: 3,

  suggest(user, limit=3){
    const pat = this.patterns(user);
    /* Below three field days there is no pattern to learn from, so the
       honest answer is that no order is proposed yet. */
    if(pat.days.length < this.MIN_FIELD_DAYS)
      return { list:[], basis:{ fieldDays:pat.days.length, stops:pat.totalStops,
        avgStops:pat.avgStops, lastArea:pat.lastArea, needsMore:this.MIN_FIELD_DAYS-pat.days.length }, patterns:pat };
    const today = String(todayISO()).slice(0,10);
    const already = new Set((DB.db.calendarEvents||[]).filter(e=>String(e.at||'').slice(0,10)===today && e.kind==='planned_visit').map(e=>e.patientId));
    const seenToday = new Set(this.fieldDays(user).filter(d=>d.date===today).flatMap(d=>d.stops.map(s=>s.patientId)));
    const weights = Object.fromEntries(pat.nextFromLast.map(x=>[x.to, x.n]));
    const ranked = this.due(user).filter(x=>!seenToday.has(x.p.id)).map(x=>{
      const reasons = [];
      let score = 0;
      const area = (typeof areaName==='function')?areaName(x.p.areaId):'';
      if(x.due.overdue > 0){ score += 2 + Math.min(3, x.due.overdue/7); reasons.push(`${x.due.overdue} day(s) overdue`); }
      else if(x.due.days <= 0){ score += 1.5; reasons.push('Due today'); }
      if(weights[area]){ score += Math.min(3, weights[area]); reasons.push(`Recorded next after ${pat.lastArea} on ${weights[area]} field day(s)`); }
      if(x.due.drivers && x.due.drivers.length) reasons.push(x.due.drivers[0]);
      if(already.has(x.p.id)) reasons.push('Already on today\'s plan');
      return { ...x, area, score:+score.toFixed(1), reasons, onPlan:already.has(x.p.id) };
    }).sort((a,b)=>b.score-a.score);
    return { list:ranked.filter(x=>x.score>0).slice(0,limit), basis:{ fieldDays:pat.days.length, stops:pat.totalStops,
      avgStops:pat.avgStops, lastArea:pat.lastArea }, patterns:pat };
  },

  week(user){
    const today = new Date();
    const dow = (today.getDay()+6)%7; /* 0 = Monday */
    const monday = new Date(today.getTime()-dow*86400000);
    const days = this.fieldDays(user);
    const due = this.due(user);
    const out = [];
    for(let i=0;i<7;i++){
      const dt = new Date(monday.getTime()+i*86400000);
      const iso = dt.toISOString().slice(0,10);
      const visited = days.filter(d=>d.date===iso);
      const visitedIds = new Set(visited.flatMap(d=>d.stops.map(s=>s.patientId)));
      const dueNow = due.filter(x=>{
        const dIso = new Date(x.due.due).toISOString().slice(0,10);
        return dIso <= iso;
      });
      const missed = dueNow.filter(x=>!visitedIds.has(x.p.id));
      out.push({ date:iso, weekday:dt.toLocaleDateString('en-GB',{weekday:'short'}), visited:visitedIds.size,
        stops:visited.reduce((n,d)=>n+d.stops.length,0), due:dueNow.length,
        missed: dt.getTime() <= today.getTime() ? missed.length : 0,
        entries: visited.map(d=>({...d, patients:d.stops.map(s=>s.code).join(', ')})) });
    }
    return out;
  },

  add(user, patientId, date){
    if(!(RBAC.has(user,'visit.create')||RBAC.has(user,'pdca.create')))
      return { ok:false, error:'Your role does not schedule field visits.' };
    const p = (DB.db.patients||[]).find(x=>x.id===patientId);
    if(!p) return { ok:false, error:'That patient is not in the register.' };
    if(!['active','extension','discharge_recommended'].includes(p.status))
      return { ok:false, error:`${p.code} is ${String(p.status).replace(/_/g,' ')}; the planner only proposes patients under active care.` };
    const at = String(date || todayISO()).slice(0,10);
    DB.db.calendarEvents = DB.db.calendarEvents||[];
    const dupe = DB.db.calendarEvents.find(e=>e.kind==='planned_visit' && e.patientId===patientId
      && String(e.at||'').slice(0,10)===at && e.visibleTo && e.visibleTo.includes(user.id));
    if(dupe) return { ok:false, error:'That patient is already on your plan for this day.' };
    const sug = this.suggest(user, 50).list.find(s=>s.p.id===patientId);
    DB.db.calendarEvents.push({ id:uid('ev'), at, kind:'planned_visit',
      title:`${p.code} · ${typeof areaName==='function'?areaName(p.areaId):''}`,
      detail:`Suggested by the visit-order learner${sug?': '+sug.reasons.join(' · '):''}`,
      countyId:p.countyId, visibleTo:[user.id], patientId:p.id, createdBy:user.id,
      createdAt:new Date().toISOString(), source:'visit-order-learner' });
    AUDIT.append({ actor:user.id, action:'visitplan.suggested_added', entity:'patient', entityId:p.id,
      detail:`Placed on the plan for ${at}${sug?` · ${sug.reasons.join('; ')}`:''}` });
    DB.save();
    return { ok:true, patient:p, at };
  }
};

function renderVisitPlanner(user){
  if(!(RBAC.has(user,'visit.create')||RBAC.has(user,'pdca.create'))) return deniedPanel('visit.create');
  /* The learner is only asked for a proposal once it has enough field days.
     Asking it earlier would produce a plausible-looking guess, and a guess
     dressed as a suggestion is exactly what this page must not do. */
  const patterns = PLAN6.patterns(user);
  const learned = patterns.days.length >= 3;
  const sug = learned ? PLAN6.suggest(user, 4) : { list:[], basis:{ fieldDays:patterns.days.length,
    stops:patterns.totalStops, avgStops:patterns.avgStops, lastArea:patterns.lastArea } };
  const { list, basis } = sug;
  const week = PLAN6.week(user);
  const today = String(todayISO()).slice(0,10);
  const doneToday = week.find(d=>d.date===today) || { visited:0, stops:0, missed:0 };

  return pageHead('Visit planner',
    'Built from the field days you have actually entered. The learner reads the order in which visits were recorded, learns how you move between service areas, and proposes the next patient; you decide.',
    `<button class="btn btn-sm btn-ghost" data-act="plan-open" data-view="schedule">${ic('route',15)} Weekly proposal</button>`)
  + `<div class="grid g4" style="margin-bottom:16px">
      ${kpi('Field days learned', num(basis.fieldDays), `Last ${PLAN6.LOOKBACK_DAYS} days`, learned?'ok':'','calendar')}
      ${kpi('Stops in that record', num(basis.stops), `${basis.avgStops} per field day`, '', 'route')}
      ${kpi('Seen today', num(doneToday.visited), `${doneToday.stops} visit(s) recorded`, doneToday.visited?'ok':'','check')}
      ${kpi('Due and not visited', num(doneToday.missed), 'Earlier this week', doneToday.missed?'warn':'ok','alert')}
    </div>`
  + (learned
      ? card('Suggested next', `<div class="ob-lead">${ic('sparkles',16)} Ranked from ${basis.fieldDays} field days. ${basis.lastArea?`Your last recorded area was <b>${esc(basis.lastArea)}</b>.`:'No area pattern recorded yet.'}</div>`
        + table([
          { label:'Patient', render:x=>`<div class="cellname">${esc(x.p.name)}<span class="sm">${esc(x.p.code)} · ${esc(x.area)}</span></div>` },
          { label:'Due', render:x=>x.due.overdue>0 ? badge(`${x.due.overdue} d overdue`,'b-crit',false) : badge(x.due.days<=0?'Due today':`In ${x.due.days} d`,'b-neutral',false) },
          { label:'Why this patient', render:x=>`<span class="xs">${x.reasons.map(esc).join(' · ')}</span>` },
          { label:'', render:x=>x.onPlan?`<span class="xs muted">On today's plan</span>`
              :`<button class="btn btn-xs btn-primary" data-act="plan-add" data-id="${x.p.id}">Add to today</button>` }
        ], list, { empty:emptyState('No proposal today','Everything in your scope is either not yet due or already seen today. Set a frequency or record a field day, and the learner has more to work with.','check') }))
      : card('Learning, not guessing', emptyState('Not enough field days yet',
          'The learner needs at least three entered field days before it will propose an order. Record visits as you walk them and the sequence becomes evidence.',
          'sparkles', `<button class="btn btn-sm btn-primary" data-act="plan-open" data-view="visits">${ic('plus',15)} Record a visit</button>`)))

  + card('This week', table([
      { label:'Day', render:d=>`<b>${esc(d.weekday)}</b> <span class="xs muted">${esc(d.date)}</span>` },
      { label:'Visited', cls:'num', render:d=>num(d.visited) },
      { label:'Visits', cls:'num', render:d=>num(d.stops) },
      { label:'Due by then', cls:'num', render:d=>num(d.due) },
      { label:'Missed', render:d=>d.missed? badge(`${d.missed} not visited`,'b-warn',false):'<span class="xs muted"> - </span>' },
      { label:'Recorded', render:d=>`<span class="xs muted">${esc(d.entries.map(e=>e.patients).join(' · ').slice(0,70) || ' - ')}</span>` }
    ], week, { compact:true }))

  + (patterns.transitions.length ? card('Learned movement between areas', table([
      { label:'From', render:t=>esc(t.from) },
      { label:'To', render:t=>esc(t.to) },
      { label:'Field days', cls:'num', render:t=>num(t.n) }
    ], patterns.transitions.slice(0,10), { compact:true })
    + `<div class="note" style="margin-top:10px">${ic('info',15)}<span>The sequence is inferred from the order in which visits were entered on each day.
      It is a convenience for planning, not a finding about any caregiver, and it never moves a patient or changes a record by itself.</span></div>`) : '');
}

/* ------------------------------------------------------------ actions */
Object.assign(ACTIONS, {
  'dq-tab': (d) => go('quality', { tab:d.tab, page:1 }),
  'dq-rule': (d) => go('quality', { tab:(APPX.params||{}).tab||'all', rule:d.rule, page:1 }),
  'dq-page': (d) => go('quality', { ...(APPX.params||{}), page:+d.p }),
  'dq-open': (d) => go('patient', { id:d.id }),
  'dq-export': () => { download(`data-quality-${todayISO()}.csv`, DQ6.csv(AUTH.user)); toast('Exported','The findings and the waiver register are in the file.','ok'); },
  'dq-waive-form': (d) => {
    const key = d.key;
    const issue = DQ6.open(AUTH.user).find(i=>i.key===key);
    if(!issue) return toast('Nothing to waive','That finding no longer exists.','warn');
    openModal({ title:'Waive a data-quality finding', narrow:true, body:`<form data-form="dq-waive">
        <div class="note">${ic('alert',15)}<span>${esc(issue.text)}</span></div>
        <div class="field"><label>Reason for accepting it</label>
          <textarea class="input" name="reason" rows="3" required minlength="12" placeholder="Why this is acceptable, and what will correct it"></textarea></div>
        <div class="field"><label>Waived for (days)</label>
          <input class="input" type="number" name="days" min="1" max="365" value="${DQ6.WAIVER_DAYS}"></div>
        <input type="hidden" name="key" value="${esc(key)}">
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" data-act="submit" data-form="dq-waive">Record waiver</button>` });
  },
  'dq-reopen': (d) => {
    const r = DQ6.reopen(AUTH.user, d.id);
    if(!r.ok) return toast('Not withdrawn', r.error, 'err');
    toast('Waiver withdrawn','The finding is back on the open list.','ok'); render();
  },
  'plan-open': (d) => go(d.view),
  'plan-add': (d) => {
    const r = PLAN6.add(AUTH.user, d.id);
    if(!r.ok) return toast('Not added', r.error, 'warn');
    toast('Added to today', `${r.patient.code} is on your plan for ${r.at}.`, 'ok'); render();
  }
});

Object.assign(FORMS, {
  'dq-waive': (d) => {
    const r = DQ6.waive(AUTH.user, String(d.get('key')), String(d.get('reason')), +(d.get('days')||DQ6.WAIVER_DAYS));
    if(!r.ok) return toast('Not waived', r.error, 'err');
    closeModal(); toast('Waived', `The finding is accepted until ${r.until}, with your reason recorded.`, 'ok'); render();
  }
});
