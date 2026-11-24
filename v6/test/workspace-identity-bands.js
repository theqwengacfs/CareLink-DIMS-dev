const assert=require('node:assert/strict'),fs=require('node:fs');
const {makeCtx}=require('./dom');const {run}=makeCtx();
run('DB.load();DB.seedDemo();');
const result=JSON.parse(run(`JSON.stringify(DB.db.users.map(user=>{
 AUTH.user=user;AUTH.mustChange=false;APPX.screen='app';APPX.view='home';
 const html=renderShell();
 return {role:user.roleId,identity:html.includes('class="np-account-name"'),name:html.includes(esc(user.name.replace(/^Demo - /,''))),hero:(html.match(/class="ws67-hero /g)||[]).length};
}))`));
for(const r of result){assert(r.identity,r.role);assert(r.name,r.role);assert.equal(r.hero,1,r.role);}
run(`AUTH.user={...DB.db.users[0],name:'<Fictional & account>'};APPX.screen='app';APPX.view='home';`);
const html=run('renderShell()');assert(html.includes('&lt;Fictional &amp; account&gt;'));assert(!html.includes('<Fictional & account>'));
const css=fs.readFileSync('v6/src/entry_theme.css','utf8').split('/* Coordinated identity bands:')[1];
assert(css.includes('var(--console-hero-1'));assert(css.includes('var(--console-hero-2'));assert(css.includes('var(--console-hero-3'));
assert(css.includes('[data-wt="foundation"]'));assert(css.includes('.ws67-qcard:not(.is-alert)'));assert(css.includes(':focus-visible'));assert(css.includes('white-space:normal'));
console.log('Workspace identity bands passed: '+result.length+' account/role renders, one hero, escaped identity, scoped palette, alert exclusions and wrapping.');
