/* ============================================================
   pmi.js - Patient Master Index, the return-visit checker,
   duplicate review, and the programme-day profile.

   Why it exists
   -------------
   The Foundation meets the same family repeatedly: a mother
   enrolled in 2023, a child re-assessed in 2026, a neighbour
   referred twice. Before v6 a caregiver discovered a repeat only
   at the end of an assessment, after forty minutes of work.

   The checker answers one question in under a second, before any
   form is opened: have we met this person before? The national ID
   is asked for first; a name and a phone number widen the search
   when the person has no document. A match is a prompt, never a
   decision: a record is only ever merged by a person holding
   pmi.merge, and the merge is reversible because the merged record
   is kept, not deleted.
   ============================================================ */

const PMI = {
  /* Every identifier a patient may carry. The internal id is the only key;
     everything else is an attribute with a scope and a source. */
  identifiers(p){
    const out = [];
    if(p.nationalId) out.push({ type:'National ID', value:p.nationalId, scope:'national', authoritative:true });
    if(p.ccc)        out.push({ type:'CCC number', value:p.ccc, scope:'facility', authoritative:true });
    if(p.tbNo)       out.push({ type:'TB number', value:p.tbNo, scope:'programme', authoritative:true });
    if(p.code)       out.push({ type:'LOM code', value:p.code, scope:'organisation', authoritative:true });
    if(p.phone)      out.push({ type:'Telephone', value:p.phone, scope:'contact', authoritative:false });
    return out;
  },

  /* One implementation of "is this the same person". Ordered by strength. */
  look(db, q){
    const qq = String(q||'').trim();
    const out = { query:qq, matches:[], byId:[], byName:[], byPhone:[], level:'none' };
    if(!qq) return out;
    const digits = nationalIdClean(qq);
    const lower = qq.toLowerCase();
    if(digits.length >= 5){
      out.byId = (db.patients||[]).filter(p=>nationalIdClean(p.nationalId) === digits || nationalIdClean(p.code) === digits);
      if(out.byId.length) out.level = 'national-id';
    }
    if(!out.byId.length && lower.length >= 4){
      out.byName = (db.patients||[]).filter(p=>String(p.name||'').toLowerCase().includes(lower)).slice(0,25);
      if(out.byName.length) out.level = 'name';
    }
    const phone = qq.replace(/[^0-9]/g,'');
    if(phone.length >= 9 && !out.byId.length){
      out.byPhone = (db.patients||[]).filter(p=>String(p.phone||'').replace(/[^0-9]/g,'') === phone).slice(0,25);
      if(out.byPhone.length) out.level = 'phone';
    }
    out.matches = out.byId.length ? out.byId : (out.byName.length ? out.byName : out.byPhone);
    return out;
  },

  /* The banner shown inside an assessment before anything is typed. */
  verdict(res){
    if(!res.matches.length) return { tone:'ok', title:'No previous record found',
      body:'This person does not appear in the register under that identifier. Continue with a full assessment.' };
    const p = res.matches[0];
    const days = (()=>{ try{ return daysBetween(p.intake); }catch(e){ return 0; } })();
    const many = res.matches.length > 1;
    if(res.level==='national-id') return { tone:'crit', title: many ? `${res.matches.length} records share this national ID` : 'Returning patient  -  national ID match',
      body:`${p.name} · ${p.code} · enrolled ${esc(p.intake||'').slice(0,10)} (${days} days ago) · ${areaName(p.areaId)} · status ${p.status}. ${many?'Open duplicate review before creating another record.':'Open the existing record instead of creating a second one.'}` };
    if(res.level==='name') return { tone:'warn', title:'Possible previous record by name',
      body:`${res.matches.length} record(s) match that name. A name is not an identifier: confirm the phone number or the national ID with the person.` };
    return { tone:'warn', title:'Possible previous record by telephone',
      body:`${res.matches.length} record(s) share that telephone number. Families often share a phone; confirm the person's own details.` };
  },

  duplicates(db){
    const byId = {};
    (db.patients||[]).forEach(p=>{
      const key = nationalIdClean(p.nationalId);
      if(!key) return;
      (byId[key] = byId[key] || []).push(p);
    });
    const byPhone = {};
    (db.patients||[]).forEach(p=>{
      const key = String(p.phone||'').replace(/[^0-9]/g,'');
      if(key.length < 9) return;
      (byPhone[key] = byPhone[key] || []).push(p);
    });
    const groups = [];
    Object.entries(byId).forEach(([k,v])=>{ if(v.length>1) groups.push({ key:k, kind:'National ID', patients:v }); });
    Object.entries(byPhone).forEach(([k,v])=>{
      if(v.length>1 && !groups.some(g=>g.patients.some(p=>v.includes(p)) && g.kind==='National ID'))
        groups.push({ key:k, kind:'Telephone', patients:v });
    });
    return groups;
  },

  /* A merge is additive: the survivor keeps everything, the other record is
     marked merged with a pointer. Nothing is deleted, so it can be undone. */
  merge(user, keepId, mergeId, reason){
    if(!RBAC.has(user,'pmi.merge')) return { ok:false, error:'Your role may not merge patient identities.' };
    const keep = DB.db.patients.find(p=>p.id===keepId);
    const dupe = DB.db.patients.find(p=>p.id===mergeId);
    if(!keep || !dupe) return { ok:false, error:'One of the two records no longer exists.' };
    if(keep.id===dupe.id) return { ok:false, error:'A record cannot be merged with itself.' };
    const moved = { visits:0, pdcas:0, requests:0, documents:0, encounters:0 };
    ['visits','pdcas','requests','documents','encounters','supportIssues','clinicalRx'].forEach(coll=>{
      (DB.db[coll]||[]).forEach(r=>{ if(r.patientId===mergeId){ r.patientId=keep.id; if(moved[coll]!=null) moved[coll]++; } });
    });
    /* identifier reconciliation: keep the strongest value on the survivor */
    ['nationalId','ccc','tbNo','phone'].forEach(f=>{
      if(!keep[f] && dupe[f]) keep[f] = dupe[f];
    });
    const before = { status:dupe.status, id:dupe.id, name:dupe.name };
    dupe.status = 'merged';
    dupe.mergedInto = keep.id;
    dupe.mergedAt = todayISO();
    dupe.mergedBy = user.id;
    dupe.mergeReason = reason || '';
    keep.flags = (keep.flags||[]).concat(['identity-merged']);
    DB.db.mergeJournal = DB.db.mergeJournal || [];
    DB.db.mergeJournal.unshift({ id:'pmj-'+Date.now(), at:todayISO(), by:user.id, keepId:keep.id,
      mergeId:mergeId, reason:reason||'', moved, before });
    AUDIT.append({ actor:user.id, action:'patient.identity_merged', entity:'patient', entityId:keep.id,
      detail:`Merged ${mergeId} into ${keepId}. ${reason||''}`, before, after:{ mergedInto:keep.id } });
    DB.save();
    return { ok:true, moved, keep };
  }
};

/* ------------------------------------------------------------ views */
function repeatBanner(res){
  const v = PMI.verdict(res);
  const cls = v.tone==='crit' ? 'rb rb-crit' : v.tone==='warn' ? 'rb rb-warn' : 'rb rb-ok';
  const icon = v.tone==='ok' ? 'check' : 'alert';
  return `<div class="${cls}">
    <div class="rb-ic">${ic(icon,20)}</div>
    <div style="flex:1"><b>${esc(v.title)}</b><div class="rb-body">${v.body}</div></div>
    ${res.matches.length?`<button class="btn btn-sm btn-ghost" data-act="pmi-open" data-id="${res.matches[0].id}">Open the record</button>`:''}
  </div>`;
}

function renderRepeatCheck(user){
  if(!RBAC.has(user,'patient.list') && !RBAC.has(user,'patient.assess.create')) return deniedPanel('patient.list');
  const q = (APPX.params||{}).q || '';
  const res = q ? PMI.look(DB.db, q) : null;
  return pageHead('Returning patient checker',
      'Ask for the national ID <b>before</b> opening an assessment. This page answers in one step, without creating anything.',
      `<button class="btn btn-sm btn-ghost" data-act="go" data-v="patients">${ic('users',15)} Patient register</button>`) +
  `<div class="card"><div class="card-b">
    <form data-form="pmi-search" class="pmi-search">
      <div class="field" style="flex:1;margin:0"><label>National ID, LOM code, name or telephone</label>
        <input class="input" name="q" value="${esc(q)}" placeholder="e.g. 27345871" autofocus></div>
      <button class="btn btn-primary" type="submit">${ic('search',16)} Check</button>
    </form>
    ${q ? repeatBanner(res) : `<div class="pmi-hint">
      <div>${ic('idcard',18)}<b>National ID first</b><span>An exact match on the national ID is the only identifier that raises a red flag on its own.</span></div>
      <div>${ic('search',18)}<b>Then name or phone</b><span>A name match is a prompt to confirm details, never proof of identity.</span></div>
      <div>${ic('shield',18)}<b>Nothing is created here</b><span>Looking a person up writes an audit entry and nothing else.</span></div>
    </div>`}
    ${q && res && res.matches.length ? `<div class="card" style="margin-top:14px;box-shadow:none"><div class="card-b">
      ${table([
        {label:'Patient', render:p=>`<div class="cellname">${esc(p.name)}<span class="sm mono">${esc(p.code)}</span></div>`},
        {label:'National ID', render:p=>`<span class="mono">${esc(p.nationalId||' - ')}</span>`},
        {label:'Area', render:p=>esc(areaName(p.areaId))},
        {label:'Status', render:p=>pBadge(p.status)},
        {label:'Days in programme', render:p=>`<b>${PAT.days(p)}</b>`},
        {label:'Match', render:p=>badge(res.level==='national-id'?'National ID':res.level==='name'?'Name':'Telephone', res.level==='national-id'?'b-crit':'b-warn', false)}
      ], res.matches, {})}
    </div></div>`:''}
  </div></div>` +
  (RBAC.has(user,'pmi.merge') ? renderDuplicateQueue(user) : '');
}

function renderDuplicateQueue(user){
  const groups = PMI.duplicates(DB.db);
  return `<div class="card" style="margin-top:16px"><div class="card-h"><div>
      <h3>Duplicate identity review</h3><div class="sub">${groups.length} identifier group(s) appear on more than one record. Merging keeps both records; the duplicate is marked, never deleted.</div>
    </div></div><div class="card-b">` +
    (groups.length ? table([
      {label:'Identifier', render:g=>`<b>${esc(g.kind)}</b><div class="mono xs">${esc(g.key)}</div>`},
      {label:'Records', render:g=>g.patients.map(p=>`<div class="small">${esc(p.name)} <span class="mono xs">${esc(p.id)}</span></div>`).join('')},
      {label:'Days', render:g=>g.patients.map(p=>`<span class="badge b-neutral nodot">${PAT.days(p)}</span>`).join(' ')},
      {label:'Action', render:g=>g.patients.length>1
        ? `<button class="btn btn-xs btn-primary" data-act="pmi-merge-form" data-keep="${g.patients[0].id}" data-merge="${g.patients[1].id}">Review & merge</button>`
        : ''}
    ], groups) : emptyState('No duplicates found','Every record carries its own national ID, or none at all.','check')) +
  `</div></div>`;
}

function renderProgrammeDays(user){
  if(!RBAC.has(user,'patient.list')) return deniedPanel('patient.list');
  const ps = repo.patients(user).filter(p=>p.status!=='merged');
  const days = ps.map(PAT.days);
  const buckets = [[0,44],[45,90],[91,150],[151,240],[241,330],[331,9999]];
  const labels = ['0-44','45-90','91-150','151-240','241-330','331+'];
  const counts = buckets.map(([a,b])=>days.filter(d=>d>=a&&d<=b).length);
  const core = days.filter(d=>d>=45&&d<=240).length;
  const tail = days.filter(d=>d>240&&d<=330).length;
  const avg = days.length ? Math.round(days.reduce((a,b)=>a+b,0)/days.length) : 0;
  const byArea = {};
  ps.forEach(p=>{ (byArea[p.areaId]=byArea[p.areaId]||[]).push(PAT.days(p)); });
  return pageHead('Programme days', 'How long each person has been with the Foundation, and the review that follows from it.',
    `<button class="btn btn-sm btn-ghost" data-act="go" data-v="patients">${ic('users',15)} Register</button>`) +
  `<div class="grid g4">
    ${kpi('Patients in scope', num(ps.length), 'merged records excluded','','users')}
    ${kpi('Between 45 and 240 days', pct(core, ps.length)+'%', `${num(core)} patients`, core/Math.max(1,ps.length)>=0.95?'ok':'warn','target')}
    ${kpi('Between 241 and 330 days', pct(tail, ps.length)+'%', `${num(tail)} patients`,'','clock')}
    ${kpi('Average time in programme', avg+' days', 'median '+ (days.length?days.slice().sort((a,b)=>a-b)[Math.floor(days.length/2)]:0) +' days','','chart')}
  </div>
  ${(typeof MASTERX2!=='undefined')? (()=>{
      const b = MASTERX2.bandSummary(user);
      return `<div class="grid g2" style="margin-top:16px">
        ${card('Master workbook bands (conditional formatting on column K)', table([
          {label:'Band',render:x=>`<div class="cellname">${esc(x.label)}</div><div class="xs muted">${esc(x.meaning)}</div>`},
          {label:'Patients',cls:'num',render:x=>`<b>${num(x.n)}</b>`},
          {label:'Share',cls:'num',render:x=>(x.share*100).toFixed(1)+'%'}
        ], b.workbook), {foot:'<span>&gt;99, &gt;100, &gt;120 and &gt;183 days: the workbook\u2019s own four bands. Beyond 183 days is the minimal-care rule.</span>'})}
        ${card('Operational milestones (this report)', table([
          {label:'Milestone',render:x=>`<div class="cellname">${esc(x.label)}</div><div class="xs muted">${esc(x.meaning)}</div>`},
          {label:'At or beyond',cls:'num',render:x=>`<b>${num(x.n)}</b>`},
          {label:'Share',cls:'num',render:x=>(x.share*100).toFixed(1)+'%'}
        ], b.operational), {foot:'<span>Both schemes are published, each under its own heading. Neither is renamed to look like the other.</span>'})}
      </div>`;
    })() : ''}
  <div class="grid g2" style="margin-top:16px">
    ${card('Distribution', barChart(labels.map((l,i)=>({label:l, value:counts[i]})), {fmt:v=>num(v)}))}
    ${card('By ministry area', table([
      {label:'Area', render:r=>esc(r.area)},
      {label:'Patients', render:r=>num(r.n)},
      {label:'Average days', render:r=>r.avg},
      {label:'Longest', render:r=>r.max}
    ], Object.entries(byArea).map(([id,ds])=>({ area:areaName(id), n:ds.length,
        avg:Math.round(ds.reduce((a,b)=>a+b,0)/ds.length), max:Math.max(...ds) })).sort((a,b)=>b.n-a.n)))}
  </div>
  <div class="card" style="margin-top:16px"><div class="card-b"><div class="note">${ic('info',15)}
    <span>The reference register is generated to this profile on purpose: at least 95 per cent of patients between 45 and
    240 days, the remainder between 240 and 330. The <b>Realistic programme days</b> action in Settings regenerates the
    whole register to the same profile if a demonstration database has drifted.</span></div></div></div>`;
}

/* ------------------------------------------------------------ forms/actions */
Object.assign(FORMS, {
  'pmi-search': d => {
    const q = String(d.get('q')||'').trim();
    AUDIT.append({ actor:AUTH.user.id, action:'patient.lookup', entity:'patient', entityId:q,
      detail:'Returning patient check' });
    go('repeat', {q});
  },
  'pmi-merge': d => {
    const keep = String(d.get('keep')||''), mergeId = String(d.get('merge')||''), reason = String(d.get('reason')||'');
    const r = PMI.merge(AUTH.user, keep, mergeId, reason);
    if(!r.ok) return toast('Not merged', r.error, 'err');
    closeModal();
    toast('Records merged', `${r.keep.name} now holds both histories. The duplicate is retained and marked.`, 'ok');
    render();
  }
});

Object.assign(ACTIONS, {
  'pmi-open': d => go('patient', {id:d.id}),
  'pmi-merge-form': d => {
    const keep = DB.db.patients.find(p=>p.id===d.keep), dupe = DB.db.patients.find(p=>p.id===d.merge);
    if(!keep||!dupe) return;
    openModal({ title:'Merge two patient identities', narrow:true, body:`
      <div class="alert warn">${ic('alert',16)}<div><b>This keeps both records</b>
        <span class="small">Visits, PDCA cycles, requests and documents move to the surviving record. The other record is
        marked merged and keeps its history for audit. A merge can be reviewed in the merge journal.</span></div></div>
      ${card('Surviving record', `<b>${esc(keep.name)}</b><div class="small muted mono">${esc(keep.code)} · ${esc(keep.id)}</div>
        <div class="small">${esc(keep.nationalId||'no national ID')} · ${PAT.days(keep)} days · ${esc(areaName(keep.areaId))}</div>`)}
      ${card('Record merged into it', `<b>${esc(dupe.name)}</b><div class="small muted mono">${esc(dupe.code)} · ${esc(dupe.id)}</div>
        <div class="small">${esc(dupe.nationalId||'no national ID')} · ${PAT.days(dupe)} days · ${esc(areaName(dupe.areaId))}</div>`)}
      <form data-form="pmi-merge">
        <input type="hidden" name="keep" value="${esc(keep.id)}"><input type="hidden" name="merge" value="${esc(dupe.id)}">
        <div class="field"><label>Why are these the same person?</label>
          <textarea class="input" name="reason" rows="3" required placeholder="e.g. Same national ID, confirmed against the identity card by the caregiver on 22 Oct."></textarea></div>
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" data-act="submit" data-form="pmi-merge">Merge records</button>` });
  }
});
