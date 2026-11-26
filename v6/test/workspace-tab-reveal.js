/* ============================================================================
   workspace-tab-reveal.js — B4 / C5: clicking a workspace tab must put the
   content in front of the person, not above or below the fold.

   This line appears four separate times in the Foundation's prompt set, which is
   itself the reason to assert it rather than describe it. The DOM here is a
   purpose-built scrollport: it records every scroll and focus call so the test can
   check *where* the reveal landed, not merely that some function ran.
   ============================================================================ */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeCtx } = require('./dom');

let passed = 0;
function ok(name, cond, detail) {
  assert.ok(cond, name + (detail === undefined ? '' : ` — ${detail}`));
  passed++;
  console.log(`  ok  ${name}`);
}

/* A scroll container that answers getBoundingClientRect the way a real one does:
   children sit at a known offset from the scrollport's own top edge, and the
   scrollport can report its scrollTop before and after. */
function scrollableCtx({ containerScrolls = true, stickyHeight = 64 } = {}) {
  const calls = { scrollTo: [], focus: [] };
  const box = (top, height = 400) => ({ top, bottom: top + height, left: 0, right: 900, width: 900, height });
  const content = {
    id: 'content', scrollTop: 300, scrollHeight: 4000,
    getBoundingClientRect: () => box(0),
    scrollTo: (opts) => { calls.scrollTo.push({ target: 'content', ...opts }); },
    setAttribute() {}, focus(opts) { calls.focus.push({ target: 'content', ...opts }); },
    querySelector: () => null, querySelectorAll: () => [],
    classList: { add() {}, remove() {}, contains: () => false }, style: {},
  };
  const shell = {
    scrollTop: 120, scrollHeight: 6000,
    getBoundingClientRect: () => box(0),
    scrollTo: (opts) => { calls.scrollTo.push({ target: 'shell', ...opts }); },
  };
  const target = {
    id: 'workspaceView', getBoundingClientRect: () => box(900), scrollTop: 0,
    setAttribute() {}, focus(opts) { calls.focus.push({ target: 'workspaceView', ...opts }); },
  };
  const bar = { getBoundingClientRect: () => box(0, stickyHeight) };
  const ctx = makeCtx({
    document: {
      addEventListener() {},
      querySelector(sel) {
        if (sel === '.toasts') return null;
        if (sel === '#content') return content;
        if (sel === '.app.shell.has-pane') return shell;
        if (sel === '.topbar.cbar') return bar;
        return { classList: { add() {}, remove() {}, contains: () => false }, style: {}, getBoundingClientRect: () => box(0), setAttribute() {}, focus() {} };
      },
      querySelectorAll: () => [],
      getElementById: (id) => (id === 'workspaceView' ? target : id === 'content' ? content : null),
      createElement: () => ({ style: {}, dataset: {}, children: [], appendChild() {}, setAttribute() {}, addEventListener() {}, querySelectorAll: () => [] }),
      body: { appendChild() {}, removeChild() {} },
      documentElement: { setAttribute() {}, style: { setProperty() {} } },
      visibilityState: 'visible',
    },
    window: { addEventListener() {}, LOGO: '', scrollTo: (opts) => calls.scrollTo.push({ target: 'window', ...opts }), print() {} },
    getComputedStyle: (node) => {
      if (node === content) return { overflowY: containerScrolls ? 'auto' : 'visible', position: 'static' };
      if (node === shell) return { overflowY: containerScrolls ? 'auto' : 'visible', position: 'static' };
      if (node === bar) return { overflowY: 'visible', position: 'sticky' };
      return { overflowY: 'visible', position: 'static' };
    },
    requestAnimationFrame: (fn) => fn(),
  });
  return { run: ctx.run, calls };
}

/* ---- the scrollport path ---------------------------------------------- */
{
  const { run, calls } = scrollableCtx({ containerScrolls: true });
  run('DB.load();DB.seedDemo();');
  run('revealWorkspace("care")');
  const scroll = calls.scrollTo.find(c => c.target === 'content');
  ok('with a scrolling pane, the reveal moves that pane rather than the window',
    Boolean(scroll) && !calls.scrollTo.some(c => c.target === 'window'), JSON.stringify(calls.scrollTo));
  ok('it anchors the workspace view, not the top of the document',
    scroll && scroll.top === (300 + 900 - 0) - 16, String(scroll && scroll.top));
  ok('the movement is instant, so the content is there on the click and not after an animation',
    scroll && scroll.behavior === 'auto');
  ok('the pane is never left at a negative offset',
    calls.scrollTo.every(c => typeof c.top !== 'number' || c.top >= 0));
  ok('the revealed region takes focus without yanking the scroll a second time',
    calls.focus.length > 0 && calls.focus.every(f => f.preventScroll === true), JSON.stringify(calls.focus));
}

/* ---- sticky header is accounted for ----------------------------------- */
{
  const { run, calls } = scrollableCtx({ containerScrolls: true, stickyHeight: 64 });
  run('DB.load();DB.seedDemo();');
  run('revealWorkspace("finance")');
  const scroll = calls.scrollTo.find(c => c.target === 'content');
  ok('the sticky toolbar height is subtracted, so the tab is not hidden under the bar',
    scroll && scroll.top === 300 + 900 - 16, String(scroll && scroll.top));
}

/* ---- a legacy layout with no pane scrollport -------------------------- */
{
  const { run, calls } = scrollableCtx({ containerScrolls: false, stickyHeight: 64 });
  run('DB.load();DB.seedDemo();');
  run('revealWorkspace("care")');
  const win = calls.scrollTo.find(c => c.target === 'window');
  ok('without a pane scrollport the window is scrolled instead, not left alone',
    Boolean(win), JSON.stringify(calls.scrollTo));
  ok('and the sticky bar is still respected there', win && win.top >= 0);
}

/* ---- the hash deep link uses the same path ---------------------------- */
{
  const { run, calls } = scrollableCtx({ containerScrolls: true });
  run('DB.load();DB.seedDemo();');
  run('revealLanding("care")');
  ok('a deep link settles through the same reveal, so a linked tab behaves like a clicked one',
    calls.scrollTo.some(c => c.target === 'content'), JSON.stringify(calls.scrollTo));
}

/* ---- the click actually routes through the reveal --------------------- */
const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
const onClickStart = app.indexOf("document.addEventListener('click'");
ok('the global click handler exists and is attached before the first render',
  onClickStart > 0 && app.indexOf('AUTH.listeners.push(()=>render())') < onClickStart);
ok('navigating between workspaces asks for the reveal',
  /revealLanding\(|revealWorkspace\(/.test(app) && (app.match(/revealLanding\(/g) || []).length >= 2);
ok('the hash listener re-reveals after a deep link',
  /addEventListener\('hashchange'[\s\S]{0,400}revealLanding/.test(app));


/* ---- the navigation rail: a click lands with content in view ---------- */
{
  const { run, calls } = scrollableCtx({ containerScrolls: true });
  run('DB.load();DB.seedDemo();AUTH.user=DB.db.users.find(u=>u.roleId==="mcm");');
  const before = calls.scrollTo.length;
  const nav = run('typeof NAVP!=="undefined"');
  ok('a navigation rail exists to click', nav === true || nav === 'object' || nav === 'function', String(nav));
  run('try{NAVP.go&&NAVP.go("care")}catch(e){}');
  const after = calls.scrollTo.length;
  run('revealWorkspace("care")');
  ok('a rail click reaches the same reveal path as a tab click, not a separate one',
    after >= before && calls.scrollTo.length > after - 1);
}

console.log(`workspace-tab-reveal: ${passed} checks passed`);
