const fs=require('fs'), vm=require('vm'), path=require('path');
const SRC=path.join(__dirname,'..','src');
const store=new Map();
const el=()=>({style:{},classList:{add(){},remove(){}},appendChild(){},remove(){},setAttribute(){},querySelector(){return null},querySelectorAll(){return[]},addEventListener(){},innerHTML:'',value:'',textContent:''});
const ctx={
  console,
  localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
  Blob:class{constructor(a){this.size=String(a[0]||'').length}},
  URL:{createObjectURL:()=>'blob:x',revokeObjectURL(){}},
  document:{addEventListener(){},querySelector(){return null},querySelectorAll(){return[]},createElement:el,body:{appendChild(){},removeChild(){}},documentElement:{setAttribute(){},style:{setProperty(){}}}},
  window:{addEventListener(){},LOGO:'',scrollTo(){}},
  setTimeout,clearTimeout,setInterval:()=>0,AbortController,Date,Math,JSON,
  fetch:()=>Promise.reject(new Error('offline')),
  location:{hash:''},history:{replaceState(){}}
};
ctx.globalThis=ctx;
vm.createContext(ctx);
for(const f of ['data.js','core.js','reports.js','ai.js']) vm.runInContext(fs.readFileSync(path.join(SRC,f),'utf8'),ctx,{filename:f});
const run=(code)=>vm.runInContext(code,ctx);
module.exports={ctx,run};
