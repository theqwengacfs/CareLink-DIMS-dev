import { isSnapshotRead, conditionalPrimaryRead } from './kv-primary-read.cjs';
/* Optional real-Chromium regression. Install playwright-core and supply
   CHROMIUM_PATH, or install @sparticuz/chromium (npm-only binary for CI).
   Every request goes to an in-memory fixture API; never contact production. */
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {chromium} from 'playwright-core';
const require=createRequire(import.meta.url),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const bundle=fs.readFileSync(path.join(root,'public/carelink-v6.html'),'utf8');
const kv=new Map(),nativeFetch=globalThis.fetch;
let fixtureQuota=false;
const answer=(result,status=200)=>({ok:status>=200&&status<300,status,json:async()=>({result})});
globalThis.fetch=async(input,init={})=>{
  const url=new URL(String(input));
  assert.equal(url.origin,'https://entry-browser.test','test must never use a production backend');
  if(fixtureQuota) return {ok:false,status:403,json:async()=>({error:'ERR This database has reached current Fixed plan limits. Please upgrade manually or enable auto-upgrade on Upstash Console.'})};
  const [op,...a]=JSON.parse(init.body);
  if(op==='GET') return answer(kv.get(a[0])??null);
  if(op==='SET'){
    if(a.includes('NX')&&kv.has(a[0])) return answer(null);
    kv.set(a[0],String(a[1]));return answer('OK');
  }
  if(op==='EVAL'){
    const [script,count,key,...args]=a;assert.equal(Number(count),1);
    if(isSnapshotRead(script)) return answer(conditionalPrimaryRead(kv,key,args[0]));
    if(script==="return redis.call('GET', KEYS[1])") return answer(kv.get(key)??null);
    if(script.includes('redis.sha1hex')){
      const old=kv.get(key),digest=old===undefined?'missing':crypto.createHash('sha1').update(old).digest('hex');
      if(digest!==args[0]) return answer(old===args[1]?2:0);
      kv.set(key,args[1]);return answer(1);
    }
    if(kv.get(key)!==String(args[0])) return answer(0);
    if(script.includes('DEL')) kv.delete(key);
    return answer(1);
  }
  throw new Error('Unexpected fixture Redis command: '+op);
};
for(const key of Object.keys(process.env)) if(/^(?:CARELINK_|KV_|REDIS_|UPSTASH_|STORAGE_)/.test(key)) delete process.env[key];
process.env.KV_REST_API_URL='https://entry-browser.test';process.env.KV_REST_API_TOKEN='synthetic-browser-fixture';
const {default:handler}=await import('../../api/index.js');
const server=http.createServer(async(req,res)=>{
  try{
    if(req.url.startsWith('/api/')){
      const parts=[];for await(const part of req) parts.push(part);
      req.body=parts.length?JSON.parse(Buffer.concat(parts).toString('utf8')):{};
      await handler(req,res);return;
    }
    const pathname=new URL(req.url,'http://test').pathname;
    let target=pathname==='/'?'index.html':pathname.replace(/^\//,'');
    if(target==='carelink-v6.html') target='public/carelink-v6.html';
    if(!fs.existsSync(path.join(root,target))) target='public/'+target;
    const file=path.resolve(root,target);
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':file.endsWith('.png')?'image/png':'application/json');
    res.end(fs.readFileSync(file));
  }catch(error){res.writeHead(500);res.end(error.message);}
});
let browser;
const errors=[],evidence=[],viewportEvidence=[];
const screenshotDir=process.env.ENTRY_SCREENSHOT_DIR;
if(screenshotDir) fs.mkdirSync(screenshotDir,{recursive:true});
try{
  await new Promise(resolve=>server.listen(0,'0.0.0.0',resolve));
  const base='http://localhost:'+server.address().port;
  const binary=process.env.CHROMIUM_PATH?null:(await import('@sparticuz/chromium')).default;
  // Playwright supplies the normal headless flags. Lambda's in-process GPU
  // can stall repeated viewport/screenshot changes; its single-process and
  // disabled web-security/site-isolation flags also weaken this regression.
  const args=['--no-sandbox'];
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||await binary.executablePath(),args});
  const chief=await browser.newContext({viewport:{width:1366,height:900},acceptDownloads:true});
  const {run}=require('./dom.js').makeCtx();
  // Keep the rows synthetic, but exercise commissioned RBAC rather than the
  // deliberately all-synthetic, pre-activation board-preview exception.
  run(`DB.db=DB.blank();seedSyntheticDataset(DB.db,new Date('2026-11-22T00:00:00.000Z'),{patients:12});DB.db.meta.demoMode=false;DB.db.meta.seeded='browser-fixture';DB.db.meta.label='Isolated browser fixture';`);
  const fixture=JSON.parse(run('JSON.stringify(DB.db)'));
  const password='Chief#Private2029!Xy';
  let response=await chief.request.post(base+'/api/setup',{data:{admin:{username:'chief.admin',password,name:'Synthetic Browser Chief'},db:fixture}});
  assert.equal(response.status(),200,await response.text());
  const page=await chief.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'/carelink-v6.html');await page.waitForSelector('.ld[data-theme="clinic"]');
  async function signIn(page,username,password){
    if(await page.locator('[data-act="goto-login"]').count()) await page.locator('[data-act="goto-login"]').first().click();
    const form=page.locator('form[data-form="login6"]');
    await form.locator('[name="username"]').fill(username);await form.locator('[name="password"]').fill(password);
    await form.locator('[type="submit"]').click();
  }
  async function measure(page,theme,screen){
    const metrics=await page.evaluate(screen=>{
      const prefix=screen==='landing'?'.ld[data-front="1"]':'.lg6[data-theme]';
      const selectors=screen==='landing'?
        ['.ld-org','h1','h1 em','.ld-eyebrow','.ld-subhead','.ld-lede','.ld-fact b','.ld-fact span','.ld-btn-primary','.ld-btn-secondary','.ld-btn-arch','.ld-workflow-head h2','.ld-workflow-kicker','.ld-workflow-path span','.ld-scene-svg text','.ld-setup-status','.ld-assure span','.ld-foot','.ld-foot-brand b','.ld-foot .ld-dim']:
        ['.lg6-card h2','.lg6-kicker','.field label','.input','.lg-note','.entry-security-badge','.lg-tab','.btn-primary','.lg6-brand h1','.lg6-brand h1 em','.lg6-brand-foot','.lg6-copy','.lg6-photo-overlay b','.lg6-photo-overlay span','.lg6-thumb','.lg6-mobile-hero-txt .xs','.lg6-mobile-hero-txt b','.lg6-mobile-hero-txt em','.lg-links .linkbtn','.lg6-foot','.lg-check','.lg-host','.lg6-head .btn','.alert'];
      const rgba=value=>{const a=value.match(/[\d.]+/g)?.map(Number)||[];return [a[0]||0,a[1]||0,a[2]||0,a.length>3?a[3]:1]};
      const composite=(top,bottom)=>[0,1,2].map(i=>top[i]*top[3]+bottom[i]*(1-top[3]));
      const background=element=>{const chain=[];for(let e=element;e;e=e.parentElement)chain.unshift(e);let rgb=[255,255,255];for(const e of chain)rgb=composite(rgba(getComputedStyle(e).backgroundColor),rgb);return rgb};
      const lum=rgb=>rgb.map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((n,x,i)=>n+x*[.2126,.7152,.0722][i],0);
      const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
      const metric=(element,selector,pseudo=null)=>{
        let bg=background(element);const style=getComputedStyle(element,pseudo);
        let color=style.color;
        if(element instanceof SVGTextElement){
          // SVG text paints with fill, and its node/core shape is the actual
          // backdrop. CSS color or the outer card would miss real regressions.
          const shape=element.closest('.ld-workflow-node,.ld-workflow-core')?.querySelector('rect,circle');
          if(shape) bg=rgba(getComputedStyle(shape).fill).slice(0,3);
          color=style.fill;
        }
        return {selector,ratio:ratio(composite(rgba(color),bg),bg),color,background:bg};
      };
      const visible=e=>e.getClientRects().length>0;
      const result=selectors.flatMap(selector=>[...document.querySelectorAll(prefix+' '+selector)].filter(visible).map(e=>metric(e,selector)));
      for(const input of document.querySelectorAll(prefix+' input[placeholder]')) if(visible(input)) result.push(metric(input,'input::placeholder','::placeholder'));
      return result;
    },screen);
    assert.ok(metrics.length>=6,theme+' '+screen+' has measurable rendered controls');
    for(const metric of metrics) assert.ok(metric.ratio>=4.5,theme+' '+screen+' '+JSON.stringify(metric));
    evidence.push({theme,screen,pairs:metrics.length,minimum:Math.min(...metrics.map(x=>x.ratio)).toFixed(2)});
  }
  await measure(page,'clinic default','landing');
  await signIn(page,'chief.admin',password);
  await page.waitForFunction(()=>AUTH.user?.roleId==='chief'&&APPX.screen==='app');
  for(const theme of ['clinic','heritage']){
    await page.evaluate(()=>go('settings',{section:'landing'}));
    const prior=(await (await chief.request.get(base+'/api/health')).json()).landingTheme;
    await page.locator('[data-act="preview-theme"][data-id="'+theme+'"]').click();
    await page.locator('.modal [data-page="signin"]').click();
    await page.waitForSelector('.modal .lg6[data-theme="'+theme+'"]');
    assert.equal((await (await chief.request.get(base+'/api/health')).json()).landingTheme,prior,'live preview is ephemeral');
    assert.equal(await page.locator('.modal [inert]').count(),1);
    const saved=page.waitForResponse(r=>r.url().endsWith('/api/admin/system-config')&&r.request().method()==='POST');
    await page.locator('.modal [data-act="set-landing-theme"]').click();assert.equal((await saved).status(),200);
    const visitor=await browser.newContext({viewport:{width:1366,height:900}}),entry=await visitor.newPage();
    entry.on('pageerror',error=>errors.push(error.message));
    await entry.goto(base+'/carelink-v6.html');await entry.waitForSelector('.ld[data-theme="'+theme+'"]');
    async function noClipping(label){
      const geometry=await entry.evaluate(()=>({
        width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
        outside:[...document.querySelectorAll('.ld button,.lg6-panel input,.lg6-panel select,.lg6-panel button')]
          .filter(e=>e.getClientRects().length).map(e=>({name:e.name||e.textContent.trim(),box:e.getBoundingClientRect().toJSON()}))
          .filter(e=>e.box.left< -1||e.box.right>innerWidth+1)
      }));
      assert.ok(geometry.scrollWidth<=geometry.width+1,label+' horizontal overflow: '+JSON.stringify(geometry));
      assert.deepEqual(geometry.outside,[],label+' clipped controls');
    }
    async function singleScreen(label){
      const geometry=await entry.evaluate(()=>{
        const front=document.querySelector('.ld[data-front="1"],.lg6[data-theme]');
        const selectors=front.matches('.ld')?['.ld-top','.ld-hero-copy','.ld-canvas-card','.ld-foot']:['.lg6-panel','.lg6-card','.lg6-foot'];
        const boxes=selectors.map(selector=>({selector,box:front.querySelector(selector).getBoundingClientRect().toJSON()}));
        const outside=[...front.querySelectorAll('button,input,select,.ld-scene-svg')].filter(e=>e.getClientRects().length)
          .map(e=>({name:e.name||e.getAttribute('aria-label')||e.textContent.trim(),box:e.getBoundingClientRect().toJSON()}))
          .filter(e=>e.box.top< -1||e.box.bottom>innerHeight+1);
        const overflow=[front,...front.querySelectorAll('.ld-front-main,.lg6-panel,.lg6-body')]
          .map(e=>({name:e.className,value:getComputedStyle(e).overflowY}));
        return {height:innerHeight,scrollHeight:document.documentElement.scrollHeight,scrollY,boxes,outside,overflow};
      });
      assert.ok(geometry.scrollHeight<=geometry.height+1,label+' must not scroll vertically: '+JSON.stringify(geometry));
      assert.equal(geometry.scrollY,0,label+' starts at the top');
      assert.deepEqual(geometry.outside,[],label+' every visible control and the complete workflow fit, not just the submit');
      for(const {selector,box} of geometry.boxes) assert.ok(box.y>=-1&&box.bottom<=geometry.height+1,label+' '+selector+' fits the viewport');
      for(const {name,value} of geometry.overflow) assert.ok(!['hidden','clip','scroll','auto'].includes(value),label+' must fit content instead of hiding or internally scrolling it: '+name+' '+value);
      viewportEvidence.push({label,height:geometry.height,pageHeight:geometry.scrollHeight});
    }
    async function controlsReachable(selector,label){
      for(const control of await entry.locator(selector).all()){
        if(!await control.isVisible()) continue;
        await control.scrollIntoViewIfNeeded();
        const result=await control.evaluate(e=>{
          const b=e.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
          return {name:e.name||e.textContent.trim(),top:b.top,bottom:b.bottom,height:innerHeight,unobscured:e===hit||e.contains(hit)};
        });
        assert.ok(result.top>=-1&&result.bottom<=result.height+1&&result.unobscured,label+' control remains reachable in fallback flow: '+JSON.stringify(result));
      }
    }
    // Eight single-screen sizes include short laptop browser windows and a
    // normal portrait phone. Tiny/keyboard-shortened views must flow safely.
    for(const {width,height,single} of [
      {width:1366,height:900,single:true},{width:1366,height:768,single:true},
      {width:1366,height:640,single:true},{width:1024,height:600,single:true},
      {width:1280,height:720,single:true},{width:1024,height:768,single:true},
      {width:768,height:1024,single:true},{width:390,height:844,single:true},
      {width:320,height:640,single:false},{width:844,height:390,single:false}
    ]){
      const size={width,height};
      console.log('entry viewport: '+theme+' '+width+'x'+height+' ('+(single?'single screen':'safe flow')+')');
      await entry.setViewportSize(size);
      if(await entry.locator('.lg6').count()) await entry.locator('[data-act="goto-landing"]').click();
      await entry.evaluate(()=>scrollTo(0,0));
      await noClipping(theme+' landing '+size.width);
      if(single) await singleScreen(theme+' landing '+size.width+'x'+size.height);
      else await controlsReachable('.ld button',theme+' landing '+size.width+'x'+size.height);
      const diagram=entry.getByRole('img',{name:'CareLink system workflow',exact:true});
      assert.equal(await diagram.count(),1,'the informative workflow is restored and exposed to assistive technology');
      assert.equal(await diagram.locator('.ld-workflow-node').count(),8,'all eight original departments are drawn');
      assert.equal(await diagram.locator('.ld-workflow-links line').count(),8,'all eight original connections are drawn');
      const colours=await diagram.evaluate(svg=>({
        core:getComputedStyle(svg.querySelector('.ld-workflow-core circle')).fill,
        links:getComputedStyle(svg.querySelector('.ld-workflow-links')).stroke,
        nodes:[...new Set([...svg.querySelectorAll('.ld-workflow-node rect')].map(e=>getComputedStyle(e).fill))],
        redNodes:svg.querySelectorAll('[data-tone="red"]').length
      }));
      assert.equal(colours.core,'rgb(179, 28, 43)','the hub is visibly red, not another white/grey disc');
      assert.equal(colours.links,'rgb(255, 137, 150)','all eight spokes have stronger red accents');
      assert.equal(colours.redNodes,4,'red leads the eight departments');
      assert.equal(colours.nodes.length,4,'teal, gold and blue provide visual variety alongside red');
      const labelGeometry=await diagram.locator('.ld-workflow-node').evaluateAll(nodes=>nodes.map(node=>{
        const text=node.querySelector('text').getBBox(),rect=node.querySelector('rect').getBBox();
        return {label:node.dataset.workflowNode,fits:text.x>=rect.x&&text.x+text.width<=rect.x+rect.width&&text.y>=rect.y&&text.y+text.height<=rect.y+rect.height};
      }));
      assert.ok(labelGeometry.every(n=>n.fits),'workflow labels stay inside their nodes at '+size.width+': '+JSON.stringify(labelGeometry));
      const footer=await entry.locator('.ld-foot').boundingBox(),art=await entry.locator('.ld-canvas-card').boundingBox();
      assert.ok(footer.y>=art.y+art.height-1,'landing footer must flow below, not clip/overlap the hero');
      if(size.width>920){
        const copy=await entry.locator('.ld-hero-copy').boundingBox();
        assert.ok(art.x>=copy.x+copy.width-1,'the workflow remains on the right on desktop');
      }
      if(theme==='clinic'){
        const tones=await entry.evaluate(()=>{
          const front=document.querySelector('.ld[data-front="1"]'),panel=front.querySelector('.ld-canvas-card'),footer=front.querySelector('.ld-foot');
          const art=panel.getBoundingClientRect(),foot=footer.getBoundingClientRect();
          return {canvas:getComputedStyle(front).backgroundColor,header:getComputedStyle(front.querySelector('.ld-top')).backgroundColor,
            panel:getComputedStyle(panel).backgroundColor,footer:getComputedStyle(footer).backgroundColor,
            darkFootprint:(art.width*art.height+foot.width*foot.height)/(innerWidth*front.getBoundingClientRect().height)};
        });
        assert.equal(tones.canvas,'rgb(255, 255, 255)','white remains the dominant canvas');
        assert.equal(tones.header,'rgb(255, 255, 255)','the letterhead stays white');
        assert.equal(tones.panel,'rgb(35, 35, 35)','charcoal graphic panel provides visual relief');
        assert.equal(tones.footer,'rgb(23, 23, 23)','soft-black footer anchors the page');
        assert.ok(tones.darkFootprint>=.15&&tones.darkFootprint<.45,'dark relief is substantial but does not dominate the page: '+JSON.stringify(tones));
      }
      if([1366,390].includes(size.width)){
        await measure(entry,theme+' '+size.width,'landing');
        if(screenshotDir) await entry.screenshot({path:path.join(screenshotDir,theme+'-'+size.width+'x'+size.height+'-landing.png'),fullPage:true});
      }
      await entry.locator('[data-act="goto-login"]').click();await entry.waitForSelector('.lg6[data-theme="'+theme+'"]');
      assert.equal(await entry.locator('.lg6-card').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)','sign-in card stays white in both identities');
      assert.equal(await entry.locator('.lg-tabs').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length),4,'no empty demo column');
      for(const tab of ['signin','activate','request','forgot']){
        await entry.locator('.lg-tabs [data-tab="'+tab+'"]').click();
        await entry.evaluate(()=>scrollTo(0,0));
        await noClipping(theme+' '+tab+' '+size.width);
        if(single) await singleScreen(theme+' '+tab+' '+size.width+'x'+size.height);
        else await controlsReachable('.lg6-panel input,.lg6-panel select,.lg6-panel button',theme+' '+tab+' '+size.width+'x'+size.height);
        for(const label of await entry.locator('.lg6-body .field label').all()) assert.ok(await label.evaluate(e=>Boolean(e.control)),'access fields have associated labels');
        if(tab==='signin'){
          assert.equal(await entry.locator('[name="deviceLabel"],[name="deviceType"]').count(),0,'sign-in does not ask for a device label or type');
          assert.equal(await entry.locator('.lg-host.ok').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(234, 245, 241)','online status has a pale-teal surface');
          assert.equal(await entry.locator('.lg-device-note').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 246, 229)','the device notice has a readable gold surface');
          assert.equal(await entry.locator('.lg-tabs .lg-tab').evaluateAll(tabs=>new Set(tabs.map(e=>getComputedStyle(e).color)).size),4,'the four access routes carry distinct accent colours');
          if(size.width===390){
            await entry.locator('#lg-u').focus();await entry.keyboard.press('Tab');
            assert.ok(await entry.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle!=='none'),'keyboard focus is visible');
            await entry.locator('#lg-p').fill('Synthetic#Visibility1!');
            await entry.locator('.pw-eye').first().click();assert.equal(await entry.locator('#lg-p').getAttribute('type'),'text');
            await entry.locator('.pw-eye').first().click();assert.equal(await entry.locator('#lg-p').getAttribute('type'),'password');
          }
        }
        if([1366,390].includes(size.width)){
          await measure(entry,theme+' '+size.width+' '+tab,'signin');
          if(screenshotDir) await entry.screenshot({path:path.join(screenshotDir,theme+'-'+size.width+'x'+size.height+'-'+tab+'.png'),fullPage:true});
        }
      }
    }
    // A prior dark workspace must not turn entry inputs, hints or links grey on
    // grey. This is an isolated DOM state, not a saved theme or server write.
    await entry.setViewportSize({width:1366,height:900});
    await entry.evaluate(()=>{
      LOGIN6.tab='signin';LOGIN6.error='Synthetic sign-in error for the contrast regression.';render();
      // Inject after render(): applyTheme() runs during render, so injecting
      // before it would accidentally test the normal workspace reset instead.
      document.documentElement.dataset.wmode='dark';
      for(const [key,value] of Object.entries({'--ink':'#EEEEEE','--muted':'#DDDDDD','--surface':'#141414','--field':'#141414','--crit-bg':'#3F0A13'})) document.documentElement.style.setProperty(key,value);
    });
    assert.equal(await entry.evaluate(()=>document.documentElement.dataset.wmode),'dark');
    assert.equal(await entry.locator('#lg-u').evaluate(e=>getComputedStyle(e).color),'rgb(32, 32, 32)','entry field ink is local even while the surrounding document remains dark');
    await measure(entry,theme+' after cached dark workspace','signin');
    await entry.evaluate(()=>scrollTo(0,0));
    await singleScreen(theme+' sign-in with error and cached dark workspace 1366x900');
    // Reflow/zoom-equivalent geometry must not strand any field, privacy link
    // or account-recovery action behind the old fixed-height shell.
    await entry.setViewportSize({width:683,height:450});
    await noClipping(theme+' zoom-equivalent view');
    await controlsReachable('.lg6-panel input,.lg6-panel select,.lg6-panel button',theme+' zoom-equivalent view');
    await entry.locator('[data-act="goto-landing"]').click();
    await entry.locator('[data-act="goto-public"]').click();await entry.waitForFunction(()=>APPX.screen==='public');
    await visitor.close();
  }
  // Exercise actual DOM events with a stored, explicitly folded rail preference.
  await page.evaluate(()=>{DB.db.personalPrefs[AUTH.user.id]={navRail:true,navAutoFold:true,navRailExplicit:true};go('home');});
  await page.waitForSelector('.app.shell.np-rail');
  const destination=page.locator('#npane [data-act="go"][data-v="devconsole"]');
  await destination.click();await page.waitForFunction(()=>APPX.view==='devconsole');
  assert.equal(await page.evaluate(()=>APPX.view),'devconsole','one rail click opens the destination');
  const viewGeometry=await page.evaluate(()=>{const s=document.querySelector('.app.shell'),c=document.querySelector('#content'),b=document.querySelector('.topbar');return {top:c.getBoundingClientRect().top,bar:b.getBoundingClientRect().bottom,scroll:s.scrollTop};});
  assert.ok(viewGeometry.scroll>0 && viewGeometry.top<=viewGeometry.bar+8,JSON.stringify(viewGeometry));
  await page.evaluate(()=>NAVP.expandTemporarily());
  await page.locator('#content').click({position:{x:20,y:20}});await page.waitForSelector('.app.shell.np-rail');
  // One-account confidential export through the real Chief form/download path.
  await page.evaluate(()=>go('staffaccounts'));await page.waitForFunction(()=>ENTRY_ADMIN.rosterLoaded&&!ENTRY_ADMIN.busy);
  await page.locator('[data-act="entry-export-open"][data-username="caregiver.ombeyi"]').click();
  await page.locator('#entry-admin-form [name="confirm"]').check();await page.locator('#entry-admin-form [name="password"]').fill(password);
  const exported=page.waitForResponse(r=>r.url().endsWith('/api/admin/staff-accounts/export'));
  const downloaded=page.waitForEvent('download');await page.locator('#entry-admin-form [type="submit"]').click();
  const exportResponse=await exported;assert.equal(exportResponse.status(),200);const pack=await exportResponse.json(),account=pack.rows[0];
  const download=await downloaded;assert.match(download.suggestedFilename(),/^CareLink-confidential-staff-/);await download.delete();
  assert.equal(account.email,'');assert.ok(account.temporaryPassword&&account.expiresAt);
  const chiefToken=await page.evaluate(()=>SYNC.sessionToken);
  const staff=await browser.newContext({viewport:{width:1024,height:768}}),tablet=await staff.newPage(),staffRequests=[];
  tablet.on('pageerror',error=>errors.push(error.message));tablet.on('request',request=>staffRequests.push(new URL(request.url()).pathname));
  await tablet.goto(base+'/carelink-v6.html');await tablet.waitForSelector('[data-act="goto-login"]');
  await signIn(tablet,account.username,account.temporaryPassword);
  await tablet.waitForSelector('form[data-form="mustchange6"]');
  assert.equal((await staff.request.get(base+'/api/state',{headers:{'X-CareLink-Session':chiefToken}})).status(),401,'copied Chief token without its cookie cannot grant access');
  const deviceList=await chief.request.get(base+'/api/admin/devices',{headers:{'X-CareLink-Session':chiefToken}});
  assert.equal(deviceList.status(),200);
  const enrolled=(await deviceList.json()).devices.find(d=>d.requestedBy===account.username&&d.status==='approved');
  assert.ok(enrolled,'new browser was automatically enrolled');
  const deviceCode=enrolled.id;
  await page.evaluate(()=>go('devices'));await page.waitForFunction(()=>ENTRY_ADMIN.deviceLoaded&&!ENTRY_ADMIN.busy);
  const deviceRow=()=>page.locator('tbody tr').filter({has:page.locator('[data-act="entry-device-review"][data-id="'+deviceCode+'"]')});
  await tablet.waitForSelector('form[data-form="mustchange6"]');
  assert.equal(await tablet.evaluate(()=>DB.db.patients.length),0);
  let staffToken=await tablet.evaluate(()=>SYNC.sessionToken);
  assert.equal((await staff.request.get(base+'/api/state',{headers:{'X-CareLink-Session':staffToken}})).status(),403,'temporary session is gated before private replacement');
  const change=tablet.locator('form[data-form="mustchange6"]');
  await change.locator('[name="current"]').fill(account.temporaryPassword);await change.locator('[name="password"]').fill('River#Private2030!Xy');await change.locator('[name="password2"]').fill('River#Private2030!Xy');await change.locator('[type="submit"]').click();
  await tablet.waitForFunction(()=>AUTH.user&&APPX.screen==='app'&&!AUTH.mustChange&&!LOGIN6.mustChangeBusy);
  const workspace=await tablet.evaluate(()=>({patients:DB.db.patients.length,inScope:DB.db.patients.every(p=>p.areaId==='ombeyi'),areas:AUTH.user?.areaIds,error:LOGIN6.error,sync:SYNC.message}));
  assert.ok(workspace.patients>0&&workspace.inScope,'approved staff receive only scoped data after private replacement: '+JSON.stringify(workspace));
  const cookies=await staff.cookies(base);assert.ok(cookies.some(c=>c.name==='carelink_device_v1'&&c.httpOnly&&c.sameSite==='Strict'));
  const revokeResponse=page.waitForResponse(response=>response.url().endsWith('/api/admin/devices/decision')&&response.request().method()==='POST');
  await deviceRow().locator('[data-act="entry-device-review"]').click();await page.locator('#entry-admin-form [name="decision"]').selectOption('revoked');await page.locator('#entry-admin-form [name="password"]').fill(password);await page.locator('#entry-admin-form [type="submit"]').click();
  const revoked=await revokeResponse;assert.equal(revoked.status(),200,await revoked.text());
  await page.waitForFunction(code=>!ENTRY_ADMIN.busy&&ENTRY_ADMIN.devices.some(d=>d.id.startsWith(code)&&d.status==='revoked'),deviceCode);
  assert.equal((await staff.request.get(base+'/api/state',{headers:{'X-CareLink-Session':staffToken}})).status(),401,'revocation cuts off an existing actual-browser session');
  // The actual provider wording must not blame staff passwords or offer a
  // destructive reset. Real UI retries are deliberate, not a sync cascade.
  const retainedRoot=kv.get('carelink_cloud_v66');fixtureQuota=true;
  const quotaContext=await browser.newContext({viewport:{width:390,height:844}}),quotaPage=await quotaContext.newPage(),quotaRequests=[];
  quotaPage.on('pageerror',error=>errors.push(error.message));
  quotaPage.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/')) quotaRequests.push(request.url());});
  await quotaPage.goto(base+'/carelink-v6.html#/login');
  await quotaPage.waitForFunction(()=>SYNC.kvBlocked());
  await signIn(quotaPage,'chief.admin',password);
  await quotaPage.waitForFunction(()=>/database quota/.test(LOGIN6.error));
  const alert=quotaPage.locator('.lg6-alert.crit');
  assert.match(await alert.innerText(),/not a staff password or KV-token rejection/);
  assert.doesNotMatch(await alert.innerText(),/Upstash rejected the KV credentials/);
  assert.equal(await quotaPage.locator('[data-act="reset-first-run-fresh"],[data-act="login-offline-device-mode"]').count(),0);
  const retry=quotaPage.locator('[data-act="login-retry-kv"]');
  await retry.scrollIntoViewIfNeeded();assert.equal(await retry.isVisible(),true,'quota retry remains reachable on mobile');
  if(screenshotDir) await quotaPage.screenshot({path:path.join(screenshotDir,'quota-bandwidth-mobile.png'),fullPage:true});
  const failedCalls=quotaRequests.length;
  await retry.click();await quotaPage.waitForFunction(()=>!LOGIN6.busy&&/database quota/.test(LOGIN6.error));
  assert.equal(quotaRequests.length,failedCalls+1,'one diagnostic, no automatic full-sync retries on a quota');
  fixtureQuota=false;
  await retry.click();await quotaPage.waitForFunction(()=>/online and healthy/.test(LOGIN6.notice));
  assert.equal(await quotaPage.evaluate(()=>SYNC.kvBlocked()),false);
  assert.equal(kv.get('carelink_cloud_v66'),retainedRoot,'quota recovery checks must not reset or change the installation');
  await quotaContext.close();
  // A retired Pages entry may redirect but may never probe or commission an API.
  const retired=await browser.newContext({serviceWorkers:'block'}),retiredPage=await retired.newPage(),retiredApi=[];
  await retired.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname.includes('/api/')) retiredApi.push(url.pathname);
    if(url.hostname==='care-link-dims-dev-three.vercel.app') return route.fulfill({contentType:'text/html',body:'<h1>Official service destination</h1>'});
    if(url.hostname==='theqwengacfs.github.io') return route.fulfill({contentType:'text/html',body:bundle});
    return route.abort();
  });
  await retiredPage.goto('https://theqwengacfs.github.io/CareLink-DIMS-dev/carelink-v6.html').catch(()=>{});
  await retiredPage.waitForURL('https://care-link-dims-dev-three.vercel.app/');assert.deepEqual(retiredApi,[]);
  assert.deepEqual(errors,[],'no uncaught browser errors');
  console.log('entry-browser: actual Chromium red-led workflow/white-led coloured relief, themes/preview/apply, ten viewport sizes and all four access panels, true zero-scroll geometry at eight sizes (not hidden overflow), tiny/short/zoomed control reachability, keyboard/placeholder/contrast and cached-workspace isolation, expand → hold → collapse, automatic browser enrollment/private-change/revocation, confidential download and retired-host redirect passed');
  console.log('Viewport fits: '+JSON.stringify(viewportEvidence));
  console.log('Rendered contrast: '+JSON.stringify(evidence));
}finally{
  if(browser) await browser.close();
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));globalThis.fetch=nativeFetch;
}
