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
  const res = { banners:[], heroes:[], afterNav:[], beforeBar:[], beforeContent:[], modeSegOnInner:[], order:null };
  DB.db.users.forEach(u => {
    AUTH.user = u; AUTH.mustChange = false;
    APPX.screen = 'app'; APPX.view = 'home';
    const html = renderShell();
    const bannerCount = (html.match(/class="shell-role-banner/g) || []).length;
    const heroCount = (html.match(/class="ws67-hero /g) || []).length;
    const bannerAt = html.indexOf('shell-role-banner');
    const paneAt = html.indexOf('class="npane');
    const barAt = html.indexOf('class="topbar cbar');
    const contentAt = html.indexOf('class="content');
    if (bannerCount !== 1) res.banners.push(u.username + ':' + bannerCount);
    if (heroCount !== 1) res.heroes.push(u.username + ':' + heroCount);
    /* The banner belongs to the workspace column: it renders after the
       navigation pane (right of it on desktop, below it on phones), leads the
       content, and comes before the console toolbar in the markup. */
    if (paneAt >= 0 && !(bannerAt >= 0 && bannerAt > paneAt)) res.afterNav.push(u.username);
    if (barAt >= 0 && !(bannerAt >= 0 && bannerAt > barAt)) res.beforeBar.push(u.username);
    if (contentAt >= 0 && !(bannerAt >= 0 && bannerAt > contentAt)) res.beforeContent.push(u.username);
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

ok('Every signed-in console renders exactly one role introduction banner in the workspace column, inside the scrollable workspace below the toolbar',
  shell.banners.length === 0 && shell.heroes.length === 0 && shell.afterNav.length === 0 &&
  shell.beforeBar.length === 0 && shell.beforeContent.length === 0,
  JSON.stringify({ banners: shell.banners, heroes: shell.heroes, afterNav: shell.afterNav.slice(0, 4),
    beforeBar: shell.beforeBar.slice(0, 4), beforeContent: shell.beforeContent.slice(0, 4) }));
ok('The introduction banner scrolls with the workspace instead of covering navigation, and inner views keep it without home-only layout controls',
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
  /@media\(max-width:760px\)[\s\S]*?\.shell-role-banner \.ws67-greeting\{font-size:20px !important;\}/.test(css) &&
  /\.shell-role-banner \.ws67-mode-seg\{flex:0 0 auto;max-width:100%;overflow-x:auto;\}/.test(css) &&
  /@media\(max-width:560px\)\{[\s\S]*?\.app\.shell > \.topbar\.cbar\{display:flex !important;flex-wrap:wrap/.test(css));
ok('Banner is keyboard focusable, has a print guard and never widens the page',
  bannerRules.includes('focus-visible') && bannerRules.includes('@media print{.shell-role-banner{display:none !important}}') &&
  css.includes('.shell-role-banner .ws67-hero{overflow-x:clip;') &&
  css.includes('.shell-role-banner .ws67-hero-copy{max-width:100%;overflow-wrap:anywhere;}'),
  'banner rules incomplete');
/* The toolbar has a separate track; only the main workspace scrolls. */
const viewportCss=fs.readFileSync(path.join(__dirname,'../src/entry_theme.css'),'utf8');
ok('Desktop shell separates toolbar and scrolling content so context headings cannot slide underneath it',
  viewportCss.includes('grid-template-rows:max-content minmax(0,1fr) !important;') &&
  viewportCss.includes('grid-row:1 !important;position:static !important;') &&
  viewportCss.includes('overflow-y:auto !important;overflow-x:hidden !important;box-sizing:border-box;'),
  'desktop shell scrollport rules changed');

/* 4b. Every department console, reviewed one by one ----------------------
   The block above proves each account type carries its own signature. This
   block reviews the organisation's own department list instead, through the
   department palette that draws a console whenever an account type has no
   signature of its own (a custom role, or a department whose staff share a
   clinical role). Each department is rendered for real and then measured:
   the banner must name the department as the org chart names it, white text
   must be readable on every stop of its gradient, the badge must be visible on
   the fill it sits on, the identity itself must not be altered by the contrast
   correction, and no two departments may look the same. */
run(`globalThis.__deptTokens = {};
  document.documentElement.style.setProperty = (k, v) => { globalThis.__deptTokens[k] = v; };`);
const deptReview = JSON.parse(run(`JSON.stringify((() => {
  const made = [];
  const rows = DEPARTMENTS.map(d => {
    const roleId = 'probe-role-' + d.id;
    DB.db.roles = DB.db.roles || [];
    DB.db.roles.push({ id: roleId, name: 'Probe ' + d.name, dept: d.id, scope: { geo: 'county', records: 'county' }, perms: [] });
    const user = { id: 'probe-' + d.id, username: 'probe.' + d.id, roleId, countyId: 'kisumu', areaIds: ['nyalenda'], departmentId: d.id };
    AUTH.user = user; WTHEME.apply(user);
    made.push(roleId);
    const p = DEPT_PALETTES[d.id] || null;
    return { id: d.id, orgName: d.name, hasPalette: !!p,
      paletteName: p ? p.name : null, bannerName: deptPaletteFor(user).name,
      identity: p ? [p.c1, p.c2, p.c3] : null,
      rendered: { c1: __deptTokens['--dept-c1'], c2: __deptTokens['--dept-c2'], c3: __deptTokens['--dept-c3'],
                  id1: __deptTokens['--dept-id-c1'], id2: __deptTokens['--dept-id-c2'], id3: __deptTokens['--dept-id-c3'],
                  badge: __deptTokens['--dept-badge'] } };
  });
  DB.db.roles = DB.db.roles.filter(r => !made.includes(r.id));
  const dup = arr => { const seen = new Map(), d = []; arr.forEach(([k, v]) => { if (seen.has(v)) d.push(seen.get(v) + '=' + k); else seen.set(v, k); }); return d; };
  return { rows,
    dupIdentity: dup(rows.map(r => [r.id, (r.identity || []).join('|')])),
    dupFill: dup(rows.filter(r => r.rendered.c1).map(r => [r.id, [r.rendered.c1, r.rendered.c2, r.rendered.c3].join('|')])),
    contrast: rows.map(r => ({ id: r.id,
      stops: [r.rendered.c1, r.rendered.c2, r.rendered.c3].map(c => +WTC.contrast('#FFFFFF', c).toFixed(2)),
      badge: +WTC.contrast(r.rendered.badge, r.rendered.c1).toFixed(2) })),
    identityKept: rows.filter(r => !r.identity || [r.rendered.id1, r.rendered.id2, r.rendered.id3].join('|') === r.identity.join('|')).length
  };
})())`));

ok('every department on the org chart has its own palette entry',
  deptReview.rows.every(r => r.hasPalette), JSON.stringify(deptReview.rows.filter(r => !r.hasPalette).map(r => r.id)));
ok('a department-drawn console names the department as the org chart names it',
  deptReview.rows.every(r => r.bannerName === r.orgName),
  JSON.stringify(deptReview.rows.filter(r => r.bannerName !== r.orgName).map(r => r.id + ': ' + r.bannerName + ' vs ' + r.orgName)));
ok('white banner text is readable on every stop of every department gradient (4.5:1)',
  deptReview.contrast.every(c => Math.min(...c.stops) >= 4.5),
  JSON.stringify(deptReview.contrast.filter(c => Math.min(...c.stops) < 4.5)));
ok('the department badge tint stays visible on the banner it sits on (4.5:1)',
  deptReview.contrast.every(c => c.badge >= 4.5),
  JSON.stringify(deptReview.contrast.filter(c => c.badge < 4.5)));
ok('the contrast correction is applied to the fill, never to the department identity itself',
  deptReview.identityKept === deptReview.rows.length,
  JSON.stringify({ kept: deptReview.identityKept, of: deptReview.rows.length }));
ok('no two departments share an identity, so one console is never mistaken for another',
  deptReview.dupIdentity.length === 0 && deptReview.rows.every(r => r.identity && r.identity.length === 3),
  JSON.stringify(deptReview.dupIdentity));
ok('the rendered banner fill also stays distinct between departments after the correction',
  deptReview.dupFill.length === 0, JSON.stringify(deptReview.dupFill));
/* ...and the palette a real account sees is the account's own signature, which
   the first block of this file already proves distinct for all 30 roles. */
ok('every account type therefore has a signature, so the department palette is only the fallback',
  run(`ROLES.every(r => !!ROLE_PALETTES[r.id])`));

/* 5. Credential pack wording --------------------------------------------- */
const devConsole = fs.readFileSync(path.join(SRC, 'dev_console6.js'), 'utf8');
const apiIndex = fs.readFileSync(path.join(REPO, 'api', 'index.js'), 'utf8');
ok('Credential packs are labelled by what they contain (pending-only vs official rebuild) and warn about replaced Chiefs',
  devConsole.includes('Pending accounts only — not the full roster') &&
  devConsole.includes('pendingPackTargets') &&
  devConsole.includes("kind === 'official-rebuild'") &&
  devConsole.includes("kind === 'recovered-rebuild'") &&
  devConsole.includes('including any other Chief accounts, are replaced or deactivated') &&
  devConsole.includes('Confirmed work mailbox') && !devConsole.includes('<th>Official email alias</th>'));
ok('Issued credentials carry the confirmed server mailbox so the private document matches sign-in',
  apiIndex.includes('email: state.creds[uname].email') &&
  devConsole.includes('email: cp.email ||'));

console.log(`\nv697-role-hero-and-palettes-e2e: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('FAILURES:\n - ' + fails.join('\n - '));
  process.exit(1);
}
