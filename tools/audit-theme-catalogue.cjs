/* =====================================================================
   tools/audit-theme-catalogue.cjs — every theme, scored by its own tokens

   The Foundation White screenshots that started this round showed a metric
   card whose number was white on a 7% wash: 1.12:1. That was fixed for every
   theme at once, but the underlying question remained unanswered for the rest:
   can a person actually read the console in each of the 30 themes, and does
   each one look like itself rather than a recolour of its neighbour?

   This scores each theme on the pairs a console really paints:

     body text        --ink         on --bg
     surface text     --ink         on --surface
     secondary text   --ink-2       on --surface
     muted text       --muted       on --surface
     primary action   --action-ink  on --action
     status ok/warn/crit/info        ink on its own tinted panel
     banner           --chrome-ink  on --chrome
     banner muted     --chromeMuted on --chrome
     page tab         --tab-ink     on --tab-fill
     metric card      panel ink    on panel

   and measures the theme's DISTINCTNESS (how far its surface, chrome and
   action sit from every other theme's), so "apply theme" is a real choice
   rather than 30 names for four looks.

     node tools/audit-theme-catalogue.cjs [--min=4.5] [--verbose]
   ===================================================================== */
const path = require('node:path');
const { makeCtx } = require('../v6/test/dom');
const C = require('./css-cascade.cjs');

const args = process.argv.slice(2);
const MIN = Number((args.find((a) => a.startsWith('--min')) || '').split('=')[1] || 4.5);
const VERBOSE = args.includes('--verbose');

const { run } = makeCtx({ setTimeout: () => 0 });
run('DB.load();DB.seedDemo();');
run('globalThis.__cap={};globalThis.__attr={};document.documentElement={setAttribute(k,v){globalThis.__attr[k]=v},style:{setProperty(k,v){globalThis.__cap[k]=v}}};');

const themeIds = JSON.parse(run('JSON.stringify(WTHEME.list.map(t=>t.id))'));
const schemes = JSON.parse(run('JSON.stringify(CONSOLE_COLOR_SCHEMES.map(s=>s.id))'));

/* The pairs that carry text, named for the reader rather than the token. */
const PAIRS = [
  ['body text', '--ink', '--bg'],
  ['surface text', '--ink', '--surface'],
  ['secondary text', '--ink-2', '--surface'],
  ['muted text', '--muted', '--surface'],
  ['primary action', '--action-ink', '--action'],
  ['banner text', '--chrome-ink', '--chrome'],
  ['banner muted', '--chromeMuted', '--chrome'],
  ['status ok', '--ok', '--ok-bg'],
  ['status warn', '--warn', '--warn-bg'],
  ['status critical', '--crit', '--crit-bg'],
  ['status info', '--info', '--info-bg'],
];

const rows = [];
const failures = [];
const missing = new Set();

for (const id of themeIds) {
  for (const scheme of ['department']) {
    run(`(function(){DB.db.personalPrefs=DB.db.personalPrefs||{};var uu=DB.db.users[0];
      DB.db.personalPrefs[uu.id]=Object.assign({},DB.db.personalPrefs[uu.id]||{},{wtheme:${JSON.stringify(id)},colorScheme:${JSON.stringify(scheme)}});
      globalThis.__cap={};AUTH.user=uu;WTHEME.apply(uu);})()`);
    const v = JSON.parse(run('JSON.stringify(globalThis.__cap)'));
    const row = { id, worst: 99, worstPair: '', ratios: {} };
    for (const [label, fgToken, bgToken] of PAIRS) {
      const fg = C.resolveColour(`var(${fgToken})`, v);
      const bg = C.resolveColour(`var(${bgToken})`, v);
      if (!fg || !bg || typeof fg !== 'string' || typeof bg !== 'string') { missing.add(label); continue; }
      const r = C.contrast(fg, bg);
      row.ratios[label] = r;
      if (r < row.worst) { row.worst = r; row.worstPair = label; }
      if (r < MIN) failures.push({ theme: id, pair: label, fg, bg, ratio: r });
    }
    /* The selected tab: solved pair from tab_ink.css. */
    const tabInk = C.resolveColour('var(--tab-ink)', v);
    const tabFill = C.resolveColour('var(--tab-fill)', v);
    if (tabInk && tabFill && typeof tabInk === 'string' && typeof tabFill === 'string') {
      const r = C.contrast(tabInk, tabFill);
      row.ratios['page tab'] = r;
      if (r < row.worst) { row.worst = r; row.worstPair = 'page tab'; }
      if (r < MIN) failures.push({ theme: id, pair: 'page tab', fg: tabInk, bg: tabFill, ratio: r });
    }
    /* The metric card: panel ink on panel. */
    const pInk = C.resolveColour('var(--console-c1-panel-ink)', v);
    const pBg = C.resolveColour('var(--console-c1-panel)', v);
    if (pInk && pBg && typeof pInk === 'string' && typeof pBg === 'string') {
      const r = C.contrast(pInk, pBg);
      row.ratios['metric card'] = r;
      if (r < row.worst) { row.worst = r; row.worstPair = 'metric card'; }
      if (r < MIN) failures.push({ theme: id, pair: 'metric card', fg: pInk, bg: pBg, ratio: r });
    }
    row.vars = v;
    rows.push(row);
  }
}

/* ---------------- distinctness ---------------------------------------- */
/* Two themes that share a surface, chrome and action are the same theme with
   two names. Distance is measured in RGB as a rough perceptual stand-in. */
function dist(a, b) {
  if (!a || !b || typeof a !== 'string' || typeof b !== 'string') return 999;
  const A = C.hex2rgb(a), B = C.hex2rgb(b);
  return Math.sqrt((A[0] - B[0]) ** 2 + (A[1] - B[1]) ** 2 + (A[2] - B[2]) ** 2);
}
/* Sample the whole identity, not three tokens: the ground, the reading
   surface, the console head, the action colour and the ink ramp. Sampling only
   surface/chrome/action reported themes as clones when one had a warm sand
   ground and the other a cool slate one - the thing a person actually sees. */
function themePoint(v) {
  return ['--bg', '--surface', '--chrome', '--action', '--ink', '--surface-2']
    .map((k) => C.resolveColour(String(v[k]), v))
    .filter((x) => x && typeof x === 'string');
}
const clones = [];
for (let i = 0; i < rows.length; i++) {
  for (let j = i + 1; j < rows.length; j++) {
    const a = themePoint(rows[i].vars), b = themePoint(rows[j].vars);
    if (!a.length || !b.length) continue;
    let sum = 0;
    for (let k = 0; k < Math.min(a.length, b.length); k++) sum += dist(a[k], b[k]);
    const d = sum / Math.min(a.length, b.length);
    if (d < 24) clones.push({ a: rows[i].id, b: rows[j].id, d: Math.round(d) });
  }
}

/* ---------------- report ---------------------------------------------- */
rows.sort((x, y) => y.worst - x.worst);
console.log(`\n${rows.length} themes measured against ${PAIRS.length + 2} text pairs (gate ${MIN}:1)\n`);
const pad = (s, n) => String(s).padEnd(n);
for (const r of rows) {
  const flag = r.worst < MIN ? 'FAIL' : ' ok ';
  console.log(`  ${flag} ${pad(r.id, 14)} weakest ${r.worst.toFixed(2)}:1  (${r.worstPair})`);
  if (VERBOSE) console.log('       ' + Object.entries(r.ratios).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' · '));
}
if (missing.size) console.log(`\n  tokens not emitted: ${[...missing].join(', ')}`);
if (failures.length) {
  console.log(`\n${failures.length} pairs below ${MIN}:1\n`);
  for (const f of failures) console.log(`  ${pad(f.theme, 14)} ${pad(f.pair, 16)} ${f.fg} on ${f.bg} = ${f.ratio.toFixed(2)}:1`);
} else {
  console.log(`\nevery theme reads at ${MIN}:1 or better on every pair`);
}
/* Distinctness is reported, not gated. With 30 light themes that all keep
   "White" reading surfaces - which is what their names promise and what the
   Foundation asked for - some families will always sit close together: the
   warm creams differ by ~16 RGB units on the ground alone. That is a design
   note for the catalogue, not a defect to fail a build over. What IS gated is
   legibility, above. A useful report groups the families so a reader can see
   where the real separation is. */
if (clones.length) {
  const fam = new Map();
  for (const c of clones) {
    for (const id of [c.a, c.b]) {
      if (!fam.has(id)) fam.set(id, new Set());
      fam.get(id).add(id === c.a ? c.b : c.a);
    }
  }
  const crowded = [...fam.entries()].sort((x, y) => y[1].size - x[1].size).slice(0, 6);
  console.log(`\n${clones.length} theme pairs sit close together (distance < 24 RGB units).`);
  console.log('These are families that share a white reading surface by design; the closest are:');
  for (const c of clones.slice(0, 6)) console.log(`  ${pad(c.a, 14)} ~ ${pad(c.b, 14)} ${c.d}`);
  console.log('\nMost crowded (a candidate for retiring or re-grounding in a future pass):');
  for (const [id, set] of crowded) console.log(`  ${pad(id, 14)} close to ${set.size} others`);
} else {
  console.log('every theme is visually distinct from every other');
}
process.exitCode = failures.length ? 1 : 0;
