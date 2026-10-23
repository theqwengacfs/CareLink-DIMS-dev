/* Minimal DOM good enough to exercise openModal / toast / render paths. */
function makeCtx(extra={}){
  const fs=require('fs'),vm=require('vm'),path=require('path');
  const SRC=path.join(__dirname,'..','src');
  const store=new Map();
  const nodes=[];
  const el=(tag='div')=>{
    const n={tagName:tag,style:{setProperty(){}},dataset:{},children:[],value:'',checked:false,
      className:'',classList:{add(){},remove(){},contains(){return false}},
      appendChild(c){this.children.push(c);nodes.push(c);return c},
      remove(){this.removed=true},setAttribute(){},getAttribute(){return null},
      addEventListener(){},focus(){},click(){},
      querySelector(){return null},querySelectorAll(){return[]},
      set innerHTML(v){this._html=v}, get innerHTML(){return this._html||''}};
    return n;
  };
  const root=el('div'); root.id='root';
  const ctx={console,localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
    Blob:class{constructor(a){this.size=String(a[0]||'').length}},URL:{createObjectURL:()=>'b',revokeObjectURL(){}},
    document:{addEventListener(){},querySelector(sel){ return sel==='#root'?root:(sel==='.toasts'?null:el()) },querySelectorAll(){return[]},
      createElement:el,body:{appendChild(c){nodes.push(c)},removeChild(){}},
      documentElement:{setAttribute(){},style:{setProperty(){}}}},
    window:{addEventListener(){},LOGO:'',scrollTo(){},print(){}},
    setTimeout:(f)=>{try{f&&f()}catch(e){throw e}},clearTimeout(){},setInterval:()=>0,
    AbortController,Date,Math,JSON,
    FormData:class{constructor(){}get(k){return (ctx.__form&&ctx.__form[k]!==undefined)?ctx.__form[k]:''}forEach(fn){Object.entries(ctx.__form||{}).forEach(([k,v])=>fn(v,k))}},fetch:()=>Promise.reject(new Error('offline')),
    location:{hash:''},history:{replaceState(){}},...extra};
  ctx.globalThis=ctx; vm.createContext(ctx);
  for(const f of require('./modules'))
    vm.runInContext(fs.readFileSync(path.join(SRC,f),'utf8'),ctx,{filename:f});
  return {run:c=>vm.runInContext(c,ctx),nodes,ctx};
}
module.exports={makeCtx};
