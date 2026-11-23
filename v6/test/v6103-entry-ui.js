const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {makeCtx}=require('./dom');
(async()=>{
  const {run,nodes}=makeCtx();
  run(`DB.db=DB.blank();seedOfficial(DB.db,new Date('2026-11-22T00:00:00Z'),{patients:24});AUTH.user=DB.db.users.find(u=>u.roleId==='chief');AUTH.session={started:todayISO(),last:Date.now()};`);
  assert.equal(run('ENTRY_THEMES.length'),2);
  assert.equal(run('LANDING_THEMES===ENTRY_THEMES'),true);
  const metrics=JSON.parse(run('JSON.stringify(ENTRY_THEMES.map(t=>({id:t.id,pairs:ENTRY_THEME.measurements(t.id)})))'));
  for(const {id,pairs} of metrics) for(const pair of pairs) assert.ok(pair.ratio>=4.5,`${id}: ${pair.label} = ${pair.ratio}`);
  // PR #35 bounded easing used to miss near-threshold red/grey badge pairs.
  assert.ok(run("WTC.contrast(WTHEME.badgeOnFill('#D9D9D9',WTHEME.safeFill('#EE0000')),WTHEME.safeFill('#EE0000'))")>=4.5);
  await assert.rejects(run("ENTRY_THEME.apply('clinic')"),/Preview/);
  const before=run('JSON.stringify(DB.db)');
  for(const page of ['landing','signin']){
    run(`ACTIONS['preview-theme']({id:'clinic',page:'${page}'})`);
    const html=nodes[nodes.length-1].innerHTML;
    assert.match(html,/data-theme="clinic"/);
    assert.match(html,/Apply to landing &amp; sign-in/);
    assert.match(html,/4\.53:1/);
    assert.match(html,/ inert>/,'previewed login controls are inert, not a second live login form');
    assert.equal(run('JSON.stringify(DB.db)'),before,'preview never writes system.config or an audit event');
    assert.equal(run('ENTRY_THEME.previewId'),null,'preview scope is cleared even after rendering');
  }
  await run("ENTRY_THEME.apply('clinic')");
  assert.equal(run('DB.db.settings.system.config.entryTheme'),'clinic');
  assert.equal(run("DB.db.audit.some(e=>e.action==='system.config_changed')"),true);
  assert.match(run('renderLanding6()'),/data-theme="clinic"/);
  assert.match(run('renderLogin6()'),/class="lg6" data-theme="clinic"/);
  // Neither trial nor the main site asks for label/type; browser approval remains mandatory.
  run("APPX.host={trialMode:true,mode:'isolated-synthetic-trial',setup:true,rev:1};LOGIN6.tab='signin'");
  assert.match(run('renderLogin6()'),/TEAM TRIAL · SYNTHETIC DATA ONLY/);
  assert.doesNotMatch(run('renderLogin6()'),/name="deviceLabel"|name="deviceType"/);
  assert.match(run('renderLogin6()'),/Chief-approved device registration required/);
  assert.doesNotMatch(run('renderLogin6()'),/Reset pre-activation setup/);
  assert.match(run('renderLanding6()'),/Never enter real patient/);
  assert.match(run("workspaceHeroBanner('home',AUTH.user)"),/TEAM TRIAL · SYNTHETIC DATA ONLY/);
  run("APPX.host={setup:true,mode:'online-site-db'}");
  assert.doesNotMatch(run('renderLogin6()'),/name="deviceLabel"|name="deviceType"/);
  assert.match(run('renderLogin6()'),/Chief-approved device registration required/);
  run('APPX.host=null');
  run("AUTH.user=DB.db.users.find(u=>u.roleId==='caregiver')");
  await assert.rejects(run("ENTRY_THEME.apply('heritage')"),/Only the Chief/);
  assert.ok(!run('settingsLanding(AUTH.user,true)').includes('data-act="preview-theme"'),'non-Chief users cannot see apply/preview controls even with org.manage');
  // Use the actual event router: first icon tap expands without navigation;
  // unrelated redraw, scroll restoration and group browsing do not collapse it.
  run(`AUTH.user=DB.db.users.find(u=>u.roleId==='chief');APPX.view='home';
    DB.db.personalPrefs[AUTH.user.id]={navRail:true,navAutoFold:true,navRailExplicit:true};
    window.innerWidth=1366;NAVP._tempOpen=false;NAVP._workspaceEngaged=false;
    render=()=>{};
    globalThis.__navButton={dataset:{act:'go',v:'reports'},closest(selector){return selector==='#npane'?{}:null}};
    globalThis.__navEvent={target:{closest(selector){return selector==='[data-act]'?__navButton:null}},preventDefault(){}};
    onClick(__navEvent);`);
  assert.equal(run('NAVP._tempOpen'),true);
  assert.equal(run('APPX.view'),'home','first tap must not click through to the hidden navigation destination');
  assert.equal(run('NAVP.effectiveRail(AUTH.user,APPX.view)'),false,'temporary expansion takes priority over a stored folded-rail preference');
  run("NAVP.foldForWorkspace('scroll');NAVP.toggleGroup(AUTH.user,'System',0);render();");
  assert.equal(run('NAVP.effectiveRail(AUTH.user,APPX.view)'),false,'expansion holds across programmatic scroll restoration and group redraw');
  run('onClick(__navEvent)');
  assert.equal(run('APPX.view'),'reports');
  assert.equal(run('NAVP._tempOpen'),false);
  assert.equal(run('NAVP.effectiveRail(AUTH.user,APPX.view)'),true,'actual navigation collapses the rail');
  run("NAVP.expandTemporarily();NAVP._hoveringPane=false;NAVP.foldForWorkspace('workspace-pointerdown');");
  assert.equal(run('NAVP.effectiveRail(AUTH.user,APPX.view)'),true,'deliberate engagement with the right workspace collapses it');
  // No local commissioning or data entry is allowed on the retired host.
  run(`location.hostname='theqwengacfs.github.io';location.replace=url=>{globalThis.__redirect=url};`);
  assert.equal(run('CANONICAL_HOST.enforce()'),true);
  assert.equal(run('__redirect'),'https://care-link-dims-dev-three.vercel.app/');
  assert.match(run("document.querySelector('#root').innerHTML"),/Do not commission/);
  assert.equal(run("CANONICAL_HOST.isRetired('care-link-dims-dev-three.vercel.app')"),false);
  const root=path.join(__dirname,'../..');
  assert.match(fs.readFileSync(path.join(root,'index.html'),'utf8'),/location\.hostname === 'theqwengacfs\.github\.io'/);
  assert.match(fs.readFileSync(path.join(root,'v6/src/app.js'),'utf8'),/CANONICAL_HOST\.enforce\(\).*return;[\s\S]*?DB\.load\(\)/);
  // A late confidential response cannot cross logout/re-login, even when the
  // same Chief username returns before the request finishes.
  {
    const {run:admin}=makeCtx();
    admin(`DB.db=DB.blank();seedOfficial(DB.db,new Date('2026-11-22T00:00:00Z'),{patients:1});AUTH.user=DB.db.users.find(u=>u.roleId==='chief');SYNC.available=()=>true;SYNC.sessionToken='fixture-session';SYNC._json=()=>new Promise(resolve=>{globalThis.__reply=resolve});`);
    const pending=admin("ENTRY_ADMIN.request('staff-accounts')");
    admin(`ENTRY_ADMIN.clear();__reply({ok:true,body:{rows:[{temporaryPassword:'must-not-be-retained'}]}});`);
    await assert.rejects(pending,/session changed/);
    assert.equal(admin('ENTRY_ADMIN.rows.length'),0);
    admin(`globalThis.__downloaded=false;SYNC._json=async()=>({ok:false,body:{error:'audit unavailable'}});`);
    assert.equal(await admin("PROD_SETUP.deliverExport('csv',[{username:'director'}],()=>{__downloaded=true})"),false);
    assert.equal(admin('__downloaded'),false,'no confidential handoff when its audit cannot be saved');
  }
  // A server config acknowledgement must not masquerade as a full snapshot:
  // held work keeps its revision, and a clean workspace refreshes explicitly.
  {
    const {run:config}=makeCtx();
    config(`DB.db=DB.blank();seedOfficial(DB.db,new Date('2026-11-22T00:00:00Z'),{patients:1});AUTH.user=DB.db.users.find(u=>u.roleId==='chief');SYNC.available=()=>true;SYNC.sessionToken='fixture-session';SYNC.rev=41;APPX.dirty=true;
      DB.db.settings.system={retainedMetadata:'kept',config:{entryTheme:'heritage',temporaryPasswordDays:7}};ENTRY_THEME.previewed.add('clinic');
      SYNC._json=async()=>({ok:true,body:{ok:true,rev:42,config:{entryTheme:'clinic',temporaryPasswordDays:7}}});globalThis.__pulled=0;SYNC.pullFull=async options=>{__pulled=options.minRev;SYNC.rev=42;return true};SYNC.heldOutbox=()=>null;`);
    await config("ENTRY_THEME.apply('clinic')");
    assert.equal(config('SYNC.rev'),41,'do not skip revisions over held edits');
    assert.equal(config('__pulled'),0);
    assert.equal(config('DB.db.settings.system.retainedMetadata'),'kept');
    config('APPX.dirty=false');
    await config("ENTRY_THEME.apply('clinic')");
    assert.equal(config('__pulled'),42,'a clean workspace adopts the authoritative snapshot before advancing');
    config('ENTRY_ADMIN.clear()');
    assert.equal(config('ENTRY_THEME.previewed.size'),0,'preview consent cannot survive a Chief session change');
  }
  // Directory download must use the server roster, never raw DB.users mail or
  // a person added by a browser. Unconfirmed real seats remain visibly so.
  {
    const {run:directory}=makeCtx();
    directory(`DB.db=DB.blank();seedOfficial(DB.db,new Date('2026-11-22T00:00:00Z'),{patients:1});AUTH.user=DB.db.users.find(u=>u.roleId==='chief');DB.db.settings.globallyActivated=true;SYNC.available=()=>true;
      DB.db.users.push({username:'invented.person',name:'Browser Invented',email:'guessed@lomamofoundation.org'});
      ENTRY_ADMIN.request=async()=>({rows:[{username:'director',name:'Actual roster label',roleId:'director',email:'confirmed@lomamofoundation.org',mailboxConfirmed:true},{username:'president',name:'Unconfirmed seat label',roleId:'president',unconfirmed:true,email:'guessed@lomamofoundation.org',mailboxConfirmed:false}]});
      PROD_SETUP.deliverExport=(_format,_rows,deliver)=>deliver();globalThis.__directory='';download=(_name,text)=>{__directory=text};`);
    await directory('PROD_SETUP.downloadRoleDirectory()');
    const text=directory('__directory');
    assert.match(text,/confirmed@lomamofoundation\.org/);
    assert.match(text,/Unconfirmed seat label \[unconfirmed seat\]/);
    assert.ok(!text.includes('guessed@')&&!text.includes('Browser Invented'),'unattested addresses and non-roster people are never exported');
  }
  console.log('entry-ui: two measured themes; preview → audited apply; Chief-only controls; expand → hold → collapse; canonical-host guard; confidential-response and directory guards passed');
  console.log(metrics.map(t=>`  ${t.id}: minimum ${Math.min(...t.pairs.map(p=>p.ratio)).toFixed(2)}:1 (${t.pairs.length} text/badge pairs)`).join('\n'));
})().catch(error=>{console.error(error);process.exitCode=1});
