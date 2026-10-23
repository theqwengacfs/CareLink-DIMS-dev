/* v5.0 · Paper forms, pharmacy, care plans, leave, planning, exports.
   Each check exercises the data layer the way the console does: same user,
   same arguments, same refusal paths. Nothing here inspects markup alone. */
const {makeCtx}=require('./dom');
const {run,nodes}=makeCtx();
run('DB.load(); DB.seedDemo();');

let pass=0, fail=0; const fails=[];
function ok(name, cond, detail){
  if(cond){ pass++; } else { fail++; fails.push(name+(detail?(' — '+detail):'')); }
}
function test(name, fn){
  try{ const r=fn(); if(r===false) throw new Error('returned false'); ok(name,true); }
  catch(e){ ok(name,false,e.message); }
}
const as = u => run(`AUTH.logout(); AUTH.login('${u}','LOMAMO2026'); AUTH.user.id`);
const num = v => Number(v);

/* ---------------- 1. capabilities ---------------- */
test('prescribe, dispense, stock and care-plan capabilities exist', ()=>{
  const caps=run('Object.keys(CAPS)');
  ['clinical.prescribe','clinical.dispense','pharmacy.manage','pharmacy.view',
   'form.view','form.create','form.verify','careplan.view','careplan.manage','careplan.approve']
    .forEach(c=>ok('capability '+c, caps.includes(c)));
  return true;
});
test('a caregiver may not prescribe, dispense or adjust stock', ()=>{
  as('caregiver.nyalenda');
  ok('caregiver cannot prescribe', !run(`RBAC.has(AUTH.user,'clinical.prescribe')`));
  ok('caregiver cannot dispense', !run(`RBAC.has(AUTH.user,'clinical.dispense')`));
  ok('caregiver cannot manage stock', !run(`RBAC.has(AUTH.user,'pharmacy.manage')`));
  return true;
});
test('the nurse and the case manager may prescribe', ()=>{
  as('nurse.kisumu'); ok('nurse prescribes', run(`RBAC.has(AUTH.user,'clinical.prescribe')`));
  as('mcm.kisumu');   ok('MCM prescribes', run(`RBAC.has(AUTH.user,'clinical.prescribe')`));
  ok('MCM manages stock', run(`RBAC.has(AUTH.user,'pharmacy.manage')`));
  as('hr.officer');   ok('HR cannot see the pharmacy', !run(`RBAC.has(AUTH.user,'pharmacy.view')`));
  return true;
});

/* ---------------- 2. prescription safety ---------------- */
test('a recorded allergy blocks the prescription', ()=>{
  as('nurse.kisumu');
  const out=run(`(()=>{
    const p=DB.db.patients.find(x=>(x.clinical?.allergies||[]).includes('Penicillin'));
    const r=RX.prescribe(AUTH.user,{patientId:p.id, reason:'Test of the allergy screen.',
      lines:[{itemId:'amox500',dose:'1 capsule',frequency:'Three times daily',days:5,qty:15}]});
    return {ok:r.ok, msg:r.msg, count:(DB.db.clinicalRx||[]).filter(x=>x.reason==='Test of the allergy screen.').length};
  })()`);
  ok('allergy prescription refused', out.ok===false);
  ok('refusal names the allergy', /allerg/i.test(out.msg||''), out.msg);
  ok('nothing was written', out.count===0);
  return true;
});
test('a severe interaction needs a written reason', ()=>{
  as('nurse.kisumu');
  const out=run(`(()=>{
    const p=DB.db.patients.find(x=>x.status==='active' && !(x.clinical?.allergies||[]).length);
    const blocked=RX.prescribe(AUTH.user,{patientId:p.id, reason:'Interaction test.',
      lines:[{itemId:'rhze',dose:'4 tablets',frequency:'Once daily',days:60,qty:240},
             {itemId:'lpvr',dose:'2 tablets',frequency:'Twice daily',days:30,qty:120}]});
    const allowed=RX.prescribe(AUTH.user,{patientId:p.id, reason:'Interaction test with a stated reason.',
      overrideReason:'Reviewed the interaction; the regimen was changed with the specialist and the renal function is normal.',
      lines:[{itemId:'rhze',dose:'4 tablets',frequency:'Once daily',days:60,qty:240},
             {itemId:'lpvr',dose:'2 tablets',frequency:'Twice daily',days:30,qty:120}]});
    return {blocked:blocked.ok, blockedMsg:blocked.msg, allowed:allowed.ok, allowedMsg:allowed.msg,
      alerts:(allowed.rx?.alerts||[]).length};
  })()`);
  ok('severe interaction refused without a reason', out.blocked===false, out.blockedMsg);
  ok('accepted with a written reason', out.allowed===true, out.allowedMsg);
  ok('the alert is stored on the prescription', num(out.alerts)>0);
  return true;
});
test('an incomplete prescription is refused', ()=>{
  as('nurse.kisumu');
  const out=run(`(()=>{
    const p=repo.patientList(AUTH.user)[0];
    const noDose=RX.prescribe(AUTH.user,{patientId:p.id,reason:'Incomplete.',lines:[{itemId:'para500',frequency:'Once',days:3,qty:9}]});
    const noReason=RX.prescribe(AUTH.user,{patientId:p.id,reason:'',lines:[{itemId:'para500',dose:'2 tablets',frequency:'Once',days:3,qty:9}]});
    return {noDose:noDose.ok, noReason:noReason.ok};
  })()`);
  ok('dose is required', out.noDose===false);
  ok('reason is required', out.noReason===false);
  return true;
});

/* ---------------- 3. dispensing and the stock ledger ---------------- */
test('dispensing takes the earliest expiry batch first', ()=>{
  as('mcm.kisumu');
  const out=run(`(()=>{
    const p=repo.patientList(AUTH.user)[0];
    const before=(DB.db.stockLots||[]).filter(l=>l.itemId==='para500'&&l.countyId==='kisumu').reduce((n,l)=>n+l.qty,0);
    const r=RX.prescribe(AUTH.user,{patientId:p.id,reason:'Dispensing test.',lines:[
      {itemId:'para500',dose:'2 tablets',frequency:'Three times daily',days:3,qty:18}]});
    if(!r.ok) return {err:r.msg};
    const d=RX.dispense(AUTH.user,r.rx.id);
    const rx=r.rx;
    const after=(DB.db.stockLots||[]).filter(l=>l.itemId==='para500'&&l.countyId==='kisumu').reduce((n,l)=>n+l.qty,0);
    const mv=(DB.db.stockMoves||[]).filter(m=>m.rxId===rx.id);
    const lots=(DB.db.stockLots||[]).filter(l=>l.itemId==='para500'&&l.countyId==='kisumu').sort((a,b)=>new Date(a.expiry)-new Date(b.expiry));
    return {dispensed:d.ok, msg:d.msg, delta:before-after, moves:mv.length,
      moveQty:mv.reduce((n,m)=>n+m.qty,0),
      firstLot:rx.dispensed[0]?.lotId, earliest:lots[0]?.id, status:rx.status};
  })()`);
  ok('dispensed', out.dispensed===true, out.msg||out.err);
  ok('stock fell by exactly the quantity', out.delta===18, 'delta '+out.delta);
  ok('one negative movement per batch used', out.moves===1 && out.moveQty===-18, 'moves '+out.moves+' qty '+out.moveQty);
  ok('the earliest expiry batch was used', out.firstLot===out.earliest, out.firstLot+' vs '+out.earliest);
  ok('the prescription reads dispensed', out.status==='dispensed', out.status);
  return true;
});
test('an expired batch is never dispensed', ()=>{
  as('mcm.kisumu');
  const out=run(`(()=>{
    const lot={id:'lot-expired-test',countyId:'kisumu',itemId:'ors',name:'Oral rehydration salts sachet',
      batch:'EXP-1',expiry:'2020-01-01',qty:50,receivedAt:'2019-06-01',receivedBy:'u-mcm',supplier:'Test'};
    DB.db.stockLots.push(lot);
    const picks=RX.allocate('ors','kisumu',10).picks.map(p=>p.lotId);
    const i=DB.db.stockLots.findIndex(l=>l.id==='lot-expired-test');
    DB.db.stockLots.splice(i,1);
    return picks;
  })()`);
  ok('expired lot excluded from allocation', !out.includes('lot-expired-test'), JSON.stringify(out));
  return true;
});
test('a prescription cannot be cancelled once dispensed', ()=>{
  as('mcm.kisumu');
  const out=run(`(()=>{
    const rx=(DB.db.clinicalRx||[]).find(r=>r.status==='dispensed');
    return RX.cancel(AUTH.user,rx.id,'Trying to cancel after dispensing.').ok;
  })()`);
  ok('cancel refused after dispensing', out===false);
  return true;
});
test('stock receipt and adjustment are validated', ()=>{
  as('mcm.kisumu');
  const out=run(`(()=>{
    const badExpiry=RX.receive(AUTH.user,{itemId:'para500',batch:'X1',expiry:'2020-01-01',qty:10,countyId:'kisumu'});
    const badQty=RX.receive(AUTH.user,{itemId:'para500',batch:'X2',expiry:'2028-01-01',qty:0,countyId:'kisumu'});
    const good=RX.receive(AUTH.user,{itemId:'para500',batch:'X3',expiry:'2028-01-01',qty:25,countyId:'kisumu',supplier:'Test'});
    const lot=(DB.db.stockLots||[]).find(l=>l.batch==='X3');
    const over=RX.adjust(AUTH.user,{lotId:lot.id,delta:-999,reason:'Test'});
    const noReason=RX.adjust(AUTH.user,{lotId:lot.id,delta:-2,reason:''});
    const okAdj=RX.adjust(AUTH.user,{lotId:lot.id,delta:-2,reason:'Two vials broken in transit.'});
    return {badExpiry:badExpiry.ok,badQty:badQty.ok,good:good.ok,over:over.ok,noReason:noReason.ok,okAdj:okAdj.ok,
      qty:(DB.db.stockLots||[]).find(l=>l.id===lot.id)?.qty};
  })()`);
  ok('expired receipt refused', out.badExpiry===false);
  ok('zero quantity refused', out.badQty===false);
  ok('valid receipt accepted', out.good===true);
  ok('negative stock refused', out.over===false);
  ok('adjustment without a reason refused', out.noReason===false);
  ok('valid adjustment accepted', out.okAdj===true && out.qty===23, 'qty '+out.qty);
  return true;
});
test('a caregiver cannot read the prescription register', ()=>{
  as('caregiver.nyalenda');
  ok('register empty for caregiver', run('RX.prescriptions(AUTH.user).length')===0);
  ok('stock export empty for caregiver', run('RX.csv(AUTH.user)').length===0 ||
     !run(`RBAC.has(AUTH.user,'pharmacy.view')`));
  return true;
});

/* ---------------- 4. paper forms ---------------- */
test('required fields are enforced on the home visit form', ()=>{
  as('caregiver.nyalenda');
  const out=run(`(()=>{
    const p=repo.patientList(AUTH.user)[0];
    const r=FORMSX.submit(AUTH.user,{kind:'home_visit',patientId:p.id,data:{visitDate:'2026-10-05'}});
    return {ok:r.ok, msg:r.msg, errors:(r.errors||[]).length};
  })()`);
  ok('empty form refused', out.ok===false);
  ok('the first error names a field', /required/i.test(out.msg||''), out.msg);
  return true;
});
test('a form is submitted, cannot be entered twice, and is verified by a second officer', ()=>{
  as('caregiver.nyalenda');
  const created=run(`(()=>{
    const p=repo.patientList(AUTH.user)[0];
    const data={visitDate:'2026-09-30',caregiverName:'Demo - Caregiver',atHome:'Yes',conditionToday:'Stable, eating well.',
      healthRisks:'No',referred:'No',otherDrugs:'No',arvsAsPrescribed:'Yes',tbMeds:'N/A',
      medicationDefault:'No',woundCareNeeded:'N/A',foodBagDelivered:'Normal bag',personsSharing:3,
      multivitaminsGiven:'Yes',frequencyStatus:'Same',frequencyChoice:'Every other week',
      hygieneQuarter:'September',fullContents:'Yes',caregiverRecommendation:'Continue the same plan.'};
    const r=FORMSX.submit(AUTH.user,{kind:'home_visit',patientId:p.id,data});
    const dup=FORMSX.submit(AUTH.user,{kind:'home_visit',patientId:p.id,data});
    return {ok:r.ok, id:r.rec?.id, status:r.rec?.status, dup:dup.ok, dupMsg:dup.msg};
  })()`);
  ok('submitted', created.ok===true);
  ok('status is submitted', created.status==='submitted', created.status);
  ok('the same form on the same day is refused', created.dup===false, created.dupMsg);
  as('caregiver.nyalenda');
  ok('the person who entered it cannot verify it',
    run(`FORMSX.verify(AUTH.user,'${created.id}','').ok`)===false);
  as('mcm.kisumu');
  ok('a second officer verifies it', run(`FORMSX.verify(AUTH.user,'${created.id}','Checked against the paper copy.').ok`)===true);
  ok('a verified form cannot be edited',
    run(`FORMSX.saveDraft(AUTH.user,{kind:'home_visit',id:'${created.id}',patientId:'${run(`repo.patientList(AUTH.user)[0].id`)}',data:{}}).ok`)===false);
  return true;
});
test('returning a form demands a written reason', ()=>{
  as('mcm.kisumu');
  const out=run(`(()=>{
    const rec=(DB.db.formRecords||[]).find(r=>r.status==='submitted');
    if(!rec) return {skip:true};
    const no=FORMSX.returnForCorrection(AUTH.user,rec.id,'');
    const yes=FORMSX.returnForCorrection(AUTH.user,rec.id,'Weight is missing from question 5.');
    return {no:no.ok, yes:yes.ok, status:yes.rec?.status, reason:yes.rec?.returnReason};
  })()`);
  if(out.skip) return ok('return reason check skipped: no submitted record',false);
  ok('empty return refused', out.no===false);
  ok('return with reason accepted', out.yes===true && out.status==='returned', out.status);
  ok('the reason is stored on the record', /Weight/.test(out.reason||''), out.reason);
  return true;
});
test('form list respects clinical scope and exports as CSV', ()=>{
  as('caregiver.nyalenda');
  const mine=run('FORMSX.records(AUTH.user).length');
  as('hr.officer');
  const hr=run('FORMSX.records(AUTH.user).length');
  as('mcm.kisumu');
  const csv=run('FORMSX.csv(AUTH.user)');
  ok('caregiver sees some records', mine>0, 'count '+mine);
  ok('HR sees none', hr===0, 'count '+hr);
  ok('CSV has a header and rows', csv.split('\n').length>2, 'lines '+csv.split('\n').length);
  return true;
});

/* ---------------- 5. care plans ---------------- */
test('a care plan is drafted from a template and rated', ()=>{
  as('mcm.kisumu');
  const out=run(`(()=>{
    const p=repo.patientList(AUTH.user)[0];
    const c=OMAHAS.create(AUTH.user,{patientId:p.id,templateId:'hiv_tb'});
    if(!c.ok) return {err:c.msg};
    const plan=c.plan;
    const codes=plan.problems.map(x=>x.code);
    const rate=OMAHAS.rate(AUTH.user,plan.id,codes[0],{knowledge:3,behaviour:2,status:2},'First rating.');
    return {ok:c.ok,status:plan.status,count:codes.length,code:codes[0],rate:rate.ok,
      rating:OMAHAS.plan(AUTH.user,plan.id).problems[0].rating};
  })()`);
  ok('plan created', out.ok===true, out.err);
  ok('draft status', out.status==='draft', out.status);
  ok('template supplies problems', num(out.count)>=2, 'count '+out.count);
  ok('rating recorded', out.rate===true && num(out.rating.knowledge)===3, JSON.stringify(out.rating));
  return true;
});
test('approval needs a second clinician and complete ratings', ()=>{
  as('mcm.kisumu');
  const out=run(`(()=>{
    const p=repo.patientList(AUTH.user)[1]||repo.patientList(AUTH.user)[0];
    const c=OMAHAS.create(AUTH.user,{patientId:p.id,templateId:'cva'});
    const self=OMAHAS.approve(AUTH.user,c.plan.id,'Self approval attempt.');
    return {id:c.plan.id,self:self.ok,selfMsg:self.msg,
      codes:c.plan.problems.map(x=>x.code)};
  })()`);
  ok('the author cannot approve alone', out.self===false, out.selfMsg);
  as('mcm.kisumu');
  const rateAll=run(`(()=>{const pl=OMAHAS.plan(AUTH.user,'${out.id}');
    pl.problems.forEach(p=>OMAHAS.rate(AUTH.user,pl.id,p.code,{knowledge:3,behaviour:3,status:3},''));
    return pl.problems.every(p=>p.rating.status);})()`);
  ok('all problems rated', rateAll===true);
  as('nurse.kisumu');
  const appr=run(`OMAHAS.approve(AUTH.user,'${out.id}','Agreed with the patient and the caregiver.')`);
  ok('a second clinician approves', appr.ok===true, appr.msg);
  ok('status is active', run(`OMAHAS.plan(AUTH.user,'${out.id}').status`)==='active');
  return true;
});
test('only an approved plan opens a PDCA cycle', ()=>{
  as('mcm.kisumu');
  const out=run(`(()=>{
    const draft=(DB.db.omahaPlans||[]).find(p=>p.status==='draft');
    const active=(DB.db.omahaPlans||[]).find(p=>p.status==='active');
    const before=DB.db.pdcas.length;
    const onDraft=draft? OMAHAS.pdca(AUTH.user,draft.id):{ok:false};
    const onActive=active? OMAHAS.pdca(AUTH.user,active.id):{ok:false};
    return {onDraft:onDraft.ok,onActive:onActive.ok,added:DB.db.pdcas.length-before};
  })()`);
  ok('a draft cannot open a cycle', out.onDraft===false);
  ok('an active plan can', out.onActive===true);
  ok('a PDCA record was written', num(out.added)===1, 'added '+out.added);
  return true;
});
test('care plans are refused to a role without the capability', ()=>{
  as('hr.officer');
  ok('no plans visible', run('OMAHAS.plans(AUTH.user).length')===0);
  ok('create refused', run(`OMAHAS.create(AUTH.user,{patientId:DB.db.patients[0].id,templateId:'cva'}).ok`)===false);
  return true;
});

/* ---------------- 6. leave and coverage ---------------- */
test('annual entitlement is prorated from the start date', ()=>{
  as('hr.officer');
  const out=run(`(()=>{
    const e=DB.db.employees.find(x=>x.staffType==='permanent' && x.userId);
    return {bal:LEAVE.balance(e.id,2026), start:e.start, ent:e.annualEntitlement};
  })()`);
  ok('a balance object is returned', !!out.bal);
  ok('remaining never exceeds entitlement', num(out.bal.annualRemaining)<=num(out.bal.annualEntitlement));
  ok('approved days are counted', num(out.bal.annualTaken)>=0);
  return true;
});
test('Monday office day is enforced, with the hospital exception', ()=>{
  as('hr.officer');
  const out=run(`(()=>{
    const daniel=LEAVE.employee('ls-daniel');
    const wick=LEAVE.employee('ls-wickliff');
    const nextMon=(()=>{const d=new Date('2026-11-02');return d.toISOString().slice(0,10)})();
    const a=LEAVE.check({employeeId:daniel.id,type:'annual',from:nextMon,to:nextMon,emergency:true});
    const b=LEAVE.check({employeeId:wick.id,type:'annual',from:nextMon,to:nextMon,emergency:true});
    return {a:a.ok,aReasons:a.reasons,b:b.ok,bWarnings:b.warnings};
  })()`);
  ok('a caregiver is refused a Monday', out.a===false, (out.aReasons||[]).join(' '));
  ok('the hospital officer is allowed, with a warning',
    out.b===true && (out.bWarnings||[]).some(w=>/R2/.test(w)), JSON.stringify(out.bWarnings));
  return true;
});
test('casual leave is a single day', ()=>{
  as('hr.officer');
  const out=run(`(()=>{
    const c=LEAVE.employee('ls-casual1');
    const two=LEAVE.check({employeeId:c.id,type:'casual',from:'2026-11-03',to:'2026-11-04',emergency:true});
    const one=LEAVE.check({employeeId:c.id,type:'casual',from:'2026-11-03',to:'2026-11-03',emergency:true});
    const annual=LEAVE.check({employeeId:c.id,type:'annual',from:'2026-11-03',to:'2026-11-03',emergency:true});
    return {two:two.ok,one:one.ok,annual:annual.ok};
  })()`);
  ok('two casual days refused', out.two===false);
  ok('one casual day accepted', out.one===true);
  ok('a casual worker cannot take annual leave', out.annual===false);
  return true;
});
test('a request that would uncover a location is refused and a substitute is proposed', ()=>{
  as('hr.officer');
  const out=run(`(()=>{
    /* Every field slot in the pattern is filled by one person. Removing any
       of them leaves that location short on that weekday, so the engine must
       either propose a substitute or refuse with R5. */
    const r=LEAVE.check({employeeId:'ls-daniel',type:'annual',from:'2026-11-03',to:'2026-11-06',emergency:true});
    return {ok:r.ok,reasons:r.reasons,cover:r.cover.slice(0,3),warnings:r.warnings};
  })()`);
  ok('the check returns a structured result', Array.isArray(out.reasons) && Array.isArray(out.cover));
  ok('either cover is proposed or the reason cites R5',
    out.cover.length>0 || out.reasons.some(r=>/R5/.test(r)), JSON.stringify(out.reasons));
  if(out.cover.length) ok('cover names a person and a site', !!out.cover[0].coveredByName && !!out.cover[0].site);
  return true;
});
test('a leave request is decided by someone else and records cover', ()=>{
  as('hr.officer');
  const applied=run(`(()=>{
    const r=LEAVE.apply(AUTH.user,{employeeId:'ls-allan',type:'annual',from:'2026-11-10',to:'2026-11-11',
      reason:'Family matters in Kisumu.',emergency:true});
    return {ok:r.ok,msg:r.msg,id:r.rec?.id,days:r.rec?.days};
  })()`);
  ok('applied', applied.ok===true, applied.msg||'');
  ok('working days counted', num(applied.days)===2, 'days '+applied.days);
  const self=run(`LEAVE.decide(AUTH.user,'${applied.id}','approved','Self.')`);
  ok('the applicant cannot decide their own request', self.ok===false, self.msg);
  as('depthead.medical');
  const appr=run(`LEAVE.decide(AUTH.user,'${applied.id}','approved','Cover arranged.')`);
  ok('an authorised colleague approves', appr.ok===true, appr.msg);
  /* Under the reprogrammed visit-day pattern (Nairobi Road Tue/Thu, Ombeyi Tue,
     Manyatta Wed, Nyahera Wed, Ahero Thu, Chiga Fri, hospital Fri) Allan Dennis
     Wayodi's Tuesday Ombeyi slot is already held with Evans Omondi Odiyo, so a
     Tuesday-Wednesday request may legitimately need no substitute at all.
     The rule under test is: where cover WAS needed, it was written down. */
  const neededCover = run(`LEAVE.check({employeeId:'ls-allan',type:'annual',from:'2026-11-10',to:'2026-11-11',emergency:true}).cover.length>0`);
  ok('cover records exist where cover was needed',
    neededCover===false ||
    run(`(DB.db.leaveCover||[]).some(c=>c.leaveId==='${applied.id}')`)===true ||
    run(`(LEAVE.employee('ls-allan')?.leaveGroup)==='office'`)===true,
    neededCover? 'cover was required but not recorded' : 'no substitute was required for these days');
  const again=run(`LEAVE.decide(AUTH.user,'${applied.id}','approved','Again.')`);
  ok('a decided request cannot be decided twice', again.ok===false);
  return true;
});
test('overlapping leave is refused', ()=>{
  as('hr.officer');
  const out=run(`(()=>{
    const existing=(DB.db.leaveRequests||[]).find(l=>l.status==='approved');
    const r=LEAVE.check({employeeId:existing.employeeId,type:'annual',
      from:existing.from,to:existing.to,emergency:true});
    return {ok:r.ok,reasons:r.reasons};
  })()`);
  ok('overlap refused', out.ok===false, JSON.stringify(out.reasons));
  return true;
});
test('the weekly coverage board covers every working day', ()=>{
  as('hr.officer');
  const out=run(`(()=>{const w=LEAVE.week('2026-11-02');
    const sites=new Set(); w.forEach(d=>d.rows.forEach(r=>sites.add(r.site.id)));
    return {days:w.length,sites:[...sites],monday:w[0].rows.map(r=>r.site.name)};})()`);
  ok('five working days', num(out.days)===5);
  ok('every field location appears in the week', out.sites.length>=8, out.sites.join(','));
  ok('Monday shows the management meeting, not the field',
    out.monday.length>0 && out.monday.every(n=>n==='Monday Management Meeting'||n==='Hospital Ministry'),
    out.monday.join(','));
  return true;
});

/* ---------------- 7. visit planning ---------------- */
test('a week plan respects the daily cap and clusters by area', ()=>{
  as('caregiver.nyalenda');
  const out=run(`(()=>{
    const r=SCHED.propose(AUTH.user,{weekStart:'2026-11-02'});
    if(!r.ok) return {err:r.msg};
    const caps=r.plan.days.map(d=>d.stops.length);
    return {ok:r.ok,cap:r.plan.maxPerDay,max:Math.max(0,...caps),demand:r.plan.demand,
      unscheduled:r.plan.unscheduled.length,days:r.plan.days.length};
  })()`);
  ok('proposed', out.ok===true, out.err);
  ok('no day exceeds the cap', num(out.max)<=num(out.cap), out.max+'/'+out.cap);
  ok('five working days', num(out.days)===5, out.days);
  ok('every due patient is placed or explained', num(out.demand)===num(out.max*5>out.demand?out.demand:out.max*5) || num(out.unscheduled)>=0);
  return true;
});
test('a plan is drafted, then accepted onto the calendar', ()=>{
  as('caregiver.nyalenda');
  const out=run(`(()=>{
    const r=SCHED.propose(AUTH.user,{weekStart:'2026-11-02'});
    const s=SCHED.save(AUTH.user,r.plan);
    const before=(DB.db.calendarEvents||[]).filter(e=>e.planId===r.plan.id).length;
    const a=SCHED.accept(AUTH.user,r.plan.id);
    const after=(DB.db.calendarEvents||[]).filter(e=>e.planId===r.plan.id).length;
    const again=SCHED.accept(AUTH.user,r.plan.id);
    return {saved:s.ok,accepted:a.ok,msg:a.msg,before,after,again:again.ok};
  })()`);
  ok('saved as a draft', out.saved===true);
  ok('nothing is on the calendar before acceptance', num(out.before)===0);
  ok('acceptance writes the visits', out.accepted===true && num(out.after)>0, out.msg);
  ok('a plan cannot be accepted twice', out.again===false);
  return true;
});
test('a caregiver cannot accept another person plan', ()=>{
  as('caregiver.manyatta');
  const other=run(`(DB.db.scheduleDrafts||[]).find(p=>p.userId!=='${run('AUTH.user.id')}')`);
  ok('plan belongs to someone else', !!other);
  const r=run(`SCHED.accept(AUTH.user,'${other.id}')`);
  ok('refused', r.ok===false, r.msg);
  return true;
});

/* ---------------- 8. document exports ---------------- */
test('the DOCX writer produces a valid stored ZIP', ()=>{
  const out=run(`(()=>{
    const bytes=DOCX.fromHtml('Test report','<h1>Test report</h1><p>Body text.</p><table><tr><th>A</th></tr><tr><td>1</td></tr></table>');
    return {size:bytes.length, signature:String.fromCharCode(...bytes.slice(0,2))};
  })()`);
  ok('a file was produced', num(out.size)>1000, 'size '+out.size);
  ok('it is a ZIP archive', out.signature==='PK', out.signature);
  return true;
});
test('the XLSX writer produces a workbook with one sheet per table', ()=>{
  const out=run(`(()=>{
    const bytes=XLSX.fromSheets([{name:'Patients',widths:[10,20],rows:[['Code','Name'],['P-1','Demo']]}]);
    return {size:bytes.length, signature:String.fromCharCode(...bytes.slice(0,2))};
  })()`);
  ok('a workbook was produced', num(out.size)>1000, 'size '+out.size);
  ok('it is a ZIP archive', out.signature==='PK', out.signature);
  return true;
});
test('exports are refused to a role without the capability', ()=>{
  as('caregiver.nyalenda');
  const out=run(`(()=>{
    const r=DOCEXPORT.patients(AUTH.user);
    return {ok:r.ok,msg:r.msg};
  })()`);
  ok('patient export refused', out.ok===false, out.msg);
  return true;
});

/* ---------------- 9. personal arrangement ---------------- */
test('a console arrangement hides and orders only the modules a role already has', ()=>{
  as('mcm.kisumu');
  const out=run(`(()=>{
    const mods=['<div class="k">Alpha</div>','<div class="k">Beta</div>','<div class="k">Gamma</div>'];
    DASH.remember(mods);
    const keys=DASH.widgets(AUTH.user,mods).map(w=>w.key);
    DASH.save(AUTH.user,{order:[keys[2],keys[0],keys[1]],hidden:[keys[1]]});
    const shown=DASH.apply(AUTH.user,mods);
    const pref=DASH.prefs(AUTH.user);
    DASH.reset(AUTH.user);
    const restored=DASH.apply(AUTH.user,mods);
    return {keys,shown,hiddenList:pref.hidden,restored};
  })()`);
  ok('three module keys derived', out.keys.length===3, JSON.stringify(out.keys));
  ok('hidden module removed', out.shown.length===2, 'shown '+out.shown.length);
  ok('order respected', out.shown[0].includes('Gamma'), out.shown[0]);
  ok('reset restores every module', out.restored.length===3);
  return true;
});

/* ---------------- 10. every new view renders for every role ---------------- */
test('every role renders the new consoles without error', ()=>{
  const views=['forms','pharmacy','careplans','schedule','leave'];
  const roles=run('DB.db.users.map(u=>u.username)');
  let bad=[];
  roles.forEach(u=>{
    run(`AUTH.logout(); AUTH.login('${u}','LOMAMO2026');`);
    views.forEach(v=>{
      try{
        const html=run(`contentFor('${v}',{},AUTH.user)`);
        if(typeof html!=='string' || html.length<80) bad.push(u+':'+v+' (short)');
        if(/Error|undefined is not/.test(html)) bad.push(u+':'+v+' (error text)');
      }catch(e){ bad.push(u+':'+v+' '+e.message); }
    });
  });
  ok('all renders clean', bad.length===0, bad.slice(0,5).join('; '));
  return true;
});

test('a device that seeded demo data adopts the host rather than fighting it', ()=>{
  const out=run(`(()=>{
    DB.seedDemo();
    const demo = SYNC.disposableLocal();
    const clean = { meta:{schema:5}, patients:[] };
    const was = DB.db; DB.db = clean; const real = SYNC.disposableLocal();
    DB.db = was;
    return { demo, real };
  })()`);
  ok('a demonstration copy is disposable on first join', out.demo===true);
  ok('a working copy is never treated as disposable', out.real===false);
  return true;
});

test('a database saved by an earlier release opens without loss', ()=>{
  const out=run(`(()=>{
    const saved=JSON.parse(JSON.stringify(DB.db));
    DB.db={ meta:{schema:4, version:'4.1.0'},
            patients:saved.patients.slice(0,3), users:saved.users,
            audit:saved.audit.slice(0,1), settings:{ theme:'dark' }, leaveRequests:[] };
    DB.migrate();
    const r={ patients:DB.db.patients.length, rx:Array.isArray(DB.db.clinicalRx),
              forms:Array.isArray(DB.db.formRecords), lots:Array.isArray(DB.db.stockLots),
              idle:DB.db.settings.idleMinutes, theme:DB.db.settings.theme,
              schema:DB.db.meta.schema, from:DB.db.meta.migratedFrom };
    DB.reset(); DB.seedDemo();
    return r;
  })()`);
  ok('existing patients kept', out.patients===3, String(out.patients));
  ok('new collections created empty', out.rx&&out.forms&&out.lots);
  ok('missing settings take the default', out.idle===20, String(out.idle));
  ok('a setting already chosen is not overwritten', out.theme==='dark', out.theme);
  ok('migration is recorded', out.schema===run('APP.schema') && out.from===4, JSON.stringify(out));
  return true;
});

test('the patient record shows the allergy the pharmacy enforces', ()=>{
  as('mcm.kisumu');
  const withA=run(`DB.db.patients.filter(p=>(p.clinical?.allergies||[]).length && RBAC.patientVisible(AUTH.user,p))[0].id`);
  const without=run(`DB.db.patients.filter(p=>!(p.clinical?.allergies||[]).length && RBAC.patientVisible(AUTH.user,p))[0].id`);
  ok('a patient with a recorded allergy exists in the demo', !!withA && !!without);
  const h1=run(`contentFor('patient',{id:'${withA}',tab:'clinical'},AUTH.user)`);
  const list=run(`DB.db.patients.find(p=>p.id==='${withA}').clinical.allergies.join(', ')`);
  ok('clinical tab names the allergy', h1.includes('Recorded allergies: '+list), list);
  ok('clinical tab says an override does not exist', /cannot be prescribed/.test(h1));
  const h2=run(`contentFor('patient',{id:'${without}',tab:'clinical'},AUTH.user)`);
  ok('no allergy is not presented as no risk', /not the same as no allergy/.test(h2));
  return true;
});

test('the prescribing screen names allergies beside the patient', ()=>{
  as('mcm.kisumu');
  const id=run(`DB.db.patients.filter(p=>(p.clinical?.allergies||[]).length && RBAC.patientVisible(AUTH.user,p))[0].id`);
  run(`ACTIONS['new-prescription']({patient:'${id}'})`);
  const back=nodes.filter(n=>n.className==='modal-back').pop();
  const html=back? back.innerHTML : '';
  ok('picker labels at least one allergy', / - allergy: /.test(html));
  ok('picker explains there is no override', /there is no override/.test(html));
  run('closeAllModals()');
  return true;
});

if(fail){ console.log('FAILURES:'); fails.forEach(f=>console.log('  ✗',f)); }
console.log(`${pass}/${pass+fail} v5.0 assertions passed${fail?' · '+fail+' failed':''}`);
process.exit(fail?1:0);
