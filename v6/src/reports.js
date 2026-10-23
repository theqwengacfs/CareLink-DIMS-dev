/* ============================================================
   reports.js - Reporting engine
   Every figure is calculated from scoped data, carries a period,
   an indicator definition and an integrity block. Generated
   reports are versioned and archived; regeneration never
   overwrites an issued report.
   ============================================================ */

const PERIOD = {
  day:d=>{ const s=new Date(d); s.setHours(0,0,0,0); return {start:s,end:new Date(s.getTime()+DAY-1)}; },
  week:(d=new Date())=>{ /* ISO week ending Sunday, cut-off Monday 08:00 */
    const e=new Date(d); e.setHours(23,59,59,999);
    const s=new Date(e.getTime()-6*DAY); s.setHours(0,0,0,0);
    return {start:s,end:e,label:'7 days to '+fmtDate(e)};
  },
  month:(d=new Date())=>{ const s=new Date(d.getFullYear(),d.getMonth(),1); const e=new Date(d.getFullYear(),d.getMonth()+1,0,23,59,59);
    return {start:s,end:e,label:s.toLocaleDateString('en-GB',{month:'long',year:'numeric'})}; },
  quarter:(d=new Date())=>{ const q=Math.floor(d.getMonth()/3); const s=new Date(d.getFullYear(),q*3,1); const e=new Date(d.getFullYear(),q*3+3,0,23,59,59);
    return {start:s,end:e,label:'Q'+(q+1)+' '+d.getFullYear()}; },
  year:(d=new Date())=>({ start:new Date(d.getFullYear(),0,1), end:new Date(d.getFullYear(),11,31,23,59,59), label:String(d.getFullYear()) }),
  h1:(d=new Date())=>({ start:new Date(d.getFullYear(),0,1), end:new Date(d.getFullYear(),5,30,23,59,59), label:'Jan-Jun '+d.getFullYear() })
};

function inRange(v, r){ if(!v) return false; const d=new Date(v); return d>=r.start && d<=r.end; }

function nextMonday0800(from=new Date()){
  const d=new Date(from); d.setHours(8,0,0,0);
  const dow=d.getDay(); // 0 Sun, 1 Mon
  let add=(1-dow+7)%7; if(add===0 && from>=d) add=7; if(add===0 && from<d) add=0;
  if(add===0) return d;
  const r=new Date(d.getTime()+add*DAY); return r;
}

const REPORTS = {
  /* ---------- A. Patient-Days ---------- */
  patientDays(user, f={}){
    const ps = repo.patientList(user, f).filter(p=>['active','extension','discharge_recommended','discharged'].includes(p.status) || !p.status);
    const cutoff = f.cutoff? new Date(f.cutoff): new Date();
    const rows = ps.map(p=>{
      const days = Math.max(0, daysBetween(p.intake||p.created||cutoff, p.status==='discharged'&&p.discharge? p.discharge: cutoff));
      const lastVisit = DB.db.visits.filter(v=>v.patientId===p.id).sort((a,b)=>new Date(b.date)-new Date(a.date))[0];
      const openPdca = DB.db.pdcas.filter(x=>x.patientId===p.id && x.status==='open').length;
      const milestone = days>=180?180: days>=120?120: days>=100?100: days>=60?60:0;
      return { p, days, milestone, lastVisit, openPdca,
        readiness: days>=180?'Overdue review - discharge evaluation required'
          : days>=120?'Extension review required'
          : days>=100?'Approaching 120-day review'
          : days>=60?'Standard mid-point review':'Within plan',
        owner: p.caregiverId };
    }).sort((a,b)=>b.days-a.days);
    const buckets = { m60:rows.filter(r=>r.days>=60).length, m100:rows.filter(r=>r.days>=100).length,
                      m120:rows.filter(r=>r.days>=120).length, m180:rows.filter(r=>r.days>=180).length };
    if(f.milestone) return {...{rows:rows.filter(r=>r.days>=+f.milestone), buckets}, period:{start:cutoff,end:cutoff}};
    return { rows, buckets, cutoff, period:{start:cutoff, end:cutoff} };
  },

  /* ---------- B/C/D. Patient Figures ---------- */
  patientFigures(user, f={}){
    const countyId = (f.countyId && f.countyId!=='all') ? f.countyId : ((roleObj(user.roleId)?.scope?.geo==='global'||roleObj(user.roleId)?.scope?.crossCounty)? null : user.countyId);
    const period = f.period || PERIOD.week(new Date());
    const cutoff = period.end;
    const all = repo.patientList(user, {countyId: countyId||undefined});
    const idset = new Set(all.map(p=>p.id));
    const activeAt = d => all.filter(p=>{
      if(['rejected','returned','digital_entered','awaiting_verification','approved_enrolment','form_submitted','assessment_initiated','discharge_recommended'].includes(p.status) && !p.enrolDate) return false;
      const intake = new Date(p.intake||p.enrolDate||p.created||0);
      if(intake>d) return false;
      if(p.status==='discharged' && p.discharge && new Date(p.discharge)<=d) return false;
      return ['active','extension','discharge_recommended','discharged'].includes(p.status);
    });

    const active = activeAt(cutoff);
    const opening = activeAt(period.start);
    const enrolledPeriod = all.filter(p=>inRange(p.enrolDate||p.verifiedAt, period) || (inRange(p.intake,period)&&['active','extension','discharge_recommended','discharged'].includes(p.status)));
    const dischargedPeriod = all.filter(p=>p.status==='discharged' && inRange(p.discharge, period));
    const newAssessed = all.filter(p=>inRange(p.intake, period));
    const approved = all.filter(p=>inRange(p.verifiedAt, period));
    const weekA = new Date(cutoff.getTime()-7*DAY);
    const dischargedWeek = all.filter(p=>p.status==='discharged' && p.discharge && new Date(p.discharge)>=weekA && new Date(p.discharge)<=cutoff);
    const monthP = PERIOD.month(cutoff);
    const dischargedMonth = all.filter(p=>p.status==='discharged' && inRange(p.discharge, monthP));
    const notFound = DB.db.visits.filter(v=>idset.has(v.patientId) && v.outcome==='not_found' && inRange(v.date, period));
    const openConcerns = DB.db.concerns.filter(c=>idset.has(c.patientId)&&c.status==='open');
    const overdue = all.filter(p=>{
      const lv = DB.db.visits.filter(v=>v.patientId===p.id).sort((a,b)=>new Date(b.date)-new Date(a.date))[0];
      return ['active','extension'].includes(p.status) && (!lv || daysBetween(lv.date,cutoff)>21);
    });
    const followup = new Set([...openConcerns.map(c=>c.patientId), ...overdue.map(p=>p.id)]);
    const support = {};
    SUPPORT_ITEMS.forEach(i=>support[i]=0);
    DB.db.supportIssues.filter(s=>idset.has(s.patientId)&&inRange(s.date,period)).forEach(s=>{ support[s.item]=(support[s.item]||0)+1; });
    const hosp = DB.db.requests.filter(r=>idset.has(r.patientId)&&(!countyId||r.countyId===countyId));
    const orphans = [...new Set(active.map(p=>p.id))].reduce((n,id)=>n+(DB.db.patients.find(p=>p.id===id).household?.orphansSupported||0),0);

    const areas = countyId
      ? (COUNTIES.find(c=>c.id===countyId)?.areas)||[]
      : COUNTIES.flatMap(c=>c.areas.map(a=>({...a,countyId:c.id})));
    const byArea = areas.map(a=>{
      const ps = all.filter(p=>p.areaId===a.id);
      const act = active.filter(p=>p.areaId===a.id);
      return { area:a, active:act.length, newEnrol:ps.filter(p=>inRange(p.intake,period)).length,
        discharged:ps.filter(p=>p.status==='discharged'&&inRange(p.discharge,period)).length,
        followup:[...followup].filter(id=>ps.some(p=>p.id===id)).length,
        requests:DB.db.requests.filter(r=>r.areaId===a.id).length };
    });

    const closingCalc = opening.length + enrolledPeriod.length - dischargedPeriod.length;

    return {
      countyId, period, cutoff, active, opening, enrolledPeriod, dischargedPeriod, newAssessed, approved,
      dischargedWeek, dischargedMonth, notFound, followup:[...followup], overdue, openConcerns,
      support, hosp, orphans, byArea, closingCalc,
      indicators: INDICATORS
    };
  },

  /* ---------- E. Targets ---------- */
  targetsFor(countyId, indicator, periodKey){
    const rows = DB.db.targets.filter(t=>t.countyId===countyId && t.indicator===indicator && (t.period===periodKey||t.period==='2026-H1'));
    const latest = rows.sort((a,b)=>b.version-a.version||new Date(b.setAt)-new Date(a.setAt));
    return latest[0]||null;
  },

  /* ---------- F. Expenditure ---------- */
  expenditure(user, f={}){
    const role = roleObj(user.roleId)||{scope:{}};
    const countyId = f.countyId && f.countyId!=='all' ? f.countyId
      : ((role.scope||{}).geo==='global'||(role.scope||{}).crossCounty ? null : user.countyId);
    const period = f.period || PERIOD.month(new Date());
    const tx = repo.transactions(user).filter(t=>inRange(t.date,period) && (!countyId||t.countyId===countyId));
    const budgets = repo.budget(user, countyId||undefined);

    const rows = BUDGET_CATEGORIES.map(cat=>{
      const budget = budgets.filter(b=>b.line===cat.id).reduce((n,b)=>n+b.amount,0);
      const cTx = tx.filter(t=>t.budgetLine===cat.id);
      const paid = cTx.filter(t=>['paid','reconciled'].includes(t.status)).reduce((n,t)=>n+t.amount,0);
      const reconciled = cTx.filter(t=>t.status==='reconciled').reduce((n,t)=>n+t.amount,0);
      const committed = cTx.filter(t=>t.status==='committed').reduce((n,t)=>n+t.amount,0);
      const missingReceipt = cTx.filter(t=>!t.receipt).length;
      return { cat, budget, paid, reconciled, committed, remaining: budget-paid-committed,
        usedPct: budget? Math.round(((paid+committed)/budget)*100):0,
        count: cTx.length, missingReceipt };
    });
    const tot = rows.reduce((a,r)=>({budget:a.budget+r.budget,paid:a.paid+r.paid,reconciled:a.reconciled+r.reconciled,
      committed:a.committed+r.committed,remaining:a.remaining+r.remaining}),{budget:0,paid:0,reconciled:0,committed:0,remaining:0});
    const daysElapsed = Math.max(1,new Date().getDate());
    const daysInMonth = new Date(period.end.getFullYear(), period.end.getMonth()+1,0).getDate();
    const projected = Math.round((tot.paid+tot.committed)/daysElapsed*daysInMonth);
    const flags = [];
    tx.forEach(t=>{
      if(!t.receipt) flags.push({level:'warn', text:`Missing receipt - ${t.no} (${money(t.amount)}, ${t.payee})`});
      if(!t.requestId && t.status!=='reconciled') flags.push({level:'info', text:`Payment without linked hospital request - ${t.no}`});
      if(t.amount>20000) flags.push({level:'crit', text:`Amount above routine limit - ${t.no}: ${money(t.amount)}`});
    });
    const refs={}; tx.forEach(t=>{ if(t.ref){ (refs[t.ref]=refs[t.ref]||[]).push(t.no); } });
    Object.entries(refs).forEach(([ref,nos])=>{ if(nos.length>1) flags.push({level:'crit', text:`Duplicate transaction reference ${ref} used by ${nos.join(', ')}`}); });

    return { countyId, period, rows, tot, projected, flags, tx, daysElapsed, daysInMonth };
  },

  /* ---------- G. Master Referral Document ---------- */
  masterReferral(user, f={}){
    if(!RBAC.can(user,'report.referral').ok) return null;
    const all = repo.patientList(user, {countyId: f.countyId&&f.countyId!=='all'? f.countyId: undefined});
    const rows = all.filter(p=>p.referralEntityId).map(p=>{
      const e = DB.db.referralEntities.find(x=>x.id===p.referralEntityId)||{name:'Unregistered', status:'pending', type:'-'};
      return { p, entity:e, recognised: e.status==='verified' };
    });
    const entities = DB.db.referralEntities.map(e=>({ e, count: rows.filter(r=>r.entity.id===e.id).length }));
    return { rows, entities, unverified: rows.filter(r=>!r.recognised) };
  },

  /* ---------- H. Data quality ---------- */
  dataQuality(user){
    const ps = repo.patientList(user);
    const issues = [];
    const seen = {};
    ps.forEach(p=>{
      if(!p.phone) issues.push({level:'warn', text:`${p.code} - no contact number`});
      if(!p.intake) issues.push({level:'crit', text:`${p.code} - missing intake date`});
      if(p.intake && p.discharge && new Date(p.discharge)<new Date(p.intake)) issues.push({level:'crit', text:`${p.code} - discharge precedes intake`});
      if(!p.docsVerified) issues.push({level:'info', text:`${p.code} - source documents not yet verified`});
      if(p.ccc){ if(seen[p.ccc]) issues.push({level:'crit', text:`Duplicate CCC number ${p.ccc} - ${seen[p.ccc]} and ${p.code}`}); else seen[p.ccc]=p.code; }
    });
    DB.db.requests.filter(r=>ps.some(p=>p.id===r.patientId))
      .forEach(r=>{ if(['completed','reconciled'].includes(r.status) && !r.clinicalReport) issues.push({level:'warn', text:`${r.no} - service recorded without clinical report`}); });
    /* Financial findings are only produced for roles that may see financial records,
       and only for the county they are entitled to inspect. */
    if(RBAC.has(user,'finance.view')||RBAC.has(user,'audit.view')){
      const role=roleObj(user.roleId)||{scope:{}}; const global=(role.scope||{}).geo==='global'||(role.scope||{}).crossCounty;
      DB.db.transactions.filter(t=>global||t.countyId===user.countyId)
        .forEach(t=>{ if(!t.receipt) issues.push({level:'warn', text:`${t.no} - receipt missing`}); });
    }
    return issues;
  },

  /* ---------- Executive ---------- */
  executive(user){
    const counties = COUNTIES.map(c=>{
      const st = { county:c, patients:0, active:0, discharged:0, requests:0, spend:0, budget:0 };
      try{
        const ps = repo.patientList(user,{countyId:c.id});
        st.patients=ps.length; st.active=ps.filter(p=>['active','extension'].includes(p.status)).length;
        st.discharged=ps.filter(p=>p.status==='discharged').length;
        st.requests=DB.db.requests.filter(r=>r.countyId===c.id).length;
        if(RBAC.has(user,'finance.view')){ st.spend = DB.db.transactions.filter(t=>t.countyId===c.id&&['paid','reconciled'].includes(t.status)).reduce((n,t)=>n+t.amount,0); }
        st.budget = DB.db.budgets.filter(b=>b.countyId===c.id).reduce((n,b)=>n+b.amount,0);
      }catch(e){}
      return st;
    });
    return { counties, quality:this.dataQuality(user) };
  },

  /* ---------- Monday scheduler ---------- */
  mondayStatus(){
    const s = DB.db.settings.mondayReport;
    const last = s.lastRun? new Date(s.lastRun):null;
    return { enabled:s.enabled, lastRun:last, nextRun:nextMonday0800(new Date()), label:'Monday 08:00 EAT' };
  },
  mondayTick(){
    const s = DB.db.settings.mondayReport;
    if(!s.enabled) return null;
    const now = new Date();
    const lastMon0800 = (()=>{ const d=new Date(now); d.setHours(8,0,0,0); const dow=d.getDay();
      const back=(dow+6)%7; /* days since Monday */ d.setDate(d.getDate()-back); return d; })();
    const last = s.lastRun? new Date(s.lastRun):null;
    if(now>=lastMon0800 && (!last || last<lastMon0800)){
      const run=[];
      COUNTIES.forEach(c=>{
        ['patient_figures','patient_days','expenditure'].forEach(t=>{
          run.push(this.generate(t,{countyId:c.id,scheduled:true},{id:'system',name:'Scheduled automation',roleId:'chief'}));
        });
      });
      s.lastRun = todayISO();
      AUDIT.append({actor:'system',action:'report.scheduled',entity:'report',entityId:'monday',detail:`Monday 08:00 EAT report set generated (${run.length} reports)`});
      DB.save();
      return run;
    }
    return null;
  },

  /* ---------- Generation & archive ---------- */
  generate(type, params, user){
    const existing = DB.db.reports.filter(r=>r.type===type && r.periodKey===periodKeyFor(type,params) && r.countyId===(params.countyId||'all'));
    const version = existing.length+1;
    const rec = {
      id:uid('r'), type, title:REPORT_TITLES[type]||titleCase(type),
      countyId: params.countyId||'all', periodKey: periodKeyFor(type,params),
      params, generatedAt: todayISO(), generatedBy: user.id, generatedByName: user.name||'Scheduled automation',
      version, scheduled: !!params.scheduled, classification:'Internal organisational', checksum:null
    };
    rec.checksum = fnv1a(rec.id+rec.type+rec.periodKey+rec.generatedAt+version);
    DB.db.reports.unshift(rec);
    if(!params.scheduled) AUDIT.append({actor:user.id,action:'report.generated',entity:'report',entityId:rec.id,
      detail:`${rec.title} · ${rec.periodKey} · v${version}`});
    DB.save();
    return rec;
  },
  archive(user, filter={}){
    const capByType = {
      patient_figures:['report.patient_figures'], patient_days:['report.patient_days'],
      expenditure:['report.expenditure'], referral:['report.referral'],
      executive:['report.executive'], quality:['audit.view'],
      home_visits:['patient.list'], hospital_ops:['hosp.request.review','hosp.visit.record','hosp.receipt.review'],
      donor:['report.patient_figures','report.executive'],
      condition_summary:['condition.aggregate','condition.sensitive']
    };
    let rows = DB.db.reports.filter(r=>{
      const need = capByType[r.type]||['report.departmental'];
      return need.some(c=>RBAC.has(user,c));
    });
    const role=roleObj(user.roleId)||{scope:{}};
    if((role.scope||{}).geo!=='global'&&!(role.scope||{}).crossCounty) rows=rows.filter(r=>r.countyId==='all'||r.countyId===user.countyId);
    if(filter.type) rows=rows.filter(r=>r.type===filter.type);
    return rows;
  }
};

const REPORT_TITLES = {
  patient_days:'Patient-Days Report',
  patient_figures:'Patient Figures Report',
  expenditure:'Weekly / Monthly Expenditure Report',
  referral:'Master Referral Document',
  executive:'Executive Performance Summary',
  quality:'Data Quality & Integrity Report',
  home_visits:'Home Visit Report',
  hospital_ops:'Hospital Operations Report',
  donor:'Donor Programme Summary',
  condition_summary:'Condition Summary'
};

function periodKeyFor(type, p){
  if(type==='patient_figures'||type==='patient_days') return new Date().toISOString().slice(0,7);
  if(type==='expenditure') return new Date().toISOString().slice(0,7);
  if(type==='referral') return 'registry-'+new Date().toISOString().slice(0,7);
  return new Date().toISOString().slice(0,7);
}

/* ---------------- CSV / download ---------------- */
function download(filename, content, mime='text/csv;charset=utf-8'){
  try{
    const blob = new Blob([content],{type:mime});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
    return true;
  }catch(e){ toast('Download blocked','The preview sandbox prevented the download. Open the file in a browser tab instead.','err'); return false; }
}
function toCSV(rows, cols){
  const head = cols.map(c=>`"${c.label}"`).join(',');
  const body = rows.map(r=>cols.map(c=>{ const v=typeof c.get==='function'?c.get(r):r[c.key];
    return `"${String(v??'').replace(/"/g,'""')}"`; }).join(',')).join('\n');
  return '\uFEFF'+head+'\n'+body;
}
