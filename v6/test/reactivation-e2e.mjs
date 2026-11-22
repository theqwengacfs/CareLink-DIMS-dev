import { dispatchWithDeviceCookie } from './device-cookies.cjs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import structure from '../../api/official-structure.mjs';

const kv = new Map();
let pauseCommit = null;
let loseCommitResponse = 0;
const reply = (result, status = 200) => ({ ok:status >= 200 && status < 300, status, json:async()=>result });
globalThis.fetch = async (input, init={}) => {
  const url = new URL(String(input));
  if (url.pathname.startsWith('/get/')) return reply({result:kv.get(decodeURIComponent(url.pathname.slice(5))) ?? null});
  if (url.pathname.startsWith('/set/')) { kv.set(decodeURIComponent(url.pathname.slice(5)), JSON.parse(init.body)); return reply({result:'OK'}); }
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
process.env.KV_REST_API_URL='https://kv.test'; process.env.KV_REST_API_TOKEN='reactivation-test';
const {default:handler}=await import('../../api/index.js');
async function api(route, method='GET', body={}, token='') {
  const req={url:`/api/${route}`, method, headers:{host:'carelink.test',...(token?{'x-carelink-session':token}:{})},body,on(){}};
  let status, raw='';
  const res={set statusCode(v){status=v}, get statusCode(){return status}, setHeader(){},end(s){raw=s||''}};
  await dispatchWithDeviceCookie(handler,req,res); return {status,body:JSON.parse(raw)};
}
const chiefPass='Chief#Secure2027';
let r=await api('setup','POST',{admin:{username:'chief.admin',password:chiefPass,name:'Chief'},db:{meta:{schema:6},settings:{},users:[],patients:[{id:'patient-1',countyId:'kisumu',name:'demo'}],employees:[{id:'old-employee',userId:'u-director',username:'director',name:'Old Name'}],pendingActivations:[{id:'old-chief-code',username:'chief.admin',code:'ACT-CHIEF'},{id:'old-obsolete-code',username:'obsolete',code:'ACT-OLD'}],audit:[]}});
assert.equal(r.status,200,JSON.stringify(r.body));
r=await api('auth/login','POST',{username:'chief.admin',password:chiefPass});assert.equal(r.status,200);const chief=r.body.token;
r=await api('setup/activate-global','POST',{users:[
  {id:'u-director',username:'director',name:'Old Director',roleId:'director',countyId:'kisumu',status:'active',active:true},
  {id:'u-obsolete',username:'obsolete',name:'Old Account',roleId:'me',countyId:'kisumu',status:'active',active:true},
],accounts:[
  {id:'u-director',username:'director',name:'Old Director',roleId:'director',countyId:'kisumu',password:'OldPrivate#2026A!'},
  {id:'u-obsolete',username:'obsolete',name:'Old Account',roleId:'me',countyId:'kisumu',password:'OldHarbour#2026B!'},
]},chief);assert.equal(r.status,200,JSON.stringify(r.body));
const firstIssued=new Map(r.body.issued.map(row=>[row.username,row.password]));
async function firstPrivate(username,password){
  const login=await api('auth/login','POST',{username,password:firstIssued.get(username)});
  assert.equal(login.status,200,JSON.stringify(login.body));
  const change=await api('auth/change-password','POST',{current:firstIssued.get(username),password},login.body.token);
  assert.equal(change.status,200,JSON.stringify(change.body));return login;
}
r=await firstPrivate('director','OldPrivate#2026A!');assert.equal(r.status,200);const oldDirector=r.body.token;
r=await firstPrivate('obsolete','OldHarbour#2026B!');assert.equal(r.status,200);const obsolete=r.body.token;
r=await api('credentials/provision','POST',{accounts:[{id:'u-custom-test',username:'custom.test',email:'officer.alias@lomamofoundation.org',name:'Test Officer',roleId:'finance',countyId:'kisumu'}]},chief);
assert.equal(r.status,200,JSON.stringify(r.body));
assert.equal(r.body.issued[0].email,'','provisioning cannot claim an unconfirmed mailbox');
let emailLogin=await api('auth/login','POST',{username:r.body.issued[0].username,password:r.body.issued[0].password});
assert.equal(emailLogin.status,200,JSON.stringify(emailLogin.body));
await api('auth/logout','POST',{},emailLogin.body.token);

assert.equal((await api('admin/reactivate','POST',{confirm:'REBUILD',password:chiefPass},obsolete)).status,403);
assert.equal((await api('admin/reactivate','POST',{confirm:'NO',password:chiefPass},chief)).status,400);
assert.equal((await api('admin/reactivate','POST',{confirm:'REBUILD',password:'wrong'},chief)).status,403);
const before=JSON.parse(kv.get('carelink_cloud_v66'));
let release, reached; const ready=new Promise(resolve=>{reached=resolve});
pauseCommit=()=>new Promise(resolve=>{release=resolve;reached()});
const pending=api('admin/reactivate','POST',{confirm:'REBUILD',password:chiefPass},chief);
await ready;
const concurrent=await api('state','PUT',{patches:[{c:'employees',id:'concurrent',set:{id:'concurrent',name:'Concurrent change'}}]},chief);
assert.equal(concurrent.status,200,JSON.stringify(concurrent.body));
release();
const conflict=await pending;
assert.equal(conflict.status,409,JSON.stringify(conflict.body));
assert.equal(conflict.body.code,'state_conflict');
let stored=JSON.parse(kv.get('carelink_cloud_v66'));
assert.equal(stored.db.employees.some(x=>x.id==='concurrent'),true);
assert.deepEqual(Object.keys(stored.creds).sort(),Object.keys(before.creds).sort());
// Simulate a response lost after the atomic commit (both transport attempts).
loseCommitResponse=2;
r=await api('admin/reactivate','POST',{confirm:'REBUILD',password:chiefPass},chief);
assert.equal(r.status,503,JSON.stringify(r.body));
stored=JSON.parse(kv.get('carelink_cloud_v66'));
if (stored.format === 'carelink-cloud-gzip-v1') stored=JSON.parse(zlib.gunzipSync(Buffer.from(stored.data,'base64')).toString());
assert.ok(stored.rebuildRevision>0);
assert.equal(stored.db.patients[0].id,'patient-1');
assert.equal(stored.db.employees.find(e=>e.id==='old-employee').name,'Martin Mito Chamah');
assert.equal(stored.db.employees.some(e=>e.id==='concurrent'),true);
assert.deepEqual(stored.db.pendingActivations.map(e=>e.username),['chief.admin'],'chief recovery is preserved and stale staff codes removed');
assert.equal((await api('session/whoami','GET',{},chief)).status,200,'Chief session preserved');
assert.equal((await api('session/whoami','GET',{},oldDirector)).status,401,'old signed session revoked');
assert.equal((await api('session/whoami','GET',{},obsolete)).status,401,'removed account cannot use signed fallback');
assert.equal((await api('auth/login','POST',{username:'obsolete',password:'OldHarbour#2026B!'})).status,401);
assert.equal((await api('state','PUT',{baseRev:stored.rebuildRevision-1,patches:[]},chief)).body.code,'rebuild_refresh_required');
const repeated=await api('admin/reactivate','POST',{confirm:'REBUILD',password:chiefPass},chief);
assert.equal(repeated.status,409);assert.equal(repeated.body.code,'reactivation_pack_pending');
assert.equal((await api('admin/reactivation-pack','POST',{password:'bad'},chief)).status,403);
r=await api('admin/reactivation-pack','POST',{password:chiefPass},chief);
assert.equal(r.status,200,JSON.stringify(r.body));
const rows=r.body.issued;
assert.equal(rows.length,structure.roster.filter(x=>!x.unconfirmed && x.roleId!=='chief').length);
assert.equal(new Set(rows.map(x=>x.tempPassword)).size,rows.length);
assert.equal(rows.some(x=>x.username==='president'),false,'unconfirmed seats do not get credentials');
assert.equal(stored.db.users.find(u=>u.username==='president').active,false);
assert.equal(stored.db.users.find(u=>u.username==='obsolete').active,false);
assert.ok(!JSON.stringify(stored).includes(rows[0].tempPassword),'no cleartext pack in KV');
for (const row of rows.filter(r=>r.username!=='director')) {
  const login=await api('auth/login','POST',{username:row.username,password:row.tempPassword});
  assert.equal(login.status,200,`issued credential failed: ${row.username}`);
  assert.equal(login.body.user.roleId,row.roleId);
  assert.equal(login.body.passwordBeforeWorkspace,true,'re-issued credentials require private replacement');
  assert.equal((await api('state','GET',{},login.body.token)).status,403);
  assert.equal((await api('auth/change-password','POST',{current:row.tempPassword,password:'Personal#2027!'+crypto.createHash('sha256').update(row.username).digest('hex').slice(0,8)},login.body.token)).status,200);
  assert.equal((await api('auth/logout','POST',{},login.body.token)).status,200);
}
const director=rows.find(x=>x.username==='director');
assert.equal(director.email,'','no roster name is treated as mailbox confirmation');
assert.ok(rows.every(r=>!r.email),'no addresses exported without mailbox attestation');
assert.equal(stored.db.users.filter(u=>!u.archivedByRebuild&&u.roleId!=='chief'&&!u.unconfirmed).every(u=>u.mustChange===true),true,'rebuilt named seats force a private password');
assert.equal((await api('auth/login','POST',{username:'director',password:'OldPrivate#2026A!'})).status,401);
r=await api('auth/login','POST',{username:'director',password:director.tempPassword});
assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.mustChange,true);
assert.equal(r.body.passwordBeforeWorkspace,true);
const token=r.body.token;
/* The issued password opens the workspace immediately. */
const workspace=await api('state','GET',{},token);
assert.equal(workspace.status,403);
/* Changing it later is optional, and still rotates the credential cleanly. */
r=await api('auth/change-password','POST',{current:director.tempPassword,password:'Private#New2027!'},token);assert.equal(r.status,200,JSON.stringify(r.body));
/* One live session per account: the change happens in-session, so sign out first. */
assert.equal((await api('auth/login','POST',{username:'director',password:'Private#New2027!'})).status,409,'a second device cannot take the account over');
assert.equal((await api('auth/logout','POST',{},token)).status,200);
assert.equal((await api('auth/login','POST',{username:'director',password:director.tempPassword})).status,401,'the pack password stops working once replaced');
r=await api('auth/login','POST',{username:'director',password:'Private#New2027!'});assert.equal(r.status,200,JSON.stringify(r.body));
const afterChange=await api('state','GET',{},r.body.token);
assert.equal(afterChange.status,200);
assert.equal(r.body.mustChange,false,'the personal password is not a temporary one');
const liveToken=r.body.token;
assert.equal((await api('state','GET',{},token)).status,401,'the replaced session is dead');
const attack=await api('state','PUT',{baseRev:stored.rebuildRevision,patches:[{c:'emergencyCodes',id:'forged',set:{id:'forged',username:'chief.admin',code:'EMG-FORGED',expiresAt:'2099-01-01'}}]},liveToken);
assert.equal(attack.body.rejected[0].reason,'account_recovery_scope_denied');
r=await api('admin/reactivation-pack','POST',{password:chiefPass},chief);assert.equal(r.status,200);
assert.equal(r.body.issued.some(x=>x.username==='director'),false,'personalised credentials not recovered');
// A damaged post-rebuild shard must not recover an intact pre-rebuild snapshot
// and silently lose the new account hierarchy or revision barrier.
const liveEnvelope=JSON.parse(kv.get('carelink_cloud_v66'));
assert.equal(liveEnvelope.format,'carelink-cloud-gzip-v1');
const previous=zlib.gzipSync(Buffer.from(JSON.stringify(before))).toString('base64');
kv.set('test-previous-shard',previous);
kv.set('test-damaged-shard','damaged');
const fakeManifest=JSON.stringify({format:'carelink-cloud-gzip-sharded-v1',rev:liveEnvelope.rev,saved:liveEnvelope.saved,
  shardCount:1,shardKeys:['test-damaged-shard'],shardDigests:[crypto.createHash('sha256').update('expected-value').digest('hex')],
  prevShardKeys:['test-previous-shard'],head:liveEnvelope.head});
kv.set('carelink_cloud_v66',fakeManifest);
const damaged=await api('state','GET',{},chief);
assert.equal(damaged.status,503,JSON.stringify(damaged.body));
assert.equal(damaged.body.code,'kv_invalid_state');
assert.equal(kv.get('carelink_cloud_v66'),fakeManifest,'damaged post-rebuild state must not be replaced with an older snapshot');
console.log(`reactivation-e2e: CAS conflict, lost response recovery, ${rows.length} unique passwords, single-use mandatory private change, old-session invalidation and shard rollback protection passed`);
