/* ============================================================================
   pdca-review-engine.js — the review engine reads cycles against what this
   organisation's finished cycles actually look like.

   The Foundation asked for a review engine "trained on 120 real PDCAs". What can
   be defended without inventing anything is this: learn the pattern of the closed
   cycles in the register, then read a new cycle against it and say *why* each gap
   is a gap. So the assertions here are about discipline, not accuracy:

     * every finding names a field and the evidence behind it;
     * it refuses to judge when there is too little to learn from;
     * it never says "approve", and never emits a verdict;
     * it learns from both record shapes in the register;
     * it does not flag a well-written cycle as full of gaps.
   ============================================================================ */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeCtx } = require('./dom');

let passed = 0;
function ok(name, condition, detail) {
  assert.ok(condition, name + (detail === undefined ? '' : ` — ${detail}`));
  passed++;
  console.log(`  ok  ${name}`);
}

const { run } = makeCtx();
run('DB.load();DB.seedDemo();');

/* ---- what it learns ----------------------------------------------------- */
const model = run('PDCA_REVIEW.train(DB.db)');
ok('the engine finds the closed cycles in the register', model.closedCount >= 120, String(model.closedCount));
ok('it says how many cycles it learned from, so the claim can be checked',
  model.closedCount > 0 && model.total >= model.closedCount);
ok('it is willing to judge only above its own floor', model.enough === true && model.minTraining === 40);
ok('it measures how often each field is filled rather than assuming',
  typeof model.per.plan.fillRate === 'number' && model.per.plan.of === model.closedCount);
ok('it reads both record shapes in the register',
  /fromCareReview/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'pdca_review.js'), 'utf8')) &&
  /allCycles/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'pdca_review.js'), 'utf8')));
ok('the training totals agree with the register it was given',
  run('PDCA_REVIEW.train(DB.db).closedCount === (DB.db.pdcas||[]).filter(p=>["closed","completed","verified","signed_off"].includes(String(p.status||"").toLowerCase())||p.closedAt||p.verifiedAt).length'));

/* ---- too little evidence: refuse, do not invent ------------------------ */
const starved = run(`(() => {
  const db = { pdcas: (DB.db.pdcas||[]).slice(0,3) };
  const m = PDCA_REVIEW.train(db);
  return PDCA_REVIEW.review(db.pdcas[0], m);
})()`);
ok('with almost nothing to learn from it returns no findings at all', starved.findings.length === 0);
ok('and says why it is not scoring', /is not scoring this cycle/.test(starved.note), starved.note);

/* ---- a cycle with gaps ------------------------------------------------- */
const empty = { id: 'x1', status: 'open', plan: 'Nutrition support & adherence review', doNote: '', checkNote: '', actNote: '', owner: 'u-cg-nyal' };
const emptyResult = run(`PDCA_REVIEW.review(${JSON.stringify(empty)}, PDCA_REVIEW.train(DB.db))`);
ok('an empty cycle is reported field by field, not scored out of ten',
  emptyResult.findings.filter(f => f.severity === 'missing').length >= 3,
  JSON.stringify(emptyResult.findings.map(f => f.field)));
ok('each finding says what the field was expected to contain',
  emptyResult.findings.every(f => f.message && f.message.length > 20));
ok('each finding that rests on data quotes its basis',
  emptyResult.findings.some(f => /closed cycles/i.test(String(f.basis))));
ok('the engine never emits an approval', !/approve/i.test(JSON.stringify(emptyResult)));

/* ---- a cycle that is actually well written ---------------------------- */
const good = {
  id: 'x2', status: 'open', owner: 'u-cg-nyal',
  plan: 'Restart nutrition support for this household and review adherence at the next visit',
  doNote: 'Delivered two food bags on 14 November and checked the child was eating three meals a day',
  checkNote: 'Weight rose from 11.2 kg to 12.0 kg and the caregiver reported no missed meals this week',
  actNote: 'Continue the same ration and review the weight again by 5 December before discharge planning',
};
const goodResult = run(`PDCA_REVIEW.review(${JSON.stringify(good)}, PDCA_REVIEW.train(DB.db))`);
ok('a cycle that fills every field with real content raises no material finding',
  goodResult.findings.filter(f => f.severity === 'missing' || f.severity === 'restated' || f.severity === 'undated').length === 0,
  JSON.stringify(goodResult.findings));
ok('and it says so without blessing the cycle',
  /not an approval/i.test(goodResult.recommendation), goodResult.recommendation);

/* ---- the two checks that are not about length ------------------------- */
const restated = { ...good, checkNote: good.plan, actNote: good.plan };
const restatedResult = run(`PDCA_REVIEW.review(${JSON.stringify(restated)}, PDCA_REVIEW.train(DB.db))`);
ok('a stage that repeats the plan is identified as a restatement',
  restatedResult.findings.some(f => f.severity === 'restated'), JSON.stringify(restatedResult.findings.map(f => f.severity)));
ok('the restatement finding names the overlap rather than just complaining',
  restatedResult.findings.filter(f => f.severity === 'restated').every(f => /%.*words|Shares/i.test(String(f.basis))));

const noDate = { ...good, actNote: 'Continue the same ration and review the weight again at some point' };
const noDateResult = run(`PDCA_REVIEW.review(${JSON.stringify(noDate)}, PDCA_REVIEW.train(DB.db))`);
ok('a next step with no date is flagged as impossible to follow up',
  noDateResult.findings.some(f => f.severity === 'undated'));

const dated = { ...good, actNote: 'Continue the same ration and review the weight again by 5 December' };
ok('a dated next step is not flagged',
  !run(`PDCA_REVIEW.review(${JSON.stringify(dated)}, PDCA_REVIEW.train(DB.db))`).findings.some(f => f.severity === 'undated'));

/* ---- the 120-day chain ------------------------------------------------ */
const longCycle = { ...good, dueDay: 120, reviewComment: '' };
const longResult = run(`PDCA_REVIEW.review(${JSON.stringify(longCycle)}, PDCA_REVIEW.train(DB.db))`);
ok('a 120-day cycle without an MCM comment is flagged as chain-incomplete',
  longResult.findings.some(f => f.severity === 'chain'), JSON.stringify(longResult.findings.map(f => f.severity)));
ok('the finding cites the chain rule rather than an opinion',
  longResult.findings.filter(f => f.severity === 'chain').every(f => /MCM comments/i.test(String(f.basis))));

/* ---- it is advisory, and the interface says so ------------------------ */
const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
ok('the review screen shows the engine output above the reviewer\'s own comment box',
  app.indexOf('PDCA_REVIEW.train(DB.db)') > 0 && app.indexOf('adviceHtml') > 0);
ok('the screen says the reviewer can disagree with any finding',
  /you can disagree with any of them/.test(app));
ok('the screen says a named reviewer still decides',
  /still decides/.test(run(`PDCA_REVIEW.review(${JSON.stringify(empty)}, PDCA_REVIEW.train(DB.db)).recommendation`)));
ok('the comment box is not pre-filled with the engine\'s opinion',
  !/<textarea class="input" name="comment"[^>]*>\$\{esc\(PDCA_REVIEW/.test(app));
ok('no part of the engine writes to a record; it only returns findings',
  !/DB\.db\.\w+\s*=|DB\.save\(/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'pdca_review.js'), 'utf8')));
ok('the printable summary puts each finding on its own line next to the cycle',
  run(`PDCA_REVIEW.summary(${JSON.stringify(emptyResult)}).split('\\n').length`) === emptyResult.findings.length);

console.log(`pdca-review-engine: ${passed} checks passed`);
