/* Optional real-browser synthetic smoke test. Install playwright-core and
   @sparticuz/chromium outside the repository; set CARELINK_BROWSER_TOOLS to
   that directory. System Chromium libraries must be available. */
const path=require('node:path');
const load=name=>require(require.resolve(name,{paths:[process.env.CARELINK_BROWSER_TOOLS||process.cwd()]}));
const {chromium}=load('playwright-core');const binary=load('@sparticuz/chromium').default;
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({args:binary.args,executablePath:await binary.executablePath(),headless:true});
const page=await browser.newPage({viewport:{width:1568,height:900}});
await page.goto(require('node:url').pathToFileURL(path.resolve(__dirname,'../../public/carelink-v6.html')).href);
await page.waitForTimeout(600);
console.log(await page.evaluate(()=>({render:typeof render,login:typeof renderLogin6})));
await page.evaluate(()=>{DB.load();DB.seedDemo();AUTH.user=null;APPX.screen='login';render();});
assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight),900);
console.log('signin',await page.evaluate(()=>{const e=document.querySelector('.lg6');const img=document.querySelector('.lg6-photo-main');return {window:innerHeight,body:document.documentElement.scrollHeight,shell:e?.getBoundingClientRect().toJSON(),image:img?.getBoundingClientRect().toJSON()};}));
await page.evaluate(()=>{AUTH.user=DB.db.users.find(u=>u.roleId==='coordinator');AUTH.mustChange=false;APPX.screen='app';APPX.view='requests';APPX.params={};render();revealWorkspace('requests');});
await page.waitForTimeout(200);
assert(await page.evaluate(()=>document.querySelector('.workspace-view .ctx-strip').getBoundingClientRect().top>=document.querySelector('.topbar').getBoundingClientRect().bottom));
console.log('requests',await page.evaluate(()=>{const bar=document.querySelector('.topbar');const content=document.querySelector('#content');const context=document.querySelector('.workspace-view .ctx-strip');return {bar:bar?.getBoundingClientRect().toJSON(),content:content?.getBoundingClientRect().toJSON(),context:context?.getBoundingClientRect().toJSON(),scroll:content?.scrollTop};}));
for(const size of [{width:1366,height:650},{width:1024,height:768},{width:390,height:844}]){
 await page.setViewportSize(size);
 await page.evaluate(()=>{AUTH.user=null;APPX.screen='login';render();});
 console.log('signin-size',size,await page.evaluate(()=>({page:document.documentElement.scrollHeight,viewport:innerHeight,panel:document.querySelector('.lg6-panel').clientHeight,formHeight:document.querySelector('.lg6-card').scrollHeight,panelScroll:document.querySelector('.lg6-panel').scrollHeight,image:document.querySelector('.lg6-photo-main')?.getBoundingClientRect().height})));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight),size.height);
 assert(await page.evaluate(()=>document.querySelector('.lg6-panel').scrollHeight<=document.querySelector('.lg6-panel').clientHeight+1));
}
await page.setViewportSize({width:1568,height:900});
await page.evaluate(()=>{AUTH.user=DB.db.users.find(u=>u.roleId==='finance');AUTH.mustChange=false;APPX.screen='app';APPX.view='costing';APPX.params={tab:'area'};render();revealWorkspace('costing');});
for(const tab of ['overview','patient','county','disease','dept','bags','trend','standards','ledger','area']){
 await page.locator('[data-act="cost-tab"][data-tab="'+tab+'"]').click();
 const actual=await page.evaluate(()=>COST_STATE.tab);if(actual!==tab)throw new Error('Cost tab failed: '+tab+' -> '+actual);
}
await page.getByRole('button',{name:'View all as tables',exact:true}).click();
if(await page.evaluate(()=>COST_STATE.viewMode)!=='table')throw new Error('Table toggle failed');
await page.getByRole('button',{name:'Full cost report',exact:true}).click();
if(!await page.getByText('Cost per Patient Report',{exact:true}).count())throw new Error('Report modal missing');
console.log('Real browser: 10 cost tab clicks, table toggle and report modal passed');
await browser.close();})().catch(e=>{console.error(e);process.exit(1)});
