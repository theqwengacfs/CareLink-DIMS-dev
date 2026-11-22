/* Runtime generation only. Workers keep the 80+ MB evaluation estate out of
   the parent process and never write it to a file or a public/build directory. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const file=fileURLToPath(import.meta.url),root=path.resolve(path.dirname(file),'../..');
if(process.argv.includes('--worker')){
  const NativeDate=Date,clock=Number(process.env.SYNTHETIC_CLOCK);
  globalThis.Date=class extends NativeDate{
    constructor(...args){super(...(args.length?args:[clock]));}
    static now(){return clock;}
  };
  Math.random=()=>Number(process.env.SYNTHETIC_RANDOM);
  const {generateReferenceManifest}=await import('../../api/synthetic-reference.mjs');
  const seed=Number(process.env.SYNTHETIC_SEED),manifest=generateReferenceManifest({seed});
  const compressed=Buffer.from(manifest.chunks.join(''),'base64');
  const raw=zlib.brotliDecompressSync(compressed),payload=JSON.parse(raw),db=payload.db;
  assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),manifest.digest);
  assert.equal(crypto.createHash('sha256').update(compressed).digest('hex'),manifest.compressedDigest);
  assert.equal(db.patients.length,4000);assert.equal(manifest.quality.passed,true);
  assert.equal(db.meta.seed,seed);assert.equal(db.meta.synthetic,true);
  assert.equal(db.meta.anchor,'2026-11-22T00:00:00.000Z');
  assert.equal(new Set(db.patients.map(p=>p.nationalId)).size,4000);
  assert.equal(new Set(db.patients.map(p=>p.ccc)).size,4000);
  for(const patient of db.patients){
    assert.match(patient.phone,/^07001\d{5}$/);
    assert.match(patient.nationalId,/^9\d{7}$/);assert.match(patient.ccc,/^CCC\/9\d{5}$/);
  }
  for(const user of db.users){
    assert.match(user.phone,/^07003\d{5}$/);assert.match(user.email,/@lomamo\.example$/);
    assert.ok(user.unconfirmed || /^Synthetic Staff \d{3}$/.test(user.name));
    for(const key of ['hash','salt','password','digest','temporary','tempPassword']) assert.ok(!(key in user),'reference must not carry '+key);
  }
  for(const employee of db.employees){
    assert.match(employee.phone,/^07005\d{5}$/);assert.match(employee.email,/@lomamo\.example$/);
  }
  const structure=JSON.parse(fs.readFileSync(path.join(root,'api/official-structure.mjs'),'utf8').replace(/^[\s\S]*?export default /,'').replace(/;\s*$/,''));
  // Test exact source names without displaying staff identities in test output.
  for(const [i,seat] of structure.roster.entries()) if(!seat.unconfirmed){
    assert.ok(!raw.includes(Buffer.from(seat.name)),`actual named roster identity ${i} must not appear in a synthetic payload`);
  }
  let rows=0,contacts=0,emails=0;
  function walk(value,where='db'){
    if(Array.isArray(value)) for(const [i,row] of value.entries()){
      if(row && typeof row==='object' && !Array.isArray(row)){
        rows++;assert.equal(row.synthetic,true,where+'['+i+'] must be marked synthetic');
      }
      walk(row,where+'['+i+']');
    }else if(value && typeof value==='object') for(const [key,item] of Object.entries(value)){
      const next=where+'.'+key;
      if(typeof item==='string'){
        if(/phone|mobile|telephone|contact/i.test(key) && /^(?:0|\+?254)[17][\d ()-]{7,}$/.test(item)){
          contacts++;assert.match(item,/^0700[135]\d{5}$/,next);
        }
        for(const address of item.match(/[\w.+-]+@[\w-]+\.[A-Za-z]{2,}/g)||[]){
          emails++;assert.match(address,/@lomamo\.example$/,next);
        }
      }else walk(item,next);
    }
  }
  walk(db);assert.ok(rows>4000 && contacts>=4000 && emails>0);
  console.log(JSON.stringify({digest:manifest.digest,compressedDigest:manifest.compressedDigest,patients:4000,markedRows:rows,contacts,emails,rawBytes:manifest.rawBytes}));
}else{
  const settings=[
    {TZ:'Pacific/Honolulu',SYNTHETIC_CLOCK:'946684800000',SYNTHETIC_RANDOM:'0.0123',SYNTHETIC_SEED:'20261022'},
    {TZ:'Africa/Nairobi',SYNTHETIC_CLOCK:'2208988800000',SYNTHETIC_RANDOM:'0.9876',SYNTHETIC_SEED:'20261022'},
    {TZ:'Asia/Tokyo',SYNTHETIC_CLOCK:'1735689600000',SYNTHETIC_RANDOM:'0.4444',SYNTHETIC_SEED:'20261023'},
  ];
  const results=settings.map(env=>{
    const result=spawnSync(process.execPath,['--max-old-space-size=1400',file,'--worker'],{cwd:root,env:{...process.env,...env},encoding:'utf8',timeout:90000,maxBuffer:1024*1024});
    assert.equal(result.status,0,result.stderr||String(result.error||result.signal));
    return JSON.parse(result.stdout.trim());
  });
  assert.equal(results[0].digest,results[1].digest,'same seed/anchor must be independent of wall clock, timezone and Math.random');
  assert.equal(results[0].compressedDigest,results[1].compressedDigest);
  assert.notEqual(results[0].digest,results[2].digest,'a different seed must actually change generated records');
  assert.ok(!fs.existsSync(path.join(root,'public/master/CareLink-Reference-Master-v6.6.json')));
  const bundledFiles=fs.readdirSync(path.join(root,'public'));
  assert.ok(!bundledFiles.some(name=>/reference.*\.json$/i.test(name)));
  for(const name of ['public/carelink-v6.html','v6/LOMAMO-CareLink-DIMS-v6.0.html']){
    const bundle=fs.readFileSync(path.join(root,name),'utf8');
    assert.ok(!bundle.includes('"format":"carelink-reference-payload-v1"'),'no generated payload in '+name);
    assert.ok(Buffer.byteLength(bundle)<6*1024*1024,'bundle grew unexpectedly beyond the existing media/code budget');
  }
  console.log('synthetic: 4,000 patients; every nested row marked; exact reserved contact/ID bands; no real roster names or credential material; deterministic across clock/random/timezone changes; no static dataset');
  console.log(JSON.stringify(results[0]));
}
