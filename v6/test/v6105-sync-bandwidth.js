/* Exercise the real client modules, timers and transport with a synthetic
   clock/host. No production accounts, data or network requests are used. */
const assert = require('node:assert/strict');
const { makeCtx } = require('./dom');
let checks=0;
async function check(name,fn) { await fn(); checks++; console.log('  ok  '+name); }
const quota={ok:false,code:'kv_quota_exceeded',retryAfterSeconds:300,error:'The database reached its bandwidth quota, not a staff password rejection. No change was acknowledged.'};
const answer=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});
function hosted() {
  const clock={now:Date.parse('2026-11-22T12:00:00Z')}, intervals=[], requests=[];
  class ClockDate extends Date { static now(){return clock.now;} }
  const c=makeCtx({Date:ClockDate,
    location:{hash:'',protocol:'https:',origin:'https://carelink.test',host:'carelink.test',pathname:'/carelink-v6.html'},
    performance:{now:()=>clock.now},
    navigator:{userAgent:'synthetic-bandwidth-fixture'},
    sessionStorage:{getItem(){return null;},setItem(){},removeItem(){}},
    setInterval(fn,ms){intervals.push({fn,ms});return intervals.length;},clearInterval(){},
    fetch:async(url,init={})=>{requests.push({url,init});return answer({ok:true,unchanged:true,rev:12});}
  });
  c.run(`DB.db=DB.blank();DB.db.patients=[{id:'synthetic-p1',name:'Synthetic fixture',countyId:'kisumu',areaId:'ombeyi'}];DB.db.visits=[];
    AUTH.user={id:'u-fixture',username:'synthetic.fixture',roleId:'caregiver',countyId:'kisumu',areaIds:['ombeyi']};
    SYNC.storeToken('synthetic-session');SYNC.rev=12;SYNC.rebase();APPX.dirty=false;`);
  return {...c,clock,intervals,requests};
}
(async()=>{
  await check('slow state polls cannot overlap, including manual/timer ticks',async()=>{
    const c=hosted();let release;
    c.ctx.fetch=(url,init)=>{c.requests.push({url,init});return new Promise(resolve=>{release=resolve;});};
    const first=c.run('SYNC.tick()');
    await c.run('SYNC.tick()');
    assert.equal(c.requests.length,1);assert.equal(c.run('SYNC._ticking'),true);
    release(answer({ok:true,unchanged:true,rev:12}));await first;
    assert.equal(c.run('SYNC._ticking'),false);assert.equal(c.run('SYNC.sessionToken'),'synthetic-session');
  });
  await check('network exceptions and HTTP outages both back off, then successful polls recover the normal cadence',async()=>{
    const c=hosted();c.run('SYNC.startPolling()');
    c.ctx.fetch=async()=>{throw Error('isolated network failure');};
    for(let i=0;i<3;i++) await c.run('SYNC.tick()');
    assert.deepEqual(c.intervals.map(t=>t.ms),[10000,20000,40000,60000]);
    c.ctx.fetch=async()=>answer({error:'isolated unavailable'},503);await c.run('SYNC.tick()');
    assert.equal(c.run('SYNC._pollErrStreak'),4);
    c.ctx.fetch=async()=>answer({ok:true,unchanged:true,rev:12});await c.run('SYNC.tick()');
    assert.equal(c.run('SYNC._pollErrStreak'),0);assert.equal(c.intervals.at(-1).ms,10000);
    assert.equal(c.run('SYNC.sessionToken'),'synthetic-session');
    c.ctx.document.hidden=true;let calls=0;c.ctx.fetch=async()=>{calls++;return answer({});};
    await c.run('SYNC.tick()');assert.equal(calls,0,'background tabs do not poll');
  });
  await check('startup retains the actionable provider quota message instead of a generic connection/password error',async()=>{
    const c=hosted();c.run('AUTH.user=null;SYNC.storeToken(null);APPX.host=null;');
    c.ctx.fetch=async(url,init)=>{c.requests.push({url,init});return answer(quota,503);};
    await c.run('SYNC.start()');
    assert.equal(c.requests.length,1);assert.equal(c.run('SYNC.state'),'error');
    assert.match(c.run('SYNC.message'),/bandwidth quota/);assert.equal(c.run('SYNC.kvBlocked()'),true);
  });
  await check('a full pull ignores old host-wide snapshots and obtains the current account scope',async()=>{
    const c=hosted();
    c.run(`SYNC.server={cloud:true};SYNC._canDecompressGzip=()=>false;
      SYNC._idbReadSnapshot=async()=>{throw Error('old host-wide snapshot must never be read');};`);
    const scoped=JSON.parse(c.run(`JSON.stringify(Object.assign(DB.blank(),{patients:[{id:'allowed',name:'Synthetic',countyId:'kisumu',areaId:'ombeyi'}]}))`));
    c.ctx.fetch=async(url,init)=>{c.requests.push({url,init});return answer({ok:true,rev:12,saved:'current',db:scoped});};
    assert.equal(await c.run('SYNC.pullFull()'),true);
    assert.equal(c.requests.length,1);assert.equal(c.requests[0].url,'api/state');
    assert.equal(c.run('DB.db.patients[0].id'),'allowed');
  });
  await check('stale or incomplete snapshots are not adopted after retries',async()=>{
    const c=hosted();
    c.run(`SYNC.server={cloud:true};SYNC._canDecompressGzip=()=>true;SYNC._sleep=async()=>{};`);
    const old=JSON.parse(c.run('JSON.stringify(DB.db)'));
    old.patients=[];
    c.ctx.fetch=async(url,init)=>{
      c.requests.push({url,init});
      return url==='api/state?fast=1'
        ? answer({ok:true,fastPack:true,rev:11,totalParts:1,part0:'old'})
        : answer({ok:true,rev:11,db:old});
    };
    assert.equal(await c.run('SYNC.pullFull({minRev:12})'),false);
    assert.equal(c.run('DB.db.patients[0].id'),'synthetic-p1','a stale state cannot replace the visible snapshot');
    assert.match(c.run('SYNC.message'),/not yet up to date/);
    c.requests.length=0;
    c.run('SYNC._canDecompressGzip=()=>false;');
    c.ctx.fetch=async(url,init)=>{c.requests.push({url,init});return answer({ok:true,rev:12,db:old});};
    assert.equal(await c.run('SYNC.pullFull({requireReferenceMaster:true})'),false);
    assert.equal(c.run('DB.db.patients[0].id'),'synthetic-p1');
  });
  await check('compressed pieces from different revisions are never combined',async()=>{
    const c=hosted();
    c.run(`SYNC.server={cloud:true};SYNC._canDecompressGzip=()=>true;SYNC._sleep=async()=>{};
      SYNC._gunzipBase64Json=async()=>{throw Error('incompatible parts must not be decoded');};`);
    c.ctx.fetch=async(url,init)=>{c.requests.push({url,init});return url==='api/state?fast=1'
      ? answer({ok:true,fastPack:true,rev:12,totalParts:2,part0:'a'})
      : answer({ok:true,fastPack:true,rev:13,totalParts:2,part:1,data:'b'});};
    assert.equal(await c.run('SYNC._tryFastPackPull(12,false)'),null);
    assert.equal(c.run('DB.db.patients[0].id'),'synthetic-p1');
  });
  await check('a full-pull quota refusal retains the session and stops later network attempts',async()=>{
    const c=hosted();
    c.run(`SYNC.server={cloud:true};SYNC._canDecompressGzip=()=>true;`);
    c.ctx.fetch=async(url,init)=>{c.requests.push({url,init});return answer(quota,503);};
    assert.equal(await c.run('SYNC.pullFull()'),false);assert.equal(c.requests.length,1);
    assert.equal(c.requests[0].url,'api/state?fast=1');
    assert.equal(c.run('SYNC.kvBlocked()'),true);assert.equal(c.run('SYNC._pulling'),false);
    assert.equal(c.run('SYNC.state'),'error');assert.match(c.run('SYNC.message'),/bandwidth quota/);
    assert.equal(c.run('SYNC.sessionToken'),'synthetic-session');
    assert.equal(await c.run('SYNC.beat()'),null);await c.run('SYNC.tick()');
    assert.equal(c.requests.length,1,'heartbeat and polls share the quota cooldown');
    c.run('SYNC.startPolling()');assert.equal(c.intervals.at(-1).ms,300000);
  });
  await check('a fast-pack quota refusal is not retried or followed by a paged download',async()=>{
    const c=hosted();c.run('SYNC.server={cloud:true};SYNC._canDecompressGzip=()=>true;');
    c.ctx.fetch=async(url,init)=>{c.requests.push({url,init});return answer(quota,503);};
    assert.equal(await c.run('SYNC.pullFull()'),false);assert.equal(c.requests.length,1);
    assert.equal(c.requests[0].url,'api/state?fast=1');
  });
  await check('a quota in a later fast-pack part terminates the pull without a page cascade',async()=>{
    const c=hosted();c.run('SYNC.server={cloud:true};SYNC._canDecompressGzip=()=>true;');
    c.ctx.fetch=async(url,init)=>{
      c.requests.push({url,init});
      return url==='api/state?fast=1'?answer({ok:true,fastPack:true,rev:12,totalParts:2,part0:'synthetic'}):answer(quota,503);
    };
    assert.equal(await c.run('SYNC.pullFull()'),false);assert.equal(c.requests.length,2);
    assert.match(c.requests[1].url,/part=1/);assert.equal(c.run('SYNC.state'),'error');
  });
  await check('a quota during collection paging stops page and whole-snapshot retries',async()=>{
    const c=hosted();c.run('SYNC._canDecompressGzip=()=>false;');
    c.ctx.fetch=async(url,init)=>{
      c.requests.push({url,init});
      return url==='api/state'?answer({ok:true,rev:12,db:{meta:{schema:6},settings:{},users:[],patients:[]},pagedCollections:[{name:'patients',count:1}]}):answer(quota,503);
    };
    assert.equal(await c.run('SYNC.pullFull()'),false);assert.equal(c.requests.length,2);
    assert.match(c.requests[1].url,/state\/collection/);assert.equal(c.run('SYNC._pulling'),false);
    assert.equal(c.run('DB.db.patients.length'),1,'a failed partial pull cannot replace the current document');
  });
  await check('quota-refused saves are retained for review and newer work does not overwrite the queue',async()=>{
    const c=hosted();
    c.run(`DB.db.visits.push({id:'synthetic-visit-1',patientId:'synthetic-p1',notes:'Synthetic held visit'});APPX.dirty=true;`);
    c.ctx.fetch=async(url,init)=>{
      c.requests.push({url,init});
      c.run('SYNC._queuedWhileInflight=true;');
      return answer(quota,503);
    };
    await c.run('SYNC.push()');
    assert.equal(c.requests.length,1);assert.equal(c.run('SYNC.heldOutbox()'),1);
    assert.equal(c.run('SYNC.rev'),12);assert.equal(c.run('SYNC._inflight'),false);
    assert.match(c.run('SYNC.message'),/1 change is retained for review/);
    const original=c.ctx.localStorage.getItem('carelink.sync.outbox');
    c.run(`DB.db.visits.push({id:'synthetic-visit-2',patientId:'synthetic-p1',notes:'Synthetic second visit'});SYNC.queue();`);
    assert.match(c.run('SYNC.message'),/newer changes are not safely stored/i);
    await c.run('SYNC.push()');assert.equal(await c.run('SYNC.attemptOutbox()'),false);
    assert.equal(c.requests.length,1);assert.equal(c.run('SYNC.heldOutbox()'),1);
    assert.equal(c.ctx.localStorage.getItem('carelink.sync.outbox'),original);
    assert.equal(c.run('SYNC.sessionToken'),'synthetic-session');
    const reloaded=hosted();
    reloaded.ctx.localStorage.setItem('carelink.sync.outbox',original);
    reloaded.ctx.fetch=async(url,init)=>{reloaded.requests.push({url,init});return answer({ok:true,rev:13,appliedCount:1,rejected:[]});};
    assert.equal(await reloaded.run('SYNC.attemptOutbox()'),false);
    assert.equal(reloaded.requests.length,0);assert.equal(reloaded.run('SYNC.heldOutbox()'),1);
  });
  await check('an explicit KV retry can probe recovery; cooldown expiry alone never claims the provider quota reset',async()=>{
    const c=hosted();
    c.ctx.fetch=async(url,init)=>{c.requests.push({url,init});return answer(quota,503);};
    await c.run(`SYNC._json('api/health')`);assert.equal(c.requests.length,1);
    c.clock.now+=300001;assert.equal(c.run('SYNC.kvBlocked()'),false);
    const stillBlocked=await c.run(`SYNC._json('api/health')`);
    assert.equal(stillBlocked.ok,false);assert.equal(c.requests.length,2);assert.equal(c.run('SYNC.kvBlocked()'),true);
    c.ctx.fetch=async(url,init)=>{c.requests.push({url,init});return answer({ok:true,setup:true,commissioned:true,cloud:true,rev:12});};
    c.run(`AUTH.user=null;APPX.screen='login';`);
    await c.run(`ACTIONS['login-retry-kv']()`);
    assert.equal(c.requests.length,4,'one explicit diagnostic plus one verified health read');
    assert.equal(c.run('SYNC.kvBlocked()'),false);
    assert.match(c.run('LOGIN6.notice'),/online and healthy/);
  });
  await check('heartbeats keep local call reconciliation but send no idle/hidden renewals and at most one active renewal per minute',async()=>{
    const c=hosted();c.ctx.__beats=0;c.ctx.__calls=0;
    c.run(`SYNC.beat=async()=>{__beats++;return 1800;};CALLING.reconcile=async()=>{__calls++;};SESSION.start();`);
    c.clock.now+=60000;await c.run('SESSION.heartbeat()');
    assert.equal(c.ctx.__beats,0);assert.equal(c.ctx.__calls,1);
    c.run('SESSION.touch()');const activity=c.run('SESSION.last');await c.run('SESSION.heartbeat()');
    assert.equal(c.ctx.__beats,1);assert.equal(c.run('SESSION.last'),activity,'network reads are not user activity');
    for(let i=0;i<5;i++){c.clock.now+=10000;c.run('SESSION.touch()');await c.run('SESSION.heartbeat()');}
    assert.equal(c.ctx.__beats,1);assert.equal(c.run('SESSION.activeSinceBeat'),true,'rate-limited activity is kept');
    c.clock.now+=10000;await c.run('SESSION.heartbeat()');assert.equal(c.ctx.__beats,2);
    c.ctx.document.hidden=true;c.clock.now+=60000;c.run('SESSION.touch()');await c.run('SESSION.heartbeat()');
    assert.equal(c.ctx.__beats,2);
    c.ctx.document.hidden=false;c.clock.now+=900000;await c.run('SESSION.heartbeat()');assert.equal(c.ctx.__beats,2);
    assert.equal(c.run('SESSION.WARN_AT'),870);assert.equal(c.run('SESSION.END_AT'),900);
  });
  await check('overlapping heartbeat ticks and activity during an in-flight renewal are handled safely',async()=>{
    const c=hosted();c.run('CALLING.reconcile=async()=>{};SESSION.start();');c.clock.now+=60000;c.run('SESSION.touch()');
    let release,calls=0;
    c.ctx.__beat=()=>{calls++;return new Promise(resolve=>{release=resolve;});};
    c.run('SYNC.beat=()=>__beat();');
    const first=c.run('SESSION.heartbeat()');await Promise.resolve();
    await c.run('SESSION.heartbeat()');assert.equal(calls,1);
    c.clock.now++;c.run('SESSION.touch()');release(1800);await first;
    assert.equal(c.run('SESSION._beating'),false);assert.equal(c.run('SESSION.activeSinceBeat'),true);
    await c.run('SESSION.heartbeat()');assert.equal(calls,1);
  });
  console.log(`sync-bandwidth: ${checks} checks passed; held work, 10s live cadence and 15min browser idle boundary preserved.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
