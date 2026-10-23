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
run(`DB.load(); DB.seedDemo(); AUTH.login('chief.admin','LOMAMO2026');`);

// CSV parser with quoted commas and embedded quotes
const csv=`Name,Area,Intake Date,Notes\n"Demo, A.","Nyalenda","2026-03-01","Said ""hello"", then left"\n`;
const parsed=run(`IMPORTER.parseCSV(${JSON.stringify(csv)})`);
const row=parsed.data[0];
const checks=[];
checks.push(['CSV quoted comma', row['Name']==='Demo, A.']);
checks.push(['CSV escaped quote', row['Notes']==='Said "hello", then left']);
checks.push(['CSV row count', parsed.data.length===1]);

// JSON engine package import
const pkg=JSON.parse(fs.readFileSync(path.join(__dirname,'..','examples','lomamo_master.json'),'utf8'));
const before=run(`DB.db.patients.length`);
run(`IMPORTER.reset(); IMPORTER.file={name:'lomamo_master.json'};
     IMPORTER.headers=${JSON.stringify(Object.keys(pkg.patients[0]))};
     IMPORTER.rows=${JSON.stringify(pkg.patients.map(p=>Object.fromEntries(Object.entries(p).map(([k,v])=>[k,v==null?'':String(v)]))))};
     IMPORTER.mapping=IMPORTER.detectMapping(IMPORTER.headers);
     IMPORTER.validate();`);
const res=run(`IMPORTER.result`);
checks.push(['JSON rows detected', res.total===3]);
checks.push(['JSON rows ready', res.ready===3]);
checks.push(['Ministry areas resolved', res.rows.every(r=>['nyalenda','ombeyi','makongeni'].includes(r.areaId))]);
run(`IMPORTER.commit();`);
const after=run(`DB.db.patients.length`);
checks.push(['Patients created', after-before===3]);
checks.push(['Import audited', run(`DB.db.audit.some(a=>a.action==='data.import')`)]);
checks.push(['Import record stored', run(`DB.db.imports.length===1`)]);
checks.push(['Imported records flagged for verification', run(`DB.db.patients.filter(p=>p.flags&&p.flags.includes('imported')).every(p=>p.docsVerified===false)`)]);
checks.push(['Reconciliation text produced', /Reconciliation summary/.test(run(`IMPORTER.reconciliation()`))]);

let fail=0;
checks.forEach(([n,ok])=>{ console.log((ok?'PASS':'FAIL')+'  '+n); if(!ok) fail++; });
console.log(`\n${checks.length-fail}/${checks.length} import checks passed`);
process.exit(fail?1:0);
