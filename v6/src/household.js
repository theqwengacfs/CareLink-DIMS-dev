/* ============================================================
   household.js - Households and cross-account care chains

   Two things the Administration's master workbook does that a
   patient-by-patient register cannot:

   1. It links people. Column C ("Spouses ID") ties one record to
      another in the same household, and columns P/Q/R count the
      children who would be orphaned - which is the whole point of
      the programme. A household is therefore the unit of care, not
      the individual: two adults in one home with three children is
      one rescue, recorded twice.

   2. It implies a chain of people. One row is touched by a caregiver
      who visits, a coordinator who owns the area, a case manager who
      answers the clinical and TB decisions, a hospital focal person
      who escorts on Friday, a finance officer who pays the fee, a
      procurement officer who buys the bag, an M&E officer who reports
      it and a media officer who guards consent. The workbook held
      that chain implicitly; here it is explicit, and every link is
      checked against what that account may actually do with THIS
      record - not what it may do in general.

   Both are scoped like every other read: a caregiver sees the
   households in their ministry areas, a county office sees its
   county, and nobody sees a household they are not entitled to.
   ============================================================ */

Object.assign(CAPS, {
  'household.view':   { g:'Patients', l:'See households and cross-account care chains (scoped)' },
  'household.manage': { g:'Patients', l:'Link and unlink household records', sensitive:true }
});

const HOUSEHOLD_LINK_KINDS = [
  { id:'spouse',    label:'Spouse / partner',        master:'Column C "Spouses ID" matched to column B "Patient\'s ID"' },
  { id:'parent',    label:'Parent and child',        master:'Minor assessment form: parent name and household' },
  { id:'guardian',  label:'Same guardian',           master:'Guardian arrangement on the household block' },
  { id:'address',   label:'Same household / address',master:'Village or estate plus household composition' },
  { id:'manual',    label:'Recorded by Administration', master:'A link written down deliberately, with a reason' }
];
const HOUSEHOLD_STATE = { q:'', areaId:'', open:null };

/* Guardian arrangements recorded on the assessment form. They describe a
   household shape, not a person, so they never create a link on their own. */
const GUARDIAN_ARRANGEMENTS = ['both parents','single parent','grandparent','sibling','aunt','uncle',
  'community guardian','guardian','other','-',''];

const HOUSEHOLD = {
  kinds(){ return HOUSEHOLD_LINK_KINDS; },

  /* A guardian string is a NAME when it is not one of the standard arrangements
     and it looks like a person: at least two alphabetic tokens. */
  isNamedGuardian(g){
    const t = String(g||'').trim();
    if(!t) return false;
    if(GUARDIAN_ARRANGEMENTS.includes(t.toLowerCase())) return false;
    const tokens = t.split(/\s+/).filter(x=>/^[A-Za-z'\-.]+$/.test(x));
    return tokens.length>=2;
  },

  /* Explicit links live in the database; implicit ones are computed from the
     record so a workbook import that only carries column C still links. */
  store(){ DB.db.householdLinks = DB.db.householdLinks || []; return DB.db.householdLinks; },

  /* Every patient this record is linked to, with why. */
  linksFor(patientId){
    const db = DB.db; if(!db) return [];
    const me = (db.patients||[]).find(p=>p.id===patientId);
    if(!me) return [];
    const out = [];
    const seen = new Set();
    const add = (p, kind, evidence)=>{
      if(!p || p.id===patientId || seen.has(p.id)) return;
      seen.add(p.id);
      out.push({ patient:p, kind, evidence });
    };
    const mySpouse = String((me.master||{}).spouseId || me.spouseId || '').trim();
    const myId = String(me.nationalId||'').trim();
    (db.patients||[]).forEach(p=>{
      /* column C of one record names column B of the other, either way round */
      const theirSpouse = String((p.master||{}).spouseId || p.spouseId || '').trim();
      if(mySpouse && theirSpouse && mySpouse===theirSpouse && p.id!==me.id) return; /* same spouse id, different person */
      if(mySpouse && (String(p.nationalId||'').trim()===mySpouse)) add(p,'spouse',`This record's spouse ID (${mySpouse}) is their patient ID`);
      if(theirSpouse && myId && theirSpouse===myId) add(p,'spouse',`Their spouse ID (${theirSpouse}) is this record's patient ID`);
      /* a shared National ID is a duplicate identity, not a household: it is
         routed to the patient-master index instead of being silently merged */
      if(myId && myId.length>4 && String(p.nationalId||'').trim()===myId) add(p,'guardian','Same National ID - review in the returning-beneficiary check / PMI queue');
      /* Same named guardian, same village, same ministry area is one household.
         A guardian ARRANGEMENT is not a name: "Both parents" or "Grandparent"
         is shared by hundreds of households, so treating it as a link would join
         half the register together. Only a written person's name links. */
      const g = String((me.household||{}).guardian||'').trim();
      const v = String((me.household||{}).village||me.village||'').trim().toLowerCase();
      const pg = String((p.household||{}).guardian||'').trim();
      const pv = String((p.household||{}).village||p.village||'').trim().toLowerCase();
      if(HOUSEHOLD.isNamedGuardian(g) && g.toLowerCase()===pg.toLowerCase() && v && v===pv && p.areaId===me.areaId)
        add(p,'guardian',`Same named guardian (${g}) in ${v}, ${areaName(me.areaId)}`);
    });
    this.store().filter(l=>l.a===patientId||l.b===patientId).forEach(l=>{
      const otherId = l.a===patientId? l.b : l.a;
      const p = (db.patients||[]).find(x=>x.id===otherId);
      if(p && !seen.has(p.id)){ seen.add(p.id); out.push({ patient:p, kind:l.kind||'manual', evidence:l.note||'Recorded by Administration', linkId:l.id }); }
      else if(p){ /* already found implicitly: keep the explicit reason too */
        const row = out.find(o=>o.patient.id===p.id);
        if(row && l.note) row.evidence += ' · '+l.note;
        if(row) row.linkId = l.id;
      }
    });
    return out;
  },

  /* One household = this patient plus everyone linked to them. */
  members(user, patientId){
    const p = (DB.db.patients||[]).find(x=>x.id===patientId);
    if(!p) return [];
    if(!RBAC.patientVisible(user,p)) return [];
    return [{ patient:p, kind:'self', evidence:'This record' },
      ...this.linksFor(patientId).filter(l=>RBAC.patientVisible(user,l.patient))];
  },

  /* The household's combined figures - what the workbook's row 152 block totals. */
  combined(user, patientId){
    const members = this.members(user, patientId);
    const children = members.reduce((n,m)=>n+(Number((m.patient.household||{}).children)||0),0);
    const male = members.reduce((n,m)=>n+(Number((m.patient.household||{}).maleChildren)||0),0);
    const female = members.reduce((n,m)=>n+(Number((m.patient.household||{}).femaleChildren)||0),0);
    const prevented = members.reduce((n,m)=>n+(Number((m.patient.master||{}).orphansPrevented)||0),0);
    const became = members.reduce((n,m)=>n+(Number((m.patient.master||{}).becameOrphans)||0),0);
    const days = members.reduce((n,m)=>n+(Number(m.patient.programDays)||(typeof PAT!=='undefined'? PAT.days(m.patient):0)||0),0);
    let cost = null;
    if(typeof COSTX!=='undefined' && (RBAC.has(user,'cost.view')||RBAC.has(user,'finance.view'))){
      cost = members.reduce((n,m)=>n+COSTX.patientCost(user, m.patient.id).total, 0);
    }
    return { memberCount:members.length, children, male, female, prevented, became, days,
      avgDays: members.length? Math.round(days/members.length) : 0, cost,
      villages:[...new Set(members.map(m=>String((m.patient.household||{}).village||m.patient.village||'')).filter(Boolean))],
      areas:[...new Set(members.map(m=>m.patient.areaId))].map(areaName) };
  },

  /* ---------------- the cross-account care chain ----------------
     For one patient: every account whose work touches this record, and for
     each one, exactly what it may do HERE - probed with the record's own
     county and area, not with the role's general capabilities. */
  careChain(user, patientId){
    const p = (DB.db.patients||[]).find(x=>x.id===patientId);
    if(!p || !RBAC.patientVisible(user,p)) return [];
    const db = DB.db;
    const team = (typeof TEAMX!=='undefined')? TEAMX.byArea(p.areaId) : null;
    const byUsername = un => (db.users||[]).find(u=>u.username===un && u.status==='active');
    const byRole = (roleId, countyId) => (db.users||[]).find(u=>u.roleId===roleId && u.status==='active' &&
      (u.countyId===countyId || (roleObj(u.roleId)||{scope:{}}).scope?.geo==='global'));
    const seats = [
      { seat:'Assigned caregiver', user:(db.users||[]).find(u=>u.id===p.caregiverId) },
      { seat:'Ministry area coordinator', user: team? byUsername(team.coordinator) : null },
      { seat:'Assisting caregiver', user: team && team.assistants && team.assistants[0]? byUsername(team.assistants[0].username) : null },
      { seat:'Medical Case Manager', user: byRole('mcm', p.countyId) },
      { seat:'Hospital focal person', user: byRole('liaison', p.countyId) },
      { seat:'Nurse / Clinical Officer', user: byRole('nurse', p.countyId) },
      { seat:'County Office Administrator', user: byRole('countyadmin', p.countyId) },
      { seat:'Finance Officer', user: byRole('finance', p.countyId) },
      { seat:'Procurement Officer', user: byRole('procurement', p.countyId) },
      { seat:'M&E / Data Officer', user: byRole('me', p.countyId) },
      { seat:'Media & Information Governance', user: byRole('mediahead', p.countyId) },
      { seat:'Vehicle & Transport', user: byRole('vehicle', p.countyId) }
    ];
    const ctx = { countyId:p.countyId, areaId:p.areaId, patientId:p.id };
    const PROBES = [
      ['patient.view.basic','Open the record'],
      ['patient.view.clinical','See clinical detail'],
      ['visit.create','Record a home visit'],
      ['pdca.create','Run a PDCA cycle'],
      ['patient.discharge.recommend','Recommend discharge'],
      ['patient.discharge.approve','Approve discharge'],
      ['hosp.request.create','Raise a hospital request'],
      ['hosp.request.review','Answer a hospital request'],
      ['hosp.visit.record','Record hospital service'],
      ['tb.request.create','Request pyridoxine'],
      ['tb.request.review','Answer a TB request'],
      ['tb.dispense','Dispense TB drugs'],
      ['clinical.prescribe','Prescribe'],
      ['cost.view','See the cost of this patient'],
      ['cost.ledger','Read the cost ledger'],
      ['finance.pay','Record a payment'],
      ['media.consent.manage','Hold consent'],
      ['media.upload','Upload documents'],
      ['patient.export','Export this record']
    ];
    return seats.filter(s=>s.user).map(s=>{
      const role = roleObj(s.user.roleId)||{};
      const may = PROBES.filter(([cap])=>RBAC.can(s.user, cap, ctx).ok).map(([,label])=>label);
      const refused = PROBES.filter(([cap])=>!RBAC.can(s.user, cap, ctx).ok).map(([,label])=>label);
      return { seat:s.seat, user:s.user, role:role.name||s.user.roleId, dept:(deptObj(s.user.departmentId||role.dept)||{}).name||'',
        visitDays: (typeof TEAMX!=='undefined')? TEAMX.visitDayLabel(s.user) : '', may, refused,
        unconfirmed: !!s.user.unconfirmed };
    });
  },

  /* ---------------- governed linking ---------------- */
  link(user, aId, bId, kind, note){
    if(!RBAC.has(user,'household.manage')) return { ok:false, msg:'Your role may not link household records.' };
    const a = (DB.db.patients||[]).find(p=>p.id===aId), b = (DB.db.patients||[]).find(p=>p.id===bId);
    if(!a||!b) return { ok:false, msg:'Both records must exist.' };
    if(!RBAC.patientVisible(user,a)||!RBAC.patientVisible(user,b))
      return { ok:false, msg:'One of those records is outside your scope.' };
    if(aId===bId) return { ok:false, msg:'A record cannot be linked to itself.' };
    if(!HOUSEHOLD_LINK_KINDS.some(k=>k.id===kind)) return { ok:false, msg:'Choose why these records belong to one household.' };
    if(!String(note||'').trim()) return { ok:false, msg:'A household link needs a written reason.' };
    const existing = this.store().find(l=>[l.a,l.b].sort().join(':')===[aId,bId].sort().join(':'));
    if(existing) return { ok:false, msg:'These records are already linked. Unlink them first if that is wrong.' };
    const rec = { id:uid('hl'), a:aId, b:bId, kind, note:String(note).slice(0,300),
      by:user.id, byName:user.name, at:todayISO() };
    this.store().unshift(rec);
    AUDIT.append({ actor:user.id, action:'household.linked', entity:'household', entityId:rec.id,
      detail:`${a.name} (${a.code}) <-> ${b.name} (${b.code}) · ${kind} · ${rec.note}` });
    DB.save();
    return { ok:true, rec, msg:`${a.name} and ${b.name} are now one household.` };
  },
  unlink(user, linkId, reason){
    if(!RBAC.has(user,'household.manage')) return { ok:false, msg:'Your role may not unlink household records.' };
    const l = this.store().find(x=>x.id===linkId);
    if(!l) return { ok:false, msg:'That link does not exist.' };
    if(!String(reason||'').trim()) return { ok:false, msg:'Give a reason: an unlinking is a change to the household record.' };
    DB.db.householdLinks = this.store().filter(x=>x.id!==linkId);
    AUDIT.append({ actor:user.id, action:'household.unlinked', entity:'household', entityId:linkId,
      detail:`link removed · reason: ${String(reason).slice(0,200)}` });
    DB.save();
    return { ok:true, msg:'Household link removed and audited.' };
  },

  /* Every household in scope, for the console. */
  households(user, filter={}){
    if(!RBAC.has(user,'household.view')) { AUDIT.deny(user,'household.view',{},'no household capability'); return []; }
    const rows = repo.patientList(user, filter.areaId? {areaId:filter.areaId} : {});
    const byId = new Map(rows.map(p=>[p.id,p]));
    const grouped = new Map();
    rows.forEach(p=>{
      const links = this.linksFor(p.id).filter(l=>byId.has(l.patient.id));
      if(!links.length) return;
      const key = [p.id, ...links.map(l=>l.patient.id)].sort().join('|');
      if(grouped.has(key)) return;
      grouped.set(key, { key, members:[p, ...links.map(l=>l.patient)], kinds:[...new Set(links.map(l=>l.kind))] });
    });
    let out = [...grouped.values()].map(g=>{
      const c = this.combined(user, g.members[0].id);
      /* `c.memberCount` is a number and `g.members` is the list: they are kept
         under different names so spreading one over the other cannot destroy it. */
      return { ...c, ...g, area:areaName(g.members[0].areaId), county:countyName(g.members[0].countyId) };
    });
    if(filter.q){
      const q = String(filter.q).toLowerCase();
      out = out.filter(h=>h.members.some(m=>(m.name+' '+m.code).toLowerCase().includes(q)));
    }
    return out.sort((a,b)=>b.members.length-a.members.length || b.children-a.children);
  },

  /* ---------------- panels ---------------- */
  patientPanel(user, p){
    if(!p || !RBAC.has(user,'household.view')) return '';
    const members = this.members(user, p.id);
    const chain = this.careChain(user, p.id);
    const c = this.combined(user, p.id);
    const canManage = RBAC.has(user,'household.manage');
    return card('Household & cross-account care chain', `
      ${members.length>1? `<div class="grid g4" style="margin-bottom:12px">
          ${kpi('Household members', num(members.length), 'Linked records in your scope', 'info', 'users')}
          ${kpi('Children in the household', num(c.children), `${num(c.male)} male · ${num(c.female)} female`, 'ok', 'heart')}
          ${kpi('Children rescued from orphanhood', num(c.prevented), c.became? `${num(c.became)} became orphans` : 'Counted on discharge', c.became?'crit':'ok', 'shieldcheck')}
          ${kpi('Combined programme days', num(c.days), `average ${num(c.avgDays)} days`, c.cost!==null? 'Cost '+money(Math.round(c.cost)) : '', 'warn', 'clock')}
        </div>
        ${table([
          {label:'Member',render:m=>m.kind==='self'? `<b>${esc(m.patient.name)}</b> ${badge('this record','b-accent')}` : `<button class="linkbtn" data-act="go" data-v="patient" data-id="${esc(m.patient.id)}">${esc(m.patient.name)}</button>`},
          {label:'Code',render:m=>`<span class="mono xs">${esc(m.patient.code)}</span>`},
          {label:'Status',render:m=>pBadge(m.patient.status)},
          {label:'Days',cls:'num',render:m=>num(m.patient.programDays||(typeof PAT!=='undefined'?PAT.days(m.patient):0))},
          {label:'Children',cls:'num',render:m=>num((m.patient.household||{}).children||0)},
          {label:'Why linked',render:m=>`<span class="xs muted">${esc(m.evidence)}</span>${m.linkId&&canManage?` <button class="btn btn-xs btn-ghost" data-act="hh-unlink" data-id="${esc(m.linkId)}">Unlink</button>`:''}`}
        ], members)}`
      : `<div class="note">${ic('users',15)}<span class="small">No other record is linked to this household yet. Column C of the master workbook ("Spouses ID") links one record to another; a link can also be written down here by Administration, HR or the County Office Administrator.</span></div>`}
      ${canManage? `<div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap">
        <button class="btn btn-sm btn-ghost" data-act="hh-link-open" data-p="${esc(p.id)}">${ic('link',14)} Link a household record</button>
        <button class="btn btn-sm btn-ghost" data-act="go" data-v="households">${ic('users',14)} All households</button></div>`:''}
      <div style="margin-top:16px">
        <div class="xs muted" style="letter-spacing:.1em;text-transform:uppercase;font-weight:800;margin-bottom:8px">Who works this record, and what each may do here</div>
        ${table([
          {label:'Seat',render:r=>`<div class="cellname">${esc(r.seat)}</div><div class="xs muted">${esc(r.role)}${r.visitDays&&r.visitDays!=='Not yet fixed'?` · field days ${esc(r.visitDays)}`:''}</div>`},
          {label:'Person',render:r=>`${esc(r.user.name)}${r.unconfirmed?` ${badge('seat to be confirmed','b-warn')}`:''}<div class="xs muted mono">${esc(r.user.username)}</div>`},
          {label:'Department',render:r=>`<span class="xs">${esc(r.dept)}</span>`},
          {label:'May do, on THIS record',render:r=>r.may.length? `<div class="row" style="gap:4px;flex-wrap:wrap">${r.may.slice(0,6).map(m=>`<span class="chip">${esc(m)}</span>`).join('')}${r.may.length>6?`<span class="chip">+${r.may.length-6} more</span>`:''}</div>` : '<span class="xs muted">Nothing on this record</span>'},
          {label:'Refused here',render:r=>`<span class="xs muted">${esc(r.refused.slice(0,3).join(', '))}${r.refused.length>3?`, +${r.refused.length-3}`:''}</span>`}
        ], chain, {compact:true})}
      </div>`,
      { sub:'A household is the unit of care: the children counted here are the orphans the programme exists to prevent. The chain below is probed against this record\u2019s own county and ministry area, so it shows what each account may do here, not in general.',
        foot:'<span>Every link and unlink is written to the audit trail with the reason. A shared National ID is routed to the returning-beneficiary check instead of being merged silently.</span>' });
  },

  /* ---------------- console ---------------- */
  render(user, params={}){
    if(!RBAC.has(user,'household.view')) return deniedPanel('household.view');
    Object.keys(params||{}).forEach(k=>{ if(k in HOUSEHOLD_STATE && params[k]!==undefined) HOUSEHOLD_STATE[k]=params[k]; });
    const st = HOUSEHOLD_STATE;
    const rows = this.households(user, {q:st.q, areaId:st.areaId});
    const people = rows.reduce((n,r)=>n+r.members.length,0);
    const children = rows.reduce((n,r)=>n+r.children,0);
    const prevented = rows.reduce((n,r)=>n+r.prevented,0);
    const colours = chartColours(6);
    return pageHead('Households & care chains',
      'The master workbook links people, not just records: column C ties a spouse, and the children on those linked rows are the orphans the programme prevents. Every household is shown with the accounts that work it and what each may do on that record.',
      RBAC.has(user,'household.manage')?`<button class="btn btn-sm btn-primary" data-act="hh-link-open">${ic('link',15)} Link household records</button>`:'')
    + `<div class="grid g4" style="margin-bottom:16px">
        ${kpi('Linked households', num(rows.length), `${num(people)} records in your scope`, 'info', 'users')}
        ${kpi('Children in those households', num(children), 'Male and female children counted from the linked rows', 'ok', 'heart')}
        ${kpi('Children rescued from orphanhood', num(prevented), 'Counted when a parent is discharged healthy', 'ok', 'shieldcheck')}
        ${kpi('Average household size', rows.length? (people/rows.length).toFixed(1) : '-', 'Records per linked household', 'warn', 'layers')}
      </div>`
    + `<form data-form="hh-filter" class="cost-filter">
        <div class="field"><label>Ministry area</label><select class="input" name="areaId">
          <option value="">All areas in scope</option>
          ${COUNTIES.flatMap(c=>c.areas).map(a=>`<option value="${a.id}" ${st.areaId===a.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Search</label><input class="input" name="q" value="${esc(st.q)}" placeholder="Name or patient code"></div>
        <div class="cf-act"><button class="btn btn-primary btn-sm" type="submit">${ic('filter',14)} Apply</button>
          <button class="btn btn-ghost btn-sm" type="button" data-act="hh-reset">${ic('refresh',14)} Reset</button></div>
      </form>`
    + (rows.length? card('Households', table([
        {label:'Household',render:h=>`<div class="cellname">${esc(h.members.map(m=>m.name).join(' · '))}</div>
          <div class="xs muted">${esc(h.area)} · ${esc(h.county)}${h.villages.length?` · ${esc(h.villages.join(', '))}`:''}</div>`},
        {label:'Members',cls:'num',render:h=>num(h.members.length)},
        {label:'Children',cls:'num',render:h=>`${num(h.children)}<div class="xs muted">${num(h.male)} M · ${num(h.female)} F</div>`},
        {label:'Orphans prevented',cls:'num',render:h=>num(h.prevented)},
        {label:'Combined days',cls:'num',render:h=>num(h.days)},
        {label:'Combined cost',cls:'num',render:h=>h.cost!==null? money(Math.round(h.cost)) : '<span class="xs muted">Not in your lens</span>'},
        {label:'Linked because',render:h=>`<div class="row" style="gap:4px;flex-wrap:wrap">${h.kinds.map(k=>`<span class="chip">${esc((HOUSEHOLD_LINK_KINDS.find(x=>x.id===k)||{}).label||k)}</span>`).join('')}</div>`},
        {label:'',cls:'act',render:h=>`<button class="btn btn-xs btn-ghost" data-act="go" data-v="patient" data-id="${esc(h.members[0].id)}">Open ${ic('chevron',11)}</button>`}
      ], rows))
      : card('Households', emptyState('No linked households in scope',
          'A household appears here as soon as two records are linked - by a spouse ID carried over from the master workbook, by a shared guardian in the same village, or by a link written down by Administration, HR or the County Office Administrator.',
          'users', RBAC.has(user,'household.manage')?`<button class="btn btn-sm btn-primary" data-act="hh-link-open">${ic('link',14)} Link two records</button>`:'')))
    + `<div style="margin-top:16px">${card('Households by ministry area', rows.length? chartRows({
        rows:COUNTIES.flatMap(c=>c.areas).map(a=>({ label:a.name, value:rows.filter(r=>r.members[0].areaId===a.id).length })).filter(r=>r.value>0),
        title:'Linked households per ministry area', valueHead:'Households', labelHead:'Ministry area', colours})
        : emptyState('Nothing to plot','No linked households in scope yet.','chart'))}</div>`
    + `<div style="margin-top:16px">${card('How a link is made, and what it never does', `<ol class="rule-steps">
        <li><b>It records a relationship, it does not merge records.</b> Two people in one household keep their own clinical record, their own days in programme and their own cost. Merging duplicate identities is a separate, governed act in the patient-master index.</li>
        <li><b>A shared National ID is never treated as a household.</b> It is routed to the returning-beneficiary check and the duplicate queue, because the same ID on two records usually means one person recorded twice.</li>
        <li><b>Every link carries a reason and a name.</b> Linking and unlinking are audited; a link without a written reason is refused.</li>
        <li><b>The care chain is probed per record.</b> What an account may do is checked against this patient's county and ministry area, so the chain shows real authority rather than a job title.</li>
      </ol>`)}</div>`;
  }
};

/* Grants: everyone who works a patient sees the household; linking is narrow. */
['caregiver','coordinator','chw','mcm','nurse','liaison','depthead','countyadmin','assistant','homestay','hr','me','finance','auditor','director','president','program.admin','program.assistant','chief','mediahead','pr','vehicle','procurement','intldata','it','welfare']
  .forEach(id=>{ const r=ROLES.find(x=>x.id===id); if(r && !r.perms.includes('household.view')) r.perms.push('household.view'); });
['countyadmin','assistant','mcm','chief','hr','program.admin'].forEach(id=>{
  const r=ROLES.find(x=>x.id===id); if(r && !r.perms.includes('household.manage')) r.perms.push('household.manage');
});

Object.assign(ACTIONS, {
  'hh-reset': ()=>{ HOUSEHOLD_STATE.q=''; HOUSEHOLD_STATE.areaId=''; render(); },
  'hh-link-open': d => {
    if(!RBAC.has(AUTH.user,'household.manage')) return toast('Not permitted','Your role may not link household records.','err');
    const rows = repo.patientList(AUTH.user, {});
    const first = d && d.p ? d.p : (rows[0]||{}).id||'';
    openModal({ title:'Link two records into one household', sub:'A link records a relationship. It never merges two people into one record.',
      body:`<form data-form="hh-link" id="hhLinkForm">
        <div class="field"><label>First record</label><select class="input" name="a" required>
          ${rows.slice(0,600).map(p=>`<option value="${esc(p.id)}" ${p.id===first?'selected':''}>${esc(p.name)} · ${esc(p.code)} · ${esc(areaName(p.areaId))}</option>`).join('')}</select></div>
        <div class="field"><label>Second record</label><select class="input" name="b" required>
          ${rows.slice(0,600).map(p=>`<option value="${esc(p.id)}">${esc(p.name)} · ${esc(p.code)} · ${esc(areaName(p.areaId))}</option>`).join('')}</select></div>
        <div class="field"><label>Why they are one household</label><select class="input" name="kind" required>
          ${HOUSEHOLD_LINK_KINDS.map(k=>`<option value="${k.id}">${esc(k.label)} - ${esc(k.master)}</option>`).join('')}</select></div>
        <div class="field"><label>Reason (written down, and audited)</label><textarea class="input" name="note" rows="2" required placeholder="e.g. Spouse ID on the master workbook row 47 names this record"></textarea></div>
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" data-act="hh-link-submit">${ic('link',15)} Link household</button>` });
  },
  'hh-link-submit': ()=>{
    const f = $('#hhLinkForm'); if(!f) return;
    const d = new FormData(f);
    const r = HOUSEHOLD.link(AUTH.user, String(d.get('a')||''), String(d.get('b')||''), String(d.get('kind')||''), String(d.get('note')||''));
    if(!r.ok) return toast('Not linked', r.msg, 'err');
    closeModal(true); toast('Household linked', r.msg, 'ok'); render();
  },
  'hh-unlink': d => {
    confirmDialog('Remove this household link?', 'The two records stay exactly as they are; only the relationship is removed. You will be asked for a reason, and it is written to the audit trail.', ()=>{
      const reason = 'Removed from the patient record by '+AUTH.user.name;
      const r = HOUSEHOLD.unlink(AUTH.user, d.id, reason);
      toast(r.ok?'Link removed':'Not removed', r.msg||'', r.ok?'ok':'err'); render();
    }, 'Remove link', true);
  }
});
Object.assign(FORMS, {
  'hh-filter': d => { HOUSEHOLD_STATE.areaId=String(d.get('areaId')||''); HOUSEHOLD_STATE.q=String(d.get('q')||''); render(); },
  'hh-link': () => { ACTIONS['hh-link-submit'](); }
});
