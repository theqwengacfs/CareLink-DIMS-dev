/* Scoped synthetic verification of retained sync work. */
import assert from 'node:assert/strict';
import {clinicalFixture} from './clinical-api-fixture.mjs';
const f=await clinicalFixture();
f.change(s=>{s.db.visits.push({id:'synthetic-scope-visit',patientId:'long',notes:'Synthetic matching note'},
 {id:'synthetic-hidden-visit',patientId:'homa',notes:'Synthetic private note'});});
const rev=f.state().rev, token=f.tokens['caregiver.nairobird'];
const patches=[{c:'visits',id:'synthetic-scope-visit',set:{notes:'Synthetic matching note'}},
 {c:'visits',id:'synthetic-scope-visit',set:{notes:'Synthetic different note'}},
 {c:'visits',id:'synthetic-hidden-visit',set:{notes:'Synthetic private note'}},
 {c:'visits',id:'synthetic-absent',set:{notes:'Synthetic private note'}},
 {c:'visits',id:'synthetic-scope-visit',del:true},
 {c:'users',id:'fx-caregiver',set:{name:'Synthetic fixture caregiver'}},
 {c:'visits',id:'synthetic-scope-visit',set:{}}];
const r=await f.call('state/verify-held',{method:'POST',token,body:{patches}});
assert.equal(r.status,200);assert.deepEqual(r.body.results,['matches_shared','needs_review','needs_review','needs_review','needs_review','needs_review','needs_review']);
assert.equal(r.body.rev,rev);assert.equal(f.state().rev,rev,'verification must not write shared records');
assert(!JSON.stringify(r.body).includes('Synthetic private note'));
assert.equal((await f.call('state/verify-held',{method:'POST',body:{patches}})).status,401);
assert.equal((await f.call('state/verify-held',{method:'POST',token,body:{patches:Array(101).fill(patches[0])}})).status,400);
console.log('Held-work API: scoped exact comparison, no cross-scope existence oracle, no delete approval, no shared writes.');
