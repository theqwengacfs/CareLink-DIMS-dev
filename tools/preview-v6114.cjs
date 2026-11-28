/* =====================================================================
   preview-v6114.cjs — a look at the two layout fixes in v6.11.4, rendered
   from the real source (the same CSS order and the same navpane module).

   What it shows:
     1. the navigation identity block, at three pane widths, in a light and a
        dark theme — the tag row, the identity row, the account row;
     2. a wide register with the new slide affordances: the edge fade, the
        "slide to see all N columns" pill and the position rail;
     3. the same register after it has been slid, where the pill is spent.

   It ships nothing; it writes .preview/v6114.html.
   ===================================================================== */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.resolve(__dirname, '..');
const SRC = path.join(REPO, 'v6', 'src');
const OUT_DIR = path.join(REPO, '.preview');

const CSS_ORDER = ['styles.css', 'console51.css', 'console6.css', 'portal6.css', 'audit6.css',
  'carelink63.css', 'console_color_schemes.css', 'admin_ops6.css', 'care_review.css',
  'entry_theme.css', 'console_head7.css', 'tab_ink.css'];

const store = new Map();
/* One stable #root: the app shell boots on a timer and writes into it. */
const rootEl = { id: 'root', innerHTML: '', style: { setProperty() {} }, classList: { add() {}, remove() {} },
  querySelector: () => null, querySelectorAll: () => [], appendChild() {}, setAttribute() {} };
const el = () => ({
  style: { setProperty() {} }, classList: { add() {}, remove() {} }, appendChild() {}, remove() {},
  setAttribute() {}, querySelector: () => null, querySelectorAll: () => [], addEventListener() {},
  innerHTML: '', value: '', dataset: {}, closest: () => null, focus() {}, getAttribute: () => null,
  hasAttribute: () => false, insertBefore() {},
});
const ctx = {
  console,
  localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) },
  Blob: class { constructor(a) { this.size = String(a[0] || '').length; } },
  URL: { createObjectURL: () => 'blob:', revokeObjectURL() {} },
  document: {
    addEventListener() {}, querySelector: (sel) => (sel === '#root' ? rootEl : null),
    querySelectorAll: () => [],
    getElementById: (id) => (id === 'root' ? rootEl : null), createElement: el,
    body: { appendChild() {}, classList: { add() {}, remove() {} } },
    readyState: 'complete',
    documentElement: { setAttribute() {}, setProperty() {}, style: { setProperty() {} }, getAttribute: () => null }
  },
  window: { addEventListener() {}, LOGO: 'data:image/png;base64,iVBORw0KGgo=', scrollTo() {}, matchMedia: () => ({ matches: false, addEventListener() {} }), innerWidth: 1280 },
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, AbortController, Date, Math, JSON,
  FormData: class { constructor() {} get() { return ''; } },
  fetch: () => Promise.reject(new Error('offline')), location: { hash: '' }, history: { replaceState() {} }
};
/* The shell boots itself on a timer; give it a #root so it does not throw
   after the file has been written. This preview never runs the app shell. */
ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of require(path.join(REPO, 'v6', 'test', 'modules.js'))) {
  vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
}
const run = (code) => vm.runInContext(code, ctx);

run('DB.load(); DB.seedDemo();');
const user = run(`(DB.db.users||[]).find(u => u.roleId==='ministry_area') || (DB.db.users||[]).find(u => u.roleId && u.name) || (DB.db.users||[])[0]`);
run(`AUTH.user = ${JSON.stringify(user)};`);

/* The real pane, from the real module. --rail off so all three bands show. */
const paneHtml = run(`NAVP.html(AUTH.user, () => false)`);

/* A wide register: the sort of table a role console actually renders. */
const cols = ['Patient', 'Registration', 'Household', 'Last visit', 'Next review', 'Caregiver', 'Balance (KES)', 'Status'];
const rows = Array.from({ length: 6 }, (_, i) => ({
  c: [`Patient ${1000 + i}`, `REG-00${41 + i}`, `HH-2${10 + i}`, `2026-11-${String(3 + i).padStart(2, '0')}`,
    `2026-12-${String(1 + i).padStart(2, '0')}`, `Caregiver ${String.fromCharCode(65 + i)}`,
    (i * 1750 + 500).toLocaleString('en-KE'), ['Active', 'Review due', 'Discharged'][i % 3]]
}));
const registerHtml = run(`table(${JSON.stringify(cols.map(c => ({ label: c })))}, ${JSON.stringify(rows.map(r => Object.fromEntries(r.c.map((v, j) => ['c' + j, v]))))}, { key: 'c0', cols: [] })`);

const css = CSS_ORDER.map(f => `<style>/* ${f} */\n${fs.readFileSync(path.join(SRC, f), 'utf8')}</style>`).join('\n');
const srcOf = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

const page = `<!doctype html>
<html lang="en" data-wt="foundation" data-wmode="light" data-colorscheme="department">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CareLink v6.11.4 — identity block &amp; slide affordances</title>
${css}
<style>
  body { margin: 0; background: #eef1f5; font-family: system-ui, -apple-system, Segoe UI, sans-serif; }
  .pv-wrap { max-width: 1180px; margin: 0 auto; padding: 28px 20px 64px; }
  .pv-title { font-size: 25px; font-weight: 800; letter-spacing: -.03em; color: #101828; margin: 0 0 6px; }
  .pv-sub { color: #475467; font-size: 14px; line-height: 1.6; margin: 0 0 26px; max-width: 78ch; }
  .pv-h { font-size: 13px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: #61351F;
    margin: 34px 0 12px; padding-bottom: 7px; border-bottom: 2px solid #d8ccbf; }
  .pv-note { background: #fff; border: 1px solid #dfe3ea; border-left: 4px solid #1E3A8A; border-radius: 10px;
    padding: 13px 16px; font-size: 13.2px; line-height: 1.65; color: #344054; margin-bottom: 18px; }
  .pv-note b { color: #101828; }
  .pv-row { display: flex; gap: 20px; flex-wrap: wrap; align-items: flex-start; }
  .pv-frame { border-radius: 14px; overflow: hidden; box-shadow: 0 10px 30px rgba(16,24,40,.13); }
  .pv-cap { font-size: 11.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
    color: #667085; margin: 10px 0 0; }
  .npane { display: flex; flex-direction: column; height: auto; }
  .np-brand { flex: none; }
  .np-scroll { display: none; }
  .pv-dark { background: #0F131A; }
  .pv-reg { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 4px 0 8px; }
  .pv-reg .tbl-wrap { border-radius: 10px; }
  .pv-old { border: 2px dashed #b42318; border-radius: 12px; padding: 12px; background: #fff5f2; }
  .pv-old .tag { font-size: 11px; font-weight: 800; color: #b42318; letter-spacing: .05em; text-transform: uppercase; }
</style>
</head>
<body>
<div class="pv-wrap">
  <h1 class="pv-title">v6.11.4 — the top-left identity block, and the slide affordances</h1>
  <p class="pv-sub">Both fixes are rendered here from the real source: the same stylesheet order the bundle uses and the
  same <code>navpane.js</code>. Nothing is a mock-up.</p>

  <div class="pv-h">1 · The identity block, at three pane widths</div>
  <div class="pv-note"><b>What was wrong:</b> the coloured tag was a flex <i>sibling</i> of the logo and the title, so on a
  300&nbsp;px pane it took about 120&nbsp;px from the title column and the console name collapsed to
  &ldquo;Ministry Area&nbsp;…&rdquo;. The role name was pushed into the bottom corner and &ldquo;Signed in as&rdquo; wrapped
  over two lines in a column too narrow for it.<br><br>
  <b>What is there now:</b> three stacked bands, each owning a row — the <b>tag row</b> (with the close control opposite it),
  the <b>identity row</b> (logo + console name on two lines + role), and the <b>signed-in row</b> on its own rule.
  Nothing can squeeze anything.</div>
  <div class="pv-row">
    <div>
      <div class="pv-frame" style="width:300px;background:#0B3B45">${paneHtml}</div>
      <p class="pv-cap">300 px pane · the narrow case from the screenshot</p>
    </div>
    <div>
      <div class="pv-frame" style="width:248px;background:#0B3B45">${paneHtml}</div>
      <p class="pv-cap">248 px pane · still two lines for the name, never an ellipsis</p>
    </div>
    <div class="pv-dark">
      <div class="pv-frame" style="width:300px;background:#101722">${paneHtml}</div>
      <p class="pv-cap">300 px pane, dark chrome · same three bands</p>
    </div>
  </div>

  <div class="pv-h">2 · A wide register, before and after a slide</div>
  <div class="pv-note"><b>What to look at:</b> the register below is wider than its panel, exactly as a real one is.
  The <b>right edge fades</b>, a <b>&ldquo;Slide to see all 8 columns&rdquo;</b> pill appears once, and the
  <b>position rail</b> under the sheet shows how much is off-screen. Slide the sheet (or drag the rail) and the pill
  is spent: it does not come back. The second copy is already slid, so you can see the far end — where the fade moves
  to the left and the pill is gone.</div>
  <div class="pv-row">
    <div style="flex:1 1 420px;min-width:320px">
      <div class="pv-reg" style="max-width:430px">${registerHtml}</div>
      <p class="pv-cap">At 430 px · fade, pill and rail all visible</p>
    </div>
    <div style="flex:1 1 420px;min-width:320px">
      <div class="pv-reg" style="max-width:430px">${registerHtml.replace('class="tbl-wrap"', 'class="tbl-wrap" data-pv-slid="1"')}</div>
      <p class="pv-cap">The same sheet at its far end · pill spent, fade moved to the left</p>
    </div>
  </div>
</div>

<script>
/* The real module, so the measurements and classes are its own. */
${srcOf('table_hints.js')}

/* Drive the two preview copies: the second one is scrolled to its end so the
   "already slid" state can be seen without touching it. */
window.addEventListener('load', () => {
  const sheets = [...document.querySelectorAll('.tbl-wrap')];
  sheets.forEach(s => TABLE_HINTS.decorate(s));
  const slid = sheets[1];
  if (slid) {
    slid.scrollLeft = slid.scrollWidth;
    slid.__thMoved = true;
    slid.classList.add('th-moved');
    TABLE_HINTS.update(slid);
  }
  /* A phone-width register: show the card-stack fallback instead of sliding. */
  TABLE_HINTS.paint();
});
</script>
</body>
</html>`;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'v6114.html'), page, 'utf8');
console.log(`preview written: .preview/v6114.html (${(page.length / 1024).toFixed(0)} KB)`);
