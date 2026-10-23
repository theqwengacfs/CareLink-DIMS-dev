/* ============================================================
   workplace.js - the working life of the Foundation

   Department libraries and archives, the executive team's console,
   the office equipment register, students and interns, occupational
   health and safety, and presence. Each section is a module of its
   own with one owner, one capability and one audit trail; they live
   in one file only because they are read together.
   ============================================================ */

/* =====================================================================
   1. DEPARTMENT LIBRARY AND ARCHIVE
   ---------------------------------------------------------------------
   Every department can hold material: policies, templates, research,
   registers, media. Another department may ask to borrow it, for a
   stated purpose and a stated period. The owning department decides.
   An expired loan closes itself; nothing stays borrowed silently.
   ===================================================================== */
const LIBRARY = {
  MAX_ACTIVE:3, DEFAULT_DAYS:14,
  active(user){ return (DB.db.borrowRequests||[]).filter(r=>r.requestedBy===user.id && ['approved','requested'].includes(r.status)); },
  overdue(){ return (DB.db.borrowRequests||[]).filter(r=>r.status==='approved' && r.to && new Date(r.to) < new Date()); },
  canBorrow(user, item){
    if(!RBAC.has(user,'library.borrow')) return { ok:false, why:'Your role may read the library but not borrow from it.' };
    if(item.borrowable === false) return { ok:false, why:'This item is reference-only.' };
    if(item.ownerDepartment === (deptObj(user.departmentId)||{}).name) return { ok:true, own:true };
    const n = this.active(user).length;
    if(n >= this.MAX_ACTIVE) return { ok:false, why:`You already hold ${n} loans. Return one before requesting another.` };
    return { ok:true };
  },
  request(user, item, from, to, purpose){
    const gate = this.canBorrow(user, item);
    if(!gate.ok) return gate;
    DB.db.borrowRequests = DB.db.borrowRequests || [];
    DB.db.borrowRequests.unshift({ id:'br-'+Date.now().toString(36)+Math.random().toString(36).slice(2,4),
      itemId:item.id, item:item.title, owner:item.department, requestedBy:user.id, requested:todayISO(),
      from, to, purpose, status: gate.own ? 'approved' : 'requested', note:purpose });
    AUDIT.append({ actor:user.id, action:'library.requested', entity:'library', entityId:item.id,
      detail:`${item.title} · ${from} to ${to}` });
    DB.save();
    return { ok:true, own:gate.own };
  },
  decide(user, id, action){
    const req = (DB.db.borrowRequests||[]).find(r=>r.id===id);
    if(!req) return { ok:false, error:'That request no longer exists.' };
    const ownDept = (deptObj(user.departmentId)||{}).name === req.owner;
    if(!RBAC.has(user,'library.manage') && !ownDept) return { ok:false, error:'Only the owning department may decide on a loan.' };
    req.status = action==='approve' ? 'approved' : 'declined';
    req.decidedBy = user.id; req.decided = todayISO();
    AUDIT.append({ actor:user.id, action:'library.'+req.status, entity:'library', entityId:req.itemId||id,
      detail:`${req.item} · ${req.status}` });
    DB.save();
    return { ok:true, req };
  },
  closeExpired(){
    let n = 0;
    (DB.db.borrowRequests||[]).forEach(r=>{
      if(r.status==='approved' && r.to && new Date(r.to) < new Date(Date.now()-86400000)){
        r.status='returned'; r.returnedAt = r.to; n++;
      }
    });
    if(n){ DB.save(); }
    return n;
  }
};

function renderLibrary(user){
  if(!RBAC.has(user,'library.read')) return deniedPanel('library.read');
  LIBRARY.closeExpired();
  const tab = (APPX.params||{}).tab || 'catalogue';
  const q = ((APPX.params||{}).q||'').toLowerCase();
  const items = (DB.db.libraryItems||[]).filter(i=>!q || (i.title+' '+i.summary+' '+i.department).toLowerCase().includes(q));
  const mine = (DB.db.borrowRequests||[]).filter(r=>r.requestedBy===user.id);
  const inbox = (DB.db.borrowRequests||[]).filter(r=>r.status==='requested' &&
    ((deptObj(user.departmentId)||{}).name===r.owner || RBAC.has(user,'library.manage')));
  const tabBtn = (id,label)=>`<button class="tab ${tab===id?'active':''}" data-act="go" data-v="library" data-tab="${id}">${label}</button>`;
  const badgeCls = st => st==='approved'?'b-ok':st==='requested'?'b-warn':st==='declined'?'b-crit':'b-neutral';

  let body = '';
  if(tab==='catalogue'){
    body = `<form class="lib-search" data-form="lib-search">
        <input class="input" name="q" value="${esc((APPX.params||{}).q||'')}" placeholder="Search titles, departments, topics…">
        <button class="btn btn-primary btn-sm" type="submit">${ic('search',15)} Search</button>
      </form>
      <div class="lib-grid">
        ${items.map(i=>{
          const gate = LIBRARY.canBorrow(user, i);
          return `<article class="lib-card">
            <div class="lib-type">${ic(i.type==='policy'?'shield':i.type==='form'?'clipboard':i.type==='workbook'?'columns':'file',14)} ${esc(titleCase(i.type))}</div>
            <h4>${esc(i.title)}</h4>
            <p>${esc(i.summary)}</p>
            <div class="lib-meta"><span>${esc(i.department)}</span><span>${esc(i.version)}</span><span>${esc(i.classification)}</span></div>
            <div class="lib-foot">
              <span class="xs muted">${(DB.db.borrowRequests||[]).filter(r=>r.itemId===i.id && r.status==='approved').length} on loan</span>
              <button class="btn btn-xs ${gate.ok?'btn-primary':'btn-ghost'}" data-act="lib-ask" data-id="${i.id}" ${gate.ok?'':'disabled title="'+esc(gate.why||'')+'"'}>
                ${gate.ok?(gate.own?'Open':'Request'):'Restricted'}</button>
            </div>
          </article>`;
        }).join('') || emptyState('Nothing matches','Try a shorter search.','search')}
      </div>`;
  }
  if(tab==='mine'){
    body = table([
      {label:'Item', render:r=>`<b>${esc(r.item)}</b><div class="xs muted">${esc(r.owner||'')}</div>`},
      {label:'Period', render:r=>`${esc((r.from||'').slice(0,10))} → ${esc((r.to||'').slice(0,10))}`},
      {label:'Purpose', render:r=>esc(r.purpose||r.note||' - ')},
      {label:'Status', render:r=>`<span class="badge ${badgeCls(r.status)}">${esc(titleCase(r.status))}</span>`},
      {label:'', render:r=>['approved','requested'].includes(r.status)
        ? `<button class="btn btn-xs btn-ghost" data-act="lib-return" data-id="${r.id}">Return</button>` : ''}
    ], mine, {empty:emptyState('No loans','Nothing is borrowed on your account.','book')});
  }
  if(tab==='requests'){
    body = table([
      {label:'Item', render:r=>`<b>${esc(r.item)}</b><div class="xs muted">${esc(r.owner||'')}</div>`},
      {label:'Requested by', render:r=>esc(userName(r.requestedBy))},
      {label:'Purpose', render:r=>esc(r.purpose||r.note||' - ')},
      {label:'Period', render:r=>`${esc((r.from||'').slice(0,10))} → ${esc((r.to||'').slice(0,10))}`},
      {label:'Decision', render:r=>`<button class="btn btn-xs btn-primary" data-act="lib-decide" data-id="${r.id}" data-do="approve">Approve</button>
        <button class="btn btn-xs btn-ghost" data-act="lib-decide" data-id="${r.id}" data-do="decline">Decline</button>`}
    ], inbox, {empty:emptyState('No requests','Nothing is waiting for your department.','check')});
  }
  if(tab==='manage'){
    const over = LIBRARY.overdue();
    body = `${over.length?`<div class="alert warn">${ic('clock',16)}<div><b>${over.length} loan(s) past their return date</b>
        <span class="small">${over.map(o=>esc(o.item)).slice(0,4).join(', ')}</span></div></div>`:''}
      ${table([
        {label:'Item', render:r=>`<b>${esc(r.item)}</b><div class="xs muted">${esc(r.owner||'')}</div>`},
        {label:'Held by', render:r=>esc(userName(r.requestedBy))},
        {label:'Due', render:r=>{ const late = r.to && new Date(r.to)<new Date(); return `<span class="${late?'badge b-crit':'small'}">${esc((r.to||'').slice(0,10))}</span>`; }},
        {label:'Status', render:r=>`<span class="badge ${badgeCls(r.status)}">${esc(titleCase(r.status))}</span>`}
      ], (DB.db.borrowRequests||[]).filter(r=>r.status==='approved'), {empty:emptyState('No active loans','Nothing is out on loan.','check')})}
      <div style="margin-top:14px"><button class="btn btn-primary btn-sm" data-act="lib-add-form">${ic('plus',15)} Add library material</button></div>`;
  }

  return pageHead('Department library & archive',
    'Material the Foundation owns, held by the department that owns it. Borrowing is by request, for a stated purpose, and expires.',
    RBAC.has(user,'library.manage')?`<button class="btn btn-sm btn-ghost" data-act="go" data-v="library" data-tab="manage">${ic('settings',15)} Manage loans</button>`:'') +
    `<div class="tabs">${tabBtn('catalogue','Catalogue')}${tabBtn('mine','My loans')}${tabBtn('requests','Requests'+(inbox.length?' ('+inbox.length+')':''))}${RBAC.has(user,'library.manage')?tabBtn('manage','Manage'):''}</div>` +
    body;
}

/* =====================================================================
   2. EXECUTIVE TEAM CONSOLE
   ===================================================================== */
function renderExecConsole(user){
  if(!isExecutive(user)) return `<div class="card"><div class="card-b">${emptyState('Reserved for the executive team',
    'This console holds the Country Director’s agenda, minutes and decisions. Membership is granted by the Director from the Users & accounts page; it is not implied by any role.', 'lock')}</div></div>`;
  const meetings = (DB.db.execMeetings||[]).slice().sort((a,b)=>new Date(b.date)-new Date(a.date));
  const next = meetings.find(m=>m.status==='agenda');
  const last = meetings.find(m=>m.status==='minuted');
  const openActions = meetings.flatMap(m=>(m.actions||[]).map(a=>({...a, meeting:m.title, id:m.id})))
    .filter(a=>!a.done);
  return pageHead('Executive console', 'The Country Director’s agenda, minutes, decisions and actions. Visible to the executive team only.',
    RBAC.has(user,'exec.manage')?`<button class="btn btn-sm btn-primary" data-act="exec-new">${ic('plus',15)} New meeting</button>`:'') +
  `<div class="grid g3">
    ${kpi('Meetings recorded', num(meetings.filter(m=>m.status==='minuted').length), 'with minutes','','archive')}
    ${kpi('Next meeting', next? fmtDate(next.date) : ' - ', next? esc(next.title):'no agenda open','','calendar')}
    ${kpi('Open actions', num(openActions.length), openActions.length? 'awaiting owners':'all closed', openActions.length?'warn':'ok','target')}
  </div>
  <div class="grid g2" style="margin-top:16px">
    ${card('Next agenda', next ? `<div class="ex-next"><div class="ex-date">${fmtDate(next.date)}</div>
        <h4>${esc(next.title)}</h4><div class="xs muted">Chair: ${esc(userName(next.chair)||'Country Director')}</div>
        <ol class="ex-agenda">${(next.agenda||[]).map(a=>`<li><b>${esc(a.text)}</b><span>${esc(userName(a.owner)||'')} · ${esc(a.time||'')}</span></li>`).join('')}</ol>
      </div>` : emptyState('No agenda open','The Director has not published the next agenda.','calendar'))}
    ${card('Open actions', openActions.length ? openActions.map(a=>`<div class="ex-action">
        <div style="flex:1"><b>${esc(a.text)}</b><div class="xs muted">${esc(userName(a.owner)||'')} · due ${esc((a.due||'').slice(0,10))} · ${esc(a.meeting)}</div></div>
        ${RBAC.has(user,'exec.manage')?`<button class="btn btn-xs btn-ghost" data-act="exec-done" data-m="${a.id}" data-i="${(meetings.find(m=>m.id===a.id)||{actions:[]}).actions.indexOf(a)}">Mark done</button>`:''}
      </div>`).join('') : emptyState('Every action is closed','Nothing is outstanding from the executive meetings.','check'))}
  </div>
  ${meetings.map(m=>card(`${esc(m.title)} · ${fmtDate(m.date)}`,
    `<div class="row" style="gap:8px;margin-bottom:10px">
      <span class="badge ${m.status==='minuted'?'b-ok':'b-warn'}">${esc(titleCase(m.status))}</span>
      <span class="xs muted">Chair ${esc(userName(m.chair)||'Country Director')}</span>
      <span class="xs muted">${(m.agenda||[]).length} agenda items</span>
      <span class="xs muted">${(m.minutes||[]).length} minuted</span></div>
    <div class="ex-cols">
      <div><div class="k xs muted">AGENDA</div><ol class="ex-agenda">${(m.agenda||[]).map(a=>`<li><b>${esc(a.text)}</b><span>${esc(userName(a.owner)||'')}</span></li>`).join('')||'<li class="muted">Not published</li>'}</ol></div>
      <div><div class="k xs muted">MINUTES & DECISIONS</div>
        ${(m.minutes||[]).map(x=>`<div class="ex-min"><b>${x.n}. ${esc((x.decision||'noted').toUpperCase())}</b><p>${esc(x.text)}</p></div>`).join('')||'<p class="small muted">Minutes are not yet circulated.</p>'}
        ${m.status==='agenda' && RBAC.has(user,'exec.manage')?`<button class="btn btn-xs btn-ghost" data-act="exec-minute" data-id="${m.id}">Add a minute</button>`:''}
      </div>
    </div>`, {sub:'Confidential to the executive team'}))}`;
}

/* =====================================================================
   3. OFFICE EQUIPMENT REGISTER (owned by the media department)
   ===================================================================== */
function renderInventory(user){
  if(!RBAC.has(user,'inventory.view') && !RBAC.has(user,'inventory.manage')) return deniedPanel('inventory.view');
  const q = ((APPX.params||{}).q||'').toLowerCase();
  const cat = (APPX.params||{}).cat || '';
  const items = (DB.db.inventoryItems||[]).filter(i=>
    (!cat || i.cat===cat) && (!q || (i.item+' '+i.desc+' '+i.serial+' '+i.loc).toLowerCase().includes(q)));
  const all = DB.db.inventoryItems||[];
  const units = all.reduce((n,i)=>n+(+i.qty||0),0);
  const missing = all.filter(i=>/missing/i.test(i.cond||'') || /missing/i.test(i.loc||''));
  const broken = all.filter(i=>/broken|damaged|faulty/i.test(i.cond||''));
  const page = Math.max(1, +(APPX.params||{}).page || 1), per = 25;
  const slice = items.slice((page-1)*per, page*per);
  const pages = Math.max(1, Math.ceil(items.length/per));
  return pageHead('Office equipment register',
    'Every item the Foundation counts, in the categories and on the count sheets the October 2026 inventory workbooks define. The media department holds the register; ICT, procurement and administration may also record movements. Device identifiers, registration plates and monetary values are recorded on the office host, not published with the application.',
    RBAC.has(user,'inventory.manage')?`<button class="btn btn-sm btn-primary" data-act="inv-add-form">${ic('plus',15)} Add item</button>`:'') +
  `<div class="grid g4">
    ${kpi('Items in register', num(all.length), `${num(units)} individual units`,'','package')}
    ${kpi('New in 2026', num(all.filter(i=>String(i.exist||'').toUpperCase()==='NEW').length), 'purchased or donated this year','ok','plus')}
    ${kpi('Missing or unlocated', num(missing.length), missing.length?'requires a physical count':'all located', missing.length?'warn':'ok','search')}
    ${kpi('Damaged', num(broken.length), 'recorded condition','','alert')}
  </div>
  <div class="card" style="margin-top:16px"><div class="card-b">
    <form class="inv-filter" data-form="inv-filter">
      <input class="input" name="q" value="${esc((APPX.params||{}).q||'')}" placeholder="Search item, serial or location…">
      <select class="input" name="cat"><option value="">All categories</option>
        ${INVENTORY_CATEGORIES.map(c=>`<option value="${esc(c)}" ${cat===c?'selected':''}>${esc(c)}</option>`).join('')}</select>
      <button class="btn btn-primary btn-sm" type="submit">${ic('filter',15)} Apply</button>
      ${RBAC.has(user,'inventory.manage')?`<button class="btn btn-ghost btn-sm" data-act="inv-export" type="button">${ic('download',15)} CSV</button>`:''}
    </form>
    ${table([
      {label:'Item', render:r=>`<div class="cellname">${esc(r.item)}<span class="sm">${esc((r.desc||'').slice(0,60))}</span></div>`},
      {label:'Cat.', render:r=>`<span class="xs">${esc((r.cat||'').split(' ')[0])}</span>`},
      {label:'Qty', render:r=>`<b>${num(r.qty)}</b>`},
      {label:'Location', render:r=>esc((r.loc||' - ').slice(0,32))},
      {label:'Asset tag', render:r=>`<span class="mono xs">${esc((r.serial||' - ').slice(0,26))}</span>`},
      {label:'Condition', render:r=>`<span class="badge ${/missing/i.test(r.cond)?'b-crit':/broken/i.test(r.cond)?'b-warn':'b-ok'} nodot">${esc(r.cond||' - ')}</span>`},
      {label:'', render:r=>RBAC.has(user,'inventory.manage')?`<button class="btn btn-xs btn-ghost" data-act="inv-move-form" data-id="${r.id}">Move</button>`:''}
    ], slice, {empty:emptyState('Nothing matches','Change the category or the search.','search')})}
    ${pages>1?`<div class="pager">${Array.from({length:Math.min(pages,12)},(_,i)=>`<button class="pg ${page===i+1?'on':''}" data-act="inv-page" data-p="${i+1}">${i+1}</button>`).join('')}
      <span class="xs muted">${items.length} items</span></div>`:''}
  </div></div>
  <div class="card" style="margin-top:16px"><div class="card-h"><h3>${ic('clipboard',16)} Physical count templates</h3>
    ${RBAC.has(user,'inventory.manage')?`<button class="btn btn-sm btn-ghost" data-act="inv-template-csv" type="button">${ic('download',15)} Blank count sheet (CSV)</button>`:''}</div>
    <div class="card-b">
    <div class="note">${ic('shield',15)}<span>These are the count sheets the October 2026 workbooks define — what is counted, in
      which columns and in which units. Quantities are deliberately blank: every line is confirmed by a physical count on the
      office host, which is what the TB dispensing protocol requires of every stock line, and what keeps stock figures out of
      a published bundle.</span></div>
    <div class="grid g2" style="gap:14px;margin-top:12px">
      <div>
        <div class="xs muted" style="margin-bottom:6px">SUPPLIES · ${SUPPLY_CATALOG.length} lines counted against
          ${SUPPLY_COUNT_COLUMNS.length} columns</div>
        ${SUPPLY_GROUPS.map(g=>`<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px"><span class="badge b-info nodot">${esc(g.cat)}</span>
          <span class="xs muted">${g.items} lines · counted in ${esc(g.unit)}</span></div>`).join('')}
        <div class="xs muted" style="margin-top:6px">Columns: ${SUPPLY_COUNT_COLUMNS.map(c=>`<span class="mono">${esc(c)}</span>`).join(' · ')}</div>
      </div>
      <div>
        <div class="xs muted" style="margin-bottom:6px">KITCHEN &amp; HOUSEHOLD · ${KITCHEN_CATALOG.length} items counted against
          ${KITCHEN_COUNT_COLUMNS.length} columns</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">${KITCHEN_COUNT_COLUMNS.map(c=>`<span class="badge nodot">${esc(c)}</span>`).join('')}</div>
        <div class="xs muted" style="margin-top:8px">Sample lines: ${KITCHEN_CATALOG.slice(0,14).map(esc).join(', ')}${KITCHEN_CATALOG.length>14?' …':''}</div>
      </div>
    </div>
  </div></div>
  ${(typeof INVENTORY_NOTES!=='undefined' && INVENTORY_NOTES.length)?`
  <div class="card" style="margin-top:16px"><div class="card-h"><h3>${ic('clipboard',16)} How these assets arrived</h3></div>
    <div class="card-b"><ol class="rule-steps">${INVENTORY_NOTES.map(n=>`<li>${esc(n)}</li>`).join('')}</ol>
    <div class="xs muted" style="margin-top:8px">Provenance notes from the workbook. A named donor is recorded by role:
      a gift is the Foundation's to publish, a person's name attached to it is not.</div></div></div>`:''}
  <div class="note" style="margin-top:12px">${ic('info',15)}<span>Structure taken from <b>${esc(INVENTORY_SOURCE.file)}</b>
    (${esc((INVENTORY_SOURCE.sheets||[]).join(', '))}) and <b>${esc(INVENTORY_SOURCE.alsoFrom)}</b> — ${INVENTORY_SOURCE.rows} equipment
    rows, ${SUPPLY_CATALOG.length} supply lines, ${KITCHEN_CATALOG.length} kitchen items. ${esc(INVENTORY_SOURCE.note)}
    Removed from the published register: ${esc((INVENTORY_REDACTION.removed||[]).join('; '))} —
    ${String(INVENTORY_REDACTION.counts.serialsRemoved)} identifiers,
    ${String(INVENTORY_REDACTION.counts.valuesRemoved)} values and
    ${String(INVENTORY_REDACTION.counts.locationsReduced)} personal locations. They live
    ${esc(INVENTORY_REDACTION.whereTheRealValuesLive)}.</span></div>`;
}

/* The supply catalogue grouped for display: category, line count, common unit. */
const SUPPLY_GROUPS = supplyGroups();
function supplyGroups(){
  const out = [];
  (typeof SUPPLY_CATALOG!=='undefined'?SUPPLY_CATALOG:[]).forEach(s=>{
    let g = out.find(x=>x.cat===s.cat);
    if(!g){ g = {cat:s.cat, items:0, units:{}}; out.push(g); }
    g.items++; g.units[s.unit||'unit'] = (g.units[s.unit||'unit']||0)+1;
  });
  return out.map(g=>{
    const ranked = Object.entries(g.units).sort((a,b)=>b[1]-a[1]).map(u=>u[0]);
    return {cat:g.cat, items:g.items,
      unit:ranked.slice(0,3).join(', ')+(ranked.length>3?` +${ranked.length-3} more`:'')};
  });
}

/* =====================================================================
   4. STUDENTS, INTERNS AND RESEARCHERS
   ===================================================================== */
function renderInterns(user){
  if(!RBAC.has(user,'intern.view') && !RBAC.has(user,'intern.manage')) return deniedPanel('intern.view');
  const rows = DB.db.interns||[];
  return pageHead('Students, interns & researchers',
    'Every placement, its supervisor, its data-access scope and the work it is allowed to touch.',
    RBAC.has(user,'intern.manage')?`<button class="btn btn-sm btn-primary" data-act="intern-add-form">${ic('plus',15)} Add placement</button>`:'') +
  `<div class="grid g3">
    ${kpi('Active placements', num(rows.filter(r=>r.status==='active').length), 'students, interns and volunteers','','users')}
    ${kpi('Aggregate-only access', num(rows.filter(r=>r.dataAccess==='aggregate-only').length), 'no patient identity','ok','shield')}
    ${kpi('Ending within 30 days', num(rows.filter(r=>r.end && new Date(r.end) < new Date(Date.now()+30*86400000) && r.status==='active').length), 'plan the handover','','clock')}
  </div>
  <div class="card" style="margin-top:16px"><div class="card-b">
  ${table([
    {label:'Placement', render:r=>`<div class="cellname">${esc(r.name)}<span class="sm">${esc(r.institution)} · ${esc(titleCase(r.kind))}</span></div>`},
    {label:'Supervisor', render:r=>esc(userName(r.supervisorId)||' - ')},
    {label:'Period', render:r=>`${esc((r.start||'').slice(0,10))} → ${esc((r.end||'').slice(0,10))}`},
    {label:'Data scope', render:r=>`<span class="badge ${r.dataAccess==='aggregate-only'?'b-ok':'b-warn'} nodot">${esc(r.dataAccess)}</span>`},
    {label:'Project', render:r=>`<span class="small">${esc(r.project)}</span>`},
    {label:'Status', render:r=>`<span class="badge ${r.status==='active'?'b-ok':'b-neutral'}">${esc(titleCase(r.status))}</span>`},
    {label:'', render:r=>`<button class="btn btn-xs btn-ghost" data-act="intern-log-form" data-id="${r.id}">Log</button>`}
  ], rows, {empty:emptyState('No placements','Add the first student or intern placement.','users')})}
  </div></div>
  <div class="note" style="margin-top:12px">${ic('shield',15)}<span>A student with <b>aggregate-only</b> scope is given
    counts and charts, never a name or a code. A <b>shadowing</b> placement sits with a supervisor at all times. Neither
    grants a LOMAMO C-DIMS account: their work is recorded here, under their supervisor's identity.</span></div>`;
}

/* =====================================================================
   5. OCCUPATIONAL HEALTH AND SAFETY
   ===================================================================== */
function renderOhs(user){
  if(!RBAC.has(user,'ohs.view') && !RBAC.has(user,'ohs.manage')) return deniedPanel('ohs.view');
  const rows = DB.db.ohsIncidents||[];
  const open = rows.filter(r=>r.status!=='closed');
  const sev = s=>s==='high'?'b-crit':s==='moderate'?'b-warn':'b-neutral';
  return pageHead('Occupational health & safety',
    'Incidents, hazards and near misses reported by staff in the office and in the field.',
    RBAC.has(user,'ohs.manage')?`<button class="btn btn-sm btn-primary" data-act="ohs-form">${ic('plus',15)} Report an incident</button>`:'') +
  `<div class="grid g4">
    ${kpi('Open incidents', num(open.length), open.length?'action required':'all closed', open.length?'warn':'ok','alert')}
    ${kpi('High severity', num(rows.filter(r=>r.severity==='high').length), 'last 90 days','','shield')}
    ${kpi('Days since last incident', rows.length? daysBetween(rows[0].date)+'' : ' - ', 'reported','','clock')}
    ${kpi('Reports this quarter', num(rows.filter(r=>daysBetween(r.date)<90).length), 'any severity','','clipboard')}
  </div>
  <div class="card" style="margin-top:16px"><div class="card-b">
  ${table([
    {label:'Date', render:r=>esc((r.date||'').slice(0,10))},
    {label:'Type', render:r=>esc(r.type)},
    {label:'Severity', render:r=>`<span class="badge ${sev(r.severity)} nodot">${esc(r.severity)}</span>`},
    {label:'Where', render:r=>esc(r.location)},
    {label:'What happened', render:r=>`<div class="small">${esc(r.summary)}</div><div class="xs muted">${esc(r.action||'')}</div>`},
    {label:'Reported by', render:r=>esc(userName(r.reportedBy)||' - ')},
    {label:'Status', render:r=>`<span class="badge ${r.status==='closed'?'b-ok':'b-warn'}">${esc(titleCase(r.status))}</span>`}
  ], rows, {empty:emptyState('No incidents recorded','The register is clean.','check')})}
  </div></div>`;
}

/* =====================================================================
   6. PRESENCE AND FIELD WEATHER
   ===================================================================== */
function renderPresence(user){
  if(!RBAC.has(user,'presence.view') && !RBAC.has(user,'message.use')) return deniedPanel('presence.view');
  const people = (DB.db.users||[]).filter(u=>u.status==='active');
  const online = people.filter(u=>PRESENCE.online(u));
  const loc = (DB.db.presence||{})[user.id] || {};
  return pageHead('Who is on the network',
    'Live presence across the office Wi-Fi, and a location a person shares deliberately. There is no background tracking.',
    `<button class="btn btn-sm btn-primary" data-act="presence-share">${ic('target',15)} Share my location</button>`) +
  `<div class="grid g3">
    ${kpi('Online now', num(online.length), 'signed in within 12 minutes','ok','wifi')}
    ${kpi('With a shared location', num(online.filter(u=>(DB.db.presence||{})[u.id]?.lat).length), 'coordinates added','','target')}
    ${kpi('Your location', loc.lat? loc.lat.toFixed(3)+', '+loc.lon.toFixed(3) : 'not shared', loc.at? 'updated '+fmtDateTime(loc.at):'press the button to share','','info')}
  </div>
  <div class="card" style="margin-top:16px"><div class="card-b">
  ${table([
    {label:'Person', render:u=>`<div class="row" style="gap:10px"><span class="avatar" style="background:${esc((deptObj(u.departmentId)||{}).accent||'#334155')}">${initials(u.name)}</span>
      <div class="cellname">${esc(u.name)}<span class="sm">${esc((roleObj(u.roleId)||{}).name||'')}</span></div></div>`},
    {label:'Where', render:u=>esc(countyName(u.countyId))+(u.areaIds&&u.areaIds.length?' · '+esc(areaName(u.areaIds[0])):'')},
    {label:'Presence', render:u=>PRESENCE.online(u)?'<span class="badge b-ok">Online</span>':'<span class="badge b-neutral">Offline</span>'},
    {label:'Last seen', render:u=>{ const p=(DB.db.presence||{})[u.id]; return p? fmtDateTime(p.at): (u.lastLogin? fmtDateTime(u.lastLogin):' - '); }},
    {label:'Location', render:u=>{ const p=(DB.db.presence||{})[u.id]; return p&&p.lat? `<span class="mono xs">${(+p.lat).toFixed(3)}, ${(+p.lon).toFixed(3)}${p.accuracy?' ±'+p.accuracy+'m':''}</span>`:'<span class="xs muted">not shared</span>'; }},
    {label:'', render:u=>u.id===user.id?'':`<button class="btn btn-xs btn-ghost" data-act="msg-open" data-u="${u.id}">Message</button>`}
  ], people)}
  </div></div>`;
}

const WEATHER = {
  cache(){ return (DB.db.weatherCache||{}).kisumu || null; },
  async load(){
    const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=-0.0917&longitude=34.7680&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code&daily=precipitation_probability_max,temperature_2m_max,temperature_2m_min&timezone=Africa%2FNairobi&forecast_days=3', {cache:'no-store'});
    if(!r.ok) throw new Error('The weather service did not answer');
    const j = await r.json();
    DB.db.weatherCache = DB.db.weatherCache || {};
    DB.db.weatherCache.kisumu = { at:todayISO(), data:j };
    DB.save();
    return j;
  }
};

function renderWeather(user){
  const c = WEATHER.cache();
  const code = n => n===0?'Clear':n<3?'Partly cloudy':n<50?'Cloudy':n<60?'Drizzle':n<70?'Rain':n<80?'Showers':n<90?'Thunderstorm':'Storm';
  const cur = c && c.data && c.data.current;
  return pageHead('Field weather board', 'Kisumu and the lake basin. Useful before a field day; needs an internet connection to refresh.',
    `<button class="btn btn-sm btn-primary" data-act="weather-refresh">${ic('refresh',15)} Refresh</button>`) +
  (cur ? `<div class="grid g4">
      ${kpi('Now', Math.round(cur.temperature_2m)+'°C', esc(code(cur.weather_code)),'','info')}
      ${kpi('Humidity', Math.round(cur.relative_humidity_2m)+'%', 'relative','','layers')}
      ${kpi('Rain now', (cur.precipitation||0)+' mm', 'last hour','','alert')}
      ${kpi('Wind', Math.round(cur.wind_speed_10m)+' km/h', 'at 10 m','','route')}
    </div>
    <div class="card" style="margin-top:16px"><div class="card-h"><div><h3>Next three days</h3>
      <div class="sub">Read from open-meteo.com at ${fmtDateTime(c.at)}. Cached on this device; it never blocks a form.</div></div></div>
      <div class="card-b"><div class="wx-days">
        ${((c.data.daily||{}).time||[]).map((t,i)=>`<div class="wx-day">
          <b>${esc(fmtDate(t,{weekday:'short',day:'2-digit',month:'short'}))}</b>
          <div class="wx-temp">${Math.round(c.data.daily.temperature_2m_max[i])}° <span>${Math.round(c.data.daily.temperature_2m_min[i])}°</span></div>
          <div class="xs muted">Rain ${c.data.daily.precipitation_probability_max[i]}%</div></div>`).join('')}
      </div></div></div>`
   : `<div class="card"><div class="card-b">${emptyState('No weather reading cached',
      'The board needs an internet connection once. Press Refresh when this device is online; the reading is then kept and shown offline.',
      'wifi', `<button class="btn btn-primary btn-sm" style="margin-top:10px" data-act="weather-refresh">Try now</button>`)}</div></div>`);
}

/* ------------------------------------------------------------ actions/forms */
Object.assign(ACTIONS, {
  'lib-ask': d => {
    const item = (DB.db.libraryItems||[]).find(i=>i.id===d.id);
    if(!item) return;
    const gate = LIBRARY.canBorrow(AUTH.user, item);
    if(!gate.ok) return toast('Cannot borrow', gate.why, 'err');
    const today = new Date().toISOString().slice(0,10);
    const due = new Date(Date.now()+LIBRARY.DEFAULT_DAYS*86400000).toISOString().slice(0,10);
    openModal({title:'Borrow from the library', narrow:true, body:`
      <div class="lib-ask"><b>${esc(item.title)}</b><div class="small muted">${esc(item.department)} · ${esc(item.version)}</div></div>
      <form data-form="lib-ask" data-id="${item.id}">
        <input type="hidden" name="itemId" value="${item.id}">
        <div class="grid g2" style="gap:10px">
          <div class="field"><label>From</label><input class="input" type="date" name="from" value="${today}" required></div>
          <div class="field"><label>Until</label><input class="input" type="date" name="to" value="${due}" required></div>
        </div>
        <div class="field"><label>What do you need it for?</label><textarea class="input" name="purpose" rows="3" required
          placeholder="e.g. Preparing the donor report for the November board meeting."></textarea></div>
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" data-act="submit" data-form="lib-ask">Send the request</button>`});
  },
  'lib-decide': d => {
    const r = LIBRARY.decide(AUTH.user, d.id, d.do==='approve'?'approve':'decline');
    if(!r.ok) return toast('Not decided', r.error, 'err');
    toast('Loan '+r.req.status, `${r.req.item} · ${userName(r.req.requestedBy)}`, 'ok');
    render();
  },
  'lib-return': d => {
    const r = (DB.db.borrowRequests||[]).find(x=>x.id===d.id);
    if(!r) return;
    r.status='returned'; r.returnedAt = todayISO();
    AUDIT.append({actor:AUTH.user.id, action:'library.returned', entity:'library', entityId:r.itemId||r.id, detail:r.item});
    DB.save(); toast('Returned', r.item, 'ok'); render();
  },
  'lib-add-form': () => {
    openModal({title:'Add library material', narrow:true, body:`
      <form data-form="lib-add">
        <div class="field"><label>Title</label><input class="input" name="title" required></div>
        <div class="grid g2" style="gap:10px">
          <div class="field"><label>Department</label><select class="input" name="department">
            ${[...new Set((DB.db.libraryItems||[]).map(i=>i.department))].map(d=>`<option>${esc(d)}</option>`).join('')}</select></div>
          <div class="field"><label>Type</label><select class="input" name="type">
            <option>policy</option><option>template</option><option>form</option><option>guide</option><option>research</option><option>register</option><option>workbook</option><option>reference</option></select></div>
        </div>
        <div class="field"><label>Version</label><input class="input" name="version" placeholder="v1"></div>
        <div class="field"><label>Summary</label><textarea class="input" name="summary" rows="2"></textarea></div>
        <label class="lg-check"><input type="checkbox" name="borrowable" checked> Other departments may borrow this</label>
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" data-act="submit" data-form="lib-add">Add to the library</button>`});
  },
  'inv-page': d => go('inventory', {...APPX.params, page:d.p}),
  'inv-add-form': () => {
    openModal({title:'Add equipment', narrow:true, body:`<form data-form="inv-add">
      <div class="field"><label>Item</label><input class="input" name="item" required></div>
      <div class="grid g2" style="gap:10px">
        <div class="field"><label>Category</label><select class="input" name="cat">${INVENTORY_CATEGORIES.map(c=>`<option>${esc(c)}</option>`).join('')}</select></div>
        <div class="field"><label>Quantity</label><input class="input" type="number" min="1" name="qty" value="1"></div>
      </div>
      <div class="field"><label>Description</label><input class="input" name="desc"></div>
      <div class="grid g2" style="gap:10px">
        <div class="field"><label>Location</label><select class="input" name="loc">${INVENTORY_SITES.map(s=>`<option>${esc(s)}</option>`).join('')}</select>
          <div class="xs muted" style="margin-top:4px">Equipment is issued to a site or a ministry, never to a person. Record the holder in the movement note.</div></div>
        <div class="field"><label>Asset tag</label><input class="input" name="serial" placeholder="LMMK/…">
          <div class="xs muted" style="margin-top:4px">The Foundation's own label. Manufacturer serials and IMEIs stay on this host.</div></div>
      </div>
      <div class="grid g3" style="gap:10px">
        <div class="field"><label>Condition</label><select class="input" name="cond"><option>Good</option><option>Fair</option><option>Broken</option><option>Missing</option></select></div>
        <div class="field"><label>New / old</label><select class="input" name="exist"><option>NEW</option><option>OLD</option><option>USED</option></select></div>
        <div class="field"><label>Value (office host only)</label><input class="input" name="value" placeholder="not published"></div>
      </div>
    </form>`, footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
      <button class="btn btn-primary" data-act="submit" data-form="inv-add">Add to the register</button>`});
  },
  'inv-move-form': d => {
    const it = (DB.db.inventoryItems||[]).find(x=>x.id===d.id); if(!it) return;
    openModal({title:'Move or recount', narrow:true, body:`<div class="lib-ask"><b>${esc(it.item)}</b>
      <div class="small muted">${esc(it.desc||'')}</div><div class="xs muted">Currently: ${esc(it.loc||' - ')} · ${esc(it.cond)}</div></div>
      <form data-form="inv-move"><input type="hidden" name="id" value="${it.id}">
        <div class="field"><label>New location</label><select class="input" name="loc">
          ${(INVENTORY_SITES.includes(it.loc||'')?INVENTORY_SITES:[it.loc||''].concat(INVENTORY_SITES))
            .map(s=>`<option ${s===(it.loc||'')?'selected':''}>${esc(s)}</option>`).join('')}</select></div>
        <div class="grid g2" style="gap:10px">
          <div class="field"><label>Condition</label><select class="input" name="cond">${['Good','Fair','Broken','Missing'].map(c=>`<option ${it.cond===c?'selected':''}>${c}</option>`).join('')}</select></div>
          <div class="field"><label>Quantity counted</label><input class="input" type="number" min="0" name="qty" value="${it.qty}"></div>
        </div>
        <div class="field"><label>Note</label><input class="input" name="note" placeholder="Who moved it, and why"></div>
      </form>`, footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" data-act="submit" data-form="inv-move">Record the movement</button>`});
  },
  'inv-export': () => {
    const rows = DB.db.inventoryItems||[];
    const head = 'Category,Date,Item,Quantity,Description,Location,Asset tag,Value (office host only),Condition,New/Old,Source';
    const csv = [head].concat(rows.map(r=>[r.cat,r.date,r.item,r.qty,r.desc,r.loc,r.serial,r.value,r.cond,r.exist,r.src]
      .map(v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"').join(','))).join('\n');
    downloadText('LOMAMO-office-equipment-'+new Date().toISOString().slice(0,10)+'.csv', csv, 'text/csv');
    AUDIT.append({actor:AUTH.user.id, action:'inventory.exported', entity:'inventory', entityId:'register',
      detail:`Exported ${rows.length} equipment lines. Device identifiers and values are carried only where they were recorded on this host.`});
  },
  /* The blank count sheet: the workbook's own columns and item list, with every
     quantity left for a physical count. This is the artefact the storekeeper
     prints, counts against, and types back into the office host. */
  'inv-template-csv': () => {
    const q = v => '"'+String(v==null?'':v).replace(/"/g,'""')+'"';
    const blanks = n => Array.from({length:n},()=>q(''));
    const L = [];
    L.push('LOMAMO FOUNDATION KENYA - PHYSICAL COUNT SHEET');
    L.push(q('Count date')+','+q('Counted by')+','+q('Confirmed by')+','+q('Site'));
    L.push('');
    L.push('MEDICAL, WOUND-CARE, EQUIPMENT, PPE AND CLEANING SUPPLIES');
    L.push(['Category','Product Name','Unit'].concat(SUPPLY_COUNT_COLUMNS.slice(1)).map(q).join(','));
    SUPPLY_CATALOG.forEach(s=>{
      L.push([q(s.cat),q(s.item),q(s.unit)].concat(blanks(Math.max(1,SUPPLY_COUNT_COLUMNS.length-1))).join(','));
    });
    L.push('');
    L.push('KITCHEN & HOUSEHOLD');
    L.push(KITCHEN_COUNT_COLUMNS.map(q).join(','));
    KITCHEN_CATALOG.forEach(k=>{
      L.push([q(k)].concat(blanks(Math.max(1,KITCHEN_COUNT_COLUMNS.length-1))).join(','));
    });
    L.push('');
    L.push(q('Every line is confirmed by physical count. Quantities, device identifiers and monetary values are recorded on the office host and are not published with the application.'));
    downloadText('LOMAMO-physical-count-sheet-'+new Date().toISOString().slice(0,10)+'.csv', L.join('\n'), 'text/csv');
    AUDIT.append({actor:AUTH.user.id, action:'inventory.countsheet', entity:'inventory', entityId:'template',
      detail:`Issued a blank count sheet: ${SUPPLY_CATALOG.length} supply lines and ${KITCHEN_CATALOG.length} kitchen items`});
  },
  'exec-new': () => {
    openModal({title:'Publish an agenda', narrow:true, body:`<form data-form="exec-new">
      <div class="field"><label>Title</label><input class="input" name="title" required placeholder="e.g. December executive review"></div>
      <div class="field"><label>Date</label><input class="input" type="date" name="date" required></div>
      <div class="field"><label>Agenda items, one per line</label><textarea class="input" name="agenda" rows="4" placeholder="C-DIMS pilot review&#10;November donor pack"></textarea></div>
    </form>`, footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
      <button class="btn btn-primary" data-act="submit" data-form="exec-new">Publish</button>`});
  },
  'exec-minute': d => {
    openModal({title:'Add a minute', narrow:true, body:`<form data-form="exec-minute"><input type="hidden" name="id" value="${d.id}">
      <div class="field"><label>Minute</label><textarea class="input" name="text" rows="4" required></textarea></div>
      <div class="field"><label>Decision</label><select class="input" name="decision">
        <option value="approved">Approved</option><option value="action">Action</option><option value="noted">Noted</option><option value="deferred">Deferred</option></select></div>
    </form>`, footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
      <button class="btn btn-primary" data-act="submit" data-form="exec-minute">Record</button>`});
  },
  'exec-done': d => {
    const m = (DB.db.execMeetings||[]).find(x=>x.id===d.m);
    if(!m) return;
    const a = m.actions[+d.i]; if(!a) return;
    a.done = true; a.doneAt = todayISO();
    AUDIT.append({actor:AUTH.user.id, action:'executive.action_closed', entity:'meeting', entityId:m.id, detail:a.text});
    DB.save(); toast('Action closed', a.text, 'ok'); render();
  },
  'intern-add-form': () => openModal({title:'Add a placement', narrow:true, body:`<form data-form="intern-add">
      <div class="field"><label>Name or placement</label><input class="input" name="name" required></div>
      <div class="grid g2" style="gap:10px">
        <div class="field"><label>Kind</label><select class="input" name="kind"><option>student</option><option>intern</option><option>volunteer</option><option>researcher</option></select></div>
        <div class="field"><label>Institution</label><input class="input" name="institution"></div>
      </div>
      <div class="grid g2" style="gap:10px">
        <div class="field"><label>Start</label><input class="input" type="date" name="start" required></div>
        <div class="field"><label>End</label><input class="input" type="date" name="end" required></div>
      </div>
      <div class="field"><label>Supervisor</label><select class="input" name="supervisorId">${(DB.db.users||[]).filter(u=>['me','mcm','nurse','hr','program.admin','director','countyadmin'].includes(u.roleId)).map(u=>`<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Data scope</label><select class="input" name="dataAccess"><option value="aggregate-only">Aggregate only  -  no patient identity</option><option value="shadowing">Shadowing  -  with a supervisor</option></select></div>
      <div class="field"><label>Project</label><input class="input" name="project"></div>
    </form>`, footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
      <button class="btn btn-primary" data-act="submit" data-form="intern-add">Add</button>`}),
  'intern-log-form': d => openModal({title:'Add a supervision note', narrow:true, body:`<form data-form="intern-log">
      <input type="hidden" name="id" value="${d.id}">
      <div class="field"><label>Note</label><textarea class="input" name="note" rows="4" required></textarea></div>
    </form>`, footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
      <button class="btn btn-primary" data-act="submit" data-form="intern-log">Record</button>`}),
  'ohs-form': () => openModal({title:'Report an incident or hazard', narrow:true, body:`<form data-form="ohs-add">
      <div class="grid g2" style="gap:10px">
        <div class="field"><label>Date</label><input class="input" type="date" name="date" value="${new Date().toISOString().slice(0,10)}" required></div>
        <div class="field"><label>Type</label><select class="input" name="type"><option>Injury</option><option>Near miss</option><option>Hazard</option><option>Illness</option><option>Security</option></select></div>
      </div>
      <div class="grid g2" style="gap:10px">
        <div class="field"><label>Severity</label><select class="input" name="severity"><option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High</option></select></div>
        <div class="field"><label>Location</label><input class="input" name="location" required></div>
      </div>
      <div class="field"><label>What happened</label><textarea class="input" name="summary" rows="3" required></textarea></div>
      <div class="field"><label>Immediate action taken</label><textarea class="input" name="action" rows="2"></textarea></div>
    </form>`, footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
      <button class="btn btn-primary" data-act="submit" data-form="ohs-add">Report</button>`}),
  'presence-share': async () => {
    toast('Reading your location','Your browser will ask for permission.','info');
    const loc = await PRESENCE.locate();
    if(!loc.ok) return toast('Location not shared', loc.error, 'warn');
    PRESENCE.mark(AUTH.user, loc);
    AUDIT.append({actor:AUTH.user.id, action:'presence.location_shared', entity:'user', entityId:AUTH.user.id,
      detail:`${loc.lat}, ${loc.lon} ±${loc.accuracy} m`});
    toast('Location shared', 'Visible to colleagues for the next twelve minutes.', 'ok');
    render();
  },
  'weather-refresh': async () => {
    try{ await WEATHER.load(); toast('Weather updated','The reading is cached on this device for offline use.','ok'); render(); }
    catch(e){ toast('No internet connection','The weather board needs a connection once; everything else in LOMAMO C-DIMS keeps working.','warn'); }
  }
});

Object.assign(FORMS, {
  'lib-search': d => go('library', {tab:'catalogue', q:String(d.get('q')||'')}),
  'lib-ask': (d, f) => {
    const item = (DB.db.libraryItems||[]).find(i=>i.id===f.dataset.id);
    if(!item) return;
    const r = LIBRARY.request(AUTH.user, item, String(d.get('from')), String(d.get('to')), String(d.get('purpose')));
    if(!r.ok) return toast('Not requested', r.why||r.error, 'err');
    closeModal();
    toast(r.own?'Loan recorded':'Request sent', r.own? 'Recorded against your department.' : 'The owning department will decide.', 'ok');
    render();
  },
  'lib-add': d => {
    DB.db.libraryItems = DB.db.libraryItems || [];
    DB.db.libraryItems.unshift({ id:'lib-'+Date.now().toString(36), title:String(d.get('title')),
      department:String(d.get('department')), type:String(d.get('type')), version:String(d.get('version')||'v1'),
      summary:String(d.get('summary')||''), classification:'internal', public:false, ownerId:AUTH.user.id,
      added:new Date().toISOString().slice(0,10), size:' - ', borrowable: d.get('borrowable')==='on', downloads:0 });
    AUDIT.append({actor:AUTH.user.id, action:'library.added', entity:'library', entityId:String(d.get('title')),
      detail:'Added to the department library'});
    DB.save(); closeModal(); toast('Added','The item is in the catalogue.','ok'); render();
  },
  'inv-filter': d => go('inventory', {q:String(d.get('q')||''), cat:String(d.get('cat')||''), page:1}),
  'inv-add': d => {
    DB.db.inventoryItems = DB.db.inventoryItems || [];
    DB.db.inventoryItems.unshift({ id:'inv-'+Date.now().toString(36), cat:String(d.get('cat')), date:new Date().toISOString().slice(0,10),
      item:String(d.get('item')), qty:+(d.get('qty')||1), unit:'unit', desc:String(d.get('desc')||''),
      loc:String(d.get('loc')||''), serial:String(d.get('serial')||''), value:String(d.get('value')||''),
      cond:String(d.get('cond')), exist:String(d.get('exist')), src:'', ownedBy:'media',
      added:new Date().toISOString().slice(0,10), lastCount:new Date().toISOString().slice(0,10), verified:true, notes:'' });
    AUDIT.append({actor:AUTH.user.id, action:'inventory.added', entity:'inventory', entityId:String(d.get('item')), detail:'Added to the register'});
    DB.save(); closeModal(); toast('Added','The item is in the equipment register.','ok'); render();
  },
  'inv-move': d => {
    const it = (DB.db.inventoryItems||[]).find(x=>x.id===d.get('id'));
    if(!it) return;
    DB.db.inventoryMoves = DB.db.inventoryMoves || [];
    DB.db.inventoryMoves.unshift({ id:'im-'+Date.now(), at:todayISO(), by:AUTH.user.id, itemId:it.id,
      from:it.loc, to:String(d.get('loc')||''), note:String(d.get('note')||''),
      qtyBefore:it.qty, qtyAfter:+(d.get('qty')||it.qty), condBefore:it.cond, condAfter:String(d.get('cond')) });
    it.loc = String(d.get('loc')||''); it.qty = +(d.get('qty')||it.qty); it.cond = String(d.get('cond'));
    it.lastCount = new Date().toISOString().slice(0,10);
    AUDIT.append({actor:AUTH.user.id, action:'inventory.moved', entity:'inventory', entityId:it.id, detail:it.item});
    DB.save(); closeModal(); toast('Movement recorded',it.item,'ok'); render();
  },
  'exec-new': (d) => {
    DB.db.execMeetings = DB.db.execMeetings || [];
    DB.db.execMeetings.unshift({ id:'ex-'+Date.now().toString(36), date:new Date(String(d.get('date'))).toISOString(),
      title:String(d.get('title')), status:'agenda', chair:AUTH.user.id, members:EXEC_DEFAULT,
      agenda:String(d.get('agenda')||'').split('\n').filter(Boolean).map((t,i)=>({n:i+1,text:t,owner:AUTH.user.id,time:''})),
      minutes:[], actions:[] });
    AUDIT.append({actor:AUTH.user.id, action:'executive.agenda_published', entity:'meeting', entityId:String(d.get('title')), detail:'Agenda published'});
    DB.save(); closeModal(); toast('Agenda published','The executive team can see it now.','ok'); render();
  },
  'exec-minute': (d) => {
    const m = (DB.db.execMeetings||[]).find(x=>x.id===d.get('id'));
    if(!m) return;
    m.minutes = m.minutes || [];
    m.minutes.push({ n:m.minutes.length+1, text:String(d.get('text')), decision:String(d.get('decision')) });
    m.status = 'minuted';
    AUDIT.append({actor:AUTH.user.id, action:'executive.minuted', entity:'meeting', entityId:m.id, detail:String(d.get('text')).slice(0,180)});
    DB.save(); closeModal(); toast('Minute recorded','Recorded against the meeting.','ok'); render();
  },
  'intern-add': (d) => {
    DB.db.interns = DB.db.interns || [];
    DB.db.interns.unshift({ id:'st-'+Date.now().toString(36), name:String(d.get('name')), kind:String(d.get('kind')),
      institution:String(d.get('institution')), course:'', supervisorId:String(d.get('supervisorId')),
      start:new Date(String(d.get('start'))).toISOString(), end:new Date(String(d.get('end'))).toISOString(),
      status:'active', dataAccess:String(d.get('dataAccess')), project:String(d.get('project')), log:[] });
    DB.save(); closeModal(); toast('Placement added','Supervision is recorded against this placement.','ok'); render();
  },
  'intern-log': (d) => {
    const r = (DB.db.interns||[]).find(x=>x.id===d.get('id'));
    if(!r) return;
    r.log = r.log || [];
    r.log.unshift({ at:todayISO(), by:AUTH.user.id, note:String(d.get('note')) });
    AUDIT.append({actor:AUTH.user.id, action:'intern.supervision_note', entity:'intern', entityId:r.id, detail:String(d.get('note')).slice(0,120)});
    DB.save(); closeModal(); toast('Note recorded',r.name,'ok'); render();
  },
  'ohs-add': (d) => {
    DB.db.ohsIncidents = DB.db.ohsIncidents || [];
    DB.db.ohsIncidents.unshift({ id:'ohs-'+Date.now().toString(36), date:new Date(String(d.get('date'))).toISOString(),
      type:String(d.get('type')), severity:String(d.get('severity')), location:String(d.get('location')),
      reportedBy:AUTH.user.id, summary:String(d.get('summary')), action:String(d.get('action')||''),
      status:'open', closed:null });
    AUDIT.append({actor:AUTH.user.id, action:'ohs.reported', entity:'incident', entityId:String(d.get('type')), detail:String(d.get('summary')).slice(0,150)});
    DB.save(); closeModal(); toast('Incident reported','The safety register is updated.','ok'); render();
  }
});
