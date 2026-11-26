/* A minimal stand-in for the hosted CareLink API inside a VM context.

   Several suites need the real `api/index.js` handler behind a real `fetch`, so
   that `SYNC` exercises its actual request path — headers, tokens, 401 handling,
   outbox — rather than a stub. The handler reads the request body through
   `for await (const chunk of req)`, so `req` has to be an async iterable.

   KV is emulated closely enough for the session-lease commands the handler uses:
   SET NX/EX/XX, GET, DEL, EXPIRE and the three EVAL scripts (snapshot read,
   compare-and-renew, compare-and-delete). */
const crypto = require('node:crypto');
const path = require('node:path');
const { isSnapshotRead, conditionalPrimaryRead } = require('./kv-primary-read.cjs');

function makeKv() {
  const store = new Map();
  return {
    store,
    clear() { store.clear(); },
    has(k) { return store.has(k); },
    get(k) { return store.has(k) ? store.get(k) : null; },
    set(k, v) { store.set(k, String(v)); },
    del(k) { return store.delete(k) ? 1 : 0; },
  };
}

/* Vercel/Upstash style response object. */
function kvResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function installKvFetch(kv, { origin = 'https://kv-carelink.test' } = {}) {
  const GET = "return redis.call('GET', KEYS[1])";
  const EVAL_SNAPSHOT = 'redis.sha1hex';
  global.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.origin !== origin) throw new Error(`unexpected fetch origin ${url.origin}`);
    const raw = String(init.body || '');
    const j = (p) => decodeURIComponent(p);

    if (url.pathname.startsWith('/get/')) {
      const k = j(url.pathname.slice(5));
      return kvResponse({ result: kv.has(k) ? kv.get(k) : null });
    }
    if (url.pathname.startsWith('/set/')) {
      kv.set(j(url.pathname.slice(5)), raw);
      return kvResponse({ result: 'OK' });
    }
    if (url.pathname.startsWith('/del/')) {
      return kvResponse({ result: kv.del(j(url.pathname.slice(5))) });
    }
    if (url.pathname === '/' && init.method === 'POST') {
      const [op, ...args] = JSON.parse(raw);
      if (op === 'SET') {
        const [key, value, ...opts] = args;
        if (opts.includes('NX') && kv.has(key)) return kvResponse({ result: null });
        if (opts.includes('XX') && !kv.has(key)) return kvResponse({ result: null });
        kv.set(key, String(value));
        return kvResponse({ result: 'OK' });
      }
      if (op === 'GET') return kvResponse({ result: kv.has(args[0]) ? kv.get(args[0]) : null });
      if (op === 'DEL') return kvResponse({ result: kv.del(args[0]) });
      if (op === 'EXPIRE') return kvResponse({ result: kv.has(args[0]) ? 1 : 0 });
      if (op === 'EVAL') {
        const script = String(args[0] || '');
        const keyCount = Number(args[1]) || 0;
        const key = args[2];
        const value = args[2 + keyCount];
        if (isSnapshotRead(script)) return kvResponse({ result: conditionalPrimaryRead(kv.store, key, value) });
        if (script === GET) return kvResponse({ result: kv.has(key) ? kv.get(key) : null });
        if (/EXPIRE/.test(script)) return kvResponse({ result: kv.get(key) === String(value) ? 1 : 0 });
        if (/DEL/.test(script)) return kvResponse({ result: kv.get(key) === String(value) ? kv.del(key) : 0 });
        if (script.includes(EVAL_SNAPSHOT)) {
          const actual = kv.has(key) ? crypto.createHash('sha1').update(String(kv.get(key))).digest('hex') : 'missing';
          if (actual !== value) return kvResponse({ result: kv.get(key) === String(args[3 + keyCount]) ? 2 : 0 });
          kv.set(key, String(args[3 + keyCount]));
          return kvResponse({ result: 1 });
        }
      }
      throw new Error(`Unexpected Redis command: ${op}`);
    }
    throw new Error(`Unexpected KV request: ${url.pathname}`);
  };
}

/* One browser: its own device-cookie jar and its own API origin. */
function makeBrowser(handler, { origin = 'https://carelink.test', pathname = '/carelink-v6.html' } = {}) {
  const jar = { cookie: '' };
  let apiFetch = null;

  function dispatch(url, init = {}) {
    return new Promise((resolve, reject) => {
      const headers = { host: 'carelink.test' };
      for (const [k, v] of Object.entries(init.headers || {})) headers[String(k).toLowerCase()] = v;
      if (jar.cookie && !headers.cookie) headers.cookie = jar.cookie;
      const bodyText = init.body == null ? '' : String(init.body);
      let status = 0;
      let payload = '';
      const res = {
        set statusCode(v) { status = v; }, get statusCode() { return status; },
        setHeader(name, value) {
          if (String(name).toLowerCase() === 'set-cookie') {
            for (const c of (Array.isArray(value) ? value : [value])) {
              if (String(c).startsWith('carelink_device_v1=')) jar.cookie = String(c).split(';')[0];
            }
          }
        },
        end(chunk = '') { payload = String(chunk); resolve({ status, payload }); },
      };
      const req = {
        url: url.startsWith('/') ? url : `/${url}`,
        method: init.method || 'GET',
        headers,
        body: bodyText,
        async *[Symbol.asyncIterator]() {
          if (bodyText) yield Buffer.from(bodyText, 'utf8');
        },
        on() {},
      };
      Promise.resolve(handler(req, res)).catch(reject);
    });
  }

  apiFetch = async (input, init = {}) => {
    const u = new URL(String(input), origin);
    const { status, payload } = await dispatch(u.pathname + (u.search || ''), init);
    let parsed = {};
    try { parsed = JSON.parse(payload); } catch (_e) { parsed = { raw: payload }; }
    return { ok: status >= 200 && status < 300, status, json: async () => parsed };
  };

  return {
    jar,
    origin,
    fetch: apiFetch,
    /* The browser-side helper the suites use to name the *other* client's cookie,
       so a takeover test can act as the same physical browser or a different one. */
    setCookie(c) { jar.cookie = c || ''; },
    getCookie() { return jar.cookie; },
    location: { hash: '#/', search: '', pathname, protocol: 'https:', hostname: new URL(origin).hostname, origin },
    apiFetch,
    lastCookie() { return jar.cookie; },
  };
}

async function loadHandler() {
  const mod = await import(path.resolve(__dirname, '..', '..', 'api', 'index.js'));
  return mod.default;
}

module.exports = { makeKv, installKvFetch, makeBrowser, loadHandler, kvResponse };
