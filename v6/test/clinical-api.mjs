/* Real handler, authenticated synthetic roles, isolated mock writable primary. */
import assert from 'node:assert/strict';
import {clinicalFixture} from './clinical-api-fixture.mjs';
import R from '../src/care_rules.js';
import W from '../src/care_workflow.js';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
const f=await clinicalFixture();let checks=0,review,referral;
const cg='caregiver.nairobird',mcm='mcm.kisumu',coord='coord.nairobird',intl='synthetic-intl.localtest';
const check=async(name,fn)=>{await fn();checks++;console.log('  ok  '+name);};
const good=async(user,name,payload,id)=>{const r=await f.command(user,name,payload,id);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.ok,true);return r.body.rec;};
const denied=async(user,name,payload,code)=>{const before=f.kv.get('carelink_cloud_v66'),r=await f.command(user,name,payload);assert.ok(r.status>=400,JSON.stringify(r.body));if(code)assert.equal(r.body.code,code);assert.equal(f.kv.get('carelink_cloud_v66'),before,'denied commands cannot save partial work');return r;};
const patch=async(user,patches)=>f.call('state',{method:'PUT',token:f.tokens[user],body:{patches}});
await check('commands require admitted active sessions and same-origin writes',async()=>{
 assert.equal((await f.call('care/command',{method:'POST',body:{command:'create_review',payload:{patientId:'short'},requestId:'synthetic-no-session'}})).status,401);
 assert.equal((await f.call('care/command',{method:'POST',token:f.tokens[cg],headers:{origin:'https://elsewhere.example'},body:{}})).status,403);
 await denied('synthetic-finance.localtest','create_review',{patientId:'long',fields:f.fields,evaluatedAt:new Date().toISOString()},'clinical_scope_denied');
 await denied(cg,'create_review',{patientId:'otherarea',fields:f.fields,evaluatedAt:new Date().toISOString()},'clinical_scope_denied');
 await denied('synthetic-homa-mcm.localtest','create_review',{patientId:'long',fields:f.fields,evaluatedAt:new Date().toISOString()},'clinical_scope_denied');
});
await check('direct sync, forged before-state and alternate collections cannot enroll or authorize / transmit',async()=>{
 const cases=[{c:'patients',id:'return',before:{countyId:'kisumu',status:'approved_enrolment'},set:{status:'active',careCycleId:'forged'}},
  {c:'patients',id:'forged-identity',set:{id:'forged-identity',name:'Synthetic forbidden active intake',countyId:'kisumu',areaId:'nairobird',status:'active'}},
  {c:'careCycles',id:'forged-cycle',set:{patientId:'long',status:'active'}},{c:'careReviews',id:'forged-review',set:{patientId:'long',status:'authorized',authorizedBy:'fx-mcm'}},
  {c:'careReviewRevisions',id:'forged-revision',set:{patientId:'long',event:'authorized'}},{c:'programAdmissions',id:'forged-admission',set:{patientId:'long',confirmedBy:'fx-mcm',foundationSupported:true}},
  {c:'intlPdcaDossiers',id:'forged-dossier',set:{patientId:'long',sharedAt:new Date().toISOString()}},{c:'pdcas',id:'legacy-bypass',set:{patientId:'long',kind:'review',status:'closed'}},
  {c:'calendarEvents',id:'unreviewed-schedule',set:{patientId:'long',kind:'pdca_review',careReviewId:'forged-review'}}];
 for(const user of [cg,mcm,'kisumu.admin']){const r=await patch(user,cases);assert.equal(r.status,200);assert.equal(r.body.rejected.length,cases.length,JSON.stringify(r.body));}
 const db=f.state().db;assert.equal(db.patients.find(p=>p.id==='return').status,'discharged');assert.equal(db.careReviews.length,0);assert.equal(db.intlPdcaDossiers.length,0);
});
await check('server checks exact IDs even outside the caller’s visible area, without returning hidden identity details',async()=>{
 const r=await patch(cg,[{c:'patients',id:'fx-new-assessment',set:{name:'Synthetic distinct assessment',nationalId:'SYNTHETIC-ID-otherarea',status:'assessment_initiated',countyId:'kisumu',areaId:'nairobird'}}]);
 assert.equal(r.body.rejected[0].reason,'identity_review_required');assert.equal(JSON.stringify(r.body).includes('Synthetic clinical case otherarea'),false);
 const sameName=await patch(cg,[{c:'patients',id:'fx-distinct-person',set:{name:'Synthetic clinical case long',nationalId:'SYNTHETIC-DISTINCT-ID',status:'assessment_initiated',assessmentKind:'new',discharge:null,countyId:'kisumu',areaId:'nairobird'}}]);
 assert.equal(sameName.body.rejected.length,0,'a name match is not an automatic merge or blanket refusal of a different person');
});
await check('non-MCM office decisions are denied; repeat referral is stored without field enrollment and alerts correct county MCM',async()=>{
 await denied('kisumu.admin','enrol_fresh',{patientId:'fresh',...f.plan},'mcm_office_required');await denied(cg,'enrol_fresh',{patientId:'fresh',...f.plan},'mcm_office_required');
 referral=await good(cg,'assess_return',{patientId:'return',identityConfirmed:true,evaluatedAt:new Date().toISOString(),newComplaints:'Synthetic new complaint for three days',comparison:'Synthetic new vs prior comparison',evidence:[{sourceDate:f.today,facility:'Synthetic medical facility',reference:'SYNTHETIC-NEW-SOURCE'}]});
 assert.equal(referral.status,'pending_mcm');assert.equal(f.state().db.patients.find(p=>p.id==='return').status,'discharged');
 assert.equal(f.state().db.notifications.filter(n=>n.title.startsWith('Repeat assessment')).length,1);
 assert.equal(f.state().db.notifications.find(n=>n.title.startsWith('Repeat assessment')).userId,'fx-mcm');
 await denied(cg,'decide_referral',{patientId:'return',id:referral.id,version:referral.version,decision:'enrol',reason:'Synthetic attempted field decision',evidenceReviewed:true,...f.plan},'mcm_office_required');
});
await check('final MCM office enrollment creates a durable new cycle and preserves prior records under one identity',async()=>{
 const count=f.state().db.patients.length;
 const p=await good(mcm,'decide_referral',{patientId:'return',id:referral.id,version:referral.version,decision:'enrol',reason:'Synthetic approved office review',evidenceReviewed:true,...f.plan});
 assert.equal(p.id,'return');assert.equal(p.status,'active');assert.equal(p.intake,f.today);assert.equal(f.state().db.patients.length,count);
 assert.equal(f.state().db.careCycles.filter(c=>c.patientId==='return').length,2);assert.notEqual(f.state().db.visits[0].cycleId,p.careCycleId);
 assert.equal(f.state().db.careEvidence[0].verifiedBy,'fx-mcm');
 const changed=await patch(cg,[{c:'patients',id:'return',set:{intake:'2000-01-01',discharge:'2001-01-01'}}]);assert.equal(changed.body.rejected.length,1);
 const deletion=await patch(mcm,[{c:'patients',id:'return',del:true}]);assert.equal(deletion.body.rejected[0].reason,'clinical_history_retained');
});
await check('under120 drafts need actual evaluation time, complete fields and MCM review before schedule/archive',async()=>{
 await denied(cg,'create_review',{patientId:'short',evaluatedAt:'2026-01-01',fields:f.fields});
 let r=await good(coord,'create_review',{patientId:'short',dueDay:30,evaluatedAt:new Date().toISOString(),fields:{}});
 assert.equal(r.fields.adherence,'');assert.equal(r.fields.heightCm,'');assert.equal(r.fields.children,'');
 await denied(coord,'submit_review',{id:r.id,version:r.version});
 await denied(coord,'schedule_review',{id:r.id,version:r.version,nextReviewAt:new Date(Date.now()+86400000).toISOString()},'pdca_mcm_review_required');
 await denied(coord,'archive_review',{id:r.id,version:r.version},'pdca_mcm_review_required');
 r=await good(coord,'save_review',{id:r.id,version:r.version,fields:f.fields});const originalDue=r.dueDate;
 r=await good(coord,'submit_review',{id:r.id,version:r.version});r=await good(mcm,'review_report',{id:r.id,version:r.version,comment:'Synthetic county MCM review'});
 r=await good(coord,'schedule_review',{id:r.id,version:r.version,nextReviewAt:new Date(Date.now()+86400000).toISOString()});assert.equal(r.dueDate,originalDue);
 assert.equal(f.state().db.calendarEvents[0].careReviewId,r.id);r=await good(cg,'archive_review',{id:r.id,version:r.version});assert.equal(r.status,'archived');
});
await check('MCM preparation is for120+ supported hospitalizations, not all long-stay cases or forged inpatient checkboxes',async()=>{
 await denied(mcm,'create_review',{patientId:'long',evaluatedAt:new Date().toISOString(),fields:f.fields},'pdca_preparer_required');
 const encounter=await patch(cg,[{c:'encounters',id:'fx-forged-inpatient',set:{patientId:'long',type:'inpatient',foundationSupported:true,programSupported:true}}]);assert.equal(encounter.body.rejected.length,0,'inpatient notes do not grant MCM provenance');
 assert.equal(R.supportedAdmission(f.state().db.patients.find(p=>p.id==='long'),f.state().db),false);
 await good(mcm,'record_admission',{patientId:'long',admittedAt:R.addDays(f.today,-200),dischargedAt:R.addDays(f.today,-195),foundationSupported:true,sourceReviewed:true,supportReference:'SYNTHETIC-SUPPORT-AUTH',evidence:{sourceDate:R.addDays(f.today,-195),facility:'Synthetic facility',reference:'SYNTHETIC-PAST-HOSPITAL-DOC'}});
 await denied(cg,'create_review',{patientId:'long',evaluatedAt:new Date().toISOString(),fields:f.fields},'pdca_preparer_required');
 review=await good(mcm,'create_review',{patientId:'long',dueDay:120,evaluatedAt:new Date().toISOString(),fields:f.fields});assert.equal(review.preparedRole,'mcm');
});
await check('every120+ report enforces the complete multistep chain and rejects stale edits / premature sharing',async()=>{
 await denied(mcm,'share_review',{id:review.id,version:review.version},'pdca_authorization_required');
 review=await good(mcm,'submit_review',{id:review.id,version:review.version});
 await denied(mcm,'authorize_review',{id:review.id,version:review.version,comment:'Synthetic early authorization'},'pdca_review_chain_required');
 review=await good(mcm,'review_report',{id:review.id,version:review.version,comment:'Synthetic MCM comments: correct duration',hospitalizationChecked:true});
 await denied(coord,'save_review',{id:review.id,version:review.version,fields:f.fields},'pdca_preparer_required');
 await denied(cg,'resubmit_review',{id:review.id,version:review.version,correctionNote:'Synthetic comment without editing'},'caregiver_corrections_required');
 const stale=review.version;
 review=await good(cg,'save_review',{id:review.id,version:review.version,fields:{...f.fields,nextSteps:'Synthetic corrected action for fourteen days'},correctionNote:'Synthetic duration correction'});
 await denied(cg,'save_review',{id:review.id,version:stale,fields:f.fields},'clinical_version_conflict');
 review=await good(cg,'resubmit_review',{id:review.id,version:review.version});review=await good(mcm,'authorize_review',{id:review.id,version:review.version,comment:'Synthetic explicit international sharing authorization'});
 assert.equal(f.state().db.intlPdcaDossiers.length,0,'authorized is not implicitly transmitted');
});
await check('international full / paged / fast / delta reads see no unshared clinical record, even after authorization',async()=>{
 for(const route of ['state','state?fast=1','state?since=1','state/collection?name=careReviews','state/collection?name=careReviewRevisions','state/collection?name=patients']){
  const r=await f.call(route,{token:f.tokens[intl]});assert.equal(r.status,200);assert.equal(JSON.stringify(r.body).includes('Synthetic clinical case long'),false,route);assert.equal(JSON.stringify(r.body).includes('Synthetic corrected action'),false,route);
 }
});
await check('shared dossier contains only the immutable authorized fields and remains visible across delta and paged transports',async()=>{
 const baseRev=f.state().rev;
 review=await good(mcm,'share_review',{id:review.id,version:review.version});
 const db=f.state().db,dossier=db.intlPdcaDossiers[0],version=db.careReviewRevisions.find(v=>v.id===dossier.authorizedRevisionId);
 assert.deepEqual(dossier.fields,version.fields);assert.equal(version.event,'authorized');assert.equal(dossier.fields.nextSteps,'Synthetic corrected action for fourteen days');
 const full=await f.call('state',{token:f.tokens[intl]});assert.equal(full.body.db.intlPdcaDossiers.length,1);assert.equal(full.body.db.patients.length,0);assert.equal(full.body.db.careReviews.length,0);assert.equal(full.body.db.careReviewRevisions.length,0);
 const paged=await f.call('state/collection?name=intlPdcaDossiers',{token:f.tokens[intl]});assert.equal(paged.body.records.length,1);
 const delta=await f.call('state?since='+baseRev,{token:f.tokens[intl]});assert.ok(delta.body.patches.some(p=>p.c==='intlPdcaDossiers'));assert.ok(!delta.body.patches.some(p=>p.c==='careReviews'||p.c==='careReviewRevisions'));
 await denied(mcm,'international_review',{id:dossier.id,version:1,decision:'reviewed_concurred',recommendation:'Attempted'},'international_scope_denied');
 const advisory=await good(intl,'international_review',{id:dossier.id,version:1,decision:'awaiting_intl_review',recommendation:'Synthetic specialist asks for new diagnostic result'});assert.equal(advisory.advisories.length,1);
});
await check('coordinator clinical reads are area-limited, and neither widen finance nor alter generic patient scope',async()=>{
 const r=await f.call('state',{token:f.tokens[coord]});assert.ok(r.body.db.patients.some(p=>p.id==='long'));assert.ok(!r.body.db.patients.some(p=>p.id==='otherarea'||p.id==='homa'));
 assert.equal(r.body.db.transactions.length,0);assert.equal(r.body.db.hardcopyBatches.length,0);
 const unauthorized=await patch(coord,[{c:'transactions',id:'fx-private-accounting',set:{amount:999}}]);assert.equal(unauthorized.body.rejected.length,1);
 const scopeChange=await patch(mcm,[{c:'patients',id:'long',set:{countyId:'homabay',areaId:'makongeni'}}]);assert.equal(scopeChange.body.rejected.length,1);
});
await check('command request receipts make response-loss retries idempotent; changed payload cannot reuse an identifier',async()=>{
 const payload={patientId:'short',evaluatedAt:new Date().toISOString(),fields:f.fields},requestId='synthetic-idempotency-retry';
 const first=await f.command(cg,'create_review',payload,requestId);assert.equal(first.status,200,JSON.stringify(first.body));const count=f.state().db.careReviews.length,revision=f.state().rev;
 const second=await f.command(cg,'create_review',payload,requestId);assert.equal(second.status,200);assert.equal(second.body.duplicate,true);assert.equal(f.state().rev,revision);assert.equal(f.state().db.careReviews.length,count);
 const conflict=await f.command(cg,'create_review',{...payload,dueDay:60},requestId);assert.equal(conflict.status,409);assert.equal(conflict.body.code,'request_id_conflict');
});
await check('write failures never acknowledge decisions and CAS conflicts cannot erase another client’s save',async()=>{
 const before=f.kv.get('carelink_cloud_v66');f.setWriteFailure(true);
 let r=await f.command(mcm,'enrol_fresh',{patientId:'fresh',...f.plan});assert.equal(r.status,503);assert.equal(f.kv.get('carelink_cloud_v66'),before);f.setWriteFailure(false);
 f.onCommit(()=>f.change(s=>{s.rev++;s.db.settings.syntheticConcurrentMarker='preserved';}));
 r=await f.command(mcm,'enrol_fresh',{patientId:'fresh',...f.plan});assert.equal(r.status,409);assert.equal(f.state().db.settings.syntheticConcurrentMarker,'preserved');assert.equal(f.state().db.patients.find(p=>p.id==='fresh').status,'approved_enrolment');
});
await check('simultaneous office decisions create only one cycle, and a receipt retry rechecks current patient scope',async()=>{
 const decisions=await Promise.all([f.command(mcm,'enrol_fresh',{patientId:'fresh',...f.plan},'synthetic-race-office-one'),f.command(mcm,'enrol_fresh',{patientId:'fresh',...f.plan},'synthetic-race-office-two')]);
 assert.equal(decisions.filter(r=>r.status===200).length,1,JSON.stringify(decisions));assert.ok(decisions.some(r=>r.status>=400));assert.equal(f.state().db.careCycles.filter(c=>c.patientId==='fresh').length,1);
 const payload={patientId:'short',evaluatedAt:new Date().toISOString(),fields:f.fields},requestId='synthetic-scope-replay';assert.equal((await f.command(cg,'create_review',payload,requestId)).status,200);
 f.change(s=>{s.db.users.find(u=>u.username===cg).areaIds=[];});const retry=await f.command(cg,'create_review',payload,requestId);assert.equal(retry.status,403);assert.equal(retry.body.code,'clinical_scope_denied');
 f.change(s=>{s.db.users.find(u=>u.username===cg).areaIds=['nairobird'];});
});
await check('reference-import alternatives cannot replace clinical history, even in a pre-activation fixture',async()=>{
 const old=f.state();
 f.change(s=>{s.globallyActivated=false;s.db.settings.globallyActivated=false;s.db.settings.awaitingGlobalActivation=true;s.db.meta.globallyActivated=false;s.db.meta.demoDisabled=false;
  s.masterImports=[{id:'synthetic-upload-before-clinical-work',username:'chief.admin',status:'uploading',chunkCount:1,received:{}}];});
 const before=JSON.stringify(f.state().db.careReviews);
 try{
  for(const route of ['master-import/start','master-import/auto-seed','master-import/finalize']){
   const r=await f.call(route,{method:'POST',token:f.tokens.chief,body:{uploadId:'synthetic-upload-before-clinical-work'}});assert.equal(r.status,409,JSON.stringify(r.body));assert.equal(r.body.code,'clinical_history_retained');
  }
  assert.equal(JSON.stringify(f.state().db.careReviews),before);
 }finally{f.change(s=>Object.assign(s,old));}
});
await check('actual reference upload / finalize refuses forged clinical provenance and non-synthetic patient payloads',async()=>{
 const old=f.state();
 try{
  f.change(s=>{s.globallyActivated=false;s.db.settings.globallyActivated=false;s.db.settings.awaitingGlobalActivation=true;s.db.meta.globallyActivated=false;s.db.meta.demoDisabled=false;
   for(const key of W.OWNED)s.db[key]=[];s.db.patients.forEach(p=>p.demo=true);});
  const live=JSON.stringify(f.state().db.patients),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
  const required=['patients','visits','pdcas','patientConditions','support','documents','requests','transactions','employees','inventoryItems','budgets','referralEntities','careBeds','careResidents','stockLots','stockMoves'];
  const cases=[...W.OWNED.map(key=>({key,value:[{id:'synthetic-forged-import-record'}],code:'master_clinical_workflow_forbidden'})),
   {key:'careReviews',value:{status:'authorized'},code:'master_clinical_workflow_forbidden'},
   {key:'patients',value:[{id:'synthetic-unmarked-record'}],code:'master_synthetic_only'}];
  for(const test of cases){
   const db=Object.fromEntries(required.map(key=>[key,[]]));db.patients=[{id:'synthetic-import-patient',demo:true}];db[test.key]=test.value;
   const raw=JSON.stringify({format:'carelink-reference-payload-v1',db}),compressed=zlib.brotliCompressSync(Buffer.from(raw)),encoded=compressed.toString('base64');
   const start=await f.call('master-import/start',{method:'POST',token:f.tokens.chief,body:{format:'carelink-reference-master-v1',encoding:'brotli-base64',digest:sha(raw),compressedDigest:sha(compressed),rawBytes:Buffer.byteLength(raw),compressedBytes:compressed.length,base64Length:encoded.length,chunkSize:encoded.length,chunkCount:1}});
   assert.equal(start.status,200,JSON.stringify(start.body));const uploadId=start.body.uploadId;
   const chunk=await f.call('master-import/chunk',{method:'POST',token:f.tokens.chief,body:{uploadId,index:0,data:encoded}});assert.equal(chunk.status,200,JSON.stringify(chunk.body));
   const done=await f.call('master-import/finalize',{method:'POST',token:f.tokens.chief,body:{uploadId}});assert.equal(done.status,400,JSON.stringify(done.body));assert.equal(done.body.code,test.code,test.key);
   assert.equal(JSON.stringify(f.state().db.patients),live,'refused payload must not replace any live records');
   for(const key of W.OWNED)assert.equal(f.state().db[key].length,0,'no imported clinical decision / provenance may leak through');
  }
 }finally{f.change(s=>Object.assign(s,old));}
});
await check('revoked account / unapproved device cannot keep clinical command authority',async()=>{
 const noDevice=await f.call('care/command',{method:'POST',token:f.tokens[cg],deviceJar:{cookie:''},body:{command:'create_review',payload:{patientId:'short'},requestId:'synthetic-no-device'}});assert.equal(noDevice.status,401);
 f.change(s=>{s.creds[cg].active=false;});const revoked=await f.command(cg,'create_review',{patientId:'short',evaluatedAt:new Date().toISOString(),fields:f.fields});assert.equal(revoked.status,401);
});
console.log(`Clinical API: ${checks} policy groups passed`);
