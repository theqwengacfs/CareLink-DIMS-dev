/* v6.2 · Acceptance suite for the second increment.

   Proves the four things this increment added, and the rename:

     1  The product is LOMAMO C-DIMS, with its former name recorded.
     2  Households and cross-account care chains: the workbook links people
        (column C, "Spouses ID") and implies a chain of accounts; both are now
        explicit, scoped and probed per record.
     3  The two registers the workbook keeps that had no home: the Waiting List
        (name, telephone, date on the list, reason) and URGCAS (name, what,
        costs, budget, month total, running year total).
     4  The workbook's analysis layer: rows 152-160 per area, both duration-band
        schemes, the slum/village ratio, cost per visited patient, the multi-year
        series, the configurable programme year, and the source-integrity
        register that records every broken cell in the source and what this
        system computes instead.
*/
const {makeCtx}=require('./dom');
const {run}=makeCtx();
run('DB.load(); DB.seedOfficial({patients:600});');
run(`AUTH.logout(); AUTH.login('chief.admin','LOMAMO2026');`);

let pass=0, fail=0; const fails=[];
function ok(name, cond, detail){ if(cond){ pass++; } else { fail++; fails.push(name+(detail?(' — '+detail):'')); } }
function test(name, fn){ try{ const r=fn(); if(r===false) throw new Error('returned false'); ok(name,true); } catch(e){ ok(name,false,e.message); } }
const as = u => { run(`AUTH.logout(); AUTH.login('${u}','LOMAMO2026');`); return run(`AUTH.user.id`); };

/* ============================== 1. the CareLink OS identity ============================ */
test('the Operating System is CareLink and the browser tab title is CareLink C-DIMS', ()=>{
  ok('APP.name is CareLink', run(`APP.name`)==='CareLink', run(`APP.name`));
  ok('APP.tabTitle is CareLink C-DIMS', run(`APP.tabTitle`)==='CareLink C-DIMS', run(`APP.tabTitle`));
  ok('the short name is CareLink', run(`APP.shortName`)==='CareLink');
  ok('the former name is kept so old documents still resolve', run(`APP.formerName`)==='LOMAMO C-DIMS');
  ok('the full name carries CareLink C-DIMS', /CareLink C-DIMS/.test(run(`APP.full`)), run(`APP.full`));
  const fs=require('fs');
  const bundle=fs.readFileSync(require('path').join(__dirname,'..','..','public','carelink-v6.html'),'utf8');
  ok('the shipped bundle is titled CareLink C-DIMS', /<title>CareLink C-DIMS<\/title>/.test(bundle),
    (bundle.match(/<title>[^<]*<\/title>/)||[''])[0]);
  ok('the bundle records the former name deliberately', /formerly LOMAMO C-DIMS/.test(bundle));
  const idx=fs.readFileSync(require('path').join(__dirname,'..','..','index.html'),'utf8');
  ok('the site entry page is titled CareLink C-DIMS', /<title>CareLink C-DIMS<\/title>/.test(idx));
  return true;
});

/* ============================== 2. households & care chains ============== */
test('a spouse ID links two records in either direction', ()=>{
  as('kisumu.admin');
  const pair = run(`(()=>{
    const ps = DB.db.patients.filter(p=>p.countyId==='kisumu');
    const a = ps[0], b = ps[1];
    a.nationalId = 'SP-TEST-0001'; b.nationalId='SP-TEST-0002';
    a.master = a.master||{}; b.master = b.master||{};
    a.master.spouseId = 'SP-TEST-0002';      /* column C of A names column B of B */
    b.master.spouseId = 'SP-TEST-0001';
    DB.save();
    return { a:a.id, b:b.id, an:a.name, bn:b.name };
  })()`);
  const links = run(`HOUSEHOLD.linksFor('${pair.a}').map(l=>l.patient.id)`);
  ok('A is linked to B', links.includes(pair.b), links.join(','));
  ok('and B is linked to A', run(`HOUSEHOLD.linksFor('${pair.b}').map(l=>l.patient.id)`).includes(pair.a));
  ok('the evidence names the column that made the link',
    /spouse ID/i.test(run(`HOUSEHOLD.linksFor('${pair.a}')[0].evidence`)), run(`HOUSEHOLD.linksFor('${pair.a}')[0].evidence`));
  const members = run(`HOUSEHOLD.members(AUTH.user,'${pair.a}').length`);
  ok('the household has exactly two members', members===2, String(members));
  const c = run(`HOUSEHOLD.combined(AUTH.user,'${pair.a}')`);
  ok('children are combined across the household', c.children >= 0 && c.memberCount===2, JSON.stringify([c.children,c.memberCount]));
  ok('orphans prevented are combined', c.prevented>=0);
  ok('programme days are combined', c.days>0, String(c.days));
  return true;
});

test('the same guardian in the same village is one household', ()=>{
  as('kisumu.admin');
  const r = run(`(()=>{
    const ps = DB.db.patients.filter(p=>p.countyId==='kisumu' && p.areaId==='nyalenda');
    const a=ps[10], b=ps[11];
    a.household = a.household||{}; b.household = b.household||{};
    a.household.guardian='Test Guardian One'; a.household.village='Test Village';
    b.household.guardian='Test Guardian One'; b.household.village='Test Village';
    DB.save();
    return HOUSEHOLD.linksFor(a.id).some(l=>l.patient.id===b.id && l.kind==='guardian');
  })()`);
  ok('a shared guardian in one village links the records', r===true);
  return true;
});

test('a shared National ID is routed to duplicate review, not merged as a household', ()=>{
  as('kisumu.admin');
  const r = run(`(()=>{
    const ps = DB.db.patients.filter(p=>p.countyId==='kisumu');
    ps[20].nationalId='DUP-TEST-99'; ps[21].nationalId='DUP-TEST-99'; DB.save();
    const l = HOUSEHOLD.linksFor(ps[20].id).find(x=>x.patient.id===ps[21].id);
    return l? l.evidence : '';
  })()`);
  ok('the link says it is a duplicate identity to review', /Same National ID/.test(r), r);
  return true;
});

test('linking and unlinking are governed and audited', ()=>{
  as('caregiver.nairobird');
  const ids = run(`(()=>{const p=repo.patientList(AUTH.user); return [p[0].id,p[1].id];})()`);
  ok('a caregiver may not link household records',
    run(`HOUSEHOLD.link(AUTH.user,'${ids[0]}','${ids[1]}','spouse','test reason').ok`)===false);
  as('kisumu.admin');
  ok('a record cannot be linked to itself', run(`HOUSEHOLD.link(AUTH.user,'${ids[0]}','${ids[0]}','spouse','x').ok`)===false);
  ok('a link needs a reason from the controlled list', run(`HOUSEHOLD.link(AUTH.user,'${ids[0]}','${ids[1]}','nonsense','x').ok`)===false);
  ok('a link needs a written reason', run(`HOUSEHOLD.link(AUTH.user,'${ids[0]}','${ids[1]}','manual','').ok`)===false);
  const linked = run(`HOUSEHOLD.link(AUTH.user,'${ids[0]}','${ids[1]}','manual','Administration confirmed one household at the Monday meeting')`);
  ok('Administration may link with a reason', linked.ok===true, linked.msg||'');
  ok('the link is audited', run(`DB.db.audit.some(a=>a.action==='household.linked')`)===true);
  ok('a duplicate link is refused', run(`HOUSEHOLD.link(AUTH.user,'${ids[0]}','${ids[1]}','manual','again').ok`)===false);
  ok('unlinking needs a reason', run(`HOUSEHOLD.unlink(AUTH.user,'${linked.rec.id}','').ok`)===false);
  ok('unlinking works and is audited', run(`HOUSEHOLD.unlink(AUTH.user,'${linked.rec.id}','Linked in error').ok`)===true
    && run(`DB.db.audit.some(a=>a.action==='household.unlinked')`)===true);
  return true;
});

test('the care chain is probed against the record, not against the job title', ()=>{
  as('kisumu.admin');
  const pid = run(`(()=>{const p=DB.db.patients.find(x=>x.areaId==='nairobird'); return p.id;})()`);
  const chain = run(`HOUSEHOLD.careChain(AUTH.user,'${pid}')`);
  ok('the chain lists the seats around this patient', chain.length>=6, String(chain.length));
  const seats = chain.map(c=>c.seat);
  ok('it names the assigned caregiver', seats.some(s=>/Assigned caregiver/.test(s)), seats.join(', '));
  ok('it names the ministry area coordinator', seats.some(s=>/coordinator/.test(s)));
  ok('it names the Medical Case Manager', seats.some(s=>/Medical Case Manager/.test(s)));
  ok('it names Finance', seats.some(s=>/Finance Officer/.test(s)));
  const cg = chain.find(c=>/Assigned caregiver/.test(c.seat));
  const fin = chain.find(c=>/Finance Officer/.test(c.seat));
  ok('the caregiver may record a home visit on this record', cg && cg.may.includes('Record a home visit'), JSON.stringify(cg&&cg.may));
  ok('the caregiver may NOT approve a discharge on this record', cg && !cg.may.includes('Approve discharge'));
  ok('Finance may see the cost but not open the record', fin && fin.may.includes('See the cost of this patient') && !fin.may.includes('Open the record'), JSON.stringify(fin&&fin.may));
  ok('every seat lists what is refused here too', chain.every(c=>Array.isArray(c.refused)));
  ok('field days are carried on the chain', chain.some(c=>c.visitDays && c.visitDays!=='Not yet fixed'));
  return true;
});

test('households are scoped like every other patient read', ()=>{
  as('caregiver.nairobird');
  const outside = run(`HOUSEHOLD.households(AUTH.user,{}).filter(h=>h.members.some(m=>!(AUTH.user.areaIds||[]).includes(m.areaId))).length`);
  ok('a caregiver sees no household outside their areas', outside===0, String(outside));
  ok('the household console renders', run(`String(HOUSEHOLD.render(AUTH.user,{})).length`)>1500);
  ok('the patient record carries the household panel',
    /Household & cross-account care chain/.test(run(`(()=>{const p=repo.patientList(AUTH.user)[0]; return p? String(contentFor('patient',{id:p.id},AUTH.user)) : 'Household & cross-account care chain';})()`)));
  return true;
});

/* ============================== 3. waiting list ========================== */
test('the waiting list keeps the workbook columns and its own reasons', ()=>{
  ok('the reason vocabulary is the workbook\u2019s', run(`WAITLIST.reasons().some(r=>/balancing versus budget/i.test(r.label))`)===true);
  ok('it carries the intake-balancing reason', run(`WAITLIST.reasons().some(r=>/monthly intake/i.test(r.label))`)===true);
  ok('it carries the relocation reason', run(`WAITLIST.reasons().some(r=>/Relocated to the village/i.test(r.label))`)===true);
  as('coord.nairobird');
  ok('a coordinator may add to the list', run(`WAITLIST.add(AUTH.user,{name:'Test Household One',phone:'0700000001',areaId:'nairobird',reason:'budget',note:'Balancing against the October budget',household:3}).ok`)===true);
  ok('a name is required', run(`WAITLIST.add(AUTH.user,{name:'',areaId:'nairobird',reason:'budget'}).ok`)===false);
  ok('a reason is required', run(`WAITLIST.add(AUTH.user,{name:'Test Two',areaId:'nairobird',reason:''}).ok`)===false);
  ok('an "other" reason must be written out', run(`WAITLIST.add(AUTH.user,{name:'Test Three',areaId:'nairobird',reason:'other',note:'x'}).ok`)===false);
  ok('a duplicate on the list is refused', run(`WAITLIST.add(AUTH.user,{name:'Test Household One',areaId:'nairobird',reason:'budget'}).ok`)===false);
  ok('the entry is audited', run(`DB.db.audit.some(a=>a.action==='waiting.added')`)===true);
  const rows = run(`WAITLIST.rows(AUTH.user,{})`);
  ok('the entry is listed with days waiting', rows.length>0 && rows[0].daysWaiting>=0, JSON.stringify(rows[0]&&rows[0].daysWaiting));
  return true;
});

test('promotion carries the household into an assessment without retyping', ()=>{
  as('caregiver.nairobird');
  const id = run(`WAITLIST.rows(AUTH.user,{}).find(r=>r.status==='waiting' && r.name==='Test Household One').id`);
  const r = run(`WAITLIST.promote(AUTH.user,'${id}',{plannedDays:180})`);
  ok('promotion succeeds', r.ok===true, r.msg||'');
  ok('the name is carried', r.patient.name==='Test Household One', r.patient.name);
  ok('the telephone number is carried', r.patient.phone==='0700000001', r.patient.phone);
  ok('the ministry area is carried', r.patient.areaId==='nairobird');
  ok('the household size is carried', r.patient.household.children===3, String(r.patient.household.children));
  ok('the days waited stay on the record', r.patient.master.daysOnWaitingList>=0, String(r.patient.master.daysOnWaitingList));
  ok('the waiting reason stays on the record', /balancing versus budget/i.test(r.patient.master.waitingReason), r.patient.master.waitingReason);
  ok('the record starts as an initiated assessment', r.patient.status==='assessment_initiated');
  ok('promoting twice is refused', run(`WAITLIST.promote(AUTH.user,'${id}',{}).ok`)===false);
  ok('promotion is audited', run(`DB.db.audit.some(a=>a.action==='waiting.promoted')`)===true);
  return true;
});

test('closing a waiting-list entry needs a written reason', ()=>{
  as('caregiver.nairobird');
  run(`WAITLIST.add(AUTH.user,{name:'Test Household Four',phone:'0700000004',areaId:'nairobird',reason:'relocated',note:'Moved to the village'})`);
  const id = run(`WAITLIST.rows(AUTH.user,{}).find(r=>r.name==='Test Household Four').id`);
  ok('closing without a reason is refused', run(`WAITLIST.close(AUTH.user,'${id}',{status:'closed',note:''}).ok`)===false);
  ok('closing with a reason works', run(`WAITLIST.close(AUTH.user,'${id}',{status:'withdrawn',note:'Household withdrew after relocation'}).ok`)===true);
  ok('closing is audited', run(`DB.db.audit.some(a=>a.action==='waiting.closed')`)===true);
  const bam = run(`WAITLIST.byAreaMonth(AUTH.user)`);
  ok('the per-area per-month block is produced', bam.cells.length>0 && bam.months.length===12, JSON.stringify(bam.months.length));
  ok('the waiting console renders every tab', ['list','reasons','months','rules'].every(t=>run(`String(WAITLIST.render(AUTH.user,{tab:'${t}'})).length`)>600));
  return true;
});

test('a caregiver cannot add to another area\u2019s waiting list', ()=>{
  as('caregiver.nairobird');
  ok('adding to another ministry area is refused', run(`WAITLIST.add(AUTH.user,{name:'Cross Area Test',areaId:'chiga',reason:'budget'}).ok`)===false);
  ok('only their own ministry areas are returned', run(`WAITLIST.rows(AUTH.user,{}).every(r=>(AUTH.user.areaIds||[]).includes(r.areaId))`)===true);
  return true;
});

/* ============================== 4. urgent cases (URGCAS) ================= */
test('the urgent-case register reproduces the URGCAS sheet', ()=>{
  as('mcm.kisumu');
  const pid = run(`(()=>{const p=DB.db.patients.find(x=>x.countyId==='kisumu'); return p.id;})()`);
  const r = run(`URGENT.add(AUTH.user,{patientId:'${pid}',what:'Emergency admission and blood transfusion',costs:18500,budgetLine:'outpatient'})`);
  ok('a case is recorded', r.ok===true, r.msg||'');
  ok('the month is derived from the date', /^\d{4}-\d{2}$/.test(r.rec.month), r.rec.month);
  ok('a name is required', run(`URGENT.add(AUTH.user,{name:'',what:'x',costs:1}).ok`)===false);
  ok('"what" is required', run(`URGENT.add(AUTH.user,{name:'x',what:'',costs:1}).ok`)===false);
  run(`URGENT.add(AUTH.user,{name:'Second urgent case',what:'Funeral support for a deceased patient',costs:42000,budgetLine:'other'})`);
  const tot = run(`URGENT.totals(AUTH.user)`);
  ok('twelve month rows follow the programme year', tot.length===12, String(tot.length));
  const thisMonth = run(`URGENT.rows(AUTH.user,{})[0].month`);
  const row = tot.find(t=>t.month===thisMonth);
  ok('the month total is the SUM of that month\u2019s costs (column F)', row && row.monthTotal>=18500, JSON.stringify(row));
  ok('the year total is the running total (column G)', row && row.yearTotal>=row.monthTotal, JSON.stringify(row));
  ok('the running total never decreases', tot.every((t,i)=>i===0||t.yearTotal>=tot[i-1].yearTotal));
  ok('a decision needs a written reason', run(`URGENT.decide(AUTH.user,'${r.rec.id}','approved','').ok`)===false);
  ok('a decision with a reason is recorded', run(`URGENT.decide(AUTH.user,'${r.rec.id}','approved','Funded from the outpatient line; receipt to follow').ok`)===true);
  ok('the decision is audited', run(`DB.db.audit.some(a=>a.action==='urgent.decided')`)===true);
  ok('the register renders every tab', ['register','months','rules'].every(t=>run(`String(URGENT.render(AUTH.user,{tab:'${t}'})).length`)>600));
  return true;
});

test('urgent-case costs reach the cost-per-patient engine', ()=>{
  as('finance.kisumu');
  const lines = run(`COSTX.lines(AUTH.user,{}).filter(l=>l.source==='urgent-case')`);
  ok('the urgent cases are cost lines', lines.length>=2, String(lines.length));
  ok('they carry the budget line', lines.every(l=>l.budgetLine), JSON.stringify(lines[0]&&lines[0].budgetLine));
  ok('their value is the recorded cost', lines.reduce((n,l)=>n+l.amount,0)>=60000, String(lines.reduce((n,l)=>n+l.amount,0)));
  as('caregiver.nairobird');
  ok('a caregiver cannot record an urgent case', run(`RBAC.can(AUTH.user,'urgent.manage',{}).ok`)===false);
  return true;
});

/* ============================== 5. the analysis layer ==================== */
test('rows 152-160 of the area sheet are reproduced, cell by cell', ()=>{
  as('kisumu.admin');
  const rows = run(`MASTERX2.areaSummary(AUTH.user,'')`);
  ok('one row per ministry area', rows.length>=7, String(rows.length));
  const r = rows.find(x=>x.patients>0);
  ok('A152 patients is a count', r && r.patients>0, JSON.stringify(r&&r.patients));
  ok('K152 total days is a sum', r && r.totalDays>0);
  ok('K154 average days = K152 / K153', r && r.averageDays===Math.round(r.totalDays/r.patientCount), `${r.averageDays} vs ${Math.round(r.totalDays/r.patientCount)}`);
  ok('K155 counts patients beyond 120 days', r && r.over120>=0 && r.over120<=r.patients);
  ok('K156 is the >120 share', r && Math.abs(r.over120Share - (r.patients? r.over120/r.patients : 0))<1e-9);
  ok('K160 is the minimal-care share of those in programme', r && (r.inProgramme? Math.abs(r.minimalCareShare-r.minimalCare/r.inProgramme)<1e-9 : r.minimalCareShare===0));
  ok('H152 counts the minimal-care flag', r && r.minimalCare>=0);
  ok('S152 and T152 carry orphans prevented and became orphans', r && r.orphansPrevented>=0 && r.becameOrphans>=0);
  ok('V152, W152 and X152 count normal bag, special bag and medical only', r && r.normalBag>=0 && r.specialBag>=0 && r.medicalOnly>=0);
  ok('L152 and M152 count discharges and deaths', r && r.discharged>=0 && r.deceased>=0);
  ok('disease counts are produced', r && typeof r.diseases.tb==='number' && typeof r.diseases.cancer==='number');
  return true;
});

test('both duration-band schemes are published, side by side and labelled', ()=>{
  as('kisumu.admin');
  const b = run(`MASTERX2.bandSummary(AUTH.user)`);
  ok('the workbook bands are 99, 100, 120 and 183', JSON.stringify(b.workbook.map(x=>x.over))===JSON.stringify([99,100,120,183]), JSON.stringify(b.workbook.map(x=>x.over)));
  ok('the operational milestones are 60, 100, 120 and 180', JSON.stringify(b.operational.map(x=>x.over))===JSON.stringify([60,100,120,180]), JSON.stringify(b.operational.map(x=>x.over)));
  ok('each workbook band cites the cell it comes from', b.workbook.every(x=>/K4:K151|J155|column H/i.test(x.ref)), b.workbook.map(x=>x.ref).join(' | '));
  ok('the >183 band equals the minimal-care rule', b.workbook.find(x=>x.over===183).n === run(`repo.patientList(AUTH.user,{}).filter(p=>MASTERX2.daysOf(p)>183).length`));
  ok('bands are monotonically decreasing', b.workbook.every((x,i)=>i===0||x.n<=b.workbook[i-1].n));
  const pd = run(`String(renderProgrammeDays(AUTH.user))`);
  ok('the Programme days console shows both schemes', /Master workbook bands/.test(pd) && /Operational milestones/.test(pd));
  ok('and says neither is renamed to look like the other', /Neither is renamed/.test(pd));
  return true;
});

test('the slum/village ratio reproduces Extra MI columns Q to U', ()=>{
  as('kisumu.admin');
  const sv = run(`MASTERX2.slumVillage(AUTH.user)`);
  const jan = sv.baseline.find(b=>/January/.test(b.month));
  ok('January slums = 27+23+23 = 73 (Manyatta + Nyalenda + Nairobi Road)', jan.slums===73, String(jan.slums));
  ok('January villages = 13+10+17+16 = 56', jan.villages===56, String(jan.villages));
  ok('January all = 129', jan.all===129, String(jan.all));
  ok('the percentages sum to one', Math.abs(jan.slumPct+jan.villagePct-1)<1e-9);
  ok('the split matches the county classification', run(`MASTERX2.baseline().slumAreas.every(a=>(areaObj(a)||{}).cls==='urban')`)===true);
  ok('and the village side matches too', run(`MASTERX2.baseline().villageAreas.every(a=>(areaObj(a)||{}).cls==='village')`)===true);
  ok('the live ratio is computed from the register', sv.slums+sv.villages===sv.all, `${sv.slums}+${sv.villages} vs ${sv.all}`);
  ok('the pivot offers the classification as a dimension', run(`!!PIVOT_DIMS.areaClass`)===true);
  ok('and it labels a patient by classification', run(`PIVOT_DIMS.areaClass.fn(DB.db.patients.find(p=>p.areaId==='manyatta'))`)==='Urban / slum-based');
  return true;
});

test('the workbook\u2019s cost per visited patient is carried as a baseline', ()=>{
  as('kisumu.admin');
  const c = run(`MASTERX2.baselineCost(AUTH.user)`);
  const jan = c.rows.find(r=>/January/.test(r.month));
  ok('January visited patients = 129', jan.visited===129, String(jan.visited));
  ok('January food expenses = KES 511,313', jan.expenses===511313, String(jan.expenses));
  ok('January cost per visited patient = KES 3,964', Math.round(jan.perPatient)===3964, String(Math.round(jan.perPatient)));
  ok('eight months of expenses are carried', c.rows.filter(r=>r.expenses!==null).length===8, String(c.rows.filter(r=>r.expenses!==null).length));
  ok('the average per unique patient is the workbook\u2019s E20 formula', Math.abs(c.wbAverage - c.wbTotal/c.wbVisited)<0.01);
  ok('every row cites its source range', run(`MASTERX2.baseline().foodExpensesRef`)==='Extra MI!C5:C12');
  return true;
});

test('the multi-year series keeps the workbook years and adds the live register', ()=>{
  as('kisumu.admin');
  const y = run(`MASTERX2.yearSeries(AUTH.user)`);
  ok('2018 to 2024 come from the workbook', [2018,2019,2020,2021,2022,2023,2024].every(n=>y.base.some(b=>b.year===n && b.n>0)), JSON.stringify(y.base));
  ok('the 2024 figure is 564', y.base.find(b=>b.year===2024).n===564);
  ok('the gap is stated rather than filled with a guess', /not in the master workbook/i.test(y.gap), y.gap);
  ok('live years come from the register', y.live.length>0 && y.live.every(l=>/live register/.test(l.source)));
  ok('the source range is cited', run(`MASTERX2.baseline().visitedByYearRef`)==='Data!X6:AD6');
  return true;
});

test('the programme year is configurable, defaults to January, and is audited', ()=>{
  as('kisumu.admin');
  ok('the default is January', run(`PYEAR.start()`)===1);
  ok('the label says calendar year', /January to December/.test(run(`PYEAR.label()`)), run(`PYEAR.label()`));
  ok('the month order starts in January', run(`JSON.stringify(PYEAR.order().slice(0,3))`)==='[1,2,3]');
  ok('a county administrator may not change it', run(`PYEAR.set(AUTH.user,6).ok`)===false);
  as('chief.admin');
  ok('a system administrator may change it', run(`PYEAR.set(AUTH.user,6).ok`)===true);
  ok('the year now runs June to May', /June to May/.test(run(`PYEAR.label()`)), run(`PYEAR.label()`));
  ok('the month order starts in June', run(`JSON.stringify(PYEAR.order().slice(0,3))`)==='[6,7,8]');
  ok('the change is audited with the month it changed from', run(`DB.db.audit.some(a=>a.action==='settings.changed' && a.entityId==='programmeYearStart' && /January -> June/.test(a.detail))`)===true);
  ok('an out-of-range month is refused', run(`PYEAR.set(AUTH.user,13).ok`)===false);
  ok('a date in March belongs to the previous programme year', run(`PYEAR.yearOf('2026-03-15')`)===2025);
  ok('and a date in July belongs to the current one', run(`PYEAR.yearOf('2026-07-15')`)===2026);
  ok('month keys sort in programme-year order', run(`JSON.stringify(PYEAR.sortMonthKeys(['2026-03','2026-07','2026-01']))`)==='["2026-07","2026-01","2026-03"]');
  run(`PYEAR.set(AUTH.user,1)`);
  ok('it is set back to January for the rest of the suite', run(`PYEAR.start()`)===1);
  return true;
});

test('the source-integrity register records every broken thing in the workbook', ()=>{
  const items = run(`MASTERX2.integrity()`);
  ok('the #REF! blocks are recorded', items.filter(i=>/Broken reference/.test(i.kind)).length>=3, String(items.filter(i=>/Broken reference/.test(i.kind)).length));
  ok('the count of #REF! cells is stated', items.some(i=>i.count===285));
  ok('the eleven dead defined names are recorded', items.some(i=>/Dead defined name/.test(i.kind) && /eleven/i.test(i.impact)));
  ok('the Homa Bay external link is recorded', items.some(i=>/\[3\]Tabel!A29/.test(i.found)));
  ok('the Dutch comment threads are recorded', items.some(i=>/Comment thread/.test(i.kind) && /Opmerkingenthread/.test(i.found)));
  ok('the absence of macros is recorded as verified', items.some(i=>/Verified absent/.test(i.kind) && /vbaProject/i.test(i.found)));
  ok('every item says what this system does instead', items.every(i=>i.instead && i.instead.length>20));
  ok('the empty Goals sheet is recorded', items.some(i=>/Goals '26/.test(i.where)));
  return true;
});

test('the master register summary prints with aligned figures', ()=>{
  as('kisumu.admin');
  const doc = run(`String(MASTERX2.reportDoc(AUTH.user,{}))`);
  ok('the report renders', /Master Register Summary/.test(doc) && doc.length>4000, String(doc.length));
  ok('it carries the cell references from the workbook', /A152/.test(doc) && /K154/.test(doc) && /S152/.test(doc));
  ok('it carries both band schemes', /Master workbook/.test(doc) && /Operational milestones/.test(doc));
  ok('it carries the slum/village ratio', /Slums versus villages/.test(doc));
  ok('it carries the cost per visited patient', /Cost per visited patient/.test(doc));
  ok('it carries the year series', /Visited patients by year/.test(doc));
  ok('it carries the source-integrity register', /Source integrity/.test(doc));
  ok('numeric columns are right-aligned and tabular', (doc.match(/class="num"/g)||[]).length>60, String((doc.match(/class="num"/g)||[]).length));
  ok('it states that no patient identity is stored', /no patient identity|Aggregate figures only/i.test(doc));
  const html = run(`String(MASTERX2.render(AUTH.user,{tab:'summary'}))`);
  ok('the console renders the summary block', /Rows 152-160, computed live/.test(html));
  ok('every console tab renders', ['summary','bands','baseline','slumvillage','pyear','integrity'].every(t=>run(`String(MASTERX2.render(AUTH.user,{tab:'${t}'})).length`)>800));
  return true;
});

test('the foodbag week-by-area matrix reproduces the Foodbags sheet', ()=>{
  as('finance.kisumu');
  const html = run(`String(COSTX.render(AUTH.user,{tab:'bags'}))`);
  ok('the bags tab renders', html.length>1500, String(html.length));
  ok('it offers the weekly matrix or says why there is none',
    /Bags per week per ministry area/.test(html) && (/Ministry area/.test(html) || /No weekly bag grid yet/.test(html)));
  ok('the three bag codes are priced from the standards', /BG1/.test(html) && /BG2/.test(html) && /SPB/.test(html));
  ok('the Monday-to-Saturday week rule is stated', /Monday to Saturday/.test(html));
  ok('the week calendar resolves a date to a week number', run(`MASTERX.weekOf('2026-10-22').week`)===43);
  return true;
});

/* ============================== summary ================================= */
console.log('');
if(fails.length){ console.log('FAILED:'); fails.slice(0,40).forEach(f=>console.log('  ✗ '+f)); }
console.log(`\n${pass}/${pass+fail} v6.2 assertions passed${fail?` · ${fail} failed`:''}`);
process.exit(fail?1:0);
