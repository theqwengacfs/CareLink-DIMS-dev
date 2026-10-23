/* ============================================================
   master_analysis.js - The master workbook's ANALYSIS layer

   master_registry.js carries the workbook's structure: its sheets,
   its 145 columns, its vocabularies and its formulas. This module
   carries the workbook's arithmetic and its own published figures,
   so that a report produced here can be tied line for line back to
   the spreadsheet the Administration reads today.

   Six things live here and nowhere else:

   1. MASTER_BASELINE - the aggregate figures read out of the
      workbook on 22 October 2026, each with the exact cell range it
      came from. Aggregate programme statistics only: no patient
      name, identifier, telephone number or clinical detail.
   2. Duration bands, BOTH schemes side by side: the workbook's own
      conditional-formatting bands on column K (>99, >100, >120,
      >183) and the operational milestones the Patient-Days report
      already uses (60, 100, 120, 180). They are printed together and
      labelled separately, because they answer different questions
      and reconciling them silently would be worse than showing both.
   3. The per-area summary block, rows 152-160 of every ministry
      area sheet, computed live from the register.
   4. The slums-versus-villages ratio (Extra MI columns Q to U),
      live and against the workbook baseline.
   5. The programme year, configurable. The workbook contradicts
      itself: each sheet's month dropdown runs June to May while
      Tabel runs January to December. The default is January, so
      nothing shifts silently, and Administration can set June.
   6. The source-integrity register: every #REF! block, dead defined
      name, external workbook link and comment thread found in the
      source, with what this system computes instead. A figure is
      never inherited from a broken cell without saying so.
   ============================================================ */

/* ---------------- 1. The workbook's own aggregate baseline ----------------
   Read from the master workbook on 22 October 2026. Cell references are kept
   so any figure can be checked against the sheet it came from. */
const MASTER_BASELINE = {
  readAt:'2026-10-22',
  source:'20260101 LOMAMO registration patients 2026.xlsx',
  note:'Aggregate programme statistics only. No patient identity, identifier, telephone number or clinical detail from the workbook is stored in this system or in this repository.',

  /* Tabel!A22..A28 - the column order the workbook uses for ministry areas. */
  areaOrder:['manyatta','nyahera','nyalenda','ombeyi','nairobird','ahero','chiga'],

  /* Extra MI!H5:N13 - patients per ministry area per month, as recorded. */
  monthsByArea:{
    "January'26":  { manyatta:27, nyahera:13, nyalenda:23, ombeyi:10, nairobird:23, ahero:17, chiga:16 },
    "February'26": { manyatta:25, nyahera:12, nyalenda:26, ombeyi:12, nairobird:24, ahero:12, chiga:18 },
    "March'26":    { manyatta:24, nyahera:16, nyalenda:20, ombeyi:19, nairobird:24, ahero:14, chiga:17 },
    "April'26":    { manyatta:15, nyahera:20, nyalenda:24, ombeyi:16, nairobird:24, ahero:18, chiga:20 },
    "May'26":      { manyatta:19, nyahera:15, nyalenda:25, ombeyi:10, nairobird:20, ahero:18, chiga:19 },
    "June'26":     { manyatta:24, nyahera:18, nyalenda:28, ombeyi:13, nairobird:18, ahero:18, chiga:15 },
    "July'26":     { manyatta:25, nyahera:16, nyalenda:26, ombeyi:12, nairobird:19, ahero:22, chiga:20 },
    "August'26":   { manyatta:22, nyahera:16, nyalenda:27, ombeyi:16, nairobird:22, ahero:18, chiga:17 },
    "September'26":{ manyatta:21, nyahera:16, nyalenda:28, ombeyi:18, nairobird:23, ahero:20, chiga:15 }
  },
  monthsByAreaRef:'Extra MI!H5:N13',

  /* Extra MI!C5:C12 - food expenses per month (KES). */
  foodExpenses:{
    "January'26":511313, "February'26":1032916, "March'26":593156, "April'26":617130,
    "May'26":534648, "June'26":571479, "July'26":540805, "August'26":582790
  },
  foodExpensesRef:'Extra MI!C5:C12',

  /* MI 2026!B7:B13 - patients on the register at 31 December of the previous year. */
  openingCaseload:{ manyatta:16, nyahera:20, nyalenda:26, ombeyi:15, nairobird:21, ahero:19, chiga:17 },
  openingCaseloadRef:'MI 2026!B7:B13 (total 134, which is also the January start figure at MI 2026!B125)',

  /* Data!X6:AD6 - visited patients per year. The workbook carries 2018 to 2024;
     2025 and 2026 were not present in the sheet when it was studied. */
  visitedByYear:{ 2018:52, 2019:188, 2020:257, 2021:250, 2022:192, 2023:426, 2024:564 },
  visitedByYearRef:'Data!X6:AD6',
  visitedByYearGap:'2025 and 2026 are not in the master workbook. They are computed live from this system instead of being guessed.',

  /* Extra MI!Q5:U13 - the slum/village split, derived exactly as the sheet does:
     slums = Manyatta + Nyalenda + Nairobi Road (urban), villages = Nyahera +
     Ombeyi + Ahero + Chiga. This matches the classification already held on the
     county configuration (COUNTIES[].areas[].cls). */
  slumAreas:['manyatta','nyalenda','nairobird'],
  villageAreas:['nyahera','ombeyi','ahero','chiga'],
  slumVillageRef:'Extra MI!Q5:U13 (=H+J+L slums, =I+K+M+N villages, % of all)'
};

/* ---------------- 2. Duration bands: both schemes ---------------- */
const MASTER_BANDS = {
  /* The workbook's conditional formatting on column K (days in programme). */
  workbook:[
    { id:'gt99',  over:99,  label:'Beyond 99 days',  ref:'Conditional formatting on K4:K151, rule 1',
      meaning:'The first amber band: a household that has been in the programme for more than three months.' },
    { id:'gt100', over:100, label:'Beyond 100 days', ref:'Conditional formatting on K4:K151, rule 2',
      meaning:'The second amber band, one day after the first - the workbook shades them differently.' },
    { id:'gt120', over:120, label:'Beyond 120 days', ref:'Conditional formatting on K4:K151, rule 3; counted at J155=">120" and K155=COUNTIF(K4:K151,">120")',
      meaning:'Approaching the planned duration: an extension review is due.' },
    { id:'gt183', over:183, label:'Beyond 183 days', ref:'Conditional formatting on K4:K151, rule 4; and column H =IF(AND(L="",K>183),"x","")',
      meaning:'Minimal-care review. This is the workbook\'s own rule and it is already enforced in this system.' }
  ],
  /* The operational milestones the Patient-Days report already uses. */
  operational:[
    { id:'m60',  over:60,  label:'60 days',  meaning:'Standard mid-point review' },
    { id:'m100', over:100, label:'100 days', meaning:'Approaching extension review' },
    { id:'m120', over:120, label:'120 days', meaning:'Documented extension review required' },
    { id:'m180', over:180, label:'180 days', meaning:'Discharge evaluation with evidence required' }
  ],
  decision:'Both schemes are published side by side. The workbook bands reconcile a report to the spreadsheet the Administration reads; the operational milestones drive the review workflow. Neither replaces the other, and neither is renamed to look like the other.'
};

/* ---------------- 3. Programme year ---------------- */
const PYEAR = {
  KEY:'programmeYearStart',
  months(){ return MASTER_VOCAB.months; },
  start(){
    const v = Number((DB.db && DB.db.settings && DB.db.settings[PYEAR.KEY])||1);
    return (v>=1 && v<=12)? v : 1;
  },
  /* Month numbers in programme-year order. */
  order(){
    const s = this.start(); const out=[];
    for(let i=0;i<12;i++) out.push(((s-1+i)%12)+1);
    return out;
  },
  monthName(n){ return ['January','February','March','April','May','June','July','August','September','October','November','December'][(Number(n)||1)-1]; },
  label(){
    const s = this.start();
    return s===1? 'January to December (calendar year)' : `${this.monthName(s)} to ${this.monthName(((s-1+11)%12)+1)}`;
  },
  /* Which programme year a date belongs to. */
  yearOf(date){
    const d = new Date(date); if(isNaN(d)) return null;
    const s = this.start();
    return d.getMonth()+1 >= s ? d.getFullYear() : d.getFullYear()-1;
  },
  yearLabel(date){
    const y = this.yearOf(date); if(y===null) return '';
    const s = this.start();
    return s===1? String(y) : `${y}/${String(y+1).slice(2)}`;
  },
  /* Sort month keys (YYYY-MM) into programme-year order. */
  sortMonthKeys(keys){
    const s = this.start();
    const rank = m => { const n = Number(String(m).slice(5,7)); return ((n - s) + 12) % 12; };
    return (keys||[]).slice().sort((a,b)=> String(a).slice(0,4).localeCompare(String(b).slice(0,4)) || rank(a)-rank(b));
  },
  set(user, month){
    if(!RBAC.has(user,'system.config')) return { ok:false, msg:'Only a system administrator may change the programme year.' };
    const m = Number(month);
    if(!(m>=1 && m<=12)) return { ok:false, msg:'Choose a month from 1 (January) to 12 (December).' };
    const before = this.start();
    DB.db.settings = DB.db.settings||{};
    DB.db.settings[PYEAR.KEY] = m;
    AUDIT.append({ actor:user.id, action:'settings.changed', entity:'setting', entityId:PYEAR.KEY,
      detail:`programme year start ${PYEAR.monthName(before)} -> ${PYEAR.monthName(m)}`, before, after:m });
    DB.save();
    return { ok:true, msg:`The programme year now runs ${this.label()}.` };
  }
};

/* ---------------- 4. Source integrity register ---------------- */
const MASTER_SOURCE_INTEGRITY = [
  { id:'ref-discharged', kind:'Broken reference', where:"Sheet 'Discharged', rows 4 onwards, all seven area blocks",
    found:"='Manyatta '!#REF! and the same for Nyahera, Nyalenda, Ombeyi, Nairobi Road, Ahero and Chiga",
    count:285, impact:'The discharge register in the source cannot be recalculated: the formulas point at rows that were deleted.',
    instead:'LOMAMO C-DIMS builds the discharge register from the patient record itself (discharge month, discharge date, days in programme at discharge), so it can never point at a deleted row. It is printed per ministry area and per month in the Master register summary.' },
  { id:'ref-mi', kind:'Broken reference', where:"Sheet 'MI 2026', rows 54 to 57 (development of total days)",
    found:'=#REF! across columns A to G', impact:'Three of the four development-of-days rows in the source are dead.',
    instead:'The same measure is computed live as total programme days per month per area, and the average days per patient is the workbook\'s own K154 formula (total days divided by patients).' },
  { id:'ref-g152', kind:'Broken reference', where:'Every ministry area sheet, G152 and G154:G157',
    found:'=COUNTA(#REF!) and =COUNTIF(#REF!,A154)', impact:'The "Minimal Care Patients" total and the per-disease counts in the summary block point at deleted ranges.',
    instead:'Minimal care is counted from column H (=IF(AND(L="",K>183),"x","")) which is intact, and disease counts are taken from the confirmed condition register rather than from flag columns that may be blank.' },
  { id:'names-dead', kind:'Dead defined name', where:'Workbook defined names: a, ABC, b, Basic, gb, jb, New, NMPC, NR and two print-title names',
    found:"All eleven resolve to '[1]Discharged Patient'!#REF! or '[2]Deceased Patients'!#REF!",
    impact:'Eleven named ranges point into two workbooks that are not present, so anything that used them returns #REF!.',
    instead:'No defined name is carried into this system. Every measure is computed from the register, and the two external workbooks (Discharged Patient, Deceased Patients) are recorded here as dependencies the Administration may still hold on paper.' },
  { id:'homabay-external', kind:'External workbook link', where:"Sheet 'Homabay', cell A1",
    found:'=[3]Tabel!A29', impact:'The Homa Bay sheet takes its own area name from a third workbook.',
    instead:'Homa Bay areas are held in this system\'s own county configuration, so the name can never arrive as #REF! and the sheet no longer depends on a file that may not be present.' },
  { id:'comments-nl', kind:'Comment thread', where:"Ombeyi DL72 and DL73, Nairobi Road DL81 (column DL, 'Others' disease)",
    found:'Three Excel threaded-comment stubs in Dutch ("[Opmerkingenthread] U kunt deze opmerkingenthread lezen in uw versie van Excel...")',
    impact:'They carry no substantive text - only the placeholder Excel writes when a thread cannot be rendered - but they mark three rows where the Dutch partner (Zorg voor Afrika) left a note about an "Others" condition.',
    instead:'Recorded here as reviewed. Any note about a patient belongs on the patient record, where it is attributed, dated and scoped; a cell comment in a shared spreadsheet is neither.' },
  { id:'template-today', kind:'Template variant', where:"Sheets 'Basic', 'NEW' and 'Homabay', column J",
    found:'=IF(I#="","",TODAY())', impact:'In the hidden template sheets the date-out column computes TODAY, so days in programme grow while a record is open.',
    instead:'This is the correct behaviour and it is implemented: days in programme count to the discharge date when there is one, and to today when there is not (MASTER_RULES.daysInProgramme).' },
  { id:'template-grid', kind:'Template variant', where:"Sheet 'Basic', bag totals",
    found:'=COUNTIF(AA#:BZ#,Tabel!$I$#) - the weekly grid starts one column earlier than on the live area sheets (AB:CB)',
    impact:'A new area copied from the template counts a column that the live sheets do not use.',
    instead:'The weekly grid is a dated list of issues in this system, not a fixed block of columns, so there is no off-by-one to inherit.' },
  { id:'sum-dn-dq', kind:'Summary formula', where:"Sheets 'NEW' and 'Homabay'",
    found:'=SUM(DN#:DQ#) - totals Intake, Saved, Mosquito net and Viral Load & CD4 known into one figure',
    impact:'Four unrelated indicators added together; the total has no operational meaning.',
    instead:'Each of the four is reported separately (intake, faith record as a restricted field, support items issued, and viral load / CD4 known as a clinical monitoring measure). They are never summed.' },
  { id:'goals-empty', kind:'Empty source', where:"Sheet \"Goals '26\"",
    found:'Only the title row: "LoMaMo / Martins Goals for 2026". No goal rows.',
    impact:'There is nothing to import.',
    instead:'National targets are set in Targets & baselines by the Director, the President or the Chief Program Administrator. The sheet is recorded here so the absence is a decision, not an oversight.' },
  { id:'macros-none', kind:'Verified absent', where:'Workbook package',
    found:'No vbaProject.bin: the file is .xlsx, not .xlsm',
    impact:'The workbook contains no macros, so there is no macro logic to reproduce or to be wary of.',
    instead:'Nothing to carry. Recorded because the instruction asked specifically about macros.' }
];

/* ---------------- 5. The analysis service ---------------- */
const MASTERX2 = {
  baseline(){ return MASTER_BASELINE; },
  bands(){ return MASTER_BANDS; },
  integrity(){ return MASTER_SOURCE_INTEGRITY; },
  pyear(){ return PYEAR; },

  daysOf(p){ return Number(p.programDays) || (typeof PAT!=='undefined'? PAT.days(p) : 0) || 0; },

  /* --- rows 152-160: the per-area summary block, live --- */
  areaSummary(user, areaId){
    const rows = areaId? repo.patientList(user,{areaId}) : repo.patientList(user,{});
    const areas = areaId? [areaId] : COUNTIES.flatMap(c=>c.areas).map(a=>a.id);
    return areas.map(id=>{
      const ps = rows.filter(p=>p.areaId===id);
      const days = ps.map(p=>this.daysOf(p));
      const totalDays = days.reduce((n,d)=>n+d,0);
      const inProgramme = ps.filter(p=>['active','extension','discharge_recommended'].includes(p.status));
      const minimalCare = ps.filter(p=> (p.master||{}).minimalCareFlag==='x' || (!p.dischargedAt && this.daysOf(p)>MASTER_RULES.minimalCareThreshold));
      const over = n => ps.filter(p=>this.daysOf(p)>n).length;
      const sum = f => ps.reduce((n,p)=>n+(Number(f(p))||0),0);
      const disease = label => ps.filter(p=>{
        const c = (DB.db.patientConditions||[]).find(x=>x.patientId===p.id);
        const txt = ((c&&c.label)||'')+' '+(((p.clinical||{}).diagnosis)||'');
        return new RegExp(label,'i').test(txt);
      }).length;
      return {
        areaId:id, area:areaName(id), county:countyName((COUNTIES.find(c=>c.areas.some(a=>a.id===id))||{}).id),
        /* A152 */ patients: ps.length,
        /* E152 */ newInMonth: ps.filter(p=>(p.master||{}).newInMonth).length,
        /* F152 */ inProgramme: inProgramme.length,
        /* H152 */ minimalCare: minimalCare.length,
        /* K152 */ totalDays,
        /* K153 */ patientCount: ps.length,
        /* K154 */ averageDays: ps.length? Math.round(totalDays/ps.length) : 0,
        /* L152 */ discharged: ps.filter(p=>p.status==='discharged'||(p.master||{}).dischargeMonth).length,
        /* M152 */ deceased: ps.filter(p=>(p.master||{}).deceasedMonth || p.status==='deceased').length,
        /* N152 */ repeat: ps.filter(p=>(p.master||{}).repeatPatient).length,
        /* S152 */ orphansPrevented: sum(p=>(p.master||{}).orphansPrevented),
        /* T152 */ becameOrphans: sum(p=>(p.master||{}).becameOrphans),
        /* V152 */ normalBag: ps.filter(p=>(p.master||{}).normalBag || (p.master||{}).bagAtEnrolment==='BG1').length,
        /* W152 */ specialBag: ps.filter(p=>(p.master||{}).specialBag || (p.master||{}).bagAtEnrolment==='SPB').length,
        /* X152 */ medicalOnly: ps.filter(p=>(p.master||{}).medicalOnly).length,
        /* K155 / K156 */ over120: over(120), over120Share: ps.length? over(120)/ps.length : 0,
        over99: over(99), over100: over(100), over183: over(183),
        /* K160 */ minimalCareShare: inProgramme.length? minimalCare.length/inProgramme.length : 0,
        diseases:{ tb:disease('tb|tuberc'), cancer:disease('cancer|kaposi|cervical|uterine|esophag|lung'), wound:disease('wound'),
          meningitis:disease('meningit'), stroke:disease('stroke|cva'), malaria:disease('malaria'), hiv:disease('hiv|art') },
        children: sum(p=>(p.household||{}).children)
      };
    });
  },

  /* --- duration bands, both schemes --- */
  bandSummary(user){
    const ps = repo.patientList(user,{});
    const total = ps.length;
    const count = n => ps.filter(p=>this.daysOf(p)>n).length;
    return {
      total,
      workbook: MASTER_BANDS.workbook.map(b=>({ ...b, n:count(b.over), share: total? count(b.over)/total : 0 })),
      operational: MASTER_BANDS.operational.map(b=>({ ...b, n:count(b.over), share: total? count(b.over)/total : 0 }))
    };
  },

  /* --- slums versus villages, live and against the baseline --- */
  slumVillage(user){
    const ps = repo.patientList(user,{});
    const cls = id => (areaObj(id)||{}).cls;
    const slums = ps.filter(p=>cls(p.areaId)==='urban').length;
    const villages = ps.filter(p=>cls(p.areaId)==='village').length;
    const all = slums+villages;
    const baseline = Object.entries(MASTER_BASELINE.monthsByArea).map(([month,byArea])=>{
      const s = MASTER_BASELINE.slumAreas.reduce((n,a)=>n+(byArea[a]||0),0);
      const v = MASTER_BASELINE.villageAreas.reduce((n,a)=>n+(byArea[a]||0),0);
      return { month, slums:s, villages:v, all:s+v, slumPct:(s+v)? s/(s+v) : 0, villagePct:(s+v)? v/(s+v) : 0 };
    });
    const byAreaLive = COUNTIES.flatMap(c=>c.areas).map(a=>({
      area:a.name, cls:AREA_CLASS_LABEL[a.cls]||a.cls, n:ps.filter(p=>p.areaId===a.id).length
    })).filter(x=>x.n>0);
    return { slums, villages, all, slumPct: all? slums/all : 0, villagePct: all? villages/all : 0, baseline, byAreaLive };
  },

  /* --- the workbook's cost per visited patient, against the live engine --- */
  baselineCost(user){
    const rows = Object.entries(MASTER_BASELINE.monthsByArea).map(([month,byArea])=>{
      const visited = Object.values(byArea).reduce((n,v)=>n+v,0);
      const expenses = MASTER_BASELINE.foodExpenses[month];
      return { month, visited, expenses: expenses===undefined? null : expenses,
        perPatient: expenses===undefined? null : MASTER_RULES.costPerVisitedPatient(expenses, visited) };
    });
    let live = [];
    if(typeof COSTX!=='undefined' && (RBAC.has(user,'cost.view')||RBAC.has(user,'finance.view'))){
      const s = COSTX.summary(user,{});
      live = s.byMonth.map(m=>({ month:m.key, visited:m.patients, expenses:Math.round(m.total), perPatient:m.avg }));
    }
    const wbTotal = rows.filter(r=>r.expenses!==null).reduce((n,r)=>n+r.expenses,0);
    const wbVisited = rows.reduce((n,r)=>n+r.visited,0);
    return { rows, live, wbTotal, wbVisited,
      wbAverage: wbVisited? MASTER_RULES.averageCostPerUniquePatient(wbTotal, wbVisited) : 0 };
  },

  /* --- multi-year series: the workbook's years plus this system's live year --- */
  yearSeries(user){
    const base = Object.entries(MASTER_BASELINE.visitedByYear).map(([y,n])=>({ year:Number(y), n, source:'master workbook (Data!X6:AD6)' }));
    const ps = repo.patientList(user,{});
    const byYear = {};
    ps.forEach(p=>{
      const d = String(p.enrolledAt||p.intake||'').slice(0,4);
      if(/^\d{4}$/.test(d)) byYear[d] = (byYear[d]||0)+1;
    });
    const live = Object.entries(byYear).map(([y,n])=>({ year:Number(y), n, source:'live register (enrolments)' }));
    const years = [...new Set([...base.map(b=>b.year), ...live.map(l=>l.year)])].sort((a,b)=>a-b);
    return { years, base, live, gap:MASTER_BASELINE.visitedByYearGap };
  },

  /* ---------------- printable master register summary ---------------- */
  reportDoc(user, params={}){
    const areas = this.areaSummary(user, params.areaId||'');
    const bands = this.bandSummary(user);
    const sv = this.slumVillage(user);
    const cost = this.baselineCost(user);
    const yrs = this.yearSeries(user);
    const tot = k => areas.reduce((n,a)=>n+(Number(a[k])||0),0);
    const body = `
      <h3>1. Ministry area summary block (the workbook's rows 152-160)</h3>
      <table class="rpt"><thead><tr>
        <th>Ministry area</th><th class="num">Patients<br><span class="xs">A152</span></th>
        <th class="num">In programme<br><span class="xs">F152</span></th>
        <th class="num">Minimal care<br><span class="xs">H152</span></th>
        <th class="num">Total days<br><span class="xs">K152</span></th>
        <th class="num">Average days<br><span class="xs">K154</span></th>
        <th class="num">&gt;120 days<br><span class="xs">K155</span></th>
        <th class="num">&gt;120 share<br><span class="xs">K156</span></th>
        <th class="num">Discharged<br><span class="xs">L152</span></th>
        <th class="num">Deceased<br><span class="xs">M152</span></th>
        <th class="num">Repeat<br><span class="xs">N152</span></th>
        <th class="num">Orphans prevented<br><span class="xs">S152</span></th>
        <th class="num">Became orphans<br><span class="xs">T152</span></th>
        <th class="num">Normal bag<br><span class="xs">V152</span></th>
        <th class="num">Special bag<br><span class="xs">W152</span></th>
        <th class="num">Medical only<br><span class="xs">X152</span></th>
      </tr></thead><tbody>
        ${areas.map(a=>`<tr><td>${esc(a.area)}</td>
          <td class="num">${num(a.patients)}</td><td class="num">${num(a.inProgramme)}</td><td class="num">${num(a.minimalCare)}</td>
          <td class="num">${num(a.totalDays)}</td><td class="num">${num(a.averageDays)}</td><td class="num">${num(a.over120)}</td>
          <td class="num">${(a.over120Share*100).toFixed(1)}%</td><td class="num">${num(a.discharged)}</td><td class="num">${num(a.deceased)}</td>
          <td class="num">${num(a.repeat)}</td><td class="num">${num(a.orphansPrevented)}</td><td class="num">${num(a.becameOrphans)}</td>
          <td class="num">${num(a.normalBag)}</td><td class="num">${num(a.specialBag)}</td><td class="num">${num(a.medicalOnly)}</td></tr>`).join('')}
        <tr class="tot"><td>Total</td><td class="num">${num(tot('patients'))}</td><td class="num">${num(tot('inProgramme'))}</td>
          <td class="num">${num(tot('minimalCare'))}</td><td class="num">${num(tot('totalDays'))}</td>
          <td class="num">${tot('patients')? Math.round(tot('totalDays')/tot('patients')) : 0}</td>
          <td class="num">${num(tot('over120'))}</td><td class="num">${tot('patients')? (100*tot('over120')/tot('patients')).toFixed(1)+'%' : '-'}</td>
          <td class="num">${num(tot('discharged'))}</td><td class="num">${num(tot('deceased'))}</td><td class="num">${num(tot('repeat'))}</td>
          <td class="num">${num(tot('orphansPrevented'))}</td><td class="num">${num(tot('becameOrphans'))}</td>
          <td class="num">${num(tot('normalBag'))}</td><td class="num">${num(tot('specialBag'))}</td><td class="num">${num(tot('medicalOnly'))}</td></tr>
      </tbody></table>

      <h3>2. Duration bands - both schemes, side by side</h3>
      <table class="rpt"><thead><tr><th>Scheme</th><th>Band</th><th class="num">Patients</th><th class="num">Share</th><th>What it means</th><th>Source</th></tr></thead>
      <tbody>
        ${bands.workbook.map(b=>`<tr><td>Master workbook</td><td>${esc(b.label)}</td><td class="num">${num(b.n)}</td><td class="num">${(b.share*100).toFixed(1)}%</td><td class="xs">${esc(b.meaning)}</td><td class="xs">${esc(b.ref)}</td></tr>`).join('')}
        ${bands.operational.map(b=>`<tr><td>Operational milestones</td><td>${esc(b.label)}</td><td class="num">${num(b.n)}</td><td class="num">${(b.share*100).toFixed(1)}%</td><td class="xs">${esc(b.meaning)}</td><td class="xs">Patient-Days report</td></tr>`).join('')}
      </tbody></table>
      <p class="xs">${esc(MASTER_BANDS.decision)}</p>

      <h3>3. Slums versus villages (Extra MI columns Q to U)</h3>
      <table class="rpt"><thead><tr><th>Month</th><th class="num">Slums</th><th class="num">Villages</th><th class="num">All</th><th class="num">% slums</th><th class="num">% villages</th><th>Source</th></tr></thead>
      <tbody>
        ${sv.baseline.map(b=>`<tr><td>${esc(b.month)}</td><td class="num">${num(b.slums)}</td><td class="num">${num(b.villages)}</td><td class="num">${num(b.all)}</td>
          <td class="num">${(b.slumPct*100).toFixed(1)}%</td><td class="num">${(b.villagePct*100).toFixed(1)}%</td><td class="xs">master workbook baseline</td></tr>`).join('')}
        <tr class="tot"><td>Live register now</td><td class="num">${num(sv.slums)}</td><td class="num">${num(sv.villages)}</td><td class="num">${num(sv.all)}</td>
          <td class="num">${(sv.slumPct*100).toFixed(1)}%</td><td class="num">${(sv.villagePct*100).toFixed(1)}%</td><td class="xs">this system</td></tr>
      </tbody></table>
      <p class="xs">Slums = ${MASTER_BASELINE.slumAreas.map(areaName).join(', ')} · Villages = ${MASTER_BASELINE.villageAreas.map(areaName).join(', ')}. The classification is the same one held on the county configuration, so the ratio cannot drift from the register.</p>

      <h3>4. Cost per visited patient - the workbook's own measure</h3>
      <table class="rpt"><thead><tr><th>Month</th><th class="num">Visited patients</th><th class="num">Food expenses (KES)</th><th class="num">Cost per visited patient</th></tr></thead>
      <tbody>
        ${cost.rows.map(r=>`<tr><td>${esc(r.month)}</td><td class="num">${num(r.visited)}</td>
          <td class="num">${r.expenses===null?'-':money(r.expenses)}</td><td class="num">${r.perPatient===null?'-':money(Math.round(r.perPatient))}</td></tr>`).join('')}
        <tr class="tot"><td>Average per unique patient</td><td class="num">${num(cost.wbVisited)}</td><td class="num">${money(cost.wbTotal)}</td><td class="num">${money(Math.round(cost.wbAverage))}</td></tr>
      </tbody></table>
      <p class="xs">Baseline from Extra MI!C5:E12 (expenses food, visited patients, cost p.p.p. month = C/D) and Extra MI!C20:E20 (average costprice food per unique patient). Live figures for the same measure are in the Cost per patient console.</p>

      <h3>5. Visited patients by year</h3>
      <table class="rpt"><thead><tr><th>Year</th><th class="num">From the master workbook</th><th class="num">From the live register</th><th>Source</th></tr></thead>
      <tbody>${yrs.years.map(y=>{
        const b = yrs.base.find(x=>x.year===y), l = yrs.live.find(x=>x.year===y);
        return `<tr><td class="num">${y}</td><td class="num">${b? num(b.n) : '-'}</td><td class="num">${l? num(l.n) : '-'}</td>
          <td class="xs">${b? 'Data!X6:AD6' : ''}${b&&l? ' + live register' : (!b&&l? 'live register (enrolments)' : '')}</td></tr>`;
      }).join('')}</tbody></table>
      <p class="xs">${esc(yrs.gap)}</p>

      <h3>6. Source integrity - what was broken in the workbook and what this system does instead</h3>
      <table class="rpt"><thead><tr><th>Item</th><th>Where</th><th>What was found</th><th>What this system does instead</th></tr></thead>
      <tbody>${MASTER_SOURCE_INTEGRITY.map(i=>`<tr><td><b>${esc(i.kind)}</b><div class="xs">${esc(i.id)}</div></td>
        <td class="xs">${esc(i.where)}</td><td class="xs mono">${esc(i.found)}</td><td class="xs">${esc(i.instead)}</td></tr>`).join('')}</tbody></table>`;
    return reportShell({
      title:'Master Register Summary',
      sub:'The master workbook\u2019s own summary blocks, duration bands, slum/village ratio, cost per visited patient and source-integrity register, computed live from the register',
      meta:[ {k:'Programme year', v:PYEAR.label()}, {k:'Scope', v:params.areaId? areaName(params.areaId) : 'All ministry areas in reach'},
        {k:'Baseline read', v:MASTER_BASELINE.readAt}, {k:'Generated', v:fmtDateTime(new Date())}, {k:'Generated by', v:user.name},
        {k:'Classification', v:'Internal organisational'} ],
      body, footerNote:'Aggregate figures only. The master workbook itself is not stored in this repository: patient identities are personal data.',
      classification:'Internal organisational'
    });
  },

  /* ---------------- console ---------------- */
  render(user, params={}){
    if(!RBAC.has(user,'system.import') && !RBAC.has(user,'report.patient_figures') && !RBAC.has(user,'audit.view') && !RBAC.has(user,'report.executive'))
      return deniedPanel('system.import');
    const tab = params.tab || MASTERX2._tab || 'summary';
    MASTERX2._tab = tab;
    const areas = this.areaSummary(user, '');
    const bands = this.bandSummary(user);
    const sv = this.slumVillage(user);
    const cost = this.baselineCost(user);
    const yrs = this.yearSeries(user);
    const colours = chartColours(8);
    const tabs = [['summary','Area summary block'],['bands','Duration bands'],['baseline','Baseline & trends'],
      ['slumvillage','Slums vs villages'],['pyear','Programme year'],['integrity','Source integrity']];

    const head = pageHead('Master workbook analysis',
      'The workbook\u2019s own arithmetic, computed live from the register and printed side by side with the figures the Administration reads in the spreadsheet. Programme year: <b>'+esc(PYEAR.label())+'</b>.',
      `<button class="btn btn-sm btn-ghost" data-act="go" data-v="mastermap">${ic('columns',15)} Column mapping</button>
       <button class="btn btn-sm btn-ghost" data-act="do-print">${ic('file',15)} Print</button>
       <button class="btn btn-sm btn-primary" data-act="master-report">${ic('receipt',15)} Master register summary</button>`)
    + `<div class="tabs cost-tabs">${tabs.map(([id,label])=>`<button class="tab ${tab===id?'active':''}" data-act="master-tab" data-tab="${id}">${esc(label)}</button>`).join('')}</div>`;

    let body='';
    if(tab==='summary'){
      body = `<div class="grid g4" style="margin:16px 0">
          ${kpi('Patients on the register', num(areas.reduce((n,a)=>n+a.patients,0)), 'Across '+num(areas.filter(a=>a.patients).length)+' ministry areas', 'info', 'users')}
          ${kpi('Average days in programme', num(areas.reduce((n,a)=>n+a.totalDays,0) && Math.round(areas.reduce((n,a)=>n+a.totalDays,0)/Math.max(1,areas.reduce((n,a)=>n+a.patients,0)))), 'The workbook\u2019s K154 = K152 / K153', 'warn', 'clock')}
          ${kpi('Minimal care (>183 days)', num(areas.reduce((n,a)=>n+a.minimalCare,0)), 'Column H =IF(AND(L="",K>183),"x","")', 'crit', 'alert')}
          ${kpi('Children rescued from orphanhood', num(areas.reduce((n,a)=>n+a.orphansPrevented,0)), 'Column S, counted on discharge', 'ok', 'heart')}
        </div>`
      + card('Rows 152-160, computed live', `<div class="tbl-wrap"><table class="tbl compact align-sym">
          <thead><tr><th>Ministry area</th><th class="num">A152<br>Patients</th><th class="num">F152<br>In prog.</th>
            <th class="num">H152<br>Minimal</th><th class="num">K152<br>Total days</th><th class="num">K154<br>Avg days</th>
            <th class="num">K155<br>&gt;120</th><th class="num">K156<br>Share</th><th class="num">K160<br>Minimal share</th>
            <th class="num">L152<br>Disch.</th><th class="num">M152<br>Deceased</th><th class="num">N152<br>Repeat</th>
            <th class="num">S152<br>Orphans prev.</th><th class="num">T152<br>Became orph.</th>
            <th class="num">V152<br>Normal bag</th><th class="num">W152<br>Special bag</th><th class="num">X152<br>Medical only</th></tr></thead>
          <tbody>${areas.map(a=>`<tr>
            <td><div class="cellname">${esc(a.area)}</div><div class="xs muted">${esc(a.county)}</div></td>
            <td class="num">${num(a.patients)}</td><td class="num">${num(a.inProgramme)}</td><td class="num">${num(a.minimalCare)}</td>
            <td class="num">${num(a.totalDays)}</td><td class="num"><b>${num(a.averageDays)}</b></td><td class="num">${num(a.over120)}</td>
            <td class="num">${(a.over120Share*100).toFixed(1)}%</td><td class="num">${(a.minimalCareShare*100).toFixed(1)}%</td>
            <td class="num">${num(a.discharged)}</td><td class="num">${num(a.deceased)}</td><td class="num">${num(a.repeat)}</td>
            <td class="num">${num(a.orphansPrevented)}</td><td class="num">${num(a.becameOrphans)}</td>
            <td class="num">${num(a.normalBag)}</td><td class="num">${num(a.specialBag)}</td><td class="num">${num(a.medicalOnly)}</td></tr>`).join('')}</tbody>
        </table></div>`,
        { sub:'Every column heading carries the cell reference from the workbook, so a figure here can be tied back to the sheet.',
          foot:'<span>G152 and G154:G157 in the source are #REF!; minimal care is counted from the intact column H rule instead. See Source integrity.</span>' })
      + `<div class="grid g2" style="margin-top:16px">
          ${card('Average days in programme by ministry area', chartRows({rows:areas.filter(a=>a.patients).map(a=>({label:a.area, value:a.averageDays})).sort((x,y)=>y.value-x.value), title:'Average days', valueHead:'Days', labelHead:'Ministry area', colours}))}
          ${card('Disease counts per area (live register)', chartStacked({
            labels:areas.filter(a=>a.patients).map(a=>a.area),
            series:[{label:'TB', values:areas.filter(a=>a.patients).map(a=>a.diseases.tb), color:colours[0]},
                    {label:'Cancer', values:areas.filter(a=>a.patients).map(a=>a.diseases.cancer), color:colours[2]},
                    {label:'HIV / ART', values:areas.filter(a=>a.patients).map(a=>a.diseases.hiv), color:colours[3]},
                    {label:'Wound', values:areas.filter(a=>a.patients).map(a=>a.diseases.wound), color:colours[4]}],
            title:'Conditions by ministry area', labelHead:'Ministry area'}),
            {sub:RBAC.has(user,'condition.aggregate')||RBAC.has(user,'condition.view')? 'From the confirmed condition register.' : 'Counts only; no clinical detail is shown to this account.'})}
        </div>`;
    }

    if(tab==='bands'){
      body = note(esc(MASTER_BANDS.decision),'info')
      + `<div class="grid g2" style="margin-top:14px">
          ${card('Master workbook bands (conditional formatting on column K)', table([
            {label:'Band',render:b=>`<div class="cellname">${esc(b.label)}</div><div class="xs muted">${esc(b.meaning)}</div>`},
            {label:'Patients',cls:'num',render:b=>`<b>${num(b.n)}</b>`},
            {label:'Share',cls:'num',render:b=>(b.share*100).toFixed(1)+'%'},
            {label:'Where it comes from',render:b=>`<span class="xs muted">${esc(b.ref)}</span>`}
          ], bands.workbook))}
          ${card('Operational milestones (Patient-Days report)', table([
            {label:'Milestone',render:b=>`<div class="cellname">${esc(b.label)}</div><div class="xs muted">${esc(b.meaning)}</div>`},
            {label:'Patients at or beyond',cls:'num',render:b=>`<b>${num(b.n)}</b>`},
            {label:'Share',cls:'num',render:b=>(b.share*100).toFixed(1)+'%'},
            {label:'Required action',render:b=>`<span class="xs muted">${esc(b.meaning)}</span>`}
          ], bands.operational))}
        </div>`
      + `<div style="margin-top:16px">${card('Both schemes on one axis', chartGrouped({
          labels:['>60','>99','>100','>120','>180','>183'],
          series:[{label:'Patients beyond the band', color:colours[0],
            values:[60,99,100,120,180,183].map(n=>repo.patientList(user,{}).filter(p=>this.daysOf(p)>n).length)}],
          title:'Duration bands', labelHead:'Band', caption:'The workbook bands (99, 100, 120, 183) and the operational milestones (60, 100, 120, 180) drawn on one axis so the difference is visible rather than argued about.'}))}</div>`
      + `<div style="margin-top:16px">${card('Beyond 183 days - the minimal-care rule', (()=>{
          const rows = repo.patientList(user,{}).filter(p=>this.daysOf(p)>183 && !p.dischargedAt);
          return rows.length? table([
            {label:'Patient',render:p=>`<button class="linkbtn cellname" data-act="go" data-v="patient" data-id="${esc(p.id)}">${esc(p.name)}</button><div class="xs muted mono">${esc(p.code)}</div>`},
            {label:'Ministry area',render:p=>esc(areaName(p.areaId))},
            {label:'Days',cls:'num',render:p=>`<b>${num(this.daysOf(p))}</b>`},
            {label:'Flag',render:p=>(p.master||{}).minimalCareFlag==='x'? badge('Minimal care','b-warn') : badge('Not flagged','b-neutral')},
            {label:'Status',render:p=>pBadge(p.status)}
          ], rows.slice(0,40)) : emptyState('Nobody is beyond 183 days','The minimal-care rule has nothing to flag today.','check');
        })(), {foot:'<span>Column H of the workbook: =IF(AND(L="",K>183),"x","") - a patient still in programme beyond 183 days.</span>'})}</div>`;
    }

    if(tab==='baseline'){
      body = `<div class="grid g4" style="margin:16px 0">
          ${kpi('Workbook food expenses', money(cost.wbTotal), 'Eight months, Extra MI!C5:C12', 'info', 'wallet')}
          ${kpi('Workbook visited patients', num(cost.wbVisited), 'Sum of the monthly area counts', 'ok', 'users')}
          ${kpi('Workbook cost per visited patient', money(Math.round(cost.wbAverage)), 'Extra MI!E20 = C20/D20', 'warn', 'receipt')}
          ${kpi('Opening caseload 31 Dec', num(Object.values(MASTER_BASELINE.openingCaseload).reduce((n,v)=>n+v,0)), 'MI 2026!B7:B13', 'ok', 'layers')}
        </div>`
      + card('The workbook\u2019s cost per visited patient, month by month', chartLine({
          labels:cost.rows.map(r=>r.month.replace("'26",'')),
          series:[{label:'Cost per visited patient (workbook)', values:cost.rows.map(r=>r.perPatient===null?0:Math.round(r.perPatient)), color:colours[1]},
                  {label:'Food expenses (KES)', values:cost.rows.map(r=>r.expenses||0), color:colours[0]}],
          fmt:v=>money(v), title:'Costprice food per visited patient', unit:'KES',
          caption:'Exactly the measure Extra MI computes as =C/D: food expenses divided by visited patients, per month.'}))
      + (cost.live.length? `<div style="margin-top:16px">${card('Baseline against the live cost engine', chartGrouped({
          labels:cost.live.slice(-9).map(l=>l.month),
          series:[{label:'Live average per patient (all categories)', values:cost.live.slice(-9).map(l=>Math.round(l.perPatient)), color:colours[3]},
                  {label:'Workbook food cost per visited patient', values:cost.rows.slice(0,cost.live.slice(-9).length).map(r=>Math.round(r.perPatient||0)), color:colours[1]}],
          fmt:v=>money(v), title:'Live against baseline', labelHead:'Month',
          caption:'The workbook measure covers food only; the live measure covers every attributed cost. They are drawn together to show the gap, not to claim they are the same figure.'}))}</div>`
        : `<div style="margin-top:16px">${note('The live cost comparison needs cost authority. Your account does not hold <b>cost.view</b>, so only the workbook baseline is shown.','shield')}</div>`)
      + `<div style="margin-top:16px">${card('Visited patients by year', chartLine({
          labels:yrs.years.map(String),
          series:[{label:'Master workbook (Data!X6:AD6)', values:yrs.years.map(y=>{const b=yrs.base.find(x=>x.year===y); return b? b.n : 0;}), color:colours[0]},
                  {label:'Live register (enrolments)', values:yrs.years.map(y=>{const l=yrs.live.find(x=>x.year===y); return l? l.n : 0;}), color:colours[3]}],
          title:'Visited patients by year', labelHead:'Year',
          caption:yrs.gap}))}
        <div class="xs muted" style="margin-top:8px">${esc(yrs.gap)}</div></div>`
      + `<div style="margin-top:16px">${card('Opening caseload at 31 December, per ministry area (MI 2026!B7:B13)', chartBars({
          rows:MASTER_BASELINE.areaOrder.map(a=>({label:areaName(a), value:MASTER_BASELINE.openingCaseload[a]})),
          title:'Opening caseload', valueHead:'Patients', labelHead:'Ministry area'}),
        {foot:'<span>Total 134, which is also the January start figure the workbook carries at MI 2026!B125.</span>'})}</div>`;
    }

    if(tab==='slumvillage'){
      body = `<div class="grid g4" style="margin:16px 0">
          ${kpi('Slum-based patients', num(sv.slums), (sv.slumPct*100).toFixed(1)+'% of the register', 'info', 'building')}
          ${kpi('Village-based patients', num(sv.villages), (sv.villagePct*100).toFixed(1)+'% of the register', 'ok', 'route')}
          ${kpi('Ratio', sv.all? (sv.slumPct*100).toFixed(0)+' : '+(sv.villagePct*100).toFixed(0) : '-', 'Slums to villages, as Extra MI columns T and U', 'warn', 'columns')}
          ${kpi('Baseline months', num(sv.baseline.length), 'Extra MI!Q5:U13', 'ok', 'archive')}
        </div>`
      + card('Live ratio by ministry area', chartShare(
          [{label:'Slum-based (urban)', value:sv.slums, color:colours[0]},
           {label:'Village-based', value:sv.villages, color:colours[3]}],
          {title:'Slums versus villages', fmt:v=>num(v)+' patients'}))
      + `<div class="grid g2" style="margin-top:16px">
          ${card('Baseline trend from the workbook', chartLine({
            labels:sv.baseline.map(b=>b.month.replace("'26",'')),
            series:[{label:'% slums', values:sv.baseline.map(b=>Math.round(b.slumPct*1000)/10), color:colours[0]},
                    {label:'% villages', values:sv.baseline.map(b=>Math.round(b.villagePct*1000)/10), color:colours[3]}],
            fmt:v=>v+'%', title:'Slum/village share per month', unit:'per cent'}))}
          ${card('Patients per classification', chartRows({
            rows:sv.byAreaLive.map(a=>({label:a.area+' ('+a.cls+')', value:a.n})),
            title:'Register by ministry area', valueHead:'Patients', labelHead:'Ministry area', colours}))}
        </div>`
      + `<div style="margin-top:16px">${card('The workbook\u2019s own split', table([
          {label:'Month',render:b=>esc(b.month)},
          {label:'Slums',cls:'num',render:b=>num(b.slums)},
          {label:'Villages',cls:'num',render:b=>num(b.villages)},
          {label:'All',cls:'num',render:b=>`<b>${num(b.all)}</b>`},
          {label:'% slums',cls:'num',render:b=>(b.slumPct*100).toFixed(1)+'%'},
          {label:'% villages',cls:'num',render:b=>(b.villagePct*100).toFixed(1)+'%'}
        ], sv.baseline), {foot:`<span>Slums = ${MASTER_BASELINE.slumAreas.map(areaName).join(', ')} (=H+J+L). Villages = ${MASTER_BASELINE.villageAreas.map(areaName).join(', ')} (=I+K+M+N). The classification is held on the county configuration, so the ratio cannot drift from the register.</span>`})}</div>`;
    }

    if(tab==='pyear'){
      const canSet = RBAC.has(user,'system.config');
      body = card('Programme year', `
        <div class="grid g2">
          <div>
            <div class="kv"><span>Currently</span><b>${esc(PYEAR.label())}</b></div>
            <p class="small muted" style="margin-top:12px">The workbook contradicts itself. Each ministry area sheet offers a month dropdown that runs <b>June to May</b> (cells EK163:EK174), while the <b>Tabel</b> list and the 53-week calendar run <b>January to December</b> (week 1 = 1-4 January). One of them has to be chosen for reporting; until Administration confirms, the default is January so that no figure shifts silently.</p>
            ${canSet? `<form data-form="pyear-set" class="cost-std-form" style="margin-top:12px">
                <div class="field"><label>Programme year starts in</label><select class="input" name="month">
                  ${Array.from({length:12},(_,i)=>i+1).map(m=>`<option value="${m}" ${PYEAR.start()===m?'selected':''}>${esc(PYEAR.monthName(m))}</option>`).join('')}
                </select></div>
                <div class="cf-act"><button class="btn btn-primary btn-sm" type="submit">${ic('save',14)} Save and audit</button></div>
              </form>`
              : note('Only a system administrator may change the programme year. The choice is written to the audit trail with the month it changed from.','lock')}
          </div>
          <div>${table([
            {label:'Position in the programme year',render:r=>`<span class="mono">${num(r.i)}</span>`},
            {label:'Month',render:r=>`<b>${esc(r.name)}</b>`},
            {label:'Calendar month',render:r=>`<span class="xs muted">${esc(r.name)}</span>`},
            {label:'Workbook month label',render:r=>`<span class="mono xs">${esc(r.label)}</span>`}
          ], PYEAR.order().map((m,i)=>({ i:i+1, name:PYEAR.monthName(m), label:(MASTER_VOCAB.months.find(x=>x.toLowerCase().startsWith(PYEAR.monthName(m).toLowerCase().slice(0,3)))||'') })))}</div>
        </div>`,
        { foot:'<span>The programme year orders monthly cost trends, the foodbag matrix, the MI-style monthly tables and every cumulative "up and until month" figure.</span>' });
    }

    if(tab==='integrity'){
      body = card('Source integrity register', table([
        {label:'Item',render:i=>`<div class="cellname">${esc(i.kind)}</div><div class="xs muted mono">${esc(i.id)}${i.count?` · ${num(i.count)} cells`:''}</div>`},
        {label:'Where in the workbook',render:i=>`<span class="xs">${esc(i.where)}</span>`},
        {label:'What was found',render:i=>`<span class="xs mono">${esc(i.found)}</span><div class="xs muted" style="margin-top:4px">${esc(i.impact)}</div>`},
        {label:'What this system does instead',render:i=>`<span class="xs">${esc(i.instead)}</span>`}
      ], MASTER_SOURCE_INTEGRITY),
      { foot:'<span>Nothing here is silently dropped. Each item records what was broken in the source and what replaces it, so a figure in a report can always be traced to a rule rather than to a dead cell.</span>' })
      + `<div style="margin-top:16px">${card('Personal data: what was read and what was kept', alertBox('warn','The workbook is not stored in this repository',
        `<span class="small">${esc(MASTER_BASELINE.note)} What is kept is the structure (master_registry.js), the arithmetic (MASTER_RULES), the aggregate baseline above, and this integrity register. The file itself was removed from the repository on 22 October 2026.</span>`))}</div>`;
    }

    return head + body;
  },
  _tab:'summary'
};

Object.assign(ACTIONS, {
  'master-tab': d => { MASTERX2._tab = d.tab||'summary'; render(); },
  'set-programme-year': d => {
    const r = PYEAR.set(AUTH.user, d.month);
    if(!r.ok) return toast('Not changed', r.msg, 'err');
    toast('Programme year changed', r.msg, 'ok');
    render();
  },
  'master-report': () => {
    const html = MASTERX2.reportDoc(AUTH.user, {});
    openModal({ title:'Master Register Summary', sub:'The workbook\u2019s own blocks, computed live', wide:true,
      body:`<div class="print-area">${html}</div>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Close</button><button class="btn btn-primary" data-act="do-print">${ic('file',15)} Print</button>` });
  }
});
Object.assign(FORMS, {
  'pyear-set': d => {
    const r = PYEAR.set(AUTH.user, d.get('month'));
    if(!r.ok) return toast('Not changed', r.msg, 'err');
    toast('Programme year changed', r.msg, 'ok'); render();
  }
});
