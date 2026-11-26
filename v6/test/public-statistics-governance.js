/* ============================================================================
   public-statistics-governance.js — the public page may only print figures the
   server can defend.

   The Foundation asked for the public statistics to come from the central
   database rather than from a marketing page (B5), and in the same breath asked
   for the Media & Information Governance rules to hold. Those two together mean
   the endpoint has to do four things, and all four are asserted here against the
   real handler:

     1. compute from the register, never from a constant typed into a template;
     2. expose only an allow-list of aggregates - no record, name or identifier
        can be reached through it;
     3. suppress any figure backed by fewer than five people;
     4. mark every figure as reviewable, and refuse to call an unreviewed figure
        publishable, so a page cannot print it by accident.

   The endpoint is public by design, so the last check in this suite is the one
   that matters most: an unauthenticated caller gets aggregates and nothing else.
   ============================================================================ */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeKv, installKvFetch, makeBrowser, loadHandler } = require('./api-host-harness.cjs');

process.env.KV_REST_API_URL = 'https://kv-carelink.test';
process.env.KV_REST_API_TOKEN = 'statistics-test-token';
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

let passed = 0;
function ok(name, condition, detail) {
  assert.ok(condition, name + (detail === undefined ? '' : ` — ${detail}`));
  passed++;
  console.log(`  ok  ${name}`);
}

const API = fs.readFileSync(path.join(__dirname, '..', '..', 'api', 'index.js'), 'utf8');
const PUBLIC_IDS = ['p-1', 'p-2', 'p-3', 'p-4', 'p-5', 'p-6', 'p-7'];

(async () => {
  const kv = makeKv();
  installKvFetch(kv);
  const handler = await loadHandler();
  const br = makeBrowser(handler);

  /* A synthetic register: seven discharged-healthy patients, a few visits this
     year, two counties. Nothing here is real patient data. */
  const year = new Date().toISOString().slice(0, 4);
  const seed = {
    meta: { schema: 6 },
    settings: { onboarded: true },
    users: [],
    patients: PUBLIC_IDS.map((id, i) => ({
      id, name: `Synthetic public-stat patient ${i + 1}`, countyId: i < 5 ? 'kisumu' : 'homabay',
      areaId: `area-${(i % 3) + 1}`, status: i < 6 ? 'discharged' : 'active', outcome: 'healthy',
    })),
    visits: Array.from({ length: 8 }, (_, i) => ({ id: `v-${i}`, date: `${year}-02-0${(i % 8) + 1}`, patientId: PUBLIC_IDS[i % PUBLIC_IDS.length] })),
  };

  const empty = await br.fetch('/api/public/statistics');
  ok('the public statistics endpoint answers without a session', empty.status === 200, String(empty.status));
  const emptyBody = await empty.json();
  ok('and it says where the figures come from',
    /central CareLink database/i.test(String(emptyBody.basis)), String(emptyBody.basis));
  ok('it names the suppression floor it is applying', emptyBody.suppressionFloor === 5, String(emptyBody.suppressionFloor));
  ok('an empty installation publishes no invented number',
    Object.values(emptyBody.figures).every((f) => f.value === 0 || f.value === null),
    JSON.stringify(Object.fromEntries(Object.entries(emptyBody.figures).map(([k, v]) => [k, v.value]))));

  /* Put a synthetic register behind the endpoint through the setup route, which is
     the same path a real installation uses, then read it back. */
  const setup = await br.fetch('/api/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ admin: { username: 'chief.admin', password: 'Kx9!vQ2#mTz7Lp' }, db: seed }),
  });
  if (setup.status !== 200) {
    /* Some installations refuse setup once commissioned; the fixture starts empty,
       so a refusal here is a real signal rather than something to work around. */
    ok('the synthetic register could be installed for the check', false, JSON.stringify(await setup.json()).slice(0, 200));
  }

  const filled = await (await br.fetch('/api/public/statistics')).json();
  const fig = filled.figures || {};
  ok('discharged-healthy is computed from the register, not typed in',
    fig.patientsDischargedHealthy && fig.patientsDischargedHealthy.value === 6, JSON.stringify(fig.patientsDischargedHealthy));
  ok('the one active patient is counted before suppression is applied (1 patient < floor of 5)',
    Boolean(fig.activeCaseload), JSON.stringify(fig.activeCaseload));
  ok('a figure backed by fewer than five people is withheld, not rounded',
    fig.activeCaseload.suppressed === true && fig.activeCaseload.value === null, JSON.stringify(fig.activeCaseload));
  ok('the withheld figure says why it was withheld',
    /fewer than 5 people/i.test(String(fig.activeCaseload.reason)), String(fig.activeCaseload.reason));
  ok('home visits are counted for the current programme year',
    fig.homeVisitsThisYear && fig.homeVisitsThisYear.value === 8, JSON.stringify(fig.homeVisitsThisYear));
  ok('counties served is an aggregate count, not a list',
    fig.countiesServed && fig.countiesServed.value === 2 && !Array.isArray(fig.countiesServed.value), JSON.stringify(fig.countiesServed));
  ok('no figure is marked publishable before the Chief has reviewed it',
    Object.values(fig).every((f) => f.publishable === false), JSON.stringify(Object.entries(fig).map(([k, v]) => [k, v.publishable])));
  ok('the response says plainly that unreviewed figures are not published',
    /not yet been reviewed/i.test(String(filled.note)), String(filled.note));

  /* A public endpoint must not become a way around the register's access rules. */
  const raw = JSON.stringify(filled);
  ok('no patient identifier appears in the public response',
    PUBLIC_IDS.every((id) => !raw.includes(id)), PUBLIC_IDS.filter((id) => raw.includes(id)).join(','));
  ok('no patient name appears in the public response', !/Synthetic public-stat patient/.test(raw));
  ok('no county- or area-level row appears, only totals',
    !/area-1|"kisumu"|"homabay"/.test(raw), raw.slice(0, 200));
  ok('the endpoint exposes an allow-list, not whatever collections exist',
    /patientsDischargedHealthy/.test(API) && /departmentsOperating/.test(API) && !/\.\.\.db\b/.test(API.slice(API.indexOf("route === 'public/statistics'"), API.indexOf("route === 'public/status'"))));

  /* The renderer must not print a figure the server has not cleared. */
  const views = fs.readFileSync(path.join(__dirname, '..', 'src', 'views_entry.js'), 'utf8');
  const portal = fs.readFileSync(path.join(__dirname, '..', 'src', 'portal_content.js'), 'utf8');
  ok('the public page reads its figures from the endpoint rather than from a constant',
    /public\/statistics/.test(portal) && /PORTAL_STATS_LIVE/.test(views), 'page does not call the endpoint');
  ok('a figure the server has not cleared for publication is never rendered',
    /if \(!f\.publishable\) continue;/.test(portal) && /if \(!f \|\| f\.value === null \|\| f\.suppressed\) continue;/.test(portal));
  ok('the page falls back to a clearly labelled cumulative total, not to silence',
    /Cumulative programme totals reported by the Foundation/.test(portal));
  ok('the cards say whether a number was counted or reported',
    /Counted from the central register/.test(views) && /reported by the Foundation/.test(portal));

  console.log(`public-statistics-governance: ${passed} checks passed`);
})().catch((e) => { console.error(e); process.exit(1); });
