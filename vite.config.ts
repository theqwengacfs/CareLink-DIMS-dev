import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { buildCareLinkBundle } from './tools/sync-lovable.mjs';

/* A production build flattens public/ into the output root, so dist/ answers
   /carelink-v6.html but not /public/carelink-v6.html - and the site entry page
   redirects to the latter (which is where the file lives when the repository
   itself is served, as GitHub Pages does). Rather than pick one layout, the
   build writes a 300-byte redirect stub at the nested path too, so the same
   entry page works on GitHub Pages, in `vite dev`, and in a dist deploy on
   Lovable, Vercel or Netlify. */
function carelinkDistAliasPlugin() {
  return {
    name: 'carelink-dist-path-alias',
    apply: 'build' as const,
    closeBundle() {
      const distApp = path.resolve(__dirname, 'dist', 'carelink-v6.html');
      if (!fs.existsSync(distApp)) return;
      const nested = path.resolve(__dirname, 'dist', 'public');
      fs.mkdirSync(nested, { recursive: true });
      fs.writeFileSync(
        path.resolve(nested, 'carelink-v6.html'),
        `<!doctype html>\n<meta charset="utf-8">\n<script>location.replace('../carelink-v6.html'+(location.search||'?v=6.9.2')+(location.hash||''));</script>\n<meta http-equiv="refresh" content="0; url=../carelink-v6.html?v=6.9.2">\n<title>CareLink C-DIMS</title>\n<p>Opening CareLink C-DIMS\u2026 <a href="../carelink-v6.html?v=6.9.2">continue</a>.</p>\n`,
        'utf8',
      );
    },
  };
}

function carelinkLiveSyncPlugin() {
  return {
    name: 'carelink-v6-live-sync',
    buildStart() {
      buildCareLinkBundle();
    },
    configureServer(server) {
      const v6SrcDir = path.resolve(__dirname, 'v6/src');
      server.watcher.add(v6SrcDir);
      server.watcher.on('change', (file) => {
        if (file.startsWith(v6SrcDir)) {
          buildCareLinkBundle();
          server.ws.send({ type: 'full-reload' });
        }
      });
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || (!req.url.startsWith('/api/') && req.url !== '/api')) return next();
        try {
          const modPath = './api/index.js';
          const mod: { default: (rq: unknown, rs: unknown) => Promise<void> } = await import(/* @vite-ignore */ modPath);
          await mod.default(req, res);
        } catch (err) {
          next(err);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), carelinkLiveSyncPlugin(), carelinkDistAliasPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
});
