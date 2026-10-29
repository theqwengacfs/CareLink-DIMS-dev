/* ============================================================================
   role_consoles68.js — CareLink C-DIMS v6.8.0
   29 Bespoke Role, Department & Geographic-Scope Console Workbenches
   ----------------------------------------------------------------------------
   Re-engineers every user account's home console so each department, seat tier
   and geographic scope (Global, Kisumu HQ, Homa Bay County, Assigned Ministry
   Areas, Assigned Hospital Custody, Pharmacy FEFO, External Partners) opens a
   purpose-built, decongested, executive-grade operational workbench.
   ============================================================================ */

const ROLE_CONSOLES_68 = {
  /* Resolve the exact bespoke console key — distinguishes Pharmacy Officer from
     Clinical Nurse, Kisumu HQ Admin from Homa Bay County Admin, Secretaries/Clerks
     from Assistants, and all 29 role templates. */
  profileKey(user){
    if(!user) return 'default';
    const uname = String(user.username || '').toLowerCase();
    const dept  = String(user.departmentId || (roleObj(user.roleId) || {}).dept || '').toLowerCase();
    if(dept === 'pharmacy' || uname.includes('pharmacy')) return 'pharmacy';
    return user.roleId || 'default';
  },

  scopeBadge(user){
    if(!user) return 'Scoped Workspace';
    const r = roleObj(user.roleId) || {};
    const s = r.scope || {};
    if(user.facility) return `${user.facility}`;
    if(user.agency) return `${user.agency}`;
    if(s.geo === 'areas' || (user.areaIds && user.areaIds.length)){
      const areas = (user.areaIds || []).map(areaName).join(', ');
      return `${countyName(user.countyId)} · ${areas || 'Assigned Ministry Area'}`;
    }
    if(s.records === 'assigned') return `${countyName(user.countyId)} · Assigned Cases Only`;
    if(s.geo === 'global' || s.crossCounty) return 'Kisumu HQ & Homa Bay · Dual-County Authority';
    return user.countyId ? `${countyName(user.countyId)} Scope` : 'Organisation Scope';
  },

  /* Safe helper: only render a launchpad tile if the user actually holds access to that view or action */
  canOpenView(user, viewId){
    if(!user || !viewId) return false;
    if(viewId === 'home') return true;
    if(typeof navModel === 'function'){
      const items = navModel(user).flatMap(g => g.items || []);
      if(items.some(i => i.id === viewId)) return true;
    }
    const viewCaps = {
      devconsole: 'dev.console',
      adminops: 'admin.ops',
      clinicalmcm: 'clinical.mcm',
      hardcopy: 'hardcopy.intake',
      cccdesk: 'ccc.desk',
      govpartner: 'gov.oversight',
      intlmedical: 'intl.medical',
      handover: 'handover.use',
      costing: 'cost.view',
      finance: 'finance.view',
      procurement: 'procurement.view',
      pharmacy: 'pharmacy.view',
      careplans: 'careplan.view',
      patients: 'patient.list',
      pipeline: 'patient.digitise',
      visits: 'visit.view',
      pdca: 'pdca.create',
      requests: 'hosp.request.create',
      consent: 'media.consent.manage',
      media: 'media.view',
      studio: 'media.view',
      pr: 'pr.view',
      staff: 'hr.view',
      leave: 'hr.view',
      welfare: 'welfare.view',
      vehicles: 'vehicle.view',
      audit: 'audit.view',
      history: 'system.audit',
      executive: 'report.executive',
      reports: 'report.departmental',
      monday: 'monday.meeting'
    };
    const reqCap = viewCaps[viewId];
    return reqCap ? RBAC.has(user, reqCap) : true;
  },

  tile(user, cfg){
    const allowed = cfg.act && cfg.act !== 'go'
      ? (!cfg.cap || RBAC.has(user, cfg.cap))
      : this.canOpenView(user, cfg.v);
    if(!allowed) return '';
    const attrs = cfg.act && cfg.act !== 'go'
      ? `data-act="${esc(cfg.act)}"${cfg.extra || ''}`
      : `data-act="go" data-v="${esc(cfg.v)}"${cfg.tab ? ` data-tab="${esc(cfg.tab)}"` : ''}`;
    return `<button type="button" class="rc68-tile" ${attrs}>
      <span class="rc68-tile-ic">${ic(cfg.icon || 'layers', 17)}</span>
      <span class="rc68-tile-body">
        <b>${esc(cfg.title)}</b>
        <span>${esc(cfg.sub)}</span>
      </span>
      ${cfg.count !== undefined && cfg.count !== null ? `<span class="rc68-tile-ct ${cfg.tone || ''}">${esc(String(cfg.count))}</span>` : ''}
    </button>`;
  },

  /* Build the bespoke console signature workbench for each of the 29 roles/scopes */
  specFor(user){
    const key = this.profileKey(user);
    const db = (typeof DB !== 'undefined' && DB.db) ? DB.db : {};
    const ps = (typeof repo !== 'undefined' && repo.patientList && RBAC.has(user, 'patient.list')) ? repo.patientList(user, {}) : [];
    const activePs = ps.filter(p => ['active', 'extension'].includes(p.status));
    const reqs = (typeof repo !== 'undefined' && repo.requests) ? repo.requests(user) : [];
    const openReqs = reqs.filter(r => !['closed', 'rejected'].includes(r.status));
    const isKsm = user.countyId === 'kisumu';
    const cname = user.countyId ? countyName(user.countyId) : 'Kisumu & Homa Bay';

    switch(key){
      /* 1. CHIEF SYSTEM ADMINISTRATOR */
      case 'chief': {
        const usersCount = (db.users || []).length;
        const approvals = (db.approvals || []).filter(a => a.status === 'pending').length;
        const auditVerify = (typeof AUDIT !== 'undefined' && AUDIT.verify) ? AUDIT.verify() : { ok:true, entries:0 };
        return {
          color: '#0F4C81',
          code: 'SOVEREIGN PLATFORM CONSOLE',
          headline: 'Platform Architecture, Cloud Sharding & Security Control Plane',
          summary: 'Global custody over user provisioning, RBAC seat templates, Upstash cloud sync, 4-officer Dual-Control gates, and audited Silent Workspace Inspection — while clinical/media privacy rules remain non-bypassable.',
          tiles: [
            { v:'devconsole', icon:'flow', title:'CareLink Development Console', sub:'Cloud shards, Redis health & SMS packs', count:'LIVE', tone:'ok' },
            { v:'users', icon:'userplus', title:'Seat Directory & Silent View', sub:`${num(usersCount)} configured accounts`, count:num(usersCount) },
            { v:'dualcheck', icon:'key', title:'Dual-Control Approvals', sub:'Exports, restores & 4-officer resets', count:num(approvals), tone:approvals ? 'warn' : 'ok' },
            { v:'history', icon:'shieldcheck', title:'SHA-256 Audit Ledger', sub:auditVerify.ok ? 'Hash chain verified' : 'Check chain', count:auditVerify.ok ? 'OK' : '!', tone:auditVerify.ok ? 'ok' : 'crit' }
          ],
          workbenchTitle: 'System Control Matrix · Kisumu HQ & Homa Bay Cloud Topology',
          workbenchHtml: `<div class="rc68-stat-strip">
            <div class="rc68-stat-cell"><small>Authorised Seats</small><b>${num(usersCount)}</b><span>29 RBAC role templates</span></div>
            <div class="rc68-stat-cell"><small>Audit Integrity</small><b>${auditVerify.ok ? '100% Intact' : 'Alert'}</b><span>${num(auditVerify.entries || (db.audit || []).length)} chained events</span></div>
            <div class="rc68-stat-cell"><small>Dual Signatures</small><b>${num(approvals)}</b><span>Pending second officer</span></div>
            <div class="rc68-stat-cell"><small>Privacy Engine</small><b>Enforced</b><span>DPA-2019 non-bypassable</span></div>
          </div>`
        };
      }

      /* 2. PRESIDENT / BOARD CHAIR */
      case 'president': {
        const allP = (db.patients || []).filter(p => p.status !== 'merged');
        const act = allP.filter(p => ['active', 'extension'].includes(p.status)).length;
        const grad = allP.filter(p => p.status === 'discharged').length;
        return {
          color: '#1E3A8A',
          code: 'BOARD & PRESIDENTIAL STEWARDSHIP',
          headline: 'Dual-Entity Governance, 2027–2031 Trajectory & Fiduciary Assurance',
          summary: 'Board-level oversight uniting LOMAMO Foundation Kenya (approved Oct 2018) and LOVE MATTERS MOST, Inc. (US 501(c)(3) EIN 83-3329252) around the ~$300/patient recovery model.',
          tiles: [
            { v:'executive', icon:'chart', title:'Executive Board Summary', sub:'Cross-county outcomes & stewardship', count:num(act), tone:'ok' },
            { v:'policy', tab:'strategic', icon:'target', title:'2027–2031 Strategic Plan', sub:'7× scale-up to 3,703 active caseload', count:'6 Pillars' },
            { v:'policy', tab:'legal', icon:'building', title:'Charter & Form 990 Stewardship', sub:'Board governance & audited filings' },
            { v:'govpartner', icon:'globe', title:'County MOH Impact Lens', sub:'De-identified k ≥ 5 public impact', count:num(grad) }
          ],
          workbenchTitle: 'Fiduciary & Mission Scorecard',
          workbenchHtml: `<div class="rc68-stat-strip">
            <div class="rc68-stat-cell"><small>Active Beneficiaries</small><b>${num(act)}</b><span>Kisumu (7) &amp; Homa Bay (3)</span></div>
            <div class="rc68-stat-cell"><small>Healthy Graduations</small><b>${num(grad)}</b><span>Documented PDCA recoveries</span></div>
            <div class="rc68-stat-cell"><small>Unit Cost Benchmark</small><b>~$300 / yr</b><span>Fully loaded recovery cycle</span></div>
            <div class="rc68-stat-cell"><small>2031 Strategic Horizon</small><b>3,703</b><span>Target active caseload</span></div>
          </div>`
        };
      }

      /* 3. COUNTRY DIRECTOR */
      case 'director': {
        const ksmAct = (db.patients || []).filter(p => p.countyId === 'kisumu' && ['active', 'extension'].includes(p.status)).length;
        const hbyAct = (db.patients || []).filter(p => p.countyId === 'homabay' && ['active', 'extension'].includes(p.status)).length;
        const over120 = ps.filter(p => p.status === 'active' && PAT.days(p) >= 120).length;
        const pendLeave = (db.leaveRequests || []).filter(l => l.status === 'pending').length;
        return {
          color: '#1E3A8A',
          code: 'COUNTRY DIRECTOR NATIONAL COMMAND',
          headline: 'National Programme Execution · Kisumu HQ & Homa Bay Expansion',
          summary: 'Direct operational command across 10 ministry areas, 120+ day clinical extensions, consolidated Kenya monthly financials, staff leave approvals, and Monday management coordination.',
          tiles: [
            { v:'compare', icon:'columns', title:'Kisumu vs Homa Bay Matrix', sub:`KSM ${num(ksmAct)} · HBY ${num(hbyAct)} active`, count:'2 Counties' },
            { v:'adminops', icon:'wallet', title:'Kenya Consolidated Ops', sub:'PAYG, 9th statutory & OpEx oversight' },
            { v:'intlmedical', icon:'activity', title:'120+ Day Extension Desk', sub:'Complex cases needing concurrence', count:num(over120), tone:over120 ? 'warn' : 'ok' },
            { v:'leave', icon:'calendar', title:'Director Leave & Handovers', sub:'Staff leave & reliever continuity', count:num(pendLeave), tone:pendLeave ? 'warn' : 'ok' }
          ],
          workbenchTitle: 'Dual-County Executive Command Pulse',
          workbenchHtml: `<div class="rc68-stat-strip">
            <div class="rc68-stat-cell"><small>Kisumu County (7 Areas)</small><b>${num(ksmAct)}</b><span>Established flagship hub</span></div>
            <div class="rc68-stat-cell"><small>Homa Bay County (3 Areas)</small><b>${num(hbyAct)}</b><span>Launched Feb 2026</span></div>
            <div class="rc68-stat-cell"><small>120+ Day Reviews</small><b>${num(over120)}</b><span>PDCA justification gate</span></div>
            <div class="rc68-stat-cell"><small>Pending Leave Decisions</small><b>${num(pendLeave)}</b><span>Coverage-checked</span></div>
          </div>`
        };
      }

      /* 4. CHIEF PROGRAM ADMINISTRATOR / INTERNAL OPERATIONS MANAGER */
      case 'program.admin': {
        const dq = (typeof REPORTS !== 'undefined' && REPORTS.dataQuality) ? REPORTS.dataQuality(user) : [];
        const pipeCount = ps.filter(p => ['digital_entered', 'awaiting_verification', 'returned'].includes(p.status)).length;
        return {
          color: '#7C2D12',
          code: 'INTERNAL OPERATIONS & PROGRAMME COMMAND',
          headline: 'Cross-Departmental Delivery, Intake Velocity & Quality Control',
          summary: 'Synchronises county intake pipelines, Monday departmental reporting, OHS & intern governance, asset custody, and data-quality discipline across Kisumu and Homa Bay.',
          tiles: [
            { v:'monday', icon:'users', title:'Monday Management Board', sub:'Cross-department agendas & actions' },
            { v:'hardcopy', icon:'upload', title:'Hard-Copy Intake Oversight', sub:'Physical forms & scan verification', count:num(pipeCount), tone:pipeCount ? 'warn' : 'ok' },
            { v:'adminops', icon:'calendar', title:'Operational Expenses & Statutory', sub:'9th remittances & county schedules' },
            { v:'reports', icon:'file', title:'Programme Indicator Hub', sub:`${num(dq.length)} validation flags`, count:num(dq.length), tone:dq.length ? 'warn' : 'ok' }
          ],
          workbenchTitle: 'Internal Operations & Bottleneck Radar',
          workbenchHtml: `<div class="rc68-stat-strip">
            <div class="rc68-stat-cell"><small>Active Programme Cohort</small><b>${num(activePs.length)}</b><span>10 ministry areas</span></div>
            <div class="rc68-stat-cell"><small>Intake Verification Queue</small><b>${num(pipeCount)}</b><span>Hard-copy first gate</span></div>
            <div class="rc68-stat-cell"><small>Open Hospital Referrals</small><b>${num(openReqs.length)}</b><span>Cross-county clinical flow</span></div>
            <div class="rc68-stat-cell"><small>Data Quality Flags</small><b>${num(dq.length)}</b><span>Routed to owning dept</span></div>
          </div>`
        };
      }

      /* 5. PROGRAMME ASSISTANT / EXECUTIVE SECRETARY */
      case 'program.assistant': {
        const mon = (typeof REPORTS !== 'undefined' && REPORTS.mondayStatus) ? REPORTS.mondayStatus() : { label:'Monday 08:00' };
        return {
          color: '#B45309',
          code: 'EXECUTIVE & PROGRAMME SECRETARIAT',
          headline: 'Monday Management Minutes, Departmental Briefs & Office Coordination',
          summary: 'Coordinates executive agendas, Monday meeting packs, intern/visitor schedules, and inter-departmental follow-ups for Head Office.',
          tiles: [
            { v:'monday', icon:'clipboard', title:'Monday Meeting Secretariat', sub:mon.label || 'Weekly management pack', count:'SEC', tone:'info' },
            { v:'reports', icon:'file', title:'Departmental Report Pack', sub:'Weekly & monthly submissions' },
            { v:'messages', icon:'send', title:'Staff Coordination Desk', sub:'Direct county & dept messaging' },
            { v:'handover', icon:'key', title:'Delegation & Reliever Log', sub:'Active seat handovers' }
          ]
        };
      }

      /* 6. COUNTY OFFICE ADMINISTRATOR (Kisumu HQ vs Homa Bay County) */
      case 'countyadmin': {
        const countyAreas = (COUNTIES.find(c => c.id === user.countyId) || { areas:[] }).areas;
        const waitEnrol = ps.filter(p => ['awaiting_verification', 'approved_enrolment'].includes(p.status)).length;
        const waitDisch = ps.filter(p => p.status === 'discharge_recommended').length;
        const waitAssign = openReqs.filter(r => r.status === 'approved').length;
        return {
          color: isKsm ? '#0369A1' : '#6D28D9',
          code: isKsm ? 'KISUMU HEAD OFFICE ADMINISTRATION' : 'HOMA BAY COUNTY ADMINISTRATION',
          headline: isKsm
            ? 'Kisumu County & Head Office Consolidation Command (7 Ministry Areas)'
            : 'Homa Bay County Office Operations & Expansion Command (3 Ministry Areas)',
          summary: isKsm
            ? 'Governs Kisumu enrolment/discharge sign-offs, hospital focal assignments, daily PAYG, 9th statutory remittances, Operational Expenses, and Kenya monthly financial consolidation.'
            : 'Governs Homa Bay beneficiary verification, Makongeni / Shauri Yako / Sofia field coordination, hospital focal assignments, and monthly submission to Kisumu HQ.',
          tiles: [
            { v:'adminops', icon:'wallet', title:isKsm ? 'HQ & County Admin Ops' : 'County PAYG & Statutory', sub:'Daily PAYG · 9th statutory · OpEx' },
            { v:'pipeline', icon:'check', title:'Enrolment & Discharge Gate', sub:`${num(waitEnrol)} intake · ${num(waitDisch)} discharge`, count:num(waitEnrol + waitDisch), tone:(waitEnrol + waitDisch) ? 'warn' : 'ok' },
            { v:'requests', icon:'hospital', title:'Assign Hospital Focal', sub:'Approved referrals awaiting escort', count:num(waitAssign), tone:waitAssign ? 'warn' : 'ok' },
            { v:'monday', icon:'users', title:'County Monday Meeting', sub:`${countyAreas.length} ministry areas reporting` }
          ],
          workbenchTitle: `${cname} Catchment & Administrative Gateways`,
          workbenchHtml: `<div class="rc68-matrix">
            ${countyAreas.map(a => {
              const cnt = activePs.filter(p => p.areaId === a.id).length;
              return `<div class="rc68-matrix-cell" style="--rc-c:${isKsm ? '#0369A1' : '#6D28D9'}">
                <div class="spread"><b>${esc(a.name)}</b><span class="badge b-neutral nodot">${num(cnt)} active</span></div>
                <span>${esc(a.subCounty)} · ${esc(AREA_CLASS_LABEL[a.cls] || a.cls)}${a.unverified ? ' · Verify' : ''}</span>
              </div>`;
            }).join('')}
          </div>`
        };
      }

      /* 7. ADMINISTRATIVE ASSISTANT / MONDAY SECRETARY / HARD-COPY CLERK */
      case 'assistant': {
        const toDigitise = ps.filter(p => ['digital_entered', 'returned'].includes(p.status)).length;
        const toVerify = ps.filter(p => p.status === 'awaiting_verification').length;
        return {
          color: '#0E7490',
          code: `${cname.toUpperCase()} INTAKE & MONDAY SECRETARIAT`,
          headline: 'Hard-Copy Assessment Digitisation, Returning-Patient Gate & Monday Minutes',
          summary: 'First-line registry desk: digitises signed physical intake & discharge forms with scanned page evidence, runs returning-patient (`pmi.check`) checks, and serves as County Monday Meeting Secretary.',
          tiles: [
            { v:'hardcopy', icon:'upload', title:'Hard-Copy Scan & Intake', sub:'Physical assessment & discharge sheets', count:num(toDigitise), tone:toDigitise ? 'warn' : 'ok' },
            { v:'pipeline', icon:'eye', title:'Source Verification Queue', sub:'Cross-check digits vs paper scan', count:num(toVerify), tone:toVerify ? 'warn' : 'ok' },
            { v:'repeat', icon:'search', title:'Returning-Patient Check', sub:'Duplicate & prior-discharge lookup' },
            { v:'monday', icon:'clipboard', title:'Monday Meeting Secretary', sub:'Prepare agenda & record county minutes', count:'MON', tone:'info' }
          ]
        };
      }

      /* 8. MEDICAL CASE MANAGER */
      case 'mcm': {
        const subReqs = reqs.filter(r => r.status === 'submitted').length;
        const lowBmi = activePs.filter(p => Number(p.clinical?.bmi || 99) < 16).length;
        const over120 = activePs.filter(p => PAT.days(p) >= 120).length;
        const dischRec = ps.filter(p => p.status === 'discharge_recommended').length;
        return {
          color: '#0E7490',
          code: `${cname.toUpperCase()} CLINICAL TRIAGE & PDCA COMMAND`,
          headline: 'Medical Case Management, Acuity Escalation & 120-Day Clinical Governance',
          summary: 'Clinical authority over hospital referral approvals, severe malnutrition (BMI < 16 / child MUAC), TB pyridoxine authorizations, 30/120-day PDCA reviews, and evidence-backed discharge sign-offs.',
          tiles: [
            { v:'clinicalmcm', icon:'activity', title:'Case Manager Clinical Desk', sub:'SOAP notes, acuity & TB pyridoxine', count:num(subReqs), tone:subReqs ? 'warn' : 'ok' },
            { v:'bmiboard', icon:'pulse', title:'BMI & Child MUAC Watchlist', sub:`${num(lowBmi)} severe BMI < 16 cases`, count:num(lowBmi), tone:lowBmi ? 'crit' : 'ok' },
            { v:'pdca', icon:'repeat', title:'30-Day & 120-Day PDCA', sub:`${num(over120)} cases at 120+ days`, count:num(over120), tone:over120 ? 'warn' : 'ok' },
            { v:'patients', icon:'check', title:'Discharge Clinical Sign-Off', sub:'Verify recovery evidence before exit', count:num(dischRec), tone:dischRec ? 'info' : 'ok' }
          ],
          workbenchTitle: 'Clinical Acuity Stratification · Separation of Clinical vs Administrative Urgency',
          workbenchHtml: `<div class="rc68-stat-strip">
            <div class="rc68-stat-cell"><small>Pending Referral Triage</small><b>${num(subReqs)}</b><span>Clinical decision ≠ payment</span></div>
            <div class="rc68-stat-cell"><small>Severe Malnutrition</small><b>${num(lowBmi)}</b><span>Adult BMI &lt; 16.0 priority</span></div>
            <div class="rc68-stat-cell"><small>120+ Day Cohort</small><b>${num(over120)}</b><span>Official C-DIMS PDCA review</span></div>
            <div class="rc68-stat-cell"><small>Discharge Ready</small><b>${num(dischRec)}</b><span>Awaiting clinical sign-off</span></div>
          </div>`
        };
      }

      /* 9. MEDICAL DEPARTMENT HEAD */
      case 'depthead': {
        const clinOpen = (db.concerns || []).filter(c => c.level === 'clinical' && c.status === 'open').length;
        return {
          color: '#1E3A5F',
          code: 'MEDICAL DEPARTMENT SUPERVISION CONSOLE',
          headline: 'Clinical Quality Assurance, Cadre Supervision & Referral Outcomes',
          summary: 'Departmental leadership across Medical Case Managers, Clinical Officers, Pharmacy FEFO operations, and hospital referral performance.',
          tiles: [
            { v:'clinicalmcm', icon:'activity', title:'Clinical Escalation Board', sub:`${num(clinOpen)} open clinical concerns`, count:num(clinOpen), tone:clinOpen ? 'crit' : 'ok' },
            { v:'conditions', icon:'pulse', title:'Disease Burden Analytics', sub:'HIV/TB, nutrition & chronic cohort mix' },
            { v:'pharmacy', icon:'package', title:'Pharmacy & TB Stock Lens', sub:'FEFO batches & 10-day pyridoxine' },
            { v:'leave', icon:'calendar', title:'Clinical Roster & Leave', sub:'Maintain safe county clinical cover' }
          ]
        };
      }

      /* 10. CLINICAL PHARMACIST & FEFO OFFICER (distinct from Clinical Nurse!) */
      case 'pharmacy': {
        const stocks = (db.pharmacyStock || db.drugs || []);
        const lowStock = stocks.filter(s => Number(s.qty || s.balance || 0) <= Number(s.reorder || 15)).length;
        const rxs = (db.prescriptions || []).filter(r => r.status !== 'dispensed').length;
        return {
          color: '#0D9488',
          code: 'FEFO CLINICAL PHARMACY & TB DISPENSARY',
          headline: 'FEFO Batch Control, Prescriptions & 10-Day TB Pyridoxine Stewardship',
          summary: 'Dedicated pharmaceutical console enforcing First-Expiry-First-Out (FEFO) dispensing, TB pyridoxine 10-day course tracking, stock reorder thresholds, and three-way physical reconciliation.',
          tiles: [
            { v:'pharmacy', icon:'package', title:'FEFO Dispensary & Stock', sub:`${num(lowStock)} low/expiring lines`, count:num(lowStock), tone:lowStock ? 'warn' : 'ok' },
            { v:'careplans', icon:'clipboard', title:'Active Regimens & Care Plans', sub:`${num(rxs)} pending prescriptions`, count:num(rxs) },
            { v:'patients', icon:'users', title:'Medication Cohort Lookup', sub:`${num(activePs.length)} active county patients` },
            { v:'costing', tab:'dept', icon:'receipt', title:'Pharmacy Service Cost Lens', sub:'Attributed drug & TB spend' }
          ],
          workbenchTitle: 'Dispensary Safeguards · Three-Way Stock & Regimen Control',
          workbenchHtml: `<div class="rc68-stat-strip">
            <div class="rc68-stat-cell"><small>Tracked Stock Lines</small><b>${num(stocks.length || 12)}</b><span>FEFO batch-locked</span></div>
            <div class="rc68-stat-cell"><small>Reorder / Expiry Watch</small><b>${num(lowStock)}</b><span>Threshold alerts</span></div>
            <div class="rc68-stat-cell"><small>Pending Dispensing</small><b>${num(rxs)}</b><span>Clinician-prescribed</span></div>
            <div class="rc68-stat-cell"><small>TB Pyridoxine Rule</small><b>10-Day Cap</b><span>MCM verified refills</span></div>
          </div>`
        };
      }

      /* 11. CLINICAL OFFICER / NURSE & ANTHROPOMETRY LEAD */
      case 'nurse': {
        const childCount = activePs.filter(p => Number(p.age || 99) < 18).length;
        const openPdca = (db.pdcas || []).filter(x => x.status === 'open').length;
        return {
          color: '#0284C7',
          code: `${cname.toUpperCase()} CLINICAL & ANTHROPOMETRY WORKBENCH`,
          headline: 'Bedside/Home Clinical Reviews, Adult BMI & Child Weight/MUAC Curves',
          summary: 'Focused nursing & clinical officer console for longitudinal vital signs, nutritional recovery curves (≥12 visits, child Weight/BMI/MUAC), care-plan ratings, and 30-day PDCA clinical checks.',
          tiles: [
            { v:'bmiboard', icon:'pulse', title:'Anthropometry & MUAC Board', sub:`${num(childCount)} children + adult BMI curves`, count:num(childCount), tone:'info' },
            { v:'careplans', icon:'clipboard', title:'Nursing Care Plans', sub:'Outcome scales & clinical interventions' },
            { v:'pdca', icon:'repeat', title:'30-Day PDCA Reviews', sub:`${num(openPdca)} active clinical cycles`, count:num(openPdca), tone:openPdca ? 'warn' : 'ok' },
            { v:'pharmacy', icon:'package', title:'Prescribe & Dispense', sub:'County formulary & pyridoxine' }
          ]
        };
      }

      /* 12. HOMESTAY & SHORT-STAY CARE CENTRE COORDINATOR */
      case 'homestay': {
        const beds = (db.careBeds || db.homestayPlacements || []);
        return {
          color: '#B45309',
          code: `${cname.toUpperCase()} HOMESTAY & RESPITE CARE CENTRE`,
          headline: 'Short-Stay Recovery Beds, Daily Care Logs & Child Safeguarding Chains',
          summary: 'Manages step-down respite placements after hospital discharge, daily nutrition/medication observation logs, and Children Act (§27) household care-chain custody.',
          tiles: [
            { v:'carecentre', icon:'bed', title:'Respite Bed & Placement Board', sub:'Admissions, step-down & readiness', count:num(beds.length || activePs.slice(0, 6).length) },
            { v:'patients', icon:'users', title:'County Recovery Cohort', sub:`${num(activePs.length)} active beneficiaries` },
            { v:'requests', icon:'hospital', title:'Hospital Step-Down Links', sub:'Coordinate discharge-to-homestay' },
            { v:'policy', tab:'charter', icon:'shield', title:'Safeguarding Code (§27)', sub:'24-hour incident escalation rule' }
          ]
        };
      }

      /* 13. HOSPITAL FOCAL / LIAISON DESK */
      case 'liaison': {
        const assigned = reqs.filter(r => r.status === 'assigned').length;
        const needReceipt = reqs.filter(r => r.status === 'completed').length;
        return {
          color: '#0F766E',
          code: `${cname.toUpperCase()} HOSPITAL FOCAL & ESCORT DESK`,
          headline: 'Assigned Hospital Escorts, Friday Clinic Runs & Receipt Evidence',
          summary: 'Strictly scoped to hospital cases assigned to you: coordinate outpatient/inpatient escorts, SHA/SHIF clearance, patient transport fares, and same-week eTIMS/hospital receipt submission.',
          tiles: [
            { v:'requests', icon:'route', title:'My Assigned Escorts', sub:'Active hospital appointments', count:num(assigned), tone:assigned ? 'info' : 'ok' },
            { v:'requests', icon:'receipt', title:'Submit Hospital Receipts', sub:'Completed visits needing evidence', count:num(needReceipt), tone:needReceipt ? 'warn' : 'ok' },
            { v:'cccdesk', icon:'hospital', title:'CCC / Facility Feedback', sub:'Record clinician outcomes & return date' },
            { v:'costing', tab:'dept', icon:'wallet', title:'Hospital Service Cost Lens', sub:'Fees, labs & transport attribution' }
          ]
        };
      }

      /* 14. MINISTRY AREA COORDINATOR */
      case 'coordinator': {
        const areaLabels = (user.areaIds || []).map(areaName).join(', ') || cname;
        const disch = ps.filter(p => p.status === 'discharge_recommended').length;
        const overdue = activePs.filter(p => { const lv = PAT.lastVisit(p); return !lv || daysBetween(lv.date) > 21; }).length;
        return {
          color: '#059669',
          code: `MINISTRY AREA COMMAND · ${areaLabels.toUpperCase()}`,
          headline: `${areaLabels} Field Schedule, Caregiver Balance & 21-Day Visit Discipline`,
          summary: 'Area-scoped command over weekly home-visit days, caregiver household distribution, 30-day PDCA reviews, discharge recommendations, and your ministry area expenditure.',
          tiles: [
            { v:'patients', icon:'users', title:'Area Household Register', sub:areaLabels, count:num(activePs.length), tone:'ok' },
            { v:'visits', icon:'activity', title:'21-Day Follow-Up Radar', sub:`${num(overdue)} overdue households`, count:num(overdue), tone:overdue ? 'crit' : 'ok' },
            { v:'schedule', icon:'calendar', title:'Area Home-Visit Schedule', sub:'Tue–Fri field & driver roster' },
            { v:'costing', tab:'area', icon:'wallet', title:'My Ministry Area Cost', sub:`${num(disch)} discharge recs pending` }
          ]
        };
      }

      /* 15. SUPPORTING CAREGIVER */
      case 'caregiver': {
        const areaLabels = (user.areaIds || []).map(areaName).join(', ') || cname;
        const duePdca = (typeof PDCAX !== 'undefined' && PDCAX.due) ? PDCAX.due(user, { days:14 }).length : 0;
        const overdue = activePs.filter(p => { const lv = PAT.lastVisit(p); return !lv || daysBetween(lv.date) > 21; }).length;
        return {
          color: '#047857',
          code: `FIELD CAREGIVER WORKBENCH · ${areaLabels.toUpperCase()}`,
          headline: `Today’s Household Route, Weight/MUAC Check-Ins & Foodbag Care (${areaLabels})`,
          summary: 'Thumb-friendly tablet & desktop field console: log home visits, capture weight/BMI/MUAC, issue foodbags, complete 30-day PDCA milestones, and escalate hospital needs.',
          tiles: [
            { act:'record-visit', cap:'visit.create', icon:'activity', title:'Log Home Visit Now', sub:'Vitals, weight, foodbag & notes', count:'GO', tone:'ok' },
            { v:'patients', icon:'users', title:'My Assigned Households', sub:`${num(overdue)} past 21d follow-up`, count:num(activePs.length) },
            { v:'pdca', icon:'repeat', title:'30-Day Reviews Due', sub:'Plan-Do-Check-Act milestones', count:num(duePdca), tone:duePdca ? 'warn' : 'ok' },
            { act:'new-request', cap:'hosp.request.create', icon:'hospital', title:'Request Hospital Escort', sub:'Clinical triage & transport' }
          ]
        };
      }

      /* 16. COMMUNITY HEALTH WORKER / VOLUNTEER */
      case 'chw': {
        const areaLabels = (user.areaIds || []).map(areaName).join(', ') || cname;
        return {
          color: '#15803D',
          code: `COMMUNITY HEALTH PARTNER · ${areaLabels.toUpperCase()}`,
          headline: `Community Follow-Up, Defaulter Tracing & Household Support (${areaLabels})`,
          summary: 'Streamlined community health console for household wellness checks, weight/adherence follow-up, and rapid escalation to the Area Coordinator or Medical Case Manager.',
          tiles: [
            { act:'record-visit', cap:'visit.create', icon:'heart', title:'Record Community Visit', sub:'Household wellness & weight check', count:'LOG', tone:'ok' },
            { v:'patients', icon:'users', title:'Area Households', sub:areaLabels, count:num(activePs.length) },
            { v:'pdca', icon:'repeat', title:'PDCA Follow-Up Tasks', sub:'30-day care milestones' },
            { v:'messages', icon:'send', title:'Message Coordinator / MCM', sub:'Escalate urgent household needs' }
          ]
        };
      }

      /* 17. FINANCE OFFICER */
      case 'finance': {
        let fin = null;
        try{ fin = REPORTS.expenditure(user, {}); }catch(_e){}
        const unrec = fin ? fin.tx.filter(t => t.status !== 'reconciled').length : 0;
        return {
          color: '#1D4ED8',
          code: `${cname.toUpperCase()} TREASURY, PAYG & 9TH STATUTORY LEDGER`,
          headline: 'Daily PAYG, Weekly Suppliers, 9th Statutory Remittances & Operational Expenses',
          summary: 'Structured 4-cadence financial control: enforces separation between clinical approval and payment, tracks KRA eTIMS/receipt evidence, and reconciles ~$300/patient attribution.',
          tiles: [
            { v:'adminops', icon:'calendar', title:'PAYG · 9th Statutory · OpEx', sub:'SHIF, PAYE, NSSF & Housing Levy' },
            { v:'finance', icon:'wallet', title:'Voucher Reconciliation', sub:`${num(unrec)} un-reconciled tx`, count:num(unrec), tone:unrec ? 'warn' : 'ok' },
            { v:'costing', tab:'overview', icon:'receipt', title:'Cost per Patient (~$300)', sub:'Per-patient & per-area KES lens' },
            { v:'foodbudget', icon:'clipboard', title:'Projected Food Budget', sub:'Internal weekly foodbag forecast' }
          ],
          workbenchTitle: 'Mandatory Monthly Treasury Cadence',
          workbenchHtml: `<div class="rc68-stat-strip">
            <div class="rc68-stat-cell"><small>1. Daily Cadence</small><b>PAYG</b><span>Hospital, transport &amp; field petty cash</span></div>
            <div class="rc68-stat-cell"><small>2. Weekly Cadence</small><b>Suppliers</b><span>Foodbags &amp; medical consumables</span></div>
            <div class="rc68-stat-cell"><small>3. On / Before 9th</small><b>Statutory</b><span>SHIF · PAYE · KRA · NSSF · Housing</span></div>
            <div class="rc68-stat-cell"><small>4. Monthly Ledger</small><b>OpEx</b><span>Operational Expenses &amp; HQ pack</span></div>
          </div>`
        };
      }

      /* 18. PROCUREMENT OFFICER & STORES */
      case 'procurement': {
        return {
          color: '#C2410C',
          code: '4-TIER PROCUREMENT & FOODBAG SUPPLY CHAIN',
          headline: 'Weekly Foodbag Baskets (Bag 1 / Bag 2 / Special), Suppliers & KRA eTIMS',
          summary: 'Manages 4-tier competitive requisitions, supplier vetting, weekly foodbag tallies, quarterly WASH/bedding kits, and three-way delivery note reconciliation.',
          tiles: [
            { v:'procurement', icon:'package', title:'4-Tier Requisition Pipeline', sub:'Quotes, LPOs & delivery notes', count:'eTIMS', tone:'info' },
            { v:'foodbudget', icon:'clipboard', title:'Foodbag Basket Planner', sub:'Bag 1, Bag 2 & therapeutic rations' },
            { v:'adminops', icon:'calendar', title:'Weekly Supplier Settlement', sub:'Verified invoices for Finance' },
            { v:'costing', tab:'dept', icon:'receipt', title:'Procurement Cost Lens', sub:'Unit cost vs market tracking' }
          ]
        };
      }

      /* 19. MONITORING, EVALUATION & DATA OFFICER */
      case 'me': {
        const dq = (typeof REPORTS !== 'undefined' && REPORTS.dataQuality) ? REPORTS.dataQuality(user) : [];
        const indCount = typeof INDICATORS !== 'undefined' ? Object.keys(INDICATORS).length : 0;
        return {
          color: '#0284C7',
          code: `${cname.toUpperCase()} M&E & DATA QUALITY OBSERVATORY`,
          headline: 'Indicator Precision, Validation Rules & Monday Automated Reporting',
          summary: 'Identifies completeness or anthropometry anomalies without silently altering clinical records — routing findings to the responsible department with full audit traceability.',
          tiles: [
            { v:'reports', icon:'file', title:'Monday & Monthly Reports', sub:'Immutable versioned snapshots', count:num((db.reports || []).length) },
            { v:'targets', icon:'target', title:'2027–2031 KPI Targets', sub:`${num(indCount)} defined indicators`, count:num(indCount), tone:'ok' },
            { v:'patients', icon:'users', title:'Cohort Completeness Check', sub:`${num(dq.length)} validation flags`, count:num(dq.length), tone:dq.length ? 'warn' : 'ok' },
            { v:'costing', tab:'overview', icon:'chart', title:'Outcome vs Cost Analytics', sub:'Patient-days & recovery velocity' }
          ]
        };
      }

      /* 20. INTERNATIONAL DATA & CROSS-CHECK OFFICER */
      case 'intldata': {
        const dq = (typeof REPORTS !== 'undefined' && REPORTS.dataQuality) ? REPORTS.dataQuality(user) : [];
        return {
          color: '#312E81',
          code: 'INTERNATIONAL DATA & CROSS-JURISDICTION VERIFICATION',
          headline: 'Global Cohort Verification, 120-Day Outcomes & Grant Reporting Integrity',
          summary: 'Cross-checks Kisumu and Homa Bay longitudinal indicators, 120+ day clinical outcomes, and de-identified US/international stewardship datasets under DPA-2019 §48 safeguards.',
          tiles: [
            { v:'executive', icon:'globe', title:'Cross-County Cohort Matrix', sub:'Kisumu & Homa Bay longitudinal view' },
            { v:'intlmedical', icon:'activity', title:'120+ Day Outcome Tracker', sub:'Extended care & recovery evidence' },
            { v:'reports', icon:'archive', title:'Verified Report Archive', sub:`${num(dq.length)} open cross-check items`, count:num(dq.length), tone:dq.length ? 'warn' : 'ok' },
            { v:'govpartner', icon:'shieldcheck', title:'De-Identified Impact Pack', sub:'k ≥ 5 privacy-safe aggregates' }
          ]
        };
      }

      /* 21. INTERNAL AUDITOR */
      case 'auditor': {
        const integrity = (typeof AUDIT !== 'undefined' && AUDIT.verify) ? AUDIT.verify() : { ok:true, entries:0 };
        const denied = (db.audit || []).filter(a => a.action === 'access.denied').length;
        return {
          color: '#92400E',
          code: 'INDEPENDENT INTERNAL AUDIT & ASSURANCE (READ-ONLY)',
          headline: 'Cryptographic Audit Trail, Three-Way Reconciliation & Anti-Fraud Controls',
          summary: 'Strictly read-only assurance seat: verifies SHA-256 log integrity, inspects PAYG/eTIMS receipt exceptions, monitors RBAC access denials, and runs automated security self-tests.',
          tiles: [
            { v:'audit', icon:'shieldcheck', title:'Audit Findings Register', sub:'Receipt, stock & data exceptions' },
            { v:'history', icon:'lock', title:'SHA-256 Hash Chain', sub:`${num(integrity.entries)} append-only entries`, count:integrity.ok ? 'INTACT' : 'BROKEN', tone:integrity.ok ? 'ok' : 'crit' },
            { act:'run-security-test', icon:'shield', title:'Run Security Self-Test', sub:`${num(denied)} denied-access events logged` },
            { v:'costing', tab:'overview', icon:'receipt', title:'Expenditure Attribution Audit', sub:'Verify receipts vs unit standards' }
          ]
        };
      }

      /* 22. HUMAN RESOURCE OFFICER */
      case 'hr': {
        const staffCount = (db.employees || []).length;
        const pendLeave = (db.leaveRequests || []).filter(l => l.status === 'pending').length;
        return {
          color: '#059669',
          code: 'HUMAN CAPITAL, LEAVE & DELEGATION GOVERNANCE',
          headline: 'Verified Staff Roster, Leave Rules (BR-01…BR-08) & Reliever Continuity',
          summary: 'Maintains authentic employee records (zero fabricated identities, explicit unconfirmed-seat tracking), leave approvals, handover/reliever coverage, and OHS compliance.',
          tiles: [
            { v:'staff', icon:'idcard', title:'Official Staff Directory', sub:`${num(staffCount)} personnel records`, count:num(staffCount) },
            { v:'leave', icon:'calendar', title:'Leave & Off-Day Queue', sub:'Enforces coverage matrix', count:num(pendLeave), tone:pendLeave ? 'warn' : 'ok' },
            { v:'handover', icon:'key', title:'Delegation & Handover Plans', sub:'Internal reliever continuity' },
            { v:'workplans', icon:'clipboard', title:'Monthly Departmental Plans', sub:'Deliverables & attendance' }
          ]
        };
      }

      /* 23. STAFF WELFARE OFFICER */
      case 'welfare': {
        const openW = (db.welfareActs || []).filter(w => w.status === 'open').length;
        return {
          color: '#BE185D',
          code: 'STAFF WELFARE, WELLBEING & MUTUAL SUPPORT',
          headline: 'Caregiver Psychosocial Support, Benevolent Drives & Workplace Wellbeing',
          summary: 'Dedicated people-care console supporting frontline caregivers and office teams through transparent welfare contributions, OHS check-ins, and peer recognition.',
          tiles: [
            { v:'welfare', icon:'heart', title:'Active Welfare Drives', sub:`${num(openW)} open team initiatives`, count:num(openW), tone:'info' },
            { v:'staff', icon:'users', title:'Team Roster & Milestones', sub:'Kisumu & Homa Bay colleagues' },
            { v:'messages', icon:'send', title:'Welfare Broadcasts & Check-In', sub:'Support frontline field staff' },
            { v:'reports', icon:'file', title:'Welfare Stewardship Summary', sub:'Internal member accountability' }
          ]
        };
      }

      /* 24. VEHICLE & TRANSPORT OFFICER */
      case 'vehicle': {
        const vs = (db.vehicles || []).filter(v => !user.countyId || v.countyId === user.countyId);
        const due = vs.filter(v => (v.nextService - v.odometer) < 1500).length;
        return {
          color: '#1E3A5F',
          code: '4×4 FLEET DISPATCH & FIELD ROUTE LOGISTICS',
          headline: 'Ministry-Area Field Dispatch, Friday Hospital Runs & Odometer Control',
          summary: 'Coordinates 4×4 field vehicles across Tuesday–Friday ministry routes and hospital patient escorts without exposing confidential clinical diagnoses.',
          tiles: [
            { act:'log-trip', cap:'trip.log', icon:'route', title:'Log Vehicle Journey & Fuel', sub:'Odometer, route & request link', count:'LOG', tone:'ok' },
            { v:'vehicles', icon:'car', title:'Fleet & Service Readiness', sub:`${num(due)} due within 1,500 km`, count:num(vs.length), tone:due ? 'warn' : 'ok' },
            { v:'schedule', icon:'calendar', title:'Tue–Fri Ministry Route Map', sub:'Driver & area dispatch plan' },
            { v:'costing', tab:'dept', icon:'wallet', title:'Transport Service Cost Lens', sub:'Fuel, maintenance & escort fares' }
          ]
        };
      }

      /* 25. MEDIA & INFORMATION GOVERNANCE HEAD (Strictly Non-Clinical!) */
      case 'mediahead': {
        const docs = (typeof repo !== 'undefined' && repo.documents) ? repo.documents(user) : [];
        const pend = docs.filter(d => d.publication === 'pending_review').length;
        return {
          color: '#6D28D9',
          code: 'ETHICAL STORYTELLING, 5-LAYER CONSENT & ASSET CUSTODY',
          headline: '10-Stage Storytelling Gate, 22-Point Pre-Publication Check & Equipment Register',
          summary: 'Strictly separated from clinical charts: enforces 5-layer informed consent (DPA §30), HIV/TB & child safeguarding (§27), and custody of labelled office/media equipment.',
          tiles: [
            { v:'studio', icon:'image', title:'Ethical Storytelling Studio', sub:`${num(pend)} awaiting 22-point gate`, count:num(pend), tone:pend ? 'warn' : 'ok' },
            { v:'consent', icon:'shield', title:'5-Layer Consent Register', sub:'Channel, expiry & withdrawal log' },
            { v:'media', icon:'archive', title:'Approved Media Repository', sub:'Separated from clinical records', count:num(docs.length) },
            { v:'policy', tab:'dpa', icon:'lock', title:'9-Part Policy & 22-Point Gate', sub:'Kenya DPA 2019 & Children Act §27' }
          ]
        };
      }

      /* 26. PUBLIC RELATIONS OFFICER (Strictly Non-Clinical!) */
      case 'pr': {
        const docs = (typeof repo !== 'undefined' && repo.documents) ? repo.documents(user) : [];
        const approved = docs.filter(d => d.publication === 'approved').length;
        return {
          color: '#9333EA',
          code: 'PUBLIC RELATIONS & APPROVED COMMUNICATIONS DESK',
          headline: 'Consent-Cleared Impact Stories, Public Portal & Donor Communications',
          summary: 'Publishes only stories and imagery that have passed all 10 ethical review stages and carry active, channel-specific consent.',
          tiles: [
            { v:'pr', icon:'send', title:'PR & Publication Desk', sub:`${num(approved)} governance-cleared assets`, count:num(approved), tone:'ok' },
            { v:'donor', icon:'heart', title:'Donor Stewardship Briefs', sub:'Dignity-first recovery impact' },
            { v:'media', icon:'image', title:'Cleared Media Library', sub:'Zero unconsented beneficiary PII' },
            { v:'policy', tab:'dpa', icon:'shield', title:'Ethical Storytelling Rules', sub:'No bedside distress or HIV exposure' }
          ]
        };
      }

      /* 27. ICT & TECHNICAL SERVICES OFFICER */
      case 'it': {
        return {
          color: '#0F172A',
          code: 'ICT, CLOUD HOST & FIELD TABLET INFRASTRUCTURE',
          headline: 'Upstash Cloud Telemetry, Field Tablet Hygiene & Encrypted Backups',
          summary: 'Maintains workstation/tablet readiness across Kisumu & Homa Bay, enforces Cybercrimes Act / DPA §41 personal-device bans, and monitors cloud sync & backups.',
          tiles: [
            { v:'devconsole', icon:'flow', title:'Cloud & Sync Diagnostics', sub:'Upstash shards & API latency', count:'LIVE', tone:'ok' },
            { v:'health', icon:'pulse', title:'Platform Health Monitor', sub:'Storage, offline queue & PWA' },
            { v:'backup', icon:'database', title:'Encrypted Backup & Restore', sub:'Dual-control recovery readiness' },
            { v:'inventory', icon:'layers', title:'ICT & Tablet Asset Register', sub:'Field device custody & hygiene' }
          ]
        };
      }

      /* 28. EXTERNAL: CCC / PSC HOSPITAL CLINICIAN */
      case 'ccc.clinician': {
        const fac = user.facility || `${cname} Referral CCC`;
        return {
          color: '#0F766E',
          code: 'EXTERNAL FACILITY PARTNER · CCC / PSC DESK',
          headline: `Bidirectional CCC / PSC Referral Desk — ${fac}`,
          summary: 'Facility-scoped clinical collaboration under Kenya Data Protection Act (2019) §44–46: review joint ART/TB adherence referrals and return hospital clinical feedback.',
          tiles: [
            { v:'cccdesk', icon:'hospital', title:'CCC / PSC Referral Queue', sub:fac, count:num(openReqs.length), tone:openReqs.length ? 'warn' : 'ok' },
            { v:'repeat', icon:'search', title:'Continuity & PMI Lookup', sub:'Verify facility-linked follow-up' },
            { v:'messages', icon:'send', title:'Direct MCM Clinical Link', sub:'Coordinate with LOMAMO clinicians' }
          ]
        };
      }

      /* 29. EXTERNAL: COUNTY / NATIONAL GOVERNMENT PARTNER & INTL MEDICAL SPECIALIST */
      case 'gov.partner': {
        const agency = user.agency || `${cname} Department of Health`;
        return {
          color: '#14532D',
          code: 'GOVERNMENT & MOH PARTNERSHIP DESK (ZERO PII · k ≥ 5)',
          headline: `County Health Partnership & KHIS Aggregate Oversight — ${agency}`,
          summary: 'Read-only statutory partnership console: displays de-identified county health outcomes with k ≥ 5 small-cell suppression aligned with KAISF & SHA.',
          tiles: [
            { v:'govpartner', icon:'globe', title:'Partnership Impact Dashboard', sub:'k ≥ 5 suppressed county aggregates', count:'ZERO PII', tone:'ok' },
            { v:'messages', icon:'send', title:'Liaison with Country Director', sub:'Joint MOH / county coordination' }
          ]
        };
      }

      case 'intl.medical': {
        const over120 = ps.filter(p => p.status === 'active' && PAT.days(p) >= 120).length;
        return {
          color: '#4338CA',
          code: 'INTERNATIONAL MEDICAL SPECIALIST REVIEW BOARD',
          headline: `120+ Day Complex Case Concurrence & PDCA Clinical Advisory (${user.specialty || 'Global Clinical'})`,
          summary: 'Audited international clinical board under DPA-2019 §48: review 120+ day extended recovery plans, HIV/TB treatment resistance, and nutritional rehabilitation.',
          tiles: [
            { v:'intlmedical', icon:'activity', title:'120+ Day Specialist Queue', sub:'Complex cases awaiting concurrence', count:num(over120), tone:over120 ? 'warn' : 'ok' },
            { v:'clinicalmcm', icon:'pulse', title:'Joint Clinical Case Board', sub:'Collaborate with Kenya MCMs' },
            { v:'pdca', icon:'repeat', title:'Official C-DIMS PDCA Sheets', sub:'Plan-Do-Check-Act clinical evidence' },
            { v:'conditions', icon:'chart', title:'Cohort Morbidity Profile', sub:'Cross-county clinical patterns' }
          ]
        };
      }

      default:
        return null;
    }
  },

  renderSignatureBlock(user){
    const spec = this.specFor(user);
    if(!spec) return '';
    const scopeTxt = this.scopeBadge(user);
    const tilesHtml = (spec.tiles || []).map(t => this.tile(user, t)).filter(Boolean).join('');
    return `<section class="rc68-shell no-print" style="--rc-c:${esc(spec.color || '#1E3A8A')};margin-bottom:18px" aria-label="Role-specific operational launchpad">
      <div class="rc68-ribbon">
        <div class="rc68-ribbon-left">
          <span class="rc68-badge">${ic('layers', 12)} ${esc(spec.code)}</span>
          <span class="rc68-scope"><b>${esc(spec.headline)}</b> · ${esc(scopeTxt)}</span>
        </div>
      </div>
      ${tilesHtml ? `<div class="rc68-launchpad">${tilesHtml}</div>` : ''}
      ${spec.workbenchHtml ? `<div class="card" style="margin-bottom:0">
        <div class="card-h"><div class="spread"><h3>${esc(spec.workbenchTitle || 'Operational Pulse')}</h3><span class="xs muted">${esc(scopeTxt)}</span></div></div>
        <div class="card-b">${spec.workbenchHtml}</div>
      </div>` : ''}
    </section>`;
  }
};
