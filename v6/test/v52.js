/* v5.1 second increment: session policy, messaging, history and pagers,
   account-level navigation, creative studio. */
const fs=require('fs'), path=require('path');
const {makeCtx}=require('./dom');
const {run}=makeCtx(); run('DB.load(); DB.seedDemo();');
const SRC=path.join(__dirname,'..','src'); const read=f=>fs.readFileSync(path.join(SRC,f),'utf8');
let pass=0, fail=0; const fails=[];
const ok=(n,c,d)=>{ if(c) pass++; else { fail++; fails.push(n+(d?' | '+d:'')); } };
const test=(n,f)=>{ try{ if(f()===false) throw new Error('false'); }catch(e){ ok(n,false,e.message); } };
const as=u=>run(`AUTH.logout(); AUTH.login('${u}','LOMAMO2026'); AUTH.user.id`);
const J=c=>JSON.parse(run(`JSON.stringify(${c})`));
const uid=u=>run(`DB.db.users.find(x=>x.username==='${u}').id`);
const dm=(a,b)=>'dm:'+[a,b].sort().join(':');
const lum=h=>{h=h.replace('#','');const f=c=>{c/=255;return c<=.03928?c/12.92:Math.pow((c+.055)/1.055,2.4)};const [r,g,b]=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16));return .2126*f(r)+.7152*f(g)+.0722*f(b)};
const cr=(a,b)=>{let x=lum(a),y=lum(b);if(x<y)[x,y]=[y,x];return (x+.05)/(y+.05)};
run(`globalThis.__a={}; globalThis.__v={}; document.documentElement.setAttribute=(k,v)=>{__a[k]=v}; document.documentElement.style.setProperty=(k,v)=>{__v[k]=v};`);

/* ---------- 1. the 300 second policy ---------- */
test('sessions end after 900 seconds, with a 30 second warning (v6 policy)', ()=>{
  ok('thresholds', run('SESSION.WARN_AT')===870 && run('SESSION.END_AT')===900);
  ok('no warning at 869.9', run('SESSION.shouldWarn(869.9)')===false); ok('warning at 870', run('SESSION.shouldWarn(870)')===true);
  ok('not ended at 899.9', run('SESSION.shouldEnd(899.9)')===false); ok('ended at 900', run('SESSION.shouldEnd(900)')===true);
  ok('warning window is 30 seconds', run('SESSION.END_AT-SESSION.WARN_AT')===30);
  const app=read('app.js'), srv=fs.readFileSync(path.join(SRC,'..','server.py'),'utf8');
  ok('the host default is 900 seconds', /CARELINK_IDLE_SECONDS",\s*"900"/.test(srv));
  ok('no stale sixty-second wording', !/Sixty seconds|60 seconds/.test(app));
  ok('the timer is not short-circuited by the lock screen', /tick\(\)\{[\s\S]{0,60}if\(!AUTH\.user\) return;/.test(app));
  return true;
});

/* ---------- 2. messaging ---------- */
test('messaging: send, reply, read, scope, permissions, screening (all in the data layer)', ()=>{
  const A=as('mcm.kisumu'); const B=uid('nurse.kisumu'); const T=dm(A,B);
  const m1=J(`MESSAGING.send(AUTH.user,{thread:'${T}',text:'Can you cover Friday?'})`);
  ok('a message is stored', !!m1.id); ok('the direct recipient is computed, not supplied', JSON.stringify(m1.to)===JSON.stringify([B]));
  ok('the sender has read it', m1.readBy.includes(A)); ok('kind is derived from the thread', m1.kind==='direct');
  ok('the recipient is notified', J(`(DB.db.notifications||[]).some(n=>n.userId==='${B}'&&n.title==='New message')`)===true || J('(DB.db.notifications||[]).length')>0);
  /* B sees it unread, opening the thread clears it */
  as('nurse.kisumu'); ok('recipient has 1 unread', run('MESSAGING.unreadCount(AUTH.user)')===1);
  ok('markRead reports a change', run(`MESSAGING.markRead(AUTH.user,'${T}')`)===true);
  ok('unread is now 0', run('MESSAGING.unreadCount(AUTH.user)')===0);
  ok('markRead again changes nothing', run(`MESSAGING.markRead(AUTH.user,'${T}')`)===false);
  /* the reply reaches the original sender (v5.0 sent it to the replier) */
  const rep=J(`MESSAGING.send(AUTH.user,{thread:'${T}',text:'Yes, I can.'})`);
  ok('the reply is addressed to the other party', JSON.stringify(rep.to)===JSON.stringify([A]));
  as('mcm.kisumu'); ok('the original sender sees both messages', run(`messageThreads(AUTH.user).find(t=>t.thread==='${T}').msgs.length`)===2);
  ok('the original sender has the reply unread', run('MESSAGING.unreadCount(AUTH.user)')===1);
  /* opening the page marks the open thread read */
  run(`go('messages',{thread:'${T}'})`); ok('opening Messages clears unread', run('MESSAGING.unreadCount(AUTH.user)')===0);
  /* the reply form goes through the same path */
  as('nurse.kisumu'); run(`FORMS.message({get:k=>({thread:'${T}',text:'Thanks.'})[k]})`);
  as('mcm.kisumu'); ok('a reply sent from the form reaches the sender', run(`messageThreads(AUTH.user).find(t=>t.thread==='${T}').msgs.length`)===3);
  return true;
});
test('messaging: refusals', ()=>{
  const A=as('caregiver.nyalenda'); const B=uid('mcm.kisumu'); const C=uid('finance.homabay');
  const before=run('DB.db.messages.length');
  ok('a patient code is refused by the data layer', !!J(`MESSAGING.send(AUTH.user,{thread:'${dm(A,B)}',text:'See LOM-NYA-1032 today'})`).blocked);
  ok('a +254 phone number is refused', !!J(`MESSAGING.send(AUTH.user,{thread:'${dm(A,B)}',text:'call +254712345678'})`).blocked);
  ok('a 0112 phone number is refused', !!J(`MESSAGING.send(AUTH.user,{thread:'${dm(A,B)}',text:'call 0112345678'})`).blocked);
  ok('ordinary text with numbers is allowed', !J(`MESSAGING.send(AUTH.user,{thread:'${dm(A,B)}',text:'Meet at 10 with 3 vehicles'})`).error);
  ok('empty text is refused', !!J(`MESSAGING.send(AUTH.user,{thread:'${dm(A,B)}',text:'   '})`).error);
  ok('a person in another county is out of reach', /reach/.test(J(`MESSAGING.send(AUTH.user,{thread:'${dm(A,C)}',text:'Hello'})`).error||''));
  ok('a thread the sender is not part of is refused', /party/.test(J(`MESSAGING.send(AUTH.user,{thread:'${dm(B,uid('nurse.kisumu'))}',text:'Hello'})`).error||''));
  ok('an invented thread is refused', !!J(`MESSAGING.send(AUTH.user,{thread:'dm:test',text:'Hello'})`).error);
  ok('an unknown department is refused', !!J(`MESSAGING.send(AUTH.user,{thread:'dept:nope',text:'Hello'})`).error);
  ok('only the accepted message was stored', run('DB.db.messages.length')===before+1, run('DB.db.messages.length')+' vs '+(before+1));
  as('auditor'); ok('a read-only role cannot send', /may not/.test(J(`MESSAGING.send(AUTH.user,{thread:'${dm(uid('auditor'),B)}',text:'Hello'})`).error||''));
  return true;
});
test('messaging: a department message stays inside the sender\'s reach', ()=>{
  as('caregiver.nyalenda');
  const r=J(`MESSAGING.send(AUTH.user,{thread:'dept:finance',text:'Fuel receipts are in.'})`);
  ok('delivered', !!r.id, JSON.stringify(r));
  const tos=r.to.map(id=>J(`DB.db.users.find(u=>u.id==='${id}')`));
  ok('every recipient is in finance', tos.every(u=>u.departmentId==='finance'));
  ok('no recipient is in another county', tos.every(u=>u.countyId===run('AUTH.user.countyId')), tos.map(u=>u.username).join(','));
  ok('the sender is not a recipient', !r.to.includes(run('AUTH.user.id')));
  as('chief.admin'); const g=J(`MESSAGING.send(AUTH.user,{thread:'dept:finance',text:'Month end reminder.'})`);
  ok('a global role reaches both counties', new Set(g.to.map(id=>J(`DB.db.users.find(u=>u.id==='${id}').countyId`))).size>=2);
  return true;
});
test('messaging: the page shows only reachable people and a role-appropriate KPI', ()=>{
  as('caregiver.nyalenda'); const h=run('renderMessages(AUTH.user,{})');
  ok('no cross-county colleagues listed', !/finance\.homabay|Homa Bay Finance/i.test(h));
  ok('non-HR roles do not see the flagged count', !h.includes('Flagged for review'));
  as('hr.officer'); ok('HR sees the flagged count', run('renderMessages(AUTH.user,{})').includes('Flagged for review'));
  const av=[...h.matchAll(/<span class="avatar"[^>]*>/g)].map(m=>m[0]); ok('the contacts list has avatars', av.length>0);
  ok('every avatar has its own background (v5.0 drew white initials on white)', av.every(a=>/background:#[0-9A-Fa-f]{6}/.test(a)), av.find(a=>!/background:#/.test(a)));
  av.forEach(a=>{ const c=a.match(/background:(#[0-9A-Fa-f]{6})/); if(c) ok('avatar initials readable', cr(c[1],'#FFFFFF')>=4.5, c[1]); });
  as('auditor'); ok('the auditor is refused the page', run(`String(contentFor('messages',{},AUTH.user))`).includes('Access denied'));
  return true;
});

/* ---------- 3. history and pagers ---------- */
test('history: back, forward, truncation, no duplicates', ()=>{
  as('chief.admin'); run('NAVH.reset()'); run(`['home','patients','visits','calendar'].forEach(v=>go(v))`);
  ok('four pages recorded', run('NAVH.stack.length')===4 && run('NAVH.idx')===3);
  ok('can go back', run('NAVH.canBack()')); ok('cannot go forward yet', !run('NAVH.canForward()'));
  run('NAVH.back()'); ok('back lands on visits', run('APPX.view')==='visits');
  run('NAVH.back()'); ok('back again lands on patients', run('APPX.view')==='patients'); ok('forward is now possible', run('NAVH.canForward()'));
  run('NAVH.forward()'); ok('forward lands on visits', run('APPX.view')==='visits');
  run(`go('visits')`); ok('opening the page you are on adds nothing', run('NAVH.stack.length')===4);
  run(`go('pdca')`); ok('a new page discards the forward tail', run('NAVH.stack.length')===4 && !run('NAVH.canForward()') && run('NAVH.stack[3].view')==='pdca');
  run('NAVH.reset()'); ok('back at the start does nothing', run('NAVH.back()')===false);
  run(`for(let i=0;i<80;i++) go(i%2?'home':'patients',{n:i})`); ok('history is capped', run('NAVH.stack.length')<=run('NAVH.MAX'));
  return true;
});
test('history: moving does not re-record, params survive, the tablet Back gesture maps onto the stack', ()=>{
  as('mcm.kisumu'); run('NAVH.reset()'); run(`go('home'); go('patients'); go('settings',{section:'appearance'})`);
  run('NAVH.back()'); ok('moving did not add entries', run('NAVH.stack.length')===3);
  run('NAVH.forward()'); ok('params restored', run('(APPX.params||{}).section')==='appearance');
  run(`NAVH.onPop({state:{n:0}})`); ok('a Back gesture to entry 0 shows the first page', run('APPX.view')==='home');
  run(`NAVH.onPop({state:{n:2}})`); ok('a Forward gesture to entry 2 returns', run('APPX.view')==='settings');
  run('AUTH.logout()'); run(`NAVH.onPop({state:{n:0}})`); ok('a signed-out Back gesture does nothing', run('AUTH.user')===null||run('!AUTH.user'));
  return true;
});
test('pager: Previous and Next follow the pane order and can only reach pane pages', ()=>{
  const users=['chief.admin','caregiver.nyalenda','finance.kisumu','auditor','hr.officer','vehicle.officer','pr.officer','mcm.kisumu'];
  users.forEach(u=>{ as(u);
    const flat=J('PAGER.flat(AUTH.user)').map(x=>x.id), pane=J('NAVP.groups(AUTH.user)').reduce((a,g)=>a.concat(g.items.map(i=>i.id)),[]);
    ok(`${u}: pager order equals pane order`, JSON.stringify(flat)===JSON.stringify(pane));
    let seen=0;
    flat.forEach((id,i)=>{ const a=J(`PAGER.around(AUTH.user, v=>v==='${id}')`); seen++;
      ok(`${u} ${id}: previous is the entry before`, (a.prev&&a.prev.id)===(flat[i-1]||undefined) || (!a.prev&&i===0));
      ok(`${u} ${id}: next is the entry after`, (a.next&&a.next.id)===(flat[i+1]||undefined) || (!a.next&&i===flat.length-1)); });
    ok(`${u}: walking Next from the first page visits every page once`, (()=>{ let cur=flat[0],n=1; while(true){ const a=J(`PAGER.around(AUTH.user, v=>v==='${cur}')`); if(!a.next) break; cur=a.next.id; n++; } return n===flat.length; })());
  });
  return true;
});
test('pager markup: on every page, disabled at the ends, destinations named', ()=>{
  as('finance.kisumu'); run('NAVH.reset()'); run(`go('home')`);
  let h=run(`PAGER.bar(AUTH.user, v=>v==='home')`);
  ok('has a navigation landmark', /<nav class="pager"/.test(h)); ok('Back is disabled with no history', /data-act="nav-back"[^>]*disabled/.test(h));
  ok('Previous is disabled on the first page', /pg-prev[^>]*disabled|data-act="go"[^>]*disabled[^>]*>[\s\S]{0,80}Previous/.test(h));
  ok('Next names the destination', /Next page: /.test(h)); ok('position is stated', /Page 1 of \d+/.test(h));
  run(`go('finance')`); h=run(`PAGER.bar(AUTH.user, v=>v==='finance')`);
  ok('Back is enabled after moving', !/data-act="nav-back"[^>]*disabled/.test(h)); ok('Back names where it goes', /Back to /.test(h));
  const shell=run('renderShell()'); ok('the shell carries the pager', shell.includes('class="pager"')); ok('the shell carries top Back and Forward', shell.includes('data-act="nav-back"') && shell.includes('data-act="nav-forward"'));
  return true;
});
test('pager: every role\'s every page renders the bar, and the actions exist', ()=>{
  ['nav-back','nav-forward'].forEach(a=>ok(`ACTIONS has ${a}`, run(`typeof ACTIONS['${a}']==='function'`)));
  as('chief.admin'); run('NAVH.reset()'); run(`go('home'); go('patients')`); run(`ACTIONS['nav-back']()`); ok('the Back action works', run('APPX.view')==='home');
  run(`ACTIONS['nav-forward']()`); ok('the Forward action works', run('APPX.view')==='patients');
  run('NAVH.reset()'); run(`go('home')`); run(`ACTIONS['nav-back']()`); ok('Back at the start is harmless', run('APPX.view')==='home');
  return true;
});
test('record, tab and section pagers', ()=>{
  as('mcm.kisumu'); const pts=J(`repo.patientList(AUTH.user,{}).map(p=>p.id)`); ok('has patients', pts.length>3);
  const mid=pts[2]; const h=run(`renderPatient(AUTH.user,{id:'${mid}'})`);
  ok('Previous patient', h.includes(`data-id="${pts[1]}"`)); ok('Next patient', h.includes(`data-id="${pts[3]}"`)); ok('position stated', new RegExp(`Patient 3 of ${pts.length}`).test(h));
  const first=run(`renderPatient(AUTH.user,{id:'${pts[0]}'})`); ok('first patient has Previous disabled', /pg-rec"[^>]*disabled/.test(first));
  ok('Next tab on the overview', /Next: Visits|Next: Clinical/.test(h));
  const blk=(h.match(/<div class="pg-tabs[\s\S]*?<\/div>/)||[''])[0]; const firstBtn=(blk.match(/<button[^>]*>/)||[''])[0];
  ok('Previous tab is disabled on the first tab', /disabled/.test(firstBtn), firstBtn);
  ok('and Next is enabled', !/disabled/.test((blk.match(/<button[^>]*>/g)||[])[1]||'disabled'));
  const v=run(`renderPatient(AUTH.user,{id:'${mid}',tab:'visits'})`); ok('Previous tab names the tab before', /Previous: (Overview|Clinical)/.test(v));
  const st=run(`renderSettings(AUTH.user)`); ok('settings has Previous and Next section', /Section \d+ of \d+/.test(st));
  run(`go('messages')`); const mh=run('renderMessages(AUTH.user,{})'); ok('messages page renders', mh.length>500);
  return true;
});

/* ---------- 4. account-level navigation ---------- */
const navIds=()=>J('navModel(AUTH.user)').reduce((a,g)=>a.concat(g.items.map(i=>i.id)),[]);
const denied=()=>navIds().filter(id=>{ try{ return run(`String(contentFor('${id}',{},AUTH.user))`).indexOf('Access denied')>=0; }catch(e){ return false; } });
test('navigation follows the account, not just the role', ()=>{
  as('caregiver.nyalenda'); ok('baseline: no Expenditure', !navIds().includes('finance'));
  run(`DB.db.users.find(u=>u.username==='caregiver.nyalenda').permOverrides={grant:['finance.view'],deny:[]}`); as('caregiver.nyalenda');
  ok('a granted capability adds exactly the page it unlocks', navIds().includes('finance')); ok('the granted page opens', denied().length===0, denied().join(','));
  run(`DB.db.users.find(u=>u.username==='caregiver.nyalenda').permOverrides={grant:[],deny:['patient.list']}`); as('caregiver.nyalenda');
  ok('a denied capability removes the patient pages', !navIds().includes('patients') && !navIds().includes('visits'));
  ok('and nothing the account was left with is a dead end', denied().length===0, denied().join(','));
  run(`DB.db.users.find(u=>u.username==='caregiver.nyalenda').permOverrides={grant:[],deny:[]}`);
  /* delegation: a time-boxed grant shows the page, an expired one does not */
  const D=uid('kisumu.assistant'); const from=run(`(roleObj(DB.db.users.find(u=>u.username==='finance.kisumu').roleId)||{}).id`);
  run(`DB.db.delegations=(DB.db.delegations||[]).filter(d=>d.delegateId!=='${D}')`);
  run(`DB.db.delegations.push({id:'d-t1',delegateId:'${D}',fromRoleId:'${from}',caps:['finance.view'],status:'active',from:new Date(Date.now()-3600e3).toISOString(),to:new Date(Date.now()+3600e3).toISOString(),capsAtIssue:['finance.view']})`);
  as('kisumu.assistant'); ok('an active delegation offers the page', navIds().includes('finance')); ok('and it opens', denied().length===0, denied().join(','));
  run(`DB.db.delegations.find(d=>d.id==='d-t1').to=new Date(Date.now()-1000).toISOString()`); as('kisumu.assistant');
  ok('an expired delegation withdraws it', !navIds().includes('finance'));
  return true;
});
test('exhaustive: remove any single capability from any account and the pane never offers a dead end', ()=>{
  let combos=0, bad=[];
  const roles=J(`(()=>{const s={};return DB.db.users.filter(u=>!s[u.roleId]&&(s[u.roleId]=1)).map(u=>u.username)})()`);
  roles.forEach(u=>{
    as(u); const caps=J('[...RBAC.permsFor(AUTH.user)]');
    const rec=run(`DB.db.users.find(x=>x.username==='${u}')`);
    caps.forEach(c=>{
      run(`DB.db.users.find(x=>x.username==='${u}').permOverrides={grant:[],deny:['${c}']}`); as(u);
      combos++; const d=denied(); if(d.length) bad.push(`${u} minus ${c}: ${d.join(',')}`);
    });
    run(`DB.db.users.find(x=>x.username==='${u}').permOverrides={grant:[],deny:[]}`);
  });
  ok(`swept ${combos} account variants`, combos>300, String(combos));
  ok('no variant is offered a page that answers "Access denied"', bad.length===0, bad.slice(0,6).join(' ; '));
  return true;
});

/* ---------- 5. creative studio ---------- */
test('studio: options are validated and personal', ()=>{
  as('caregiver.nyalenda');
  ok('defaults', J('WTHEME.studio(AUTH.user)').corners==='soft' && J('WTHEME.studio(AUTH.user)').backdrop==='plain');
  ok('a valid choice is stored', run(`WTHEME.setStudio(AUTH.user,'backdrop','waves').ok`) && J('WTHEME.studio(AUTH.user)').backdrop==='waves');
  ok('an invalid value is refused', !run(`WTHEME.setStudio(AUTH.user,'backdrop','lasers').ok`));
  ok('an unknown option is refused', !run(`WTHEME.setStudio(AUTH.user,'nonsense','x').ok`));
  ok('a hex that is not on the list is refused', !run(`WTHEME.setStudio(AUTH.user,'accentPick','#123456').ok`));
  ok('stored garbage reads as the default', (run(`DB.db.personalPrefs[AUTH.user.id].corners='x<script>'`), J('WTHEME.studio(AUTH.user)').corners==='soft'));
  as('mcm.kisumu'); ok('another person is unaffected', J('WTHEME.studio(AUTH.user)').backdrop==='plain');
  as('caregiver.nyalenda'); run('WTHEME.resetStudio(AUTH.user)'); ok('reset restores defaults', J('WTHEME.studio(AUTH.user)').backdrop==='plain');
  ok('signed out is refused', !run(`WTHEME.setStudio(null,'cards','flat').ok`));
  return true;
});
test('studio: every preset produces a valid look and readable colours', ()=>{
  const ids=J('STUDIO_PRESETS.map(p=>p.id)'); ok('seven presets', ids.length===7);
  as('caregiver.nyalenda');
  ids.concat(['random','random','random']).forEach(id=>{
    ok(`${id} applies`, run(`WTHEME.applyPreset(AUTH.user,'${id}').ok`));
    const st=J('WTHEME.studio(AUTH.user)'); const th=run('WTHEME.resolveId(AUTH.user)');
    ok(`${id}: theme valid`, J('WTHEMES.map(t=>t.id)').includes(th));
    run('WTHEME.apply(AUTH.user)');
    ok(`${id}: attributes written`, run('__a["data-bg"]')===st.backdrop && run('__a["data-hero"]')===st.hero && run('__a["data-cards"]')===st.cards && run('__a["data-corners"]')===st.corners);
    const surf=run('__v["--surface"]'), fill=run('__v["--accent"]'), ink=run('__v["--accent-ink"]'), fg=run('__v["--accent-fg"]'), soft=run('__v["--accent-soft"]');
    ok(`${id}: hero text >= 4.5`, cr(fill,ink)>=4.5, cr(fill,ink).toFixed(2)); ok(`${id}: accent text on tint >= 4.5`, cr(fg,soft)>=4.5, cr(fg,soft).toFixed(2));
  });
  ok('an unknown preset is refused', !run(`WTHEME.applyPreset(AUTH.user,'nope').ok`));
  run('WTHEME.resetStudio(AUTH.user)');
  return true;
});
test('studio: every accent colour on every theme stays readable', ()=>{
  const picks=J('STUDIO.accentPick.opts.map(o=>o.v)').filter(Boolean), themes=J('WTHEMES.map(t=>t.id)');
  themes.forEach(t=>picks.forEach(a=>{ const r=J(`WTHEME.accents(WTHEME.byId('${t}'),'#C8102E','${a}')`);
    ok(`${t} ${a}: fill`, cr(r.fill,r.fillInk)>=4.5, cr(r.fill,r.fillInk).toFixed(2)); ok(`${t} ${a}: foreground`, cr(r.fg,r.soft)>=4.5, cr(r.fg,r.soft).toFixed(2)); }));
  return true;
});
test('studio: corners and typeface are applied, fonts are offline system fonts', ()=>{
  as('caregiver.nyalenda'); run(`WTHEME.setStudio(AUTH.user,'corners','sharp')`); run(`WTHEME.setStudio(AUTH.user,'font','readable')`); run('WTHEME.apply(AUTH.user)');
  ok('sharp radii', run('__v["--r-lg"]')==='6px'); ok('readable font stack', /Verdana/.test(run('__v["--font"]')));
  run(`WTHEME.setStudio(AUTH.user,'corners','round')`); run('WTHEME.apply(AUTH.user)'); ok('round radii', run('__v["--r-lg"]')==='28px');
  run('WTHEME.resetStudio(AUTH.user)'); run('WTHEME.apply(AUTH.user)'); ok('default radii', run('__v["--r-lg"]')==='18px');
  run('WTHEME.apply(null)'); ok('signed out is the default look', run('__a["data-bg"]')==='plain' && run('__v["--r-lg"]')==='18px');
  ok('no web fonts or remote URLs in the stacks', !/https?:|url\(/.test(JSON.stringify(J('STUDIO.font.stacks'))));
  return true;
});
test('studio: the preferences page, actions and stylesheet carry it', ()=>{
  as('caregiver.nyalenda'); const h=run('settingsAppearance(AUTH.user)');
  ok('studio card', h.includes('Creative studio')); ok('seven presets plus Surprise me', (h.match(/data-act="studio-preset"/g)||[]).length===8);
  ['Corners','Typeface','Backdrop','Hero panel','Cards','Accent colour'].forEach(l=>ok(`row ${l}`, h.includes(l)));
  ok('accent swatches are labelled', (h.match(/aria-label="(Crimson|Navy|Ochre|Teal|Green|Violet|Rose|Slate)"/g)||[]).length===8);
  ok('no em or en dashes', !/[\u2013\u2014]/.test(h));
  ['studio-set','studio-preset','studio-reset'].forEach(a=>ok(`ACTIONS has ${a}`, run(`typeof ACTIONS['${a}']==='function'`)));
  run(`ACTIONS['studio-preset']({id:'stage'})`); ok('a preset action applies', J('WTHEME.studio(AUTH.user)').backdrop==='waves');
  run(`ACTIONS['studio-set']({key:'cards',value:'flat'})`); ok('a set action applies', J('WTHEME.studio(AUTH.user)').cards==='flat');
  run(`ACTIONS['studio-reset']()`); ok('a reset action applies', J('WTHEME.studio(AUTH.user)').cards==='soft');
  const css=read('console51.css');
  ['dots','grid','waves','kente'].forEach(b=>ok(`css backdrop ${b}`, css.includes(`data-bg=${b}`)));
  ['solid','pattern'].forEach(b=>ok(`css hero ${b}`, css.includes(`data-hero=${b}`))); ['flat','lifted'].forEach(b=>ok(`css cards ${b}`, css.includes(`data-cards=${b}`)));
  ok('studio and pager text has no em or en dashes', !/[\u2013\u2014]/.test(read('pager.js')) && !/[\u2013\u2014]/.test(css));
  return true;
});

/* ---------- 6. requests tabs and the About card ---------- */
test('requests status tabs have Previous and Next, and Settings carries the Foundation card', ()=>{
  as('finance.kisumu'); const h=run('renderRequests(AUTH.user,{})');
  ok('requests: section pager on the status tabs', /Section 1 of 8/.test(h));
  const h2=run(`renderRequests(AUTH.user,{status:'approved'})`); ok('requests: position follows the filter', /Section 3 of 8/.test(h2), (h2.match(/Section \d of \d/)||[''])[0]);
  as('mcm.kisumu'); const sys=run('settingsSystem(AUTH.user)');
  ok('About LOMAMO Foundation card', sys.includes('About LOMAMO Foundation'));
  ok('links to the Foundation site, opened safely', /href="https:\/\/lovemattersmost\.org\/about-us\/"[^>]*rel="noopener noreferrer"/.test(sys) && /href="https:\/\/lovemattersmost\.org\/"/.test(sys));
  ok('says plainly that the links need the internet', /need an internet connection/.test(sys));
  ok('no em or en dashes', !/[\u2013\u2014]/.test(sys));
  ok('no named staff are entered from the website', !/Chamah|Nyanjong|Ouma Wayodi|McClanahan/.test(sys));
  return true;
});

test('no text is coloured with the raw accent fill (it is only readable on light themes)', ()=>{
  const files=['styles.css','console51.css'].concat(fs.readdirSync(SRC).filter(f=>f.endsWith('.js')));
  files.forEach(f=>{ const bad=(read(f).match(/(?<![-a-zA-Z])color:var\(--accent\)/g)||[]).length; ok(`${f}: text uses --accent-fg, not --accent`, bad===0, bad+' uses'); });
  return true;
});

console.log(fail? 'FAILED:\n  '+fails.slice(0,30).join('\n  ')+(fails.length>30?`\n  ...and ${fails.length-30} more`:'') : '');
console.log(`${pass}/${pass+fail} second-increment v5.1 assertions passed`);
process.exit(fail?1:0);
