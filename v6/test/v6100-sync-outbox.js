/* Synthetic checks: the legacy outbox is not a secure offline vault. */
const assert=require('node:assert/strict');
const {makeCtx}=require('./dom');
let checks=0;
async function check(name,fn){await fn();checks++;console.log('  ok  '+name);}
function hosted(){
 const c=makeCtx({location:{hash:'',protocol:'https:',origin:'https://carelink.test',host:'carelink.test'},
  setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,
  sessionStorage:{getItem(){return null;},setItem(){},removeItem(){}}});
 c.run(`DB.db=DB.blank();DB.db.patients=[{id:'synthetic-p',countyId:'kisumu',areaId:'nyalenda'}];DB.db.visits=[];
  AUTH.user={id:'synthetic-u1',username:'synthetic-caregiver-one',roleId:'caregiver',countyId:'kisumu',areaIds:['nyalenda']};
  SYNC.storeToken('synthetic-token');SYNC.rev=12;SYNC.rebase();
  DB.db.visits.push({id:'synthetic-v1',patientId:'synthetic-p',notes:'Synthetic held visit'});`);
 return c;
}
(async()=>{
 await check('unknown save outcomes are retained and cannot replay automatically',async()=>{
  const c=hosted();let calls=0;c.ctx.__send=async()=>{calls++;throw Error('synthetic response loss');};c.run('SYNC._json=__send');
  await c.run('SYNC.push()');assert.equal(c.run('SYNC.heldOutbox()'),1);assert.equal(c.run('SYNC.loadOutbox().needsReview'),true);
  assert.match(c.run('SYNC.message'),/outcome is unknown.*retained for review/);assert.equal(await c.run('SYNC.attemptOutbox()'),false);
  await c.run('SYNC.push()');await c.run('SYNC.tick()');assert.equal(await c.run('SYNC.retryNow()'),false);
  assert.equal(calls,1);assert.equal(c.run('SYNC.state'),'error');assert.match(c.run('SYNC.message'),/requires review/);
 });
 await check('same-owner unsent work with a complete acknowledgment can be replayed and cleared',async()=>{
  const c=hosted();c.run('SYNC.holdWork({notSent:true})');let sent;
  c.ctx.__send=async(url,opts)=>{sent=JSON.parse(opts.body);assert.equal(c.run('SYNC.loadOutbox().needsReview'),true,'uncertainty marker is durable before sending');return {ok:true,status:200,body:{ok:true,rev:13,appliedCount:1,rejected:[]}};};c.run('SYNC._json=__send');
  assert.equal(await c.run('SYNC.attemptOutbox()'),true);assert.equal(sent.patches[0].set.notes,'Synthetic held visit');
  assert.equal(c.run('SYNC.heldOutbox()'),0);assert.match(c.run('SYNC.message'),/Held work saved/);
 });
 await check('partial HTTP 200 refusals and missing acknowledgements preserve the entire batch for review',async()=>{
  for(const body of [{ok:true,rev:13,appliedCount:0,rejected:[{c:'visits',id:'synthetic-v1',reason:'clinical_scope_denied'}]}, {ok:true,rev:13}, {ok:true,rev:13,appliedCount:0,rejected:[]}, {ok:true,rev:13,appliedCount:1,rejected:[{c:'visits',id:'synthetic-v1',reason:'denied'}]}]){
   const c=hosted();c.run('SYNC.holdWork({notSent:true})');c.ctx.__body=body;c.run('SYNC._json=async()=>({ok:true,status:200,body:__body})');
   assert.equal(await c.run('SYNC.attemptOutbox()'),false);assert.equal(c.run('SYNC.heldOutbox()'),1);
   assert.equal(c.run('SYNC.loadOutbox().needsReview'),true);assert.match(c.run('SYNC.message'),/not been reported as saved/);
  }
 });
 await check('a denied held batch survives sign-out and will not silently replay',async()=>{
  const c=hosted();c.run(`SYNC.holdWork({notSent:true});SYNC._json=async()=>({ok:false,status:403,body:{error:'Synthetic scope refusal'}})`);
  assert.equal(await c.run('SYNC.attemptOutbox()'),false);assert.equal(c.run('SYNC.heldOutbox()'),1);assert.equal(c.run('SYNC.loadOutbox().needsReview'),true);
  assert.match(c.run('SYNC.message'),/scope refusal/);
 });
 await check('an uncertain queue survives reload without an automatic replay',async()=>{
  const c=hosted();c.run(`SYNC._json=async()=>{throw Error('synthetic response loss')}`);await c.run('SYNC.push()');
  const reloaded=hosted();reloaded.ctx.localStorage.setItem('carelink.sync.outbox',c.ctx.localStorage.getItem('carelink.sync.outbox'));
  let calls=0;reloaded.ctx.__send=async()=>{calls++;};reloaded.run('SYNC._json=__send');
  assert.equal(reloaded.run('SYNC.heldOutbox()'),1);assert.equal(await reloaded.run('SYNC.attemptOutbox()'),false);assert.equal(calls,0);
 });
 await check('legacy queues without a known-unsent marker cannot be replayed',async()=>{
  const c=hosted();c.run('SYNC.holdWork()');let calls=0;c.ctx.__send=async()=>{calls++;};c.run('SYNC._json=__send');
  assert.equal(await c.run('SYNC.attemptOutbox()'),false);await c.run('SYNC.push()');assert.equal(calls,0);assert.equal(c.run('SYNC.heldOutbox()'),1);
 });
 await check('held work cannot be replayed under another or unknown account',async()=>{
  const c=hosted();c.run('SYNC.holdWork()');let calls=0;c.ctx.__send=async()=>{calls++;return {ok:true,body:{rev:13,appliedCount:1,rejected:[]}};};c.run('SYNC._json=__send');
  c.run(`AUTH.user.username='synthetic-caregiver-two'`);assert.equal(await c.run('SYNC.attemptOutbox()'),false);
  c.run('AUTH.user=null');assert.equal(await c.run('SYNC.attemptOutbox()'),false);assert.equal(calls,0);assert.equal(c.run('SYNC.heldOutbox()'),1);
 });
 await check('foreign, unowned and corrupt queues cannot be overwritten or deleted by another account',async()=>{
  const c=hosted();c.run('SYNC.holdWork()');const raw=c.ctx.localStorage.getItem('carelink.sync.outbox');
  c.run(`AUTH.user.username='synthetic-caregiver-two';DB.db.visits.push({id:'synthetic-v2',notes:'Synthetic other work'});SYNC.holdWork()`);
  assert.equal(c.ctx.localStorage.getItem('carelink.sync.outbox'),raw);assert.match(c.run('SYNC._holdFailure'),/not safely stored/);
  c.run('SYNC.clearOutbox({patches:SYNC.loadOutbox().patches})');assert.equal(c.ctx.localStorage.getItem('carelink.sync.outbox'),raw);
  c.ctx.localStorage.setItem('carelink.sync.outbox','{unparseable');c.run('SYNC.holdWork()');assert.equal(c.ctx.localStorage.getItem('carelink.sync.outbox'),'{unparseable');
 });
 await check('newer work cannot overwrite an existing same-account queue and empty shadows do not delete it',async()=>{
  const c=hosted();c.run('SYNC.holdWork()');const raw=c.ctx.localStorage.getItem('carelink.sync.outbox');
  c.run(`DB.db.visits.push({id:'synthetic-v2',notes:'Synthetic newer change'});SYNC.holdWork()`);
  assert.equal(c.ctx.localStorage.getItem('carelink.sync.outbox'),raw);assert.match(c.run('SYNC._holdFailure'),/not safely stored/);
  c.run('SYNC.rebase();SYNC.holdWork()');assert.equal(c.ctx.localStorage.getItem('carelink.sync.outbox'),raw);
 });
 await check('partial refusal in a normal save remains visible and retained for review',async()=>{
  const c=hosted();c.run(`SYNC._json=async()=>({ok:true,status:200,body:{ok:true,rev:13,appliedCount:0,rejected:[{c:'visits',id:'synthetic-v1',reason:'scope_denied'}]}})`);
  await c.run('SYNC.push()');assert.equal(c.run('SYNC.patches().length'),1);assert.equal(c.run('SYNC.loadOutbox().needsReview'),true);
  assert.match(c.run('SYNC.message'),/refused.*remain unsaved/);
 });
 await check('a normal save without an exact acknowledgement is not called successful',async()=>{
  const c=hosted();c.run(`SYNC._json=async()=>({ok:true,status:200,body:{ok:true,rev:13}})`);
  await c.run('SYNC.push()');assert.equal(c.run('SYNC.loadOutbox().needsReview'),true);assert.equal(c.run('SYNC.patches().length'),1);
  assert.match(c.run('SYNC.message'),/outcome is unknown/);
 });
 await check('held review checks scope remotely and only clears fully matching clean work after a second check',async()=>{
  const c=hosted();c.run('SYNC.holdWork();SYNC.rebase()');let checks=0;
  c.ctx.__verify=async(url,opts)=>{checks++;assert.equal(url,'api/state/verify-held');return {ok:true,body:{ok:true,rev:13,results:['matches_shared']}};};c.run('SYNC._json=__verify');
  const inspected=await c.run('SYNC.verifyHeld()');assert.equal(inspected.ok,true);assert.equal(c.run('SYNC.heldOutbox()'),1);
  const cleared=await c.run('SYNC.releaseConfirmedHeld()');assert.equal(cleared.ok,true);assert.equal(checks,2);assert.equal(c.run('SYNC.heldOutbox()'),0);
 });
 await check('a later mismatch or concurrent local edit prevents clearing after an earlier match',async()=>{
  const c=hosted();c.run('SYNC.holdWork();SYNC.rebase()');const raw=c.ctx.localStorage.getItem('carelink.sync.outbox');let calls=0;
  c.ctx.__verify=async()=>({ok:true,body:{ok:true,rev:13+calls,results:[++calls===1?'matches_shared':'needs_review']}});c.run('SYNC._json=__verify');
  assert.equal((await c.run('SYNC.verifyHeld()')).ok,true);assert.equal((await c.run('SYNC.releaseConfirmedHeld()')).ok,false);
  assert.equal(c.ctx.localStorage.getItem('carelink.sync.outbox'),raw);
  c.ctx.__verify=async()=>{c.run(`DB.db.visits[0].notes='Synthetic concurrent edit'`);return {ok:true,body:{ok:true,rev:14,results:['matches_shared']}};};
  assert.equal((await c.run('SYNC.releaseConfirmedHeld()')).ok,false);assert.equal(c.ctx.localStorage.getItem('carelink.sync.outbox'),raw);
 });
 await check('a session change during the shared check never clears held work',async()=>{
  const c=hosted();c.run('SYNC.holdWork();SYNC.rebase()');const raw=c.ctx.localStorage.getItem('carelink.sync.outbox');
  c.ctx.__verify=async()=>{c.run(`SYNC.sessionToken='synthetic-new-session'`);return {ok:true,body:{ok:true,rev:13,results:['matches_shared']}};};
  c.run('SYNC._json=__verify');assert.equal((await c.run('SYNC.releaseConfirmedHeld()')).ok,false);
  assert.equal(c.ctx.localStorage.getItem('carelink.sync.outbox'),raw);
 });
 await check('held review preserves unmatched, changed, dirty and foreign work',async()=>{
  const c=hosted();c.run('SYNC.holdWork();SYNC.rebase()');const raw=c.ctx.localStorage.getItem('carelink.sync.outbox');
  c.run(`SYNC._json=async()=>({ok:true,body:{ok:true,rev:13,results:['needs_review']}})`);
  assert.equal((await c.run('SYNC.releaseConfirmedHeld()')).ok,false);assert.equal(c.ctx.localStorage.getItem('carelink.sync.outbox'),raw);
  c.run(`DB.db.visits[0].notes='Synthetic new unsaved work'`);assert.equal((await c.run('SYNC.releaseConfirmedHeld()')).ok,false);
  c.run(`AUTH.user.username='synthetic-other'`);assert.equal((await c.run('SYNC.verifyHeld()')).ok,false);assert.equal(c.ctx.localStorage.getItem('carelink.sync.outbox'),raw);
 });
 await check('the review interface does not render held record content or identifiers',async()=>{
  const c=hosted();c.run(`SYNC.holdWork();openHeldWorkReview({ok:true,rev:13,results:['needs_review']})`);
  const html=c.nodes.at(-1).innerHTML;assert.match(html,/Needs review/);assert(!html.includes('Synthetic held visit'));assert(!html.includes('synthetic-v1'));
  c.run(`AUTH.user.username='synthetic-other';openHeldWorkReview()`);assert(!c.nodes.at(-1).innerHTML.includes('visits'));
 });
 await check('storage failure warns rather than claiming durable held work',async()=>{
  const c=hosted();c.ctx.localStorage.setItem=()=>{throw Error('synthetic quota');};c.run(`SYNC._json=async()=>{throw Error('synthetic network outage')}`);
  await c.run('SYNC.push()');assert.equal(c.run('Store.durable'),false);assert.match(c.run('SYNC.message'),/may be lost on reload/);
 });
 console.log(`sync-outbox: ${checks} checks passed`);
})().catch(e=>{console.error(e);process.exit(1);});
