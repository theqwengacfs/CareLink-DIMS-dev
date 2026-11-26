/* Authoritative, transactional clinical workflow shared by browser fixtures and
   the hosted API. Returns staged patches; a refused command changes NOTHING.
   The API is the production authority. Generic sync cannot write these rows. */
const CARE_WORKFLOW = (()=>{
  const R=typeof CARE_RULES!=='undefined'?CARE_RULES:require('./care_rules.js');
  const OWNED=Object.freeze(['careCycles','careReferrals','careEvidence','programAdmissions','careReviews','careReviewRevisions','intlPdcaDossiers','mondayAssessmentReceipts','careCommandReceipts']);
  const READ_ROLES=['mcm','caregiver','coordinator','assistant','countyadmin','nurse','chw','liaison','homestay'];
  const copy=x=>JSON.parse(JSON.stringify(x));
  const text=(x,max=4000)=>String(x??'').trim().slice(0,max);
  // Chief's existing audited override uses the target account's scoped lens;
  // the default Chief role is not an extra clinical identity or preparer.
  const canSee=(u,p)=>!!(u&&p&&READ_ROLES.includes(u.roleId)&&
    (p.countyId===u.countyId||(u.roleId==='mcm'&&u.username==='mcm.kisumu'&&['kisumu','homabay'].includes(p.countyId)))&&
    (!['caregiver','coordinator','chw'].includes(u.roleId)||(u.areaIds||[]).includes(p.areaId)));
  const isMcm=u=>u?.roleId==='mcm';
  const writer=(u,p,rec,db,now)=>R.mcmPrepares(p,rec,db,now)?isMcm(u):['caregiver','coordinator'].includes(u?.roleId);
  const instant=value=>{const s=text(value,40);const n=Date.parse(s);return R.date(s)&&/T.*(Z|[+-]\d{2}:\d{2})$/.test(s)&&Number.isFinite(n)?new Date(n).toISOString():'';};
  const snapshot=p=>copy({clinical:p.clinical||{},carePlan:p.carePlan||{},baselineWeightKg:p.baselineWeightKg??null,
    caregiverId:p.caregiverId||'',countyId:p.countyId,areaId:p.areaId,assessmentDate:p.assessmentDate||p.assessedAt||p.intake||'',
    summaryNotes:p.summaryNotes||p.notes||'',dischargeEvidence:p.dischargeEvidence||'',dischargeSummary:p.dischargeSummary||{},
    dischargeProtocol:p.dischargeProtocol||{},dischargeReferral:p.dischargeReferral||{},dischargeAdvisory:p.dischargeAdvisory||{},master:p.master||{},household:p.household||{},age:p.age??'',education:p.education||'',occupation:p.occupation||''});
  function run(db,user,command,payload={},options={}){
    const now=options.now||new Date().toISOString(), today=R.programDate(now);
    const id=options.id||((prefix)=>`${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}`);
    const staged=[];
    const list=c=>(db[c]||[]).map(row=>staged.find(p=>p.c===c&&p.id===row.id)?.set||row)
      .concat(staged.filter(p=>p.c===c&&!(db[c]||[]).some(row=>row.id===p.id)).map(p=>p.set));
    const get=(c,key)=>list(c).find(row=>row.id===key);
    const put=(c,row)=>{const patch={c,id:row.id,set:copy(row)};const i=staged.findIndex(p=>p.c===c&&p.id===row.id);if(i<0)staged.push(patch);else staged[i]=patch;return row;};
    const fail=(msg,code='clinical_policy_denied',status=400)=>({ok:false,msg,code,status,patches:[]});
    const success=(rec,event)=>({ok:true,rec:copy(rec),event,patches:staged,msg:'Clinical record saved with its history.'});
    if(!user?.id||!user.roleId) return fail('Sign in to continue.','sign_in_required',401);
    let p=get('patients',payload.patientId);
    const dossierCommand=['international_review','dossier_comment','dossier_reply'].includes(command);
    const recCollection=dossierCommand?'intlPdcaDossiers':command.includes('referral')?'careReferrals':'careReviews';
    const existing=payload.id?get(recCollection,payload.id):null;
    if(!p&&existing) p=get('patients',existing.patientId);
    const intl=dossierCommand&&user.roleId==='intl.medical';
    if(!p||(!intl&&!(options.visible?options.visible(p):canSee(user,p)))) return fail('Patient record is outside your clinical scope.','clinical_scope_denied',403);
    const scoped={patientId:p.id,countyId:p.countyId,areaId:p.areaId};
    if(['monday_receipt','monday_draw','monday_advance'].includes(command)){
      if(user.roleId!=='assistant'||user.countyId!==p.countyId)
        return fail('Only the county admin assistant may record paper receipt and guide this review.','monday_secretary_required',403);
      const week=String(payload.week||'');
      if(!R.date(week)||!/^\d{4}-\d{2}-\d{2}$/.test(week)||new Date(week+'T00:00:00Z').getUTCDay()!==1)
        return fail('Choose the actual meeting Monday.');
      const start=R.addDays(week,-7), rows=()=>list('mondayAssessmentReceipts').filter(r=>r.countyId===p.countyId&&r.week===week);
      if(command==='monday_receipt'){
        const sourceType=String(payload.sourceType||''), sourceId=String(payload.sourceId||'');
        if(!['formRecords','hardcopyBatches'].includes(sourceType))return fail('Select a recorded assessment source.');
        const source=get(sourceType,sourceId);
        if(!source||source.patientId!==p.id||!['patient_assessment','minor_assessment'].includes(source.kind)||
          (sourceType==='formRecords'?!['submitted','verified','approved','completed'].includes(source.status):['draft','returned','rejected','void'].includes(source.status)))
          return fail('The selected submitted assessment is not available for this patient.');
        const receivedDate=String(payload.receivedDate||'');
        if(!/^\d{4}-\d{2}-\d{2}$/.test(receivedDate)||!R.date(receivedDate)||receivedDate<start||receivedDate>=week||receivedDate>today)
          return fail('Enter the actual physical submission date in the preceding Monday–Sunday, not a future date.');
        if(payload.physicalConfirmed!==true)return fail('Confirm that the paper assessment was actually received.');
        const linked=sourceType==='hardcopyBatches'&&source.formRecordId?get('formRecords',source.formRecordId):null;
        if(source.formRecordId&&(!linked||linked.patientId!==p.id||linked.kind!==source.kind))return fail('The linked assessment form must belong to the same patient and type.');
        const canonical=linked?'formRecords:'+linked.id:sourceType+':'+sourceId;
        if(list('mondayAssessmentReceipts').some(r=>r.sourceKey===canonical))return fail('A paper receipt is already recorded for this assessment.','monday_duplicate_receipt',409);
        if(rows().some(r=>r.drawnAt))return fail('The meeting order is already drawn; late receipts require a separate reviewed process.','monday_draw_locked',409);
        const raw=[source.enteredAt,source.createdAt,source.submittedAt].find(v=>instant(v));
        const receipt=put('mondayAssessmentReceipts',{id:id('monday-paper'),...scoped,week,receivedDate,receivedAt:now,receivedBy:user.id,
          sourceType,sourceId,sourceKey:canonical,sourceKind:source.kind,enteredAt:raw?instant(raw):'',caregiverId:p.caregiverId||'',status:'received',version:1});
        return success(receipt,'monday.paper_received');
      }
      const receipt=get('mondayAssessmentReceipts',payload.id);
      if(!receipt||receipt.patientId!==p.id||receipt.week!==week||receipt.countyId!==p.countyId)return fail('The selected receipt is not in this county meeting.');
      if(command==='monday_draw'){
        if(today<week)return fail('The meeting order can be drawn on or after its Monday, once the previous week has ended.');
        const pending=rows();
        if(pending.some(r=>r.drawnAt))return fail('This meeting order has already been drawn.','monday_draw_locked',409);
        if(!pending.length||pending.length>500)return fail('Draw requires between 1 and 500 confirmed paper receipts.');
        const areas=[...new Set(pending.map(r=>r.areaId||''))].sort();
        for(let i=areas.length-1;i>0;i--){const j=options.randomInt?options.randomInt(i+1):Math.floor(Math.random()*(i+1));[areas[i],areas[j]]=[areas[j],areas[i]];}
        const ordered=areas.flatMap(area=>pending.filter(r=>(r.areaId||'')===area).sort((a,b)=>
          (!a.enteredAt)-(!b.enteredAt)||String(a.enteredAt).localeCompare(String(b.enteredAt))||String(a.id).localeCompare(String(b.id))));
        ordered.forEach((r,i)=>put('mondayAssessmentReceipts',{...r,areaOrder:areas.indexOf(r.areaId||'')+1,position:i+1,status:i===0?'current':'pending',drawnAt:now,drawnBy:user.id,version:r.version+1}));
        return success(get('mondayAssessmentReceipts',receipt.id),'monday.order_drawn');
      }
      if(receipt.status!=='current'||receipt.version!==Number(payload.version))return fail('The current presentation changed. Refresh before advancing.','monday_progress_conflict',409);
      const sequence=rows().filter(r=>r.drawnAt).sort((a,b)=>a.position-b.position);
      if(sequence.filter(r=>r.status==='current').length!==1)return fail('Meeting progression requires review before continuing.','monday_progress_conflict',409);
      const done=put('mondayAssessmentReceipts',{...receipt,status:'discussed',discussedAt:now,discussedBy:user.id,version:receipt.version+1});
      const next=sequence.find(r=>r.status==='pending');
      if(next)put('mondayAssessmentReceipts',{...next,status:'current',version:next.version+1});
      return success(done,'monday.presentation_advanced');
    }
    const mcm=()=>isMcm(user);
    const notify=(userId,title,body,link)=>{if(userId)put('notifications',{id:id('cn'),userId,title,body,kind:'info',link,read:false,at:now});};
    const notifyMcms=(title,link)=>list('users').filter(u=>u.roleId==='mcm'&&u.countyId===p.countyId&&u.active!==false&&!u.unconfirmed&&u.status==='active')
      .forEach(u=>notify(u.id,title,'A scoped clinical report requires your review. Open the patient record; no field enrolment is authorised.',link));
    const notifyCaregiver=title=>notify(p.caregiverId,title,'Open the scoped patient record to read the MCM comments and record corrections.',`patient:${p.id}`);
    const ensureCycle=()=>{
      const cid=R.cycleId(p), old=get('careCycles',cid);
      if(old) return old;
      return put('careCycles',{id:cid,...scoped,startedAt:R.cycleStart(p),dischargedAt:R.lastDischarge(p,db),
        status:p.status==='discharged'?'discharged':'active',legacy:true,recordedAt:now,snapshot:snapshot(p)});
    };
    const newCycle=(referral,plan)=>{
      let previous=null;
      if(R.supported(p)&&R.lastDischarge(p,db)){
        previous=ensureCycle();
        for(const c of ['visits','pdcas','encounters','patientConditions','support','supportIssues','documents','clinicalRx','omahaPlans','formRecords','requests','careResidents','homestays','transactions','tbRequests','tbDispenses'])
          for(const row of list(c).filter(r=>r.patientId===p.id&&!r.cycleId))
            put(c,{...row,cycleId:R.recordCycle(row,p,db)});
        put('careCycles',{...previous,status:'discharged',dischargedAt:R.lastDischarge(p,db),snapshot:snapshot(p),closedSnapshotAt:now});
      }
      const cid=id('cycle'), sequence=list('careCycles').filter(c=>c.patientId===p.id).length+1;
      const carePlan={...plan,responsible:plan.responsible||p.caregiverId,version:1,createdBy:user.id,createdAt:now,approvedBy:user.id,approvedAt:now,
        reviewDate:R.addDays(today,30)};
      const next={...copy(p),status:'active',careCycleId:cid,cycleStartedAt:today,intake:today,enrolledAt:today,enrolDate:today,
        discharge:null,dischargedAt:null,dischargeEvidence:'',dischargeSummary:null,dischargeProtocol:null,dischargeRecommendation:null,dischargeReferral:null,programDays:0,plannedDays:plan.expectedDays,
        carePlan,docsVerified:true,enrolledBy:user.id,enrolledDecisionAt:now,enrolmentOfficeConfirmed:true,
        assessmentKind:referral?.kind||'new',assessmentDate:referral?R.programDate(referral.evaluatedAt):(p.assessmentDate||p.intake),
        updated:now};
      if(referral){
        next.clinical={allergies:copy(p.clinical?.allergies||[]),allergyClasses:copy(p.clinical?.allergyClasses||[]),diagnosis:referral.newDiagnosis||'',chiefComplaints:referral.newComplaints};
        next.baselineWeightKg=null;next.notes='';next.summaryNotes='';next.dischargeAdvisory=null;
        // Previous-cycle costs, bags, outcomes and summaries remain in that
        // cycle's snapshot. They are not new support or new clinical findings.
        next.master={insurance:p.master?.insurance||p.insurance||'',spouseId:p.master?.spouseId||p.spouseId||'',repeatPatient:referral.kind==='repeat'?'Yes':''};
      }
      put('careCycles',{id:cid,...scoped,sequence,startedAt:today,dischargedAt:'',status:'active',enrolledBy:user.id,enrolledAt:now,
        officeConfirmed:true,referralId:referral?.id||'',previousCycleId:previous?.id||'',kind:referral?.kind||'new',snapshot:snapshot(next)});
      put('patients',next);return next;
    };
    const carePlanFrom=input=>({needs:text(input.needs),objectives:text(input.objectives),interventions:text(input.interventions),
      rationale:text(input.rationale),expectedDays:Number(input.expectedDays),responsible:text(input.responsible,160)});
    const validPlan=plan=>plan.needs&&plan.rationale&&plan.objectives&&plan.interventions&&Number.isInteger(plan.expectedDays)&&plan.expectedDays>0&&plan.expectedDays<=3600;
    const evidenceFrom=(input,referralId,purpose='return_assessment')=>{
      const sourceDate=R.date(input?.sourceDate), facility=text(input?.facility,240),reference=text(input?.reference,300);
      if(!sourceDate||sourceDate>today||!facility||!reference) return null;
      const attachmentDocumentId=text(input.attachmentDocumentId,160);
      // Hosted medical-file persistence is not commissioned here. A
      // client-editable document/fileStored flag cannot prove stored bytes.
      // Cite the physical source for MCM inspection instead of claiming upload.
      if(attachmentDocumentId)return null;
      return {id:id('evidence'),...scoped,cycleId:R.cycleId(p),referralId:referralId||'',purpose,sourceDate,facility,reference,
        attachmentDocumentId,medium:attachmentDocumentId?'linked_document':'physical_source_reference',
        recordedBy:user.id,recordedAt:now,verifiedBy:'',verifiedAt:''};
    };
    if(command==='assess_return'){
      if(!['caregiver','coordinator','mcm'].includes(user.roleId)) return fail('Only a scoped caregiver, coordinator or MCM may assess a repeat / returning patient.','clinical_role_required',403);
      if(p.status!=='discharged') return fail('Open the existing active case or pending assessment. A second enrolment is not allowed.');
      if(payload.identityConfirmed!==true) return fail('Confirm this is the existing person. A name / shared telephone match is never an automatic identity merge.');
      if(list('careReferrals').some(r=>r.patientId===p.id&&r.status==='pending_mcm')) return fail('An assessment is already awaiting the county MCM. Open that report instead.','pending_assessment_exists',409);
      const evaluatedAt=instant(payload.evaluatedAt), classification=R.classify(p,evaluatedAt,db);
      if(!evaluatedAt||Date.parse(evaluatedAt)>Date.parse(now)+300000||!['repeat','returning'].includes(classification.kind)) return fail('A valid actual assessment date/time and a recorded previous discharge are required.');
      const newComplaints=text(payload.newComplaints),comparison=text(payload.comparison);
      if(!newComplaints||!comparison) return fail('Record the new complaints (with durations) and compare them with the previous cycle.');
      const rid=id('referral');
      const sources=(Array.isArray(payload.evidence)?payload.evidence:[]).slice(0,10).map(x=>evidenceFrom(x,rid));
      if(!sources.length||sources.some(e=>!e||e.sourceDate<classification.lastDischarge||e.sourceDate>R.programDate(evaluatedAt))) return fail('Cite new hospital / medical documentation dated on or after the last discharge, with facility, document date and reference.');
      if(sources.some(e=>list('careEvidence').some(old=>old.patientId===p.id&&old.verifiedAt&&old.sourceDate===e.sourceDate&&old.facility.toLowerCase()===e.facility.toLowerCase()&&old.reference.toLowerCase()===e.reference.toLowerCase()))) return fail('Previously used medical evidence cannot be recycled as new evidence for another support cycle.');
      const prior=ensureCycle();
      const countyMcmIds=list('users').filter(u=>u.roleId==='mcm'&&u.countyId===p.countyId&&u.status==='active'&&u.active!==false&&!u.unconfirmed).map(u=>u.id);
      const report={id:rid,...scoped,priorCycleId:prior.id,kind:classification.kind,lastDischarge:classification.lastDischarge,
        anniversary:classification.anniversary,evaluatedAt,newComplaints,comparison,newDiagnosis:text(payload.newDiagnosis),
        evidenceIds:sources.map(e=>e.id),countyMcmIds,notificationStatus:countyMcmIds.length?'county_mcm_notified':'awaiting_active_county_mcm',status:'pending_mcm',version:1,createdBy:user.id,createdAt:now,submittedAt:now};
      sources.forEach(e=>put('careEvidence',e));put('careReferrals',report);
      notifyMcms(`${classification.kind==='repeat'?'Repeat':'Returning'} assessment — office decision required`,`patient:${p.id}`);
      return success(report,'return_assessment.submitted');
    }
    if(command==='enrol_fresh'||command==='decide_referral'){
      if(!mcm()) return fail('Final enrolment is a county Medical Case Manager office decision, never a field or administration action.','mcm_office_required',403);
      if(payload.officeConfirmed!==true) return fail('Confirm that you are recording the final MCM decision at the office.','mcm_office_required',403);
      let referral=null;
      if(command==='decide_referral'){
        referral=get('careReferrals',payload.id);
        if(!referral||referral.patientId!==p.id||referral.status!=='pending_mcm'||referral.version!==Number(payload.version)) return fail('This assessment changed or was already decided. Refresh its report.','clinical_version_conflict',409);
        if(!text(payload.reason)) return fail('Record the office decision and its reason.');
        if(payload.decision==='decline'){
          const rejected=put('careReferrals',{...referral,status:'declined',decisionBy:user.id,decisionAt:now,decisionReason:text(payload.reason),officeConfirmed:true,version:referral.version+1});
          notify(referral.createdBy,'Assessment office decision recorded','Open the scoped record to read the MCM decision.',`patient:${p.id}`);
          return success(rejected,'return_assessment.declined');
        }
        if(payload.decision!=='enrol'||p.status!=='discharged') return fail('The prior cycle must be discharged before a new one can be approved.');
        if(payload.evidenceReviewed!==true) return fail('The MCM must inspect the new medical source documents before approving enrolment.');
        const evidence=referral.evidenceIds.map(key=>get('careEvidence',key));
        if(!evidence.length||evidence.some(e=>!e||e.patientId!==p.id||e.referralId!==referral.id||e.sourceDate<referral.lastDischarge)) return fail('The assessment lacks current supporting medical documents.');
        evidence.forEach(e=>put('careEvidence',{...e,verifiedBy:user.id,verifiedAt:now,verification:'MCM inspected the cited source document at the office'}));
      }else if(p.status!=='approved_enrolment'||R.supported(p)) return fail('Fresh enrolment requires a verified first assessment. For previous support, use the repeat / returning report.');
      const plan=carePlanFrom(payload);
      if(!validPlan(plan)) return fail('Enrolment needs identified need, objective, intervention, rationale and a positive expected duration.');
      const next=newCycle(referral,plan);
      if(referral)put('careReferrals',{...referral,status:'enrolled',cycleId:next.careCycleId,decisionBy:user.id,decisionAt:now,
        decisionReason:text(payload.reason),officeConfirmed:true,version:referral.version+1});
      notify(p.caregiverId,'MCM office enrolment decision recorded','A new, separate support cycle is active. Prior support and PDCAs remain in the clinical history.',`patient:${p.id}`);
      return success(next,referral?'return_assessment.enrolled':'patient.enrol');
    }
    if(command==='discharge_cycle'){
      if(!['mcm','countyadmin'].includes(user.roleId))return fail('The scoped MCM / county office must approve discharge.','discharge_authority_required',403);
      if(p.status!=='discharge_recommended'||!text(payload.evidence))return fail('A discharge recommendation and supporting evidence are required.');
      const max=Number(db.settings?.programme?.maxDays)||180;
      const reviewed=list('careReviews').some(r=>r.patientId===p.id&&r.cycleId===R.cycleId(p)&&
        ['reviewed','scheduled','shared','archived'].includes(r.status)&&Date.parse(r.evaluatedAt)>=Date.parse(now)-90*86400000);
      if(R.days(p,now)>max&&!reviewed)return fail('An extended case needs a completed, MCM-reviewed PDCA before discharge.');
      const cycle=ensureCycle();
      const next={...p,status:'discharged',discharge:today,dischargedAt:today,dischargeEvidence:text(payload.evidence),dischargedBy:user.id,updated:now};
      put('patients',next);put('careCycles',{...cycle,status:'discharged',dischargedAt:today,dischargedBy:user.id,snapshot:snapshot(next),closedSnapshotAt:now});
      notifyCaregiver('Office discharge decision recorded');return success(next,'patient.approve_discharge');
    }
    if(command==='record_admission'){
      if(!mcm())return fail('Only the scoped MCM may confirm foundation-supported hospitalization.','mcm_required',403);
      const admittedAt=R.date(payload.admittedAt), dischargedAt=R.date(payload.dischargedAt);
      if(!admittedAt||admittedAt>today||(dischargedAt&&(dischargedAt<admittedAt||dischargedAt>today))||payload.foundationSupported!==true||!text(payload.supportReference)||payload.sourceReviewed!==true) return fail('Record admission date, foundation support reference and MCM confirmation of the source documentation.');
      const evidence=evidenceFrom(payload.evidence,'','foundation_admission');
      if(!evidence) return fail('Cite the hospital admission document, its date, facility and reference.');
      evidence.verifiedBy=user.id;evidence.verifiedAt=now;evidence.verification='MCM inspected admission and foundation support source';put('careEvidence',evidence);
      const admission=put('programAdmissions',{id:id('admission'),...scoped,cycleId:R.recordCycle({date:admittedAt},p,db),admittedAt,dischargedAt,
        foundationSupported:true,supportReference:text(payload.supportReference,500),evidenceId:evidence.id,confirmedBy:user.id,confirmedAt:now});
      return success(admission,'program_admission.confirmed');
    }
    if(command==='dossier_comment'||command==='dossier_reply'){
      const dossier=get('intlPdcaDossiers',payload.id);
      const authorization=dossier&&get('careReviewRevisions',dossier.authorizedRevisionId);
      const allowedLocal=mcm()||(user.roleId==='caregiver'&&p.caregiverId===user.id);
      if((command==='dossier_comment'&&!intl)||(command==='dossier_reply'&&!intl&&!allowedLocal)||!dossier||dossier.patientId!==p.id||!dossier.sharedAt||
        !authorization||authorization.event!=='authorized'||authorization.reviewId!==dossier.reviewId||authorization.patientId!==dossier.patientId||
        authorization.cycleId!==dossier.cycleId||authorization.by!==dossier.authorizedBy||JSON.stringify(authorization.fields)!==JSON.stringify(dossier.fields))
        return fail('Only the authorized clinical participants may discuss an explicitly shared revision.','international_scope_denied',403);
      if(dossier.version!==Number(payload.version)) return fail('This discussion changed. Reopen it before saving.','clinical_version_conflict',409);
      const message=String(payload.message??'').trim();
      if(!message||message.length>4000) return fail('Enter a comment of at most 4,000 characters; nothing has been saved.');
      const threads=copy(dossier.comments||[]);
      if(command==='dossier_comment'){
        const field=String(payload.field||''),line=Number(payload.line);
        if(!R.FIELDS.some(([key])=>key===field)||!Number.isInteger(line)||line<0)return fail('Choose a valid report field and line.');
        const lines=String(dossier.fields?.[field]||'').split(/\r?\n/);
        if(line>=lines.length)return fail('That line is not in the authorized revision.');
        if(!['comment','question','clarification','evidence_request'].includes(payload.kind))return fail('Choose a valid advisory category.');
        threads.push({id:id('pdca-comment'),field,line,quote:lines[line],kind:payload.kind,message,by:user.id,role:user.roleId,at:now,replies:[]});
      }else{
        const thread=threads.find(t=>t.id===payload.commentId);
        if(!thread)return fail('The requested comment is not in this shared revision.');
        thread.replies=[...(thread.replies||[]),{id:id('pdca-reply'),message,by:user.id,role:user.roleId,at:now}];
      }
      const updated=put('intlPdcaDossiers',{...dossier,version:dossier.version+1,comments:threads});
      if(intl){notifyMcms('International PDCA discussion updated',`patient:${p.id}`);notifyCaregiver('International PDCA discussion updated');}
      else list('users').filter(u=>u.roleId==='intl.medical'&&u.status==='active'&&u.active!==false&&!u.unconfirmed)
        .forEach(u=>notify(u.id,'PDCA discussion response received','A shared report has a new scoped discussion response.','intlmedical'));
      return success(updated,command==='dossier_comment'?'pdca.international_comment_added':'pdca.international_comment_replied');
    }
    if(command==='international_review'){
      const dossier=get('intlPdcaDossiers',payload.id);
      const authorization=dossier&&get('careReviewRevisions',dossier.authorizedRevisionId);
      if(!intl||!dossier||dossier.patientId!==p.id||!authorization||authorization.event!=='authorized'||!dossier.sharedAt||
        authorization.reviewId!==dossier.reviewId||authorization.patientId!==dossier.patientId||authorization.cycleId!==dossier.cycleId||
        authorization.by!==dossier.authorizedBy||JSON.stringify(authorization.fields)!==JSON.stringify(dossier.fields))
        return fail('Only the international medical team may review an MCM-authorized, shared revision.','international_scope_denied',403);
      if(dossier.version!==Number(payload.version)) return fail('The advisory changed. Refresh before signing.','clinical_version_conflict',409);
      const recommendation=text(payload.recommendation);
      if(!recommendation||!['reviewed_concurred','awaiting_intl_review'].includes(payload.decision))return fail('Record your clinical advisory and decision; there is no default concurrence.');
      const updated=put('intlPdcaDossiers',{...dossier,intlStatus:payload.decision,intlReviewer:user.id,intlRecommendation:recommendation,intlReviewedAt:now,version:dossier.version+1,
        advisories:[...(dossier.advisories||[]),{by:user.id,at:now,decision:payload.decision,recommendation}]});
      notifyMcms('International medical advisory received',`patient:${p.id}`);
      return success(updated,'pdca.international_reviewed');
    }
    let report=existing&&existing.patientId===p.id?copy(existing):null;
    const revision=(event,comment='')=>{
      report.version=(report.version||0)+1;report.updatedAt=now;
      const rid=id('review-revision');report.latestRevisionId=rid;
      if(event==='authorized')report.authorizedRevisionId=rid;
      // Retain the exact fields once per immutable revision. Snapshot keeps
      // the remaining metadata without duplicating every clinical paragraph.
      const {fields,...metadata}=copy(report);
      put('careReviewRevisions',{id:rid,...scoped,cycleId:report.cycleId,reviewId:report.id,version:report.version,event,by:user.id,at:now,
        comment:text(comment),status:report.status,evaluatedAt:report.evaluatedAt,dueDay:report.dueDay,dueDate:report.dueDate,
        policyDays:report.policyDays,fields,preparedBy:report.preparedBy||report.createdBy,reportSnapshot:metadata});
      put('careReviews',report);return rid;
    };
    if(command==='create_review'){
      if(!R.supported(p)||!R.cycleStart(p)||p.status==='discharged')return fail('A review belongs to an enrolled support cycle; an unapproved assessment is not an enrolment.');
      const evaluatedAt=instant(payload.evaluatedAt),dueDay=payload.dueDay==null||payload.dueDay===''?null:Number(payload.dueDay);
      if(!evaluatedAt||R.programDate(evaluatedAt)<R.cycleStart(p)||Date.parse(evaluatedAt)>Date.parse(now)+300000) return fail('Record the actual evaluation date and time within this support cycle, not a future time.');
      if(dueDay!==null&&!R.REVIEW_DAYS.includes(dueDay))return fail('Scheduled review days are 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330 and 360.');
      const policyDays=R.reportDays(p,{evaluatedAt,dueDay},db,now);
      report={id:id('review'),...scoped,cycleId:R.cycleId(p),dueDay,dueDate:dueDay?R.addDays(R.cycleStart(p),dueDay):'',
        evaluatedAt,programmeDay:R.days(p,evaluatedAt),policyDays,fields:R.cleanFields(payload.fields),status:'draft',createdBy:user.id,createdRole:user.roleId,createdAt:now,
        preparedBy:user.id,preparedRole:user.roleId,version:0};
      const draftError=R.validateFields(report.fields,{draft:true});if(draftError)return fail(draftError);
      if(!writer(user,p,report,db,now))return fail(R.mcmPrepares(p,report,db,now)?'The MCM prepares 120+ day reports for patients with foundation-supported hospitalization, including past admissions.':'The caregiver or ministry-area coordinator prepares this report.','pdca_preparer_required',403);
      if(dueDay&&list('careReviews').some(r=>r.patientId===p.id&&r.cycleId===report.cycleId&&r.dueDay===dueDay))return fail('That scheduled review already exists in this cycle. Open it; prior cycles are not overwritten.','scheduled_review_exists',409);
      ensureCycle();revision('created');return success(report,'pdca.created');
    }
    if(!report) return fail('Clinical report not found.','clinical_record_not_found',404);
    if(report.version!==Number(payload.version))return fail('Another revision was saved. Reopen the report; your older form may not overwrite it.','clinical_version_conflict',409);
    if(report.cycleId!==R.cycleId(p))return fail('Prior-cycle reports are retained read-only. Open a report in the current cycle.');
    // The preparation/review policy is fixed at submission, not the later
    // date an archived report happens to be opened. Drafts cannot evade day120.
    const long=(report.status==='draft'?R.reportDays(p,report,db,now):report.policyDays)>=120;
    if(command==='save_review'){
      const correcting=['corrections_requested','correcting'].includes(report.status);
      if(report.status!=='draft'&&!correcting)return fail('Submitted, authorized and archived versions are read-only. Create an on-demand review for a new evaluation.');
      if(correcting?(long?user.roleId!=='caregiver':!['caregiver','coordinator'].includes(user.roleId)):!writer(user,p,report,db,now))return fail(correcting?'The caregiver must re-edit the report against MCM comments.':'This role may not prepare this PDCA.','pdca_preparer_required',403);
      if(payload.evaluatedAt && !correcting){
        const evaluatedAt=instant(payload.evaluatedAt);
        if(!evaluatedAt||R.programDate(evaluatedAt)<R.cycleStart(p)||Date.parse(evaluatedAt)>Date.parse(now)+300000)return fail('Record a valid actual evaluation timestamp within this cycle, not a future time.');
        report.evaluatedAt=evaluatedAt;report.programmeDay=R.days(p,evaluatedAt);report.policyDays=R.reportDays(p,report,db,now);
      }
      report.fields=R.cleanFields(payload.fields);
      const draftError=R.validateFields(report.fields,{draft:true});if(draftError)return fail(draftError);
      if(correcting){report.status='correcting';report.correctedBy=user.id;report.correctedRole=user.roleId;report.correctionNote=text(payload.correctionNote);}
      else{report.preparedBy=user.id;report.preparedRole=user.roleId;}
      revision(correcting?'caregiver_correction':'saved',payload.correctionNote);return success(report,'pdca.revision_saved');
    }
    if(command==='submit_review'){
      if(report.status!=='draft')return fail('Only a draft may be submitted for its first MCM review.');
      report.policyDays=Math.max(report.policyDays,R.days(p,now));
      if(!writer(user,p,report,db,now))return fail('The preparation rule changed at day 120 or after an admission. The required preparer must save this draft before submission.','pdca_preparer_required',403);
      if(R.mcmPrepares(p,report,db,now)?report.preparedRole!=='mcm':!['caregiver','coordinator'].includes(report.preparedRole))return fail('The required preparer must save the report first.');
      const error=R.validateFields(report.fields,{policyDays:report.policyDays});if(error)return fail(error);
      report.status='submitted';report.submittedBy=user.id;report.submittedAt=now;
      revision('submitted');notifyMcms('PDCA submitted for MCM review',`patient:${p.id}`);return success(report,'pdca.submitted');
    }
    if(command==='review_report'){
      if(!mcm())return fail('County MCM review is required.','mcm_required',403);
      if(!['submitted','resubmitted'].includes(report.status))return fail('The report must first be submitted / resubmitted.');
      if(!text(payload.comment))return fail('MCM review comments are required.');
      if(long&&payload.hospitalizationChecked!==true)return fail('Confirm the patient’s foundation-supported admission history has been checked.');
      if(long&&R.supportedAdmission(p,db)&&report.preparedRole!=='mcm'){
        report.status='draft';report.preparedBy='';report.preparedRole='';report.reviewComment=text(payload.comment);
        revision('mcm_repreparation_required',payload.comment);
        return success(report,'pdca.mcm_repreparation_required');
      }
      report.reviewedBy=user.id;report.reviewedAt=now;report.reviewComment=text(payload.comment);
      if(long){report.hospitalizationHistoryCheckedBy=user.id;report.hospitalizationHistoryCheckedAt=now;report.supportedAdmissionIds=list('programAdmissions').filter(a=>a.patientId===p.id&&a.confirmedBy).map(a=>a.id);}
      report.status=long||payload.requestCorrections===true?'corrections_requested':'reviewed';
      revision('mcm_commented',payload.comment);
      if(report.status==='corrections_requested')notifyCaregiver('PDCA corrections requested by MCM');
      return success(report,'pdca.mcm_reviewed');
    }
    if(command==='resubmit_review'){
      if((long?user.roleId!=='caregiver':!['caregiver','coordinator'].includes(user.roleId))||report.status!=='correcting'||report.correctedBy!==user.id) return fail('The caregiver must save corrections before resubmitting.','caregiver_corrections_required',403);
      if(!text(payload.correctionNote||report.correctionNote))return fail('Explain the corrections made in response to the MCM comments.');
      const error=R.validateFields(report.fields,{policyDays:report.policyDays});if(error)return fail(error);
      report.status='resubmitted';report.correctionNote=text(payload.correctionNote||report.correctionNote);report.resubmittedBy=user.id;report.resubmittedAt=now;
      revision('resubmitted',report.correctionNote);notifyMcms('Corrected PDCA resubmitted',`patient:${p.id}`);return success(report,'pdca.resubmitted');
    }
    if(command==='authorize_review'){
      if(!mcm())return fail('Only the MCM may authorize sharing.','mcm_required',403);
      if(long && (report.status!=='resubmitted'||report.correctedRole!=='caregiver'||!report.reviewComment||!report.resubmittedAt))return fail('120+ sharing requires MCM comments, a saved caregiver correction and resubmission, in that order.','pdca_review_chain_required',403);
      if(!long && (report.status!=='reviewed'||!report.reviewedBy||!report.reviewedAt||!report.reviewComment))return fail('The MCM must review the submitted PDCA before authorizing its sharing.','pdca_review_chain_required',403);
      if(long&&R.supportedAdmission(p,db)&&report.preparedRole!=='mcm')return fail('Supported hospitalization was recorded after preparation. Review again and return this report for MCM re-preparation before authorization.','pdca_mcm_repreparation_required',409);
      if(!text(payload.comment))return fail('Record the MCM authorization decision.');
      report.status='authorized';report.authorizedBy=user.id;report.authorizedAt=now;
      const rid=revision('authorized',payload.comment);report.authorizedRevisionId=rid;put('careReviews',report);
      notifyCaregiver('PDCA authorized for international sharing');
      return success(report,'pdca.sharing_authorized');
    }
    if(command==='share_review'){
      const assignedCaregiver=user.roleId==='caregiver' && !!p.caregiverId && user.id===p.caregiverId;
      if((!mcm()&&!assignedCaregiver)||report.status!=='authorized')return fail('Only the MCM or the assigned caregiver may share an MCM-authorized report.','pdca_authorization_required',403);
      if(long&&R.supportedAdmission(p,db)&&report.preparedRole!=='mcm')return fail('Newly confirmed supported hospitalization requires a new MCM-prepared evaluation and review chain. This earlier authorization cannot be shared.','pdca_mcm_repreparation_required',409);
      const authorized=get('careReviewRevisions',report.authorizedRevisionId);
      if(!authorized||authorized.event!=='authorized'||JSON.stringify(authorized.fields)!==JSON.stringify(report.fields))return fail('The authorized revision is missing or changed. Nothing was shared.','pdca_authorization_required',403);
      report.status='shared';report.sharedAt=now;report.sharedBy=user.id;
      put('intlPdcaDossiers',{id:id('pdca-dossier'),...scoped,cycleId:report.cycleId,reviewId:report.id,authorizedRevisionId:authorized.id,
        authorizedBy:report.authorizedBy,authorizedAt:report.authorizedAt,sharedBy:user.id,sharedAt:now,
        patientName:p.name,patientCode:p.code||p.id,daysInProgram:report.policyDays,programmeDay:report.programmeDay,evaluatedAt:report.evaluatedAt,
        dueDay:report.dueDay,dueDate:report.dueDate,reviewedBy:report.reviewedBy,reviewedAt:report.reviewedAt,
        fields:copy(authorized.fields),diagnosis:authorized.fields.diagnoses,planStage:authorized.fields.plan,
        doStage:authorized.fields.actions,checkStage:authorized.fields.resolvedSymptoms,actStage:authorized.fields.nextSteps,
        preparedBy:report.preparedBy,reportVersion:authorized.version,submittedBy:user.id,submittedAt:now,intlStatus:'awaiting_intl_review',intlReviewer:'',intlRecommendation:'',version:1,advisories:[]});
      revision('shared');
      list('users').filter(u=>u.roleId==='intl.medical'&&u.status==='active'&&u.active!==false&&!u.unconfirmed)
        .forEach(u=>notify(u.id,'Authorized PDCA awaiting advisory','An MCM-authorized report was shared for professional review.', 'intlmedical'));
      return success(report,'pdca.shared');
    }
    if(command==='schedule_review'){
      if(long||report.status!=='reviewed'||!['mcm','caregiver','coordinator'].includes(user.roleId))return fail('Under-120 PDCAs need completed MCM review before scheduling.','pdca_mcm_review_required',403);
      const nextReviewAt=instant(payload.nextReviewAt);if(!nextReviewAt||Date.parse(nextReviewAt)<Date.parse(now))return fail('Choose the actual future appointment date and time.');
      put('calendarEvents',{id:id('pdca-calendar'),...scoped,cycleId:report.cycleId,careReviewId:report.id,kind:'pdca_review',source:'care-review',
        title:'MCM-reviewed care follow-up',date:R.programDate(nextReviewAt),start:nextReviewAt,ownerId:p.caregiverId,createdBy:user.id,createdAt:now});
      report.status='scheduled';report.nextReviewAt=nextReviewAt;revision('scheduled');return success(report,'pdca.scheduled');
    }
    if(command==='archive_review'){
      if(!['mcm','caregiver','coordinator'].includes(user.roleId)||!(long?report.status==='shared':['reviewed','scheduled','shared'].includes(report.status)))return fail('MCM review is required before Beneficiary Archive; 120+ reports must complete the review and sharing chain.','pdca_mcm_review_required',403);
      report.status='archived';report.archivedBy=user.id;report.archivedAt=now;revision('archived');return success(report,'pdca.archived');
    }
    return fail('Unknown clinical command.','clinical_command_not_found',404);
  }
  function apply(db,patches){for(const patch of patches||[]){const rows=db[patch.c]=db[patch.c]||[];const i=rows.findIndex(r=>r.id===patch.id);if(i<0)rows.push(copy(patch.set));else Object.assign(rows[i],copy(patch.set));}return db;}
  return {OWNED,canSee,writer,run,apply,snapshot};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=CARE_WORKFLOW;
