/* Synthetic authenticated tests for the legacy data-quality waiver boundary. */
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import {clinicalFixture} from './clinical-api-fixture.mjs';
const f=await clinicalFixture();
const users=['chief','caregiver.nairobird','coord.nairobird','mcm.kisumu','synthetic-assistant.localtest','synthetic-homa-assistant.localtest','synthetic-finance.localtest','synthetic-director.localtest','synthetic-intl.localtest'];
const secret='SYNTHETIC-PRIVATE-WAIVER-CONTENT';
f.change(s=>{
 s.db.dqIssues=[{id:'synthetic-waiver',entity:'patient',entityId:'long',key:'no-contact:long',status:'waived',text:secret,reason:secret}];
 s.rev++;
 s.deltas=[{rev:s.rev,at:new Date().toISOString(),actor:'synthetic',patches:[{c:'dqIssues',id:'synthetic-waiver',set:s.db.dqIssues[0]}]}];
});
const rev=f.state().rev;
for(const user of users){
 const token=f.tokens[user];
 const full=await f.call('state',{token});assert.equal(full.status,200);assert.deepEqual(full.body.db.dqIssues,[],user+' full snapshot');assert.ok(!JSON.stringify(full.body).includes(secret));
 const page=await f.call('state/collection?name=dqIssues',{token});assert.equal(page.status,200);assert.deepEqual(page.body.records,[],user+' paged snapshot');
 const pack=await f.call('state?fast=1',{token});assert.equal(pack.status,200);const parts=[pack.body.part0];
 for(let part=1;part<pack.body.totalParts;part++){const next=await f.call('state?fast=1&targetRev='+pack.body.rev+'&part='+part,{token});assert.equal(next.status,200);parts.push(next.body.data);}
 const unpacked=zlib.gunzipSync(Buffer.from(parts.join(''),'base64')).toString();assert.ok(!unpacked.includes(secret),user+' compressed fast snapshot');assert.deepEqual(JSON.parse(unpacked).db.dqIssues,[]);
 const delta=await f.call('state?since='+(rev-1),{token});assert.equal(delta.status,200);assert.ok(Array.isArray(delta.body.patches));assert.ok(!delta.body.patches.some(p=>p.c==='dqIssues'),user+' delta');assert.ok(!JSON.stringify(delta.body).includes(secret));
 for(const patch of [{c:'dqIssues',id:'synthetic-waiver',set:{status:'reopened'}},{c:'dqIssues',id:'synthetic-forgery',set:{entity:'patient',entityId:'long',status:'waived',text:secret}},{c:'dqIssues',id:'synthetic-waiver',del:true}]){
  const result=await f.call('state',{method:'PUT',token,body:{patches:[patch]}});assert.equal(result.status,200);assert.equal(result.body.rejected.length,1,user+' forbidden write');
 }
}
assert.equal(f.state().db.dqIssues.length,1);assert.equal(f.state().db.dqIssues[0].status,'waived');assert.equal(f.state().db.dqIssues[0].reason,secret);
console.log('Quality waiver privacy: full/paged/compressed/delta reads fail closed for nine synthetic roles, forged edits/create/delete denied, existing record retained.');
