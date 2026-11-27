/* Run the real pwa-install.html script against a small DOM that reports phone
 * geometry, and check where the pill actually ends up on each surface.
 *
 * This is the check the visual preview cannot make: it executes the shipping
 * script and reads the values the script itself writes, rather than reading the
 * source and trusting it.
 *
 *   node v6/test/v6110-install-pill-runtime.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const REPO = path.resolve(__dirname, '..', '..');
const script = fs.readFileSync(path.join(REPO, 'v6', 'pwa-install.html'), 'utf8')
  .replace(/^[\s\S]*?<script>/, '').replace(/<\/script>[\s\S]*$/, '');

let failures = 0;
function ok(name, condition, detail) {
  if (condition) { console.log('  ok  ' + name); return; }
  failures++;
  console.log('  FAIL ' + name + (detail === undefined ? '' : ' — ' + detail));
}

/* A DOM with just enough shape: the console furniture is present or absent, and
 * each element answers getBoundingClientRect the way a phone would. */
function makeDom({ surface, innerHeight = 844 }) {
  const listeners = { window: {}, doc: {} };
  const made = [];
  const mkEl = (tag, rect) => {
    const el = {
      tagName: String(tag).toUpperCase(), style: {}, children: [], parentNode: null, hidden: false,
      className: '', type: '', textContent: '', _attrs: {},
      setAttribute(k, v) { this._attrs[k] = String(v); }, getAttribute(k) { return this._attrs[k] ?? null; },
      hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k); },
      removeAttribute(k) { delete this._attrs[k]; },
      addEventListener() {}, removeEventListener() {},
      appendChild(child) { this.children.push(child); child.parentNode = this; made.push(child); return child; },
      getBoundingClientRect() { return rect || { top: 0, bottom: 0, height: 0, left: 0, right: 0, width: 0 }; },
      clientWidth: 390,
    };
    return el;
  };
  const body = mkEl('body');
  /* console furniture, when this surface is a console */
  const shortcuts = surface === 'console' ? mkEl('nav', { top: 596, bottom: 682, height: 86 }) : null;
  const strip = surface === 'console' ? mkEl('div', { top: 430, bottom: 596, height: 166 }) : null;
  const shell = surface === 'console' ? mkEl('div') : null;
  const landing = surface === 'landing' ? mkEl('div') : null;
  const document = {
    readyState: 'complete', body, hidden: false,
    documentElement: mkEl('html'),
    addEventListener(t, fn) { (listeners.doc[t] = listeners.doc[t] || []).push(fn); },
    createElement: (t) => mkEl(t),
    getElementById: () => null,
    querySelector(sel) {
      if (sel === '.console-shortcuts') return shortcuts;
      if (sel === '.shell-role-banner') return strip;
      if (sel === '.cb-quick') return null;
      if (sel === '.app.shell') return shell;
      if (sel === 'main.content') return surface === 'console' ? mkEl('main') : null;
      if (sel === '#workspaceView') return surface === 'console' ? mkEl('div') : null;
      if (sel === '.ld[data-front]') return landing;
      if (sel === '[data-pwa-install]') return null;
      return null;
    },
    querySelectorAll: () => [],
  };
  const window = {
    innerWidth: 390, innerHeight, location: { pathname: '/' },
    addEventListener(t, fn) { (listeners.window[t] = listeners.window[t] || []).push(fn); },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    alert() {},
  };
  const navigator = { userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-A546E) Chrome/120 Mobile Safari/537.36', onLine: true,
    serviceWorker: { register: () => Promise.resolve(), addEventListener() {}, ready: Promise.resolve(), getRegistration: () => Promise.resolve(null) } };
  const ctx = { window, document, navigator, console, location: { protocol: 'https:' },
    setTimeout: (fn) => { try { fn && fn(); } catch (_e) {} }, clearTimeout() {},
    Promise, Object, Array, String, Math, Date, JSON, CustomEvent: class {} };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(script, ctx, { filename: 'pwa-install.html' });
  return { ctx, window, document, body, listeners, made, shortcuts, strip, shell };
}

const pill = (dom) => {
  const b = dom.made.find((el) => el.className === 'pwa-install-btn');
  return b || null;
};

console.log('\n=== install pill, executed against a 390x844 phone ===');

/* ---- 1. landing page: the original pill, in the original corner -------- */
{
  const dom = makeDom({ surface: 'landing' });
  /* Android fires beforeinstallprompt; that is the real path. */
  (dom.listeners.window.beforeinstallprompt || []).forEach((fn) => fn({ preventDefault() {}, prompt() {}, userChoice: Promise.resolve({}) }));
  const b = pill(dom);
  ok('a pill is created on the landing page', !!b);
  ok('it floats, not flows', b && b.style.position === 'fixed', b && b.style.position);
  ok('it sits in the bottom-right corner, 16px from each edge',
    b && b.style.right === '16px' && b.style.bottom === '16px', b && `${b.style.right} / ${b.style.bottom}`);
  ok('it is visible', b && b.style.display === 'inline-flex', b && b.style.display);
  ok('it is attached to the body, so the landing layout cannot reflow it',
    b && b.parentNode === dom.body);
  ok('it keeps the red fill and full radius',
    b && /#B7192B/i.test(b.style.background) && b.style.borderRadius === '999px');
  ok('it says "Install CareLink"', b && b.textContent === 'Install CareLink', b && b.textContent);
}

/* ---- 2. signed-in console: same pill, stepped off the console's edge --- */
{
  const dom = makeDom({ surface: 'console' });
  (dom.listeners.window.beforeinstallprompt || []).forEach((fn) => fn({ preventDefault() {}, prompt() {}, userChoice: Promise.resolve({}) }));
  const b = pill(dom);
  ok('a pill is created inside the console too', !!b);
  ok('it still floats', b && b.style.position === 'fixed', b && b.style.position);
  ok('it still hugs the right edge', b && b.style.right === '16px', b && b.style.right);
  /* Clearance = 844 - 596 = 248 -> capped at 160. So bottom = 160px, which is
     above the shortcut row that starts at 596 from the top. */
  const bottom = b && parseInt(b.style.bottom, 10);
  ok('it is lifted clear of the console shortcut row', bottom >= 96, 'bottom=' + (b && b.style.bottom));
  ok('the lift is bounded, so a short phone cannot turn it into a banner', bottom <= 160, 'bottom=' + bottom);
  ok('it never becomes the full-width flow chip it briefly was',
    b && b.style.width === 'auto' && b.style.margin === '0', b && `${b.style.width} / ${b.style.margin}`);
  ok('it is still attached to the body', b && b.parentNode === dom.body);
}

/* ---- 3. a very short phone: the cap must hold ------------------------- */
{
  const dom = makeDom({ surface: 'console', innerHeight: 560 });
  (dom.listeners.window.beforeinstallprompt || []).forEach((fn) => fn({ preventDefault() {}, prompt() {}, userChoice: Promise.resolve({}) }));
  const b = pill(dom);
  const bottom = b && parseInt(b.style.bottom, 10);
  ok('on a 560px-tall console the pill still clears the furniture', bottom >= 64, 'bottom=' + (b && b.style.bottom));
  ok('and the cap still holds', bottom <= 160, 'bottom=' + bottom);
}

/* ---- 4. never installed twice ---------------------------------------- */
{
  const dom = makeDom({ surface: 'landing' });
  const fire = (dom.listeners.window.beforeinstallprompt || [])[0];
  fire({ preventDefault() {}, prompt() {}, userChoice: Promise.resolve({}) });
  fire({ preventDefault() {}, prompt() {}, userChoice: Promise.resolve({}) });
  const pills = dom.made.filter((el) => el.className === 'pwa-install-btn');
  ok('a second prompt event does not create a second pill', pills.length === 1, 'count=' + pills.length);
  ok('and it is not appended twice', dom.body.children.filter((c) => c.className === 'pwa-install-btn').length === 1);
}

/* ---- 5. appinstalled hides it everywhere ----------------------------- */
{
  const dom = makeDom({ surface: 'landing' });
  (dom.listeners.window.beforeinstallprompt || []).forEach((fn) => fn({ preventDefault() {}, prompt() {}, userChoice: Promise.resolve({}) }));
  const b = pill(dom);
  (dom.listeners.window.appinstalled || []).forEach((fn) => fn());
  ok('once installed the pill is hidden', b && b.style.display === 'none', b && b.style.display);
}

if (failures) { console.log(`\ninstall pill: ${failures} FAILED`); process.exit(1); }
console.log('\ninstall pill: all checks passed');
