/* Public-entry defaults and layout contract. All state is an in-memory fixture;
   no production API, account or patient workbook is read by this regression. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {makeCtx}=require('./dom');
const {CSS_ORDER}=require('./modules');
const root=path.join(__dirname,'../..');
const {run}=makeCtx();
const reset=()=>run('DB.db=DB.blank();APPX.host=null;LOGIN6.tab="signin";');
reset();
assert.equal(run('DEFAULT_THEME'),'clinic');
assert.equal(run('DB.db.settings.landingTheme'),'clinic');
assert.equal(run("ENTRY_THEME.tokens('clinic').bg"),'#FFFFFF','the default stays white-led, not a new dark theme');
assert.equal(run('landingTheme().id'),'clinic');
assert.deepEqual(JSON.parse(run('JSON.stringify(ENTRY_THEMES.map(t=>t.id))')),['clinic','heritage']);

const cases=[
  {name:'old implicit charcoal is not a Chief choice',settings:{uiEpoch:691,landingTheme:'heritage'},expected:'clinic'},
  {name:'explicit legacy dark choice survives',settings:{landingTheme:'heritage',landingThemeExplicit:true},expected:'heritage'},
  {name:'explicit legacy light choice survives',settings:{landingTheme:'clinic',landingThemeExplicit:true},expected:'clinic'},
  {name:'shared dark config survives without a legacy flag',settings:{system:{config:{entryTheme:'heritage'}}},expected:'heritage'},
  {name:'shared config outranks a stale browser preference',settings:{landingTheme:'heritage',landingThemeExplicit:true,system:{config:{entryTheme:'clinic'}}},expected:'clinic'},
  {name:'retired theme falls back safely',settings:{landingTheme:'canopy',landingThemeExplicit:true},expected:'clinic'},
  {name:'invalid config can retain a valid explicit legacy choice',settings:{landingTheme:'heritage',landingThemeExplicit:true,system:{config:{entryTheme:'canopy'}}},expected:'heritage'}
];
for(const test of cases){
  reset();run(`DB.db.settings=${JSON.stringify(test.settings)}`);
  const before=run('JSON.stringify(DB.db)');
  assert.equal(run('landingTheme().id'),test.expected,test.name);
  for(const render of ['renderLanding6()','renderLogin6()']) assert.match(run(render),new RegExp(`data-theme="${test.expected}"`),test.name);
  assert.equal(run('JSON.stringify(DB.db)'),before,'resolving/rendering a default is not a config write');
  run('DB.migrate()');assert.equal(run('landingTheme().id'),test.expected,'migration: '+test.name);
}
reset();
run('APPX.host={landingTheme:"heritage"};DB.db.settings.system={config:{entryTheme:"clinic"}};');
assert.equal(run('landingTheme().id'),'heritage','public host authority outranks a device cache');
run('ENTRY_THEME.previewId="clinic";');
assert.equal(run('landingTheme().id'),'clinic','ephemeral Chief preview can preview the other identity');
run('ENTRY_THEME.previewId=null;');assert.equal(run('landingTheme().id'),'heritage');

for(const theme of ['clinic','heritage']){
  reset();run(`APPX.host={setup:true,globallyActivated:true,landingTheme:'${theme}'};DB.db.settings.globallyActivated=true;`);
  const landing=run('renderLanding6()');
  const diagram=run('renderLandingWorkflow6()');
  assert.match(landing,/class="ld-workflow" aria-labelledby="ld-workflow-heading"/);
  assert.ok(landing.includes(diagram),'the original departmental workflow, not a photograph, occupies the hero');
  assert.ok(!landing.includes('class="ld-programme"'));
  assert.match(diagram,/class="ld-scene-svg" role="img" aria-labelledby="ld-workflow-title" aria-describedby="ld-workflow-desc"/);
  assert.match(diagram,/<title id="ld-workflow-title">CareLink system workflow<\/title>/);
  assert.equal((diagram.match(/<line /g)||[]).length,8,'all eight original connections are restored');
  assert.deepEqual([...diagram.matchAll(/data-workflow-node="([^"]+)"/g)].map(m=>m[1].replaceAll('&amp;','&')),
    ['Administration','Field Care','Hospital','Transport','Media & IT','Homestay','Procurement','Finance']);
  assert.match(diagram,/class="ld-workflow-core-name">CareLink<\/text>/);
  assert.ok(!diagram.includes('<image'),'the vector graphic works offline without external images');
  assert.equal((diagram.match(/data-tone="red"/g)||[]).length,4,'red remains the leading department accent');
  assert.deepEqual([...new Set([...diagram.matchAll(/data-tone="([^"]+)"/g)].map(m=>m[1]))],['red','teal','gold','blue']);
  assert.match(diagram,/class="ld-workflow-halo"/,'the red core has a visible accent ring');
  assert.match(landing,/<div class="ld-hero-art">/,'the informative diagram is not hidden from assistive technology');
  assert.match(landing,/data-act="goto-login"/);assert.match(landing,/data-act="goto-public"/);
  assert.match(landing,/--entry-relief-surface:#232323/);
  assert.match(landing,/--entry-relief-footer:#171717/);
  for(const tab of ['signin','activate','request','forgot']){
    run(`LOGIN6.tab='${tab}'`);const html=run('renderLogin6()');
    assert.equal((html.match(/class="lg-tab /g)||[]).length,4,'all four access panels remain available');
    assert.equal((html.match(/class="lg-tab [^"]*" aria-pressed="true"/g)||[]).length,1);
    assert.ok(!html.includes('repeat(5'),'removed demo panel must not leave an empty fifth tab column');
    assert.match(html,/data-act="goto-landing"/);
    assert.match(html,new RegExp('data-access="'+tab+'"'),'responsive styles identify the active access panel without changing admission');
    if(tab==='signin'){
      assert.doesNotMatch(html,/name="deviceLabel"|name="deviceType"/);
      assert.match(html,/id="lg-device-note"/);
      assert.match(html,/Secure access/);
    }
    for(const match of html.matchAll(/<label for="([^"]+)">/g)) assert.ok(html.includes(`id="${match[1]}"`),'label has an input: '+match[1]);
  }
}
// Builders and test loader share CSS order, including the entry-only layer.
const nodeBuilder=fs.readFileSync(path.join(root,'tools/sync-lovable.mjs'),'utf8');
const pythonBuilder=fs.readFileSync(path.join(root,'v6/build.py'),'utf8');
const parse=(text)=>text.match(/CSS_ORDER\s*=\s*\[([^\]]+)\]/)[1].match(/['"]([^'"]+)['"]/g).map(v=>v.slice(1,-1));
assert.deepEqual(parse(nodeBuilder),CSS_ORDER);assert.deepEqual(parse(pythonBuilder),CSS_ORDER);
/* entry_theme.css must still be the last *entry* layer, so its public-page
   rules win over the legacy workspace sheets. tab_ink.css is the one sheet
   allowed after it, and only because it is the single owner of a selected
   control's fill AND ink - the fix for labels disappearing on filled tabs. It
   must itself be last, so nothing can repaint half of that pair. */
/* The tail of the cascade, last to first, is fixed by what each layer must be
   able to outrank:
     tab_ink.css      the single owner of a selected control's fill AND ink;
     console_head7.css the console head, corner tab and scrolling banner;
     entry_theme.css  the public entry pages over the legacy workspace rules. */
assert.deepEqual(CSS_ORDER.slice(-3),['entry_theme.css','console_head7.css','tab_ink.css'],
  'the last three layers must be entry, console head, tab ink');
assert.ok(CSS_ORDER.indexOf('entry_theme.css') > CSS_ORDER.indexOf('carelink63.css'),
  'entry rules must still win over legacy workspace rules');
assert.ok(CSS_ORDER.indexOf('console_head7.css') > CSS_ORDER.indexOf('entry_theme.css'),
  'the console head must be able to override the foundation geometry');
assert.equal(CSS_ORDER.at(-1),'tab_ink.css','tab ink layer must win over every legacy workspace rule');
const css=fs.readFileSync(path.join(root,'v6/src/entry_theme.css'),'utf8');
assert.match(css,/\.ld\[data-front="1"\] \.ld-canvas-card\{[^}]*background:var\(--entry-relief-surface\)/);
assert.match(css,/\.ld\[data-front="1"\] \.ld-foot\{[^}]*background:var\(--entry-relief-footer\)/);
assert.match(css,/:focus-visible/);assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
assert.match(css,/\.lg6\[data-theme\] \.lg6-panel\{[\s\S]*?overflow:visible !important/);
assert.match(css,/@media\(min-width:700px\) and \(min-height:700px\), \(min-width:921px\) and \(min-height:600px\)\{[\s\S]*?height:100dvh !important/,'the final entry layer restores viewport-fitted desktop and short-laptop shells');
assert.match(css,/\.ld\[data-front="1"\] \.ld-workflow-links\{stroke:var\(--entry-relief-red\)/);
assert.match(css,/\.ld\[data-front="1"\] \.ld-workflow-core circle\{fill:#B31C2B/);
assert.match(css,/\.lg6\[data-theme\] \.lg-host\.ok\{background:#EAF5F1/);
assert.match(css,/\.lg6\[data-theme\] \.lg-device-note\{[^}]*background:#FFF6E5/);
assert.match(css,/\.lg6\[data-theme\] \.lg6-card\{[\s\S]*?background:#FFFFFF !important/);
assert.match(css,/\.lg6\[data-theme\] \.lg6-photo-frame \.lg6-photo-main\{[^}]*filter:none/);
const bundle=fs.readFileSync(path.join(root,'public/carelink-v6.html'),'utf8');
assert.ok(bundle.includes(css.trim()),'published HTML includes the new scoped stylesheet');
const adminCss=fs.readFileSync(path.join(root,'v6/src/admin_ops6.css'),'utf8').trim();
assert.ok(bundle.includes(adminCss));
assert.ok(bundle.indexOf(css.trim())>bundle.indexOf(adminCss),'entry layer follows administrative/workspace styles');
console.log('entry-refresh: light default, explicit/host/preview authority, read-only resolution, accessible eight-department red-led workflow, white-led coloured relief, viewport-fit shells without clipped forms, both identities, four labelled access panels, browser access notice and three synchronized CSS manifests passed');
