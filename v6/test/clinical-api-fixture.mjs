/* Shared isolated clinical API fixture. No real network / provider credentials.
   Confirmed seats keep roster usernames with synthetic identities. Reserved
   .localtest principals cover currently unconfirmed roles without activating
   those real roster seats or claiming any work mailbox. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {dispatchWithDeviceCookie} from './device-cookies.cjs';
import {isSnapshotRead,conditionalPrimaryRead} from './kv-primary-read.cjs';
import R from '../src/care_rules.js';
export async function clinicalFixture(){
 const kv=new Map(),jar={cookie:''};let failWrite=false,beforeCommit=null;
 const reply=(result,status=200)=>({ok:status>=200&&status<300,status,json:async()=>({result})});
 globalThis.fetch=async(input,init={})=>{
  const url=new URL(String(input));assert.equal(url.origin,'https://clinical-fixture.test','synthetic tests must not contact a provider');
  if(url.pathname.startsWith('/set/')){
   if(failWrite)return {ok:false,status:503,json:async()=>({error:'Synthetic write outage'})};
   const value=JSON.parse(init.body);assert.equal(typeof value,'string');kv.set(decodeURIComponent(url.pathname.slice(5)),value);return reply('OK');
  }
  const [op,...a]=JSON.parse(init.body||'[]');
  if(op==='SET'){
   if(failWrite)return {ok:false,status:503,json:async()=>({error:'Synthetic write outage'})};
   if(a.includes('NX')&&kv.has(a[0]))return reply(null);kv.set(a[0],String(a[1]));return reply('OK');
  }
  if(op==='GET')return reply(kv.get(a[0])??null);
  assert.equal(op,'EVAL');const [script,count,key,...args]=a;assert.equal(Number(count),1);
  if(isSnapshotRead(script))return reply(conditionalPrimaryRead(kv,key,args[0]));
  if(script==="return redis.call('GET', KEYS[1])")return reply(kv.get(key)??null);
  if(failWrite)return {ok:false,status:503,json:async()=>({error:'Synthetic write outage'})};
  if(script.includes('redis.sha1hex')){
   if(beforeCommit){const change=beforeCommit;beforeCommit=null;change();}
   const old=kv.get(key),digest=old==null?'missing':crypto.createHash('sha1').update(old).digest('hex');
   if(digest!==args[0])return reply(old===args[1]?2:0);kv.set(key,args[1]);return reply(1);
  }
  if(kv.get(key)!==String(args[0]))return reply(0);if(script.includes('DEL'))kv.delete(key);return reply(1);
 };
 for(const key of Object.keys(process.env))if(/^(CARELINK_|KV_|REDIS_|UPSTASH_|STORAGE_)/.test(key))delete process.env[key];
 process.env.KV_REST_API_URL='https://clinical-fixture.test';process.env.KV_REST_API_TOKEN='synthetic-clinical-test-only';
 const {default:handler,__resetCloudCachesForTests}=await import('../../api/index.js');__resetCloudCachesForTests();
 const call=async(route,{method='GET',body={},token='',headers={},deviceJar=jar}={})=>{
  let status=0,raw='';const responseHeaders={};
  const req={url:'/api/'+route,method,headers:{host:'clinical.test',...(token?{'x-carelink-session':token}:{}),...headers},body,on(){}};
  const res={set statusCode(v){status=v},get statusCode(){return status},setHeader(k,v){responseHeaders[k.toLowerCase()]=v},end(v){raw=v||''}};
  await dispatchWithDeviceCookie(handler,req,res,deviceJar);return {status,body:raw?JSON.parse(raw):{},headers:responseHeaders};
 };
 const today=R.programDate(new Date().toISOString());
 const p=(id,days=130)=>({id,code:'SYNTHETIC-'+id,name:'Synthetic clinical case '+id,nationalId:'SYNTHETIC-ID-'+id,countyId:'kisumu',areaId:'nairobird',caregiverId:'fx-caregiver',
  status:'active',intake:R.addDays(today,-days),clinical:{diagnosis:'Synthetic prior documented diagnosis',chiefComplaints:'Synthetic prior complaint for two weeks'},demo:true});
 const db={meta:{schema:6,label:'Isolated clinical test fixture',synthetic:true},settings:{programme:{maxDays:180},onboarding:{complete:true}},users:[],roles:[],audit:[],
  patients:[p('long'),p('short',40),{...p('return',250),status:'discharged',discharge:R.addDays(today,-100),dischargedAt:R.addDays(today,-100),notes:'Synthetic previous summary'},
   {...p('fresh',2),status:'approved_enrolment'}, {...p('homa'),countyId:'homabay',areaId:'makongeni'}, {...p('other'),countyId:'other',areaId:'elsewhere'},
   {...p('otherarea'),areaId:'manyatta'}],
  visits:[{id:'fx-old-visit',patientId:'return',date:R.addDays(today,-110),notes:'Synthetic caregiver history'}],pdcas:[],careReviews:[],careCycles:[],careReviewRevisions:[],careReferrals:[],careEvidence:[],programAdmissions:[],intlPdcaDossiers:[],
  documents:[],support:[],requests:[],calendarEvents:[],notifications:[],transactions:[{id:'fx-private-accounting',patientId:'long',countyId:'kisumu',amount:1,note:'Synthetic accounting note'}],
  hardcopyBatches:[{id:'fx-hidden-packet',patientId:'homa',patientName:'Synthetic hidden source packet',countyId:'homabay'}]};
 const chiefPw='Synthetic#Chief2029!Xy';let r=await call('setup',{method:'POST',body:{admin:{username:'chief.admin',name:'Synthetic fixture Chief',password:chiefPw},db}});assert.equal(r.status,200,JSON.stringify(r.body));
 r=await call('auth/login',{method:'POST',body:{username:'chief.admin',password:chiefPw}});assert.equal(r.status,200,JSON.stringify(r.body));const chief=r.body.token;
 r=await call('auth/change-password',{method:'POST',token:chief,body:{current:chiefPw,password:'Synthetic#ChiefPrivate2030!'}});assert.equal(r.status,200,JSON.stringify(r.body));
 const accounts=[['caregiver.nairobird','caregiver','kisumu',['nairobird'],'fx-caregiver'],['coord.nairobird','coordinator','kisumu',['nairobird'],'fx-coordinator'],
  ['mcm.kisumu','mcm','kisumu',[],'fx-mcm'],['synthetic-homa-mcm.localtest','mcm','homabay',[],'fx-homa-mcm'],['synthetic-intl.localtest','intl.medical','kisumu',[],'fx-intl'],
  ['kisumu.admin','countyadmin','kisumu',[],'fx-admin'],['synthetic-finance.localtest','finance','kisumu',[],'fx-finance']].map(([username,roleId,countyId,areaIds,id])=>({id,username,roleId,countyId,areaIds,name:'Synthetic fixture '+roleId,status:'active',active:true,unconfirmed:false}));
 r=await call('setup/activate-global',{method:'POST',token:chief,body:{users:accounts,accounts:accounts.map(a=>({...a,password:'Synthetic#Temporary2029!'}))}});assert.equal(r.status,200,JSON.stringify(r.body));
 const issued=new Map(r.body.issued.map(a=>[a.username,a.password])),tokens={chief},passwords={chief:'Synthetic#ChiefPrivate2030!'};
 for(const a of accounts){
  const pw=issued.get(a.username);assert.ok(pw,'test account must have an issued temporary credential');
  let login=await call('auth/login',{method:'POST',body:{username:a.username,password:pw}});assert.equal(login.status,200,JSON.stringify(login.body));
  const next='Synthetic#Private2031!'+a.roleId;
  const changed=await call('auth/change-password',{method:'POST',token:login.body.token,body:{current:pw,password:next}});assert.equal(changed.status,200,JSON.stringify(changed.body));
  tokens[a.username]=login.body.token;passwords[a.username]=next;
 }
 const state=()=>{const doc=JSON.parse(kv.get('carelink_cloud_v66'));return doc.format==='carelink-cloud-gzip-v1'?JSON.parse(zlib.gunzipSync(Buffer.from(doc.data,'base64'))):doc;};
 const change=fn=>{const s=state();fn(s);kv.set('carelink_cloud_v66',JSON.stringify(s));__resetCloudCachesForTests();};
 let request=0;
 const command=(username,name,payload,requestId)=>call('care/command',{method:'POST',token:tokens[username],body:{command:name,payload,requestId:requestId||'synthetic-command-'+(++request)}});
 const fields=R.cleanFields(Object.fromEntries(R.FIELDS.map(([key,label,type])=>[key,type==='date'?R.addDays(today,30):type==='number'?'1':'Synthetic observed '+label])));
 const plan={needs:'Synthetic need',objectives:'Synthetic measurable objective',interventions:'Synthetic planned support',expectedDays:60,rationale:'Synthetic office rationale',officeConfirmed:true};
 return {call,command,handler,kv,jar,tokens,passwords,accounts,today,db,fields,plan,state,change,
  setWriteFailure(value){failWrite=value;},onCommit(fn){beforeCommit=fn;}};
}
