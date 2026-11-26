const assert=require('node:assert/strict');
const {makeCtx}=require('./dom');
const {run}=makeCtx();
run('DB.load();DB.seedDemo(); globalThis.tokens={}; document.documentElement.style.setProperty=(k,v)=>{tokens[k]=v};');
const result=JSON.parse(run(`JSON.stringify((()=>{
 const users=DB.db.users;
 const signatures=users.map(u=>{
  const p=accountSignaturePalette(u,deptPaletteFor(u));
  return [p.c1,p.c2,p.c3].join('|');
 });
 const u=users[0];
 WTHEME.setStudio(u,'colorScheme','department');WTHEME.apply(u);
 const first=[tokens['--console-hero-1'],tokens['--console-hero-2'],tokens['--console-hero-3']];
 WTHEME.apply(u);
 const again=[tokens['--console-hero-1'],tokens['--console-hero-2'],tokens['--console-hero-3']];
 WTHEME.setStudio(u,'colorScheme','lake');WTHEME.apply(u);
 const choice=tokens['--console-hero-1'];
 const expected=WTHEME.safeFill(consoleSchemeColors('lake',deptPaletteFor(u))[0]);
 const minContrast=Math.min(...users.flatMap(user=>{
  const p=accountSignaturePalette(user,deptPaletteFor(user));
  const stops=[p.c1,p.c2,p.c3].map(c=>WTHEME.safeFill(c));
  return stops.concat([0.25,0.5,0.75].flatMap(t=>[WTC.mix(stops[0],stops[1],t),WTC.mix(stops[1],stops[2],t)])).map(c=>WTC.contrast(c,'#FFFFFF'));
 }));
 return {count:users.length,unique:new Set(signatures).size,first,again,choice,expected,minContrast};
})())`));
assert(result.count>20);assert.equal(result.unique,result.count,'synthetic accounts need distinct default signatures');
assert.deepEqual(result.first,result.again,'signature must remain stable');
assert.equal(result.choice,result.expected,'explicit scheme retains precedence');
assert(result.minContrast>=4.5,'white text against each gradient stop must meet 4.5:1');
console.log(`Account identity passed: ${result.count} synthetic accounts, stable signatures, explicit override and contrast-safe stops.`);
