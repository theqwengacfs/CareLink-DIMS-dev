/* =====================================================================
   v6114-identity-and-scrollers.js — the two layout defects in the last
   screenshot, asserted against the source that ships.

   DEFECT 1  The navigation identity block, top-left.
   "The area to the top left of the screen isn't well laid out."

   What the screenshot shows: the coloured tag sat BESIDE the logo, inside the
   same flex row as the title, so the title lost ~120px and rendered as
   "Ministry Area ...". The role name was pushed into the bottom corner, and
   "Signed in as Catherine Awuor Obila" was squeezed into a column too narrow
   for it, so "Signed in as" wrapped and the name hung below the logo.

   The fix is structural: three stacked bands, each owning a row. The checks
   below assert the structure (a tag row with its own close control, an
   identity row, an account row), that the close control is no longer a
   sibling stealing width from the title, and that the title is allowed to
   wrap instead of being clipped to an ellipsis.

   DEFECT 2  Wide tables and registers.
   "Ensure that new users aren't confused when rows need sliding left and
   right to view more information."

   A wide table is a horizontal scroller that looks finished. The checks
   assert the three signals exist and are measurement-driven: a labelled,
   focusable scroller, a "slide to see all N columns" pill that is spent once
   used, and a position rail whose thumb is the visible fraction.
   ===================================================================== */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeCtx } = require('./dom');

const REPO = path.resolve(__dirname, '..', '..');
const SRC = path.join(REPO, 'v6', 'src');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

const nav = read('navpane.js');
const head = read('console_head7.css');
const hints = read('table_hints.js');

let passed = 0;
function ok(name, condition, detail) {
  if (!condition) throw new Error(name + (detail === undefined ? '' : ` — ${detail}`));
  passed++;
  console.log('  ok  ' + name);
}

const { run } = makeCtx({ setTimeout: () => 0 });
run('DB.load();DB.seedDemo();');

/* ---------- 1. The identity block ------------------------------------ */
console.log('\nThe navigation identity block (top-left of every console)\n');

ok('the identity block renders three bands, in order: tag row, identity row, account row',
  /np-brand-top[\s\S]*np-brand-id[\s\S]*np-account-name/.test(nav),
  'the three bands must appear in that order in the markup');

ok('the coloured tag is no longer a flex sibling of the logo and title',
  nav.indexOf('np-brand-top') < nav.indexOf('np-brand-id')
  && !/<div class="np-brand">\s*<img/.test(nav),
  'the logo must live inside np-brand-id, not directly in np-brand');

ok('the close control lives in the tag row, opposite the tag',
  /np-brand-top[\s\S]{0,400}data-act="nav-close"/.test(nav),
  'np-x must be inside np-brand-top so it cannot take width from the title');

ok('the title is allowed to wrap instead of being clipped to an ellipsis',
  /\.np-brand \.np-id > b \{[^}]*white-space: normal/.test(head)
  && /\.np-brand \.np-id > b \{[^}]*line-clamp: 2/.test(head)
  && !/\.np-brand \.np-id > b \{[^}]*text-overflow: ellipsis/.test(head),
  'a role name truncated to "Ministry Area ..." tells the user nothing');

ok('the title band is a two-line clamp, never three or more',
  /-webkit-line-clamp:\s*2/.test(head),
  'two lines is the budget; a longer name is a data problem, not a layout one');

ok('the signed-in band has its own row and its own rule',
  /\.np-brand \.np-account-name \{[^}]*border-top: 1px solid/.test(head)
  && /\.np-brand \.np-account-name \{[^}]*flex-wrap|\.np-account-name > span \{[^}]*flex-wrap: wrap/.test(head),
  'the account band must not be squeezed under the title');

ok('"Signed in as" and the name sit on one line until the pane is genuinely too narrow',
  /\.np-account-name > span \{[^}]*flex-direction: row/.test(head),
  'the label and the name must not be forced into a column');

/* The tag must be painted from the solved fill/ink pair, never from a literal:
   that pair is what the contrast audit measures. */
ok('the tag is painted from the solved console pair, so all 45 themes inherit it',
  /\.np-brand \.np-corr-tag \{[^}]*var\(--console-c1-fill/.test(head)
  && /\.np-brand \.np-corr-tag \{[^}]*var\(--console-c1-ink/.test(head),
  'a literal here would bypass the contrast audit');
/* And the signed-in rule must take its colour from the chrome tokens. */
ok('the signed-in band rule takes its colour from the chrome tokens',
  (() => {
    const m = /\.np-brand \.np-account-name \{([^}]*)\}/.exec(head);
    if (!m) return false;
    const body = m[1];
    return /var\(--chrome-line/.test(body)
      && !/(?:^|[^-\w])#[0-9a-fA-F]{3,6}(?:[^\w]|$)/.test(body.replace(/var\([^)]*\)/g, ''));
  })(),
  'no hardcoded colour in the account band');

ok('the folded icon rail hides the three bands instead of stacking them',
  /np-rail \.np-brand \.np-brand-top[\s\S]{0,120}display: none/.test(head),
  'a 64px rail has room for the logo only');

/* Sign in as a real seeded account: the pane is rendered from AUTH.user. */
run(`AUTH.user = (DB.db.users||[]).find(u => u.username && u.roleId) || (DB.db.users||[])[0];`);
const shell = run('renderShell()');
ok('the rendered shell contains one tag row, one identity row and one account row',
  (shell.match(/class="np-brand-top"/g) || []).length === 1
  && (shell.match(/class="np-brand-id"/g) || []).length === 1
  && (shell.match(/class="np-account-name"/g) || []).length === 1,
  'exactly one of each per console');

ok('the rendered title is not pre-truncated in the markup',
  !/…/.test(shell.replace(/[\s\S]*?np-brand-id[\s\S]*?np-account-name/, (m) => m.slice(0, 2000)).slice(0, 2000)),
  'truncation is CSS\'s job at layout time, not the template\'s');

/* Every seeded account, not just the one in the screenshot: the pane is one
   component shared by 36 accounts across eight departments. */
const roleSweep = JSON.parse(run(`JSON.stringify((() => {
  const users = (DB.db.users||[]).slice();
  const out = { total: 0, broke: [] };
  const here = () => false;
  for (const u of users) {
    if (!u || !u.roleId || !u.name) continue;
    out.total++;
    try {
      const n = NAVP.html(u, here);
      if (n.indexOf('np-brand-top') < 0 || n.indexOf('np-brand-id') < 0
          || n.indexOf('np-account-name') < 0) out.broke.push(u.name);
    } catch (e) { out.broke.push(u.name + ': ' + e.message); }
  }
  return out;
})())`));
ok('every seeded account renders all three identity bands',
  roleSweep.total >= 10 && roleSweep.broke.length === 0,
  `${roleSweep.total} accounts, broken: ${JSON.stringify(roleSweep.broke.slice(0, 3))}`);

/* ---------- 2. Wide tables and registers ----------------------------- */
console.log('\nWide tables, reports and registers\n');

ok('the hint module is registered in every builder',
  read('../../tools/sync-lovable.mjs').includes('table_hints.js')
  && read('../../v6/build.py').includes('table_hints.js')
  && fs.readFileSync(path.join(REPO, 'v6', 'test', 'modules.js'), 'utf8').includes('table_hints.js'),
  'a module missing from one builder is a module that exists in the preview only');

ok('every scrolling table family is covered, not only .tbl-wrap',
  ['tbl-wrap', 'tbl-scroll', 'reg-tbl-wrap', 'reg-table-wrap', 'chart-tbl-wrap', 'monday-review-ledger']
    .every((c) => hints.includes(c)),
  'registers and charts scroll too');

ok('the scroller is focusable and labelled, so it can be reached and read',
  hints.includes("setAttribute('tabindex', '0')") && hints.includes("setAttribute('aria-label', label)"),
  'a scroll region with no name is invisible to a screen reader');

ok('the label names the table and says it slides',
  /slide to see every column/.test(hints),
  'the accessible name has to carry the same instruction as the pill');

ok('the pill states how many columns there are',
  /Slide\$\{cols \? ` to see all \$\{cols\} columns/.test(hints),
  'the count is the part a new user needs');

ok('the pill is shown only while there is content to the right and the sheet has not been slid',
  /const show = over > 4 && !atEnd && !wrap\.__thMoved/.test(hints),
  'a hint that cannot be spent is a nag');

ok('the pill disappears for good once the reader slides the sheet',
  /wrap\.__thMoved = true;[\s\S]{0,80}classList\.add\('th-moved'\)/.test(hints),
  'sliding is the proof the hint worked');

ok('overflow is measured, never assumed from the viewport width',
  /scrollWidth - wrap\.clientWidth/.test(hints) && !/innerWidth\s*[<>]=?\s*\d+\s*\)\s*\{[\s\S]{0,80}th-hint/.test(hints),
  'a table that fits must not be decorated');

ok('the position rail thumb is the visible fraction, not a fixed size',
  /const frac = wrap\.clientWidth \/ wrap\.scrollWidth/.test(hints)
  && /thumb\.style\.width = Math\.max\(14/.test(hints),
  'the rail has to show HOW MUCH is hidden');

ok('the rail is drag-seekable and maps 1:1 onto scrollLeft',
  /wrap\.scrollLeft = target/.test(hints) && hints.includes('pointerdown'),
  'for a reader with a mouse, dragging is faster than the scrollbar');

ok('one listener per sheet, no timer, and no double-decoration on repaint',
  /if \(!wrap\.__thHooked\)/.test(hints) && !/setInterval/.test(hints),
  'consoles repaint on every action');

ok('a swipe inside the sheet does not scroll the console behind it',
  /overscroll-behavior-x: contain/.test(head),
  'the classic "I scrolled and the page moved" confusion');

ok('a mask fade marks a cut that is off to the right',
  /\.th-sheet\.th-scroll\.th-at-start:not\(\.th-at-end\) \{[\s\S]{0,220}mask-image/.test(head),
  'the leading edge of a scrolled sheet must fade too, or the user cannot tell they moved');
ok('the fade follows the measured classes and vanishes when the sheet fits',
  /\.th-sheet\.th-scroll\.th-at-start:not\(\.th-at-end\)/.test(head)
  && /\.th-sheet\.th-scroll:not\(\.th-at-start\):not\(\.th-at-end\)/.test(head),
  'a table that fits must have no fade at all');
ok('the fade is a mask, so it cannot shift a column or change the scroll width',
  !/\.th-sheet[^{]*\{[^}]*padding-(inline-)?end:[^}]*mask/.test(head)
  && /mask-image: linear-gradient\(to right, transparent 0, #000 34px/.test(head),
  'mask paints over the content; a pseudo element would occupy flow');

ok('print shows the whole sheet with no controls',
  /@media print \{\s*\.th-hint, \.th-rail \{ display: none !important; \}/.test(head),
  'a printed register must not lose its right-hand columns');

ok('reduced motion drops the nudge animation and the smooth scroll',
  /@media \(prefers-reduced-motion: reduce\) \{[\s\S]{0,120}\.th-hint-ico \{ animation: none/.test(head)
  && /@media \(prefers-reduced-motion: reduce\) \{[\s\S]{0,160}\.th-sheet \{ scroll-behavior: auto/.test(head),
  'the animation is an affordance, not the message');

ok('the other horizontally scrolling strips also mark their cut',
  /\.ws67-role-tabs > \.row \{[\s\S]{0,200}mask-image/.test(head)
  && /\.app\.shell \.sheet \{[\s\S]{0,160}mask-image/.test(head),
  'role tabs and the sheet toolbar scroll too');

ok('a dark theme lightens the rail track instead of darkening it',
  /html\[data-wmode="dark"\] \.th-rail/.test(head),
  'a dark track on a dark panel is invisible');

console.log(`\nidentity + scrollers: ${passed} checks passed, 0 failed\n`);
