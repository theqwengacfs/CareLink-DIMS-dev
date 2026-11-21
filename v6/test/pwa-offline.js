/* PWA shell verification: app shell can be installed/offline; protected API data is never cached. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public', 'manifest.webmanifest'), 'utf8'));
const sw = fs.readFileSync(path.join(root, 'public', 'sw.js'), 'utf8');
const builder = fs.readFileSync(path.join(root, 'tools', 'sync-lovable.mjs'), 'utf8');
const assert = (ok, message) => { if (!ok) throw new Error(message); console.log('PASS', message); };
assert(manifest.display === 'standalone' && manifest.start_url === './carelink-v6.html', 'Manifest launches the standalone CareLink bundle');
assert(manifest.icons.some((i) => i.sizes === '192x192') && manifest.icons.some((i) => i.sizes === '512x512'), 'Install manifest declares both required PNG icon sizes');
for (const icon of manifest.icons) assert(fs.existsSync(path.join(root, 'public', icon.src.replace(/^\.\//, ''))), `Icon exists: ${icon.src}`);
assert(sw.includes("url.pathname.includes('/api/')") && sw.includes('request.headers.has(\'x-carelink-session\')'), 'Service worker bypasses API and authenticated requests without cache');
assert(sw.includes("request.mode === 'navigate'") && sw.includes('caches.match(APP_URL)'), 'Navigation can fall back to the cached application shell offline');
assert(builder.includes('rel="manifest"') && builder.includes("navigator.serviceWorker.register('./sw.js')") && builder.includes('beforeinstallprompt'), 'Standalone app links manifest, registers worker and provides install CTA');
console.log('PWA application-shell checks passed.');
