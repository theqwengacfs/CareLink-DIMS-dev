/* Static audit: every data-act / data-form emitted by any view must have a handler. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const SRC=path.join(__dirname,'..','src');
const store=new Map();
const mk=()=>({style:{setProperty(){}},classList:{add(){},remove(){}},appendChild(){},remove(){},setAttribute(){},querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},innerHTML:'',value:'',dataset:{},closest:()=>null});
const ctx={console,localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
 Blob:class{constructor(a){this.size=String(a[0]||'').length}},URL:{createObjectURL:()=>'b',revokeObjectURL(){}},
 document:{addEventListener(){},querySelector:()=>null,querySelectorAll:()=>[],createElement:mk,body:{appendChild(){}},documentElement:{setAttribute(){},style:{setProperty(){}}}},
 window:{addEventListener(){},LOGO:'',scrollTo(){}},setTimeout,clearTimeout,setInterval:()=>0,AbortController,Date,Math,JSON,
 FormData:class{constructor(){}get(){return ''}},fetch:()=>Promise.reject(new Error('offline')),location:{hash:''},history:{replaceState(){}}
};
ctx.globalThis=ctx; vm.createContext(ctx);
for(const f of require('./modules'))
  vm.runInContext(fs.readFileSync(path.join(SRC,f),'utf8'),ctx,{filename:f});
const run=c=>vm.runInContext(c,ctx);
run('DB.load(); DB.seedDemo();');

const users=run('DB.db.users.map(u=>u.username)');
const emits=new Map(); // act -> [where]
/* Every destination the navigation model can produce, for any role, plus
   the drill-down screens that are reached by a button rather than a menu. */
const viewNames=[...new Set([
  ...run(`[...new Set(DB.db.users.flatMap(u=>navModel(u).flatMap(g=>g.items.map(i=>i.id))))]`),
  'home','patient','report','care-resident',
  /* record-detail screens, rendered below with a real record id */
  'form','careplan'
])];

for(const uname of users){
  run(`AUTH.logout(); AUTH.login('${uname}','LOMAMO2026');`);
  for(const v of viewNames){
    let html='';
    const detail = v==='form'? `(()=>{const r=FORMSX.records(AUTH.user)[0]; return r? contentFor('form',{id:r.id},AUTH.user):''})()`
      : v==='careplan'? `(()=>{const r=OMAHAS.plans(AUTH.user)[0]; return r? contentFor('careplan',{id:r.id},AUTH.user):''})()`
      : `contentFor('${v}', {}, AUTH.user)`;
    try{ html=run(detail); }catch(e){ html=''; }
    for(const m of html.matchAll(/data-act="([a-z0-9\-]+)"/g)){
      if(!emits.has(m[1])) emits.set(m[1],new Set());
      emits.get(m[1]).add(uname+':'+v);
    }
    for(const m of html.matchAll(/data-form="([a-z0-9\-]+)"/g)){
      if(!emits.has('FORM:'+m[1])) emits.set('FORM:'+m[1],new Set());
      emits.get('FORM:'+m[1]).add(uname+':'+v);
    }
  }
  for(const sec of run(`SETTINGS.sections(AUTH.user).map(s=>s.id)`)){
    let html=''; try{ html=run(`contentFor('settings',{section:'${sec}'},AUTH.user)`); }catch(e){}
    for(const m of html.matchAll(/data-act="([a-z0-9\-]+)"/g)){
      if(!emits.has(m[1])) emits.set(m[1],new Set()); emits.get(m[1]).add(uname+':settings:'+sec);
    }
    for(const m of html.matchAll(/data-form="([a-z0-9\-]+)"/g)){
      if(!emits.has('FORM:'+m[1])) emits.set('FORM:'+m[1],new Set()); emits.get('FORM:'+m[1]).add(uname+':settings:'+sec);
    }
  }
  // modals & patient views
  for(const [label, code] of [
    ['patient', `(()=>{const p=repo.patientList(AUTH.user)[0]; return p? ['overview','clinical','visits','pdca','hospital','documents','timeline'].map(t=>contentFor('patient',{id:p.id,tab:t},AUTH.user)).join(''):''})()`],
    ['care-resident', `(()=>{const r=(typeof CARE!=='undefined'&&RBAC.has(AUTH.user,'care.view'))?CARE.residents(AUTH.user)[0]:null; return r? contentFor('care-resident',{id:r.id},AUTH.user):''})()`],
    ['landing', `renderLanding()`],
    ['login', `renderLogin()`],
  ]){
    try{ const html=run(code); for(const m of html.matchAll(/data-act="([a-z0-9\-]+)"/g)){ if(!emits.has(m[1])) emits.set(m[1],new Set()); emits.get(m[1]).add(uname+':'+label);} }catch(e){}
  }
}
const acts=run('Object.keys(ACTIONS)');
const forms=run('Object.keys(FORMS)');
const missing=[...emits.entries()].filter(([k])=>k.startsWith('FORM:')? !forms.includes(k.slice(5)) : !acts.includes(k));
console.log('distinct data-act values emitted:', [...emits.keys()].filter(k=>!k.startsWith('FORM:')).length);
console.log('registered ACTIONS:', acts.length, '| registered FORMS:', forms.length);
if(missing.length){
  console.log('\nMISSING HANDLERS:');
  missing.forEach(([k,v])=>console.log('  ✗', k, '→ emitted by', [...v].slice(0,4).join(', ')));
  process.exitCode = 1;
} else console.log(`\nAll ${[...emits.keys()].length} emitted controls have handlers.`);
const unusedActs=acts.filter(a=>!emits.has(a));
console.log('\nnot emitted by a scannable view (modal-only or parameter-driven):', unusedActs.join(', ')||'none');
