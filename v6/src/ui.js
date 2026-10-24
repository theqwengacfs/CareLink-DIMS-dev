/* ============================================================
   ui.js - Icons, components, navigation model, modal/toast system
   ============================================================ */

const ICONS = {
  home:'M3 10.5 12 3l9 7.5V21H3z', users:'M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9.5 7.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  alert:'M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  clipboard:'M9 2h6a1 1 0 0 1 1 1v2H8V3a1 1 0 0 1 1-1Zm7 3h2a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m1 8h6m-6 4h4',
  activity:'M22 12h-4l-3 9L9 3l-3 9H2', repeat:'M17 2l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3',
  hospital:'M12 7v6m-3-3h6M4 21V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14M2 21h20M9 21v-4h6v4',
  route:'M6 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 0h-6a4 4 0 0 0-4 4v2',
  receipt:'M6 2h12a1 1 0 0 1 1 1v18l-3-2-2 2-2-2-2 2-2-2-3 2V3a1 1 0 0 1 1-1Zm3 6h6M9 12h6m-6 4h3',
  file:'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6M9 13h6m-6 4h4',
  link:'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
  archive:'M21 8v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8M2 3h20v5H2zM10 12h4',
  target:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  wallet:'M20 12V8a2 2 0 0 0-2-2H5a2 2 0 0 1 0-4h13v4M2 6v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4M18 12h4v4h-4a2 2 0 0 1 0-4Z',
  layers:'M12 2 2 7l10 5 10-5-10-5ZM2 12l10 5 10-5M2 17l10 5 10-5',
  package:'M21 8v8l-9 5-9-5V8l9-5 9 5Zm0 0-9 5-9-5m9 5v8', image:'M3 3h18v18H3zM8.5 8.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM21 15l-5-5L5 21',
  shield:'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z', send:'M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z',
  book:'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z',
  idcard:'M3 5h18v14H3zM7 10a2 2 0 1 0 0-1 2 2 0 0 0 0 1Zm-1 6h2m1-3h5', calendar:'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  heart:'M20.8 5.6a5.5 5.5 0 0 0-7.8 0L12 6.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l8.8 8.8 8.8-8.8a5.5 5.5 0 0 0 0-7.8Z',
  car:'M5 17h14M5 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm18 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM3 17V9l2-5h14l2 5v8M3 9h18',
  shieldcheck:'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Zm-3-10 2 2 4-4', history:'M3 3v5h5M3.05 13A9 9 0 1 0 6 5.3L3 8M12 7v5l4 2',
  lock:'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4', userplus:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm10-4v6m-3-3h6',
  key:'M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8Zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3',
  building:'M3 21h18M5 21V5l7-3 7 3v16M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01',
  flow:'M5 3h6v6H5zM13 15h6v6h-6zM8 9v3a3 3 0 0 0 3 3h2M5 12h3',
  upload:'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  pulse:'M22 12h-4l-3 9L9 3l-3 9H2', database:'M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3Zm8-3v14c0 1.7-3.6 3-8 3s-8-1.3-8-3V5m16 7c0 1.7-3.6 3-8 3s-8-1.3-8-3',
  settings:'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
  chart:'M3 3v18h18M7 15l3-4 3 3 5-7', columns:'M4 20V10M10 20V4M16 20v-7M22 20H2',
  search:'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.3-4.3', bell:'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  plus:'M12 5v14M5 12h14', check:'M20 6 9 17l-5-5', x:'M18 6 6 18M6 6l12 12', chevron:'M9 18l6-6-6-6',
  menu:'M3 6h18M3 12h18M3 18h18', logout:'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  download:'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  filter:'M22 3H2l8 9.5V19l4 2v-8.5L22 3Z', eye:'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Zm11 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  sparkles:'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Zm7 9 .9 2.1L22 15l-2.1.9L19 18l-.9-2.1L16 15l2.1-.9L19 12Z',
  info:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-14h.01M11 12h1v5h1', clock:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-16v6l4 2',
  doc:'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z', refresh:'M21 2v6h-6M3 22v-6h6M3.5 9a9 9 0 0 1 14.9-4.4L21 7M20.5 15a9 9 0 0 1-14.9 4.4L3 17',
  building2:'M3 21h18M6 21V7l6-4 6 4v14M10 9h.01M10 13h.01M10 17h.01M14 9h.01M14 13h.01M14 17h.01',
  bed:'M3 18v-6a2 2 0 0 1 2-2h11a3 3 0 0 1 3 3v5M3 18h18M3 18v2m18-2v2M7 10V7a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v3',
  wifi:'M5 12.5a10 10 0 0 1 14 0M8.5 16a5.5 5.5 0 0 1 7 0M12 20h.01M2 9a15 15 0 0 1 20 0',
  save:'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2ZM7 3v6h9V3M8 14h8v7H8z',
  user:'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  home2:'M3 10.5 12 3l9 7.5V21H3z',
  palette:'M12 22a10 10 0 1 1 10-10c0 3-2 4.5-4.5 4.5H15a2 2 0 0 0-1.4 3.4 2 2 0 0 1-1.6 2.1ZM7 12h.01M9.5 7.5h.01M14.5 7.5h.01M17.5 11.5h.01',
  panel:'M3 4h18v16H3zM9 4v16',
  back:'M19 12H5M12 19l-7-7 7-7',
  forward:'M5 12h14M12 5l7 7-7 7',
  prev:'m15 18-6-6 6-6',
  next:'m9 18 6-6-6-6',
  sparkle:'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  sun:'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-15v2m0 18v-2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M2 12h2m18 0h-2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4'
};
function ic(name, size=18, cls=''){
  const p = ICONS[name]||ICONS.info;
  return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${p}"/></svg>`;
}

/* ---------------- Navigation model ---------------- */
function navModel(user){
  const has = c => RBAC.can(user,c).ok;
  const role = roleObj(user.roleId) || {};
  const isExternal = Boolean(role.external);
  const nonFieldRoles = ['mediahead','pr','finance','procurement','hr','welfare','vehicle','auditor','it','gov.partner','president'];
  const isFieldOrClinical = has('patient.list') && !nonFieldRoles.includes(user.roleId);
  const s = isFieldOrClinical ? repo.stats(user) : { pipeline:0, openConcerns:0, active:0 };
  const isStaffOps = has('hr.view') || has('welfare.view') || has('delegation.manage');
  const isAssuranceOps = has('audit.view') || has('system.audit') || has('indicator.manage') || has('dq.manage');
  const isSystemAdmin = has('user.view') || has('system.health') || has('user.approve') || has('system.config');
  const showDualCheck = typeof DUALCHECK !== 'undefined' && DUALCHECK.canAccess(user);
  const canMsg = has('message.use') && !((role.scope||{}).readOnly);
  const canSeeVisits = isFieldOrClinical && (has('visit.view')||has('visit.create')||has('patient.view.clinical')||['countyadmin','assistant','director','program.admin','depthead','me'].includes(user.roleId));
  const canSeePdca = isFieldOrClinical && (has('pdca.create')||has('pdca.review')||['countyadmin','assistant','director','program.admin','depthead','me'].includes(user.roleId));
  const canSeeBmi = isFieldOrClinical && (has('patient.view.clinical')||has('visit.create')||has('hosp.visit.record')||['coordinator','countyadmin','assistant','depthead','director','program.admin'].includes(user.roleId));
  const groups = [
    { label:'Overview', items:[
      { id:'home', label:'Console home', icon:'home', show:true },
      { id:'smartflow', label:'Smart workflow & QA', icon:'sparkles', show:true },
      { id:'monday', label:'Monday meeting', icon:'users', show:has('monday.meeting') },
      { id:'attention', label:'Requiring attention', icon:'alert', show:isFieldOrClinical && user.roleId!=='me' && user.roleId!=='chief', count:s.openConcerns, tone:'crit' },
      { id:'dualcheck', label:'Admin / Intl Co-Work Lock', icon:'shield', show:showDualCheck },
      { id:'messages', label:'Messages & chat', icon:'send', show:canMsg },
      { id:'drafts', label:'Workspace drafts', icon:'edit', show:true, count:typeof WORKSPACE_DRAFTS!=='undefined'?WORKSPACE_DRAFTS.countFor(user):0 },
      { id:'calendar', label:'Calendar', icon:'calendar', show:true },
      { id:'leave', label:'Leave & off-days', icon:'calendar', show:!isStaffOps && !isExternal },
      { id:'handover', label:'Delegation & handover', icon:'key', show:has('handover.use') && !isStaffOps && !isExternal },
      { id:'workplans', label:'Monthly work plans', icon:'clipboard', show:!isStaffOps && !isExternal && user.roleId!=='president' },
      { id:'settings', label:'Settings', icon:'settings', show:!isSystemAdmin }
    ]},
    { label:'Patients & field', show:isFieldOrClinical, items:[
      { id:'patients', label:'Patient register', icon:'users', show:isFieldOrClinical },
      { id:'pipeline', label:'Assessment pipeline', icon:'clipboard', show:has('patient.digitise'), count:s.pipeline },
      { id:'hardcopy', label:'Hard-copy intake & scans', icon:'upload', show:has('hardcopy.intake') },
      { id:'waiting', label:'Waiting list', icon:'clock', show:isFieldOrClinical&&has('waiting.view') },
      { id:'visits', label:'Visits & progress', icon:'activity', show:canSeeVisits },
      { id:'bmiboard', label:'BMI nutritional status', icon:'pulse', show:canSeeBmi },
      { id:'schedule', label:'Visit planning', icon:'route', show:has('visit.create')||has('pdca.create') },
      { id:'visitplan', label:'Visit order learner', icon:'sparkles', show:has('visit.create')||has('pdca.create') },
      { id:'forms', label:'Paper forms', icon:'clipboard', show:isFieldOrClinical&&has('form.view') },
      { id:'pdca', label:'PDCA follow-up', icon:'repeat', show:canSeePdca },
      { id:'households', label:'Households & care chains', icon:'users', show:isFieldOrClinical&&has('household.view') },
      { id:'repeat', label:'Returning patient check', icon:'search', show:has('pmi.check') && user.roleId!=='ccc.clinician' },
      { id:'programdays', label:'Programme days', icon:'clock', show:isFieldOrClinical }
    ]},
    { label:'Partner & referral', show:has('ccc.desk')||has('gov.oversight')||(isExternal&&has('pmi.check')), items:[
      { id:'cccdesk', label:'CCC / PSC referral desk', icon:'hospital', show:has('ccc.desk') },
      { id:'repeat', label:'Returning patient check', icon:'search', show:user.roleId==='ccc.clinician' && has('pmi.check') },
      { id:'govdashboard', label:'Government partnership', icon:'building2', show:has('gov.oversight') }
    ]},
    { label:'Ministry & teams', show:has('team.view'), items:[
      { id:'teams', label:'Ministry teams & visit days', icon:'route', show:has('team.view') }
    ]},
    { label:'Clinical & pharmacy', show:has('clinical.mcm')||has('pharmacy.view')||has('careplan.view')||has('intl.medical'), items:[
      { id:'clinicalmcm', label:'Case manager & clinical', icon:'activity', show:has('clinical.mcm') },
      { id:'intlmedical', label:'120+ day PDCA & intl review', icon:'pulse', show:has('intl.medical') },
      { id:'pharmacy', label:'Pharmacy', icon:'package', show:has('pharmacy.view') },
      { id:'tbcare', label:'TB dispensing control', icon:'shieldcheck', show:has('tb.view') },
      { id:'careplans', label:'Care plans', icon:'clipboard', show:has('careplan.view') }
    ]},
    { label:'Hospital operations', show:has('hosp.request.create')||has('hosp.request.review')||has('hosp.request.assign')||has('hosp.visit.record')||has('hosp.receipt.review'), items:[
      { id:'requests', label:'Hospital requests', icon:'hospital' },
      { id:'liaison', label:'Focal person assignments', icon:'route', show:has('hosp.visit.record') },
      { id:'recon', label:'Receipt reconciliation', icon:'receipt', show:has('hosp.receipt.review') },
      { id:'urgent', label:'Urgent cases vs budget', icon:'alert', show:has('urgent.view')&&(has('hosp.request.create')||has('hosp.request.review')||has('hosp.request.assign')||has('hosp.visit.record')||has('hosp.receipt.review')||has('finance.view')||has('procurement.view')||has('audit.view')) }
    ]},
    { label:'Care centre', show:has('care.view'), items:[
      { id:'care', label:'Occupancy & handover', icon:'bed' },
      { id:'care-incidents', label:'Safeguarding register', icon:'shield', show:has('care.incident') }
    ]},
    { label:'Reporting', items:[
      { id:'reports', label:'Report centre', icon:'file', show:has('report.patient_days')||has('report.patient_figures')||has('report.expenditure')||has('report.executive')||has('report.departmental') },
      { id:'referral', label:'Master Referral Document', icon:'link', show:has('report.referral') },
      { id:'archive', label:'Report archive', icon:'archive', show:has('report.patient_days')||has('report.patient_figures')||has('report.expenditure')||has('report.referral')||has('report.executive') },
      { id:'targets', label:'Targets & baselines', icon:'target',
        show:has('report.targets.view')||has('report.targets.manage')||(typeof ACCESS!=='undefined' && ACCESS.targetLevels(user).length>0) },
      { id:'conditions', label:'Condition register', icon:'clipboard', show:has('condition.aggregate')||has('condition.sensitive') },
      { id:'donor', label:'Donor summary', icon:'heart', show:has('report.executive')||has('report.patient_figures')||has('media.publish') },
      { id:'analytics', label:'Pivot tables & maps', icon:'chart', show:has('report.patient_days')||has('report.patient_figures')||has('report.executive')||has('report.departmental') }
    ]},
    { label:'Finance & procurement', show:has('finance.view')||has('procurement.view')||has('admin.ops'), items:[
      { id:'adminops', label:'Admin ops & 9th statutory', icon:'calendar', show:has('admin.ops')||has('finance.view') },
      { id:'finance', label:'Expenditure', icon:'wallet', show:has('finance.view') },
      { id:'costing', label:'Cost per patient', icon:'receipt', show:has('cost.view') },
      { id:'budget', label:'Budget lines', icon:'layers', show:has('finance.budget.manage') },
      { id:'procurement', label:'Procurement', icon:'package', show:has('procurement.view') },
      { id:'foodbudget', label:'Projected food & hygiene budget', icon:'clipboard', show:has('procurement.view')||has('finance.view') }
    ]},
    { label:'Media & governance', show:has('media.view')||has('pr.view'), items:[
      { id:'media', label:'Media library', icon:'image', show:has('media.view') },
      { id:'studio', label:'Media studio', icon:'send', show:has('media.view') },
      { id:'consent', label:'Consent register', icon:'shield', show:has('media.consent.manage') },
      { id:'publish', label:'Publication queue', icon:'send', show:has('media.publish') },
      { id:'policy', label:'Policy & knowledge', icon:'book', show:has('media.view') },
      { id:'pr', label:'Public relations', icon:'send', show:has('pr.view') }
    ]},
    { label:'People', show:isStaffOps, items:[
      { id:'staff', label:'Staff register', icon:'idcard', show:has('hr.view') },
      { id:'leave', label:'Leave & off-days', icon:'calendar', show:isStaffOps },
      { id:'handover', label:'Delegation & handover', icon:'key', show:isStaffOps && has('handover.use') },
      { id:'workplans', label:'Monthly work plans', icon:'clipboard', show:isStaffOps && user.roleId!=='president' },
      { id:'welfare', label:'Staff welfare', icon:'heart', show:has('welfare.view') },
      { id:'delegation', label:'Delegation', icon:'key', show:has('delegation.manage') }
    ]},
    { label:'Fleet & transport', show:has('vehicle.view'), items:[
      { id:'vehicles', label:'Vehicle register', icon:'car' },
      { id:'trips', label:'Trips & fuel', icon:'route' }
    ]},
    { label:'Assurance', show:isAssuranceOps, items:[
      { id:'audit', label:'Audit findings', icon:'shieldcheck', show:has('audit.view') },
      { id:'history', label:'Audit trail', icon:'history', show:has('system.audit') },
      { id:'security', label:'Security self-test', icon:'lock', show:has('audit.view')||has('system.audit') },
      { id:'accessaudit', label:'Access & authority audit', icon:'shield', show:has('audit.view')||has('role.manage')||has('system.config')||has('user.approve') },
      { id:'mergejournal', label:'Merge journal', icon:'layers', show:has('system.audit')||has('audit.view') },
      { id:'quality', label:'Data quality', icon:'check', show:has('patient.list')&&(has('dq.manage')||has('audit.view')||has('indicator.manage')) },
      { id:'indicators', label:'Data elements & indicators', icon:'chart',
        show:has('indicator.manage')||(has('audit.view')&&(has('report.patient_figures')||has('report.departmental')||has('report.executive'))) },
      { id:'interop', label:'KHIS, DHIS2 & APIs', icon:'flow',
        show:has('system.config')||has('indicator.manage') }
    ]},
    { label:'System', show:isSystemAdmin||has('dev.console'), items:[
      { id:'devconsole', label:'Development console', icon:'flow', show:has('dev.console') },
      { id:'users', label:'Users & accounts', icon:'userplus', show:has('user.view') },
      { id:'roles', label:'Roles & permissions', icon:'key', show:has('role.manage')||has('user.approve') },
      { id:'governance', label:'Credentials & recovery', icon:'lock', show:has('user.approve')||has('system.config') },
      { id:'org', label:'Organisation', icon:'building', show:has('org.manage') },
      { id:'registry', label:'Organisational registry', icon:'building2', show:has('org.manage')||has('user.view') },
      { id:'workflows', label:'Workflow config', icon:'flow', show:has('system.config') },
      { id:'import', label:'Master data import', icon:'upload', show:has('system.import') },
      { id:'mastermap', label:'Master registry mapping', icon:'columns', show:has('system.import') },
      { id:'masteranalysis', label:'Master workbook analysis', icon:'chart', show:has('system.import')||has('report.patient_figures')||has('report.executive')||has('audit.view') },
      { id:'health', label:'System health', icon:'pulse', show:has('system.health')||has('system.audit') },
      { id:'visualaudit', label:'Visual & accessibility audit', icon:'eye', show:has('system.config')||has('system.health') },
      { id:'backup', label:'Backup & restore', icon:'database', show:has('system.backup')||has('system.audit') },
      { id:'settings', label:'Settings', icon:'settings', show:isSystemAdmin }
    ]},
    { label:'Leadership', show:has('report.executive')||has('exec.agenda'), items:[
      { id:'executive', label:'Executive summary', icon:'chart', show:has('report.executive') },
      { id:'compare', label:'County comparison', icon:'columns', show:has('report.executive') },
      { id:'execconsole', label:'Executive console', icon:'archive', show:has('exec.agenda') }
    ]},
    { label:'Department life', show:has('library.read')||has('credit.view')||has('inventory.view')||has('intern.view')||has('ohs.view')||has('presence.view')||has('weather.view'), items:[
      { id:'library', label:'Department library', icon:'book', show:has('library.read') },
      { id:'recognition', label:'C-DIMS coins', icon:'sparkles', show:has('credit.view') },
      { id:'evaluation', label:'Staff evaluation', icon:'target', show:has('credit.manage')||has('hr.view')||has('report.executive') },
      { id:'inventory', label:'Office equipment', icon:'package', show:has('inventory.view')||has('inventory.manage') },
      { id:'interns', label:'Students & interns', icon:'users', show:has('intern.view')||has('intern.manage') },
      { id:'ohs', label:'Safety register', icon:'shield', show:has('ohs.view')||has('ohs.manage') },
      { id:'presence', label:'Who is online', icon:'wifi', show:has('presence.view') },
      { id:'weather', label:'Weather board', icon:'sun', show:has('weather.view') }
    ]}
  ];
  return groups
    .map(g=>({...g, items:g.items.filter(i=> (i.show!==undefined? i.show : g.show)!==false ).map(i=>({
      ...i,
      label: (typeof ROLE_CTX!=='undefined' && ROLE_CTX.navLabel)? ROLE_CTX.navLabel(user, i.id, i.label) : i.label
    }))}))
    .filter(g=>g.items.length);
}

/* ---------------- Small components ---------------- */
const badge = (txt, cls='b-neutral', dot=true)=>`<span class="badge ${cls}${dot?'':' nodot'}">${esc(txt)}</span>`;
const statusBadge = (kind, st)=>{ const c=WORKFLOW[kind]?.badge[st]||'b-neutral'; return badge(WORKFLOW[kind]?.labels[st]||titleCase(st), c); };
const pBadge = st => statusBadge('patient', st);
const rBadge = st => statusBadge('request', st);

function kpi(label, value, detail, tone='', icon=''){
  return `<div class="kpi ${tone}"><div class="k">${icon?ic(icon,13):''}${esc(label)}</div><div class="v">${value}</div>${detail?`<div class="d">${detail}</div>`:''}</div>`;
}
function card(title, body, opts={}){
  return `<section class="card ${opts.cls||''}">
    ${title?`<div class="card-h"><div><h3>${title}</h3>${opts.sub?`<div class="sub">${opts.sub}</div>`:''}</div>${opts.actions?`<div class="r">${opts.actions}</div>`:''}</div>`:''}
    <div class="card-b ${opts.tight?'tight':''}">${body}</div>
    ${opts.foot?`<div class="card-f">${opts.foot}</div>`:''}
  </section>`;
}
function pageHead(title, sub, actions=''){
  return `<div class="spread page-head" style="margin-bottom:18px;align-items:flex-start;flex-wrap:wrap;gap:12px">
    <div class="page-head-copy" style="min-width:220px;flex:1 1 280px"><h2 style="font-size:22px">${esc(title)}</h2><div class="muted small" style="margin-top:3px">${sub}</div></div>
    ${actions?`<div class="row page-head-actions" style="flex-wrap:wrap;gap:8px">${actions}</div>`:''}</div>`;
}
function emptyState(title, msg, icon='info', action=''){
  return `<div class="empty"><div class="ico">${ic(icon,24)}</div><h4>${esc(title)}</h4><p>${msg}</p>${action}</div>`;
}
function table(cols, rows, opts={}){
  if(!rows.length) return opts.empty || emptyState('No records', opts.emptyMsg||'Nothing matches the current filter.', 'file');
  const head = cols.map(c=>`<th class="${c.cls||''}" ${c.w?`style="width:${c.w}"`:''}>${c.label}</th>`).join('');
  const body = rows.map((r,i)=>{
    /* data-label lets a narrow screen turn each row into a small card rather
       than a table that has to be dragged sideways. */
    const tds = cols.map(c=>`<td class="${c.cls||''}" data-label="${esc(String(c.label||'').replace(/"/g,''))}">${typeof c.render==='function'? c.render(r,i): esc(r[c.key]??'')}</td>`).join('');
    return `<tr ${opts.rowAttr?opts.rowAttr(r):''}>${tds}</tr>`;
  }).join('');
  return `<div class="tbl-wrap"><table class="tbl ${opts.click?'click':''} ${opts.compact?'compact':''}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
function progressBar(value, max, tone=''){
  const p = clamp(Math.round((value/(max||1))*100),0,100);
  return `<div class="progress ${tone}"><i style="width:${p}%"></i></div>`;
}
function barChart(rows, {valueKey='value', labelKey='label', fmt=v=>num(v), max=null}={}){
  const m = max || Math.max(...rows.map(r=>r[valueKey]),1);
  return `<div class="bars">${rows.map(r=>`
    <div class="bar-row"><div class="lb" title="${esc(r[labelKey])}">${esc(r[labelKey])}</div>
    <div class="bar-track"><div class="bar-fill" style="width:${clamp((r[valueKey]/m)*100,1,100)}%"></div></div>
    <div class="vl">${fmt(r[valueKey])}</div></div>`).join('')}</div>`;
}
function donut(segments, size=132){
  const seg = (segments||[]).filter(s=>Number(s.value)>0);
  const total = seg.reduce((n,s)=>n+Number(s.value),0)||1;
  let a=0; const r=48, c=66, sw=20;
  const circ = 2*Math.PI*r;
  const gap = seg.length > 1 ? 1.8 : 0;
  const arcs = seg.map(s=>{
    const frac=Number(s.value)/total, dash=Math.max(0.5, frac*circ - gap), off=a*circ; a+=frac;
    return `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${sw}"
      stroke-dasharray="${dash.toFixed(2)} ${(circ-dash).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 ${c} ${c})"><title>${esc(s.label)}: ${num(s.value)} (${(frac*100).toFixed(1)}%)</title></circle>`;
  }).join('');
  return `<div class="donut-inline-clean" style="display:inline-flex;align-items:center;gap:12px">
    <svg width="${size}" height="${size}" viewBox="0 0 132 132" role="img" aria-label="Distribution total ${num(total)}">
      <circle cx="66" cy="66" r="48" fill="none" stroke="var(--line-2)" stroke-width="20"/>${arcs}
    </svg>
    <div><div class="xs muted" style="text-transform:uppercase;letter-spacing:.06em;font-weight:700">Total</div><div class="mono bold" style="font-size:18px;color:var(--ink)">${num(total)}</div></div>
  </div>`;
}
function legend(segments){
  return `<div class="legend">${segments.map(s=>`<div class="li"><span class="sw" style="background:${s.color}"></span>${esc(s.label)}<span class="n">${num(s.value)}</span></div>`).join('')}</div>`;
}
function avatarFor(name, color, photo){
  const fill = (typeof WTHEME!=='undefined')? WTHEME.safeFill(color||'#C8102E') : (color||'#C8102E');
  if(photo) return `<div class="avatar avatar-photo" style="background:${fill}"><img src="${photo}" alt=""></div>`;
  return `<div class="avatar" style="background:${fill}">${initials(name)}</div>`;
}
function note(text, icon='info'){
  return `<div class="note">${ic(icon,15)}<span>${text}</span></div>`;
}
function alertBox(kind, title, body){
  return `<div class="alert ${kind}">${ic(kind==='crit'?'alert':kind==='warn'?'alert':kind==='ok'?'check':'info',18)}<div><b>${esc(title)}</b>${body}</div></div>`;
}

/* ---------------- Modal & toast ---------------- */
let modalStack=[];
function openModal({title, sub='', body, footer='', wide=false, narrow=false, stack=false, onMount}){
  if(!stack && modalStack.length) closeAllModals();
  const back = document.createElement('div');
  back.className='modal-back';
  back.__initial = '';
  const formMatch = String(body||'').match(/data-form="([^"]+)"/);
  const autoFormId = formMatch ? formMatch[1] : '';
  let resolvedFooter = footer || '';
  if(autoFormId && resolvedFooter && !/save-form-draft|draft-save-close|submit-publication/.test(resolvedFooter)){
    resolvedFooter = resolvedFooter.replace(
      /(<button[^>]*data-act="(?:close-modal|modal-close)"[^>]*>[\s\S]*?<\/button>)/,
      `$1<button type="button" class="btn btn-ghost" data-act="draft-save-close" data-draftid="${esc(autoFormId)}">Save draft</button>`
    );
  }
  const hasSavedDraft = autoFormId && typeof loadDraft === 'function' && loadDraft(autoFormId);
  const restoredNote = hasSavedDraft
    ? `<div class="alert warn" style="margin-bottom:12px">${ic('save',16)}<div style="flex:1"><b>Saved draft restored</b><span class="small"> Automatically restored from this device. Review fields before submitting, or discard below.</span></div><button type="button" class="btn btn-xs btn-ghost" data-act="discard-draft" data-draftid="${esc(autoFormId)}">Discard draft</button></div>`
    : '';
  back.innerHTML = `<div class="modal ${wide?'wide':''} ${narrow?'narrow':''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-h"><div><h3>${esc(title)}</h3>${sub?`<div class="sub">${sub}</div>`:''}</div>
    <button type="button" class="x" data-act="close-modal" aria-label="Close">${ic('x',18)}</button></div>
    <div class="modal-b">${restoredNote}${body}</div>
    ${resolvedFooter?`<div class="modal-f">${resolvedFooter}</div>`:''}</div>`;
  document.body.appendChild(back);
  modalStack.push(back);
  if(hasSavedDraft && typeof applyDraft === 'function'){
    try{ applyDraft(autoFormId, back); }catch(e){}
  }
  back.addEventListener('mousedown', e=>{ if(e.target===back) closeModal(); });
  if(onMount) setTimeout(()=>onMount(back),0);
  const f = back.querySelector('input,select,textarea,button'); if(f) f.focus();
  setTimeout(()=>{ const b=back.querySelector('.modal-b'); back.__initial = b? b.innerHTML : ''; },0);
  return back;
}
/* True when the open form differs from the state it was opened in. */
function modalDirty(){
  const back = modalStack[modalStack.length-1];
  if(!back) return false;
  const b = back.querySelector('.modal-b') || back;
  if(!b) return false;
  if(back.__initial && b.innerHTML !== back.__initial) return true;
  const fields = [...b.querySelectorAll('input,select,textarea')];
  return fields.some(el=>{
    if(el.type==='checkbox'||el.type==='radio') return el.checked !== el.defaultChecked;
    return el.value !== el.defaultValue;
  });
}
function closeModal(force){
  const back = modalStack[modalStack.length-1];
  try{
    if(back && !force && modalDirty()){
      const uidPref = (DB.db && DB.db.personalPrefs && AUTH.user && DB.db.personalPrefs[AUTH.user.id]) || {};
      const mode = uidPref.cancelPolicy || (DB.db && DB.db.settings && DB.db.settings.cancelPolicy) || 'autosave';
      const formEl = back.querySelector('form[data-form]') || back.querySelector('form[id]') || back.querySelector('form');
      const htmlMatch = String(back.innerHTML || back._html || '').match(/data-form="([^"]+)"/);
      const fid = (formEl && formEl.dataset && (formEl.dataset.form || formEl.id)) || (htmlMatch ? htmlMatch[1] : '');
      if(mode === 'autodiscard'){
        if(fid && typeof clearDraft === 'function') clearDraft(fid);
        toast('Entry discarded', 'Cancelled and returned to your workspace.', 'info');
      } else if(fid && typeof saveDraft === 'function'){
        const saved = saveDraft(fid, formEl || back);
        if(saved) toast('Saved as draft', 'Stored on this device and returned to your workspace.', 'ok');
      }
    }
  }catch(e){
    /* Never trap the user inside an open sheet if draft serialization fails */
  }finally{
    closeAllModals();
  }
}
function closeAllModals(){
  while(modalStack.length){ const b=modalStack.pop(); if(b) try{ b.remove(); }catch(e){} }
  $$('.modal-back').forEach(b=>{ try{ b.remove(); }catch(e){} });
}
function toast(title, msg='', kind='ok'){
  let host = $('.toasts');
  if(!host){ host=document.createElement('div'); host.className='toasts'; document.body.appendChild(host); }
  const el = document.createElement('div');
  el.className='toast '+kind;
  el.innerHTML = `<div style="color:${kind==='err'?'var(--crit)':kind==='warn'?'#D28A00':'var(--ok)'}">${ic(kind==='err'?'alert':kind==='warn'?'alert':'check',18)}</div>
    <div><b>${esc(title)}</b>${msg?`<span>${msg}</span>`:''}</div>`;
  host.appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; el.style.transform='translateX(20px)'; el.style.transition='.25s'; setTimeout(()=>el.remove(),260); }, 4200);
}
function confirmDialog(title, msg, onYes, yesLabel='Confirm', danger=false){
  openModal({ title, narrow:true, stack:true, body:`<p style="color:var(--ink-2);font-size:13.6px">${msg}</p>`,
    footer:`<button type="button" class="btn btn-ghost" data-act="close-modal">Cancel</button>
      <button type="button" class="btn ${danger?'btn-danger':'btn-primary'}" data-act="confirm-yes">${esc(yesLabel)}</button>`});
  window.__confirmYes = ()=>{ closeAllModals(); onYes&&onYes(); };
}
