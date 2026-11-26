#!/usr/bin/env python3
"""Package tracked source, never sandbox credentials, .git or runtime databases.
Internal office reference documents are excluded from redistribution.
Review recipient authorisation before sharing; this is not a public release kit.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile

ROOT=Path(__file__).resolve().parents[1]
commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
files=subprocess.check_output(['git','ls-files','-z'],cwd=ROOT).decode().split('\0')
output=ROOT/'deliverables'/f'CareLink-Developer-Handover-{commit[:8]}.zip'
output.parent.mkdir(exist_ok=True)
manifest=[]
excluded=[]
with zipfile.ZipFile(output,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
 for name in sorted(filter(None,files)):
  path=Path(name)
  if any(part in {'.git','node_modules','.vercel','.venv','dist','build'} for part in path.parts) or path.name.startswith('.env') or path.name in {'local.properties','.netrc','.git-credentials'} or path.suffix.lower() in {'.zip','.pdf','.doc','.docx','.xls','.xlsx','.csv'}:
   excluded.append(name);continue
  source=ROOT/path
  if not source.is_file():raise SystemExit(f'Missing tracked file: {name}')
  data=source.read_bytes()
  archive.writestr('CareLink-DIMS/'+name,data)
  manifest.append({'path':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
 archive.writestr('CareLink-DIMS/HANDOVER-MANIFEST.json',json.dumps({'commit':commit,'files':manifest,'excluded':excluded,'scope':'Tracked source snapshot, not Git history or production data backup'},indent=2))
 archive.writestr('CareLink-DIMS/START-HERE.txt',
  'CareLink developer source handover\n\nRead docs/DEVELOPER-SOURCE-GUIDE.md and docs/FORMS-AND-COORDINATION-AUDIT.md first.\n'
  'Internal office documents and tabular exports are excluded. Share source only with the authorised developer.\n'
  'No .git directory, hosting credentials, installed dependencies or production KV database is included.\n'
  'Install with npm ci; build with npm run build. The online API needs separately configured hosting/database access.\n'
  'The native-android directory is an incomplete native preview, not a claim of full web/native parity.\n')
with zipfile.ZipFile(output) as archive:
 bad=archive.testzip()
 if bad:raise SystemExit('Corrupt archive member: '+bad)
print(output.relative_to(ROOT))
print(f'{len(manifest)} tracked files; {output.stat().st_size/1024/1024:.2f} MiB; SHA256 {hashlib.sha256(output.read_bytes()).hexdigest()}')
