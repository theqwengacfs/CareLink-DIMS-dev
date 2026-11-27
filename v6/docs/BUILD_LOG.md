# Build record

| Field | Value |
|---|---|
| Application | CareLink DIMS v6.11.2 |
| Organisation | LOMAMO Foundation Kenya |
| Build date | 2026-11-27 |
| Database schema | 6 |
| Artefact | `LOMAMO-CareLink-DIMS-v5.0.html` (one file, no dependencies) |
| Source modules | 11 (`src/`) |
| Offline tooling | `tools/import_engine.py`, `tools/make_master_template.py`, `tools/gen_rbac.py` |
| Test suites | 114 test files in `v6/test/`; `npm run test:all` → EXIT=0, 0 failures |
| Authorisation controls verified | 13 / 13 |
| Central database | `server.py` · SQLite · revision snapshots · 26/26 API checks |
| Audit pass | 2026-10-18 — 14 defects found and fixed (docs/12 §9) |

## v6.11.2 — a selected tab may not paint its text from another layer

**The report.** Two phone screenshots: the current page tab had a visible shape
and no readable label. One was a green chip with its text hidden, the other a
navy chip carrying maroon text.

**Why it happened.** A selected tab's surface and its text were painted by
different layers, and each layer used a colour that was correct *on its own*:

| Layer | What it painted | Token |
|---|---|---|
| `console_color_schemes.css` | the chip's fill | `--console-c1-fill` (the console's solved maroon) |
| `carelink63.css:2103` | the label `<span>` and `<svg>` inside it | `--accent-fg` (the accent *as ink*, solved against the page) |

Both pass their own contrast checks — navy on the page is 10.4:1, white on
maroon is 12.2:1 — but navy on maroon is **1.02:1**. Every earlier review had
checked a colour against the page. None had checked a label against the surface
that ended up behind it, because no single stylesheet was wrong.

**The fix.** One pair, declared once per state, and every selected control reads
only those two tokens: `v6/src/tab_ink.css` (new, loaded last) sets
`--tab-fill` and `--tab-ink` in the same declaration block for the sheet page
tabs, module tab strips, console shortcuts, the header quick bar, the collapsed
rail, the role chips, the Layout segment and the module tiles. The labels and
icons of those controls are re-pointed at `--tab-ink` rather than left to
inherit, because three other sheets colour a tab's `<span>` directly.

`--accent-fg` and `--accent-soft` are no longer used to colour or wash a
selected control: `--accent-fg` is ink solved for the page, and `--accent-soft`
is a pale wash the console fill overpaints. The foundation theme keeps its
crimson selected state, but now owns both halves of the pair instead of pinning
white text while a solved ink arrived from elsewhere.

**The audit.** `tools/audit-tab-ink.cjs` resolves the real cascade — importance,
then specificity, then source order — for every theme × console colour scheme ×
account signature, follows `color:inherit` up the tree, resolves `var()`,
`color-mix()` and `rgba()` against the tokens the page actually emits, and
measures the text against the surface really behind it. 18,720 pairs, minimum
4.5:1, currently the weakest is 5.5:1. With `tab_ink.css` emptied it reports
1,440 failures at 1.00:1, so it is a real gate and not a rubber stamp.

`v6/test/v6112-tab-ink.js` (23 checks) locks the structure down: fill and ink in
one block, a forced ink on the label and the icon, no `--accent-fg`/`--accent-soft`
on a selected control, and no literal fill paired with a variable ink.

## v6.11.0 — Monday Procurement Protocol, colour coherence, sign-in latency

**Monday Procurement Protocol** (`v6/src/monday_procurement_protocol6.js`, new;
route `foodprotocol`; console navigation, and four tabs). Every Monday the Active
Programme Register is counted after discharges, deaths and completions, taken off
the Foundation's 180-patients-a-week envelope, and the remainder is that week's
new-intake target — the same number that sets how many assessment forms the week
can accept. Household and headcount are shown side by side because a couple
household takes one Bag 2 rather than two Bag 1s.

Bag 1 and Bag 2 are bought and issued every week, and each patient alternates, so
no patient receives the same bag twice running; a patient in a ward that week
takes the bedside pack (milk and oranges) instead of a dry household bag. The
item budget is per-bag contents × bags to issue, priced per unit, and a line reads
*working* until Procurement keys the verified quotation price — the sheet says
which figures are which, and closing the Monday freezes both quantities and
prices so a later price change cannot rewrite the order.

**The colour clash.** The current role chip filled with the raw signature hue
(contrast-checked only against the page) while its label assumed white, so on a
dark green console the current tab was dark-on-dark and effectively invisible —
the phone screenshot that started this. Every filled console surface now takes
both its fill and its ink from one solved pair (`--console-cN-fill` /
`--console-cN-ink`, solved by `WTC.fillWithInk`, minimum 4.5:1), covering the
current role chip, the selected navigation tile, the "all" sheet chip, the quick
button and the workspace mode segment. Three Admin Ops index badges were also
moved above 4.5:1.

**Sign-in latency.** Measured rather than guessed: the server counts KV
round-trips per request and `/api/auth/login?timing=1` now reports the stage
timings (credential check, device admission, auth write) and the round-trip
count. A device that already holds the host's current document no longer
re-downloads the whole workspace on sign-in (with an owner check so another
account's document is never reused), and admission no longer reconstructs a
sharded workspace merely to read the device register. The dominant remaining
cost is the mobile link itself: on the 15 kbps connection in the screenshot a
first sign-in legitimately needs ~50 s to download a large register.

**The three phone defects.** All three came from the screenshot and none of them
was visible on a desktop: (1) every inner page rendered **two** role-tab rows —
six chips in the banner and seven again in the context strip directly beneath
it, because the strip kept its own copy of a tab bar the banner already draws;
the strip now yields its tabs (`contextStrip(user, view, {omitTabs})`) and keeps
only what is genuinely per-page. (2) The `Layout` chip's label was a bare text
node with a `::after` plus sign and no gap, so it clipped; the label is now its
own element and the indicator is `flex:0 0 auto`.

**Correction: the install pill.** An earlier attempt at (2) also converted the
install prompt from a floating pill into a flow chip inside the workspace. That
was wrong on both counts. The pill is the one control whose job is to be
noticed, it was already easy to see and easy to use, and being `position:fixed`
it contributes **zero height** to the page — so it was never what pushed the
one-screen landing or sign-in past `100dvh`. The pill is restored exactly: red,
bottom-right, `16px` from each edge, a direct child of the body, in the flow of
nothing. The notice strips are restored too. The only adjustment left is inside
a signed-in console, whose bottom edge belongs to the shortcut row and the role
strip; there the pill steps up by a **measured** clearance (bounded 64–160px,
with a constant fallback for hosts it cannot measure), never on the entry
pages.

**Sign-in, measured on the wire at the contractual size** (4,000 patients,
1,334 in the field officer's scope, real handler behind a real fetch):

| | calls | downloaded |
|---|---|---|
| `auth/login` | 1 | **1.1 KB** |
| plain snapshot | 1 | 0.41 MB |
| compressed pack | 1 | **0.04 MB** (90.8% saving) |
| no-op revision probe | 1 | 0.1 KB |

Stages `credential_lookup 0 / password_verify 32 / device_admission 8 /
auth_metadata_saved 27 ms`, `totalMs 67`, `kvRoundTrips 5` — the stages now sum
to the reported total, and the KV round-trip count includes the cold read path
(`readKvStringFromCandidate`), which it previously missed. The sign-in response
never carried the workspace: the register is a separate request, where the
compressed pack applies.

**A reported defect that was not one.** `api/state?fast=1` sometimes answered
`rev 1, patients 0`, which read like an empty pack a client could not boot from.
It is what a freshly commissioned installation holds before a register has been
imported, and the plain snapshot says exactly the same. Both routes are now
asserted to agree on an empty install, so the real failure — the two ever
disagreeing — is what fails a test.

**Checks.** `v6110-monday-procurement-protocol` (58), `v6110-active-tab-colour-
coherence` (28, including the solver's maths run for real across 18 hues),
`v6110-signin-latency` (24), `v6110-mobile-layout` (43, phone **and** tablet
tiers **and** the restored pill), `v6110-entry-one-screen` (27, the one-screen
policy for the landing and sign-in pages),
`v6110-signin-wire-cost` (14, measured at 4,000 patients). `npm run test:all`
exit 0. `views.js` renders 5051 views without a fallback.

## Deployed state — v6.10.0, and what is still awaited

**v6.10.0** is the current release. The Foundation's preferred host is
**https://care-link-dims-dev-three.vercel.app/** (project `dandante01-2639/care-link-dims-dev`);
the older `care-link-dims-dev.vercel.app` and the GitHub Pages mirror are kept in
step by the same push to `main`, so all three serve one build.

### v6.10.0 — the banner height, one colour system, and motion

The console banner had been made taller than it used to be: the role-tab strip
(the row of console tabs plus the `Layout` control) had been folded *inside* the
coloured card, so the gradient ran on past the divider that used to end it and
covered the tabs as well.

**Restored geometry (the size question, answered).** The card now contains the
greeting, the actions and the quick metric cards and nothing else; the role strip
is a tab bar directly below it, on the page. On desktop the card keeps the base
`.ws67-hero` padding, **`18px 22px 14px`** (≈626px tall at 1600×900 for a console
with six role tabs), with a **`10px`** gap to the strip.

Two things had grown it. The strip's own `margin-top:20px; padding-top:18px` moved
from inside the card to below it, and — the larger one — a "workspace breathing
room" block in `entry_theme.css` re-declared the card padding at **`26px 28px
22px`** *later in the cascade* than the compact palette value, adding 16px of
padding plus 12px of gap, so the gradient reached ~835px and swallowed the tab
row. That competing declaration is gone: the card padding is stated once. Phone
(`14px 16px 12px`) and short-screen (`10px 20px 8px`) tiers keep the same rule.

The role strip now sits on the page, so its chips are styled against the page
rather than against the gradient: each chip carries its own signature hue and the
current one is filled with `--console-c1`. No stylesheet may paint a border or a
fill on the strip inside the banner, and
`v6100-banner-height-motion-and-scheme-coherence` fails if one does.

**One colour system.** Two blocks were painting a second, fixed palette on top
of each console's own signature: a light-mode block pinned six hex tints onto the
metric cards and role chips of every console in every scheme, and a Foundation
block stepped `.rc68-tile`/`.ctx-rtab` through five fixed colours. A Procurement
crimson console therefore showed teal, mauve and sand chips beside it. Both now
derive from `--console-c1..c6`/`--console-hero-1..3` (already contrast-corrected
by `WTHEME.safeFill`). The mauve page sheet, the blue-to-mauve sheet header, the
three fixed navigation-tile fills and the three fixed metric fills follow the
signature too. Alert/warning/critical colours are untouched. One accent stays
fixed on purpose: `--console-highlight` (`#1e40af`) marks the *current* item
beside gold, in the sidebar and the shortcut bar.

**Motion.** Page changes use the browser View Transition where available and a
short CSS fade-and-lift where not (never both). Sheets fade and scale in, and
play a closing frame before removal — with removal guaranteed by a timer, so a
dialog can never be trapped by an animation. Switches slide their knob
(travel corrected to `20px` so the checked knob sits inside the 44px track),
segmented controls and tabs cross-fade colour. Every rule is dropped for
`prefers-reduced-motion`, for the Interface animation switch (`html[data-calm="on"]`)
and under `@media print`; nothing animates width, height, margin, padding or font
size.

**Measured effect.** On the 6.9.7 screenshots the coloured card ended at ~835px
in a 1599px-wide 1600×900 capture, with the tab row at ~593–620px and the
`Layout` chip at ~643–680px painted inside it. The card is now `18px 22px 14px`
(16px shorter than the `26px 28px 22px` that was winning the cascade) and the
strip sits below it, so the gradient ends on the divider under the copy and the
whole banner region is roughly a quarter shorter. The strip keeps a 10px gap.

**Deployed and verified.** PR #87 → `931e192`; PR #88 → `639d712` (edge cache).
`GET /api/health` (bare path), `/api/bootstrap`, `/api/rev`, `/api/public/statistics`
and the served `carelink-v6.html?v=6.10.0` all report **6.10.0** on
`care-link-dims-dev-three.vercel.app`; GitHub Pages build `built @ 639d712`;
Vercel commit status `success`. One wrinkle worth recording: after #87 the bare
`/api/health` kept answering `6.9.9` from a stale Vercel edge object while every
other route (and the same route with any query string) reported 6.10.0, so the
`/api/(.*)` rule now also sends `CDN-Cache-Control: no-store` and
`Vercel-CDN-Cache-Control: no-store`. If a bare probe ever disagrees with
`/api/bootstrap` again, the probe is cached, not the deployment.

**Checks.** `v6100-banner-height-motion-and-scheme-coherence` (25 checks) pins the
card boundary in real rendered markup for every account, the strip's placement,
the signature-derived palette, the eight schemes' contrast, and each motion guard.
`npm run test:all` → exit 0; `v697` 20/20; `v695` 16/16; `v670` 17/17;
`v6100` **25/25**. `v65`'s version gate was widened from `6.[4-9].x` to accept
`6.10.x` and later.

### v6.9.9 — the public statistics fix

Probing the live host found a real defect rather than a test problem: on a
commissioned installation the 4,000-patient register is a **verified reference
master in KV**, not `state.db.patients` in the process answering a public request.
The endpoint read the rows alone and therefore reported **0 patients discharged,
0 active caseload and 0 home visits** while the programme was running — a public
page stating something false about the Foundation.

`GET /api/public/statistics` now reports which source answered (`register rows` or
`register metadata`), returns the register size it can see, describes the
organisational structure (2 county offices, 10 ministry areas, 16 departments) once
the installation is commissioned, and **withholds** any programme total it cannot
compute for the request with an explanation instead of returning a zero. Before
commissioning it describes nothing at all, because reporting the product's own
defaults as the Foundation's organisation would be an invented figure.
`public-statistics-governance` grew to **29 checks** and now drives the
commissioned-with-no-rows shape as well as the rows-in-hand shape.

The items that remain open need a person rather than a commit, and are listed once
in [docs/OUTSTANDING-DELIVERY-TRACKER.md](../OUTSTANDING-DELIVERY-TRACKER.md) under
*Pending on the Foundation's side*: the three decisions (52-week rule, 4,444
reconciliation, 16→11 departments), real-device and print acceptance, the Bible
translation licence, private storage and scanning, clinical/privacy review, and the
signing of the Android build. Every one of them is also named in the audit record
beside the requirement it blocks.

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

## v6.9.8 · 22 November 2026 · The six unbuilt requirements, built — and the five lines the audit said were partial, measured

### Release notes

- **Public statistics are now governed, not printed** (`api/index.js`, `v6/src/portal_content.js`, `v6/src/views_entry.js`). `GET /api/public/statistics` builds each figure from the central database and returns `{value, suppressed, reason, reviewedBy, reviewedAt, publishable, basis}` for it. Any count of people below the **suppression floor of 5** comes back with `value:null` and a reason; the portal prints only figures a named reviewer has released, and the payload always states its `basis`, `generatedAt` and `rev`. A marketing number can no longer be presented as a counted one. New `v6/test/public-statistics-governance.js` (20 checks).
- **Announcements can be addressed** (`v6/src/announcements.js`). An announcement is aimed at `everyone`, a county, a department, an area, a role or named people, and the audience is resolved **on read** — so a person who transfers into a department sees the notice that was waiting for them. `everyone` is refused for a role that cannot reach everyone, an empty audience is refused rather than quietly widened, `receipt()` reports seen / acknowledged / outstanding, and expired announcements are hidden from readers but kept for audit. Bell, unread count and acknowledgement highlight are wired in `v6/src/app.js`. New `v6/test/scoped-announcements.js` (37 checks).
- **Handwriting is captured, and labelled as exactly that** (`v6/src/ink.js`, `v6/src/ink_pad.js`, SOAP encounter in `v6/src/bmi_clinical6.js`). Strokes are recorded as `[x,y,pressure]` triples, normalised to canvas space, pressure-thinned, and printed as SVG paths — no rasters, so a record stays legible at any size. The pad accepts a stylus, a finger or a mouse and is keyboard-reachable. Every captured mark is `verification:'unverified'` and is described as a captured stroke, never an attested signature; a typed name is captioned `name as written: …` and marked "not a signature". **Recognition and grammar proofing are not built** and are not claimed. New `v6/test/stylus-handwriting.js` (38 checks).
- **Offline sign-in, opt-in and fail-closed** (`v6/src/offline_signin.js`, `v6/src/entry6.js`, `v6/src/views_settings.js`). An account can tick *Remember this device for offline sign-in* **after** a successful online sign-in; the credential is a PBKDF2-SHA256 record over its own 16-byte salt with **210,000** iterations stored in `localStorage['carelink.offline.signin.v1']` — never the server digest. It expires after `security.offlineSignInDays` (default 14, clamped at 60) without an online sign-in, and is refused outright for a locked, inactive or revoked account. A browser without WebCrypto is refused with a plain sentence rather than falling back to something weaker. An offline session sets `SYNC.deviceOnlyOverride`, so nothing typed in it is claimed as saved centrally. New `v6/test/offline-signin.js` (30 checks). **Not built:** an encrypted offline copy of the register re-synced and logged on reconnect.
- **The PDCA review engine is real, and says what it is** (`v6/src/pdca_review.js`, wired to `pdca-review-comment` in `v6/src/app.js`). It learns from both record shapes in the register — `pdcas` rows and `careReviews` narratives — the fill rate, median and p25 length of each PDCA field, refuses to judge below 40 closed cycles, and then reads a new cycle against that pattern. Findings name the field, the reason and the basis: missing, thin, restated (shares ≥80% of the plan's words), undated, unowned, or chain-incomplete (a 120-day cycle with no MCM comment). It never approves anything and the modal says so; the reviewer's own comment box is left empty for the reviewer. On the current register it reads 361 cycles, 302 closed, plan filled 302/302 at a median of 5 words, with check and act fill rates of 0% — which is itself the most useful thing it has said. New `v6/test/pdca-review-engine.js` (26 checks). **Honest limit:** the corpus is the demonstration register, not 120 real MCM-reviewed cycles.
- **Bible references, seven translations, and no unlicensed copying** (`v6/src/scripture.js`, `v6/src/devotion_rules.js`, `v6/src/monday_procurement6.js`). References are read the way staff write them — `John 3:16`, `Jn. 3:16-18`, `1 Cor 13:4-7`, `I Pet 5:7`, `Psalm 23`, `Rom 8:28,31` — with ordinal prefixes preserved ("1 John" is not "John") and ranges formatted consistently. The seven translations are registered with their publisher and permission state; only a public-domain translation (KJV) is displayed in full, any other one can be switched on by recording the clearance in settings, and until then the reference opens at the publisher. The devotion prepare form now offers the translation, stores it with the minutes and states whether anyone has checked the reference against the printed text. New `v6/test/scripture-registry.js` (36 checks).

### Build notes

- **Tab-close release is real, not designed** (`v6/src/sync6.js:266`, `v6/src/app.js:220`). `SYNC.releaseOnExit()` sends a `keepalive` logout on `pagehide` and `visibilitychange` covers a phone backgrounded and then killed, so the next person does not wait out an idle window on a shared tablet. The server's head-only logout path releases the lease even when the sharded state was never loaded. Retiring the 31-minute wait did not remove the single-instance rule: a second client is refused by default and offered an explicit takeover, and the older window is told it was superseded (`session_superseded`) rather than dropped without explanation.
- **Reveal measured against a real scrollport** (`v6/test/workspace-tab-reveal.js`, 14 checks). A purpose-built scroll container records every scroll and focus call, so the test asserts *where* the reveal lands: the pane that actually scrolls moves (not the window), the workspace view is anchored with the sticky toolbar height subtracted, the movement is `behavior:'auto'` so content is there on the click, focus uses `preventScroll`, and the legacy window-scroll path and deep links behave the same way. The rail routes through the same path rather than its own.
- **Roster fairness counted, not asserted** (`v6/test/devotion-fairness.js`, 12 checks). Five different shuffles of a full year: spread never above one turn, every eligible person used, never two consecutive weekdays for the same person, no weekends, Tue–Thu on the 08:30–09:00 slot with Mon/Fri saying "Time not specified" rather than guessing, special days to the director, closing prayer against a named active account.
- **Test suites:** new `public-statistics-governance` (20), `scoped-announcements` (37), `stylus-handwriting` (38), `offline-signin` (30), `pdca-review-engine` (26), `scripture-registry` (36), `devotion-fairness` (12), `workspace-tab-reveal` (14) — all added to `npm run test:all`, which is green. `wiring.js`: 527 actions / 111 forms / 244 emitted controls all handled. `views.js`: 5,037 renders. `npm run build` green (5,112.4 KB single-file artefact).
- **Audit regrade:** `docs/audit/PROMPT-AUDIT-001.md` moves from 4 captured / 43 partial / 6 not captured to **14 captured (four with a stated limitation) / 37 partial / 1 not captured / 10 blocked / 4 unverified**, counted from the 58 requirement rows. The one remaining not-captured row (D9) needs the approved 8-of-11 mapping. No real patient record was created or modified.

## v6.9.7 · 26 November 2026 · Verbatim prompt audit, report period labels & issuing-department provenance

### Release notes

- **The verbatim prompt set is now on record.** [docs/audit/PROMPT-SOURCE-OF-TRUTH.md](../audit/PROMPT-SOURCE-OF-TRUTH.md) records the four prompt batches supplied by the Foundation and states plainly which clauses were cut off mid-sentence. [docs/audit/PROMPT-AUDIT-001.md](../audit/PROMPT-AUDIT-001.md) reconciles roughly 68 requirements line by line against revision `347122a`: **4 captured, 43 partial, 6 not captured, 10 blocked or needing an external decision, 4 unverified.** Both reconstructed checklists now point at that audit and say they are superseded for source wording.
- **Report periods corrected across every family.** The 52-week Monday–Friday labelling existed but was applied to one report of eleven; the rest still printed "7 days to …". `reportPeriodLabel()` now classifies weekly (`weekly_indicators`, `patient_figures`, `patient_days`, `home_visits`), monthly (`expenditure`, `referral`, `quality`, `hospital_ops`, `condition_summary`) and quarterly (`executive`, `donor`) documents, and the patient-figures subtitle no longer leaks the rolling window. Labels stay marked **"(provisional)"** until the Foundation supplies the official 52-week boundary rule.
- **Issuing department on every document.** The report meta grid now reads `Generated by — <name> · <department>`, with the department read from `DEPARTMENTS` rather than typed per report.
- **New test** `v6/test/report-period-labels.js` (26 checks): the week number never exceeds 52 across an 800-day sweep, two planning weeks never share a label, Mon/Fri bounds hold, each report family carries its correct period, and the issuing department appears on clinical and leadership documents.

### Build notes

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
