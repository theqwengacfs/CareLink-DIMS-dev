/* ============================================================
   live.js - the half-second refresh
   Every device asks the host for one number, the current revision,
   twice a second. When the number moves, the device pulls the new
   state and redraws itself. Nobody has to tap anything, and no
   device shows a record older than half a second.

   Three rules keep this safe:
     1. A refresh never counts as user activity, so it cannot keep
        an abandoned session alive.
     2. A refresh never lands while a person is typing into a form
        or has a dialogue open. It waits, then applies.
     3. A refresh never writes back. It only reads, so two devices
        refreshing cannot fight each other.
   ============================================================ */

const LIVE = {
  intervalMs: 500,
  maxIntervalMs: 4000,
  state: 'off',            // off | waiting | live | device | paused
  lastRev: null,
  applied: 0,
  pending: null,
  missing: 0,
  lastError: '',
  _timer: null,
  _busy: false,
  _current: 500,

  start(){
    this.stop();
    if(typeof SYNC==='undefined') return;
    /* A person may switch live update off on a device with a poor battery or a
       metered link. The setting is theirs and it is honoured at once. */
    const pref = (DB.db && DB.db.personalPrefs && AUTH.user && DB.db.personalPrefs[AUTH.user.id]) || {};
    const org = (DB.db && DB.db.settings && DB.db.settings.sync) || {};
    if(pref.live===false || org.live===false){ this.state='off'; this.paint(); return; }
    this.intervalMs = Math.max(250, Number(pref.liveMs || org.liveMs || 500));
    this._current = this.intervalMs;
    this.state = 'waiting';           /* honest until the first successful ask */
    this._timer = setInterval(()=>this.tick(), this._current);
    this.paint();
  },
  stop(){ if(this._timer) clearInterval(this._timer); this._timer=null; this.state='off'; },
  pause(){ if(this._timer) clearInterval(this._timer); this._timer=null; this.state='paused'; this.paint(); },
  resume(){ if(!this._timer) this.start(); },

  /* A person is mid-sentence: do not redraw under their hands. */
  holding(){
    try{
      if(typeof modalStack!=='undefined' && modalStack.length) return true;
      if(typeof modalDirty==='function' && modalDirty()) return true;
      if(typeof APPX!=='undefined' && APPX.dirty) return true;
      const a = document.activeElement;
      if(a && a.closest && a.closest('[data-form]')) return true;
      if(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName||'')) return true;
    }catch(e){}
    return false;
  },

  async tick(){
    if(!AUTH.user || AUTH.locked()){ return; }
    if(this._busy) return;
    if(!SYNC.available()){ this.state='device'; this.paint(); return; }
    this._busy = true;
    try{
      const r = await this._rev();
      if(!r){ this.missing++; this.state = SYNC.sessionToken ? 'waiting' : 'device';
        this.backoff(); this.paint(); return; }
      this.missing = 0; this._current = this.intervalMs;

      /* First tick after signing in: take the host's copy whatever its
         revision, so a device never starts from a stale local record. */
      if(this.lastRev===null){ this.lastRev = r.rev; if(r.rev>0) await this.pull(r.rev); }
      if(this.pending !== null){ await this.apply(this.pending); this.pending=null; }
      if(r.rev !== this.lastRev){ await this.pull(r.rev); }
      else if(this.state!=='live'){ this.state='live'; this.paint(); }
    }catch(e){
      this.lastError = String(e&&e.message||e);
      this.missing++; this.backoff(); this.state='waiting'; this.paint();
    }finally{
      this._busy = false;
    }
  },

  /* Errors back off to four seconds, then return to half a second. A tablet
     that has driven out of Wi-Fi range must not hammer the battery. */
  backoff(){
    if(this.missing < 3) return;
    const next = Math.min(this.maxIntervalMs, this._current*2);
    if(next===this._current) return;
    this._current = next;
    if(this._timer){ clearInterval(this._timer); this._timer = setInterval(()=>this.tick(), this._current); }
  },

  async _rev(){
    try{
      const res = await fetch('api/rev', {cache:'no-store'});
      if(!res.ok) return null;
      const b = await res.json().catch(()=>null);
      return b && typeof b.rev==='number'? b : null;
    }catch(e){ return null; }
  },

  async pull(rev){
    const r = await SYNC._json('api/state');
    if(!r || !r.ok || !r.body || !r.body.db){ this.state='waiting'; this.paint(); return; }
    if(typeof r.body.rev==='number' && r.body.rev < SYNC.rev) return;
    if(this.holding()){ this.state='holding'; this.pending = r.body.rev; this.paint(); return; }
    this.adopt(r.body);
  },

  async apply(){
    const r = await SYNC._json('api/state');
    if(r && r.ok && r.body && r.body.db && !this.holding()) this.adopt(r.body);
  },

  adopt(remote){
    const before = { rev: SYNC.rev, name: AUTH.user? AUTH.user.username : null };
    DB.adopt(remote.db);
    SYNC.rev = Number(remote.rev)||0;
    SYNC.saved = remote.saved || null;
    SYNC.baseRev = SYNC.rev;
    if(typeof APPX!=='undefined') APPX.dirty = false;
    this.lastRev = SYNC.rev;
    this.applied++;
    this.state = 'live';
    /* keep the person where they were: same scroll, same focused control */
    const y = window.scrollY||0;
    const active = document.activeElement;
    const key = active && active.id? '#'+active.id : (active && active.getAttribute && active.getAttribute('name')? `[name="${active.getAttribute('name')}"]` : null);
    if(AUTH.user){
      const still = DB.db.users.find(u=>u.id===AUTH.user.id);
      if(still) AUTH.user = still;
      else { AUTH.logout(); this.paint(); return; }
    }
    if(typeof render==='function') render();
    try{ window.scrollTo(0,y); }catch(e){}
    if(key){ const el=document.querySelector(key); if(el && el.focus){ try{ el.focus({preventScroll:true}); }catch(e){} } }
    this.paint();
    if(typeof SYNC.bump==='function') SYNC.bump();
  },

  /* Which devices are on: read from the presence records the console keeps. */
  online(withinSeconds=90){
    const now = Date.now();
    return Object.entries(DB.db.presence||{})
      .filter(([id,p])=>p && p.at && (now - new Date(p.at).getTime()) < withinSeconds*1000)
      .map(([id,p])=>({ id, at:p.at, user:(DB.db.users||[]).find(u=>u.id===id) }))
      .filter(x=>x.user);
  },

  label(){
    return ({
      off:'Live update off', live:'Live', waiting:'Reconnecting', device:'This device only',
      holding:'Update waiting', paused:'Live update paused'
    })[this.state] || 'Live';
  },

  paint(){
    const el = document.querySelector('[data-live]');
    if(!el) return;
    const tone = this.state==='live'? 'ok' : this.state==='holding'||this.state==='waiting'? 'warn' : 'neutral';
    el.className = 'live-pill ' + tone;
    el.title = this.state==='live'
      ? `The host is checked every ${(this._current/1000).toFixed(1)} s. Revision ${SYNC.rev||0}.`
      : this.label();
    el.innerHTML = `<span class="live-dot"></span><span class="live-t">${esc(this.label())}</span>`;
  }
};

/* Another tab on this same device saved: adopt its copy without a host. */
try{
  window.addEventListener('storage', (e)=>{
    if(!e || e.key !== DB.KEY || !AUTH.user) return;
    if(LIVE.holding()){ LIVE.state='holding'; LIVE.paint(); return; }
    const raw = e.newValue;
    if(!raw) return;
    let next=null; try{ next = JSON.parse(raw); }catch(err){ return; }
    if(!next || !next.meta) return;
    DB.db = next; DB.migrate();
    if(typeof render==='function') render();
    LIVE.paint();
  });
}catch(e){}
