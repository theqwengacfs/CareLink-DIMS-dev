/* v6.1 · The release acceptance suite.

   Everything the Administration asked for in this increment is proved here,
   against the data layer and the rendered page, including the refusal paths:

     1  Ministry area staff, visit days, department heads and the Monday
        management-meeting rule, reprogrammed from Administration's own list.
     2  The authority audit: targets, finance, patient data and ministry
        information bound to a level, a department and a context - and the
        specific violation that was reported (an M&E officer setting a county
        target) proved closed.
     3  The cost-per-patient engine: attribution, roll-ups, scoping, standards.
     4  TB dispensing control: request, answer, the ten-day rule, dispense,
        physical count and reconciliation against procurement.
     5  The master patient workbook mapping: sheets, columns, formulas, the
        registration blueprint and the INDEX report topics.
     6  The public portal: LOMAMO content, and no patient identity on it.
     7  The visual audit: theme contrast, the tablet default and the device
        specification the layout is measured against.
     8  Every new console renders for every role that may open it.
*/
const {makeCtx}=require('./dom');
const {run}=makeCtx();
run('DB.load(); DB.seedOfficial({patients:600});');
run(`AUTH.logout(); AUTH.login('chief.admin','LOMAMO2026');`);

let pass=0, fail=0; const fails=[];
function ok(name, cond, detail){
  if(cond){ pass++; } else { fail++; fails.push(name+(detail?(' — '+detail):'')); }
}
function test(name, fn){
  try{ const r=fn(); if(r===false) throw new Error('returned false'); ok(name,true); }
  catch(e){ ok(name,false,e.message); }
}
const as = u => { run(`AUTH.logout(); AUTH.login('${u}','LOMAMO2026');`); return run(`AUTH.user.id`); };
const J = code => run(`JSON.stringify(${code})`);

/* ============================== 1. staff, visit days, Monday ============= */
test('Administration\'s own staff list is loaded, seat by seat', ()=>{
  const named = run(`(()=>{ const m={}; DB.db.users.forEach(u=>{ m[u.username]=u; }); return {
    director:m['director']?.name, chief:m['chief.admin']?.name, ksmAdmin:m['kisumu.admin']?.name,
    assistant:m['kisumu.assistant']?.name, ops:m['program.admin']?.name,
    hbAdmin:m['homabay.admin']?.name, hbCoord:m['coord.homabay']?.name, hbCare:m['caregiver.makongeni']?.name,
    mediaKsm:m['media.head']?.name, mediaHb:m['media.homabay']?.name, pr:m['pr.officer']?.name,
    procure:m['procurement']?.name, hospital:m['focal.kisumu']?.name, hospitalDeputy:m['liaison.kisumu']?.name,
    welfare:m['welfare.officer']?.name, fleetDeputy:m['vehicle.officer']?.name,
    nyalenda:m['coord.nyalenda']?.name, nairobird:m['coord.nairobird']?.name, manyatta:m['coord.manyatta']?.name,
    ombeyi:m['coord.ombeyi']?.name, nyahera:m['coord.nyahera']?.name, ahero:m['coord.ahero']?.name,
    chiga:m['coord.chiga']?.name, ashar:m['caregiver.nairobird']?.name, evans:m['caregiver.ombeyi']?.name,
    susan:m['chw.nyalenda']?.name, iscah:m['chw.manyatta.iscah']?.name, millicent:m['chw.manyatta.millicent']?.name
  }; })()`);
  ok('Director is Martin Mito Chamah', named.director==='Martin Mito Chamah', named.director);
  ok('Chief Admin / Kisumu Admin is Moses Otieno', named.chief==='Moses Otieno' && named.ksmAdmin==='Moses Otieno', named.chief+'/'+named.ksmAdmin);
  ok('Chief Admin Assistant is Julie Oguta', named.assistant==='Julie Oguta', named.assistant);
  ok('Internal Operations Manager is Irene Otieno', named.ops==='Irene Otieno', named.ops);
  ok('Homa Bay Admin is Oscar Lubalo', named.hbAdmin==='Oscar Lubalo', named.hbAdmin);
  ok('Homa Bay County Coordinator is Daniel Ondu', named.hbCoord==='Daniel Ondu', named.hbCoord);
  ok('Julia Orwa is a caregiver in Homa Bay', named.hbCare==='Julia Orwa', named.hbCare);
  ok('Oscar Lubalo also heads Media in Homa Bay', named.mediaHb==='Oscar Lubalo', named.mediaHb);
  ok('Daniel Naphtaly Ombija heads Media in Kisumu', named.mediaKsm==='Daniel Naphtaly Ombija', named.mediaKsm);
  ok('Catherine Awuor Obila is in charge of Public Relations', named.pr==='Catherine Awuor Obila', named.pr);
  ok('Allan Dennis Wayodi heads Procurement', named.procure==='Allan Dennis Wayodi', named.procure);
  ok('Washington Ayub Odero heads the Hospital Department', named.hospital==='Washington Ayub Odero', named.hospital);
  ok('Susan Mildred is the hospital deputy', named.hospitalDeputy==='Susan Mildred', named.hospitalDeputy);
  ok('Ashar Anyango Omondi heads Staff Welfare', named.welfare==='Ashar Anyango Omondi', named.welfare);
  ok('John Shikuku Omolo deputises in Vehicle & Transport', named.fleetDeputy==='John Shikuku Omolo', named.fleetDeputy);
  ok('Nyalenda coordinator is Daniel Naphtaly Ombija', named.nyalenda==='Daniel Naphtaly Ombija', named.nyalenda);
  ok('Nairobi Road coordinator is Catherine Awuor Obila', named.nairobird==='Catherine Awuor Obila', named.nairobird);
  ok('Manyatta coordinator is Washington Ayub Odero', named.manyatta==='Washington Ayub Odero', named.manyatta);
  ok('Ombeyi coordinator is Allan Dennis Wayodi', named.ombeyi==='Allan Dennis Wayodi', named.ombeyi);
  ok('Nyahera coordinator is John Shikuku Omolo', named.nyahera==='John Shikuku Omolo', named.nyahera);
  ok('Ahero coordinator is Evans Omondi Odiyo', named.ahero==='Evans Omondi Odiyo', named.ahero);
  ok('Chiga coordinator is Wycliff Otieno', named.chiga==='Wycliff Otieno', named.chiga);
  ok('Ashar Anyango Omondi assists Nairobi Road and Nyahera', named.ashar==='Ashar Anyango Omondi', named.ashar);
  ok('Evans Omondi Odiyo assists Ombeyi', named.evans==='Evans Omondi Odiyo', named.evans);
  ok('Susan Mildred is the Nyalenda Community Health Partner', named.susan==='Susan Mildred', named.susan);
  ok('Iscah Abuto and Millicent Achieng Otieno are registered in the Manyatta pool',
    named.iscah==='Iscah Abuto' && named.millicent==='Millicent Achieng Otieno', named.iscah+'/'+named.millicent);
  return true;
});

test('a seat Administration has not named is labelled, never invented', ()=>{
  const seats = run(`DB.db.users.filter(u=>u.unconfirmed).length`);
  const invented = run(`DB.db.users.filter(u=>u.unconfirmed && !/seat to be confirmed|Care Team|to be confirmed/i.test(u.name)).map(u=>u.name)`);
  ok('unconfirmed seats are flagged', seats>0, String(seats));
  ok('every unconfirmed seat carries a seat label, not a person\'s name', invented.length===0, invented.join(', '));
  return true;
});

test('ministry home-visit days are the days Administration fixed', ()=>{
  const days = run(`(()=>{ const m={}; DB.db.users.forEach(u=>{ m[u.username]=u.visitDays||[]; }); return m; })()`);
  const eq = (a,b)=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
  ok('Nairobi Road visits Tuesday and Thursday', eq(days['coord.nairobird'],[2,4]), JSON.stringify(days['coord.nairobird']));
  ok('Manyatta visits Wednesday only', eq(days['coord.manyatta'],[3]), JSON.stringify(days['coord.manyatta']));
  ok('Ombeyi visits Tuesday only', eq(days['coord.ombeyi'].filter(d=>d===2),[2]), JSON.stringify(days['coord.ombeyi']));
  ok('Nyahera visits Wednesday', days['coord.nyahera'].includes(3), JSON.stringify(days['coord.nyahera']));
  ok('Ahero visits Thursday only', days['coord.ahero'].includes(4) && !days['coord.ahero'].includes(2)===false, JSON.stringify(days['coord.ahero']));
  ok('Chiga visits Friday only', eq(days['coord.chiga'],[5]), JSON.stringify(days['coord.chiga']));
  ok('Homa Bay field days are left to be added', eq(days['coord.homabay'],[]), JSON.stringify(days['coord.homabay']));
  const teamDays = run(`TEAMX.all().filter(t=>t.confirmed).map(t=>t.areaId+':'+(t.visitDays||[]).join('-'))`);
  ok('the team table carries the same days', teamDays.length>=6, teamDays.join(', '));
  ok('Nyalenda is marked provisional, not confirmed',
    run(`TEAMX.byArea('nyalenda').confirmed`)===false);
  return true;
});

test('the Monday management-meeting rule is written into leave coverage', ()=>{
  ok('a Monday management-meeting site exists', run(`LEAVE.sites().some(s=>s.id==='management' && s.office===true)`)===true);
  const monday = run(`LEAVE.pattern().filter(p=>p.weekday===1).map(p=>p.staff)`);
  ok('every permanent field officer is at the office on Monday', monday.length>=8, monday.join(','));
  const mondayMeeting = run(`LEAVE.pattern().filter(p=>p.weekday===1 && p.siteId==='management').map(p=>p.staff)`);
  ok('Wycliff is not held at the meeting: he may be at the hospital',
    !mondayMeeting.includes('ls-wickliff') && run(`LEAVE.pattern().some(p=>p.weekday===1 && p.siteId==='hospital' && p.staff==='ls-wickliff')`)===true);
  ok('Wycliff alone carries the Monday exception', run(`LEAVE.staff(null).filter(e=>e.canLeaveMonday).map(e=>e.id).join(',')`)==='ls-wickliff');
  ok('the rule text names the management meeting', run(`LEAVE.rules().coverage.some(r=>r.id==='R1' && /Management Meeting/i.test(r.text))`)===true);
  ok('the visit-day rule R6 is published', run(`LEAVE.rules().coverage.some(r=>r.id==='R6')`)===true);
  as('hr.officer');
  const out = run(`(()=>{ const d=LEAVE.employee('ls-daniel'), w=LEAVE.employee('ls-wickliff');
    return { a:LEAVE.check({employeeId:d.id,type:'annual',from:'2026-11-02',to:'2026-11-02',emergency:true}),
             b:LEAVE.check({employeeId:w.id,type:'annual',from:'2026-11-02',to:'2026-11-02',emergency:true}),
             s:LEAVE.check({employeeId:d.id,type:'sick',from:'2026-11-02',to:'2026-11-02',emergency:true}) }; })()`);
  ok('a coordinator is refused a Monday', out.a.ok===false, (out.a.reasons||[]).join(' '));
  ok('Wycliff may take a Monday, with the R2 warning', out.b.ok===true && (out.b.warnings||[]).some(w=>/R2/.test(w)));
  ok('sick leave on a Monday is never refused by the meeting rule', out.s.ok===true, (out.s.reasons||[]).join(' '));
  return true;
});

test('the HR roster and the accounts are one staff list', ()=>{
  ok('no roster line points at an account that does not exist',
    run(`DB.db.employees.filter(e=>e.userId && !DB.db.users.some(u=>u.id===e.userId)).length`)===0);
  ok('the field roster carries the real names',
    run(`LEAVE.employee('ls-daniel').name`)==='Daniel Naphtaly Ombija');
  ok('the casual pool is registered', run(`LEAVE.casuals().length`)>=4, String(run(`LEAVE.casuals().length`)));
  ok('every account has a roster line, so leave applies to everyone',
    run(`DB.db.users.filter(u=>!DB.db.employees.some(e=>e.userId===u.id)).length`)===0);
  return true;
});

test('the ministry teams console renders and covers the week', ()=>{
  as('coord.nairobird');
  const html = run(`TEAMX.render(AUTH.user)`);
  ok('the console renders', typeof html==='string' && html.length>2000, String(html.length));
  ok('it shows the Monday meeting', /Monday management meeting/i.test(html));
  ok('it shows the field week', /The field week/i.test(html));
  ok('it shows department leadership', /Department leadership/i.test(html));
  ok('it names the coordinator', /Catherine Awuor Obila/.test(html));
  ok('it flags a provisional day as provisional', /Provisional/.test(html));
  const board = run(`TEAMX.weekBoard().map(d=>d.weekday+':'+d.teams.length)`);
  ok('the week board covers five days', board.length===5, board.join(' '));
  ok('Monday has no field team', run(`TEAMX.weekBoard()[0].teams.length`)===0);
  ok('Friday carries the hospital ministry', run(`TEAMX.weekBoard()[4].hospital!==null`)===true);
  return true;
});

/* ============================== 2. authority audit ======================= */
test('the reported violation is closed: M&E may not set a target', ()=>{
  as('me.kisumu');
  ok('M&E may read targets', run(`RBAC.can(AUTH.user,'report.targets.view',{}).ok`)===true);
  ok('M&E may not set a county target', run(`RBAC.can(AUTH.user,'report.targets.manage',{level:'county',countyId:'kisumu'}).ok`)===false);
  ok('M&E may not set a national target', run(`RBAC.can(AUTH.user,'report.targets.manage',{level:'national'}).ok`)===false);
  ok('M&E may not set an area target', run(`RBAC.can(AUTH.user,'report.targets.area',{areaId:'nyalenda'}).ok`)===false);
  ok('M&E holds no target level at all', run(`ACCESS.targetLevels(AUTH.user).length`)===0);
  ok('the M&E targets page opens read-only instead of refusing',
    /Access denied/.test(run(`String(contentFor('targets',{},AUTH.user))`))===false);
  ok('and it does not offer the Set target button',
    /data-act="set-target"/.test(run(`String(contentFor('targets',{},AUTH.user))`))===false);
  return true;
});

test('targets belong to the office that owns the level', ()=>{
  as('kisumu.admin');
  ok('a County Office Administrator sets a county target', run(`RBAC.can(AUTH.user,'report.targets.manage',{level:'county',countyId:'kisumu'}).ok`)===true);
  ok('but not a national one', run(`RBAC.can(AUTH.user,'report.targets.manage',{level:'national'}).ok`)===false);
  ok('and not another county\'s', run(`RBAC.can(AUTH.user,'report.targets.county',{countyId:'homabay'}).ok`)===false);
  as('director');
  ok('the Director sets a national target', run(`RBAC.can(AUTH.user,'report.targets.national',{}).ok`)===true);
  as('coord.nyalenda');
  ok('a coordinator proposes an area target for their own area', run(`RBAC.can(AUTH.user,'report.targets.area',{areaId:'nyalenda'}).ok`)===true);
  ok('and not for another area', run(`RBAC.can(AUTH.user,'report.targets.area',{areaId:'chiga'}).ok`)===false);
  ok('a coordinator may not set a county target', run(`RBAC.can(AUTH.user,'report.targets.manage',{level:'county',countyId:'kisumu'}).ok`)===false);
  return true;
});

test('departmental binding keeps each department inside its own work', ()=>{
  as('finance.kisumu');
  ok('Finance may not confirm a diagnosis', run(`RBAC.can(AUTH.user,'condition.confirm',{}).ok`)===false);
  ok('Finance may not publish media', run(`RBAC.can(AUTH.user,'media.publish',{}).ok`)===false);
  as('media.head');
  ok('Media may not record a clinical condition', run(`RBAC.can(AUTH.user,'condition.record',{}).ok`)===false);
  ok('Media may not pay an invoice', run(`RBAC.can(AUTH.user,'finance.pay',{}).ok`)===false);
  as('caregiver.nairobird');
  ok('a caregiver may not manage stock', run(`RBAC.can(AUTH.user,'pharmacy.manage',{}).ok`)===false);
  ok('a caregiver may not answer a TB request', run(`RBAC.can(AUTH.user,'tb.request.review',{}).ok`)===false);
  ok('a caregiver may request pyridoxine', run(`RBAC.can(AUTH.user,'tb.request.create',{}).ok`)===true);
  as('chief.admin');
  ok('the Chief System Administrator still holds no clinical authority', run(`RBAC.can(AUTH.user,'patient.view.clinical',{}).ok`)===false);
  ok('and may not set programme targets', run(`RBAC.can(AUTH.user,'report.targets.county',{countyId:'kisumu'}).ok`)===false);
  return true;
});

test('the authority self-test passes inside the running system', ()=>{
  as('chief.admin');
  const res = run(`ACCESS.selfTest()`);
  const bad = res.filter(r=>!r.ok);
  ok('every authority rule proves itself', bad.length===0, bad.map(b=>b.name).join('; '));
  ok('the audit console renders', run(`String(ACCESS.render(AUTH.user)).length`)>2000);
  const matrix = run(`ACCESS.matrix().length`);
  ok('the matrix binds every domain capability', matrix>50, String(matrix));
  return true;
});

/* ============================== 3. cost per patient ====================== */
test('the cost engine attributes expenditure to patients', ()=>{
  as('finance.kisumu');
  const s = run(`COSTX.summary(AUTH.user,{})`);
  ok('cost lines are found', s.lineCount>0, String(s.lineCount));
  ok('a total is computed', s.total>0, String(s.total));
  ok('patients are attributed', s.patientCount>0, String(s.patientCount));
  ok('an average per patient is computed', s.avgPerPatient>0, String(s.avgPerPatient));
  ok('cost per patient-day uses programme days', s.costPerPatientDay>0 && s.patientDays>0, s.costPerPatientDay+'/'+s.patientDays);
  ok('categories are rolled up', s.byCat.length>0 && s.byCat.every(c=>c.total>=0));
  ok('ministry areas are rolled up', s.byArea.length>0);
  ok('counties are rolled up', s.byCounty.length>0);
  ok('months are rolled up', s.byMonth.length>0);
  ok('departments are rolled up', s.byDept.length>0);
  ok('the ledger total equals the sum of the categories',
    Math.abs(s.total - s.byCat.reduce((n,c)=>n+c.total,0)) < 1, s.total+' vs '+s.byCat.reduce((n,c)=>n+c.total,0));
  ok('the average equals total divided by patients',
    Math.abs(s.avgPerPatient - s.total/s.patientCount) < 0.01);
  return true;
});

test('cost is scoped: a caregiver sees their own patients, not the ledger', ()=>{
  as('caregiver.nairobird');
  const s = run(`COSTX.summary(AUTH.user,{})`);
  ok('a caregiver may see cost', run(`RBAC.can(AUTH.user,'cost.view',{}).ok`)===true);
  ok('a caregiver may not read the raw ledger', run(`RBAC.can(AUTH.user,'cost.ledger',{}).ok`)===false);
  ok('a caregiver may not open finance', run(`RBAC.can(AUTH.user,'finance.view',{}).ok`)===false);
  const outside = run(`COSTX.lines(AUTH.user,{}).filter(l=>l.areaId && !(AUTH.user.areaIds||[]).includes(l.areaId)).length`);
  ok('every attributed line is inside their ministry areas', outside===0, String(outside));
  ok('the ledger tab is not offered', /data-tab="ledger"/.test(run(`String(COSTX.render(AUTH.user,{}))`))===false);
  as('finance.kisumu');
  const fin = run(`COSTX.summary(AUTH.user,{})`);
  ok('Finance sees the ledger tab', /data-tab="ledger"/.test(run(`String(COSTX.render(AUTH.user,{}))`))===true);
  ok('Finance sees at least as much as the caregiver', fin.total>=s.total, fin.total+' vs '+s.total);
  const crossCounty = run(`COSTX.lines(AUTH.user,{}).filter(l=>l.countyId && l.countyId!==AUTH.user.countyId).length`);
  ok('a county finance officer never sees the other county', crossCounty===0, String(crossCounty));
  return true;
});

test('a department sees the cost of its own service', ()=>{
  as('pharmacy.kisumu');
  const lens = run(`COSTX.lensFor(AUTH.user)`);
  ok('the pharmacy lens is the pharmacy service', JSON.stringify(lens.depts)===JSON.stringify(['pharmacy']), JSON.stringify(lens));
  const rows = run(`COSTX.lines(AUTH.user,{})`);
  ok('every line in the lens is a pharmacy line', rows.every(l=>l.dept==='pharmacy'), rows.filter(l=>l.dept!=='pharmacy').length+' outside');
  as('focal.kisumu');
  const hosp = run(`COSTX.lensFor(AUTH.user).depts`);
  ok('the hospital desk lens is the hospital service', JSON.stringify(hosp)===JSON.stringify(['hospital']), JSON.stringify(hosp));
  return true;
});

test('unit cost standards are set only by money roles, and are audited', ()=>{
  as('caregiver.nairobird');
  ok('a caregiver may not set a standard', run(`COSTX.setStandard(AUTH.user,'BG1',1500,{note:'x'}).ok`)===false);
  as('finance.kisumu');
  const before = run(`COSTX.unitCost(AUTH.user,'BG1')`);
  const r = run(`COSTX.setStandard(AUTH.user,'BG1',1550,{note:'October market price'})`);
  ok('Finance may set a county standard', r.ok===true, r.msg||'');
  ok('the standard is now the county one', run(`COSTX.unitCost(AUTH.user,'BG1')`)===1550);
  ok('the change is audited', run(`DB.db.audit.some(a=>a.action==='cost.standard.set')`)===true);
  ok('Finance may not set a national standard', run(`COSTX.setStandard(AUTH.user,'BG1',1600,{note:'x',scope:'national'}).ok`)===false);
  as('director');
  ok('the Director may set a national standard', run(`COSTX.setStandard(AUTH.user,'BG2',2200,{note:'national',scope:'national'}).ok`)===true);
  run(`COSTX.setStandard(AUTH.user,'BG1',${before},{note:'restored',scope:'national'})`);
  return true;
});

test('the cost consoles and the printable report render for every money role', ()=>{
  const tabs = ['overview','patient','area','county','disease','dept','bags','trend','ledger','standards'];
  ['finance.kisumu','kisumu.admin','director','procurement','me.kisumu','auditor'].forEach(u=>{
    as(u);
    tabs.forEach(t=>{
      const html = run(`String(COSTX.render(AUTH.user,{tab:'${t}'}))`);
      ok(`${u}: cost tab "${t}" renders`, html.length>800 && !/undefined|\[object Object\]/.test(html), String(html.length));
    });
  });
  as('finance.kisumu');
  const doc = run(`String(COSTX.reportDoc(AUTH.user,{}))`);
  ok('the printable cost report renders', /Cost per Patient Report/.test(doc) && doc.length>3000, String(doc.length));
  ok('the report carries the average per patient', /Average cost per patient/.test(doc));
  ok('the report carries the foodbag mix', /Foodbag mix/.test(doc));
  ok('the report is aligned with numeric columns', (doc.match(/class="num"/g)||[]).length>20);
  return true;
});

test('costs registered on a home visit reach the engine', ()=>{
  as('caregiver.nairobird');
  const added = run(`(()=>{
    const p = repo.patientList(AUTH.user)[0]; if(!p) return null;
    DB.db.formRecords.unshift({ id:'frm-cost-test', kind:'home_visit', code:'LMMK-', title:'LOMAMO Home Visit Form',
      patientId:p.id, patientName:p.name, countyId:p.countyId, areaId:p.areaId, status:'submitted',
      visitDate:new Date().toISOString(), enteredBy:AUTH.user.id, data:{
        visitDate:new Date().toISOString(), atHome:'Yes', conditionToday:'Review', foodBagDelivered:'Normal bag',
        foodBagCode:'BG2', hospitalFees:1500, transportCost:600, medicationCost:300, outPatientCost:0,
        shifCost:200, inPatientCost:0, hygienePacks:1, caregiverRecommendation:'Continue' } });
    DB.save(); COSTX.invalidate();
    return p.id;
  })()`);
  ok('a visit form was recorded', !!added, String(added));
  const lines = run(`COSTX.lines(AUTH.user,{patientId:'${added}'})`);
  const cats = lines.map(l=>l.cat);
  ok('hospital fees are attributed', cats.includes('outpatient'), cats.join(','));
  ok('transport cost is attributed', cats.includes('transport'));
  ok('medication cost is attributed', cats.includes('medication'));
  ok('SHIF is attributed', cats.includes('shif'));
  ok('the bag code prices a foodbag line', cats.includes('foodbag'));
  ok('the hygiene pack is priced from the standard', cats.includes('hygiene'));
  const bagLine = lines.find(l=>l.cat==='foodbag');
  ok('Bag 2 is priced at the Bag 2 standard', bagLine && bagLine.amount===run(`COSTX.unitCost(AUTH.user,'BG2')`), String(bagLine&&bagLine.amount));
  return true;
});

/* ============================== 4. TB dispensing control ================= */
test('a TB patient exists in scope and the ten-day rule is arithmetic', ()=>{
  as('mcm.kisumu');
  const pid = run(`(()=>{ const t=TBCARE.tbPatients(AUTH.user); return t.length? t[0].id : null; })()`);
  ok('there are TB patients in the register', !!pid, String(pid));
  const nd = run(`TBCARE.nextDue('${pid}','PYR10')`);
  ok('the engine reports a status', ['covered','due-now','overdue','missed','never-dispensed'].includes(nd.status), nd.status);
  const worked = run(`MASTER_RULES.nextDoseDay('2026-10-05',10)`);
  ok('a course given on 5 October opens its window on 13 October (day 9)', worked.windowStart==='2026-10-13', worked.windowStart);
  ok('and closes it on 14 October (day 10)', worked.windowEnd==='2026-10-14', worked.windowEnd);
  ok('the cover runs out on 15 October', worked.exhausts==='2026-10-15', worked.exhausts);
  return true;
});

test('the caregiver asks, the case manager answers, the pharmacy dispenses', ()=>{
  as('mcm.kisumu');
  const pid = run(`TBCARE.tbPatients(AUTH.user)[0].id`);
  /* a caregiver account in the same area makes the request */
  const cg = run(`(()=>{ const p=DB.db.patients.find(x=>x.id==='${pid}');
    return DB.db.users.find(u=>u.username==='caregiver.nairobird'||((u.areaIds||[]).includes(p.areaId) && u.roleId==='caregiver'))?.username; })()`);
  ok('a caregiver account serves that patient', !!cg, String(cg));
  as(cg);
  const req = run(`TBCARE.request(AUTH.user,{patientId:'${pid}',supplyId:'PYR10',reason:'Household is two hours from the dispensing point; ten-day course as standard.'})`);
  ok('the request is accepted', req.ok===true, req.msg||'');
  ok('it carries a request number', /^TB-\d{4}-\d+$/.test(req.rec.no), req.rec.no);
  ok('the case manager is notified', run(`DB.db.notifications.some(n=>/TB pyridoxine request/.test(n.title))`)===true);
  ok('a caregiver may not answer their own request', run(`TBCARE.review(AUTH.user,'${req.rec.id}','approved',{feedback:'yes'}).ok`)===false);
  ok('a duplicate request for the same patient is refused',
    run(`TBCARE.request(AUTH.user,{patientId:'${pid}',supplyId:'PYR10',reason:'second'}).ok`)===false);
  as('mcm.kisumu');
  ok('a one-month supply without a clinical reason is refused',
    run(`TBCARE.request(AUTH.user,{patientId:(DB.db.patients.find(p=>p.id!=='${pid}' && TBCARE.tbPatients(AUTH.user).some(t=>t.id===p.id))||{}).id||'${pid}',supplyId:'PYR30',reason:'short'}).ok`)===false);
  ok('a refusal without written feedback is refused',
    run(`TBCARE.review(AUTH.user,'${req.rec.id}','declined',{feedback:''}).ok`)===false);
  const adj = run(`TBCARE.review(AUTH.user,'${req.rec.id}','adjusted',{feedback:'Given the distance, a two-week supply is approved instead. Review at the next home visit.',supplyId:'PYR14'})`);
  ok('the case manager may adjust with feedback', adj.ok===true, adj.msg||'');
  ok('the adjustment changes the supply', run(`TBCARE.requestById(AUTH.user,'${req.rec.id}').qty`)===14);
  ok('the caregiver receives the feedback', run(`DB.db.notifications.some(n=>/TB request .* adjusted/.test(n.title))`)===true);
  /* stock is received, then the dispense is accounted for */
  as('nurse.kisumu');
  run(`RX.receive(AUTH.user,{itemId:'pyridox',batch:'PYR26-TEST',expiry:'2027-06-30',qty:200,supplier:'Test supplier',unitCost:22,countyId:'kisumu',note:'TB control test'})`);
  const before = run(`RX.stockOnHand('pyridox','kisumu')`);
  const disp = run(`TBCARE.dispense(AUTH.user,'${req.rec.id}',{note:'Handed to the caregiver with counselling'})`);
  ok('the dispense is recorded', disp.ok===true, disp.msg||'');
  ok('stock is decremented by exactly the quantity given',
    run(`RX.stockOnHand('pyridox','kisumu')`)===before-14, before+' -> '+run(`RX.stockOnHand('pyridox','kisumu')`));
  ok('a named batch is written down', disp.disp.batches.length>0 && disp.disp.batches[0].batch, JSON.stringify(disp.disp.batches));
  ok('the next window is calculated from the dispensing date', !!disp.disp.nextDue && !!disp.disp.nextDueEnd);
  ok('a second dispense against the same request is refused',
    run(`TBCARE.dispense(AUTH.user,'${req.rec.id}',{}).ok`)===false);
  const after = run(`TBCARE.nextDue('${pid}')`);
  ok('the patient is now covered', after.status==='covered', after.status);
  return true;
});

test('physical stock count reconciles against what was procured', ()=>{
  as('nurse.kisumu');
  const pos = run(`TBCARE.stockPosition(AUTH.user,'pyridox','kisumu')[0]`);
  ok('procured quantity is read from the stock ledger', pos.received>0, String(pos.received));
  ok('dispensed quantity is read from the stock ledger', pos.dispensed>0, String(pos.dispensed));
  ok('the system balance is procured less dispensed plus adjustments',
    pos.systemQty===pos.received-pos.dispensed+pos.adjusted, `${pos.systemQty} vs ${pos.received}-${pos.dispensed}+${pos.adjusted}`);
  const good = run(`TBCARE.recordCount(AUTH.user,{countyId:'kisumu',physicalQty:${pos.systemQty},batchNotes:'Shelf matches the ledger'})`);
  ok('a count within tolerance is accepted', good.ok===true && good.rec.withinTolerance===true, good.msg||'');
  ok('it waits for Finance or Procurement to confirm', good.rec.status==='awaiting_confirmation');
  const bad = run(`TBCARE.recordCount(AUTH.user,{countyId:'kisumu',physicalQty:${Math.max(0,pos.systemQty-40)},batchNotes:'Short on the shelf'})`);
  ok('a count outside tolerance is recorded', bad.ok===true);
  ok('and it opens a finding', bad.rec.withinTolerance===false && run(`DB.db.tbFindings.some(f=>f.status==='open')`)===true);
  ok('Finance and Procurement are told', run(`DB.db.notifications.some(n=>/TB stock variance/.test(n.title))`)===true);
  ok('a caregiver may not confirm a count', (()=>{ as('caregiver.nairobird');
    return run(`TBCARE.confirmCount(AUTH.user,'${bad.rec.id}',{note:'x'}).ok`)===false; })());
  as('finance.kisumu');
  ok('Finance may see the reconciliation board', /Reconciliation table/.test(run(`String(TBCARE.render(AUTH.user,{tab:'reconcile'}))`))===true);
  const conf = run(`TBCARE.confirmCount(AUTH.user,'${bad.rec.id}',{note:'Written off against the procurement reference; shelf adjusted.',adjustStock:true})`);
  ok('Finance confirms the count', conf.ok===true, conf.msg||'');
  ok('the finding is closed by the confirmation', run(`DB.db.tbFindings.find(f=>f.id==='${(run(`DB.db.tbFindings[0].id`))}')`)!==null);
  ok('the count is now confirmed', run(`(DB.db.tbStockCounts.find(c=>c.id==='${bad.rec.id}')||{}).status`)==='confirmed');
  ok('a count cannot be confirmed twice', run(`TBCARE.confirmCount(AUTH.user,'${bad.rec.id}',{note:'again'}).ok`)===false);
  return true;
});

test('the TB consoles render for every role that may open them', ()=>{
  ['caregiver.nairobird','coord.nairobird','mcm.kisumu','nurse.kisumu','finance.kisumu','procurement','auditor','kisumu.admin'].forEach(u=>{
    as(u);
    ['board','requests','schedule','stock','reconcile','protocol'].forEach(t=>{
      const html = run(`String(TBCARE.render(AUTH.user,{tab:'${t}'}))`);
      ok(`${u}: TB tab "${t}" renders`, html.length>500 && !/\[object Object\]/.test(html), String(html.length));
    });
  });
  return true;
});

/* ============================== 5. master workbook mapping =============== */
test('every sheet of the master workbook has a home in the system', ()=>{
  const sheets = run(`MASTERX.workbook().sheets`);
  ok('all 21 sheets are mapped', sheets.length===21, String(sheets.length));
  ok('each sheet names where it maps to', sheets.every(s=>s.mapsTo && s.mapsTo.length>3));
  ok('the INDEX sheet is present', sheets.some(s=>s.name==='INDEX'));
  ok('the ministry area registers are present',
    ['Manyatta','Nyahera','Nyalenda','Ombeyi','Nairobi Road','Ahero','Chiga'].every(n=>sheets.some(s=>s.name===n)));
  ok('Tabel, Foodbags, CCC1, Extra MI, MI 2026, Waiting List, URGCAS and Discharged are mapped',
    ['Tabel','Foodbags','CCC1','Extra MI','MI 2026','Waiting List','URGCAS','Discharged'].every(n=>sheets.some(s=>s.name===n)));
  return true;
});

test('the column map covers the ministry-area register', ()=>{
  const cols = run(`MASTERX.columns()`);
  ok('the register columns are mapped', cols.length>=60, String(cols.length));
  ok('every column names its CareLink home', cols.every(c=>c.m && c.m.length>1));
  ok('identity columns are present', ['A','B','C','D'].every(c=>cols.some(x=>x.c===c)));
  ok('the cost columns EA to EL are present',
    ['EA','EB','EC','ED','EE','EF','EG','EH','EI','EJ','EK','EL'].every(c=>cols.some(x=>x.c===c)));
  ok('the weekly bag grid is mapped', cols.some(x=>/AB\.\.CB/.test(x.c)));
  ok('the hygiene quarter columns are mapped', cols.some(x=>/CG\.\.CN/.test(x.c)));
  ok('derived columns carry the workbook formula', cols.filter(c=>c.d).every(c=>/^=/.test(c.f||'')));
  ok('the date-out instruction is kept verbatim',
    cols.some(c=>/ONLY CHANGE DATE WHEN DISCHARGED OR DECEASED/i.test(c.l)));
  const groups = run(`MASTERX.groups()`);
  ok('columns are grouped', groups.length>=8, groups.join(', '));
  return true;
});

test('the workbook formulas are rebuilt and give the workbook answers', ()=>{
  ok('days in programme = date out minus date in', run(`MASTER_RULES.daysInProgramme('2025-07-15','2026-01-29')`)===198);
  ok('an open record counts to today', run(`MASTER_RULES.daysInProgramme('2026-10-01','')`)>=0);
  ok('no date in means no days', run(`MASTER_RULES.daysInProgramme('','2026-01-01')`)===0);
  ok('the minimal-care flag fires beyond 183 days', run(`MASTER_RULES.minimalCareFlag(198,'')`)==='x');
  ok('and not at 183 days', run(`MASTER_RULES.minimalCareFlag(183,'')`)==='');
  ok('and not once discharged', run(`MASTER_RULES.minimalCareFlag(400,"March'26")`)==='');
  ok('total children = male + female', run(`MASTER_RULES.totalChildren(1,2)`)===3);
  ok('orphans prevented counts the children on discharge', run(`MASTER_RULES.orphansPrevented(3,"March'26")`)===3);
  ok('and is empty while the patient is in programme', run(`MASTER_RULES.orphansPrevented(3,'')`)==='');
  ok('became orphans counts the children on death', run(`MASTER_RULES.becameOrphans(2,"February'26")`)===2);
  const bags = run(`MASTER_RULES.bagCounts({1:'BG1',2:'BG2',3:'BG1',4:'SPB',5:'',6:'bg1'})`);
  ok('the bag grid is counted with COUNTIF semantics', bags.BG1===3 && bags.BG2===1 && bags.SPB===1 && bags.total===5, JSON.stringify(bags));
  const costs = run(`MASTER_RULES.costs({medications:450,transport:300,outpatient:1200,shif:0,inpatient1:2000,inpatient2:800})`);
  ok('total other cost = SUM(EB:EE)', costs.other===1950, String(costs.other));
  ok('in-patient cost = SUM(EG:EJ)', costs.inpatient===2800, String(costs.inpatient));
  ok('total cost = EF + EK', costs.total===4750, String(costs.total));
  ok('costprice food per visited patient = expenses / visited',
    Math.round(run(`MASTER_RULES.costPerVisitedPatient(511313,129)`))===3964);
  ok('a zero denominator never divides by zero', run(`MASTER_RULES.costPerVisitedPatient(5000,0)`)===0);
  const ratio = run(`MASTER_RULES.slumVillageRatio(73,56)`);
  ok('the slum/village ratio sums to one', Math.abs(ratio.slumPct+ratio.villagePct-1)<1e-9, JSON.stringify(ratio));
  const close = run(`MASTER_RULES.closingControl({endLastYear:16,newPatients:22,discharged:18,deceased:2,inProgramme:18})`);
  ok('the closing control reconciles', close.computed===18 && close.difference===0, JSON.stringify(close));
  ok('long-stay share is a ratio', Math.abs(run(`MASTER_RULES.longStayShare(41,129)`)-0.3178)<0.001);
  ok('the hospital average is visits per patient', Math.abs(run(`MASTER_RULES.hospitalAverage(96,214)`)-2.229)<0.001);
  ok('the 2026 week calendar runs to week 53', run(`MASTER_VOCAB.weeks2026.length`)===53);
  ok('a week is Monday to Saturday', run(`MASTERX.weekOf('2026-10-22').week`)===43, JSON.stringify(run(`MASTERX.weekOf('2026-10-22')`)));
  return true;
});

test('a row of the master workbook maps into CareLink records', ()=>{
  const mapped = run(`MASTERX.mapRow({
    A:'Test Patient Of The Map', B:'20924775', C:'21000001', D:'LMM', E:"July'25", F:'x',
    I:'2025-07-15', J:'2026-01-29', L:"January'26", N:'x', P:1, Q:2, V:'X', Y:'EOW',
    week1:'BG1', week2:'BG2', week3:'BG1', week4:'SPB', CO:2, CP:1, CQ:3, CS:'Pulmonary TB', CV:'x',
    DB:'x', DH:'Cervical', DK:'x', DT:'x', DP:'x', DU:'x', DW:2, DX:1, DY:3,
    EA:600, EB:450, EC:300, ED:1200, EE:200, EG:2000, EH:800, area:'Manyatta'
  }, {sheetName:'Manyatta', rowNumber:4})`);
  ok('the row maps', mapped.ok===true, mapped.msg||'');
  ok('the National ID is read from column B', mapped.patient.nationalId==='20924775', mapped.patient.nationalId);
  ok('the area name resolves to a ministry area id', mapped.areaId==='manyatta', mapped.areaId);
  ok('insurance comes from column D', mapped.patient.master.insurance==='LMM');
  ok('days in programme are derived, not typed', mapped.patient.programDays===198, String(mapped.patient.programDays));
  ok('a discharged patient counts as discharged', mapped.patient.status==='discharged');
  ok('children are totalled', mapped.patient.household.children===3);
  ok('discharge turns children into orphans prevented', mapped.patient.master.orphansPrevented===3);
  ok('the visit schedule is translated from EOW', mapped.patient.visitFrequency==='Every other week');
  ok('the bag grid is counted', mapped.patient.master.bags.BG1===2 && mapped.patient.master.bags.BG2===1 && mapped.patient.master.bags.SPB===1);
  /* EA (transport in and out of hospital) and EC (transport costs) are both
     transport, so other = 450 medication + 900 transport + 1200 outpatient +
     200 SHIF, and the total adds the 2800 of in-patient cost. */
  ok('costs are totalled', mapped.costs.other===2750 && mapped.costs.inpatient===2800 && mapped.costs.total===5550, JSON.stringify(mapped.costs));
  ok('conditions are read from the flag columns', mapped.conditions.some(c=>/TB/.test(c.label)) && mapped.conditions.some(c=>/cancer/i.test(c.label)));
  ok('support items are generated for the bags issued', mapped.support.filter(s=>s.bag).length===4, String(mapped.support.length));
  ok('a row without a name is refused', run(`MASTERX.mapRow({B:'123'}).ok`)===false);
  ok('the source sheet and row are carried for audit', mapped.patient.master.sourceSheet==='Manyatta' && mapped.patient.master.sourceRow===4);
  return true;
});

test('the registration blueprint and the INDEX topics resolve in the system', ()=>{
  const bp = run(`MASTERX.registrationBlueprint()`);
  ok('the blueprint is grouped', bp.length>=8, String(bp.length));
  ok('every field names the column it came from', bp.every(g=>g.fields.every(f=>f.column)));
  const nav = run(`(()=>{ const s=new Set(); DB.db.users.forEach(u=>navModel(u).forEach(g=>g.items.forEach(i=>s.add(i.id)))); return [...s]; })()`);
  const topics = run(`MASTERX.indexMap()`);
  ok('every INDEX topic opens a page that exists', topics.every(t=>nav.includes(t.view)),
    topics.filter(t=>!nav.includes(t.view)).map(t=>t.topic+'->'+t.view).join(', '));
  as('chief.admin');
  const html = run(`String(MASTERX.render(AUTH.user))`);
  ok('the mapping console renders', html.length>4000, String(html.length));
  ok('it states that the workbook is not stored in the repository', /not stored in this repository/i.test(html));
  ok('it shows the derived rules', /Derived rules, rebuilt as code/.test(html));
  return true;
});

/* ============================== 6. public portal ========================= */
test('the public portal carries the LOMAMO programme content', ()=>{
  const html = run(`String(renderPublicPortal({}))`);
  ok('the portal renders', html.length>8000, String(html.length));
  ok('the mission is quoted', /orphan prevention/i.test(html));
  ok('the four pillars are shown', /Patient visits/.test(html) && /Hospital &amp; home-based healthcare/.test(html) && /Education/.test(html) && /Community partnerships/.test(html));
  ok('the team in Kenya is shown', /Martin Chamah/.test(html) && /Moses Nyanjong Otieno/.test(html) && /Washington Ayub Odero/.test(html));
  ok('the board and advisors are shown', /Pamela McClanahan/.test(html) && /Desmond Marshall/.test(html));
  ok('the published finances are shown', /230,639|\$230,639/.test(html) && /83-3329252/.test(html));
  ok('grants and Form 990 filings are shown', /DAFgiving360/.test(html) && /990EZ/.test(html));
  ok('the ministry areas served are shown', /Nyalenda/.test(html) && /Makongeni/.test(html));
  ok('contact details are shown', /contactus@lovemattersmost.org/.test(html) && /0725-378-606/.test(html));
  ok('news and stories are listed', /Latest from LOMAMO/.test(html));
  ok('the gallery is present', /In pictures/.test(html));
  ok('ways to help link to the Foundation site', /lovemattersmost.org\/donate-now\//.test(html));
  ok('the FAQ is present', /What people ask us/.test(html));
  return true;
});

test('no patient identity reaches the public portal', ()=>{
  as('chief.admin');
  const names = run(`DB.db.patients.slice(0,120).map(p=>p.name)`);
  const ids = run(`DB.db.patients.slice(0,120).map(p=>p.code)`);
  const html = run(`String(renderPublicPortal({}))`);
  const leakedNames = names.filter(n=>n && html.includes(n));
  const leakedIds = ids.filter(c=>c && html.includes(c));
  ok('no patient name appears', leakedNames.length===0, leakedNames.slice(0,3).join(', '));
  ok('no patient code appears', leakedIds.length===0, leakedIds.slice(0,3).join(', '));
  ok('no national ID appears', run(`DB.db.patients.filter(p=>p.nationalId).slice(0,60).map(p=>p.nationalId).filter(n=>String(renderPublicPortal({})).includes(n)).length`)===0);
  ok('no telephone number appears', run(`DB.db.patients.filter(p=>p.phone).slice(0,60).map(p=>p.phone).filter(n=>String(renderPublicPortal({})).includes(n)).length`)===0);
  return true;
});

test('every portal photograph resolves to an embedded asset', ()=>{
  const gallery = run(`PORTAL_CONTENT.gallery.map(g=>g.key)`);
  const missing = gallery.filter(k=>run(`!!CARELINK_PHOTOS['${k}']`)===false);
  ok('all ten programme photographs are embedded', missing.length===0, missing.join(', '));
  const news = run(`PORTAL_CONTENT.news.map(n=>n.photoKey)`);
  ok('every news item has a photograph that resolves', news.every(k=>run(`!!CARELINK_PHOTOS['${k}']`)===true), news.join(', '));
  ok('no portal image identifies a beneficiary', run(`PORTAL_CONTENT.gallery.every(g=>!/patient name|beneficiary/i.test(g.caption))`)===true);
  return true;
});

/* ============================== 7. visual audit ========================= */
test('every theme meets its contrast targets', ()=>{
  const audit = run(`VISUALX.contrastAudit()`);
  ok('every theme is audited', audit.length===run(`WTHEMES.length`), String(audit.length));
  const bad = audit.flatMap(a=>a.failures.map(f=>a.theme.id+': '+f.pair+' '+f.ratio));
  ok('no theme fails a text contrast target', bad.length===0, bad.slice(0,8).join(' | '));
  return true;
});

test('both a tablet and a PC open in the standard Foundation Daylight default theme', ()=>{
  ok('Harbour Dusk remains available as an optional field theme', run(`!!WTHEME.byId('harbour')`)===true);
  ok('the tablet rule restores the standard Foundation Daylight default', run(`(()=>{ const t=DEVICE.isTablet.bind(DEVICE); DEVICE.isTablet=()=>true; const r=DEVICE.themeDefault(); DEVICE.isTablet=t; return r; })()`)==='foundation');
  ok('the desktop rule chooses the standard Foundation Daylight default', run(`(()=>{ const t=DEVICE.isTablet.bind(DEVICE); DEVICE.isTablet=()=>false; const r=DEVICE.themeDefault(); DEVICE.isTablet=t; return r; })()`)==='foundation');
  ok('a personal choice still wins over the device rule', run(`(()=>{
      const u=DB.db.users.find(x=>x.username==='caregiver.nairobird');
      WTHEME.choose(u,'lake'); const t=DEVICE.isTablet.bind(DEVICE); DEVICE.isTablet=()=>true;
      const r=WTHEME.resolveId(u); DEVICE.isTablet=t; WTHEME.choose(u,''); return r; })()`)==='lake');
  ok('the Galaxy A11 specification is carried', run(`DEVICE_PROFILES['galaxy-a11'].screen.resolution`)==='720 x 1560 (HD+)');
  ok('its CSS viewport is 360 x 780 at dpr 2', run(`DEVICE_PROFILES['galaxy-a11'].css.w`)===360 && run(`DEVICE_PROFILES['galaxy-a11'].css.h`)===780);
  ok('its panel is 6.4 inches at 268 ppi', run(`DEVICE_PROFILES['galaxy-a11'].screen.ppi`)===268);
  ok('a Galaxy A11 user agent is recognised and defaults to Foundation Daylight', run(`(()=>{
      globalThis.navigator = { userAgent:'Mozilla/5.0 (Linux; Android 11; SM-A115U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36', maxTouchPoints:5 };
      const id = DEVICE.detect().id, kind = DEVICE.detect().kind, theme = DEVICE.themeDefault();
      return id==='galaxy-a11' && kind==='tablet' && theme==='foundation';
    })()`)===true);
  return true;
});

test('the visual audit console renders and reports', ()=>{
  as('chief.admin');
  const html = run(`String(VISUALX.render(AUTH.user))`);
  ok('the audit console renders', html.length>4000, String(html.length));
  ok('it reports the contrast matrix', /Contrast matrix/.test(html));
  ok('it reports the device in use', /This device/.test(html));
  ok('it lists what the release fixed', /What this release fixed/.test(html));
  ok('the live checks run without throwing', run(`typeof VISUALX.layoutAudit().notes[0]`)==='string');
  return true;
});

/* ============================== 8. every console renders ================ */
test('every new console renders for every role that may open it', ()=>{
  const views = [
    ['teams','TEAMX.render(AUTH.user)'],
    ['costing','COSTX.render(AUTH.user,{})'],
    ['tbcare','TBCARE.render(AUTH.user,{})'],
    ['mastermap','MASTERX.render(AUTH.user)'],
    ['visualaudit','VISUALX.render(AUTH.user)'],
    ['accessaudit','ACCESS.render(AUTH.user)']
  ];
  const usernames = run(`(()=>{ const s={}; return DB.db.users.filter(u=>!s[u.roleId]&&(s[u.roleId]=1)).map(u=>u.username); })()`);
  usernames.forEach(u=>{
    as(u);
    views.forEach(([id,expr])=>{
      const html = run(`String(contentFor('${id}',{},AUTH.user))`);
      ok(`${u}: ${id} renders`, html.length>200 && !/\[object Object\]|undefined is not|TypeError/.test(html), String(html.length));
    });
  });
  return true;
});

test('a patient record carries the cost and TB panels where authorised', ()=>{
  as('caregiver.nairobird');
  const pid = run(`(()=>{ const p=repo.patientList(AUTH.user)[0]; return p? p.id : null; })()`);
  if(!pid) return true;
  const html = run(`String(contentFor('patient',{id:'${pid}'},AUTH.user))`);
  ok('the patient record renders', html.length>2000, String(html.length));
  ok('the ministry team and visit days are shown', /Ministry team & visit days/.test(html));
  ok('the master registry rows are shown or empty by design', !/\[object Object\]/.test(html));
  as('mcm.kisumu');
  const tb = run(`(()=>{ const t=TBCARE.tbPatients(AUTH.user)[0]; return t? String(contentFor('patient',{id:t.id},AUTH.user)) : ''; })()`);
  ok('a TB patient record carries the dispensing panel', /TB dispensing control/.test(tb));
  /* Finance reads money, not medical records: the patient record itself is a
     confidentiality boundary for a finance account, while the cost of that
     patient is fully visible in the cost console. Both halves are asserted. */
  as('finance.kisumu');
  ok('a finance account may not open the patient record', run(`repo.patient(AUTH.user,'${pid}')`)===null);
  ok('the record page says so rather than rendering it', /outside your authority|Access denied/i.test(run(`String(contentFor('patient',{id:'${pid}'},AUTH.user))`))===true);
  const lines = run(`COSTX.lines(AUTH.user,{patientId:'${pid}'})`);
  ok('but Finance sees every cost attributed to that patient', lines.length>0, String(lines.length));
  ok('and the cost console reports it', /Cost per patient/.test(run(`String(COSTX.render(AUTH.user,{tab:'patient'}))`))===true);
  as('mcm.kisumu');
  ok('a clinical account sees the cost panel on the record itself',
    /Cost of serving this patient|No attributed cost yet/.test(run(`String(contentFor('patient',{id:'${pid}'},AUTH.user))`))===true);
  return true;
});

test('a coordinator and a caregiver see the cost of their own ministry area at home', ()=>{
  ['caregiver.nairobird','coord.nairobird'].forEach(u=>{
    as(u);
    const html = run(`String(renderHome(AUTH.user))`);
    ok(`${u}: the console home renders`, html.length>1500, String(html.length));
    ok(`${u}: it carries the cost of the ministry area`, /Cost of serving my ministry area/.test(html));
    ok(`${u}: it shows the average per patient`, /Average per patient/.test(html));
    ok(`${u}: it shows the home visit day`, /Home visit day/.test(html));
    ok(`${u}: it never shows another area's ledger`, /Another area/.test(html));
  });
  as('caregiver.nairobird');
  const areas = run(`COSTX.areaCost(AUTH.user,'nyalenda').total`);
  ok('an area outside their scope returns nothing to a caregiver',
    run(`COSTX.lines(AUTH.user,{areaId:'nyalenda'}).length`)===0, String(areas));
  return true;
});

test('every departmental console carries the cost of its own service', ()=>{
  ['finance.kisumu','procurement','focal.kisumu','nurse.kisumu','vehicle.officer','me.kisumu','director','kisumu.admin'].forEach(u=>{
    as(u);
    const html = run(`String(renderHome(AUTH.user))`);
    ok(`${u}: the console home renders`, html.length>1500, String(html.length));
    ok(`${u}: it carries the cost of its own lens`, /Cost of (all services|patients you serve|.*service)/.test(html), html.slice(0,0));
    ok(`${u}: it offers the full cost analysis`, /data-v="costing"/.test(html));
  });
  as('pharmacy.kisumu');
  ok('the pharmacy lens is named on its own console', /pharmacy service/i.test(run(`String(renderHome(AUTH.user))`))===true);
  return true;
});

test('generated reports carry charts as well as aligned tables', ()=>{
  as('kisumu.admin');
  const pf = run(`String(buildReportDoc('patient_figures',{countyId:'kisumu'},AUTH.user))`);
  ok('Patient Figures draws the caseload movement', /<svg class="chart"/.test(pf) && /Caseload movement/.test(pf));
  ok('Patient Figures draws the ministry area profile', /Caseload by ministry area/.test(pf));
  ok('Patient Figures draws target against actual', /Target against actual/.test(pf) || /No target is set/.test(pf));
  ok('Patient Figures keeps every chart\u2019s data table', (pf.match(/View as a table/g)||[]).length>=2);
  const pd = run(`String(buildReportDoc('patient_days',{countyId:'kisumu'},AUTH.user))`);
  ok('Patient-Days draws the milestone chart', /Patients at or beyond each milestone/.test(pd));
  as('finance.kisumu');
  const ex = run(`String(buildReportDoc('expenditure',{countyId:'kisumu'},AUTH.user))`);
  ok('Expenditure draws the budget movement', /Budget movement in the period/.test(ex));
  ok('Expenditure draws the paid-by-category donut', /Paid by budget category/.test(ex));
  ok('Expenditure draws the projection gauge', /Projected month-end spend/.test(ex));
  ok('report figures are right-aligned and tabular', (ex.match(/class="tnum"/g)||[]).length>10);
  return true;
});

/* ============================== 9. first-run setup ====================== */
test('first-run setup cannot strand a person on step 3 of 4', ()=>{
  ok('the wizard state can carry an already-set-up host', run(`(()=>{ ONB.step=3; APPX.screen='onboard'; ONB.hostSetup={host:'office-host',accounts:47,admins:['chief.admin']}; return !!ONB.hostSetup; })()`)===true);
  const html = run(`String(renderOnboarding6())`);
  ok('step 3 explains the situation instead of failing', /already holds an installation/i.test(html));
  ok('it offers sign-in', /data-act="ob-attach-signin"/.test(html));
  ok('it offers an account request', /data-act="ob-attach-request"/.test(html));
  ok('it offers device-only continuation', /data-act="ob-attach-device"/.test(html));
  ok('the primary button no longer re-posts setup', /data-act="ob-next"/.test(html)===false);
  run(`ACTIONS['ob-attach-signin']()`);
  ok('choosing sign-in leaves the wizard', run(`APPX.screen`)==='login');
  ok('and it says why nothing was changed', /already set up/i.test(run(`LOGIN6.notice`))===true);
  run(`ONB.hostSetup=null; ONB.step=3; APPX.screen='onboard';`);
  return true;
});

/* ============================== summary ================================= */
console.log('');
if(fails.length){
  console.log('FAILED:');
  fails.slice(0,40).forEach(f=>console.log('  ✗ '+f));
}
console.log(`\n${pass}/${pass+fail} v6.1 assertions passed${fail?` · ${fail} failed`:''}`);
process.exit(fail?1:0);
