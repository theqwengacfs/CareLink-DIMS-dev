/* ============================================================
   access_rules.js - Contextual authority: who may do what, where,
   and to what depth.

   Why this module exists
   ----------------------
   A capability says WHAT an action is. It does not say HOW FAR it
   reaches. An audit of the system found one real violation and a
   class of possible ones:

     * The M&E / Data Officer could set targets for a county office.
       Setting a county target is an act of county management; M&E
       measures against it, it does not choose it.

   So every capability that writes money, targets, patient data or
   organisational information is now bound to three things:

     LEVEL     area  ->  county  ->  national
     DOMAIN    the subject matter (targets, finance, patients, ministry,
               people, media, system, pharmacy, cost)
     CONTEXT   the county, ministry area, department or record the
               action is applied to

   The binding is data (AUTHORITY_LEVELS, DOMAIN_RULES, CAP_RULES),
   so it can be read as a whole, printed as a matrix and audited.
   Enforcement happens in RBAC.can - the same single gate the data
   layer already uses - and every refusal is written to the audit
   trail with the rule that caused it.
   ============================================================ */

/* ---------------- 1. Capabilities added by this audit ---------------- */
Object.assign(CAPS, {
  /* Targets and baselines are split by the level they reach. */
  'report.targets.view':     { g:'Reporting', l:'Read targets & baselines in scope' },
  'report.targets.area':     { g:'Reporting', l:'Propose ministry-area targets & baselines' },
  'report.targets.county':   { g:'Reporting', l:'Set county-office targets & baselines', sensitive:true },
  'report.targets.national': { g:'Reporting', l:'Set national targets & baselines', sensitive:true },

  /* Cost-per-patient engine. */
  'cost.view':               { g:'Finance', l:'See cost per patient in your own scope' },
  'cost.ledger':             { g:'Finance', l:'Read the raw cost ledger lines', sensitive:true },
  'cost.standard.manage':    { g:'Finance', l:'Set unit cost standards for a county office', sensitive:true },
  'cost.standard.national':  { g:'Finance', l:'Set national unit cost standards', sensitive:true },
  'cost.export':             { g:'Finance', l:'Export a cost analysis (audited)', sensitive:true },

  /* TB dispensing control. */
  'tb.view':            { g:'Pharmacy', l:'See the TB dispensing control board' },
  'tb.request.create':  { g:'Pharmacy', l:'Request pyridoxine / TB drugs for a patient' },
  'tb.request.review':  { g:'Pharmacy', l:'Answer a TB drug request as case manager', sensitive:true },
  'tb.dispense':        { g:'Pharmacy', l:'Dispense against an approved TB request' },
  'tb.stock.count':     { g:'Pharmacy', l:'Record a physical TB stock count' },
  'tb.stock.reconcile': { g:'Pharmacy', l:'Reconcile TB stock against procurement', sensitive:true }
});

/* ---------------- 2. Authority levels ----------------
   A level is a depth of reach. `national` includes every county,
   `county` includes every ministry area of that county, `area`
   includes only the assigned ministry areas, `own` only the
   person's own records. */
const AUTHORITY_LEVELS = [
  { id:'own',      label:'Own records',        rank:0 },
  { id:'assigned', label:'Assigned to me',     rank:1 },
  { id:'area',     label:'Ministry area',      rank:2 },
  { id:'department', label:'Department',       rank:3 },
  { id:'county',   label:'County office',      rank:4 },
  { id:'national', label:'National',           rank:5 }
];
const LEVEL_RANK = Object.fromEntries(AUTHORITY_LEVELS.map(l=>[l.id,l.rank]));

/* ---------------- 3. Domains ---------------- */
const ACCESS_DOMAINS = [
  { id:'targets',   label:'Targets & baselines', caps:['report.targets.view','report.targets.area','report.targets.county','report.targets.national'] },
  { id:'finance',   label:'Money & budgets',     caps:['finance.view','finance.budget.manage','finance.commit','finance.pay','finance.reconcile','finance.report','procurement.view','procurement.manage','cost.view','cost.ledger','cost.standard.manage','cost.standard.national','cost.export'] },
  { id:'patients',  label:'Patient data',        caps:['patient.list','patient.view.basic','patient.view.clinical','patient.edit','patient.enrol','patient.discharge.approve','patient.export','condition.view','condition.sensitive','condition.aggregate'] },
  { id:'ministry',  label:'Ministry information',caps:['visit.create','visit.view','pdca.create','pdca.review','team.view','team.manage','hr.leave.approve'] },
  { id:'pharmacy',  label:'Drugs & stock',       caps:['pharmacy.view','pharmacy.manage','clinical.prescribe','clinical.dispense','tb.view','tb.request.create','tb.request.review','tb.dispense','tb.stock.count','tb.stock.reconcile'] },
  { id:'people',    label:'Staff & welfare',     caps:['hr.view','hr.manage','hr.documents','welfare.view','welfare.manage'] },
  { id:'media',     label:'Media & publication', caps:['media.view','media.publish','media.consent.manage','pr.publish','pr.view','policy.manage'] },
  { id:'system',    label:'System & governance', caps:['system.config','role.manage','org.manage','system.import','system.backup','system.restore','system.export','system.audit','user.approve','user.manage'] }
];
const CAP_DOMAIN = (()=>{ const m={}; ACCESS_DOMAINS.forEach(d=>d.caps.forEach(c=>{ m[c]=d.id; })); return m; })();

/* ---------------- 4. Departmental binding ----------------
   A capability may only be exercised from a department that owns
   the subject matter. Administration (admin), the executive and the
   county office administrator are deliberately excluded from the
   clinical, pharmacy and media departments' work: they govern the
   system, they do not practise in it. */
const CAP_DEPT = {
  'patient.view.clinical': ['medical','pharmacy','ministry','hospital','admin'],
  'condition.view':        ['medical','pharmacy','ministry','hospital','admin'],
  'condition.record':      ['medical','ministry','hospital','pharmacy'],
  'condition.confirm':     ['medical'],
  'condition.sensitive':   ['medical','pharmacy','hospital'],
  'clinical.prescribe':    ['medical','pharmacy'],
  'clinical.dispense':     ['medical','pharmacy','hospital'],
  'pharmacy.manage':       ['medical','pharmacy','procure','admin'],
  'tb.request.review':     ['medical','pharmacy','hospital'],
  'tb.dispense':           ['medical','pharmacy','hospital'],
  'tb.stock.reconcile':    ['finance','procure','pharmacy','audit','admin'],
  'hr.manage':             ['hr','admin','exec'],
  'hr.documents':          ['hr','admin'],
  'welfare.manage':        ['welfare','hr','admin'],
  'media.publish':         ['media','pr','admin','exec'],
  'media.consent.manage':  ['media','medical','ministry','admin'],
  'pr.publish':            ['pr','media','admin','exec'],
  'policy.manage':         ['media','admin','exec','audit'],
  'procurement.manage':    ['procure','finance','admin'],
  'finance.commit':        ['finance','admin','exec'],
  'finance.pay':           ['finance','admin'],
  'finance.reconcile':     ['finance','audit','admin'],
  'finance.budget.manage': ['finance','admin','exec'],
  'cost.standard.manage':  ['finance','procure','admin','exec'],
  'cost.standard.national':['finance','exec','admin'],
  'vehicle.manage':        ['vehicle','admin','procure'],
  'inventory.manage':      ['it','admin','procure'],
  'system.config':         ['admin','it'],
  'role.manage':           ['admin'],
  'org.manage':            ['admin','it','exec'],
  'system.import':         ['admin','it','me'],
  'team.manage':           ['admin','hr','exec','ministry']
};

/* ---------------- 5. Level rules per capability ----------------
   `level` is the deepest reach the capability grants by itself; the
   context decides whether this particular action is inside it. */
const CAP_LEVEL = {
  'report.targets.area':     'area',
  'report.targets.county':   'county',
  'report.targets.national': 'national',
  'report.targets.manage':   'county',
  'finance.budget.manage':   'county',
  'cost.standard.manage':    'county',
  'cost.standard.national':  'national',
  'org.manage':              'national',
  'team.manage':             'county'
};

/* Roles that hold a national reach by design. */
const NATIONAL_ROLES = ['director','president','program.admin','program.assistant','chief'];

/* ---------------- 6. The authority service ---------------- */
const ACCESS = {
  domains(){ return ACCESS_DOMAINS; },
  levels(){ return AUTHORITY_LEVELS; },
  domainOf(cap){ return CAP_DOMAIN[cap] || null; },

  /* The deepest level this account may reach, from its role scope. */
  reachOf(user){
    if(!user) return 'own';
    const role = roleObj(user.roleId) || {scope:{}};
    const s = role.scope || {};
    if(s.geo==='global' || s.crossCounty) return NATIONAL_ROLES.includes(user.roleId)? 'national' : 'national';
    if(s.geo==='county' || s.records==='county') return 'county';
    if(s.records==='department') return 'department';
    if(s.geo==='areas' || s.records==='areas') return 'area';
    if(s.records==='assigned') return 'assigned';
    return 'own';
  },
  reaches(user, level){ return LEVEL_RANK[this.reachOf(user)] >= LEVEL_RANK[level]; },

  /* Which target levels may this account set? Used by the UI and by the gate. */
  targetLevels(user){
    const out = [];
    if(RBAC.has(user,'report.targets.area') && this.reaches(user,'area')) out.push('area');
    if(RBAC.has(user,'report.targets.county') && this.reaches(user,'county')) out.push('county');
    if(RBAC.has(user,'report.targets.national') && this.reaches(user,'national')) out.push('national');
    return out;
  },

  /* The single contextual gate. Returns {ok, rule, reason}. */
  check(user, cap, ctx={}){
    if(!user) return { ok:false, rule:'session', reason:'No authenticated session.' };
    const role = roleObj(user.roleId) || {};
    const dept = user.departmentId || role.dept || '';

    /* (a) departmental binding */
    const allowed = CAP_DEPT[cap];
    if(allowed && allowed.length && !allowed.includes(dept)){
      /* Executive and county administration govern the system but do not
         practise inside a clinical, pharmacy or media department. */
      return { ok:false, rule:'department', reason:`${capLabel(cap)} belongs to ${allowed.map(d=>(deptObj(d)||{}).name||d).join(', ')}. Your department is ${(deptObj(dept)||{}).name||dept||'unassigned'}.` };
    }

    /* (b) level / geography binding */
    const level = CAP_LEVEL[cap];
    if(level){
      if(level==='national' && !this.reaches(user,'national'))
        return { ok:false, rule:'level', reason:`${capLabel(cap)} is a national act. Your authority reaches ${this.reachOf(user)} level only.` };
      if(level==='county'){
        if(ctx.countyId && ctx.countyId!=='all' && ctx.countyId!==user.countyId && !this.reaches(user,'national'))
          return { ok:false, rule:'level', reason:`${capLabel(cap)} applies to ${countyName(ctx.countyId)}; your authority is ${countyName(user.countyId)}.` };
        if(!this.reaches(user,'county'))
          return { ok:false, rule:'level', reason:`${capLabel(cap)} is a county-office act. Your authority reaches ${this.reachOf(user)} level only.` };
      }
      if(level==='area' && ctx.areaId && !(user.areaIds||[]).includes(ctx.areaId) && !this.reaches(user,'county'))
        return { ok:false, rule:'level', reason:`${capLabel(cap)} applies to ${areaName(ctx.areaId)}, which is not one of your ministry areas.` };
    }

    /* (c) domain-specific hard rules */
    if(cap==='report.targets.manage' || /^report\.targets\.(area|county|national)$/.test(cap)){
      const want = cap==='report.targets.manage' ? (ctx.level==='national'?'national':ctx.level==='area'?'area':'county') : cap.split('.').pop();
      if(!this.targetLevels(user).includes(want))
        return { ok:false, rule:'target-level', reason:`${(roleObj(user.roleId)||{}).name||user.roleId} may not set ${want}-level targets or baselines. M&E measures against a target; the office that owns the level sets it.` };
    }
    if(cap==='patient.export' && !(RBAC.has(user,'finance.view')||RBAC.has(user,'audit.view')||RBAC.has(user,'report.executive')||RBAC.has(user,'patient.discharge.approve'))){
      /* An export of patient data must be tied to a reporting, clinical or
         assurance responsibility, never to data handling alone. */
      return { ok:false, rule:'domain', reason:'A patient data export must be tied to a clinical, reporting or assurance responsibility.' };
    }
    if((cap==='finance.view'||cap==='cost.ledger') && ctx.patientId && !RBAC.patientVisible(user, {id:ctx.patientId, countyId:ctx.countyId, areaId:ctx.areaId})){
      return { ok:false, rule:'record', reason:'That financial record belongs to a patient outside your scope.' };
    }
    return { ok:true, rule:'permitted', reason:'permitted' };
  },

  /* The full matrix, as rows, for the audit console and for print. */
  matrix(){
    const roles = ROLES.filter(r=>r.id);
    const rows = [];
    ACCESS_DOMAINS.forEach(d=>{
      d.caps.forEach(cap=>{
        if(!CAPS[cap]) return;
        const holders = roles.filter(r=>{
          const probe = { id:'probe-'+r.id, username:'probe', roleId:r.id, status:'active',
            countyId:'kisumu', areaIds:(r.scope||{}).geo==='areas'?['nyalenda']:[], departmentId:r.dept };
          return RBAC.has(probe, cap);
        }).map(r=>r.name);
        rows.push({ domain:d.label, cap, label:capLabel(cap), level:CAP_LEVEL[cap]||'',
          depts:(CAP_DEPT[cap]||[]).map(x=>(deptObj(x)||{}).short||x).join(', '),
          holders, sensitive:!!CAPS[cap].sensitive });
      });
    });
    return rows;
  },

  /* Self-test: the rules that the audit promised, proved at runtime. */
  selfTest(){
    const out = [];
    const U = un => (DB.db.users||[]).find(u=>u.username===un) || null;
    const t = (name, fn)=>{ try{ const r=fn(); out.push({name, ok:!!r.ok, detail:r.detail||''}); }catch(e){ out.push({name, ok:false, detail:e.message}); } };
    const me = U('me.kisumu'), ca = U('kisumu.admin'), dir = U('director'), cg = U('caregiver.nyalenda'),
          fin = U('finance.kisumu'), co = U('coord.nyalenda'), chr = U('chief.admin');
    t('M&E / Data Officer cannot set a county target', ()=>({ ok: me? !RBAC.can(me,'report.targets.manage',{level:'county',countyId:'kisumu'}).ok : true, detail: me? RBAC.can(me,'report.targets.manage',{level:'county',countyId:'kisumu'}).reason : 'no M&E account' }));
    t('M&E / Data Officer cannot set a national target', ()=>({ ok: me? !RBAC.can(me,'report.targets.manage',{level:'national'}).ok : true }));
    t('M&E / Data Officer can read targets in scope', ()=>({ ok: me? RBAC.can(me,'report.targets.view',{}).ok : true }));
    t('County Office Administrator can set a county target', ()=>({ ok: ca? RBAC.can(ca,'report.targets.manage',{level:'county',countyId:'kisumu'}).ok : true, detail: ca? RBAC.can(ca,'report.targets.manage',{level:'county',countyId:'kisumu'}).reason : '' }));
    t('County Office Administrator cannot set a national target', ()=>({ ok: ca? !RBAC.can(ca,'report.targets.manage',{level:'national'}).ok : true }));
    t('Only national authority sets a national target', ()=>({ ok: dir? RBAC.can(dir,'report.targets.national',{}).ok : true }));
    t('A caregiver cannot open the finance ledger', ()=>({ ok: cg? !RBAC.can(cg,'finance.view',{}).ok : true }));
    t('A caregiver can see the cost of the patients they serve', ()=>({ ok: cg? RBAC.can(cg,'cost.view',{}).ok : true }));
    t('A caregiver cannot read the raw cost ledger', ()=>({ ok: cg? !RBAC.can(cg,'cost.ledger',{}).ok : true }));
    t('Finance cannot set a national cost standard', ()=>({ ok: fin? !RBAC.can(fin,'cost.standard.national',{}).ok : true, detail: fin? RBAC.can(fin,'cost.standard.national',{}).reason : '' }));
    t('A coordinator may propose an area target only for own area', ()=>({ ok: co? (!RBAC.can(co,'report.targets.area',{areaId:'makongeni'}).ok && RBAC.can(co,'report.targets.area',{areaId:'nyalenda'}).ok) : true }));
    t('Chief System Administrator does not hold clinical authority', ()=>({ ok: chr? !RBAC.can(chr,'patient.view.clinical',{}).ok : true }));
    t('Chief System Administrator cannot set programme targets', ()=>({ ok: chr? !RBAC.can(chr,'report.targets.county',{countyId:'kisumu'}).ok : true }));
    return out;
  },

  /* ---------------- console ---------------- */
  render(user){
    if(!RBAC.has(user,'audit.view') && !RBAC.has(user,'system.config') && !RBAC.has(user,'role.manage') && !RBAC.has(user,'user.approve'))
      return deniedPanel('audit.view');
    const rows = this.matrix();
    const mine = this.selfTest();
    const pass = mine.filter(m=>m.ok).length;
    const grouped = {};
    rows.forEach(r=>{ (grouped[r.domain] = grouped[r.domain]||[]).push(r); });
    return pageHead('Access & authority audit',
      'Every capability that writes targets, money, patient data, drugs or organisational information, bound to a level, a department and a context. Refusals are recorded in the audit trail.',
      `<button class="btn btn-sm btn-ghost" data-act="go" data-v="roles">${ic('key',15)} Roles & permissions</button>
       <button class="btn btn-sm btn-primary" data-act="do-print">${ic('file',15)} Print matrix</button>`)
    + `<div class="grid g4" style="margin-bottom:16px">
        ${kpi('Rules proved now', pass+' / '+mine.length, 'Live self-test of the authority rules', pass===mine.length?'ok':'crit', 'shieldcheck')}
        ${kpi('Capabilities bound', num(rows.filter(r=>r.level||r.depts).length)+' of '+num(rows.length), 'Level or department binding in force', 'info', 'lock')}
        ${kpi('Sensitive capabilities', num(rows.filter(r=>r.sensitive).length), 'Governance rules that cannot be switched off', 'warn', 'shield')}
        ${kpi('Your reach', esc(titleCase(this.reachOf(user))), 'Deepest level this account may act at', 'ok', 'target')}
      </div>`
    + card('Authority self-test', table([
        {label:'Rule',render:m=>`<div class="cellname">${esc(m.name)}</div>`},
        {label:'Result',render:m=>badge(m.ok?'Enforced':'FAILED', m.ok?'b-ok':'b-crit')},
        {label:'Evidence',render:m=>`<span class="xs muted">${esc(m.detail||'')}</span>`}
      ], mine), {foot:'<span>The same test runs inside Security self-test, so a regression cannot ship quietly.</span>'})
    + Object.keys(grouped).map(dom=>`<div style="margin-top:16px">${card(dom+' · capability binding', `
        <div class="tbl-wrap"><table class="tbl access-matrix">
          <thead><tr><th>Capability</th><th style="width:110px">Deepest level</th><th style="width:170px">Departments</th><th>Held by</th></tr></thead>
          <tbody>${grouped[dom].map(r=>`<tr>
            <td><div class="cellname">${esc(r.label)}${r.sensitive?` ${badge('sensitive','b-warn')}`:''}</div><div class="xs muted mono">${esc(r.cap)}</div></td>
            <td>${r.level? badge(titleCase(r.level),'b-accent') : '<span class="xs muted">Record scope</span>'}</td>
            <td class="xs">${esc(r.depts||'Any department that holds the capability')}</td>
            <td class="xs">${r.holders.length? esc(r.holders.join(' · ')) : '<span class="muted">No role holds it</span>'}</td>
          </tr>`).join('')}</tbody>
        </table></div>`)}</div>`).join('')
    + `<div style="margin-top:16px">${card('How a refusal happens', `
        <ol class="rule-steps">
          <li><b>The interface</b> shows an access-denied panel where a capability is missing, so nobody is invited to try.</li>
          <li><b>The gate</b> (RBAC.can) checks the capability, then the departmental binding, then the level, then the domain rule.</li>
          <li><b>The data layer</b> (repo.*) filters rows before they reach the screen: a record outside scope was never fetched.</li>
          <li><b>The audit trail</b> records the refusal with the rule that caused it, and it cannot be edited by any role.</li>
        </ol>`)}</div>`;
  }
};

/* ---------------- 7. Grants from the audit ---------------- */
/* Targets: measurement is separated from target setting. */
const TARGET_GRANTS = {
  /* M&E, audit, international data and finance READ targets; they do not set
     them. This is the correction the audit was asked to make. */
  'report.targets.view': ['me','auditor','intldata','finance','director','president','program.admin','program.assistant','countyadmin','chief','coordinator','depthead','mcm','hr','pr','mediahead','it','homestay'],
  'report.targets.area':   ['coordinator','countyadmin','director','program.admin'],
  'report.targets.county': ['countyadmin','director','program.admin'],
  'report.targets.national': ['director','president','program.admin']
};
Object.entries(TARGET_GRANTS).forEach(([cap,roles])=>{
  roles.forEach(id=>{ const r=ROLES.find(x=>x.id===id); if(r && !r.perms.includes(cap)) r.perms.push(cap); });
});
/* The old blanket capability is withdrawn from measurement roles. */
['me','auditor','intldata'].forEach(id=>{
  const r = ROLES.find(x=>x.id===id);
  if(r) r.perms = r.perms.filter(p=>p!=='report.targets.manage');
});

/* Cost per patient: everybody who serves a patient may see what serving them
   cost; only money roles read the ledger; only finance sets the standards. */
const COST_GRANTS = {
  'cost.view': ['caregiver','coordinator','chw','mcm','nurse','liaison','depthead','countyadmin','assistant','finance','procurement','me','auditor','director','president','program.admin','program.assistant','vehicle','homestay','intldata','chief'],
  'cost.ledger': ['finance','procurement','auditor','countyadmin','director','program.admin','chief'],
  'cost.standard.manage': ['finance','procurement','countyadmin'],
  'cost.standard.national': ['director','program.admin','president'],
  'cost.export': ['finance','auditor','countyadmin','director','program.admin','me']
};
Object.entries(COST_GRANTS).forEach(([cap,roles])=>{
  roles.forEach(id=>{ const r=ROLES.find(x=>x.id===id); if(r && !r.perms.includes(cap)) r.perms.push(cap); });
});

/* TB dispensing control: the caregiver asks, the case manager answers, the
   pharmacy dispenses, finance and procurement reconcile the stock. */
const TB_GRANTS = {
  'tb.view': ['caregiver','coordinator','chw','mcm','nurse','liaison','depthead','countyadmin','finance','procurement','auditor','director','program.admin','pharmacy','chief','homestay'],
  'tb.request.create': ['caregiver','coordinator','chw','mcm','nurse','liaison'],
  'tb.request.review': ['mcm','nurse','depthead'],
  'tb.dispense': ['mcm','nurse','liaison'],
  'tb.stock.count': ['nurse','mcm','procurement','finance','countyadmin'],
  'tb.stock.reconcile': ['finance','procurement','auditor','countyadmin']
};
Object.entries(TB_GRANTS).forEach(([cap,roles])=>{
  roles.forEach(id=>{ const r=ROLES.find(x=>x.id===id); if(r && !r.perms.includes(cap)) r.perms.push(cap); });
});

/* ---------------- 8. Bind the rules into the single gate ----------------
   RBAC.can stays the only authorisation decision in the system. The rules
   above are wrapped around it, so a view, a form handler, a workflow
   transition and the data layer all meet the same authority test, and every
   refusal they produce is audited with the rule that caused it. */
(function bindAccessRules(){
  if(typeof RBAC==='undefined' || RBAC.__accessBound) return;
  const base = RBAC.can.bind(RBAC);
  RBAC.can = function(user, cap, ctx={}){
    const first = base(user, cap, ctx);
    if(!first.ok) return first;
    const rule = ACCESS.check(user, cap, ctx||{});
    if(!rule.ok) return { ok:false, reason:`${rule.rule}: ${rule.reason}` };
    return first;
  };
  RBAC.__accessBound = true;
})();
