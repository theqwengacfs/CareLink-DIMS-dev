# CareLink DDMS v3.3.0 — Complete System Handoff

**LOMAMO Foundation Kenya · Digital Data Management System · "Serving our Neighbours in Love"**
Document purpose: a complete, self-contained specification of the system as shipped at v3.3.0, written so a developer or AI coding agent with NO prior context can continue developing it correctly. Everything below reflects the actual code.

---

## 1. Product identity

- **Product name:** CareLink DDMS (the one product). It serves the LOMAMO Foundation Kenya, a community health ministry in Kisumu County, Kenya.
- **One system of record:** every department (field care, hospital, finance, procurement, transport, welfare, media, PR, audit, leadership) works in this single system with a single login. Nyalenda is treated as one ministry area among eleven, never as a separate product.
- **Origin:** v1 began as a Nyalenda-only patient system and was transformed (not discarded) into the organisation-wide platform. The January to June 2026 mid-year report is the preserved baseline; Section 12 of that report is the sole source of every performance target.
- **Current version:** 3.3.0 (`paths.py` → `APP_VERSION`). Version history: v1.0-1.2 patient core; v2.0 CareLink department layer; v3.0 organogram roles + approvals + workflow engine; v3.1 role consoles + executive insight + demo environment; v3.2 richer demo data + landing redesign; v3.3 the Smart Medical Case Management clinical layer (see section 8).
- **Landing branding:** deep navy (#1F3864) and gold (#C9A227) theme, cream sign-in panel, real LOMAMO logo (never cropped), tagline "Serving our Neighbours in Love" in yellow, 2026 copyright, discreet credit "Built by 26 YHVH-MELCHIZEDEK".

## 2. Ground rules (non-negotiable; every change must respect them)

1. **Plain British/Kenyan English in ALL user-facing strings. No em dashes or en dashes** anywhere (use hyphens). This is checked culturally by the owner.
2. **Real patient-data integrity above everything.** Never overwrite the database silently. Changes run Backup → Validate → Migrate → Verify → Activate. The data directory is persistent and never deleted on upgrade.
3. **No invented data, ever.** Targets come only from the H1 2026 baseline and Section 12. Demo data is synthetic, labelled "DEMO", removable in one click, and never presented as real. Quality of care outranks target numbers; never recommend enrolment or discharge to hit a number.
4. **Dashboards show verified/published data only.** A visit form must pass the verification pipeline (section 6.2) before it feeds any dashboard.
5. **The master administrator never authors home visit forms** (`VISIT_AUTHORS = ("caregiver", "coordinator")` only). All credentials are issued by the (chief) administrator; real passwords are salted PBKDF2 (120k iterations) and never listable.
6. **Account requests are never auto-approved.** The first `/setup` account becomes the Chief Administrator.
7. **No colour-only status.** Every status carries a text label. No overall ranking of caregivers or areas. Targets are shown as "app prompting", never leaderboards.
8. **Mobile has full parity:** every sidebar item also appears in the mobile "More" sheet (role-hidden items are role-appropriate, not mobile omissions).
9. **Core functions work offline** (local Wi-Fi/LAN, phone via QR kit). The optional AI is the only online-dependent feature and always has an offline fallback.
10. **AI is decision support only:** answers are labelled "AI DRAFT", never diagnose, prescribe, or decide enrolment/discharge; "Insufficient data" is preferred over fabrication.
11. **Audit everything sensitive.** The audit trail is append-only in spirit; historical timestamps are never silently altered.
12. **Every issue follows:** Identify → Diagnose → Fix → Test → Verify → Document. No speculation when the code is readable.

## 3. Tech stack and how to run

- **Python 3** (developed on 3.13; Windows bundle embeds CPython 3.12), **Flask >= 3.0** (only pip dependency; `requirements.txt` is just `flask>=3.0`), **SQLite** via Python's stdlib `sqlite3` with row factory. No ORM, no build step, no frontend framework: server-rendered **Jinja2** templates, vanilla CSS (`static/css/style.css`) and vanilla JS (`static/js/app.js`, `charts.js`, `extras.js`). QR codes via a vendored `segno/` package. Service worker + manifest for phone install.
- **Run:** `python3 app.py` → serves on **port 8000** (binds 0.0.0.0). First visit of `/setup` creates the Chief Administrator account and (automatically, guarded) loads the demonstration dataset.
- **Data location:** `paths.py` resolves the data dir from the `NYALENDA_DATA_DIR` env var, defaulting to `<app>/data/`. The SQLite file is `nyalenda.db`. `database.py` re-exports `DB_PATH` and applies `migrations.py` at init.
- **Diagnosis pages:** `/diag` (phone connection kit with QR code) and `/ping` (connectivity probe).
- **Never import project modules before setting `NYALENDA_DATA_DIR`** in scripts/tests: `paths.py` resolves `DB_PATH` at import time. See the regression note in section 10.

## 4. File map (repository root)

| File | Role |
|---|---|
| `app.py` | Main Flask app (~4,700 lines): dashboards, patients, visits, verification, measurements, foodbags, PDCA, hospitalisations, discharges, follow-ups, stories, assistant pages, admin (users/settings/backup/import/health/data), reports, engine wiring, `_purge_demo`, `_PATIENT_VIEWERS`, `_CL_NAV` |
| `auth.py` | Blueprint `bp`: login/logout, `/setup`, `/register` (account requests), sessions with idle timeout, CSRF (`csrf_check`, `csrf_token`), PBKDF2 hashing, `audit()`, decorators `login_required` / `role_required`, `ROLES`, `ROLE_LABELS`, `VISIT_AUTHORS`, `VIEWERS` |
| `carelink.py` | Blueprint `cl` (~2,700 lines): all department consoles, cross-department request workflow, hospital desk + appointments, verification queue, targets, week report, org/exec/guest consoles, media/welfare/finance/procurement/transport/PR consoles, notifications, data flags, `ROLE_CONSOLE`, `scope_areas`, `area_filter`, `notify()` |
| `clinical.py` | Blueprint `cmed` (v3.3.0): medical case manager console `/medical`, clinical reference workstation, formulary, interactions, calculators, facilities, spotlight, clinical encounters (create + governed delete), pharmacy purchase/issue |
| `clinical_data.py` | Pure data module (v3.3.0): `CONDITIONS` (77), `FORMULARY` (114), `INTERACTIONS` (20 + class-level rules in `interaction_for()`), `FACILITIES` (10, L3-L6 with departments), `SEVERITY_COLOURS`, Medscape search links |
| `database.py` | `SCHEMA` for fresh installs, `get_db`, `init_db(app)`, migration bootstrap; `DB_PATH` from `paths` |
| `migrations.py` | Ordered migration list v1-v8, `_verify()` integrity checks, `apply_migrations(db)`; `LATEST_VERSION` derived from the list. v8 adds `encounters`, `pharmacy_purchases`, `inventory_items` |
| `intelligence.py` (`eng`) | Offline decision engine: alerts, tasks, "What matters today" (FACT/CALCULATION/TREND/INTERPRETATION/RECOMMENDATION), discharge readiness, published-data SQL predicate (`PUBLISHED_SQL` in carelink), 12h publish queue logic |
| `reports.py` (`rpt`) | Weekly/monthly/quarterly/half-year/annual/custom period reports, anonymisation switch |
| `demo_data.py` | Demonstration environment: `DEMO_USERS` (21 accounts, password `Demo2026!`), `seed_demo_users`, `seed_demo260` (date-relative generator, seed-fixed RNG), purge support markers |
| `seed.py` (`ref`) | The nine original legacy sample patients (kept coherent since v3.2: cm heights, >= 4 visits, weight trends) |
| `ai_client.py` | OpenAI-compatible + custom-mode AI client: de-identification, system prompt, timeouts, Bearer keys |
| `utils.py` | Dates (EAT, UTC+3), BMI, phone validation, programme stage bands (60-90 days, > max = EXTENDED, PDCA required), milestones, config |
| `backup.py` (`bk`) | Backup → Validate → Migrate → Verify → Activate pipeline, sync export/import |
| `test_system.py` | The acceptance suite: **389 checks** (section 10) |
| `templates/` | `base.html` (sidebar + mobile More sheet + Ctrl+K spotlight + notification bell), `patients/` (16-tab profile), `carelink/` (department consoles), `medical/` (clinical layer, 10 templates), `admin/`, `auth/`, `performance/`, `reports/` |
| `static/` | `css/style.css` (theme), `js/`, `img/` (logo, favicon), manifest + service worker |
| Docs | `START_HERE.txt`, `DEMO_ACCOUNTS.md`, `AI_SETUP.md`, `DEPLOYMENT.md`, `INSTALL_ANDROID.md`, `ONLINE_TEST.md`, `README.md`, `REVIEW_v1.2.md` + `REVIEW_v2.0.md` + `REVIEW_v3.0.md` (Addenda 1-6 = the changelog) |
| Starters | `START_WINDOWS.bat`, `START_TERMUX.sh`, `START_TUNNEL_WINDOWS.bat` (cloudflared quick tunnel) |

## 5. Data architecture

- Fresh installs create the full `SCHEMA` at the current shape; existing installs upgrade through `MIGRATIONS` (v1-v8). `apply_migrations` backs up first, verifies integrity + core tables after each step, and refuses a database NEWER than the app.
- **Key tables:** `users` (roles, `ministry_area`, PBKDF2 `pw_salt`/`pw_hash`, `must_change_pw`, `is_active`), `account_requests` (pending → approved/declined/clarification), `patients` (status active/assessment/discharged/deceased, `is_demo`, area, SHA status, intake/programme dates), `visits` (13-section form, dual signatures `sig1`/`sig2`, scheduled/actual dates, `submission_state`), `measurements` (weight/height/BMI every ~21 days / every 2nd-3rd visit), `foodbags` (Normal/Family/Couple/Special ×1/2 + spouse fields), `pdca_records`, `care_plans`, `hospitalisations`, `discharges` + `death_details` + `discharge_outcomes`, `post_discharge_followups`, `patient_conditions`, `patient_medications`, `wounds`, `children`, `patient_photos` (consent-gated), `spiritual` (Bibles, decisions), `distributions` (nets, mattresses, hygiene).
- **Requests:** `service_requests` with 11 kinds, 13-state CHECK (`draft, submitted, received, acknowledged, assigned, in_progress, awaiting_info, escalated, resolved, completed, closed, declined, cancelled`), `target_dept`, `cc_user_ids` (string), escalation fields, `ref_code` = `REQ-YYYY-%05d`; `workflow_events` records every action.
- **Appointments:** `appointments` (status `requested/booked/attended/missed/cancelled`, facility, department captured in `notes`, `request_id` link).
- **Clinical (v8):** `encounters` (patient, clinician, date, facility, department, type, `condition_key`/`condition_name`/`icd10`, severity Mild/Moderate/Severe/Critical, notes, prescription, investigation, outcome `Treated/Referred/Admitted/Follow-up booked/Died`, `referral_facility`, `appointment_id`), `pharmacy_purchases` (drug, qty, unit cost, supplier, `batch_ref`), `inventory_items` (stock units, reorder level, status `Available/Low stock/Out of stock`).
- **Platform:** `audit_log` (user, action, entity, previous/new value, device), `notifications` (user or role_target), `alerts`, `tasks`, `data_flags`, `ministry_areas` (11), `ministry_stats` (H1 baseline), `performance_indicators` (Section 12 targets), `settings` (key-value: programme days, sound, AI config, include_demo...), `patient_documents` (ID gate for enrolment), `story_drafts`, `schema_version`.

## 6. Core workflows

**6.1 Login routing:** `ROLE_CONSOLE` in `carelink.py` maps each role to its landing console (chief_administrator → chief console; president/director/data_manager → executive; chief_medical → `/medical`; hospital → hospital desk; field roles → caregiver dashboard; finance/procurement/etc. → their consoles). Login accepts username or email.

**6.2 Verification pipeline (visits):** caregiver signs and submits → admin queue (`/carelink/verify`) → approve → auto-publish after 12 hours OR "publish now" → dashboards count it. Return sends it back to the caregiver. Revoking a published form requires the originating caregiver's re-approval before republish. Draft/saved forms show in the caregiver's "to submit" badge. All published-data queries funnel through `PUBLISHED_SQL` (three literal copies exist in `reports.py` — keep them in sync).

**6.3 Department request workflow:** any role raises a request (11 kinds) targeting a department; the department receives it (badge), acknowledges → assigns → progresses; `awaiting_info` bounces to the requester; escalation (with reason) goes to the Director; full history per request plus CSV export; CC users are notified.

**6.4 Hospital appointments:** a `hospital_appointment` request auto-opens an appointment record. The hospital desk books it with the **cascading facility → department** selects (from `clinical_data.FACILITIES`, "L6 · Name" display values; `book_appointment` strips the prefix and stores the department in `notes`), then marks attended/missed. Caregiver and requester are notified.

**6.5 Clinical encounters (v3.3.0):** `chief_medical`/`hospital`/`admin` open `/encounters/new/<pid>`: facility select cascades departments (JS, `FACILITIES`), condition select previews the first-line protocol, formulary presets insert dose/route/frequency/duration/instructions lines into the prescription, outcome **Referred** or **Follow-up booked** auto-creates an appointment (+7 days, status `requested`, notes `Department: X | Clinic: Y`) and notifies the hospital desk. The patient profile gains a "Clinical encounters" tab (read-only for non-authors; delete links only for chiefs).

**6.6 Deletion governance:** `/encounters/<eid>/delete`, chiefs only (`chief_administrator`, `chief_medical`). Requires justification >= 20 chars AND the chief's own password (verified against PBKDF2). Wrong code → `ENCOUNTER_DELETE_REFUSED` audit row, nothing deleted. Correct → row deleted, `ENCOUNTER_DELETED` audit row with the full justification, and a linked appointment is annotated "encounter deleted by governance" (never destroyed). No silent deletions anywhere in the system.

**6.7 Pharmacy:** procurement/admin record purchases (`/clinical/pharmacy/purchase`) → stock units rise, status re-derives against the reorder level; chief_medical and procurement issue stock (units fall); finance sees both ledgers read-only with month-to-date spend; the sidebar badge shows low/out-of-stock count (`med_low_stock` in `_carelink_badges`). The formulary page shows live stock per drug. Maker/checker separation is deliberate: chief_medical cannot purchase.

**6.8 Programme policy:** intake → 60-90 day programme (default 75, configurable) → benchmark reached at `programme_days` → EXTENDED case beyond `programme_max_days` requires a PDCA; discharge → post-discharge follow-ups. BMI adult bands from 19 years. Weight every ~21 days minimum.

## 7. Roles and access control (25 roles, organogram-accurate)

`ROLES` / `ROLE_LABELS` in `auth.py`: chief_administrator; admin (delegated); president; director; board; chief_medical; chief_ministry; chief_procurement; chief_transport; chief_media; county_coordinator; homabay_coordinator; coordinator; caregiver; hospital (Medical Case Manager); hospital_liaison; data_manager; media; pr; procurement; transport; welfare; finance; auditor; guest.

- **Area scoping:** caregivers/coordinators see their own ministry area only (`scope_areas`); county/homa-bay coordinators see their county's areas; admin/chiefs/director see all. Enforced by `area_filter()` in list queries and `_patient_or_404()`.
- **Patient records:** `_PATIENT_VIEWERS = (caregiver, coordinator, admin, chief_administrator, homabay_coordinator, hospital, chief_medical, hospital_liaison)`; the patient LIST adds `county_coordinator` and `chief_medical`. Finance/auditor/executive/media deliberately have NO unrestricted clinical records access (aggregate-only surfaces instead).
- **Clinical surfaces:** `/medical` = chief_medical, hospital, admin, chief_administrator. `/clinical*` reference = all clinical roles (caregiver upward). `/clinical/pharmacy` = procurement, finance, admin, chief_administrator. Encounter authoring = chief_medical, hospital, admin. Deletion = chiefs only. Executive console shows aggregates, never caregiver workflows. Guest/public views are anonymised (media see codes, never names).
- **Sensitive views** (HIV/TB and spiritual tabs) write `SENSITIVE_VIEW` audit rows. Denied access writes `ACCESS_DENIED`.
- Every POST goes through `csrf_check()` with the `csrf-token` meta tag / hidden `_csrf` input. Idle timeout (default 5 min, settings-driven) signs users out. `/admin/*` restricted to admin + chief.

## 8. The clinical layer in detail (v3.3.0, from the Case Manager's Smart MCM v2.5.0)

- **`clinical_data.py` is pure data** so the Case Manager's master catalog can grow without touching logic: `CONDITIONS` tuples `(key, name, icd10, specialty, hallmark, protocol, severities)` covering infectious/tropical (malaria, TB, MDR-TB BPaLM, HIV/TLD, sepsis, cholera, typhoid, rabies...), cardiology (STEMI, HFrEF, HTN stages, DVT/PE), respiratory (CURB-65 pneumonia, asthma SMART, COPD, ARDS...), GI/hepatology, endocrine (T2DM, DKA, HHS, thyroid, adrenal), nephrology, neurology, obstetrics (pre-eclampsia Pritchard, PPH), paediatrics (SAM 10-step, neonatal sepsis), emergency/trauma (ATLS, compartment syndrome, Parkland burns). `FORMULARY` tuples `(name, class, dose, route, frequency, duration, instructions)` from ARVs (TLD first line) and TB drugs through antibiotics, antifungals, cardiovascular, inotropes, endocrine, respiratory, analgesia, obstetrics, antidotes, IV fluids and community essentials. `FACILITIES`: JOOTRH (L6), MTRH (L6), Kisumu County Referral (L5), Homa Bay T&R (L5), St Elizabeth Lwak (L5), Kendu Adventist (L5), Aga Khan Kisumu (L5), plus L3 clinics, each with real department lists. Medscape links use the stable search endpoint.
- **Interactions:** explicit pairs (rifampicin × DTG double dose; rifampicin × protease inhibitors contraindicated; TDF renal loads; QT stacking; ACEi/ARB + NSAID + diuretic "triple whammy"; isoniazid always with pyridoxine) plus class-level rules in `interaction_for(a, b)` returning `(severity, note)`. The checker advises, never blocks.
- **Calculators:** CURB-65 (5 features, banded), Parkland (4 mL × kg × %TBSA, half in 8 h), Cockcroft-Gault CrCl + CKD-EPI 2021 eGFR with CKD stage G1-G5.
- **Spotlight:** `/clinical/search` plus the Ctrl+K overlay in `base.html` (button `#cl-spotlight-btn`; overlay `#cl-spotlight`; CSS `[hidden]` guard is required because the overlay uses flex). Permission-aware patient hits respect area scoping.
- **Templates:** `templates/medical/` = console, workstation, condition, formulary, interactions, calculators, facilities, spotlight, encounter_form, encounter_delete, pharmacy.
- **Known extension point (NOT yet built):** the formulary footer promises "Users & settings → clinical import (CSV)" for the Case Manager's master 334-drug catalog. The schema supports it; the import UI/action does NOT exist yet. It is the top roadmap item (section 12).

## 9. AI assistant (offline-first, optional AI)

- Three modes in Users & settings → "Assistant (online / offline)": **off** (default, fully offline), **openai** (any OpenAI-compatible endpoint: Ollama `http://127.0.0.1:11434/v1`, LM Studio `http://127.0.0.1:1234/v1`, Groq/OpenAI/OpenRouter/Mistral clouds with Bearer key), **custom** (LOMAMO's own service: POST `{"question": ...}` → `{"answer"|"response"|"text"}`).
- The offline engine (`intelligence.py`) always answers with labelled FACT / CALCULATION / TREND / INTERPRETATION / RECOMMENDATION lines from verified data only, and is the automatic fallback whenever the AI is slow or unreachable ("The AI could not be reached (reason), so the offline answer is shown.").
- AI answers render as "AI DRAFT - (model) - decision support only". De-identification replaces names/codes/phones/e-mails with tokens before sending; only the question text goes out unless the aggregated-summary opt-in is ticked. Settings keys: `assistant_mode`, `assistant_api_base`, `assistant_api_model`, `assistant_api_key`, `assistant_api_timeout` (clamp 5-120), `assistant_online`, `assistant_send_context`. Setup recipes live in `AI_SETUP.md`.

## 10. Testing and verification (the safety net)

- Run: `python3 test_system.py` (about 7 seconds). **389 checks, 0 failures is the ship gate.** It creates a throwaway data dir via `NYALENDA_DATA_DIR` (set BEFORE any project import — a regression here once wrote fixtures into the real dev DB; `import auth` happens after the env var for this reason and a checksum of the dev DB is verified untouched), spins up Flask test clients and mock HTTP servers, and covers: unit maths; 18 acceptance scenarios; security (403s, CSRF, wrong passwords); anonymisation; period reports; assistant; engine idempotency; demo purge keeping targets; the demo dataset coherence (260 patients, >= 4 visits each, >= 2 measurements, requests in every state, appointments, wounds, liver/kidney conditions, stories, wide days-in-programme range, DEMO markers); purge of the full demo layer including encounters/purchases/stock; and the v3.3.0 clinical section (migration v8, encyclopedia content, role surfaces, encounter creation with the JOOTRH/TB-Clinic cascade, auto-referral booking, desk booking with department, interaction rule firing on rifampicin + TLD, Parkland/CrCl/CURB-65 maths, spotlight, deletion governance including wrong-code refusal, purchase/issue ledger with maker/checker refusals, org aggregate, What's new).
- Fixtures created by the suite: testcg/Caregiver!2026, casemgr/Hospital!2026, proc/Procure!2026, finoff/Finance!2026, chiefmed/ChiefMed!2026, chiefadmin/Chief!2026xy, testdirector/Director!2026, plus demo.* accounts (Demo2026!).
- **Browser-level debugging** (Playwright headless Chromium) was used for v3.3.0 and caught two bugs the suite missed: the Ctrl+K overlay needed `.spotlight-overlay[hidden]{display:none!important}`, and chief_medical needed to be in `_PATIENT_VIEWERS`. Keep both around for UI changes.
- Known nits deliberately left (low priority): a stray `{% endif %}` hardening candidate after the watch-list block in `dashboard.html`; finance/auditor console symmetry could be de-symmetrised further.

## 11. Packaging and release process

- Two zips ship per version: `Nyalenda_System_vX.Y.Z_Windows.zip` (payload + `runtime/` embedded CPython 3.12 + `packages/` wheels, started by `START_WINDOWS.bat`) and `Nyalenda_System_vX.Y.Z_Android.zip` (payload only; Termux installs Flask via `START_TERMUX.sh`). Build recipe: re-extract `runtime/` + `packages/` from the v3.0.2 donor zip, add the current payload EXCLUDING `data/`, `__pycache__`, logs, backups; verify the suite runs FROM the Android zip (389/0), `paths.APP_VERSION` matches, and no `.db` is inside. Delete superseded version zips. `START_TUNNEL_WINDOWS.bat` uses cloudflared for a quick public URL; phones connect by QR on LAN as first-class flow (`/diag`, `/ping`).
- Current shipped artefacts: `Nyalenda_System_v3.3.0_Windows.zip` (12,765,420 bytes) and `Nyalenda_System_v3.3.0_Android.zip` (926,408 bytes). Older zips v1.2-v3.0.2 remain in the workspace as history; v3.0.2 is the payload donor.

## 12. Roadmap (agreed extensions, not yet built)

1. **Clinical import (CSV) for the master drug catalog** — UI + action in Users & settings; import/merge semantics already standard elsewhere (Add/Merge/Update/Skip/Review + duplicate detection, never silently overwrite). The formulary footer already promises it.
2. **Encounter editing** (currently create + governed delete only) and encounter PDF/print line.
3. **Prescription → stock link** (auto-issue against `inventory_items` when an encounter is saved, with the maker/checker rule preserved).
4. Finance/auditor console differentiation beyond the current aggregate views.
5. Optional: lab results table, CHV mapping, SMS reminders (designed-for, not built).

## 13. Demo environment quick reference

- Auto-loads on first `/setup` (guarded; can also be loaded/removed in Users & settings). 260 synthetic patients (all names start "DEMO -"), 21 demo accounts (`demo.cg.nyalenda`, `demo.coord.kisumu`, `demo.med` = Chief Medical Case Manager, `demo.hospital`, `demo.liaison`, `demo.admin`, `demo.finance`, `demo.auditor`, `demo.media`, `demo.pr`, `demo.procurement`, `demo.transport`, `demo.welfare`, `demo.data`, `demo.director`, `demo.chief`, password ALL: `Demo2026!`). Data is date-relative (generated around the system date), includes 46 clinical encounters with ICD-10 codes, referral bookings, 12 pharmacy purchases (DEMO batch refs) and 16 stock lines (deliberate Low stock/Out of stock cases). Purge removes patients, accounts, encounters, purchases (by DEMO batch marker), stock (by DEMO supplier marker) while baseline and targets stay untouched. Full cheat sheet: `DEMO_ACCOUNTS.md`.

## 14. How to continue development (for an AI coding agent)

- Read `REVIEW_v3.0.md` Addenda (the authoritative changelog) and this file; then read the specific module before changing it. Respect every rule in section 2 (the owner will reject em dashes, invented figures, ranking, or colour-only statuses on sight).
- Loop: change code → run `python3 test_system.py` (keep 389/0, ADD checks for every new behaviour) → restart the dev server (Flask caches templates) → verify key screens with Playwright screenshots → update `REVIEW_v3.0.md` (new Addendum) + `START_HERE.txt` + What's new template + `paths.APP_VERSION` → rebuild zips per section 11 → delete superseded zips.
- Server restart hygiene: kill by exact PID or `pgrep -f "app[.]py"` (a `pkill -f "app\.py"` pattern can kill the issuing shell); dev DB hygiene: never point tests at `data/`; POST hygiene: fresh CSRF token per request from the same cookie jar.
- Ask the owner before: anything touching real patient data, new roles (organogram PDF is authoritative), or targets/figures (Section 12 is the only source).

---

*Shipped 16 October 2026. Built by 26 YHVH-MELCHIZEDEK. Serving our Neighbours in Love.*
