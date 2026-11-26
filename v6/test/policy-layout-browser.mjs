/* Optional Chromium geometry check; no production requests or real records. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const binary=process.env.CHROMIUM_PATH?null:(await import('@sparticuz/chromium')).default;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||await binary.executablePath(),args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},serviceWorkers:'block'});
 await page.route('**/*',route=>/^(file|data):/.test(route.request().url())?route.continue():route.abort());
 await page.goto(pathToFileURL(path.join(root,'public/carelink-v6.html')).href);
 await page.evaluate(()=>{
  DB.db=DB.blank();APPX.params={};
  const host=document.createElement('div');host.id='policy-geometry-fixture';
  host.style.cssText='position:fixed;z-index:999999;inset:0;overflow:auto;background:white;padding:16px;';
  host.innerHTML=CARELINK_GOVERNANCE.renderGovernancePolicyCenter({id:'synthetic',roleId:'mediahead',countyId:'kisumu'},{tab:'charter'});
  document.body.appendChild(host);
 });
 for(const [width,height] of [[1440,900],[1024,768],[720,600],[390,844],[320,480]]){
  await page.setViewportSize({width,height});
  const result=await page.evaluate(()=>Array.from(document.querySelectorAll('#policy-geometry-fixture .gov67-sec-card')).map(card=>{
   const badge=card.querySelector('.gov67-sec-meta .badge').getBoundingClientRect();
   const label=card.querySelector('.gov67-sec-visibility').getBoundingClientRect();
   const box=card.getBoundingClientRect(),header=card.querySelector('h3').getBoundingClientRect();
   const intersection=Math.max(0,Math.min(badge.right,label.right)-Math.max(badge.left,label.left))*Math.max(0,Math.min(badge.bottom,label.bottom)-Math.max(badge.top,label.top));
   return {intersection,boxWidth:box.width,scrollWidth:card.scrollWidth,clientWidth:card.clientWidth,badgeBottom:badge.bottom,labelBottom:label.bottom,headingTop:header.top};
  }));
  assert.equal(result.length,6,'all actual governance charter cards rendered');
  for(const row of result){assert.equal(row.intersection,0,JSON.stringify({width,row}));assert.ok(row.scrollWidth<=row.clientWidth+1,JSON.stringify({width,row}));assert.ok(row.headingTop>=Math.max(row.badgeBottom,row.labelBottom)-1,JSON.stringify({width,row}));}
 }
 console.log('Policy cards: actual template and CSS, five desktop/tablet/mobile viewport widths, no metadata overlap or horizontal overflow.');
}finally{await browser.close();}
