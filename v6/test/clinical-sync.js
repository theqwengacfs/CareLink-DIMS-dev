/* Real browser modules with controlled promises/timers. Synthetic data only. */
const assert=require('node:assert/strict');
const {makeCtx}=require('./dom');
let checks=0;
const reply=(body,status=200)=>({ok:status>=200&&status<300,status,body});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const microtasks=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function hosted(){
 const c=makeCtx({location:{hash:'',protocol:'https:',origin:'https://clinical.test',host:'clinical.test'},
  setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},
  sessionStorage:{getItem(){return null;},setItem(){},removeItem(){}}});
 c.run(`DB.db=DB.blank();DB.db.patients=[{id:'synthetic-p1',name:'Synthetic one',countyId:'kisumu',areaId:'ombeyi',status:'approved_enrolment'},
   {id:'synthetic-p2',name:'Synthetic two',countyId:'kisumu',areaId:'ombeyi',status:'active',intake:'2026-10-01'}];
   DB.db.visits=[{id:'synthetic-v1',patientId:'synthetic-p1',notes:'Synthetic confirmed note',weight:40}];
   AUTH.user={id:'synthetic-mcm',username:'mcm.kisumu',roleId:'mcm',countyId:'kisumu',areaIds:[]};
   SYNC.storeToken('synthetic-session');SYNC.rev=12;SYNC.rebase();APPX.dirty=false;`);
 c.requests=[];c.ctx.__transport=async(url,opts)=>{c.requests.push({url,opts});return reply({ok:true,rev:13,patches:[]});};
 c.run(`SYNC._json=(url,opts)=>__transport(url,opts);`);return c;
}
async function check(name,fn){await fn();checks++;console.log('  ok  '+name);}
(async()=>{
 await check('hosted browser timers cannot impersonate a global scheduler or dirty Chief-owned settings',async()=>{
  const c=hosted();const before=c.run('JSON.stringify(DB.db.settings)');
  assert.equal(c.run('REPORTS.mondayTick()'),null);assert.equal(c.run('JSON.stringify(DB.db.settings)'),before);assert.equal(c.run('DB.db.reports.length'),0);assert.equal(c.run('SYNC.patches().length'),0);
 });
 await check('AI default reads / dock renders never mutate Chief-owned configuration or block a clinical preflight',async()=>{
  const c=hosted(),before=c.run('JSON.stringify(DB.db.settings)');
  assert.equal(c.run(`Object.hasOwn(DB.db.settings.ai,'mode')`),false,'fixture matches a hosted row without the optional default');
  assert.equal(c.run('AI.cfg().mode'),'auto');c.run(`AI.cfg().mode='offline';renderAIDock();`);
  assert.equal(c.run('JSON.stringify(DB.db.settings)'),before);assert.equal(c.run('SYNC.patches().length'),0);
  await c.run(`ACTIONS['ai-save-cfg']()`);assert.equal(c.run('JSON.stringify(DB.db.settings)'),before,'a field role cannot explicitly change shared configuration either');
  const result=await c.run(`CARE_REVIEW.command('enrol_fresh',{patientId:'synthetic-p1'},'synthetic-pure-config-read')`);
  assert.equal(result.ok,true);assert.equal(c.requests.length,1);assert.equal(c.requests[0].url,'api/care/command');
 });
 await check('command reserves the preflight gap; double clicks / polls / full reads / outbox replay cannot overlap',async()=>{
  const c=hosted(),put=deferred(),post=deferred();
  c.run(`DB.db.visits.push({id:'synthetic-dirty',patientId:'synthetic-p1',notes:'Synthetic pending home visit'});APPX.dirty=true;`);
  c.ctx.__transport=(url,opts)=>{c.requests.push({url,opts});return opts?.method==='PUT'?put.promise:post.promise;};
  const first=c.run(`CARE_REVIEW.command('enrol_fresh',{patientId:'synthetic-p1'},'synthetic-first-click')`);
  assert.equal(c.run('SYNC._clinicalBusy'),true);assert.equal(c.requests.length,1);
  const second=await c.run(`CARE_REVIEW.command('enrol_fresh',{patientId:'synthetic-p1'},'synthetic-second-click')`);assert.equal(second.ok,false);
  await c.run('SYNC.tick()');assert.equal(await c.run('SYNC.pullFull()'),false);assert.equal(await c.run('SYNC.attemptOutbox()'),false);await c.run('SYNC.push()');
  assert.equal(c.requests.length,1);put.resolve(reply({ok:true,rev:13,appliedCount:1,rejected:[]}));await microtasks();
  assert.equal(c.requests.length,2);assert.equal(c.requests[1].url,'api/care/command');
  post.resolve(reply({ok:true,rev:14,patches:[]}));assert.equal((await first).ok,true);assert.equal(c.run('SYNC._clinicalBusy'),false);
 });
 await check('acknowledgement rebases only its exact rows and preserves concurrent same-row / other-row edits',async()=>{
  const c=hosted(),post=deferred();c.ctx.__transport=(url,opts)=>{c.requests.push({url,opts});return post.promise;};
  const saving=c.run(`CARE_REVIEW.command('enrol_fresh',{patientId:'synthetic-p1'},'synthetic-same-row')`);await microtasks();
  c.run(`DB.db.patients[0].notes='Synthetic note typed during save';DB.db.patients[0].status='forged-local-status';
    DB.db.patients[1].notes='Synthetic unrelated patient note';DB.db.visits[0].notes='Synthetic home visit edit';APPX.dirty=true;`);
  post.resolve(reply({ok:true,rev:13,patches:[{c:'patients',id:'synthetic-p1',set:{id:'synthetic-p1',name:'Synthetic one',countyId:'kisumu',areaId:'ombeyi',status:'active',careCycleId:'synthetic-cycle',intake:'2026-11-22',notes:'Server note'}}]}));
  assert.equal((await saving).ok,true);assert.equal(c.run('DB.db.patients[0].status'),'active');assert.equal(c.run('DB.db.patients[0].notes'),'Synthetic note typed during save');
  assert.equal(c.run('SYNC.patches().length'),3);assert.equal(c.run('APPX.dirty'),true);assert.equal(c.run('SYNC.rev'),13);
  assert.equal(c.run(`SYNC.patches().some(p=>p.set?.status)`),false);
 });
 await check('command never clears newly held unrelated work; acknowledgements cannot bless a whole dirty collection',async()=>{
  const c=hosted(),post=deferred();c.ctx.__transport=()=>post.promise;
  const saving=c.run(`CARE_REVIEW.command('enrol_fresh',{patientId:'synthetic-p1'},'synthetic-held-during')`);await microtasks();
  c.run(`DB.db.visits.push({id:'synthetic-held',patientId:'synthetic-p1',notes:'Synthetic held unrelated visit'});SYNC.holdWork();`);
  const before=c.ctx.localStorage.getItem('carelink.sync.outbox');
  post.resolve(reply({ok:true,rev:13,patches:[{c:'visits',id:'synthetic-v1',set:{weight:41}}]}));await saving;
  assert.equal(c.ctx.localStorage.getItem('carelink.sync.outbox'),before);assert.equal(c.run('SYNC.heldOutbox()'),1);
  assert.equal(c.run(`SYNC.patches().some(p=>p.id==='synthetic-held')`),true);assert.equal(c.run('DB.db.visits[0].weight'),41);
 });
 await check('host refusals inside HTTP200 stay unsaved and stop clinical preflight',async()=>{
  const c=hosted();c.run(`DB.db.visits[0].notes='Synthetic refused visit';APPX.dirty=true;`);
  c.ctx.__transport=async(url,opts)=>{c.requests.push({url,opts});return reply({ok:true,rev:13,appliedCount:0,rejected:[{c:'visits',id:'synthetic-v1',reason:'clinical_scope_denied'}]});};
  const r=await c.run(`CARE_REVIEW.command('enrol_fresh',{patientId:'synthetic-p1'},'synthetic-refused-preflight')`);
  assert.equal(r.ok,false);assert.equal(c.requests.length,1);assert.equal(c.requests[0].url,'api/state');assert.equal(c.run('SYNC.patches().length'),1);assert.equal(c.run('APPX.dirty'),true);assert.equal(c.run('SYNC._clinicalBusy'),false);
 });
 await check('a refused settings row and newer preferences are retained without an automatic replay',async()=>{
  const c=hosted(),first=deferred();let puts=0;
  c.run(`DB.db.settings.syntheticRefused='Synthetic settings change';DB.db.personalPrefs[AUTH.user.id]={wtheme:'harbour'};APPX.dirty=true;`);
  c.ctx.__transport=async(url,opts)=>{c.requests.push({url,opts});puts++;return first.promise;};
  const saving=c.run('SYNC.push()');
  c.run(`DB.db.personalPrefs[AUTH.user.id].font='editorial';DB.db.personalPrefs[AUTH.user.id].textScale=110;`);
  const queued=c.run('SYNC.push()');first.resolve(reply({ok:true,rev:13,appliedCount:1,rejected:[{c:'settings',id:'settings',reason:'chief_configuration_required'}]}));
  await Promise.all([saving,queued]);assert.equal(puts,1,'a partial refusal must not cause automatic replay');
  assert.equal(c.run(`SYNC.patches().filter(p=>p.c==='settings').length`),1);assert.equal(c.run(`SYNC.patches().filter(p=>p.c==='personalPrefs').length`),1);
  assert.equal(c.run('SYNC.loadOutbox().needsReview'),true);assert.equal(c.run('APPX.dirty'),true);
 });
 await check('full refresh waits for an already-started ordinary save instead of failing first-login reconciliation',async()=>{
  const c=hosted(),put=deferred();c.ctx.__transport=async(url,opts)=>{c.requests.push({url,opts});return put.promise;};
  c.run(`DB.db.visits[0].notes='Synthetic just-saved note';`);const saving=c.run('SYNC.push()');
  const refreshing=c.run(`SYNC.pullFull({inlineState:{db:DB.db,rev:13}})`);await microtasks();assert.equal(c.run('SYNC._inflight'),true);
  put.resolve(reply({ok:true,rev:13,appliedCount:1,rejected:[]}));await saving;assert.equal(await refreshing,true);assert.equal(c.run('DB.db.visits[0].notes'),'Synthetic just-saved note');
 });
 await check('held work blocks office decisions without changing the outbox or issuing network requests',async()=>{
  const c=hosted();c.run(`DB.db.visits[0].notes='Synthetic already held';SYNC.holdWork();`);const before=c.ctx.localStorage.getItem('carelink.sync.outbox');
  const r=await c.run(`CARE_REVIEW.command('enrol_fresh',{patientId:'synthetic-p1'},'synthetic-held-preflight')`);
  assert.equal(r.ok,false);assert.equal(c.requests.length,0);assert.equal(c.ctx.localStorage.getItem('carelink.sync.outbox'),before);assert.equal(c.run('SYNC._clinicalBusy'),false);
 });
 await check('response-loss retry uses the same request ID; receipt-only replay does not skip the missing decision',async()=>{
  const c=hosted();let attempts=0;c.ctx.__transport=async(url,opts)=>{
   c.requests.push({url,opts});if(url==='api/care/command'){attempts++;if(attempts===1)throw Error('Synthetic response loss after commit');return reply({ok:true,duplicate:true,refreshRequired:true,rev:13,patches:[]});}
   return reply({ok:true,rev:13,patches:[{c:'patients',id:'synthetic-p1',set:{status:'active',careCycleId:'synthetic-committed-cycle'}},{c:'careCycles',id:'synthetic-committed-cycle',set:{patientId:'synthetic-p1',status:'active'}}]});
  };
  assert.equal((await c.run(`CARE_REVIEW.command('enrol_fresh',{patientId:'synthetic-p1'},'synthetic-response-loss')`)).ok,false);
  assert.equal(c.run('DB.db.patients[0].status'),'approved_enrolment');
  const again=await c.run(`CARE_REVIEW.command('enrol_fresh',{patientId:'synthetic-p1'},'synthetic-response-loss')`);assert.equal(again.duplicate,true);assert.equal(c.run('SYNC.rev'),12);
  assert.equal(JSON.parse(c.requests[0].opts.body).requestId,JSON.parse(c.requests[1].opts.body).requestId);
  await c.run('SYNC.tick()');assert.equal(c.requests[2].url,'api/state?since=12');assert.equal(c.run('DB.db.patients[0].careCycleId'),'synthetic-committed-cycle');assert.equal(c.run('SYNC.rev'),13);
 });
 await check('intervening revisions are polled rather than skipped after a successful command',async()=>{
  const c=hosted();c.ctx.__transport=async(url,opts)=>{c.requests.push({url,opts});return url==='api/care/command'?reply({ok:true,rev:14,patches:[{c:'patients',id:'synthetic-p1',set:{status:'active'}}]}):reply({ok:true,rev:14,patches:[{c:'patients',id:'synthetic-p2',set:{notes:'Synthetic other device decision'}},{c:'patients',id:'synthetic-p1',set:{status:'active'}}]});};
  await c.run(`CARE_REVIEW.command('enrol_fresh',{patientId:'synthetic-p1'},'synthetic-revision-gap')`);assert.equal(c.run('SYNC.rev'),12);
  await c.run('SYNC.tick()');assert.equal(c.requests[1].url,'api/state?since=12');assert.equal(c.run('DB.db.patients[1].notes'),'Synthetic other device decision');
 });
 await check('delta patch and partial transports preserve unrelated edits and local deletions in touched collections',async()=>{
  const c=hosted();c.run(`DB.db.visits.push({id:'synthetic-v2',notes:'Synthetic newly typed visit'});DB.db.visits[0].notes='Synthetic local edited note';
    SYNC.applyPatchList([{c:'visits',id:'synthetic-v1',set:{weight:42}},{c:'patients',id:'synthetic-p2',set:{notes:null}}]);`);
  assert.equal(c.run('DB.db.visits[0].notes'),'Synthetic local edited note');assert.equal(c.run('DB.db.visits[0].weight'),42);assert.equal(c.run('SYNC.patches().length'),2);
  c.run(`DB.db.visits=DB.db.visits.filter(v=>v.id!=='synthetic-v1');SYNC.applyDelta({collections:{visits:[{id:'synthetic-v1',weight:43}]}});`);
  assert.equal(c.run(`DB.db.visits.some(v=>v.id==='synthetic-v1')`),false);assert.equal(c.run(`SYNC.patches().some(p=>p.id==='synthetic-v1'&&p.del)`),true);assert.equal(c.run(`SYNC.patches().some(p=>p.id==='synthetic-v2')`),true);
 });
 await check('clinical-owned records and cycle-rollover fields always remain server authoritative',async()=>{
  const c=hosted();c.run(`DB.db.careReviews=[{id:'synthetic-review',status:'draft',version:1}];DB.db.patients[0].clinical={chiefComplaints:'Synthetic old cycle complaint'};SYNC.rebase();
    DB.db.careReviews[0].status='forged-authorized';DB.db.patients[0].clinical={chiefComplaints:'Synthetic stale-cycle edit'};
    SYNC.applyCommandPatches([{c:'careReviews',id:'synthetic-review',set:{status:'submitted',version:2}},
      {c:'patients',id:'synthetic-p1',set:{careCycleId:'synthetic-next-cycle',clinical:{chiefComplaints:'Synthetic actual new-cycle complaint'}}}]);`);
  assert.equal(c.run('DB.db.careReviews[0].status'),'submitted');assert.equal(c.run('DB.db.patients[0].clinical.chiefComplaints'),'Synthetic actual new-cycle complaint');assert.equal(c.run('SYNC.patches().length'),0);
 });
 console.log(`Clinical sync: ${checks} policy groups passed`);
})().catch(e=>{console.error(e);process.exitCode=1;});
