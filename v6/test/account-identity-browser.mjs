/* Optional synthetic browser test; install playwright-core and a Chromium binary. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const binary=process.env.CHROMIUM_PATH?null:(await import('@sparticuz/chromium')).default;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||await binary.executablePath(),args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1568,height:900},serviceWorkers:'block'});
 await page.route('**/*',r=>/^(file|data):/.test(r.request().url())?r.continue():r.abort());
 await page.goto(pathToFileURL(path.join(root,'public/carelink-v6.html')).href);
 await page.evaluate(()=>{DB.load();DB.seedDemo();});
 const identities=[];
 for(const width of [1568,1024,390,320]){
  await page.setViewportSize({width,height:900});
  for(const role of ['countyadmin','assistant','caregiver','mcm','finance','mediahead']){
   for(const theme of ['foundation','midnight']){
    const data=await page.evaluate(({role,theme})=>{
     const user=DB.db.users.find(u=>u.roleId===role);
     AUTH.user=user;AUTH.mustChange=false;APPX.screen='app';APPX.view='home';APPX.params={};APPX.navOpen=true;
     NAVP._tempOpen=true;WTHEME.setStudio(user,'colorScheme','department');WTHEME.choose(user,theme);render();
     const dot=document.querySelector('.np-role-name .np-dot');
     const label=document.querySelector('.np-role-name');
     const header=document.querySelector('.np-brand');
     const hero=document.querySelector('.shell-role-banner .ws67-hero');
     const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
     return {dot:rect(dot),label:rect(label),header:rect(header),hero:rect(hero),border:getComputedStyle(dot).borderTopWidth,role:getComputedStyle(label).color,headBackground:getComputedStyle(header).backgroundImage,heroBackground:getComputedStyle(hero).backgroundImage,tokens:[1,2,3].map(i=>getComputedStyle(document.documentElement).getPropertyValue('--console-hero-'+i).trim()), contrast:[1,2,3].map(i=>WTC.contrast(getComputedStyle(document.documentElement).getPropertyValue('--console-hero-'+i).trim(),'#FFFFFF'))};
    },{role,theme});
    const {dot,label,header}=data;
    assert(dot.width>=12&&dot.height>=12,JSON.stringify({width,role,theme,data}));
    for(const container of [label,header]) assert(dot.left>=container.left+0.9&&dot.right<=container.right-0.9&&dot.top>=container.top+0.9&&dot.bottom<=container.bottom-0.9,JSON.stringify({width,role,theme,data}));
    assert.equal(data.border,'2px');assert.equal(data.role,'rgb(255, 255, 255)');
    assert(data.headBackground.includes('gradient')&&data.heroBackground.includes('gradient'));
    assert(data.contrast.every(c=>c>=4.5),JSON.stringify({width,role,theme,data}));
    if(width===1568&&theme==='foundation')identities.push(data.tokens.join('|'));
   }
  }
 }
 assert.equal(new Set(identities).size,identities.length);
 console.log('Synthetic account identity browser check passed: six roles, four widths and light/dark themes; dot geometry, identity bands and gradient-stop contrast.');
}finally{await browser.close();}
