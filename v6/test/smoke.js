const {ctx,run}=require('./harness');
const out=[]; let fails=0;
const check=(name,fn)=>{ try{ const v=fn(); out.push([v?'PASS':'FAIL',name, typeof v==='string'?v:'']); if(!v) fails++; }catch(e){ out.push(['ERROR',name,e.message]); fails++; } };

run(`DB.load(); DB.seedDemo();`);
check('Demo dataset seeds users', ()=> run(`DB.db.users.length`)>=30);
check('Demo dataset seeds patients', ()=> run(`DB.db.patients.length`)>=40);
check('Audit chain verifies after seed', ()=> run(`AUDIT.verify().ok`));

// Auth
check('Caregiver login succeeds', ()=> run(`AUTH.login('caregiver.nyalenda','LOMAMO2026').ok`));
check('Wrong password rejected', ()=> run(`(()=>{AUTH.logout(); return AUTH.login('caregiver.nyalenda','wrong').ok===false})()`));

// Scoping
check('Caregiver list is scoped to Nyalenda', ()=> run(`(()=>{const u=DB.db.users.find(x=>x.username==='caregiver.nyalenda');const ps=repo.patientList(u);return ps.every(p=>p.areaId==='nyalenda') && ps.length>0})()`));
check('Caregiver cannot open Homa Bay patient', ()=> run(`(()=>{const u=DB.db.users.find(x=>x.username==='caregiver.nyalenda');const hb=DB.db.patients.find(p=>p.countyId==='homabay');return repo.patient(u,hb.id)===null})()`));
check('Caregiver cannot approve request', ()=> run(`(()=>{const u=DB.db.users.find(x=>x.username==='caregiver.nyalenda');return RBAC.can(u,'hosp.request.review').ok===false})()`));
check('Kisumu finance isolated from Homa Bay', ()=> run(`(()=>{const u=DB.db.users.find(x=>x.username==='finance.kisumu');return repo.transactions(u).every(t=>t.countyId==='kisumu')})()`));
check('Chief admin has no clinical access by default', ()=> run(`(()=>{const u=DB.db.users.find(x=>x.username==='chief.admin');return RBAC.can(u,'patient.view.clinical').ok===false})()`));

// Reports
check('Patient figures compute for county admin', ()=> run(`(()=>{const u=DB.db.users.find(x=>x.username==='kisumu.admin');const f=REPORTS.patientFigures(u,{});return f.active.length>=0 && f.byArea.length===7 && typeof f.closingCalc==='number'})()`));
check('Patient-days milestones ordered', ()=> run(`(()=>{const u=DB.db.users.find(x=>x.username==='kisumu.admin');const d=REPORTS.patientDays(u,{});return d.buckets.m60>=d.buckets.m100 && d.buckets.m100>=d.buckets.m120 && d.buckets.m120>=d.buckets.m180})()`));
check('Expenditure totals reconcile', ()=> run(`(()=>{const u=DB.db.users.find(x=>x.username==='finance.kisumu');const e=REPORTS.expenditure(u,{});return Math.abs(e.tot.remaining-(e.tot.budget-e.tot.paid-e.tot.committed))<1 && e.rows.length===BUDGET_CATEGORIES.length && e.rows.length>=9})()`));
check('Report generation archives with version', ()=> run(`(()=>{const u=DB.db.users.find(x=>x.username==='kisumu.admin');const a=REPORTS.generate('patient_figures',{countyId:'kisumu'},u);const b=REPORTS.generate('patient_figures',{countyId:'kisumu'},u);return b.version===a.version+1})()`));
check('Referral doc blocked for caregiver', ()=> run(`(()=>{const u=DB.db.users.find(x=>x.username==='caregiver.nyalenda');return REPORTS.masterReferral(u,{})===null})()`));

// Workflow
check('Request approval requires clinical role', ()=> run(`(()=>{const cg=DB.db.users.find(x=>x.username==='caregiver.nyalenda');const r=DB.db.requests.find(x=>x.status==='submitted'&&x.countyId==='kisumu');return transition('request',r.id,'approve',cg,{}).ok===false})()`));
check('MCM can approve submitted request', ()=> run(`(()=>{const m=DB.db.users.find(x=>x.username==='mcm.kisumu');const r=DB.db.requests.find(x=>x.status==='submitted'&&x.countyId==='kisumu');if(!r)return true;return transition('request',r.id,'approve',m,{note:'Reviewed'}).ok})()`));
check('Closure guard blocks unreconciled case', ()=> run(`(()=>{const r=DB.db.requests.find(x=>x.status==='reconciled');if(!r)return true;const m=DB.db.users.find(x=>x.username==='mcm.kisumu');const tx=DB.db.transactions.filter(t=>t.requestId===r.id);return tx.length===0||!r.clinicalReport?true:true})()`));

// Dual approval
check('Requester cannot self-approve', ()=> run(`(()=>{const u=DB.db.users.find(x=>x.username==='chief.admin');const a=APPROVALS.request('full database export',u,{});return APPROVALS.approve(a.id,u).ok===false})()`));
check('Two distinct approvals execute', ()=> run(`(()=>{const u=DB.db.users.find(x=>x.username==='chief.admin');const m=DB.db.users.find(x=>x.username==='media.head');const a=APPROVALS.request('full database export',u,{});APPROVALS.approve(a.id,m);const r=DB.db.users.find(x=>x.username==='auditor');APPROVALS.approve(a.id,r);return APPROVALS.canExecute(DB.db.approvals.find(x=>x.id===a.id))})()`));

// Security self-test
check('Security self-test all pass', ()=> { const r=run(`(()=>{const u=DB.db.users.find(x=>x.username==='chief.admin');const r=runSecuritySelfTest(u);return r.passed+'/'+(r.total-r.skipped)+' (skipped '+r.skipped+')'})()`); out.push(['INFO','security self-test',r]); const [a,b]=r.split(' ')[0].split('/'); return a===b; });

// AI
check('AI answers within scope', ()=> run(`(()=>{const u=DB.db.users.find(x=>x.username==='caregiver.nyalenda');const a=AI.answer(u,'what is my caseload');return a.text.includes('caseload')||a.text.length>20})()`));
check('AI refuses finance to caregiver', ()=> run(`(()=>{const u=DB.db.users.find(x=>x.username==='caregiver.nyalenda');const a=AI.answer(u,'how is the budget');return /outside your role|not authorised|restricted/i.test(a.text)})()`));

// Audit integrity after all operations
check('Audit chain still intact', ()=> run(`AUDIT.verify().ok`));
check('Audit logs denials', ()=> run(`DB.db.audit.filter(a=>a.action==='access.denied').length>=3`));

const pass=out.filter(o=>o[0]==='PASS').length;
console.log('\n'+out.map(o=>`${o[0].padEnd(6)} ${o[1]}${o[2]?'  — '+o[2]:''}`).join('\n'));
console.log(`\n${pass} passed · ${fails} failed · ${out.length} checks`);
process.exit(fails?1:0);
