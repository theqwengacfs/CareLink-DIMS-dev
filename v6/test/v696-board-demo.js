/* Read-only, no-account board preview isolation and reference-register checks. */
const { makeCtx } = require('./dom');
const { run, ctx } = makeCtx();
let pass=0, fail=0;
function ok(name, condition){
  if(condition){pass++; console.log('PASS',name);}
  else {fail++; console.error('FAIL',name);}
}

run(`DB.db=DB.blank(); DB.db.meta.label='pre-existing local state'; DB.save();`);
ok('Public landing page exposes the no-account synthetic demo entry', run(`renderLanding().includes('demo-preview-enter') && renderLanding().includes('no account')`));
const original = run('DB.db');
const before = ctx.localStorage.getItem('lomamo_carelink_dims_v66');
run('DEMO_PREVIEW.enter()');
const db = run('DB.db');
const patients = db.patients;
ok('No-login entry creates an isolated preview database', run('DEMO_PREVIEW.active') && db!==original && db.meta.demoPreview===true);
ok('Entry opens the console immediately with an explicit read-only synthetic-data banner', run(`document.querySelector('#root').innerHTML.includes('BOARD PREVIEW') && document.querySelector('#root').innerHTML.includes('READ ONLY')`));
ok('Board preview seeds exactly 3,333 synthetic patients', patients.length===3333 && patients.every(p=>p.demo===true));
ok('Synthetic reference ages span 5–75 with no out-of-range records', Math.min(...patients.map(p=>p.age))===5 && Math.max(...patients.map(p=>p.age))===75 && patients.every(p=>p.age>=5 && p.age<=75));
ok('CareLink identifiers are unique and encode ministry area and intake date', new Set(patients.map(p=>p.code)).size===3333 && patients.every(p=>p.code.startsWith('CL-'+p.areaId.toUpperCase()+'-') && p.code.includes(String(p.intake).slice(0,10).replace(/-/g,''))));
ok('Child and adult clinical profiles include height, weight, BMI and MUAC', patients.filter(p=>p.age<18).length>0 && patients.every(p=>p.clinical.heightCm>0 && p.clinical.weightKg>0 && p.clinical.bmi>0 && p.clinical.muacMm>0));
ok('Generated longitudinal visits include anthropometry for every patient', patients.every(p=>db.visits.some(v=>v.patientId===p.id && v.heightCm>0 && v.weight>0 && v.bmi>0 && v.muacMm>0)));
ok('Preview uses an in-memory synthetic principal, not a login or hosted session', run(`AUTH.session.token`)==='local-read-only-demo' && run(`AUTH.user.demo`)===true);
run('DB.save()');
ok('Saving in preview cannot persist over the pre-existing local dataset', ctx.localStorage.getItem('lomamo_carelink_dims_v66')===before && run('DB.db.meta.localEditedAt')===undefined);
ok('Exit restores the previous local database and clears preview identity', (()=>{run('DEMO_PREVIEW.exit()'); return !run('DEMO_PREVIEW.active') && run('DB.db')===original && run('AUTH.user')===null;})());
ok('App-level click, submit and change guards keep preview workflows read-only',
  /const safe = new Set\(\['go','page','open-patient','patient-tab'/.test(require('fs').readFileSync(require('path').join(__dirname,'..','src','app.js'),'utf8')) &&
  /if\(DEMO_PREVIEW.active\)\{ e.preventDefault\(\)/.test(require('fs').readFileSync(require('path').join(__dirname,'..','src','app.js'),'utf8')));
console.log(`Board demo: ${pass} passed, ${fail} failed`);
if(fail) process.exit(1);
