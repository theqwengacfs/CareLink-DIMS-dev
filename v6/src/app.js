/* ============================================================
   app.js - Shell, routing, actions, forms, onboarding, assistant
   ============================================================ */

const APPX = {
  view:'home', params:{}, aiOpen:false, showUserMenu:false, navOpen:false,
  screen:'landing', dirty:false, sync:null, host:null, showMustChange:false,
  get user(){ return AUTH.user; }
};

/* ---------------- Boot ---------------- */
/* ---------------- Inactivity ----------------
   Three hundred seconds (five minutes) without genuine activity ends the session. The browser runs
   the countdown you can see; the host runs the one that matters, because it
   refuses an expired token whether or not this code ever runs. */
const SESSION = {
  WARN_AT: 870,            // seconds: a 30 second warning before the end
  END_AT: 900,
  last: Date.now(),
  warned: false,
  activeSinceBeat: false,
  _beat: null,
  _watch: null,

  start(){
    this.stop();
    this.last = Date.now(); this.warned=false; this.activeSinceBeat=false;
    if(typeof SYNC!=='undefined' && SYNC.sessionToken) SYNC.startPolling();
    if(typeof LIVE!=='undefined') setTimeout(()=>LIVE.start(), 600);
    this._watch = setInterval(()=>this.tick(), 1000);
    this._beat = setInterval(()=>{ this.heartbeat(); }, 10000);
  },
  stop(){
    if(this._watch) clearInterval(this._watch); this._watch=null;
    if(this._beat) clearInterval(this._beat); this._beat=null;
    if(typeof LIVE!=='undefined') LIVE.stop();
    this.warned=false;
  },
  touch(){
    this.last = Date.now(); this.activeSinceBeat = true;
    if(this.warned){ this.warned=false; const m=$('#idleWarn'); if(m) m.remove(); }
  },
  idleSeconds(){ return (Date.now()-this.last)/1000; },
  shouldWarn(idle){ return idle>=this.WARN_AT && idle<this.END_AT; },
  shouldEnd(idle){ return idle>=this.END_AT; },
  tick(){
    if(!AUTH.user) return;
    const idle = this.idleSeconds();
    if(this.shouldEnd(idle)) return this.expire('inactivity');
    if(this.shouldWarn(idle)) this.warn();
  },
  warn(){
    if(this.warned) return;
    this.warned = true;
    const box=document.createElement('div');
    box.className='modal-back'; box.id='idleWarn'; box.style.zIndex='90';
    box.innerHTML = `<div class="modal narrow" role="alertdialog" aria-label="Session ending">
      <div class="modal-h"><div><h3>Your session is about to end</h3><div class="sub">Fifteen minutes without activity signs you out.</div></div></div>
      <div class="modal-b"><p class="small" style="color:var(--ink-2)">Patient information is protected by signing out when a device is left unattended. Any unsaved form on this screen will not be kept unless a draft has been saved on this device.</p>
        <div class="idle-bar"><span style="animation-duration:30s"></span></div></div>
      <div class="modal-f"><button class="btn btn-ghost" data-act="logout">Sign out now</button>
        <button class="btn btn-primary" data-act="stay-signed-in">Stay signed in</button></div></div>`;
    document.body.appendChild(box);
  },
  async heartbeat(){
    if(AUTH.user){
      DB.db.presence = DB.db.presence||{};
      DB.db.presence[AUTH.user.id] = { at:new Date().toISOString(), state:'online' };
      try{ Store.set(DB.KEY, JSON.stringify(DB.db)); }catch(e){}
    }
    if(!AUTH.user||typeof SYNC==='undefined'||!SYNC.sessionToken) return;
    const active = this.activeSinceBeat; this.activeSinceBeat=false;
    /* An inactive beat deliberately does not extend the host session. */
    const left = await SYNC.beat();
    if(left===null && SYNC.sessionToken===null && AUTH.user){ /* handled by _json 401 */ }
  },
  serverExpired(){ this.expire('server'); },
  expire(reason){
    if(!AUTH.user) return;
    const who = AUTH.user.id;
    try{
      AUDIT.append({actor:who,action:'session.expired',entity:'session',entityId:who,
        detail: reason==='inactivity' ? 'Ended after 900 seconds without activity' : 'Ended because the host session expired'});
      DB.save();
    }catch(e){}
    this.stop();
    closeAllModals(true);
    const box=$('#idleWarn'); if(box) box.remove();
    if(typeof SYNC!=='undefined') SYNC.logout();
    AI.history = [];
    try{ sessionStorage.removeItem('carelink.lastUser'); }catch(e){}
    AUTH.logout();
    NAVH.reset(); APPX.screen='login'; APPX.view='home'; APPX.params={}; APPX.dirty=false; APPX.aiOpen=false;
    try{ history.replaceState(null,'',location.pathname+'#/'); }catch(e){}
    render();
    toast('Signed out','Your session ended. Sign in again to continue.','warn');
  }
};

/* A refresh is not a sign-out. The session token lives in sessionStorage (it
   dies with the tab), so a person who reloads the page — or comes back to a
   tablet left on the console — continues where they were. The host still owns
   the idle window and still refuses an expired token. */
async function tryResumeSession(){
  if(typeof SYNC==='undefined' || !SYNC.available()) return false;
  SYNC.loadToken();
  if(!SYNC.sessionToken) return false;
  let uname = null;
  try{ uname = sessionStorage.getItem('carelink.lastUser'); }catch(e){}
  if(!uname){
    SYNC.storeToken(null);
    return false;
  }
  if(!APPX.host) return false;
  const ok = await SYNC.pullFull();
  if(!ok){
    if(!SYNC.sessionToken){ try{ sessionStorage.removeItem('carelink.lastUser'); }catch(e){} }
    return false;
  }
  const lower = uname.toLowerCase();
  const u = (DB.db.users||[]).find(x=>String(x.username).toLowerCase()===lower)
    || ((lower==='system.admin' || lower==='chief.admin') ? (DB.db.users||[]).find(x=>x && x.roleId==='chief') : null);
  if(!u){
    SYNC.storeToken(null);
    try{ sessionStorage.removeItem('carelink.lastUser'); }catch(e){}
    return false;
  }
  AUTH.user = u; AUTH.online = true;
  AUTH.mustChange = Boolean(u.mustChange || u.mustChangePassword);
  AUTH.session = {started:todayISO(), last:Date.now(), token:'resumed', mustChange:AUTH.mustChange};
  APPX.screen = 'app';
  SESSION.start();
  return true;
}

let _booted = false;
async function boot(){
  if(_booted) return;
  _booted = true;
  DB.load();
  applyTheme();
  /* Attach click, submit, change and hash listeners synchronously at 0 ms
     BEFORE the first render() or network probe so clicking Sign-In or
     submitting a form works immediately even while /api/health is loading. */
  AUTH.listeners.push(()=>render());
  window.addEventListener('hashchange', ()=>{ parseHash(); render(); });
  document.addEventListener('click', onClick, false);
  document.addEventListener('submit', onSubmit, false);
  document.addEventListener('change', onChange, false);
  document.addEventListener('input', (e)=>{
    const t = e && e.target;
    if(t && t.name === 'username' && typeof LOGIN6 !== 'undefined' && t.closest && t.closest('[data-form="login6"]')){
      LOGIN6.usernameDraft = t.value;
    }
  }, false);
  ['pointerdown','keydown','touchstart','wheel'].forEach(ev=>
    document.addEventListener(ev, ()=>{ if(AUTH.user) SESSION.touch(); }, {passive:true}));
  window.addEventListener('hashchange', ()=>{ if(AUTH.user) SESSION.touch(); });
  if(typeof NAVP!=='undefined' && NAVP.installAutoFoldListeners) NAVP.installAutoFoldListeners();

  /* Respect explicit #/setup, #/onboard, #/login or #/architecture deep links at 0 ms */
  if(location.hash) parseHash();
  if(!AUTH.user && /^#\/?(setup|onboard)\b/i.test(location.hash||'')){
    APPX.screen = 'onboard';
    ONB.step = 1;
  } else if(!AUTH.user && /^#\/?login\b/i.test(location.hash||'')){
    APPX.screen = 'login';
  } else if(!AUTH.user && /^#\/?architecture\b/i.test(location.hash||'')){
    APPX.screen = 'architecture';
  }
  render();

  /* The front door probes whether a live host is answering and refreshes if needed. */
  try{ APPX.host = await hostProbe(); }catch(e){ APPX.host = null; }
  if(APPX.host && typeof SYNC !== 'undefined') SYNC.server = APPX.host;
  await tryResumeSession();
  if(location.hash) parseHash();
  render();
  if(typeof SYNC!=='undefined') setTimeout(()=>SYNC.start(), 300);
  setInterval(()=>{
    if(AUTH.user && AUTH.locked()) render();
  }, 20000);
  setInterval(()=>{ try{ REPORTS.mondayTick(); }catch(e){} }, 60000);
  setTimeout(()=>{ if(AUTH.user){ try{ REPORTS.mondayTick(); }catch(e){} } }, 2500);
}
function parseHash(){
  const h = location.hash.replace(/^#\/?/,'');
  if(!h) return;
  const [path, query] = h.split('?');
  const [view, id] = path.split('/');
  const params = {};
  if(query) query.split('&').forEach(p=>{ const [k,v]=p.split('='); if(k) params[k]=decodeURIComponent(v||''); });
  if(id) params.id = id;
  APPX.view = view||'home'; APPX.params = params;
}
function go(view, params={}){
  APPX.view = view; APPX.params = params;
  if(typeof NAVP!=='undefined'){
    NAVP._tempOpen = false;
    NAVP._workspaceEngaged = (view !== 'home');
  }
  if(typeof SILENT_OVERRIDE!=='undefined' && SILENT_OVERRIDE.isActive()) SILENT_OVERRIDE.recordView(view);
  const q = Object.keys(params).length? '?'+Object.entries(params).map(([k,v])=>`${k}=${encodeURIComponent(v)}`).join('&'):'';
  const target = `#/${view}${q}`;
  if(AUTH.user) NAVH.mirror(target);
  else { try{ if(location.hash !== target) history.replaceState(null,'',target); } catch(e){} }
  APPX.navOpen=false;
  NAVH.push(view, params);
  if(view==='messages' && AUTH.user){
    const th = messageThreads(AUTH.user); const id = params.thread || (th[0]&&th[0].thread);
    if(id) MESSAGING.markRead(AUTH.user, id);
  }
  render();
  const contentEl = document.querySelector && document.querySelector('#content');
  if(contentEl && typeof contentEl.scrollTo === 'function') contentEl.scrollTo({top:0,behavior:'auto'});
  else window.scrollTo({top:0,behavior:'auto'});
}
function applyTheme(){
  /* Colour, density, text size, touch size and motion all come from one place,
     so a redraw can never undo a personal preference. */
  WTHEME.apply(AUTH.user || null);
}

/* ---------------- Render root ---------------- */
function captureAuthFormState(root){
  try{
    if(!root || typeof root.querySelectorAll !== 'function') return null;
    const inputs = root.querySelectorAll('input[id], input[name], select[id], select[name]');
    if(!inputs || !inputs.length) return null;
    const values = [];
    for(const el of inputs){
      if(!el || el.type === 'checkbox' || el.type === 'radio' || el.type === 'file') continue;
      if(el.value) values.push({ id: el.id || '', name: el.name || '', form: (el.closest && el.closest('[data-form]') ? el.closest('[data-form]').dataset.form : ''), value: el.value });
    }
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    const focus = (active && (active.id || active.name) && root.contains && root.contains(active))
      ? { id: active.id || '', name: active.name || '', selStart: active.selectionStart, selEnd: active.selectionEnd }
      : null;
    return (values.length || focus) ? { values, focus } : null;
  }catch(_e){ return null; }
}

function restoreAuthFormState(root, snap){
  try{
    if(!snap || !root || typeof root.querySelector !== 'function') return;
    for(const item of (snap.values || [])){
      const sel = item.id ? `#${item.id}` : (item.form && item.name ? `[data-form="${item.form}"] [name="${item.name}"]` : '');
      if(!sel) continue;
      const el = root.querySelector(sel);
      if(el && !el.value) el.value = item.value;
    }
    if(snap.focus){
      const fSel = snap.focus.id ? `#${snap.focus.id}` : (snap.focus.name ? `[name="${snap.focus.name}"]` : '');
      const fEl = fSel ? root.querySelector(fSel) : null;
      if(fEl && typeof fEl.focus === 'function'){
        fEl.focus();
        if(typeof snap.focus.selStart === 'number' && typeof fEl.setSelectionRange === 'function'){
          try{ fEl.setSelectionRange(snap.focus.selStart, snap.focus.selEnd); }catch(_e){}
        }
      }
    }
  }catch(_e){}
}

function render(){
  applyTheme();
  try{ if(typeof document!=='undefined') document.title = (typeof APP!=='undefined' && APP.tabTitle) ? APP.tabTitle : 'CareLink C-DIMS'; }catch(e){}
  const root = $('#root');
  if(!DB.db) DB.load();
  /* the assistant dock belongs to an authenticated console only */
  const staleDock = document.querySelector('.ai-dock');
  if(staleDock && (!AUTH.user || AUTH.locked() || !DB.db.users.length || APPX.screen==='public')) staleDock.remove();
  if(APPX.screen==='public'){ root.innerHTML = renderPublicPortal(APPX.params||{}); return; }
  const onboardingDone = Boolean(DB.db && DB.db.settings && DB.db.settings.onboarding && DB.db.settings.onboarding.complete);
  const hostCommissioned = Boolean(AUTH.online || (typeof commissionedEntryActive === 'function' && commissionedEntryActive()));
  if(AUTH.user && !onboardingDone && !hostCommissioned){ root.innerHTML = renderOnboarding(); return; }
  if(!AUTH.user){
    const snap = (APPX.screen==='login' || APPX.screen==='onboard') ? captureAuthFormState(root) : null;
    root.innerHTML = APPX.screen==='login' ? renderLogin()
      : APPX.screen==='onboard' ? renderOnboarding()
      : APPX.screen==='architecture' ? renderArchitecture()
      : renderLanding();
    if(snap) restoreAuthFormState(root, snap);
    return;
  }
  /* A temporary password must be replaced before any console opens. */
  if(AUTH.mustChange){
    const mcSnap = captureAuthFormState(root);
    root.innerHTML = renderMustChange();
    if(mcSnap) restoreAuthFormState(root, mcSnap);
    return;
  }
  if(AUTH.locked()){ root.innerHTML = renderLocked(); return; }
  const paneTop = NAVP.scrollState();
  const sheetLeft = (document.querySelector('.sheet')||{}).scrollLeft;
  root.innerHTML = renderShell();
  NAVP.restoreScroll(paneTop);
  const ms = document.querySelector('.msg-scroll'); if(ms) ms.scrollTop = ms.scrollHeight;
  const sh = document.querySelector('.sheet');
  if(sh && sheetLeft) sh.scrollLeft = sheetLeft;
  renderAIDock();
}

/* ---------------- Front door (v6) ----------------
   The v5.1 screens are kept below as renderLoginLegacy / renderLandingLegacy
   for reference and for the tests that check them; the application itself
   draws the v6 screens in entry6.js. */
function renderLogin(){ return renderLogin6(); }
function renderOnboarding(){ return renderOnboarding6(); }
function renderLanding(){ return renderLanding6(); }
function renderArchitecture(){ return typeof renderArchitecture6==='function' ? renderArchitecture6() : renderLanding6(); }

function renderLoginLegacy(){
  if(typeof PROD_SETUP !== 'undefined' && PROD_SETUP.isGloballyActivated && PROD_SETUP.isGloballyActivated()) return renderLogin6();
  const demo = DB.db.users.filter(u=>u.demo);
  const groups = [
    ['Leadership','chief,president,director'],
    ['Administration','countyadmin,assistant'],
    ['Field','coordinator,caregiver'],
    ['Medical','mcm,liaison,nurse'],
    ['Specialist','finance,mediahead,auditor,hr']
  ];
  return `<div class="login-wrap">
    <div class="login-brand">
      <div>
        <img class="login-logo" src="${window.LOGO||''}" alt="LOMAMO Foundation">
        <div class="login-hero">
          <h1>One foundation.<br><em>One operating system.</em></h1>
          <p>LOMAMO C-DIMS gives every department a purpose-built workspace, enforces least-privilege access at the data layer, and keeps patient information confidential by design.</p>
        </div>
        <div class="login-points">
          <div class="login-point">${ic('shield',20)}<div><b>Governed information</b><span>Clinical, financial, HR and media records are separated by capability, county and ministry area - enforced by the database layer, not by hidden buttons.</span></div></div>
          <div class="login-point">${ic('route',20)}<div><b>Connected workflows</b><span>Assessment → verification → enrolment → hospital request → clinical approval → transport → reconciliation, with the correct people at every step.</span></div></div>
          <div class="login-point">${ic('pulse',20)}<div><b>Offline-first intelligence</b><span>Master workbook import, Monday 08:00 management reports and a local AI assistant that never sends patient data to a cloud service.</span></div></div>
        </div>
      </div>
      <div class="login-foot">
        <div class="spread"><span>${esc(APP.full)}</span><span>v${APP.version} · schema ${APP.schema}</span></div>
        <div style="margin-top:8px;opacity:.75">Love Matters Most · Serving our neighbours in love</div>
      </div>
    </div>
    <div class="login-panel"><div class="login-card">
      ${renderLoginBack()}
      <div class="brand-line"></div>
      <h2>Sign in</h2>
      <div class="sub">Use the credentials issued to you by your County Office Administrator.</div>
      <form data-form="login">
        <div class="field"><label for="u">Username</label><input class="input" id="u" name="username" autocomplete="username" placeholder="e.g. caregiver.nyalenda" required></div>
        <div class="field"><label for="p">Password</label><input class="input" id="p" name="password" type="password" autocomplete="current-password" placeholder="••••••••••" required></div>
        <button class="btn btn-primary btn-block" type="submit">Sign in ${ic('chevron',16)}</button>
      </form>
      <div class="demo-users">
        <h4>Demonstration accounts · password <span class="kbd">LOMAMO2026</span></h4>
        <div class="demo-grid">
          ${demo.map(u=>`<button class="demo-chip" data-act="quick-login" data-u="${u.username}">
            <b>${esc(u.jobTitle||u.name)}</b><span>${esc(u.username)}${u.countyId?' · '+esc(countyName(u.countyId)):''}</span></button>`).join('')}
        </div>
        <div class="note" style="margin-top:12px">${ic('info',14)}<span>These are synthetic demonstration accounts. No real staff, patient or financial records are loaded.</span></div>
      </div>
      <div class="login-first">Evaluating the system? <a data-act="load-demo">Load the demonstration dataset</a> to replace the records held in this browser with synthetic data for training and evaluation.</div>
    </div></div>
  </div>`;
}
function renderLocked(){
  return `<div style="min-height:100vh;display:grid;place-items:center;background:#0E1013">
    <div class="paper" style="background:#fff;border-radius:20px;padding:34px;max-width:400px;width:100%;box-shadow:var(--shadow-lg)">
      <div style="display:flex;gap:12px;align-items:center;margin-bottom:16px">
        <div class="avatar" style="background:var(--accent);width:44px;height:44px">${initials(AUTH.user.name)}</div>
        <div><div class="bold">${esc(AUTH.user.name)}</div><div class="xs muted">Session locked after inactivity</div></div>
      </div>
      <form data-form="unlock">
        <div class="field"><label>Enter your password to continue</label><input class="input" type="password" name="password" autofocus required></div>
        <button class="btn btn-primary btn-block" type="submit">Unlock</button>
      </form>
      <button class="btn btn-ghost btn-block" style="margin-top:10px" data-act="logout">Sign out</button>
    </div></div>`;
}

/* ---------------- Onboarding (legacy reference) ---------------- */
function renderOnboardingLegacy(){
  if(typeof PROD_SETUP !== 'undefined' && PROD_SETUP.isGloballyActivated && PROD_SETUP.isGloballyActivated()) return renderLogin6();
  const step = DB.db.settings.onboarding.step||1;
  const wrap = (body)=>`<div style="min-height:100vh;background:linear-gradient(160deg,#0E1013,#191C22);display:grid;place-items:center;padding:24px">
    <div class="paper" style="background:#fff;border-radius:22px;max-width:760px;width:100%;padding:34px;box-shadow:var(--shadow-lg)">${body}</div></div>`;
  if(step===1) return wrap(`
    <div class="row" style="gap:14px;margin-bottom:6px"><img src="${window.LOGO||''}" style="width:52px;border-radius:10px;border:1px solid var(--line)" alt="">
      <div><div class="xs muted" style="letter-spacing:.14em;text-transform:uppercase">First-run configuration</div><h2 style="font-size:22px">Welcome to LOMAMO C-DIMS</h2></div></div>
    <p class="muted small" style="margin:14px 0 20px">This installation has no accounts yet. A controlled bootstrap is required: create the Chief System Administrator, confirm the organisational structure, then issue accounts through the approval workflow. Nothing is silently granted.</p>
    <div class="col" style="gap:10px;margin-bottom:20px">
      ${['Chief System Administrator account created securely','Organisational structure confirmed','Roles and permission templates established','County offices and departments configured','Further accounts created through approval - never automatically'].map((s,i)=>`<div class="row" style="gap:10px"><span class="badge b-neutral nodot">${i+1}</span><span class="small">${esc(s)}</span></div>`).join('')}
    </div>
    <div class="row">
      <button class="btn btn-primary" data-act="onboard-start">Begin setup ${ic('chevron',15)}</button>
      <button class="btn btn-ghost" data-act="load-demo">${ic('sparkles',15)} Load demonstration dataset</button>
    </div>
    <div class="note" style="margin-top:16px">${ic('info',14)}<span>The demonstration dataset is synthetic and clearly labelled. It is intended for evaluation, training and acceptance testing only.</span></div>`);
  if(step===2) return wrap(`
    <div class="xs muted" style="letter-spacing:.14em;text-transform:uppercase">Step 1 of 2</div>
    <h2 style="font-size:21px;margin:4px 0 6px">Create the Chief System Administrator</h2>
    <p class="muted small" style="margin-bottom:18px">This account configures the platform. It does not carry clinical authority by default.</p>
    <form data-form="create-chief">
      <div class="grid g2">
        <div class="field"><label>Full name</label><input class="input" name="name" required placeholder="e.g. J. Ochieng"></div>
        <div class="field"><label>Username</label><input class="input" name="username" required value="chief.admin"></div>
        <div class="field"><label>Password</label><input class="input" type="password" name="password" required minlength="12"><div class="hint">Minimum 12 characters. Stored only as a salted hash.</div></div>
        <div class="field"><label>Confirm password</label><input class="input" type="password" name="password2" required></div>
      </div>
      <div class="row"><button class="btn btn-primary" type="submit">Create account ${ic('chevron',15)}</button>
      <button class="btn btn-ghost" data-act="load-demo">Use demonstration data instead</button></div>
    </form>`);
  return wrap(`
    <div class="xs muted" style="letter-spacing:.14em;text-transform:uppercase">Step 2 of 2</div>
    <h2 style="font-size:21px;margin:4px 0 6px">Confirm the organisational structure</h2>
    <p class="muted small" style="margin-bottom:16px">These are seeded from the supplied organisational records. Confirm before proceeding; you can edit them later in Organisation Configuration.</p>
    <div class="grid g2" style="margin-bottom:16px">
      ${COUNTIES.map(c=>`<div class="card"><div class="card-h"><h3 style="font-size:13px">${esc(c.name)}</h3><div class="r">${badge(c.areas.length+' areas','b-neutral','nodot')}</div></div>
        <div class="card-b"><div class="row" style="gap:6px">${c.areas.map(a=>`<span class="chip">${esc(a.name)}</span>`).join('')}</div></div></div>`).join('')}
    </div>
    ${alertBox('warn','Homa Bay areas require verification','<span class="small">Only the three named areas are loaded. Add verified service areas before importing Homa Bay field data.</span>')}
    <div class="row" style="margin-top:18px"><button class="btn btn-primary" data-act="onboard-finish">Confirm and enter ${ic('chevron',15)}</button></div>`);
}

/* ---------------- Shell ---------------- */
function renderShell(){
  const user = AUTH.user;
  const groups = navModel(user);
  const role = roleObj(user.roleId)||{};
  const dept = deptObj(user.departmentId)||{accent:'#C8102E'};
  const unread = DB.db.notifications.filter(n=>n.userId===user.id&&!n.read).length;
  const crumb = viewCrumb();
  const here = v => APPX.view===v || (APPX.view==='patient'&&v==='patients')
                 || (APPX.view==='form'&&v==='forms') || (APPX.view==='careplan'&&v==='careplans')
                 || (APPX.view==='report'&&v==='reports') || (APPX.view==='care-resident'&&v==='care');
  const childParent = { patient:'patients', form:'forms', careplan:'careplans', report:'reports', 'care-resident':'care' };
  const canGoBack = NAVH.canBack() || Boolean(childParent[APPX.view]);
  const aiProf = (typeof AI!=='undefined' && AI.profileFor) ? AI.profileFor(user, APPX.view) : { badge:'Console AI' };
  const paneOn = NAVP.enabled(user);
  const railOn = paneOn && NAVP.effectiveRail(user, APPX.view);
  const flatItems = groups.flatMap(g=>g.items);
  const quickBarIds = ['home','smartflow','monday','messages'];
  const quickBarItems = quickBarIds.map(id=>flatItems.find(i=>i.id===id)).filter(Boolean);
  const searchPh = RBAC.has(user,'patient.list') && !['mediahead','pr','finance','procurement','hr','welfare','vehicle','auditor','it','gov.partner','president'].includes(user.roleId)
    ? 'Search CareLink patients, forms, reports...'
    : 'Search CareLink workspace, pages & records...';
  const countyDisp = user.countyId ? countyName(user.countyId) : 'Global / Head Office';
  return `<div class="app shell ${paneOn?'has-pane':''} ${railOn?'np-rail':''} ${APPX.navOpen?'np-open':''}">
    ${paneOn? NAVP.html(user, here) : ''}${paneOn? '<div class="np-scrim" data-act="nav-close"></div>' : ''}
    <header class="topbar cbar ${railOn?'cbar-rail':'cbar-open'}">
      <img class="cb-logo" src="${window.LOGO||''}" alt="CareLink · LOMAMO Foundation">
      <div class="cb-nav" role="group" aria-label="Navigation & history">
        ${paneOn?`<button class="icon-btn cb-fold-btn" data-act="nav-rail" aria-label="${railOn?'Expand navigation pane':'Fold navigation pane'}" title="${railOn?'Expand navigation pane':'Fold navigation pane'}">${ic('panel',17)}</button>`:''}
        <button class="icon-btn" data-act="nav-back" aria-label="Back" title="Back (Alt+Left)" ${canGoBack?'':'disabled aria-disabled="true"'}>${ic('back',18)}</button>
        <button class="icon-btn" data-act="nav-forward" aria-label="Forward" title="Forward (Alt+Right)" ${NAVH.canForward()?'':'disabled aria-disabled="true"'}>${ic('forward',18)}</button>
      </div>
      <div class="cb-id">
        <div class="cb-k"><span class="dot" style="background:${dept.accent}"></span><span class="cb-os-tag">CareLink OS</span> · <span class="cb-role-tag">${esc(role.consoleTitle||role.name||'Console')}</span> · <span class="cb-county-tag">${esc(countyDisp)}</span></div>
        <h1>${esc(crumb.title)}</h1>
      </div>
      <div class="cb-quick no-print" role="navigation" aria-label="Quick console shortcuts">
        ${quickBarItems.map(qi=>`<button class="cb-qbtn ${here(qi.id)?'on':''}" data-act="go" data-v="${esc(qi.id)}" title="${esc(qi.label)}">${ic(qi.icon,14)}<span>${esc(qi.id==='home'?'Home':qi.id==='smartflow'?'Smart QA':qi.id==='monday'?'Monday':qi.id==='messages'?'Messages':qi.label)}</span></button>`).join('')}
      </div>
      <div class="searchbox"><span>${ic('search',16)}</span><input placeholder="${esc(searchPh)}" data-search aria-label="Search"></div>
      <div class="tb-actions">
        <span class="live-pill neutral" data-live title="Live record indicator"><span class="live-dot"></span><span class="live-t">Live</span></span>
        ${typeof SYNC!=='undefined'?SYNC.chip():''}
        <button class="btn btn-xs btn-ghost no-print tb-ai-label" data-act="toggle-ai" title="Open ${esc(aiProf.title||'Console AI')}">${ic('sparkles',14)} <span>${esc(aiProf.badge||'Console AI')}</span></button>
        <button class="icon-btn tb-ai-icon no-print" data-act="toggle-ai" aria-label="Open ${esc(aiProf.title||'Console AI')}" title="${esc(aiProf.title||'Console AI')}">${ic('sparkles',18)}</button>
        <button class="icon-btn tb-theme no-print" data-act="wtheme-open" aria-label="Themes, Fonts & Visual Packs" title="Themes, Fonts & Visual Packs">${ic('palette',18)}</button>
        <button class="icon-btn no-print" data-act="open-notifications" aria-label="Notifications" title="Notifications">${ic('bell',18)}${unread?`<span class="ping"></span>`:''}</button>
        <button class="me-btn" data-act="toggle-user-menu" aria-label="Your account" title="${esc(user.name)} · ${esc(role.name||'')}">
          ${avatarFor(user.name, dept.accent, user.photo)}
          <span class="me-nm">${esc(user.name.replace(/^Demo - /,'').split(' ')[0])}</span>
        </button>
      </div>
    </header>

    <nav class="sheet" aria-label="Pages in this console">
      <button class="sheet-all" data-act="${paneOn?'nav-open':'open-console-map'}" aria-label="All pages in this console">${ic('menu',16)}<span>All</span></button>
      ${groups.map(g=>`<span class="sheet-g" aria-hidden="true">${esc(g.label)}</span>
        ${g.items.map(i=>`<button class="tab ${here(i.id)?'active':''}" data-act="go" data-v="${i.id}">
          ${ic(i.icon,15)}<span>${esc(i.label)}</span>
          ${i.count?`<span class="tcount ${i.tone==='crit'?'crit':''}">${i.count}</span>`:''}
        </button>`).join('')}`).join('')}
      <button class="tab" data-act="go" data-v="settings">${ic('settings',15)}<span>Preferences</span></button>
    </nav>

    <main class="content" id="content">
      ${!Store.durable?`<div class="alert warn no-print" style="margin-bottom:16px">${ic('info',18)}<div><b>Preview session</b>
        <span class="small">This browser has blocked persistent storage, so changes are held for this session only. Download the file and open it directly in Chrome or Edge for a persistent installation.</span></div></div>`:''}
      ${contentFor(view=APPX.view, APPX.params, user)}
      ${PAGER.bar(user, here)}</main>
  </div>`;
}
var view='home';
function viewCrumb(){
  const v = APPX.view;
  const labels = {home:'Console home',patients:'Patient register',patient:'Patient record',pipeline:'Assessment pipeline',
    attention:'Patients requiring attention',visits:'Visits & progress',pdca:'PDCA follow-up',requests:'Hospital requests',
    liaison:'Focal person assignments',recon:'Receipt reconciliation',reports:'Report centre',report:'Report',referral:'Master Referral Document',
    archive:'Report archive',targets:'Targets & baselines',finance:'Expenditure',budget:'Budget lines',procurement:'Procurement',
    media:'Media library',consent:'Consent register',publish:'Publication queue',policy:'Policy & knowledge',staff:'Staff register',
    leave:'Leave & off-days',welfare:'Staff welfare',vehicles:'Vehicle register',trips:'Trips & fuel',audit:'Audit findings',
    history:'Audit trail',security:'Security self-test',users:'Users & accounts',roles:'Roles & permissions',org:'Organisation',
    workflows:'Workflow configuration',import:'Master data import',health:'System health',backup:'Backup & restore',
    settings:'Settings',executive:'Executive summary',compare:'County comparison',
    care:'Care centre', 'care-resident':'Care centre resident', 'care-incidents':'Safeguarding register',
    conditions:'Condition register', delegation:'Delegation', donor:'Donor summary', workplans:'Monthly work plans', studio:'Media studio', messages:'Messages', calendar:'Calendar', registry:'Organisational registry', pr:'Public relations',
    forms:'Paper forms', form:'Paper form', pharmacy:'Pharmacy', careplans:'Care plans', careplan:'Care plan', schedule:'Visit planning',
    repeat:'Returning patient check', programdays:'Programme days', recognition:'C-DIMS coins', evaluation:'Staff evaluation', quality:'Data quality', visitplan:'Visit order learner', indicators:'Data elements & indicators', analytics:'Pivot tables & maps', interop:'KHIS, DHIS2 & APIs', governance:'Credentials & recovery',
    dualcheck:'Admin / Intl Co-Work Cross-Check', teams:'Ministry teams & visit days', households:'Households & care chains', costing:'Cost per patient',
    tbcare:'TB dispensing control', mastermap:'Master registry mapping', masteranalysis:'Master workbook analysis', waiting:'Waiting list', urgent:'Urgent cases against budget', households:'Households & care chains', visualaudit:'Visual & accessibility audit', accessaudit:'Access & authority audit',
    library:'Department library', execconsole:'Executive console', inventory:'Office equipment', interns:'Students & interns',
    ohs:'Safety register', presence:'Who is online', weather:'Weather board', mergejournal:'Merge journal',
    monday:'Monday Management Meeting', handover:'Delegation & Role Handover', hardcopy:'Hard-Copy Intake & Scanned Forms',
    clinicalmcm:'Medical Case Manager & Clinical Console', bmiboard:'BMI Nutritional Intelligence',
    cccdesk:'CCC / PSC Hospital Referral Desk', govdashboard:'Government Health Partnership',
    intlmedical:'120+ Day PDCA & International Medical Review', foodbudget:'Projected Food & Hygiene Budget',
    adminops:'Admin Operations & 9th Statutory', devconsole:'CareLink Development Console'};
  const baseTitle = labels[v]||titleCase(v);
  const t = (AUTH.user && typeof ROLE_CTX!=='undefined' && ROLE_CTX.navLabel) ? ROLE_CTX.navLabel(AUTH.user, v, baseTitle) : baseTitle;
  const role = AUTH.user? (roleObj(AUTH.user.roleId)||{}).consoleTitle : '';
  return { title:t, path:[role||'CareLink C-DIMS', t].join(' · ') };
}
/* Photo-free contextual top strip: Silent Admin Override Banner + Demo Switch Banner +
   Admin/Intl Single-Operator Co-Work Lease Bar + Role-Scoped Context Strip.
   All console and module photographs & captions have been removed by design. */
function workspaceHeroBanner(view, user){
  const isGlobalAct = (typeof PROD_SETUP!=='undefined' && PROD_SETUP.isGloballyActivated && PROD_SETUP.isGloballyActivated());
  const overrideBar = (typeof SILENT_OVERRIDE!=='undefined' && SILENT_OVERRIDE.bannerHTML) ? SILENT_OVERRIDE.bannerHTML() : '';
  const globalActBar = (typeof PROD_SETUP!=='undefined' && PROD_SETUP.globalActivationBannerHTML) ? PROD_SETUP.globalActivationBannerHTML(user) : '';
  const demoBar = (!isGlobalAct && typeof DEMO_SWITCH!=='undefined' && DEMO_SWITCH.bannerHTML) ? DEMO_SWITCH.bannerHTML() : '';
  const coeditBar = (typeof DUALCHECK!=='undefined' && DUALCHECK.bannerHTML) ? DUALCHECK.bannerHTML(user) : '';
  const urgentCountyBar = (typeof COUNTY_URGENT_QUEUE!=='undefined' && COUNTY_URGENT_QUEUE.bannerHTML) ? COUNTY_URGENT_QUEUE.bannerHTML(user, view) : '';
  const ctxStrip = (typeof ROLE_CTX!=='undefined' && ROLE_CTX.contextStrip) ? ROLE_CTX.contextStrip(user, view) : '';
  const wfStrip = (view==='home' && typeof WORKFLOW_ENGINE!=='undefined' && WORKFLOW_ENGINE.homePriorityStrip) ? WORKFLOW_ENGINE.homePriorityStrip(user) : '';
  return overrideBar + globalActBar + demoBar + coeditBar + urgentCountyBar + ctxStrip + wfStrip;
}
function contentFor(view, params, user){
  const guard = (cap)=>{ if(!RBAC.assert(user,cap,{},false)) return deniedPanel(cap); return null; };
  try{
    const html = (()=>{
    switch(view){
      case 'home': return renderHome(user);
      case 'attention': return guard('patient.list')||renderAttention(user);
      case 'patients': return guard('patient.list')||renderPatients(user,params);
      case 'patient': return renderPatient(user,params);
      case 'pipeline': return (guard('patient.digitise')||renderPipeline(user));
      case 'visits': return guard('patient.list')||renderVisits(user,params);
      case 'pdca': return guard('patient.list')||renderPdca(user,params);
      case 'requests':
        if(!(RBAC.has(user,'hosp.request.create')||RBAC.has(user,'hosp.request.review')||
             RBAC.has(user,'hosp.request.assign')||RBAC.has(user,'hosp.receipt.review')||
             RBAC.has(user,'hosp.close')||RBAC.has(user,'hosp.visit.record'))) return deniedPanel('hosp.request.create');
        return renderRequests(user,params);
      case 'liaison': return guard('hosp.visit.record')||renderLiaison(user);
      case 'recon': return guard('hosp.receipt.review')||renderRecon(user);
      case 'reports': return renderReports(user);
      case 'report': return renderReportView(user,params);
      case 'referral': return (guard('report.referral')||renderReportView(user,{type:'referral',countyId:params.countyId}));
      case 'archive': return renderArchive(user);
      case 'targets': return (RBAC.has(user,'report.targets.view')||RBAC.has(user,'report.targets.manage')||(typeof ACCESS!=='undefined'&&ACCESS.targetLevels(user).length))
        ? renderTargets(user) : deniedPanel('report.targets.view');
      case 'finance': return guard('finance.view')||renderFinance(user,params);
      case 'budget': return guard('finance.budget.manage')||renderBudget(user);
      case 'procurement': return guard('procurement.view')||renderProcurement(user);
      case 'media': return guard('media.view')||renderMedia(user);
      case 'consent': return guard('media.consent.manage')||renderConsent(user);
      case 'publish': return guard('media.publish')||renderPublish(user);
      case 'policy': return guard('media.view')||renderPolicy(user);
      case 'staff': return guard('hr.view')||renderStaff(user);
      case 'leave': return renderLeave(user);
      case 'forms': return (RBAC.has(user,'form.view')||RBAC.has(user,'patient.view.clinical'))?renderForms(user,params):deniedPanel('form.view');
      case 'form': return (RBAC.has(user,'form.view')||RBAC.has(user,'patient.view.clinical'))?renderFormRecord(user,params):deniedPanel('form.view');
      case 'pharmacy': return guard('pharmacy.view')||renderPharmacy(user);
      case 'careplans': return (RBAC.has(user,'careplan.view')||RBAC.has(user,'patient.view.clinical'))?renderCarePlans(user,params):deniedPanel('careplan.view');
      case 'careplan': return (RBAC.has(user,'careplan.view')||RBAC.has(user,'patient.view.clinical'))?renderCarePlan(user,params):deniedPanel('careplan.view');
      case 'schedule': return (RBAC.has(user,'visit.create')||RBAC.has(user,'pdca.create'))?renderSchedule(user,params):deniedPanel('visit.create');
      case 'welfare': return guard('welfare.view')||renderWelfare(user);
      case 'vehicles': return guard('vehicle.view')||renderVehicles(user);
      case 'trips': return guard('vehicle.view')||renderTrips(user);
      case 'audit': return guard('audit.view')||renderAudit(user);
      case 'history': return guard('system.audit')||renderHistory(user);
      case 'security': return (RBAC.has(user,'audit.view')||RBAC.has(user,'system.audit'))?renderSecurity(user):deniedPanel('audit.view');
      case 'users': return guard('user.view')||renderUsers(user);
      case 'roles': return (RBAC.has(user,'role.manage')||RBAC.has(user,'user.approve'))?renderRoles(user):deniedPanel('role.manage');
      case 'org': return guard('org.manage')||renderOrg(user);
      case 'workflows': return guard('system.config')||renderWorkflows(user);
      case 'import': return guard('system.import')||renderImport(user);
      case 'health': return (RBAC.has(user,'system.health')||RBAC.has(user,'system.audit'))?renderHealth(user):deniedPanel('system.health');
      case 'backup': return (RBAC.has(user,'system.backup')||RBAC.has(user,'system.audit'))?renderBackup(user):deniedPanel('system.backup');
      case 'settings': return renderSettings(user);
      case 'care': return renderCare(user);
      case 'care-resident': return renderCareResident(user,params);
      case 'care-incidents': return (RBAC.has(user,'care.incident')||RBAC.has(user,'care.view'))?renderCareIncidents(user):deniedPanel('care.incident');
      case 'conditions': return renderConditions(user);
      case 'delegation': return renderDelegation(user);
      case 'workplans': return renderWorkPlans(user);
      case 'studio': return guard('media.view')||renderStudio(user);
      case 'messages': return guard('message.use')||renderMessages(user,params);
      case 'calendar': return renderCalendar(user,params);
      case 'registry': return (RBAC.has(user,'org.manage')||RBAC.has(user,'user.view'))?renderRegistry(user):deniedPanel('org.manage');
      case 'pr': return guard('pr.view')||renderPR(user);
      case 'donor': return (RBAC.has(user,'report.executive')||RBAC.has(user,'report.patient_figures')||RBAC.has(user,'media.publish'))?renderDonor(user):deniedPanel('report.executive');
      case 'executive': return guard('report.executive')||renderExecutive(user);
      case 'compare': return guard('report.executive')||renderCompare(user);
      /* v6 modules */
      case 'repeat': return renderRepeatCheck(user);
      case 'programdays': return renderProgrammeDays(user);
      case 'recognition': return renderRecognition(user);
      case 'evaluation': return renderStaffEvaluation(user);
      case 'library': return renderLibrary(user);
      case 'execconsole': return renderExecConsole(user);
      case 'inventory': return renderInventory(user);
      case 'interns': return renderInterns(user);
      case 'ohs': return renderOhs(user);
      case 'presence': return renderPresence(user);
      case 'weather': return renderWeather(user);
      case 'mergejournal': return renderMergeJournal(user);
      case 'quality': return RBAC.has(user,'patient.list') ? renderDataQuality(user) : deniedPanel('patient.list');
      case 'indicators': return renderIndicators(user);
      case 'analytics': return (RBAC.has(user,'report.patient_days')||RBAC.has(user,'report.patient_figures')||RBAC.has(user,'report.executive')||RBAC.has(user,'report.departmental')) ? renderAnalyticsHub(user, APPX.params) : deniedPanel('report.departmental');
      case 'interop': return (RBAC.has(user,'system.config')||RBAC.has(user,'indicator.manage')||RBAC.has(user,'report.executive')) ? renderInteropHub(user, APPX.params) : deniedPanel('system.config');
      case 'governance': return (RBAC.has(user,'user.approve')||RBAC.has(user,'exec.agenda')||RBAC.has(user,'system.config')) ? renderGovernanceHub(user) : deniedPanel('user.approve');
      case 'visitplan': return (RBAC.has(user,'visit.create')||RBAC.has(user,'pdca.create')) ? renderVisitPlanner(user) : deniedPanel('visit.create');
      case 'teams': return guard('team.view')||TEAMX.render(user);
      case 'households': return guard('household.view')||HOUSEHOLD.render(user, params);
      case 'costing': return guard('cost.view')||COSTX.render(user, params);
      case 'tbcare': return guard('tb.view')||TBCARE.render(user, params);
      case 'mastermap': return guard('system.import')||MASTERX.render(user);
      case 'masteranalysis': return MASTERX2.render(user, params);
      case 'waiting': return guard('waiting.view')||WAITLIST.render(user, params);
      case 'urgent': return guard('urgent.view')||URGENT.render(user, params);
      case 'visualaudit': return (RBAC.has(user,'system.config')||RBAC.has(user,'system.health'))?VISUALX.render(user):deniedPanel('system.config');
      case 'accessaudit': return ACCESS.render(user);
      case 'dualcheck': return renderDualCheck(user);
      /* CareLink v6.3 domain & partner consoles */
      case 'monday': return guard('monday.meeting')||MONDAY_PROC.render(user, params);
      case 'handover': return guard('handover.use')||HANDOVER_PARTNERS.renderHandover(user, params);
      case 'hardcopy': return guard('hardcopy.intake')||DISCHARGE_HARDCOPY.renderHardcopyDesk(user, params);
      case 'clinicalmcm': return guard('clinical.mcm')||BMI_CLINICAL.renderMcmConsole(user, params);
      case 'bmiboard': return BMI_CLINICAL.renderBmiBoard(user, params);
      case 'cccdesk': return guard('ccc.desk')||HANDOVER_PARTNERS.renderCccDesk(user, params);
      case 'govdashboard': return guard('gov.oversight')||HANDOVER_PARTNERS.renderGovDashboard(user, params);
      case 'intlmedical': return guard('intl.medical')||HANDOVER_PARTNERS.renderIntlMedical(user, params);
      case 'foodbudget': return (RBAC.has(user,'procurement.view')||RBAC.has(user,'finance.view'))?MONDAY_PROC.renderFoodBudget(user, params):deniedPanel('procurement.view');
      /* CareLink v6.4/v6.5 Admin Operations, Development Console & Intelligent Workflow Engine */
      case 'adminops': return (RBAC.has(user,'admin.ops')||RBAC.has(user,'finance.view'))?ADMIN_OPS.render(user, params):deniedPanel('admin.ops');
      case 'devconsole': return DEV_CONSOLE.canAccess(user)?DEV_CONSOLE.render(user, params):deniedPanel('dev.console');
      case 'smartflow': return typeof WORKFLOW_ENGINE!=='undefined'?WORKFLOW_ENGINE.render(user, params):renderHome(user);
      case 'drafts': return typeof WORKSPACE_DRAFTS!=='undefined'?WORKSPACE_DRAFTS.render(user, params):renderHome(user);
      default: return renderHome(user);
    }
    })();
    if(String(html||'').includes('Access denied')) return html;
    return workspaceHeroBanner(view, user) + html;
  }catch(e){
    console.error(e);
    return `<div class="card"><div class="card-b">${emptyState('This view could not be rendered','An unexpected error occurred. The event has been logged.','alert')}
      <div class="mono xs muted" style="margin-top:10px">${esc(e.message)}</div></div></div>`;
  }
}
function deniedPanel(cap){
  const globallyActivated = typeof PROD_SETUP !== 'undefined' && PROD_SETUP.isGloballyActivated && PROD_SETUP.isGloballyActivated();
  const isDemoSession = !globallyActivated && Boolean((AUTH.user && AUTH.user.demo) || DB.db?.meta?.demoSeeded || DB.db?.meta?.seeded==='official');
  const candidate = (isDemoSession && typeof DEMO_SWITCH!=='undefined' && typeof cap==='string')
    ? DEMO_SWITCH.findBestUserForCap(cap) : null;
  const switchBtn = (candidate && AUTH.user && candidate.username !== AUTH.user.username)
    ? ` <button class="btn btn-sm btn-primary" data-act="prompt-switch-account" data-u="${esc(candidate.username)}" data-v="${esc(APPX.view||'home')}" data-asset="${esc(viewCrumb().title)}">${ic('key',13)} View as ${esc(candidate.name)} (@${esc(candidate.username)})</button>`
    : '';
  return `<div class="card"><div class="card-b">${emptyState('Access denied',
    `Your role does not hold <b>${esc(capLabel(cap))}</b> (${esc(cap)}). The attempt has been recorded in the audit trail.${switchBtn ? ' In demonstration mode, you may switch explicitly to the authorised account for this page, sheet or asset.' : ''}`,
    'lock', `<div class="row" style="justify-content:center;gap:8px;flex-wrap:wrap"><button class="btn btn-sm btn-ghost" data-act="go" data-v="home">Return to console home</button>${switchBtn}</div>`)}</div></div>`;
}

/* ---------------- Event routing ---------------- */
/* A committed action - submit, approve, decline, post, record - must never run
   twice because a finger bounced on a tablet. A second press inside 900 ms on
   the same control is ignored, and the control is visibly disabled during it. */
const COMMITTING = /^submit|^(create-backup|approve-op|request-restore|request-export|revoke-delegation|record-payment|commit-import)$/;
function duplicatePress(act){
  const now = Date.now();
  const last = APPX.lastAct;
  if(last && last.act===act && now-last.at < 900) return true;
  APPX.lastAct = {act, at:now};
  return false;
}
function onClick(e){
  if(e && e.target && e.target.closest && e.target.closest('#content') && typeof NAVP!=='undefined' && NAVP.foldForWorkspace){
    NAVP.foldForWorkspace('content-click');
  }
  const el = e.target.closest('[data-act]');
  if(!el) return;
  const act = el.dataset.act;
  if(el.disabled && act!=='noop') return;
  if(el.dataset.skip) return;
  const fn = ACTIONS[act];
  if(!fn){ if(act!=='noop') console.warn('No action', act); return; }
  e.preventDefault();
  if(COMMITTING.test(act)){
    if(duplicatePress(act)) return;
    el.setAttribute('aria-busy','true'); el.classList.add('is-busy');
  }
  try{ fn(el.dataset, el); }
  finally{ if(COMMITTING.test(act)) setTimeout(()=>{ el.classList.remove('is-busy'); el.removeAttribute('aria-busy'); }, 350); }
}
function onSubmit(e){
  const f = e && e.target && e.target.closest ? e.target.closest('[data-form]') : null;
  if(!f) return;
  e.preventDefault();
  const formName = f.dataset.form;
  if(formName !== 'login6' && formName !== 'mustchange6' && duplicatePress('form:'+formName)) return;
  const fn = FORMS[formName];
  if(fn) fn(new FormData(f), f);
}
function onChange(e){
  const el = e.target;
  if(el.dataset.filter){
    const params = {...APPX.params, [el.dataset.filter]: el.value};
    delete params.page;
    if(el.dataset.filter==='q'){
      clearTimeout(window.__qT);
      window.__qT = setTimeout(()=>go(el.dataset.view, params), 300);
    } else go(el.dataset.view, params);
    return;
  }
  if(el.dataset.orgtheme!==undefined){ ACTIONS['set-org-wtheme']({id:el.value}); return; }
  if(el.dataset.pyear!==undefined){ ACTIONS['set-programme-year']({month:el.value}); return; }
  if(el.dataset.set){ saveSetting(el.dataset.set, el.type==='checkbox'? el.checked : el.value); return; }
  if(el.dataset.setting){ SETTINGS.set(el.dataset.setting, el.type==='checkbox'? el.checked : el.value); return; }
  if(el.dataset.pref){ SETTINGS.pref(el.dataset.pref, el.type==='checkbox'? el.checked : el.value); return; }
}

/* ---------------- Actions ---------------- */
/* ---------------- Unsaved work ----------------
   A person filling a long form on a tablet may lose signal, battery or the
   page. A draft is held on this device only, is never sent to the central
   database as a record, and is applied only when the same person reopens the
   same form. Submitting is still the only way a record is created. */
function draftKey(formId){ return (AUTH.user? AUTH.user.id:'anon')+':'+formId; }
function saveDraft(formId, formEl){
  if(!formId || !formEl) return false;
  const o = {};
  let captured = false;
  try{
    new FormData(formEl).forEach((v,k)=>{ if(String(k).startsWith('purpose_')) return; o[k]=v; captured=true; });
  }catch(e){
    if(formEl.querySelectorAll){
      formEl.querySelectorAll('input[name],select[name],textarea[name]').forEach(el=>{
        if(String(el.name).startsWith('purpose_')) return;
        if(el.type==='checkbox') o[el.name] = el.checked ? 'on' : '';
        else if(el.type==='radio'){ if(el.checked) o[el.name] = el.value; }
        else o[el.name] = el.value;
        captured = true;
      });
    }
  }
  if(!captured && !Object.keys(o).length) return false;
  DB.db.drafts = DB.db.drafts||{};
  DB.db.drafts[draftKey(formId)] = { at:new Date().toISOString(), values:o, form:formId };
  DB.save();
  return true;
}
function loadDraft(formId){ return (DB.db.drafts||{})[draftKey(formId)]||null; }
function clearDraft(formId){
  if(DB.db.drafts && DB.db.drafts[draftKey(formId)]){ delete DB.db.drafts[draftKey(formId)]; DB.save(); }
}
function applyDraft(formId, root){
  const d = loadDraft(formId);
  const form = root.querySelector('form[data-form="'+formId+'"]') || root.querySelector('form');
  if(!d || !form) return false;
  Object.entries(d.values).forEach(([k,v])=>{
    const el = form.querySelector('[name="'+k+'"]');
    if(!el) return;
    if(el.type==='checkbox') el.checked = (v==='on'||v==='true');
    else el.value = v;
  });
  return true;
}
function draftBanner(formId){
  const d = loadDraft(formId);
  if(!d) return '';
  return `<div class="alert warn" style="margin-bottom:12px">${ic('save',17)}<div style="flex:1"><b>Unsent draft restored</b>
    <span class="small">Saved on this device at ${fmtDateTime(d.at)}. Nothing has been submitted. Check every field before you continue.</span></div>
    <button type="button" class="btn btn-xs btn-ghost" data-act="discard-draft" data-draftid="${esc(formId)}">Discard</button></div>`;
}

const ACTIONS = {
  'page':(d)=>{ if(d.skip) return; go('patients',{...APPX.params,page:d.page}); },
  'save-draft':(d)=>{ const fid=d.draftid||d.form; const f=document.querySelector('form[data-form="'+fid+'"]'); if(!f) return;
    saveDraft(fid, f); toast('Draft saved','Held on this device only. It has not been submitted.','ok'); },
  'draft-save-close':(d)=>{
    const fid=d.draftid||d.form;
    const f=document.querySelector('form[data-form="'+fid+'"]') || document.querySelector('.modal-b form');
    if(fid && f) saveDraft(fid, f);
    closeModal(true);
    toast('Draft saved','Stored on this device. Returned cleanly to your console.','ok');
  },
  'discard-draft':(d)=>{ const fid=d.draftid||d.form; clearDraft(fid); closeModal(true); toast('Draft discarded','It will not be restored.','warn'); },
  'set-landing-theme':(d)=>{
    if(!(RBAC.has(AUTH.user,'system.config')||RBAC.has(AUTH.user,'org.manage')))
      return toast('Not permitted','Only a system administrator may change the landing page identity.','err');
    const t = LANDING_THEMES.find(x=>x.id===d.id);
    if(!t) return toast('Unknown theme','The selected theme is not available. The default remains in use.','err');
    const before = DB.db.settings.landingTheme||DEFAULT_THEME;
    DB.db.settings.landingTheme = t.id;
    AUDIT.append({actor:AUTH.user.id,action:'landing.theme_changed',entity:'setting',entityId:'landingTheme',
      detail:`${before} to ${t.id}`});
    DB.save(); toast('Landing page updated', t.name+' is now the front door.','ok');
    render();
  },
  'preview-theme':(d)=>{
    const t = LANDING_THEMES.find(x=>x.id===d.id)||LANDING_THEMES[0];
    const prev = DB.db.settings.landingTheme;
    /* A preview must not change what anyone else sees, so it is drawn from the
       same renderer into a frame rather than by saving the setting. */
    DB.db.settings.landingTheme = t.id;
    let html='';
    try{ html = renderLanding(); } finally { DB.db.settings.landingTheme = prev; }
    openModal({title:'Landing preview', sub:`${t.name} · ${t.mode==='dark'?'dark':'light'} · nothing has been saved`, wide:true,
      body:`<div class="theme-preview-wrap"><div class="theme-preview-inner">${html}</div></div>
        <div class="row" style="margin-top:12px"><span class="chip">${esc(t.blurb)}</span></div>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Close</button>
        <button class="btn btn-primary" data-act="set-landing-theme" data-id="${t.id}" ${prev===t.id?'disabled':''}>${prev===t.id?'Already in use':'Apply this theme'}</button>`});
  },
  'goto-public':()=>{ APPX.screen='public'; APPX.params={}; refreshPublicFeed(); render(); window.scrollTo({top:0}); },
  'my-profile':()=>{
    const u=AUTH.user;
    openModal({title:'My profile', sub:'Your own record. Changes are audited and cannot alter your role or permissions.', wide:true, body:`
      <form data-form="profile" id="profileForm">
        <div class="row" style="gap:16px;align-items:flex-start;margin-bottom:14px">
          ${avatarFor(u.name, roleObj(u.roleId)?.accent, u.photo)}
          <div class="grow">
            ${field('Profile photograph','photo','file',{accept:'image/png,image/jpeg',hint:'JPEG or PNG, up to 120 KB. No other file type is accepted.'})}
            ${u.photo?`<label class="small"><input type="checkbox" name="removePhoto"> Remove the current photograph</label>`:''}
            <div class="xs muted" style="margin-top:4px">A photograph is optional. It is visible only to signed-in colleagues.</div>
          </div>
        </div>
        <div class="grid g2">
          ${field('Full name','name','text',{required:true,value:u.name})}
          ${field('Preferred display name','displayName','text',{value:u.displayName||''})}
          ${field('Job title','jobTitle','text',{value:u.jobTitle||''})}
          ${field('Professional designation','designation','text',{value:u.designation||'',hint:'For clinical staff, as registered'})}
          ${field('Work telephone','phone','text',{value:u.phone||''})}
          ${field('Work email','email','email',{value:u.email||''})}
        </div>
        <div class="divider"></div>
        <div class="grid g3">
          <div><div class="label">Department</div><div class="small">${esc(deptName(u.departmentId))}</div></div>
          <div><div class="label">County office</div><div class="small">${esc(countyName(u.countyId))}</div></div>
          <div><div class="label">Ministry areas</div><div class="small">${esc((u.areaIds||[]).map(areaName).join(', ')||'None assigned')}</div></div>
        </div>
        <div class="alert info" style="margin-top:14px">${ic('info',16)}<div><span class="small">Role, department and ministry areas are changed by the Chief Programme Administrator through the registry. They are shown here for confirmation and cannot be edited from this form.</span></div></div>
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" data-act="submit-profile">Save profile</button>`});
  },
  'submit-profile':()=>{
    const f=$('#profileForm'); if(!f) return;
    const d=new FormData(f); const u=AUTH.user;
    const file=d.get('photo');
    const finish=(photo)=>{
      u.name=String(d.get('name')||u.name).slice(0,80);
      u.displayName=String(d.get('displayName')||'').slice(0,60);
      u.jobTitle=String(d.get('jobTitle')||'').slice(0,80);
      u.designation=String(d.get('designation')||'').slice(0,80);
      u.phone=String(d.get('phone')||'').slice(0,30);
      u.email=String(d.get('email')||'').slice(0,80);
      if(d.get('removePhoto')==='on') u.photo=null;
      else if(photo) u.photo=photo;
      AUDIT.append({actor:u.id,action:'profile.updated',entity:'user',entityId:u.id,
        detail:'Own profile fields updated'+(photo?' including photograph':'')});
      DB.save(); closeModal(true); toast('Profile saved','','ok'); render();
    };
    if(file && file.size>0){
      if(!/^image\/(png|jpeg)$/.test(file.type)) return toast('Not accepted','Only a PNG or JPEG image is accepted.','err');
      if(file.size>120*1024) return toast('Too large','Keep the photograph under 120 KB. A phone portrait usually needs reducing.','err');
      const fr=new FileReader();
      fr.onload=()=>{
        const data=String(fr.result||'');
        /* Trust the bytes, not the extension: only real PNG/JPEG are stored. */
        if(!/^data:image\/(png|jpeg);base64,/.test(data)) return toast('Not accepted','The file is not a readable image.','err');
        finish(data);
      };
      fr.onerror=()=>toast('Could not read the file','Choose another photograph.','err');
      fr.readAsDataURL(file);
      return;
    }
    finish(null);
  },
  'new-enquiry':()=>{
    openModal({title:'Log a public enquiry', narrow:true, body:`<form data-form="enquiry" id="enqForm">
      ${field('From','from','text',{required:true,hint:'Name and organisation, or "Anonymous"'})}
      ${field('Channel','channel','select',{options:[{v:'phone',l:'Telephone'},{v:'email',l:'Email'},{v:'walk_in',l:'Walk-in'},{v:'social',l:'Social media'},{v:'letter',l:'Letter'}]})}
      ${field('Subject','subject','text',{required:true})}
      ${field('What was asked','detail','textarea',{required:true})}
    </form>`, footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-act="submit-enquiry">Log it</button>`});
  },
  'submit-enquiry':()=>{
    const d=new FormData($('#enqForm'));
    DB.db.enquiries=DB.db.enquiries||[];
    DB.db.enquiries.unshift({id:uid('enq'), from:d.get('from'), channel:d.get('channel'), subject:d.get('subject'),
      detail:d.get('detail'), at:new Date().toISOString(), status:'open', loggedBy:AUTH.user.id, demo:false});
    AUDIT.append({actor:AUTH.user.id,action:'enquiry.logged',entity:'enquiry',entityId:'new',detail:String(d.get('subject')).slice(0,80)});
    DB.save(); closeModal(true); toast('Enquiry logged','It is now tracked to a reply.','ok'); render();
  },
  'answer-enquiry':(d)=>{
    const e=(DB.db.enquiries||[]).find(x=>x.id===d.id); if(!e) return;
    openModal({title:'Answer enquiry', sub:e.subject, narrow:true, body:`
      <p class="small muted" style="margin-bottom:10px">${esc(e.detail||'')}</p>
      <form data-form="enquiry-answer" id="enqA"><input type="hidden" name="id" value="${e.id}">
        ${field('What was said, in summary','answer','textarea',{required:true,hint:'The full reply is sent outside the system; this is the record of it.'})}
        ${field('Was information requested from another department?','referral','select',{options:[{v:'',l:'No'},{v:'data',l:'Data department - verified statistics'},{v:'media',l:'Media department - approved material'},{v:'finance',l:'Finance - approved figures'}]})}
      </form>`, footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-act="submit-enquiry-answer">Record the reply</button>`});
  },
  'submit-enquiry-answer':()=>{
    const d=new FormData($('#enqA')); const e=(DB.db.enquiries||[]).find(x=>x.id===d.get('id')); if(!e) return;
    e.status='answered'; e.answer=d.get('answer'); e.answeredBy=AUTH.user.id; e.answeredAt=new Date().toISOString();
    e.referral=d.get('referral')||null;
    AUDIT.append({actor:AUTH.user.id,action:'enquiry.answered',entity:'enquiry',entityId:e.id,detail:(e.referral?'Information requested from '+e.referral:'Answered directly')});
    DB.save(); closeModal(true); toast('Reply recorded','','ok'); render();
  },
  'open-thread':(d)=>{ go('messages',{thread:d.thread, mode:d.mode||'all', focusChat:'1'}); },
  'compose-message':(d)=>{
    if(!RBAC.can(AUTH.user,'message.use').ok) return toast('Not available','Your role may not send messages.','err');
    if(d && d.to){
      const dmThread = 'dm:'+[AUTH.user.id, d.to].sort().join(':');
      go('messages', {thread:dmThread, to:d.to, focusChat:'1'});
      setTimeout(()=>{ const el=document.querySelector('#msgComposeInput'); if(el) el.focus(); }, 30);
      return;
    }
    const people = DB.db.users.filter(u=>MESSAGING.inReach(AUTH.user,u));
    const globals = [{v:'global:all', l:'Global Foundation Broadcast (All Staff)'}].concat(COUNTIES.map(c=>({v:'global:'+c.id, l:`County Broadcast: ${c.name}`})));
    const areas = COUNTIES.flatMap(c=>c.areas.map(a=>({v:'area:'+a.id, l:`Ministry Area Chat: ${a.name} (${c.name})`})));
    const depts = DEPARTMENTS.map(x=>({v:'dept:'+x.id, l:'Department Chat: '+x.name}));
    openModal({title:'New Coordination Message', narrow:true, sub:'Global Messaging, Ministry Area / Department Chat, or Direct Colleague Chat. Patient identifiers are refused.', body:`
      <form data-form="message-new" id="msgNew">
        ${field('Channel or Recipient','to','select',{required:true,value:d.to||'',options:globals.concat(areas).concat(depts).concat(people.map(u=>({v:u.id,l:u.name.replace(/^Demo - /,'')+' · '+(roleObj(u.roleId)?.name||'')})))})}
        ${field('Message','text','textarea',{required:true,hint:'Do not include a patient name, CCC number or clinical detail. Use the patient record for clinical notes.'})}
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-ghost" data-act="save-compose-draft">Save Draft</button>
        <button class="btn btn-primary" data-act="submit-message">Send Message</button>`});
  },
  'save-compose-draft':()=>{
    const f=$('#msgNew'); if(!f) return;
    const d=new FormData(f);
    const to=String(d.get('to')||'global:all');
    const text=String(d.get('text')||'').trim();
    if(!text) return toast('Message text required','','warn');
    const thread = (to.startsWith('dept:')||to.startsWith('area:')||to.startsWith('global:')) ? to : 'dm:'+[AUTH.user.id,to].sort().join(':');
    DB.db.workspaceDrafts = DB.db.workspaceDrafts || [];
    DB.db.workspaceDrafts.unshift({
      id:uid('wdr'), kind:'message', title:`Draft Message — ${to}`, ownerId:AUTH.user.id,
      countyId:AUTH.user.countyId||'kisumu', dept:AUTH.user.departmentId||'ministry',
      targetView:'messages', targetParams:{thread, draftText:text, focusChat:'1'},
      summary:text.slice(0,140), payload:{thread, text}, updatedAt:todayISO(), status:'draft'
    });
    DB.save(); closeModal(true); toast('Draft message saved','View all drafts anytime under Workspace Drafts.','ok'); render();
  },
  'submit-message':()=>{
    const f=$('#msgNew'); if(!f) return;
    const d=new FormData(f);
    const to=d.get('to')||'';
    const text=String(d.get('text')||'').trim();
    if(!text) return toast('Nothing to send','','err');
    const thread = (to.startsWith('dept:')||to.startsWith('area:')||to.startsWith('global:'))? to : 'dm:'+[AUTH.user.id,to].sort().join(':');
    const r=MESSAGING.send(AUTH.user, {thread, text});
    if(r.error) return toast('Not sent', r.error, 'err');
    clearDraft('message-new');
    closeModal(true); toast('Message sent','Delivered to the authorised channel / recipient.','ok'); go('messages',{thread});
  },
  'new-publication':()=>{
    openModal({title:'New media item', sub:'It starts as a draft. Nothing is public until an authorised person publishes it.', body:`
      <form data-form="publication" id="pubForm">
        ${field('Title','title','text',{required:true})}
        <div class="grid g2">
          ${field('Category','category','select',{options:PUBLICATION_CATEGORIES.map(c=>({v:c.id,l:c.label}))})}
          ${field('Format','format','select',{options:[{v:'article',l:'Written article'},{v:'video',l:'Video feature'},{v:'audio',l:'Audio'},{v:'podcast',l:'Podcast episode'},{v:'photo',l:'Photo essay'}]})}
          ${field('Duration (optional)','duration','text',{hint:'As it will be shown to the public, e.g. 4 min 12 s'})}
          ${field('Publication date, if scheduled','scheduledAt','date',{})}
        </div>
        ${field('Summary','summary','textarea',{required:true,hint:'Two or three sentences. This is what the public portal shows.'})}
        ${field('Body','body','textarea',{hint:'The full text. Leave empty for media that is produced elsewhere.'})}
        ${field('Linked patient (only with recorded storytelling consent)','patientId','select',{options:[{v:'',l:'No patient is identified'}].concat((DB.db.patients||[]).filter(p=>GOV.consentFor(p,'storytelling').ok).map(p=>({v:p.id,l:p.code+' - '+p.name}))),hint:'Only patients whose storytelling consent is granted appear in this list.'})}
        <label class="switch" style="margin-top:8px"><input type="checkbox" name="public" checked><span class="track"></span> Eligible for the public portal once published</label>
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" data-act="submit-publication">Save draft</button>`});
  },
  'submit-publication':()=>{
    const d=new FormData($('#pubForm'));
    const pt = d.get('patientId')? DB.db.patients.find(p=>p.id===d.get('patientId')) : null;
    if(pt && !GOV.consentFor(pt,'storytelling').ok) return toast('Not permitted','Storytelling consent is not in force for that patient.','err');
    const it={ id:uid('pub'), title:String(d.get('title')||'').trim(), category:d.get('category'), format:d.get('format'),
      duration:d.get('duration')||'', scheduledAt:d.get('scheduledAt')||null, summary:d.get('summary'), body:d.get('body')||'',
      patientId:pt?pt.id:null, public:d.get('public')==='on', status:'draft', createdBy:AUTH.user.id,
      createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), versions:[], demo:false };
    if(!it.title) return toast('Title required','','err');
    DB.db.publications = DB.db.publications||[];
    DB.db.publications.unshift(it);
    AUDIT.append({actor:AUTH.user.id,action:'publication.created',entity:'publication',entityId:it.id,detail:it.title});
    DB.save(); closeModal(true); toast('Draft created','Submit it for review when it is ready.','ok'); render();
  },
  'publication-open':(d)=>{
    const it=(DB.db.publications||[]).find(x=>x.id===d.id); if(!it) return;
    const canPublish=RBAC.has(AUTH.user,'media.publish');
    const next = { draft:['review','Submit for review'], review:['approved','Approve'], approved:['published','Publish now'],
      scheduled:['published','Publish now'], published:['unpublished','Unpublish'], unpublished:['review','Return to review'], archived:[] }[it.status]||[];
    openModal({title:it.title, sub:`${titleCase(it.category)} · ${titleCase(it.status)} · created ${fmtDate(it.createdAt)} by ${esc(userName(it.createdBy))}`, wide:true, body:`
      <div class="row" style="gap:8px;margin-bottom:12px">${pubBadge(it.status)}${it.public?badge('Eligible for public portal','b-ok','nodot'):badge('Withheld from public portal','b-neutral','nodot')}
        ${it.patientId?badge('Linked patient','b-warn','nodot'):''}</div>
      <p style="font-size:14px;color:var(--ink-2)">${esc(it.summary)}</p>
      ${it.body?`<div class="divider"></div><div class="portal-reader">${esc(it.body).split('\n').filter(Boolean).map(p=>`<p>${p}</p>`).join('')}</div>`:''}
      <div class="divider"></div>
      <div class="label">History</div>
      <div class="col" style="gap:4px">
        <div class="xs muted">${fmtDateTime(it.createdAt)} · created · ${esc(userName(it.createdBy))}</div>
        ${(it.versions||[]).map(v=>`<div class="xs muted">${fmtDateTime(v.at)} · ${esc(v.action)} · ${esc(userName(v.by))}${v.note?' · '+esc(v.note):''}</div>`).join('')}
      </div>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Close</button>
        ${canPublish&&it.status!=='published'?`<button class="btn btn-ghost" data-act="publication-withdraw" data-id="${it.id}">Withdraw</button>`:''}
        ${next.length?`<button class="btn btn-primary" data-act="publication-advance" data-id="${it.id}" data-to="${next[0]}">${esc(next[1])}</button>`:''}`});
  },
  'publication-advance':(d)=>{
    const it=(DB.db.publications||[]).find(x=>x.id===d.id); if(!it) return;
    const to=d.to;
    if(['approved','published','unpublished','archived'].includes(to) && !RBAC.has(AUTH.user,'media.publish'))
      return toast('Not permitted','Only a holder of the publication authority may approve or publish.','err');
    if(to==='published'){
      if(it.patientId){
        const p=DB.db.patients.find(x=>x.id===it.patientId);
        const g=p?GOV.consentFor(p,'storytelling'):{ok:false,reason:'The linked patient no longer exists'};
        if(!g.ok) return toast('Publication blocked', g.reason, 'err');
      }
      if(it.category==='story' && !it.patientId)
        return toast('Story not cleared','A story about a patient must be linked to the patient and to a recorded storytelling consent.','err');
      it.publishedAt = it.scheduledAt && new Date(it.scheduledAt) > new Date() ? it.scheduledAt : new Date().toISOString();
    }
    it.status=to; it.updatedAt=new Date().toISOString();
    it.versions=[...(it.versions||[]), {at:new Date().toISOString(), by:AUTH.user.id, action:to}];
    AUDIT.append({actor:AUTH.user.id,action:'publication.'+to,entity:'publication',entityId:it.id,detail:it.title});
    DB.save(); closeModal(true); toast('Item '+to, to==='published'?'It is now visible on the public portal.':'','ok'); render();
  },
  'publication-withdraw':(d)=>{
    const it=(DB.db.publications||[]).find(x=>x.id===d.id); if(!it) return;
    it.status='unpublished'; it.public=false; it.withdrawn=true; it.withdrawnAt=new Date().toISOString(); it.withdrawnBy=AUTH.user.id;
    it.versions=[...(it.versions||[]), {at:new Date().toISOString(), by:AUTH.user.id, action:'withdrawn'}];
    AUDIT.append({actor:AUTH.user.id,action:'publication.withdrawn',entity:'publication',entityId:it.id,detail:it.title});
    DB.save(); closeModal(true); toast('Withdrawn','It has been removed from the public portal and the register still holds it.','warn'); render();
  },
  'portal-cat':(d)=>{ APPX.screen='public'; APPX.params={...(APPX.params||{}), cat:d.cat||''}; render(); },
  'portal-mode':(d)=>{ APPX.screen='public'; APPX.params={...(APPX.params||{}), mode:d.mode==='partner'?'partner':'public'}; render(); },
  'goto-console-partner':()=>{
    if(!AUTH.user){ APPX.screen='login'; render(); return; }
    APPX.screen='app';
    if(RBAC.has(AUTH.user,'gov.oversight')) go('govdashboard');
    else if(RBAC.has(AUTH.user,'ccc.desk')) go('cccdesk');
    else if(RBAC.has(AUTH.user,'intl.medical')) go('intlmedical');
    else go('home');
  },
  'portal-open':(d)=>{
    /* Two kinds of item reach the public portal: the Foundation's own published
       programme content, and an item an authorised person approved for release
       from the publication register. Both open the same way. */
    const org=(typeof PORTAL_CONTENT!=='undefined')? (PORTAL_CONTENT.news||[]).find(x=>x.id===d.id) : null;
    const it=org || (DB.db.publications||[]).find(x=>x.id===d.id && x.status==='published' && x.public!==false);
    if(!it) return toast('Not available','This item is not published.','err');
    const photo = it.photoKey && typeof carelinkPhoto==='function' ? carelinkPhoto(it.photoKey) : '';
    const C = (typeof PORTAL_CONTENT!=='undefined')? PORTAL_CONTENT : {contact:{}};
    openModal({title:it.title, sub:`${esc(it.tag|| (PUBLICATION_CATEGORIES.find(c=>c.id===it.category)||{}).label || it.category)} · ${fmtDate(it.publishedAt||it.date)}`, wide:true, body:`
      ${photo?`<div class="portal-reader-art"><img src="${photo}" alt="${esc(it.title)}"></div>`:''}
      <div class="portal-reader">${it.body? esc(it.body).split('\n').filter(Boolean).map(p=>`<p>${p}</p>`).join('') : `<p class="muted">${esc(it.summary||'')}</p>`}</div>
      ${it.category==='video'||it.category==='audio'?`<div class="alert info" style="margin-top:10px">${ic('info',16)}<div><span class="small">This demonstration does not host media files. In production the approved file or feed address is attached to the item by the Media department.</span></div></div>`:''}
      ${org?`<div class="portal-reader-src">${ic('link',14)}<span class="small">Published by ${esc(C.org?C.org.name:'LOMAMO Foundation Kenya')} · <a href="${esc(C.contact?C.contact.updates:'https://lovemattersmost.org/updates/')}" target="_blank" rel="noopener noreferrer">lovemattersmost.org/updates</a></span></div>`:''}`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Close</button>${org?`<a class="btn btn-primary" href="${esc(C.contact?C.contact.website:'https://lovemattersmost.org/')}" target="_blank" rel="noopener noreferrer">Visit our website</a>`:''}`});
  },
  'goto-login':()=>{ if(AUTH.user){ APPX.screen='app'; render(); } else { APPX.screen='login'; APPX.dirty=false; render(); } window.scrollTo({top:0}); },
  'goto-landing':()=>{ APPX.screen='landing'; render(); window.scrollTo({top:0}); },
  'open-sync':()=>openSyncModal(),
  'set-setting':(d)=>{ SETTINGS.set(d.path, d.value); },
  'set-pref':(d)=>{ SETTINGS.pref(d.key, d.value); },
  'care-log':(d)=>openCareLog(d.id),
  'care-incident':(d)=>openCareIncident(d.id),
  'care-incident-close':(d)=>openCareIncidentClose(d.id),
  'condition-record':(d)=>openConditionRecord(d.id),
  'condition-confirm':(d)=>{ const r=COND.confirm(AUTH.user,d.id); toast(r.ok?'Diagnosis confirmed':'Cannot confirm', r.ok?'The confirmation is recorded against your name.':r.msg, r.ok?'ok':'err'); render(); },
  'delegation-issue':()=>openDelegationIssue(),
  'delegation-revoke':(d)=>confirmDialog('Revoke this delegation?','The colleague loses the delegated capabilities immediately. The record stays in the audit trail.',
      ()=>{ const r=DELEGATION.revoke(AUTH.user,d.id,'Revoked by the delegating officer'); toast(r.ok?'Delegation revoked':r.msg, r.ok?'The authority has ended.':'', r.ok?'ok':'err'); render(); },'Revoke',true),
  'pdca-complete':(d)=>openPdcaComplete(d.id, d.day),
  'pdca-extension':(d)=>openPdcaExtension(d.id),
  'ai-probe':()=>probeAI(),
  'sync-merge':()=>{ closeModal(); go('mergejournal'); },
  'sync-retry':()=>{ closeModal(); SYNC.start(); },
  'sync-auth':()=>{
    const f=document.querySelector('#syncAuthForm'); if(!f) return;
    const pw=new FormData(f).get('password')||'';
    SYNC.reauth(pw).then(ok=>{
      if(ok){ closeModal(true); toast('Reconnected','The shared online source is reachable again.','ok'); }
      else toast('Not accepted', SYNC.message||'The password was not accepted.','err');
    });
  },
  go:(d)=>{
    APPX.showUserMenu=false;
    closeAllModals();
    const params={};
    Object.keys(d||{}).forEach(k=>{ if(k!=='act'&&k!=='v'&&k!=='skip'&&d[k]!==undefined) params[k]=d[k]; });
    go(d.v, params);
  },
  'close-modal':()=>closeModal(),
  'modal-close':()=>closeModal(),
  'confirm-yes':()=>{ const f=window.__confirmYes; window.__confirmYes=null; f&&f(); },
  /* There is no permanent side panel. This opens the console's own map, on
     demand, and closes again: every page that belongs to this console, in the
     order this person's role places it. */
  'toggle-nav':()=>{ ACTIONS['open-console-map'](); },
  'open-console-map':()=>{
    const groups = navModel(AUTH.user);
    openModal({title:'Pages in this console', sub:`${roleObj(AUTH.user.roleId)?.consoleTitle||'Console'} · ${groups.reduce((n,g)=>n+g.items.length,0)} pages your role may open`, wide:true,
      body:`<div class="cmap">${groups.map(g=>`<div class="cmap-g">
        <div class="cmap-h">${esc(g.label)}</div>
        ${g.items.map(i=>`<button class="cmap-i ${APPX.view===i.id?'on':''}" data-act="go" data-v="${i.id}">
          ${ic(i.icon,16)}<span>${esc(i.label)}</span>${i.count?`<span class="tcount">${i.count}</span>`:''}</button>`).join('')}
      </div>`).join('')}
      <div class="cmap-g"><div class="cmap-h">This account</div>
        <button class="cmap-i" data-act="go" data-v="settings">${ic('settings',16)}<span>Preferences</span></button>
        <button class="cmap-i" data-act="change-password">${ic('lock',16)}<span>Change password</span></button>
        <button class="cmap-i" data-act="logout">${ic('logout',16)}<span>Sign out</span></button>
      </div></div>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Close</button>`});
  },
  /* Navigation pane (v5.1). On a narrow screen the pane is a drawer. */
  'nav-back':()=>{
    if(modalStack.length){ closeModal(); return; }
    if(NAVH.back()) return;
    const childParent = { patient:'patients', form:'forms', careplan:'careplans', report:'reports', 'care-resident':'care' };
    if(childParent[APPX.view]) { go(childParent[APPX.view]); return; }
    toast('Nothing earlier','You are at the first page you opened.','info');
  },
  'nav-forward':()=>{ if(!NAVH.forward()) toast('Nothing later','You are at the latest page you opened.','info'); },
  'nav-open':()=>{ if(NAVP.narrow()){ APPX.navOpen=true; render(); } else ACTIONS['open-console-map'](); },
  'nav-close':()=>{ APPX.navOpen=false; render(); },
  'nav-group':(d)=>{ NAVP.toggleGroup(AUTH.user, d.g, Number(d.i)||0); render(); },
  'nav-rail':()=>{
    const pr = NAVP.prefs(AUTH.user);
    const cur = NAVP.effectiveRail(AUTH.user, APPX.view);
    if(pr.autoFold !== false && !pr.rail){
      if(cur) NAVP.expandTemporarily();
      else NAVP.foldForWorkspace('rail-btn');
    } else {
      NAVP.setPref(AUTH.user, 'navRail', !cur);
    }
    render();
  },
  'nav-autofold':()=>{
    NAVP.enableAutoFold(AUTH.user);
    toast('Navigation auto-fold updated', NAVP.prefs(AUTH.user).autoFold ? 'Left pane now folds automatically for widescreen view when scrolling or working in the workspace.' : 'Left pane pinned open.', 'info');
    render();
  },
  /* Workspace themes, font styles & installable visual packs. Personal; never touches permissions or data. */
  'wtheme-open':(d={})=>{ openThemePicker(d.tab||'themes'); },
  'wtheme-open-packs':()=>{ openThemePicker('packs'); },
  'wtheme-tab':(d={})=>{ closeModal(true); openThemePicker(d.tab||'themes'); },
  'wtheme-more':()=>{ closeAllModals(); go('settings',{section:'appearance'}); },
  'studio-set':(d)=>{ const r=WTHEME.setStudio(AUTH.user, d.key, d.value); if(!r.ok) return toast('Not changed', r.msg, 'err'); render(); },
  'studio-font-pick':(d={})=>{
    const r = WTHEME.setStudio(AUTH.user, 'font', d.value);
    if(!r.ok) return toast('Font not changed', r.msg, 'err');
    closeModal(true); openThemePicker('fonts'); render();
    toast('Font family applied', 'Updated workspace headings and body typography.', 'ok');
  },
  'pref-scale':(d={})=>{
    const sc = Number(d.scale)||100;
    DB.db.personalPrefs[AUTH.user.id] = DB.db.personalPrefs[AUTH.user.id] || {};
    DB.db.personalPrefs[AUTH.user.id].textScale = sc;
    DB.save(); applyTheme();
    if(document.querySelector('#modalRoot .modal')){ closeModal(true); openThemePicker('fonts'); }
    render();
    toast('Text scale updated', `${sc}% typography active.`, 'ok');
  },
  'install-visual-pack':(d={})=>{
    const r = WTHEME.installPack(AUTH.user, d.id);
    if(!r.ok) return toast('Pack not applied', r.msg, 'err');
    if(document.querySelector('#modalRoot .modal')){ closeModal(true); openThemePicker('packs'); }
    render();
    toast('Visual Pack Activated', `${r.pack.name} installed and applied to your console.`, 'ok');
  },
  'import-visual-pack-json':()=>{
    const el = document.querySelector('#customVisualPackJson');
    const raw = el ? el.value : '';
    const r = WTHEME.importCustomPack(AUTH.user, raw);
    if(!r.ok) return toast('Could not install pack', r.msg, 'err');
    closeModal(true); openThemePicker('packs'); render();
    toast('Custom Visual Pack Installed', `${r.pack.name} added to your pack library and activated.`, 'ok');
  },
  'export-visual-pack':()=>{
    const json = WTHEME.exportCurrentPack(AUTH.user);
    const blob = new Blob([json], { type:'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `CareLink-Visual-Pack-${AUTH.user.username}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 3000);
    toast('Visual Pack Exported', 'Downloaded your active theme & font configuration (.json).', 'ok');
  },
  'studio-preset':(d)=>{ const r=WTHEME.applyPreset(AUTH.user, d.id); if(!r.ok) return toast('Not applied', r.msg, 'err'); render(); toast('Look applied', r.preset.name+'. Only you see this. Reset it any time in Preferences.','ok'); },
  'studio-reset':()=>{ WTHEME.resetStudio(AUTH.user); render(); toast('Studio reset','Your colours and shapes are back to the theme.','ok'); },
  'set-wtheme':(d)=>{
    const r = WTHEME.choose(AUTH.user, d.id);
    if(!r.ok){ toast('Theme not changed', r.msg, 'err'); return; }
    closeAllModals(); render();
    const t = WTHEME.byId(d.id);
    toast('Theme applied', d.id==='auto'? 'Following this tablet: Daylight by day, Night ward when the tablet is in dark mode.' : t.name+'. Only you see this choice.', 'ok');
  },
  'set-org-wtheme':(d)=>{
    const r = WTHEME.setOrgDefault(AUTH.user, d.id);
    if(!r.ok){ toast('Not changed', r.msg, 'err'); return; }
    toast('Organisation default saved','People who have not chosen their own theme now see it.','ok'); render();
  },
  'toggle-user-menu':()=>{ userMenu(); },
  logout:()=>{
    SESSION.stop();
    if(typeof SYNC!=='undefined') SYNC.logout();
    closeAllModals();
    AUTH.logout();
    APPX.aiOpen=false; APPX.showUserMenu=false; APPX.navOpen=false;
    const d=document.querySelector('.ai-dock'); if(d) d.remove();
    /* Return to the public front page, never straight into another sign-in panel. */
    NAVH.reset(); APPX.screen='landing'; APPX.view='home'; APPX.params={};
    try{ history.replaceState(null,'','#/'); }catch(e){}
    render();
  },
  print:()=>{ try{ window.print(); }catch(e){ toast('Printing blocked','Open the file in a browser tab to print.','warn'); } },
  'quick-login':(d)=>{
    if((typeof demoEntryBlocked === 'function' && demoEntryBlocked()) || (typeof PROD_SETUP !== 'undefined' && PROD_SETUP.isGloballyActivated && PROD_SETUP.isGloballyActivated())){
      LOGIN6.tab = 'signin'; APPX.screen = 'login';
      toast('Demonstration locked', 'Use an officially provisioned staff account after global activation.', 'warn');
      render();
      return;
    }
    const u = DB.db.users.find(x=>x.username===d.u);
    const r = AUTH.login(d.u,'LOMAMO2026');
    if(!r.ok){ toast('Sign-in failed', r.msg||'Use the password LOMAMO2026 for demonstration accounts.','err'); return; }
    SESSION.start();
    go('home');
    toast('Signed in', `${u.jobTitle} - ${countyName(u.countyId)}`, 'ok');
  },
  'load-reference':()=>{
    if(typeof PROD_SETUP !== 'undefined' && PROD_SETUP.isGloballyActivated && PROD_SETUP.isGloballyActivated()) return toast('Reference data locked', 'Synthetic reference data cannot be loaded into the globally activated installation.', 'err');
    if(!RBAC.has(AUTH.user,'system.import')) return toast('Not permitted','Only a system administrator may load the reference register.','err');
    const n = DB.seedOfficial({patients:3333});
    AUDIT.append({actor:AUTH.user.id,action:'register.reference_loaded',entity:'system',entityId:'register',
      detail:`${n} synthetic patients loaded as the reference register`});
    DB.save();
    toast('Reference register loaded', `${n} synthetic patients. Every record is labelled synthetic and can be cleared from Settings.`, 'ok');
    render();
  },
  'onboard-start':()=>{
    if(typeof PROD_SETUP !== 'undefined' && PROD_SETUP.isGloballyActivated && PROD_SETUP.isGloballyActivated()) return toast('Setup locked', 'This installation is already globally activated.', 'err');
    DB.db.settings.onboarding.step=2; DB.save(); render();
  },
  'onboard-finish':()=>{
    if(typeof PROD_SETUP !== 'undefined' && PROD_SETUP.isGloballyActivated && PROD_SETUP.isGloballyActivated()) return toast('Setup locked', 'This installation is already globally activated.', 'err');
    DB.db.settings.onboarding.complete=true; DB.db.settings.onboarding.step=3;
    AUDIT.append({actor:AUTH.user?.id||'system',action:'system.bootstrap',entity:'system',entityId:'org',detail:'Organisational structure confirmed'});
    DB.save(); go('home'); toast('Installation ready','Organisational structure confirmed. Create accounts through the approval workflow.','ok');
  },
  'patient-tab':(d)=>{ go('patient',{id:d.id,tab:d.tab}); },
  'open-patient':(d)=>{
    const p = repo.patient(AUTH.user,d.id);
    if(!p) return toast('Access denied','This patient is outside your authorised scope. The attempt was logged.','err');
    go('patient',{id:d.id});
  },
  'req-filter':(d)=>{ go('requests',{status:d.status}); },
  /* Official CareLink C-DIMS PDCA 120-Day & Discharge Summary, Referral, Hospital Post-Visit Follow-Up */
  'open-discharge-summary':(d={})=>{ PAT_DISCHARGE.openModal(d.id, AUTH.user, { mode: d.mode||'auto', subview: d.subview||'official' }); },
  'pdca-sheet-mode':(d={})=>{
    PAT_DISCHARGE._sheetMode = d.mode || 'auto';
    PAT_DISCHARGE._sheetSubview = d.subview || 'official';
    if(document.querySelector('#modalRoot .modal')){ closeModal(true); PAT_DISCHARGE.openModal(d.id, AUTH.user, { mode: d.mode||'auto', subview: d.subview||'official' }); }
    else render();
  },
  'export-pdca-word':(d={})=>{ PAT_DISCHARGE.exportWord(d.id, AUTH.user, d.mode||'auto'); },
  'export-pdca-json':(d={})=>{ PAT_DISCHARGE.exportMergeJson(d.id, AUTH.user, d.mode||'auto'); },
  'print-discharge-summary':(d={})=>{
    const p = repo.patient(AUTH.user, d.id) || (DB.db.patients||[]).find(x=>x.id===d.id);
    if(p && typeof PAT_DISCHARGE!=='undefined' && PAT_DISCHARGE.renderOfficialTemplateHTML){
      const compiled = PAT_DISCHARGE.compileOfficialPdcaData(p.id, { mode: d.mode||PAT_DISCHARGE._sheetMode||'auto' });
      const docHtml = PAT_DISCHARGE.renderOfficialTemplateHTML(compiled, { standalone:true });
      const w = window.open('', '_blank', 'width=940,height=920');
      if(w){
        w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>CareLink C-DIMS Official PDCA - ${esc(p.code||p.id)}</title>
        <style>
          @page{size:A4;margin:12mm 14mm}
          *{box-sizing:border-box}
          body{margin:0;padding:18px;font-family:Calibri,'Segoe UI',system-ui,sans-serif;color:#0F1E36;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
          .cdims-pdca-doc{max-width:790px;margin:0 auto}
          .cdims-pdca-top{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;margin-bottom:8px}
          .cdims-pdca-brand{display:flex;align-items:center;gap:14px}
          .cdims-pdca-logo{width:60px;height:60px;object-fit:contain}
          .cdims-pdca-kicker{font-size:10px;font-weight:800;letter-spacing:.15em;color:#C8102E;text-transform:uppercase}
          .cdims-pdca-h1{margin:2px 0;font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#162F59;font-weight:700}
          .cdims-pdca-area{font-size:12px;color:#475569;font-style:italic}
          .cdims-pdca-modechip{padding:4px 10px;border-radius:999px;background:#EFF6FF;border:1px solid #BFDBFE;color:#1E3A8A;font-size:9.5px;font-weight:800;letter-spacing:.08em}
          .cdims-trirule{display:flex;height:4px;margin:8px 0 14px;border-radius:2px;overflow:hidden}
          .cdims-pdca-sec-title{font-size:10.5px;font-weight:800;letter-spacing:.11em;color:#162F59;text-transform:uppercase;margin:13px 0 6px;display:flex;align-items:center;gap:6px}
          .cdims-pdca-sec-title .sq{width:7px;height:7px;background:#C8102E;display:inline-block}
          .cdims-meta-tbl{width:100%;border-collapse:collapse;margin-bottom:12px}
          .cdims-meta-tbl td{border:1px solid #CBD5E1;padding:6px 9px;vertical-align:top;background:#F8FAFC}
          .cdims-lbl{font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#64748B;margin-bottom:2px}
          .cdims-pat-name{font-family:Georgia,serif;font-size:14px;font-weight:700;color:#8B1538}
          .cdims-val{font-size:11.8px;color:#0F1E36;font-weight:600}
          .cdims-anthro-strip{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin:11px 0}
          .cdims-anthro-card{border:1px solid #CBD5E1;border-top-width:4px;border-radius:6px;padding:8px 10px;background:#fff}
          .cdims-anthro-big{font-size:17px;font-weight:800;color:#162F59;margin:2px 0}
          .cdims-anthro-big span{font-size:11px;font-weight:600;color:#64748B}
          .cdims-anthro-sub{font-size:10px;color:#475569}
          .cdims-aim-box{border-left:4px solid #C8102E;background:#FFF5F6;padding:9px 13px;border-radius:0 6px 6px 0;font-size:12px;line-height:1.48;color:#1E293B;margin-bottom:10px}
          .cdims-pdca-row{display:grid;grid-template-columns:44px 1fr;border:1px solid #CBD5E1;border-radius:6px;overflow:hidden;margin-bottom:8px;background:#fff;page-break-inside:avoid}
          .cdims-pdca-badge{display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:14px}
          .cdims-pdca-cell{padding:8px 12px}
          .cdims-pdca-rhead{font-size:10.5px;font-weight:800;letter-spacing:.06em;margin-bottom:4px}
          .cdims-pdca-rhead span{font-weight:500;color:#64748B;margin-left:7px;letter-spacing:0}
          .cdims-pdca-ul{margin:0;padding-left:17px;font-size:11.6px;line-height:1.45;color:#1E293B}
          .cdims-cc-sub{margin-top:6px;padding-top:5px;border-top:1px dashed #CBD5E1;font-size:11px;color:#334155}
          .cdims-just-box{border-left:4px solid #162F59;background:#F1F5F9;padding:9px 13px;border-radius:0 6px 6px 0;font-size:12px;line-height:1.5;margin-bottom:10px}
          .cdims-disch-banner{background:#162F59;color:#fff;padding:11px 15px;border-radius:6px;display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
          .cdims-disch-banner span{font-size:10px;font-weight:800;letter-spacing:.11em;color:#93C5FD;text-transform:uppercase}
          .cdims-disch-banner b{font-size:15.5px;font-family:Georgia,serif}
          .cdims-pdca-grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}
          .cdims-pdca-box{border:1px solid #CBD5E1;border-radius:6px;padding:9px 11px;background:#F8FAFC}
          .cdims-sig-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:20px}
          .cdims-sig-line{border-bottom:1.5px solid #162F59;height:20px;margin-bottom:5px}
          .cdims-pdca-foot{margin-top:16px;padding-top:6px;border-top:1px solid #CBD5E1;display:flex;justify-content:space-between;font-size:9.5px;color:#64748B}
        </style></head><body>${docHtml}</body></html>`);
        w.document.close();
        setTimeout(()=>{ try{ w.focus(); w.print(); }catch(_e){} }, 180);
        return;
      }
    }
    if(APPX.view !== 'patient' || APPX.params?.tab !== 'discharge'){
      closeAllModals();
      go('patient', { id:d.id, tab:'discharge' });
    }
    setTimeout(()=>{ try{ window.print(); }catch(e){} }, 120);
  },
  'open-hosp-followup':(d)=>{ HOSP_FOLLOWUP.openModal(d.id, AUTH.user); },
  'ack-hosp-followup':(d)=>{
    const r = HOSP_FOLLOWUP.acknowledge(d.id, AUTH.user);
    if(!r.ok) return toast('Cannot acknowledge', r.msg, 'err');
    toast('Feedback acknowledged', 'Caregiver clinic follow-up confirmed on Hospital Department register.', 'ok');
    render();
  },
  'coedit-solo':()=>{ DUALCHECK.claimSolo(AUTH.user); toast('Single-operator lock active', `${AUTH.user.name} now holds the exclusive work lease.`, 'ok'); render(); },
  'coedit-claim':()=>{ DUALCHECK.claimSolo(AUTH.user); toast('Solo seat claimed', `${AUTH.user.name} now holds the exclusive work lease.`, 'ok'); render(); },
  'coedit-concurrent':()=>{ DUALCHECK.enableConcurrent(AUTH.user); toast('Simultaneous mode active', 'Compare & Contrast 2/2 cross-check is now enforced on all shared edits.', 'warn'); render(); },
  'open-dualcheck-new':()=>{ DUALCHECK.openNewBatchModal(AUTH.user); },
  'dualcheck-pick':(d)=>{ DUALCHECK.pickResolution(d.id, Number(d.idx)||0, d.choice, AUTH.user); render(); },
  'dualcheck-sign':(d)=>{
    const r = DUALCHECK.signBatch(d.id, d.side, AUTH.user);
    if(!r.ok) return toast('Signature blocked', r.msg, 'warn');
    toast('Cross-check signed', r.bothReady ? 'Both offices have signed (2/2). Ready to commit master state.' : '1/2 signed - awaiting counterpart office verification.', 'ok');
    render();
  },
  'dualcheck-commit':(d)=>{
    const r = DUALCHECK.commitBatch(d.id, AUTH.user);
    if(!r.ok) return toast('Cannot commit yet', r.msg, 'err');
    toast('2/2 Verified & Committed', 'Both Administration and International Data signatures recorded.', 'ok');
    render();
  },
  'prompt-switch-account':(d)=>{
    if((typeof demoEntryBlocked === 'function' && demoEntryBlocked()) || (typeof PROD_SETUP !== 'undefined' && PROD_SETUP.isGloballyActivated && PROD_SETUP.isGloballyActivated())) return;
    DEMO_SWITCH.openPrompt(d.u, d.v||'home', d.asset||'Authorised Console');
  },
  'confirm-switch-account':(d)=>{
    if((typeof demoEntryBlocked === 'function' && demoEntryBlocked()) || (typeof PROD_SETUP !== 'undefined' && PROD_SETUP.isGloballyActivated && PROD_SETUP.isGloballyActivated())){
      closeAllModals(true);
      return toast('Demonstration locked', 'Demo account switching is disabled after global activation.', 'warn');
    }
    const prev = AUTH.user ? AUTH.user.username : '';
    const target = (DB.db.users||[]).find(x=>x.username===d.u);
    if(!target) return toast('Account not found','','err');
    const r = AUTH.login(d.u, 'LOMAMO2026');
    if(!r.ok){
      AUTH.user = target;
      AUTH.session = { started:todayISO(), last:Date.now(), token:'demo-switch' };
    }
    const role = roleObj(target.roleId);
    const scope = (target.areaIds&&target.areaIds.length) ? `${countyName(target.countyId)} · ${target.areaIds.map(areaName).join(', ')}` : (target.countyId ? countyName(target.countyId) : 'All Counties');
    DEMO_SWITCH.activeNotice = {
      username: target.username,
      name: target.name,
      role: role ? role.name : target.roleId,
      scope,
      asset: d.asset || d.v || 'Authorised Workspace',
      prevUsername: prev
    };
    closeAllModals(true);
    SESSION.start();
    applyTheme();
    go(d.v || 'home');
    toast('Switched to authorised account', `Now viewing "${DEMO_SWITCH.activeNotice.asset}" as ${target.name} (${DEMO_SWITCH.activeNotice.role}).`, 'info');
  },
  'dismiss-switch-banner':()=>{ DEMO_SWITCH.activeNotice = null; render(); },
  'role-pref-toggle':(d)=>{
    const uidKey = AUTH.user.id;
    DB.db.personalPrefs[uidKey] = DB.db.personalPrefs[uidKey] || {};
    const cur = DB.db.personalPrefs[uidKey][d.key];
    DB.db.personalPrefs[uidKey][d.key] = !(cur !== undefined ? !!cur : true);
    DB.save();
    toast('Role preference updated', `${titleCase(d.key)} saved for ${AUTH.user.name}.`, 'ok');
    render();
  },
  ...passwordActions(), ...workflowActionsUI(), ...clinicalActions(), ...financeActions(),
  ...mediaActions(), ...peopleActions(), ...systemActions(), ...reportActions(), ...aiActions(), ...importActions()
};

function passwordActions(){ return {
  'unlock':()=>{},
  'change-password':()=>{
    openModal({title:'Change password', narrow:true, body:`<form data-form="change-password" id="pwForm">
      ${field('Current password','current','password',{required:true})}
      ${field('New password','password','password',{required:true,hint:'Minimum '+DB.db.settings.security.passwordMinLength+' characters'})}
      ${field('Confirm new password','password2','password',{required:true})}</form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-act="submit-pw">Update password</button>`});
  },
  'submit-pw': async ()=>{
    const f = $('#pwForm'); const d = new FormData(f);
    if(d.get('password')!==d.get('password2')) return toast('Passwords do not match','','err');
    const hosted = typeof SYNC !== 'undefined' && SYNC.available && SYNC.available();
    if(hosted){
      if(!AUTH.user || !SYNC.sessionToken) return toast('Password not changed', 'Sign in to the shared online source again; no local password change was made.', 'err');
      let r;
      try{ r = await AUTH.changeOnServer(String(d.get('current')||''), String(d.get('password')||'')); }
      catch(e){ r = {ok:false, error:'The shared online source could not be reached.'}; }
      if(!r.ok) return toast('Password not changed', r.error || 'The online source refused the change; no local password was saved.', 'err');
      closeModal(); toast('Password updated', 'The shared online credential vault confirmed the change.', 'ok');
      return;
    }
    if(!AUTH.user || AUTH.user.hash!==strongHash(d.get('current'),AUTH.user.salt)) return toast('Incorrect password','Your current password is required.','err');
    const r = AUTH.setPassword(d.get('password'));
    if(!r.ok) return toast('Password not changed', r.msg,'err');
    closeModal(); toast('Password updated','Stored as a salted hash.','ok');
  }
};}

function workflowActionsUI(){ return {
  wf:(d)=>{
    const cfg = WORKFLOW[d.kind];
    const coll = d.kind==='patient'?'patients':'requests';
    const rec = DB.db[coll].find(x=>x.id===d.id);
    if(!rec) return;
    const t = cfg.transitions.find(x=>x.a===d.t);
    const needsAssignee = t.needsAssignee;
    const assignees = DB.db.users.filter(u=>u.roleId==='liaison' && (u.countyId===rec.countyId));
    openModal({
      title:t.label, sub:`${cfg.label} · ${rec.code||rec.no||rec.id}`, narrow:false,
      body:`<form data-form="wf" id="wfForm">
        <input type="hidden" name="kind" value="${d.kind}"><input type="hidden" name="id" value="${d.id}"><input type="hidden" name="t" value="${d.t}">
        ${t.needsAssignee? field('Assign to hospital focal person','assignee','select',{required:true, options:assignees.map(u=>({v:u.id,l:u.name+' · '+countyName(u.countyId)}))}) : ''}
        ${t.needsReason? field(t.a==='reject'?'Reason for rejection':'Reason','reason','textarea',{required:true,hint:'Recorded permanently in the audit trail'}) : ''}
        ${t.needsEvidence? field('Supporting evidence','evidence','textarea',{required:true,hint:'Cite the assessment, visits, PDCA outcomes or clinical review supporting this decision'}) : ''}
        ${(d.kind==='patient' && t.a==='enrol')? `
          <div class="alert info">${ic('info',17)}<div><b>An initial care plan is part of enrolment</b>
            <span class="small">The plan belongs to the patient. It records what will be done, by whom and over what period, and it is reviewed every 30 days.</span></div></div>
          ${field('Identified need','needs','textarea',{required:true,hint:'What the assessment established, in the patient\'s own circumstances'})}
          <div class="grid g2">
            ${field('Expected duration (days)','expectedDays','number',{required:true,value:(DB.db.settings.programme&&DB.db.settings.programme.defaultDays)||75,hint:'An estimate, not a discharge date'})}
            ${field('Responsible officer','responsible','select',{options:DB.db.users.filter(u=>['caregiver','coordinator','mch'].includes(u.roleId)).map(u=>({v:u.id,l:u.name}))})}
          </div>
          ${field('Reason for that estimate','rationale','textarea',{required:true,hint:'Presenting condition, household capacity and clinical advice'})}
          ${field('Agreed objective','objectives','textarea',{})}
          ${field('Planned intervention','interventions','textarea',{})}
        `:''}
        ${(d.kind==='patient' && t.a==='recommend_discharge' && typeof PAT_DISCHARGE!=='undefined')? PAT_DISCHARGE.referralFieldsHTML(rec) : ''}
        ${t.a==='approve'? field('Clinical note (optional)','note','textarea',{}) : ''}
        ${t.a==='serve'? `
          ${field('Clinical report','report','textarea',{required:true,hint:'Consultation, treatment, medication and follow-up'})}
          ${field('Expenses incurred (KES)','expense','number',{})}
          ${field('Budget line','budgetLine','select',{options:BUDGET_CATEGORIES.map(c=>({v:c.id,l:c.name}))})}
        `:''}
        ${(t.a==='reject'||t.a==='return'||t.a==='approve_discharge')?'':''}
        <div class="alert ${t.a==='reject'?'crit':'info'}" style="margin-top:6px">${ic('info',17)}<div><span class="small">${t.a==='approve_discharge'?'Discharge takes effect immediately and compiles the printable Intake-to-Discharge Programme Summary & Referral Handover.':'This decision is timestamped, attributed to you and written to the append-only audit trail.'}</span></div></div>
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn ${t.a==='reject'?'btn-danger':'btn-primary'}" data-act="submit-wf">${esc(t.label)}</button>`});
  },
  'submit-wf':()=>{
    const f=$('#wfForm'); const d=new FormData(f);
    const kind=d.get('kind'), recId=d.get('id'), tr=d.get('t');
    const payload = { reason:d.get('reason'), evidence:d.get('evidence'), note:d.get('note'),
      assignee:d.get('assignee'), report:d.get('report'), expenses:d.get('expense')?[{amount:+d.get('expense'), category:'service', budgetLine:d.get('budgetLine')}]:[],
      needs:d.get('needs'), expectedDays:d.get('expectedDays'), rationale:d.get('rationale'),
      objectives:d.get('objectives'), interventions:d.get('interventions'), responsible:d.get('responsible') };
    const r = transition(kind, recId, tr, AUTH.user, payload);
    if(!r.ok) return toast('Action not completed', r.msg,'err');
    if(kind==='patient' && typeof PAT_DISCHARGE!=='undefined'){
      const pRec = DB.db.patients.find(x=>x.id===recId);
      if(pRec && tr==='recommend_discharge'){ PAT_DISCHARGE.captureReferralFromForm(pRec, d, AUTH.user); DB.save(); }
      if(pRec && tr==='approve_discharge'){
        PAT_DISCHARGE.stampOnDischarge(pRec, AUTH.user);
        DB.save();
        closeModal(true);
        toast('Patient discharged & summary generated', 'Full Intake-to-Discharge Programme Summary & Referral Handover ready to print.', 'ok');
        go('patient', { id:pRec.id, tab:'discharge' });
        return;
      }
    }
    closeModal(); toast('Recorded', r.msg,'ok'); render();
  },
  'resolve-concern':(d)=>{
    const c = DB.db.concerns.find(x=>x.id===d.id);
    openModal({title:'Resolve concern', narrow:true, body:`<form data-form="resolve-concern" id="rcForm">
      <input type="hidden" name="id" value="${d.id}">
      <p class="small muted">${esc(c?.detail||'')}</p>
      ${field('Resolution note','note','textarea',{required:true,hint:'What was done, and by whom'})}</form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-act="submit-concern">Mark resolved</button>`});
  },
  'submit-concern':()=>{
    const d=new FormData($('#rcForm'));
    const c=DB.db.concerns.find(x=>x.id===d.get('id'));
    if(c){ c.status='resolved'; c.resolvedBy=AUTH.user.id; c.resolvedAt=todayISO(); c.resolution=d.get('note');
      AUDIT.append({actor:AUTH.user.id,action:'concern.resolved',entity:'concern',entityId:c.id,detail:d.get('note')}); DB.save(); }
    closeModal(); toast('Concern resolved','','ok'); render();
  },
  'verify-referral':(d)=>{
    const e=DB.db.referralEntities.find(x=>x.id===d.id);
    confirmDialog('Verify referral entity', `Confirm that <b>${esc(e.name)}</b> is a recognised referral source. This makes it available as an approved source in patient registration.`, ()=>{
      e.status='verified'; e.reviewedBy=AUTH.user.id; e.reviewedAt=todayISO();
      AUDIT.append({actor:AUTH.user.id,action:'referral.verified',entity:'referral',entityId:e.id,detail:e.name});
      DB.save(); toast('Referral entity verified',e.name,'ok'); render();
    },'Verify entity');
  },
  'open-pdca':(d)=>{
    const x=DB.db.pdcas.find(y=>y.id===d.id);
    openModal({title:'PDCA cycle', sub:`${esc(x.plan)}`, body:`
      <div class="steps" style="margin-bottom:16px">${['Plan','Do','Check','Act'].map((s,i)=>`<div class="step ${['Plan','Do','Check','Act'].indexOf(x.stage)>=i?'done':''} ${x.stage===s?'cur':''}"><span class="n">${i+1}</span>${s}</div>`).join('')}</div>
      <form data-form="pdca" id="pdcaForm"><input type="hidden" name="id" value="${d.id}">
        ${field('Stage','stage','select',{value:x.stage,options:['Plan','Do','Check','Act'].map(s=>({v:s,l:s}))})}
        ${field('Do - what was done','doNote','textarea',{value:x.doNote||''})}
        ${field('Check - what was observed','checkNote','textarea',{value:x.checkNote||''})}
        ${field('Act - next action','actNote','textarea',{value:x.actNote||''})}
        ${field('Close this cycle','closed','checkbox',{value:x.status==='closed'})}
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-act="save-pdca">Save cycle</button>`});
  },
  'save-pdca':()=>{
    const d=new FormData($('#pdcaForm')); const x=DB.db.pdcas.find(y=>y.id===d.get('id'));
    x.stage=d.get('stage'); x.doNote=d.get('doNote'); x.checkNote=d.get('checkNote'); x.actNote=d.get('actNote');
    x.status=d.get('closed')?'closed':'open'; x.updatedAt=todayISO();
    AUDIT.append({actor:AUTH.user.id,action:'pdca.updated',entity:'pdca',entityId:x.id,detail:'Stage '+x.stage});
    DB.save(); closeModal(); toast('PDCA cycle updated','','ok'); render();
  }
};}

function clinicalActions(){ return {
  'new-assessment':()=>{
    const areas = COUNTIES.filter(c=>roleObj(AUTH.user.roleId)?.scope?.geo==='global'||c.id===AUTH.user.countyId).flatMap(c=>c.areas.map(a=>({v:a.id,l:a.name+' · '+c.name})));
    const durDefaults = [30,60,90,120,150,180,210,240,270,300,330,360];
    const durExtra = [45,75,105,110,135,165,195];
    const durOptions = [
      ...durDefaults.map(n=>({v:String(n), l:`${n} days (Standard ${n/30}-month PDCA review track)`})),
      ...durExtra.map(n=>({v:String(n), l:`${n} days (Custom milestone duration)`}))
    ];
    openModal({title:'New patient assessment & returning-beneficiary check', sub:'Enter the National ID first to verify instantly whether the person has ever been registered before completing the LOMAMO assessment.',
      body:`<form data-form="assessment" id="assessForm">
        <div class="steps" style="margin-bottom:14px"><div class="step cur"><span class="n">1</span>ID check &amp; initiate</div><div class="step"><span class="n">2</span>Physical form</div><div class="step"><span class="n">3</span>Digitised</div><div class="step"><span class="n">4</span>Verified</div><div class="step"><span class="n">5</span>Enrolled</div></div>
        <div class="field"><label for="assessNatId">National ID number (checked first before assessment)</label>
          <input class="input mono" id="assessNatId" name="nationalId" placeholder="Type National ID number first (or phone / name if minor)..." autocomplete="off"></div>
        <div id="assessRepeatBox"><div class="rb rb-ok"><div class="rb-ic">${ic('search',18)}</div><div style="flex:1"><b>Step 1: Returning beneficiary check active</b><div class="rb-body">Key in the patient's National ID above to check prior enrolment before completing a new assessment.</div></div></div></div>
        ${field('Patient name','name','text',{required:true,hint:'As written on the LOMAMO patient assessment form'})}
        <div class="grid g2">
          ${field('Sex','sex','select',{options:[{v:'F',l:'Female'},{v:'M',l:'Male'}]})}
          ${field('Age (years)','age','number',{required:true})}
          ${field('Ministry area','areaId','select',{required:true,options:areas})}
          ${field('Planned programme duration','plannedDays','select',{value:'180',options:durOptions})}
          ${field('Assessment date','intake','date',{value:dateOnly(new Date())})}
          ${field('Referral source','referralEntityId','select',{options:DB.db.referralEntities.map(e=>({v:e.id,l:e.name+(e.status==='verified'?'':' (unverified)')}))})}
          ${field('CCC / clinic number','ccc','text',{})}
          ${field('Contact number','phone','text',{})}
          ${field('Caregiver','caregiverId','select',{options:DB.db.users.filter(u=>['caregiver','chw'].includes(u.roleId)&&u.countyId===AUTH.user.countyId).map(u=>({v:u.id,l:u.name}))})}
        </div>
        ${field('Initial clinical concern','diagnosis','text',{hint:'Recorded from the physical form; verified by clinical staff'})}
        <details class="bp-group" style="margin:12px 0"><summary><b>Master registry fields</b><span class="xs muted">The Administration's master workbook columns, mapped one to one</span></summary>
          <div style="padding:12px 13px 4px">
            <div class="grid g2">
              ${field('Cover (NHIF / LMM / Other)','insurance','select',{options:[{v:'',l:'Not recorded'},{v:'NHIF',l:'NHIF / SHA'},{v:'LMM',l:'LOMAMO (LMM)'},{v:'Other',l:'Other'}],hint:'Master workbook column D'})}
              ${field("Spouse's ID",'spouseId','text',{hint:'Column C - links two records in one household'})}
              ${field('Male children in the household','maleChildren','number',{min:0,hint:'Column P'})}
              ${field('Female children in the household','femaleChildren','number',{min:0,hint:'Column Q - total children is calculated'})}
              ${field('Visit schedule','schedule','select',{options:[{v:'',l:'Not set'},{v:'EW',l:'EW - every week'},{v:'EOW',l:'EOW - every other week'},{v:'1 Month',l:'Once a month'}],hint:'Column Y'})}
              ${field('Food bag at enrolment','bagCode','select',{options:[{v:'',l:'Not issued yet'},{v:'BG1',l:'BG1 - Bag 1 (normal household)'},{v:'BG2',l:'BG2 - Bag 2 (family / couple)'},{v:'SPB',l:'SPB - Special bag'}],hint:'Week grid codes BG1 / BG2 / SPB'})}
              ${field('Returning beneficiary (repeat patient)','repeatPatient','checkbox',{})}
              ${field('Relocated patient','relocated','checkbox',{})}
              ${field('Medical only (no food bag)','medicalOnly','checkbox',{})}
              ${field('TB type','tbType','select',{options:[{v:'',l:'Not a TB patient'},{v:'Pulmonary TB',l:'Pulmonary TB'},{v:'Extra pulmonary TB',l:'Extra pulmonary TB'}],hint:'Column CS - opens the ten-day pyridoxine cycle'})}
              ${field('Cancer site','cancerSite','select',{options:[{v:'',l:'Not applicable'},...MASTER_VOCAB.cancerSites.map(c=>({v:c,l:c}))],hint:'Column DH'})}
              ${field('ZvAfrika TB grant','zvAfrika','checkbox',{hint:'Column DB - Zorg voor Afrika grant attribution'})}
            </div>
            <div class="grid g2" style="margin-top:8px">
              ${field('Transport cost known at registration (KES)','mTransport','number',{min:0,hint:'Columns EA / EC'})}
              ${field('Medication cost known (KES)','mMedication','number',{min:0,hint:'Column EB'})}
              ${field('Out-patient cost known (KES)','mOutpatient','number',{min:0,hint:'Column ED'})}
              ${field('SHIF contribution known (KES)','mShif','number',{min:0,hint:'Column EE'})}
              ${field('In-patient cost known (KES)','mInpatient','number',{min:0,hint:'Columns EG to EK'})}
            </div>
            <p class="xs muted" style="margin:6px 0 10px">Days in programme, the minimal-care review beyond 183 days, total children, orphan prevention and every cost total are calculated from these fields - they are never typed twice. See <b>Master registry mapping</b> for the full column-by-column map.</p>
          </div>
        </details>
        ${field('Consent to record information','consent','checkbox',{value:true})}
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-ghost" data-act="save-draft" data-form="assessment">${ic('save',14)} Save draft</button>
        <button class="btn btn-primary" data-act="submit-assessment">Create assessment</button>`});
    const all = document.querySelectorAll('.modal-back'); const last = all[all.length-1];
    if(last){ applyDraft('assessment', last); const f=last.querySelector('form'); if(f && loadDraft('assessment')) f.insertAdjacentHTML('afterbegin', draftBanner('assessment')); }
  },
  'submit-assessment':()=>{
    const d=new FormData($('#assessForm'));
    const area = areaObj(d.get('areaId'));
    const plannedDays = +d.get('plannedDays') || 180;
    const natId = String(d.get('nationalId')||'').trim();
    const p = { id:uid('p'), code:'LOM-'+area.id.slice(0,3).toUpperCase()+'-'+Math.floor(1000+Math.random()*9000),
      name:d.get('name'), sex:d.get('sex')||'F', age:+d.get('age')||0, nationalId:natId,
      countyId:COUNTIES.find(c=>c.areas.some(a=>a.id===area.id)).id,
      areaId:d.get('areaId'), caregiverId:d.get('caregiverId')||AUTH.user.id, status:'assessment_initiated',
      intake:d.get('intake')||todayISO(), discharge:null, plannedDays, referralEntityId:d.get('referralEntityId'),
      ccc:d.get('ccc')||'', phone:d.get('phone')||'',
      clinical:{diagnosis:d.get('diagnosis')||'Pending clinical verification',art:false,weightKg:null,heightCm:null,adherence:'Not recorded'},
      household:{children:(+d.get('maleChildren')||0)+(+d.get('femaleChildren')||0),
        maleChildren:+d.get('maleChildren')||0, femaleChildren:+d.get('femaleChildren')||0,
        orphansSupported:0,guardian:'-'},
      insurance:String(d.get('insurance')||''), spouseId:String(d.get('spouseId')||''),
      visitFrequency:(()=>{const s=String(d.get('schedule')||'');return s==='EW'?'Every week':s==='EOW'?'Every other week':s==='1 Month'?'Once a month':'';})(),
      /* The master registry fields, with the workbook's own derived measures
         calculated here so they can never disagree with the record. */
      master:{
        insurance:String(d.get('insurance')||''), spouseId:String(d.get('spouseId')||''),
        newInMonth:(()=>{const n=new Date(d.get('intake')||todayISO());return n.toLocaleDateString('en-GB',{month:'long'})+"'"+String(n.getFullYear()).slice(2);})(),
        schedule:String(d.get('schedule')||''), bagAtEnrolment:String(d.get('bagCode')||''),
        repeatPatient:d.get('repeatPatient')?'Yes':'', relocated:d.get('relocated')?'Yes':'',
        medicalOnly:d.get('medicalOnly')?'Yes':'', tbType:String(d.get('tbType')||''),
        cancerSite:String(d.get('cancerSite')||''), zvAfrika:d.get('zvAfrika')?'x':'',
        bags:{BG1:String(d.get('bagCode')||'')==='BG1'?1:0, BG2:String(d.get('bagCode')||'')==='BG2'?1:0, SPB:String(d.get('bagCode')||'')==='SPB'?1:0,
          total:['BG1','BG2','SPB'].includes(String(d.get('bagCode')||''))?1:0},
        costs:MASTER_RULES.costs({ medications:d.get('mMedication'), transport:(+d.get('mTransport')||0),
          outpatient:d.get('mOutpatient'), shif:d.get('mShif'), inpatient1:d.get('mInpatient') }),
        minimalCareFlag:'', orphansPrevented:'', becameOrphans:'',
        sourceWorkbook:'LOMAMO C-DIMS registration (master registry blueprint)', sourceSheet:'', sourceRow:null
      },
      consent:{status:d.get('consent')?'granted':'not_requested',scope:'internal',date:todayISO()},
      faithRecord:'not_recorded', docsVerified:false, flags:['duplicate_check_pending'], pdcaStage:'Plan', demo:true, createdBy:AUTH.user.id };
  /* Derived on every save, never typed: days in programme and the minimal-care
     flag beyond 183 days (master columns K and H). */
  p.programDays = MASTER_RULES.daysInProgramme(p.enrolledAt||p.intake, p.dischargedAt||p.discharge);
  p.master.minimalCareFlag = MASTER_RULES.minimalCareFlag(p.programDays, p.master.newInMonth && p.status==='discharged'? p.master.newInMonth : '');
    if(DB.db.patients.some(x=>x.name.toLowerCase()===p.name.toLowerCase()&&x.areaId===p.areaId)){
      return toast('Possible duplicate','A patient with this name already exists in this ministry area. Review the register before creating another record.','warn');
    }
    clearDraft('assessment');
    DB.db.patients.push(p);
    /* Immediately establish the initial 30-day review PDCA plan informed by plannedDays */
    const due30 = new Date(Date.now() + 30*86400e3).toISOString().slice(0,10);
    DB.db.pdcas.push({
      id: uid('pd'), patientId: p.id, title: `Initial ${plannedDays}-day care plan & 30-day review`,
      stage: 'Plan', status: 'open', owner: p.caregiverId, due: due30,
      planNote: `Enrolled for ${plannedDays} days; scheduled for formal review every 30 days (30, 60, 90 ... ${plannedDays} days).`,
      createdAt: todayISO(), updatedAt: todayISO()
    });
    AUDIT.append({actor:AUTH.user.id,action:'patient.assessment_initiated',entity:'patient',entityId:p.id,detail:`${p.name} · ${areaName(p.areaId)} · ${plannedDays}d plan`});
    notify(DB.db.users.find(u=>u.roleId==='assistant'&&u.countyId===p.countyId)?.id,'New assessment submitted',p.name+' - awaiting physical form and digitisation','info');
    DB.save(); closeModal(true); toast('Assessment & initial PDCA created', `Planned duration ${plannedDays} days; first review due ${due30}.`,'ok'); go('patient',{id:p.id});
  },
  'submit_form':()=>{},
  'record-visit':(d)=>{
    const ps = repo.patientList(AUTH.user);
    openModal({title:'Record visit', sub:'Visit records are attributed to you and timestamped.',
      body:`<form data-form="visit" id="visitForm">
        ${field('Patient','patientId','select',{required:true,value:d.patient,options:ps.map(p=>({v:p.id,l:p.name+' · '+p.code}))})}
        <div class="grid g2">
          ${field('Visit type','type','select',{options:[{v:'home',l:'Home visit'},{v:'clinical',l:'Clinical visit'}]})}
          ${field('Date','date','date',{value:dateOnly(new Date())})}
          ${field('Weight (kg)','weight','number',{})}
          ${field('Blood pressure','bp','text',{})}
          ${field('Outcome','outcome','select',{options:[{v:'seen',l:'Patient seen'},{v:'not_found',l:'Not found at home'},{v:'refused',l:'Declined visit'},{v:'referred',l:'Referred for clinical review'}]})}
          ${field('Next visit due','nextDue','date',{})}
        </div>
        ${field('Visit notes','notes','textarea',{required:true,hint:'Observations, adherence, household situation, support issued'})}
        ${field('Escalate as clinical concern','escalate','checkbox',{})}
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-act="submit-visit">Save visit</button>`});
  },
  'submit-visit':()=>{
    const d=new FormData($('#visitForm'));
    const v={ id:uid('v'), patientId:d.get('patientId'), caregiverId:AUTH.user.id, type:d.get('type')||'home',
      date:d.get('date')||todayISO(), weight:+d.get('weight')||null, bp:d.get('bp')||'', outcome:d.get('outcome')||'seen',
      notes:d.get('notes'), nextDue:d.get('nextDue')||'', demo:true };
    DB.db.visits.push(v);
    const p=DB.db.patients.find(x=>x.id===v.patientId);
    if(v.weight&&p?.clinical) p.clinical.weightKg=v.weight;
    if(d.get('escalate')&&p){
      DB.db.concerns.push({id:uid('cn'),patientId:p.id,type:'field_escalation',level:'clinical',opened:todayISO(),detail:v.notes,by:AUTH.user.id,status:'open',demo:true});
      notify(DB.db.users.find(u=>u.roleId==='mcm')?.id,'Clinical concern escalated',p.name+' - '+v.notes.slice(0,60),'warn');
    }
    AUDIT.append({actor:AUTH.user.id,action:'visit.recorded',entity:'patient',entityId:v.patientId,detail:`${titleCase(v.type)} visit · ${titleCase(v.outcome)}`});
    DB.save(); closeModal(); toast('Visit recorded', v.outcome==='not_found'?'Marked as not found at home.':'Visit saved.','ok'); render();
  },
  'new-request':(d)=>{
    const ps = repo.patientList(AUTH.user);
    openModal({title:'Hospital appointment & transport request', sub:'Stage 1 of 7 - the request goes to the Medical Case Manager for clinical decision.',
      body:`<form data-form="request" id="reqForm">
        ${field('Patient','patientId','select',{required:true,value:d.patient,options:ps.map(p=>({v:p.id,l:p.name+' · '+p.code+' · '+areaName(p.areaId)}))})}
        <div class="grid g2">
          ${field('Patient contact','patientContact','text',{placeholder:'e.g. 0700 000 000'})}
          ${field('SHA status','shaStatus','select',{options:[{v:'Active',l:'Active'},{v:'Inactive',l:'Inactive'},{v:'Pending registration',l:'Pending registration'},{v:'Not registered',l:'Not registered'}]})}
          ${field('Chief complaints','chiefComplaints','text',{placeholder:'e.g. Unresolved genital itchiness'})}
          ${field('Facility','facility','select',{options:DB.db.referralEntities.filter(e=>e.status==='verified').map(e=>({v:e.name,l:e.name}))})}
          ${field('Priority','priority','select',{options:[{v:'routine',l:'Routine'},{v:'urgent',l:'Urgent'},{v:'critical',l:'Critical'}]})}
          ${field('Requested appointment date','preferredDate','date',{})}
        </div>
        ${field('Case / action requested at hospital','reason','textarea',{required:true,hint:'e.g. To pick up Cervical Cancer Screening Results'})}
        <div class="divider"></div>
        <div class="bold small" style="margin-bottom:8px">Transport facilitation</div>
        ${field('Transport assistance required','transportRequired','checkbox',{})}
        <div class="grid g2">
          ${field('Journey','journey','text',{value:'Home ↔ Facility'})}
          ${field('Estimated fare (KES)','fare','number',{})}
          ${field('Persons travelling','persons','number',{value:1})}
          ${field('Treatment companion / escort','escort','checkbox',{})}
        </div>
        ${field('Supporting notes','notes','textarea',{})}
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-act="submit-request">Submit request</button>`});
  },
  'submit-request':()=>{
    const d=new FormData($('#reqForm'));
    const p=DB.db.patients.find(x=>x.id===d.get('patientId'));
    if(!p) return toast('Patient required','','err');
    const r={ id:uid('hr'), no:'HR-2026-'+Math.floor(1000+Math.random()*9000), patientId:p.id, countyId:p.countyId, areaId:p.areaId,
      requestedBy:AUTH.user.id, submittedAt:todayISO(), patientContact:d.get('patientContact')||p.phone||'', shaStatus:d.get('shaStatus')||'Active', chiefComplaints:d.get('chiefComplaints')||'', reason:d.get('reason'), priority:d.get('priority')||'routine',
      facility:d.get('facility')||'Facility to be confirmed', preferredDate:d.get('preferredDate')||'', status:'submitted',
      transport:{required:!!d.get('transportRequired'),fare:+d.get('fare')||0,persons:+d.get('persons')||1,journey:d.get('journey')||'Home ↔ Facility',escort:!!d.get('escort'),approved:false},
      assignedTo:null, decision:null, clinicalReport:null, expenses:[], notes:d.get('notes')||'', demo:true };
    DB.db.requests.push(r);
    AUDIT.append({actor:AUTH.user.id,action:'hospital.requested',entity:'request',entityId:r.id,detail:r.no+' · '+p.name});
    DB.db.users.filter(u=>u.roleId==='mcm'&&u.countyId===p.countyId).forEach(u=>notify(u.id,'Hospital request submitted',r.no+' - '+p.name+' ('+r.priority+')','warn'));
    clearDraft('request');
    DB.save(); closeModal(true); toast('Request submitted','Awaiting clinical review by the Medical Case Manager.','ok'); go('requests');
  },
  'open-request':(d)=>openRequestModal(d.id),
  'upload-doc':(d)=>openUploadModal(d.patient),
  'new-pdca':(d)=>{
    const ps = repo.patientList(AUTH.user);
    openModal({title:'New PDCA cycle', narrow:true, body:`<form data-form="newpdca" id="npForm">
      ${field('Patient','patientId','select',{value:d.patient,required:true,options:ps.map(p=>({v:p.id,l:p.name+' · '+p.code}))})}
      ${field('Plan','plan','textarea',{required:true,hint:'What will be done, with whom, and by when'})}
      ${field('Due date','due','date',{required:true})}
    </form>`,
    footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-act="submit-newpdca">Create cycle</button>`});
  },
  'submit-newpdca':()=>{
    const d=new FormData($('#npForm'));
    DB.db.pdcas.push({id:uid('pd'),patientId:d.get('patientId'),stage:'Plan',plan:d.get('plan'),doNote:'',checkNote:'',actNote:'',due:d.get('due'),owner:AUTH.user.id,status:'open',demo:true});
    const p=DB.db.patients.find(x=>x.id===d.get('patientId'));
    AUDIT.append({actor:AUTH.user.id,action:'pdca.created',entity:'patient',entityId:p.id,detail:d.get('plan')});
    DB.save(); closeModal(); toast('PDCA cycle created','','ok'); render();
  },
  'discharge-review':()=>{
    const ps=repo.patientList(AUTH.user).filter(p=>p.status==='discharge_recommended');
    openModal({title:'Discharge recommendations', body: ps.length? table([
      {label:'Patient',render:p=>`<div class="cellname">${esc(p.name)}<span class="sm">${esc(p.code)} · ${PAT.days(p)} days</span></div>`},
      {label:'Reason',render:p=>`<span class="small">${esc(p.dischargeRecommendation?.reason||'')}</span>`},
      {label:'',cls:'act',render:p=>`<button class="btn btn-xs btn-primary" data-act="open-patient" data-id="${p.id}">Review</button>`}
    ], ps) : emptyState('No pending recommendations','','check'), footer:`<button class="btn btn-ghost" data-act="close-modal">Close</button>`});
  }
};}

function openRequestModal(id){
  const r = DB.db.requests.find(x=>x.id===id);
  if(!r) return;
  /* facility + county scope must be checked before the record is shown */
  const inScope = repo.requests(AUTH.user).some(x=>x.id===r.id);
  if(!inScope){ AUDIT.deny(AUTH.user,'hosp.request.view',{requestId:id},'request outside assigned scope'); return toast('Access denied','This request is outside your authority. The attempt was logged.','err'); }
  const p = repo.patient(AUTH.user, r.patientId);
  if(!p) return toast('Access denied','This request relates to a patient outside your authority.','err');
  const tx = DB.db.transactions.filter(t=>t.requestId===r.id);
  const timeline = [
    {t:'Submitted', d:fmtDateTime(r.submittedAt), done:true},
    {t:'Clinical decision', d:r.decision?`${titleCase(r.decision.note||'Decided')} - ${fmtDateTime(r.decision.at)}`:'Awaiting Medical Case Manager', done:!!r.decision},
    {t:'Assigned to focal person', d:r.assignedTo?userName(r.assignedTo):'Pending', done:!!r.assignedTo},
    {t:'Hospital service', d:r.serviceCompletedAt?fmtDateTime(r.serviceCompletedAt):'Pending', done:!!r.serviceCompletedAt},
    {t:'Financial reconciliation', d:r.reconciledAt?fmtDateTime(r.reconciledAt):'Pending', done:!!r.reconciledAt},
    {t:'Closed', d:r.status==='closed'?'Closed':'Pending', done:r.status==='closed'}
  ];
  openModal({ title:`Hospital request ${r.no}`, sub:`${p.name} · ${areaName(p.areaId)} · ${countyName(r.countyId)}`, wide:true,
    body:`<div class="row" style="margin-bottom:14px">${rBadge(r.status)} ${badge(titleCase(r.priority),r.priority==='critical'?'b-crit':r.priority==='urgent'?'b-warn':'b-neutral')} ${badge(r.facility,'b-neutral')}</div>
      <div class="grid g2" style="gap:18px">
        <div>
          <div class="label">Official Hospital Ministry Request Summary</div>
          <pre style="white-space:pre-wrap;background:var(--bg,#F8FAFC);border:1px solid var(--line,#E2E8F0);padding:11px;border-radius:9px;font-size:12px;line-height:1.6;margin:6px 0 12px">Kindly consider this patient for hospital ministry work at ${esc(r.facility||'JOOTRH')}:
Patient Name: ${esc(p.name)}
Ministry Area: ${esc(areaName(p.areaId))} Ministry
Patient Contact: ${esc(r.patientContact||p.phone||'Not recorded')}
Chief Complaints: ${esc(r.chiefComplaints||r.concerns||'See clinical notes')}
Case: ${esc(r.reason)}
SHA Status: ${esc(r.shaStatus||'Active')}

Requested by ${esc(userName(r.requestedBy))}</pre>
          <dl class="dl" style="margin-top:12px">
            <dt>SHA status</dt><dd>${badge(r.shaStatus||'Active', (r.shaStatus||'Active')==='Active'?'b-ok':'b-warn', false)}</dd>
            <dt>Requested by</dt><dd>${esc(userName(r.requestedBy))}</dd>
            <dt>Submitted</dt><dd>${fmtDateTime(r.submittedAt)}</dd>
            <dt>Preferred date</dt><dd>${fmtDate(r.preferredDate)}</dd>
            <dt>Transport</dt><dd>${r.transport?.required? money(r.transport.fare)+' · '+r.transport.persons+' person(s)'+(r.transport.escort?' + escort':''):'Not requested'}</dd>
          </dl>
          ${r.clinicalReport?`<div class="divider"></div><div class="label">Clinical report</div><p class="small">${esc(r.clinicalReport)}</p>`:''}
          ${r.decision?.reason?`<div class="alert crit" style="margin-top:12px">${ic('alert',17)}<div><b>Decision note</b><span class="small">${esc(r.decision.reason)}</span></div></div>`:''}
          ${tx.length?`<div class="divider"></div><div class="label">Financial records</div>
            ${table([
              {label:'Reference',render:t=>esc(t.no)},
              {label:'Amount',cls:'num',render:t=>money(t.amount)},
              {label:'Receipt',render:t=>t.receipt?badge('Attached','b-ok'):badge('Missing','b-crit')},
              {label:'Status',render:t=>badge(titleCase(t.status),t.status==='reconciled'?'b-ok':'b-warn')}
            ], tx)}`:''}
        </div>
        <div>
          <div class="label">Workflow</div>
          <div class="timeline" style="margin-top:8px">${timeline.map(s=>`<div class="tl-item ${s.done?'done':'pending'}"><div class="t">${esc(s.t)}</div><div class="m">${esc(s.d)}</div></div>`).join('')}</div>
          <div class="divider"></div>
          <div class="row">${workflowActions('request', r, AUTH.user)}</div>
          ${RBAC.has(AUTH.user,'hosp.receipt.review')&&r.status==='completed'?`<button class="btn btn-sm btn-ghost btn-block" style="margin-top:8px" data-act="add-expense" data-id="${r.id}">${ic('receipt',14)} Add expense / receipt</button>`:''}
          ${typeof HOSP_FOLLOWUP!=='undefined' && HOSP_FOLLOWUP.canRecord(AUTH.user) && ['completed','reconciled','closed'].includes(r.status) ? `
            <button class="btn btn-sm btn-primary btn-block" style="margin-top:8px" data-act="open-hosp-followup" data-id="${r.id}">${ic('send',14)} ${r.postFollowUp?'Update Clinic Follow-Up ('+esc(r.postFollowUp.clinic)+')':'Record Post-Visit Clinic Follow-Up (MOPC / GOPC / Physio)'}</button>` : ''}
          ${r.postFollowUp ? `<div class="alert ${r.postFollowUp.hospitalAck?'ok':'info'}" style="margin-top:10px">${ic('hospital',16)}<div>
            <b>Post-Visit Follow-Up: ${esc(r.postFollowUp.clinic)} · ${fmtDate(r.postFollowUp.reviewDate)}</b>
            <span class="small">${esc(r.postFollowUp.targetFacility||r.facility)} - ${esc(r.postFollowUp.feedbackToHospital)}</span>
            ${!r.postFollowUp.hospitalAck && HOSP_FOLLOWUP.canAck(AUTH.user) ? `<div style="margin-top:6px"><button class="btn btn-xs btn-primary" data-act="ack-hosp-followup" data-id="${r.id}">${ic('check',12)} Acknowledge as Hospital Dept</button></div>` : ''}
          </div></div>` : ''}
        </div>
      </div>`,
    footer:`<button class="btn btn-ghost" data-act="close-modal">Close</button>` });
}

function openUploadModal(patientId){
  openModal({title:'Upload patient document', sub:'Documents are classified. A clinical record is not a media asset.',
    body:`<form data-form="upload" id="upForm">
      ${field('Patient','patientId','select',{value:patientId,required:true,options:repo.patientList(AUTH.user).map(p=>({v:p.id,l:p.name+' · '+p.code}))})}
      ${field('Document type','kind','select',{options:[
        {v:'assessment_form',l:'Signed assessment form'},{v:'ccc_card',l:'CCC clinic card'},{v:'hospital_record',l:'Hospital record'},
        {v:'lab_result',l:'Laboratory result'},{v:'wound_photo',l:'Wound / condition photograph'},{v:'story_photo',l:'Photograph for potential storytelling'}]})}
      ${field('Classification','classification','select',{options:[
        {v:'clinical',l:'Clinical record'},{v:'identification',l:'Identification document'},{v:'hospital',l:'Hospital document'},
        {v:'internal_photo',l:'Internal patient photograph'},{v:'story_material',l:'Potential storytelling material'},{v:'restricted',l:'Restricted confidential attachment'}]})}
      ${field('File','file','file',{hint:'The file is stored by the shared online service with a SHA-256 digest. It is not kept only in the browser.',accept:'.pdf,.jpg,.jpeg,.png,.docx,.xlsx'})}
      ${field('Consent confirmed for intended use','consent','checkbox',{})}
      ${field('Restrict to clinical roles','restricted','checkbox',{})}
    </form>`,
    footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-act="submit-upload">Upload</button>`});
}

function financeActions(){ return {
  'reconcile-tx':(d)=>{
    const t=DB.db.transactions.find(x=>x.id===d.id);
    openModal({title:'Reconcile transaction', sub:t.no, narrow:true, body:`<form data-form="recon" id="reconForm">
      <input type="hidden" name="id" value="${d.id}">
      <dl class="dl"><dt>Amount</dt><dd>${money(t.amount)}</dd><dt>Payee</dt><dd>${esc(t.payee)}</dd>
        <dt>Reference</dt><dd>${esc(t.ref||'-')}</dd><dt>Receipt</dt><dd>${t.receipt?'Attached':'<b style="color:var(--crit)">Missing</b>'}</dd></dl>
      ${field('Receipt reference verified','receiptRef','text',{value:t.ref||''})}
      ${field('Reconciliation note','note','textarea',{})}
      ${!t.receipt?`<div class="alert warn" style="margin-top:8px">${ic('alert',17)}<div><span class="small">This transaction has no receipt attached. Attach evidence before reconciling - or record a documented exception.</span></div></div>`:''}
      ${field('Record as documented exception','exception','checkbox',{})}
    </form>`,
    footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-act="submit-recon">Reconcile</button>`});
  },
  'submit-recon':()=>{
    const d=new FormData($('#reconForm')); const t=DB.db.transactions.find(x=>x.id===d.get('id'));
    if(!t.receipt && !d.get('exception')) return toast('Receipt required','Attach evidence or record a documented exception.','err');
    t.status='reconciled'; t.reconciledBy=AUTH.user.id; t.reconciledAt=todayISO(); t.reconNote=d.get('note');
    if(d.get('exception')) t.exception=true;
    AUDIT.append({actor:AUTH.user.id,action:'transaction.reconciled',entity:'transaction',entityId:t.id,detail:`${t.no} · ${money(t.amount)}`});
    DB.save(); closeModal(); toast('Transaction reconciled','','ok'); render();
  },
  'add-expense':(d)=>{
    const r=DB.db.requests.find(x=>x.id===d.id);
    openModal({title:'Add expense & receipt', sub:r.no, body:`<form data-form="expense" id="expForm">
      <input type="hidden" name="requestId" value="${d.id}">
      <div class="grid g2">
        ${field('Category','category','select',{options:[{v:'consultation',l:'Consultation'},{v:'entry',l:'Hospital entry / service charge'},{v:'lab',l:'Laboratory'},{v:'medication',l:'Medication'},{v:'treatment',l:'Treatment'},{v:'transport',l:'Transport'},{v:'companion',l:'Treatment companion'}]})}
        ${field('Amount (KES)','amount','number',{required:true})}
        ${field('Date','date','date',{value:dateOnly(new Date())})}
        ${field('Transaction reference','ref','text',{hint:'From the payment confirmation, not a pasted message'})}
        ${field('Payee','payee','text',{})}
        ${field('Budget line','budgetLine','select',{options:BUDGET_CATEGORIES.map(c=>({v:c.id,l:c.name}))})}
      </div>
      ${field('Receipt attached','receipt','checkbox',{})}
      ${field('Notes','note','textarea',{})}
    </form>`,
    footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-act="submit-expense">Add expense</button>`});
  },
  'submit-expense':()=>{
    const d=new FormData($('#expForm')); const r=DB.db.requests.find(x=>x.id===d.get('requestId'));
    const t={id:uid('tx'),no:'TX-'+Math.floor(4000+Math.random()*5000),patientId:r.patientId,requestId:r.id,countyId:r.countyId,
      category:d.get('category'),amount:+d.get('amount'),currency:'KES',date:d.get('date')||todayISO(),
      payer:'LOMAMO Foundation',payee:d.get('payee')||'-',ref:d.get('ref')||'',budgetLine:d.get('budgetLine')||'other',
      receipt:!!d.get('receipt'),enteredBy:AUTH.user.id,reviewedBy:null,status:'paid',flags:[],note:d.get('note')||'',demo:true};
    DB.db.transactions.push(t);
    AUDIT.append({actor:AUTH.user.id,action:'expense.recorded',entity:'transaction',entityId:t.id,detail:`${t.no} · ${money(t.amount)}`});
    DB.save(); closeModal(); toast('Expense recorded','Awaiting financial reconciliation.','ok'); render();
  },
  'export-finance':()=>{
    const e=REPORTS.expenditure(AUTH.user,{});
    const csv=toCSV(e.rows,[{label:'Category',get:r=>r.cat.name},{label:'Budget',get:r=>r.budget},{label:'Committed',get:r=>r.committed},
      {label:'Paid',get:r=>r.paid},{label:'Reconciled',get:r=>r.reconciled},{label:'Remaining',get:r=>r.remaining}]);
    download('LOMAMO-expenditure-'+new Date().toISOString().slice(0,10)+'.csv',csv);
    AUDIT.append({actor:AUTH.user.id,action:'data.export',entity:'finance',entityId:'expenditure',detail:'Expenditure CSV export'});
    DB.save();
  },
  'edit-budget':()=>{
    openModal({title:'New budget version', body:`<form data-form="budget" id="budForm">
      ${field('County','countyId','select',{options:COUNTIES.map(c=>({v:c.id,l:c.name}))})}
      ${field('Category','line','select',{options:BUDGET_CATEGORIES.map(c=>({v:c.id,l:c.name}))})}
      ${field('Period (YYYY-MM)','period','text',{value:new Date().toISOString().slice(0,7)})}
      ${field('Amount (KES)','amount','number',{required:true})}
      ${field('Reason for change','reason','textarea',{required:true})}
    </form>`,
    footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-act="submit-budget">Create version</button>`});
  },
  'submit-budget':()=>{
    const d=new FormData($('#budForm'));
    const existing=DB.db.budgets.filter(b=>b.countyId===d.get('countyId')&&b.line===d.get('line')&&b.period===d.get('period'));
    const version=existing.length+1;
    DB.db.budgets.push({id:uid('b'),countyId:d.get('countyId'),line:d.get('line'),amount:+d.get('amount'),period:d.get('period'),
      version,effectiveFrom:dateOnly(new Date()),setBy:AUTH.user.id,demo:true});
    AUDIT.append({actor:AUTH.user.id,action:'budget.versioned',entity:'budget',entityId:d.get('line'),detail:`${d.get('countyId')} ${d.get('period')} v${version} - ${d.get('reason')}`});
    DB.save(); closeModal(); toast('Budget version created','Historical reports retain their original basis.','ok'); render();
  },
  'set-target':()=>{
    /* Authority is checked before the form is offered, and the form only lists
       the levels and counties this account may actually set. */
    const levels = ACCESS.targetLevels(AUTH.user);
    if(!levels.length){
      const r = RBAC.can(AUTH.user,'report.targets.manage',{level:'county',countyId:AUTH.user.countyId});
      return openModal({title:'Targets & baselines', narrow:true, body:alertBox('warn','Your account may not set a target',
        `<span class="small">${esc(r.reason||'Setting a target belongs to the office that owns the level.')}</span>
         <p class="small" style="margin-top:10px">Measurement and target setting are separate duties. An M&amp;E or Data Officer reads targets, reports against them and raises a data-quality exception; the County Office Administrator sets county targets and baselines, a Ministry Area Coordinator proposes area targets, and only the Director, the President or the Chief Program Administrator sets a national target.</p>`),
        footer:`<button class="btn btn-primary" data-act="close-modal">Understood</button>`});
    }
    const counties = levels.includes('national')? COUNTIES : COUNTIES.filter(c=>c.id===AUTH.user.countyId);
    const areas = COUNTIES.flatMap(c=>c.areas).filter(a=>!counties.length || counties.some(c=>c.id===a.id))
      .filter(a=> levels.includes('national') || counties.some(c=>c.id===AUTH.user.countyId));
    openModal({title:'Set target or baseline', sub:'Levels available to you: '+levels.map(titleCase).join(', '), body:`<form data-form="target" id="tgtForm">
      ${field('Level','level','select',{options:levels.map(l=>({v:l,l:l==='area'?'Ministry area (proposal)':l==='county'?'County office':'National'}))})}
      ${levels.includes('area')? field('Ministry area (area level only)','areaId','select',{options:(AUTH.user.areaIds||[]).map(a=>({v:a,l:areaName(a)})).concat(areas.filter(a=>(AUTH.user.areaIds||[]).includes(a.id)).length?[]:areas.map(a=>({v:a.id,l:a.name})).filter(o=>levels.includes('county')||levels.includes('national')))}):''}
      ${field('County office','countyId','select',{options:counties.map(c=>({v:c.id,l:c.name}))})}
      ${field('Indicator','indicator','select',{options:Object.keys(INDICATORS).map(k=>({v:k,l:INDICATORS[k].l}))})}
      ${field('Period (YYYY-MM)','period','text',{value:new Date().toISOString().slice(0,7)})}
      ${field('Target value','value','number',{required:true})}
      ${field('Basis / note','note','text',{required:true,hint:'Where the figure comes from: a baseline, a board decision or a donor agreement.'})}
    </form>`,
    footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-act="submit-target">Save target</button>`});
  },
  'submit-target':()=>{
    const d=new FormData($('#tgtForm'));
    const level = String(d.get('level')||'county');
    const countyId = String(d.get('countyId')||AUTH.user.countyId);
    const areaId = String(d.get('areaId')||'');
    /* The gate, not the form, decides. A target is versioned only if the
       account holds the level and the geography it is written for. */
    const cap = level==='national'? 'report.targets.national' : level==='area'? 'report.targets.area' : 'report.targets.county';
    const chk = RBAC.can(AUTH.user, cap, {countyId, areaId, level});
    if(!chk.ok){
      AUDIT.deny(AUTH.user, cap, {countyId, areaId, level}, chk.reason);
      return toast('Target not saved', chk.reason, 'err');
    }
    const legacy = RBAC.can(AUTH.user,'report.targets.manage',{countyId, areaId, level});
    if(!legacy.ok) return toast('Target not saved', legacy.reason, 'err');
    if(level==='area' && !areaId) return toast('Choose a ministry area','An area-level target names the area it belongs to.','err');
    const v=DB.db.targets.filter(t=>t.countyId===countyId&&(t.areaId||'')===(level==='area'?areaId:'')&&t.indicator===d.get('indicator')&&t.period===d.get('period')).length+1;
    DB.db.targets.push({id:uid('t'),level,countyId,areaId:level==='area'?areaId:'',indicator:d.get('indicator'),period:d.get('period'),
      value:+d.get('value'),version:v,note:d.get('note'),setBy:AUTH.user.id,setAt:todayISO()});
    AUDIT.append({actor:AUTH.user.id,action:'target.versioned',entity:'target',entityId:d.get('indicator'),
      detail:`${level} level · ${countyName(countyId)}${level==='area'?' · '+areaName(areaId):''} · ${d.get('period')} v${v} = ${d.get('value')} · ${d.get('note')}`});
    DB.save(); closeModal(); toast('Target saved',`${titleCase(level)}-level target versioned and dated.`, 'ok'); render();
  }
};}

function mediaActions(){ return {
  'review-media':(d)=>{
    const doc=DB.db.documents.find(x=>x.id===d.id); if(!doc) return;
    const p=DB.db.patients.find(x=>x.id===doc.patientId);
    const gate=GOV.canPublish(doc);
    openModal({title:'Review media asset', sub:titleCase(doc.kind), body:`
      <div class="grid g2">
        <div><div class="label">Asset</div>
          <div style="height:150px;border-radius:12px;background:repeating-linear-gradient(45deg,#F4F6F9,#F4F6F9 10px,#EDF0F4 10px,#EDF0F4 20px);display:grid;place-items:center;color:var(--muted-2)">${ic('image',34)}</div>
          <div class="xs muted" style="margin-top:6px">Preview placeholder - the encrypted original is held in local storage.</div></div>
        <div><dl class="dl">
          <dt>Patient</dt><dd>${esc(p?.name||'-')}</dd>
          <dt>Classification</dt><dd>${esc(titleCase(doc.classification))}</dd>
          <dt>Consent status</dt><dd>${badge(p?titleCase(p.consent.status):'-',p?.consent.status==='granted'?'b-ok':'b-crit')}</dd>
          <dt>Purposes agreed</dt><dd>${p?GOV.PURPOSES.filter(x=>GOV.purposesOf(p)[x.id]).map(x=>`<span class="consent-purpose on">${esc(x.l)}</span>`).join(' ')||'<span class="muted">None recorded</span>': '-'}</dd>
          <dt>Restricted</dt><dd>${doc.restricted?'Yes':'No'}</dd>
        </dl></div>
      </div>
      <div class="divider"></div>
      ${gate.ok?alertBox('ok','Publication permitted','Consent covers public storytelling, the consent form has been verified, and approval will be recorded against your account.'):alertBox('crit','Publication blocked',esc(gate.reason))}
      ${p?`<div class="xs muted" style="margin-top:8px">Purposes on record: ${GOV.PURPOSES.map(x=>`<span class="consent-purpose ${GOV.purposesOf(p)[x.id]?'on':'off'}">${esc(x.l)}</span>`).join(' ')}</div>`:''}
      ${p?`<div class="row" style="margin-top:12px"><button class="btn btn-sm btn-ghost" data-act="edit-consent" data-id="${p.id}">${ic('shield',14)} Open consent record</button></div>`:''}`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Close</button>
        <button class="btn btn-primary" data-act="approve-publish" data-id="${doc.id}" ${gate.ok?'':'disabled'}>Approve publication</button>`});
  },
  'approve-publish':(d)=>{
    const doc=DB.db.documents.find(x=>x.id===d.id);
    const gate=GOV.canPublish(doc);
    if(!gate.ok){ toast('Publication blocked',gate.reason,'err'); return; }
    doc.publication='approved'; doc.publishedBy=AUTH.user.id; doc.publishedAt=todayISO();
    AUDIT.append({actor:AUTH.user.id,action:'media.published',entity:'document',entityId:doc.id,detail:titleCase(doc.kind)+' approved for publication'});
    DB.save(); closeModal(); toast('Publication approved','Consent and ethics checks recorded.','ok'); render();
  },
  'reject-publish':(d)=>{
    const doc=DB.db.documents.find(x=>x.id===d.id);
    doc.publication='rejected';
    AUDIT.append({actor:AUTH.user.id,action:'media.declined',entity:'document',entityId:doc.id,detail:'Publication declined'});
    DB.save(); toast('Publication declined','','warn'); render();
  },
  'view-doc':(d)=>{
    const doc=DB.db.documents.find(x=>x.id===d.id);
    const p=DB.db.patients.find(x=>x.id===doc.patientId);
    if(doc.restricted && !RBAC.has(AUTH.user,'patient.view.clinical')) return toast('Restricted','This attachment requires clinical authority.','err');
    const retention=doc.retention? RETENTION_BY_ID[doc.retention]:RETENTION_FOR_CLASS[doc.classification];
    const stored=doc.fileStored && doc.fileId;
    openModal({title:titleCase(doc.kind), sub:(p?.name||'')+' · '+titleCase(doc.classification), body:`
      ${stored?`<div class="alert ok" style="margin-bottom:10px">${ic('check',16)}<div><b>File held by the shared online service</b>
        <span class="small">${esc(doc.fileName||'Document')} · ${num(Math.round((doc.fileBytes||0)/1024))} KB · SHA-256 ${esc(String(doc.fileSha||'').slice(0,24))}…</span></div></div>`
      :`<div class="alert warn" style="margin-bottom:10px">${ic('alert',16)}<div><b>No file is attached to this record</b>
        <span class="small">The document record exists, but the bytes were never stored. Upload the file again.</span></div></div>`}
      <dl class="dl">
        <dt>Uploaded</dt><dd>${fmtDate(doc.uploadedAt)} · ${esc(userName(doc.uploadedBy).replace(/^Demo - /,''))}</dd>
        <dt>Classification</dt><dd>${esc(titleCase(doc.classification))}</dd>
        <dt>Retention</dt><dd>${esc(retention.label)}</dd>
        <dt>Retention note</dt><dd>${esc(retention.note)}</dd>
        <dt>Consent</dt><dd>${esc(titleCase(doc.consent||p?.consent?.status||'pending'))}</dd>
      </dl>
      <div class="note" style="margin-top:12px">${ic('lock',14)}<span>Opening the file is recorded in the audit trail. A restricted clinical image is never served to a role without clinical authority.</span></div>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Close</button>
        ${stored&&FILEVAULT.available()?`<button class="btn btn-primary" data-act="open-stored-file" data-id="${esc(doc.fileId)}">Open the file</button>`:''}`});
    AUDIT.append({actor:AUTH.user.id,action:'document.viewed',entity:'document',entityId:doc.id,detail:titleCase(doc.kind)}); DB.save();
  },
  'open-stored-file':(d)=>{
    FILEVAULT.open(d.id).then(r=>{ if(!r.ok) toast('Not opened',r.msg,'err'); });
    AUDIT.append({actor:AUTH.user.id,action:'document.file_opened',entity:'file',entityId:d.id,detail:'Stored document opened'});
    DB.save();
  },
  'edit-consent':(d)=>{
    const p=DB.db.patients.find(x=>x.id===d.id);
    const purposes = GOV.purposesOf(p);
    const c = p.consent||{};
    openModal({title:'Consent record', sub:p.name+' · '+p.code, wide:true, body:`<form data-form="consent" id="conForm">
      <input type="hidden" name="id" value="${d.id}">
      <div class="grid g2">
        ${field('Consent status','status','select',{value:c.status||'pending',options:['granted','pending','withdrawn','not_requested'].map(s=>({v:s,l:titleCase(s)}))})}
        ${field('Date recorded','date','date',{value:dateOnly(c.date||new Date())})}
      </div>
      <div class="label" style="margin-top:6px">What the person has agreed to</div>
      <div class="consent-grid">
        ${GOV.PURPOSES.map(x=>`<label class="consent-item ${x.id==='care'?'locked':''}">
          <input type="checkbox" name="purpose_${x.id}" ${purposes[x.id]?'checked':''} ${x.id==='care'?'disabled':''}>
          <div><b>${esc(x.l)}</b><span>${esc(x.note)}</span></div></label>`).join('')}
      </div>
      <div class="alert info" style="margin-top:12px">${ic('info',17)}<div><b>Withdrawal is a decision, not a deletion</b>
        <span class="small">Unticking a purpose records the withdrawal, the date, your name and the reason. Any approved story or photograph under that purpose is pulled from publication immediately. The clinical record itself is never deleted.</span></div></div>
      ${field('Reason for withdrawal (required if a purpose is removed)','note','textarea',{hint:'In the person\'s own words where possible'})}
      ${c.history?.length?`<details style="margin-top:6px"><summary class="small">Consent history (${c.history.length})</summary><div class="col" style="gap:4px;margin-top:8px">${c.history.slice().reverse().map(h=>`<div class="xs muted">${fmtDate(h.at)} · ${esc(h.action)}${h.purpose?' · '+esc(titleCase(h.purpose)):''} · ${esc(h.reason||'')} · ${esc(userName(h.by))}</div>`).join('')}</div></details>`:''}
    </form>`,
    footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-act="submit-consent">Save consent record</button>`});
  },
  'submit-consent':()=>{
    const d=new FormData($('#conForm')); const p=DB.db.patients.find(x=>x.id===d.get('id'));
    if(!p) return;
    const before = GOV.purposesOf(p);
    const next = {};
    GOV.PURPOSES.forEach(x=>{ next[x.id] = x.id==='care' ? true : d.get('purpose_'+x.id)==='on'; });
    const removed = Object.keys(next).filter(k=>before[k] && !next[k]);
    if(removed.length && String(d.get('note')||'').trim().length<8){
      return toast('Reason required','Record why consent is being withdrawn for '+removed.map(titleCase).join(', ')+'. The reason is part of the record.','err');
    }
    p.consent = p.consent||{};
    p.consent.purposes = next;
    p.consent.status = d.get('status');
    p.consent.date = d.get('date');
    p.consent.note = d.get('note')||'';
    p.consent.scope = next.storytelling? 'storytelling' : next.donor? 'donor_report' : 'internal';
    p.consent.history = [...(p.consent.history||[]), {at:todayISO(), by:AUTH.user.id, action:'updated', purpose:removed.join(', ')||'none', reason:d.get('note')||'', status:d.get('status')}];
    AUDIT.append({actor:AUTH.user.id,action:'consent.updated',entity:'patient',entityId:p.id,
      detail:`Status ${d.get('status')}${removed.length?'; withdrawn: '+removed.join(', '):'; purposes confirmed'}`});
    if(removed.length){
      p.consent.withdrawnAt = todayISO();
      p.consent.withdrawnPurposes = [...new Set([...(p.consent.withdrawnPurposes||[]), ...removed])];
      DB.db.documents.filter(x=>x.patientId===p.id && ['approved','pending_review'].includes(x.publication))
        .filter(x=>removed.includes('storytelling')||removed.includes('photography'))
        .forEach(x=>{ x.publication='withdrawn'; x.publicationWithdrawnAt=todayISO(); x.publicationWithdrawnReason=d.get('note'); });
    }
    DB.save(); closeModal(true); toast('Consent updated', removed.length?'Withdrawal recorded and publication blocked.':'Purposes recorded against the patient.','ok'); render();
  }
};}

function peopleActions(){ return {
  /* ---------- Monthly work plans ---------- */
  'workplan-edit':(d)=>{
    const period = d.period || WORKPLAN.nextPeriod();
    const existing = DB.db.workPlans.find(w=>w.userId===AUTH.user.id&&w.period===period);
    const objs = existing?.objectives||[{text:'',measure:'',target:''}];
    const emp = DB.db.employees.find(e=>e.userId===AUTH.user.id);
    const supervisors = DB.db.users.filter(u=>['depthead','coordinator','countyadmin','director','hr'].includes(u.roleId) && u.id!==AUTH.user.id);
    openModal({title:(existing?'Edit':'Prepare')+' work plan', sub:WORKPLAN.label(period)+' · due '+fmtDate(WORKPLAN.dueDate(WORKPLAN.period())), wide:true, body:`
      <form data-form="workplan" id="wpForm">
        <input type="hidden" name="period" value="${esc(period)}">
        ${existing?`<div class="alert warn">${ic('info',17)}<div><b>This plan is version ${existing.version} and is ${esc(existing.status)}</b>
          <span class="small">Saving changes after approval creates version ${existing.version+1} and returns it for approval again. The agreed version stays in the record.</span></div></div>`:''}
        <div class="grid g2">
          ${field('Supervisor','supervisorId','select',{required:true,value:existing?.supervisorId||emp?.supervisorId||'',options:supervisors.map(u=>({v:u.id,l:u.name+' · '+(roleObj(u.roleId)?.name||'')}))})}
          ${field('Focus for the month','focus','text',{value:existing?.focus||'',hint:'One sentence: the single most important outcome'})}
        </div>
        <div class="label" style="margin-top:10px">Objectives</div>
        <div class="col" style="gap:10px">
          ${[0,1,2].map(i=>`<div class="obj-row">
            <div class="obj-n">${i+1}</div>
            <div class="grow"><input class="input" name="obj_text_${i}" placeholder="What you will achieve, in plain words" value="${esc(objs[i]?.text||'')}">
              <div class="grid g2" style="margin-top:6px">
                <input class="input" name="obj_measure_${i}" placeholder="How it will be measured" value="${esc(objs[i]?.measure||'')}">
                <input class="input" name="obj_target_${i}" placeholder="Target (number or date)" value="${esc(objs[i]?.target||'')}">
              </div></div></div>`).join('')}
        </div>
        ${field('Support needed from the Foundation','support','textarea',{value:existing?.support||'',hint:'Transport, budget, equipment, another person\'s time'})}
        ${field('Risks or dependencies','risks','textarea',{value:existing?.risks||''})}
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-ghost" data-act="save-draft" data-form="workplan">${ic('save',14)} Save draft</button>
        <button class="btn btn-primary" data-act="submit-workplan" data-period="${esc(period)}">Submit for approval</button>`});
  },
  'submit-workplan':(d)=>{
    const f=$('#wpForm'); if(!f) return;
    const fd=new FormData(f);
    const period=fd.get('period');
    const objectives=[0,1,2].map(i=>({text:String(fd.get('obj_text_'+i)||'').trim(), measure:String(fd.get('obj_measure_'+i)||'').trim(), target:String(fd.get('obj_target_'+i)||'').trim()})).filter(o=>o.text);
    if(!objectives.length) return toast('Add at least one objective','A plan with no objective cannot be approved.','err');
    const incomplete = objectives.find(o=>!o.measure||!o.target);
    if(incomplete) return toast('Every objective needs a measure and a target','"'+incomplete.text.slice(0,50)+'" has no measure or target.','err');
    const now = new Date();
    const late = now > WORKPLAN.dueDate(WORKPLAN.period()) && period===WORKPLAN.nextPeriod();
    let plan = DB.db.workPlans.find(w=>w.userId===AUTH.user.id&&w.period===period);
    if(plan){
      plan.objectives=objectives; plan.focus=fd.get('focus'); plan.support=fd.get('support'); plan.risks=fd.get('risks');
      plan.supervisorId=fd.get('supervisorId'); plan.version+=1; plan.status='submitted';
      plan.history=[...(plan.history||[]), {at:todayISO(), by:AUTH.user.id, action:'resubmitted', version:plan.version}];
    } else {
      plan={ id:uid('wp'), userId:AUTH.user.id, period, objectives, focus:fd.get('focus'), support:fd.get('support'),
        risks:fd.get('risks'), supervisorId:fd.get('supervisorId'), status:'submitted', version:1,
        submittedAt:new Date().toISOString(), late, history:[{at:todayISO(), by:AUTH.user.id, action:'submitted', version:1}] };
      DB.db.workPlans.push(plan);
    }
    clearDraft('workplan');
    AUDIT.append({actor:AUTH.user.id,action:'workplan.submitted',entity:'workplan',entityId:plan.id,
      detail:`${WORKPLAN.label(period)} · version ${plan.version}${late?' · late':''}`});
    DB.save(); closeModal(true);
    toast(late?'Plan submitted late':'Plan submitted','Your supervisor has been notified.','warn');
    render();
  },
  'workplan-view':(d)=>{
    const w=DB.db.workPlans.find(x=>x.id===d.id); if(!w) return;
    openModal({title:'Work plan', sub:`${userName(w.userId)} · ${WORKPLAN.label(w.period)} · version ${w.version}`, wide:true, body:`
      <div class="row" style="gap:8px;margin-bottom:12px">${badge(titleCase(w.status), w.status==='approved'?'b-ok':w.status==='returned'?'b-crit':'b-warn')}
        ${w.late?badge('Submitted late','b-warn','nodot'):''}
        <span class="chip">Supervisor: ${esc(userName(w.supervisorId))}</span></div>
      ${w.focus?`<p style="font-size:14px">${esc(w.focus)}</p>`:''}
      <div class="col" style="gap:10px">${w.objectives.map((o,i)=>`<div class="obj-row"><div class="obj-n">${i+1}</div>
        <div><b style="font-size:13.5px">${esc(o.text)}</b><div class="xs muted">Measured by ${esc(o.measure)} · target ${esc(o.target)}</div></div></div>`).join('')}</div>
      ${w.support?`<div class="divider"></div><div class="label">Support needed</div><p class="small">${esc(w.support)}</p>`:''}
      ${w.risks?`<div class="label">Risks</div><p class="small">${esc(w.risks)}</p>`:''}
      ${w.decisionNote?`<div class="alert ${w.status==='returned'?'crit':'ok'}" style="margin-top:10px">${ic('info',17)}<div><b>Supervisor note</b><span class="small">${esc(w.decisionNote)}</span></div></div>`:''}
      <div class="divider"></div>
      <div class="label">History</div>
      <div class="col" style="gap:4px">${(w.history||[]).map(h=>`<div class="xs muted">${fmtDateTime(h.at)} · ${esc(h.action)} · version ${h.version} · ${esc(userName(h.by))}</div>`).join('')}</div>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Close</button>`});
  },
  'workplan-approve':(d)=>{
    const w=DB.db.workPlans.find(x=>x.id===d.id); if(!w) return;
    w.status='approved'; w.approvedAt=new Date().toISOString(); w.approvedBy=AUTH.user.id;
    w.history=[...(w.history||[]), {at:todayISO(), by:AUTH.user.id, action:'approved', version:w.version}];
    AUDIT.append({actor:AUTH.user.id,action:'workplan.approved',entity:'workplan',entityId:w.id,detail:WORKPLAN.label(w.period)+' v'+w.version});
    DB.save(); toast('Plan approved','The objectives become the basis of the month-end review.','ok'); render();
  },
  'workplan-return':(d)=>{
    const w=DB.db.workPlans.find(x=>x.id===d.id); if(!w) return;
    openModal({title:'Return for revision', sub:`${userName(w.userId)} · ${WORKPLAN.label(w.period)}`, narrow:true,
      body:`<form data-form="workplan-return" id="wprForm"><input type="hidden" name="id" value="${w.id}">
        ${field('What must change','note','textarea',{required:true,hint:'Specific and actionable. The person must know what to fix.'})}</form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" data-act="submit-workplan-return">Return plan</button>`});
  },
  'submit-workplan-return':()=>{
    const fd=new FormData($('#wprForm')); const w=DB.db.workPlans.find(x=>x.id===fd.get('id'));
    if(!w) return;
    w.status='returned'; w.decisionNote=fd.get('note'); w.returnedAt=new Date().toISOString(); w.returnedBy=AUTH.user.id;
    w.history=[...(w.history||[]), {at:todayISO(), by:AUTH.user.id, action:'returned', version:w.version, note:fd.get('note')}];
    AUDIT.append({actor:AUTH.user.id,action:'workplan.returned',entity:'workplan',entityId:w.id,detail:fd.get('note')});
    DB.save(); closeModal(true); toast('Returned for revision','The person has been notified with your reason.','warn'); render();
  },
  /* Leave actions live in office_actions.js and are merged at the foot of
     this file. They compute coverage; they are not a status field. */
  'edit-staff':(d)=>{
    const e=DB.db.employees.find(x=>x.id===d.id); if(!e) return;
    openModal({title:'Edit staff record', sub:e.name, body:`<form data-form="editstaff" id="esForm">
      <input type="hidden" name="id" value="${e.id}">
      <div class="grid g2">
        ${field('Full name','name','text',{value:e.name,required:true})}
        ${field('Job designation','role','text',{value:e.role,required:true})}
        ${field('Department','dept','select',{value:e.dept,options:DEPARTMENTS.map(d=>({v:d.id,l:d.name}))})}
        ${field('County office','county','select',{value:e.county,options:COUNTIES.map(c=>({v:c.id,l:c.name}))})}
        ${field('Contract','contract','select',{value:e.contract,options:[{v:'permanent',l:'Permanent'},{v:'casual',l:'Casual'},{v:'contract',l:'Fixed-term'}]})}
        ${field('Status','status','select',{value:e.status,options:['active','suspended','ended'].map(x=>({v:x,l:titleCase(x)}))})}
        ${field('Annual leave entitlement','annualEntitlement','number',{value:e.annualEntitlement})}
        ${field('Casual leave entitlement','casualEntitlement','number',{value:e.casualEntitlement||3})}
      </div>
      ${field('Reason for change','reason','textarea',{required:true,hint:'Recorded in the audit trail'})}
    </form>`,
    footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-act="submit-editstaff">Save changes</button>`});
  },
  'submit-editstaff':()=>{
    const d=new FormData($('#esForm')); const e=DB.db.employees.find(x=>x.id===d.get('id'));
    if(!e) return;
    const before={role:e.role,dept:e.dept,status:e.status,contract:e.contract};
    e.name=d.get('name'); e.role=d.get('role'); e.dept=d.get('dept'); e.county=d.get('county');
    e.contract=d.get('contract'); e.status=d.get('status');
    e.annualEntitlement=+d.get('annualEntitlement')||0; e.casualEntitlement=+d.get('casualEntitlement')||0;
    AUDIT.append({actor:AUTH.user.id,action:'staff.updated',entity:'employee',entityId:e.id,
      detail:`${e.name} - ${d.get('reason')}`, before:JSON.stringify(before),
      after:JSON.stringify({role:e.role,dept:e.dept,status:e.status,contract:e.contract})});
    DB.save(); closeModal(); toast('Staff record updated',e.name,'ok'); render();
  },
  'add-staff':()=>{
    openModal({title:'Add staff member', body:`<form data-form="staff" id="stfForm">
      <div class="grid g2">
        ${field('Full name','name','text',{required:true})}
        ${field('Job designation','role','text',{required:true})}
        ${field('Department','dept','select',{options:DEPARTMENTS.map(d=>({v:d.id,l:d.name}))})}
        ${field('County office','county','select',{options:COUNTIES.map(c=>({v:c.id,l:c.name}))})}
        ${field('Contract','contract','select',{options:[{v:'permanent',l:'Permanent'},{v:'casual',l:'Casual'},{v:'contract',l:'Fixed-term'}]})}
        ${field('Start date','start','date',{})}
      </div>
      ${field('Annual leave entitlement (days)','annualEntitlement','number',{value:15})}
    </form>`,
    footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-act="submit-staff">Add staff</button>`});
  },
  'submit-staff':()=>{
    const d=new FormData($('#stfForm'));
    DB.db.employees.push({id:uid('emp'),name:d.get('name'),role:d.get('role'),dept:d.get('dept'),county:d.get('county'),
      contract:d.get('contract'),start:d.get('start'),annualEntitlement:+d.get('annualEntitlement')||15,casualEntitlement:3,
      leaveTaken:0,status:'active',demo:true});
    AUDIT.append({actor:AUTH.user.id,action:'staff.created',entity:'employee',entityId:d.get('name'),detail:d.get('role')});
    DB.save(); closeModal(); toast('Staff record created','','ok'); render();
  },
  'log-trip':()=>{
    openModal({title:'Log trip', narrow:true, body:`<form data-form="trip" id="tripForm">
      ${field('Vehicle','vehicleId','select',{options:DB.db.vehicles.map(v=>({v:v.id,l:v.reg+' · '+v.model}))})}
      ${field('Date','date','date',{value:dateOnly(new Date())})}
      ${field('Purpose','purpose','textarea',{required:true})}
      <div class="grid g2">${field('Distance (km)','km','number',{})}${field('Fuel cost (KES)','fuel','number',{})}</div>
      ${field('Driver','driver','text',{})}
    </form>`,
    footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-act="submit-trip">Save trip</button>`});
  },
  'submit-trip':()=>{
    const d=new FormData($('#tripForm')); const v=DB.db.vehicles.find(x=>x.id===d.get('vehicleId'));
    DB.db.trips.push({id:uid('tr'),vehicleId:d.get('vehicleId'),countyId:v.countyId,date:d.get('date'),purpose:d.get('purpose'),
      km:+d.get('km')||0,fuel:+d.get('fuel')||0,driver:d.get('driver')||v.driver,demo:true});
    if(v) v.odometer += (+d.get('km')||0);
    AUDIT.append({actor:AUTH.user.id,action:'trip.logged',entity:'vehicle',entityId:v.id,detail:d.get('purpose')});
    DB.save(); closeModal(); toast('Trip logged','','ok'); render();
  },
  'edit-area':(d)=>{
    const a=areaObj(d.id); const c=COUNTIES.find(x=>x.areas.some(y=>y.id===d.id));
    openModal({title:'Edit ministry area', narrow:true, body:`<form data-form="area" id="areaForm">
      <input type="hidden" name="id" value="${d.id}">
      ${field('Name','name','text',{value:a.name,required:true})}
      ${field('County office','county','text',{value:c.name})}
      ${field('Classification','cls','select',{value:a.cls,options:[{v:'urban',l:'Urban / slum-based'},{v:'village',l:'Village-based'}]})}
      <div class="hint">Classification is a configurable attribute, never hard-coded into application logic.</div>
    </form>`,
    footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-act="submit-area">Save changes</button>`});
  },
  'submit-area':()=>{
    const d=new FormData($('#areaForm')); const a=areaObj(d.get('id'));
    const before=a.cls; a.name=d.get('name'); a.cls=d.get('cls');
    AUDIT.append({actor:AUTH.user.id,action:'org.area_updated',entity:'area',entityId:a.id,detail:`${before} → ${a.cls}`});
    DB.save(); closeModal(); toast('Ministry area updated','','ok'); render();
  },
  'add-area':(d)=>{
    openModal({title:'Add ministry area', narrow:true, body:`<form data-form="newarea" id="naForm">
      <input type="hidden" name="county" value="${d.county}">
      ${field('Name','name','text',{required:true})}
      ${field('Classification','cls','select',{options:[{v:'urban',l:'Urban / slum-based'},{v:'village',l:'Village-based'}]})}
      <div class="hint">Verify against the current organogram before importing field data.</div>
    </form>`,
    footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-act="submit-newarea">Add area</button>`});
  },
  'submit-newarea':()=>{
    const d=new FormData($('#naForm')); const c=COUNTIES.find(x=>x.id===d.get('county'));
    const id=d.get('name').toLowerCase().replace(/[^a-z]/g,'').slice(0,12)+Math.floor(Math.random()*99);
    c.areas.push({id,name:d.get('name'),cls:d.get('cls')});
    AUDIT.append({actor:AUTH.user.id,action:'org.area_added',entity:'area',entityId:id,detail:d.get('name')});
    DB.save(); closeModal(); toast('Ministry area added',d.get('name'),'ok'); render();
  }
};}

function systemActions(){ return {
  'new-account':()=>{
    openModal({title:'Request a new account', sub:'A request does not grant access. Approval by the County Office Administrator is required.',
      body:`<form data-form="account" id="accForm">
        ${field('Full name','name','text',{required:true})}
        ${field('Job designation','jobTitle','text',{required:true,hint:'Official position, distinct from account type'})}
        ${field('Account type (role)','roleId','select',{required:true,options:ROLES.filter(r=>r.id!=='chief').map(r=>({v:r.id,l:r.name}))})}
        ${field('Department','departmentId','select',{options:DEPARTMENTS.map(d=>({v:d.id,l:d.name}))})}
        ${field('County office','countyId','select',{required:true,options:COUNTIES.map(c=>({v:c.id,l:c.name}))})}
        ${field('Ministry areas (if field role)','areas','text',{hint:'Comma-separated area IDs, e.g. nyalenda, manyatta'})}
        ${field('Reporting officer','reportsTo','select',{options:DB.db.users.map(u=>({v:u.id,l:u.name}))})}
        ${field('Justification','justification','textarea',{required:true})}
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-act="submit-account">Submit request</button>`});
  },
  'submit-account':()=>{
    const d=new FormData($('#accForm'));
    const a={id:uid('ac'),name:d.get('name'),jobTitle:d.get('jobTitle'),roleId:d.get('roleId'),departmentId:d.get('departmentId'),
      countyId:d.get('countyId'),areaIds:(d.get('areas')||'').split(',').map(s=>s.trim()).filter(Boolean),
      reportsTo:d.get('reportsTo'),justification:d.get('justification'),requestedBy:AUTH.user.id,requestedAt:todayISO(),
      status:'submitted',demo:true};
    DB.db.accountRequests.push(a);
    AUDIT.append({actor:AUTH.user.id,action:'account.requested',entity:'account',entityId:a.id,detail:a.name+' · '+a.roleId});
    DB.db.users.filter(u=>u.roleId==='countyadmin'&&u.countyId===a.countyId).forEach(u=>notify(u.id,'Account request',a.name+' - '+a.jobTitle,'info'));
    DB.save(); closeModal(); toast('Account request submitted','Awaiting County Office Administrator approval.','ok'); render();
  },
  'review-account':(d)=>{
    const a=DB.db.accountRequests.find(x=>x.id===d.id); if(!a) return;
    openModal({title:'Review account request', sub:a.name, body:`
      <dl class="dl">
        <dt>Job designation</dt><dd>${esc(a.jobTitle)}</dd>
        <dt>Account type</dt><dd>${esc(roleObj(a.roleId)?.name||a.roleId)}</dd>
        <dt>Department</dt><dd>${esc(deptName(a.departmentId))}</dd>
        <dt>County</dt><dd>${esc(countyName(a.countyId))}</dd>
        <dt>Ministry areas</dt><dd>${esc((a.areaIds||[]).map(areaName).join(', ')||'-')}</dd>
        <dt>Requested by</dt><dd>${esc(userName(a.requestedBy))}</dd>
        <dt>Justification</dt><dd style="max-width:60%">${esc(a.justification)}</dd>
      </dl>
      <div class="divider"></div>
      <div class="alert info">${ic('info',17)}<div><b>Least privilege</b><span class="small">The account will receive only the capabilities of the selected role template, restricted to ${esc(countyName(a.countyId))}${(a.areaIds||[]).length?' and '+a.areaIds.map(areaName).join(', '):''}.</span></div></div>
      <form data-form="approveaccount" id="aaForm" style="margin-top:12px"><input type="hidden" name="id" value="${d.id}">
        ${field('Decision','decision','select',{options:[{v:'approved',l:'Approve'},{v:'rejected',l:'Reject'}]})}
        ${field('Note','note','textarea',{})}
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-act="submit-account-decision">Record decision</button>`});
  },
  'submit-account-decision':()=>{
    const d=new FormData($('#aaForm')); const a=DB.db.accountRequests.find(x=>x.id===d.get('id'));
    a.status=d.get('decision'); a.reviewedBy=AUTH.user.id; a.reviewedAt=todayISO(); a.note=d.get('note');
    if(d.get('decision')==='approved'){
      const username=(a.name||'user').toLowerCase().replace(/[^a-z ]/g,'').split(' ').filter(Boolean).slice(0,2).join('.')+'.'+a.roleId;
      const salt=newSalt(); const temp='DIMS-'+Math.random().toString(36).slice(2,8).toUpperCase();
      DB.db.users.push({ id:uid('u'), name:a.name, username, roleId:a.roleId, jobTitle:a.jobTitle, departmentId:a.departmentId,
        countyId:a.countyId, areaIds:a.areaIds||[], reportsTo:a.reportsTo, status:'active', createdBy:a.requestedBy,
        approvedBy:AUTH.user.id, created:todayISO(), salt, hash:strongHash(temp,salt), mustChange:true, demo:true });
      a.generatedUsername=username; a.generatedTemp=temp;
      AUDIT.append({actor:AUTH.user.id,action:'account.created',entity:'user',entityId:username,detail:a.name+' · '+a.roleId});
      closeModal();
      openModal({title:'Account approved - onboarding sheet', narrow:true, body:`
        <div class="alert ok">${ic('check',17)}<div><b>Account created</b><span class="small">The password is shown once, here, and is never stored in readable form.</span></div></div>
        <dl class="dl" style="margin-top:14px">
          <dt>Username</dt><dd class="mono">${esc(username)}</dd>
          <dt>Activation code</dt><dd class="mono">${esc(temp)}</dd>
          <dt>Role</dt><dd>${esc(roleObj(a.roleId)?.name)}</dd>
          <dt>County</dt><dd>${esc(countyName(a.countyId))}</dd>
        </dl>
        <div class="note" style="margin-top:12px">${ic('info',14)}<span>Print this sheet for the staff member. They must change the password at first sign-in.</span></div>`,
        footer:`<button class="btn btn-primary" data-act="print">Print sheet</button><button class="btn btn-ghost" data-act="close-modal">Done</button>`});
      return;
    }
    AUDIT.append({actor:AUTH.user.id,action:'account.rejected',entity:'account',entityId:a.id,detail:d.get('note')||''});
    DB.save(); closeModal(); toast('Decision recorded','','ok'); render();
  },
  'manage-user':(d)=>{
    const u=DB.db.users.find(x=>x.id===d.id);
    openModal({title:u.name, sub:`${roleObj(u.roleId)?.name} · ${countyName(u.countyId)}`, body:`
      <dl class="dl"><dt>Username</dt><dd class="mono">${esc(u.username)}</dd><dt>Department</dt><dd>${esc(deptName(u.departmentId))}</dd>
      <dt>Ministry areas</dt><dd>${esc((u.areaIds||[]).map(areaName).join(', ')||'-')}</dd>
      <dt>Status</dt><dd>${badge(titleCase(u.status),u.status==='active'?'b-ok':'b-warn')}</dd>
      <dt>Last login</dt><dd>${u.lastLogin?fmtDateTime(u.lastLogin):'never'}</dd></dl>
      <div class="divider"></div>
      <form data-form="manageuser" id="muForm"><input type="hidden" name="id" value="${d.id}">
        ${field('Account status','status','select',{value:u.status,options:['active','suspended','deactivated'].map(s=>({v:s,l:titleCase(s)}))})}
        ${field('Reason','reason','textarea',{required:true})}
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-act="submit-manageuser">Apply</button>`});
  },
  'submit-manageuser':()=>{
    const d=new FormData($('#muForm')); const u=DB.db.users.find(x=>x.id===d.get('id'));
    const before=u.status; u.status=d.get('status');
    AUDIT.append({actor:AUTH.user.id,action:'account.status_changed',entity:'user',entityId:u.id,detail:before+' → '+u.status+' - '+d.get('reason')});
    DB.save(); closeModal(); toast('Account updated','','ok'); render();
  },
  'create-backup':()=>{
    const b = BACKUP.create(AUTH.user,'Manual backup');
    toast('Backup taken', b.id+' · Validate it before relying on it','ok'); render();
  },
  'backup-validate':(d)=>{
    const v = BACKUP.validate(AUTH.user, d.id);
    toast(v.ok?'Validation passed':'Validation failed',
      v.ok?'Every structural check passed. Continue to the migration plan.':v.checks.filter(c=>!c.ok).map(c=>c.name).join('; '),
      v.ok?'ok':'err');
    render();
  },
  'backup-plan':(d)=>{
    const m = BACKUP.plan(AUTH.user, d.id);
    if(!m) return;
    toast(m.ok?'Migration plan prepared':'Cannot plan', m.ok? m.steps.length+' steps listed for review':'Validate the copy first', m.ok?'ok':'err');
    render();
  },
  'backup-verify':(d)=>{
    const v = BACKUP.verify(AUTH.user, d.id);
    toast(v.ok?'Rehearsal passed':'Rehearsal failed',
      v.ok?'The restore was rehearsed in isolation. The live database was not touched.':v.checklist.filter(c=>!c.ok).map(c=>c.name).join('; '),
      v.ok?'ok':'err');
    render();
  },
  'backup-activate':(d)=>{
    const r = BACKUP.requestActivation(AUTH.user, d.id);
    if(!r.ok) return toast('Cannot request activation', r.msg, 'err');
    toast('Activation requested','A second authorised signature is required before anything is restored.','warn');
    render();
  },
  'backup-execute':(d)=>{
    const b = DB.db.backups.find(x=>x.id===d.b);
    if(!b) return;
    openModal({title:'Execute the restore', narrow:true, body:`
      <div class="alert crit">${ic('alert',18)}<div><b>This replaces live records</b>
        <span class="small">Every patient, clinical, care, hospital, finance, HR and fleet record will be replaced by the copy <span class="mono">${esc(b.id)}</span> taken ${fmtDateTime(b.at)}. An automatic pre-restore snapshot will be kept. Accounts and the audit trail are not affected.</span></div></div>
      <p class="small muted">Type the backup identifier to confirm.</p>
      <form data-form="restore-exec" id="restoreForm"><input type="hidden" name="approvalId" value="${esc(d.id)}"><input type="hidden" name="backupId" value="${esc(b.id)}">
        ${field('Backup identifier','confirm','text',{required:true,hint:'Exactly as shown above'})}</form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-danger" data-act="submit-restore" data-approval="${esc(d.id)}" data-backup="${esc(b.id)}">Restore records</button>`});
  },
  'submit-restore':(d)=>{
    const f=$('#restoreForm'); if(!f) return;
    const dd=new FormData(f);
    const b = DB.db.backups.find(x=>x.id===dd.get('backupId'));
    if(!b || dd.get('confirm')!==b.id) return toast('Not executed','The identifier does not match. Nothing was restored.','err');
    const r = BACKUP.activate(AUTH.user, d.approval);
    if(!r.ok) return toast('Restore refused', r.msg, 'err');
    closeModal(true); toast('Restore completed','Pre-restore snapshot '+r.preRestore.id+' retained.','ok');
    render();
  },
  'backup-report':(d)=>{
    const b = DB.db.backups.find(x=>x.id===d.id);
    if(!b) return;
    const st = BACKUP.stageOf(b);
    const checkList = (title, obj, key)=>{
      if(!obj) return `<div class="stage-block"><div class="stage-h">${title}<span class="muted xs">not yet run</span></div></div>`;
      const ok = obj.ok!==false;
      const items = obj.checks||obj.checklist||obj.steps||[];
      return `<div class="stage-block"><div class="stage-h">${title}${badge(ok?'Passed':'Not passed', ok?'b-ok':'b-crit','nodot')}<span class="muted xs">${fmtDateTime(obj.at)} · ${esc(userName(obj.by))}</span></div>
        <div class="col" style="gap:6px;margin-top:8px">${items.map(c=>`<div class="row" style="gap:8px;align-items:flex-start"><span style="color:${c.ok===false?'var(--crit)':'var(--ok)'};flex:0 0 15px">${ic(c.ok===false?'alert':'check',14)}</span>
          <div><span class="small">${esc(c.name||c.step)}</span>${c.detail?`<div class="xs muted">${esc(c.detail)}</div>`:''}</div></div>`).join('')}</div></div>`;
    };
    openModal({title:'Backup report', sub:`${b.id} · ${b.label||''} · ${fmtDateTime(b.at)}`, wide:true, body:`
      <div class="row" style="gap:10px;margin-bottom:14px">
        <span class="badge ${st.tone==='ok'?'b-ok':st.tone==='crit'?'b-crit':'b-warn'}">${esc(st.label)}</span>
        <span class="chip mono">${esc(b.digest)}</span>
        <span class="chip">${b.bytes?(b.bytes/1024).toFixed(0)+' KB':''}</span>
        <span class="chip">Schema ${esc(String(b.schema||'-'))}</span>
      </div>
      ${checkList('1 · Backup', {ok:true, at:b.at, by:b.createdBy, checks:[{name:'Copy taken with an integrity digest', ok:true, detail:b.digest}]})}
      ${checkList('2 · Validate', b.validation)}
      ${checkList('3 · Migrate', b.migration)}
      ${checkList('4 · Verify', b.verification)}
      ${b.activation?`<div class="stage-block"><div class="stage-h">5 · Activate ${badge(b.activation.executed?'Executed':(b.activation.approvalId?'Awaiting approval':'Not requested'), b.activation.executed?'b-ok':'b-warn','nodot')}</div>
        <div class="small" style="margin-top:8px">${b.activation.executed?`Restored ${fmtDateTime(b.activation.executedAt)} by ${esc(userName(b.activation.executedBy))}. Pre-restore snapshot ${esc(b.activation.preRestoreBackup||'-')} retained.`:`Approval request ${esc(b.activation.approvalId||'-')} raised ${fmtDateTime(b.activation.requestedAt)}.`}</div></div>`:''}
    `, footer:`<button class="btn btn-ghost" data-act="close-modal">Close</button>`});
  },
  'download-backup':(d)=>{
    const b=DB.db.backups.find(x=>x.id===d.id);
    download(`LOMAMO-DIMS-backup-${b.id}.json`, JSON.stringify(DB.db,null,2),'application/json');
    AUDIT.append({actor:AUTH.user.id,action:'backup.downloaded',entity:'backup',entityId:b.id,detail:'Backup exported'});
    DB.save();
  },
  'request-restore':()=>{
    const a=APPROVALS.request('database restore',AUTH.user,{note:'Restore request from backup console'});
    toast('Restore approval requested','A second approval from the Media & Information Governance Head is required.','warn');
    render();
  },
  'request-export':()=>{
    const a=APPROVALS.request('full database export',AUTH.user,{note:'Export request'});
    toast('Export approval requested','Dual approval required before the export can be released.','warn');
    render();
  },
  'approve-op':(d)=>{
    const r=APPROVALS.approve(d.id,AUTH.user);
    if(!r.ok) return toast('Cannot approve',r.msg,'err');
    toast('Approval recorded', APPROVALS.canExecute(r.a)?'Approval threshold met.':'Awaiting a further approval.','ok');
    render();
  },
  'verify-chain':()=>{
    const v=AUDIT.verify();
    openModal({title:'Audit chain verification', narrow:true, body:`
      <div class="alert ${v.ok?'ok':'crit'}">${ic(v.ok?'check':'alert',18)}<div><b>${v.ok?'Chain intact':'Chain integrity failure'}</b>
        <span class="small">${v.entries} entries verified against their predecessor hashes.</span></div></div>
      ${v.ok?'':`<p class="small" style="margin-top:10px">Broken at sequence: ${v.broken.join(', ')}</p>`}
      <div class="note" style="margin-top:12px">${ic('lock',14)}<span>Each entry's hash covers the previous entry's hash, so inserting, editing or deleting an entry breaks the chain at that point.</span></div>`,
      footer:`<button class="btn btn-primary" data-act="close-modal">Close</button>`});
  },
  'run-security-test':()=>{
    const r=runSecuritySelfTest(AUTH.user);
    toast('Self-test complete',`${r.passed} of ${r.total} controls effective.`, r.passed===r.total?'ok':'warn');
    go('security');
  },
  'monday-now':()=>{
    const run=[];
    COUNTIES.forEach(c=>['patient_figures','patient_days','expenditure'].forEach(t=>{
      run.push(REPORTS.generate(t,{countyId:c.id,scheduled:false},AUTH.user));
    }));
    DB.db.settings.mondayReport.lastRun=todayISO();
    DB.save(); toast('Report set generated',run.length+' reports archived for both counties.','ok'); go('archive');
  },
  'probe-ai':async()=>{
    const ok=await AI.ollamaProbe();
    toast(ok?'Local model reachable':'Local model not reachable', ok?'Ollama responded at the configured endpoint.':'Start Ollama locally, or continue with the built-in rule-based assistant.','info');
  },
  'open-notifications':()=>{
    const ns=DB.db.notifications.filter(n=>n.userId===AUTH.user.id);
    ns.forEach(n=>n.read=true); DB.save();
    openModal({title:'Notifications', body: ns.length? `<div class="col" style="gap:9px">${ns.slice(0,30).map(n=>`
      <div class="row" style="gap:11px;padding:11px;border:1px solid var(--line);border-radius:10px;align-items:flex-start">
        <div style="color:${n.kind==='warn'?'var(--warn)':'var(--info)'};flex:0 0 18px">${ic(n.kind==='warn'?'alert':'info',16)}</div>
        <div style="flex:1"><div class="small bold">${esc(n.title)}</div><div class="xs muted">${esc(n.body)}</div>
        <div class="xs" style="margin-top:3px;opacity:.6">${fmtDateTime(n.at)}</div></div></div>`).join('')}</div>`
      : emptyState('No notifications','Workflow updates assigned to you appear here.','bell'),
      footer:`<button class="btn btn-ghost" data-act="close-modal">Close</button>`});
    setTimeout(()=>render(),200);
  }
};}

function reportActions(){ return {
  generate:(d)=>{
    const county = roleObj(AUTH.user.roleId)?.scope?.geo==='global'? 'all': AUTH.user.countyId;
    const rec=REPORTS.generate(d.type,{countyId:county},AUTH.user);
    toast('Report generated',`${rec.title} · ${rec.periodKey} · v${rec.version}`,'ok');
    go('report',{id:rec.id});
  },
  'preview-report':(d)=>{ go('report',{type:d.type}); },
  'view-report':(d)=>{ go('report',{id:d.id}); },
  'export-report':(d)=>{
    const r=DB.db.reports.find(x=>x.id===d.id);
    if(!r) return;
    if(r.type==='patient_figures'){
      const f=REPORTS.patientFigures(AUTH.user,{countyId:r.countyId==='all'?'all':r.countyId});
      const csv=toCSV(f.byArea,[{label:'Ministry area',get:x=>x.area.name},{label:'Classification',get:x=>x.area.cls},
        {label:'Active',get:x=>x.active},{label:'New',get:x=>x.newEnrol},{label:'Discharged',get:x=>x.discharged},
        {label:'Follow-up',get:x=>x.followup},{label:'Requests',get:x=>x.requests}]);
      download('LOMAMO-patient-figures-'+r.periodKey+'.csv',csv);
    } else {
      download('LOMAMO-'+r.type+'-'+r.periodKey+'.csv',toCSV([{title:r.title,period:r.periodKey,version:r.version}],[{label:'Report',key:'title'},{label:'Period',key:'period'},{label:'Version',key:'version'}]));
    }
    AUDIT.append({actor:AUTH.user.id,action:'report.exported',entity:'report',entityId:r.id,detail:r.title});
    DB.save();
  },
  'export-patients':()=>{
    if(!RBAC.assert(AUTH.user,'patient.export',{},false)) return toast('Not permitted','Patient export requires the patient.export capability. The attempt was logged.','err');
    const rows=repo.patientList(AUTH.user,{q:APPX.params.q,areaId:APPX.params.area,status:APPX.params.status});
    const cols=[{label:'Code',key:'code'},{label:'Name',key:'name'},{label:'Area',get:p=>areaName(p.areaId)},
      {label:'County',get:p=>countyName(p.countyId)},{label:'Status',get:p=>WORKFLOW.patient.labels[p.status]||p.status},
      {label:'Intake',get:p=>dateOnly(p.intake)},{label:'Days',get:p=>PAT.days(p)}];
    download('LOMAMO-patients-'+new Date().toISOString().slice(0,10)+'.csv', toCSV(rows,cols));
    AUDIT.append({actor:AUTH.user.id,action:'data.export',entity:'patient',entityId:'register',
      detail:`${rows.length} scoped patient rows exported as CSV`,meta:{county:countyName(AUTH.user.countyId)}});
    DB.save();
    toast('Export prepared', rows.length+' scoped records.','ok');
  },
  'export-audit':()=>{
    const q=REPORTS.dataQuality(AUTH.user);
    download('LOMAMO-audit-findings.csv', toCSV(q,[{label:'Severity',key:'level'},{label:'Finding',key:'text'}]));
  },
  'export-matrix':()=>{
    const rows=ROLES.map(r=>({role:r.name, scope:r.scope.geo+'/'+r.scope.records, caps:RBAC.expandedPerms(r.id).length, perms:RBAC.expandedPerms(r.id).join(' ')}));
    download('LOMAMO-rbac-matrix.csv', toCSV(rows,[{label:'Role',key:'role'},{label:'Scope',key:'scope'},{label:'Capabilities',key:'caps'},{label:'Permissions',key:'perms'}]));
  }
};}

function aiActions(){ return {
  'toggle-ai':()=>{
    APPX.aiOpen=!APPX.aiOpen;
    renderAIDock();
    if(APPX.aiOpen && AI.ollamaProbe){ AI.ollamaProbe().then(()=>{ if(APPX.aiOpen) renderAIDock(); }).catch(()=>{}); }
  },
  'close-ai':()=>{ APPX.aiOpen=false; renderAIDock(); },
  'ai-toggle-cfg':()=>{ AI.settingsOpen=!AI.settingsOpen; renderAIDock(); },
  'ai-clear-chat':()=>{ AI.history=[]; renderAIDock(); },
  'ai-probe-dock':async ()=>{
    AI.busy=true; renderAIDock();
    const ok = await AI.ollamaProbe();
    AI.busy=false; renderAIDock();
    toast(ok ? 'Local Ollama connected' : 'Offline Verified Engine active',
      ok ? `Connected via ${AI.status.via} (${AI.status.activeModel||'llama3.2'}).`
         : 'No local Ollama instance responded at the configured URL; using verified offline engine.',
      ok ? 'ok' : 'info');
  },
  'ai-save-cfg':async ()=>{
    const cfg = AI.cfg();
    const urlEl = $('#aiCfgUrl'), modEl = $('#aiCfgModel'), modeEl = $('#aiCfgMode');
    if(urlEl) cfg.ollama = String(urlEl.value||'http://127.0.0.1:11434').trim();
    if(modEl) cfg.model = String(modEl.value||'llama3.2').trim();
    if(modeEl) cfg.mode = String(modeEl.value||'auto').trim();
    DB.save();
    AI.settingsOpen = false;
    await AI.ollamaProbe();
    renderAIDock();
    toast('AI connection saved', AI.status.online ? `Connected to ${AI.status.activeModel} via ${AI.status.via}.` : `Mode: ${cfg.mode} (${cfg.ollama}).`, 'ok');
  },
  'ai-send':async ()=>{
    const inp=$('#aiInput'); if(!inp||!inp.value.trim()) return;
    const q=inp.value.trim(); inp.value='';
    AI.history.push({role:'user',text:q});
    const baseline = AI.answer(AUTH.user,q);
    AI.history.push({role:'bot',...baseline});
    renderAIDock();
    setTimeout(()=>{ const b=$('#aiBody'); if(b) b.scrollTop=b.scrollHeight; },40);
    if(AI.cfg().mode !== 'offline'){
      try{
        const idx = AI.history.length - 1;
        const enriched = await AI.ask(AUTH.user, q, APPX.view);
        if(enriched && enriched.text && AI.history[idx]){
          AI.history[idx] = { role:'bot', ...enriched };
          renderAIDock();
          setTimeout(()=>{ const b=$('#aiBody'); if(b) b.scrollTop=b.scrollHeight; },40);
        }
      }catch(e){}
    }
  },
  'ai-chip':async (d)=>{
    const q = d.q;
    AI.history.push({role:'user',text:q});
    const baseline = AI.answer(AUTH.user,q);
    AI.history.push({role:'bot',...baseline});
    renderAIDock();
    setTimeout(()=>{ const b=$('#aiBody'); if(b) b.scrollTop=b.scrollHeight; },40);
    if(AI.cfg().mode !== 'offline'){
      try{
        const idx = AI.history.length - 1;
        const enriched = await AI.ask(AUTH.user, q, APPX.view);
        if(enriched && enriched.text && AI.history[idx]){
          AI.history[idx] = { role:'bot', ...enriched };
          renderAIDock();
          setTimeout(()=>{ const b=$('#aiBody'); if(b) b.scrollTop=b.scrollHeight; },40);
        }
      }catch(e){}
    }
  }
};}

/* ---------------- Field building ---------------- */
function field(label, name, type='text', opts={}){
  const id='f_'+name;
  const req = opts.required? ' required':'';
  const val = opts.value!==undefined && opts.value!==null? opts.value:'';
  let input='';
  if(type==='select'){
    input=`<select class="input" id="${id}" name="${name}"${req}>${(opts.options||[]).map(o=>{
      const v=typeof o==='object'?o.v:o, l=typeof o==='object'?o.l:o;
      return `<option value="${esc(v)}" ${String(val)===String(v)?'selected':''}>${esc(l)}</option>`;
    }).join('')}</select>`;
  } else if(type==='textarea'){
    input=`<textarea class="input" id="${id}" name="${name}"${req} placeholder="${esc(opts.placeholder||'')}">${esc(val)}</textarea>`;
  } else if(type==='checkbox'){
    return `<div class="checkline"><input type="checkbox" id="${id}" name="${name}" ${val?'checked':''}><label for="${id}" style="margin:0;font-weight:500">${esc(label)}</label></div>`;
  } else if(type==='file'){
    input=`<input class="input" id="${id}" name="${name}" type="file" accept="${esc(opts.accept||'')}">`;
  } else {
    input=`<input class="input" id="${id}" name="${name}" type="${type}" value="${esc(val)}"${req} placeholder="${esc(opts.placeholder||'')}" ${opts.min!==undefined?`min="${opts.min}"`:''}>`;
  }
  return `<div class="field"><label for="${id}">${esc(label)}${opts.required?' <span style="color:var(--crit)">*</span>':''}</label>${input}
    ${opts.hint?`<div class="hint">${esc(opts.hint)}</div>`:''}</div>`;
}
function saveSetting(key, value){
  const s=DB.db.settings;
  switch(key){
    case 'accentMode': s.accentMode=value; break;
    case 'density': s.density=value; break;
    case 'animations': s.animations=value; break;
    case 'sounds': s.sounds=value; break;
    case 'mondayEnabled': s.mondayReport.enabled=value; break;
    case 'reportCutoff': s.reportCutoff=value; break;
    case 'aiEnabled': s.ai.enabled=value; break;
    case 'aiProvider': s.ai.provider=value; break;
    case 'ollama': s.ai.ollama=value; break;
    case 'aiModel': s.ai.model=value; break;
    case 'pwMin': s.security.passwordMinLength=+value||12; break;
    case 'idle': s.idleMinutes=+value||20; break;
    case 'sessionLock': s.security.sessionLock=value; break;
    case 'loginAttempts': s.security.loginAttempts=+value||5; break;
  }
  AUDIT.append({actor:AUTH.user.id,action:'settings.changed',entity:'setting',entityId:key,detail:String(value)});
  DB.save(); applyTheme(); render();
}

/* ---------------- Forms ---------------- */
const FORMS = {
  'care-log':(d)=>submitCareLog(d),
  'care-incident':(d)=>submitCareIncident(d),
  'care-incident-close':(d)=>submitCareIncidentClose(d),
  'condition-record':(d)=>submitConditionRecord(d),
  'delegation-issue':(d)=>submitDelegationIssue(d),
  'pdca-complete':(d)=>submitPdcaComplete(d),
  'pdca-extension':(d)=>submitPdcaExtension(d),
  'workplan':()=>ACTIONS['submit-workplan']({}),
  'message':(d)=>{
    const thread=d.get('thread'); const text=String(d.get('text')||'').trim();
    if(!text) return;
    const r=MESSAGING.send(AUTH.user,{thread, text});
    if(r.error) return toast('Not sent', r.error, 'err');
    MESSAGING.markRead(AUTH.user, thread);
    render();
  },
  'message-new':()=>ACTIONS['submit-message']({}),
  'enquiry':()=>ACTIONS['submit-enquiry']({}),
  'profile':()=>ACTIONS['submit-profile']({}),
  'enquiry-answer':()=>ACTIONS['submit-enquiry-answer']({}),
  login: async (d)=>{
    const hosted = typeof SYNC !== 'undefined' && SYNC.available && SYNC.available();
    let r;
    if(hosted){
      try{ r = await AUTH.loginOnline(String(d.get('username')||'').trim(), String(d.get('password')||''), 'this device'); }
      catch(e){ r = {ok:false, error:'The shared online source could not be reached.'}; }
    } else {
      r = AUTH.login(d.get('username'),d.get('password'));
    }
    if(!r.ok) return toast('Sign-in failed', r.msg || r.error || 'The online source did not accept that sign-in.','err');
    NAVH.reset(); NAVH.push('home',{}); APPX.view='home'; APPX.params={};
    SESSION.start();
    try{ history.replaceState(null,'','#/home'); }catch(e){}
    render();
    toast('Welcome', r.user.name,'ok');
  },
  unlock:(d)=>{
    const r=AUTH.unlock(d.get('password'));
    if(!r.ok) return toast('Incorrect password','','err');
    render();
  },
  'create-chief':(d)=>{
    if(typeof PROD_SETUP !== 'undefined' && PROD_SETUP.isGloballyActivated && PROD_SETUP.isGloballyActivated()) return toast('Setup locked', 'This installation is already globally activated.', 'err');
    if(typeof SYNC !== 'undefined' && SYNC.available && SYNC.available()) return toast('Use the shared online setup', 'A hosted client cannot create a separate device-local Chief Administrator.', 'err');
    if(d.get('password')!==d.get('password2')) return toast('Passwords do not match','','err');
    if((d.get('password')||'').length<12) return toast('Password too short','Use at least 12 characters.','err');
    const salt=newSalt();
    DB.db.users.push({ id:'u-chief', name:d.get('name'), username:d.get('username'), roleId:'chief', jobTitle:'Chief System Administrator',
      departmentId:'admin', countyId:'kisumu', areaIds:[], status:'active', created:todayISO(), salt,
      hash:strongHash(d.get('password'),salt), mustChange:false, demo:false });
    DB.db.settings.onboarding.step=3;
    AUDIT.append({actor:'u-chief',action:'system.bootstrap',entity:'user',entityId:'u-chief',detail:'Chief System Administrator created'});
    DB.save();
    const r=AUTH.login(d.get('username'), d.get('password'));
    render(); toast('Administrator created', 'Confirm the organisational structure to finish setup.','ok');
  },
  'change-password':(d)=>{ /* Enter inside the password modal */ if(d && d.get && d.get('current')!==undefined){ ACTIONS['submit-pw'](); } },
  'wf':(d)=>{ if(d && d.get && d.get('kind')) ACTIONS['submit-wf'](); },
  'sync-auth':()=>ACTIONS['sync-auth'](),
  'resolve-concern':()=>{},
  'pdca':()=>{},
  'assessment':()=>{},
  'visit':()=>{},
  'request':()=>{},
  'newpdca':()=>{},
  'upload':async (d)=>{
    const pid=d.get('patientId'); const p=DB.db.patients.find(x=>x.id===pid);
    const file=d.get('file');
    const doc={id:uid('doc'),patientId:pid,kind:d.get('kind'),classification:d.get('classification'),
      uploadedBy:AUTH.user.id,uploadedAt:todayISO(),consent:p?.consent.status||'pending',
      publication:d.get('classification')==='story_material'?'pending_review':'not_eligible',
      restricted:!!d.get('restricted'),demo:false,fileStored:false};
    const hasFile=file && typeof file==='object' && file.size>0;
    if(hasFile){
      const r=await FILEVAULT.store(file,{patientId:pid,kind:d.get('kind'),classification:d.get('classification'),
        note:d.get('note')||''});
      if(r.ok){ doc.fileStored=true; doc.fileId=r.id; doc.fileName=r.name; doc.fileBytes=r.bytes; doc.fileSha=r.sha256; doc.retention=r.retention; }
      else {
        /* The metadata is kept, but the record must not claim the file exists. */
        DB.db.documents.push(doc);
        AUDIT.append({actor:AUTH.user.id,action:'document.upload_failed',entity:'patient',entityId:pid,detail:r.msg});
        DB.save(); closeModal();
        toast('Document recorded without its file', r.msg+' The record is marked as having no stored file.','err');
        render(); return;
      }
    }
    DB.db.documents.push(doc);
    AUDIT.append({actor:AUTH.user.id,action:'document.uploaded',entity:'patient',entityId:pid,
      detail:titleCase(d.get('kind'))+(doc.fileStored?` · file ${doc.fileName} · ${doc.fileBytes} bytes · sha ${String(doc.fileSha||'').slice(0,12)}`:' · no file attached')});
    DB.save(); closeModal();
    toast('Document uploaded', doc.fileStored?'The file is stored on the host with its digest and retention class.'
      :'The record was saved without a file. Choose a file next time, or attach it from the documents tab.','ok');
    render();
  },
  'recon':()=>{},
  'expense':()=>{},
  'budget':()=>{},
  'target':()=>{},
  'consent':()=>{},
  'staff':()=>{},
  'editstaff':()=>{},
  'trip':()=>{},
  'area':()=>{},
  'newarea':()=>{},
  'account':()=>{},
  'approveaccount':()=>{},
  'manageuser':()=>{},
  'import':()=>{},
  'hosp-followup':(d, formEl)=>{
    const reqId = (formEl && formEl.dataset && formEl.dataset.id) || ($('[data-form="hosp-followup"]')?.dataset?.id) || '';
    const r = HOSP_FOLLOWUP.submit(d, reqId, AUTH.user);
    if(!r.ok) return toast('Follow-up not saved', r.msg, 'err');
    closeModal(true);
    toast('Post-visit follow-up recorded', `${r.entry.clinic} scheduled for ${r.entry.reviewDate}; Hospital Department notified${r.spawnedCode?' ('+r.spawnedCode+' created)':''}.`, 'ok');
    render();
  },
  'dualcheck-new':(d)=>{
    const r = DUALCHECK.submitNewBatch(d, AUTH.user);
    if(!r.ok) return toast('Not saved', r.msg||'Check fields', 'err');
    closeModal(true);
    toast('Comparison batch opened', `${r.batch.code} ready for 2/2 Admin & International Data cross-check.`, 'ok');
    render();
  }
};

/* ---------------- AI dock ---------------- */
function renderAIDock(){
  let dock = $('.ai-dock');
  if(!AUTH.user){ if(dock) dock.remove(); return; }
  if(!dock){ dock=document.createElement('div'); dock.className='ai-dock'; document.body.appendChild(dock); }
  if(!RBAC.has(AUTH.user,'ai.use')){ dock.innerHTML=''; return; }
  const prof = AI.profileFor ? AI.profileFor(AUTH.user, APPX.view) : { title:'LOMAMO C-DIMS Assistant', badge:'Console AI', summary:'', chips:[] };
  const cfg = AI.cfg ? AI.cfg() : { mode:'auto', ollama:'http://127.0.0.1:11434', model:'llama3.2' };
  const chipList = (prof.chips && prof.chips.length ? prof.chips : [
    'What is my caseload this week?',
    'Which patients need attention?',
    'Summarise open hospital requests',
    'How is the budget tracking?',
    'Show data quality findings'
  ]).slice(0,5);
  const connLabel = AI.status && AI.status.online
    ? `Ollama Live · ${esc(AI.status.activeModel||cfg.model)} (${esc(AI.status.via)})`
    : (cfg.mode==='offline' ? 'Offline Verified Mode' : 'Verified Engine · Ready for Ollama');
  const modelChoices = Array.from(new Set([cfg.model||'llama3.2', ...(AI.status?.models||[]), 'llama3.2', 'qwen2.5:7b', 'mistral', 'gemma2:9b', 'phi3'])).filter(Boolean);

  dock.innerHTML = `
    ${APPX.aiOpen? `<div class="ai-panel">
      <div class="ai-h">
        <div class="av">${ic('sparkles',17)}</div>
        <div>
          <b>${esc(prof.title)} <span class="ai-draft-tag">AI DRAFT</span></b>
          <span>${esc(prof.badge)} · ${esc(roleObj(AUTH.user.roleId)?.name||'')} · scoped &amp; read-only</span>
        </div>
        <button type="button" class="x" data-act="close-ai" aria-label="Close assistant">${ic('x',16)}</button>
      </div>
      <div class="ai-body" id="aiBody">
        <div class="ai-conn-bar">
          <span style="display:inline-flex;align-items:center;gap:6px">
            <span class="pres ${AI.status&&AI.status.online?'online':'recent'}"></span>
            <b>${connLabel}</b>
          </span>
          <span class="row" style="gap:4px">
            <button type="button" class="btn btn-xs btn-ghost" data-act="ai-probe-dock">${AI.busy?'Testing...':'Test Ollama'}</button>
            <button type="button" class="btn btn-xs btn-ghost" data-act="ai-toggle-cfg">${AI.settingsOpen?'Hide config':'Model & URL'}</button>
            ${AI.history.length?`<button type="button" class="btn btn-xs btn-ghost" data-act="ai-clear-chat">Clear</button>`:''}
          </span>
        </div>
        ${AI.settingsOpen ? `<div class="card" style="padding:10px;margin-bottom:10px">
          <div class="xs bold" style="margin-bottom:6px">Online / LAN Ollama &amp; Offline Engine Configuration</div>
          <div class="grid g2" style="gap:6px">
            <div class="field" style="margin:0"><label class="xs">Mode</label>
              <select class="input" id="aiCfgMode" style="padding:5px 8px;font-size:12px">
                <option value="auto" ${cfg.mode!=='offline'?'selected':''}>Auto (Local Ollama + Verified Offline)</option>
                <option value="offline" ${cfg.mode==='offline'?'selected':''}>Offline Verified Engine Only</option>
              </select>
            </div>
            <div class="field" style="margin:0"><label class="xs">Ollama Model</label>
              <select class="input" id="aiCfgModel" style="padding:5px 8px;font-size:12px">
                ${modelChoices.map(m=>`<option value="${esc(m)}" ${cfg.model===m?'selected':''}>${esc(m)}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="field" style="margin:6px 0"><label class="xs">Local / Office Host Ollama URL</label>
            <input class="input" id="aiCfgUrl" value="${esc(cfg.ollama||'http://127.0.0.1:11434')}" placeholder="http://127.0.0.1:11434" style="padding:5px 8px;font-size:12px">
          </div>
          <div class="row" style="justify-content:space-between;gap:6px">
            <span class="xs muted">Local AI connections are separate from the shared CareLink data source.</span>
            <button type="button" class="btn btn-xs btn-primary" data-act="ai-save-cfg">Save &amp; Connect</button>
          </div>
        </div>` : ''}
        <div class="ai-dept-card">
          <b>${esc(prof.badge)} Specialist</b>
          <div>${esc(prof.title)}</div>
          <span>${esc(prof.summary)}</span>
        </div>
        ${AI.history.length? AI.history.map(m=> m.role==='user'
          ? `<div class="ai-msg user">${esc(m.text)}</div>`
          : `<div class="ai-msg bot">${formatAIText(m.text)}${m.evidence?.length?`<div class="ev">${m.evidence.map(e=>`<span class="ev-tag ${e==='Recorded fact'?'fact':e==='Calculated value'?'calc':e==='Observed trend'?'trend':e==='Recommendation'?'rec':e==='Draft content'?'draft':'ai'}">${esc(e)}</span>`).join('')}</div>`:''}
              <div class="ai-draftline">${ic('info',12)}<span>AI DRAFT · ${esc(m.specialist||prof.title)}. Not a clinical decision or approval; verify every figure against records.</span></div></div>`
        ).join('') : `<div class="ai-msg bot ai-welcome">Good ${new Date().getHours()<12?'morning':new Date().getHours()<17?'afternoon':'evening'}, ${esc(AUTH.user.name.replace(/^Demo - /,'').split(' ')[0])}.

Welcome to **${esc(prof.title)}** inside **${esc(countyName(AUTH.user.countyId))}**${(AUTH.user.areaIds||[]).length?' ('+AUTH.user.areaIds.map(areaName).join(', ')+')':''}.

Every statement is strictly scoped to your authorised records and labelled with typed evidence. Tap any prompt below or ask in plain English.</div>`}
      </div>
      <div class="ai-chips">${chipList.map(c=>`<button type="button" class="ai-chip" data-act="ai-chip" data-q="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <div class="ai-in"><input id="aiInput" placeholder="Ask ${esc(prof.badge)} AI..." aria-label="Ask the assistant"><button type="button" data-act="ai-send" aria-label="Send">${ic('chevron',16)}</button></div>
    </div>`:''}
    <button type="button" class="ai-fab" data-act="toggle-ai" aria-label="Open assistant">${ic('sparkles',22)}</button>`;
}
function formatAIText(t){
  return esc(t).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/\n/g,'<br>');
}

/* ---------------- User menu ---------------- */
function userMenu(){
  const u=AUTH.user; const role=roleObj(u.roleId);
  const demoPreviewAllowed = !(typeof PROD_SETUP !== 'undefined' && PROD_SETUP.isGloballyActivated && PROD_SETUP.isGloballyActivated());
  openModal({title:u.name, sub:`${role.name} · ${deptName(u.departmentId)}`, narrow:true, body:`
    <dl class="dl">
      <dt>Username</dt><dd class="mono">${esc(u.username)}</dd>
      <dt>County office</dt><dd>${esc(countyName(u.countyId))}</dd>
      <dt>Ministry areas</dt><dd>${esc((u.areaIds||[]).map(areaName).join(', ')||'-')}</dd>
      <dt>Data scope</dt><dd>${esc((role.scope||{}).records||'-')}</dd>
      <dt>Capabilities</dt><dd>${RBAC.expandedPerms(u.roleId).length} of ${Object.keys(CAPS).length}</dd>
      <dt>Session started</dt><dd>${AUTH.session?fmtDateTime(AUTH.session.started):'-'}</dd>
    </dl>
    <div class="divider"></div>
    ${(demoPreviewAllowed && (u.demo || DB.db?.meta?.demoSeeded || DB.db?.meta?.seeded==='official') && typeof DEMO_SWITCH!=='undefined') ? `
      <div style="margin-bottom:12px">
        <div class="xs muted" style="text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Switch Demo Console (Authorised Role Preview)</div>
        <div class="row" style="gap:6px;flex-wrap:wrap">
          ${['director','chief.admin','intl.data','mcm.kisumu','nurse.kisumu','focal.kisumu','caregiver.nyalenda','finance.kisumu','procurement','media.head']
            .map(un => DB.db.users.find(x=>x.username===un && x.username!==u.username))
            .filter(Boolean)
            .slice(0,8)
            .map(tu => `<button class="btn btn-xs btn-ghost" data-act="prompt-switch-account" data-u="${esc(tu.username)}" data-v="home" data-asset="${esc((roleObj(tu.roleId)?.consoleTitle)||tu.jobTitle||'Console')}">${esc((roleObj(tu.roleId)?.name)||tu.username)}</button>`)
            .join('')}
        </div>
      </div>` : ''}
    <div class="row"><button class="btn btn-sm btn-ghost" data-act="my-profile">${ic('user',14)} My profile</button>
    <button class="btn btn-sm btn-ghost" data-act="change-password">${ic('lock',14)} Change password</button>
    <button class="btn btn-sm btn-danger" data-act="logout">${ic('logout',14)} Sign out</button></div>`,
    footer:`<button class="btn btn-ghost" data-act="close-modal">Close</button>`});
}

/* ---------------- Global search ---------------- */
document.addEventListener('keydown', (e)=>{
  if(e.key==='Escape' && modalStack.length){ closeModal(); return; }
  if(e.key==='Enter' && e.target && e.target.id==='aiInput'){
    e.preventDefault();
    ACTIONS['ai-send']();
  }
});
document.addEventListener('input',(e)=>{
  if(e.target && e.target.dataset && e.target.dataset.filter==='q' && e.target.dataset.view){
    const viewTarget = e.target.dataset.view;
    const val = e.target.value;
    clearTimeout(window.__qT);
    window.__qT = setTimeout(()=>{
      const params = {...APPX.params, q: val};
      delete params.page;
      go(viewTarget, params);
    }, 320);
    return;
  }
  if(!e.target.matches('[data-search]')||!AUTH.user) return;
  const q=e.target.value.trim().toLowerCase();
  if(q.length<2) return;
  const ps=repo.patientList(AUTH.user,{q}).slice(0,5);
  const rs=repo.requests(AUTH.user).filter(r=>r.no.toLowerCase().includes(q)||r.reason.toLowerCase().includes(q)).slice(0,3);
  let panel=$('#searchPanel');
  if(!panel){ panel=document.createElement('div'); panel.id='searchPanel';
    panel.style.cssText='position:fixed;top:70px;left:50%;transform:translateX(-50%);width:min(520px,92vw);z-index:80;background:#fff;border-radius:14px;box-shadow:var(--shadow-lg);border:1px solid var(--line);overflow:hidden';
    document.body.appendChild(panel); }
  panel.innerHTML = `<div style="padding:10px 14px;border-bottom:1px solid var(--line);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted-2)">Search results</div>
    ${ps.length?`<div style="padding:6px">${ps.map(p=>`<button class="nav-item" style="color:var(--ink);background:transparent" data-act="open-patient" data-id="${p.id}">
      ${ic('users',15)}<span style="color:var(--ink)">${esc(p.name)}</span><span class="xs muted" style="margin-left:auto">${esc(p.code)}</span></button>`).join('')}</div>`:''}
    ${rs.length?`<div style="padding:6px;border-top:1px solid var(--line-2)">${rs.map(r=>`<button class="nav-item" style="color:var(--ink);background:transparent" data-act="open-request" data-id="${r.id}">
      ${ic('hospital',15)}<span style="color:var(--ink)">${esc(r.no)}</span><span class="xs muted" style="margin-left:auto">${esc(r.status)}</span></button>`).join('')}</div>`:''}
    ${(!ps.length&&!rs.length)?`<div class="empty" style="padding:26px"><p class="small muted">No results within your authorised records.</p></div>`:''}`;
  panel.onclick=(ev)=>{ const b=ev.target.closest('[data-act]'); if(b){ panel.remove(); e.target.value=''; } };
});
document.addEventListener('click',(e)=>{
  const p=$('#searchPanel');
  if(p && !e.target.closest('#searchPanel') && !e.target.matches('[data-search]')) p.remove();
  document.querySelectorAll('details.cl-util-menu[open]').forEach(det=>{
    if(!det.contains(e.target) || e.target.closest('.cl-util-item')) det.removeAttribute('open');
  });
});

/* ---------------- Later workspaces ----------------
   The handlers for paper forms, pharmacy, care plans, leave and visit
   planning live in office_actions.js so that this file stays a router. They
   are merged here, after both registries exist, and behave exactly as if
   they had been typed above. */
Object.assign(ACTIONS, FORMS_ACTIONS);
Object.assign(FORMS, FORMS_FORMS);
if(typeof registerCountyUrgentActions === 'function') registerCountyUrgentActions();

/* ---------------- Start ---------------- */
PAGER.install();
if(typeof document !== 'undefined' && (document.readyState === 'complete' || document.readyState === 'interactive')){
  setTimeout(boot, 0);
} else {
  window.addEventListener('DOMContentLoaded', boot);
}
