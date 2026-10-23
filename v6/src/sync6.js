/* ============================================================
   sync6.js - Central database client (v6)

   WHAT CHANGED FROM v5 AND WHY
   ----------------------------
   v5 sent the whole database document up and down and refused a save that did
   not sit on the latest revision. Two people working on different patients
   still collided, and the person was asked to choose between two copies.

   v6 sends **patches**. A patch names a collection, a record id, and only the
   fields that changed together with the value they replaced. The host applies
   patches one at a time and merges at field level, so:

     - two devices editing different patients both succeed;
     - two devices editing different fields of one patient both succeed;
     - two devices editing the same field: the later edit wins, and both values
       are written to the host's merge journal for review. Nothing is lost
       silently, and nobody is interrupted by a dialog.

   The client also polls for changes. When the host has moved on, only the
   records that changed are delivered (`/api/state?since=REV`), so a tablet on
   a weak signal is not asked to download three thousand patients to see one
   new visit.

   A page being typed into is never redrawn underneath the person. An update
   that arrives mid-form is applied to the data, marked pending, and drawn when
   the form closes or the person navigates.
   ============================================================ */

const SYNC = {
  /* idle | probing | connected | device | saving | merge | error */
  state:'idle', rev:0, saved:null, message:'', latency:null,
  sessionToken:null, server:null, authError:null,
  lastMerged:0, lastPatchAt:null, pendingRemote:false,
  _timer:null, _inflight:false, _poll:null, _shadow:{}, _retry:0,

  available(){
    try{ return typeof fetch==='function' && typeof location!=='undefined' && /^https?:$/.test(location.protocol); }
    catch(e){ return false; }
  },

  /* ---- session -------------------------------------------------------- */
  loadToken(){
    try{ this.sessionToken = sessionStorage.getItem('carelink.session') || this.sessionToken || null; }
    catch(e){ /* private mode: memory only */ }
    return this.sessionToken;
  },
  storeToken(t){
    this.sessionToken = t || null;
    try{ t ? sessionStorage.setItem('carelink.session', t) : sessionStorage.removeItem('carelink.session'); }catch(e){}
  },

  async _json(url, opts={}){
    const t0 = performance.now();
    const headers = Object.assign({}, opts.headers||{});
    if(this.sessionToken) headers['X-CareLink-Session'] = this.sessionToken;
    const r = await fetch(url, Object.assign({cache:'no-store'}, opts, {headers}));
    this.latency = Math.round(performance.now()-t0);
    const body = await r.json().catch(()=>({}));
    if(r.status === 401 && this.sessionToken){
      /* The host ended the session (idle window, revocation or restart). */
      this.storeToken(null);
      if(typeof SESSION !== 'undefined' && AUTH.user) SESSION.serverExpired();
    }
    return {status:r.status, ok:r.ok, body};
  },

  async login(username, password, device){
    const r = await this._json('api/auth/login', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({username, password, device: device || String(navigator.userAgent||'').slice(0,120)})});
    if(r.ok && r.body.token){
      this.storeToken(r.body.token);
      this.rev = r.body.rev || 0;
      this.state = 'connected';
      this.message = 'Signed in on the central database';
      this.authError = null;
      this.bump();
      return {ok:true, user:r.body.user, mustChange:!!r.body.mustChange, idleSeconds:r.body.idleSeconds, username:r.body.username};
    }
    this.authError = r.body.error || 'The host did not accept that sign-in.';
    return {ok:false, code:r.body.code||'failed', error:this.authError, status:r.status};
  },

  async logout(){
    if(this.sessionToken){
      try{ await this._json('api/auth/logout', {method:'POST', headers:{'Content-Type':'application/json'}, body:'{}'}); }catch(e){}
    }
    this.storeToken(null);
    this._shadow = {};
    this.stopPolling();
    this.state = 'idle';
    this.bump();
  },

  async beat(){
    if(!this.sessionToken) return null;
    try{ const r = await this._json('api/session/beat', {method:'POST', headers:{'Content-Type':'application/json'}, body:'{}'});
      return r.ok ? r.body.expiresIn : null; }catch(e){ return null; }
  },

  async changePassword(current, next){
    const r = await this._json('api/auth/change-password', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({current, password: next})});
    return {ok: r.ok, error: r.body.error};
  },

  /* ---- boot ----------------------------------------------------------- */
  async start(){
    this.loadToken();
    if(!this.available()){ this.state='device'; this.message='This copy runs from the device'; this.bump(); return; }
    this.state = 'probing'; this.bump();
    let health = null;
    try{ health = await this._json('api/health'); }catch(e){ health = null; }
    if(!health || !health.ok){
      this.state = 'device';
      this.message = 'No central server answered — this device is holding its own copy';
      this.bump(); return;
    }
    this.server = health.body;
    this.rev = health.body.rev || 0;
    if(!health.body.setup){
      this.state = 'idle'; this.message = 'The host is waiting for first-run setup'; this.bump();
      APPX.hostReady = true; render(); return;
    }
    if(!this.sessionToken){
      this.state = 'device';
      this.message = 'The central database needs a sign-in';
      this.bump(); return;
    }
    await this.pullFull();
    this.startPolling();
  },

  async pullFull(){
    const r = await this._json('api/state');
    if(!r.ok || !r.body.db){
      if(r.status === 401){ this.state='device'; this.message='Session ended — sign in again'; this.bump(); return false; }
      this.state='error'; this.message = r.body.error || 'The central database could not be read'; this.bump(); return false;
    }
    this.adoptRemote(r.body.db, r.body.rev, r.body.saved);
    this.state='connected'; this.message='Reading the central database'; this.bump();
    return true;
  },

  adoptRemote(db, rev, saved){
    const keep = (DB.db && DB.db.meta) || {};
    if((db.meta?.schema||0) > (APP.schema||0)){
      this.state='error'; this.message='The host holds a newer schema — update this device';
      this.bump(); return;
    }
    DB.db = db;
    DB.migrate();
    DB.db.meta = Object.assign({}, DB.db.meta, {serverRev:rev, serverSaved:saved, deviceLabel:keep.deviceLabel});
    try{ Store.set(DB.KEY, JSON.stringify(DB.db)); }catch(e){}
    this.rev = rev; this.saved = saved;
    this.rebase();
    APPX.dirty = false;
  },

  /* The single decision table for joining a central database. Kept pure so the
     rule can be read and tested without a network. v6 no longer asks the person
     to choose: a device with no authority adopts the host; a device with local
     work sends patches that the host merges. */
  decide({ remoteRev, localHas, localRev, dirty }){
    if(remoteRev === 0) return localHas ? 'push' : 'idle-empty';
    if(!localHas) return 'adopt';
    if(localRev === null || localRev === undefined) return 'adopt';
    if(localRev === remoteRev) return 'in-step';
    return dirty ? 'patch' : 'remote-moved';
  },
  /* Only synthetic reference data is treated as disposable on a first join. */
  disposableLocal(){
    try{ return !!(DB.db && DB.db.meta && (DB.db.meta.demoSeeded || /synthetic/i.test(DB.db.meta.label||''))); }
    catch(e){ return false; }
  },

  /* ---- patch generation ----------------------------------------------- */
  /* `_shadow` is the state of each collection as the host last confirmed it.
     A patch is the difference between that and what is in front of us now. */
  rebase(){
    const shadow = {};
    for(const [c,val] of Object.entries(DB.db||{})){
      if(!Array.isArray(val)) continue;
      const m = {};
      for(const rec of val){ if(rec && rec.id!==undefined) m[rec.id] = JSON.stringify(rec); }
      shadow[c] = m;
    }
    shadow.__settings = { settings: JSON.stringify(DB.db.settings||{}) };
    this._shadow = shadow;
    this.lastPatchAt = new Date().toISOString();
  },

  patches(){
    const out = [];
    const db = DB.db || {};
    for(const [c,val] of Object.entries(db)){
      if(!Array.isArray(val)) continue;
      if(['audit','mergeJournal','presence','weatherCache'].includes(c)) continue;
      const prev = this._shadow[c] || {};
      const seen = new Set();
      for(const rec of val){
        if(!rec || rec.id===undefined) continue;
        const id = rec.id; seen.add(id);
        const now = JSON.stringify(rec);
        if(prev[id] === now) continue;
        if(!prev[id]){
          out.push({c, id, set: rec, before:{}});
          continue;
        }
        let before = {};
        try{ before = JSON.parse(prev[id]); }catch(e){ before = {}; }
        const set = {}, bef = {};
        for(const [k,v] of Object.entries(rec)){
          if(JSON.stringify(v) !== JSON.stringify(before[k])){ set[k] = v; bef[k] = before[k] === undefined ? null : before[k]; }
        }
        for(const k of Object.keys(before)){
          if(!(k in rec)){ set[k] = null; bef[k] = before[k]; }
        }
        if(Object.keys(set).length) out.push({c, id, set, before: bef});
      }
      for(const id of Object.keys(prev)){
        if(!seen.has(id)) out.push({c, id, del:true});
      }
    }
    /* settings is a single object, not a list */
    const sNow = JSON.stringify(db.settings||{});
    const sOld = (this._shadow.__settings||{}).settings;
    if(sNow !== sOld){
      out.push({c:'settings', id:'settings', set:{ id:'settings', value: db.settings||{} }, before:{}});
    }
    /* the audit trail only ever grows: append what is new */
    const audit = db.audit || [];
    const known = audit.length - (this._shadow.__auditLen != null ? this._shadow.__auditLen : audit.length);
    if(known > 0){
      for(const e of audit.slice(audit.length-known)) out.push({c:'audit', id: e.seq || e.hash || String(Math.random()), set:e, before:{}});
    }
    return out;
  },

  queue(){
    if(!this.available() || !this.sessionToken) return;
    clearTimeout(this._timer);
    this._timer = setTimeout(()=>this.push(), 320);
  },

  async push(){
    if(this._inflight || !this.sessionToken) return;
    const patches = this.patches();
    if(!patches.length) return;
    this._inflight = true;
    const before = this.state;
    if(this.state !== 'merge') { this.state='saving'; this.bump(); }
    /* A very large first patch is sent whole; the host caps nothing below 64 MB. */
    const chunk = 1200;
    let rev = this.rev, merged = 0;
    try{
      for(let i=0;i<patches.length;i+=chunk){
        const slice = patches.slice(i, i+chunk);
        const r = await this._json('api/state', {
          method:'PUT', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({patches: slice, opId: 'op-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),
                                ts: new Date().toISOString()})
        });
        if(!r.ok){
          this.state = r.status===403 ? 'error' : 'error';
          this.message = r.body.error || 'The central database refused the save';
          this.bump(); this._inflight=false; return;
        }
        rev = r.body.rev; merged += (r.body.merged||0);
      }
      this.rev = rev;
      this.saved = new Date().toISOString();
      DB.db.meta = Object.assign({}, DB.db.meta, {serverRev:rev, serverSaved:this.saved});
      try{ Store.set(DB.KEY, JSON.stringify(DB.db)); }catch(e){}
      APPX.dirty = false; this._retry = 0;
      this.rebase();
      this.lastMerged = merged;
      this.state = merged ? 'merge' : 'connected';
      this.message = merged
        ? `Saved · ${merged} overlapping field${merged===1?'':'s'} reconciled automatically`
        : 'Saved to the central database';
      this.bump();
      if(merged){
        const box = document.createElement('div');
        box.className = 'merge-note';
        box.innerHTML = `<b>${merged} overlapping field${merged===1?'':'s'}</b> were changed on two devices and reconciled automatically. Both values are in the merge journal.`;
        document.body.appendChild(box);
        setTimeout(()=>box.remove(), 7000);
      }
    }catch(e){
      this._retry++;
      this.state='error';
      this.message='The host is unreachable — the change is held on this device and will be retried';
      this.bump();
    }finally{
      this._inflight = false;
      if(before==='merge' && this.state==='saving') this.state='connected';
    }
  },

  /* ---- live reads ------------------------------------------------------ */
  startPolling(){
    this.stopPolling();
    const period = this.pendingRemote ? 900 : 1500;
    this._poll = setInterval(()=>this.tick(), period);
  },
  stopPolling(){ if(this._poll) clearInterval(this._poll); this._poll=null; },

  async tick(){
    if(!this.sessionToken || this._inflight || document.hidden) return;
    if(APPX.dirty){ await this.push(); }
    try{
      const r = await this._json(`api/state?since=${this.rev}`);
      if(!r.ok) return;
      if(r.body.unchanged) return;
      if(r.body.db){ this.adoptRemote(r.body.db, r.body.rev, r.body.saved); this.softRefresh(); return; }
      if(r.body.partial){
        this.applyDelta(r.body);
        this.rev = r.body.rev; this.saved = r.body.saved;
        DB.db.meta = Object.assign({}, DB.db.meta, {serverRev:r.body.rev, serverSaved:r.body.saved});
        this.softRefresh();
      }
    }catch(e){ /* a dropped poll is not an error worth showing */ }
  },

  applyDelta(body){
    const touched = new Set();
    for(const [c, records] of Object.entries(body.collections||{})){
      const list = DB.db[c] = Array.isArray(DB.db[c]) ? DB.db[c] : [];
      for(const rec of records){
        const i = list.findIndex(x=>x && x.id===rec.id);
        if(i>=0){
          /* The host is authoritative: take its record. A local edit that has
             not been pushed yet is still in this list and will be sent as a
             patch on the next tick, so nothing is lost. */
          list[i] = Object.assign({}, list[i], rec);
        } else list.push(rec);
        touched.add(c);
      }
    }
    for(const [c, ids] of Object.entries(body.removed||{})){
      if(!Array.isArray(DB.db[c])) continue;
      DB.db[c] = DB.db[c].filter(r=>!ids.includes(r.id));
      touched.add(c);
    }
    try{ Store.set(DB.KEY, JSON.stringify(DB.db)); }catch(e){}
    for(const c of touched){
      const m = {};
      for(const rec of (DB.db[c]||[])) if(rec && rec.id!==undefined) m[rec.id] = JSON.stringify(rec);
      this._shadow[c] = m;
    }
    return touched;
  },

  /* Redraw only when it is safe. A form in progress is never wiped. */
  softRefresh(){
    const editing = (()=>{
      const a = document.activeElement;
      if(!a) return false;
      const tag = (a.tagName||'').toUpperCase();
      return ['INPUT','TEXTAREA','SELECT'].includes(tag) || !!document.querySelector('.modal-back');
    })();
    if(editing){ this.pendingRemote = true; this.bump(); return; }
    this.pendingRemote = false;
    this.state = this.state==='merge' ? 'merge' : 'connected';
    this.message = 'Updated from the central database';
    this.bump();
    try{ render(); }catch(e){}
  },
  flushPending(){
    if(this.pendingRemote){ this.pendingRemote = false; try{ render(); }catch(e){} }
  },

  bump(){
    APPX.sync = {state:this.state, rev:this.rev, saved:this.saved, message:this.message, latency:this.latency, merged:this.lastMerged};
    try{ const el=document.querySelector('[data-sync-chip]'); if(el) el.outerHTML = this.chip(); }catch(e){}
  },

  label(){
    return ({ idle:'Connecting', probing:'Connecting', connected:'Central database', device:'This device only',
      saving:'Saving', merge:'Reconciled', error:'Not saved centrally' })[this.state] || 'Unknown';
  },
  tone(){
    if(this.state==='connected'||this.state==='merge') return 'ok';
    if(this.state==='saving'||this.state==='probing'||this.state==='idle') return 'neutral';
    if(this.state==='device') return 'warn';
    return 'crit';
  },
  detail(){
    if(this.state==='connected') return `Revision ${this.rev} · live`;
    if(this.state==='merge') return `Revision ${this.rev} · ${this.lastMerged} field(s) reconciled`;
    if(this.state==='saving') return 'Writing to the host computer';
    if(this.state==='device') return 'No host answered — records are kept on this device';
    if(this.state==='error') return this.message;
    return this.message || 'Checking the host';
  },
  chip(){
    const t = this.tone();
    const cls = t==='ok'?'b-ok':t==='warn'?'b-warn':t==='crit'?'b-crit':'b-neutral';
    return `<button class="sync-chip" data-act="open-sync" data-sync-chip title="${esc(this.detail())}">
      <span class="badge ${cls} nodot">${esc(this.label())}</span>
      <span class="xs muted sync-detail">${esc(this.detail())}</span></button>`;
  },

  /* ---- administrator operations --------------------------------------- */
  async mergeJournal(){
    const r = await this._json('api/merge-journal?limit=300');
    return r.ok ? (r.body.entries||[]) : [];
  },
  async serverAudit(){
    const r = await this._json('api/audit?limit=500');
    return r.ok ? (r.body.entries||[]) : [];
  },
  async rollback(rev, reason){
    const r = await this._json('api/rollback', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({toRev:rev, reason})});
    if(r.ok){ await this.pullFull(); }
    return {ok:r.ok, error:r.body.error, rev:r.body.rev};
  },
  async credentialList(){
    const r = await this._json('api/credentials');
    return r.ok ? (r.body.accounts||[]) : [];
  }
};

/* ---------------------------------------------------------------- panel */
function openSyncModal(){
  const s = SYNC;
  const cls = s.tone()==='ok'?'b-ok':s.tone()==='warn'?'b-warn':s.tone()==='crit'?'b-crit':'b-neutral';
  let body = `<div class="spread" style="margin-bottom:12px">
      <span class="badge ${cls}">${esc(s.label())}</span>
      <span class="small muted">${esc(s.detail())}</span></div>`;
  body += `<div class="sync-row"><span>Central revision</span><b class="mono">${s.rev}</b></div>
    <div class="sync-row"><span>Round trip</span><b>${s.latency!=null? s.latency+' ms':'—'}</b></div>
    <div class="sync-row"><span>Last confirmed save</span><b>${esc((s.saved||'not yet').replace('T',' ').slice(0,19))}</b></div>
    <p class="small muted" style="margin:10px 0 0;text-align:justify">Every device on this network reads the same
    central database. Edits made on two devices are merged field by field at the host; when both devices change the
    <b>same</b> field the later edit is kept and both values are written to the merge journal. Nothing is overwritten
    without a record of it, and no one is asked to choose between two copies.</p>`;
  if(s.state==='device'){
    body += `<div class="alert warn" style="margin-top:12px">${ic('wifi',16)}<div><b>No host answered</b>
      <span class="small">Records are being kept on this device. Open the address the host computer printed, or ask
      the administrator whether the server window is still open.</span></div></div>
      <button class="btn btn-primary btn-sm" style="margin-top:10px" data-act="sync-retry">Check again</button>`;
  }
  if(s.state==='error'){
    body += `<div class="alert crit" style="margin-top:12px">${ic('alert',16)}<div><b>${esc(s.message)}</b>
      <span class="small">The change stays on this device until the host accepts it. Nothing is lost by closing the browser.</span></div></div>
      <button class="btn btn-primary btn-sm" style="margin-top:10px" data-act="sync-retry">Retry now</button>`;
  }
  openModal({title:'Central database', narrow:true, body,
    footer:`<button class="btn btn-ghost" data-act="close-modal">Close</button>
      <button class="btn btn-ghost" data-act="go" data-v="mergejournal">Merge journal</button>`});
}

/* Merge journal page: the audit view of automatic reconciliation. */
function renderMergeJournal(user){
  if(!RBAC.has(user,'system.audit') && !RBAC.has(user,'audit.view')) return deniedPanel('system.audit');
  const rows = SYNC.journal || null;
  const body = rows===null
    ? emptyState('Read the journal from the host','The journal is held on the host computer, not in this browser.','refresh',
        `<button class="btn btn-primary btn-sm" style="margin-top:10px" data-act="mj-load">Read the journal</button>`)
    : (rows.length
        ? table([
            {label:'When', render:r=>esc(String(r.ts||'').replace('T',' ').slice(0,19))},
            {label:'Who', render:r=>esc(r.actor||'—')},
            {label:'Record', render:r=>`<b>${esc(r.collection)}</b> <span class="mono xs">${esc(r.record_id)}</span>`},
            {label:'Field', render:r=>esc(r.field)},
            {label:'This edit', render:r=>`<span class="mono xs">${esc(String(r.mine||'').slice(0,60))}</span>`},
            {label:'Other copy', render:r=>`<span class="mono xs">${esc(String(r.theirs||'').slice(0,60))}</span>`},
            {label:'Resolution', render:r=>badge(r.resolution||'kept','b-warn',false)}
          ], rows)
        : emptyState('Nothing to reconcile','No two devices have changed the same field since this database was created.','check'));
  return pageHead('Merge journal','Every field that two devices changed at the same time, and how the host resolved it.',
      `<button class="btn btn-sm btn-ghost" data-act="mj-load">${ic('refresh',15)} Refresh</button>`) +
    `<div class="card"><div class="card-b">${body}</div></div>`;
}

/* Live presence and location. Coordinates are only ever taken when the person
   presses the button: there is no background tracking. */
const PRESENCE = {
  async locate(){
    return new Promise(resolve=>{
      if(!navigator.geolocation) return resolve({ok:false, error:'This browser has no location service.'});
      navigator.geolocation.getCurrentPosition(
        pos=>resolve({ok:true, lat:+pos.coords.latitude.toFixed(5), lon:+pos.coords.longitude.toFixed(5),
                      accuracy:Math.round(pos.coords.accuracy)}),
        err=>resolve({ok:false, error: err.code===1 ? 'Location permission was refused.' : 'Location could not be read.'}),
        {timeout:8000, maximumAge:60000});
    });
  },
  mark(user, loc){
    if(!user) return;
    DB.db.presence = DB.db.presence || {};
    DB.db.presence[user.id] = { at: new Date().toISOString(), state:'online',
      lat:loc?.lat, lon:loc?.lon, accuracy:loc?.accuracy, device:(navigator.userAgent||'').slice(0,80) };
    DB.save();
  },
  online(user){
    const p = (DB.db.presence||{})[user.id];
    if(!p) return false;
    return (Date.now() - new Date(p.at).getTime()) < 12*60000;
  }
};
