/* ============================================================
   calling6.js — Team Chat audio & video calling (CareLink v6.9.5)
   ------------------------------------------------------------
   A call is a normal governed coordination act:

   1. The invitation, the answer, the end and the handshake travel as
      ordinary `teamCalls` records, so they follow the same save, offline
      queue and revision rules as every other CareLink record.
   2. The audience is decided by the server from the messaging thread, never
      by the browser. A call can only ring people the sender may already
      message, and only the two sides of that thread can see it.
   3. The media itself is a direct WebRTC connection between the devices.
      Nothing is recorded, nothing is uploaded, and a call cannot start
      unless both people are signed in and the browser has been granted the
      microphone/camera they asked for.
   4. If the browser cannot open a direct connection (a locked-down network
      or a device without WebRTC) the call says so plainly and offers a
      dial-in/telephone fallback instead of pretending to connect.
   ============================================================ */

const CALL_TIMEOUT_MS = 45000;        /* an unanswered call stops ringing */
const CALL_STALE_MS = 2 * 60 * 60 * 1000;

const CALLING = {
  _peer: null,
  _local: null,
  _callId: null,
  _kind: 'audio',
  _startedAt: 0,
  _timer: null,
  _sign: null,
  _seen: {},
  _applied: '',
  _seenIce: {},
  _ringingUid: '',
  _muted: false,
  _camOff: false,
  _window: null,

  supported(){
    return typeof RTCPeerConnection === 'function' && Boolean(navigator && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  },

  /* Why a call cannot be placed, in words a field officer can act on. */
  blockedReason(){
    if(!(AUTH && AUTH.user)) return 'Sign in to call a colleague.';
    try{ if(location && location.protocol === 'file:') return 'Calling needs the installed app or the https address, not a file on this computer.'; }catch(e){}
    try{ if(location && !/^https:$/.test(location.protocol) && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return 'Calling needs a secure (https) connection.'; }catch(e){}
    if(typeof SYNC === 'undefined' || !SYNC.available || !SYNC.available()) return 'Calling needs the shared online source; this device is offline.';
    if(!SYNC.sessionToken) return 'Sign in online to place a call.';
    if(!this.supported()) return 'This browser does not provide a direct audio/video connection. Use the telephone fallback.';
    return '';
  },

  calls(){
    return Array.isArray(DB.db && DB.db.teamCalls) ? DB.db.teamCalls : [];
  },

  /* A call record is stored locally and pushed like any other record. */
  _put(record){
    DB.db.teamCalls = Array.isArray(DB.db.teamCalls) ? DB.db.teamCalls : [];
    const i = DB.db.teamCalls.findIndex(c=>c && c.id===record.id);
    if(i>=0) DB.db.teamCalls[i] = Object.assign({}, DB.db.teamCalls[i], record);
    else DB.db.teamCalls.unshift(record);
    if(DB.db.teamCalls.length>200) DB.db.teamCalls.length = 200;
    DB.save();
  },

  _patch(id, set){
    DB.db.teamCalls = Array.isArray(DB.db.teamCalls) ? DB.db.teamCalls : [];
    const rec = DB.db.teamCalls.find(c=>c && c.id===id);
    if(rec) Object.assign(rec, set);
    DB.save();
  },

  /* The person on the other side of a direct chat, or the whole channel. */
  audience(thread){
    const user = AUTH.user;
    if(!user || !thread) return [];
    const r = MESSAGING.route(user, thread);
    if(!r || !r.ok || !Array.isArray(r.to) || !r.to.length) return [];
    return r.to;
  },

  label(thread){
    const t = String(thread||'');
    if(t.startsWith('dm:')){
      const other = (DB.db.users||[]).find(u=>u.id === t.slice(3).split(':').find(id=>id!==AUTH.user.id));
      return other ? 'direct chat with ' + other.name.replace(/^Demo - /,'') : 'this direct chat';
    }
    if(t.startsWith('dept:')) return deptName(t.slice(5)) + ' department team';
    if(t.startsWith('area:')) return areaName(t.slice(5)) + ' ministry area';
    if(t.startsWith('global:')) {
      const sc = t.slice(7);
      return sc==='all' ? 'all staff' : countyName(sc) + ' county';
    }
    return 'this channel';
  },

  _callPatch(record){
    return { c:'teamCalls', id:record.id, set:record };
  },

  /* ---- outgoing -------------------------------------------------------- */
  async start(thread, kind='audio'){
    const why = this.blockedReason();
    if(why) return this._refuse(why);
    if(this._callId) return toast('Call already in progress','Finish or end the current call first.','warn');
    const to = this.audience(thread);
    if(!to.length) return this._refuse('There is nobody in your reach in this conversation to call.');
    const stream = await this._getMedia(kind);
    if(!stream) return false;
    const user = AUTH.user;
    const id = 'call-'+uid('id').replace(/[^a-z0-9]/gi,'');
    const record = { id, thread, kind, state:'ringing', callerId:user.id, callerName:user.name.replace(/^Demo - /,''),
      participantIds:[user.id, ...to], createdAt:new Date().toISOString(), startedAt:null,
      answeredBy:[], endedBy:'', endedAt:'', reason:'', signal:{} };
    this._callId = id; this._kind = kind; this._local = stream; this._muted=false; this._camOff=false;
    this._applied = ''; this._seenIce = {};
    this._put(record);
    this._openWindow(thread, kind, 'outgoing');
    this._armTimeout();
    this._peerFor(id);
    /* The offer is published immediately so the invitation already carries the
       handshake when the colleague picks up. */
    await this._createOffer();
    AUDIT.append({actor:user.id,action:'call.placed',entity:'teamCall',entityId:id,
      detail:`${kind==='video'?'Video':'Audio'} call invited to ${to.length} participant(s) in ${thread}`});
    DB.save();
    toast(kind==='video'?'Video call ringing':'Audio call ringing', `Calling ${this.label(thread)}. The call connects when they answer.`, 'info');
    return true;
  },

  _refuse(message){
    openModal({ title:'Calling is not available on this device', narrow:true,
      sub:'Nothing was sent and no microphone or camera was opened.',
      body:`<div class="alert warn">${ic('alert',16)}<div><b>Why</b><span class="small">${esc(message)}</span></div></div>
        <p class="small" style="color:var(--ink-2)">Team Chat keeps working: send the message, or use the telephone/WhatsApp number on the staff directory. CareLink never records a call and never opens the microphone or camera without your permission.</p>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Close</button>`});
    return false;
  },

  async _getMedia(kind){
    if(!this.supported()) return null;
    const constraints = kind==='video'
      ? { audio:{ echoCancellation:true, noiseSuppression:true }, video:{ facingMode:'user', width:{ ideal:640 }, height:{ ideal:480 } } }
      : { audio:{ echoCancellation:true, noiseSuppression:true }, video:false };
    try{
      return await navigator.mediaDevices.getUserMedia(constraints);
    }catch(err){
      const denied = err && (err.name==='NotAllowedError' || err.name==='SecurityError');
      const missing = err && (err.name==='NotFoundError' || err.name==='OverconstrainedError');
      if(kind==='video' && missing){
        try{ return await navigator.mediaDevices.getUserMedia({ audio:true, video:false }); }catch(_e){}
      }
      openModal({ title: denied ? 'Microphone permission refused' : missing ? 'No microphone or camera found' : 'The media device could not be opened',
        narrow:true, sub:'No call was placed.',
        body:`<div class="alert warn">${ic('alert',16)}<div><b>${denied?'This browser is blocking the microphone':missing?'This device has no usable microphone':'The device is in use elsewhere'}</b>
          <span class="small">${denied?'Allow microphone (and camera for video) in the browser’s site settings for this address, then try again.':missing?'An audio call needs a working microphone.':esc(String(err && err.message || 'Close other apps using the microphone and try again.'))}</span></div></div>
          <p class="small" style="color:var(--ink-2)">You can always message the same person from Team Chat instead.</p>`,
        footer:`<button class="btn btn-ghost" data-act="close-modal">Close</button>`});
      return null;
    }
  },

  _peerFor(callId){
    if(typeof RTCPeerConnection!=='function') return null;
    if(this._peer && this._peer.__callId===callId) return this._peer;
    try{
      const peer = new RTCPeerConnection({ iceServers:[{ urls:'stun:stun.l.google.com:19302' }] });
      peer.__callId = callId;
      peer.__pendingIce = [];
      if(this._local) this._local.getTracks().forEach(t=>{ try{ peer.addTrack(t, this._local); }catch(_e){} });
      peer.onicecandidate = (ev)=>{ if(ev && ev.candidate) this._postCandidate(ev.candidate); };
      peer.ontrack = (ev)=>{ try{ this._attachRemote(ev.streams && ev.streams[0]); }catch(_e){} };
      peer.onconnectionstatechange = ()=>{ this._connectionChanged(peer.connectionState); };
      this._peer = peer;
      return peer;
    }catch(e){ return null; }
  },

  _connectionChanged(state){
    if(state==='connected'){ this._showState('connected'); }
    else if(state==='failed' || state==='disconnected'){
      this._showState('unstable');
    }
  },

  /* Each side writes only its own slot (`offer` for the caller, `answer` for
     the person who picks up) plus its own ICE candidates, so the two halves of
     the handshake can never overwrite each other. */
  _role(){
    const call = this.calls().find(c=>c.id===this._callId);
    return call && String(call.callerId)===String(AUTH.user.id) ? 'caller' : 'callee';
  },

  _postSignal(patch){
    const id = this._callId;
    if(!id || !AUTH.user) return;
    const rec = this.calls().find(c=>c.id===id);
    if(!rec) return;
    const signal = Object.assign({}, rec.signal || {}, patch, { at:new Date().toISOString() });
    this._patch(id, { signal });
  },

  async _postCandidate(candidate){
    const role = this._role();
    const c = candidate && candidate.candidate ? candidate.candidate : candidate;
    const rec = this.calls().find(c=>c.id===this._callId);
    if(!rec) return;
    const list = Array.isArray((rec.signal||{})[role+'Candidates']) ? (rec.signal||{})[role+'Candidates'].slice(-8) : [];
    list.push(c ? JSON.stringify(c.toJSON ? c.toJSON() : c) : '');
    this._postSignal({ [role+'Candidates']: list });
  },

  async _drainSignals(){
    const id = this._callId;
    if(!id || !AUTH.user) return;
    const call = this.calls().find(c=>c.id===id);
    if(!call || !call.signal) return;
    const peer = this._peerFor(id);
    if(!peer) return;
    const role = this._role();
    const signal = call.signal;
    const remoteRole = role==='caller' ? 'callee' : 'caller';
    const remoteSdp = String(signal[remoteRole==='caller'?'offer':'answer'] || '');
    const expect = role==='caller' ? 'answer' : 'offer';
    /* Apply the other side's description exactly once. */
    if(remoteSdp && this._applied !== remoteSdp){
      const state = peer.signalingState;
      const ready = (expect==='answer' && state==='have-local-offer') || (expect==='offer' && state==='stable');
      if(ready){
        this._applied = remoteSdp;
        try{
          await peer.setRemoteDescription({ type:expect, sdp:remoteSdp });
          this._flushIce(peer);
        }catch(e){ this._applied = ''; }
      }
    }
    /* Apply remote ICE candidates once each. */
    const list = Array.isArray(signal[remoteRole+'Candidates']) ? signal[remoteRole+'Candidates'] : [];
    list.forEach(raw=>{
      if(!raw || this._seenIce[raw]) return;
      this._seenIce[raw] = true;
      let c = null;
      try{ c = JSON.parse(raw); }catch(_e){ return; }
      if(peer.remoteDescription && peer.remoteDescription.type){ try{ peer.addIceCandidate(c); }catch(e){} }
      else peer.__pendingIce.push(c);
    });
  },

  _flushIce(peer){
    const list = peer.__pendingIce || [];
    peer.__pendingIce = [];
    list.forEach(c=>{ try{ peer.addIceCandidate(c); }catch(_e){} });
  },

  /* ---- incoming -------------------------------------------------------- */
  _incoming(){
    const user = AUTH.user;
    if(!user) return null;
    const now = Date.now();
    return this.calls().find(c=>{
      if(!c || c.callerId===user.id) return false;
      if(c.state!=='ringing') return false;
      if(!Array.isArray(c.participantIds) || !c.participantIds.includes(user.id)) return false;
      const at = Date.parse(c.createdAt||'');
      if(Number.isFinite(at) && now-at>CALL_TIMEOUT_MS) return false;
      if(Number.isFinite(at) && now-at>CALL_STALE_MS) return false;
      return true;
    }) || null;
  },

  incomingBanner(){
    const user = AUTH && AUTH.user; if(!user) return '';
    const inCall = this.calls().find(c=>c.state==='ringing' && c.callerId!==user.id &&
      Array.isArray(c.participantIds) && c.participantIds.includes(user.id));
    if(!inCall) return '';
    const at = Date.parse(inCall.createdAt||'');
    if(!Number.isFinite(at) || Date.now()-at > CALL_TIMEOUT_MS) return '';
    const who = userName(inCall.callerId).replace(/^Demo - /,'');
    const kind = inCall.kind==='video' ? 'video' : 'audio';
    return `<div class="call-ringer no-print" role="alertdialog" aria-label="${esc(kind)} call from ${esc(who)}">
      <div class="call-ringer-icon">${ic(kind==='video'?'video':'phone',18)}</div>
      <div class="call-ringer-txt"><b>${esc(who)} is calling you</b><span>${kind==='video'?'Video':'Audio'} call · ${esc(this.label(inCall.thread))} · ringing stops in 45 seconds</span></div>
      <div class="row" style="gap:6px">
        <button class="btn btn-xs btn-ghost" data-act="call-decline" data-call="${esc(inCall.id)}">Decline</button>
        <button class="btn btn-xs btn-primary" data-act="call-accept" data-call="${esc(inCall.id)}" data-kind="${esc(kind)}">Answer</button>
      </div></div>`;
  },

  async accept(callId, kind){
    const user = AUTH.user;
    if(!user) return;
    const why = this.blockedReason();
    if(why) return this._refuse(why);
    const stream = await this._getMedia(kind);
    if(!stream) return false;
    const call = this.calls().find(c=>c.id===callId);
    if(!call) return false;
    this._callId = callId; this._kind = kind; this._local = stream;
    this._muted = false; this._camOff = false; this._applied = ''; this._seenIce = {};
    const peer = this._peerFor(callId);
    this._openWindow(call.thread, kind, 'incoming');
    this._patch(callId, { state:'accepted', startedAt:new Date().toISOString(),
      answeredBy:[...(call.answeredBy||[]), user.id] });
    try{
      /* The inviter's offer is already in the record; answer it once. */
      const offer = String((call.signal && call.signal.offer) || '');
      if(offer && peer){
        await peer.setRemoteDescription({ type:'offer', sdp:offer });
        this._flushIce(peer);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        this._applied = offer;
        this._postSignal({ answer: peer.localDescription.sdp, answeredAt:new Date().toISOString() });
      }
    }catch(e){ toast('Answer failed','The direct connection could not be negotiated. Use the telephone fallback.','err'); }
    this._armTimeout(true);
    AUDIT.append({actor:user.id,action:'call.accepted',entity:'teamCall',entityId:callId,detail:`Answered ${kind} call`});
    return true;
  },

  decline(callId, reason='declined'){
    const user = AUTH.user; if(!user) return;
    this._patch(callId, { state:'declined', endedBy:user.id, endedAt:new Date().toISOString(),
      reason:reason==='declined' ? 'Declined before answering' : 'Did not answer' });
    AUDIT.append({actor:user.id,action:'call.declined',entity:'teamCall',entityId:callId,detail:'Declined an incoming call'});
    if(this._callId===callId) this.cleanup();
    if(typeof render==='function') render();
  },

  /* Once the invitation exists, the caller creates the offer so the invitee
     can answer it as soon as they accept. */
  async _createOffer(){
    const peer = this._peerFor(this._callId);
    if(!peer || peer.signalingState!=='stable') return;
    try{
      const offer = await peer.createOffer({ offerToReceiveAudio:true, offerToReceiveVideo:this._kind==='video' });
      await peer.setLocalDescription(offer);
      this._postSignal({ offer: peer.localDescription.sdp });
    }catch(e){}
  },

  /* Reconciles the open call with whatever the shared record now says. Called
     after every sync tick, so an answer or a decline arrives without a refresh. */
  async reconcile(){
    const user = AUTH && AUTH.user; if(!user) return;
    const id = this._callId;
    if(id){
      const call = this.calls().find(c=>c.id===id);
      if(call){
        /* The answer, the ICE candidates and any later change arrive here. */
        if(call.state==='accepted') await this._drainSignals();
        if(['declined','ended','missed'].includes(call.state)) this._remoteEnded(call);
      } else this.cleanup();
      if(this._callId) await this._drainSignals();
    }
    /* An invitation is shown on whatever screen the person is on, so it can be
       answered from anywhere without losing their place. Redraw only when the
       ringing invitation actually appears or clears. */
    const ringing = (this._incoming()||{}).id || '';
    if(this._ringingUid !== ringing){
      this._ringingUid = ringing;
      try{ document.body.setAttribute('data-call-ringer', ringing ? '1' : '0'); }catch(e){}
      try{ if(typeof render==='function' && AUTH.user) render(); }catch(e){}
    }
  },

  _remoteEnded(call){
    const who = call.endedBy ? userName(call.endedBy).replace(/^Demo - /,'') : 'The other person';
    toast(call.state==='declined'?'Call declined':'Call ended', `${who} ${call.state==='declined'?'could not take the call.':'left the call.'}`, 'info');
    this.cleanup();
    if(typeof render==='function') render();
  },

  async end(){
    const id = this._callId;
    const user = AUTH.user;
    if(id && user){
      const call = this.calls().find(c=>c.id===id);
      const answered = call && call.state==='accepted';
      this._patch(id, { state: answered ? 'ended' : 'missed', endedBy:user.id, endedAt:new Date().toISOString(),
        reason: answered ? 'Ended by the caller or participant' : 'No answer within 45 seconds' });
      AUDIT.append({actor:user.id,action: answered?'call.ended':'call.missed',entity:'teamCall',entityId:id,
        detail: answered ? `Call ended after ${this.durationLabel()}` : 'Call not answered within 45 seconds'});
    }
    this.cleanup();
    if(typeof render==='function') render();
  },

  _armTimeout(answered=false){
    clearTimeout(this._timer);
    const id = this._callId;
    if(!id) return;
    this._timer = setTimeout(async ()=>{
      const call = this.calls().find(c=>c.id===id);
      if(!call || call.state!=='ringing') return;
      this._patch(id, { state:'missed', endedAt:new Date().toISOString(), reason:'No answer within 45 seconds' });
      toast('No answer','The call was not answered. Leave a message in Team Chat instead.','warn');
      this.cleanup();
      if(typeof render==='function') render();
    }, CALL_TIMEOUT_MS);
  },

  durationLabel(){
    if(!this._startedAt) return '0 seconds';
    const s = Math.max(0, Math.round((Date.now()-this._startedAt)/1000));
    return s>=60 ? `${Math.floor(s/60)} min ${s%60} s` : `${s} s`;
  },

  toggleMute(){
    this._muted = !this._muted;
    if(this._local) this._local.getAudioTracks().forEach(t=>{ t.enabled = !this._muted; });
    this._showState(this._muted ? 'muted' : 'connected');
  },

  toggleCamera(){
    this._camOff = !this._camOff;
    if(this._local) this._local.getVideoTracks().forEach(t=>{ t.enabled = !this._camOff; });
    this._showState(this._camOff ? 'camera-off' : 'connected');
  },

  /* ---- the call window ------------------------------------------------ */
  _openWindow(thread, kind, mode){
    if(typeof openModal !== 'function') return;
    const other = this.label(thread);
    openModal({ title: (kind==='video'?'Video':'Audio') + ' call', narrow:true, stack:true,
      sub: esc(other) + ' · media travels directly between the two devices and is never recorded',
      body:`<div class="call-stage ${kind==='video'?'is-video':'is-audio'}" id="callStage">
        <div class="call-remote" id="callRemote"><div class="call-remote-hint" id="callHint">${mode==='incoming'?'Connecting…':'Ringing…'}</div><video id="callRemoteVideo" playsinline autoplay ${kind==='video'?'':'style="display:none"'}></video><audio id="callRemoteAudio" autoplay></audio></div>
        <div class="call-local"><video id="callLocalVideo" playsinline autoplay muted ${kind==='video'?'':'style="display:none"'}></video></div>
      </div>
      <div class="call-state" id="callStateText" role="status" aria-live="polite">${mode==='incoming'?'Answering…':'Ringing — the call connects when they answer'}</div>
      <p class="call-privacy xs">${ic('shield',13)} No audio or video is stored in CareLink. Signing out or closing this window ends the call.</p>`,
      footer:`<button class="btn btn-ghost btn-sm" data-act="call-mute" aria-pressed="false">${ic('mic',14)} Mute</button>
        ${kind==='video'?`<button class="btn btn-ghost btn-sm" data-act="call-camera">${ic('video',14)} Camera</button>`:''}
        <button class="btn btn-danger btn-sm" data-act="call-end">${ic('phone',14)} End call</button>`,
      onMount:(back)=>{
        this._window = back;
        const local = back.querySelector('#callLocalVideo');
        if(local && this._local && kind==='video'){ try{ local.srcObject = this._local; }catch(e){} }
        const hint = back.querySelector('#callHint');
        if(hint) hint.textContent = kind==='video' ? 'Camera and microphone are live on this device' : 'Microphone is live on this device';
      }});
    if(mode==='outgoing'){ this._startedAt = 0; setTimeout(()=>this._createOffer(), 60); }
  },

  _attachRemote(stream){
    if(!stream) return;
    const back = this._window;
    if(!back) return;
    const v = back.querySelector('#callRemoteVideo');
    const a = back.querySelector('#callRemoteAudio');
    const hint = back.querySelector('#callHint');
    try{ if(v) v.srcObject = stream; if(a) a.srcObject = stream; }catch(e){}
    if(hint) hint.style.display = 'none';
    this._showState('connected');
  },

  _showState(state){
    const back = this._window;
    if(!back) return;
    const el = back.querySelector('#callStateText');
    if(!el) return;
    const text = ({
      connected: this._startedAt ? 'Connected · ' + this.durationLabel() : 'Connected — media is flowing between the two devices',
      muted: 'Microphone muted · the other person cannot hear you',
      'camera-off': 'Camera off · the other person sees a placeholder',
      unstable: 'The direct connection is unstable — the call may drop. Team Chat messages still work.',
    })[state] || '';
    if(text) el.textContent = text;
    if(state==='connected' && !this._startedAt) this._startedAt = Date.now();
  },

  cleanup(){
    clearTimeout(this._timer);
    if(this._local){ try{ this._local.getTracks().forEach(t=>t.stop()); }catch(e){} }
    if(this._peer){ try{ this._peer.close(); }catch(e){} }
    this._peer = null; this._local = null; this._callId = null; this._startedAt = 0;
    this._muted = false; this._camOff = false; this._applied = ''; this._seenIce = {};
    if(this._window){ try{ closeAllModals(); }catch(e){} this._window = null; }
  },

  /* Turn a logged call into a line the chat can show. */
  describe(call){
    if(!call) return '';
    const kind = call.kind==='video' ? 'Video' : 'Audio';
    const caller = userName(call.callerId).replace(/^Demo - /,'');
    const started = Date.parse(call.startedAt||''); const ended = Date.parse(call.endedAt||'');
    const secs = (Number.isFinite(started) && Number.isFinite(ended)) ? Math.max(0, Math.round((ended-started)/1000)) : 0;
    const length = secs>=60 ? `${Math.floor(secs/60)} min ${secs%60} s` : `${secs} s`;
    const state = call.state==='ended' ? `connected for ${length}` : call.state==='declined' ? 'declined' : call.state==='missed' ? 'not answered' : call.state==='accepted' ? 'in progress' : 'ringing';
    return `${kind} call by ${caller} · ${state}`;
  }
};
