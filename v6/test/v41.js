/* v4.1 acceptance: care centre, conditions, delegation, care-plan reviews,
   settings workspace, landing/sign-in separation, donor summary. */
const {makeCtx}=require('./dom');
const {run}=makeCtx();
run('DB.load(); DB.seedDemo();');
const log=[]; let fails=0;
const ok=(name,cond,detail='')=>{ log.push([cond?'PASS':'FAIL',name,detail]); if(!cond) fails++; };
const as=u=>run(`AUTH.logout(); AUTH.login('${u}','LOMAMO2026')`);
const T=c=>run(c);

/* ---------------- 1. Landing and sign-in are separate screens ---------------- */
as('caregiver.nyalenda'); run('AUTH.logout()');
ok('Default screen is the public landing page', T(`APPX.screen==='landing'`));
const landing = T(`renderLanding()`);
ok('Landing carries the Foundation identity', /One Foundation/.test(landing) && /One Operating System/.test(landing));
ok('Landing carries the tagline', /Serving our Neighbours in Love/.test(landing));
ok('Landing has a single primary action', (landing.match(/data-act="goto-login"/g)||[]).length===1);
ok('Landing exposes no patient data', !/DEMO Patient|LOM-/.test(landing));
run(`ACTIONS['goto-login']()`);
ok('Proceeding opens the sign-in screen', T(`APPX.screen==='login'`));
const login = T(`renderLogin()`);
ok('Sign-in offers a route back to the landing page', /data-act="goto-landing"/.test(login));
ok('Sign-in carries no console data', !/DEMO Patient|LOM-/.test(login));

/* ---------------- 2. Enrolment requires an initial care plan ---------------- */
as('kisumu.admin');
const pid = T(`repo.patientList(AUTH.user,{status:'approved_enrolment'})[0]?.id`);
if(pid){
  const noPlan = T(`transition('patient','${pid}','enrol',AUTH.user,{})`);
  ok('Enrolment refused without a care plan', noPlan.ok===false, noPlan.msg||'');
  const withPlan = T(`transition('patient','${pid}','enrol',AUTH.user,{needs:'Nutrition support',expectedDays:75,rationale:'Household capacity and clinical advice',objectives:'Stable weight',interventions:'Fortnightly visit'})`);
  ok('Enrolment accepted with a care plan', withPlan.ok===true, withPlan.msg||'');
  ok('Care plan stored on the patient', !!T(`DB.db.patients.find(p=>p.id==='${pid}').carePlan`));
  ok('Expected duration recorded', T(`DB.db.patients.find(p=>p.id==='${pid}').carePlan.expectedDays`)===75);
} else {
  ok('A patient awaited enrolment for the test', false, 'no fixture');
}

/* ---------------- 3. Delegation ---------------- */
as('kisumu.admin');
const dl = T(`DELEGATION.issue(AUTH.user,{delegateId:'u-ksm-assist',caps:['patient.enrol'],from:new Date().toISOString(),to:new Date(Date.now()+7*864e5).toISOString(),reason:'County travel'})`);
ok('Delegation issued by an authorised officer', dl.ok===true, dl.msg||'');
as('kisumu.assistant');
ok('Delegate temporarily holds the capability', T(`RBAC.has(AUTH.user,'patient.enrol')`));
ok('Delegate does not gain unrelated capability', T(`RBAC.has(AUTH.user,'finance.review')`)===false);
ok('Delegation is reported as active', T(`RBAC.activeDelegations(AUTH.user).length`)>=1);
const allowed = T(`RBAC.can(AUTH.user,'patient.enrol',{countyId:'kisumu'}).ok`);
ok('Delegated authority passes the scope check in county', allowed===true);
as('kisumu.admin');
const excess = T(`DELEGATION.issue(AUTH.user,{delegateId:'u-ksm-assist',caps:['system.restore'],from:new Date().toISOString(),to:new Date(Date.now()+7*864e5).toISOString()})`);
ok('Cannot delegate a capability the officer does not hold', excess.ok===false);
const tooLong = T(`DELEGATION.issue(AUTH.user,{delegateId:'u-ksm-assist',caps:['patient.enrol'],from:new Date().toISOString(),to:new Date(Date.now()+200*864e5).toISOString()})`);
ok('Delegation longer than 120 days refused', tooLong.ok===false);
run(`DB.db.delegations.filter(d=>d.status==='active').forEach(d=>{d.to=new Date(Date.now()-864e5).toISOString()});`);
as('kisumu.assistant');
ok('Expired delegation grants nothing', T(`RBAC.has(AUTH.user,'patient.enrol')`)===false);

/* ---------------- 4. Conditions ---------------- */
as('caregiver.nyalenda');
const cgPatient = T(`repo.patientList(AUTH.user)[0].id`);
const cond = T(`COND.record(AUTH.user,{patientId:'${cgPatient}',key:'tb',status:'suspected',note:'Reported at visit'})`);
ok('Caregiver may record a suspected condition', cond.ok===true, cond.msg||'');
const confirmByCg = T(`COND.confirm(AUTH.user,'${cond.row?.id||'x'}')`);
ok('Caregiver cannot confirm a diagnosis', confirmByCg.ok===false);
as('mcm.kisumu');
const confirmByMcm = T(`COND.confirm(AUTH.user,'${cond.row?.id||'x'}')`);
ok('Clinician confirms the diagnosis', confirmByMcm.ok===true, confirmByMcm.msg||'');
const listMcm = T(`COND.list(AUTH.user,'${cgPatient}')`);
ok('Clinician sees sensitive conditions', listMcm.maySeeSensitive===true);
as('hr.officer');
ok('HR holds no condition capability', T(`RBAC.has(AUTH.user,'condition.view')`)===false);
ok('HR condition list is refused and empty', T(`COND.list(AUTH.user,'${cgPatient}').rows.length`)===0);
as('me.kisumu');
const agg = T(`COND.aggregate(AUTH.user,{countyId:'kisumu'})`);
ok('M&E receives aggregate condition counts', agg.allowed===true && agg.rows.length>0);
ok('Sensitive categories withheld from M&E', agg.maySeeSensitive===false);
ok('Small groups are suppressed rather than shown', agg.rows.every(r=>r.n===null||r.n>=5));
as('media.head');
ok('Media cannot aggregate conditions', T(`COND.aggregate(AUTH.user,{}).allowed`)===false);

/* ---------------- 5. Care centre ---------------- */
as('mcm.kisumu');
const occ = T(`CARE.occupancy(AUTH.user)`);
ok('Care centre occupancy is calculated from beds', occ.beds===12 && occ.occupied===7, JSON.stringify(occ));
ok('Residents are scoped to visible patients', T(`CARE.residents(AUTH.user).length`)===7);
const logAdd = T(`CARE.addLog(AUTH.user,{residentId:'res-1',shift:'Morning',eaten:'All',fluids:'Adequate',hygiene:'Assisted',mood:'Settled',note:'Test entry'})`);
ok('Daily care entry recorded', logAdd.ok===true, logAdd.msg||'');
const inc = T(`CARE.addIncident(AUTH.user,{residentId:'res-1',type:'Fall',severity:'low',actions:'Assessed by nurse, no injury'})`);
ok('Safeguarding incident recorded by an authorised role', inc.ok===true, inc.msg||'');
const close = T(`CARE.closeIncident(AUTH.user,'${inc.inc?.id||'x'}','Reviewed with the family and the policy applied')`);
ok('Incident closed with a written resolution', close.ok===true, close.msg||'');
as('hr.officer');
ok('HR sees occupancy but not residents (no patient scope)', T(`CARE.residents(AUTH.user).length`)===0);
ok('HR cannot read the safeguarding register', T(`CARE.incidents(AUTH.user).length`)===0);
as('caregiver.nyalenda');
ok('Caregiver without care.manage cannot close an incident', T(`CARE.closeIncident(AUTH.user,'${inc.inc?.id||'x'}','attempted closure by caregiver')`).ok===false);

/* ---------------- 6. Care-plan review cycle ---------------- */
as('mcm.kisumu');
const rp = T(`repo.patientList(AUTH.user,{status:'active'})[0]`);
const patient = T(`repo.patientList(AUTH.user,{status:'active'})[0].id`);
const sched = T(`PDCAX.schedule(repo.patientList(AUTH.user,{status:'active'})[0])`);
ok('Twelve reviews are scheduled', sched.length===12);
ok('Reviews fall every 30 days', T(`PDCAX.schedule(repo.patientList(AUTH.user,{status:'active'})[0])[1].day`)===60);
ok('A due date is calculated from the programme start', !!sched[0].due);
const target = sched.find(r=>r.status==='overdue') || sched.find(r=>r.status==='upcoming');
const before = target.due.getTime();
const completed = T(`PDCAX.complete(AUTH.user,'${patient}',${target.day},'Reviewed at home with the caregiver')`);
ok('A review can be completed', completed.ok===true, completed.msg||'');
ok('The original due date is preserved', T(`new Date(DB.db.pdcas.find(x=>x.kind==='review'&&x.patientId==='${patient}'&&x.dueDay===${target.day}).due).getTime()`)===before);
ok('The completion date is recorded separately', !!T(`DB.db.pdcas.find(x=>x.kind==='review'&&x.patientId==='${patient}'&&x.dueDay===${target.day}).completedAt`));

const long = T(`DB.db.patients.find(p=>p.status==='active'&&PDCAX.daysInProgramme(p)>190)`);
if(long){
  const needExt = T(`PDCAX.extensionRequired(DB.db.patients.find(p=>p.id==='${long.id}'))`);
  ok('Extended case is flagged for review', needExt===true);
  const shortNote = T(`PDCAX.recordExtension(AUTH.user,'${long.id}','too short')`);
  ok('Extension review refuses an empty justification', shortNote.ok===false);
  const good = T(`PDCAX.recordExtension(AUTH.user,'${long.id}','Continuing clinical and social needs documented at review, next review in 60 days.')`);
  ok('Extension review recorded with a justification', good.ok===true, good.msg||'');
}

/* ---------------- 7. Settings workspace ---------------- */
as('caregiver.nyalenda');
const cgSections = T(`SETTINGS.sections(AUTH.user).map(s=>s.id)`);
ok('Caregiver sees only permitted settings sections', !cgSections.includes('organisation') && !cgSections.includes('programme'));
ok('Caregiver sees personal preferences', cgSections.includes('preferences'));
as('chief.admin');
const chiefSections = T(`SETTINGS.sections(AUTH.user).map(s=>s.id)`);
ok('Chief sees programme and security settings', chiefSections.includes('programme') && chiefSections.includes('security'));
run(`SETTINGS.set('programme.defaultDays',90)`);
ok('Programme setting persists', T(`DB.db.settings.programme.defaultDays`)===90);
run(`SETTINGS.set('programme.defaultDays',75)`);
run(`SETTINGS.pref('rows',100)`);
ok('Personal preference stored against the person', T(`DB.db.personalPrefs['u-chief'].rows`)===100);
as('caregiver.nyalenda');
ok('Another person does not inherit a personal preference', T(`(DB.db.personalPrefs['u-cg-nyal']||{}).rows`)===undefined);

/* ---------------- 8. Donor summary ---------------- */
as('director');
const donor = T(`renderDonor(AUTH.user)`);
ok('Donor summary renders', /Donor summary/.test(donor));
ok('Donor summary contains no patient names or codes', !/DEMO Patient|LOM-/.test(donor));
ok('Donor summary states its limitations', /not proof|not a claim|not\b/.test(donor));
as('hr.officer');
ok('HR cannot open the donor summary', /not authorised|Access|denied/i.test(T(`contentFor('donor',{},AUTH.user)`)));

/* ---------------- 9. Central database client states ---------------- */
ok('Sync is a real state machine', T(`typeof SYNC==='object' && typeof SYNC.start==='function' && typeof SYNC.decide==='function'`));
ok('Sync chip reports device-only state honestly', T(`SYNC.state='device'; SYNC.chip()`).includes('This device only'));
run(`SYNC.state='connected'; SYNC.rev=42; SYNC.saved='2026-10-18T08:00:00+03:00'; SYNC.message='Saved'; AUTH.user=DB.db.users.find(u=>u.roleKey==='chief')||DB.db.users[0]`);
ok('Sync chip reports the central revision when connected', /Revision 42/.test(T(`SYNC.chip()`)));
/* The join decision table: every branch, no network needed. */
ok('Fresh device joins the central copy', T(`SYNC.decide({remoteRev:5,localHas:false,localRev:null,dirty:false})`)==='adopt');
ok('Empty server accepts this device copy', T(`SYNC.decide({remoteRev:0,localHas:true,localRev:null,dirty:false})`)==='push');
ok('Device in step needs no action', T(`SYNC.decide({remoteRev:5,localHas:true,localRev:5,dirty:false})`)==='in-step');
ok('Clean device adopts a newer central copy', T(`SYNC.decide({remoteRev:6,localHas:true,localRev:5,dirty:false})`)==='remote-moved');
ok('Dirty device replays its own changes on top of the newer central copy', T(`SYNC.decide({remoteRev:6,localHas:true,localRev:5,dirty:true})`)==='patch');
ok('Device with no revision adopts the central copy instead of merging blind', T(`SYNC.decide({remoteRev:3,localHas:true,localRev:null,dirty:false})`)==='adopt');

console.log(log.filter(l=>l[0]==='FAIL').map(l=>l.join(' | ')).join('\n'));
console.log(`\n${log.filter(l=>l[0]==='PASS').length}/${log.length} v4.1 assertions passed`);
if(fails){ process.exit(1); }
