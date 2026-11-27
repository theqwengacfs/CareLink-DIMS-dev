/* =====================================================================
   tools/css-cascade.cjs — resolve what the browser will actually paint

   Reading a stylesheet and guessing which rule wins does not work in this
   console. Ten layers set the same properties, half of them with !important,
   and the winner is decided by importance, then specificity, then source
   order. Two shipped defects came from exactly that: a selected tab whose
   label was coloured by a different layer than its fill (v6.11.2), and hero
   metric cards forced to white text over a 7% wash (v6.11.3). Neither looked
   wrong in any single file.

   This module is the shared answer. Given an element's ancestor chain and the
   attributes on <html>, it collects every rule that could match, ranks them by
   real cascade order, resolves var(), color-mix(), rgba() and hex against the
   tokens the page emits, follows color:inherit up the tree, and reports the
   colour the user would see - plus the rule that produced it, so a failure
   names the file and selector to fix rather than the symptom.

   Used by tools/audit-tab-ink.cjs and tools/audit-surface-ink.cjs.
   ===================================================================== */
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const SRC = path.join(REPO, 'v6', 'src');
/* The order the production builders concatenate, so source order here is the
   order the browser sees. */
const CSS_ORDER = ['styles.css', 'console51.css', 'console6.css', 'portal6.css', 'audit6.css',
  'carelink63.css', 'console_color_schemes.css', 'admin_ops6.css', 'care_review.css',
  'entry_theme.css', 'console_head7.css', 'tab_ink.css'];

/* ---------------- colour maths ---------------------------------------- */
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

  let guard = 0;
  while (/var\(/.test(s) && guard++ < 20) {
    s = s.replace(/var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)/i, (_m, name, fb) => {
      const v = vars[name];
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
      return fb !== undefined ? String(fb).trim() : '';
    });
  }
  if (!s) return null;

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
  if (/^white$/i.test(s)) return '#FFFFFF';
  if (/^black$/i.test(s)) return '#000000';
  return null;
}

/* A background may be a gradient: take its first colour stop. The gradient's
   own parentheses must be matched as a balanced pair - a greedy `.*` ran past
   the closing bracket and swallowed the following declarations, so gradients
   failed to resolve and the audit fell back to the parent surface. That made
   white text on a dark banner look safe and, worse, made genuinely dark
   banners look pale. */
function balanceFrom(text, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') { depth--; if (depth === 0) return text.slice(openIdx + 1, i); }
  }
  return null;
}
function splitArgs(text) {
  const out = [];
  let buf = '';
  let depth = 0;
  for (const ch of text) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(buf.trim()); buf = ''; continue; }
    buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}
function firstBackground(expr, vars) {
  if (!expr) return null;
  const s = String(expr);
  const gradIdx = s.search(/(?:linear|radial|conic)-gradient\(/i);
  if (gradIdx !== -1) {
    const open = s.indexOf('(', gradIdx);
    const inner = balanceFrom(s, open);
    if (inner === null) return null;
    for (const stop of splitArgs(inner)) {
      /* drop a direction or angle ("115deg", "to right") and keep the colour */
      const colour = stop.replace(/^(?:to\s+[a-z\s]+|-?[\d.]+(?:deg|turn|rad|grad)|in\s+[a-z\s]+)\s*,?\s*/i, '').trim();
      if (!/^(#|rgb|hsl|color-mix|var)/i.test(colour)) continue;
      const c = resolveColour(colour.replace(/\s+[\d.]+%$/, ''), vars);
      if (c) return c;
      /* a stop may itself be a color-mix or a var, so try the whole stop */
      const c2 = resolveColour(colour, vars);
      if (c2) return c2;
    }
    return null;
  }
  return resolveColour(expr, vars);
}

/* ---------------- selector parsing ------------------------------------ */
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

/* Splitting a selector on whitespace is wrong the moment a functional
   pseudo-class is involved: `:is(span, b, svg, i)` contains three spaces that
   are part of one compound. Combinators are only recognised at depth 0. */
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

function selSafe(sel) {
  return !/^(from|to|\d+%|@)/.test(sel.trim()) && /[.#[:a-z]/i.test(sel);
}

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

/* ---------------- the element ----------------------------------------- */
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
     that styles them paints nothing on the element itself. */
  if (/^::/.test(c) || /::(before|after|selection|placeholder|marker|first-line|first-letter)\b/i.test(c)) return false;

  const nots = [...c.matchAll(/:not\(([^)]*)\)/gi)].map((m) => m[1]);
  for (const n of nots) {
    for (const alt of n.split(',')) {
      if (compoundMatches(alt.trim(), el)) return false;
    }
  }
  const ises = [...c.matchAll(/:is\(([^)]*)\)/gi)].map((m) => m[1])
    .concat([...c.matchAll(/:where\(([^)]*)\)/gi)].map((m) => m[1]));
  for (const group of ises) {
    const alts = group.split(',').map((x) => x.trim());
    if (!alts.some((a) => compoundMatches(a, el))) return false;
  }
  const nth = c.match(/:nth-child\(\s*(\d*)n\s*([+-]\s*\d+)?\s*\)/i);
  if (nth) {
    const a = nth[1] === '' ? 1 : Number(nth[1]);
    const b = nth[2] === undefined ? 0 : Number(nth[2].replace(/\s+/g, ''));
    const i = el.index;
    if (a === 0 ? i !== b : ((i - b) % a !== 0 || (i - b) / a < 0)) return false;
  }
  /* Pseudo-classes that describe a STATE the audit does not assert are taken
     as "not matching" rather than skipped. Ignoring them made every element
     match rules meant for something else - most damagingly `:root`, which
     pages use to declare the light palette, so a dark theme's --surface was
     silently replaced by #FFFFFF for every element on the page. */
  const structural = c.replace(/:not\([^)]*\)/gi, '').replace(/:is\([^)]*\)/gi, '').replace(/:where\([^)]*\)/gi, '');
  if (/:root\b/i.test(structural) && String(el.tag).toLowerCase() !== 'html') return false;
  if (/:first-child\b/i.test(structural) && el.index !== 1) return false;
  if (/:(last-child|only-child|only-of-type|first-of-type|last-of-type)\b/i.test(structural) && el.index !== 1) return false;
  if (/:(hover|focus|focus-visible|focus-within|active|visited|target|disabled|enabled|checked|indeterminate|required|optional|read-only|read-write|placeholder-shown|invalid|valid|in-range|out-of-range|empty|has|scope|defined|fullscreen|modal|popover-open|user-invalid|user-valid|autofill)\b/i.test(structural)) return false;
  /* :where() has zero specificity but matches exactly like :is(); it is folded
     into the is() handling above by treating it identically. */

  /* :is(a, .b) contributes the identifiers common to EVERY alternative */
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
  stripped = stripped.replace(/:is\([^)]*\)/gi, () => isesFlat[fi++])
    .replace(/:where\([^)]*\)/gi, ' ');
  stripped = stripped
    .replace(/:not\([^)]*\)/gi, '')
    .replace(/:nth-child\([^)]*\)/gi, '');

  const tagM = stripped.match(/^([a-z][a-z0-9-]*)/i);
  if (tagM && tagM[1].toLowerCase() !== String(el.tag).toLowerCase()) return false;
  const idM = stripped.match(/#([\w-]+)/);
  if (idM && idM[1] !== el.id) return false;
  for (const cls of (stripped.match(/\.([\w-]+)/g) || [])) {
    if (!el.classes.has(cls.slice(1))) return false;
  }
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
/* Right-to-left matching, which is how a browser does it: the subject must
   match first, then each compound to its left must match an ancestor (or the
   direct parent, for `>`). */
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

/* The rightmost compound decides most matches; its classes are a cheap
   necessary condition that turns a full scan into a short candidate list. */
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

/* ---------------- the stylesheets ------------------------------------- */
function parseSheets(files = CSS_ORDER) {
  const rules = [];
  let position = 0;
  for (const file of files) {
    const full = path.join(SRC, file);
    if (!fs.existsSync(full)) continue;
    /* Comments must go before parsing. A comment immediately above a rule was
       being absorbed into that rule's selector, so the selector no longer
       matched anything and the rule was invisible to the audit. */
    const css = fs.readFileSync(full, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
    let i = 0;
    while (i < css.length) {
      const open = css.indexOf('{', i);
      if (open === -1) break;
      let depth = 1, j = open + 1;
      while (j < css.length && depth > 0) {
        if (css[j] === '{') depth++;
        else if (css[j] === '}') depth--;
        j++;
      }
      const selectorText = css.slice(i, open).trim();
      const body = css.slice(open + 1, j - 1);
      const before = css.slice(Math.max(0, i - 400), i);
      const at = (before.match(/@(media|supports)[^{]*\{[^{}]*$/) || [null])[0];
      if (selectorText && !selectorText.startsWith('@') && selSafe(selectorText)) {
        for (const sel of splitTopLevelList(selectorText)) {
          rules.push({ file, sel: sel.trim(), body, position: position++, at: at || null });
        }
      }
      i = j;
    }
  }
  for (const r of rules) r.subject = subjectTokens(r.sel);
  buildIndex(rules);
  return rules;
}

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
/* Theme tokens are applied as INLINE STYLES on documentElement
   (root.style.setProperty in themes.js). An inline declaration outranks every
   stylesheet rule on that element, so `:root{--surface:#FFFFFF}` in styles.css
   does not beat a dark theme - the theme wins. The audit modelled only
   stylesheet declarations, so every dark theme was read as light and the
   metric card appeared to sit on #FAF9F8 instead of its real dark surface.
   A page's inline values are therefore injected at the <html> node, above any
   declaration the sheets make there, and the caches are keyed by page. */
let INLINE_VARS = {};
let PAGE = 0;
function setPage(vars) {
  INLINE_VARS = vars || {};
  PAGE++;
  CAND_CACHE.clear();
  if (typeof PROPS_CACHE !== 'undefined') PROPS_CACHE.clear();
  if (typeof ANALYSIS_CACHE !== 'undefined') ANALYSIS_CACHE.clear();
}

const CAND_CACHE = new Map();
function candidatesFor(el) {
  const sig = 'c' + PAGE + '|' + String(el.tag) + '|' + [...el.classes].sort().join('.') + '|' + el.id;
  const hit = CAND_CACHE.get(sig);
  if (hit) return hit;
  const out = computeCandidates(el);
  CAND_CACHE.set(sig, out);
  return out;
}
function computeCandidates(el) {
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

/* ---------------- the winner ----------------------------------------- */
const PROP_RE = {
  background: /(?:^|[;\s])background(?:-color)?:\s*([^;]+)/i,
  color: /(?:^|[;\s])color:\s*([^;]+)/i,
  border: /(?:^|[;\s])border(?:-color|-top|-bottom)?:\s*([^;]+)/i,
  shadow: /(?:^|[;\s])box-shadow:\s*([^;]+)/i,
};
function winnerFor(el, prop) {
  const re = PROP_RE[prop];
  if (!re) return null;
  const viable = [];
  for (const r of candidatesFor(el)) {
    const m = r.body.match(re);
    if (!m) continue;
    if (!selectorMatches(r.sel, el)) continue;
    viable.push({
      rule: r,
      declaration: m[0],
      value: m[1],
      important: /!important/i.test(m[1]) ? 1 : 0,
      spec: specificity(r.sel),
      order: r.position,
    });
  }
  viable.sort((a, b) => (b.important - a.important) || (b.spec - a.spec) || (b.order - a.order));
  return viable[0] || null;
}
/* The custom properties in effect on an element, nearest declaration winning.
   This used to be re-derived by walking the chain for every node, which was
   both O(n^2) and wrong: an element with no declaration of its own was handed
   the root's value as if it were local. Cached per element signature. */
let PROPS_CACHE = new Map();
function ownCustomProps(el) {
  const sig = 'o' + PAGE + '|' + String(el.tag) + '|' + [...el.classes].sort().join('.') + '|' + el.id;
  const hit = PROPS_CACHE.get(sig);
  if (hit) return hit;
  const merged = {};
  const nodes = [];
  for (let n = el; n; n = n.parent) nodes.push(n);
  nodes.reverse();                          // root first, so nearer wins
  for (const n of nodes) Object.assign(merged, declaredProps(n));
  PROPS_CACHE.set(sig, merged);
  return merged;
}

/* A span inside a card paints no background of its own: the colour its text
   sits on is the card's. Walk up until something opaque is found. */
function effectiveBackground(el, vars, surface) {
  let node = el;
  let painted = null;
  let alpha = 0;
  while (node && alpha < 1) {
    const w = winnerFor(node, 'background');
    if (w) {
      let c = firstBackground(w.value, Object.assign({}, vars, ownCustomProps(node)));
      if (c) {
        const a = typeof c === 'object' ? c.alpha : 1;
        const rgb = typeof c === 'object' ? c.rgb : c;
        painted = painted ? mixSrgb(rgb, painted, a) : rgb;
        alpha = alpha + a * (1 - alpha);
      }
      /* NOTE: effectiveBackground composites nearest-first, so the background
         colour it reports is the nearest *painted* layer - not necessarily
         what is visible. colourise() is the authoritative path because it
         composites root-down. */
    }
    node = node.parent;
  }
  if (painted && alpha >= 1) return painted;
  if (painted) return mixSrgb(painted, surface, alpha);
  return surface;
}

/* Which rules win is decided by the selector and the element's attributes,
   neither of which changes between themes; only the values behind var() do.
   The cascade is therefore analysed once per target and re-coloured per page. */
function analyse(chainSpec) {
  const el = makeElement(chainSpec);
  /* Walk root -> leaf so inherited custom properties can be accumulated once.
     The previous version asked ownCustomProps() for every node, and that
     function itself walks the whole chain - O(n^2) per analysis, which made a
     360-page sweep take eleven minutes. */
  const nodes = [];
  for (let n = el; n; n = n.parent) nodes.push(n);
  nodes.reverse();
  let inherited = {};
  const chain = [];
  for (const n of nodes) {
    const own = declaredProps(n);
    inherited = Object.assign({}, inherited, own);
    chain.unshift({
      el: n,
      bg: winnerFor(n, 'background'),
      fg: winnerFor(n, 'color'),
      props: inherited,
    });
  }
  return { el, chain };
}
/* The custom properties a rule declares on this element, by cascade order. */
function declaredProps(el) {
  const sig = 'p' + PAGE + '|' + String(el.tag) + '|' + [...el.classes].sort().join('.') + '|' + el.id;
  const hit = CAND_CACHE.get(sig);
  if (hit) return hit;
  const decls = [];
  for (const r of candidatesFor(el)) {
    if (!selectorMatches(r.sel, el)) continue;
    for (const m of r.body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+)/gi)) {
      decls.push({
        name: m[1], value: m[2].replace(/!important/i, '').trim(),
        important: /!important/i.test(m[2]) ? 1 : 0,
        spec: specificity(r.sel), order: r.position,
      });
    }
  }
  decls.sort((a, b) => (b.important - a.important) || (b.spec - a.spec) || (b.order - a.order));
  const out = {};
  for (const d of decls) if (out[d.name] === undefined) out[d.name] = d.value;
  /* Inline styles on <html> outrank its stylesheet declarations. */
  if (String(el.tag).toLowerCase() === 'html') Object.assign(out, INLINE_VARS);
  CAND_CACHE.set(sig, out);
  return out;
}
function colourise(a, themeVars) {
  const surface = themeVars['--surface'] || '#FFFFFF';
  const merges = (node) => Object.assign({}, themeVars, node.props);
  /* A translucent fill (rgba(0,0,0,.28) on a banner button, a 13% white pill)
     is not a colour on the page - it is a tint over whatever is behind it.
     Compositing it against --surface instead of the banner underneath gave
     #B8B8B8 where the browser shows near-black over a dark gradient, so a
     readable control was reported as failing. Walk from the root down,
     compositing each layer over the accumulated result. */
  const layers = [];
  for (const node of a.chain) {
    if (!node.bg) continue;
    const raw = node.bg.value;
    if (/transparent|none/i.test(raw)) continue;
    const c = firstBackground(raw, merges(node));
    if (!c) continue;
    const alpha = typeof c === 'object' ? c.alpha : 1;
    const rgb = typeof c === 'object' ? c.rgb : c;
    layers.push({ rgb, alpha, rule: node.bg.rule });
  }
  layers.reverse();                       // farthest first
  let bgFound = null;
  let accum = null;
  for (const l of layers) {
    if (accum === null) {
      accum = l.alpha >= 1 ? l.rgb : mixSrgb(l.rgb, surface, l.alpha);
    } else {
      accum = l.alpha >= 1 ? l.rgb : mixSrgb(l.rgb, accum, l.alpha);
    }
    if (!bgFound && l.alpha > 0.02) bgFound = { rule: l.rule };
  }
  const bg = accum || surface;
  if (!bgFound) bgFound = { rule: { file: 'page', sel: '(surface)' } };
  let fgFound = null;
  for (const node of a.chain) {
    if (fgFound || !node.fg) continue;
    const raw = node.fg.value;
    if (/inherit/i.test(raw)) continue;
    let c = resolveColour(raw, merges(node));
    if (c && typeof c === 'object') c = c.rgb;
    if (c) fgFound = { hex: c, rule: node.fg.rule };
  }
  if (!bg || !fgFound) return null;
  return {
    bg, fg: fgFound.hex,
    bgFrom: (bgFound && bgFound.rule) || { file: 'page', sel: '(surface)' },
    fgFrom: fgFound.rule,
    ratio: contrast(bg, fgFound.hex),
  };
}

module.exports = {
  CSS_ORDER, SRC, REPO,
  resolveColour, firstBackground, contrast, mixSrgb, hex2rgb, lum,
  splitTopLevel, splitTopLevelList, selSafe, specificity,
  makeElement, compoundMatches, parseSelector, selectorMatches, subjectTokens,
  parseSheets, candidatesFor, winnerFor, ownCustomProps,
  effectiveBackground, analyse, colourise, declaredProps, setPage,
};
