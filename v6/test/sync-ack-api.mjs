/* Synthetic server acknowledgement contract: rejected and silently-invalid
   rows must never be mistaken by the client for a wholly accepted batch. */
import assert from 'node:assert/strict';
import {clinicalFixture} from './clinical-api-fixture.mjs';
const f=await clinicalFixture();
const token=f.tokens['caregiver.nairobird'];
let result=await f.call('state',{method:'PUT',token,body:{patches:[
 {c:'visits',id:'synthetic-ack-v',set:{patientId:'long',notes:'Synthetic acknowledged note'}},
 {c:'dqIssues',id:'synthetic-denied',set:{status:'waived'}},
 null
]}});
assert.equal(result.status,200);assert.equal(result.body.appliedCount,1);assert.equal(result.body.rejected.length,1);
assert.equal(result.body.rejected[0].reason,'quality_command_required');
assert.notEqual(result.body.appliedCount+result.body.rejected.length,3,'skipped invalid item produces an incomplete acknowledgement');
result=await f.call('state',{method:'PUT',token,body:{patches:[{c:'visits',id:'synthetic-ack-v',set:{notes:'Synthetic second note'}}]}});
assert.equal(result.body.appliedCount,1);assert.deepEqual(result.body.rejected,[]);
console.log('Sync API acknowledgement: accepted, refused and malformed rows are distinguishable without returning patient content.');
