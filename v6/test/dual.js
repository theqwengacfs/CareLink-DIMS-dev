const {makeCtx}=require('./dom');
const {run}=makeCtx();
run('DB.load(); DB.seedDemo();');
const out=[]; let fail=0;
const ok=(n,c,d='')=>{out.push([c?'PASS':'FAIL',n,d]); if(!c)fail++;};
const as=u=>run(`AUTH.logout();AUTH.login('${u}','LOMAMO2026')`);

as('chief.admin');
const a=run(`APPROVALS.request('full database export',AUTH.user,{})`);
ok('Chief can request a full export', !!a && a.required===2);

ok('Chief cannot approve their own request', run(`APPROVALS.approve('${a.id}',AUTH.user).ok===false`));

as('caregiver.nyalenda');
const cg=run(`APPROVALS.approve('${a.id}',AUTH.user)`);
ok('Caregiver cannot countersign an export', cg.ok===false, cg.msg);
ok('Refused countersignature is audited', run(`DB.db.audit.some(x=>x.action==='access.denied'&&x.entityId==='${a.id}')`));

as('kisumu.admin');
ok('County administrator cannot countersign a full export', run(`APPROVALS.approve('${a.id}',AUTH.user).ok===false`));

as('media.head');
const mh=run(`APPROVALS.approve('${a.id}',AUTH.user)`);
ok('Media & Governance Head can countersign', mh.ok===true, mh.msg||'');
ok('Two independent signatures activate the operation', run(`APPROVALS.canExecute(DB.db.approvals.find(x=>x.id==='${a.id}'))`));

as('media.head');
const r2=run(`APPROVALS.request('database restore',AUTH.user,{})`);
ok('Media Head can request a restore', !!r2);
as('chief.admin');
ok('Chief can countersign a restore', run(`APPROVALS.approve('${r2.id}',AUTH.user).ok===true`));
ok('Restore reaches its approval threshold', run(`APPROVALS.canExecute(DB.db.approvals.find(x=>x.id==='${r2.id}'))`));

console.log(out.map(o=>`${o[0]}  ${o[1]}${o[2]?'  — '+o[2]:''}`).join('\n'));
console.log(`\n${out.filter(o=>o[0]==='PASS').length}/${out.length} dual-control checks passed`);
process.exit(fail?1:0);
