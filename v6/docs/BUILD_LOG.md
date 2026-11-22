# Build record

| Field | Value |
|---|---|
| Application | CareLink DIMS v6.9.6 |
| Organisation | LOMAMO Foundation Kenya |
| Build date | 2026-10-18 |
| Database schema | 6 |
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

## v6.9.6 · 22 November 2026 · Fixed 4,000-patient demonstration register, one register size, team audio & video calling

- **Demonstration register rebuilt to the Foundation specification** (`v6/src/data6.js`, `DEMO_REGISTER`): 4,000 patients; ages 5–75 with every age present and an even girl/boy split; exactly **40%** of patients inside the **day 60–80** review window and the rest spread evenly from day 81 to day 330; an even **Kisumu / Homa Bay** split (2,000 / 2,000); **at least 12** recorded contacts per patient; and weights on a strict **21-day** grid from enrolment so no patient ever goes more than three weeks without a weigh-in. A patient enrolled inside the window carries additional *clinical* contacts between the three-weekly home visits, which is the flexible scheduling the trial report asks for.
- **One register size, stated once.** `DEMO_REGISTER` is the single source; `v6/src/{app,core,entry6,dev_console6,import,care6_flows,views_settings}.js` and the API now read it instead of repeating `3,333`. `api/index.js` pins `REFERENCE_PATIENT_COUNT` and derives the completeness check labels from the imported register, `MASTER_MAX_RAW_BYTES` raised to 160 MB for the ~80 MB payload, and the reference-master import log no longer claims a fixed patient total.
- **Reference master rebuilt** (`npm run build:reference-master`): 4,000 patients · 48,785 visits · 19,665 PDCAs · 6 verified chunks · 2.25 MB Brotli package from 83.2 MB of JSON · 100% completeness, zero data-quality findings. The seed's 78 MB JSON still gzips to ~3.8 MB and ships in 8 KV shards, well under the 16-shard ceiling.
- **Team Chat audio & video calling** (`v6/src/calling6.js`, `api/index.js`, `views_care.js`, `app.js`, `sync6.js`, `styles.css`): participant-only `teamCalls` rows with an `{offer, answer, callerCandidates[], calleeCandidates[]}` handshake, 45-second ring expiry, 2-hour read window, and a visible `#callUnavailable` explanation instead of hidden buttons when a device cannot call.
- **Held work instead of a lost visit** (`v6/src/sync6.js`). A hosted tablet is a view of the shared record and deliberately does not keep the whole register in browser storage, so a save that failed could not actually be kept anywhere — the status chip said "held on this device" when it was not. Work the host has not accepted (network down, tick interrupted, session ended, browser closed mid-save) is now written to durable storage as a patch list, replayed before anything else after the next sign-in, emptied only when the host accepts it, scoped to the account that typed it, and released with a plain refusal message when the host will never accept it. The chip reads **Held on this device** with a count instead of "Online save unconfirmed".
- **Tests:** new `v6/test/v6100-sync-outbox.js` (16 checks) drives the real `SYNC` object through those paths, including a reload and a second person signing in on the same tablet. New `v6/test/v699-demo-register-spec.js` (29 checks) asserts the register specification, the published master package, the server's single register constant and that no module still advertises the old size. `v60` (175), `v66` (77), `v665` (33), `v696` (27), `v698` (21), `reference-master-e2e`, `kv-recovery-and-autofeed` and `client-login-and-themes-e2e` updated to the 4,000-patient register. `npm run test:all` green; `npm run build` green.

## v6.9.6 · 22 November 2026 · Installed-app hardening, per-department palette review, the weekly planning page & report periods

### Release notes

- **Installed application.** The install button is attached on every host; an offline notice and a new-version reload notice were added; the status chip reads **Offline on this device** and held work replays as soon as the connection returns; the worker's navigation fallback is bounded at six seconds and honours a skip-waiting request; the manifest declares its id, launch behaviour and four shortcuts.
- **Department palettes.** Every department on the org chart measured, not assumed: banner contrast corrected stop by stop, badge tints corrected against the banner they sit on, department names read from the org chart, and no two departments sharing a rendered gradient. All 30 account types keep their own signature.
- **Weekly Planning Indicators**, the page §7 of the usage trial report asks a Monday meeting to read, with its not-recorded rule stated on the page and tested.
- **Report periods and catalogue.** Reports are filed under the period they cover — ISO week, month, quarter, or registry month — and one list (`REPORTS.types()`) now drives both the report centre and the archive.
- **Governance.** `patient.ministry.view` gates the recorded-decision count.

### Build notes

- **Installed-app shell** (`v6/pwa-install.html`, `public/sw.js`, `public/manifest.webmanifest`, `v6/src/{sync6,app}.js`). The install script was injected *inside `<head>`* by both builders, so `document.body.appendChild(installButton)` ran against a `null` body and the install button was never in the page. It now attaches on `DOMContentLoaded`, on `pageshow`, and again if the prompt arrives early, without stacking duplicates. Two notices were added where a caregiver actually needs them: an **offline strip** ("No network. CareLink is running from this device; changes are kept here until it reconnects") and a **new-build strip** ("A newer version of CareLink is ready on this device") that asks the waiting worker to take over and reloads. `SYNC` gained `offline()` and `retryNow()`: the status chip reads **Offline on this device** instead of "Online save unconfirmed", and regaining the network replays held work immediately rather than at the next poll. The worker's shell cache is bumped to `carelink-shell-v6`, navigation is now raced against a 6-second timeout so a stalled link cannot hold a blank screen, and it honours `CARELINK_SKIP_WAITING`. The manifest gained `id`, `display_override`, `launch_handler: navigate-existing` and four shortcuts (Home, Patients, Monday meeting, Report centre), each verified to open a view the console renders. `pwa-offline.js`'s existing guarantees are untouched and still asserted.
- **Every department palette measured, not assumed** (`v6/src/themes.js`). The "15 departmental color schemes" comment sat above 18 entries; the table is now described accurately and covers every department on the org chart. `deptPaletteFor()` reads the department's *name* from `DEPARTMENTS`, so renaming a department can no longer leave a console banner describing a name the organisation has stopped using. Two real defects were measured and fixed: the white-on-gradient banner text fell to **2.9:1** on the homestay and welfare gradients (it is now corrected stop by stop with `safeFill`, while the identity itself is preserved in `--dept-id-c1..c3`), and the department badge dot fell to **1.7:1** against its own banner (now corrected towards white by `badgeOnFill`, keeping the hue). `hr`'s badge tint no longer duplicates `audit`'s. `v697` grew from 12 to 20 assertions and now renders all 16 departments through a probe role and measures name, identity, badge and contrast for each; all 30 account types keep their own signature, and no two departments share a rendered gradient.
- **Weekly Planning Indicators** (`v6/src/reports.js`, `v6/src/views_ops.js`) — the one page §7 of the trial report asks a Monday planning meeting to read: patients in programme, discharges in the period, children rescued from orphanhood, children who became orphans, orphaned children supported, the deceased, food bags by the register's own codes (BG1/BG2/SPB) *and* by bag number, mattresses, blankets, Bibles, hygiene packages, mosquito nets, special bags, home visits seen, patients not found at home, weights taken against the three-weekly schedule, hospital requests with inpatient/outpatient activity, recorded decisions, and every ministry area split into **village-based** and **slum-based** with totals for each. Two honesty rules are enforced and tested: every figure is counted from a record (nothing is estimated), and a household with no recorded decision is reported as *not recorded* beside the count — `saved + notRecorded === inProgramme`. The four-way bag type split the report asks for cannot be read from bag codes (Bag 1 serves normal and couple households alike), so the page says so instead of inventing a split.
- **Report gaps closed.** `REPORTS.types()` is now the single list the report centre and the archive both read, so a report that can be generated can also be found again (`weekly_indicators` added). `periodKeyFor()` gave every report type the same bare month; weekly and 7-day reports are now filed under their ISO week (`2026-W47`), month reports under their month, quarter reports under their quarter, and the referral register under `registry-YYYY-MM` — so two issues of the same weekly report can be told apart on the archive.
- **Governance.** New capability `patient.ministry.view` (Patients group, sensitive) gates the recorded-decision count. It is held by the Chief System Administrator, President, Country Director and Ministry Area Coordinator; everyone else sees the number of blank records, which is the figure an audit can act on, and no aggregate they are not entitled to.
- **Register honesty** (`v6/src/data6.js`). Demonstration support issues were drawn from a second, parallel item list ("Enriched nutrition food bag", "Child school uniform & books", …) that no report or costing line recognises, and were all dated exactly 14 days after intake. They are now drawn from the register's own seven items (`SUPPORT_ITEMS`) and dated along the patient's programme, so the weekly page, the costing ledger and the care views count the same thing. The 4,000-patient contract is unchanged: 48,785 visits and 19,665 PDCAs still match every artefact.
- **Tests:** new `v6/test/v6101-pwa-hardening.js` (26 checks — install button attachment with and without a body, offline strip, reload strip, worker guarantees, manifest) and `v6/test/v6102-weekly-indicators.js` (45 checks — every named indicator, the not-recorded rule, scope, period keys, archive, printed document). `views.js` now renders all eleven report documents for every account (4,866 renders). `npm run test:all` green, `npm run build` green, `npm run build:reference-master` green (sha256 `e02d12e6…`).
