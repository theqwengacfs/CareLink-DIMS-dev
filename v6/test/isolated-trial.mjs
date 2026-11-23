import {isSnapshotRead} from './kv-primary-read.cjs';
import {dispatchWithDeviceCookie} from './device-cookies.cjs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// No network or production KV: all commands are intercepted by this fixture.
const kv = new Map();
const answer=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});
globalThis.fetch=async(input,init={})=>{
  const url=new URL(String(input));
  assert.equal(url.origin,'https://trial-store.test','trial must not fall back to the normal KV variables');
  assert.equal(init.headers?.Authorization,'Bearer isolated-fixture-token');
  if(url.pathname.startsWith('/del/')) {kv.delete(decodeURIComponent(url.pathname.slice(5)));return answer({result:1});}
  const [op,...a]=JSON.parse(init.body);
  if(op==='EXISTS') return answer({result:kv.has(a[0])?1:0});
  if(op==='GET') return answer({result:kv.get(a[0])??null});
  if(op==='SET') {if(a.includes('NX')&&kv.has(a[0])) return answer({result:null});kv.set(a[0],String(a[1]));return answer({result:'OK'});}
  if(op==='EVAL'){
    const [script,count,key,...args]=a;assert.equal(Number(count),1);
    if(isSnapshotRead(script)){
      assert.equal(key,'carelink_trial_cloud_v1');
      const value=kv.get(key);
      if(value==null)return answer({result:['missing',null]});
      const digest=crypto.createHash('sha1').update(value).digest('hex');
      return answer({result:[digest,digest===args[0]?null:value]});
    }
    if(script==="return redis.call('GET', KEYS[1])")return answer({result:kv.get(key)??null});
    if(script.includes('redis.sha1hex')){
      const old=kv.get(key),digest=old===undefined?'missing':crypto.createHash('sha1').update(old).digest('hex');
      if(digest!==args[0])return answer({result:old===args[1]?2:0});
      kv.set(key,args[1]);return answer({result:1});
    }
    if(kv.get(key)!==String(args[0]))return answer({result:0});
    if(script.includes('DEL')){kv.delete(key);return answer({result:1});}
    if(script.includes('EXPIRE'))return answer({result:1});
  }
  throw Error('Unexpected mock KV command '+op);
};
process.env.CARELINK_TRIAL_MODE='isolated-v1';
process.env.CARELINK_TRIAL_HOST='trial.example.test';
process.env.CARELINK_TRIAL_SETUP_SECRET='fixture-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';
process.env.CARELINK_TRIAL_KV_REST_API_URL='https://trial-store.test';
process.env.CARELINK_TRIAL_KV_REST_API_TOKEN='isolated-fixture-token';
process.env.KV_REST_API_URL='https://production-never.test';
process.env.KV_REST_API_TOKEN='production-fixture-token';
process.env.CARELINK_TRIAL_MODE='typo';
const {default:invalidHandler}=await import('../../api/index.js?invalid-trial-config');
let invalidStatus=0,invalidBody='';
await invalidHandler({url:'/api/health',method:'GET',headers:{host:'trial.example.test'}},{set statusCode(v){invalidStatus=v},get statusCode(){return invalidStatus},setHeader(){},end(v){invalidBody=v}});
assert.equal(invalidStatus,503);assert.equal(JSON.parse(invalidBody).code,'trial_mode_invalid');assert.equal(kv.size,0);
process.env.CARELINK_TRIAL_MODE='isolated-v1';
const {default:handler,__resetCloudCachesForTests}=await import('../../api/index.js');
function browser(host='trial.example.test'){
  const jar={cookie:''};
  return {jar,async call(route,{method='GET',body={},token='',headers={}}={}){
    const req={url:'/api/'+route,method,headers:{host,...(token?{'x-carelink-session':token}:{}),...headers},body,on(){}};
    let status=0,raw='';const responseHeaders={};
    const res={set statusCode(v){status=v},get statusCode(){return status},setHeader(k,v){responseHeaders[k.toLowerCase()]=v},end(v){raw=v||''}};
    await dispatchWithDeviceCookie(handler,req,res,jar);
    return {status,body:raw?JSON.parse(raw):{},headers:responseHeaders};
  }};
}
const initHeaders={'x-carelink-trial-setup-secret':process.env.CARELINK_TRIAL_SETUP_SECRET};
const chief=browser(),staff=browser(),stranger=browser();
let r=await browser('care-link-dims-dev-three.vercel.app').call('health');
assert.equal(r.body.code,'trial_host_invalid');
process.env.CARELINK_TRIAL_HOST='care-link-dims-dev-three.vercel.app';
r=await browser('care-link-dims-dev-three.vercel.app').call('health');assert.equal(r.body.code,'trial_host_invalid','even an explicitly configured official host is forbidden');
process.env.CARELINK_TRIAL_HOST='trial.example.test';
const token=process.env.CARELINK_TRIAL_KV_REST_API_TOKEN;
delete process.env.CARELINK_TRIAL_KV_REST_API_TOKEN;
r=await chief.call('health');assert.equal(r.body.code,'kv_required','normal KV configuration is not a trial fallback');
process.env.CARELINK_TRIAL_KV_REST_API_TOKEN=token;
const secret=process.env.CARELINK_TRIAL_SETUP_SECRET;process.env.CARELINK_TRIAL_SETUP_SECRET='short';
r=await chief.call('health');assert.equal(r.body.code,'trial_setup_secret_required');process.env.CARELINK_TRIAL_SETUP_SECRET=secret;
kv.set('carelink_cloud_v66','protected live fixture');
r=await chief.call('trial/initialize',{method:'POST',headers:initHeaders});
assert.equal(r.body.code,'trial_live_store_detected');
assert.equal(kv.get('carelink_cloud_v66'),'protected live fixture');assert.equal(kv.size,1);
kv.delete('carelink_cloud_v66');
assert.equal((await chief.call('trial/initialize',{method:'POST'})).body.code,'trial_setup_denied');
assert.equal((await chief.call('setup',{method:'POST'})).body.code,'trial_setup_locked');
assert.equal((await chief.call('setup/reset-first-run',{method:'POST'})).body.code,'trial_setup_locked');
assert.equal((await chief.call('setup/activate-global',{method:'POST'})).body.code,'trial_setup_locked');
r=await chief.call('health');assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.trialMode,true);assert.equal(r.body.setup,false);
console.log('Trial isolation, host and unauthorized setup checks passed; generating full synthetic reference...');
r=await chief.call('trial/initialize',{method:'POST',headers:initHeaders});
assert.equal(r.status,200,JSON.stringify(r.body));
assert.equal(r.body.counts.patients,4000);assert.equal(r.body.quality.passed,true);assert.ok(r.body.issued.length>=20);
assert.equal(r.body.issued.filter(u=>u.roleId==='chief').length,1);
assert.ok(!kv.has('carelink_cloud_v66'));assert.ok(kv.has('carelink_trial_cloud_v1'));
const issued=r.body.issued, admin=issued.find(u=>u.roleId==='chief');
const account=issued.find(u=>u.roleId==='mcm'&&u.countyId==='kisumu');assert.ok(account);
const snapshot=kv.get('carelink_trial_cloud_v1');
assert.equal((await chief.call('trial/initialize',{method:'POST',headers:initHeaders})).body.code,'trial_already_initialized');
assert.equal(kv.get('carelink_trial_cloud_v1'),snapshot,'initialization never replaces an existing trial');
__resetCloudCachesForTests();
r=await chief.call('auth/login',{method:'POST',body:{username:admin.username,password:admin.password}});assert.equal(r.status,200,JSON.stringify(r.body));const chiefToken=r.body.token;
assert.equal((await stranger.call('state',{token:chiefToken})).status,401,'session stays bound to its approved browser');
r=await chief.call('admin/staff-accounts',{token:chiefToken});assert.equal(r.status,200);
assert.ok(r.body.rows.every(row=>/^Synthetic (Staff|trial seat)/.test(row.name)), 'trial credential console never exposes real roster names');
assert.ok(r.body.rows.some(row=>row.username==='mcm.homabay' && !row.unconfirmed),'synthetic placeholder seats do not imply a real appointment');
r=await chief.call('admin/staff-accounts/mailbox',{method:'POST',token:chiefToken,body:{password:admin.password}});assert.equal(r.body.code,'trial_mailbox_disabled');
r=await chief.call('admin/staff-accounts/export',{method:'POST',token:chiefToken,body:{password:admin.password,confirm:'ISSUE TEMPORARY PASSWORDS',usernames:['nurse.homabay']}});
assert.equal(r.status,200,JSON.stringify(r.body));assert.match(r.body.rows[0].name,/^Synthetic trial seat/);assert.ok(r.body.rows[0].temporaryPassword);
r=await chief.call('state/collection?name=users',{token:chiefToken});assert.equal(r.status,200);
assert.ok(r.body.records.find(u=>u.username==='nurse.homabay').synthetic,'reissuing does not mark trial staff as real');
r=await staff.call('auth/login',{method:'POST',body:{username:account.username,password:account.password,loginAttemptId:'trial-fixture-attempt'}});assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.mustChange,true);const staffToken=r.body.token;
assert.equal((await staff.call('state',{token:staffToken})).body.code,'password_change_required');
r=await staff.call('auth/change-password',{method:'POST',token:staffToken,body:{current:account.password,password:'Trial#Private2028!'}});assert.equal(r.status,200,JSON.stringify(r.body));
r=await staff.call('state/collection?name=patients&limit=1',{token:staffToken});assert.equal(r.status,200,JSON.stringify(r.body));
assert.equal(r.body.total,4000,'lead Kisumu MCM has its established two-county scope');
const homaAccount=issued.find(u=>u.roleId==='caregiver'&&u.countyId==='homabay');assert.ok(homaAccount);
const other=browser();
r=await other.call('auth/login',{method:'POST',body:{username:homaAccount.username,password:homaAccount.password,loginAttemptId:'trial-second-attempt'}});assert.equal(r.status,200);const otherToken=r.body.token;
r=await other.call('auth/change-password',{method:'POST',token:otherToken,body:{current:homaAccount.password,password:'Trial#Second2028!'}});assert.equal(r.status,200);
r=await other.call('state/collection?name=patients&limit=1',{token:otherToken});assert.equal(r.status,200);assert.ok(r.body.total>0&&r.body.total<4000,'caregiver must not read outside the assigned area');
const patient=r.body.records[0];assert.equal(patient.countyId,'homabay');
r=await other.call('state',{method:'PUT',token:otherToken,body:{patches:[{c:'patients',id:patient.id,set:{trialNote:'Synthetic shared-edit test'},before:{trialNote:patient.trialNote}}]}});
assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.rejected.length,0,JSON.stringify(r.body.rejected));
r=await staff.call('state/collection?name=patients',{token:staffToken});assert.equal(r.status,200);
assert.equal(r.body.records.find(p=>p.id===patient.id)?.trialNote,'Synthetic shared-edit test','second account sees the shared saved update');
assert.ok([...kv.keys()].every(key=>key.startsWith('carelink_trial_')),'all writes stay in the trial namespace');
console.log('Trial: 4,000 synthetic patients, scoped role accounts, shared edits, single-use setup, cookie-bound sessions and automatic browser enrolment passed.');
