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
  assert.match(landing,/class="ld-programme"/);assert.match(landing,/data:image\/jpeg;base64/);
  assert.match(landing,/data-act="goto-login"/);assert.match(landing,/data-act="goto-public"/);
  assert.ok(!landing.includes('id="beamGrad"'),'landing does not revert to the old topology illustration');
  for(const tab of ['signin','activate','request','forgot']){
    run(`LOGIN6.tab='${tab}'`);const html=run('renderLogin6()');
    assert.equal((html.match(/class="lg-tab /g)||[]).length,4,'all four access panels remain available');
    assert.equal((html.match(/class="lg-tab [^"]*" aria-pressed="true"/g)||[]).length,1);
    assert.ok(!html.includes('repeat(5'),'removed demo panel must not leave an empty fifth tab column');
    assert.match(html,/data-act="goto-landing"/);
    if(tab==='signin'){
      assert.match(html,/id="lg-device-label"[^>]*required/);
      assert.match(html,/id="lg-device-type"/);assert.match(html,/id="lg-device-note"/);
      assert.match(html,/Chief-approved device registration/);
    }
    for(const match of html.matchAll(/<label for="([^"]+)">/g)) assert.ok(html.includes(`id="${match[1]}"`),'label has an input: '+match[1]);
  }
}
// Builders and test loader share CSS order, including the entry-only layer.
const nodeBuilder=fs.readFileSync(path.join(root,'tools/sync-lovable.mjs'),'utf8');
const pythonBuilder=fs.readFileSync(path.join(root,'v6/build.py'),'utf8');
const parse=(text)=>text.match(/CSS_ORDER\s*=\s*\[([^\]]+)\]/)[1].match(/['"]([^'"]+)['"]/g).map(v=>v.slice(1,-1));
assert.deepEqual(parse(nodeBuilder),CSS_ORDER);assert.deepEqual(parse(pythonBuilder),CSS_ORDER);
assert.equal(CSS_ORDER.at(-1),'entry_theme.css','entry rules must win over legacy workspace rules');
const css=fs.readFileSync(path.join(root,'v6/src/entry_theme.css'),'utf8');
assert.match(css,/:focus-visible/);assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
assert.match(css,/\.lg6\[data-theme\] \.lg6-panel\{[\s\S]*?overflow:visible/);
assert.match(css,/\.lg6\[data-theme\] \.lg6-card\{[\s\S]*?background:#FFFFFF !important/);
assert.match(css,/\.lg6\[data-theme\] \.lg6-photo-frame \.lg6-photo-main\{[^}]*filter:none/);
const bundle=fs.readFileSync(path.join(root,'public/carelink-v6.html'),'utf8');
assert.ok(bundle.includes(css.trim()),'published HTML includes the new scoped stylesheet');
const adminCss=fs.readFileSync(path.join(root,'v6/src/admin_ops6.css'),'utf8').trim();
assert.ok(bundle.includes(adminCss));
assert.ok(bundle.indexOf(css.trim())>bundle.indexOf(adminCss),'entry layer follows administrative/workspace styles');
console.log('entry-refresh: light default, explicit/host/preview authority, read-only resolution, both identities, four labelled access panels, device controls and three synchronized CSS manifests passed');
