#!/usr/bin/env python3
"""Build LOMAMO CareLink DIMS into one self-contained HTML file.

Everything (CSS, JS, logo) is inlined so the application runs from a USB
stick, an offline laptop or a sandboxed preview with no network access.
"""
import base64, pathlib, datetime, re, sys

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"
OUT = ROOT / "LOMAMO-CareLink-DIMS-v6.0.html"
OUT_PUBLIC = ROOT.parent / "public" / "carelink-v6.html"

CSS_ORDER = ["styles.css", "console51.css", "console6.css", "portal6.css", "audit6.css", "carelink63.css"]
JS_ORDER = ["data.js", "data6.js", "inventory_data.js", "core.js", "access_rules.js", "media6.js", "media_portal.js", "reports.js", "care.js", "ai.js", "charts.js",
            "forms.js", "pharmacy.js", "leave.js", "omaha.js", "schedule.js", "exportdocs.js", "dashboard.js", "files.js", "live.js", "themes.js",
            "ui.js", "navpane.js", "pager.js", "care6_flows.js",
            "views_entry.js", "views_patients.js", "views_ops.js", "views_admin.js",
            "views_care.js", "views_settings.js", "care_actions.js", "import.js", "sync6.js", "backup.js",
            "views_extra.js", "office_actions.js", "app.js",
            "pmi.js", "recognition.js", "workplace.js", "insight6.js", "indicators6.js", "hub6.js", "entry6.js",
            "org_teams.js", "household.js", "costing.js", "tb_dispensing.js", "master_registry.js", "master_analysis.js", "waiting_urgent.js", "portal_content.js",
            "bmi_clinical6.js", "discharge_hardcopy6.js", "monday_procurement6.js", "handover_partners6.js",
            "admin_workflows6.js", "dev_console6.js", "workflow_engine6.js", "visual_audit.js", "strategic_governance67.js", "role_consoles68.js"]

def read(p):
    return (SRC / p).read_text(encoding="utf-8")

def logo_data_uri():
    p = ROOT / "assets" / "lomamo-logo.png"
    b = p.read_bytes()
    return "data:image/png;base64," + base64.b64encode(b).decode("ascii")

def build():
    css = "\n".join(read(f) for f in CSS_ORDER)
    js = "\n".join(read(f) for f in JS_ORDER)
    logo = logo_data_uri()
    stamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0E234A">
<meta name="description" content="CareLink Operating System (CareLink C-DIMS v6.9.2) - LOMAMO Foundation Kenya Data & Information Management System">
<title>CareLink C-DIMS</title>
<link rel="icon" href="{logo}">
<style>
{css}
</style>
</head>
<body>
<div id="root">
  <noscript><div style="padding:40px;font-family:sans-serif">CareLink C-DIMS requires JavaScript. Enable JavaScript in this browser to continue.</div></noscript>
</div>
<script>
/* ===== Embedded assets ===== */
window.LOGO = "{logo}";
window.BUILD_STAMP = "{stamp}";
</script>
<script>
{js}
</script>
<!-- Build {stamp} · CareLink C-DIMS v6.9.2 (formerly LOMAMO C-DIMS) · LOMAMO Foundation Kenya -->
</body>
</html>
"""
    OUT.write_text(html, encoding="utf-8")
    OUT_PUBLIC.parent.mkdir(parents=True, exist_ok=True)
    OUT_PUBLIC.write_text(html, encoding="utf-8")
    kb = OUT.stat().st_size / 1024
    print(f"Built {OUT.name} + public/carelink-v6.html — {kb:,.1f} KB")
    return OUT

if __name__ == "__main__":
    out = build()
    print("Open this file in any modern browser. No server, no dependencies.")
