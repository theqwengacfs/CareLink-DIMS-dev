const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict');
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const user={id:'reviewer'}, patient={id:'sample-1',name:'<Sample>',code:'LOM-00001',nationalId:'123456',areaId:'test',status:'active',intake:'2026-01-01'};
let permission=true, merge=false;
const c={FORMS:{},ACTIONS:{},AUTH:{user},APPX:{params:{}},DB:{db:{patients:[patient]}},
 RBAC:{can:()=>({ok:permission}),has:(_,p)=>p==='pmi.merge'?merge:true},
 CARE_WORKFLOW:{canSee:()=>true},CARE_RULES:{classify:()=>({tone:'ok',label:'Returning'})},
 DISCHARGE_HARDCOPY:{watchlistSummaryCard:()=>'<div>Watchlist content</div>',watchlistBannerFor:()=>'<div>Matched advisory visible</div>'},
 repo:{patientList:()=>[patient]},PAT:{days:()=>10},nationalIdClean:x=>String(x||'').replace(/\D/g,''),daysBetween:()=>10,areaName:()=>'<Area>',esc,
 ic:()=>'<svg></svg>',pBadge:()=>'<span>Active</span>',badge:x=>esc(x),deniedPanel:()=>'<div>Denied</div>',emptyState:()=>'<div>No duplicates</div>'};
vm.createContext(c);vm.runInContext(fs.readFileSync('v6/src/pmi.js','utf8'),c);
const render=()=>vm.runInContext('renderRepeatCheck(AUTH.user)',c);
let html=render();
assert(html.includes('Ready to check'));assert(html.includes('for="return-query"'));assert(html.includes('aria-describedby="return-search-help"'));
assert(!html.includes('return-check__patient"'));assert(!/<details[^>]*\bopen\b/.test(html));assert(!html.includes('Duplicate identity review'));
c.APPX.params={q:'123456'};html=render();
assert(html.includes('Search results'));assert(html.includes('Matched advisory visible'));assert(html.includes('data-id="sample-1"'));
assert(html.includes('&lt;Sample&gt;'));assert(html.includes('&lt;Area&gt;'));assert(!html.includes('<Sample>'));
merge=true;html=render();assert(html.includes('Duplicate identity review'));assert(!/<details[^>]*\bopen\b/.test(html));
c.APPX.params={q:'not-in-register'};html=render();assert(html.includes('No previous record found'));assert(html.includes('Results only cover records you can access'));
permission=false;assert.equal(render(),'<div>Denied</div>');
console.log('Returning patient layout: empty, matched, no-match, advisory, permissions and escaping checks passed.');
