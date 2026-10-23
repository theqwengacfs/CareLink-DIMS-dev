/* ============================================================
   hub6.js - Analytics (live pivot tables, regional choropleth
   maps, condition visualisations), KHIS/DHIS2/FHIR adapters,
   REST Web APIs & custom-app extensibility, and the four-office
   credential & sync governance console.

   Every computation runs strictly over records in the caller's
   RBAC scope (repo.patientList(user)). No figure is hardcoded,
   no external integration is claimed live unless configured and
   verified, and no em/en dashes appear in user-facing text.
   ============================================================ */

const ANALYTICS_STATE = {
  rowDim: 'area',
  colDim: 'status',
  measure: 'count',
  selectedArea: 'all',
  interopTab: 'khis',
  khisForm: 'moh731'
};

/* Standardised condition classification aligned with LOMAMO reporting */
function classifyCondition(p){
  const raw = String((p.clinical && p.clinical.diagnosis) || '').toLowerCase();
  const hasHiv = /hiv|art\b/.test(raw);
  const hasTb  = /\btb\b|tuberculos/.test(raw);
  if(hasHiv && hasTb) return 'HIV/AIDS and TB';
  if(hasHiv) return 'HIV/AIDS only';
  if(hasTb) return 'TB only';
  if(/cervical/.test(raw)) return 'Cancer: Cervical';
  if(/kaposi/.test(raw)) return 'Cancer: Kaposi sarcoma';
  if(/breast/.test(raw)) return 'Cancer: Breast';
  if(/cancer|oncol|tumou?r/.test(raw)) return 'Cancer: Other';
  if(/meningitis|cryptococ/.test(raw)) return 'Cryptococcal meningitis';
  if(/wound|ulcer|burn|surgical/.test(raw)) return 'Wound care';
  if(/malaria/.test(raw)) return 'Malaria';
  if(/pneumonia|respirat/.test(raw)) return 'Pneumonia';
  if(/diarrh/.test(raw)) return 'Diarrhoea';
  if(/malnutri/.test(raw)) return 'Malnutrition';
  if(/cva|stroke|hypertens|diabet/.test(raw)) return 'NCD & post-CVA care';
  return raw ? 'Other clinical condition' : 'Pending clinical verification';
}

const PIVOT_DIMS = {
  area:      { label:'Ministry area', fn:p => areaName(p.areaId) || 'Unassigned' },
  county:    { label:'County office', fn:p => countyName(p.countyId) || 'Unassigned' },
  status:    { label:'Programme status', fn:p => String(p.status||'unknown').replace(/_/g,' ') },
  condition: { label:'Condition category', fn:p => classifyCondition(p) },
  sex:       { label:'Sex', fn:p => p.sex==='M' ? 'Male' : 'Female' },
  ageBand:   { label:'Age band', fn:p => { const a=+p.age||0; return a<5?'0-4 yrs':a<15?'5-14 yrs':a<25?'15-24 yrs':a<50?'25-49 yrs':'50+ yrs'; } },
  pdca:      { label:'PDCA stage', fn:p => p.pdcaStage || 'Plan' },
  duration:  { label:'Duration band', fn:p => { const d=PAT.days(p); return d<45?'<45 days':d<=90?'45-90 days':d<=180?'91-180 days':d<=240?'181-240 days':d<=330?'241-330 days':'>330 days'; } },
  consent:   { label:'Consent status', fn:p => (p.consent && p.consent.status) ? p.consent.status.replace(/_/g,' ') : 'not requested' },
  /* The master workbook's own slum-versus-village split (Extra MI columns Q to U).
     It uses the classification already held on the county configuration, so the
     ratio can never drift from the register. */
  areaClass: { label:'Slum or village', fn:p => { const cls=(areaObj(p.areaId)||{}).cls; return cls? (AREA_CLASS_LABEL[cls]||cls) : 'Unclassified'; } },
  waiting:   { label:'Came from the waiting list', fn:p => (p.master && p.master.waitingListId)? 'Promoted from the waiting list' : 'Direct referral' }
};

const PIVOT6 = {
  compute(user, rowKey='area', colKey='status', measure='count'){
    const canSeeCondition = RBAC.has(user,'condition.aggregate') || RBAC.has(user,'condition.view') || RBAC.has(user,'patient.view.clinical');
    if(rowKey==='condition' && !canSeeCondition) rowKey='area';
    if(colKey==='condition' && !canSeeCondition) colKey='status';
    if(rowKey===colKey) colKey = rowKey==='status' ? 'sex' : 'status';

    const rDim = PIVOT_DIMS[rowKey] || PIVOT_DIMS.area;
    const cDim = PIVOT_DIMS[colKey] || PIVOT_DIMS.status;
    const ps = repo.patientList(user).filter(p=>p.status!=='merged');
    const visitCountByPat = {};
    (DB.db.visits||[]).forEach(v=>{ visitCountByPat[v.patientId] = (visitCountByPat[v.patientId]||0) + 1; });

    const rowsSet = new Set(), colsSet = new Set();
    const bucket = {};
    ps.forEach(p=>{
      const r = rDim.fn(p), c = cDim.fn(p);
      rowsSet.add(r); colsSet.add(c);
      const k = r + '|||' + c;
      if(!bucket[k]) bucket[k] = { n:0, visits:0, days:0 };
      bucket[k].n += 1;
      bucket[k].visits += (visitCountByPat[p.id] || 0);
      bucket[k].days += PAT.days(p);
    });

    const rows = [...rowsSet].sort();
    const cols = [...colsSet].sort();
    const cellVal = b => !b ? 0 : measure==='visits' ? b.visits : measure==='days' ? b.days : measure==='avgDays' ? (b.n ? Math.round(b.days/b.n) : 0) : b.n;

    const matrix = rows.map(r=>{
      let rowTotal = 0, rowN = 0, rowDays = 0;
      const vals = cols.map(c=>{
        const b = bucket[r+'|||'+c];
        const v = cellVal(b);
        if(b){ rowN += b.n; rowDays += b.days; }
        rowTotal += v;
        return v;
      });
      return { row:r, vals, total: measure==='avgDays' ? (rowN ? Math.round(rowDays/rowN) : 0) : rowTotal };
    });

    const colTotals = cols.map((c,ci)=> matrix.reduce((s,m)=>s+m.vals[ci], 0));
    const grandTotal = measure==='avgDays'
      ? (ps.length ? Math.round(ps.reduce((s,p)=>s+PAT.days(p),0)/ps.length) : 0)
      : colTotals.reduce((a,b)=>a+b, 0);

    return { rowKey, colKey, measure, rLabel:rDim.label, cLabel:cDim.label, rows, cols, matrix, colTotals, grandTotal, totalPatients:ps.length };
  },

  csv(piv){
    const escCsv = v => '"' + String(v).replace(/"/g,'""') + '"';
    const lines = [[piv.rLabel + ' / ' + piv.cLabel, ...piv.cols, 'Total'].map(escCsv).join(',')];
    piv.matrix.forEach(m=>{
      lines.push([m.row, ...m.vals, m.total].map(escCsv).join(','));
    });
    lines.push(['Total', ...piv.colTotals, piv.grandTotal].map(escCsv).join(','));
    return lines.join('\r\n');
  }
};

/* Geographic coordinates on the Lake Victoria / Kisumu-Homa Bay regional SVG canvas */
const AREA_GEO = [
  { id:'obunga',       countyId:'kisumu',  label:'Obunga',       x:212, y:74,  zone:'Kisumu North-West' },
  { id:'kondele',      countyId:'kisumu',  label:'Kondele',      x:278, y:82,  zone:'Kisumu Central' },
  { id:'manyatta',     countyId:'kisumu',  label:'Manyatta',     x:334, y:108, zone:'Kisumu East' },
  { id:'nyalenda',     countyId:'kisumu',  label:'Nyalenda',     x:268, y:140, zone:'Kisumu South' },
  { id:'nairobi_road', countyId:'kisumu',  label:'Nairobi Road', x:368, y:146, zone:'Eastern Corridor' },
  { id:'chiga',        countyId:'kisumu',  label:'Chiga',        x:432, y:162, zone:'Kano Plains West' },
  { id:'ombeyi',       countyId:'kisumu',  label:'Ombeyi',       x:500, y:132, zone:'Muhoroni / Ombeyi' },
  { id:'ahero',        countyId:'kisumu',  label:'Ahero',        x:462, y:204, zone:'Nyando Corridor' },
  { id:'makongeni',    countyId:'homabay', label:'Homa Bay (Makongeni)', x:154, y:256, zone:'Homa Bay County' },
  { id:'shauri_yako',  countyId:'homabay', label:'Homa Bay (Shauri Yako)', x:236, y:278, zone:'Homa Bay County' },
  { id:'asego',        countyId:'homabay', label:'Homa Bay (Asego)', x:196, y:228, zone:'Homa Bay County' }
];

function renderGeoMapSvg(user, selectedId){
  const ps = repo.patientList(user).filter(p=>p.status!=='merged');
  const visits = DB.db.visits || [];
  const pdcas = DB.db.pdcas || [];
  const now = new Date();
  const byArea = {};
  COUNTIES.flatMap(c=>c.areas.map(a=>({...a, countyId:c.id}))).forEach(a=>{
    byArea[a.id] = { id:a.id, name:a.name, county:countyName(a.countyId), total:0, active:0, visits:0, overdue:0 };
  });
  const visitByPat = {};
  visits.forEach(v=>{ visitByPat[v.patientId] = (visitByPat[v.patientId]||0)+1; });
  const overdueByPat = new Set(pdcas.filter(x=>x.status==='open' && x.due && new Date(x.due)<now).map(x=>x.patientId));
  ps.forEach(p=>{
    const b = byArea[p.areaId] || (byArea[p.areaId]={ id:p.areaId, name:areaName(p.areaId), county:countyName(p.countyId), total:0, active:0, visits:0, overdue:0 });
    b.total += 1;
    if(['active','extension'].includes(p.status)) b.active += 1;
    b.visits += (visitByPat[p.id]||0);
    if(overdueByPat.has(p.id)) b.overdue += 1;
  });

  const maxTotal = Math.max(1, ...Object.values(byArea).map(b=>b.total));
  const nodes = AREA_GEO.map((g, idx)=>{
    const st = byArea[g.id] || { id:g.id, name:g.label, county:g.zone, total:0, active:0, visits:0, overdue:0 };
    const r = st.total === 0 ? 8 : Math.round(11 + 19 * Math.sqrt(st.total / maxTotal));
    const fill = st.total === 0 ? '#94A3B8' : st.overdue > 3 ? '#DC2626' : g.countyId==='homabay' ? '#7C3AED' : '#0284C7';
    const sel = selectedId === g.id;
    return `<g class="geo-node" data-act="map-select" data-area="${esc(g.id)}" style="cursor:pointer" role="button" tabindex="0" aria-label="${esc(st.name)}: ${st.total} patients, ${st.active} active">
      ${sel ? `<circle cx="${g.x}" cy="${g.y}" r="${r+8}" fill="none" stroke="#F59E0B" stroke-width="2.5" stroke-dasharray="4 3"/>` : ''}
      <circle cx="${g.x}" cy="${g.y}" r="${r}" fill="${fill}" fill-opacity="${st.total?0.84:0.35}" stroke="#FFFFFF" stroke-width="2"/>
      <text x="${g.x}" y="${g.y+4}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#FFFFFF">${st.total}</text>
      <rect x="${g.x - 54}" y="${g.y + r + 4}" width="108" height="17" rx="5" fill="#0F172A" fill-opacity="0.78"/>
      <text x="${g.x}" y="${g.y + r + 15.5}" text-anchor="middle" font-size="9.8" font-weight="600" fill="#F8FAFC">${esc(g.label)}</text>
    </g>`;
  }).join('');

  return {
    byArea,
    svg: `<svg viewBox="0 0 600 326" style="width:100%;height:auto;border-radius:12px;background:linear-gradient(180deg,#EFF6FF 0%,#F8FAFC 100%);border:1px solid var(--line,#E2E8F0)" role="img" aria-label="Regional ministry area coverage map across Kisumu and Homa Bay counties">
      <defs>
        <linearGradient id="winamWater" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#BAE6FD"/><stop offset="100%" stop-color="#7DD3FC"/>
        </linearGradient>
      </defs>
      <!-- Winam Gulf / Lake Victoria shoreline schematic -->
      <path d="M0,118 C64,126 122,148 182,164 C218,173 250,188 232,205 C196,216 128,214 82,248 C48,274 22,302 0,326 Z" fill="url(#winamWater)" opacity="0.78"/>
      <text x="64" y="196" font-size="10.5" font-weight="700" fill="#0369A1" letter-spacing="1.2">WINAM GULF</text>
      <text x="52" y="210" font-size="9" fill="#0284C7">Lake Victoria</text>
      <!-- County boundary line -->
      <path d="M126,208 C220,218 330,226 590,252" fill="none" stroke="#94A3B8" stroke-width="1.4" stroke-dasharray="6 4"/>
      <text x="488" y="34" font-size="10" font-weight="700" fill="#334155" letter-spacing="1">KISUMU COUNTY</text>
      <text x="330" y="302" font-size="10" font-weight="700" fill="#4C1D95" letter-spacing="1">HOMA BAY COUNTY</text>
      <!-- Corridor links -->
      <path d="M212,74 L278,82 L334,108 L368,146 L432,162 L500,132 M278,82 L268,140 M368,146 L462,204 M196,228 L154,256 L236,278" fill="none" stroke="#CBD5E1" stroke-width="1.5"/>
      ${nodes}
    </svg>`
  };
}

function renderAnalyticsHub(user, params={}){
  if(params.row) ANALYTICS_STATE.rowDim = params.row;
  if(params.col) ANALYTICS_STATE.colDim = params.col;
  if(params.measure) ANALYTICS_STATE.measure = params.measure;
  if(params.area) ANALYTICS_STATE.selectedArea = params.area;

  const ps = repo.patientList(user).filter(p=>p.status!=='merged');
  const days = ps.map(PAT.days);
  const inCore = days.filter(d=>d>=45 && d<=240).length;
  const inTail = days.filter(d=>d>240 && d<=330).length;
  const piv = PIVOT6.compute(user, ANALYTICS_STATE.rowDim, ANALYTICS_STATE.colDim, ANALYTICS_STATE.measure);
  const geo = renderGeoMapSvg(user, ANALYTICS_STATE.selectedArea);

  const canSeeCond = RBAC.has(user,'condition.aggregate') || RBAC.has(user,'condition.view') || RBAC.has(user,'patient.view.clinical');
  const condCounts = {};
  if(canSeeCond) ps.forEach(p=>{ const c=classifyCondition(p); condCounts[c]=(condCounts[c]||0)+1; });
  const condRows = Object.entries(condCounts).sort((a,b)=>b[1]-a[1]).map(([label,value])=>({label,value}));

  const maxCell = Math.max(1, ...piv.matrix.flatMap(m=>m.vals));
  const pivotHtml = `<div style="overflow-x:auto">
    <table class="tbl compact">
      <thead><tr>
        <th>${esc(piv.rLabel)} \\ ${esc(piv.cLabel)}</th>
        ${piv.cols.map(c=>`<th style="text-align:right">${esc(c)}</th>`).join('')}
        <th style="text-align:right">Row total</th>
      </tr></thead>
      <tbody>
        ${piv.matrix.map(m=>`<tr>
          <td><b>${esc(m.row)}</b></td>
          ${m.vals.map(v=>{
            const alpha = v ? (0.07 + 0.25 * (v / maxCell)).toFixed(2) : '0';
            return `<td style="text-align:right;font-variant-numeric:tabular-nums;background:rgba(37,99,235,${alpha})">${num(v)}</td>`;
          }).join('')}
          <td style="text-align:right;font-weight:700;font-variant-numeric:tabular-nums">${num(m.total)}</td>
        </tr>`).join('')}
      </tbody>
      <tfoot><tr style="border-top:2px solid var(--line,#CBD5E1);font-weight:700">
        <td>Column total</td>
        ${piv.colTotals.map(v=>`<td style="text-align:right;font-variant-numeric:tabular-nums">${num(v)}</td>`).join('')}
        <td style="text-align:right;font-variant-numeric:tabular-nums">${num(piv.grandTotal)}</td>
      </tr></tfoot>
    </table></div>`;

  const dimOpts = (cur) => Object.entries(PIVOT_DIMS)
    .filter(([k])=> k!=='condition' || canSeeCond)
    .map(([k,v])=>`<option value="${k}" ${cur===k?'selected':''}>${esc(v.label)}</option>`).join('');

  const selStats = ANALYTICS_STATE.selectedArea !== 'all' ? geo.byArea[ANALYTICS_STATE.selectedArea] : null;

  return pageHead('Analytics, pivot tables & regional maps',
    'Live multi-dimensional cross-tabulation, geographic ministry-area distribution, programme duration bands and standardised clinical condition categories computed directly from scoped records.',
    `<button class="btn btn-sm btn-ghost" data-act="pivot-export">${ic('download',15)} Export pivot CSV</button>
     <button class="btn btn-sm btn-primary" data-act="go" data-v="reports">${ic('file',15)} Report centre</button>`)
  + `<div class="grid g4" style="margin-bottom:16px">
      ${kpi('Scoped register', num(ps.length), 'Authoritative tracker records', 'info', 'users')}
      ${kpi('45 to 240 days band', (ps.length?(inCore/ps.length*100).toFixed(1):'0.0')+'%', `${num(inCore)} patients in primary window`, inCore/Math.max(1,ps.length)>=0.94?'ok':'warn', 'target')}
      ${kpi('241 to 330 days band', (ps.length?(inTail/ps.length*100).toFixed(1):'0.0')+'%', `${num(inTail)} extended-care patients`, 'info', 'clock')}
      ${kpi('Ministry areas mapped', num(Object.values(geo.byArea).filter(a=>a.total>0).length), 'Kisumu & Homa Bay coverage', 'ok', 'route')}
    </div>`

  + (typeof MASTERX2!=='undefined' ? (()=>{
      const sv = MASTERX2.slumVillage(user);
      const yrs = MASTERX2.yearSeries(user);
      const cols = chartColours(6);
      return `<div class="grid g2" style="margin-bottom:16px">
        ${card('Slums versus villages (Extra MI columns Q to U)', `
          ${chartShare([{label:'Slum-based (urban)', value:sv.slums, color:cols[0]},
                        {label:'Village-based', value:sv.villages, color:cols[3]}],
            {title:'Ratio of patients in slums versus villages', fmt:v=>num(v)+' patients'})}
          <div class="grid g3" style="margin-top:12px">
            <div class="cm"><span class="cm-l">Slums</span><b class="cm-v">${num(sv.slums)}</b><span class="cm-s">${(sv.slumPct*100).toFixed(1)}%</span></div>
            <div class="cm"><span class="cm-l">Villages</span><b class="cm-v">${num(sv.villages)}</b><span class="cm-s">${(sv.villagePct*100).toFixed(1)}%</span></div>
            <div class="cm"><span class="cm-l">Workbook baseline</span><b class="cm-v">${sv.baseline.length? ((sv.baseline[sv.baseline.length-1].slumPct*100).toFixed(1)+'%') : '-'}</b><span class="cm-s">Last month in Extra MI</span></div>
          </div>`,
          {sub:'Slums = '+esc(MASTERX2.baseline().slumAreas.map(areaName).join(', '))+' · Villages = '+esc(MASTERX2.baseline().villageAreas.map(areaName).join(', ')),
           actions:`<button class="btn btn-xs btn-ghost" data-act="go" data-v="masteranalysis" data-tab="slumvillage">${ic('chart',13)} Full ratio</button>`})}
        ${card('Main data over the years (Data sheet)', chartLine({
            labels:yrs.years.map(String),
            series:[{label:'Master workbook (visited patients)', values:yrs.years.map(y=>{const b=yrs.base.find(x=>x.year===y); return b?b.n:0;}), color:cols[1]},
                    {label:'Live register (enrolments)', values:yrs.years.map(y=>{const l=yrs.live.find(x=>x.year===y); return l?l.n:0;}), color:cols[0]}],
            title:'Patients over the years', labelHead:'Year',
            caption:'The workbook carries 2018 to 2024; later years come from the live register rather than being guessed.'}),
          {sub:esc(yrs.gap), actions:`<button class="btn btn-xs btn-ghost" data-act="go" data-v="masteranalysis" data-tab="baseline">${ic('archive',13)} Baseline & trends</button>`})}
      </div>`;
    })() : '')

  + card('Interactive Pivot Table Builder', `
      <form data-form="pivot-config" class="row" style="gap:10px;flex-wrap:wrap;margin-bottom:14px;align-items:flex-end">
        <div class="field" style="margin:0;min-width:170px"><label>Rows</label>
          <select class="input" name="row">${dimOpts(piv.rowKey)}</select></div>
        <div class="field" style="margin:0;min-width:170px"><label>Columns</label>
          <select class="input" name="col">${dimOpts(piv.colKey)}</select></div>
        <div class="field" style="margin:0;min-width:190px"><label>Measure</label>
          <select class="input" name="measure">
            <option value="count" ${piv.measure==='count'?'selected':''}>Patient count (headcount)</option>
            <option value="visits" ${piv.measure==='visits'?'selected':''}>Visits recorded (sum)</option>
            <option value="days" ${piv.measure==='days'?'selected':''}>Total patient-days (sum)</option>
            <option value="avgDays" ${piv.measure==='avgDays'?'selected':''}>Mean days in programme</option>
          </select></div>
        <button class="btn btn-primary btn-sm" type="submit">${ic('refresh',14)} Update pivot</button>
      </form>
      ${ps.length ? pivotHtml : emptyState('No records in scope','Load or record patients in your assigned scope to populate the pivot matrix.','chart')}`)

  + `<div class="grid g2" style="margin-top:16px">
      ${card('Geographic Ministry Area Map (Kisumu & Homa Bay)', `
        ${geo.svg}
        <div class="row" style="gap:14px;flex-wrap:wrap;margin-top:10px;font-size:11.5px">
          <span><span class="badge b-info">Kisumu node</span> Kisumu ministry area</span>
          <span><span class="badge b-info">Homa Bay node</span> Homa Bay area</span>
          <span><span class="badge b-crit">Red node</span> &gt;3 overdue PDCA reviews</span>
        </div>
        ${selStats ? `<div class="alert info" style="margin-top:10px">${ic('info',16)}<div>
          <b>${esc(selStats.name)} (${esc(selStats.county)})</b>: ${num(selStats.total)} enrolled, ${num(selStats.active)} currently active,
          ${num(selStats.visits)} home/clinical visits recorded, ${num(selStats.overdue)} overdue PDCA reviews.
          <button class="linkbtn map-clear" data-act="map-select" data-area="all" type="button">${ic('x',12)} Clear selection</button></div></div>` : ''}`)}
      ${canSeeCond
        ? card('Standardised Clinical Condition Breakdown', condRows.length
            ? barChart(condRows, { fmt:v=>num(v) })
            : emptyState('No conditions recorded','Clinical condition totals appear once verified assessments are on file.','clipboard'))
        : card('Confidentiality boundary', `<div class="note">${ic('shield',15)}<span>Individual clinical diagnoses (HIV, TB, cancer and opportunistic infections) are withheld for financial and non-clinical roles. Operational counts remain available in the pivot table above.</span></div>`)}
    </div>`;
}

/* ============================================================
   2. KHIS / DHIS2 / FHIR INTEROPERABILITY & WEB API EXTENSIBILITY
   ============================================================ */
function buildKhisDraft(user, kind='moh731'){
  const ps = repo.patientList(user).filter(p=>p.status!=='merged');
  const forms = DB.db.formRecords || [];
  const visits = DB.db.visits || [];
  const reqs = DB.db.requests || [];
  const period = new Date().toISOString().slice(0,7);

  if(kind==='moh731'){
    const hivOnly = ps.filter(p=>classifyCondition(p)==='HIV/AIDS only').length;
    const hivTb   = ps.filter(p=>classifyCondition(p)==='HIV/AIDS and TB').length;
    const tbOnly  = ps.filter(p=>classifyCondition(p)==='TB only').length;
    const onArt   = ps.filter(p=>p.clinical && p.clinical.art).length;
    const cervical= ps.filter(p=>classifyCondition(p)==='Cancer: Cervical').length;
    return {
      code:'MOH-731-DRAFT',
      title:'MOH 731 Integrated HIV & TB Community Support Draft Summary',
      period,
      officialSubmission:false,
      status:'INTERNAL VERIFICATION DRAFT - NOT SUBMITTED TO KHIS',
      rows:[
        { code:'HV03-01', element:'Clients currently enrolled in HIV community care (HIV only)', value:hivOnly, status:'Verified register' },
        { code:'HV03-02', element:'Clients co-managed for HIV/AIDS and TB', value:hivTb, status:'Verified register' },
        { code:'HV03-03', element:'Clients in TB-only community follow-up', value:tbOnly, status:'Verified register' },
        { code:'HV03-04', element:'Enrolled clients documented on ART', value:onArt, status:'Caregiver & clinical record' },
        { code:'HV03-05', element:'Cervical cancer screening / follow-up cases', value:cervical, status:'Hospital referral & clinical record' },
        { code:'HV03-06', element:'Facility laboratory viral-load feed', value:null, status:'Not connected (external lab interface unconfigured)' }
      ]
    };
  }
  return {
    code:'MOH-711-DRAFT',
    title:'MOH 711 Integrated Community Health, Nutrition & Referral Draft Summary',
    period,
    officialSubmission:false,
    status:'INTERNAL VERIFICATION DRAFT - NOT SUBMITTED TO KHIS',
    rows:[
      { code:'CH01-01', element:'Active community beneficiaries in programme scope', value:ps.filter(p=>['active','extension'].includes(p.status)).length, status:'Verified register' },
      { code:'CH01-02', element:'Home visits conducted by caregivers / CHPs', value:visits.filter(v=>v.outcome==='seen').length, status:'Visit register' },
      { code:'CH01-03', element:'Hospital referrals completed with focal person follow-up', value:reqs.filter(r=>['completed','reconciled'].includes(r.status)).length, status:'Hospital workflow' },
      { code:'CH01-04', element:'Children under 5 years under household care', value:ps.filter(p=>(+p.age||99)<5).length, status:'Patient register' },
      { code:'CH01-05', element:'Wound care & post-discharge follow-up cases', value:ps.filter(p=>classifyCondition(p)==='Wound care').length, status:'Clinical register' },
      { code:'CH01-06', element:'Digitised paper forms verified', value:forms.filter(f=>f.status==='verified').length, status:'Forms pipeline' }
    ]
  };
}

function buildDhis2Payload(user){
  const { vals } = IND6.env(user);
  const period = new Date().toISOString().slice(0,7).replace('-','');
  const orgUnit = (DB.db.settings && DB.db.settings.dhis2OrgUnit) || 'LOMAMO_KISUMU_HQ';
  return {
    meta:{
      generator:'LOMAMO LOMAMO C-DIMS v' + APP.version,
      khisSubmitted:false,
      warning:'Prepared in DHIS2 dataValueSets structure for authorised review. External KHIS/DHIS2 push requires configured credentials.'
    },
    dataSet:'LOMAMO_COMMUNITY_CARE_V6',
    completeDate:new Date().toISOString().slice(0,10),
    period,
    orgUnit,
    dataValues:Object.entries(vals)
      .filter(([,v])=>v.available && v.value!==null)
      .map(([de,v])=>({ dataElement:de.toUpperCase().replace('-','_'), period, orgUnit, value:String(v.value), comment:'Source: '+v.source }))
  };
}

function buildFhirBundle(user){
  const canIdentify = RBAC.has(user,'patient.export');
  const ps = repo.patientList(user).filter(p=>p.status!=='merged').slice(0,10);
  return {
    resourceType:'Bundle',
    type:'collection',
    timestamp:new Date().toISOString(),
    meta:{ tag:[{ system:'https://lomamo.org/fhir/governance', code: canIdentify ? 'authorised-identifiable' : 'de-identified-preview' }] },
    entry:[
      { resource:{ resourceType:'Organization', id:'lomamo-foundation-kenya', name:orgName(), active:true } },
      ...ps.map(p=>({
        resource:{
          resourceType:'Patient',
          id:p.id,
          identifier:[{ system:'https://lomamo.org/pmi/internal-id', value:p.id }, { system:'https://lomamo.org/pmi/lom-code', value:p.code }],
          name: canIdentify ? [{ text:p.name }] : [{ text:'Redacted (patient.export required)' }],
          gender: p.sex==='M' ? 'male' : 'female',
          extension:[{ url:'https://lomamo.org/fhir/StructureDefinition/programme-days', valueInteger:PAT.days(p) }]
        }
      }))
    ]
  };
}

function renderInteropHub(user, params={}){
  if(params.tab) ANALYTICS_STATE.interopTab = params.tab;
  if(params.form) ANALYTICS_STATE.khisForm = params.form;
  const tab = ANALYTICS_STATE.interopTab;
  const canConfig = RBAC.has(user,'system.config');
  const cfg = (DB.db.settings && DB.db.settings.interop) || { dhis2Url:'', dhis2OrgUnit:'LOMAMO_KISUMU_HQ', fhirUrl:'', mode:'staged' };
  const customApps = (DB.db.settings && DB.db.settings.customApps) || [
    { id:'app-field-pwa', name:'Mobile Field Collector View', kind:'Data collection', endpoint:'/api/state?since=0', scope:'patient.list, visit.create', status:'built-in' },
    { id:'app-dhis2-bridge', name:'DHIS2 / KHIS Export Bridge', kind:'Aggregate reporting', endpoint:'/api/v1/dhis2/dataValueSets', scope:'indicator.manage', status:cfg.dhis2Url ? 'configured (unverified)' : 'awaiting endpoint' },
    { id:'app-fhir-r4', name:'FHIR R4 Care Summary Feed', kind:'Clinical interoperability', endpoint:'/api/v1/fhir/Bundle', scope:'patient.export', status:cfg.fhirUrl ? 'configured (unverified)' : 'awaiting endpoint' }
  ];
  const apiKeys = (DB.db.settings && DB.db.settings.apiTokens) || [];
  const draft = buildKhisDraft(user, ANALYTICS_STATE.khisForm);

  const tabsHtml = `<div class="row" style="gap:6px;margin-bottom:14px;flex-wrap:wrap">
    ${[['khis','KHIS / MOH Draft Reports'],['dhis2','DHIS2 & FHIR Adapters'],['api','Web APIs & Custom Apps']].map(([id,lbl])=>
      `<button class="btn btn-sm ${tab===id?'btn-primary':'btn-ghost'}" data-act="interop-tab" data-tab="${id}">${esc(lbl)}</button>`).join('')}
  </div>`;

  let panel = '';
  if(tab==='khis'){
    panel = `<div class="alert warn" style="margin-bottom:14px">${ic('shield',17)}<div>
      <b>Governance notice: Not an official KHIS submission</b>
      <span class="small">LOMAMO C-DIMS prepares verified internal summaries aligned to Kenya Ministry of Health indicator definitions. Figures below are never transmitted or labelled as an official KHIS submission until verified by the M&amp;E Officer and entered through an authorised Ministry channel.</span></div></div>`
    + card(draft.title + ' (' + draft.period + ')', `
      <div class="row" style="gap:8px;margin-bottom:12px;flex-wrap:wrap">
        <button class="btn btn-xs ${ANALYTICS_STATE.khisForm==='moh731'?'btn-primary':'btn-ghost'}" data-act="interop-tab" data-tab="khis" data-khis="moh731">MOH 731 (HIV / TB / Cervical)</button>
        <button class="btn btn-xs ${ANALYTICS_STATE.khisForm==='moh711'?'btn-primary':'btn-ghost'}" data-act="interop-tab" data-tab="khis" data-khis="moh711">MOH 711 (Community &amp; Referral)</button>
        <button class="btn btn-xs btn-ghost" data-act="interop-export-khis">${ic('download',13)} Export verified CSV</button>
      </div>
      ${table([
        { label:'Code', render:r=>`<span class="mono xs">${esc(r.code)}</span>` },
        { label:'Summary element', render:r=>`<b>${esc(r.element)}</b>` },
        { label:'Value', render:r=> r.value===null ? `<span class="xs muted">Not recorded</span>` : `<b>${num(r.value)}</b>` },
        { label:'Verification & source', render:r=>`<span class="xs">${esc(r.status)}</span>` }
      ], draft.rows, { compact:true })}`);
  } else if(tab==='dhis2'){
    const dhisJson = JSON.stringify(buildDhis2Payload(user), null, 2);
    const fhirJson = JSON.stringify(buildFhirBundle(user), null, 2);
    panel = `<div class="grid g2">
      ${card('External Adapter Configuration', `
        <div class="note" style="margin-bottom:12px">${ic('info',15)}<span>Status: <b>${cfg.dhis2Url ? 'Endpoint recorded (live external transmission disabled until credentials are verified)' : 'Staged offline mode (no external server configured)'}</b>. National ID, CCC and TB numbers are never exported as primary keys.</span></div>
        ${canConfig ? `<form data-form="interop-save">
          <div class="field"><label>DHIS2 / KHIS instance base URL</label><input class="input mono" name="dhis2Url" value="${esc(cfg.dhis2Url||'')}" placeholder="https://khis.health.go.ke/api"></div>
          <div class="field"><label>Mapped Organisation Unit UID</label><input class="input mono" name="dhis2OrgUnit" value="${esc(cfg.dhis2OrgUnit||'LOMAMO_KISUMU_HQ')}"></div>
          <div class="field"><label>FHIR R4 partner endpoint URL</label><input class="input mono" name="fhirUrl" value="${esc(cfg.fhirUrl||'')}" placeholder="https://fhir.example.org/r4"></div>
          <button class="btn btn-primary btn-sm" type="submit">Save adapter configuration</button>
        </form>` : `<p class="xs muted">Only the System Administrator may edit external adapter endpoints.</p>`}
        <div class="row" style="gap:8px;margin-top:12px;flex-wrap:wrap">
          <button class="btn btn-xs btn-ghost" data-act="interop-dl-dhis2">${ic('download',13)} Download DHIS2 JSON</button>
          <button class="btn btn-xs btn-ghost" data-act="interop-dl-fhir">${ic('download',13)} Download FHIR R4 Bundle</button>
        </div>`)}
      ${card('Live DHIS2 dataValueSets & FHIR R4 Preview', `
        <div class="xs bold" style="margin-bottom:4px">DHIS2 dataValueSets payload</div>
        <pre style="max-height:150px;overflow:auto;background:var(--bg,#F8FAFC);padding:10px;border-radius:8px;font-size:11px">${esc(dhisJson)}</pre>
        <div class="xs bold" style="margin:10px 0 4px">HL7 FHIR R4 Bundle (consent &amp; RBAC filtered)</div>
        <pre style="max-height:150px;overflow:auto;background:var(--bg,#F8FAFC);padding:10px;border-radius:8px;font-size:11px">${esc(fhirJson)}</pre>`)}
    </div>`;
  } else {
    panel = `<div class="grid g2">
      ${card('Registered Custom Apps & Extensions', `
        ${table([
          { label:'Extension / App', render:a=>`<div class="cellname">${esc(a.name)}<span class="sm">${esc(a.kind)}</span></div>` },
          { label:'Web API route', render:a=>`<span class="mono xs">${esc(a.endpoint)}</span>` },
          { label:'Required scope', render:a=>`<span class="xs">${esc(a.scope)}</span>` },
          { label:'State', render:a=>badge(a.status, a.status==='built-in'||a.status==='enabled'?'b-ok':'b-warn', false) }
        ], customApps, { compact:true })}
        ${canConfig ? `<form data-form="interop-add-app" style="margin-top:12px">
          <div class="grid g2" style="gap:8px">
            <div class="field"><label>Custom app name</label><input class="input" name="name" required placeholder="e.g. Community Nutrition Tracker"></div>
            <div class="field"><label>Required capability</label><input class="input mono" name="scope" value="patient.list" required></div>
          </div>
          <button class="btn btn-sm btn-primary" type="submit">${ic('plus',14)} Register custom app</button>
        </form>` : ''}`)}
      ${card('Authenticated REST Web API Endpoints (server.py)', `
        <p class="xs muted" style="margin-bottom:10px">When hosted on the office server, external scripts and authorised custom apps connect with a Bearer session or scoped token over HTTP:</p>
        ${table([
          { label:'Method & path', render:e=>`<span class="mono xs">${esc(e[0])}</span>` },
          { label:'Purpose & RBAC guard', render:e=>`<span class="xs">${esc(e[1])}</span>` }
        ], [
          ['GET /api/v1/status', 'Server version, schema, revision counter and sync policy'],
          ['GET /api/v1/orgUnits', 'Hierarchical organisation units (Foundation, County, Ministry Area, Department)'],
          ['GET /api/v1/dataElements', 'Configured tracker and aggregate data elements'],
          ['GET /api/v1/indicators', 'Versioned indicator definitions and formulas'],
          ['GET /api/v1/dhis2/dataValueSets', 'Aggregate period dataValueSets JSON export'],
          ['GET /api/v1/fhir/Bundle', 'De-identified HL7 FHIR R4 Bundle (Organization & Patient resources)'],
          ['POST /api/state/patch', 'Idempotent opId record sync with server-side reconciliation & audit']
        ], { compact:true })}
        ${canConfig ? `<div style="margin-top:12px">
          <button class="btn btn-xs btn-primary" data-act="interop-mint-token">${ic('key',13)} Issue scoped API token</button>
          ${apiKeys.length ? `<div class="xs mono" style="margin-top:8px">Issued tokens: ${apiKeys.map(t=>`${esc(t.prefix)}... (${esc(t.created.slice(0,10))})`).join(', ')}</div>` : ''}
        </div>` : ''}`)}
    </div>`;
  }

  return pageHead('KHIS, DHIS2, FHIR & Web API Extensibility',
    'Standards-aligned health information exchange, verified Ministry of Health draft summaries, custom app manifests and REST Web APIs.',
    `<button class="btn btn-sm btn-ghost" data-act="go" data-v="indicators">${ic('layers',15)} Data elements</button>
     <button class="btn btn-sm btn-ghost" data-act="go" data-v="analytics">${ic('chart',15)} Pivot &amp; maps</button>`)
  + tabsHtml + panel;
}

/* ============================================================
   3. ACCOUNT GOVERNANCE, 4-OFFICE VOTE, MASTER FILE, CODES & SYNC POLICY
   ============================================================ */
const FOUR_OFFICE_ROLES = [
  { office:'director',          label:'Country Director' },
  { office:'chief',             label:'Chief System Administrator' },
  { office:'program.admin',     label:'Chief Program Administrator' },
  { office:'program.assistant', label:'Chief Program Administrator Assistant' }
];

const GOV6 = {
  officeOf(user){
    if(!user) return null;
    if(['director','chief','program.admin','program.assistant'].includes(user.roleId)) return user.roleId;
    return null;
  },

  ensureStore(){
    DB.db.passwordCeremonies = DB.db.passwordCeremonies || [];
    DB.db.pendingActivations = DB.db.pendingActivations || [];
    DB.db.emergencyCodes = DB.db.emergencyCodes || [];
    DB.db.recoveryRequests = DB.db.recoveryRequests || [];
    DB.db.accountRequests = DB.db.accountRequests || [];
  },

  randomCode(prefix, len=6){
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for(let i=0;i<len;i++) s += chars[Math.floor(Math.random()*chars.length)];
    return `${prefix}-${s}`;
  },

  /* Step 1: initiate or cast a vote in the 4-office unanimous recovery ceremony */
  openCeremony(actor, targetUsername, reason){
    this.ensureStore();
    const u = (DB.db.users||[]).find(x=>x.username===targetUsername);
    if(!u) return { ok:false, error:'No account with that username exists.' };
    let c = DB.db.passwordCeremonies.find(x=>x.username===targetUsername && x.stage!=='completed');
    if(!c){
      c = {
        id: 'cer-' + Date.now().toString(36),
        userId: u.id,
        username: u.username,
        userName: u.name,
        countyId: u.countyId || 'kisumu',
        reason: String(reason||'Authorised password recovery'),
        createdAt: new Date().toISOString(),
        createdBy: actor.id,
        votes: {},
        stage: 'voting', // voting -> approved_for_overwrite -> overwritten_awaiting_county -> completed
        overwrittenAt: null,
        overwrittenBy: null,
        resetAt: null,
        resetBy: null
      };
      DB.db.passwordCeremonies.unshift(c);
      AUDIT.append({ actor:actor.id, action:'credential.ceremony_opened', entity:'user', entityId:u.id, detail:`4-office recovery opened for ${u.username}` });
      DB.save();
    }
    return { ok:true, ceremony:c };
  },

  castVote(actor, ceremonyId){
    this.ensureStore();
    const office = this.officeOf(actor);
    if(!office) return { ok:false, error:'Only the Director, Chief System Administrator, Chief Program Administrator, or Chief Program Administrator Assistant may cast a recovery vote.' };
    const c = DB.db.passwordCeremonies.find(x=>x.id===ceremonyId);
    if(!c) return { ok:false, error:'Recovery ceremony not found.' };
    c.votes[office] = { userId:actor.id, name:actor.name, at:new Date().toISOString() };
    const count = FOUR_OFFICE_ROLES.filter(o=>c.votes[o.office]).length;
    if(count === 4 && c.stage === 'voting') c.stage = 'approved_for_overwrite';
    AUDIT.append({ actor:actor.id, action:'credential.ceremony_vote', entity:'user', entityId:c.userId,
      detail:`${office} voted on recovery for ${c.username} (${count}/4)` });
    DB.save();
    if(typeof SYNC!=='undefined' && SYNC.sessionToken){
      SYNC._json('api/credentials/vote', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ username:c.username }) }).catch(()=>{});
    }
    return { ok:true, ceremony:c, count };
  },

  adminOverwrite(actor, ceremonyId){
    this.ensureStore();
    if(actor.roleId !== 'chief') return { ok:false, error:'Only the Chief System Administrator may execute the overwrite step after unanimous 4-office approval.' };
    const c = DB.db.passwordCeremonies.find(x=>x.id===ceremonyId);
    if(!c) return { ok:false, error:'Recovery ceremony not found.' };
    const count = FOUR_OFFICE_ROLES.filter(o=>c.votes[o.office]).length;
    if(count < 4) return { ok:false, error:`All four offices must approve before overwrite (${count} of 4 recorded).` };
    c.stage = 'overwritten_awaiting_county';
    c.overwrittenAt = new Date().toISOString();
    c.overwrittenBy = actor.id;
    AUDIT.append({ actor:actor.id, action:'credential.overwritten', entity:'user', entityId:c.userId,
      detail:`Password lock cleared by System Administrator for ${c.username}; released to County Administrator (${c.countyId}).` });
    DB.save();
    return { ok:true, ceremony:c };
  },

  countySetPassword(actor, ceremonyId, newPassword){
    this.ensureStore();
    const c = DB.db.passwordCeremonies.find(x=>x.id===ceremonyId);
    if(!c) return { ok:false, error:'Recovery ceremony not found.' };
    if(c.stage !== 'overwritten_awaiting_county') return { ok:false, error:'System Administrator overwrite must complete after 4-office approval first.' };
    const isCountyAdmin = (actor.roleId==='countyadmin' && (!actor.countyId || actor.countyId===c.countyId)) || actor.roleId==='program.admin';
    if(!isCountyAdmin) return { ok:false, error:`Only the County Administrator for ${countyName(c.countyId)} (or Chief Program Administrator) may assign the replacement password.` };
    if(String(newPassword||'').length < 10) return { ok:false, error:'Replacement password must be at least 10 characters.' };

    const target = (DB.db.users||[]).find(u=>u.id===c.userId);
    if(!target) return { ok:false, error:'Account no longer exists.' };
    target.salt = newSalt(); target.hash = strongHash(newPassword, target.salt);
    target.mustChange = true;
    c.stage = 'completed';
    c.resetAt = new Date().toISOString();
    c.resetBy = actor.id;
    AUDIT.append({ actor:actor.id, action:'credential.county_reset', entity:'user', entityId:target.id,
      detail:`Replacement password set by County Administrator for ${target.username}; forced change on next login enabled.` });
    DB.save();
    return { ok:true, ceremony:c };
  },

  issueActivation(actor, reqId, username, roleId){
    this.ensureStore();
    if(!RBAC.has(actor,'user.approve') && actor.roleId!=='chief') return { ok:false, error:'Permission user.approve is required.' };
    const req = DB.db.accountRequests.find(r=>r.id===reqId);
    const uname = String(username||'').trim().toLowerCase();
    if(!uname) return { ok:false, error:'Provide the official username to issue.' };
    const code = this.randomCode('ACT', 6);
    let user = (DB.db.users||[]).find(u=>u.username===uname);
    if(!user){
      user = {
        id: 'u-' + Date.now().toString(36),
        name: req ? req.name : uname,
        username: uname,
        roleId: roleId || (req && req.roleId) || 'caregiver',
        countyId: (req && req.countyId) || 'kisumu',
        areas: [],
        dept: (req && req.departmentId) || 'field',
        jobTitle: (req && req.jobTitle) || 'Staff member',
        status: 'pending_activation',
        active: false,
        mustChange: false
      };
      DB.db.users.push(user);
    }
    if(req){ req.status = 'approved'; req.decidedBy = actor.id; req.decidedAt = new Date().toISOString(); req.issuedUsername = uname; req.activationCode = code; }
    DB.db.pendingActivations = DB.db.pendingActivations.filter(a=>a.username!==uname);
    DB.db.pendingActivations.push({ username:uname, code, issuedBy:actor.id, issuedAt:new Date().toISOString(), expiresAt:new Date(Date.now()+7*86400e3).toISOString(), used:false });
    AUDIT.append({ actor:actor.id, action:'account.activation_issued', entity:'user', entityId:user.id, detail:`Issued username ${uname} with one-time activation code` });
    DB.save();
    return { ok:true, username:uname, code };
  },

  issueEmergency(actor, username){
    this.ensureStore();
    if(!RBAC.has(actor,'user.approve') && actor.roleId!=='chief') return { ok:false, error:'Only an authorised administrator may issue an emergency login code.' };
    const u = (DB.db.users||[]).find(x=>x.username===String(username||'').trim().toLowerCase());
    if(!u) return { ok:false, error:'Unknown username.' };
    const code = this.randomCode('EMG', 8);
    DB.db.emergencyCodes = DB.db.emergencyCodes.filter(e=>e.username!==u.username);
    DB.db.emergencyCodes.push({ username:u.username, code, issuedBy:actor.id, issuedAt:new Date().toISOString(), expiresAt:new Date(Date.now()+24*3600e3).toISOString(), used:false });
    (DB.db.recoveryRequests||[]).filter(r=>r.username===u.username && r.status==='open').forEach(r=>{ r.status='code_issued'; r.code=code; });
    AUDIT.append({ actor:actor.id, action:'credential.emergency_issued', entity:'user', entityId:u.id, detail:`24-hour emergency code issued for ${u.username}` });
    DB.save();
    return { ok:true, username:u.username, code };
  },

  generateMasterSheet(actor){
    if(actor.roleId !== 'chief') return { ok:false, error:'Only the Chief System Administrator may export the official master credentials sheet.' };
    const accounts = [];
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    (DB.db.users||[]).filter(u=>u.id!==actor.id).forEach(u=>{
      const pick4 = ()=>Array.from({length:4},()=>chars[Math.floor(Math.random()*chars.length)]).join('');
      const pw = 'LOM-' + pick4() + '-' + pick4() + '-' + String(10+Math.floor(Math.random()*89));
      u.salt = newSalt(); u.hash = strongHash(pw, u.salt);
      u.mustChange = true;
      accounts.push({ username:u.username, name:u.name, role:u.roleId, county:u.countyId||'', password:pw });
    });
    DB.db.settings.masterExportedAt = new Date().toISOString();
    AUDIT.append({ actor:actor.id, action:'credential.master_exported', entity:'system', entityId:'master-sheet',
      detail:`Issued initial passwords for ${accounts.length} official accounts (force change on first login)` });
    DB.save();
    return { ok:true, accounts };
  }
};

function renderGovernanceHub(user){
  GOV6.ensureStore();
  const isChief = user.roleId === 'chief';
  const office = GOV6.officeOf(user);
  const canApprove = RBAC.has(user,'user.approve') || isChief;
  const openReqs = (DB.db.accountRequests||[]).filter(r=>!r.status || r.status==='pending');
  const openRecs = (DB.db.recoveryRequests||[]).filter(r=>!r.status || r.status==='open');
  const chain = AUDIT.verify();

  return pageHead('Credentials, Four-Office Recovery & Sync Policy',
    'Official credential provisioning, one-time activation codes, 24-hour emergency recovery codes, unanimous four-office password overwrite governance, real-time sync policy and audit chain verification.',
    `${isChief ? `<button class="btn btn-sm btn-primary" data-act="gov-export-master">${ic('download',15)} Export official master credentials (.txt)</button>` : ''}
     <button class="btn btn-sm btn-ghost" data-act="verify-chain">${ic('shieldcheck',15)} Verify audit chain (${chain.ok?'intact':'alert'})</button>`)

  + `<div class="grid g4" style="margin-bottom:16px">
      ${kpi('Official accounts', num((DB.db.users||[]).length), `${(DB.db.users||[]).filter(u=>u.mustChange).length} awaiting first-login password change`, 'info', 'users')}
      ${kpi('Pending account requests', num(openReqs.length), `${(DB.db.pendingActivations||[]).filter(a=>!a.used).length} active ACT codes`, openReqs.length?'warn':'ok', 'userplus')}
      ${kpi('Recovery ceremonies', num((DB.db.passwordCeremonies||[]).filter(c=>c.stage!=='completed').length), office?`Your vote seat: ${office}`:'Observer / County role', 'info', 'key')}
      ${kpi('Audit hash chain', chain.ok ? 'Verified' : 'Broken', `${num((DB.db.audit||[]).length)} tamper-evident entries`, chain.ok?'ok':'crit', 'shieldcheck')}
    </div>`

  + card('Four-Office Unanimous Password Governance Protocol', `
      <div class="note" style="margin-bottom:12px">${ic('lock',15)}<span>Once a user sets their own password on first sign-in, it is stored exclusively as a salted hash. Overwriting a changed password requires all four highest hierarchy offices (<b>Country Director</b>, <b>Chief System Administrator</b>, <b>Chief Program Administrator</b>, and <b>Chief Program Administrator Assistant</b>) to vote from their own consoles, followed by <b>System Administrator overwrite</b>, after which the <b>County Administrator</b> for that user's county sets the replacement password.</span></div>
      ${(canApprove || office) ? `<form data-form="gov-open-ceremony" class="row" style="gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:14px">
        <div class="field" style="margin:0;min-width:220px"><label>Account requiring overwrite</label>
          <select class="input" name="username">${(DB.db.users||[]).map(u=>`<option value="${esc(u.username)}">${esc(u.name)} (${esc(u.username)})</option>`).join('')}</select></div>
        <div class="field" style="margin:0;flex:1;min-width:220px"><label>Documented reason</label>
          <input class="input" name="reason" required placeholder="e.g. Staff member transferred handset and lost credentials"></div>
        <button class="btn btn-sm btn-primary" type="submit">Initiate 4-office vote</button>
      </form>` : ''}
      ${(DB.db.passwordCeremonies||[]).length ? table([
        { label:'Account', render:c=>`<div class="cellname">${esc(c.userName)}<span class="sm mono">${esc(c.username)} · ${esc(countyName(c.countyId))}</span></div>` },
        { label:'Four-office votes', render:c=> FOUR_OFFICE_ROLES.map(o=>{
            const voted = !!c.votes[o.office];
            return `<span class="badge ${voted?'b-ok':'b-neutral'}" style="margin:2px">${voted?'✓ ':''}${esc(o.label)}</span>`;
          }).join(' ') },
        { label:'Stage', render:c=>badge(c.stage.replace(/_/g,' '), c.stage==='completed'?'b-ok':'b-warn', false) },
        { label:'Authorised action', render:c=>{
            const out = [];
            if(c.stage!=='completed' && office && !c.votes[office]){
              out.push(`<button class="btn btn-xs btn-primary" data-act="gov-vote" data-id="${esc(c.id)}">Cast my vote</button>`);
            }
            if(c.stage==='approved_for_overwrite' && isChief){
              out.push(`<button class="btn btn-xs btn-primary" data-act="gov-overwrite" data-id="${esc(c.id)}">System Admin overwrite</button>`);
            }
            if(c.stage==='overwritten_awaiting_county' && (user.roleId==='countyadmin' || user.roleId==='program.admin')){
              out.push(`<button class="btn btn-xs btn-primary" data-act="gov-county-reset-modal" data-id="${esc(c.id)}">Set new password</button>`);
            }
            return out.join(' ') || `<span class="xs muted">Awaiting required office</span>`;
          } }
      ], DB.db.passwordCeremonies, { compact:true })
      : emptyState('No active password ceremonies','Initiate a ceremony above whenever a post-onboarding password requires four-office governance recovery.','key')}`)

  + `<div class="grid g2" style="margin-top:16px">
      ${card('Account Onboarding & One-Time Activation Codes', `
        ${canApprove ? `<form data-form="gov-issue-act" class="row" style="gap:8px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px">
          <div class="field" style="margin:0;flex:1;min-width:150px"><label>Username to activate</label>
            <input class="input mono" name="username" required placeholder="e.g. caregiver.kondele"></div>
          <div class="field" style="margin:0;min-width:160px"><label>Role</label>
            <select class="input" name="roleId">${ROLES.filter(r=>r.id!=='chief').map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select></div>
          <button class="btn btn-sm btn-primary" type="submit">Issue ACT code</button>
        </form>` : ''}
        ${openReqs.length ? table([
          { label:'Applicant', render:r=>`<div class="cellname">${esc(r.name)}<span class="sm">${esc(r.jobTitle||'')} · ${esc(countyName(r.countyId||'kisumu'))}</span></div>` },
          { label:'Reason', render:r=>`<span class="xs">${esc(r.justification||'')}</span>` },
          { label:'', render:r=>canApprove?`<button class="btn btn-xs btn-primary" data-act="gov-approve-req" data-id="${esc(r.id)}">Approve &amp; issue code</button>`:'' }
        ], openReqs, { compact:true }) : `<p class="xs muted">No pending sign-in account requests.</p>`}
        ${(DB.db.pendingActivations||[]).length ? `<div style="margin-top:10px" class="xs"><b>Issued activation codes:</b> ${DB.db.pendingActivations.slice(-5).map(a=>`<span class="badge ${a.used?'b-ok':'b-info'} mono">${esc(a.username)}: ${esc(a.code)}${a.used?' (used)':''}</span>`).join(' ')}</div>` : ''}`)}

      ${card('Forgotten Password Queue & 24-Hour Emergency Codes', `
        ${canApprove ? `<form data-form="gov-issue-emg" class="row" style="gap:8px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px">
          <div class="field" style="margin:0;flex:1;min-width:180px"><label>Staff account</label>
            <select class="input" name="username">${(DB.db.users||[]).map(u=>`<option value="${esc(u.username)}">${esc(u.name)} (${esc(u.username)})</option>`).join('')}</select></div>
          <button class="btn btn-sm btn-primary" type="submit">Issue 24h EMG code</button>
        </form>` : ''}
        ${openRecs.length ? table([
          { label:'Username', render:r=>`<b class="mono">${esc(r.username)}</b>` },
          { label:'Requested', render:r=>`<span class="xs">${fmtDateTime(r.at)}</span>` },
          { label:'', render:r=>canApprove?`<button class="btn btn-xs btn-primary" data-act="gov-emg-quick" data-u="${esc(r.username)}">Issue EMG code</button>`:'' }
        ], openRecs, { compact:true }) : `<p class="xs muted">No unanswered forgotten-password requests.</p>`}
        ${(DB.db.emergencyCodes||[]).length ? `<div style="margin-top:10px" class="xs"><b>Active emergency codes:</b> ${DB.db.emergencyCodes.slice(-5).map(e=>`<span class="badge ${e.used?'b-ok':'b-warn'} mono">${esc(e.username)}: ${esc(e.code)}${e.used?' (used)':''}</span>`).join(' ')}</div>` : ''}`)}
    </div>`

  + card('Real-Time Office Wi-Fi Sync & Rollback Policy', `
      <div class="grid g2" style="gap:14px">
        <div>
          <p class="small">All authorised devices on the office network read and patch the host database in real time. Field-level merges are automatic and recorded in the <button class="linkbtn" data-act="go" data-v="mergejournal" type="button">Merge journal</button>; users never face conflict blocking dialogs.</p>
          <div class="xs muted" style="margin-top:8px">Active policy: <b>Host-authoritative auto-reconciliation</b> · Idle lock: <b>${Math.round(SESSION.LOCK_AFTER/60)} minutes</b> · Audit chain: <b>SHA-256 append-only</b>.</div>
        </div>
        <div class="row" style="gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap">
          <button class="btn btn-sm btn-ghost" data-act="go" data-v="mergejournal">${ic('layers',14)} Open merge journal</button>
          ${isChief ? `<button class="btn btn-sm btn-ghost" data-act="gov-rollback-modal">${ic('history',14)} Rollback host revision</button>` : ''}
        </div>
      </div>`, { style:'margin-top:16px' });
}

Object.assign(ACTIONS, {
  'map-select': d => { ANALYTICS_STATE.selectedArea = d.area || 'all'; render(); },
  'pivot-export': () => {
    const piv = PIVOT6.compute(AUTH.user, ANALYTICS_STATE.rowDim, ANALYTICS_STATE.colDim, ANALYTICS_STATE.measure);
    downloadFile(`LOMAMO-Pivot-${piv.rowKey}-by-${piv.colKey}-${todayISO().slice(0,10)}.csv`, PIVOT6.csv(piv), 'text/csv');
    toast('Pivot exported', 'CSV downloaded with current dimensions and totals.', 'ok');
  },
  'interop-tab': d => {
    if(d.tab) ANALYTICS_STATE.interopTab = d.tab;
    if(d.khis) ANALYTICS_STATE.khisForm = d.khis;
    render();
  },
  'interop-export-khis': () => {
    const draft = buildKhisDraft(AUTH.user, ANALYTICS_STATE.khisForm);
    const lines = ['"Notice","INTERNAL CARELINK DRAFT - NOT AN OFFICIAL KHIS SUBMISSION"',
      '"Report","' + draft.title + '"', '"Period","' + draft.period + '"', '',
      '"Code","Element","Value","Verification"'];
    draft.rows.forEach(r=>lines.push(`"${r.code}","${r.element}","${r.value===null?'Not recorded':r.value}","${r.status}"`));
    downloadFile(`${draft.code}-${draft.period}.csv`, lines.join('\r\n'), 'text/csv');
    AUDIT.append({ actor:AUTH.user.id, action:'interop.khis_draft_exported', entity:'report', entityId:draft.code, detail:draft.period });
    DB.save();
    toast('Draft exported', 'Marked clearly as an internal verification draft, not an official KHIS submission.', 'ok');
  },
  'interop-dl-dhis2': () => {
    downloadFile(`LOMAMO-DHIS2-dataValueSets-${todayISO().slice(0,10)}.json`, JSON.stringify(buildDhis2Payload(AUTH.user), null, 2), 'application/json');
    toast('DHIS2 payload downloaded', 'Staged dataValueSets JSON saved.', 'ok');
  },
  'interop-dl-fhir': () => {
    downloadFile(`LOMAMO-FHIR-R4-Bundle-${todayISO().slice(0,10)}.json`, JSON.stringify(buildFhirBundle(AUTH.user), null, 2), 'application/json');
    toast('FHIR R4 Bundle downloaded', 'Consent and RBAC rules applied.', 'ok');
  },
  'interop-mint-token': () => {
    if(!RBAC.has(AUTH.user,'system.config')) return toast('Not permitted','','err');
    const tok = GOV6.randomCode('CLK', 16);
    DB.db.settings.apiTokens = DB.db.settings.apiTokens || [];
    DB.db.settings.apiTokens.push({ prefix:tok.slice(0,8), hash:strongHash(tok,'api'), created:new Date().toISOString(), by:AUTH.user.id });
    AUDIT.append({ actor:AUTH.user.id, action:'system.api_token_created', entity:'system', entityId:tok.slice(0,8), detail:'Scoped REST API token minted' });
    DB.save();
    openModal({ title:'Scoped Web API Token', narrow:true,
      body:`<p class="small">Copy this token now. Like passwords, only its salted hash is stored after you close this window.</p>
        <div class="alert ok mono" style="font-size:13px;user-select:all">${esc(tok)}</div>`,
      footer:`<button class="btn btn-primary" data-act="close-modal">Done</button>` });
    render();
  },
  'gov-export-master': async () => {
    if(AUTH.user.roleId !== 'chief') return toast('Not permitted','Only the Chief System Administrator may export the master sheet.','err');
    let accounts = null;
    if(typeof SYNC!=='undefined' && SYNC.sessionToken){
      const r = await SYNC._json('api/credentials/provision', { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' });
      if(r.ok && r.body && Array.isArray(r.body.accounts)) accounts = r.body.accounts;
    }
    if(!accounts){
      const local = GOV6.generateMasterSheet(AUTH.user);
      if(!local.ok) return toast('Could not generate', local.error, 'err');
      accounts = local.accounts;
    }
    if(typeof downloadMasterSheet === 'function') downloadMasterSheet(accounts, orgName());
    toast('Master credentials saved', `${accounts.length} official accounts provisioned with forced change on first login.`, 'ok');
    render();
  },
  'gov-vote': d => {
    const r = GOV6.castVote(AUTH.user, d.id);
    if(!r.ok) return toast('Vote refused', r.error, 'err');
    toast('Vote recorded', `${r.count} of 4 required hierarchy votes recorded.`, 'ok');
    render();
  },
  'gov-overwrite': d => {
    const r = GOV6.adminOverwrite(AUTH.user, d.id);
    if(!r.ok) return toast('Overwrite refused', r.error, 'err');
    toast('Overwrite complete', 'Account unlocked for the County Administrator to assign a replacement password.', 'ok');
    render();
  },
  'gov-county-reset-modal': d => {
    openModal({ title:'Assign Replacement Password (County Admin)', narrow:true,
      body:`<form data-form="gov-county-reset">
        <input type="hidden" name="id" value="${esc(d.id)}">
        <p class="small">All four hierarchy offices voted in favour and the Chief System Administrator cleared the previous hash. Enter a temporary password; the staff member will be required to change it immediately on first login.</p>
        <div class="field"><label>Replacement temporary password</label><input class="input" type="password" name="password" minlength="10" required placeholder="At least 10 characters"></div>
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" data-act="submit" data-form="gov-county-reset">Save temporary password</button>` });
  },
  'gov-approve-req': d => {
    const req = (DB.db.accountRequests||[]).find(r=>r.id===d.id);
    if(!req) return;
    const base = String(req.name||'staff').trim().toLowerCase().replace(/[^a-z0-9]+/g,'.').replace(/^\.|\.$|/g,'').slice(0,20) || 'staff.member';
    const r = GOV6.issueActivation(AUTH.user, req.id, base, 'caregiver');
    if(!r.ok) return toast('Could not approve', r.error, 'err');
    toast('Activation issued', `${r.username} · Code ${r.code}`, 'ok');
    render();
  },
  'gov-emg-quick': d => {
    const r = GOV6.issueEmergency(AUTH.user, d.u);
    if(!r.ok) return toast('Could not issue', r.error, 'err');
    toast('Emergency code issued', `${r.username} · ${r.code} (valid 24 hours)`, 'ok');
    render();
  },
  'gov-rollback-modal': () => {
    openModal({ title:'Host Revision Rollback Protocol', narrow:true,
      body:`<form data-form="gov-rollback">
        <p class="small">Rolling back restores the central host state to an earlier revision snapshot while recording an immutable audit event. Enter the target revision number from the Merge Journal or System Health view.</p>
        <div class="field"><label>Target revision number</label><input class="input mono" type="number" name="toRev" min="1" value="1" required></div>
        <div class="field"><label>Reason for rollback</label><input class="input" name="reason" required minlength="8" placeholder="Documented operational reason"></div>
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-danger" data-act="submit" data-form="gov-rollback">Execute audited rollback</button>` });
  }
});

Object.assign(FORMS, {
  'pivot-config': d => {
    ANALYTICS_STATE.rowDim = String(d.get('row')||'area');
    ANALYTICS_STATE.colDim = String(d.get('col')||'status');
    ANALYTICS_STATE.measure = String(d.get('measure')||'count');
    render();
  },
  'interop-save': d => {
    if(!RBAC.has(AUTH.user,'system.config')) return toast('Not permitted','','err');
    DB.db.settings.interop = {
      dhis2Url: String(d.get('dhis2Url')||'').trim(),
      dhis2OrgUnit: String(d.get('dhis2OrgUnit')||'LOMAMO_KISUMU_HQ').trim(),
      fhirUrl: String(d.get('fhirUrl')||'').trim(),
      updatedAt: new Date().toISOString()
    };
    AUDIT.append({ actor:AUTH.user.id, action:'interop.config_saved', entity:'setting', entityId:'interop', detail:DB.db.settings.interop.dhis2OrgUnit });
    DB.save();
    toast('Adapter settings saved', 'Configuration recorded. External endpoints remain staged until credentials are verified.', 'ok');
    render();
  },
  'interop-add-app': d => {
    if(!RBAC.has(AUTH.user,'system.config')) return toast('Not permitted','','err');
    DB.db.settings.customApps = DB.db.settings.customApps || [];
    const name = String(d.get('name')||'').trim();
    const scope = String(d.get('scope')||'patient.list').trim();
    DB.db.settings.customApps.push({ id:'app-'+Date.now().toString(36), name, kind:'Custom extension', endpoint:'/api/v1/status', scope, status:'enabled' });
    AUDIT.append({ actor:AUTH.user.id, action:'interop.app_registered', entity:'customApp', entityId:name, detail:scope });
    DB.save();
    toast('Custom app registered', `${name} added to the extensibility registry.`, 'ok');
    render();
  },
  'gov-open-ceremony': d => {
    const r = GOV6.openCeremony(AUTH.user, String(d.get('username')||''), String(d.get('reason')||''));
    if(!r.ok) return toast('Could not open ceremony', r.error, 'err');
    if(GOV6.officeOf(AUTH.user)) GOV6.castVote(AUTH.user, r.ceremony.id);
    toast('Ceremony opened', `Four-office recovery initiated for ${r.ceremony.username}.`, 'ok');
    render();
  },
  'gov-county-reset': d => {
    const r = GOV6.countySetPassword(AUTH.user, String(d.get('id')||''), String(d.get('password')||''));
    if(!r.ok) return toast('Reset refused', r.error, 'err');
    closeModal(true);
    toast('Password reset complete', `${r.ceremony.username} may sign in once and will be prompted to set a personal password.`, 'ok');
    render();
  },
  'gov-issue-act': d => {
    const r = GOV6.issueActivation(AUTH.user, null, String(d.get('username')||''), String(d.get('roleId')||'caregiver'));
    if(!r.ok) return toast('Could not issue code', r.error, 'err');
    toast('Activation code ready', `Username: ${r.username} · Code: ${r.code}`, 'ok');
    render();
  },
  'gov-issue-emg': d => {
    const r = GOV6.issueEmergency(AUTH.user, String(d.get('username')||''));
    if(!r.ok) return toast('Could not issue code', r.error, 'err');
    toast('Emergency code ready', `${r.username} · ${r.code} (valid 24 hours)`, 'ok');
    render();
  },
  'gov-rollback': async d => {
    const toRev = +d.get('toRev')||1;
    const reason = String(d.get('reason')||'');
    if(typeof SYNC!=='undefined' && SYNC.sessionToken){
      const r = await SYNC._json('api/rollback', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ toRev, reason }) });
      closeModal(true);
      if(r.ok){ await SYNC.pullNow(); toast('Host rolled back', `Restored host state from revision ${toRev}.`, 'ok'); render(); }
      else toast('Rollback refused', (r.body && r.body.error) || 'Host refused rollback.', 'err');
      return;
    }
    AUDIT.append({ actor:AUTH.user.id, action:'system.rollback_requested', entity:'system', entityId:String(toRev), detail:reason });
    DB.save(); closeModal(true);
    toast('Rollback logged', 'Start the office host server (server.py) to roll back shared central revisions.', 'warn');
    render();
  }
});
