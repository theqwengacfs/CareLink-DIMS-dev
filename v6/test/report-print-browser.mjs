/* Synthetic report-only print and pagination exercise; PDFs stay outside the repository. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright-core';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const binary=process.env.CHROMIUM_PATH?null:(await import('@sparticuz/chromium')).default;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||await binary.executablePath(),args:['--no-sandbox']});
try{
 for(const width of [1440,390]) for(const orientation of ['portrait','landscape']){
  const page=await browser.newPage({viewport:{width,height:900},serviceWorkers:'block'});
  await page.route('**/*',r=>/^(file|data):/.test(r.request().url())?r.continue():r.abort());
  await page.goto(pathToFileURL(path.join(root,'public/carelink-v6.html')).href);
  await page.evaluate((orientation)=>{
   DB.load();DB.seedDemo();AUTH.user=DB.db.users.find(u=>RBAC.has(u,'report.patient_figures'));APPX.view='report';
   const actual=renderReportView(AUTH.user,{type:'patient_figures'});
   document.querySelector('#root').innerHTML='<div class="topbar">WORKSPACE SECRET HEADER</div><main id="content"><div>URGENT WORKSPACE BANNER</div>'+actual+'</main>';
   const rows=Array.from({length:125},(_,i)=>`<tr><td>ROWMARK${String(i+1).padStart(3,'0')}</td><td>Example content for pagination and wrapping</td><td>${i+1}</td></tr>`).join('');
   document.querySelector('.rpt-body-flow').insertAdjacentHTML('beforeend','<h2>SYNTHETIC REPORT TITLE</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Identifier</th><th>Description</th><th>Value</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+chartBars({title:'Synthetic chart',rows:[{label:'ALPHA-CHART',value:42},{label:'OMEGA-CHART',value:21}]})+'<p>END OF SYNTHETIC REPORT</p>');
   window.print=()=>{};
   PRINT_CONTROL.open('workspace');PRINT_CONTROL.execute('A4', orientation);
  },orientation);
  assert.equal(await page.evaluate(()=>PRINT_CONTROL.source),'document');
  assert.equal(await page.locator('#printRoot details').last().getAttribute('open'),'');
  assert.equal(await page.locator('#content details').last().getAttribute('open'),null);
  const file=`/tmp/carelink-report-${width}-${orientation}.pdf`;
  await page.pdf({path:file,preferCSSPageSize:true,printBackground:true});
  await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
  assert.equal(await page.locator('#printRoot').innerHTML(),'');
  await page.close();
  execFileSync('python3',['-c',`import pymupdf,sys\nd=pymupdf.open(sys.argv[1]); t=' '.join(p.get_text() for p in d)\nassert len(d)>1\nassert (d[0].rect.width < d[0].rect.height) == (sys.argv[2]=='portrait')\nassert 'SYNTHETIC REPORT TITLE' in t and 'END OF SYNTHETIC REPORT' in t\nassert 'WORKSPACE SECRET HEADER' not in t and 'URGENT WORKSPACE BANNER' not in t\nfor i in range(1,126): assert 'ROWMARK%03d'%i in t, i\nassert 'ALPHA-CHART' in t and 'OMEGA-CHART' in t\nfor p in d:\n for b in p.get_text('blocks'):\n  assert b[0]>=-1 and b[1]>=-1 and b[2]<=p.rect.width+1 and b[3]<=p.rect.height+1, (p.number,b[:4])\nprint(len(d),'pages checked')`,file,orientation],{env:{...process.env,PYTHONPATH:process.env.PDF_PYTHONPATH||'/tmp/carelink-pdf-check'},stdio:'inherit'});
  console.log(`A4 ${orientation}, viewport ${width}: all 125 rows and chart data, no workspace content.`);
 }
 const modalPage=await browser.newPage({serviceWorkers:'block'});
 await modalPage.route('**/*',r=>/^(file|data):/.test(r.request().url())?r.continue():r.abort());
 await modalPage.goto(pathToFileURL(path.join(root,'public/carelink-v6.html')).href);
 await modalPage.evaluate(()=>{
  DB.load();DB.seedDemo();AUTH.user=DB.db.users.find(u=>u.roleId==='mcm');
  document.querySelector('#root').innerHTML='<div>WORKSPACE SECRET HEADER</div>';
  window.print=()=>{};
  printDoc('Synthetic form','<p>MODAL DOCUMENT CONTENT</p>');
  PRINT_CONTROL.open('document');PRINT_CONTROL.execute('A4','portrait');
 });
 assert.equal(await modalPage.evaluate(()=>PRINT_CONTROL.source),'document');
 const modalFile='/tmp/carelink-modal-document.pdf';
 await modalPage.pdf({path:modalFile,preferCSSPageSize:true});
 execFileSync('python3',['-c',"import pymupdf,sys; t=' '.join(p.get_text() for p in pymupdf.open(sys.argv[1])); assert 'MODAL DOCUMENT CONTENT' in t and 'WORKSPACE SECRET HEADER' not in t",modalFile],{env:{...process.env,PYTHONPATH:process.env.PDF_PYTHONPATH||'/tmp/carelink-pdf-check'}});
 await modalPage.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
 assert.equal(await modalPage.locator('#printRoot').innerHTML(),'');
 await modalPage.close();
 console.log('Document-modal printing remains isolated and its temporary copy is removed.');
}finally{await browser.close();}
