/* ============================================================
   views_ops.js - Hospital operations, finance, report centre
   and branded report documents.
   ============================================================ */

/* ---------------- Hospital requests ---------------- */
function renderRequests(user, params){
  const rows = repo.requests(user);
  const f = params.status||'';
  const shown = f? rows.filter(r=>r.status===f): rows;
  const counts = { submitted:rows.filter(r=>r.status==='submitted').length, approved:rows.filter(r=>r.status==='approved').length,
    assigned:rows.filter(r=>r.status==='assigned').length, completed:rows.filter(r=>r.status==='completed').length,
    closed:rows.filter(r=>['reconciled','closed'].includes(r.status)).length };
  const dueFollowUps = rows.filter(r=>['reconciled','completed','closed'].includes(r.status) && !r.postFollowUp);
  const pendingHospAck = rows.filter(r=>r.postFollowUp && !r.postFollowUp.hospitalAck);
  const followUpStrip = (typeof HOSP_FOLLOWUP!=='undefined' && (dueFollowUps.length || pendingHospAck.length)) ? card(
    'Post-Hospital Visit Caregiver Follow-Up & Hospital Department Feedback',
    `<div class="grid g2" style="gap:12px;margin-bottom:${pendingHospAck.length?'12px':'0'}">
      <div class="alert ${dueFollowUps.length?'warn':'ok'}" style="margin:0">${ic('hospital',17)}<div>
        <b>Caregiver Post-Visit Clinic Follow-Up Queue (${dueFollowUps.length} awaiting schedule)</b>
        <span class="small">Record MOPC, GOPC, SOPC, POPC, Physiotherapy or onward Facility Referral instructions and send live feedback to the Hospital Department.</span>
      </div></div>
      <div class="alert ${pendingHospAck.length?'info':'ok'}" style="margin:0">${ic('send',17)}<div>
        <b>Hospital Department Feedback Inbox (${pendingHospAck.length} awaiting acknowledgement)</b>
        <span class="small">Caregiver post-visit clinic bookings and recovery reports awaiting Hospital Focal / Case Manager acknowledgement.</span>
      </div></div>
    </div>
    ${pendingHospAck.length ? table([
      {label:'Request & Clinic', render:r=>`<div class="cellname">${esc(r.no||r.code)} · ${badge(r.postFollowUp.clinic,'b-info','nodot')}<span class="sm">${esc(r.postFollowUp.targetFacility||r.facility)}</span></div>`},
      {label:'Patient', render:r=>{const p=DB.db.patients.find(x=>x.id===r.patientId);return p?`<b>${esc(p.name)}</b><span class="xs muted" style="display:block">${esc(areaName(p.areaId))}</span>`:'-';}},
      {label:'Next Review', render:r=>`<span class="small mono">${fmtDate(r.postFollowUp.reviewDate)}</span>`},
      {label:'Caregiver Feedback to Hospital Dept', render:r=>`<span class="small">${esc(r.postFollowUp.feedbackToHospital)}</span>`},
      {label:'Hospital Dept Status', cls:'act', render:r=>HOSP_FOLLOWUP.canAck(user)
        ? `<button class="btn btn-xs btn-primary" data-act="ack-hosp-followup" data-id="${r.id}">${ic('check',12)} Acknowledge</button>`
        : badge('Sent to Hospital Dept','b-warn')}
    ], pendingHospAck.slice(0,8)) : ''}`,
    {sub:'Bridges hospital service & financial reconciliation directly to MOPC / GOPC / SOPC / Physiotherapy / Facility Referral care.'}
  ) : '';

  return pageHead('Hospital requests','Clinical approval, transport authorisation, payment, reconciliation and post-visit clinic follow-up are tracked end to end.',
    RBAC.has(user,'hosp.request.create')?`<button class="btn btn-sm btn-primary" data-act="new-request">${ic('plus',15)} New request</button>`:'')
  + `<div class="grid g5" style="margin-bottom:16px">
      ${kpi('Awaiting clinical review', num(counts.submitted),'Medical Case Manager','warn','hospital')}
      ${kpi('Approved', num(counts.approved),'Awaiting assignment','','check')}
      ${kpi('In progress', num(counts.assigned),'With hospital focal person','info','route')}
      ${kpi('Evidence pending', num(counts.completed),'Served, unreconciled',counts.completed?'warn':'ok','receipt')}
      ${kpi('Reconciled & closed', num(counts.closed),`${dueFollowUps.length} due clinic follow-up`,'ok','check')}
    </div>`
  + followUpStrip
  + card('', `<div class="tabs" style="margin-bottom:14px">
      <button class="tab ${!f?'active':''}" data-act="req-filter" data-status="">All <span class="ct">${rows.length}</span></button>
      ${['submitted','approved','assigned','completed','reconciled','closed','rejected'].map(s=>`<button class="tab ${f===s?'active':''}" data-act="req-filter" data-status="${s}">${WORKFLOW.request.labels[s]} <span class="ct">${rows.filter(r=>r.status===s).length}</span></button>`).join('')}
    </div>
    ${PAGER.tabs([['','All']].concat(['submitted','approved','assigned','completed','reconciled','closed','rejected'].map(x=>[x,WORKFLOW.request.labels[x]])), f||'', 'req-filter', '', 'status')}
    ${table([
      {label:'Request',render:r=>`<div class="cellname">${esc(r.no)}<span class="sm">${esc(r.reason.slice(0,58))}</span></div>`},
      {label:'Patient',render:r=>{const p=DB.db.patients.find(x=>x.id===r.patientId);return p?`<span class="small">${esc(p.name)}</span><span class="xs muted" style="display:block">${esc(areaName(p.areaId))}</span>`:'-';}},
      {label:'Facility & Follow-Up',render:r=>`<span class="small">${esc(r.facility)}</span>${r.postFollowUp?`<div style="margin-top:3px">${badge(r.postFollowUp.clinic+' · '+fmtDate(r.postFollowUp.reviewDate), r.postFollowUp.hospitalAck?'b-ok':'b-info','nodot')}</div>`:''}`},
      {label:'Priority',render:r=>badge(titleCase(r.priority),r.priority==='critical'?'b-crit':r.priority==='urgent'?'b-warn':'b-neutral')},
      {label:'Transport',render:r=>r.transport?.required?badge(money(r.transport.fare),'b-info','nodot'):'<span class="muted xs">-</span>'},
      {label:'Status',render:r=>rBadge(r.status)},
      {label:'Submitted',render:r=>`<span class="small">${fmtDate(r.submittedAt)}</span>`},
      {label:'',cls:'act',render:r=>`<div class="row" style="gap:5px;justify-content:flex-end">
        ${typeof HOSP_FOLLOWUP!=='undefined' && HOSP_FOLLOWUP.canRecord(user) && ['completed','reconciled','closed'].includes(r.status)
          ? `<button class="btn btn-xs ${r.postFollowUp?'btn-ghost':'btn-primary'}" data-act="open-hosp-followup" data-id="${r.id}">${r.postFollowUp?'Follow-up ✓':'Follow-up'}</button>` : ''}
        <button class="btn btn-xs ${r.status==='submitted'&&RBAC.has(user,'hosp.request.review')?'btn-primary':'btn-ghost'}" data-act="open-request" data-id="${r.id}">Open</button>
      </div>`}
    ], shown.slice(0,60), {emptyMsg:'No requests in this state.', click:true, rowAttr:r=>`data-act="open-request" data-id="${r.id}"`})}`,
    {foot:`<span>${ic('info',13)} Medical approval ≠ transport approval ≠ financial authorisation ≠ payment ≠ reconciliation ≠ clinic follow-up.</span>`});
}

function renderLiaison(user){
  const mine = repo.requests(user);
  const active = mine.filter(r=>r.status==='assigned');
  const done = mine.filter(r=>r.status==='completed');
  const feedbackItems = mine.filter(r=>r.postFollowUp);
  const unacked = feedbackItems.filter(r=>!r.postFollowUp.hospitalAck);
  return pageHead('Focal person assignments','Only assignments made to you are visible, plus live post-visit caregiver clinic feedback (MOPC, GOPC, SOPC, Physiotherapy, Facility Referral).',
    '')
  + `<div class="grid g4" style="margin-bottom:16px">
      ${kpi('Active assignments', num(active.length),'Record service after the visit','','route')}
      ${kpi('Evidence to submit', num(done.length),'Receipts & clinical report',done.length?'warn':'ok','receipt')}
      ${kpi('Caregiver clinic feedback', num(unacked.length), `${feedbackItems.length} total MOPC/GOPC/Physio notes`, unacked.length?'info':'ok','send')}
      ${kpi('Completed', num(mine.filter(r=>['reconciled','closed'].includes(r.status)).length),'Reconciled or closed','ok','check')}
    </div>
    ${feedbackItems.length ? card('Caregiver Post-Visit Clinic & Referral Feedback Queue', table([
      {label:'Request', render:r=>`<div class="cellname">${esc(r.no||r.code)}<span class="sm">${esc(r.postFollowUp.targetFacility||r.facility)}</span></div>`},
      {label:'Patient', render:r=>{const p=DB.db.patients.find(x=>x.id===r.patientId);return p?esc(p.name):'-';}},
      {label:'Clinic / Action', render:r=>badge(r.postFollowUp.clinic,'b-info','nodot')},
      {label:'Review Date', render:r=>fmtDate(r.postFollowUp.reviewDate)},
      {label:'Caregiver Feedback', render:r=>`<span class="small">${esc(r.postFollowUp.feedbackToHospital)}</span>`},
      {label:'Status', cls:'act', render:r=>r.postFollowUp.hospitalAck
        ? badge('Acknowledged','b-ok')
        : `<button class="btn btn-xs btn-primary" data-act="ack-hosp-followup" data-id="${r.id}">${ic('check',12)} Acknowledge</button>`}
    ], feedbackItems.slice(0,12)), {sub:'Direct feedback from field caregivers following hospital service and financial reconciliation.'}) : ''}
    <div class="grid g2">${active.concat(done).map(r=>{
      const p=DB.db.patients.find(x=>x.id===r.patientId);
      return `<div class="card"><div class="card-b">
        <div class="spread"><div><div class="bold">${esc(r.no)}</div><div class="xs muted">${esc(r.facility)}</div></div>${rBadge(r.status)}</div>
        <div class="divider"></div>
        <div class="dl"><dt>Patient</dt><dd>${esc(p?.name||'-')}</dd>
          <dt>Appointment</dt><dd>${fmtDate(r.preferredDate)}</dd>
          <dt>Transport</dt><dd>${r.transport?.required?money(r.transport.fare)+' · '+r.transport.persons+' person(s)':'Not requested'}</dd>
          <dt>Reason</dt><dd style="text-align:right;max-width:60%">${esc(r.reason)}</dd></div>
        <div class="row" style="margin-top:14px">${r.status==='assigned'?`<button class="btn btn-sm btn-primary btn-block" data-act="open-request" data-id="${r.id}">Record hospital service</button>`:`<button class="btn btn-sm btn-ghost btn-block" data-act="open-request" data-id="${r.id}">Open case</button>`}</div>
      </div></div>`;
    }).join('')||emptyState('No active assignments','Assignments appear here once the Medical Case Manager approves and assigns a request.','route')}</div>`;
}

function renderRecon(user){
  const tx = repo.transactions(user);
  const open = tx.filter(t=>t.status!=='reconciled');
  const e = REPORTS.expenditure(user,{});
  return pageHead('Receipt reconciliation','Every expenditure links to a patient, hospital request, county office and budget line.',
    `<button class="btn btn-sm btn-ghost" data-act="generate" data-type="expenditure">${ic('file',14)} Expenditure report</button>`)
  + `<div class="grid g4" style="margin-bottom:16px">
      ${kpi('Transactions', num(tx.length), e.period.label,'','receipt')}
      ${kpi('Awaiting reconciliation', num(open.length),'Requires evidence review',open.length?'warn':'ok','clock')}
      ${kpi('Missing receipts', num(tx.filter(t=>!t.receipt).length),'Blocked from reconciliation',tx.filter(t=>!t.receipt).length?'crit':'ok','alert')}
      ${kpi('Reconciled value', money(tx.filter(t=>t.status==='reconciled').reduce((n,t)=>n+t.amount,0)),'Verified against evidence','ok','check')}
    </div>`
  + (e.flags.length? `<div style="margin-bottom:16px">${e.flags.slice(0,6).map(f=>`<div class="alert ${f.level==='crit'?'crit':'warn'}" style="margin-bottom:9px">${ic('alert',17)}<div><b>${esc(f.level==='crit'?'Exception':'Evidence gap')}</b><span class="small">${esc(f.text)}</span></div></div>`).join('')}</div>`:'')
  + card('Reconciliation queue', table([
      {label:'Transaction',render:t=>`<div class="cellname">${esc(t.no)}<span class="sm">${esc(t.payee)} · ref ${esc(t.ref||'-')}</span></div>`},
      {label:'Patient',render:t=>esc(DB.db.patients.find(p=>p.id===t.patientId)?.name||'-')},
      {label:'Category',render:t=>badge(titleCase(t.category),'b-neutral')},
      {label:'Amount',cls:'num',render:t=>money(t.amount)},
      {label:'Receipt',render:t=>t.receipt?badge('Attached','b-ok'):badge('Missing','b-crit')},
      {label:'Status',render:t=>badge(titleCase(t.status),t.status==='reconciled'?'b-ok':'b-warn')},
      {label:'',cls:'act',render:t=>t.status==='reconciled'?'':`<button class="btn btn-xs btn-primary" data-act="reconcile-tx" data-id="${t.id}">Reconcile</button>`}
    ], open, {empty:emptyState('Nothing to reconcile','All transactions in your scope are reconciled.','check')}),
    {foot:'<span>Pasted payment messages are not proof of payment. A structured record with a transaction reference is required.</span>'});
}

/* ---------------- Finance ---------------- */
function renderFinance(user, params){
  if(params && params.viewMode){ APPX.chartViewMode = params.viewMode; if(typeof COST_STATE!=='undefined') COST_STATE.viewMode = params.viewMode; }
  const tblMode = (typeof isChartTableMode==='function' && isChartTableMode());
  const e = REPORTS.expenditure(user,{ countyId: params.county });
  const activeRows = e.rows.filter(r=>r.budget>0 || r.paid>0 || r.committed>0);
  const colours = typeof chartColours==='function' ? chartColours(activeRows.length||6) : CHART_PALETTE;
  return pageHead('Expenditure & Financial Position', `${e.period.label} · ${countyName(e.countyId)||'All authorised counties'}`,
    `<div class="row" style="gap:8px;flex-wrap:wrap">
      ${roleObj(user.roleId)?.scope?.geo==='global'?`<select class="input" style="width:auto" data-filter="county" data-view="finance">
        <option value="all">All counties</option>${COUNTIES.map(c=>`<option value="${c.id}" ${params.county===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select>`:''}
      <button class="btn btn-sm ${tblMode?'btn-primary':'btn-ghost'}" data-act="toggle-chart-table-mode">${ic('columns',14)} ${tblMode?'Charts & tables view':'View all as tables'}</button>
      ${RBAC.has(user,'admin.ops')?`<button class="btn btn-sm btn-ghost" data-act="go" data-v="adminops">${ic('calendar',14)} Admin Operations & 9th Statutory</button>`:''}
      <button class="btn btn-sm btn-ghost" data-act="export-finance">${ic('download',14)} CSV</button>
      <button class="btn btn-sm btn-primary" data-act="generate" data-type="expenditure">${ic('file',14)} Generate report</button>
    </div>`)
  + `<div class="grid g5" style="margin-bottom:16px">
      ${kpi('Budgeted', money(e.tot.budget), e.period.label,'','layers')}
      ${kpi('Committed', money(e.tot.committed),'Authorised, unpaid','info','clock')}
      ${kpi('Paid', money(e.tot.paid),`${pct(e.tot.paid,e.tot.budget)}% of budget`,'','wallet')}
      ${kpi('Reconciled', money(e.tot.reconciled),'Evidence verified','ok','check')}
      ${kpi('Remaining available', money(e.tot.remaining), e.tot.remaining<0?'Overspent':'Available to commit',e.tot.remaining<0?'crit':'ok','layers')}
    </div>`
  + (typeof budgetVsActualBoard==='function' ? `<div style="margin-bottom:16px">${card('Expenditure Against Approved Budget — Executive Clarity Board',
      budgetVsActualBoard(activeRows.map((r,i)=>({
        label:r.cat.name, sub:r.cat.group, budget:r.budget, spent:r.paid, committed:r.committed, color:colours[i%colours.length]
      })), { totalBudget:e.tot.budget, totalSpent:e.tot.paid, showCommitted:true, periodLabel:e.period.label }),
      {sub:'Crystal-clear comparison of Approved Budget, Paid, Committed, Remaining Headroom & % Utilisation across every line.'})}</div>` : '')
  + `<div class="grid g2" style="margin-bottom:16px">
      ${card('Paid expenditure mix by category', chartDonut(
        activeRows.filter(r=>r.paid>0).map((r,i)=>({ label:r.cat.name.split(' (')[0], value:Math.round(r.paid), color:colours[i%colours.length] })),
        { title:'Paid expenditure by category', fmt:v=>money(v), centerLabel:'TOTAL PAID', centerValue:money(e.tot.paid) }
      ), {sub:'Clean symmetrical category share with full table view below.'})}
      ${card('Budget vs Paid & Committed', chartGrouped({
        labels:activeRows.slice(0,8).map(r=>r.cat.name.split(' (')[0].slice(0,15)),
        series:[
          { label:'Budget', values:activeRows.slice(0,8).map(r=>Math.round(r.budget)), color:CHART_PALETTE[0] },
          { label:'Paid', values:activeRows.slice(0,8).map(r=>Math.round(r.paid)), color:CHART_PALETTE[3] },
          { label:'Committed', values:activeRows.slice(0,8).map(r=>Math.round(r.committed)), color:CHART_PALETTE[1] }
        ],
        fmt:v=>money(v), title:'Budget vs paid and committed', labelHead:'Budget category', height:236
      }), {sub:'Paid and committed compared symmetrically against approved budget lines.'})}
    </div>`
  + `<div class="grid g2" style="margin-bottom:16px">
      ${card('Budget utilisation by category', activeRows.filter(r=>r.budget).map(r=>`
        <div style="margin-bottom:12px">
          <div class="spread" style="margin-bottom:4px"><span class="small bold">${esc(r.cat.name)}</span>
            <span class="xs mono muted">${money(r.paid)} / ${money(r.budget)} (${r.usedPct}%)</span></div>
          <div class="progress ${r.usedPct>95?'crit':r.usedPct>80?'warn':'ok'}"><i style="width:${clamp(r.usedPct,0,100)}%"></i></div>
        </div>`).join('') || emptyState('No budget lines configured','Add versioned budget lines to track utilisation.','layers'),
        {sub:'Paid and committed against the current budget version'})}
      ${card('Month-end projection & Operational cadence', `<div class="dl">
          <dt>Days elapsed</dt><dd class="mono">${e.daysElapsed} of ${e.daysInMonth}</dd>
          <dt>Spend to date</dt><dd class="mono">${money(e.tot.paid+e.tot.committed)}</dd>
          <dt>Projected month-end</dt><dd class="mono"><b>${money(e.projected)}</b></dd>
          <dt>Variance vs budget</dt><dd class="mono">${money(e.tot.budget-e.projected)}</dd>
          <dt>Supporting evidence</dt><dd class="mono">${e.tx.filter(t=>t.receipt).length}/${e.tx.length} receipts</dd>
        </div>
        <div class="divider"></div>
        ${note('Daily PAYG patient expenses & daily staff transport, weekly supplier runs, 9th-of-month statutory remittances (SHIF, PAYE, KRA, NSSF), and monthly Operational Expenses are managed in County & Head Office Admin Operations.','info')}`)}
    </div>`
  + card('Category detail (symmetrical ledger)', `<div class="tbl-wrap"><table class="tbl align-sym">
      <thead><tr><th>Category</th><th class="num">Budget</th><th class="num">Committed</th><th class="num">Paid</th><th class="num">Reconciled</th><th class="num">Remaining</th><th class="num">Used</th><th class="num">Docs</th></tr></thead>
      <tbody>${e.rows.map(r=>`<tr>
        <td><div class="cellname">${esc(r.cat.name)}<span class="sm">${esc(r.cat.group)}</span></div></td>
        <td class="num mono">${money(r.budget)}</td>
        <td class="num mono">${money(r.committed)}</td>
        <td class="num mono">${money(r.paid)}</td>
        <td class="num mono">${money(r.reconciled)}</td>
        <td class="num mono"><b>${money(r.remaining)}</b></td>
        <td class="num mono">${r.usedPct}%</td>
        <td class="num">${r.missingReceipt?badge(r.missingReceipt+' missing','b-warn','nodot'):badge('OK','b-ok','nodot')}</td>
      </tr>`).join('')}</tbody>
      <tfoot><tr class="ct-total-row">
        <td><b>Total</b></td>
        <td class="num mono"><b>${money(e.tot.budget)}</b></td>
        <td class="num mono"><b>${money(e.tot.committed)}</b></td>
        <td class="num mono"><b>${money(e.tot.paid)}</b></td>
        <td class="num mono"><b>${money(e.tot.reconciled)}</b></td>
        <td class="num mono"><b>${money(e.tot.remaining)}</b></td>
        <td class="num mono"><b>${pct(e.tot.paid+e.tot.committed,e.tot.budget)}%</b></td>
        <td class="num"></td>
      </tr></tfoot>
    </table></div>`,
    {foot:`<span>${ic('shield',13)} County offices see only their own financial records; organisation-wide consolidation requires explicit authorisation.</span>`});
}
function renderBudget(user){
  const rows = repo.budget(user);   /* scoped: a county administrator sees only their own county */
  const e = REPORTS.expenditure(user, {});
  return pageHead('Budget lines & expenditure against budget','Versioned monthly & annual budget ceilings paired with live actual expenditure and remaining headroom.',
    `<div class="row" style="gap:8px">${RBAC.has(user,'admin.ops')?`<button class="btn btn-sm btn-ghost" data-act="go" data-v="adminops" data-tab="annual">${ic('calendar',14)} Annual Budgeting & Societies</button>`:''}
    ${RBAC.has(user,'finance.budget.manage')?`<button class="btn btn-sm btn-primary" data-act="edit-budget">${ic('plus',15)} New budget version</button>`:''}</div>`)
  + (typeof budgetVsActualBoard==='function' ? `<div style="margin-bottom:16px">${card('Live Expenditure Against Approved Budget Lines',
      budgetVsActualBoard(e.rows.filter(r=>r.budget>0||r.paid>0||r.committed>0).map(r=>({
        label:r.cat.name, sub:r.cat.group, budget:r.budget, spent:r.paid, committed:r.committed
      })), { totalBudget:e.tot.budget, totalSpent:e.tot.paid, showCommitted:true, periodLabel:e.period.label }))}</div>` : '')
  + card('Versioned budget register', table([
      {label:'County',render:b=>esc(countyName(b.countyId))},
      {label:'Category',render:b=>esc(BUDGET_CATEGORIES.find(c=>c.id===b.line)?.name||b.line)},
      {label:'Period',render:b=>esc(b.period)},
      {label:'Amount',cls:'num',render:b=>money(b.amount)},
      {label:'Version',cls:'num',render:b=>`v${b.version}`},
      {label:'Effective from',render:b=>fmtDate(b.effectiveFrom)},
      {label:'Set by',render:b=>`<span class="small">${esc(userName(b.setBy).replace(/^Demo - /,''))}</span>`}
    ], rows),
    {foot:'<span>Budget changes are audited. Historical reports retain the target and budget version used at generation time.</span>'});
}
function renderProcurement(user){
  const suppliers = (typeof ADMIN_OPS!=='undefined') ? ADMIN_OPS.scopedList(user, 'adminOpsSuppliers') : [];
  const totalScheduled = suppliers.reduce((n,s)=>n+(Number(s.amount)||0),0);
  const paidSuppliers = suppliers.filter(s=>s.status==='paid');
  return pageHead('Procurement & Weekly Supplier Schedule',
    'Links approved Monday procurement needs, foodbag & medical requisitions, and weekly supplier settlement schedules.',
    `<div class="row" style="gap:8px;flex-wrap:wrap">
      ${RBAC.has(user,'monday.meeting')?`<button class="btn btn-sm btn-ghost" data-act="go" data-v="monday">${ic('users',14)} Monday Procurement</button>`:''}
      <button class="btn btn-sm btn-ghost" data-act="go" data-v="foodbudget">${ic('clipboard',14)} Projected Food Budget</button>
      ${RBAC.has(user,'admin.ops')?`<button class="btn btn-sm btn-primary" data-act="go" data-v="adminops" data-tab="daily_weekly">${ic('plus',14)} Weekly Supplier Payments</button>`:''}
    </div>`)
  + `<div class="grid g3" style="margin-bottom:16px">
      ${kpi('Weekly supplier batches', num(suppliers.length), 'Scoped to your county authority', 'info', 'package')}
      ${kpi('Total scheduled value', money(totalScheduled), 'Weekly supplier cycle', '', 'wallet')}
      ${kpi('Settled & receipted', num(paidSuppliers.length), money(paidSuppliers.reduce((n,s)=>n+(Number(s.amount)||0),0)), 'ok', 'check')}
    </div>`
  + card('Weekly Supplier & Procurement Register', suppliers.length ? table([
      {label:'Ref / Week', render:r=>`<div class="cellname">${esc(r.ref||r.id)}<span class="sm">${esc(r.weekLabel||fmtDate(r.date))}</span></div>`},
      {label:'County', render:r=>esc(countyName(r.countyId))},
      {label:'Supplier & Category', render:r=>`<b>${esc(r.supplier)}</b><div class="xs muted">${esc(r.category||'Foodbags & Supplies')}</div>`},
      {label:'Invoice Ref', render:r=>`<span class="mono xs">${esc(r.invoiceNo||'-')}</span>`},
      {label:'Amount', cls:'num', render:r=>`<b class="mono">${money(r.amount)}</b>`},
      {label:'Status', render:r=>badge(titleCase(r.status||'scheduled'), r.status==='paid'?'b-ok':'b-warn')}
    ], suppliers) : emptyState('Register ready','Procurement requests and weekly supplier payments appear here once scheduled in Admin Operations or Monday Meeting.','package'),
    {sub:'Supplier payments are settled weekly against verified invoices and linked budget lines.'});
}

/* ---------------- Report centre ---------------- */
function renderReports(user){
  const cards = [
    { type:'patient_figures', cap:'report.patient_figures', icon:'file', desc:'Twenty defined indicators, caseload calculation, ministry-area breakdown and targets.', title:'Patient Figures Report' },
    { type:'patient_days', cap:'report.patient_days', icon:'clock', desc:'Days in programme with 60/100/120/180-day milestones and discharge readiness.', title:'Patient-Days Report' },
    { type:'expenditure', cap:'report.expenditure', icon:'wallet', desc:'Budget, committed, paid, reconciled and remaining - with evidence exceptions.', title:'Expenditure Report' },
    { type:'referral', cap:'report.referral', icon:'link', desc:'Patients referred by recognised facilities, matched against the verified register.', title:'Master Referral Document' },
    { type:'executive', cap:'report.executive', icon:'chart', desc:'County comparison, caseload, requests and data-integrity position.', title:'Executive Summary' },
    { type:'home_visits', cap:['visit.view'], icon:'activity', desc:'Visit outcomes, failed visits and caregiver activity for the week.', title:'Home Visit Report' },
    { type:'hospital_ops', cap:['hosp.request.review','hosp.visit.record','hosp.receipt.review'], icon:'hospital', desc:'Referral pipeline, transport facilitation and reconciliation position.', title:'Hospital Operations Report' },
    { type:'quality', cap:['audit.view'], icon:'alert', desc:'Duplicate identifiers, invalid dates, missing evidence and reconciliation gaps.', title:'Data Quality Report' },
    { type:'donor', cap:['report.patient_figures','report.executive'], icon:'heart', desc:'Aggregate programme reach, support delivered and resources, with no identifying detail.', title:'Donor Programme Summary' },
    { type:'condition_summary', cap:['condition.aggregate','condition.sensitive'], icon:'clipboard', desc:'Recorded conditions by classification, with small-group suppression applied.', title:'Condition Summary' }
  ].filter(c=>(Array.isArray(c.cap)?c.cap:[c.cap]).some(k=>RBAC.has(user,k)));
  const monday = REPORTS.mondayStatus();
  return pageHead('Report centre','Every report states its period, data source, version and limitations.',
    `<button class="btn btn-sm btn-ghost" data-act="go" data-v="archive">${ic('archive',14)} Archive</button>`)
  + `<div class="card" style="margin-bottom:18px"><div class="card-b">${mondayCardBody(user)}</div></div>`
  + `<div class="grid g3">${cards.map(c=>`<div class="card"><div class="card-b">
      <div class="row" style="gap:11px;align-items:flex-start"><div style="width:40px;height:40px;border-radius:11px;background:var(--accent-soft);color:var(--accent-fg);display:grid;place-items:center">${ic(c.icon,19)}</div>
      <div><div class="bold" style="font-size:14.5px">${c.title}</div><div class="xs muted" style="margin-top:3px">${c.desc}</div></div></div>
      <div class="row" style="margin-top:16px">
        <button class="btn btn-sm btn-primary" data-act="generate" data-type="${c.type}">${ic('file',13)} Generate</button>
        <button class="btn btn-sm btn-ghost" data-act="preview-report" data-type="${c.type}">Preview</button>
      </div></div></div>`).join('')}</div>`
  + card('Recent generations', table([
      {label:'Report',render:r=>`<div class="cellname">${esc(r.title)}<span class="sm">${esc(r.periodKey)} · v${r.version}</span></div>`},
      {label:'Scope',render:r=>esc(r.countyId==='all'?'Organisation':countyName(r.countyId))},
      {label:'Generated',render:r=>fmtDateTime(r.generatedAt)},
      {label:'By',render:r=>`<span class="small">${esc(r.generatedByName)}</span>`},
      {label:'',cls:'act',render:r=>`<button class="btn btn-xs btn-ghost" data-act="view-report" data-id="${r.id}">Open</button>`}
    ], REPORTS.archive(user,{}).slice(0,8), {empty:emptyState('No reports yet','Generate a report to archive it with its period and integrity block.','file')}),
    {actions:`<button class="btn btn-xs btn-ghost" data-act="go" data-v="archive">View archive ${ic('chevron',12)}</button>`});
}

function renderArchive(user){
  const rows = REPORTS.archive(user,{});
  return pageHead('Report archive','Issued reports are preserved. Regeneration creates a new version rather than overwriting.')
  + card('', table([
      {label:'Report',render:r=>`<div class="cellname">${esc(r.title)}<span class="sm">${esc(r.periodKey)} ${r.scheduled?'· scheduled':''}</span></div>`},
      {label:'Scope',render:r=>esc(r.countyId==='all'?'Organisation':countyName(r.countyId))},
      {label:'Version',render:r=>badge('v'+r.version,'b-neutral','nodot')},
      {label:'Generated',render:r=>fmtDateTime(r.generatedAt)},
      {label:'Checksum',render:r=>`<span class="mono xs muted">${esc(r.checksum)}</span>`},
      {label:'',cls:'act',render:r=>`<button class="btn btn-xs btn-ghost" data-act="view-report" data-id="${r.id}">Open</button>`}
    ], rows, {emptyMsg:'No archived reports yet.'}),
    {foot:`<span>${ic('lock',13)} Archive entries are append-only. Each carries a checksum for integrity verification.</span>`});
}

function renderTargets(user){
  const rows = repo.targets(user);
  const levels = (typeof ACCESS!=='undefined')? ACCESS.targetLevels(user) : [];
  const reach = (typeof ACCESS!=='undefined')? ACCESS.reachOf(user) : 'county';
  const canSet = levels.length>0;
  /* Targets against what the register actually shows, for the indicators that
     can be measured from it. */
  const st = RBAC.has(user,'patient.list')? repo.stats(user) : null;
  const actual = { active_caseload: st? st.active : null, discharged_month: st? st.discharged : null };
  const measured = ['active_caseload','new_assessed','discharged_month','hosp_submitted']
    .map(k=>{
      const t = rows.filter(x=>x.indicator===k).sort((a,b)=>String(b.period).localeCompare(String(a.period)))[0];
      return { key:k, label:(INDICATORS[k]||{}).l||titleCase(k), target:t? Number(t.value) : null,
        actual: actual[k]!==undefined? actual[k] : null, period:t? t.period : '' };
    }).filter(m=>m.target!==null);

  return pageHead('Targets & baselines',
    `Targets are versioned and dated, and they are set only at the level an account owns. Your authority reaches <b>${esc(reach)}</b> level${levels.length?`; you may set <b>${esc(levels.map(titleCase).join(', '))}</b> targets`:'; you may read targets but not set them'}.`,
    canSet? `<button class="btn btn-sm btn-primary" data-act="set-target">${ic('plus',15)} Set target</button>`
          : `<span class="badge b-neutral nodot">Read only for this account</span>`)

  + `<div class="grid g4" style="margin-bottom:16px">
      ${kpi('Targets in scope', num(rows.length), `${num(new Set(rows.map(r=>r.indicator)).size)} indicators`, 'info', 'target')}
      ${kpi('Your authority', esc(titleCase(reach)), levels.length? 'May set '+esc(levels.map(titleCase).join(', ')) : 'Measurement only - may not set a target', levels.includes('national')?'ok':levels.length?'warn':'crit', 'shield')}
      ${kpi('Levels represented', num(new Set(rows.map(r=>r.level||'county')).size), 'Area, county and national', 'ok', 'layers')}
      ${kpi('Latest version', rows.length? 'v'+Math.max(...rows.map(r=>Number(r.version)||1)) : '-', 'A change never rewrites an earlier basis', 'ok', 'history')}
    </div>`

  + (canSet? '' : card('Why this account cannot set a target', alertBox('warn','Separation of duties',
      `<span class="small">Measurement and target setting are separate responsibilities. An M&amp;E or Data Officer reads targets, reports against them, and raises a data-quality exception when a figure cannot be met or cannot be trusted. The office that owns the level sets it: a Ministry Area Coordinator proposes an area target, the County Office Administrator sets county targets and baselines, and only the Director, the President or the Chief Program Administrator sets a national target. Every refusal is written to the audit trail with the rule that caused it.</span>`)))

  + (measured.length? `<div style="margin-bottom:16px">${card('Target against the register', chartGrouped({
      labels:measured.map(m=>String(m.label).slice(0,26)),
      series:[{label:'Target (latest version)', values:measured.map(m=>m.target), color:chartColours(2)[0]},
              {label:'In the register now', values:measured.map(m=>m.actual===null?0:m.actual), color:chartColours(2)[1]}],
      title:'Target against current register', labelHead:'Indicator',
      caption:'Where a measure cannot be read from the register by this account, the actual is shown as zero rather than guessed.'}),
      {sub:'Both series carry their own written table beneath the chart.'})}</div>`:'')

  + card('Target register', table([
      {label:'Level',render:t=>badge(titleCase(t.level||'county'), (t.level||'county')==='national'?'b-accent':(t.level==='area'?'b-info':'b-neutral'))},
      {label:'County',render:t=>esc(countyName(t.countyId))},
      {label:'Ministry area',render:t=>t.areaId? esc(areaName(t.areaId)) : '<span class="xs muted">-</span>'},
      {label:'Indicator',render:t=>`<div class="cellname">${esc((INDICATORS[t.indicator]||{}).l||titleCase(t.indicator))}</div><div class="xs muted mono">${esc(t.indicator)}</div>`},
      {label:'Period',render:t=>`<span class="mono">${esc(t.period)}</span>`},
      {label:'Target',cls:'num',render:t=>`<b class="mono">${num(t.value)}</b>`},
      {label:'Version',cls:'num',render:t=>'v'+t.version},
      {label:'Basis / note',render:t=>`<span class="xs muted">${esc(t.note||'')}</span>`},
      {label:'Set',render:t=>`${fmtDate(t.setAt)}<span class="xs muted"> ${esc(String(userName(t.setBy)||'').replace(/^Demo - /,''))}</span>`}
    ], rows),
    {foot:`<span>The H1 baseline (315 discharges, Jan-Jun 2026) is taken from the reviewed Mid-Year Report. Levels are enforced in the gate: a target written outside an account's authority is refused and audited.</span>`})

  + `<div style="margin-top:16px">${card('Who sets what', `<div class="tbl-wrap"><table class="tbl align-sym">
      <thead><tr><th>Level</th><th>May set it</th><th>May read it</th><th>May not</th></tr></thead>
      <tbody>
        <tr><td><b>National</b></td><td>Director, President, Chief Program Administrator</td><td>Every account that holds a reporting capability</td><td>County Office Administrator, M&amp;E / Data Officer, Auditor</td></tr>
        <tr><td><b>County</b></td><td>County Office Administrator, Director, Chief Program Administrator</td><td>County and national accounts</td><td>M&amp;E / Data Officer, Ministry Area Coordinator, Finance</td></tr>
        <tr><td><b>Ministry area</b></td><td>Ministry Area Coordinator (proposal), County Office Administrator</td><td>Area, county and national accounts</td><td>Another area's coordinator</td></tr>
      </tbody></table></div>`,
      {foot:'<span>The full binding of every capability to a level, a department and a context is printed in the Access &amp; authority audit.</span>'})}</div>`;
}

/* ============================================================
   REPORT DOCUMENTS
   ============================================================ */
function reportShell({title, sub, meta, body, footerNote='', classification='Internal organisational'}){
  return `<div class="report-doc" id="reportDoc">
    <div class="rhead">
      ${window.LOGO?`<img src="${window.LOGO}" alt="LOMAMO Foundation logo">`:''}
      <div style="flex:1">
        <div class="org">LOMAMO Foundation Kenya</div>
        <div class="tag">Love Matters Most · Serving our neighbours in love</div>
      </div>
      <div style="text-align:right">
        <span class="cls-tag">${esc(classification)}</span>
      </div>
    </div>
    <h2>${esc(title)}</h2>
    <div class="rsub">${sub}</div>
    <div class="meta-grid">${meta.map(m=>`<div><b>${esc(m.k)}</b>${esc(m.v)}</div>`).join('')}</div>
    ${body}
    <div class="rfoot">
      <span>${esc(footerNote||'Generated by LOMAMO C-DIMS · LOMAMO Foundation Kenya')}</span>
      <span>${esc(APP.name)} v${APP.version} · schema ${APP.schema}</span>
    </div>
  </div>`;
}

function buildReportDoc(type, params, user){
  const countyId = params.countyId && params.countyId!=='all' ? params.countyId : (roleObj(user.roleId)?.scope?.geo==='global'? 'all': user.countyId);
  const metaBase = (extra=[])=>[
    { k:'Reporting period', v: extra.period||PERIOD.week().label },
    { k:'Cut-off', v: fmtDate(new Date())+' 23:59 EAT' },
    { k:'County office', v: countyId==='all'?'All authorised counties':countyName(countyId) },
    { k:'Generated', v: fmtDateTime(new Date()) },
    { k:'Generated by', v: user.name||'Scheduled automation' },
    { k:'Data source', v:'LOMAMO C-DIMS operational database' },
    ...extra.filter(e=>!e.period)
  ];

  if(type==='patient_figures'){
    const f = REPORTS.patientFigures(user,{countyId});
    const tgt = k => REPORTS.targetsFor(countyId==='all'?'kisumu':countyId, k, new Date().toISOString().slice(0,7));
    const t = k => tgt(k)?.value ?? null;
    const rows = [
      ['Active patients at cut-off', f.active.length, 'active_caseload'],
      ['New patients assessed', f.newAssessed.length, 'new_assessed'],
      ['Approved for enrolment', f.approved.length, null],
      ['Enrolled this reporting week', f.enrolledPeriod.length, null],
      ['Discharged previous week', f.dischargedWeek.length, null],
      ['Discharged month to date', f.dischargedMonth.length, 'discharged_month'],
      ['Requiring follow-up', f.followup.length, null],
      ['Not found at home (7 days)', f.notFound.length, null],
      ['Inpatients', 0, null],
      ['Outpatients (tracked)', DB.db.encounters.length, null],
      ['Foodbags issued', f.support['Foodbag']||0, null],
      ['Bibles issued', f.support['Bible']||0, null],
      ['Mosquito nets issued', f.support['Mosquito net']||0, null],
      ['Mattresses issued', f.support['Mattress']||0, null],
      ['Blankets issued', f.support['Blanket']||0, null],
      ['Special bags / other support', f.support['Special bag']||0, null],
      ['Children in orphan-prevention outcome', f.orphans, null],
      ['Hospital requests submitted', f.hosp.filter(r=>inRange(r.submittedAt,f.period)).length, 'hosp_submitted'],
      ['Hospital requests approved', f.hosp.filter(r=>r.decision&&inRange(r.decision.at,f.period)).length, 'hosp_approved'],
      ['Hospital requests completed', f.hosp.filter(r=>r.serviceCompletedAt&&inRange(r.serviceCompletedAt,f.period)).length, 'hosp_completed'],
      ['Hospital requests outstanding', f.hosp.filter(r=>!['closed','rejected'].includes(r.status)).length, null]
    ];
    const targetRows = ['active_caseload','new_assessed','discharged_month'].map(k=>{
      const target=t(k);
      const actual = k==='active_caseload'? f.active.length : k==='new_assessed'? f.newAssessed.length : f.dischargedMonth.length;
      const v = target? actual-target: null;
      return `<tr><td>${INDICATORS[k].l}</td><td class="tnum">${target??'-'}</td><td class="tnum">${actual}</td>
        <td class="tnum">${v===null?'-':(v>=0?'+':'')+v}</td><td class="tnum">${target?pct(actual,target)+'%':'-'}</td>
        <td>${v===null?'No target set':v>=0?'On track':'Below target'}</td></tr>`;
    }).join('');

    const areaRows = f.byArea.map(a=>`<tr><td>${esc(a.area.name)}</td><td style="text-transform:capitalize">${esc(AREA_CLASS_LABEL[a.area.cls]||a.area.cls)}</td>
      <td class="tnum">${a.active}</td><td class="tnum">${a.newEnrol}</td><td class="tnum">${a.discharged}</td><td class="tnum">${a.followup}</td><td class="tnum">${a.requests}</td></tr>`).join('');

    const body = `
      <h4>1. Programme indicators</h4>
      <table><thead><tr><th>Indicator</th><th style="text-align:right">Value</th><th>Definition source</th></tr></thead><tbody>
        ${rows.map(r=>`<tr><td>${esc(r[0])}</td><td class="tnum" style="text-align:right"><b>${num(r[1])}</b></td><td style="font-size:10px;color:#5F6B7A">${esc((INDICATORS[r[2]]||{}).src||'operational records')}</td></tr>`).join('')}
      </tbody></table>

      <h4>2. Caseload calculation</h4>
      <table><tbody>
        <tr><td>Opening active caseload (start of period)</td><td class="tnum" style="text-align:right">${num(f.opening.length)}</td></tr>
        <tr><td>Add: enrolments effective in period</td><td class="tnum" style="text-align:right">+${num(f.enrolledPeriod.length)}</td></tr>
        <tr><td>Less: discharges effective in period</td><td class="tnum" style="text-align:right">−${num(f.dischargedPeriod.length)}</td></tr>
        <tr><td>Transfers and other authorised status changes</td><td class="tnum" style="text-align:right">0</td></tr>
        <tr style="font-weight:700"><td>Calculated closing caseload</td><td class="tnum" style="text-align:right">${num(f.closingCalc)}</td></tr>
        <tr><td>System active count at cut-off</td><td class="tnum" style="text-align:right">${num(f.active.length)}</td></tr>
        <tr><td>Variance</td><td class="tnum" style="text-align:right">${f.closingCalc-f.active.length}</td></tr>
      </tbody></table>
      <p style="font-size:11px;color:#5F6B7A">A variance other than zero indicates a status change or effective date outside the reporting window. The responsible officer must reconcile it before the report is issued to management.</p>
      ${chartWaterfall([
        {label:'Opening caseload', value:f.opening.length, kind:'total'},
        {label:'Enrolments', value:f.enrolledPeriod.length, color:CHART_PALETTE[3]},
        {label:'Discharges', value:-f.dischargedPeriod.length, color:CHART_PALETTE[6]},
        {label:'Closing (calculated)', value:f.closingCalc, kind:'total'},
        {label:'System count', value:f.active.length, kind:'total'}
      ], {title:'Caseload movement in the period', height:220,
        caption:'Opening caseload, plus enrolments, less discharges, against the system count at cut-off.'})}

      <h4>3. Ministry area breakdown</h4>
      <table><thead><tr><th>Ministry area</th><th>Classification</th><th style="text-align:right">Active</th><th style="text-align:right">New</th><th style="text-align:right">Discharged</th><th style="text-align:right">Follow-up</th><th style="text-align:right">Requests</th></tr></thead>
      <tbody>${areaRows}</tbody></table>

      <h4>3b. Ministry area profile</h4>
      ${chartGrouped({
        labels:f.byArea.map(a=>a.area.name),
        series:[
          {label:'Active', values:f.byArea.map(a=>a.active), color:CHART_PALETTE[0]},
          {label:'New enrolments', values:f.byArea.map(a=>a.newEnrol), color:CHART_PALETTE[2]},
          {label:'Discharged', values:f.byArea.map(a=>a.discharged), color:CHART_PALETTE[4]},
          {label:'Hospital requests', values:f.byArea.map(a=>a.requests), color:CHART_PALETTE[5]}
        ],
        title:'Caseload by ministry area', labelHead:'Ministry area', height:230,
        caption:'Active caseload, new enrolments, discharges and hospital requests for each ministry area in the reporting period.'})}

      <h4>4. Targets and variance</h4>
      <table><thead><tr><th>Indicator</th><th class="num">Target</th><th class="num">Actual</th><th class="num">Variance</th><th class="num">Achieved</th><th>Trajectory</th></tr></thead><tbody>${targetRows}</tbody></table>
      <p style="font-size:11px;color:#5F6B7A">Targets are versioned. Historical reports retain the target version in force at the time of generation. Only the office that owns a level may set it: area, county or national.</p>
      ${(()=>{
        const pairs = ['active_caseload','new_assessed','discharged_month'].map(k=>{
          const target = t(k);
          const actual = k==='active_caseload'? f.active.length : k==='new_assessed'? f.newAssessed.length : f.dischargedMonth.length;
          return { k, label:INDICATORS[k].l, target, actual };
        }).filter(x=>x.target);
        if(!pairs.length) return '<p style="font-size:11px;color:#5F6B7A">No target is set for this period, so no achievement chart is drawn. A chart is never drawn against a figure that does not exist.</p>';
        return chartGrouped({
          labels:pairs.map(p=>String(p.label).slice(0,26)),
          series:[{label:'Target', values:pairs.map(p=>p.target), color:CHART_PALETTE[7]},
                  {label:'Actual', values:pairs.map(p=>p.actual), color:CHART_PALETTE[3]}],
          title:'Target against actual', labelHead:'Indicator', height:220,
          caption:'Each indicator is drawn against the target version in force for this period.'})
        + '<div class="rpt-gauges">' + pairs.map(p=>chartGauge(p.actual, p.target, {label:String(p.label).slice(0,22)})).join('') + '</div>';
      })()}

      <h4>5. Notes and limitations</h4>
      <ul>
        <li>Inpatient and outpatient figures reflect hospital encounters recorded in the DDMS; facilities that do not yet submit structured returns will under-report.</li>
        <li>Children in orphan-prevention work are counted only where the approved outcome definition is evidenced - not every child in an enrolled household.</li>
        <li>Reported faith engagement is a restricted field and is excluded from this report.</li>
        <li>Support items are physical distributions evidenced by field records, not monetary transfers.</li>
        <li>Where source documents remain unverified, figures are provisional and marked as such.</li>
      </ul>`;
    return reportShell({ title:'Patient Figures Report', sub:`${f.period.label} · ${countyId==='all'?'All authorised counties':countyName(countyId)}`,
      meta: metaBase([{k:'Report version',v:'v1'},{k:'Target version',v:(tgt('active_caseload')?.version? 'v'+tgt('active_caseload').version:'none')},{k:'Period key',v:f.period.label}]),
      body, footerNote:'Indicator definitions are held in the DDMS indicator dictionary and are not editable by report authors.' });
  }

  if(type==='patient_days'){
    const d = REPORTS.patientDays(user,{countyId});
    const rows = d.rows.slice(0,60).map(r=>`<tr>
      <td>${esc(r.p.code)}</td><td>${esc(r.p.name)}</td><td>${esc(areaName(r.p.areaId))}</td>
      <td>${fmtDate(r.p.intake)}</td><td class="tnum"><b>${r.days}</b></td>
      <td>${r.lastVisit?fmtDate(r.lastVisit.date):'-'}</td><td class="tnum">${r.openPdca}</td>
      <td>${esc(WORKFLOW.patient.labels[r.p.status]||r.p.status)}</td>
      <td style="font-size:10.5px">${esc(r.readiness)}</td><td style="font-size:10.5px">${esc(userName(r.owner).replace(/^Demo - /,''))}</td></tr>`).join('');
    const body = `
      <h4>Milestone summary</h4>
      <table><thead><tr><th>Milestone</th><th style="text-align:right">Patients at or beyond</th><th>Required action</th></tr></thead><tbody>
        <tr><td>60 days</td><td class="tnum">${d.buckets.m60}</td><td>Standard mid-point review</td></tr>
        <tr><td>100 days</td><td class="tnum">${d.buckets.m100}</td><td>Approaching extension review</td></tr>
        <tr><td>120 days</td><td class="tnum">${d.buckets.m120}</td><td>Documented extension review required</td></tr>
        <tr><td>180 days</td><td class="tnum">${d.buckets.m180}</td><td>Discharge evaluation with evidence required</td></tr>
      </tbody></table>
      ${chartBars({rows:[
          {label:'60 days', value:d.buckets.m60},
          {label:'100 days', value:d.buckets.m100},
          {label:'120 days', value:d.buckets.m120},
          {label:'180 days', value:d.buckets.m180}
        ], title:'Patients at or beyond each milestone', valueHead:'Patients', labelHead:'Milestone', height:210,
        caption:'Patients at or beyond each programme milestone at the cut-off date. Duration alone never discharges a patient.'})}
      <h4>Patient register (ordered by duration)</h4>
      <table style="font-size:10.5px"><thead><tr><th>Code</th><th>Patient</th><th>Area</th><th>Intake</th><th style="text-align:right">Days</th><th>Last visit</th><th style="text-align:right">PDCA</th><th>Status</th><th>Readiness</th><th>Owner</th></tr></thead>
      <tbody>${rows||'<tr><td colspan="10">No records</td></tr>'}</tbody></table>
      <p style="font-size:11px;color:#5F6B7A">Programme duration alone does not discharge a patient. A discharge requires a documented evaluation supporting evidence and approval by the authorised officer.</p>`;
    return reportShell({ title:'Patient-Days Report', sub:`Days in programme as at ${fmtDate(d.cutoff)}`, meta: metaBase(), body,
      footerNote:'Days are calendar days from the recorded intake date to the cut-off or discharge date.' });
  }

  if(type==='expenditure'){
    const e = REPORTS.expenditure(user,{countyId});
    const rows = e.rows.map(r=>`<tr><td>${esc(r.cat.name)}</td><td class="tnum">${money(r.budget)}</td><td class="tnum">${money(r.committed)}</td>
      <td class="tnum">${money(r.paid)}</td><td class="tnum">${money(r.reconciled)}</td><td class="tnum">${money(r.remaining)}</td>
      <td class="tnum">${r.usedPct}%</td><td class="tnum">${r.missingReceipt||'-'}</td></tr>`).join('');
    const body = `
      <h4>Budget position</h4>
      <table><thead><tr><th>Category</th><th style="text-align:right">Budget</th><th style="text-align:right">Committed</th><th style="text-align:right">Paid</th><th style="text-align:right">Reconciled</th><th style="text-align:right">Remaining</th><th style="text-align:right">Used</th><th style="text-align:right">Missing receipts</th></tr></thead>
      <tbody>${rows}
        <tr style="font-weight:700;border-top:2px solid #15171A"><td>Total</td><td class="tnum">${money(e.tot.budget)}</td><td class="tnum">${money(e.tot.committed)}</td>
        <td class="tnum">${money(e.tot.paid)}</td><td class="tnum">${money(e.tot.reconciled)}</td><td class="tnum">${money(e.tot.remaining)}</td><td class="tnum">${pct(e.tot.paid+e.tot.committed,e.tot.budget)}%</td><td></td></tr>
      </tbody></table>
      <h4>Budget movement</h4>
      ${chartWaterfall([
        {label:'Budget', value:e.tot.budget, kind:'total'},
        {label:'Committed', value:-e.tot.committed, color:CHART_PALETTE[1]},
        {label:'Paid', value:-e.tot.paid, color:CHART_PALETTE[6]},
        {label:'Remaining', value:e.tot.remaining, kind:'total'}
      ], {title:'Budget movement in the period', fmt:v=>money(Math.abs(v)), height:220,
        caption:'Budget less commitments less payments, against the remaining available balance. Commitment, payment and reconciliation are distinct accounting states.'})}
      <h4>Where the money went</h4>
      ${chartDonut(e.rows.filter(r=>r.paid>0).map((r,i)=>({label:r.cat.name, value:Math.round(r.paid), color:CHART_PALETTE[i%CHART_PALETTE.length]})),
        {title:'Paid by budget category', fmt:v=>money(v), centerValue:money(e.tot.paid), centerLabel:'PAID', size:190})}
      ${chartGrouped({
        labels:e.rows.filter(r=>r.budget||r.paid).map(r=>String(r.cat.name).slice(0,16)),
        series:[{label:'Budget', values:e.rows.filter(r=>r.budget||r.paid).map(r=>Math.round(r.budget)), color:CHART_PALETTE[7]},
                {label:'Paid', values:e.rows.filter(r=>r.budget||r.paid).map(r=>Math.round(r.paid)), color:CHART_PALETTE[3]},
                {label:'Committed', values:e.rows.filter(r=>r.budget||r.paid).map(r=>Math.round(r.committed)), color:CHART_PALETTE[1]}],
        title:'Budget, paid and committed by category', fmt:v=>money(v), labelHead:'Category', height:230,
        caption:'Each category drawn against its own budget line for the period.'})}
      <h4>Projection</h4>
      <p style="font-size:12px">Days elapsed ${e.daysElapsed} of ${e.daysInMonth}. At the current rate, month-end expenditure is projected at <b>${money(e.projected)}</b> against a budget of ${money(e.tot.budget)} (${e.tot.budget-e.projected>=0?'favourable':'unfavourable'} variance of ${money(Math.abs(e.tot.budget-e.projected))}).</p>
      ${chartGauge(e.projected, e.tot.budget, {label:'Projected month-end spend', fmt:v=>money(v)})}
      <h4>Evidence exceptions</h4>
      ${e.flags.length? `<ul>${e.flags.slice(0,12).map(f=>`<li>${esc(f.text)}</li>`).join('')}</ul>`:'<p style="font-size:12px">No evidence exceptions detected.</p>'}
      <p style="font-size:11px;color:#5F6B7A">Budgeted, committed, paid, reconciled and remaining are distinct accounting states. Medical approval of a request does not imply payment.</p>`;
    return reportShell({ title:'Expenditure Report', sub:`${e.period.label} · ${countyId==='all'?'All authorised counties':countyName(countyId)}`, meta: metaBase(), body,
      classification:'Restricted departmental' });
  }

  if(type==='referral'){
    const m = REPORTS.masterReferral(user,{countyId});
    if(!m) return `<div class="card"><div class="card-b">${emptyState('Not authorised','The Master Referral Document is restricted to the Medical Case Manager and explicitly authorised roles.','lock')}</div></div>`;
    const ent = m.entities.map(x=>`<tr><td>${esc(x.e.name)}</td><td>${esc(x.e.type)}</td><td>${esc(x.e.county)}</td>
      <td>${esc(titleCase(x.e.status))}</td><td class="tnum">${x.count}</td><td>${esc(x.e.added||'-')}</td></tr>`).join('');
    const rows = m.rows.slice(0,80).map(r=>`<tr><td>${esc(r.p.code)}</td><td>${esc(r.p.name)}</td><td>${esc(areaName(r.p.areaId))}</td>
      <td>${esc(countyName(r.p.countyId))}</td><td>${esc(r.entity.name)}</td><td>${esc(r.entity.type)}</td>
      <td>${r.recognised?'Verified':'<b>UNVERIFIED</b>'}</td><td>${fmtDate(r.p.intake)}</td><td>${esc(WORKFLOW.patient.labels[r.p.status]||r.p.status)}</td></tr>`).join('');
    const body=`
      <h4>Referral entity register</h4>
      <table><thead><tr><th>Entity</th><th>Type</th><th>County</th><th>Verification</th><th style="text-align:right">Patients</th><th>Added</th></tr></thead><tbody>${ent}</tbody></table>
      <h4>Patient referral register</h4>
      <table style="font-size:10.5px"><thead><tr><th>Code</th><th>Patient</th><th>Area</th><th>County</th><th>Referral entity</th><th>Type</th><th>Status</th><th>Assessment</th><th>Programme status</th></tr></thead>
      <tbody>${rows||'<tr><td colspan="9">No referrals recorded</td></tr>'}</tbody></table>
      <p style="font-size:11px;color:#5F6B7A">${m.unverified.length} referral(s) reference an entity that is not yet verified. These are flagged for clinical review and are not treated as recognised referral sources.</p>`;
    return reportShell({ title:'Master Referral Document', sub:'Patients referred by recognised hospitals, CCCs and patient support centres',
      meta: metaBase([{k:'Referral entities',v:String(m.entities.length)},{k:'Unverified referrals',v:String(m.unverified.length)}]), body,
      classification:'Confidential patient-related' });
  }

  if(type==='executive'){
    const ex = REPORTS.executive(user);
    const rows = ex.counties.map(c=>`<tr><td>${esc(c.county.name)}</td><td class="tnum">${c.active}</td><td class="tnum">${c.discharged}</td>
      <td class="tnum">${c.requests}</td><td class="tnum">${RBAC.has(user,'finance.view')?money(c.spend):'restricted'}</td><td class="tnum">${money(c.budget)}</td></tr>`).join('');
    const body=`
      <h4>County performance</h4>
      <table><thead><tr><th>County office</th><th style="text-align:right">Active</th><th style="text-align:right">Discharged</th><th style="text-align:right">Requests</th><th style="text-align:right">Spend (MTD)</th><th style="text-align:right">Monthly budget</th></tr></thead><tbody>${rows}</tbody></table>
      <h4>Data-integrity position</h4>
      <p style="font-size:12px">${ex.quality.length} observations, of which ${ex.quality.filter(q=>q.level==='crit').length} are critical.</p>
      ${ex.quality.filter(q=>q.level==='crit').slice(0,8).map(q=>`<p style="font-size:11px;margin:2px 0">• ${esc(q.text)}</p>`).join('')||'<p style="font-size:12px">No critical findings.</p>'}
      <h4>Matters for leadership decision</h4>
      <ul>
        <li>Homa Bay ministry-area list requires verification against the current organogram before field import.</li>
        <li>Patient Confidentiality & Ethical Storytelling Policy remains in PROPOSED status pending formal adoption.</li>
        <li>Hospital financial reconciliation depends on hospital focal persons submitting structured receipts; missing evidence is tracked per case.</li>
      </ul>`;
    return reportShell({ title:'Executive Performance Summary', sub:'Organisation-wide position for authorised leadership', meta: metaBase(), body,
      classification:'Internal organisational' });
  }

  if(type==='home_visits'){
    const ids = new Set(repo.patientList(user).map(p=>p.id));
    const vs = DB.db.visits.filter(v=>ids.has(v.patientId)).sort((a,b)=>new Date(b.date)-new Date(a.date));
    const week = vs.filter(v=>daysBetween(v.date)<=7);
    const seen = week.filter(v=>v.outcome==='seen').length;
    const nf = week.filter(v=>v.outcome==='not_found').length;
    const declined = week.filter(v=>v.outcome==='refused').length;
    const referred = week.filter(v=>v.outcome==='referred').length;
    const byCare = {};
    week.forEach(v=>{ byCare[v.caregiverId]=(byCare[v.caregiverId]||0)+1; });
    const rows = vs.slice(0,70).map(v=>{
      const p=DB.db.patients.find(x=>x.id===v.patientId)||{};
      return `<tr><td>${esc(p.code||'-')}</td><td>${esc(p.name||'-')}</td><td>${esc(areaName(p.areaId))}</td>
        <td>${fmtDate(v.date)}</td><td>${esc(titleCase(v.type))}</td><td>${esc(titleCase(v.outcome))}</td>
        <td class="tnum">${v.weight?v.weight+' kg':'-'}</td><td style="font-size:10.5px">${esc((v.notes||'').slice(0,90))}</td>
        <td style="font-size:10.5px">${esc(userName(v.caregiverId).replace(/^Demo - /,''))}</td></tr>`;
    }).join('');
    const body = `
      <h4>1. Visit activity (last 7 days)</h4>
      <table><thead><tr><th>Outcome</th><th style="text-align:right">Visits</th><th>Definition</th></tr></thead><tbody>
        <tr><td>Patient seen</td><td class="tnum">${seen}</td><td style="font-size:10.5px">A documented visit where the patient was present</td></tr>
        <tr><td>Not found at home</td><td class="tnum">${nf}</td><td style="font-size:10.5px">Documented attempt; the patient could not be located</td></tr>
        <tr><td>Declined visit</td><td class="tnum">${declined}</td><td style="font-size:10.5px">The patient or household declined</td></tr>
        <tr><td>Referred for clinical review</td><td class="tnum">${referred}</td><td style="font-size:10.5px">Escalated to an authorised clinician</td></tr>
        <tr style="font-weight:700"><td>Total documented visits</td><td class="tnum">${week.length}</td><td></td></tr>
      </tbody></table>
      <h4>2. Visits by caregiver</h4>
      <table><thead><tr><th>Caregiver</th><th style="text-align:right">Visits</th></tr></thead><tbody>
        ${Object.entries(byCare).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<tr><td>${esc(userName(k).replace(/^Demo - /,''))}</td><td class="tnum">${v}</td></tr>`).join('')||'<tr><td colspan="2">No visits recorded</td></tr>'}
      </tbody></table>
      <h4>3. Visit log</h4>
      <table style="font-size:10.5px"><thead><tr><th>Code</th><th>Patient</th><th>Area</th><th>Date</th><th>Type</th><th>Outcome</th><th style="text-align:right">Weight</th><th>Notes</th><th>Recorded by</th></tr></thead>
      <tbody>${rows||'<tr><td colspan="9">No visits</td></tr>'}</tbody></table>
      <p style="font-size:11px;color:#5F6B7A">A failed visit is recorded with an outcome. Silence is not evidence that a patient was visited.</p>`;
    return reportShell({ title:'Home Visit Report', sub:'Field activity for the reporting week', meta: metaBase(), body });
  }

  if(type==='hospital_ops'){
    const rows = repo.requests(user);
    const open = rows.filter(r=>!['closed','rejected'].includes(r.status));
    const served = rows.filter(r=>r.serviceCompletedAt);
    const unreconciled = rows.filter(r=>r.status==='completed'||r.status==='reconciled');
    const tx = DB.db.transactions.filter(t=>rows.some(r=>r.id===t.requestId));
    const missingReceipt = tx.filter(t=>!t.receipt).length;
    const transport = rows.filter(r=>r.transport?.required);
    const transportValue = transport.reduce((n,r)=>n+(r.transport.fare||0),0);
    const byStatus = Object.entries(rows.reduce((a,r)=>{a[r.status]=(a[r.status]||0)+1;return a;},{})).sort((a,b)=>b[1]-a[1]);
    const decided = rows.filter(r=>r.decision?.at);
    const avgDecision = decided.length? Math.round(decided.reduce((n,r)=>n+(new Date(r.decision.at)-new Date(r.submittedAt))/DAY,0)/decided.length*10)/10 : null;
    const body = `
      <h4>1. Request pipeline</h4>
      <table><thead><tr><th>State</th><th style="text-align:right">Requests</th></tr></thead><tbody>
        ${byStatus.map(([k,v])=>`<tr><td>${esc(WORKFLOW.request.labels[k]||titleCase(k))}</td><td class="tnum">${v}</td></tr>`).join('')||'<tr><td colspan="2">No requests</td></tr>'}
        <tr style="font-weight:700"><td>Open (not closed or rejected)</td><td class="tnum">${open.length}</td></tr>
      </tbody></table>
      <h4>2. Transport facilitation</h4>
      <p style="font-size:12px">${transport.length} request(s) required transport, with estimated fares totalling <b>${money(transportValue)}</b>. 
      Transport authorisation is recorded separately from medical approval and from payment.</p>
      <h4>3. Evidence and reconciliation</h4>
      <table><tbody>
        <tr><td>Requests with service recorded</td><td class="tnum" style="text-align:right">${served.length}</td></tr>
        <tr><td>Requests awaiting financial reconciliation</td><td class="tnum" style="text-align:right">${rows.filter(r=>r.status==='completed').length}</td></tr>
        <tr><td>Transactions posted</td><td class="tnum" style="text-align:right">${tx.length}</td></tr>
        <tr><td>Transactions missing a receipt</td><td class="tnum" style="text-align:right">${missingReceipt}</td></tr>
        <tr><td>Average clinical decision time (days)</td><td class="tnum" style="text-align:right">${avgDecision===null?'-':avgDecision}</td></tr>
      </tbody></table>
      <p style="font-size:11px;color:#5F6B7A">A case may only be closed when the clinical report exists and no transaction remains unreconciled.</p>`;
    return reportShell({ title:'Hospital Operations Report', sub:'Referral, transport and reconciliation position',
      meta: metaBase([{k:'Requests in scope',v:String(rows.length)}]), body, classification:'Restricted departmental' });
  }

  if(type==='quality'){
    const q = REPORTS.dataQuality(user);
    const body = `<h4>Findings</h4>
      <table><thead><tr><th>Severity</th><th>Finding</th><th>Correction route</th></tr></thead><tbody>
      ${q.map(i=>`<tr><td>${esc(titleCase(i.level))}</td><td>${esc(i.text)}</td><td>${i.level==='crit'?'Responsible department':'Data officer'}</td></tr>`).join('')||'<tr><td colspan="3">No findings</td></tr>'}
      </tbody></table>
      <h4>Audit trail integrity</h4>
      <p style="font-size:12px">${(()=>{const v=AUDIT.verify(); return `${v.entries} entries · hash chain ${v.ok?'intact':'BROKEN at '+v.broken.join(', ')}`;})()}</p>`;
    return reportShell({ title:'Data Quality & Integrity Report', sub:'Validation, duplicate detection and reconciliation gaps', meta: metaBase(), body, classification:'Restricted departmental' });
  }

  if(type==='donor'){
    const f = donorFigures(user);
    const support = Object.values(f.support.reduce((a,s)=>{ (a[s.item]=a[s.item]||{item:s.item,qty:0}).qty+=s.qty; return a; },{}));
    const body = `
      <h4>1. Programme reach</h4>
      <table><thead><tr><th>Measure</th><th style="text-align:right">Value</th><th>Definition</th></tr></thead><tbody>
        <tr><td>Patients in the programme</td><td class="tnum">${f.patients.length}</td><td>Verified register at cut-off</td></tr>
        <tr><td>Currently receiving care</td><td class="tnum">${f.active.length}</td><td>Status active or extended</td></tr>
        <tr><td>Discharged through the programme</td><td class="tnum">${f.discharged.length}</td><td>Documented discharge only</td></tr>
        <tr><td>Home visits recorded</td><td class="tnum">${f.visits.length}</td><td>All visits in the register</td></tr>
        <tr><td>Care plans on file</td><td class="tnum">${f.withPlan}</td><td>Initial plan recorded at enrolment</td></tr>
        <tr><td>Referrals closed with a clinical report</td><td class="tnum">${f.closed.length}</td><td>Status closed with evidence</td></tr>
      </tbody></table>
      <h4>2. Reach by ministry area</h4>
      ${chartRows({rows:f.counties.flatMap(c=>c.areas.map(a=>({label:a.name, value:f.patients.filter(p=>p.areaId===a.id).length}))).filter(r=>r.value>0),
        title:'Patients by ministry area', unit:'patients', labelHead:'Ministry area', valueHead:'Patients'})}
      <h4>3. Support delivered</h4>
      <table><thead><tr><th>Item</th><th style="text-align:right">Quantity</th></tr></thead><tbody>
        ${support.map(r=>`<tr><td>${esc(r.item)}</td><td class="tnum">${r.qty}</td></tr>`).join('')||'<tr><td colspan="2">No support recorded in this period</td></tr>'}
      </tbody></table>
      <h4>4. Resources</h4>
      ${f.finance? `<table><tbody>
        <tr><td>Approved budget</td><td class="tnum" style="text-align:right">${money(f.finance.budget)}</td></tr>
        <tr><td>Paid and reconciled</td><td class="tnum" style="text-align:right">${money(f.finance.paid)}</td></tr>
        <tr><td>Remaining</td><td class="tnum" style="text-align:right">${money(f.finance.remaining)}</td></tr>
      </tbody></table>` : '<p style="font-size:12px">Financial figures are outside the authority of the role that generated this report and are therefore omitted, not estimated.</p>'}
      <h4>5. Limitations</h4>
      <p style="font-size:12px">These are counts of verified records, not proof that a service caused a health outcome. Where records are missing the corresponding figure is lower than the true position; the data-quality report names the gaps. No patient is identifiable in this document.</p>`;
    return reportShell({ title:'Donor Programme Summary', sub:'Aggregate reach and resources, no identifying detail',
      meta: metaBase(), body, classification:'Donor-facing (approved)' });
  }

  if(type==='condition_summary'){
    const agg = COND.aggregate(user,{countyId});
    const body = `
      <h4>1. Recorded conditions</h4>
      <table><thead><tr><th>Condition</th><th>Classification</th><th>Sensitivity</th><th style="text-align:right">Patients</th></tr></thead><tbody>
        ${agg.rows.map(r=>`<tr><td>${esc(r.label)}</td><td>${esc((COND.def(r.key)||{}).cls||'-')}</td>
          <td>${r.sensitive?'Sensitive':'Standard'}</td>
          <td class="tnum">${r.n===null?esc(r.band):r.n}</td></tr>`).join('')||'<tr><td colspan="4">No conditions recorded</td></tr>'}
      </tbody></table>
      <h4>2. Suppression statement</h4>
      <p style="font-size:12px">${agg.note||'No category fell below the reporting threshold of five patients.'}
      Counts are of patients, not episodes. Only conditions recorded by a clinician or a caregiver are counted; nothing is inferred.</p>`;
    return reportShell({ title:'Condition Summary', sub:'Structured conditions with small-group suppression',
      meta: metaBase(), body, classification:'Restricted departmental' });
  }

  return `<div class="card"><div class="card-b">${emptyState('Report not available','This report type is not configured for your role.','file')}</div></div>`;
}

function renderReportView(user, params){
  const rec = DB.db.reports.find(r=>r.id===params.id);
  const type = rec? rec.type : params.type;
  const countyId = rec? rec.countyId : (params.countyId||user.countyId);
  const tblMode = (typeof isChartTableMode==='function' && isChartTableMode());
  const html = buildReportDoc(type,{countyId: countyId==='all'?'all':countyId}, user);
  return `<div class="row no-print" style="margin-bottom:14px;justify-content:space-between;flex-wrap:wrap;gap:8px">
      <button class="btn btn-sm btn-ghost" data-act="go" data-v="reports">${ic('chevron',13)} Back</button>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        ${rec?`<span class="chip">${esc(rec.title)} · ${esc(rec.periodKey)} · v${rec.version}</span>`:`<span class="chip">Preview - not yet archived</span>`}
        <button class="btn btn-sm ${tblMode?'btn-primary':'btn-ghost'}" data-act="toggle-chart-table-mode">${ic('columns',14)} ${tblMode?'Charts & tables':'Tables only'}</button>
        <button class="btn btn-sm btn-ghost" data-act="print">${ic('download',14)} Print / PDF</button>
        <button class="btn btn-sm btn-ghost" data-act="export-report-docx" data-type="${esc(type||'')}" data-county-id="${esc(countyId||'')}">${ic('download',14)} Word</button>
        ${rec?`<button class="btn btn-sm btn-ghost" data-act="export-report" data-id="${rec.id}">${ic('download',14)} CSV</button>`:''}
      </div>
    </div>${html}`;
}
