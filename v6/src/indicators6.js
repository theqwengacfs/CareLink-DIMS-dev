/* ============================================================
   indicators6.js - data elements, versioned indicators, and a
   restricted formula evaluator.

   The design follows the DHIS2 idea rather than copying its code:
   a data element is defined once (what is counted, from which
   record, in which period, at what sensitivity), and an indicator
   is a published, versioned calculation over data elements. A new
   calculation is a NEW VERSION, never an edit of a version that has
   already been reported.

   The evaluator is a small recursive-descent parser over a fixed
   grammar. It cannot call a function, read a property, or reach the
   network: an expression is reduced to numbers. Anything it does not
   recognise is refused with a reason the user can act on. No eval,
   no Function constructor, no template expansion.

   Nothing here submits anything to KHIS or DHIS2. The page says so.
   ============================================================ */

const IND6 = {
  /* -------- the safe evaluator -------- */
  FUNCS: {
    round: v => Math.round(v),
    floor: v => Math.floor(v),
    ceil:  v => Math.ceil(v),
    abs:   v => Math.abs(v),
    max:   (...a) => Math.max(...a),
    min:   (...a) => Math.min(...a),
    safeDiv: (a, b) => (b === 0 ? 0 : a / b)
  },

  tokenize(src){
    const out = [];
    const s = String(src||'');
    let i = 0;
    while(i < s.length){
      const c = s[i];
      if(/\s/.test(c)){ i++; continue; }
      if(/[0-9.]/.test(c)){
        let j = i; while(j < s.length && /[0-9._]/.test(s[j])) j++;
        const num = s.slice(i, j).replace(/_/g, '');
        if(!/^\d*\.?\d+$/.test(num)) throw new Error(`"${num}" is not a number`);
        out.push({ t:'num', v:Number(num) }); i = j; continue;
      }
      if(/[A-Za-z]/.test(c)){
        let j = i; while(j < s.length && /[A-Za-z0-9_.-]/.test(s[j])) j++;
        out.push({ t:'id', v:s.slice(i, j) }); i = j; continue;
      }
      if('+-*/(),'.includes(c)){ out.push({ t:c }); i++; continue; }
      throw new Error(`"${c}" is not allowed in a formula`);
    }
    return out;
  },

  /* Expression := Term (('+'|'-') Term)* ; Term := Factor (('*'|'/') Factor)* */
  evaluate(expr, env){
    try{
      const toks = this.tokenize(expr);
      let p = 0;
      const peek = () => toks[p];
      const eat = t => { if(!toks[p] || toks[p].t !== t) throw new Error(`expected "${t}"`); p++; };

      const parseExpr = () => {
        let v = parseTerm();
        while(peek() && (peek().t === '+' || peek().t === '-')){
          const op = toks[p++].t;
          const r = parseTerm();
          v = op === '+' ? v + r : v - r;
        }
        return v;
      };
      const parseTerm = () => {
        let v = parseFactor();
        while(peek() && (peek().t === '*' || peek().t === '/')){
          const op = toks[p++].t;
          const r = parseFactor();
          if(op === '/' && r === 0) throw new Error('division by zero');
          v = op === '*' ? v * r : v / r;
        }
        return v;
      };
      const parseFactor = () => {
        const t = peek();
        if(!t) throw new Error('the formula ends too early');
        if(t.t === '-'){ p++; return -parseFactor(); }
        if(t.t === '('){ p++; const v = parseExpr(); eat(')'); return v; }
        if(t.t === 'num'){ p++; return t.v; }
        if(t.t === 'id'){
          p++;
          const name = t.v;
          if(peek() && peek().t === '('){
            const fn = this.FUNCS[name];
            if(!fn) throw new Error(`unknown function "${name}"`);
            p++;
            const args = [];
            if(peek() && peek().t !== ')'){ args.push(parseExpr()); while(peek() && peek().t === ','){ p++; args.push(parseExpr()); } }
            eat(')');
            return fn(...args);
          }
          if(!(name in env)) throw new Error(`unknown data element "${name}"`);
          const val = env[name];
          if(val === null || val === undefined) throw new Error(`"${name}" has no value in this period`);
          return Number(val);
        }
        throw new Error(`unexpected "${t.t}"`);
      };

      const value = parseExpr();
      if(p !== toks.length) throw new Error('the formula has more than one expression');
      if(!Number.isFinite(value)) throw new Error('the result is not a finite number');
      return { ok:true, value };
    }catch(e){
      return { ok:false, error:e.message };
    }
  },

  /* -------- values from the records, in the caller's scope -------- */
  /* Each entry states whether the source actually holds records. A genuine
     zero and a missing source are different answers and are shown
     differently: "0" and "not recorded". */
  values(user){
    const ps = (typeof repo!=='undefined' && repo.patientList) ? repo.patientList(user) : [];
    const inScope = new Set(ps.map(p=>p.id));
    const visits = (DB.db.visits||[]).filter(v=>inScope.has(v.patientId));
    const pdcas = (DB.db.pdcas||[]).filter(x=>inScope.has(x.patientId));
    const reqs = (DB.db.requests||[]).filter(r=>inScope.has(r.patientId));
    const forms = (DB.db.formRecords||[]).filter(f=>inScope.has(f.patientId));
    const tx = (DB.db.transactions||[]).filter(t=>ps.some(p=>p.countyId===t.countyId));
    const today = new Date();

    const v = {
      'de-001':{ value:visits.filter(x=>x.outcome!=='not_found').length, source:'visits', available:visits.length>0 },
      'de-002':{ value:ps.filter(p=>['active','extension'].includes(p.status)).length, source:'patients', available:ps.length>0 },
      'de-003':{ value:pdcas.filter(x=>x.status==='open' && x.due && new Date(x.due) < today).length, source:'pdcas', available:pdcas.length>0 },
      'de-004':{ value:reqs.filter(r=>['completed','reconciled'].includes(r.status)).length, source:'requests', available:reqs.length>0 },
      'de-005':{ value:RBAC.has(user,'finance.view')
          ? tx.filter(t=>['paid','reconciled'].includes(t.status)).reduce((n,t)=>n+(+t.amount||0),0)
          : null,
        source:'transactions', available:RBAC.has(user,'finance.view') && tx.length>0,
        withheld:!RBAC.has(user,'finance.view') },
      'de-006':{ value:forms.filter(f=>/tb/i.test(String(f.kind||''))).length, source:'formRecords', available:forms.length>0 },
      'de-007':{ value:forms.filter(f=>/lab|viral/i.test(String(f.kind||''))).length, source:'formRecords', available:forms.some(f=>/lab|viral/i.test(String(f.kind||''))) },
      'de-008':{ value:0, source:'hr.training', available:false, note:'No training records are held in this installation yet.' }
    };
    (DB.db.dataElements||[]).forEach(de=>{ if(!(de.id in v)) v[de.id] = { value:null, source:de.source, available:false, note:'No source connected' }; });
    return v;
  },

  env(user){
    const vals = this.values(user);
    const env = {};
    Object.keys(vals).forEach(k=>{ env[k] = vals[k].available && vals[k].value!==null ? vals[k].value : null; });
    return { env, vals };
  },

  compute(ind, user){
    const { env, vals } = this.env(user);
    const num = this.evaluate(ind.numerator, env);
    const den = this.evaluate(ind.denominator, env);
    if(!num.ok) return { ok:false, error:`Numerator: ${num.error}`, vals };
    if(!den.ok) return { ok:false, error:`Denominator: ${den.error}`, vals };
    if(den.value === 0) return { ok:false, error:'The denominator is zero in this period, so no percentage is produced.', vals, num:num.value, den:0 };
    const pct = (num.value / den.value) * (ind.scale === 1000 ? 1000 : 100);
    return { ok:true, value:pct, num:num.value, den:den.value, unit:ind.unit||'%', vals };
  },

  /* -------- versioning -------- */
  nextVersion(user, id){
    const list = (DB.db.indicators||[]).filter(i=>i.id===id);
    if(!list.length) return { ok:false, error:'That indicator does not exist.' };
    return { ok:true, latest:list.sort((a,b)=>b.version-a.version)[0], versions:list };
  },

  addVersion(user, id, patch){
    if(!RBAC.has(user,'indicator.manage')) return { ok:false, error:'Your role may read indicators but not define them (indicator.manage is required).' };
    const r = this.nextVersion(user, id);
    if(!r.ok) return r;
    const latest = r.latest;
    const num = patch.numerator !== undefined ? String(patch.numerator) : latest.numerator;
    const den = patch.denominator !== undefined ? String(patch.denominator) : latest.denominator;
    const { env } = this.env(user);
    const tn = this.evaluate(num, env), td = this.evaluate(den, env);
    /* A formula is validated when it is defined, not when it is read, so a
       broken definition can never reach a report unnoticed. Unknown elements
       are allowed at definition time only if they exist in the registry. */
    const known = new Set((DB.db.dataElements||[]).map(d=>d.id));
    const ids = [...this.tokenize(num), ...this.tokenize(den)].filter(t=>t.t==='id').map(t=>t.v);
    const unknown = ids.filter(x=>!known.has(x) && !(x in this.FUNCS));
    if(unknown.length) return { ok:false, error:`Unknown data element in the formula: ${unknown.join(', ')}` };
    if(!tn.ok && !/no value|unknown data element/.test(tn.error)) return { ok:false, error:`Numerator will not parse: ${tn.error}` };
    if(!td.ok && !/no value|unknown data element/.test(td.error)) return { ok:false, error:`Denominator will not parse: ${td.error}` };

    const def = {
      id, name: patch.name || latest.name, version: latest.version + 1,
      effective: patch.effective || todayISO().slice(0,10), unit: latest.unit || '%',
      numerator: num, denominator: den,
      filters: patch.filters || latest.filters,
      definition: patch.definition || latest.definition,
      approval: 'draft', approvedBy: null, updated: new Date().toISOString(),
      immutable: false, supersedes: latest.version
    };
    DB.db.indicators = DB.db.indicators || [];
    DB.db.indicators.push(def);
    AUDIT.append({ actor:user.id, action:'indicator.version_created', entity:'indicator', entityId:id,
      detail:`${def.name} v${def.version} · ${num} / ${den}` });
    DB.save();
    return { ok:true, indicator:def };
  },

  approveVersion(user, id, version){
    if(!RBAC.has(user,'indicator.manage')) return { ok:false, error:'Your role may not approve an indicator definition.' };
    const ind = (DB.db.indicators||[]).find(i=>i.id===id && i.version===version);
    if(!ind) return { ok:false, error:'That version does not exist.' };
    ind.approval = 'approved'; ind.approvedBy = user.id; ind.approvedAt = new Date().toISOString();
    ind.immutable = true;
    AUDIT.append({ actor:user.id, action:'indicator.approved', entity:'indicator', entityId:id,
      detail:`${ind.name} v${ind.version}` });
    DB.save();
    return { ok:true, indicator:ind };
  },

  addElement(user, patch){
    if(!RBAC.has(user,'indicator.manage')) return { ok:false, error:'Your role may read data elements but not define them.' };
    const name = String(patch.name||'').trim();
    if(name.length < 3) return { ok:false, error:'A data element needs a name.' };
    if(!patch.source) return { ok:false, error:'Name the record or process this element is counted from. An element with no source cannot be verified.' };
    const id = 'de-' + String((DB.db.dataElements||[]).length + 1).padStart(3,'0');
    const el = { id, name, type:patch.type||'integer', unit:patch.unit||'', source:patch.source,
      freq:patch.freq||'monthly', agg:patch.agg||'count', sensitivity:patch.sensitivity||'internal',
      active:true, createdBy:user.id, created:new Date().toISOString(),
      note:patch.note||'No automatic source. Values must be entered from a verified register.' };
    DB.db.dataElements = DB.db.dataElements || [];
    DB.db.dataElements.push(el);
    AUDIT.append({ actor:user.id, action:'dataelement.created', entity:'dataElement', entityId:id, detail:name });
    DB.save();
    return { ok:true, element:el };
  },

  latestVersions(){
    const byId = {};
    (DB.db.indicators||[]).forEach(i=>{ if(!byId[i.id] || i.version > byId[i.id].version) byId[i.id] = i; });
    return Object.values(byId).sort((a,b)=>a.name.localeCompare(b.name));
  }
};

/* ------------------------------------------------------------------ view */
function renderIndicators(user){
  const canManage = RBAC.has(user,'indicator.manage');
  if(!canManage && !RBAC.has(user,'report.executive') && !RBAC.has(user,'report.patient_figures') && !RBAC.has(user,'report.departmental'))
    return deniedPanel('indicator.manage');
  const { vals } = IND6.env(user);
  const elements = (DB.db.dataElements||[]);
  const inds = IND6.latestVersions();
  const computed = inds.map(i=>({ ind:i, res:IND6.compute(i, user) }));
  const usable = computed.filter(c=>c.res.ok).length;

  return pageHead('Data elements & indicators',
    'What is counted, from which record, over which period, and how a published percentage is calculated. A new calculation is a new version; a version that has been reported is never edited. The evaluator is a restricted parser, not a scripting engine.',
    canManage ? `<button class="btn btn-sm btn-ghost" data-act="ind-add-form">${ic('plus',15)} New data element</button>
      <button class="btn btn-sm btn-primary" data-act="ind-version-form">${ic('layers',15)} New indicator version</button>` : '')
  + `<div class="grid g4" style="margin-bottom:16px">
      ${kpi('Data elements', num(elements.length), `${elements.filter(e=>e.active!==false).length} active`, '', 'layers')}
      ${kpi('Indicators', num(inds.length), 'Latest approved or draft version', '', 'chart')}
      ${kpi('Computed now', num(usable), 'From the records in your scope', usable?'ok':'warn', 'pulse')}
      ${kpi('Not computed', num(computed.length-usable), 'Missing source or zero denominator', computed.length-usable?'warn':'ok', 'alert')}
    </div>`
  + `<div class="note">${ic('info',15)}<span>This is a DHIS2-inspired definition model inside LOMAMO C-DIMS, not a connection to DHIS2 or KHIS.
      Nothing here is submitted anywhere. Where a national report is required, its definition version and approval status are recorded first,
      and the interface says plainly that it is not an official KHIS submission.</span></div>`
  + card('Data elements', table([
      { label:'Element', render:e=>`<div class="cellname">${esc(e.name)}<span class="sm mono">${esc(e.id)}</span></div>` },
      { label:'Type', render:e=>`<span class="xs">${esc(e.type)}${e.unit?' · '+esc(e.unit):''}</span>` },
      { label:'Source', render:e=>`<span class="mono xs">${esc(e.source)}</span>` },
      { label:'Period · aggregation', render:e=>`<span class="xs">${esc(e.freq)} · ${esc(e.agg)}</span>` },
      { label:'Value now', render:e=>{
          const v = vals[e.id] || {};
          if(v.withheld) return badge('Withheld for your role','b-neutral',false);
          if(!v.available) return `<span class="xs muted" title="${esc(v.note||'No source in this installation')}">not recorded</span>`;
          return `<b>${e.agg==='sum'?num(v.value):num(v.value)}</b>`;
        } },
      { label:'Sensitivity', render:e=>badge(e.sensitivity||'internal', e.sensitivity==='clinical'?'b-warn':'b-neutral', false) }
    ], elements, { compact:true, empty:emptyState('No data elements','Define what the Foundation counts before defining a percentage over it.','layers') }))

  + card('Indicators', table([
      { label:'Indicator', render:c=>`<div class="cellname">${esc(c.ind.name)}<span class="sm">v${c.ind.version} · effective ${esc(c.ind.effective||' - ')}</span></div>` },
      { label:'Definition', render:c=>`<span class="xs">${esc((c.ind.definition||'').slice(0,150))}</span>` },
      { label:'Formula', render:c=>`<span class="mono xs">${esc(c.ind.numerator)} / ${esc(c.ind.denominator)}</span>` },
      { label:'Value', render:c=>c.res.ok
          ? `<b>${c.res.value.toFixed(1)}${esc(c.res.unit||'')}</b><span class="sm xs muted">${num(c.res.num)} / ${num(c.res.den)}</span>`
          : `<span class="xs muted">${esc(c.res.error)}</span>` },
      { label:'Status', render:c=>badge(c.ind.approval||'draft', c.ind.approval==='approved'?'b-ok':'b-warn', false) },
      { label:'', render:c=>canManage && c.ind.approval!=='approved'
          ? `<button class="btn btn-xs btn-ghost" data-act="ind-approve" data-id="${esc(c.ind.id)}" data-v="${c.ind.version}">Approve</button>` : '' }
    ], computed, { empty:emptyState('No indicators','No percentage has been defined yet, so none is shown.','chart') }))

  + card('Version history', table([
      { label:'Indicator', render:i=>esc(i.name) },
      { label:'Version', render:i=>`<span class="mono">v${i.version}</span>` },
      { label:'Effective', render:i=>esc(String(i.effective||'').slice(0,10)) },
      { label:'Definition', render:i=>`<span class="xs">${esc((i.definition||'').slice(0,110))}</span>` },
      { label:'Status', render:i=>badge(i.approval||'draft', i.approval==='approved'?'b-ok':'b-warn', false) }
    ], (DB.db.indicators||[]).slice().sort((a,b)=>a.name.localeCompare(b.name)||b.version-a.version), { compact:true }))

  + `<div class="note" style="margin-top:12px">${ic('shield',15)}<span>A patient-level (tracker) record and an aggregate figure are not the same thing.
      The elements above count from patient records in your scope, and a genuine zero is shown as <b>0</b> while a missing source is shown as
      <b>not recorded</b>. A figure is never presented as complete when part of its source is absent.</span></div>`;
}

/* ---------------------------------------------------------------- actions */
Object.assign(ACTIONS, {
  'ind-add-form': () => openModal({ title:'New data element', narrow:true, body:`<form data-form="ind-add">
      <div class="field"><label>Name</label><input class="input" name="name" required minlength="3" placeholder="e.g. Bibles distributed"></div>
      <div class="grid g2" style="gap:10px">
        <div class="field"><label>Type</label><select class="input" name="type"><option>integer</option><option>decimal</option></select></div>
        <div class="field"><label>Unit</label><input class="input" name="unit" placeholder="visits, KES, items"></div>
      </div>
      <div class="field"><label>Source record or process</label>
        <input class="input" name="source" required placeholder="e.g. welfare.distribution">
        <span class="xs muted">Name the register or process this is counted from. Without a source the figure cannot be verified.</span></div>
      <div class="grid g2" style="gap:10px">
        <div class="field"><label>Reporting period</label><select class="input" name="freq"><option>weekly</option><option>monthly</option><option>quarterly</option><option>annual</option></select></div>
        <div class="field"><label>Aggregation</label><select class="input" name="agg"><option>count</option><option>sum</option><option>average</option></select></div>
      </div>
      <div class="field"><label>Sensitivity</label><select class="input" name="sensitivity"><option>internal</option><option>clinical</option><option>finance</option></select></div>
    </form>`, footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
      <button class="btn btn-primary" data-act="submit" data-form="ind-add">Create element</button>` }),

  'ind-version-form': () => {
    const inds = IND6.latestVersions();
    openModal({ title:'New indicator version', body:`<form data-form="ind-version">
      <div class="field"><label>Indicator</label><select class="input" name="id" required>
        ${inds.map(i=>`<option value="${esc(i.id)}">${esc(i.name)} (currently v${i.version})</option>`).join('')}</select></div>
      <div class="field"><label>Definition</label><textarea class="input" name="definition" rows="2" placeholder="What the percentage means, in one sentence"></textarea></div>
      <div class="grid g2" style="gap:10px">
        <div class="field"><label>Numerator</label><input class="input mono" name="numerator" placeholder="de-001"></div>
        <div class="field"><label>Denominator</label><input class="input mono" name="denominator" placeholder="de-002"></div>
      </div>
      <div class="note">${ic('info',15)}<span>Numbers, data element codes, brackets, + &minus; &times; &divide;, and round, floor, ceil, abs, max, min, safeDiv.
        Nothing else is accepted: the formula is parsed, not executed.</span></div>
      <div class="field"><label>Effective date</label><input class="input" type="date" name="effective" value="${todayISO().slice(0,10)}"></div>
    </form>`, footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
      <button class="btn btn-primary" data-act="submit" data-form="ind-version">Create version</button>` });
  },

  'ind-approve': (d) => {
    const r = IND6.approveVersion(AUTH.user, d.id, +d.v);
    if(!r.ok) return toast('Not approved', r.error, 'err');
    toast('Approved', `${r.indicator.name} v${r.indicator.version} is now fixed and cannot be edited.`, 'ok');
    render();
  }
});

Object.assign(FORMS, {
  'ind-add': (d) => {
    const r = IND6.addElement(AUTH.user, { name:String(d.get('name')), type:String(d.get('type')),
      unit:String(d.get('unit')), source:String(d.get('source')), freq:String(d.get('freq')),
      agg:String(d.get('agg')), sensitivity:String(d.get('sensitivity')) });
    if(!r.ok) return toast('Not created', r.error, 'err');
    closeModal(); toast('Element created', `${r.element.name} (${r.element.id}) is in the registry.`, 'ok'); render();
  },
  'ind-version': (d) => {
    const r = IND6.addVersion(AUTH.user, String(d.get('id')), {
      definition:String(d.get('definition')||''), numerator:String(d.get('numerator')||''),
      denominator:String(d.get('denominator')||''), effective:String(d.get('effective')||'') });
    if(!r.ok) return toast('Not created', r.error, 'err');
    closeModal(); toast('Version created', `${r.indicator.name} v${r.indicator.version} is a draft until approved.`, 'ok'); render();
  }
});
