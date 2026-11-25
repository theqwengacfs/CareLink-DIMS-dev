/* Returning-care assessments & editable PDCA reports.
   Hosted decisions go only through /api/care/command. Offline synthetic
   previews use the identical rules, and can never publish office decisions. */
const CARE_REVIEW = (()=>{
  const R=CARE_RULES, W=CARE_WORKFLOW;
  const statusText=s=>titleCase(String(s||'').replace(/_/g,' '));
  const isoInput=value=>{const d=value?new Date(value):new Date();return isNaN(d)?'':new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
  const toInstant=value=>{const d=new Date(value);return value&&!isNaN(d)?d.toISOString():'';};
  const button=(act,label,attrs='',primary=false)=>`<button type="button" class="btn btn-sm ${primary?'btn-primary':'btn-ghost'}" data-act="${act}" ${attrs}>${label}</button>`;
  const hidden=(k,v)=>`<input type="hidden" name="${k}" value="${esc(v)}">`;
  const token=()=>`care-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}`;
  const sourceFields=()=>`<div class="grid g2">${field('Medical document date','sourceDate','date',{required:true})}${field('Hospital / medical facility','facility','text',{required:true})}</div>${field('New medical document reference / physical file location','reference','text',{required:true,hint:'Cite an actual hospital or medical document. A reference is not a digitally stored scan.'})}`;
  const sourcePayload=d=>({sourceDate:d.get('sourceDate'),facility:d.get('facility'),reference:d.get('reference')});
  const scoped=(user,id)=>(DB.db.patients||[]).find(p=>p.id===id&&W.canSee(user,p))||null;
  const synthetic=()=>!!DB.db?.meta&&(DB.db.meta.demoMode||DB.db.meta.demoSeeded||/synthetic|demonstration/i.test(DB.db.meta.label||''))&&
    (DB.db.patients||[]).every(p=>p.demo===true||p.synthetic===true);
  function localCommand(user,command,payload){
    if(SYNC.sessionToken||!synthetic())return {ok:false,msg:'This clinical decision requires a live, authorized office session. Offline forms do not enrol or authorize sharing.'};
    const r=W.run(DB.db,user,command,payload);
    if(r.ok){W.apply(DB.db,r.patches);AUDIT.append({actor:user.id,action:r.event,entity:'patient',entityId:payload.patientId,detail:'Synthetic preview clinical decision; no live enrolment or transmission.'});DB.save();}
    return r;
  }
  async function command(name,payload,requestId,kind='clinical'){
    if(!SYNC.sessionToken){
      if(kind!=='devotion')return localCommand(AUTH.user,name,payload);
      if(!synthetic())return {ok:false,msg:'This staff action requires a live authorized session.'};
      const result=DEVOTION_RULES.run(DB.db,AUTH.user,name,payload);
      if(result.ok){DEVOTION_RULES.apply(DB.db,result.patches);DB.save();}
      return result;
    }
    if(SYNC._clinicalBusy||SYNC._pulling||SYNC._ticking)return {ok:false,msg:'The shared source is updating. Keep this form open and retry in a moment.'};
    // Reserve before the first await: two clicks, a manual refresh, or a
    // polling tick must not slip into the preflight-save / command gap.
    SYNC._clinicalBusy=true;
    try{
      if(SYNC.heldOutbox())return {ok:false,msg:'Work is held in this account’s outbox. Reconnect and confirm it before an office decision; it has not been discarded.'};
      await SYNC.push({clinicalPreflight:true});
      if(SYNC._inflight||SYNC.kvBlocked()||SYNC.patches().length||SYNC.heldOutbox())return {ok:false,msg:'Pending work has not been confirmed by the shared source. Reconnect / resolve it before an office decision; this form is still open.'};
      const previousRev=SYNC.rev;
      const r=await SYNC._json(kind==='devotion'?'api/devotions/command':'api/care/command',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({command:name,payload,requestId:requestId||token()})});
      if(!r?.ok)return {ok:false,msg:r?.body?.error||'The clinical save was not confirmed. Keep the form open and retry with the same values.',code:r?.body?.code};
      SYNC.applyCommandPatches(r.body.patches||[]);
      // A concurrent client's intervening revisions must still be read. Do
      // not skip the delta range just because our own command returned a rev.
      // A receipt-only replay contains no state. Even a one-revision gap
      // must be polled, otherwise the saved decision would never appear here.
      if(!r.body.duplicate&&r.body.rev===previousRev+1){SYNC.rev=r.body.rev;DB.db.meta.serverRev=r.body.rev;}
      SYNC.saved=r.body.saved;APPX.dirty=SYNC.patches().length>0;
      if(typeof DB.persistState==='function')DB.persistState();
      SYNC.state='connected';SYNC.message=kind==='devotion'?'Devotion action confirmed by the shared source':'Clinical decision confirmed by the shared source';SYNC.bump();
      if(r.body.duplicate)SYNC.pendingRemote=true;
      return {ok:true,rec:r.body.rec,duplicate:r.body.duplicate,msg:r.body.duplicate?'This action was already saved. Refresh the record.':kind==='devotion'?'Devotion record saved.':'Clinical record and revision saved.'};
    }catch(e){return {ok:false,msg:'The online save is unconfirmed. No local approval was created. Keep the form open, reconnect and retry; do not start a second assessment.'};}
    finally{SYNC._clinicalBusy=false;}
  }
  function flag(p,at=new Date().toISOString()){
    const c=R.classify(p,at,DB.db);
    const kind=p?.assessmentKind&&p.status!=='discharged'?p.assessmentKind:c.kind;
    const labels={new:'New / fresh',repeat:'Repeat · within 12 months',returning:'Returning · after 12 months',history_review:'Discharge history needs review'};
    return `<span class="care-kind care-kind-${esc(kind)}">${esc(labels[kind]||c.label)}</span>`;
  }
  function planFields(p,required=true){return `${field('Identified support need','needs','textarea',{required})}
    ${field('Agreed measurable objective','objectives','textarea',{required})}${field('Planned interventions','interventions','textarea',{required})}
    ${field('Expected duration (days)','expectedDays','number',{required})}${field('Rationale for this duration','rationale','textarea',{required})}
    ${hidden('responsible',p.caregiverId||'')}`;}
  function history(user,p,{priorOnly=false}={}){
    if(!W.canSee(user,p))return '';
    let cycles=(DB.db.careCycles||[]).filter(c=>c.patientId===p.id);
    if(!cycles.some(c=>c.id===R.cycleId(p))&&R.supported(p))cycles=cycles.concat([{id:R.cycleId(p),startedAt:R.cycleStart(p),
      dischargedAt:R.lastDischarge(p,DB.db),status:p.status==='discharged'?'discharged':'active',legacy:true,snapshot:W.snapshot(p)}]);
    if(priorOnly&&p.status!=='discharged')cycles=cycles.filter(c=>c.id!==R.cycleId(p));
    const linked=(name,cycle)=>(DB.db[name]||[]).filter(r=>r.patientId===p.id&&R.recordCycle(r,p,DB.db)===cycle.id);
    const html=cycles.sort((a,b)=>String(b.startedAt).localeCompare(String(a.startedAt))).map(c=>{
      const s=c.snapshot||{},visits=linked('visits',c),support=linked('support',c).concat(linked('supportIssues',c));
      const reviews=linked('careReviews',c),legacy=linked('pdcas',c);
      return `<details class="care-history-cycle" ${p.status==='discharged'?'open':''}><summary><b>${esc(c.startedAt||'Undated support cycle')} → ${esc(c.dischargedAt||'Ongoing')}</b> · ${esc(c.status)} ${c.legacy?'<span class="xs">(legacy history — not a new approval)</span>':''}</summary>
        <dl class="dl"><dt>Support need / plan</dt><dd>${esc(s.carePlan?.needs||'Not recorded')}</dd><dt>Interventions</dt><dd>${esc(s.carePlan?.interventions||'Not recorded')}</dd>
        <dt>Previous chief complaints</dt><dd>${esc(s.clinical?.chiefComplaints||s.clinical?.symptoms||'Not recorded')}</dd><dt>Recorded diagnosis</dt><dd>${esc(s.clinical?.diagnosis||'Not recorded')}</dd>
        <dt>Summary notes</dt><dd class="care-pre">${esc(s.summaryNotes||s.dischargeEvidence||'Not recorded')}</dd><dt>Discharge summary</dt><dd class="care-pre">${esc(s.dischargeSummary?.summary||s.dischargeSummary?.note||s.dischargeProtocol?.otherProgramsDetail||'No narrative recorded')}</dd></dl>
        <h4>Recorded support (${support.length}) & home / clinical visits (${visits.length})</h4>
        ${support.map(r=>`<p class="small">${esc(r.date||r.issuedAt||'Date not recorded')} · ${esc(r.type||r.item||r.kind||'Support')} · ${esc(r.note||r.notes||r.detail||'')}${r.amount!=null?' · '+esc(money(r.amount)):''}</p>`).join('')||'<p class="muted small">No itemized support recorded for this cycle.</p>'}
        <details><summary>Caregiver-recorded care / clinical notes</summary>${visits.map(v=>`<p class="small care-pre">${esc(v.date)} · ${esc(userName(v.by||v.caregiverId))}\n${esc(v.notes||v.summary||'No note recorded')}</p>`).join('')||'<p class="small muted">No visit notes recorded.</p>'}</details>
        <h4>Prior PDCAs / revisions</h4>${reviews.map(r=>button('care-review-open',`PDCA ${r.dueDay?'day '+r.dueDay:'on demand'} · ${statusText(r.status)}`,`data-id="${esc(r.id)}"`)).join('')}
        ${legacy.map(r=>`<details class="small"><summary>Legacy ${esc(r.kind||'PDCA')} · ${esc(r.due||r.createdAt||'Undated')} · ${esc(r.plan||r.title||'')}</summary><p class="care-pre">${esc([r.planNote,r.note,r.doNote,r.checkNote,r.actNote,r.reviewComment].filter(Boolean).join('\n')||'No narrative recorded')}</p><p class="xs muted">Retained historical entry. It does not assert completion of the new MCM authorization chain.</p></details>`).join('')}
        ${!reviews.length&&!legacy.length?'<p class="small muted">No PDCA recorded for this cycle.</p>':''}
      </details>`;
    }).join('');
    const referrals=(DB.db.careReferrals||[]).filter(r=>r.patientId===p.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
    return card('Support-cycle history & reassessment reports',`${html||'<p class="muted">No previous supported cycle recorded.</p>'}
      ${referrals.map(r=>`<div class="care-referral-row">${flag({...p,status:'active',assessmentKind:r.kind})}<span>${esc(fmtDateTime(r.evaluatedAt))} · ${esc(statusText(r.status))}</span>${button('care-referral-open','Open assessment report',`data-id="${esc(r.id)}"`)}</div>`).join('')}`,
      {sub:'One patient identity. Every support cycle, prior PDCA, summary and office decision is retained.'});
  }
  function panel(user,p){
    if(!W.canSee(user,p))return note('The care-review history is restricted to the authorized clinical team.');
    const rows=(DB.db.careReviews||[]).filter(r=>r.patientId===p.id&&r.cycleId===R.cycleId(p)).sort((a,b)=>b.evaluatedAt.localeCompare(a.evaluatedAt));
    const plan=p.carePlan,admissions=(DB.db.programAdmissions||[]).filter(a=>a.patientId===p.id&&a.confirmedBy);
    const sched=PDCAX.schedule(p);
    return `<div class="alert info"><div><b>Editable PDCA · supplied three-page format</b><p class="small">An on-demand report can be recorded at any evaluation or home visit. Scheduled milestones stay at days ${R.REVIEW_DAYS.join(', ')}. Actual evaluation date and time are separate from the due date. Blank findings are never invented.</p>
      <p class="small">Below 120 days: caregiver / ministry-area coordinator prepares; county MCM reviews before scheduling / Beneficiary Archive. All 120+ reports: MCM comments → caregiver re-edit → resubmit → MCM authorization → international sharing. MCM prepares when foundation-supported hospitalization is recorded, including past admissions.</p></div></div>
      <div class="row care-toolbar">${R.supported(p)&&p.status!=='discharged'?button('care-review-new','On-demand evaluation',`data-patient="${esc(p.id)}"`,true):''}${p.status==='discharged'?button('care-assess-return','Assess for support again',`data-id="${esc(p.id)}"`,true):''}
        ${user.roleId==='mcm'?button('care-admission','Confirm supported hospitalization',`data-patient="${esc(p.id)}"`):''}</div>
      ${card('Current cycle care plan',plan?`<dl class="dl"><dt>Need</dt><dd>${esc(plan.needs)}</dd><dt>Objective</dt><dd>${esc(plan.objectives)}</dd><dt>Interventions</dt><dd>${esc(plan.interventions)}</dd><dt>Expected days / rationale</dt><dd>${esc(plan.expectedDays)} · ${esc(plan.rationale)}</dd></dl>`:'No MCM office enrollment / care plan recorded.')}
      ${card('Foundation-supported hospitalization history',admissions.map(a=>`<p class="small">${esc(a.admittedAt)} → ${esc(a.dischargedAt||'No hospital discharge date recorded')} · ${esc(a.supportReference)} · confirmed ${esc(userName(a.confirmedBy))}, ${esc(fmtDateTime(a.confirmedAt))}</p>`).join('')||'<p class="muted small">No MCM-confirmed foundation-supported admission recorded. An inpatient form alone is not proof of foundation support. MCM checks this history at the 120+ review.</p>')}
      ${card('Scheduled reviews · current support cycle',table([
        {label:'Milestone / due',render:r=>`<b>Day ${r.day}</b><div class="small">${esc(fmtDate(r.due))}</div>`},
        {label:'Review state',render:r=>esc(r.workflowStatus?statusText(r.workflowStatus):statusText(r.status))},
        {label:'Actual evaluation',render:r=>r.recordId?esc(fmtDateTime(rows.find(x=>x.id===r.recordId)?.evaluatedAt)):'Not recorded'},
        {label:'',render:r=>r.recordId?button('care-review-open','Open report',`data-id="${esc(r.recordId)}"`):p.status!=='discharged'?button('care-review-new','Prepare',`data-patient="${esc(p.id)}" data-day="${r.day}"`):''}
      ],sched,{emptyMsg:'The fixed schedule begins only after MCM office enrollment.'}))}
      ${card('Current-cycle PDCAs & Beneficiary Archive',table([
        {label:'Evaluation',render:r=>`<b>${esc(fmtDateTime(r.evaluatedAt))}</b><div class="xs">${r.dueDay?'Scheduled day '+r.dueDay:'On demand'} · actual programme day ${r.programmeDay}</div>`},
        {label:'Status',render:r=>esc(statusText(r.status))},{label:'Revision',render:r=>'v'+r.version},
        {label:'',render:r=>button('care-review-open','Open / revisions',`data-id="${esc(r.id)}"`)}
      ],rows,{emptyMsg:'No report recorded in this cycle. Prior-cycle reviews remain below.'}))}${history(user,p,{priorOnly:true})}`;
  }
  function initialFields(p){const c=p.clinical||{};return R.cleanFields({patientName:p.name,caregiverName:userById(p.caregiverId)?.name||'',ministryArea:areaName(p.areaId),
    intakeDate:R.cycleStart(p),age:p.age??'',children:p.childrenCount??p.household?.children??'',maritalStatus:p.maritalStatus||p.household?.maritalStatus||'',
    education:p.education||p.household?.education||'',occupation:p.occupation||p.household?.occupation||'',assessmentDate:R.date(p.assessmentDate||p.assessedAt)||'',
    heightCm:c.heightCm??'',intakeWeightKg:p.baselineWeightKg??c.baselineWeightKg??'',currentWeightKg:c.weightKg??'',intakeBmi:c.baselineBmi??'',currentBmi:c.bmi??'',
    diagnoses:c.diagnosis||'',symptoms:c.chiefComplaints||''});}
  function editor(patientId,reportId='',dueDay=null){
    const p=scoped(AUTH.user,patientId);if(!p)return toast('Not available','Outside your clinical scope.','err');
    const r=reportId?(DB.db.careReviews||[]).find(x=>x.id===reportId&&x.patientId===p.id):null;
    const correcting=r&&['corrections_requested','correcting'].includes(r.status);
    const permitted=r?correcting?(r.policyDays>=120?AUTH.user.roleId==='caregiver':['caregiver','coordinator'].includes(AUTH.user.roleId)):W.writer(AUTH.user,p,r,DB.db):W.writer(AUTH.user,p,{dueDay,evaluatedAt:new Date().toISOString()},DB.db);
    if(!permitted)return toast('Required preparer','The caregiver / coordinator prepares non-admission cases. The MCM prepares 120+ reports where foundation-supported hospitalization has occurred. Caregiver corrections are a separate step.','warn');
    const values=r?.fields||initialFields(p);
    const policyDays=correcting?Number(r.policyDays):R.reportDays(p,r||{dueDay,evaluatedAt:new Date().toISOString()},DB.db);
    const normal=policyDays<120;
    const renderFields=section=>{
      const visible=section.fields.filter(([key])=>!normal||!R.EXTENSION_FIELDS.includes(key));
      const kept=section.fields.filter(([key])=>normal&&R.EXTENSION_FIELDS.includes(key)).map(([key])=>hidden(key,values[key]||'')).join('');
      const title=normal&&section.title==='Justification & discharge'?'Estimated discharge':section.title;
      return kept+`<fieldset class="care-editor-section"><legend>${esc(title)}</legend>${visible.map(([key,label,type,required])=>field(label,key,type||'text',{value:values[key]??'',required:!!required,hint:type==='textarea'?'Record documented findings; enter not assessed or not applicable explicitly. Maximum 4,000 characters per field; longer text is refused, never silently shortened.':''})).join('')}</fieldset>`;
    };
    openModal({title:correcting?'Caregiver corrections · PDCA':'Editable PDCA evaluation',sub:p.code+' · '+(r?.dueDay||dueDay?'Scheduled day '+(r?.dueDay||dueDay):'On demand'),wide:true,
      body:`<form id="careEditorForm">${hidden('patientId',p.id)}${hidden('id',r?.id||'')}${hidden('version',r?.version||'')}${hidden('dueDay',r?.dueDay??dueDay??'')}${hidden('requestId',token())}
      <p class="small">Values copied below are recorded source values, not new findings. Check them at this evaluation. Nothing is inferred from a diagnosis, age, prior visit or demonstration default.</p>
      ${normal?'<p class="small">Normal PDCA: extended-stay justification is not requested. If this draft reaches day 120 before submission, reopen it to complete the extended-stay section. Any previously saved information is retained.</p>':''}
      ${r?.reviewComment?`<div class="alert warn"><div><b>MCM comments</b><p class="care-pre">${esc(r.reviewComment)}</p></div></div>`:''}
      <details class="care-history-cycle"><summary>Caregiver / ministry-area review prompts</summary>
        <p class="small">A fixed, local checklist to support your own thinking; it is not trained on MCM records, does not interpret the patient's details, and is not an MCM review or clinical advice. It does not change or save any field. Discuss clinical questions with the MCM.</p>
        <ul class="small"><li>Have you described the patient's own priorities, circumstances and specific challenges in their own context?</li>
          <li>For each selected action, what exactly will be done, by whom, when, for how long, and how will progress be checked?</li>
          <li>If education or counselling is planned, which individual topics and practical follow-up are relevant to this patient?</li>
          <li>Where relevant, have you specified the details of SHA, nutrition, medication adherence, hygiene, transport, referral, psychosocial or spiritual support, prayers, net or Bible? Include only what is agreed and appropriate.</li>
          <li>Are any unknowns or evidence gaps clearly identified for the MCM, without guessing or changing the household's account?</li></ul>
      </details>
      ${correcting?hidden('evaluatedAt',isoInput(r.evaluatedAt))+'<p>Original actual evaluation: '+esc(fmtDateTime(r.evaluatedAt))+'. Corrections retain that evaluation; create an on-demand report for a new evaluation.</p>':field('Actual evaluation date & time','evaluatedAt','datetime-local',{value:isoInput(r?.evaluatedAt),required:true,hint:'Your device timezone; stored as an absolute timestamp. Programme days use Africa/Nairobi. The scheduled due date never changes.'})}
      <div class="care-editor-grid"><div>${renderFields(R.SECTIONS[0])}</div><div>${R.SECTIONS.slice(1).map(renderFields).join('')}</div></div>
      ${correcting?field('Corrections made in response to MCM comments','correctionNote','textarea',{required:true,value:r.correctionNote||''}):''}</form>`,
      footer:`${button('close-modal','Cancel')}${button('care-review-save','Save retained revision','',true)}`});
  }
  function data(patientOrId,userOrOpts={},modeArg){
    const p=typeof patientOrId==='object'?patientOrId:(DB.db.patients||[]).find(x=>x.id===patientOrId);
    const user=userOrOpts?.roleId?userOrOpts:(userOrOpts?.user||AUTH.user);
    if(!p||!W.canSee(user,p))return null;
    const opts=userOrOpts?.roleId?{}:userOrOpts||{};
    const requestedMode=modeArg||opts.mode||'auto';
    const mode=requestedMode==='auto'?(['discharged','discharge_recommended'].includes(p.status)?'discharge':'120day'):requestedMode;
    const records=(DB.db.careReviews||[]).filter(r=>r.patientId===p.id&&r.cycleId===R.cycleId(p)).sort((a,b)=>b.evaluatedAt.localeCompare(a.evaluatedAt));
    const report=opts.reviewId?records.find(r=>r.id===opts.reviewId):records[0];
    const fields=report?.fields||initialFields(p);
    const title=mode==='discharge'?'Patient PDCA Discharge Summary Report':!report?'Patient PDCA — Blank Template':Number(report.policyDays)>=180?'Patient PDCA 180-Day Report':Number(report.policyDays)>=120?'Patient PDCA 120-Day Report':'Patient PDCA Review Report';
    return {careTemplate:true,patientId:p.id,patient_code:p.code||p.id,patient_name:fields.patientName,mode,report_title:title,
      report:report||null,fields,cycleId:R.cycleId(p),status:report?.status||'blank_template',evaluatedAt:report?.evaluatedAt||'',
      programmeDay:report?.programmeDay??'',dueDate:report?.dueDate||'',dueDay:report?.dueDay??null,
      aim:fields.aimOutcome,diagnoses:fields.diagnoses?[fields.diagnoses]:[],challenges:fields.plan?[fields.plan]:[],interventions:fields.actions?[fields.actions]:[],
      treatments:fields.treatment?[fields.treatment]:[],check_findings:fields.resolvedSymptoms?[fields.resolvedSymptoms]:[],act_actions:fields.nextSteps?[fields.nextSteps]:[],
      dischargeDate:mode==='discharge'?R.date(p.dischargedAt||p.discharge):'',dischargeProtocol:mode==='discharge'?p.dischargeProtocol||{}:null};
  }
  // Two balanced spreads retain the supplied template fields and reading order.
  // Text can flow beyond a page when needed; it is never clipped to force fit.
  function pageContent(d){
    const f=d.fields||{},v=k=>f[k]||'Not recorded';
    const block=(title,keys,cls='')=>`<section class="care-template-block ${cls}"><h3>${esc(title)}</h3>${keys.map(k=>`<p class="care-pre"><b>${esc(R.FIELDS.find(([key])=>key===k)?.[1]||k)}:</b><br>${esc(v(k))}</p>`).join('')}</section>`;
    const left=`<h3>PATIENT DATA / CAREGIVER DATA</h3><dl>${R.SECTIONS[0].fields.map(([k,label])=>`<dt>${esc(label)}</dt><dd>${esc(v(k))}</dd>`).join('')}<dt>Actual evaluation date & time</dt><dd>${esc(d.evaluatedAt?fmtDateTime(d.evaluatedAt)+' · '+d.evaluatedAt:'Not recorded')}</dd><dt>Days in program at evaluation</dt><dd>${esc(d.programmeDay??'Not recorded')}</dd><dt>Scheduled due date (not evaluation)</dt><dd>${esc(d.dueDate||'On-demand / no scheduled milestone')}</dd></dl>`;
    const right1=block('Aim (SMART)',['aimDate','aimOutcome','aimFunction'])+block('Diagnosis',['diagnoses'],'cdims-stage-dx')+block('Major symptoms WITH durations',['symptoms'])+block('PLAN (Challenges)',['plan'],'cdims-stage-p')+block('DO — actions, monitoring, additional support',['actions'],'cdims-stage-d');
    const right2=block('Treatment & indications',['treatment','procedures','educationCounselling'],'cdims-stage-rx')+block('CHECK (Based on DO)',['resolvedSymptoms','newComplaints','adherence','anthropometry','actionStatus'],'cdims-stage-c');
    const days=d.report?.policyDays;
    const extended=days==null||!Number.isFinite(Number(days))||Number(days)>=120;
    const retained=!extended&&R.EXTENSION_FIELDS.some(k=>String(f[k]||'').trim());
    const extension=extended?block('JUSTIFICATION',['clinicalReasons','labsStatus','recoveryNeeds'])+block('JUSTIFICATION (continued) — external delays',['externalDelays']):
      retained?block('Previously recorded extended-stay information (retained)',['clinicalReasons','labsStatus','recoveryNeeds','externalDelays']):'';
    const right3=block('ACT (Based on CHECK) — next steps & durations',['nextSteps'],'cdims-stage-a')+extension+block('ESTIMATED DATE OF DISCHARGE',['estimatedDischargeDate']);
    return [[left,right1],[right2,right3]];
  }
  function template(d){
    if(!d)return note('No authorized clinical record is available.');
    const r=d.report||{},f=d.fields||{},provenance=d.outputProvenance||reportProvenance();
    return `<article class="care-template" id="dischargeSummaryPrint" data-review="${esc(r.id||'blank')}">
      ${pageContent(d).map(([left,right],i)=>`<section class="care-template-page"><header><div class="care-letterhead">${window.LOGO?`<img src="${esc(window.LOGO)}" alt="LOMAMO Foundation Kenya logo">`:''}<div><b>LOMAMO Foundation Kenya</b><br><span>CareLink · Clinical quality &amp; continuity of care</span></div></div><span>CONFIDENTIAL CLINICAL DOCUMENT · SPREAD ${i+1} / 2</span><h2>${esc(d.report_title)}<br><small>${esc(f.ministryArea||'Ministry area not recorded')} MINISTRY AREA</small></h2><p>${esc(d.patient_code)} · ${esc(statusText(d.status))} · revision ${r.version||0}${!r.id?' · BLANK TEMPLATE — NOT A COMPLETED CLINICAL REPORT':''}</p></header><div class="care-cycle-guide" aria-label="PDCA cycle"><span>01 PLAN</span><span>02 DO</span><span>03 CHECK</span><span>04 ACT</span></div><div class="care-template-columns"><div>${left}</div><div>${right}</div></div>
      <footer>${reportProvenanceHTML(provenance)}Confidential clinical record · cycle ${esc(d.cycleId)} · ${esc(r.id||'No saved evaluation')}<br>Prepared: ${esc(r.preparedBy?userName(r.preparedBy):'Not recorded')} · MCM reviewed: ${esc(r.reviewedAt?fmtDateTime(r.reviewedAt):'Not recorded')} · Sharing authorization: ${esc(r.authorizedAt?fmtDateTime(r.authorizedAt):'Not authorized')}</footer></section>`).join('')}
      ${d.mode==='discharge'?`<section class="care-physical-signatures"><h3>PATIENT ACKNOWLEDGEMENT &amp; PHYSICAL SIGNATURES — discharge acknowledgement</h3><p>Obtain signatures on paper. Electronic approval and typed names do not replace physical signatures; this printout does not prove signatures or consent.</p><p>Patient / Guardian signature · date: _________________________________</p><p>Caregiver signature · date: _________________________________________</p><p>MCM signature · date: ______________________________________________</p><p>Witness signature · date: ___________________________________________</p><p>CONFIRMED DATE OF DISCHARGE: ${esc(d.dischargeDate||'Not recorded')}</p></section>`:''}</article>`;
  }
  function reportData(r,p){return {careTemplate:true,patientId:p?.id||r.patientId,patient_code:p?.code||r.patientCode||r.patientId,fields:r.fields,report:r,
    cycleId:r.cycleId,status:r.status,programmeDay:r.programmeDay??r.policyDays,evaluatedAt:r.evaluatedAt,dueDay:r.dueDay,dueDate:r.dueDate,mode:'120day',report_title:Number(r.policyDays)>=180?'Patient PDCA 180-Day Report':Number(r.policyDays)>=120?'Patient PDCA 120-Day Report':'Patient PDCA Review Report'};}
  function openReport(id,revisionId=''){
    const r=(DB.db.careReviews||[]).find(x=>x.id===id),p=r&&scoped(AUTH.user,r.patientId);
    if(!r||!p)return toast('Not available','Outside your clinical scope.','err');
    const revisions=(DB.db.careReviewRevisions||[]).filter(v=>v.reviewId===r.id).sort((a,b)=>b.version-a.version);
    const selected=revisionId?revisions.find(v=>v.id===revisionId):null;
    const currentCycle=r.cycleId===R.cycleId(p),mcm=AUTH.user.roleId==='mcm',cg=AUTH.user.roleId==='caregiver';
    const attrs=`data-id="${esc(r.id)}"`;
    let controls='';
    if(!selected&&currentCycle){
      if(r.status==='draft'&&W.writer(AUTH.user,p,r,DB.db))controls+=button('care-review-edit','Edit draft',attrs,true)+button('care-review-step','Submit to county MCM',attrs+' data-command="submit_review"');
      if(['corrections_requested','correcting'].includes(r.status)&&(r.policyDays>=120?cg:['caregiver','coordinator'].includes(AUTH.user.roleId)))controls+=button('care-review-edit','Re-edit caregiver corrections',attrs,true)+(r.status==='correcting'?button('care-review-step','Resubmit to MCM',attrs+' data-command="resubmit_review"'):'');
      if(['submitted','resubmitted'].includes(r.status)&&mcm)controls+=button('care-review-step','MCM review & comments',attrs+' data-command="review_report"',true);
      if(mcm&&((r.status==='resubmitted'&&r.policyDays>=120)||(r.status==='reviewed'&&r.policyDays<120)))controls+=button('care-review-step','Authorize international sharing',attrs+' data-command="authorize_review"',true);
      if(r.status==='authorized'&&(mcm||(cg&&p.caregiverId===AUTH.user.id)))controls+=button('care-review-step','Share authorized revision',attrs+' data-command="share_review"',true);
      if(r.policyDays<120&&r.status==='reviewed'&&['mcm','caregiver','coordinator'].includes(AUTH.user.roleId))controls+=button('care-review-step','Schedule reviewed follow-up',attrs+' data-command="schedule_review"');
      if((r.policyDays<120&&['reviewed','scheduled','shared'].includes(r.status)||r.policyDays>=120&&r.status==='shared')&&['mcm','caregiver','coordinator'].includes(AUTH.user.roleId))controls+=button('care-review-step','Mark for Beneficiary Archive',attrs+' data-command="archive_review"');
    }
    const d=reportData(selected?{...(selected.reportSnapshot||selected),fields:selected.fields,id:r.id}:r,p);
    const shared=(DB.db.intlPdcaDossiers||[]).filter(x=>x.reviewId===r.id&&x.sharedAt&&x.authorizedRevisionId);
    openModal({title:`PDCA · ${p.code} · ${statusText(selected?.status||r.status)}`,wide:true,
      body:`<div class="row care-toolbar">${controls}${shared.map(x=>button('care-dossier-open',`International discussion (${(x.comments||[]).length})`,`data-id="${esc(x.id)}"`)).join('')}</div>${r.reviewComment?`<div class="alert info"><div><b>MCM review comments</b><p class="care-pre">${esc(r.reviewComment)}</p></div></div>`:''}
      <details class="care-history-cycle"><summary>Retained revisions & decision history (${revisions.length})</summary>${revisions.map((v,i)=>{
        const prior=revisions[i+1],changes=prior?R.FIELDS.filter(([k])=>prior.fields[k]!==v.fields[k]).map(([,label])=>label):[];
        return `<p class="small">v${v.version} · ${esc(statusText(v.event))} · ${esc(userName(v.by))} · ${esc(fmtDateTime(v.at))}<br><span class="care-pre">${esc(v.comment||'')}</span>${changes.length?'<br>Edited: '+esc(changes.join(', ')):''} ${button('care-review-version','View exact revision',attrs+` data-revision="${esc(v.id)}"`)}</p>`;
      }).join('')}</details>${template(d)}`,
      footer:`${button('close-modal','Close')}${selected?button('care-review-open','Latest version',attrs):''}${button('care-review-print','Print / save PDF',attrs+(selected?` data-revision="${esc(selected.id)}"`:''))}${button('care-review-docx','Word (.docx)',attrs+(selected?` data-revision="${esc(selected.id)}"`:''))}`});
  }
  function patientSheet(patientId,user,opts={}){
    const p=scoped(user,patientId);if(!p)return note('Clinical report unavailable in this account scope.');
    const d=data(p,{...opts,user},opts.mode);
    const ref=p.dischargeReferral;
    const appendix=ref?`<section class="care-history-cycle"><h3>Patient Programme Discharge Summary · recorded continuing-care plan</h3><dl class="dl"><dt>Clinic / facility</dt><dd>${esc(ref.clinic||'Not recorded')} · ${esc(ref.facility||'Not recorded')}</dd><dt>Appointment</dt><dd>${esc(ref.appointmentDate||'Not recorded')}</dd><dt>Receiving contact</dt><dd>${esc(ref.receivingContact||'Not recorded')}</dd><dt>Instructions</dt><dd>${esc(ref.instructions||'Not recorded')}</dd></dl></section>`:'';
    return `<div class="row care-toolbar">${button('patient-tab','Open editable reports & history',`data-id="${esc(p.id)}" data-tab="pdca"`,true)}</div>${template(d)}${appendix}`;
  }
  function wordBytes(d){
    const p=text=>DOCX.para(text),section=(label,keys)=>DOCX.para(label,'Heading2')+keys.map(k=>p((R.FIELDS.find(([key])=>key===k)?.[1]||k)+': '+(d.fields[k]||'Not recorded'))).join('');
    const days=d.report?.policyDays;
    const extended=days==null||!Number.isFinite(Number(days))||Number(days)>=120;
    const retained=!extended&&R.EXTENSION_FIELDS.some(k=>String(d.fields[k]||'').trim());
    const extension=extended?section('JUSTIFICATION',['clinicalReasons','labsStatus','recoveryNeeds'])+section('JUSTIFICATION (continued)',['externalDelays']):
      retained?section('Previously recorded extended-stay information (retained)',R.EXTENSION_FIELDS):'';
    const right=[section('Aim (SMART)',['aimDate','aimOutcome','aimFunction'])+section('Diagnosis',['diagnoses'])+section('Major symptoms WITH durations',['symptoms'])+section('PLAN (Challenges)',['plan'])+section('DO — actions / monitoring',['actions']),
      section('Treatment AND indications',['treatment','procedures','educationCounselling'])+section('CHECK (Based on DO)',['resolvedSymptoms','newComplaints','adherence','anthropometry','actionStatus']),
      section('ACT — next steps AND durations',['nextSteps'])+extension,
      section('Estimated date of discharge',['estimatedDischargeDate'])];
    const left=R.SECTIONS[0].fields.map(([k,label])=>p(label+': '+(d.fields[k]||'Not recorded'))).join('')+p('Actual evaluation: '+(d.evaluatedAt||'Not recorded'))+p('Programme day: '+(d.programmeDay??'Not recorded'))+p('Scheduled due: '+(d.dueDate||'On demand'));
    const cell=xml=>`<w:tc><w:tcPr><w:tcW w:w="4500" w:type="dxa"/></w:tcPr>${xml||p('')}</w:tc>`;
    const balanced=[{left,right:right[0]},{left:right[1],right:right.slice(2).join('')}];
    const logo=DOCX.logoBytes();
    const letterhead=i=>(logo?DOCX.logoDrawing(i+1):'')+DOCX.para('LOMAMO FOUNDATION KENYA','Heading1')+p('CareLink · Clinical quality & continuity of care')+p('CONFIDENTIAL CLINICAL DOCUMENT  |  PLAN · DO · CHECK · ACT');
    const body=balanced.map((col,i)=>(i?'<w:p><w:r><w:br w:type="page"/></w:r></w:p>':'')+letterhead(i)+DOCX.para(d.report_title,'Title')+p(`${d.fields.ministryArea||'Ministry area not recorded'} MINISTRY AREA · ${d.patient_code} · ${statusText(d.status)} · v${d.report?.version||0}`)+
      `<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="4500"/><w:gridCol w:w="4500"/></w:tblGrid><w:tr>${cell(col.left)}${cell(col.right)}</w:tr></w:tbl>`+p(`Confidential clinical record · cycle ${d.cycleId} · ${i+1} | Page`)).join('');
    const r=d.report||{},attribution=p(reportProvenanceText(d.outputProvenance||reportProvenance()))+p(`Prepared by: ${r.preparedBy||'Not recorded'} · MCM reviewed: ${r.reviewedBy||'Not recorded'} at ${r.reviewedAt||'Not recorded'}`)+
      p(`Sharing authorization: ${r.authorizedBy||'Not authorized'} at ${r.authorizedAt||'Not authorized'} · revision ${r.authorizedRevisionId||'Not recorded'}`);
    const signatures=d.mode==='discharge'?'<w:p><w:r><w:br w:type="page"/></w:r></w:p>'+DOCX.para('Patient acknowledgement & physical signatures','Heading1')+
      p('Obtain signatures on paper. Typed names and electronic approval do not prove physical signatures or consent.')+
      ['Patient / Guardian','Caregiver','MCM','Witness'].map(who=>p(who+' signature and date: _____________________________')).join('')+p('Confirmed discharge date: '+(d.dischargeDate||'Not recorded')):'';
    const documentXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}${attribution}${signatures}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="900" w:bottom="900" w:left="900" w:right="900"/></w:sectPr></w:body></w:document>`;
    return DOCX.packageDocument(documentXml,logo);
  }
  function output(d,format){
    if(!d)return toast('Not available','No scoped report selected.','err');
    d={...d,outputProvenance:reportProvenance()};
    if(format==='docx')return downloadBytes(`CareLink-PDCA-${String(d.patient_code).replace(/[^A-Za-z0-9_-]/g,'_')}-v${d.report?.version||0}.docx`,wordBytes(d),'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    if(format==='json')return downloadBytes('CareLink-PDCA-fields.json',UTF8.encode(JSON.stringify(d,null,2)),'application/json');
    const w=window.open('','_blank','width=940,height=920');if(!w)return toast('Allow print window','Your browser blocked the report window.','warn');
    const css=Array.from(document.querySelectorAll('style')).map(s=>s.textContent).join('\n');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Confidential PDCA</title><style>${css}</style></head><body class="care-print-document">${reportProvenanceHTML(d.outputProvenance,'Print requested')}${template(d)}</body></html>`);w.document.close();
    setTimeout(()=>{w.focus();w.print();},150);
  }
  function outputReport(id,revision,format){
    const r=(DB.db.careReviews||[]).find(x=>x.id===id),p=r&&scoped(AUTH.user,r.patientId);if(!r||!p)return;
    const v=revision?(DB.db.careReviewRevisions||[]).find(v=>v.id===revision&&v.reviewId===r.id):null;
    if(revision&&!v)return;
    return output(reportData(v?{...(v.reportSnapshot||v),fields:v.fields,id:r.id}:r,p),format);
  }
  function register(user,params={}){
    if(!RBAC.has(user,'patient.list'))return deniedPanel('patient.list');
    const patients=(DB.db.patients||[]).filter(p=>W.canSee(user,p)),ids=new Set(patients.map(p=>p.id));
    const reports=(DB.db.careReviews||[]).filter(r=>ids.has(r.patientId)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
    const referrals=(DB.db.careReferrals||[]).filter(r=>ids.has(r.patientId)&&r.status==='pending_mcm');
    const find=id=>patients.find(p=>p.id===id);
    return pageHead('Official CareLink C-DIMS PDCA Register',
      'Editable two-spread reports, fixed day-30 through day-360 milestones and on-demand evaluations. Current and prior support cycles are never combined.',
      button('care-review-new','On-demand PDCA','',true))+
      card('County MCM · repeat / returning assessment decisions',referrals.map(r=>`<div class="care-referral-row">${flag({...find(r.patientId),status:'active',assessmentKind:r.kind})}<b>${esc(find(r.patientId)?.code)}</b><span>${esc(fmtDateTime(r.evaluatedAt))}</span>${button('care-referral-open','Open office decision report',`data-id="${esc(r.id)}"`)}</div>`).join('')||'<p class="muted">No repeat / returning report awaits an office decision in your scope.</p>')+
      card('Clinical reports & Beneficiary Archive',table([
        {label:'Patient / cycle',render:r=>`<b>${esc(find(r.patientId)?.name)}</b><div class="xs">${esc(find(r.patientId)?.code)} · ${esc(r.cycleId)}</div>`},
        {label:'Actual evaluation / due',render:r=>`${esc(fmtDateTime(r.evaluatedAt))}<div class="xs">${r.dueDay?'Day '+r.dueDay+' · due '+esc(r.dueDate):'On demand'}</div>`},
        {label:'Workflow',render:r=>esc(statusText(r.status))+' · v'+r.version},
        {label:'',render:r=>button('care-review-open','Open report / revisions',`data-id="${esc(r.id)}"`)}
      ],reports,{emptyMsg:'No saved reports yet. Existing legacy PDCAs remain in each patient’s support-cycle history.'}))+card('Patient evaluation / prior-cycle access',table([
        {label:'Patient',render:p=>`<b>${esc(p.name)}</b> · ${esc(p.code)}`},{label:'Classification',render:p=>flag(p)},
        {label:'',render:p=>button('patient-tab','Open care reviews & history',`data-id="${esc(p.id)}" data-tab="pdca"`)}
      ],patients));
  }
  function internationalPanel(user,params={}){
    if(!RBAC.has(user,'intl.medical'))return deniedPanel('intl.medical');
    const dossiers=(DB.db.intlPdcaDossiers||[]).filter(d=>d.sharedAt&&d.authorizedRevisionId&&d.authorizedBy&&
      (user.roleId==='intl.medical'||scoped(user,d.patientId)));
    const shown=dossiers.filter(d=>!params.status||params.status==='all'||d.intlStatus===params.status);
    return pageHead('International Medical Team · MCM-authorized PDCA reports',
      'Only the exact revisions authorized by the MCM and explicitly shared by the MCM or assigned caregiver appear here. No unshared patient history or automatic clinical concurrence is supplied.')+
      card('Authorized international review queue',shown.map(d=>`<div class="care-history-cycle"><h3>${esc(d.patientCode)} · ${esc(d.patientName)}</h3><p class="small">Actual evaluation ${esc(fmtDateTime(d.evaluatedAt))} · ${esc(d.daysInProgram)} programme days · ${esc(statusText(d.intlStatus))}</p><p class="small">MCM authorization ${esc(fmtDateTime(d.authorizedAt))} · shared ${esc(fmtDateTime(d.sharedAt))} · immutable revision ${esc(d.authorizedRevisionId)}</p>
      <div class="care-pre small">${esc(d.fields?.diagnoses||'Not recorded')}</div>
      <div class="row care-toolbar">${button('care-dossier-open','Read authorized report',`data-id="${esc(d.id)}"`)}${user.roleId==='intl.medical'?button('intl-review-modal','Record specialist advisory',`data-id="${esc(d.id)}"`,true):''}</div>
      <p class="small">${(d.comments||[]).length} line discussion thread(s)</p>
      ${(d.advisories||[]).map(a=>`<p class="small care-pre">${esc(fmtDateTime(a.at))} · ${esc(userName(a.by))} · ${esc(statusText(a.decision))}\n${esc(a.recommendation)}</p>`).join('')}</div>`).join('')||emptyState('No authorized shared reports','Reports appear only after MCM authorization and explicit sharing. 120+ reports also require the existing correction and resubmission chain.','shield'));
  }
  function dossierData(id){
    const d=(DB.db.intlPdcaDossiers||[]).find(d=>d.id===id&&d.sharedAt&&d.authorizedRevisionId&&d.authorizedBy);
    if(!d||!(AUTH.user.roleId==='intl.medical'||scoped(AUTH.user,d.patientId)))return null;
    return reportData({id:d.reviewId,patientId:d.patientId,patientCode:d.patientCode,fields:d.fields,cycleId:d.cycleId,
      status:'shared',policyDays:d.daysInProgram,programmeDay:d.programmeDay,evaluatedAt:d.evaluatedAt,dueDay:d.dueDay,dueDate:d.dueDate,
      reviewedBy:d.reviewedBy,reviewedAt:d.reviewedAt,authorizedBy:d.authorizedBy,authorizedAt:d.authorizedAt,preparedBy:d.preparedBy||'',version:d.reportVersion||'',authorizedRevisionId:d.authorizedRevisionId});
  }
  function discussion(d){
    const isIntl=AUTH.user?.roleId==='intl.medical';
    const patient=!isIntl&&scoped(AUTH.user,d.patientId);
    const canReply=isIntl || (patient&&(AUTH.user.roleId==='mcm'||(AUTH.user.roleId==='caregiver'&&patient.caregiverId===AUTH.user.id)));
    const comments=Array.isArray(d.comments)?d.comments:[];
    return `<section class="pdca-discussion"><h3>Line-by-line professional discussion</h3>
      <p class="small">Comments are tied to the exact authorized revision. They are advisory; they do not amend or approve the report. Reopen if someone else has updated the discussion.</p>
      ${R.SECTIONS.map(section=>`<details class="pdca-discussion-section"><summary>${esc(section.title)}</summary>
        ${section.fields.map(([key,label])=>{
          const lines=String(d.fields?.[key]||'').split(/\r?\n/);
          return `<div class="pdca-discussion-field"><h4>${esc(label)}</h4>${lines.map((line,i)=>{
            const found=comments.filter(c=>c.field===key&&c.line===i);
            return `<div class="pdca-discussion-line"><div class="pdca-line-content"><span class="xs muted">Line ${i+1}</span><span class="care-pre">${esc(line||'Blank / not recorded')}</span>
              ${isIntl?button('pdca-comment-open','Comment / question',`data-id="${esc(d.id)}" data-field="${esc(key)}" data-line="${i}"`):''}</div>
              ${found.map(c=>`<div class="pdca-thread"><b>${esc(statusText(c.kind))}</b> · ${esc(userName(c.by))} · ${esc(fmtDateTime(c.at))}<p class="care-pre">${esc(c.message)}</p>
                ${(c.replies||[]).map(r=>`<div class="pdca-reply"><b>${esc(userName(r.by))}</b> · ${esc(fmtDateTime(r.at))}<p class="care-pre">${esc(r.message)}</p></div>`).join('')}
                ${canReply?button('pdca-reply-open','Reply',`data-id="${esc(d.id)}" data-comment="${esc(c.id)}"`):''}</div>`).join('')}</div>`;
          }).join('')}</div>`;
        }).join('')}</details>`).join('')}</section>`;
  }
  function internationalReview(id){
    const d=(DB.db.intlPdcaDossiers||[]).find(d=>d.id===id);
    if(!dossierData(id)||AUTH.user.roleId!=='intl.medical')return toast('Not authorized','Only the international medical team may sign a specialist advisory on a shared, authorized revision.','err');
    openModal({title:'International medical advisory · '+d.patientCode,body:`<form id="intlRevForm">${hidden('id',d.id)}${hidden('version',d.version)}${hidden('requestId',token())}
      ${field('Specialist decision','decision','select',{required:true,options:[{v:'',l:'Choose a decision — no default concurrence'},{v:'reviewed_concurred',l:'Reviewed — concur with documented plan'},{v:'awaiting_intl_review',l:'Request more information from county MCM'}]})}
      ${field('Specialist recommendation','recommendation','textarea',{required:true})}</form>`,
      footer:button('close-modal','Cancel')+button('intl-review-save','Sign advisory & return to MCM','',true)});
  }
  async function submitForm(formId,name,makePayload,after){
    const f=document.querySelector('#'+formId);if(!f||f.dataset?.saving)return;
    if(f.reportValidity&&!f.reportValidity())return;
    const d=new FormData(f);if(f.dataset)f.dataset.saving='true';
    const r=await command(name,makePayload(d),d.get('requestId'));
    if(f.dataset)delete f.dataset.saving;
    if(!r.ok)return toast('Not saved',r.msg,'err');
    closeModal(true);toast(r.duplicate?'Already saved':'Saved',r.msg,'ok');
    if(after)after(r);else render();
  }
  function assessmentHint(){
    const form=document.querySelector('#assessForm'),box=document.querySelector('#assessRepeatBox');if(!form||!box)return;
    const value=n=>form.querySelector(`[name="${n}"]`)?.value||'';
    const q=value('nationalId')||value('name')||value('phone');
    const res=PMI.look(DB.db,q);const at=value('intake')||new Date().toISOString();
    box.innerHTML=res.matches.length?`<p class="small">A match is a prompt, not an identity decision. Confirm the person; never merge on a shared name or phone.</p>${res.matches.map(p=>`<div class="care-referral-row">${flag(p,at)}<b>${esc(p.name)}</b><span>${esc(p.code)} · ${esc(statusText(p.status))}</span>${p.status==='discharged'?button('care-assess-return','Same person — reassess existing record',`data-id="${esc(p.id)}"`,true):button('pmi-open','Open existing assessment / case',`data-id="${esc(p.id)}"`)}</div>`).join('')}`:
      `<div class="care-referral-row">${flag(null)}<p class="small">No match in your authorized register. This does not certify identity in other scopes; the server also checks exact identifiers. Final enrollment belongs to the county MCM at the office.</p></div>`;
  }
  return {command,localCommand,scoped,synthetic,flag,history,panel,editor,data,template,reportData,openReport,patientSheet,wordBytes,output,outputReport,
    token,hidden,button,sourceFields,sourcePayload,planFields,isoInput,toInstant,submitForm,assessmentHint,statusText,internationalPanel,internationalReview,dossierData,discussion,register};
})();

Object.assign(ACTIONS,{
  'care-dossier-open':d=>{
    const data=CARE_REVIEW.dossierData(d.id);if(!data)return;
    const dossier=(DB.db.intlPdcaDossiers||[]).find(x=>x.id===d.id);if(!dossier)return;
    openModal({title:'Authorized shared clinical revision',wide:true,body:CARE_REVIEW.discussion(dossier)+CARE_REVIEW.template(data),
      footer:CARE_REVIEW.button('close-modal','Close')+CARE_REVIEW.button('care-dossier-print','Print / save PDF',`data-id="${esc(d.id)}"`)+CARE_REVIEW.button('care-dossier-docx','Word (.docx)',`data-id="${esc(d.id)}"`)});
  },
  'pdca-comment-open':d=>{
    const item=(DB.db.intlPdcaDossiers||[]).find(x=>x.id===d.id);
    const fieldDef=CARE_RULES.FIELDS.find(([key])=>key===d.field),line=Number(d.line);
    const lines=String(item?.fields?.[d.field]||'').split(/\r?\n/);
    if(!item||!CARE_REVIEW.dossierData(d.id)||AUTH.user.roleId!=='intl.medical'||!fieldDef||!Number.isInteger(line)||line<0||line>=lines.length)return;
    openModal({title:'Comment on an authorized PDCA line',body:`<p><b>${esc(fieldDef[1])} · line ${line+1}</b></p><blockquote class="care-pre">${esc(lines[line]||'Blank / not recorded')}</blockquote>
      <form id="pdcaCommentForm">${CARE_REVIEW.hidden('id',item.id)}${CARE_REVIEW.hidden('version',item.version)}${CARE_REVIEW.hidden('field',d.field)}${CARE_REVIEW.hidden('line',line)}${CARE_REVIEW.hidden('requestId',CARE_REVIEW.token())}
      ${field('Type','kind','select',{required:true,options:[{v:'comment',l:'Comment'},{v:'question',l:'Question'},{v:'clarification',l:'Clarification requested'},{v:'evidence_request',l:'Supporting evidence requested'}]})}
      ${field('Professional comment or request','message','textarea',{required:true})}</form>`,
      footer:CARE_REVIEW.button('close-modal','Cancel')+CARE_REVIEW.button('pdca-comment-save','Save comment','',true)});
  },
  'pdca-comment-save':()=>CARE_REVIEW.submitForm('pdcaCommentForm','dossier_comment',d=>({id:d.get('id'),version:Number(d.get('version')),field:d.get('field'),line:Number(d.get('line')),kind:d.get('kind'),message:d.get('message')}),r=>r.duplicate?render():ACTIONS['care-dossier-open']({id:r.rec.id})),
  'pdca-reply-open':d=>{
    const item=(DB.db.intlPdcaDossiers||[]).find(x=>x.id===d.id),thread=(item?.comments||[]).find(x=>x.id===d.comment);
    const p=item&&CARE_REVIEW.scoped(AUTH.user,item.patientId);
    if(!item||!thread||!CARE_REVIEW.dossierData(d.id)||!(AUTH.user.roleId==='intl.medical'||p&&(AUTH.user.roleId==='mcm'||AUTH.user.roleId==='caregiver'&&p.caregiverId===AUTH.user.id)))return;
    openModal({title:'Reply to PDCA discussion',body:`<blockquote class="care-pre">${esc(thread.message)}</blockquote><form id="pdcaReplyForm">${CARE_REVIEW.hidden('id',item.id)}${CARE_REVIEW.hidden('version',item.version)}${CARE_REVIEW.hidden('commentId',thread.id)}${CARE_REVIEW.hidden('requestId',CARE_REVIEW.token())}${field('Response','message','textarea',{required:true})}</form>`,
      footer:CARE_REVIEW.button('close-modal','Cancel')+CARE_REVIEW.button('pdca-reply-save','Save reply','',true)});
  },
  'pdca-reply-save':()=>CARE_REVIEW.submitForm('pdcaReplyForm','dossier_reply',d=>({id:d.get('id'),version:Number(d.get('version')),commentId:d.get('commentId'),message:d.get('message')}),r=>r.duplicate?render():ACTIONS['care-dossier-open']({id:r.rec.id})),
  'care-dossier-print':d=>CARE_REVIEW.output(CARE_REVIEW.dossierData(d.id),'print'),
  'care-dossier-docx':d=>CARE_REVIEW.output(CARE_REVIEW.dossierData(d.id),'docx'),
  'care-review-new':d=>{
    const p=d.patient?CARE_REVIEW.scoped(AUTH.user,d.patient):null;
    if(p)return CARE_REVIEW.editor(p.id,'',d.day?Number(d.day):null);
    const rows=repo.patientList(AUTH.user).filter(p=>CARE_RULES.supported(p)&&p.status!=='discharged'&&CARE_WORKFLOW.canSee(AUTH.user,p));
    openModal({title:'Choose a patient for an on-demand PDCA',body:rows.map(p=>CARE_REVIEW.button('care-review-new',esc(p.name+' · '+p.code),`data-patient="${esc(p.id)}"`)).join('')||note('No enrolled patients in your clinical scope.')});
  },
  'care-review-save':()=>{
    const f=document.querySelector('#careEditorForm');if(!f)return;const d=new FormData(f),existing=!!d.get('id');
    return CARE_REVIEW.submitForm('careEditorForm',existing?'save_review':'create_review',d=>({patientId:d.get('patientId'),id:d.get('id')||undefined,
      version:Number(d.get('version')),dueDay:d.get('dueDay')||null,evaluatedAt:CARE_REVIEW.toInstant(d.get('evaluatedAt')),
      fields:Object.fromEntries(CARE_RULES.FIELDS.map(([k])=>[k,d.get(k)||''])),correctionNote:d.get('correctionNote')||''}),
      r=>r.rec?CARE_REVIEW.openReport(r.rec.id):go('patient',{id:d.get('patientId'),tab:'pdca'}));
  },
  'care-review-open':d=>CARE_REVIEW.openReport(d.id),
  'care-review-version':d=>CARE_REVIEW.openReport(d.id,d.revision),
  'care-review-edit':d=>{const r=(DB.db.careReviews||[]).find(x=>x.id===d.id);if(r)CARE_REVIEW.editor(r.patientId,r.id);},
  'care-review-step':d=>{
    const r=(DB.db.careReviews||[]).find(x=>x.id===d.id),p=r&&CARE_REVIEW.scoped(AUTH.user,r.patientId);if(!p)return;
    const name=d.command,review=name==='review_report',auth=name==='authorize_review';
    const labels={submit_review:'Submit to county MCM',resubmit_review:'Resubmit corrected report',review_report:'MCM review & comments',authorize_review:'MCM authorization for international sharing',share_review:'Share exact authorized revision',schedule_review:'Schedule MCM-reviewed follow-up',archive_review:'Mark for Beneficiary Archive'};
    if(!labels[name])return;
    openModal({title:labels[name],sub:`${p.code} · revision ${r.version}`,body:`<form id="careStepForm">${CARE_REVIEW.hidden('patientId',p.id)}${CARE_REVIEW.hidden('id',r.id)}${CARE_REVIEW.hidden('version',r.version)}${CARE_REVIEW.hidden('command',name)}${CARE_REVIEW.hidden('requestId',CARE_REVIEW.token())}
      ${review||auth?field(review?'MCM review comments / required corrections':'Authorization decision','comment','textarea',{required:true}):''}
      ${review&&r.policyDays>=120?field('I checked foundation-supported hospitalization history (including past admissions)','hospitalizationChecked','checkbox',{required:true}):''}
      ${review&&r.policyDays<120?field('Request caregiver / coordinator corrections before completing review','requestCorrections','checkbox',{}):''}
      ${name==='resubmit_review'?field('Corrections made against MCM comments','correctionNote','textarea',{required:true,value:r.correctionNote||''}):''}
      ${name==='schedule_review'?field('Follow-up appointment date & time','nextReviewAt','datetime-local',{required:true}):''}
      ${name==='share_review'?'<p>Only the immutable MCM-authorized version is sent. Drafts, other clinical history and unreviewed edits are not included.</p>':''}
      ${name==='archive_review'?'<p>The reviewed report and all revisions are retained in the Beneficiary Archive for future reference. No patient or review is deleted.</p>':''}</form>`,
      footer:CARE_REVIEW.button('close-modal','Cancel')+CARE_REVIEW.button('care-review-step-save',labels[name],'',true)});
  },
  'care-review-step-save':()=>{
    const f=document.querySelector('#careStepForm');if(!f)return;const d=new FormData(f);
    return CARE_REVIEW.submitForm('careStepForm',d.get('command'),d=>({patientId:d.get('patientId'),id:d.get('id'),version:Number(d.get('version')),
      comment:d.get('comment')||'',correctionNote:d.get('correctionNote')||'',hospitalizationChecked:!!d.get('hospitalizationChecked'),requestCorrections:!!d.get('requestCorrections'),nextReviewAt:CARE_REVIEW.toInstant(d.get('nextReviewAt'))}),
      r=>r.rec?CARE_REVIEW.openReport(r.rec.id):render());
  },
  'care-assess-return':d=>{
    const p=CARE_REVIEW.scoped(AUTH.user,d.id);if(!p||p.status!=='discharged')return toast('Open existing case','A second field enrollment is not allowed.','warn');
    const c=CARE_RULES.classify(p,new Date().toISOString(),DB.db);
    const pending=(DB.db.careReferrals||[]).find(r=>r.patientId===p.id&&r.status==='pending_mcm');if(pending)return ACTIONS['care-referral-open']({id:pending.id});
    openModal({title:'Repeat / returning support assessment',sub:p.code+' · '+c.label,wide:true,
      body:`${CARE_REVIEW.flag(p)}<p>Repeat: within 12 calendar months after the last program discharge, including the anniversary date. Returning: after that date. February 29 anniversaries use February 28. This report never enrolls in the field.</p>${CARE_REVIEW.history(AUTH.user,p)}
      <form id="careReturnForm">${CARE_REVIEW.hidden('patientId',p.id)}${CARE_REVIEW.hidden('requestId',CARE_REVIEW.token())}
      ${field('I confirmed that this is the existing person, not just a shared name / phone','identityConfirmed','checkbox',{required:true})}
      ${field('Actual assessment date & time','evaluatedAt','datetime-local',{value:CARE_REVIEW.isoInput(),required:true})}
      ${field('New chief complaints / major symptoms WITH durations','newComplaints','textarea',{required:true})}
      ${field('Comparison with the previous support cycle','comparison','textarea',{required:true,hint:'State what is new, unchanged or worsening, using previous PDCA and summary notes above. Do not invent missing history.'})}
      ${field('New documented diagnosis, if available','newDiagnosis','textarea',{})}
      <fieldset class="care-editor-section"><legend>New hospital / medical source documentation</legend>${CARE_REVIEW.sourceFields()}<p class="small">The county MCM must inspect this new source at the office. This form records a physical source reference; it does not claim to upload or store a scan.</p></fieldset></form>`,
      footer:CARE_REVIEW.button('close-modal','Cancel')+CARE_REVIEW.button('care-return-save','Send assessment to county MCM','',true)});
  },
  'care-return-save':()=>CARE_REVIEW.submitForm('careReturnForm','assess_return',d=>({patientId:d.get('patientId'),identityConfirmed:!!d.get('identityConfirmed'),evaluatedAt:CARE_REVIEW.toInstant(d.get('evaluatedAt')),
    newComplaints:d.get('newComplaints'),comparison:d.get('comparison'),newDiagnosis:d.get('newDiagnosis'),evidence:[CARE_REVIEW.sourcePayload(d)]}),r=>r.rec?ACTIONS['care-referral-open']({id:r.rec.id}):render()),
  'care-referral-open':d=>{
    const r=(DB.db.careReferrals||[]).find(x=>x.id===d.id),p=r&&CARE_REVIEW.scoped(AUTH.user,r.patientId);if(!p)return;
    const evidence=(DB.db.careEvidence||[]).filter(e=>r.evidenceIds.includes(e.id)),mcm=AUTH.user.roleId==='mcm'&&r.status==='pending_mcm';
    openModal({title:CARE_REVIEW.statusText(r.kind)+' assessment report · '+p.code,wide:true,
      body:`${CARE_REVIEW.flag({...p,status:'active',assessmentKind:r.kind})}<dl class="dl"><dt>Actual assessment</dt><dd>${esc(fmtDateTime(r.evaluatedAt))}</dd><dt>Last discharge / 12-month boundary</dt><dd>${esc(r.lastDischarge)} / ${esc(r.anniversary)}</dd><dt>New complaints / durations</dt><dd class="care-pre">${esc(r.newComplaints)}</dd><dt>Comparison with prior cycle</dt><dd class="care-pre">${esc(r.comparison)}</dd><dt>New diagnosis</dt><dd>${esc(r.newDiagnosis||'Not recorded')}</dd><dt>County MCM notification</dt><dd>${esc(r.notificationStatus==='county_mcm_notified'?'Sent to active responsible-county MCM account(s)':'Awaiting an active responsible-county MCM account; no notification or field enrollment is claimed')}</dd><dt>Office decision</dt><dd>${esc(CARE_REVIEW.statusText(r.status))} · ${esc(r.decisionReason||'Pending county MCM')}</dd></dl>
      <h4>New medical evidence — source references (not stored scans)</h4>${evidence.map(e=>`<p>${esc(e.sourceDate)} · ${esc(e.facility)} · ${esc(e.reference)}<br><small>${e.verifiedAt?'Inspected by MCM '+esc(userName(e.verifiedBy))+' · '+esc(fmtDateTime(e.verifiedAt)):'Awaiting MCM source inspection'}</small></p>`).join('')}
      ${CARE_REVIEW.history(AUTH.user,p)}${mcm?`<form id="careDecisionForm">${CARE_REVIEW.hidden('patientId',p.id)}${CARE_REVIEW.hidden('id',r.id)}${CARE_REVIEW.hidden('version',r.version)}${CARE_REVIEW.hidden('requestId',CARE_REVIEW.token())}
      ${field('Final decision','decision','select',{required:true,options:[{v:'',l:'Choose an office decision'},{v:'enrol',l:'Approve a new support cycle'},{v:'decline',l:'Decline this support request'}]})}
      ${field('Decision reason','reason','textarea',{required:true})}${field('I am recording the final MCM decision at the office','officeConfirmed','checkbox',{required:true})}
      ${field('I inspected the cited new hospital / medical documents (required to enroll)','evidenceReviewed','checkbox',{})}<h4>Initial plan for an approved new cycle</h4>${CARE_REVIEW.planFields(p,false)}</form>`:'<p class="small">Only the responsible MCM can record the final office decision. No field enrollment has occurred.</p>'}`,
      footer:CARE_REVIEW.button('close-modal','Close')+(mcm?CARE_REVIEW.button('care-decision-save','Record final MCM office decision','',true):'')});
  },
  'care-decision-save':()=>CARE_REVIEW.submitForm('careDecisionForm','decide_referral',d=>({patientId:d.get('patientId'),id:d.get('id'),version:Number(d.get('version')),
    decision:d.get('decision'),reason:d.get('reason'),officeConfirmed:!!d.get('officeConfirmed'),evidenceReviewed:!!d.get('evidenceReviewed'),
    needs:d.get('needs'),objectives:d.get('objectives'),interventions:d.get('interventions'),expectedDays:d.get('expectedDays'),rationale:d.get('rationale'),responsible:d.get('responsible')}),r=>r.rec?go('patient',{id:r.rec.patientId||r.rec.id,tab:'cycles'}):render()),
  'care-admission':d=>{
    const p=CARE_REVIEW.scoped(AUTH.user,d.patient);if(!p||AUTH.user.roleId!=='mcm')return;
    openModal({title:'Confirm foundation-supported hospitalization (past or current)',wide:false,body:`<form id="careAdmissionForm">${CARE_REVIEW.hidden('patientId',p.id)}${CARE_REVIEW.hidden('requestId',CARE_REVIEW.token())}
      <p>Record only hospitalization supported through the foundation program, including a past admission / prior cycle. Hospital attendance alone is not proof of program support. This provenance controls who must prepare a 120+ day PDCA.</p>
      ${field('Hospital admission date','admittedAt','date',{required:true})}${field('Hospital discharge date (if recorded)','dischargedAt','date',{})}${field('Foundation support approval / funding reference','supportReference','text',{required:true})}
      ${CARE_REVIEW.sourceFields()}${field('I inspected admission and foundation support source documents','sourceReviewed','checkbox',{required:true})}</form>`,
      footer:CARE_REVIEW.button('close-modal','Cancel')+CARE_REVIEW.button('care-admission-save','Confirm MCM-supported admission','',true)});
  },
  'care-admission-save':()=>CARE_REVIEW.submitForm('careAdmissionForm','record_admission',d=>({patientId:d.get('patientId'),admittedAt:d.get('admittedAt'),dischargedAt:d.get('dischargedAt'),supportReference:d.get('supportReference'),foundationSupported:true,sourceReviewed:!!d.get('sourceReviewed'),evidence:CARE_REVIEW.sourcePayload(d)})),
  'care-review-print':d=>CARE_REVIEW.outputReport(d.id,d.revision,'print'),
  'care-review-docx':d=>CARE_REVIEW.outputReport(d.id,d.revision,'docx')
});

document.addEventListener('input',e=>{if(e.target?.closest?.('#assessForm'))CARE_REVIEW.assessmentHint();});
document.addEventListener('change',e=>{if(e.target?.closest?.('#assessForm'))CARE_REVIEW.assessmentHint();});
