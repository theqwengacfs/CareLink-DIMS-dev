# LOMAMO LOMAMO C-DIMS — LOMAMO C-DIMS

**Data & Information Management System for LOMAMO Foundation Kenya** (Love Matters Most)
Kisumu & Homa Bay County Offices · version 6.1.0 · schema 6

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

In the explicitly offline/static file, sign in on the **Demo** tab, or use any
account with the password `LOMAMO2026`. The demonstration dataset is synthetic
and labelled `DEMO`: 3,333 patients, 59 accounts, 10 ministry areas, 18
departments. This local mode is not the hosted live installation.

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
full 3,333-patient synthetic reference package is deliberately separate because
its related visits, PDCA cycles and departmental records total roughly 70 MB of
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
   3,333-patient reference master** to download the JSON file. Keep it unchanged.
4. Click **Select file** and choose that downloaded JSON. Review the automated
   quality evidence, then click **Validate & upload full master**. Leave the PC
   online until every chunk and the final shared-KV commit have been confirmed.
5. Confirm that the register shows **3,333 patients**, the quality view has no
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
3,333-patient reference register is synthetic evaluation content with reserved
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
