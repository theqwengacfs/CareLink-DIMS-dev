/* ============================================================
   waiting_urgent.js - Two registers the master workbook keeps
   that had no home in the system yet

   1. THE WAITING LIST (sheet "Waiting List", 263 rows)
      Name patient · Telephonenr. · Date on WL · In program ·
      Deceased · Other information.
      The "other information" column is not free chatter: it carries
      the reason a household is waiting, in the Administration's own
      words - "Patient balancing Vs Budget", "Patient balancing V
      monthly intake", "Relocated to the village". Those reasons are
      a rationing record, so they are kept as a controlled vocabulary
      with a written note, and the register reports how long each
      household has waited and why.
      The Data sheet also totals the waiting list per ministry area
      per month (Data!B5:H17 and M5:U17 with a control column), which
      is reproduced here.

   2. URGENT CASES (sheet "URGCAS", hidden)
      NAME · WHAT · COSTS · Budget · Total costs month · Total cost
      year, laid out in six-row monthly blocks where F=SUM(D..) is
      the month total and G is the running year total.
      That is an urgent-case register costed against budget, and it is
      reproduced exactly - including the running year total - and its
      costs feed the cost-per-patient engine.

   Both registers are scoped like every other read: a ministry area
   sees its own, a county office sees its county, and a telephone
   number is personal data, so it is never shown to an account that
   may not see the household it belongs to.
   ============================================================ */

Object.assign(CAPS, {
  'waiting.view':   { g:'Patients', l:'See the waiting list (scoped)' },
  'waiting.manage': { g:'Patients', l:'Add, promote and close waiting-list entries', sensitive:true },
  'urgent.view':    { g:'Hospital', l:'See the urgent-case register' },
  'urgent.manage':  { g:'Hospital', l:'Record and decide urgent cases with their cost', sensitive:true }
});

/* The workbook's own reasons, verbatim, plus the ones the register needs. */
const WAIT_REASONS = [
  { id:'budget',    label:'Patient balancing versus budget',            master:'Waiting List column F, verbatim: "Patient balancing Vs Budget"' },
  { id:'intake',    label:'Patient balancing versus monthly intake',    master:'Waiting List column F, verbatim: "Patient balancing V monthly intake"' },
  { id:'relocated', label:'Relocated to the village',                   master:'Waiting List column F, verbatim: "Relocated to the village"' },
  { id:'assessment',label:'Awaiting assessment',                        master:'The normal queue position before an assessment is opened' },
  { id:'documents', label:'Awaiting identification or CCC documents',   master:'Column B "Patient\u00b4s ID" reads "No ID" on the source rows' },
  { id:'clinical',  label:'Awaiting clinical review',                   master:'Referral or diagnosis not yet confirmed' },
  { id:'other',     label:'Other - written down',                       master:'Column F free text' }
];
const WAIT_STATE = { tab:'list', areaId:'', reason:'', q:'' };
const URG_STATE  = { tab:'register', month:'', q:'' };

const WAITLIST = {
  reasons(){ return WAIT_REASONS; },
  reason(id){ return WAIT_REASONS.find(r=>r.id===id) || { label:id||'Not recorded' }; },
  store(){ DB.db.waitingList = DB.db.waitingList || []; return DB.db.waitingList; },

  scopeOf(user){
    const role = roleObj(user.roleId)||{scope:{}}; const s = role.scope||{};
    return { global: s.geo==='global'||s.crossCounty===true, areas: s.records==='areas'||s.geo==='areas' };
  },

  rows(user, filter={}){
    if(!RBAC.has(user,'waiting.view')){ AUDIT.deny(user,'waiting.view',{},'no waiting-list capability'); return []; }
    const sc = this.scopeOf(user);
    let rows = this.store().slice();
    if(!sc.global) rows = rows.filter(r=>r.countyId===user.countyId);
    if(sc.areas) rows = rows.filter(r=>(user.areaIds||[]).includes(r.areaId));
    if(filter.areaId) rows = rows.filter(r=>r.areaId===filter.areaId);
    if(filter.reason) rows = rows.filter(r=>r.reason===filter.reason);
    if(filter.open!==false) rows = rows.filter(r=>r.status==='waiting'||r.status==='promoted');
    if(filter.q){ const q=String(filter.q).toLowerCase();
      rows = rows.filter(r=>(r.name+' '+(r.phone||'')+' '+(r.note||'')).toLowerCase().includes(q)); }
    return rows.map(r=>({ ...r, daysWaiting: WAITLIST.daysWaiting(r) }))
      .sort((a,b)=> String(a.dateOnList).localeCompare(String(b.dateOnList)));
  },

  daysWaiting(r){
    if(r.status==='promoted' && r.dateInProgramme)
      return Math.max(0, Math.round((new Date(String(r.dateInProgramme).slice(0,10)) - new Date(String(r.dateOnList).slice(0,10)))/86400000));
    if(r.status==='closed' && r.closedAt)
      return Math.max(0, Math.round((new Date(String(r.closedAt).slice(0,10)) - new Date(String(r.dateOnList).slice(0,10)))/86400000));
    return Math.max(0, Math.round((new Date(todayISO().slice(0,10)) - new Date(String(r.dateOnList).slice(0,10)))/86400000));
  },

  add(user, {name, phone='', areaId, dateOnList='', reason='', note='', household=0}){
    if(!RBAC.can(user,'waiting.manage',{areaId, countyId:(COUNTIES.find(c=>c.areas.some(a=>a.id===areaId))||{}).id}).ok)
      return { ok:false, msg:'Your role may not add to the waiting list, or that ministry area is outside your scope.' };
    if(!String(name||'').trim()) return { ok:false, msg:'A name is required.' };
    if(!areaObj(areaId)) return { ok:false, msg:'Choose a ministry area.' };
    if(!WAIT_REASONS.some(r=>r.id===reason)) return { ok:false, msg:'Choose why the household is waiting.' };
    if(reason==='other' && String(note||'').trim().length<6) return { ok:false, msg:'An "other" reason must be written out.' };
    const countyId = (COUNTIES.find(c=>c.areas.some(a=>a.id===areaId))||{}).id;
    const phoneClean = String(phone||'').replace(/[^\d+]/g,'').slice(0,16);
    const dup = this.store().find(r=>r.status==='waiting' && r.name.toLowerCase()===String(name).trim().toLowerCase());
    if(dup) return { ok:false, msg:`${dup.name} is already on the waiting list in ${areaName(dup.areaId)} since ${fmtDate(dup.dateOnList)}.` };
    const rec = { id:uid('wl'), name:String(name).trim().slice(0,80), phone:phoneClean, areaId, countyId,
      dateOnList:String(dateOnList||todayISO()).slice(0,10), reason, note:String(note||'').slice(0,300),
      household:Math.max(0,Math.round(Number(household)||0)), status:'waiting',
      addedBy:user.id, addedByName:user.name, addedAt:todayISO(), demo:false };
    this.store().unshift(rec);
    AUDIT.append({ actor:user.id, action:'waiting.added', entity:'waiting_list', entityId:rec.id,
      detail:`${rec.name} · ${areaName(areaId)} · on the list from ${rec.dateOnList} · ${this.reason(reason).label}${rec.note?' · '+rec.note:''}` });
    DB.save();
    return { ok:true, rec, msg:`${rec.name} added to the waiting list for ${areaName(areaId)}.` };
  },

  /* Promotion carries the name and the telephone into a new assessment, so
     nothing is typed twice and the waiting time stays on the record. */
  promote(user, id, {plannedDays=180}={}){
    const r = this.store().find(x=>x.id===id);
    if(!r) return { ok:false, msg:'That entry does not exist.' };
    if(!RBAC.can(user,'patient.assess.create',{countyId:r.countyId, areaId:r.areaId}).ok)
      return { ok:false, msg:'Your role may not open an assessment for this ministry area.' };
    if(r.status==='promoted') return { ok:false, msg:`Already promoted on ${fmtDate(r.dateInProgramme)} (record ${r.patientId}).` };
    if(r.status==='closed') return { ok:false, msg:'This entry was closed. Reopen it before promoting.' };
    const area = areaObj(r.areaId);
    const p = { id:uid('p'), code:'LOM-'+String(r.areaId).slice(0,3).toUpperCase()+'-'+Math.floor(1000+Math.random()*9000),
      name:r.name, sex:'F', age:0, nationalId:'', phone:r.phone||'', village:'',
      countyId:r.countyId, areaId:r.areaId, caregiverId:user.id, status:'assessment_initiated',
      intake:todayISO(), enrolledAt:todayISO().slice(0,10), discharge:null,
      plannedDays:Number(plannedDays)||180, ccc:'',
      clinical:{ diagnosis:'Pending clinical verification', art:false, weightKg:null, heightCm:null, adherence:'Not recorded' },
      household:{ children:r.household||0, maleChildren:0, femaleChildren:0, orphansSupported:0, guardian:'-' },
      master:{ newInMonth:(()=>{const n=new Date(); return n.toLocaleDateString('en-GB',{month:'long'})+"'"+String(n.getFullYear()).slice(2);})(),
        waitingListId:r.id, daysOnWaitingList:this.daysWaiting(r), waitingReason:this.reason(r.reason).label,
        sourceWorkbook:'Promoted from the waiting-list register' },
      consent:{ status:'not_requested', scope:'internal', date:todayISO() },
      faithRecord:'not_recorded', docsVerified:false, flags:['duplicate_check_pending'], pdcaStage:'Plan', createdBy:user.id };
    DB.db.patients.push(p);
    r.status='promoted'; r.dateInProgramme=todayISO().slice(0,10); r.patientId=p.id; r.promotedBy=user.id; r.promotedAt=todayISO();
    AUDIT.append({ actor:user.id, action:'waiting.promoted', entity:'waiting_list', entityId:r.id,
      detail:`${r.name} promoted to assessment ${p.code} after ${this.daysWaiting(r)} day(s) on the waiting list (${this.reason(r.reason).label})` });
    DB.save();
    return { ok:true, patient:p, rec:r, msg:`${r.name} is now an assessment (${p.code}). Waited ${this.daysWaiting(r)} day(s).` };
  },

  close(user, id, {status='closed', note=''}){
    const r = this.store().find(x=>x.id===id);
    if(!r) return { ok:false, msg:'That entry does not exist.' };
    if(!RBAC.can(user,'waiting.manage',{countyId:r.countyId, areaId:r.areaId}).ok)
      return { ok:false, msg:'Your role may not close a waiting-list entry here.' };
    if(!['closed','deceased','withdrawn'].includes(status)) return { ok:false, msg:'Choose why the entry is closing.' };
    if(!String(note||'').trim()) return { ok:false, msg:'A closing reason is required: the waiting list is a rationing record.' };
    r.status = status; r.closedAt = todayISO(); r.closeNote = String(note).slice(0,300); r.closedBy = user.id;
    AUDIT.append({ actor:user.id, action:'waiting.closed', entity:'waiting_list', entityId:r.id,
      detail:`${r.name} · ${status} after ${this.daysWaiting(r)} day(s) · ${r.closeNote}` });
    DB.save();
    return { ok:true, rec:r, msg:`${r.name} closed as ${status} and audited.` };
  },

  /* The Data sheet's own block: waiting list per ministry area per month. */
  byAreaMonth(user){
    const rows = this.rows(user, {open:false});
    const months = PYEAR.order().map(m=>{
      const y = new Date().getFullYear();
      return `${y}-${String(m).padStart(2,'0')}`;
    });
    const areas = COUNTIES.flatMap(c=>c.areas);
    return { months, areas,
      cells: areas.map(a=>({ area:a.name, areaId:a.id,
        values:Object.fromEntries(months.map(m=>[m, rows.filter(r=>r.areaId===a.id && String(r.dateOnList).slice(0,7)===m).length])),
        total: rows.filter(r=>r.areaId===a.id).length })) };
  },

  summary(user){
    const rows = this.rows(user, {open:false});
    const open = rows.filter(r=>r.status==='waiting');
    const byReason = WAIT_REASONS.map(x=>({ ...x, n:open.filter(r=>r.reason===x.id).length })).filter(x=>x.n>0);
    const waits = open.map(r=>r.daysWaiting).sort((a,b)=>a-b);
    return { total:rows.length, open:open.length, promoted:rows.filter(r=>r.status==='promoted').length,
      closed:rows.filter(r=>r.status==='closed').length, deceased:rows.filter(r=>r.status==='deceased').length,
      byReason, medianWait: waits.length? waits[Math.floor(waits.length/2)] : 0,
      longestWait: waits.length? waits[waits.length-1] : 0,
      over30: open.filter(r=>r.daysWaiting>30).length, over90: open.filter(r=>r.daysWaiting>90).length };
  },

  render(user, params={}){
    if(!RBAC.has(user,'waiting.view')) return deniedPanel('waiting.view');
    Object.keys(params||{}).forEach(k=>{ if(k in WAIT_STATE && params[k]!==undefined) WAIT_STATE[k]=params[k]; });
    const st = WAIT_STATE;
    const rows = this.rows(user, {areaId:st.areaId, reason:st.reason, q:st.q, open:false});
    const s = this.summary(user);
    const bam = this.byAreaMonth(user);
    const colours = chartColours(8);
    const canManage = RBAC.has(user,'waiting.manage');
    const tabs = [['list','Waiting list'],['reasons','Why they wait'],['months','Per area per month'],['rules','Rules']];
    return pageHead('Waiting list',
      'The master workbook keeps a waiting list with a telephone number, the date a household joined it, and the reason it is waiting - a rationing record. It is reproduced here, scoped, audited, and one action away from an assessment.',
      `${canManage?`<button class="btn btn-sm btn-primary" data-act="wl-add-open">${ic('plus',15)} Add to the waiting list</button>`:''}`)
    + `<div class="tabs cost-tabs">${tabs.map(([id,label])=>`<button class="tab ${st.tab===id?'active':''}" data-act="wl-tab" data-tab="${id}">${esc(label)}</button>`).join('')}</div>`
    + (()=>{
      if(st.tab==='list'){
        return `<div class="grid g4" style="margin:16px 0">
            ${kpi('Waiting now', num(s.open), `${num(s.total)} entries in scope`, s.open?'warn':'ok', 'clock')}
            ${kpi('Median wait', num(s.medianWait)+' days', `Longest ${num(s.longestWait)} days`, s.medianWait>30?'crit':'info', 'calendar')}
            ${kpi('Beyond 30 days', num(s.over30), `${num(s.over90)} beyond 90 days`, s.over30?'crit':'ok', 'alert')}
            ${kpi('Promoted to assessment', num(s.promoted), `${num(s.closed)} closed · ${num(s.deceased)} deceased`, 'ok', 'userplus')}
          </div>`
        + `<form data-form="wl-filter" class="cost-filter">
            <div class="field"><label>Ministry area</label><select class="input" name="areaId"><option value="">All in scope</option>
              ${COUNTIES.flatMap(c=>c.areas).map(a=>`<option value="${a.id}" ${st.areaId===a.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select></div>
            <div class="field"><label>Reason</label><select class="input" name="reason"><option value="">All reasons</option>
              ${WAIT_REASONS.map(r=>`<option value="${r.id}" ${st.reason===r.id?'selected':''}>${esc(r.label)}</option>`).join('')}</select></div>
            <div class="field"><label>Search</label><input class="input" name="q" value="${esc(st.q)}" placeholder="Name or note"></div>
            <div class="cf-act"><button class="btn btn-primary btn-sm" type="submit">${ic('filter',14)} Apply</button></div>
          </form>`
        + card('Waiting list', table([
            {label:'Household',render:r=>`<div class="cellname">${esc(r.name)}</div><div class="xs muted">${esc(areaName(r.areaId))} · ${esc(countyName(r.countyId))}</div>`},
            {label:'Telephone',render:r=>RBAC.has(user,'patient.view.basic')&&RBAC.patientVisible(user,{id:r.patientId||'',countyId:r.countyId,areaId:r.areaId})||!r.patientId? `<span class="mono xs">${esc(r.phone||'Not recorded')}</span>` : '<span class="xs muted">Withheld</span>'},
            {label:'On the list since',render:r=>`${esc(fmtDate(r.dateOnList))}<div class="xs muted">${num(r.daysWaiting)} day(s)</div>`},
            {label:'Why waiting',render:r=>`${badge(this.reason(r.reason).label, r.reason==='budget'||r.reason==='intake'?'b-warn':'b-neutral')}<div class="xs muted">${esc(r.note||'')}</div>`},
            {label:'Household',cls:'num',render:r=>r.household? num(r.household)+' people' : '-'},
            {label:'Status',render:r=>badge(r.status==='waiting'?'Waiting':r.status==='promoted'?'Promoted':titleCase(r.status), r.status==='waiting'?'b-warn':r.status==='promoted'?'b-ok':'b-neutral')},
            {label:'',cls:'act',render:r=>r.status==='waiting'
              ? `${RBAC.can(user,'patient.assess.create',{countyId:r.countyId,areaId:r.areaId}).ok?`<button class="btn btn-xs btn-primary" data-act="wl-promote" data-id="${esc(r.id)}">${ic('userplus',13)} Promote</button>`:''}
                 ${canManage?`<button class="btn btn-xs btn-ghost" data-act="wl-close-open" data-id="${esc(r.id)}">Close</button>`:''}`
              : `<span class="xs muted">${r.patientId?`<button class="linkbtn" data-act="go" data-v="patient" data-id="${esc(r.patientId)}">Open record</button>`:esc(r.closeNote||'')}</span>`}
          ], rows, {emptyMsg:'Nobody is on the waiting list in scope.'}),
          {foot:'<span>A telephone number is personal data: it is shown only to an account that may see that household, and it never reaches the public portal.</span>'});
      }
      if(st.tab==='reasons'){
        return `<div class="grid g2" style="margin:16px 0">
          ${card('Why households wait', s.byReason.length? chartDonut(s.byReason.map((r,i)=>({label:r.label, value:r.n, color:colours[i%colours.length]})),
            {title:'Waiting list by reason', centerValue:num(s.open), centerLabel:'WAITING'}) : emptyState('Nothing waiting','No open entries in scope.','check'))}
          ${card('How long they have waited', chartBars({rows:[
              {label:'0-7 days', value:s.open? 0:0},
            ].concat([]).length? [] : (()=>{
              const open = rows.filter(r=>r.status==='waiting');
              const bands=[[0,7,'0-7 days'],[8,14,'8-14 days'],[15,30,'15-30 days'],[31,60,'31-60 days'],[61,90,'61-90 days'],[91,99999,'Beyond 90 days']];
              return bands.map(([a,b,label])=>({label, value:open.filter(r=>r.daysWaiting>=a&&r.daysWaiting<=b).length}));
            })(), title:'Waiting time bands', valueHead:'Households', labelHead:'Band'}))}
        </div>`
        + card('The reasons, in the workbook\u2019s own words', table([
            {label:'Reason',render:r=>`<div class="cellname">${esc(r.label)}</div>`},
            {label:'Where it comes from',render:r=>`<span class="xs muted">${esc(r.master)}</span>`},
            {label:'Waiting now',cls:'num',render:r=>num(rows.filter(x=>x.status==='waiting'&&x.reason===r.id).length)},
            {label:'Ever recorded',cls:'num',render:r=>num(rows.filter(x=>x.reason===r.id).length)}
          ], WAIT_REASONS),
          {foot:'<span>"Balancing versus budget" and "balancing versus monthly intake" are rationing decisions. They are recorded, dated and attributable, never left in a spreadsheet cell.</span>'});
      }
      if(st.tab==='months'){
        return card('Waiting list per ministry area per month', chartHeat({
          rows:bam.cells, cols:bam.months, rowHead:'Ministry area',
          caption:'The Data sheet totals the waiting list per ministry area per month with a control column. This is the same block, live.',
          fmt:v=>num(v)}))
        + `<div style="margin-top:16px">${card('Control totals', table([
            {label:'Month',render:m=>`<span class="mono">${esc(m)}</span>`},
            {label:'Added to the list',cls:'num',render:m=>num(rows.filter(r=>String(r.dateOnList).slice(0,7)===m).length)},
            {label:'Promoted out',cls:'num',render:m=>num(rows.filter(r=>r.status==='promoted'&&String(r.dateInProgramme||'').slice(0,7)===m).length)},
            {label:'Closed',cls:'num',render:m=>num(rows.filter(r=>String(r.closedAt||'').slice(0,7)===m).length)},
            {label:'Still waiting at month end',cls:'num',render:m=>num(rows.filter(r=>String(r.dateOnList).slice(0,7)<=m && (r.status==='waiting' || String(r.dateInProgramme||r.closedAt||'9999').slice(0,7)>m)).length)}
          ], bam.months), {foot:'<span>The workbook carries a "Control" column beside each month block so the totals can be checked. This is that check.</span>'})}</div>`;
      }
      return card('Rules in force', `<ol class="rule-steps">
          <li><b>A household is added with a reason.</b> The reason vocabulary is the workbook\u2019s own; "other" must be written out.</li>
          <li><b>A duplicate on the list is refused.</b> The same name already waiting is stopped before it becomes two queues.</li>
          <li><b>Promotion carries the record.</b> Name, telephone, ministry area, household size and the number of days waited travel into the new assessment, so nothing is retyped and the wait stays on the record.</li>
          <li><b>Closing needs a written reason.</b> Deceased, withdrawn or closed: the waiting list is a rationing record, so a silent deletion is refused.</li>
          <li><b>Scope and confidentiality.</b> A ministry area sees its own entries; a county office sees its county; a telephone number is shown only to an account that may see that household.</li>
          <li><b>Everything is audited.</b> Add, promote and close each write an audit entry naming the person, the household and the reason.</li>
        </ol>`);
    })();
  }
};

/* ================= urgent cases (URGCAS) ================= */
const URGENT = {
  store(){ DB.db.urgentCases = DB.db.urgentCases || []; return DB.db.urgentCases; },

  rows(user, filter={}){
    if(!RBAC.has(user,'urgent.view')){ AUDIT.deny(user,'urgent.view',{},'no urgent-case capability'); return []; }
    const role = roleObj(user.roleId)||{scope:{}}; const s = role.scope||{};
    let rows = this.store().slice();
    if(s.geo!=='global' && !s.crossCounty) rows = rows.filter(r=>r.countyId===user.countyId);
    if(s.records==='areas') rows = rows.filter(r=>(user.areaIds||[]).includes(r.areaId));
    if(filter.month) rows = rows.filter(r=>r.month===filter.month);
    if(filter.q){ const q=String(filter.q).toLowerCase(); rows = rows.filter(r=>(r.name+' '+r.what+' '+(r.note||'')).toLowerCase().includes(q)); }
    return rows.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  },

  /* The sheet's own arithmetic: F = SUM of the month's costs, G = running year total. */
  totals(user, year){
    const rows = this.rows(user).filter(r=>String(r.month||'').startsWith(String(year||(PYEAR.yearOf(new Date())||new Date().getFullYear()))));
    const months = PYEAR.order().map(m=>`${year||(PYEAR.yearOf(new Date())||new Date().getFullYear())}-${String(m).padStart(2,'0')}`);
    let running = 0;
    return months.map(m=>{
      const monthRows = rows.filter(r=>r.month===m);
      const monthTotal = monthRows.reduce((n,r)=>n+(Number(r.costs)||0),0);
      running += monthTotal;
      return { month:m, cases:monthRows.length, monthTotal, yearTotal:running };
    });
  },

  add(user, {patientId='', name='', what='', costs=0, budgetLine='other', date='', note=''}){
    const p = patientId? (DB.db.patients||[]).find(x=>x.id===patientId) : null;
    const areaId = p? p.areaId : (user.areaIds||[])[0] || '';
    const countyId = p? p.countyId : user.countyId;
    if(!RBAC.can(user,'urgent.manage',{countyId, areaId}).ok)
      return { ok:false, msg:'Your role may not record an urgent case here.' };
    if(p && !RBAC.patientVisible(user,p)) return { ok:false, msg:'That patient is outside your scope.' };
    const label = String(name||'').trim() || (p? p.name : '');
    if(!label) return { ok:false, msg:'A name is required: the sheet\u2019s first column is NAME.' };
    if(!String(what||'').trim()) return { ok:false, msg:'Record what the case is (column WHAT).' };
    const amount = Math.round(Number(costs));
    if(!(amount>=0)) return { ok:false, msg:'Record the cost (column COSTS). Zero is allowed if it is genuinely free.' };
    const d = String(date||todayISO()).slice(0,10);
    const rec = { id:uid('uc'), patientId:p? p.id : '', name:label.slice(0,80), what:String(what).slice(0,200),
      costs:amount, budgetLine, countyId, areaId, date:d, month:d.slice(0,7),
      note:String(note||'').slice(0,300), status:'recorded', addedBy:user.id, addedByName:user.name, addedAt:todayISO() };
    this.store().unshift(rec);
    AUDIT.append({ actor:user.id, action:'urgent.recorded', entity:'urgent_case', entityId:rec.id,
      detail:`${rec.name} · ${rec.what} · ${money(amount)} · ${rec.month} · budget line ${budgetLine}` });
    DB.save();
    if(typeof COSTX!=='undefined') COSTX.invalidate();
    return { ok:true, rec, msg:`Urgent case recorded: ${money(amount)} in ${rec.month}.` };
  },

  decide(user, id, decision, note){
    const r = this.store().find(x=>x.id===id);
    if(!r) return { ok:false, msg:'That case does not exist.' };
    if(!RBAC.can(user,'urgent.manage',{countyId:r.countyId, areaId:r.areaId}).ok)
      return { ok:false, msg:'Your role may not decide this case.' };
    if(!['approved','declined','deferred'].includes(decision)) return { ok:false, msg:'Choose approved, declined or deferred.' };
    if(!String(note||'').trim()) return { ok:false, msg:'A decision on an urgent case must carry a written reason.' };
    r.status = decision; r.decidedBy = user.id; r.decidedByName = user.name; r.decidedAt = todayISO();
    r.decisionNote = String(note).slice(0,300);
    AUDIT.append({ actor:user.id, action:'urgent.decided', entity:'urgent_case', entityId:r.id,
      detail:`${r.name} · ${decision} · ${money(r.costs)} · ${r.decisionNote}` });
    DB.save();
    return { ok:true, rec:r, msg:`${r.name}: ${decision}.` };
  },

  render(user, params={}){
    if(!RBAC.has(user,'urgent.view')) return deniedPanel('urgent.view');
    Object.keys(params||{}).forEach(k=>{ if(k in URG_STATE && params[k]!==undefined) URG_STATE[k]=params[k]; });
    const st = URG_STATE;
    const year = PYEAR.yearOf(new Date()) || new Date().getFullYear();
    const rows = this.rows(user, {month:st.month, q:st.q});
    const tot = this.totals(user, year);
    const yearCost = tot.length? tot[tot.length-1].yearTotal : 0;
    const budgets = repo.budget(user, user.countyId);
    const budgetTotal = budgets.reduce((n,b)=>n+(Number(b.amount)||0),0);
    const colours = chartColours(8);
    const canManage = RBAC.has(user,'urgent.manage');
    const tabs = [['register','Urgent-case register'],['months','Month and year totals'],['rules','The sheet\u2019s arithmetic']];
    return pageHead('Urgent cases against budget',
      'The master workbook keeps a hidden URGCAS sheet: NAME, WHAT, COSTS, Budget, the month total and the running year total. It is reproduced here, scoped and audited, and its costs feed the cost-per-patient engine.',
      `${canManage?`<button class="btn btn-sm btn-primary" data-act="uc-add-open">${ic('plus',15)} Record an urgent case</button>`:''}`)
    + `<div class="tabs cost-tabs">${tabs.map(([id,label])=>`<button class="tab ${st.tab===id?'active':''}" data-act="uc-tab" data-tab="${id}">${esc(label)}</button>`).join('')}</div>`
    + (()=>{
      if(st.tab==='register'){
        return `<div class="grid g4" style="margin:16px 0">
            ${kpi('Urgent cases', num(rows.length), `Programme year ${esc(PYEAR.yearLabel(new Date()))}`, 'info', 'alert')}
            ${kpi('Cost this year', money(yearCost), 'Column G: the running year total', 'warn', 'wallet')}
            ${kpi('Awaiting a decision', num(rows.filter(r=>r.status==='recorded').length), 'A decision needs a written reason', rows.some(r=>r.status==='recorded')?'crit':'ok', 'clock')}
            ${kpi('Budget in reach', budgetTotal? money(budgetTotal) : 'Not set', yearCost&&budgetTotal? (100*yearCost/budgetTotal).toFixed(1)+'% of budget' : '', 'ok', 'layers')}
          </div>`
        + card('Urgent-case register', table([
            {label:'Name',render:r=>r.patientId? `<button class="linkbtn cellname" data-act="go" data-v="patient" data-id="${esc(r.patientId)}">${esc(r.name)}</button>` : `<div class="cellname">${esc(r.name)}</div>`},
            {label:'What',render:r=>`${esc(r.what)}<div class="xs muted">${esc(r.note||'')}</div>`},
            {label:'Area',render:r=>`${esc(r.areaId?areaName(r.areaId):'-')}<div class="xs muted">${esc(countyName(r.countyId))}</div>`},
            {label:'Date',render:r=>`<span class="mono xs">${esc(fmtDate(r.date))}</span>`},
            {label:'Costs',cls:'num',render:r=>`<b class="mono">${money(r.costs)}</b>`},
            {label:'Budget line',render:r=>`<span class="xs">${esc((BUDGET_CATEGORIES.find(b=>b.id===r.budgetLine)||{}).name||r.budgetLine)}</span>`},
            {label:'Status',render:r=>badge(titleCase(r.status), r.status==='approved'?'b-ok':r.status==='declined'?'b-crit':r.status==='deferred'?'b-neutral':'b-warn')},
            {label:'Decision',render:r=>r.decidedByName? `${esc(r.decisionNote||'')}<div class="xs muted">${esc(r.decidedByName)} · ${esc(fmtDate(r.decidedAt))}</div>` : '<span class="xs muted">Awaiting a decision</span>'},
            {label:'',cls:'act',render:r=>canManage&&r.status==='recorded'?`<button class="btn btn-xs btn-primary" data-act="uc-decide-open" data-id="${esc(r.id)}">Decide</button>`:''}
          ], rows, {emptyMsg:'No urgent cases recorded in scope.'}),
          {foot:'<span>Costs recorded here become cost lines in the cost-per-patient engine, attributed to the patient where the case names one.</span>'});
      }
      if(st.tab==='months'){
        return card('Month total and running year total', `<div class="tbl-wrap"><table class="tbl align-sym">
            <thead><tr><th>Month</th><th class="num">Cases</th><th class="num">Total costs month (column F)</th><th class="num">Total cost year (column G)</th><th class="num">Share of year</th></tr></thead>
            <tbody>${tot.map(m=>`<tr><td><span class="mono">${esc(m.month)}</span></td><td class="num">${num(m.cases)}</td>
              <td class="num mono">${money(m.monthTotal)}</td><td class="num mono"><b>${money(m.yearTotal)}</b></td>
              <td class="num">${yearCost? (100*m.monthTotal/yearCost).toFixed(1)+'%' : '-'}</td></tr>`).join('')}
              <tr class="tot"><td>Year</td><td class="num">${num(tot.reduce((n,m)=>n+m.cases,0))}</td><td class="num mono">${money(yearCost)}</td><td class="num mono">${money(yearCost)}</td><td class="num">100.0%</td></tr>
            </tbody></table></div>`,
          { sub:`The sheet lays this out in six-row monthly blocks: F = SUM of that month's costs, G = the previous G plus this month's F.`,
            foot:'<span>Months follow the programme year, which is currently '+esc(PYEAR.label())+'.</span>' })
        + `<div class="grid g2" style="margin-top:16px">
            ${card('Urgent-case cost per month', chartLine({labels:tot.map(m=>m.month.slice(5)),
              series:[{label:'Month total', values:tot.map(m=>m.monthTotal), color:colours[0]},
                      {label:'Running year total', values:tot.map(m=>m.yearTotal), color:colours[1]}],
              fmt:v=>money(v), title:'Urgent cases: month and year totals', unit:'KES'}))}
            ${card('Urgent cases against budget', chartGauge(yearCost, budgetTotal||Math.max(1,yearCost), {label:'Urgent cases / budget', fmt:v=>money(v)}))}
          </div>`;
      }
      return card('The sheet\u2019s arithmetic, reproduced', `<div class="tbl-wrap"><table class="tbl align-sym">
          <thead><tr><th>Column</th><th>Sheet heading</th><th>In this system</th><th>Rule</th></tr></thead>
          <tbody>
            <tr><td class="mono">B</td><td>NAME</td><td>The patient where the case names one, otherwise a written name</td><td>Required. A case without a name cannot be costed or audited.</td></tr>
            <tr><td class="mono">C</td><td>WHAT</td><td>What the urgent case is</td><td>Required, free text, kept verbatim.</td></tr>
            <tr><td class="mono">D</td><td>COSTS</td><td>The cost of the case</td><td>Required; zero is allowed and is still recorded.</td></tr>
            <tr><td class="mono">E</td><td>Budget</td><td>The budget line it draws on</td><td>One of the programme's own budget categories.</td></tr>
            <tr><td class="mono">F</td><td>Total costs month</td><td>=SUM of the month block</td><td>Computed, never typed.</td></tr>
            <tr><td class="mono">G</td><td>Total cost year</td><td>previous G + this month's F</td><td>Computed, and ordered by the programme year.</td></tr>
          </tbody></table></div>
        <div style="margin-top:12px">${note('The source sheet is hidden and holds six rows per month. Nothing else in it is a rule; everything above is.','info')}</div>`);
    })();
  }
};

/* ---------------- grants ---------------- */
['caregiver','coordinator','chw','mcm','nurse','liaison','depthead','countyadmin','assistant','homestay','hr','me','finance','auditor','director','president','program.admin','program.assistant','chief']
  .forEach(id=>{ const r=ROLES.find(x=>x.id===id); if(r && !r.perms.includes('waiting.view')) r.perms.push('waiting.view'); });
/* A caregiver finds the household and writes it down; the county office and the
   case manager decide. Both hold the capability, and scope decides the area. */
['countyadmin','assistant','mcm','coordinator','caregiver','chief','hr','program.admin'].forEach(id=>{
  const r=ROLES.find(x=>x.id===id); if(r && !r.perms.includes('waiting.manage')) r.perms.push('waiting.manage'); });
['mcm','nurse','liaison','depthead','countyadmin','finance','procurement','auditor','director','president','program.admin','chief','assistant','caregiver','coordinator','homestay','me']
  .forEach(id=>{ const r=ROLES.find(x=>x.id===id); if(r && !r.perms.includes('urgent.view')) r.perms.push('urgent.view'); });
['mcm','countyadmin','finance','liaison','depthead','program.admin','chief'].forEach(id=>{
  const r=ROLES.find(x=>x.id===id); if(r && !r.perms.includes('urgent.manage')) r.perms.push('urgent.manage'); });

/* ---------------- actions & forms ---------------- */
Object.assign(ACTIONS, {
  'wl-tab': d => { WAIT_STATE.tab=d.tab||'list'; render(); },
  'wl-add-open': () => {
    const areas = COUNTIES.flatMap(c=>c.areas).filter(a=>{
      const countyId = (COUNTIES.find(cc=>cc.areas.some(x=>x.id===a.id))||{}).id;
      return RBAC.can(AUTH.user,'waiting.manage',{countyId, areaId:a.id}).ok;
    });
    if(!areas.length) return toast('Not permitted','Your role may not add to the waiting list in any ministry area.','err');
    openModal({ title:'Add a household to the waiting list', sub:'A reason is required: the waiting list is a rationing record.',
      body:`<form data-form="wl-add" id="wlAddForm">
        <div class="grid g2">
          <div class="field"><label>Name</label><input class="input" name="name" required placeholder="As written on the referral"></div>
          <div class="field"><label>Telephone</label><input class="input mono" name="phone" placeholder="Personal data - scoped and audited"></div>
          <div class="field"><label>Ministry area</label><select class="input" name="areaId" required>
            ${areas.map(a=>`<option value="${a.id}">${esc(a.name)} · ${esc(countyName((COUNTIES.find(c=>c.areas.some(x=>x.id===a.id))||{}).id))}</option>`).join('')}</select></div>
          <div class="field"><label>Date on the list</label><input class="input" type="date" name="dateOnList" value="${esc(todayISO().slice(0,10))}"></div>
          <div class="field"><label>People in the household</label><input class="input" type="number" name="household" min="0" value="1"></div>
          <div class="field"><label>Why they are waiting</label><select class="input" name="reason" required>
            ${WAIT_REASONS.map(r=>`<option value="${r.id}">${esc(r.label)}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label>Note</label><textarea class="input" name="note" rows="2" placeholder="Required for an 'other' reason; useful for all of them"></textarea></div>
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-act="wl-add-submit">${ic('plus',15)} Add to the list</button>` });
  },
  'wl-add-submit': () => {
    const f=$('#wlAddForm'); if(!f) return; const d=new FormData(f);
    const r = WAITLIST.add(AUTH.user, { name:d.get('name'), phone:d.get('phone'), areaId:d.get('areaId'),
      dateOnList:d.get('dateOnList'), reason:d.get('reason'), note:d.get('note'), household:d.get('household') });
    if(!r.ok) return toast('Not added', r.msg, 'err');
    closeModal(true); toast('Added to the waiting list', r.msg, 'ok'); render();
  },
  'wl-promote': d => {
    confirmDialog('Promote this household to an assessment?',
      'The name, telephone number, ministry area and the number of days waited are carried into a new assessment record. Nothing is typed twice.',
      ()=>{ const r = WAITLIST.promote(AUTH.user, d.id);
        if(!r.ok) return toast('Not promoted', r.msg, 'err');
        toast('Assessment created', r.msg, 'ok'); go('patient',{id:r.patient.id}); },
      'Promote to assessment');
  },
  'wl-close-open': d => {
    openModal({ title:'Close a waiting-list entry', sub:'A closing reason is required and is written to the audit trail.', narrow:true,
      body:`<form data-form="wl-close" id="wlCloseForm">
        <input type="hidden" name="id" value="${esc(d.id)}">
        <div class="field"><label>Closed as</label><select class="input" name="status">
          <option value="closed">Closed - no longer needs the programme</option>
          <option value="withdrawn">Withdrawn by the household</option>
          <option value="deceased">Deceased</option></select></div>
        <div class="field"><label>Reason</label><textarea class="input" name="note" rows="2" required></textarea></div>
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button><button class="btn btn-danger" data-act="wl-close-submit">Close entry</button>` });
  },
  'wl-close-submit': () => {
    const f=$('#wlCloseForm'); if(!f) return; const d=new FormData(f);
    const r = WAITLIST.close(AUTH.user, String(d.get('id')||''), { status:String(d.get('status')||'closed'), note:String(d.get('note')||'') });
    if(!r.ok) return toast('Not closed', r.msg, 'err');
    closeModal(true); toast('Entry closed', r.msg, 'ok'); render();
  },
  'uc-tab': d => { URG_STATE.tab=d.tab||'register'; render(); },
  'uc-add-open': () => {
    const rows = RBAC.has(AUTH.user,'patient.list')? repo.patientList(AUTH.user).slice(0,600) : [];
    openModal({ title:'Record an urgent case', sub:'NAME, WHAT, COSTS and the budget line - the URGCAS sheet\u2019s own columns.',
      body:`<form data-form="uc-add" id="ucAddForm">
        <div class="field"><label>Patient (optional)</label><select class="input" name="patientId">
          <option value="">Not a registered patient</option>
          ${rows.map(p=>`<option value="${esc(p.id)}">${esc(p.name)} · ${esc(p.code)} · ${esc(areaName(p.areaId))}</option>`).join('')}</select></div>
        <div class="grid g2">
          <div class="field"><label>Name</label><input class="input" name="name" placeholder="Taken from the patient when one is chosen"></div>
          <div class="field"><label>Date</label><input class="input" type="date" name="date" value="${esc(todayISO().slice(0,10))}"></div>
        </div>
        <div class="field"><label>What is the case</label><input class="input" name="what" required placeholder="e.g. Emergency admission, blood transfusion, funeral support"></div>
        <div class="grid g2">
          <div class="field"><label>Costs (KES)</label><input class="input" type="number" name="costs" min="0" step="50" required></div>
          <div class="field"><label>Budget line</label><select class="input" name="budgetLine">
            ${BUDGET_CATEGORIES.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label>Note</label><textarea class="input" name="note" rows="2"></textarea></div>
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-act="uc-add-submit">${ic('plus',15)} Record the case</button>` });
  },
  'uc-add-submit': () => {
    const f=$('#ucAddForm'); if(!f) return; const d=new FormData(f);
    const r = URGENT.add(AUTH.user, { patientId:String(d.get('patientId')||''), name:String(d.get('name')||''),
      what:String(d.get('what')||''), costs:d.get('costs'), budgetLine:String(d.get('budgetLine')||'other'),
      date:String(d.get('date')||''), note:String(d.get('note')||'') });
    if(!r.ok) return toast('Not recorded', r.msg, 'err');
    closeModal(true); toast('Urgent case recorded', r.msg, 'ok'); render();
  },
  'uc-decide-open': d => {
    openModal({ title:'Decide an urgent case', sub:'A decision without a written reason is refused.', narrow:true,
      body:`<form data-form="uc-decide" id="ucDecideForm">
        <input type="hidden" name="id" value="${esc(d.id)}">
        <div class="field"><label>Decision</label><select class="input" name="decision">
          <option value="approved">Approve and fund</option><option value="deferred">Defer to the next budget cycle</option>
          <option value="declined">Decline</option></select></div>
        <div class="field"><label>Reason</label><textarea class="input" name="note" rows="3" required></textarea></div>
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-act="uc-decide-submit">Record the decision</button>` });
  },
  'uc-decide-submit': () => {
    const f=$('#ucDecideForm'); if(!f) return; const d=new FormData(f);
    const r = URGENT.decide(AUTH.user, String(d.get('id')||''), String(d.get('decision')||'approved'), String(d.get('note')||''));
    if(!r.ok) return toast('Not decided', r.msg, 'err');
    closeModal(true); toast('Decision recorded', r.msg, 'ok'); render();
  }
});
Object.assign(FORMS, {
  'wl-filter': d => { WAIT_STATE.areaId=String(d.get('areaId')||''); WAIT_STATE.reason=String(d.get('reason')||''); WAIT_STATE.q=String(d.get('q')||''); render(); },
  'wl-add': ()=>ACTIONS['wl-add-submit'](),
  'wl-close': ()=>ACTIONS['wl-close-submit'](),
  'uc-add': ()=>ACTIONS['uc-add-submit'](),
  'uc-decide': ()=>ACTIONS['uc-decide-submit']()
});
