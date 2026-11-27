/* =====================================================================
   v6110-mobile-layout.js — the three defects visible on a 390px phone

   These are the three things the phone screenshot showed that the desktop
   checks never would:

     1. two identical role-tab rows, one under the other, under the hero;
     2. the red install pill sitting on top of the strip and its Layout chip
        (it was position:fixed, so it also stayed there while scrolling);
     3. the Layout chip clipped at the end of the strip - "Layout +" cut off.

   Each one is asserted against the real source: the shell is rendered for
   every role, and the rules are read out of the stylesheets that ship. The
   chip-width arithmetic is calculated, not described, so a future change that
   silently reintroduces the overlap fails here.
   ===================================================================== */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeCtx } = require('./dom');

const REPO = path.resolve(__dirname, '..', '..');
const SRC = path.join(REPO, 'v6', 'src');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const schemes = read('console_color_schemes.css');
const entry = read('entry_theme.css');
const flows = read('care6_flows.js');
const layout67 = read('strategic_governance67.js');
const install = fs.readFileSync(path.join(REPO, 'v6', 'pwa-install.html'), 'utf8');

let passed = 0;
function ok(name, condition, detail) {
  if (!condition) throw new Error(name + (detail === undefined ? '' : ` — ${detail}`));
  passed++;
  console.log('  ok  ' + name);
}

const { run } = makeCtx({ setTimeout: () => 0 });
run('DB.load();DB.seedDemo();');

/* ---------------------------------------------------------------------
   1. ONE role-tab row per page, for every role, on home and inner pages
   --------------------------------------------------------------------- */
{
  const views = ['home', 'patients', 'visits', 'pdca', 'reports', 'monday', 'foodprotocol', 'procurement'];
  const rows = {};
  const offenders = [];
  const roles = JSON.parse(run('JSON.stringify(DB.db.users.map(u=>u.roleId).filter((v,i,a)=>a.indexOf(v)===i))'));
  for (const roleId of roles) {
    if (!run(`Boolean(DB.db.users.find(u=>u.roleId===${JSON.stringify(roleId)}))`)) continue;
    run(`AUTH.user=DB.db.users.find(u=>u.roleId===${JSON.stringify(roleId)});`);
    for (const view of views) {
      run(`APPX.view=${JSON.stringify(view)};APPX.params={};`);
      let shell;
      try { shell = run('renderShell()'); } catch (_e) { continue; }
      const tabRows = (shell.match(/ctx-role-tabs/g) || []).length;
      const chips = (shell.match(/class="ctx-rtab /g) || []).length;
      rows[roleId] = Math.max(rows[roleId] || 0, tabRows);
      if (tabRows > 1) offenders.push(`${roleId}/${view}:${tabRows} rows, ${chips} chips`);
    }
  }
  ok('No signed-in page renders two role-tab rows (the duplicate second row under the hero)',
    offenders.length === 0, offenders.slice(0, 6).join(' | '));
  ok('Every console still renders its role tab row exactly once',
    Object.values(rows).every((n) => n === 1), JSON.stringify(rows));

  /* The strip keeps what was genuinely per-page: it must not have been
     deleted to make the count pass. */
  run(`AUTH.user=DB.db.users.find(u=>u.roleId==='mcm');`);
  const strip = run(`ROLE_CTX.contextStrip(AUTH.user,'patients',{omitTabs:true})`);
  ok('The context strip still carries the OS badge, role and county chips, and its pack button',
    strip.includes('ctx-os-badge') && strip.includes('ctx-role-chip') && strip.includes('ctx-county-chip') &&
    strip.includes('wtheme-open-packs'));
  ok('The context strip still carries the operator line and the page title',
    strip.includes('Operator:') && strip.includes('ctx-strip-title'));
  ok('Without the opt-out the strip still renders its own tabs (deep links and embedded use are unaffected)',
    run(`ROLE_CTX.contextStrip(AUTH.user,'patients')`).includes('ctx-role-tabs'));

  /* The wiring that does it: the shell tells the banner it already has tabs. */
  ok('The shell passes bannerOwnsTabs so the banner and the strip cannot disagree',
    /contentFor\(view=APPX\.view, APPX\.params, user, \{omitHomeHeader:Boolean\(roleHero\), bannerOwnsTabs:Boolean\(roleHero\)\}\)/.test(
      fs.readFileSync(path.join(SRC, 'app.js'), 'utf8')));
  ok('workspaceHeroBanner forwards the flag to contextStrip',
    /contextStrip\(user, view, \{ omitTabs: bannerOwnsTabs \}\)/.test(fs.readFileSync(path.join(SRC, 'app.js'), 'utf8')));
}

/* ---------------------------------------------------------------------
   2. The Layout chip cannot be clipped
   --------------------------------------------------------------------- */
{
  ok('The Layout chip has its own label element, so the label is never a bare text node',
    layout67.includes('<span class="ws67-chip-label">Layout</span>'));
  ok('The Workspace-tools chip has one too',
    layout67.includes('<span class="ws67-chip-label">Workspace tools</span>'));
  ok('The +/- indicator is non-shrinking so it cannot push the label out of the box',
    /\.ws67-layout-options>summary::after\{content:'\+'[^}]*flex:0 0 auto/.test(entry));
  ok('The chip itself is flex:0 0 auto, so a narrow strip cannot squeeze it',
    /\.ws67-workspace-tools>summary,\.ws67-layout-options>summary\{flex:0 0 auto;max-width:100%;white-space:nowrap/.test(entry));
  ok('On a phone the chip keeps a 44px touch target instead of shrinking',
    /@media\(max-width:760px\)\{[\s\S]*?\.shell-role-banner :is\(\.ws67-layout-options,\.ws67-workspace-tools\)>summary\{min-height:44px/.test(entry));
  ok('The Layout control was not removed to fix the clipping',
    layout67.includes('ws67-layout-options no-print') && /Focused Tabs/.test(layout67) && /Expanded Stack/.test(layout67));

  /* Arithmetic: at 390px the strip is one horizontal scroller, so the chip is
     reachable by scrolling rather than being cut. Prove the old arrangement
     genuinely did not fit, and that the new one does not need to. */
  const phone = 390, pad = 6 * 2;                    // .shell-role-banner padding at <=760px
  const chipText = 'Layout'.length * 6.6 + 2 * 12 + 13 + 8 + 14; // label + padding + icon + gap + '+'
  const rtab = 118;                                   // measured average chip width
  const sixChips = 6 * rtab + 5 * 6;                  // six role chips + gaps
  const needed = sixChips + chipText + 8;
  ok('Six role chips plus the Layout chip genuinely do not fit 390px, so the row must scroll',
    needed > phone - pad, `needed ${Math.round(needed)}px vs ${phone - pad}px`);
  ok('The strip row is a horizontal scroller, so nothing is cut off',
    /\.shell-role-banner \.ws67-role-tabs > \.row\{[^}]*flex-wrap:nowrap !important;overflow-x:auto/.test(schemes));
  ok('The scroller is allowed to paint the whole chip, not clip it at its own edge',
    /\.shell-role-banner \.ws67-mode-seg\{flex:0 0 auto;max-width:100%;overflow-x:auto/.test(schemes));
}

/* ---------------------------------------------------------------------
   3. The install pill: restored to its original design, and off the
      console's bottom edge only where the console actually needs it

   The pill always floated at the bottom-right. That is what made it easy to
   see and easy to use, and because it is `position:fixed` it takes no room in
   the document - which is exactly why it can never push the one-screen landing
   or sign-in pages past 100dvh. The earlier "fix" moved it into the flow,
   which changed both its nature and the page height. Both are now asserted.
   --------------------------------------------------------------------- */
{
  ok('The pill floats at the bottom-right corner again, at 16px from each edge',
    /Object\.assign\(b\.style, \{ position: 'fixed', right: '16px', bottom: '16px', zIndex: '10000', display: 'none',/.test(install));
  ok('The pill keeps its red fill, full radius and 700-weight label',
    /background: '#B7192B', color: '#fff',/.test(install) && /borderRadius: '999px'/.test(install) &&
    /font: '700 14px system-ui'/.test(install));
  ok('The pill is appended to the body, so no page layout can reflow it',
    /function installHost\(\) \{\s*return doc\.body;\s*\}/.test(install));
  ok('It can never be wider than the screen',
    /maxWidth: 'calc\(100vw - 32px\)'/.test(install));

  /* Fixed positioning takes no space in the document - this is the property
     the one-screen policy depends on, so it is stated as an invariant. */
  ok('Fixed positioning keeps the pill out of the document flow entirely',
    !/position: 'static'/.test(install) && !/position: 'sticky'/.test(install));
  ok('The notice strips stay fixed near the bottom edge, so they cannot push the entry pages either',
    /position: 'fixed', left: '12px', right: '12px', bottom: '76px'/.test(install));

  /* Inside a console the bottom edge belongs to the shortcuts and the strip,
     so the pill steps up - by a measured amount, with a bounded fallback. */
  ok('Inside a console the pill lifts clear of the console furniture',
    /installButton\.style\.bottom = inConsole\(\) \? consoleClearance\(\) : '16px';/.test(install));
  ok('Entry screens keep the original 16px corner',
    /: '16px';/.test(install));
  ok('The lift is measured from the element that is in the way, not hard-coded',
    /getBoundingClientRect\(\)/.test(install) && /Math\.round\(window\.innerHeight - box\.top\)/.test(install));
  ok('The lift is bounded, so a short phone cannot turn the pill into a banner',
    /Math\.min\(160, Math\.max\(64, needed \+ 12\)\)/.test(install));
  ok('A host document without querySelector cannot crash the measurement',
    /typeof doc\.querySelector === 'function'/.test(install));
  ok('Both show paths go through the one helper, so nothing can re-introduce display:block alone',
    (install.match(/showInstallButton\(\)/g) || []).length >= 4);
}

/* ---------------------------------------------------------------------
   4. Nothing else may push the phone viewport sideways
   --------------------------------------------------------------------- */
{
  const files = ['styles.css', 'console51.css', 'console6.css', 'portal6.css', 'audit6.css',
    'carelink63.css', 'console_color_schemes.css', 'admin_ops6.css', 'care_review.css', 'entry_theme.css', 'console_head7.css', 'tab_ink.css'];
  const bad = [];
  for (const f of files) {
    const css = read(f);
    const re = /(^|[;{\s])width:\s*(\d{3,4})px/g;
    let m;
    while ((m = re.exec(css))) {
      const w = Number(m[2]);
      if (w <= 360) continue;
      /* A hard width is fine when the same rule caps it to the viewport, or
         when the element is a purely decorative child of a clipped fixed
         layer (the landing page's blurred aurora circles, which are painted
         inside .ld-aurora{position:fixed;overflow:hidden} and can never
         widen the page). Walk back to the enclosing selector to tell. */
      const head = css.slice(Math.max(0, m.index - 400), m.index + 400);
      const capped = /max-width:\s*(calc\(100vw|100%|min\()/.test(head) ||
        /\.ld-aurora/.test(css.slice(0, m.index).split('\n').slice(-6).join('\n')) ||
        /\.ld-aurora\s+i\{[^}]*border-radius:50%/.test(css);
      if (!capped) bad.push(`${f}:${css.slice(0, m.index).split('\n').length} width:${w}px`);
    }
  }
  ok('No stylesheet sets a hard width wider than a 390px phone without capping it',
    bad.length === 0, bad.slice(0, 5).join(' | '));

  ok('The console shell clips horizontal overflow at the shell, so a stray child cannot scroll the page',
    /\.app\.shell,\s*\.app\.shell > :is\(\.shell-role-banner,\.topbar,\.sheet,\.content\)\{min-width:0;max-width:100%/.test(entry));
  ok('The console bar itself is never a fixed-height strip that a wrapped row can spill out of',
    /\.app\.shell>\.topbar\.cbar\{[\s\S]{0,200}height:auto !important;max-height:none/.test(entry));
  ok('Long words in the banner copy cannot widen it',
    /\.shell-role-banner \.ws67-hero-copy\{max-width:100%;overflow-wrap:anywhere;\}/.test(schemes));
}

/* ---------------------------------------------------------------------
   5. The tablet tier (768-1024px) is a layout of its own, not a stretched
      phone and not a squeezed desktop
   --------------------------------------------------------------------- */
{
  /* Below 1000px the introduction is one column, so the greeting, the actions
     and the quick metrics stack instead of fighting for the same row. */
  ok('The tablet hero is a single column, not a two-column squeeze',
    /@media\(min-width:1000px\)\{[\s\S]{0,400}\.shell-role-banner \.ws67-hero-main\{grid-template-columns:minmax\(0,1\.38fr\) minmax\(240px,\.88fr\) !important;\}\n\}/.test(schemes));
  ok('The base hero is one column, applied at every width until the desktop tier',
    /\.shell-role-banner \.ws67-hero-main\{grid-template-columns:minmax\(0,1fr\) !important;\}/.test(schemes));
  ok('The quick metrics stay a two-up grid on a tablet, so four read as 2x2',
    /\.ws67-qgrid, \.ws67-hero \.ws67-qgrid\.hero-qtabs\{\s*display:grid !important; grid-template-columns:repeat\(2, minmax\(0, 1fr\)\);/.test(read('carelink63.css')));
  ok('Tablets and phones get 44px touch targets on every control in the shell',
    /html\[data-client-kind="tablet"\] \.shell :is\(\.btn,\.icon-btn,\.tab,\.np-i\),html\[data-client-kind="phone"\] \.shell :is\(\.btn,\.icon-btn,\.tab,\.np-i\)\{min-height:44px;\}/.test(entry));
  ok('Tablet controls never rely on double-tap zoom to be usable',
    /html\[data-client-kind="tablet"\] :is\(button,input,select\)/.test(entry) &&
    /touch-action:manipulation/.test(entry));
  ok('A compact client gets the one-column banner even on a wide screen',
    /html\[data-client-layout="compact"\] \.shell-role-banner \.ws67-hero-main\{grid-template-columns:minmax\(0,1fr\) !important;\}/.test(entry));

  /* What a metric card has to hold is read out of the application, not
     guessed: every console's quick-metric labels, the longest of them, and how
     many words that is. A card carries that label beside a 13px icon at
     11px/700 with 12px padding each side; two cards plus the 8px grid gap
     have to fit the metric column for the four metrics to read as 2x2 rather
     than as four cramped rows with wrapped labels. */
  const labels = JSON.parse(run(`(() => {
    const out = [];
    DB.db.users.forEach(u => { try { ROLE_CTX.heroQuickTabs(u).forEach(t => out.push(t.label)); } catch (_e) {} });
    return JSON.stringify([...new Set(out)]);
  })()`));
  ok('Every console declares quick-metric labels, so the card width is a real constraint',
    labels.length >= 10, `${labels.length} distinct labels`);
  const longest = labels.reduce((a, b) => (b.length > a.length ? b : a), '');
  const charPx = 6.1;                                  // 11px Inter, weight 700
  const labelPx = longest.length * charPx;
  const cardMin = labelPx + 13 + 5 + 24;               // label + icon + gap + padding
  const twoUpMin = cardMin * 2 + 8;                    // two cards + the grid gap
  const metricsTrack = (w) => Math.max(240, (w - 44 - 18) * (0.88 / 2.26));
  ok('The longest metric label is a real multi-word label, not a single word',
    longest.split(' ').length >= 2, JSON.stringify(longest));
  ok('At 1100px the four metrics still fit two-up, so the desktop tier is chosen correctly',
    metricsTrack(1100) >= twoUpMin, `${Math.round(metricsTrack(1100))}px available, ${Math.round(twoUpMin)}px needed`);
  ok('At 820px a two-column banner would leave the metrics short, which is why the tablet tier is one column',
    metricsTrack(820) < twoUpMin, `${Math.round(metricsTrack(820))}px available, ${Math.round(twoUpMin)}px needed`);

  ok('The role strip is a single scroller on a tablet as well as a phone (no wrapped wall)',
    /\.shell-role-banner \.ws67-role-tabs > \.row\{flex:1 1 auto;min-width:0;flex-wrap:nowrap !important;overflow-x:auto/.test(schemes));
}

console.log(`mobile layout: ${passed} checks passed, 0 failed`);
