const assert=require('node:assert/strict');
const fs=require('node:fs');
const {makeCtx}=require('./dom');
const {run}=makeCtx();
run('DB.load();DB.seedDemo();AUTH.user=DB.db.users.find(u=>u.roleId==="coordinator");APPX.view="smartflow";APPX.screen="app";');
const shell=run('renderShell()');
assert(shell.includes('<span class="cb-os-tag">CareLink OS</span>'));
assert(shell.includes('<span class="tb-os-identity" aria-label="CareLink OS">CareLink OS</span>'));
const css=fs.readFileSync('v6/src/entry_theme.css','utf8');
const fixes=css.slice(css.indexOf('/* Screenshot regression:'));
assert(fixes.includes('color:#17324d !important;background:#fff !important;'));
assert(fixes.includes('position:relative !important;top:auto !important;'));
assert(fixes.includes('grid-template-rows:max-content max-content'));
assert(fixes.includes('background:transparent !important;border:0 !important;'));
assert(fixes.includes('.content .ctx-role-tabs{display:flex;flex-wrap:wrap;gap:10px;'));
console.log('Workspace header regression: coordinator identity, explicit top-right OS badge, badge contrast, flow-sized toolbar, quiet shortcut row and wrapping workspace tabs passed.');
for(const role of JSON.parse(run('JSON.stringify(ROLES.map(r=>r.id))'))){
 run(`AUTH.user=DB.db.users.find(u=>u.roleId===${JSON.stringify(role)})||{id:'header-test',roleId:${JSON.stringify(role)},name:'Synthetic header test',countyId:'kisumu',areaIds:[]};`);
 const html=run('renderShell()');
 const headerEnd=html.indexOf('</header>');
 const mainStart=html.indexOf('<main class="content"');
 const shortcuts=html.indexOf('class="cb-quick console-shortcuts');
 assert(headerEnd>0&&mainStart>headerEnd&&shortcuts>mainStart,role+': shortcuts must follow header inside workspace flow');
 assert(!html.slice(0,headerEnd).includes('class="cb-quick '),role+': no shortcut overflow in header');
}
console.log('All role headers keep shortcuts in normal workspace flow, outside the toolbar.');
