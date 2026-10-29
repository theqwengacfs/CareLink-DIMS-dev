/* Admin Operations presentation layout, palette persistence and scoped-view regression. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const SRC = path.join(__dirname, '..', 'src');
const store = new Map();
const rootStyles = new Map(), rootAttrs = new Map();
const el = () => ({ style:{setProperty(){}}, classList:{add(){},remove(){}}, appendChild(){}, remove(){}, setAttribute(){}, querySelector(){return null}, querySelectorAll(){return []}, addEventListener(){}, innerHTML:'', value:'', dataset:{}, closest(){return null;} });
const ctx = {
  console,
  localStorage:{ getItem:k=>store.get(k) ?? null, setItem:(k,v)=>store.set(k,v), removeItem:k=>store.delete(k) },
  Blob:class{ constructor(a){this.size=String(a[0]||'').length;} },
  URL:{ createObjectURL:()=> 'blob:test', revokeObjectURL(){} },
  document:{ addEventListener(){}, querySelector:()=>null, querySelectorAll:()=>[], createElement:el,
    body:{appendChild(){},removeChild(){}}, documentElement:{setAttribute:(k,v)=>rootAttrs.set(k,v),style:{setProperty:(k,v)=>rootStyles.set(k,v)}} },
  window:{ addEventListener(){}, LOGO:'', scrollTo(){} },
  setTimeout, clearTimeout, setInterval:()=>0, AbortController, Date, Math, JSON,
  FormData:class{constructor(){}}, fetch:()=>Promise.reject(new Error('offline')),
  location:{hash:''}, history:{replaceState(){}}
};
ctx.globalThis = ctx;
vm.createContext(ctx);
const run = code => vm.runInContext(code, ctx);
for (const file of require('./modules')) {
  vm.runInContext(fs.readFileSync(path.join(SRC, file), 'utf8'), ctx, { filename:file });
}
run(`DB.load(); DB.seedDemo(); AUTH.login('director','LOMAMO2026');`);

let pass = 0, fail = 0;
function ok(name, condition, detail = '') {
  if (condition) { pass++; console.log('PASS', name); }
  else { fail++; console.error('FAIL', name, detail); }
}

const html = run(`ADMIN_OPS.render(AUTH.user)`);
const css = fs.readFileSync(path.join(SRC, 'admin_ops6.css'), 'utf8');
ok('Workspace presents a dedicated finance, compliance and governance header',
  html.includes('Admin Operations &amp; Statutory') && html.includes('Finance, compliance and governance'));
ok('Four presentation palettes are selectable with an announced active state',
  ['Sapphire','Lake &amp; sky','Forest','Clay &amp; slate'].every(name => html.includes(name)) &&
  html.includes('aria-pressed="true"') && html.includes('aria-label="Operational display colour palette"'));
ok('Executive summary, compliance deadline and five concise work areas are present',
  html.includes('Recorded outflow') && html.includes('Statutory compliance') &&
  html.includes('Budget &amp; compliance') && html.includes('PAYG · transport · suppliers') &&
  html.includes('Annual governance'));
ok('Budget and category visualisations use the selected palette',
  html.includes('Indicative monthly category envelope') && html.includes('Disbursement composition') &&
  html.includes('select a palette above for presentation') && html.includes('--aops-c1:#1E3A8A') &&
  html.includes('not approved appropriations') && html.includes('Indicative estimate'));
ok('Responsive and keyboard-focus presentation styling is shipped',
  css.includes('@media(max-width:700px)') && css.includes('.aops-section-tab:focus-visible') &&
  css.includes('.aops-analysis-grid{grid-template-columns:1fr'));

run(`DB.save = () => {}; render = () => {}; ACTIONS['adminops-palette']({palette:'forest'});`);
ok('Palette selection persists as a per-user preference',
  run(`DB.db.personalPrefs[AUTH.user.id].adminOpsPalette`) === 'forest' &&
  run(`adminOpsPaletteFor(AUTH.user).id`) === 'forest');
ok('Invalid palette identifiers are safely ignored', (() => {
  run(`ACTIONS['adminops-palette']({palette:'<script>'})`);
  return run(`adminOpsPaletteFor(AUTH.user).id`) === 'forest';
})());
run(`['adminOpsPayg','adminOpsSuppliers','adminOpsTransport','adminOpsStatutory','adminOpsUtilities','adminOpsOpEx'].forEach(k => DB.db[k].forEach(r => r.amount = 0));`);
const zeroState = run(`ADMIN_OPS.render(AUTH.user)`);
ok('Zero-transaction state remains legible, budgeted and palette-aware',
  zeroState.includes('No outflow is recorded yet') && zeroState.includes('Zero-activity categories remain visible') &&
  zeroState.includes('--aops-c1:#14532D'));

const studio = run(`studioHtml(AUTH.user)`);
const schemeCss = fs.readFileSync(path.join(SRC, 'console_color_schemes.css'), 'utf8');
ok('Theme Studio offers eight visual console schemes with labelled six-colour swatches',
  ['Department signature','Heritage Sapphire','Lake &amp; sky','Forest &amp; fern','Orchid &amp; plum','Harvest &amp; clay','Graphite &amp; teal','Citrus &amp; ink'].every(name=>studio.includes(name)) &&
  (studio.match(/class=\"console-scheme-choice/g)||[]).length===8 && studio.includes('aria-pressed=\"true\"'));
run(`WTHEME.setStudio(AUTH.user,'colorScheme','orchid'); WTHEME.apply(AUTH.user);`);
ok('A selected scheme persists across rendering and retains Foundation White surfaces',
  run(`WTHEME.studio(AUTH.user).colorScheme`)==='orchid' && rootAttrs.get('data-colorscheme')==='orchid' &&
  rootAttrs.get('data-wt')==='foundation' && rootAttrs.get('data-wmode')==='light' &&
  rootStyles.get('--console-c1')==='#581C87' && rootStyles.get('--accent')==='#581C87');
ok('Palette accents reach quick metrics, KPI boxes, workspace tabs and role tabs without recolouring warning cards',
  schemeCss.includes('.ws67-qcard:not(.is-alert)') && schemeCss.includes('.grid>.kpi:not(.ok):not(.warn):not(.crit):not(.info)') &&
  schemeCss.includes('.tabs .tab:not(.active)') && schemeCss.includes('.ctx-rtab.on'));
ok('Finance work-area tabs use category palette accents while keeping status colours separate',
  schemeCss.includes('.aops-section-tab:not(.is-current):nth-child(5n+1) .aops-section-index') &&
  schemeCss.includes('--aops-tab-accent') && schemeCss.includes('.aops-section-tab.is-current'));
const schemeIds = JSON.parse(run(`JSON.stringify(CONSOLE_COLOR_SCHEMES.map(s=>s.id))`));
const schemeContrast = schemeIds.map(id=>{
  run(`WTHEME.setStudio(AUTH.user,'colorScheme','${id}'); WTHEME.apply(AUTH.user);`);
  const surface = run(`WTHEME._active.t.surface`);
  const ratio = (a,b)=>run(`WTC.contrast('${a}','${b}')`);
  const minimum = Math.min(...Array.from({length:6},(_,i)=>ratio(rootStyles.get(`--console-c${i+1}`),surface)));
  const accent = ratio(rootStyles.get('--accent'),rootStyles.get('--accent-ink'));
  return {id,minimum,accent};
});
ok('Every scheme accent remains contrast-safe on the selected console surface',
  schemeContrast.length===8 && schemeContrast.every(s=>s.minimum>=4.59 && s.accent>=4.99),JSON.stringify(schemeContrast));
run(`WTHEME.apply(null)`);
ok('Public front door does not inherit signed-in console colour schemes',rootAttrs.get('data-colorscheme')==='public');

console.log(`\n${pass}/${pass + fail} CareLink workspace presentation checks passed`);
if (fail) process.exit(1);
