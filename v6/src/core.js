/* ============================================================
   core.js - Storage, authentication, authorisation, audit,
   scoped repository and workflow engine.
   ------------------------------------------------------------
   Design rule: NO view reads the database directly. Every read
   passes through DB.repo, which applies the caller's scope.
   That mirrors the server-side enforcement required by the
   specification: hiding a button is never the control.
   ============================================================ */

/* ---------------- 0. Utilities ---------------- */
const $  = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
const esc = s => String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = p => p+Math.random().toString(36).slice(2,9);
const DAY = 86400000;
const fmtDate = (v, opt={}) => {
  if(!v) return '-';
  const d = new Date(v); if(isNaN(d)) return '-';
  return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',...opt});
};
const fmtDateTime = v => { const d=new Date(v); return isNaN(d)?'-':d.toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}); };
const daysBetween = (a,b=new Date()) => Math.floor((new Date(b) - new Date(a))/DAY);
const todayISO = () => new Date().toISOString();
const dateOnly = v => v? new Date(v).toISOString().slice(0,10):'';
const money = n => (n===null||n===undefined||isNaN(n))?'-':'KES '+(+n).toLocaleString('en-KE',{maximumFractionDigits:0});
const num = n => (+n||0).toLocaleString('en-KE');
const pct = (a,b) => b? Math.round((a/b)*100):0;
const clamp = (n,a,b)=>Math.max(a,Math.min(b,n));
const initials = s => String(s||'?').replace(/^Demo -\s*/,'').split(/\s+/).filter(w=>/[A-Za-z]/.test(w)).slice(0,2).map(w=>w[0]).join('').toUpperCase();
const titleCase = s => String(s||'').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
const areaName = id => { for(const c of COUNTIES){ const a=c.areas.find(x=>x.id===id); if(a) return a.name; } return '-'; };
const areaObj = id => { for(const c of COUNTIES){ const a=c.areas.find(x=>x.id===id); if(a) return a; } return null; };
const countyName = id => (COUNTIES.find(c=>c.id===id)||{}).name || '-';
const deptName = id => (DEPARTMENTS.find(d=>d.id===id)||{}).name || '-';
const deptObj = id => DEPARTMENTS.find(d=>d.id===id);
const roleObj = id => (DB.db?.roles||[]).find(r=>r.id===id) || ROLE(id);
const userById = id => DB.db?.users.find(u=>u.id===id) || null;
const userName = id => userById(id)?.name || '-';
const capLabel = c => (CAPS[c]?.l) || c;
/* True when the signed-in role spans more than one county. */
function isGlobal(user){
  const role = roleObj(user.roleId)||{scope:{}}; const s=role.scope||{};
  return s.geo==='global' || !!s.crossCounty;
}

function fnv1a(str){ let h=0x811c9dc5; for(let i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=Math.imul(h,16777619);} return (h>>>0).toString(16).padStart(8,'0'); }
function strongHash(pw,salt){ let x=fnv1a(salt+':'+pw); for(let i=0;i<900;i++) x=fnv1a(x+':'+salt); return x; }
function newSalt(){ return Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4); }
function uidNum(){ return Math.random().toString(36).slice(2,7).toUpperCase(); }

/* ---------------- 1. Storage adapter ----------------
   The in-app preview runs in a sandboxed iframe where localStorage
   is unavailable. We degrade to an in-memory store and tell the user
   honestly; downloaded/copied files persist normally. */
const Store = (()=>{
  let durable = true, mem = Object.create(null);
  try { const k='__cl_probe__'; localStorage.setItem(k,'1'); localStorage.removeItem(k); }
  catch(e){ durable = false; }
  return {
    durable,
    get(k){ if(durable){ try{ return localStorage.getItem(k); }catch(e){} } return k in mem ? mem[k] : null; },
    set(k,v){ if(durable){ try{ localStorage.setItem(k,v); return true; }catch(e){ durable=false; } } mem[k]=v; return false; },
    del(k){ if(durable){ try{ localStorage.removeItem(k); }catch(e){} } delete mem[k]; },
    bytes(){ try{ return new Blob([JSON.stringify(mem)]).size; }catch(e){ return 0; } }
  };
})();

/* ---------------- 2. Database ---------------- */
const DB = {
  KEY:'lomamo_carelink_dims_v4',
  db:null,

  blank(){
    return {
      meta:{ schema:APP.schema, version:APP.version, created:todayISO(), label:'New installation',
             installationId:'LOM-'+uidNum()+'-'+uidNum() },
      settings:{
        theme:'light', consoleTheme:'foundation', density:'comfortable', accentMode:'department', animations:true, sounds:false,
        idleMinutes:20, mondayReport:{ enabled:true, lastRun:null, manualRuns:0 },
        reportCutoff:'23:59',
        ai:{ enabled:true, provider:'local', ollama:'http://localhost:11434', model:'llama3.1', allowExternal:false },
        backup:{ schedule:'daily', lastBackup:null, lastVerified:null, location:'Local secure volume', destination:'' },
        security:{ mfaRequiredForAdmins:true, passwordMinLength:12, sessionLock:true, loginAttempts:5 },
        onboarding:{ complete:false, step:1 },
        programme:{ defaultDays:75, maxDays:180, reviewCadence:30, maxReviews:12 },
        pdca:{ overdueGraceDays:7, requireExtensionReview:true },
        care:{ capacity:12, handoverHour:19 },
        notifications:{ mondayReport:true, overdueReviews:true, pendingApprovals:true, incidents:true, weeklyDigest:false },
        accessibility:{ reducedMotion:false, highContrast:false },
        landingTheme:'heritage', workspaceTheme:'spectrum',
        sync:{ mode:'auto', live:true, liveMs:500 }
      },
      users:[], roles:[], patients:[], visits:[], pdcas:[], requests:[], transactions:[],
      documents:[], supportIssues:[], encounters:[], concerns:[], referralEntities:[],
      budgets:[], targets:[], employees:[], leaveRequests:[], welfareActs:[], contributions:[],
      vehicles:[], trips:[], kbDocs:[], accountRequests:[], approvals:[], notifications:[],
      reports:[], audit:[], imports:[], backups:[], securityTests:[],
      patientConditions:[], careBeds:[], careResidents:[], careLogs:[], careIncidents:[],
      delegations:[], personalPrefs:{}, drafts:{}, workPlans:[],
      messages:[], publications:[], stakeholders:[], enquiries:[], mediaProjects:[],
      clinicalRx:[], stockLots:[], stockMoves:[], formRecords:[], omahaPlans:[],
      scheduleDrafts:[], leaveCover:[], calendarEvents:[], presence:{},
      /* v6 collections. Missing ones migrate to empty, so an older database
         opens without losing a record. */
      libraryItems:[], borrowRequests:[], credits:{}, rewardEvents:[],
      execMeetings:[], inventoryItems:[], inventoryMoves:[], interns:[],
      ohsIncidents:[], ohsChecks:[], dataElements:[], indicators:[], dqIssues:[],
      devices:[], devicesPending:[], passwordVault:[], mergeJournal:[], weatherCache:{},
      referrals:[]};
  },

  load(){
    const raw = Store.get(this.KEY);
    if(raw){
      try{ this.db = JSON.parse(raw); }catch(e){ this.db = this.blank(); }
    } else {
      this.db = this.blank();
      if(typeof seedOfficial === 'function'){
        seedOfficial(this.db, new Date(), {patients:3333, mustChange:false});
        this.db.meta.freshSeeded = true;
        try{ Store.set(this.KEY, JSON.stringify(this.db)); }catch(e){}
      }
    }
    if(!this.db.meta) this.db.meta = this.blank().meta;
    this.migrate();
    return this.db;
  },
  /* A console that has been in use since an earlier release must not break
     when a new collection or setting appears. Nothing is invented: missing
     collections start empty, missing settings take their default, and the
     records already held are left exactly as they are. */
  migrate(){
    if(!this.db) return;
    const base = this.blank();
    for(const k of Object.keys(base)){
      if(this.db[k]===undefined) this.db[k] = base[k];
      else if(base[k] && typeof base[k]==='object' && !Array.isArray(base[k]) && this.db[k] && typeof this.db[k]==='object'){
        for(const kk of Object.keys(base[k])) if(this.db[k][kk]===undefined) this.db[k][kk] = base[k][kk];
      }
    }
    this.db.meta = this.db.meta || base.meta;
    const was = this.db.meta.schema||0;
    this.db.meta.schema = APP.schema;
    this.db.meta.version = APP.version;
    if(was < APP.schema){
      this.db.meta.migratedAt = new Date().toISOString();
      this.db.meta.migratedFrom = was;
    }
  },
  save(){
    if(!this.db) return;
    this.db.meta.saved = todayISO();
    this.db.meta.localEditedAt = new Date().toISOString();
    Store.set(this.KEY, JSON.stringify(this.db));
    if(typeof APPX!=='undefined') APPX.dirty = true;
    if(AUTH.user) AUTH.touch();
    if(typeof SYNC!=='undefined') SYNC.queue();
  },
  /* Adopt a copy that the host has already accepted. No audit entry is written
     and nothing is queued back to the host: a refresh is a read, not an edit.
     Personal preferences on this device survive, because they belong to the
     person at this screen, not to the central record. */
  adopt(remote){
    if(!remote || !remote.meta) return false;
    this.db = remote;
    this.migrate();
    try{ Store.set(this.KEY, JSON.stringify(this.db)); }catch(e){}
    return true;
  },
  reset(){ this.db = this.blank(); this.save(); },
  seedDemo(){
    const demo = seedDemo(this.db, new Date());
    Object.assign(this.db, {
      users:demo.users, patients:demo.patients, visits:demo.visits, pdcas:demo.pdcas,
      requests:demo.requests, transactions:demo.transactions, documents:demo.documents,
      supportIssues:demo.supportIssues, encounters:demo.encounters, concerns:demo.concerns,
      referralEntities:demo.referralEntities, budgets:demo.budgets, targets:demo.targets,
      employees:demo.employees, leaveRequests:demo.leaveRequests, welfareActs:demo.welfareActs,
      contributions:demo.contributions, vehicles:demo.vehicles, trips:demo.trips, kbDocs:demo.kbDocs,
      patientConditions:demo.patientConditions||[], careBeds:demo.careBeds||[], careResidents:demo.careResidents||[],
      careLogs:demo.careLogs||[], careIncidents:demo.careIncidents||[], delegations:demo.delegations||[],
      workPlans:demo.workPlans||[], messages:[], publications:demo.publications||[], stakeholders:[], enquiries:[],
      mediaProjects:[], clinicalRx:demo.clinicalRx||[], stockLots:demo.stockLots||[],
      stockMoves:demo.stockMoves||[], formRecords:demo.formRecords||[], omahaPlans:demo.omahaPlans||[],
      scheduleDrafts:[], leaveCover:[], calendarEvents:[]
    });
    if(typeof OFFICIAL_ROSTER !== 'undefined'){
      const seen = new Set(this.db.users.map(u=>u.username));
      OFFICIAL_ROSTER.forEach((r, idx)=>{
        if(seen.has(r.username)) return;
        const salt = 'demo6-' + r.username;
        this.db.users.push({
          id:'u-' + r.username.replace(/[.]/g,'-'),
          name:'Demo - ' + r.name, username:r.username, roleId:r.roleId,
          countyId:r.countyId, areaIds:r.areas||[], departmentId:r.dept, jobTitle:r.job,
          reportsTo:'u-chief', status:'active', active:true, mustChange:false, demo:true,
          salt, hash:strongHash('LOMAMO2026', salt),
          email:r.username+'@lomamo.example', phone:'0700'+String(500000+(idx*977)%99999).padStart(6,'0'),
          created:demo.seededAt, execTeam:EXEC_DEFAULT.includes(r.username)
        });
      });
    }
    if(typeof enrichV6Collections === 'function') enrichV6Collections(this.db, new Date());
    this.db.meta.label = 'Demonstration dataset (synthetic)';
    this.db.meta.demoSeeded = demo.seededAt;
    this.db.settings.onboarding.complete = true;
    this.save();
  },
  /* v6: the official programme register (synthetic, labelled, 3,333 rows by
     default). Used for acceptance testing and board demonstrations. */
  seedOfficial(opts={}){
    if(!this.db) this.db = this.blank();
    seedOfficial(this.db, new Date(), opts);
    this.db.settings.onboarding = Object.assign({}, this.db.settings.onboarding, {complete:true, step:9});
    this.db.meta.demoSeeded = new Date().toISOString();
    this.save();
    return this.db.patients.length;
  },
  /* Fast, read-only lookups used by the return-visit checker. */
  byNationalId(id){ return patientsByNationalId(this.db, id); },
  stats(){
    const d=this.db; const count = k => (d[k]||[]).length;
    return {
      records: count('patients')+count('visits')+count('requests')+count('transactions')+count('documents')+count('audit'),
      patients:count('patients'), visits:count('visits'), requests:count('requests'),
      transactions:count('transactions'), documents:count('documents'), audit:count('audit'),
      users:count('users'), reports:count('reports'), bytes:new Blob([JSON.stringify(d)]).size
    };
  }
};

/* ---------------- 3. Audit (append-only, hash-chained) ---------------- */
const AUDIT = {
  append({actor, action, entity, entityId, detail, before, after, reason, meta}){
    if(!DB.db) return null;
    const log = DB.db.audit;
    const prev = log.length? log[log.length-1].hash : 'GENESIS';
    const e = {
      seq: log.length+1, ts: todayISO(), actor: actor||'system', action, entity: entity||'-',
      entityId: entityId||'-', detail: detail||'',
      before: before===undefined?null:before, after: after===undefined?null:after,
      reason: reason||'', meta: meta||{}, prevHash: prev
    };
    e.hash = fnv1a([e.seq,e.ts,e.actor,e.action,e.entity,e.entityId,e.detail,e.prevHash].join('|'));
    log.push(e);
    /* never let the trail grow unbounded in a browser prototype */
    if(log.length>6000) log.splice(0, log.length-6000);
    return e;
  },
  verify(){
    const log = DB.db.audit; let broken=[];
    for(let i=0;i<log.length;i++){
      const e=log[i], prev = i? log[i-1].hash : 'GENESIS';
      const calc = fnv1a([e.seq,e.ts,e.actor,e.action,e.entity,e.entityId,e.detail,e.prevHash].join('|'));
      if(e.prevHash!==prev || e.hash!==calc) broken.push(e.seq);
    }
    return { ok: broken.length===0, entries: log.length, broken };
  },
  deny(user, cap, ctx, reason){
    this.append({ actor:user?.id||'anonymous', action:'access.denied', entity:'permission', entityId:cap,
      detail:`Denied: ${cap}${ctx? ' · '+JSON.stringify(ctx):''}`, reason: reason||'' });
  }
};

/* ---------------- 4. Authentication & session ---------------- */
const AUTH = {
  user:null, session:null, listeners:[],
  login(username, password){
    const u = DB.db.users.find(x=>x.username.toLowerCase()===String(username).toLowerCase().trim());
    if(!u){ AUDIT.append({actor:'anonymous',action:'auth.failed',entity:'user',entityId:username,detail:'Unknown username'}); return {ok:false,msg:'No account matches that username.'}; }
    if(u.status!=='active'){ AUDIT.append({actor:u.id,action:'auth.blocked',entity:'user',entityId:u.id,detail:`Account status: ${u.status}`}); return {ok:false,msg:`This account is ${u.status}. Contact the County Office Administrator.`}; }
    if(u.hash !== strongHash(password, u.salt)){
      u.failedLogins = (u.failedLogins||0)+1;
      AUDIT.append({actor:u.id,action:'auth.failed',entity:'user',entityId:u.id,detail:'Incorrect password'});
      if(u.failedLogins>=DB.db.settings.security.loginAttempts){ u.status='locked'; AUDIT.append({actor:'system',action:'auth.locked',entity:'user',entityId:u.id,detail:'Account locked after repeated failures'}); }
      DB.save();
      return {ok:false,msg:'Incorrect password.'};
    }
    u.failedLogins=0; u.lastLogin=todayISO();
    /* Held in memory only: the host needs it once, to open the server
       session. It is never written to the database or to storage. */
    this._pw = String(password);
    this.user = u;
    this.session = { started:todayISO(), last:Date.now(), token:uidNum()+uidNum() };
    AUDIT.append({actor:u.id,action:'auth.login',entity:'user',entityId:u.id,detail:'Signed in',meta:{role:u.roleId}});
    DB.save(); this.emit();
    return {ok:true,user:u};
  },
  logout(){
    if(this.user) AUDIT.append({actor:this.user.id,action:'auth.logout',entity:'user',entityId:this.user.id,detail:'Signed out'});
    this._pw=null; this.user=null; this.session=null; DB.save(); this.emit();
  },
  touch(){ if(this.session) this.session.last = Date.now(); },
  idleMs(){ return this.session? Date.now()-this.session.last : 0; },
  locked(){ return !!(this.session && DB.db.settings.security.sessionLock && this.session.last && (Date.now()-this.session.last) > DB.db.settings.idleMinutes*60000); },
  unlock(password){
    if(!this.user) return {ok:false,msg:'No session'};
    if(this.user.hash!==strongHash(password,this.user.salt)) return {ok:false,msg:'Incorrect password'};
    this.touch(); AUDIT.append({actor:this.user.id,action:'session.unlock',entity:'user',entityId:this.user.id,detail:'Session resumed'});
    return {ok:true};
  },
  setPassword(pw){
    if(!this.user) return;
    if(pw.length < DB.db.settings.security.passwordMinLength) return {ok:false,msg:`Minimum ${DB.db.settings.security.passwordMinLength} characters.`};
    this.user.salt = newSalt(); this.user.hash = strongHash(pw,this.user.salt); this.user.mustChange=false;
    AUDIT.append({actor:this.user.id,action:'auth.password_changed',entity:'user',entityId:this.user.id,detail:'Password changed by account holder'});
    DB.save(); return {ok:true};
  },
  role(){ return this.user? roleObj(this.user.roleId):null; },

  /* ---- v6: server-verified sign-in ----------------------------------
     The host is the authority. A password is checked there against a PBKDF2
     hash that the browser never receives. On success the user record comes
     back without any secret. If no host answers, the device falls back to a
     verifier it stored locally the last time this person signed in here; that
     is what makes an offline field visit possible without weakening the host. */
  online:false,
  mustChange:false,

  async loginOnline(username, password, device){
    const name = String(username||'').trim();
    if(typeof SYNC === 'undefined' || !SYNC.available()){
      return {ok:false, code:'offline', error:'No network'};
    }
    const r = await SYNC.login(name, password, device);
    if(!r.ok) return r;
    let u = DB.db.users.find(x=>String(x.username).toLowerCase()===name.toLowerCase()) || r.user;
    if(!u){ return {ok:false, code:'no_record', error:'The host accepted the sign-in but this device has no record for that account yet.'}; }
    u.status = 'active';
    u.lastLogin = todayISO();
    this._rememberVerifier(u, password);
    this.user = u; this.online = true; this.mustChange = !!r.mustChange;
    this.session = {started:todayISO(), last:Date.now(), token:'srv', mustChange:this.mustChange};
    AUDIT.append({actor:u.id, action:'auth.login', entity:'user', entityId:u.id,
      detail:'Signed in — password verified on the host computer', meta:{role:u.roleId, mustChange:this.mustChange}});
    DB.save(); this.emit();
    return {ok:true, user:u, mustChange:this.mustChange};
  },

  /* A device-local verifier, held outside the shared document. It lets the same
     account sign in on this device when the host cannot be reached, and it is
     never synchronised to any other device. */
  _rememberVerifier(u, password){
    try{
      const salt = newSalt();
      const all = JSON.parse(localStorage.getItem('carelink.device.verifiers')||'{}');
      all[u.username] = {salt, hash:strongHash(password, salt), at:todayISO()};
      localStorage.setItem('carelink.device.verifiers', JSON.stringify(all));
    }catch(e){}
  },
  _deviceVerifier(username){
    try{
      const all = JSON.parse(localStorage.getItem('carelink.device.verifiers')||'{}');
      return all[username] || null;
    }catch(e){ return null; }
  },

  async changeOnServer(current, next){
    if(!SYNC.sessionToken) return {ok:false, error:'Not connected to the host'};
    const r = await SYNC.changePassword(current, next);
    if(r.ok){
      this.mustChange = false;
      if(this.user) this.user.mustChange = false;
      if(this.session) this.session.mustChange = false;
      this._rememberVerifier(this.user, next);
      AUDIT.append({actor:this.user.id, action:'auth.password_changed', entity:'user', entityId:this.user.id,
        detail:'Password changed and stored on the host computer'});
      DB.save();
    }
    return r;
  },

  role(){ return this.user? roleObj(this.user.roleId):null; },
  emit(){ this.listeners.forEach(f=>f()); }
};

/* ---------------- 5. Role & permission resolution ---------------- */
const RBAC = {
  expandedPerms(roleId){
    const role = roleObj(roleId); if(!role) return [];
    const out = new Set();
    (role.perms||[]).forEach(p=>{
      if(p.endsWith('.*')){ const pre=p.slice(0,-1); Object.keys(CAPS).forEach(c=>{ if(c.startsWith(pre)) out.add(c); }); }
      else out.add(p);
    });
    return [...out];
  },
  permsFor(user){
    if(!user) return new Set();
    const base = this.expandedPerms(user.roleId);
    const ov = user.permOverrides||{grant:[],deny:[]};
    const set = new Set(base);
    (ov.deny||[]).forEach(p=>set.delete(p));
    (ov.grant||[]).forEach(p=>{
      if(p.endsWith('.*')){ const pre=p.slice(0,-1); Object.keys(CAPS).forEach(c=>{ if(c.startsWith(pre)) set.add(c); }); }
      else set.add(p);
    });
    /* Time-boxed delegation. A delegation can only narrow, never widen:
       the grant is intersected with what the delegator still holds. */
    this.activeDelegations(user).forEach(d=>{
      const from = this.expandedPerms(d.fromRoleId||'');
      (d.caps||[]).forEach(c=>{
        if(CAPS[c] && (from.includes(c) || (d.capsAtIssue||[]).includes(c)) && !(ov.deny||[]).includes(c)) set.add(c);
      });
    });
    return set;
  },

  activeDelegations(user){
    if(!user || !DB.db) return [];
    const now = Date.now();
    return (DB.db.delegations||[]).filter(d=>
      d.delegateId===user.id && d.status==='active' &&
      new Date(d.from).getTime() <= now && new Date(d.to).getTime() >= now
    );
  },

  delegationFor(user, cap){
    return this.activeDelegations(user).find(d=>(d.caps||[]).includes(cap)) || null;
  },
  has(user, cap){ return this.permsFor(user).has(cap); },

  /* Central authorisation decision. Returns {ok, reason}. */
  can(user, cap, ctx={}){
    if(!user) return {ok:false, reason:'No authenticated session'};
    if(user.status!=='active') return {ok:false, reason:`Account is ${user.status}`};
    const role = roleObj(user.roleId)||{scope:{}};
    const scope = role.scope||{};
    if(!this.permsFor(user).has(cap)) return {ok:false, reason:`Role "${role.name}" does not hold ${cap}`};

    if(scope.readOnly && !/\.(view|list|report|audit)/.test(cap) && !cap.startsWith('report.'))
      return {ok:false, reason:'Read-only role'};

    const countySplit = scope.geo!=='global' && !scope.crossCounty;
    if(ctx.countyId && countySplit && ctx.countyId!==user.countyId)
      return {ok:false, reason:`Record belongs to ${countyName(ctx.countyId)}; your authority is ${countyName(user.countyId)}`};

    if(ctx.areaId && (scope.records==='areas'||scope.geo==='areas')){
      const allowed = new Set(user.areaIds||[]);
      if(!allowed.has(ctx.areaId))
        return {ok:false, reason:`Record is in ${areaName(ctx.areaId)}; outside your assigned ministry areas`};
    }
    if(ctx.assignedTo && scope.records==='assigned' && ctx.assignedTo!==user.id)
      return {ok:false, reason:'Record is not assigned to you'};

    if(ctx.departmentId && scope.records==='department' && ctx.departmentId!==user.departmentId)
      return {ok:false, reason:'Record is outside your department'};

    /* Mandatory governance rules that no ordinary administration may waive */
    if(cap==='patient.view.clinical' && !this.has(user,'patient.view.clinical'))
      return {ok:false, reason:'Clinical information requires a clinical-authorised role'};
    return {ok:true, reason:'permitted'};
  },

  assert(user, cap, ctx, silent){
    const r = this.can(user,cap,ctx);
    if(!r.ok && !silent) AUDIT.deny(user,cap,ctx,r.reason);
    return r.ok;
  },

  /* Record-level patient visibility */
  patientVisible(user, patient){
    if(!user) return false;
    if(!this.has(user,'patient.list')) return false;
    const role = roleObj(user.roleId)||{scope:{}};
    const scope = role.scope||{};
    if(scope.records==='assigned'){
      return DB.db.requests.some(r=>r.patientId===patient.id && r.assignedTo===user.id);
    }
    if(scope.geo==='global'||scope.crossCounty) return true;
    if(scope.records==='county') return patient.countyId===user.countyId;
    if(scope.records==='areas') return (user.areaIds||[]).includes(patient.areaId);
    return false;
  },
  patientIds(user){ return new Set((DB.db.patients||[]).filter(p=>this.patientVisible(user,p)).map(p=>p.id)); }
};

/* ---------------- 6. Scoped repository (backend equivalent) ---------------- */
const repo = {
  all(entity){ return DB.db[entity]||[]; },

  patientList(user, filter={}){
    if(!RBAC.has(user,'patient.list')){ AUDIT.deny(user,'patient.list',{},'no patient.list'); return []; }
    let rows = DB.db.patients.filter(p=>RBAC.patientVisible(user,p));
    if(filter.countyId) rows=rows.filter(p=>p.countyId===filter.countyId);
    if(filter.areaId) rows=rows.filter(p=>p.areaId===filter.areaId);
    if(filter.status) rows=rows.filter(p=>p.status===filter.status);
    if(filter.caregiverId) rows=rows.filter(p=>p.caregiverId===filter.caregiverId);
    if(filter.q){ const q=filter.q.toLowerCase(); rows=rows.filter(p=>(p.name+p.code+p.ccc).toLowerCase().includes(q)); }
    return rows;
  },
  patient(user,id){
    const p = DB.db.patients.find(x=>x.id===id);
    if(!p) return null;
    if(!RBAC.patientVisible(user,p)){ AUDIT.deny(user,'patient.view',{patientId:id},'patient outside scope'); return null; }
    if(!RBAC.assert(user,'patient.view.basic',{countyId:p.countyId,areaId:p.areaId},true)) return null;
    return p;
  },
  clinicalView(user,p){
    if(!RBAC.can(user,'patient.view.clinical',{countyId:p.countyId,areaId:p.areaId}).ok){ AUDIT.deny(user,'patient.view.clinical',{patientId:p.id},'clinical scope'); return null; }
    return p.clinical;
  },
  visits(user,patientId){
    const p=this.patient(user,patientId); if(!p) return [];
    if(!RBAC.can(user,'visit.view',{countyId:p.countyId,areaId:p.areaId},true).ok && !RBAC.can(user,'patient.view.clinical',{},true).ok) return [];
    return DB.db.visits.filter(v=>v.patientId===patientId).sort((a,b)=>new Date(b.date)-new Date(a.date));
  },
  requests(user){
    if(!RBAC.has(user,'hosp.request.create') && !RBAC.has(user,'hosp.request.review') &&
       !RBAC.has(user,'hosp.request.assign') && !RBAC.has(user,'hosp.visit.record') &&
       !RBAC.has(user,'hosp.receipt.review') && !RBAC.has(user,'hosp.close') && !RBAC.has(user,'patient.list')){
      AUDIT.deny(user,'hosp.request.list',{},'no hospital capability');
      return [];
    }
    let rows = DB.db.requests.slice();
    const role = roleObj(user.roleId)||{scope:{}}; const s=role.scope||{};
    if(s.records==='assigned') rows = rows.filter(r=>r.assignedTo===user.id);
    else if(s.records==='areas') rows = rows.filter(r=>(user.areaIds||[]).includes(r.areaId));
    else if(s.records==='county'||s.geo==='county') rows = rows.filter(r=>r.countyId===user.countyId);
    return rows.sort((a,b)=>new Date(b.submittedAt)-new Date(a.submittedAt));
  },
  transactions(user){
    if(!RBAC.has(user,'finance.view')&&!RBAC.has(user,'finance.reconcile')&&!RBAC.has(user,'audit.view')) { AUDIT.deny(user,'finance.view',{},'no finance capability'); return []; }
    let rows = DB.db.transactions.slice();
    const role = roleObj(user.roleId)||{scope:{}}; const s=role.scope||{};
    if(s.geo!=='global' && !s.crossCounty) rows = rows.filter(t=>t.countyId===user.countyId);
    return rows;
  },
  budget(user,countyId){
    let rows = DB.db.budgets.slice();
    const role = roleObj(user.roleId)||{scope:{}}; const s=role.scope||{};
    if(s.geo!=='global' && !s.crossCounty) rows = rows.filter(b=>b.countyId===user.countyId);
    if(countyId) rows = rows.filter(b=>b.countyId===countyId);
    return rows;
  },
  targets(user){
    if(!RBAC.has(user,'report.targets.manage')&&!RBAC.has(user,'report.patient_figures')&&!RBAC.has(user,'report.patient_days')&&!RBAC.has(user,'report.executive')) return [];
    const global=isGlobal(user);
    return (DB.db.targets||[]).filter(t=>global||t.countyId===user.countyId);
  },
  vehicles(user){
    if(!RBAC.has(user,'vehicle.view')&&!RBAC.has(user,'trip.log')&&!RBAC.has(user,'system.health')) return [];
    const global=isGlobal(user);
    return (DB.db.vehicles||[]).filter(v=>global||v.countyId===user.countyId);
  },
  trips(user){
    if(!RBAC.has(user,'vehicle.view')&&!RBAC.has(user,'trip.log')&&!RBAC.has(user,'system.health')) return [];
    const global=isGlobal(user);
    return (DB.db.trips||[]).filter(t=>global||t.countyId===user.countyId);
  },
  employees(user){
    if(!RBAC.has(user,'hr.view')&&!RBAC.has(user,'welfare.view')){ AUDIT.deny(user,'hr.view',{},'no HR capability'); return []; }
    const role = roleObj(user.roleId)||{scope:{}};
    if((role.scope||{}).records==='department' && user.roleId==='hr') return DB.db.employees;
    return DB.db.employees;
  },
  documents(user){
    if(!RBAC.has(user,'media.view') && !RBAC.has(user,'media.upload') && !RBAC.has(user,'patient.view.clinical')){
      AUDIT.deny(user,'media.view',{},'no media capability'); return [];
    }
    const ids = RBAC.patientIds(user);
    return DB.db.documents.filter(d=>!d.patientId || ids.has(d.patientId));
  },
  auditLog(user){
    if(!RBAC.has(user,'system.audit') && !RBAC.has(user,'audit.view')){ AUDIT.deny(user,'system.audit',{},'no audit capability'); return []; }
    return DB.db.audit.slice().reverse();
  },

  /* generic guarded read used by dashboards */
  patients(user){ return this.patientList(user); },
  stats(user){
    /* Roles without patient.list must not spam the audit trail with denials. */
    if(!RBAC.has(user,'patient.list'))
      return { patients:0, active:0, discharged:0, pipeline:0, visits:0, requests:0, openConcerns:0, restricted:true };
    const ps = this.patientList(user);
    const ids = new Set(ps.map(p=>p.id));
    return {
      patients: ps.length,
      active: ps.filter(p=>['active','extension'].includes(p.status)).length,
      discharged: ps.filter(p=>p.status==='discharged').length,
      pipeline: ps.filter(p=>['digital_entered','awaiting_verification','returned','approved_enrolment'].includes(p.status)).length,
      visits: DB.db.visits.filter(v=>ids.has(v.patientId)).length,
      requests: this.requests(user).length,
      openConcerns: DB.db.concerns.filter(c=>ids.has(c.patientId)&&c.status==='open').length
    };
  }
};

/* ---------------- 7. Workflow engine ---------------- */
const WORKFLOW = {
  patient: {
    label:'Patient enrolment',
    states:['assessment_initiated','form_submitted','digital_entered','awaiting_verification','approved_enrolment','active','discharge_recommended','discharged','returned','rejected'],
    labels:{ assessment_initiated:'Assessment initiated', form_submitted:'Physical form submitted', digital_entered:'Digital record entered',
      awaiting_verification:'Awaiting verification', approved_enrolment:'Approved for enrolment', active:'Enrolled · active',
      discharge_recommended:'Discharge recommended', discharged:'Discharged', returned:'Returned for correction', rejected:'Rejected' },
    badge:{ assessment_initiated:'b-neutral', form_submitted:'b-info', digital_entered:'b-info', awaiting_verification:'b-warn',
      approved_enrolment:'b-accent', active:'b-ok', discharge_recommended:'b-warn', discharged:'b-neutral', returned:'b-crit', rejected:'b-crit' },
    transitions:[
      { a:'submit_form',    from:['assessment_initiated'], to:'form_submitted',        cap:'patient.assess.create', label:'Submit physical form' },
      { a:'resubmit',       from:['returned'],              to:'form_submitted',     cap:'patient.assess.create', label:'Resubmit corrected form' },
      { a:'digitise',       from:['form_submitted','returned'], to:'digital_entered',  cap:'patient.digitise',      label:'Digitise form' },
      { a:'request_verify', from:['digital_entered'],      to:'awaiting_verification', cap:'patient.digitise',      label:'Submit for verification' },
      { a:'verify',         from:['awaiting_verification'],to:'approved_enrolment',    cap:'patient.verify',        label:'Verify record' },
      { a:'return',         from:['awaiting_verification','digital_entered'], to:'returned', cap:'patient.return', label:'Return for correction', needsReason:true },
      { a:'reject',         from:['awaiting_verification'],to:'rejected',              cap:'patient.enrol',         label:'Reject', needsReason:true },
      { a:'enrol',          from:['approved_enrolment'],   to:'active',                cap:'patient.enrol',         label:'Enrol patient' },
      { a:'recommend_discharge', from:['active','extension'], to:'discharge_recommended', cap:'patient.discharge.recommend', label:'Recommend discharge', needsReason:true },
      { a:'approve_discharge',   from:['discharge_recommended'], to:'discharged',     cap:'patient.discharge.approve',  label:'Approve discharge', needsEvidence:true, guard:'dischargeGuard' },
      { a:'decline_discharge',   from:['discharge_recommended'], to:'active',         cap:'patient.discharge.approve',  label:'Decline discharge', needsReason:true }
    ]
  },
  request: {
    label:'Hospital request',
    states:['draft','submitted','returned','rejected','approved','assigned','completed','reconciled','closed'],
    labels:{ draft:'Draft', submitted:'Submitted - awaiting clinical review', returned:'Returned for correction', rejected:'Rejected',
      approved:'Approved - awaiting assignment', assigned:'Assigned to focal person', completed:'Service completed - evidence pending',
      reconciled:'Reconciled', closed:'Closed' },
    badge:{ draft:'b-neutral', submitted:'b-info', returned:'b-crit', rejected:'b-crit', approved:'b-accent',
      assigned:'b-info', completed:'b-warn', reconciled:'b-ok', closed:'b-neutral' },
    transitions:[
      { a:'submit',  from:['draft','returned'], to:'submitted', cap:'hosp.request.create', label:'Submit request' },
      { a:'approve', from:['submitted'], to:'approved', cap:'hosp.request.review', label:'Approve' },
      { a:'return',  from:['submitted'], to:'returned', cap:'hosp.request.review', label:'Return for correction', needsReason:true },
      { a:'reject',  from:['submitted'], to:'rejected', cap:'hosp.request.review', label:'Reject', needsReason:true },
      { a:'assign',  from:['approved'],  to:'assigned', cap:'hosp.request.assign', label:'Assign focal person', needsAssignee:true },
      { a:'serve',   from:['assigned'],  to:'completed',cap:'hosp.visit.record', label:'Record hospital service' },
      { a:'reconcile', from:['completed'], to:'reconciled', cap:'hosp.receipt.review', label:'Reconcile expenses' },
      { a:'close',   from:['reconciled'], to:'closed', cap:'hosp.close', label:'Close case', guard:'closureGuard' }
    ]
  },
  account: {
    label:'Account request',
    states:['draft','submitted','under_review','approved','rejected','active','suspended','deactivated'],
    labels:{ draft:'Draft', submitted:'Submitted', under_review:'Under review', approved:'Approved - activation pending',
      rejected:'Rejected', active:'Active', suspended:'Suspended', deactivated:'Deactivated' },
    badge:{ draft:'b-neutral', submitted:'b-info', under_review:'b-warn', approved:'b-accent', rejected:'b-crit', active:'b-ok', suspended:'b-warn', deactivated:'b-neutral' }
  },
  next(cfg, state){ return cfg.transitions.filter(t=>t.from.includes(state)); }
};

/* Apply a transition with capability + guard checks */
function transition(kind, id, action, user, payload={}){
  const cfg = WORKFLOW[kind];
  const coll = kind==='patient'?'patients': kind==='request'?'requests':'accountRequests';
  const rec = DB.db[coll].find(r=>r.id===id);
  if(!rec) return {ok:false,msg:'Record not found'};
  const t = cfg.transitions.find(x=>x.a===action);
  if(!t) return {ok:false,msg:'Unknown action'};
  if(!t.from.includes(rec.status)) return {ok:false,msg:`Action "${t.label}" is not valid from state ${cfg.labels[rec.status]}`};
  const ctx = { countyId:rec.countyId, areaId:rec.areaId, assignedTo:rec.assignedTo };
  if(!RBAC.assert(user, t.cap, ctx)) return {ok:false,msg:'You are not authorised for this action'};
  if(t.needsReason && !(payload.reason||'').trim()) return {ok:false,msg:'A documented reason is required'};
  if(t.needsEvidence && !payload.evidence) return {ok:false,msg:'Supporting evidence is required before approval'};
  if(t.guard && guardFns[t.guard] && !guardFns[t.guard](rec,payload)) return {ok:false,msg:(guardFns[t.guard].message||'Closure requirements are not met (evidence, report or reconciliation outstanding)')};
  if(kind==='patient' && action==='enrol'){
    if(!payload.expectedDays || !payload.rationale || !payload.needs)
      return {ok:false,msg:'Enrolment needs an initial care plan: identified need, expected duration and the reason for that estimate.'};
  }

  const before = rec.status;
  rec.status = t.to;
  rec.updated = todayISO();

  if(kind==='patient'){
    if(action==='enrol'){
      rec.enrolDate = rec.enrolDate||todayISO(); rec.intake = rec.intake||todayISO();
      rec.carePlan = {
        needs: payload.needs, objectives: payload.objectives||'To be agreed with the patient at the next review',
        interventions: payload.interventions||'To be agreed at the next review', responsible: payload.responsible||rec.caregiverId,
        expectedDays: +payload.expectedDays, rationale: payload.rationale,
        reviewDate: new Date(Date.now()+30*86400000).toISOString(),
        version: 1, createdBy: user.id, createdAt: todayISO(), approvedBy: user.id, approvedAt: todayISO()
      };
    }
    if(action==='approve_discharge'){ rec.discharge = todayISO(); rec.dischargeEvidence = payload.evidence; }
    if(action==='recommend_discharge'){ rec.dischargeRecommendation = { by:user.id, at:todayISO(), reason:payload.reason, evidence:payload.evidence||'' }; }
    if(action==='verify'){ rec.verifiedBy=user.id; rec.verifiedAt=todayISO(); rec.docsVerified=true; }
    if(action==='reject'){ rec.rejectReason=payload.reason; }
    if(action==='return'){ rec.returnReason=payload.reason; rec.returnedAt=todayISO(); }
    if(action==='resubmit'){ rec.resubmittedAt=todayISO(); rec.resubmitNote=payload.reason||''; }
  }
  if(kind==='request'){
    if(action==='approve'){ rec.decision={by:user.id,at:todayISO(),note:payload.note||'Approved'}; }
    if(action==='return'||action==='reject'){ rec.decision={by:user.id,at:todayISO(),reason:payload.reason}; }
    if(action==='assign'){ rec.assignedTo=payload.assignee; rec.assignedAt=todayISO(); }
    if(action==='serve'){ rec.serviceCompletedAt=todayISO(); rec.clinicalReport=payload.report||rec.clinicalReport; rec.expenses=payload.expenses||rec.expenses; }
    if(action==='reconcile'){ rec.reconciledBy=user.id; rec.reconciledAt=todayISO(); }
  }

  AUDIT.append({ actor:user.id, action:`${kind}.${action}`, entity:kind, entityId:id,
    detail:`${cfg.label}: ${cfg.labels[before]} → ${cfg.labels[t.to]}`,
    before, after:t.to, reason:payload.reason||payload.note||'' });

  notify(kind==='patient'? rec.caregiverId : (kind==='request'? rec.requestedBy : rec.requestedBy),
    `${cfg.label} update`, `#${rec.code||rec.no||rec.id} - ${cfg.labels[t.to]}`, 'info');

  DB.save();
  return {ok:true, rec, msg:`${t.label}: ${cfg.labels[t.to]}`};
}

const guardFns = {
  closureGuard(rec){
    if(!rec.clinicalReport) return false;
    const unsettled = (DB.db.transactions||[]).filter(t=>t.requestId===rec.id && t.status!=='reconciled');
    return unsettled.length===0;
  },
  /* A patient may not be discharged merely because a duration has elapsed,
     and an extended case needs its review recorded first. */
  dischargeGuard(rec){
    if(rec.status==='discharged') return true;
    const plan = rec.carePlan;
    if(!plan || !plan.expectedDays) return true;
    if(typeof PDCAX!=='undefined' && PDCAX.extensionRequired && PDCAX.extensionRequired(rec)){
      guardFns.dischargeGuard.message = 'This is an extended case: record the extension review before discharge.';
      return false;
    }
    return true;
  }
};

/* ---------------- 8. Notifications & dual approval ---------------- */
function notify(userId, title, body, kind='info', link){
  if(!userId) return;
  DB.db.notifications.unshift({ id:uid('n'), userId, title, body, kind, link, read:false, at:todayISO() });
  if(DB.db.notifications.length>400) DB.db.notifications.length=400;
}

const APPROVALS = {
  /* Who may countersign which operation. The requester holds the operational
     capability; the second signature comes from the governance role. */
  approverCaps:{
    'database restore':['system.restore','policy.manage'],
    'full database export':['system.export','policy.manage'],
    'patient data export':['patient.export','policy.manage']
  },
  canApprove(user, type){
    const caps = this.approverCaps[type] || [];
    return caps.some(c=>RBAC.has(user,c));
  },
  request(type, user, context){
    /* Dual control = the initiator's signature plus one independent authorised
       authoriser. Both names appear on the record; neither can sign twice. */
    const a = { id:uid('ap'), type, requestedBy:user.id, requestedAt:todayISO(), context:context||{},
      required:2, approvals:[{userId:user.id, at:todayISO(), role:'initiator'}], status:'pending' };
    DB.db.approvals.unshift(a);
    AUDIT.append({actor:user.id,action:'approval.requested',entity:'approval',entityId:a.id,detail:`Dual approval requested: ${type}`});
    DB.save(); return a;
  },
  approve(id, user){
    const a = DB.db.approvals.find(x=>x.id===id); if(!a) return {ok:false,msg:'Not found'};
    if(a.requestedBy===user.id) return {ok:false,msg:'The requester cannot approve their own request'};
    if(!this.canApprove(user, a.type)){
      AUDIT.append({actor:user.id,action:'access.denied',entity:'approval',entityId:a.id,
        detail:`Attempted to countersign "${a.type}" without authority`,reason:'missing approver capability'});
      return {ok:false,msg:'Your role is not an authorised approver for this operation'};
    }
    if(a.approvals.some(x=>x.userId===user.id)) return {ok:false,msg:'You have already approved this request'};
    a.approvals.push({userId:user.id, at:todayISO()});
    if(a.approvals.length>=a.required) a.status='approved';
    AUDIT.append({actor:user.id,action:'approval.granted',entity:'approval',entityId:a.id,detail:`${a.type} (${a.approvals.length}/${a.required})`});
    DB.save(); return {ok:true, a};
  },
  canExecute(a){ return a && a.status==='approved' && a.approvals.length>=a.required; }
};

/* ---------------- 9. Governance rules (non-overridable) ---------------- */
const GOV = {
  MANDATORY:[
    { id:'g1', rule:'Passwords are stored only as salted one-way hashes and are never displayed to any account, including the Chief System Administrator.' },
    { id:'g2', rule:'The audit trail is append-only and hash-chained; no role may edit or delete an entry.' },
    { id:'g3', rule:'A patient photograph or story cannot be published without a recorded, scoped consent that has not been withdrawn.' },
    { id:'g4', rule:'Full-database export and database restoration require dual approval and are always audited.' },
    { id:'g5', rule:'Clinical records require a clinical-authorised role; administrative seniority does not confer it.' },
    { id:'g6', rule:'Cross-county and cross-ministry-area access is denied by default at the data layer.' },
    { id:'g7', rule:'Sensitive patient data is never transmitted to an external AI service unless an explicit, documented organisational authorisation is in force.' },
    { id:'g8', rule:'Public and donor-facing reports are generated redacted: no names, phone numbers, CCC numbers, IDs or unapproved photographs.' }
  ],
  /* Consent is per purpose, not one switch. A person may agree to be
     photographed for a clinic noticeboard and refuse a public story. */
  PURPOSES:[
    { id:'care',        l:'Care and treatment',        note:'The clinical record itself. Withdrawing it ends the care relationship and is handled by the Medical Case Manager.' },
    { id:'internal',    l:'Internal reporting',        note:'Counts, caseloads and internal management reports.' },
    { id:'photography', l:'Photographs and video',     note:'Images of the person or their household, held in the media library.' },
    { id:'storytelling',l:'Public storytelling',       note:'A named or recognisable story, including on the Foundation website or social media.' },
    { id:'donor',       l:'Donor reporting',           note:'Aggregate or approved narrative use in donor proposals and reports.' },
    { id:'research',    l:'Research and learning',     note:'De-identified use for programme learning and external research.' }
  ],
  /* Older records stored a single scope. Map it forward without losing it. */
  purposesOf(p){
    const c = p?.consent||{};
    if(c.purposes) return {...c.purposes};
    const scope = c.scope;
    return { care:true, internal:true, photography:scope!=='internal', storytelling:scope==='storytelling', donor:scope==='donor_report'||scope==='storytelling', research:false };
  },
  consentFor(p, purpose){
    if(!p) return {ok:false, reason:'No patient linked to this material'};
    const c = p.consent||{};
    if(c.status!=='granted') return {ok:false, reason:'Consent is '+titleCase(c.status||'not recorded')};
    const purposes = this.purposesOf(p);
    if(!purposes[purpose]) return {ok:false, reason:'Consent does not cover '+titleCase(purpose)};
    if(c.withdrawnAt && c.withdrawnPurposes?.includes(purpose)) return {ok:false, reason:'This purpose was withdrawn on '+fmtDate(c.withdrawnAt)};
    return {ok:true};
  },
  withdraw(p, purpose, reason, user){
    const c = p.consent = p.consent||{};
    c.purposes = this.purposesOf(p);
    c.purposes[purpose] = false;
    c.withdrawnAt = todayISO();
    c.withdrawnPurposes = [...new Set([...(c.withdrawnPurposes||[]), purpose])];
    c.withdrawnReason = reason;
    c.history = [...(c.history||[]), {at:todayISO(), by:user.id, action:'withdrawn', purpose, reason}];
    const any = ['internal','photography','storytelling','donor','research'].some(k=>c.purposes[k]);
    if(!c.purposes.care && !any) c.status='withdrawn';
    AUDIT.append({actor:user.id,action:'consent.withdrawn',entity:'patient',entityId:p.id,
      detail:`${titleCase(purpose)} consent withdrawn: ${reason}`});
    /* Anything published or awaiting publication on that purpose is pulled. */
    if(purpose==='storytelling'||purpose==='photography'){
      DB.db.documents.filter(d=>d.patientId===p.id && d.publication==='approved').forEach(d=>{
        d.publication='withdrawn'; d.publicationWithdrawnAt=todayISO(); d.publicationWithdrawnReason=reason;
        AUDIT.append({actor:user.id,action:'media.withdrawn',entity:'document',entityId:d.id,
          detail:'Publication withdrawn because consent was withdrawn'});
      });
    }
    return c;
  },
  canPublish(doc){
    const p = doc.patientId? DB.db.patients.find(x=>x.id===doc.patientId):null;
    if(!p) return {ok:false, reason:'No patient linked'};
    if(doc.classification==='story_material'){
      const g = this.consentFor(p,'storytelling');
      if(!g.ok) return g;
      if(!doc.consentVerifiedBy) return {ok:false, reason:'The consent form for this asset has not been verified by the Media & Information Governance Head'};
      return {ok:true};
    }
    return this.consentFor(p,'internal');
  }
};

/* ---------------- 9b. Internal messaging guard ---------------- */
const MESSAGING = {
  ABUSIVE: /\b(kill you|beat you|stupid idiot|worthless)\b/i,
  /* Deliberately narrow: only unmistakable identifiers are refused, so a
     normal coordination message is never blocked by accident. */
  screen(text, user){
    const t = String(text||'');
    if(/LOM-[A-Z]{3}-\d{4}/.test(t))
      return { blocked:true, reason:'That looks like a patient code. Record the detail in the patient record and send a link-free note here.' };
    if(/CCC\s*\/?\s*\d{3,}/i.test(t))
      return { blocked:true, reason:'That looks like a clinic number. Patient identifiers must not travel through chat.' };
    if(/(?:\+254|\b254|\b0)[17]\d{8}\b/.test(t))
      return { blocked:true, reason:'That looks like a phone number. Contact details belong in the patient record.' };
    const scope = (DB.db?.patients||[]);
    const named = scope.find(p=>p.name && p.name.length>6 && t.toLowerCase().includes(p.name.toLowerCase()));
    if(named)
      return { blocked:true, reason:'That contains a patient name. Use the patient record so the message is governed by clinical access rules.' };
    return { blocked:false, abusive:this.ABUSIVE.test(t) };
  },
  /* Who a person may write to: global roles reach everyone, everyone else their own county. */
  inReach(user, other){
    return !!(user && other && other.id!==user.id && other.status==='active' &&
      (roleObj(user.roleId)?.scope?.geo==='global' || other.countyId===user.countyId));
  },
  /* The recipients of a thread are worked out here, never taken from the caller.
     Returns {ok, to, kind} or {ok:false, error}. */
  route(user, thread){
    const t = String(thread||'');
    if(t.startsWith('dm:')){
      const ids = t.slice(3).split(':');
      if(ids.length!==2 || ids[0]===ids[1] || !ids.includes(user.id)) return { ok:false, error:'You are not a party to that conversation.' };
      const other = (DB.db.users||[]).find(u=>u.id===ids.find(i=>i!==user.id));
      if(!MESSAGING.inReach(user, other)) return { ok:false, error:'That person is not within your reach.' };
      return { ok:true, kind:'direct', to:[other.id] };
    }
    if(t.startsWith('dept:')){
      const d = t.slice(5);
      if(!(typeof DEPARTMENTS!=='undefined' && DEPARTMENTS.some(x=>x.id===d))) return { ok:false, error:'That department does not exist.' };
      const to = (DB.db.users||[]).filter(u=>u.departmentId===d && MESSAGING.inReach(user,u)).map(u=>u.id);
      if(!to.length) return { ok:false, error:'No one in your reach belongs to that department.' };
      return { ok:true, kind:'dept', to };
    }
    return { ok:false, error:'That is not a valid conversation.' };
  },
  /* Sends a message. Returns the stored message, or {error} when it is refused.
     The screen, the capability and the recipients are all enforced here. */
  send(user, {thread, text}){
    const cap = user? RBAC.can(user,'message.use') : { ok:false };
    if(!cap.ok) return { error:'Your role may not send messages.' };
    const body = String(text||'').trim();
    if(!body) return { error:'Nothing to send.' };
    const check = this.screen(body, user);
    if(check.blocked) return { error:check.reason, blocked:true };
    const r = MESSAGING.route(user, thread);
    if(!r.ok) return { error:r.error };
    DB.db.messages = DB.db.messages||[];
    const m = { id:uid('msg'), thread, kind:r.kind, from:user.id, to:r.to,
      text:body.slice(0,2000), at:new Date().toISOString(), readBy:[user.id], flagged:!!check.abusive,
      flagReason: check.abusive? 'Potentially abusive language detected locally' : '' };
    DB.db.messages.push(m);
    AUDIT.append({actor:user.id,action:'message.sent',entity:'message',entityId:m.id,
      detail:`${r.kind==='dept'?'Department':'Direct'} message · ${m.to.length} recipient(s)${m.flagged?' · flagged for review':''}`});
    m.to.forEach(id=>{ notify(id,'New message', body.slice(0,80),'info'); });
    DB.save();
    return m;
  },
  /* Marks what this person has now seen. Saves only when something changed. */
  markRead(user, thread){
    let changed = false;
    (DB.db.messages||[]).filter(m=>m.thread===thread && (m.to||[]).includes(user.id) && !(m.readBy||[]).includes(user.id)).forEach(m=>{
      m.readBy=[...(m.readBy||[]), user.id]; changed = true;
    });
    if(changed) DB.save();
    return changed;
  },
  unreadCount(user){
    return (DB.db.messages||[]).filter(m=>(m.to||[]).includes(user.id) && m.from!==user.id && !(m.readBy||[]).includes(user.id)).length;
  }
};

/* ---------------- 10. Security self-test ----------------
   Exercises the authorisation matrix from the outside, the way an
   attacker or curious user would. Results feed the Audit console. */
function runSecuritySelfTest(user){
  const tests=[];
  /* A control whose fixture is absent is reported as skipped, not as a failure:
     an installation with no demonstration data must not appear insecure. */
  const T=(name, fn, expect, fixture)=>{ let pass=false, note='', skipped=false;
    if(fixture===null){ skipped=true; }
    else { try{ pass = fn()===expect; }catch(e){ note=e.message; } }
    tests.push({name, pass, expect, note, skipped}); };

  const ksmFin = DB.db.users.find(u=>u.username==='finance.kisumu');
  const hbyFin = DB.db.users.find(u=>u.username==='finance.homabay');
  const cg = DB.db.users.find(u=>u.username==='caregiver.nyalenda');
  const chief = DB.db.users.find(u=>u.username==='chief.admin');
  const auditor = DB.db.users.find(u=>u.username==='auditor');
  const liaison = DB.db.users.find(u=>u.username==='liaison.kisumu');
  const hbyPatient = DB.db.patients.find(p=>p.countyId==='homabay');
  const ksmPatient = DB.db.patients.find(p=>p.countyId==='kisumu');
  const ombeyiPatient = DB.db.patients.find(p=>p.areaId==='ombeyi'&&p.countyId==='kisumu');
  const nyalPatient = DB.db.patients.find(p=>p.areaId==='nyalenda'&&p.countyId==='kisumu');

  T('Kisumu finance cannot read Homa Bay transactions',
    ()=> repo.transactions(ksmFin).some(t=>t.countyId==='homabay'), false, ksmFin);
  T('Homa Bay finance cannot read Kisumu transactions',
    ()=> repo.transactions(hbyFin).some(t=>t.countyId==='kisumu'), false, hbyFin);
  T('Nyalenda caregiver cannot open a Homa Bay patient',
    ()=> !!repo.patient(cg, hbyPatient.id), false, (cg&&hbyPatient)?true:null);
  T('Nyalenda caregiver cannot open a patient in another Kisumu area',
    ()=> !!repo.patient(cg, ombeyiPatient.id), false, (cg&&ombeyiPatient)?true:null);
  T('Caregiver cannot approve clinical requests',
    ()=> RBAC.can(cg,'hosp.request.review').ok, false, cg);
  T('Caregiver cannot publish media',
    ()=> RBAC.can(cg,'media.publish').ok, false, cg);
  T('Caregiver cannot read finance records',
    ()=> RBAC.can(cg,'finance.view').ok, false, cg);
  T('Caregiver cannot export patient data',
    ()=> RBAC.can(cg,'patient.export').ok, false, cg);
  T('Chief System Administrator cannot read clinical detail by default',
    ()=> RBAC.can(chief,'patient.view.clinical').ok, false, chief);
  T('Auditor cannot edit patient records',
    ()=> RBAC.can(auditor,'patient.edit').ok, false, auditor);
  T('Hospital focal person cannot approve their own assignments',
    ()=> RBAC.can(liaison,'hosp.request.review').ok, false, liaison);
  T('Nyalenda caregiver can open a Nyalenda patient',
    ()=> !!repo.patient(cg, nyalPatient.id), true, (cg&&nyalPatient)?true:null);
  T('Restore requires two independent approvals',
    ()=> APPROVALS.canExecute({status:'approved',approvals:[{userId:'x'}],required:2}), false);

  /* ---- Authority rules (v6.1): level, domain and department ----
     The same thirteen rules that *Assurance -> Access & authority audit* proves
     are proved here, so a regression in the authority binding fails the standard
     security self-test and cannot ship quietly. `ACCESS` lives in
     access_rules.js, which loads after this file, hence the guard. */
  if(typeof ACCESS!=='undefined' && ACCESS.selfTest){
    const me = DB.db.users.find(u=>u.roleId==='me');
    const ca = DB.db.users.find(u=>u.username==='kisumu.admin');
    const dir = DB.db.users.find(u=>u.username==='director');
    const co = DB.db.users.find(u=>u.username==='coord.nyalenda');
    const fin = DB.db.users.find(u=>u.username==='finance.kisumu');
    T('M&E / Data Officer cannot set a county target',
      ()=> RBAC.can(me,'report.targets.manage',{level:'county',countyId:'kisumu'}).ok, false, me);
    T('M&E / Data Officer cannot set a national target',
      ()=> RBAC.can(me,'report.targets.manage',{level:'national'}).ok, false, me);
    T('M&E / Data Officer can read targets in scope',
      ()=> RBAC.can(me,'report.targets.view',{}).ok, true, me);
    T('County Office Administrator can set a county target',
      ()=> RBAC.can(ca,'report.targets.manage',{level:'county',countyId:'kisumu'}).ok, true, ca);
    T('County Office Administrator cannot set a national target',
      ()=> RBAC.can(ca,'report.targets.manage',{level:'national'}).ok, false, ca);
    T('Only national authority sets a national target',
      ()=> RBAC.can(dir,'report.targets.national',{}).ok, true, dir);
    T('A coordinator cannot propose a target for another ministry area',
      ()=> RBAC.can(co,'report.targets.area',{areaId:'makongeni'}).ok, false, co);
    T('A caregiver sees the cost of the patients they serve',
      ()=> RBAC.can(cg,'cost.view',{}).ok, true, cg);
    T('A caregiver cannot read the raw cost ledger',
      ()=> RBAC.can(cg,'cost.ledger',{}).ok, false, cg);
    T('Finance cannot set a national cost standard',
      ()=> RBAC.can(fin,'cost.standard.national',{}).ok, false, fin);
    T('A caregiver cannot answer a TB drug request',
      ()=> RBAC.can(cg,'tb.request.review',{}).ok, false, cg);
    T('A caregiver may request pyridoxine for a TB patient',
      ()=> RBAC.can(cg,'tb.request.create',{}).ok, true, cg);
    T('Chief System Administrator cannot set programme targets',
      ()=> RBAC.can(chief,'report.targets.county',{countyId:'kisumu'}).ok, false, chief);
  }

  const skipped = tests.filter(t=>t.skipped).length;
  const passed = tests.filter(t=>t.pass).length;
  const total = tests.length;
  const result = { id:uid('st'), at:todayISO(), by:user.id, tests, passed, skipped, total };
  DB.db.securityTests.unshift(result); DB.db.securityTests.length=Math.min(DB.db.securityTests.length,10);
  AUDIT.append({actor:user.id,action:'security.selftest',entity:'system',entityId:result.id,
    detail:`Authorisation self-test: ${passed}/${total - skipped} passed, ${skipped} skipped (fixtures absent)`});
  DB.save();
  return result;
}
