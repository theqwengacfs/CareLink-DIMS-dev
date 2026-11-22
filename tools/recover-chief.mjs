#!/usr/bin/env node
/* Owner-only interactive recovery. No password or database token in arguments,
   history, files, or HTTP endpoints. Run on a trusted computer. */
import readline from 'node:readline';
import { Writable } from 'node:stream';
import { ownerListChiefs, ownerRecoverChief } from '../api/index.js';

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('Run this tool interactively in a private terminal.');
  process.exit(1);
}
let muted = false;
const output = new Writable({ write(chunk, _encoding, callback) {
  if (!muted) process.stdout.write(chunk);
  callback();
} });
const rl = readline.createInterface({ input: process.stdin, output, terminal: true });
rl.on('SIGINT', () => { rl.close(); console.error('\nCancelled.'); process.exit(130); });
function ask(prompt, secret = false) {
  return new Promise(resolve => {
    process.stdout.write(prompt);
    muted = secret;
    rl.question('', answer => { muted = false; if (secret) process.stdout.write('\n'); resolve(answer); });
  });
}
try {
  console.log('CareLink owner recovery: this changes only one existing Chief account.');
  console.log('Use the REST URL and writable REST token for the SAME database used by your live site.');
  const url = (await ask('Upstash REST URL (https://...upstash.io): ')).trim();
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('Enter a valid HTTPS Upstash REST URL.'); }
  if (parsed.protocol !== 'https:' || !parsed.hostname.toLowerCase().endsWith('.upstash.io') || parsed.username || parsed.password || parsed.port || (parsed.pathname !== '/' && parsed.pathname !== '') || parsed.search || parsed.hash) {
    throw new Error('The URL must be the root HTTPS URL of an upstash.io database.');
  }
  const token = (await ask('Writable Upstash REST token (hidden): ', true)).trim();
  if (!token) throw new Error('A writable REST token is required.');
  // Prevent fallback to another configured database on this computer.
  for (const key of ['CARELINK_REDIS_URL','KV_URL','REDIS_URL','UPSTASH_REDIS_URL','STORAGE_URL',
    'KV_REST_API_URL','KV_REST_API_TOKEN','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN',
    'STORAGE_REST_API_URL','STORAGE_REST_API_TOKEN','KV_REST_API_READ_ONLY_TOKEN','UPSTASH_REDIS_REST_READ_ONLY_TOKEN']) delete process.env[key];
  process.env.CARELINK_KV_REST_API_URL = parsed.origin;
  process.env.CARELINK_KV_REST_API_TOKEN = token;
  const chiefs = await ownerListChiefs();
  if (!chiefs.length) throw new Error('No existing Chief accounts found in this database. Check that this is the live database.');
  // The names and usernames are shown only on the owner's computer.
  const safeDisplay = value => String(value).replace(/[\x00-\x1f\x7f-\x9f]/g, '').slice(0, 120);
  console.log('\nChief account(s) found:');
  chiefs.forEach((chief, i) => console.log(`  ${i + 1}. ${safeDisplay(chief.name)} — username: ${safeDisplay(chief.username)}`));
  let selected = 0;
  if (chiefs.length > 1) {
    const answer = (await ask('Enter the number of the Chief account to recover: ')).trim();
    if (!/^[1-9][0-9]*$/.test(answer) || Number(answer) > chiefs.length) throw new Error('Invalid selection. No changes were made.');
    selected = Number(answer) - 1;
  }
  const username = chiefs[selected].username;
  console.log(`Selected username: ${safeDisplay(username)}. Keep it to sign in.`);
  const password = await ask('Choose NEW Chief password (hidden): ', true);
  const repeat = await ask('Repeat NEW Chief password (hidden): ', true);
  if (password !== repeat) throw new Error('Passwords did not match. No changes were made.');
  const confirm = await ask('Type RECOVER to reset this Chief password: ');
  if (confirm !== 'RECOVER') throw new Error('Cancelled. No changes were made.');
  console.log('Saving securely. A large database may take several minutes; please keep this window open.');
  const result = await ownerRecoverChief({ username, password, onProgress: (done, total) => {
    console.log(`Uploaded ${done} of ${total} secure database parts.`);
  } });
  console.log(`Recovery saved for ${result.username}. Sign in with the new password you chose.`);
} catch (err) {
  console.error(`Recovery could not be confirmed: ${err.message}`);
  console.error('If the connection failed after a write, try signing in with the new password before rerunning.');
  process.exitCode = 1;
} finally { rl.close(); }
