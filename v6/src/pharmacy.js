/* ============================================================
   pharmacy.js - Prescribing, dispensing and the stock ledger.

   Three rules hold in this file:
   1. A prescription is a clinical act. It needs a clinical role, a
      patient in scope, a stated medicine, dose and duration.
   2. An allergy or a severe interaction stops a prescription unless the
      prescriber records a clinical reason. The reason is printed on the
      prescription and written to the audit trail.
   3. Stock moves only through the ledger. Dispensing takes the earliest
      expiry first and never dispenses an expired batch. A correction needs
      a written reason. Nothing silently changes a quantity.
   ============================================================ */

const FORMULARY = [
  { id:'para500',  name:'Paracetamol 500 mg tablet',              cat:'Analgesic', unit:'tablet', reorder:200 },
  { id:'para120',  name:'Paracetamol syrup 120 mg/5 ml',          cat:'Analgesic', unit:'bottle', reorder:20 },
  { id:'ibu400',   name:'Ibuprofen 400 mg tablet',                cat:'Analgesic', unit:'tablet', reorder:120, allergy:'NSAID',
    interactions:[{with:'enalapril',sev:'moderate',advice:'NSAIDs reduce the effect of ACE inhibitors and can impair renal function. Use the lowest dose for the shortest time and monitor.'},
                  {with:'hctz',sev:'moderate',advice:'NSAIDs reduce the diuretic effect. Monitor blood pressure.'},
                  {with:'prednisolone',sev:'moderate',advice:'Combined use increases the risk of gastrointestinal bleeding. Consider gastroprotection.'}] },
  { id:'diclofenac',name:'Diclofenac 50 mg tablet',               cat:'Analgesic', unit:'tablet', reorder:90, allergy:'NSAID',
    interactions:[{with:'enalapril',sev:'moderate',advice:'NSAIDs with ACE inhibitors risk renal impairment.'}] },
  { id:'amox500',  name:'Amoxicillin 500 mg capsule',             cat:'Antibiotic', unit:'capsule', reorder:150, allergy:'Penicillin' },
  { id:'amoxclav', name:'Amoxicillin-clavulanate 625 mg tablet',  cat:'Antibiotic', unit:'tablet', reorder:60, allergy:'Penicillin' },
  { id:'amox125',  name:'Amoxicillin syrup 125 mg/5 ml',          cat:'Antibiotic', unit:'bottle', reorder:15, allergy:'Penicillin' },
  { id:'azithro',  name:'Azithromycin 500 mg tablet',             cat:'Antibiotic', unit:'tablet', reorder:40 },
  { id:'cipro',    name:'Ciprofloxacin 500 mg tablet',            cat:'Antibiotic', unit:'tablet', reorder:60,
    interactions:[{with:'ferrous',sev:'moderate',advice:'Iron reduces ciprofloxacin absorption. Separate the doses by at least two hours.'}] },
  { id:'ceftriax', name:'Ceftriaxone 1 g injection',              cat:'Antibiotic', unit:'vial', reorder:30, allergy:'Cephalosporin',
    interactions:[{with:'amox500',sev:'moderate',advice:'Penicillin allergy increases the risk of a cephalosporin reaction. Confirm the allergy history before giving ceftriaxone.'}] },
  { id:'cotrim',   name:'Cotrimoxazole 960 mg tablet',            cat:'Antibiotic', unit:'tablet', reorder:200, allergy:'Sulfa',
    interactions:[{with:'azt3tc',sev:'moderate',advice:'Both drugs suppress the bone marrow. Monitor the full blood count.'},
                  {with:'rhze',sev:'moderate',advice:'Rifampicin lowers cotrimoxazole levels. Monitor the clinical response.'}] },
  { id:'doxy',     name:'Doxycycline 100 mg capsule',             cat:'Antibiotic', unit:'capsule', reorder:80,
    interactions:[{with:'ferrous',sev:'moderate',advice:'Iron reduces doxycycline absorption. Separate the doses by two hours.'}] },
  { id:'metro',    name:'Metronidazole 400 mg tablet',            cat:'Antibiotic', unit:'tablet', reorder:100 },
  { id:'flucon',   name:'Fluconazole 200 mg capsule',             cat:'Antifungal', unit:'capsule', reorder:40,
    interactions:[{with:'rhze',sev:'moderate',advice:'Rifampicin reduces fluconazole levels substantially. Consider an alternative antifungal or a higher dose with clinical review.'},
                  {with:'azt3tc',sev:'moderate',advice:'Fluconazole can increase zidovudine exposure. Monitor for anaemia.'}] },
  { id:'al20',     name:'Artemether-lumefantrine 20/120 tablet',  cat:'Antimalarial', unit:'tablet', reorder:120 },
  { id:'artesun',  name:'Artesunate 60 mg injection',             cat:'Antimalarial', unit:'vial', reorder:20 },
  { id:'tld',      name:'Tenofovir/lamivudine/dolutegravir 300/300/50', cat:'ARV', unit:'tablet', reorder:300,
    interactions:[{with:'rhze',sev:'moderate',advice:'Rifampicin lowers dolutegravir exposure. The national guidance is to double the dolutegravir dose to 50 mg twice daily during TB treatment.'},
                  {with:'ibu400',sev:'moderate',advice:'Tenofovir with regular NSAIDs increases renal risk. Monitor creatinine.'}] },
  { id:'abc3tc',   name:'Abacavir/lamivudine 600/300 tablet',     cat:'ARV', unit:'tablet', reorder:120 },
  { id:'azt3tc',   name:'Zidovudine/lamivudine 300/150 tablet',   cat:'ARV', unit:'tablet', reorder:120 },
  { id:'nvp',      name:'Nevirapine 200 mg tablet',               cat:'ARV', unit:'tablet', reorder:60 },
  { id:'efv',      name:'Efavirenz 600 mg tablet',                cat:'ARV', unit:'tablet', reorder:90,
    interactions:[{with:'rhze',sev:'moderate',advice:'Rifampicin lowers efavirenz levels. Monitor virological response; some guidelines increase the efavirenz dose.'}] },
  { id:'lpvr',     name:'Lopinavir/ritonavir 200/50 tablet',      cat:'ARV', unit:'tablet', reorder:120,
    interactions:[{with:'rhze',sev:'severe',advice:'Rifampicin reduces lopinavir exposure by more than 75 per cent. Do not co-prescribe without a specialist regimen change.'}] },
  { id:'inh',      name:'Isoniazid 300 mg tablet',                cat:'TB', unit:'tablet', reorder:180 },
  { id:'rhze',     name:'Rifampicin/isoniazid/pyrazinamide/ethambutol 150/75/400/275', cat:'TB', unit:'tablet', reorder:300,
    interactions:[{with:'lpvr',sev:'severe',advice:'Rifampicin and lopinavir/ritonavir are not co-prescribed. A specialist must change the regimen.'},
                  {with:'tld',sev:'moderate',advice:'Rifampicin lowers dolutegravir exposure. Follow the national guidance on dose adjustment.'},
                  {with:'flucon',sev:'moderate',advice:'Rifampicin lowers fluconazole levels. Review the antifungal regimen.'},
                  {with:'cotrim',sev:'moderate',advice:'Rifampicin lowers cotrimoxazole levels. Monitor the clinical response.'}] },
  { id:'etham',    name:'Ethambutol 400 mg tablet',               cat:'TB', unit:'tablet', reorder:120 },
  { id:'pza',      name:'Pyrazinamide 500 mg tablet',             cat:'TB', unit:'tablet', reorder:120 },
  { id:'pyridox',  name:'Pyridoxine 25 mg tablet',                cat:'Vitamin', unit:'tablet', reorder:180 },
  { id:'ferrous',  name:'Ferrous sulphate with folic acid',       cat:'Haematinic', unit:'tablet', reorder:240,
    interactions:[{with:'cipro',sev:'moderate',advice:'Separate iron and ciprofloxacin doses by at least two hours.'}] },
  { id:'folic',    name:'Folic acid 5 mg tablet',                 cat:'Vitamin', unit:'tablet', reorder:150 },
  { id:'vita',     name:'Vitamin A 200,000 IU capsule',           cat:'Vitamin', unit:'capsule', reorder:60 },
  { id:'multi',    name:'Multivitamin tablet',                    cat:'Vitamin', unit:'tablet', reorder:200 },
  { id:'ors',      name:'Oral rehydration salts sachet',          cat:'Paediatric', unit:'sachet', reorder:100 },
  { id:'zinc',     name:'Zinc sulphate 20 mg dispersible tablet', cat:'Paediatric', unit:'tablet', reorder:150 },
  { id:'meben',    name:'Mebendazole 500 mg tablet',              cat:'Antiparasitic', unit:'tablet', reorder:80 },
  { id:'alben',    name:'Albendazole 400 mg tablet',              cat:'Antiparasitic', unit:'tablet', reorder:80 },
  { id:'metf',     name:'Metformin 500 mg tablet',                cat:'Chronic', unit:'tablet', reorder:180 },
  { id:'amlo',     name:'Amlodipine 5 mg tablet',                 cat:'Chronic', unit:'tablet', reorder:150 },
  { id:'hctz',     name:'Hydrochlorothiazide 25 mg tablet',       cat:'Chronic', unit:'tablet', reorder:120 },
  { id:'aten',     name:'Atenolol 50 mg tablet',                  cat:'Chronic', unit:'tablet', reorder:90 },
  { id:'enalapril',name:'Enalapril 5 mg tablet',                  cat:'Chronic', unit:'tablet', reorder:120 },
  { id:'salbut',   name:'Salbutamol inhaler 100 mcg',             cat:'Respiratory', unit:'inhaler', reorder:24 },
  { id:'pred',     name:'Prednisolone 5 mg tablet',               cat:'Steroid', unit:'tablet', reorder:90 },
  { id:'hydro',    name:'Hydrocortisone 1 per cent cream',        cat:'Topical', unit:'tube', reorder:30 },
  { id:'clotrim',  name:'Clotrimazole 1 per cent cream',          cat:'Topical', unit:'tube', reorder:30 },
  { id:'povidone', name:'Povidone iodine 10 per cent solution',   cat:'Topical', unit:'bottle', reorder:24 },
  { id:'saline',   name:'Normal saline 0.9 per cent 500 ml',      cat:'Consumable', unit:'bag', reorder:40 },
  { id:'ringer',   name:"Ringer's lactate 500 ml",                cat:'Consumable', unit:'bag', reorder:30 },
  { id:'adren',    name:'Adrenaline 1 mg/ml injection',           cat:'Emergency', unit:'ampoule', reorder:20 },
  { id:'diazepam', name:'Diazepam 5 mg tablet',                   cat:'Emergency', unit:'tablet', reorder:20 }
];
const FORMULARY_BY_ID = Object.fromEntries(FORMULARY.map(i=>[i.id,i]));

const ALLERGY_ALIASES = [
  { cls:'Penicillin', re:/penicillin|amoxicillin|amoxil|augmentin|ampicillin/i },
  { cls:'Sulfa',      re:/sulfa|cotrimoxazole|septrin|sulfamethoxazole/i },
  { cls:'NSAID',      re:/nsaid|ibuprofen|diclofenac|aspirin|naproxen/i },
  { cls:'Cephalosporin', re:/cephalosporin|ceftriaxone|cefaclor/i }
];

const RX = {
  items(){ return FORMULARY; },
  item(id){ return FORMULARY_BY_ID[id]||null; },

  patientAllergies(p){
    const raw = [
      ...((p?.clinical?.allergies)||[]),
      ...((p?.clinical?.allergyClasses)||[])
    ].map(String).filter(Boolean);
    const out = new Set();
    raw.forEach(a=>{
      const hit = ALLERGY_ALIASES.find(x=>x.re.test(a));
      out.add(hit? hit.cls : a);
    });
    return [...out];
  },

  interactionsFor(ids){
    const set = new Set(ids);
    const out = [];
    ids.forEach(id=>{
      const it = FORMULARY_BY_ID[id]; if(!it) return;
      (it.interactions||[]).forEach(ix=>{
        if(set.has(ix.with)){
          const other = FORMULARY_BY_ID[ix.with];
          const key = [id,ix.with].sort().join('|');
          if(out.some(o=>o.key===key)) return;
          out.push({ key, a:it.name, b:other?other.name:ix.with, severity:ix.sev, advice:ix.advice });
        }
      });
    });
    return out;
  },

  /* Returns every reason a prescription should stop or warn. */
  screen(p, ids){
    const alerts = [];
    const allergies = this.patientAllergies(p);
    ids.forEach(id=>{
      const it = FORMULARY_BY_ID[id]; if(!it) return;
      if(it.allergy && allergies.includes(it.allergy)){
        alerts.push({ kind:'allergy', severity:'severe', message:`${it.name}: recorded ${it.allergy} allergy.` });
      }
    });
    const ints = this.interactionsFor(ids);
    ints.forEach(ix=>alerts.push({
      kind:'interaction', severity:ix.severity,
      message:`${ix.a} with ${ix.b}: ${ix.advice}`
    }));
    const dup = ids.filter((x,i)=>ids.indexOf(x)!==i);
    if(dup.length) alerts.push({kind:'duplicate',severity:'moderate',message:'The same medicine appears more than once on this prescription.'});
    return { alerts, severe: alerts.some(a=>a.severity==='severe'), allergies };
  },

  qtyFor(line){
    const q = Number(line.qty);
    if(q>0) return Math.round(q);
    const perDay = Number(line.perDay||0);
    const days = Number(line.days||0);
    if(perDay>0 && days>0) return Math.round(perDay*days);
    return 0;
  },

  prescribe(user, {patientId, lines, reason, overrideReason, countyId}){
    const p = repo.patient(user, patientId);
    if(!p) return {ok:false,msg:'Patient not found in your scope.'};
    if(!p.intake || !['active','extension','discharge_recommended'].includes(p.status))
      return {ok:false,msg:'A prescription is recorded against an enrolled, active patient.'};
    if(!RBAC.can(user,'clinical.prescribe',{countyId:p.countyId,areaId:p.areaId}).ok)
      return {ok:false,msg:'Your role may not prescribe. Ask the Medical Case Manager or the clinical officer.'};
    const clean = (lines||[]).filter(l=>l.itemId).map(l=>({
      itemId:l.itemId, name:FORMULARY_BY_ID[l.itemId]?.name||l.itemId,
      dose:String(l.dose||'').trim(), route:String(l.route||'Oral').trim(),
      frequency:String(l.frequency||'').trim(), days:Number(l.days||0),
      qty:this.qtyFor(l), instructions:String(l.instructions||'').slice(0,300)
    }));
    if(!clean.length) return {ok:false,msg:'Add at least one medicine.'};
    for(const l of clean){
      if(!l.dose) return {ok:false,msg:`Record the dose for ${l.name}.`};
      if(!l.days || l.days<1 || l.days>365) return {ok:false,msg:`Record a duration between 1 and 365 days for ${l.name}.`};
      if(!l.qty || l.qty<1) return {ok:false,msg:`Record a quantity for ${l.name}.`};
    }
    if(!String(reason||'').trim()) return {ok:false,msg:'A prescribing reason is required. "Routine" is not a reason.'};

    const ids = clean.map(l=>l.itemId);
    const screen = this.screen(p, ids);
    const severeAllergy = screen.alerts.some(a=>a.kind==='allergy');
    if(severeAllergy) return {ok:false,msg:screen.alerts.find(a=>a.kind==='allergy').message+' This prescription cannot be recorded. Choose a different medicine.'};
    if(screen.severe && !String(overrideReason||'').trim())
      return {ok:false,msg:'A severe interaction was found. Record the clinical reason for proceeding before continuing.', alerts:screen.alerts};
    if(screen.alerts.length && !String(overrideReason||'').trim() && screen.alerts.some(a=>a.severity==='moderate'))
      { /* moderate alerts are shown and acknowledged with the reason field, but do not block */ }

    const rx = {
      id:uid('rx'), no:'RX-'+new Date().getFullYear()+'-'+String((DB.db.clinicalRx||[]).length+1).padStart(4,'0'),
      patientId, patientName:p.name, countyId:p.countyId, areaId:p.areaId,
      prescribedBy:user.id, prescribedAt:new Date().toISOString(),
      lines:clean, reason:String(reason).trim().slice(0,400),
      alerts:screen.alerts, overrideReason:String(overrideReason||'').trim().slice(0,400),
      status:'prescribed', dispensed:[],
      allDispensed:false
    };
    DB.db.clinicalRx = DB.db.clinicalRx||[];
    DB.db.clinicalRx.unshift(rx);
    AUDIT.append({actor:user.id, action:'rx.prescribed', entity:'prescription', entityId:rx.id,
      detail:`${rx.no} · ${clean.map(l=>l.name).join('; ').slice(0,180)}${screen.alerts.length?` · ${screen.alerts.length} alert(s) acknowledged`:''}`,
      reason:String(reason).trim()});
    notify(p.caregiverId,'Prescription recorded',`${p.code} · ${clean.length} medicine(s)`,'info');
    DB.save();
    return {ok:true, rx, alerts:screen.alerts, msg:`Prescription ${rx.no} recorded.`};
  },

  prescriptions(user, filter={}){
    if(!RBAC.has(user,'pharmacy.view') && !RBAC.has(user,'clinical.prescribe')) return [];
    let rows = (DB.db.clinicalRx||[]).filter(r=>{
      const p = DB.db.patients.find(x=>x.id===r.patientId);
      return p && RBAC.patientVisible(user,p);
    });
    if(filter.patientId) rows = rows.filter(r=>r.patientId===filter.patientId);
    if(filter.status) rows = rows.filter(r=>r.status===filter.status);
    if(filter.q){ const q=filter.q.toLowerCase();
      rows=rows.filter(r=>(r.no+' '+r.patientName+' '+r.lines.map(l=>l.name).join(' ')).toLowerCase().includes(q)); }
    return rows.sort((a,b)=>new Date(b.prescribedAt)-new Date(a.prescribedAt));
  },

  rx(user,id){
    const r=(DB.db.clinicalRx||[]).find(x=>x.id===id);
    if(!r) return null;
    const p=DB.db.patients.find(x=>x.id===r.patientId);
    return p&&RBAC.patientVisible(user,p)? r : null;
  },

  stockOnHand(itemId, countyId){
    return (DB.db.stockLots||[])
      .filter(l=>l.itemId===itemId && l.countyId===countyId && l.qty>0)
      .reduce((n,l)=>n+l.qty,0);
  },

  lots(itemId, countyId){
    return (DB.db.stockLots||[])
      .filter(l=>l.itemId===itemId && l.countyId===countyId)
      .sort((a,b)=> new Date(a.expiry)-new Date(b.expiry));
  },

  /* Earliest expiry first, expired and empty batches excluded. */
  allocate(itemId, countyId, qty){
    let left = Math.max(0, Math.round(qty));
    const picks=[];
    const today = new Date(); today.setHours(0,0,0,0);
    for(const lot of this.lots(itemId,countyId)){
      if(left<=0) break;
      if(new Date(lot.expiry) < today) continue;
      if(lot.qty<=0) continue;
      const take = Math.min(left, lot.qty);
      if(take>0){ picks.push({lotId:lot.id, batch:lot.batch, expiry:lot.expiry, qty:take}); left-=take; }
    }
    return { picks, shortfall:left };
  },

  dispense(user, rxId, note=''){
    const rx = this.rx(user,rxId);
    if(!rx) return {ok:false,msg:'Prescription not found in your scope.'};
    if(!RBAC.can(user,'clinical.dispense',{countyId:rx.countyId,areaId:rx.areaId}).ok)
      return {ok:false,msg:'Your role may not dispense medication.'};
    if(rx.status==='cancelled') return {ok:false,msg:'This prescription was cancelled.'};
    if(rx.allDispensed) return {ok:false,msg:'This prescription has already been fully dispensed.'};
    const plan=[]; const short=[];
    rx.lines.forEach((l,idx)=>{
      const already=(rx.dispensed||[]).filter(d=>d.lineIndex===idx).reduce((n,d)=>n+d.qty,0);
      const want=Math.max(0,l.qty-already);
      if(want<=0) return;
      const a=this.allocate(l.itemId,rx.countyId,want);
      if(a.shortfall>0) short.push(`${l.name}: ${a.shortfall} ${this.item(l.itemId)?.unit||'unit'}(s) short`);
      if(a.picks.length) plan.push({lineIndex:idx,itemId:l.itemId,name:l.name,picks:a.picks});
    });
    if(!plan.length) return {ok:false,msg:'There is nothing available to dispense. Record a stock receipt first.'};
    if(short.length && !String(note||'').trim())
      return {ok:false,msg:'Stock is short: '+short.join('; ')+'. Record a note to dispense what is available.', short};

    const at = new Date().toISOString();
    plan.forEach(line=>{
      line.picks.forEach(pick=>{
        const lot=(DB.db.stockLots||[]).find(x=>x.id===pick.lotId);
        if(!lot) return;
        lot.qty = Math.max(0, lot.qty - pick.qty);
        DB.db.stockMoves = DB.db.stockMoves||[];
        DB.db.stockMoves.unshift({ id:uid('mv'), countyId:rx.countyId, itemId:line.itemId, lotId:lot.id,
          batch:lot.batch, qty:-pick.qty, kind:'dispense', rxId, at, by:user.id, note:note||'' });
        rx.dispensed.push({ lineIndex:line.lineIndex, itemId:line.itemId, lotId:lot.id, batch:lot.batch,
          expiry:lot.expiry, qty:pick.qty, at, by:user.id });
      });
    });
    const fully = rx.lines.every((l,idx)=>{
      const got=(rx.dispensed||[]).filter(d=>d.lineIndex===idx).reduce((n,d)=>n+d.qty,0);
      return got>=l.qty;
    });
    rx.allDispensed = fully;
    rx.status = fully? 'dispensed':'partially_dispensed';
    rx.dispensedBy = user.id; rx.dispensedAt = at;
    if(note) rx.dispenseNote = String(note).slice(0,400);
    AUDIT.append({actor:user.id,action:'rx.dispensed',entity:'prescription',entityId:rx.id,
      detail:`${rx.no} · ${fully?'fully dispensed':'partially dispensed'}${short.length?' · short: '+short.join('; '):''}`});
    DB.save();
    return {ok:true, rx, short, msg: fully?'Dispensed in full from the earliest expiry batch.':'Dispensed what was available; the balance stays on the prescription.'};
  },

  cancel(user, rxId, reason){
    const rx=this.rx(user,rxId);
    if(!rx) return {ok:false,msg:'Prescription not found.'};
    if(!RBAC.has(user,'clinical.prescribe')) return {ok:false,msg:'Your role may not cancel a prescription.'};
    if(rx.status==='dispensed') return {ok:false,msg:'A fully dispensed prescription is not cancelled. Record a clinical note and a stock return instead.'};
    if(!String(reason||'').trim()) return {ok:false,msg:'A reason is required.'};
    rx.status='cancelled'; rx.cancelReason=String(reason).slice(0,300); rx.cancelledBy=user.id; rx.cancelledAt=new Date().toISOString();
    AUDIT.append({actor:user.id,action:'rx.cancelled',entity:'prescription',entityId:rx.id,detail:String(reason).slice(0,300)});
    DB.save(); return {ok:true,rx,msg:'Prescription cancelled.'};
  },

  receive(user, {itemId, batch, expiry, qty, supplier, unitCost, countyId, note}){
    if(!RBAC.has(user,'pharmacy.manage')) return {ok:false,msg:'Your role may not receive stock.'};
    const it=FORMULARY_BY_ID[itemId];
    if(!it) return {ok:false,msg:'Choose a medicine from the formulary.'};
    const n=Math.round(Number(qty));
    if(!n || n<1) return {ok:false,msg:'Record the quantity received.'};
    if(!batch || !String(batch).trim()) return {ok:false,msg:'A batch number is required.'};
    if(!expiry || !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return {ok:false,msg:'A valid expiry date is required.'};
    if(new Date(expiry) <= new Date()) return {ok:false,msg:'An expired batch cannot be received into stock.'};
    const cc = countyId||user.countyId;
    const lot={ id:uid('lot'), countyId:cc, itemId, name:it.name, batch:String(batch).trim().slice(0,40),
      expiry, qty:n, receivedAt:new Date().toISOString(), receivedBy:user.id,
      supplier:String(supplier||'').slice(0,80), unitCost:Number(unitCost||0), note:String(note||'').slice(0,200) };
    DB.db.stockLots = DB.db.stockLots||[]; DB.db.stockLots.unshift(lot);
    DB.db.stockMoves = DB.db.stockMoves||[];
    DB.db.stockMoves.unshift({ id:uid('mv'), countyId:cc, itemId, lotId:lot.id, batch:lot.batch, qty:n,
      kind:'receipt', at:lot.receivedAt, by:user.id, note:String(note||'') });
    AUDIT.append({actor:user.id,action:'stock.received',entity:'stock',entityId:lot.id,
      detail:`${it.name} · batch ${lot.batch} · ${n} ${it.unit}(s) · expires ${expiry}`});
    DB.save();
    return {ok:true, lot, msg:`${n} ${it.unit}(s) of ${it.name} received into stock.`};
  },

  adjust(user, {lotId, delta, reason}){
    if(!RBAC.has(user,'pharmacy.manage')) return {ok:false,msg:'Your role may not adjust stock.'};
    const lot=(DB.db.stockLots||[]).find(l=>l.id===lotId);
    if(!lot) return {ok:false,msg:'Batch not found.'};
    const d=Math.round(Number(delta));
    if(!d) return {ok:false,msg:'Record a positive or negative quantity.'};
    if(!String(reason||'').trim()) return {ok:false,msg:'A stock adjustment without a written reason is refused.'};
    const after=lot.qty+d;
    if(after<0) return {ok:false,msg:'The adjustment would take the batch below zero.'};
    lot.qty=after;
    DB.db.stockMoves=DB.db.stockMoves||[];
    DB.db.stockMoves.unshift({ id:uid('mv'), countyId:lot.countyId, itemId:lot.itemId, lotId:lot.id, batch:lot.batch,
      qty:d, kind:'adjust', at:new Date().toISOString(), by:user.id, note:String(reason).slice(0,300) });
    AUDIT.append({actor:user.id,action:'stock.adjusted',entity:'stock',entityId:lot.id,
      detail:`${lot.name} · batch ${lot.batch} · ${d>0?'+':''}${d} · ${String(reason).slice(0,160)}`});
    DB.save(); return {ok:true,lot,msg:'Stock adjusted and written to the ledger.'};
  },

  alerts(user){
    if(!RBAC.has(user,'pharmacy.view')) return { expired:[], expiring:[], low:[], out:[] };
    const cc=user.countyId; const today=new Date(); today.setHours(0,0,0,0);
    const in60=new Date(today.getTime()+60*86400000);
    const lots=(DB.db.stockLots||[]).filter(l=>l.countyId===cc);
    const expired=lots.filter(l=>l.qty>0 && new Date(l.expiry)<today);
    const expiring=lots.filter(l=>l.qty>0 && new Date(l.expiry)>=today && new Date(l.expiry)<=in60);
    /* Only medicines this county actually stocks are judged against the
       reorder level. A formulary item that was never received here is not
       "out of stock"; it is simply not stocked, and saying otherwise would
       bury the genuine shortages in a list of fifty. */
    const stocked=new Set(lots.map(l=>l.itemId));
    (DB.db.stockMoves||[]).forEach(m=>{ if(m.countyId===cc) stocked.add(m.itemId); });
    const low=[]; const out=[]; let notStocked=0;
    FORMULARY.forEach(it=>{
      if(!stocked.has(it.id)){ notStocked++; return; }
      const on=this.stockOnHand(it.id,cc);
      if(on===0) out.push({item:it,on});
      else if(on<=it.reorder) low.push({item:it,on,reorder:it.reorder});
    });
    return {expired,expiring,low,out,notStocked};
  },

  usage(user,{from,to}={}){
    if(!RBAC.has(user,'pharmacy.view')) return [];
    const cc=user.countyId;
    const f=from? new Date(from): new Date(Date.now()-30*86400000);
    const t=to? new Date(to): new Date();
    const map={};
    (DB.db.stockMoves||[]).filter(m=>m.countyId===cc && m.kind==='dispense' && new Date(m.at)>=f && new Date(m.at)<=t)
      .forEach(m=>{ map[m.itemId]=(map[m.itemId]||0)+Math.abs(m.qty); });
    return Object.entries(map).map(([id,qty])=>({item:FORMULARY_BY_ID[id], qty}))
      .filter(r=>r.item).sort((a,b)=>b.qty-a.qty);
  },

  csv(user){
    const rows = this.stockRows(user);
    return toCSV(rows,[
      {label:'Medicine',get:r=>r.item.name},
      {label:'Batch',get:r=>r.batch},
      {label:'Expiry',get:r=>r.expiry},
      {label:'Quantity',get:r=>r.qty},
      {label:'Unit',get:r=>r.item.unit},
      {label:'County',get:r=>countyName(r.countyId)}
    ]);
  },

  stockRows(user){
    if(!RBAC.has(user,'pharmacy.view')) return [];
    const cc=user.countyId;
    return (DB.db.stockLots||[]).filter(l=>l.countyId===cc && l.qty>0)
      .map(l=>({...l, item:FORMULARY_BY_ID[l.itemId]}))
      .filter(r=>r.item)
      .sort((a,b)=> new Date(a.expiry)-new Date(b.expiry));
  }
};

/* ---------------- printable prescription ---------------- */
function prescriptionDoc(rx){
  const p=DB.db.patients.find(x=>x.id===rx.patientId);
  return `<div class="form-doc">
    <div class="doc-head"><img src="${window.LOGO||''}" alt="">
      <div><div class="doc-org">LOMAMO FOUNDATION KENYA</div><h2>Prescription</h2>
        <div class="doc-sub">${esc(countyName(rx.countyId))} · LOMAMO C-DIMS</div></div>
      <div class="doc-code">${esc(rx.no)}</div></div>
    <div class="doc-meta">
      <span><b>Patient</b> ${esc(rx.patientName)}</span>
      <span><b>Code</b> ${esc(p?.code||'')}</span>
      <span><b>Date</b> ${esc(fmtDate(rx.prescribedAt))}</span>
      <span><b>Prescriber</b> ${esc(userName(rx.prescribedBy))}</span>
    </div>
    <table class="tbl" style="margin-top:10px"><thead><tr><th>Medicine</th><th>Dose</th><th>Route</th><th>Frequency</th><th>Days</th><th>Quantity</th></tr></thead>
      <tbody>${rx.lines.map(l=>`<tr><td>${esc(l.name)}</td><td>${esc(l.dose)}</td><td>${esc(l.route)}</td><td>${esc(l.frequency)}</td><td>${l.days}</td><td>${l.qty}</td></tr>`).join('')}</tbody></table>
    <div class="doc-section"><h4>Prescribing reason</h4><p>${esc(rx.reason)}</p></div>
    ${rx.alerts?.length?`<div class="doc-section"><h4>Safety checks</h4>${rx.alerts.map(a=>`<div class="doc-row"><span class="dl">${esc(titleCase(a.kind))} (${esc(a.severity)})</span><span class="dv">${esc(a.message)}</span></div>`).join('')}
      ${rx.overrideReason?`<div class="doc-row"><span class="dl">Reason for proceeding</span><span class="dv">${esc(rx.overrideReason)}</span></div>`:''}</div>`:''}
    ${rx.dispensed?.length?`<div class="doc-section"><h4>Dispensed</h4>${rx.dispensed.map(d=>`<div class="doc-row"><span class="dl">${esc(FORMULARY_BY_ID[d.itemId]?.name||d.itemId)}</span><span class="dv">Batch ${esc(d.batch)} · expires ${esc(d.expiry)} · ${d.qty}</span></div>`).join('')}</div>`:''}
    <div class="doc-note">Prescribed by ${esc(userName(rx.prescribedBy))} on ${esc((rx.prescribedAt||'').slice(0,16).replace('T',' '))}. ${rx.dispensedAt?`Dispensed by ${esc(userName(rx.dispensedBy))} on ${esc((rx.dispensedAt||'').slice(0,10))}.`:''}
      This prescription is valid only for the named patient and is recorded in the audit trail.</div>
  </div>`;
}

/* ---------------- views ---------------- */
function renderPharmacy(user){
  if(!RBAC.has(user,'pharmacy.view') && !RBAC.has(user,'clinical.prescribe')) return deniedPanel('pharmacy.view');
  const a=RX.alerts(user), rows=RX.stockRows(user), rxs=RX.prescriptions(user).slice(0,25);
  const usage=RX.usage(user,{});
  const mayManage=RBAC.has(user,'pharmacy.manage');
  return pageHead('Pharmacy & prescriptions','Stock, expiry and the prescription ledger. Quantities change only through the ledger.',
    `<button class="btn btn-sm btn-ghost" data-act="download-stock-csv">${ic('download',15)} Export stock</button>
     <button class="btn btn-sm btn-ghost" data-act="download-stock-xlsx">${ic('download',15)} Excel workbook</button>
     ${mayManage?`<button class="btn btn-sm btn-primary" data-act="receive-stock">${ic('plus',15)} Receive stock</button>`:''}
     ${RBAC.has(user,'clinical.prescribe')?`<button class="btn btn-sm btn-primary" data-act="new-prescription">${ic('plus',15)} Prescribe</button>`:''}`)
  + `<div class="grid g4" style="margin-bottom:16px">
      ${kpi('Batches in stock', num(rows.length),'Not expired, quantity above zero','','package')}
      ${kpi('Expired', num(a.expired.length),'Remove from the shelf','crit','alert')}
      ${kpi('Expiring in 60 days', num(a.expiring.length),'Dispense first','warn','clock')}
      ${kpi('Below reorder level', num(a.low.length+a.out.length),`${a.out.length} at zero · ${a.notStocked||0} not stocked here`,'warn','database')}
    </div>`
  + (a.expired.length?alertBox('crit','Expired stock must not be dispensed',`<span class="small">${a.expired.map(l=>`${esc(l.name)} batch ${esc(l.batch)} expired ${esc(fmtDate(l.expiry))} (${l.qty})`).join(' · ')}</span>`):'')
  + (a.out.length?alertBox('warn','Stocked items at zero',`<span class="small">${a.out.slice(0,8).map(x=>esc(x.item.name)).join(', ')}${a.out.length>8?' and '+(a.out.length-8)+' more':''}. Receive a batch or record an adjustment.</span>`):'')
  + `<div class="grid g2" style="margin-bottom:16px">
      ${card('Stock on hand', table([
        {label:'Medicine',render:r=>`${esc(r.item.name)}<div class="xs muted">${esc(r.item.cat)}</div>`},
        {label:'Batch',render:r=>esc(r.batch)},
        {label:'Expiry',render:r=>`${esc(fmtDate(r.expiry))}${daysBetween(new Date(),r.expiry)>60?'':' <span class="badge b-warn">Soon</span>'}`},
        {label:'Qty',cls:'num',render:r=>`${num(r.qty)} <span class="xs muted">${esc(r.item.unit)}</span>`},
        {label:'',cls:'act',render:r=>mayManage?`<button class="btn btn-xs btn-ghost" data-act="adjust-stock" data-id="${r.id}">Adjust</button>`:''}
      ], rows.slice(0,40), {emptyMsg:'No stock recorded for this county.'}), {foot:'<span>Earliest expiry is dispensed first. Expired batches are excluded from dispensing.</span>'})}
      ${card('Dispensing in the last 30 days', usage.length? barChart(usage.slice(0,8).map(u=>({label:u.item.name.split(' ')[0]+' '+(u.item.name.split(' ')[1]||''), value:u.qty})), {max:null})
        : emptyState('No dispensing recorded','Stock movements appear here once prescriptions are dispensed.','package'),
        {foot:'<span>Counts are quantities from the stock ledger, not estimates.</span>'})}
    </div>`
  + card('Prescriptions', table([
      {label:'Prescription',render:r=>`<b>${esc(r.no)}</b><div class="xs muted">${esc(fmtDate(r.prescribedAt))}</div>`},
      {label:'Patient',render:r=>esc(r.patientName)},
      {label:'Medicines',render:r=>esc(r.lines.map(l=>l.name.split(' ')[0]).join(', '))},
      {label:'Alerts',render:r=>r.alerts?.length?badge(r.alerts.length+' alert'+(r.alerts.length===1?'':'s'),'b-warn'):badge('None','b-ok')},
      {label:'Status',render:r=>badge(titleCase(r.status.replace('_',' ')), r.status==='dispensed'?'b-ok':r.status==='partially_dispensed'?'b-warn':r.status==='cancelled'?'b-crit':'b-neutral')},
      {label:'',cls:'act',render:r=>`<button class="btn btn-xs btn-ghost" data-act="open-rx" data-id="${r.id}">Open</button>`}
    ], rxs, {emptyMsg:'No prescriptions recorded.'}),
    {foot:`<span>${ic('lock',13)} A prescription needs a clinical role. An allergy stops it; a severe interaction needs a written clinical reason.</span>`});
}
