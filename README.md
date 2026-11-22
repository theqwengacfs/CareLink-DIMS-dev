# LOMAMO LOMAMO C-DIMS — LOMAMO C-DIMS

**Data & Information Management System for LOMAMO Foundation Kenya** (Love Matters Most)
Kisumu & Homa Bay County Offices · version 6.9.6 · schema 6

One operating system for the whole Foundation: patient registration and the
assessment pipeline, home visits and PDCA follow-up, hospital coordination,
pharmacy and TB dispensing control, cost per patient, finance and procurement,
fleet, people and leave, media governance, M&E and reporting — with every record
scoped by county, ministry area and department, and every refusal audited.

Live site (GitHub Pages): <https://theqwengacfs.github.io/CareLink-DIMS-dev/>
That address opens `public/carelink-v6.html`, which is built from `v6/src/`.

---

## Run it

```bash
npm install
npm run dev          # Vite dev server on 0.0.0.0:5173, rebuilds the bundle on every edit in v6/src
npm run build        # type-check + production build (also rebuilds the bundle)
npm run test:all     # lint, acceptance, API security, and actual-master PC/tablet workflow tests
```

Open the single file directly, with no server at all:

```
v6/LOMAMO-CareLink-DIMS-v6.0.html
```

The offline file and the hosted service have separate installations. A fresh
installation offers first-run commissioning, where the chief administrator
chooses a setup password. Once an installation is commissioned, first-run setup
is locked; use the issued account or the sign-in recovery flow. Do not use a
shared demonstration password or reset an active database to regain access.

### Vercel online host (one shared source, mandatory KV)

The Vercel API uses **Vercel KV / Upstash Redis as its only online source of
truth**. Connect a KV database to the project and configure these environment
variables for Production (and for Preview when the preview API is used):

```text
KV_REST_API_URL=<your KV REST URL>
KV_REST_API_TOKEN=<your KV REST token>
```

The equivalent `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` variables
are also accepted. The API returns HTTP `503` with `code: "kv_required"` if they
are absent, and fails closed on KV read/write errors. It never substitutes
process memory or Vercel's ephemeral filesystem for a failed KV operation, and
a write is acknowledged only after KV accepts it.

Every PC, tablet and other hosted client opens the same Vercel URL and uses this
same KV-backed state and credential vault. First-run setup and global activation
are acknowledged by the browser only after the API accepts them and a fresh
health read confirms the shared state. Hosted sign-in pulls the shared document
before opening the console; a failed hosted login, setup, activation or password
change never falls back to a device-local account or demo register. Browser
storage is a cache for the online client, not a second installation.

Live first-run commissioning starts with an **empty production register**. The
full 4,000-patient synthetic reference package is deliberately separate because
its related visits, PDCA cycles and departmental records total roughly 80 MB of
JSON, exceeding Vercel's 4.5 MB Function request/response limit and Upstash's
10 MB free-tier request limit. After the four steps and before global
activation, the Chief opens **System → Master data import**, downloads
`master/CareLink-Reference-Master-v6.6.json`, and selects that same file for a
one-time, authenticated, chunked import. The server verifies SHA-256 digests,
every required collection and relationship, unique identifiers and all defined
completeness checks before committing. Live accounts, private passwords,
organisation settings and activation flags are preserved.

Large online states are gzip-compressed in KV and downloaded through bounded
collection pages, so a fresh PC or tablet can reconstruct the complete shared
record without an oversized Vercel response. The hosted wizard refuses an
oversized initial setup before it can claim success or leave a device-only
commissioned document behind. Rebuild the public master with
`npm run build:reference-master`; its source is the official synthetic seeder,
never a real patient workbook.

### PC setup → full master → tablets

1. On a PC, open the live Vercel URL and complete all four first-run steps once.
   Wait for the shared-online confirmation; do not treat a cached screen as a
   successful setup.
2. Sign in as **Chief / System Administrator** and complete the mandatory
   private-password change.
3. Open **System → Master data import**. Under step 1, click **Full
   4,000-patient reference master** to download the JSON file. Keep it unchanged.
4. Click **Select file** and choose that downloaded JSON. Review the automated
   quality evidence, then click **Validate & upload full master**. Leave the PC
   online until every chunk and the final shared-KV commit have been confirmed.
5. Confirm that the register shows **4,000 patients**, the quality view has no
   findings, and the import is recorded in the online audit trail.
6. Use **Global activation** to issue staff credentials. Give each tablet user
   their own credentials; every tablet opens the same Vercel URL and downloads
   the same paged online state. Demo and setup entry points remain locked after
   activation.

The reference package is synthetic evaluation content, not real patient data.
Its import is one-time and is refused after global activation. A real master
workbook continues through the separate governed row-import/reconciliation
workflow; it must never be published as a static file.

`POST /api/public/demo-bootstrap` is limited to a fresh, uncommissioned
evaluation installation. It is refused once live setup exists and permanently
after `globallyActivated`; the Landing, Sign-In and first-run setup UI use the
same server-provided activation/commissioning flags to remove demo controls.

### Rebuilding or rebooting from the Chief System Administrator account

Passwords are stored as one-way hashes, so re-issuing them is a deliberate,
audited operation rather than a lookup. The full procedure — what a rebuild
replaces, what it preserves, how to recover a pack you did not download, what
counts as a "reboot" instead, and the three-minute health check afterwards — is in
[`docs/REBUILD_AND_REBOOT_FROM_CHIEF_ADMIN.md`](docs/REBUILD_AND_REBOOT_FROM_CHIEF_ADMIN.md).
In short: **Development Console → Provisioning → Rebuild & reactivate** (Chief
password + type `REBUILD`), then download the confidential pack immediately;
**Recover recent pack** covers a lost download for 24 hours. Every issued account
signs in and works straight away — a personal password is optional.

### What happens when a tablet loses the network

A tablet is a view of the shared record, so it does not keep the whole register
in browser storage. What it *does* keep is work the host has not accepted yet:
a visit, a concern, a request typed while the connection dropped, the tab was
closed, or the session timed out. That work is written to the tablet's own
storage, the status chip reads **Held on this device** with a count, and it is
sent to the shared record before anything else the next time the same person
signs in on that tablet. It is never published under a colleague's name; if the
host refuses it, the refusal is shown plainly instead of being retried forever.
`v6/test/v6100-sync-outbox.js` covers these paths.

While the device has no network the status chip reads **Offline on this device**
and a quiet strip at the bottom of the screen says so too, so nobody has to
guess from a spinner. When the connection comes back the held work is replayed
at once rather than at the next poll. `v6/test/v6101-pwa-hardening.js` covers
the offline notice, the install button and the reload notice.

### Installing CareLink on a tablet or phone

CareLink installs as an application and then runs its own shell offline. On
Android/Chrome an **Install CareLink** button appears once the browser offers
the prompt; on iPhone or iPad use Share → *Add to Home Screen*. Four shortcuts
are offered on the installed icon: Home, Patients, Monday meeting and Report
centre. When a new build reaches a device that has the app open, a strip says a
newer version is ready and offers **Reload**; nothing reloads under a half-typed
form without being asked.

### The weekly planning page

The Monday meeting reads **Weekly Planning Indicators** (Report centre): patients
in programme, discharges, children rescued, the deceased, orphaned children,
food bags by the register's codes (Bag 1 / Bag 2 / Special) and by bag number,
mattresses, blankets, Bibles, hygiene packages, mosquito nets, home visits seen,
patients not found at home, weights taken, inpatient and outpatient activity,
and every ministry area split into villages and slums. Two rules are visible in
the page itself: every figure is counted from a record, and a household whose
decision was never recorded is reported as *not recorded* rather than counted as
one. Where the register cannot answer a question — the couple household, for
example, because Bag 1 is issued to normal and couple households alike — the
page says so instead of inventing a number.
`v6/test/v6102-weekly-indicators.js` covers it.

### What the demonstration register contains

The board-preview and reference register is fixed: **4,000 synthetic patients**,
ages 5–75, an even Kisumu / Homa Bay split, exactly **40%** in the day 60–80
review window, at least twelve recorded contacts each, and weights on a
three-weekly rhythm. The full specification, and how to check a running
installation against it, is in
[`docs/DEMO_REGISTER_SPECIFICATION.md`](docs/DEMO_REGISTER_SPECIFICATION.md).

## How the code is organised

| Layer | Files |
|---|---|
| Configuration & reference data | `v6/src/data.js`, `v6/src/data6.js`, `v6/src/inventory_data.js` |
| Security, storage, workflow, audit | `v6/src/core.js` |
| **Authority: level, domain, department** | `v6/src/access_rules.js` |
| Reporting & indicators | `v6/src/reports.js`, `v6/src/indicators6.js`, `v6/src/insight6.js` |
| **Cost per patient engine** | `v6/src/costing.js` |
| **TB dispensing control** | `v6/src/tb_dispensing.js` |
| **Ministry teams, visit days, Monday rule** | `v6/src/org_teams.js`, `v6/src/leave.js`, `v6/src/schedule.js` |
| **Master workbook mapping** | `v6/src/master_registry.js`, `v6/src/import.js` |
| **Master workbook analysis** (rows 152-160, both band schemes, slum/village ratio, baselines, programme year, source integrity) | `v6/src/master_analysis.js` |
| **Households & cross-account care chains** | `v6/src/household.js` |
| **Waiting list & urgent cases** | `v6/src/waiting_urgent.js` |
| **Public portal content** | `v6/src/portal_content.js`, `v6/src/views_entry.js` |
| Charts | `v6/src/charts.js` |
| Themes & visual audit | `v6/src/themes.js`, `v6/src/visual_audit.js` |
| Consoles | `v6/src/views_*.js`, `v6/src/hub6.js`, `v6/src/workplace.js`, `v6/src/care6_flows.js` |
| Shell, routing, actions | `v6/src/app.js`, `v6/src/ui.js`, `v6/src/navpane.js`, `v6/src/entry6.js` |
| Styles | `v6/src/styles.css`, `console51.css`, `console6.css`, `portal6.css`, `audit6.css` |
| Build | `tools/sync-lovable.mjs` (inlines CSS, JS, logo and photography into one HTML file) |
| Docs | `v6/docs/01`–`20` |

Edit the modules in `v6/src/`, never the generated `public/carelink-v6.html`.
`npm run dev` and `npm run build` regenerate both bundles automatically, and the
Vite plugin hot-reloads the preview when anything in `v6/src/` changes.

## Personal data

This repository is public. It contains **no real patient record**. The generated
4,000-patient reference register is synthetic evaluation content with reserved
contact details and no credential secrets. The Administration's master patient
workbook was studied, mapped field by field into the system
(`v6/docs/20_MASTER_WORKBOOK_MAPPING.md`) and then removed from the repository;
what remains is its structure, vocabulary, formulas and mapping. Real records are
imported on the office host through *System → Master data import*.

Photography in the public portal is programme imagery: no identifiable
beneficiary appears in it, because publishing a patient photograph requires
recorded consent under the LOMAMO Ethical Storytelling Policy.

## Documentation

* `v6/docs/01_ARCHITECTURE.md` — layers, data flow, storage, boot sequence, device targets
* `v6/docs/02_RBAC_MATRIX.md` — generated: roles, capabilities, levels, domains, departments
* `v6/docs/03_DATA_MODEL.md` … `v6/docs/18_PROMPT_EXECUTION_AUDIT.md`
* `v6/docs/19_V6.1_RELEASE.md` — the v6.1 release: what was asked, what was built, how it is proved
* `v6/docs/20_MASTER_WORKBOOK_MAPPING.md` — the master patient workbook, sheet by sheet
* `v6/docs/21_PROMPT_ADOPTION_AUDIT.md` — **every instruction from the previous session, line by line, with its evidence**
* `v6/docs/22_PURGE_RUNBOOK.md` — erasing personal data from Git history
* `LOVABLE.md` — co-development guide for Arena.ai / Lovable.ai / local VS Code

## Privacy tooling

```bash
python3 v6/tools/verify_no_patient_data.py     # prove no patient identity is in the repository
bash v6/tools/purge_patient_data.sh            # report what a history rewrite would erase
bash v6/tools/purge_patient_data.sh --rewrite  # rewrite local history (backup bundle first)
python3 v6/tools/pack_portal_media.py          # repack the public-portal photography
python3 v6/tools/gen_rbac.py                   # regenerate docs/02_RBAC_MATRIX.md from code
```
