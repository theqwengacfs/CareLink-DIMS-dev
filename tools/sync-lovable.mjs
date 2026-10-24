import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const V6_ROOT = path.join(REPO_ROOT, 'v6');
const SRC = path.join(V6_ROOT, 'src');
const OUT_V6 = path.join(V6_ROOT, 'LOMAMO-CareLink-DIMS-v6.0.html');
const OUT_PUBLIC = path.join(REPO_ROOT, 'public', 'carelink-v6.html');

export const CSS_ORDER = ['styles.css', 'console51.css', 'console6.css', 'portal6.css', 'audit6.css', 'carelink63.css'];
export const JS_ORDER = [
  'data.js', 'data6.js', 'inventory_data.js', 'core.js', 'access_rules.js', 'media6.js', 'media_portal.js', 'reports.js', 'care.js', 'ai.js', 'charts.js',
  'forms.js', 'pharmacy.js', 'leave.js', 'omaha.js', 'schedule.js', 'exportdocs.js', 'dashboard.js', 'files.js', 'live.js', 'themes.js',
  'ui.js', 'navpane.js', 'pager.js', 'care6_flows.js',
  'views_entry.js', 'views_patients.js', 'views_ops.js', 'views_admin.js',
  'views_care.js', 'views_settings.js', 'care_actions.js', 'import.js', 'sync6.js', 'backup.js',
  'views_extra.js', 'office_actions.js', 'app.js',
  'pmi.js', 'recognition.js', 'workplace.js', 'insight6.js', 'indicators6.js', 'hub6.js', 'entry6.js',
  'org_teams.js', 'household.js', 'costing.js', 'tb_dispensing.js', 'master_registry.js', 'master_analysis.js', 'waiting_urgent.js', 'portal_content.js',
  'bmi_clinical6.js', 'discharge_hardcopy6.js', 'monday_procurement6.js', 'handover_partners6.js',
  'admin_workflows6.js', 'dev_console6.js', 'workflow_engine6.js', 'visual_audit.js'
];

export function buildCareLinkBundle() {
  if (!fs.existsSync(SRC)) return false;
  const css = CSS_ORDER.map((f) => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n');
  const js = JS_ORDER.map((f) => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n');
  const logoBytes = fs.readFileSync(path.join(V6_ROOT, 'assets', 'lomamo-logo.png'));
  const logo = 'data:image/png;base64,' + logoBytes.toString('base64');
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#1F3864">
<meta name="description" content="CareLink Operating System (CareLink C-DIMS v6.6) - LOMAMO Foundation Kenya Data & Information Management System">
<title>CareLink C-DIMS</title>
<link rel="icon" href="${logo}">
<style>
${css}
</style>
</head>
<body>
<div id="root">
  <noscript><div style="padding:40px;font-family:sans-serif">CareLink C-DIMS requires JavaScript. Enable JavaScript in this browser to continue.</div></noscript>
</div>
<script>
/* ===== Embedded assets ===== */
window.LOGO = "${logo}";
window.BUILD_STAMP = "${stamp}";
</script>
<script>
${js}
</script>
<!-- Build ${stamp} · CareLink C-DIMS v6.6 (formerly LOMAMO C-DIMS) · LOMAMO Foundation Kenya -->
</body>
</html>
`;

  fs.mkdirSync(path.dirname(OUT_PUBLIC), { recursive: true });
  fs.writeFileSync(OUT_V6, html, 'utf8');
  fs.writeFileSync(OUT_PUBLIC, html, 'utf8');
  return { bytes: Buffer.byteLength(html), kb: (Buffer.byteLength(html) / 1024).toFixed(1) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const res = buildCareLinkBundle();
  if (res) {
    console.log(`[CareLink v6] Built & synced LOMAMO-CareLink-DIMS-v6.0.html + public/carelink-v6.html (${res.kb} KB)`);
  }
}
