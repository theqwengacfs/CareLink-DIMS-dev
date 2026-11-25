/* ============================================================
   sync6.js - Shared online source client (v6)

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

const SYNC_OUTBOX_KEY = 'carelink.sync.outbox';

const SYNC = {
  /* idle | probing | connected | device | saving | merge | error */
  state:'idle', rev:0, saved:null, message:'', latency:null,
  sessionToken:null, server:null, authError:null,
  lastMerged:0, lastPatchAt:null, pendingRemote:false, deviceOnlyOverride:false,
  _timer:null, _inflight:false, _poll:null, _shadow:{}, _retry:0,
  /* A hosted client is a view of the shared record, so it does not keep the
     whole register in browser storage. The one thing that must survive a reload
     is work the clinic has typed but the host has not accepted yet. */
  outbox:{ patches:[], savedAt:null, rev:null, authFailed:false },

  available(){
    try{
      if(this.deviceOnlyOverride) return false;
      if(typeof fetch!=='function' || typeof location==='undefined' || !/^https?:$/.test(location.protocol)) return false;
      if(/\.github\.io$/i.test(String(location.hostname||''))) return false;
      return true;
    }
    catch(e){ return false; }
  },

  resolveApiUrl(url){
    try{
      const s = String(url || '');
      if(/^api\//.test(s) && typeof location !== 'undefined' && typeof location.pathname === 'string' && /\/public\/[^/]*$/.test(location.pathname)){
        return '../' + s;
      }
      return s;
    }catch(_e){ return url; }
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

  /* ---- held work ("outbox") -------------------------------------------- */
  /* Legacy best-effort plaintext storage. It is not an encrypted offline vault,
     nor is a retry idempotent after response loss. Never claim durability or
     shared acceptance unless the relevant checks below actually succeed. */
  writeOutbox(){
    if(typeof Store === 'undefined' || !Store.set) return false;
    const box = this.outbox;
    if(!box || !Array.isArray(box.patches) || !box.patches.length) return false;
    const raw = Store.get(SYNC_OUTBOX_KEY);
    if(Store.durable === false) return false;
    if(raw){
      let current;
      try{ current = JSON.parse(raw); }catch(e){ return false; }
      if(!current || current.username !== box.username || JSON.stringify(current.patches) !== JSON.stringify(box.patches)) return false;
    }
    box.savedAt = new Date().toISOString();
    try{ return Store.set(SYNC_OUTBOX_KEY, JSON.stringify(box)) === true; }catch(e){ return false; }
  },
  loadOutbox(){
    if(typeof Store === 'undefined' || !Store.get) return null;
    try{
      const raw = Store.get(SYNC_OUTBOX_KEY);
      if(!raw) return null;
      const parsed = JSON.parse(raw);
      if(!parsed || !Array.isArray(parsed.patches) || !parsed.patches.length) return null;
      return parsed;
    }catch(e){ return null; }
  },
  clearOutbox(expected){
    // Never delete another account's queue or a newer queue written during a save.
    const current = this.loadOutbox();
    const signedIn = (typeof AUTH !== 'undefined' && AUTH.user && AUTH.user.username) || null;
    if(!expected || !current || !signedIn || current.username !== signedIn ||
       typeof Store === 'undefined' || Store.durable === false ||
       JSON.stringify(current.patches) !== JSON.stringify(expected.patches)) return false;
    this.outbox = { patches:[], savedAt:null, rev:null, authFailed:false };
    try{ if(typeof Store !== 'undefined' && Store.del) Store.del(SYNC_OUTBOX_KEY); }catch(e){ return false; }
    return !this.loadOutbox();
  },
  heldOutbox(){ const box = this.loadOutbox(); return box ? box.patches.length : 0; },

  /* A provider quota cannot recover through a fast-pack/page/write retry.
     Keep failures (never data or authorization) during a short retry window.
     An explicit KV retry clears it; its expiry is NOT a quota-reset promise. */
  kvBlocked(){ return Boolean(this._kvFailure && Date.now() < (this._kvRetryAt || 0)); },
  resetKvBackoff(){ this._kvFailure = null; this._kvRetryAt = 0; },

  async _json(url, opts={}){
    if(this.kvBlocked()) return this._kvFailure;
    const nowMs = () => (typeof performance !== 'undefined' && performance && typeof performance.now === 'function') ? performance.now() : Date.now();
    const t0 = nowMs();
    const { preserveTokenOn401, skipAuthHeader, timeoutMs = 20000, ...fetchOpts } = opts || {};
    const headers = Object.assign({}, fetchOpts.headers||{});
    if(this.sessionToken && !skipAuthHeader){
      headers['X-CareLink-Session'] = this.sessionToken;
      if(!headers.Authorization && !headers.authorization) headers.Authorization = `Bearer ${this.sessionToken}`;
    }
    const controller = (typeof AbortController === 'function' && timeoutMs > 0) ? new AbortController() : null;
    let timedOut = false;
    let timer = null;
    let inSetup = true;
    if(controller){
      timer = setTimeout(() => {
        if(inSetup) return;
        timedOut = true;
        try{ controller.abort(); }catch(_e){}
      }, timeoutMs);
    }
    inSetup = false;
    let r;
    try{
      const reqInit = Object.assign({cache:'no-store',credentials:'same-origin'}, fetchOpts, {headers});
      if(controller && !reqInit.signal) reqInit.signal = controller.signal;
      r = await fetch(this.resolveApiUrl(url), reqInit);
    }catch(err){
      if(timedOut) throw new Error('The shared online service timed out while responding. Check your connection and try again.');
      throw err;
    }finally{
      if(timer) clearTimeout(timer);
    }
    this.latency = Math.round(nowMs()-t0);
    let body = await r.json().catch(()=>({}));
    /* Vercel rejects oversized Function requests before our API can return
       JSON. Preserve that actionable failure instead of showing a generic
       "database refused" message with no status or next step. */
    if(!r.ok && (!body || typeof body !== 'object' || !body.error)){
      const details = body && typeof body === 'object' ? body : {};
      const tooLarge = r.status === 413;
      body = Object.assign({}, details, {
        ok:false,
        code:tooLarge ? 'payload_too_large' : (details.code || `http_${r.status}`),
        error:tooLarge
          ? 'The request exceeded Vercel\'s 4.5 MB Function payload limit. For first-run setup, choose "Start with an empty patient register"; no completion is being claimed.'
          : `The shared online service refused the request (HTTP ${r.status}). No success is being claimed.`
      });
    }
    if(!r.ok && body && body.code === 'kv_quota_exceeded'){
      const retrySeconds = Math.max(300, Math.min(3600, Number(body.retryAfterSeconds) || 300));
      this._kvRetryAt = Date.now() + retrySeconds * 1000;
      this._kvFailure = { status:r.status, ok:false, body };
      this.state = 'error'; this.message = body.error || 'The online database has reached a provider usage limit.';
      if(this._poll) this.startPolling();
      this.bump();
    }
    if(r.status === 401 && this.sessionToken && !preserveTokenOn401 && !skipAuthHeader){
      /* The host ended the session (idle window, revocation or restart). Anything
         typed but not yet accepted is held against this account before the
         session goes, so signing back in finishes the save. */
      try{ if(url !== 'api/auth/logout') this.holdWork(); }catch(_e){}
      this.storeToken(null);
      if(typeof SESSION !== 'undefined' && AUTH.user) SESSION.serverExpired();
    }
    return {status:r.status, ok:r.ok, body};
  },

  async login(username, password, device){
    clearTimeout(this._timer);
    this.stopPolling();
    const cryptoApi = typeof globalThis !== 'undefined' && globalThis.crypto;
    let loginAttemptId = '';
    try{ loginAttemptId = cryptoApi && cryptoApi.randomUUID ? cryptoApi.randomUUID() : ''; }catch(_e){}
    if(!loginAttemptId){
      try{ const bytes = new Uint8Array(24); cryptoApi.getRandomValues(bytes); loginAttemptId = Array.from(bytes, b=>b.toString(16).padStart(2,'0')).join(''); }catch(_e){ loginAttemptId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`; }
    }
    const descriptor=device && typeof device==='object' ? device : (typeof CLIENT_UI!=='undefined'?CLIENT_UI.snapshot():{label:device||'Staff browser',type:'other'});
    const loginPayload = JSON.stringify({username, password, deviceLabel:String(descriptor.label||'Staff browser').slice(0,100), deviceType:descriptor.type||'other', loginAttemptId});
    let r = null;
    let netErr = null;
    for(let attempt=0; attempt<2; attempt++){
      try{
        r = await this._json('api/auth/login', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: loginPayload,
          skipAuthHeader: true,
          timeoutMs: 15000
        });
        netErr = null;
        break;
      }catch(e){
        netErr = e;
        if(attempt === 0) await this._sleep(250);
      }
    }
    if(!r){
      this.state = 'error';
      this.message = (netErr && netErr.message && /timed out/i.test(netErr.message))
        ? netErr.message
        : 'The shared online source could not be reached';
      this.bump();
      return {ok:false, code:'offline', error:this.message, status:0};
    }
    if(r.ok && r.body.token){
      this._passwordBeforeWorkspace = false;
      this.storeToken(r.body.token);
      this.rev = r.body.rev || 0;
      this.state = 'connected';
      this.message = 'Signed in on the shared online source';
      this.authError = null;
      this.bump();
      if(r.body.passwordBeforeWorkspace){
        /* Do not load or retain a previous user's workspace before password
           replacement. The server permits only the password-change screen. */
        DB.db = DB.blank();
        this._passwordBeforeWorkspace = true;
        if(typeof APPX !== 'undefined') APPX.dirty = false;
        return {ok:true, user:r.body.user, mustChange:true, passwordBeforeWorkspace:true, idleSeconds:r.body.idleSeconds, username:r.body.username};
      }
      /* Authentication alone is not enough: a fresh tablet must not render
         its old/empty browser document while it waits for the next poll. */
      const pulled = await this.pullFull({ minRev: r.body.rev || 0, inlineState: r.body.inlineState || null });
      if(!pulled){
        const detail = this.message && !/Sign-in succeeded/i.test(this.message) ? ` (${this.message})` : '';
        await this.logout();
        this.state = 'error';
        this.message = `Sign-in succeeded, but the shared online state could not be loaded${detail}`;
        this.bump();
        return {ok:false, code:'state_unavailable', error:this.message, status:503};
      }
      return {ok:true, user:r.body.user, mustChange:!!r.body.mustChange, idleSeconds:r.body.idleSeconds, username:r.body.username};
    }
    this.authError = r.body.error || 'The shared online source did not accept that sign-in.';
    return {ok:false, code:r.body.code||'failed', error:this.authError, status:r.status};
  },

  async logout(){
    clearTimeout(this._timer);
    if(typeof PROD_SETUP !== 'undefined' && PROD_SETUP.clearCredentialPack) PROD_SETUP.clearCredentialPack();
    if(this.sessionToken){
      try{ const result=await this._json('api/auth/logout', {method:'POST', headers:{'Content-Type':'application/json'}, body:'{}', timeoutMs:6000}); if(!result.ok) return false; }catch(e){ return false; }
    }
    this.deviceOnlyOverride = false;
    this.storeToken(null);
    this._shadow = {};
    this.stopPolling();
    this.state = 'idle';
    this.bump();
    return true;
  },

  async beat(){
    if(!this.sessionToken) return null;
    try{
      const r = await this._json('api/session/beat', {method:'POST', headers:{'Content-Type':'application/json'}, body:'{}', timeoutMs:8000});
      if(r.ok && r.body && r.body.token) this.storeToken(r.body.token);
      return r.ok ? r.body.expiresIn : null;
    }catch(e){ return null; }
  },

  async changePassword(current, next){
    const r = await this._json('api/auth/change-password', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({current, password: next})});
    if(r.ok && r.body && r.body.rev) this.rev = Math.max(this.rev || 0, Number(r.body.rev) || 0);
    return {ok: Boolean(r.ok && r.body && r.body.ok === true), rev: r.body && r.body.rev, error: r.body && r.body.error};
  },

  /* ---- boot ----------------------------------------------------------- */
  async start(){
    this.loadToken();
    if(!this.available()){ this.state='device'; this.message='This copy runs from the device'; this.bump(); return; }
    /* Reuse a fresh host snapshot already loaded by boot() when unauthenticated
       so we do not trigger a redundant /api/health redraw while the user is
       typing into the Sign-In form. */
    if(!this.sessionToken && typeof APPX !== 'undefined' && APPX.host && typeof APPX.host === 'object'){
      this.server = APPX.host;
      this.rev = APPX.host.rev || 0;
      this.state = 'idle';
      this.message = APPX.host.setup ? 'Sign in to the shared online source' : 'The shared online source is waiting for first-run setup';
      this.bump();
      return;
    }
    this.state = 'probing'; this.bump();
    let health = null;
    try{ health = await this._json('api/health', { skipAuthHeader: true, timeoutMs: 8000 }); }catch(e){ health = null; }
    if(!health || !health.ok){
      this.state = this.available() ? 'error' : 'device';
      this.message = this.available()
        ? ((health && health.body && health.body.error) || 'The shared online source is unavailable — no local copy is being presented as a live save')
        : 'This copy runs from the device in offline/static mode';
      this.bump(); return;
    }
    this.server = health.body;
    /* Keep the public entry screen on the same activation snapshot as the sync
       client.  This matters when the first boot probe failed but this retry
       reaches an already-activated Vercel host. */
    if(typeof APPX !== 'undefined') APPX.host = health.body;
    this.rev = health.body.rev || 0;
    if(!health.body.setup){
      this.state = 'idle'; this.message = 'The shared online source is waiting for first-run setup'; this.bump();
      APPX.hostReady = true; render(); return;
    }
    if(!this.sessionToken){
      this.state = 'idle';
      this.message = 'Sign in to the shared online source';
      this.bump();
      if(typeof render==='function') render();
      return;
    }
    await this.pullFull();
    /* Work typed before the browser closed goes back before any further reading,
       so a reload can never quietly discard a visit. */
    await this.attemptOutbox();
    this.startPolling();
  },

  async _sleep(ms){
    await new Promise(resolve => setTimeout(resolve, ms));
  },

  _canDecompressGzip(){
    return typeof DecompressionStream === 'function'
      && typeof Response === 'function'
      && typeof Blob === 'function'
      && Boolean(Blob.prototype && typeof Blob.prototype.stream === 'function')
      && typeof atob === 'function'
      && typeof Uint8Array === 'function';
  },

  async _gunzipBase64Json(b64){
    const bin = atob(b64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for(let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const jsonText = await new Response(stream).text();
    return JSON.parse(jsonText);
  },

  async _catchUpDeltasSince(fromRev){
    if(!fromRev || fromRev <= 0) return;
    try{
      const d = await this._json(`api/state?since=${fromRev}`, { timeoutMs: 12000, preserveTokenOn401: true });
      if(d && d.ok && d.body){
        if(Array.isArray(d.body.patches) && d.body.patches.length){
          this.applyPatchList(d.body.patches);
          this.rev = Number(d.body.rev) || this.rev;
          this.saved = d.body.saved || this.saved;
          DB.db.meta = Object.assign({}, DB.db.meta, { serverRev: this.rev, serverSaved: this.saved });
          this.rebase();
          if(typeof DB !== 'undefined' && DB.persistState) DB.persistState();
        } else if(d.body.unchanged && d.body.rev){
          this.rev = Math.max(this.rev || 0, Number(d.body.rev) || 0);
        }
      }
    }catch(e){}
  },

  async _tryFastPackPull(minRev, requireReferenceMaster){
    const isCloudHost = Boolean(
      (this.server && this.server.cloud) ||
      (typeof APPX !== 'undefined' && APPX.host && APPX.host.cloud)
    );
    if(!isCloudHost || !this._canDecompressGzip()) return null;
    const delays = [0, 250, 600];
    let first = null;
    for(let attempt = 0; attempt < delays.length; attempt++){
      if(delays[attempt] > 0) await this._sleep(delays[attempt]);
      try{
        first = await this._json('api/state?fast=1', {
          preserveTokenOn401: attempt < delays.length - 1,
          timeoutMs: 35000
        });
      }catch(e){ first = null; }
      if(this.kvBlocked()) return null;
      const gotRev = first && first.body ? (Number(first.body.rev) || 0) : 0;
      if(first && first.ok && first.body && first.body.fastPack && typeof first.body.part0 === 'string' && (minRev <= 0 || gotRev >= minRev)){
        break;
      }
    }
    if(!first || !first.ok || !first.body || !first.body.fastPack || typeof first.body.part0 !== 'string' ||
       (minRev > 0 && (Number(first.body.rev) || 0) < minRev)){
      return null;
    }
    const totalParts = Number(first.body.totalParts) || 1;
    const packRev = Number(first.body.rev) || 0;
    const chunks = new Array(totalParts);
    chunks[0] = first.body.part0;

    const fetchPart = async (partIdx) => {
      for(let pTry = 0; pTry < 4; pTry++){
        if(pTry > 0) await this._sleep(250 * pTry);
        try{
          const pr = await this._json(`api/state?fast=1&part=${partIdx}&targetRev=${packRev}`, {
            preserveTokenOn401: pTry < 3,
            timeoutMs: 35000
          });
          if(this.kvBlocked()) return false;
          if(pr && pr.ok && pr.body && typeof pr.body.data === 'string' &&
             Number(pr.body.rev) === packRev && Number(pr.body.part) === partIdx && Number(pr.body.totalParts) === totalParts){
            chunks[partIdx] = pr.body.data;
            return true;
          }
        }catch(e){}
      }
      return false;
    };

    for(let p = 1; p < totalParts; p += 2){
      const batch = [p];
      if(p + 1 < totalParts) batch.push(p + 1);
      this.message = `Loading compressed workspace (${Math.min(p + batch.length, totalParts)} / ${totalParts})...`;
      const results = await Promise.all(batch.map(idx => fetchPart(idx)));
      if(results.some(ok => !ok)) return null;
    }

    try{
      const unpacked = await this._gunzipBase64Json(chunks.join(''));
      if(!unpacked || !unpacked.db || typeof unpacked.db !== 'object' || Number(unpacked.rev) !== packRev) return null;
      if(requireReferenceMaster && !(unpacked.db.meta && unpacked.db.meta.referenceMaster)) return null;
      this.adoptRemote(unpacked.db, unpacked.rev || packRev, unpacked.saved || first.body.saved);
      await this._catchUpDeltasSince(unpacked.rev || packRev);
      if(this.kvBlocked()) return false;
      this.state = 'connected';
      this.message = 'Reading the shared online source';
      this.bump();
      return true;
    }catch(e){
      return null;
    }
  },

  async pullFull(opts={}){
    if(this.kvBlocked() || this._clinicalBusy || this._pulling) return false;
    // An already-started ordinary save (e.g. first-login audit) must settle
    // before adopting a snapshot. Do not turn that short overlap into a
    // permanently failed post-login / verified reference-master refresh.
    if(this._inflight && this._pushPromise)await this._pushPromise;
    if(this._inflight || this._clinicalBusy || this._pulling || this.kvBlocked())return false;
    const minRev = Number(opts && opts.minRev) || 0;
    const requireReferenceMaster = Boolean(opts && opts.requireReferenceMaster);
    const inlineState = opts && opts.inlineState && typeof opts.inlineState === 'object' ? opts.inlineState : null;
    /* If POST /api/auth/login already included the complete non-paged Primary
       state snapshot, adopt it directly with zero extra round-trip or replica lag. */
    if(!requireReferenceMaster && inlineState && inlineState.db && (!Array.isArray(inlineState.pagedCollections) || inlineState.pagedCollections.length === 0)){
      this.adoptRemote(Object.assign({}, inlineState.db), inlineState.rev || minRev, inlineState.saved);
      this.state='connected'; this.message='Reading the shared online source'; this.bump();
      return true;
    }

    clearTimeout(this._timer);
    this._pulling = true;
    try{
      /* Always obtain a server-scoped snapshot. Older IndexedDB snapshots were
         keyed only by host, so another account's (or an outdated scope's) data
         could otherwise be reused when the revision had not changed. A delta is
         not a substitute for reapplying the current account's access scope. */
      /* Fast compressed stream, then paged state when compression is unavailable. */
      const fastOk = await this._tryFastPackPull(minRev, requireReferenceMaster);
      if(fastOk === true) return true;
      if(this.kvBlocked()) return false;

      /* Controlled-concurrency, revision-tolerant paged collection loader. */
      const delays = [0, 250, 600, 1200];
      const pageDelays = [0, 300, 750, 1500];
      let lastPullErr = null;
      for(let fullAttempt = 0; fullAttempt < 4; fullAttempt++){
        let r = null;
        for(let attempt=0; attempt<delays.length; attempt++){
          if(delays[attempt] > 0) await this._sleep(delays[attempt]);
          try{
            r = await this._json('api/state', { preserveTokenOn401: attempt < delays.length - 1, timeoutMs: 30000 });
          }catch(e){
            r = null;
          }
          if(this.kvBlocked()) return false;
          const gotRev = r && r.body ? (Number(r.body.rev) || 0) : 0;
          const hasMaster = !requireReferenceMaster || Boolean(r && r.body && r.body.db && r.body.db.meta && r.body.db.meta.referenceMaster);
          if(r && r.ok && r.body && r.body.db && (minRev <= 0 || gotRev >= minRev) && hasMaster) break;
        }
        if(!r){
          this.state='error'; this.message='The shared online state could not be read'; this.bump(); return false;
        }
        if(!r.ok || !r.body.db){
          if(r.status === 401){ this.state='idle'; this.message='Session ended — sign in again'; this.bump(); return false; }
          this.state='error'; this.message = r.body.error || `The shared online state could not be read (HTTP ${r.status})`; this.bump(); return false;
        }
        const baseRev = Number(r.body.rev) || 0;
        if((minRev > 0 && baseRev < minRev) ||
           (requireReferenceMaster && !(r.body.db.meta && r.body.db.meta.referenceMaster))){
          this.state='error'; this.message='The shared online state is not yet up to date; retry the refresh.'; this.bump(); return false;
        }
        let maxSeenRev = baseRev;
        const remoteDb = Object.assign({}, r.body.db);
        const paged = Array.isArray(r.body.pagedCollections) ? r.body.pagedCollections : [];
        let revMovedIncompatible = false;

        const fetchPage = async (name, offset, limit, minCount) => {
          const qs = `api/state/collection?name=${encodeURIComponent(name)}&offset=${offset}${limit ? `&limit=${limit}` : ''}`;
          let page = null;
          for(let pTry=0; pTry<pageDelays.length; pTry++){
            if(pageDelays[pTry] > 0) await this._sleep(pageDelays[pTry]);
            try{
              page = await this._json(qs, {
                preserveTokenOn401: pTry < pageDelays.length - 1,
                timeoutMs: 35000
              });
            }catch(e){
              page = null;
            }
            if(this.kvBlocked()) return page;
            if(page && page.ok && page.body && page.body.name === name && Array.isArray(page.body.records)){
              const pgRev = Number(page.body.rev) || 0;
              const pgTotal = Number(page.body.total);
              if(pgRev === baseRev) break;
              /* Revision-tolerant read: if another client saved an audit entry,
                 preference or record update (pgRev > baseRev) without shrinking
                 the collection below minCount, accept the page and catch up via
                 delta patches at the end instead of aborting sign-in. */
              if(pgRev > baseRev && Number.isFinite(pgTotal) && pgTotal >= minCount){
                maxSeenRev = Math.max(maxSeenRev, pgRev);
                break;
              }
              if(pgRev > baseRev){
                revMovedIncompatible = true;
                break;
              }
            }
          }
          return page;
        };

        const pullCollection = async (meta) => {
          if(!meta || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(String(meta.name||''))){
            throw new Error('The shared online state returned an invalid collection manifest');
          }
          let targetCount = Number(meta.count) || 0;
          const first = await fetchPage(meta.name, 0, 0, targetCount);
          if(!first) throw new Error(`The shared online collection ${meta.name} could not be read`);
          const firstRev = first.body ? (Number(first.body.rev) || 0) : -1;
          const firstTotal = first.body ? Number(first.body.total) : -1;
          if(!first.ok || !first.body || first.body.name !== meta.name || !Array.isArray(first.body.records) || firstRev < baseRev || (firstRev > baseRev && firstTotal < targetCount)){
            throw new Error((first.body && first.body.error) || 'The shared online state changed or a collection page failed during the read; retry the sync');
          }
          if(firstTotal > targetCount) targetCount = firstTotal;
          const records = [...first.body.records];
          if(!first.body.done){
            let offset = Number(first.body.nextOffset);
            if(!Number.isSafeInteger(offset) || offset <= 0){
              throw new Error(`The shared online collection ${meta.name} did not advance safely`);
            }
            const safeStep = Math.max(200, Math.floor(records.length * 0.75));
            while(offset < targetCount){
              /* Max 2 concurrent collection page requests so cold serverless
                 instances and KV shards are never overwhelmed simultaneously. */
              const waveOffsets = [];
              for(let w=0; w<2 && (offset + w * safeStep) < targetCount; w++){
                waveOffsets.push(offset + w * safeStep);
              }
              const wavePages = await Promise.all(waveOffsets.map(off => fetchPage(meta.name, off, safeStep, targetCount)));
              for(let w=0; w<wavePages.length; w++){
                const pg = wavePages[w];
                const expectedStart = waveOffsets[w];
                if(!pg){
                  throw new Error(`The shared online collection ${meta.name} could not be read`);
                }
                const pgRev = pg.body ? (Number(pg.body.rev) || 0) : -1;
                const pgTotal = pg.body ? Number(pg.body.total) : -1;
                if(!pg.ok || !pg.body || pg.body.name !== meta.name || !Array.isArray(pg.body.records) || pgRev < baseRev || (pgRev > baseRev && pgTotal < targetCount)){
                  throw new Error((pg.body && pg.body.error) || 'The shared online state changed or a collection page failed during the read; retry the sync');
                }
                if(pgTotal > targetCount) targetCount = pgTotal;
                if(offset !== expectedStart) break;
                records.push(...pg.body.records);
                if(pg.body.done){
                  offset = records.length;
                  break;
                }
                const next = Number(pg.body.nextOffset);
                if(!Number.isSafeInteger(next) || next <= offset){
                  throw new Error(`The shared online collection ${meta.name} did not advance safely`);
                }
                offset = next;
              }
              this.message = `Reading shared ${meta.name}: ${Math.min(offset, targetCount)} / ${targetCount}`;
            }
          }
          if(records.length < meta.count){
            throw new Error(`The shared online collection ${meta.name} was incomplete (${records.length} of ${meta.count})`);
          }
          remoteDb[meta.name] = records;
        };

        try{
          for(let i=0; i<paged.length; i++){
            await pullCollection(paged[i]);
          }
          this.adoptRemote(remoteDb, baseRev, r.body.saved);
          if(maxSeenRev > baseRev){
            await this._catchUpDeltasSince(baseRev);
          }
          if(this.kvBlocked()) return false;
          this.state='connected'; this.message='Reading the shared online source'; this.bump();
          return true;
        }catch(err){
          if(this.kvBlocked()) return false;
          lastPullErr = err;
          if((revMovedIncompatible || fullAttempt < 2) && fullAttempt < 3){
            await this._sleep(350 * (fullAttempt + 1));
            continue;
          }
          break;
        }
      }
      this.state='error';
      this.message=(lastPullErr && lastPullErr.message) || 'The shared online state could not be read';
      this.bump();
      return false;
    }finally{
      this._pulling = false;
    }
  },

  adoptRemote(db, rev, saved){
    const keep = (DB.db && DB.db.meta) || {};
    const prevPrefs = (DB.db && DB.db.personalPrefs && typeof DB.db.personalPrefs === 'object') ? DB.db.personalPrefs : {};
    const storedPrefs = (typeof DB.loadLocalPrefs === 'function' && DB.loadLocalPrefs()) || null;
    if((db.meta?.schema||0) > (APP.schema||0)){
      this.state='error'; this.message='The host holds a newer schema — update this device';
      this.bump(); return;
    }
    DB.db = db;
    DB.migrate();
    /* Merge local device personal preferences with server personalPrefs so
       theme, font, studio, scale and pack choices never reset on pullFull(). */
    const mergedPrefs = Object.assign({}, (storedPrefs && storedPrefs.personalPrefs) || {}, prevPrefs, DB.db.personalPrefs || {});
    for(const uidKey of Object.keys(mergedPrefs)){
      const locA = (storedPrefs && storedPrefs.personalPrefs && storedPrefs.personalPrefs[uidKey]) || {};
      const locB = prevPrefs[uidKey] || {};
      const rem = (db.personalPrefs && db.personalPrefs[uidKey]) || {};
      mergedPrefs[uidKey] = Object.assign({}, locA, locB, rem);
    }
    DB.db.personalPrefs = mergedPrefs;
    DB.db.meta = Object.assign({}, DB.db.meta, {serverRev:rev, serverSaved:saved, deviceLabel:keep.deviceLabel});
    if(typeof DB.persistState === 'function') DB.persistState();
    else { try{ Store.set(DB.KEY, JSON.stringify(DB.db)); }catch(e){} }
    this.rev = rev; this.saved = saved;
    this.rebase();
    APPX.dirty = false;
    if(typeof WTHEME !== 'undefined' && typeof WTHEME.syncCustomThemes === 'function') WTHEME.syncCustomThemes();
  },

  /* The single decision table for joining a shared online source. Kept pure so the
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
  captureShadow(){
    const shadow = {};
    for(const [c,val] of Object.entries(DB.db||{})){
      if(!Array.isArray(val)) continue;
      const m = {};
      for(const rec of val){ if(rec && rec.id!==undefined) m[rec.id] = JSON.stringify(rec); }
      shadow[c] = m;
    }
    shadow.__settings = { settings: JSON.stringify(DB.db.settings||{}) };
    const prefShadow = {};
    for(const [uidKey, pVal] of Object.entries((DB.db && DB.db.personalPrefs) || {})){
      if(pVal && typeof pVal === 'object') prefShadow[uidKey] = JSON.stringify(pVal);
    }
    shadow.__personalPrefs = prefShadow;
    shadow.__auditLen = ((DB.db && DB.db.audit) || []).length;
    return shadow;
  },

  rebase(){
    this._shadow = this.captureShadow();
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
          out.push({c, id, set: JSON.parse(now), before:{}});
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
      out.push({c:'settings', id:'settings', set:{ id:'settings', value: JSON.parse(sNow) }, before:{}});
    }
    /* personalPrefs syncs each user's own theme, font, studio, scale & pack choices */
    const pShadow = this._shadow.__personalPrefs || {};
    const curUser = typeof AUTH !== 'undefined' && AUTH.user ? AUTH.user : null;
    const canManageUsers = curUser && typeof RBAC !== 'undefined' && RBAC.has && RBAC.has(curUser, 'users.manage');
    for(const [uidKey, pVal] of Object.entries(db.personalPrefs || {})){
      if(!uidKey || !pVal || typeof pVal !== 'object') continue;
      if(curUser && !canManageUsers && uidKey !== curUser.id && uidKey.toLowerCase() !== String(curUser.username||'').toLowerCase()) continue;
      const pNow = JSON.stringify(pVal);
      if(pShadow[uidKey] !== pNow){
        out.push({c:'personalPrefs', id:uidKey, set: JSON.parse(pNow), before:{}});
      }
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
    /* Nothing to send yet (offline copy, or signed out): the register itself is
       the record, exactly as before. */
    if(!this.available() || !this.sessionToken || this._clinicalBusy || this._passwordBeforeWorkspace) return;
    if(this.kvBlocked()){
      this.holdWork({notSent:!this._inflight});
      if(this._holdFailure){ this.state='error'; this.message=this._holdFailure; this.bump(); }
      return;
    }
    if(this._pulling || (typeof REFERENCE_MASTER !== 'undefined' && (REFERENCE_MASTER.phase === 'uploading' || REFERENCE_MASTER.phase === 'loading'))) return;
    if(this._inflight){ this._queuedWhileInflight = true; return; }
    clearTimeout(this._timer);
    this._timer = setTimeout(()=>this.push(), 320);
  },

  async push(opts={}){
    if(this._pulling || !this.sessionToken || this._passwordBeforeWorkspace || (this._clinicalBusy && !opts.clinicalPreflight)) return;
    const held = this.loadOutbox();
    const username = (typeof AUTH !== 'undefined' && AUTH.user && AUTH.user.username) || null;
    if(held && held.username === username && (held.needsReview || held.replaySafe !== true)){
      this.state='error'; this.message='Held work requires review; a previous save may have been refused or its outcome is unknown. Newer changes may not be stored on this device.'; this.bump(); return;
    }
    if(this.kvBlocked()){
      this.holdWork({notSent:!this._inflight});
      if(this._holdFailure){ this.state='error'; this.message=this._holdFailure; this.bump(); }
      return;
    }
    if(typeof REFERENCE_MASTER !== 'undefined' && (REFERENCE_MASTER.phase === 'uploading' || REFERENCE_MASTER.phase === 'loading')) return;
    if(this._inflight){
      this._queuedWhileInflight = true;
      return this._pushPromise || undefined;
    }
    this._pushPromise = this._runPush();
    try{ return await this._pushPromise; }
    finally{ if(!this._inflight) this._pushPromise = null; }
  },

  /* Attempt to preserve unconfirmed work. A conflicting legacy queue or a
     storage failure must be reported; do not claim that a reload is safe. */
  holdWork(opts={}){
    const patches = this.patches();
    this._holdFailure = '';
    if(!patches.length) return 0; // Existing held work may not be in the current shadow.
    const username = (typeof AUTH !== 'undefined' && AUTH.user && AUTH.user.username) || null;
    const existing = this.loadOutbox();
    const raw = typeof Store !== 'undefined' && Store.get ? Store.get(SYNC_OUTBOX_KEY) : null;
    // A single legacy queue cannot safely combine accounts or conflicting edits.
    // Preserve it verbatim rather than overwrite work whose outcome is unknown.
    if(!username || (typeof Store !== 'undefined' && Store.durable === false) || (raw && !existing) ||
        (existing && (existing.username !== username || JSON.stringify(existing.patches) !== JSON.stringify(patches)))){
      this._holdFailure = 'An existing or unowned held queue was preserved; these newer changes are not safely stored on this device.';
      return 0;
    }
    if(existing){ this.outbox = existing; return existing.patches.length; }
    this.outbox = {patches, rev:this.rev, savedAt:new Date().toISOString(), authFailed:false, username,
      replaySafe:opts.notSent === true};
    if(!this.writeOutbox()){
      this._holdFailure = 'Device storage could not be confirmed; these changes may be lost on reload.';
      return 0;
    }
    return patches.length;
  },

  markHeldForReview(){
    const box = this.loadOutbox();
    const username = (typeof AUTH !== 'undefined' && AUTH.user && AUTH.user.username) || null;
    if(!box || !username || box.username !== username) return false;
    this.outbox = box; this.outbox.needsReview = true;
    return this.writeOutbox();
  },

  /* The legacy queue is not an offline vault or an idempotent command log.
     Replay only a single identifiable batch; preserve refused or uncertain
     outcomes for manual review rather than risking duplicate application. */
  async attemptOutbox(){
    if(this.kvBlocked() || this._clinicalBusy) return false;
    if(typeof REFERENCE_MASTER !== 'undefined' && (REFERENCE_MASTER.phase === 'uploading' || REFERENCE_MASTER.phase === 'loading')) return false;
    const box = this.loadOutbox();
    if(!box) return false;
    if(!this.sessionToken) return false;
    if(this._inflight || this._pulling) return false;
    /* Held work belongs to the account that typed it: a second person signing
       in on this tablet must never publish the first person's edits. */
    const signedIn = (typeof AUTH !== 'undefined' && AUTH.user && AUTH.user.username) || null;
    if(!box.username || !signedIn || box.username !== signedIn) return false;
    this.outbox = box;
    if(box.needsReview || box.replaySafe !== true || box.patches.length > 1200){
      this.state = 'error';
      this.message = 'Held work requires review before retry; its shared-save outcome is not confirmed.';
      this.bump(); return false;
    }
    // Persist an uncertainty marker before sending: a tab crash or lost
    // response must not cause the same batch to be replayed on next startup.
    this.outbox.needsReview = true;
    if(!this.writeOutbox()){
      this.state='error'; this.message='Could not safely mark held work before sending; no replay was attempted.';
      this.bump(); return false;
    }
    this._inflight = true;
    try{
      const chunk = 1200;
      let rev = this.rev;
      for(let i=0;i<box.patches.length;i+=chunk){
        const slice = box.patches.slice(i, i+chunk);
        const r = await this._json('api/state', {
          method:'PUT', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({patches: slice, baseRev: this.rev, opId:'op-out-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7), ts:new Date().toISOString()})
        });
        if(!r.ok){
          // Even a failure response may follow an unknown server outcome.
          this.outbox.needsReview = true;
          const durable = this.writeOutbox();
          this.state = 'error';
          this.message = ((r.body && r.body.error) || 'The shared online source did not confirm held work') +
            (durable ? ' Work is retained for review; it will not be retried automatically.' : ' Device storage is not confirmed; work may be lost on reload.');
          this.bump(); return false;
        }
        if(!r.body || !Number.isSafeInteger(r.body.rev) || !Array.isArray(r.body.rejected) || !Number.isSafeInteger(r.body.appliedCount) ||
            r.body.appliedCount + r.body.rejected.length !== slice.length || r.body.rejected.length){
          this.outbox.needsReview = true;
          const durable = this.writeOutbox();
          this.state = 'error';
          this.message = 'Held work was partly refused or not fully acknowledged; it has not been reported as saved.' +
            (durable ? ' Retained for review; no automatic replay.' : ' Device storage is not confirmed; work may be lost on reload.');
          this.bump(); return false;
        }
        rev = r.body.rev;
      }
      this.rev = rev;
      this.saved = new Date().toISOString();
      DB.db.meta = Object.assign({}, DB.db.meta, {serverRev:rev, serverSaved:this.saved});
      if(!this.clearOutbox(box)){
        this.state = 'error'; this.message = 'The shared source acknowledged the batch, but the held queue could not be safely cleared. Review it before retrying.';
        this.bump(); return false;
      }
      this.state = 'connected';
      this.message = 'Held work saved to the shared online source';
      this.bump();
      return true;
    }catch(e){
      // The request might have committed before the response was lost.
      this.outbox.needsReview = true;
      const durable = this.writeOutbox();
      this.state = 'error';
      this.message = 'The held batch has an unknown shared-save outcome; do not replay it automatically.' +
        (durable ? ' Retained for review.' : ' Device storage is not confirmed; work may be lost on reload.');
      this.bump(); return false;
    }finally{
      this._inflight = false;
    }
  },

  async _runPush(){
    if(this._inflight || this._pulling || !this.sessionToken) return;
    if(typeof REFERENCE_MASTER !== 'undefined' && (REFERENCE_MASTER.phase === 'uploading' || REFERENCE_MASTER.phase === 'loading')) return;
    const previousShadow = this._shadow;
    const sentShadow = this.captureShadow();
    const rejected = [];
    const patches = this.patches();
    if(!patches.length){ APPX.dirty = false; return; }
    const held = this.loadOutbox();
    const username = (typeof AUTH !== 'undefined' && AUTH.user && AUTH.user.username) || null;
    if(held && held.username === username && JSON.stringify(held.patches) !== JSON.stringify(patches)){
      this.state='error'; this.message='Held work differs from the current changes. It was preserved; no save was attempted.'; this.bump(); return;
    }
    if(held && held.username === username && !this.markHeldForReview()){
      this.state='error'; this.message='Could not safely mark held work before sending; no save was attempted.'; this.bump(); return;
    }
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
          body: JSON.stringify({patches: slice, baseRev: this.rev, opId: 'op-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),
                                ts: new Date().toISOString()})
        });
        if(!r.ok){
          const held = this.holdWork();
          const retained = held && this.markHeldForReview();
          this.state = 'error';
          this.message = ((r.body && r.body.error) || 'The shared online source did not confirm the save') +
            (retained ? ` ${held} change${held===1?' is':'s are'} retained for review; no automatic replay.` : ` ${this._holdFailure || 'Device storage could not be confirmed; changes may be lost on reload.'}`);
          this.bump(); return;
        }
        if(!r.body || !Number.isSafeInteger(r.body.rev) || !Array.isArray(r.body.rejected) || !Number.isSafeInteger(r.body.appliedCount) ||
           r.body.appliedCount + r.body.rejected.length !== slice.length){
          throw new Error('The shared source returned an incomplete save acknowledgement.');
        }
        // A PUT acknowledges our edits, not intervening remote revisions.
        if(r.body.rev === rev+1) rev = r.body.rev;
        else if(r.body.rev > rev) this.pendingRemote = true;
        merged += (r.body.merged||0);
        rejected.push(...(r.body.rejected||[]));
      }
      // HTTP 200 may include per-row refusals. They remain visibly unsaved;
      // never bless them into the confirmed shadow or preflight a decision.
      for(const p of rejected){
        if(p.c==='settings'){sentShadow.__settings=previousShadow.__settings;continue;}
        if(p.c==='audit'){sentShadow.__auditLen=previousShadow.__auditLen;continue;}
        const collection=p.c==='personalPrefs'?'__personalPrefs':p.c;
        const map=sentShadow[collection]=sentShadow[collection]||{};
        if(Object.hasOwn(previousShadow[collection]||{},p.id))map[p.id]=previousShadow[collection][p.id];
        else delete map[p.id];
      }
      this.rev = rev;
      this.saved = new Date().toISOString();
      DB.db.meta = Object.assign({}, DB.db.meta, {serverRev:rev, serverSaved:this.saved});
      if(typeof DB.persistState === 'function') DB.persistState();
      else { try{ Store.set(DB.KEY, JSON.stringify(DB.db)); }catch(e){} }
      /* Commit ONLY the shadow that was actually transmitted so any concurrent
         local edits made while PUT /api/state was in flight remain queued! */
      this._shadow = sentShadow;
      this.lastPatchAt = this.saved;
      const remaining = this.patches();
      APPX.dirty = remaining.length > 0;
      this._retry = 0;
      this.lastMerged = merged;
      let retained = false;
      if(rejected.length){
        const held = this.holdWork();
        retained = !!held && this.markHeldForReview();
      } else {
        // Only clear an exact, same-account batch. Other held work is untouched.
        this.clearOutbox({patches});
      }
      this.state = rejected.length ? 'error' : merged ? 'merge' : 'connected';
      this.message = rejected.length
        ? `${rejected.length} change${rejected.length===1?' was':'s were'} refused by the shared source and remain unsaved (${[...new Set(rejected.map(p=>p.reason))].join(', ')}). ${retained?'Retained for review; no automatic replay.':(this._holdFailure || 'Device storage could not be confirmed; changes may be lost on reload.')}`
        : merged ? `Saved · ${merged} overlapping field${merged===1?'':'s'} reconciled automatically`
        : 'Saved to the shared online source';
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
      const held = this.holdWork();
      const retained = held && this.markHeldForReview();
      this.state='error';
      this.message = retained
        ? `The shared save outcome is unknown — ${held} change${held===1?' is':'s are'} retained for review; no automatic replay.`
        : `The shared save outcome is unknown. ${this._holdFailure || 'Device storage could not be confirmed; changes may be lost on reload.'}`;
      this.bump();
    }finally{
      this._inflight = false;
      if(before==='merge' && this.state==='saving') this.state='connected';
      if(this._queuedWhileInflight && this.sessionToken && !this._pulling && !this.kvBlocked()){
        this._queuedWhileInflight = false;
        // A partial or uncertain result must not automatically replay work,
        // even when other edits were made while the request was in flight.
        const held = this.loadOutbox();
        const username = (typeof AUTH !== 'undefined' && AUTH.user && AUTH.user.username) || null;
        if(!(held && held.username === username && (held.needsReview || held.replaySafe !== true)) && this.patches().length > 0) await this._runPush();
      }
    }
  },

  /* ---- live reads ------------------------------------------------------ */
  startPolling(){
    this.stopPolling();
    const base = this.pendingRemote ? 2000 : 10000;
    const backoff = Math.min(60000, base * Math.pow(2, Math.min(3, this._pollErrStreak || 0)));
    const quotaWait = this.kvBlocked() ? this._kvRetryAt - Date.now() : 0;
    this._poll = setInterval(()=>this.tick(), Math.max(backoff, quotaWait));
  },
  stopPolling(){ if(this._poll) clearInterval(this._poll); this._poll=null; },
  pollFailed(){
    const prevStreak = this._pollErrStreak || 0;
    this._pollErrStreak = Math.min(4, prevStreak + 1);
    if(this._poll && this._pollErrStreak !== prevStreak) this.startPolling();
  },

  async tick(){
    if(!this.sessionToken || this._inflight || this._pulling || this._clinicalBusy || this._ticking || document.hidden || this.kvBlocked()) return;
    const held = this.loadOutbox();
    const username = (typeof AUTH !== 'undefined' && AUTH.user && AUTH.user.username) || null;
    if(held && username && held.username === username){
      this.state='error'; this.message='Held work is not confirmed by the shared source and requires review before continuing.'; this.bump(); return;
    }
    this._ticking = true;
    try{
      if(APPX.dirty){ await this.push(); }
      if(this._inflight || this._pulling || !this.sessionToken || this.kvBlocked()) return;
      const r = await this._json(`api/state?since=${this.rev}`);
      if(!r || !r.ok || !r.body){
        this.pollFailed();
        return;
      }
      if(this._pollErrStreak){
        this._pollErrStreak = 0;
        if(this._poll) this.startPolling();
      }
      if(r.body.unchanged){
        if(this.state !== 'connected' && this.state !== 'merge'){
          this.state = 'connected';
          this.message = 'Connected to the shared online source';
          this.bump();
        }
        return;
      }
      if(Array.isArray(r.body.patches)){
        this.applyPatchList(r.body.patches);
        this.rev = r.body.rev; this.saved = r.body.saved;
        DB.db.meta = Object.assign({}, DB.db.meta, {serverRev:r.body.rev, serverSaved:r.body.saved});
        if(typeof DB.persistState === 'function') DB.persistState();
        this.reconcileCalls();
        this.softRefresh();
        return;
      }
      if(r.body.partial){
        this.applyDelta(r.body);
        this.rev = r.body.rev; this.saved = r.body.saved;
        DB.db.meta = Object.assign({}, DB.db.meta, {serverRev:r.body.rev, serverSaved:r.body.saved});
        this.reconcileCalls();
        this.softRefresh();
        return;
      }
      if(r.body.db){
        /* CRITICAL: Never pass a split base snapshot with pagedCollections directly
           into adoptRemote(), or large paged arrays (patients/visits/pdcas) get wiped! */
        if(Array.isArray(r.body.pagedCollections) && r.body.pagedCollections.length > 0){
          const ok = await this.pullFull({ minRev: r.body.rev || 0 });
          if(ok) this.softRefresh();
          return;
        }
        this.adoptRemote(r.body.db, r.body.rev, r.body.saved);
        this.softRefresh();
        return;
      }
    }catch(e){
      /* Dropped connections back off just like HTTP failures. A slow poll must
         also finish before another tick can start. */
      this.pollFailed();
    }finally{
      this._ticking = false;
    }
  },

  /* A command acknowledgement is NOT a full snapshot. Rebase only those
     exact rows against their confirmed shadow, preserving unrelated dirty
     rows and edits made while the command was in flight. The command never
     clears an outbox or advances past unseen remote revisions. */
  applyCommandPatches(patches){
    const protectedPatient=new Set(['status','careCycleId','cycleStartedAt','enrolledAt','enrolDate','enrolledBy','enrolledDecisionAt',
      'enrolmentOfficeConfirmed','discharge','dischargedAt','dischargedBy','dischargeEvidence','assessmentKind','intake','carePlan',
      'countyId','areaId','nationalId','dischargeSummary','dischargeProtocol','dischargeRecommendation','dischargeReferral']);
    for(const patch of patches||[]){
      if(!patch||typeof patch.c!=='string')continue;
      if(['settings','personalPrefs','audit'].includes(patch.c)){this.applyPatchList([patch]);continue;}
      const col=DB.db[patch.c]=Array.isArray(DB.db[patch.c])?DB.db[patch.c]:[];
      const i=col.findIndex(r=>r?.id===patch.id),local=i<0?{}:col[i];
      let before={};try{before=JSON.parse(this._shadow[patch.c]?.[patch.id]||'{}');}catch(e){}
      const map=this._shadow[patch.c]=this._shadow[patch.c]||{};
      if(patch.del){if(i>=0)col.splice(i,1);delete map[patch.id];continue;}
      const server={...before,...patch.set,id:patch.id};
      for(const k of Object.keys(server))if(server[k]===null)delete server[k];
      const rebased={...server};
      const owned=(typeof CARE_WORKFLOW!=='undefined'&&CARE_WORKFLOW.OWNED.includes(patch.c))||
        (typeof DEVOTION_RULES!=='undefined'&&DEVOTION_RULES.OWNED.includes(patch.c));
      // A local deletion of an ordinary row is still pending, even if that
      // same row was updated remotely. Clinical history is never deleted.
      if(!owned&&patch.c!=='patients'&&i<0&&Object.hasOwn(map,patch.id)){map[patch.id]=JSON.stringify(server);continue;}
      const newCycle=patch.c==='patients'&&server.careCycleId&&server.careCycleId!==before.careCycleId;
      for(const k of owned?[]:new Set([...Object.keys(before),...Object.keys(local)])){
        if(k==='id'||patch.c==='patients'&&protectedPatient.has(k)||newCycle&&['clinical','baselineWeightKg','master','programDays','plannedDays'].includes(k))continue;
        if(JSON.stringify(local[k])!==JSON.stringify(before[k])){
          if(local[k]===undefined)delete rebased[k];else rebased[k]=local[k];
        }
      }
      if(i<0)col.push(rebased);else col[i]=rebased;
      map[patch.id]=JSON.stringify(server);
    }
  },

  applyPatchList(patches){
    if(!DB.db || !Array.isArray(patches)) return;
    for(const p of patches){
      if(!p || typeof p.c !== 'string') continue;
      if(p.c === 'settings'){
        if(p.set && p.set.value && typeof p.set.value === 'object'){
          DB.db.settings = Object.assign({}, DB.db.settings || {}, p.set.value);
          this._shadow.__settings = { settings: JSON.stringify(DB.db.settings) };
          if(typeof WTHEME !== 'undefined' && typeof WTHEME.syncCustomThemes === 'function') WTHEME.syncCustomThemes();
        }
        continue;
      }
      if(p.c === 'personalPrefs'){
        if(p.id && p.set && typeof p.set === 'object'){
          DB.db.personalPrefs = DB.db.personalPrefs || {};
          DB.db.personalPrefs[p.id] = Object.assign({}, DB.db.personalPrefs[p.id] || {}, p.set);
          this._shadow.__personalPrefs = this._shadow.__personalPrefs || {};
          this._shadow.__personalPrefs[p.id] = JSON.stringify(DB.db.personalPrefs[p.id]);
        }
        continue;
      }
      if(p.c === 'audit'){
        DB.db.audit = Array.isArray(DB.db.audit) ? DB.db.audit : [];
        if(p.set && !DB.db.audit.some(a => a && a.hash === p.set.hash && a.seq === p.set.seq)){
          DB.db.audit.push(p.set);
        }
        this._shadow.__auditLen = DB.db.audit.length;
        continue;
      }
      // Delta reads and response-loss replays use the same exact-row rebase
      // as command acknowledgements. Rebasing an entire touched collection
      // would silently acknowledge unrelated home visits typed meanwhile.
      this.applyCommandPatches([p]);
    }
    if(typeof AUTH !== 'undefined' && AUTH.user && Array.isArray(DB.db.users)){
      const updatedSelf = DB.db.users.find(u => u && (u.id === AUTH.user.id || String(u.username||'').toLowerCase() === String(AUTH.user.username||'').toLowerCase()));
      if(updatedSelf) AUTH.user = updatedSelf;
    }
  },

  applyDelta(body){
    const touched = new Set();
    for(const [c, records] of Object.entries(body.collections||{})){
      for(const rec of records)this.applyCommandPatches([{c,id:rec.id,set:rec}]);
      touched.add(c);
    }
    for(const [c, ids] of Object.entries(body.removed||{})){
      this.applyCommandPatches(ids.map(id=>({c,id,del:true})));
      touched.add(c);
    }
    if(typeof DB.persistState === 'function') DB.persistState();
    else { try{ Store.set(DB.KEY, JSON.stringify(DB.db)); }catch(e){} }
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
    this.message = 'Updated from the shared online source';
    this.bump();
    try{ render(); }catch(e){}
  },
  flushPending(){
    if(this.pendingRemote){ this.pendingRemote = false; try{ render(); }catch(e){} }
  },
  /* An answered, declined or ended call must reach the other person without a
     refresh: the same reconciliation runs after every adopted remote change. */
  reconcileCalls(){
    try{ if(typeof CALLING!=='undefined' && CALLING.reconcile) CALLING.reconcile(); }catch(e){}
  },

  bump(){
    APPX.sync = {state:this.state, rev:this.rev, saved:this.saved, message:this.message, latency:this.latency, merged:this.lastMerged};
    try{ const el=document.querySelector('[data-sync-chip]'); if(el) el.outerHTML = this.chip(); }catch(e){}
    try{ if(typeof LIVE !== 'undefined' && typeof LIVE.syncFromHost === 'function') LIVE.syncFromHost(); }catch(e){}
  },

  label(){
    /* The chip must never read "unconfirmed" while work is actually held: the
       clinic needs to know whether a visit is safely on the shared record or
       waiting here. */
    if(this.state==='error' && this.heldOutbox() > 0) return 'Held on this device';
    if(this.offline()) return 'Offline on this device';
    if(this.state==='device') return 'Offline/static mode';
    return ({ idle:'Connecting', probing:'Connecting', connected:'Shared online source', device:'Offline/static mode',
      saving:'Saving', merge:'Reconciled', error:'Online save unconfirmed' })[this.state] || 'Unknown';
  },
  tone(){
    if(this.offline()) return 'warn';
    if(this.state==='connected'||this.state==='merge') return 'ok';
    if(this.state==='saving'||this.state==='probing'||this.state==='idle') return 'neutral';
    if(this.state==='device') return 'warn';
    return 'crit';
  },
  /* True when the browser itself says the device has no network. The service
     worker can still serve the cached shell, so the console keeps working; the
     point of this flag is that nothing is claimed as shared until it is. */
  offline(){ try{ return typeof navigator!=='undefined' && navigator.onLine === false; }catch(e){ return false; } },
  detail(){
    if(this.offline()) return 'No network. Secure offline clinical access is not available; do not rely on this device to retain or sync clinical work.';
    if(this.state==='connected') return `Revision ${this.rev} · live`;
    if(this.state==='merge') return `Revision ${this.rev} · ${this.lastMerged} field(s) reconciled`;
    if(this.state==='saving') return 'Writing to the online source';
    if(this.state==='device') return this.available() ? 'Online source unavailable — no shared save is claimed' : 'Offline/static mode — local records only';
    if(this.state==='error'){
      const held = this.heldOutbox();
      if(held) return this.message || `${held} change${held===1?' is':'s are'} held on this device and will be retried`;
      if(this.offline()) return 'This device has no network. Records stay here until it reconnects.';
      return this.message;
    }
    if(this.state==='idle' && this.offline()) return 'This device has no network. Records stay here until it reconnects.';
    return this.message || 'Checking the shared online source';
  },
  /* Called by the shell when the browser reports the network has come back, so
     a held visit is replayed at once rather than at the next poll. */
  async retryNow(){
    if(!this.sessionToken || !this.available() || this._inflight || this._pulling) return false;
    try{
      if(APPX.dirty) await this.push();
      await this.attemptOutbox();
      const held = this.loadOutbox();
      const username = (typeof AUTH !== 'undefined' && AUTH.user && AUTH.user.username) || null;
      if(held && username && held.username === username) return false;
      await this.tick();
      this.startPolling();
      return true;
    }catch(e){ return false; }
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
  body += `<div class="sync-row"><span>Shared revision</span><b class="mono">${s.rev}</b></div>
    <div class="sync-row"><span>Round trip</span><b>${s.latency!=null? s.latency+' ms':'—'}</b></div>
    <div class="sync-row"><span>Last confirmed save</span><b>${esc((s.saved||'not yet').replace('T',' ').slice(0,19))}</b></div>
    <p class="small muted" style="margin:10px 0 0;text-align:left">Every PC, tablet and other client reads the same
    shared online source. Edits made on two clients are merged field by field by the online service; when both clients change the
    <b>same</b> field the later edit may be kept and recorded in the merge journal. Offline drafts and held work are not a secure or lossless clinical vault; reconnect and verify the server accepted each change.</p>`;
  if(s.state==='device'){
    body += `<div class="alert warn" style="margin-top:12px">${ic('wifi',16)}<div><b>Offline/static mode</b>
      <span class="small">This local mode is not an approved secure clinical vault and does not provide managed-device enforcement or a shared save. Use synthetic demonstration data only.</span></div></div>
      <button class="btn btn-primary btn-sm" style="margin-top:10px" data-act="sync-retry">Check again</button>`;
  }
  if(s.state==='error'){
    body += `<div class="alert crit" style="margin-top:12px">${ic('alert',16)}<div><b>${esc(s.message)}</b>
      <span class="small">No shared save is claimed while the online source is unavailable. Reconnect and retry before treating a browser change as confirmed.</span></div></div>
      <button class="btn btn-primary btn-sm" style="margin-top:10px" data-act="sync-retry">Retry now</button>`;
  }
  openModal({title:'Shared online source', narrow:true, body,
    footer:`<button class="btn btn-ghost" data-act="close-modal">Close</button>
      <button class="btn btn-ghost" data-act="go" data-v="mergejournal">Merge journal</button>`});
}

/* Merge journal page: the audit view of automatic reconciliation. */
function renderMergeJournal(user){
  if(!RBAC.has(user,'system.audit') && !RBAC.has(user,'audit.view')) return deniedPanel('system.audit');
  const rows = SYNC.journal || null;
  const body = rows===null
    ? emptyState('Read the journal from the host','The journal is held on the online source, not in this browser.','refresh',
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
