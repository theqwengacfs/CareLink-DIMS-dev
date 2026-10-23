/* ============================================================
   leave.js - Leave, off-days and field coverage.

   Two sets of rules meet here and are kept apart:

   ENTITLEMENT (the employment rules shown on the page)
     annual leave, casual leave, notice, sick certificates.

   COVERAGE (the field rules from the LOMAMO Staff Leave specification)
     R1  Monday is the office day for everyone.
     R2  Wickliff may be away on a Monday.
     R3  Each member of staff is entitled to one office day.
     R4  Casual workers cover field and ministry locations.
     R5  No leave is approved if it leaves a location uncovered.

   The coverage engine evaluates every working day in the request. A slot is
   a named person at a named location on a named weekday. Leave removes that
   person; the request is refused unless a substitute can fill the slot,
   and the substitute is written down, not assumed.
   ============================================================ */

const LEAVE_SITES = [
  { id:'management', name:'Monday Management Meeting', areaId:null,        countyId:'kisumu',  required:1, office:true },
  { id:'nyalenda',   name:'Nyalenda',            areaId:'nyalenda',  countyId:'kisumu',  required:1, provisional:'Visit days carried over from the previous schedule; Administration has not yet confirmed a fixed day for Nyalenda.' },
  { id:'nairobird',  name:'Nairobi Road',        areaId:'nairobird', countyId:'kisumu',  required:1 },
  { id:'nyahera',    name:'Nyahera',             areaId:'nyahera',   countyId:'kisumu',  required:1 },
  { id:'manyatta',   name:'Manyatta',            areaId:'manyatta',  countyId:'kisumu',  required:1 },
  { id:'ombeyi',     name:'Ombeyi',              areaId:'ombeyi',    countyId:'kisumu',  required:1 },
  { id:'ahero',      name:'Ahero',               areaId:'ahero',     countyId:'kisumu',  required:1 },
  { id:'chiga',      name:'Chiga',               areaId:'chiga',     countyId:'kisumu',  required:1 },
  { id:'hospital',   name:'Hospital Ministry',   areaId:null,        countyId:'kisumu',  required:1 },
  { id:'makongeni',  name:'Makongeni',           areaId:'makongeni', countyId:'homabay', required:1, provisional:'Homa Bay field days will be added later by the Homa Bay County Coordinator.' },
  { id:'shauriyako', name:'Shauri Yako',         areaId:'shauriyako',countyId:'homabay', required:1, provisional:'Homa Bay field days will be added later by the Homa Bay County Coordinator.' }
];

/* The weekly baseline, reprogrammed from the Administration's own instruction:

     Monday     Management Meeting Day. Everyone is at the office except a
                person on sick leave. Wycliff Otieno may leave to assist
                patients at the hospital, because he serves that department
                and patients come first (R2).
     Tuesday    Nairobi Road (Catherine Awuor Obila + Ashar Anyango Omondi)
                Ombeyi (Allan Dennis Wayodi + Evans Omondi Odiyo)
                Nyalenda (Daniel Naphtaly Ombija + casual) - provisional day
     Wednesday  Manyatta (Washington Ayub Odero + available caregiver / casual / CHV)
                Nyahera (John Shikuku Omolo + Ashar Anyango Omondi)
                Nyalenda (Daniel Naphtaly Ombija) - provisional day
                Hospital Ministry (Susan Mildred standing in for Washington)
     Thursday   Nairobi Road (Catherine Awuor Obila + Ashar Anyango Omondi)
                Ahero (Evans Omondi Odiyo + John Shikuku Omolo or Allan Dennis Wayodi)
     Friday     Chiga (Wycliff Otieno + John Shikuku Omolo or Allan Dennis Wayodi)
                Hospital visits (Washington Ayub Odero + Susan Mildred)

   `role` is 'lead' for the coordinator who owns the day, 'assist' for the
   assisting caregiver, and 'alternate' for the second driver who covers
   Ahero and Chiga when the other is not available. An alternate is real
   cover: the Administration's instruction is "whoever is available". */
const LEAVE_PATTERN = [
  /* ---- Monday: management meeting (R1). Wycliff is the one exception (R2). ---- */
  { weekday:1, siteId:'management', staff:'ls-daniel',     role:'lead' },
  { weekday:1, siteId:'management', staff:'ls-cathy',      role:'lead' },
  { weekday:1, siteId:'management', staff:'ls-washington', role:'lead' },
  { weekday:1, siteId:'management', staff:'ls-allan',      role:'lead' },
  { weekday:1, siteId:'management', staff:'ls-john',       role:'lead' },
  { weekday:1, siteId:'management', staff:'ls-evans',      role:'lead' },
  { weekday:1, siteId:'management', staff:'ls-ashar',      role:'lead' },
  { weekday:1, siteId:'management', staff:'ls-susan',      role:'lead' },
  { weekday:1, siteId:'hospital',   staff:'ls-wickliff',   role:'lead' },

  /* ---- Tuesday ---- */
  { weekday:2, siteId:'nairobird',  staff:'ls-cathy',      role:'lead' },
  { weekday:2, siteId:'nairobird',  staff:'ls-ashar',      role:'assist' },
  { weekday:2, siteId:'ombeyi',     staff:'ls-allan',      role:'lead' },
  { weekday:2, siteId:'ombeyi',     staff:'ls-evans',      role:'assist' },
  { weekday:2, siteId:'nyalenda',   staff:'ls-daniel',     role:'lead' },
  { weekday:2, siteId:'nyalenda',   staff:'casual',        role:'assist' },

  /* ---- Wednesday ---- */
  { weekday:3, siteId:'manyatta',   staff:'ls-washington', role:'lead' },
  { weekday:3, siteId:'manyatta',   staff:'casual',        role:'assist' },
  { weekday:3, siteId:'nyahera',    staff:'ls-john',       role:'lead' },
  { weekday:3, siteId:'nyahera',    staff:'ls-ashar',      role:'assist' },
  { weekday:3, siteId:'nyalenda',   staff:'ls-daniel',     role:'lead' },
  { weekday:3, siteId:'hospital',   staff:'ls-susan',      role:'lead' },

  /* ---- Thursday ---- */
  { weekday:4, siteId:'nairobird',  staff:'ls-cathy',      role:'lead' },
  { weekday:4, siteId:'nairobird',  staff:'ls-ashar',      role:'assist' },
  { weekday:4, siteId:'ahero',      staff:'ls-evans',      role:'lead' },
  { weekday:4, siteId:'ahero',      staff:'ls-john',       role:'assist' },
  { weekday:4, siteId:'ahero',      staff:'ls-allan',      role:'alternate' },

  /* ---- Friday ---- */
  { weekday:5, siteId:'chiga',      staff:'ls-wickliff',   role:'lead' },
  { weekday:5, siteId:'chiga',      staff:'ls-john',       role:'assist' },
  { weekday:5, siteId:'chiga',      staff:'ls-allan',      role:'alternate' },
  { weekday:5, siteId:'hospital',   staff:'ls-washington', role:'lead' },
  { weekday:5, siteId:'hospital',   staff:'ls-susan',      role:'assist' }
];

const LEAVE_RULES = {
  entitlement:[
    { id:'E1', text:'Annual leave (EPPH v2.2): 21 working days per completed year (1.75 days/month accrued), with up to 10 days carry-over permitted until 31 March of the following year.' },
    { id:'E2', text:'Casual leave: up to 3 single-day requests per year. Planned annual leave requires at least 14 days advance written notice (Part I(A)); shorter notice is logged as an exception.' },
    { id:'E3', text:'Sick leave: up to 3 days before review; absence beyond 2 consecutive days requires a medical certificate attached to the HR record (Employment Act s.30).' },
    { id:'E4', text:'Statutory family & bereavement leave: Maternity 90 days, Paternity 14 days, Compassionate leave up to 7 days.' },
    { id:'E5', text:'Absence without leave or lawful cause exceeding 7 consecutive days triggers Employment Act 2007 s.44(4)(a) disciplinary review.' },
    { id:'E6', text:'Mandatory Delegation Plan (Part I(B)): every field, clinical or departmental officer proceeding on leave must file a Scoped Reliever Delegation Plan in the Delegation & Handover workspace.' }
  ],
  coverage:[
    { id:'R1', text:'Monday is Management Meeting Day: everyone is at the office. Leave on a Monday is refused for everyone except a person on sick leave.' },
    { id:'R2', text:'Wycliff Otieno may leave on a Monday to assist patients at the hospital. Patients come first; it is the reason the programme exists.' },
    { id:'R3', text:'Each member of staff has one office day, which is Monday under R1.' },
    { id:'R4', text:'Casual workers, Community Health Volunteers and any available caregiver registered by the concerned admin office cover field and ministry locations, and cannot be in two locations on one day.' },
    { id:'R5', text:'No leave is approved if a field or ministry location is left without cover on its own visit day.' },
    { id:'R6', text:'Ministry home-visit days are fixed: Nairobi Road Tuesday and Thursday, Manyatta Wednesday, Ombeyi Tuesday, Nyahera Wednesday, Ahero Thursday, Chiga Friday, hospital visits Friday. Nyalenda keeps its carried-over Tuesday and Wednesday until Administration confirms a fixed day.' },
    { id:'R7', text:'Ahero (Thursday) and Chiga (Friday) are assisted by either John Shikuku Omolo or Allan Dennis Wayodi, since both can drive: whoever is available assists.' }
  ]
};

const LEAVE = {
  sites(){ return LEAVE_SITES; },
  site(id){ return LEAVE_SITES.find(s=>s.id===id)||null; },
  pattern(){ return LEAVE_PATTERN; },
  rules(){ return LEAVE_RULES; },

  /* Staff come from the HR register. The leave fields are part of that record
     so there is one staff list, not two. */
  staff(user){
    let rows = DB.db.employees||[];
    if(user && !RBAC.has(user,'hr.view')) rows = rows.filter(e=>e.userId===user.id);
    return rows.filter(e=>e.status!=='ended');
  },
  employee(id){ return (DB.db.employees||[]).find(e=>e.id===id)||null; },
  casuals(){ return (DB.db.employees||[]).filter(e=>e.staffType==='casual' && e.status!=='ended'); },

  weekday(date){ const d=new Date(date).getDay(); return d===0?7:d; },
  isMonday(date){ return this.weekday(date)===1; },
  iso(d){ return new Date(d).toISOString().slice(0,10); },
  datesIn(from,to){
    const out=[]; let d=new Date(from); const end=new Date(to);
    if(isNaN(d)||isNaN(end)) return out;
    let guard=0;
    while(d<=end && guard<400){ out.push(this.iso(d)); d=new Date(d.getTime()+86400000); guard++; }
    return out;
  },
  workingDays(from,to){ return this.datesIn(from,to).filter(d=>{const w=this.weekday(d); return w>=1&&w<=5;}); },

  onLeave(employeeId, date){
    const d=String(date).slice(0,10);
    return (DB.db.leaveRequests||[]).find(l=>l.employeeId===employeeId && l.status==='approved' &&
      d>=String(l.from).slice(0,10) && d<=String(l.to).slice(0,10)) || null;
  },
  overlap(employeeId, from, to, ignoreId){
    return (DB.db.leaveRequests||[]).find(l=>l.employeeId===employeeId && l.id!==ignoreId &&
      ['pending','approved'].includes(l.status) &&
      !(String(to).slice(0,10) < String(l.from).slice(0,10) || String(from).slice(0,10) > String(l.to).slice(0,10)));
  },

  slotsFor(employeeId, date){
    const w=this.weekday(date);
    return LEAVE_PATTERN.filter(p=>p.weekday===w && p.staff===employeeId)
      .map(p=>({...p, site:this.site(p.siteId)}));
  },

  /* Who can fill a slot on a date. A named person's own slot is not cover. */
  candidates(date, siteId, exclude){
    const w=this.weekday(date);
    const taken = new Set();
    /* people already scheduled elsewhere that day */
    LEAVE_PATTERN.filter(p=>p.weekday===w).forEach(p=>{ if(p.staff!=='casual') taken.add(p.staff); });
    /* substitutes already written down for that date */
    (DB.db.leaveCover||[]).filter(c=>c.date===String(date).slice(0,10)).forEach(c=>taken.add(c.coveredBy));
    const busy = id => taken.has(id) && !this.slotsFor(id,date).some(s=>s.siteId===siteId);
    const permanent = (DB.db.employees||[]).filter(e=>
      e.staffType!=='casual' && e.status!=='ended' && e.id!==exclude &&
      !this.onLeave(e.id,date) && !busy(e.id) && (e.leaveGroup||'field')!=='office');
    const casuals = this.casuals().filter(e=> !this.onLeave(e.id,date) && !busy(e.id));
    return [...permanent.map(e=>({...e, coverKind:'permanent'})), ...casuals.map(e=>({...e, coverKind:'casual'}))];
  },

  /* Evaluate a request without writing anything. */
  check({employeeId, type, from, to, emergency=false, ignoreId=null}){
    const emp=this.employee(employeeId);
    const reasons=[], warnings=[], cover=[];
    if(!emp) return {ok:false, reasons:['Choose a member of staff.'], warnings, cover, days:0};
    if(!from || !to) return {ok:false, reasons:['Record both the first and the last day of the leave.'], warnings, cover, days:0};
    if(String(from).slice(0,10) > String(to).slice(0,10)) return {ok:false, reasons:['The last day cannot be before the first day.'], warnings, cover, days:0};
    if(!['annual','casual','sick','unpaid','compassionate','maternity','paternity'].includes(type))
      return {ok:false, reasons:['Choose a leave type.'], warnings, cover, days:0};

    const dates=this.datesIn(from,to);
    const working=this.workingDays(from,to);
    const days=working.length;

    /* --- overlapping leave --- */
    const ov=this.overlap(employeeId, from, to, ignoreId);
    if(ov) reasons.push(`An existing ${ov.status} request already covers ${fmtDate(ov.from)} to ${fmtDate(ov.to)}.`);

    /* --- Monday office rule (R1, R2). Sick leave is a medical absence, not a choice. --- */
    const mondays=dates.filter(d=>this.weekday(d)===1);
    if(mondays.length && !emp.canLeaveMonday && type!=='sick')
      reasons.push(`R1: Monday is the office day. ${emp.name} may not take ${type} leave on ${fmtDate(mondays[0])}${mondays.length>1?` or the other ${mondays.length-1} Monday(s) in this request`:''}.`);
    if(mondays.length && emp.canLeaveMonday)
      warnings.push(`R2 applies: ${emp.name} may be away on a Monday.`);

    /* --- casual rules --- */
    if(emp.staffType==='casual'){
      if(type!=='casual' && type!=='sick') reasons.push('A casual worker records casual or sick leave only.');
      if(days>1) reasons.push('Casual leave is single-day only.');
    }

    /* --- balance --- */
    const bal=this.balance(employeeId, new Date(from).getFullYear());
    if(type==='annual' && days>bal.annualRemaining)
      reasons.push(`The request is ${days} working day(s) and only ${bal.annualRemaining} annual day(s) remain for ${bal.year}.`);
    if(type==='casual' && days>bal.casualRemaining)
      reasons.push(`Only ${bal.casualRemaining} casual day(s) remain for ${bal.year}.`);

    /* --- notice (EPPH v2.2: >=14 days for planned annual leave, >=7 days for casual) --- */
    const notice=Math.floor((new Date(from)-new Date(todayISO()))/86400000);
    if(type==='annual' && notice<14 && !emergency)
      warnings.push(`Only ${Math.max(0,notice)} day(s) of notice. EPPH v2.2 Part I(A) requires at least 14 days advance written notice for planned annual leave; recorded as a short-notice exception.`);
    else if(type==='casual' && notice<7 && !emergency)
      warnings.push(`Only ${Math.max(0,notice)} day(s) of notice. Casual leave should be applied for at least 7 days ahead; recorded as an exception.`);
    if(type==='sick' && days>2)
      warnings.push('Sick leave beyond two consecutive days needs a medical certificate attached to the staff record.');

    /* --- coverage --- */
    const seen={};
    dates.filter(d=>this.weekday(d)<=5).forEach(date=>{
      this.slotsFor(employeeId,date).forEach(slot=>{
        if(seen[date+'|'+slot.siteId]) return;
        seen[date+'|'+slot.siteId]=true;
        const remaining=LEAVE_PATTERN.filter(p=>p.weekday===this.weekday(date) && p.siteId===slot.siteId && p.staff!==employeeId).length;
        const already=(DB.db.leaveCover||[]).filter(c=>c.date===date && c.siteId===slot.siteId).length;
        const required=slot.site?.required||1;
        if(remaining+already<required && !(slot.siteId==='hospital'&&employeeId==='ls-wickliff'&&slot.weekday===1)){
          const cands=this.candidates(date, slot.siteId, employeeId);
          if(!cands.length){
            reasons.push(`R5: ${slot.site?.name||slot.siteId} would have no cover on ${fmtDate(date)} and no available substitute was found.`);
          } else {
            /* prefer a permanent colleague who is not already scheduled, then a casual */
            const pick=cands[0];
            cover.push({ date, siteId:slot.siteId, site:slot.site?.name||slot.siteId,
              forEmployeeId:employeeId, coveredBy:pick.id, coveredByName:pick.name,
              coverKind:pick.coverKind, role:slot.role });
            if(pick.coverKind==='casual')
              warnings.push(`${slot.site?.name||slot.siteId} on ${fmtDate(date)} is covered by a casual worker (${pick.name}).`);
          }
        }
      });
    });

    /* casual double-booking is prevented inside candidates(); verify it explicitly */
    const byDate={};
    cover.filter(c=>c.coverKind==='casual').forEach(c=>{
      byDate[c.date]=byDate[c.date]||{};
      byDate[c.date][c.coveredBy]=(byDate[c.date][c.coveredBy]||0)+1;
    });
    Object.entries(byDate).forEach(([d,map])=>{
      Object.entries(map).forEach(([id,n])=>{ if(n>1) reasons.push(`A casual worker (${id}) would be double-booked on ${fmtDate(d)}.`); });
    });

    return {ok:reasons.length===0, reasons, warnings, cover, days, balance:bal,
      siteNames:[...new Set(cover.map(c=>c.site))]};
  },

  balance(employeeId, year){
    const emp=this.employee(employeeId)||{};
    const y=year||new Date().getFullYear();
    const yearStart=`${y}-01-01`, yearEnd=`${y}-12-31`;
    const start=emp.start? new Date(emp.start):new Date(yearStart);
    const base=Number(emp.annualEntitlement||15);
    /* prorate the first year from the start date to the end of that leave year */
    let entitlement=base;
    if(new Date(emp.start||yearStart) > new Date(yearStart)){
      const from = new Date(Math.max(new Date(emp.start).getTime(), new Date(yearStart).getTime()));
      const total = Math.round((new Date(yearEnd)-new Date(yearStart))/86400000)+1;
      const served = Math.max(0, Math.round((new Date(yearEnd)-from)/86400000)+1);
      entitlement = Math.round(base*served/total*2)/2;
    }
    const rows=(DB.db.leaveRequests||[]).filter(l=>l.employeeId===employeeId &&
      ['annual','casual'].includes(l.type) && String(l.from).slice(0,4)===String(y));
    const taken=rows.filter(l=>l.status==='approved').reduce((n,l)=>n+l.days,0);
    const pending=rows.filter(l=>l.status==='pending').reduce((n,l)=>n+l.days,0);
    const casualEnt=Number(emp.casualEntitlement||3);
    const monthsElapsed = y < new Date().getFullYear() ? 12 : (y > new Date().getFullYear() ? 0 : (new Date().getMonth()+1));
    const accruedYtd = Math.min(entitlement, Math.round(monthsElapsed * (entitlement/12) * 100)/100);
    const carryOver = Math.min(10, Number(emp.carryOverDays||0));
    return { year:y, annualEntitlement:entitlement, accruedYtd, carryOver, annualTaken:taken, annualPending:pending,
      annualRemaining:Math.max(0, entitlement+carryOver-taken-pending),
      casualEntitlement:casualEnt, casualRemaining:casualEnt-rowText(rows,'casual','approved')-rowText(rows,'casual','pending'),
      serviceYears: emp.start? Math.max(0,Math.floor((new Date()-new Date(emp.start))/(365.25*86400000))):0 };
  },

  apply(user, {employeeId, type, from, to, reason, emergency=false}){
    const emp=this.employee(employeeId);
    if(!emp) return {ok:false,msg:'Choose a member of staff.'};
    const own = emp.userId===user.id;
    if(!own && !RBAC.has(user,'hr.leave.approve'))
      return {ok:false,msg:'You may apply for your own leave. An HR officer applies for a colleague.'};
    if(!String(reason||'').trim()) return {ok:false,msg:'A reason is required on every request.'};
    const chk=this.check({employeeId,type,from,to,emergency});
    if(!chk.ok) return {ok:false,msg:chk.reasons[0], reasons:chk.reasons};
    const rec={ id:uid('lv'), employeeId, type, from:String(from).slice(0,10), to:String(to).slice(0,10),
      days:chk.days, status:'pending', reason:String(reason).slice(0,400), appliedAt:todayISO(),
      appliedBy:user.id, emergency:!!emergency, checks:{warnings:chk.warnings}, proposedCover:chk.cover,
      history:[{at:new Date().toISOString(),by:user.id,action:'applied'}], demo:false };
    DB.db.leaveRequests=DB.db.leaveRequests||[];
    DB.db.leaveRequests.unshift(rec);
    AUDIT.append({actor:user.id,action:'leave.applied',entity:'leave',entityId:rec.id,
      detail:`${emp.name} · ${titleCase(type)} · ${rec.days} day(s) · ${rec.from} to ${rec.to}`});
    DB.save();
    return {ok:true,rec,msg:`${rec.days} working day(s) requested. It is pending until HR decides.`};
  },

  decide(user, id, decision, note){
    const rec=(DB.db.leaveRequests||[]).find(l=>l.id===id);
    if(!rec) return {ok:false,msg:'Request not found.'};
    if(!RBAC.assert(user,'hr.leave.approve',{},false)) return {ok:false,msg:'Your role may not decide leave.'};
    if(rec.status!=='pending') return {ok:false,msg:'Only a pending request can be decided.'};
    const emp=this.employee(rec.employeeId)||{};
    if(emp.userId===user.id) return {ok:false,msg:'You cannot approve or refuse your own leave. Another approving officer must decide it.'};
    if(rec.appliedBy===user.id && !RBAC.has(user,'system.config'))
      return {ok:false,msg:'You recorded this application. A second approving officer must decide it.'};
    if(!['approved','rejected'].includes(decision)) return {ok:false,msg:'Choose approve or decline.'};
    if(decision==='rejected' && !String(note||'').trim()) return {ok:false,msg:'A refusal needs a written reason.'};

    if(decision==='approved'){
      /* Re-check at the moment of approval: cover may have changed since application. */
      const chk=this.check({employeeId:rec.employeeId,type:rec.type,from:rec.from,to:rec.to,emergency:rec.emergency,ignoreId:rec.id});
      if(!chk.ok) return {ok:false,msg:chk.reasons[0], reasons:chk.reasons};
      DB.db.leaveCover = DB.db.leaveCover||[];
      chk.cover.forEach(c=>{
        const exists=DB.db.leaveCover.find(x=>x.date===c.date && x.siteId===c.siteId && x.leaveId===rec.id);
        if(!exists) DB.db.leaveCover.push({ id:uid('cv'), date:c.date, siteId:c.siteId, forEmployeeId:c.forEmployeeId,
          coveredBy:c.coveredBy, leaveId:rec.id, kind:c.coverKind, role:c.role, at:new Date().toISOString(), by:user.id });
      });
      rec.coveredSites=[...new Set(chk.cover.map(c=>c.site))];
      rec.warnings=chk.warnings;
    }
    if(decision==='rejected'){
      /* A refusal releases any cover tentatively proposed but never written. */
      rec.rejectionReason=String(note).slice(0,400);
    }
    rec.status=decision; rec.decidedBy=user.id; rec.decidedAt=new Date().toISOString(); rec.note=String(note||'').slice(0,400);
    rec.history=[...(rec.history||[]),{at:new Date().toISOString(),by:user.id,action:decision,note:rec.note}];
    AUDIT.append({actor:user.id,action:'leave.decided',entity:'leave',entityId:rec.id,
      detail:`${emp.name} · ${decision} · ${rec.days} day(s)${rec.note?' · '+rec.note:''}`});
    if(emp.userId) notify(emp.userId, decision==='approved'?'Leave approved':'Leave not approved',
      `${fmtDate(rec.from)} to ${fmtDate(rec.to)}${rec.note?' · '+rec.note:''}`, decision==='approved'?'ok':'warn');
    DB.save();
    return {ok:true,rec,msg:decision==='approved'?'Leave approved and cover recorded.':'Request refused.'};
  },

  cancel(user, id, reason){
    const rec=(DB.db.leaveRequests||[]).find(l=>l.id===id);
    if(!rec) return {ok:false,msg:'Request not found.'};
    const emp=this.employee(rec.employeeId)||{};
    if(emp.userId!==user.id && !RBAC.has(user,'hr.leave.approve')) return {ok:false,msg:'You may cancel your own request.'};
    if(rec.status!=='pending' && rec.status!=='approved') return {ok:false,msg:'This request cannot be cancelled.'};
    rec.status='cancelled'; rec.cancelledBy=user.id; rec.cancelledAt=new Date().toISOString(); rec.cancelReason=String(reason||'').slice(0,300);
    DB.db.leaveCover=(DB.db.leaveCover||[]).filter(c=>c.leaveId!==rec.id);
    AUDIT.append({actor:user.id,action:'leave.cancelled',entity:'leave',entityId:rec.id,detail:`${emp.name} · ${rec.cancelReason}`});
    DB.save(); return {ok:true,rec,msg:'Request cancelled.'};
  },

  /* The field position for one date: every site, its slots, who is away,
     who is covering and whether the site is covered. */
  coverage(date){
    const d=String(date).slice(0,10); const w=this.weekday(d);
    const rows=LEAVE_SITES.filter(s=>LEAVE_PATTERN.some(p=>p.weekday===w && p.siteId===s.id))
      .map(site=>{
        const slots=LEAVE_PATTERN.filter(p=>p.weekday===w && p.siteId===site.id).map(p=>{
          if(p.staff==='casual'){
            const cover=(DB.db.leaveCover||[]).find(c=>c.date===d && c.siteId===site.id);
            return { casual:true, name:cover? `Casual: ${this.employee(cover.coveredBy)?.name||'assigned'}` : 'Casual worker required',
              away:false, cover:cover||null };
          }
          const emp=this.employee(p.staff);
          const on=this.onLeave(p.staff,d);
          const cover=(DB.db.leaveCover||[]).find(c=>c.date===d && c.siteId===site.id && c.forEmployeeId===p.staff);
          return { employee:emp, name:emp?emp.name:p.staff, away:!!on, leave:on, cover:cover||null,
            coveredByName: cover? this.employee(cover.coveredBy)?.name||'assigned' : null };
        });
        const needed=slots.filter(s=>!s.casual).length;
        const present=slots.filter(s=>!s.casual && !s.away).length + slots.filter(s=>s.cover).length;
        const casualAssigned=slots.some(s=>s.casual && s.cover);
        const status = present>=needed && (slots.some(s=>s.casual)? casualAssigned : true) ? 'covered'
          : present>=needed? 'at-risk':'uncovered';
        return { site, slots, status };
      });
    return { date:d, weekday:w, rows };
  },

  week(from){
    const start=new Date(from);
    const dow=this.weekday(start);
    const monday=new Date(start.getTime() - (dow-1)*86400000);
    return Array.from({length:5},(_,i)=>this.coverage(this.iso(new Date(monday.getTime()+i*86400000))));
  },

  csv(user, week){
    const days=this.week(week||todayISO());
    const rows=[];
    days.forEach(day=>day.rows.forEach(r=>r.slots.forEach(s=>{
      rows.push({date:day.date,site:r.site.name,person:s.name,away:s.away?'On leave':'',cover:s.coveredByName||''});
    })));
    return toCSV(rows,[{label:'Date',key:'date'},{label:'Location',key:'site'},{label:'Slot',key:'person'},
      {label:'Away',key:'away'},{label:'Covered by',key:'cover'}]);
  }
};
function rowText(rows,type,status){
  return rows.filter(l=>l.type===type && l.status===status).reduce((n,l)=>n+l.days,0);
}

/* ---------------- views ---------------- */
function renderLeave(user){
  const hrView=RBAC.has(user,'hr.view');
  const me=(DB.db.employees||[]).find(e=>e.userId===user.id);
  const rowsDuring=(DB.db.leaveRequests||[]).filter(l=>hrView||(me&&l.employeeId===me.id));
  const bal=me? LEAVE.balance(me.id):null;
  const week=LEAVE.week(todayISO());
  const todayCov=LEAVE.coverage(todayISO());
  const pending=rowsDuring.filter(l=>l.status==='pending');
  const staffRows=hrView? LEAVE.staff(user):[];

  const balCard = me? card('My leave balance', `
    <div class="grid g3">
      ${kpi('Annual remaining', bal.annualRemaining+' d', `of ${bal.annualEntitlement} for ${bal.year}`,'',"calendar")}
      ${kpi('Annual taken', bal.annualTaken+' d', bal.annualPending? `${bal.annualPending} d pending`:'No pending days','',"check")}
      ${kpi('Casual remaining', bal.casualRemaining+' d', `of ${bal.casualEntitlement}`,'','clock')}
    </div>
    <div class="xs muted" style="margin-top:10px">Service: ${bal.serviceYears} completed year(s). ${me.canLeaveMonday?'May be away on a Monday (R2).':'Monday is the office day (R1).'}</div>`)
    : null;

  return pageHead('Leave & field coverage','Two rule sets enforced together: EPPH v2.2 statutory entitlement (Parts I(A)-III(C)) and field visit-day coverage. Nothing is approved that leaves a location uncovered.',
    `<div class="row" style="gap:8px;flex-wrap:wrap">
      ${me||hrView?`<button class="btn btn-sm btn-primary" data-act="apply-leave">${ic('plus',15)} Apply for leave</button>`:''}
      ${RBAC.can(user,'handover.use').ok?`<button class="btn btn-sm btn-ghost" data-act="go" data-v="handover">${ic('key',15)} Delegation &amp; Handover</button>`:''}
      <button class="btn btn-sm btn-ghost" data-act="download-leave-week">${ic('download',15)} Export this week</button>
    </div>`)
  + `<div class="grid g4" style="margin-bottom:16px">
      ${kpi('Pending', num(pending.length),'Awaiting an HR decision','warn','clock')}
      ${kpi('Approved', num(rowsDuring.filter(r=>r.status==='approved').length),'This leave year','ok','check')}
      ${kpi('Locations staffed today', num(todayCov.rows.length),`${todayCov.rows.filter(r=>r.status==='covered').length} covered`,'',"building")}
      ${kpi('At risk today', num(todayCov.rows.filter(r=>r.status!=='covered').length),'No cover recorded','crit','alert')}
    </div>`
  + `<div class="${balCard?'grid g2':'grid'}" style="margin-bottom:16px">
      ${balCard||''}
      ${card('The rules', `<div class="col" style="gap:6px">
        <div class="xs" style="letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)">Entitlement</div>
        ${LEAVE_RULES.entitlement.map(r=>`<div class="small"><b>${r.id}</b> ${esc(r.text)}</div>`).join('')}
        <div class="xs" style="letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3);margin-top:8px">Field coverage</div>
        ${LEAVE_RULES.coverage.map(r=>`<div class="small"><b>${r.id}</b> ${esc(r.text)}</div>`).join('')}
      </div>`, {foot:'<span>Rules are configuration. Changing one is an audited settings change, not a code change.</span>'})}
    </div>`
  + card('This week at the field locations', `<div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Location</th>${week.map(d=>`<th>${new Date(d.date).toLocaleDateString('en-GB',{weekday:'short',day:'numeric'})}</th>`).join('')}</tr></thead>
      <tbody>${LEAVE_SITES.filter(s=>week.some(d=>d.rows.some(r=>r.site.id===s.id))).map(s=>`<tr>
        <td><b>${esc(s.name)}</b><div class="xs muted">${s.required} required</div></td>
        ${week.map(d=>{
          const row=d.rows.find(r=>r.site.id===s.id);
          if(!row) return `<td class="muted">-</td>`;
          const away=row.slots.filter(x=>x.away).length;
          const tone=row.status==='covered'?'b-ok':row.status==='at-risk'?'b-warn':'b-crit';
          return `<td>${badge(row.status==='covered'?'Covered':row.status==='at-risk'?'At risk':'Uncovered',tone)}
            <div class="xs muted">${row.slots.length} slot(s)${away?` · ${away} away`:''}</div></td>`;
        }).join('')}
      </tr>`).join('')}</tbody></table></div>`,
    {foot:'<span>Coverage is calculated from the approved register and the written cover records, not from the rota alone.</span>'})
  + `<div style="margin-top:16px">
      ${card(hrView?'Leave requests':'My leave requests', table([
        {label:'Staff',render:l=>`${esc(LEAVE.employee(l.employeeId)?.name||'-')}<div class="xs muted">${esc(titleCase(l.type))}</div>`},
        {label:'Period',render:l=>`${esc(fmtDate(l.from))} to ${esc(fmtDate(l.to))}<div class="xs muted">${l.days} working day${l.days===1?'':'s'}</div>`},
        {label:'Cover',render:l=>l.coveredSites?.length?esc(l.coveredSites.join(', ')):'<span class="xs muted">Not required</span>'},
        {label:'Status',render:l=>badge(titleCase(l.status), l.status==='approved'?'b-ok':l.status==='pending'?'b-warn':l.status==='cancelled'?'b-neutral':'b-crit')},
        {label:'Decision',cls:'act',render:l=>l.status==='pending'&&RBAC.has(user,'hr.leave.approve')
          ?`<button class="btn btn-xs btn-primary" data-act="review-leave" data-id="${l.id}">Decide</button>`
          : (l.decidedBy?`<span class="xs muted">${esc(userName(l.decidedBy))}</span>`:'')}
      ], rowsDuring, {emptyMsg:'No leave requests recorded. Applications appear here for decision.'}),
        {foot:'<span>Nothing is approved that would leave a field location without its required cover.</span>'})}
    </div>`
  + (hrView? `<div style="margin-top:16px">${card('6-Column Staff Leave Balance Ledger (Part III(A) · EPPH v2.2)', table([
        {label:'Staff',render:e=>`${esc(e.name)}<div class="xs muted">${esc(e.staffGroup||e.role||'')}</div>`},
        {label:'Type',render:e=>badge(e.staffType==='casual'?'Casual':'Permanent',e.staffType==='casual'?'b-warn':'b-neutral')},
        {label:'Entitlement',cls:'num',render:e=>{const b=LEAVE.balance(e.id); return b.annualEntitlement+' d';}},
        {label:'Accrued YTD',cls:'num',render:e=>{const b=LEAVE.balance(e.id); return b.accruedYtd+' d';}},
        {label:'Carry-over',cls:'num',render:e=>{const b=LEAVE.balance(e.id); return b.carryOver+' d';}},
        {label:'Days Taken',cls:'num',render:e=>{const b=LEAVE.balance(e.id); return b.annualTaken+' d';}},
        {label:'Days Applied',cls:'num',render:e=>{const b=LEAVE.balance(e.id); return b.annualPending+' d';}},
        {label:'Remaining Balance',cls:'num',render:e=>{const b=LEAVE.balance(e.id); return `<b>${b.annualRemaining} d</b>`;}},
        {label:'Office day',render:e=>e.canLeaveMonday?badge('Monday exception','b-warn'):badge('Monday','b-neutral')}
      ], LEAVE.staff(user).slice().sort((a,b)=>LEAVE.balance(a.id).annualRemaining-LEAVE.balance(b.id).annualRemaining).slice(0,12),
        {emptyMsg:'No staff records yet.'}),
        {foot:`<span>6-column Part III(A) ledger computed from contract start date, carry-over cap (<=10 days to 31 March) and approved register. Showing twelve smallest balances of ${LEAVE.staff(user).length} staff.</span>`})}</div>`:'')
}
