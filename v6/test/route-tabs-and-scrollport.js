const assert=require('node:assert/strict');
const fs=require('node:fs');
const {makeCtx}=require('./dom');
const {run}=makeCtx({setTimeout:()=>0});
run(`DB.load();DB.seedDemo();AUTH.user=DB.db.users.find(u=>u.roleId==='finance');APPX.view='costing';APPX.params={tab:'area',q:''};globalThis.__draw='';render=()=>{__draw=COSTX.render(AUTH.user,APPX.params);};render();`);
for(const tab of ['overview','patient','county','disease','dept','bags','trend','standards','ledger','area']){
 run(`ACTIONS['cost-tab']({tab:${JSON.stringify(tab)}})`);
 assert.equal(run('COST_STATE.tab'),tab,'deep-link must not overwrite clicked '+tab);
 assert(run('__draw').includes(`aria-selected="true" data-act="cost-tab" data-tab="${tab}"`));
}
run(`COST_STATE.q='synthetic filter';ACTIONS['cost-reset']()`);assert.equal(run('COST_STATE.q'),'');
run(`ACTIONS.go({v:'costing',viewMode:'table'})`);assert.equal(run('COST_STATE.viewMode'),'table');
run(`ACTIONS.go({v:'costing',viewMode:'charts'})`);assert.equal(run('COST_STATE.viewMode'),'charts');
run(`ACTIONS['cost-report']()`);assert.equal(run('modalStack.length')>0,true,'report opens real modal');
run(`globalThis.__s={tab:'a'};globalThis.__p={tab:'b'};applyRouteState(__s,__p);__s.tab='c';applyRouteState(__s,__p)`);assert.equal(run('__s.tab'),'c');
run(`applyRouteState(__s,{tab:'b'})`);assert.equal(run('__s.tab'),'b','reentering a deep link reapplies defaults');
run(`globalThis.__contentScroll=[];globalThis.__content={scrollTop:50,getBoundingClientRect:()=>({top:100}),scrollTo:o=>__contentScroll.push(o.top),focus(){},setAttribute(){}};
 document.querySelector=s=>s==='#content'?__content:null;
 document.getElementById=id=>id==='workspaceView'?{getBoundingClientRect:()=>({top:450})}:null;
 globalThis.getComputedStyle=()=>({overflowY:'auto'});revealWorkspace('requests');`);
assert.deepEqual(JSON.parse(run('JSON.stringify(__contentScroll)')),[384]);
const css=fs.readFileSync('v6/src/entry_theme.css','utf8');
assert(css.includes('grid-template-rows:max-content minmax(0,1fr) !important;'));
assert(css.includes('grid-row:1 !important;position:static !important;'));
assert(css.includes('overflow-y:auto !important;overflow-x:hidden !important;box-sizing:border-box;'));
console.log('Route/tab regression: all 10 cost tabs survive deep links, reset/table toggle/report modal, route reentry and isolated workspace scrollport passed.');
