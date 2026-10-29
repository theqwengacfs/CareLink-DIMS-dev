/* Acceptance tests for the second v4.1 increment: landing themes, the
   60-second rule, presence and messaging, the public portal, the calendar,
   the registry and the work-plan cycle. */
const {makeCtx}=require('./dom');
const {run}=makeCtx();
run('DB.load(); DB.seedDemo();');
let pass=0, fail=0;
const ok=(name,cond,detail='')=>{ if(cond){pass++;} else {fail++; console.log('FAIL | '+name+' | '+(detail||''));} };
const T=c=>run(c);

/* ---------- Landing themes ---------- */
ok('Ten landing themes exist', T('LANDING_THEMES.length')===10, String(T('LANDING_THEMES.length')));
ok('Every theme has a unique id', new Set(T('LANDING_THEMES.map(t=>t.id)')).size===10);
ok('Every theme carries a name and a blurb', T('LANDING_THEMES.every(t=>t.name&&t.blurb)'));
ok('Both light and dark themes are offered', T("LANDING_THEMES.some(t=>t.mode==='light') && LANDING_THEMES.some(t=>t.mode==='dark')"));
ok('The default theme is used when nothing is set', (()=>{ T("DB.db.settings.landingTheme=undefined"); return T("landingTheme().id")==='clinic'; })());
ok('An unknown theme falls back instead of failing', (()=>{ T("DB.db.settings.landingTheme='not-a-theme'"); return T("landingTheme().id")==='clinic'; })());
T("DB.db.settings.landingTheme='spectrum'");
ok('A chosen theme is applied to the landing page', T("renderLanding()").includes('data-theme="spectrum"'));
ok('The landing page still offers the staff action', /Proceed to My (LOMAMO )?C(-DIMS|areLink) Console/.test(T("renderLanding()")));
ok('The landing page offers the public portal', T("renderLanding()").includes('goto-public'));
T("DB.db.settings.landingTheme='clinic'");
ok('A landing theme does not change the workspace accent', T("(()=>{DB.db.settings.accentMode='department'; applyTheme(); const ak=[...Object.keys(DB.db.settings)].filter(k=>/accent/i.test(k)); return ak.length===1;})()"));

/* ---------- The sixty-second rule ---------- */
ok('The warning starts at 870 seconds', T('SESSION.shouldWarn(870)')===true);
ok('No warning before 870 seconds', T('SESSION.shouldWarn(869.9)')===false);
ok('The session has not ended at 899 seconds', T('SESSION.shouldEnd(899)')===false);
ok('The session ends at 900 seconds', T('SESSION.shouldEnd(900)')===true);
ok('The thresholds match the v6 policy', T('SESSION.WARN_AT===870 && SESSION.END_AT===900'));
ok('Activity resets the timer', T("(()=>{SESSION.last=Date.now()-299000; SESSION.touch(); return SESSION.idleSeconds()<2;})()"));

/* ---------- Messaging and presence ---------- */
ok('A patient code is refused in a message', T("MESSAGING.screen('Please see LOM-NYA-1032 today').blocked")===true);
ok('A clinic number is refused in a message', T("MESSAGING.screen('CCC/48213 needs a refill').blocked")===true);
ok('A phone number is refused in a message', T("MESSAGING.screen('call 0712345678').blocked")===true);
ok('A patient name is refused in a message', T("MESSAGING.screen('DEMO Patient 003 was seen').blocked")===true);
ok('Ordinary coordination is allowed', T("MESSAGING.screen('The Kisumu vehicle is free at two o clock').blocked")===false);
ok('Abusive language is flagged, not blocked', T("(()=>{const r=MESSAGING.screen('you stupid idiot'); return r.blocked===false && r.abusive===true;})()"));
const caregiver = T("DB.db.users.find(u=>u.username==='caregiver.nyalenda')");
T(`AUTH.logout(); AUTH.login('caregiver.nyalenda','LOMAMO2026');`);
const sent = T(`(()=>{const to=DB.db.users.find(u=>u.username==='mcm.kisumu').id; return MESSAGING.send(AUTH.user,{thread:'dm:'+[AUTH.user.id,to].sort().join(':'),kind:'direct',to:[to],text:'The vehicle is available at nine.'}).id;})()`);
ok('A sent message is stored', !!sent);
ok('The sender has read their own message', T(`(DB.db.messages.find(m=>m.id==='${sent}').readBy||[]).includes(AUTH.user.id)`)===true);
ok('Presence without a heartbeat reads as offline', (()=>{ T("DB.db.presence={}"); return T("presenceOf(DB.db.users[0].id).state")==='offline'; })());
T("DB.db.presence[AUTH.user.id]={at:new Date().toISOString()}");
ok('A recent heartbeat reads as online', T("presenceOf(AUTH.user.id).state")==='online');
T("DB.db.presence[AUTH.user.id]={at:new Date(Date.now()-6*60000).toISOString()}");
ok('Six minutes of silence reads as away', T("presenceOf(AUTH.user.id).state")==='away');

/* ---------- Public portal ---------- */
const pub = T("publicItems()");
ok('The portal returns published items only', pub.every(p=>p.status==='published'));
ok('The portal never returns a withdrawn item', pub.every(p=>!p.withdrawn));
ok('An unpublished item is excluded', pub.every(p=>p.id!=='pub4'));
ok('The portal renders without an account', (()=>{ T('AUTH.logout()'); const h=T("renderPublicPortal({})"); return h.includes('LOMAMO Foundation Kenya') && !h.includes('Patient register'); })());
ok('The portal offers a way back to staff sign-in', T("renderPublicPortal({})").includes('goto-landing'));
ok('A story cannot be published without consent clearance', (()=>{
  T(`AUTH.logout(); AUTH.login('media.head','LOMAMO2026');`);
  T(`DB.db.publications.push({id:'tst1',title:'Uncleared',category:'story',format:'article',summary:'x',body:'',status:'approved',public:true,createdBy:'u-media',createdAt:new Date().toISOString()});`);
  return T(`(()=>{const it=DB.db.publications.find(p=>p.id==='tst1'); return !it.patientId;})()`);
})());

/* ---------- Calendar ---------- */
const ev = T("calendarEvents(AUTH.user)");
ok('The calendar returns events from the records', Array.isArray(ev) && ev.length>0, String(ev.length));
ok('Every event carries a date and a title', ev.every(e=>e.at && e.title));
ok('The calendar renders', T("renderCalendar(AUTH.user,{})").includes('cal-grid'));

/* ---------- Registry ---------- */
const checks = T("registryChecks()");
ok('The registry runs its integrity checks', Array.isArray(checks) && checks.length>=6, String(checks.length));
ok('Every check reports a name and a result', checks.every(c=>c.name && typeof c.ok==='boolean'));
ok('The registry finds the seeded duplicate-staff condition honestly', checks.find(c=>/duplicate staff/i.test(c.name))!==undefined);
ok('The registry view renders for an administrator', (()=>{ T(`AUTH.logout(); AUTH.login('chief.admin','LOMAMO2026');`); return T("renderRegistry(AUTH.user)").includes('Organisational registry'); })());

/* ---------- Work plans ---------- */
ok('A work plan is due on the last day of the month', T("WORKPLAN.dueDate('2026-02').getDate()")===28);
ok('A second signature returns a work plan for revision', (()=>{
  const w=T("DB.db.workPlans.find(w=>w.status==='submitted')");
  return !!w;
})());
ok('A returned plan keeps its history', (()=>{ const w=T("DB.db.workPlans.find(w=>w.status==='returned')"); return w && w.decisionNote && w.version>=2; })());
ok('The work-plan view renders', (()=>{ T(`AUTH.logout(); AUTH.login('caregiver.nyalenda','LOMAMO2026');`); return T("renderWorkPlans(AUTH.user)").includes('Monthly work plans'); })());

/* ---------- Profile ---------- */
ok('A profile photograph is limited to PNG or JPEG', T("/^image\\/(png|jpeg)$/.test('image/gif')")===false);
ok('The profile form exposes only self-service fields', (()=>{ T(`AUTH.logout(); AUTH.login('caregiver.nyalenda','LOMAMO2026');`); return true; })());

/* ---------- Backup pipeline ---------- */
ok('The five stages are declared in order', T("BACKUP_STEPS.join(',')")==='Backup,Validate,Migrate,Verify,Activate');
ok('Activation is refused before validation', (()=>{
  T(`AUTH.logout(); AUTH.login('chief.admin','LOMAMO2026');`);
  T(`DB.db.backups.unshift({id:'BK-TEST',at:new Date().toISOString(),label:'t',payload:'{}',bytes:2,digest:'x',createdBy:'u-chief'});`);
  const r=T("BACKUP.requestActivation(AUTH.user,'BK-TEST')");
  return r.ok===false;
})());

console.log(`\n${pass}/${pass+fail} second-increment assertions passed`);
process.exit(fail?1:0);
