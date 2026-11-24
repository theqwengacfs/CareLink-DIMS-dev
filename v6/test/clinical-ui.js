/* Synthetic view / export / backup compatibility assertions. */
const assert=require('node:assert/strict');
const {makeCtx}=require('./dom');
const {run,ctx,nodes}=makeCtx({setTimeout:()=>0,clearTimeout(){}});let checks=0;
run(`DB.db=DB.blank();DB.db.meta={schema:6,label:'Synthetic clinical UI fixture',synthetic:true};
 DB.db.users=[{id:'synthetic-cg',username:'caregiver.ombeyi',name:'Synthetic caregiver',roleId:'caregiver',countyId:'kisumu',areaIds:['ombeyi'],status:'active'},
  {id:'synthetic-mcm',username:'mcm.kisumu',name:'Synthetic MCM',roleId:'mcm',countyId:'kisumu',status:'active'}];
 DB.db.patients=[{id:'synthetic-p',code:'SYNTHETIC-CASE-UI',name:'Synthetic patient <script>not executable</script>',nationalId:'SYNTHETIC-NATIONAL-ID-ONE',
  countyId:'kisumu',areaId:'ombeyi',caregiverId:'synthetic-cg',status:'active',intake:'2028-03-02',careCycleId:'synthetic-cycle',
  clinical:{diagnosis:'Synthetic recorded diagnosis',chiefComplaints:'Synthetic recorded symptoms for seven days'},demo:true},
  {id:'synthetic-hidden',name:'Synthetic hidden patient',nationalId:'SYNTHETIC-HIDDEN-ID',countyId:'homabay',areaId:'makongeni',status:'discharged',discharge:'2027-06-30',demo:true}];
 AUTH.user=DB.db.users[0];SYNC.rebase();`);
function check(name,fn){fn();checks++;console.log('  ok  '+name);}
const J=code=>JSON.parse(run('JSON.stringify('+code+')'));
check('classification flags differ and use visible labels, not color alone',()=>{
 const html=run(`['2027-06-30','2026-06-30'].map(discharge=>CARE_REVIEW.flag({...DB.db.patients[0],status:'discharged',discharge},'2028-06-30')).join('')`);
 assert.match(html,/care-kind-repeat/);assert.match(html,/care-kind-returning/);assert.match(html,/within 12 months/);assert.match(html,/after 12 months/);
 assert.match(run('CARE_REVIEW.flag(null)'),/New \/ fresh/);
});
check('no missing clinical or demographic field is invented by data / template generation',()=>{
 const d=J(`CARE_REVIEW.data('synthetic-p',{mode:'120day'})`);
 assert.equal(d.status,'blank_template');assert.equal(d.evaluatedAt,'');assert.equal(d.fields.diagnoses,'Synthetic recorded diagnosis');
 for(const key of ['age','children','maritalStatus','education','heightCm','intakeWeightKg','currentWeightKg','currentBmi','aimDate','aimOutcome','adherence','labsStatus','estimatedDischargeDate'])assert.equal(d.fields[key],'',key);
 const html=run(`CARE_REVIEW.template(CARE_REVIEW.data('synthetic-p',{mode:'120day'}))`);
 assert.equal((html.match(/class="care-template-page"/g)||[]).length,2);assert.equal((html.match(/class="care-template-columns"/g)||[]).length,2);
 assert.match(html,/BLANK TEMPLATE/);assert.match(html,/Actual evaluation date/);assert.match(html,/next steps &amp; durations/);assert.match(html,/WITH durations/);
 assert.match(html,/&lt;script&gt;not executable&lt;\/script&gt;/);assert.equal(html.includes('<script>not executable'),false);
 const patientView=run(`renderPatient(AUTH.user,{id:'synthetic-p'})`);assert.match(patientView,/Sex not recorded/);assert.match(patientView,/Age not recorded/);
});
check('editable fields cover the supplied format, decimals and actual timestamp independently of milestone date',()=>{
 const fields=J('CARE_RULES.FIELDS.map(([key])=>key)');
 for(const key of ['aimDate','aimOutcome','aimFunction','symptoms','plan','actions','treatment','procedures','educationCounselling','resolvedSymptoms','newComplaints','adherence','anthropometry','actionStatus','nextSteps','clinicalReasons','labsStatus','recoveryNeeds','externalDelays','estimatedDischargeDate'])assert.ok(fields.includes(key),key);
 assert.match(run(`field('Synthetic decimal','heightCm','number',{value:'164.5'})`),/step="any"/);
 assert.match(run(`field('Synthetic office confirmation','officeConfirmed','checkbox',{required:true})`),/required/);
 const schedule=J(`PDCAX.schedule(DB.db.patients[0]).map(x=>x.day)`);assert.deepEqual(schedule,[30,60,90,120,150,180,210,240,270,300,330,360]);
});
check('identity matching is scoped; name / shared phone matches are human-review prompts only',()=>{
 assert.equal(J(`PMI.look(DB.db,'SYNTHETIC-HIDDEN-ID')`).matches.length,0);
 const match=J(`PMI.look(DB.db,'SYNTHETIC-NATIONAL-ID-ONE')`);assert.equal(match.matches.length,1);assert.equal(match.level,'national-id');
 assert.match(J(`PMI.verdict(PMI.look(DB.db,'Synthetic patient'))`).body,/name is not an identifier/);
 run(`DB.db.patients[0].phone='+1-202-555-0111';`);
 assert.match(J(`PMI.verdict(PMI.look(DB.db,'+1-202-555-0111'))`).body,/Families often share a phone/);
 assert.equal(run('DB.db.patients.length'),2);
});
check('prior-cycle support, legacy PDCA and summary notes remain visible without satisfying current slots',()=>{
 run(`DB.db.careCycles=[{id:'synthetic-prior',patientId:'synthetic-p',startedAt:'2027-01-01',dischargedAt:'2027-06-30',status:'discharged',snapshot:{summaryNotes:'Synthetic previous cycle summary',clinical:{chiefComplaints:'Synthetic old symptoms'},carePlan:{needs:'Synthetic prior support need',interventions:'Synthetic prior support'}}}];
  DB.db.support=[{id:'synthetic-support',patientId:'synthetic-p',cycleId:'synthetic-prior',date:'2027-03-01',type:'Synthetic historical support'}];
  DB.db.pdcas=[{id:'synthetic-legacy',patientId:'synthetic-p',cycleId:'synthetic-prior',kind:'review',dueDay:30,status:'closed',note:'Synthetic previous legacy PDCA'}];
  DB.db.visits=[{id:'synthetic-old-visit',patientId:'synthetic-p',cycleId:'synthetic-prior',date:'2027-03-01',notes:'Synthetic caregiver previous note'}];`);
 const html=run('CARE_REVIEW.history(AUTH.user,DB.db.patients[0],{priorOnly:true})');for(const phrase of ['Synthetic previous cycle summary','Synthetic historical support','Synthetic previous legacy PDCA','Synthetic caregiver previous note'])assert.ok(html.includes(phrase),phrase);
 assert.equal(run('PDCAX.schedule(DB.db.patients[0]).some(x=>x.completed)'),false);assert.equal(run('PAT.lastVisit(DB.db.patients[0])'),null);
 assert.match(run(`formEditor('home_visit','synthetic-p')`),/Home Visit #1/,'new-cycle home-visit cadence must not inherit previous visits');
});
check('revision exports use the selected immutable snapshot, not the latest mutable patient diagnosis',()=>{
 run(`DB.db.careReviews=[{id:'synthetic-review',patientId:'synthetic-p',cycleId:'synthetic-cycle',evaluatedAt:'2028-06-30T10:23:00.000Z',programmeDay:120,policyDays:120,status:'draft',version:2,
  fields:{...CARE_REVIEW.data('synthetic-p').fields,diagnoses:'Synthetic latest evaluation diagnosis',aimOutcome:'Synthetic actual measurable outcome'}}];
  DB.db.careReviewRevisions=[{id:'synthetic-revision-1',reviewId:'synthetic-review',patientId:'synthetic-p',cycleId:'synthetic-cycle',version:1,event:'created',status:'draft',at:'2028-06-30T10:24:00Z',by:'synthetic-cg',fields:CARE_RULES.cleanFields({diagnoses:'Synthetic exact first diagnosis'}),
   reportSnapshot:{id:'synthetic-review',patientId:'synthetic-p',cycleId:'synthetic-cycle',version:1,status:'draft',evaluatedAt:'2028-06-30T10:23:00.000Z',programmeDay:120}}];
  DB.db.patients[0].clinical.diagnosis='Synthetic later master diagnosis';`);
 const latest=J(`CARE_REVIEW.data('synthetic-p')`);assert.equal(latest.fields.diagnoses,'Synthetic latest evaluation diagnosis');
 run(`CARE_REVIEW.openReport('synthetic-review','synthetic-revision-1')`);
 const retained=nodes[nodes.length-1].innerHTML;
 assert.match(retained,/Synthetic exact first diagnosis/);assert.equal(retained.includes('Synthetic later master diagnosis'),false);assert.equal(retained.includes('Synthetic latest evaluation diagnosis'),false);
 run(`closeModal(true)`);
});
function unzipStored(input){const b=Buffer.from(input),out={};let i=0;while(b.readUInt32LE(i)===0x04034b50){assert.equal(b.readUInt16LE(i+8),0);const size=b.readUInt32LE(i+18),n=b.readUInt16LE(i+26),e=b.readUInt16LE(i+28),start=i+30+n+e;out[b.toString('utf8',i+30,i+30+n)]=b.toString('utf8',start,start+size);i=start+size;}assert.equal(b.readUInt32LE(i),0x02014b50);return out;}
check('Word is an actual OOXML document with two-spread core / two columns, all recorded fields and timestamp',()=>{
 const bytes=run(`CARE_REVIEW.wordBytes(CARE_REVIEW.data('synthetic-p'))`),zip=unzipStored(bytes);
 for(const name of ['[Content_Types].xml','_rels/.rels','word/document.xml','word/styles.xml','word/_rels/document.xml.rels'])assert.ok(zip[name],name);
 const xml=zip['word/document.xml'];assert.equal((xml.match(/<w:tbl>/g)||[]).length,2);assert.equal((xml.match(/w:type="page"/g)||[]).length,1);
 assert.equal((xml.match(/<w:gridCol /g)||[]).length,4);assert.match(xml,/Synthetic latest evaluation diagnosis/);assert.match(xml,/2028-06-30T10:23:00.000Z/);assert.match(xml,/Actual evaluation/);
 assert.match(xml,/Synthetic patient &lt;script&gt;/);assert.match(xml,/Treatment \/ interventions AND indications/);assert.match(xml,/Next steps AND durations/);
 assert.match(zip['[Content_Types].xml'],/wordprocessingml.document.main\+xml/);
 const discharge=unzipStored(run(`CARE_REVIEW.wordBytes(CARE_REVIEW.data('synthetic-p',{mode:'discharge'}))`));assert.match(discharge['word/document.xml'],/physical signatures/);assert.match(discharge['word/document.xml'],/do not prove physical signatures/);
});
check('cohort figures retain prior-cycle enrollment/discharge and never treat paper verification as enrollment',()=>{
 const {run:r}=makeCtx({setTimeout:()=>0,clearTimeout(){}});
 r(`DB.db=DB.blank();AUTH.user={id:'synthetic-report-mcm',username:'mcm.kisumu',roleId:'mcm',countyId:'kisumu',status:'active'};
  DB.db.patients=[{id:'synthetic-cohort',countyId:'kisumu',areaId:'ombeyi',status:'active',careCycleId:'synthetic-cohort-new',intake:'2028-07-10',assessmentDate:'2028-07-09',household:{orphansSupported:9}},
   {id:'synthetic-pending',countyId:'kisumu',areaId:'ombeyi',status:'awaiting_verification',intake:'2028-06-19',verifiedAt:'2028-06-20'}];
  DB.db.careCycles=[{id:'synthetic-cohort-old',patientId:'synthetic-cohort',startedAt:'2028-06-01',dischargedAt:'2028-06-30',snapshot:{assessmentDate:'2028-05-31',household:{orphansSupported:2}}},
   {id:'synthetic-cohort-new',patientId:'synthetic-cohort',startedAt:'2028-07-10',dischargedAt:'',snapshot:{assessmentDate:'2028-07-09'}}];
  DB.db.careReferrals=[{id:'synthetic-cohort-referral',patientId:'synthetic-cohort',evaluatedAt:'2028-07-09T10:00:00Z'}];`);
 const report=(start,end)=>JSON.parse(r(`JSON.stringify(REPORTS.patientFigures(AUTH.user,{period:{start:new Date('${start}T00:00:00+03:00'),end:new Date('${end}T23:59:59+03:00')}}))`));
 const june=report('2028-06-01','2028-06-30');assert.equal(june.enrolledPeriod.length,1);assert.equal(june.dischargedPeriod.length,1);assert.equal(june.active.length,0);assert.equal(june.opening.length,0);assert.equal(june.closingCalc,0);assert.equal(june.approved.length,1);
 const july=report('2028-07-01','2028-07-31');assert.equal(july.enrolledPeriod.length,1);assert.equal(july.dischargedPeriod.length,0);assert.equal(july.active.length,1);assert.equal(july.newAssessed.length,1);assert.equal(july.newAssessed[0].assessmentId,'synthetic-cohort-referral');assert.equal(july.closingCalc,july.active.length);
 assert.equal(r(`CARE_RULES.days({status:'discharged',intake:'2028-06-01',discharge:'2028-06-30'},'2028-06-10')`),9,'cutoff cannot include later discharged days');
 const may=report('2028-05-01','2028-05-31');assert.equal(may.newAssessed.length,1,'initial assessment remains in its own historical period');
 const midJune=report('2028-06-01','2028-06-15');assert.equal(midJune.orphans,2,'historic active cycle uses its retained household snapshot');
});
check('cutoff visit / overdue figures exclude future visits and inspect the cycle active at that cutoff',()=>{
 const {run:r}=makeCtx({setTimeout:()=>0,clearTimeout(){}});
 r(`DB.db=DB.blank();AUTH.user={id:'synthetic-cutoff-mcm',username:'mcm.kisumu',roleId:'mcm',countyId:'kisumu',status:'active'};
  DB.db.patients=[{id:'synthetic-cutoff',name:'Synthetic cutoff patient',countyId:'kisumu',areaId:'ombeyi',status:'active',careCycleId:'synthetic-cutoff-new',intake:'2028-07-10'}];
  DB.db.careCycles=[{id:'synthetic-cutoff-old',patientId:'synthetic-cutoff',startedAt:'2028-05-01',dischargedAt:'2028-06-30'},
   {id:'synthetic-cutoff-new',patientId:'synthetic-cutoff',startedAt:'2028-07-10'}];
  DB.db.visits=[{id:'synthetic-cutoff-future',patientId:'synthetic-cutoff',cycleId:'synthetic-cutoff-new',date:'2028-08-12'},
   {id:'synthetic-cutoff-latest',patientId:'synthetic-cutoff',cycleId:'synthetic-cutoff-new',date:'2028-07-10'},
   {id:'synthetic-old-future',patientId:'synthetic-cutoff',cycleId:'synthetic-cutoff-old',date:'2028-06-20'},
   {id:'synthetic-old-latest',patientId:'synthetic-cutoff',cycleId:'synthetic-cutoff-old',date:'2028-05-20'}];`);
 assert.equal(r(`REPORTS.patientDays(AUTH.user,{cutoff:'2028-08-10'}).rows[0].lastVisit.id`),'synthetic-cutoff-latest');
 const historical=JSON.parse(r(`JSON.stringify(REPORTS.patientFigures(AUTH.user,{period:{start:new Date('2028-06-01T00:00:00+03:00'),end:new Date('2028-06-15T23:59:59+03:00')}}))`));
 assert.equal(historical.overdue.length,1);assert.equal(historical.overdue[0].careCycleId,'synthetic-cutoff-old');
 const current=JSON.parse(r(`JSON.stringify(REPORTS.patientFigures(AUTH.user,{period:{start:new Date('2028-08-01T00:00:00+03:00'),end:new Date('2028-08-10T23:59:59+03:00')}}))`));assert.equal(current.overdue.length,1);
 r(`DB.db.visits=DB.db.visits.filter(v=>v.cycleId!=='synthetic-cutoff-new'||v.id==='synthetic-cutoff-future');`);
 assert.equal(r(`REPORTS.patientDays(AUTH.user,{cutoff:'2028-08-10'}).rows[0].lastVisit`),undefined,'a future-only visit is not a completed visit at cutoff');
});
check('paper verification never invents discharge facts or overwrites a later cycle',()=>{
 const {run:r}=makeCtx({setTimeout:()=>0,clearTimeout(){}});
 r(`DB.db=DB.blank();AUTH.user={id:'synthetic-verifier',username:'mcm.kisumu',roleId:'mcm',countyId:'kisumu',status:'active'};
  DB.db.patients=[{id:'synthetic-paper',countyId:'kisumu',areaId:'ombeyi',status:'active',intake:'2028-06-01',careCycleId:'synthetic-paper-new',clinical:{weightKg:50}}];
  DB.db.formRecords=[{id:'synthetic-paper-current',kind:'discharge',patientId:'synthetic-paper',cycleId:'synthetic-paper-new',status:'submitted',enteredBy:'synthetic-other-author',visitDate:'2028-06-30',data:{}},
   {id:'synthetic-paper-old',kind:'discharge',patientId:'synthetic-paper',cycleId:'synthetic-paper-old-cycle',status:'submitted',enteredBy:'synthetic-other-author',visitDate:'2027-06-30',data:{weightKg:'1',believer:'Yes',orphansPrevented:'12'}}];`);
 assert.equal(r(`FORMSX.verify(AUTH.user,'synthetic-paper-current').ok`),true);
 const facts=JSON.parse(r('JSON.stringify(DB.db.patients[0].dischargeProtocol)'));
 for(const k of ['shaActive','shaLastPaymentDate','believer','convertedDuringLomamo','completedCycle','repeatPatient','otherProgramsDetail'])assert.equal(facts[k],'',k);
 assert.equal(facts.orphansPrevented,null);assert.equal(facts.daysInProgram,null);
 assert.equal(r(`FORMSX.verify(AUTH.user,'synthetic-paper-old').ok`),true);assert.equal(r('DB.db.patients[0].clinical.weightKg'),50);assert.equal(r('DB.db.patients[0].dischargeProtocol.believer'),'');
});
check('new / legacy paper drafts bind their actual source date on submission and cannot relink retained forms',()=>{
 const {run:r}=makeCtx({setTimeout:()=>0,clearTimeout(){}});
 r(`DB.db=DB.blank();DB.db.users=[{id:'synthetic-paper-author',name:'Synthetic paper author',roleId:'caregiver',countyId:'kisumu',areaIds:['ombeyi'],status:'active'},
  {id:'synthetic-paper-verifier',username:'mcm.kisumu',roleId:'mcm',countyId:'kisumu',status:'active'}];AUTH.user=DB.db.users[0];
  DB.db.patients=[{id:'synthetic-draft-patient',name:'Synthetic paper patient',countyId:'kisumu',areaId:'ombeyi',caregiverId:'synthetic-paper-author',status:'active',intake:'2028-06-01',careCycleId:'synthetic-draft-current',clinical:{weightKg:50}}];
  DB.db.careCycles=[{id:'synthetic-draft-prior',patientId:'synthetic-draft-patient',startedAt:'2027-01-01',dischargedAt:'2027-06-30'},
   {id:'synthetic-draft-current',patientId:'synthetic-draft-patient',startedAt:'2028-06-01'}];
  globalThis.__paperData={visitDate:'2027-03-01',caregiverName:'Synthetic paper author',foodBagLeft:'No food bag left',atHome:'Yes',conditionToday:'Synthetic recorded condition',caregiverRecommendation:'Synthetic documented follow-up',weightKg:'12'};
  globalThis.__paperDraft=FORMSX.saveDraft(AUTH.user,{kind:'home_visit',patientId:'synthetic-draft-patient',data:__paperData});`);
 assert.equal(r('__paperDraft.ok'),true);assert.equal(r('__paperDraft.rec.cycleId'),'synthetic-draft-prior');
 assert.equal(r(`FORMSX.submit(AUTH.user,{kind:'home_visit',id:__paperDraft.rec.id,patientId:'synthetic-draft-patient',data:__paperData}).ok`),true);
 assert.equal(r(`FORMSX.verify(DB.db.users[1],__paperDraft.rec.id).ok`),true);assert.equal(r('DB.db.patients[0].clinical.weightKg'),50);
 r(`DB.db.formRecords.push({id:'synthetic-legacy-draft',kind:'home_visit',patientId:'synthetic-draft-patient',status:'draft',enteredBy:AUTH.user.id});__paperData.visitDate='2027-04-01';`);
 assert.equal(r(`FORMSX.submit(AUTH.user,{kind:'home_visit',id:'synthetic-legacy-draft',patientId:'synthetic-draft-patient',data:__paperData}).rec.cycleId`),'synthetic-draft-prior');
 assert.equal(r(`FORMSX.verify(DB.db.users[1],'synthetic-legacy-draft').ok`),true);assert.equal(r('DB.db.patients[0].clinical.weightKg'),50);
 r(`__paperData.visitDate='2028-06-02';globalThis.__correctedDraft=FORMSX.saveDraft(AUTH.user,{kind:'home_visit',patientId:'synthetic-draft-patient',data:__paperData});__paperData.visitDate='2027-05-01';`);
 assert.equal(r('__correctedDraft.rec.cycleId'),'synthetic-draft-current');
 assert.equal(r(`FORMSX.submit(AUTH.user,{kind:'home_visit',id:__correctedDraft.rec.id,patientId:'synthetic-draft-patient',data:__paperData}).rec.cycleId`),'synthetic-draft-prior','correcting a draft date cannot keep its stale new-cycle attribution');
 const before=r('JSON.stringify(DB.db.formRecords)');
 for(const method of ['saveDraft','submit']){
  assert.equal(r(`FORMSX.${method}(AUTH.user,{kind:'home_visit',id:__correctedDraft.rec.id,patientId:'synthetic-draft-patient',data:__paperData}).ok`),false,'submitted source cannot be rewritten');
  assert.equal(r(`FORMSX.${method}(AUTH.user,{kind:'hospital_outpatient',id:__correctedDraft.rec.id,patientId:'synthetic-draft-patient',data:__paperData}).ok`),false,'record cannot change form type');
 }
 assert.equal(r('JSON.stringify(DB.db.formRecords)'),before);
});
check('live hardcopy / partner desks cannot seed fabricated source packets, enrollment or specialist concurrence',()=>{
 run(`DB.db.meta={schema:6,label:'Hosted production fixture'};DB.db.patients.forEach(p=>delete p.demo);DB.db.hardcopyBatches=[];DB.db.intlPdcaDossiers=[];DB.db.handoverPackets=[];DB.db.cccReferrals=[];
  DISCHARGE_HARDCOPY.ensureStore();HANDOVER_PARTNERS.ensureStore();`);
 assert.equal(run('DB.db.hardcopyBatches.length'),0);assert.equal(run('DB.db.intlPdcaDossiers.length'),0);assert.equal(run('DB.db.handoverPackets.length'),0);assert.equal(run('DB.db.patients.some(p=>p.dischargeAdvisory)'),false);
 const p=J(`(()=>{const p={id:'synthetic-fd',countyId:'kisumu',areaId:'ombeyi',status:'active',intake:'2028-03-02'};PAT_DISCHARGE.captureReferralFromForm(p,{get:()=>''},AUTH.user);return p;})()`);
 assert.equal(p.dischargeReferral,undefined);assert.equal(p.dischargeProtocol,undefined);
 const form=run('PAT_DISCHARGE.referralFieldsHTML(DB.db.patients[0])');assert.equal(form.includes('value="Signed on physical hard copy'),false);assert.equal(form.includes('value="JOOTRH Specialist'),false);
});
check('backup includes clinical parents / child sources, rejects orphan revisions and never activates a hosted restore',()=>{
 run(`DB.db.supportIssues=[];DB.db.clinicalRx=[];DB.db.omahaPlans=[];DB.db.formRecords=[];DB.db.programAdmissions=[];DB.db.careEvidence=[];DB.db.careReferrals=[];DB.db.intlPdcaDossiers=[];
  const b=BACKUP.create(AUTH.user,'Synthetic clinical backup');globalThis.__clinicalBackupId=b.id;`);
 const b=J('DB.db.backups[0]');
 for(const key of ['careCycles','careReferrals','careEvidence','programAdmissions','careReviews','careReviewRevisions','intlPdcaDossiers','support','supportIssues','clinicalRx','formRecords'])assert.equal(typeof b.counts[key],'number',key);
 assert.equal(run('BACKUP.validate(AUTH.user,__clinicalBackupId).ok'),true);
 run(`const cb=DB.db.backups.find(b=>b.id===__clinicalBackupId),copy=JSON.parse(cb.payload);copy.careReviewRevisions[0].reviewId='synthetic-missing-parent';cb.payload=JSON.stringify(copy);cb.digest=fnv1a(cb.payload);`);
 assert.equal(run('BACKUP.validate(AUTH.user,__clinicalBackupId).ok'),false);
 const before=run('JSON.stringify(DB.db.patients)');run(`SYNC.storeToken('synthetic-hosted-session');`);
 assert.equal(run(`BACKUP.activate(AUTH.user,'synthetic-no-approval').ok`),false);assert.equal(run('JSON.stringify(DB.db.patients)'),before);
});
check('Chief default role stays nonclinical; the existing audited target-account lens retains scoped read access',()=>{
 run(`AUTH.user={id:'synthetic-chief',username:'chief.admin',roleId:'chief',countyId:'kisumu'};`);
 assert.equal(run('CARE_WORKFLOW.canSee(AUTH.user,DB.db.patients[0])'),false);assert.equal(run(`CARE_REVIEW.data('synthetic-p')`),null);
 assert.equal(run(`CARE_WORKFLOW.run(DB.db,AUTH.user,'enrol_fresh',{patientId:'synthetic-p',officeConfirmed:true}).code`),'clinical_scope_denied');
 assert.equal(run('CARE_WORKFLOW.writer(AUTH.user,DB.db.patients[0],{},DB.db)'),false);
 run(`AUTH.user=DB.db.users.find(u=>u.id==='synthetic-mcm');`);assert.ok(run(`CARE_REVIEW.data('synthetic-p')`));
});
console.log(`Clinical UI/export: ${checks} policy groups passed`);
