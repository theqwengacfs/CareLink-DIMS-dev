/* ============================================================================
   v697-role-hero-and-palettes-e2e.js — End-to-End Verification for the
   signed-in shell hierarchy and the per-account-type colour identity:
   1. The role introduction banner is the first element of every console and
      the only home hero (no duplicate / stacked banner).
   2. Every official role has its own distinct default palette, while explicit
      personal colour schemes still take precedence.
   3. Panel/toolbar/tab navigation colours follow the role palette and status
      colours stay semantic.
   4. Banner layout rules keep the navigation reachable on phones, short
      screens and high zoom, and print hides it.
   5. Credential packs describe what they actually contain (pending accounts
      only vs. the official rebuild) and the server returns the issued email.
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const { makeCtx } = require('./dom');

const REPO = path.resolve(__dirname, '..', '..');
const SRC = path.join(REPO, 'v6', 'src');
const { run } = makeCtx();
run('DB.load(); DB.seedDemo();');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, detail = '') {
  if (cond) pass++;
  else { fail++; fails.push(name + (detail ? ' — ' + detail : '')); }
}

/* 1. Topmost fixed introduction, single hero per console ------------------- */
const shell = JSON.parse(run(`JSON.stringify((() => {
  const res = { banners:[], heroes:[], beforeNav:[], beforeBar:[], modeSegOnInner:[], order:null };
  DB.db.users.forEach(u => {
    AUTH.user = u; AUTH.mustChange = false;
    APPX.screen = 'app'; APPX.view = 'home';
    const html = renderShell();
    const bannerCount = (html.match(/class="shell-role-banner/g) || []).length;
    const heroCount = (html.match(/class="ws67-hero /g) || []).length;
    const bannerAt = html.indexOf('shell-role-banner');
    const paneAt = html.indexOf('class="npane');
    const barAt = html.indexOf('class="topbar cbar');
    if (bannerCount !== 1) res.banners.push(u.username + ':' + bannerCount);
    if (heroCount !== 1) res.heroes.push(u.username + ':' + heroCount);
    /* The banner must precede the navigation pane and the console toolbar. */
    if (paneAt >= 0 && !(bannerAt >= 0 && bannerAt < paneAt)) res.beforeNav.push(u.username);
    if (barAt >= 0 && !(bannerAt >= 0 && bannerAt < barAt)) res.beforeBar.push(u.username);
    if (!res.order) res.order = html.slice(0, 40);
  });
  /* Layout controls belong to the console home, not to inner clinical views. */
  const mcm = DB.db.users.find(x => x.roleId === 'mcm');
  AUTH.user = mcm; APPX.screen = 'app'; APPX.view = 'patients';
  const inner = renderShell();
  res.modeSegOnInner = (inner.match(/ws67-mode-seg/g) || []).length;
  res.innerHasBanner = inner.includes('shell-role-banner');
  res.innerArrangeCount = (inner.match(/data-act="arrange-home"/g) || []).length;
  return res;
})())`));

ok('Every signed-in console renders exactly one role introduction banner ahead of the navigation pane and toolbar',
  shell.banners.length === 0 && shell.heroes.length === 0 && shell.beforeNav.length === 0 && shell.beforeBar.length === 0,
  JSON.stringify(shell));
ok('The introduction banner stays fixed above navigation and content, and inner views keep it without home-only layout controls',
  shell.innerHasBanner === true && shell.modeSegOnInner === 0 && shell.innerArrangeCount === 1,
  JSON.stringify(shell));

/* 2. Distinct palette per account type, personal scheme precedence -------- */
const palettes = JSON.parse(run(`JSON.stringify((() => {
  const byRole = {};
  const dupes = [];
  const seen = new Map();
  DB.db.users.forEach(u => {
    const p = deptPaletteFor(u);
    const key = p.c1 + '|' + p.c2 + '|' + p.c3;
    if (!byRole[u.roleId]) byRole[u.roleId] = key;
    if (seen.has(key) && seen.get(key) !== u.roleId) dupes.push(seen.get(key) + '=' + u.roleId + ':' + key);
    seen.set(key, u.roleId);
  });
  /* Pharmacy department staff get their own palette even when they share the
     clinical role with other nurses. */
  const pharmacist = DB.db.users.find(u => u.username === 'pharmacy.kisumu');
  const nurse = DB.db.users.find(u => u.roleId === 'nurse' && u.departmentId !== 'pharmacy');
  const explicit = WTHEME.studio(DB.db.users.find(u => u.roleId === 'director'));
  explicit.colorScheme = 'orchid';
  WTHEME.apply(DB.db.users.find(u => u.roleId === 'director'));
  WTHEME.setStudio(DB.db.users.find(u => u.roleId === 'director'), 'colorScheme', 'department');
  WTHEME.apply(DB.db.users.find(u => u.roleId === 'director'));
  return {
    roles: Object.keys(byRole).length,
    colours: new Set(Object.values(byRole)).size,
    dupes,
    byRole,
    pharmacyDistinct: Boolean(pharmacist && nurse) && deptPaletteFor(pharmacist).c1 !== deptPaletteFor(nurse).c1,
    signatureName: CONSOLE_COLOR_SCHEMES[0].name,
    signatureNull: CONSOLE_COLOR_SCHEMES[0].colors
  };
})())`));

ok('Each account type carries its own default intro/navigation palette across the full official role set',
  palettes.roles >= 29 && palettes.colours === palettes.roles && palettes.dupes.length === 0,
  JSON.stringify({ roles: palettes.roles, colours: palettes.colours, dupes: palettes.dupes.slice(0, 4) }));
ok('Pharmacy staff keep a separate colour identity from other clinical roles and the default scheme is the role signature',
  palettes.pharmacyDistinct === true && palettes.signatureName === 'Role signature' && palettes.signatureNull === null,
  JSON.stringify(palettes));

/* The test DOM only records setProperty calls, so keep a token map here. */
run(`globalThis.__tokens = {};
document.documentElement.style.setProperty = (k, v) => { globalThis.__tokens[k] = v; };`);
const precedence = JSON.parse(run(`JSON.stringify((() => {
  const u = DB.db.users.find(x => x.roleId === 'director');
  WTHEME.setStudio(u, 'colorScheme', 'lake'); WTHEME.apply(u);
  const lake = { cs: WTHEME.studio(u).colorScheme, c1: __tokens['--console-c1'], hero: __tokens['--console-hero-1'] };
  WTHEME.setStudio(u, 'colorScheme', 'department'); WTHEME.apply(u);
  const signature = { cs: WTHEME.studio(u).colorScheme, c1: __tokens['--console-c1'], hero: __tokens['--console-hero-1'] };
  return { lake, signature };
})())`));
ok('An explicit personal scheme still overrides the role signature, and clearing it restores the role palette',
  precedence.lake.cs === 'lake' && precedence.lake.c1 !== precedence.signature.c1 &&
  precedence.signature.cs === 'department',
  JSON.stringify(precedence));

/* 3. Navigation tinting + status semantics -------------------------------- */
const css = fs.readFileSync(path.join(SRC, 'console_color_schemes.css'), 'utf8');
const themesJs = fs.readFileSync(path.join(SRC, 'themes.js'), 'utf8');
ok('Role colours drive the intro banner, sidebar items, workspace tabs and quick metrics',
  css.includes('.shell-role-banner .ws67-hero.ctx-strip') && css.includes('--console-hero-1') &&
  css.includes('.np-i:not(.on)') && css.includes('.tabs .tab:not(.active):not(.on)') &&
  css.includes('.ws67-qcard:not(.is-alert)') && themesJs.includes("set('--console-hero-1'"));
ok('Navigation never recolours semantic alert, warning or critical status treatments',
  css.includes('.ws67-qcard.is-alert') && css.includes('.ws67-qcard:not(.is-alert)') &&
  !/\.b-crit[^{]*\{[^}]*--nav-colour/.test(css));

/* 4. Responsive, keyboard and print safety -------------------------------- */
const bannerRules = css.slice(css.indexOf('/* Role identity leads every signed-in workspace'));
ok('Banner keeps navigation reachable on phones, short screens and high zoom (scrollable tabs, no sideways page)',
  /\.shell-role-banner \.ws67-role-tabs > \.row\{[^}]*overflow-x:auto/.test(css) &&
  /@media\(max-height:720px\)/.test(css) &&
  /\.shell-role-banner \.ws67-sub\{display:none !important;\}/.test(css) &&
  /\.shell-role-banner \.ws67-mobile-extra\{display:block/.test(css) &&
  /@media\(max-width:560px\)\{[\s\S]*?\.app\.shell > \.topbar\.cbar\{display:flex !important;flex-wrap:wrap/.test(css));
ok('Banner is keyboard focusable, has a print guard and never widens the page',
  bannerRules.includes('focus-visible') && bannerRules.includes('@media print{.shell-role-banner{display:none !important}}') &&
  css.includes('.shell-role-banner .ws67-hero{overflow-x:clip;') &&
  css.includes('.shell-role-banner .ws67-hero-copy{max-width:100%;min-width:0;'),
  'banner rules incomplete');

/* 5. Credential pack wording --------------------------------------------- */
const devConsole = fs.readFileSync(path.join(SRC, 'dev_console6.js'), 'utf8');
const apiIndex = fs.readFileSync(path.join(REPO, 'api', 'index.js'), 'utf8');
ok('Credential packs are labelled by what they contain (pending-only vs official rebuild) and warn about replaced Chiefs',
  devConsole.includes('Pending accounts only — not the full roster') &&
  devConsole.includes('pendingPackTargets') &&
  devConsole.includes("kind === 'official-rebuild'") &&
  devConsole.includes("kind === 'recovered-rebuild'") &&
  devConsole.includes('including any other Chief accounts, are replaced or deactivated') &&
  devConsole.includes('Mock email alias'));
ok('Issued credentials carry the actual server email alias so the private document matches sign-in',
  apiIndex.includes('email: state.creds[uname].email') &&
  devConsole.includes('email: cp.email ||'));

console.log(`\nv697-role-hero-and-palettes-e2e: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('FAILURES:\n - ' + fails.join('\n - '));
  process.exit(1);
}
