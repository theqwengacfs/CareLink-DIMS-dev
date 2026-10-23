/* ============================================================
   sync.js - Central database client
   The host computer, running server.py, is the authoritative store.
   Every other device on the Wi-Fi reads from it and writes to it.
   When no server answers, the application keeps working against
   this browser's own copy and says so plainly. Nothing is ever
   overwritten silently: a stale save is refused and the person
   chooses what happens next.
   ============================================================ */

const SYNC = {
  /* idle | probing | connected | device | saving | conflict | error */
  state:'idle',
  rev:0,
  saved:null,
  baseRev:null,
  message:'',
  latency:null,
  conflict:null,
  _timer:null,
  _inflight:false,
  _retry:0,

  available(){
    try{
      return typeof fetch==='function' && typeof location!=='undefined'
        && /^https?:$/.test(location.protocol);
    }catch(e){ return false; }
  },

  sessionToken:null,

  async _json(url, opts={}){
    const t0 = performance.now();
    const headers = {...(opts.headers||{})};
    if(this.sessionToken) headers['X-CareLink-Session'] = this.sessionToken;
    const r = await fetch(url, {cache:'no-store', ...opts, headers});
    this.latency = Math.round(performance.now()-t0);
    const body = await r.json().catch(()=> ({}));
    if(r.status===401){
      this.sessionToken=null;
      this.state='device';
      this.message='Session ended - sign in again to reach the central database';
      this.bump();
      if(typeof SESSION!=='undefined') SESSION.serverExpired();
    }
    return {status:r.status, ok:r.ok, body};
  },

  /* A server session is opened when a person signs in, and closed when they
     sign out. It is what makes the 60-second rule enforceable away from the
     browser: an expired token is refused by the host, not merely hidden by
     the interface. */
  async openSession(password){
    if(!this.available()) return false;
    const pw = password !== undefined? password : (AUTH._pw||null);
    try{
      const r = await this._json('api/session/start', {method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({user: AUTH.user?.username||'', password: pw || undefined,
          device: String(navigator.userAgent||'').slice(0,80)})});
      if(r.ok && r.body.token){
        this.sessionToken = r.body.token; AUTH._pw = null; this.verified = !!r.body.verified;
        if(r.body.mustChange) this.mustChange = true;
        /* A token that was missing at boot meant the first state fetch was
           refused. Now that the host knows who this is, join the central copy
           straight away instead of waiting for the first save to fail. */
        if(this.state==='error' || this.state==='device' || this.state==='auth') setTimeout(()=>this.start(), 50);
        return true;
      }
      if(r.status===401 && (r.body.code==='password_required'||r.body.code==='bad_password')){
        this.state='auth'; this.message = r.body.error || 'The host needs the account password.';
        this.authError = r.body.code==='bad_password'; this.bump();
      }
      if(r.status===429){ this.state='auth'; this.message='Too many attempts. Wait a few minutes, then try again.'; this.bump(); }
    }catch(e){}
    return false;
  },

  /* A session that expired while the tablet sat idle needs the password once
     more. It is asked for on the spot and never stored. */
  async reauth(password){
    const ok = await this.openSession(password);
    if(ok){ this.state='connected'; this.bump(); await this.start(); }
    return ok;
  },
  async beat(active){
    if(!this.sessionToken) return null;
    try{
      const r = await this._json('api/session/beat', {method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({active: !!active})});
      return r.ok? r.body.expiresIn : null;
    }catch(e){ return null; }
  },
  async closeSession(){
    if(!this.sessionToken) return;
    try{ await this._json('api/session/end', {method:'POST', headers:{'Content-Type':'application/json'}, body:'{}'}); }catch(e){}
    this.sessionToken=null;
  },

  /* Called once, after the first render. */
  async start(){
    if(!this.available()){ this.state='device'; this.message='No server on this address'; return; }
    this.state='probing'; this.bump();
    let health;
    try{ health = await this._json('api/health'); }catch(e){ health=null; }
    if(!health || !health.ok || !health.body.ok){
      this.state='device';
      this.message = 'Device copy only';
      this.bump(); return;
    }
    this.server = health.body;
    let remote;
    try{ remote = await this._json('api/state'); }catch(e){ remote=null; }
    if(!remote || !remote.ok){ this.state='error'; this.message='Central database unreachable'; this.bump(); return; }

    const local = DB.db;
    const localHas = !!(local && local.users && local.users.length);
    const localRev = local?.meta?.serverRev ?? null;
    let decision = this.decide({ remoteRev:remote.body.rev, localHas, localRev, dirty:!!APPX.dirty });
    /* A device that seeded the demonstration set before it ever spoke to the
       host holds no authority. The central copy wins, silently and once. A
       device holding real unsynced work still gets the conflict dialogue. */
    if(decision==='conflict-first-sync' && this.disposableLocal()) decision='adopt';

    if(decision==='push'){
      this.baseRev = 0;
      await this._push(true);
      return;
    }
    if(decision==='idle-empty'){
      this.baseRev = 0; this.rev = 0; this.conflict = null;
      this.state='connected'; this.message='Central database ready'; this.bump();
      return;
    }
    if(decision==='adopt'){
      this.adoptRemote(remote.body);
      this.state='connected'; this.message='Loaded from the central database'; this.bump();
      return;
    }
    if(decision==='conflict-first-sync'){
      this.conflict = { kind:'adopt', remote:remote.body, localRev:null };
      this.state='conflict'; this.message='Two copies found'; this.bump(); return;
    }
    if(decision==='conflict-ahead'){
      this.conflict = { kind:'ahead', remote:remote.body, localRev };
      this.state='conflict'; this.message='The central copy has moved on'; this.bump(); return;
    }
    if(decision==='remote-moved'){
      this.adoptRemote(remote.body);
      this.state='connected'; this.message='Updated from the central database'; this.bump(); return;
    }
    /* 'in-step' */
    this.adoptMeta(remote.body);
    this.state='connected'; this.message='In step with the central database'; this.bump();
  },

  /* The single decision table for joining a central database. Kept pure so
     that every branch can be tested without a network. */
  decide({ remoteRev, localHas, localRev, dirty }){
    if(remoteRev === 0) return localHas ? 'push' : 'idle-empty';
    if(!localHas) return 'adopt';                                   /* a new device joins the central copy */
    if(localRev === null || localRev === undefined) return 'conflict-first-sync';
    if(localRev === remoteRev) return 'in-step';
    if(remoteRev > localRev) return dirty ? 'conflict-ahead' : 'remote-moved';
    return 'in-step';                                                /* local is ahead: will be pushed on next save */
  },

  /* Only demonstration data is treated as disposable on a first join. */
  disposableLocal(){
    try{ return !!(DB.db && DB.db.meta && (DB.db.meta.demoSeeded || DB.db.meta.label==='Demonstration dataset (synthetic)')); }
    catch(e){ return false; }
  },

  adoptMeta(remote){
    DB.db.meta = {...(DB.db.meta||{}), serverRev:remote.rev, serverSaved:remote.saved||null};
    this.baseRev = remote.rev; this.rev = remote.rev; this.saved = remote.saved;
  },

  adoptRemote(remote){
    const keep = DB.db?.meta||{};
    const remoteSchema = remote.db?.meta?.schema || 0;
    if(remoteSchema > (APP.schema||0)){
      this.state='error';
      this.message='The central database was written by a newer version of LOMAMO C-DIMS';
      this.bump();
      toast('Update required','The host computer holds a newer schema. Update this device before continuing.','err');
      return;
    }
    DB.db = remote.db;
    DB.db.meta = {...(DB.db.meta||{}), serverRev:remote.rev, serverSaved:remote.saved||null, deviceLabel:keep.deviceLabel};
    Store.set(DB.KEY, JSON.stringify(DB.db));
    APPX.dirty = false;
    this.baseRev = remote.rev; this.rev = remote.rev; this.saved = remote.saved;
    AUDIT.append({actor:'system', action:'sync.adopted', entity:'system', entityId:'central',
      detail:`Central revision ${remote.rev} adopted from the host computer`});
    render();
  },

  /* Queue a push after a local save. Debounced so a burst of edits is one write. */
  queue(){
    if(!this.available()) return;
    if(this.state==='device' || this.state==='error' || this.state==='idle') return;
    /* A save is pushed almost at once. The wait is only long enough to merge a
       burst of taps into one write, not long enough for anyone to notice. */
    clearTimeout(this._timer);
    this._timer = setTimeout(()=>this._push(false), 120);
  },

  async _push(force){
    if(this._inflight) return;
    this._inflight = true;
    if(this.state!=='conflict') { this.state='saving'; this.bump(); }
    const opId = 'op-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
    try{
      const r = await this._json('api/state', {
        method:'PUT', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ db: DB.db, baseRev: this.baseRev ?? 0, actor: AUTH.user?.username || 'device', opId })
      });
      if(r.status === 409){
        this.conflict = {kind:'ahead', remote:{rev:r.body.rev, saved:r.body.saved, summary:r.body.summary}, localRev:this.baseRev};
        this.state='conflict'; this.message='Another device saved first'; this.bump(); render();
      } else if(r.ok){
        this.baseRev = r.body.rev; this.rev = r.body.rev; this.saved = r.body.saved;
        DB.db.meta.serverRev = r.body.rev; DB.db.meta.serverSaved = r.body.saved;
        Store.set(DB.KEY, JSON.stringify(DB.db));
        APPX.dirty = false; this._retry = 0;
        this.state='connected'; this.message='Saved to the central database'; this.bump();
      } else {
        this.state='error'; this.message='The central database refused the save'; this.bump();
      }
    }catch(e){
      this.state='error'; this.message='Central database unreachable - this device holds the change';
      this._retry++;
      this.bump();
    } finally { this._inflight = false; }
  },

  bump(){
    APPX.sync = {state:this.state, rev:this.rev, saved:this.saved, message:this.message, latency:this.latency};
    try{ const el=document.querySelector('[data-sync-chip]'); if(el) el.outerHTML = this.chip(); }catch(e){}
  },

  label(){
    return ({
      idle:'Connecting', probing:'Connecting', connected:'Central database', device:'This device only',
      auth:'Password needed', saving:'Saving', conflict:'Needs attention', error:'Not saved centrally'
    })[this.state] || 'Unknown';
  },

  tone(){
    if(this.state==='connected') return 'ok';
    if(this.state==='saving'||this.state==='probing'||this.state==='idle') return 'neutral';
    if(this.state==='device') return 'warn';
    return 'crit';
  },

  detail(){
    if(this.state==='connected') return `Revision ${this.rev} · ${this.saved?this.saved.replace('T',' ').slice(0,16):'not yet saved'}`;
    if(this.state==='saving') return 'Writing to the host computer';
    if(this.state==='conflict') return 'Two devices changed the same records. Choose which to keep.';
    if(this.state==='device') return 'No central server answered. Records are held in this browser.';
    if(this.state==='error') return this.message;
    return this.message;
  },

  chip(){
    const t=this.tone();
    const cls = t==='ok'?'b-ok':t==='warn'?'b-warn':t==='crit'?'b-crit':'b-neutral';
    return `<button class="sync-chip" data-act="open-sync" data-sync-chip title="${esc(this.detail())}">
      <span class="badge ${cls} nodot">${esc(this.label())}</span>
      <span class="xs muted sync-detail">${esc(this.detail())}</span></button>`;
  },

  async resolveKeepLocal(){
    if(!this.conflict) return;
    const note = 'This device kept its copy after a revision conflict. The other revision is preserved on the host.';
    try{
      const r = await this._json('api/state/resolve',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({db:DB.db, actor:AUTH.user?.username||'device', note})});
      if(r.ok){
        this.baseRev=r.body.rev; this.rev=r.body.rev; this.saved=r.body.saved;
        DB.db.meta.serverRev=r.body.rev; DB.db.meta.serverSaved=r.body.saved; Store.set(DB.KEY, JSON.stringify(DB.db));
        AUDIT.append({actor:AUTH.user?.id||'system',action:'sync.kept_local',entity:'system',entityId:'central',
          detail:`Kept this device's copy as central revision ${r.body.rev}; the superseded revision is stored on the host`});
        this.conflict=null; this.state='connected'; this.message='This device copy is now central'; this.bump(); render();
      }
    }catch(e){ toast('Could not reach the central database','Nothing on this device has changed.','err'); }
  },

  async resolveAdoptRemote(){
    if(!this.conflict?.remote) return;
    try{
      const r = await this._json('api/state');
      if(!r.ok || !r.body.db) throw new Error('no state');
      const before = JSON.stringify(DB.db);
      download('LOMAMO-device-copy-before-sync-'+todayISO()+'.json', before, 'application/json');
      this.adoptRemote({rev:r.body.rev, saved:r.body.saved, db:r.body.db});
      this.conflict=null; this.state='connected'; this.message='Central copy adopted'; this.bump();
      toast('Central copy adopted','Your previous device copy was downloaded first, so nothing was destroyed.','ok');
    }catch(e){ toast('Could not read the central database','Try again when the host computer is running.','err'); }
  },

  downloadBoth(){
    if(!this.conflict) return;
    download('LOMAMO-device-copy-'+new Date().toISOString().slice(0,10)+'.json', JSON.stringify(DB.db,null,2), 'application/json');
    this._json('api/state').then(r=>{
      if(r.ok && r.body.db) download('LOMAMO-central-copy-rev'+r.body.rev+'.json', JSON.stringify(r.body.db,null,2), 'application/json');
    });
    toast('Both copies downloaded','Compare them offline, then choose which to keep.','ok');
  }
};

/* ---------------- Operator-facing status panel ---------------- */
function openSyncModal(){
  const s = SYNC;
  const tone = s.tone();
  const badgeCls = tone==='ok'?'b-ok':tone==='warn'?'b-warn':tone==='crit'?'b-crit':'b-neutral';

  let body = `<div class="sync-panel">
    <div class="spread">
      <span class="badge ${badgeCls}">${esc(s.label())}</span>
      <span class="small muted">${esc(s.detail())}</span>
    </div>`;

  if(s.state==='connected' || s.state==='saving'){
    body += `<div class="sync-row"><span>Role of this computer</span><b>${s.server ? 'Client of '+esc(s.server.host||'the host') : 'Connected'}</b></div>
      <div class="sync-row"><span>Central revision</span><b class="mono">${s.rev}</b></div>
      <div class="sync-row"><span>Last accepted at the host</span><b>${esc((s.saved||'').replace('T',' ').slice(0,19)||'not yet saved')}</b></div>
      <div class="sync-row"><span>Round trip</span><b>${s.latency!=null?s.latency+' ms':'-'}</b></div>
      <p class="small muted" style="margin:8px 0 0">Every accepted change is stored on the host computer and the previous revision is kept.
      Other devices on the Wi-Fi read the same records.</p>`;
  }

  if(s.state==='device'){
    body += `<p class="small" style="margin:6px 0 0">No central server answered at this address, so this browser is keeping its own copy.
      That is safe, but other devices will not see these records and this device will not see theirs.</p>
      <div class="note" style="margin-top:12px">${ic('info',14)}<span>To share records across devices, start the server on the host computer:
      <b>python server.py</b> or <b>start.bat</b> and choose option 2, then open this application from the address it prints.</span></div>
      <div class="sync-actions"><button class="btn btn-primary btn-sm" data-act="sync-retry">Check again</button></div>`;
  }

  if(s.state==='conflict'){
    const r = s.conflict?.remote || {};
    const summary = r.summary || {};
    body += `<div class="alert warn" style="margin:6px 0 0">${ic('alert',16)}<div><b>Two copies have changed independently</b>
      <span class="small">Nothing has been overwritten. The host kept both revisions. Choose which copy this device should continue from.</span></div></div>
      <div class="grid g2" style="margin-top:12px">
        <div class="card" style="box-shadow:none"><div class="card-b">
          <div class="k xs muted">THIS DEVICE</div>
          <div class="bold" style="font-size:15px;margin:4px 0 6px">Revision ${s.conflict?.localRev ?? 'unsynced'}</div>
          <div class="small muted">${DB.db.patients?.length||0} patients · ${DB.db.visits?.length||0} visits · ${DB.db.requests?.length||0} requests</div>
        </div></div>
        <div class="card" style="box-shadow:none"><div class="card-b">
          <div class="k xs muted">CENTRAL DATABASE</div>
          <div class="bold" style="font-size:15px;margin:4px 0 6px">Revision ${r.rev ?? 'unknown'}</div>
          <div class="small muted">${summary.patients ?? '?'} patients · ${summary.visits ?? '?'} visits · ${summary.requests ?? '?'} requests</div>
        </div></div>
      </div>
      <div class="sync-actions" style="margin-top:14px">
        <button class="btn btn-primary btn-sm" data-act="sync-adopt">Use the central copy</button>
        <button class="btn btn-ghost btn-sm" data-act="sync-keep">Keep this device's copy</button>
        <button class="btn btn-ghost btn-sm" data-act="sync-both">Download both to compare</button>
      </div>
      <p class="xs muted" style="margin-top:10px">Whichever you choose, this device's copy is downloaded first and the superseded revision stays on the host.</p>`;
  }

  if(s.state==='auth'){
    body += `<div class="alert warn" style="margin:6px 0 0">${ic('lock',16)}<div><b>The host checks the account password</b>
      <span class="small">${esc(s.message||'Sign in again to reach the central database.')} The password is sent once, over this connection, and is not stored on the device.</span></div></div>
      <form data-form="sync-auth" id="syncAuthForm" style="margin-top:12px">
        ${field('Password','password','password',{required:true,inputmode:'text'})}
      </form>
      <div class="sync-actions" style="margin-top:10px"><button class="btn btn-primary btn-sm" data-act="sync-auth">Reconnect</button></div>
      <p class="xs muted" style="margin-top:10px">If your account has no password on the host, ask the administrator to provision one with
      <b>python3 tools/set_password.py --user ${esc(AUTH.user?AUTH.user.username:'')}</b>.</p>`;
  }

  if(s.state==='error'){
    body += `<div class="alert crit" style="margin:6px 0 0">${ic('alert',16)}<div><b>The last change is not yet on the host</b>
      <span class="small">${esc(s.message)}. It is held safely in this browser and will be offered again. Do not clear the browser data.</span></div></div>
      <div class="sync-actions" style="margin-top:12px"><button class="btn btn-primary btn-sm" data-act="sync-retry">Try now</button></div>`;
  }

  body += `</div>`;
  openModal({ title:'Central database', narrow:true, body,
    footer:`<button class="btn btn-ghost" data-act="close-modal">Close</button>` });
}
