#!/usr/bin/env node
/* Optional local export of the runtime-generated synthetic package. The default
   destination is ignored; never publish it as a static or bundle asset. */
const fs=require('node:fs'), path=require('node:path');
(async()=>{
  const {generateReferenceManifest}=await import('../../api/synthetic-reference.mjs');
  const manifest=generateReferenceManifest();
  const out=path.resolve(__dirname,'../data/CareLink-Reference-Master-v6.6.json');
  fs.mkdirSync(path.dirname(out),{recursive:true});
  fs.writeFileSync(out,JSON.stringify(manifest));
  console.log(JSON.stringify({output:path.relative(process.cwd(),out),patients:manifest.counts.patients,sha256:manifest.digest}));
})().catch(error=>{console.error(error.message);process.exitCode=1});
