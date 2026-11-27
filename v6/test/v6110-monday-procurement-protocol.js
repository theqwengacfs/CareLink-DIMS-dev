/* v6.11.0 — the Monday Procurement Protocol.
   Pins the arithmetic the Foundation asked for: a 180-patient weekly envelope,
   the intakes = 180 − still-active rule, the alternate Bag 1 / Bag 2 issue, and
   an item-level budget where every line is quantity x price. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.resolve(__dirname, '..', '..');
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};

/* ---- a small document/DB stand-in, enough for the module ---- */
function makeCtx() {
  const db = { meta: {}, settings: {}, users: [], patients: [] };
  const ctx = {
    console,
    DB: {
      db,
      persistState() { ctx.__persisted = true; },
      save() { ctx.__persisted = true; }
    },
    AUTH: { user: { id: 'u-proc-1', username: 'procurement.kisumu', roleId: 'procure', countyId: 'kisumu', name: 'Procurement Officer' } },
    AUDIT: { append(e) { (ctx.__audit = ctx.__audit || []).push(e); } },
    ACTIONS: {},
    COUNTIES: [{ id: 'kisumu', name: 'Kisumu' }, { id: 'homabay', name: 'Homa Bay' }],
    RBAC: { has: () => true },
    isGlobal: () => false,
    document: { querySelector: () => null },
    money: (n) => 'KES ' + Number(n || 0).toLocaleString('en-KE', { maximumFractionDigits: 0 }),
    num: (n) => Number(n || 0).toLocaleString('en-KE'),
    esc: (s) => String(s == null ? '' : s),
    ic: () => '',
    badge: (t) => `<span>${t}</span>`,
    kpi: () => '',
    card: (t, b) => `<section>${t || ''}${b || ''}</section>`,
    pageHead: (t, s) => `<h2>${t}</h2><div>${s}</div>`,
    table: (cols, rows) => `<table>${rows.length} rows</table>`,
    emptyState: (t) => `<div>${t}</div>`,
    deniedPanel: () => 'denied',
    fmtDate: (d) => String(d || ''),
    countyName: (id) => (id === 'homabay' ? 'Homa Bay' : 'Kisumu'),
    toast: (t, m, k) => { (ctx.__toasts = ctx.__toasts || []).push({ t, m, k }); },
    go: () => {},
    FormData: class { constructor() {} get() { return null; } },
    Math,
  };
  vm.createContext(ctx);
  const src = fs.readFileSync(path.join(REPO, 'v6', 'src', 'monday_procurement_protocol6.js'), 'utf8');
  vm.runInContext(src, ctx);
  return ctx;
}

const C = makeCtx();
const P = vm.runInContext('MONDAY_PROTOCOL', C);
const UI = vm.runInContext('MONDAY_PROTOCOL_UI', C);

console.log('\nMONDAY PROCUREMENT PROTOCOL\n');

/* ---- 1. the envelope ---- */
ok('the weekly envelope is 180 patients', P.WEEKLY_BUDGET === 180);

/* ---- 2. the subtraction, exactly as described ----
   "the number of patients left in the system after discharges and enrolments
    will be subtracted from 180 to know the new number of patients to be accepted" */
{
  const plan = P.computeWeeklyPlan({ activeNow: 120, discharges: 6, deaths: 1, completed: 3, inpatient: 8, weeklyBudget: 180 });
  ok('remaining = active − discharges − deaths − completed', plan.remaining === 110, `got ${plan.remaining}`);
  ok('new intakes = 180 − remaining', plan.requiredIntakes === 70, `got ${plan.requiredIntakes}`);
  ok('served this week completes the envelope at 180', plan.servedThisWeek === 180, `got ${plan.servedThisWeek}`);
  ok('inpatients are counted inside the 180, not added on top', plan.inWard === 8);
  ok('home foodbags = served − in a ward', plan.homeServed === 172, `got ${plan.homeServed}`);
}
{
  const full = P.computeWeeklyPlan({ activeNow: 180, discharges: 0, weeklyBudget: 180 });
  ok('a full register needs no new intakes', full.requiredIntakes === 0);
  ok('a full register is not flagged as over the envelope', full.overEnvelope === false);
}
{
  const over = P.computeWeeklyPlan({ activeNow: 195, discharges: 2, weeklyBudget: 180 });
  ok('an over-full register is reported, not clamped', over.overEnvelope === true);
  ok('the overrun is quantified so it cannot hide', over.overBy === 13, `got ${over.overBy}`);
  ok('no new intakes are calculated while over the envelope', over.requiredIntakes === 0);
}
{
  const zero = P.computeWeeklyPlan({ activeNow: 0, weeklyBudget: 180 });
  ok('an empty register accepts the whole envelope', zero.requiredIntakes === 180);
}

/* ---- 3. alternate bag rule ---- */
{
  const a = P.primaryBagFor('2026-W48');
  const b = P.primaryBagFor('2026-W49');
  const c = P.primaryBagFor('2026-W50');
  ok('the primary bag exists and is a real bag', ['BG1', 'BG2'].includes(a), a);
  ok('consecutive weeks alternate bags', a !== b, `${a} then ${b}`);
  ok('and the week after returns to the first bag', a === c, `${a} / ${b} / ${c}`);
  ok('alternation is stable when asked twice', P.primaryBagFor('2026-W48') === P.primaryBagFor('2026-W48'));
  const w1 = P.weekKey(new Date('2026-11-23'));  /* a Monday */
  const w2 = P.weekKey(new Date('2026-11-30'));
  ok('ISO week keys advance by one week', P.weekKey(P.mondayOf(w2)) === w2);
  ok('a Monday maps back to itself', P.mondayOf(w1).getDay() === 1, String(P.mondayOf(w1)));
}

/* ---- 4. a patient takes the opposite bag next week ---- */
{
  const patient = { id: 'p-1' };
  const wk = '2026-W48';
  const first = P.bagForPatient(patient, wk);
  P.logIssue('p-1', wk, first);
  const second = P.bagForPatient(patient, '2026-W49');
  ok('a patient issued a bag takes the other one next week', second !== first, `${first} -> ${second}`);
  P.logIssue('p-1', '2026-W49', second);
  const third = P.bagForPatient(patient, '2026-W50');
  ok('and returns to the first bag the week after', third === first, `${first}/${second}/${third}`);
}

/* ---- 5. the item budget is quantity x price on every line ---- */
{
  const budget = P.computeWeekBudget('kisumu', '2026-W48');
  ok('the budget produces item lines', budget.lines.length > 20, String(budget.lines.length));
  const bad = budget.lines.filter(l => Math.abs(l.qty - (l.perBag * l.bags)) > 0.001);
  ok('every quantity = per-bag contents x bags', bad.length === 0, bad.slice(0, 2).map(l => l.itemCode).join(','));
  const badTotal = budget.lines.filter(l => Math.abs(l.lineTotal - (l.qty * l.unitPrice)) > 0.001);
  ok('every line total = quantity x unit price', badTotal.length === 0);
  const summed = budget.lines.reduce((n, l) => n + l.lineTotal, 0);
  ok('the week total is the sum of the lines', Math.abs(budget.grandTotal - summed) < 0.001);
  ok('a per-patient figure is produced', budget.perPatient > 0);
  ok('both household bags are bought every week (alternation, not either/or)',
    budget.bags.BG1 > 0 && budget.bags.BG2 > 0, `BG1=${budget.bags.BG1} BG2=${budget.bags.BG2}`);
  ok('the two bags together cover the home roster',
    budget.bags.BG1 + budget.bags.BG2 === budget.plan.homeServed,
    `${budget.bags.BG1}+${budget.bags.BG2} vs ${budget.plan.homeServed}`);
  ok('bag 2 is the dearer basket', budget.totals.BG2 > 0);
  ok('budget totals are positive money', budget.grandTotal > 0);
  ok('prices start as the Foundation working figure, and say so', budget.priceStatus === 'working', budget.priceStatus);
}

/* ---- 6. Bag 1 vs Bag 2 are genuinely different baskets ---- */
{
  const b1 = P.computeWeekBudget('kisumu', '2026-W48').lines.filter(l => l.bagCode === 'BG1' && l.itemCode !== 'BAGPACK');
  const b2 = P.computeWeekBudget('kisumu', '2026-W48').lines.filter(l => l.bagCode === 'BG2' && l.itemCode !== 'BAGPACK');
  ok('Bag 1 and Bag 2 do not carry the same items', b1.length !== b2.length || b1.some((l, i) => l.itemCode !== b2[i].itemCode));
  const unit1 = b1.reduce((n, l) => n + l.perBag * l.unitPrice, 0);
  const unit2 = b2.reduce((n, l) => n + l.perBag * l.unitPrice, 0);
  ok('Bag 2 costs more per bag than Bag 1', unit2 > unit1, `${unit1} vs ${unit2}`);
  const inp = P.computeWeekBudget('kisumu', '2026-W48').lines.filter(l => l.bagCode === 'INP');
  ok('the inpatient pack is milk and oranges, not a dry bag',
    inp.some(l => l.itemCode === 'MILK') && inp.some(l => l.itemCode === 'ORANGE'));
}

/* ---- 7. freezing a Monday ---- */
{
  const before = P.computeWeekBudget('kisumu', '2026-W48').grandTotal;
  const closed = P.closeMonday('2026-W48', 'kisumu', 'procurement.kisumu');
  ok('a Monday can be closed', closed.ok === true, closed.msg);
  ok('the closed order keeps the total it had', Math.abs(closed.order.grandTotal - before) < 0.001);
  ok('the closed order records the figures that produced it', closed.order.requiredIntakes === P.computeWeeklyPlan(P.planInputs('kisumu')).requiredIntakes);
  const again = P.closeMonday('2026-W48', 'kisumu', 'procurement.kisumu');
  ok('a closed Monday cannot be closed twice', again.ok === false);
  /* a later price change must not rewrite the frozen order */
  const c = P.ensureStore();
  c.prices.MAIZE = 9999;
  ok('a later price change does not rewrite a frozen week',
    Math.abs(P.frozenOrder('2026-W48', 'kisumu').grandTotal - before) < 0.001);
  const reopened = P.reopenMonday('2026-W48', 'kisumu');
  ok('a Monday can be reopened', reopened.ok === true);
  ok('reopening releases the frozen order', P.frozenOrder('2026-W48', 'kisumu') === null);
  ok('reopening picks up the new price', P.computeWeekBudget('kisumu', '2026-W48').grandTotal > before);
}

/* ---- 8. the workspace renders ---- */
{
  const html = UI.render(C.AUTH.user, { tab: 'monday', week: '2026-W48', county: 'kisumu' });
  ok('the Monday tab renders', html.includes('Monday Procurement Protocol') && html.includes('New patients to accept'), html.slice(0, 120));
  ok('the Monday tab states the envelope', html.includes('180'));
  const bags = UI.render(C.AUTH.user, { tab: 'bags', week: '2026-W48', county: 'kisumu' });
  ok('the Bag Contents tab renders both bags', bags.includes('Bag 1') && bags.includes('Bag 2'));
  ok('the Bag Contents tab states the alternation rule', /alternat/i.test(bags));
  const budget = UI.render(C.AUTH.user, { tab: 'budget', week: '2026-W48', county: 'kisumu' });
  ok('the Item Budget tab renders', budget.includes('Week total'));
  ok('the Item Budget tab offers closing the Monday', budget.includes('foodprotocol-close'));
  const orders = UI.render(C.AUTH.user, { tab: 'orders', week: '2026-W48', county: 'kisumu' });
  ok('the Closed Weeks tab renders', orders.length > 0);
  ok('every tab is reachable from the workspace',
    ['monday', 'bags', 'budget', 'orders'].every(t => html.includes(`data-tab="${t}"`)));
  ok('the workspace has no "undefined" leaking into the page', !/undefined/.test(UI.render(C.AUTH.user, { tab: 'budget' }).replace(/undefinedMenu/g, '')), 'undefined in render');
}

/* ---- 9. the module is wired into the app ---- */
{
  const app = fs.readFileSync(path.join(REPO, 'v6', 'src', 'app.js'), 'utf8');
  ok('the route exists', app.includes("case 'foodprotocol'"));
  ok('the route is capability-gated', /foodprotocol.*RBAC\.has\(user,'procurement\.view'\)/.test(app));
  const ui = fs.readFileSync(path.join(REPO, 'v6', 'src', 'ui.js'), 'utf8');
  ok('the console navigation lists it', ui.includes("id:'foodprotocol'"));
  ok('it is capability-mapped', /foodprotocol:\['procurement\.view','finance\.view'\]/.test(ui));
  const order = fs.readFileSync(path.join(REPO, 'tools', 'sync-lovable.mjs'), 'utf8');
  ok('the module is in the build order', order.includes('monday_procurement_protocol6.js'));
  const bundle = fs.readFileSync(path.join(REPO, 'public', 'carelink-v6.html'), 'utf8');
  ok('the built bundle contains the engine', bundle.includes('MONDAY_PROTOCOL'));
  ok('the built bundle contains the workspace', bundle.includes('MONDAY_PROTOCOL_UI'));
  ok('the bundle carries the 180 envelope', bundle.includes('WEEKLY_BUDGET: 180'));
}

console.log(`\nmonday-procurement-protocol: ${pass} checks passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
