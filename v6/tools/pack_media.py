#!/usr/bin/env python3
"""Optimise and bundle the 13 teamwork & inter-departmental photographs for
both offline single-file HTML delivery (v6/src/media6.js) and static Vite /
Lovable delivery (public/media/ & v6/assets/media/)."""
import base64
import io
import json
from pathlib import Path
from PIL import Image, ImageOps

SRC = Path("/tmp/arena-coding-uploads")
OUT_PUBLIC = Path("/home/user/CareLink-DIMS-dev/public/media")
OUT_V6 = Path("/home/user/CareLink-DIMS-dev/v6/assets/media")
OUT_JS = Path("/home/user/CareLink-DIMS-dev/v6/src/media6.js")

OUT_PUBLIC.mkdir(parents=True, exist_ok=True)
OUT_V6.mkdir(parents=True, exist_ok=True)

ITEMS = [
    ("analytics_screen", "vitaly-gariev-Y32qbykD69g-unsplash.jpg", 860, 78,
     "Clinical, M&E and field officers reviewing live case indicators together"),
    ("puzzle_hands", "alan-aprilio-EwVWnl4Z4Wo-unsplash.jpg", 860, 78,
     "Four departments interlocking around one shared household care plan"),
    ("united_hands", "krakenimages-Y5bvRlcCx8k-unsplash.jpg", 760, 76,
     "Cross-departmental covenant protecting households and preventing orphans"),
    ("boardroom_team", "mario-gogh-VBLHICVh-lI-unsplash.jpg", 820, 76,
     "Leadership, clinical and finance officers coordinating county operations"),
    ("field_table", "annie-spratt-MChSQHxGZrQ-unsplash.jpg", 760, 76,
     "Case managers and data officers reconciling weekly household follow-ups"),
    ("gears_table", "360_F_564967290_TGOGhstXUigAETybEQc7ufyMey79poqB.jpg", 656, 82,
     "Connected departmental workflows turning together without silos"),
    ("charts_overhead", "collaborative-teamwork-in-modern-office-diverse-professionals-working-together-on-laptops-sharing-ideas-and-data-photo.jpeg", 625, 82,
     "Multi-departmental review of weekly figures, budgets and regional trends"),
    ("roundtable_forms", "images (15).jpg", 512, 82,
     "Joint case review matching digitised records with field documentation"),
    ("puzzle_vector", "images (14).jpg", 554, 82,
     "Shared departmental knowledge, SOPs and cross-office library resources"),
    ("team_blocks", "images (13).jpg", 632, 82,
     "Mentorship, student research and public communication working in harmony"),
    ("gears_circle", "below-team-young-creative-multicultural-people-joining-gear-wheels-together-as-metaphor-effective-teamwork-unity-205184039.webp", 720, 78,
     "Staff recognition and shared accountability across every county office"),
    ("devices_table", "depositphotos_69408199-stock-photo-people-working-together.jpg", 600, 82,
     "Tablets, phones and office laptops synchronised to one central database"),
    ("hands_compact", "images (12).jpg", 420, 82,
     "Serving our neighbours in love across Kisumu and Homa Bay communities"),
]

uris = {}
meta = {}
total_bytes = 0

for key, fname, max_dim, qual, caption in ITEMS:
    src = SRC / fname
    im = Image.open(src)
    im = ImageOps.exif_transpose(im)
    if im.mode in ("RGBA", "LA", "P"):
        bg = Image.new("RGB", im.size, (255, 255, 255))
        rgb = im.convert("RGBA")
        bg.paste(rgb, mask=rgb.split()[3])
        im = bg
    else:
        im = im.convert("RGB")
    w, h = im.size
    if max(w, h) > max_dim:
        scale = max_dim / float(max(w, h))
        im = im.resize((int(round(w * scale)), int(round(h * scale))), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=qual, optimize=True, progressive=True)
    raw = buf.getvalue()
    total_bytes += len(raw)
    out_name = f"{key}.jpg"
    (OUT_PUBLIC / out_name).write_bytes(raw)
    (OUT_V6 / out_name).write_bytes(raw)
    uris[key] = "data:image/jpeg;base64," + base64.b64encode(raw).decode("ascii")
    meta[key] = {"caption": caption, "w": im.size[0], "h": im.size[1], "kb": round(len(raw) / 1024, 1)}
    print(f"  {key:20s} -> {im.size[0]:4d}x{im.size[1]:4d}  {len(raw)/1024:6.1f} KB")

js = f"""/* ============================================================
   media6.js - Embedded teamwork & departmental photography
   All 13 visual assets work offline in the standalone HTML file
   as well as in hosted office Wi-Fi and web deployments.
   ============================================================ */

const CARELINK_PHOTOS = {json.dumps(uris, indent=2)};

const CARELINK_PHOTO_META = {json.dumps(meta, indent=2)};

function carelinkPhoto(key){{
  return CARELINK_PHOTOS[key] || CARELINK_PHOTOS.analytics_screen || '';
}}

function teamBanner(){{
  /* All photos and photo captions inside authenticated consoles and modules
     have been permanently removed so they never interfere with page layout. */
  return '';
}}
"""
OUT_JS.write_text(js, encoding="utf-8")
print(f"Total raw JPEG bytes across all 13 photos: {total_bytes/1024:.1f} KB -> {OUT_JS}")
