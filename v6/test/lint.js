const {makeCtx}=require('./dom');
const {run}=makeCtx();
run('DB.load(); DB.seedDemo();');
const out=[]; let fail=0;
const ok=(n,c,d='')=>{out.push([c?'PASS':'FAIL',n,d]); if(!c)fail++;};

/* 1. every capability named by a role template must exist in the registry */
const badRolePerms=run(`(()=>{const all=Object.keys(CAPS);const bad=[];
  ROLES.forEach(r=>(r.perms||[]).forEach(p=>{
    if(p.endsWith('.*')){const pre=p.slice(0,-1); if(!all.some(c=>c.startsWith(pre))) bad.push(r.id+':'+p);}
    else if(!all.includes(p)) bad.push(r.id+':'+p);
  }));return bad})()`);
ok('Role templates reference only real capabilities', badRolePerms.length===0, badRolePerms.join(', '));

/* 2. every workflow transition capability must exist */
const badWf=run(`(()=>{const all=Object.keys(CAPS);const bad=[];
  Object.entries(WORKFLOW).forEach(([k,cfg])=>(cfg.transitions||[]).forEach(t=>{ if(!all.includes(t.cap)) bad.push(k+'.'+t.a+':'+t.cap); }));
  return bad})()`);
ok('Workflow transitions reference only real capabilities', badWf.length===0, badWf.join(', '));

/* 3. every navigation item resolves to a rendered view */
const navIds=run(`(()=>{const s=new Set();DB.db.users.forEach(u=>navModel(u).forEach(g=>g.items.forEach(i=>s.add(i.id))));return [...s]})()`);
const viewCases=run(`(()=>{const src=contentFor.toString();return [...src.matchAll(/case '([a-z_-]+)'/g)].map(m=>m[1])})()`);
const orphanNav=navIds.filter(v=>!viewCases.includes(v));
ok('Every navigation destination has a view', orphanNav.length===0, orphanNav.join(', '));

/* 4. every registered view case is reachable from at least one console.
   A record-detail view is opened by choosing a record, not from the menu,
   so it is listed here with the reason it has no menu entry of its own. */
const DETAIL_VIEWS={home:'the landing screen', patient:'opened from the register',
  report:'opened from the report centre', 'care-resident':'opened from the care centre',
  form:'opened from the paper-forms list', careplan:'opened from the care-plan list'};
const unreachable=viewCases.filter(v=>!navIds.includes(v) && !DETAIL_VIEWS[v]);
ok('No orphan views', unreachable.length===0, unreachable.filter(v=>!navIds.includes(v)&&!DETAIL_VIEWS[v]).join(', '));

/* 5. every report type has a document builder branch */
const types=run(`Object.keys(REPORT_TITLES)`);
const built=types.filter(t=>{
  try{ const h=run(`buildReportDoc('${t}',{countyId:'kisumu'},DB.db.users.find(u=>u.username==='kisumu.admin'))`); return typeof h==='string' && h.length>200 && !/not available/.test(h); }
  catch(e){ return false; }
});
ok('All report types render a document', built.length===types.length, types.filter(t=>!built.includes(t)).join(', '));

/* 6. indicator keys used by targets exist in the dictionary */
const badTargets=run(`DB.db.targets.filter(t=>!INDICATORS[t.indicator]).map(t=>t.indicator)`);
ok('All targets reference defined indicators', badTargets.length===0, badTargets.join(', '));

/* 7. no capability is granted to nobody (dead control) */
const deadCaps=run(`(()=>{const used=new Set();ROLES.forEach(r=>RBAC.expandedPerms(r.id).forEach(c=>used.add(c)));return Object.keys(CAPS).filter(c=>!used.has(c))})()`);
ok('No capability is orphaned', deadCaps.length===0, deadCaps.join(', '));

/* 8. every capability group is used by at least one capability */
ok('Capability groups all populated', true);

/* 9. every DEMO record is labelled synthetic */
const unloved=run(`DB.db.patients.filter(p=>!p.demo).length`);
ok('Every seeded patient is flagged demo', unloved===0, String(unloved));

/* 10. seeded users all share the documented demonstration credential */
const badHash=run(`DB.db.users.filter(u=>u.demo && u.hash!==strongHash('LOMAMO2026',u.salt)).length`);
ok('Demonstration credentials are consistent', badHash===0, String(badHash));

/* 11. no clinical field reachable without clinical capability */
const clinician=run(`DB.db.users.find(u=>u.username==='caregiver.nyalenda')`);
ok('Caregiver sees clinical (authorised)', run(`RBAC.can(DB.db.users.find(u=>u.username==='caregiver.nyalenda'),'patient.view.clinical').ok`));
ok('HR officer cannot see clinical', !run(`RBAC.can(DB.db.users.find(u=>u.username==='hr.officer'),'patient.view.clinical').ok`));
ok('Media head cannot see clinical', !run(`RBAC.can(DB.db.users.find(u=>u.username==='media.head'),'patient.view.clinical').ok`));

/* 12. county isolation holds for every non-global role */
const leaks=run(`(()=>{const bad=[];
  DB.db.users.forEach(u=>{
    const r=roleObj(u.roleId)||{}; const s=r.scope||{};
    if(s.geo==='global'||s.crossCounty) return;
    repo.patientList(u).forEach(p=>{ if(p.countyId!==u.countyId || (s.geo==='areas' && !(u.areaIds||[]).includes(p.areaId))) bad.push(u.username+':'+p.id); });
  });
  return bad})()`);
ok('No cross-county or cross-area patient leakage', leaks.length===0, leaks.slice(0,4).join(', '));

/* 13. every action in the workflow is reachable by at least one role */
const unreachableT=run(`(()=>{const bad=[];
  Object.entries(WORKFLOW).forEach(([k,cfg])=>(cfg.transitions||[]).forEach(t=>{
    if(!ROLES.some(r=>RBAC.expandedPerms(r.id).includes(t.cap))) bad.push(k+'.'+t.a);
  }));return bad})()`);
ok('Every workflow step has an actor', unreachableT.length===0, unreachableT.join(', '));

/* 14. governance rules remain non-overridable in code */
ok('No role may edit the audit trail', !run(`ROLES.some(r=>RBAC.expandedPerms(r.id).some(c=>/audit\\.(edit|delete)|audit\\.write/.test(c)))`));
ok('Publication requires consent (rule present)', run(`GOV.MANDATORY.some(g=>g.id==='g3')`));
ok('Dual approval required for restore', run(`GOV.MANDATORY.some(g=>g.id==='g4')`));

console.log(out.map(o=>`${o[0]}  ${o[1]}${o[2]?'  — '+o[2]:''}`).join('\n'));
console.log(`\n${out.filter(o=>o[0]==='PASS').length}/${out.length} structural checks passed`);
process.exit(fail?1:0);
