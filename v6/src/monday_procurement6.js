/* ============================================================
   monday_procurement6.js - CareLink v6.3
   1. Monday Management Meeting Workspace (County Admin Assistant
      agenda push, caregiver assessment & concern review, team notes)
   2. Financial & Procurement Policy + Projected Food & Hygiene
      Budget Engine (Bag 1 / Bag 2 / Inpatient / Quarterly Hygiene /
      4-Tier Approval Thresholds / Cheque Maturity & eTIMS)
   ============================================================ */

const FOOD_BAG_COMPOSITIONS = [
  { code:'BG1', name:'Bag 1 — Standard / Couple Household Food Bag', projKes:1525, avgKes:1313,
    items:'Maize meal (2kg), Rice (2kg), Beans / Ndengu (1kg), Fortified porridge flour (1kg), Cooking oil (500ml), Omena / Soya protein, Sugar/Iodised salt, Fresh vegetables/fruits' },
  { code:'BG2', name:'Bag 2 — Supplementary / Family Household Pack', projKes:1190, avgKes:1078,
    items:'Maize meal (2kg), Beans / Green grams (1kg), Fortified uji flour (1kg), Cooking oil (500ml), Iodised salt & leafy greens' },
  { code:'INP', name:'Hospital Inpatient Bedside Nutrition Pack', projKes:560, avgKes:520,
    items:'Long-life / Fresh Milk (4 x 500ml packets) + Fresh Oranges (4 pcs) delivered during hospital inpatient visit' },
  { code:'SPB', name:'Special Clinical Dietary Bag (DM / Renal / SAM)', projKes:2250, avgKes:1980,
    items:'Finger millet / sorghum flour, oats, low-sodium pulses, high-protein therapeutic items per MCM prescription' }
];

const HYGIENE_BEDDING_STANDARDS = [
  { code:'HP-F', quarter:'Mar · Jun · Sep · Dec', item:'Ladies Quarterly Hygiene Pack', rangeKes:'KES 1,360 – 1,440', avgKes:1400, detail:'Bathing soap, bar laundry soap, sanitary towels (2 packs), petroleum jelly, toothpaste & brush, Water Guard (+ Dec festive gift)' },
  { code:'HP-M', quarter:'Mar · Jun · Sep · Dec', item:'Men Quarterly Hygiene Pack',    rangeKes:'KES 810 – 910',     avgKes:860,  detail:'Bathing soap, bar laundry soap, petroleum jelly, toothpaste & brush, razor/grooming, Water Guard (+ Dec festive gift)' },
  { code:'MATT', quarter:'As assessed',           item:'Patient Recovery Mattress',     rangeKes:'KES 3,500 / 4,500', avgKes:3500, detail:'Standard high-density (3,500) or heavy-duty orthopaedic/Mackintosh-paired (4,500) per home assessment' },
  { code:'BLNK', quarter:'As assessed',           item:'Heavy Patient Blanket',         rangeKes:'KES 600 – 850',     avgKes:750,  detail:'Issued on cold/bedding vulnerability verification during home assessment' },
  { code:'NET',  quarter:'County Stock First',    item:'Treated Mosquito Net (LLIN)',   rangeKes:'KES 0 (Stock) / 850',avgKes:850, detail:'Mandatory rule: issue from County Ministry of Health / LOMAMO county stock first before external purchase' }
];

const PROC_TIERS = [
  { tier:'Tier 1 · Micro Purchase',     band:'Up to KES 5,000',          quotes:'1 verified price check',   channel:'M-Pesa Paybill / Till (no personal hand cash)', approver:'County Admin / Finance Officer', compliance:'Official receipt + patient/office register ref' },
  { tier:'Tier 2 · Small Value',        band:'KES 5,001 – KES 50,000',   quotes:'Minimum 3 written quotes', channel:'M-Pesa Paybill / Bank EFT / Crossed Cheque',    approver:'Procurement + Finance + County Admin', compliance:'Quote analysis + Purchase Order + KRA eTIMS invoice' },
  { tier:'Tier 3 · Medium Threshold',   band:'KES 50,001 – KES 250,000', quotes:'3 sealed / formal quotes', channel:'Crossed Cheque (with maturity date) or EFT',    approver:'Country Director + Finance Officer', compliance:'Bid matrix + PO + GRN + Cheque maturity log + eTIMS' },
  { tier:'Tier 4 · Major Tender',       band:'Above KES 250,000',        quotes:'Open / Restricted Tender', channel:'Dual-signatory Bank EFT / Crossed Cheque',       approver:'Tender Committee + Country Director / Board', compliance:'Signed COI declarations + Contract + GRN + eTIMS' }
];

const MONDAY_PROC = {
  ensureStore(){
    if(!DB.db) return;
    const mondayDate = (()=>{
      const d = new Date();
      const day = d.getDay();
      const diff = day === 0 ? -6 : (1 - day);
      const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
      return m.toISOString().slice(0,10);
    })();
    DB.db.mondayAgendas = DB.db.mondayAgendas || [
      {
        id:'mon-kisumu-1', countyId:'kisumu', weekOf:mondayDate,
        title:'Kisumu County Monday Management & Caregiver Case Review',
        pushedBy:'Kisumu County Admin Assistant', pushedAt:mondayDate+'T07:45:00Z', pushedLive:true,
        chair:'County Office Administrator · Kisumu',
        venue:'Kisumu County Office Boardroom & CareLink Live Workspace',
        items:[
          { time:'08:00 – 08:20', topic:'Opening devotion, attendance & staff leave/reliever handover check', owner:'County Admin Assistant' },
          { time:'08:20 – 08:55', topic:'Review of previous week’s hard-copy initial assessments & new intakes across Nyalenda, Kondele, Manyatta & Nairobi Rd', owner:'Ministry Area Coordinators' },
          { time:'08:55 – 09:30', topic:'Open caregiver patient concerns, SAM/BMI red flags, hospital admissions & 120+ day PDCA escalations', owner:'Medical Case Manager & Caregivers' },
          { time:'09:30 – 09:50', topic:'Weekly foodbag count reconciliation (Bag 1 / Bag 2 / Inpatient packs) & vehicle field dispatch', owner:'Procurement & Fleet Officer' },
          { time:'09:50 – 10:05', topic:'Action items, SHA/NHIF follow-ups & week-ahead visit schedule confirmation', owner:'All Departments' }
        ]
      },
      {
        id:'mon-homabay-1', countyId:'homabay', weekOf:mondayDate,
        title:'Homa Bay County Monday Management & Field Care Review',
        pushedBy:'Homa Bay County Admin Assistant', pushedAt:mondayDate+'T07:50:00Z', pushedLive:true,
        chair:'County Office Administrator · Homa Bay',
        venue:'Homa Bay County Office & CareLink Live Workspace',
        items:[
          { time:'08:00 – 08:20', topic:'Opening devotion, weekly field safety briefing & reliever delegation confirmation', owner:'County Admin Assistant' },
          { time:'08:20 – 08:55', topic:'Previous week’s physical assessments entered & scanned signature verification', owner:'County Admin Assistant & Coordinators' },
          { time:'08:55 – 09:30', topic:'Caregiver household concerns, Homa Bay Teaching & Referral inpatient updates & BMI watch', owner:'MCM & Caregivers' },
          { time:'09:30 – 10:00', topic:'Monday foodbag order calculation, mosquito net county stock & weekly route plan', owner:'Procurement & Coordinators' }
        ]
      }
    ];
    DB.db.mondayNotes = DB.db.mondayNotes || [
      {
        id:'mn-1', countyId:'kisumu', weekOf:mondayDate, authorId:'u-demo', authorName:'Nyalenda Care Team', dept:'ministry',
        visibility:'team', text:'Confirmed 3 new physical assessments from Nyalenda scanned (4/4 pages) and queued 2 hospital MOPC follow-ups for Wednesday.',
        actionItem:'Follow up SHA last payment receipt for discharge candidate before Thursday.', actionOwner:'Nyalenda Coordinator', actionDue:mondayDate, status:'open', createdAt:mondayDate+'T09:12:00Z'
      }
    ];
    DB.db.mondayProposals = DB.db.mondayProposals || [
      {
        id:'mp-ksm-1', countyId:'kisumu', weekOf:mondayDate, areaName:'Nyalenda', dept:'ministry',
        proposedBy:'Ministry Area Coordinator · Nyalenda', roleName:'Ministry Area Coordinator',
        title:'Prioritise 4 SAM/Underweight households for Bag 1 + therapeutic nutrition check',
        rationale:'Recent home anthropometry identified 4 households requiring joint Caregiver + MCM review this week.',
        minutesEst:10, priority:'high', status:'included', createdAt:mondayDate+'T07:20:00Z'
      },
      {
        id:'mp-ksm-2', countyId:'kisumu', weekOf:mondayDate, areaName:'Kisumu HQ', dept:'hospital',
        proposedBy:'Hospital Liaison · JOOTRH Desk', roleName:'Hospital Liaison Officer',
        title:'Wednesday MOPC & Physiotherapy escort vehicle coordination (5 beneficiaries)',
        rationale:'Align fleet departure by 07:15 EAT so specialist clinic queue cards are secured early.',
        minutesEst:8, priority:'normal', status:'proposed', createdAt:mondayDate+'T07:35:00Z'
      },
      {
        id:'mp-hb-1', countyId:'homabay', weekOf:mondayDate, areaName:'Homa Bay Town', dept:'ministry',
        proposedBy:'Homa Bay Area Coordinator', roleName:'Ministry Area Coordinator',
        title:'Verify full-page physical discharge scans & LLIN mosquito net stock count',
        rationale:'Ensure County MoH mosquito net stock is issued first before raising external requisitions.',
        minutesEst:10, priority:'high', status:'included', createdAt:mondayDate+'T07:30:00Z'
      }
    ];
    DB.db.mondayMinutesLedger = DB.db.mondayMinutesLedger || {};
    DB.db.mondayMinutesTemplates = DB.db.mondayMinutesTemplates || [];
    DB.db.mondayProcessedPlans = DB.db.mondayProcessedPlans || {};
    DB.db.procRequisitions = DB.db.procRequisitions || [
      {
        id:'PRQ-2026-104', countyId:'kisumu', date:mondayDate, category:'Weekly Foodbags (Bag 1 & Bag 2)',
        amountKes:148500, quotesCount:3, tier:'Tier 3 · Medium Threshold',
        paymentMode:'Crossed Cheque', chequeMaturity:mondayDate, etimsRef:'ETIMS-KRA-88412',
        coiSigned:true, grnVerified:true, status:'approved'
      },
      {
        id:'PRQ-2026-105', countyId:'homabay', date:mondayDate, category:'Inpatient Milk & Oranges + Emergency Transport',
        amountKes:4480, quotesCount:1, tier:'Tier 1 · Micro Purchase',
        paymentMode:'M-Pesa Paybill', chequeMaturity:'Immediate', etimsRef:'MPESA-RCPT-4190',
        coiSigned:true, grnVerified:true, status:'approved'
      },
      {
        id:'PRQ-2026-106', countyId:'kisumu', date:mondayDate, category:'Q4 Quarterly Hygiene Packs (Ladies & Men)',
        amountKes:268400, quotesCount:4, tier:'Tier 4 · Major Tender',
        paymentMode:'Dual-Signatory EFT / Cheque', chequeMaturity:'2026-10-30', etimsRef:'Pending delivery eTIMS',
        coiSigned:true, grnVerified:false, status:'pending_director'
      }
    ];
    DB.db.foodCalcState = DB.db.foodCalcState || {
      kisumu:  { lastWeek:118, discharged:4, deceased:0, newIntakes:6, inpatient:5, medOnly:7, stockBg1:9, stockBg2:4 },
      homabay: { lastWeek:64,  discharged:2, deceased:0, newIntakes:3, inpatient:3, medOnly:4, stockBg1:5, stockBg2:2 }
    };
  },

  /* Synthesize structured Master Agenda Pack for Admin Assistants (Monday Meeting Secretaries) */
  buildSecretaryMasterPack(countyId){
    this.ensureStore();
    const agenda = (DB.db.mondayAgendas||[]).find(a=>a.countyId===countyId) || DB.db.mondayAgendas[0];
    const proposals = (DB.db.mondayProposals||[]).filter(p=>p.countyId===countyId);
    const notes = (DB.db.mondayNotes||[]).filter(n=>n.countyId===countyId && n.visibility!=='private');
    const cPts = (DB.db.patients||[]).filter(p=>p.countyId===countyId && p.status==='active');
    const cConcerns = (DB.db.concerns||[]).filter(c=>c.status==='open' && cPts.some(p=>p.id===c.patientId));
    const over120 = cPts.filter(p=>PAT.days(p)>=120).length;
    const foodSt = (DB.db.foodCalcState && DB.db.foodCalcState[countyId]) || DB.db.foodCalcState.kisumu;
    const foodCalc = this.computeFoodOrder(foodSt);

    const masterItems = [
      ...(agenda.items||[]).map((it, idx)=>({
        seq: idx + 1, source:'Standing Agenda', dept:'County Management', time:it.time,
        topic:it.topic, lead:it.owner, priority:'core', status:'confirmed'
      })),
      ...proposals.map((pr, idx)=>({
        seq: (agenda.items||[]).length + idx + 1,
        source: `${titleCase(pr.dept||'Department')} · ${pr.areaName||countyName(countyId)}`,
        dept: titleCase(pr.dept||'Operations'),
        time: `${pr.minutesEst||10} min`,
        topic: `${pr.title} — ${pr.rationale||''}`,
        lead: pr.proposedBy,
        priority: pr.priority || 'normal',
        status: pr.status || 'proposed',
        proposalId: pr.id
      }))
    ];
    return {
      countyId,
      countyLabel: countyName(countyId),
      weekOf: agenda.weekOf,
      chair: agenda.chair,
      secretary: `${countyName(countyId)} County Admin Assistant`,
      masterItems,
      proposalsCount: proposals.length,
      notesCount: notes.length,
      actions: notes.filter(n=>n.actionItem),
      openConcernsCount: cConcerns.length,
      over120Count: over120,
      foodCalc
    };
  },

  /* Post-Close Meeting Processing Engine (System Intelligence + CareLink AI):
     Processes closed sitting inputs into Weekly Operational Plans, Secretary Master Minutes,
     Departmental Action Dispatches & Global/County Updates. */
  runProcessingEngine(countyOrOpts, actor){
    this.ensureStore();
    const countyId = (typeof countyOrOpts === 'object' && countyOrOpts !== null)
      ? String(countyOrOpts.countyId || 'kisumu')
      : String(countyOrOpts || 'kisumu');
    const pack = this.buildSecretaryMasterPack(countyId);
    const agenda = (DB.db.mondayAgendas||[]).find(a=>a.countyId===countyId) || DB.db.mondayAgendas[0];
    const nowIso = new Date().toISOString();
    agenda.sittingStatus = 'closed_processed';
    agenda.closedAt = nowIso;
    agenda.closedBy = actor ? actor.name.replace(/^Demo - /,'') : 'County Chair';

    /* Promote all pending proposals into processed resolution state */
    (DB.db.mondayProposals||[]).filter(p=>p.countyId===countyId && p.status==='proposed').forEach(p=>{ p.status = 'processed'; });

    const directives = [
      {
        dept:'admin', deptLabel:'County Administration & Meeting Secretary',
        owner:`${pack.countyLabel} County Admin Assistant`,
        directive:`Finalise & archive Official Monday Sitting Minutes (${pack.masterItems.length} master agenda items, ${pack.actions.length} tracked action items) and verify full-page scans on all new physical assessments/discharges.`
      },
      {
        dept:'ministry', deptLabel:'Field Ministry & Area Coordinators',
        owner:`${pack.countyLabel} Ministry Area Coordinators & Caregivers`,
        directive:`Execute weekly household visit routes, resolve ${pack.openConcernsCount} open beneficiary concern(s), and complete due 30-day PDCA reviews across ${pack.countyLabel} areas.`
      },
      {
        dept:'medical', deptLabel:'Medical Case Management & Nursing',
        owner:`${pack.countyLabel} Medical Case Manager`,
        directive:`Review ${pack.over120Count} active 120+ day extended beneficiary dossier(s) using the Official CareLink C-DIMS PDCA Report and clear pending discharge recommendations.`
      },
      {
        dept:'procure', deptLabel:'Procurement & Weekly Foodbag Supply',
        owner:'Procurement & Store Desk',
        directive:`Prepare policy-checked order for ${pack.foodCalc.bg1ToOrder} Bag 1 + ${pack.foodCalc.bg2ToOrder} Bag 2 + ${pack.foodCalc.inpPacks} Inpatient bedside packs (projected ceiling ${money(pack.foodCalc.projectedCost)}).`
      },
      {
        dept:'hospital', deptLabel:'Hospital Focal Desk & Fleet Escorts',
        owner:`${pack.countyLabel} Hospital Liaison & Fleet Officer`,
        directive:`Coordinate MOPC/GOPC/SOPC/Physiotherapy escorts, confirm bedside nutrition delivery, and reconcile hospital receipts within 48 hours.`
      }
    ];

    const plan = {
      id: 'MPP-' + countyId.toUpperCase() + '-' + pack.weekOf,
      countyId,
      countyLabel: pack.countyLabel,
      weekOf: pack.weekOf,
      processedAt: nowIso,
      processedBy: agenda.closedBy,
      engineLabel: 'CareLink AI + System Intelligence Meeting Processing Engine v6.6',
      executiveSummary: `${pack.countyLabel} Monday Management Sitting closed & processed: ${pack.masterItems.length} structured agenda blocks, ${pack.proposalsCount} team proposal(s), ${pack.notesCount} deliberation note(s), and ${pack.actions.length} tracked action item(s) converted into live departmental operational plans.`,
      directives,
      deptDirectives: directives,
      actionItems: pack.actions.map((a, i)=>({
        ref:`ACT-${i+1}`,
        task:a.actionItem,
        owner:a.actionOwner || a.authorName,
        due:a.actionDue || pack.weekOf,
        status:a.status || 'dispatched'
      })),
      metrics:{
        agendaBlocks: pack.masterItems.length,
        openConcerns: pack.openConcernsCount,
        over120Cases: pack.over120Count,
        netFoodBags: pack.foodCalc.bg1ToOrder + pack.foodCalc.bg2ToOrder,
        projectedFoodKes: pack.foodCalc.projectedCost
      }
    };

    DB.db.mondayProcessedPlans[countyId] = plan;

    /* Pre-populate / enrich Secretary Minutes Ledger for Admin Assistants */
    const curMin = DB.db.mondayMinutesLedger[countyId] || {};
    DB.db.mondayMinutesLedger[countyId] = Object.assign({
      weekOf: pack.weekOf,
      countyId,
      secretaryName: curMin.secretaryName || `${pack.countyLabel} County Admin Assistant`,
      chairName: agenda.chair,
      attendanceSummary: curMin.attendanceSummary || `All ${pack.countyLabel} Department Leads, Coordinators, Caregivers & Admin Secretary present.`,
      keyResolutions: directives.map((d,i)=>`${i+1}. [${d.deptLabel}] ${d.directive}`).join('\n'),
      customNotes: curMin.customNotes || '',
      templateId: curMin.templateId || 'standard-cdims-minutes',
      updatedAt: nowIso
    }, curMin, { lastProcessedAt: nowIso, autoMasterItems: pack.masterItems });

    /* Push operational log entry & notify county accounts */
    DB.db.workflowActionsLog = DB.db.workflowActionsLog || [];
    DB.db.workflowActionsLog.unshift({
      at: nowIso,
      actor: actor ? actor.name.replace(/^Demo - /,'') : 'System',
      action: `Monday Sitting Closed & AI-Processed (${pack.countyLabel})`,
      detail: `${directives.length} departmental operational directives & Secretary Master Agenda Pack dispatched.`
    });

    const countyStaff = (DB.db.users||[]).filter(u=>u.active && (u.countyId===countyId || ['director','program.admin','program.assistant','chief'].includes(u.roleId)));
    countyStaff.forEach(u=>{
      const isSec = ['assistant','program.assistant'].includes(u.roleId);
      notify(u.id,
        isSec ? `Processed Master Monday Pack Ready (${pack.countyLabel})` : `${pack.countyLabel} Weekly Operational Plan Dispatched`,
        isSec ? `All ${pack.masterItems.length} Monday agenda items & deliberations have been structured for your Secretary Minutes Desk.` : plan.executiveSummary,
        'ok');
    });

    AUDIT.append({
      actor: actor ? actor.id : 'system',
      action: 'monday.sitting.closed_and_processed',
      entity: 'monday_meeting',
      entityId: plan.id,
      detail: plan.executiveSummary
    });
    DB.save();
    return plan;
  },

  /* ---------------- 1. MONDAY MANAGEMENT MEETING MODULE ---------------- */
  render(user, params={}){
    if(!RBAC.can(user,'monday.meeting',{}).ok) return deniedPanel('monday.meeting');
    this.ensureStore();
    const isMondayToday = new Date().getDay() === 1;
    const isSecretaryRole = ['assistant','program.assistant'].includes(user.roleId);
    const canManageAgenda = RBAC.has(user,'monday.manage') || isSecretaryRole || ['countyadmin','director','program.admin','chief'].includes(user.roleId);
    const selectedCounty = (isGlobal(user) && params.county) ? params.county : (user.countyId || 'kisumu');
    const defaultTab = isSecretaryRole ? 'secretary' : 'agenda';
    const tab = params.tab || defaultTab;

    const agenda = (DB.db.mondayAgendas||[]).find(a=>a.countyId===selectedCounty) || DB.db.mondayAgendas[0];
    const isClosed = agenda.sittingStatus === 'closed_processed';
    const processedPlan = (DB.db.mondayProcessedPlans||{})[selectedCounty] || null;
    const secPack = this.buildSecretaryMasterPack(selectedCounty);

    const hasPatientScope = RBAC.has(user,'patient.list') && !['mediahead','pr','finance','procurement','hr','welfare','vehicle','auditor','it','gov.partner','president'].includes(user.roleId);
    const ps = hasPatientScope ? repo.patientList(user).filter(p=>!selectedCounty || isGlobal(user) ? p.countyId===selectedCounty : true) : [];

    const recentAssessments = hasPatientScope ? [
      ...((DB.db.hardcopyBatches||[]).filter(b=>b.countyId===selectedCounty && b.kind!=='discharge').map(b=>({
        ref:b.formCode, patientName:b.patientName, patientId:b.patientId, area:areaName(b.areaId), date:b.enteredAt,
        summary:`Hard-copy ${b.formCode} (${b.uploadedPages?.length||4} scanned pages verified)`, status:'Verified & Scanned'
      }))),
      ...(ps.slice(0,8).map(p=>({
        ref:p.code, patientName:p.name, patientId:p.id, area:areaName(p.areaId), date:(p.enrolledAt||p.intake||todayISO()).slice(0,10),
        summary:p.clinical?.diagnosis || 'Initial household & nutritional assessment', status:titleCase(p.status)
      })))
    ].slice(0,12) : [];

    const openConcerns = hasPatientScope
      ? (DB.db.concerns||[]).filter(c=>c.status==='open' && ps.some(p=>p.id===c.patientId))
      : [];

    const visibleNotes = (DB.db.mondayNotes||[]).filter(n=>
      n.countyId===selectedCounty && (n.visibility==='team' || n.authorId===user.id || canManageAgenda)
    );
    const proposals = (DB.db.mondayProposals||[]).filter(p=>p.countyId===selectedCounty);

    const countySwitcher = isGlobal(user) ? `<div class="row" style="gap:6px">
      ${COUNTIES.map(c=>`<button class="btn btn-xs ${selectedCounty===c.id?'btn-primary':'btn-ghost'}" data-act="go" data-v="monday" data-county="${c.id}" data-tab="${esc(tab)}">${esc(c.name)}</button>`).join('')}
    </div>` : '';

    const utilDrop = (typeof utilMenu==='function') ? utilMenu('Sitting Utilities', [
      { label:'Propose Team Agenda Item', icon:'plus', act:'monday-propose-modal', attrs:`data-county="${esc(selectedCounty)}"` },
      ...(canManageAgenda ? [
        { label:'Add Official Agenda Block', icon:'clipboard', act:'monday-agenda-modal', attrs:`data-county="${esc(selectedCounty)}"` },
        { label:`Broadcast Reminder to ${countyName(selectedCounty)}`, icon:'send', act:'monday-push-notify', attrs:`data-county="${esc(selectedCounty)}"` },
        { divider:true },
        isClosed
          ? { label:'Reopen Sitting for Addendum', icon:'refresh', act:'monday-reopen-sitting', attrs:`data-county="${esc(selectedCounty)}"` }
          : { label:'Close Sitting & Run AI Processing Engine', icon:'sparkles', act:'monday-close-and-process', attrs:`data-county="${esc(selectedCounty)}"` }
      ] : []),
      { divider:true },
      { label:'Print / Export Sitting Pack', icon:'download', act:'print' }
    ], { icon:'settings' }) : '';

    let body = '';
    if(tab==='agenda'){
      body = `<div class="grid g2">
        ${card(`${countyName(selectedCounty)} Official Sitting Agenda & Team Proposals`, `
          <div class="spread small" style="margin-bottom:10px;flex-wrap:wrap;gap:8px">
            <span>Secretary: <b>${esc(agenda.pushedBy)}</b> &middot; Chair: <b>${esc(agenda.chair)}</b></span>
            ${isClosed ? badge('Sitting Closed & AI-Processed','b-ok') : (agenda.pushedLive ? badge('Live County Sitting','b-info') : badge('Preparation Mode','b-warn'))}
          </div>
          <div class="xs muted" style="margin-bottom:12px">${ic('calendar',13)} Week of <b>${esc(fmtDate(agenda.weekOf))}</b> &middot; Venue: <b>${esc(agenda.venue)}</b></div>
          <ol class="monday-agenda-list">
            ${(agenda.items||[]).map((it,idx)=>`<li class="monday-agenda-item">
              <div class="mon-time mono">${esc(it.time)}</div>
              <div class="mon-topic">
                <b>${idx+1}. ${esc(it.topic)}</b>
                <div class="xs muted">Lead: ${esc(it.owner)}</div>
              </div>
            </li>`).join('')}
          </ol>
          <div class="divider"></div>
          <div class="spread" style="margin-bottom:8px;flex-wrap:wrap;gap:8px">
            <span class="xs bold muted" style="text-transform:uppercase;letter-spacing:.08em">Proposed by ${esc(countyName(selectedCounty))} Accounts &amp; Ministry Areas (${proposals.length})</span>
            <button class="btn btn-xs btn-primary" data-act="monday-propose-modal" data-county="${esc(selectedCounty)}">${ic('plus',12)} Propose Agenda Item</button>
          </div>
          <div class="col" style="gap:8px">
            ${proposals.map(pr=>`<div class="monday-note-card">
              <div class="spread xs" style="gap:6px;flex-wrap:wrap">
                <span><b>${esc(pr.title)}</b></span>
                <div class="row" style="gap:6px">
                  ${badge(pr.areaName||countyName(selectedCounty),'b-neutral',false)}
                  ${badge(titleCase(pr.status||'proposed'), pr.status==='included'||pr.status==='processed'?'b-ok':'b-warn', false)}
                </div>
              </div>
              <div class="xs muted" style="margin-top:3px">${esc(pr.rationale||'')}</div>
              <div class="spread xs muted" style="margin-top:5px">
                <span>Proposed by: <b>${esc(pr.proposedBy)}</b> (${esc(pr.minutesEst||10)} min)</span>
                ${canManageAgenda && pr.status==='proposed' ? `<button class="btn btn-xs btn-ghost" data-act="monday-adopt-proposal" data-id="${esc(pr.id)}" data-county="${esc(selectedCounty)}">${ic('check',11)} Adopt onto Agenda</button>` : ''}
              </div>
            </div>`).join('') || `<div class="xs muted">No additional team proposals submitted yet.</div>`}
          </div>
        `)}
        ${card('Write Meeting Notes & Assign Action Items', `
          <form id="mondayNoteForm" style="margin-bottom:14px">
            <input type="hidden" name="countyId" value="${esc(selectedCounty)}">
            <div class="field"><label>Meeting deliberation / departmental update *</label>
              <textarea class="input" name="text" rows="3" required placeholder="Record decisions, ministry area updates, hospital escort coordination or resource needs for ${esc(countyName(selectedCounty))}..."></textarea>
            </div>
            <div class="grid g2">
              <div class="field"><label>Action item to dispatch (optional)</label>
                <input class="input" name="actionItem" placeholder="e.g. Verify Nyalenda physical discharge scans">
              </div>
              <div class="field"><label>Action owner / department</label>
                <input class="input" name="actionOwner" value="${esc((roleObj(user.roleId)||{}).name||user.name.replace(/^Demo - /,''))}">
              </div>
            </div>
            <div class="grid g2">
              <div class="field"><label>Target completion date</label>
                <input class="input" type="date" name="actionDue" value="${esc(todayISO().slice(0,10))}">
              </div>
              <div class="field"><label>Note visibility</label>
                <select class="input" name="visibility">
                  <option value="team">Shared with ${esc(countyName(selectedCounty))} sitting &amp; AI processor</option>
                  <option value="private">Personal notebook (visible only to me)</option>
                </select>
              </div>
            </div>
            <button type="button" class="btn btn-sm btn-primary" data-act="monday-note-save">${ic('check',14)} Save Note &amp; Action Item</button>
          </form>
          <div class="divider"></div>
          <div class="xs bold muted" style="text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Recorded Notes &amp; Action Items (${visibleNotes.length})</div>
          <div class="col" style="gap:8px;max-height:320px;overflow-y:auto">
            ${visibleNotes.map(n=>`<div class="monday-note-card">
              <div class="spread xs muted">
                <span><b>${esc(n.authorName)}</b> &middot; ${esc((n.createdAt||'').slice(0,10))}</span>
                ${badge(n.visibility==='private'?'Personal':'County Shared', n.visibility==='private'?'b-neutral':'b-info', false)}
              </div>
              <div class="small" style="margin-top:4px">${esc(n.text)}</div>
              ${n.actionItem?`<div class="spread xs" style="margin-top:6px;padding-top:5px;border-top:1px dashed var(--line);color:var(--accent-fg,var(--accent))">
                <span><b>Action:</b> ${esc(n.actionItem)} <i>(${esc(n.actionOwner||n.authorName)})</i></span>
                <button class="btn btn-xs ${n.status==='done'?'btn-ghost':'btn-soft'}" data-act="monday-toggle-action" data-id="${esc(n.id)}">${n.status==='done'?'Completed ✓':'Mark Done'}</button>
              </div>`:''}
            </div>`).join('') || `<div class="xs muted">No notes recorded for this Monday session yet.</div>`}
          </div>
        `)}
      </div>`;
    }

    if(tab==='secretary'){
      const minRec = (DB.db.mondayMinutesLedger||{})[selectedCounty] || {};
      const tpls = DB.db.mondayMinutesTemplates || [];
      body = `<div class="alert info" style="margin-bottom:14px">${ic('clipboard',16)}
        <div><b>Admin Assistant · Official Monday Management Meeting Secretary Desk (${esc(countyName(selectedCounty))})</b>
          <div class="xs">Receives the processed master compilation of all standing agenda items, team proposals, action items and resolutions so the Admin Assistant can record, format and archive official Monday Minutes cleanly.</div>
        </div>
      </div>
      <div class="grid g2">
        ${card(`Processed Master Agenda Compilation (${secPack.masterItems.length} Items)`, `
          ${table([
            {label:'#', cls:'mono', render:r=>`<b>${r.seq}</b>`},
            {label:'Time / Est.', cls:'mono', render:r=>esc(r.time)},
            {label:'Master Agenda Topic & Source', render:r=>`<b>${esc(r.topic)}</b><div class="xs muted">${esc(r.source)} &middot; Lead: ${esc(r.lead)}</div>`},
            {label:'State', render:r=>badge(titleCase(r.status), r.status==='confirmed'||r.status==='included'||r.status==='processed'?'b-ok':'b-warn', false)}
          ], secPack.masterItems)}
        `, {sub:`Automatically structured across all ${countyName(selectedCounty)} departments & ministry areas.`})}
        ${card('Official Minutes Recording Desk & Custom Template Slot', `
          <form id="mondayMinutesForm">
            <input type="hidden" name="countyId" value="${esc(selectedCounty)}">
            <div class="grid g2">
              <div class="field"><label>Recording Secretary (Admin Assistant)</label>
                <input class="input" name="secretaryName" value="${esc(minRec.secretaryName || user.name.replace(/^Demo - /,''))}">
              </div>
              <div class="field"><label>Minutes Format / Uploaded Template</label>
                <select class="input" name="templateId">
                  <option value="standard-cdims-minutes">CareLink Standard Management Minutes</option>
                  ${tpls.map(t=>`<option value="${esc(t.id)}" ${minRec.templateId===t.id?'selected':''}>${esc(t.name)} (Uploaded)</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="field"><label>Attendance &amp; Apologies Roll</label>
              <input class="input" name="attendanceSummary" value="${esc(minRec.attendanceSummary || `All ${countyName(selectedCounty)} Department Leads, Area Coordinators & Caregivers present`)}">
            </div>
            <div class="field"><label>Structured Resolutions &amp; Departmental Directives</label>
              <textarea class="input" name="keyResolutions" rows="4" placeholder="Record numbered sitting resolutions (or click 'Close Sitting & Run AI Engine' to auto-populate from deliberations)...">${esc(minRec.keyResolutions || '')}</textarea>
            </div>
            <div class="field"><label>Secretary’s Additional Verbatim Minutes &amp; Follow-Up Notes</label>
              <textarea class="input" name="customNotes" rows="3" placeholder="Capture verbatim discussion highlights, special approvals or next Monday carryover items...">${esc(minRec.customNotes || '')}</textarea>
            </div>
            <div class="spread" style="gap:8px;flex-wrap:wrap">
              <div class="row" style="gap:8px;flex-wrap:wrap">
                <button type="button" class="btn btn-sm btn-primary" data-act="monday-minutes-save">${ic('save',14)} Save Official Minutes</button>
                <button type="button" class="btn btn-sm btn-ghost" data-act="monday-minutes-word" data-county="${esc(selectedCounty)}">${ic('download',14)} Export Minutes (.doc)</button>
              </div>
              <button type="button" class="btn btn-xs btn-soft" data-act="monday-upload-minutes-tpl">${ic('upload',12)} Upload Custom Minutes Template</button>
            </div>
          </form>
        `, {sub: tpls.length ? `${tpls.length} custom minutes template(s) installed and ready.` : 'Ready to accept an uploaded custom Official Minutes Template (.docx / .md / .txt) at any time.'})}
      </div>`;
    }

    if(tab==='engine'){
      body = processedPlan ? `<div class="col" style="gap:14px">
        <div class="alert ok">${ic('sparkles',16)}
          <div><b>${esc(processedPlan.engineLabel)} &middot; Run ${esc(fmtDateTime(processedPlan.processedAt))}</b>
            <div class="small" style="margin-top:2px">${esc(processedPlan.executiveSummary)}</div>
          </div>
        </div>
        <div class="grid g2">
          ${card(`Generated Weekly Operational Directives · ${processedPlan.countyLabel}`, table([
            {label:'Department', render:d=>`<b>${esc(d.deptLabel)}</b><div class="xs muted">${esc(d.owner)}</div>`},
            {label:'Weekly Operational Directive Dispatched', render:d=>`<span class="small">${esc(d.directive)}</span>`}
          ], processedPlan.directives))}
          ${card(`Dispatched Action Tracker (${processedPlan.actionItems.length})`, processedPlan.actionItems.length ? table([
            {label:'Ref', cls:'mono', render:a=>`<b>${esc(a.ref)}</b>`},
            {label:'Action Item', render:a=>esc(a.task)},
            {label:'Owner', render:a=>esc(a.owner)},
            {label:'Due', render:a=>esc(fmtDate(a.due))},
            {label:'State', render:a=>badge(titleCase(a.status),'b-ok',false)}
          ], processedPlan.actionItems) : emptyState('Zero pending action items','All sitting actions have been cleared or incorporated into standing directives.','check'))}
        </div>
      </div>` : card('Meeting Processing Engine Ready',
        emptyState('Sitting still open for team proposals & notes',
          `Once the ${countyName(selectedCounty)} Monday Management Sitting concludes, click "Close Sitting & Push to AI Engine" to process all proposed agendas, notes, patient escalations and action items into weekly departmental operational plans and the Admin Assistant's Master Minutes Pack.`,
          'sparkles',
          canManageAgenda ? `<button class="btn btn-sm btn-primary" data-act="monday-close-and-process" data-county="${esc(selectedCounty)}">${ic('sparkles',14)} Close Sitting &amp; Run AI Processing Engine Now</button>` : ''));
    }

    if(tab==='assessments'){
      body = hasPatientScope
        ? card(`Previous Week's Assessments & New Intakes · ${countyName(selectedCounty)}`,
            table([
              {label:'Ref / Code', cls:'mono', render:r=>esc(r.ref)},
              {label:'Beneficiary', render:r=>`<button class="linkbtn cellname" data-act="go" data-v="patient" data-id="${esc(r.patientId)}">${esc(r.patientName)}</button>`},
              {label:'Ministry Area', render:r=>esc(r.area)},
              {label:'Assessment Date', render:r=>esc(fmtDate(r.date))},
              {label:'Clinical / Intake Summary', render:r=>`<span class="small">${esc(r.summary)}</span>`},
              {label:'Status', render:r=>badge(r.status,'b-ok')}
            ], recentAssessments, {emptyMsg:'No recent assessments in your county/ministry-area scope.'}),
            {sub:'Reviewed jointly by Caregivers, Coordinators, MCM, and County Admin Assistants every Monday morning.'})
        : card('Role Confidentiality Boundary', emptyState('Patient-level assessments belong to Field & Clinical Consoles',
            'Your non-clinical department participates in the Monday county agenda, logistics, and action tracker without exposing individual clinical assessment charts.', 'shield'));
    }

    if(tab==='concerns'){
      body = hasPatientScope
        ? card(`Open Ministry Patient Concerns & Escalations · ${countyName(selectedCounty)} (${openConcerns.length})`,
            table([
              {label:'Severity', render:c=>badge(titleCase(c.severity||'moderate'), c.severity==='critical'||c.severity==='high'?'b-crit':'b-warn')},
              {label:'Patient & Area', render:c=>{ const p=ps.find(x=>x.id===c.patientId); return p?`<button class="linkbtn cellname" data-act="go" data-v="patient" data-id="${esc(p.id)}">${esc(p.name)}</button><div class="xs muted mono">${esc(p.code)} &middot; ${esc(areaName(p.areaId))}</div>`:esc(c.patientId); }},
              {label:'Concern Raised by Caregiver', render:c=>`<b>${esc(c.title||c.category||'Household / Clinical Concern')}</b><div class="xs muted">${esc(c.detail||c.note||'')}</div>`},
              {label:'Monday Escalation', cls:'act', render:c=>`<div class="row" style="gap:6px;justify-content:flex-end">
                <button class="btn btn-xs btn-soft" data-act="monday-escalate-concern" data-id="${esc(c.id)}" data-county="${esc(selectedCounty)}">${ic('plus',11)} Add to Agenda</button>
                <button class="btn btn-xs btn-ghost" data-act="go" data-v="patient" data-id="${esc(c.patientId)}">Chart</button>
              </div>`}
            ], openConcerns, {emptyMsg:'All logged patient concerns in your office location have been resolved.'}))
        : card('Role Confidentiality Boundary', emptyState('Patient clinical concerns are scoped to Caregivers, Coordinators & MCM',
            'Use the County Agenda & Notes tab to coordinate non-clinical departmental support for the week.', 'shield'));
    }

    return pageHead('Monday Management Meeting & AI Processing Console',
      `Role- and county-scoped coordination hub (${countyName(selectedCounty)}) — propose agenda items, record deliberations and action items, equip Admin Assistants as Meeting Secretaries, and run the post-close AI Meeting Processing Engine.`,
      `${countySwitcher}
       <button class="btn btn-sm btn-ghost" data-act="monday-propose-modal" data-county="${esc(selectedCounty)}">${ic('plus',14)} Propose Agenda</button>
       ${canManageAgenda && !isClosed ? `<button class="btn btn-sm btn-primary" data-act="monday-close-and-process" data-county="${esc(selectedCounty)}">${ic('sparkles',14)} Close &amp; Process Sitting</button>` : ''}
       ${utilDrop}`)
    + `<div class="monday-banner ${isMondayToday?'is-monday':''}">
        <div class="row" style="gap:12px;flex-wrap:wrap">
          <div class="monday-cal-badge"><span>MON</span><b>${esc(agenda.weekOf.slice(8,10))}</b></div>
          <div>
            <div class="xs bold" style="text-transform:uppercase;letter-spacing:.09em">${isClosed?'SITTING CLOSED · WEEKLY OPERATIONAL PLAN LIVE':(isMondayToday?'LIVE MONDAY SITTING IN PROGRESS':'OPEN FOR AGENDA PROPOSALS, NOTES & PREPARATION')}</div>
            <b style="font-size:15.5px">${esc(agenda.title)}</b>
            <div class="xs" style="opacity:.9">Office: <b>${esc(countyName(selectedCounty))}</b> &middot; Secretary: <b>${esc(agenda.pushedBy)}</b> &middot; ${secPack.masterItems.length} master agenda items &middot; ${proposals.length} team proposals</div>
          </div>
        </div>
        <span class="badge ${isClosed?'b-ok':(isMondayToday?'b-info':'b-warn')}">${isClosed?'Processed & Dispatched':(isMondayToday?'Live Sitting':'Open Preparation')}</span>
      </div>`
    + `<div class="grid g4" style="margin:14px 0">
        ${kpi('Master agenda & proposals', `${(agenda.items||[]).length} + ${proposals.length}`, `${secPack.masterItems.length} compiled for Secretary`, 'info', 'clipboard')}
        ${kpi('Ministry concerns & intakes', hasPatientScope?`${openConcerns.length} / ${recentAssessments.length}`:'Role-scoped', hasPatientScope?`${openConcerns.length} concerns · ${recentAssessments.length} intakes`:'Protected clinical boundary', openConcerns.length?'warn':'ok', 'alert')}
        ${kpi('Notes & action items', num(visibleNotes.length), `${visibleNotes.filter(n=>n.actionItem).length} tracked action item(s)`, 'ok', 'file')}
        ${kpi('AI Processing Engine', isClosed?'Dispatched':'Awaiting Close', isClosed?`${processedPlan?.directives?.length||5} dept plans active`:'Runs when sitting closes', isClosed?'ok':'info', 'sparkles')}
      </div>`
    + `<div class="tabs">
        <button class="tab ${tab==='agenda'?'active':''}" data-act="go" data-v="monday" data-tab="agenda" data-county="${esc(selectedCounty)}">${ic('clipboard',14)} Agenda, Proposals &amp; Notes</button>
        ${(canManageAgenda || isSecretaryRole) ? `<button class="tab ${tab==='secretary'?'active':''}" data-act="go" data-v="monday" data-tab="secretary" data-county="${esc(selectedCounty)}">${ic('file',14)} Secretary &amp; Minutes Desk (${secPack.masterItems.length})</button>` : ''}
        <button class="tab ${tab==='engine'?'active':''}" data-act="go" data-v="monday" data-tab="engine" data-county="${esc(selectedCounty)}">${ic('sparkles',14)} AI Weekly Plan Engine ${isClosed?'✓':''}</button>
        ${hasPatientScope?`<button class="tab ${tab==='concerns'?'active':''}" data-act="go" data-v="monday" data-tab="concerns" data-county="${esc(selectedCounty)}">Ministry Concerns (${openConcerns.length})</button>
        <button class="tab ${tab==='assessments'?'active':''}" data-act="go" data-v="monday" data-tab="assessments" data-county="${esc(selectedCounty)}">New Intakes (${recentAssessments.length})</button>`:''}
      </div>`
    + body;
  },

  /* ---------------- 2. PROJECTED FOOD & HYGIENE BUDGET + PROCUREMENT POLICY ---------------- */
  computeFoodOrder(st){
    const totalActive = Math.max(0, Number(st.lastWeek||0) - Number(st.discharged||0) - Number(st.deceased||0) + Number(st.newIntakes||0));
    const homeEligible = Math.max(0, totalActive - Number(st.inpatient||0) - Number(st.medOnly||0));
    const bg1Needed = Math.round(homeEligible * 0.68);
    const bg2Needed = Math.max(0, homeEligible - bg1Needed);
    const bg1ToOrder = Math.max(0, bg1Needed - Number(st.stockBg1||0));
    const bg2ToOrder = Math.max(0, bg2Needed - Number(st.stockBg2||0));
    const inpPacks = Math.max(0, Number(st.inpatient||0));
    const projectedCost = bg1ToOrder * 1525 + bg2ToOrder * 1190 + inpPacks * 560;
    const benchmarkCost = bg1ToOrder * 1313 + bg2ToOrder * 1078 + inpPacks * 520;
    return { totalActive, homeEligible, bg1Needed, bg2Needed, bg1ToOrder, bg2ToOrder, inpPacks, projectedCost, benchmarkCost };
  },

  renderFoodBudget(user, params={}){
    if(!RBAC.has(user,'procurement.view') && !RBAC.has(user,'finance.view')) return deniedPanel('procurement.view');
    this.ensureStore();
    const tab = params.tab || 'calculator';
    const countyId = (isGlobal(user) && params.county) ? params.county : (user.countyId || 'kisumu');
    const st = DB.db.foodCalcState[countyId] || DB.db.foodCalcState.kisumu;
    const calc = this.computeFoodOrder(st);
    const canManage = RBAC.has(user,'procurement.manage') || RBAC.has(user,'finance.pay') || RBAC.has(user,'finance.budget.manage');
    const reqs = (DB.db.procRequisitions||[]).filter(r=>isGlobal(user)||!user.countyId||r.countyId===countyId);

    const countyBtns = isGlobal(user) ? `<div class="row" style="gap:6px">
      ${COUNTIES.map(c=>`<button class="btn btn-xs ${countyId===c.id?'btn-primary':'btn-ghost'}" data-act="go" data-v="foodbudget" data-county="${c.id}" data-tab="${esc(tab)}">${esc(c.name)}</button>`).join('')}
    </div>` : '';

    let body = '';
    if(tab==='calculator'){
      body = `<div class="grid g2" style="margin-bottom:16px">
        ${card(`Monday Weekly Foodbag Order Formula · ${countyName(countyId)}`, `
          <form id="foodCalcForm">
            <input type="hidden" name="countyId" value="${esc(countyId)}">
            <div class="grid g4">
              <div class="field"><label>Last week active</label><input class="input" type="number" min="0" name="lastWeek" value="${st.lastWeek}"></div>
              <div class="field"><label>Discharged (-)</label><input class="input" type="number" min="0" name="discharged" value="${st.discharged}"></div>
              <div class="field"><label>Deceased (-)</label><input class="input" type="number" min="0" name="deceased" value="${st.deceased}"></div>
              <div class="field"><label>New intakes (+)</label><input class="input" type="number" min="0" name="newIntakes" value="${st.newIntakes}"></div>
            </div>
            <div class="grid g4">
              <div class="field"><label>Inpatient admitted (-)</label><input class="input" type="number" min="0" name="inpatient" value="${st.inpatient}"></div>
              <div class="field"><label>Medical-only (-)</label><input class="input" type="number" min="0" name="medOnly" value="${st.medOnly}"></div>
              <div class="field"><label>Store stock Bag 1</label><input class="input" type="number" min="0" name="stockBg1" value="${st.stockBg1}"></div>
              <div class="field"><label>Store stock Bag 2</label><input class="input" type="number" min="0" name="stockBg2" value="${st.stockBg2}"></div>
            </div>
            <div class="spread" style="margin-top:8px;flex-wrap:wrap;gap:8px">
              <span class="xs muted">Formula: <code>Total = LastWk - Disch - Dec + New</code> · <code>HomeFood = Total - Inpatient - MedOnly</code> · <code>Order = Needed - Stock</code></span>
              ${canManage?`<button type="button" class="btn btn-xs btn-primary" data-act="foodcalc-save">${ic('refresh',13)} Recalculate & Save Projection</button>`:''}
            </div>
          </form>
        `)}
        ${card('Computed Weekly Order & Budget Projection', `
          <div class="grid g2" style="gap:10px;margin-bottom:12px">
            <div class="cm"><span class="cm-l">Total Active Caseload</span><b class="cm-v">${num(calc.totalActive)}</b><span class="cm-s">${num(calc.homeEligible)} home-foodbag eligible</span></div>
            <div class="cm"><span class="cm-l">Net Bags to Procure</span><b class="cm-v">${num(calc.bg1ToOrder + calc.bg2ToOrder)} bags</b><span class="cm-s">Bag 1: ${calc.bg1ToOrder} · Bag 2: ${calc.bg2ToOrder} · Inpatient: ${calc.inpPacks}</span></div>
            <div class="cm"><span class="cm-l">Projected Budget Ceiling</span><b class="cm-v">${money(calc.projectedCost)}</b><span class="cm-s">Bag 1 @ KES 1,525 · Bag 2 @ KES 1,190</span></div>
            <div class="cm"><span class="cm-l">Market Benchmark Estimate</span><b class="cm-v">${money(calc.benchmarkCost)}</b><span class="cm-s">Avg Bag 1 @ 1,313 · Avg Bag 2 @ 1,078</span></div>
          </div>
          <div class="note">${ic('info',14)}<span><b>Inpatient Nutrition Rule:</b> Hospitalised patients (${calc.inpPacks}) are deducted from dry home foodbags and receive bedside <b>Milk (x4) + Oranges (x4)</b> during inpatient visits.</span></div>
        `)}
      </div>`
      + card('Standard Foodbag Compositions & Projected Unit Ceilings', table([
          {label:'Code', cls:'mono', render:r=>`<b>${esc(r.code)}</b>`},
          {label:'Food Pack Category', render:r=>`<b>${esc(r.name)}</b>`},
          {label:'Projected Ceiling', cls:'num mono', render:r=>`<b>${money(r.projKes)}</b>`},
          {label:'Historical Avg', cls:'num mono', render:r=>money(r.avgKes)},
          {label:'Standardised Basket Contents', render:r=>`<span class="small">${esc(r.items)}</span>`}
        ], FOOD_BAG_COMPOSITIONS));
    }

    if(tab==='hygiene'){
      const activeF = Math.round(calc.totalActive * 0.58), activeM = Math.max(0, calc.totalActive - activeF);
      const qtrHygieneBudget = activeF * 1400 + activeM * 860;
      body = `<div class="grid g3" style="margin-bottom:16px">
        ${kpi('Quarterly Hygiene Schedule', 'Mar · Jun · Sep · Dec', '4 scheduled distributions per year + Dec gift', 'info', 'calendar')}
        ${kpi('Projected Quarterly Hygiene Cost', money(qtrHygieneBudget), `${activeF} Ladies (@ ~1,400) · ${activeM} Men (@ ~860)`, 'ok', 'package')}
        ${kpi('Mosquito Net Rule', 'County Stock First', 'Verify county LLIN stock before raising PO', 'warn', 'shield')}
      </div>`
      + card('Quarterly Hygiene Packs, Mattresses, Blankets & Mosquito Net Standards', table([
          {label:'Code', cls:'mono', render:r=>`<b>${esc(r.code)}</b>`},
          {label:'Cycle', render:r=>badge(r.quarter,'b-info','nodot')},
          {label:'Item / Pack', render:r=>`<b>${esc(r.item)}</b>`},
          {label:'Budget Band', cls:'mono', render:r=>`<b>${esc(r.rangeKes)}</b>`},
          {label:'Specification & Policy Rule', render:r=>`<span class="small">${esc(r.detail)}</span>`}
        ], HYGIENE_BEDDING_STANDARDS));
    }

    if(tab==='policy'){
      body = card('LOMAMO Procurement Policy Framework — 4-Tier Approval, Tendering & eTIMS Matrix', table([
          {label:'Threshold Tier', render:r=>`<b>${esc(r.tier)}</b><div class="xs muted mono">${esc(r.band)}</div>`},
          {label:'Quotation Rule', render:r=>esc(r.quotes)},
          {label:'Permitted Payment Channel', render:r=>`<b>${esc(r.channel)}</b>`},
          {label:'Approval Authority', render:r=>esc(r.approver)},
          {label:'Mandatory Audit & Tax Proof', render:r=>`<span class="small">${esc(r.compliance)}</span>`}
        ], PROC_TIERS), {sub:'Strict zero-personal-cash policy: every disbursement uses M-Pesa Paybill/Till or Crossed Cheque / Dual-Signatory EFT with KRA eTIMS verification.'})
      + `<div style="margin-top:16px">${card('Active Requisitions · Quote -> Cheque Maturity -> GRN -> KRA eTIMS Register', `
          <div class="spread" style="margin-bottom:10px">
            <span class="small muted">Tracks competitive quotes, Conflict-of-Interest (COI) declarations, cheque maturity dates, Goods Received Notes (GRN), and eTIMS tax invoices.</span>
            ${canManage?`<button class="btn btn-xs btn-primary" data-act="proc-req-modal" data-county="${esc(countyId)}">${ic('plus',13)} New Policy-Checked Requisition</button>`:''}
          </div>
          ${table([
            {label:'Req #', cls:'mono', render:r=>`<b>${esc(r.id)}</b><div class="xs muted">${esc(fmtDate(r.date))}</div>`},
            {label:'Category & County', render:r=>`<b>${esc(r.category)}</b><div class="xs muted">${esc(countyName(r.countyId))} · ${esc(r.tier)}</div>`},
            {label:'Amount', cls:'num mono', render:r=>`<b>${money(r.amountKes)}</b><div class="xs muted">${r.quotesCount} quote(s)</div>`},
            {label:'Payment & Maturity', render:r=>`<b>${esc(r.paymentMode)}</b><div class="xs muted">Maturity: ${esc(r.chequeMaturity)}</div>`},
            {label:'eTIMS & COI / GRN', render:r=>`<span class="mono xs">${esc(r.etimsRef)}</span><div>${r.coiSigned?badge('COI ✓','b-ok','nodot'):''} ${r.grnVerified?badge('GRN ✓','b-ok','nodot'):badge('Await GRN','b-warn','nodot')}</div>`},
            {label:'Status', render:r=>badge(r.status==='approved'?'Approved':'Pending Director', r.status==='approved'?'b-ok':'b-warn')}
          ], reqs)}
        `)}</div>`;
    }

    return pageHead('Projected food & hygiene budget + procurement governance',
      'Integrates the Monday weekly foodbag ordering formula, Bag 1 / Bag 2 / Inpatient / Quarterly Hygiene cost ceilings, and the LOMAMO 4-tier Procurement Policy Framework.',
      `${countyBtns}
       <button class="btn btn-sm btn-ghost" data-act="go" data-v="procurement">${ic('package',15)} Purchase Orders</button>
       ${canManage?`<button class="btn btn-sm btn-primary" data-act="proc-req-modal" data-county="${esc(countyId)}">${ic('plus',15)} Raise Requisition</button>`:''}`)
    + `<div class="grid g4" style="margin-bottom:14px">
        ${kpi('Weekly home foodbags needed', num(calc.bg1Needed + calc.bg2Needed), `Net order after stock: ${num(calc.bg1ToOrder + calc.bg2ToOrder)} bags`, 'ok', 'package')}
        ${kpi('Weekly food projection', money(calc.projectedCost), `Benchmark avg: ${money(calc.benchmarkCost)}`, 'info', 'wallet')}
        ${kpi('Bag 1 / Bag 2 ceilings', '1,525 / 1,190 KES', 'Working avg: 1,313 / 1,078 KES', '', 'receipt')}
        ${kpi('Compliance gate', '100% COI + eTIMS', 'Paybill / Cheque maturity enforced', 'ok', 'shieldcheck')}
      </div>`
    + `<div class="tabs">
        <button class="tab ${tab==='calculator'?'active':''}" data-act="go" data-v="foodbudget" data-tab="calculator" data-county="${esc(countyId)}">Weekly Foodbag Calculator & Baskets</button>
        <button class="tab ${tab==='hygiene'?'active':''}" data-act="go" data-v="foodbudget" data-tab="hygiene" data-county="${esc(countyId)}">Quarterly Hygiene, Bedding & Nets</button>
        <button class="tab ${tab==='policy'?'active':''}" data-act="go" data-v="foodbudget" data-tab="policy" data-county="${esc(countyId)}">4-Tier Procurement Policy, Cheque & eTIMS</button>
      </div>`
    + body;
  }
};

Object.assign(ACTIONS, {
  'monday-note-save': () => {
    const f = document.querySelector('#mondayNoteForm');
    if(!f) return;
    const fd = new FormData(f);
    const txt = String(fd.get('text')||'').trim();
    if(!txt) return toast('Enter a meeting note','','err');
    MONDAY_PROC.ensureStore();
    DB.db.mondayNotes.unshift({
      id: uid('mn'),
      countyId: fd.get('countyId') || AUTH.user.countyId || 'kisumu',
      weekOf: todayISO().slice(0,10),
      authorId: AUTH.user.id,
      authorName: AUTH.user.name.replace(/^Demo - /,''),
      dept: AUTH.user.departmentId || (roleObj(AUTH.user.roleId)||{}).dept || 'admin',
      visibility: fd.get('visibility') || 'team',
      text: txt,
      actionItem: String(fd.get('actionItem')||'').trim(),
      actionOwner: String(fd.get('actionOwner')||'').trim(),
      actionDue: String(fd.get('actionDue')||'').trim() || todayISO().slice(0,10),
      status: 'open',
      createdAt: new Date().toISOString()
    });
    AUDIT.append({ actor:AUTH.user.id, action:'monday.note.added', entity:'monday_meeting', entityId:fd.get('countyId')||'kisumu', detail:txt.slice(0,80) });
    DB.save();
    toast('Meeting note & action saved', 'Added to this week’s Monday Management Meeting & Secretary feed.', 'ok');
    render();
  },

  'monday-toggle-action': (d={}) => {
    MONDAY_PROC.ensureStore();
    const n = (DB.db.mondayNotes||[]).find(x=>x.id===d.id);
    if(!n) return;
    n.status = n.status==='done' ? 'open' : 'done';
    DB.save();
    render();
  },

  'monday-propose-modal': (d={}) => {
    const countyId = d.county || AUTH.user.countyId || 'kisumu';
    const countyAreas = ((COUNTIES.find(c=>c.id===countyId)||{}).areas)||[];
    const defaultArea = (AUTH.user.areaIds && AUTH.user.areaIds[0]) ? areaName(AUTH.user.areaIds[0]) : (countyAreas[0]?countyAreas[0].name:countyName(countyId));
    openModal({
      title:`Propose Agenda Item · ${countyName(countyId)} Monday Sitting`,
      sub:'Forwarded directly to the County Admin Assistant (Meeting Secretary) and Post-Close AI Processing Engine.',
      wide:false,
      body:`<form id="monProposeForm">
        <input type="hidden" name="countyId" value="${esc(countyId)}">
        <div class="field"><label>Proposed agenda topic *</label>
          <input class="input" name="title" required placeholder="e.g. Urgent bedside nutrition & MOPC follow-up coordination">
        </div>
        <div class="grid g3">
          <div class="field"><label>Ministry Area / Office</label>
            <select class="input" name="areaName">
              <option value="${esc(countyName(countyId)+' Office')}">${esc(countyName(countyId))} Office / Dept</option>
              ${countyAreas.map(a=>`<option value="${esc(a.name)}" ${a.name===defaultArea?'selected':''}>${esc(a.name)}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>Priority</label>
            <select class="input" name="priority"><option value="normal">Standard</option><option value="high">High / Urgent</option></select>
          </div>
          <div class="field"><label>Time (mins)</label>
            <input class="input" type="number" min="3" max="45" name="minutesEst" value="10">
          </div>
        </div>
        <div class="field"><label>Context &amp; expected decision *</label>
          <textarea class="input" name="rationale" rows="3" required placeholder="Summarise why this item requires team deliberation or resource coordination this week..."></textarea>
        </div>
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" data-act="monday-propose-save">${ic('send',14)} Submit Proposal to Secretary</button>`
    });
  },

  'monday-propose-save': () => {
    const f = document.querySelector('#monProposeForm');
    if(!f) return;
    const fd = new FormData(f);
    const title = String(fd.get('title')||'').trim();
    if(!title) return toast('Agenda title required','','err');
    MONDAY_PROC.ensureStore();
    const countyId = fd.get('countyId') || AUTH.user.countyId || 'kisumu';
    const role = roleObj(AUTH.user.roleId) || {};
    DB.db.mondayProposals.unshift({
      id: uid('mp'),
      countyId,
      weekOf: todayISO().slice(0,10),
      areaName: String(fd.get('areaName')||countyName(countyId)),
      dept: role.dept || AUTH.user.departmentId || 'ministry',
      proposedBy: `${AUTH.user.name.replace(/^Demo - /,'')} (${role.name||AUTH.user.roleId})`,
      roleName: role.name || AUTH.user.roleId,
      title,
      rationale: String(fd.get('rationale')||'').trim(),
      minutesEst: Number(fd.get('minutesEst')||10),
      priority: fd.get('priority') || 'normal',
      status: 'proposed',
      createdAt: new Date().toISOString()
    });
    AUDIT.append({ actor:AUTH.user.id, action:'monday.proposal.submitted', entity:'monday_meeting', entityId:countyId, detail:title });
    DB.save();
    closeModal(true);
    toast('Agenda proposal submitted', `Routed to the ${countyName(countyId)} Admin Assistant (Monday Meeting Secretary).`, 'ok');
    render();
  },

  'monday-adopt-proposal': (d={}) => {
    MONDAY_PROC.ensureStore();
    const pr = (DB.db.mondayProposals||[]).find(x=>x.id===d.id);
    if(!pr) return;
    pr.status = 'included';
    const ag = (DB.db.mondayAgendas||[]).find(a=>a.countyId===(d.county||pr.countyId));
    if(ag){
      ag.items.push({ time:`+${pr.minutesEst||10}m`, topic:`[${pr.areaName}] ${pr.title}`, owner:pr.proposedBy });
    }
    DB.save();
    toast('Adopted onto County Agenda', 'Proposal sequenced into the live sitting & Secretary master list.', 'ok');
    render();
  },

  'monday-escalate-concern': (d={}) => {
    MONDAY_PROC.ensureStore();
    const c = (DB.db.concerns||[]).find(x=>x.id===d.id);
    if(!c) return;
    const p = (DB.db.patients||[]).find(x=>x.id===c.patientId);
    const countyId = d.county || (p && p.countyId) || AUTH.user.countyId || 'kisumu';
    DB.db.mondayProposals.unshift({
      id: uid('mp'),
      countyId,
      weekOf: todayISO().slice(0,10),
      areaName: p ? areaName(p.areaId) : countyName(countyId),
      dept: 'ministry',
      proposedBy: AUTH.user.name.replace(/^Demo - /,''),
      roleName: (roleObj(AUTH.user.roleId)||{}).name || AUTH.user.roleId,
      title: `Ministry Patient Concern Escalation (${p?p.code:'Case'} · ${p?areaName(p.areaId):''})`,
      rationale: `${c.title||c.category||'Concern'}: ${c.detail||c.note||'Requires multidisciplinary Monday review.'}`,
      minutesEst: 8,
      priority: 'high',
      status: 'proposed',
      createdAt: new Date().toISOString()
    });
    DB.save();
    toast('Concern escalated to Monday Agenda', `Added to ${countyName(countyId)} proposals & Secretary pack.`, 'ok');
    go('monday', { tab:'agenda', county:countyId });
  },

  'monday-close-and-process': (d={}) => {
    const countyId = d.county || AUTH.user.countyId || 'kisumu';
    const plan = MONDAY_PROC.runProcessingEngine(countyId, AUTH.user);
    toast('Sitting Closed & AI-Processed', `${plan.countyLabel} Weekly Operational Plan & Secretary Master Pack generated.`, 'ok');
    go('monday', { tab:'engine', county:countyId });
  },

  'monday-reopen-sitting': (d={}) => {
    MONDAY_PROC.ensureStore();
    const countyId = d.county || AUTH.user.countyId || 'kisumu';
    const ag = (DB.db.mondayAgendas||[]).find(a=>a.countyId===countyId);
    if(ag) ag.sittingStatus = 'open';
    DB.save();
    toast('Sitting Reopened', `${countyName(countyId)} Monday sitting reopened for addendum notes.`, 'info');
    render();
  },

  'monday-minutes-save': () => {
    const f = document.querySelector('#mondayMinutesForm');
    if(!f) return;
    const fd = new FormData(f);
    const countyId = fd.get('countyId') || AUTH.user.countyId || 'kisumu';
    MONDAY_PROC.ensureStore();
    DB.db.mondayMinutesLedger[countyId] = {
      weekOf: todayISO().slice(0,10),
      countyId,
      secretaryName: String(fd.get('secretaryName')||'').trim(),
      templateId: String(fd.get('templateId')||'standard-cdims-minutes'),
      attendanceSummary: String(fd.get('attendanceSummary')||'').trim(),
      keyResolutions: String(fd.get('keyResolutions')||'').trim(),
      customNotes: String(fd.get('customNotes')||'').trim(),
      updatedAt: new Date().toISOString()
    };
    AUDIT.append({ actor:AUTH.user.id, action:'monday.minutes.saved', entity:'monday_minutes', entityId:countyId, detail:`Saved Official Monday Minutes (${countyName(countyId)})` });
    DB.save();
    toast('Official Monday Minutes Saved', `Archived on ${countyName(countyId)} Secretary Ledger.`, 'ok');
    render();
  },

  'monday-minutes-word': (d={}) => {
    const countyId = d.county || AUTH.user.countyId || 'kisumu';
    const pack = MONDAY_PROC.buildSecretaryMasterPack(countyId);
    const min = (DB.db.mondayMinutesLedger||{})[countyId] || {};
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(pack.countyLabel)} Monday Management Minutes</title>
      <style>body{font-family:Calibri,Arial,sans-serif;margin:28px;color:#15171A}h1{color:#162F59;margin-bottom:2px}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #CBD5E1;padding:6px 8px;text-align:left;font-size:10pt}th{background:#F1F5F9}</style>
      </head><body>
      <div style="color:#C8102E;font-weight:700;font-size:9pt;letter-spacing:1.2px">LOMAMO CARELINK · C-DIMS OFFICIAL MINUTES</div>
      <h1>${esc(pack.countyLabel)} Monday Management Meeting Minutes</h1>
      <p><b>Week of:</b> ${esc(fmtDate(pack.weekOf))} &nbsp;|&nbsp; <b>Chair:</b> ${esc(pack.chair)} &nbsp;|&nbsp; <b>Secretary:</b> ${esc(min.secretaryName||pack.secretary)}</p>
      <p><b>Attendance:</b> ${esc(min.attendanceSummary||'Department leads, coordinators & caregivers present.')}</p>
      <h3>1. Master Processed Agenda (${pack.masterItems.length} Items)</h3>
      <table><thead><tr><th>#</th><th>Time</th><th>Agenda Item</th><th>Source / Dept</th><th>Lead</th></tr></thead><tbody>
        ${pack.masterItems.map(r=>`<tr><td>${r.seq}</td><td>${esc(r.time)}</td><td>${esc(r.topic)}</td><td>${esc(r.source)}</td><td>${esc(r.lead)}</td></tr>`).join('')}
      </tbody></table>
      <h3>2. Resolutions &amp; Departmental Directives</h3>
      <pre style="white-space:pre-wrap;font-family:inherit;background:#F8FAFC;padding:10px;border-left:4px solid #162F59">${esc(min.keyResolutions||'Pending Secretary entry.')}</pre>
      <h3>3. Additional Verbatim Minutes</h3>
      <p>${esc(min.customNotes||'None recorded.')}</p>
      </body></html>`;
    const blob = new Blob([html], { type:'application/msword;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `CareLink-Monday-Minutes-${countyId}-${pack.weekOf}.doc`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
    toast('Official Minutes Downloaded', `Saved ${a.download}.`, 'ok');
  },

  'monday-upload-minutes-tpl': () => {
    openModal({
      title:'Install Custom Monday Minutes Template',
      sub:'Equip Admin Assistants (Meeting Secretaries) with your official custom minutes structure or merge placeholders.',
      wide:false,
      body:`<form id="monTplForm">
        <div class="field"><label>Template name *</label>
          <input class="input" name="name" value="LOMAMO Official Monday Minutes Template v1" required>
        </div>
        <div class="field"><label>Upload template file (.docx, .md, .txt, .json) or paste structure below</label>
          <input class="input" type="file" id="monTplFile" accept=".docx,.doc,.md,.txt,.json">
        </div>
        <div class="field"><label>Template section headings / merge structure</label>
          <textarea class="input mono" name="structure" rows="4" placeholder="1. Opening Devotion & Roll Call\n2. Confirmation of Previous Monday Minutes\n3. Matters Arising & Ministry Area Updates\n4. Weekly Foodbag & Hospital Escort Plan\n5. Action Matrix & Closing Prayer"></textarea>
        </div>
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" data-act="monday-save-minutes-tpl">${ic('check',14)} Install Minutes Template</button>`
    });
  },

  'monday-save-minutes-tpl': () => {
    const f = document.querySelector('#monTplForm');
    if(!f) return;
    const fd = new FormData(f);
    const fileInput = document.querySelector('#monTplFile');
    const fileObj = fileInput && fileInput.files && fileInput.files[0];
    MONDAY_PROC.ensureStore();
    DB.db.mondayMinutesTemplates.unshift({
      id: uid('mtpl'),
      name: String(fd.get('name')||'Custom Monday Minutes Template').trim(),
      fileName: fileObj ? fileObj.name : null,
      structure: String(fd.get('structure')||'').trim(),
      uploadedBy: AUTH.user.name.replace(/^Demo - /,''),
      uploadedAt: new Date().toISOString()
    });
    DB.save();
    closeModal(true);
    toast('Custom Minutes Template Installed', 'Available immediately in the Admin Assistant Secretary & Minutes Desk.', 'ok');
    render();
  },

  'monday-agenda-modal': (d={}) => {
    if(!RBAC.has(AUTH.user,'monday.manage')) return toast('Unauthorised','County Admin Assistant / Management authority required.','err');
    const countyId = d.county || AUTH.user.countyId || 'kisumu';
    openModal({
      title:`Prepare & Push ${countyName(countyId)} Monday Agenda Item`,
      sub:'Pushes directly to every caregiver, coordinator, clinical and department console in this county.',
      wide:false,
      body:`<form id="monAgendaForm">
        <input type="hidden" name="countyId" value="${esc(countyId)}">
        <div class="grid g2">
          <div class="field"><label>Time slot *</label><input class="input" name="time" value="10:05 – 10:25" required></div>
          <div class="field"><label>Lead / Presenter *</label><input class="input" name="owner" value="${esc(AUTH.user.name.replace(/^Demo - /,''))}" required></div>
        </div>
        <div class="field"><label>County-specific agenda topic *</label>
          <textarea class="input" name="topic" rows="2" required placeholder="e.g. Verification of scanned discharge forms & Q4 hygiene pack distribution schedule..."></textarea>
        </div>
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" data-act="monday-agenda-save">${ic('send',14)} Push to County Agenda</button>`
    });
  },

  'monday-agenda-save': () => {
    const f = document.querySelector('#monAgendaForm');
    if(!f) return;
    const fd = new FormData(f);
    const topic = String(fd.get('topic')||'').trim();
    if(!topic) return toast('Agenda topic required','','err');
    MONDAY_PROC.ensureStore();
    const countyId = fd.get('countyId') || 'kisumu';
    let ag = DB.db.mondayAgendas.find(a=>a.countyId===countyId);
    if(!ag){
      ag = { id:uid('mon'), countyId, weekOf:todayISO().slice(0,10), title:`${countyName(countyId)} Monday Management Meeting`, items:[] };
      DB.db.mondayAgendas.push(ag);
    }
    ag.items.push({ time:String(fd.get('time')||'10:00'), topic, owner:String(fd.get('owner')||'County Admin Assistant') });
    ag.pushedBy = AUTH.user.name.replace(/^Demo - /,'');
    ag.pushedLive = true;
    AUDIT.append({ actor:AUTH.user.id, action:'monday.agenda.pushed', entity:'monday_meeting', entityId:countyId, detail:topic });
    DB.save();
    closeModal(true);
    toast('County agenda pushed live', `Published to all ${countyName(countyId)} accounts.`, 'ok');
    render();
  },

  'monday-push-notify': (d={}) => {
    const countyId = d.county || AUTH.user.countyId || 'kisumu';
    const recipients = (DB.db.users||[]).filter(u=>u.active && u.countyId===countyId);
    recipients.forEach(u=>notify(u.id, 'Monday Management Meeting Agenda Live', `${countyName(countyId)} Monday agenda pushed by ${AUTH.user.name.replace(/^Demo - /,'')}.`, 'info'));
    DB.save();
    toast('Agenda broadcast sent', `Notified ${recipients.length} ${countyName(countyId)} staff accounts.`, 'ok');
  },

  'foodcalc-save': () => {
    const f = document.querySelector('#foodCalcForm');
    if(!f) return;
    const fd = new FormData(f);
    const countyId = fd.get('countyId') || 'kisumu';
    MONDAY_PROC.ensureStore();
    DB.db.foodCalcState[countyId] = {
      lastWeek: Number(fd.get('lastWeek')||0),
      discharged: Number(fd.get('discharged')||0),
      deceased: Number(fd.get('deceased')||0),
      newIntakes: Number(fd.get('newIntakes')||0),
      inpatient: Number(fd.get('inpatient')||0),
      medOnly: Number(fd.get('medOnly')||0),
      stockBg1: Number(fd.get('stockBg1')||0),
      stockBg2: Number(fd.get('stockBg2')||0)
    };
    const c = MONDAY_PROC.computeFoodOrder(DB.db.foodCalcState[countyId]);
    AUDIT.append({ actor:AUTH.user.id, action:'foodbudget.recalculated', entity:'food_budget', entityId:countyId,
      detail:`${countyName(countyId)}: Bag1=${c.bg1ToOrder}, Bag2=${c.bg2ToOrder}, Inp=${c.inpPacks} -> ${money(c.projectedCost)}` });
    DB.save();
    toast('Weekly food projection updated', `Net order: ${c.bg1ToOrder} Bag 1 + ${c.bg2ToOrder} Bag 2 (${money(c.projectedCost)}).`, 'ok');
    render();
  },

  'proc-req-modal': (d={}) => {
    const countyId = d.county || AUTH.user.countyId || 'kisumu';
    openModal({
      title:'Raise Policy-Checked Procurement Requisition',
      sub:'Automatically determines quotation count, approval tier, payment channel & COI/eTIMS requirements.',
      wide:false,
      body:`<form id="procReqForm">
        <input type="hidden" name="countyId" value="${esc(countyId)}">
        <div class="field"><label>Procurement item / basket category *</label>
          <input class="input" name="category" value="Weekly Foodbags (Bag 1 & Bag 2) — ${esc(countyName(countyId))}" required>
        </div>
        <div class="grid g2">
          <div class="field"><label>Estimated total (KES) *</label><input class="input" type="number" min="100" name="amountKes" value="48500" required></div>
          <div class="field"><label>Quotations attached *</label><input class="input" type="number" min="1" max="10" name="quotesCount" value="3" required></div>
        </div>
        <div class="grid g2">
          <div class="field"><label>Payment channel *</label>
            <select class="input" name="paymentMode">
              <option value="Crossed Cheque">Crossed Cheque (with maturity date)</option>
              <option value="M-Pesa Paybill">M-Pesa Official Paybill / Till</option>
              <option value="Dual-Signatory EFT">Dual-Signatory Bank EFT</option>
            </select>
          </div>
          <div class="field"><label>Cheque maturity / value date</label><input class="input" type="date" name="chequeMaturity" value="${esc(todayISO().slice(0,10))}"></div>
        </div>
        <div class="field"><label>KRA eTIMS / Proforma reference</label><input class="input" name="etimsRef" placeholder="e.g. ETIMS-KRA-90214"></div>
        <label class="check"><input type="checkbox" name="coiSigned" checked> I confirm zero Conflict of Interest (COI) with the quoted suppliers per LOMAMO Procurement Policy.</label>
      </form>`,
      footer:`<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" data-act="proc-req-save">${ic('check',14)} Validate Policy Tier & Submit</button>`
    });
  },

  'proc-req-save': () => {
    const f = document.querySelector('#procReqForm');
    if(!f) return;
    const fd = new FormData(f);
    const amt = Number(fd.get('amountKes')||0);
    const quotes = Number(fd.get('quotesCount')||0);
    if(amt > 5000 && quotes < 3) return toast('Policy gate: 3 quotations required', 'Purchases above KES 5,000 require at least 3 competitive supplier quotations.', 'err');
    if(!fd.get('coiSigned')) return toast('Conflict-of-Interest declaration required', 'Confirm the COI declaration before submitting.', 'err');
    const tier = amt <= 5000 ? 'Tier 1 · Micro Purchase' : amt <= 50000 ? 'Tier 2 · Small Value' : amt <= 250000 ? 'Tier 3 · Medium Threshold' : 'Tier 4 · Major Tender';
    MONDAY_PROC.ensureStore();
    DB.db.procRequisitions.unshift({
      id: 'PRQ-2026-' + (110 + DB.db.procRequisitions.length),
      countyId: fd.get('countyId') || 'kisumu',
      date: todayISO().slice(0,10),
      category: String(fd.get('category')||'Programme Supplies').trim(),
      amountKes: amt,
      quotesCount: quotes,
      tier,
      paymentMode: fd.get('paymentMode') || 'Crossed Cheque',
      chequeMaturity: fd.get('chequeMaturity') || todayISO().slice(0,10),
      etimsRef: String(fd.get('etimsRef')||'Pending supplier eTIMS').trim(),
      coiSigned: true,
      grnVerified: false,
      status: amt > 50000 ? 'pending_director' : 'approved'
    });
    AUDIT.append({ actor:AUTH.user.id, action:'procurement.requisition.created', entity:'procurement', entityId:tier, detail:`${money(amt)} (${quotes} quotes) · ${tier}` });
    DB.save();
    closeModal(true);
    toast('Requisition validated & logged', `${tier} applied (${quotes} quote(s), COI signed).`, 'ok');
    render();
  }
});
