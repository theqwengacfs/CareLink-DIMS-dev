/* Synthetic, isolated KV traffic proof. Never contacts a provider or production.
   Count both command and JSON-response bytes, not just shard GETs: downloading
   a gzip envelope/large auth manifest on every poll exhausts bandwidth too. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { dispatchWithDeviceCookie } from './device-cookies.cjs';
import { isSnapshotRead, conditionalPrimaryRead } from './kv-primary-read.cjs';

const ROOT = 'carelink_cloud_v66';
const kv = new Map(), secondary = new Map();
let traffic = [], refusal = null, corruptReply = false, beforeCommit = null, holdSnapshot = null;
const reply = (body, status = 200) => ({ ok:status >= 200 && status < 300, status, json:async()=>body });
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  assert.ok(['https://kv-bandwidth.test', 'https://kv-bandwidth-secondary.test', 'https://fixture.upstash.io'].includes(url.origin), 'fixture must never reach production');
  const store = url.origin === 'https://kv-bandwidth-secondary.test' ? secondary : kv;
  const command = url.pathname === '/' ? JSON.parse(init.body) : null;
  const read = command?.[0] === 'EVAL' && (isSnapshotRead(command[1]) || command[1] === "return redis.call('GET', KEYS[1])");
  const event = { origin:url.origin, path:url.pathname, command, requestBytes:Buffer.byteLength(init.body || ''), responseBytes:0 };
  traffic.push(event);
  const respond = (body, status = 200) => { event.responseBytes = Buffer.byteLength(JSON.stringify(body)); return reply(body,status); };
  if (refusal && (!refusal.writeOnly || !read) && (!refusal.key || command?.[3] === refusal.key)) return respond({error:refusal.error},refusal.status);
  if (url.pathname.startsWith('/set/')) { store.set(decodeURIComponent(url.pathname.slice(5)),JSON.parse(init.body)); return respond({result:'OK'}); }
  if (url.pathname.startsWith('/del/')) { store.delete(decodeURIComponent(url.pathname.slice(5))); return respond({result:1}); }
  assert.ok(command, 'unexpected replica or non-command read');
  const [op,...a] = command;
  if (op === 'SET') {
    if (a.includes('NX') && store.has(a[0])) return respond({result:null});
    store.set(a[0],String(a[1])); return respond({result:'OK'});
  }
  assert.equal(op,'EVAL');
  const [script,count,key,...args] = a;
  assert.equal(Number(count),1);
  if (isSnapshotRead(script)) {
    const result=corruptReply ? ['a'.repeat(40),null] : conditionalPrimaryRead(store,key,args[0]);
    if(holdSnapshot) { const pause=holdSnapshot;holdSnapshot=null;await pause(); }
    return respond({result});
  }
  if (script === "return redis.call('GET', KEYS[1])") return respond({result:store.get(key) ?? null});
  if (script.includes('redis.sha1hex')) {
    if (beforeCommit) { const change=beforeCommit; beforeCommit=null; change(); }
    const previous=store.get(key), digest=previous==null?'missing':crypto.createHash('sha1').update(previous).digest('hex');
    const result=digest===args[0]?1:(previous===args[1]?2:0);
    if (result===1) store.set(key,args[1]);
    return respond({result});
  }
  if (store.get(key)!==String(args[0])) return respond({result:0});
  if (script.includes('DEL')) store.delete(key);
  return respond({result:1});
};
for (const key of Object.keys(process.env)) if (/^(CARELINK_|KV_|REDIS_|UPSTASH_|STORAGE_)/.test(key)) delete process.env[key];
process.env.KV_REST_API_URL='https://kv-bandwidth.test'; process.env.KV_REST_API_TOKEN='synthetic-fixture';
const { default:handler, __resetCloudCachesForTests } = await import('../../api/index.js');
const jar={cookie:''};
async function api(route,{method='GET',body={},token=''}={}) {
  const headers={}; let status=0, raw='';
  const req={url:'/api/'+route,method,headers:{host:'carelink.test',...(token?{'x-carelink-session':token}:{})},body,on(){}};
  const res={set statusCode(v){status=v},get statusCode(){return status},setHeader(k,v){headers[k.toLowerCase()]=v},end(v){raw=v||''}};
  await dispatchWithDeviceCookie(handler,req,res,jar);
  return {status,body:JSON.parse(raw),headers};
}
let checks=0;
async function check(name,fn) { await fn(); checks++; console.log('  ok  '+name); }
const pw='Synthetic#Chief2029!';
let r=await api('setup',{method:'POST',body:{admin:{username:'chief.admin',password:pw,name:'Synthetic Chief',mustChange:true},db:{meta:{schema:6},settings:{fixturePadding:crypto.randomBytes(350000).toString('base64')},users:[{id:'u-chief-fixture',username:'chief.admin',roleId:'chief',status:'active',active:true}],patients:[{id:'synthetic-p1',name:'Synthetic fixture',countyId:'kisumu',areaId:'ombeyi'}],audit:[]}}});
assert.equal(r.status,200,JSON.stringify(r.body));
r=await api('auth/login',{method:'POST',body:{username:'chief.admin',password:pw}});
assert.equal(r.status,200,JSON.stringify(r.body)); const token=r.body.token;
r=await api('auth/change-password',{method:'POST',token,body:{current:pw,password:'Synthetic#Private2030!'}});
assert.equal(r.status,200,JSON.stringify(r.body));
const original=kv.get(ROOT), envelope=JSON.parse(original);
assert.equal(envelope.format,'carelink-cloud-gzip-v1');
const originalState=JSON.parse(zlib.gunzipSync(Buffer.from(envelope.data,'base64')));
const deviceId=Object.keys(envelope.head.devices)[0];
let measured;
await check('100 warm unchanged polls still verify the writable primary, transferring over 99% fewer body bytes',async()=>{
  assert.equal((await api('state',{token})).status,200);
  traffic=[];
  for(let i=0;i<100;i++) {
    const response=await api(`state?since=${envelope.rev}`,{token});
    assert.equal(response.status,200); assert.equal(response.body.unchanged,true);
  }
  assert.equal(traffic.length,100,'one live primary check per unchanged poll');
  assert.ok(traffic.every(t=>isSnapshotRead(t.command[1])));
  assert.ok(traffic.every(t=>t.responseBytes<100),'no root payload on a verified match');
  const after=traffic.reduce((n,t)=>n+t.requestBytes+t.responseBytes,0);
  const baselineRequest=JSON.stringify(['EVAL',"return redis.call('GET', KEYS[1])",'1',ROOT]);
  const before=100*(Buffer.byteLength(baselineRequest)+Buffer.byteLength(JSON.stringify({result:original})));
  assert.ok(after<before*0.01,JSON.stringify({before,after}));
  measured={polls:100,rootBytes:Buffer.byteLength(original),baselineBodyBytes:before,verifiedBodyBytes:after,reductionPercent:Number((100*(1-after/before)).toFixed(3))};
});
await check('a cold instance downloads the exact root, then verifies subsequent cache reuse without changing storage',async()=>{
  __resetCloudCachesForTests(); traffic=[];
  assert.equal((await api('health')).status,200);
  assert.ok(traffic[0].responseBytes>Buffer.byteLength(original));
  assert.equal((await api('health')).status,200);
  assert.ok(traffic[1].responseBytes<100);
  assert.equal(kv.get(ROOT),original);
});
await check('concurrent primary checks keep their captured immutable cache entry even if another request replaces it',async()=>{
  assert.equal((await api('health')).status,200);
  let release,reached;const ready=new Promise(resolve=>{reached=resolve;});
  holdSnapshot=()=>new Promise(resolve=>{release=resolve;reached();});
  const earlier=api('health');await ready;
  const next=structuredClone(envelope);next.rev++;next.head.rev=next.rev;kv.set(ROOT,JSON.stringify(next));
  assert.equal((await api('health')).body.rev,next.rev);
  release();assert.equal((await earlier).body.rev,envelope.rev,'the earlier primary check has its own serialization point');
  assert.equal((await api('health')).body.rev,next.rev,'a later request must still verify the newer primary');
  kv.set(ROOT,original);__resetCloudCachesForTests();
});
await check('same-revision gzip head device/credential/privacy/scope changes apply across warm and cold paths',async()=>{
  const reset=()=>{kv.set(ROOT,original);__resetCloudCachesForTests();};
  const routes=[`state?since=${envelope.rev}`,'state','state?fast=1','state/collection?name=patients','session/whoami'];
  for (const cold of [false,true]) {
    reset(); assert.equal((await api('state',{token})).status,200);
    const changed=structuredClone(envelope);changed.head.devices[deviceId].status='revoked';
    kv.set(ROOT,JSON.stringify(changed)); if(cold) __resetCloudCachesForTests();
    for(const route of routes) assert.equal((await api(route,{token})).status,401,`${cold?'cold':'warm'} ${route}`);
    assert.equal((await api('session/beat',{method:'POST',token})).status,401);
    changed.head.devices[deviceId].status='approved';changed.head.creds['chief.admin'].revokedAt='fixture-revoked';
    kv.set(ROOT,JSON.stringify(changed));
    for(const route of routes) assert.equal((await api(route,{token})).status,401,route);
    delete changed.head.creds['chief.admin'].revokedAt;
    changed.head.creds['chief.admin'].mustChange=true;
    kv.set(ROOT,JSON.stringify(changed));
    assert.equal((await api('state?fast=1',{token})).body.code,'password_change_required');
    changed.head.creds['chief.admin'].mustChange=false;
    changed.head.creds['chief.admin'].roleId='finance';
    changed.head.users[0].roleId='finance';
    kv.set(ROOT,JSON.stringify(changed));
    const scoped=await api('state',{token});assert.equal(scoped.status,200);
    assert.equal(scoped.body.db.patients.length,0,'old cached Chief scope cannot survive demotion');
  }
  reset();
});
await check('same-revision sharded auth heads are re-read, with no shard downloads for unchanged polling',async()=>{
  const part=envelope.data, key='synthetic-bandwidth-shard';kv.set(key,part);
  const manifest={format:'carelink-cloud-gzip-sharded-v1',rev:envelope.rev,saved:envelope.saved,shardCount:1,shardKeys:[key],shardDigests:[crypto.createHash('sha256').update(part).digest('hex')],head:structuredClone(envelope.head)};
  kv.set(ROOT,JSON.stringify(manifest));__resetCloudCachesForTests();
  assert.equal((await api('state',{token})).status,200);
  traffic=[];assert.equal((await api(`state?since=${envelope.rev}`,{token})).body.unchanged,true);
  assert.equal(traffic.length,1);assert.ok(traffic[0].responseBytes<100);
  manifest.head.devices[deviceId].status='revoked';kv.set(ROOT,JSON.stringify(manifest));
  assert.equal((await api(`state?since=${envelope.rev}`,{token})).status,401);
  assert.equal((await api('state?fast=1',{token})).status,401);
  kv.set(ROOT,original);__resetCloudCachesForTests();
});
await check('a failed legacy headless auth write cannot turn a mutable decoded cache into device approval',async()=>{
  const legacy=structuredClone(originalState);legacy.devices={};legacy.devicePolicyInstalled=false;
  const stored=JSON.stringify({format:'carelink-cloud-gzip-v1',rev:legacy.rev,saved:legacy.saved,data:zlib.gzipSync(Buffer.from(JSON.stringify(legacy))).toString('base64')});
  kv.set(ROOT,stored);__resetCloudCachesForTests();
  assert.equal((await api('session/whoami',{token})).status,401);
  refusal={writeOnly:true,status:403,error:'ERR This database has reached current Fixed plan limits.'};
  r=await api('auth/login',{method:'POST',body:{username:'chief.admin',password:'Synthetic#Private2030!'}});
  assert.equal(r.status,503);assert.equal(r.body.code,'kv_quota_exceeded');assert.equal(kv.get(ROOT),stored);
  refusal=null;
  assert.equal((await api('session/whoami',{token})).status,401,'uncommitted bootstrap must never grant access through a warm cache');
  assert.equal(kv.get(ROOT),stored);kv.set(ROOT,original);__resetCloudCachesForTests();
});
await check('warm payloads never authorize on a failed, malformed or missing-primary read',async()=>{
  assert.equal((await api('health')).body.setup,true);
  refusal={status:503,error:'read unavailable'};
  r=await api('session/whoami',{token});assert.equal(r.status,503);assert.equal(r.body.code,'kv_unavailable');
  refusal=null;corruptReply=true;
  r=await api('session/whoami',{token});assert.equal(r.status,503);assert.equal(r.body.code,'kv_invalid_response');corruptReply=false;
  kv.set(ROOT,'not-json');r=await api('health');assert.equal(r.body.code,'kv_invalid_state');assert.equal(kv.get(ROOT),'not-json');
  kv.delete(ROOT);r=await api('health');assert.equal(r.status,200);assert.equal(r.body.setup,false);assert.equal(kv.has(ROOT),false);
  kv.set(ROOT,original);__resetCloudCachesForTests();
});
await check('Fixed-plan, bandwidth, storage and command quota wording is not misdiagnosed as credentials',async()=>{
  for(const [status,error] of [
    [403,'ERR This database has reached current Fixed plan limits. Please upgrade manually or enable auto-upgrade on Upstash Console.'],
    [403,'Database is suspended due to monthly bandwidth limit. Please upgrade to increase your limits.'],
    [400,'ERR max requests limit exceeded'],[400,'ERR max data size limit exceeded'],[429,'Too many requests']
  ]) {
    refusal={status,error};traffic=[];
    for(const route of ['health','kv-diagnostics',`state?since=${envelope.rev}`]) {
      r=await api(route,{token});assert.equal(r.status,503);assert.equal(r.body.code,'kv_quota_exceeded');
      assert.equal(r.body.retryAfterSeconds,300);assert.equal(r.headers['retry-after'],'300');
      assert.match(r.body.error,/quota, not a staff password or KV-token rejection/);
      assert.doesNotMatch(r.body.error,/Upstash rejected the KV credentials|connect a fresh|click.*reset/i);
    }
    assert.equal(traffic.length,3,'one attempt per API read, not a quota retry cascade');
  }
  refusal={status:403,error:'Unauthorized'};
  assert.match((await api('health')).body.error,/Upstash rejected the KV credentials/,'real token failures retain their diagnostic');
  refusal=null;
});
await check('session reservation, heartbeat and unlock preserve quota diagnostics instead of hiding them',async()=>{
  refusal={writeOnly:true,status:403,error:'ERR This database has reached current Fixed plan limits.'};
  for (const [route,body] of [
    ['auth/login',{username:'chief.admin',password:'Synthetic#Private2030!'}],
    ['session/beat',{}],['auth/unlock',{password:'Synthetic#Private2030!'}]
  ]) {
    r=await api(route,{method:'POST',token,body});assert.equal(r.status,503);
    assert.equal(r.body.code,'kv_quota_exceeded',route);assert.equal(r.headers['retry-after'],'300');
  }
  refusal=null;
});
await check('a quota during shard recovery does not trigger adjacent-generation download probes',async()=>{
  const key='synthetic-broken-shard',previous='synthetic-prev-shard';kv.set(key,'not-gzip');
  kv.set(ROOT,JSON.stringify({format:'carelink-cloud-gzip-sharded-v1',rev:envelope.rev,saved:envelope.saved,shardCount:1,shardKeys:[key],shardDigests:['0'.repeat(64)],prevShardKeys:[previous],head:envelope.head}));
  __resetCloudCachesForTests();refusal={key:previous,status:403,error:'Database suspended due to monthly bandwidth limit'};traffic=[];
  r=await api('state',{token});assert.equal(r.status,503);assert.equal(r.body.code,'kv_quota_exceeded');
  assert.equal(traffic.length,3,'root + current part + one previous part; no further probes');
  refusal=null;kv.set(ROOT,original);__resetCloudCachesForTests();
});
await check('a quota refusal of a large CAS write is terminal, never a reason to upload fallback shards',async()=>{
  const large=structuredClone(originalState);large.db.settings.fixturePadding=crypto.randomBytes(1100000).toString('base64');
  const prior=JSON.stringify(large);kv.set(ROOT,prior);__resetCloudCachesForTests();
  refusal={writeOnly:true,status:403,error:'ERR This database has reached current Fixed plan limits.'};traffic=[];
  r=await api('state',{method:'PUT',token,body:{patches:[{c:'personalPrefs',id:large.creds['chief.admin'].id,set:{wtheme:'foundation'}}]}});
  assert.equal(r.status,503);assert.equal(r.body.code,'kv_quota_exceeded');assert.match(r.body.error,/refused the write/);
  const writes=traffic.filter(t=>t.command && !isSnapshotRead(t.command[1]));
  assert.equal(writes.length,1);assert.ok(writes[0].requestBytes>900*1024,'exercise the old large-write shard fallback');
  assert.ok(!traffic.some(t=>t.path.startsWith('/set/')));assert.equal(kv.get(ROOT),prior);
  refusal=null;kv.set(ROOT,original);__resetCloudCachesForTests();
});
await check('quota on a real-host shard upload does not resend the payload using the alternate REST syntax',async()=>{
  const large=structuredClone(originalState);large.db.settings.fixturePadding=crypto.randomBytes(1100000).toString('base64');
  const prior=JSON.stringify(large);kv.set(ROOT,prior);__resetCloudCachesForTests();
  process.env.KV_REST_API_URL='https://fixture.upstash.io';
  refusal={writeOnly:true,status:403,error:'ERR This database has reached current Fixed plan limits.'};traffic=[];
  r=await api('state',{method:'PUT',token,body:{patches:[{c:'personalPrefs',id:large.creds['chief.admin'].id,set:{wtheme:'foundation'}}]}});
  assert.equal(r.status,503);assert.equal(r.body.code,'kv_quota_exceeded');
  assert.ok(traffic.some(t=>t.path.startsWith('/set/')));
  assert.ok(!traffic.some(t=>t.command?.[0]==='SET'),'no duplicate canonical SET on a quota');
  assert.equal(kv.get(ROOT),prior);
  refusal=null;process.env.KV_REST_API_URL='https://kv-bandwidth.test';kv.set(ROOT,original);__resetCloudCachesForTests();
});
await check('a same-revision concurrent update still defeats the cached writer through exact-root CAS',async()=>{
  assert.equal((await api('health')).status,200);
  let winner;
  beforeCommit=()=>{const next=structuredClone(envelope);next.head.loginFailures.fixture={at:'synthetic'};winner=JSON.stringify(next);kv.set(ROOT,winner);};
  r=await api('state',{method:'PUT',token,body:{patches:[{c:'personalPrefs',id:originalState.creds['chief.admin'].id,set:{wtheme:'foundation'}}]}});
  assert.equal(r.status,409);assert.equal(r.body.code,'state_conflict');assert.equal(kv.get(ROOT),winner);
  kv.set(ROOT,original);__resetCloudCachesForTests();
});
await check('another configured store cannot borrow a different cached root or receive a write after selection',async()=>{
  assert.equal((await api('health')).body.setup,true);
  process.env.KV_REST_API_URL='https://kv-bandwidth-secondary.test';traffic=[];
  r=await api('health');assert.equal(r.status,200);assert.equal(r.body.setup,false);assert.equal(secondary.size,0);
  secondary.set(ROOT,JSON.stringify({...originalState,creds:{},setup:false}));
  assert.equal((await api('session/whoami',{token})).status,401);
  process.env.KV_REST_API_URL='https://kv-bandwidth.test';__resetCloudCachesForTests();
  process.env.UPSTASH_REDIS_REST_URL='https://kv-bandwidth-secondary.test';process.env.UPSTASH_REDIS_REST_TOKEN='synthetic-secondary';
  const priorSecondary=secondary.get(ROOT);traffic=[];
  refusal={writeOnly:true,status:403,error:'ERR This database has reached current Fixed plan limits.'};
  r=await api('state',{method:'PUT',token,body:{patches:[{c:'personalPrefs',id:originalState.creds['chief.admin'].id,set:{wtheme:'foundation'}}]}});
  assert.equal(r.status,503);assert.equal(r.body.code,'kv_quota_exceeded');
  assert.ok(traffic.every(t=>t.origin==='https://kv-bandwidth.test'),'no write failover after a primary was selected');
  assert.equal(secondary.get(ROOT),priorSecondary);assert.equal(kv.get(ROOT),original);
  refusal=null;delete process.env.UPSTASH_REDIS_REST_URL;delete process.env.UPSTASH_REDIS_REST_TOKEN;
});
console.log('Synthetic bandwidth measurement: '+JSON.stringify(measured));
console.log(`kv-bandwidth: ${checks} checks passed; all provider calls were isolated fixtures.`);
