/* ============================================================
   tb_dispensing.js - TB drug dispensing control

   The protocol, exactly as Administration set it out
   -------------------------------------------------
   1. A caregiver requests pyridoxine for a TB patient from the
      ministry console.
   2. The Medical Case Manager answers the request and gives
      appropriate feedback - approval, an adjusted quantity, or a
      refusal with a reason. Nothing is dispensed on silence.
   3. A patient enrolled today and given pyridoxine today is sorted
      for the next ten days. The next dose is therefore due on day 9
      or day 10, so that no dose is missed.
   4. A two-week or a one-month supply may be requested where the
      household is far from the dispensing point or the patient
      travels; a one-month supply needs the case manager's written
      clinical reason.
   5. Every tablet dispensed is accounted for: physical stock count
      is recorded in the system and confirmed against the quantity
      that was procured. A variance outside tolerance is escalated,
      not absorbed.
   6. Finance and Procurement can see the whole chain - request,
      approval, dispense, stock count, procurement and value.

   The module never invents a clinical decision. It enforces the
   arithmetic of the ten-day cover, records who decided what, and
   makes the stock reconcile.
   ============================================================ */

/* ---------------- 1. The protocol ---------------- */
const TB_PROTOCOL = {
  drugId:'pyridox',
  drugName:'Pyridoxine (Vitamin B6) 25 mg tablet',
  indication:'Peripheral neuropathy prophylaxis for every patient on isoniazid-containing anti-TB therapy',
  coverDays:10,                 /* one dose course sorts the patient for ten days */
  refillWindow:[9,10],          /* give the next course on day 9 or day 10 */
  graceDays:3,                  /* after day 10 + grace the patient is flagged as a missed dose */
  maxDaysPerRequest:30,
  supplies:[
    { id:'PYR10', days:10, tablets:10, label:'10-day course (standard)', note:'One tablet daily for ten days. The default for every TB patient.' },
    { id:'PYR14', days:14, tablets:14, label:'Two-week supply', note:'Where the household is far from the dispensing point or the caregiver visits every other week.' },
    { id:'PYR30', days:30, tablets:30, label:'One-month supply', note:'Needs the case manager\u2019s written clinical reason: travel, relocation, school boarding or a documented default risk.', needsReason:true }
  ],
  tbDrugs:['pyridox','rhze','inh','etham','pza'],
  varianceTolerance:0.02,       /* 2% of the counted quantity, or 5 tablets, whichever is greater */
  varianceFloor:5,
  rules:[
    'A request comes from the caregiver who serves the patient, from that ministry console.',
    'The Medical Case Manager answers every request. Feedback is mandatory on an adjustment or a refusal.',
    'Dispensing is recorded against an approved request only, and it decrements a named batch (earliest expiry first).',
    'The next dose is calculated as the dispensing date plus the cover of the supply given, and the patient enters the day 9 to day 10 window.',
    'A patient whose window has passed without a dispense is flagged as a possible missed dose and appears on the case manager\u2019s board and the caregiver\u2019s console.',
    'A physical stock count is recorded by the pharmacy or a nurse, then confirmed by Finance or Procurement against what was procured.',
    'A variance outside tolerance opens an audit finding; it is never silently written off.'
  ]
};
const TB_SUPPLY = Object.fromEntries(TB_PROTOCOL.supplies.map(s=>[s.id,s]));

const TB_STATE = { tab:'board', status:'', areaId:'', drugId:'pyridox', q:'' };

/* ---------------- 2. Storage helpers ---------------- */
function tbStore(){
  DB.db.tbRequests = DB.db.tbRequests || [];
  DB.db.tbDispenses = DB.db.tbDispenses || [];
  DB.db.tbStockCounts = DB.db.tbStockCounts || [];
  DB.db.tbFindings = DB.db.tbFindings || [];
  return DB.db;
}

/* ---------------- 3. The service ---------------- */
const TBCARE = {
  protocol(){ return TB_PROTOCOL; },

  /* Is this patient a TB patient? Reads the confirmed condition register. */
  tbPatients(user){
    const db = DB.db;
    const ids = RBAC.has(user,'patient.list')? RBAC.patientIds(user) : new Set();
    const cond = (db.patientConditions||[]).filter(c=>/tb|tuberc/i.test(String(c.label||'')) || c.category==='tb');
    const byCond = new Set(cond.map(c=>c.patientId));
    return (db.patients||[]).filter(p=> ids.has(p.id) &&
      (byCond.has(p.id) || /tb|tuberc/i.test(String((p.clinical||{}).diagnosis||'')) || /tb|tuberc/i.test(String((p.clinical||{}).tbScreen||'')) ));
  },

  /* The patient's dispensing history, newest first. */
  history(patientId){
    tbStore();
    return DB.db.tbDispenses.filter(d=>d.patientId===patientId)
      .sort((a,b)=>String(b.dispensedAt||'').localeCompare(String(a.dispensedAt||'')));
  },

  lastDispense(patientId){ return this.history(patientId)[0] || null; },

  /* When is the next dose due, and what is its status today? */
  nextDue(patientId, supplyId){
    const last = this.lastDispense(patientId);
    const supply = TB_SUPPLY[supplyId|| (last && last.unitId) || 'PYR10'] || TB_PROTOCOL.supplies[0];
    if(!last){
      /* No course given yet: the patient is due now, from enrolment. */
      const p = (DB.db.patients||[]).find(x=>x.id===patientId)||{};
      const from = String(p.enrolledAt||p.intake||'').slice(0,10);
      return { due: from||todayISO().slice(0,10), status:'never-dispensed', daysLeft:0, window:[0,0],
        supply, last:null, reason:'No pyridoxine course has been recorded for this patient yet.' };
    }
    const given = new Date(String(last.dispensedAt||'').slice(0,10));
    const coverDays = Number(last.coverDays)||supply.days;
    const windowStart = new Date(given.getTime() + (TB_PROTOCOL.refillWindow[0]-1)*86400000);
    const windowEnd = new Date(given.getTime() + (TB_PROTOCOL.refillWindow[1]-1)*86400000);
    const exhaust = new Date(given.getTime() + coverDays*86400000);
    const today = new Date(todayISO().slice(0,10));
    const daysToWindow = Math.round((windowStart-today)/86400000);
    const daysToExhaust = Math.round((exhaust-today)/86400000);
    const status = today>windowEnd ? (daysToExhaust < -TB_PROTOCOL.graceDays ? 'missed' : 'overdue')
      : (today>=windowStart ? 'due-now' : 'covered');
    return {
      due: windowStart.toISOString().slice(0,10), dueEnd: windowEnd.toISOString().slice(0,10),
      exhaust: exhaust.toISOString().slice(0,10), status, daysLeft:daysToWindow, daysToExhaust,
      window:[TB_PROTOCOL.refillWindow[0], TB_PROTOCOL.refillWindow[1]], supply, last,
      reason: status==='covered' ? `Covered to ${exhaust.toISOString().slice(0,10)}; give the next course on day ${TB_PROTOCOL.refillWindow[0]} or ${TB_PROTOCOL.refillWindow[1]}.`
        : status==='due-now' ? 'Inside the day 9 to day 10 refill window - dispense now so no dose is missed.'
        : status==='overdue' ? `The cover ran out on ${exhaust.toISOString().slice(0,10)}. Dispense today and record why the window was missed.`
        : `Possible missed dose: the cover ended ${exhaust.toISOString().slice(0,10)} and more than ${TB_PROTOCOL.graceDays} grace days have passed.`
    };
  },

  /* May this request be made? Returns {ok, msg, warnings, tablets, days}. */
  eligibility(user, {patientId, supplyId='PYR10', reason=''}){
    const warnings = [];
    const p = patientId? (DB.db.patients||[]).find(x=>x.id===patientId) : null;
    if(!p) return { ok:false, msg:'Choose a patient.' };
    if(!RBAC.can(user,'tb.request.create',{countyId:p.countyId, areaId:p.areaId}).ok)
      return { ok:false, msg:'Your role may not request TB drugs for this patient.' };
    if(!RBAC.patientVisible(user,p)) return { ok:false, msg:'That patient is outside your ministry area.' };
    const isTb = this.tbPatients(user).some(x=>x.id===p.id) || /tb|tuberc/i.test(String((p.clinical||{}).diagnosis||''));
    if(!isTb) warnings.push('This patient has no confirmed TB record. The case manager will need the clinical basis before approving.');
    const supply = TB_SUPPLY[supplyId];
    if(!supply) return { ok:false, msg:'Choose a supply length.' };
    if(supply.days > TB_PROTOCOL.maxDaysPerRequest) return { ok:false, msg:`A request may not exceed ${TB_PROTOCOL.maxDaysPerRequest} days.` };
    if(supply.needsReason && String(reason||'').trim().length < 12)
      return { ok:false, msg:'A one-month supply needs the clinical reason written out (at least 12 characters).' };
    const nd = this.nextDue(p.id, supplyId);
    if(nd.status==='covered')
      warnings.push(`The patient is still covered to ${nd.exhaust}. The refill window opens on day ${TB_PROTOCOL.refillWindow[0]} (${nd.due}); requesting now is recorded as an early request.`);
    /* an open request for the same patient is a duplicate */
    tbStore();
    const open = DB.db.tbRequests.find(r=>r.patientId===p.id && ['submitted','approved','adjusted'].includes(r.status));
    if(open) return { ok:false, msg:`Request ${open.no} for this patient is already ${open.status}. Answer it before making another.` };
    const onHand = (typeof RX!=='undefined')? RX.stockOnHand(TB_PROTOCOL.drugId, p.countyId) : 0;
    if(onHand < supply.tablets) warnings.push(`Only ${num(onHand)} tablets are on hand in ${countyName(p.countyId)}; Procurement must replenish before dispensing.`);
    return { ok:true, warnings, tablets:supply.tablets, days:supply.days, nextDue:nd, stock:onHand };
  },

  /* A caregiver asks. */
  request(user, {patientId, supplyId='PYR10', reason='', neededBy=''}){
    const el = this.eligibility(user, {patientId, supplyId, reason});
    if(!el.ok) return el;
    const p = (DB.db.patients||[]).find(x=>x.id===patientId);
    tbStore();
    const supply = TB_SUPPLY[supplyId];
    const no = 'TB-'+new Date().getFullYear()+'-'+String(1000+DB.db.tbRequests.length+1);
    const rec = {
      id:uid('tbr'), no, patientId, patientName:p.name, countyId:p.countyId, areaId:p.areaId,
      requestedBy:user.id, requestedByName:user.name, caregiverId:p.caregiverId||user.id,
      drugId:TB_PROTOCOL.drugId, drugName:TB_PROTOCOL.drugName, unitId:supplyId,
      qty:supply.tablets, coverDays:supply.days, supplyLabel:supply.label,
      reason:String(reason||'').slice(0,400), neededBy:String(neededBy||'').slice(0,10),
      status:'submitted', submittedAt:todayISO(),
      nextDue:(el.nextDue||{}).due||'', dueStatus:(el.nextDue||{}).status||'',
      warnings:el.warnings||[], demo:!!p.demo
    };
    DB.db.tbRequests.unshift(rec);
    AUDIT.append({ actor:user.id, action:'tb.request.submitted', entity:'tb_request', entityId:rec.id,
      detail:`${no} · ${p.name} · ${supply.label} (${supply.tablets} tablets, ${supply.days}-day cover)${rec.reason?' · reason: '+rec.reason:''}` });
    /* the case manager is told, in their own console */
    const cms = (DB.db.users||[]).filter(u=>['mcm','nurse','depthead'].includes(u.roleId) && u.status==='active' &&
      (u.countyId===p.countyId || (roleObj(u.roleId)||{scope:{}}).scope?.geo==='global'));
    cms.forEach(c=>notify(c.id, 'TB pyridoxine request '+no, `${user.name} requested ${supply.label} for ${p.name} (${areaName(p.areaId)}). ${rec.reason||''}`, 'warn', 'tbcare'));
    DB.save();
    if(typeof COSTX!=='undefined') COSTX.invalidate();
    return { ok:true, rec, msg:`Request ${no} sent to the Medical Case Manager.`, warnings:el.warnings };
  },

  requests(user, filter={}){
    tbStore();
    if(!RBAC.has(user,'tb.view')) { AUDIT.deny(user,'tb.view',{},'no tb capability'); return []; }
    const role = roleObj(user.roleId)||{scope:{}}; const s = role.scope||{};
    let rows = DB.db.tbRequests.slice();
    if(s.records==='areas' || s.geo==='areas') rows = rows.filter(r=>(user.areaIds||[]).includes(r.areaId));
    else if(s.geo!=='global' && !s.crossCounty) rows = rows.filter(r=>r.countyId===user.countyId);
    if(filter.status) rows = rows.filter(r=>r.status===filter.status);
    if(filter.areaId) rows = rows.filter(r=>r.areaId===filter.areaId);
    if(filter.q){ const q=String(filter.q).toLowerCase(); rows = rows.filter(r=>(r.no+' '+r.patientName+' '+(r.reason||'')).toLowerCase().includes(q)); }
    return rows.sort((a,b)=>String(b.submittedAt||'').localeCompare(String(a.submittedAt||'')));
  },
  /* One request, by id or by number, inside this account's scope. (Named `one`
     so it cannot shadow `request()`, which is the act of asking.) */
  one(user, id){ return this.requests(user).find(r=>r.id===id||r.no===id) || null; },

  /* The case manager answers. Feedback is mandatory on anything but a clean approval. */
  review(user, id, decision, {feedback='', qty=null, supplyId='', declineReason=''}){
    const r = this.requestById(user, id);
    if(!r) return { ok:false, msg:'That request is not in your scope.' };
    if(!RBAC.can(user,'tb.request.review',{countyId:r.countyId, areaId:r.areaId}).ok)
      return { ok:false, msg:'Only the Medical Case Manager, a Nurse / Clinical Officer or the Head of Medical Department may answer a TB drug request.' };
    if(!['submitted','approved','adjusted'].includes(r.status)) return { ok:false, msg:`This request is already ${r.status}.` };
    const text = String(feedback||declineReason||'').trim();
    if(decision==='declined' && text.length<8) return { ok:false, msg:'A refusal must carry a written reason for the caregiver.' };
    const supply = supplyId? TB_SUPPLY[supplyId] : null;
    const tablets = Math.round(Number(qty)|| (supply? supply.tablets : r.qty));
    if(decision==='adjusted' && tablets===r.qty && !supply) return { ok:false, msg:'An adjustment must change the quantity or the supply length, and say why.' };
    if(decision==='adjusted' && text.length<8) return { ok:false, msg:'An adjustment must carry feedback so the caregiver knows what changed.' };
    if(tablets<1 || tablets>TB_PROTOCOL.supplies[TB_PROTOCOL.supplies.length-1].tablets*2)
      return { ok:false, msg:`A quantity between 1 and ${TB_PROTOCOL.supplies[TB_PROTOCOL.supplies.length-1].tablets*2} tablets is allowed.` };
    const before = r.status;
    r.status = decision==='approved'? 'approved' : decision==='adjusted'? 'adjusted' : 'declined';
    r.reviewedBy = user.id; r.reviewedByName = user.name; r.reviewedAt = todayISO();
    r.feedback = text; r.decision = decision;
    if(decision!=='declined'){
      r.qty = tablets;
      if(supply){ r.unitId = supply.id; r.coverDays = supply.days; r.supplyLabel = supply.label; }
      else r.coverDays = Math.max(1, Math.round(tablets));  /* one tablet a day */
    } else { r.declineReason = text; }
    AUDIT.append({ actor:user.id, action:'tb.request.reviewed', entity:'tb_request', entityId:r.id, before, after:r.status,
      detail:`${r.no} · ${r.patientName} · ${decision}${decision==='declined'?'':' · '+r.qty+' tablets / '+r.coverDays+'-day cover'}${text?' · feedback: '+text:''}` });
    notify(r.requestedBy, 'TB request '+r.no+' '+r.status, `${user.name}: ${text||'Approved for dispensing.'}`, decision==='declined'?'crit':'ok', 'tbcare');
    DB.save();
    return { ok:true, rec:r, msg:`${r.no} ${r.status}. ${text?'Feedback sent to the caregiver.':''}` };
  },
  requestById(user, id){
    tbStore();
    const r = DB.db.tbRequests.find(x=>x.id===id||x.no===id);
    if(!r) return null;
    const role = roleObj(user.roleId)||{scope:{}}; const s=role.scope||{};
    if(s.records==='areas' && !(user.areaIds||[]).includes(r.areaId)) return null;
    if(s.geo!=='global' && !s.crossCounty && r.countyId!==user.countyId) return null;
    return r;
  },

  /* Dispense against an approved request: earliest expiry first, batch named. */
  dispense(user, id, {note='', batchId=''}){
    const r = this.requestById(user, id);
    if(!r) return { ok:false, msg:'That request is not in your scope.' };
    if(!RBAC.can(user,'tb.dispense',{countyId:r.countyId, areaId:r.areaId}).ok)
      return { ok:false, msg:'Your role may not dispense TB medication.' };
    if(!['approved','adjusted'].includes(r.status)) return { ok:false, msg:`A ${r.status} request cannot be dispensed. The case manager must approve it first.` };
    if(r.dispensedAt) return { ok:false, msg:`This request was already dispensed on ${fmtDate(r.dispensedAt)}.` };
    const alloc = (typeof RX!=='undefined')? RX.allocate(r.drugId, r.countyId, r.qty) : {picks:[],shortfall:r.qty};
    if(batchId){
      const lot = (DB.db.stockLots||[]).find(l=>l.id===batchId && l.itemId===r.drugId && l.countyId===r.countyId);
      if(lot && lot.qty>=r.qty) { alloc.picks = [{lotId:lot.id, batch:lot.batch, expiry:lot.expiry, qty:r.qty}]; alloc.shortfall = 0; }
    }
    if(alloc.shortfall>0)
      return { ok:false, msg:`Stock shortfall: ${alloc.shortfall} of ${r.qty} tablets are not available in ${countyName(r.countyId)}. Raise a procurement request before dispensing.` };
    /* take the stock */
    alloc.picks.forEach(pk=>{
      const lot = (DB.db.stockLots||[]).find(l=>l.id===pk.lotId);
      if(lot) lot.qty -= pk.qty;
      DB.db.stockMoves.unshift({ id:uid('mv'), countyId:r.countyId, itemId:r.drugId, lotId:pk.lotId, batch:pk.batch,
        qty:-pk.qty, kind:'dispense', at:todayISO(), by:user.id, note:`TB dispensing ${r.no} · ${r.patientName}` });
    });
    const today = todayISO().slice(0,10);
    const nextWindowStart = new Date(new Date(today).getTime() + (TB_PROTOCOL.refillWindow[0]-1)*86400000).toISOString().slice(0,10);
    const nextWindowEnd = new Date(new Date(today).getTime() + (TB_PROTOCOL.refillWindow[1]-1)*86400000).toISOString().slice(0,10);
    const exhaust = new Date(new Date(today).getTime() + r.coverDays*86400000).toISOString().slice(0,10);
    const cost = (typeof COSTX!=='undefined')? COSTX.unitCost(user, r.unitId==='PYR14'?'PYR14':r.unitId==='PYR30'?'PYR30':'PYR10') : 0;
    const disp = {
      id:uid('tbd'), requestId:r.id, no:r.no, patientId:r.patientId, patientName:r.patientName,
      countyId:r.countyId, areaId:r.areaId, drugId:r.drugId, drugName:r.drugName,
      unitId:r.unitId, qty:r.qty, coverDays:r.coverDays, cost,
      dispensedAt:todayISO(), dispensedBy:user.id, dispensedByName:user.name,
      batches:alloc.picks.map(p=>({lotId:p.lotId, batch:p.batch, expiry:p.expiry, qty:p.qty})),
      nextDue:nextWindowStart, nextDueEnd:nextWindowEnd, exhaustsAt:exhaust, note:String(note||'').slice(0,300)
    };
    DB.db.tbDispenses.unshift(disp);
    r.status='dispensed'; r.dispensedAt=disp.dispensedAt; r.dispensedBy=user.id; r.dispenseId=disp.id;
    AUDIT.append({ actor:user.id, action:'tb.dispensed', entity:'tb_dispense', entityId:disp.id,
      detail:`${r.no} · ${r.patientName} · ${r.qty} ${TB_PROTOCOL.drugName} from ${alloc.picks.map(p=>'batch '+p.batch+' ('+p.qty+')').join(', ')} · cover to ${exhaust} · next dose due ${nextWindowStart} to ${nextWindowEnd}` });
    notify(r.requestedBy, 'Dispensed: '+r.no, `${r.qty} tablets for ${r.patientName}. Covered to ${exhaust}; the next course is due between ${nextWindowStart} and ${nextWindowEnd}.`, 'ok', 'tbcare');
    DB.save();
    if(typeof COSTX!=='undefined') COSTX.invalidate();
    return { ok:true, disp, msg:`Dispensed ${r.qty} tablets. Covered to ${fmtDate(exhaust)}; next dose due ${fmtDate(nextWindowStart)} to ${fmtDate(nextWindowEnd)}.` };
  },

  /* ---------------- stock accountability ---------------- */
  /* Procured (received) less dispensed less adjustments = the system balance.
     A physical count is then recorded and confirmed against it. */
  stockPosition(user, drugId=TB_PROTOCOL.drugId, countyId){
    tbStore();
    const cc = countyId || user.countyId;
    const role = roleObj(user.roleId)||{scope:{}}; const s=role.scope||{};
    const counties = (s.geo==='global'||s.crossCounty)? COUNTIES.map(c=>c.id) : [cc];
    return counties.map(c=>{
      const moves = (DB.db.stockMoves||[]).filter(m=>m.countyId===c && m.itemId===drugId);
      const received = moves.filter(m=>m.kind==='receipt').reduce((n,m)=>n+(Number(m.qty)||0),0);
      const dispensed = moves.filter(m=>m.kind==='dispense').reduce((n,m)=>n+Math.abs(Number(m.qty)||0),0);
      const adjusted = moves.filter(m=>m.kind==='adjust').reduce((n,m)=>n+(Number(m.qty)||0),0);
      const lots = (DB.db.stockLots||[]).filter(l=>l.countyId===c && l.itemId===drugId);
      const onHand = lots.filter(l=>l.qty>0).reduce((n,l)=>n+l.qty,0);
      const systemQty = received - dispensed + adjusted;
      const counts = DB.db.tbStockCounts.filter(x=>x.countyId===c && x.drugId===drugId)
        .sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
      const last = counts[0]||null;
      const variance = last? (Number(last.physicalQty)||0) - systemQty : null;
      const tolerance = Math.max(TB_PROTOCOL.varianceFloor, Math.round(systemQty*TB_PROTOCOL.varianceTolerance));
      const unitCost = (typeof COSTX!=='undefined')? COSTX.unitCost(user,'PYR10')/10 : 0;
      return { countyId:c, county:countyName(c), drugId, received, dispensed, adjusted, onHand, systemQty,
        lots:lots.length, batches:lots.filter(l=>l.qty>0).map(l=>({batch:l.batch, expiry:l.expiry, qty:l.qty})),
        lastCount:last, variance, tolerance, withinTolerance: variance===null? null : Math.abs(variance)<=tolerance,
        counts, value:Math.round(onHand*unitCost), reconciled: counts.filter(x=>x.status==='confirmed').length };
    });
  },

  recordCount(user, {countyId='', drugId=TB_PROTOCOL.drugId, physicalQty, batchNotes='', date=''}){
    if(!RBAC.can(user,'tb.stock.count',{countyId:countyId||user.countyId}).ok)
      return { ok:false, msg:'Your role may not record a physical TB stock count.' };
    const n = Math.round(Number(physicalQty));
    if(!(n>=0)) return { ok:false, msg:'Record the number of tablets physically counted.' };
    const cc = countyId || user.countyId;
    tbStore();
    const pos = this.stockPosition(user, drugId, cc)[0] || {};
    const variance = n - (Number(pos.systemQty)||0);
    const tolerance = Math.max(TB_PROTOCOL.varianceFloor, Math.round((Number(pos.systemQty)||0)*TB_PROTOCOL.varianceTolerance));
    const rec = {
      id:uid('tbc'), countyId:cc, drugId, date:String(date||todayISO()).slice(0,10),
      physicalQty:n, systemQty:Number(pos.systemQty)||0, received:pos.received||0, dispensed:pos.dispensed||0,
      variance, tolerance, withinTolerance:Math.abs(variance)<=tolerance,
      countedBy:user.id, countedByName:user.name, batchNotes:String(batchNotes||'').slice(0,400),
      status:'awaiting_confirmation', at:todayISO()
    };
    DB.db.tbStockCounts.unshift(rec);
    AUDIT.append({ actor:user.id, action:'tb.stock.counted', entity:'tb_stock_count', entityId:rec.id,
      detail:`${countyName(cc)} · ${rec.drugId} · physical ${n} against system ${rec.systemQty} · variance ${variance} (tolerance ±${tolerance})` });
    if(!rec.withinTolerance){
      const finding = { id:uid('tbf'), kind:'stock_variance', countyId:cc, drugId, countId:rec.id, variance,
        tolerance, openedAt:todayISO(), status:'open', detail:`Physical count ${n} against a system balance of ${rec.systemQty}: variance ${variance} tablets, outside the ±${tolerance} tolerance.` };
      DB.db.tbFindings.unshift(finding);
      (DB.db.users||[]).filter(u=>['finance','procurement','auditor','countyadmin'].includes(u.roleId) && u.status==='active' &&
        (u.countyId===cc || (roleObj(u.roleId)||{scope:{}}).scope?.geo==='global'))
        .forEach(u=>notify(u.id, 'TB stock variance in '+countyName(cc), finding.detail, 'crit', 'tbcare'));
    }
    (DB.db.users||[]).filter(u=>['finance','procurement','auditor'].includes(u.roleId) && u.status==='active')
      .forEach(u=>notify(u.id, 'TB stock count awaiting confirmation', `${user.name} counted ${n} tablets of ${TB_PROTOCOL.drugName} in ${countyName(cc)}. Confirm it against procurement.`, 'info', 'tbcare'));
    DB.save();
    return { ok:true, rec, msg:`Count recorded: ${n} tablets, variance ${variance} (tolerance ±${tolerance}). ${rec.withinTolerance?'Within tolerance.':'OUTSIDE tolerance - a finding has been opened and Finance and Procurement have been told.'}` };
  },

  confirmCount(user, id, {note='', adjustStock=false}){
    const rec = (DB.db.tbStockCounts||[]).find(x=>x.id===id);
    if(!rec) return { ok:false, msg:'That count is not in your scope.' };
    if(!RBAC.can(user,'tb.stock.reconcile',{countyId:rec.countyId}).ok)
      return { ok:false, msg:'Only Finance, Procurement, Audit or the County Office Administrator may confirm a stock count.' };
    if(rec.status==='confirmed') return { ok:false, msg:'This count has already been confirmed.' };
    rec.status='confirmed'; rec.confirmedBy=user.id; rec.confirmedByName=user.name; rec.confirmedAt=todayISO();
    rec.confirmNote=String(note||'').slice(0,400);
    if(adjustStock && rec.variance!==0){
      /* write the variance into the stock ledger so the system balance matches
         the shelf, with the reason on the line - never silently. */
      const lots = (DB.db.stockLots||[]).filter(l=>l.countyId===rec.countyId && l.itemId===rec.drugId).sort((a,b)=>new Date(b.expiry)-new Date(a.expiry));
      let left = Math.abs(rec.variance);
      if(rec.variance<0){
        for(const l of lots){ if(left<=0) break; const take=Math.min(left,l.qty); if(take>0){ l.qty-=take; left-=take;
          DB.db.stockMoves.unshift({ id:uid('mv'), countyId:rec.countyId, itemId:rec.drugId, lotId:l.id, batch:l.batch, qty:-take, kind:'adjust', at:todayISO(), by:user.id, note:'Physical count reconciliation: '+String(note||'variance') }); } }
      } else {
        const lot = lots[0];
        if(lot){ lot.qty += rec.variance;
          DB.db.stockMoves.unshift({ id:uid('mv'), countyId:rec.countyId, itemId:rec.drugId, lotId:lot.id, batch:lot.batch, qty:rec.variance, kind:'adjust', at:todayISO(), by:user.id, note:'Physical count reconciliation: '+String(note||'variance') }); }
      }
      rec.stockAdjusted = true;
    }
    const finding = (DB.db.tbFindings||[]).find(f=>f.countId===rec.id && f.status==='open');
    if(finding){ finding.status='closed'; finding.closedAt=todayISO(); finding.closedBy=user.id; finding.resolution=String(note||'Confirmed and reconciled.').slice(0,300); }
    AUDIT.append({ actor:user.id, action:'tb.stock.reconciled', entity:'tb_stock_count', entityId:rec.id,
      detail:`${countyName(rec.countyId)} · physical ${rec.physicalQty} vs system ${rec.systemQty} · variance ${rec.variance} · ${adjustStock?'stock adjusted to match the shelf':'stock not adjusted'}${note?' · '+note:''}` });
    DB.save();
    if(typeof COSTX!=='undefined') COSTX.invalidate();
    return { ok:true, rec, msg:`Count confirmed. ${adjustStock?'The stock ledger now matches the shelf.':'The variance is recorded and the stock ledger is unchanged.'}` };
  },

  /* ---------------- the board ---------------- */
  board(user){
    const patients = this.tbPatients(user);
    const dueNow=[], overdue=[], missed=[], covered=[], neverDispensed=[];
    patients.forEach(p=>{
      const nd = this.nextDue(p.id);
      const row = { patient:p, ...nd };
      if(nd.status==='due-now') dueNow.push(row);
      else if(nd.status==='overdue') overdue.push(row);
      else if(nd.status==='missed') missed.push(row);
      else if(nd.status==='never-dispensed') neverDispensed.push(row);
      else covered.push(row);
    });
    const reqs = this.requests(user);
    const pending = reqs.filter(r=>r.status==='submitted');
    const approved = reqs.filter(r=>['approved','adjusted'].includes(r.status) && !r.dispensedAt);
    const pos = this.stockPosition(user);
    const findings = (DB.db.tbFindings||[]).filter(f=>f.status==='open' &&
      ((roleObj(user.roleId)||{scope:{}}).scope?.geo==='global' || f.countyId===user.countyId));
    return { patients, dueNow, overdue, missed, covered, neverDispensed, pending, approved, requests:reqs, stock:pos, findings,
      dispensed30: (DB.db.tbDispenses||[]).filter(d=> new Date(todayISO())-new Date(String(d.dispensedAt).slice(0,10)) < 30*86400000) };
  },

  /* ---------------- panels ---------------- */
  patientPanel(user, p){
    if(!p || !RBAC.has(user,'tb.view')) return '';
    const isTb = /tb|tuberc/i.test(String((p.clinical||{}).diagnosis||'')) || (DB.db.patientConditions||[]).some(c=>c.patientId===p.id && /tb|tuberc/i.test(String(c.label||'')));
    if(!isTb && !RBAC.has(user,'tb.request.create')) return '';
    const nd = this.nextDue(p.id);
    const hist = this.history(p.id).slice(0,6);
    const tone = nd.status==='covered'? 'b-ok' : nd.status==='due-now'? 'b-warn' : 'b-crit';
    return card('TB dispensing control · pyridoxine', `
      <div class="tb-dose">
        <div class="tb-d">
          <span class="tb-l">Status</span>
          ${badge(nd.status==='covered'?'Covered':nd.status==='due-now'?'Due now (day 9-10 window)':nd.status==='overdue'?'Cover ended':'Possible missed dose', tone)}
        </div>
        <div class="tb-d"><span class="tb-l">Last course</span><b>${nd.last? esc(fmtDate(nd.last.dispensedAt))+' · '+num(nd.last.qty)+' tablets' : 'None recorded'}</b></div>
        <div class="tb-d"><span class="tb-l">Cover to</span><b>${nd.last? esc(fmtDate(nd.exhaust)) : '-'}</b></div>
        <div class="tb-d"><span class="tb-l">Next dose due</span><b>${nd.last? esc(fmtDate(nd.due))+' to '+esc(fmtDate(nd.dueEnd)) : 'Now - enrol and dispense'}</b></div>
      </div>
      <p class="small muted" style="margin-top:8px">${ic('info',13)} ${esc(nd.reason)}</p>
      ${hist.length? `<div style="margin-top:10px">${table([
        {label:'Dispensed',render:d=>esc(fmtDate(d.dispensedAt))},
        {label:'Supply',render:d=>esc(TB_SUPPLY[d.unitId]?TB_SUPPLY[d.unitId].label:d.unitId)},
        {label:'Tablets',cls:'num',render:d=>num(d.qty)},
        {label:'Cover',cls:'num',render:d=>num(d.coverDays)+' days'},
        {label:'Batch',render:d=>esc((d.batches||[]).map(b=>b.batch+' ('+b.qty+')').join(', ')||'-')},
        {label:'By',render:d=>esc(d.dispensedByName||userName(d.dispensedBy))}
      ], hist)}</div>` : ''}
      ${RBAC.has(user,'tb.request.create')? `<div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap">
        <button class="btn btn-sm btn-primary" data-act="tb-request-open" data-p="${esc(p.id)}">${ic('plus',14)} Request pyridoxine</button>
        <button class="btn btn-sm btn-ghost" data-act="go" data-v="tbcare" data-tab="schedule">${ic('calendar',14)} Dispensing schedule</button></div>`:''}`,
      { sub:'One dose course sorts the patient for ten days; the next course is given on day 9 or day 10 so no dose is missed.' });
  },

  /* ---------------- console ---------------- */
  render(user, params={}){
    if(!RBAC.has(user,'tb.view')) return deniedPanel('tb.view');
    Object.keys(params||{}).forEach(k=>{ if(k in TB_STATE && params[k]!==undefined) TB_STATE[k]=params[k]; });
    const st = TB_STATE;
    const b = this.board(user);
    const canReview = RBAC.has(user,'tb.request.review');
    const canDispense = RBAC.has(user,'tb.dispense');
    const canCount = RBAC.has(user,'tb.stock.count');
    const canReconcile = RBAC.has(user,'tb.stock.reconcile');
    const canRequest = RBAC.has(user,'tb.request.create');
    const colours = chartColours(8);
    const tabs = [['board','Control board'],['requests','Requests & feedback'],['schedule','Dispensing schedule'],
      ['stock','Stock & counts'],['reconcile','Procurement & reconciliation'],['protocol','Protocol & rules']];
    const reqs = this.requests(user, {status:st.status, areaId:st.areaId, q:st.q});

    const head = pageHead('TB dispensing control',
      'Pyridoxine for every TB patient: the caregiver asks, the case manager answers, the pharmacy dispenses on day 9 or 10, and every tablet reconciles against what was procured.',
      `${canRequest?`<button class="btn btn-sm btn-primary" data-act="tb-request-open">${ic('plus',15)} Request pyridoxine</button>`:''}
       ${canCount?`<button class="btn btn-sm btn-ghost" data-act="tb-count-open">${ic('clipboard',15)} Record stock count</button>`:''}
       <button class="btn btn-sm btn-ghost" data-act="do-print">${ic('file',15)} Print</button>`)
    + `<div class="tabs cost-tabs">${tabs.map(([id,label])=>`<button class="tab ${st.tab===id?'active':''}" data-act="tb-tab" data-tab="${id}">${esc(label)}</button>`).join('')}</div>`;

    let body='';
    if(st.tab==='board'){
      body = `<div class="grid g4" style="margin:16px 0">
          ${kpi('TB patients in scope', num(b.patients.length), 'Confirmed TB register', 'info', 'users')}
          ${kpi('Due in the day 9-10 window', num(b.dueNow.length), 'Dispense now so no dose is missed', b.dueNow.length?'warn':'ok', 'clock')}
          ${kpi('Cover ended / missed', num(b.overdue.length + b.missed.length), `${num(b.overdue.length)} overdue · ${num(b.missed.length)} possible missed dose`, (b.overdue.length+b.missed.length)?'crit':'ok', 'alert')}
          ${kpi('Requests awaiting the case manager', num(b.pending.length), `${num(b.approved.length)} approved and ready to dispense`, b.pending.length?'warn':'ok', 'send')}
        </div>`
      + (b.findings.length? alertBox('crit','Open stock variance finding', `<span class="small">${b.findings.map(f=>esc(f.detail)).join('<br>')}</span>`) : '')
      + `<div class="grid g2">
          ${card('Stock position · '+TB_PROTOCOL.drugName, table([
            {label:'County office',render:s=>esc(s.county)},
            {label:'Procured',cls:'num',render:s=>num(s.received)},
            {label:'Dispensed',cls:'num',render:s=>num(s.dispensed)},
            {label:'System balance',cls:'num',render:s=>`<b>${num(s.systemQty)}</b>`},
            {label:'On shelf',cls:'num',render:s=>num(s.onHand)},
            {label:'Last count',render:s=>s.lastCount? `${esc(fmtDate(s.lastCount.date))} ${badge(s.lastCount.status==='confirmed'?'Confirmed':'Awaiting confirmation', s.lastCount.status==='confirmed'?'b-ok':'b-warn')}` : '<span class="xs muted">Never counted</span>'},
            {label:'Variance',cls:'num',render:s=>s.variance===null? '<span class="xs muted">-</span>' : `${s.variance>0?'+':''}${num(s.variance)} ${s.withinTolerance?badge('within ±'+s.tolerance,'b-ok'):badge('outside ±'+s.tolerance,'b-crit')}`}
          ], b.stock), {foot:'<span>Procured less dispensed plus adjustments is the system balance; the physical count confirms it.</span>'})}
          ${card('Dispensing rhythm (last 30 days)', chartLine({
            labels:(()=>{ const out=[]; for(let i=29;i>=0;i-=3){ const d=new Date(Date.now()-i*86400000); out.push(d.toISOString().slice(5,10)); } return out; })(),
            series:[{label:'Tablets dispensed', values:(()=>{ const out=[]; for(let i=29;i>=0;i-=3){
                const from=new Date(Date.now()-(i+3)*86400000), to=new Date(Date.now()-i*86400000);
                out.push(b.dispensed30.filter(d=>{const t=new Date(String(d.dispensedAt).slice(0,10)); return t>from&&t<=to;}).reduce((n,d)=>n+(Number(d.qty)||0),0)); } return out; })(), color:colours[0]}],
            title:'Pyridoxine dispensed', height:200, values:false, unit:'tablets'}),
            {sub:'A flat line means patients are running out of cover: the day 9 to day 10 window is not being met.'})}
        </div>`
      + `<div style="margin-top:16px">${card('Patients due now, overdue or missed', b.dueNow.length+b.overdue.length+b.missed.length? table([
          {label:'Patient',render:r=>`<button class="linkbtn cellname" data-act="go" data-v="patient" data-id="${esc(r.patient.id)}">${esc(r.patient.name)}</button><div class="xs muted mono">${esc(r.patient.code)}</div>`},
          {label:'Ministry area',render:r=>esc(areaName(r.patient.areaId))},
          {label:'Last course',render:r=>r.last? `${esc(fmtDate(r.last.dispensedAt))}<div class="xs muted">${num(r.last.qty)} tablets · ${num(r.last.coverDays)}-day cover</div>` : '<span class="xs muted">Never dispensed</span>'},
          {label:'Cover to',render:r=>r.last? esc(fmtDate(r.exhaust)) : '-'},
          {label:'Next dose window',render:r=>r.last? `${esc(fmtDate(r.due))} - ${esc(fmtDate(r.dueEnd))}` : 'Now'},
          {label:'Status',render:r=>badge(r.status==='due-now'?'Due now':r.status==='overdue'?'Overdue':'Missed dose', r.status==='due-now'?'b-warn':'b-crit')},
          {label:'',cls:'act',render:r=>canRequest? `<button class="btn btn-xs btn-primary" data-act="tb-request-open" data-p="${esc(r.patient.id)}">${ic('plus',13)} Request</button>`:''}
        ], [...b.missed, ...b.overdue, ...b.dueNow]) : emptyState('Every TB patient is covered','Nobody is inside the day 9 to day 10 refill window today. The next window appears here automatically.','shieldcheck'),
        {foot:'<span>Cover is calculated from the dispensing record, never typed in.</span>'})}</div>`
      + `<div style="margin-top:16px">${card('Never dispensed', b.neverDispensed.length? table([
          {label:'Patient',render:r=>`<button class="linkbtn cellname" data-act="go" data-v="patient" data-id="${esc(r.patient.id)}">${esc(r.patient.name)}</button>`},
          {label:'Ministry area',render:r=>esc(areaName(r.patient.areaId))},
          {label:'Enrolled',render:r=>esc(fmtDate(r.patient.enrolledAt||r.patient.intake))},
          {label:'',cls:'act',render:r=>canRequest?`<button class="btn btn-xs btn-primary" data-act="tb-request-open" data-p="${esc(r.patient.id)}">${ic('plus',13)} Request first course</button>`:''}
        ], b.neverDispensed) : emptyState('Every TB patient has a first course','A patient enrolled today is given pyridoxine today and is then sorted for ten days.','check'))}</div>`;
    }

    if(st.tab==='requests'){
      body = `<form data-form="tb-filter" class="cost-filter" style="margin:16px 0">
          <div class="field"><label>Status</label><select class="input" name="status">
            <option value="">All</option>${['submitted','approved','adjusted','declined','dispensed','closed'].map(x=>`<option value="${x}" ${st.status===x?'selected':''}>${esc(titleCase(x))}</option>`).join('')}</select></div>
          <div class="field"><label>Ministry area</label><select class="input" name="areaId"><option value="">All areas</option>
            ${COUNTIES.flatMap(c=>c.areas).map(a=>`<option value="${a.id}" ${st.areaId===a.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select></div>
          <div class="field"><label>Search</label><input class="input" name="q" value="${esc(st.q)}" placeholder="Request no, patient or reason"></div>
          <div class="cf-act"><button class="btn btn-primary btn-sm" type="submit">${ic('filter',14)} Apply</button></div>
        </form>`
      + card('Requests and case manager feedback', table([
          {label:'Request',render:r=>`<div class="cellname mono">${esc(r.no)}</div><div class="xs muted">${esc(fmtDateTime(r.submittedAt))}</div>`},
          {label:'Patient',render:r=>`<button class="linkbtn cellname" data-act="go" data-v="patient" data-id="${esc(r.patientId)}">${esc(r.patientName)}</button><div class="xs muted">${esc(areaName(r.areaId))}</div>`},
          {label:'Requested by',render:r=>`${esc(r.requestedByName||userName(r.requestedBy))}<div class="xs muted">${esc(r.supplyLabel||'')}</div>`},
          {label:'Qty',cls:'num',render:r=>`${num(r.qty)} tab<div class="xs muted">${num(r.coverDays)}-day cover</div>`},
          {label:'Reason',render:r=>`<span class="xs">${esc(r.reason||'Not given')}</span>`},
          {label:'Status',render:r=>badge(titleCase(r.status), r.status==='submitted'?'b-warn':r.status==='declined'?'b-crit':r.status==='dispensed'?'b-ok':'b-info')},
          {label:'Case manager feedback',render:r=>r.feedback? `<span class="xs">${esc(r.feedback)}</span><div class="xs muted">${esc(r.reviewedByName||userName(r.reviewedBy)||'')} · ${esc(fmtDate(r.reviewedAt))}</div>` : '<span class="xs muted">Awaiting the case manager</span>'},
          {label:'',cls:'act',render:r=>{
            const btns=[];
            if(canReview && ['submitted','approved','adjusted'].includes(r.status)) btns.push(`<button class="btn btn-xs btn-primary" data-act="tb-review-open" data-id="${esc(r.id)}">${ic('check',13)} Answer</button>`);
            if(canDispense && ['approved','adjusted'].includes(r.status) && !r.dispensedAt) btns.push(`<button class="btn btn-xs btn-soft" data-act="tb-dispense-open" data-id="${esc(r.id)}">${ic('package',13)} Dispense</button>`);
            if(!btns.length && r.dispensedAt) btns.push(`<span class="xs muted">Dispensed ${esc(fmtDate(r.dispensedAt))}</span>`);
            return btns.join(' ');
          }}
        ], reqs, {emptyMsg:'No TB drug requests in scope. A caregiver raises one from the ministry console or from a patient record.'}),
        {foot:'<span>A refusal or an adjustment always carries written feedback, and the caregiver is notified.</span>'});
    }

    if(st.tab==='schedule'){
      const rows = b.patients.map(p=>({patient:p, nd:this.nextDue(p.id)}));
      const buckets = [
        {label:'Dispense today (day 9-10 window)', rows:rows.filter(r=>r.nd.status==='due-now'), tone:'b-warn'},
        {label:'Cover ended - dispense and record why', rows:rows.filter(r=>r.nd.status==='overdue'), tone:'b-crit'},
        {label:'Possible missed dose - case manager review', rows:rows.filter(r=>r.nd.status==='missed'), tone:'b-crit'},
        {label:'No course recorded yet', rows:rows.filter(r=>r.nd.status==='never-dispensed'), tone:'b-info'},
        {label:'Covered - no action', rows:rows.filter(r=>r.nd.status==='covered'), tone:'b-ok'}
      ];
      body = buckets.map(bk=>`<div style="margin-top:16px">${card(bk.label+' · '+num(bk.rows.length), bk.rows.length? table([
          {label:'Patient',render:r=>`<button class="linkbtn cellname" data-act="go" data-v="patient" data-id="${esc(r.patient.id)}">${esc(r.patient.name)}</button><div class="xs muted mono">${esc(r.patient.code)}</div>`},
          {label:'Ministry area',render:r=>esc(areaName(r.patient.areaId))},
          {label:'Coordinator',render:r=>{ const t=(typeof TEAMX!=='undefined')?TEAMX.byArea(r.patient.areaId):null; return t? esc(TEAMX.nameOf(t.coordinator)) : '<span class="xs muted">-</span>'; }},
          {label:'Visit day',render:r=>{ const t=(typeof TEAMX!=='undefined')?TEAMX.byArea(r.patient.areaId):null;
            return t&&t.visitDays.length? esc(t.visitDays.map(d=>DAY_SHORT[d]).join(', ')) : '<span class="xs muted">To be fixed</span>'; }},
          {label:'Last course',render:r=>r.nd.last? esc(fmtDate(r.nd.last.dispensedAt)) : '-'},
          {label:'Cover to',cls:'num',render:r=>r.nd.last? esc(fmtDate(r.nd.exhaust)) : '-'},
          {label:'Next window',render:r=>r.nd.last? `${esc(fmtDate(r.nd.due))} - ${esc(fmtDate(r.nd.dueEnd))}` : 'Now'},
          {label:'Status',render:r=>badge(r.nd.status==='covered'?'Covered':r.nd.status==='due-now'?'Due now':r.nd.status==='overdue'?'Overdue':r.nd.status==='missed'?'Missed':'Not started', bk.tone)},
          {label:'',cls:'act',render:r=>canRequest?`<button class="btn btn-xs btn-ghost" data-act="tb-request-open" data-p="${esc(r.patient.id)}">${ic('plus',13)} Request</button>`:''}
        ], bk.rows) : emptyState('None','Nobody is in this bucket today.','check'))}</div>`).join('')
      + `<div style="margin-top:16px">${card('Where the ten-day rule comes from', note('A patient enrolled today and given pyridoxine today is sorted for the next ten days. The next course is therefore given on day 9 or day 10, so that no dose is missed. A two-week or one-month supply may be requested where the household is far from the dispensing point; a one-month supply needs the case manager\u2019s written clinical reason.','info'))}</div>`;
    }

    if(st.tab==='stock'){
      body = b.stock.map(s=>`<div style="margin-top:16px">${card(s.county+' · '+TB_PROTOCOL.drugName, `
        <div class="grid g4">
          ${kpi('Procured', num(s.received), 'Every receipt in the stock ledger', 'info', 'package')}
          ${kpi('Dispensed', num(s.dispensed), 'Against approved requests only', 'ok', 'send')}
          ${kpi('System balance', num(s.systemQty), 'Procured - dispensed + adjustments', 'warn', 'database')}
          ${kpi('Value on shelf', money(s.value), `${num(s.onHand)} tablets in ${num(s.batches.length)} open batch(es)`, 'ok', 'wallet')}
        </div>
        <div class="grid g2" style="margin-top:14px">
          <div>${chartShare([
            {label:'Dispensed', value:s.dispensed, color:colours[3]},
            {label:'On shelf', value:Math.max(0,s.onHand), color:colours[0]},
            {label:'Unexplained variance', value:Math.max(0,Math.abs(s.variance||0)), color:colours[5]}
          ], {title:'Where the procured stock is', fmt:v=>num(v)+' tablets'})}</div>
          <div>${table([
            {label:'Batch',render:x=>`<span class="mono">${esc(x.batch)}</span>`},
            {label:'Expiry',render:x=>esc(fmtDate(x.expiry))},
            {label:'Tablets',cls:'num',render:x=>num(x.qty)},
            {label:'FEFO order',cls:'num',render:(x,i)=>'#'+(i+1)}
          ], s.batches, {emptyMsg:'No open batches.'})}</div>
        </div>
        <div style="margin-top:14px">${table([
          {label:'Count date',render:c=>esc(fmtDate(c.date))},
          {label:'Counted by',render:c=>esc(c.countedByName||userName(c.countedBy))},
          {label:'Physical',cls:'num',render:c=>num(c.physicalQty)},
          {label:'System',cls:'num',render:c=>num(c.systemQty)},
          {label:'Variance',cls:'num',render:c=>`${c.variance>0?'+':''}${num(c.variance)}`},
          {label:'Tolerance',cls:'num',render:c=>'±'+num(c.tolerance)},
          {label:'Status',render:c=>badge(c.status==='confirmed'?'Confirmed':'Awaiting confirmation', c.status==='confirmed'?'b-ok':'b-warn')},
          {label:'Confirmed by',render:c=>c.confirmedByName? `${esc(c.confirmedByName)}<div class="xs muted">${esc(fmtDate(c.confirmedAt))}</div>` : '<span class="xs muted">-</span>'},
          {label:'',cls:'act',render:c=>canReconcile && c.status!=='confirmed'? `<button class="btn btn-xs btn-primary" data-act="tb-confirm-open" data-id="${esc(c.id)}">${ic('check',13)} Confirm</button>` : ''}
        ], s.counts, {emptyMsg:'No physical count recorded yet. A count is the only thing that proves the shelf matches the ledger.'})}</div>`,
        { actions: canCount? `<button class="btn btn-xs btn-primary" data-act="tb-count-open" data-county="${esc(s.countyId)}">${ic('clipboard',14)} Record count</button>`:'' })}</div>`).join('')
      + `<div style="margin-top:16px">${card('Accountability chain', `<ol class="rule-steps">
          <li><b>Procured</b> - Procurement receives a batch: quantity, batch number, expiry, supplier and unit cost go into the stock ledger.</li>
          <li><b>Requested</b> - a caregiver asks for a supply length for a named TB patient.</li>
          <li><b>Answered</b> - the Medical Case Manager approves, adjusts or refuses, with written feedback.</li>
          <li><b>Dispensed</b> - tablets leave a named batch, earliest expiry first, and the next window is calculated.</li>
          <li><b>Counted</b> - the shelf is physically counted and the variance against the system balance is written down.</li>
          <li><b>Confirmed</b> - Finance or Procurement confirms the count against what was bought; a variance outside tolerance opens a finding.</li>
        </ol>`)}</div>`;
    }

    if(st.tab==='reconcile'){
      if(!RBAC.has(user,'finance.view') && !RBAC.has(user,'procurement.view') && !RBAC.has(user,'audit.view') && !RBAC.has(user,'tb.stock.reconcile'))
        return head + deniedPanel('tb.stock.reconcile');
      const totals = b.stock.reduce((a,s)=>({received:a.received+s.received, dispensed:a.dispensed+s.dispensed, onHand:a.onHand+s.onHand, systemQty:a.systemQty+s.systemQty, value:a.value+s.value}), {received:0,dispensed:0,onHand:0,systemQty:0,value:0});
      body = `<div class="grid g4" style="margin:16px 0">
          ${kpi('Total procured', num(totals.received)+' tablets', 'All counties in your reach', 'info', 'package')}
          ${kpi('Total dispensed', num(totals.dispensed)+' tablets', 'Against approved requests', 'ok', 'send')}
          ${kpi('System balance', num(totals.systemQty)+' tablets', 'What the ledger says is on the shelf', 'warn', 'database')}
          ${kpi('Value', money(totals.value), 'At the current unit cost standard', 'ok', 'wallet')}
        </div>`
      + card('Procurement against dispensing', chartGrouped({
          labels:b.stock.map(s=>s.county.replace(' County Office','')),
          series:[{label:'Procured', values:b.stock.map(s=>s.received), color:colours[0]},
                  {label:'Dispensed', values:b.stock.map(s=>s.dispensed), color:colours[3]},
                  {label:'System balance', values:b.stock.map(s=>s.systemQty), color:colours[1]}],
          title:'Procured vs dispensed vs balance', labelHead:'County office', fmt:v=>num(v)}))
      + `<div style="margin-top:16px">${card('Reconciliation table', table([
          {label:'County office',render:s=>esc(s.county)},
          {label:'Procured',cls:'num',render:s=>num(s.received)},
          {label:'Dispensed',cls:'num',render:s=>num(s.dispensed)},
          {label:'Adjustments',cls:'num',render:s=>(s.adjusted>0?'+':'')+num(s.adjusted)},
          {label:'System balance',cls:'num',render:s=>`<b>${num(s.systemQty)}</b>`},
          {label:'Last physical count',cls:'num',render:s=>s.lastCount? num(s.lastCount.physicalQty) : '-'},
          {label:'Variance',cls:'num',render:s=>s.variance===null?'-':`${s.variance>0?'+':''}${num(s.variance)}`},
          {label:'Tolerance',cls:'num',render:s=>'±'+num(s.tolerance)},
          {label:'Result',render:s=>s.variance===null? badge('Not counted','b-warn') : (s.withinTolerance? badge('Reconciled','b-ok') : badge('Finding open','b-crit'))},
          {label:'Value on shelf',cls:'num',render:s=>money(s.value)}
        ], b.stock), {foot:'<span>Tolerance is the greater of '+TB_PROTOCOL.varianceFloor+' tablets or '+Math.round(TB_PROTOCOL.varianceTolerance*100)+'% of the system balance.</span>'})}</div>`
      + `<div style="margin-top:16px">${card('Open findings', (DB.db.tbFindings||[]).filter(f=>f.status==='open').length? table([
          {label:'Opened',render:f=>esc(fmtDate(f.openedAt))},
          {label:'County',render:f=>esc(countyName(f.countyId))},
          {label:'Variance',cls:'num',render:f=>(f.variance>0?'+':'')+num(f.variance)+' tablets'},
          {label:'Detail',render:f=>`<span class="xs">${esc(f.detail)}</span>`},
          {label:'Status',render:f=>badge('Open','b-crit')}
        ], (DB.db.tbFindings||[]).filter(f=>f.status==='open')) : emptyState('No open findings','Every physical count is within tolerance of what was procured.','shieldcheck'))}</div>`;
    }

    if(st.tab==='protocol'){
      body = `<div class="grid g2" style="margin:16px 0">
        ${card('Supply lengths that may be requested', table([
          {label:'Supply',render:s=>`<div class="cellname">${esc(s.label)}</div><div class="xs muted">${esc(s.note)}</div>`},
          {label:'Tablets',cls:'num',render:s=>num(s.tablets)},
          {label:'Cover',cls:'num',render:s=>num(s.days)+' days'},
          {label:'Refill window',render:s=>`day ${TB_PROTOCOL.refillWindow[0]} to ${TB_PROTOCOL.refillWindow[1]}`},
          {label:'Approval',render:s=>s.needsReason? badge('Case manager + written reason','b-warn') : badge('Case manager','b-info')}
        ], TB_PROTOCOL.supplies))}
        ${card('The rules in force', `<ol class="rule-steps">${TB_PROTOCOL.rules.map(r=>`<li class="small">${esc(r)}</li>`).join('')}</ol>
          <div style="margin-top:12px">${note('Pyridoxine prevents peripheral neuropathy in every patient on isoniazid-containing anti-TB therapy. The system does not decide the medicine; it accounts for it.','shield')}</div>`)}
      </div>`
      + card('Dose arithmetic, worked', `<div class="tbl-wrap"><table class="tbl align-sym">
          <thead><tr><th>Day</th><th>What happens</th><th class="num">Tablets left</th><th>Status in the system</th></tr></thead>
          <tbody>${[0,1,5,8,9,10,11,13].map(d=>`<tr>
            <td class="mono">Day ${d}</td>
            <td>${d===0?'Enrolled and given a 10-day course':d===8?'Last day before the refill window opens':d===9?'Refill window opens - dispense so no dose is missed':d===10?'Refill window closes':d===11?'Cover has ended':'Course running'}</td>
            <td class="num">${Math.max(0,10-d)}</td>
            <td>${badge(d<9?'Covered':d<=10?'Due now':d<=13?'Overdue':'Missed dose', d<9?'b-ok':d<=10?'b-warn':'b-crit')}</td></tr>`).join('')}</tbody></table></div>`,
        {foot:'<span>The window is calculated from the dispensing record, so it moves with the patient and never has to be typed.</span>'});
    }

    return head + body;
  }
};

/* ---------------- 4. Actions & forms ---------------- */
function tbPatientOptions(user, selected){
  const list = TBCARE.tbPatients(user);
  const others = RBAC.has(user,'patient.list')? repo.patientList(user).filter(p=>!list.some(x=>x.id===p.id)).slice(0,200) : [];
  return (list.length? `<optgroup label="Confirmed TB patients">${list.map(p=>`<option value="${p.id}" ${selected===p.id?'selected':''}>${esc(p.name)} · ${esc(p.code)} · ${esc(areaName(p.areaId))}</option>`).join('')}</optgroup>`:'')
    + (others.length? `<optgroup label="Other patients in scope (TB not yet confirmed)">${others.map(p=>`<option value="${p.id}" ${selected===p.id?'selected':''}>${esc(p.name)} · ${esc(p.code)}</option>`).join('')}</optgroup>`:'');
}

Object.assign(ACTIONS, {
  'tb-tab': d => { TB_STATE.tab = d.tab||'board'; render(); },
  'tb-request-open': d => {
    const pid = d.p||'';
    const p = pid? repo.patient(AUTH.user, pid) : null;
    openModal({ title:'Request pyridoxine for a TB patient', sub:'The Medical Case Manager answers every request with written feedback.',
      body:`<form data-form="tb-request" id="tb-request-form">
        <div class="field"><label>Patient</label><select class="input" name="patientId" required>${tbPatientOptions(AUTH.user, pid)}${p?'':'<option value="">Choose a patient</option>'}</select></div>
        <div class="field"><label>Supply length</label><select class="input" name="supplyId">${TB_PROTOCOL.supplies.map(s=>`<option value="${s.id}">${esc(s.label)} - ${s.tablets} tablets, ${s.days}-day cover</option>`).join('')}</select>
          <div class="hint">One course sorts the patient for ten days; the next is due on day 9 or day 10.</div></div>
        <div class="field"><label>Needed by</label><input class="input" type="date" name="neededBy"></div>
        <div class="field"><label>Reason / clinical note</label><textarea class="input" name="reason" rows="3" placeholder="Household distance, travel, default risk, or why a longer supply is needed"></textarea>
          <div class="hint">Required for a one-month supply. Everything written here reaches the case manager.</div></div>
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" data-act="tb-request-submit">${ic('send',15)} Send to the case manager</button>` });
  },
  'tb-request-submit': () => {
    const f = $('#tb-request-form'); if(!f) return;
    const d = new FormData(f);
    const r = TBCARE.request(AUTH.user, { patientId:String(d.get('patientId')||''), supplyId:String(d.get('supplyId')||'PYR10'),
      reason:String(d.get('reason')||''), neededBy:String(d.get('neededBy')||'') });
    if(!r.ok) return toast('Request not sent', r.msg, 'err');
    closeModal(true); toast('Request sent', r.msg, 'ok'); render();
  },
  'tb-review-open': d => {
    const r = TBCARE.requestById(AUTH.user, d.id); if(!r) return toast('Not found','That request is not in your scope.','err');
    const nd = TBCARE.nextDue(r.patientId);
    openModal({ title:'Answer TB request '+r.no, sub:r.patientName+' · '+areaName(r.areaId),
      body:`<div class="tb-review">
        <div class="grid g2">
          <div class="kv"><span>Requested by</span><b>${esc(r.requestedByName||userName(r.requestedBy))}</b></div>
          <div class="kv"><span>Submitted</span><b>${esc(fmtDateTime(r.submittedAt))}</b></div>
          <div class="kv"><span>Supply asked for</span><b>${esc(r.supplyLabel||'')} · ${num(r.qty)} tablets</b></div>
          <div class="kv"><span>Cover</span><b>${num(r.coverDays)} days</b></div>
          <div class="kv"><span>Last course</span><b>${nd.last? esc(fmtDate(nd.last.dispensedAt)) : 'None recorded'}</b></div>
          <div class="kv"><span>Next window</span><b>${nd.last? esc(fmtDate(nd.due))+' to '+esc(fmtDate(nd.dueEnd)) : 'Now'}</b></div>
        </div>
        <p class="small" style="margin-top:10px"><b>Reason given:</b> ${esc(r.reason||'None')}</p>
        ${(r.warnings||[]).length? alertBox('warn','Recorded at the time of the request', `<span class="small">${r.warnings.map(esc).join('<br>')}</span>`):''}
        ${note(esc(nd.reason),'info')}
        <form data-form="tb-review" id="tb-review-form" style="margin-top:12px">
          <input type="hidden" name="id" value="${esc(r.id)}">
          <div class="field"><label>Decision</label><select class="input" name="decision">
            <option value="approved">Approve as requested (${num(r.qty)} tablets, ${num(r.coverDays)}-day cover)</option>
            <option value="adjusted">Approve with an adjustment</option>
            <option value="declined">Refuse, with a reason</option></select></div>
          <div class="grid g2">
            <div class="field"><label>Supply length if adjusted</label><select class="input" name="supplyId">
              <option value="">Keep as requested</option>${TB_PROTOCOL.supplies.map(s=>`<option value="${s.id}">${esc(s.label)}</option>`).join('')}</select></div>
            <div class="field"><label>Tablets if adjusted</label><input class="input" type="number" name="qty" min="1" max="60" placeholder="${num(r.qty)}"></div>
          </div>
          <div class="field"><label>Feedback to the caregiver</label><textarea class="input" name="feedback" rows="3" required placeholder="What you decided and why. Mandatory on an adjustment or a refusal."></textarea></div>
        </form></div>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" data-act="tb-review-submit">${ic('check',15)} Record the decision</button>` });
  },
  'tb-review-submit': () => {
    const f = $('#tb-review-form'); if(!f) return;
    const d = new FormData(f);
    const r = TBCARE.review(AUTH.user, String(d.get('id')||''), String(d.get('decision')||'approved'),
      { feedback:String(d.get('feedback')||''), qty:d.get('qty')||null, supplyId:String(d.get('supplyId')||'') });
    if(!r.ok) return toast('Decision not recorded', r.msg, 'err');
    closeModal(true); toast('Decision recorded', r.msg, 'ok'); render();
  },
  'tb-dispense-open': d => {
    const r = TBCARE.requestById(AUTH.user, d.id); if(!r) return toast('Not found','That request is not in your scope.','err');
    const lots = (typeof RX!=='undefined')? RX.lots(r.drugId, r.countyId).filter(l=>l.qty>0) : [];
    const today = todayISO().slice(0,10);
    const wStart = new Date(new Date(today).getTime()+(TB_PROTOCOL.refillWindow[0]-1)*86400000).toISOString().slice(0,10);
    const wEnd = new Date(new Date(today).getTime()+(TB_PROTOCOL.refillWindow[1]-1)*86400000).toISOString().slice(0,10);
    openModal({ title:'Dispense '+r.no, sub:`${r.patientName} · ${num(r.qty)} tablets · ${num(r.coverDays)}-day cover`,
      body:`<div class="tb-review">
        ${note(`Cover will run to <b>${esc(fmtDate(new Date(new Date(today).getTime()+r.coverDays*86400000)))}</b> and the next course falls due between <b>${esc(fmtDate(wStart))}</b> and <b>${esc(fmtDate(wEnd))}</b>.`,'clock')}
        <form data-form="tb-dispense" id="tb-dispense-form" style="margin-top:12px">
          <input type="hidden" name="id" value="${esc(r.id)}">
          <div class="field"><label>Batch (earliest expiry first)</label><select class="input" name="batchId">
            <option value="">Automatic - earliest expiry (FEFO)</option>
            ${lots.map(l=>`<option value="${esc(l.id)}">${esc(l.batch)} · expires ${esc(fmtDate(l.expiry))} · ${num(l.qty)} tablets</option>`).join('')}
          </select></div>
          <div class="field"><label>Dispensing note</label><input class="input" name="note" placeholder="Handed to the caregiver / patient; counselling given"></div>
        </form></div>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" data-act="tb-dispense-submit">${ic('package',15)} Dispense and record</button>` });
  },
  'tb-dispense-submit': () => {
    const f = $('#tb-dispense-form'); if(!f) return;
    const d = new FormData(f);
    const r = TBCARE.dispense(AUTH.user, String(d.get('id')||''), { note:String(d.get('note')||''), batchId:String(d.get('batchId')||'') });
    if(!r.ok) return toast('Not dispensed', r.msg, 'err');
    closeModal(true); toast('Dispensed and accounted for', r.msg, 'ok'); render();
  },
  'tb-count-open': d => {
    const counties = ((roleObj(AUTH.user.roleId)||{scope:{}}).scope?.geo==='global')? COUNTIES : COUNTIES.filter(c=>c.id===AUTH.user.countyId);
    const pos = TBCARE.stockPosition(AUTH.user, TB_PROTOCOL.drugId, d.county||AUTH.user.countyId)[0]||{};
    openModal({ title:'Record a physical TB stock count', sub:'The count is the only thing that proves the shelf matches the ledger.',
      body:`<form data-form="tb-count" id="tb-count-form">
        <div class="grid g2">
          <div class="field"><label>County office</label><select class="input" name="countyId">${counties.map(c=>`<option value="${c.id}" ${(d.county||AUTH.user.countyId)===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>
          <div class="field"><label>Count date</label><input class="input" type="date" name="date" value="${esc(todayISO().slice(0,10))}"></div>
        </div>
        <div class="field"><label>Tablets physically counted</label><input class="input" type="number" name="physicalQty" min="0" required value="${esc(pos.systemQty||0)}">
          <div class="hint">The system balance is ${num(pos.systemQty||0)} tablets (procured ${num(pos.received||0)} less dispensed ${num(pos.dispensed||0)}).</div></div>
        <div class="field"><label>Batch notes</label><textarea class="input" name="batchNotes" rows="2" placeholder="Batch numbers counted, damaged or expired stock set aside"></textarea></div>
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" data-act="tb-count-submit">${ic('clipboard',15)} Record the count</button>` });
  },
  'tb-count-submit': () => {
    const f = $('#tb-count-form'); if(!f) return;
    const d = new FormData(f);
    const r = TBCARE.recordCount(AUTH.user, { countyId:String(d.get('countyId')||''), physicalQty:d.get('physicalQty'),
      batchNotes:String(d.get('batchNotes')||''), date:String(d.get('date')||'') });
    if(!r.ok) return toast('Count not recorded', r.msg, 'err');
    closeModal(true); toast('Count recorded', r.msg, r.rec.withinTolerance?'ok':'err'); render();
  },
  'tb-confirm-open': d => {
    const rec = (DB.db.tbStockCounts||[]).find(x=>x.id===d.id); if(!rec) return toast('Not found','That count does not exist.','err');
    openModal({ title:'Confirm a TB stock count', sub:`${countyName(rec.countyId)} · ${fmtDate(rec.date)} · counted by ${rec.countedByName||userName(rec.countedBy)}`,
      body:`<div class="tb-review">
        <div class="grid g3">
          <div class="kv"><span>Physical count</span><b>${num(rec.physicalQty)}</b></div>
          <div class="kv"><span>System balance</span><b>${num(rec.systemQty)}</b></div>
          <div class="kv"><span>Variance</span><b>${rec.variance>0?'+':''}${num(rec.variance)} (±${num(rec.tolerance)})</b></div>
        </div>
        ${rec.withinTolerance? note('Within tolerance. Confirming closes the count.','ok') : alertBox('crit','Outside tolerance', '<span class="small">Confirming records the variance and, if you choose, writes the stock ledger to match the shelf. The reason is kept on the line and in the audit trail.</span>')}
        <form data-form="tb-confirm" id="tb-confirm-form" style="margin-top:12px">
          <input type="hidden" name="id" value="${esc(rec.id)}">
          <div class="field"><label>Note / explanation</label><textarea class="input" name="note" rows="2" ${rec.withinTolerance?'':'required'} placeholder="What explains the variance, or the procurement reference that confirms the count"></textarea></div>
          <label class="switch"><input type="checkbox" name="adjustStock" ${rec.withinTolerance?'':'checked'}><span class="track"></span> Adjust the stock ledger to match the physical shelf</label>
        </form></div>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" data-act="tb-confirm-submit">${ic('shieldcheck',15)} Confirm the count</button>` });
  },
  'tb-confirm-submit': () => {
    const f = $('#tb-confirm-form'); if(!f) return;
    const d = new FormData(f);
    const r = TBCARE.confirmCount(AUTH.user, String(d.get('id')||''), { note:String(d.get('note')||''), adjustStock:!!d.get('adjustStock') });
    if(!r.ok) return toast('Not confirmed', r.msg, 'err');
    closeModal(true); toast('Count confirmed', r.msg, 'ok'); render();
  }
});
Object.assign(FORMS, {
  'tb-filter': d => { TB_STATE.status=String(d.get('status')||''); TB_STATE.areaId=String(d.get('areaId')||''); TB_STATE.q=String(d.get('q')||''); render(); },
  'tb-request': d => { ACTIONS['tb-request-submit'](); },
  'tb-review': d => { ACTIONS['tb-review-submit'](); },
  'tb-dispense': d => { ACTIONS['tb-dispense-submit'](); },
  'tb-count': d => { ACTIONS['tb-count-submit'](); },
  'tb-confirm': d => { ACTIONS['tb-confirm-submit'](); }
});
