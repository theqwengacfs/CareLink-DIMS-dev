/* PWA shell verification: app shell can be installed/offline; protected API data is never cached. */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..', '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public', 'manifest.webmanifest'), 'utf8'));
const sw = fs.readFileSync(path.join(root, 'public', 'sw.js'), 'utf8');
const assert = (ok, message) => { if (!ok) throw new Error(message); console.log('PASS', message); };
assert(manifest.name === 'CareLink' && manifest.short_name === 'CareLink', 'Installed application is named CareLink');
assert(manifest.display === 'standalone' && manifest.start_url === './carelink-v6.html', 'Manifest launches the standalone CareLink bundle');
assert(manifest.icons.some((i) => i.sizes === '192x192') && manifest.icons.some((i) => i.sizes === '512x512'), 'Install manifest declares both required PNG icon sizes');
for (const icon of manifest.icons) assert(fs.existsSync(path.join(root, 'public', icon.src.replace(/^\.\//, ''))), `Icon exists: ${icon.src}`);
assert(sw.includes("url.pathname.includes('/api/')") && sw.includes('request.headers.has(\'x-carelink-session\')'), 'Service worker bypasses API and authenticated requests without cache');
assert(sw.includes("request.mode === 'navigate'") && sw.includes('caches.match(APP_URL)'), 'Navigation can fall back to the cached application shell offline');
// Both documented build paths must retain the same PWA shell. Ignore build time
// and platform line endings, but compare the actual generated application.
const bundlePath = path.join(root, 'public', 'carelink-v6.html');
const normalize = html => html.replace(/\r\n/g, '\n').replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/g, 'BUILD_TIME');
execFileSync('node', ['tools/sync-lovable.mjs'], { cwd: root });
const nodeBundle = fs.readFileSync(bundlePath, 'utf8');
execFileSync('python3', ['v6/build.py'], { cwd: root });
const pythonBundle = fs.readFileSync(bundlePath, 'utf8');
assert(normalize(nodeBundle) === normalize(pythonBundle), 'Node and Python builders generate the same app shell');
assert(pythonBundle.includes('rel="manifest"') && pythonBundle.includes("navigator.serviceWorker.register('./sw.js')") && pythonBundle.includes('beforeinstallprompt'), 'Both builders link the manifest, register the worker and provide the install CTA');
assert(fs.readFileSync(path.join(root, 'v6', 'LOMAMO-CareLink-DIMS-v6.0.html'), 'utf8') === pythonBundle, 'Python builder keeps offline and public bundles synchronized');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const source = fs.readFileSync(path.join(root, 'v6', 'src', 'data.js'), 'utf8');
const api = fs.readFileSync(path.join(root, 'api', 'index.js'), 'utf8');
const entry = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const releaseLog = fs.readFileSync(path.join(root, 'v6', 'src', 'dev_console6.js'), 'utf8');
assert(lock.version === version && lock.packages[''].version === version && source.includes(`version: '${version}'`) && api.includes(`version: '${version}'`), 'Package, application and API agree on the current version');
assert(nodeBundle.includes(`CareLink C-DIMS v${version}`) && entry.includes(`carelink-v6.html?v=${version}`) && releaseLog.includes(`tag:'v${version}'`), 'Bundle, entry URL and release history agree on the current version');
console.log('PWA application-shell checks passed.');
