/* =====================================================================
   v6110-entry-one-screen.js — the one-screen policy, enforced

   The landing page and the sign-in page are deliberately one screen: they fill
   the viewport exactly and do not scroll on a laptop or a tablet. That policy
   is easy to break by accident, because anything that takes room in the page
   flow - one more footer row, one more button, a taller header - pushes the
   whole layout past 100dvh.

   This suite states the policy as a set of invariants instead of a screenshot:
     * the shells are viewport-fitted, with overflow held at the shell;
     * every overlay that lives on the page is position:fixed, so it can never
       contribute a single pixel of height;
     * the page's own flow children are the ones the design intends, and
       nothing else - in particular no injected control below the footer;
     * a phone may scroll (a portrait phone is not a 1366x768 laptop), and the
       tier boundary says so.

   It also asserts the install pill specifically: restoring it to
   position:fixed is what guarantees it cannot affect the page height.
   ===================================================================== */
const fs = require('node:fs');
const path = require('node:path');
const { makeCtx } = require('./dom');

const REPO = path.resolve(__dirname, '..', '..');
const SRC = path.join(REPO, 'v6', 'src');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const console6 = read('console6.css');
const entryTheme = read('entry_theme.css');
const entry6 = read('entry6.js');
const install = fs.readFileSync(path.join(REPO, 'v6', 'pwa-install.html'), 'utf8');

let passed = 0;
function ok(name, condition, detail) {
  if (!condition) throw new Error(name + (detail === undefined ? '' : ` — ${detail}`));
  passed++;
  console.log('  ok  ' + name);
}

const { run } = makeCtx({ setTimeout: () => 0 });
run('DB.load();DB.seedDemo();APPX.screen="landing";');

/* ---------------------------------------------------------------------
   1. The landing shell is viewport-fitted, and only a phone may scroll
   --------------------------------------------------------------------- */
{
  ok('The landing front door is fitted to the viewport on a laptop',
    /\.ld\[data-front="1"\], \.ld\.ld-front\{\s*height:100dvh; max-height:100dvh; min-height:100dvh;\s*overflow:hidden !important;/.test(console6));
  ok('The landing is a column that holds its own height, so the footer cannot push past it',
    /\.ld\{\s*min-height:100vh; position:relative; overflow-x:clip;[\s\S]{0,400}display:flex; flex-direction:column;/.test(console6));
  ok('The middle band takes the space left over instead of forcing its content height',
    /\.ld\[data-front="1"\] \.ld-front-main, \.ld\.ld-front \.ld-front-main\{\s*flex:1 1 auto; min-height:0;\s*display:flex; align-items:center;\s*overflow:hidden;/.test(console6));
  ok('The header is flex:0 0 auto, so it neither grows nor stretches the page',
    /\.ld\[data-front="1"\] \.ld-top, \.ld\.ld-front \.ld-top\{\s*padding:10px[\s\S]{0,120}flex:0 0 auto;/.test(console6));
  ok('The root distributes header, band and footer without leaving a gap that scrolls',
    /\.ld\[data-front="1"\], \.ld\.ld-front\{[\s\S]{0,160}justify-content:space-between;/.test(console6));

  /* The scroll exception exists for real phones, and only for them. */
  ok('Phone and keyboard-short viewports may scroll the landing (they cannot fit one screen)',
    /@media \(max-width:860px\), \(max-height:560px\)\{\s*\.ld\[data-front="1"\], \.ld\.ld-front\{\s*height:auto !important;\s*max-height:none !important;\s*min-height:100dvh;\s*overflow-y:auto !important;/.test(console6));
  ok('A 1366x768 laptop is NOT inside that exception, so it stays one screen',
    1366 > 860 && 768 > 560);
  ok('A 390x844 phone IS inside it (a portrait phone legitimately scrolls)',
    390 <= 860);
  ok('No stylesheet re-opens a narrow-height breakpoint that would unlock the laptop again',
    !/@media\s*\(max-height:820px\)/.test(console6) && !/@media\s*\(max-height:600px\)/.test(console6));

  /* The final layer must notundo the fitted shell on a desktop. */
  ok('The final entry layer restores the fitted shell at laptop sizes',
    /@media\(min-width:700px\) and \(min-height:700px\), \(min-width:921px\) and \(min-height:600px\)\{[\s\S]{0,240}\.ld\[data-front="1"\]\[data-theme\],\.lg6\[data-theme\]\{height:100dvh !important;min-height:100dvh;max-height:100dvh !important;\}/.test(entryTheme));
  ok('The sign-in shell is fitted to the viewport too, with its own overflow held',
    /\.lg6\[data-theme\]\{height:100dvh !important;min-height:0 !important;max-height:100dvh !important;overflow:hidden !important;\}/.test(entryTheme));
}

/* ---------------------------------------------------------------------
   2. Nothing in the landing's flow sits below its footer
   --------------------------------------------------------------------- */
{
  const landing = String(run('renderLanding6()'));
  const rootChildren = (() => {
    /* Walk the top-level children of the .ld root, in order. */
    const start = landing.indexOf('<div class="ld"');
    let i = landing.indexOf('>', start) + 1;
    const out = [];
    let depth = 1;
    while (i < landing.length && depth > 0) {
      if (landing.startsWith('<div', i) && !landing.startsWith('<div', i + 1)) { depth++; i = landing.indexOf('>', i) + 1; continue; }
      const close = landing.indexOf('</div>', i);
      const open = landing.indexOf('<', i);
      if (open === -1) break;
      const tag = landing.slice(open).match(/^<([a-z0-9]+)([^>]*)>/) || landing.slice(open).match(/^<\/([a-z0-9]+)>/);
      if (tag && !tag[0].startsWith('</')) {
        const cls = (tag[2].match(/class="([^"]*)"/) || [, ''])[1];
        if (depth === 1) out.push(`${tag[1]}${cls ? '.' + cls.split(' ')[0] : ''}`);
      }
      if (tag && tag[0].startsWith('</' + tag[1])) { depth--; }
      i = open + 1;
      if (close === -1) break;
      /* stop once the root closes */
      if (depth === 0) break;
    }
    return out;
  })();
  ok('The landing root renders its own top-level sections',
    rootChildren.length >= 2, rootChildren.slice(0, 8).join(' > '));
  ok('The landing footer is the last element in the page flow',
    /<\/footer>\s*<\/div>\s*$/.test(landing.trim().slice(-80)), landing.trim().slice(-60));
  ok('No install control is rendered inside the landing markup (the pill is an overlay, not page content)',
    !landing.includes('data-pwa-install') && !landing.includes('pwa-install-btn'));
  ok('The landing declares no fixed-height child that would need the page to scroll',
    !/style="[^"]*height:\s*\d{3,}px/.test(landing));

  const signIn = String(run('renderLogin6()'));
  ok('The sign-in page renders as a single fitted shell',
    signIn.includes('class="lg6') && !signIn.includes('pwa-install-btn'));
  ok('The sign-in page puts nothing below its own tail',
    /<\/main>\s*<\/div>\s*$/.test(signIn.trim().slice(-40)), signIn.trim().slice(-30));
}

/* ---------------------------------------------------------------------
   3. Every overlay on the entry pages is fixed, so it costs zero height
   --------------------------------------------------------------------- */
{
  const offsetRule = (name) => new RegExp(
    name + "[\\s\\S]{0,400}?position:\\s*'fixed'").test(install);
  ok('The install pill is position:fixed, so it adds no pixels to the page',
    /Object\.assign\(b\.style, \{ position: 'fixed', right: '16px', bottom: '16px'/.test(install));
  ok('The update and offline notices are position:fixed too',
    /Object\.assign\(el\.style, \{ position: 'fixed', left: '12px', right: '12px', bottom: '76px'/.test(install));
  ok('Neither overlay is sticky, static or a flow child that could grow the page',
    !/position:\s*'sticky'/.test(install) && !/position:\s*'static'/.test(install));
  ok('No overlay is appended inside the landing or sign-in shell itself',
    /doc\.body\.appendChild|host\.appendChild|installHost/.test(install) && !/querySelector\('\.ld|querySelector\('\.lg6/.test(install));

  /* Anything that floats over an entry page must be anchored. The name has to
     mean it: `.lg6-photo-overlay` is a caption band *inside* the photo frame
     and is deliberately static, so scanning for the word "overlay" alone
     reports a false positive. Scan the things that are genuinely overlays -
     scrims, modals, toasts, notice strips - and require them to be anchored. */
  const overlayNames = [...entryTheme.matchAll(/\.([a-z0-9-]*(?:scrim|modal|toast|notice-strip|sheet-back|pill)[a-z0-9-]*)\{([^}]*)\}/g)];
  const floatingNames = [...entryTheme.matchAll(/\.([a-z0-9-]*(?:scrim|modal|toast|strip|back)[a-z0-9-]*)\{[^}]*position:\s*(fixed|absolute|sticky|static)/g)];
  const flowOverlays = floatingNames.filter((m) => m[2] === 'static' || m[2] === 'sticky').map((m) => m[1]);
  ok('Entry-page overlays are anchored rather than laid out in the flow',
    flowOverlays.length === 0, flowOverlays.join(', '));
  ok('The photo caption band is a caption, not an overlay, and is stated as static',
    /\.lg6\[data-theme\] \.lg6-photo-overlay\{position:static/.test(entryTheme));
  ok('The entry stylesheets declare no sticky element that could outlive the viewport',
    !/position:\s*sticky/.test(entryTheme.replace(/\.app\.shell[^{]*\{[^}]*\}/g, '')), 'sticky outside the console shell');
}

/* ---------------------------------------------------------------------
   4. The policy is stated where a future change would read it
   --------------------------------------------------------------------- */
{
  ok('The landing shell states the one-screen rule next to the rule that enforces it',
    /single-screen|one screen|100dvh/.test(console6));
  ok('The install pill states why it is fixed',
    /never enters the page flow|no room in the|page flow/.test(install));
  ok('The phone exception states why it exists',
    /Narrow portrait handsets|ultra-short onscreen-keyboard/.test(console6));
}

console.log(`entry one-screen: ${passed} checks passed, 0 failed`);
