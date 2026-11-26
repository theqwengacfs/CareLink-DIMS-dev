/* Optional Chromium checks, using synthetic records only. Install playwright-core
   and @sparticuz/chromium locally or set CHROMIUM_PATH to a Chromium binary. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const binary=process.env.CHROMIUM_PATH?null:(await import('@sparticuz/chromium')).default;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||await binary.executablePath(),args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:850},serviceWorkers:'block'});
 await page.route('**/*',route=>/^(file|data):/.test(route.request().url())?route.continue():route.abort());
 await page.goto(pathToFileURL(path.join(root,'public/carelink-v6.html')).href);
 await page.evaluate(()=>{
  DB.load();DB.seedDemo();
  const u=DB.db.users.find(u=>u.roleId==='director');AUTH.user=u;
  const p=repo.patientList(u)[0];
  p.name='Synthetic patient with an exceptionally long name';
  p.phone='07000000000000000000000000000000000000000000';
  p.gps={lat:null,lon:null};
  DB.db.execMeetings=[{id:'synthetic-meeting',title:'Synthetic sitting',date:'2026-11-23',status:'agenda',agenda:[],minutes:[],members:[],actions:[{text:'A synthetic executive action with a long description and a long unbroken identifier ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',owner:u.id,due:'2026-12-01',priority:'high'}]}];
  const host=document.createElement('main');host.id='responsive-audit';host.style.cssText='position:fixed;z-index:999999;inset:0;overflow:auto;background:var(--surface);padding:12px';
  host.innerHTML=`<div id="patient-audit">${renderPatient(u,{id:p.id})}</div><div id="exec-audit">${renderExecConsole(u)}</div><div id="coins-audit">${renderRecognition(u)}</div>`;
  document.body.appendChild(host);
 });
 assert.equal(await page.locator('#patient-audit .patient-metadata').count(),1);
 assert.match(await page.locator('#patient-audit .patient-metadata').innerText(),/Not shared/);
 assert.doesNotMatch(await page.locator('#patient-audit .patient-metadata-card').innerText(),/100% beneficiary metadata completeness|Verified telephone/);
 assert.match(await page.locator('#coins-audit').innerText(),/does not independently verify accuracy, timeliness, effectiveness or efficiency/);
 assert.equal(await page.locator('#exec-audit .exec-action-matrix button[data-act="exec-done"]').count(),1);
 for(const [viewport,width] of [[1280,900],[1280,420],[1024,300],[390,350],[320,288]]){
  await page.setViewportSize({width:viewport,height:850});
  await page.evaluate(width=>{for(const e of document.querySelectorAll('#patient-audit,#exec-audit,#coins-audit'))e.style.width=width+'px';},width);
  const errors=await page.evaluate(()=>{
   const out=[];
   for(const e of document.querySelectorAll('#patient-audit .patient-record-header,#patient-audit .patient-metadata,#exec-audit .exec-action-matrix,#exec-audit .exec-action-matrix .tbl-wrap,#coins-audit .coins-standings .lb-row')){
    if(e.scrollWidth>e.clientWidth+1)out.push({element:e.className,client:e.clientWidth,scroll:e.scrollWidth});
   }
   for(const e of document.querySelectorAll('#patient-audit .patient-metadata dt,#patient-audit .patient-metadata dd,#exec-audit .exec-action-matrix td')){
    if(e.scrollWidth>e.clientWidth+1)out.push({element:e.tagName,text:e.textContent.slice(0,50),client:e.clientWidth,scroll:e.scrollWidth});
   }
   return out;
  });
  assert.deepEqual(errors,[],JSON.stringify({viewport,width,errors}));
 }
 // Exercise the real route and event delegation, including the bottom tab pager.
 await page.evaluate(()=>{
  document.querySelector('#responsive-audit').remove();
  AUTH.user=DB.db.users.find(u=>u.roleId==='director');AUTH.mustChange=false;
  APPX.screen='app';APPX.view='patient';APPX.params={id:repo.patientList(AUTH.user)[0].id};render();
 });
 for(const viewport of [1280,390]){
  await page.setViewportSize({width:viewport,height:850});
  const tab=page.locator('.patient-record-header [data-act="patient-tab"][data-tab="visits"]');
  await tab.click();
  assert.equal(await page.evaluate(()=>APPX.params.tab),'visits');
  const pos=await page.evaluate(()=>{
   const content=document.querySelector('#content').getBoundingClientRect();
   const section=document.querySelector('#patient-section-content').getBoundingClientRect();
   return {active:document.activeElement.id,sectionTop:section.top,sectionBottom:section.bottom,contentTop:content.top,contentBottom:content.bottom};
  });
  assert.equal(pos.active,'patient-section-content');
  assert.ok(pos.sectionTop<pos.contentBottom&&pos.sectionBottom>pos.contentTop,JSON.stringify({viewport,pos}));
  await page.locator('.patient-record-header [data-act="patient-tab"][data-tab="overview"]').click();
 }
 console.log('Synthetic patient metadata, executive matrix, Coins standings and patient tab focus: five viewport/container widths; desktop and mobile navigation passed.');
}finally{await browser.close();}
