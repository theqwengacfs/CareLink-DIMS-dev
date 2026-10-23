# 10 · Deployment guide

## 1. What to hand over

| Artefact | Purpose |
|---|---|
| `LOMAMO-CareLink-DIMS-v5.0.html` | The complete application - one file, 1,001 KB, no dependencies |
| `tools/import_engine.py` | Offline workbook analysis (Python 3.9+, openpyxl) |
| `tools/make_master_template.py` | Generates the master workbook template |
| `examples/` | The template, a demonstration import package and its reconciliation report |
| `docs/` | Architecture, RBAC matrix, data model, workflows, indicators, security, decisions, test plan |
| `src/` + `build.py` | Source and reproducible build |

## 2. Three deployment options

### Option A — Single device (recommended for evaluation and small offices)
Copy the HTML file to a Windows laptop or tablet. Open it in Chrome or Edge. Create the Chief
System Administrator on first run. Back up to an encrypted USB volume or the approved cloud
destination from the Backup console, and keep an off-device copy.

*Suitable for:* training, pilots, one county office with a few users sharing a single workstation.

### Option B — County office server (recommended for production)
Run the same interface against a server-backed database on the office LAN:

1. PostgreSQL (or SQLite in WAL mode for a very small office).
2. Serve `src/` as static files behind HTTPS.
3. Replace the `Store` adapter with API calls; the RBAC predicate becomes the SQL `WHERE` clause.
4. Nightly encrypted backups to two destinations; monthly restore drill.

*Suitable for:* live operation with concurrent users in one office.

### Option C — Tablets with office reconciliation
Each caregiver uses the single-file application on their tablet for the day's field work, then
reconciles at the office. True multi-device sync is **not** implemented (decision B15). Do not
describe it as if it were.

### Option B - Office server (recommended for the real demonstration)

```
python3 server.py                # port 8000, binds all interfaces
python3 server.py --port 8080
CARELINK_DATA_DIR=D:\CareLink\data python3 server.py
```

The host computer becomes the system of record. `data/carelink.db` holds the database;
`data/revisions/` holds a gzipped copy of every superseded revision. Tablets and laptops open
`http://<host-ip>:8000/` and read and write through the server. The application header states the
connection state and the current revision at all times.

Requirements: the office Wi-Fi must allow the devices to reach each other, and TCP 8000 must be
allowed through the host firewall. No internet connection is used.

The Windows launcher does this in three steps:

1. picks the first free port among 8000, 8080, 8081 and 8090;
2. prints the address to type, including the host's LAN address;
3. offers to add a firewall rule named "CareLink DIMS (port 8000)" limited to the **private** and
   **domain** profiles. A public network therefore never exposes the port, and nothing is forwarded
   on the router, so the internet cannot reach it.

Option 3 of the launcher, *Check the network and firewall*, prints the rule, whether the server is
listening, and every address on the computer. If a tablet cannot connect, check in this order: same
network (guest Wi-Fi usually isolates devices), exact address, firewall rule present.

### Sessions and the idle window

The host holds sessions in memory only and ends one that has been idle for 60 seconds. It refuses
reads and writes alike, so an expired session cannot be used from a browser console or a saved link.
`CARELINK_IDLE_SECONDS` exists for supervised testing; changing it for production is an exception
requiring the approval named in the information-governance policy.

What the server deliberately does **not** do:

- It does not authenticate users itself. The session layer of the application governs access,
  and the server must stay on the office LAN, never exposed to the internet.
- It does not merge conflicting clinical records. A stale save receives a conflict, the person
  chooses, and the superseded revision is retained.
- It does not reach any external service. The one network call it makes is an optional
  connectivity test to a private model endpoint configured by an administrator.

## 3. Device requirements

| | Minimum | Recommended |
|---|---|---|
| Desktop | Windows 10, Chrome/Edge 110+, 4 GB RAM | Windows 11, 8 GB RAM, SSD |
| Tablet | Android 11, Chrome 110+, 3 GB RAM | Samsung Galaxy A11+ 5G as specified, or better |
| Screen | 1280×720 | 1920×1080 desktop; 720×1560 tablet |
| Storage | 200 MB for the app, documents and backups | 5 GB |
| Network | None required at runtime | LAN for backup destinations |

## 4. First-run checklist

1. Open the file. Choose **Begin setup** (not the demonstration dataset).
2. Create the Chief System Administrator with a strong passphrase (≥ 12 characters).
3. Confirm the organisational structure — Kisumu (7 areas), Homa Bay (3 areas pending verification).
4. Sign in. Open **Organisation** and resolve the Homa Bay warning before importing Homa Bay data.
5. Open **Roles & permissions** and review the twenty templates against the organogram.
6. Create the County Office Administrators (one per county), then have each create their staff
   through the approval workflow.
7. Open **Settings** and confirm: idle lock, failed-login threshold, Monday reporting, local AI endpoint.
8. Open **Backup & restore** and create a verified baseline backup before any real data is entered.
9. Run **Security self-test** and keep the result with the installation record.
10. Train staff on their own console only — never on a shared login.

## 5. Backups

| Setting | Recommendation |
|---|---|
| Schedule | Daily automatic + before every import or upgrade |
| Destinations | Encrypted local volume **and** one approved off-device destination |
| Verification | Recorded in the console; a backup is not "successful" merely because a file exists |
| Retention | 30 daily, 12 monthly, 7 annual — confirm with leadership |
| Restoration | Requires dual approval; pre-restore state preserved |
| Drills | One documented restore test per quarter |

A consumer file-synchronisation service is not an approved destination for clinical records.

## 6. Local AI (optional)

```bash
# On the office machine, once:
#   install Ollama, then:
ollama pull llama3.1        # or a smaller model for modest hardware
ollama serve                # listens on http://localhost:11434
```

In **Settings → Local AI assistant**, keep the provider as *Local only* and confirm the endpoint.
The assistant probes `/api/tags`; if unavailable it falls back to deterministic answers. No patient
data is sent to any remote service in either mode.

## 7. Training outline (half day)

| Session | Audience | Content |
|---|---|---|
| 1 (30 min) | All staff | Why access changed; signing in; the idle lock; what "audit" means for them |
| 2 (60 min) | Caregivers, coordinators | Assessment handover, visits, PDCA, hospital requests, uploading evidence |
| 3 (60 min) | Administrative Assistants | Digitising and verifying forms, duplicate decisions, Monday reports |
| 4 (45 min) | Medical Case Manager, liaison, nurses | Clinical review, assignment, service recording, receipts |
| 5 (45 min) | County Administrators, finance | Verification, enrolment approval, budget lifecycle, reconciliation, targets |
| 6 (30 min) | Media & governance | Consent, publication gates, policy versioning |
| 7 (30 min) | Leadership | Executive summary, county comparison, reading an integrity block |
| 8 (30 min) | Chief Administrator | Roles, org configuration, backups, import, security self-test |

## 8. Go-live sequence

```
Backup current state
   → Configure organisation and roles
   → Create County Office Administrators
   → Staff accounts through approval
   → Import the master workbook offline (preview → reconcile → commit)
   → Clinical verification of imported records
   → Verify Monday 08:00 reports generate correctly
   → Run Security self-test (must be 13/13)
   → Freeze the old system read-only
   → Parallel run: two weeks, both systems, reconcile the figures
   → Retire the old system; retain an archived copy for audit
```

## 9. Support and maintenance

| Task | Frequency | Owner |
|---|---|---|
| Access review (every account, every capability) | Quarterly | Chief System Administrator + Director |
| Restore drill | Quarterly | Chief System Administrator + Media & Governance |
| Security self-test | Monthly and after any permission change | Chief System Administrator |
| Indicator definition review | Annually | M&E |
| Policy review | Annually or on change | Media & Information Governance |
| Backup verification | Weekly | County Office Administrator |

## 9b. Account passwords on the host

By default the host accepts a session for any username, which is what makes the demonstration
easy and what makes it unsafe. When a credential exists, the host verifies it:

```
python3 tools\set_password.py --user mcm.kisumu      (Windows)
python3 tools/set_password.py --user mcm.kisumu       (macOS, Linux)
python3 tools/set_password.py --list
```

The tool writes a salted PBKDF2-SHA256 hash (260,000 iterations) into the same SQLite file,
prompts twice without echo, refuses a password under 12 characters and refuses the
well-known demonstration password. From then on `/api/session/start` refuses a session
without the password and locks the name out for five minutes after five failures.
`/api/health` reports `"auth": "server-verified"`. With no credential it reports `"demo"`.

To refuse unverified sign-in entirely, start the server with `CARELINK_ALLOW_UNVERIFIED=0`.
It will then refuse to start until at least one credential exists, and will answer
`503 no_credentials` to a host with none.

### Stored documents

Uploaded documents are kept in the same SQLite file, with a SHA-256 digest, a retention
class and the uploader. `CARELINK_MAX_FILE_BYTES` sets the per-file limit (8 MB by default).
A file is readable only through a live session; a document record whose upload failed is
marked as having no file rather than pretending otherwise.

## 10. Known limitations to disclose to users

- Restore execution, and true multi-user concurrency, require the server deployment.
- Native DOCX and XLSX export is implemented for reports, the patient register, the
  organisational registry, stock, coverage and field plans. Print-to-PDF and CSV remain.
- Browser XLSX parsing is intentionally avoided: the offline engine does it on-device.
- Multi-device offline sync is not implemented.
- The Homa Bay ministry-area list and the transport-fare form fields await LOMAMO inputs.


## 9. Transport security: what this build does and does not do

The office server speaks **HTTP over the local network** unless it is started with a
certificate:

```
python3 server.py --tls-cert certs/host.pem --tls-key certs/host.key
```

Both arguments are required; the server refuses to start with one and not the other, and it
will not load a protocol older than TLS 1.2. With them it prints `https://` addresses and
`/api/health` reports `"tls": true`. **No certificate chain has been tested in this build**;
load one and trace a tablet through the handshake before real data.

Without a certificate it is plain HTTP. That is a deliberate,
documented limitation for the demonstration and for a trusted office LAN:

- the database never leaves the host computer, and every request is same-origin;
- the application is served with a Content-Security-Policy that permits no external host, no frame
  and no third-party form post, plus `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff`;
- sessions are held in the host's memory only and expire after 60 seconds of inactivity;
- the server refuses to serve its own source, the data directory, dotfiles and unknown extensions,
  and refuses path traversal.

What it does **not** provide: encryption in transit. On a shared or untrusted network another device
could observe traffic. Before any real patient data is loaded, put the server behind the
organisation's HTTPS reverse proxy (for example Caddy or nginx with an internal certificate), or use
a private VLAN, and record the decision. A self-signed certificate is not a substitute: tablets will
warn, and staff will learn to click through warnings.

The honest statement for the demonstration is: *this build is for a trusted office network, with the
host as the only system of record, and no patient data leaves the building.*
