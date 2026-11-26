/* ============================================================================
   stylus-handwriting.js — the pad records ink, and says honestly what the ink is.

   The Foundation asked for stylus handwriting on a tablet (D19) and, in the same
   set of prompts, said a typed name must never be presented as a verified
   signature. Those two requirements pull in opposite directions, so this suite
   pins both ends:

     * a stylus stroke is stored as points with pressure and time, not as a
       picture, and it is labelled as a stylus stroke;
     * a finger stroke is labelled as a finger stroke, and a mouse stroke as a
       mouse stroke, because "signed" means something different in each case;
     * a typed name is stored as `typed` with no ink at all, and the printed
       caption says so;
     * nothing the pad produces is `verified`. That word belongs to a named
       reviewer, and the module must never write it.
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

/* ---- stroke capture ----------------------------------------------------- */
run(`
  globalThis.__pen = INK.addStroke(INK.empty(),
    [[10,10,0.4],[10.4,10.2,0.5],[11,12,0.6],[14,18,0.7],[20,26,0.8],[28,31,0.6]],
    { kind:'stylus', width:600, height:180, at:'2026-11-26T09:00:00.000Z' });
`);
ok('a stroke is stored as points, not as an image',
  run(`Array.isArray(__pen.strokes) && Array.isArray(__pen.strokes[0]) && typeof __pen.strokes[0][0][0] === 'number'`));
ok('pen pressure is kept with each point',
  run(`__pen.strokes[0].every(p => typeof p[2] === 'number' && p[2] > 0)`));
ok('pen jitter is dropped rather than stored',
  run(`__pen.strokes[0].length < 6 && __pen.strokes[0].length >= 3`), String(run('__pen.strokes[0].length')));
ok('the pad remembers how wide the surface was, so ink keeps its proportions',
  run(`__pen.width === 600 && __pen.height === 180`));
ok('a stroke records when it started and when it ended',
  run(`__pen.startedAt === '2026-11-26T09:00:00.000Z' && __pen.endedAt === '2026-11-26T09:00:00.000Z'`));
ok('adding a stroke never mutates the pad a save might be reading',
  run(`(() => { const before = __pen.strokes.length;
    const next = INK.addStroke(__pen, [[50,50,0.5],[60,60,0.5]], {kind:'stylus'});
    return next !== __pen && __pen.strokes.length === before && next.strokes.length === before + 1; })()`));
ok('an empty stroke is ignored rather than stored as a dot',
  run(`INK.addStroke(INK.empty(), [], {kind:'stylus'}).strokes.length === 0`));

/* ---- honest labelling --------------------------------------------------- */
ok('a stylus-only pad is described as a stylus signature',
  run(`INK.methodOf(__pen) === 'stylus' && /stylus/i.test(INK.describeMethod(__pen))`), run('INK.describeMethod(__pen)'));
run(`globalThis.__finger = INK.addStroke(INK.empty(), [[5,5,0.5],[9,12,0.5],[14,20,0.5]], {kind:'touch', width:600, height:180});`);
ok('a finger stroke is not called a stylus stroke', run(`INK.methodOf(__finger) === 'touch'`));
ok('a finger stroke says so in words', run(`/finger/i.test(INK.describeMethod(__finger))`), run('INK.describeMethod(__finger)'));
run(`globalThis.__mouse = INK.addStroke(INK.empty(), [[5,5,0.5],[9,12,0.5]], {kind:'pointer', width:600, height:180});`);
ok('a mouse stroke is not presented as handwriting', run(`INK.methodOf(__mouse) === 'pointer' && /mouse|trackpad/i.test(INK.describeMethod(__mouse))`));
run(`globalThis.__mixed = INK.addStroke(__pen, [[70,70,0.5],[80,80,0.5]], {kind:'touch', width:600, height:180});`);
ok('a pad touched by both a pen and a finger is labelled as mixed', run(`INK.methodOf(__mixed) === 'mixed'`));
ok('the input type is read from the pointer event, not guessed from the device',
  run(`INK.kindOf({pointerType:'pen'}) === 'stylus' && INK.kindOf({pointerType:'touch'}) === 'touch' && INK.kindOf({pointerType:'mouse'}) === 'pointer'`));

/* ---- what is stored, and what it must never claim ---------------------- */
run(`globalThis.__rec = INK.toRecord(__pen, { by:'Demo - Medical Case Manager', role:'Medical Case Manager',
  purpose:'SOAP encounter', at:'2026-11-26T09:01:00.000Z', device:'iPad + Apple Pencil' });`);
ok('the record carries the method and the person who signed',
  run(`__rec.method === 'stylus' && __rec.capturedBy === 'Demo - Medical Case Manager' && __rec.role === 'Medical Case Manager'`));
ok('the record keeps the ink so a signature can be reprinted', run(`__rec.ink && __rec.ink.strokes.length === __pen.strokes.length`));
ok('nothing the pad produces is ever marked verified', run(`__rec.verification === 'unverified'`));
ok('the module cannot write the word verified anywhere in a record',
  !/verification\s*:\s*'verified'/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'ink.js'), 'utf8')));
ok('the printed caption says it is not independently verified',
  /not independently verified/.test(run('INK.caption(__rec)')), run('INK.caption(__rec)'));
ok('the printed caption names the instrument',
  /stylus/i.test(run('INK.caption(__rec)')));
ok('the caption reports the amount of ink, so a two-point scrawl is visible as one',
  /pen points/.test(run('INK.caption(__rec)')));

run(`globalThis.__typed = INK.typedRecord('J. Ochieng', { by:'Demo - Nurse', role:'Nurse', at:'2026-11-26T09:02:00.000Z' });`);
ok('a typed name is recorded as typed, with no ink at all',
  run(`__typed.method === 'typed' && __typed.ink === null && __typed.points === 0`));
ok('a typed name says plainly that it is not a signature',
  /not a signature/i.test(run('INK.caption(__typed)')), run('INK.caption(__typed)'));
ok('a typed name keeps the name as written rather than pretending to be a mark',
  /J\. Ochieng/.test(run('__typed.purpose')), run('__typed.purpose'));

/* ---- printable without a raster --------------------------------------- */
ok('a signature can be printed as vector paths, so no canvas is needed to print it',
  run(`/^<svg[\\s\\S]*<path d="M/.test(INK.svg(__pen))`));
ok('the printed signature is labelled for a screen reader',
  run(`/role="img"/.test(INK.svg(__pen,{label:'Clinician signature'}))`));
ok('an empty pad prints nothing rather than an empty box', run(`INK.svg(INK.empty()) === ''`));

/* ---- the pad controller ------------------------------------------------- */
ok('the field renders a canvas and a typed-name fallback',
  run(`/ink-canvas/.test(INK_PAD.field('sig-1',{label:'Signature'})) && /Typed/.test(INK_PAD.field('sig-1'))`));
ok('the fallback says a typed name will be stored as typed, not as a signature',
  /not as a signature/i.test(run(`INK_PAD.field('sig-2')`)));
ok('an untouched pad records nothing, so a form can omit the signature entirely',
  run(`INK_PAD.record('never-touched') === null`));
run(`INK_PAD.down('sig-3', {clientX:10, clientY:12, pressure:0.6, pointerType:'pen'}, {width:600,height:180,getBoundingClientRect:()=>({left:0,top:0,width:600,height:180})});
     INK_PAD.move('sig-3', {clientX:14, clientY:18, pressure:0.6, pointerType:'pen'}, {width:600,height:180,getBoundingClientRect:()=>({left:0,top:0,width:600,height:180})});
     INK_PAD.up('sig-3', {clientX:20, clientY:26, pointerType:'pen'}, {width:600,height:180,getBoundingClientRect:()=>({left:0,top:0,width:600,height:180})});`);
ok('a drawn stroke is captured by the controller and stored as a stylus trace',
  run(`INK_PAD.points('sig-3') > 0 && INK_PAD.method('sig-3') === 'stylus'`), run('INK_PAD.method("sig-3")'));
ok('clearing a pad discards the ink rather than hiding it',
  run(`(() => { INK_PAD.reset('sig-3'); return INK_PAD.isEmpty('sig-3') && INK_PAD.record('sig-3') === null; })()`));
ok('points are normalised to the canvas, so a phone and a desktop store comparable ink',
  run(`(() => { const p = INK_PAD.toCanvasSpace({clientX:300, clientY:90, pressure:0.5},
      {width:600, height:180, getBoundingClientRect:()=>({left:0,top:0,width:300,height:90})});
    return p[0] === 600 && p[1] === 180; })()`), run(`JSON.stringify(INK_PAD.toCanvasSpace({clientX:300,clientY:90,pressure:0.5},{width:600,height:180,getBoundingClientRect:()=>({left:0,top:0,width:300,height:90})}))`));

/* ---- wired into a real clinical record -------------------------------- */
const clinical = fs.readFileSync(path.join(__dirname, '..', 'src', 'bmi_clinical6.js'), 'utf8');
ok('the SOAP encounter offers a signature pad', /INK_PAD\.field\('mcm-soap-sign'/.test(clinical));
ok('the saved encounter carries the ink record, not a typed claim',
  /signature: \(typeof INK_PAD!=='undefined'/.test(clinical) && /INK_PAD\.record\('mcm-soap-sign'/.test(clinical));
ok('the pad is optional, so an unsigned encounter still saves',
  !/if\(!signature\)|if \(!signature\)/.test(clinical));
ok('the pen input is a real pointer pipeline, not a text box',
  /pointerdown/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8')) &&
  /touch-action:none/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'care_review.css'), 'utf8')));
ok('the pad is reachable by keyboard focus as well as by pen',
  /tabindex="0"/.test(run(`INK_PAD.field('sig-4')`)) && /focus-visible/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'care_review.css'), 'utf8')));
ok('printing hides the pad controls and keeps the ink',
  /@media print\{[\s\S]{0,200}\.ink-tools/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'care_review.css'), 'utf8')));

console.log(`stylus-handwriting: ${passed} checks passed`);
