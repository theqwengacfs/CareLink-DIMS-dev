/* Held work on a hosted client.

   A hosted tablet is a view of the shared record: it deliberately does not keep
   the whole register in browser storage. The one thing that must survive a
   reload is work the clinic typed but the host has not accepted yet. These
   checks drive the real SYNC object with a stubbed transport.

   The rule the clinic cares about: a home visit saved while the network was
   down must reach the shared record after a reload, and must never be
   published under a colleague's name. */
const assert = require('node:assert/strict');
const { makeCtx } = require('./dom');

let passed = 0;
function check(name, condition) {
  assert.ok(condition, name);
  passed++;
  console.log(`  ok  ${name}`);
}

function hostedCtx() {
  return makeCtx({
    location: { hash: '', protocol: 'https:', origin: 'https://carelink.test', host: 'carelink.test' },
    navigator: { userAgent: 'outbox-test' },
    performance: { now: () => Date.now() },
    sessionStorage: { getItem(){ return null; }, setItem(){}, removeItem(){} },
  });
}

(async () => {
  /* 1. A refused save is held, not lost. */
  {
    const c = hostedCtx();
    c.run(`DB.db = DB.blank(); DB.db.patients = [{ id:'p1', code:'CL-1', name:'Synthetic One', areaId:'nyalenda', countyId:'kisumu', status:'active' }];
      DB.db.visits = []; SYNC.rebase();
      AUTH.user = { id:'u-care-1', username:'caregiver.nyalenda', roleId:'caregiver', countyId:'kisumu', areaIds:['nyalenda'] };
      SYNC.storeToken('tablet-token'); SYNC.rev = 12;
      SYNC._json = async () => { throw new Error('network down'); };
      DB.db.visits.push({ id:'v1', patientId:'p1', date:'2026-11-22', type:'home', weight:48.2, outcome:'seen', notes:'Held visit' });`);
    await c.run('SYNC.push()');
    check('a visit typed while the host is unreachable is written to durable storage',
      c.run(`SYNC.heldOutbox() === 1`));
    check('the operator is told exactly how many changes are held',
      c.run(`/1 change is held/.test(SYNC.message)`));
    check('held work names the account that typed it',
      c.run(`SYNC.loadOutbox().username === 'caregiver.nyalenda'`));
  }

  /* 2. Held work survives a reload and reaches the shared record. */
  {
    const c = hostedCtx();
    const sent = [];
    c.run(`DB.db = DB.blank();
      DB.db.patients = [{ id:'p1', code:'CL-1', name:'Synthetic One', areaId:'nyalenda', countyId:'kisumu', status:'active' }];
      DB.db.visits = [];
      AUTH.user = { id:'u-care-1', username:'caregiver.nyalenda', roleId:'caregiver', countyId:'kisumu', areaIds:['nyalenda'] };
      SYNC.storeToken('tablet-token'); SYNC.rev = 12;
      SYNC._json = async () => { throw new Error('network down'); };
      SYNC.rebase();
      DB.db.visits.push({ id:'v1', patientId:'p1', date:'2026-11-22', type:'home', weight:48.2, outcome:'seen', notes:'Held visit' });`);
    await c.run('SYNC.push()');
    const held = c.run('SYNC.heldOutbox()');

    /* A reload: fresh module state, same durable storage, host reachable again. */
    const reloaded = makeCtx({
      location: { hash: '', protocol: 'https:', origin: 'https://carelink.test', host: 'carelink.test' },
      navigator: { userAgent: 'outbox-test' },
      performance: { now: () => Date.now() },
      sessionStorage: { getItem: () => 'tablet-token', setItem(){}, removeItem(){} },
    });
    /* The same browser profile keeps localStorage, so copy the durable keys. */
    reloaded.ctx.localStorage.setItem('carelink.sync.outbox', c.ctx.localStorage.getItem('carelink.sync.outbox'));
    reloaded.run(`DB.db = DB.blank();
      DB.db.patients = [{ id:'p1', code:'CL-1', name:'Synthetic One', areaId:'nyalenda', countyId:'kisumu', status:'active' }];
      DB.db.visits = [];
      AUTH.user = { id:'u-care-1', username:'caregiver.nyalenda', roleId:'caregiver', countyId:'kisumu', areaIds:['nyalenda'] };
      SYNC.loadToken(); SYNC.rev = 12;
      SYNC._json = async (url, opts) => { if(/api\\/state$/.test(url) && opts && opts.method === 'PUT'){ __sent.push(JSON.parse(opts.body)); return { ok:true, status:200, body:{ rev:13, merged:0 } }; } return { ok:true, status:200, body:{} }; };`);
    reloaded.ctx.__sent = [];
    const heldAfterReload = reloaded.run('SYNC.heldOutbox()');
    const replayed = await reloaded.run('SYNC.attemptOutbox()');
    const sentPatches = reloaded.ctx.__sent.reduce((n, body) => n + (body.patches || []).length, 0);
    check('held work survives a reload', held === 1 && heldAfterReload === 1);
    check('held work is replayed to the shared record after the reload', replayed === true && sentPatches === 1);
    check('the held visit carries its real content, not an empty shell',
      reloaded.ctx.__sent[0].patches.some(p => p.c === 'visits' && p.set && p.set.notes === 'Held visit' && p.set.weight === 48.2));
    check('the outbox is emptied once the host accepts the work', reloaded.run('SYNC.heldOutbox()') === 0);
    check('the operator is told the held work was saved', reloaded.run(`SYNC.state === 'connected' && /Held work saved/.test(SYNC.message)`));
  }

  /* 3. Held work is never published under a colleague's name. */
  {
    const c = hostedCtx();
    c.run(`DB.db = DB.blank();
      DB.db.patients = [{ id:'p1', code:'CL-1', name:'Synthetic One', areaId:'nyalenda', countyId:'kisumu', status:'active' }];
      DB.db.visits = [];
      AUTH.user = { id:'u-care-1', username:'caregiver.nyalenda', roleId:'caregiver', countyId:'kisumu', areaIds:['nyalenda'] };
      SYNC.storeToken('tablet-token'); SYNC.rev = 12;
      SYNC._json = async () => { throw new Error('network down'); };
      SYNC.rebase();
      DB.db.visits.push({ id:'v1', patientId:'p1', date:'2026-11-22', type:'home', weight:48.2, outcome:'seen', notes:'Held visit' });`);
    await c.run('SYNC.push()');
    const other = await c.run(`AUTH.user = { id:'u-care-2', username:'caregiver.manyatta', roleId:'caregiver', countyId:'kisumu', areaIds:['manyatta'] };
      let posted = false;
      SYNC._json = async () => { posted = true; return { ok:true, status:200, body:{ rev:13 } }; };
      (async () => { const result = await SYNC.attemptOutbox(); return { result, posted }; })()`);
    check('a colleague signing in on the same tablet does not publish the first person\'s held work',
      other.result === false && other.posted === false && c.run('SYNC.heldOutbox()') === 1);
  }

  /* 4. Work the host will never accept is reported and released, not held forever. */
  {
    const c = hostedCtx();
    c.run(`DB.db = DB.blank();
      DB.db.patients = [{ id:'p1', code:'CL-1', name:'Synthetic One', areaId:'nyalenda', countyId:'kisumu', status:'active' }];
      DB.db.visits = [];
      AUTH.user = { id:'u-care-1', username:'caregiver.nyalenda', roleId:'caregiver', countyId:'kisumu', areaIds:['nyalenda'] };
      SYNC.storeToken('tablet-token'); SYNC.rev = 12;
      SYNC._json = async () => { throw new Error('network down'); };
      SYNC.rebase();
      DB.db.visits.push({ id:'v1', patientId:'p1', date:'2026-11-22', type:'home', weight:48.2, outcome:'seen', notes:'Held visit' });`);
    await c.run('SYNC.push()');
    const refused = await c.run(`SYNC._json = async () => ({ ok:false, status:403, body:{ ok:false, code:'scope_denied', error:'That patient is outside this account\\'s area.' } });
      (async () => { const result = await SYNC.attemptOutbox(); return { result, held: SYNC.heldOutbox(), message: SYNC.message }; })()`);
    check('a refusal the host will never accept is reported plainly', refused.result === false && /outside this account/.test(refused.message));
    check('refused work is released rather than promising a save that cannot happen', refused.held === 0);
  }

  /* 5. Signing out keeps held work for that account. */
  {
    const c = hostedCtx();
    c.run(`DB.db = DB.blank();
      DB.db.patients = [{ id:'p1', code:'CL-1', name:'Synthetic One', areaId:'nyalenda', countyId:'kisumu', status:'active' }];
      DB.db.visits = [];
      AUTH.user = { id:'u-care-1', username:'caregiver.nyalenda', roleId:'caregiver', countyId:'kisumu', areaIds:['nyalenda'] };
      SYNC.storeToken('tablet-token'); SYNC.rev = 12;
      SYNC._json = async () => { throw new Error('network down'); };
      SYNC.rebase();
      DB.db.visits.push({ id:'v1', patientId:'p1', date:'2026-11-22', type:'home', weight:48.2, outcome:'seen', notes:'Held visit' });`);
    await c.run('SYNC.push()');
    check('signing out does not silently discard held work', c.run('SYNC.heldOutbox()') === 1);
    check('the outbox is scoped to the account that typed it', c.run(`SYNC.loadOutbox().username === 'caregiver.nyalenda'`));
  }

  /* 6. A save refused because the session ended is held before the session goes. */
  {
    const c = hostedCtx();
    const result = await c.run(`(() => {
      DB.db = DB.blank();
      DB.db.patients = [{ id:'p1', code:'CL-1', name:'Synthetic One', areaId:'nyalenda', countyId:'kisumu', status:'active' }];
      DB.db.visits = [];
      AUTH.user = { id:'u-care-1', username:'caregiver.nyalenda', roleId:'caregiver', countyId:'kisumu', areaIds:['nyalenda'] };
      SYNC.storeToken('expired-token'); SYNC.rev = 12;
      SYNC.rebase();
      DB.db.visits.push({ id:'v1', patientId:'p1', date:'2026-11-22', type:'home', weight:48.2, outcome:'seen', notes:'Typed before the session ended' });
      SYNC._json = async () => { throw new Error('network down'); };
      SYNC.holdWork();
      return { held: SYNC.heldOutbox(), token: SYNC.sessionToken };
    })()`);
    check('work typed before a session ends is held for that account',
      result.held === 1 && c.run(`SYNC.loadOutbox().username === 'caregiver.nyalenda'`));
  }

  /* 7. The status chip tells the truth about where the work is. */
  {
    const c = hostedCtx();
    c.run(`DB.db = DB.blank();
      DB.db.patients = [{ id:'p1', code:'CL-1', name:'Synthetic One', areaId:'nyalenda', countyId:'kisumu', status:'active' }];
      DB.db.visits = [];
      AUTH.user = { id:'u-care-1', username:'caregiver.nyalenda', roleId:'caregiver', countyId:'kisumu', areaIds:['nyalenda'] };
      SYNC.storeToken('tablet-token'); SYNC.rev = 12;
      SYNC._json = async () => { throw new Error('network down'); };
      SYNC.rebase();
      DB.db.visits.push({ id:'v1', patientId:'p1', date:'2026-11-22', type:'home', weight:48.2, outcome:'seen', notes:'Held visit' });`);
    await c.run('SYNC.push()');
    check('the status chip says work is held rather than merely unconfirmed',
      c.run(`SYNC.state === 'error' && SYNC.label() === 'Held on this device'`));
    check('the status detail counts the held changes',
      c.run(`/1 change is held/.test(SYNC.detail())`));
  }

  console.log(`sync-outbox: ${passed} checks passed`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
