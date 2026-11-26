/* Optional actual-browser desktop pane regression; all records are synthetic. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const binary=process.env.CHROMIUM_PATH?null:(await import('@sparticuz/chromium')).default;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||await binary.executablePath(),args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1366,height:900},serviceWorkers:'block'});
 await page.route('**/*',route=>/^(file|data):/.test(route.request().url())?route.continue():route.abort());
 await page.goto(pathToFileURL(path.join(root,'public/carelink-v6.html')).href);
 await page.evaluate(()=>{
  DB.load();DB.seedDemo();AUTH.user=DB.db.users.find(u=>u.roleId==='chief');
  APPX.screen='app';APPX.view='home';DB.db.personalPrefs[AUTH.user.id]={navRail:true,navAutoFold:true,navRailExplicit:true};
  NAVP._tempOpen=false;NAVP._workspaceEngaged=false;render();
 });
 await page.waitForSelector('.app.shell.np-rail');
 await page.locator('#npane [data-act="go"][data-v="devconsole"]').click();
 assert.equal(await page.evaluate(()=>APPX.view),'devconsole');
 assert.equal(await page.locator('.app.shell').evaluate(el=>el.classList.contains('np-rail')),false,'destination expands pane');
 await page.evaluate(()=>render());
 assert.equal(await page.locator('.app.shell').evaluate(el=>el.classList.contains('np-rail')),false,'redraw retains expanded pane');
 await page.locator('#content').click({position:{x:20,y:20}});
 await page.waitForSelector('.app.shell.np-rail');
 console.log('Desktop navigation: actual rail destination opens on first click, holds across redraw and folds on deliberate workspace interaction.');
}finally{await browser.close();}
