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
    if(!(m > 0)) return { id:'unknown', toneKey:'unknown', label:'MUAC Pending', short:'MUAC Pending', hex:'#64748B', bg:'#F8FAFC', border:'#CBD5E1', cuts:c };
    const cm = (m / 10).toFixed(1);
    if(m < c.sam) return { id:'sam', toneKey:'sam', label:`RED Tape · SAM (${cm} cm < ${(c.sam/10).toFixed(1)} cm)`, short:`RED · SAM ${cm} cm`, tone:'b-crit', hex:'#DC2626', bg:'#FEF2F2', border:'#FCA5A5', cuts:c, guidance:'Immediate IMAM therapeutic feeding (RUTF / F-75 / Special Bag) & clinical evaluation.' };
    if(m < c.mam) return { id:'mam', toneKey:'under', label:`AMBER Tape · MAM (${cm} cm)`, short:`AMBER · MAM ${cm} cm`, tone:'b-warn', hex:'#D97706', bg:'#FFFBEB', border:'#FCD34D', cuts:c, guidance:'Supplementary nutrition (RUSF / Special Food Bag) & fortnightly MUAC tape check.' };
    return { id:'normal', toneKey:'normal', label:`GREEN Tape · ${cm} cm`, short:`GREEN · ${cm} cm`, tone:'b-ok', hex:'#059669', bg:'#ECFDF5', border:'#6EE7B7', cuts:c, guidance:'Adequate mid-upper arm circumference for age - maintain balanced nutrition.' };
  },

  muacBadgeHTML(muacMm, ageYears, compact=false){
    const b = this.classifyMuac(muacMm, ageYears);
    return `<span class="bmi-pill" data-tone="${esc(b.toneKey||b.id||'unknown')}" title="${esc(b.guidance||'')}">
      <i></i><b>${esc(compact ? b.short : b.label)}</b>
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
    return `<span class="bmi-pill" data-tone="${esc(b.id||'unknown')}" title="${esc(b.guidance||'')}">
      <i></i><b>${esc(numTxt)}${esc(compact ? b.short : b.label)}</b>
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
    if(Array.isArray(DB.db.mcmNotes) && DB.db.mcmNotes.length >= 8) return;
    const pts = (DB.db.patients || []).filter(p => p && p.status !== 'archived');
    const ksmPts = pts.filter(p => p.countyId === 'kisumu');
    const hbPts  = pts.filter(p => p.countyId === 'homabay');
    const pickCountyPt = (countyId, idx) => {
      const pool = countyId === 'homabay' ? hbPts : ksmPts;
      return pool[idx % Math.max(1, pool.length)] || pts[0] || { id:'p-1', countyId, areaId:countyId==='homabay'?'makongeni':'nyalenda', clinical:{ weightKg:51.2, heightCm:164, bmi:19.0 } };
    };
    const templates = [
      { county:'kisumu', idx:0,  daysAgo:0,  author:'Kisumu MCM Lead', role:'Medical Case Manager', acuity:'moderate', bp:'118/76', pulse:78, temp:36.7, spo2:98,
        subjective:'Appetite improving steadily on Bag 1 nutritional ration and daily multivitamin support; mild evening fatigue resolved.',
        objective:'Afebrile, chest clear bilaterally, pedal oedema absent; weight gained +1.6 kg across last 3 home visits.',
        assessment:'Recovering Moderate Thinness with verified ART adherence and stable vital signs.',
        plan:'Continue fortnightly home nursing visits, maintain Bag 1 ration, and review at JOOTRH MOPC clinic in 14 days.' },
      { county:'kisumu', idx:2,  daysAgo:1,  author:'Clinical Nursing Officer', role:'Clinical Officer / MCM', acuity:'critical', bp:'106/68', pulse:92, temp:37.2, spo2:96,
        subjective:'Reports reduced oral intake over 5 days following oral candidiasis; caregiver requested urgent clinical review.',
        objective:'Mucosal pallor mild, oral thrush resolving on topical therapy; MUAC in red/amber surveillance zone requiring therapeutic escalation.',
        assessment:'Severe / Moderate Acute Malnutrition risk requiring targeted therapeutic foodbag and close hydration review.',
        plan:'Escalate immediately to Special Therapeutic Food Bag, schedule 72-hour caregiver re-weigh, and coordinate facility lab review.' },
      { county:'kisumu', idx:5,  daysAgo:2,  author:'Paediatric Nutrition Lead', role:'Medical Case Manager', acuity:'moderate', bp:'102/64', pulse:88, temp:36.8, spo2:99,
        subjective:'Guardian reports improved school attendance and 4 structured meals per day using fortified porridge flour.',
        objective:'Linear growth and mid-upper arm circumference (+0.6 cm vs intake baseline) trending steadily into WHO green zone.',
        assessment:'Sustained paediatric nutritional catch-up growth without intercurrent infection.',
        plan:'Continue monthly Weight, BMI-for-Age and MUAC tape plotting; reinforce household WASH & safe water practices.' },
      { county:'kisumu', idx:8,  daysAgo:4,  author:'Hospital Continuum Focal', role:'Hospital Liaison & MCM', acuity:'stable', bp:'126/80', pulse:74, temp:36.5, spo2:99,
        subjective:'Discharged from Kisumu County Referral Hospital 10 days ago; tolerating oral regimen well with family supervision.',
        objective:'Surgical/medical discharge summary verified on file; blood pressure controlled and mobility fully restored.',
        assessment:'Smooth post-discharge hospital-to-home transition with zero readmission warning signs.',
        plan:'Complete 30-day PDCA review on schedule and maintain routine home caregiver follow-up.' },
      { county:'kisumu', idx:11, daysAgo:6,  author:'Kisumu MCM Lead', role:'Medical Case Manager', acuity:'stable', bp:'132/82', pulse:76, temp:36.6, spo2:98,
        subjective:'Dual hypertension and glycaemic control stable; adheres to low-sodium dietary guidance from caregiver.',
        objective:'Fasting capillary glucose within target; BMI maintained in healthy range with consistent 3-visit weigh-ins.',
        assessment:'Well-controlled chronic NCD profile approaching self-reliant graduation readiness.',
        plan:'Evaluate for structured graduation readiness at upcoming 90-day multi-disciplinary PDCA sitting.' },
      { county:'homabay', idx:0, daysAgo:1,  author:'Homa Bay Clinical Desk', role:'Medical Case Manager', acuity:'moderate', bp:'122/78', pulse:80, temp:36.6, spo2:98,
        subjective:'Completing Intensive Phase pulmonary TB therapy alongside Pyridoxine 50 mg daily; zero peripheral tingling or numbness.',
        objective:'Respiratory rate 18/min, sputum conversion documented on clinic card; pill count confirms 98% adherence.',
        assessment:'Pulmonary TB on treatment with full Pyridoxine neuropathy prophylaxis compliance and positive weight trajectory.',
        plan:'Maintain monthly Pyridoxine safety check, Bag 2 household support, and Homa Bay County Referral TB clinic follow-up.' },
      { county:'homabay', idx:3, daysAgo:3,  author:'Homa Bay Clinical Desk', role:'Medical Case Manager', acuity:'critical', bp:'108/70', pulse:90, temp:37.0, spo2:97,
        subjective:'Post-hospitalisation recovery in Sofia catchment; appetite returning slowly with caregiver home visits.',
        objective:'Hydration adequate, weight stabilised (+0.8 kg since discharge), wound dressing clean and dry.',
        assessment:'Recovering acute illness requiring intensive bi-weekly nutritional & clinical monitoring.',
        plan:'Provide Special Fortified Ration, review blood counts at Homa Bay Teaching & Referral Hospital next week.' },
      { county:'homabay', idx:6, daysAgo:5,  author:'Homa Bay Clinical Desk', role:'Medical Case Manager', acuity:'stable', bp:'120/76', pulse:75, temp:36.6, spo2:99,
        subjective:'Consistent ART adherence and thriving household vegetable kitchen garden supporting daily nutrition.',
        objective:'BMI 21.4 kg/m² in WHO healthy band; all dependent children attending school with normal MUAC.',
        assessment:'Clinically and nutritionally stable household meeting 90-day care plan milestones.',
        plan:'Continue routine 3-visit weigh-in schedule and prepare 120-day review summary.' }
    ];
    const baseDate = Date.now();
    DB.db.mcmNotes = templates.map((t, i) => {
      const p = pickCountyPt(t.county, t.idx);
      const w = Number(p.clinical?.weightKg || 52.4);
      const h = Number(p.clinical?.heightCm || 164);
      const bmi = this.compute(w, h) || 19.5;
      const dIso = new Date(baseDate - t.daysAgo * 86400000).toISOString().slice(0, 10);
      return {
        id: 'mcm-n' + (i + 1),
        patientId: p.id,
        countyId: p.countyId || t.county,
        areaId: p.areaId || (t.county==='homabay' ? 'makongeni' : 'nyalenda'),
        date: dIso,
        authorName: t.author,
        role: t.role,
        acuity: t.acuity,
        bp: t.bp,
        pulse: t.pulse,
        temp: t.temp,
        spo2: t.spo2,
        weightKg: w,
        heightCm: h,
        bmi,
        subjective: t.subjective,
        objective: t.objective,
        assessment: t.assessment,
        plan: t.plan
      };
    });
  },

  /* Helper: Foodbag / Therapeutic Regimen badge derived deterministically from clinical & household profile */
  foodBagTag(info){
    if(!info || !info.patient) return '<span class="xs muted">-</span>';
    const p = info.patient;
    if(info.band.id==='sam' || info.muacBand.id==='sam') return `<span class="anthro-bag-tag bag-spec">Special Therapeutic</span>`;
    if(info.band.id==='under' || info.muacBand.id==='mam') return `<span class="anthro-bag-tag bag-plus">Special / Fortified</span>`;
    if(Number(p.childrenCount || p.household?.children || 0) >= 4) return `<span class="anthro-bag-tag bag-two">Bag 2 · Family</span>`;
    return `<span class="anthro-bag-tag bag-one">Bag 1 · Standard</span>`;
  },

  /* ---------------- 1. BMI NUTRITIONAL INTELLIGENCE & ANTHROPOMETRIC REGISTER ---------------- */
  renderBmiBoard(user, params={}){
    const allowed = RBAC.has(user,'patient.list') && !['mediahead','pr','finance','procurement','hr','welfare','vehicle','auditor','it','gov.partner','president'].includes(user.roleId);
    if(!allowed) return deniedPanel('patient.view.basic');
    const ps = repo.patientList(user).filter(p=>p.status!=='archived');
    const areaFilter = params.area || '';
    const bandFilter = params.band || '';
    const cohortFilter = params.cohort || '';
    const q = String(params.q || '').trim().toLowerCase();

    const allInfo = ps.map(p=>this.patientBmiInfo(p)).filter(Boolean);
    const filtered = allInfo.filter(x=>
      (!areaFilter || x.patient.areaId===areaFilter) &&
      (!cohortFilter || (cohortFilter==='children' ? x.isChild : !x.isChild)) &&
      (!bandFilter
        || x.band.id===bandFilter
        || (bandFilter==='under_all' && (x.band.id==='sam' || x.band.id==='under' || x.muacBand.id==='sam' || x.muacBand.id==='mam'))
        || (bandFilter==='due3' && x.dueThreeVisitRule)
        || (bandFilter==='verify' && x.plausibility.needsVerification)) &&
      (!q || (x.patient.name+' '+x.patient.code+' '+areaName(x.patient.areaId)+' '+(x.patient.clinical?.diagnosis||'')).toLowerCase().includes(q))
    );

    const counts = { sam:0, under:0, normal:0, over:0, obese1:0, obese2:0, due3:0, verify:0 };
    allInfo.forEach(x=>{
      if(counts[x.band.id]!==undefined) counts[x.band.id]++;
      if(x.dueThreeVisitRule) counts.due3++;
      if(x.plausibility.needsVerification) counts.verify++;
    });

    const roleLens = user.roleId==='caregiver' ? 'Caregiver Field Surveillance · Assigned Households & 3-Visit Weigh-In Cadence'
      : user.roleId==='coordinator' ? 'Ministry Area Coordinator Lens · Catchment Malnutrition & Foodbag Allocation'
      : ['mcm','nurse','depthead','intl.medical'].includes(user.roleId) ? 'Clinical & Case Management Lens · SAM/MAM Triage, Plausibility & Therapeutic Regimens'
      : user.roleId==='liaison' ? 'Hospital Continuum Lens · Inpatient & Outpatient Nutritional Continuity'
      : 'County & Ministry Area Anthropometric Surveillance';

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
    const protocolQueue = allInfo.filter(x=>x.dueThreeVisitRule || x.plausibility.needsVerification || x.band.id==='sam');
    const selectedChildInfo = (params.childId && childCohort.find(x=>x.patient.id===params.childId)) || childCohort[0] || allInfo[0];

    const sheetBar = `<div class="tabs" style="margin-bottom:16px">
      <button class="tab ${sheet==='overview'?'active':''}" data-act="go" data-v="bmiboard" data-sheet="overview">${ic('activity',14)} Anthropometric &amp; Nutritional Register (${num(allInfo.length)})</button>
      <button class="tab ${sheet==='children'?'active':''}" data-act="go" data-v="bmiboard" data-sheet="children">${ic('heart',14)} Child Growth Charts · Weight, BMI &amp; MUAC (${num(childCohort.length)})</button>
      <button class="tab ${sheet==='protocol'?'active':''}" data-act="go" data-v="bmiboard" data-sheet="protocol">${ic('shieldcheck',14)} 3-Visit Weigh-In &amp; Verification Queue (${num(protocolQueue.length)})</button>
    </div>`;

    /* Helper to render a clean, paginated, symmetrical Anthropometric Register table */
    const renderAnthroRegisterTable = (rowsSource, tableOpts={}) => {
      const perPage = 25;
      const pageCount = Math.max(1, Math.ceil(rowsSource.length / perPage));
      const curPage = Math.min(pageCount, Math.max(1, Number(params.page)||1));
      const pageSlice = rowsSource.slice((curPage - 1) * perPage, curPage * perPage);
      const isPaedMode = Boolean(tableOpts.paediatricOnly);
      const hasActiveFilters = Boolean(areaFilter || bandFilter || cohortFilter || q);

      const toolbar = `<div class="reg-toolbar">
        <div class="reg-toolbar-main">
          <div class="reg-search">
            ${ic('search',15)}
            <input class="input" placeholder="Search beneficiary name, CareLink code, diagnosis or area..." value="${esc(params.q||'')}" data-filter="q" data-view="bmiboard">
          </div>
          <select class="input reg-select" data-filter="area" data-view="bmiboard" aria-label="Filter by ministry area">
            <option value="">All ministry areas (${areas.length})</option>
            ${areas.map(aid=>`<option value="${esc(aid)}" ${areaFilter===aid?'selected':''}>${esc(areaName(aid))}</option>`).join('')}
          </select>
          ${!isPaedMode ? `<select class="input reg-select" data-filter="cohort" data-view="bmiboard" aria-label="Filter by age cohort">
            <option value="">All ages (${num(allInfo.length)})</option>
            <option value="adults" ${cohortFilter==='adults'?'selected':''}>Adults 18+ yrs (${num(allInfo.length - childCohort.length)})</option>
            <option value="children" ${cohortFilter==='children'?'selected':''}>Children &amp; Adolescents &lt;18y (${num(childCohort.length)})</option>
          </select>` : ''}
        </div>
        <div class="reg-toolbar-pills">
          <div class="reg-seg" role="group" aria-label="Nutritional triage filter">
            <button class="reg-seg-btn ${!bandFilter?'on':''}" data-act="go" data-v="bmiboard" data-sheet="${esc(sheet)}" data-area="${esc(areaFilter)}" data-cohort="${esc(cohortFilter)}">All (${num(allInfo.length)})</button>
            <button class="reg-seg-btn ${bandFilter==='under_all'?'on':''}" data-act="go" data-v="bmiboard" data-sheet="${esc(sheet)}" data-band="${bandFilter==='under_all'?'':'under_all'}" data-area="${esc(areaFilter)}" data-cohort="${esc(cohortFilter)}">SAM / MAM (${num(counts.sam + counts.under)})</button>
            <button class="reg-seg-btn ${bandFilter==='due3'?'on':''}" data-act="go" data-v="bmiboard" data-sheet="${esc(sheet)}" data-band="${bandFilter==='due3'?'':'due3'}" data-area="${esc(areaFilter)}" data-cohort="${esc(cohortFilter)}">3-Visit Due (${num(counts.due3)})</button>
            <button class="reg-seg-btn ${bandFilter==='verify'?'on':''}" data-act="go" data-v="bmiboard" data-sheet="${esc(sheet)}" data-band="${bandFilter==='verify'?'':'verify'}" data-area="${esc(areaFilter)}" data-cohort="${esc(cohortFilter)}">Verify (${num(counts.verify)})</button>
          </div>
          ${hasActiveFilters ? `<button class="btn btn-xs btn-ghost" data-act="go" data-v="bmiboard" data-sheet="${esc(sheet)}">${ic('x',12)} Reset filters</button>` : ''}
        </div>
      </div>`;

      const tbl = `<div class="tbl-scroll reg-tbl-wrap">${table([
        { label:'Beneficiary & Catchment', render:x=>{
          const p = x.patient;
          const deptCol = x.band.id==='sam' ? '#DC2626' : (x.band.id==='under' ? '#D97706' : '#0F766E');
          return `<div class="reg-entity-cell">
            <span class="reg-avatar" style="background:${deptCol}">${esc(initials(p.name))}</span>
            <div class="reg-entity-meta">
              <button class="linkbtn reg-name-btn" data-act="go" data-v="${isPaedMode?'bmiboard':'patient'}" ${isPaedMode?`data-sheet="children" data-child-id="${esc(p.id)}"`:`data-id="${esc(p.id)}"`}>${esc(p.name)}</button>
              <div class="reg-subline">
                <span class="mono">${esc(p.code)}</span>
                <span>·</span>
                <span>${esc(areaName(p.areaId))}</span>
                <span class="reg-cohort-tag ${x.isChild?'is-child':''}">${x.isChild?`Child ${x.age}y`:`${x.age}y`} · ${esc(p.sex||'F')}</span>
              </div>
            </div>
          </div>`;
        }},
        { label:'Anthropometrics & Gain', cls:'mono', render:x=>{
          const up = x.weightDeltaKg >= 0;
          return `<div class="anthro-metric-cell">
            <div class="anthro-primary"><b>${x.weightKg.toFixed(1)} kg</b> <span class="muted">/</span> <span>${x.heightCm} cm</span></div>
            <div class="anthro-sub">
              <span class="muted">Intake ${x.baselineWeightKg.toFixed(1)} kg</span>
              <span class="anthro-delta ${up?'up':'down'}">${up?'+':''}${x.weightDeltaKg.toFixed(1)} kg</span>
            </div>
          </div>`;
        }},
        { label:'WHO BMI / BMI-for-Age', render:x=>`<div class="col" style="gap:3px;align-items:flex-start">
            ${this.badgeHTML(x.bmi, true, x.isChild ? x.age : null)}
            <span class="xs muted">${x.isChild ? 'WHO Paediatric Z-band' : 'WHO Adult reference'}</span>
          </div>` },
        { label:'MUAC Tape & Diet', render:x=>`<div class="col" style="gap:4px;align-items:flex-start">
            ${this.muacBadgeHTML(x.muacMm, x.age, true)}
            ${this.foodBagTag(x)}
          </div>` },
        { label:'3-Visit Cadence', render:x=>{
          const step = Math.min(3, x.visitsSinceWeigh);
          const dots = [1,2,3].map(n=>`<i class="${n<=step?(x.dueThreeVisitRule?'due':'on'):''}"></i>`).join('');
          return `<div class="anthro-cadence-cell">
            <div class="row" style="gap:6px">
              <span class="visit-dots-3" aria-hidden="true">${dots}</span>
              ${x.dueThreeVisitRule
                ? `<span class="badge b-warn nodot">Weigh now</span>`
                : `<span class="badge b-ok nodot">Current (${step}/3)</span>`}
            </div>
            <div class="xs muted mono">${num(x.visitsCount)} visits logged</div>
          </div>`;
        }},
        { label:'Clinical Assurance', render:x=>x.plausibility.needsVerification
          ? `<div class="anthro-flag-box warn">${ic('alert',13)}<span>${esc(x.plausibility.issues[0].text.slice(0,68))}${x.plausibility.issues[0].text.length>68?'...':''}</span></div>`
          : `<div class="anthro-flag-box ok">${ic('check',13)}<span>${x.verifiedBy ? 'Clinician verified' : 'Scale &amp; tape plausible'}</span></div>` },
        { label:'Actions', cls:'act', render:x=>`<div class="reg-act-pair">
            ${canRecord?`<button class="btn btn-xs btn-primary" data-act="bmi-record-modal" data-id="${esc(x.patient.id)}">${ic('activity',12)} Weigh</button>`:''}
            ${isPaedMode
              ? `<button class="btn btn-xs btn-ghost" data-act="go" data-v="bmiboard" data-sheet="children" data-child-id="${esc(x.patient.id)}">Charts</button>`
              : `<button class="btn btn-xs btn-ghost" data-act="go" data-v="patient" data-id="${esc(x.patient.id)}" data-tab="visits">File</button>`}
          </div>` }
      ], pageSlice, { emptyMsg:'No beneficiaries match the selected anthropometric or area criteria.' })}</div>`;

      const pager = `<div class="reg-pager-bar">
        <span class="xs muted">${ic('shieldcheck',13)} Standardized WHO &amp; Kenya MoH IMAM anthropometric register · Showing <b>${rowsSource.length?((curPage-1)*perPage+1):0}-${Math.min(curPage*perPage, rowsSource.length)}</b> of <b>${num(rowsSource.length)}</b> beneficiaries</span>
        ${pageCount > 1 ? `<div class="row" style="gap:6px">
          <button class="btn btn-xs btn-ghost" ${curPage<=1?'disabled data-skip="1"':''} data-act="go" data-v="bmiboard" data-sheet="${esc(sheet)}" data-area="${esc(areaFilter)}" data-band="${esc(bandFilter)}" data-cohort="${esc(cohortFilter)}" data-q="${esc(params.q||'')}" data-page="${curPage-1}">Previous</button>
          <span class="xs mono bold" style="padding:0 6px">Page ${curPage} / ${pageCount}</span>
          <button class="btn btn-xs btn-ghost" ${curPage>=pageCount?'disabled data-skip="1"':''} data-act="go" data-v="bmiboard" data-sheet="${esc(sheet)}" data-area="${esc(areaFilter)}" data-band="${esc(bandFilter)}" data-cohort="${esc(cohortFilter)}" data-q="${esc(params.q||'')}" data-page="${curPage+1}">Next</button>
        </div>` : ''}
      </div>`;

      return toolbar + tbl + pager;
    };

    if(sheet === 'children'){
      const childFiltered = filtered.filter(x => x.isChild);
      return pageHead('Paediatric growth charts & IMAM surveillance',
        `${num(childCohort.length)} children and adolescents (<18 yrs) in scope · WHO BMI-for-Age Z-bands, Kenya MoH MUAC arm-tape cut-offs (6-59 mos, 5-9 yrs, 10-17 yrs), and 12+ visit growth trajectories.`,
        `${canRecord?`<button class="btn btn-sm btn-primary" data-act="bmi-record-modal" data-id="${esc(selectedChildInfo?.patient?.id||'')}">${ic('plus',15)} Record Child Weight / Height / MUAC</button>`:''}`)
      + sheetBar
      + `<div class="grid g4" style="margin-bottom:16px">
          ${kpi('Paediatric cohort (<18y)', num(childCohort.length), `${num(childU5.length)} Under-5s (6-59 mos) · ${num(childCohort.length - childU5.length)} School-age &amp; Teen`, 'info', 'users')}
          ${kpi('RED MUAC Tape (SAM)', num(childRedMuac.length), 'Immediate IMAM therapeutic RUTF &amp; clinician review', childRedMuac.length?'crit':'ok', 'alert')}
          ${kpi('AMBER MUAC Tape (MAM)', num(childAmberMuac.length), 'Fortified supplementary ration &amp; 14-day re-check', childAmberMuac.length?'warn':'ok', 'activity')}
          ${kpi('GREEN MUAC Tape (Nourished)', num(childCohort.length - childRedMuac.length - childAmberMuac.length), 'Sustained linear &amp; ponderal child growth', 'ok', 'check')}
        </div>`
      + (selectedChildInfo ? card(`Synchronised WHO/MoH Child Growth Curves · ${selectedChildInfo.patient.name} (${selectedChildInfo.patient.code})`,
          `<div class="reg-toolbar" style="margin-bottom:14px">
            <div class="reg-toolbar-main">
              <span class="xs bold muted" style="text-transform:uppercase;letter-spacing:.07em">${ic('activity',13)} Select Child Beneficiary:</span>
              <select class="input reg-select" style="min-width:310px" data-filter="childId" data-view="bmiboard">
                ${(childFiltered.length ? childFiltered : childCohort).slice(0, 140).map(x=>`<option value="${esc(x.patient.id)}" ${x.patient.id===selectedChildInfo.patient.id?'selected':''}>${esc(x.patient.name)} (${x.age}y ${x.patient.sex} · ${esc(areaName(x.patient.areaId))} · MUAC ${x.muacCm} cm)</option>`).join('')}
              </select>
            </div>
            <div class="row" style="gap:8px">
              ${canRecord?`<button class="btn btn-xs btn-primary" data-act="bmi-record-modal" data-id="${esc(selectedChildInfo.patient.id)}">${ic('plus',12)} Log Reading</button>`:''}
              <button class="btn btn-xs btn-ghost" data-act="go" data-v="patient" data-id="${esc(selectedChildInfo.patient.id)}" data-tab="visits">${ic('user',12)} Open Full Child File</button>
            </div>
          </div>`
          + this.renderPatientGrowthCharts(selectedChildInfo.patient),
          { sub:'Weight-for-Age, WHO BMI-for-Age, and Kenya MoH MUAC arm-tape trajectories plotted across every Home, Hospital, and Homestay visit.' }) : '')
      + `<div style="margin-top:16px">${card(`Paediatric Anthropometric & MUAC Register (${num(childFiltered.length)} children <18 yrs)`,
          renderAnthroRegisterTable(childFiltered, { paediatricOnly:true }),
          { sub:'Click any child name or "Charts" button to inspect their 3-panel longitudinal growth curves above.' })}</div>`;
    }

    if(sheet === 'protocol'){
      const qRows = filtered.filter(x => x.dueThreeVisitRule || x.plausibility.needsVerification || x.band.id==='sam');
      return pageHead('3-visit weigh-in & clinical plausibility verification queue',
        'Actionable anthropometric quality register isolating beneficiaries due for their scheduled 3rd-visit weigh-in, severe thinness (SAM) triage, or scale/tape plausibility confirmation.',
        `${canRecord?`<button class="btn btn-sm btn-primary" data-act="bmi-record-modal">${ic('plus',15)} Record / Verify Anthropometrics</button>`:''}`)
      + sheetBar
      + `<div class="grid g4" style="margin-bottom:16px">
          ${kpi('Total action queue', num(protocolQueue.length), 'Scheduled re-weighs &amp; clinical verifications', protocolQueue.length?'warn':'ok', 'clipboard')}
          ${kpi('3-visit weigh-in due', num(counts.due3), 'Mandatory re-weigh every 3rd home visit', counts.due3?'warn':'ok', 'clock')}
          ${kpi('Plausibility checks', num(counts.verify), 'Height/weight outlier or >=10% weight swing', counts.verify?'crit':'ok', 'shield')}
          ${kpi('SAM urgent review', num(counts.sam), 'BMI < 16.0 kg/m² or paediatric SAM', counts.sam?'crit':'ok', 'alert')}
        </div>`
      + card(`Anthropometric Action & Verification Register (${num(qRows.length)})`,
          renderAnthroRegisterTable(qRows),
          { sub:'Every verified measurement writes an immutable entry to the CareLink clinical audit ledger.' });
    }

    return pageHead('Anthropometric & nutritional surveillance register',
      `${esc(roleLens)} · Standardized WHO/MoH BMI &amp; MUAC classification, household foodbag targeting, 3-visit weigh-in tracking, and clinical plausibility assurance.`,
      `<div class="row" style="gap:8px;flex-wrap:wrap">
        ${RBAC.has(user,'clinical.mcm')?`<button class="btn btn-sm btn-ghost" data-act="go" data-v="clinicalmcm">${ic('activity',15)} Case Manager Caseload</button>`:''}
        ${canRecord?`<button class="btn btn-sm btn-primary" data-act="bmi-record-modal">${ic('plus',15)} Record / Verify Weight &amp; Height</button>`:''}
      </div>`)
    + sheetBar
    + `<div class="bmi-band-grid" role="region" aria-label="WHO BMI nutritional stratification">
        ${BMI_BANDS.map(b=>{
          const n = counts[b.id] || 0;
          const share = allInfo.length ? Math.round((n / allInfo.length) * 100) : 0;
          return `<button class="bmi-band-card ${bandFilter===b.id?'on':''}" data-tone="${esc(b.id)}" data-act="go" data-v="bmiboard" data-band="${bandFilter===b.id?'':b.id}" data-area="${esc(areaFilter)}" data-cohort="${esc(cohortFilter)}">
            <div class="bmi-band-top">
              <span class="bmi-band-lbl">${esc(b.short)}</span>
              <span class="bmi-band-pct mono">${share}%</span>
            </div>
            <div class="bmi-band-num mono">${num(n)}</div>
            <div class="bmi-band-range">BMI ${b.max>100?'&ge; '+b.min.toFixed(1):b.min.toFixed(1)+' - '+b.max.toFixed(1)} kg/m&sup2;</div>
          </button>`;
        }).join('')}
      </div>`
    + `<div class="grid g4" style="margin:16px 0">
        ${kpi('Underweight & SAM priority', num(counts.sam + counts.under), `${num(counts.sam)} SAM (<16) · ${num(counts.under)} Moderate (16-18.4)`, (counts.sam+counts.under)?'crit':'ok', 'alert')}
        ${kpi('Healthy nutritional status', num(counts.normal), `${allInfo.length?Math.round(100*counts.normal/allInfo.length):0}% of ${num(allInfo.length)} beneficiaries`, 'ok', 'check')}
        ${kpi('3-visit weigh-in due', num(counts.due3), 'Standard: re-weigh every 3rd home visit', counts.due3?'warn':'ok', 'clock')}
        ${kpi('Plausibility & swing flags', num(counts.verify), 'Outlier reading or >10% weight loss', counts.verify?'warn':'ok', 'shield')}
      </div>`
    + `<div class="grid g2" style="margin-bottom:16px;align-items:stretch">
        ${card('Cohort Nutritional Distribution', typeof chartDonut!=='undefined' ? chartDonut(
          BMI_BANDS.map(b=>({ label:b.short, value:counts[b.id]||0, color:b.hex })),
          { title:'Beneficiaries by WHO BMI classification', centerValue:num(allInfo.length), centerLabel:'IN SCOPE' }
        ) : '', {sub:'De-duplicated active cohort standing across your authorised catchment.'})}
        ${card('Ministry Area Nutritional Standing & Foodbag Priority', table([
          {label:'Ministry Area', render:r=>`<div class="cellname">${esc(r.name)}<span class="sm">${num(r.total)} beneficiaries</span></div>`},
          {label:'Mean BMI', cls:'num mono', render:r=>this.badgeHTML(r.avgBmi, true)},
          {label:'SAM / MAM', cls:'num', render:r=>r.underN?badge(r.underN+' priority','b-crit','nodot'):'<span class="xs muted">0</span>'},
          {label:'Healthy', cls:'num mono', render:r=>num(r.normN)},
          {label:'3-Visit Due', cls:'num', render:r=>r.due3?badge(r.due3+' due','b-warn','nodot'):badge('Current','b-ok','nodot')}
        ], areaRows, {emptyMsg:'No ministry areas in scope.'}), {sub:'Directs Coordinator & Procurement ration dispatch (Bag 1, Bag 2 & Special Therapeutic Diet).'})}
      </div>`
    + card(`Patient Anthropometric & Nutritional Register (${num(filtered.length)} beneficiaries)`,
        renderAnthroRegisterTable(filtered),
        { sub:'Complete weight, height, WHO BMI/BMI-for-Age, Kenya MoH MUAC tape, foodbag regimen, and 3-visit weigh-in register.' });
  },

  /* ---------------- 2. OVERHAULED MEDICAL CASE MANAGER CASELOAD REGISTER & CLINICAL CONSOLE ---------------- */
  clinicalAlertsFor(user){
    const ps = repo.patientList(user).filter(p=>p.status==='active'||p.status==='discharge_recommended'||p.status==='extension');
    const alerts = [];
    ps.forEach(p=>{
      const bi = this.patientBmiInfo(p);
      const days = PAT.days(p);
      if(bi && bi.band.id==='sam'){
        alerts.push({ severity:'crit', kind:'SAM Malnutrition (BMI < 16)', patient:p, detail:`BMI ${bi.bmi} kg/m² (${bi.weightKg} kg / ${bi.heightCm} cm) - immediate therapeutic nutrition & clinician review.` });
      }
      if(bi && bi.plausibility.issues.some(i=>i.level==='crit')){
        alerts.push({ severity:'crit', kind:'Rapid >10% Weight Loss', patient:p, detail:bi.plausibility.issues.find(i=>i.level==='crit').text });
      }
      if(days >= 120){
        alerts.push({ severity:days>=180?'crit':'warn', kind:`120+ Day Programme Stay (${days}d)`, patient:p, detail:`${days} days in care - prepare/update 120+ Day PDCA specialist clinical dossier for International Medical Team.` });
      }
      if(p.clinical && /poor|default/i.test(p.clinical.adherence||'')){
        alerts.push({ severity:'crit', kind:'Medication / ART-TB Adherence Alert', patient:p, detail:`Adherence recorded as "${p.clinical.adherence}" - schedule supervised pill count & home clinical counselling.` });
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
    const over120 = ps.filter(p=>['active','extension'].includes(p.status) && PAT.days(p)>=120);
    const pendingDisch = ps.filter(p=>p.status==='discharge_recommended');
    const hospActive = repo.requests(user).filter(r=>!['closed','rejected','declined'].includes(r.status));
    const notes = (DB.db.mcmNotes||[]).filter(n=>!user.countyId || isGlobal(user) || n.countyId===user.countyId);
    const areas = [...new Set(ps.map(p=>p.areaId).filter(Boolean))];

    /* Pre-enrich clinical caseload once per render for symmetrical stratification & fast filtering */
    const caseloadAll = ps.map(p=>{
      const bi = this.patientBmiInfo(p);
      const days = PAT.days(p);
      const adh = String(p.clinical?.adherence || 'Good');
      const poorAdh = /poor|default/i.test(adh);
      const fairAdh = /fair|partial/i.test(adh);
      const isSam = Boolean(bi && (bi.band.id==='sam' || bi.muacBand.id==='sam'));
      const isMam = Boolean(bi && (bi.band.id==='under' || bi.muacBand.id==='mam'));
      const acuity = (isSam || days>=180 || poorAdh) ? 'critical'
        : (isMam || days>=120 || fairAdh || p.status==='discharge_recommended') ? 'moderate' : 'stable';
      const drivers = [];
      if(isSam) drivers.push({ lbl:'SAM Nutrition', tone:'crit' });
      else if(isMam) drivers.push({ lbl:'MAM Nutrition', tone:'warn' });
      if(days>=120) drivers.push({ lbl:`${days}d · 120+d PDCA`, tone:days>=180?'crit':'warn' });
      if(poorAdh) drivers.push({ lbl:'Adherence Escalation', tone:'crit' });
      else if(fairAdh) drivers.push({ lbl:'Pill-Count Watch', tone:'warn' });
      if(p.status==='discharge_recommended') drivers.push({ lbl:'Graduation Review', tone:'info' });
      if(!drivers.length) drivers.push({ lbl:'Routine Care Plan', tone:'ok' });
      const visits = DB.visitsFor ? DB.visitsFor(p.id) : [];
      const lastV = visits[0] || null;
      const hasHosp = visits.some(v=>v.type==='hospital');
      const hasHomeStay = visits.some(v=>v.type==='homestay');
      return { p, bi, days, adh, poorAdh, fairAdh, acuity, drivers, visitsCount:visits.length, lastV, hasHosp, hasHomeStay };
    });

    const acuityCounts = {
      all: caseloadAll.length,
      critical: caseloadAll.filter(r=>r.acuity==='critical').length,
      moderate: caseloadAll.filter(r=>r.acuity==='moderate').length,
      stable: caseloadAll.filter(r=>r.acuity==='stable').length
    };

    const tabs = [
      ['triage',    `Caseload & Acuity Register (${num(caseloadAll.length)})`],
      ['assistant', `Clinical Red-Flag Triage (${num(alerts.length)})`],
      ['soap',      `SOAP Encounters & Vitals (${num(notes.length)})`],
      ['regimens',  'ARV / TB / Pyridoxine & Rx'],
      ['hospital',  `Hospital Continuum (${num(hospActive.length)})`],
      ['pdca120',   `120+ Day PDCA Escalations (${num(over120.length)})`]
    ];

    let body = '';
    if(tab==='triage'){
      const acuityFilter = params.acuity || '';
      const areaFilter = params.area || '';
      const settingFilter = params.setting || '';
      const q = String(params.q || '').trim().toLowerCase();

      const filteredRows = caseloadAll.filter(r =>
        (!acuityFilter || r.acuity === acuityFilter) &&
        (!areaFilter || r.p.areaId === areaFilter) &&
        (!settingFilter
          || (settingFilter==='over120' && r.days >= 120)
          || (settingFilter==='hospital' && r.hasHosp)
          || (settingFilter==='homestay' && r.hasHomeStay)
          || (settingFilter==='discharge' && r.p.status==='discharge_recommended')) &&
        (!q || (r.p.name+' '+r.p.code+' '+areaName(r.p.areaId)+' '+(r.p.clinical?.diagnosis||'')).toLowerCase().includes(q))
      ).sort((a,b)=>{
        const rank = { critical:0, moderate:1, stable:2 };
        return (rank[a.acuity] - rank[b.acuity]) || (b.days - a.days);
      });

      const perPage = 25;
      const pageCount = Math.max(1, Math.ceil(filteredRows.length / perPage));
      const curPage = Math.min(pageCount, Math.max(1, Number(params.page)||1));
      const pageRows = filteredRows.slice((curPage - 1) * perPage, curPage * perPage);
      const hasFilters = Boolean(acuityFilter || areaFilter || settingFilter || q);

      const acuityCards = [
        { k:'',         tone:'all',      title:'Total Clinical Caseload', count:acuityCounts.all,      sla:'Full multi-area medical register', pct:100 },
        { k:'critical', tone:'critical', title:'Tier 1 · Critical Acuity', count:acuityCounts.critical, sla:'24-72h clinician & nutrition review', pct:caseloadAll.length?Math.round(100*acuityCounts.critical/caseloadAll.length):0 },
        { k:'moderate', tone:'moderate', title:'Tier 2 · Moderate Watch',  count:acuityCounts.moderate, sla:'14-day clinical & pill-count check', pct:caseloadAll.length?Math.round(100*acuityCounts.moderate/caseloadAll.length):0 },
        { k:'stable',   tone:'stable',   title:'Tier 3 · Stable Trajectory', count:acuityCounts.stable, sla:'30-day PDCA & routine field care',   pct:caseloadAll.length?Math.round(100*acuityCounts.stable/caseloadAll.length):0 }
      ];

      body = `<div class="mcm-acuity-ribbon" role="region" aria-label="Clinical acuity stratification">
          ${acuityCards.map(c=>`<button class="mcm-acuity-card ${acuityFilter===c.k?'on':''}" data-acuity-tone="${c.tone}" data-act="go" data-v="clinicalmcm" data-tab="triage" data-acuity="${acuityFilter===c.k && c.k ? '' : c.k}" data-area="${esc(areaFilter)}" data-setting="${esc(settingFilter)}">
            <div class="spread" style="gap:8px">
              <span class="mcm-acuity-title">${esc(c.title)}</span>
              <span class="mcm-acuity-pct mono">${c.pct}%</span>
            </div>
            <div class="mcm-acuity-num mono">${num(c.count)}</div>
            <div class="mcm-acuity-sla">${esc(c.sla)}</div>
          </button>`).join('')}
        </div>`
      + card(`Medical Case Manager Clinical Caseload Register (${num(filteredRows.length)} patients)`,
        `<div class="reg-toolbar">
          <div class="reg-toolbar-main">
            <div class="reg-search">
              ${ic('search',15)}
              <input class="input" placeholder="Search patient name, CareLink code, primary diagnosis or area..." value="${esc(params.q||'')}" data-filter="q" data-view="clinicalmcm">
            </div>
            <select class="input reg-select" data-filter="area" data-view="clinicalmcm" aria-label="Filter caseload by ministry area">
              <option value="">All ministry areas (${areas.length})</option>
              ${areas.map(aid=>`<option value="${esc(aid)}" ${areaFilter===aid?'selected':''}>${esc(areaName(aid))}</option>`).join('')}
            </select>
            <select class="input reg-select" data-filter="setting" data-view="clinicalmcm" aria-label="Filter by care continuum">
              <option value="">All care pathways</option>
              <option value="over120" ${settingFilter==='over120'?'selected':''}>120+ Day Programme Stay (${num(over120.length)})</option>
              <option value="hospital" ${settingFilter==='hospital'?'selected':''}>Hospital Outpatient Continuum</option>
              <option value="homestay" ${settingFilter==='homestay'?'selected':''}>Homestay / Care Centre Respite</option>
              <option value="discharge" ${settingFilter==='discharge'?'selected':''}>Graduation / Discharge Review (${num(pendingDisch.length)})</option>
            </select>
          </div>
          <div class="reg-toolbar-pills">
            ${hasFilters ? `<button class="btn btn-xs btn-ghost" data-act="go" data-v="clinicalmcm" data-tab="triage">${ic('x',12)} Reset filters</button>` : ''}
            <button class="btn btn-xs btn-primary" data-act="mcm-soap-modal">${ic('plus',12)} Record SOAP</button>
          </div>
        </div>
        <div class="tbl-scroll reg-tbl-wrap">${table([
          { label:'Patient & Care Catchment', render:r=>{
            const col = r.acuity==='critical' ? '#DC2626' : (r.acuity==='moderate' ? '#D97706' : '#059669');
            return `<div class="reg-entity-cell">
              <span class="reg-avatar" style="background:${col}">${esc(initials(r.p.name))}</span>
              <div class="reg-entity-meta">
                <button class="linkbtn reg-name-btn" data-act="go" data-v="patient" data-id="${esc(r.p.id)}">${esc(r.p.name)}</button>
                <div class="reg-subline">
                  <span class="mono">${esc(r.p.code)}</span>
                  <span>·</span>
                  <span>${esc(areaName(r.p.areaId))}</span>
                  <span class="reg-cohort-tag ${r.bi?.isChild?'is-child':''}">${r.p.age}y · ${esc(r.p.sex||'F')}</span>
                </div>
              </div>
            </div>`;
          }},
          { label:'Acuity & Clinical Drivers', render:r=>`<div class="col" style="gap:4px;align-items:flex-start">
              ${badge(r.acuity==='critical'?'Critical · 24h SLA':r.acuity==='moderate'?'Moderate · 14d Watch':'Stable · Routine',
                r.acuity==='critical'?'b-crit':r.acuity==='moderate'?'b-warn':'b-ok')}
              <div class="row" style="gap:4px;flex-wrap:wrap">
                ${r.drivers.slice(0,2).map(d=>`<span class="mcm-driver-chip ${d.tone}">${esc(d.lbl)}</span>`).join('')}
              </div>
            </div>` },
          { label:'Primary Diagnosis & Adherence', render:r=>`<div class="col" style="gap:3px;align-items:flex-start">
              <b class="small" style="line-height:1.3">${esc(r.p.clinical?.diagnosis||'Chronic clinical & nutritional care')}</b>
              <div class="row" style="gap:6px">
                <span class="mcm-adh-pill ${r.poorAdh?'crit':r.fairAdh?'warn':'ok'}">Adherence: ${esc(titleCase(r.adh))}</span>
                ${r.p.clinical?.bp?`<span class="xs mono muted">BP ${esc(r.p.clinical.bp)}</span>`:''}
              </div>
            </div>` },
          { label:'Anthropometry (BMI & MUAC)', render:r=>r.bi ? `<div class="col" style="gap:4px;align-items:flex-start">
              ${this.badgeHTML(r.bi.bmi, true, r.bi.isChild ? r.bi.age : null)}
              <div class="xs mono muted">${r.bi.weightKg.toFixed(1)} kg · MUAC ${r.bi.muacCm} cm (${r.bi.weightDeltaKg>=0?'+':''}${r.bi.weightDeltaKg} kg)</div>
            </div>` : '-' },
          { label:'Stay & Visit Continuum', cls:'mono', render:r=>`<div class="col" style="gap:3px;align-items:flex-start">
              <div class="row" style="gap:6px">
                <b style="color:${r.days>=120?'var(--crit)':'var(--ink)'}">${r.days} days</b>
                ${pBadge(r.p.status)}
              </div>
              <div class="xs muted">${num(r.visitsCount)} visits${r.hasHosp?' · Hospital':''}${r.hasHomeStay?' · Homestay':''}</div>
            </div>` },
          { label:'Last Clinical Contact', render:r=>r.lastV
            ? `<div class="small"><span class="mono">${fmtDate(r.lastV.date)}</span><div class="xs muted">${esc(titleCase(r.lastV.type||'home'))} · ${esc(titleCase(r.lastV.outcome||'seen'))}</div></div>`
            : `<span class="badge b-warn nodot">Schedule visit</span>` },
          { label:'Actions', cls:'act', render:r=>`<div class="reg-act-pair">
              <button class="btn btn-xs btn-primary" data-act="mcm-soap-modal" data-id="${esc(r.p.id)}">+ SOAP</button>
              <button class="btn btn-xs btn-ghost" data-act="go" data-v="patient" data-id="${esc(r.p.id)}">Chart</button>
            </div>` }
        ], pageRows, {emptyMsg:'No patients match the selected clinical caseload criteria.'})}</div>
        <div class="reg-pager-bar">
          <span class="xs muted">${ic('activity',13)} Stratified by clinical acuity &amp; days in care · Showing <b>${filteredRows.length?((curPage-1)*perPage+1):0}-${Math.min(curPage*perPage, filteredRows.length)}</b> of <b>${num(filteredRows.length)}</b> patients</span>
          ${pageCount > 1 ? `<div class="row" style="gap:6px">
            <button class="btn btn-xs btn-ghost" ${curPage<=1?'disabled data-skip="1"':''} data-act="go" data-v="clinicalmcm" data-tab="triage" data-acuity="${esc(acuityFilter)}" data-area="${esc(areaFilter)}" data-setting="${esc(settingFilter)}" data-q="${esc(params.q||'')}" data-page="${curPage-1}">Previous</button>
            <span class="xs mono bold" style="padding:0 6px">Page ${curPage} / ${pageCount}</span>
            <button class="btn btn-xs btn-ghost" ${curPage>=pageCount?'disabled data-skip="1"':''} data-act="go" data-v="clinicalmcm" data-tab="triage" data-acuity="${esc(acuityFilter)}" data-area="${esc(areaFilter)}" data-setting="${esc(settingFilter)}" data-q="${esc(params.q||'')}" data-page="${curPage+1}">Next</button>
          </div>` : ''}
        </div>`,
        { sub:'Prioritises critical SAM malnutrition, medication adherence risks, and 120+ day specialist reviews across all authorised ministry areas.' });
    }

    if(tab==='assistant'){
      const critN = alerts.filter(a=>a.severity==='crit').length;
      const watchN = alerts.length - critN;
      body = card(`Clinical Decision-Support Red-Flag Register (${num(alerts.length)} active advisories)`,
        `<div class="mcm-assist-banner">
          <div class="row" style="gap:10px;align-items:flex-start">
            <span class="mcm-assist-ic">${ic('sparkles',18)}</span>
            <div>
              <b>CareLink Deterministic Clinical Surveillance (MCM v2.5.0)</b>
              <p class="xs muted" style="margin:3px 0 0">Continuously screens caseload anthropometrics (SAM &amp; &ge;10% weight loss), ART/TB adherence, 30-day PDCA milestones, and 120+ day stay ceilings. Final clinical judgment rests exclusively with the licensed clinician.</p>
            </div>
          </div>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            ${badge(num(critN)+' Critical SLA','b-crit')}
            ${badge(num(watchN)+' Clinical Watch','b-warn')}
          </div>
        </div>
        <div class="tbl-scroll reg-tbl-wrap">${table([
          {label:'Priority Tier', render:a=>badge(a.severity==='crit'?'Critical · Immediate':'Clinical Watch', a.severity==='crit'?'b-crit':'b-warn')},
          {label:'Patient & Catchment', render:a=>`<div class="reg-entity-cell">
              <span class="reg-avatar" style="background:${a.severity==='crit'?'#DC2626':'#D97706'}">${esc(initials(a.patient.name))}</span>
              <div class="reg-entity-meta">
                <button class="linkbtn reg-name-btn" data-act="go" data-v="patient" data-id="${esc(a.patient.id)}">${esc(a.patient.name)}</button>
                <div class="reg-subline"><span class="mono">${esc(a.patient.code)}</span><span>·</span><span>${esc(areaName(a.patient.areaId))}</span></div>
              </div>
            </div>`},
          {label:'Protocol Trigger', render:a=>`<b class="small">${esc(a.kind)}</b>`},
          {label:'Recommended Clinical Action', render:a=>`<span class="small">${esc(a.detail)}</span>`},
          {label:'Action', cls:'act', render:a=>`<div class="reg-act-pair">
              <button class="btn btn-xs btn-primary" data-act="mcm-soap-modal" data-id="${esc(a.patient.id)}">Review &amp; SOAP</button>
              <button class="btn btn-xs btn-ghost" data-act="go" data-v="patient" data-id="${esc(a.patient.id)}">File</button>
            </div>`}
        ], alerts.slice(0, 40), {emptyMsg:'Zero unaddressed critical clinical triggers in your caseload.'})}</div>`);
    }

    if(tab==='soap'){
      body = card(`Structured SOAP Clinical Encounters & Vitals Ledger (${num(notes.length)})`,
        `<div class="spread" style="margin-bottom:14px;gap:12px;flex-wrap:wrap">
          <span class="small muted">Standardized 4-quadrant Subjective, Objective, Assessment, and Plan clinical documentation linked directly to patient vitals and live WHO BMI grading.</span>
          <button class="btn btn-sm btn-primary" data-act="mcm-soap-modal">${ic('plus',14)} Record New SOAP Encounter</button>
        </div>
        <div class="soap-list-grid">
        ${notes.map(n=>{
          const p = (DB.db.patients||[]).find(x=>x.id===n.patientId);
          return `<article class="soap-card soap-encounter-card" data-acuity="${esc(n.acuity||'moderate')}">
            <div class="soap-head">
              <div class="reg-entity-cell">
                <span class="reg-avatar" style="background:${n.acuity==='critical'?'#DC2626':n.acuity==='stable'?'#059669':'#0284C7'}">${esc(initials(p?p.name:'PT'))}</span>
                <div class="reg-entity-meta">
                  <div class="row" style="gap:8px;flex-wrap:wrap">
                    ${p?`<button class="linkbtn reg-name-btn" data-act="go" data-v="patient" data-id="${esc(p.id)}">${esc(p.name)}</button>`:`<b>Patient</b>`}
                    <span class="xs mono muted">${esc(p?p.code:n.patientId)} · ${esc(areaName(n.areaId))}</span>
                  </div>
                  <div class="xs muted">${esc(fmtDate(n.date))} · Signed by <b>${esc(n.authorName)}</b> (${esc(n.role)})</div>
                </div>
              </div>
              <div class="soap-vitals-strip">
                ${badge('Acuity: '+titleCase(n.acuity||'moderate'), n.acuity==='critical'?'b-crit':n.acuity==='stable'?'b-ok':'b-warn')}
                ${this.badgeHTML(n.bmi, true, p ? p.age : null)}
                <span class="soap-vital-chip">BP <b>${esc(n.bp||'120/78')}</b></span>
                <span class="soap-vital-chip">SpO2 <b>${esc(String(n.spo2||98))}%</b></span>
                <span class="soap-vital-chip">Temp <b>${esc(String(n.temp||36.6))}&deg;C</b></span>
                ${n.weightKg?`<span class="soap-vital-chip">Wt <b>${Number(n.weightKg).toFixed(1)} kg</b></span>`:''}
              </div>
            </div>
            <div class="soap-quad-grid">
              <div class="soap-quad"><div class="soap-q-tag s"><span>S</span> Subjective</div><p>${esc(n.subjective)}</p></div>
              <div class="soap-quad"><div class="soap-q-tag o"><span>O</span> Objective</div><p>${esc(n.objective)}</p></div>
              <div class="soap-quad"><div class="soap-q-tag a"><span>A</span> Assessment</div><p>${esc(n.assessment)}</p></div>
              <div class="soap-quad"><div class="soap-q-tag p"><span>P</span> Plan</div><p>${esc(n.plan)}</p></div>
            </div>
          </article>`;
        }).join('')}
        </div>`);
    }

    if(tab==='regimens'){
      const rxRows = (DB.db.clinicalRx||DB.db.prescriptions||[]).filter(r=>{
        const p = (DB.db.patients||[]).find(x=>x.id===r.patientId);
        return p && RBAC.patientVisible(user, p);
      });
      /* Include active patients on chronic ART/TB/NCD therapy when clinicalRx is sparse so clinician sees full regimen surveillance */
      const regimenRows = rxRows.length ? rxRows.slice(0, 40).map(r => {
        const p = (DB.db.patients||[]).find(x=>x.id===r.patientId);
        return { p, med: r.medicine||r.drug||r.item||'Essential medicine', sig: r.dosage||r.sig||'As prescribed', status: r.status||'active', date: r.date||r.createdAt, adh: p?.clinical?.adherence||'Good' };
      }) : caseloadAll.slice(0, 30).map(r => ({
        p: r.p,
        med: /tb/i.test(r.p.clinical?.diagnosis||'') ? 'RHZE / RH + Pyridoxine 50 mg Prophylaxis'
          : (/hiv|art/i.test(r.p.clinical?.diagnosis||'') ? 'TLD (Tenofovir/Lamivudine/Dolutegravir) + Cotrimoxazole'
          : (/diabet|hypertens/i.test(r.p.clinical?.diagnosis||'') ? 'Amlodipine / Metformin Chronic NCD Regimen'
          : 'Supportive Micronutrient, Haematinic & Therapeutic Protocol')),
        sig: 'Daily supervised household adherence & 30-day clinic refill check',
        status: 'active',
        date: r.lastV?.date || r.p.intake,
        adh: r.adh
      }));
      body = card(`Active Clinical Regimens, ART/TB Adherence & Pyridoxine Safety Register (${num(regimenRows.length)})`,
        `<div class="spread" style="margin-bottom:12px;gap:10px;flex-wrap:wrap">
          <span class="small muted">Monitors essential prescriptions, HIV/ART refill continuity, and mandatory Pyridoxine co-administration for all TB regimens.</span>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            ${RBAC.has(user,'pharmacy.view')?`<button class="btn btn-xs btn-ghost" data-act="go" data-v="pharmacy">${ic('package',13)} Open FEFO Pharmacy</button>`:''}
            ${RBAC.has(user,'tb.view')?`<button class="btn btn-xs btn-primary" data-act="go" data-v="tbcare">${ic('shieldcheck',13)} TB &amp; Pyridoxine Control</button>`:''}
          </div>
        </div>
        <div class="tbl-scroll reg-tbl-wrap">${table([
          {label:'Patient & Area', render:r=>r.p?`<button class="linkbtn reg-name-btn" data-act="go" data-v="patient" data-id="${esc(r.p.id)}">${esc(r.p.name)}</button><div class="xs muted mono">${esc(r.p.code)} · ${esc(areaName(r.p.areaId))}</div>`:'-'},
          {label:'Therapeutic Regimen & Prophylaxis', render:r=>`<b>${esc(r.med)}</b><div class="xs muted">${esc(r.sig)}</div>`},
          {label:'Adherence Standing', render:r=>`<span class="mcm-adh-pill ${/poor/i.test(r.adh)?'crit':/fair/i.test(r.adh)?'warn':'ok'}">${esc(titleCase(r.adh))}</span>`},
          {label:'Status', render:r=>badge(titleCase(r.status||'active'), r.status==='dispensed'||r.status==='active'?'b-ok':'b-info')},
          {label:'Last Verified', cls:'mono', render:r=>esc(fmtDate(r.date))},
          {label:'', cls:'act', render:r=>r.p?`<button class="btn btn-xs btn-ghost" data-act="mcm-soap-modal" data-id="${esc(r.p.id)}">Review Rx</button>`:''}
        ], regimenRows, {emptyMsg:'Open Pharmacy or Patient Chart to prescribe or review medications.'})}</div>`);
    }

    if(tab==='hospital'){
      body = card(`Hospital Referrals, Admissions & Post-Discharge Continuum (${num(hospActive.length)})`,
        `<div class="tbl-scroll reg-tbl-wrap">${table([
          {label:'Referral / Request', render:r=>`<b class="mono">${esc(r.no||r.code||r.id)}</b><div class="xs muted">${esc(fmtDate(r.createdAt||r.submittedAt))}</div>`},
          {label:'Patient & Area', render:r=>{ const p=(DB.db.patients||[]).find(x=>x.id===r.patientId); return p?`<button class="linkbtn reg-name-btn" data-act="go" data-v="patient" data-id="${esc(p.id)}">${esc(p.name)}</button><div class="xs muted mono">${esc(p.code)} · ${esc(areaName(p.areaId))}</div>`:esc(r.patientId); }},
          {label:'Partner Facility & Clinical Reason', render:r=>`<b>${esc(r.facility||'County Referral Hospital')}</b><div class="xs muted">${esc(r.reason||'Specialist outpatient / inpatient review')}</div>`},
          {label:'Priority', render:r=>badge(titleCase(r.priority||'routine'), r.priority==='critical'?'b-crit':r.priority==='urgent'?'b-warn':'b-info')},
          {label:'Workflow Status', render:r=>badge(titleCase(r.status), r.status==='approved'||r.status==='reconciled'?'b-ok':'b-warn')},
          {label:'Action', cls:'act', render:()=>`<button class="btn btn-xs btn-ghost" data-act="go" data-v="requests">Open Queue</button>`}
        ], hospActive.slice(0,35), {emptyMsg:'No active hospital episodes open.'})}</div>`,
        { sub:'Coordinated jointly between Medical Case Managers, Hospital Focal Persons, and Ministry Area Caregivers.' });
    }

    if(tab==='pdca120'){
      body = card(`120+ Day Programme Stay PDCA Escalations (${num(over120.length)} patients)`,
        `<div class="spread" style="margin-bottom:12px;flex-wrap:wrap;gap:8px">
          <span class="small muted">Beneficiaries exceeding 120 programme days undergo a structured Plan-Do-Check-Act clinical review shared with the International Medical Team for specialist concurrence.</span>
          ${RBAC.has(user,'intl.medical')?`<button class="btn btn-xs btn-primary" data-act="go" data-v="intlmedical">${ic('pulse',13)} Open International Medical 120+d Console</button>`:''}
        </div>
        <div class="tbl-scroll reg-tbl-wrap">${table([
          {label:'Patient & Catchment', render:p=>`<button class="linkbtn reg-name-btn" data-act="go" data-v="patient" data-id="${esc(p.id)}">${esc(p.name)}</button><div class="xs muted mono">${esc(p.code)} · ${esc(areaName(p.areaId))}</div>`},
          {label:'Programme Duration', cls:'num mono', render:p=>`<b style="color:var(--crit)">${PAT.days(p)} days</b>`},
          {label:'Nutritional Standing', render:p=>this.badgeHTML(this.patientBmiInfo(p)?.bmi, true, p.age)},
          {label:'Primary Clinical Diagnosis', render:p=>esc(p.clinical?.diagnosis||'Complex chronic medical & nutritional care')},
          {label:'Action', cls:'act', render:p=>`<div class="reg-act-pair">
              <button class="btn btn-xs btn-primary" data-act="intl-file-pdca120" data-id="${esc(p.id)}">File 120+d Dossier</button>
              <button class="btn btn-xs btn-ghost" data-act="go" data-v="patient" data-id="${esc(p.id)}" data-tab="pdca">PDCA</button>
            </div>`}
        ], over120.slice(0, 40), {emptyMsg:'No active patients currently exceed 120 days in scope.'})}</div>`);
    }

    return pageHead('Medical Case Manager & Clinical Caseload Console',
      'Integrated clinical caseload governance — acuity stratification, structured SOAP clinical encounters, WHO BMI & MUAC surveillance, ART/TB & Pyridoxine safety, hospital continuum, and 120+ day specialist PDCA escalations.',
      `<div class="row" style="gap:8px;flex-wrap:wrap">
        <button class="btn btn-sm btn-ghost" data-act="go" data-v="bmiboard">${ic('pulse',15)} Anthropometric Register</button>
        <button class="btn btn-sm btn-primary" data-act="mcm-soap-modal">${ic('plus',15)} New SOAP Encounter</button>
      </div>`)
    + `<div class="grid g4" style="margin-bottom:16px">
        ${kpi('Active clinical caseload', num(caseloadAll.length), `${num(pendingDisch.length)} graduation reviews ready`, 'info', 'users')}
        ${kpi('Critical clinical acuity', num(acuityCounts.critical), `${num(alerts.length)} total clinical protocol flags`, acuityCounts.critical?'crit':'ok', 'alert')}
        ${kpi('Hospital episodes open', num(hospActive.length), 'JOOTRH, KCRH &amp; Homa Bay Referral', hospActive.length?'warn':'ok', 'hospital')}
        ${kpi('120+ day PDCA reviews', num(over120.length), 'International Medical specialist track', over120.length?'warn':'ok', 'pulse')}
      </div>`
    + `<div class="tabs" style="margin-bottom:16px">${tabs.map(([id,lbl])=>`<button class="tab ${tab===id?'active':''}" data-act="go" data-v="clinicalmcm" data-tab="${id}">${esc(lbl)}</button>`).join('')}</div>`
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
