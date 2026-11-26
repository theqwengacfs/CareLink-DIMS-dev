/* ============================================================================
   ink_pad.js — the stylus pad itself: a real canvas, real pointer events, and a
   record that cannot overstate what was drawn.

   `ink.js` decides what a mark *is*. This file only collects the mark and keeps
   it where a save can read it. Two rules it enforces so that a signature cannot
   quietly become something it is not:

     1. A pad has to be *pressed* to count. `record()` returns `null` for an
        untouched pad, so a form can leave the field absent rather than storing an
        empty signature that later reads as "unsigned but present".
     2. Nothing here sets `verified`. Verification is a separate, named act by a
        second person; the pad only says how the ink was made and when.

   The stroke store is module state keyed by pad id, not DOM state, because the
   console re-renders its whole shell after most actions and a canvas would
   otherwise be wiped mid-signature.
   ============================================================================ */
const INK_PAD = (() => {
  const pads = {};   /* id -> pad (see INK) */
  const live = {};   /* id -> { drawing, points, rect, drawn } */

  function padFor(id) {
    if (!pads[id]) pads[id] = INK.empty();
    return pads[id];
  }

  function reset(id) { pads[id] = INK.empty(); delete live[id]; }

  /* The markup. A real <canvas> is used when the browser has one; when it does
     not (the test DOM, or an old kiosk) the control degrades to the typed-name box
     below it rather than presenting a pad that cannot record anything. */
  function field(id, opts = {}) {
    const pad = padFor(id);
    const hasCanvas = typeof document !== 'undefined' && typeof document.createElement === 'function';
    const name = opts.name || id;
    return `<div class="ink-field" data-ink="${escapeAttr(id)}">
      <label>${escapeAttr(opts.label || 'Signature')}</label>
      <div class="ink-wrap" role="application" aria-label="${escapeAttr((opts.label || 'Signature') + ' pad. ' + INK.help())}">
        ${hasCanvas ? `<canvas id="${escapeAttr(id)}" class="ink-canvas" width="600" height="180"
          data-act="ink-draw" data-ink-id="${escapeAttr(id)}" tabindex="0" aria-label="${escapeAttr(opts.label || 'Signature pad')}"></canvas>` : ''}
        <div class="ink-empty" data-ink-empty="${escapeAttr(id)}">${ic_draw('pen', 18)}<span>Sign here with the stylus</span></div>
      </div>
      <div class="ink-tools">
        <button type="button" class="btn btn-xs btn-ghost" data-act="ink-clear" data-ink-id="${escapeAttr(id)}">${ic_draw('x', 12)} Clear</button>
        <span class="xs" data-ink-method="${escapeAttr(id)}">${escapeAttr(INK.describeMethod(pad))}</span>
        <span class="xs" data-ink-count="${escapeAttr(id)}">${INK.pointCount(pad)} points</span>
      </div>
      <div class="ink-typed">
        <label class="xs" for="${escapeAttr(id)}-typed">Or record a typed name (saved as typed, not as a signature)</label>
        <input class="input" id="${escapeAttr(id)}-typed" name="${escapeAttr(name)}Typed" autocomplete="off"
          placeholder="e.g. typed by the clinician on the paper form" data-ink-typed="${escapeAttr(id)}">
      </div>
      ${opts.hint ? `<div class="xs muted">${escapeAttr(opts.hint)}</div>` : ''}
      <input type="hidden" name="${escapeAttr(name)}" data-ink-record="${escapeAttr(id)}" value="">
    </div>`;
  }

  function ic_draw(name, size) {
    try { return ic(name, size); } catch (_e) { return ''; }
  }
  function escapeAttr(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* Points arrive in CSS pixels relative to the canvas; they are normalised to the
     canvas's own coordinate system so a phone and a desktop store comparable ink. */
  function toCanvasSpace(ev, canvas) {
    const rect = (canvas && canvas.getBoundingClientRect) ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: 600, height: 180 };
    const sx = (canvas && canvas.width ? canvas.width : 600) / (rect.width || 600);
    const sy = (canvas && canvas.height ? canvas.height : 180) / (rect.height || 180);
    const x = (Number(ev.clientX || 0) - (rect.left || 0)) * sx;
    const y = (Number(ev.clientY || 0) - (rect.top || 0)) * sy;
    const pressure = ev.pressure !== undefined ? Number(ev.pressure) : (ev.force !== undefined ? Number(ev.force) : 0.5);
    return [x, y, Number.isFinite(pressure) && pressure > 0 ? pressure : 0.5];
  }

  /* Begin a stroke. Returns false when the event carries no position, which is
     how a keyboard "press" on the pad is ignored. */
  function down(id, ev, canvas) {
    const st = live[id] = { drawing: true, points: [toCanvasSpace(ev, canvas)], kind: INK.kindOf(ev) };
    const pad = padFor(id);
    pads[id] = { ...pad, startedAt: pad.startedAt || new Date().toISOString() };
    return true;
  }

  function move(id, ev, canvas) {
    const st = live[id];
    if (!st || !st.drawing) return false;
    st.points.push(toCanvasSpace(ev, canvas));
    return true;
  }

  function up(id, ev, canvas) {
    const st = live[id];
    if (!st || !st.drawing) return false;
    if (ev && ev.clientX !== undefined) st.points.push(toCanvasSpace(ev, canvas));
    st.drawing = false;
    const canvasEl = canvas || (typeof document !== 'undefined' && document.getElementById ? document.getElementById(id) : null);
    pads[id] = INK.addStroke(pads[id], st.points, {
      kind: st.kind,
      at: new Date().toISOString(),
      width: canvasEl ? canvasEl.width : 600,
      height: canvasEl ? canvasEl.height : 180,
    });
    delete live[id];
    repaint(id, canvasEl);
    return true;
  }

  /* Redraw from the stroke store, so a cleared or restored pad always matches the
     data rather than the pixels left on the canvas. */
  function repaint(id, canvasEl) {
    const canvas = canvasEl || (typeof document !== 'undefined' && document.getElementById ? document.getElementById(id) : null);
    if (!canvas || typeof canvas.getContext !== 'function') return;
    let g = null;
    try { g = canvas.getContext('2d'); } catch (_e) { g = null; }
    if (!g) return;
    g.clearRect(0, 0, canvas.width, canvas.height);
    const pad = padFor(id);
    g.lineWidth = 2.2;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = '#162F59';
    for (const stroke of pad.strokes || []) {
      if (!stroke.length) continue;
      g.beginPath();
      g.moveTo(stroke[0][0], stroke[0][1]);
      for (let i = 1; i < stroke.length; i++) g.lineTo(stroke[i][0], stroke[i][1]);
      g.stroke();
    }
  }

  function isEmpty(id) { return INK.isEmpty(pads[id]); }
  function points(id) { return INK.pointCount(pads[id]); }
  function method(id) { return INK.methodOf(pads[id]); }

  /* What a save stores. `null` means "nothing was drawn": callers must then omit
     the signature rather than write an empty one. */
  function record(id, meta = {}) {
    const pad = pads[id];
    const typedEl = (typeof document !== 'undefined' && document.getElementById) ? document.getElementById(id + '-typed') : null;
    const typed = typedEl && typedEl.value ? String(typedEl.value).trim() : '';
    if (!INK.isEmpty(pad)) {
      const rec = INK.toRecord(pad, meta);
      return rec;
    }
    if (typed) return INK.typedRecord(typed, meta);
    return null;
  }

  /* A one-line statement a printed document can carry. */
  function caption(id, record) {
    const rec = record || null;
    if (!rec) return INK.METHOD_LABEL.none;
    return INK.caption(rec);
  }

  function svg(id, opts) { return INK.svg(pads[id], opts); }

  return { field, down, move, up, repaint, reset, isEmpty, points, method, record, caption, svg, padFor, toCanvasSpace };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = INK_PAD;
