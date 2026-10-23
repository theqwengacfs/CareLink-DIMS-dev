const {makeCtx}=require('./dom');
const {run,nodes}=makeCtx();
run('DB.load(); DB.seedDemo();');
const fails=[];
function attempt(label, user, code){
  try{
    run(`AUTH.logout(); AUTH.login('${user}','LOMAMO2026');`);
    run(code);
    run('closeAllModals()');
  }catch(e){ fails.push([label,user,e.message]); }
}
// a representative account for every modal
const cases=[
 ['new-assessment','caregiver.nyalenda',`ACTIONS['new-assessment']()`],
 ['record-visit','caregiver.nyalenda',`ACTIONS['record-visit']({patient:repo.patientList(AUTH.user)[0].id})`],
 ['new-request','caregiver.nyalenda',`ACTIONS['new-request']({patient:repo.patientList(AUTH.user)[0].id})`],
 ['upload-doc','caregiver.nyalenda',`ACTIONS['upload-doc']({patient:repo.patientList(AUTH.user)[0].id})`],
 ['new-pdca','caregiver.nyalenda',`ACTIONS['new-pdca']({patient:repo.patientList(AUTH.user)[0].id})`],
 ['open-patient','caregiver.nyalenda',`ACTIONS['open-patient']({id:repo.patientList(AUTH.user)[0].id})`],
 ['open-request','caregiver.nyalenda',`ACTIONS['open-request']({id:repo.requests(AUTH.user)[0].id})`],
 ['wf-patient','caregiver.nyalenda',`(()=>{const p=repo.patientList(AUTH.user).find(p=>p.status==='assessment_initiated')||repo.patientList(AUTH.user)[0];ACTIONS['wf']({kind:'patient',id:p.id,t:'submit_form'})})()`],
 ['open-pdca','caregiver.nyalenda',`ACTIONS['open-pdca']({id:DB.db.pdcas[0].id})`],
 ['change-password','caregiver.nyalenda',`ACTIONS['change-password']()`],
 ['review-media','media.head',`ACTIONS['review-media']({id:DB.db.documents[0].id})`],
 ['edit-consent','media.head',`ACTIONS['edit-consent']({id:DB.db.patients[0].id})`],
 ['reconcile-tx','finance.kisumu',`ACTIONS['reconcile-tx']({id:repo.transactions(AUTH.user)[0].id})`],
 ['add-expense','finance.kisumu',`ACTIONS['add-expense']({id:repo.requests(AUTH.user)[0].id})`],
 ['edit-budget','countyadmin' ,`ACTIONS['edit-budget']()`],
 ['set-target','kisumu.admin',`ACTIONS['set-target']()`],
 ['review-leave','hr.officer',`ACTIONS['review-leave']({id:DB.db.leaveRequests[0].id})`],
 ['apply-leave','hr.officer',`ACTIONS['apply-leave']()`],
 ['add-staff','hr.officer',`ACTIONS['add-staff']()`],
 ['edit-staff','hr.officer',`ACTIONS['edit-staff']({id:DB.db.employees[0].id})`],
 ['log-trip','vehicle.officer',`ACTIONS['log-trip']()`],
 ['edit-area','chief.admin',`ACTIONS['edit-area']({id:'nyalenda'})`],
 ['add-area','chief.admin',`ACTIONS['add-area']({county:'kisumu'})`],
 ['new-account','kisumu.admin',`ACTIONS['new-account']()`],
 ['review-account','kisumu.admin',`(()=>{DB.db.accountRequests.push({id:'ac1',name:'Test User',jobTitle:'Caregiver',roleId:'caregiver',departmentId:'ministry',countyId:'kisumu',areaIds:['nyalenda'],requestedBy:'u-coord-nyal',justification:'Test'});ACTIONS['review-account']({id:'ac1'})})()`],
 ['manage-user','chief.admin',`ACTIONS['manage-user']({id:'u-cg-nyal'})`],
 ['user-menu','chief.admin',`userMenu()`],
 ['verify-referral','mcm.kisumu',`ACTIONS['verify-referral']({id:DB.db.referralEntities.find(e=>e.status!=='verified').id})`],
 ['run-security-test','chief.admin',`ACTIONS['run-security-test']()`],
 ['verify-chain','chief.admin',`ACTIONS['verify-chain']()`],
 ['create-backup','chief.admin',`ACTIONS['create-backup']()`],
 ['request-restore','chief.admin',`ACTIONS['request-restore']()`],
 ['request-export','chief.admin',`ACTIONS['request-export']()`],
 ['import-console','chief.admin',`contentFor('import',{},AUTH.user)`],
 ['import-validate','chief.admin',`(()=>{IMPORTER.reset();IMPORTER.file={name:'x.csv'};IMPORTER.headers=['Patient Name','Ministry Area','Intake Date'];IMPORTER.rows=[{'Patient Name':'Demo A','Ministry Area':'Nyalenda','Intake Date':'2026-01-01'}];IMPORTER.mapping=IMPORTER.detectMapping(IMPORTER.headers);IMPORTER.validate();contentFor('import',{},AUTH.user)})()`],
 ['notifications','caregiver.nyalenda',`ACTIONS['open-notifications']()`],
 ['ai-toggle','caregiver.nyalenda',`ACTIONS['toggle-ai']();ACTIONS['close-ai']()`],
 ['care-log','caregiver.nyalenda',`ACTIONS['care-log']({id:CARE.residents(AUTH.user)[0].id})`],
 ['care-incident','mcm.kisumu',`ACTIONS['care-incident']({id:CARE.residents(AUTH.user)[0].id})`],
 ['care-incident-close','mcm.kisumu',`ACTIONS['care-incident-close']({id:CARE.incidents(AUTH.user).find(i=>i.status==='open').id})`],
 ['condition-record','caregiver.nyalenda',`ACTIONS['condition-record']({id:repo.patientList(AUTH.user)[0].id})`],
 ['delegation-issue','kisumu.admin',`ACTIONS['delegation-issue']()`],
 ['pdca-complete','caregiver.nyalenda',`(()=>{const p=repo.patientList(AUTH.user)[0];const r=PDCAX.schedule(p).find(x=>x.status!=='completed');ACTIONS['pdca-complete']({id:p.id,day:r.day})})()`],
 ['pdca-extension','mcm.kisumu',`(()=>{const p=DB.db.patients.find(p=>PDCAX.extensionRequired(p))||repo.patientList(AUTH.user)[0];ACTIONS['pdca-extension']({id:p.id})})()`],
 ['footer-sync','chief.admin',`openSyncModal()`],
 ['preview-theme','chief.admin',`ACTIONS['preview-theme']({id:'dawn'})`],
 ['compose-message','caregiver.nyalenda',`ACTIONS['compose-message']({})`],
 ['new-publication','media.head',`ACTIONS['new-publication']()`],
 ['my-profile','caregiver.nyalenda',`ACTIONS['my-profile']()`],
 ['new-enquiry','pr.officer',`ACTIONS['new-enquiry']()`],
 ['workplan-edit','caregiver.nyalenda',`ACTIONS['workplan-edit']({period:'2026-11'})`],
 ['backup-report','chief.admin',`(()=>{BACKUP.create(AUTH.user,'Audit fixture');ACTIONS['backup-report']({id:DB.db.backups[0].id})})()`],
 /* v5.0 dialogues */
 ['new-form','caregiver.nyalenda',`ACTIONS['new-form']({kind:'home_visit'})`],
 ['edit-form','u-ksm-assist',`ACTIONS['edit-form']({id:(DB.db.formRecords||[]).find(r=>r.status==='draft').id})`],
 ['verify-form','mcm.kisumu',`ACTIONS['verify-form']({id:(DB.db.formRecords||[]).find(r=>r.status==='submitted').id})`],
 ['return-form','mcm.kisumu',`ACTIONS['return-form']({id:(DB.db.formRecords||[]).find(r=>r.status==='submitted').id})`],
 ['receive-stock','mcm.kisumu',`ACTIONS['receive-stock']()`],
 ['adjust-stock','mcm.kisumu',`ACTIONS['adjust-stock']({id:DB.db.stockLots[0].id})`],
 ['new-prescription','nurse.kisumu',`ACTIONS['new-prescription']()`],
 ['open-rx','mcm.kisumu',`ACTIONS['open-rx']({id:DB.db.clinicalRx[0].id})`],
 ['cancel-rx','nurse.kisumu',`(()=>{const rx=DB.db.clinicalRx.find(r=>r.status==='prescribed')||DB.db.clinicalRx[0];ACTIONS['cancel-rx']({id:rx.id})})()`],
 ['new-careplan','mcm.kisumu',`ACTIONS['new-careplan']()`],
 ['rate-careplan','mcm.kisumu',`(()=>{const p=DB.db.omahaPlans[0];ACTIONS['rate-careplan']({id:p.id,code:p.problems[0].code})})()`],
 ['approve-careplan','mcm.kisumu',`ACTIONS['approve-careplan']({id:DB.db.omahaPlans[0].id})`],
 ['apply-leave-v5','caregiver.nyalenda',`ACTIONS['apply-leave']()`],
 ['review-leave-v5','depthead.medical',`(()=>{const l=(DB.db.leaveRequests||[]).find(x=>x.status==='pending');if(l)ACTIONS['review-leave']({id:l.id})})()`],
 ['arrange-home','caregiver.nyalenda',`ACTIONS['arrange-home']()`],
];
cases.forEach(([a,b,c])=>attempt(a,b,c));

// every report document for a leadership user
['patient_figures','patient_days','expenditure','referral','executive','quality','home_visits','hospital_ops','donor','condition_summary'].forEach(t=>{
  attempt('doc:'+t,'director',`buildReportDoc('${t}',{countyId:'all'},AUTH.user)`);
  attempt('doc:'+t+':ksm','kisumu.admin',`buildReportDoc('${t}',{countyId:'kisumu'},AUTH.user)`);
});

if(fails.length){ console.log('FAILURES:'); fails.forEach(f=>console.log('  ✗',f.join(' | '))); process.exit(1); }
console.log(`All ${cases.length} modal/action paths + 28 report documents opened without error.`);
