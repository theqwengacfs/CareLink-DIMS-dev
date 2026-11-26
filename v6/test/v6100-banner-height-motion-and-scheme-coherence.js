/* ============================================================================
   v6100-banner-height-motion-and-scheme-coherence.js

   The console banner grew downwards because the role-tab strip had been folded
   into the coloured card. This suite pins the three things fixed in 6.10.0:

   1. BANNER HEIGHT. The coloured card contains the greeting, the actions and
      the quick metrics (the .ws67-hero-main row) and nothing else. The role
      strip is a sibling of the card, so the gradient ends on the line under
      that row - the "middle border line" in the report. Measured as: every
      tab, the Layout control and the whole .ws67-role-tabs block sit AFTER the
      closing </section> of the card, and no stylesheet paints a border or a
      background onto the strip inside the banner.

   2. ONE COLOUR SYSTEM. The eight console schemes must not repaint a console
      in a second palette. Accent colours in the banner, the metric cards, the
      tabs, the KPI rails and the sidebar must be derived from the console's
      own signature (--console-c1..c6 / --console-hero-1..3), and the fixed
      hex lists that used to override it must be gone.

   3. MOTION. Page changes, sheet (dialog) open/close and switches animate,
      and every one of them is removed for a reader who asked for reduced
      motion or switched Interface animation off, and under @media print.
   ============================================================================ */
const fs = require('node:fs');
const path = require('node:path');
const { makeCtx } = require('./dom');

const REPO = path.resolve(__dirname, '..', '..');
const SRC = path.join(REPO, 'v6', 'src');
const read = f => fs.readFileSync(path.join(SRC, f), 'utf8');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, detail = '') {
  if (cond) pass++;
  else { fail++; fails.push(name + (detail ? ' - ' + detail : '')); }
}

const { run } = makeCtx();
run('DB.load(); DB.seedDemo();');

/* ---------------------------------------------------------------- 1. HEIGHT */
const heroMarkup = JSON.parse(run(`JSON.stringify((() => {
  const out = [];
  DB.db.users.forEach(u => {
    const ctx = { greeting:'Good evening', dateStr:'26 November 2026',
      scopeText:'Kisumu County Office Scope', actionsHtml:'<button class="btn">Action</button>',
      currentView:'home', qtabs:ROLE_CTX.heroQuickTabs(u) };
    const html = WORKSPACE_LAYOUTS.renderHomeHero(u, ctx);
    const cardEnd = html.indexOf('</section>');
    const cardStart = html.indexOf('<section');
    const mainStart = html.indexOf('ws67-hero-main');
    const tabsAt = html.indexOf('ws67-role-tabs');
    const layoutAt = html.indexOf('ws67-layout-options');
    const qgridAt = html.indexOf('ws67-qgrid');
    const tabButtons = (html.match(/class="ctx-rtab/g) || []).length;
    out.push({ user:u.username, cardStart, cardEnd, mainStart, tabsAt, qgridAt, layoutAt, tabButtons,
      tabsAfterCard: tabsAt > cardEnd && cardEnd > 0,
      layoutAfterCard: layoutAt === -1 || layoutAt > cardEnd,
      metricsInCard: qgridAt > cardStart && qgridAt < cardEnd });
  });
  return out;
})())`));

ok('the coloured introduction card ends after the greeting, actions and quick metrics',
  heroMarkup.every(h => h.metricsInCard && h.mainStart > h.cardStart && h.mainStart < h.cardEnd),
  JSON.stringify(heroMarkup.filter(h => !h.metricsInCard).slice(0, 4)));

ok('the role strip (every role tab and the Layout control) renders after the card, not inside it',
  heroMarkup.every(h => h.tabsAfterCard && h.layoutAfterCard),
  JSON.stringify(heroMarkup.filter(h => !h.tabsAfterCard || !h.layoutAfterCard)
    .map(h => ({ user:h.user, cardEnd:h.cardEnd, tabsAt:h.tabsAt, layoutAt:h.layoutAt })).slice(0, 4)));

ok('every console still receives its role tabs (no console lost navigation to the move)',
  heroMarkup.every(h => h.tabButtons > 0),
  JSON.stringify(heroMarkup.filter(h => !h.tabButtons).map(h => h.user).slice(0, 6)));

const innerHero = run(`WORKSPACE_LAYOUTS.renderHomeHero(
  DB.db.users.find(u=>u.roleId==='mcm'),{greeting:'x',currentView:'patient'})`);
ok('the Layout control stays on the console home, and the strip still belongs to the banner region',
  !innerHero.includes('ws67-layout-options') && innerHero.includes('ws67-role-tabs'));

const shellBanner = run(`(() => { AUTH.user = DB.db.users.find(u=>u.roleId==='procurement');
  APPX.screen='app'; APPX.view='home'; return renderShell(); })()`);
const bannerAt = shellBanner.indexOf('class="shell-role-banner');
const tabsInShell = shellBanner.indexOf('ws67-role-tabs');
ok('the strip is inside .shell-role-banner and after the card that precedes it',
  bannerAt > 0 && tabsInShell > bannerAt &&
  shellBanner.lastIndexOf('</section>', tabsInShell) > bannerAt);

const schemeCss = read('console_color_schemes.css');
const entryCss = read('entry_theme.css');
/* The strip's own box must stay unpainted; the chips inside it are allowed to
   carry colour (that is what a tab bar looks like). */
const stripRules = (css) => css.split('}').filter(r => {
  const sel = r.split('{')[0] || '';
  return /\.shell-role-banner[^{]*\.ws67-role-tabs\s*>?\s*$|^\s*\.shell-role-banner \.ws67-role-tabs\s*$/.test(sel.trim()) ||
    /^[^{]*\.shell-role-banner \.ws67-role-tabs\s*$/.test(sel.trim());
});
const paintedIntoBand = [...stripRules(schemeCss), ...stripRules(entryCss)]
  .filter(r => /border-top:\s*[1-9]|border:\s*[1-9]px|background:(?!transparent)/.test(r));
ok('no stylesheet paints a border or a fill on the role strip inside the banner',
  paintedIntoBand.length === 0, paintedIntoBand.map(r => r.trim().slice(0, 140)).join(' || '));

ok('the gradient is drawn on the card only, never on the banner wrapper that also holds the strip',
  /\.shell-role-banner \.ws67-hero\.ctx-strip\{[^}]*background:linear-gradient/.test(schemeCss) &&
  !/\.shell-role-banner\{[^}]*background:linear-gradient/.test(schemeCss));

/* The padding that governs every desktop console is stated in exactly one
   place. It is the base .ws67-hero padding (18px 22px 14px), not the enlarged
   26px 28px 22px the "breathing room" block used to impose. Two rules
   competing over one box is how the banner grew in the first place, so the
   suite fails if a second desktop rule appears. */
const cardPaddingRules = [...schemeCss.matchAll(/[^\n{}]*\.shell-role-banner \.ws67-hero\.ctx-strip\{padding:([^}!]+)[^}]*\}/g)]
  .map(m => ({ value:m[1].trim(), media:(schemeCss.slice(0, m.index).match(/@media\(([^)]+)\)\{[^{}]*$/s) || [])[1] || 'base' }));
const foundationPadding = entryCss.match(/html\[data-wt="foundation"\]\[data-colorscheme\][^{]*\.shell-role-banner \.ws67-hero\.ctx-strip\{padding:([^}]+)\}/);
ok('the desktop card keeps the base .ws67-hero padding and the strip keeps a measured gap below it',
  foundationPadding && /^18px 22px 14px/.test(foundationPadding[1].trim()) &&
  cardPaddingRules.every(r => r.media !== 'min-width:1000px') &&
  /\.shell-role-banner \.ws67-role-tabs\{[^}]*margin:10px 0 0 !important;/.test(schemeCss) &&
  /\.shell-role-banner \.ws67-role-tabs\{[^}]*padding:0 !important;/.test(schemeCss),
  JSON.stringify({ foundation: foundationPadding && foundationPadding[1], cardPaddingRules }));
ok('no later block re-enlarges the card padding (the 26px 28px 22px regression)',
  !/shell-role-banner \.ws67-hero\.ctx-strip\{padding:(\d+)px/.test(entryCss) ||
  !/padding:26px 28px 22px/.test(entryCss),
  'the breathing-room padding is back');

/* ------------------------------------------------------------ 2. ONE PALETTE */
const SIGNATURE = ['--console-c1','--console-c2','--console-c3','--console-c4','--console-c5','--console-c6'];
const usesSignature = s => SIGNATURE.some(t => s.includes('var(' + t)) || s.includes('--console-hero-');

ok('the light-mode block no longer pins its own hex tints onto the metric cards or role chips',
  !/#edf4f5|#f2edfa|#faf2e9|#244355|#554471|#704e31/.test(schemeCss),
  'a fixed light-mode tint list is back in console_color_schemes.css');

const featureStart = entryCss.indexOf('html[data-wt="foundation"] .shell :is(.rc68-tile,.ctx-rtab');
const featureBlock = featureStart < 0 ? '' : entryCss.slice(featureStart, featureStart + 1200);
ok('the Foundation feature palette steps through the console signature instead of five fixed colours',
  featureBlock.includes('--feature-color:var(--console-c1)') &&
  featureBlock.includes('--feature-color:var(--console-c5)') &&
  !/#1e40af|#0f655d|#6d28a8|#a51d4c|#854d0e/.test(featureBlock),
  featureBlock.slice(0, 200));

const identity = (needle, span = 900) => {
  const i = entryCss.indexOf(needle);
  return i < 0 ? '' : entryCss.slice(i, i + span);
};
const qcardFill = identity('/* Navigation icons and the current tile follow', 900) + identity('/* The page sheet is chrome, not identity', 900);
const navIcon = identity('/* Navigation icons and the current tile follow');
const sheetBlock = identity('/* The page sheet is chrome, not identity');
const modalHead = identity('/* A sheet');
ok('metric fills, navigation tiles, the page sheet and the sheet header all derive their colour from the console signature',
  [qcardFill, navIcon, sheetBlock, modalHead].every(b => b.length > 0 && usesSignature(b)) &&
  /--console-highlight/.test(entryCss) &&
  /--feature-soft:color-mix\(in srgb,var\(--console-c1\) 9%,var\(--surface\)\)/.test(entryCss),
  JSON.stringify([qcardFill, navIcon, sheetBlock, modalHead].map(b => b.length)));

ok('the banner gradient and the sidebar brand are cut from the same --console-hero tokens',
  /\.ws67-hero\.ctx-strip\{[^}]*linear-gradient\(115deg,var\(--console-hero-1\)/.test(schemeCss) &&
  entryCss.includes('linear-gradient(145deg,var(--console-hero-1') &&
  entryCss.includes('linear-gradient(112deg,var(--console-hero-1'));

const schemes = JSON.parse(run(`JSON.stringify((() => {
  const rootStyle = {};
  const root = document.documentElement;
  root.style.setProperty = (k, v) => { rootStyle[k] = v; };
  const u = DB.db.users.find(x => x.roleId === 'director');
  const out = [];
  CONSOLE_COLOR_SCHEMES.forEach(s => {
    WTHEME.setStudio(u, 'colorScheme', s.id); WTHEME.apply(u);
    const surface = WTHEME._active.t.surface;
    const pairs = [1,2,3,4,5,6].map(i => +WTC.contrast(rootStyle['--console-c' + i], surface).toFixed(2));
    const onHero = [1,2,3].map(i => +WTC.contrast('#FFFFFF', rootStyle['--console-hero-' + i]).toFixed(2));
    const inkOnActive = +WTC.contrast(rootStyle['--accent'], rootStyle['--accent-ink'] || '#FFFFFF').toFixed(2);
    out.push({ id:s.id, minOnSurface:Math.min.apply(null,pairs), minOnHero:Math.min.apply(null,onHero), inkOnActive });
  });
  WTHEME.setStudio(u, 'colorScheme', 'department'); WTHEME.apply(u);
  return out;
})())`));
ok('all eight console schemes keep every signature accent legible on the surface, on the banner and as a filled chip',
  schemes.length === 8 && schemes.every(s => s.minOnSurface >= 4.5 && s.minOnHero >= 4.5 && s.inkOnActive >= 4.5),
  JSON.stringify(schemes.filter(s => !(s.minOnSurface >= 4.5 && s.minOnHero >= 4.5 && s.inkOnActive >= 4.5))));

ok('alert, warning and critical treatments are still excluded from palette tinting',
  schemeCss.includes('.ws67-qcard.is-alert') &&
  !/\.b-crit[^{]*\{[^}]*--console-c1/.test(schemeCss) &&
  !/\.alert[^{]*\{[^}]*--console-c1/.test(schemeCss));

/* ---------------------------------------------------------------- 3. MOTION */
const motion = entryCss.slice(entryCss.indexOf('Workspace, sheet and switch transitions'));
ok('a page change animates (workspace view)',
  /@keyframes carelink-ws-in\{[\s\S]*?\}/.test(motion) && /\.workspace-view\{animation:carelink-ws-in/.test(motion));
ok('a sheet animates both when it opens and when it closes',
  /\.modal-back\{animation:carelink-sheet-back-in/.test(motion) &&
  /\.modal-back > \.modal\{animation:carelink-sheet-in/.test(motion) &&
  /\.modal-back\.is-closing\{animation:carelink-back-out/.test(motion) &&
  /\.modal-back\.is-closing > \.modal\{animation:carelink-sheet-out/.test(motion));
ok('switches slide their knob and fade their track, and segmented controls and tabs cross-fade',
  /\.switch \.track\{transition:/.test(motion) &&
  /\.switch \.track::after\{transition:transform/.test(motion) &&
  /\.switch input:checked\+\.track::after\{transform:translateX\(20px\);\}/.test(motion) &&
  /\.seg button\{transition:/.test(motion) &&
  /\.ctx-rtab,\.tabs \.tab,\.sheet \.tab\{transition:/.test(motion),
  JSON.stringify([/\.switch \.track\{transition:/.test(motion),
    /\.switch \.track::after\{transition:transform/.test(motion),
    /\.switch input:checked\+\.track::after\{transform:translateX\(20px\);\}/.test(motion),
    /\.seg button\{transition:/.test(motion),
    /\.ctx-rtab,\.tabs \.tab,\.sheet \.tab\{transition:/.test(motion)]));
ok('every animation is dropped for prefers-reduced-motion and for the Interface animation switch',
  /@media \(prefers-reduced-motion:reduce\)\{[\s\S]*?\.workspace-view,\.modal-back,\.modal-back>\.modal[\s\S]*?animation:none !important;\}/.test(motion) &&
  /html\[data-calm="on"\] \.workspace-view[\s\S]*?animation:none !important;/.test(motion) &&
  /html\[data-calm="on"\] \.switch \.track,html\[data-calm="on"\] \.switch \.track::after/.test(motion));
ok('printing is never affected by the motion layer',
  /@media print\{[\s\S]{0,200}\.modal-back/.test(motion));

const ui = read('ui.js');
ok('a closed sheet is always removed, even if no animation ever runs',
  ui.includes('function dismissSheet') &&
  /setTimeout\(once, SHEET_CLOSE_MS \+ 60\)/.test(ui) &&
  /if\(calm \|\| !back\.classList/.test(ui) && ui.includes('function closeAllModals') &&
  /while\(modalStack\.length\)\{ dismissSheet\(modalStack\.pop\(\)\); \}/.test(ui));

const sheetClosed = run(`(() => {
  AUTH.user = DB.db.users.find(u => u.username === 'caregiver.nyalenda');
  ACTIONS['new-assessment']();
  const opened = modalStack.length;
  closeAllModals();
  return { opened, after: modalStack.length };
})()`);
ok('opening and closing a real sheet leaves no dialog behind and the stack empty',
  sheetClosed.opened === 1 && sheetClosed.after === 0, JSON.stringify(sheetClosed));

const app = read('app.js');
ok('page changes use the browser View Transition when it is available and allowed, and always render',
  app.includes('function viewTransitionAllowed') &&
  app.includes('document.startViewTransition(()=>{ goRender(view, params); })') &&
  app.includes("data-view-transition','on'") &&
  /prefers-reduced-motion: reduce/.test(app) &&
  app.includes('function goRender(view, params={})'));

ok('the native and CSS page transitions are never shown together',
  /html\[data-view-transition="on"\] \.workspace-view\{animation:none !important;\}/.test(motion));

const animatedProps = (motion.match(/transition:([^;]+);/g) || []).join(' ')
  .replace(/cubic-bezier\([^)]*\)/g, '');
ok('motion animates colour, opacity and transform only, never layout',
  !/(^|[\s,:])width\b|height\b|margin\b|padding\b|font-size\b|(^|[\s,:])top\b|(^|[\s,:])left\b/.test(animatedProps),
  animatedProps.slice(0, 300));

if (fail) { console.log('FAILURES:'); fails.forEach(f => console.log('  x', f)); }
console.log(`${pass}/${pass + fail} banner height, colour coherence and motion checks passed${fail ? ' - ' + fail + ' failed' : ''}`);
process.exit(fail ? 1 : 0);
