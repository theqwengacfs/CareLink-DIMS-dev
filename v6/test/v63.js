/* v6.3 · Acceptance suite for the data-exposure remediation.

   On 23 October 2026 an audit of what this repository actually publishes found
   that the October 2026 inventory workbooks had been copied into
   v6/src/inventory_data.js almost verbatim, and from there into every built
   bundle. That published vehicle registration plates, chassis numbers, handset
   IMEIs, five staff SIM numbers, asset values, and which member of staff
   carries which device - to anyone with the URL, before any login.

   The same audit found three defects that made it worse:

     * the register was dead. INVENTORY_SEED was never consumed, because
       inventorySeed() did not exist, so the Office equipment register rendered
       nothing while the bundle still carried all 122 rows of raw data;
     * the Media department is documented as the owner of the register but the
       mediahead role had no inventory.view, so neither Media head could open it;
     * seeded contact details were built to look real - '07' plus a random
       eight-digit range - so invented patients, and real named staff, carried
       telephone numbers that could belong to actual subscribers.

   This suite proves the remediation holds: structure published, identifiers
   not, the register alive, its owner able to open it, and every seeded person
   reachable only in reserved space. It also proves the tooling that keeps it
   that way exists. Document 23 is the record; document 22 is the history
   runbook.
*/
const {makeCtx} = require('./dom');
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', 'src');
const REPO = path.join(__dirname, '..', '..');
const read = f => fs.readFileSync(path.join(SRC, f), 'utf8');
const {run} = makeCtx();

run('DB.load(); DB.seedOfficial({patients:600});');
run(`AUTH.logout(); AUTH.login('chief.admin','LOMAMO2026');`);

let pass = 0, fail = 0; const fails = [];
function ok(name, cond, detail){ if(cond){ pass++; } else { fail++; fails.push(name+(detail?(' — '+detail):'')); } }
function test(name, fn){ try{ const r = fn(); if(r===false) throw new Error('returned false'); ok(name, true); } catch(e){ ok(name, false, e.message); } }
const as = u => { run(`AUTH.logout(); AUTH.login('${u}','LOMAMO2026');`); return run(`AUTH.user.id`); };
const J = expr => JSON.parse(run(`JSON.stringify(${expr})`));

/* Patterns that must not appear in anything this repository publishes. The
   three demo vehicle plates in data.js are invented and allowed. */
const PLATE = /\bK[A-Z]{2}\s?\d{3}\s?[A-Z]\b/g;
const DEMO_PLATES = ['KDX 001A','KDG 442B','KCC 887C'];
const IMEI = /\b3\d{14}\b/g;
const LIVE_PHONE = /\b(?:0|\+?254)?7[1-9]\d{7}\b|\b01\d{8}\b/g;
/* Surnames of the real people the Administration named. A published register
   must not locate an asset at any of them. */
const STAFF = ['Washington','Ashar','Catherine','Denis','Allan','Daniel','Julia','Julie',
  'Martin','Musa','Moses','Oscar','Evans','Wickliffe','Wicklyff','John','Irene','Chamah',
  'Otieno','Odhiambo','Omondi','Obila','Lubalo','Wayodi','Oguta','Omolo','Odero','Onyango',
  'Achieng','Abuto','Nyanjong','Atieno','Awuor','Anyango','Shikuku','Mildred','Naphtaly','Ondu'];

/* ===================== 1. the published register ========================== */
test('the published register carries structure and no identifiers', ()=>{
  const rows = J('INVENTORY_SEED');
  ok('the workbook\'s 122 equipment rows are carried', rows.length===122, String(rows.length));
  ok('every monetary value was removed', rows.every(r=>!String(r.value||'').trim()),
    String(rows.filter(r=>String(r.value||'').trim()).length)+' rows still carry a value');
  ok('no device identifier survives', rows.every(r=>!r.serial || /^(LMM|LMMK)/.test(r.serial)),
    rows.filter(r=>r.serial && !/^(LMM|LMMK)/.test(r.serial)).map(r=>r.serial).slice(0,3).join(', '));
  ok('the Foundation\'s own asset labels were kept', rows.filter(r=>/^(LMM|LMMK)/.test(r.serial||'')).length>10,
    String(rows.filter(r=>/^(LMM|LMMK)/.test(r.serial||'')).length));
  ok('no asset is located at a person',
    !rows.some(r=>STAFF.some(n=>new RegExp('\\b'+n+'\\b','i').test(r.loc||''))),
    rows.filter(r=>STAFF.some(n=>new RegExp('\\b'+n+'\\b','i').test(r.loc||''))).map(r=>r.loc).slice(0,3).join(', '));
  ok('no narrative note was read as an item', !rows.some(r=>/^\d+$/.test(String(r.item))),
    rows.filter(r=>/^\d+$/.test(String(r.item))).map(r=>r.item).join(','));
  ok('every quantity is plausible', rows.every(r=>+r.qty<1000), 'max '+Math.max(...rows.map(r=>+r.qty)));
  ok('locations are a closed list of sites',
    rows.every(r=>!r.loc || J('INVENTORY_SITES').includes(r.loc)),
    rows.filter(r=>r.loc && !J('INVENTORY_SITES').includes(r.loc)).map(r=>r.loc).slice(0,3).join(', '));
  ok('no plate, IMEI or live telephone number anywhere in the source', (()=>{
    const bad = [];
    fs.readdirSync(SRC).filter(f=>f.endsWith('.js')).forEach(f=>{
      const t = read(f);
      const plates = (t.match(PLATE)||[]).filter(p=>!DEMO_PLATES.includes(p));
      if(plates.length) bad.push(f+':'+plates.slice(0,2).join('/'));
      if((t.match(IMEI)||[]).length) bad.push(f+':IMEI');
      const phones = (t.match(LIVE_PHONE)||[]).filter(p=>!['0712345678','0112345678','254712345678','0722111222'].includes(p));
      if(phones.length) bad.push(f+':'+phones.slice(0,2).join('/'));
    });
    ok('detail', bad.length===0, bad.slice(0,4).join(', '));
    return bad.length===0;
  })());
  ok('the redaction is declared in the file itself', /REDACTION POLICY/.test(read('inventory_data.js'))
    && run(`INVENTORY_REDACTION.removed.length`)>=6 && run(`INVENTORY_REDACTION.counts.valuesRemoved`)>40);
  ok('the register states where the real values live',
    /office[- ]host/i.test(String(run(`INVENTORY_REDACTION.whereTheRealValuesLife||INVENTORY_REDACTION.whereTheRealValuesLive`))));
  return true;
});

/* ===================== 2. the register is alive =========================== */
test('inventorySeed() feeds the database, so the register is not dead code', ()=>{
  ok('inventorySeed exists', run(`typeof inventorySeed`)==='function');
  const n = run(`DB.db.inventoryItems.length`);
  ok('the seeded database holds every row', n===run(`INVENTORY_SEED.length`), String(n));
  ok('each row has a stable unique id', run(`new Set(DB.db.inventoryItems.map(i=>i.id)).size`)===n);
  ok('ids are ordered and readable', run(`DB.db.inventoryItems[0].id`)==='inv-001');
  const units = run(`DB.db.inventoryItems.reduce((a,i)=>a+(+i.qty||0),0)`);
  ok('the unit total is plausible', units>100 && units<1000, String(units));
  ok('the movement ledger points at real rows',
    run(`DB.db.inventoryMoves.every(m=>DB.db.inventoryItems.some(i=>i.id===m.itemId))`)===true);
  ok('the register renders a full page', run(`String(renderInventory(AUTH.user)).length`)>8000,
    String(run(`String(renderInventory(AUTH.user)).length`)));
  return true;
});

test('the department that owns the register can open it', ()=>{
  ok('the Media head holds inventory.view', run(`RBAC.has({roleId:'mediahead'},'inventory.view')`)===true);
  ok('the Media head holds inventory.manage', run(`RBAC.has({roleId:'mediahead'},'inventory.manage')`)===true);
  as('media.head');
  const h1 = String(run(`String(renderInventory(AUTH.user))`));
  ok('Kisumu Media renders the register', /Items in register/.test(h1) && !/denied/i.test(h1.slice(0,400)));
  as('media.homabay');
  const h2 = String(run(`String(renderInventory(AUTH.user))`));
  ok('Homa Bay Media has equal privileges', /Items in register/.test(h2) && h2.length>8000, String(h2.length));
  ok('the rendered page carries no identifier', (()=>{
    const plates = (h2.match(PLATE)||[]).filter(p=>!DEMO_PLATES.includes(p));
    ok('detail', plates.length===0 && !(h2.match(IMEI)||[]).length && !(h2.match(LIVE_PHONE)||[]).length,
      plates.join('/')+' imei:'+(h2.match(IMEI)||[]).length);
    return plates.length===0 && !(h2.match(IMEI)||[]).length;
  })());
  ok('it shows the count templates', /Physical count templates/.test(h2));
  ok('it shows the acquisition notes', /How these assets arrived/.test(h2));
  ok('it states what was removed and where the values live', /Removed from the published register/.test(h2)
    && /office host/i.test(h2));
  ok('it no longer claims to publish the workbook\'s amounts',
    !/Amounts are kept exactly as the workbook records them/.test(h2));
  as('caregiver.nyalenda');
  ok('a caregiver is refused', /not authorised|denied|requires/i.test(String(run(`String(renderInventory(AUTH.user))`))));
  as('chief.admin');
  return true;
});

/* ===================== 3. the count templates ============================= */
test('the other sheets became count templates, with no quantities published', ()=>{
  const sup = J('SUPPLY_CATALOG');
  ok('every supply line the workbooks list is carried', sup.length>70, String(sup.length));
  ok('no supply quantity is published', sup.every(s=>String(s.qty||'')===''),
    String(sup.filter(s=>String(s.qty||'')!=='').length)+' lines carry a quantity');
  ok('the six supply groups are all present',
    ['Medicines','Wound Care','Equipment','PPEs and Socks','Cleaning Material','Dressing Materials']
      .every(c=>sup.some(s=>s.cat===c)), [...new Set(sup.map(s=>s.cat))].join(', '));
  ok('units were read from the workbook, not invented',
    sup.some(s=>s.unit==='tins') && sup.some(s=>s.unit==='boxes') && sup.some(s=>s.unit==='tabs'));
  const sc = J('SUPPLY_COUNT_COLUMNS');
  ok('the nine-column count sheet is carried', sc.length===9, sc.join(' | '));
  ok('including its period-over-period shape', sc.some(c=>/Jun 2026/i.test(c)) && sc.some(c=>/Oct 2026/i.test(c)));
  ok('and its store columns', sc.some(c=>/In Store/i.test(c)) && sc.some(c=>/Given Out/i.test(c)));
  const kc = J('KITCHEN_COUNT_COLUMNS');
  ok('the ten kitchen material columns are carried', kc.length===10, kc.join(' | '));
  ok('including the working total and the breakage column',
    kc.some(c=>/Working Total/i.test(c)) && kc.some(c=>/Broken/i.test(c)));
  const kit = J('KITCHEN_CATALOG');
  ok('every kitchen item is carried', kit.length>70, String(kit.length));
  const notes = J('INVENTORY_NOTES');
  ok('the acquisition notes are kept as provenance', notes.length===7, String(notes.length));
  ok('a named donor was reduced to a role', !notes.some(n=>/McClanahan|Pamela/i.test(n)),
    notes.filter(n=>/McClanahan|Pamela/i.test(n)).join(' '));
  ok('the gifts themselves are still recorded', notes.some(n=>/donat/i.test(n)) && notes.some(n=>/Hilux/i.test(n)));
  ok('the categories are the workbook\'s own eight',
    J('INVENTORY_CATEGORIES').length===8 && J('INVENTORY_CATEGORIES').includes('Furniture & Furnishings')
    && J('INVENTORY_CATEGORIES').includes('Computers, IT & Networking Equipment'));
  ok('sites are recorded, not people', J('INVENTORY_SITES').length===18
    && !J('INVENTORY_SITES').some(s=>STAFF.some(n=>new RegExp('\\b'+n+'\\b','i').test(s))));
  ok('the source is cited and marked as not held here',
    run(`INVENTORY_SOURCE.inRepository`)===false && /office host/i.test(String(run(`INVENTORY_SOURCE.note`))));
  return true;
});

test('the blank count sheet downloads with nothing filled in', ()=>{
  as('media.homabay');
  run(`globalThis.__dl=null; downloadText=(n,t,m)=>{ globalThis.__dl={n:n,t:t,m:m}; };`);
  ok('the action is registered', run(`typeof ACTIONS['inv-template-csv']`)==='function');
  run(`ACTIONS['inv-template-csv']()`);
  const dl = J('globalThis.__dl');
  ok('a file was produced', !!dl && /\.csv$/.test(dl.n||''), String(dl&&dl.n));
  const lines = String(dl.t).split('\n');
  ok('it carries the supply sheet', lines.some(l=>/MEDICAL, WOUND-CARE/i.test(l)));
  ok('and the kitchen sheet', lines.some(l=>/KITCHEN & HOUSEHOLD/.test(l)));
  ok('with the workbook\'s own columns', lines.some(l=>/Product Name/.test(l)) && lines.some(l=>/Working Total|Ceramic/.test(l)));
  ok('every item line is present', lines.length > 79+77, String(lines.length));
  const dataRows = lines.filter(l=>/^"(Medicines|Wound Care|Equipment|PPEs and Socks|Cleaning Material|Dressing Materials)"/.test(l));
  ok('supply lines carry no quantity', dataRows.length>70 && dataRows.every(l=>/^("[^"]*",){2}"[^"]*"(,"")*$/.test(l)),
    dataRows.filter(l=>!/^("[^"]*",){2}"[^"]*"(,"")*$/.test(l)).slice(0,2).join(' '));
  ok('the sheet says a physical count is required', /physical count/i.test(String(dl.t)));
  ok('it carries no identifier', !(String(dl.t).match(IMEI)||[]).length
    && !(String(dl.t).match(PLATE)||[]).filter(p=>!DEMO_PLATES.includes(p)).length);
  ok('the download was audited',
    run(`DB.db.audit.some(a=>a.action==='inventory.countsheet')`)===true);
  run(`ACTIONS['inv-export']()`);
  const ex = J('globalThis.__dl');
  ok('the register CSV is audited too', run(`DB.db.audit.some(a=>a.action==='inventory.exported')`)===true);
  ok('and its value column is labelled as office-host only', /Value \(office host only\)/.test(String(ex.t)));
  ok('and it exports no secret', !(String(ex.t).match(IMEI)||[]).length
    && !(String(ex.t).match(PLATE)||[]).filter(p=>!DEMO_PLATES.includes(p)).length);
  as('chief.admin');
  return true;
});

/* ===================== 4. reserved space for invented people ============== */
test('every seeded person is reachable only in reserved space', ()=>{
  const users = J('DB.db.users.map(u=>({n:u.name,p:u.phone||"",e:u.email||""}))');
  ok('every staff number is in the 0700 demo band', users.every(u=>!u.p || /^0700\d{6}$/.test(u.p)),
    users.filter(u=>u.p && !/^0700\d{6}$/.test(u.p)).map(u=>u.p).slice(0,3).join(', '));
  ok('staff numbers are unique', new Set(users.map(u=>u.p).filter(Boolean)).size===users.filter(u=>u.p).length);
  ok('no mailbox is on a live domain', users.every(u=>!u.e || /@(lomamo\.example|lomamo\.demo|example\.(com|org))$/.test(u.e)),
    users.filter(u=>u.e && !/@(lomamo\.example|lomamo\.demo|example\.(com|org))$/.test(u.e)).map(u=>u.e).slice(0,3).join(', '));
  const pats = J('DB.db.patients.map(p=>({p:p.phone||"",c:p.ccc||"",i:p.nationalId||""}))');
  ok('patient numbers are in their own demo sub-band',
    pats.every(p=>!p.p || /^07001\d{5}$/.test(p.p)), pats.filter(p=>p.p&&!/^07001\d{5}$/.test(p.p)).length+' off-band');
  ok('patient numbers never collide with staff numbers',
    !pats.some(p=>p.p && users.some(u=>u.p===p.p)));
  ok('clinic numbers are in the demo band', pats.every(p=>!p.c || /^CCC\/9\d{4}$/.test(p.c)),
    pats.filter(p=>p.c && !/^CCC\/9\d{4}$/.test(p.c)).map(p=>p.c).slice(0,3).join(', '));
  ok('National IDs are in the unissued 9x band',
    pats.every(p=>!p.i || /^BC-/.test(p.i) || p.i[0]==='9'),
    pats.filter(p=>p.i && !/^BC-/.test(p.i) && p.i[0]!=='9').map(p=>p.i).slice(0,3).join(', '));
  ok('no generator still builds a number from a random live range',
    !fs.readdirSync(SRC).filter(f=>f.endsWith('.js')).some(f=>/'07'\s*\+/.test(read(f))));
  const demo = (()=>{ run('DB.load(); seedDemo(DB.db, new Date()); DB.save();');
    const d = J('DB.db.patients.map(p=>({p:p.phone||"",c:p.ccc||""}))');
    run('DB.load(); DB.seedOfficial({patients:600});');
    run(`AUTH.logout(); AUTH.login('chief.admin','LOMAMO2026');`);
    return d; })();
  ok('the demo seed follows the same rule',
    demo.every(p=>!p.p || /^07001\d{5}$/.test(p.p)) && demo.every(p=>!p.c || /^CCC\/9\d{4}$/.test(p.c)),
    demo.filter(p=>p.p&&!/^07001\d{5}$/.test(p.p)).map(p=>p.p).slice(0,3).join(', '));
  return true;
});

/* ===================== 5. what the published artefacts carry ============== */
test('the built artefacts publish no identifier', ()=>{
  const targets = ['public/carelink-v6.html','v6/LOMAMO-CareLink-DIMS-v6.0.html'];
  targets.forEach(rel=>{
    const f = path.join(REPO, rel);
    if(!fs.existsSync(f)){ ok(rel+' exists', false, 'missing - run node tools/sync-lovable.mjs'); return; }
    const t = fs.readFileSync(f,'utf8');
    const plates = (t.match(PLATE)||[]).filter(p=>!DEMO_PLATES.includes(p));
    ok(rel+' carries no vehicle plate', plates.length===0, plates.slice(0,3).join(', '));
    ok(rel+' carries no IMEI', (t.match(IMEI)||[]).length===0, (t.match(IMEI)||[]).slice(0,2).join(', '));
    const phones = (t.match(LIVE_PHONE)||[]).filter(p=>!['0712345678','0112345678','254712345678','0722111222'].includes(p));
    ok(rel+' carries no live-range telephone number', phones.length===0, phones.slice(0,3).join(', '));
    ok(rel+' carries no chassis number', !/chassis\s*(no\.?|number)?\s*[:\-]?\s*[A-HJ-NPR-Z0-9]{11,}/i.test(t));
    ok(rel+' still carries the redacted register', /INVENTORY_SEED/.test(t) && /Physical count templates/.test(t));
  });
  const portal = String(run(`String(renderPublicPortal({}))`));
  ok('the public portal carries no identifier',
    !((portal.match(PLATE)||[]).filter(p=>!DEMO_PLATES.includes(p)).length) && !(portal.match(IMEI)||[]).length
    && !(portal.match(LIVE_PHONE)||[]).length);
  return true;
});

/* ===================== 6. the tooling that keeps it clean ================= */
test('the remediation tooling and its records are in place', ()=>{
  const has = rel => fs.existsSync(path.join(REPO, rel));
  ['v6/tools/redact_inventory.py','v6/tools/verify_no_patient_data.py','v6/tools/purge_patient_data.sh',
   'v6/docs/22_PURGE_RUNBOOK.md','v6/docs/23_INVENTORY_REDACTION.md'].forEach(rel=>ok(rel+' exists', has(rel)));
  const red = fs.readFileSync(path.join(REPO,'v6/tools/redact_inventory.py'),'utf8');
  ok('the redactor is the only supported generator', /only supported\s+way to regenerate/i.test(red));
  ok('it can emit filter-repo replacements', /--replace-text-file/.test(red));
  ok('it can audit the committed file', /--check/.test(red) && /def check\(/.test(red));
  const ver = fs.readFileSync(path.join(REPO,'v6/tools/verify_no_patient_data.py'),'utf8');
  ok('the verifier scans for plates, IMEIs and live numbers',
    /SECRET_PATTERNS/.test(ver) && /vehicle registration plate/.test(ver) && /handset IMEI/.test(ver));
  ok('the verifier audits the register row by row', /def inventory_structure/.test(ver));
  ok('the verifier enforces the contact conventions', /def contact_conventions/.test(ver));
  ok('the verifier refuses workbooks at the root', /no Administration workbook is tracked/.test(ver));
  const purge = fs.readFileSync(path.join(REPO,'v6/tools/purge_patient_data.sh'),'utf8');
  ok('the purge targets all four workbooks',
    ['20260101 LOMAMO registration patients 2026 (1).xlsx','20260101 LOMAMO registration patients 2026.xlsx',
     'LOMAMO Kisumu Master Inventory october 2026.xlsx','LMMK Medical supplies inventory - OCT2026.xlsx']
      .every(p=>purge.includes('"'+p+'"')));
  ok('the purge restores the origin remote that filter-repo deletes',
    /ORIGIN_URL="\$\(git config --get remote\.origin\.url/.test(purge) && /git remote add origin "\$ORIGIN_URL"/.test(purge));
  ok('the purge can start a verified fresh history', /--fresh-history/.test(purge) && /git checkout --orphan/.test(purge));
  ok('the purge refuses to start a history that is not clean',
    /verify_no_patient_data\.py/.test(purge) && /REFUSING: the tree is not clean/.test(purge));
  ok('the runbook says why a path-only rewrite is not enough here',
    /Why Route B is not complete/.test(fs.readFileSync(path.join(REPO,'v6/docs/22_PURGE_RUNBOOK.md'),'utf8')));
  ok('the runbook covers the pull-request refs a force-push cannot clear',
    /refs\/pull/.test(fs.readFileSync(path.join(REPO,'v6/docs/22_PURGE_RUNBOOK.md'),'utf8')));
  const gi = fs.readFileSync(path.join(REPO,'.gitignore'),'utf8');
  ok('spreadsheets at the root are ignored', /^\s*\/\*\.xlsx\s*$/m.test(gi) && /^\s*\/\*\.xls\s*$/m.test(gi));
  ok('the blank import template is still tracked', has('v6/examples/LOMAMO-Master-Patient-Workbook-TEMPLATE.xlsx'));
  const tracked = require('child_process').execSync('git ls-files',{cwd:REPO}).toString().split('\n');
  ok('no workbook is tracked at the repository root',
    !tracked.some(t=>t && !t.includes('/') && /\.(xlsx|xls)$/i.test(t)),
    tracked.filter(t=>t && !t.includes('/') && /\.(xlsx|xls)$/i.test(t)).join(', '));
  return true;
});

/* ============================== summary ================================== */
console.log('');
if(fails.length){ console.log('FAILED:'); fails.slice(0,40).forEach(f=>console.log('  x '+f)); }
console.log(`\n${pass}/${pass+fail} v6.3 assertions passed${fail?` · ${fail} failed`:''}`);
process.exit(fail?1:0);
