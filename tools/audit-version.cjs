/* =====================================================================
   audit-version.cjs — one version number, everywhere, or fail.

   The version lived in eleven places and had drifted: the production entry
   page opened ?v=6.6.4, the dist iframe ?v=6.9.4, the service worker cached
   carelink-shell-v16, while the app itself was on 6.11.4. A user following the
   live link could be served an old shell by a cache mismatch, and nothing in
   the test suite noticed.

   This audit reads package.json (the number that ships) and then checks every
   place that quotes a version to the user or busts a cache with it:

     package.json + package-lock.json      the package itself
     v6/src/data.js                        APP.version, the value the UI shows
     v6/build.py, tools/sync-lovable.mjs   both builders' meta descriptions
     api/index.js                          the health endpoint and fallbacks
     index.html                            the entry page cache-buster
     public/index.html                     the production entry page
     src/App.tsx                           the dist iframe
     vite.config.ts                        the dist redirect stub
     v6/LOMAMO-*.html, public/carelink-v6.html  the built bundles
     v6/docs/BUILD_LOG.md                  the record

   Release history is exempt: dev_console6.js is SUPPOSED to list old versions.
   ===================================================================== */
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(REPO, p));

const version = JSON.parse(read('package.json')).version;
const esc = version.replace(/\./g, '\\.');
const failures = [];
let checked = 0;

function must(what, condition, detail) {
  checked++;
  if (!condition) failures.push(what + (detail ? ` — ${detail}` : ''));
}

/* ---- the package ---------------------------------------------------- */
must('package.json version is well formed', /^\d+\.\d+\.\d+$/.test(version), version);
const lock = JSON.parse(read('package-lock.json'));
must('package-lock.json agrees with package.json', lock.version === version, lock.version);

/* ---- the application ------------------------------------------------ */
const data = read('v6/src/data.js');
must('v6/src/data.js carries APP.version = ' + version,
  new RegExp(`version: '${esc}'`).test(data),
  (data.match(/version: '([\d.]+)'/) || [])[1]);

const api = read('api/index.js');
const apiVersions = [...api.matchAll(/version: '(\d+\.\d+\.\d+)'/g)].map((m) => m[1]);
must('api/index.js only ever reports ' + version,
  apiVersions.length > 0 && apiVersions.every((v) => v === version),
  [...new Set(apiVersions)].join(', '));

/* ---- both builders and the meta descriptions ------------------------ */
for (const file of ['v6/build.py', 'tools/sync-lovable.mjs']) {
  const src = read(file);
  const stale = [...src.matchAll(/(\d+\.\d+\.\d+)/g)].map((m) => m[1]).filter((v) => /^6\./.test(v) && v !== version);
  must(file + ' mentions no other 6.x version', stale.length === 0, [...new Set(stale)].join(', '));
}

/* ---- the entry points and cache-busters ----------------------------- */
const entry = read('index.html');
must('index.html cache-busts with ?v=' + version,
  entry.includes(`?v=${version}`) || entry.includes(`v=${version}`),
  (entry.match(/v=([\d.]+)/) || [])[1]);

must('public/index.html (the production entry) opens ?v=' + version,
  read('public/index.html').includes(`carelink-v6.html?v=${version}`),
  (read('public/index.html').match(/\?v=([\d.]+)/) || [])[1]);

must('src/App.tsx (the dist iframe) loads ?v=' + version,
  read('src/App.tsx').includes(`?v=${version}`),
  (read('src/App.tsx').match(/\?v=([\d.]+)/) || [])[1]);

must('vite.config.ts (the dist redirect stub) points at ?v=' + version,
  read('vite.config.ts').includes(`v=${version}`),
  (read('vite.config.ts').match(/v=(\d+\.\d+\.\d+)/) || [])[1]);

/* ---- the built bundles --------------------------------------------- */
for (const bundle of ['public/carelink-v6.html', 'v6/LOMAMO-CareLink-DIMS-v6.0.html']) {
  if (!exists(bundle)) { must(bundle + ' exists', false); continue; }
  const src = read(bundle);
  must(bundle + ' embeds APP.version = ' + version,
    new RegExp(`version: '${esc}'`).test(src) || src.includes(`v6.${version}`),
    'bundle is stale — run node tools/sync-lovable.mjs');
  must(bundle + ' has a ' + version + ' release-history entry',
    src.includes(`tag:'v${version}'`) || src.includes(`tag: 'v${version}'`));
}

/* ---- the record ----------------------------------------------------- */
if (exists('v6/docs/BUILD_LOG.md')) {
  must('BUILD_LOG.md names ' + version, read('v6/docs/BUILD_LOG.md').includes(version));
}

/* ---- the service worker must use a versioned cache ------------------ */
const sw = read('public/sw.js');
must('public/sw.js declares a versioned shell cache',
  /const CACHE = 'carelink-shell-v\d+';/.test(sw),
  (sw.match(/const CACHE = '([^']+)'/) || [])[1]);

/* ---- report --------------------------------------------------------- */
if (failures.length) {
  console.error(`\nversion audit FAILED — ${failures.length} of ${checked} checks\n`);
  for (const f of failures) console.error('  FAIL  ' + f);
  console.error('\nThe version number must be identical in every file above.\n');
  process.exit(1);
}
console.log(`version audit: ${checked} checks, all agree on ${version}\n`);
