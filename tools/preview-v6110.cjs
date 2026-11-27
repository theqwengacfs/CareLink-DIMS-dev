/* Render a static, self-contained preview of the v6.11.0 work so the result can
   be looked at in a browser instead of only asserted in a test:
     - the role strip's chips in all six signature colours, on the dark-green
       console from the screenshot, current chip included;
     - the Monday Procurement Protocol workspace, all four tabs.

   It runs the real source: the same CSS files and the same modules the bundle
   is built from. Nothing here ships; it writes .preview/index.html. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.resolve(__dirname, '..');
const SRC = path.join(REPO, 'v6', 'src');
const OUT_DIR = path.join(REPO, '.preview');

const CSS_ORDER = ['styles.css', 'console51.css', 'console6.css', 'portal6.css', 'audit6.css',
  'carelink63.css', 'console_color_schemes.css', 'admin_ops6.css', 'care_review.css', 'entry_theme.css'];

const store = new Map();
const el = () => ({
  style: { setProperty() {} }, classList: { add() {}, remove() {} }, appendChild() {}, remove() {},
  setAttribute() {}, querySelector: () => null, querySelectorAll: () => [], addEventListener() {},
  innerHTML: '', value: '', dataset: {}, closest: () => null, focus() {}
});
const ctx = {
  console,
  localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) },
  Blob: class { constructor(a) { this.size = String(a[0] || '').length; } },
  URL: { createObjectURL: () => 'blob:', revokeObjectURL() {} },
  document: {
    addEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
    createElement: el, body: { appendChild() {} },
    documentElement: { setAttribute() {}, setProperty() {}, style: { setProperty() {} }, getAttribute: () => null }
  },
  window: { addEventListener() {}, LOGO: 'data:image/png;base64,iVBORw0KGgo=', scrollTo() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) },
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, AbortController, Date, Math, JSON,
  FormData: class { constructor() {} get() { return ''; } },
  fetch: () => Promise.reject(new Error('offline')), location: { hash: '' }, history: { replaceState() {} }
};
ctx.globalThis = ctx;
vm.createContext(ctx);

const files = require(path.join(REPO, 'v6', 'test', 'modules.js'));
for (const f of files) {
  vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
}
const run = (code) => vm.runInContext(code, ctx);

/* Seed the demo data so the module has a register to count, and sign in as the
   procurement officer so capabilities resolve. */
run(`DB.load(); DB.seedDemo();`);
run(`AUTH.logout(); AUTH.login('procurement.kisumu','LOMAMO2026');`);
if (!run(`Boolean(AUTH.user)`)) {
  /* fall back to whoever the roster does offer, so the preview always renders */
  const firstUser = run(`(DB.db.users||[])[0]?.username || ''`);
  if (firstUser) run(`AUTH.login(${JSON.stringify(firstUser)},'LOMAMO2026');`);
}
const user = run(`AUTH.user`);

const css = CSS_ORDER.map(f => `<style>/* ${f} */\n${fs.readFileSync(path.join(SRC, f), 'utf8')}</style>`).join('\n');

/* ---- the role strip, reproduced from care6_flows.js's markup ---- */
const chipIcons = ['home', 'activity', 'users', 'package', 'receipt', 'file'];
const strip = (prefix) => `<div class="ctx-strip ws67-hero" data-dept="procure" data-role="procure">
  <div class="ctx-strip-top">
    <div class="ctx-strip-left">
      <div class="ctx-strip-copy">
        <div class="ctx-strip-kicker">
          <span class="ctx-os-pill ctx-os-badge">CARELINK OS</span>
          <span class="ctx-role-chip">Procurement Office</span>
          <span class="ctx-county-chip">Kisumu County</span>
        </div>
        <div class="ctx-strip-title">Monday Procurement Protocol</div>
        <div class="ctx-strip-sub">Operator: <b>Procurement Officer</b> · Weekly Supplier &amp; Foodbag Supply Chain</div>
      </div>
    </div>
  </div>
  <div class="ctx-role-tabs ws67-role-tabs" role="navigation">
    ${['Case Management Home', 'MCM Clinical & 120d Smart QA', 'Clinical Caseload', 'BMI Watchlist', '30-Day PDCA', 'Hospital Referrals']
      .map((label, i) => `<button type="button" class="ctx-rtab ${i === prefix ? 'on' : ''}" data-act="go"><span>${label}</span></button>`).join('')}
  </div>
</div>`;

/* Every chip, in turn, becomes the current one, so each of the six signature
   colours is seen both as a fill (current) and as ink (not current). */
const chipStates = [0, 1, 2, 3, 4, 5].map(i => `
  <div style="margin:0 0 34px">
    <div class="xs muted" style="margin:0 0 8px;font-family:monospace">current chip = position ${i + 1} — the colour that was invisible in the screenshot when the console is dark green</div>
    <div class="shell-role-banner">${strip(i)}</div>
  </div>`).join('');

/* ---- the real Monday Procurement Protocol workspace ---- */
const tabs = ['monday', 'bags', 'budget', 'orders'];
const workspace = tabs.map((tab, i) => {
  let html = '';
  try {
    html = run(`MONDAY_PROTOCOL_UI.render(AUTH.user, ${JSON.stringify({ tab, county: 'kisumu', week: '2026-W48' })})`);
  } catch (e) {
    html = `<div class="card"><div class="card-b">Render error: ${String(e.message).replace(/</g, '&lt;')}</div></div>`;
  }
  return `<section id="tab-${tab}" style="margin:0 0 56px">
    <div class="xs muted" style="margin:0 0 10px;font-family:monospace">${i + 1}. MONDAY_PROTOCOL_UI · tab = ${tab}</div>
    ${html}
  </section>`;
}).join('');

const page = `<!doctype html>
<html lang="en" data-wt="foundation" data-colorscheme="department" data-wmode="light" data-client-kind="computer" data-client-layout="wide" data-scroll="auto">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CareLink v6.11.0 — visual preview</title>
${css}
<style>
  body{background:#eef1f5;margin:0;padding:26px 20px 60px;font-family:var(--font,"Inter",system-ui,sans-serif);}
  .wrap{max-width:1180px;margin:0 auto;}
  h1.pv{font-size:19px;margin:0 0 4px;color:#14233e;}
  .pv-sub{color:#5b6b80;font-size:12.5px;margin:0 0 26px;line-height:1.6}
  .pv-h{font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#5b6b80;margin:38px 0 12px;padding-bottom:7px;border-bottom:1px solid #d7dee8}
  .pv-note{background:#fff;border:1px solid #dbe3ee;border-left:4px solid #1e40af;border-radius:10px;padding:12px 14px;font-size:12.5px;line-height:1.7;color:#26364b;margin:0 0 18px}
</style>
</head>
<body>
<div class="wrap">
  <h1 class="pv">CareLink v6.11.0 — visual preview</h1>
  <p class="pv-sub">Two things to look at. First, the current role chip: it was dark-on-dark on a green console.
  Second, the new Monday Procurement Protocol workspace, all four tabs, rendered from the real source.</p>

  <div class="pv-note"><b>How to check the chip fix:</b> in each strip below, one chip is the current one. Its label must be
  readable on its own fill in every position — that is the exact failure in the phone screenshot, where the current chip's
  text vanished into its background.</div>

  <div class="pv-h">1 · Role strip — current chip in each of the six signature colours</div>
  ${chipStates}

  <div class="pv-h">2 · Monday Procurement Protocol — the four tabs</div>
  ${workspace}
</div>
</body>
</html>`;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'index.html'), page, 'utf8');
console.log(`preview written: .preview/index.html (${(page.length / 1024).toFixed(0)} KB)`);
console.log(`signed in as: ${user ? `${user.username} (${user.roleId})` : 'no user — workspace may show a denial'}`);
