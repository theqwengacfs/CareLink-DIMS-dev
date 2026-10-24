/* ============================================================
   charts.js - Accessible, dependency-free visualisations
   Every chart is an inline SVG with a written summary, a key and a
   full data table beneath it. Colour is never the only signal, and
   a chart never shows a figure the reader is not allowed to see.
   ============================================================ */

const CHART_PALETTE = ['#1F3864','#C9A227','#0E7490','#0F7B4F','#9A5B00','#7C3AED','#B45309','#475569'];

function fmtNum(n){
  if(n===null || n===undefined || isNaN(n)) return '-';
  return Number(n).toLocaleString('en-KE');
}

function fmtCompact(n){
  if(n===null || n===undefined || isNaN(n)) return '-';
  const v = Number(n), abs = Math.abs(v);
  if(abs >= 1e6) return (v/1e6).toFixed(abs>=1e7?1:2).replace(/\.0+$/,'') + 'M';
  if(abs >= 1e4) return Math.round(v/1e3).toLocaleString('en-KE') + 'k';
  if(abs >= 1e3) return (v/1e3).toFixed(1).replace(/\.0$/,'') + 'k';
  return fmtNum(Math.round(v));
}

function isChartTableMode(){
  return Boolean(
    (typeof COST_STATE!=='undefined' && COST_STATE.viewMode==='table') ||
    (typeof APPX!=='undefined' && APPX.chartViewMode==='table')
  );
}

function chartTable(cols, rows, opts={}){
  const tableOnly = isChartTableMode() && opts.standalone!==false;
  const totalHtml = opts.totalRow
    ? `<tfoot><tr class="ct-total-row">${cols.map((c,ci)=>{
        const k = c.key !== undefined ? c.key : c.label;
        const v = opts.totalRow[k] ?? (ci===0 ? 'Total' : '');
        return `<td class="${c.cls||''}"><b>${esc(String(v))}</b></td>`;
      }).join('')}</tr></tfoot>`
    : '';
  const tblMarkup = `<div class="tbl-wrap chart-tbl-wrap"><table class="tbl compact align-sym"><thead><tr>${cols.map(c=>`<th class="${c.cls||''}">${esc(c.label)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r=>`<tr>${cols.map((c,ci)=>{
      const k = c.key !== undefined ? c.key : (ci===0 && r.period!==undefined ? 'period' : ci===0 && r.axis!==undefined ? 'axis' : c.label);
      return `<td class="${c.cls||''}">${esc(String(r[k]??r[c.label]??'-'))}</td>`;
    }).join('')}</tr>`).join('')}</tbody>${totalHtml}</table></div>`;
  if(tableOnly){
    return `<div class="chart-table-only">
      <div class="spread xs muted" style="margin-bottom:6px;font-weight:700;text-transform:uppercase;letter-spacing:.05em">
        <span>${esc(opts.title||'Structured data table')}</span>
        <span class="ct-count">${rows.length} row${rows.length===1?'':'s'}</span>
      </div>
      ${tblMarkup}
    </div>`;
  }
  return `<details class="chart-table"${opts.open?' open':''}><summary class="chart-table-btn small"><span>View as a table</span><span class="ct-count">${rows.length} row${rows.length===1?'':'s'}</span></summary>
    <div style="margin-top:8px">${tblMarkup}</div></details>`;
}

/* Vertical bars. rows: [{label, value, note}] */
function chartBars(opts){
  const rows = (opts.rows||[]).filter(r=>r.value!==null && r.value!==undefined);
  if(!rows.length) return `<div class="empty small">${esc(opts.empty||'No verified data for this period.')}</div>`;
  const W = 840, H = opts.height || 268, padL = 70, padR = 24, padB = 48, padT = 30;
  const max = opts.max || Math.max(...rows.map(r=>r.value), 1);
  const plotW = W - padL - padR;
  const bw = plotW / rows.length;
  const inner = H - padB - padT;
  const dense = rows.length > 7;
  const fmtV = v => opts.fmt ? opts.fmt(v) : fmtNum(v);
  const fmtTop = v => (rows.length > 6 || String(fmtV(v)).length > 9) ? fmtCompact(v) : fmtV(v);
  const bars = rows.map((r,i)=>{
    const h = Math.max(2, Math.round(inner * (r.value/max)));
    const x = padL + i*bw + bw*0.18;
    const w = Math.min(72, bw*0.64);
    const bx = padL + i*bw + (bw - w)/2;
    const y = padT + inner - h;
    const alt = i % 2 ? ' alt' : '';
    const yLbl = dense && (i % 2 === 1) ? Math.max(12, y - 16) : Math.max(12, y - 7);
    return `<g>
      <rect class="bar${alt}" x="${bx.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h}" rx="4"><title>${esc(r.label)}: ${esc(fmtV(r.value))}</title></rect>
      <text class="val" x="${(bx+w/2).toFixed(1)}" y="${yLbl.toFixed(1)}" text-anchor="middle">${esc(fmtTop(r.value))}</text>
      <text class="axis-x" x="${(bx+w/2).toFixed(1)}" y="${H-(dense && i%2===1 ? 8 : 21)}" text-anchor="middle">${esc(String(r.label).slice(0,15))}</text>
    </g>`;
  }).join('');
  const grid = [0,0.25,0.5,0.75,1].map(f=>{
    const y = padT + inner - inner*f;
    return `<line class="grid-line" x1="${padL}" x2="${W-padR}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"></line>
      <text class="axis-y" x="${padL-8}" y="${(y+3.5).toFixed(1)}" text-anchor="end">${esc(fmtCompact(Math.round(max*f)))}</text>`;
  }).join('');
  const summary = `${opts.title||'Chart'}: ${rows.map(r=>`${r.label} ${fmtV(r.value)}`).join(', ')}.`;
  const totalVal = rows.reduce((n,r)=>n+(Number(r.value)||0),0);
  const tblRows = rows.map(r=>({
    period:r.label,
    val:fmtV(r.value)+(opts.unit && !opts.fmt ? ' '+opts.unit : ''),
    share:(totalVal>0?(100*(Number(r.value)||0)/totalVal).toFixed(1)+'%':'0.0%')
  }));
  const tbl = chartTable(
    [{key:'period',label:opts.labelHead||'Category'},{key:'val',label:opts.valueHead||'Value',cls:'num mono'},{key:'share',label:'Share',cls:'num mono'}],
    tblRows,
    { title:opts.title||'Category table', totalRow:{ period:'Total', val:fmtV(totalVal)+(opts.unit && !opts.fmt ? ' '+opts.unit : ''), share:'100.0%' } }
  );
  if(isChartTableMode()) return tbl;

  return `<figure class="chart-fig" style="margin:0">
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(summary)}" preserveAspectRatio="xMidYMid meet">
      ${grid}${bars}
    </svg>
    <figcaption class="small muted" style="margin-top:8px">${esc(opts.caption||summary)}${opts.unit?' Unit: '+esc(opts.unit)+'.':''}</figcaption>
    ${tbl}
  </figure>`;
}

/* Horizontal bars, better for long ministry-area names on a tablet. */
function chartRows(opts){
  const rows = (opts.rows||[]).filter(r=>r.value!==null && r.value!==undefined);
  if(!rows.length) return `<div class="empty small">${esc(opts.empty||'No verified data for this period.')}</div>`;
  const max = opts.max || Math.max(...rows.map(r=>r.value), 1);
  const fmtV = v => opts.fmt ? opts.fmt(v) : fmtNum(v);
  const summary = `${opts.title||'Breakdown'}: ${rows.map(r=>`${r.label} ${fmtV(r.value)}`).join(', ')}.`;
  const totalVal = rows.reduce((n,r)=>n+(Number(r.value)||0),0);
  const tblRows = rows.map(r=>({
    period:r.label,
    val:fmtV(r.value),
    share:(totalVal>0?(100*(Number(r.value)||0)/totalVal).toFixed(1)+'%':'0.0%')
  }));
  const tbl = chartTable(
    [{key:'period',label:opts.labelHead||'Category'},{key:'val',label:opts.valueHead||'Value',cls:'num mono'},{key:'share',label:'Share',cls:'num mono'}],
    tblRows,
    { title:opts.title||'Breakdown table' }
  );
  if(isChartTableMode()) return tbl;
  return `<div role="img" aria-label="${esc(summary)}" class="chart-rows-list">
    ${rows.map((r,i)=>{
      const pct = Math.max(2, Math.round(100*r.value/max));
      const colour = opts.colours? (opts.colours[i%opts.colours.length]) : ((typeof WTHEME!=='undefined' && WTHEME.chartPalette()) || CHART_PALETTE)[i%CHART_PALETTE.length];
      return `<div class="chart-row-item">
        <div class="small chart-row-lbl" title="${esc(r.label)}">${esc(r.label)}</div>
        <div class="chart-row-track">
          <div style="height:100%;width:${pct}%;background:${colour};border-radius:7px"></div>
        </div>
        <div class="mono small chart-row-val">${esc(fmtV(r.value))}</div>
      </div>`;
    }).join('')}
  </div>
  ${tbl}`;
}

/* A compact indicator strip, used inside report headers. */
function statStrip(items){
  return `<div class="row" style="gap:18px;flex-wrap:wrap">${items.map(i=>
    `<div><div class="xs muted" style="letter-spacing:.1em;text-transform:uppercase">${esc(i.label)}</div>
      <div style="font-size:22px;font-weight:700;letter-spacing:-.03em">${esc(String(i.value))}</div>
      ${i.note?`<div class="xs muted">${esc(i.note)}</div>`:''}</div>`).join('')}</div>`;
}

/* ============================================================
   Chart library extension (v6.1)
   ------------------------------------------------------------
   Every chart below is dependency-free inline SVG, uses theme
   tokens rather than hard-coded ink, carries a written summary,
   and offers the same figures as a table. Colour is never the
   only signal: each series also carries a label and a marker
   shape, and each bar or point prints its own value.
   ============================================================ */

/* A palette that always has enough contrast against the active surface. */
function chartColours(n=8){
  const themed = (typeof WTHEME!=='undefined' && WTHEME.chartPalette) ? WTHEME.chartPalette() : null;
  const base = themed || CHART_PALETTE;
  const extra = ['#0E7490','#B45309','#7C3AED','#0F7B4F','#BE123C','#1D4ED8','#CA8A04','#115E59','#9333EA','#475569','#DC2626','#059669'];
  const out = base.slice();
  for(let i=0; out.length<n; i++) out.push(extra[i%extra.length]);
  return out.slice(0, Math.max(n, base.length));
}
const CHART_MARKERS = ['circle','rect','diamond','triangle'];
function chartMarker(kind, x, y, colour, r=3.4){
  if(kind==='rect') return `<rect x="${(x-r).toFixed(1)}" y="${(y-r).toFixed(1)}" width="${(r*2).toFixed(1)}" height="${(r*2).toFixed(1)}" fill="${colour}"/>`;
  if(kind==='diamond') return `<path d="M${x.toFixed(1)} ${(y-r-0.6).toFixed(1)} L${(x+r+0.6).toFixed(1)} ${y.toFixed(1)} L${x.toFixed(1)} ${(y+r+0.6).toFixed(1)} L${(x-r-0.6).toFixed(1)} ${y.toFixed(1)} Z" fill="${colour}"/>`;
  if(kind==='triangle') return `<path d="M${x.toFixed(1)} ${(y-r-1).toFixed(1)} L${(x+r+1).toFixed(1)} ${(y+r).toFixed(1)} L${(x-r-1).toFixed(1)} ${(y+r).toFixed(1)} Z" fill="${colour}"/>`;
  return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${colour}"/>`;
}
function chartFrame(W,H,padL,padR,padT,padB,max,opts={}){
  const inner = H-padT-padB;
  const lines = (opts.ticks||4);
  let g='';
  for(let i=0;i<=lines;i++){
    const y = padT + inner - inner*(i/lines);
    g += `<line class="grid-line" x1="${padL}" x2="${W-padR}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"></line>`;
    if(opts.yLabels!==false){
      const raw = max*i/lines;
      const lbl = opts.fmtY ? opts.fmtY(raw) : fmtCompact(Math.round(raw));
      g += `<text class="axis-y" x="${padL-8}" y="${(y+3.5).toFixed(1)}" text-anchor="end">${esc(lbl)}</text>`;
    }
  }
  return { grid:g, inner, plotW:W-padL-padR };
}

/* --- Line / area chart, one or more series ---------------------------- */
function chartLine(opts){
  const labels = opts.labels||[];
  const series = (opts.series||[]).filter(s=>s && Array.isArray(s.values));
  if(!labels.length || !series.length) return `<div class="empty small">${esc(opts.empty||'No verified data for this period.')}</div>`;
  const W=860, H=opts.height||280, padL=74, padR=28, padT=28, padB=52;
  const colours = opts.colours || chartColours(series.length);
  const all = series.flatMap(s=>s.values.map(v=>Number(v)||0));
  const max = opts.max || Math.max(1, ...all);
  const min = opts.min!==undefined? opts.min : Math.min(0, ...all);
  const span = (max-min)||1;
  const {grid, inner, plotW} = chartFrame(W,H,padL,padR,padT,padB,max,{fmtY:opts.fmtY, ticks:opts.ticks||4});
  const xAt = i => padL + (labels.length===1? plotW/2 : plotW*i/(labels.length-1));
  const yAt = v => padT + inner - inner*((Number(v)||0)-min)/span;
  const stepShow = labels.length > 9 ? 2 : 1;
  const paths = series.map((s,si)=>{
    const c = s.color || colours[si%colours.length];
    const pts = s.values.map((v,i)=>[xAt(i), yAt(v)]);
    const d = pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
    const area = opts.area!==false && series.length<=2
      ? `<path d="${d} L${pts[pts.length-1][0].toFixed(1)} ${(padT+inner).toFixed(1)} L${pts[0][0].toFixed(1)} ${(padT+inner).toFixed(1)} Z" fill="${c}" opacity=".11"></path>` : '';
    const marks = pts.map((p,i)=>`<g><title>${esc(s.label)} · ${esc(labels[i])}: ${esc(opts.fmt?opts.fmt(s.values[i]):fmtNum(s.values[i]))}</title>${chartMarker(s.marker||CHART_MARKERS[si%CHART_MARKERS.length], p[0], p[1], c, opts.markers===false?0.001:3.6)}</g>`).join('');
    const vals = opts.values!==false ? pts.map((p,i)=>{
      if(i % stepShow !== 0 && i !== pts.length-1) return '';
      const dy = si % 2 === 1 ? 16 : -10;
      const yTxt = Math.max(12, Math.min(padT+inner-4, p[1]+dy));
      return `<text class="val" x="${p[0].toFixed(1)}" y="${yTxt.toFixed(1)}" text-anchor="middle">${esc(fmtCompact(s.values[i]))}</text>`;
    }).join('') : '';
    return `${area}<path d="${d}" fill="none" stroke="${c}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"></path>${marks}${vals}`;
  }).join('');
  const denseX = labels.length > 8;
  const xlab = labels.map((l,i)=>`<text class="axis-x" x="${xAt(i).toFixed(1)}" y="${H-(denseX && i%2===1 ? 10 : 23)}" text-anchor="middle">${esc(String(l).slice(0,12))}</text>`).join('');
  const summary = `${opts.title||'Trend'}: ` + series.map(s=>`${s.label} (${s.values.map(v=>fmtNum(v)).join(', ')})`).join('; ');
  const key = series.length>1 ? `<div class="chart-key">${series.map((s,i)=>`<span class="ck"><i style="background:${s.color||colours[i%colours.length]}"></i>${esc(s.label)}</span>`).join('')}</div>` : '';
  const rows = labels.map((l,i)=>{ const r={period:l}; series.forEach(s=>{ r[s.label]=opts.fmt?opts.fmt(s.values[i]):fmtNum(s.values[i]); }); return r; });
  const tbl = chartTable([{key:'period',label:opts.labelHead||'Period'},...series.map(s=>({key:s.label,label:s.label,cls:'num mono'}))], rows, {title:opts.title||'Trend table'});
  if(isChartTableMode()) return tbl;
  return `<figure class="chart-fig" style="margin:0">${key}
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(summary)}" preserveAspectRatio="xMidYMid meet">${grid}${paths}${xlab}</svg>
    <figcaption class="small muted" style="margin-top:8px">${esc(opts.caption||summary)}${opts.unit?' Unit: '+esc(opts.unit)+'.':''}</figcaption>
    ${tbl}
  </figure>`;
}

/* --- Stacked bars ---------------------------------------------------- */
function chartStacked(opts){
  const labels = opts.labels||[];
  const series = (opts.series||[]).filter(s=>Array.isArray(s.values));
  if(!labels.length||!series.length) return `<div class="empty small">${esc(opts.empty||'No verified data for this period.')}</div>`;
  const W=860, H=opts.height||288, padL=74, padR=24, padT=30, padB=52;
  const colours = opts.colours || chartColours(series.length);
  const totals = labels.map((l,i)=>series.reduce((n,s)=>n+(Number(s.values[i])||0),0));
  const max = opts.max || Math.max(1, ...totals);
  const {grid, inner, plotW} = chartFrame(W,H,padL,padR,padT,padB,max,{fmtY:opts.fmtY});
  const bw = plotW/labels.length;
  const dense = labels.length > 7;
  const bars = labels.map((l,i)=>{
    const w = Math.min(68, bw*0.64);
    const x = padL + i*bw + (bw - w)/2;
    let acc = 0;
    const segs = series.map((s,si)=>{
      const v = Number(s.values[i])||0; if(!v) return '';
      const h = inner*v/max, y = padT+inner-acc-h; acc += h;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(0.8,h).toFixed(1)}" fill="${s.color||colours[si%colours.length]}" rx="2"><title>${esc(s.label)} · ${esc(l)}: ${opts.fmt?opts.fmt(v):fmtNum(v)}</title></rect>`;
    }).join('');
    const topY = Math.max(12, padT+inner-acc-(dense && i%2===1 ? 15 : 6));
    return `${segs}<text class="val" x="${(x+w/2).toFixed(1)}" y="${topY.toFixed(1)}" text-anchor="middle">${esc(fmtCompact(totals[i]))}</text>
      <text class="axis-x" x="${(x+w/2).toFixed(1)}" y="${H-(dense && i%2===1 ? 9 : 22)}" text-anchor="middle">${esc(String(l).slice(0,14))}</text>`;
  }).join('');
  const summary = `${opts.title||'Stacked breakdown'}: ` + labels.map((l,i)=>`${l} ${opts.fmt?opts.fmt(totals[i]):fmtNum(totals[i])}`).join(', ');
  const rows = labels.map((l,i)=>{ const r={period:l}; series.forEach(s=>{ r[s.label]=opts.fmt?opts.fmt(s.values[i]):fmtNum(s.values[i]); }); r.Total=opts.fmt?opts.fmt(totals[i]):fmtNum(totals[i]); return r; });
  const totRow = { period:'Total' };
  series.forEach(s=>{ const sumS = s.values.reduce((n,v)=>n+(Number(v)||0),0); totRow[s.label] = opts.fmt?opts.fmt(sumS):fmtNum(sumS); });
  const grand = totals.reduce((n,v)=>n+v,0);
  totRow.Total = opts.fmt?opts.fmt(grand):fmtNum(grand);
  const tbl = chartTable([{key:'period',label:opts.labelHead||'Category'},...series.map(s=>({key:s.label,label:s.label,cls:'num mono'})),{key:'Total',label:'Total',cls:'num mono'}], rows, {title:opts.title||'Stacked breakdown', totalRow:totRow});
  if(isChartTableMode()) return tbl;
  return `<figure class="chart-fig" style="margin:0">
    <div class="chart-key">${series.map((s,i)=>`<span class="ck"><i style="background:${s.color||colours[i%colours.length]}"></i>${esc(s.label)}</span>`).join('')}</div>
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(summary)}" preserveAspectRatio="xMidYMid meet">${grid}${bars}</svg>
    <figcaption class="small muted" style="margin-top:8px">${esc(opts.caption||summary)}${opts.unit?' Unit: '+esc(opts.unit)+'.':''}</figcaption>
    ${tbl}
  </figure>`;
}

/* --- Grouped (clustered) bars ---------------------------------------- */
function chartGrouped(opts){
  const labels = opts.labels||[];
  const series = (opts.series||[]).filter(s=>Array.isArray(s.values));
  if(!labels.length||!series.length) return `<div class="empty small">${esc(opts.empty||'No verified data for this period.')}</div>`;
  const W=860, H=opts.height||280, padL=74, padR=24, padT=28, padB=52;
  const colours = opts.colours || chartColours(series.length);
  const max = opts.max || Math.max(1, ...series.flatMap(s=>s.values.map(v=>Number(v)||0)));
  const {grid, inner, plotW} = chartFrame(W,H,padL,padR,padT,padB,max,{fmtY:opts.fmtY});
  const bw = plotW/labels.length, gw = Math.min(48, (bw*0.72)/series.length);
  const dense = labels.length > 6;
  const bars = labels.map((l,i)=>{
    const groupW = gw * series.length;
    const x0 = padL + i*bw + (bw - groupW)/2;
    const g = series.map((s,si)=>{
      const v = Number(s.values[i])||0, h = Math.max(1.5, inner*v/max), x = x0+si*gw, y = padT+inner-h;
      return `<g><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(gw*0.84).toFixed(1)}" height="${h.toFixed(1)}" fill="${s.color||colours[si%colours.length]}" rx="3"><title>${esc(s.label)} · ${esc(l)}: ${opts.fmt?opts.fmt(v):fmtNum(v)}</title></rect>
        ${labels.length<=5?`<text class="val" x="${(x+gw*0.42).toFixed(1)}" y="${Math.max(12,y-(si%2===1?13:5)).toFixed(1)}" text-anchor="middle">${esc(fmtCompact(v))}</text>`:''}</g>`;
    }).join('');
    return `${g}<text class="axis-x" x="${(x0+groupW/2).toFixed(1)}" y="${H-(dense && i%2===1 ? 9 : 21)}" text-anchor="middle">${esc(String(l).slice(0,15))}</text>`;
  }).join('');
  const rows = labels.map((l,i)=>{ const r={period:l}; series.forEach(s=>{ r[s.label]=opts.fmt?opts.fmt(s.values[i]):fmtNum(s.values[i]); }); return r; });
  const tbl = chartTable([{key:'period',label:opts.labelHead||'Category'},...series.map(s=>({key:s.label,label:s.label,cls:'num mono'}))], rows, {title:opts.title||'Comparison table'});
  if(isChartTableMode()) return tbl;
  return `<figure class="chart-fig" style="margin:0">
    <div class="chart-key">${series.map((s,i)=>`<span class="ck"><i style="background:${s.color||colours[i%colours.length]}"></i>${esc(s.label)}</span>`).join('')}</div>
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.title||'Comparison')}" preserveAspectRatio="xMidYMid meet">${grid}${bars}</svg>
    <figcaption class="small muted" style="margin-top:8px">${esc(opts.caption||'Grouped comparison across '+labels.length+' categories.')}${opts.unit?' Unit: '+esc(opts.unit)+'.':''}</figcaption>
    ${tbl}
  </figure>`;
}

/* --- Theme-aware symmetrical donut / pie (ZERO figures written across slices) --- */
function chartDonut(segments, opts={}){
  const seg = (segments||[]).filter(s=>Number(s.value)>0);
  if(!seg.length) return `<div class="empty small">${esc(opts.empty||'Nothing to plot yet.')}</div>`;
  const colours = opts.colours || chartColours(seg.length);
  const size = opts.size||168, r = size*0.36, c = size/2, sw = opts.thickness||size*0.18;
  const total = seg.reduce((n,s)=>n+Number(s.value),0)||1;
  let a=0; const circ = 2*Math.PI*r;
  const gap = seg.length > 1 ? Math.min(2.2, circ * 0.006) : 0;
  const arcs = seg.map((s,i)=>{
    const frac = Number(s.value)/total;
    const rawDash = frac * circ;
    const dash = Math.max(0.5, rawDash - gap);
    const off = a * circ;
    a += frac;
    const colour = s.color || colours[i%colours.length];
    return `<circle cx="${c}" cy="${c}" r="${r.toFixed(1)}" fill="none" stroke="${colour}" stroke-width="${sw.toFixed(1)}"
      stroke-dasharray="${dash.toFixed(2)} ${(circ-dash).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 ${c} ${c})">
      <title>${esc(s.label)}: ${opts.fmt?opts.fmt(s.value):fmtNum(s.value)} (${(frac*100).toFixed(1)}%)</title></circle>`;
  }).join('');
  const pct = seg.map((s,i)=>{
    const frac = Number(s.value)/total;
    return `<div class="li donut-li-sym">
      <span class="sw" style="background:${s.color||colours[i%colours.length]}"></span>
      <span class="lg-l" title="${esc(s.label)}">${esc(s.label)}</span>
      <span class="n mono">${esc(opts.fmt?opts.fmt(s.value):fmtNum(s.value))}</span>
      <span class="pct mono">${(frac*100).toFixed(1)}%</span>
    </div>`;
  }).join('');
  const fullTotalTxt = opts.centerValue!==undefined ? String(opts.centerValue) : (opts.fmt?opts.fmt(total):fmtNum(total));
  const tblRows = seg.map(s=>({ period:s.label, val:opts.fmt?opts.fmt(s.value):fmtNum(s.value), share:(100*Number(s.value)/total).toFixed(1)+'%' }));
  const tbl = chartTable(
    [{key:'period',label:opts.labelHead||'Segment'},{key:'val',label:'Value',cls:'num mono'},{key:'share',label:'Share',cls:'num mono'}],
    tblRows,
    { title:opts.title||'Share breakdown', totalRow:{ period:'Total', val:fullTotalTxt, share:'100.0%' } }
  );
  if(isChartTableMode()) return tbl;
  return `<div class="donut-block">
    <div class="donut-wrap donut-wrap-clean">
      <div class="donut-svg-box">
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img"
          aria-label="${esc(opts.title||'Share')}: ${seg.map(s=>s.label+' '+(opts.fmt?opts.fmt(s.value):fmtNum(s.value))).join(', ')}">
          <circle cx="${c}" cy="${c}" r="${r.toFixed(1)}" fill="none" stroke="var(--line-2)" stroke-width="${sw.toFixed(1)}"/>
          ${arcs}
        </svg>
      </div>
      <div class="donut-side-panel">
        <div class="donut-total-strip">
          <span class="donut-total-lbl">${esc(opts.centerLabel||'TOTAL')}</span>
          <strong class="donut-total-val mono">${esc(fullTotalTxt)}</strong>
          <span class="donut-total-meta">${seg.length} segment${seg.length===1?'':'s'}</span>
        </div>
        <div class="legend donut-legend">${pct}</div>
      </div>
    </div>
    ${tbl}
  </div>`;
}

/* --- Horizontal share bar (100% stacked, one row) --------------------- */
function chartShare(segments, opts={}){
  const seg=(segments||[]).filter(s=>Number(s.value)>0);
  if(!seg.length) return `<div class="empty small">${esc(opts.empty||'Nothing to plot yet.')}</div>`;
  const colours = opts.colours||chartColours(seg.length);
  const total = seg.reduce((n,s)=>n+Number(s.value),0)||1;
  return `<div class="share-bar" role="img" aria-label="${esc(opts.title||'Share')}: ${seg.map(s=>`${s.label} ${(100*s.value/total).toFixed(1)}%`).join(', ')}">
    ${seg.map((s,i)=>`<span style="width:${(100*Number(s.value)/total).toFixed(2)}%;background:${s.color||colours[i%colours.length]}" title="${esc(s.label)}: ${opts.fmt?opts.fmt(s.value):fmtNum(s.value)}"></span>`).join('')}
  </div>
  <div class="chart-key" style="margin-top:8px">${seg.map((s,i)=>`<span class="ck"><i style="background:${s.color||colours[i%colours.length]}"></i>${esc(s.label)} · <b class="mono">${(100*Number(s.value)/total).toFixed(1)}%</b></span>`).join('')}</div>`;
}

/* --- Gauge (single ratio against a target) ---------------------------- */
function chartGauge(value, max, opts={}){
  const v = Math.max(0, Number(value)||0), m = Math.max(1e-9, Number(max)||1);
  const pct = Math.min(1.5, v/m);
  const W=220,H=124,cx=110,cy=104,r=84;
  const arc = (from,to,colour,width=14)=>{
    const a0=Math.PI*(1-from), a1=Math.PI*(1-to);
    const x0=cx+r*Math.cos(a0), y0=cy-r*Math.sin(a0), x1=cx+r*Math.cos(a1), y1=cy-r*Math.sin(a1);
    const large = (to-from)>0.5?1:0;
    return `<path d="M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linecap="round"/>`;
  };
  const tone = pct>=1? 'var(--ok)' : pct>=0.75? 'var(--warn)' : 'var(--crit)';
  return `<div class="gauge">
    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label||'Progress')}: ${opts.fmt?opts.fmt(v):fmtNum(v)} of ${opts.fmt?opts.fmt(m):fmtNum(m)} (${Math.round(pct*100)}%)">
      ${arc(0,1,'var(--line-2)')}
      ${arc(0,Math.min(1,pct),tone)}
      ${opts.target!==undefined && Number(opts.target)>0 && Number(opts.target)<=m ? arc(Math.min(1,Number(opts.target)/m)-0.004, Math.min(1,Number(opts.target)/m)+0.004, 'var(--ink)', 20) : ''}
      <text x="${cx}" y="${cy-16}" text-anchor="middle" class="gg-v">${esc(opts.fmt?opts.fmt(v):fmtNum(v))}</text>
      <text x="${cx}" y="${cy+2}" text-anchor="middle" class="gg-l">${esc(opts.label||'')}</text>
      <text x="${cx}" y="${cy+20}" text-anchor="middle" class="gg-s">${Math.round(pct*100)}% of ${esc(opts.fmt?opts.fmt(m):fmtNum(m))}</text>
    </svg></div>`;
}

/* --- Heat grid (rows x columns, e.g. ministry area x month) ----------- */
function chartHeat(opts){
  const rows = opts.rows||[], cols = opts.cols||[];
  if(!rows.length||!cols.length) return `<div class="empty small">${esc(opts.empty||'No verified data for this period.')}</div>`;
  const vals = rows.flatMap(r=>cols.map(c=>Number(r.values[c])||0));
  const max = Math.max(1, ...vals);
  const hue = opts.color || 'var(--accent)';
  const colLbl = c => (opts.colLabels && opts.colLabels[c]) ? opts.colLabels[c] : (typeof c==='string' && /^[a-z_]+$/.test(c) ? titleCase(c) : String(c));
  const cell = v => {
    const t = v/max;
    return `background:color-mix(in srgb, ${hue} ${(6+Math.round(t*84))}%, var(--surface));color:${t>0.55?'#FFFFFF':'var(--ink)'};`;
  };
  const compactCell = cols.length > 6;
  return `<div class="tbl-wrap"><table class="tbl heat align-sym">
    <thead><tr><th>${esc(opts.rowHead||'Category')}</th>${cols.map(c=>`<th class="num">${esc(colLbl(c))}</th>`).join('')}<th class="num">${esc(opts.totalHead||'Total')}</th></tr></thead>
    <tbody>${rows.map(r=>{
      const tot = cols.reduce((n,c)=>n+(Number(r.values[c])||0),0);
      return `<tr><th scope="row">${esc(r.label)}</th>${cols.map(c=>{
        const v = Number(r.values[c])||0;
        const fullTxt = opts.fmt?opts.fmt(v):fmtNum(v);
        const shownTxt = compactCell ? fmtCompact(v) : fullTxt;
        return `<td class="num mono heat-c" style="${v?cell(v):''}" title="${esc(r.label+' · '+colLbl(c)+': '+fullTxt)}">${v? esc(shownTxt) : '<span class="muted">·</span>'}</td>`;
      }).join('')}<td class="num mono"><b>${esc(opts.fmt?opts.fmt(tot):fmtNum(tot))}</b></td></tr>`;
    }).join('')}</tbody></table></div>
  <div class="xs muted" style="margin-top:6px">${esc(opts.caption||'Shading is relative to the largest cell ('+(opts.fmt?opts.fmt(max):fmtNum(max))+').')}</div>`;
}

/* --- Radar (profile across axes) -------------------------------------- */
function chartRadar(opts){
  const axes = opts.axes||[]; const series = opts.series||[];
  if(axes.length<3||!series.length) return `<div class="empty small">${esc(opts.empty||'At least three axes are needed.')}</div>`;
  const size = opts.size||310, c=size/2, r=size*0.30;
  const colours = opts.colours||chartColours(series.length);
  const max = opts.max || Math.max(1, ...series.flatMap(s=>s.values.map(v=>Number(v)||0)));
  const pt = (i,v)=>{ const a = -Math.PI/2 + 2*Math.PI*i/axes.length, rr = r*(Number(v)||0)/max; return [c+rr*Math.cos(a), c+rr*Math.sin(a)]; };
  const rings = [0.25,0.5,0.75,1].map(f=>`<polygon points="${axes.map((a,i)=>{const p=pt(i,max*f);return p[0].toFixed(1)+','+p[1].toFixed(1)}).join(' ')}" fill="none" stroke="var(--line)" stroke-width="1"/>`).join('');
  const spokes = axes.map((a,i)=>{const p=pt(i,max);return `<line x1="${c}" y1="${c}" x2="${p[0].toFixed(1)}" y2="${p[1].toFixed(1)}" stroke="var(--line)" stroke-width="1"/>`}).join('');
  const labs = axes.map((a,i)=>{const p=pt(i,max*1.22);return `<text class="axis-x" x="${p[0].toFixed(1)}" y="${p[1].toFixed(1)}" text-anchor="middle">${esc(String(a).slice(0,16))}</text>`}).join('');
  const polys = series.map((s,si)=>{
    const col = s.color||colours[si%colours.length];
    const pts = s.values.map((v,i)=>pt(i,v).map(n=>n.toFixed(1)).join(',')).join(' ');
    return `<polygon points="${pts}" fill="${col}" fill-opacity=".18" stroke="${col}" stroke-width="2.2"/>`+
      s.values.map((v,i)=>{const p=pt(i,v);return chartMarker(CHART_MARKERS[si%CHART_MARKERS.length],p[0],p[1],col,3)}).join('');
  }).join('');
  const rows = axes.map((a,i)=>{ const r0={axis:a}; series.forEach(s=>{ r0[s.label]=opts.fmt?opts.fmt(s.values[i]):fmtNum(s.values[i]); }); return r0; });
  const tbl = chartTable([{key:'axis',label:opts.axisHead||'Axis'},...series.map(s=>({key:s.label,label:s.label,cls:'num mono'}))], rows, {title:opts.title||'Profile table'});
  if(isChartTableMode()) return tbl;
  return `<figure class="chart-fig" style="margin:0">
    <div class="chart-key">${series.map((s,i)=>`<span class="ck"><i style="background:${s.color||colours[i%colours.length]}"></i>${esc(s.label)}</span>`).join('')}</div>
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(opts.title||'Profile')}" preserveAspectRatio="xMidYMid meet">${rings}${spokes}${polys}${labs}</svg>
    ${tbl}
  </figure>`;
}

/* --- Sparkline (inline trend inside a table cell) --------------------- */
function chartSpark(values, opts={}){
  const v = (values||[]).map(n=>Number(n)||0);
  if(v.length<2) return '<span class="xs muted">–</span>';
  const W=opts.width||96, H=opts.height||24, max=Math.max(...v), min=Math.min(...v), span=(max-min)||1;
  const pts = v.map((n,i)=>[W*i/(v.length-1), H-2-(H-4)*(n-min)/span]);
  const d = pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
  const last = pts[pts.length-1];
  const up = v[v.length-1]>=v[0];
  const colour = opts.color || (up? 'var(--ok)':'var(--crit)');
  return `<svg class="spark" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label||'Trend')}: ${v.join(', ')}">
    <path d="${d}" fill="none" stroke="${colour}" stroke-width="1.8" stroke-linejoin="round"/>
    <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2.2" fill="${colour}"/></svg>`;
}

/* --- Waterfall (budget -> commitments -> payments -> remaining) ------- */
function chartWaterfall(steps, opts={}){
  const rows = (steps||[]).filter(s=>s && s.label);
  if(!rows.length) return `<div class="empty small">${esc(opts.empty||'Nothing to plot yet.')}</div>`;
  const W=860,H=opts.height||280,padL=74,padR=24,padT=30,padB=54;
  let run=0; const items = rows.map(r=>{
    const v = Number(r.value)||0;
    const from = r.kind==='total'? 0 : run;
    const to = r.kind==='total'? v : run+v;
    if(r.kind!=='total') run = to;
    return {...r, from, to, v};
  });
  const max = Math.max(1, ...items.map(i=>Math.max(i.from,i.to)));
  const {grid, inner, plotW} = chartFrame(W,H,padL,padR,padT,padB,max,{fmtY:opts.fmtY});
  const bw = plotW/items.length;
  const bars = items.map((it,i)=>{
    const w = Math.min(68, bw*0.58);
    const x = padL+i*bw+(bw-w)/2;
    const y0 = padT+inner-inner*(Math.max(it.from,it.to)/max), y1 = padT+inner-inner*(Math.min(it.from,it.to)/max);
    const colour = it.kind==='total'? 'var(--ink-3)' : (it.v>=0? (it.color||'var(--crit)') : (it.color||'var(--ok)'));
    const topLbl = (it.v>=0&&it.kind!=='total'?'+':it.v<0?'-':'') + fmtCompact(Math.abs(it.v));
    return `<rect x="${x.toFixed(1)}" y="${y0.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(2,(y1-y0)).toFixed(1)}" fill="${colour}" rx="3" opacity="${it.kind==='total'?0.92:0.86}">
        <title>${esc(it.label)}: ${opts.fmt?opts.fmt(it.v):fmtNum(it.v)}</title></rect>
      <text class="val" x="${(x+w/2).toFixed(1)}" y="${Math.max(12,y0-(i%2===1?15:6)).toFixed(1)}" text-anchor="middle">${esc(topLbl)}</text>
      <text class="axis-x" x="${(x+w/2).toFixed(1)}" y="${H-22}" text-anchor="middle">${esc(String(it.label).slice(0,14))}</text>`;
  }).join('');
  const tbl = chartTable([{key:'Step',label:'Step'},{key:'Amount',label:'Amount',cls:'num mono'},{key:'Balance',label:'Balance',cls:'num mono'}], items.map(i=>({Step:i.label, Amount:opts.fmt?opts.fmt(i.v):fmtNum(i.v), Balance:opts.fmt?opts.fmt(i.to):fmtNum(i.to)})), {title:opts.title||'Movement table'});
  if(isChartTableMode()) return tbl;
  return `<figure class="chart-fig" style="margin:0">
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.title||'Movement')}" preserveAspectRatio="xMidYMid meet">${grid}${bars}</svg>
    <figcaption class="small muted" style="margin-top:8px">${esc(opts.caption||'Each step shows the movement from the previous balance.')}</figcaption>
    ${tbl}
  </figure>`;
}

/* --- Crystal-Clear Expenditure Against Budget Board (Global & Costing) --- */
function budgetVsActualBoard(lines, opts={}){
  const fmt = opts.fmt || (v => (typeof money==='function' ? money(Math.round(v)) : fmtNum(Math.round(v))));
  const clean = (lines||[]).map(r=>{
    const budget = Math.max(0, Number(r.budget)||0);
    const spent = Math.max(0, Number(r.spent ?? r.actual ?? r.paid)||0);
    const committed = Math.max(0, Number(r.committed)||0);
    const totalUsed = spent + committed;
    const remaining = budget - totalUsed;
    const pctUsed = budget > 0 ? +(100 * totalUsed / budget).toFixed(1) : (totalUsed > 0 ? 100 : 0);
    const status = budget <= 0 ? { label:'Unbudgeted', tone:'b-neutral', bar:'#64748B' }
      : pctUsed > 100 ? { label:'Over Budget', tone:'b-crit', bar:'#DC2626' }
      : pctUsed >= 85 ? { label:'Near Ceiling', tone:'b-warn', bar:'#D97706' }
      : { label:'Within Budget', tone:'b-ok', bar:'#059669' };
    return { ...r, budget, spent, committed, totalUsed, remaining, pctUsed, status };
  });

  const totBudget = opts.totalBudget != null ? Number(opts.totalBudget) : clean.reduce((n,r)=>n+r.budget, 0);
  const totSpent = opts.totalSpent != null ? Number(opts.totalSpent) : clean.reduce((n,r)=>n+r.spent, 0);
  const totCommitted = clean.reduce((n,r)=>n+r.committed, 0);
  const totUsed = totSpent + totCommitted;
  const totRem = totBudget - totUsed;
  const totPct = totBudget > 0 ? +(100 * totUsed / totBudget).toFixed(1) : 0;
  const hasCommitted = totCommitted > 0 || opts.showCommitted;
  const headColor = totPct > 100 ? '#DC2626' : (totPct >= 85 ? '#D97706' : '#059669');

  return `<div class="bva-board">
    <div class="bva-summary-grid">
      <div class="bva-stat">
        <span class="xs muted bold">APPROVED BUDGET</span>
        <b class="mono">${esc(fmt(totBudget))}</b>
        <span class="xs muted">${esc(opts.periodLabel || 'Authorised allocation')}</span>
      </div>
      <div class="bva-stat">
        <span class="xs muted bold">ACTUAL EXPENDITURE${hasCommitted?' (+ COMMITTED)':''}</span>
        <b class="mono" style="color:var(--ink)">${esc(fmt(totUsed))}</b>
        <span class="xs muted">${hasCommitted ? `${esc(fmt(totSpent))} paid · ${esc(fmt(totCommitted))} committed` : `${totPct}% of approved ceiling`}</span>
      </div>
      <div class="bva-stat">
        <span class="xs muted bold">${totRem >= 0 ? 'REMAINING BALANCE' : 'BUDGET OVERRUN'}</span>
        <b class="mono" style="color:${headColor}">${totRem < 0 ? '-' : ''}${esc(fmt(Math.abs(totRem)))}</b>
        <span class="xs" style="color:${headColor};font-weight:700">${totRem >= 0 ? `${(100 - Math.min(100, totPct)).toFixed(1)}% headroom available` : `${(totPct - 100).toFixed(1)}% above ceiling`}</span>
      </div>
    </div>
    <div class="bva-overall-bar">
      <div class="spread xs" style="margin-bottom:5px">
        <span class="bold">Overall Expenditure Against Approved Budget</span>
        <span class="mono bold" style="color:${headColor}">${totPct}% utilised</span>
      </div>
      <div class="progress ${totPct>100?'crit':totPct>=85?'warn':'ok'}" style="height:9px"><i style="width:${Math.min(100, Math.max(0, totPct))}%"></i></div>
    </div>
    <div class="tbl-wrap" style="margin-top:12px">
      <table class="tbl align-sym bva-table">
        <thead>
          <tr>
            <th>Budget Line / Expenditure Group</th>
            <th class="num">Approved Budget</th>
            <th class="num">Actual Spent</th>
            ${hasCommitted ? '<th class="num">Committed</th>' : ''}
            <th class="num">Remaining / Variance</th>
            <th style="min-width:140px">Utilisation</th>
            <th class="right">Standing</th>
          </tr>
        </thead>
        <tbody>
          ${clean.map(r=>`<tr>
            <td><div class="cellname">${r.color?`<span class="sw-dot" style="background:${esc(r.color)}"></span>`:''}${esc(r.label)}${r.sub?`<span class="sm">${esc(r.sub)}</span>`:''}</div></td>
            <td class="num mono">${esc(fmt(r.budget))}</td>
            <td class="num mono"><b>${esc(fmt(r.spent))}</b></td>
            ${hasCommitted ? `<td class="num mono">${esc(fmt(r.committed))}</td>` : ''}
            <td class="num mono" style="color:${r.remaining<0?'var(--crit)':'var(--ok)'};font-weight:700">${r.remaining<0?'-':''}${esc(fmt(Math.abs(r.remaining)))}</td>
            <td>
              <div class="row" style="gap:7px;align-items:center">
                <div class="progress ${r.pctUsed>100?'crit':r.pctUsed>=85?'warn':'ok'}" style="flex:1;height:7px"><i style="width:${Math.min(100, Math.max(0, r.pctUsed))}%"></i></div>
                <span class="xs mono bold" style="min-width:42px;text-align:right">${r.pctUsed}%</span>
              </div>
            </td>
            <td class="right">${badge(r.status.label, r.status.tone, 'nodot')}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr class="ct-total-row">
            <td><b>Total Expenditure Against Budget</b></td>
            <td class="num mono"><b>${esc(fmt(totBudget))}</b></td>
            <td class="num mono"><b>${esc(fmt(totSpent))}</b></td>
            ${hasCommitted ? `<td class="num mono"><b>${esc(fmt(totCommitted))}</b></td>` : ''}
            <td class="num mono" style="color:${headColor}"><b>${totRem<0?'-':''}${esc(fmt(Math.abs(totRem)))}</b></td>
            <td class="mono bold">${totPct}% used</td>
            <td class="right">${badge(totPct>100?'Over Budget':totPct>=85?'Near Ceiling':'Within Budget', totPct>100?'b-crit':totPct>=85?'b-warn':'b-ok', 'nodot')}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>`;
}

