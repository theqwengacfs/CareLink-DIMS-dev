/* Scoped, synthetic source-manifest tests. This is not archive certification. */
import assert from 'node:assert/strict';
import {clinicalFixture} from './clinical-api-fixture.mjs';
const f=await clinicalFixture();
f.change(s=>{
 s.db.careCycles=[{id:'synthetic-c1',patientId:'long',startedAt:'2025-01-01',dischargedAt:'2025-12-31',status:'discharged'},
  {id:'synthetic-c2',patientId:'long',startedAt:'2025-06-01',dischargedAt:'2026-06-01',status:'discharged'},
  {id:'synthetic-homa-cycle',patientId:'homa',startedAt:'2025-01-01',status:'active'}];
 s.db.visits=[{id:'synthetic-explicit',patientId:'long',cycleId:'synthetic-c1',date:'2025-07-01'},
  {id:'synthetic-unique',patientId:'long',date:'2025-02-01'},
  {id:'synthetic-ambiguous',patientId:'long',date:'2025-07-01'},
  {id:'synthetic-undated',patientId:'long'}, {id:'synthetic-other',patientId:'homa',date:'2025-02-01'}];
});
const token=f.tokens['caregiver.nairobird'], before=f.state();
let r=await f.call('care/cycle-file',{method:'POST',token,body:{patientId:'long'}});
assert.equal(r.status,200);assert.equal(r.body.cycles.length,2);
assert.equal(r.body.cycles.find(c=>c.id==='synthetic-c1').counts.visits,2);
assert.equal(r.body.cycles.find(c=>c.id==='synthetic-c2').counts.visits,0);
assert.equal(r.body.unassigned.visits,2);assert(!JSON.stringify(r.body).includes('synthetic-other'));
const after=f.state();assert.equal(after.cycleFileAccess.length,1);assert.equal(after.cycleFileAccess[0].patientId,'long');
assert.equal(after.rev,before.rev);assert(!JSON.stringify(after.db.audit.slice(-1)).includes('long'),'generic audit omits patient identifier');
r=await f.call('care/cycle-file',{method:'POST',token,body:{patientId:'homa'}});assert.equal(r.status,404);
r=await f.call('care/cycle-file',{method:'POST',token:f.tokens['synthetic-finance.localtest'],body:{patientId:'long'}});assert.equal(r.status,404);
assert.equal(f.state().cycleFileAccess.length,1,'denied access must not record a successful open');
assert.equal((await f.call('care/cycle-file',{method:'POST',body:{patientId:'long'}})).status,401);
console.log('Cycle-file manifest: scoped access, ambiguous/undated records remain unassigned, private audit event, no clinical mutation.');
