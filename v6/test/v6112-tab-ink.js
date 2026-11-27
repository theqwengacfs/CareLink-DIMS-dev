/* =====================================================================
   v6112-tab-ink.js — a selected tab may not paint its text from another layer

   The defect this suite locks down: on two phones the *label* of the current
   page tab vanished. The chip was filled by one stylesheet (the console's
   solved maroon) and the label inside it was coloured by another (the theme's
   accent-as-ink, a navy). Both colours were fine on their own; together they
   were 1.02:1. No single rule was "wrong", which is why it survived earlier
   contrast reviews: every review checked a colour against the page, and none
   checked a label against the surface that ended up behind it.

   Three kinds of check, because three different accidents can reintroduce it:

     1. STRUCTURE - tab_ink.css must exist and must declare the fill and the
        ink in the same block, for every family of selected control.
     2. HYGIENE - no selected-tab rule may colour text with --accent-fg or
        --accent-soft (ink solved for the page, and a pale wash that a console
        fill can overpaint), and no selected state may be filled in one place
        while its label is coloured in another without going through
        --tab-fill / --tab-ink.
     3. MEASUREMENT - the real cascade, resolved by tools/audit-tab-ink.cjs for
        every theme x console scheme x account signature, must be >= 4.5:1 for
        the chip, its label, its icon and every sibling control that behaves
        as a tab.
   ===================================================================== */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..', '..');
const SRC = path.join(REPO, 'v6', 'src');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};

console.log('\nSELECTED-TAB INK\n');

/* Comments are stripped before any structural test: a selector that only looks
   right because a comment above it contains the text being searched for is not
   a rule. */
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, ' ');
const tabInk = strip(read('tab_ink.css'));
const carelink = strip(read('carelink63.css'));
const schemes = strip(read('console_color_schemes.css'));
const entry = strip(read('entry_theme.css'));
const all = [carelink, schemes, entry, strip(read('console51.css')), strip(read('console6.css')),
  strip(read('audit6.css')), strip(read('styles.css'))].join('\n');

/* ---- 1. structure ---------------------------------------------------- */
ok('tab_ink.css exists and declares the shared pair', /--tab-fill\s*:/.test(tabInk) && /--tab-ink\s*:/.test(tabInk));

/* Every family of selected control named in the request. */
const FAMILIES = [
  ['sheet page tab', /\.sheet \.tab:is\(\.active, \.on\)/],
  ['module tab strip', /\.content \.tabs \.tab:is\(\.active, \.on\)/],
  ['console shortcuts', /\.console-shortcuts \.cb-qbtn\.on/],
  ['header quick bar', /\.topbar\.cbar \.cb-qbtn\.on/],
  ['collapsed rail', /\.npane \.np-i\.on/],
  ['role chip', /\.ws67-role-tabs \.ctx-rtab\.on/],
  ['layout segment', /\.ws67-mode-seg button\.on/],
  ['module tiles', /\.ws67-mod-tabs > \.tab:is\(\.active, \.on\)/],
];
for (const [name, re] of FAMILIES) {
  ok(`${name} is owned by tab_ink.css`, re.test(tabInk), 'no rule found');
}

/* The whole point: one block, both halves. */
const blocks = tabInk.split('}').map((b) => b.trim()).filter(Boolean);
const filled = blocks.filter((b) => /background(-color)?\s*:\s*var\(--tab-fill/.test(b));
ok('every filled selected state also sets its ink in the same block',
  filled.length > 0 && filled.every((b) => /color\s*:\s*var\(--tab-ink/.test(b)),
  `${filled.filter((b) => !/color\s*:\s*var\(--tab-ink/.test(b)).length} block(s) set a fill without an ink`);

/* Children must be re-pointed, not left to inherit by luck: three other
   stylesheets colour a tab's span or svg. */
ok('a selected tab re-points its label and icon at the same ink',
  /\.sheet \.tab:is\(\.active, \.on\) :is\(span, b, svg, i\)\s*\{[^}]*color:\s*var\(--tab-ink\)/.test(tabInk),
  'label/icon ink');
ok('the label ink is forced, so an earlier layer cannot win it back',
  /\.sheet \.tab:is\(\.active, \.on\) :is\(span, b, svg, i\)\s*\{[^}]*!important/.test(tabInk));
ok('icons paint from the ink, not from a fixed colour',
  /fill:\s*currentColor/.test(tabInk), 'svg fill');

/* The badge sits on the same fill and must be a tint of it, never a second hue. */
ok('the selected tab counter is a tint of its own fill',
  /\.tcount[^{]*\{[^}]*background:\s*color-mix\(in srgb, var\(--tab-ink\) 16%, var\(--tab-fill\)\)/.test(tabInk),
  'counter fill');

/* ---- 2. hygiene: no re-introduction of the unreadable pair ----------- */
const tabish = /(\.sheet \.tab|\.tabs \.tab|\.ctx-rtab|\.cb-qbtn|\.np-i|ws67-mod-tabs|hero-qtab)/;
const offenders = [];
for (const line of all.split('\n')) {
  if (!tabish.test(line)) continue;
  if (!/\.(active|on)\b/.test(line)) continue;               // only selected states
  if (/--tab-(fill|ink)|rtab-(fill|ink)|console-c\d-(fill|ink)|inherit/.test(line)) continue;
  if (/color\s*:\s*var\(--accent-fg\)/.test(line) || /background\s*:\s*var\(--accent-soft\)/.test(line)) {
    offenders.push(line.trim().slice(0, 90));
  }
}
ok('no selected tab is coloured with --accent-fg or washed with --accent-soft',
  offenders.length === 0, offenders.join(' | '));

/* The original crime scene, named so a regression is unambiguous. */
ok('the pale-wash sheet tab rule that hid the label is gone',
  !/\.sheet \.tab\.active, \.sheet \.tab\.on\{\s*background:var\(--accent-soft\)/.test(carelink));
ok('the sheet tab label no longer takes --accent-fg',
  !/\.sheet \.tab\.active span[^{]*\{[^}]*color:var\(--accent-fg\)/.test(carelink));

/* A hardcoded fill must carry a hardcoded, tested ink in the same block: the
   foundation theme is allowed its crimson, but not a foreign ink on it. */
const hardFilled = [];
for (const css of [entry, carelink, schemes]) {
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim(), body = m[2];
    /* `:not(.on)` is the *unselected* state. Testing the raw selector text
       treats it as selected and produces false alarms, so negation groups are
       removed before the state is read. */
    const positive = sel.replace(/:not\([^)]*\)/g, '');
    if (!tabish.test(positive) || !/\.(active|on)\b/.test(positive)) continue;
    if (/:hover|:focus/.test(positive)) continue;   // not a resting selected state
    const bg = (body.match(/background(?:-color)?\s*:\s*(#[0-9a-f]{3,8})/i) || [])[1];
    if (!bg) continue;
    const colour = (body.match(/(?:^|;|\s)color\s*:\s*([^;]+)/) || [])[1] || '';
    const fixed = /#[0-9a-f]{3,8}|white/i.test(colour) || /var\(--tab-ink\)/.test(colour);
    if (!fixed) hardFilled.push(`${sel.slice(0, 60)} => ${bg} / ${colour.trim()}`);
  }
}
ok('no selected tab is filled with a literal colour while its ink is a variable',
  hardFilled.length === 0, hardFilled.join(' | '));

/* ---- 3. measurement ------------------------------------------------- */
let out = '';
let auditOk = false;
try {
  out = execFileSync(process.execPath, [path.join(REPO, 'tools', 'audit-tab-ink.cjs')],
    { cwd: REPO, encoding: 'utf8', timeout: 240000 });
  auditOk = true;
} catch (e) {
  out = String(e.stdout || '') + String(e.stderr || '');
  auditOk = false;
}
const checked = (out.match(/checked (\d+) tab\/background pairs/) || [])[1];
ok('the cascade audit runs over every theme and console scheme', auditOk, out.slice(-400));
ok('it actually measured a large number of pairs', Number(checked) > 10000, `${checked} pairs`);
ok('no selected-tab pair falls below 4.5:1', !/BELOW 4\.5/.test(out), (out.match(/^  [a-z].*—.*$/gim) || []).join(' | '));
ok('every probe target could be resolved', !/COULD NOT BE CHECKED/.test(out),
  (out.match(/unresolvable[^\n]*/g) || []).join(' | '));

/* The reported geometry: on a 390px phone the strip is scrolled, and the
   selected chip is often only partly visible - so the label must be legible
   where it is drawn, not just in a desktop-width preview. The audit resolves
   the same markup at any width because the colour rules it checks are not
   width-conditional; this asserts that no selected-tab colour rule is scoped
   to a wider viewport only. */
const widthScoped = [];
for (const css of [tabInk]) {
  for (const m of css.matchAll(/@media\(min-width:\s*(9\d\d|1\d{3})px\)([^{]*\{)/g)) widthScoped.push(m[0]);
}
ok('no selected-tab colour rule is desktop-only', widthScoped.length === 0, widthScoped.join(' | '));

console.log(`\nselected-tab ink: ${pass} checks passed, ${fail} failed`);
if (fail) process.exitCode = 1;
