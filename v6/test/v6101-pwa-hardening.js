/* ============================================================================
   v6101-pwa-hardening.js — the installed-app shell, checked as behaviour.

   Four things a caregiver depends on when the tablet is on a Kisumu lane
   instead of an office desk:
     1. the install button is actually attached, whatever the host did with the
        script's position in the document;
     2. a lost network is stated plainly, and work typed offline is still held;
     3. a new build on the device offers a reload instead of silently serving
        the old one;
     4. the manifest and worker keep the guarantees already pinned by
        pwa-offline.js (API never cached, navigation falls back to the shell).

   The shell script has no build step, so it is read as text and exercised in a
   minimal DOM: no browser is needed, and a regression fails the suite.
   ============================================================================ */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const installScript = fs.readFileSync(path.join(ROOT, 'v6', 'pwa-install.html'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'public', 'sw.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'manifest.webmanifest'), 'utf8'));

let passed = 0;
function check(name, condition, detail) {
  if (!condition) throw new Error(name + (detail === undefined ? '' : ` — ${detail}`));
  passed++;
  console.log(`  ok  ${name}`);
}

/* ---- a DOM just large enough for the shell ------------------------------- */
function makeShellDom({ online = true, body = true, ios = false } = {}) {
  const listeners = {};
  const appended = [];
  const store = new Map();
  const mkEl = (tag = 'div') => {
    const el = {
      tagName: tag.toUpperCase(), children: [], style: {}, _text: '', id: '', type: '', parentNode: null,
      setAttribute(k, v) { this[k] = v; }, getAttribute(k) { return this[k] ?? null; },
      addEventListener(type, fn) { (this._on = this._on || {})[type] = fn; },
      appendChild(child) { this.children.push(child); child.parentNode = this; appended.push(child); return child; },
      remove() { this.parentNode = null; },
      set textContent(v) { this._text = String(v); this.children.length = 0; },
      get textContent() { return this._text; },
      removeEventListener() { }
    };
    return el;
  };
  const bodyEl = mkEl('body');
  const docListeners = {};
  const document = {
    readyState: body ? 'complete' : 'loading',
    hidden: false,
    body: body ? bodyEl : null,
    documentElement: mkEl('html'),
    addEventListener(type, fn) { (docListeners[type] = docListeners[type] || []).push(fn); },
    getElementById(id) { return store.get(id) || null; },
    createElement: mkEl
  };
  /* the shell registers strips by id after creating them */
  const originalAppend = bodyEl.appendChild.bind(bodyEl);
  bodyEl.appendChild = (child) => { if (child.id) store.set(child.id, child); return originalAppend(child); };

  const winListeners = {};
  const swListeners = {};
  const registrations = [];
  const navigator = {
    userAgent: ios ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1' : 'Mozilla/5.0 (Linux; Android 13; SM-T500) Chrome/120 Mobile Safari/537.36',
    onLine: online,
    serviceWorker: {
      controller: { postMessage(msg) { swListeners.posted = (swListeners.posted || []).concat(msg); } },
      register(src) { registrations.push({ src }); return Promise.resolve({ waiting: null, addEventListener() { } }); },
      addEventListener(type, fn) { swListeners[type] = fn; },
      getRegistration() { return Promise.resolve({ waiting: null, addEventListener() { } }); },
      get ready() { return Promise.resolve({ waiting: null, addEventListener() { } }); }
    }
  };
  const window = {
    MSStream: undefined,
    addEventListener(type, fn) { (winListeners[type] = (winListeners[type] || []).concat(fn)); },
    dispatchEvent(ev) { (winListeners[ev.type] || []).forEach(fn => fn(ev)); return true; },
    matchMedia() { return { matches: false }; },
    alert() { },
    CustomEvent: class { constructor(type) { this.type = type; } }
  };
  const ctx = {
    window, document, navigator, console, setTimeout: (fn) => { try { fn && fn(); } catch (_) { } },
    clearTimeout() { }, location: { protocol: 'https:', hostname: 'carelink.app', reload() { ctx.__reloaded = true; } },
    Promise, Object, Array, String, Math, Date, JSON, CustomEvent: window.CustomEvent
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(installScript.replace(/^<script>/, '').replace(/<\/script>\s*$/, ''), ctx, { filename: 'pwa-install.html' });
  return { ctx, appended, winListeners, docListeners, swListeners, registrations, bodyEl, store };
}

/* ---- 1. the install button is attached even before the body exists ------- */
{
  /* A host that injects this block into <head>: document.body is null while the
     script runs. The old build appended immediately and the button was lost. */
  const early = makeShellDom({ body: false });
  check('a host that injects the shell before <body> exists does not throw', true);
  check('no button is appended to a body that does not exist yet', early.appended.length === 0);
  check('the install prompt is still captured when there is no body to draw into',
    typeof early.winListeners.beforeinstallprompt === 'object' && early.winListeners.beforeinstallprompt.length === 1);

  /* ...and it is attached once the document is ready. */
  const late = makeShellDom({ body: true });
  late.winListeners.beforeinstallprompt[0]({ preventDefault() { }, prompt() { }, userChoice: Promise.resolve({ outcome: 'dismissed' }) });
  const button = late.appended.find(el => el.tagName === 'BUTTON' && /Install CareLink/.test(el.textContent));
  check('the install button is attached to the document and shown', !!button && button.style.display === 'block');
  check('the install button is reachable by keyboard and pointer',
    button.type === 'button' && button['aria-label'] === 'Install CareLink on this device');
  check('the button lives inside the body, not in a detached node', button.parentNode === late.bodyEl);
}

/* ---- 2. the button survives a re-attach (cached shell, pageshow) -------- */
{
  const dom = makeShellDom({ body: true });
  dom.winListeners.beforeinstallprompt[0]({ preventDefault() { }, prompt() { }, userChoice: Promise.resolve({}) });
  const first = dom.appended.filter(el => /Install CareLink/.test(el.textContent)).length;
  dom.winListeners.pageshow.forEach(fn => fn());
  const again = dom.appended.filter(el => /Install CareLink/.test(el.textContent)).length;
  check('a cached shell replay does not stack duplicate install buttons', first === 1 && again === 1, `${first} → ${again}`);
}

/* ---- 3. the offline notice is stated, and it is not a false promise ----- */
{
  const dom = makeShellDom({ body: true, online: false });
  (dom.winListeners.load || []).forEach(fn => fn());
  check('the shell does not place a fixed offline overlay over navigation', !dom.store.get('carelink-offline'));
  const entry = fs.readFileSync(path.join(ROOT, 'v6/src/entry6.js'), 'utf8');
  const app = fs.readFileSync(path.join(ROOT, 'v6/src/app.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'v6/src/entry_theme.css'), 'utf8');
  check('landing and sign-in contain in-flow network indicators', (entry.match(/data-network-indicator/g) || []).length >= 2);
  check('every workspace has an in-flow network indicator with sync details', /class="network-indicator workspace-network[^>]*data-act="open-sync"/.test(app));
  check('indicators update on network change and are hidden when online', /querySelectorAll\('\[data-network-indicator\]'\)/.test(app) && /el.hidden = navigator.onLine !== false/.test(app) && /network-indicator\[hidden\]/.test(css));

  const online = makeShellDom({ body: true, online: true });
  (online.winListeners.load || []).forEach(fn => fn());
  const hidden = online.store.get('carelink-offline');
  check('a connected device shows no offline notice', !hidden || hidden.style.display === 'none');

  /* Coming back online must hand control to the console, which owns the engine. */
  const events = [];
  online.ctx.window.dispatchEvent = (ev) => { events.push(ev.type); (online.winListeners[ev.type] || []).forEach(fn => fn(ev)); };
  online.winListeners.online.forEach(fn => fn());
  check('regaining the network announces it to the console instead of silently waiting',
    events.includes('carelink:network-online'), events.join(','));
}

/* ---- 4. a new build on the device offers a reload ----------------------- */
{
  const dom = makeShellDom({ body: true });
  /* The worker build tells the page a newer version is waiting. */
  dom.swListeners.message({ data: { type: 'CARELINK_UPDATE' } });
  const strip = dom.store.get('carelink-update');
  check('a waiting build raises a reload notice', !!strip && strip.style.display === 'flex');
  check('the reload notice is worded as a version change, not an error',
    /newer version/i.test(strip.children.map(c => c.textContent).join(' ')));
  const reload = strip.children.find(c => c.tagName === 'BUTTON');
  reload._on.click();
  check('reloading asks the worker to take over before the page reloads',
    dom.swListeners.posted && dom.swListeners.posted.some(m => m.type === 'CARELINK_SKIP_WAITING'));
  check('the page is actually reloaded', dom.ctx.__reloaded === true);
}

/* ---- 5. the worker keeps its existing guarantees ----------------------- */
check('the worker bypasses API and authenticated requests', sw.includes("url.pathname.includes('/api/')") && sw.includes("request.headers.has('x-carelink-session')"));
check('navigation still falls back to the cached shell', sw.includes("request.mode === 'navigate'") && sw.includes('caches.match(APP_URL)'));
check('the shell cache name was bumped so clients take the new worker', /const CACHE = 'carelink-shell-v13'/.test(sw), (sw.match(/carelink-shell-v\d+/) || [])[0]);
check('a stalled navigation falls back to the shell within a bounded time',
  /NAV_TIMEOUT_MS\s*=\s*\d+/.test(sw) && /Promise\.race/.test(sw));
check('the worker honours the page request to activate a waiting build', /CARELINK_SKIP_WAITING/.test(sw) && /skipWaiting\(\)/.test(sw));

/* ---- 6. manifest is installable and useful ---------------------------- */
check('the manifest launches standalone at the application bundle',
  manifest.display === 'standalone' && manifest.start_url === './carelink-v6.html' && manifest.id === './carelink-v6.html');
check('the manifest declares a maskable icon and both required sizes',
  manifest.icons.some(i => /maskable/.test(i.purpose)) && manifest.icons.some(i => i.sizes === '192x192') && manifest.icons.some(i => i.sizes === '512x512'));
check('the manifest opens an existing window instead of spawning duplicates',
  manifest.launch_handler && manifest.launch_handler.client_mode === 'navigate-existing');
check('the manifest offers shortcuts for the work a caregiver starts a shift with',
  Array.isArray(manifest.shortcuts) && manifest.shortcuts.length >= 3 && manifest.shortcuts.every(s => s.url && s.name));
/* Every shortcut must land on a view the console actually renders. */
{
  const { makeCtx } = require('./dom');
  const { run } = makeCtx();
  run('DB.load(); DB.seedDemo();');
  const views = run(`(()=>{ const u=DB.db.users.find(x=>x.roleId==='caregiver'); AUTH.user=u; return navModel(u).flatMap(g=>g.items.map(i=>i.id)); })()`);
  const targets = manifest.shortcuts.map(s => (String(s.url).split('#/')[1] || '').split('?')[0]);
  const unknown = targets.filter(t => !views.includes(t));
  check('every manifest shortcut opens a view the console renders', unknown.length === 0, unknown.join(','));
}

console.log(`pwa-hardening: ${passed} checks passed`);
