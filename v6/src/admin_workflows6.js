/* ============================================================
   admin_workflows6.js — Chief Program / Organization Admin (Kisumu
   Head Office) & Homa Bay County Admin Workflows Console (v6.4)
   ------------------------------------------------------------
   Covers:
   1. Daily & Weekly Cadence:
      - Patient expenses paid daily on Pay-As-You-Go (PAYG) mode
      - Supplier payments paid weekly
      - Staff transport paid daily
   2. Monthly Cadence:
      - 9th of every month government statutory deadline:
        SHIF, PAYE, KRA, NSSF
      - Monthly utilities & bills: water, garbage, electricity,
        rent, salaries
      - Operational Expenses (Admin's preferred umbrella category):
        * Operational wages (paid monthly)
        * Administrative wages (paid monthly)
        * Monthly financial reports (done monthly — Homa Bay reports
          for Kenya are prepared by Head Office Admin in Kisumu)
   3. Annual Cadence:
      - Annual budgeting (Kisumu Head Office & Homa Bay County)
      - Filing of Societies — annual renewal of licenses,
        certifications & government operational requirements
   ============================================================ */

const ADMIN_OPS_STATE = {
  tab: 'overview',
  countyFilter: 'all',
  monthFilter: new Date().toISOString().slice(0, 7)
};

/* Cohesive reporting variants for this user's operational presentation.
   Every palette preserves the same category mapping while changing presentation. */
const ADMIN_OPS_PALETTES = [
  { id:'sapphire', name:'Sapphire', colors:['#1E3A8A','#2563EB','#0F766E','#A16207','#166534','#6D28D9'] },
  { id:'lake', name:'Lake & sky', colors:['#115E59','#0891B2','#1D4ED8','#A16207','#15803D','#7C3AED'] },
  { id:'forest', name:'Forest', colors:['#14532D','#0E7490','#C2410C','#7C3AED','#A16207','#1E3A8A'] },
  { id:'earth', name:'Clay & slate', colors:['#7C2D12','#0F766E','#334155','#A16207','#6D28D9','#1D4ED8'] }
];

function adminOpsPaletteFor(user) {
  const prefs = DB.db && DB.db.personalPrefs && user && DB.db.personalPrefs[user.id];
  return ADMIN_OPS_PALETTES.find(p => p.id === (prefs && prefs.adminOpsPalette)) || ADMIN_OPS_PALETTES[0];
}

const ADMIN_OPS = {
  STATUTORY_BODIES: [
    { id: 'SHIF', name: 'SHIF (Social Health Insurance Fund)', authority: 'Social Health Authority (SHA)', rule: 'Due on or before 9th of every month' },
    { id: 'PAYE', name: 'PAYE (Pay As You Earn)', authority: 'Kenya Revenue Authority (iTax P10)', rule: 'Due on or before 9th of every month' },
    { id: 'KRA',  name: 'KRA Statutory & Withholding Obligations', authority: 'Kenya Revenue Authority (iTax)', rule: 'Due on or before 9th of every month' },
    { id: 'NSSF', name: 'NSSF (Tier I & Tier II Contributions)', authority: 'National Social Security Fund', rule: 'Due on or before 9th of every month' }
  ],

  UTILITY_TYPES: ['Water', 'Garbage', 'Electricity', 'Rent', 'Salaries'],

  OPEX_SUBTYPES: [
    { id: 'operational_wages', label: 'Operational wages (paid monthly)', desc: 'Monthly operational & field support duty wages under Operational Expenses' },
    { id: 'administrative_wages', label: 'Administrative wages (paid monthly)', desc: 'Monthly county & head office administrative coordination wages under Operational Expenses' },
    { id: 'financial_reports', label: 'Monthly financial reports (done monthly)', desc: 'Monthly financial report preparation & audit pack (Homa Bay reports for Kenya prepared by Kisumu Head Office Admin)' }
  ],

  canAccess(user) {
    return Boolean(user && (RBAC.has(user, 'admin.ops') || RBAC.has(user, 'finance.view') || RBAC.has(user, 'finance.budget.manage')));
  },

  canEdit(user) {
    if (!user) return false;
    const role = roleObj(user.roleId) || {};
    if ((role.scope || {}).readOnly) return false;
    return RBAC.has(user, 'admin.ops') || RBAC.has(user, 'finance.pay') || RBAC.has(user, 'finance.budget.manage');
  },

  /* Kisumu Head Office Admin, Chief Program Admin, Chief System Admin, Director & Finance
     hold authority to prepare/certify Homa Bay's monthly financial reports for Kenya. */
  canPrepareKenyaReport(user) {
    if (!user) return false;
    if (RBAC.has(user, 'admin.ops.kisumu_hq')) return true;
    return user.roleId === 'countyadmin' && user.countyId === 'kisumu';
  },

  isGlobalViewer(user) {
    if (!user) return false;
    return isGlobal(user) || this.canPrepareKenyaReport(user);
  },

  ensureCollections() {
    if (!DB.db) return;
    const cols = [
      'adminOpsPayg', 'adminOpsSuppliers', 'adminOpsTransport',
      'adminOpsStatutory', 'adminOpsUtilities', 'adminOpsOpEx',
      'adminOpsMonthlyReports', 'adminOpsAnnualBudgets', 'adminOpsSocieties'
    ];
    cols.forEach(c => { if (!Array.isArray(DB.db[c])) DB.db[c] = []; });

    const isDemo = Boolean(DB.db.meta && (DB.db.meta.demoSeeded || DB.db.meta.freshSeeded || /synthetic|demo/i.test(DB.db.meta.label || '')));
    if (isDemo && !DB.db.adminOpsPayg.length && !DB.db.adminOpsStatutory.length) {
      this.seedSynthetic(DB.db);
    }
  },

  seedSynthetic(db) {
    const today = todayISO().slice(0, 10);
    const ym = today.slice(0, 7);
    const yr = today.slice(0, 4);
    const pKsm = (db.patients || []).find(p => p.countyId === 'kisumu');
    const pHby = (db.patients || []).find(p => p.countyId === 'homabay');

    db.adminOpsPayg = [
      { id: 'payg-01', ref: 'PAYG-KSM-101', date: today, countyId: 'kisumu', areaId: pKsm?.areaId || 'nyalenda', patientId: pKsm?.id || '', patientLabel: pKsm?.name || 'Synthetic Beneficiary KSM-01', category: 'Outpatient Lab & Emergency Meds', mode: 'Pay-As-You-Go (Daily)', paymentRef: 'MPESA-SYN-88210', amount: 2450, status: 'paid', demo: true },
      { id: 'payg-02', ref: 'PAYG-KSM-102', date: today, countyId: 'kisumu', areaId: 'manyatta', patientId: '', patientLabel: 'Synthetic Beneficiary KSM-02', category: 'Direct Nutritional & Urgent Care', mode: 'Pay-As-You-Go (Daily)', paymentRef: 'MPESA-SYN-88214', amount: 1850, status: 'paid', demo: true },
      { id: 'payg-03', ref: 'PAYG-HBY-201', date: today, countyId: 'homabay', areaId: pHby?.areaId || 'makongeni', patientId: pHby?.id || '', patientLabel: pHby?.name || 'Synthetic Beneficiary HBY-01', category: 'Hospital Clinic Review & Prescription', mode: 'Pay-As-You-Go (Daily)', paymentRef: 'MPESA-SYN-88219', amount: 2100, status: 'paid', demo: true }
    ];

    db.adminOpsTransport = [
      { id: 'stpt-01', ref: 'TPT-D-401', date: today, countyId: 'kisumu', areaId: 'nyalenda', staffName: 'Field Care Team · Nyalenda (Synthetic)', route: 'Kisumu Office -> Nyalenda -> JOOTRH', mode: 'Daily Staff Transport', paymentRef: 'MPESA-SYN-77101', amount: 950, status: 'paid', demo: true },
      { id: 'stpt-02', ref: 'TPT-D-402', date: today, countyId: 'kisumu', areaId: 'ahero', staffName: 'Field Care Team · Ahero (Synthetic)', route: 'Kisumu Office -> Ahero Households', mode: 'Daily Staff Transport', paymentRef: 'MPESA-SYN-77102', amount: 1400, status: 'paid', demo: true },
      { id: 'stpt-03', ref: 'TPT-D-501', date: today, countyId: 'homabay', areaId: 'makongeni', staffName: 'Field Care Team · Makongeni (Synthetic)', route: 'Homa Bay Office -> Makongeni -> County Referral', mode: 'Daily Staff Transport', paymentRef: 'MPESA-SYN-77109', amount: 850, status: 'paid', demo: true }
    ];

    db.adminOpsSuppliers = [
      { id: 'sup-w-01', ref: 'SUP-WK-301', date: today, weekLabel: 'Weekly Run · Current Week', countyId: 'kisumu', supplier: 'Synthetic Bulk Foodbag Supplier (KSM)', category: 'Foodbags & Dry Rations (BG1/BG2/SPB)', invoiceNo: 'INV-SYN-2041', amount: 148000, status: 'paid', demo: true },
      { id: 'sup-w-02', ref: 'SUP-WK-302', date: today, weekLabel: 'Weekly Run · Current Week', countyId: 'kisumu', supplier: 'Synthetic Essential Medical Wholesale', category: 'Formulary & Dressing Supplies', invoiceNo: 'INV-SYN-2048', amount: 64500, status: 'scheduled', demo: true },
      { id: 'sup-w-03', ref: 'SUP-WK-303', date: today, weekLabel: 'Weekly Run · Current Week', countyId: 'homabay', supplier: 'Synthetic Lake Region Provisions (HBY)', category: 'Foodbags & Hygiene Kits', invoiceNo: 'INV-SYN-2052', amount: 58000, status: 'paid', demo: true }
    ];

    db.adminOpsStatutory = [
      { id: 'stat-01', period: ym, dueDate: `${ym}-09`, body: 'SHIF', countyId: 'kisumu', slipRef: 'SHA-SYN-90012', amount: 42800, paidDate: `${ym}-07`, status: 'paid', note: 'Remitted before 9th statutory deadline', demo: true },
      { id: 'stat-02', period: ym, dueDate: `${ym}-09`, body: 'PAYE', countyId: 'kisumu', slipRef: 'ITAX-P10-SYN-11', amount: 86400, paidDate: `${ym}-08`, status: 'paid', note: 'KRA P10 filed & paid before 9th', demo: true },
      { id: 'stat-03', period: ym, dueDate: `${ym}-09`, body: 'KRA',  countyId: 'kisumu', slipRef: 'ITAX-WHT-SYN-14', amount: 18500, paidDate: '', status: 'pending', note: 'Awaiting iTax payment slip confirmation by 9th', demo: true },
      { id: 'stat-04', period: ym, dueDate: `${ym}-09`, body: 'NSSF', countyId: 'kisumu', slipRef: 'NSSF-T12-SYN-09', amount: 38400, paidDate: `${ym}-07`, status: 'paid', note: 'Tier I & II schedule remitted before 9th', demo: true }
    ];

    db.adminOpsUtilities = [
      { id: 'util-01', period: ym, countyId: 'kisumu', utilityType: 'Water', payee: 'KIWASCO (Synthetic)', ref: 'UTIL-W-01', amount: 6800, status: 'paid', demo: true },
      { id: 'util-02', period: ym, countyId: 'kisumu', utilityType: 'Garbage', payee: 'Municipal Waste Collection (Synthetic)', ref: 'UTIL-G-01', amount: 3500, status: 'paid', demo: true },
      { id: 'util-03', period: ym, countyId: 'kisumu', utilityType: 'Electricity', payee: 'KPLC Token / Postpaid (Synthetic)', ref: 'UTIL-E-01', amount: 14200, status: 'paid', demo: true },
      { id: 'util-04', period: ym, countyId: 'kisumu', utilityType: 'Rent', payee: 'Kisumu Office & Care Centre Lease (Synthetic)', ref: 'UTIL-R-01', amount: 85000, status: 'paid', demo: true },
      { id: 'util-05', period: ym, countyId: 'kisumu', utilityType: 'Salaries', payee: 'Monthly Core Payroll Batch (Synthetic)', ref: 'PAY-M-01', amount: 420000, status: 'paid', demo: true },
      { id: 'util-06', period: ym, countyId: 'homabay', utilityType: 'Rent', payee: 'Homa Bay County Office Lease (Synthetic)', ref: 'UTIL-R-HB1', amount: 38000, status: 'paid', demo: true },
      { id: 'util-07', period: ym, countyId: 'homabay', utilityType: 'Water', payee: 'HOMAWASCO & Electricity Combined (Synthetic)', ref: 'UTIL-WE-HB1', amount: 7400, status: 'scheduled', demo: true }
    ];

    db.adminOpsOpEx = [
      { id: 'opex-01', period: ym, countyId: 'kisumu', subType: 'operational_wages', title: 'Monthly Operational Wages — Kisumu Field & Care Support', ref: 'OPEX-OW-KSM', amount: 164000, status: 'paid', preparedBy: 'Kisumu Head Office Admin', demo: true },
      { id: 'opex-02', period: ym, countyId: 'kisumu', subType: 'administrative_wages', title: 'Monthly Administrative Wages — Kisumu Head Office', ref: 'OPEX-AW-KSM', amount: 112000, status: 'paid', preparedBy: 'Kisumu Head Office Admin', demo: true },
      { id: 'opex-03', period: ym, countyId: 'homabay', subType: 'operational_wages', title: 'Monthly Operational Wages — Homa Bay Field Support', ref: 'OPEX-OW-HBY', amount: 78000, status: 'paid', preparedBy: 'Homa Bay County Admin', demo: true },
      { id: 'opex-04', period: ym, countyId: 'homabay', subType: 'administrative_wages', title: 'Monthly Administrative Wages — Homa Bay Office', ref: 'OPEX-AW-HBY', amount: 54000, status: 'paid', preparedBy: 'Homa Bay County Admin', demo: true },
      { id: 'opex-05', period: ym, countyId: 'kisumu', subType: 'financial_reports', title: 'Monthly Financial Report Preparation & Reconciliation Pack (Kenya HQ)', ref: 'OPEX-FR-KE', amount: 15000, status: 'paid', preparedBy: 'Kisumu Head Office Admin', demo: true }
    ];

    db.adminOpsMonthlyReports = [
      { id: 'mfr-ksm', period: ym, targetCountyId: 'kisumu', reportTitle: 'Kisumu Head Office Monthly Financial Report (Kenya)', preparedByOffice: 'Kisumu Head Office Admin', sourcePackStatus: 'verified', reportStatus: 'certified', totalOpEx: 291000, totalDisbursed: 1105600, updatedAt: todayISO(), note: 'Prepared and reconciled at Head Office in Kisumu.', demo: true },
      { id: 'mfr-hby', period: ym, targetCountyId: 'homabay', reportTitle: 'Homa Bay County Monthly Financial Report for Kenya', preparedByOffice: 'Kisumu Head Office Admin', sourcePackStatus: 'submitted_to_kisumu', reportStatus: 'in_preparation_kisumu', totalOpEx: 132000, totalDisbursed: 238350, updatedAt: todayISO(), note: 'Per LOMAMO governance: Homa Bay reports for Kenya are prepared by Head Office Admin in Kisumu from Homa Bay verified schedules.', demo: true }
    ];

    db.adminOpsAnnualBudgets = [
      { id: 'ab-01', fiscalYear: yr, countyId: 'kisumu', category: 'Daily Patient Pay-As-You-Go (PAYG)', annualAmount: 1850000, ytdActual: 1140000, owner: 'Kisumu Head Office Admin', demo: true },
      { id: 'ab-02', fiscalYear: yr, countyId: 'kisumu', category: 'Weekly Supplier Payments (Foodbags & Medical)', annualAmount: 8400000, ytdActual: 6120000, owner: 'Kisumu Head Office Admin', demo: true },
      { id: 'ab-03', fiscalYear: yr, countyId: 'kisumu', category: 'Daily Staff Transport', annualAmount: 1320000, ytdActual: 940000, owner: 'Kisumu Head Office Admin', demo: true },
      { id: 'ab-04', fiscalYear: yr, countyId: 'kisumu', category: '9th Monthly Statutory (SHIF, PAYE, KRA, NSSF)', annualAmount: 2240000, ytdActual: 1680000, owner: 'Kisumu Head Office Admin', demo: true },
      { id: 'ab-05', fiscalYear: yr, countyId: 'kisumu', category: 'Monthly Utilities, Rent & Salaries', annualAmount: 6360000, ytdActual: 4770000, owner: 'Kisumu Head Office Admin', demo: true },
      { id: 'ab-06', fiscalYear: yr, countyId: 'kisumu', category: 'Operational Expenses (Operational Wages, Admin Wages & Monthly Financial Reports)', annualAmount: 3492000, ytdActual: 2619000, owner: 'Kisumu Head Office Admin', demo: true },
      { id: 'ab-07', fiscalYear: yr, countyId: 'homabay', category: 'Homa Bay Consolidated Programme & Operational Expenses', annualAmount: 4280000, ytdActual: 2985000, owner: 'Homa Bay County Admin / Kisumu HQ', demo: true }
    ];

    db.adminOpsSocieties = [
      { id: 'soc-01', filingType: 'Filing of Societies — Annual Returns', authority: 'Office of the Registrar of Societies (Kenya)', refNo: 'SOC-RET-SYN-2026', countyId: 'kisumu', dueDate: `${yr}-12-15`, renewedDate: `${yr}-03-18`, status: 'compliant', leadOffice: 'Kisumu Head Office Admin', demo: true },
      { id: 'soc-02', filingType: 'County Operational & Single Business Permit (Kisumu)', authority: 'County Government of Kisumu', refNo: 'KSM-SBP-SYN-2026', countyId: 'kisumu', dueDate: `${yr}-12-31`, renewedDate: `${yr}-01-22`, status: 'compliant', leadOffice: 'Kisumu Head Office Admin', demo: true },
      { id: 'soc-03', filingType: 'County Operational & Single Business Permit (Homa Bay)', authority: 'County Government of Homa Bay', refNo: 'HBY-SBP-SYN-2026', countyId: 'homabay', dueDate: `${yr}-12-31`, renewedDate: `${yr}-01-29`, status: 'compliant', leadOffice: 'Homa Bay County Admin', demo: true },
      { id: 'soc-04', filingType: 'KRA Tax Compliance Certificate (TCC) Annual Renewal', authority: 'Kenya Revenue Authority (iTax)', refNo: 'KRA-TCC-SYN-2026', countyId: 'kisumu', dueDate: `${yr}-11-30`, renewedDate: '', status: 'due_soon', leadOffice: 'Kisumu Head Office Admin', demo: true },
      { id: 'soc-05', filingType: 'Data Controller / Processor Annual Certification', authority: 'Office of the Data Protection Commissioner (ODPC)', refNo: 'ODPC-SYN-2026', countyId: 'kisumu', dueDate: `${Number(yr)+1}-02-28`, renewedDate: `${yr}-02-20`, status: 'compliant', leadOffice: 'Chief System & Program Admin', demo: true },
      { id: 'soc-06', filingType: 'Public Health, Care Centre & Fire Safety Clearance', authority: 'County Public Health & Fire Inspectorate', refNo: 'PHF-SYN-2026', countyId: 'kisumu', dueDate: `${yr}-12-31`, renewedDate: `${yr}-02-05`, status: 'compliant', leadOffice: 'Kisumu Head Office Admin', demo: true }
    ];
  },

  scopedList(user, colName) {
    this.ensureCollections();
    const list = DB.db[colName] || [];
    const globalView = this.isGlobalViewer(user);
    const cf = ADMIN_OPS_STATE.countyFilter;
    return list.filter(item => {
      if (!globalView && item.countyId && item.countyId !== user.countyId) return false;
      if (globalView && cf && cf !== 'all' && (item.countyId || item.targetCountyId) && (item.countyId || item.targetCountyId) !== cf) return false;
      return true;
    });
  },

  statutoryCountdown() {
    const now = new Date();
    const day = now.getDate();
    if (day < 9) return { state: 'upcoming', daysLeft: 9 - day, label: `${9 - day} day${9 - day === 1 ? '' : 's'} to 9th Statutory Deadline` };
    if (day === 9) return { state: 'today', daysLeft: 0, label: 'TODAY (9th) is the Government Statutory Deadline!' };
    return { state: 'passed', daysLeft: 0, label: `9th Statutory Deadline passed (${day}th of month) — verify all SHIF, PAYE, KRA & NSSF slips` };
  },

  render(user, params = {}) {
    if (!this.canAccess(user)) return deniedPanel('admin.ops');
    this.ensureCollections();
    if (params.tab) ADMIN_OPS_STATE.tab = params.tab;
    if (params.county) ADMIN_OPS_STATE.countyFilter = params.county;
    if (params.viewMode) {
      APPX.chartViewMode = params.viewMode;
      if (typeof COST_STATE !== 'undefined') COST_STATE.viewMode = params.viewMode;
    }

    const tab = ADMIN_OPS_STATE.tab;
    const canEdit = this.canEdit(user);
    const canKenyaHQ = this.canPrepareKenyaReport(user);
    const globalView = this.isGlobalViewer(user);
    const tblMode = (typeof isChartTableMode === 'function' && isChartTableMode());
    const activePalette = adminOpsPaletteFor(user);
    const paletteVars = activePalette.colors.map((color, i) => `--aops-c${i + 1}:${color}`).join(';');
    const palettePicker = `<div class="aops-palette-picker" role="group" aria-label="Operational display colour palette">
      <span class="aops-palette-caption">Data colours</span>
      ${ADMIN_OPS_PALETTES.map(p => `<button type="button" class="aops-palette-choice ${p.id === activePalette.id ? 'is-active' : ''}" data-act="adminops-palette" data-palette="${p.id}" aria-label="Use ${esc(p.name)} palette" aria-pressed="${p.id === activePalette.id}" title="${esc(p.name)}">
        <span class="aops-palette-swatch" aria-hidden="true">${p.colors.map(c => `<i style="--swatch:${c}"></i>`).join('')}</span><span>${esc(p.name)}</span>
      </button>`).join('')}
    </div>`;

    const payg = this.scopedList(user, 'adminOpsPayg');
    const suppliers = this.scopedList(user, 'adminOpsSuppliers');
    const transport = this.scopedList(user, 'adminOpsTransport');
    const statutory = this.scopedList(user, 'adminOpsStatutory');
    const utilities = this.scopedList(user, 'adminOpsUtilities');
    const opex = this.scopedList(user, 'adminOpsOpEx');
    const mReports = this.scopedList(user, 'adminOpsMonthlyReports');
    const annualBudgets = this.scopedList(user, 'adminOpsAnnualBudgets');
    const societies = this.scopedList(user, 'adminOpsSocieties');

    const sumAmt = (arr, k = 'amount') => arr.reduce((n, x) => n + (Number(x[k]) || 0), 0);
    const totPayg = sumAmt(payg);
    const totTransport = sumAmt(transport);
    const totSuppliers = sumAmt(suppliers);
    const totStat = sumAmt(statutory);
    const totUtil = sumAmt(utilities);
    const totOpEx = sumAmt(opex);

    const pendingStat = statutory.filter(s => s.status !== 'paid');
    const cd = this.statutoryCountdown();
    const mixSegments = [
      { label:'Daily patient Pay-As-You-Go', short:'Patient support', value:totPayg, budget:Math.max(totPayg * 1.18, 85000), color:activePalette.colors[0], tab:'daily_weekly' },
      { label:'Daily staff transport', short:'Staff transport', value:totTransport, budget:Math.max(totTransport * 1.15, 65000), color:activePalette.colors[1], tab:'daily_weekly' },
      { label:'Weekly supplier payments', short:'Supplier settlements', value:totSuppliers, budget:Math.max(totSuppliers * 1.12, 240000), color:activePalette.colors[2], tab:'daily_weekly' },
      { label:'9th statutory remittances', short:'Statutory', value:totStat, budget:Math.max(totStat * 1.05, 195000), color:activePalette.colors[3], tab:'monthly_stat' },
      { label:'Monthly utilities, rent & salaries', short:'Utilities & bills', value:totUtil, budget:Math.max(totUtil * 1.08, 420000), color:activePalette.colors[4], tab:'monthly_stat' },
      { label:'Operational Expenses', short:'OpEx & reports', value:totOpEx, budget:Math.max(totOpEx * 1.10, 310000), color:activePalette.colors[5], tab:'opex_reports' }
    ];
    const totalIndicativeEnvelope = mixSegments.reduce((n, m) => n + m.budget, 0);
    const totalSpent = mixSegments.reduce((n, m) => n + m.value, 0);
    const scheduledPayments = suppliers.filter(x => x.status !== 'paid').length +
      transport.filter(x => x.status !== 'paid').length + payg.filter(x => x.status !== 'paid').length;

    const headerActions = `<div class="aops-commandbar">
      <div class="aops-scope-control">
        ${globalView ? `<label class="aops-scope-label" for="adminopsOffice">Office scope</label><select class="input aops-office-select" id="adminopsOffice" aria-label="Filter county office" onchange="ACTIONS['adminops-county']({county:this.value})">
          <option value="all" ${ADMIN_OPS_STATE.countyFilter === 'all' ? 'selected' : ''}>Kisumu HQ & Homa Bay</option>
          ${COUNTIES.map(c => `<option value="${esc(c.id)}" ${ADMIN_OPS_STATE.countyFilter === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>` : `<span class="aops-office-static">${esc(countyName(user.countyId))} office</span>`}
      </div>
      ${palettePicker}
      <div class="aops-command-actions">
        <button class="btn btn-sm ${tblMode ? 'btn-primary' : 'btn-ghost'}" data-act="toggle-chart-table-mode" title="${tblMode ? 'Show charts and tables' : 'Show tables only'}">${ic('columns', 14)} ${tblMode ? 'Charts & tables' : 'Tables only'}</button>
        ${canEdit ? `<button class="btn btn-sm btn-primary" data-act="adminops-modal" data-kind="payg">${ic('plus', 14)} Record expense</button>` : ''}
      </div>
    </div>`;

    const statutoryBanner = `<div class="aops-deadline ${pendingStat.length ? 'is-pending' : 'is-clear'}" role="status">
      <div class="aops-deadline-icon">${ic(pendingStat.length ? 'alert' : 'check', 18)}</div>
      <div class="aops-deadline-copy"><span class="aops-eyebrow">Statutory compliance · 9th of each month</span>
        <b>${esc(cd.label)}</b>
        <p>${pendingStat.length ? `${pendingStat.length} obligation(s) awaiting remittance-slip confirmation.` : 'All scoped SHIF, PAYE, KRA and NSSF remittances are recorded with slip references.'} Homa Bay reports for Kenya are prepared by Kisumu Head Office Admin.</p>
      </div>
      <button class="btn btn-sm" data-act="adminops-tab" data-tab="monthly_stat">Open statutory register ${ic('arrowright', 14)}</button>
    </div>`;

    const kpiItems = [
      { label:'Recorded outflow', value:money(totalSpent), detail:`Across ${num(payg.length + transport.length + suppliers.length + statutory.length + utilities.length + opex.length)} records`, color:'--aops-c1', tab:'overview' },
      { label:'Indicative category envelope', value:money(totalIndicativeEnvelope), detail:`${pct(totalSpent, totalIndicativeEnvelope)}% vs indicative baseline`, color:'--aops-c2', tab:'overview' },
      { label:'Statutory obligations', value:`${num(pendingStat.length)} open`, detail:pendingStat.length ? 'Across scoped register' : 'No open items in scoped register', color:'--aops-c4', tab:'monthly_stat' },
      { label:'Payments to reconcile', value:num(scheduledPayments), detail:'Scheduled / unpaid transactions', color:'--aops-c3', tab:'daily_weekly' }
    ];
    const kpiRow = `<div class="aops-summary-grid" aria-label="Scoped operations summary">
      ${kpiItems.map((m, i) => `<button type="button" class="aops-summary-card" data-act="adminops-tab" data-tab="${m.tab}" style="--metric-color:var(${m.color})">
        <span class="aops-summary-top"><i>${String(i + 1).padStart(2,'0')}</i><span>${esc(m.label)}</span></span>
        <strong>${esc(String(m.value))}</strong><small>${esc(m.detail)}</small>
      </button>`).join('')}
    </div>`;

    const navLabels = [
      ['overview','Position','Budget & compliance'],
      ['daily_weekly','Daily & weekly','PAYG · transport · suppliers'],
      ['monthly_stat','Statutory & bills','SHIF · PAYE · KRA · NSSF'],
      ['opex_reports','Operational Expenses','Wages · reports · Kenya'],
      ['annual','Annual governance','Budgets · societies']
    ];
    const tabNav = `<nav class="aops-section-nav" role="tablist" aria-label="Administration work areas">
      ${navLabels.map(([id, label, hint], i) => `<button type="button" id="aops-tab-${id}" class="aops-section-tab ${tab === id ? 'is-current' : ''}" role="tab" aria-controls="aopsPanel" aria-selected="${tab === id}" data-act="adminops-tab" data-tab="${id}">
        <span class="aops-section-index">0${i + 1}</span><span class="aops-section-label">${esc(label)}</span><span class="aops-section-hint">${esc(hint)}</span>
      </button>`).join('')}
    </nav>`;

    let body = '';

    if (tab === 'overview') {
      body = (typeof budgetVsActualBoard === 'function' ? `<div class="aops-budget-board">${card('Indicative monthly category envelope',
        budgetVsActualBoard(mixSegments.map(m => ({ label: m.label, budget: Math.round(m.budget), spent: Math.round(m.value), color: m.color })), {
          periodLabel: 'Illustrative category baseline', budgetLabel: 'INDICATIVE ESTIMATE',
          comparisonLabel: 'Recorded outflow vs indicative category estimates',
          budgetColumnLabel: 'Indicative estimate', totalLabel: 'Total indicative estimate'
        }), { sub: 'Outflow aggregates the scoped register and is not period-filtered. Baselines are illustrative—not approved appropriations; confirm ceilings against the approved budget. Zero-activity categories remain visible for planning.' })}</div>` : '')
      + `<div class="aops-analysis-grid">
        ${card('Disbursement composition', chartDonut(mixSegments, {
          title: 'Disbursements by operational category',
          fmt: v => money(v),
          centerLabel: 'RECORDED OUTFLOW',
          centerValue: money(totalSpent)
        }), { sub: totalSpent ? 'Share of recorded spend by operational category.' : 'No outflow is recorded yet. Budget envelopes above remain visible for planning.' })}
        ${card('Category comparison', chartRows({
          rows: mixSegments,
          colours: mixSegments.map(m => m.color),
          fmt: v => money(v),
          title: 'Expenditure by administrative category',
          labelHead: 'Operational category',
          valueHead: 'Amount (KES)'
        }), { sub: 'Category colours remain consistent across views; select a palette above for presentation.' })}
      </div>`
      + `<div class="grid g3">
        ${card('Daily & Weekly Operations', `<div class="dl">
          <dt>Patient expenses (PAYG)</dt><dd class="mono"><b>Paid Daily</b> (${num(payg.length)} entries)</dd>
          <dt>Staff transport</dt><dd class="mono"><b>Paid Daily</b> (${num(transport.length)} entries)</dd>
          <dt>Supplier payments</dt><dd class="mono"><b>Paid Weekly</b> (${num(suppliers.length)} batches)</dd>
        </div>
        <div style="margin-top:12px"><button class="btn btn-xs btn-primary" data-act="adminops-tab" data-tab="daily_weekly">Manage Daily & Weekly &rarr;</button></div>`)}
        ${card('Monthly Statutory & Operational Expenses', `<div class="dl">
          <dt>9th Statutory Deadline</dt><dd><b>SHIF · PAYE · KRA · NSSF</b></dd>
          <dt>Utilities & Bills</dt><dd>Water, Garbage, Electricity, Rent, Salaries</dd>
          <dt>Operational Expenses</dt><dd>Operational wages, Admin wages & Monthly financial reports</dd>
        </div>
        <div style="margin-top:12px"><button class="btn btn-xs btn-primary" data-act="adminops-tab" data-tab="opex_reports">Open Operational Expenses &rarr;</button></div>`)}
        ${card('Annual Governance & Societies', `<div class="dl">
          <dt>Annual Budgeting</dt><dd class="mono">${num(annualBudgets.length)} fiscal lines</dd>
          <dt>Filing of Societies</dt><dd class="mono">${num(societies.filter(s => s.status === 'compliant').length)}/${num(societies.length)} compliant</dd>
          <dt>Kenya Homa Bay Reports</dt><dd>Prepared by <b>Kisumu Head Office Admin</b></dd>
        </div>
        <div style="margin-top:12px"><button class="btn btn-xs btn-primary" data-act="adminops-tab" data-tab="annual">Open Annual & Societies &rarr;</button></div>`)}
      </div>`;
    }

    if (tab === 'daily_weekly') {
      body = `<div class="grid g2" style="margin-bottom:16px">
        ${card('Daily Patient Expenses — Pay-As-You-Go (PAYG)',
          table([
            { label: 'Date / Ref', render: r => `<div class="cellname">${esc(r.ref)}<span class="sm">${fmtDate(r.date)} · ${esc(countyName(r.countyId))}</span></div>` },
            { label: 'Beneficiary & Need', render: r => `<b>${esc(r.patientLabel || '-')}</b><div class="xs muted">${esc(r.category)}</div>` },
            { label: 'Amount', cls: 'num', render: r => `<b class="mono">${money(r.amount)}</b>` },
            { label: 'Receipt / Ref', render: r => `<span class="mono xs">${esc(r.paymentRef || '-')}</span>` },
            { label: 'Status', render: r => badge(titleCase(r.status), r.status === 'paid' ? 'b-ok' : 'b-warn') }
          ], payg, { emptyMsg: 'No daily Pay-As-You-Go patient expenses recorded yet.' }),
          { sub: 'Patient out-of-pocket & emergency support settled daily on Pay-As-You-Go mode.',
            actions: canEdit ? `<button class="btn btn-xs btn-primary" data-act="adminops-modal" data-kind="payg">${ic('plus', 12)} Record Daily PAYG</button>` : '' })}
        ${card('Daily Staff Transport Disbursements',
          table([
            { label: 'Date / Ref', render: r => `<div class="cellname">${esc(r.ref)}<span class="sm">${fmtDate(r.date)} · ${esc(countyName(r.countyId))}</span></div>` },
            { label: 'Staff & Route', render: r => `<b>${esc(r.staffName)}</b><div class="xs muted">${esc(r.route)}</div>` },
            { label: 'Amount', cls: 'num', render: r => `<b class="mono">${money(r.amount)}</b>` },
            { label: 'Payment Ref', render: r => `<span class="mono xs">${esc(r.paymentRef || '-')}</span>` },
            { label: 'Status', render: r => badge(titleCase(r.status), r.status === 'paid' ? 'b-ok' : 'b-warn') }
          ], transport, { emptyMsg: 'No daily staff transport entries recorded yet.' }),
          { sub: 'Field caregiver, coordinator & hospital escort transport paid daily.',
            actions: canEdit ? `<button class="btn btn-xs btn-primary" data-act="adminops-modal" data-kind="transport">${ic('plus', 12)} Record Daily Transport</button>` : '' })}
      </div>`
      + card('Weekly Supplier Payments Schedule',
        table([
          { label: 'Ref & Cycle', render: r => `<div class="cellname">${esc(r.ref)}<span class="sm">${esc(r.weekLabel || fmtDate(r.date))}</span></div>` },
          { label: 'County Office', render: r => esc(countyName(r.countyId)) },
          { label: 'Supplier', render: r => `<b>${esc(r.supplier)}</b><div class="xs muted">${esc(r.category)}</div>` },
          { label: 'Invoice No.', render: r => `<span class="mono xs">${esc(r.invoiceNo || '-')}</span>` },
          { label: 'Weekly Amount', cls: 'num', render: r => `<b class="mono">${money(r.amount)}</b>` },
          { label: 'Status', render: r => badge(titleCase(r.status), r.status === 'paid' ? 'b-ok' : 'b-warn') },
          { label: '', cls: 'act', render: r => canEdit && r.status !== 'paid'
              ? `<button class="btn btn-xs btn-primary" data-act="adminops-mark-paid" data-col="adminOpsSuppliers" data-id="${esc(r.id)}">${ic('check', 12)} Mark Paid</button>` : '' }
        ], suppliers, { emptyMsg: 'No weekly supplier payments scheduled yet.' }),
        { sub: 'Foodbag, medical & hygiene supplier invoices settled on a structured weekly payment cycle.',
          actions: canEdit ? `<button class="btn btn-xs btn-primary" data-act="adminops-modal" data-kind="supplier">${ic('plus', 12)} Schedule Weekly Supplier</button>` : '' });
    }

    if (tab === 'monthly_stat') {
      body = card('9th of Every Month Government Statutory Payments (SHIF · PAYE · KRA · NSSF)',
        `<div class="grid g4" style="margin-bottom:14px">
          ${this.STATUTORY_BODIES.map(b => {
            const match = statutory.find(s => s.body === b.id);
            const paid = match && match.status === 'paid';
            return `<div style="padding:12px 14px;border-radius:12px;border:1px solid var(--line);background:var(--surface-2)">
              <div class="spread"><b style="font-size:14px">${esc(b.id)}</b>${badge(paid ? 'Paid <= 9th' : 'Due by 9th', paid ? 'b-ok' : 'b-warn')}</div>
              <div class="xs muted" style="margin-top:4px">${esc(b.authority)}</div>
              <div class="mono bold" style="font-size:15px;margin-top:8px">${match ? money(match.amount) : 'Not posted'}</div>
              <div class="xs mono muted" style="margin-top:2px">Slip: ${esc(match?.slipRef || 'Pending')}</div>
            </div>`;
          }).join('')}
        </div>`
        + table([
          { label: 'Statutory Obligation', render: r => `<b>${esc(r.body)}</b><div class="xs muted">Deadline: ${esc(r.dueDate)} (9th of month)</div>` },
          { label: 'Office', render: r => esc(countyName(r.countyId)) },
          { label: 'Portal / Slip Ref', render: r => `<span class="mono xs">${esc(r.slipRef || '-')}</span>` },
          { label: 'Amount', cls: 'num', render: r => `<b class="mono">${money(r.amount)}</b>` },
          { label: 'Paid Date', render: r => r.paidDate ? fmtDate(r.paidDate) : '<span class="xs muted">Pending</span>' },
          { label: 'Compliance', render: r => badge(r.status === 'paid' ? 'Remitted' : 'Awaiting Remittance', r.status === 'paid' ? 'b-ok' : 'b-warn') },
          { label: '', cls: 'act', render: r => canEdit && r.status !== 'paid'
              ? `<button class="btn btn-xs btn-primary" data-act="adminops-mark-paid" data-col="adminOpsStatutory" data-id="${esc(r.id)}">${ic('check', 12)} Confirm Paid</button>` : '' }
        ], statutory),
        { sub: 'Mandatory Kenya statutory deadline: 9th of every month for SHIF, PAYE, KRA and NSSF.',
          actions: canEdit ? `<button class="btn btn-xs btn-primary" data-act="adminops-modal" data-kind="statutory">${ic('plus', 12)} Record Statutory Payment</button>` : '' })
      + `<div style="margin-top:16px">${card('Monthly Utilities, Bills, Rent & Salaries (Water · Garbage · Electricity · Rent · Salaries)',
        table([
          { label: 'Period', render: r => `<span class="mono xs">${esc(r.period)}</span>` },
          { label: 'County Office', render: r => esc(countyName(r.countyId)) },
          { label: 'Utility / Bill Category', render: r => badge(r.utilityType, 'b-info', 'nodot') },
          { label: 'Payee / Account', render: r => `<b>${esc(r.payee)}</b><div class="xs mono muted">${esc(r.ref || '')}</div>` },
          { label: 'Amount', cls: 'num', render: r => `<b class="mono">${money(r.amount)}</b>` },
          { label: 'Status', render: r => badge(titleCase(r.status), r.status === 'paid' ? 'b-ok' : 'b-warn') },
          { label: '', cls: 'act', render: r => canEdit && r.status !== 'paid'
              ? `<button class="btn btn-xs btn-primary" data-act="adminops-mark-paid" data-col="adminOpsUtilities" data-id="${esc(r.id)}">${ic('check', 12)} Mark Paid</button>` : '' }
        ], utilities),
        { sub: 'Tracks monthly water, garbage, electricity, office/care-centre rent and staff salaries.',
          actions: canEdit ? `<button class="btn btn-xs btn-primary" data-act="adminops-modal" data-kind="utility">${ic('plus', 12)} Record Utility / Bill / Salary</button>` : '' })}</div>`;
    }

    if (tab === 'opex_reports') {
      const ow = sumAmt(opex.filter(x => x.subType === 'operational_wages'));
      const aw = sumAmt(opex.filter(x => x.subType === 'administrative_wages'));
      const fr = sumAmt(opex.filter(x => x.subType === 'financial_reports'));

      body = `<div class="alert info" style="margin-bottom:16px">${ic('building2', 18)}<div>
        <b>Operational Expenses & Kenya Monthly Financial Reporting Rule</b>
        <span class="small">Per Administration policy, monthly <b>Operational wages</b>, monthly <b>Administrative wages</b>, and monthly <b>Financial reports</b> are grouped together as <b>Operational Expenses</b>. <b>Homa Bay reports for Kenya are prepared by Head Office Admin in Kisumu</b> using verified monthly schedules submitted by Homa Bay County Office.</span>
      </div></div>`
      + `<div class="grid g3" style="margin-bottom:16px">
          ${kpi('Operational Wages (Monthly)', money(ow), 'Operational Expenses · Pillar 1', 'info', 'users')}
          ${kpi('Administrative Wages (Monthly)', money(aw), 'Operational Expenses · Pillar 2', 'info', 'idcard')}
          ${kpi('Monthly Financial Reports', `${num(mReports.length)} packs`, `Operational Expenses · Pillar 3 (${money(fr)})`, 'ok', 'file')}
        </div>`
      + card('Operational Expenses Ledger (Operational Wages · Administrative Wages · Monthly Financial Reports)',
        table([
          { label: 'Period', render: r => `<span class="mono xs">${esc(r.period)}</span>` },
          { label: 'County Scope', render: r => esc(countyName(r.countyId)) },
          { label: 'Operational Expense Pillar', render: r => badge((this.OPEX_SUBTYPES.find(s => s.id === r.subType) || {}).label || r.subType, 'b-accent', 'nodot') },
          { label: 'Description & Ref', render: r => `<b>${esc(r.title)}</b><div class="xs mono muted">${esc(r.ref || '-')} · ${esc(r.preparedBy || '')}</div>` },
          { label: 'Monthly Amount', cls: 'num', render: r => `<b class="mono">${money(r.amount)}</b>` },
          { label: 'Status', render: r => badge(titleCase(r.status), r.status === 'paid' ? 'b-ok' : 'b-warn') }
        ], opex),
        { sub: 'Unified Operational Expenses schedule preferred by Administration.',
          actions: canEdit ? `<button class="btn btn-xs btn-primary" data-act="adminops-modal" data-kind="opex">${ic('plus', 12)} Add Operational Expense</button>` : '' })
      + `<div style="margin-top:16px">${card('Monthly Financial Reports for Kenya — Kisumu Head Office Preparation Desk',
        table([
          { label: 'Period', render: r => `<span class="mono bold">${esc(r.period)}</span>` },
          { label: 'County Report', render: r => `<b>${esc(r.reportTitle)}</b><div class="xs muted">${esc(r.note || '')}</div>` },
          { label: 'Prepared By (Mandated)', render: r => badge(r.preparedByOffice || 'Kisumu Head Office Admin', 'b-info', 'nodot') },
          { label: 'Operational Expenses', cls: 'num', render: r => `<span class="mono">${money(r.totalOpEx)}</span>` },
          { label: 'Total Monthly Spend', cls: 'num', render: r => `<b class="mono">${money(r.totalDisbursed)}</b>` },
          { label: 'Status', render: r => badge(r.reportStatus === 'certified' ? 'Certified (Kenya HQ)' : 'In Preparation at Kisumu HQ', r.reportStatus === 'certified' ? 'b-ok' : 'b-warn') },
          { label: '', cls: 'act', render: r => `<div class="row" style="gap:5px;justify-content:flex-end">
            ${!canKenyaHQ && user.countyId === 'homabay' && r.targetCountyId === 'homabay'
              ? `<button class="btn btn-xs btn-ghost" data-act="adminops-submit-hb-pack" data-id="${esc(r.id)}">${ic('send', 12)} Submit Homa Bay Inputs to Kisumu HQ</button>` : ''}
            ${canKenyaHQ && r.reportStatus !== 'certified'
              ? `<button class="btn btn-xs btn-primary" data-act="adminops-certify-kenya-report" data-id="${esc(r.id)}">${ic('check', 12)} Prepare & Certify at Kisumu HQ</button>` : ''}
            <button class="btn btn-xs btn-ghost" data-act="adminops-view-kenya-report" data-id="${esc(r.id)}">${ic('eye', 12)} Preview</button>
          </div>` }
        ], mReports),
        { sub: 'Homa Bay reports for Kenya are prepared and certified by Head Office Admin in Kisumu.',
          actions: canKenyaHQ ? `<button class="btn btn-xs btn-primary" data-act="adminops-new-kenya-report">${ic('plus', 12)} Prepare Homa Bay / Kisumu Monthly Report</button>` : '' })}</div>`;
    }

    if (tab === 'annual') {
      const totAnnual = sumAmt(annualBudgets, 'annualAmount');
      const totYtd = sumAmt(annualBudgets, 'ytdActual');
      body = `<div class="grid g2" style="margin-bottom:16px">
        ${card('Annual Budget vs YTD Actuals', chartGrouped({
          labels: annualBudgets.map(b => b.category.split(' (')[0].slice(0, 16)),
          series: [
            { label: 'Annual Budget', values: annualBudgets.map(b => Math.round(b.annualAmount)), color: activePalette.colors[0] },
            { label: 'YTD Actual', values: annualBudgets.map(b => Math.round(b.ytdActual)), color: activePalette.colors[1] }
          ],
          fmt: v => money(v),
          title: 'Annual budget vs YTD actual expenditure',
          labelHead: 'Annual budget line',
          height: 235
        }), { sub: `Consolidated Annual Budget: ${money(totAnnual)} · YTD Spend: ${money(totYtd)} (${pct(totYtd, totAnnual)}% utilised)` })}
        ${card('Annual Budget Allocation Share', chartDonut(
          annualBudgets.map((b, i) => ({ label: b.category.split(' (')[0], value: b.annualAmount, color: activePalette.colors[i % activePalette.colors.length] })),
          { title: 'Annual budget allocation', fmt: v => money(v), centerLabel: 'ANNUAL BUDGET', centerValue: money(totAnnual) }
        ), { sub: 'Symmetrical annual allocation across Kisumu Head Office & Homa Bay County.' })}
      </div>`
      + card('Annual Budgeting Schedule',
        table([
          { label: 'FY', render: b => `<span class="mono bold">${esc(b.fiscalYear)}</span>` },
          { label: 'Office', render: b => esc(countyName(b.countyId)) },
          { label: 'Budget Line', render: b => `<b>${esc(b.category)}</b><div class="xs muted">${esc(b.owner || '')}</div>` },
          { label: 'Annual Budget', cls: 'num', render: b => `<b class="mono">${money(b.annualAmount)}</b>` },
          { label: 'YTD Actual', cls: 'num', render: b => `<span class="mono">${money(b.ytdActual)}</span>` },
          { label: 'Remaining', cls: 'num', render: b => `<b class="mono">${money(b.annualAmount - b.ytdActual)}</b>` },
          { label: 'Burn %', cls: 'num', render: b => `${pct(b.ytdActual, b.annualAmount)}%` }
        ], annualBudgets),
        { sub: 'Annual financial planning across daily PAYG, weekly suppliers, 9th statutory, utilities & Operational Expenses.',
          actions: canEdit ? `<button class="btn btn-xs btn-primary" data-act="adminops-modal" data-kind="annual_budget">${ic('plus', 12)} Add Annual Budget Line</button>` : '' })
      + `<div style="margin-top:16px">${card('Filing of Societies & Annual Renewal of Licenses, Certifications & Government Operational Requirements',
        table([
          { label: 'Requirement / License', render: s => `<b>${esc(s.filingType)}</b><div class="xs muted">${esc(s.authority)}</div>` },
          { label: 'Certificate / Ref', render: s => `<span class="mono xs">${esc(s.refNo || '-')}</span>` },
          { label: 'County / Scope', render: s => esc(countyName(s.countyId)) },
          { label: 'Renewal Due Date', render: s => `<span class="mono">${fmtDate(s.dueDate)}</span>` },
          { label: 'Last Renewed', render: s => s.renewedDate ? fmtDate(s.renewedDate) : '<span class="xs muted">Pending</span>' },
          { label: 'Lead Office', render: s => `<span class="small">${esc(s.leadOffice || '')}</span>` },
          { label: 'Compliance Status', render: s => badge(s.status === 'compliant' ? 'Compliant / Active' : 'Renewal Due Soon', s.status === 'compliant' ? 'b-ok' : 'b-warn') },
          { label: '', cls: 'act', render: s => canEdit && s.status !== 'compliant'
              ? `<button class="btn btn-xs btn-primary" data-act="adminops-renew-society" data-id="${esc(s.id)}">${ic('check', 12)} Record Renewal</button>` : '' }
        ], societies),
        { sub: 'Annual Registrar of Societies filing, County operational permits, KRA Tax Compliance, ODPC & Public Health/Fire certifications.',
          actions: canEdit ? `<button class="btn btn-xs btn-primary" data-act="adminops-modal" data-kind="society">${ic('plus', 12)} Add Society / License Filing</button>` : '' })}</div>`;
    }

    return `<main class="aops-workspace" style="${paletteVars}" aria-label="Admin Operations and statutory workspace">` + pageHead(
      'Admin Operations & Statutory',
      'Finance, compliance and governance · Kisumu Head Office and Homa Bay County',
      headerActions
    ) + statutoryBanner + kpiRow + tabNav + `<section id="aopsPanel" class="aops-workspace-content" role="tabpanel" aria-labelledby="aops-tab-${esc(tab)}" tabindex="0">${body}</section></main>`;
  },

  openEntryModal(kind) {
    const user = AUTH.user;
    if (!this.canEdit(user)) return toast('Read-only scope', 'Your account may view Admin Operations but not create entries.', 'err');
    const cOpts = (this.isGlobalViewer(user) ? COUNTIES : COUNTIES.filter(c => c.id === user.countyId))
      .map(c => ({ v: c.id, l: c.name }));
    const ym = todayISO().slice(0, 7);
    const today = todayISO().slice(0, 10);

    let title = 'Record Admin Operations Entry';
    let fields = '';
    if (kind === 'payg') {
      title = 'Record Daily Patient Expense (Pay-As-You-Go)';
      fields = `<div class="grid g2">
        ${field('Date', 'date', 'date', { value: today, required: true })}
        ${field('County Office', 'countyId', 'select', { options: cOpts, value: user.countyId })}
        ${field('Beneficiary Name / Code', 'patientLabel', 'text', { required: true, placeholder: 'e.g. Beneficiary code or name' })}
        ${field('PAYG Need Category', 'category', 'select', { options: ['Outpatient Lab & Emergency Meds', 'Direct Nutritional & Urgent Care', 'Hospital Clinic Review & Prescription', 'Emergency Escort Care'] })}
        ${field('Amount (KES)', 'amount', 'number', { required: true, min: 50 })}
        ${field('M-Pesa / Receipt Reference', 'paymentRef', 'text', { required: true, placeholder: 'e.g. QKJ82...' })}
      </div>`;
    } else if (kind === 'transport') {
      title = 'Record Daily Staff Transport';
      fields = `<div class="grid g2">
        ${field('Date', 'date', 'date', { value: today, required: true })}
        ${field('County Office', 'countyId', 'select', { options: cOpts, value: user.countyId })}
        ${field('Staff / Care Team', 'staffName', 'text', { required: true })}
        ${field('Field / Hospital Route', 'route', 'text', { required: true, placeholder: 'e.g. Kisumu Office -> Nyalenda' })}
        ${field('Daily Fare (KES)', 'amount', 'number', { required: true, min: 50 })}
        ${field('Payment Reference', 'paymentRef', 'text', { required: true })}
      </div>`;
    } else if (kind === 'supplier') {
      title = 'Schedule / Pay Weekly Supplier';
      fields = `<div class="grid g2">
        ${field('Week Label', 'weekLabel', 'text', { value: 'Weekly Run · ' + today, required: true })}
        ${field('County Office', 'countyId', 'select', { options: cOpts, value: user.countyId })}
        ${field('Supplier Name', 'supplier', 'text', { required: true })}
        ${field('Supply Category', 'category', 'select', { options: ['Foodbags & Dry Rations (BG1/BG2/SPB)', 'Formulary & Dressing Supplies', 'Hygiene Kits & Bedding', 'Care Centre Provisions'] })}
        ${field('Invoice Number', 'invoiceNo', 'text', { required: true })}
        ${field('Amount (KES)', 'amount', 'number', { required: true, min: 100 })}
      </div>`;
    } else if (kind === 'statutory') {
      title = 'Record 9th-of-Month Statutory Remittance';
      fields = `<div class="grid g2">
        ${field('Statutory Body (Due by 9th)', 'body', 'select', { options: ['SHIF', 'PAYE', 'KRA', 'NSSF'] })}
        ${field('County Office', 'countyId', 'select', { options: cOpts, value: user.countyId })}
        ${field('Month Period (YYYY-MM)', 'period', 'text', { value: ym, required: true })}
        ${field('Portal / Payment Slip Ref', 'slipRef', 'text', { required: true, placeholder: 'SHA / iTax / NSSF slip no.' })}
        ${field('Amount (KES)', 'amount', 'number', { required: true, min: 100 })}
        ${field('Status', 'status', 'select', { options: [{ v: 'paid', l: 'Paid & Receipted' }, { v: 'pending', l: 'Scheduled (Due by 9th)' }] })}
      </div>`;
    } else if (kind === 'utility') {
      title = 'Record Monthly Utility, Bill, Rent or Salary';
      fields = `<div class="grid g2">
        ${field('Category', 'utilityType', 'select', { options: this.UTILITY_TYPES })}
        ${field('County Office', 'countyId', 'select', { options: cOpts, value: user.countyId })}
        ${field('Month Period', 'period', 'text', { value: ym, required: true })}
        ${field('Payee / Account Ref', 'payee', 'text', { required: true })}
        ${field('Amount (KES)', 'amount', 'number', { required: true, min: 100 })}
        ${field('Voucher / Receipt Ref', 'ref', 'text', { required: true })}
      </div>`;
    } else if (kind === 'opex') {
      title = 'Record Monthly Operational Expense';
      fields = `<div class="grid g2">
        ${field('Operational Expense Pillar', 'subType', 'select', { options: this.OPEX_SUBTYPES.map(s => ({ v: s.id, l: s.label })) })}
        ${field('County Scope', 'countyId', 'select', { options: cOpts, value: user.countyId })}
        ${field('Month Period', 'period', 'text', { value: ym, required: true })}
        ${field('Description', 'title', 'text', { required: true, placeholder: 'e.g. Monthly Operational Wages' })}
        ${field('Amount (KES)', 'amount', 'number', { required: true, min: 100 })}
        ${field('Voucher Reference', 'ref', 'text', { required: true })}
      </div>`;
    } else if (kind === 'annual_budget') {
      title = 'Add Annual Budget Line';
      fields = `<div class="grid g2">
        ${field('Fiscal Year', 'fiscalYear', 'text', { value: today.slice(0, 4), required: true })}
        ${field('County Office', 'countyId', 'select', { options: cOpts, value: user.countyId })}
        ${field('Annual Budget Line Name', 'category', 'text', { required: true })}
        ${field('Annual Approved Budget (KES)', 'annualAmount', 'number', { required: true, min: 1000 })}
      </div>`;
    } else if (kind === 'society') {
      title = 'Add Filing of Societies / Annual Operational Renewal';
      fields = `<div class="grid g2">
        ${field('Filing / License Name', 'filingType', 'text', { required: true, placeholder: 'e.g. Filing of Societies Annual Return' })}
        ${field('Regulator / Authority', 'authority', 'text', { required: true, placeholder: 'e.g. Registrar of Societies' })}
        ${field('Certificate / Filing Ref', 'refNo', 'text', { required: true })}
        ${field('County Scope', 'countyId', 'select', { options: cOpts, value: user.countyId })}
        ${field('Annual Renewal Due Date', 'dueDate', 'date', { value: `${today.slice(0, 4)}-12-31`, required: true })}
        ${field('Lead Office', 'leadOffice', 'text', { value: 'Kisumu Head Office Admin', required: true })}
      </div>`;
    }

    openModal({
      title,
      sub: 'Saved to the shared CareLink online database and recorded in the audit trail.',
      body: `<form data-form="adminops-entry" id="adminOpsForm"><input type="hidden" name="kind" value="${esc(kind)}">${fields}</form>`,
      footer: `<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" data-act="adminops-save">Save Record</button>`
    });
  }
};

Object.assign(ACTIONS, {
  'toggle-chart-table-mode': () => {
    const next = (typeof isChartTableMode === 'function' && isChartTableMode()) ? 'charts' : 'table';
    APPX.chartViewMode = next;
    if (typeof COST_STATE !== 'undefined') COST_STATE.viewMode = next;
    render();
  },
  'adminops-tab': (d) => { ADMIN_OPS_STATE.tab = d.tab || 'overview'; render(); },
  'adminops-county': (d) => { ADMIN_OPS_STATE.countyFilter = d.county || 'all'; render(); },
  'adminops-palette': (d) => {
    const user = AUTH.user;
    const palette = ADMIN_OPS_PALETTES.find(p => p.id === d.palette);
    if (!user || !palette || !ADMIN_OPS.canAccess(user)) return;
    DB.db.personalPrefs = DB.db.personalPrefs || {};
    DB.db.personalPrefs[user.id] = DB.db.personalPrefs[user.id] || {};
    DB.db.personalPrefs[user.id].adminOpsPalette = palette.id;
    DB.save();
    render();
  },
  'adminops-modal': (d) => ADMIN_OPS.openEntryModal(d.kind),
  'adminops-save': () => {
    const f = $('#adminOpsForm'); if (!f) return;
    const d = new FormData(f);
    const kind = d.get('kind');
    const u = AUTH.user;
    ADMIN_OPS.ensureCollections();
    const today = todayISO().slice(0, 10);
    if (kind === 'payg') {
      DB.db.adminOpsPayg.unshift({
        id: uid('payg'), ref: 'PAYG-' + uidNum(), date: d.get('date') || today, countyId: d.get('countyId') || u.countyId,
        patientLabel: String(d.get('patientLabel') || '').trim(), category: d.get('category'), mode: 'Pay-As-You-Go (Daily)',
        paymentRef: String(d.get('paymentRef') || '').trim(), amount: Number(d.get('amount')) || 0, status: 'paid'
      });
    } else if (kind === 'transport') {
      DB.db.adminOpsTransport.unshift({
        id: uid('stpt'), ref: 'TPT-D-' + uidNum(), date: d.get('date') || today, countyId: d.get('countyId') || u.countyId,
        staffName: String(d.get('staffName') || '').trim(), route: String(d.get('route') || '').trim(), mode: 'Daily Staff Transport',
        paymentRef: String(d.get('paymentRef') || '').trim(), amount: Number(d.get('amount')) || 0, status: 'paid'
      });
    } else if (kind === 'supplier') {
      DB.db.adminOpsSuppliers.unshift({
        id: uid('supw'), ref: 'SUP-WK-' + uidNum(), date: today, weekLabel: String(d.get('weekLabel') || '').trim(),
        countyId: d.get('countyId') || u.countyId, supplier: String(d.get('supplier') || '').trim(),
        category: d.get('category'), invoiceNo: String(d.get('invoiceNo') || '').trim(), amount: Number(d.get('amount')) || 0, status: 'scheduled'
      });
    } else if (kind === 'statutory') {
      const per = String(d.get('period') || today.slice(0, 7));
      const st = d.get('status') || 'paid';
      DB.db.adminOpsStatutory.unshift({
        id: uid('stat'), period: per, dueDate: `${per}-09`, body: d.get('body'), countyId: d.get('countyId') || u.countyId,
        slipRef: String(d.get('slipRef') || '').trim(), amount: Number(d.get('amount')) || 0,
        paidDate: st === 'paid' ? today : '', status: st
      });
    } else if (kind === 'utility') {
      DB.db.adminOpsUtilities.unshift({
        id: uid('util'), period: String(d.get('period') || today.slice(0, 7)), countyId: d.get('countyId') || u.countyId,
        utilityType: d.get('utilityType'), payee: String(d.get('payee') || '').trim(), ref: String(d.get('ref') || '').trim(),
        amount: Number(d.get('amount')) || 0, status: 'paid'
      });
    } else if (kind === 'opex') {
      DB.db.adminOpsOpEx.unshift({
        id: uid('opex'), period: String(d.get('period') || today.slice(0, 7)), countyId: d.get('countyId') || u.countyId,
        subType: d.get('subType'), title: String(d.get('title') || '').trim(), ref: String(d.get('ref') || '').trim(),
        amount: Number(d.get('amount')) || 0, status: 'paid', preparedBy: u.name
      });
    } else if (kind === 'annual_budget') {
      DB.db.adminOpsAnnualBudgets.push({
        id: uid('ab'), fiscalYear: String(d.get('fiscalYear') || today.slice(0, 4)), countyId: d.get('countyId') || u.countyId,
        category: String(d.get('category') || '').trim(), annualAmount: Number(d.get('annualAmount')) || 0, ytdActual: 0, owner: u.name
      });
    } else if (kind === 'society') {
      DB.db.adminOpsSocieties.push({
        id: uid('soc'), filingType: String(d.get('filingType') || '').trim(), authority: String(d.get('authority') || '').trim(),
        refNo: String(d.get('refNo') || '').trim(), countyId: d.get('countyId') || u.countyId, dueDate: d.get('dueDate') || today,
        renewedDate: '', status: 'due_soon', leadOffice: String(d.get('leadOffice') || 'Kisumu Head Office Admin').trim()
      });
    }
    AUDIT.append({ actor: u.id, action: `adminops.${kind}_recorded`, entity: 'adminOps', entityId: kind, detail: `Recorded ${kind} in County/HQ Admin Operations` });
    DB.save(); closeModal(true); toast('Saved', 'Operational record stored and synchronised.', 'ok'); render();
  },
  'adminops-mark-paid': (d) => {
    const col = DB.db[d.col] || [];
    const rec = col.find(x => x.id === d.id);
    if (!rec) return;
    rec.status = 'paid';
    rec.paidDate = todayISO().slice(0, 10);
    AUDIT.append({ actor: AUTH.user.id, action: 'adminops.marked_paid', entity: d.col, entityId: rec.id, detail: `Marked ${rec.ref || rec.body || rec.utilityType} as paid` });
    DB.save(); toast('Confirmed paid', 'Payment status updated.', 'ok'); render();
  },
  'adminops-renew-society': (d) => {
    const rec = (DB.db.adminOpsSocieties || []).find(x => x.id === d.id);
    if (!rec) return;
    rec.status = 'compliant';
    rec.renewedDate = todayISO().slice(0, 10);
    AUDIT.append({ actor: AUTH.user.id, action: 'adminops.society_renewed', entity: 'adminOpsSocieties', entityId: rec.id, detail: `Renewed ${rec.filingType}` });
    DB.save(); toast('Annual renewal recorded', rec.filingType, 'ok'); render();
  },
  'adminops-submit-hb-pack': (d) => {
    const rec = (DB.db.adminOpsMonthlyReports || []).find(x => x.id === d.id);
    if (!rec) return;
    rec.sourcePackStatus = 'submitted_to_kisumu';
    rec.updatedAt = todayISO();
    AUDIT.append({ actor: AUTH.user.id, action: 'adminops.homabay_pack_submitted', entity: 'adminOpsMonthlyReports', entityId: rec.id,
      detail: 'Homa Bay County Office submitted monthly schedules to Kisumu Head Office Admin for Kenya report preparation' });
    DB.save(); toast('Submitted to Kisumu Head Office', 'Head Office Admin in Kisumu can now prepare and certify the Homa Bay report for Kenya.', 'ok'); render();
  },
  'adminops-certify-kenya-report': (d) => {
    if (!ADMIN_OPS.canPrepareKenyaReport(AUTH.user)) {
      return toast('Kisumu Head Office Authority Required', 'Homa Bay reports for Kenya are prepared and certified by Head Office Admin in Kisumu.', 'err');
    }
    const rec = (DB.db.adminOpsMonthlyReports || []).find(x => x.id === d.id);
    if (!rec) return;
    rec.reportStatus = 'certified';
    rec.preparedByOffice = 'Kisumu Head Office Admin (' + AUTH.user.name.replace(/^Demo - /, '') + ')';
    rec.updatedAt = todayISO();
    AUDIT.append({ actor: AUTH.user.id, action: 'adminops.kenya_report_certified', entity: 'adminOpsMonthlyReports', entityId: rec.id,
      detail: `${rec.reportTitle} (${rec.period}) prepared and certified by Kisumu Head Office Admin` });
    DB.save(); toast('Kenya Monthly Financial Report Certified', `${rec.reportTitle} certified by Kisumu Head Office.`, 'ok'); render();
  },
  'adminops-new-kenya-report': () => {
    if (!ADMIN_OPS.canPrepareKenyaReport(AUTH.user)) {
      return toast('Kisumu Head Office Only', 'Monthly Kenya reports (including Homa Bay) are prepared by Head Office Admin in Kisumu.', 'err');
    }
    const ym = todayISO().slice(0, 7);
    openModal({
      title: 'Prepare Monthly Financial Report for Kenya (Kisumu Head Office Desk)',
      sub: 'Head Office Admin in Kisumu prepares both Kisumu and Homa Bay monthly financial reports for Kenya.',
      body: `<form id="kenyaRptForm">
        <div class="grid g2">
          ${field('Reporting Month (YYYY-MM)', 'period', 'text', { value: ym, required: true })}
          ${field('Target County Report', 'targetCountyId', 'select', { options: [{ v: 'homabay', l: 'Homa Bay County Report for Kenya (Prepared at Kisumu HQ)' }, { v: 'kisumu', l: 'Kisumu Head Office Report for Kenya' }] })}
        </div>
        ${field('Preparation & Reconciliation Notes', 'note', 'textarea', { value: 'Prepared by Head Office Admin in Kisumu consolidating Operational Expenses (Operational wages, Administrative wages & Monthly financial reports), daily PAYG, daily staff transport, weekly suppliers, and 9th statutory remittances.' })}
      </form>`,
      footer: `<button class="btn btn-ghost" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" data-act="adminops-save-kenya-report">Prepare & Certify Report</button>`
    });
  },
  'adminops-save-kenya-report': () => {
    const f = $('#kenyaRptForm'); if (!f) return;
    const d = new FormData(f);
    const cid = d.get('targetCountyId') || 'homabay';
    const per = String(d.get('period') || todayISO().slice(0, 7));
    const opexAmt = (DB.db.adminOpsOpEx || []).filter(x => x.countyId === cid).reduce((n, x) => n + (Number(x.amount) || 0), 0);
    const paygAmt = (DB.db.adminOpsPayg || []).filter(x => x.countyId === cid).reduce((n, x) => n + (Number(x.amount) || 0), 0);
    const supAmt = (DB.db.adminOpsSuppliers || []).filter(x => x.countyId === cid).reduce((n, x) => n + (Number(x.amount) || 0), 0);
    const tptAmt = (DB.db.adminOpsTransport || []).filter(x => x.countyId === cid).reduce((n, x) => n + (Number(x.amount) || 0), 0);
    const rec = {
      id: uid('mfr'),
      period: per,
      targetCountyId: cid,
      reportTitle: cid === 'homabay' ? 'Homa Bay County Monthly Financial Report for Kenya' : 'Kisumu Head Office Monthly Financial Report (Kenya)',
      preparedByOffice: 'Kisumu Head Office Admin (' + AUTH.user.name.replace(/^Demo - /, '') + ')',
      sourcePackStatus: 'verified',
      reportStatus: 'certified',
      totalOpEx: opexAmt,
      totalDisbursed: opexAmt + paygAmt + supAmt + tptAmt,
      updatedAt: todayISO(),
      note: String(d.get('note') || '')
    };
    DB.db.adminOpsMonthlyReports.unshift(rec);
    AUDIT.append({ actor: AUTH.user.id, action: 'adminops.kenya_report_created', entity: 'adminOpsMonthlyReports', entityId: rec.id, detail: rec.reportTitle });
    DB.save(); closeModal(true); toast('Monthly Financial Report Prepared', rec.reportTitle, 'ok'); render();
  },
  'adminops-view-kenya-report': (d) => {
    const rec = (DB.db.adminOpsMonthlyReports || []).find(x => x.id === d.id);
    if (!rec) return;
    openModal({
      title: rec.reportTitle,
      sub: `Period ${rec.period} · Prepared by ${rec.preparedByOffice}`,
      wide: true,
      body: `<div class="dl">
        <dt>Target County</dt><dd>${esc(countyName(rec.targetCountyId))}</dd>
        <dt>Prepared & Reconciled By</dt><dd><b>${esc(rec.preparedByOffice)}</b></dd>
        <dt>Operational Expenses Total</dt><dd class="mono"><b>${money(rec.totalOpEx)}</b> (Operational wages + Administrative wages + Monthly financial reports)</dd>
        <dt>Total Disbursed in Scope</dt><dd class="mono"><b>${money(rec.totalDisbursed)}</b></dd>
        <dt>Certification Status</dt><dd>${esc(titleCase(rec.reportStatus))}</dd>
      </div>
      <div class="divider"></div>
      <p class="small">${esc(rec.note || '')}</p>`,
      footer: `<button class="btn btn-ghost" data-act="close-modal">Close</button>
        <button class="btn btn-primary" data-act="do-print">${ic('download', 14)} Print Summary</button>`
    });
  }
});
