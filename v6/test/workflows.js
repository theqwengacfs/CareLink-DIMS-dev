const {makeCtx}=require('./dom');
const {run}=makeCtx();
run('DB.load(); DB.seedDemo();');
const log=[]; let fails=0;
const check=(name,cond,detail='')=>{ log.push([cond?'PASS':'FAIL',name,detail]); if(!cond) fails++; };
const as=(u)=>run(`AUTH.logout(); AUTH.login('${u}','LOMAMO2026')`);
const setForm=(o)=>run(`ctx=>0`), form=(o)=>run(`__form = ${JSON.stringify(o)}`);

/* ---------------- 1. PATIENT: paper → programme → discharge ---------------- */
as('caregiver.nyalenda');
form({name:'DEMO Workflow Patient',sex:'F',age:38,areaId:'nyalenda',intake:'2026-10-01',
      referralEntityId:'rf1',ccc:'CCC/99999',phone:'0700000099',caregiverId:'u-cg-nyal',diagnosis:'HIV — on ART',children:'2',consent:'on'});
run(`ACTIONS['submit-assessment']()`);
const pid = run(`DB.db.patients.find(p=>p.name==='DEMO Workflow Patient')?.id`);
check('Caregiver creates an assessment', !!pid, pid||'none');
check('State is assessment_initiated', run(`DB.db.patients.find(p=>p.id==='${pid}').status==='assessment_initiated'`));

form({kind:'patient',id:pid,t:'submit_form'});
run(`ACTIONS['submit-wf']()`);
check('Caregiver submits the physical form', run(`DB.db.patients.find(p=>p.id==='${pid}').status==='form_submitted'`));

as('kisumu.assistant');
form({kind:'patient',id:pid,t:'digitise'});
run(`ACTIONS['submit-wf']()`);
check('Assistant digitises the form', run(`DB.db.patients.find(p=>p.id==='${pid}').status==='digital_entered'`));

form({kind:'patient',id:pid,t:'request_verify'});
run(`ACTIONS['submit-wf']()`);
check('Record submitted for verification', run(`DB.db.patients.find(p=>p.id==='${pid}').status==='awaiting_verification'`));

// wrong actor must be refused
as('caregiver.nyalenda');
const wrong = run(`transition('patient','${pid}','verify',AUTH.user,{})`);
check('Caregiver cannot verify a record', wrong.ok===false, wrong.msg||'');

as('kisumu.assistant');
form({kind:'patient',id:pid,t:'verify'});
run(`ACTIONS['submit-wf']()`);
check('Assistant verifies against source', run(`DB.db.patients.find(p=>p.id==='${pid}').status==='approved_enrolment'`));

as('kisumu.admin');
form({kind:'patient',id:pid,t:'enrol',needs:'Nutrition support and adherence follow-up',
      expectedDays:75,rationale:'Presenting condition and household capacity at assessment',
      objectives:'Stable weight across three visits',interventions:'Fortnightly home visit',responsible:'u-cg-nyal'});
run(`ACTIONS['submit-wf']()`);
check('Patient enrolled', run(`DB.db.patients.find(p=>p.id==='${pid}').status==='active'`));
check('Enrolment date stamped', !!run(`DB.db.patients.find(p=>p.id==='${pid}').enrolDate`));

as('caregiver.nyalenda');
form({kind:'patient',id:pid,t:'recommend_discharge',reason:'Household stable; treatment completed.'});
run(`ACTIONS['submit-wf']()`);
check('Caregiver recommends discharge with a reason', run(`DB.db.patients.find(p=>p.id==='${pid}').status==='discharge_recommended'`));

as('mcm.kisumu');
const noEvidence = run(`transition('patient','${pid}','approve_discharge',AUTH.user,{reason:'ok'})`);
check('Discharge refused without evidence', noEvidence.ok===false, noEvidence.msg||'');
form({kind:'patient',id:pid,t:'approve_discharge',evidence:'Assessment 2026-10-01, 6 visits, PDCA closed, household stable.'});
run(`ACTIONS['submit-wf']()`);
check('Discharge approved with evidence', run(`DB.db.patients.find(p=>p.id==='${pid}').status==='discharged'`));
check('Discharge date recorded', !!run(`DB.db.patients.find(p=>p.id==='${pid}').discharge`));

/* ---------------- 2. HOSPITAL REQUEST: 7 stages ---------------- */
as('caregiver.nyalenda');
form({patientId:pid,reason:'Post-discharge review and ART refill',priority:'urgent',facility:'Demo County Referral Hospital',
      preferredDate:'2026-10-24',concerns:'Weight loss',transportRequired:'on',fare:'1200',persons:'2',escort:'on',notes:''});
run(`ACTIONS['submit-request']()`);
const rid = run(`DB.db.requests.find(r=>r.patientId==='${pid}')?.id`);
check('Caregiver submits hospital request', !!rid && run(`DB.db.requests.find(r=>r.id==='${rid}').status==='submitted'`));
check('Transport captured with fare', run(`DB.db.requests.find(r=>r.id==='${rid}').transport.fare===1200`));

const selfApprove = run(`transition('request','${rid}','approve',AUTH.user,{note:'x'})`);
check('Caregiver cannot approve own request', selfApprove.ok===false, selfApprove.msg||'');

as('mcm.kisumu');
form({kind:'request',id:rid,t:'approve',note:'Clinically justified'});
run(`ACTIONS['submit-wf']()`);
check('MCM approves the request', run(`DB.db.requests.find(r=>r.id==='${rid}').status==='approved'`));
check('Approval does not mark transport paid', run(`DB.db.requests.find(r=>r.id==='${rid}').transport.approved===false`));

form({kind:'request',id:rid,t:'assign',assignee:'u-lia-ksm'});
run(`ACTIONS['submit-wf']()`);
check('Request assigned to liaison', run(`DB.db.requests.find(r=>r.id==='${rid}').status==='assigned'`));

const earlyClose = run(`transition('request','${rid}','close',AUTH.user,{})`);
check('Cannot close before service is recorded', earlyClose.ok===false);

as('liaison.kisumu');
form({kind:'request',id:rid,t:'serve',report:'Consultation, ART refill issued, follow-up in 4 weeks.',expense:'1500',budgetLine:'medication'});
run(`ACTIONS['submit-wf']()`);
check('Liaison records hospital service', run(`DB.db.requests.find(r=>r.id==='${rid}').status==='completed'`));
check('Clinical report stored', !!run(`DB.db.requests.find(r=>r.id==='${rid}').clinicalReport`));

theEnd: {
  as('mcm.kisumu');
  const closeUnreconciled = run(`transition('request','${rid}','close',AUTH.user,{})`);
  check('Closure blocked while unreconciled', closeUnreconciled.ok===false, closeUnreconciled.msg||'');
}

as('finance.kisumu');
form({requestId:rid,category:'consultation',amount:'1500',date:'2026-10-18',ref:'MPESA999888',payee:'Demo Facility',budgetLine:'medication',receipt:'on',note:'Receipt seen'});
run(`ACTIONS['submit-expense']()`);
const tx = run(`DB.db.transactions.filter(t=>t.requestId==='${rid}').pop()?.id`);
check('Expense recorded against the request', !!tx);
form({id:tx,receiptRef:'MPESA999888',note:'Matched to receipt'});
run(`ACTIONS['submit-recon']()`);
check('Transaction reconciled', run(`DB.db.transactions.find(t=>t.id==='${tx}').status==='reconciled'`));

as('mcm.kisumu');
form({kind:'request',id:rid,t:'reconcile'});
run(`ACTIONS['submit-wf']()`);
check('Request moves to reconciled', run(`DB.db.requests.find(r=>r.id==='${rid}').status==='reconciled'`));
const closed = run(`transition('request','${rid}','close',AUTH.user,{})`);
check('Closure succeeds once evidence is complete', closed.ok===true, closed.msg||'');

/* ---------------- 3. Audit completeness ---------------- */
const actions = run(`DB.db.audit.map(a=>a.action)`);
['patient.assessment_initiated','patient.submit_form','patient.digitise','patient.verify','patient.enrol',
 'patient.recommend_discharge','patient.approve_discharge','hospital.requested','request.approve','request.assign',
 'request.serve','expense.recorded','transaction.reconciled','request.close','access.denied']
 .forEach(a=>check('Audited: '+a, actions.includes(a)));
check('Audit chain intact after the full journey', run(`AUDIT.verify().ok`));
check('Patient visible to the MCM after discharge', run(`(()=>{AUTH.logout();AUTH.login('mcm.kisumu','LOMAMO2026');return !!repo.patient(AUTH.user,'${pid}')})()`));
check('Homa Bay finance cannot see the Kisumu expense', run(`(()=>{AUTH.logout();AUTH.login('finance.homabay','LOMAMO2026');return repo.transactions(AUTH.user).every(t=>t.countyId!=='kisumu')})()`));

const pass=log.filter(l=>l[0]==='PASS').length;
console.log(log.map(l=>`${l[0]}  ${l[1]}${l[2]?'  — '+l[2]:''}`).join('\n'));
console.log(`\n${pass}/${log.length} workflow assertions passed`);
process.exit(fails?1:0);
