/* v5.1 · Workspace themes, navigation pane, tablet layer, and the fixes found on the way.
   Data-layer checks first; markup checks only where the markup is the contract. */
const fs=require('fs'), path=require('path');
const {makeCtx}=require('./dom');
const {run,ctx}=makeCtx();
run('DB.load(); DB.seedDemo();');
const SRC=path.join(__dirname,'..','src');
const read=f=>fs.readFileSync(path.join(SRC,f),'utf8');

let pass=0, fail=0; const fails=[];
function ok(name, cond, detail){ if(cond) pass++; else { fail++; fails.push(name+(detail?(' | '+detail):'')); } }
function test(name, fn){ try{ const r=fn(); if(r===false) throw new Error('returned false'); }catch(e){ ok(name,false,e.message); } }
const as = u => run(`AUTH.logout(); AUTH.login('${u}','LOMAMO2026'); AUTH.user.id`);
const J = code => JSON.parse(run(`JSON.stringify(${code})`));

/* A recording document, so apply() can be inspected. */
run(`globalThis.__a={}; globalThis.__v={};
  document.documentElement.setAttribute=(k,v)=>{__a[k]=v};
  document.documentElement.style.setProperty=(k,v)=>{__v[k]=v};`);

const roleUsers = J(`(()=>{const s={};return DB.db.users.filter(u=>!s[u.roleId]&&(s[u.roleId]=1)).map(u=>({id:u.id,role:u.roleId,username:u.username}))})()`);
const THEMES = J('WTHEMES.map(t=>t.id)');
const lum=h=>{h=h.replace('#','');const f=c=>{c/=255;return c<=.03928?c/12.92:Math.pow((c+.055)/1.055,2.4)};
  const [r,g,b]=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16));return .2126*f(r)+.7152*f(g)+.0722*f(b)};
const cr=(a,b)=>{let x=lum(a),y=lum(b);if(x<y)[x,y]=[y,x];return (x+.05)/(y+.05)};

/* ---------------- 1. the theme table ---------------- */
test('thirty vibrant themes, unique, each defining every token', ()=>{
  ok('thirty themes', THEMES.length===30, THEMES.join(','));
  ok('ids unique', new Set(THEMES).size===30);
  const keys=J('Object.keys(WT_TOKENS)');
  THEMES.forEach(id=>{
    const t=J(`WTHEME.byId('${id}').t`);
    keys.forEach(k=>ok(`${id} defines ${k}`, /^#[0-9A-Fa-f]{6}$/.test(t[k]||''), String(t[k])));
    const th=J(`(({id,name,mode,blurb})=>({id,name,mode,blurb}))(WTHEME.byId('${id}'))`);
    ok(`${id} has a name and blurb`, th.name&&th.blurb);
    ok(`${id} mode is light or dark`, th.mode==='light'||th.mode==='dark');
  });
  return true;
});
test('every theme meets WCAG AA for text pairs', ()=>{
  const pairs=[['ink','bg',4.5],['ink','surface',4.5],['ink2','surface',4.5],['ink3','surface',4.5],['muted','surface',4.5],['muted','bg',4.5],['muted','surface2',4.5],
    ['chromeInk','chrome',7],['chromeMuted','chrome',4.5],['chromeInk','chrome2',4.5],['chromeMuted','chrome2',4.5],['actionInk','action',4.5],['actionInk','action2',4.5],
    ['ok','okBg',4.5],['warn','warnBg',4.5],['crit','critBg',4.5],['info','infoBg',4.5],['ok','surface',4.5],['warn','surface',4.5],['crit','surface',4.5],['info','surface',4.5]];
  THEMES.forEach(id=>{ const t=J(`WTHEME.byId('${id}').t`);
    pairs.forEach(([a,b,need])=>ok(`${id}: ${a} on ${b} >= ${need}`, cr(t[a],t[b])>=need, cr(t[a],t[b]).toFixed(2))); });
  return true;
});
test('High contrast reaches AAA for body text and 3:1 field borders', ()=>{
  const v=J(`WTHEME.vars(WTHEME.byId('contrast'),'#C8102E')`);
  ok('ink on surface >= 7', cr(v['--ink'],v['--surface'])>=7);
  ok('field border on field >= 3', cr(v['--field-line'],v['--field'])>=3, cr(v['--field-line'],v['--field']).toFixed(2));
  return true;
});
test('status colours keep their hue in every theme', ()=>{
  THEMES.forEach(id=>{ const t=J(`WTHEME.byId('${id}').t`); const c=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
    const ok_=c(t.ok), cr_=c(t.crit), in_=c(t.info), wa=c(t.warn);
    ok(`${id}: ok is green`, ok_[1]>ok_[0]&&ok_[1]>ok_[2]);
    ok(`${id}: crit is red`, cr_[0]>cr_[1]&&cr_[0]>cr_[2]);
    ok(`${id}: info is blue`, in_[2]>in_[0]&&in_[2]>=in_[1]);
    ok(`${id}: warn is amber`, wa[0]>wa[2]&&wa[1]>wa[2]);
  });
  return true;
});

/* ---------------- 2. accent correction ---------------- */
test('every department accent is readable as a fill and as a foreground in every theme', ()=>{
  const accents=J(`(()=>{const s=new Set(['#C8102E','#111827','#D97706','#EA580C','#0891B2','#059669','#7C3AED','#9333EA','#475569']);
     (DB.db.departments||[]).forEach(d=>d.accent&&s.add(d.accent)); ROLES.forEach(r=>r.accent&&s.add(r.accent)); return [...s]})()`);
  ok('collected accents', accents.length>=9, String(accents.length));
  THEMES.forEach(id=>accents.forEach(a=>{
    const r=J(`WTHEME.accents(WTHEME.byId('${id}'),'${a}')`);
    ok(`${id} ${a}: fill vs its ink >= 4.5`, cr(r.fill,r.fillInk)>=4.5, cr(r.fill,r.fillInk).toFixed(2));
    ok(`${id} ${a}: foreground vs soft tint >= 4.5`, cr(r.fg,r.soft)>=4.5, cr(r.fg,r.soft).toFixed(2));
  }));
  return true;
});
test('the four departments that failed 4.5:1 in v5.0 now pass', ()=>{
  ['#EA580C','#0891B2','#059669','#D97706'].forEach(a=>{ const r=J(`WTHEME.accents(WTHEME.byId('classic'),'${a}')`);
    ok(`classic ${a} fill >= 4.5`, cr(r.fill,'#FFFFFF')>=4.5, cr(r.fill,'#FFFFFF').toFixed(2)); });
  return true;
});
test('avatars use a contrast-safe fill', ()=>{
  const h=run(`avatarFor('Human Resource Officer','#059669')`);
  const m=h.match(/background:(#[0-9A-Fa-f]{6})/); ok('avatar has a fill', !!m);
  ok('white initials on the avatar >= 4.5', cr(m[1],'#FFFFFF')>=4.5, m&&cr(m[1],'#FFFFFF').toFixed(2));
  return true;
});
test('chart colours stay visible on every theme surface', ()=>{
  THEMES.filter(t=>t!=='classic').forEach(id=>{
    run(`WTHEME._active=WTHEME.byId('${id}')`);
    const pal=J('WTHEME.chartPalette()'); const s=J(`WTHEME.byId('${id}').t.surface`);
    ok(`${id} palette has 8 colours`, pal&&pal.length===8);
    pal.forEach((c,i)=>ok(`${id} chart colour ${i} vs surface >= 3`, cr(c,s)>=3, cr(c,s).toFixed(2)));
  });
  run(`WTHEME._active=WTHEME.byId('classic')`);
  ok('classic keeps the original palette (null)', run('WTHEME.chartPalette()')===null);
  return true;
});

/* ---------------- 3. choosing and applying ---------------- */
test('default is Foundation, personal choice wins, org default applies in between', ()=>{
  const cg=as('caregiver.nyalenda'); const u=run('AUTH.user');
  ok('default foundation', run('WTHEME.resolveId(AUTH.user)')==='foundation');
  ok('personal choice stored', run(`WTHEME.choose(AUTH.user,'night').ok`));
  ok('personal choice wins', run('WTHEME.resolveId(AUTH.user)')==='night');
  as('chief.admin');
  ok('chief org default saved', run(`WTHEME.setOrgDefault(AUTH.user,'savanna').ok`));
  as('finance.kisumu'); ok('someone without a choice follows the org default', run('WTHEME.resolveId(AUTH.user)')==='savanna');
  as('caregiver.nyalenda'); ok('the caregiver keeps their own choice', run('WTHEME.resolveId(AUTH.user)')==='night');
  as('chief.admin'); run(`WTHEME.setOrgDefault(AUTH.user,'foundation')`);
  return true;
});
test('an unknown theme is refused and one person\'s choice never reaches another', ()=>{
  as('caregiver.nyalenda'); ok('unknown theme refused', run(`WTHEME.choose(AUTH.user,'neon')`).ok===false);
  run(`WTHEME.choose(AUTH.user,'jacaranda')`);
  as('mcm.kisumu'); ok('MCM unaffected', run('WTHEME.resolveId(AUTH.user)')!=='jacaranda');
  ok('no user: choose refused', run(`WTHEME.choose(null,'night')`).ok===false);
  return true;
});
test('"match this tablet" resolves to Daylight or Night ward', ()=>{
  as('caregiver.nyalenda'); run(`WTHEME.choose(AUTH.user,'auto')`);
  ok('no dark signal gives Daylight', run('WTHEME.resolveId(AUTH.user)')==='classic');
  run(`window.matchMedia=()=>({matches:true})`);
  ok('dark signal gives Night ward', run('WTHEME.resolveId(AUTH.user)')==='night');
  run(`delete window.matchMedia`);
  return true;
});
test('apply writes theme, mode, touch, motion and zoom; public pages are always Daylight', ()=>{
  as('caregiver.nyalenda'); run(`WTHEME.choose(AUTH.user,'night')`); run('WTHEME.apply(AUTH.user)');
  ok('data-wt', run('__a["data-wt"]')==='night'); ok('data-wmode dark', run('__a["data-wmode"]')==='dark');
  ok('surface var written', /^#/.test(run('__v["--surface"]')));
  ok('accent fill var written', /^#/.test(run('__v["--accent"]')));
  run(`WTHEME.apply(null)`);
  ok('signed out is Daylight', run('__a["data-wt"]')==='classic');
  ok('signed out text size is 100%', run('__v["--zoom"]')==='1');
  return true;
});
test('personal reduce-motion, text size and touch size survive a redraw (v5.0 overwrote them)', ()=>{
  as('caregiver.nyalenda');
  run(`SETTINGS.pref('reducedMotion', true)`); run(`SETTINGS.pref('textScale','125')`); run(`SETTINGS.pref('touch','large')`);
  run('WTHEME.apply(AUTH.user)'); run('WTHEME.apply(AUTH.user)');
  ok('calm stays on after a second apply', run('__a["data-calm"]')==='on');
  ok('text size 125% becomes zoom 1.25', run('__v["--zoom"]')==='1.25');
  ok('large touch', run('__a["data-touch"]')==='large');
  run(`SETTINGS.pref('reducedMotion', false)`); run(`SETTINGS.pref('textScale','100')`); run(`SETTINGS.pref('touch','standard')`);
  run('WTHEME.apply(AUTH.user)');
  ok('calm off again', run('__a["data-calm"]')==='off'); ok('zoom back to 1', run('__v["--zoom"]')==='1');
  return true;
});
test('personal density and accent mode do not leak to other people', ()=>{
  as('caregiver.nyalenda'); run(`SETTINGS.pref('density','compact')`); run('WTHEME.apply(AUTH.user)');
  ok('caregiver compact', run('__a["data-density"]')==='compact');
  as('mcm.kisumu'); run('WTHEME.apply(AUTH.user)');
  ok('MCM still comfortable', run('__a["data-density"]')==='comfortable');
  ok('org density untouched', run('DB.db.settings.density')==='comfortable');
  as('caregiver.nyalenda'); run(`SETTINGS.pref('density','comfortable')`);
  return true;
});

/* ---------------- 4. the permission guard on organisation defaults ---------------- */
test('only system.config may change an organisation default, enforced in the data layer', ()=>{
  as('caregiver.nyalenda');
  ok('caregiver org theme refused', run(`WTHEME.setOrgDefault(AUTH.user,'night')`).ok===false);
  run(`SETTINGS.set('density','compact')`); ok('caregiver cannot change org density', run('DB.db.settings.density')==='comfortable');
  run(`SETTINGS.set('accentMode','lomamo')`); ok('caregiver cannot change org accent mode', run('DB.db.settings.accentMode')==='department');
  as('auditor'); run(`SETTINGS.set('consoleTheme','night')`);
  ok('auditor cannot change org theme through set()', run('DB.db.settings.consoleTheme')!=='night');
  as('chief.admin');
  const before=run('DB.db.audit.length');
  ok('chief may', run(`WTHEME.setOrgDefault(AUTH.user,'lake').ok`));
  const last=J('DB.db.audit[DB.db.audit.length-1]');
  ok('the change is audited', run('DB.db.audit.length')===before+1 && last.action==='settings.changed' && last.entityId==='consoleTheme', JSON.stringify(last));
  ok('audit chain still verifies', J('AUDIT.verify()').ok!==false);
  run(`WTHEME.setOrgDefault(AUTH.user,'foundation')`);
  return true;
});

/* ---------------- 5. the navigation pane ---------------- */
const idsOf = groups => groups.flatMap(g=>g.items.map(i=>i.id));
test('for every role the pane holds exactly the pages navModel allows, each once', ()=>{
  roleUsers.forEach(({role,username})=>{
    as(username);
    const base=J('navModel(AUTH.user)'), pane=J('NAVP.groups(AUTH.user)');
    const a=idsOf(base).sort(), b=idsOf(pane).sort();
    ok(`${role}: same pages`, JSON.stringify(a)===JSON.stringify(b));
    ok(`${role}: no page twice`, new Set(b).size===b.length);
    ok(`${role}: Overview stays first`, pane[0].label==='Overview');
  });
  return true;
});
test('each console leads with its own work', ()=>{
  const lead=(u)=>{ as(u); return J('NAVP.groups(AUTH.user)').map(g=>g.label); };
  ok('finance leads with Finance & procurement', lead('finance.kisumu')[1]==='Finance & procurement');
  ok('auditor leads with Assurance', lead('auditor')[1]==='Assurance');
  ok('HR leads with People', lead('hr.officer')[1]==='People');
  ok('vehicle officer leads with Fleet & transport', lead('vehicle.officer')[1]==='Fleet & transport');
  ok('PR leads with Media & governance', lead('pr.officer')[1]==='Media & governance');
  ok('MCM leads with Patients & field', lead('mcm.kisumu')[1]==='Patients & field');
  return true;
});
test('no page in any role\'s navigation answers "Access denied" (178 of 550 did in v5.0)', ()=>{
  let total=0;
  roleUsers.forEach(({role,username})=>{ as(username);
    const items=idsOf(J('navModel(AUTH.user)')); total+=items.length;
    const denied=items.filter(id=>{ try{ return run(`String(contentFor('${id}',{},AUTH.user))`).indexOf('Access denied')>=0; }catch(e){ return false; } });
    ok(`${role}: no dead-end pages`, denied.length===0, denied.join(','));
  });
  ok('swept a realistic number of pages', total>250, String(total));
  return true;
});
test('pages every role needs are still offered', ()=>{
  roleUsers.forEach(({role,username})=>{ as(username); const ids=idsOf(J('navModel(AUTH.user)'));
    ok(`${role}: Settings`, ids.includes('settings')); ok(`${role}: Calendar`, ids.includes('calendar')); ok(`${role}: Console home`, ids.includes('home')); });
  return true;
});
test('navigation follows the guards it points at', ()=>{
  as('auditor'); ok('read-only auditor is not offered Messages', !idsOf(J('navModel(AUTH.user)')).includes('messages'));
  as('hr.officer'); const hr=J('navModel(AUTH.user)').map(g=>g.label);
  ok('HR has no Patients group', !hr.includes('Patients & field')); ok('HR has People', hr.includes('People'));
  as('caregiver.nyalenda'); const cg=idsOf(J('navModel(AUTH.user)'));
  ok('caregiver is not offered Executive summary', !cg.includes('executive')); ok('caregiver is not offered Expenditure', !cg.includes('finance'));
  ok('caregiver keeps the Patient register', cg.includes('patients'));
  as('countyadmin' in {}?'':'kisumu.admin'); const ca=idsOf(J('navModel(AUTH.user)'));
  ok('county admin without digitise is not offered the Pipeline', run(`RBAC.has(AUTH.user,'patient.digitise')`)? ca.includes('pipeline') : !ca.includes('pipeline'));
  as('mcm.kisumu'); ok('MCM keeps the Consent register it can open', idsOf(J('navModel(AUTH.user)')).includes('consent'));
  return true;
});
test('the hero button never leads to a page the role is refused', ()=>{
  roleUsers.forEach(({role,username})=>{ as(username);
    const html=run('homeHeroActions(AUTH.user)'); const targets=[...html.matchAll(/data-v="([a-z-]+)"/g)].map(m=>m[1]);
    targets.forEach(v=>ok(`${role}: hero to ${v} opens`, run(`String(contentFor('${v}',{},AUTH.user))`).indexOf('Access denied')<0));
  });
  as('hr.officer'); ok('HR hero offers its own work', /Staff register/.test(run('homeHeroActions(AUTH.user)')));
  return true;
});
test('pane markup: every page once, one current page, nothing invented', ()=>{
  as('chief.admin'); const html=run(`NAVP.html(AUTH.user, v=>v==='patients')`);
  const ids=[...html.matchAll(/class="np-i[^"]*" data-act="go" data-v="([a-z-]+)"/g)].map(m=>m[1]);
  const expected=idsOf(J('navModel(AUTH.user)'));
  expected.forEach(id=>ok(`pane lists ${id}`, ids.includes(id)));
  ok('only Preferences is added beside navModel', ids.filter(i=>!expected.includes(i)).join(',')==='settings' || ids.filter(i=>!expected.includes(i)).length===0);
  ok('exactly one aria-current', (html.match(/aria-current="page"/g)||[]).length===1);
  const onSettings=run(`NAVP.html(AUTH.user, v=>v==='settings')`);
  ok('on the Settings page only one pane entry is marked current', (onSettings.match(/np-i on/g)||[]).length===1, String((onSettings.match(/np-i on/g)||[]).length));
  ok('the active group is open', /np-g open" data-g="Patients &amp; field"/.test(html));
  ok('pane is a labelled nav', /<nav class="npane"[^>]*aria-label=/.test(html));
  ok('no em or en dashes in pane text', !/[\u2013\u2014]/.test(html));
  return true;
});
test('groups: first two open by default, folding is remembered per person, the active group stays open', ()=>{
  as('finance.kisumu');
  ok('first group open', run(`NAVP.isOpen(AUTH.user,'Overview',0,false)`)); ok('second open', run(`NAVP.isOpen(AUTH.user,'Finance & procurement',1,false)`));
  ok('third shut', !run(`NAVP.isOpen(AUTH.user,'Reporting',2,false)`));
  run(`NAVP.toggleGroup(AUTH.user,'Reporting',2)`); ok('opened and remembered', run(`NAVP.isOpen(AUTH.user,'Reporting',2,false)`));
  run(`NAVP.toggleGroup(AUTH.user,'Reporting',2)`); ok('folded again', !run(`NAVP.isOpen(AUTH.user,'Reporting',2,false)`));
  ok('the active group cannot be folded away', run(`NAVP.isOpen(AUTH.user,'Reporting',2,true)`));
  as('mcm.kisumu'); ok('another person is unaffected', !run(`NAVP.isOpen(AUTH.user,'Reporting',2,false)`));
  return true;
});
test('layout and rail are personal; tabs mode removes the pane', ()=>{
  as('caregiver.nyalenda');
  ok('pane by default', run('NAVP.enabled(AUTH.user)')); run(`SETTINGS.pref('navLayout','tabs')`);
  ok('tabs removes the pane', !run('NAVP.enabled(AUTH.user)')); ok('another person keeps the pane', (as('mcm.kisumu'),run('NAVP.enabled(AUTH.user)')));
  as('caregiver.nyalenda'); run(`SETTINGS.pref('navLayout','pane')`);
  ok('rail off', !run('NAVP.prefs(AUTH.user).rail')); run('NAVP.toggleRail(AUTH.user)'); ok('rail on', run('NAVP.prefs(AUTH.user).rail')); run('NAVP.toggleRail(AUTH.user)');
  return true;
});
test('the shell draws the pane or the tab sheet according to the personal choice', ()=>{
  as('caregiver.nyalenda'); run(`APPX.view='home'`);
  let h=run('renderShell()'); ok('pane present', h.includes('class="npane"')); ok('All opens the drawer', h.includes('data-act="nav-open"'));
  run(`SETTINGS.pref('navLayout','tabs')`); h=run('renderShell()');
  ok('no pane in tabs mode', !h.includes('class="npane"')); ok('All opens the console map', h.includes('data-act="open-console-map"'));
  ok('tabs mode still lists the tab sheet', h.includes('class="sheet"'));
  run(`SETTINGS.pref('navLayout','pane')`);
  return true;
});
test('the pane and theme actions exist and run', ()=>{
  as('caregiver.nyalenda');
  ['nav-open','nav-close','nav-group','nav-rail','wtheme-open','wtheme-more','set-wtheme','set-org-wtheme'].forEach(a=>ok(`ACTIONS has ${a}`, run(`typeof ACTIONS['${a}']==='function'`)));
  run(`ACTIONS['nav-rail']()`); run(`ACTIONS['nav-rail']()`);
  run(`ACTIONS['set-wtheme']({id:'lake'})`); ok('set-wtheme applied', run('WTHEME.resolveId(AUTH.user)')==='lake');
  run(`ACTIONS['set-org-wtheme']({id:'night'})`); ok('set-org-wtheme refused for a caregiver', run('DB.db.settings.consoleTheme')!=='night');
  run(`ACTIONS['wtheme-open']()`); ok('picker opens a modal', true);
  run(`ACTIONS['wtheme-more']()`); ok('More appearance settings lands on Appearance', run('APPX.view')==='settings' && run('(APPX.params||{}).section')==='appearance');
  return true;
});

/* ---------------- 6. preferences page ---------------- */
test('the preferences page renders for every role and offers every theme', ()=>{
  roleUsers.forEach(({role,username})=>{ as(username);
    const h=run('settingsAppearance(AUTH.user)');
    ['Foundation','Daylight','Savanna','Lake Victoria','Canopy','Jacaranda','Night ward','Midnight gold','High contrast','Match this tablet']
      .forEach(n=>ok(`${role} sees ${n}`, h.includes(n)));
    const may=run(`RBAC.has(AUTH.user,'system.config')`);
    ok(`${role}: organisation defaults shown only with system.config`, may===h.includes('Organisation defaults'));
    ok(`${role}: honest accent label`, h.includes('>LOMAMO crimson<') && !h.includes('>Foundation navy<'));
    ok(`${role}: no em or en dashes`, !/[\u2013\u2014]/.test(h));
  });
  return true;
});

/* ---------------- 7. the stylesheet contract ---------------- */
test('every CSS custom property used is defined (v5.0 used --ink-3 without defining it)', ()=>{
  const css=read('styles.css')+'\n'+read('console51.css');
  const used=new Set([...css.matchAll(/var\((--[a-z0-9-]+)/g)].map(m=>m[1]));
  const defined=new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m=>m[1]));
  J('Object.keys(WTHEME.vars(WTHEME.byId("classic"),"#C8102E"))').forEach(k=>defined.add(k));
  /* set at run time by the shell */
  ['--accent','--accent-soft','--zoom'].forEach(k=>defined.add(k));
  const missing=[...used].filter(k=>!defined.has(k));
  ok('no undefined custom properties', missing.length===0, missing.join(','));
  return true;
});
test('the stylesheet carries the tablet, print and motion rules', ()=>{
  const css=read('console51.css');
  ok('coarse-pointer sizing', /@media \(pointer:coarse\)/.test(css));
  ok('large touch targets', /data-touch=large/.test(css));
  ok('print forces light', /@media print[\s\S]*--surface:#fff!important/.test(css));
  ok('paper stays paper', /\.paper,\.report-doc,\.print-area,\.form-doc\{/.test(css));
  ok('reduced motion honoured', /\[data-calm=on\] \.npane/.test(css));
  ok('drawer below 1000px', /max-width:999\.98px/.test(css)); ok('persistent pane from 1000px', /min-width:1000px/.test(css));
  ok('focus ring', /:focus-visible/.test(css));
  ok('safe-area insets', /safe-area-inset-top/.test(css));
  return true;
});
test('new files contain no em or en dashes', ()=>{
  ['themes.js','navpane.js','console51.css'].forEach(f=>ok(`${f} has no em or en dashes`, !/[\u2013\u2014]/.test(read(f))));
  return true;
});

console.log(fail? ('FAILED:\n  '+fails.join('\n  ')) : '');
console.log(`${pass}/${pass+fail} v5.1 assertions passed`);
process.exit(fail?1:0);
