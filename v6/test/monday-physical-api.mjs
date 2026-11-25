/* Isolated synthetic authenticated test of physical receipt and meeting progression. */
import assert from 'node:assert/strict';
import {clinicalFixture} from './clinical-api-fixture.mjs';
import R from '../src/care_rules.js';
const f=await clinicalFixture();
const assistant='synthetic-assistant.localtest', other='synthetic-homa-assistant.localtest', cg='caregiver.nairobird', mcm='mcm.kisumu';
const shift=(s,n)=>R.addDays(s,n), day=new Date(f.today+'T00:00:00Z').getUTCDay();
const week=shift(f.today,-((day+6)%7)), receivedDate=shift(week,-4);
f.change(s=>{
 s.db.formRecords=[
  {id:'synthetic-form-late',patientId:'long',kind:'patient_assessment',status:'submitted',enteredAt:'2020-01-03T08:00:00Z'},
  {id:'synthetic-form-early',patientId:'short',kind:'minor_assessment',status:'verified',createdAt:'2020-01-01T08:00:00Z'},
  {id:'synthetic-form-area',patientId:'otherarea',kind:'patient_assessment',status:'submitted',enteredAt:'2020-01-02T08:00:00Z'},
  {id:'synthetic-draft',patientId:'long',kind:'patient_assessment',status:'draft'},
  {id:'synthetic-homa',patientId:'homa',kind:'patient_assessment',status:'submitted',enteredAt:'2020-01-01T08:00:00Z'}];
 s.db.hardcopyBatches.push({id:'synthetic-copy',patientId:'long',kind:'patient_assessment',status:'verified_published',formRecordId:'synthetic-form-late'});
});
const payload=(patientId,sourceId)=>({patientId,week,sourceType:'formRecords',sourceId,receivedDate,physicalConfirmed:true});
const deny=async(user,cmd,p,code)=>{const before=f.kv.get('carelink_cloud_v66');const r=await f.command(user,cmd,p);assert.ok(r.status>=400,JSON.stringify(r.body));if(code)assert.equal(r.body.code,code);assert.equal(f.kv.get('carelink_cloud_v66'),before);};
const good=async(user,cmd,p,id)=>{const r=await f.command(user,cmd,p,id);assert.equal(r.status,200,JSON.stringify(r.body));return r.body.rec;};
const base=payload('long','synthetic-form-late');
await deny(cg,'monday_receipt',base,'monday_secretary_required');
await deny(mcm,'monday_receipt',base,'monday_secretary_required');
await deny(other,'monday_receipt',base,'clinical_scope_denied');
await deny(assistant,'monday_receipt',{...base,physicalConfirmed:false});
await deny(assistant,'monday_receipt',{...base,receivedDate:week});
await deny(assistant,'monday_receipt',{...base,sourceId:'synthetic-draft'});
await deny(assistant,'monday_receipt',{...base,sourceId:'synthetic-form-early'});
const retry='synthetic-paper-receipt-retry';
const a=await good(assistant,'monday_receipt',base,retry);
const again=await f.command(assistant,'monday_receipt',base,retry);assert.equal(again.body.duplicate,true);
await deny(assistant,'monday_receipt',base,'monday_duplicate_receipt');
await deny(assistant,'monday_receipt',{...base,sourceType:'hardcopyBatches',sourceId:'synthetic-copy'},'monday_duplicate_receipt');
await good(assistant,'monday_receipt',payload('short','synthetic-form-early'));
await good(assistant,'monday_receipt',payload('otherarea','synthetic-form-area'));
const beforeDraw=f.state().rev;
await good(assistant,'monday_draw',{patientId:a.patientId,id:a.id,week});
let rows=f.state().db.mondayAssessmentReceipts.filter(r=>r.week===week).sort((a,b)=>a.position-b.position);
assert.equal(rows.length,3);assert.deepEqual(rows.map(r=>r.position),[1,2,3]);assert.equal(rows.filter(r=>r.status==='current').length,1);
const sameArea=rows.filter(r=>r.areaId==='nairobird');assert.deepEqual(sameArea.map(r=>r.sourceId),['synthetic-form-early','synthetic-form-late']);
assert.equal(new Set(rows.map(r=>r.areaOrder)).size,2);assert(rows.every(r=>r.drawnBy==='fx-assistant'));
await deny(assistant,'monday_draw',{patientId:a.patientId,id:a.id,week},'monday_draw_locked');
await deny(assistant,'monday_receipt',{...base,sourceId:'synthetic-draft'},undefined);
const visible=await f.call('state',{token:f.tokens[cg]});assert.equal(visible.body.db.mondayAssessmentReceipts.length,2);assert(!visible.body.db.mondayAssessmentReceipts.some(r=>r.patientId==='otherarea'));
const delta=await f.call('state?since='+beforeDraw,{token:f.tokens[cg]});assert.equal(delta.body.patches.filter(p=>p.c==='mondayAssessmentReceipts').length,2);
const forged=await f.call('state',{method:'PUT',token:f.tokens[assistant],body:{patches:[{c:'mondayAssessmentReceipts',id:a.id,set:{status:'discussed'}}]}});assert.equal(forged.body.rejected[0].reason,'clinical_command_required');
for(let i=0;i<3;i++){
 rows=f.state().db.mondayAssessmentReceipts.sort((a,b)=>a.position-b.position);
 const current=rows.find(r=>r.status==='current');assert.equal(current.position,i+1);
 await deny(assistant,'monday_advance',{id:current.id,patientId:current.patientId,week,version:current.version-1},'monday_progress_conflict');
 if(i===0){f.setWriteFailure(true);await deny(assistant,'monday_advance',{id:current.id,patientId:current.patientId,week,version:current.version});f.setWriteFailure(false);}
 await good(assistant,'monday_advance',{id:current.id,patientId:current.patientId,week,version:current.version});
}
assert(f.state().db.mondayAssessmentReceipts.every(r=>r.status==='discussed'&&r.discussedBy==='fx-assistant'));
assert(f.state().db.audit.some(r=>r.action==='monday.order_drawn'));assert(f.state().db.audit.some(r=>r.action==='monday.presentation_advanced'));
console.log('Monday physical workflow: authenticated receipt, authorization, source/period validation, duplicate prevention, persisted randomized grouping, scoped reads, progression, stale writes, retry and storage failure passed.');
