# LOMAMO LOMAMO C-DIMS — LOMAMO C-DIMS

**Data & Information Management System for LOMAMO Foundation Kenya** (Love Matters Most)
Kisumu & Homa Bay County Offices · version 6.9.6 · schema 6

One operating system for the whole Foundation: patient registration and the
assessment pipeline, home visits and PDCA follow-up, hospital coordination,
pharmacy and TB dispensing control, cost per patient, finance and procurement,
fleet, people and leave, media governance, M&E and reporting — with every record
scoped by county, ministry area and department, and every refusal audited.

**Official host:** <https://care-link-dims-dev.vercel.app/>

The former GitHub Pages address redirects to that host. It is **not** another
commissioning/data-entry installation. The direct HTML/PWA entry points also
stop boot on the retired Pages host, even if a redirect is blocked. Existing
browser-local records are not silently deleted or uploaded.

---

## Run it

```bash
npm install
npm run dev          # Vite dev server on 0.0.0.0:5173, rebuilds the bundle on every edit in v6/src
npm run build        # type-check + production build (also rebuilds the bundle)
npm run test:all     # lint, acceptance, API/device security, runtime-synthetic and PC/tablet workflow tests
```

`npm run test:phase1` runs the focused device/export, entry-theme/navigation,
and deterministic 4,000-patient checks (also included in `test:all`). Optional
real-browser coverage uses a local in-memory API/KV and separate cookie jars;
it never calls the live service:

```bash
npm install --no-save --package-lock=false playwright-core@1.65.1
CHROMIUM_PATH=/absolute/path/to/chrome npm run test:browser:phase1
```

An npm-only Linux binary is also supported by installing
`@sparticuz/chromium@153.0.0` without saving it and omitting `CHROMIUM_PATH`;
its platform shared libraries must be available. Browser binaries are test-only,
not deployment dependencies. The browser check measures rendered text contrast
on both entry themes and exercises preview/apply, responsive controls,
rail-expand/hold/collapse, pending-device approval/revocation, mandatory private
password replacement, confidential download and the retired-host redirect.

Privacy is a **separate gate**. `npm run privacy:check` is the default full
check: a missing authorised comparison source reports **BLOCKED / exit 2**, not
a detected leak and never clearance. `npm run privacy:repository` explicitly
runs only the independent repository checks and cannot grant full clearance.
Use the authorised workbook only in ephemeral storage, never commit it, and
purge the source afterwards. See [Privacy verification](docs/PRIVACY_VERIFICATION.md)
for private reader setup, exact scopes/exit codes and the JSON contract.
`test:all` includes Python 3 standard-library verifier regressions; passing
functional tests or a limited scan is not patient-identity certification.

Open the single file directly, with no server at all:

```
v6/LOMAMO-CareLink-DIMS-v6.0.html
```

The downloaded file is an isolated evaluation/offline tool, not an alternative
production installation and not a way around hosted device approval. Use only
the official host for the shared staff/patient register. A fresh hosted
installation offers first-run commissioning once; an already commissioned
installation must never be reset or populated with demo data to regain access.
Use an issued account or the owner-only recovery runbook instead.

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

### Phase 1 entry identity and registered-device sign-in

The Chief System Administrator selects one of **two official entry themes** in
organisation settings: **LOMAMO Emblem Dark** and **LOMAMO Letterhead Light**.
Preview either the landing or sign-in page without saving; **Apply to landing &
sign-in** saves the shared `system.config.entryTheme` and a server audit event.
Both palettes use the root letterhead's red/black/white/grey and pass the
`safeFill` / `badgeOnFill` text contrast gates. **Letterhead Light is the default**
when no Chief selection has been saved; explicit Chief choices are preserved.
The default landing remains white-led, with the original eight-department
workflow illustration restored on a charcoal panel, graphite counters and a
soft-black footer for visual relief. Its inline SVG has an accessible name and
description and works offline. Both identities keep the sign-in form white,
with natural-colour photography, visible keyboard focus and scrollable access
controls on small screens. The public-entry stylesheet is scoped separately
from workspace palettes, which are unchanged.

Staff sign-in is enforced by the API, not a browser fingerprint or a local flag:

1. A correct password on an unknown browser creates a **pending** device entry
   (label, type, first seen, verified requesting account), not a staff session.
2. The Chief opens **System → Devices**, confirms the device code with its user
   through a trusted channel, and approves or rejects it after reauthentication.
3. An approved browser can sign in; every authenticated API operation rechecks
   approval and the opaque HttpOnly cookie. Revoking a device blocks its existing
   tokens too. Clearing cookies requires approval again.

The commissioning browser (or the first password-verified Chief browser on a
legacy installation) is enrolled once. Removing every device never reopens that
bootstrap. If the last Chief browser is lost, follow
[`tools/OWNER-RECOVERY.md`](tools/OWNER-RECOVERY.md). The public portal remains
open without device admission. **Phase 2 email/SMS one-time codes are deferred**;
no provider is configured and provider secrets belong only in Vercel environment
variables.

### Chief staff-account export

Open **System → Staff credential export** on the official host. The CSV comes
from the actual `OFFICIAL_ROSTER`, not generated people. Unconfirmed seats retain
their seat labels and `unconfirmed:true` and receive no credential.

- Work mail is blank unless the Chief has explicitly attested that an existing
  `@lomamofoundation.org` mailbox is real. CareLink does not create mailboxes or
  infer addresses from names. Sign in by username when no mailbox is confirmed.
- After Chief reauthentication, the API generates temporary passwords, stores
  salted hashes and a server-only encrypted receipt in KV, and returns the
  confidential download. No plaintext password file is stored on the server or
  in the repository/browser storage.
- Temporary passwords are **single-use**, expire in **seven days** by default
  (`system.config.temporaryPasswordDays`, Chief-configurable 1–30), and require a
  private replacement **before any workspace data**. A same-attempt/device
  network retry is idempotent; a new attempt cannot reuse a redeemed password.
- Chief/private credentials are retained, not exported. Use **Revoke password**
  for a compromised staff account; it invalidates existing sessions. A subsequent
  issuance creates a fresh temporary password.
- Every issuance/export is audited with actor, time, row count and acting device.
  Give each recipient only their own row; never post a pack in a group chat.

A full hierarchy rebuild remains a separate, deliberately destructive account
operation. Its procedure and 24-hour encrypted-pack recovery are documented in
[`docs/REBUILD_AND_REBOOT_FROM_CHIEF_ADMIN.md`](docs/REBUILD_AND_REBOOT_FROM_CHIEF_ADMIN.md).
Use the smallest per-account/device action rather than rebuilding everyone.

### Runtime synthetic evaluation register (never production data)

Live commissioning starts with an **empty production register**. Use the
4,000-patient synthetic reference only in an explicitly isolated evaluation
installation **before global activation**, never in the existing live database.
The reference and related programme/departmental records are generated at runtime
by `api/synthetic-reference.mjs`; no dataset is committed, bundled, or published
under `public/master/`.

The Chief's authenticated **System → Master data import → Full 4,000-patient
reference master** download calls the generator. The same JSON may be inspected
and imported through the governed, digest-verified chunked upload, or explicitly
auto-fed by the Chief for evaluation. The API preserves live accounts, private
passwords and organisation settings and refuses a repeat/post-activation import.
Every generated record carries `synthetic:true`; patient/staff/roster phones use
only `07001xxxxx` / `07003xxxxx` / `07005xxxxx`, national IDs `9x,xxx,xxx`, CCC
`CCC/9xxxxx`, and mail `@lomamo.example`. The seed and anchor are fixed; see
[`docs/DEMO_REGISTER_SPECIFICATION.md`](docs/DEMO_REGISTER_SPECIFICATION.md).

Large online states use verified immutable KV shards and bounded/compressed
client responses. `npm run build:reference-master` is an **optional local
export**, written under ignored `v6/data/`; it is not a deployment build input.
Anonymous `POST /api/public/demo-bootstrap` is disabled. No verification step in
this change writes demo content to the live deployment.

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

This repository is public: **never add a real patient record or sensitive
internal document**. The generated 4,000-patient reference register is synthetic
evaluation content with reserved contact details and no credential secrets. The Administration's master patient
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

The verifier distinguishes **failed checks (exit 1)** from **blocked checks
(exit 2)**. The full default fails closed when the authorised identity source is
unavailable. An explicitly limited structural/contact scan is **not** full
patient-identity or deep-history certification. Private setup, source cleanup
and automation requirements are in [Privacy verification](docs/PRIVACY_VERIFICATION.md).
No workbook or extracted identity corpus belongs in Git.

```bash
npm run privacy:check                         # full defined check; BLOCKED without the authorised source
npm run privacy:repository                    # limited scope only; identity comparison NOT RUN
npm run test:privacy-verifier                 # synthetic regression tests, not a real-patient sweep
bash v6/tools/purge_patient_data.sh            # report what a history rewrite would erase
bash v6/tools/purge_patient_data.sh --rewrite  # rewrite local history (backup bundle first)
python3 v6/tools/pack_portal_media.py          # repack the public-portal photography
python3 v6/tools/gen_rbac.py                   # regenerate docs/02_RBAC_MATRIX.md from code
```
