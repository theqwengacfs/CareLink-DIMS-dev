/* Optional real-Chromium end-to-end clinical UI + print regression.
   npm install --no-save --package-lock=false playwright-core @sparticuz/chromium
   All API/KV data and identities are synthetic and isolated. No production IO. */
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
import {clinicalFixture} from './clinical-api-fixture.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),f=await clinicalFixture();
f.change(s=>{s.db.meta.synthetic=false;s.db.meta.label='Isolated hosted clinical browser fixture';});
const errors=[],evidence=[];let browser;
const server=http.createServer(async(req,res)=>{
 try{
  if(req.url.startsWith('/api/')){const chunks=[];for await(const chunk of req)chunks.push(chunk);req.body=chunks.length?JSON.parse(Buffer.concat(chunks).toString('utf8')):{};await f.handler(req,res);return;}
  const pathname=new URL(req.url,'http://fixture').pathname;
  const file=path.resolve(root,'public',pathname==='/'?'carelink-v6.html':pathname.slice(1));
  if(!file.startsWith(root+'/public/')||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':file.endsWith('.png')?'image/png':'application/json');res.end(fs.readFileSync(file));
 }catch(error){res.writeHead(500);res.end('Synthetic fixture error: '+error.message);}
});
const dir=process.env.CLINICAL_SCREENSHOT_DIR||'/tmp/carelink-clinical-browser';fs.mkdirSync(dir,{recursive:true});
try{
 await new Promise(resolve=>server.listen(0,'0.0.0.0',resolve));const base='http://127.0.0.1:'+server.address().port;
 const binary=process.env.CHROMIUM_PATH?null:(await import('@sparticuz/chromium')).default;
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||await binary.executablePath(),args:['--no-sandbox']});
 async function session(username){
  // Fixture commissioning exercised each credential once; end that existing
  // session before UI sign-in rather than bypassing one-session security.
  assert.equal((await f.call('auth/logout',{method:'POST',token:f.tokens[username]})).status,200);
  const context=await browser.newContext({viewport:{width:1366,height:900},timezoneId:'Africa/Nairobi',acceptDownloads:true,serviceWorkers:'block'});
  const cookie=f.jar.cookie,index=cookie.indexOf('=');await context.addCookies([{name:cookie.slice(0,index),value:cookie.slice(index+1),url:base,httpOnly:true,sameSite:'Lax'}]);
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);await page.goto(base+'/carelink-v6.html');
  await page.locator('[data-act="goto-login"]').first().click();const form=page.locator('form[data-form="login6"]');
  await form.locator('[name="username"]').fill(username);await form.locator('[name="password"]').fill(f.passwords[username]);
  await form.locator('[type="submit"]').click();
  try{await page.waitForFunction(()=>AUTH.user&&APPX.screen==='app');}catch(error){
   await page.screenshot({path:path.join(dir,'synthetic-login-failure.png')});
   console.error('Synthetic login diagnostic',await page.evaluate(()=>({text:document.body.innerText.slice(-2400),screen:APPX.screen,role:AUTH.user?.roleId,syncState:SYNC.state,message:SYNC.message})),errors);throw error;
  }
  const settingsPatches=await page.evaluate(()=>{SYNC.stopPolling();SESSION.stop?.();renderAIDock();return SYNC.patches().filter(p=>p.c==='settings');});
  assert.deepEqual(settingsPatches,[],'rendering a scoped console / AI dock cannot dirty Chief-owned settings');return page;
 }
 const cg=await session('caregiver.nairobird'),mcm=await session('mcm.kisumu');
 async function refresh(page){await page.evaluate(async()=>{if(APPX.dirty)await SYNC.push();await SYNC.pullFull();});}
 async function open(page,id){await refresh(page);await page.evaluate(id=>{closeAllModals();CARE_REVIEW.openReport(id);},id);await page.locator('.care-template').waitFor();}
 async function step(page,id,command,fields={}){
  await page.locator(`[data-act="care-review-step"][data-command="${command}"]`).click();
  const form=page.locator('#careStepForm');for(const [key,value] of Object.entries(fields)){const input=form.locator(`[name="${key}"]`);if(typeof value==='boolean')await input.setChecked(value);else await input.fill(value);}
  const response=page.waitForResponse(r=>r.url().endsWith('/api/care/command')&&r.request().method()==='POST');await page.locator('[data-act="care-review-step-save"]').click();const r=await response;assert.equal(r.status(),200,await r.text());await page.locator('#careStepForm').waitFor({state:'detached'});
 }
 async function newReview(patientId,dueDay){
  await cg.evaluate(({patientId,dueDay})=>{closeAllModals();ACTIONS['care-review-new']({patient:patientId,day:String(dueDay)});},{patientId,dueDay});await cg.locator('#careEditorForm').waitFor();
  for(const [key,value] of Object.entries(f.fields))await cg.locator(`#careEditorForm [name="${key}"]`).fill(value);
  const response=cg.waitForResponse(r=>r.url().endsWith('/api/care/command')&&r.request().method()==='POST');await cg.locator('[data-act="care-review-save"]').click();let r;
  try{r=await response;}catch(error){console.error('Synthetic command preflight diagnostic',await cg.evaluate(()=>({text:document.body.innerText.slice(-1700),patches:JSON.stringify(SYNC.patches().map(p=>p.c==='settings'?{c:p.c,set:Object.fromEntries(Object.entries(p.set.value).filter(([k,v])=>JSON.stringify(v)!==JSON.stringify(JSON.parse(SYNC._shadow.__settings.settings)[k])))}:p)),dirty:APPX.dirty,busy:SYNC._clinicalBusy,pulling:SYNC._pulling,ticking:SYNC._ticking,message:SYNC.message})));throw error;}
  assert.equal(r.status(),200,await r.text());const body=await r.json();await cg.locator('#careEditorForm').waitFor({state:'detached'});return body.rec.id;
 }
 // Test actual editor geometry before filling. Field tabbing and modal scrolling
 // must reach the final inputs and save button even with a keyboard-short screen.
 await cg.evaluate(()=>ACTIONS['care-review-new']({patient:'short',day:'30'}));
 for(const [width,height,label] of [[1366,900,'desktop'],[390,844,'mobile'],[390,420,'keyboard-short'],[720,500,'zoom-like']]){
  await cg.setViewportSize({width,height});await cg.locator('#careEditorForm [name="estimatedDischargeDate"]').scrollIntoViewIfNeeded();await cg.locator('#careEditorForm [name="estimatedDischargeDate"]').focus();
  await cg.keyboard.press('Tab');await cg.locator('[data-act="care-review-save"]').scrollIntoViewIfNeeded();
  const metrics=await cg.evaluate(()=>{const m=document.querySelector('.modal'),b=document.querySelector('.modal-b'),button=document.querySelector('[data-act="care-review-save"]');const r=button.getBoundingClientRect();const mr=m.getBoundingClientRect();return {width:innerWidth,scroll:document.documentElement.scrollWidth,modal:m.scrollWidth,client:m.clientWidth,modalLeft:mr.left,modalRight:mr.right,bodyScroll:b.scrollHeight,bodyClient:b.clientHeight,buttonTop:r.top,buttonBottom:r.bottom,height:innerHeight};});
  // The modal must fit and remain independently scrollable; the underlying
  // pre-existing dashboard may retain its own horizontal table scroll.
  assert.ok(metrics.modalLeft>=-1&&metrics.modalRight<=width+1,JSON.stringify(metrics));assert.ok(metrics.modal<=metrics.client+2,JSON.stringify(metrics));assert.ok(metrics.buttonTop>=0&&metrics.buttonBottom<=height+1,JSON.stringify(metrics));
  await cg.screenshot({path:path.join(dir,`editor-${label}.png`)});evidence.push({viewport:label,...metrics});
 }
 await cg.setViewportSize({width:1366,height:900});await cg.evaluate(()=>closeAllModals());
 // Repeat assessment is an actual form and county-MCM office workflow, not
 // a second field enrollment or a different patient identity.
 const patientCount=f.state().db.patients.length;
 await cg.evaluate(()=>ACTIONS['care-assess-return']({id:'return'}));await cg.locator('#careReturnForm').waitFor();
 assert.ok((await cg.locator('.modal').innerText()).includes('Synthetic previous summary'));
 await cg.locator('.modal summary').filter({hasText:'Caregiver-recorded care / clinical notes'}).click();
 assert.ok((await cg.locator('.modal').innerText()).includes('Synthetic caregiver history'));
 await cg.locator('#careReturnForm [name="identityConfirmed"]').check();
 for(const [key,value] of Object.entries({newComplaints:'Synthetic new complaint for three days',comparison:'Synthetic comparison against prior caregiver notes and PDCA history',newDiagnosis:'Synthetic newly documented diagnosis',sourceDate:f.today,facility:'Synthetic new medical facility',reference:'SYNTHETIC-BROWSER-NEW-MEDICAL-SOURCE'}))await cg.locator(`#careReturnForm [name="${key}"]`).fill(value);
 let assessmentReply=cg.waitForResponse(r=>r.url().endsWith('/api/care/command')&&r.request().method()==='POST');await cg.locator('[data-act="care-return-save"]').click();let response=await assessmentReply;assert.equal(response.status(),200,await response.text());
 const referral=(await response.json()).rec;await cg.locator('#careReturnForm').waitFor({state:'detached'});
 assert.equal(referral.kind,'repeat');assert.equal(referral.status,'pending_mcm');assert.equal(f.state().db.patients.find(p=>p.id==='return').status,'discharged');
 assert.equal(await cg.locator('[data-act="care-decision-save"]').count(),0,'caregiver has no final office enrollment control');
 assert.ok(f.state().db.notifications.some(n=>n.userId==='fx-mcm'&&n.title.startsWith('Repeat assessment')));
 await refresh(mcm);await mcm.evaluate(id=>{closeAllModals();ACTIONS['care-referral-open']({id});},referral.id);await mcm.locator('#careDecisionForm').waitFor();
 await mcm.locator('#careDecisionForm [name="decision"]').selectOption('enrol');await mcm.locator('#careDecisionForm [name="officeConfirmed"]').check();await mcm.locator('#careDecisionForm [name="evidenceReviewed"]').check();
 for(const [key,value] of Object.entries({reason:'Synthetic MCM office approval after inspecting new medical sources',needs:f.plan.needs,objectives:f.plan.objectives,interventions:f.plan.interventions,expectedDays:String(f.plan.expectedDays),rationale:f.plan.rationale}))await mcm.locator(`#careDecisionForm [name="${key}"]`).fill(value);
 assessmentReply=mcm.waitForResponse(r=>r.url().endsWith('/api/care/command')&&r.request().method()==='POST');await mcm.locator('[data-act="care-decision-save"]').click();response=await assessmentReply;assert.equal(response.status(),200,await response.text());await mcm.locator('#careDecisionForm').waitFor({state:'detached'});
 const returned=f.state().db.patients.find(p=>p.id==='return');assert.equal(returned.status,'active');assert.equal(f.state().db.patients.length,patientCount);assert.equal(f.state().db.careCycles.filter(c=>c.patientId==='return').length,2);
 assert.notEqual(f.state().db.visits.find(v=>v.id==='fx-old-visit').cycleId,returned.careCycleId);assert.equal(f.state().db.careEvidence.find(e=>e.referralId===referral.id).verifiedBy,'fx-mcm');
 await refresh(cg);
 const short=await newReview('short',30);await step(cg,short,'submit_review');await open(mcm,short);await step(mcm,short,'review_report',{comment:'Synthetic county MCM comments for scheduled review'});
 await step(mcm,short,'schedule_review',{nextReviewAt:new Date(Date.now()+86400000).toISOString().slice(0,16)});
 assert.equal(f.state().db.careReviews.find(r=>r.id===short).status,'scheduled');assert.equal(f.state().db.calendarEvents.length,1);
 const long=await newReview('long',120);await step(cg,long,'submit_review');await open(mcm,long);
 await step(mcm,long,'review_report',{comment:'Synthetic MCM comments: correct next-step duration',hospitalizationChecked:true});await open(cg,long);
 await cg.locator('[data-act="care-review-edit"]').click();await cg.locator('[name="nextSteps"]').fill('Synthetic corrected next action for fourteen days');await cg.locator('[name="correctionNote"]').fill('Synthetic correction in response to MCM comments');
 assert.equal(await cg.locator('#careEditorForm [name="evaluatedAt"]').getAttribute('type'),'hidden','corrections preserve original actual evaluation');
 let saved=cg.waitForResponse(r=>r.url().endsWith('/api/care/command')&&r.request().method()==='POST');await cg.locator('[data-act="care-review-save"]').click();assert.equal((await saved).status(),200);await cg.locator('#careEditorForm').waitFor({state:'detached'});
 await step(cg,long,'resubmit_review');await open(mcm,long);await step(mcm,long,'authorize_review',{comment:'Synthetic MCM authorization for exact corrected report'});assert.equal(f.state().db.intlPdcaDossiers.length,0);
 await step(mcm,long,'share_review');assert.equal(f.state().db.intlPdcaDossiers.length,1);
 // Exercise the real download and print entrypoints, not a parallel renderer.
 const download=mcm.waitForEvent('download');await mcm.locator('[data-act="care-review-docx"]').click();const file=await download;assert.match(file.suggestedFilename(),/\.docx$/);await file.saveAs(path.join(dir,'synthetic-pdca.docx'));
 const popup=mcm.waitForEvent('popup');await mcm.locator('[data-act="care-review-print"]').click();const printed=await popup;await printed.waitForSelector('.care-template-page');
 const corePdf=await printed.pdf({path:path.join(dir,'synthetic-pdca.pdf'),preferCSSPageSize:true,printBackground:true});
 const corePages=(corePdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length;assert.equal(corePages,3,'moderate actual-browser print must retain the supplied three-page core');
 await printed.screenshot({path:path.join(dir,'report.png'),fullPage:true});
 // Long text must expand, never be hidden in a fixed-height report cell.
 await printed.evaluate(()=>{const ps=document.querySelectorAll('.care-template-block .care-pre');ps[1].append(document.createTextNode('\nSynthetic long evaluation narrative. '.repeat(90)+'SYNTHETIC-END-OF-LONG-NARRATIVE'));});
 const longPdf=await printed.pdf({path:path.join(dir,'synthetic-pdca-long.pdf'),preferCSSPageSize:true,printBackground:true});
 const overflowPages=(longPdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length;assert.ok(overflowPages>corePages,'long narrative must flow rather than be clipped');
 const specialist=await session('synthetic-intl.localtest');await specialist.evaluate(()=>go('intlmedical'));await specialist.waitForFunction(()=>document.body.textContent.includes('MCM-authorized PDCA reports'));
 const state=await specialist.evaluate(()=>({patients:DB.db.patients.length,reviews:DB.db.careReviews.length,dossiers:DB.db.intlPdcaDossiers.length}));assert.deepEqual(state,{patients:0,reviews:0,dossiers:1});
 await specialist.locator('[data-act="care-dossier-open"]').click();assert.ok((await specialist.locator('.care-template').innerText()).includes('Synthetic corrected next action for fourteen days'));
 assert.equal(errors.length,0,JSON.stringify(errors));fs.writeFileSync(path.join(dir,'checks.json'),JSON.stringify({evidence,errors,corePages,overflowPages,repeatAssessment:referral.id,repeatPatient:returned.id,shortReview:short,longReview:long,revisionCount:f.state().db.careReviewRevisions.length},null,2));
 console.log('Clinical browser: repeat assessment → MCM office enrollment with retained history; PDCA caregiver → MCM → correction → authorization → international sharing; DOCX/print and 4 viewport checks passed.');console.log('Synthetic evidence: '+dir);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
