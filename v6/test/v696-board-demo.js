/* Read-only, no-account board preview isolation and reference-register checks. */
const { makeCtx } = require('./dom');
const { run, ctx } = makeCtx();
let pass=0, fail=0;
function ok(name, condition){
  if(condition){pass++; console.log('PASS',name);}
  else {fail++; console.error('FAIL',name);}
}

run(`DB.db=DB.blank(); DB.db.meta.label='pre-existing local state'; DB.save();`);
ok('Public landing page has no anonymous demo entry and exposes Chief System Administrator commissioning',
  !run(`renderLanding().includes('demo-preview-enter') || renderLanding().includes('no account')`) && run(`renderLanding().includes('First-run System Commissioning')`));
const original = run('DB.db');
const before = ctx.localStorage.getItem('lomamo_carelink_dims_v66');
const beforePrefs = ctx.localStorage.getItem('carelink.prefs.v6');
run('DEMO_PREVIEW.enter()');
const db = run('DB.db');
const patients = db.patients;
ok('No-login entry creates an isolated preview database', run('DEMO_PREVIEW.active') && db!==original && db.meta.demoPreview===true);
ok('Entry opens the console immediately with an explicit read-only synthetic-data banner', run(`document.querySelector('#root').innerHTML.includes('BOARD PREVIEW') && document.querySelector('#root').innerHTML.includes('READ ONLY')`));
ok('Console banner displays the fixed office role and named current holder',run(`document.querySelector('#root').innerHTML.includes('Role holder:')&&document.querySelector('#root').innerHTML.includes(AUTH.user.name)`));
ok('Unauthenticated board preview can inspect distinct synthetic role consoles without leaving read-only mode',(()=>{const id=run(`DB.db.users.find(u=>u.roleId==='caregiver'&&u.status==='active').id`);run(`DEMO_PREVIEW.switchRole('${id}')`);const ok=run(`AUTH.user.roleId==='caregiver'&&AUTH.session.token==='local-read-only-demo'&&document.querySelector('#root').innerHTML.includes('demo-role-picker')`);run(`DEMO_PREVIEW.switchRole(DB.db.users.find(u=>u.roleId==='director'&&u.status==='active').id)`);return ok;})());
ok('Board preview seeds exactly 4,000 synthetic patients', patients.length===4000 && patients.every(p=>p.demo===true));
ok('Board preview register is balanced 50/50 between the two county offices',
  patients.filter(p=>p.countyId==='kisumu').length===2000 && patients.filter(p=>p.countyId==='homabay').length===2000);
ok('Two in five board-preview patients sit in the 60–80 day review window',
  patients.filter(p=>{const d=run(`PAT.days(DB.db.patients.find(x=>x.id==='${p.id}'))`);return d>=60&&d<=80;}).length===1600);
ok('Synthetic reference ages span 5–75 with no out-of-range records', Math.min(...patients.map(p=>p.age))===5 && Math.max(...patients.map(p=>p.age))===75 && patients.every(p=>p.age>=5 && p.age<=75));
ok('CareLink identifiers are unique and encode ministry area and intake date', new Set(patients.map(p=>p.code)).size===4000 && patients.every(p=>p.code.startsWith('CL-'+p.areaId.toUpperCase()+'-') && p.code.includes(String(p.intake).slice(0,10).replace(/-/g,''))));
ok('Child and adult clinical profiles include height, weight, BMI and MUAC', patients.filter(p=>p.age<18).length>0 && patients.every(p=>p.clinical.heightCm>0 && p.clinical.weightKg>0 && p.clinical.bmi>0 && p.clinical.muacMm>0));
ok('Generated longitudinal visits include anthropometry for every patient', patients.every(p=>db.visits.some(v=>v.patientId===p.id && v.heightCm>0 && v.weight>0 && v.bmi>0 && v.muacMm>0)));
const mcmDisease=run(`renderConditions(DB.db.users.find(u=>u.roleId==='mcm'&&u.status==='active'))`);
const caregiverDisease=run(`renderConditions(DB.db.users.find(u=>u.roleId==='caregiver'&&u.status==='active'))`);
ok('Clinical disease profile includes TB subtype/treatment history and anaemia severity', /Pulmonary TB|Extra-pulmonary TB/.test(mcmDisease) && /Treatment dates &amp; history/.test(mcmDisease) && /Severe|Moderate|Mild/.test(mcmDisease));
ok('Caregiver disease profile excludes sensitive HIV/TB diagnoses without clearance', !/HIV|Tuberculosis|Pulmonary TB|Extra-pulmonary TB/.test(caregiverDisease));
ok('Synthetic anaemia records carry a bounded severity classification', db.patientConditions.filter(c=>c.key==='anaemia').length>250 && db.patientConditions.filter(c=>c.key==='anaemia').every(c=>['Mild','Moderate','Severe'].includes(c.details.severity)));
ok('Default nonclinical preview role cannot open an individual clinical report',run(`PAT_DISCHARGE.renderSheet('${patients[0].id}',AUTH.user,{mode:'discharge'})`).includes('unavailable in this account scope'));
const printSheet=run(`PAT_DISCHARGE.renderSheet('${patients[0].id}',DB.db.users.find(u=>u.roleId==='mcm'&&u.countyId===DB.db.patients[0].countyId&&u.status==='active'),{mode:'discharge'})`);
ok('Scoped clinical discharge printout includes unsigned ink lines and rejects typed-name substitution',printSheet.includes('PHYSICAL SIGNATURES')&&printSheet.includes('Patient / Guardian signature')&&printSheet.includes('do not replace physical signatures')&&printSheet.includes('does not prove signatures or consent'));
const alertPatient=run(`(()=>{const p=DB.db.patients.find(p=>p.status==='active'&&p.caregiverId);return p?{p,cg:DB.db.users.find(u=>u.id===p.caregiverId)}:null})()`);
run(`notifyPatientCareTeam(DB.db.patients.find(p=>p.id==='${alertPatient.p.id}'),'Clinical concern needs review','Review the scoped patient record.','warn')`);
const routedRoles=run(`(()=>{const p=DB.db.patients.find(p=>p.id==='${alertPatient.p.id}');return DB.db.users.filter(u=>[p.caregiverId,...DB.db.users.filter(v=>v.roleId==='mcm'&&v.countyId===p.countyId).map(v=>v.id),...DB.db.users.filter(v=>v.roleId==='coordinator'&&(v.areaIds||[]).includes(p.areaId)).map(v=>v.id)].includes(u.id)).every(u=>DB.db.notifications.some(n=>n.userId===u.id&&n.title==='Clinical concern needs review'))})()`);
ok('Critical care-team alerts route to assigned caregiver, county MCM and area coordinators',routedRoles===true);
const dischargeFixture=run(`(()=>{const p=DB.db.patients.find(p=>p.status==='active'&&p.caregiverId);return p?{p,u:DB.db.users.find(u=>u.id===p.caregiverId)}:null})()`);
const dischargeTransition=run(`transition('patient','${dischargeFixture.p.id}','recommend_discharge',DB.db.users.find(u=>u.id==='${dischargeFixture.u.id}'),{reason:'Clinical targets met; confirm continuity plan and signed hard-copy discharge paperwork.'})`);
ok('Discharge readiness recommendation triggers a caregiver/team review notification',dischargeTransition.ok===true&&db.notifications.some(n=>n.userId===dischargeFixture.p.caregiverId&&n.title==='Discharge readiness review'));
const mcmPatient=run(`(()=>{const u=DB.db.users.find(u=>u.roleId==='mcm'&&u.status==='active');return DB.db.patients.find(p=>p.countyId===u.countyId)})()`);
const mcmId=run(`DB.db.users.find(u=>u.roleId==='mcm'&&u.status==='active').id`);
run(`AUTH.user=DB.db.users.find(u=>u.id==='${mcmId}')`);
const badTb=run(`COND.record(AUTH.user,{patientId:'${mcmPatient.id}',key:'tb',status:'confirmed',details:{tbType:'made-up',treatmentStartedAt:'2026-13-45'}})`);
const goodTb=run(`COND.record(AUTH.user,{patientId:'${mcmPatient.id}',key:'tb',status:'confirmed',details:{tbType:'Extra-pulmonary TB',treatmentStartedAt:'2026-01-10',expectedCompletionAt:'2026-07-10',treatmentHistory:'Clinical follow-up recorded'}})`);
ok('Clinical disease entry validates TB subtype/date and retains authorised structured treatment details',badTb.ok===false && goodTb.ok===true && goodTb.row.details.tbType==='Extra-pulmonary TB' && goodTb.row.details.treatmentHistory==='Clinical follow-up recorded');
ok('Preview uses an in-memory synthetic principal, not a login or hosted session', run(`AUTH.session.token`)==='local-read-only-demo' && run(`AUTH.user.demo`)===true);
const pdcaFixture = run(`(()=>{const p=DB.db.patients.find(p=>DB.db.pdcas.some(x=>x.patientId===p.id&&x.kind!=='review'&&x.owner===p.caregiverId)); return p?{p,rec:DB.db.pdcas.find(x=>x.patientId===p.id&&x.kind!=='review'&&x.owner===p.caregiverId)}:null})()`);
if(pdcaFixture){
  const mcm=run(`DB.db.users.find(u=>u.roleId==='mcm'&&u.countyId==='${pdcaFixture.p.countyId}')`);
  const caregiver=run(`DB.db.users.find(u=>u.id==='${pdcaFixture.p.caregiverId}')`);
  run(`AUTH.user=DB.db.users.find(u=>u.id==='${mcm.id}')`);
  const reviewed=run(`PDCAX.reviewAndComment(AUTH.user,'${pdcaFixture.rec.id}','Please correct the follow-up date and confirm the next clinical review.')`);
  ok('MCM review opens the PDCA thread with an audited first comment and notifies the caregiver', reviewed.ok===true && run(`DB.db.audit.some(a=>a.action==='pdca.discussion.reviewed'&&a.entityId==='${pdcaFixture.rec.id}') && DB.db.notifications.some(n=>n.userId==='${caregiver.id}'&&n.title==='PDCA reviewed; response requested')`));
  run(`AUTH.user=DB.db.users.find(u=>u.id==='${caregiver.id}')`);
  const reply=run(`PDCAX.replyDiscussion(AUTH.user,'${pdcaFixture.rec.id}','The follow-up date has been corrected and verified.')`);
  ok('Assigned caregiver can reply after case-manager review and notifies the MCM', reply.ok===true && run(`PDCAX.discussion(AUTH.user,'${pdcaFixture.rec.id}').rows.length===2 && DB.db.notifications.some(n=>n.userId==='${mcm.id}'&&n.title==='PDCA discussion updated')`));
  run(`AUTH.user=DB.db.users.find(u=>u.roleId==='hr')`);
  ok('Unrelated roles cannot view or reply to a PDCA discussion', run(`PDCAX.discussion(AUTH.user,'${pdcaFixture.rec.id}').allowed===false && PDCAX.replyDiscussion(AUTH.user,'${pdcaFixture.rec.id}','Unauthorized').ok===false`));
} else ok('A caregiver-owned PDCA fixture is available for discussion tests',false);
run(`AUTH.user=DB.db.users.find(u=>u.roleId==='director')`);
run('DB.save(); DB.persistState(); DB.saveLocalPrefs()');
ok('Save and direct persistence entry points cannot persist over prior local state or preferences',ctx.localStorage.getItem('lomamo_carelink_dims_v66')===before&&ctx.localStorage.getItem('carelink.prefs.v6')===beforePrefs&&run('DB.db.meta.localEditedAt')===undefined);
ok('Exit restores the previous local database and clears preview identity', (()=>{run('DEMO_PREVIEW.exit()'); return !run('DEMO_PREVIEW.active') && run('DB.db')===original && run('AUTH.user')===null;})());
ok('Audited PDCA discussion threads are included in backups and verified for referential integrity',run(`BACKUP.RECORD_KEYS.includes('pdcaDiscussions')&&DB.db.pdcaDiscussions.every(m=>DB.db.pdcas.some(p=>p.id===m.pdcaId))`));
ok('App-level click, submit and change guards keep preview workflows read-only',
  /const safe = new Set\(\['go','page','open-patient','patient-tab'/.test(require('fs').readFileSync(require('path').join(__dirname,'..','src','app.js'),'utf8')) &&
  /if\(DEMO_PREVIEW.active\)\{ e.preventDefault\(\)/.test(require('fs').readFileSync(require('path').join(__dirname,'..','src','app.js'),'utf8')));
console.log(`Board demo: ${pass} passed, ${fail} failed`);
if(fail) process.exit(1);
