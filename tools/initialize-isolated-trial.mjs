#!/usr/bin/env node
/* Run once by the trial owner against a separate, explicitly configured trial.
   Never pass a secret in an argument or write credential packs into Git. */
import {open, realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import readline from 'node:readline';
import {Writable} from 'node:stream';

const usage = 'Usage: node tools/initialize-isolated-trial.mjs https://TRIAL-HOST /absolute/private/path/trial-credentials.json';
const [address,output,...extra] = process.argv.slice(2);
if (!address || !output || extra.length || !process.stdin.isTTY || !process.stdout.isTTY) {
  console.error(usage + '\nA private interactive terminal is required.'); process.exit(2);
}
let url;
try { url = new URL(address); } catch { console.error('Invalid trial URL.'); process.exit(2); }
const protectedHosts = new Set(['care-link-dims-dev-three.vercel.app','care-link-dims-dev.vercel.app','theqwengacfs.github.io']);
if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || protectedHosts.has(url.hostname)) {
  console.error('Use the HTTPS origin of the separate trial, not the current or former CareLink service.'); process.exit(2);
}
if (!path.isAbsolute(output)) { console.error('The private credential-pack path must be absolute.'); process.exit(2); }
const root = await realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
let parent;
try { parent = await realpath(path.dirname(output)); } catch { console.error('The output directory must already exist.'); process.exit(2); }
const target = path.join(parent,path.basename(output));
if (target === root || target.startsWith(root + path.sep)) {console.error('The credential pack must be outside the repository.');process.exit(2);}
let file;
try { file = await open(target,'wx',0o600); } catch {console.error('Cannot create a new private credential file; nothing was initialized.');process.exit(2);}
async function secretPrompt(){
  process.stdout.write('Trial setup secret (not echoed): ');
  const silent = new Writable({write(_chunk,_encoding,done){done();}});
  const rl = readline.createInterface({input:process.stdin,output:silent,terminal:true});
  return new Promise(resolve=>rl.question('',answer=>{rl.close();process.stdout.write('\n');resolve(answer);}));
}
try {
  const healthResponse = await fetch(new URL('/api/health',url),{redirect:'error',signal:AbortSignal.timeout(15000)});
  const health = await healthResponse.json();
  if (!healthResponse.ok || health.trialMode !== true || health.mode !== 'isolated-synthetic-trial' || health.host !== url.host || health.setup !== false) {
    throw Error('The host did not confirm an uninitialized isolated trial. No setup request was sent.');
  }
  const secret = await secretPrompt();
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(secret)) throw Error('Setup secret must be a 32-byte random base64url value. No setup request was sent.');
  console.log('Generating and saving the synthetic register; this can take time. Do not interrupt.');
  const response = await fetch(new URL('/api/trial/initialize',url),{
    method:'POST',redirect:'error',headers:{'x-carelink-trial-setup-secret':secret},signal:AbortSignal.timeout(180000)
  });
  const data = await response.json();
  if (!response.ok || data.ok !== true || data.trialMode !== true || data.counts?.patients !== 4000 || !Array.isArray(data.issued)) {
    throw Error(`Trial initialization was not confirmed (${data.code || response.status}). Check status before trying again.`);
  }
  await file.writeFile(JSON.stringify({classification:'PRIVATE: SYNTHETIC TRIAL ACCOUNTS ONLY',host:url.origin,createdAt:new Date().toISOString(),accounts:data.issued},null,2)+'\n');
  await file.sync();
  console.log(`Trial initialized with 4,000 synthetic patients and ${data.issued.length} accounts.`);
  console.log(`Credentials saved privately to ${target}; distribute each account individually through a trusted channel.`);
  console.log('The Chief must sign in first, approve trial browsers, and safely retain the Chief password. Never use real data.');
} catch (err) {
  console.error(`Initialization not confirmed: ${err.message}`);
  console.error(`The output file ${target} may be empty or incomplete. Do not retry blindly: the server may have saved the trial before a response was lost.`);
  process.exitCode=1;
} finally { await file.close(); }
