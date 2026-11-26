/* Quality findings and honest attestation wording, using synthetic records. */
const assert=require('node:assert/strict');
const {makeCtx}=require('./dom');
const {run,ctx}=makeCtx({setTimeout:()=>0});
run(`DB.load();DB.seedDemo();globalThis.__user={id:'synthetic-auditor',roleId:'countyadmin',countyId:'kisumu'};
  RBAC.has=(u,cap)=>['dq.manage','finance.view','audit.view','patient.list'].includes(cap);
  repo.patientList=()=>[{id:'synthetic-p',code:'SYN-P',countyId:'kisumu',intake:'2026-01-01',caregiverId:'synthetic-user',phone:'synthetic',docsVerified:true,plannedDays:45,programDays:350}];
  DB.db.requests=[];DB.db.visits=[];DB.db.transactions=[
    {id:'synthetic-t1',countyId:'kisumu',receipt:false},
    {id:'synthetic-t2',countyId:'kisumu',receipt:true},
    {id:'synthetic-t3',countyId:'homabay',receipt:false}
  ];`);
let findings=JSON.parse(run('JSON.stringify(DQ6.scan(__user))'));
assert(!findings.some(i=>i.rule==='duration-unlisted'||i.rule==='duration-outlier'),'milestones are not a duration ceiling');
assert.equal(findings.filter(i=>i.rule==='receipt-missing').length,1);
assert.match(findings.find(i=>i.rule==='receipt-missing').text,/attestation.*independent review/);
run(`DB.db.dqIssues=[{id:'synthetic-waiver',key:'receipt-missing:synthetic-t1',status:'waived',text:'SYNTHETIC-PRIVATE',reason:'SYNTHETIC-PRIVATE'}]`);
ctx.location.protocol='https:';
assert.equal(run('DQ6.open(__user).length'),1,'hosted legacy waiver cannot hide the finding');
assert(!run('DQ6.csv(__user)').includes('SYNTHETIC-PRIVATE'),'hosted export excludes retained legacy waiver text');
assert.equal(run(`DQ6.waive(__user,'receipt-missing:synthetic-t1','Synthetic detailed explanation',30).ok`),false);
assert.equal(run(`DQ6.reopen(__user,'synthetic-waiver').ok`),false);
const html=run('renderDataQuality(__user)');
assert.match(html,/waivers are temporarily unavailable/i);assert.match(html,/does not enforce a report or export block/i);
assert.equal(run('DB.db.dqIssues[0].status'),'waived','guard preserves retained records');
console.log('Quality integrity: duration milestones not misclassified, receipt checkbox not treated as proof, hosted waivers cannot hide or export findings.');
