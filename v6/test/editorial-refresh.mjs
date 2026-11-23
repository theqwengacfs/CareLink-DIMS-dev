import assert from 'node:assert/strict';
import fs from 'node:fs';

const entry = fs.readFileSync('v6/src/entry6.js', 'utf8');
const css = fs.readFileSync('v6/src/entry_theme.css', 'utf8');
const landing = entry.slice(entry.indexOf('function renderLanding6()'), entry.indexOf('function renderArchitecture6()') > -1 ? entry.indexOf('function renderArchitecture6()') : entry.indexOf('function renderLogin6()'));
for (const action of ['goto-login', 'goto-onboard', 'login-recovery', 'goto-architecture', 'goto-public', 'login-request']) {
  assert.ok(landing.includes(`data-act="${action}"`), `entry retains ${action}`);
}
assert.ok(landing.includes("carelinkPhoto('lake_kisumu')"), 'lake hero uses bundled photo');
assert.ok(landing.includes('renderLandingWorkflow6()'), 'department workflow remains available');
assert.match(css, /html\[data-wt="foundation"\] \.shell\{/);
assert.match(css, /data-font="standard"/);
assert.match(css, /\.tabs \.tab/);
for (const path of ['public/carelink-v6.html', 'v6/LOMAMO-CareLink-DIMS-v6.0.html']) {
  const bundle = fs.readFileSync(path, 'utf8');
  assert.ok(bundle.includes('--landing-lake'), `${path} includes the editorial hero`);
  assert.ok(bundle.includes('Editorial CareLink refresh'), `${path} includes the refreshed styles`);
}
console.log('Editorial refresh: entry actions, theme scoping and bundles verified.');
