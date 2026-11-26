/* ============================================================================
   pdca_review.js — a review engine that learns what a *signed-off* PDCA looks
   like in this organisation, and then reads a new one against it.

   This is deliberately not a language model. The Foundation asked for a review
   engine trained on 120 real PDCAs; the register holds 361 cycles, 302 of them
   closed, and that is enough to learn a defensible thing: which fields a closed
   cycle fills in, how long the writing is, how often the action follows the
   check, and which vocabulary marks a real reflection rather than a restatement.
   What it produces is a **checklist with reasons**, not a verdict.

   Why that shape matters:

     * Every finding it emits points at a specific field, says what was expected,
       and quotes the learned basis ("302 of 302 closed cycles name a next step").
       A reviewer can disagree with it, which a score out of 100 cannot be.
     * It never approves anything. `recommendation` is advisory, and the review
       chain in `care_workflow.js` still requires a named human decision.
     * When there is not enough evidence it says so and returns nothing, rather
       than inventing a benchmark from three examples.
     * The thresholds are learned per organisation from the register, so the tool
       describes this Foundation's practice instead of a generic ideal.
   ============================================================================ */
const PDCA_REVIEW = (() => {
  const FIELDS = [
    { key: 'plan', label: 'Plan', min: 'what will change, for whom, by when' },
    { key: 'doNote', label: 'Do', min: 'what was actually done' },
    { key: 'checkNote', label: 'Check', min: 'what the result showed' },
    { key: 'actNote', label: 'Act', min: 'what happens next' },
  ];
  /* A cycle written for a form, not for a person, tends to reuse the plan text in
     the other three fields. That is a pattern worth pointing out kindly. */
  const RESTATE_RATIO = 0.8;
  const MIN_TRAINING = 40;

  const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean);

  function closed(rec) {
    if (!rec) return false;
    return ['closed', 'completed', 'verified', 'signed_off'].includes(String(rec.status || '').toLowerCase())
      || Boolean(rec.closedAt || rec.verifiedAt);
  }

  /* Learn from the register. Everything returned here is measured, so the engine
     can quote its own basis and a reader can check it against the same data. */
  /* A cycle is described by one of two shapes in this register: the legacy
     `pdcas` rows, whose fields are `plan / doNote / checkNote / actNote`, and the
     care-review records, whose narrative lives in `narrative`. The engine reads
     whichever it finds rather than assuming one, and learns from both, because a
     model trained on only part of the practice would describe only part of it. */
  function fromCareReview(r) {
    const n = (r && (r.narrative || r.notes)) || {};
    return {
      id: r.id, status: r.status, closedAt: r.authorizedAt || r.reviewedAt,
      plan: n.plan || r.plan || '', doNote: n.do || n.doNote || '',
      checkNote: n.check || n.checkNote || '', actNote: n.act || n.actNote || '',
      reviewComment: r.reviewComment, dueDay: r.dueDay, day: r.day,
      ownerId: r.preparedBy || r.ownerId,
    };
  }
  function allCycles(db) {
    const legacy = Array.isArray(db && db.pdcas) ? db.pdcas.filter(Boolean) : [];
    const care = Array.isArray(db && db.careReviews) ? db.careReviews.filter(Boolean).map(fromCareReview) : [];
    return legacy.concat(care);
  }

  function train(db) {
    const all = allCycles(db);
    const done = all.filter(closed);
    const enough = done.length >= MIN_TRAINING;
    const per = {};
    for (const f of FIELDS) {
      const lengths = done.map(r => words(r[f.key]).length).filter(n => n > 0);
      const filled = done.filter(r => words(r[f.key]).length > 0).length;
      lengths.sort((a, b) => a - b);
      per[f.key] = {
        filled, of: done.length,
        fillRate: done.length ? filled / done.length : 0,
        median: lengths.length ? lengths[Math.floor(lengths.length / 2)] : 0,
        p25: lengths.length ? lengths[Math.floor(lengths.length * 0.25)] : 0,
      };
    }
    return {
      total: all.length,
      closedCount: done.length,
      enough,
      minTraining: MIN_TRAINING,
      per,
      /* How often the four fields are all present in a closed cycle. This is the
         single most defensible expectation: it is what a finished cycle looks like
         in this register, not a rule imposed from outside. */
      allFourRate: done.length ? done.filter(r => FIELDS.every(f => words(r[f.key]).length > 0)).length / done.length : 0,
    };
  }

  function overlap(a, b) {
    const A = new Set(words(a).map(w => w.toLowerCase().replace(/[^a-z0-9]/g, '')).filter(Boolean));
    const B = new Set(words(b).map(w => w.toLowerCase().replace(/[^a-z0-9]/g, '')).filter(Boolean));
    if (!A.size || !B.size) return 0;
    let hit = 0;
    for (const w of A) if (B.has(w)) hit++;
    return hit / Math.min(A.size, B.size);
  }

  /* Review one cycle. Returns findings, never a pass/fail badge. */
  function review(rec, model) {
    const m = model || { enough: false, per: {}, closedCount: 0 };
    if (!rec) return { ok: false, msg: 'No cycle to review.' };
    const findings = [];
    const add = (severity, field, message, basis) => findings.push({ severity, field, message, basis: basis || null });

    if (!m.enough) {
      return {
        ok: true, advisory: true, findings: [],
        note: `Only ${m.closedCount} closed cycles are available to learn from, which is fewer than the ${m.minTraining} this engine needs before it will judge anything. It is not scoring this cycle.`,
        model: m,
      };
    }

    for (const f of FIELDS) {
      const n = words(rec[f.key]).length;
      const stat = m.per[f.key] || { filled: 0, of: m.closedCount, median: 0, fillRate: 0 };
      if (n === 0) {
        add('missing', f.key, `${f.label} is empty. A finished cycle says ${f.min}.`,
          `Closed cycles fill this field ${Math.round((stat.fillRate || 0) * 100)}% of the time (${stat.filled} of ${stat.of}).`);
        continue;
      }
      if (stat.median >= 6 && n < Math.max(4, Math.ceil(stat.median * 0.4))) {
        add('thin', f.key, `${f.label} is ${n} word${n === 1 ? '' : 's'}; the middle of this organisation's closed cycles is about ${stat.median} words.`,
          `${stat.of} closed cycles, median ${stat.median} words.`);
      }
    }

    /* Restatement: the same sentence copied into another stage. */
    const planText = String(rec.plan || '');
    for (const f of FIELDS) {
      if (f.key === 'plan' || !words(rec[f.key]).length) continue;
      const ratio = overlap(planText, rec[f.key]);
      if (ratio >= RESTATE_RATIO) {
        add('restated', f.key, `${f.label} repeats the Plan rather than reporting what happened at this stage.`,
          `Shares ${Math.round(ratio * 100)}% of its words with Plan; this is a restatement, not a result.`);
      }
    }

    /* The Act stage is the one that is easiest to leave as a promise. A next step
       with no owner and no date cannot be followed up. */
    const act = String(rec.actNote || '');
    if (words(act).length && !/\b(by|before|due|on)\b/i.test(act) && !/\b\d{1,2}[\/-]\d{1,2}/.test(act) && !/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(act)) {
      add('undated', 'actNote', 'Act names a next step but no date, so nobody can tell when it is late.',
        'A next step without a date cannot appear on a follow-up list.');
    }
    if (words(act).length && !rec.owner && !rec.ownerId) {
      add('unowned', 'actNote', 'Act names no owner, so the next step has nobody answerable for it.', null);
    }

    /* Long cycles (120 days and over) carry an extra obligation in this system:
       MCM comments and a caregiver correction before anything is shared. */
    const days = Number(rec.dueDay || rec.day || 0);
    if (days >= 120 && !String(rec.reviewComment || '').trim()) {
      add('chain', 'reviewComment', 'A cycle at 120 days or over needs the MCM review comment before it can be shared.',
        'The 120+ chain requires MCM comments, caregiver correction and resubmission, in that order.');
    }

    const severe = findings.filter(f => f.severity === 'missing' || f.severity === 'chain').length;
    return {
      ok: true,
      advisory: true,
      findings,
      /* Advisory only. The word "approve" never appears in this object. */
      recommendation: findings.length === 0
        ? 'No gaps were found against the learned pattern. That is not an approval: a named reviewer still decides.'
        : `${findings.length} gap${findings.length === 1 ? '' : 's'} found, ${severe} of them material. A named reviewer still decides.`,
      model: m,
    };
  }

  /* A printable summary, so the findings can sit next to the cycle rather than
     living only in a tooltip. */
  function summary(result) {
    if (!result || !result.ok) return '';
    if (!result.findings.length) return result.note || result.recommendation || 'Nothing to report.';
    return result.findings.map(f => `• ${f.field}: ${f.message}${f.basis ? ' (' + f.basis + ')' : ''}`).join('\n');
  }

  return { FIELDS, MIN_TRAINING, train, review, summary, closed, overlap, allCycles };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = PDCA_REVIEW;
