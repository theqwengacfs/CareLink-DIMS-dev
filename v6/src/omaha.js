/* ============================================================
   omaha.js - Omaha System care plans.

   The Foundation was given two reference documents: a Dutch sample care
   plan for stroke (CVA) and a PDCA formulation for HIV and TB co-infection.
   Both use the Omaha structure: domain, category, problem, then an
   intervention with a category and a target. This module implements that
   structure, a rated problem list (knowledge, behaviour, status) and a
   PDCA cycle generated from the plan.

   The problem list below is an adapted working subset, not the full
   licensed Omaha System vocabulary. It is labelled as such on screen and in
   the printed document: a care plan built here is a clinical working
   document for LOMAMO, not a certified Omaha product.
   ============================================================ */

const OMAHA_DOMAINS = [
  { id:'environmental', name:'Environmental domain' },
  { id:'psychosocial',  name:'Psychosocial domain' },
  { id:'physiological', name:'Physiological domain' },
  { id:'behaviour',     name:'Health-related behaviour domain' }
];

const OMAHA_PROBLEMS = [
  /* Environmental */
  { code:'E01', domain:'environmental', cat:'Income', problem:'Income',
    ix:[{c:'TGC',t:'Finances',d:'Advise on benefits, cost sharing and lost income; refer to social work for debt advice.'},
        {c:'CM',t:'Community resources',d:'Refer to a social worker or welfare officer where income support is needed.'}] },
  { code:'E02', domain:'environmental', cat:'Residence', problem:'Residence',
    ix:[{c:'TGC',t:'Housing',d:'Advise on a safe living space, home adaptations and assistive equipment.'},
        {c:'CM',t:'Equipment',d:'Arrange occupational therapy assessment and equipment.'}] },
  { code:'E03', domain:'environmental', cat:'Sanitation', problem:'Sanitation',
    ix:[{c:'TGC',t:'Household hygiene',d:'Instruct on water treatment, food storage, latrine use and hand washing.'},
        {c:'CM',t:'Hygiene supplies',d:'Provide Water Guard, soap and a hygiene bag where needed.'}] },
  { code:'E04', domain:'environmental', cat:'Neighbourhood safety', problem:'Neighbourhood and workplace safety',
    ix:[{c:'SUR',t:'Safety',d:'Monitor the household and neighbourhood for safeguarding risks.'}] },

  /* Psychosocial */
  { code:'P01', domain:'psychosocial', cat:'Communication with community resources', problem:'Communication with community resources',
    ix:[{c:'TGC',t:'Community resources',d:'Inform about the social map, support groups and day activities.'},
        {c:'CM',t:'Referral',d:'Make the referral and confirm the appointment.'}] },
  { code:'P02', domain:'psychosocial', cat:'Social contact', problem:'Social contact',
    ix:[{c:'TGC',t:'Social contact',d:'Encourage day structure, group activities and peer contact.'},
        {c:'SUR',t:'Isolation',d:'Monitor for social isolation at each review.'}] },
  { code:'P03', domain:'psychosocial', cat:'Role change', problem:'Role change',
    ix:[{c:'TGC',t:'Coping',d:'Support the patient and the family through changed roles and responsibilities.'}] },
  { code:'P04', domain:'psychosocial', cat:'Mental health', problem:'Mental health',
    ix:[{c:'TGC',t:'Coping skills',d:'Support acceptance, self-management and emotional adjustment.'},
        {c:'SUR',t:'Mood',d:'Monitor mood, sleep, appetite and thoughts of self-harm; use a structured screen.'},
        {c:'CM',t:'Referral',d:'Refer to a clinician or counsellor when depression is suspected.'}] },
  { code:'P05', domain:'psychosocial', cat:'Grief', problem:'Grief',
    ix:[{c:'TGC',t:'Grief',d:'Offer bereavement support and allow the person to talk.'}] },
  { code:'P06', domain:'psychosocial', cat:'Interpersonal relationship', problem:'Interpersonal relationship',
    ix:[{c:'TGC',t:'Relationships',d:'Support communication within the household; arrange a family conversation.'}] },
  { code:'P07', domain:'psychosocial', cat:'Spirituality', problem:'Spirituality',
    ix:[{c:'TGC',t:'Spiritual care',d:'Offer the chaplaincy or church contact where the patient wishes it.'}] },

  /* Physiological */
  { code:'F01', domain:'physiological', cat:'Circulation', problem:'Circulation',
    ix:[{c:'TGC',t:'Medication',d:'Explain each medicine, its purpose and how to take it.'},
        {c:'TGC',t:'Healthy lifestyle',d:'Advise on smoking, diet, activity and blood pressure control.'},
        {c:'SUR',t:'Blood pressure',d:'Record blood pressure and weight at every review.'}] },
  { code:'F02', domain:'physiological', cat:'Cognition', problem:'Cognition',
    ix:[{c:'TGC',t:'Cognition',d:'Explain the effects of cognitive impairment to the patient and the family.'},
        {c:'SUR',t:'Cognition',d:'Monitor orientation, memory and the safety of daily decisions.'}] },
  { code:'F03', domain:'physiological', cat:'Neuro-musculo-skeletal function', problem:'Neuro-musculo-skeletal function',
    ix:[{c:'TGC',t:'Mobility',d:'Instruct on safe movement, transfers and the use of walking aids.'},
        {c:'CM',t:'Therapy',d:'Refer for physiotherapy and occupational therapy.'}] },
  { code:'F04', domain:'physiological', cat:'Pain', problem:'Pain',
    ix:[{c:'SUR',t:'Pain',d:'Assess pain at each visit and record the score.'},
        {c:'TP',t:'Pain management',d:'Administer or supply analgesia as prescribed.'}] },
  { code:'F05', domain:'physiological', cat:'Respiration', problem:'Respiration',
    ix:[{c:'SUR',t:'Breathing',d:'Monitor respiratory rate, effort and oxygen saturation.'},
        {c:'TGC',t:'Infection control',d:'Instruct on cough hygiene, ventilation and when to seek care.'}] },
  { code:'F06', domain:'physiological', cat:'Integument', problem:'Integument',
    ix:[{c:'TP',t:'Wound care',d:'Clean and dress the wound using the prescribed materials; record the appearance.'},
        {c:'SUR',t:'Wound',d:'Photograph and measure the wound at each review.'},
        {c:'TGC',t:'Pressure care',d:'Instruct on repositioning and skin inspection.'}] },
  { code:'F07', domain:'physiological', cat:'Digestion and hydration', problem:'Digestion and hydration',
    ix:[{c:'SUR',t:'Hydration',d:'Monitor fluid intake, output and signs of dehydration.'}] },
  { code:'F08', domain:'physiological', cat:'Bowel function', problem:'Bowel function',
    ix:[{c:'TGC',t:'Bowel care',d:'Advise on fluid, fibre and activity; review constipating medicines.'}] },
  { code:'F09', domain:'physiological', cat:'Urinary function', problem:'Urinary function',
    ix:[{c:'SUR',t:'Urinary',d:'Monitor urinary symptoms and continence.'}] },
  { code:'F10', domain:'physiological', cat:'Sleep and rest', problem:'Sleep and rest patterns',
    ix:[{c:'TGC',t:'Sleep',d:'Advise on sleep routine and review medicines that disturb sleep.'}] },
  { code:'F11', domain:'physiological', cat:'Communicable condition', problem:'Communicable or infectious condition',
    ix:[{c:'TP',t:'Infection prevention',d:'Apply isolation and personal protective equipment according to the national guidance.'},
        {c:'TGC',t:'Adherence',d:'Explain the treatment, the duration and the consequence of missing doses.'},
        {c:'SUR',t:'Symptoms',d:'Monitor temperature, weight and symptoms at every contact.'},
        {c:'CM',t:'Contact tracing',d:'Ensure household contacts are screened and documented.'}] },

  /* Health-related behaviour */
  { code:'H01', domain:'behaviour', cat:'Nutrition', problem:'Nutrition',
    ix:[{c:'TGC',t:'Diet',d:'Instruct on energy and protein rich food, food safety and small frequent meals.'},
        {c:'TP',t:'Food provision',d:'Provide the food bag and any prescribed supplement.'},
        {c:'SUR',t:'Weight',d:'Weigh at every visit and plot the trend.'}] },
  { code:'H02', domain:'behaviour', cat:'Medication regimen', problem:'Medication regimen',
    ix:[{c:'TGC',t:'Adherence',d:'Explain the regimen, side effects and what to do about a missed dose.'},
        {c:'TP',t:'Direct observation',d:'Support directly observed therapy where it is prescribed.'},
        {c:'SUR',t:'Adherence',d:'Count tablets or ask about missed doses at every contact.'}] },
  { code:'H03', domain:'behaviour', cat:'Health care supervision', problem:'Health care supervision',
    ix:[{c:'CM',t:'Appointments',d:'Arrange the clinic appointments, transport and escorts.'},
        {c:'SUR',t:'Attendance',d:'Monitor attendance and follow up a missed appointment within seven days.'}] },
  { code:'H04', domain:'behaviour', cat:'Physical activity', problem:'Physical activity',
    ix:[{c:'TGC',t:'Activity',d:'Advise on safe daily movement and gradual increase.'}] },
  { code:'H05', domain:'behaviour', cat:'Personal hygiene', problem:'Personal hygiene',
    ix:[{c:'TGC',t:'Hygiene',d:'Instruct on personal care and the safe use of shared washing facilities.'}] },
  { code:'H06', domain:'behaviour', cat:'Substance use', problem:'Alcohol and substance use',
    ix:[{c:'TGC',t:'Substance use',d:'Offer brief advice and referral where use interferes with treatment.'}] },
  { code:'H07', domain:'behaviour', cat:'Family planning', problem:'Family planning',
    ix:[{c:'TGC',t:'Family planning',d:'Discuss options and refer to the clinic where requested.'}] }
];

const OMAHA_RATING = {
  knowledge:{ 1:'No knowledge',2:'Minimal knowledge',3:'Basic knowledge',4:'Adequate knowledge',5:'Superior knowledge' },
  behaviour:{ 1:'Not appropriate',2:'Rarely appropriate',3:'Inconsistently appropriate',4:'Usually appropriate',5:'Consistently appropriate' },
  status:{ 1:'Extreme signs or symptoms',2:'Severe signs or symptoms',3:'Moderate signs or symptoms',4:'Minimal signs or symptoms',5:'No signs or symptoms' }
};

const OMAHA_IX_CATEGORIES = {
  TGC:'Teaching, guidance and counselling',
  TP:'Treatments and procedures',
  CM:'Case management',
  SUR:'Surveillance'
};

/* Templates adapted from the two reference documents supplied by LOMAMO.
   They are a starting point that the clinician edits; they are not a
   standard care plan and are not applied automatically to anyone. */
const OMAHA_TEMPLATES = [
  { id:'cva', name:'Stroke (CVA) - adapted from the supplied sample plan', domainFocus:'Rehabilitation and family support',
    problems:['F01','F02','F03','F06','P01','P02','P03','P04','E01','E02','H02','H04','H05'],
    note:'The Dutch sample plan was used as the structure. The interventions are LOMAMO wording for a community setting.' },
  { id:'hiv_tb', name:'HIV and TB co-infection - adapted from the supplied PDCA formulation', domainFocus:'Adherence, infection prevention and nutrition',
    problems:['F11','H01','H02','H03','P04','F05','F10'],
    note:'Follows the supplied four-phase plan: adherence, infection prevention, nutrition, review of what worked and what did not.' },
  { id:'wound', name:'Wound care at home', domainFocus:'Healing, hygiene and follow-up',
    problems:['F06','E03','H05','F04','H01'],
    note:'Built from the home-visit form wound section and the outpatient wound questions.' },
  { id:'child_nutrition', name:'Child nutrition and growth', domainFocus:'Malnutrition, feeding and school',
    problems:['H01','F11','H03','E03','H06','P02'],
    note:'Uses the minor assessment form fields for weight, food bag and school contact.' }
];

const OMAHAS = {
  domains(){ return OMAHA_DOMAINS; },
  problems(){ return OMAHA_PROBLEMS; },
  problem(code){ return OMAHA_PROBLEMS.find(p=>p.code===code)||null; },
  templates(){ return OMAHA_TEMPLATES; },
  template(id){ return OMAHA_TEMPLATES.find(t=>t.id===id)||null; },
  ratings(){ return OMAHA_RATING; },
  categories(){ return OMAHA_IX_CATEGORIES; },

  plans(user, filter={}){
    if(!RBAC.has(user,'careplan.view') && !RBAC.has(user,'careplan.manage') && !RBAC.has(user,'patient.view.clinical')) return [];
    let rows=(DB.db.omahaPlans||[]).filter(p=>{
      const pt=DB.db.patients.find(x=>x.id===p.patientId);
      return pt && RBAC.patientVisible(user,pt);
    });
    if(filter.patientId) rows=rows.filter(p=>p.patientId===filter.patientId);
    if(filter.status) rows=rows.filter(p=>p.status===filter.status);
    return rows.sort((a,b)=>new Date(b.updatedAt||b.createdAt)-new Date(a.updatedAt||a.createdAt));
  },

  plan(user,id){
    const p=(DB.db.omahaPlans||[]).find(x=>x.id===id);
    if(!p) return null;
    const pt=DB.db.patients.find(x=>x.id===p.patientId);
    return pt&&RBAC.patientVisible(user,pt)? p:null;
  },

  create(user, {patientId, templateId, title, problems}){
    const pt=repo.patient(user,patientId);
    if(!pt) return {ok:false,msg:'Patient not found in your scope.'};
    if(!RBAC.assert(user,'careplan.manage',{countyId:pt.countyId,areaId:pt.areaId},false))
      return {ok:false,msg:'Your role may not create a care plan.'};
    const tpl=this.template(templateId);
    const codes=problems&&problems.length? problems : (tpl? tpl.problems:[]);
    if(!codes.length) return {ok:false,msg:'Choose at least one problem for the plan.'};
    const plan={
      id:uid('om'), patientId, patientName:pt.name, countyId:pt.countyId, areaId:pt.areaId,
      title:String(title|| (tpl? tpl.name: 'Care plan')).slice(0,120),
      templateId:templateId||null, status:'draft', version:1,
      problems:codes.map(code=>{
        const def=this.problem(code);
        return { code, domain:def?.domain, category:def?.cat, problem:def?.problem,
          rating:{knowledge:null,behaviour:null,status:null}, ratings:[], note:'' };
      }),
      interventions:codes.flatMap(code=>{
        const def=this.problem(code);
        return (def?.ix||[]).map(ix=>({ problemCode:code, category:ix.c, target:ix.t, detail:ix.d, frequency:'', responsible:'' }));
      }),
      createdBy:user.id, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString()
    };
    DB.db.omahaPlans=DB.db.omahaPlans||[];
    DB.db.omahaPlans.unshift(plan);
    AUDIT.append({actor:user.id,action:'careplan.created',entity:'careplan',entityId:plan.id,
      detail:`${pt.code} · ${plan.title} · ${codes.length} problem(s)`});
    DB.save();
    return {ok:true,plan,msg:'Care plan drafted. Rate the problems and agree it with the patient.'};
  },

  rate(user, planId, code, rating, note=''){
    const plan=this.plan(user,planId);
    if(!plan) return {ok:false,msg:'Care plan not found in your scope.'};
    if(!RBAC.assert(user,'careplan.manage',{countyId:plan.countyId,areaId:plan.areaId},false))
      return {ok:false,msg:'Your role may not record a rating.'};
    const row=plan.problems.find(p=>p.code===code);
    if(!row) return {ok:false,msg:'That problem is not on this plan.'};
    const clean={};
    ['knowledge','behaviour','status'].forEach(k=>{
      const v=Number(rating[k]);
      if(v>=1&&v<=5) clean[k]=v;
    });
    row.rating={...row.rating,...clean};
    row.ratings=[...(row.ratings||[]),{at:new Date().toISOString(),by:user.id,...clean,note:String(note||'').slice(0,300)}];
    plan.updatedAt=new Date().toISOString();
    AUDIT.append({actor:user.id,action:'careplan.rated',entity:'careplan',entityId:plan.id,
      detail:`${row.problem} · ${Object.entries(clean).map(([k,v])=>`${k} ${v}`).join(', ')}`});
    DB.save();
    return {ok:true,plan,msg:'Rating recorded.'};
  },

  addIntervention(user, planId, {problemCode, category, target, detail, frequency, responsible}){
    const plan=this.plan(user,planId);
    if(!plan) return {ok:false,msg:'Care plan not found.'};
    if(!RBAC.has(user,'careplan.manage')) return {ok:false,msg:'Your role may not edit a care plan.'};
    if(!OMAHA_IX_CATEGORIES[category]) return {ok:false,msg:'Choose an intervention category.'};
    if(!String(target||'').trim() || !String(detail||'').trim()) return {ok:false,msg:'An intervention needs a target and a description.'};
    plan.interventions.push({problemCode, category, target:String(target).slice(0,80), detail:String(detail).slice(0,400),
      frequency:String(frequency||'').slice(0,80), responsible:String(responsible||'').slice(0,80), addedBy:user.id, addedAt:new Date().toISOString()});
    plan.updatedAt=new Date().toISOString();
    AUDIT.append({actor:user.id,action:'careplan.intervention.added',entity:'careplan',entityId:plan.id,detail:target});
    DB.save(); return {ok:true,plan,msg:'Intervention added.'};
  },

  approve(user, planId, note=''){
    const plan=this.plan(user,planId);
    if(!plan) return {ok:false,msg:'Care plan not found.'};
    if(!RBAC.assert(user,'careplan.approve',{countyId:plan.countyId,areaId:plan.areaId},false))
      return {ok:false,msg:'Only a clinician may approve a care plan.'};
    if(plan.createdBy===user.id && !RBAC.has(user,'system.config'))
      return {ok:false,msg:'The person who drafted a care plan cannot also approve it. Ask a second clinician.'};
    const unrated=plan.problems.filter(p=>!p.rating||Object.values(p.rating).some(v=>!v));
    if(unrated.length) return {ok:false,msg:`Rate every problem before approval. Unrated: ${unrated.map(p=>p.problem).join(', ')}.`};
    plan.status='active'; plan.approvedBy=user.id; plan.approvedAt=new Date().toISOString(); plan.approvalNote=String(note||'').slice(0,300);
    plan.updatedAt=new Date().toISOString();
    AUDIT.append({actor:user.id,action:'careplan.approved',entity:'careplan',entityId:plan.id,detail:plan.title});
    const pt=DB.db.patients.find(x=>x.id===plan.patientId);
    if(pt) notify(pt.caregiverId,'Care plan approved',plan.title,'ok');
    DB.save(); return {ok:true,plan,msg:'Care plan approved and active.'};
  },

  /* The PDCA formulation from the supplied example, built from the plan. */
  pdca(user, planId){
    const plan=this.plan(user,planId);
    if(!plan) return {ok:false,msg:'Care plan not found.'};
    if(!RBAC.has(user,'careplan.manage')&&!RBAC.has(user,'careplan.approve')) return {ok:false,msg:'Your role may not create a PDCA cycle.'};
    if(plan.status!=='active') return {ok:false,msg:'Approve the care plan before starting a PDCA cycle.'};
    const problems=plan.problems.map(p=>`${p.problem} (${p.rating.knowledge}/${p.rating.behaviour}/${p.rating.status})`).join('; ');
    const interventions=plan.interventions.map(i=>`${OMAHA_IX_CATEGORIES[i.category].split(',')[0]}: ${i.target} - ${i.detail}`).join('\n');
    const rec={ id:uid('pd'), patientId:plan.patientId, kind:'omaha', stage:'Plan',
      plan:`Care plan review for ${plan.title}.\nProblems: ${problems}\nInterventions:\n${interventions}`,
      doNote:'', checkNote:'', actNote:'',
      due:new Date(Date.now()+30*86400000).toISOString(), owner:user.id, status:'open',
      carePlanId:plan.id, createdAt:new Date().toISOString(), demo:false };
    DB.db.pdcas=DB.db.pdcas||[];
    DB.db.pdcas.unshift(rec);
    plan.pdcaId=rec.id;
    AUDIT.append({actor:user.id,action:'careplan.pdca.created',entity:'careplan',entityId:plan.id,detail:rec.id});
    DB.save();
    return {ok:true,rec,msg:'PDCA cycle opened from the care plan, due in 30 days.'};
  },

  doc(plan){
    const pt=DB.db.patients.find(x=>x.id===plan.patientId);
    return `<div class="form-doc">
      <div class="doc-head"><img src="${window.LOGO||''}" alt="">
        <div><div class="doc-org">LOMAMO FOUNDATION KENYA</div><h2>Care plan</h2>
          <div class="doc-sub">Structured on the Omaha System - adapted working subset</div></div>
        <div class="doc-code">${esc(plan.id.slice(-6).toUpperCase())}</div></div>
      <div class="doc-meta">
        <span><b>Patient</b> ${esc(plan.patientName)}</span>
        <span><b>Code</b> ${esc(pt?.code||'')}</span>
        <span><b>Plan</b> ${esc(plan.title)}</span>
        <span><b>Status</b> ${esc(titleCase(plan.status))}</span>
        <span><b>Approved</b> ${plan.approvedAt?esc(fmtDate(plan.approvedAt)):'Not yet'}</span>
      </div>
      ${plan.problems.map(p=>`<div class="doc-section"><h4>${esc(p.domain? OMAHA_DOMAINS.find(d=>d.id===p.domain)?.name:'')} · ${esc(p.category)} · ${esc(p.problem)}</h4>
        <div class="doc-row"><span class="dl">Knowledge</span><span class="dv">${p.rating.knowledge||'-'}/5 ${esc(OMAHA_RATING.knowledge[p.rating.knowledge]||'')}</span></div>
        <div class="doc-row"><span class="dl">Behaviour</span><span class="dv">${p.rating.behaviour||'-'}/5 ${esc(OMAHA_RATING.behaviour[p.rating.behaviour]||'')}</span></div>
        <div class="doc-row"><span class="dl">Status</span><span class="dv">${p.rating.status||'-'}/5 ${esc(OMAHA_RATING.status[p.rating.status]||'')}</span></div>
        ${plan.interventions.filter(i=>i.problemCode===p.code).map(i=>`<div class="doc-row"><span class="dl">${esc(OMAHA_IX_CATEGORIES[i.category])} · ${esc(i.target)}</span><span class="dv">${esc(i.detail)}${i.frequency?` (${esc(i.frequency)})`:''}</span></div>`).join('')}
      </div>`).join('')}
      <div class="doc-note">Working document. The problem list is an adapted subset of the Omaha System, not the full licensed vocabulary. 
        Approved by ${plan.approvedBy?esc(userName(plan.approvedBy)):'a clinician, not yet recorded'}. Printed from LOMAMO C-DIMS on ${esc(fmtDate(new Date()))}.</div>
    </div>`;
  }
};
/* ---------------- views ---------------- */
function renderCarePlans(user, params={}){
  if(!(RBAC.has(user,'careplan.view')||RBAC.has(user,'careplan.manage')||RBAC.has(user,'patient.view.clinical')))
    return deniedPanel('careplan.view');
  const plans=OMAHAS.plans(user, params);
  const active=plans.filter(p=>p.status==='active').length;
  return pageHead('Care plans (Omaha)','A structured plan per patient: domain, problem, rating and intervention. Adapted from the two reference plans supplied.',
    `<button class="btn btn-sm btn-primary" data-act="new-careplan">${ic('plus',15)} New care plan</button>`)
  + `<div class="grid g4" style="margin-bottom:16px">
      ${kpi('Care plans', num(plans.length),'In your scope','','clipboard')}
      ${kpi('Active', num(active),'Approved','ok','check')}
      ${kpi('Drafts', num(plans.filter(p=>p.status==='draft').length),'Awaiting approval','warn','file')}
      ${kpi('With a PDCA cycle', num(plans.filter(p=>p.pdcaId).length),'Linked to follow-up','','repeat')}
    </div>`
  + card('Care plans', table([
      {label:'Patient',render:p=>`${esc(p.patientName)}<div class="xs muted">${esc(DB.db.patients.find(x=>x.id===p.patientId)?.code||'')}</div>`},
      {label:'Plan',render:p=>`${esc(p.title)}<div class="xs muted">${p.problems.length} problem(s), ${p.interventions.length} intervention(s)</div>`},
      {label:'Template',render:p=>esc(OMAHAS.template(p.templateId)?.name||'Custom')},
      {label:'Status',render:p=>badge(titleCase(p.status),p.status==='active'?'b-ok':'b-warn')},
      {label:'Updated',render:p=>esc(fmtDate(p.updatedAt||p.createdAt))},
      {label:'',cls:'act',render:p=>`<button class="btn btn-xs btn-ghost" data-act="open-careplan" data-id="${p.id}">Open</button>`}
    ], plans, {emptyMsg:'No care plans yet. A plan starts from a template and is edited by a clinician.'}),
    {foot:`<span>${ic('info',13)} The problem list is an adapted subset of the Omaha System. The plan is a LOMAMO working document, not a licensed Omaha product.</span>`});
}

function renderCarePlan(user, params={}){
  const plan=OMAHAS.plan(user,params.id);
  if(!plan) return `<div class="card"><div class="card-b">${emptyState('Care plan not found','It may be outside your scope.','file')}</div></div>`;
  const mayEdit=RBAC.has(user,'careplan.manage');
  const mayApprove=RBAC.has(user,'careplan.approve');
  return pageHead(plan.title, `${plan.patientName} · ${plan.problems.length} problem(s) · version ${plan.version}`,
    `<button class="btn btn-sm btn-ghost" data-act="print-careplan" data-id="${plan.id}">${ic('download',15)} Print</button>
     ${mayApprove&&plan.status==='draft'?`<button class="btn btn-sm btn-primary" data-act="approve-careplan" data-id="${plan.id}">Approve plan</button>`:''}
     ${mayEdit&&plan.status==='active'&&!plan.pdcaId?`<button class="btn btn-sm btn-ghost" data-act="careplan-pdca" data-id="${plan.id}">${ic('repeat',15)} Open PDCA cycle</button>`:''}`)
  + `<div class="grid g2">
      ${card('Status', `<dl class="dl">
        <dt>Patient</dt><dd>${esc(plan.patientName)}</dd>
        <dt>Status</dt><dd>${badge(titleCase(plan.status),plan.status==='active'?'b-ok':'b-warn')}</dd>
        <dt>Created</dt><dd>${esc(userName(plan.createdBy))} · ${esc(fmtDate(plan.createdAt))}</dd>
        <dt>Approved</dt><dd>${plan.approvedBy?esc(userName(plan.approvedBy))+' · '+esc(fmtDate(plan.approvedAt)):'Not yet'}</dd>
        <dt>PDCA</dt><dd>${plan.pdcaId?esc(plan.pdcaId):'Not opened'}</dd>
      </dl>
      <div class="note" style="margin-top:10px">${ic('info',14)}<span>Ratings run from 1 to 5. Knowledge: ${esc(OMAHA_RATING.knowledge[1])} to ${esc(OMAHA_RATING.knowledge[5])}. Status: ${esc(OMAHA_RATING.status[1])} to ${esc(OMAHA_RATING.status[5])}.</span></div>`)}
      ${card('Problems and ratings', plan.problems.map(p=>`<div class="row" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line-2)">
        <div><b class="small">${esc(p.problem)}</b><div class="xs muted">${esc(p.category)} · ${esc(OMAHA_DOMAINS.find(d=>d.id===p.domain)?.name||'')}</div></div>
        <div class="row" style="gap:5px">
          ${['knowledge','behaviour','status'].map(k=>`<span class="chip" title="${esc(k)}">${k[0].toUpperCase()} ${p.rating[k]||'-'}</span>`).join('')}
          ${mayEdit&&plan.status!=='active'?`<button class="btn btn-xs btn-ghost" data-act="rate-careplan" data-id="${plan.id}" data-code="${p.code}">Rate</button>`:''}
        </div></div>`).join(''),
        {foot:mayEdit&&plan.status!=='active'?'<span>Every problem must be rated before the plan can be approved.</span>':''})}
    </div>
  + card('Interventions', table([
      {label:'Problem',render:i=>esc(OMAHAS.problem(i.problemCode)?.problem||i.problemCode)},
      {label:'Category',render:i=>badge(OMAHA_IX_CATEGORIES[i.category]||i.category,'b-neutral')},
      {label:'Target',render:i=>esc(i.target)},
      {label:'Detail',render:i=>esc(i.detail)},
      {label:'Frequency',render:i=>esc(i.frequency||'-')}
    ], plan.interventions, {emptyMsg:'No interventions recorded.'}),
    {foot:'<span>The plan is agreed with the patient. It changes only through an audited edit.</span>'})`;
}
