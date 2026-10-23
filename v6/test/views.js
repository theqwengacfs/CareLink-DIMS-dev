const fs=require('fs'),vm=require('vm'),path=require('path');
const SRC=path.join(__dirname,'..','src');
const store=new Map();
const mk=()=>({style:{setProperty(){}},classList:{add(){},remove(){}},appendChild(){},remove(){},setAttribute(){},querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},innerHTML:'',value:'',dataset:{},closest:()=>null});
const ctx={console,localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
 Blob:class{constructor(a){this.size=String(a[0]||'').length}},URL:{createObjectURL:()=>'b',revokeObjectURL(){}},
 document:{addEventListener(){},querySelector:()=>null,querySelectorAll:()=>[],createElement:mk,body:{appendChild(){}},documentElement:{setAttribute(){},style:{setProperty(){}}}},
 window:{addEventListener(){},LOGO:'data:image/png;base64,iVBORw0KGgo=',scrollTo(){}},
 setTimeout,clearTimeout,setInterval:()=>0,AbortController,Date,Math,JSON,FormData:class{constructor(){}get(){return ''}},
 fetch:()=>Promise.reject(new Error('offline')),location:{hash:''},history:{replaceState(){}}
};
ctx.globalThis=ctx; vm.createContext(ctx);
const files=require('./modules');
for(const f of files) vm.runInContext(fs.readFileSync(path.join(SRC,f),'utf8'),ctx,{filename:f});
const run=c=>vm.runInContext(c,ctx);
run(`DB.load(); DB.seedDemo();`);

const users=run(`DB.db.users.map(u=>u.username)`);
let ok=0, bad=[];
for(const uname of users){
  run(`AUTH.logout(); AUTH.login('${uname}','LOMAMO2026');`);
  const items=run(`navModel(AUTH.user).flatMap(g=>g.items.map(i=>i.id))`);
  const views=[...new Set([...items,'home','patient','report','import','form','careplan'])];
  for(const v of views){
    try{
      let params={};
      if(v==='patient'){ params={id: run(`repo.patientList(AUTH.user)[0]?.id||'x'`) }; }
      if(v==='report'){ params={type:'patient_figures'}; }
      if(v==='form'){ const r=run(`FORMSX.records(AUTH.user)[0]`); if(!r){ continue; } params={id:r.id}; }
      if(v==='careplan'){ const r=run(`OMAHAS.plans(AUTH.user)[0]`); if(!r){ continue; } params={id:r.id}; }
      const html=run(`contentFor('${v}', ${JSON.stringify(params)}, AUTH.user)`);
      if(typeof html!=='string'||html.length<20) throw new Error('empty output');
      if(/could not be rendered/.test(html)) throw new Error('render fallback triggered: '+(html.match(/mono xs muted[^>]*>([^<]*)/)||[])[1]);
      ok++;
    }catch(e){ bad.push([uname,v,e.message]); }
  }
  // every settings section the role is offered
  const secs = run(`SETTINGS.sections(AUTH.user).map(s=>s.id)`);
  for(const sec of secs){
    try{
      const html = run(`contentFor('settings',{section:'${sec}'},AUTH.user)`);
      if(typeof html!=='string'||html.length<50) throw new Error('empty');
      if(/could not be rendered/.test(html)) throw new Error('settings fallback: '+sec);
      ok++;
    }catch(e){ bad.push([uname,'settings:'+sec,e.message]); }
  }
  // every patient tab for the first visible patient
  const firstPid = run(`repo.patientList(AUTH.user)[0]?.id||null`);
  if(firstPid){
    for(const tab of ['overview','clinical','visits','pdca','hospital','documents','timeline']){
      try{
        const html = run(`contentFor('patient',{id:'${firstPid}',tab:'${tab}'},AUTH.user)`);
        if(typeof html!=='string'||html.length<20) throw new Error('empty');
        if(/could not be rendered/.test(html)) throw new Error('tab fallback: '+tab);
        ok++;
      }catch(e){ bad.push([uname,'patient:'+tab,e.message]); }
    }
  }
  // care centre drill-down where permitted
  if(run(`RBAC.has(AUTH.user,'care.view') && CARE.residents(AUTH.user).length>0`)){
    try{
      const rid = run(`CARE.residents(AUTH.user)[0].id`);
      const html = run(`contentFor('care-resident',{id:'${rid}'},AUTH.user)`);
      if(/could not be rendered/.test(html)) throw new Error('care resident fallback');
      ok++;
    }catch(e){ bad.push([uname,'care-resident',e.message]); }
  }
  // report documents
  for(const t of ['patient_figures','patient_days','expenditure','referral','executive','quality']){
    try{ const h=run(`buildReportDoc('${t}',{countyId:'all'},AUTH.user)`); if(typeof h!=='string'||h.length<100) throw new Error('short'); ok++; }
    catch(e){ bad.push([uname,'doc:'+t,e.message]); }
  }
}
console.log(`renders OK: ${ok}`);
if(bad.length){ console.log('FAILURES:'); bad.slice(0,40).forEach(b=>console.log(' ',b.join(' | '))); process.exit(1); }
console.log('All view renders completed without error.');
