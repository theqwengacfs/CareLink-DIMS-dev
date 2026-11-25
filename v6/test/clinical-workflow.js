/* Deterministic, synthetic calendar / cycle / PDCA policy regressions.
   Pure domain module: no hosted API, real patients, external services or files. */
const assert=require('node:assert/strict');
const R=require('../src/care_rules'),W=require('../src/care_workflow');
const now='2028-06-30T12:34:00.000Z';let serial=0,checks=0;
const users={
  cg:{id:'synthetic-cg',username:'caregiver.nairobird',roleId:'caregiver',countyId:'kisumu',areaIds:['nairobird'],status:'active'},
  coord:{id:'synthetic-coord',username:'coord.nairobird',roleId:'coordinator',countyId:'kisumu',areaIds:['nairobird'],status:'active'},
  mcm:{id:'synthetic-mcm',username:'mcm.kisumu',roleId:'mcm',countyId:'kisumu',areaIds:[],status:'active'},
  hb:{id:'synthetic-hb-mcm',username:'mcm.homabay',roleId:'mcm',countyId:'homabay',status:'active'},
  admin:{id:'synthetic-admin',username:'kisumu.admin',roleId:'countyadmin',countyId:'kisumu',status:'active'},
  intl:{id:'synthetic-intl',username:'intl.medical',roleId:'intl.medical',countyId:'kisumu',status:'active'}
};
const patient=(id,start='2028-03-02')=>({id,code:'SYNTHETIC-'+id,name:'Synthetic Case '+id,countyId:'kisumu',areaId:'nairobird',
  caregiverId:users.cg.id,status:'active',intake:start,clinical:{diagnosis:'Synthetic documented prior diagnosis',chiefComplaints:'Synthetic prior symptoms for two weeks',allergies:['Synthetic allergy']},demo:true});
function fixture(){return {users:Object.values(users),patients:[patient('long'),patient('short','2028-05-31'),
  {...patient('return','2027-01-01'),status:'discharged',discharge:'2027-06-30',dischargedAt:'2027-06-30',notes:'Synthetic previous support summary'},
  {...patient('fresh','2028-06-25'),status:'approved_enrolment'}],visits:[{id:'synthetic-visit',patientId:'return',date:'2027-03-01',notes:'Synthetic old caregiver clinical note'}],
  pdcas:[{id:'synthetic-legacy-review',patientId:'return',kind:'review',dueDay:30,due:'2027-01-31',note:'Synthetic previous PDCA',status:'closed',completedAt:'2027-02-01'}],
  support:[{id:'synthetic-support',patientId:'return',date:'2027-03-01',type:'Synthetic recorded support'}],notifications:[],settings:{programme:{reviewCadence:7,maxReviews:99}}};}
const complete=()=>R.cleanFields(Object.fromEntries(R.FIELDS.map(([k,label,type])=>[k,type==='date'?'2028-12-01':type==='number'?'1':'Synthetic recorded '+label])));
const act=(db,user,command,payload,at=now)=>{const r=W.run(db,user,command,payload,{now:at,id:prefix=>prefix+'-synthetic-'+(++serial)});if(r.ok)W.apply(db,r.patches);return r;};
function denied(db,user,command,payload,code){const before=JSON.stringify(db),r=act(db,user,command,payload);assert.equal(r.ok,false,JSON.stringify(r));if(code)assert.equal(r.code,code);assert.equal(JSON.stringify(db),before,'a refusal is transactional');return r;}
function good(db,user,command,payload){const r=act(db,user,command,payload);assert.equal(r.ok,true,JSON.stringify(r));return r.rec;}
function check(name,fn){fn();checks++;console.log('  ok  '+name);}
const plan={needs:'Synthetic new need',objectives:'Synthetic measurable objective',interventions:'Synthetic agreed support',expectedDays:60,rationale:'Synthetic documented office reason',officeConfirmed:true};
check('calendar anniversary is inclusive, day after is returning, leap day clamps',()=>{
 const p={...patient('calendar'),status:'discharged',discharge:'2027-06-30'};
 assert.equal(R.classify(p,'2028-06-30').kind,'repeat');assert.equal(R.classify(p,'2028-07-01').kind,'returning');
 assert.equal(R.anniversary('2024-02-29'),'2025-02-28');p.discharge='2024-02-29';
 assert.equal(R.classify(p,'2025-02-28').kind,'repeat');assert.equal(R.classify(p,'2025-03-01').kind,'returning');
 assert.equal(R.anniversary('2026-02-30'),'');
});
check('Kenyan civil calendar handles midnight independently of UTC / input offset',()=>{
 const p={...patient('clock'),status:'discharged',discharge:'2027-06-30'};
 assert.equal(R.classify(p,'2028-06-30T20:59:59Z').kind,'repeat');
 assert.equal(R.classify(p,'2028-06-30T21:00:00Z').kind,'returning');
 assert.equal(R.classify(p,'2028-07-01T00:00:00+03:00').kind,'returning');
 assert.equal(R.programDate('2028-07-01'),'2028-07-01');
});
check('fresh / pending / missing or invalid discharge evidence is not invented',()=>{
 assert.equal(R.classify(null).kind,'new');assert.equal(R.classify({...patient('fresh'),status:'assessment_initiated'}).kind,'new');
 assert.equal(R.classify(patient('ongoing')).kind,'history_review');
 assert.equal(R.classify({...patient('bad'),status:'discharged',discharge:'2028-09-01'},now).kind,'history_review');
 assert.deepEqual(R.REVIEW_DAYS,[30,60,90,120,150,180,210,240,270,300,330,360]);
});
check('no field or administration enrollment, and office confirmation is mandatory',()=>{
 const db=fixture();denied(db,users.cg,'enrol_fresh',{patientId:'fresh',...plan},'mcm_office_required');
 denied(db,users.coord,'enrol_fresh',{patientId:'fresh',...plan},'mcm_office_required');
 denied(db,users.admin,'enrol_fresh',{patientId:'fresh',...plan},'mcm_office_required');
 denied(db,users.mcm,'enrol_fresh',{patientId:'fresh',...plan,officeConfirmed:false});
 const p=good(db,users.mcm,'enrol_fresh',{patientId:'fresh',...plan});assert.equal(p.status,'active');assert.equal(p.intake,'2028-06-30');assert.equal(db.careCycles.length,1);
 denied(db,users.mcm,'enrol_fresh',{patientId:'fresh',...plan});
});
check('return assessment needs confirmed identity, new complaint comparison and new real source citations',()=>{
 const db=fixture(),payload={patientId:'return',identityConfirmed:true,evaluatedAt:now,newComplaints:'Synthetic new complaint for three days',comparison:'Synthetic comparison with prior cycle',evidence:[{sourceDate:'2028-06-29',facility:'Synthetic test facility',reference:'SYNTHETIC-NEW-DOCUMENT'}]};
 denied(db,users.cg,'assess_return',{...payload,identityConfirmed:false});denied(db,users.cg,'assess_return',{...payload,comparison:''});
 denied(db,users.cg,'assess_return',{...payload,evidence:[]});denied(db,users.cg,'assess_return',{...payload,evidence:[{...payload.evidence[0],sourceDate:'2026-01-01'}]});
 denied(db,users.cg,'assess_return',{...payload,evidence:[{...payload.evidence[0],reference:''}]});
 db.documents=[{id:'synthetic-claimed-scan',patientId:'return',fileStored:true,fileId:'synthetic-no-stored-bytes'}];
 denied(db,users.cg,'assess_return',{...payload,evidence:[{...payload.evidence[0],attachmentDocumentId:'synthetic-claimed-scan'}]});
 const ref=good(db,users.cg,'assess_return',payload);assert.equal(ref.kind,'repeat');assert.equal(ref.status,'pending_mcm');
 assert.deepEqual(ref.countyMcmIds,[users.mcm.id]);assert.ok(db.notifications.some(n=>n.userId===users.mcm.id));assert.ok(!db.notifications.some(n=>n.userId===users.hb.id));
 assert.equal(db.patients.find(p=>p.id==='return').status,'discharged');assert.equal(db.careEvidence[0].medium,'physical_source_reference');assert.equal(db.careEvidence[0].verifiedAt,'');
 denied(db,users.cg,'assess_return',payload,'pending_assessment_exists');
});
check('MCM decision reuses identity, retains legacy support/PDCA/notes and starts a separate cycle',()=>{
 const db=fixture(),p=db.patients.find(p=>p.id==='return');
 const ref=good(db,users.cg,'assess_return',{patientId:p.id,identityConfirmed:true,evaluatedAt:now,newComplaints:'Synthetic new complaint for three days',comparison:'Synthetic prior/new comparison',evidence:[{sourceDate:'2028-06-29',facility:'Synthetic facility',reference:'SYNTHETIC-NEW-DOC'}]});
 const oldCycle=R.cycleId(p),oldSnapshot=JSON.stringify(db.careCycles[0].snapshot),oldCount=db.patients.length;
 const payload={patientId:p.id,id:ref.id,version:1,decision:'enrol',reason:'Synthetic MCM office approval',evidenceReviewed:true,...plan};
 denied(db,users.cg,'decide_referral',payload,'mcm_office_required');denied(db,users.mcm,'decide_referral',{...payload,evidenceReviewed:false});
 const next=good(db,users.mcm,'decide_referral',payload);
 assert.equal(next.id,p.id);assert.equal(db.patients.length,oldCount);assert.notEqual(next.careCycleId,oldCycle);assert.equal(db.careCycles.length,2);
 assert.equal(db.careCycles.find(c=>c.id===oldCycle).snapshot.clinical.diagnosis,'Synthetic documented prior diagnosis');
 assert.equal(db.visits[0].cycleId,oldCycle);assert.equal(db.pdcas[0].cycleId,oldCycle);assert.equal(db.support[0].cycleId,oldCycle);
 assert.equal(db.careEvidence[0].verifiedBy,users.mcm.id);assert.equal(next.clinical.chiefComplaints,'Synthetic new complaint for three days');assert.deepEqual(next.clinical.allergies,['Synthetic allergy']);
 assert.equal(next.discharge,null);assert.equal(next.dischargeReferral,null);assert.equal(db.careReferrals[0].status,'enrolled');assert.equal(db.careCycles.find(c=>c.id===oldCycle).snapshot.summaryNotes,'Synthetic previous support summary');
 assert.ok(oldSnapshot.includes('Synthetic previous support summary'));denied(db,users.mcm,'decide_referral',payload,'clinical_version_conflict');
});
check('scope includes only the account-specific two-county lead MCM exception',()=>{
 const db=fixture();db.patients.push({...patient('homa'),countyId:'homabay',areaId:'makongeni'});
 denied(db,users.cg,'create_review',{patientId:'homa',evaluatedAt:now,fields:{}},'clinical_scope_denied');
 assert.equal(W.canSee(users.mcm,db.patients.at(-1)),true);assert.equal(W.canSee({...users.mcm,username:'mcm.homabay',countyId:'homabay'},db.patients[0]),false);
 assert.equal(W.canSee({...users.coord,areaIds:['manyatta']},db.patients[0]),false);
});
check('below120 caregiver/coordinator authoring, fixed milestones, actual evaluation time and immutable due date',()=>{
 const db=fixture();denied(db,users.mcm,'create_review',{patientId:'short',dueDay:30,evaluatedAt:now,fields:complete()},'pdca_preparer_required');
 denied(db,users.cg,'create_review',{patientId:'short',dueDay:45,evaluatedAt:now,fields:complete()});
 const r=good(db,users.coord,'create_review',{patientId:'short',dueDay:30,evaluatedAt:'2028-06-29T09:23:00+03:00',fields:complete()});
 assert.equal(r.dueDate,'2028-06-30');assert.equal(r.evaluatedAt,'2028-06-29T06:23:00.000Z');assert.equal(r.programmeDay,29);
 denied(db,users.cg,'create_review',{patientId:'short',dueDay:30,evaluatedAt:now,fields:complete()},'scheduled_review_exists');
 good(db,users.cg,'create_review',{patientId:'short',evaluatedAt:now,fields:complete()});assert.equal(db.careReviews.length,2);
});
check('a blank stays blank, required clinical content cannot be auto-invented at submission',()=>{
 const db=fixture();let r=good(db,users.cg,'create_review',{patientId:'short',evaluatedAt:now,fields:{}});
 assert.equal(r.fields.diagnoses,'');assert.equal(r.fields.adherence,'');assert.equal(r.fields.heightCm,'');assert.equal(r.fields.children,'');
 denied(db,users.cg,'submit_review',{id:r.id,version:r.version});
 assert.match(R.validateFields({...complete(),aimDate:'2028-02-30'}),/valid/);assert.match(R.validateFields({...complete(),heightCm:'-1'}),/non-negative/);
 const overlong='Synthetic long clinical narrative. '.repeat(200);assert.ok(overlong.length>4000);assert.equal(R.cleanFields({plan:overlong}).plan,overlong.trim());
 denied(db,users.cg,'create_review',{patientId:'short',evaluatedAt:now,fields:{plan:overlong}});
 denied(db,users.cg,'save_review',{id:r.id,version:r.version,fields:{plan:overlong}});
 assert.equal(db.careReviews[0].fields.plan,'');assert.equal(db.careReviewRevisions.length,1,'oversize save creates no partial / truncated revision');
});
check('under120 scheduling / Beneficiary Archive require MCM review first, retain all revisions',()=>{
 const db=fixture();let r=good(db,users.cg,'create_review',{patientId:'short',evaluatedAt:now,fields:complete()});
 denied(db,users.cg,'schedule_review',{id:r.id,version:r.version,nextReviewAt:'2028-07-30T10:00:00Z'},'pdca_mcm_review_required');
 denied(db,users.cg,'archive_review',{id:r.id,version:r.version},'pdca_mcm_review_required');
 r=good(db,users.cg,'submit_review',{id:r.id,version:r.version});denied(db,users.cg,'review_report',{id:r.id,version:r.version,comment:'Synthetic comment'},'mcm_required');
 denied(db,users.mcm,'review_report',{id:r.id,version:r.version,comment:''});r=good(db,users.mcm,'review_report',{id:r.id,version:r.version,comment:'Synthetic county MCM review'});
 r=good(db,users.coord,'schedule_review',{id:r.id,version:r.version,nextReviewAt:'2028-07-30T10:00:00+03:00'});assert.equal(db.calendarEvents[0].start,'2028-07-30T07:00:00.000Z');
 r=good(db,users.cg,'archive_review',{id:r.id,version:r.version});assert.equal(r.status,'archived');assert.equal(db.careReviewRevisions.length,5);
 assert.equal(db.careReviewRevisions[0].reportSnapshot.authorizedAt,undefined);
 assert.equal(db.careReviewRevisions[0].reportSnapshot.fields,undefined,'clinical fields are retained once, not duplicated inside each snapshot');
 denied(db,users.mcm,'share_review',{id:r.id,version:r.version},'pdca_authorization_required');
});
check('120+ without foundation admission is prepared by caregiver/coordinator, not all long-stay cases by MCM',()=>{
 const db=fixture();assert.equal(R.days(db.patients[0],now),120);
 denied(db,users.mcm,'create_review',{patientId:'long',evaluatedAt:now,fields:complete()},'pdca_preparer_required');
 assert.equal(good(db,users.coord,'create_review',{patientId:'long',evaluatedAt:now,fields:complete()}).preparedRole,'coordinator');
 db.encounters=[{id:'synthetic-inpatient',patientId:'long',type:'inpatient',foundationSupported:true,programSupported:true}];assert.equal(R.supportedAdmission(db.patients[0],db),false,'untrusted client inpatient checkbox is not foundation support provenance');
});
check('past supported hospitalization, including prior cycles, requires MCM preparation at day120',()=>{
 const db=fixture();denied(db,users.cg,'record_admission',{patientId:'long'},'mcm_required');
 const a=good(db,users.mcm,'record_admission',{patientId:'long',foundationSupported:true,admittedAt:'2027-03-01',dischargedAt:'2027-03-07',sourceReviewed:true,supportReference:'SYNTHETIC-SUPPORT-AUTH',
 evidence:{sourceDate:'2027-03-07',facility:'Synthetic hospital',reference:'SYNTHETIC-HOSPITAL-DOC'}});
 assert.equal(a.foundationSupported,true);assert.notEqual(a.cycleId,R.cycleId(db.patients[0]));assert.equal(R.supportedAdmission(db.patients[0],db),true);
 denied(db,users.cg,'create_review',{patientId:'long',evaluatedAt:now,fields:complete()},'pdca_preparer_required');
 assert.equal(good(db,users.mcm,'create_review',{patientId:'long',evaluatedAt:now,fields:complete()}).preparedBy,users.mcm.id);
});
check('every120+ review requires MCM comments → caregiver saved corrections → resubmit → authorization → explicit sharing',()=>{
 const db=fixture();let r=good(db,users.cg,'create_review',{patientId:'long',evaluatedAt:now,fields:complete()});
 denied(db,users.mcm,'authorize_review',{id:r.id,version:r.version,comment:'Synthetic authorization'},'pdca_review_chain_required');
 r=good(db,users.cg,'submit_review',{id:r.id,version:r.version});denied(db,users.mcm,'review_report',{id:r.id,version:r.version,comment:'Synthetic comments'});
 r=good(db,users.mcm,'review_report',{id:r.id,version:r.version,comment:'Synthetic MCM comments, correct next action duration',hospitalizationChecked:true});assert.equal(r.status,'corrections_requested');
 denied(db,users.mcm,'authorize_review',{id:r.id,version:r.version,comment:'Synthetic auth'},'pdca_review_chain_required');
 denied(db,users.cg,'resubmit_review',{id:r.id,version:r.version,correctionNote:'Synthetic corrections'},'caregiver_corrections_required');
 denied(db,users.coord,'save_review',{id:r.id,version:r.version,fields:complete()},'pdca_preparer_required');
 const oldVersion=r.version,oldFields=JSON.stringify(r.fields);r=good(db,users.cg,'save_review',{id:r.id,version:r.version,fields:{...complete(),nextSteps:'Synthetic corrected next step for fourteen days'},correctionNote:'Synthetic duration corrected'});
 denied(db,users.cg,'save_review',{id:r.id,version:oldVersion,fields:complete()},'clinical_version_conflict');
 r=good(db,users.cg,'resubmit_review',{id:r.id,version:r.version});denied(db,users.cg,'authorize_review',{id:r.id,version:r.version,comment:'Attempted'},'mcm_required');
 r=good(db,users.mcm,'authorize_review',{id:r.id,version:r.version,comment:'Synthetic MCM sharing authorization'});assert.equal((db.intlPdcaDossiers||[]).length,0,'authorization alone does not transmit');
 denied(db,{...users.cg,id:'another-caregiver'},'share_review',{id:r.id,version:r.version},'pdca_authorization_required');
 assert(db.notifications.some(n=>n.userId===users.cg.id&&/authorized for international sharing/.test(n.title)));
 const authRevision=r.authorizedRevisionId;r=good(db,users.cg,'share_review',{id:r.id,version:r.version});assert.equal(r.status,'shared');assert.equal(db.intlPdcaDossiers[0].authorizedRevisionId,authRevision);assert.equal(db.intlPdcaDossiers[0].sharedBy,users.cg.id);
 assert.equal(db.intlPdcaDossiers[0].fields.nextSteps,'Synthetic corrected next step for fourteen days');assert.equal(db.careReviewRevisions[0].fields.nextSteps,JSON.parse(oldFields).nextSteps);
 denied(db,users.cg,'save_review',{id:r.id,version:r.version,fields:complete()});
 const dossier=db.intlPdcaDossiers[0];denied(db,users.mcm,'international_review',{id:dossier.id,version:1,decision:'reviewed_concurred',recommendation:'Attempted'},'international_scope_denied');
 const advisory=good(db,users.intl,'international_review',{id:dossier.id,version:1,decision:'awaiting_intl_review',recommendation:'Synthetic specialist requests further documented result'});assert.equal(advisory.advisories.length,1);
});
check('prior-cycle reviews are retained read-only; old review completion cannot fill a new scheduled slot',()=>{
 const db=fixture();let r=good(db,users.cg,'create_review',{patientId:'short',dueDay:30,evaluatedAt:now,fields:complete()});
 db.patients.find(p=>p.id==='short').careCycleId='synthetic-next-cycle';
 denied(db,users.cg,'save_review',{id:r.id,version:r.version,fields:complete()});
 const next=good(db,users.cg,'create_review',{patientId:'short',dueDay:30,evaluatedAt:now,fields:complete()});assert.notEqual(next.id,r.id);assert.notEqual(next.cycleId,r.cycleId);
});
check('invalid normalized timestamps are rejected and legacy cycle IDs use the same Kenyan civil day',()=>{
 const db=fixture();assert.equal(R.programDate('2028-02-30T12:00:00Z'),'');assert.equal(R.programDate('2028-06-30T12:00:00'),'');
 denied(db,users.cg,'create_review',{patientId:'short',evaluatedAt:'2028-02-30T12:00:00Z',fields:complete()});
 const p={...patient('civil-id'),intake:'2028-06-30T21:30:00Z'};assert.equal(R.cycleStart(p),'2028-07-01');assert.match(R.cycleId(p),/:2028-07-01$/);
 assert.equal(R.days(p,'2028-07-01T21:00:00Z'),1);
});
check('a draft crossing day119 → 120 cannot evade MCM preparation after a supported admission',()=>{
 const db=fixture();db.patients[1].intake='2028-03-03';
 good(db,users.mcm,'record_admission',{patientId:'short',foundationSupported:true,admittedAt:'2028-04-01',dischargedAt:'2028-04-05',sourceReviewed:true,supportReference:'SYNTHETIC-PAST-SUPPORT',evidence:{sourceDate:'2028-04-05',facility:'Synthetic hospital',reference:'SYNTHETIC-PAST-DOCUMENT'}});
 let r=good(db,users.cg,'create_review',{patientId:'short',evaluatedAt:now,fields:complete()});assert.equal(r.policyDays,119);
 let outcome=act(db,users.cg,'submit_review',{id:r.id,version:r.version},'2028-07-01T12:00:00Z');assert.equal(outcome.code,'pdca_preparer_required');
 outcome=act(db,users.mcm,'submit_review',{id:r.id,version:r.version},'2028-07-01T12:00:00Z');assert.equal(outcome.ok,false,'MCM must actually re-prepare, not just press submit');
 outcome=act(db,users.mcm,'save_review',{id:r.id,version:r.version,fields:complete()},'2028-07-01T12:00:00Z');assert.equal(outcome.ok,true);r=outcome.rec;
 outcome=act(db,users.mcm,'submit_review',{id:r.id,version:r.version},'2028-07-01T12:00:00Z');assert.equal(outcome.ok,true);assert.equal(outcome.rec.policyDays,120);
});
check('already-submitted below120 evaluation keeps its policy; later opening does not rewrite that evaluation',()=>{
 const db=fixture();db.patients[1].intake='2028-03-03';let r=good(db,users.cg,'create_review',{patientId:'short',evaluatedAt:now,fields:complete()});r=good(db,users.cg,'submit_review',{id:r.id,version:r.version});
 let outcome=act(db,users.mcm,'review_report',{id:r.id,version:r.version,comment:'Synthetic later county review of day119 evaluation'},'2028-07-05T12:00:00Z');assert.equal(outcome.ok,true);r=outcome.rec;assert.equal(r.status,'reviewed');assert.equal(r.policyDays,119);assert.equal(r.evaluatedAt,now);
 outcome=act(db,users.cg,'archive_review',{id:r.id,version:r.version},'2028-07-05T12:00:00Z');assert.equal(outcome.ok,true);
});
check('newly discovered supported admission cannot bypass MCM re-preparation at authorization',()=>{
 const db=fixture();let r=good(db,users.cg,'create_review',{patientId:'long',evaluatedAt:now,fields:complete()});r=good(db,users.cg,'submit_review',{id:r.id,version:r.version});
 r=good(db,users.mcm,'review_report',{id:r.id,version:r.version,comment:'Synthetic initial comments',hospitalizationChecked:true});
 r=good(db,users.cg,'save_review',{id:r.id,version:r.version,evaluatedAt:'2028-06-29T12:00:00Z',fields:complete(),correctionNote:'Synthetic corrections'});assert.equal(r.evaluatedAt,now,'corrections do not pretend a new evaluation occurred');
 r=good(db,users.cg,'resubmit_review',{id:r.id,version:r.version});
 good(db,users.mcm,'record_admission',{patientId:'long',foundationSupported:true,admittedAt:'2028-04-01',dischargedAt:'2028-04-05',sourceReviewed:true,supportReference:'SYNTHETIC-LATE-PROVENANCE',evidence:{sourceDate:'2028-04-05',facility:'Synthetic hospital',reference:'SYNTHETIC-DISCOVERED-DOC'}});
 denied(db,users.mcm,'authorize_review',{id:r.id,version:r.version,comment:'Synthetic attempted authorization'},'pdca_mcm_repreparation_required');
 r=good(db,users.mcm,'review_report',{id:r.id,version:r.version,comment:'Synthetic request for MCM re-preparation',hospitalizationChecked:true});assert.equal(r.status,'draft');assert.equal(r.preparedBy,'');
});
check('an unconfirmed county-MCM seat never receives a false notification or implicit field approval',()=>{
 const db=fixture();db.users.find(u=>u.id===users.mcm.id).unconfirmed=true;
 const ref=good(db,users.cg,'assess_return',{patientId:'return',identityConfirmed:true,evaluatedAt:now,newComplaints:'Synthetic new complaint for three days',comparison:'Synthetic comparison',evidence:[{sourceDate:'2028-06-29',facility:'Synthetic facility',reference:'SYNTHETIC-PENDING-MCM-DOC'}]});
 assert.equal(ref.notificationStatus,'awaiting_active_county_mcm');assert.deepEqual(ref.countyMcmIds,[]);assert.equal(db.notifications.length,0);assert.equal(db.patients.find(p=>p.id==='return').status,'discharged');
});
console.log(`Clinical domain: ${checks} policy groups passed`);
