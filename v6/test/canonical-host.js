/* Canonical-address regression: execute redirects, boot guards and the worker
   without contacting any live host, API, database or browser storage. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { makeCtx } = require('./dom');

const ROOT = path.join(__dirname, '../..');
const OFFICIAL = 'https://care-link-dims-dev-three.vercel.app/';
const PAGES = 'https://theqwengacfs.github.io/CareLink-DIMS-dev/';
const FORMER = 'https://care-link-dims-dev.vercel.app/';
const HOSTS = [OFFICIAL, FORMER, 'https://carelink-preview.test/', 'http://localhost:5173/'];
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
let groups = 0;
const passed = label => { groups++; console.log('  ok  ' + label); };

async function checkEntries() {
  for (const file of ['index.html', 'v6/pwa-head.html', 'public/carelink-v6.html', 'v6/LOMAMO-CareLink-DIMS-v6.0.html']) {
    const html = read(file);
    assert.equal(html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/)[1], OFFICIAL, file);
    const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
      .map(match => match[1]).find(text => text.includes('theqwengacfs.github.io') && text.includes('location.replace'));
    assert.ok(script, file + ' has an early retired-Pages guard');
    for (const origin of [PAGES, ...HOSTS, 'file:///synthetic-repository/index.html']) {
      const url = new URL(origin), redirects = [], probes = [];
      const location = { hostname: url.hostname, protocol: url.protocol, hash: '#/login?fixture=synthetic', replace: target => redirects.push(target) };
      vm.runInNewContext(script, {
        location, window: { location },
        fetch: (target, options) => { probes.push({ target, options }); return Promise.resolve({ ok: true }); },
      }, { filename: file });
      await new Promise(resolve => setImmediate(resolve));
      if (origin === PAGES) {
        assert.deepEqual(redirects, [OFFICIAL], file + ' redirects to the bare official root');
        assert.equal(probes.length, 0, file + ' never probes a bundle/API on Pages');
      } else if (file === 'index.html') {
        const version = JSON.parse(read('package.json')).version;
        assert.deepEqual(redirects, [(url.protocol === 'file:' ? 'public/' : '') + `carelink-v6.html?v=${version}`], file + ' retains local/preview/offline routing');
        assert.equal(probes.length, url.protocol === 'file:' ? 0 : 1);
        for (const probe of probes) {
          assert.ok(!/^[a-z]+:/i.test(probe.target), 'bundle probes remain relative to the serving origin');
          assert.equal(probe.options.method, 'HEAD');
          assert.equal(probe.options.cache, 'no-store');
        }
      } else {
        assert.deepEqual(redirects, [], file + ' does not retire another deployment or interfere with previews/files');
        assert.equal(probes.length, 0);
      }
    }
    passed(file + ': canonical link, Pages destination and same-origin/local entries');
  }
  assert.ok(read('index.html').includes(`class="cta" href="${OFFICIAL}"`), 'the no-script/manual entry uses the official root');
  for (const file of ['README.md', 'tools/OWNER-RECOVERY.md']) assert.ok(read(file).includes(`<${OFFICIAL}>`), file + ' points staff to the official root');
  passed('manual entry and staff/recovery documentation use the current address');
}

async function checkBootGuard() {
  const redirects = [], network = [];
  const { run, ctx } = makeCtx({
    location: { hostname: new URL(PAGES).hostname, replace: target => redirects.push(target) },
    fetch: (...args) => { network.push(args); throw new Error('retired host must not contact a backend'); },
  });
  run(`DB.db=DB.blank();DB.db.meta.label='Synthetic retained workspace';APPX.dirty=true;
    localStorage.setItem('synthetic-held-work','retained');
    globalThis.__loads=0;DB.load=()=>{__loads++;throw new Error('retired host must not load/commission the workspace')};`);
  const before = run('JSON.stringify(DB.db)');
  assert.equal(run('CANONICAL_HOST.origin'), OFFICIAL.slice(0, -1));
  await run('boot()');
  assert.deepEqual(redirects, [OFFICIAL]);
  const notice = run("document.querySelector('#root').innerHTML");
  assert.match(notice, /Do not commission/);
  assert.match(notice, /not deleted or automatically uploaded/);
  assert.ok(notice.includes(`href="${OFFICIAL}"`));
  for (const replace of [undefined, () => { throw new Error('synthetic navigation blocked'); }]) {
    ctx.location.replace = replace;
    await run('_booted=false;boot()');
    assert.equal(run('CANONICAL_HOST.enforce()'), true, 'stop boot even without successful navigation');
  }
  assert.equal(run('__loads'), 0);
  assert.equal(network.length, 0);
  assert.equal(run('JSON.stringify(DB.db)'), before);
  assert.equal(run("localStorage.getItem('synthetic-held-work')"), 'retained');
  assert.equal(run('APPX.dirty'), true);
  assert.equal(run("CANONICAL_HOST.isRetired('THEQWENGACFS.GITHUB.IO')"), true);
  passed('retired Pages boot stops even with blocked navigation; records and held work remain untouched');
  for (const origin of HOSTS.concat('file:///synthetic-repository/index.html')) {
    ctx.location.hostname = new URL(origin).hostname;
    assert.equal(run('CANONICAL_HOST.enforce()'), false, 'the URL update does not retire ' + origin);
  }
  passed('current/former Vercel, preview, localhost and downloaded-file hosts remain bootable');
}

function worker(scope) {
  const handlers = {}, fetched = [], opened = [], written = [], deleted = [], matched = [];
  const location = new URL(scope);
  let offline = false, skipped = 0, claimed = 0;
  vm.runInNewContext(read('public/sw.js'), {
    URL, Response, setTimeout, clearTimeout,
    self: {
      location, registration: { scope },
      addEventListener: (name, handler) => { handlers[name] = handler; },
      skipWaiting: async () => { skipped++; }, clients: { claim: async () => { claimed++; } },
    },
    caches: {
      keys: async () => ['carelink-shell-v5', 'carelink-shell-v6', 'carelink-shell-v7', 'carelink-shell-v8', 'carelink-shell-v9', 'carelink-shell-v10', 'carelink-shell-v11', 'carelink-shell-v12', 'carelink-shell-v13', 'carelink-shell-v14', 'carelink-shell-v15', 'carelink-shell-v16', 'carelink-shell-v17', 'unrelated-cache'],
      delete: async key => { deleted.push(key); return true; },
      open: async name => { opened.push(name); return { put: async (url, response) => { written.push({ url, status: response.status }); } }; },
      match: async url => { matched.push(url); return new Response('synthetic cached shell'); },
    },
    fetch: async input => {
      fetched.push(input);
      if (offline) throw new Error('synthetic network offline');
      return new Response('synthetic live shell');
    },
  }, { filename: 'public/sw.js' });
  function dispatch(name, request) {
    let done = Promise.resolve(), response;
    handlers[name]({ request, waitUntil: promise => { done = promise; }, respondWith: result => { response = Promise.resolve(result); } });
    return { done, response };
  }
  return { dispatch, fetched, opened, written, deleted, matched, setOffline: () => { offline = true; }, skipped: () => skipped, claimed: () => claimed };
}
const request = (url, { method = 'GET', mode = 'cors', headers = {} } = {}) => ({ url, method, mode, headers: new Headers(headers) });

async function checkWorkers() {
  const retired = worker(PAGES);
  await retired.dispatch('install').done;
  await retired.dispatch('activate').done;
  assert.equal(retired.skipped(), 1);
  assert.equal(retired.claimed(), 1);
  assert.deepEqual(retired.deleted, ['carelink-shell-v5', 'carelink-shell-v6', 'carelink-shell-v7', 'carelink-shell-v8', 'carelink-shell-v9', 'carelink-shell-v10', 'carelink-shell-v11', 'carelink-shell-v12', 'carelink-shell-v13', 'carelink-shell-v14', 'carelink-shell-v15', 'carelink-shell-v16', 'carelink-shell-v17'], 'only retired CareLink shell caches are removed');
  const redirect = await retired.dispatch('fetch', request(PAGES + 'carelink-v6.html?fixture=synthetic', { mode: 'navigate' })).response;
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('location'), OFFICIAL);
  assert.equal(retired.dispatch('fetch', request(PAGES + 'api/state')).response, undefined);
  for (const calls of [retired.fetched, retired.opened, retired.written, retired.matched]) assert.equal(calls.length, 0, 'retired worker never fetches or serves a commissioning shell/API');
  passed('retired Pages worker redirects only to the current official root and never serves cached data');

  for (const origin of HOSTS) {
    const active = worker(origin);
    await active.dispatch('install').done;
    assert.equal(active.fetched.length, 5, 'the active host can still install its own shell');
    assert.ok(active.fetched.every(url => new URL(url).origin === new URL(origin).origin), 'install fetches never change origin');
    await active.dispatch('activate').done;
    assert.deepEqual(active.deleted, ['carelink-shell-v5', 'carelink-shell-v6', 'carelink-shell-v7', 'carelink-shell-v8', 'carelink-shell-v9', 'carelink-shell-v10', 'carelink-shell-v11', 'carelink-shell-v12', 'carelink-shell-v13', 'carelink-shell-v14', 'carelink-shell-v15', 'carelink-shell-v16'], 'keep the current shell and unrelated caches');
    const before = [active.fetched.length, active.opened.length, active.written.length, active.matched.length];
    for (const input of [
      request(origin + 'api/state'),
      request(origin + 'carelink-v6.html', { mode: 'navigate', headers: { authorization: 'Bearer synthetic' } }),
      request(origin + 'carelink-v6.html', { mode: 'navigate', headers: { 'x-carelink-session': 'synthetic' } }),
      request(origin + 'api/state', { method: 'POST' }),
      request('https://cross-origin.test/carelink-v6.html', { mode: 'navigate' }),
    ]) assert.equal(active.dispatch('fetch', input).response, undefined, 'protected/nonlocal requests bypass the worker');
    assert.deepEqual([active.fetched.length, active.opened.length, active.written.length, active.matched.length], before);
    active.setOffline();
    const fallback = await active.dispatch('fetch', request(origin + 'carelink-v6.html', { mode: 'navigate' })).response;
    assert.equal(await fallback.text(), 'synthetic cached shell');
    assert.deepEqual(active.matched, [origin + 'carelink-v6.html'], 'offline navigation uses only this origin’s shell');
    passed(new URL(origin).host + ': same-origin install/offline shell and uncached API/auth traffic');
  }
}

(async () => {
  await checkEntries();
  await checkBootGuard();
  await checkWorkers();
  console.log(`canonical-host: ${groups} isolated entry/boot/worker groups passed; no live requests`);
})().catch(error => { console.error(error); process.exitCode = 1; });
