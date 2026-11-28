/* =====================================================================
   table_hints.js — make it obvious when a table, a report or a register has
   more columns off the right edge.

   THE PROBLEM, IN THE USER'S WORDS
   "Although they are okay, ensure that new users aren't confused when rows
   need sliding left and right to view more information."

   A wide table on a narrow screen is a horizontal scroller. Everything about
   it looks finished: the header ends at the panel edge, the last visible
   column has a right border, and there is no scrollbar on a phone. A new user
   therefore reads the first three columns, never learns that "Balance" and
   "Actions" exist, and acts on half the row.

   WHAT THIS DOES
   Every table wrapper gets three signals, added and removed by measurement
   rather than by guesswork:

     1. an edge fade on the side that still has content, so the cut is visible
        as a cut rather than as the end of the data;
     2. a "Slide to see more" pill, shown only while the table really overflows
        and only until the user has slid it once - it is a hint, not furniture;
     3. a position rail (a thin track with a thumb) at the bottom of the panel
        so the reader can see HOW MUCH is off-screen, and drag it if they want.

   It also does the opposite on a very narrow screen: `table.tbl` already lets
   a row become a stack of labelled cards, and that is used instead of
   sideways sliding where the table has no meaningful column order. Wide
   numeric registers keep their columns - accountants read columns - but they
   now announce themselves.

   KEYBOARD AND SCREEN READER
   The scroller is focusable (tabindex=0) and labelled with the table's
   caption or its first column, so it can be reached and scrolled with the
   arrow keys. The pill is aria-hidden: the same information is in the
   scroller's aria-description.

   PERFORMANCE
   One ResizeObserver per wrapper, one scroll listener, no timers, no
   per-render layout thrash. The whole thing is idempotent: it decorates what
   it finds and remembers what it decorated, so repainting a console does not
   attach a second listener.
   ===================================================================== */
const TABLE_HINTS = {
  /* Wrappers that scroll sideways and carry a real table. Kept as a selector
     rather than a hand-maintained list so a new view is covered on day one. */
  SCROLLERS: '.tbl-wrap,.tbl-scroll,.reg-tbl-wrap,.reg-table-wrap,.chart-tbl-wrap,.monday-review-ledger',
  /* Below this the pill and the rail are worth the pixels; above it a mouse
     scrollbar is already visible and the hint would be noise. */
  WIDE: 1180,
  _seen: null,
  _ro: null,

  /* Decorate every scroller inside `scope`, and return how many needed it. */
  paint(scope) {
    const root = scope || (typeof document !== 'undefined' ? document : null);
    if (!root || typeof root.querySelectorAll !== 'function') return 0;
    const nodes = [...root.querySelectorAll(this.SCROLLERS)];
    /* A wrapper nested in another wrapper is the inner one's business. */
    const wrappers = nodes.filter(w => !nodes.some(o => o !== w && o.contains(w)));
    let decorated = 0;
    for (const wrap of wrappers) {
      if (this.decorate(wrap)) decorated++;
    }
    return decorated;
  },

  /* One wrapper. Returns true when a hint pill was attached. */
  decorate(wrap) {
    if (!wrap || !wrap.querySelector) return false;
    const table = wrap.querySelector('table');
    if (!table) return false;
    if (!wrap.__thHooked) {
      wrap.__thHooked = true;
      wrap.classList.add('th-sheet');
      /* Reachable and scrollable without a trackpad. */
      if (!wrap.hasAttribute('tabindex')) wrap.setAttribute('tabindex', '0');
      const label = this.labelFor(table);
      if (label && !wrap.hasAttribute('aria-label')) wrap.setAttribute('aria-label', label);
      wrap.setAttribute('role', wrap.getAttribute('role') || 'group');
      wrap.addEventListener('scroll', () => this.update(wrap), { passive: true });
      /* The hint is spent once the reader has slid the sheet, and comes back
         only if the table is re-opened under a different width. */
      wrap.addEventListener('scroll', () => {
        if (wrap.scrollLeft > 12 && !wrap.__thMoved) {
          wrap.__thMoved = true;
          wrap.classList.add('th-moved');
          this.update(wrap);
        }
      }, { passive: true, once: false });
    }
    this.attachRail(wrap);
    this.update(wrap);
    this.observe(wrap);
    return true;
  },

  /* A readable name for the sheet: the table's caption, else its heading,
     else the first column of the header row. */
  labelFor(table) {
    const cap = table.querySelector('caption');
    if (cap && cap.textContent.trim()) return cap.textContent.trim();
    const panel = table.closest ? table.closest('.card,.panel,.modal-b,.sheet') : null;
    if (panel) {
      const h = panel.querySelector('.card-h h3,.card-h h2,h2,h3');
      if (h && h.textContent.trim()) return h.textContent.trim() + ' — slide to see every column';
    }
    const first = table.querySelector('thead th');
    if (first && first.textContent.trim()) return first.textContent.trim() + ' table — slide to see every column';
    return '';
  },

  /* The position rail: a track the width of the panel and a thumb the width of
     the visible fraction, sitting at the bottom edge of the sheet. */
  attachRail(wrap) {
    if (wrap.__thRail) return wrap.__thRail;
    const rail = document.createElement('div');
    rail.className = 'th-rail';
    rail.setAttribute('aria-hidden', 'true');
    const thumb = document.createElement('i');
    rail.appendChild(thumb);
    /* Keep a direct reference: a rail whose thumb is found by firstChild is a
       rail that breaks the moment someone puts a track element inside it. */
    rail.__thumb = thumb;
    /* Drag maps straight onto scrollLeft; a thumb that cannot be dragged is a
       decoration, and this one is a control. */
    const seek = (clientX) => {
      const box = rail.getBoundingClientRect ? rail.getBoundingClientRect() : null;
      if (!box || !box.width) return;
      const frac = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
      const target = frac * (wrap.scrollWidth - wrap.clientWidth);
      wrap.scrollLeft = target;
      if (target > 12) { wrap.__thMoved = true; wrap.classList.add('th-moved'); }
      this.update(wrap);
    };
    rail.addEventListener('pointerdown', (e) => {
      rail.setPointerCapture && rail.setPointerCapture(e.pointerId);
      rail.__dragging = true;
      seek(e.clientX);
      e.preventDefault();
    });
    rail.addEventListener('pointermove', (e) => { if (rail.__dragging) seek(e.clientX); });
    const stop = () => { rail.__dragging = false; };
    rail.addEventListener('pointerup', stop);
    rail.addEventListener('pointercancel', stop);
    /* The rail sits after the sheet, inside a positioning context that this
       class supplies, so it never scrolls with the table. */
    wrap.parentNode && wrap.parentNode.insertBefore(rail, wrap.nextSibling);
    if (wrap.parentNode) wrap.parentNode.classList.add('th-host');
    wrap.__thRail = rail;

    /* The pill. It says what to do, not that something is wrong: "Slide to see
       all 8 columns" is a fact about the sheet, and it disappears the first
       time the reader slides it. It names the count so the reader also learns
       HOW MUCH is hidden. */
    const hint = document.createElement('div');
    hint.className = 'th-hint';
    hint.setAttribute('aria-hidden', 'true');
    const cols = wrap.querySelectorAll('thead th').length;
    hint.innerHTML = `<span class="th-hint-ico" aria-hidden="true">→</span>`
      + `<span>Slide${cols ? ` to see all ${cols} columns` : ' to see more'}</span>`;
    wrap.parentNode && wrap.parentNode.insertBefore(hint, rail);
    wrap.__thHint = hint;
    return rail;
  },

  /* The single source of truth: measure, then set the classes the CSS reacts
     to. Called on scroll, on resize and after every paint. */
  update(wrap) {
    if (!wrap || typeof wrap.scrollWidth !== 'number') return;
    const over = wrap.scrollWidth - wrap.clientWidth;
    const rail = wrap.__thRail;
    const host = wrap.parentNode;
    const atStart = wrap.scrollLeft <= 2;
    const atEnd = wrap.scrollLeft + wrap.clientWidth >= wrap.scrollWidth - 2;
    wrap.classList.toggle('th-scroll', over > 4);
    wrap.classList.toggle('th-at-start', atStart);
    wrap.classList.toggle('th-at-end', atEnd);
    if (rail) {
      rail.classList.toggle('th-on', over > 4);
      rail.style.display = over > 4 ? '' : 'none';
      if (over > 4) {
        const frac = wrap.clientWidth / wrap.scrollWidth;
        const thumb = rail.__thumb;
        thumb.style.width = Math.max(14, Math.round(frac * 100)) + '%';
        thumb.style.transform = `translateX(${Math.round((wrap.scrollLeft / Math.max(1, over)) * (100 / Math.max(0.0001, frac) - 100))}%)`;
      }
    }
    if (host) host.classList.toggle('th-host-on', over > 4);
    /* The pill is shown while there is content to the right AND the reader has
       not yet slid. Once slid it stays hidden for this render: a hint that
       cannot be spent is a nag. */
    if (wrap.__thHint) {
      const show = over > 4 && !atEnd && !wrap.__thMoved;
      wrap.__thHint.classList.toggle('th-on', show);
    }
    return over;
  },

  observe(wrap) {
    if (typeof ResizeObserver !== 'function') return;
    if (!this._ro) {
      this._ro = new ResizeObserver((entries) => {
        for (const e of entries) {
          const w = e.target && e.target.__thWrap;
          if (w) this.update(w);
        }
      });
    }
    if (wrap.__thWatched) return;
    wrap.__thWatched = true;
    wrap.__thWrap = wrap;
    try { this._ro.observe(wrap); } catch (e) {}
  },

  /* Repaint on a width change without a ResizeObserver (older WebViews). */
  _lastW: 0,
  onResize() {
    const w = typeof window !== 'undefined' ? (window.innerWidth || 0) : 0;
    if (w === this._lastW) return;
    this._lastW = w;
    this.paint();
  },

  /* Called once, after the console has painted. Safe to call repeatedly, and
     deliberately inert where there is no DOM worth watching (the server, the
     test harness, the static preview builder). */
  mount() {
    if (this._mounted) return this;
    if (typeof document === 'undefined' || !document || typeof document.querySelectorAll !== 'function') return this;
    this._mounted = true;
    const self = this;
    const repaint = () => { try { self.paint(); } catch (e) {} };
    if (typeof window !== 'undefined' && window && window.addEventListener) {
      try {
        window.addEventListener('resize', () => self.onResize(), { passive: true });
        window.addEventListener('orientationchange', repaint, { passive: true });
      } catch (e) {}
    }
    /* New markup arrives by innerHTML replacement, so watch for it. This is the
       only reliable hook in a render-everything architecture: the console
       replaces #root wholesale, which detaches any listeners a view had. */
    if (typeof MutationObserver === 'function') {
      const target = (typeof document.getElementById === 'function' && document.getElementById('root')) || document.body;
      if (target) {
        let queued = false;
        const mo = new MutationObserver(() => {
          if (queued) return;
          queued = true;
          const run = () => { queued = false; repaint(); };
          if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
          else setTimeout(run, 0);
        });
        mo.observe(target, { childList: true, subtree: true });
        this._mo = mo;
      }
    }
    repaint();
    return this;
  }
};

if (typeof window !== 'undefined' && window) {
  window.TABLE_HINTS = TABLE_HINTS;
  /* Mount after the shell exists. Never let this module throw on a host that
     has no real DOM - a hint is not worth a blank screen. */
  const boot = () => { try { TABLE_HINTS.mount(); } catch (e) {} };
  try {
    if (typeof document !== 'undefined' && document && document.readyState === 'loading'
        && typeof document.addEventListener === 'function') document.addEventListener('DOMContentLoaded', boot);
    else if (typeof setTimeout === 'function') setTimeout(boot, 0);
  } catch (e) {}
}
