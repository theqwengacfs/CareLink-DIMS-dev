/* ============================================================
   bmi_clinical6.js - CareLink v6.3 BMI Nutritional Intelligence
   & Medical Case Manager / Clinical Assistant Console (v2.5.0)
   ============================================================ */

const BMI_BANDS = [
  { id:'sam',      min:0,    max:15.99, label:'Severely Underweight (SAM)', short:'Severe Underweight', tone:'b-crit', hex:'#DC2626', bg:'#FEF2F2', border:'#FCA5A5', guidance:'Urgent MCM/clinical review, therapeutic nutrition & Bag 1/2/Special dietary escalation.' },
  { id:'under',    min:16.0, max:18.49, label:'Moderately Underweight',     short:'Underweight',        tone:'b-warn', hex:'#D97706', bg:'#FFFBEB', border:'#FCD34D', guidance:'Priority nutrition support, 3-visit weight tracking & adherence check.' },
  { id:'normal',   min:18.5, max:24.99, label:'Normal Nutritional Status',  short:'Normal BMI',         tone:'b-ok',   hex:'#059669', bg:'#ECFDF5', border:'#6EE7B7', guidance:'Healthy nutritional range — maintain balanced household diet & wellness plan.' },
  { id:'over',     min:25.0, max:29.99, label:'Overweight',                 short:'Overweight',         tone:'b-info', hex:'#2563EB', bg:'#EFF6FF', border:'#93C5FD', guidance:'Monitor blood pressure, blood glucose & cardiovascular lifestyle counselling.' },
  { id:'obese1',   min:30.0, max:34.99, label:'Obese (Class I)',            short:'Obese Class I',      tone:'b-warn', hex:'#7C3AED', bg:'#F5F3FF', border:'#C4B5FD', guidance:'NCD & metabolic risk management; review dietary composition.' },
  { id:'obese2',   min:35.0, max:999,   label:'Severely Obese (Class II+)', short:'Obese Class II+',    tone:'b-crit', hex:'#BE123C', bg:'#FFF1F2', border:'#FDA4AF', guidance:'High cardiometabolic risk — specialist MOPC/nutritionist review & Special Bag consideration.' }
];

const BMI_CLINICAL = {
  BANDS: BMI_BANDS,

  compute(weightKg, heightCm){
    const w = Number(weightKg), h = Number(heightCm);
    if(!(w > 0) || !(h > 0)) return null;
    const val = +(w / Math.pow(h / 100, 2)).toFixed(1);
    if(!isFinite(val) || val <= 0) return null;
    return val;
  },

  classify(bmiVal){
    const v = Number(bmiVal);
    if(!(v > 0)) return { id:'unknown', label:'Height / Weight Pending', short:'BMI Pending', tone:'b-neutral', hex:'#64748B', bg:'#F8FAFC', border:'#CBD5E1', guidance:'Record baseline height (cm) and 3-visit weight (kg) to compute nutritional status.' };
    return BMI_BANDS.find(b=>v >= b.min && v <= b.max) || BMI_BANDS[BMI_BANDS.length-1];
  },

  /* WHO / Kenya MoH BMI-for-Age classification for children & adolescents (<18 yrs) */
  classifyPediatricBmi(bmiVal, ageYears){
    const v = Number(bmiVal), age = Number(ageYears ?? 8);
    if(!(v > 0)) return this.classify(0);
    if(age >= 18) return this.classify(v);
    const cuts = age < 5
      ? { sam:12.9, under:13.9, over:17.2, obese:18.6 }
      : (age < 10
        ? { sam:13.3, under:14.2, over:18.4, obese:20.6 }
        : { sam:15.0, under:16.4, over:22.8, obese:26.2 });
    if(v < cuts.sam)   return { ...BMI_BANDS[0], label:`Paediatric Severe Thinness / SAM (${age}y)`, short:'Child SAM', cuts };
    if(v < cuts.under) return { ...BMI_BANDS[1], label:`Paediatric Thinness / MAM (${age}y)`, short:'Child MAM', cuts };
    if(v <= cuts.over) return { ...BMI_BANDS[2], label:`Healthy BMI-for-Age (${age}y)`, short:'Healthy BMI-for-Age', cuts };
    if(v <= cuts.obese)return { ...BMI_BANDS[3], label:`Paediatric Overweight-for-Age (${age}y)`, short:'Child Overweight', cuts };
    return { ...BMI_BANDS[4], label:`Paediatric Obesity-for-Age (${age}y)`, short:'Child Obesity', cuts };
  },

  /* WHO / Kenya MoH IMAM MUAC Tape Classification (6–59 mos, 5–9 yrs, 10–17 yrs, Adults) */
  muacCutoffs(ageYears){
    const age = Number(ageYears ?? 4);
    if(age < 5)  return { sam:115, mam:125, max:165, group:'Under-5 (6–59 mos)' };
    if(age < 10) return { sam:135, mam:145, max:195, group:'School-Age (5–9 yrs)' };
    if(age < 18) return { sam:160, mam:185, max:250, group:'Adolescent (10–17 yrs)' };
    return { sam:185, mam:220, max:320, group:'Adult (18+ yrs)' };
  },

  classifyMuac(muacMm, ageYears){
    const m = Number(muacMm);
    const c = this.muacCutoffs(ageYears);
    if(!(m > 0)) return { id:'unknown', label:'MUAC Pending', short:'MUAC Pending', hex:'#64748B', bg:'#F8FAFC', border:'#CBD5E1', cuts:c };
    const cm = (m / 10).toFixed(1);
    if(m < c.sam) return { id:'sam', label:`RED Tape · SAM (${cm} cm < ${(c.sam/10).toFixed(1)} cm)`, short:`RED · SAM (${cm} cm)`, tone:'b-crit', hex:'#DC2626', bg:'#FEF2F2', border:'#FCA5A5', cuts:c, guidance:'Immediate IMAM therapeutic feeding (RUTF / F-75 / Special Bag) & clinical evaluation.' };
    if(m < c.mam) return { id:'mam', label:`YELLOW Tape · MAM (${cm} cm)`, short:`AMBER · MAM (${cm} cm)`, tone:'b-warn', hex:'#D97706', bg:'#FFFBEB', border:'#FCD34D', cuts:c, guidance:'Supplementary nutrition (RUSF / Special Food Bag) & fortnightly MUAC tape check.' };
    return { id:'normal', label:`GREEN Tape · Nourished (${cm} cm)`, short:`GREEN · ${cm} cm`, tone:'b-ok', hex:'#059669', bg:'#ECFDF5', border:'#6EE7B7', cuts:c, guidance:'Adequate mid-upper arm circumference for age — maintain balanced nutrition.' };
  },

  muacBadgeHTML(muacMm, ageYears, compact=false){
    const b = this.classifyMuac(muacMm, ageYears);
    return `<span class="bmi-pill" style="background:${b.bg};color:${b.hex};border-color:${b.border}" title="${esc(b.guidance||'')}">
      <i style="background:${b.hex}"></i><b>${esc(compact ? b.short : b.label)}</b>
    </span>`;
  },

  plausibilityCheck(weightKg, heightCm, prevWeightKg, ageYears){
    const issues = [];
    const w = Number(weightKg), h = Number(heightCm), age = Number(ageYears ?? 35);
    if(!(w > 0)) issues.push({ level:'err', text:'Weight (kg) must be a positive number.' });
    if(!(h > 0)) issues.push({ level:'err', text:'Height (cm) must be a positive number.' });
    if(w > 0 && h > 0){
      if(age >= 18 && (h < 110 || h > 215)) issues.push({ level:'warn', text:`Adult height ${h} cm is outside normal range (110–215 cm) — verify units (cm vs m/ft) against paper form.` });
      if(age < 18 && (h < 45 || h > 200)) issues.push({ level:'warn', text:`Paediatric height ${h} cm appears unusual — verify tape measurement.` });
      if(age >= 18 && (w < 24 || w > 190)) issues.push({ level:'warn', text:`Adult weight ${w} kg is extreme — confirm scale calibration before saving.` });
      const bmi = this.compute(w, h);
      if(bmi && (bmi < 11.0 || bmi > 52)) issues.push({ level:'warn', text:`Calculated BMI (${bmi} kg/m²) is physiologically extreme — double-check weight/height transposition.` });
      if(Number(prevWeightKg) > 0){
        const deltaPct = ((w - Number(prevWeightKg)) / Number(prevWeightKg)) * 100;
        if(deltaPct <= -10) issues.push({ level:'crit', text:`Rapid weight loss of ${Math.abs(deltaPct).toFixed(1)}% (${prevWeightKg} -> ${w} kg) — immediate clinical & nutritional red-flag review required.` });
        else if(Math.abs(deltaPct) >= 18 && age >= 12) issues.push({ level:'warn', text:`Large single-interval weight swing (${deltaPct>0?'+':''}${deltaPct.toFixed(1)}%) — verify reading for clerical error.` });
      }
    }
    return {
      ok: !issues.some(i=>i.level==='err'),
      needsVerification: issues.length > 0,
      issues
    };
  },

  patientBmiInfo(p){
    if(!p) return null;
    const cl = p.clinical || {};
    const visitsDesc = (typeof DB !== 'undefined' && DB.visitsFor) ? DB.visitsFor(p.id) : ((DB.db && DB.db.visits || []).filter(v=>v.patientId===p.id));
    /* Synthesize deterministic realistic height/weight if legacy demo patient only had weight or bmi */
    let w = Number(cl.weightKg || p.weightKg || 0);
    let h = Number(cl.heightCm || p.heightCm || 0);
    let bmi = Number(cl.bmi || 0);
    const age = Number(p.age ?? 34);
    const isChild = age < 18;
    if(!h && w > 0 && bmi > 0){
      h = Math.round(Math.sqrt(w / bmi) * 100);
    } else if(!h){
      const seed = String(p.id||'p1').split('').reduce((n,c)=>n+c.charCodeAt(0),0);
      h = age < 5 ? (78 + (seed % 26)) : (age < 15 ? (115 + (seed % 38)) : (154 + (seed % 24)));
    }
    if(!w){
      const seed = String(p.id||'p1').split('').reduce((n,c)=>n*3+c.charCodeAt(0),7);
      const bandPick = isChild ? [13.5, 14.8, 15.8, 16.4, 17.6][seed % 5] : [15.4, 17.3, 20.8, 22.4, 23.6, 26.8, 31.2][seed % 7];
      w = +(bandPick * Math.pow(h / 100, 2)).toFixed(1);
    }
    bmi = this.compute(w, h) || bmi;
    const baseW = Number(p.baselineWeightKg || cl.baselineWeightKg || +(w - 1.4).toFixed(1));
    const muacMm = Number(cl.muacMm || (visitsDesc[0] && visitsDesc[0].muacMm) || (age < 5 ? 131 : (age < 10 ? 152 : (age < 18 ? 192 : 245))));
    const baseMuacMm = Number(cl.baselineMuacMm || Math.max(105, muacMm - 7));
    const band = isChild ? this.classifyPediatricBmi(bmi, age) : this.classify(bmi);
    const muacBand = this.classifyMuac(muacMm, age);
    const visitsSinceWeigh = cl.lastWeighedVisitCount != null
      ? Math.max(0, visitsDesc.length - Number(cl.lastWeighedVisitCount))
      : (visitsDesc.length % 4);
    const dueThreeVisitRule = p.status === 'active' && visitsSinceWeigh >= 3;
    const check = this.plausibilityCheck(w, h, baseW, age);
    return {
      patient: p,
      isChild,
      age,
      weightKg: w,
      heightCm: h,
      baselineWeightKg: baseW,
      weightDeltaKg: +(w - baseW).toFixed(1),
      bmi,
      band,
      muacMm,
      muacCm: +(muacMm / 10).toFixed(1),
      baselineMuacMm: baseMuacMm,
      muacDeltaMm: muacMm - baseMuacMm,
      muacBand,
      visitsCount: visitsDesc.length,
      visitsSinceWeigh,
      dueThreeVisitRule,
      plausibility: check,
      verifiedBy: cl.bmiVerifiedBy || null,
      verifiedAt: cl.bmiVerifiedAt || null
    };
  },

  badgeHTML(bmiVal, compact=false, ageYears=null){
    const b = (ageYears != null && Number(ageYears) < 18) ? this.classifyPediatricBmi(bmiVal, ageYears) : this.classify(bmiVal);
    const numTxt = Number(bmiVal) > 0 ? `${Number(bmiVal).toFixed(1)} · ` : '';
    return `<span class="bmi-pill" style="background:${b.bg};color:${b.hex};border-color:${b.border}" title="${esc(b.guidance||'')}">
      <i style="background:${b.hex}"></i><b>${esc(numTxt)}${esc(compact ? b.short : b.label)}</b>
    </span>`;
  },

  /* Reusable WHO/MoH longitudinal growth curve SVG (Weight, BMI-for-Age, MUAC Tape) */
  renderGrowthSvg(points, opts={}){
    const W = 360, H = 190, padL = 40, padR = 14, padT = 18, padB = 30;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    if(!points || !points.length){
      return `<div class="xs muted" style="padding:22px;text-align:center">No anthropometric points recorded yet.</div>`;
    }
    const vals = points.map(pt=>Number(pt.v)).filter(v=>isFinite(v) && v > 0);
    const bandNums = (opts.zones||[]).flatMap(z=>[z.from, z.to]).filter(v=>isFinite(v));
    let minV = Math.min(...vals, ...(bandNums.length ? [Math.min(...vals) - 0.8] : []));
    let maxV = Math.max(...vals, ...(bandNums.length ? [Math.max(...vals) + 0.8] : []));
    if(opts.minFloor != null) minV = Math.min(minV, opts.minFloor);
    if(opts.maxCeil != null) maxV = Math.max(maxV, opts.maxCeil);
    if(maxV - minV < 2) { minV -= 1; maxV += 1; }
    const yOf = v => padT + plotH - ((Math.max(minV, Math.min(maxV, v)) - minV) / (maxV - minV)) * plotH;
    const xOf = idx => points.length === 1 ? padL + plotW / 2 : padL + (idx / (points.length - 1)) * plotW;

    const zoneRects = (opts.zones||[]).map(z=>{
      const hi = Math.min(maxV, z.to);
      const lo = Math.max(minV, z.from);
      if(hi <= lo) return '';
      const y1 = yOf(hi), y2 = yOf(lo);
      return `<rect x="${padL}" y="${y1.toFixed(1)}" width="${plotW}" height="${Math.max(1, y2-y1).toFixed(1)}" fill="${z.fill}" opacity="0.55"/>`;
    }).join('');

    const ticks = [0, 0.5, 1].map(f=>{
      const tv = minV + (maxV - minV) * f;
      const y = yOf(tv);
      return `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W-padR}" y2="${y.toFixed(1)}" stroke="rgba(148,163,184,.25)" stroke-dasharray="3,3"/>
        <text x="${padL-5}" y="${(y+3.5).toFixed(1)}" text-anchor="end" font-size="9.5" fill="currentColor" opacity="0.68">${tv.toFixed(opts.decimals ?? 1)}</text>`;
    }).join('');

    const pathD = points.map((pt, idx)=>`${idx===0?'M':'L'}${xOf(idx).toFixed(1)},${yOf(pt.v).toFixed(1)}`).join(' ');
    const areaD = `${pathD} L${xOf(points.length-1).toFixed(1)},${(padT+plotH).toFixed(1)} L${xOf(0).toFixed(1)},${(padT+plotH).toFixed(1)} Z`;
    const stroke = opts.color || '#0F766E';
    const dots = points.map((pt, idx)=>{
      const cx = xOf(idx), cy = yOf(pt.v);
      const dotFill = pt.type==='homestay' ? '#7C3AED' : (pt.type==='hospital' ? '#2563EB' : stroke);
      return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${idx===points.length-1?4.2:2.9}" fill="${dotFill}" stroke="#fff" stroke-width="1.2">
        <title>${esc(pt.date||'')} (${esc(pt.type||'home')}): ${Number(pt.v).toFixed(opts.decimals ?? 1)} ${esc(opts.unit||'')}</title>
      </circle>`;
    }).join('');

    const firstLbl = points[0]?.date ? points[0].date.slice(5) : 'Start';
    const midLbl = points[Math.floor(points.length/2)]?.date ? points[Math.floor(points.length/2)].date.slice(5) : '';
    const lastLbl = points[points.length-1]?.date ? points[points.length-1].date.slice(5) : 'Latest';
    const delta = +(points[points.length-1].v - points[0].v).toFixed(opts.decimals ?? 1);

    return `<div class="growth-chart-box" style="border:1px solid var(--line);border-radius:10px;padding:10px 12px;background:var(--surface)">
      <div class="spread" style="margin-bottom:4px;gap:6px">
        <div>
          <div class="small bold">${esc(opts.title||'Growth Curve')}</div>
          <div class="xs muted">${esc(opts.subtitle||'Longitudinal trajectory')}</div>
        </div>
        <div style="text-align:right">
          <b class="mono" style="font-size:15px;color:${stroke}">${Number(points[points.length-1].v).toFixed(opts.decimals ?? 1)} ${esc(opts.unit||'')}</b>
          <div class="xs mono ${delta>=0?'ok':'crit'}">${delta>=0?'+':''}${delta} ${esc(opts.unit||'')} (${points.length} visits)</div>
        </div>
      </div>
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;overflow:visible" role="img" aria-label="${esc(opts.title||'Growth chart')}">
        ${zoneRects}
        ${ticks}
        <path d="${areaD}" fill="${stroke}" opacity="0.10"/>
        <path d="${pathD}" fill="none" stroke="${stroke}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>
        ${dots}
        <text x="${padL}" y="${H-8}" font-size="9.5" fill="currentColor" opacity="0.65">${esc(firstLbl)}</text>
        <text x="${(padL+plotW/2).toFixed(1)}" y="${H-8}" text-anchor="middle" font-size="9.5" fill="currentColor" opacity="0.65">${esc(midLbl)}</text>
        <text x="${W-padR}" y="${H-8}" text-anchor="end" font-size="9.5" fill="currentColor" opacity="0.65">${esc(lastLbl)}</text>
      </svg>
      <div class="row" style="gap:10px;margin-top:4px;flex-wrap:wrap;justify-content:space-between">
        <span class="xs muted"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${stroke};margin-right:4px"></span>Home visit</span>
        <span class="xs muted"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#2563EB;margin-right:4px"></span>Hospital clinic</span>
        <span class="xs muted"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#7C3AED;margin-right:4px"></span>Homestay / Care Centre</span>
      </div>
    </div>`;
  },

  /* Complete 3-panel Weight, BMI-for-Age & MUAC Growth Surveillance card for any Child or Adult patient */
  renderPatientGrowthCharts(p){
    if(!p) return '';
    const bi = this.patientBmiInfo(p);
    const visitsChron = ((typeof DB !== 'undefined' && DB.visitsFor) ? DB.visitsFor(p.id) : ((DB.db&&DB.db.visits||[]).filter(v=>v.patientId===p.id)))
      .slice().sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    const age = Number(p.age ?? 8);
    const isChild = age < 18;
    const mCuts = this.muacCutoffs(age);
    const wtPts = visitsChron.filter(v=>Number(v.weight)>0).map(v=>({ date:v.date, type:v.type, v:Number(v.weight) }));
    const bmiPts = visitsChron.map(v=>{
      const h = Number(v.heightCm || bi.heightCm || 120);
      const val = Number(v.bmi) || (Number(v.weight)>0 ? this.compute(v.weight, h) : 0);
      return val > 0 ? { date:v.date, type:v.type, v:val } : null;
    }).filter(Boolean);
    const muacPts = visitsChron.map((v, idx)=>{
      const rawMm = Number(v.muacMm) || Math.round(bi.baselineMuacMm + ((bi.muacMm - bi.baselineMuacMm) * ((idx+1)/Math.max(1, visitsChron.length))));
      return { date:v.date, type:v.type, v:+(rawMm / 10).toFixed(1) };
    });

    const pBmiCuts = isChild
      ? (age < 5 ? { sam:12.9, under:13.9, over:17.2 } : (age < 10 ? { sam:13.3, under:14.2, over:18.4 } : { sam:15.0, under:16.4, over:22.8 }))
      : { sam:16.0, under:18.5, over:25.0 };

    const wtSvg = this.renderGrowthSvg(wtPts, {
      title: isChild ? `Child Weight-for-Age Trajectory (${age} yrs)` : 'Longitudinal Weight Trajectory',
      subtitle: `Baseline ${bi.baselineWeightKg.toFixed(1)} kg -> Current ${bi.weightKg.toFixed(1)} kg`,
      unit:'kg', decimals:1, color:'#0F766E'
    });
    const bmiSvg = this.renderGrowthSvg(bmiPts, {
      title: isChild ? `WHO BMI-for-Age Curve (${age} yrs)` : 'WHO Adult BMI Trajectory',
      subtitle: isChild ? 'Shaded SAM / MAM / Healthy BMI-for-Age Z-bands' : 'Shaded WHO nutritional reference bands',
      unit:'kg/m²', decimals:1, color:bi.band.hex || '#2563EB',
      minFloor: pBmiCuts.sam - 0.8, maxCeil: pBmiCuts.over + 1.4,
      zones:[
        { from:0, to:pBmiCuts.sam, fill:'#FECACA' },
        { from:pBmiCuts.sam, to:pBmiCuts.under, fill:'#FDE68A' },
        { from:pBmiCuts.under, to:pBmiCuts.over, fill:'#BBF7D0' },
        { from:pBmiCuts.over, to:60, fill:'#BFDBFE' }
      ]
    });
    const muacSvg = this.renderGrowthSvg(muacPts, {
      title: isChild ? `Child MUAC Tape Chart (${mCuts.group})` : 'Adult MUAC Arm Tape Curve',
      subtitle: `Red <${(mCuts.sam/10).toFixed(1)} cm · Amber ${(mCuts.sam/10).toFixed(1)}–${((mCuts.mam-1)/10).toFixed(1)} cm · Green ≥${(mCuts.mam/10).toFixed(1)} cm`,
      unit:'cm', decimals:1, color:bi.muacBand.hex || '#059669',
      minFloor: (mCuts.sam/10) - 0.8, maxCeil: (mCuts.mam/10) + 2.2,
      zones:[
        { from:0, to:mCuts.sam/10, fill:'#FECACA' },
        { from:mCuts.sam/10, to:mCuts.mam/10, fill:'#FDE68A' },
        { from:mCuts.mam/10, to:40, fill:'#BBF7D0' }
      ]
    });

    const homeN = visitsChron.filter(v=>v.type==='home'||v.type==='clinical').length;
    const hospN = visitsChron.filter(v=>v.type==='hospital').length;
    const hsN = visitsChron.filter(v=>v.type==='homestay').length;

    return `<div class="growth-surveillance-wrap">
      <div class="spread" style="margin-bottom:10px;flex-wrap:wrap;gap:8px">
        <div class="row" style="gap:8px;flex-wrap:wrap">
          ${badge(isChild ? `Paediatric Growth Chart · ${age} yrs (${p.sex})` : `Adult Anthropometry · ${age} yrs (${p.sex})`, isChild?'b-info':'b-neutral')}
          ${this.badgeHTML(bi.bmi, false, age)}
          ${this.muacBadgeHTML(bi.muacMm, age)}
        </div>
        <div class="xs muted mono">
          <b>${visitsChron.length}</b> total visits: <b>${homeN}</b> Home · <b>${hospN}</b> Hospital · <b>${hsN}</b> Homestay
        </div>
      </div>
      <div class="grid g3" style="gap:12px;margin-bottom:12px">${wtSvg}${bmiSvg}${muacSvg}</div>
      ${table([
        { label:'Visit #', cls:'mono', render:r=>`#${r._n}` },
        { label:'Date', cls:'mono', render:r=>fmtDate(r.date) },
        { label:'Care Setting', render:r=>r.type==='homestay'?badge('Homestay / Care Centre','b-warn'):(r.type==='hospital'?badge('Hospital Clinic','b-info'):badge(r.type==='clinical'?'MCM Clinical':'Home Visit','b-ok')) },
        { label:'Weight (kg)', cls:'num mono', render:r=>r.weight?`<b>${Number(r.weight).toFixed(1)} kg</b>`:'-' },
        { label:'Height (cm)', cls:'num mono', render:r=>`${Number(r.heightCm||bi.heightCm).toFixed(0)} cm` },
        { label:'BMI / BMI-for-Age', render:r=>{ const bv = r.bmi || this.compute(r.weight, r.heightCm||bi.heightCm); return bv ? this.badgeHTML(bv, true, age) : '-'; } },
        { label:'MUAC Tape', render:r=>r.muacMm ? this.muacBadgeHTML(r.muacMm, age, true) : '-' },
        { label:'Nutrition Bag', render:r=>r.foodBag ? badge(r.foodBag,'b-info','nodot') : '<span class="xs muted">—</span>' }
      ], visitsChron.map((v, i)=>({...v, _n:i+1})).slice(-8).reverse(), {emptyMsg:'No visit anthropometry recorded.'})}
    </div>`;
  },

  ensureClinicalStore(){
    if(!DB.db) return;
    DB.db.mcmNotes = DB.db.mcmNotes || [
      {
        id:'mcm-n1', patientId:(DB.db.patients&&DB.db.patients[0]?.id)||'p-1',
        countyId:'kisumu', areaId:'nyalenda', date:todayISO().slice(0,10),
        authorName:'Dr / MCM Kisumu Clinical Team', role:'Medical Case Manager',
        acuity:'moderate', bp:'118/76', pulse:78, temp:36.7, spo2:98,
        weightKg:49.5, heightCm:165, bmi:18.2,
        subjective:'Appetite improving on Bag 1 + multivitamins; mild evening fatigue.',
        objective:'Afebrile, chest clear, weight up +1.4 kg over 3 visits (BMI 18.2 — Moderately Underweight, approaching Normal).',
        assessment:'Recovering nutritional status with good ART adherence; continue 3-visit weigh-in.',
        plan:'Maintain fortnightly home visit, Bag 1 support, and review at JOOTRH MOPC in 14 days.'
      }
    ];
  },

  /* ---------------- 1. BMI NUTRITIONAL INTELLIGENCE CONSOLE ---------------- */
  renderBmiBoard(user, params={}){
    const allowed = RBAC.has(user,'patient.list') && !['mediahead','pr','finance','procurement','hr','welfare','vehicle','auditor','it','gov.partner','president'].includes(user.roleId);
    if(!allowed) return deniedPanel('patient.view.basic');
    const ps = repo.patientList(user).filter(p=>p.status!=='archived');
    const areaFilter = params.area || '';
    const bandFilter = params.band || '';
    const q = (params.q || '').toLowerCase();

    const allInfo = ps.map(p=>this.patientBmiInfo(p)).filter(Boolean);
    const filtered = allInfo.filter(x=>
      (!areaFilter || x.patient.areaId===areaFilter) &&
      (!bandFilter || x.band.id===bandFilter || (bandFilter==='due3' && x.dueThreeVisitRule) || (bandFilter==='verify' && x.plausibility.needsVerification)) &&
      (!q || (x.patient.name+' '+x.patient.code+' '+areaName(x.patient.areaId)).toLowerCase().includes(q))
    );

    const counts = { sam:0, under:0, normal:0, over:0, obese1:0, obese2:0, due3:0, verify:0 };
    allInfo.forEach(x=>{
      if(counts[x.band.id]!==undefined) counts[x.band.id]++;
      if(x.dueThreeVisitRule) counts.due3++;
      if(x.plausibility.needsVerification) counts.verify++;
    });

    const roleLens = user.roleId==='caregiver' ? 'Caregiver Field Lens — Your Assigned Households & 3-Visit Weigh-In Queue'
      : user.roleId==='coordinator' ? 'Ministry Area Coordinator Lens — Area Malnutrition & Foodbag Targeting'
      : ['mcm','nurse','depthead','intl.medical'].includes(user.roleId) ? 'Clinical & Case Management Lens — SAM/MAM Triage, Plausibility & Dietary Regimens'
      : user.roleId==='liaison' ? 'Hospital Department Lens — Admitted & Outpatient Nutritional Continuity'
      : 'County & Ministry Area Nutritional Surveillance';

    /* Area aggregation */
    const areas = [...new Set(allInfo.map(x=>x.patient.areaId).filter(Boolean))];
    const areaRows = areas.map(aid=>{
      const sub = allInfo.filter(x=>x.patient.areaId===aid);
      const avgBmi = sub.length ? +(sub.reduce((n,x)=>n+x.bmi,0)/sub.length).toFixed(1) : 0;
      const underN = sub.filter(x=>x.band.id==='sam'||x.band.id==='under').length;
      const normN = sub.filter(x=>x.band.id==='normal').length;
      const overN = sub.filter(x=>['over','obese1','obese2'].includes(x.band.id)).length;
      return { areaId:aid, name:areaName(aid), total:sub.length, avgBmi, underN, normN, overN,
        due3:sub.filter(x=>x.dueThreeVisitRule).length };
    });

    const canRecord = RBAC.has(user,'visit.create') || RBAC.has(user,'patient.view.clinical') || RBAC.has(user,'hardcopy.intake');
    const sheet = params.sheet || 'overview';
    const childCohort = allInfo.filter(x=>x.isChild);
    const childU5 = childCohort.filter(x=>x.age < 5);
    const childRedMuac = childCohort.filter(x=>x.muacBand.id==='sam');
    const childAmberMuac = childCohort.filter(x=>x.muacBand.id==='mam');
    const selectedChildInfo = (params.childId && childCohort.find(x=>x.patient.id===params.childId)) || childCohort[0] || allInfo[0];

    const sheetBar = `<div class="tabs" style="margin-bottom:14px">
      <button class="tab ${sheet==='overview'?'active':''}" data-act="go" data-v="bmiboard" data-sheet="overview">${ic('activity',14)} All-Ages BMI Nutritional Board (${num(allInfo.length)})</button>
      <button class="tab ${sheet==='children'?'active':''}" data-act="go" data-v="bmiboard" data-sheet="children">${ic('heart',14)} Child Weight, BMI-for-Age & MUAC Charts (${num(childCohort.length)})</button>
    </div>`;

    if(sheet === 'children'){
      const childFiltered = childCohort.filter(x=>
        (!areaFilter || x.patient.areaId===areaFilter) &&
        (!q || (x.patient.name+' '+x.patient.code+' '+areaName(x.patient.areaId)).toLowerCase().includes(q))
      );
      return pageHead('Paediatric growth charts — Weight, BMI-for-Age & MUAC surveillance',
        `${num(childCohort.length)} children & adolescents (<18 yrs) in scope · WHO / Kenya MoH IMAM MUAC tape bands (6–59 mos, 5–9 yrs, 10–17 yrs) & longitudinal 12+ visit trajectories.`,
        `${canRecord?`<button class="btn btn-sm btn-primary" data-act="bmi-record-modal" data-id="${esc(selectedChildInfo?.patient?.id||'')}">${ic('plus',15)} Record Child Weight / Height / MUAC</button>`:''}`)
      + sheetBar
      + `<div class="grid g4" style="margin-bottom:14px">
          ${kpi('Children & adolescents (<18y)', num(childCohort.length), `${num(childU5.length)} Under-5s (6–59 mos) · ${num(childCohort.length - childU5.length)} 5–17 yrs`, 'info', 'users')}
          ${kpi('RED MUAC Tape (SAM)', num(childRedMuac.length), 'Immediate IMAM therapeutic RUTF / clinical triage', childRedMuac.length?'crit':'ok', 'alert')}
          ${kpi('YELLOW MUAC Tape (MAM)', num(childAmberMuac.length), 'Supplementary nutrition & Special Food Bag', childAmberMuac.length?'warn':'ok', 'activity')}
          ${kpi('GREEN MUAC Tape (Healthy)', num(childCohort.length - childRedMuac.length - childAmberMuac.length), 'Catch-up & sustained linear child growth', 'ok', 'check')}
        </div>`
      + (selectedChildInfo ? card(`Longitudinal child growth charts — ${selectedChildInfo.patient.name} (${selectedChildInfo.patient.code} · ${selectedChildInfo.age} yrs · ${areaName(selectedChildInfo.patient.areaId)})`,
          `<div class="row" style="gap:10px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
            <label class="xs bold muted">Inspect child growth curve:</label>
            <select class="input" style="max-width:360px" onchange="go('bmiboard',{sheet:'children',childId:this.value,area:'${esc(areaFilter)}'})">
              ${childFiltered.slice(0, 120).map(x=>`<option value="${esc(x.patient.id)}" ${x.patient.id===selectedChildInfo.patient.id?'selected':''}>${esc(x.patient.name)} (${x.age}y ${x.patient.sex} · ${esc(areaName(x.patient.areaId))} · MUAC ${x.muacCm} cm)</option>`).join('')}
            </select>
            <button class="btn btn-xs btn-ghost" data-act="go" data-v="patient" data-id="${esc(selectedChildInfo.patient.id)}" data-tab="visits">${ic('user',12)} Open Full Child File</button>
          </div>`
          + this.renderPatientGrowthCharts(selectedChildInfo.patient),
          { sub:'Three synchronised WHO/MoH anthropometric charts plotted across every Home, Hospital & Homestay visit.' }) : '')
      + card(`Paediatric anthropometric register (${num(childFiltered.length)} children <18 yrs)`,
          table([
            { label:'Child Beneficiary', render:x=>`<button class="linkbtn cellname" data-act="go" data-v="bmiboard" data-sheet="children" data-child-id="${esc(x.patient.id)}">${esc(x.patient.name)}</button><div class="xs muted mono">${esc(x.patient.code)} · ${x.age} yrs (${x.patient.sex}) · ${esc(areaName(x.patient.areaId))}</div>` },
            { label:'Weight Gain', cls:'mono', render:x=>`<b>${x.weightKg.toFixed(1)} kg</b> · ${x.heightCm} cm<div class="xs ${x.weightDeltaKg>=0?'ok':'crit'}">Baseline ${x.baselineWeightKg.toFixed(1)} kg (${x.weightDeltaKg>=0?'+':''}${x.weightDeltaKg} kg)</div>` },
            { label:'WHO BMI-for-Age', render:x=>this.badgeHTML(x.bmi, true, x.age) },
            { label:'MUAC Tape Band', render:x=>`${this.muacBadgeHTML(x.muacMm, x.age, true)}<div class="xs muted mono">${x.muacDeltaMm>=0?'+':''}${(x.muacDeltaMm/10).toFixed(1)} cm vs intake</div>` },
            { label:'Visits Logged', cls:'num mono', render:x=>`${x.visitsCount} visits` },
            { label:'', cls:'act', render:x=>`<button class="btn btn-xs btn-ghost" data-act="go" data-v="bmiboard" data-sheet="children" data-child-id="${esc(x.patient.id)}">View 3 Charts</button>` }
          ], childFiltered.slice(0, 60), {emptyMsg:'No paediatric patients in current filter.'}));
    }

    return pageHead('BMI nutritional status & anthropometric intelligence',
      `${esc(roleLens)} · Standardised WHO/MOH nutritional classification, child growth curves, 3-visit weight rule enforcement, and plausibility verification.`,
      `${canRecord?`<button class="btn btn-sm btn-primary" data-act="bmi-record-modal">${ic('plus',15)} Record / Verify Weight & Height</button>`:''}
       ${RBAC.has(user,'clinical.mcm')?`<button class="btn btn-sm btn-ghost" data-act="go" data-v="clinicalmcm">${ic('activity',15)} Case Manager Console</button>`:''}`)
    + sheetBar
    + `<div class="bmi-legend-strip">
        ${BMI_BANDS.map(b=>`<button class="bmi-band-card ${bandFilter===b.id?'on':''}" data-act="go" data-v="bmiboard" data-band="${bandFilter===b.id?'':b.id}" style="--bc:${b.hex};--bbg:${b.bg};--bbr:${b.border}">
          <div class="spread"><span class="xs bold" style="color:${b.hex}">${esc(b.short)}</span><b class="mono" style="font-size:18px;color:${b.hex}">${num(counts[b.id]||0)}</b></div>
          <div class="xs muted">BMI ${b.max>100?'≥ '+b.min:b.min.toFixed(1)+' – '+b.max.toFixed(1)} kg/m²</div>
        </button>`).join('')}
      </div>`
    + `<div class="grid g4" style="margin:14px 0">
        ${kpi('Underweight / SAM priority', num(counts.sam + counts.under), `${num(counts.sam)} SAM (<16) · ${num(counts.under)} Moderate (16–18.4)`, (counts.sam+counts.under)?'crit':'ok', 'alert')}
        ${kpi('Normal nutritional range', num(counts.normal), `${allInfo.length?Math.round(100*counts.normal/allInfo.length):0}% of ${num(allInfo.length)} patients`, 'ok', 'check')}
        ${kpi('3-visit weigh-in due', num(counts.due3), 'Trial Report: weigh every 3rd home visit', counts.due3?'warn':'ok', 'clock')}
        ${kpi('Plausibility / swing flags', num(counts.verify), 'Outlier height/weight or >10% weight loss', counts.verify?'warn':'ok', 'shield')}
      </div>`
    + `<div class="grid g2" style="margin-bottom:16px">
        ${card('Nutritional status distribution', typeof chartDonut!=='undefined' ? chartDonut(
          BMI_BANDS.map(b=>({ label:b.short, value:counts[b.id]||0, color:b.hex })),
          { title:'Patients by BMI nutritional category', centerValue:num(allInfo.length), centerLabel:'PATIENTS' }
        ) : '', {sub:'Mapped across your authorised ministry area, county or hospital caseload.'})}
        ${card('Ministry area BMI mapping & foodbag priority', table([
          {label:'Ministry area', render:r=>`<b>${esc(r.name)}</b><div class="xs muted">${num(r.total)} patient(s)</div>`},
          {label:'Mean BMI', cls:'num mono', render:r=>this.badgeHTML(r.avgBmi, true)},
          {label:'Underweight (<18.5)', cls:'num', render:r=>r.underN?badge(r.underN+' priority','b-crit','nodot'):'<span class="xs muted">0</span>'},
          {label:'Normal', cls:'num mono', render:r=>num(r.normN)},
          {label:'Overweight/Obese', cls:'num mono', render:r=>num(r.overN)},
          {label:'3-Visit Due', cls:'num', render:r=>r.due3?badge(r.due3+' due','b-warn','nodot'):badge('Up to date','b-ok','nodot')}
        ], areaRows, {emptyMsg:'No ministry areas in scope.'}), {sub:'Guides Coordinator & Procurement foodbag allocation (Bag 1 / Bag 2 / Special dietary bag).'})}
      </div>`
    + card(`Patient anthropometric & nutritional register (${filtered.length})`, `
        <div class="row" style="gap:8px;margin-bottom:12px;flex-wrap:wrap">
          <select class="input" style="max-width:210px" onchange="go('bmiboard',{area:this.value,band:'${esc(bandFilter)}'})">
            <option value="">All ministry areas in scope</option>
            ${areas.map(aid=>`<option value="${esc(aid)}" ${areaFilter===aid?'selected':''}>${esc(areaName(aid))}</option>`).join('')}
          </select>
          <button class="btn btn-xs ${bandFilter==='due3'?'btn-primary':'btn-ghost'}" data-act="go" data-v="bmiboard" data-band="${bandFilter==='due3'?'':'due3'}">${ic('clock',12)} 3-Visit Weigh-In Due (${counts.due3})</button>
          <button class="btn btn-xs ${bandFilter==='verify'?'btn-primary':'btn-ghost'}" data-act="go" data-v="bmiboard" data-band="${bandFilter==='verify'?'':'verify'}">${ic('shield',12)} Needs Verification (${counts.verify})</button>
          ${bandFilter||areaFilter?`<button class="btn btn-xs btn-ghost" data-act="go" data-v="bmiboard">${ic('x',12)} Clear filter</button>`:''}
        </div>
        ${table([
          {label:'Patient', render:x=>`<button class="linkbtn cellname" data-act="go" data-v="patient" data-id="${esc(x.patient.id)}">${esc(x.patient.name)}</button><div class="xs muted mono">${esc(x.patient.code)} · ${esc(areaName(x.patient.areaId))}</div>`},
          {label:'Weight / Height', cls:'mono', render:x=>`<b>${x.weightKg.toFixed(1)} kg</b> · ${x.heightCm} cm<div class="xs ${x.weightDeltaKg<0?'crit':'muted'}">Baseline ${x.baselineWeightKg.toFixed(1)} kg (${x.weightDeltaKg>=0?'+':''}${x.weightDeltaKg} kg)</div>`},
          {label:'BMI & Nutritional Status', render:x=>this.badgeHTML(x.bmi)},
          {label:'3-Visit Weight Rule', render:x=>x.dueThreeVisitRule ? badge(`Due now (${x.visitsSinceWeigh} visits since weigh-in)`,'b-warn') : badge(`Checked (${x.visitsSinceWeigh}/3 visits)`,'b-ok','nodot')},
          {label:'System Intelligence Check', render:x=>x.plausibility.needsVerification
            ? `<div class="xs" style="color:var(--crit)"><b>${ic('alert',12)} Verify reading:</b> ${esc(x.plausibility.issues[0].text)}</div>`
            : `<span class="xs muted">${x.verifiedBy ? `${ic('check',12)} Verified` : esc(x.band.guidance.slice(0,68)+'…')}</span>`},
          {label:'', cls:'act', render:x=>canRecord?`<button class="btn btn-xs btn-ghost" data-act="bmi-record-modal" data-id="${esc(x.patient.id)}">Weigh / Verify</button>`:''}
        ], filtered.slice(0,60), {emptyMsg:'No patients match the selected BMI filter.'})}`);
  },

  /* ---------------- 2. REINTEGRATED MEDICAL CASE MANAGER & CLINICAL ASSISTANT CONSOLE (v2.5.0) ---------------- */
  clinicalAlertsFor(user){
    const ps = repo.patientList(user).filter(p=>p.status==='active'||p.status==='discharge_recommended');
    const alerts = [];
    ps.forEach(p=>{
      const bi = this.patientBmiInfo(p);
      const days = PAT.days(p);
      if(bi && bi.band.id==='sam'){
        alerts.push({ severity:'crit', kind:'SAM Malnutrition (BMI < 16)', patient:p, detail:`BMI ${bi.bmi} kg/m² (${bi.weightKg} kg / ${bi.heightCm} cm) — immediate therapeutic nutrition & clinical review.` });
      }
      if(bi && bi.plausibility.issues.some(i=>i.level==='crit')){
        alerts.push({ severity:'crit', kind:'Rapid >10% Weight Loss', patient:p, detail:bi.plausibility.issues.find(i=>i.level==='crit').text });
      }
      if(days >= 120){
        alerts.push({ severity:days>=180?'crit':'warn', kind:`120+ Day Programme Overstay (${days}d)`, patient:p, detail:`${days} days in care — prepare/update 120+ Day PDCA clinical review for International Medical Team.` });
      }
      if(p.clinical && /poor|default/i.test(p.clinical.adherence||'')){
        alerts.push({ severity:'crit', kind:'Medication / ARV-TB Adherence Alert', patient:p, detail:`Adherence marked "${p.clinical.adherence}" — schedule pill count & home/clinic counselling.` });
      }
    });
    return alerts.sort((a,b)=>(a.severity==='crit'?0:1)-(b.severity==='crit'?0:1));
  },

  renderMcmConsole(user, params={}){
    if(!RBAC.can(user,'clinical.mcm',{}).ok) return deniedPanel('clinical.mcm');
    this.ensureClinicalStore();
    const tab = params.tab || 'triage';
    const ps = repo.patientList(user).filter(p=>p.status!=='archived');
    const alerts = this.clinicalAlertsFor(user);
    const over120 = ps.filter(p=>p.status==='active' && PAT.days(p)>=120);
    const pendingDisch = ps.filter(p=>p.status==='discharge_recommended');
    const hospActive = repo.requests(user).filter(r=>!['closed','rejected','declined'].includes(r.status));
    const notes = (DB.db.mcmNotes||[]).filter(n=>!user.countyId || isGlobal(user) || n.countyId===user.countyId);

    const tabs = [
      ['triage', `Caseload & Acuity Triage (${ps.length})`],
      ['assistant', `Clinical Assistant Alerts (${alerts.length})`],
      ['soap', `SOAP Encounters & Vitals (${notes.length})`],
      ['regimens', 'ARV / TB / Pyridoxine & Rx'],
      ['hospital', `Hospital & Clinic Continuum (${hospActive.length})`],
      ['pdca120', `120+ Day PDCA Escalations (${over120.length})`]
    ];

    let body = '';
    if(tab==='triage'){
      const acuityFilter = params.acuity || '';
      const rows = ps.map(p=>{
        const bi = this.patientBmiInfo(p);
        const days = PAT.days(p);
        const acuity = (bi && bi.band.id==='sam') || days>=180 || (p.clinical && /poor|default/i.test(p.clinical.adherence||'')) ? 'critical'
          : (bi && bi.band.id==='under') || days>=120 || p.status==='discharge_recommended' ? 'moderate' : 'stable';
        return { p, bi, days, acuity };
      }).filter(r=>!acuityFilter || r.acuity===acuityFilter);

      body = `<div class="row" style="gap:8px;margin-bottom:12px;flex-wrap:wrap">
          ${[['','All caseload'],['critical','Critical acuity'],['moderate','Moderate watch'],['stable','Stable trajectory']].map(([k,lbl])=>
            `<button class="btn btn-xs ${acuityFilter===k?'btn-primary':'btn-ghost'}" data-act="go" data-v="clinicalmcm" data-tab="triage" data-acuity="${k}">${esc(lbl)}</button>`).join('')}
        </div>`
      + card('Medical Case Manager clinical caseload register', table([
          {label:'Patient', render:r=>`<button class="linkbtn cellname" data-act="go" data-v="patient" data-id="${esc(r.p.id)}">${esc(r.p.name)}</button><div class="xs muted mono">${esc(r.p.code)} · ${esc(areaName(r.p.areaId))}</div>`},
          {label:'Acuity', render:r=>badge(titleCase(r.acuity), r.acuity==='critical'?'b-crit':r.acuity==='moderate'?'b-warn':'b-ok')},
          {label:'Primary Condition', render:r=>`<b>${esc(r.p.clinical?.diagnosis||'Chronic clinical care')}</b><div class="xs muted">Adherence: ${esc(titleCase(r.p.clinical?.adherence||'Good'))}</div>`},
          {label:'BMI Nutritional Status', render:r=>r.bi ? this.badgeHTML(r.bi.bmi, true) : '-'},
          {label:'Stay', cls:'num mono', render:r=>r.days>=120 ? `<b style="color:var(--crit)">${r.days}d</b>` : `${r.days}d`},
          {label:'Status', render:r=>pBadge(r.p.status)},
          {label:'Actions', cls:'act', render:r=>`<div class="row" style="gap:5px;justify-content:flex-end">
            <button class="btn btn-xs btn-ghost" data-act="mcm-soap-modal" data-id="${esc(r.p.id)}">+ SOAP</button>
            <button class="btn btn-xs btn-ghost" data-act="go" data-v="patient" data-id="${esc(r.p.id)}">Chart</button>
          </div>`}
        ], rows.slice(0,50), {emptyMsg:'No patients in clinical caseload.'}));
    }

    if(tab==='assistant'){
      body = card('Clinical Decision-Support Assistant — Live Red Flags & Protocol Checks',
        `<div class="note" style="margin-bottom:12px">${ic('sparkles',15)}<span><b>Deterministic Clinical Assistant (CareLink MCM v2.5.0):</b> Continuously cross-checks anthropometrics (SAM/MAM & >10% weight loss), ARV/TB adherence, 30-day PDCA due dates, and 120+ day overstay ceilings. Every clinical decision remains with the licensed clinician.</span></div>`
        + table([
          {label:'Priority', render:a=>badge(a.severity==='crit'?'Critical':'Watch', a.severity==='crit'?'b-crit':'b-warn')},
          {label:'Clinical Trigger', render:a=>`<b>${esc(a.kind)}</b>`},
          {label:'Patient', render:a=>`<button class="linkbtn cellname" data-act="go" data-v="patient" data-id="${esc(a.patient.id)}">${esc(a.patient.name)}</button><div class="xs muted mono">${esc(a.patient.code)} · ${esc(areaName(a.patient.areaId))}</div>`},
          {label:'Clinical Guidance', render:a=>`<span class="small">${esc(a.detail)}</span>`},
          {label:'Action', cls:'act', render:a=>`<button class="btn btn-xs btn-primary" data-act="mcm-soap-modal" data-id="${esc(a.patient.id)}">Review & Document</button>`}
        ], alerts, {emptyMsg:'Zero unaddressed critical clinical triggers in your caseload.'}));
    }

    if(tab==='soap'){
      body = card('Structured SOAP Clinical Encounters & Vitals Log',
        `<div class="spread" style="margin-bottom:12px">
          <span class="small muted">Reintegrated from the LOMAMO Medical Case Manager v2.5.0 clinical chart — links vitals, live BMI nutritional grading, and SOAP care plans directly to the patient record.</span>
          <button class="btn btn-xs btn-primary" data-act="mcm-soap-modal">${ic('plus',13)} New SOAP Clinical Encounter</button>
        </div>`
        + notes.map(n=>{
          const p = (DB.db.patients||[]).find(x=>x.id===n.patientId);
          return `<div class="soap-card">
            <div class="spread" style="margin-bottom:8px;flex-wrap:wrap;gap:8px">
              <div>
                <b>${esc(p?p.name:'Patient')}</b> <span class="xs mono muted">${esc(p?p.code:n.patientId)} · ${esc(areaName(n.areaId))}</span>
                <div class="xs muted">${esc(fmtDate(n.date))} · Clinician: <b>${esc(n.authorName)}</b> (${esc(n.role)})</div>
              </div>
              <div class="row" style="gap:6px;flex-wrap:wrap">
                ${badge('Acuity: '+titleCase(n.acuity||'moderate'), n.acuity==='critical'?'b-crit':n.acuity==='stable'?'b-ok':'b-warn')}
                ${this.badgeHTML(n.bmi, true)}
                <span class="badge b-neutral nodot mono">BP ${esc(n.bp||'-')} · SpO2 ${esc(String(n.spo2||98))}% · ${esc(String(n.temp||36.6))}°C</span>
              </div>
            </div>
            <div class="grid g2 small" style="gap:8px">
              <div><b class="xs muted">S — SUBJECTIVE:</b><div>${esc(n.subjective)}</div></div>
              <div><b class="xs muted">O — OBJECTIVE:</b><div>${esc(n.objective)}</div></div>
              <div><b class="xs muted">A — ASSESSMENT:</b><div>${esc(n.assessment)}</div></div>
              <div><b class="xs muted">P — PLAN:</b><div>${esc(n.plan)}</div></div>
            </div>
          </div>`;
        }).join(''));
    }

    if(tab==='regimens'){
      const rxRows = (DB.db.clinicalRx||[]).filter(r=>{
        const p = (DB.db.patients||[]).find(x=>x.id===r.patientId);
        return p && RBAC.patientVisible(user, p);
      });
      body = card('Active Clinical Prescriptions, ARV/TB & Pyridoxine Safety Register',
        `<div class="row" style="gap:8px;margin-bottom:12px;flex-wrap:wrap">
          ${RBAC.has(user,'pharmacy.view')?`<button class="btn btn-xs btn-ghost" data-act="go" data-v="pharmacy">${ic('package',13)} Open FEFO Pharmacy</button>`:''}
          ${RBAC.has(user,'tb.view')?`<button class="btn btn-xs btn-ghost" data-act="go" data-v="tbcare">${ic('shieldcheck',13)} Open TB & Pyridoxine Control</button>`:''}
        </div>`
        + table([
          {label:'Patient', render:r=>{ const p=(DB.db.patients||[]).find(x=>x.id===r.patientId); return p?`<button class="linkbtn cellname" data-act="go" data-v="patient" data-id="${esc(p.id)}">${esc(p.name)}</button><div class="xs muted mono">${esc(p.code)}</div>`:esc(r.patientId); }},
          {label:'Medicine / Regimen', render:r=>`<b>${esc(r.medicine||r.item||'Essential medicine')}</b><div class="xs muted">${esc(r.dosage||r.sig||'As prescribed')}</div>`},
          {label:'Status', render:r=>badge(titleCase(r.status||'active'), r.status==='dispensed'||r.status==='active'?'b-ok':'b-info')},
          {label:'Prescribed', render:r=>esc(fmtDate(r.date||r.createdAt))}
        ], rxRows.slice(0,40), {emptyMsg:'Open Pharmacy or Patient Chart to prescribe or review medications.'}));
    }

    if(tab==='hospital'){
      body = card('Hospital Referrals, Admissions & Post-Discharge Specialist Clinic Queue',
        table([
          {label:'Request', render:r=>`<b class="mono">${esc(r.code||r.id)}</b><div class="xs muted">${esc(fmtDate(r.createdAt||r.submittedAt))}</div>`},
          {label:'Patient', render:r=>{ const p=(DB.db.patients||[]).find(x=>x.id===r.patientId); return p?`<button class="linkbtn cellname" data-act="go" data-v="patient" data-id="${esc(p.id)}">${esc(p.name)}</button>`:esc(r.patientId); }},
          {label:'Facility & Priority', render:r=>`<b>${esc(r.facility||'County Referral Hospital')}</b><div class="xs muted">${esc(r.reason||'Clinical review')}</div>`},
          {label:'Status', render:r=>badge(titleCase(r.status), r.status==='approved'||r.status==='reconciled'?'b-ok':'b-warn')},
          {label:'', cls:'act', render:()=>`<button class="btn btn-xs btn-ghost" data-act="go" data-v="requests">Open Queue</button>`}
        ], hospActive.slice(0,30), {emptyMsg:'No active hospital episodes open.'}));
    }

    if(tab==='pdca120'){
      body = card('120+ Day Overstay PDCA Dossiers -> International Medical Team Escalation',
        `<div class="spread" style="margin-bottom:12px;flex-wrap:wrap;gap:8px">
          <span class="small muted">Patients exceeding 120 programme days require a structured Plan-Do-Check-Act clinical dossier transmitted to the International Medical Team console.</span>
          ${RBAC.has(user,'intl.medical')?`<button class="btn btn-xs btn-primary" data-act="go" data-v="intlmedical">${ic('pulse',13)} Open International Medical 120+d Console</button>`:''}
        </div>`
        + table([
          {label:'Patient', render:p=>`<button class="linkbtn cellname" data-act="go" data-v="patient" data-id="${esc(p.id)}">${esc(p.name)}</button><div class="xs muted mono">${esc(p.code)} · ${esc(areaName(p.areaId))}</div>`},
          {label:'Days in Care', cls:'num mono', render:p=>`<b style="color:var(--crit)">${PAT.days(p)} days</b>`},
          {label:'BMI Status', render:p=>this.badgeHTML(this.patientBmiInfo(p)?.bmi, true)},
          {label:'Condition', render:p=>esc(p.clinical?.diagnosis||'Complex chronic care')},
          {label:'Action', cls:'act', render:p=>`<button class="btn btn-xs btn-primary" data-act="intl-file-pdca120" data-id="${esc(p.id)}">File 120+d PDCA Dossier</button>`}
        ], over120, {emptyMsg:'No active patients currently exceed 120 days in scope.'}));
    }

    return pageHead('Medical Case Manager & Clinical Assistant Console',
      'Reintegrated CareLink Clinical Module (v2.5.0) — SOAP clinical encounters, live BMI & anthropometric intelligence, ARV/TB adherence surveillance, hospital continuum, and 120+ day PDCA escalations.',
      `<button class="btn btn-sm btn-ghost" data-act="go" data-v="bmiboard">${ic('pulse',15)} BMI Intelligence</button>
       <button class="btn btn-sm btn-primary" data-act="mcm-soap-modal">${ic('plus',15)} New SOAP Encounter</button>`)
    + `<div class="grid g4" style="margin-bottom:14px">
        ${kpi('Active clinical caseload', num(ps.length), `${num(pendingDisch.length)} awaiting discharge approval`, 'info', 'users')}
        ${kpi('Clinical red-flag alerts', num(alerts.filter(a=>a.severity==='crit').length), `${num(alerts.length)} total assistant advisories`, alerts.length?'crit':'ok', 'alert')}
        ${kpi('Hospital episodes open', num(hospActive.length), 'JOOTRH, Homa Bay & sub-county clinics', hospActive.length?'warn':'ok', 'hospital')}
        ${kpi('120+ day PDCA escalations', num(over120.length), 'Shared with International Medical Team', over120.length?'warn':'ok', 'pulse')}
      </div>`
    + `<div class="tabs">${tabs.map(([id,lbl])=>`<button class="tab ${tab===id?'active':''}" data-act="go" data-v="clinicalmcm" data-tab="${id}">${esc(lbl)}</button>`).join('')}</div>`
    + body;
  }
};

/* ---------------- Modal & Action Handlers ---------------- */
Object.assign(ACTIONS, {
  'bmi-record-modal': (d={}) => {
    const ps = repo.patientList(AUTH.user).filter(p=>p.status!=='archived');
    const sel = d.id ? ps.find(x=>x.id===d.id) : ps[0];
    if(!sel) return toast('No patients in scope','','warn');
    const info = BMI_CLINICAL.patientBmiInfo(sel);
    openModal({
      title:'Record / Verify Anthropometrics & BMI Nutritional Status',
      sub:'Enforces the Trial Report 3-visit weight rule and automatic plausibility checks.',
      wide:false,
      body:`<form id="bmiRecForm">
        <div class="field"><label>Patient</label>
          <select class="input" name="patientId" required>
            ${ps.map(p=>`<option value="${esc(p.id)}" ${p.id===sel.id?'selected':''}>${esc(p.name)} (${esc(p.code)} · ${esc(areaName(p.areaId))})</option>`).join('')}
          </select>
        </div>
        <div class="grid g2">
          <div class="field"><label>Weight today (kg) *</label><input class="input" type="number" step="0.1" min="2" max="220" name="weightKg" value="${esc(String(info.weightKg))}" required></div>
          <div class="field"><label>Height (cm) *</label><input class="input" type="number" step="0.5" min="45" max="220" name="heightCm" value="${esc(String(info.heightCm))}" required></div>
        </div>
        <div class="field"><label>Weigh-in context</label>
          <select class="input" name="context">
            <option value="3rd-visit scheduled weigh-in">3rd-visit scheduled home weigh-in (Trial Report standard)</option>
            <option value="Initial hard-copy assessment">Initial hard-copy assessment baseline</option>
            <option value="Hospital / clinic review">Hospital / outpatient clinic review</option>
            <option value="Anthropometric verification">Supervisor / MCM plausibility verification</option>
          </select>
        </div>
        <div class="field"><label>Clinical / nutritional note</label>
          <textarea class="input" name="note" rows="2" placeholder="Appetite, oedema check, MUAC or foodbag recommendation..."></textarea>
        </div>
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" data-act="bmi-record-save">${ic('check',14)} Verify & Save BMI</button>`
    });
  },
  'bmi-record-save': () => {
    const f = document.querySelector('#bmiRecForm');
    if(!f) return;
    const fd = new FormData(f);
    const p = repo.patient(AUTH.user, fd.get('patientId'));
    if(!p) return toast('Patient not found','','err');
    const w = Number(fd.get('weightKg')), h = Number(fd.get('heightCm'));
    const prevW = p.clinical?.weightKg || p.baselineWeightKg;
    const chk = BMI_CLINICAL.plausibilityCheck(w, h, prevW, p.age || 34);
    if(!chk.ok) return toast('Invalid measurement', chk.issues[0].text, 'err');
    const bmi = BMI_CLINICAL.compute(w, h);
    const band = BMI_CLINICAL.classify(bmi);
    p.clinical = p.clinical || {};
    if(!p.baselineWeightKg) p.baselineWeightKg = Number(prevW || w);
    p.clinical.weightKg = w;
    p.clinical.heightCm = h;
    p.clinical.bmi = bmi;
    p.clinical.bmiCategory = band.label;
    p.clinical.bmiVerifiedBy = AUTH.user.id;
    p.clinical.bmiVerifiedAt = new Date().toISOString();
    const vCount = DB.visitsFor ? DB.visitsFor(p.id).length : (DB.db.visits||[]).filter(v=>v.patientId===p.id).length;
    p.clinical.lastWeighedVisitCount = vCount;
    AUDIT.append({ actor:AUTH.user.id, action:'patient.bmi.recorded', entity:'patient', entityId:p.id,
      detail:`${p.code}: ${w} kg / ${h} cm -> BMI ${bmi} (${band.short}) · ${fd.get('context')}` });
    DB.save();
    closeModal(true);
    toast(`BMI ${bmi} (${band.short})`, chk.needsVerification ? chk.issues[0].text : 'Anthropometrics saved & mapped across consoles.', chk.needsVerification ? 'warn' : 'ok');
    render();
  },
  'mcm-soap-modal': (d={}) => {
    if(!RBAC.can(AUTH.user,'clinical.mcm',{}).ok) return toast('Unauthorised','Clinical authority required.','err');
    const ps = repo.patientList(AUTH.user).filter(p=>p.status!=='archived');
    const sel = d.id ? ps.find(x=>x.id===d.id) : ps[0];
    if(!sel) return toast('No patient in scope','','warn');
    const bi = BMI_CLINICAL.patientBmiInfo(sel);
    openModal({
      title:'New Clinical SOAP Encounter (CareLink MCM v2.5.0)',
      sub:`${sel.name} (${sel.code}) · ${areaName(sel.areaId)}`,
      wide:true,
      body:`<form id="mcmSoapForm">
        <div class="grid g2">
          <div class="field"><label>Patient *</label>
            <select class="input" name="patientId" required>
              ${ps.map(p=>`<option value="${esc(p.id)}" ${p.id===sel.id?'selected':''}>${esc(p.name)} (${esc(p.code)} · ${esc(areaName(p.areaId))})</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>Clinical acuity *</label>
            <select class="input" name="acuity">
              <option value="moderate">Moderate — Close clinical monitoring</option>
              <option value="critical">Critical — Urgent intervention / escalation</option>
              <option value="stable">Stable — Maintenance care plan</option>
            </select>
          </div>
        </div>
        <div class="grid g4">
          <div class="field"><label>Weight (kg)</label><input class="input" type="number" step="0.1" name="weightKg" value="${esc(String(bi.weightKg))}"></div>
          <div class="field"><label>Height (cm)</label><input class="input" type="number" step="0.5" name="heightCm" value="${esc(String(bi.heightCm))}"></div>
          <div class="field"><label>BP (mmHg)</label><input class="input" name="bp" value="${esc(sel.clinical?.bp||'120/78')}"></div>
          <div class="field"><label>SpO2 (%) / Temp (°C)</label><input class="input" name="spo2" value="98"></div>
        </div>
        <div class="grid g2">
          <div class="field"><label>S — Subjective (symptoms, appetite, adherence report) *</label><textarea class="input" name="subjective" rows="2" required></textarea></div>
          <div class="field"><label>O — Objective (exam, vitals, pill count, wound status) *</label><textarea class="input" name="objective" rows="2" required></textarea></div>
          <div class="field"><label>A — Assessment (clinical impression & nutritional grade) *</label><textarea class="input" name="assessment" rows="2" required></textarea></div>
          <div class="field"><label>P — Plan (medications, foodbag/diet, clinic referral, next PDCA) *</label><textarea class="input" name="plan" rows="2" required></textarea></div>
        </div>
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" data-act="mcm-soap-save">${ic('check',14)} Sign & Save SOAP Encounter</button>`
    });
  },
  'mcm-soap-save': () => {
    const f = document.querySelector('#mcmSoapForm');
    if(!f) return;
    const fd = new FormData(f);
    const subj = String(fd.get('subjective')||'').trim();
    const obj = String(fd.get('objective')||'').trim();
    const ass = String(fd.get('assessment')||'').trim();
    const plan = String(fd.get('plan')||'').trim();
    if(!subj || !obj || !ass || !plan) return toast('Incomplete SOAP note','Complete S, O, A and P sections.','err');
    const p = repo.patient(AUTH.user, fd.get('patientId'));
    if(!p) return toast('Patient outside scope','','err');
    const w = Number(fd.get('weightKg')) || p.clinical?.weightKg || 55;
    const h = Number(fd.get('heightCm')) || p.clinical?.heightCm || 165;
    const bmi = BMI_CLINICAL.compute(w, h) || 20.2;
    p.clinical = p.clinical || {};
    p.clinical.weightKg = w; p.clinical.heightCm = h; p.clinical.bmi = bmi;
    p.clinical.bp = String(fd.get('bp')||'120/78');
    BMI_CLINICAL.ensureClinicalStore();
    DB.db.mcmNotes.unshift({
      id:uid('soap'), patientId:p.id, countyId:p.countyId, areaId:p.areaId,
      date:todayISO().slice(0,10), authorId:AUTH.user.id, authorName:AUTH.user.name.replace(/^Demo - /,''),
      role:(roleObj(AUTH.user.roleId)||{}).name||'Clinician',
      acuity:fd.get('acuity')||'moderate', bp:p.clinical.bp, spo2:Number(fd.get('spo2'))||98, temp:36.7,
      weightKg:w, heightCm:h, bmi, subjective:subj, objective:obj, assessment:ass, plan
    });
    AUDIT.append({ actor:AUTH.user.id, action:'clinical.soap.recorded', entity:'patient', entityId:p.id,
      detail:`SOAP encounter (${fd.get('acuity')}) · BMI ${bmi}` });
    DB.save();
    closeModal(true);
    toast('SOAP encounter saved', `Recorded on ${p.code} with live BMI ${bmi}.`, 'ok');
    render();
  }
});
