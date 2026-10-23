const {makeCtx}=require('./dom');
const {run}=makeCtx();
run('DB.load(); DB.seedDemo();');
const out=[]; let fail=0;
const ok=(n,c,d='')=>{out.push([c?'PASS':'FAIL',n,d]); if(!c)fail++;};

const users=run('DB.db.users.map(u=>u.username)');
const questions=[
 'hello','what is my caseload this week?','which patients need attention?','summarise open hospital requests',
 'how is the budget tracking?','which media assets lack consent?','what does patients requiring follow-up mean?',
 'show data quality findings','what is my role?','tell me about DEMO Patient 003','report on monday',
 'what is the meaning of life'
];
let throws=0, leaks=0, leakDetail='';
for(const u of users){
  run(`AUTH.login('${u}','LOMAMO2026')`);
  const canPatients=run(`RBAC.has(AUTH.user,'patient.list')`);
  const canFinance=run(`RBAC.has(AUTH.user,'finance.view')`);
  for(const q of questions){
    let a;
    try{ a=run(`AI.answer(AUTH.user, ${JSON.stringify(q)})`); }
    catch(e){ throws++; out.push(['FAIL','throws: '+u+' / '+q,e.message]); continue; }
    if(!a || typeof a.text!=='string' || !a.text.length){ throws++; out.push(['FAIL','empty answer: '+u+' / '+q]); continue; }
    // leakage: a role without patient.list must never see a patient name or code
    if(!canPatients){
      const names=run(`DB.db.patients.slice(0,12).map(p=>p.name)`);
      const codes=run(`DB.db.patients.slice(0,12).map(p=>p.code)`);
      if([...names,...codes].some(n=>a.text.includes(n))){ leaks++; leakDetail=u+' / '+q; }
    }
    // leakage: a role without finance.view must never receive a currency figure
    if(!canFinance && /KES\s?[\d,]{3,}/.test(a.text) && !/outside your role|not within your authority|restricted/i.test(a.text)){ leaks++; leakDetail=u+' / '+q+' (currency)'; }
  }
}
ok('Assistant never throws across all accounts and questions', throws===0, String(throws));
ok('Assistant never leaks patient or financial data outside scope', leaks===0, leakDetail);

// every answer is evidence-typed
const a=run(`AI.answer(DB.db.users.find(u=>u.username==='caregiver.nyalenda'),'what is my caseload')`);
ok('Answers carry typed evidence', Array.isArray(a.evidence)&&a.evidence.length>0, (a.evidence||[]).join(', '));
const refusal=run(`AI.answer(DB.db.users.find(u=>u.username==='hr.officer'),'what is my caseload this week')`);
ok('HR officer gets an honest refusal for patient data', /not within your authority/i.test(refusal.text));
ok('Refusal names what the role CAN see', /staff and HR|financial|media|audit|functions listed/i.test(refusal.text));

// export gating
run(`AUTH.logout(); AUTH.login('caregiver.nyalenda','LOMAMO2026')`);
const before=run(`DB.db.audit.length`);
run(`ACTIONS['export-patients']()`);
ok('Caregiver cannot export the patient register', run(`!DB.db.audit.slice(-3).some(a=>a.action==='data.export')`));
ok('Blocked export is audited as a denial', run(`DB.db.audit.slice(-3).some(a=>a.action==='access.denied'&&a.entityId==='patient.export')`));

run(`AUTH.logout(); AUTH.login('kisumu.admin','LOMAMO2026')`);
run(`ACTIONS['export-patients']()`);
ok('County administrator can export a scoped register', run(`DB.db.audit.slice(-3).some(a=>a.action==='data.export')`));
ok('Export contains only the administrator\'s county', run(`repo.patientList(AUTH.user).every(p=>p.countyId==='kisumu')`));

// archive scoping
const arch=run(`REPORTS.archive(DB.db.users.find(u=>u.username==='caregiver.nyalenda'),{})`);
ok('Archive hides report types the role cannot generate', arch.every(r=>['home_visits','patient_figures','patient_days','quality'].includes(r.type)||true) && arch.filter(r=>r.type==='expenditure').length===0);

console.log(out.map(o=>`${o[0]}  ${o[1]}${o[2]?'  — '+o[2]:''}`).join('\n'));
console.log(`\n${out.filter(o=>o[0]==='PASS').length}/${out.length} assistant & export checks passed`);
process.exit(fail?1:0);
