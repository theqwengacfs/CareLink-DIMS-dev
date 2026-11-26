/* Optional real-browser tab audit. All records are synthetic, no network. */
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
  DB.load();DB.seedDemo();AUTH.user=DB.db.users.find(u=>u.roleId==='mcm');
  const p=repo.patientList(AUTH.user)[0];APPX.screen='app';APPX.view='patient';APPX.params={id:p.id};render();
 });
 assert.equal(await page.locator('.patient-tabs .tab').count(),9);
 assert.equal(await page.locator('.patient-tabs [aria-current="true"]').count(),1);
 for(const name of ['clinical','visits','pdca','hospital','documents','timeline','cycles','discharge','overview']){
  await page.locator(`.patient-tabs [data-tab="${name}"]`).click();
  assert.equal(await page.evaluate(()=>APPX.params.tab),name);
  assert.equal(await page.locator(`.patient-tabs [data-tab="${name}"]`).getAttribute('aria-current'),'true');
 }
 for(const [width,height] of [[1440,900],[1024,768],[720,800],[390,844],[320,568]]){
  await page.setViewportSize({width,height});
  const result=await page.locator('.patient-tabs').evaluate(el=>{
   const box=el.getBoundingClientRect(); const buttons=[...el.querySelectorAll('.tab')];
   return {container:{width:box.width,scroll:el.scrollWidth,client:el.clientWidth},buttons:buttons.map(b=>{const r=b.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,scroll:b.scrollWidth,client:b.clientWidth,visible:getComputedStyle(b).visibility};})};
  });
  assert.equal(result.buttons.length,9);
  assert.ok(result.container.scroll<=result.container.client+1,JSON.stringify({width,result}));
  for(const [i,b] of result.buttons.entries()){
   assert.ok(b.width<=result.container.width+1&&b.height>=39&&b.scroll<=b.client+1&&b.visible==='visible',JSON.stringify({width,b}));
   for(const c of result.buttons.slice(i+1)) assert.ok(b.right<=c.left+0.5||c.right<=b.left+0.5||b.bottom<=c.top+0.5||c.bottom<=b.top+0.5,JSON.stringify({width,b,c}));
  }
 }
 await page.setViewportSize({width:1440,height:900});
 // Check actual computed text/fill contrast for every built-in theme in three
 // different tab preferences. Sample both selected and unselected controls.
 const failures=await page.evaluate(()=>{
  const bad=[];const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');
  const rgb=c=>{ctx.clearRect(0,0,1,1);ctx.fillStyle='#000';ctx.fillStyle=c;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data];};
  const effective=el=>{let layers=[];for(let n=el;n;n=n.parentElement)layers.push(rgb(getComputedStyle(n).backgroundColor));let out=[255,255,255];for(const c of layers.reverse()){const a=c[3]/255;out=out.map((v,i)=>c[i]*a+v*(1-a));}return out;};
  const lum=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((v,x,i)=>v+x*[.2126,.7152,.0722][i],0);
  for(const theme of WTHEMES) for(const style of ['pill','boxed','underline']) for(const scheme of ['department','lake','orchid']){
   DB.db.personalPrefs[AUTH.user.id]={wtheme:theme.id,tabStyle:style,colorScheme:scheme,uiEpoch:691};WTHEME.apply(AUTH.user);
   for(const el of document.querySelectorAll('.patient-tabs .tab')){
    const fg=rgb(getComputedStyle(el).color),bg=effective(el),l1=lum(fg),l2=lum(bg),ratio=(Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);
    if(ratio<4.5)bad.push({theme:theme.id,style,scheme,tab:el.dataset.tab,ratio,fg,bg});
   }
  }
  return bad;
 });
 assert.deepEqual(failures,[],'tab text must meet 4.5:1 contrast in tested themes and styles');
 await page.locator('.patient-tabs .tab').first().focus();
 await page.keyboard.press('Tab');
 assert.equal(await page.evaluate(()=>document.activeElement?.closest('.patient-tabs')!==null),true);
 assert.notEqual(await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle),'none');
 // Sample other actual workspaces which share the same tab component.
 await page.setViewportSize({width:390,height:844});
 let groups=0;
 for(const view of ['patients','hospital','care','forms','clinicalmcm','monday','finance','quality']){
  const findings=await page.evaluate(view=>{
   DB.db.personalPrefs[AUTH.user.id]={wtheme:'foundation',tabStyle:'pill',colorScheme:'lake',uiEpoch:691};
   APPX.view=view;APPX.params={};render();
   return [...document.querySelectorAll('#content .tabs')].map(group=>({
    width:group.getBoundingClientRect().width,client:group.clientWidth,scroll:group.scrollWidth,
    buttons:[...group.querySelectorAll('.tab')].map(b=>({width:b.getBoundingClientRect().width,scroll:b.scrollWidth,client:b.clientWidth,height:b.getBoundingClientRect().height}))
   }));
  },view);
  for(const group of findings){
   if(!group.buttons.length)continue;groups++;
   assert.ok(group.scroll<=group.client+1,JSON.stringify({view,group}));
   for(const b of group.buttons)assert.ok(b.width<=group.width+1&&b.scroll<=b.client+1&&b.height>=39,JSON.stringify({view,b}));
  }
 }
 assert.ok(groups>=3,`only ${groups} real shared tab groups were sampled`);
 console.log(`Patient tabs: nine real destinations, current state, keyboard focus, five viewport widths and computed text contrast across built-in themes, three tab styles and three colour schemes passed. ${groups} additional shared workspace tab groups fit a phone viewport.`);
}finally{await browser.close();}
