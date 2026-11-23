import { isSnapshotRead, conditionalPrimaryRead } from './kv-primary-read.cjs';
/* Phase 1 boundary tests use separate cookie jars: a forged label, copied token
   or browser DB patch can never stand in for server-side device admission. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import structure from '../../api/official-structure.mjs';
import {dispatchWithDeviceCookie} from './device-cookies.cjs';
const kv=new Map();
let failWrites=false, holdCommit=null;
const answer=(result,status=200)=>({ok:status>=200&&status<300,status,json:async()=>result});
globalThis.fetch=async(input,init={})=>{
  const url=new URL(String(input));assert.equal(url.origin,'https://entry-security.test');
  if(url.pathname.startsWith('/del/')){kv.delete(decodeURIComponent(url.pathname.slice(5)));return answer({result:1});}
  const [op,...a]=JSON.parse(init.body);
  if(op==='GET') return answer({result:kv.get(a[0])??null});
  if(op==='SET'){
    if(failWrites) return answer({error:'unavailable'},503);
    if(a.includes('NX')&&kv.has(a[0])) return answer({result:null});
    kv.set(a[0],String(a[1]));return answer({result:'OK'});
  }
  if(op==='EVAL'){
    const [script,count,key,...args]=a;assert.equal(Number(count),1);
    if(isSnapshotRead(script)) return answer({result:conditionalPrimaryRead(kv,key,args[0])});
    if(script==="return redis.call('GET', KEYS[1])") return answer({result:kv.get(key)??null});
    if(failWrites) return answer({error:'unavailable'},503);
    if(script.includes('redis.sha1hex')){
      if(holdCommit){const pause=holdCommit;holdCommit=null;await pause();}
      const old=kv.get(key),digest=old===undefined?'missing':crypto.createHash('sha1').update(old).digest('hex');
      if(digest!==args[0]) return answer({result:old===args[1]?2:0});
      kv.set(key,args[1]);return answer({result:1});
    }
    if(kv.get(key)!==String(args[0])) return answer({result:0});
    if(script.includes('DEL')){kv.delete(key);return answer({result:1});}
    if(script.includes('EXPIRE')) return answer({result:1});
  }
  throw Error('Unexpected mock Redis command: '+op);
};
for(const key of ['UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','REDIS_URL','KV_URL']) delete process.env[key];
process.env.KV_REST_API_URL='https://entry-security.test';process.env.KV_REST_API_TOKEN='fixture-token';
const {default:handler,__resetCloudCachesForTests,ownerRecoverChief,ownerListPendingDevices}=await import('../../api/index.js');
function browser(){
  const jar={cookie:''};
  return {jar,async call(route,{method='GET',body={},token='',headers={}}={}){
    const req={url:'/api/'+route,method,headers:{host:'carelink.test',...(token?{'x-carelink-session':token}:{}),...headers},body,on(){}};
    let status=0,raw='';const responseHeaders={};
    const res={set statusCode(v){status=v},get statusCode(){return status},setHeader(k,v){responseHeaders[k.toLowerCase()]=v},end(v){raw=v||''}};
    await dispatchWithDeviceCookie(handler,req,res,jar);
    return {status,body:raw?JSON.parse(raw):{},headers:responseHeaders};
  }};
}
function stored(){
  const envelope=JSON.parse(kv.get('carelink_cloud_v66'));
  if(envelope.format==='carelink-cloud-gzip-v1') return JSON.parse(zlib.gunzipSync(Buffer.from(envelope.data,'base64')));
  if(envelope.format==='carelink-cloud-gzip-sharded-v1'){
    const inner=JSON.parse(Buffer.from(envelope.shardKeys.map(k=>kv.get(k)).join(''),'base64'));
    const value=inner.format==='carelink-cloud-gzip-v1'?JSON.parse(zlib.gunzipSync(Buffer.from(inner.data,'base64'))):inner;
    return {...value,creds:envelope.head.creds,devices:envelope.head.devices,devicePolicyInstalled:envelope.head.devicePolicyInstalled};
  }
  return envelope;
}
const chief=browser(),staff=browser(),stranger=browser();
const chiefPassword='Chief#Private2027!';let checks=0;
function ok(value,message){assert.ok(value,message);checks++;}
let r=await chief.call('setup',{method:'POST',body:{admin:{username:'chief.admin',password:chiefPassword},db:{meta:{schema:6},settings:{},users:[],audit:[],patients:[{id:'fixture-patient',name:'Synthetic Fixture',synthetic:true,countyId:'kisumu',areaId:'ombeyi'}]}}});
assert.equal(r.status,200,JSON.stringify(r.body));
ok(/HttpOnly/.test(r.headers['set-cookie'])&&/SameSite=Strict/.test(r.headers['set-cookie'])&&/; Secure/.test(r.headers['set-cookie']),'proof cookie must be HttpOnly, Strict, Secure on hosted origins');
r=await chief.call('auth/login',{method:'POST',body:{username:'chief.admin',password:chiefPassword}});assert.equal(r.status,200,JSON.stringify(r.body));const chiefToken=r.body.token;
const chiefDevice=Object.keys(stored().devices)[0];ok(stored().devicePolicyInstalled,'commissioning permanently installs device policy');
r=await stranger.call('auth/login',{method:'POST',body:{username:'chief.admin',password:'incorrect',deviceLabel:'approved'}});assert.equal(r.status,401);assert.equal(Object.keys(stored().devices).length,1);ok(!stranger.jar.cookie,'wrong passwords do not create registration records');
assert.equal((await stranger.call('public/status')).status,200);
r=await stranger.call('health');ok(!('admins' in r.body)&&!('devices' in r.body)&&!('creds' in r.body),'public probes do not disclose the security register');
assert.equal((await stranger.call('admin/devices',{token:chiefToken})).status,403,'a stolen session token without its cookie is not a Chief session');
assert.equal((await chief.call('admin/system-config',{method:'POST',token:chiefToken,body:{entryTheme:'canopy'}})).status,400);
r=await chief.call('admin/system-config',{method:'POST',token:chiefToken,body:{entryTheme:'clinic',temporaryPasswordDays:7}});assert.equal(r.status,200);assert.equal(stored().db.settings.system.config.entryTheme,'clinic');assert.equal((await stranger.call('health')).body.landingTheme,'clinic');
ok(stored().audit.some(e=>e.action==='system.config_changed'&&e.meta.deviceId===chiefDevice),'config is audited with the acting device');
const beforeInvalidTargets=kv.get('carelink_cloud_v66');
for(const key of ['__proto__','constructor','toString']){
  assert.equal((await chief.call('admin/devices/decision',{method:'POST',token:chiefToken,body:{password:chiefPassword,deviceId:key,decision:'approved'}})).status,400);
  assert.equal((await chief.call('admin/staff-accounts/revoke',{method:'POST',token:chiefToken,body:{password:chiefPassword,username:key}})).status,400);
}
ok(kv.get('carelink_cloud_v66')===beforeInvalidTargets && ({}).revokedAt===undefined && ({}).status===undefined,'security consoles reject inherited object keys without mutation or prototype pollution');
r=await chief.call('admin/staff-accounts/mailbox',{method:'POST',token:chiefToken,body:{username:'director',email:'fixture.confirmed@lomamofoundation.org',confirm:'MAILBOX CONFIRMED',password:chiefPassword}});assert.equal(r.status,200);
assert.equal((await chief.call('admin/staff-accounts/mailbox',{method:'POST',token:chiefToken,body:{username:'president',email:'invented@lomamofoundation.org',confirm:'MAILBOX CONFIRMED',password:chiefPassword}})).status,400);
assert.equal((await chief.call('admin/staff-accounts/export',{method:'POST',token:chiefToken,body:{password:'wrong',confirm:'ISSUE TEMPORARY PASSWORDS'}})).status,403);
r=await chief.call('admin/staff-accounts/export',{method:'POST',token:chiefToken,body:{password:chiefPassword,confirm:'ISSUE TEMPORARY PASSWORDS',usernames:['director','caregiver.ombeyi','president','chief.admin']}});assert.equal(r.status,200,JSON.stringify(r.body));
const director=r.body.rows.find(x=>x.username==='director'),caregiver=r.body.rows.find(x=>x.username==='caregiver.ombeyi'),seat=r.body.rows.find(x=>x.username==='president');
assert.equal(director.name,structure.roster.find(x=>x.username==='director').name);assert.equal(director.email,'fixture.confirmed@lomamofoundation.org');assert.equal(caregiver.email,'');
ok(seat.unconfirmed&&seat.name===structure.roster.find(x=>x.username==='president').name&&!seat.temporaryPassword&&!seat.email,'unconfirmed seats retain the actual roster label and no credentials');
ok(r.body.rows.find(x=>x.roleId==='chief').temporaryPassword===''&&!JSON.stringify(stored()).includes(director.temporaryPassword),'Chief private credential is retained; generated passwords never appear in plaintext KV');
const firstExpiry=Date.parse(caregiver.expiresAt);ok(firstExpiry>Date.now()+6.99*86400000&&firstExpiry<Date.now()+7.01*86400000,'default expiration is seven days');
const exportAudit=stored().audit.find(e=>e.action==='staff.credentials_exported');ok(exportAudit&&exportAudit.meta.who==='chief.admin'&&exportAudit.meta.rowCount===4&&exportAudit.meta.deviceId===chiefDevice&&exportAudit.meta.when,'every export records actor, time, count, and acting device');
assert.equal((await stranger.call('admin/staff-accounts/export-log',{method:'POST',token:chiefToken,body:{format:'csv',usernames:['director']}})).status,403,'copied token cannot audit/release a legacy download');
assert.equal((await chief.call('admin/staff-accounts/export-log',{method:'POST',token:chiefToken,body:{format:'csv',usernames:['__proto__']}})).status,400,'export names must be actual roster seats, not object properties');
r=await chief.call('admin/staff-accounts/export-log',{method:'POST',token:chiefToken,body:{format:'directory-text',usernames:['director','president']}});assert.equal(r.status,200,'a directory retains unconfirmed seats without inventing credentials');
r=await chief.call('admin/staff-accounts/export-log',{method:'POST',token:chiefToken,body:{format:'csv',usernames:['director','caregiver.ombeyi']}});assert.equal(r.status,200);
const downloadAudit=stored().audit.findLast(e=>e.action==='staff.export_download_requested');
ok(downloadAudit.meta.who==='chief.admin'&&downloadAudit.meta.rowCount===2&&downloadAudit.meta.deviceId===chiefDevice&&downloadAudit.meta.when,'legacy file/clipboard handoffs also require an actor/time/count/device audit');
r=await staff.call('auth/login',{method:'POST',body:{username:caregiver.username,password:caregiver.temporaryPassword,deviceLabel:'Synthetic test tablet',deviceType:'tablet',deviceId:chiefDevice,approved:true}});assert.equal(r.status,403);assert.equal(r.body.code,'device_pending');
const staffDevice=r.body.deviceId;ok(!r.body.token&&!r.body.inlineState&&!r.body.db,'pending browsers receive no staff token or data');
let device=stored().devices[staffDevice];ok(device.label==='Synthetic test tablet'&&device.type==='tablet'&&device.requestedBy===caregiver.username&&device.firstSeen,'pending register holds label, type, first-seen time and verified user');
ok(!stored().creds[caregiver.username].temporary.usedAt,'pending sign-in does not consume a temporary password');
assert.equal((await staff.call('state',{token:chiefToken})).status,401);
assert.equal((await staff.call('admin/devices/decision',{method:'POST',token:chiefToken,body:{password:chiefPassword,deviceId:staffDevice,decision:'approved'}})).status,403);
r=await chief.call('admin/devices/decision',{method:'POST',token:chiefToken,body:{password:chiefPassword,deviceId:staffDevice,decision:'approved'}});assert.equal(r.status,200);
const attempt='synthetic-login-attempt-001';
r=await staff.call('auth/login',{method:'POST',body:{username:caregiver.username,password:caregiver.temporaryPassword,loginAttemptId:attempt}});assert.equal(r.status,200,JSON.stringify(r.body));const staffToken=r.body.token;
ok(r.body.mustChange&&r.body.passwordBeforeWorkspace&&!r.body.inlineState,'approved temporary holders still cannot load a workspace before private replacement');
const retry=await staff.call('auth/login',{method:'POST',body:{username:caregiver.username,password:caregiver.temporaryPassword,loginAttemptId:attempt}});assert.equal(retry.status,200,'network retry of same attempt/device is idempotent');
assert.equal((await staff.call('auth/login',{method:'POST',body:{username:caregiver.username,password:caregiver.temporaryPassword,loginAttemptId:'another-attempt-002'}})).body.code,'temporary_password_unavailable');
for(const route of ['state','state?fast=1','state/collection?name=patients','audit','admin/staff-accounts']) assert.equal((await staff.call(route,{token:staffToken})).status,403,route+' must be barred before password replacement');
assert.equal((await staff.call('state',{method:'PUT',token:staffToken,body:{patches:[]}})).body.code,'password_change_required');
assert.equal((await stranger.call('session/whoami',{token:staffToken})).status,401);
const privatePassword='Private#River2028!';
r=await staff.call('auth/change-password',{method:'POST',token:staffToken,body:{current:caregiver.temporaryPassword,password:privatePassword}});assert.equal(r.status,200,JSON.stringify(r.body));
r=await staff.call('state',{token:staffToken});assert.equal(r.status,200);ok(!('devices' in r.body.db)&&!('credentialExports' in r.body.db)&&!JSON.stringify(r.body).includes(caregiver.temporaryPassword),'staff sync never returns proof registry or credential export material');
assert.equal((await staff.call('admin/system-config',{method:'POST',token:staffToken,body:{entryTheme:'heritage'}})).status,403);
r=await staff.call('state',{method:'PUT',token:staffToken,body:{patches:[{c:'devices',id:staffDevice,set:{status:'approved'}},{c:'settings',id:'settings',set:{value:{system:{config:{entryTheme:'heritage'}}}}}]}});assert.equal(r.status,200);assert.equal(r.body.rejected.length,2);
// A normal sync cannot transform an unconfirmed address into mailbox evidence.
r=await chief.call('state',{method:'PUT',token:chiefToken,body:{patches:[{c:'users',id:stored().creds[caregiver.username].id,set:{email:'invented@lomamofoundation.org',mailboxConfirmed:true}}]}});assert.equal(r.status,200);
r=await chief.call('admin/staff-accounts',{token:chiefToken});assert.equal(r.body.rows.find(x=>x.username===caregiver.username).email,'');
// A rejected browser remains rejected even with valid Chief credentials.
r=await stranger.call('auth/login',{method:'POST',body:{username:'chief.admin',password:chiefPassword}});assert.equal(r.body.code,'device_pending');const otherDevice=r.body.deviceId;
await chief.call('admin/devices/decision',{method:'POST',token:chiefToken,body:{password:chiefPassword,deviceId:otherDevice,decision:'rejected'}});
assert.equal((await stranger.call('auth/login',{method:'POST',body:{username:'chief.admin',password:chiefPassword}})).body.code,'device_rejected');
assert.equal((await chief.call('admin/devices/decision',{method:'POST',token:chiefToken,body:{password:chiefPassword,deviceId:chiefDevice,decision:'revoked'}})).status,409,'cannot strand the currently signed-in Chief');
// Revoke a device and verify tokens, heartbeat, fast packs and reads all fail.
await chief.call('admin/devices/decision',{method:'POST',token:chiefToken,body:{password:chiefPassword,deviceId:staffDevice,decision:'revoked'}});
for(const route of ['state','state?fast=1','session/whoami','state/collection?name=patients']) assert.equal((await staff.call(route,{token:staffToken})).status,401,route);
assert.equal((await staff.call('session/beat',{method:'POST',token:staffToken})).status,401);
await chief.call('admin/devices/decision',{method:'POST',token:chiefToken,body:{password:chiefPassword,deviceId:staffDevice,decision:'approved'}});
await chief.call('admin/staff-accounts/revoke',{method:'POST',token:chiefToken,body:{password:chiefPassword,username:caregiver.username}});
assert.equal((await staff.call('state',{token:staffToken})).status,401,'per-account revocation invalidates existing signed sessions');
assert.equal((await staff.call('auth/login',{method:'POST',body:{username:caregiver.username,password:privatePassword}})).body.code,'account_revoked');
// Retain private credentials in an export, expire new issuance under config.
await chief.call('admin/system-config',{method:'POST',token:chiefToken,body:{temporaryPasswordDays:1}});
r=await chief.call('admin/staff-accounts/export',{method:'POST',token:chiefToken,body:{password:chiefPassword,confirm:'ISSUE TEMPORARY PASSWORDS',usernames:[caregiver.username]}});assert.equal(r.status,200);const reissued=r.body.rows[0];
ok(Date.parse(reissued.expiresAt)<Date.now()+1.01*86400000,'configurable validity is used by new issuance');
let current=stored();current.creds[caregiver.username].temporary.expiresAt=Date.now()-1;kv.set('carelink_cloud_v66',JSON.stringify(current));__resetCloudCachesForTests();
assert.equal((await staff.call('auth/login',{method:'POST',body:{username:caregiver.username,password:reissued.temporaryPassword}})).body.code,'temporary_password_unavailable');
// The legacy route cannot accept a chosen/reusable no-change password.
r=await chief.call('credentials/provision',{method:'POST',token:chiefToken,body:{username:'fixture.staff',name:'Synthetic Test Staff',roleId:'me',password:'ClientChosen#2028!',mustChange:false}});assert.equal(r.status,200);ok(r.body.issued[0].password!=='ClientChosen#2028!'&&stored().creds['fixture.staff'].mustChange&&stored().creds['fixture.staff'].temporary,'legacy provisioning also uses server-generated, expiring, mandatory-change credentials');
// Fail-closed persistence and CSRF rejection.
const before=kv.get('carelink_cloud_v66');failWrites=true;r=await chief.call('admin/system-config',{method:'POST',token:chiefToken,body:{entryTheme:'heritage'}});failWrites=false;assert.equal(r.status,503);assert.equal(kv.get('carelink_cloud_v66'),before);
assert.equal((await chief.call('admin/system-config',{method:'POST',token:chiefToken,headers:{origin:'https://attacker.example'},body:{entryTheme:'heritage'}})).body.code,'origin_denied');
// A one-time migration enrolls only the password-verified Chief, never staff.
current=stored();current.devices={};current.devicePolicyInstalled=false;kv.set('carelink_cloud_v66',JSON.stringify(current));__resetCloudCachesForTests();
const migration=browser();r=await migration.call('auth/login',{method:'POST',body:{username:'chief.admin',password:chiefPassword}});assert.equal(r.status,409,'existing account lease is still enforced during migration');
ok(stored().devicePolicyInstalled,'migration is permanently closed even when an older Chief lease has not expired');
current=stored();current.devices={};kv.set('carelink_cloud_v66',JSON.stringify(current));__resetCloudCachesForTests();
r=await migration.call('auth/login',{method:'POST',body:{username:'chief.admin',password:chiefPassword}});assert.equal(r.body.code,'device_pending','clearing/revoking all records never reopens Chief bootstrap');
// CAS conflict: a loser must not overwrite a newer device approval/config write.
current=stored();current.devices[chiefDevice]={id:chiefDevice,status:'approved',label:'Chief',users:['chief.admin']};kv.set('carelink_cloud_v66',JSON.stringify(current));__resetCloudCachesForTests();
let release,reached;const ready=new Promise(resolve=>{reached=resolve});holdCommit=()=>new Promise(resolve=>{release=resolve;reached()});
const pending=chief.call('admin/system-config',{method:'POST',token:chiefToken,body:{entryTheme:'heritage'}});await ready;
r=await chief.call('admin/system-config',{method:'POST',token:chiefToken,body:{temporaryPasswordDays:3}});assert.equal(r.status,200);release();r=await pending;assert.equal(r.status,409);assert.equal(stored().db.settings.system.config.temporaryPasswordDays,3);
// The full-state cache may hold old shard credentials/devices. Every read and
// write must overlay the authoritative manifest head, including when its
// revision and shard digests did not change during an auth-only write.
r=await chief.call('admin/staff-accounts/export',{method:'POST',token:chiefToken,body:{password:chiefPassword,confirm:'ISSUE TEMPORARY PASSWORDS',usernames:[caregiver.username]}});
assert.equal(r.status,200);const shardPassword=r.body.rows[0].temporaryPassword;
r=await staff.call('auth/login',{method:'POST',body:{username:caregiver.username,password:shardPassword}});assert.equal(r.body.code,'device_pending');
assert.equal((await chief.call('admin/devices/decision',{method:'POST',token:chiefToken,body:{password:chiefPassword,deviceId:r.body.deviceId,decision:'approved'}})).status,200);
r=await staff.call('auth/login',{method:'POST',body:{username:caregiver.username,password:shardPassword}});assert.equal(r.status,200);const shardToken=r.body.token;
assert.equal((await staff.call('auth/change-password',{method:'POST',token:shardToken,body:{current:shardPassword,password:privatePassword}})).status,200);
const authoritative=stored(),oldSnapshot=structuredClone(authoritative);
oldSnapshot.devices[staffDevice].status='revoked';oldSnapshot.creds[caregiver.username].revokedAt='stale-shard-value';
const part=zlib.gzipSync(Buffer.from(JSON.stringify(oldSnapshot))).toString('base64');
kv.set('entry-security-shard',part);
let manifest={format:'carelink-cloud-gzip-sharded-v1',rev:authoritative.rev,saved:authoritative.saved,shardCount:1,shardKeys:['entry-security-shard'],
  shardDigests:[crypto.createHash('sha256').update(part).digest('hex')],head:{...authoritative,users:authoritative.db.users,system:authoritative.db.settings.system}};
delete manifest.head.db;
kv.set('carelink_cloud_v66',JSON.stringify(manifest));__resetCloudCachesForTests();
for(let repeat=0;repeat<2;repeat++) assert.equal((await staff.call('state',{token:shardToken})).status,200,'cold and warm cached shard reads must use the current head approval/credential');
assert.equal((await staff.call('session/whoami',{token:shardToken})).status,200);
// Revoke only the head, keeping the exact cache key: a cached pack/snapshot may
// never grant access using the stale approval in its underlying shard.
manifest.head.devices[staffDevice].status='revoked';kv.set('carelink_cloud_v66',JSON.stringify(manifest));
for(const route of ['state','state?fast=1','state/collection?name=patients','session/whoami']) assert.equal((await staff.call(route,{token:shardToken})).status,401,'warm head device revocation: '+route);
assert.equal((await staff.call('state',{method:'PUT',token:shardToken,body:{patches:[]}})).status,401);
manifest.head.devices[staffDevice].status='approved';manifest.head.creds[caregiver.username].revokedAt=new Date().toISOString();kv.set('carelink_cloud_v66',JSON.stringify(manifest));
for(const route of ['state','state?fast=1','session/whoami']) assert.equal((await staff.call(route,{token:shardToken})).status,401,'warm head password revocation: '+route);
delete manifest.head.creds[caregiver.username].revokedAt;
manifest.head.creds[caregiver.username].mustChange=true;kv.set('carelink_cloud_v66',JSON.stringify(manifest));
assert.equal((await staff.call('state',{token:shardToken})).body.code,'password_change_required','new head privacy gate cannot be bypassed by older full-state cache');
manifest.head.creds[caregiver.username].mustChange=false;
manifest.head.devicePolicyInstalled=false;kv.set('carelink_cloud_v66',JSON.stringify(manifest));
assert.equal((await staff.call('state',{token:shardToken})).status,401,'a stale shard never installs device policy by itself');
manifest.head.devicePolicyInstalled=true;kv.set('carelink_cloud_v66',JSON.stringify(manifest));
r=await staff.call('state',{method:'PUT',token:shardToken,body:{patches:[{c:'visits',id:'shard-fixture-visit',set:{id:'shard-fixture-visit',patientId:'fixture-patient',countyId:'kisumu',areaId:'ombeyi',date:'2026-11-22',by:caregiver.username,synthetic:true}}]}});
assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.rejected.length,0);
assert.equal(stored().devices[staffDevice].status,'approved','write clone retains head approval, not stale shard data');
assert.equal(stored().creds[caregiver.username].revokedAt,undefined,'write clone retains head credential, not stale shard data');
ok(stored().db.visits.some(v=>v.id==='shard-fixture-visit'),'authorized clinical write survives a stale full-state cache without losing current security metadata');
// Owner-only discovery/approval exposes no HTTP bypass and never selects an
// arbitrary device. The exact pending record must belong to this Chief.
const waiting=await ownerListPendingDevices('chief.admin');
assert.ok(waiting.length>0 && waiting.every(d=>d.id && d.firstSeen && !('proof' in d)));
const preOwner=kv.get('carelink_cloud_v66');
await assert.rejects(ownerRecoverChief({username:'chief.admin',password:chiefPassword,deviceId:staffDevice}),/exact pending Chief device/);
assert.equal(kv.get('carelink_cloud_v66'),preOwner);
const recoveryDevice=waiting[0].id;
await ownerRecoverChief({username:'chief.admin',password:chiefPassword,deviceId:recoveryDevice});
assert.equal(stored().devices[recoveryDevice].status,'approved');assert.equal(stored().devicePolicyInstalled,true);
assert.ok(stored().audit.some(e=>e.action==='device.owner_recovery'&&e.entityId===recoveryDevice));
assert.equal((await chief.call('state',{token:chiefToken})).status,401,'owner recovery also invalidates older Chief sessions');
// Public defaults are read-only and identical for plain, gzip-head and sharded
// stores. A valid shared Chief config (even without a legacy flag) always wins.
const entryBaseline=stored();
const entryCases=[
  {label:'fresh default',settings:{},expected:'clinic'},
  {label:'implicit legacy dark',settings:{uiEpoch:691,landingTheme:'heritage'},expected:'clinic'},
  {label:'explicit dark',settings:{uiEpoch:691,landingTheme:'heritage',landingThemeExplicit:true},expected:'heritage'},
  {label:'explicit pre-691 dark',settings:{landingTheme:'heritage',landingThemeExplicit:true},expected:'heritage'},
  {label:'explicit light',settings:{landingTheme:'clinic',landingThemeExplicit:true},expected:'clinic'},
  {label:'shared dark without legacy flag',settings:{system:{config:{entryTheme:'heritage'}}},expected:'heritage'},
  {label:'shared light overrides stale legacy dark',settings:{landingTheme:'heritage',landingThemeExplicit:true,system:{config:{entryTheme:'clinic'}}},expected:'clinic'},
  {label:'invalid retired choice',settings:{landingTheme:'canopy',landingThemeExplicit:true},expected:'clinic'},
  {label:'invalid config retains valid explicit choice',settings:{landingTheme:'heritage',landingThemeExplicit:true,system:{config:{entryTheme:'canopy'}}},expected:'heritage'}
];
for(const test of entryCases){
  const variant=structuredClone(entryBaseline);variant.db.settings=test.settings;
  const encoded=zlib.gzipSync(Buffer.from(JSON.stringify(variant))).toString('base64');
  const head={...variant,users:variant.db.users,landingTheme:test.settings.landingTheme,
    landingThemeExplicit:test.settings.landingThemeExplicit,uiEpoch:test.settings.uiEpoch,system:test.settings.system};
  delete head.db;
  const envelopes={
    plain:variant,
    gzip:{format:'carelink-cloud-gzip-v1',rev:variant.rev,head,data:encoded},
    sharded:{format:'carelink-cloud-gzip-sharded-v1',rev:variant.rev,head,shardCount:1,
      shardKeys:['entry-theme-fixture'],shardDigests:[crypto.createHash('sha256').update(encoded).digest('hex')]}
  };
  for(const [carrier,envelope] of Object.entries(envelopes)){
    kv.set('entry-theme-fixture',encoded);kv.set('carelink_cloud_v66',JSON.stringify(envelope));__resetCloudCachesForTests();
    const snapshot=JSON.stringify([...kv]);
    for(const route of ['health','bootstrap']){
      const probe=await stranger.call(route);assert.equal(probe.status,200);
      assert.equal(probe.body.landingTheme,test.expected,carrier+': '+test.label+' ('+route+')');
    }
    assert.equal(JSON.stringify([...kv]),snapshot,'public default resolution must not migrate/write the '+carrier+' store');
  }
}
ok(true,'27 storage/default/config combinations preserve explicit Chief choices without writing the installation');
console.log(`entry-security: ${checks} boundary assertions plus device/expiry/replay/revocation/CAS, cold/warm shard overlays and exact owner-device recovery cases passed`);
