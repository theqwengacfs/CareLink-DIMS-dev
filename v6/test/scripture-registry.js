/* ============================================================================
   scripture-registry.js — A6: a user picks a verse and prayer notes, and the
   system reads the reference the way a person writes it, offers seven
   translations, and is honest about which of them it may display.

   The honesty part is the point. Scripture in most modern translations is under
   copyright; copying a whole chapter into a record system is a licensing act. So
   these assertions check both halves: that the reference machinery really works,
   and that the system never pretends to hold text it has no permission to hold.
   ============================================================================ */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeCtx } = require('./dom');

let passed = 0;
function ok(name, cond, detail) {
  assert.ok(cond, name + (detail === undefined ? '' : ` — ${detail}`));
  passed++;
  console.log(`  ok  ${name}`);
}

const { run } = makeCtx();
run('DB.load();DB.seedDemo();');

/* ---- the seven ---------------------------------------------------------- */
const seven = run('SCRIPTURE.ORDER.map(id=>SCRIPTURE.TRANSLATIONS[id].short)');
ok('seven translations are registered', seven.length === 7, seven.join(','));
ok('the set is the one the minutes screen already offers, so the two cannot drift',
  seven.join(',') === 'NIV,KJV,NKJV,ESV,NLT,NASB,CSB');
ok('every translation states its permission instead of being assumed free',
  run('SCRIPTURE.ORDER.every(id=>["public-domain","licensed-link","licensed-quote","unconfirmed"].includes(SCRIPTURE.TRANSLATIONS[id].permission))'));
ok('the public-domain one is shown in full', run('SCRIPTURE.mayDisplayText("kjv")') === true);
ok('a licensed one is not reproduced without a recorded clearance',
  run('SCRIPTURE.mayDisplayText("niv")') === false);
ok('a clearance in settings does switch it on, rather than being hard-coded off',
  run('(()=>{DB.db.settings.scripture={cleared:["niv"]};const v=SCRIPTURE.mayDisplayText("niv",DB.db);delete DB.db.settings.scripture;return v})()') === true);

/* ---- writing it the way people write it --------------------------------- */
const cases = [
  ['John 3:16', 'John 3:16'],
  ['  john 3:16 ', 'John 3:16'],
  ['Jn 3:16', 'John 3:16'],
  ['Jn. 3:16-18', 'John 3:16–18'],
  ['1 Cor 13:4-7', '1 Corinthians 13:4–7'],
  ['I Cor 13:4-7', '1 Corinthians 13:4–7'],
  ['2 Timothy 1:7', '2 Timothy 1:7'],
  ['Psalm 23', 'Psalm 23'],
  ['Ps 23:1', 'Psalm 23:1'],
  ['Rom 8:28,31', 'Romans 8:28,31'],
  ['Rev 21:4', 'Revelation 21:4'],
  ['Prov. 3:5-6', 'Proverbs 3:5–6'],
];
for (const [input, expected] of cases) {
  const got = run(`(()=>{const p=SCRIPTURE.parse(${JSON.stringify(input)});return p?SCRIPTURE.format(p):null})()`);
  ok(`"${input}" reads as ${expected}`, got === expected, String(got));
}
ok('an ordinal prefix is not lost, because "1 John" and "John" are different books',
  run('SCRIPTURE.parse("1 John 4:8").book') === '1 John' && run('SCRIPTURE.parse("John 4:8").book') === 'John');
ok('a verse range keeps both ends rather than collapsing to the first verse',
  run('SCRIPTURE.parse("Psalm 23:1-6").verses[0].to') === 6);
ok('nonsense is refused with a sentence a person can act on',
  run('SCRIPTURE.passage("not a reference at all!!","niv",DB.db).msg').includes('Book chapter:verse'));
ok('nothing is invented for an unreadable reference',
  run('SCRIPTURE.passage("","niv",DB.db).ok') === false);

/* ---- what the reader is shown ------------------------------------------ */
const niv = run('SCRIPTURE.passage("John 3:16","niv",DB.db)');
ok('the passage carries the reference, normalised', niv.reference === 'John 3:16');
ok('the passage names the translation it will read from', niv.translation.short === 'NIV');
ok('a licensed translation says plainly why the text is not shown',
  niv.showText === false && /not reproduced here/.test(niv.notice), niv.notice);
const kjv = run('SCRIPTURE.passage("John 3:16","kjv",DB.db)');
ok('a public-domain translation is marked displayable', kjv.showText === true && kjv.notice === '');
ok('an unknown translation falls back to a stated default instead of failing',
  run('SCRIPTURE.passage("John 3:16","zzz",DB.db).translation.short') === 'NIV');

/* ---- a reference nobody checked is not "verified" ---------------------- */
const typed = run('SCRIPTURE.verifiedRecord("John 3:16","niv",AUTH.user||{name:"Tester"},{db:DB.db})');
ok('a reference recorded by hand is marked unverified', typed.verification === 'unverified');
ok('and it keeps the reference and translation it was recorded with',
  typed.reference === 'John 3:16' && typed.translation === 'NIV');
ok('only a named checker makes it verified',
  run('SCRIPTURE.verifiedRecord("John 3:16","niv",{name:"Tester"},{db:DB.db,verifiedBy:"J. Ochieng"}).verification') === 'verified');

/* ---- wired into the devotion minutes ---------------------------------- */
const proc = fs.readFileSync(path.join(__dirname, '..', 'src', 'monday_procurement6.js'), 'utf8');
ok('the prepare-minutes form offers the translation selector',
  /name="translation"/.test(proc) && /SCRIPTURE\.available\(DB\.db\)/.test(proc));
ok('the translation is carried with the save, not dropped at the form',
  /payload\.translation=String\(fd\.get\('translation'\)/.test(proc));
ok('the stored minutes say whether the reference was checked against the printed text',
  /not yet checked against the printed text/.test(proc));
ok('the translation links are built from the registry rather than typed twice',
  /SCRIPTURE\.available\(DB\.db\)\)?/.test(proc) && !/const links=ref=>\[\['NIV'/.test(proc));
const rules = fs.readFileSync(path.join(__dirname, '..', 'src', 'devotion_rules.js'), 'utf8');
ok('saving a reference records its translation and verification state',
  /record\.scripture=carry/.test(rules));
ok('the registry is loaded before the modules that use it',
  fs.readFileSync(path.join(__dirname, '..', 'build.py'), 'utf8').indexOf('scripture.js') > 0 &&
  fs.readFileSync(path.join(__dirname, '..', 'build.py'), 'utf8').indexOf('scripture.js') < fs.readFileSync(path.join(__dirname, '..', 'build.py'), 'utf8').indexOf('devotion_rules.js'));

console.log(`scripture-registry: ${passed} checks passed`);
