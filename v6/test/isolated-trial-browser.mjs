/* Optional real-browser trial proof. All API/KV traffic is local and synthetic. */
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
import {isSnapshotRead} from './kv-primary-read.cjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const kv=new Map();
const answer=(result,status=200)=>({ok:status>=200&&status<300,status,json:async()=>({result})});
globalThis.fetch=async(input,init={})=>{
  const url=new URL(String(input));assert.equal(url.origin,'https://trial-browser-store.test');
  if(url.pathname.startsWith('/del/')){kv.delete(decodeURIComponent(url.pathname.slice(5)));return answer(1);}
  const [op,...a]=JSON.parse(init.body);
  if(op==='EXISTS')return answer(kv.has(a[0])?1:0);
  if(op==='GET')return answer(kv.get(a[0])??null);
  if(op==='SET'){if(a.includes('NX')&&kv.has(a[0]))return answer(null);kv.set(a[0],String(a[1]));return answer('OK');}
  if(op==='EVAL'){
    const [script,count,key,...args]=a;assert.equal(Number(count),1);
    if(isSnapshotRead(script)){
      assert.equal(key,'carelink_trial_cloud_v1');const value=kv.get(key);
      if(value==null)return answer(['missing',null]);
      const digest=crypto.createHash('sha1').update(value).digest('hex');return answer([digest,digest===args[0]?null:value]);
    }
    if(script==="return redis.call('GET', KEYS[1])")return answer(kv.get(key)??null);
    if(script.includes('redis.sha1hex')){const old=kv.get(key),digest=old===undefined?'missing':crypto.createHash('sha1').update(old).digest('hex');if(digest!==args[0])return answer(old===args[1]?2:0);kv.set(key,args[1]);return answer(1);}
    if(kv.get(key)!==String(args[0]))return answer(0);
    if(script.includes('DEL'))kv.delete(key);return answer(1);
  }
  throw Error('Unexpected mock KV command '+op);
};
for(const key of Object.keys(process.env))if(/^(?:CARELINK_|KV_|REDIS_|UPSTASH_|STORAGE_)/.test(key))delete process.env[key];
process.env.CARELINK_TRIAL_MODE='isolated-v1';process.env.CARELINK_TRIAL_SETUP_SECRET='fixture-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';
process.env.CARELINK_TRIAL_KV_REST_API_URL='https://trial-browser-store.test';process.env.CARELINK_TRIAL_KV_REST_API_TOKEN='isolated-browser-token';
let handler;
const server=http.createServer(async(req,res)=>{
  try{
    if(req.url.startsWith('/api/')){const parts=[];for await(const p of req)parts.push(p);req.body=parts.length?JSON.parse(Buffer.concat(parts).toString('utf8')):{};await handler(req,res);return;}
    const pathname=new URL(req.url,'http://test').pathname;
    let target=pathname==='/'?'index.html':pathname.replace(/^\//,'');
    if(target==='carelink-v6.html')target='public/carelink-v6.html';
    if(!fs.existsSync(path.join(root,target)))target='public/'+target;
    const file=path.resolve(root,target);
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
    res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':file.endsWith('.png')?'image/png':'application/json');res.end(fs.readFileSync(file));
  }catch(e){res.writeHead(500);res.end('Fixture server error');console.error(e);}
});
let browser;
try{
  await new Promise(resolve=>server.listen(0,'0.0.0.0',resolve));
  const base='http://localhost:'+server.address().port;
  process.env.CARELINK_TRIAL_HOST='localhost:'+server.address().port;
  ({default:handler}=await import('../../api/index.js'));
  const binary=process.env.CHROMIUM_PATH?null:(await import('@sparticuz/chromium')).default;
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||await binary.executablePath(),args:['--no-sandbox']});
  const chief=await browser.newContext({viewport:{width:1366,height:900}}),staff=await browser.newContext({viewport:{width:390,height:844}});
  const response=await chief.request.post(base+'/api/trial/initialize',{headers:{'x-carelink-trial-setup-secret':process.env.CARELINK_TRIAL_SETUP_SECRET},timeout:120000});
  assert.equal(response.status(),200,await response.text());const pack=await response.json();assert.equal(pack.counts.patients,4000);
  const admin=pack.issued.find(u=>u.roleId==='chief'),account=pack.issued.find(u=>u.username==='caregiver.makongeni');assert.ok(admin&&account);
  const errors=[];const page=await chief.newPage();page.on('pageerror',e=>errors.push(e.message));
  const tablet=await staff.newPage(),failures=[];tablet.on('pageerror',e=>errors.push(e.message));
  tablet.on('response',r=>{if(r.url().includes('/api/')&&r.status()>=400)failures.push({path:new URL(r.url()).pathname,status:r.status()});});
  async function openLogin(p){
    await p.goto(base+'/carelink-v6.html');await p.waitForFunction(()=>APPX.host?.trialMode===true,null,{timeout:30000});
    assert.ok((await p.locator('body').innerText()).includes('TEAM TRIAL · SYNTHETIC DATA ONLY'));
    await p.locator('[data-act="goto-login"]').first().click();
    assert.equal(await p.locator('[name="deviceLabel"]').count(),0);assert.equal(await p.locator('[name="deviceType"]').count(),0);
  }
  async function login(p,u,pw){const form=p.locator('form[data-form="login6"]');await form.locator('[name="username"]').fill(u);await form.locator('[name="password"]').fill(pw);await form.locator('[type="submit"]').click();}
  await openLogin(page);await login(page,admin.username,admin.password);
  await page.waitForFunction(()=>AUTH.user?.roleId==='chief'&&APPX.screen==='app',null,{timeout:90000});
  assert.ok((await page.locator('body').innerText()).includes('TEAM TRIAL · SYNTHETIC DATA ONLY'));
  const chiefToken=await page.evaluate(()=>SYNC.sessionToken);
  await openLogin(tablet);await login(tablet,account.username,account.password);
  await tablet.waitForFunction(()=>LOGIN6.error.includes('awaiting Chief'),null,{timeout:90000});
  assert.equal(await tablet.evaluate(()=>Boolean(AUTH.user||SYNC.sessionToken)),false);
  const list=await chief.request.get(base+'/api/admin/devices',{headers:{'X-CareLink-Session':chiefToken}});assert.equal(list.status(),200);
  const pending=(await list.json()).devices.find(d=>d.requestedBy===account.username&&d.status==='pending');assert.ok(pending);
  const approved=await chief.request.post(base+'/api/admin/devices/decision',{headers:{'X-CareLink-Session':chiefToken},data:{password:admin.password,deviceId:pending.id,decision:'approved'},timeout:90000});assert.equal(approved.status(),200,await approved.text());
  await login(tablet,account.username,account.password);await tablet.waitForSelector('form[data-form="mustchange6"]',{timeout:90000});
  const change=tablet.locator('form[data-form="mustchange6"]');await change.locator('[name="current"]').fill(account.password);await change.locator('[name="password"]').fill('River#Private2030!Xy');await change.locator('[name="password2"]').fill('River#Private2030!Xy');await change.locator('[type="submit"]').click();
  try { await tablet.waitForFunction(()=>AUTH.user&&APPX.screen==='app'&&!AUTH.mustChange&&!LOGIN6.mustChangeBusy,null,{timeout:90000}); }
  catch (error) {
    console.error('Trial browser state:',JSON.stringify(await tablet.evaluate(()=>({error:LOGIN6.error,notice:LOGIN6.notice,screen:APPX.screen,user:Boolean(AUTH.user),mustChange:AUTH.mustChange,busy:LOGIN6.mustChangeBusy,sync:SYNC.message,token:Boolean(SYNC.sessionToken),body:document.body.innerText.slice(0,900)}))),'HTTP errors:',JSON.stringify(failures));
    throw error;
  }
  const result=await tablet.evaluate(()=>({count:DB.db.patients.length,scoped:DB.db.patients.every(p=>p.countyId==='homabay'&&p.areaId==='makongeni'),trial:APPX.host?.trialMode}));
  assert.ok(result.count>0&&result.scoped&&result.trial,JSON.stringify(result));assert.ok((await tablet.locator('body').innerText()).includes('TEAM TRIAL · SYNTHETIC DATA ONLY'));
  assert.deepEqual(errors,[]);console.log('Actual Chromium trial: isolated initialization, clear synthetic labels, no device fields, device approval, private password replacement and scoped shared workspace passed.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
