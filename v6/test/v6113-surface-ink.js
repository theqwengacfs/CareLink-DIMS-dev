/* =====================================================================
   v6113-surface-ink.js — text on a tinted panel gets its own solved ink

   The screenshot: the hero metric cards on a green Foundation console showed
   "Caregiver Feedback 71" as white text on a 7% wash of the console hue. White
   on that wash is 1.12:1 — the number was painted, and invisible. It was not a
   missing rule and not a bad token: the card's SURFACE came from one layer (a
   wash of the signature hue over --surface) and its NUMBER came from another
   (a hard #fff), and nobody had solved the pair together.

   Two related faults surfaced while fixing it:
     * the same rule set white text on an alert card that is actually pale;
     * in a DARK theme the card panel is darker than the page, so a hue
       corrected to read ON THE PAGE lost contrast on the panel (4.34:1).

   These checks lock the fix at the level where it can regress:
     1. no metric-card rule pins a literal white ink on the pale wash;
     2. the card reads a token pair, not a bare colour;
     3. themes.js solves that pair AGAINST THE PANEL, per theme mode;
     4. the whole catalogue reads at 4.5:1 (tools/audit-theme-catalogue.cjs);
     5. the wider surface sweep stays available on demand.
   ===================================================================== */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..', '..');
const SRC = path.join(REPO, 'v6', 'src');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, ' ');

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};

console.log('\nSURFACE INK\n');

const entry = strip(read('entry_theme.css'));
const schemes = strip(read('console_color_schemes.css'));
const themes = read('themes.js');

/* ---- 1. the exact rule that hid the number --------------------------- */
ok('no rule pins white text on the pale metric wash',
  !/\.ws67-qcard:not\(\.is-alert\)[^{]*\{[^}]*color:\s*#fff/i.test(entry) &&
  !/\.ws67-hero \.ws67-qcard[^{]*\{[^}]*color:\s*#fff/i.test(schemes),
  'a literal #fff ink on a wash');

ok('the foundation metric card uses the solved ink, not white',
  /\.ws67-qcard:not\(\.is-alert\) :is\(\.ws67-qnum,\.ws67-qlbl,\.ws67-qlbl svg\)\{color:var\(--console-q-ink/.test(entry),
  'entry_theme card ink');

/* The alert card is pale (#fff4df). White text there is the same defect. */
ok('the alert card ink is dark, not white',
  !/\.ws67-qcard\.is-alert[^{]*\{[^}]*color:\s*#fff/i.test(schemes) &&
  /\.ws67-qcard\.is-alert[^{]*\{[^}]*color:#573c15/i.test(schemes),
  'alert card ink');

/* ---- 2. the card reads a pair ---------------------------------------- */
ok('the card takes its surface from a panel token',
  /\.ws67-qcard:not\(\.is-alert\)\{[^}]*background:var\(--console-q-panel/.test(schemes),
  'card surface');
ok('the card takes its ink from the same pair',
  /\.ws67-qcard:not\(\.is-alert\)\{[^}]*--console-q-ink:var\(--console-c1-panel-ink/.test(schemes),
  'card ink token');
ok('all six signature hues carry a panel and a panel ink',
  [1, 2, 3, 4, 5, 6].every((n) => schemes.includes(`--console-q-panel:var(--console-c${n}-panel`)),
  'six hues');
ok('the number and label share one ink declaration',
  /\.ws67-qcard:not\(\.is-alert\) :is\(\.ws67-qnum,\.ws67-qlbl,\.ws67-qlbl svg\)\{color:var\(--console-q-ink/.test(schemes),
  'combined ink rule');

/* ---- 3. the solver is panel-aware ------------------------------------ */
ok('themes.js solves an ink against the panel it is printed on',
  /-panel-ink/.test(themes) && /contrast\(onPanel, panel\)/.test(themes),
  'panel solver');
ok('it runs the correction in the direction the theme needs',
  /const dir2 = dark \? '#FFFFFF' : '#000000'/.test(themes),
  'correction direction');
ok('every theme emits a panel pair for all six hues',
  /set\(`--console-c\$\{i\+1\}-panel`/.test(themes) && /set\(`--console-c\$\{i\+1\}-panel-ink`/.test(themes));

/* ---- 4. the whole catalogue still reads ------------------------------ */
let out = '';
let ran = true;
try {
  out = execFileSync(process.execPath, [path.join(REPO, 'tools', 'audit-theme-catalogue.cjs')],
    { cwd: REPO, encoding: 'utf8', timeout: 120000 });
} catch (e) {
  out = String(e.stdout || '') + String(e.stderr || '');
  ran = false;
}
ok('every theme in the catalogue is measured', ran, out.slice(-300));
ok('every theme reads at 4.5:1 or better on every text pair',
  /every theme reads at 4\.5:1 or better/.test(out),
  (out.match(/^  \S+ .*(status|action|text|card|tab).*$/gim) || []).join(' | '));
ok('the catalogue covers all 45 themes', /45 themes measured/.test(out), (out.match(/\d+ themes measured/) || [])[0]);

/* ---- 5. the wider sweep is registered as an on-demand gate ---------- */
const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
ok('the full surface sweep is a named script', Boolean(pkg.scripts['test:surface']),
  'package.json test:surface');
ok('the sweep is not inlined into test:all (it is minutes long)',
  !String(pkg.scripts['test:all']).includes('audit-surface-ink'),
  'test:all must stay fast');

/* ---- 6. Foundation White is the default, and switching applies it ---- */
ok('Foundation White is the default console theme',
  /const WT_DEFAULT = 'foundation'/.test(themes), 'WT_DEFAULT');
const settings = strip(read('views_settings.js'));
ok('each theme is offered as a real, selectable card',
  /WTHEMES\.map\(t=>wtCard/.test(settings), 'theme grid');
ok('the card states whether it is the one in use',
  /In use/.test(settings) && /aria-pressed=/.test(settings), 'applied state');

console.log(`\nsurface ink: ${pass} checks passed, ${fail} failed`);
if (fail) process.exitCode = 1;
