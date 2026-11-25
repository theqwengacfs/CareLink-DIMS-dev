/* ============================================================
   reports.js - Reporting engine
   Every figure is calculated from scoped data, carries a period,
   an indicator definition and an integrity block. Generated
   reports are versioned and archived; regeneration never
   overwrites an issued report.
   ============================================================ */

const PERIOD = {
  day:d=>{ const s=new Date(d); s.setHours(0,0,0,0); return {start:s,end:new Date(s.getTime()+DAY-1)}; },
  week:(d=new Date())=>{ /* Rolling period retained for existing non-planning reports. */
    const e=new Date(d); e.setHours(23,59,59,999);
    const s=new Date(e.getTime()-6*DAY); s.setHours(0,0,0,0);
    return {start:s,end:e,label:'7 days to '+fmtDate(e)};
  },
  workWeek:(d=new Date())=>{
    const civil=CARE_RULES.programDate(d);
    if(!civil) throw new Error('A valid planning date is required.');
    const dow=new Date(civil+'T00:00:00Z').getUTCDay();
    const monday=CARE_RULES.addDays(civil,-((dow+6)%7));
    const friday=CARE_RULES.addDays(monday,4);
    const fmt=s=>new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',day:'numeric',month:'short',year:'numeric'}).format(new Date(s+'T00:00:00Z'));
    // Provisional convention, chosen to match the supplied November 2026
    // example: week 1 starts one Monday before the week containing January 1.
    // All extra segments are labelled week 52 with their own dates. Archive
    // keys remain the existing unique ISO keys, never rewritten retroactively.
    const firstMonday=y=>{const jan=`${y}-01-01`;const dow=new Date(jan+'T00:00:00Z').getUTCDay();return CARE_RULES.addDays(jan,-7-((dow+6)%7));};
    let year=Number(monday.slice(0,4));
    if(monday>=firstMonday(year+1))year++;else if(monday<firstMonday(year))year--;
    const ordinal=1+Math.round((Date.parse(monday+'T00:00:00Z')-Date.parse(firstMonday(year)+'T00:00:00Z'))/(7*86400000));
    const week=Math.min(52,ordinal), extra=ordinal>52;
    return {start:new Date(monday+'T00:00:00+03:00'),end:new Date(friday+'T23:59:59.999+03:00'),
      civilStart:monday,civilEnd:friday,planningYear:year,planningWeek:week,extraSegment:extra,
      label:`Week ${week} of ${year} (provisional)${extra?' · additional week 52 segment':''} · Monday ${fmt(monday)} – Friday ${fmt(friday)} · Africa/Nairobi`};
  },
  lastCompletedWorkWeek:(d=new Date())=>{
    const civil=CARE_RULES.programDate(d);
    if(!civil) throw new Error('A valid planning date is required.');
    const day=new Date(civil+'T00:00:00Z').getUTCDay();
    return PERIOD.workWeek(day>=1 && day<=5 ? CARE_RULES.addDays(civil,-7) : civil);
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
    const cutoffDay=CARE_RULES.programDate(cutoff);
    const rows = ps.map(p=>{
      const days = CARE_RULES.days(p,cutoff.toISOString());
      const lastVisit = DB.visitsFor(p.id).find(v=>CARE_RULES.programDate(v.date)&&CARE_RULES.programDate(v.date)<=cutoffDay&&CARE_RULES.recordCycle(v,p,DB.db)===CARE_RULES.cycleId(p));
      const openPdca = CARE_RULES.openReviewCount(p,DB.db);
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
    // Count support-cycle events, not the latest mutable patient status. A
    // repeat enrollment must not erase last year's discharge / caseload or
    // count a paper verification as a separate office enrollment.
    const recordedCycles=new Map();
    for(const c of DB.db.careCycles||[]){if(!recordedCycles.has(c.patientId))recordedCycles.set(c.patientId,[]);recordedCycles.get(c.patientId).push(c);}
    const cycles=all.flatMap(p=>{
      const rows=[...(recordedCycles.get(p.id)||[])];
      if(CARE_RULES.supported(p)&&CARE_RULES.cycleStart(p)&&!rows.some(c=>c.id===CARE_RULES.cycleId(p)))rows.push({id:CARE_RULES.cycleId(p),startedAt:CARE_RULES.cycleStart(p),dischargedAt:p.dischargedAt||p.discharge||'',legacy:true});
      return rows.filter(c=>CARE_RULES.programDate(c.startedAt)).map(c=>({...p,
        household:c.snapshot?.household||p.household,master:c.snapshot?.master||p.master,
        careCycleId:c.id,cycleStartedAt:CARE_RULES.programDate(c.startedAt),enrolDate:CARE_RULES.programDate(c.startedAt),
        discharge:CARE_RULES.programDate(c.dischargedAt),cohortSource:c}));
    });
    const dayIn=(value,range)=>{const d=CARE_RULES.programDate(value);return !!d&&d>=CARE_RULES.programDate(range.start)&&d<=CARE_RULES.programDate(range.end);};
    const activeAt = d => {const day=CARE_RULES.programDate(d);return cycles.filter(p=>p.cycleStartedAt<=day&&(!p.discharge||p.discharge>day));};
    const active = activeAt(cutoff);
    const opening = activeAt(CARE_RULES.addDays(CARE_RULES.programDate(period.start),-1));
    const enrolledPeriod = cycles.filter(p=>dayIn(p.enrolDate,period));
    const dischargedPeriod = cycles.filter(p=>dayIn(p.discharge,period));
    const firstCycles=new Map(),patientsById=new Map(all.map(p=>[p.id,p]));
    for(const c of cycles)if(!firstCycles.has(c.id)||c.cycleStartedAt<firstCycles.get(c.id).cycleStartedAt)firstCycles.set(c.id,c);
    const newAssessed = all.filter(p=>{
      const first=firstCycles.get(p.id);
      return dayIn(first?.cohortSource.snapshot?.assessmentDate||first?.cycleStartedAt||p.assessmentDate||p.intake,period);
    }).concat((DB.db.careReferrals||[]).filter(r=>idset.has(r.patientId)&&dayIn(r.evaluatedAt,period)).map(r=>({...patientsById.get(r.patientId),assessmentId:r.id,assessmentDate:r.evaluatedAt})));
    const approved = all.filter(p=>dayIn(p.verifiedAt, period));
    const weekA = new Date(cutoff.getTime()-7*DAY);
    const dischargedWeek = cycles.filter(p=>dayIn(p.discharge,{start:weekA,end:cutoff}));
    const monthP = PERIOD.month(cutoff);
    const dischargedMonth = cycles.filter(p=>dayIn(p.discharge,monthP));
    const notFound = DB.db.visits.filter(v=>idset.has(v.patientId) && v.outcome==='not_found' && inRange(v.date, period));
    const openConcerns = DB.db.concerns.filter(c=>idset.has(c.patientId)&&c.status==='open');
    const cutoffDay=CARE_RULES.programDate(cutoff);
    const overdue = active.filter(p=>{
      const lv = DB.visitsFor(p.id).find(v=>CARE_RULES.programDate(v.date)&&CARE_RULES.programDate(v.date)<=cutoffDay&&CARE_RULES.recordCycle(v,p,DB.db)===CARE_RULES.cycleId(p));
      return !lv || daysBetween(lv.date,cutoff)>21;
    });
    const followup = new Set([...openConcerns.map(c=>c.patientId), ...overdue.map(p=>p.id)]);
    const support = {};
    SUPPORT_ITEMS.forEach(i=>support[i]=0);
    DB.db.supportIssues.filter(s=>idset.has(s.patientId)&&inRange(s.date,period)).forEach(s=>{ support[s.item]=(support[s.item]||0)+1; });
    const hosp = DB.db.requests.filter(r=>idset.has(r.patientId)&&(!countyId||r.countyId===countyId));
    const orphans = [...new Map(active.map(p=>[p.id,p])).values()].reduce((n,p)=>n+(Number(p.household?.orphansSupported)||0),0);

    const areas = countyId
      ? (COUNTIES.find(c=>c.id===countyId)?.areas)||[]
      : COUNTIES.flatMap(c=>c.areas.map(a=>({...a,countyId:c.id})));
    const byArea = areas.map(a=>{
      const ps = all.filter(p=>p.areaId===a.id);
      const act = active.filter(p=>p.areaId===a.id);
      return { area:a, active:act.length, newEnrol:enrolledPeriod.filter(p=>p.areaId===a.id).length,
        discharged:dischargedPeriod.filter(p=>p.areaId===a.id).length,
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

  /* ---------- G2. Weekly planning indicators ----------
     The CareLink Usage Trial Report (§7) asks for one weekly page a Monday
     planning meeting can read: patients in programme, discharges, children
     rescued, the deceased, orphaned children, food bags by type and by bag
     number, recorded decisions, patients not found at home, inpatient and
     outpatient activity, mattress/blanket/Bible/hygiene/net issues, and the
     weights taken, so the three-weekly weighing schedule can be overseen.

     Two rules govern the page. Every figure is counted from a record that
     exists - nothing is estimated from a pattern. And where the register cannot
     answer a question, the page says so instead of inventing a split: a
     household whose decision was never recorded is reported as *not recorded*,
     and the couple bag is shown as unreadable because the workbook issues Bag 1
     to normal and couple households alike. */
  weeklyIndicators(user, f={}){
    const period = f.period || (f.date ? PERIOD.workWeek(f.date) : PERIOD.lastCompletedWorkWeek());
    const within = value => {
      if(!period.civilStart || !period.civilEnd) return inRange(value,period);
      const day=CARE_RULES.programDate(value);
      return !!day && day>=period.civilStart && day<=period.civilEnd;
    };
    const role = roleObj(user.roleId) || { scope:{} };
    const scope = role.scope || {};
    const global = scope.geo === 'global' || !!scope.crossCounty;
    const countyId = global ? (f.countyId && f.countyId !== 'all' ? f.countyId : null)
                            : (f.countyId && f.countyId !== 'all' ? f.countyId : (user.countyId || null));
    const all = repo.patientList(user, { countyId: countyId || undefined });
    const idset = new Set(all.map(p=>p.id));
    const visitIn = v => v && within(v.date);

    const inProgrammeStatus = ['active','extension','discharge_recommended'];
    const inProgramme = all.filter(p=>inProgrammeStatus.includes(p.status));
    const dischargedInPeriod = all.filter(p=>p.status==='discharged' && within(p.discharge||p.dischargedAt));
    const deceased = all.filter(p=>p.status==='deceased' || (p.master && p.master.deceasedMonth));

    /* Children kept out of an orphanage while their parent stays in care, and
       the children who were orphaned. Both are read from the household record;
       a blank cell counts as zero and is never filled in by assumption. */
    const caring = [...inProgramme, ...dischargedInPeriod];
    const childrenRescued = caring.reduce((n,p)=>n + Number(((p.master||{}).orphansPrevented) || ((p.household||{}).orphansPrevented) || 0), 0);
    const becameOrphans = caring.reduce((n,p)=>n + Number(((p.master||{}).becameOrphans)||0), 0);
    const orphanedChildren = caring.reduce((n,p)=>n + Number((p.household||{}).orphansSupported || 0), 0);

    /* ---- visits in the period ---- */
    const visitsInPeriod = (DB.db.visits||[]).filter(v=>idset.has(v.patientId) && visitIn(v));
    const weightsTaken = visitsInPeriod.filter(v=>Number(v.weight)>0).length;
    const notFoundAtHome = visitsInPeriod.filter(v=>v.outcome==='not_found').length;
    const visitsSeen = visitsInPeriod.filter(v=>v.outcome==='seen').length;

    /* ---- food bags ----
       Counted from the weekly grid's own three codes on the visits that happened
       in this period. The workbook issues Bag 1 (BG1) to both normal and couple
       households and Bag 2 (BG2) to family households, so a four-way split
       cannot honestly be read off the register; the page reports the three real
       codes and says why. */
    const byCode = { BG1:0, BG2:0, SPB:0 };
    visitsInPeriod.forEach(v=>{ if(v.foodBag && byCode[v.foodBag]!==undefined) byCode[v.foodBag]++; });
    const supportToday = { Foodbag:0, Bible:0, 'Mosquito net':0, Mattress:0, Blanket:0, 'Special bag':0, 'Hygiene kit':0 };
    (DB.db.supportIssues||[]).filter(s=>idset.has(s.patientId) && within(s.date))
      .forEach(s=>{ if(supportToday[s.item]!==undefined) supportToday[s.item]++; });
    const assignedInRegister = all.reduce((n,p)=>{ const b=(p.master||{}).bags||{}; return n + Number(b.BG1||0)+Number(b.BG2||0)+Number(b.SPB||0); }, 0);
    const foodBags = {
      byType: { normal: byCode.BG1, family: byCode.BG2, couple: null, special: byCode.SPB },
      byBag1: byCode.BG1, byBag2: byCode.BG2, special: byCode.SPB,
      total: byCode.BG1 + byCode.BG2,
      hygienePacks: supportToday['Hygiene kit'],
      assignedInRegister,
      coupleNote: 'Bag 1 is issued to normal and couple households alike, so the register cannot split the two; both are counted under Bag 1 rather than guessed.',
      source: 'Weekly grid bag codes (BG1, BG2, SPB) on visit records in this period'
    };

    /* ---- recorded decisions ----
       A decision is a record a person wrote. Only the ministry and leadership
       roles that hold patient.ministry.view may read the count; everyone else
       is told the field is restricted and given the number of records that are
       still blank, which is the audit figure they can act on. */
    const maySeeFaith = RBAC.has(user,'patient.ministry.view');
    const recordedFaith = inProgramme.filter(p=>String(p.faithRecord||'').toLowerCase()==='reported').length;
    const faithNotRecorded = inProgramme.length - recordedFaith;

    /* ---- hospital activity in the period ---- */
    const hosp = (DB.db.requests||[]).filter(r=>idset.has(r.patientId) && (!countyId || r.countyId===countyId));
    const hospInPeriod = hosp.filter(r=>within(r.submittedAt||r.createdAt) || within(r.serviceCompletedAt));
    const inpatient = hospInPeriod.filter(r=>r.status==='admitted' || /inpatient|admit/i.test(String(r.serviceType||r.admissionType||''))).length;
    const outpatient = hospInPeriod.filter(r=>r.status!=='admitted' && (r.serviceCompletedAt || r.clinicalReport)).length;

    /* ---- ministry areas, split into villages and slums ----
       The classification is the register's own `cls` attribute on each area
       (urban is the slum-based category); an area's category can be changed in
       Org Config without touching a report. */
    const scopedAreaIds = (scope.geo === 'areas' && Array.isArray(user.areaIds) && user.areaIds.length)
      ? new Set(user.areaIds) : null;
    let areas = countyId ? ((COUNTIES.find(c=>c.id===countyId)||{}).areas||[])
      : COUNTIES.flatMap(c=>c.areas.map(a=>({...a, countyId:c.id})));
    if(scopedAreaIds) areas = areas.filter(a=>scopedAreaIds.has(a.id));
    const byArea = areas.map(a=>{
      const ps = all.filter(p=>p.areaId===a.id);
      const act = inProgramme.filter(p=>p.areaId===a.id);
      const vs = visitsInPeriod.filter(v=>v.areaId===a.id);
      return { area:a, countyId:a.countyId || countyId, kind: a.cls==='urban' ? 'slum' : 'village',
        patients: ps.length, inProgramme: act.length,
        discharged: ps.filter(p=>p.status==='discharged' && within(p.discharge||p.dischargedAt)).length,
        visits: vs.length, notFound: vs.filter(v=>v.outcome==='not_found').length,
        weights: vs.filter(v=>Number(v.weight)>0).length };
    });
    const byKind = { village:{ label:'Village-based', total:0, areas:0 }, slum:{ label:'Slum-based (urban)', total:0, areas:0 } };
    byArea.forEach(a=>{ byKind[a.kind].total += a.patients; byKind[a.kind].areas++; });

    return {
      period, countyId,
      scope:{ countyId: countyId || 'all', areas: byArea.length, global },
      basis: 'Counted from verified and published register records only; no figure is estimated, and a field the register does not hold is reported as not recorded.',
      inProgramme: inProgramme.length,
      dischargedInPeriod: dischargedInPeriod.length,
      childrenRescued, becameOrphans, orphanedChildren,
      deceased: deceased.length,
      foodBags,
      savedInChrist: maySeeFaith ? recordedFaith : null,
      faithNotRecorded,
      faithRestricted: !maySeeFaith,
      notFoundAtHome, visitsSeen, visitsRecorded: visitsInPeriod.length,
      inpatient, outpatient, hospitalRequests: hospInPeriod.length,
      mattresses: supportToday['Mattress'], blankets: supportToday['Blanket'],
      bibles: supportToday['Bible'], hygienePackages: supportToday['Hygiene kit'],
      mosquitoNets: supportToday['Mosquito net'],
      foodbags: supportToday['Foodbag'], specialBags: supportToday['Special bag'],
      weightsTaken,
      byArea, byKind
    };
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
      if(p.docsVerified!==true) issues.push({level:'info', text:`${p.code} - no recorded source-document verification attestation`});
      if(p.ccc){ if(seen[p.ccc]) issues.push({level:'crit', text:`Duplicate CCC number ${p.ccc} - ${seen[p.ccc]} and ${p.code}`}); else seen[p.ccc]=p.code; }
    });
    DB.db.requests.filter(r=>ps.some(p=>p.id===r.patientId))
      .forEach(r=>{ if(['completed','reconciled'].includes(r.status) && !r.clinicalReport) issues.push({level:'warn', text:`${r.no} - service recorded without clinical report`}); });
    /* Financial findings are only produced for roles that may see financial records,
       and only for the county they are entitled to inspect. */
    if(RBAC.has(user,'finance.view')||RBAC.has(user,'audit.view')){
      const role=roleObj(user.roleId)||{scope:{}}; const global=(role.scope||{}).geo==='global'||(role.scope||{}).crossCounty;
      DB.db.transactions.filter(t=>global||t.countyId===user.countyId)
        .forEach(t=>{ if(t.receipt!==true) issues.push({level:'warn', text:`${t.no||t.id} - no recorded receipt attestation; evidence requires independent review`}); });
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
    // A hosted browser is an admitted user's scoped client, not a global
    // service account or scheduler. It may not fabricate a Chief/system run
    // or dirty Chief-owned settings on an ordinary caregiver session.
    if(typeof SYNC!=='undefined'&&(SYNC.sessionToken||SYNC.available()))return null;
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
  /* The list a report centre offers, with the capability each type needs. The
     archive and the report centre read the same map, so a report that can be
     generated can also be found again. */
  types(){
    return [
      { type:'weekly_indicators', title:REPORT_TITLES.weekly_indicators, caps:['report.patient_figures','report.patient_days','report.departmental','report.executive'], icon:'activity', desc:'The Monday planning page: patients in programme, bags by code, support issued, weights taken and ministry areas split into villages and slums.' },
      { type:'patient_figures', title:REPORT_TITLES.patient_figures, caps:['report.patient_figures'], icon:'file', desc:'Twenty defined indicators, caseload calculation, ministry-area breakdown and targets.' },
      { type:'patient_days', title:REPORT_TITLES.patient_days, caps:['report.patient_days'], icon:'clock', desc:'Days in programme with 60/100/120/180-day milestones and discharge readiness.' },
      { type:'expenditure', title:REPORT_TITLES.expenditure, caps:['report.expenditure'], icon:'wallet', desc:'Budget, committed, paid, reconciled and remaining - with evidence exceptions.' },
      { type:'referral', title:REPORT_TITLES.referral, caps:['report.referral'], icon:'link', desc:'Patients referred by recognised facilities, matched against the verified register.' },
      { type:'executive', title:REPORT_TITLES.executive, caps:['report.executive'], icon:'chart', desc:'County comparison, caseload, requests and data-integrity position.' },
      { type:'home_visits', title:REPORT_TITLES.home_visits, caps:['patient.list','visit.view'], icon:'activity', desc:'Visit outcomes, failed visits and caregiver activity for the week.' },
      { type:'hospital_ops', title:REPORT_TITLES.hospital_ops, caps:['hosp.request.review','hosp.visit.record','hosp.receipt.review'], icon:'hospital', desc:'Referral pipeline, transport facilitation and reconciliation position.' },
      { type:'quality', title:REPORT_TITLES.quality, caps:['audit.view'], icon:'alert', desc:'Duplicate identifiers, invalid dates, missing evidence and reconciliation gaps.' },
      { type:'donor', title:REPORT_TITLES.donor, caps:['report.patient_figures','report.executive'], icon:'heart', desc:'Aggregate programme reach, support delivered and resources, with no identifying detail.' },
      { type:'condition_summary', title:REPORT_TITLES.condition_summary, caps:['condition.aggregate','condition.sensitive'], icon:'clipboard', desc:'Recorded conditions by classification, with small-group suppression applied.' }
    ];
  },
  generate(type, params, user){
    if(type==='weekly_indicators'){
      const period=params.date ? PERIOD.workWeek(params.date) : PERIOD.lastCompletedWorkWeek();
      params=Object.assign({},params,{date:period.civilStart});
    }
    const existing = DB.db.reports.filter(r=>r.type===type && r.periodKey===periodKeyFor(type,params) && r.countyId===(params.countyId||'all'));
    const version = existing.length+1;
    const rec = {
      id:uid('r'), type, title:REPORT_TITLES[type]||titleCase(type),
      countyId: params.countyId||'all', periodKey: periodKeyFor(type,params),
      params, generatedAt: todayISO(), generatedBy: user.id, generatedByName: user.name||'Scheduled automation', generatedProvenance:reportProvenance(user),
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
    /* One source of truth for which capability a report needs. */
    const capByType = {};
    this.types().forEach(t=>{ capByType[t.type] = t.caps; });
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
  condition_summary:'Condition Summary',
  weekly_indicators:'Weekly Planning Indicators'
};

/* Every issued report carries the period it actually covers. A weekly report
   that is filed under a bare month cannot be told apart from the previous
   week's issue, so the week is named by its ISO year and week number (2026-W47)
   and a month report by its month (2026-11). A generation date that differs
   from the issue date is therefore visible on the archive, not hidden in it. */
function periodKeyFor(type, p){
  const when = (p && (p.periodEnd || p.date)) ? new Date(p.periodEnd || p.date) : new Date();
  const monthKey = d => new Date(d).toISOString().slice(0,7);
  const weekKey = d => {
    const date = new Date(d);
    const iso = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    iso.setUTCDate(iso.getUTCDate() + 4 - (iso.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(iso.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((iso - yearStart) / 86400000) + 1) / 7);
    return `${iso.getUTCFullYear()}-W${String(week).padStart(2,'0')}`;
  };
  if(type==='weekly_indicators'){
    // Archive keys remain ISO-based until the organisation defines its custom
    // 52-week boundary rule. Preserve existing keys; never relabel history.
    const period=p&&p.date ? PERIOD.workWeek(p.date) : PERIOD.lastCompletedWorkWeek(when);
    return weekKey(new Date(period.civilStart+'T12:00:00Z'));
  }
  if(type==='patient_figures' || type==='patient_days' || type==='home_visits') return weekKey(when);
  if(type==='expenditure') return monthKey(when);
  if(type==='referral') return 'registry-'+monthKey(when);
  if(type==='executive' || type==='donor') return 'Q'+(Math.floor(new Date(when).getUTCMonth()/3)+1)+'-'+new Date(when).getUTCFullYear();
  return monthKey(when);
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

/* Output provenance is distinct from clinical authorship or approval. */
function reportProvenance(user=AUTH.user){
  const role=user&&roleObj(user.roleId);
  const department=(typeof DEPARTMENTS!=='undefined'?DEPARTMENTS:[]).find(d=>d.id===(user?.departmentId||role?.dept));
  return {userId:user?.id||'',username:user?.username||'',name:user?.displayName||user?.name||'Not recorded',department:department?.name||'Department not recorded',at:new Date().toISOString()};
}
function reportProvenanceText(p=reportProvenance(),action='Generated'){
  return `${action} by: ${p.name}${p.username?' (@'+p.username+')':''} · Department: ${p.department} · ${p.at}`;
}
function reportProvenanceHTML(p=reportProvenance(),action='Generated'){
  return `<div class="report-provenance" data-report-provenance="${esc(action)}"><strong>${esc(action)} by:</strong> ${esc(p.name)}${p.username?' (@'+esc(p.username)+')':''}<br><strong>Department:</strong> ${esc(p.department)} · <time>${esc(p.at)}</time></div>`;
}
