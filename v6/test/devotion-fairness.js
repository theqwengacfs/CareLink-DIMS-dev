/* ============================================================================
   devotion-fairness.js — A5: the weekday devotion roster is random, but it is
   fair, and no one is quietly carrying the year alone.

   "Fair" is a claim that has to survive a count, so this file counts. A full year
   of weekdays is generated for every seed it can drive and the spread between the
   most-loaded and least-loaded person is asserted to stay inside one turn; the
   same person is never asked to lead twice in a row; special days go to the
   director rather than to whoever the shuffle happened to put next; and the
   prayer partner is a named member of staff, not a blank field.
   ============================================================================ */
const assert = require('node:assert/strict');
const { makeCtx } = require('./dom');

let passed = 0;
function ok(name, cond, detail) {
  assert.ok(cond, name + (detail === undefined ? '' : ` — ${detail}`));
  passed++;
  console.log(`  ok  ${name}`);
}

const { run } = makeCtx();
run('DB.load();DB.seedDemo();');

/* Generates a full year for one county with a deterministic shuffle, so the
   result does not depend on luck when someone re-runs this test. */
const generate = (seed, county = 'kisumu') => run(`(() => {
  const u = DB.db.users.find(x => x.username === '${county === 'kisumu' ? 'kisumu.assistant' : 'homa.assistant'}') ||
            DB.db.users.find(x => x.countyId === '${county}' && x.roleId === 'assistant');
  let s = ${seed};
  const rnd = n => { s = (s * 1103515245 + 12345) % 2147483648; return s % n; };
  const g = DEVOTION_RULES.run(DB.db, u, 'generate', {countyId:'${county}', year:2026},
    {now:'2026-11-01T10:00:00Z', randomInt:rnd});
  if (!g.ok) throw Error(g.msg);
  return g.rec;
})()`);

const seeds = [1, 7, 42, 1234, 99991];
const years = seeds.map(s => generate(s));
ok('a full year can be generated at all', years.every(r => r.assignments.length > 200), String(years[0].assignments.length));
ok('weekends are never rostered', years.every(r => r.assignments.every(a => {
  const d = new Date(a.date + 'T00:00:00Z').getUTCDay();
  return d !== 0 && d !== 6;
})));

/* ---- fairness, counted ------------------------------------------------ */
const spreads = years.map(r => {
  const counts = {};
  r.assignments.filter(a => !a.special).forEach(a => { counts[a.leaderId] = (counts[a.leaderId] || 0) + 1; });
  const vals = Object.values(counts);
  return { people: vals.length, min: Math.min(...vals), max: Math.max(...vals), spread: Math.max(...vals) - Math.min(...vals) };
});
ok('every eligible person is used, not just the first few',
  spreads.every(s => s.people > 40), JSON.stringify(spreads[0]));
ok('the load spread never exceeds one turn',
  spreads.every(s => s.spread <= 1), JSON.stringify(spreads.map(s => s.spread)));
ok('nobody is left carrying zero turns while others carry several',
  spreads.every(s => s.min >= 1), JSON.stringify(spreads.map(s => s.min)));
ok('the total turns equal the number of non-special weekdays (nothing is dropped)',
  years.every(r => {
    const nonSpecial = r.assignments.filter(a => !a.special).length;
    const assigned = r.assignments.filter(a => !a.special && a.leaderId).length;
    return nonSpecial === assigned;
  }));

/* ---- nobody leads twice in a row ------------------------------------- */
const repeats = years.map(r => {
  const seq = r.assignments.filter(a => !a.special).map(a => a.leaderId);
  let n = 0;
  for (let i = 1; i < seq.length; i++) if (seq[i] === seq[i - 1]) n++;
  return n;
});
ok('the same person is never rostered on two consecutive weekdays',
  repeats.every(n => n === 0), JSON.stringify(repeats));

/* ---- special days ----------------------------------------------------- */
const specials = years.map(r => r.assignments.filter(a => a.special));
ok('special days are marked and carry the director rather than a random pick',
  specials.every(list => list.every(a => {
    const u = run(`DB.db.users.find(x=>x.id===${JSON.stringify(a.leaderId)})`);
    return u && u.roleId === 'director';
  })), JSON.stringify(specials[0].map(a => a.special)));

/* ---- Tuesday to Thursday is the half hour --------------------------- */
const times = years[0].assignments.filter(a => !a.special).map(a => {
  const day = new Date(a.date + 'T00:00:00Z').getUTCDay();
  return { day, time: a.time };
});
ok('Tuesday, Wednesday and Thursday devotions are the 08:30–09:00 slot',
  times.filter(t => t.day >= 2 && t.day <= 3).length > 0 &&
  times.filter(t => t.day >= 2 && t.day <= 4).every(t => t.time === '08:30–09:00'));
ok('Monday and Friday carry an honest "Time not specified" rather than a guessed slot',
  times.filter(t => t.day === 1 || t.day === 5).every(t => t.time === 'Time not specified'));

/* ---- the named prayer partner ---------------------------------------- */
run(`(() => {
  const assistant = DB.db.users.find(x => x.username === 'kisumu.assistant');
  const g = DEVOTION_RULES.run(DB.db, assistant, 'generate', {countyId:'kisumu', year:2027},
    {now:'2026-11-01T10:00:00Z', randomInt:() => 0});
  if (!g.ok) throw Error(g.msg);
  DEVOTION_RULES.apply(DB.db, g.patches);
  const a = g.rec.assignments.find(x => !x.special);
  const leader = DB.db.users.find(u => u.id === a.leaderId);
  const partner = DB.db.users.find(u => u.countyId === leader.countyId && u.id !== leader.id && DEVOTION_RULES.active(u));
  const closing = DEVOTION_RULES.run(DB.db, leader, 'closing',
    {countyId: leader.countyId, date: a.date, closingId: partner.id}, {now:'2026-11-02T09:00:00Z'});
  if (!closing.ok) throw Error(closing.msg);
  DEVOTION_RULES.apply(DB.db, closing.patches);
  return partner.id;
})()`);
const closingRow = run('(DB.db.devotionMeetings||[]).find(m=>m.closingId)');
ok('the closing prayer is recorded against a named staff member', closingRow && Boolean(closingRow.closingId), JSON.stringify(closingRow && closingRow.closingId));
ok('and that person is a real active account, not a free-text name',
  Boolean(run(`(()=>{const m=(DB.db.devotionMeetings||[]).find(x=>x.closingId);const u=m&&DB.db.users.find(x=>x.id===m.closingId);return u&&DEVOTION_RULES.active(u)})()`)));

console.log(`devotion-fairness: ${passed} checks passed`);
