/* Role navigation and scrollport regression checks; no patient data fixtures. */
const assert = require('assert');
const fs = require('fs');
const {makeCtx} = require('./dom');
const {run} = makeCtx();
run('DB.load(); DB.seedDemo()');
const audit = JSON.parse(run(`JSON.stringify((()=>{
  const errors=[];
  const required={patients:'patient.list',finance:'finance.view',staff:'hr.view',pharmacy:'pharmacy.view',
    clinicalmcm:'clinical.mcm',media:'media.view',vehicles:'vehicle.view',users:'user.view',
    devconsole:'dev.console',care:'care.view',cccdesk:'ccc.desk',govdashboard:'gov.oversight'};
  for(const u of DB.db.users){
    const groups=navModel(u), items=groups.flatMap(g=>g.items), ids=items.map(i=>i.id);
    if(new Set(ids).size!==ids.length) errors.push(u.roleId+': duplicate destination');
    if(!ids.includes('home')) errors.push(u.roleId+': no home');
    for(const i of items){ if(required[i.id] && !RBAC.can(u,required[i.id]).ok) errors.push(u.roleId+': '+i.id+' without '+required[i.id]); }
    if(JSON.stringify(NAVP.groups(u).flatMap(g=>g.items.map(i=>i.id)).sort())!==JSON.stringify([...ids].sort())) errors.push(u.roleId+': pane does not match authorised navigation');
  }
  const chief=DB.db.users.find(u=>u.roleId==='chief');
  const ids=navModel(chief).flatMap(g=>g.items.map(i=>i.id));
  const blocked=['patients','visits','pdca','pharmacy','care','reports','analytics','finance','staff','vehicles','inventory','adminops'];
  for(const id of blocked) if(ids.includes(id)) errors.push('chief default includes '+id);
  for(const id of ['home','devconsole','users','devices','roles','import','health','backup','settings']) if(!ids.includes(id)) errors.push('chief missing '+id);
  const granted={...chief,permOverrides:{grant:['finance.view'],deny:[]}};
  const revoked={...chief,permOverrides:{grant:[],deny:['finance.view']}};
  return {errors, roles:[...new Set(DB.db.users.map(u=>u.roleId))].length,
    grant:navModel(granted).flatMap(g=>g.items).some(i=>i.id==='finance'),
    revoked:navModel(revoked).flatMap(g=>g.items).some(i=>i.id==='finance')};
})())`));
assert.deepStrictEqual(audit.errors, []);
assert.ok(audit.roles >= 20, 'all seeded account role types audited');
assert.ok(audit.grant && !audit.revoked, 'exceptional authorised grants still surface');

// Exercise actual scrollport logic with measured rectangles, not a presumed
// #content scroller: desktop and mobile each have different scrolling roots.
run(`globalThis.__scroll=[];
  globalThis.__content={getBoundingClientRect:()=>({top:420})};
  globalThis.__bar={getBoundingClientRect:()=>({height:70})};
  globalThis.__shell={scrollTop:100,getBoundingClientRect:()=>({top:20}),scrollTo:o=>__scroll.push(o.top)};
  document.querySelector=s=>s==='#content'?__content:s==='.app.shell.has-pane'?__shell:s==='.topbar.cbar'?__bar:null;
  globalThis.getComputedStyle=e=>({position:e===__bar?'sticky':'relative',overflowY:e===__shell?'auto':'visible'});
  revealWorkspace('devices'); revealWorkspace('home');`);
assert.deepStrictEqual(JSON.parse(run('JSON.stringify(__scroll)')), [430,430]);
run(`__scroll=[];document.querySelector=s=>s==='#content'?__content:s==='.topbar.cbar'?__bar:null;
  window.scrollY=50;window.scrollTo=o=>__scroll.push(o.top);revealWorkspace('patients');revealWorkspace('home');`);
assert.deepStrictEqual(JSON.parse(run('JSON.stringify(__scroll)')), [400,400]);
const care=fs.readFileSync('v6/src/views_care.js','utf8');
const css=fs.readFileSync('v6/src/entry_theme.css','utf8');
assert.ok(care.includes('msg-person-copy') && care.includes('msg-person-actions') && care.includes('msg-pane-actions'));
assert.match(css,/\.msg-layout \.msg-side\{display:flex/);
assert.match(css,/\.shell-role-banner \.ws67-hero\.ctx-strip\{width:100%/);
console.log(`Workspace audit passed across ${audit.roles} seeded role types; scroll roots and message layout checked.`);
// Keyboard and pointer navigation land on the selected workspace, including
// Home; background renders do not call this navigation-only helper.
run(`globalThis.__focused=0;globalThis.__tabIndex='';
 __content.focus=o=>{if(o.preventScroll)__focused++;};
 __content.setAttribute=(k,v)=>{if(k==='tabindex')__tabIndex=v;};
 revealWorkspace('forms');`);
assert.equal(run('__focused'),1);
assert.equal(run('__tabIndex'),'-1');
assert.match(fs.readFileSync('v6/src/app.js','utf8'),/priorContent!==document.querySelector\('#content'\)/);
/* The dist iframe must bust the shell with the CURRENT version, not a release
   tag frozen at the time this check was written. Read the version from
   package.json and assert App.tsx agrees with it: a hardcoded tag here is how
   the iframe ended up serving ?v=6.9.4 while the app was on 6.11.x. */
const pkgVersion = JSON.parse(fs.readFileSync('package.json','utf8')).version;
assert.match(fs.readFileSync('src/App.tsx','utf8'), new RegExp('\\?v=' + pkgVersion.replace(/\./g,'\\.')),
  'src/App.tsx must load the shell with ?v=' + pkgVersion);
assert.match(fs.readFileSync('vite.config.ts','utf8'), new RegExp("v=" + pkgVersion.replace(/\./g,'\\.')),
  'the dist redirect stub must redirect to ?v=' + pkgVersion);
assert.match(fs.readFileSync('public/index.html','utf8'), new RegExp("\\?v=" + pkgVersion.replace(/\./g,'\\.')),
  'the public entry page must open ?v=' + pkgVersion);
console.log('Workspace focus, replacement-content reveal and release refresh checks passed.');
