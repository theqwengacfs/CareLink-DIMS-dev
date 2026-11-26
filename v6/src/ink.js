/* ============================================================================
   ink.js — handwriting and signature capture, with an honest audit trail.

   The Foundation asked for stylus handwriting (D19) on a tablet, and separately
   said in the same set of prompts that a typed name must never be presented as a
   verified signature. Both are honoured here:

     * The pad records *strokes* — where the pen went, how hard it pressed, when,
       and on which device — not a picture. Strokes are what make ink comparable
       later; a PNG is evidence of a shape but not of how it was made.
     * What is stored is described for what it is. `method` says `stylus`, `touch`
       or `pointer`, and `verification` stays `unverified` unless a second person
       has actually checked it. Nothing in this module ever writes `verified`.
     * A typed name is a `typed` capture with no stroke data at all, and the
       generated record says so in words the printed document also carries.

   The module is pure: it takes strokes in, it returns a record. Storage and
   rendering live in the calling view so this stays testable without a canvas.
   ============================================================================ */
const INK = (() => {
  const FORMAT = 'carelink-ink-v1';
  /* Enough points to keep a signature recognisable, few enough that a full
     printed name still fits inside a patient record. Points closer than this are
     dropped as pen jitter, which also keeps a shaky hand from inflating the size. */
  const MIN_STEP_PX = 1.2;
  const MAX_POINTS_PER_STROKE = 900;
  const MAX_STROKES = 220;

  function kindOf(event) {
    const t = String((event && event.pointerType) || '').toLowerCase();
    if (t === 'pen' || t === 'stylus') return 'stylus';
    if (t === 'touch') return 'touch';
    return 'pointer';
  }

  /* A stroke is an array of [x, y, pressure] triples, rounded so the stored
     record is small and stable between devices. */
  function thin(points) {
    const out = [];
    let last = null;
    for (const p of points) {
      const [x, y, pr] = p;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (last && Math.hypot(x - last[0], y - last[1]) < MIN_STEP_PX) continue;
      const point = [Math.round(x * 2) / 2, Math.round(y * 2) / 2, Math.round((Number.isFinite(pr) ? pr : 0.5) * 100) / 100];
      out.push(point);
      last = point;
      if (out.length >= MAX_POINTS_PER_STROKE) break;
    }
    return out;
  }

  function empty() {
    return { format: FORMAT, strokes: [], width: 0, height: 0, kinds: [], startedAt: null, endedAt: null };
  }

  /* Add one completed stroke. Returns a new pad so a re-render cannot mutate the
     array that a save is reading. */
  function addStroke(pad, points, meta = {}) {
    const base = pad && Array.isArray(pad.strokes) ? pad : empty();
    const stroke = thin(points);
    if (!stroke.length) return base;
    const strokes = base.strokes.length >= MAX_STROKES ? base.strokes.slice(1).concat([stroke]) : base.strokes.concat([stroke]);
    const kinds = Array.from(new Set((base.kinds || []).concat([meta.kind || 'pointer'])));
    return {
      ...base,
      strokes,
      kinds,
      width: Math.max(base.width || 0, Math.ceil(meta.width || 0)),
      height: Math.max(base.height || 0, Math.ceil(meta.height || 0)),
      startedAt: base.startedAt || meta.at || null,
      endedAt: meta.at || base.endedAt,
    };
  }

  function clear(pad) { return empty(); }

  function isEmpty(pad) { return !pad || !Array.isArray(pad.strokes) || pad.strokes.length === 0; }

  function pointCount(pad) {
    return isEmpty(pad) ? 0 : pad.strokes.reduce((n, s) => n + s.length, 0);
  }

  /* How the mark was actually made. A single stylus stroke is a pen signature; a
     finger is a touch signature; a mouse is neither and is labelled as a pointer,
     which the printed document keeps visible. */
  function methodOf(pad) {
    if (isEmpty(pad)) return 'none';
    const kinds = pad.kinds || [];
    if (kinds.length === 1 && kinds[0] === 'stylus') return 'stylus';
    if (kinds.length === 1 && kinds[0] === 'touch') return 'touch';
    if (kinds.includes('stylus')) return 'mixed';
    return 'pointer';
  }

  const METHOD_LABEL = {
    none: 'No mark',
    stylus: 'Handwritten with a stylus',
    touch: 'Handwritten by finger on a touch screen',
    pointer: 'Drawn with a mouse or trackpad',
    mixed: 'Handwritten, mixed pen and touch input',
    typed: 'Typed name — not a signature',
  };

  function describeMethod(pad) {
    if (typeof pad === 'string') return METHOD_LABEL[pad] || METHOD_LABEL.none;
    return METHOD_LABEL[methodOf(pad)] || METHOD_LABEL.none;
  }

  /* Turn a pad into the record the database holds. `method` is derived, never
     guessed, and `verification` is always `unverified` — only the clinical review
     step may change what a document claims about a signature. */
  function toRecord(pad, meta = {}) {
    const method = meta.typed ? 'typed' : methodOf(pad);
    return {
      format: FORMAT,
      method,
      label: METHOD_LABEL[method],
      verification: 'unverified',
      points: pointCount(pad),
      strokes: isEmpty(pad) ? 0 : pad.strokes.length,
      width: pad ? pad.width || 0 : 0,
      height: pad ? pad.height || 0 : 0,
      device: String(meta.device || '').slice(0, 120),
      capturedAt: meta.at || new Date().toISOString(),
      capturedBy: String(meta.by || '').slice(0, 120),
      role: String(meta.role || '').slice(0, 120),
      /* Kept only when the person supplying it asked for it to be kept, so the
         record holds what was signed and why, not a copy of the whole screen. */
      purpose: String(meta.purpose || '').slice(0, 200),
      ink: isEmpty(pad) ? null : { width: pad.width || 0, height: pad.height || 0, strokes: pad.strokes },
    };
  }

  /* A typed name is a legitimate way to record that a paper form was signed, but
     it is not a signature and the record must not look like one. */
  function typedRecord(name, meta = {}) {
    const note = meta.purpose ? `${meta.purpose} · name as written: ${String(name || '').slice(0, 120)}`
      : `name as written: ${String(name || '').slice(0, 120)}`;
    return toRecord(empty(), { ...meta, typed: true, purpose: note });
  }

  /* What the printed document says. This string is the only place a reader learns
     whether the ink was a pen or a finger, so it never softens the distinction. */
  function caption(record) {
    if (!record || !record.method) return METHOD_LABEL.none;
    const base = METHOD_LABEL[record.method] || record.method;
    const verified = record.verification === 'verified';
    return `${base}${record.points ? ` · ${record.points} pen points` : ''} · ${verified ? 'verified by a named reviewer' : 'not independently verified'}`;
  }

  /* SVG path for a stroke, so a signature can be printed without a raster image
     and without relying on a canvas the printer may not lay out. */
  function pathData(stroke) {
    if (!Array.isArray(stroke) || !stroke.length) return '';
    return stroke.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]} ${p[1]}`).join(' ');
  }
  function svg(pad, opts = {}) {
    if (isEmpty(pad)) return '';
    const w = pad.width || opts.width || 300;
    const h = pad.height || opts.height || 120;
    const paths = pad.strokes.map(s => `<path d="${pathData(s)}" fill="none" stroke="${opts.stroke || '#162F59'}" stroke-width="${opts.sw || 2}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${opts.height || 90}" role="img" aria-label="${escapeAttr(opts.label || 'Signature')}" preserveAspectRatio="xMidYMid meet">${paths}</svg>`;
  }
  function escapeAttr(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  /* Guidance for the person holding the stylus. Kept short and in the pad itself
     so it cannot drift away from the control it describes. */
  function help() {
    return 'Sign in the box with the stylus (or a finger). A typed name is recorded as a typed name, not as a signature.';
  }

  return { FORMAT, METHOD_LABEL, kindOf, addStroke, clear, isEmpty, pointCount, methodOf, describeMethod,
    toRecord, typedRecord, caption, pathData, svg, help, thin, empty };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = INK;
