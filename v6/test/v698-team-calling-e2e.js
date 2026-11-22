/* ============================================================================
   v698-team-calling-e2e.js — Team Chat audio & video calling
   1. Every conversation offers audio and video calling, and the inviter cannot
      choose who is called: the audience comes from the messaging thread.
   2. A call is a governed record: invite, answer, handshake, decline and end
      are ordinary saved records that sync like anything else.
   3. The ringing invitation is answerable from any screen, and a call that is
      not answered stops ringing instead of hanging.
   4. A device that cannot make a call says why in plain words and points at the
      telephone fallback; no microphone is opened without consent.
   5. The server refuses a call record that names its own participants, that
      reaches outside the thread, or that a non-participant tries to change.
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const { makeCtx } = require('./dom');

const REPO = path.resolve(__dirname, '..', '..');
const SRC = path.join(REPO, 'v6', 'src');
let pass = 0, fail = 0;
const fails = [];
const ok = (name, cond, detail = '') => { if (cond) pass++; else { fail++; fails.push(name + (detail ? ' — ' + detail : '')); } };

/* The test DOM has no WebRTC; give it a controllable one so the handshake can
   be driven deterministically, exactly as a browser would drive it. */
const ctx = makeCtx({
  RTCPeerConnection: class {
    constructor(){ this.signalingState='stable'; this.__pendingIce=[]; this.localDescription=null; this.remoteDescription=null; }
    addTrack(){ return { track:true }; }
    createOffer(){ return Promise.resolve({ type:'offer', sdp:'OFFER-SDP' }); }
    createAnswer(){ return Promise.resolve({ type:'answer', sdp:'ANSWER-SDP' }); }
    setLocalDescription(d){ this.localDescription=d; this.signalingState = d.type==='offer' ? 'have-local-offer' : 'stable'; return Promise.resolve(); }
    setRemoteDescription(d){ this.remoteDescription=d; this.signalingState = d.type==='offer' ? 'have-remote-offer' : 'stable'; return Promise.resolve(); }
    addIceCandidate(){ return Promise.resolve(); }
    close(){ this.signalingState='closed'; }
  },
  navigator: { userAgent:'unit-test', mediaDevices:{ getUserMedia: async (c) => ({ getTracks:()=>[{stop(){},kind:'audio'}], getAudioTracks:()=>[{enabled:true,stop(){}}], getVideoTracks:()=>[{enabled:true,stop(){}}], __constraints:c }) } },
  location: { protocol:'https:', hostname:'carelink.example', hash:'' },
  /* A real 45-second ring timer would be pointless here; the test drives
     timing through the rendered state instead. */
  setTimeout: () => 0,
  clearTimeout: () => {},
});
const { run } = ctx;
run('DB.load(); DB.seedDemo();');

(async () => {

const actions = run('Object.keys(ACTIONS)');
ok('Team Chat registers audio and video call controls with the action router',
  ['call-start','call-person','call-accept','call-decline','call-end','call-mute','call-camera'].every(a=>actions.includes(a)),
  JSON.stringify(actions.filter(a=>a.startsWith('call-'))));

/* ---- 1. The audience comes from the thread, not the caller --------------- */
const audience = JSON.parse(run(`JSON.stringify((()=>{
  const me = DB.db.users.find(u=>u.roleId==='coordinator');
  AUTH.user = me; AUTH.mustChange=false;
  const county = DB.db.users.filter(u=>u.countyId===me.countyId && u.id!==me.id && u.status==='active');
  const other = county[0];
  const thread = 'dm:'+[me.id, other.id].sort().join(':');
  const dmTo = CALLING.audience(thread);
  const dept = 'dept:'+me.departmentId;
  const deptTo = CALLING.audience(dept);
  const bogus = CALLING.audience('dm:'+[me.id,'u-does-not-exist'].sort().join(':'));
  return { dmTo, deptTo, bogus, meId: me.id, otherId: other.id, thread, label: CALLING.label(thread) };
})())`));
ok('A direct-call audience is exactly the two people in that conversation',
  audience.dmTo.length === 1 && audience.dmTo[0] === audience.otherId && !audience.dmTo.includes(audience.meId),
  JSON.stringify(audience));
ok('A department or area call rings the whole channel and a bogus thread reaches nobody',
  audience.deptTo.length >= 1 && audience.bogus.length === 0, JSON.stringify({ dept: audience.deptTo.length, bogus: audience.bogus }));

/* ---- 2. Placing a call records an invitation ---------------------------- */
run(`SYNC.sessionToken = 'unit-test-token'; SYNC.available = () => true;`);
const started = JSON.parse(run(`JSON.stringify((()=>{
  const before = (DB.db.teamCalls||[]).length;
  DB.db.teamCalls = [];
  AUTH.user = DB.db.users.find(u=>u.roleId==='coordinator');
  const other = DB.db.users.filter(u=>u.countyId===AUTH.user.countyId && u.id!==AUTH.user.id)[0];
  const thread = 'dm:'+[AUTH.user.id, other.id].sort().join(':');
  return { thread, otherId: other.id };
})())`));
await run(`(async()=>{ const r = await CALLING.start(${JSON.stringify(started.thread)}, 'video'); return r===true; })()`);
ok('Starting a call opens it as a ringing invitation addressed by the server rule',
  run('(DB.db.teamCalls||[]).length') === 1 &&
  run('DB.db.teamCalls[0].state') === 'ringing' &&
  run('DB.db.teamCalls[0].kind') === 'video' &&
  run(`DB.db.teamCalls[0].participantIds.length`) === 2 &&
  run(`DB.db.teamCalls[0].participantIds.includes(${JSON.stringify(started.otherId)})`) === true,
  JSON.stringify(run('JSON.stringify(DB.db.teamCalls)')));

const logged = run(`(DB.db.audit||[]).filter(a=>String(a.action||'').startsWith('call.')).length`);
ok('Placing a call writes an audited coordination event, never the media',
  logged >= 1 && !/base64|blob:/.test(run('JSON.stringify(DB.db.teamCalls)')),
  String(logged));

/* ---- 3. The invitation is answerable from anywhere ---------------------- */
/* Seen from the invited colleague's own console, which is where it rings. */
const banner = run(`(()=>{
  const saved = AUTH.user;
  AUTH.user = DB.db.users.find(u=>u.id===${JSON.stringify(started.otherId)});
  const html = CALLING.incomingBanner();
  AUTH.user = saved;
  return html;
})()`);
ok('The ringing invitation names the caller, the kind and the time limit, and offers Decline and Answer',
  /is calling you/.test(banner) && /data-act="call-decline"/.test(banner) &&
  /data-act="call-accept"/.test(banner) && /45 seconds/.test(banner), banner.slice(0, 200));
ok('The caller sees a ringing state rather than their own invitation card',
  run('CALLING.incomingBanner()') === '', run('CALLING.incomingBanner()').slice(0, 80));
ok('The call surface is rendered by the signed-in shell so it is reachable from any screen',
  fs.readFileSync(path.join(SRC, 'app.js'), 'utf8').includes('CALLING.incomingBanner()'));

/* ---- 4. Answer, handshake, end ---------------------------------------- */
await run(`(async()=>{
  /* Play the invited colleague on the same shared record. */
  const call = DB.db.teamCalls[0];
  const guest = DB.db.users.find(u=>u.id===${JSON.stringify(started.otherId)});
  const saved = AUTH.user;
  AUTH.user = guest;
  await CALLING.accept(call.id, 'video');
  AUTH.user = saved;
  return true;
})()`);
ok('Answering an invitation posts the answer slot and never overwrites the caller offer',
  run('DB.db.teamCalls[0].state') === 'accepted' &&
  /OFFER-SDP/.test(run("JSON.stringify(DB.db.teamCalls[0].signal.offer||'')")) &&
  /ANSWER-SDP/.test(run("JSON.stringify(DB.db.teamCalls[0].signal.answer||'')")),
  run("JSON.stringify(DB.db.teamCalls[0].signal)"));

ok('The call log turns the record into a plain-language line for the chat',
  /Video call by .+ connected for|Video call by .+ in progress|Video call by .+ ringing/.test(run('CALLING.describe(DB.db.teamCalls[0])')),
  run('CALLING.describe(DB.db.teamCalls[0])'));

run('CALLING.cleanup()');
const decline = run(`(()=>{
  const me = DB.db.users.find(u=>u.roleId==='coordinator');
  AUTH.user = me;
  DB.db.teamCalls = [{ id:'call-x', thread:'dm:a:b', kind:'audio', state:'ringing',
    callerId:'u-other', participantIds:['u-other', me.id], createdAt:new Date().toISOString(), signal:{} }];
  CALLING.decline('call-x');
  return DB.db.teamCalls[0].state;
})()`);
ok('Declining ends the invitation for both sides and stops it ringing',
  decline === 'declined' && run('CALLING.incomingBanner()') === '', decline);

/* An unanswered call must stop ringing rather than wait forever. */
const stale = run(`(()=>{
  const me = DB.db.users.find(u=>u.roleId==='coordinator');
  AUTH.user = me;
  const old = new Date(Date.now() - 120000).toISOString();
  DB.db.teamCalls = [{ id:'call-old', thread:'dm:a:b', kind:'audio', state:'ringing',
    callerId:'u-other', participantIds:['u-other', me.id], createdAt:old, signal:{} }];
  return CALLING.incomingBanner();
})()`);
ok('A stale ringing invitation stops appearing and is not answerable two minutes later',
  stale === '', stale.slice(0, 80));

/* ---- 5. Honest refusal when a device cannot call ----------------------- */
const blocked = JSON.parse(run(`JSON.stringify((()=>{
  const me = DB.db.users.find(u=>u.roleId==='coordinator');
  AUTH.user = me;
  const real = SYNC.available;
  SYNC.available = () => false;
  const offline = CALLING.blockedReason();
  SYNC.available = real;
  SYNC.sessionToken = null;
  const signedOut = CALLING.blockedReason();
  SYNC.sessionToken = 'tok';
  const ready = CALLING.blockedReason();
  const noWebrtc = (()=>{ const keep = RTCPeerConnection; try{ globalThis.RTCPeerConnection = undefined; return CALLING.blockedReason(); } finally { globalThis.RTCPeerConnection = keep; } })();
  return { offline, signedOut, ready, noWebrtc };
})())`));
ok('Calling states plainly why it is unavailable (offline, signed out, no WebRTC) instead of failing silently',
  /shared online source/i.test(blocked.offline) && /Sign in online/i.test(blocked.signedOut) &&
  /direct audio\/video connection/i.test(blocked.noWebrtc) && blocked.ready === '',
  JSON.stringify(blocked));
ok('The chat states the reason beside the call buttons, which then explain what is needed',
  (()=>{
    const chat = fs.readFileSync(path.join(SRC, 'views_care.js'), 'utf8');
    return chat.includes('Audio &amp; video calling are switched off on this device') &&
      chat.includes('id="callUnavailable"') && chat.includes('aria-describedby="callUnavailable"') &&
      chat.includes('data-act="call-start"') && chat.includes('data-act="call-person"');
  })());

/* ---- 6. Server policy -------------------------------------------------- */
const apiIndex = fs.readFileSync(path.join(REPO, 'api', 'index.js'), 'utf8');
ok('The server decides the audience of a call and refuses a self-named participant list',
  apiIndex.includes('function callPatchAllowed') &&
  apiIndex.includes('participantIds.length !== expected.length + 1') &&
  apiIndex.includes("reason: 'call_scope_denied'"));
ok('Only the two sides of a call can read or change its record',
  apiIndex.includes('function callVisibleToScope') &&
  apiIndex.includes('if (!participantIds.includes(String(scope.userId))) return false;') &&
  apiIndex.includes("if (patch.c === 'teamCalls') {"));
ok('The handshake is bounded, text-only and never stored as a media blob',
  apiIndex.includes('CALL_MAX_SIGNAL_CHARS') &&
  apiIndex.includes('callSignalText(signal.sdp)') &&
  !/teamCalls[\s\S]{0,200}Buffer/.test(apiIndex));
ok('A call cannot be converted into a rewrite of who took part',
  apiIndex.includes("['callerId', 'participantIds', 'thread', 'kind', 'startedAt'].includes(key)"));
ok('Every signed-in session receives call records only for its own calls',
  apiIndex.includes('copy.teamCalls = copy.teamCalls.filter((call) => callVisibleToScope(call, state, scope));') &&
  apiIndex.includes('if (patch.c === \'teamCalls\') {'));

/* ---- 7. The new collection is declared, so an older database migrates --- */
ok('The call collection is declared in the blank database so older devices migrate without loss',
  fs.readFileSync(path.join(SRC, 'core.js'), 'utf8').includes('teamCalls:[]}') ||
  /teamCalls:\[\]/.test(fs.readFileSync(path.join(SRC, 'core.js'), 'utf8')));
ok('Calling is bundled after the chat view and before the shell in every builder',
  fs.readFileSync(path.join(REPO, 'v6', 'build.py'), 'utf8').includes('"views_care.js", "calling6.js"') &&
  fs.readFileSync(path.join(REPO, 'tools', 'sync-lovable.mjs'), 'utf8').includes("'views_care.js', 'calling6.js'") &&
  fs.readFileSync(path.join(SRC, '..', 'test', 'modules.js'), 'utf8').includes("'views_care.js','calling6.js'"));

console.log(`\nv698-team-calling-e2e: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('FAILURES:\n - ' + fails.join('\n - '));
  process.exit(1);
}
})().catch(e=>{ console.error(e); process.exit(1); });
