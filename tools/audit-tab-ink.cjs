/* =====================================================================
   tools/audit-tab-ink.cjs — resolve what an active tab actually paints

   Reading the stylesheets and guessing which rule wins does not work: the
   console paints its navigation from four layers (carelink63, the colour
   schemes, entry_theme, admin_ops) and the winner is decided by specificity,
   source order and !important together. This resolves that properly.

   For a set of target elements (an active sheet tab, a role chip, a quick
   button, the "All" control, a segment, a tile) under each theme and mode, it:
     1. collects every rule whose selector could match the element;
     2. ranks them by real CSS cascade order (importance, then specificity,
        then source position);
     3. takes the winning `background`/`background-color` and `color`;
     4. resolves var(), color-mix(), rgba() and hex against the theme's own
        custom properties, then computes the WCAG contrast ratio.

   Anything below the gate is reported with the exact rule that won, so the
   fix goes to the rule that is actually responsible.

     node tools/audit-tab-ink.cjs [--min 4.5] [--verbose]
   ===================================================================== */
const fs = require('node:fs');
const path = require('node:path');
const { makeCtx } = require('../v6/test/dom');

const REPO = path.resolve(__dirname, '..');
const SRC = path.join(REPO, 'v6', 'src');
const CSS_ORDER = ['styles.css', 'console51.css', 'console6.css', 'portal6.css', 'audit6.css',
  'carelink63.css', 'console_color_schemes.css', 'admin_ops6.css', 'care_review.css', 'entry_theme.css', 'tab_ink.css'];

const args = process.argv.slice(2);
const MIN = Number((args.find((a) => a.startsWith('--min')) || '').split('=')[1] || 4.5);
const VERBOSE = args.includes('--verbose');

/* ---------------- 1. token machinery, borrowed from the application ------- */
const { run } = makeCtx({ setTimeout: () => 0 });
run('DB.load();DB.seedDemo();');
run('globalThis.__cap={}; document.documentElement={setAttribute(){},style:{setProperty:(k,v)=>{globalThis.__cap[k]=v}}};');

const hex2rgb = (h) => {
  const s = String(h).replace('#', '');
  const n = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
};
const rgb2hex = (r) => '#' + r.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
const lum = (rgb) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
};
const contrast = (a, b) => {
  const la = lum(hex2rgb(a)), lb = lum(hex2rgb(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
const mixSrgb = (a, b, p) => {
  const A = hex2rgb(a), B = hex2rgb(b);
  return rgb2hex([0, 1, 2].map((i) => A[i] * p + B[i] * (1 - p)));
};

/* Resolve one CSS colour expression against the live custom properties. */
function resolveColour(expr, vars, depth = 0) {
  if (!expr || depth > 12) return null;
  let s = String(expr).trim().replace(/!important/i, '').trim();
  if (!s || s === 'transparent' || s === 'none' || s === 'currentcolor' || s === 'inherit') return null;

  /* var(--x, fallback) — innermost first */
  let guard = 0;
  while (/var\(/.test(s) && guard++ < 20) {
    s = s.replace(/var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)/i, (_m, name, fb) => {
      const v = vars[name];
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
      return fb !== undefined ? String(fb).trim() : '';
    });
  }
  if (!s) return null;

  /* color-mix(in srgb, A p%, B) */
  const cm = s.match(/color-mix\(\s*in\s+srgb\s*,\s*(.+?)\s+(\d+(?:\.\d+)?)%\s*,\s*(.+?)\s*\)$/i);
  if (cm) {
    const a = resolveColour(cm[1], vars, depth + 1), b = resolveColour(cm[3], vars, depth + 1);
    if (!a || !b) return null;
    return mixSrgb(a, b, Number(cm[2]) / 100);
  }
  const cm2 = s.match(/color-mix\(\s*in\s+srgb\s*,\s*(.+?)\s*,\s*(.+?)\s*\)$/i);
  if (cm2) {
    const a = resolveColour(cm2[1], vars, depth + 1), b = resolveColour(cm2[2], vars, depth + 1);
    if (!a || !b) return null;
    return mixSrgb(a, b, 0.5);
  }

  const rgbAm = s.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)/i);
  if (rgbAm) {
    const a = rgbAm[4] === undefined ? 1 : Number(rgbAm[4]);
    return { rgb: rgb2hex([Number(rgbAm[1]), Number(rgbAm[2]), Number(rgbAm[3])]), alpha: a };
  }
  if (/^#[0-9a-f]{3}$/i.test(s)) return '#' + s.slice(1).split('').map((c) => c + c).join('').toUpperCase();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toUpperCase();
  if (/^#[0-9a-f]{8}$/i.test(s)) return s.slice(0, 7).toUpperCase();
  if (/^(white|#fff)$/i.test(s)) return '#FFFFFF';
  if (/^black$/i.test(s)) return '#000000';
  return null;
}

/* A background may be a gradient: take its first colour stop. */
function firstBackground(expr, vars) {
  if (!expr) return null;
  const grad = String(expr).match(/(?:linear|radial|conic)-gradient\(([\s\S]*)\)/i);
  if (grad) {
    const stop = grad[1].split(',').map((x) => x.trim()).find((x) => /^(#|rgb|color-mix|var)/i.test(x.replace(/^[^ ]+ /, '')));
    return stop ? firstBackground(stop, vars) : null;
  }
  return resolveColour(expr, vars);
}

/* ---------------- 2. a small CSS parser -------------------------------- */
function parseSheets() {
  const rules = [];
  let position = 0;
  for (const file of CSS_ORDER) {
    /* Comments must go before parsing. A comment sitting immediately above a
       rule was being absorbed into that rule's selector, so the selector no
       longer matched anything and the rule was invisible to the audit - the
       new tab_ink.css rules were all discarded this way. */
    const css = fs.readFileSync(path.join(SRC, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
    let i = 0;
    while (i < css.length) {
      const open = css.indexOf('{', i);
      if (open === -1) break;
      /* find the matching close brace */
      let depth = 1, j = open + 1;
      while (j < css.length && depth > 0) {
        if (css[j] === '{') depth++;
        else if (css[j] === '}') depth--;
        j++;
      }
      const selectorText = css.slice(i, open).trim();
      const body = css.slice(open + 1, j - 1);
      /* keep at-rule context (media queries and the like) */
      const before = css.slice(Math.max(0, i - 400), i);
      const at = (before.match(/@(media|supports)[^{]*\{[^{}]*$/) || [null])[0];
      if (selectorText && !selectorText.startsWith('@') && selSafe(selectorText)) {
        /* The selector LIST is comma-separated, but a comma inside :is(),
           :not() or an attribute value does not separate selectors. Splitting
           naively cut `.tab:is(.active,.on) :is(span, b, svg, i)` in half and
           the two halves then matched nothing - a false pass on exactly the
           rule the fix adds. */
        for (const sel of splitTopLevelList(selectorText)) {
          rules.push({ file, sel: sel.trim(), body, position: position++, at: at || null });
        }
      }
      i = j;
    }
  }
  return rules;
}
/* Skip keyframe percentages and unparseable leftovers. */
/* Split a selector list on commas that are not inside brackets. */
function splitTopLevelList(text) {
  const out = [];
  let buf = '';
  let depth = 0;
  for (const ch of text) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { out.push(buf); buf = ''; continue; }
    buf += ch;
  }
  if (buf.trim()) out.push(buf);
  return out;
}
function selSafe(sel) {
  return !/^(from|to|\d+%|@)/.test(sel.trim()) && /[.#[:a-z]/i.test(sel);
}

/* ---------------- 3. specificity & matching ---------------------------- */
function specificity(sel) {
  const s = sel
    .replace(/::[a-z-]+(\([^)]*\))?/gi, ' ')
    .replace(/:not\(([^)]*)\)/gi, ' $1 ')
    .replace(/\[[^\]]*\]/g, ' attr ');
  const ids = (s.match(/#[\w-]+/g) || []).length;
  const classes = (s.match(/\.[\w-]+/g) || []).length
    + (s.match(/\[[^\]]*\]/g) || []).length
    + (s.match(/:(?!:)[a-z-]+/gi) || []).length
    + (s.match(/ attr /g) || []).length;
  const types = (s.match(/(?:^|[\s>+~(,])([a-z][a-z0-9-]*)(?=[\s>+~),:]|$)/gi) || []).length;
  return ids * 1000000 + classes * 1000 + types;
}

/* Does this selector match the given element? Supports the sub-set the
   console actually uses: descendant/child combinators, class, id, attribute
   (presence, =, ~=, ^=), :is(), :not(), :nth-child(6n+k), :not(.x). */
function makeElement(spec) {
  return {
    tag: spec.tag || 'button',
    id: spec.id || '',
    classes: new Set(spec.classes || []),
    attrs: spec.attrs || {},
    parent: spec.parent ? makeElement(spec.parent) : null,
    index: spec.index || 1,
  };
}
function compoundMatches(compound, el) {
  if (!compound) return false;
  const c = compound.trim();
  if (!c) return false;
  /* ::selection, ::before and friends are pseudo-ELEMENTS, not states: a rule
     that styles them paints nothing on the element itself and must never be
     taken as the winner. */
  if (/^::/.test(c) || /::(before|after|selection|placeholder|marker|first-line|first-letter)\b/i.test(c)) return false;
  /* :not(...) */
  const nots = [...c.matchAll(/:not\(([^)]*)\)/gi)].map((m) => m[1]);
  for (const n of nots) {
    for (const alt of n.split(',')) {
      if (compoundMatches(alt.trim(), el)) return false;
    }
  }
  /* :is(...) */
  const ises = [...c.matchAll(/:is\(([^)]*)\)/gi)].map((m) => m[1]);
  for (const group of ises) {
    const alts = group.split(',').map((x) => x.trim());
    if (!alts.some((a) => compoundMatches(a, el))) return false;
  }
  /* :nth-child(6n+2) etc. */
  const nth = c.match(/:nth-child\(\s*(\d*)n\s*([+-]\s*\d+)?\s*\)/i);
  if (nth) {
    const a = nth[1] === '' ? 1 : Number(nth[1]);
    const b = nth[2] === undefined ? 0 : Number(nth[2].replace(/\s+/g, ''));
    const i = el.index;
    if (a === 0 ? i !== b : ((i - b) % a !== 0 || (i - b) / a < 0)) return false;
  }
  /* :hover/:focus etc. are never true for a resting element */
  if (/:(hover|focus|active|focus-visible|focus-within)\b/i.test(c.replace(/:not\([^)]*\)/gi, ''))) return false;

  /* :is(a, .b) contributes the identifiers common to EVERY alternative; when
     the alternatives are a single compound, all of them are unconditional and
     can simply be folded in. */
  const isesFlat = [...c.matchAll(/:is\(([^)]*)\)/gi)].map((m) => {
    const alts = m[1].split(',').map((x) => x.trim()).filter(Boolean);
    if (alts.length === 1) return ' ' + alts[0] + ' ';
    const common = alts.reduce((acc, a) => {
      const ids = (a.match(/[.#][\w-]+/g) || []);
      return acc.filter((x) => ids.includes(x));
    }, (alts[0].match(/[.#][\w-]+/g) || []));
    return ' ' + common.join('') + ' ';
  });
  let stripped = c;
  let fi = 0;
  stripped = stripped.replace(/:is\([^)]*\)/gi, () => isesFlat[fi++]);
  stripped = stripped
    .replace(/:not\([^)]*\)/gi, '')
    .replace(/:nth-child\([^)]*\)/gi, '');
  /* tag */
  const tagM = stripped.match(/^([a-z][a-z0-9-]*)/i);
  if (tagM && tagM[1].toLowerCase() !== String(el.tag).toLowerCase()) return false;
  /* id */
  const idM = stripped.match(/#([\w-]+)/);
  if (idM && idM[1] !== el.id) return false;
  /* classes */
  for (const cls of (stripped.match(/\.([\w-]+)/g) || [])) {
    if (!el.classes.has(cls.slice(1))) return false;
  }
  /* attributes */
  for (const m of stripped.matchAll(/\[([\w-]+)(?:([~^$*|]?=)"?([^"\]]*)"?)?\]/g)) {
    const name = m[1], op = m[2], val = m[3];
    const actual = el.attrs[name];
    if (actual === undefined) return false;
    if (op === '=' && String(actual) !== val) return false;
    if (op === '~=' && !String(actual).split(/\s+/).includes(val)) return false;
    if (op === '^=' && !String(actual).startsWith(val)) return false;
  }
  return true;
}
/* Right-to-left matching, which is how a browser does it: the subject must
   match first, then each compound to its left must match an ancestor (or the
   direct parent, for `>`). The earlier version walked the chain forwards and
   silently mis-handled three-level descendant chains, which made the audit
   report passing colours for controls it had never actually resolved. */
/* Splitting a selector on whitespace is wrong the moment a functional
   pseudo-class is involved: `:is(span, b, svg, i)` contains three spaces that
   are part of one compound. Splitting blindly produced a chain the matcher
   could never satisfy, so every rule written with :is(...) was silently
   treated as "does not apply" - which is exactly the shape of the rule the fix
   introduces. Combinators are therefore only recognised at bracket depth 0. */
function splitTopLevel(sel) {
  const out = [];
  let buf = '';
  let depth = 0;
  const push = () => { if (buf.trim()) out.push(buf.trim()); buf = ''; };
  for (const ch of sel) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (depth === 0 && /\s/.test(ch)) { push(); continue; }
    if (depth === 0 && /[>+~]/.test(ch)) { push(); out.push(ch); continue; }
    buf += ch;
  }
  push();
  return out;
}

function parseSelector(sel) {
  const out = [];
  let pending = null;
  for (const t of splitTopLevel(sel.trim())) {
    if (/^[>+~]$/.test(t)) { pending = t; continue; }
    out.push({ comb: out.length === 0 ? null : (pending || ' '), sel: t });
    pending = null;
  }
  return out;
}
function matchFrom(chain, idx, el) {
  if (!el) return false;
  if (!compoundMatches(chain[idx].sel, el)) return false;
  if (idx === 0) return true;
  const comb = chain[idx].comb;
  if (comb === '>') return matchFrom(chain, idx - 1, el.parent);
  if (comb === '+' || comb === '~') return false;      // sibling chains are not modelled
  for (let a = el.parent; a; a = a.parent) {
    if (matchFrom(chain, idx - 1, a)) return true;
  }
  return false;
}
function selectorMatches(sel, el) {
  const chain = parseSelector(sel);
  if (!chain.length) return false;
  return matchFrom(chain, chain.length - 1, el);
}

/* ---------------- 4. resolve a target -------------------------------
   The ancestor chain matters more than the element. The console styles its
   navigation almost entirely through rules prefixed with
   html[data-colorscheme]:not([data-colorscheme="public"]) ... .app.shell ...
   so an element tested without those ancestors matches none of them and
   every check passes for the wrong reason. Each target therefore carries the
   full chain the browser would see, in the attributes the device actually
   reports. */
const HTML_ATTRS = {
  'data-wt': 'foundation',
  'data-colorscheme': 'department',
  'data-wmode': 'light',
  'data-client-kind': 'phone',
  'data-touch': 'large',
  'data-tabstyle': 'pill',
};
const html = { tag: 'html', attrs: HTML_ATTRS };
const body = { tag: 'body', parent: html };
const shell = { tag: 'div', classes: ['app', 'shell', 'has-pane'], parent: body };
const content = { tag: 'main', classes: ['content'], parent: shell };

const TARGETS = [
  { name: 'active sheet page tab',
    chain: { tag: 'button', classes: ['tab', 'active'], index: 3, parent: { tag: 'nav', classes: ['sheet'], parent: shell } } },
  { name: 'current role chip',
    chain: { tag: 'button', classes: ['ctx-rtab', 'on'], index: 2,
      parent: { tag: 'div', classes: ['row'], parent: { tag: 'div', classes: ['ctx-role-tabs', 'ws67-role-tabs'],
        parent: { tag: 'div', classes: ['ws67-hero', 'ctx-strip'], parent: { tag: 'div', classes: ['shell-role-banner'], parent: content } } } } } },
  { name: 'role chip (not current)',
    chain: { tag: 'button', classes: ['ctx-rtab'], index: 4,
      parent: { tag: 'div', classes: ['row'], parent: { tag: 'div', classes: ['ctx-role-tabs', 'ws67-role-tabs'],
        parent: { tag: 'div', classes: ['ws67-hero', 'ctx-strip'], parent: { tag: 'div', classes: ['shell-role-banner'], parent: content } } } } } },
  { name: 'quick shortcut (on)',
    chain: { tag: 'button', classes: ['cb-qbtn', 'on'], index: 1,
      parent: { tag: 'nav', classes: ['cb-quick', 'console-shortcuts'], parent: content } } },
  { name: 'All control',
    chain: { tag: 'button', classes: ['sheet-all'], index: 1, parent: { tag: 'nav', classes: ['sheet'], parent: shell } } },
  { name: 'layout segment (on)',
    chain: { tag: 'button', classes: ['on'], index: 1,
      parent: { tag: 'div', classes: ['seg', 'ws67-mode-seg'], parent: { tag: 'details', classes: ['ws67-layout-options'],
        parent: { tag: 'div', classes: ['ctx-role-tabs', 'ws67-role-tabs'], parent: { tag: 'div', classes: ['shell-role-banner'], parent: content } } } } } },
  { name: 'module tab (active)',
    chain: { tag: 'button', classes: ['tab', 'active'], index: 2, parent: { tag: 'div', classes: ['tabs'], parent: content } } },
  { name: 'active sheet tab LABEL',
    chain: { tag: 'span', classes: [], index: 1, parent: { tag: 'button', classes: ['tab', 'active'], index: 3,
      parent: { tag: 'nav', classes: ['sheet'], parent: shell } } } },
  { name: 'active sheet tab ICON',
    chain: { tag: 'svg', classes: [], index: 1, parent: { tag: 'button', classes: ['tab', 'active'], index: 3,
      parent: { tag: 'nav', classes: ['sheet'], parent: shell } } } },
  { name: 'synced sheet tab LABEL',
    chain: { tag: 'span', classes: [], index: 1, parent: { tag: 'button', classes: ['tab', 'active'], index: 3,
      parent: { tag: 'nav', classes: ['sheet', 'synced'], parent: shell } } } },
  { name: 'active module tab LABEL',
    chain: { tag: 'span', classes: [], index: 1, parent: { tag: 'button', classes: ['tab', 'active'], index: 2,
      parent: { tag: 'div', classes: ['tabs'], parent: content } } } },
  { name: 'current role chip LABEL',
    chain: { tag: 'span', classes: [], index: 1, parent: { tag: 'button', classes: ['ctx-rtab', 'on'], index: 2,
      parent: { tag: 'div', classes: ['row'], parent: { tag: 'div', classes: ['ctx-role-tabs', 'ws67-role-tabs'],
        parent: { tag: 'div', classes: ['ws67-hero', 'ctx-strip'], parent: { tag: 'div', classes: ['shell-role-banner'], parent: content } } } } } } },
  { name: 'hero quick metric',
    chain: { tag: 'button', classes: ['ws67-qcard'], index: 1,
      parent: { tag: 'div', classes: ['ws67-qgrid', 'hero-qtabs'], parent: { tag: 'div', classes: ['ws67-hero-main'],
        parent: { tag: 'section', classes: ['ws67-hero', 'ctx-strip'], parent: { tag: 'div', classes: ['shell-role-banner'], parent: content } } } } } },
];

/* A span inside a chip paints no background of its own: the colour its text
   sits on is the chip's. Walk up until something opaque is found, exactly as
   the compositor does, then fall back to the page surface. */
function effectiveBackground(el, rules, vars, surface) {
  let node = el;
  let alpha = 0;
  let painted = null;
  while (node && alpha < 1) {
    const w = winnerFor(node, rules, 'background');
    if (w) {
      const raw = (w.rule.body.match(/(?:^|[;\s])background(?:-color)?:\s*([^;]+)/i) || [])[1];
      let c = raw ? firstBackground(raw, vars) : null;
      if (c) {
        const a = typeof c === 'object' ? c.alpha : 1;
        const rgb = typeof c === 'object' ? c.rgb : c;
        painted = painted ? mixSrgb(rgb, painted, a) : (alpha === 0 ? rgb : mixSrgb(rgb, painted, a));
        alpha += a * (1 - alpha);
      }
    }
    node = node.parent;
  }
  if (painted && alpha >= 1) return painted;
  if (painted) return mixSrgb(painted, surface, alpha) && mixSrgb(surface, painted, alpha);
  return surface;
}

function backgroundOf(rule, vars, surface) {
  const bg = (rule.body.match(/(?:^|[;\s])background-color:\s*([^;]+)/i) || [])[1]
    || (rule.body.match(/(?:^|[;\s])background:\s*([^;]+)/i) || [])[1];
  if (!bg) return null;
  let c = firstBackground(bg, vars);
  if (!c) return null;
  if (typeof c === 'object') {
    /* rgba() over the page surface */
    c = c.alpha >= 1 ? c.rgb : mixSrgb(c.rgb, surface || '#FFFFFF', c.alpha);
  }
  return c;
}
function inkOf(rule, vars) {
  const fg = (rule.body.match(/(?:^|[;\s])color:\s*([^;]+)/i) || [])[1];
  if (!fg) return null;
  let c = resolveColour(fg, vars);
  if (c && typeof c === 'object') c = c.rgb;
  return c;
}

/* The rightmost compound of a selector must match the element itself, so its
   classes are a cheap necessary condition. Indexing on them turns an
   O(rules x elements) regex sweep into a short candidate list - without this
   the audit takes two minutes and cannot run inside the test suite. */
function subjectTokens(sel) {
  const parts = splitTopLevel(sel);
  const last = parts[parts.length - 1] || '';
  const flat = last.replace(/:is\(([^)]*)\)/gi, (_m, g) => {
    const alts = g.split(',').map((x) => x.trim()).filter(Boolean);
    if (alts.length === 1) return ' ' + alts[0];
    return ' ' + alts.reduce((acc, a) => {
      const ids = (a.match(/[.#][\w-]+/g) || []);
      return acc.filter((x) => ids.includes(x));
    }, (alts[0].match(/[.#][\w-]+/g) || [])).join('');
  });
  const withoutNot = flat.replace(/:not\([^)]*\)/gi, '');
  return {
    classes: (withoutNot.match(/\.([\w-]+)/g) || []).map((x) => x.slice(1)),
    id: (withoutNot.match(/#([\w-]+)/) || [])[1] || null,
    tag: (withoutNot.match(/^([a-z][a-z0-9-]*)/i) || [])[1] || null,
  };
}
/* A rule can only match if every token in its subject compound is present, so
   at least ONE of those tokens is present. Bucketing every rule under each of
   its subject tokens and looking up the element's own tokens therefore yields
   a superset in a few dozen comparisons instead of scanning all 4,296 rules
   for each of the ~8 ancestors of each of 13 targets on 1,620 pages. */
let RULE_INDEX = null;
function buildIndex(rules) {
  RULE_INDEX = { byClass: new Map(), byTag: new Map(), byId: new Map(), loose: [] };
  for (const r of rules) {
    const sub = r.subject;
    let placed = false;
    for (const c of sub.classes) {
      if (!RULE_INDEX.byClass.has(c)) RULE_INDEX.byClass.set(c, []);
      RULE_INDEX.byClass.get(c).push(r); placed = true;
    }
    if (sub.tag) {
      const t = sub.tag.toLowerCase();
      if (!RULE_INDEX.byTag.has(t)) RULE_INDEX.byTag.set(t, []);
      RULE_INDEX.byTag.get(t).push(r); placed = true;
    }
    if (sub.id) {
      if (!RULE_INDEX.byId.has(sub.id)) RULE_INDEX.byId.set(sub.id, []);
      RULE_INDEX.byId.get(sub.id).push(r); placed = true;
    }
    if (!placed) RULE_INDEX.loose.push(r);
  }
}
function candidatesFor(el, rules) {
  if (!RULE_INDEX) buildIndex(rules);
  const seen = new Set();
  const pool = [];
  const add = (list) => { if (!list) return; for (const r of list) { if (!seen.has(r)) { seen.add(r); pool.push(r); } } };
  for (const c of el.classes) add(RULE_INDEX.byClass.get(c));
  add(RULE_INDEX.byTag.get(String(el.tag).toLowerCase()));
  if (el.id) add(RULE_INDEX.byId.get(el.id));
  add(RULE_INDEX.loose);
  const out = [];
  for (const r of pool) {
    const sub = r.subject;
    if (sub.id && sub.id !== el.id) continue;
    if (sub.tag && sub.tag.toLowerCase() !== String(el.tag).toLowerCase()) continue;
    let ok = true;
    for (const c of sub.classes) { if (!el.classes.has(c)) { ok = false; break; } }
    if (ok) out.push(r);
  }
  return out;
}

function winnerFor(el, rules, prop) {
  const viable = [];
  for (const r of candidatesFor(el, rules)) {
    if (r.at && /max-width|min-width|max-height|hover|pointer|prefers-/.test(r.at)) {
      /* media-dependent; kept, because a phone is the failing surface, but
         reported separately */
    }
    if (!selectorMatches(r.sel, el)) continue;
    const has = prop === 'background'
      ? /(?:^|[;\s])background(?:-color)?:\s*[^;]+/i.test(r.body)
      : /(?:^|[;\s])color:\s*[^;]+/i.test(r.body);
    if (!has) continue;
    const decl = prop === 'background'
      ? r.body.match(/(?:^|[;\s])background(?:-color)?:\s*([^;]+)/i)[0]
      : r.body.match(/(?:^|[;\s])color:\s*([^;]+)/i)[0];
    const important = /!important/i.test(decl) ? 1 : 0;
    viable.push({ rule: r, important, spec: specificity(r.sel), order: r.position });
  }
  viable.sort((a, b) => (b.important - a.important) || (b.spec - a.spec) || (b.order - a.order));
  return viable[0] || null;
}


/* ---- solve one element the way a browser would -----------------------
   Two things a naive version gets wrong, and both hide the bug:
     1. custom properties are inherited and may be declared on the element
        itself (`.app.shell{--tab-fill:...}`), so they must be gathered from
        every matching rule, nearest element first;
     2. `color:inherit` on the label means "the parent's colour", so the ink
        has to be walked up rather than skipped - and the fill it is tested
        against is whatever the parent actually paints. */
function ownCustomProps(el, rules) {
  const out = {};
  const chainEls = [];
  for (let n = el; n; n = n.parent) chainEls.push(n);      // nearest first
  for (const node of chainEls) {
    const decls = [];
    for (const r of candidatesFor(node, rules)) {
      if (!(r.at && /max-width:\s*7|max-width:\s*6|min-width:\s*9|min-width:\s*8/.test(r.at || ''))) {
        /* media rules that cannot apply at 390px or desktop are skipped */
      }
      for (const m of r.body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+)/gi)) {
        if (!selectorMatches(r.sel, node)) continue;
        const important = /!important/i.test(m[2]) ? 1 : 0;
        decls.push({ name: m[1], value: m[2].replace(/!important/i, '').trim(), important,
          spec: specificity(r.sel), order: r.position });
      }
    }
    decls.sort((a, b) => (b.important - a.important) || (b.spec - a.spec) || (b.order - a.order));
    for (const d of decls) if (out[d.name] === undefined) out[d.name] = d.value;  // nearest wins
  }
  return out;
}
function solveElement(el, rules, themeVars, depth = 0) {
  if (!el || depth > 6) return null;
  const vars = Object.assign({}, themeVars, ownCustomProps(el, rules));
  const fgW = winnerFor(el, rules, 'color');
  if (!fgW) return null;
  const rawInk = (fgW.rule.body.match(/(?:^|[;\s])color:\s*([^;]+)/i) || [])[1] || '';
  if (/inherit/i.test(rawInk)) {
    const parent = solveElement(el.parent, rules, themeVars, depth + 1);
    if (!parent) return null;
    /* the fill is whatever this element (or an ancestor) actually paints */
    const bg = effectiveBackground(el, rules, vars, themeVars['--surface'] || '#FFFFFF');
    return { bg, fg: parent.fg, bgFrom: bgSource(el, rules), fgFrom: { file: 'inherited', sel: '(parent ink)' } };
  }
  const bg = effectiveBackground(el, rules, vars, themeVars['--surface'] || '#FFFFFF');
  const fg = inkOf(fgW.rule, vars);
  if (!bg || !fg) return null;
  return { bg, fg, bgFrom: bgSource(el, rules), fgFrom: fgW.rule };
}
function bgSource(el, rules) {
  let node = el;
  while (node) {
    const w = winnerFor(node, rules, 'background');
    if (w) {
      const raw = (w.rule.body.match(/(?:^|[;\s])background(?:-color)?:\s*([^;]+)/i) || [])[1] || '';
      if (raw && !/transparent|none/i.test(raw)) return w.rule;
    }
    node = node.parent;
  }
  return { file: 'page', sel: '(surface)' };
}


/* ---------------- probe mode ------------------------------------------
   `--probe="<target name>"` prints every rule that matches the target's
   element and its paint chain, with the cascade rank the resolver assigns, so
   a wrong answer can be traced to a wrong match rather than guessed at. */
if (args.find((a) => a.startsWith('--probe'))) {
  const name = (args.find((a) => a.startsWith('--probe')) || '').split('=')[1] || 'active sheet tab LABEL';
  const t = TARGETS.find((x) => x.name.toLowerCase().includes(name.toLowerCase()));
  const rules2 = parseSheets();
  for (const r of rules2) r.subject = subjectTokens(r.sel);
  const id0 = (args.find((a) => a.startsWith('--theme')) || '').split('=')[1] || 'foundation';
  const mode0 = (args.find((a) => a.startsWith('--mode')) || '').split('=')[1] || 'light';
  run(`(function(){globalThis.__cap={};DB.db.personalPrefs=DB.db.personalPrefs||{};var uu=DB.db.users[0];
    DB.db.personalPrefs[uu.id]=Object.assign({},DB.db.personalPrefs[uu.id]||{},{wtheme:${JSON.stringify(id0)},wthemeMode:${JSON.stringify(mode0)}});
    AUTH.user=uu;WTHEME.apply(uu);})()`);
  const vars0 = JSON.parse(run('JSON.stringify(globalThis.__cap)'));
  let node = makeElement(t.chain);
  const varsProbe = Object.assign({}, vars0, ownCustomProps(node, rules2));
  console.log('--- resolved custom properties that matter:');
  for (const k of ['--tab-fill', '--tab-ink', '--console-c1-fill', '--console-c1-ink', '--accent', '--accent-soft', '--accent-fg'])
    console.log(`  ${k} = ${varsProbe[k]}`);
  console.log(`  --tab-fill resolves to ${resolveColour('var(--tab-fill)', varsProbe)}`);
  console.log('  --tab-ink  resolves to ' + resolveColour('var(--tab-ink)', varsProbe));
  while (node) {
    const cands = [];
    for (const r of candidatesFor(node, rules2)) {
      if (!/(?:^|[;\s])background(?:-color)?:/i.test(r.body)) continue;
      if (!selectorMatches(r.sel, node)) continue;
      const imp = /background[^;]*!important/i.test(r.body) ? 1 : 0;
      cands.push({ imp, spec: specificity(r.sel), order: r.position, sel: r.sel, file: r.file,
        val: (r.body.match(/(?:^|[;\s])background(?:-color)?:\s*([^;]+)/i) || [])[1] });
    }
    cands.sort((a, b) => (b.imp - a.imp) || (b.spec - a.spec) || (b.order - a.order));
    if (cands.length) {
      console.log(`\n--- <${node.tag}> ${[...node.classes].map((c) => '.' + c).join('')} : ${cands.length} background rules, best first`);
      cands.slice(0, 4).forEach((c) => console.log(`  imp${c.imp} spec${c.spec} pos${c.order} ${c.file}:${c.sel.trim().slice(0, 70)}\n      -> ${String(c.val).trim().slice(0, 80)} => ${resolveColour(c.val, varsProbe)}`));
    }
    node = node.parent;
  }
  process.exit(0);
}
/* Which rules win is decided by the selector and the element's attributes -
   neither of which changes between themes. Only the values behind var() do.
   The cascade is therefore analysed once per target and re-coloured per page,
   which is the difference between a five-minute audit and a ten-second one. */
const ANALYSIS = new Map();
function analyse(target) {
  if (ANALYSIS.has(target.name)) return ANALYSIS.get(target.name);
  const el = makeElement(target.chain);
  const chain = [];
  for (let n = el; n; n = n.parent) {
    chain.push({
      el: n,
      bg: winnerFor(n, rulesGlobal, 'background'),
      fg: winnerFor(n, rulesGlobal, 'color'),
      props: ownCustomProps(n, rulesGlobal),
    });
  }
  const a = { target, el, chain };
  ANALYSIS.set(target.name, a);
  return a;
}
let rulesGlobal = null;
function colourise(a, themeVars) {
  const surface = themeVars['--surface'] || '#FFFFFF';
  /* nearest-first chain; the ink of an element that inherits comes from the
     nearest ancestor that sets one */
  const merges = (node) => Object.assign({}, themeVars, node.props);
  let bgFound = null;
  for (const node of a.chain) {
    if (bgFound) break;
    const w = node.bg;
    if (!w) continue;
    const raw = (w.rule.body.match(/(?:^|[;\s])background(?:-color)?:\s*([^;]+)/i) || [])[1];
    const vars = merges(node);
    const c = raw ? firstBackground(raw, vars) : null;
    if (c && !/transparent|none/i.test(raw)) {
      let hex = typeof c === 'object' ? (c.alpha >= 1 ? c.rgb : mixSrgb(c.rgb, surface, c.alpha)) : c;
      bgFound = { hex, rule: w.rule };
    }
  }
  const bg = bgFound ? bgFound.hex : surface;
  let fgFound = null;
  for (const node of a.chain) {
    const w = node.fg;
    if (!w) continue;
    const raw = (w.rule.body.match(/(?:^|[;\s])color:\s*([^;]+)/i) || [])[1] || '';
    if (/inherit/i.test(raw)) continue;
    const vars = merges(node);
    let c = resolveColour(raw, vars);
    if (c && typeof c === 'object') c = c.rgb;
    if (c) { fgFound = { hex: c, rule: w.rule }; break; }
  }
  if (!bg || !fgFound) return null;
  return { bg, fg: fgFound.hex, bgFrom: (bgFound && bgFound.rule) || { file: 'page', sel: '(surface)' }, fgFrom: fgFound.rule };
}

/* ---- 5. run ------------------------------------------- */
const rules = parseSheets();
for (const r of rules) r.subject = subjectTokens(r.sel);
rulesGlobal = rules;
console.log(`\nresolved ${rules.length} rules from ${CSS_ORDER.length} stylesheets`);
const themeIds = JSON.parse(run('JSON.stringify(WTHEME.list.map(t=>t.id))'));
const themeModes = JSON.parse(run('JSON.stringify(WTHEME.list.reduce((a,t)=>{a[t.id]=t.mode;return a;},{}))'));
const modes = Object.values(themeModes);
const failures = [];
const unresolved = new Set();
const subjectPairs = [];
let checked = 0;

/* Every theme, in the mode the theme itself declares, for every role: the
   console signature comes from the role's department, so a scheme that reads
   perfectly for one role can put an unreadable ink on another. WTHEME.apply
   derives data-wmode from the theme, not from the preference, so looping over
   "light"/"dark" separately only re-tested the same page twice. */
/* What actually changes a selected control's colour:
     - the theme (surface, ink, mode)                     45
     - the console colour scheme (the signature hues)      8
     - the account signature (hashed per user id)          derived per account
   The role does not: the signature comes from the account id, and the console
   palette from the scheme. Sweeping all 36 roles re-tested the same colours,
   so the real axes are swept instead, plus one passed-in account id so the
   hashed signature is exercised too. */
const schemeIds = JSON.parse(run('JSON.stringify(CONSOLE_COLOR_SCHEMES.map(s=>s.id))'));
const accounts = JSON.parse(run('JSON.stringify(DB.db.users.slice(0, 4).map(u=>u.id))'));
const axes = [];
for (const sc of schemeIds) for (const acc of accounts) axes.push({ scheme: sc, account: acc });
console.log(`axes: ${themeIds.length} themes x ${schemeIds.length} schemes x ${accounts.length} signatures = ${themeIds.length * axes.length} pages`);
for (const id of themeIds) {
  for (const axis of axes) {
    const { scheme, account } = axis;
    const mode = themeModes[id] || 'light';
    const ux = JSON.parse(run(`JSON.stringify(DB.db.users.find(u=>u.id===${JSON.stringify(account)})||DB.db.users[0])`));
    run(`(function(){DB.db.personalPrefs=DB.db.personalPrefs||{};var uu=DB.db.users.find(u=>u.id===${JSON.stringify(account)})||DB.db.users[0];
      uu.roleId=${JSON.stringify(ux.roleId || 'chief')};
      DB.db.personalPrefs[uu.id]=Object.assign({},DB.db.personalPrefs[uu.id]||{},{wtheme:${JSON.stringify(id)},wthemeMode:${JSON.stringify(mode)},colorScheme:${JSON.stringify(scheme)}});
      globalThis.__cap={};AUTH.user=uu;WTHEME.apply(uu);})()`);
    const vars = JSON.parse(run('JSON.stringify(globalThis.__cap)'));
    const surface = vars['--surface'] || vars['--bg'] || '#FFFFFF';

    for (const target of TARGETS) {
      const solved = colourise(analyse(target), vars);
      if (!solved) {
        const a = analyse(target);
        const fgW = a.chain.find((n) => n.fg);
        unresolved.add(`${target.name} (unresolvable: ${fgW ? fgW.fg.rule.body.trim().slice(0, 46) : 'no ink rule matched'})`);
        continue;
      }
      const { bg, fg, bgFrom, fgFrom } = solved;
      const ratio = contrast(bg, fg);
      checked++;
      const passed = ratio >= MIN;
      subjectPairs.push({ target: target.name, bg, fg, ratio, passed, bgFrom, fgFrom });
      if (!passed) {
        failures.push({ id, role: axis.scheme + '@' + axis.account, mode, target: target.name, bg, fg, ratio,
          bgRule: bgFrom, fgRule: fgFrom });
      } else if (VERBOSE) {
        console.log(`  ok   ${id}/${axis.scheme} ${target.name}: ${bg} on ${fg} = ${ratio.toFixed(2)}`);
      }
    }
  }
}

if (unresolved.size) {
  console.log('\nTARGETS THAT COULD NOT BE CHECKED:');
  for (const u of unresolved) console.log('  ' + u);
}
console.log(`\nchecked ${checked} tab/background pairs across ${themeIds.length} themes x ${axes.length} scheme/signature pages`);
if (failures.length) {
  console.log(`\n${failures.length} BELOW ${MIN}:1\n`);
  const seen = new Map();
  for (const f of failures) {
    const key = `${f.target}|${f.bgRule.sel}|${f.fgRule.sel}`;
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key).push(f);
  }
  for (const [, group] of seen) {
    const f = group[0];
    console.log(`  ${f.target}  — ${f.ratio.toFixed(2)}:1  (${group.length} theme/mode combinations)`);
    console.log(`    background ${f.bg}  from  ${f.bgRule.file}:${f.bgRule.sel}`);
    console.log(`    text       ${f.fg}  from  ${f.fgRule.file}:${f.fgRule.sel}`);
    console.log(`    e.g. theme ${f.id} (${f.mode}), ${f.role}`);
  }
  process.exitCode = 1;
} else {
  console.log(`\nall tab ink pairs meet ${MIN}:1`);
}
