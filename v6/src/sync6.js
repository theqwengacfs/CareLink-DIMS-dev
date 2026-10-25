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

const SYNC = {
  /* idle | probing | connected | device | saving | merge | error */
  state:'idle', rev:0, saved:null, message:'', latency:null,
  sessionToken:null, server:null, authError:null,
  lastMerged:0, lastPatchAt:null, pendingRemote:false,
  _timer:null, _inflight:false, _poll:null, _shadow:{}, _retry:0,

  available(){
    try{
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

  async _json(url, opts={}){
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
      const reqInit = Object.assign({cache:'no-store'}, fetchOpts, {headers});
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
    if(r.status === 401 && this.sessionToken && !preserveTokenOn401 && !skipAuthHeader){
      /* The host ended the session (idle window, revocation or restart). */
      this.storeToken(null);
      if(typeof SESSION !== 'undefined' && AUTH.user) SESSION.serverExpired();
    }
    return {status:r.status, ok:r.ok, body};
  },

  async login(username, password, device){
    clearTimeout(this._timer);
    this.stopPolling();
    const loginPayload = JSON.stringify({username, password, device: device || String(navigator.userAgent||'').slice(0,120)});
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
      this.storeToken(r.body.token);
      this.rev = r.body.rev || 0;
      this.state = 'connected';
      this.message = 'Signed in on the shared online source';
      this.authError = null;
      this.bump();
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
    if(this.sessionToken){
      try{ await this._json('api/auth/logout', {method:'POST', headers:{'Content-Type':'application/json'}, body:'{}', timeoutMs:6000}); }catch(e){}
    }
    this.storeToken(null);
    this._shadow = {};
    this.stopPolling();
    this.state = 'idle';
    this.bump();
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
        ? 'The shared online source is unavailable — no local copy is being presented as a live save'
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
    this.startPolling();
  },

  async _sleep(ms){
    await new Promise(resolve => setTimeout(resolve, ms));
  },

  _idbCacheKey(){
    try{
      const loc = typeof location !== 'undefined' ? `${location.origin || ''}${location.pathname || ''}` : 'default';
      return `carelink_cloud_snap_v6:${loc}`;
    }catch(e){ return 'carelink_cloud_snap_v6:default'; }
  },

  async _idbOpen(){
    if(typeof indexedDB === 'undefined' || !indexedDB || typeof indexedDB.open !== 'function') return null;
    return await new Promise((resolve) => {
      try{
        const req = indexedDB.open('carelink_sync_idb_v6', 1);
        req.onupgradeneeded = () => {
          try{
            const db = req.result;
            if(!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots');
          }catch(e){}
        };
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      }catch(e){ resolve(null); }
    });
  },

  async _idbReadSnapshot(){
    const idb = await this._idbOpen();
    if(!idb) return null;
    return await new Promise((resolve) => {
      try{
        const tx = idb.transaction('snapshots', 'readonly');
        const st = tx.objectStore('snapshots');
        const req = st.get(this._idbCacheKey());
        req.onsuccess = () => { try{ idb.close(); }catch(e){} resolve(req.result || null); };
        req.onerror = () => { try{ idb.close(); }catch(e){} resolve(null); };
      }catch(e){ try{ idb.close(); }catch(_){} resolve(null); }
    });
  },

  _idbWriteSnapshot(dbObj, rev, saved){
    this._idbOpen().then((idb) => {
      if(!idb) return;
      try{
        const tx = idb.transaction('snapshots', 'readwrite');
        tx.objectStore('snapshots').put({ rev: Number(rev)||0, saved: saved||null, at: Date.now(), db: dbObj }, this._idbCacheKey());
        tx.oncomplete = () => { try{ idb.close(); }catch(e){} };
        tx.onerror = () => { try{ idb.close(); }catch(e){} };
      }catch(e){ try{ idb.close(); }catch(_){} }
    }).catch(() => {});
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

  async _tryCachedDeltaPull(minRev, requireReferenceMaster){
    const snap = await this._idbReadSnapshot();
    if(!snap || !snap.db || !snap.rev) return false;
    if(requireReferenceMaster && !(snap.db.meta && snap.db.meta.referenceMaster)) return false;
    try{
      const d = await this._json(`api/state?since=${snap.rev}&deltaOnly=1`, { timeoutMs: 10000, preserveTokenOn401: true });
      if(!d || !d.ok || !d.body || d.body.deltaMiss) return false;
      const gotRev = Number(d.body.rev) || 0;
      if(minRev > 0 && gotRev < minRev) return false;
      if(d.body.unchanged){
        if(gotRev !== Number(snap.rev)) return false;
        if(d.body.saved && snap.saved && d.body.saved !== snap.saved) return false;
        this.adoptRemote(Object.assign({}, snap.db), gotRev || snap.rev, d.body.saved || snap.saved);
        this.state = 'connected';
        this.message = 'Reading the shared online source';
        this.bump();
        return true;
      }
      if(Array.isArray(d.body.patches)){
        this.adoptRemote(Object.assign({}, snap.db), snap.rev, snap.saved);
        if(d.body.patches.length) this.applyPatchList(d.body.patches);
        this.rev = gotRev || snap.rev;
        this.saved = d.body.saved || snap.saved;
        DB.db.meta = Object.assign({}, DB.db.meta, { serverRev: this.rev, serverSaved: this.saved });
        this.rebase();
        this._idbWriteSnapshot(DB.db, this.rev, this.saved);
        this.state = 'connected';
        this.message = 'Reading the shared online source';
        this.bump();
        return true;
      }
    }catch(e){}
    return false;
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
      const gotRev = first && first.body ? (Number(first.body.rev) || 0) : 0;
      if(first && first.ok && first.body && first.body.fastPack && typeof first.body.part0 === 'string' && (minRev <= 0 || gotRev >= minRev)){
        break;
      }
    }
    if(!first || !first.ok || !first.body || !first.body.fastPack || typeof first.body.part0 !== 'string'){
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
          if(pr && pr.ok && pr.body && typeof pr.body.data === 'string'){
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
      if(!unpacked || !unpacked.db || typeof unpacked.db !== 'object') return null;
      if(requireReferenceMaster && !(unpacked.db.meta && unpacked.db.meta.referenceMaster)) return null;
      this.adoptRemote(unpacked.db, unpacked.rev || packRev, unpacked.saved || first.body.saved);
      await this._catchUpDeltasSince(unpacked.rev || packRev);
      this._idbWriteSnapshot(DB.db, this.rev, this.saved);
      this.state = 'connected';
      this.message = 'Reading the shared online source';
      this.bump();
      return true;
    }catch(e){
      return null;
    }
  },

  async pullFull(opts={}){
    const minRev = Number(opts && opts.minRev) || 0;
    const requireReferenceMaster = Boolean(opts && opts.requireReferenceMaster);
    const inlineState = opts && opts.inlineState && typeof opts.inlineState === 'object' ? opts.inlineState : null;
    /* If POST /api/auth/login already included the complete non-paged Primary
       state snapshot, adopt it directly with zero extra round-trip or replica lag. */
    if(!requireReferenceMaster && inlineState && inlineState.db && (!Array.isArray(inlineState.pagedCollections) || inlineState.pagedCollections.length === 0)){
      this.adoptRemote(Object.assign({}, inlineState.db), inlineState.rev || minRev, inlineState.saved);
      this._idbWriteSnapshot(DB.db, this.rev, this.saved);
      this.state='connected'; this.message='Reading the shared online source'; this.bump();
      return true;
    }

    clearTimeout(this._timer);
    this._pulling = true;
    try{
      /* 1. Instant IndexedDB snapshot + delta check (<150 ms on repeat sign-ins) */
      if(await this._tryCachedDeltaPull(minRev, requireReferenceMaster)){
        return true;
      }

      /* 2. Fast compressed 2-part stream (~4 MB gzip instead of ~73 MB raw JSON) */
      const fastOk = await this._tryFastPackPull(minRev, requireReferenceMaster);
      if(fastOk === true) return true;

      /* 3. Controlled-concurrency, revision-tolerant paged collection loader */
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
          this._idbWriteSnapshot(DB.db, this.rev, this.saved);
          this.state='connected'; this.message='Reading the shared online source'; this.bump();
          return true;
        }catch(err){
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
    if(!this.available() || !this.sessionToken) return;
    if(this._pulling || (typeof REFERENCE_MASTER !== 'undefined' && (REFERENCE_MASTER.phase === 'uploading' || REFERENCE_MASTER.phase === 'loading'))) return;
    if(this._inflight){ this._queuedWhileInflight = true; return; }
    clearTimeout(this._timer);
    this._timer = setTimeout(()=>this.push(), 320);
  },

  async push(){
    if(this._pulling || !this.sessionToken) return;
    if(typeof REFERENCE_MASTER !== 'undefined' && (REFERENCE_MASTER.phase === 'uploading' || REFERENCE_MASTER.phase === 'loading')) return;
    if(this._inflight){
      this._queuedWhileInflight = true;
      return this._pushPromise || undefined;
    }
    this._pushPromise = this._runPush();
    try{ return await this._pushPromise; }
    finally{ if(!this._inflight) this._pushPromise = null; }
  },

  async _runPush(){
    if(this._inflight || this._pulling || !this.sessionToken) return;
    if(typeof REFERENCE_MASTER !== 'undefined' && (REFERENCE_MASTER.phase === 'uploading' || REFERENCE_MASTER.phase === 'loading')) return;
    const sentShadow = this.captureShadow();
    const patches = this.patches();
    if(!patches.length){ APPX.dirty = false; return; }
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
          this.message = r.body.error || 'The shared online source refused the save';
          this.bump(); this._inflight=false; return;
        }
        rev = r.body.rev; merged += (r.body.merged||0);
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
      this.state = merged ? 'merge' : 'connected';
      this.message = merged
        ? `Saved · ${merged} overlapping field${merged===1?'':'s'} reconciled automatically`
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
      this.state='error';
      this.message='The shared online source is unreachable — the change is held on this device and will be retried';
      this.bump();
    }finally{
      this._inflight = false;
      if(before==='merge' && this.state==='saving') this.state='connected';
      if(this._queuedWhileInflight && this.sessionToken && !this._pulling){
        this._queuedWhileInflight = false;
        if(this.patches().length > 0) await this._runPush();
      }
    }
  },

  /* ---- live reads ------------------------------------------------------ */
  startPolling(){
    this.stopPolling();
    const base = this.pendingRemote ? 2000 : 10000;
    const backoff = Math.min(60000, base * Math.pow(2, Math.min(3, this._pollErrStreak || 0)));
    this._poll = setInterval(()=>this.tick(), backoff);
  },
  stopPolling(){ if(this._poll) clearInterval(this._poll); this._poll=null; },

  async tick(){
    if(!this.sessionToken || this._inflight || this._pulling || document.hidden) return;
    if(APPX.dirty){ await this.push(); }
    if(this._inflight || this._pulling || !this.sessionToken) return;
    try{
      const r = await this._json(`api/state?since=${this.rev}`);
      if(!r || !r.ok || !r.body){
        const prevStreak = this._pollErrStreak || 0;
        this._pollErrStreak = Math.min(4, prevStreak + 1);
        if(this._poll && this._pollErrStreak !== prevStreak) this.startPolling();
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
        this.softRefresh();
        return;
      }
      if(r.body.partial){
        this.applyDelta(r.body);
        this.rev = r.body.rev; this.saved = r.body.saved;
        DB.db.meta = Object.assign({}, DB.db.meta, {serverRev:r.body.rev, serverSaved:r.body.saved});
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
    }catch(e){ /* a dropped poll is not an error worth showing */ }
  },

  applyPatchList(patches){
    if(!DB.db || !Array.isArray(patches)) return;
    const touchedArrays = new Set();
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
      if(!Array.isArray(DB.db[p.c])) DB.db[p.c] = [];
      const col = DB.db[p.c];
      const idx = col.findIndex(x => x && x.id === p.id);
      if(p.del){
        if(idx >= 0) col.splice(idx, 1);
        touchedArrays.add(p.c);
        continue;
      }
      if(idx < 0){
        col.push(Object.assign({}, p.set || {}, { id: p.id }));
      } else {
        const cur = col[idx];
        for(const [k, v] of Object.entries(p.set || {})){
          if(v === null) delete cur[k];
          else cur[k] = v;
        }
      }
      touchedArrays.add(p.c);
    }
    for(const c of touchedArrays){
      const m = {};
      for(const rec of (DB.db[c]||[])) if(rec && rec.id!==undefined) m[rec.id] = JSON.stringify(rec);
      this._shadow[c] = m;
    }
    if(typeof AUTH !== 'undefined' && AUTH.user && Array.isArray(DB.db.users)){
      const updatedSelf = DB.db.users.find(u => u && (u.id === AUTH.user.id || String(u.username||'').toLowerCase() === String(AUTH.user.username||'').toLowerCase()));
      if(updatedSelf) AUTH.user = updatedSelf;
    }
  },

  applyDelta(body){
    const touched = new Set();
    for(const [c, records] of Object.entries(body.collections||{})){
      const list = DB.db[c] = Array.isArray(DB.db[c]) ? DB.db[c] : [];
      for(const rec of records){
        const i = list.findIndex(x=>x && x.id===rec.id);
        if(i>=0){
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
    if(typeof DB.persistState === 'function') DB.persistState();
    else { try{ Store.set(DB.KEY, JSON.stringify(DB.db)); }catch(e){} }
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
    this.message = 'Updated from the shared online source';
    this.bump();
    try{ render(); }catch(e){}
  },
  flushPending(){
    if(this.pendingRemote){ this.pendingRemote = false; try{ render(); }catch(e){} }
  },

  bump(){
    APPX.sync = {state:this.state, rev:this.rev, saved:this.saved, message:this.message, latency:this.latency, merged:this.lastMerged};
    try{ const el=document.querySelector('[data-sync-chip]'); if(el) el.outerHTML = this.chip(); }catch(e){}
    try{ if(typeof LIVE !== 'undefined' && typeof LIVE.syncFromHost === 'function') LIVE.syncFromHost(); }catch(e){}
  },

  label(){
    return ({ idle:'Connecting', probing:'Connecting', connected:'Shared online source', device:'Offline/static mode',
      saving:'Saving', merge:'Reconciled', error:'Online save unconfirmed' })[this.state] || 'Unknown';
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
    if(this.state==='saving') return 'Writing to the online source';
    if(this.state==='device') return this.available() ? 'Online source unavailable — no shared save is claimed' : 'Offline/static mode — local records only';
    if(this.state==='error') return this.message;
    return this.message || 'Checking the shared online source';
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
    <p class="small muted" style="margin:10px 0 0;text-align:justify">Every PC, tablet and other client reads the same
    shared online source. Edits made on two clients are merged field by field by the online service; when both clients change the
    <b>same</b> field the later edit is kept and both values are written to the merge journal. Nothing is overwritten
    without a record of it, and no one is asked to choose between two copies.</p>`;
  if(s.state==='device'){
    body += `<div class="alert warn" style="margin-top:12px">${ic('wifi',16)}<div><b>Offline/static mode</b>
      <span class="small">This explicitly offline copy keeps records on this device only. It is not a shared online save and is not a substitute for the Vercel/KV installation.</span></div></div>
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
