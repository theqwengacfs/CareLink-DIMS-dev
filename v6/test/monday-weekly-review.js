const assert=require('node:assert/strict');
const {makeCtx}=require('./dom');const {run}=makeCtx();
run('DB.load();DB.seedDemo();AUTH.user=DB.db.users.find(u=>u.roleId==="chief");');
const period=JSON.parse(run(`JSON.stringify(MONDAY_PROC.reviewPeriod('2026-11-23'))`));
assert.equal(period.start,'2026-11-16');assert.equal(period.last,'2026-11-22');assert.equal(period.month,'2026-11');
assert.equal(run(`MONDAY_PROC.reviewPeriod('2026-01-05').start`),'2025-12-29');
assert.equal(run(`MONDAY_PROC.reviewDate('2026-11-15T22:00:00Z')`),'2026-11-16');
assert.equal(run(`MONDAY_PROC.reviewDate('2026-02-30')`),'');
assert.equal(run(`MONDAY_PROC.reviewPeriod('not-a-date',new Date('2026-11-24T10:00:00Z')).week`),'2026-11-23');
run(`
 const sourcePatient=DB.db.patients.find(p=>p.countyId==='kisumu');
 const p={...sourcePatient,id:'weekly-fixture',name:'Fictional weekly patient',assessmentDate:'2026-11-17'};
 DB.db.patients=[p,{...p,id:'foreign-fixture',countyId:'homabay'}];
 DB.db.formRecords=Array.from({length:20},(_,i)=>({id:'weekly-form-'+i,patientId:p.id,countyId:p.countyId,kind:'patient_assessment',status:'submitted',visitDate:'2026-11-17',data:{assessmentDate:'2026-11-17'}}));
 DB.db.formRecords.push({id:'draft',patientId:p.id,kind:'patient_assessment',status:'draft',data:{assessmentDate:'2026-11-17'}},
 {id:'old',patientId:p.id,kind:'patient_assessment',status:'verified',data:{assessmentDate:'2026-11-15'}},
 {id:'next',patientId:p.id,kind:'minor_assessment',status:'verified',data:{assessmentDate:'2026-11-23'}},
 {id:'foreign',patientId:'foreign-fixture',kind:'minor_assessment',status:'verified',data:{assessmentDate:'2026-11-17'}});
 DB.db.careReferrals=[{id:'repeat-one',patientId:p.id,kind:'returning',evaluatedAt:'2026-11-20',status:'pending_mcm'}];
 DB.db.hardcopyBatches=[{id:'mirror',patientId:p.id,kind:'patient_assessment',assessmentDate:'2026-11-17',formRecordId:'weekly-form-0',status:'verified_published'},
 {id:'undated',patientId:p.id,kind:'minor_assessment',enteredAt:'2026-11-17',status:'verified_published'}];
`);
const assessments=JSON.parse(run(`JSON.stringify(MONDAY_PROC.reviewAssessments(AUTH.user,[DB.db.patients[0]],MONDAY_PROC.reviewPeriod('2026-11-23')))`));
assert.equal(assessments.length,21);assert(assessments.some(r=>r.sourceId==='repeat-one'));assert(!assessments.some(r=>['foreign','mirror','undated','old','next','draft'].includes(r.sourceId)));
// Discussion order follows recorded entry time, not assessment date or patient name.
run(`DB.db.patients.push({...DB.db.patients[0],id:'weekly-second-area',areaId:'manyatta',name:'Fictional area patient',assessmentDate:''});
 DB.db.formRecords[0].enteredAt='2026-11-20T12:00:00Z'; DB.db.formRecords[1].enteredAt='2026-11-16T08:00:00Z';
 DB.db.formRecords[2].enteredAt='2026-11-17';
 DB.db.formRecords.push({id:'second-area',patientId:'weekly-second-area',kind:'patient_assessment',status:'submitted',enteredAt:'2026-11-17T09:00:00Z',data:{assessmentDate:'2026-11-17'}});`);
const grouping=JSON.parse(run(`JSON.stringify((()=>{ const rows=MONDAY_PROC.reviewAssessments(AUTH.user,DB.db.patients.filter(p=>p.countyId==='kisumu'),MONDAY_PROC.reviewPeriod('2026-11-23')); const groups=MONDAY_PROC.assessmentGroups(rows,'kisumu','2026-11-23'); return {rows,groups,reverse:MONDAY_PROC.assessmentGroups([...rows].reverse(),'kisumu','2026-11-23').map(g=>g.id),subset:MONDAY_PROC.assessmentGroups(rows.filter(r=>r.areaId==='manyatta'),'kisumu','2026-11-23').map(g=>g.id)};})())`));
assert.equal(grouping.groups.length,2);assert.deepEqual(grouping.groups.map(g=>g.id),grouping.reverse);assert.deepEqual(grouping.subset,['manyatta']);
assert(grouping.rows.findIndex(r=>r.sourceId==='weekly-form-1')<grouping.rows.findIndex(r=>r.sourceId==='weekly-form-0'));
assert.equal(grouping.rows.find(r=>r.sourceId==='weekly-form-2').enteredAt,'');
assert(grouping.groups.every(g=>g.rows.every(r=>r.areaId===g.id)));
run(`DB.db.patients=DB.db.patients.filter(p=>p.id!=='weekly-second-area'); DB.db.formRecords=DB.db.formRecords.filter(f=>f.id!=='second-area');`);
run(`
 DB.db.transactions=[
 {id:'paid',countyId:'kisumu',amount:100,date:'2026-11-16',status:'paid',budgetLine:'food',currency:'KES',receipt:false},
 {id:'sun',countyId:'kisumu',amount:200,date:'2026-11-22T20:30:00Z',status:'reconciled',budgetLine:'food',receipt:true},
 {id:'month',countyId:'kisumu',amount:50,date:'2026-11-02',status:'paid',budgetLine:'food'},
 {id:'committed',countyId:'kisumu',amount:25,date:'2026-11-17',status:'committed',budgetLine:'food'},
 {id:'void',countyId:'kisumu',amount:999,date:'2026-11-17',status:'void',budgetLine:'food'},
 {id:'foreign-money',countyId:'kisumu',amount:999,date:'2026-11-17',status:'paid',currency:'USD',budgetLine:'food'},
 {id:'foreign-county',countyId:'homabay',amount:999,date:'2026-11-17',status:'paid',budgetLine:'food'},
 {id:'future',countyId:'kisumu',amount:999,date:'2026-11-24',status:'paid',budgetLine:'food'}];
 DB.db.budgets=[
 {line:'food',countyId:'kisumu',period:'2026-11',amount:500,version:1,effectiveFrom:'2026-11-01'},
 {line:'food',countyId:'kisumu',period:'2026-11',amount:600,version:2,effectiveFrom:'2026-11-01'},
 {line:'food',countyId:'kisumu',period:'2026-11',amount:900,version:3,effectiveFrom:'2026-11-25'},
 {line:'food',countyId:'kisumu',period:'2026-10',amount:9999,version:1},
 {line:'food',countyId:'homabay',period:'2026-11',amount:9999,version:1}];
`);
run(`AUTH.user=DB.db.users.find(u=>u.roleId==='finance'&&u.countyId==='kisumu');`);
const finances=JSON.parse(run(`JSON.stringify(MONDAY_PROC.reviewFinance(AUTH.user,'kisumu',MONDAY_PROC.reviewPeriod('2026-11-23')))`));
assert.equal(finances.week,300);assert.equal(finances.month,350);assert.equal(finances.budget,600);assert.equal(finances.committed,25);assert.equal(finances.missing,1);assert.equal(finances.excludedCurrency,1);assert.equal(finances.daily.length,7);
run(`AUTH.user=DB.db.users.find(u=>u.roleId==='caregiver');`);
assert.equal(run(`MONDAY_PROC.reviewFinance(AUTH.user,'kisumu',MONDAY_PROC.reviewPeriod('2026-11-23'))`),null);
console.log('Monday review passed: Nairobi dates, week/year boundaries, no sample cap, source deduplication, drafts/scoping, paid-only ledger and effective monthly budget versions.');
run(`AUTH.user=DB.db.users.find(u=>u.roleId==='finance'&&u.countyId==='kisumu');`);
let html=run(`MONDAY_PROC.render(AUTH.user,{tab:'expenditures',week:'2026-11-23'})`);
assert(html.includes('Weekly Expenditures'));assert(html.includes('Previous week paid'));assert(html.includes('Monthly budget comparison'));assert(!html.includes('Fictional weekly patient'));
run(`AUTH.user=DB.db.users.find(u=>u.roleId==='chief');DB.db.concerns=[
 {id:'last-week',patientId:'weekly-fixture',opened:'2026-11-17',status:'closed',title:'Resolved weekly fixture'},
 {id:'carry',patientId:'weekly-fixture',opened:'2026-11-01',status:'open',title:'Carryover fixture'},
 {id:'future-concern',patientId:'weekly-fixture',opened:'2026-11-25',status:'open',title:'Future fixture'},
 {id:'old-closed',patientId:'weekly-fixture',opened:'2026-11-01',status:'closed',title:'Old resolved fixture'},
 {id:'foreign-concern',patientId:'foreign-fixture',opened:'2026-11-17',status:'open',title:'Foreign county fixture'}];`);
html=run(`MONDAY_PROC.render(AUTH.user,{tab:'concerns',week:'2026-11-23',county:'kisumu'})`);
assert(html.includes('Resolved weekly fixture'));assert(html.includes('Carryover fixture'));assert(!html.includes('Future fixture'));assert(!html.includes('Old resolved fixture'));assert(!html.includes('Foreign county fixture'));assert(html.includes('data-week="2026-11-23"'));
html=run(`MONDAY_PROC.render(AUTH.user,{tab:'assessments',week:'2026-11-23',county:'kisumu'})`);
assert(html.includes('Patient Assessments (21)'));assert(html.includes('hard-copy record(s) lack an actual assessment date'));
run(`AUTH.user=DB.db.users.find(u=>u.roleId==='finance'&&u.countyId==='kisumu');globalThis.beforeProposals=DB.db.mondayProposals.length;ACTIONS['monday-escalate-concern']({id:'carry',county:'kisumu'});`);
assert.equal(run('DB.db.mondayProposals.length'),run('beforeProposals'));
console.log('Monday tab rendering passed: finance permission, clinical confidentiality, carryovers, resolved concerns, source count and preserved week navigation.');
