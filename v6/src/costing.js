/* ============================================================
   costing.js - The cost-per-patient engine

   Why it exists
   -------------
   The Administration's master workbook already answers one question
   better than any other: what did it cost to serve this patient?
   Sheet 'Extra MI' computes "KISUMU Costprice food per visited
   patient" as  Expenses food / Visited patients, per month, and an
   average per unique patient. Sheet 'CCC1' carries foodbags issued
   up to a month against visited patients and average food per
   patient, and the days each patient has been in the programme.
   The ministry-area sheets carry, per patient, the weekly foodbag
   grid (Bag 1 / Bag 2 / Special bag), hygiene packs per quarter,
   transport cost in and out of hospital, medication cost, outpatient
   cost, SHIF, in-patient cost 1-4 and a total cost column.

   This engine takes the same idea and makes it live, scoped and
   charted: every cost line the system already records - hospital
   fees, transport, foodbags by type, medication, SHIF, in-patient
   care, hygiene packs - is attributed to a patient, then rolled up
   to ministry area, county, national level, disease category,
   department and month.

   Who sees what
   -------------
   * A caregiver or coordinator sees the cost of the patients they
     serve: total for the ministry area, average per patient, cost
     per patient-day, and the bag mix. Not the ledger of another area.
   * A department sees the cost of its own service (pharmacy sees
     drugs, hospital desk sees hospital fees, fleet sees transport,
     procurement sees what it bought).
   * Finance, procurement, audit and leadership see the whole picture
     inside their county or national reach, including the raw ledger.
   * Disease-category figures need clinical aggregate authority;
     without it the engine shows the cost buckets, not the diagnoses.
   ============================================================ */

/* ---------------- 1. Cost categories, mapped to the master workbook ------- */
const COST_CATEGORIES = [
  { id:'foodbag',    name:'Food & foodbags',        group:'Programme', dept:'ministry',  master:'Week grid AB..CB; counts CC Bag 1, CD Bag 2, CE Special bag', colour:'#B45309' },
  { id:'hygiene',    name:'Hygiene packs & Water Guard', group:'Programme', dept:'procure', master:'CG..CN hygiene packs & extra Water Guard per quarter', colour:'#0E7490' },
  { id:'support',    name:'Other household support', group:'Programme', dept:'ministry',  master:'DN Intake, DO Saved, DP Mosquito net, DT Bible, DU ARVs, DV PSC', colour:'#7C3AED' },
  { id:'medication', name:'Medication',              group:'Medical',   dept:'pharmacy',  master:'EB "Fill in OTHER PATIENT COST - Medications Costs"', colour:'#0F7B4F' },
  { id:'tb',         name:'TB drugs & pyridoxine',   group:'Medical',   dept:'pharmacy',  master:'CS/CV TB columns; DB TB Grant ZvAfrika', colour:'#115E59' },
  { id:'outpatient', name:'Outpatient & investigations', group:'Medical', dept:'hospital', master:'ED Out patient Costs; DW Hospital Out Patient visits', colour:'#1D4ED8' },
  { id:'inpatient',  name:'In-patient care',         group:'Medical',   dept:'hospital',  master:'EG..EK "Fill in IN PATIENT COST" Cost 1-4; DX/DY hospital in', colour:'#BE123C' },
  { id:'shif',       name:'SHIF / SHA contributions', group:'Medical',  dept:'finance',   master:'EE SHIF; column D NHIF / LMM / Other', colour:'#0891B2' },
  { id:'transport',  name:'Patient transport',       group:'Transport', dept:'vehicle',   master:'EA "Transportcost patients In and Out Hospital"; EC Transport Costs', colour:'#475569' },
  { id:'consultation', name:'Consultation & lab',    group:'Medical',   dept:'hospital',  master:'Hospital outpatient visit form: investigations', colour:'#9A5B00' }
];
const COST_CAT = Object.fromEntries(COST_CATEGORIES.map(c=>[c.id,c]));
const costCatName = id => (COST_CAT[id]||{}).name || titleCase(String(id||'other'));

/* Map whatever the rest of the system calls a cost onto one category. */
const COST_MAP_CATEGORY = {
  food:'foodbag', foodbag:'foodbag', nutrition:'foodbag', hygiene:'hygiene', water:'hygiene',
  medication:'medication', drugs:'medication', pharmacy:'medication', arv:'medication', tb:'tb', pyridoxine:'tb',
  outpatient:'outpatient', consultation:'consultation', lab:'consultation', investigations:'consultation',
  inpatient:'inpatient', admission:'inpatient', shif:'shif', sha:'shif', nhif:'shif',
  transport:'transport', fare:'transport', fuel:'transport', escort:'transport',
  support:'support', bible:'support', net:'support', mattress:'support', blanket:'support', other:'support'
};
const COST_MAP_BUDGET = {
  food:'foodbag', patient_tpt:'transport', staff_tpt:'transport', medication:'medication',
  outpatient:'outpatient', shif:'shif', fuel:'transport', maint:'transport', other:'support'
};
function costCategoryOf(raw, budgetLine){
  const k = String(raw||'').toLowerCase().replace(/[^a-z]/g,'');
  if(COST_MAP_CATEGORY[k]) return COST_MAP_CATEGORY[k];
  for(const key of Object.keys(COST_MAP_CATEGORY)) if(k.includes(key)) return COST_MAP_CATEGORY[key];
  const b = String(budgetLine||'').toLowerCase();
  return COST_MAP_BUDGET[b] || 'support';
}

/* ---------------- 2. Unit cost standards ----------------
   A standard is what one unit of support costs. It is set by Finance or
   Procurement, per county, and it is what turns "Bag 2 issued" into money
   when no receipt exists yet. The default values are the Administration's
   own working figures and are editable at any time. */
const COST_UNIT_DEFAULTS = [
  { id:'BG1',  name:'Bag 1 - normal household food bag', cat:'foodbag',    unit:'bag',    cost:1400, master:'Tabel!I5 = BG1; week grid entry BG1' },
  { id:'BG2',  name:'Bag 2 - family / couple food bag',  cat:'foodbag',    unit:'bag',    cost:2100, master:'Tabel!I6 = BG2; week grid entry BG2' },
  { id:'SPB',  name:'Special bag',                       cat:'foodbag',    unit:'bag',    cost:2800, master:'Tabel!I7 = SPB; column W SPECIAL BAG' },
  { id:'HP',   name:'Hygiene pack (quarterly)',          cat:'hygiene',    unit:'pack',   cost:650,  master:'CG/CI/CK/CM "Fill number of HP in Quarter"' },
  { id:'WG',   name:'Extra Water Guard',                 cat:'hygiene',    unit:'unit',   cost:180,  master:'CH/CJ/CL/CN "Fill in number Extra WG"' },
  { id:'VIT',  name:'Vitamins / multivitamin course',    cat:'medication', unit:'course', cost:320,  master:'CQ Vitamins; CR Last month given' },
  { id:'PYR10',name:'Pyridoxine (B6) - 10-day course',   cat:'tb',         unit:'course', cost:220,  master:'TB protocol: one dose covers ten days' },
  { id:'PYR14',name:'Pyridoxine (B6) - 14-day supply',   cat:'tb',         unit:'course', cost:300,  master:'TB protocol: two-week request' },
  { id:'PYR30',name:'Pyridoxine (B6) - one month supply',cat:'tb',         unit:'course', cost:600,  master:'TB protocol: monthly request, case manager approval' },
  { id:'ARV',  name:'ARV refill support',                cat:'medication', unit:'refill', cost:450,  master:'DU "ARV\'s"' },
  { id:'BIBLE',name:'Bible',                             cat:'support',    unit:'item',   cost:350,  master:'DT Bible' },
  { id:'NET',  name:'Mosquito net',                      cat:'support',    unit:'item',   cost:900,  master:'DP Mosquito net' },
  { id:'MATT', name:'Mattress',                          cat:'support',    unit:'item',   cost:2500, master:'Extra: Blanket / Mattress / Mackintosh' },
  { id:'BLANK',name:'Blanket',                           cat:'support',    unit:'item',   cost:1200, master:'Extra: Blanket' },
  { id:'TRIP', name:'Patient transport - return trip',   cat:'transport',  unit:'trip',   cost:600,  master:'EA Transportcost patients In and Out Hospital' },
  { id:'ESC',  name:'Escort allowance (per person)',     cat:'transport',  unit:'person', cost:250,  master:'Hospital request transport escort' },
  { id:'OPD',  name:'Outpatient visit (average)',        cat:'outpatient', unit:'visit',  cost:1500, master:'MI 2026 rows 349-352: patients visited / visits / average' },
  { id:'IPD',  name:'In-patient day (average)',          cat:'inpatient',  unit:'day',    cost:2800, master:'EG..EK In-patient cost 1-4' }
];

/* ---------------- 3. State ---------------- */
const COST_STATE = {
  tab:'overview', from:'', to:'', countyId:'', areaId:'', cat:'', disease:'', dept:'',
  q:'', sort:'total', page:1, perPage:25
};

/* ---------------- 4. The engine ---------------- */
const COSTX = {
  perPage:25,

  /* --- standards ------------------------------------------------------- */
  standards(user){
    if(!DB.db) return COST_UNIT_DEFAULTS.slice();
    DB.db.costStandards = DB.db.costStandards || {};
    const county = (user && user.countyId) || '';
    return COST_UNIT_DEFAULTS.map(d=>{
      const nat = DB.db.costStandards[d.id];
      const loc = county && DB.db.costStandards[d.id+'@'+county];
      const rec = loc || nat || {};
      return { ...d, cost: rec.cost!==undefined? Number(rec.cost) : d.cost,
        source: loc? 'county' : nat? 'national' : 'default',
        setBy: rec.setBy||'', setAt: rec.setAt||'' };
    });
  },
  standard(user, id){ return this.standards(user).find(s=>s.id===id) || null; },
  unitCost(user, id){ const s=this.standard(user,id); return s? Number(s.cost)||0 : 0; },

  setStandard(user, id, cost, opts={}){
    if(!RBAC.has(user,'cost.standard.manage') && !RBAC.has(user,'cost.standard.national'))
      return { ok:false, msg:'Your role may not set cost standards. Finance, Procurement and the County Office Administrator set county standards; the Director, the President and the Chief Program Administrator set national ones.' };
    const note = opts.note!==undefined? opts.note : (typeof opts==='string'? opts : '');
    const wantNational = String(opts.scope||'').toLowerCase()==='national';
    if(wantNational && !RBAC.has(user,'cost.standard.national'))
      return { ok:false, msg:'A national cost standard may only be set by the Director, the President or the Chief Program Administrator.' };
    const national = wantNational && RBAC.has(user,'cost.standard.national');
    const key = national ? id : (id+'@'+(user.countyId||'kisumu'));
    const def = COST_UNIT_DEFAULTS.find(d=>d.id===id);
    if(!def) return { ok:false, msg:'That unit is not on the standard cost table.' };
    const value = Math.round(Number(cost));
    if(!(value>=0) || value>10000000) return { ok:false, msg:'Enter a cost between 0 and 10,000,000 KES.' };
    DB.db.costStandards = DB.db.costStandards || {};
    const before = (DB.db.costStandards[key]||{}).cost;
    DB.db.costStandards[key] = { cost:value, setBy:user.id, setAt:todayISO(), note:String(note||'') };
    AUDIT.append({ actor:user.id, action:'cost.standard.set', entity:'cost_standard', entityId:key,
      detail:`${def.name}: ${before===undefined?'default '+def.cost:before} -> ${value} KES (${national?'national':countyName(user.countyId)})${note?' - '+note:''}`, before, after:value });
    DB.save();
    return { ok:true, key, national: !key.includes('@') };
  },

  /* --- the ledger ------------------------------------------------------ */
  /* Building the ledger walks every transaction, support issue, visit form,
     hospital request and TB dispense in the database. It is therefore built
     once per user and per data shape, and every chart, table and sparkline on
     the page reads the same cached rows. */
  _cache:{ key:'', rows:null },
  invalidate(){ this._cache = { key:'', rows:null }; },
  _cacheKey(user){
    const db = DB.db||{};
    return [user.id, user.countyId, (user.areaIds||[]).join(','), user.roleId,
      (db.patients||[]).length, (db.transactions||[]).length, (db.support||db.supportIssues||[]).length,
      (db.formRecords||[]).length, (db.requests||[]).length, (db.tbDispenses||[]).length, (db.urgentCases||[]).length,
      JSON.stringify(db.costStandards||{}), JSON.stringify(db.budgets||[]).length].join('|');
  },
  /* One normalised shape for every cost the system holds:
     {id, patientId, countyId, areaId, cat, dept, amount, qty, unit, date,
      source, ref, by, bag} */
  lines(user, filter={}){
    if(!RBAC.has(user,'cost.view') && !RBAC.has(user,'cost.ledger') && !RBAC.has(user,'finance.view')){
      AUDIT.deny(user,'cost.view',{},'no cost capability'); return [];
    }
    const key = this._cacheKey(user);
    if(this._cache.key===key && this._cache.rows) return this._filter(this._cache.rows, user, filter);
    const rows = this._build(user);
    this._cache = { key, rows };
    return this._filter(rows, user, filter);
  },

  _build(user){
    const db = DB.db; if(!db) return [];
    const role = roleObj(user.roleId)||{scope:{}};
    const scope = role.scope||{};
    const global = scope.geo==='global' || scope.crossCounty===true;
    const ledger = RBAC.has(user,'cost.ledger') || RBAC.has(user,'finance.view');
    const visible = RBAC.has(user,'patient.list') ? RBAC.patientIds(user) : new Set();
    const lens0 = this.lensFor(user);
    const std = this.standards(user);
    const stdCost = id => { const s=std.find(x=>x.id===id); return s? Number(s.cost)||0 : 0; };
    const out = [];
    const push = l => { if(l && Number(l.amount)>0) out.push(l); };
    const inCounty = c => global || !c || c===user.countyId;

    /* (1) financial transactions - hospital fees, transport, medication, food */
    (db.transactions||[]).forEach(t=>{
      if(!inCounty(t.countyId)) return;
      const cat = costCategoryOf(t.category, t.budgetLine);
      const p = t.patientId ? (db.patients||[]).find(x=>x.id===t.patientId) : null;
      push({ id:'tx:'+t.id, patientId:t.patientId||'', countyId:t.countyId||(p?p.countyId:''),
        areaId:p? p.areaId : '', cat, dept:(COST_CAT[cat]||{}).dept||'finance',
        amount:Number(t.amount)||0, qty:1, unit:'line', date:String(t.date||'').slice(0,10),
        source:'transaction', ref:t.no||t.ref||'', by:t.enteredBy||'', status:t.status||'',
        receipt:!!t.receipt, budgetLine:t.budgetLine||'' });
    });

    /* (2) support issues - foodbags, bibles, nets, hygiene packs */
    (db.support||db.supportIssues||[]).forEach(s=>{
      if(!inCounty(s.countyId)) return;
      const p = s.patientId ? (db.patients||[]).find(x=>x.id===s.patientId) : null;
      const item = String(s.item||s.description||'').toLowerCase();
      const bag = /special/.test(item)? 'SPB' : /family|couple|bag 2|bg2/.test(item)? 'BG2'
        : /hygiene|water guard/.test(item)? 'HP' : /normal|bag 1|bg1|food/.test(item)? 'BG1'
        : /bible/.test(item)? 'BIBLE' : /net/.test(item)? 'NET' : /mattress/.test(item)? 'MATT'
        : /blanket/.test(item)? 'BLANK' : /vitamin/.test(item)? 'VIT' : '';
      const cat = bag==='HP'||bag==='WG'? 'hygiene' : (bag==='BG1'||bag==='BG2'||bag==='SPB')? 'foodbag'
        : costCategoryOf(s.type||item, '');
      const qty = Math.max(1, Number(s.qty)||1);
      const amount = Number(s.amount)>0? Number(s.amount) : (bag? stdCost(bag)*qty : 0);
      push({ id:'sup:'+s.id, patientId:s.patientId||'', countyId:s.countyId||(p?p.countyId:''),
        areaId:s.areaId||(p?p.areaId:''), cat, dept:(COST_CAT[cat]||{}).dept||'ministry',
        amount, qty, unit:bag||'item', bag, date:String(s.date||'').slice(0,10),
        source:'support', ref:s.item||'', by:s.by||s.issuedBy||'' });
    });

    /* (3) costs registered on a home visit or hospital visit form:
          hospital fees, transport cost, foodbag type issued, medication,
          outpatient, SHIF and in-patient cost - the master workbook's
          EB..EL columns, captured where the visit is recorded. */
    (db.formRecords||[]).forEach(f=>{
      if(!inCounty(f.countyId)) return;
      const d = f.data||{};
      const p = f.patientId ? (db.patients||[]).find(x=>x.id===f.patientId) : null;
      const date = String(f.visitDate||f.submittedAt||f.createdAt||'').slice(0,10);
      const countyId = f.countyId||(p?p.countyId:''), areaId = f.areaId||(p?p.areaId:'');
      const base = { patientId:f.patientId||'', countyId, areaId, date, source:'form:'+f.kind, ref:f.code||'', by:f.enteredBy||'' };
      const add = (id, cat, amount, qty, unit, bag)=>push({ ...base, id:'frm:'+f.id+':'+id, cat,
        dept:(COST_CAT[cat]||{}).dept||'ministry', amount:Number(amount)||0, qty:Number(qty)||1, unit:unit||'line', bag:bag||'' });
      add('hospitalFees','outpatient', d.hospitalFees, 1, 'visit');
      add('transportCost','transport', d.transportCost, 1, 'trip');
      add('medicationCost','medication', d.medicationCost, 1, 'course');
      add('outPatientCost','outpatient', d.outPatientCost, 1, 'visit');
      add('shifCost','shif', d.shifCost, 1, 'contribution');
      add('inPatientCost','inpatient', d.inPatientCost, 1, 'day');
      add('investigationAmount','consultation', d.investigationAmount, 1, 'test');
      add('medicationAmount','medication', d.medicationAmount, 1, 'course');
      const bagCode = String(d.foodBagCode||'').slice(0,3).toUpperCase();
      const bagLabel = String(d.foodBagDelivered||'').toLowerCase();
      const bag = ['BG1','BG2','SPB'].includes(bagCode)? bagCode
        : (/special/.test(bagLabel)? 'SPB' : /family|couple/.test(bagLabel)? 'BG2' : /normal/.test(bagLabel)? 'BG1' : '');
      if(bag && !(Number(d.foodBagCost)>0)) add('foodBag:'+bag,'foodbag', stdCost(bag), 1, 'bag', bag);
      if(bag && Number(d.foodBagCost)>0) add('foodBagCost:'+bag,'foodbag', d.foodBagCost, 1, 'bag', bag);
      if(Number(d.hygienePacks)>0) add('hygienePacks','hygiene', stdCost('HP')*Number(d.hygienePacks), d.hygienePacks, 'pack');
      if(Number(d.waterGuardQty)>0) add('waterGuard','hygiene', stdCost('WG')*Number(d.waterGuardQty), d.waterGuardQty, 'unit');
    });

    /* (4) hospital requests: transport fare and the reconciled final cost
          where no transaction line exists yet (never counted twice). */
    (db.requests||[]).forEach(r=>{
      if(!inCounty(r.countyId)) return;
      const p = r.patientId ? (db.patients||[]).find(x=>x.id===r.patientId) : null;
      const hasTx = (db.transactions||[]).some(t=>t.requestId===r.id);
      const date = String(r.submittedAt||r.createdAt||'').slice(0,10);
      const base = { patientId:r.patientId||'', countyId:r.countyId||(p?p.countyId:''), areaId:r.areaId||(p?p.areaId:''),
        date, source:'request', ref:r.no||r.code||'', by:r.requestedBy||r.caregiverId||'' };
      const fare = Number((r.transport||{}).fare)||0;
      if(fare>0) push({ ...base, id:'rq:'+r.id+':fare', cat:'transport', dept:'vehicle', amount:fare,
        qty:Number((r.transport||{}).persons)||1, unit:'trip' });
      if(!hasTx && Number(r.finalCost)>0) push({ ...base, id:'rq:'+r.id+':final', cat:'outpatient', dept:'hospital',
        amount:Number(r.finalCost), qty:1, unit:'case' });
    });

    /* (5) The urgent-case register (the workbook's hidden URGCAS sheet): NAME,
          WHAT, COSTS against a budget line, with the month and running year
          totals computed in waiting_urgent.js. */
    (db.urgentCases||[]).forEach(u=>{
      if(!inCounty(u.countyId)) return;
      const p = u.patientId ? (db.patients||[]).find(x=>x.id===u.patientId) : null;
      if(!ledger && !(p && visible.has(p.id))) return;
      const cat = costCategoryOf(u.budgetLine, u.budgetLine);
      push({ id:'uc:'+u.id, patientId:u.patientId||'', countyId:u.countyId||(p?p.countyId:''),
        areaId:u.areaId||(p?p.areaId:''), cat, dept:(COST_CAT[cat]||{}).dept||'finance',
        amount:Number(u.costs)||0, qty:1, unit:'case', date:String(u.date||'').slice(0,10),
        source:'urgent-case', ref:String(u.what||'').slice(0,40), by:u.addedBy||'',
        budgetLine:u.budgetLine||'' });
    });

    /* (6) TB dispensing control: every dose handed over is a cost */
    if(typeof TBCARE!=='undefined' && Array.isArray(db.tbDispenses)){
      (db.tbDispenses||[]).forEach(x=>{
        if(!inCounty(x.countyId)) return;
        const p = x.patientId ? (db.patients||[]).find(y=>y.id===x.patientId) : null;
          push({ id:'tb:'+x.id, patientId:x.patientId||'', countyId:x.countyId||(p?p.countyId:''), areaId:x.areaId||(p?p.areaId:''),
          cat:'tb', dept:'pharmacy', amount: Number(x.cost)>0? Number(x.cost) : stdCost(x.unitId||'PYR10')*(Number(x.qty)||1),
          qty:Number(x.qty)||1, unit:x.unitId||'PYR10', date:String(x.dispensedAt||x.dueDate||'').slice(0,10),
          source:'tb-dispense', ref:x.no||'', by:x.dispensedBy||'' });
      });
    }

    /* ---- one identity rule for the whole ledger ----
       A line is returned if any of these is true:
         (a) the account reads the ledger (Finance, Audit, Procurement, county
             and national reach) - it sees the record as it stands;
         (b) the patient is inside the account's own scope - a caregiver,
             coordinator, case manager or nurse sees the whole cost of the
             patients they serve, with identity;
         (c) the line belongs to this account's own departmental lens - the
             pharmacy, the hospital desk, the fleet and procurement see the cost
             of their own service ACROSS patients, de-identified: the patient
             reference is removed here, in the data layer, so no screen can put
             it back. */
    return out.filter(l=>{
      if(ledger) return true;
      if(l.patientId && visible.has(l.patientId)) return true;
      if(lens0.depts && l.dept && lens0.depts.includes(l.dept)){
        l.anon = true; l.patientId = '';
        return true;
      }
      return false;
    });
  },

  /* Filters and the department lens are applied to the cached ledger. */
  _filter(base, user, filter={}){
    const role = roleObj(user.roleId)||{scope:{}};
    const scope = role.scope||{};
    const global = scope.geo==='global' || scope.crossCounty===true;
    let rows = base;
    if(filter.from) rows = rows.filter(l=>l.date && l.date>=String(filter.from).slice(0,10));
    if(filter.to)   rows = rows.filter(l=>l.date && l.date<=String(filter.to).slice(0,10));
    if(filter.countyId && filter.countyId!=='all') rows = rows.filter(l=>l.countyId===filter.countyId);
    else if(!global) rows = rows.filter(l=>!l.countyId || l.countyId===user.countyId);
    if(filter.areaId) rows = rows.filter(l=>l.areaId===filter.areaId);
    if(filter.cat) rows = rows.filter(l=>l.cat===filter.cat);
    if(filter.patientId) rows = rows.filter(l=>l.patientId===filter.patientId);
    /* department lens: a department sees the cost of its own service */
    const lens = this.lensFor(user);
    if(lens.depts) rows = rows.filter(l=>lens.depts.includes(l.dept));
    if(filter.dept) rows = rows.filter(l=>l.dept===filter.dept);
    if(filter.q){
      const q = String(filter.q).toLowerCase();
      const pById = new Map((DB.db.patients||[]).map(p=>[p.id,p]));
      rows = rows.filter(l=>{
        const p = l.patientId? pById.get(l.patientId) : null;
        return (p && (p.name+' '+p.code).toLowerCase().includes(q)) || String(l.ref||'').toLowerCase().includes(q) || String(l.cat).includes(q);
      });
    }
    return rows.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  },

  /* Which slice of the cost picture this account works in.

     Two different questions are asked of this engine, and the lens answers
     both without mixing them up:

       · "What did it cost to serve MY patients?" - asked by the people who
         serve them. A caregiver, a coordinator, a case manager, a nurse and
         the hospital desk all see the WHOLE cost of the patients in their
         scope: the food bag, the transport, the medication, the SHIF
         contribution and the in-patient stay. Cutting that up by department
         would hide part of the answer from the person accountable for it.

       · "What did MY SERVICE cost?" - asked by a department that owns one
         service across many patients: pharmacy, hospital coordination, fleet
         and procurement. Those accounts see their own service only.

     Money roles (Finance, Procurement ledger readers, Audit) and national
     reach see everything inside their geography. */
  lensFor(user){
    const role = roleObj(user.roleId)||{scope:{}};
    const s = role.scope||{};
    const dept = user.departmentId || role.dept || '';
    const money = RBAC.has(user,'cost.ledger') || RBAC.has(user,'finance.view') || RBAC.has(user,'audit.view');
    if(money || s.geo==='global' || s.crossCounty) return { depts:null, label:'All services', scope:'full' };
    /* A field or clinical role answers the first question: the whole cost of
       the patients it serves, patient scope already applied by the ledger. */
    if(s.records==='areas' || s.geo==='areas' || ['ministry','medical'].includes(dept))
      return { depts:null, label:'Patients you serve', scope:'patients' };
    const byDept = {
      pharmacy:['pharmacy'], hospital:['hospital'], vehicle:['vehicle'], procure:['procure','ministry']
    };
    if(byDept[dept]) return { depts:byDept[dept], label:((deptObj(dept)||{}).name||dept)+' service', scope:'department' };
    return { depts:null, label:'Patients you serve', scope:'patients' };
  },

  /* --- aggregation ----------------------------------------------------- */
  sum(rows){ return rows.reduce((n,l)=>n+(Number(l.amount)||0),0); },
  group(rows, keyFn){
    const m = new Map();
    rows.forEach(l=>{ const k = keyFn(l); if(k===undefined||k===null||k==='') return;
      const e = m.get(k) || { key:k, total:0, lines:0, patients:new Set(), qty:0 };
      e.total += Number(l.amount)||0; e.lines++; e.qty += Number(l.qty)||0;
      if(l.patientId) e.patients.add(l.patientId);
      m.set(k,e); });
    return [...m.values()].map(e=>({ ...e, patients:e.patients.size, avg: e.patients.size? e.total/e.patients.size : 0 }));
  },
  monthKey(d){ return String(d||'').slice(0,7); },

  /* The whole picture in one object, computed once per render. */
  summary(user, filter={}){
    const rows = this.lines(user, filter);
    const db = DB.db;
    const patientById = new Map((db.patients||[]).map(p=>[p.id,p]));
    const total = this.sum(rows);
    const patientIds = new Set(rows.filter(l=>l.patientId).map(l=>l.patientId));
    const byCat = this.group(rows, l=>l.cat).sort((a,b)=>b.total-a.total);
    const byArea = this.group(rows, l=>l.areaId).sort((a,b)=>b.total-a.total);
    const byCounty = this.group(rows, l=>l.countyId).sort((a,b)=>b.total-a.total);
    const byMonth = this.group(rows, l=>this.monthKey(l.date)).sort((a,b)=>a.key.localeCompare(b.key));
    const byDept = this.group(rows, l=>l.dept).sort((a,b)=>b.total-a.total);
    const byBag = this.group(rows.filter(l=>l.bag), l=>l.bag).sort((a,b)=>b.total-a.total);
    const bySource = this.group(rows, l=>l.source.split(':')[0]);

    /* disease category needs clinical aggregate authority */
    const canSeeDisease = RBAC.has(user,'condition.aggregate') || RBAC.has(user,'condition.view') || RBAC.has(user,'patient.view.clinical');
    let byDisease = [];
    if(canSeeDisease){
      byDisease = this.group(rows.filter(l=>l.patientId), l=>{
        const p = patientById.get(l.patientId); if(!p) return '';
        const cond = (db.patientConditions||[]).find(c=>c.patientId===p.id);
        return cond? cond.label : ((p.clinical||{}).diagnosis || 'Not recorded');
      }).sort((a,b)=>b.total-a.total);
    }
    /* and the coarser category bucket, which is never clinical-identifying */
    const byCategory = this.group(rows.filter(l=>l.patientId), l=>{
      const p = patientById.get(l.patientId); if(!p) return '';
      const cond = (db.patientConditions||[]).find(c=>c.patientId===p.id);
      return cond? cond.category : ((p.clinical||{}).conditionCategory || 'unclassified');
    }).sort((a,b)=>b.total-a.total);

    /* per patient */
    const perPatient = this.group(rows.filter(l=>l.patientId), l=>l.patientId).map(e=>{
      const p = patientById.get(e.key)||{};
      const days = Number(p.programDays)||0;
      return { patientId:e.key, name:p.name||'(unknown)', code:p.code||'', areaId:p.areaId||'', countyId:p.countyId||'',
        status:p.status||'', total:e.total, lines:e.lines, days,
        perDay: days>0? e.total/days : 0,
        disease: canSeeDisease ? (((db.patientConditions||[]).find(c=>c.patientId===e.key)||{}).label || (p.clinical||{}).diagnosis || '') : '',
        category: ((db.patientConditions||[]).find(c=>c.patientId===e.key)||{}).category || (p.clinical||{}).conditionCategory || '' };
    }).sort((a,b)=>b.total-a.total);

    /* patient-days: the master workbook's own denominator */
    const daysTotal = perPatient.reduce((n,r)=>n+(Number(r.days)||0),0);

    /* budget for the same reach */
    const budgets = (db.budgets||[]).filter(b=> (roleObj(user.roleId)||{scope:{}}).scope?.geo==='global' || (roleObj(user.roleId)||{}).scope?.crossCounty || !filter.countyId || b.countyId===filter.countyId || b.countyId===user.countyId);
    const budgetTotal = budgets.reduce((n,b)=>n+(Number(b.amount)||0),0);

    return {
      rows, total, patientCount:patientIds.size, lineCount:rows.length,
      avgPerPatient: patientIds.size? total/patientIds.size : 0,
      avgPerLine: rows.length? total/rows.length : 0,
      costPerPatientDay: daysTotal? total/daysTotal : 0,
      patientDays: daysTotal,
      byCat, byArea, byCounty, byMonth, byDept, byBag, bySource, byDisease, byCategory, perPatient,
      canSeeDisease, lens:this.lensFor(user),
      budgetTotal, budgetVariance: budgetTotal? (budgetTotal-total) : 0,
      budgetUsedPct: budgetTotal? (total/budgetTotal*100) : 0,
      anonLines: rows.filter(l=>l.anon).length,
      receipted: rows.filter(l=>l.receipt).length,
      unreceipted: rows.filter(l=>l.source==='transaction' && !l.receipt).length,
      firstDate: rows.length? rows.map(l=>l.date).filter(Boolean).sort()[0] : '',
      lastDate: rows.length? rows.map(l=>l.date).filter(Boolean).sort().slice(-1)[0] : ''
    };
  },

  /* Cost of one patient, for the patient record panel. */
  patientCost(user, patientId){
    const rows = this.lines(user, { patientId });
    const total = this.sum(rows);
    const p = (DB.db.patients||[]).find(x=>x.id===patientId)||{};
    const days = Number(p.programDays)||0;
    return { total, rows, days, perDay: days? total/days : 0,
      byCat:this.group(rows,l=>l.cat).sort((a,b)=>b.total-a.total),
      byMonth:this.group(rows,l=>this.monthKey(l.date)).sort((a,b)=>a.key.localeCompare(b.key)),
      bags:rows.filter(l=>l.bag).length };
  },

  /* Cost of one ministry area / county, for the consoles. */
  areaCost(user, areaId){
    const rows = this.lines(user, { areaId });
    const total = this.sum(rows);
    const patients = new Set(rows.filter(l=>l.patientId).map(l=>l.patientId));
    return { total, patients:patients.size, avg: patients.size? total/patients.size : 0,
      byCat:this.group(rows,l=>l.cat).sort((a,b)=>b.total-a.total), rows };
  },

  /* ---------------- printable report ---------------- */
  reportDoc(user, filter={}){
    const s = this.summary(user, filter);
    const period = (filter.from||s.firstDate||'the beginning') + ' to ' + (filter.to||s.lastDate||'today');
    const reach = s.lens.label;
    const body = `
      <h3>1. Summary</h3>
      <table class="rpt"><thead><tr><th>Measure</th><th class="num">Value</th><th>How it is computed</th></tr></thead><tbody>
        <tr><td>Total expenditure attributed to patients</td><td class="num">${money(s.total)}</td><td>Sum of every cost line in scope</td></tr>
        <tr><td>Patients with a recorded cost</td><td class="num">${num(s.patientCount)}</td><td>Distinct patients in scope</td></tr>
        <tr><td>Average cost per patient</td><td class="num">${money(Math.round(s.avgPerPatient))}</td><td>Total / patients - the master workbook's "Cost p.p.p."</td></tr>
        <tr><td>Patient-days in programme</td><td class="num">${num(s.patientDays)}</td><td>Sum of counted days in programme (master column K)</td></tr>
        <tr><td>Cost per patient-day</td><td class="num">${money(Math.round(s.costPerPatientDay*100)/100)}</td><td>Total / patient-days</td></tr>
        <tr><td>Cost lines</td><td class="num">${num(s.lineCount)}</td><td>Transactions, support issues, visit forms, requests, TB dispensing</td></tr>
        <tr><td>Budget for the same reach</td><td class="num">${money(s.budgetTotal)}</td><td>Approved budget lines</td></tr>
        <tr><td>Variance</td><td class="num">${money(s.budgetVariance)}</td><td>Budget less attributed expenditure (${s.budgetUsedPct.toFixed(1)}% used)</td></tr>
      </tbody></table>

      <h3>2. By cost category</h3>
      <table class="rpt"><thead><tr><th>Category</th><th class="num">Amount</th><th class="num">Share</th><th class="num">Patients</th><th class="num">Average per patient</th><th>Master workbook source</th></tr></thead>
      <tbody>${s.byCat.map(c=>`<tr><td>${esc(costCatName(c.key))}</td><td class="num">${money(Math.round(c.total))}</td>
        <td class="num">${s.total? (100*c.total/s.total).toFixed(1)+'%':'-'}</td><td class="num">${num(c.patients)}</td>
        <td class="num">${money(Math.round(c.avg))}</td><td class="xs">${esc((COST_CAT[c.key]||{}).master||'')}</td></tr>`).join('')}
        <tr class="tot"><td>Total</td><td class="num">${money(Math.round(s.total))}</td><td class="num">100.0%</td><td class="num">${num(s.patientCount)}</td><td class="num">${money(Math.round(s.avgPerPatient))}</td><td></td></tr>
      </tbody></table>

      <h3>3. By ministry area</h3>
      <table class="rpt"><thead><tr><th>Ministry area</th><th class="num">Expenditure</th><th class="num">Patients</th><th class="num">Average per patient</th><th class="num">Share</th></tr></thead>
      <tbody>${s.byArea.map(a=>`<tr><td>${esc(areaName(a.key))}</td><td class="num">${money(Math.round(a.total))}</td><td class="num">${num(a.patients)}</td>
        <td class="num">${money(Math.round(a.avg))}</td><td class="num">${s.total?(100*a.total/s.total).toFixed(1)+'%':'-'}</td></tr>`).join('')||'<tr><td colspan="5">No attributed expenditure in scope.</td></tr>'}</tbody></table>

      <h3>4. By county office</h3>
      <table class="rpt"><thead><tr><th>County office</th><th class="num">Expenditure</th><th class="num">Patients</th><th class="num">Average per patient</th></tr></thead>
      <tbody>${s.byCounty.map(a=>`<tr><td>${esc(countyName(a.key))}</td><td class="num">${money(Math.round(a.total))}</td><td class="num">${num(a.patients)}</td><td class="num">${money(Math.round(a.avg))}</td></tr>`).join('')}</tbody></table>

      <h3>5. By month</h3>
      <table class="rpt"><thead><tr><th>Month</th><th class="num">Expenditure</th><th class="num">Patients served</th><th class="num">Average per patient</th></tr></thead>
      <tbody>${s.byMonth.map(m=>`<tr><td>${esc(m.key)}</td><td class="num">${money(Math.round(m.total))}</td><td class="num">${num(m.patients)}</td><td class="num">${money(Math.round(m.avg))}</td></tr>`).join('')}</tbody></table>

      <h3>6. Foodbag mix (Bag 1 / Bag 2 / Special bag)</h3>
      <table class="rpt"><thead><tr><th>Bag</th><th class="num">Issued</th><th class="num">Value</th><th class="num">Share of food cost</th></tr></thead>
      <tbody>${s.byBag.map(b=>`<tr><td>${esc((COST_UNIT_DEFAULTS.find(u=>u.id===b.key)||{}).name||b.key)}</td><td class="num">${num(b.qty)}</td><td class="num">${money(Math.round(b.total))}</td>
        <td class="num">${(100*b.total/Math.max(1,s.byCat.find(c=>c.key==='foodbag')?.total||1)).toFixed(1)}%</td></tr>`).join('')||'<tr><td colspan="4">No foodbag issues recorded in scope.</td></tr>'}</tbody></table>

      ${s.canSeeDisease? `<h3>7. By disease category</h3>
      <table class="rpt"><thead><tr><th>Condition</th><th class="num">Expenditure</th><th class="num">Patients</th><th class="num">Average per patient</th></tr></thead>
      <tbody>${s.byDisease.slice(0,18).map(d=>`<tr><td>${esc(d.key)}</td><td class="num">${money(Math.round(d.total))}</td><td class="num">${num(d.patients)}</td><td class="num">${money(Math.round(d.avg))}</td></tr>`).join('')}</tbody></table>`
      : `<h3>7. By disease category</h3><p class="small">Withheld: this account does not hold clinical aggregate authority. Cost buckets by category group are available below.</p>
      <table class="rpt"><thead><tr><th>Category group</th><th class="num">Expenditure</th><th class="num">Patients</th><th class="num">Average per patient</th></tr></thead>
      <tbody>${s.byCategory.map(d=>`<tr><td>${esc(titleCase(d.key))}</td><td class="num">${money(Math.round(d.total))}</td><td class="num">${num(d.patients)}</td><td class="num">${money(Math.round(d.avg))}</td></tr>`).join('')}</tbody></table>`}

      <h3>8. Twenty highest-cost patients in scope</h3>
      <table class="rpt"><thead><tr><th>Patient</th><th>Ministry area</th><th class="num">Days in programme</th><th class="num">Total cost</th><th class="num">Cost per day</th></tr></thead>
      <tbody>${s.perPatient.slice(0,20).map(p=>`<tr><td>${esc(p.name)}<div class="xs muted">${esc(p.code)}</div></td><td>${esc(areaName(p.areaId))}</td>
        <td class="num">${num(p.days)}</td><td class="num">${money(Math.round(p.total))}</td><td class="num">${money(Math.round(p.perDay*100)/100)}</td></tr>`).join('')}</tbody></table>`;
    return reportShell({
      title:'Cost per Patient Report',
      sub:`Attributed programme expenditure per patient, ministry area, county and disease category · ${esc(reach)}`,
      meta:[ {k:'Reporting period', v:period}, {k:'Scope', v:reach}, {k:'County office', v:filter.countyId?countyName(filter.countyId):'All in reach'},
        {k:'Generated', v:fmtDateTime(new Date())}, {k:'Generated by', v:user.name}, {k:'Classification', v:'Internal - financial'} ],
      body, footerNote:'Cost lines are attributed to a patient only where the record names one. Standards are set by Finance and Procurement.',
      classification:'Internal - financial'
    });
  },

  csv(user, filter={}){
    const rows = this.lines(user, filter);
    const head = ['date','county','ministry_area','patient_code','patient','category','department','source','reference','qty','unit','bag','amount_kes'];
    const pById = new Map((DB.db.patients||[]).map(p=>[p.id,p]));
    const body = rows.map(l=>{
      const p = pById.get(l.patientId)||{};
      return [l.date, countyName(l.countyId), areaName(l.areaId), p.code||'', p.name||'', costCatName(l.cat),
        (deptObj(l.dept)||{}).name||l.dept, l.source, l.ref||'', l.qty, l.unit, l.bag||'', Math.round(l.amount)];
    });
    download('LOMAMO-cost-per-patient-'+todayISO().slice(0,10)+'.csv',
      '\uFEFF'+[head,...body].map(r=>r.map(c=>`"${String(c??'').replace(/"/g,'""')}"`).join(',')).join('\n'), 'text/csv');
  },

  /* ---------------- console ---------------- */
  render(user, params={}){
    if(!RBAC.has(user,'cost.view') && !RBAC.has(user,'finance.view')) return deniedPanel('cost.view');
    Object.keys(params||{}).forEach(k=>{ if(params[k]!==undefined && k in COST_STATE) COST_STATE[k]=params[k]; });
    const st = COST_STATE;
    const filter = { from:st.from, to:st.to, countyId:st.countyId, areaId:st.areaId, cat:st.cat, dept:st.dept, q:st.q };
    const s = this.summary(user, filter);
    const lens = s.lens;
    const tabs = [
      ['overview','Overview'], ['patient','Per patient'], ['area','Ministry areas'], ['county','County & national'],
      ['disease','Disease mix'], ['dept','Department lens'], ['bags','Bags & supplies'], ['trend','Trends'],
      ['ledger','Cost ledger'], ['standards','Unit cost standards']
    ];
    const canLedger = RBAC.has(user,'cost.ledger')||RBAC.has(user,'finance.view');
    const canStandard = RBAC.has(user,'cost.standard.manage');
    const shown = tabs.filter(([id])=> id!=='ledger' || canLedger);
    const colours = chartColours(10);

    const filterBar = `<form data-form="cost-filter" class="cost-filter">
        <div class="field"><label>From</label><input class="input" type="date" name="from" value="${esc(st.from)}"></div>
        <div class="field"><label>To</label><input class="input" type="date" name="to" value="${esc(st.to)}"></div>
        <div class="field"><label>County office</label><select class="input" name="countyId">
          <option value="">${esc(lens.scope==='full'?'All in reach':countyName(user.countyId))}</option>
          ${COUNTIES.map(c=>`<option value="${c.id}" ${st.countyId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Ministry area</label><select class="input" name="areaId">
          <option value="">All areas</option>
          ${COUNTIES.flatMap(c=>c.areas).map(a=>`<option value="${a.id}" ${st.areaId===a.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Cost category</label><select class="input" name="cat">
          <option value="">All categories</option>
          ${COST_CATEGORIES.map(c=>`<option value="${c.id}" ${st.cat===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Search</label><input class="input" name="q" value="${esc(st.q)}" placeholder="Patient, code or reference"></div>
        <div class="cf-act"><button class="btn btn-primary btn-sm" type="submit">${ic('filter',14)} Apply</button>
          <button class="btn btn-ghost btn-sm" type="button" data-act="cost-reset">${ic('refresh',14)} Reset</button></div>
      </form>`;

    const head = pageHead('Cost per patient',
      `Attributed programme expenditure per patient, ministry area, county, disease category and department · reach: <b>${esc(lens.label)}</b>` +
      (s.anonLines? ` · <b>${num(s.anonLines)}</b> line${s.anonLines===1?'':'s'} of your own service, de-identified` : ''),
      `${RBAC.has(user,'cost.export')?`<button class="btn btn-sm btn-ghost" data-act="cost-export">${ic('download',15)} Export CSV</button>`:''}
       <button class="btn btn-sm btn-ghost" data-act="do-print">${ic('file',15)} Print</button>
       <button class="btn btn-sm btn-primary" data-act="cost-report">${ic('receipt',15)} Full cost report</button>`)
    + `<div class="tabs cost-tabs" role="tablist">${shown.map(([id,label])=>`<button class="tab ${st.tab===id?'active':''}" role="tab" data-act="cost-tab" data-tab="${id}">${esc(label)}</button>`).join('')}</div>`
    + filterBar;

    const kpis = `<div class="grid g4" style="margin:16px 0">
        ${kpi('Total attributed cost', money(Math.round(s.total)), `${num(s.lineCount)} cost lines in scope`, 'ok', 'wallet')}
        ${kpi('Average cost per patient', money(Math.round(s.avgPerPatient)), `${num(s.patientCount)} patients with a recorded cost`, 'info', 'users')}
        ${kpi('Cost per patient-day', money(Math.round(s.costPerPatientDay*100)/100), `${num(s.patientDays)} patient-days in programme`, 'warn', 'clock')}
        ${kpi('Budget used', s.budgetTotal? s.budgetUsedPct.toFixed(1)+'%' : 'No budget', s.budgetTotal? money(Math.round(s.budgetVariance))+' remaining' : 'Budget lines not set', s.budgetUsedPct>100?'crit':'ok', 'layers')}
      </div>`;

    let body = '';
    const anonNote = s.anonLines? note(`Your department's lens returns <b>${num(s.anonLines)}</b> cost line${s.anonLines===1?'':'s'} with the patient reference removed. You see what your service cost across the programme; the patients behind those lines belong to the field and clinical consoles, and the identity is stripped in the data layer, not hidden in the interface.`,'shield') : '';
    if(st.tab==='overview'){
      body = anonNote + kpis
      + `<div class="grid g2">
          ${card('Where the money went', chartDonut(s.byCat.map((c,i)=>({label:costCatName(c.key), value:Math.round(c.total), color:(COST_CAT[c.key]||{}).colour||colours[i%colours.length]})), {title:'Expenditure by cost category', fmt:v=>money(v), centerLabel:'TOTAL', centerValue:money(Math.round(s.total))}), {sub:'Every category is mapped to a column of the Administration\u2019s master workbook.'})}
          ${card('Expenditure against budget', chartWaterfall([
              {label:'Budget', value:Math.round(s.budgetTotal), kind:'total'},
              {label:'Food & bags', value:-Math.round(s.byCat.find(c=>c.key==='foodbag')?.total||0)},
              {label:'Medical', value:-Math.round(['medication','tb','outpatient','inpatient','consultation','shif'].reduce((n,k)=>n+(s.byCat.find(c=>c.key===k)?.total||0),0))},
              {label:'Transport', value:-Math.round(s.byCat.find(c=>c.key==='transport')?.total||0)},
              {label:'Other support', value:-Math.round(['hygiene','support'].reduce((n,k)=>n+(s.byCat.find(c=>c.key===k)?.total||0),0))},
              {label:'Remaining', value:Math.round(s.budgetVariance), kind:'total'}
            ], {title:'Budget movement', fmt:v=>money(Math.abs(v)), caption:'Budget less attributed expenditure by group.'}),
            {sub:s.budgetTotal? 'Variance is budget less attributed cost.' : 'No budget lines are set for this reach yet.'})}
        </div>`
      + `<div class="grid g2" style="margin-top:16px">
          ${card('Monthly expenditure and patients served', chartStacked({
            labels:s.byMonth.slice(-12).map(m=>m.key.slice(5)+'/'+m.key.slice(2,4)),
            series:[
              {label:'Programme (food, hygiene, support)', values:s.byMonth.slice(-12).map(m=>Math.round(this.sum(s.rows.filter(l=>this.monthKey(l.date)===m.key && ['foodbag','hygiene','support'].includes(l.cat))))), color:'#B45309'},
              {label:'Medical (drugs, hospital, SHIF)', values:s.byMonth.slice(-12).map(m=>Math.round(this.sum(s.rows.filter(l=>this.monthKey(l.date)===m.key && ['medication','tb','outpatient','inpatient','consultation','shif'].includes(l.cat))))), color:'#0F7B4F'},
              {label:'Transport', values:s.byMonth.slice(-12).map(m=>Math.round(this.sum(s.rows.filter(l=>this.monthKey(l.date)===m.key && l.cat==='transport')))), color:'#475569'}
            ], fmt:v=>money(v), title:'Monthly expenditure by group', labelHead:'Month'}))}
          ${card('Average cost per patient by ministry area', chartRows({
            rows:s.byArea.map(a=>({label:areaName(a.key), value:Math.round(a.avg)})), fmt:v=>money(v),
            title:'Average cost per patient', valueHead:'Average', labelHead:'Ministry area', unit:'KES per patient'}))}
        </div>`
      + `<div style="margin-top:16px">${card('Cost categories in detail', table([
          {label:'Category',render:c=>`<div class="cellname"><span class="sw-dot" style="background:${(COST_CAT[c.key]||{}).colour||'#475569'}"></span>${esc(costCatName(c.key))}</div><div class="xs muted">${esc((COST_CAT[c.key]||{}).group||'')}</div>`},
          {label:'Amount',cls:'num',render:c=>money(Math.round(c.total))},
          {label:'Share',cls:'num',render:c=>(s.total?(100*c.total/s.total).toFixed(1):'0.0')+'%'},
          {label:'Patients',cls:'num',render:c=>num(c.patients)},
          {label:'Average / patient',cls:'num',render:c=>money(Math.round(c.avg))},
          {label:'Lines',cls:'num',render:c=>num(c.lines)},
          {label:'Master workbook column',render:c=>`<span class="xs muted">${esc((COST_CAT[c.key]||{}).master||'')}</span>`}
        ], s.byCat))}</div>`;
    }

    if(st.tab==='patient'){
      const rows = s.perPatient;
      const paged = rows.slice((st.page-1)*this.perPage, st.page*this.perPage);
      body = kpis
      + `<div class="grid g2">
          ${card('Highest cost per patient', chartRows({rows:rows.slice(0,12).map(p=>({label:p.name, value:Math.round(p.total)})), fmt:v=>money(v), title:'Highest cost per patient', valueHead:'Total cost', unit:'KES'}))}
          ${card('Cost per patient-day distribution', chartBars({rows:(()=>{
              const bands = [[0,60,'0-60 days'],[61,120,'61-120'],[121,180,'121-180'],[181,240,'181-240'],[241,330,'241-330'],[331,99999,'330+']];
              return bands.map(([a,b,label])=>({label, value:Math.round(rows.filter(r=>r.days>=a&&r.days<=b).reduce((n,r)=>n+r.total,0))}));
            })(), fmt:v=>money(v), title:'Expenditure by days-in-programme band', unit:'KES', valueHead:'Expenditure', labelHead:'Band'}),
            {sub:'The master workbook counts days in programme as date out minus date in, and flags minimal care beyond 183 days.'})}
        </div>`
      + `<div style="margin-top:16px">${card('Cost per patient', table([
          {label:'Patient',render:p=>`<button class="linkbtn cellname" data-act="go" data-v="patient" data-id="${esc(p.patientId)}">${esc(p.name)}</button><div class="xs muted mono">${esc(p.code)}</div>`},
          {label:'Ministry area',render:p=>esc(areaName(p.areaId))},
          {label:'Status',render:p=>pBadge(p.status)},
          {label:'Days',cls:'num',render:p=>num(p.days)},
          {label:'Total cost',cls:'num',render:p=>`<b>${money(Math.round(p.total))}</b>`},
          {label:'Cost / day',cls:'num',render:p=>money(Math.round(p.perDay*100)/100)},
          {label:'Lines',cls:'num',render:p=>num(p.lines)},
          {label:s.canSeeDisease?'Condition':'Category',render:p=>esc(s.canSeeDisease? (p.disease||'') : titleCase(p.category||''))},
          {label:'Trend',render:p=>chartSpark(this.lines(user,{patientId:p.patientId}).slice(0,12).reverse().map(l=>l.amount), {label:'Recent cost lines'})}
        ], paged, {emptyMsg:'No attributed cost in scope.'}),
        {foot:`<span>Showing ${paged.length} of ${num(rows.length)} patients.</span>
          <span class="row" style="gap:6px;justify-content:flex-end">
            <button class="btn btn-xs btn-ghost" data-act="cost-page" data-p="${Math.max(1,st.page-1)}" ${st.page<=1?'disabled':''}>${ic('prev',13)} Previous</button>
            <button class="btn btn-xs btn-ghost" data-act="cost-page" data-p="${st.page+1}" ${st.page*this.perPage>=rows.length?'disabled':''}>Next ${ic('next',13)}</button>
          </span>`})}</div>`;
    }

    if(st.tab==='area'){
      body = kpis
      + card('Ministry area expenditure', chartStacked({
          labels:s.byArea.map(a=>areaName(a.key)),
          series:['foodbag','medication','transport','outpatient','inpatient','hygiene','support','tb','shif','consultation']
            .filter(k=>s.rows.some(l=>l.cat===k))
            .map(k=>({ label:costCatName(k), color:(COST_CAT[k]||{}).colour,
              values:s.byArea.map(a=>Math.round(this.sum(s.rows.filter(l=>l.areaId===a.key && l.cat===k)))) })),
          fmt:v=>money(v), title:'Expenditure by ministry area and category', labelHead:'Ministry area'
        }), {sub:'Total expenditure for each ministry area, split by the service that produced the cost.'})
      + `<div style="margin-top:16px">${card('Ministry area cost table', table([
          {label:'Ministry area',render:a=>`<div class="cellname">${esc(areaName(a.key))}</div><div class="xs muted">${esc(countyName((DB.db.patients||[]).find(p=>p.areaId===a.key)?.countyId||user.countyId))}</div>`},
          {label:'Expenditure',cls:'num',render:a=>money(Math.round(a.total))},
          {label:'Patients served',cls:'num',render:a=>num(a.patients)},
          {label:'Average / patient',cls:'num',render:a=>`<b>${money(Math.round(a.avg))}</b>`},
          {label:'Share',cls:'num',render:a=>(s.total?(100*a.total/s.total).toFixed(1):'0.0')+'%'},
          {label:'Distribution',render:a=>progressBar(a.total, Math.max(...s.byArea.map(x=>x.total),1))},
          {label:'Largest category',render:a=>{
            const top = this.group(s.rows.filter(l=>l.areaId===a.key), l=>l.cat).sort((x,y)=>y.total-x.total)[0];
            return top? `${esc(costCatName(top.key))}<div class="xs muted">${money(Math.round(top.total))}</div>` : '<span class="xs muted">-</span>';
          }}
        ], s.byArea, {emptyMsg:'No attributed expenditure for any ministry area in scope.'}))}</div>`
      + `<div style="margin-top:16px">${card('Area profile', chartRadar({
          axes:s.byArea.slice(0,8).map(a=>areaName(a.key)),
          series:[{label:'Average cost per patient', values:s.byArea.slice(0,8).map(a=>Math.round(a.avg)), color:colours[0]},
                  {label:'Patients served', values:s.byArea.slice(0,8).map(a=>a.patients), color:colours[1]}],
          title:'Ministry area profile', axisHead:'Ministry area', max:Math.max(...s.byArea.slice(0,8).map(a=>a.avg),1)}))}</div>`;
    }

    if(st.tab==='county'){
      const national = lens.scope==='full';
      body = kpis
      + `<div class="grid g2">
          ${card(national?'County comparison (national view)':'County office', chartGrouped({
            labels:s.byCounty.map(c=>countyName(c.key).replace(' County Office','')),
            series:[
              {label:'Expenditure', values:s.byCounty.map(c=>Math.round(c.total)), color:colours[0]},
              {label:'Average per patient', values:s.byCounty.map(c=>Math.round(c.avg)), color:colours[2]}
            ], fmt:v=>money(v), title:'County expenditure and average per patient', labelHead:'County office'}))}
          ${card('National cost mix', chartDonut(s.byCounty.map((c,i)=>({label:countyName(c.key), value:Math.round(c.total), color:colours[i%colours.length]})),
            {title:'Share of national expenditure', fmt:v=>money(v), centerValue:money(Math.round(s.total)), centerLabel:national?'NATIONAL':'IN SCOPE'}))}
        </div>`
      + `<div style="margin-top:16px">${card('County cost table', table([
          {label:'County office',render:c=>`<div class="cellname">${esc(countyName(c.key))}</div>`},
          {label:'Expenditure',cls:'num',render:c=>money(Math.round(c.total))},
          {label:'Patients',cls:'num',render:c=>num(c.patients)},
          {label:'Average / patient',cls:'num',render:c=>money(Math.round(c.avg))},
          {label:'Cost / patient-day',cls:'num',render:c=>{
            const days = s.perPatient.filter(p=>p.countyId===c.key).reduce((n,p)=>n+(Number(p.days)||0),0);
            return days? money(Math.round(c.total/days*100)/100) : '-';
          }},
          {label:'Share',cls:'num',render:c=>(s.total?(100*c.total/s.total).toFixed(1):'0.0')+'%'}
        ], s.byCounty))}</div>`
      + `<div style="margin-top:16px">${card('County by category', chartHeat({
          rows:s.byCounty.map(c=>({ label:countyName(c.key), values:Object.fromEntries(COST_CATEGORIES.map(k=>[k.id, Math.round(this.sum(s.rows.filter(l=>l.countyId===c.key && l.cat===k.id)))])) })),
          cols:COST_CATEGORIES.map(k=>k.id), rowHead:'County office',
          caption:'Shading shows where each county office spends, category by category.',
          fmt:v=>money(v)
        }))}</div>`
      + (national? '' : `<div style="margin-top:16px">${note('A national view is available to the Director, the President and the Chief Program Administrator. Your reach is '+esc(lens.label)+'.','shield')}</div>`);
    }

    if(st.tab==='disease'){
      if(!s.canSeeDisease){
        body = kpis + card('Confidentiality boundary', emptyState('Disease-level cost is withheld',
          'Cost per disease category is clinical aggregate information. Your account does not hold it. The cost buckets by category group below are available to you, and the finance totals are unchanged.','lock')
          + `<div style="margin-top:14px">${chartRows({rows:s.byCategory.map(c=>({label:titleCase(c.key), value:Math.round(c.total)})), fmt:v=>money(v), title:'Expenditure by category group', valueHead:'Amount'})}</div>`);
      } else {
        body = kpis
        + `<div class="grid g2">
            ${card('Average cost per patient by condition', chartRows({rows:s.byDisease.slice(0,14).map(d=>({label:d.key, value:Math.round(d.avg)})), fmt:v=>money(v), title:'Average cost per patient by condition', valueHead:'Average', unit:'KES'}),
              {sub:'The measure the master workbook exists to produce: what supporting a patient with this condition costs on average.'})}
            ${card('Expenditure share by category group', chartDonut(s.byCategory.map((c,i)=>({label:titleCase(c.key), value:Math.round(c.total), color:colours[i%colours.length]})), {title:'Expenditure by category group', fmt:v=>money(v), centerValue:money(Math.round(s.total)), centerLabel:'TOTAL'}))}
          </div>`
        + `<div style="margin-top:16px">${card('Cost by condition', table([
            {label:'Condition',render:d=>`<div class="cellname">${esc(d.key)}</div>`},
            {label:'Expenditure',cls:'num',render:d=>money(Math.round(d.total))},
            {label:'Patients',cls:'num',render:d=>num(d.patients)},
            {label:'Average / patient',cls:'num',render:d=>`<b>${money(Math.round(d.avg))}</b>`},
            {label:'Cost lines',cls:'num',render:d=>num(d.lines)},
            {label:'Share',cls:'num',render:d=>(s.total?(100*d.total/s.total).toFixed(1):'0.0')+'%'}
          ], s.byDisease.slice(0,25), {emptyMsg:'No attributed cost with a confirmed condition in scope.'}))}</div>`
        + `<div style="margin-top:16px">${card('Condition cost profile', chartRadar({
            axes:s.byDisease.slice(0,7).map(d=>String(d.key).slice(0,18)),
            series:[{label:'Average per patient', values:s.byDisease.slice(0,7).map(d=>Math.round(d.avg)), color:colours[0]},
                    {label:'Total expenditure (scaled)', values:s.byDisease.slice(0,7).map(d=>Math.round(d.total/10)), color:colours[3]}],
            title:'Condition cost profile', axisHead:'Condition'}))}</div>`;
      }
    }

    if(st.tab==='dept'){
      const deptRows = s.byDept.map(d=>{
        const dd = deptObj(d.key)||{name:d.key};
        const budgets = (DB.db.budgets||[]).filter(b=>b.countyId===(filter.countyId||user.countyId));
        return { ...d, name:dd.name||d.key, accent:dd.accent||'#475569', budget:budgets.reduce((n,b)=>n+(Number(b.amount)||0),0) };
      });
      body = anonNote + kpis
      + note(`You are seeing the cost lens of <b>${esc(lens.label)}</b>. Every department sees the cost of its own service, inside its own reach.`,'shield')
      + `<div class="grid g2" style="margin-top:14px">
          ${card('Expenditure by responsible department', chartDonut(deptRows.map((d,i)=>({label:d.name, value:Math.round(d.total), color:d.accent||colours[i%colours.length]})), {title:'Expenditure by department', fmt:v=>money(v), centerValue:money(Math.round(s.total)), centerLabel:'TOTAL'}))}
          ${card('Department averages', chartRows({rows:deptRows.map(d=>({label:d.name, value:Math.round(d.avg)})), fmt:v=>money(v), title:'Average cost per patient by department', valueHead:'Average'}) )}
        </div>`
      + `<div style="margin-top:16px">${card('Department cost table', table([
          {label:'Department',render:d=>`<div class="cellname"><span class="sw-dot" style="background:${esc(d.accent)}"></span>${esc(d.name)}</div>`},
          {label:'Expenditure',cls:'num',render:d=>money(Math.round(d.total))},
          {label:'Patients touched',cls:'num',render:d=>num(d.patients)},
          {label:'Average / patient',cls:'num',render:d=>money(Math.round(d.avg))},
          {label:'Cost lines',cls:'num',render:d=>num(d.lines)},
          {label:'Share of total',cls:'num',render:d=>(s.total?(100*d.total/s.total).toFixed(1):'0.0')+'%'},
          {label:'',render:d=>progressBar(d.total, Math.max(...deptRows.map(x=>x.total),1))}
        ], deptRows))}</div>`;
    }

    if(st.tab==='bags'){
      const std = this.standards(user);
      const issued = s.rows.filter(l=>l.bag);
      body = kpis
      + `<div class="grid g2">
          ${card('Foodbag mix issued', chartDonut(s.byBag.map((b,i)=>({label:(std.find(x=>x.id===b.key)||{}).name||b.key, value:b.qty, color:colours[i%colours.length]})),
            {title:'Bags issued by type', centerValue:num(s.byBag.reduce((n,b)=>n+b.qty,0)), centerLabel:'BAGS'}),
            {sub:'Bag 1, Bag 2 and the Special bag are the master workbook\u2019s own three codes (BG1, BG2, SPB), counted from the weekly grid.'})}
          ${card('Value of bags issued', chartBars({rows:s.byBag.map(b=>({label:(std.find(x=>x.id===b.key)||{}).name||b.key, value:Math.round(b.total)})), fmt:v=>money(v), title:'Value of foodbags issued', unit:'KES', valueHead:'Value', labelHead:'Bag type'}))}
        </div>`
      + `<div style="margin-top:16px">${card('Bags and supplies issued in scope', table([
          {label:'Unit',render:b=>`<div class="cellname">${esc((std.find(x=>x.id===b.key)||{}).name||b.key)}</div><div class="xs muted mono">${esc(b.key)}</div>`},
          {label:'Issued',cls:'num',render:b=>num(b.qty)},
          {label:'Standard cost',cls:'num',render:b=>money(stdCostOf(std,b.key))},
          {label:'Value',cls:'num',render:b=>`<b>${money(Math.round(b.total))}</b>`},
          {label:'Patients reached',cls:'num',render:b=>num(b.patients)}
        ], s.byBag, {emptyMsg:'No bags or supplies recorded in scope.'}),
        {foot:'<span>Where a receipt exists the receipt amount is used; where it does not, the unit cost standard set by Finance applies.</span>'})}</div>`
      + `<div style="margin-top:16px">${card('Bags by month', chartStacked({
          labels:s.byMonth.slice(-12).map(m=>m.key),
          series:['BG1','BG2','SPB'].filter(code=>issued.some(l=>l.bag===code)).map((code,i)=>({
            label:(std.find(x=>x.id===code)||{}).name||code, color:colours[i%colours.length],
            values:s.byMonth.slice(-12).map(m=>issued.filter(l=>l.bag===code && this.monthKey(l.date)===m.key).length)
          })), title:'Bags issued per month', labelHead:'Month', fmt:v=>num(v)+' bags'}))}</div>`
      + `<div style="margin-top:16px">${card('Bags per week per ministry area (the workbook\u2019s Foodbags sheet)', (()=>{
          const weekOf = d => (typeof MASTERX!=='undefined'? MASTERX.weekOf(d) : null);
          const areas = COUNTIES.flatMap(c=>c.areas).filter(a=>issued.some(l=>l.areaId===a.id));
          const weeks = [...new Set(issued.map(l=>(weekOf(l.date)||{}).week).filter(Boolean))].sort((a,b)=>a-b);
          if(!areas.length || !weeks.length) return emptyState('No weekly bag grid yet','Bags appear here as soon as a food bag is issued on a visit record or in the support register, dated inside a week that runs Monday to Saturday.','package');
          const cols = weeks.slice(-26);
          return chartHeat({
            rows: areas.map(a=>({ label:a.name, values:Object.fromEntries(cols.map(w=>[w, issued.filter(l=>l.areaId===a.id && (weekOf(l.date)||{}).week===w).length])) })),
            cols, rowHead:'Ministry area', fmt:v=>num(v),
            totalHead:'Bags',
            caption:'One cell is the number of bags issued in that ministry area in that week (a week runs Monday to Saturday, as the workbook defines it). The workbook keeps three of these blocks - Bag 1, Bag 2 and Special bag - and totals each column.'
          })
          + `<div class="grid g3" style="margin-top:14px">${['BG1','BG2','SPB'].map((code,i)=>{
              const n = issued.filter(l=>l.bag===code).length;
              const unit = std.find(x=>x.id===code)||{name:code,cost:0};
              return `<div class="cm"><span class="cm-l">${esc(code)} · ${esc(unit.name)}</span><b class="cm-v">${num(n)}</b><span class="cm-s">${money(Math.round(n*(Number(unit.cost)||0)))} at the current standard</span></div>`;
            }).join('')}</div>`;
        })())}</div>`
      + `<div style="margin-top:16px">${card('Unit cost standards', canStandard?
          `<form data-form="cost-standard" class="cost-std-form">
            <div class="field"><label>Unit</label><select class="input" name="id">${std.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></div>
            <div class="field"><label>Cost (KES)</label><input class="input" type="number" min="0" step="50" name="cost" required></div>
            <div class="field"><label>Note</label><input class="input" name="note" placeholder="e.g. October market price"></div>
            <div class="cf-act"><button class="btn btn-primary btn-sm" type="submit">${ic('save',14)} Save standard</button></div>
          </form>` : note('Only Finance, Procurement and the County Office Administrator may set a unit cost standard. Every change is audited.','lock'))}</div>`;
    }

    if(st.tab==='trend'){
      const months = s.byMonth.slice(-12);
      body = kpis
      + card('Expenditure trend', chartLine({
          labels:months.map(m=>m.key),
          series:[{label:'Expenditure', values:months.map(m=>Math.round(m.total)), color:colours[0]},
                  {label:'Average per patient', values:months.map(m=>Math.round(m.avg)), color:colours[2]}],
          fmt:v=>money(v), title:'Monthly expenditure and average per patient', unit:'KES', labelHead:'Month'}))
      + `<div class="grid g2" style="margin-top:16px">
          ${card('Patients served per month', chartBars({rows:months.map(m=>({label:m.key, value:m.patients})), title:'Patients with a recorded cost per month', valueHead:'Patients', labelHead:'Month'}))}
          ${card('Cost per patient-day by month', chartLine({labels:months.map(m=>m.key),
            series:[{label:'Cost per patient-day', values:months.map(m=>{
              const days = s.perPatient.reduce((n,p)=>n+(Number(p.days)||0),0);
              return days? Math.round(m.total/days*100)/100 : 0; }), color:colours[4]}],
            fmt:v=>money(v), title:'Cost per patient-day', unit:'KES per day'}))}
        </div>`
      + `<div style="margin-top:16px">${card('Cumulative expenditure', chartLine({
          labels:months.map(m=>m.key), area:true,
          series:[{label:'Cumulative', values:months.map((m,i)=>Math.round(months.slice(0,i+1).reduce((n,x)=>n+x.total,0))), color:colours[1]}],
          fmt:v=>money(v), title:'Cumulative expenditure', unit:'KES'}))}</div>`
      + `<div style="margin-top:16px">${card('Month by category', chartHeat({
          rows:COST_CATEGORIES.filter(c=>s.rows.some(l=>l.cat===c.id)).map(c=>({ label:c.name,
            values:Object.fromEntries(months.map(m=>[m.key, Math.round(this.sum(s.rows.filter(l=>l.cat===c.id && this.monthKey(l.date)===m.key)))])) })),
          cols:months.map(m=>m.key), rowHead:'Category', fmt:v=>money(v),
          caption:'Each cell is the attributed expenditure for that category in that month.'}))}</div>`;
    }

    if(st.tab==='ledger' && canLedger){
      const rows = s.rows.slice(0,400);
      body = kpis
      + card('Cost ledger', `${note('Every attributed cost line in scope, newest first. A line without a receipt is flagged, because the master workbook reconciles stock and spending against what was actually bought.','receipt')}
        <div style="margin-top:12px">${table([
          {label:'Date',render:l=>esc(fmtDate(l.date))},
          {label:'Patient',render:l=>{ const p=(DB.db.patients||[]).find(x=>x.id===l.patientId);
            return p? `<button class="linkbtn" data-act="go" data-v="patient" data-id="${esc(p.id)}">${esc(p.name)}</button>` : '<span class="xs muted">Not patient-attributed</span>'; }},
          {label:'Area',render:l=>esc(l.areaId?areaName(l.areaId):'-')},
          {label:'Category',render:l=>esc(costCatName(l.cat))},
          {label:'Department',render:l=>esc((deptObj(l.dept)||{}).short||l.dept)},
          {label:'Source',render:l=>`<span class="xs">${esc(l.source)}</span><div class="xs muted mono">${esc(l.ref||'')}</div>`},
          {label:'Qty',cls:'num',render:l=>num(l.qty)+' '+esc(String(l.unit||'').slice(0,8))},
          {label:'Amount',cls:'num',render:l=>`<b class="mono">${money(Math.round(l.amount))}</b>`},
          {label:'Evidence',render:l=>l.source==='transaction'? (l.receipt? badge('Receipted','b-ok') : badge('No receipt','b-warn')) : badge('Record','b-neutral')}
        ], rows, {emptyMsg:'No cost lines in scope.'})}</div>`,
        {foot:`<span>Showing the first ${rows.length} of ${num(s.lineCount)} lines. Export CSV for the full ledger.</span>`});
    }

    if(st.tab==='standards'){
      const std = this.standards(user);
      body = card('Unit cost standards', table([
          {label:'Unit',render:x=>`<div class="cellname">${esc(x.name)}</div><div class="xs muted mono">${esc(x.id)} · ${esc(x.master||'')}</div>`},
          {label:'Category',render:x=>esc(costCatName(x.cat))},
          {label:'Cost',cls:'num',render:x=>`<b class="mono">${money(x.cost)}</b>`},
          {label:'Per',render:x=>esc(x.unit)},
          {label:'Source',render:x=>badge(x.source==='county'?'County override':x.source==='national'?'National standard':'Default', x.source==='default'?'b-neutral':'b-accent')},
          {label:'Set by',render:x=>x.setBy? `${esc(userName(x.setBy))}<div class="xs muted">${esc(fmtDate(x.setAt))}</div>` : '<span class="xs muted">-</span>'}
        ], std),
        {foot:'<span>A standard turns an issued item into money when no receipt exists yet. Receipts always win.</span>'})
      + `<div style="margin-top:16px">${card('Change a standard', canStandard?
          `<form data-form="cost-standard" class="cost-std-form">
            <div class="field"><label>Unit</label><select class="input" name="id">${std.map(x=>`<option value="${x.id}">${esc(x.name)} - ${money(x.cost)}</option>`).join('')}</select></div>
            <div class="field"><label>New cost (KES)</label><input class="input" type="number" min="0" step="50" name="cost" required></div>
            <div class="field"><label>Note</label><input class="input" name="note" placeholder="Reason or market reference"></div>
            ${RBAC.has(user,'cost.standard.national')?`<div class="field"><label>Apply to</label><select class="input" name="scope"><option value="county">${esc(countyName(user.countyId))}</option><option value="national">National standard</option></select></div>`:''}
            <div class="cf-act"><button class="btn btn-primary btn-sm" type="submit">${ic('save',14)} Save standard</button></div>
          </form>`
          : emptyState('Read only','Only Finance, Procurement and the County Office Administrator may set a unit cost standard; the Director and Chief Program Administrator may set a national one.','lock'))}</div>`;
    }

    return head + body;
  },

  /* The panel embedded in a patient record and in a ministry area console. */
  patientPanel(user, p){
    if(!p || (!RBAC.has(user,'cost.view') && !RBAC.has(user,'finance.view'))) return '';
    const c = this.patientCost(user, p.id);
    if(!c.rows.length) return card('Cost of serving this patient', emptyState('No attributed cost yet',
      'Costs appear as soon as a foodbag, transport fare, hospital fee, medication or TB dose is recorded against this patient.','receipt'));
    const colours = chartColours(6);
    return card('Cost of serving this patient', `
      <div class="grid g3 cost-mini">
        <div class="cm"><span class="cm-l">Total attributed cost</span><b class="cm-v">${money(Math.round(c.total))}</b><span class="cm-s">${num(c.rows.length)} cost lines</span></div>
        <div class="cm"><span class="cm-l">Cost per programme day</span><b class="cm-v">${money(Math.round(c.perDay*100)/100)}</b><span class="cm-s">${num(c.days)} days in programme</span></div>
        <div class="cm"><span class="cm-l">Bags & supplies issued</span><b class="cm-v">${num(c.bags)}</b><span class="cm-s">Bag 1 / Bag 2 / Special</span></div>
      </div>
      <div class="grid g2" style="margin-top:12px">
        <div>${chartDonut(c.byCat.map((x,i)=>({label:costCatName(x.key), value:Math.round(x.total), color:(COST_CAT[x.key]||{}).colour||colours[i%colours.length]})), {title:'This patient\u2019s cost mix', size:150, fmt:v=>money(v), centerValue:money(Math.round(c.total)), centerLabel:'TOTAL'})}</div>
        <div>${chartLine({labels:c.byMonth.slice(-8).map(m=>m.key.slice(5)), series:[{label:'Cost', values:c.byMonth.slice(-8).map(m=>Math.round(m.total)), color:colours[0]}], fmt:v=>money(v), height:180, title:'Monthly cost for this patient', markers:false, values:false})}</div>
      </div>`,
      { actions:RBAC.has(user,'cost.view')?`<button class="btn btn-xs btn-ghost" data-act="go" data-v="costing" data-tab="patient" data-q="${esc(p.name)}">${ic('chart',13)} Full cost analysis</button>`:'',
        foot:'<span>Attributed from transactions, support issues, visit forms, hospital requests and TB dispensing. Receipts take precedence over unit cost standards.</span>' });
  }
};
function stdCostOf(std, id){ const s=(std||[]).find(x=>x.id===id); return s? Number(s.cost)||0 : 0; }

/* ---------------- actions & forms ---------------- */
Object.assign(ACTIONS, {
  'cost-tab': d => { COST_STATE.tab = d.tab||'overview'; COST_STATE.page=1; render(); },
  'cost-reset': () => { Object.assign(COST_STATE, {from:'',to:'',countyId:'',areaId:'',cat:'',dept:'',q:'',page:1}); render(); },
  'cost-page': d => { COST_STATE.page = Math.max(1, Number(d.p)||1); render(); window.scrollTo({top:0,behavior:'smooth'}); },
  'cost-export': () => {
    if(!RBAC.assert(AUTH.user,'cost.export',{},false)) return toast('Not permitted','Your role may not export a cost analysis.','err');
    COSTX.csv(AUTH.user, {from:COST_STATE.from,to:COST_STATE.to,countyId:COST_STATE.countyId,areaId:COST_STATE.areaId,cat:COST_STATE.cat,q:COST_STATE.q});
    AUDIT.append({actor:AUTH.user.id, action:'cost.export', entity:'cost_analysis', detail:'CSV export of the cost ledger in scope'});
    toast('Export ready','The cost ledger CSV has been downloaded. The export is recorded in the audit trail.','ok');
  },
  'cost-report': () => {
    const html = COSTX.reportDoc(AUTH.user, {from:COST_STATE.from,to:COST_STATE.to,countyId:COST_STATE.countyId,areaId:COST_STATE.areaId});
    openModal({ title:'Cost per Patient Report', sub:'Aligned, printable and auditable', wide:true,
      body:`<div class="print-area">${html}</div>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Close</button><button class="btn btn-primary" data-act="do-print">${ic('file',15)} Print</button>` });
  }
});
Object.assign(FORMS, {
  'cost-filter': d => {
    COST_STATE.from = String(d.get('from')||''); COST_STATE.to = String(d.get('to')||'');
    COST_STATE.countyId = String(d.get('countyId')||''); COST_STATE.areaId = String(d.get('areaId')||'');
    COST_STATE.cat = String(d.get('cat')||''); COST_STATE.q = String(d.get('q')||''); COST_STATE.page = 1;
    render();
  },
  'cost-standard': d => {
    const r = COSTX.setStandard(AUTH.user, String(d.get('id')||''), d.get('cost'), { note:String(d.get('note')||''), scope:String(d.get('scope')||'county') });
    COSTX.invalidate();
    if(!r.ok) return toast('Not saved', r.msg, 'err');
    toast('Standard saved', r.national? 'The national unit cost standard has been updated.' : 'The county unit cost standard has been updated.', 'ok');
    render();
  }
});
