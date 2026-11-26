/* Synthetic Chromium audit of shared charts in narrow nested dashboard cards. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const binary=process.env.CHROMIUM_PATH?null:(await import('@sparticuz/chromium')).default;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||await binary.executablePath(),args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},serviceWorkers:'block'});
 await page.route('**/*',route=>/^(file|data):/.test(route.request().url())?route.continue():route.abort());
 await page.goto(pathToFileURL(path.join(root,'public/carelink-v6.html')).href);
 await page.evaluate(()=>{
  DB.load();DB.seedDemo();
  const user=DB.db.users.find(u=>u.roleId==='finance');AUTH.user=user;
  const oldSummary=COSTX.summary,oldLens=COSTX.lensFor;
  COSTX.lensFor=()=>({label:'Synthetic departmental lens',scope:'department'});
  COSTX.summary=()=>({lineCount:412,total:1747923,avgPerPatient:0,patientCount:0,costPerPatientDay:0,patientDays:0,
   byCat:[{key:'transport',total:705083},{key:'hospital',total:359525},{key:'medication',total:356841},{key:'food',total:326474}],
   byMonth:[{key:'2025-01',total:235715,avg:0},{key:'2025-02',total:1512208,avg:0}],byArea:[],canSeeDisease:false});
  const real=departmentCostCard(user);COSTX.summary=oldSummary;COSTX.lensFor=oldLens;
  const host=document.createElement('main');host.id='chart-audit';
  host.style.cssText='position:fixed;z-index:999999;inset:0;overflow:auto;background:var(--surface);padding:16px';
  host.innerHTML=`<div id="audit-card">${real}</div><section id="audit-shared">
   ${chartDonut([{label:'Synthetic exceptionally long expenditure category for a shared service',value:123456789},{label:'Synthetic medical supplies',value:98321}],{title:'Synthetic donut',fmt:v=>money(v)})}
   ${chartRows({title:'Synthetic breakdown',rows:[{label:'A long synthetic location without truncation',value:123456789},{label:'Another synthetic label',value:4300}],fmt:v=>money(v)})}
   ${chartBars({title:'Synthetic bars',rows:[{label:'One',value:100},{label:'Two',value:200}]})}
   ${chartLine({title:'Synthetic trend',labels:['Jan','Feb'],series:[{label:'Synthetic series',values:[1,200]}]})}
   ${chartStacked({title:'Synthetic stack',labels:['Jan','Feb'],series:[{label:'Synthetic series',values:[1,200]}]})}
   ${chartGrouped({title:'Synthetic groups',labels:['Jan','Feb'],series:[{label:'Synthetic series',values:[1,200]}]})}
   ${chartWaterfall([{label:'Synthetic total',value:200,kind:'total'}])}
  </section>`;
  document.body.appendChild(host);
 });
 assert.equal(await page.locator('#audit-card .cost-chart-panel').count(),2,'actual department card renders both charts');
 for(const [viewport,cardWidth,zoom] of [[1440,1100,1],[1440,680,1],[1440,420,1],[1024,600,1],[720,440,1],[390,350,1],[320,288,1],[1440,420,2]]){
  await page.setViewportSize({width:viewport,height:900});
  await page.evaluate(({w,z})=>{for(const e of document.querySelectorAll('#audit-card,#audit-shared')){e.style.width=w+'px';e.style.zoom=z;}},{w:cardWidth,z:zoom});
  const issues=await page.evaluate(()=>{
   const problems=[]; const root=document.querySelector('#chart-audit');
   const box=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
   const intersects=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>0.75&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>0.75;
   const checkInside=(parent,children,label)=>{const p=box(parent);for(const child of children){const c=box(child);if(c.left<p.left-1||c.right>p.right+1||c.top<p.top-1||c.bottom>p.bottom+1)problems.push({label,child:child.className,container:p,rect:c});}};
   for(const sel of ['#audit-card .cost-chart-grid','.donut-wrap-clean','.donut-side-panel','.donut-total-strip','.donut-li-sym','.chart-row-item'])for(const e of root.querySelectorAll(sel)){
    checkInside(e,[...e.children],sel);
    const kids=[...e.children].filter(x=>getComputedStyle(x).display!=='none');
    for(let i=0;i<kids.length;i++)for(const b of kids.slice(i+1))if(intersects(box(kids[i]),box(b)))problems.push({label:sel+' overlap',a:kids[i].className,b:b.className,ar:box(kids[i]),br:box(b)});
   }
   for(const e of root.querySelectorAll('.cost-chart-panel,.donut-block,.donut-side-panel,.chart-row-item'))if(e.scrollWidth>e.clientWidth+1)problems.push({label:'overflow '+e.className,scroll:e.scrollWidth,client:e.clientWidth});
   for(const plot of root.querySelectorAll('.chart-plot'))if(plot.getAttribute('tabindex')!=='0'||plot.scrollWidth<plot.clientWidth)problems.push({label:'plot accessibility'});
   return problems;
  });
  assert.deepEqual(issues,[],JSON.stringify({viewport,cardWidth,issues},null,2));
  assert.equal(await page.locator('#audit-card .donut-legend .donut-li-sym').count(),4);
  assert.equal(await page.locator('#audit-shared .chart-plot').count(),5);
 }
 // Tables remain available and retain complete, untruncated labels and figures.
 await page.locator('#audit-shared details.chart-table').first().locator('summary').click();
 assert.match(await page.locator('#audit-shared details.chart-table').first().innerText(),/Synthetic exceptionally long expenditure category/);
 await page.locator('#audit-shared .chart-plot').first().focus();
 assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('chart-plot')),true);
 assert.equal(await page.locator('#audit-shared .chart-scroll-hint').first().isVisible(),true);
 for(let i=0;i<6;i++)await page.keyboard.press('ArrowRight');
 await page.waitForFunction(()=>document.querySelector('#audit-shared .chart-plot').scrollLeft>0);
 if(process.env.CHART_AUDIT_SCREENSHOT){
  await page.setViewportSize({width:1000,height:1000});
  await page.evaluate(()=>{document.querySelector('#audit-card').style.width='680px';document.querySelector('#audit-card').style.zoom='1';document.querySelector('#chart-audit').scrollTop=0;});
  await page.locator('#audit-card').screenshot({path:process.env.CHART_AUDIT_SCREENSHOT});
 }
 // Exercise the shared components as rendered in real synthetic workspaces too.
 await page.evaluate(()=>document.querySelector('#chart-audit').remove());
 let seen=0;
 for(const [role,view,tab] of [['finance','costing','overview'],['finance','costing','area'],['finance','costing','dept'],['finance','finance',''],['mcm','costing','overview'],['mcm','care',''],['chief','reports','']]){
  for(const width of [1280,390]){
   await page.setViewportSize({width,height:900});
   const result=await page.evaluate(({role,view,tab})=>{
    const user=DB.db.users.find(u=>u.roleId===role);if(!user)return {missing:role};
    AUTH.user=user;APPX.screen='app';APPX.view=view;APPX.params=tab?{tab}:{};APPX.chartViewMode='charts';render();
    const root=document.querySelector('#content');if(!root)return {missing:'workspace'};
    const errors=[];let count=0;
    for(const el of root.querySelectorAll('.donut-block,.donut-side-panel,.chart-row-item,.cost-chart-panel')){
     const r=el.getBoundingClientRect();if(!r.width||!r.height)continue;count++;
     if(el.scrollWidth>el.clientWidth+1)errors.push({cls:el.className,scroll:el.scrollWidth,client:el.clientWidth});
    }
    return {count,errors};
   },{role,view,tab});
   assert.ok(!result.missing,JSON.stringify({role,view,tab,width,result}));
   assert.deepEqual(result.errors,[],JSON.stringify({role,view,tab,width,result}));seen+=result.count;
  }
 }
 assert.ok(seen>=5,`expected actual workspace chart components, saw ${seen}`);
 console.log(`Shared chart layout: actual department cost card plus donut, row, bar, line, stacked, grouped and waterfall charts; eight viewport/container/zoom combinations, keyboard-scrolling and complete data table passed. ${seen} chart components sampled in real synthetic workspaces.`);
}finally{await browser.close();}
