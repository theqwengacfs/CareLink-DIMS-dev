/* ============================================================
   monday_procurement_protocol6.js — CareLink v6.11.0

   The Monday Procurement Protocol.

   The Foundation serves a budgeted 180 patients a week. Every Monday
   morning the number still on the Active Programme Register (after last
   week's discharges, deaths and completing households) is taken off that
   180, and the remainder is the number of new patients to be accepted that
   week. The foodbag budget follows the same figure, because every accepted
   patient is fed from the Monday basket.

   Two rules shape the bags:

     1. Every one of the 180 patients is fed every week, but Bag 1 and Bag 2
        are issued in ALTERNATE weeks: a patient given Bag 1 this week takes
        Bag 2 next week and Bag 1 the week after. The wallet therefore never
        carries the whole 180 at Bag 1 prices.
     2. Households are accepted into the programme, and a couple household
        takes one Bag 2 rather than two Bag 1s. Headcount and serving count
        are therefore shown side by side: the serving count is what gets
        bought and issued, the headcount is what gets fed.

   What this module does NOT do is invent prices. Each line carries the
   Foundation's own working figure until Finance or Procurement keys the
   verified price from a quotation, and the sheet says which is which on
   every row.
   ============================================================ */

/* ---------------- 1. The baskets ----------------
   One item list, two bags, and the same item code in both so the price is
   keyed once and used twice. `qty` is what one bag of that type carries.
   Prices are the working ceiling already used by the food budget; they are
   editable in the Budget tab and an edit is stored per county. */
const FOODBAG_ITEMS = [
  { code:'MAIZE',   name:'Maize meal (unga) — sifted',      unit:'2 kg pack', market:'KES 155 – 190 / pack' },
  { code:'RICE',    name:'Rice — long grain',               unit:'2 kg pack', market:'KES 190 – 240 / pack' },
  { code:'BEANS',   name:'Beans / ndengu',                  unit:'1 kg',      market:'KES 160 – 220 / kg' },
  { code:'GREENGR', name:'Green grams',                     unit:'1 kg',      market:'KES 180 – 230 / kg' },
  { code:'UJIFLR',  name:'Fortified porridge / uji flour',   unit:'1 kg',      market:'KES 150 – 195 / kg' },
  { code:'OIL',     name:'Cooking oil',                     unit:'500 ml',    market:'KES 165 – 210 / bottle' },
  { code:'OMENA',   name:'Omena / soya protein',            unit:'250 g',     market:'KES 120 – 180 / pack' },
  { code:'SUGAR',   name:'Sugar',                           unit:'500 g',     market:'KES 85 – 105 / pack' },
  { code:'SALT',    name:'Iodised salt',                    unit:'500 g',     market:'KES 25 – 40 / pack' },
  { code:'VEGS',    name:'Fresh vegetables & fruit (weekly)',unit:'1 bunch',  market:'KES 90 – 140 / bundle' },
  { code:'GREENS',  name:'Leafy greens (sukuma / managu)',  unit:'1 bunch',   market:'KES 40 – 70 / bundle' },
  { code:'MILK',    name:'Long-life milk',                  unit:'500 ml',    market:'KES 65 – 80 / packet' },
  { code:'ORANGE',  name:'Fresh oranges',                   unit:'1 piece',   market:'KES 15 – 25 / piece' }
];

/* Bag composition. `BG1` is the standard household bag, `BG2` the larger
   family/couple bag, `INP` the bedside pack for a hospitalised patient
   (a patient in a ward is not given a dry household bag that week). */
const FOODBAG_RECIPES = {
  BG1: {
    label:'Bag 1', name:'Standard household food bag', serves:'1 – 2 people',
    items:{ MAIZE:1, BEANS:1, UJIFLR:1, OIL:1, SUGAR:1, SALT:1, VEGS:1, GREENS:1 }
  },
  BG2: {
    label:'Bag 2', name:'Family / couple household food bag', serves:'3 – 5 people',
    items:{ MAIZE:2, RICE:1, BEANS:1, GREENGR:1, UJIFLR:1, OIL:1, OMENA:1, SUGAR:1, SALT:1, VEGS:1, GREENS:1 }
  },
  INP: {
    label:'Inpatient pack', name:'Hospital bedside nutrition pack', serves:'1 inpatient',
    items:{ MILK:4, ORANGE:4 }
  }
};

/* The Foundation's working cost for one unit of each item. Used until a
   verified quotation price is keyed; every screen that shows a total also
   says how many lines are still on the working figure. */
const FOODBAG_WORKING_PRICE = {
  MAIZE:172, RICE:215, BEANS:190, GREENGR:205, UJIFLR:172, OIL:188, OMENA:150,
  SUGAR:95, SALT:32, VEGS:115, GREENS:55, MILK:72, ORANGE:20, BAGPACK:40
};

/* One foldable carrier per bag, so the count is explicit rather than hidden. */
const FOODBAG_PACK_COST = 40;

/* Monday 5 January 2026 — an ordinary Monday used only as the parity origin for
   the alternate-bag rule, so Bag 1 / Bag 2 alternate from the calendar itself
   rather than from whenever somebody first pressed Save. */
const MONDAY_PROTOCOL_DEFAULT_ANCHOR = '2026-W02';

const MONDAY_PROTOCOL = {
  /* The weekly envelope. 180 is the Foundation's stated weekly serving
     budget; it is stored in the county record so a second county can carry a
     different figure without a code change. */
  WEEKLY_BUDGET: 180,

  /* ---- 2. State ---- */
  ensureStore(){
    if(typeof DB === 'undefined' || !DB.db) return null;
    DB.db.foodProtocol = DB.db.foodProtocol || {};
    const c = DB.db.foodProtocol;
    c.settings = Object.assign({ weeklyBudget:this.WEEKLY_BUDGET, startBag:'BG1', anchorWeek:'' }, c.settings||{});
    c.prices = Object.assign({}, FOODBAG_WORKING_PRICE, c.prices||{});
    c.counties = c.counties || {};
    c.orders = Array.isArray(c.orders) ? c.orders : [];
    c.bagLog = Array.isArray(c.bagLog) ? c.bagLog : [];
    return c;
  },

  /* ISO week key (YYYY-Www) so Monday-to-Sunday weeks sort as text. */
  weekKey(date){
    const d = new Date(date || Date.now());
    d.setHours(0,0,0,0);
    const day = (d.getDay() + 6) % 7;           /* Monday = 0 */
    d.setDate(d.getDate() - day + 3);           /* Thursday of this ISO week */
    const firstThursday = new Date(d.getFullYear(), 0, 4);
    const fday = (firstThursday.getDay() + 6) % 7;
    firstThursday.setDate(firstThursday.getDate() - fday + 3);
    const week = 1 + Math.round((d - firstThursday) / (7 * 86400000));
    return `${d.getFullYear()}-W${String(week).padStart(2,'0')}`;
  },

  /* The Monday that opens a given week key. */
  mondayOf(weekKey){
    const m = /^(\d{4})-W(\d{1,2})$/.exec(String(weekKey||''));
    if(!m) return new Date();
    const year = Number(m[1]), week = Number(m[2]);
    const jan4 = new Date(year, 0, 4);
    const jan4Day = (jan4.getDay() + 6) % 7;
    const week1Monday = new Date(jan4);
    week1Monday.setDate(jan4.getDate() - jan4Day);
    const d = new Date(week1Monday);
    d.setDate(week1Monday.getDate() + (week - 1) * 7);
    return d;
  },

  /* ---- 3. The alternate-bag rule ----
     Bag 1 and Bag 2 swap every week. The reference week is stored once, so
     "this week is Bag 1" is a fact the whole system agrees on rather than a
     per-user guess. A patient with a recorded bag last week simply gets the
     other one, which is how the register stays consistent even if a home
     visit was missed and re-issued. */
  primaryBagFor(weekKey){
    const c = this.ensureStore();
    /* Before the first Monday is saved there is no anchor week, and returning a
       constant here would have meant the alternation did not exist until
       somebody pressed Save - the opposite of what the protocol promises. The
       default anchor is a fixed Monday, so week parity is decided from the
       calendar itself and every account, on every device, agrees which bag
       this Monday issues. */
    const anchor = (c && c.settings.anchorWeek) || MONDAY_PROTOCOL_DEFAULT_ANCHOR;
    const startBag = (c && c.settings.startBag === 'BG2') ? 'BG2' : 'BG1';
    const a = this.mondayOf(anchor), b = this.mondayOf(weekKey);
    const weeks = Math.round((b - a) / (7 * 86400000));
    const odd = ((weeks % 2) + 2) % 2 === 1;
    if(!odd) return startBag;
    return startBag === 'BG1' ? 'BG2' : 'BG1';
  },

  /* The bag a specific patient takes this week: the alternate of whatever
     they were issued last week, falling back to the week's primary bag. */
  bagForPatient(patient, weekKey){
    const primary = this.primaryBagFor(weekKey);
    const c = this.ensureStore();
    if(!c || !patient) return primary;
    const last = c.bagLog.filter(x => x && x.patientId === patient.id).sort((a,b)=> String(b.week).localeCompare(String(a.week)))[0];
    if(!last || !last.bag || !['BG1','BG2'].includes(last.bag)) return primary;
    return last.bag === 'BG1' ? 'BG2' : 'BG1';
  },

  /* ---- 4. The Monday arithmetic ----
     Required intakes = 180 − (patients still active after discharges).
     Everything downstream is driven by this one number. */
  computeWeeklyPlan({ activeNow = 0, discharges = 0, deaths = 0, inpatient = 0, completed = 0, weeklyBudget = this.WEEKLY_BUDGET, avgHousehold = 2.4 } = {}){
    const budget = Math.max(0, Number(weeklyBudget) || this.WEEKLY_BUDGET);
    const active = Math.max(0, Number(activeNow) || 0);
    const leaving = Math.max(0, Number(discharges)||0) + Math.max(0, Number(deaths)||0) + Math.max(0, Number(completed)||0);
    /* Discharges are what the count is taken AFTER; a negative remainder means
       the register is already over the weekly envelope, and that is reported
       rather than clamped so it cannot be hidden. */
    const remaining = active - leaving;
    const requiredIntakes = budget - remaining;
    const servedThisWeek = Math.min(budget, Math.max(0, remaining) + Math.max(0, requiredIntakes));
    const inWard = Math.min(servedThisWeek, Math.max(0, Number(inpatient)||0));
    const homeServed = Math.max(0, servedThisWeek - inWard);
    /* Households: a couple household takes one Bag 2, so the household count is
       the denominator of the bag budget, not the patient count. */
    const households = Math.max(0, Math.round(homeServed / Math.max(1, Number(avgHousehold)||2.4)));
    return {
      weeklyBudget: budget,
      activeNow: active,
      leaving,
      remaining: Math.max(0, remaining),
      overEnvelope: remaining > budget,
      overBy: remaining > budget ? remaining - budget : 0,
      requiredIntakes: Math.max(0, requiredIntakes),
      servedThisWeek,
      inWard,
      homeServed,
      households,
      headcountFed: servedThisWeek,
      underFilled: requiredIntakes < 0 ? Math.max(0, -requiredIntakes) : 0
    };
  },

  /* How the two bags split. Bag 1 goes to single / adult-only households,
     Bag 2 to couple and larger households. The split is a setting because it
     is a programme decision, not arithmetic. */
  splitBags(homeServed, households, bag1Share = 0.34){
    const total = Math.max(0, Math.round(homeServed));
    const coupleOrLarger = Math.max(0, Math.min(total, Math.round(total * (1 - bag1Share))));
    return { bag1: Math.max(0, total - coupleOrLarger), bag2: coupleOrLarger, households };
  },

  /* ---- 5. Item-level budget for one week ----
     Quantities are derived from the recipes, prices from the county record.
     A line is flagged `working:true` while it still carries the Foundation's
     working figure rather than a keyed verified price. */
  computeWeekBudget(countyId = 'kisumu', weekKey = this.weekKey(), planOverride = null){
    const c = this.ensureStore();
    const plan = planOverride || this.computeWeeklyPlan(this.planInputs(countyId));
    const split = this.splitBags(plan.homeServed, plan.households, Number((c && c.settings.bag1Share) ?? 0.34));
    /* Alternate issue: only the primary bag of this week is bought for the
       home roster; the other bag is bought for the patients who were issued it
       last week and are taking the alternate now. In practice both bags are
       bought every week, each for half the roster, which is the point of
       alternating. The per-bag counts below are what gets purchased. */
    const primary = this.primaryBagFor(weekKey);
    const secondary = primary === 'BG1' ? 'BG2' : 'BG1';
    const half = Math.round(plan.homeServed / 2);
    const bags = {
      BG1: primary === 'BG1' ? half : plan.homeServed - half,
      BG2: primary === 'BG2' ? half : plan.homeServed - half,
      INP: plan.inWard
    };
    const priceFor = (code) => Number((c && c.prices && c.prices[code]) ?? FOODBAG_WORKING_PRICE[code] ?? 0);

    const lines = [];
    let verifiedLines = 0, workingLines = 0;
    for (const bagCode of ['BG1','BG2','INP']){
      const recipe = FOODBAG_RECIPES[bagCode];
      const count = Math.max(0, Number(bags[bagCode]) || 0);
      Object.keys(recipe.items).forEach((itemCode, idx) => {
        const per = Number(recipe.items[itemCode]) || 0;
        const item = FOODBAG_ITEMS.find(i => i.code === itemCode) || { code:itemCode, name:itemCode, unit:'unit' };
        const unitPrice = priceFor(itemCode);
        const verified = Boolean(c && c.verified && c.verified[itemCode]);
        if (verified) verifiedLines++; else workingLines++;
        lines.push({
          bagCode, bagLabel: recipe.label, itemCode, name:item.name, unit:item.unit,
          perBag: per, bags: count, qty: per * count, unitPrice,
          lineTotal: per * count * unitPrice, verified, firstOfBag: idx === 0
        });
      });
      /* the carrier itself */
      lines.push({
        bagCode, bagLabel: recipe.label, itemCode:'BAGPACK', name:'Carrier bag / pack',
        unit:'1 bag', perBag:1, bags:count, qty:count,
        unitPrice: priceFor('BAGPACK'), lineTotal: count * priceFor('BAGPACK'),
        verified: Boolean(c && c.verified && c.verified.BAGPACK), firstOfBag:false
      });
    }

    const totals = lines.reduce((a, l) => {
      a[l.bagCode] = (a[l.bagCode] || 0) + l.lineTotal;
      return a;
    }, {});
    const grandTotal = lines.reduce((n, l) => n + l.lineTotal, 0);
    const perPatient = plan.servedThisWeek ? grandTotal / plan.servedThisWeek : 0;
    const perHousehold = plan.households ? grandTotal / plan.households : 0;

    return {
      countyId, weekKey, monday:this.mondayOf(weekKey), primary, secondary, bags, plan, split,
      lines, totals, grandTotal, perPatient, perHousehold,
      priceStatus: workingLines === 0 ? 'verified' : (verifiedLines === 0 ? 'working' : 'mixed'),
      verifiedLines, workingLines
    };
  },

  /* Where the "still active" figure comes from. The register is the authority;
     the manual figure exists so Monday can be run before the register is
     reconciled, and the screen says which one was used. */
  planInputs(countyId){
    const c = this.ensureStore();
    const saved = (c && c.counties && c.counties[countyId]) || {};
    const scoped = (invoice) => !countyId || !invoice || !invoice.countyId || invoice.countyId === countyId;
    let activeNow = null;
    try {
      if (typeof DB !== 'undefined' && DB.db && Array.isArray(DB.db.patients)){
        const rows = DB.db.patients.filter(p => p && scoped(p) && !p.demo === false ? true : scoped(p));
        const live = DB.db.patients.filter(p => p && scoped(p) && !['discharged','deceased','inactive','completed'].includes(String(p.status||'active')));
        if (live.length) activeNow = live.length;
        void rows;
      }
    } catch (_e){ activeNow = null; }
    return {
      activeNow: activeNow !== null ? activeNow : Number(saved.activeNow) || 0,
      fromRegister: activeNow !== null,
      discharges: Number(saved.discharges) || 0,
      deaths: Number(saved.deaths) || 0,
      completed: Number(saved.completed) || 0,
      inpatient: Number(saved.inpatient) || 0,
      avgHousehold: Number(saved.avgHousehold) || 2.4,
      weeklyBudget: Number(saved.weeklyBudget) || this.WEEKLY_BUDGET
    };
  },

  /* ---- 6. Monday order record ----
     Freezing the week is what makes it auditable: once a Monday is closed the
     quantities and prices are copied onto the order, so a later price change
     cannot rewrite what was bought. */
  frozenOrder(weekKey, countyId){
    const c = this.ensureStore();
    if(!c) return null;
    return c.orders.find(o => o.weekKey === weekKey && o.countyId === countyId) || null;
  },

  closeMonday(weekKey, countyId, actor){
    const c = this.ensureStore();
    if(!c || typeof AUTH === 'undefined' || !AUTH.user) return { ok:false, msg:'Sign in to close the Monday budget.' };
    const computed = this.computeWeekBudget(countyId, weekKey);
    const existing = this.frozenOrder(weekKey, countyId);
    if(existing) return { ok:false, msg:`${weekKey} is already closed and frozen. Reopen it first if the budget genuinely changed.` };
    const order = {
      id:'FB-'+weekKey.replace(/[^0-9]/g,'')+'-'+String(countyId).slice(0,3).toUpperCase(),
      weekKey, countyId, closedAt:new Date().toISOString(), closedBy:actor || AUTH.user.username,
      forecastPatients:computed.plan.servedThisWeek,
      requiredIntakes:computed.plan.requiredIntakes,
      grandTotal:computed.grandTotal,
      primaryBag:computed.primary,
      lines:computed.lines.map(l => ({ itemCode:l.itemCode, name:l.name, unit:l.unit, qty:l.qty, unitPrice:l.unitPrice, lineTotal:l.lineTotal, bagCode:l.bagCode })),
      status:'closed'
    };
    c.orders.push(order);
    if(typeof AUDIT !== 'undefined' && AUDIT.append){
      AUDIT.append({ actor:AUTH.user.id, action:'procurement.monday_closed', entity:'food_protocol', entityId:order.id,
        detail:`Monday Procurement Protocol closed for ${weekKey} (${countyName(countyId)}): ${order.forecastPatients} patients, ${computed.plan.requiredIntakes} new intakes, ${money(order.grandTotal)}.` });
    }
    if(typeof DB.persistState === 'function') DB.persistState();
    return { ok:true, order };
  },

  reopenMonday(weekKey, countyId){
    const c = this.ensureStore();
    if(!c) return { ok:false };
    const idx = c.orders.findIndex(o => o.weekKey === weekKey && o.countyId === countyId);
    if(idx < 0) return { ok:false, msg:'That week is not closed.' };
    const [removed] = c.orders.splice(idx, 1);
    if(typeof AUDIT !== 'undefined' && AUDIT.append && typeof AUTH !== 'undefined' && AUTH.user){
      AUDIT.append({ actor:AUTH.user.id, action:'procurement.monday_reopened', entity:'food_protocol', entityId:removed.id,
        detail:`Monday Procurement Protocol reopened for ${weekKey}; the frozen order was released.` });
    }
    if(typeof DB.persistState === 'function') DB.persistState();
    return { ok:true };
  },

  /* Record that a bag actually went out, which is what keeps the alternate
     rule honest for an individual patient. */
  logIssue(patientId, weekKey, bagCode, actor){
    const c = this.ensureStore();
    if(!c || !patientId) return { ok:false };
    c.bagLog = c.bagLog.filter(x => !(x.patientId === patientId && x.week === weekKey));
    c.bagLog.push({ patientId, week:weekKey, bag:bagCode, at:new Date().toISOString(), by:actor || (typeof AUTH!=='undefined'&&AUTH.user?AUTH.user.username:'') });
    if(typeof DB.persistState === 'function') DB.persistState();
    return { ok:true };
  }
};

/* ============================================================
   7. The procurement console workspace

   Four tabs, because Monday work has four steps and mixing them is how a
   budget stops being checkable: Monday (the arithmetic), Bags (what is in
   them), Budget (item quantities and money), Orders (frozen weeks).
   ============================================================ */
const MONDAY_PROTOCOL_UI = {
  render(user, params = {}){
    if(typeof RBAC !== 'undefined' && !RBAC.has(user,'procurement.view') && !RBAC.has(user,'finance.view') && !RBAC.has(user,'monday.meeting')){
      return deniedPanel('procurement.view');
    }
    const c = MONDAY_PROTOCOL.ensureStore();
    if(!c) return emptyState('Storage unavailable','The database is not open on this device.','alert');
    const isGlobalUser = (typeof isGlobal === 'function') ? isGlobal(user) : false;
    const countyId = (isGlobalUser && params.county) ? params.county : (user.countyId || 'kisumu');
    const weekKey = params.week || MONDAY_PROTOCOL.weekKey();
    const tab = params.tab || 'monday';

    const canManage = (typeof RBAC !== 'undefined') && (RBAC.has(user,'procurement.manage') || RBAC.has(user,'finance.pay') || RBAC.has(user,'finance.budget.manage'));
    const plan = MONDAY_PROTOCOL.computeWeeklyPlan(MONDAY_PROTOCOL.planInputs(countyId));
    const budget = MONDAY_PROTOCOL.computeWeekBudget(countyId, weekKey, plan);
    const frozen = MONDAY_PROTOCOL.frozenOrder(weekKey, countyId);

    const countyBtns = isGlobalUser ? `<div class="row" style="gap:6px;flex-wrap:wrap">
      ${COUNTIES.map(x=>`<button class="btn btn-xs ${countyId===x.id?'btn-primary':'btn-ghost'}" data-act="go" data-v="foodprotocol" data-county="${x.id}" data-week="${weekKey}" data-tab="${tab}">${esc(x.name)}</button>`).join('')}
    </div>` : '';

    /* The week switcher walks Mondays, because the whole protocol is a
       Monday-to-Sunday week. */
    const weekNav = (() => {
      const prev = new Date(MONDAY_PROTOCOL.mondayOf(weekKey)); prev.setDate(prev.getDate()-7);
      const next = new Date(MONDAY_PROTOCOL.mondayOf(weekKey)); next.setDate(next.getDate()+7);
      const label = MONDAY_PROTOCOL.mondayOf(weekKey).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric'});
      return `<div class="row" style="gap:6px;align-items:center;flex-wrap:wrap">
        <button class="btn btn-xs btn-ghost" data-act="go" data-v="foodprotocol" data-county="${esc(countyId)}" data-week="${MONDAY_PROTOCOL.weekKey(prev)}" data-tab="${tab}" title="Previous Monday">${ic('chevron',13)}</button>
        <span class="small"><b>Monday ${esc(label)}</b> <span class="muted xs mono">${esc(weekKey)}</span></span>
        <button class="btn btn-xs btn-ghost" data-act="go" data-v="foodprotocol" data-county="${esc(countyId)}" data-week="${MONDAY_PROTOCOL.weekKey(next)}" data-tab="${tab}" title="Next Monday">${ic('chevron',13)}</button>
        ${frozen?badge('Closed & frozen','b-ok','nodot'):badge('Open','b-warn','nodot')}
      </div>`;
    })();

    const tabs = `<div class="tabs" style="margin-bottom:14px">
      <button class="tab ${tab==='monday'?'active':''}" data-act="go" data-v="foodprotocol" data-tab="monday" data-county="${esc(countyId)}" data-week="${weekKey}">${ic('calendar',14)} Monday Arithmetic</button>
      <button class="tab ${tab==='bags'?'active':''}" data-act="go" data-v="foodprotocol" data-tab="bags" data-county="${esc(countyId)}" data-week="${weekKey}">${ic('package',14)} Bag Contents</button>
      <button class="tab ${tab==='budget'?'active':''}" data-act="go" data-v="foodprotocol" data-tab="budget" data-county="${esc(countyId)}" data-week="${weekKey}">${ic('receipt',14)} Item Budget</button>
      <button class="tab ${tab==='orders'?'active':''}" data-act="go" data-v="foodprotocol" data-tab="orders" data-county="${esc(countyId)}" data-week="${weekKey}">${ic('clipboard',14)} Closed Weeks (${(c.orders||[]).filter(o=>o.countyId===countyId).length})</button>
    </div>`;

    let body = '';

    /* ---------- Monday: the arithmetic ---------- */
    if(tab==='monday'){
      const inp = MONDAY_PROTOCOL.planInputs(countyId);
      body = `<div class="grid g2" style="margin-bottom:16px">
        ${card('Monday Protocol — how the week is sized', `
          <div class="note">${ic('info',14)}<span><b>The envelope is ${num(plan.weeklyBudget)} patients a week.</b> Every Monday the number still on the Active Programme Register, after discharges and completions, is taken off ${num(plan.weeklyBudget)}. The remainder is the number of new patients to accept this week, so the register finishes the week at ${num(plan.weeklyBudget)} served.</span></div>
          <form id="foodProtocolForm">
            <input type="hidden" name="countyId" value="${esc(countyId)}">
            <input type="hidden" name="weekKey" value="${esc(weekKey)}">
            <div class="grid g2" style="margin-top:10px">
              <div class="field"><label>Active on the register now ${inp.fromRegister?'<span class="xs muted">(from the register)</span>':'<span class="xs muted">(entered by hand)</span>'}</label>
                <input class="input" type="number" min="0" name="activeNow" value="${inp.activeNow}"></div>
              <div class="field"><label>Weekly envelope (patients served)</label>
                <input class="input" type="number" min="0" name="weeklyBudget" value="${inp.weeklyBudget}"></div>
              <div class="field"><label>Discharged this week (−)</label>
                <input class="input" type="number" min="0" name="discharges" value="${inp.discharges}"></div>
              <div class="field"><label>Deceased this week (−)</label>
                <input class="input" type="number" min="0" name="deaths" value="${inp.deaths}"></div>
              <div class="field"><label>Completed programme (−)</label>
                <input class="input" type="number" min="0" name="completed" value="${inp.completed}"></div>
              <div class="field"><label>Currently in a hospital ward</label>
                <input class="input" type="number" min="0" name="inpatient" value="${inp.inpatient}"></div>
              <div class="field"><label>Average people per household</label>
                <input class="input" type="number" min="1" step="0.1" name="avgHousehold" value="${inp.avgHousehold}"></div>
              <div class="field"><label>Bag 1 share of the roster (%)</label>
                <input class="input" type="number" min="0" max="100" name="bag1SharePct" value="${Math.round((Number(c.settings.bag1Share)||0.34)*100)}"></div>
            </div>
            <div class="spread" style="margin-top:10px;flex-wrap:wrap;gap:8px">
              <span class="xs muted">Intakes = Envelope − (Active − Discharged − Deceased − Completed)</span>
              ${canManage?`<button type="button" class="btn btn-sm btn-primary" data-act="foodprotocol-save">${ic('refresh',14)} Save Monday figures</button>`:''}
            </div>
          </form>
        `)}
        ${card('This Monday\'s worked answer', `
          <div class="grid g2" style="gap:10px">
            <div class="cm"><span class="cm-l">Still active after exits</span><b class="cm-v">${num(plan.remaining)}</b><span class="cm-s">${num(plan.activeNow)} active − ${num(plan.leaving)} leaving</span></div>
            <div class="cm"><span class="cm-l">New patients to accept</span><b class="cm-v">${num(plan.requiredIntakes)}</b><span class="cm-s">to reach ${num(plan.weeklyBudget)} served</span></div>
            <div class="cm"><span class="cm-l">Fed this week (headcount)</span><b class="cm-v">${num(plan.headcountFed)}</b><span class="cm-s">${num(plan.inWard)} in a ward · ${num(plan.homeServed)} at home</span></div>
            <div class="cm"><span class="cm-l">Households served</span><b class="cm-v">${num(plan.households)}</b><span class="cm-s">at ${plan.households? (plan.homeServed/plan.households).toFixed(1):'0'} people per household</span></div>
          </div>
          ${plan.overEnvelope?`<div class="note" style="margin-top:10px;background:#fff4df;border-color:#edd4a6">${ic('alert',14)}<span><b>The register is already ${num(plan.overBy)} over the ${num(plan.weeklyBudget)} envelope.</b> No new intakes are calculated this week. The overrun is shown rather than hidden so it can be resolved by discharge or a budget decision, not by arithmetic.</span></div>`:''}
          ${plan.requiredIntakes === 0 && !plan.overEnvelope ? `<div class="note" style="margin-top:10px">${ic('check',14)}<span>The register already stands at the full ${num(plan.weeklyBudget)}. No new intakes are needed; assessment forms need not be raised.</span></div>`:''}
          <div class="note" style="margin-top:10px">${ic('calendar',14)}<span><b>Bag ${esc(budget.primary.replace('BG',''))} is issued this week</b> and Bag ${esc(budget.secondary.replace('BG',''))} next Monday. Each patient alternates every week, so no patient receives the same bag twice running.</span></div>
        `)}
      </div>`
      + card('The four Monday steps, in order', `
        <ol class="small" style="margin:0;padding-left:18px;line-height:1.9">
          <li><b>Count the register.</b> Active patients after last week's discharges, deaths and completions. The register supplies this figure; the box above only overrides it when the register is not yet reconciled.</li>
          <li><b>Subtract from ${num(plan.weeklyBudget)}.</b> The remainder is this week's new intakes. That number is the assessment-form target for the week — no more households are accepted than the basket can feed.</li>
          <li><b>Budget the bags.</b> Bag 1 and Bag 2 alternate weekly; each patient takes one bag. Hospitalised patients take the bedside pack instead of a dry household bag.</li>
          <li><b>Close the Monday.</b> Closing freezes the quantities and prices for the week, so a later price change cannot rewrite what was ordered.</li>
        </ol>`, { sub:'Every figure below is derived from steps 1 and 2; nothing is keyed twice.' });
    }

    /* ---------- Bags: what is inside ---------- */
    if(tab==='bags'){
      const bagCards = ['BG1','BG2','INP'].map(code => {
        const r = FOODBAG_RECIPES[code];
        const rows = Object.keys(r.items).map(itemCode => {
          const item = FOODBAG_ITEMS.find(i=>i.code===itemCode) || { name:itemCode, unit:'unit', market:'-' };
          const price = Number(c.prices[itemCode] ?? FOODBAG_WORKING_PRICE[itemCode] ?? 0);
          const qty = Number(r.items[itemCode]) || 0;
          return { itemCode, name:item.name, unit:item.unit, qty, price, line:qty*price, market:item.market, verified:Boolean(c.verified && c.verified[itemCode]) };
        });
        const bagCost = rows.reduce((n,x)=>n+x.line,0) + Number(c.prices.BAGPACK ?? FOODBAG_PACK_COST);
        const isThisWeek = budget.primary === code;
        return card(`${r.label} — ${r.name}`, `
          <div class="spread" style="margin-bottom:8px;flex-wrap:wrap;gap:8px">
            <span class="small muted">Serves ${esc(r.serves)} · ${num(budget.bags[code]||0)} to issue this Monday</span>
            ${isThisWeek?badge('Issued this week','b-ok','nodot'):badge(code==='INP'?'As admitted':'Alternates next week','b-info','nodot')}
          </div>
          ${table([
            {label:'Item', render:x=>`<b>${esc(x.name)}</b><div class="xs muted">${esc(x.unit)} · ${esc(x.market)}</div>`},
            {label:'Per bag', cls:'num mono', render:x=>num(x.qty)},
            {label:'Unit price', cls:'num mono', render:x=>`${money(x.price)} ${x.verified?badge('verified','b-ok','nodot'):'<span class="xs muted">working</span>'}`},
            {label:'Per bag cost', cls:'num mono', render:x=>money(x.line)}
          ], rows)}
          <div class="spread" style="margin-top:8px;border-top:1px solid var(--line);padding-top:8px">
            <span class="small"><b>One ${esc(r.label)} costs</b> <span class="xs muted">(plus ${money(c.prices.BAGPACK ?? FOODBAG_PACK_COST)} carrier)</span></span>
            <b class="mono">${money(bagCost)}</b>
          </div>
        `);
      }).join('');
      body = `<div class="grid g3" style="margin-bottom:16px">${bagCards}</div>`
        + card('The alternation rule, stated plainly', `
          <p class="small" style="line-height:1.8;margin:0">
            Every patient is fed every week, but the two bags are not the same size: <b>Bag 1</b> is the standard
            household bag for one or two people, <b>Bag 2</b> the larger family or couple bag for three to five.
            A patient given Bag 1 this Monday takes Bag 2 next Monday and Bag 1 the Monday after, so over any two
            weeks each patient receives one of each. Households are accepted, and a couple household takes one
            Bag 2 rather than two Bag 1s — that is why the budget works in <b>households served</b> as well as
            headcount, and why the two figures are shown side by side on every screen.
          </p>
          <div class="note" style="margin-top:10px">${ic('info',14)}<span>A patient in a hospital ward that week takes the <b>bedside pack</b> (milk and oranges) instead of a dry household bag, so no household bag is bought twice for the same person.</span></div>
        `, { sub:'Bag contents and unit prices are the Foundation\'s own; a price becomes "verified" when Procurement keys the quotation figure.' });
    }

    /* ---------- Budget: item quantities and money ---------- */
    if(tab==='budget'){
      const grouped = ['BG1','BG2','INP'].map(code => {
        const rows = budget.lines.filter(l => l.bagCode === code);
        return { code, label:FOODBAG_RECIPES[code].label, bags:budget.bags[code]||0, rows, total:budget.totals[code]||0 };
      });
      const priceBadge = budget.priceStatus === 'verified' ? badge('All prices verified','b-ok','nodot')
        : budget.priceStatus === 'mixed' ? badge(`${budget.workingLines} lines on working prices`,'b-warn','nodot')
        : badge('Working prices — key quotations','b-warn','nodot');

      body = `<div class="grid g4" style="margin-bottom:14px">
          ${kpi('Weekly foodbag budget', money(budget.grandTotal), `${num(budget.lines.reduce((n,l)=>n+l.qty,0))} item units`, 'info', 'wallet')}
          ${kpi('Per patient fed', money(budget.perPatient), `${num(plan.headcountFed)} patients this week`, '', 'users')}
          ${kpi('Per household', money(budget.perHousehold), `${num(plan.households)} households`, '', 'home')}
          ${kpi('Bag split this Monday', `1 × ${num(budget.bags.BG1)} · 2 × ${num(budget.bags.BG2)}`, `Primary bag: ${FOODBAG_RECIPES[budget.primary].label}`, 'ok', 'package')}
        </div>`
        + card('Budget is the Monday order — this is what gets bought', `
          <div class="spread" style="margin-bottom:10px;flex-wrap:wrap;gap:8px">
            <span class="small muted">Quantities are per-bag contents × bags to issue. ${priceBadge}</span>
            <div class="row" style="gap:6px;flex-wrap:wrap">
              ${canManage?`<button class="btn btn-sm btn-ghost" data-act="foodprotocol-prices" data-county="${esc(countyId)}">${ic('receipt',14)} Key quotation prices</button>`:''}
              ${canManage?`<button class="btn btn-sm btn-ghost" data-act="foodprotocol-print" data-county="${esc(countyId)}" data-week="${esc(weekKey)}">${ic('file',14)} Printable order</button>`:''}
              ${canManage && !frozen?`<button class="btn btn-sm btn-primary" data-act="foodprotocol-close" data-county="${esc(countyId)}" data-week="${esc(weekKey)}">${ic('check',14)} Close & freeze this Monday</button>`:''}
              ${canManage && frozen?`<button class="btn btn-sm btn-ghost" data-act="foodprotocol-reopen" data-county="${esc(countyId)}" data-week="${esc(weekKey)}">${ic('refresh',14)} Reopen this Monday</button>`:''}
            </div>
          </div>
          ${grouped.map(g => `
            <div style="margin-bottom:14px">
              <div class="spread" style="margin-bottom:6px">
                <b class="small">${esc(g.label)} <span class="muted xs">${num(g.bags)} bag(s) to issue</span></b>
                <b class="mono small">${money(g.total)}</b>
              </div>
              ${table([
                {label:'Item', render:x=>`<b>${esc(x.name)}</b><div class="xs muted">${esc(x.unit)}</div>`},
                {label:'Per bag', cls:'num mono', render:x=>num(x.perBag)},
                {label:'Bags', cls:'num mono', render:x=>num(x.bags)},
                {label:'Total qty', cls:'num mono', render:x=>`<b>${num(x.qty)}</b>`},
                {label:'Unit price', cls:'num mono', render:x=>money(x.unitPrice)},
                {label:'Line total', cls:'num mono', render:x=>`<b>${money(x.lineTotal)}</b>`}
              ], g.rows)}
            </div>`).join('')}
          <div class="spread" style="border-top:2px solid var(--ink);padding-top:8px">
            <b>Week total</b><b class="mono" style="font-size:16px">${money(budget.grandTotal)}</b>
          </div>
        `, { sub:`${MONDAY_PROTOCOL.mondayOf(weekKey).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})} · ${countyName(countyId)} · figures follow the ${num(plan.servedThisWeek)} patients this Monday's arithmetic produced.` })
        + card('Verified quotation prices', `
          <p class="small muted" style="margin:0 0 10px">A line stops saying <i>working</i> when the price here is the one on a supplier quotation, not the Foundation's planning figure. Keying a price never changes the bag contents.</p>
          <form id="foodProtocolPriceForm">
            <input type="hidden" name="countyId" value="${esc(countyId)}">
            <div class="grid g4">
              ${FOODBAG_ITEMS.map(i=>`<div class="field"><label>${esc(i.name)} <span class="xs muted">${esc(i.unit)}</span></label>
                <input class="input" type="number" min="0" step="1" name="price_${esc(i.code)}" value="${Number(c.prices[i.code] ?? FOODBAG_WORKING_PRICE[i.code] ?? 0)}">
                <span class="xs muted">${esc(i.market)}</span></div>`).join('')}
            </div>
            <div class="spread" style="margin-top:10px;flex-wrap:wrap;gap:8px">
              <span class="xs muted">Source recorded on every save: quotation date, supplier reference and who keyed it.</span>
              ${canManage?`<button type="button" class="btn btn-sm btn-primary" data-act="foodprotocol-price-save">${ic('check',14)} Save prices as verified</button>`:''}
            </div>
          </form>
        `);
    }

    /* ---------- Orders: the closed weeks ---------- */
    if(tab==='orders'){
      const orders = (c.orders||[]).filter(o=>o.countyId===countyId).sort((a,b)=>String(b.weekKey).localeCompare(String(a.weekKey)));
      body = card('Closed Monday orders', orders.length ? table([
        {label:'Week', cls:'mono', render:o=>`<b>${esc(o.weekKey)}</b><div class="xs muted">${esc(fmtDate(o.closedAt))}</div>`},
        {label:'Reference', cls:'mono', render:o=>esc(o.id)},
        {label:'Patients fed', cls:'num', render:o=>`<b>${num(o.forecastPatients)}</b><div class="xs muted">${num(o.requiredIntakes)} new intakes</div>`},
        {label:'Primary bag', render:o=>badge(FOODBAG_RECIPES[o.primaryBag]?FOODBAG_RECIPES[o.primaryBag].label:(o.primaryBag||'-'),'b-info','nodot')},
        {label:'Total', cls:'num mono', render:o=>`<b>${money(o.grandTotal)}</b>`},
        {label:'Closed by', render:o=>`<span class="small">${esc(o.closedBy||'-')}</span>`},
        {label:'', render:o=>`<button class="btn btn-xs btn-ghost" data-act="go" data-v="foodprotocol" data-tab="budget" data-county="${esc(countyId)}" data-week="${esc(o.weekKey)}">View</button>`}
      ], orders) : emptyState('No Monday closed yet',
        'Close a Monday from the Item Budget tab. Closing freezes the quantities and prices for that week, so the order cannot be rewritten by a later price change.','clipboard'),
        { sub:'A frozen week is the record of what was actually ordered and at what price.' });
    }

    return pageHead('Monday Procurement Protocol',
      `The 180-patient weekly envelope, the alternate Bag 1 / Bag 2 issue, and the item-level foodbag budget the Procurement Office buys against.`,
      `${countyBtns}${weekNav}
       <button class="btn btn-sm btn-ghost" data-act="go" data-v="foodbudget">${ic('clipboard',15)} Legacy food &amp; hygiene budget</button>
       <button class="btn btn-sm btn-ghost" data-act="go" data-v="procurement">${ic('package',15)} Supplier register</button>`)
      + tabs + body;
  }
};

/* ============================================================
   8. Actions
   ============================================================ */
if (typeof ACTIONS !== 'undefined') {
  const protocolCounty = (d = {}) => d.county || (AUTH && AUTH.user && AUTH.user.countyId) || 'kisumu';
  const openProtocol = (countyId, week, tab) => {
    if (typeof go === 'function') {
      go('foodprotocol', { county: countyId, week: week || MONDAY_PROTOCOL.weekKey(), tab: tab || 'monday' });
    }
  };

  Object.assign(ACTIONS, {
    'foodprotocol-save': (d = {}) => {
      const f = document.querySelector('#foodProtocolForm');
      if (!f) return;
      const fd = new FormData(f);
      const countyId = String(fd.get('countyId') || protocolCounty(d));
      const weekKey = String(fd.get('weekKey') || MONDAY_PROTOCOL.weekKey());
      const c = MONDAY_PROTOCOL.ensureStore();
      c.counties[countyId] = Object.assign({}, c.counties[countyId] || {}, {
        activeNow: Number(fd.get('activeNow') || 0),
        weeklyBudget: Number(fd.get('weeklyBudget') || MONDAY_PROTOCOL.WEEKLY_BUDGET),
        discharges: Number(fd.get('discharges') || 0),
        deaths: Number(fd.get('deaths') || 0),
        completed: Number(fd.get('completed') || 0),
        inpatient: Number(fd.get('inpatient') || 0),
        avgHousehold: Number(fd.get('avgHousehold') || 2.4),
        savedAt: new Date().toISOString()
      });
      c.settings.bag1Share = Math.min(100, Math.max(0, Number(fd.get('bag1SharePct') || 34))) / 100;
      /* The first Monday saved becomes the anchor for the alternate-bag rule,
         so the alternation is consistent for everyone from then on. */
      if (!c.settings.anchorWeek) {
        c.settings.anchorWeek = weekKey;
        c.settings.startBag = 'BG1';
      }
      const plan = MONDAY_PROTOCOL.computeWeeklyPlan(MONDAY_PROTOCOL.planInputs(countyId));
      if (typeof AUDIT !== 'undefined' && AUDIT.append && AUTH.user) {
        AUDIT.append({ actor: AUTH.user.id, action: 'procurement.monday_saved', entity: 'food_protocol', entityId: countyId,
          detail: `${weekKey} ${countyName(countyId)}: ${plan.remaining} active, ${plan.requiredIntakes} new intakes against the ${plan.weeklyBudget} envelope.` });
      }
      if (typeof DB.persistState === 'function') DB.persistState();
      if (typeof toast === 'function') {
        toast('Monday figures saved',
          `${plan.requiredIntakes} new patients to accept this week (${plan.remaining} active after exits, envelope ${plan.weeklyBudget}).`, 'ok');
      }
      openProtocol(countyId, weekKey, 'monday');
    },

    'foodprotocol-price-save': (d = {}) => {
      const f = document.querySelector('#foodProtocolPriceForm');
      if (!f) return;
      const fd = new FormData(f);
      const countyId = String(fd.get('countyId') || protocolCounty(d));
      const c = MONDAY_PROTOCOL.ensureStore();
      c.verified = c.verified || {};
      c.priceSource = c.priceSource || {};
      const stampedAt = new Date().toISOString();
      FOODBAG_ITEMS.forEach(i => {
        const v = fd.get(`price_${i.code}`);
        if (v === null || v === '' || isNaN(Number(v))) return;
        c.prices[i.code] = Number(v);
        c.verified[i.code] = true;
        c.priceSource[i.code] = { at: stampedAt, by: (AUTH && AUTH.user && AUTH.user.username) || '', countyId };
      });
      const packVal = fd.get('price_BAGPACK');
      if (packVal !== null && packVal !== '' && !isNaN(Number(packVal))) {
        c.prices.BAGPACK = Number(packVal);
        c.verified.BAGPACK = true;
      }
      if (typeof AUDIT !== 'undefined' && AUDIT.append && AUTH.user) {
        AUDIT.append({ actor: AUTH.user.id, action: 'procurement.prices_verified', entity: 'food_protocol', entityId: countyId,
          detail: `Quotation prices keyed for ${countyName(countyId)}; the item budget now uses verified figures.` });
      }
      if (typeof DB.persistState === 'function') DB.persistState();
      if (typeof toast === 'function') toast('Prices recorded as verified', 'The item budget now uses these figures. Bag contents are unchanged.', 'ok');
      openProtocol(countyId, d.week || MONDAY_PROTOCOL.weekKey(), 'budget');
    },

    'foodprotocol-close': (d = {}) => {
      const countyId = protocolCounty(d);
      const weekKey = d.week || MONDAY_PROTOCOL.weekKey();
      const r = MONDAY_PROTOCOL.closeMonday(weekKey, countyId, AUTH && AUTH.user ? AUTH.user.username : '');
      if (!r.ok) { if (typeof toast === 'function') toast('Not closed', r.msg || 'The Monday could not be closed.', 'warn'); return; }
      if (typeof toast === 'function') {
        toast('Monday closed and frozen',
          `${weekKey} is fixed at ${money(r.order.grandTotal)} for ${r.order.forecastPatients} patients. A later price change cannot rewrite it.`, 'ok');
      }
      openProtocol(countyId, weekKey, 'budget');
    },

    'foodprotocol-reopen': (d = {}) => {
      const countyId = protocolCounty(d);
      const weekKey = d.week || MONDAY_PROTOCOL.weekKey();
      const r = MONDAY_PROTOCOL.reopenMonday(weekKey, countyId);
      if (typeof toast === 'function') {
        toast(r.ok ? 'Monday reopened' : 'Not reopened',
          r.ok ? `${weekKey} is open again and will follow the current figures.` : (r.msg || 'That week was not closed.'), r.ok ? 'ok' : 'warn');
      }
      openProtocol(countyId, weekKey, 'budget');
    },

    'foodprotocol-prices': (d = {}) => {
      const countyId = protocolCounty(d);
      openProtocol(countyId, d.week || MONDAY_PROTOCOL.weekKey(), 'budget');
      if (typeof toast === 'function') toast('Key the quotation prices', 'Scroll to “Verified quotation prices” at the foot of this tab.', 'info');
    },

    'foodprotocol-print': (d = {}) => {
      const countyId = protocolCounty(d);
      const weekKey = d.week || MONDAY_PROTOCOL.weekKey();
      const b = MONDAY_PROTOCOL.computeWeekBudget(countyId, weekKey);
      if (typeof openModal !== 'function' || typeof table !== 'function') return;
      const html = `<div class="small" style="margin-bottom:10px">
          <b>${esc(countyName(countyId))}</b> · Monday ${esc(MONDAY_PROTOCOL.mondayOf(weekKey).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'}))}<br>
          Patients fed: <b>${num(b.plan.servedThisWeek)}</b> · New intakes: <b>${num(b.plan.requiredIntakes)}</b> · Primary bag: <b>${esc(FOODBAG_RECIPES[b.primary].label)}</b>
        </div>`
        + table([
          {label:'Bag', render:l=>esc(FOODBAG_RECIPES[l.bagCode].label)},
          {label:'Item', render:l=>esc(l.name)},
          {label:'Unit', render:l=>esc(l.unit)},
          {label:'Qty', cls:'num mono', render:l=>num(l.qty)},
          {label:'Unit price', cls:'num mono', render:l=>money(l.unitPrice)},
          {label:'Line total', cls:'num mono', render:l=>money(l.lineTotal)}
        ], b.lines)
        + `<div class="spread" style="border-top:2px solid var(--ink);margin-top:8px;padding-top:8px"><b>Total</b><b class="mono">${money(b.grandTotal)}</b></div>`;
      openModal({
        title: 'Monday Procurement Order', sub: 'Printable buyer\'s sheet for the foodbag purchase.',
        wide: true,
        body: html,
        foot: `<button class="btn btn-sm btn-ghost" data-act="closeModal">Close</button>
               <button class="btn btn-sm btn-primary" onclick="window.print()">Print</button>`
      });
    }
  });
}
