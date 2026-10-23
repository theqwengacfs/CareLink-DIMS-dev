const {makeCtx}=require('./dom');
const {run}=makeCtx();
run('DB.load(); DB.seedDemo();');
const out=[]; let fail=0;
const ok=(n,c,d='')=>{out.push([c?'PASS':'FAIL',n,d]); if(!c)fail++;};

const users=run(`DB.db.users.map(u=>u.username)`);
let breach=[];
for(const u of users){
  run(`AUTH.login('${u}','LOMAMO2026')`);
  const r=run(`(()=>{
    const user=AUTH.user, role=roleObj(user.roleId)||{}, sc=role.scope||{};
    const global = sc.geo==='global'||sc.crossCounty;
    const bad=[];
    const inScope=(row)=>{
      if(global) return true;
      if(sc.records==='areas') return (user.areaIds||[]).includes(row.areaId);
      if(sc.records==='assigned') return true; // filtered to assignments already
      return row.countyId===user.countyId;
    };
    repo.patientList(user).forEach(p=>{ if(!inScope(p)) bad.push('patient:'+p.id); });
    repo.requests(user).forEach(x=>{
      if(!global && sc.records!=='assigned' && sc.records!=='areas' && x.countyId!==user.countyId) bad.push('request:'+x.id);
      if(sc.records==='assigned' && x.assignedTo!==user.id) bad.push('request-not-mine:'+x.id);
      if(sc.records==='areas' && !(user.areaIds||[]).includes(x.areaId)) bad.push('request-area:'+x.id);
    });
    if(RBAC.has(user,'finance.view')) repo.transactions(user).forEach(t=>{ if(!global && t.countyId!==user.countyId) bad.push('tx:'+t.id); });
    if(RBAC.has(user,'finance.budget.manage')||RBAC.has(user,'finance.view')) repo.budget(user).forEach(b=>{ if(!global && b.countyId!==user.countyId) bad.push('budget:'+b.id); });
    const visible=new Set(repo.patientList(user).map(p=>p.id));
    repo.documents(user).forEach(d=>{ if(d.patientId && !visible.has(d.patientId)) bad.push('document:'+d.id); });
    repo.targets(user).forEach(t=>{ if(!global && t.countyId!==user.countyId) bad.push('target:'+t.id); });
    repo.vehicles(user).forEach(v=>{ if(!global && v.countyId!==user.countyId) bad.push('vehicle:'+v.id); });
    repo.trips(user).forEach(t=>{ if(!global && t.countyId!==user.countyId) bad.push('trip:'+t.id); });
    return bad;
  })()`);
  if(r.length) breach.push(u+' → '+[...new Set(r)].slice(0,4).join(', '));
}
ok('No county-scoped account receives another county\'s rows', breach.length===0, breach.join(' | '));

// liaison sees only assignments made to them
const liaisonRows=run(`(()=>{AUTH.logout();AUTH.login('liaison.kisumu','LOMAMO2026');
  return repo.requests(AUTH.user).filter(r=>r.assignedTo!=='u-lia-ksm').length})()`);
ok('Liaison sees only their own assignments', liaisonRows===0);

// caregiver sees only their ministry area
const cgAreas=run(`(()=>{AUTH.logout();AUTH.login('caregiver.nyalenda','LOMAMO2026');
  return [...new Set(repo.patientList(AUTH.user).map(p=>p.areaId))]})()`);
ok('Caregiver restricted to one ministry area', cgAreas.length===1 && cgAreas[0]==='nyalenda', cgAreas.join(','));

// county admin cannot read another county's budget or fleet
const adminLeak=run(`(()=>{AUTH.logout();AUTH.login('kisumu.admin','LOMAMO2026');
  return {bad:repo.budget(AUTH.user).filter(b=>b.countyId!=='kisumu').length, veh:repo.vehicles(AUTH.user).filter(v=>v.countyId!=='kisumu').length}})()`);
ok('County administrator budget isolated', adminLeak.bad===0);
ok('County administrator fleet isolated', adminLeak.veh===0);

// Homa Bay officer sees Homa Bay only
const hby=run(`(()=>{AUTH.logout();AUTH.login('homabay.admin','LOMAMO2026');
  const b=repo.budget(AUTH.user); return {n:b.length, allHby:b.every(x=>x.countyId==='homabay')}})()`);
ok('Homa Bay budget is fully isolated', hby.allHby && hby.n>0, JSON.stringify(hby));

console.log(out.map(o=>`${o[0]}  ${o[1]}${o[2]?'  — '+o[2]:''}`).join('\n'));
console.log(`\n${out.filter(o=>o[0]==='PASS').length}/${out.length} scoping invariants hold`);
process.exit(fail?1:0);
