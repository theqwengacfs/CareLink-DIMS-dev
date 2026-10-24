# Build record

| Field | Value |
|---|---|
| Application | CareLink DIMS v4.0.0 |
| Organisation | LOMAMO Foundation Kenya |
| Build date | 2026-10-18 |
| Database schema | 4 |
| Artefact | `LOMAMO-CareLink-DIMS-v5.0.html` (one file, no dependencies) |
| Source modules | 11 (`src/`) |
| Offline tooling | `tools/import_engine.py`, `tools/make_master_template.py`, `tools/gen_rbac.py` |
| Test suites | 11 suites · 191 assertions · 1,285 renders |
| Authorisation controls verified | 13 / 13 |
| Central database | `server.py` · SQLite · revision snapshots · 26/26 API checks |
| Audit pass | 2026-10-18 — 14 defects found and fixed (docs/12 §9) |

## Rebuild

```bash
python3 build.py            # inlines CSS, JS and the logo
python3 tools/gen_rbac.py   # regenerates docs/02 from the live role definitions
node test/smoke.js && node test/lint.js && node test/wiring.js && node test/modals.js
node test/workflows.js && node test/scoping.js && node test/ai_and_export.js
node test/dual.js && node test/import.js && node test/views.js
```

## Notes

- `dist/`, `build/` and similar directory names are excluded from workspace snapshots, so the built
  artefact is written to the project root by design.
- The logo is embedded as a base64 data URI; the application makes no external requests at runtime.
- The demonstration dataset is synthetic and is generated deterministically at load time by
  `seedDemo()` in `src/data.js`; it is never written into the source as production data.

## v5.0.0 — 19 October 2026

Modules added: `forms.js`, `pharmacy.js`, `leave.js`, `omaha.js`, `schedule.js`,
`exportdocs.js`, `dashboard.js`, `files.js`, `office_actions.js`. Module count 18 → 28.

- `build.py` and `test/modules.js` updated together; `office_actions.js` is merged into
  `ACTIONS` and `FORMS` at the foot of `app.js`.
- Version raised in `src/data.js`, `build.py` (output file), `server.py` (`APP_VERSION`,
  `APP_FILE`) and `tools/make_kit.py` (kit name, launcher, README).
- Capabilities added: `clinical.prescribe`, `clinical.dispense`, `pharmacy.view`,
  `pharmacy.manage`, `careplan.view`, `careplan.manage`, `careplan.approve`, `form.view`,
  `form.create`, `form.verify`. Grants are in one table, `ROLE_ADDITIONS`, in `src/data.js`.
- `docs/02_RBAC_MATRIX.md` regenerated: 21 roles, 94 capabilities.
- New suites: `test/v43.js` (150 checks). `test/server_api.py` extended to 51 checks for
  password verification and the file store.
- Styles: v5.0 block appended to `src/styles.css` (forms, pharmacy, care plans, coverage
  grid, scheduling, calendar classes the calendar already referenced, print rules,
  small-screen rules).
- Old `renderLeave` removed from `views_admin.js`; old leave actions removed from `app.js`.

## v5.0.0 · browser pass and host verification (same day, later)

- Driven in headless Chromium at 1440 x 900 and 820 x 1180, over HTTP and over TLS with a
  self-signed certificate.
- Defects fixed: the clinical summary row was clipped inside its card (table padding and a
  compact table variant), the reorder count treated never-stocked formulary items as out of
  stock, the medical case manager could not record a visit or open a PDCA cycle, and the
  coverage-check dialogue passed text through an escape/unescape round trip.
- `DB.migrate()` added: a database saved by an earlier release gains the new collections and
  settings without losing a record.
- `SYNC.label()` no longer reports "Unknown" when the host asks for a password.
- Verified over TLS with curl and from the browser: 401 for a wrong password, 401 for a missing
  one, 200 with `verified: true` for the right one, file upload and byte-identical download,
  401 on the file endpoint without a session, and TLS 1.1 refused.

## 19 October 2026, tablet and half-second round

- `src/live.js` added to the build and to `test/modules.js`. It polls `/api/rev` every 500 ms,
  pulls `/api/state` when the revision moves, and redraws without moving the reader.
- `DB.adopt(remote)` added to `core.js`: replaces the record set, migrates, writes storage,
  keeps personal preferences, and writes no audit entry.
- `src/app.js` shell rebuilt: no `<aside>`, no rail. A top bar, a sticky sheet of console tabs,
  and an "All" page map. Root class `div.app.shell`.
- **Defect found and fixed:** the live layer reported "Central database unreachable" because
  `SYNC.start()` asked for the state before a session token existed and never retried after
  signing in. The token now restarts the join.
- **Defect found and fixed:** the first device on a fresh host held demo data the host had
  never seen, so the join table raised a conflict and waited for a person forever. A copy
  marked `meta.demoSeeded` is now adopted away; a copy with real unsynced work still conflicts.
- The live layer takes the host copy on its first tick whatever the revision, so a standby
  tablet never starts stale. Save debounce reduced from 500 ms to 120 ms.
- `test/v43.js` gained two assertions: a demonstration copy is disposable, a working copy is
  not. Suite now 159.
- Stylesheet: tables become labelled cards at 860 px, dialogs become full pages at 700 px,
  first-run actions are pinned on a small screen, the landing page keeps two columns down to
  760 px and scales its headline with height, and a phone held sideways gets a compact bar,
  sheet and hero.
- Settings, Network and devices: personal live-refresh switch and interval, with the state,
  the updates taken and the host revision shown. Personal, not global.
- Measured after the fixes: two browsers, one host, a change visible on the other in about
  one second, both ways, revisions climbing 2 to 4 on a fresh database.

---

## v5.1.0 · 20 October 2026 · workspace themes, navigation pane, tablet layer

- Added `themes.js`, `navpane.js`, `console51.css`, `test/v51.js`; version 5.1.0, schema unchanged.
- Fixed: group-level navigation gates never applied (178 of 550 links were dead ends); hero fallback
  button; undefined `--ink-3`; text size never applied; personal reduce-motion overwritten; organisation
  appearance settings writable by any role; mislabelled accent control; failing contrast on four
  department accents, avatars, hero eyebrow and Settings labels.
- Measured: 15 suites green; 0 dead links of 372; 240-render layout sweep clean; contrast audit 0 failing
  selectors across 9 themes x 11 pages.
- Not measured: a real Galaxy Tab A11+, Samsung Internet, DeX, actual printing, two-device theme sync.

### v5.1.0 second increment · 22 October 2026

- Messaging rebuilt in the data layer (nine defects), 300 second sessions on browser and host, history and
  pagers, Creative Studio, account-level navigation proved, firewall scripts for three platforms.
- Measured: 18 suites green; 345 account variants with no dead links; 240-render layout sweep clean;
  contrast audit 0 failures (9 themes, 13 pages, plus 66 studio renders); three browsers through the host
  including a restart; real-browser Back gesture, Alt+arrows and 300 second clock test.
- Not measured: a real tablet, Windows or macOS firewall execution, real Wi-Fi.


## v6.0.0 · 22 October 2026 · merged lineages

- Added `insight6.js` (data-quality engine `DQ6`, visit-order learner `PLAN6`), landing/sign-in/onboarding
  in `entry6.js`, `console6.css`, and v6 modules `data6.js`, `pmi.js`, `recognition.js`, `workplace.js`,
  `sync6.js`; build now emits `LOMAMO-CareLink-DIMS-v6.0.html`.
- Data quality: blocking findings are not waivable; warnings and advisories are waivable by `dq.manage`
  with a written reason and an expiry, and reappear on their own afterwards.
- Visit-order learning: sequence inferred from the order visits were recorded per field day; needs three
  field days before it proposes anything; every proposal carries its reasons and is added by a person.
- Session policy moved from 300 s to 900 s (warn 870) on both browser and host; `test/v42.js`,
  `test/v52.js` and `server.py` were changed in the same pass.
- v4.1 sync assertions updated where the v6 host-authoritative policy replaces conflict screens
  (`patch` / `adopt` instead of `conflict-ahead` / `conflict-first-sync`).
- Added `test/v60.js` (65 assertions): findings carry stable keys, duplicate national IDs are blocking and
  never merged, a caregiver cannot waive, a two-word reason is refused, a blocking finding is not waivable,
  an expired waiver returns by itself, a withdrawn waiver is kept, the learner refuses to propose below three
  field days, proposals carry reasons, adding twice is refused, future days cannot be marked missed.
- Measured: 16 suites green, 1,541 view renders, 115 emitted controls all handled, 0 dead links.
- Not measured: two physical devices on a real network, any external integration, real printing.

---

## v6.1.0 & v6.2.0 · 23 October 2026 · workbook mapping, households, TB dispensing, costing & public portal

- Added `org_teams.js`, `household.js`, `costing.js`, `tb_dispensing.js`, `master_registry.js`, `master_analysis.js`, `waiting_urgent.js`, `portal_content.js`, `portal6.css`, `audit6.css`, `visual_audit.js`, `test/v61.js`, `test/v62.js`, `test/v63.js`.
- Verified: 635/635 (`v61.js`), 180/180 (`v62.js`), 108/108 (`v63.js`), zero PII/workbook leakage (`verify_no_patient_data.py`).

## v6.3.0 · 23 October 2026 · CareLink OS rebrand, clinical/partner consoles & hard-copy governance (PR #1)

- Rebranded unified Operating System to **CareLink** with browser tab title **`CareLink C-DIMS`** (`formerName: 'LOMAMO C-DIMS'`).
- Added `bmi_clinical6.js`, `discharge_hardcopy6.js`, `monday_procurement6.js`, `handover_partners6.js`, `carelink63.css`, `test/v64.js` (`82/82` assertions).

## v6.4.0 · 24 October 2026 · Unified Online Site Database, Dev Console & County Admin Workflows (PR #2)

- Added Vercel/cloud serverless backend `api/index.js` + `vercel.json`, `admin_workflows6.js` (`Operational Expenses`, Kisumu HQ preparation of Homa Bay Kenya reports, daily PAYG/transport, 9th statutory SHIF/PAYE/KRA/NSSF, annual budgeting & Filing of Societies), `dev_console6.js` (Development Console, SMS credential packs, DPA 12+ char private password enforcement, audited Chief Admin Silent Override), symmetrical zero-slice-text donut charts + View-as-Table, and `test/v65.js` (`68/68` assertions).

## v6.5.0 · 24 October 2026 · Zero-Scroll Entry, Global Activation, Dual Messaging, 3,333 Longitudinal Records & AI Workflow Engine (PR #3)

- Locked Landing & Sign-In strictly to `100dvh` zero-scroll viewports and moved Platform Architecture & Departments Working Together to `renderArchitecture6`.
- Added 14 organogram-faithful Deputy, Secretary & Clerk seats only in applicable departments/levels.
- Upgraded all **3,333 patients** with 100% complete anthropometry, `07001xxxxx` demo phones, mock household GPS, `44,995` longitudinal Home/Hospital/Homestay visits (`>=12` per patient), and paediatric Weight-for-Age, BMI-for-Age & MUAC growth curves.
- Implemented 4-step Live Host Setup -> Official Login -> Password Change -> **`Activate System Globally`** -> WhatsApp credential sheet -> permanent removal of Demo / Live Host Setup UI from Landing & Sign-In + urgent County Admin routing of Sign-In Account & Password Recovery requests.
- Added Dual-Mode Messaging (`1. Global` + `2. Ministry Area / Department`) + 1-click "Who Is Online" instant `#msgForm` composer, 5-lens Presidential/Governor/CHMT/MoH Presentation Hub (`govdashboard`), Harbour Dark default on Samsung Tab A11+ 5G / Wi-Fi Tablet, Universal Workspace Drafts Hub (`drafts`), symmetrical Executive Console & C-DIMS Coins workspaces, Global Expenditure-Against-Budget boards, and `workflow_engine6.js` (`WORKFLOW_ENGINE` driving 100% Data Quality).

## v6.6.0 · 24 October 2026 · Anthropometric & MCM Caseload Registers Overhaul, Live Scroll Auto-Folding Rail & Single-Script Bundle Guard (PR #3 + v6.6 Release)

- Synchronized `APP.version` and all release manifests/cache-busting entry loaders to **`6.6.0`**.
- Implemented capture-phase `#content` scroll and feature-interaction auto-folding (`NAVP.installAutoFoldListeners`, `NAVP.foldForWorkspace`, `NAVP.syncDomRail`) smoothly collapsing the left navigation pane into the `100%` widescreen icon rail without losing focus.
- Overhauled the **Patient Anthropometric & Nutritional Register (`bmiboard`)** and **Master Patient Register (`patients`)** with theme-safe `color-mix()` `.bmi-pill[data-tone]` badges, symmetrical 6-band WHO stratification matrix, `.reg-toolbar`, foodbag ration tags, 3-visit weigh-in dots, and 25-row pagination.
- Overhauled and remade the **Medical Case Manager Caseload Register (`clinicalmcm`)** with a 4-tier Clinical Acuity Stratification Ribbon (`.mcm-acuity-ribbon`), 7-column paginated caseload register, and 8 multi-county 4-quadrant S-O-A-P clinical encounter cards (`.soap-encounter-card` / `.soap-quad-grid`).
- Resolved single-`<script>` TDZ initialization order for `registerCountyUrgentActions` and added compiled browser bundle boot verification (`test/v66.js`: `68/68` assertions, `4,485` view renders, `90/90` kit/firewall, `50/50` server API, `CLEAN` zero-PII guard).

