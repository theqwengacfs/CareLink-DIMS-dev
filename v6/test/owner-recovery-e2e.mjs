import { dispatchWithDeviceCookie } from './device-cookies.cjs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const kv = new Map();
let pauseCommit = null;
let loseCommitResponse = 0;
let maxShardBytes = Infinity, failShards = false, activeUploads = 0, peakUploads = 0, uploadedSizes = [];
const reply = (result, status = 200) => ({ ok:status >= 200 && status < 300, status, json:async()=>result });
globalThis.fetch = async (input, init={}) => {
  const url = new URL(String(input));
  if (url.pathname.startsWith('/get/')) return reply({result:kv.get(decodeURIComponent(url.pathname.slice(5))) ?? null});
  if (url.pathname.startsWith('/set/')) {
    const value=JSON.parse(init.body);
    activeUploads++; peakUploads=Math.max(peakUploads,activeUploads); uploadedSizes.push(value.length);
    try {
      await new Promise(resolve=>setImmediate(resolve));
      if (failShards || value.length > maxShardBytes) throw new Error('simulated network failure');
      kv.set(decodeURIComponent(url.pathname.slice(5)), value); return reply({result:'OK'});
    } finally { activeUploads--; }
  }
  if (url.pathname.startsWith('/del/')) { kv.delete(decodeURIComponent(url.pathname.slice(5))); return reply({result:1}); }
  const [op,...a] = JSON.parse(init.body);
  if (op==='GET') return reply({result:kv.get(a[0]) ?? null});
  if (op==='SET') {
    if (a.includes('NX') && kv.has(a[0])) return reply({result:null});
    kv.set(a[0], String(a[1])); return reply({result:'OK'});
  }
  if (op==='EVAL') {
    const [script, n, key, ...args] = a;
    if (script === "return redis.call('GET', KEYS[1])") return reply({result:kv.get(key) ?? null});
    if (script.includes('redis.sha1hex')) {
      if (pauseCommit) { const pause = pauseCommit; pauseCommit = null; await pause(); }
      const current = kv.get(key);
      const digest = current == null ? 'missing' : crypto.createHash('sha1').update(String(current)).digest('hex');
      const result = digest === args[0] ? 1 : (current === args[1] ? 2 : 0);
      if (result === 1) kv.set(key, args[1]);
      if (loseCommitResponse && result) { loseCommitResponse--; throw new Error('lost response'); }
      return reply({result});
    }
    if (kv.get(key)!==String(args[0])) return reply({result:0});
    if (script.includes('EXPIRE')) return reply({result:1});
    if (script.includes('DEL')) { kv.delete(key); return reply({result:1}); }
  }
  throw Error(`unexpected ${op}`);
};
process.env.KV_REST_API_URL='https://kv.test'; process.env.KV_REST_API_TOKEN='test';
const {default:handler,ownerListChiefs,ownerRecoverChief}=await import('../../api/index.js');
async function api(route, method='GET', body={}, token='') {
  const req={url:`/api/${route}`, method, headers:{host:'carelink.test',...(token?{'x-carelink-session':token}:{})},body,on(){}};
  let status, raw=''; const res={set statusCode(v){status=v},get statusCode(){return status},setHeader(){},end(s){raw=s||''}};
  await dispatchWithDeviceCookie(handler,req,res); return {status,body:JSON.parse(raw)};
}
await assert.rejects(ownerListChiefs(),/No commissioned/);
const old='Chief#Secure2027', fresh='Private#Safe2028';
let r=await api('setup','POST',{admin:{username:'chief.admin',password:old,name:'Chief'},db:{meta:{schema:6},settings:{},users:[{id:'u-chief',username:'chief.admin',roleId:'chief'}],patients:[{id:'p1',name:'demo'}],emergencyCodes:[{id:'e1',username:'chief.admin',code:'EMG-OLD'}],audit:[]}});
assert.equal(r.status,200,JSON.stringify(r.body));
assert.deepEqual(await ownerListChiefs(),[{username:'chief.admin',name:'Chief'}]);
r=await api('auth/login','POST',{username:'chief.admin',password:old});assert.equal(r.status,200); const oldToken=r.body.token;
let original=kv.get('carelink_cloud_v66');
await assert.rejects(ownerRecoverChief({username:'nobody',password:fresh}),/not an existing Chief/);
await assert.rejects(ownerRecoverChief({username:'chief.admin',password:'weak'}),/12 characters/);
assert.equal(kv.get('carelink_cloud_v66'),original);
await ownerRecoverChief({username:'chief.admin',password:fresh});
assert.equal((await api('session/whoami','GET',{},oldToken)).status,401);
assert.equal((await api('auth/login','POST',{username:'chief.admin',password:old})).status,401);
r=await api('auth/login','POST',{username:'chief.admin',password:fresh});assert.equal(r.status,200,JSON.stringify(r.body));
let stored=JSON.parse(kv.get('carelink_cloud_v66'));
if(stored.format==='carelink-cloud-gzip-v1') stored=JSON.parse(zlib.gunzipSync(Buffer.from(stored.data,'base64')));
assert.equal(stored.db.patients[0].id,'p1');
assert.ok(stored.audit.some(x=>x.action==='auth.owner_recovery'));
assert.ok(!(stored.db.emergencyCodes||[]).some(x=>x.username==='chief.admin'));
assert.ok(!JSON.stringify(stored).includes(fresh));
// Exercise the sharded path, including a newer head credential than its shard.
const shard= zlib.gzipSync(Buffer.from(JSON.stringify(stored))).toString('base64');
kv.set('test-owner-shard',shard);
const head={setup:true,globallyActivated:!!stored.globallyActivated,rev:stored.rev,creds:{...stored.creds,'second.chief':{username:'second.chief',name:'Other Chief',roleId:'chief'},staff:{username:'staff',name:'Staff',roleId:'staff'}},users:stored.db.users,
 loginFailures:stored.loginFailures||{}, sessions:stored.sessions||{},revokedSessions:stored.revokedSessions||{},audit:stored.audit||[]};
kv.set('carelink_cloud_v66',JSON.stringify({format:'carelink-cloud-gzip-sharded-v1',rev:stored.rev,saved:stored.saved,
 shardCount:1,shardKeys:['test-owner-shard'],shardDigests:[crypto.createHash('sha256').update(shard).digest('hex')],head}));
assert.deepEqual(await ownerListChiefs(),[{username:'chief.admin',name:'Chief'},{username:'second.chief',name:'Other Chief'}]);
await ownerRecoverChief({username:'chief.admin',password:'Another#Private2029'});
r=await api('auth/login','POST',{username:'chief.admin',password:'Another#Private2029'});assert.equal(r.status,200,JSON.stringify(r.body));
// A concurrent write must win rather than being silently overwritten.
let release, reached; const ready=new Promise(resolve=>{reached=resolve});
pauseCommit=()=>new Promise(resolve=>{release=resolve;reached()});
const pending=ownerRecoverChief({username:'chief.admin',password:'Final#Private2030'});
await ready;
const during=await api('auth/login','POST',{username:'chief.admin',password:'wrong'});
assert.equal(during.status,401);
release();
await assert.rejects(pending,e=>e.code==='state_conflict');
assert.equal((await api('auth/login','POST',{username:'chief.admin',password:'Final#Private2030'})).status,401);
// A commissioned legacy account can exist without a matching user row.
await ownerRecoverChief({username:'second.chief',password:'Legacy#Private2032'});
r=await api('auth/login','POST',{username:'second.chief',password:'Legacy#Private2032'});assert.equal(r.status,200,JSON.stringify(r.body));
assert.equal(r.body.username,'second.chief');
// On constrained links the owner path writes smaller shards serially, with an
// atomic head switch only after every part succeeds.
stored=JSON.parse(kv.get('carelink_cloud_v66'));
if(stored.format==='carelink-cloud-gzip-v1') stored=JSON.parse(zlib.gunzipSync(Buffer.from(stored.data,'base64')));
assert.ok(stored.db);
stored.db.patients[0].blob=crypto.randomBytes(1_500_000).toString('base64');
kv.set('carelink_cloud_v66',JSON.stringify(stored));
const beforeLarge=kv.get('carelink_cloud_v66');
failShards=true; uploadedSizes=[]; peakUploads=0;
await assert.rejects(ownerRecoverChief({username:'chief.admin',password:'Fail#Private2033'}),/Upload part 1.*before the password change was committed/);
assert.equal(kv.get('carelink_cloud_v66'),beforeLarge,'failed part must not switch active head');
failShards=false; maxShardBytes=220*1024; uploadedSizes=[]; peakUploads=0;
const progress=[];
await ownerRecoverChief({username:'chief.admin',password:'Slow#Private2034',onProgress:(done,total)=>progress.push([done,total])});
const manifest=JSON.parse(kv.get('carelink_cloud_v66'));
assert.equal(manifest.format,'carelink-cloud-gzip-sharded-v1');
assert.ok(manifest.shardCount>1 && manifest.shardCount<=16);
assert.equal(peakUploads,1,'recovery parts must be sent sequentially');
assert.ok(uploadedSizes.every(size=>size<=maxShardBytes));
assert.equal(progress.length,manifest.shardCount);
r=await api('auth/login','POST',{username:'chief.admin',password:'Slow#Private2034'});assert.equal(r.status,200,JSON.stringify(r.body));
const rebuilt=JSON.parse(zlib.gunzipSync(Buffer.from(manifest.shardKeys.map(k=>kv.get(k)).join(''),'base64')));
assert.equal(rebuilt.db.patients[0].blob,stored.db.patients[0].blob);
console.log('owner-recovery-e2e: discovery, data retention, session invalidation, sharded uploads, write failure and concurrent-write protection passed');
