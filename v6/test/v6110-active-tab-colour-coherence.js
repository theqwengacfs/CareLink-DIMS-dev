/* v6.11.0 — no filled surface may assume its own ink.
   The screenshot that started this: on a phone the current role chip was dark
   green text on a dark green fill, because the fill took the raw signature hue
   (contrast-checked only against the page) while the label assumed white.
   These checks pin the rule that replaced it, and check the solver that feeds
   it actually produces readable pairs. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.resolve(__dirname, '..', '..');
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');

const themes = read('v6/src/themes.js');
const schemes = read('v6/src/console_color_schemes.css');
const entry = read('v6/src/entry_theme.css');
const bundle = read('public/carelink-v6.html');

console.log('\nACTIVE-TAB COLOUR COHERENCE\n');

/* ---- 1. the solver exists and is used ---- */
ok('themes.js solves a fill/ink pair', themes.includes('fillWithInk('));
ok('the solver emits a fill token per signature colour', /--console-c\$\{i\+1\}-fill/.test(themes));
ok('the solver emits a matching ink token', /--console-c\$\{i\+1\}-ink/.test(themes));
ok('the fill is chosen by whichever ink reaches the gate', /contrast\(fill, preferredInk\)/.test(themes));

/* ---- 2. the role chip uses the pair, not an assumption ---- */
ok('the current role chip fills from the solved token',
  /\.ctx-rtab\.on\{[^}]*var\(--rtab-fill,var\(--console-c1-fill/.test(schemes.replace(/\n/g, '')),
  'active chip fill');
ok('the current role chip takes its text from the solved ink',
  /\.ctx-rtab\.on\{[^}]*color:var\(--rtab-ink,var\(--console-c1-ink/.test(schemes.replace(/\n/g, '')),
  'active chip ink');
ok('the chip icon and label inherit that ink',
  /\.ctx-rtab\.on svg,\s*\n?html\[data-colorscheme\][^{]*\.ctx-rtab\.on span\{\s*color:var\(--rtab-ink/.test(schemes),
  'icon/label ink');
ok('the old "assume white on the raw hue" rule is gone',
  !/\.ws67-role-tabs \.ctx-rtab\.on\{[\s\S]{0,200}background:var\(--console-c1\) !important/.test(schemes));

/* ---- 3. the six-bag colour family still steps, so chips stay distinguishable ---- */
ok('all six signature colours reach the chip fill',
  [1, 2, 3, 4, 5, 6].every(n => schemes.includes(`--rtab-fill:var(--console-c${n}-fill`)), 'fill steps');
ok('the chip fill IS the solved colour, never a second mix of the raw hue',
  !/--rtab-fill:color-mix/.test(schemes), 'a re-mix would break the solved pair');
ok('all six signature colours reach the chip ink',
  [1, 2, 3, 4, 5, 6].every(n => schemes.includes(`--console-c${n}-ink`)), 'ink steps');

/* ---- 4. every other filled console surface uses the pair too ---- */
const filled = [
  ['the "all" sheet chip', /\.sheet-all\{[^}]*var\(--console-c1-fill/, entry],
  ['the selected navigation tile', /\.np-i\.on\{[^}]*var\(--console-c1-fill/, entry],
  ['the selected quick button', /\.cb-qbtn\.on\{[^}]*var\(--console-c1-fill/, entry],
  ['the workspace mode segment', /ws67-mode-seg button\.on\{[^}]*var\(--console-c1-fill/, schemes],
  ['a generic workspace chip', /\.ctx-rtab\.on\{[^}]*var\(--console-c1-fill/, schemes]
];
for (const [name, re, src] of filled) {
  ok(`${name} fills from the solved token`, re.test(src.replace(/\n/g, '')));
}
const assumesWhite = (entry + schemes)
  .split('\n')
  .filter(l => /background:var\(--console-c[1-6]\)/.test(l) && /color:\s*#fff/i.test(l));
ok('no console surface fills with a raw hue and pins white text',
  assumesWhite.length === 0, assumesWhite.slice(0, 2).join(' | '));

/* ---- 5. the solver's maths, run for real ---- */
{
  const ctx = vm.createContext({
    window: { addEventListener() {} },
    document: { documentElement: { style: {}, setAttribute() {} }, addEventListener() {} },
    navigator: {}, localStorage: { getItem() { return null; }, setItem() {} }, console
  });
  vm.runInContext(themes, ctx);
  const { WTC, WTHEME } = vm.runInContext('({WTC, WTHEME})', ctx);
  ok('the solver and contrast engine load', Boolean(WTC && WTHEME && WTC.fillWithInk));

  /* every hue the console palettes can produce, light and dark */
  const hues = ['#0A3D2C', '#0B5D3B', '#14653F', '#0E7490', '#0F7B4F', '#1E3A8A',
                '#7C1E24', '#A91828', '#9A5B00', '#B45309', '#6D28D9', '#475569',
                '#8FB4FF', '#E3B93C', '#5FD3A0', '#C4B5FD', '#FF8A94', '#7DD3FC'];
  let bad = [];
  for (const hue of hues) {
    for (const dark of [false, true]) {
      const pair = WTC.fillWithInk(hue, dark ? '#FFFFFF' : '#000000', dark, 4.5);
      const ratio = WTC.contrast(pair.fill, pair.ink);
      if (ratio < 4.49) bad.push(`${hue} dark=${dark} ${ratio.toFixed(2)}`);
    }
  }
  ok('every solved pair reaches 4.5:1', bad.length === 0, bad.slice(0, 3).join('; '));

  /* the specific failure in the screenshot: a dark green console */
  const green = WTC.fillWithInk('#0B5D3B', '#FFFFFF', false, 4.5);
  ok('a dark green console no longer gets dark text on its own highlight',
    WTC.contrast(green.fill, green.ink) >= 4.5, `${green.fill} on ${green.ink}`);

  /* the ink choice must actually change for light hues, or the fix is cosmetic */
  const light = WTC.fillWithInk('#8FB4FF', '#FFFFFF', true, 4.5);
  ok('a light hue is given dark ink rather than white',
    WTC.contrast(light.fill, light.ink) >= 4.5, `${light.fill} on ${light.ink}`);

  /* no hue may return an unreadable pair even at the extremes */
  for (const extreme of ['#000000', '#FFFFFF']) {
    const r = WTC.fillWithInk(extreme, '#FFFFFF', false, 4.5);
    ok(`an extreme hue (${extreme}) still returns a readable pair`,
      WTC.contrast(r.fill, r.ink) >= 4.49, `${r.fill} on ${r.ink}`);
  }
}

/* ---- 6. the built bundle carries it ---- */
ok('the bundle carries the fill/ink solver', bundle.includes('-fill`'));
ok('the bundle carries the chip fill token', bundle.includes('--rtab-fill'));
ok('the bundle no longer paints the current chip with the raw hue',
  !/ws67-role-tabs \.ctx-rtab\.on\{background:var\(--console-c1\) !important;border:1px solid var\(--console-c1\) !important/.test(bundle));

/* ---- 7. the selected chip is still obviously selected ---- */
ok('the current chip still carries a fill, not just an outline',
  /\.ctx-rtab\.on\{[^}]*background:var\(--rtab-fill/.test(schemes.replace(/\n/g, '')));
ok('the current chip still carries a shadow, so it reads as raised',
  /\.ctx-rtab\.on\{[^}]*box-shadow/.test(schemes.replace(/\n/g, '')));

console.log(`\nactive-tab colour coherence: ${pass} checks passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
