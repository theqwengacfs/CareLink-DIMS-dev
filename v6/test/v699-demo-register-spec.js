/* The fixed demonstration register the Foundation specifies for every board
   review, verified against the real seeder and the real reference master:

     4,000 patients · ages 5–75 · 40% inside the day 60–80 window ·
     at least 12 recorded contacts each · three or more weights spaced three
     weeks apart · an even Kisumu / Homa Bay split · every module populated.

   The same figures must hold for the published master package, because the
   server refuses a master whose register is a different size. */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { makeCtx } = require('./dom');

let pass = 0, fail = 0;
function ok(name, condition, detail) {
  if (condition) { pass++; console.log('PASS', name); }
  else { fail++; console.error('FAIL', name, detail === undefined ? '' : detail); }
}

const DAY = 86400000;
const SRC = path.join(__dirname, '..', 'src');
const ctx = makeCtx();
const run = (code) => ctx.run(code);
run('DB.load();');

const spec = run(`(()=>{
  DB.seedOfficial({ patients: DEMO_REGISTER.patients });
  const db = DB.db;
  const pts = db.patients || [];
  const days = pts.map(p => PAT.days(p));
  const byPatient = Object.create(null);
  for (const v of db.visits || []) (byPatient[v.patientId] = byPatient[v.patientId] || []).push(v);

  let minContacts = Infinity, minWeights = Infinity, badWeightGap = 0, missingWeighIn = 0;
  let otherType = 0;
  for (const p of pts) {
    const visits = (byPatient[p.id] || []).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const weighed = visits.filter(v => Number(v.weight) > 0 && Number(v.heightCm) > 0 && Number(v.bmi) > 0 && Number(v.muacMm) > 0);
    minContacts = Math.min(minContacts, visits.length);
    minWeights = Math.min(minWeights, weighed.length);
    if (!weighed.length) missingWeighIn++;
    for (let i = 1; i < weighed.length; i++) {
      const gap = Math.round((new Date(weighed[i].date) - new Date(weighed[i - 1].date)) / DAY);
      if (gap > 21) badWeightGap++;
    }
    for (const v of visits) if (!['home', 'clinical', 'hospital', 'homestay'].includes(v.type)) otherType++;
  }

  const inWindow = days.filter(d => d >= 60 && d <= 80).length;
  const counties = pts.reduce((m, p) => { m[p.countyId] = (m[p.countyId] || 0) + 1; return m; }, {});
  const ages = pts.map(p => p.age);
  const modules = {
    visits: (db.visits || []).length,
    pdcas: (db.pdcas || []).length,
    patientConditions: (db.patientConditions || []).length,
    support: (db.support || []).length,
    documents: (db.documents || []).length,
    requests: (db.requests || []).length,
    transactions: (db.transactions || []).length,
    employees: (db.employees || []).length,
    inventoryItems: (db.inventoryItems || []).length,
    budgets: (db.budgets || []).length,
    referralEntities: (db.referralEntities || []).length,
    careBeds: (db.careBeds || []).length,
    stockLots: (db.stockLots || []).length,
    formRecords: (db.formRecords || []).length,
    users: (db.users || []).length,
    areas: new Set(pts.map(p => p.areaId)).size
  };
  return {
    total: pts.length,
    label: db.meta.label,
    minDays: Math.min(...days), maxDays: Math.max(...days),
    inWindow, windowShare: inWindow / pts.length,
    counties, minAge: Math.min(...ages), maxAge: Math.max(...ages),
    everyAgePresent: Array.from({ length: 71 }, (_, k) => ages.includes(k + 5)).every(Boolean),
    girls: pts.filter(p => p.sex === 'F').length, boys: pts.filter(p => p.sex === 'M').length,
    minContacts, minWeights, badWeightGap, missingWeighIn, otherType,
    modules,
    demos: pts.filter(p => p.demo === true).length
  };
})()`);

ok('the fixed demonstration register holds exactly 4,000 patients', spec.total === 4000, String(spec.total));
ok('every patient in the register is labelled synthetic', spec.demos === spec.total, `${spec.demos}/${spec.total}`);
ok('the dataset label states the register size', /4,000 Patients/.test(spec.label), spec.label);
ok('ages span the full 5–75 range', spec.minAge === 5 && spec.maxAge === 75, `${spec.minAge}–${spec.maxAge}`);
ok('every single age from 5 to 75 is present', spec.everyAgePresent === true);
ok('the register is split evenly between Kisumu and Homa Bay',
  spec.counties.kisumu === 2000 && spec.counties.homabay === 2000, JSON.stringify(spec.counties));
ok('girls and boys are equally represented', spec.girls === 2000 && spec.boys === 2000, `${spec.girls}/${spec.boys}`);
ok('two in five patients (40%) sit in the day 60–80 review window',
  spec.inWindow === 1600 && Math.abs(spec.windowShare - 0.40) < 0.0001, `${spec.inWindow} (${spec.windowShare})`);
ok('the remaining patients stay inside the 45–330 day programme window',
  spec.minDays >= 45 && spec.maxDays <= 330, `${spec.minDays}–${spec.maxDays}`);
ok('every patient carries at least 12 recorded contacts', spec.minContacts >= 12, String(spec.minContacts));
ok('every patient carries at least 3 weighed measurements', spec.minWeights >= 3, String(spec.minWeights));
ok('every patient has at least one weighed visit with height, BMI and MUAC', spec.missingWeighIn === 0, String(spec.missingWeighIn));
ok('no patient goes longer than three weeks without a weight', spec.badWeightGap === 0, String(spec.badWeightGap));
ok('all recorded contacts use a recognised visit type', spec.otherType === 0, String(spec.otherType));

const emptyModules = Object.entries(spec.modules).filter(([, n]) => !n).map(([k]) => k);
ok('every programme and departmental module is populated', emptyModules.length === 0, emptyModules.join(', '));
ok('the register covers all ten ministry areas', spec.modules.areas === 10, String(spec.modules.areas));
ok('the register keeps the full departmental account roster', spec.modules.users >= 42, String(spec.modules.users));

/* The published master package must describe the same register, because the
   server compares its patient count to the expected size before it imports. */
const masterPath = path.join(__dirname, '..', '..', 'public', 'master', 'CareLink-Reference-Master-v6.6.json');
const manifest = JSON.parse(fs.readFileSync(masterPath, 'utf8'));
ok('the published reference master declares the same register size', manifest.counts.patients === 4000, String(manifest.counts.patients));
ok('the published reference master passes its own quality checks', manifest.quality && manifest.quality.passed === true);
ok('the published reference master transports in verified upload chunks',
  manifest.chunkCount === manifest.chunks.length && manifest.chunkCount <= 256, `${manifest.chunkCount} chunks`);
const raw = zlib.brotliDecompressSync(Buffer.from(manifest.chunks.join(''), 'base64')).toString('utf8');
const payload = JSON.parse(raw);
ok('the transported payload matches the manifest digest and size',
  Buffer.byteLength(raw) === manifest.rawBytes && require('node:crypto').createHash('sha256').update(raw).digest('hex') === manifest.digest);
ok('the transported payload carries the 4,000-patient register', payload.db.patients.length === 4000, String(payload.db.patients.length));
ok('the transported payload carries at least 12 visits for every patient',
  new Set(payload.db.visits.map(v => v.patientId)).size === 4000);
ok('the transported payload carries the same module coverage',
  payload.db.pdcas.length > 0 && payload.db.support.length > 0 && payload.db.documents.length > 0);
ok('the transported payload carries no credential material',
  payload.db.users.every(u => !u.hash && !u.salt));

/* The server's expected register size is a single constant, not a scattered
   number, so a future change cannot silently half-import a package. */
const api = fs.readFileSync(path.join(__dirname, '..', '..', 'api', 'index.js'), 'utf8');
ok('the server pins one expected reference register size', /const REFERENCE_PATIENT_COUNT = 4000;/.test(api));
ok('the server rejects any other reference register size', /patients\.length !== REFERENCE_PATIENT_COUNT/.test(api));
ok('the server has no hard-coded 3,333 register left', !/3333/.test(api));

/* No source module may still promise the old register size to an operator. */
const staleSources = fs.readdirSync(SRC)
  .filter(f => f.endsWith('.js') && f !== 'media6.js' && f !== 'themes.js')
  .filter(f => /3,333|3333/.test(fs.readFileSync(path.join(SRC, f), 'utf8')));
ok('no source module still advertises the old 3,333-patient register', staleSources.length === 0, staleSources.join(', '));

console.log(`Demo register spec: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
