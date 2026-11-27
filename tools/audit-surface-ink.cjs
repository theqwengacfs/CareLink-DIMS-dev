/* =====================================================================
   tools/audit-surface-ink.cjs — what colour is the text on that surface?

   The v6.11.3 defect: the hero metric cards ("Caregiver Feedback 71") had a
   pale 7% wash on a green banner, but their numbers and labels were forced to
   white by a later rule. White on a 7% wash is about 1.1:1 - the number was
   there, and invisible. Every colour involved was a valid token; the pair had
   simply never been solved together.

   This audit answers that question for the surfaces that carry text on top of
   a coloured console banner, where a wash and an ink can come from different
   layers:

     hero metric card      label, number and icon, resting and alert
     hero action button    the "Hospital Visits" style button inside the banner
     banner pill           the department and scope pills
     greeting / subtitle   the heading and paragraph on the banner
     KPI tile              the stat tiles under the banner
     page tab rail         the unselected chips around "All"

   For each it resolves the real cascade (tools/css-cascade.cjs), then the
   colour that actually ends up behind the text, and reports anything below
   the gate with the rule that won - so the fix goes to the responsible file.

     node tools/audit-surface-ink.cjs [--min=4.5] [--verbose] [--probe=NAME]
   ===================================================================== */
const path = require('node:path');
const { makeCtx } = require('../v6/test/dom');
const C = require('./css-cascade.cjs');

const args = process.argv.slice(2);
const MIN = Number((args.find((a) => a.startsWith('--min')) || '').split('=')[1] || 4.5);
const VERBOSE = args.includes('--verbose');

/* ---------------- the live tokens ------------------------------------- */
const { run } = makeCtx({ setTimeout: () => 0 });
run('DB.load();DB.seedDemo();');
run('globalThis.__cap={}; globalThis.__attr={}; document.documentElement={setAttribute(k,v){globalThis.__attr[k]=v},style:{setProperty(k,v){globalThis.__cap[k]=v}}};');

/* ---------------- the ancestor chain ---------------------------------- */
/* <html> carries the theme, mode, colour scheme, KPI style and tab style, and
   nearly every console rule is prefixed with html[data-wt=...] or
   html[data-colorscheme]:not(...). Building the chain without them silently
   skipped those rules, which both hid real failures and invented false ones -
   a stale `html:not([data-kpistyle="tinted"])` rule appeared to win. The
   attributes are read from the page under test and threaded onto the root. */
let ROOT_ATTRS = {};
const shell = { tag: 'div', classes: ['app', 'shell', 'has-pane'],
  parent: { tag: 'body', parent: { tag: 'html', attrs: ROOT_ATTRS } } };
const content = { tag: 'main', classes: ['content'], parent: shell };
const banner = { tag: 'div', classes: ['shell-role-banner', 'no-print'], parent: content };
const heroMain = { tag: 'div', classes: ['ws67-hero-main'], parent: banner };
const heroCopy = { tag: 'div', classes: ['ws67-hero-copy'], parent: heroMain };
const hero = { tag: 'section', classes: ['ws67-hero', 'ctx-strip'], parent: banner };
heroMain.parent = hero;
const qcard = (alert, index) => ({
  tag: 'button', classes: ['ws67-qcard'].concat(alert ? ['is-alert'] : []), index: index || 1,
  parent: { tag: 'div', classes: ['ws67-qgrid', 'hero-qtabs'], parent: heroMain },
});

const TARGETS = [
  { name: 'hero metric NUMBER', chain: { tag: 'b', classes: ['ws67-qnum'], parent: qcard(false, 1) } },
  { name: 'hero metric LABEL', chain: { tag: 'span', classes: [], parent: { tag: 'span', classes: ['ws67-qlbl'], parent: qcard(false, 1) } } },
  { name: 'hero metric LABEL text', chain: { tag: 'span', classes: ['ws67-qlbl'], parent: qcard(false, 1) } },
  { name: 'hero metric ICON', chain: { tag: 'svg', classes: [], parent: { tag: 'span', classes: ['ws67-qlbl'], parent: qcard(false, 1) } } },
  { name: 'alert metric NUMBER', chain: { tag: 'b', classes: ['ws67-qnum'], parent: qcard(true, 2) } },
  { name: 'alert metric LABEL', chain: { tag: 'span', classes: ['ws67-qlbl'], parent: qcard(true, 2) } },
  { name: 'banner greeting', chain: { tag: 'h2', classes: ['ws67-greeting'], parent: heroCopy } },
  { name: 'banner subtitle', chain: { tag: 'p', classes: ['ws67-sub'], parent: heroCopy } },
  { name: 'banner department pill', chain: { tag: 'span', classes: ['ws67-arch-pill', 'hero-dept-pill'], parent: { tag: 'div', classes: ['ws67-eyebrow'], parent: heroCopy } } },
  { name: 'banner scope pill', chain: { tag: 'span', classes: ['ws67-scope-pill'], parent: { tag: 'div', classes: ['ws67-eyebrow'], parent: heroCopy } } },
  { name: 'banner action button', chain: { tag: 'button', classes: ['btn'], parent: { tag: 'div', classes: ['ws67-actions'], parent: heroCopy } } },
  { name: 'KPI tile value', chain: { tag: 'div', classes: ['v'], parent: { tag: 'div', classes: ['kpi'], index: 1, parent: { tag: 'div', classes: ['grid', 'g4', 'ws67-kpi-row'], parent: content } } } },
  { name: 'KPI tile label', chain: { tag: 'div', classes: ['k'], parent: { tag: 'div', classes: ['kpi'], index: 1, parent: { tag: 'div', classes: ['grid', 'g4', 'ws67-kpi-row'], parent: content } } } },
  { name: 'sheet tab (not selected)', chain: { tag: 'button', classes: ['tab'], index: 4, parent: { tag: 'nav', classes: ['sheet'], parent: shell } } },
  { name: 'sheet tab label (not selected)', chain: { tag: 'span', classes: [], parent: { tag: 'button', classes: ['tab'], index: 4, parent: { tag: 'nav', classes: ['sheet'], parent: shell } } } },
  { name: 'sheet group caption', chain: { tag: 'span', classes: ['sheet-g'], parent: { tag: 'nav', classes: ['sheet'], parent: shell } } },
];

/* ---------------- the pages ------------------------------------------- */
const themeIds = JSON.parse(run('JSON.stringify(WTHEME.list.map(t=>t.id))'));
const themeModes = JSON.parse(run('JSON.stringify(WTHEME.list.reduce((a,t)=>{a[t.id]=t.mode;return a;},{}))'));
const schemeIds = JSON.parse(run('JSON.stringify(CONSOLE_COLOR_SCHEMES.map(s=>s.id))'));
const accounts = JSON.parse(run('JSON.stringify(DB.db.users.slice(0, 4).map(u=>u.id))'));

const rules = C.parseSheets();
/* The winning *rules* are fixed by the selector and the element's attributes,
   so the cascade is analysed once per target and only the token values are
   re-read per page. Without this the audit re-analysed 16 chains on each of
   1,440 pages and took minutes. */
/* A probe prints the rules that won for one target on one page. */
const probeArg = args.find((a) => a.startsWith('--probe'));
if (probeArg) {
  const name = probeArg.split('=')[1] || '';
  const t = TARGETS.find((x) => x.name.toLowerCase().includes(name.toLowerCase()));
  if (!t) { console.log('no target matching ' + name + '\n' + TARGETS.map((x) => x.name).join('\n')); process.exit(0); }
  const themeId = (args.find((a) => a.startsWith('--theme')) || '').split('=')[1] || 'foundation';
  const scheme = (args.find((a) => a.startsWith('--scheme')) || '').split('=')[1] || 'department';
  run(`(function(){DB.db.personalPrefs=DB.db.personalPrefs||{};var uu=DB.db.users[0];
    DB.db.personalPrefs[uu.id]=Object.assign({},DB.db.personalPrefs[uu.id]||{},{wtheme:${JSON.stringify(themeId)},colorScheme:${JSON.stringify(scheme)}});
    globalThis.__cap={};AUTH.user=uu;WTHEME.apply(uu);})()`);
  const vars = JSON.parse(run('JSON.stringify(globalThis.__cap)'));
  const attrs = JSON.parse(run('JSON.stringify(globalThis.__attr)'));
  Object.keys(ROOT_ATTRS).forEach((k) => delete ROOT_ATTRS[k]);
  Object.assign(ROOT_ATTRS, attrs);
  C.setPage(vars);
  const a = C.analyse(t.chain);
  const solved = C.colourise(a, vars);
  console.log(`\n${t.name} on ${themeId}/${scheme}`);
  console.log(`  ${solved ? solved.ratio.toFixed(2) + ':1  ' + solved.fg + ' on ' + solved.bg : 'unresolved'}`);
  for (const node of a.chain) {
    const cls = [...node.el.classes].map((c) => '.' + c).join('') || node.el.tag;
    if (node.bg) console.log(`  bg  ${cls.padEnd(26)} ${String(node.bg.value).slice(0, 58)}  <- ${node.bg.rule.file}:${node.bg.rule.sel.slice(0, 52)}`);
    if (node.fg) console.log(`  ink ${cls.padEnd(26)} ${String(node.fg.value).slice(0, 58)}  <- ${node.fg.rule.file}:${node.fg.rule.sel.slice(0, 52)}`);
  }
  process.exit(0);
}

const failures = [];
const unresolved = [];
let checked = 0;

const T0 = Date.now();
let pages = 0;
for (const themeId of themeIds) {
  for (const scheme of schemeIds) {
    for (const account of accounts) {
      run(`(function(){DB.db.personalPrefs=DB.db.personalPrefs||{};var uu=DB.db.users.find(u=>u.id===${JSON.stringify(account)})||DB.db.users[0];
        DB.db.personalPrefs[uu.id]=Object.assign({},DB.db.personalPrefs[uu.id]||{},{wtheme:${JSON.stringify(themeId)},colorScheme:${JSON.stringify(scheme)}});
        globalThis.__cap={};AUTH.user=uu;WTHEME.apply(uu);})()`);
      const vars = JSON.parse(run('JSON.stringify(globalThis.__cap)'));
      const attrs = JSON.parse(run('JSON.stringify(globalThis.__attr)'));
      /* Tell the cascade engine which page this is: its inline theme tokens
         outrank the sheets on <html>, and everything cached for the previous
         page must go. */
      Object.keys(ROOT_ATTRS).forEach((k) => delete ROOT_ATTRS[k]);
      Object.assign(ROOT_ATTRS, attrs);
      C.setPage(vars);
      pages++;
      if (process.env.AUDIT_PROGRESS && pages % 50 === 0) {
        process.stderr.write(`  ${pages} pages, ${Math.round((Date.now() - T0) / 1000)}s\n`);
      }
      for (const t of TARGETS) {
        const a = C.analyse(t.chain);
        const solved = C.colourise(a, vars);
        if (!solved) { unresolved.push(t.name); continue; }
        checked++;
        if (solved.ratio < MIN) {
          failures.push({ themeId, scheme, account, target: t.name, ...solved });
        } else if (VERBOSE) {
          console.log(`  ok  ${themeId}/${scheme} ${t.name}: ${solved.fg} on ${solved.bg} = ${solved.ratio.toFixed(2)}`);
        }
      }
    }
  }
}

console.log(`\nresolved ${checked} surface/ink pairs across ${themeIds.length} themes x ${schemeIds.length} schemes x ${accounts.length} signatures`);
if (unresolved.length) {
  console.log('could not resolve: ' + [...new Set(unresolved)].join(', '));
}
if (failures.length) {
  const groups = new Map();
  for (const f of failures) {
    const key = `${f.target}|${f.fgFrom.sel}|${f.bgFrom.sel}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  console.log(`\n${failures.length} BELOW ${MIN}:1 across ${groups.size} distinct rule pairs\n`);
  for (const [, g] of groups) {
    const f = g[0];
    console.log(`  ${f.target}  — ${f.ratio.toFixed(2)}:1  (${g.length} pages)`);
    console.log(`    text       ${f.fg}  from  ${f.fgFrom.file}:${f.fgFrom.sel}`);
    console.log(`    background ${f.bg}  from  ${f.bgFrom.file}:${f.bgFrom.sel}`);
    console.log(`    e.g. theme ${f.themeId}, scheme ${f.scheme}`);
  }
  process.exitCode = 1;
} else {
  console.log(`\nall surface ink pairs meet ${MIN}:1`);
}
