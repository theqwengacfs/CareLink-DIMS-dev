# CareLink DDMS v3.3.2 - Complete System Image and Developer Handover (Offline-Safe Edition, Fixed Launcher)
## LOMAMO Foundation Kenya - Digital Data Management System
"Serving our Neighbours in Love" - Built by 26 YHVH-MELCHIZEDEK - Copyright 2026

Consolidated 18 October 2026. This is the authoritative continuation document for the latest fixed v3.3.2 package. It combines the v3.3.0 product definition, the v3.3.1 offline-safe rebuild, the v3.3.2 native Ollama update, and the later v3.3.2 START.bat CRLF hotfix. Carry this file together with the fixed full ZIP. If this document and the source code ever disagree, stop, inspect the exact source file, and record the difference before changing behaviour.

---

## Release status and continuation quick start

### Authoritative artefacts

Use the fixed full package. The first v3.3.2 ZIP is superseded because its `START.bat` was saved with LF-only line endings and could flash closed on Windows.

| Artefact | Purpose | Size and contents | SHA-256 |
|---|---|---|---|
| `CareLink_DDMS_v3.3.2_Full_Webapp_FIXED.zip` | Authoritative full source and pre-built offline webapp | 13,367,786 bytes compressed; 2,810 entries; 2,243 files; 39,824,766 bytes uncompressed; no live database | `bc67857665abbdba03da4c2d964da096169a0f047196532f4b5984fd571103c3` |
| `CareLink_v3.3.2_START_FIX.zip` | Small repair for an extraction of the first v3.3.2 ZIP | 6,862 bytes; corrected `START.bat`, updated verifier, apply note | `23ed1b876fdf4b978719ad1b7b861b2417195f071da1e430b495fe97bcc14df2` |
| Corrected `START.bat` inside the fixed package | Windows launcher | 279 CRLF endings, 0 bare LF, no BOM | `174a246ae325568bcac857d056ef248b9c714f667d30ba6d91961760f19f8be6` |
| First `CareLink_DDMS_v3.3.2_Full_Webapp.zip` | Superseded, do not distribute without the START hotfix | 13,365,568 bytes compressed; 39,821,194 bytes uncompressed | `11ea7d541ab8784459581bf0eee29379965ae3b39eeec1d065ae8b494ef431c4` |

This consolidated handover was written after the fixed ZIP and is not inside that ZIP. The fixed ZIP contains the earlier `CARELINK_DDMS_v3.3.2_SYSTEM_IMAGE.md`. Treat this consolidated file as the later and fuller record.

### Take these to another PC

1. `CareLink_DDMS_v3.3.2_Full_Webapp_FIXED.zip`.
2. This Markdown handover.
3. A separate backup of the real `data` folder if real records already exist. Copy it only while CareLink is stopped.
4. Ollama itself and any wanted Ollama models. They are not inside the CareLink ZIP.
5. The real LOMAMO logo file if replacing the shipped placeholder.

### Fastest correct start on the new PC

1. Install Node.js 22 LTS once. Node 20 or 24 LTS is acceptable; Node 26 works on the pre-built path but is not the recommended development baseline.
2. Extract the fixed ZIP with Extract All. Do not run files from the ZIP preview.
3. Optional but recommended: double-click `VERIFY_PACKAGE.bat`. It must say READY and pass both batch CRLF checks.
4. Double-click `START.bat` in the extracted root. The browser opens `http://localhost:3000`. A clean package goes to `/setup`.
5. For development instead of the pre-built server, open a terminal in the extracted root and run `npm install --no-audit --no-fund`, then `npm run dev`.

### Five warnings before touching code

- Never delete or casually overwrite `data/carelink-db.json`. Stop the server and back up the whole `data` folder first.
- `START.bat` and `VERIFY_PACKAGE.bat` must remain Windows CRLF files. Do not let a text-mode script rewrite them as LF-only.
- There is no test framework or shipped automated test suite in the repository. The release tests were external API and package checks. Recreate smoke tests with a disposable data directory.
- The file database is cached in one Node process and rewritten as one JSON document per mutation. Do not run two CareLink servers against the same data directory.
- No Git repository was present at handover. Initialise version control on the new PC before substantive work, with patient data and backups excluded.

## 1. Product identity

Product name: CareLink DDMS (Digital Data Management System), v3.3.2 Offline-Safe Edition.
Owner: LOMAMO Foundation Kenya, a community health ministry operating in Kisumu County and Homa Bay County, Kenya.
One system of record: every department (field care, hospital, finance, procurement, transport, welfare, media, PR, audit, leadership) works in this single system with one login. Nyalenda is one ministry area among eleven, never a separate product.
Origin: v1 began as a Nyalenda-only patient system and was transformed (not discarded) into the organisation-wide platform. The January to June 2026 mid-year report is the preserved baseline. Section 12 of that report is the sole source of every performance target.
Landing branding: deep navy (#1F3864) and gold (#C9A227), cream sign-in panel, tagline "Serving our Neighbours in Love" in yellow, 2026 copyright, discreet credit "Built by 26 YHVH-MELCHIZEDEK". The header displays public/LOMAMO-placeholder-logo.png with object-fit contain, so replacing that one file with the real LOMAMO logo shows it whole, never cropped. The shipped placeholder is a neutral navy and gold mark, not a redrawn logo.
Current build: Next.js 16.2.6 (App Router), React 19, TypeScript 5.9, Lucide React icons, plain CSS design system. Production build verified on 18 October 2026: next build passes, TypeScript passes with 0 errors, 55 routes.

## 2. Ground rules (non-negotiable, unchanged)

- Plain British and Kenyan English in all user-facing strings. Hyphens only. No em dashes or en dashes anywhere.
- Real patient-data integrity above everything. Never overwrite the database silently. Changes run Backup, Validate, Migrate, Verify, Activate. The data directory is persistent and never deleted on upgrade or by any launcher path.
- No invented data, ever. Targets come only from the H1 2026 baseline and Section 12. In v3.3.2 the eleven areas ship with baselinePatients and targetMonthlyVisits empty (null) and display "Not entered yet" until the Chief Administrator copies Section 12 figures into Settings. Demo data is synthetic, labelled DEMO, removable in one click, never presented as real. Quality of care outranks target numbers.
- Dashboards show verified and published data only. Every published-visit figure funnels through publishedVisits() in src/lib/store.ts.
- The master administrator never authors home visit forms. VISIT_AUTHORS is caregiver and coordinator only, enforced in /api/visits. Real passwords are salted PBKDF2 (120k iterations, sha512, 16-byte salt) and are never listable. publicUser() strips hash and salt.
- Account requests are never auto-approved. The first /setup account becomes the Chief Administrator.
- No colour-only status. Every status carries a text label (StatusBadge). No overall ranking of caregivers or areas. Targets are app prompting only.
- Mobile has full parity. Every sidebar item appears in the mobile More sheet.
- Core functions work offline on local Wi-Fi or LAN, including phone access via the Diag kit. The optional online AI is the only online-dependent feature and always falls back offline with the reason shown.
- AI is decision support only, labelled AI DRAFT, never diagnoses, prescribes, or decides enrolment or discharge. Insufficient data is preferred over fabrication.
- Audit everything sensitive. Audit rows are append-only in spirit and timestamps are never silently altered.
- Every issue follows Identify, Diagnose, Fix, Test, Verify, Document.

## 3. Tech stack and how to run (v3.3.2 updated)

| Layer | v3.3.2 offline-safe choice |
|-------|----------------------------|
| Framework | Next.js 16.2.6 App Router, React 19, TypeScript 5.9 |
| Styling | Plain CSS in src/app/globals.css. No Tailwind native binary, so Windows builds cannot be blocked by a blocked postinstall step |
| Icons | Lucide React |
| Offline database | File database in data/carelink-db.json via src/lib/store.ts. Node built-ins only (fs, crypto). Atomic writes (temp file then rename). Automatic dated backups in data/backups |
| Passwords | Node crypto PBKDF2, 120k iterations, sha512, 16-byte salt |
| Online path | PostgreSQL remains a documented future migration. The JSON backup from /api/offline/export is the migration file. drizzle.config.json and src/db/schema.ts (table map) are kept for that path. DATABASE_URL is not required offline |
| Server | Pre-built standalone server, node .next/standalone/server.js, binds 0.0.0.0 port 3000 |
| Environment | `.env` defaults are OFFLINE_MODE=true, USE_FILE_DB=true, CARELINK_DATA_DIR=./data, PORT=3000 and HOSTNAME=0.0.0.0. The launchers override the data directory with an absolute package-root path |

Why the database and styling layers changed is recorded honestly in Section 17. The user-visible product, routes, workflows and ground rules are preserved. Production dependencies are deliberately only next, react, react-dom and lucide-react. TypeScript, ESLint and Node and React type packages are devDependencies. `package-lock.json` is the reproducible install source.

Run commands for developers:
    npm install --no-audit --no-fund
    npm run typecheck
    npm run build
    npm run package
    npm run verify
    npm run start:standalone
Use npm run dev for hot-reload development on http://localhost:3000. START.bat remains the normal office launcher.

Windows launcher (START.bat), the normal way to run offline:
1. Extract CareLink_DDMS_v3.3.2_Full_Webapp_FIXED.zip to a folder.
2. Install Node.js 22 LTS once (20 or 24 LTS also fine). Node 26 runs the pre-built path but LTS is recommended.
3. Double-click START.bat inside the extracted folder.
4. The launcher finds the project folder, verifies the package, backs up data, runs the pre-built server, and opens http://localhost:3000. No internet, no npm install, no build.
5. First launch sends you to /setup. Create the Master Chief Administrator.
6. Stop by closing the START.bat window or pressing Ctrl+C. Records stay in data.

Mac and Linux: chmod +x START_MAC_LINUX.sh, then ./START_MAC_LINUX.sh. It mirrors START.bat step for step.

Launcher safety contract:
- A folder counts as the project root only if package.json and src/app/layout.tsx exist together. If the ZIP extracted as a folder inside a folder, the launcher steps into the correct folder by itself.
- scripts/verify-package.mjs runs before any long step and fails clearly if src/app is missing. VERIFY_PACKAGE.bat exposes the same check.
- Preferred run path is the shipped pre-built standalone server. Existing production builds are reused. A source build happens only if both are missing, and then the launcher enables install scripts, runs npm approve-scripts --allow-scripts-pending and npm rebuild before building. Internet is needed for that fallback only.
- .env is created only if missing and is never overwritten. data is backed up on every launch and is never deleted. The launchers pass an absolute CARELINK_DATA_DIR, and packageRoot() in store.ts also detects the standalone server working directory (<root>/.next/standalone) exactly, so records always land in the package-root data folder and never inside .next. Every error path pauses with plain-English next steps.

## 4. File map (actual v3.3.2 tree)

Root:
- package.json, package-lock.json - versions and scripts (dev, build, start, start:standalone, lint, typecheck, verify, package)
- next.config.mjs - output standalone, images unoptimized (removes the sharp native binary)
- tsconfig.json, eslint.config.mjs, drizzle.config.json
- .env, .env.offline.example - offline defaults, no secrets
- START.bat (CRLF), VERIFY_PACKAGE.bat (CRLF), START_MAC_LINUX.sh - launchers and verifier
- README_FIRST.txt, OFFLINE_FIX_NOTES.txt, DEMO_ACCOUNTS.txt, PACKAGE_MANIFEST.txt, OLLAMA_SETUP.txt
- CareLink_DDMS_v3.3.2_Offline.html - single-file offline app snapshot
- CARELINK_DDMS_v3.3.2_SYSTEM_IMAGE.md - package copy of the v3.3.2 System Image. This consolidated handover is the later external continuation record.
- CARELINK_v3.3.2_OLLAMA_UPDATE_REPORT.md and CARELINK_v3.3.2_START_FIX_REPORT.md in the development workspace. They are not required at runtime.
- scripts/verify-package.mjs - two-second package diagnosis, no dependencies, includes the batch CRLF check
- scripts/build-package.mjs - copies .next/static and public beside the standalone server and removes development database copies traced under .next/standalone/data

src/lib:
- store.ts - file database, baseline seeding, demo seed and purge (21 users, 260 patients), publishedVisits funnel, area scoping, data quality score, sessions, audit and notify helpers. This consolidates the v3.3.0 index, ensureSchema and seedDatabase responsibilities for the offline file database
- password.ts - PBKDF2 hashing, constant-time verification, tokens and IDs
- textAssets.ts - user guide text, demo accounts text, single-file offline HTML generator
- zip.ts - store-only ZIP writer for the Offline Kit download

src/db:
- schema.ts - table map shared by the file database and the future PostgreSQL migration

src/data:
- clinicalData.ts - 80 conditions (ICD-10, specialty, hallmark, severities, first-line summary, Medscape search link), 120 formulary drugs with presets, 8 interaction rules plus checkInteractions, 10 referral facilities with department cascades, CURB-65, Parkland, Cockcroft-Gault, CKD-EPI 2021 and BMI calculators
- organogram.ts - 22 role definitions with console and permission flags, VISIT_AUTHORS ground rule, 11 ministry area seeds with empty Section 12 fields, 21 demo accounts, request kinds and states

src/context:
- AuthContext.tsx - session provider, first-launch redirect to /setup, Ctrl+K spotlight state, assistant drawer state, sound chime, 15-minute idle safety sign-out

src/components:
- layout/AppShell.tsx - header with LOMAMO branding, sidebar for every console, mobile bottom bar plus full More sheet parity, Spotlight modal (conditions, ICD-10, formulary, permission-aware patients, facilities, consoles), Assistant drawer, service worker registration, stock alert badge
- boards.tsx - WhatMatters insight board, RequestBoard (raise and transition with history and CSV), PharmacyBoard (purchase and issue with maker-checker notes), AppointmentsBoard (facility cascade booking), AuditTable with CSV export, shared fetch helpers
- ui.tsx - StatusBadge (always text), RequireSignIn and role notice, KPI cards, page heading, CSV download helper

src/app pages (33):
- page.tsx landing and sign-in, setup/page.tsx, offline/page.tsx download centre
- carelink chief, exec, caregiver, hospital, verify, procurement, finance, audit, welfare, transport, media, guest consoles
- medical Smart MCM console with encounter composer and governed deletion dialog
- patients registry, new intake, [id] 16-section profile with 13-section visit form, wounds register launcher, PDCA board
- clinical conditions, formulary, interactions, calculators, facilities, CSV import
- appointments, pharmacy, reports, performance, settings, diag phone kit

src/app API routes (20):
- health, ping, setup, auth/session, patients, patients/[id], visits, encounters, requests (appointments included), pharmacy, clinical/master-drugs, intelligence, assistant, admin, reports, offline/bundle, offline/export, offline/guide, offline/demo-accounts, offline/full-package (Offline Kit ZIP plus checklist)

public:
- manifest.webmanifest, sw.js (shell cached, API never cached), icon-192.png, icon-512.png, LOMAMO-placeholder-logo.png

## 5. Data architecture

One JSON document per deployment at data/carelink-db.json with one array per table: users, sessions, accountRequests, patients, visits, measurements, foodbags, pdcaRecords, encounters, serviceRequests, workflowEvents, appointments, pharmacyPurchases, inventoryItems, pharmacyIssues, patientConditions, patientMedications, wounds, hospitalisations, discharges, followups, childrenRecs, distributions, spiritualCare, stories, documentsRecs, auditLog, notifications, settings, masterDrugs, ministryAreas, counters. Schema version is stored in the file. On load, a version change first copies a before-migrate backup. An unreadable file is preserved as a dated backup and never silently overwritten. Writes go to carelink-db.json.tmp then rename, so a power cut cannot half-write the live file. Sessions are excluded from exports. Password fields store hash and salt only.

Fresh databases seed only structure and reference data: 11 areas with empty Section 12 fields, default settings (programme 75 days, maximum 90, measurements every 21 days, AI mode offline), and the master drug catalogue. No opening stock lines are seeded, so stock figures are never invented. A stock line is born from a recorded purchase.

## 6. Core workflows (as implemented and tested)

Login routing by ROLE_CONSOLE exactly as v3.3.0. Login accepts username or email. First setup account is Chief Administrator.
Verification pipeline: draft to submitted to approved to published, with returned and revoked paths. Verifiers act in /carelink/verify. Publishing is explicit (Publish now), so nothing publishes silently while an offline laptop is off. That is the one deliberate simplification of the v3.3.0 12-hour auto-publish description, recorded here honestly.
Department requests: 11 kinds, 13 states, full workflow history, CSV export, escalation to the Director requires a reason, CC notifications, awaiting_info returns to the requester through the normal transition controls.
Hospital appointments: a hospital_appointment request or a referred encounter opens a requested appointment. Hospital Desk books with facility then department cascade, then attended, missed or cancelled. The caregiver is notified.
Clinical encounters: authored by chief_medical, hospital and admin only. Facility cascades departments, condition previews first-line summary, formulary picker inserts complete preset lines. Referred or follow-up outcomes create a requested appointment 7 days out.
Deletion governance: DELETE /api/encounters for chief_administrator and chief_medical only, justification 20 characters or more plus own-password re-verification. Refusals write ENCOUNTER_DELETE_REFUSED and delete nothing. Success writes ENCOUNTER_DELETED with justification and annotates any linked appointment instead of destroying it. All three branches are covered by automated tests.
Pharmacy: purchases raise stock, issues lower it and cannot exceed stock on hand. Maker-checker separation: chief_medical cannot purchase. Finance sees read-only ledgers and month-to-date spend. Status is derived and labelled In stock, Low stock or Out of stock. The sidebar shows an alert count badge with words.
Programme policy: intake opens Visit 1, baseline BMI, 60 to 90 day guide with settings-driven benchmark and maximum, extended cases surface on the PDCA board as a review prompt, measurements about every 21 days.

## 7. Roles and access control

22 roles in five groups as listed in organogram.ts. Patient viewers are caregiver, coordinator, county coordinators, admin, chief_administrator, hospital, chief_medical, hospital_liaison, chief_ministry and data_manager. On the scoped registry and patient-list paths, caregivers and coordinators see their own ministry area only (24 of 260 demo patients for the Nyalenda caregiver in tests). County coordinators see their county areas. Appendix K1 records direct-record and related API scope gaps that must be hardened before any wider network exposure. Chiefs, administration and leadership see all areas for their functions, while non-clinical roles receive a clear refusal from patient APIs plus an ACCESS_DENIED audit row on registry access. Opening a patient profile writes SENSITIVE_VIEW. Failed logins write ACCESS_DENIED. Every demo account maps to its console for audit.

## 8. Clinical layer (Smart MCM)

80 conditions including every condition named in v3.3.0 Section 8.1, each with ICD-10, hallmark, severities, first-line summary and a stable Medscape search link. 120 formulary medicines across ARVs, TB therapy, antibiotics, antifungals, cardiovascular, inotropes and emergency care, endocrine, respiratory, analgesia, obstetrics, antidotes, IV fluids, nutrition, eye, skin and family planning, each with a one-click preset and live stock where stocked. Eight explicit interaction rules including rifampicin with dolutegravir dose doubling, rifampicin with protease inhibitors contraindicated, tenofovir renal load, QT stacking detection across listed drugs, the triple whammy combination, isoniazid always with pyridoxine, metronidazole with alcohol, and warfarin caution. Calculators implement CURB-65 bands, Parkland with hourly rates, Cockcroft-Gault and CKD-EPI 2021 with G-stage, and adult BMI from 19 years. Ten facilities exactly as v3.3.0 with department cascades. All clinical text is reference material with a verify-against-current-Kenya-guidelines notice. The system never auto-prescribes.

## 9. AI assistant

Four modes in Settings: built-in offline engine (default), native Ollama on this computer, OpenAI-compatible endpoint, and custom endpoint. Ollama mode uses the chief-only GET /api/assistant actions tags and test to detect models from http://127.0.0.1:11434/api/tags, test a selected model through /api/chat, and save one exact model name from ollama list. It stores the service base, model, 120-second default timeout and keep-alive choice. No model files are copied into CareLink. Model calls de-identify question text (patient names, LOM codes, phones, emails), use a fixed guardrail system prompt, and only receive verified aggregate CareLink totals when the chief explicitly enables that option. Answers are stamped AI DRAFT with the engine, audit records the question and engine never the reply, and failures fall back to the built-in offline engine with the reason shown. All modes refuse diagnosis, prescribing and enrolment or discharge decisions. No API key is stored in the browser or database, and Ollama needs no key. OLLAMA_SETUP.txt is the office procedure.

## 10. Testing and verification (actual results, 18 October 2026)

- npx tsc --noEmit passes with 0 errors.
- npm run build passes on Next.js 16.2.6 (Turbopack). Route manifest lists 55 routes: 33 pages, 20 APIs, plus framework routes.
- node scripts/build-package.mjs assembles standalone statics. node scripts/verify-package.mjs reports READY with 0 warnings on the shipped tree.
- Negative test: verifier run on a folder with package.json but no src/app exits 1 and names the exact v3.3.0 screenshot error with fix steps, before any install.
- Nested extraction test: launcher run from an outer folder finds the inner project folder by the package.json plus src/app/layout.tsx rule.
- Data location test on the exact shipped staging tree: the standalone server is known to change its working directory into .next/standalone, which once placed a test database there. The shipped code detects that exact path shape and the launchers also pass an absolute data directory. Re-testing confirmed the database is created at package-root data/carelink-db.json and no database exists inside .next/standalone/data. This is why staging tests must always run on the final tree, not only on the development tree.
- Standalone server boots offline and /api/health returns status ok, version 3.3.2.
- Ollama integration suite passes against a local mock Ollama service returning the six installed model names from the office screenshot: chief-only model detection, model test, native /api/chat answer, question de-identification before sending, verified aggregate context only when enabled, no context when disabled, and clear offline fallback when the selected model is missing. Real model speed and answer quality still need one supervised test on the Windows computer because the build sandbox does not contain the multi-GB model weights or the office GPU and memory.
- End-to-end API suite (37 checks) passes: fresh database needsSetup, master creation, password fields never returned, demo seed exactly 21 users and 260 patients, DEMO labelling, 772 published demo visits counted and drafts excluded, exactly 2 deliberate demo stock alerts across 16 demo stock lines, chief administrator refused visit authorship, caregiver submits a visit, data manager approves and publishes it, referral encounter auto-creates an appointment, governed deletion refused for short justification and wrong password then succeeds for a chief with both audits present, chief medical refused pharmacy purchase, assistant refuses prescribing and answers counts offline with AI DRAFT stamp, reports return 11 areas with null Section 12 figures (nothing invented), public account request receives REQ-2026-00001 as pending, offline bundle, guide, demo accounts and export download correctly, Offline Kit ZIP passes integrity test with 9 files in v3.3.2.
- Area scoping proven: the Nyalenda demo caregiver sees 24 patients. The chief sees 260.
- START.bat incident and correction: the first v3.3.2 launcher was accidentally rewritten with 261 LF-only endings and could flash closed because Windows cmd can misread goto labels in LF-only batch files. The fixed launcher has 279 CRLF endings, 0 bare LF, no BOM, 19 unique labels, no missing real goto or call target, 11 pause statements, server exit-code capture, backup copy and approve-scripts fallback, and no data deletion command. A negative test converted the fixed file back to LF and the updated verifier exited 1 with the exact CRLF failure. The corrected full ZIP was then extracted fresh, verified READY and smoke-tested. cmd.exe itself still cannot run in the Linux build sandbox, so the first Windows run remains a supervised execution proof.
- Em dash and en dash scan across source, text assets and launchers: none found.
- Fixed full ZIP check: integrity passes, 2,810 entries and 2,243 files, no live carelink-db JSON inside, and fresh extraction health returns version 3.3.2 with needsSetup true while /setup returns HTTP 200.

## 11. Packaging and release process

Master artefact: CareLink_DDMS_v3.3.2_Full_Webapp_FIXED.zip. It contains source (package.json, package-lock.json, configs, src, public, scripts), launchers, docs, an empty data folder with DO_NOT_DELETE.txt, and the pre-built .next standalone server with statics copied in. It deliberately excludes node_modules (the standalone server carries its own traced runtime), any live carelink-db.json, and test backups, so first launch correctly opens /setup. Build order: npm install, typecheck, build, node scripts/build-package.mjs, verify, test against a disposable database, reset data to the clean state, zip from a staging copy, verify batch CRLF and the ZIP listing, unzip to a fresh folder, run the server and API smoke tests, then record sizes and SHA-256 in the release test report. Appendix I gives the exact staging inclusions and exclusions used for the fixed v3.3.2 ZIP.
In-app downloads: single-file offline HTML (clinical library plus on-device notes with JSON export and import, about 42 KB before user notes), full JSON backup, plain-English guide, demo accounts, and an Offline Kit ZIP with 9 files (offline HTML, guide, demo accounts, both launchers, README, OLLAMA_SETUP.txt, offline fix notes and checklist). The in-app kit is not a re-zipped source tree, by design, so it cannot quietly lose src/app the way the old package route risked doing. The master ZIP remains the source of truth.
Single-file offline app keeps a per-device copy in localStorage. Sync is JSON export and import plus office entry, exactly as v3.3.0 stated.

## 12. Roadmap (unchanged intent)

Verify the 334-drug master catalogue import with the real LOMAMO CSV at /clinical/import. Encounter editing and print view. Prescription to stock auto-issue with maker-checker preserved. Richer finance and auditor differentiation. Optional lab results, CHV mapping and SMS reminders. Optional PostgreSQL migration using the JSON backup when a hosted deployment is wanted.

## 13. Demo environment

Seeded on demand from Chief Console or Settings. 21 demo accounts, password Demo2026!, 260 synthetic patients all named with a DEMO prefix, 772 published visits plus forms in other states, measurements with trends, about 8 percent extended cases for PDCA practice (25 in the verified test run), 46 encounters, 12 purchases and 16 stock lines with exactly 2 deliberate alerts (one Low stock, one Out of stock), wound cases on roughly one in twelve patients, 8 appointments. Dates are generated relative to seed day with a fixed seed, so the set is stable. Purge removes demo users, patients and linked records and keeps real records, areas and settings. A settings switch can exclude demo records from dashboards without deleting them.

## 14. Demo accounts

Identical to v3.3.0 Section 14. Usernames: daniel.chief, demo.med, demo.cg.nyalenda, demo.coord.kisumu, demo.homabay, demo.chiefministry, demo.hospital, demo.liaison, demo.data, demo.director, demo.president, demo.board, demo.admin, demo.finance, demo.auditor, demo.procurement, demo.transport, demo.welfare, demo.media, demo.pr, demo.guest. Password for every demo account: Demo2026!. The master account is created by the owner at /setup and is never a demo account.

## 15. How to continue development

Read this document and the module before changing it. Respect Section 2. Loop: change, typecheck 0 errors, build, assemble standalone, verify package, run the end-to-end suite against a disposable data directory, reset demo and test data, update this document, README_FIRST.txt and OFFLINE_FIX_NOTES.txt, then rezip from staging and record SHA-256. Never let an editor, formatter or text-mode script convert `.bat` files away from CRLF. Ask the owner before touching real patient data, roles (printed organogram is authoritative) or Section 12 figures. When the real LOMAMO logo file is supplied, replace public/LOMAMO-placeholder-logo.png at the same path. No code change is needed and the logo is never cropped.

## 16. Honest limitations

This v3.3.2 tree was rebuilt from the v3.3.0 System Image document, because only that document and the failure screenshots were supplied for the repair. It is a faithful rebuild of the specified product, not a byte-for-byte recovery of the previous source tree. If the owner supplies the original v3.3.0 ZIP, the same launcher, verifier and standalone packaging can be applied to that exact code.
Ministry Areas 02 to 11 ship as editable placeholder names because the document confirms Nyalenda and the two counties but does not list the other ten names. Section 12 figures ship empty for the same reason. Both are one Settings session away from correct, and guessing either would break the no-invented-data rule.
Publishing is an explicit verifier action rather than a 12-hour timer, to avoid silent state changes on machines that sleep or power off.
The file database suits a single office server and LAN use. It is not a multi-server database. Use the JSON backup to migrate when hosting is required.
Clinical summaries are concise references, not a substitute for current Kenya national guidelines, facility protocols or specialist advice.
The Diag page shows an honest QR placeholder card for the office to complete with its real LAN address, rather than generating a QR that could point somewhere wrong.
The original v3.3.2 START.bat had an LF-only line-ending defect that could make the window flash closed. The fixed package corrects it and the verifier now checks CRLF. START.bat was byte-checked and statically validated, and its logic was exercised through the Mac and Linux twin plus standalone tests. Supervise the first run on the office Windows computer and confirm Windows Firewall allows Node.js on the private network for phone access.

## 17. What changed in v3.3.2 and why (the offline fix)

Diagnosis from the screenshots: the v3.3.0 launcher ran next build in a folder without src/app and failed with "Could not find any pages or app directory". Contributing causes were a package assembled or extracted at the wrong root, Node 26 non-LTS with npm blocking esbuild and sharp install scripts, and a design that compiled 447 packages on the office machine at first launch.
Fixes shipped: (1) the build is done before shipping and START.bat runs the pre-built standalone server, so no build, install or internet is needed offline; (2) a dependency-free verifier catches a missing src/app in two seconds with human instructions; (3) launchers auto-find the true project root even after nested extraction; (4) the source-build fallback enables and approves install scripts for newer npm and recommends LTS; (5) sharp is removed by unoptimized images, Tailwind native tooling is replaced by plain CSS, and the offline database uses Node built-ins only, deleting whole classes of Windows install failure; (6) .env is create-only, data is backed up every launch and never deleted by any path, and every launcher error pauses with next steps. OFFLINE_FIX_NOTES.txt carries the full user-facing explanation.
Version stays in the 3.3 line as 3.3.2 because the product definition did not change. The delivery, packaging and offline runtime were made safe. The v3.3.2 step adds native Ollama detection, model selection and testing without bundling model weights or changing the record schema in a breaking way. Existing v3.3.1 data folders migrate by adding the new assistant settings after the normal schema backup. A later packaging-only correction fixed the first v3.3.2 START.bat, whose LF-only line endings could make Windows cmd exit before pause. That fix restored strict CRLF, captured server error codes, added an err_server pause and made the verifier fail on LF-only batch files. The fixed full ZIP and small hotfix ZIP named at the top of this document supersede the first v3.3.2 ZIP.

## Appendix A - Starting prompt for the next developer or AI

Paste this together with the whole document and provide the fixed ZIP source tree:

```text
You are continuing CareLink DDMS v3.3.2 for LOMAMO Foundation Kenya.

Read CARELINK_DDMS_v3.3.2_COMPLETE_SYSTEM_IMAGE_AND_HANDOVER.md in full before proposing or editing code. Use CareLink_DDMS_v3.3.2_Full_Webapp_FIXED.zip as the source baseline. Do not use the first v3.3.2 ZIP unless the START fix has been applied.

Non-negotiable rules:
- Plain British and Kenyan English. Hyphens only, no em dashes or en dashes.
- Never delete or silently overwrite data or data/carelink-db.json. Stop the server, back up, validate, migrate, verify, then activate.
- Never invent patient records, clinical facts, area names, baselines or targets. Section 12 of the H1 2026 report is the only target source. Printed organogram is the role source.
- Dashboards count published visits only through publishedVisits().
- Master and Chief Administrator never author home visit forms. Actual API authors are caregiver and coordinator only.
- Demo data must stay synthetic, labelled DEMO and removable in one action.
- AI is AI DRAFT decision support only. Never diagnose, prescribe or decide enrolment or discharge.
- Preserve offline-first operation. Ollama and remote AI are optional and must fall back to the built-in engine.
- START.bat and VERIFY_PACKAGE.bat must keep CRLF line endings.

Work loop:
1. Inspect the exact files before editing.
2. Explain the change and affected routes or collections.
3. Make the smallest safe change.
4. Run npm run typecheck, npm run build, npm run package and npm run verify.
5. Test with a disposable CARELINK_DATA_DIR, never a real data folder.
6. Test role access and audit rows for every sensitive change.
7. Rebuild and rezip from clean staging, prove there is no live database in the ZIP, and record SHA-256.
8. Update this handover, README_FIRST.txt, user-facing notes and the test report.

If a needed clinical fact, target, area name, logo or business rule is not in the document or source, ask the owner. Do not guess.
```

## Appendix B - Move development to another PC

### B1. Recommended transfer

Use the fixed full ZIP. It contains the complete source and a pre-built standalone runtime. On Windows PowerShell, verify it before extraction:

```powershell
Get-FileHash .\CareLink_DDMS_v3.3.2_Full_Webapp_FIXED.zip -Algorithm SHA256
```

The hash must match `bc67857665abbdba03da4c2d964da096169a0f047196532f4b5984fd571103c3`.

Extract to a short path such as `C:\CareLink\CareLink_DDMS_v3.3.2`. Avoid OneDrive-controlled or read-only folders for live data if file locking or sync delays become a problem.

### B2. Run without development

Install Node.js 22 LTS once, then:

1. Double-click `VERIFY_PACKAGE.bat`.
2. Double-click `START.bat`.
3. Open `http://localhost:3000` if the browser does not open.
4. Keep the launcher window open. Close it or use Ctrl+C to stop.

The launcher checks Node 20 or newer, finds the true root by requiring both `package.json` and `src/app/layout.tsx`, runs the package verifier, backs up `data/carelink-db.json`, creates `.env` only if missing, refuses a busy port, runs the pre-built standalone server when present, and pauses on all handled errors. If the standalone server is absent it may reuse a normal production build or perform a one-time source build with internet.

### B3. Development commands

From the extracted root in Command Prompt or PowerShell:

```bat
node -v
npm -v
npm install --no-audit --no-fund
npm run typecheck
npm run dev
```

Production build and package assembly:

```bat
npm run build
npm run package
npm run verify
START.bat
```

Useful scripts from `package.json`:

| Script | Exact command | Use |
|---|---|---|
| `npm run dev` | `next dev -H 0.0.0.0 -p 3000` | Development with hot reload |
| `npm run build` | `next build` | Production and standalone build |
| `npm run start` | `next start -H 0.0.0.0 -p 3000` | Production through installed node_modules |
| `npm run start:standalone` | `node .next/standalone/server.js` | Pre-built server path |
| `npm run lint` | `eslint src --ext .ts,.tsx` | Lint source |
| `npm run typecheck` | `tsc --noEmit` | Type gate, must be 0 errors |
| `npm run verify` | `node scripts/verify-package.mjs` | Package structure and CRLF gate |
| `npm run package` | `node scripts/build-package.mjs` | Assemble standalone statics and manifest |

The release was built in a Linux sandbox on Node v20.20.2 and npm 10.8.2. The package engine requirement is Node 20 or newer. Node 22 LTS is the recommended Windows baseline.

### B4. Disposable test database

Never test destructive changes against the office `data` folder. In Command Prompt:

```bat
set CARELINK_DATA_DIR=%CD%\test-data
set PORT=3001
set HOSTNAME=0.0.0.0
set OFFLINE_MODE=true
set USE_FILE_DB=true
node .next\standalone\server.js
```

Stop the server before deleting or replacing `test-data`. For a clean first-run proof, health must show `needsSetup: true` and 0 patients.

### B5. Moving real records

1. Stop CareLink on both PCs.
2. Copy the whole old `data` folder to backup media.
3. Extract the fixed ZIP on the new PC.
4. Before first launch, replace only the new empty `data` folder with the copied real `data` folder.
5. Start CareLink and sign in. Schema 332 defaults are added without deleting records. A schema change first creates a before-migrate backup.
6. Verify user, patient, visit and stock counts before using the new PC for real work.

Do not copy `data/carelink-db.json` while the server is running. The database is cached in process memory, and the next mutation can rewrite the whole file from cache.

### B6. Start version control

No Git repository existed at handover. Before the first commit, create a `.gitignore` at least with:

```gitignore
node_modules/
.next/
data/carelink-db.json
data/carelink-db.json.tmp
data/backups/
logs/
*.log
tsconfig.tsbuildinfo
.env*.local
test-data/
```

Never commit patient data, JSON backups, API keys, staff password lists or Ollama model weights. The shipped `.env` contains only safe offline defaults, but local secrets still belong outside source control.

### B7. Ollama on the new PC

Ollama is separate from CareLink. Install Ollama once while online, pull only the models needed, and thereafter they can run offline. The models seen on the original Windows PC were:

- `gemma4:12b`
- `gemma3:4b`
- `qwen3:4b`
- `phi4-mini-reasoning:latest`
- `relational/VULCAN:latest`
- `qwen3.5:4b`

Recommended first model is `qwen3.5:4b`. Pulling all six was about 22.5 GB in the screenshot. In CareLink Settings choose Ollama on this computer, address `http://127.0.0.1:11434`, detect, select, test, set Verified CareLink totals to Yes for record-count questions, timeout 120 seconds, keep loaded 5 minutes, then save. `OLLAMA_SETUP.txt` is the office procedure.

## Appendix C - Runtime architecture

### C1. Request flow

1. `src/app/layout.tsx` wraps every route in `AuthProvider` and `AppShell`.
2. `AuthContext` calls `/api/auth/session` and `/api/setup`, redirects to `/setup` when no real Chief Administrator exists, tracks sound, Ctrl+K Spotlight and Assistant state, and applies a 15 minute client idle sign-out.
3. Pages are client components. Shared fetching is through `useFetch` and `postJson` in `src/components/boards.tsx`, always with relative URLs and no-store reads.
4. API routes read the `carelink_session` cookie or a Bearer token through `getTokenFromRequest`, resolve the session with `sessionUser`, enforce route rules, use `loadDb` for reads and `mutate` for synchronous writes, then return JSON.
5. `saveDb` writes `carelink-db.json.tmp` and renames it over `carelink-db.json`. Sensitive operations call `audit`; user and role messages call `notify`.

### C2. Data path rule that must not regress

Next standalone changes the working directory to `.next/standalone`. CareLink therefore resolves data as follows:

1. An absolute `CARELINK_DATA_DIR` always wins. Both launchers set it to the package-root `data` folder.
2. If the working directory ends `.next/standalone`, `packageRoot()` goes exactly two levels up.
3. Otherwise it walks upward for `package.json` plus `src/app/layout.tsx`, or `START.bat` plus `data/DO_NOT_DELETE.txt`.

Do not replace this with marker-only detection. The standalone tree contains traced `package.json` and `src` copies, which once fooled detection and put a test database under `.next`.

### C3. Key source modules

| File | Responsibility |
|---|---|
| `src/lib/store.ts` | DB shape, schema 332, path resolution, atomic file DB, cache, baseline seed, demo seed and purge, counters, audit, notifications, sessions, patient visibility, published visits, stock status and data quality |
| `src/lib/password.ts` | PBKDF2-SHA512, 120,000 iterations, 64-byte key, 16-byte salt, timing-safe verify, 32-byte session tokens, prefixed random IDs |
| `src/lib/textAssets.ts` | Demo account text, user guide with Ollama section, single-file HTML clinical and notes app generator |
| `src/lib/zip.ts` | Store-only ZIP writer and CRC32 for the in-app Offline Kit |
| `src/data/organogram.ts` | 22 roles, consoles, patient viewers, author lists, 11 areas, 21 demo accounts, 11 request kinds, 13 request states, departments |
| `src/data/clinicalData.ts` | Conditions, formulary, interaction rules, facilities and calculator functions |
| `src/components/boards.tsx` | `useFetch`, `postJson`, What Matters Today, RequestBoard, PharmacyBoard, AppointmentsBoard, AuditTable |
| `src/components/layout/AppShell.tsx` | Brand header, grouped sidebar, mobile nav and More sheet, Spotlight, Assistant drawer, stock alert badge, service worker registration |
| `src/components/ui.tsx` | StatusBadge, RequireSignIn, KPI, PageHead, CSV download |
| `src/context/AuthContext.tsx` | Session state, login routing, setup redirect, sound, idle timeout, Spotlight and Assistant state |
| `scripts/verify-package.mjs` | Required files, route counts, standalone presence, missing `src/app` diagnosis and batch CRLF gate |
| `scripts/build-package.mjs` | Standalone asset assembly, traced DB cleanup under standalone data, root data and logs folders, package manifest |

The source is intentionally compact: 66 files under `src`, 33 page route files, 20 API route files, and about 4,566 counted lines across source and scripts at handover.

### C4. Configuration

| Location | Important values |
|---|---|
| `next.config.mjs` | `output: "standalone"`, `images.unoptimized: true`, `allowedDevOrigins: ["*"]` |
| `tsconfig.json` | Strict TypeScript, path alias `@/*` to `./src/*`, no emit |
| `eslint.config.mjs` | Next core web vitals config |
| `.env` and `.env.offline.example` | Offline mode true, file DB true, relative data default, port 3000, host 0.0.0.0, blank DATABASE_URL |
| `public/sw.js` | Cache name `carelink-shell-v332`; caches shell and static assets only; never caches `/api/` |
| `public/manifest.webmanifest` | CareLink standalone PWA, navy theme, 192 and 512 icons |
| `src/app/globals.css` | Plain CSS tokens: navy `#1F3864`, darker navy `#16294d`, gold `#C9A227`, cream `#FFF8E7`, white paper, ink, muted, status colours; cards, badges, tables, tabs, shell, hero, mobile breakpoint at 860px and print rules |

Small cosmetic note: the first comment in `.env.offline.example` still says v3.3.1. Its values are current and it has no runtime effect.

## Appendix D - Complete page feature inventory

All pages below are App Router pages. Access is ultimately enforced by APIs, while `RequireSignIn` handles the signed-in presentation state.

| Route | Feature |
|---|---|
| `/` | Landing, product story, sign-in, public account request, demo and offline entry points |
| `/setup` | One-time Master Chief Administrator creation; password at least 8; redirects after setup |
| `/patients` | Scoped patient registry with search, area, status and SHA filters, paging, profile links, registry CSV |
| `/patients/new` | Intake with automatic LOM code, opening draft Visit 1, optional baseline BMI measurement and foodbag |
| `/patients/[id]` | 16-tab patient profile, sensitive-view audit, 13-section home visit form, weight trend and extended-case badge |
| `/patients/wounds` | Wound register instructions and quick opening of active patients to the Wounds profile tab |
| `/patients/pdca` | Extended cases beyond 90 days for Plan, Do, Check, Act quality review |
| `/appointments` | Hospital appointment schedule with facility and department cascade |
| `/medical` | Smart MCM encounter composer, facility and department cascade, condition preview, formulary presets, encounter list, governed deletion |
| `/pharmacy` | Live stock, purchase and issue ledger, alerts and month-to-date spend |
| `/reports` | Weekly, monthly, quarterly, mid-year and all-time published-data reports, anonymisation choice, area CSV and print |
| `/performance` | Section 12 side-by-side prompts, no ranking, data quality detail |
| `/settings` | Programme policy, demo dashboards, report anonymisation, Assistant and Ollama, areas and Section 12, sound, own password, demo and restore |
| `/offline` | Offline Kit, single-file HTML, JSON backup, guide, demo accounts, Windows steps and demo console table |
| `/diag` | Phone Connection Kit, LAN instructions, connectivity probe, honest QR placeholder |
| `/carelink/chief` | Account requests, staff account issuing, user activation and reset, demo controls, audit preview |
| `/carelink/exec` | President, Director and Board organisation prompt view and escalations |
| `/carelink/caregiver` | To Submit list, scoped caseload, What Matters Today, department requests |
| `/carelink/hospital` | Hospital Desk bookings, referral requests, attended, missed or cancelled outcomes |
| `/carelink/verify` | Submitted, approved and published visit queues with approve, publish, return and revoke controls |
| `/carelink/finance` | Read-only pharmacy ledger and spend view plus department requests |
| `/carelink/procurement` | Purchases, stock, reorder alerts and requests |
| `/carelink/audit` | Searchable audit trail with CSV and request visibility |
| `/carelink/welfare` | Welfare and relief request coordination |
| `/carelink/transport` | Transport request workflow and appointments |
| `/carelink/media` | Media, IT and PR consent-aware story requests |
| `/carelink/guest` | Read-only orientation, no patient records |
| `/clinical/conditions` | 80-condition searchable Disease Encyclopaedia with specialty filter and severity text badges |
| `/clinical/formulary` | Searchable A-Z formulary, full preset copy, live stock text status |
| `/clinical/interactions` | Explicit interaction checker and all 8 displayed rules |
| `/clinical/calculators` | CURB-65, Parkland, Cockcroft-Gault, CKD-EPI 2021 and adult BMI |
| `/clinical/facilities` | 10 referral facilities and department lists |
| `/clinical/import` | Master drug CSV import in merge, skip or update mode, with current catalogue count |

The patient profile tabs are: Overview, Visits, Measurements, Clinical encounters, Foodbags, PDCA, Conditions, Medications, Hospitalisations, Discharges and follow-ups, Wounds, Children, Distributions, Spiritual care, Stories and Documents.

The 13 home visit section prompts are:

1. General condition today
2. Pain and symptoms
3. Mobility and daily activities
4. Nutrition and appetite
5. Medication adherence
6. Wounds and skin
7. Mental wellbeing
8. Household and food security
9. Water, sanitation and hygiene
10. Children in the household
11. Spiritual care (with consent)
12. Referrals and appointments
13. Plan agreed with patient and family

The global shell provides a grouped sidebar, a five-item mobile bar, a mobile More sheet containing every sidebar entry, Ctrl+K Spotlight over consoles, conditions, ICD-10, drugs, facilities and permission-aware patient search, an Assistant drawer, sound toggle, current user and role display, sign out, low-stock badge and PWA service worker registration.

## Appendix E - Roles, consoles and workflow rules

### E1. Role table from `src/data/organogram.ts`

`Visit flag` in this table is the role definition flag. The API ground rule below is stricter and is what actually authorises creation.

| Role ID | Label | Group | Console | Can view patients | Visit flag | Encounter flag |
|---|---|---|---|---|---|---|
| `chief_administrator` | Chief Administrator | Leadership | `/carelink/chief` | true | false | false |
| `admin` | Administrator (Delegated) | Leadership | `/carelink/chief` | true | false | true |
| `president` | President | Leadership | `/carelink/exec` | false | false | false |
| `director` | Director | Leadership | `/carelink/exec` | false | false | false |
| `board` | Board Trustee | Leadership | `/carelink/exec` | false | false | false |
| `chief_medical` | Chief Medical Case Manager | Medical and Clinical | `/medical` | true | false | true |
| `hospital` | Medical Case Manager (Hospital Desk) | Medical and Clinical | `/carelink/hospital` | true | false | true |
| `hospital_liaison` | Hospital Liaison Officer | Medical and Clinical | `/carelink/hospital` | true | false | false |
| `chief_ministry` | Chief Ministry Coordinator | Field and Ministry | `/carelink/caregiver` | true | false | false |
| `county_coordinator` | Kisumu County Coordinator | Field and Ministry | `/carelink/caregiver` | true | true | false |
| `homabay_coordinator` | Homa Bay County Coordinator | Field and Ministry | `/carelink/caregiver` | true | true | false |
| `coordinator` | Ministry Area Coordinator | Field and Ministry | `/carelink/caregiver` | true | true | false |
| `caregiver` | Community Caregiver | Field and Ministry | `/carelink/caregiver` | true | true | false |
| `data_manager` | Data Quality Manager | Operations and Governance | `/carelink/verify` | true | false | false |
| `media` | Media and IT Officer | Operations and Governance | `/carelink/media` | false | false | false |
| `pr` | Public Relations Officer | Operations and Governance | `/carelink/media` | false | false | false |
| `procurement` | Procurement Officer | Operations and Governance | `/carelink/procurement` | false | false | false |
| `transport` | Transport and Logistics Officer | Operations and Governance | `/carelink/transport` | false | false | false |
| `welfare` | Welfare and Relief Officer | Operations and Governance | `/carelink/welfare` | false | false | false |
| `finance` | Finance Officer | Operations and Governance | `/carelink/finance` | false | false | false |
| `auditor` | Internal Auditor | Operations and Governance | `/carelink/audit` | false | false | false |
| `guest` | Guest Observer | External | `/carelink/guest` | false | false | false |

Actual enforced constants:

- `VISIT_AUTHORS = ["caregiver", "coordinator"]`. The county coordinator role flags are true in the role table, but the patient profile and `/api/visits` use the constant, so county coordinators cannot use the authoring form. Do not silently change this without owner instruction because the ground rule names caregiver and coordinator only.
- `ENCOUNTER_AUTHORS = ["chief_medical", "hospital", "admin"]`.
- `ENCOUNTER_DELETERS = ["chief_administrator", "chief_medical"]`.
- Chief user administration roles are `chief_administrator` and delegated `admin`.
- Visit approvers in the transition API are `data_manager`, `admin`, `chief_administrator`, `chief_ministry`, `county_coordinator`, `homabay_coordinator` and `coordinator` for approved, published and returned transitions.
- Patient viewers are the 11 roles whose table value is true. Registry visibility further restricts caregiver and area coordinator to their assigned area, Kisumu coordinator to Kisumu area IDs and Homa Bay coordinator to Homa Bay area IDs.

### E2. Visit verification states

Allowed transitions are:

| Target state | Allowed from |
|---|---|
| `submitted` | `draft` |
| `approved` | `submitted` |
| `published` | `approved` |
| `returned` | `submitted`, `approved` |
| `revoked` | `published` |
| `draft` | `returned`, `revoked` |

Publishing is explicit, not a timer. Revoke sets `needsCaregiverReapproval`. Every transition records verifier, time, audit and author notification.

### E3. Department requests and appointments

Request kinds: `hospital_appointment`, `transport`, `welfare_relief`, `procurement`, `finance_payment`, `media_story`, `data_correction`, `clinical_review`, `foodbag`, `home_visit_support`, `general`.

Request states: `raised`, `received`, `acknowledged`, `assigned`, `in_progress`, `awaiting_info`, `awaiting_approval`, `approved`, `declined`, `completed`, `verified_closed`, `escalated`, `cancelled`.

Departments: `hospital`, `transport`, `welfare`, `procurement`, `finance`, `media`, `data_manager`, `chief_medical`, `chief_administrator`, `director`.

A `hospital_appointment` request with a patient auto-creates a requested appointment. A clinical encounter with outcome `Referred` or `Follow-up booked` auto-creates a requested appointment 7 days out and notifies `role:hospital`. Appointment updates audit and notify the patient's caregiver.

### E4. Pharmacy rules

- A fresh database seeds the 120-drug catalogue but no inventory line.
- Purchase roles are procurement, admin, chief_administrator and finance. `chief_medical` is explicitly refused purchases for maker-checker separation.
- Issue roles are chief_medical, procurement and admin.
- Issue quantity cannot exceed units on hand.
- Derived status is `Out of stock` at 0 or below, `Low stock` at or below the reorder level, otherwise `In stock`.
- Finance uses a read-only board presentation; its role is still included in the purchase API list, so review before changing accounting policy.

### E5. Areas

The database seeds these area IDs exactly:

- `Nyalenda`, Kisumu County
- `area-02`, Kisumu County
- `area-03`, Kisumu County
- `area-04`, Kisumu County
- `area-05`, Kisumu County
- `area-06`, Homa Bay County
- `area-07`, Homa Bay County
- `area-08`, Homa Bay County
- `area-09`, Homa Bay County
- `area-10`, Homa Bay County
- `area-11`, Homa Bay County

IDs are locked in Settings so patient area references do not break when names are corrected. The display names for areas 02 to 11 and all baseline and target values must come from the printed organogram and H1 2026 Section 12.

## Appendix F - API contract

General conventions:

- API routes are Node runtime and force-dynamic where data is read or written.
- Authentication uses the HttpOnly `carelink_session` cookie or `Authorization: Bearer <token>`.
- Session duration is 12 hours. Login also returns the token in JSON for Bearer clients.
- JSON errors use `{ error: "..." }` with 400, 401, 403, 404 or 502 as appropriate.
- Successful mutations generally return `{ ok: true }` plus the created record where useful.
- List endpoints cap common results at 200 or 300 unless stated.

| Endpoint | Methods and actions | Main access rule and behaviour |
|---|---|---|
| `/api/health` | GET | Public health response: status ok, version 3.3.2, app, offline mode, needsSetup, total patients and timestamp |
| `/api/ping` | GET | Public plain text `pong` for the Diag probe |
| `/api/setup` | GET, POST | GET returns needsSetup. POST creates the first non-demo active Chief Administrator, starts a session and audits setup; refuses after setup |
| `/api/auth/session` | GET; POST `login`, `logout`, `change-password` | Username or email login, failed login audit, logout removes session, own password change requires current password in code logic. See Appendix K for the wrong-current-password response bug |
| `/api/admin` | GET; POST `request-account`, `create-user`, `set-user-active`, `reset-password`, `decide-request`, `seed-demo`, `purge-demo`, `update-settings`, `update-settings-basic`, `import-backup` | Public request only before the auth gate. Other actions chief or delegated admin except basic settings. GET restricts users and requests to chiefs, audit to leadership and auditor, and always returns own notifications, settings, areas and demoLoaded. Import validates patient and user arrays, copies the current DB to backups first, preserves current sessions and audits |
| `/api/patients` | GET with `q`, `area`, `status`, `sha`, `limit`; POST enrol | GET and POST require patient-viewer role. GET uses `visiblePatients`, maximum limit 1000. POST requires a name, allocates `LOM-####`, opens draft Visit 1 and optional BMI measurement |
| `/api/patients/[id]` | GET, PUT | GET requires patient-viewer role, returns all related profile collections and writes `SENSITIVE_VIEW`. PUT allows only name, sex, ageYears, phone, village, area, status, shaStatus, caregiver, nextOfKin and notes, with before and after audit values. Direct-record scope hardening is listed in Appendix K |
| `/api/visits` | GET with `state`, `patientId`; POST `create` or transition | Create only caregiver or coordinator. Draft or submitted state, notification on submit. Transition map and verifier roles are in Appendix E. Responses add `patientName` |
| `/api/encounters` | GET, POST, DELETE | POST authors are chief_medical, hospital and admin. Referral or follow-up auto-creates appointment. DELETE only chief_administrator or chief_medical with 20 or more justification characters and own-password verification; every refusal audits and deletes nothing |
| `/api/requests` | GET with `department`; POST `create`, `appointment`, otherwise transition | Signed-in create, workflow event history, CC notifications, hospital auto-appointment, escalation to Director requires note, appointment field update with caregiver notification. Returns latest 300 requests, event map and latest 200 appointments |
| `/api/pharmacy` | GET; POST `purchase` or `issue` | GET signed-in stock, latest 200 purchases and issues, alert count and MTD spend. Role and no-over-issue rules in Appendix E |
| `/api/clinical/master-drugs` | GET; POST CSV | GET signed-in drugs decorated with stock status, units and unit. POST roles chief_administrator, admin, chief_medical and procurement. CSV headers must be name,class,dose,route,frequency,duration,instructions,unit. Modes are merge, skip and update. Nothing is deleted |
| `/api/intelligence` | GET | Signed-in What Matters Today. Returns labelled insights, data quality and counts for scoped active and total patients, published visits, verification queue, extended cases, stock alerts, open requests, upcoming appointments, visits today and pending account requests |
| `/api/reports` | GET with `period` and `anonymise=1` | Signed-in published-only report. Periods weekly last 7 days, monthly current month, quarterly last 92 days, midyear January to June current year, otherwise all. `byArea` uses the legacy key `paid` for area name; do not rename it without updating the reports and executive pages |
| `/api/assistant` | GET `action=tags` or `action=test`; POST question | GET is chief or delegated admin only. POST requires sign-in, de-identifies before model calls, supports offline, ollama, openai and custom modes, audits question and engine but not reply, and falls back offline with reason |
| `/api/offline/bundle` | GET | Public generated `CareLink_DDMS_v3.3.2_Offline.html` download |
| `/api/offline/export` | GET | Signed-in full JSON backup wrapper with sessions removed. It includes password hashes and salts for restore, never plain passwords, and audits `DATA_EXPORTED` |
| `/api/offline/guide` | GET | Public generated user-guide text download |
| `/api/offline/demo-accounts` | GET | Public generated demo account text download |
| `/api/offline/full-package` | GET | Signed-in 9-file Offline Kit ZIP. It reads launchers and text files from `packageRoot()` and generates the checklist |

### Assistant API details

- Default native Ollama base: `http://127.0.0.1:11434`.
- `resolveOllamaBase` accepts an override, then `ai_base_url`, then the origin of a legacy `ai_endpoint` such as `/v1/chat/completions`, then the default. Only http and https are accepted.
- Detection calls `/api/tags` with an 8 second timeout and maps name, byte size, modified time, parameter size, quantisation and family.
- Test and question calls use native `/api/chat`, `stream: false`, configured `keep_alive`, and parse `message.content` or `response`.
- Question timeout is clamped to 10 to 300 seconds. Default is 120.
- OpenAI-compatible mode sends model, temperature 0.2 and system plus user messages to `ai_endpoint`. `AI_API_KEY` is read only from the server environment.
- Custom mode posts `{ question: userContent, system: ASSISTANT_SYSTEM }` and accepts common answer, response or text fields.
- De-identification tokenises known patient names as `[PATIENT]`, LOM codes as `[CODE]`, phone-like numbers as `[PHONE]` and emails as `[EMAIL]`.
- `ai_send_aggregates` defaults false. When true, the model receives the offline engine aggregate answer as verified context and is told not to change or add figures.
- Diagnosing, prescribing, dosing, treatment-changing, enrolment and patient-specific discharge questions are refused before ordinary answering. Count, stock, verification, appointment and data-quality topics use local database figures in the offline engine.

## Appendix G - Data dictionary

### G1. Database shape

Schema version is `SCHEMA_VERSION = 332` in `src/lib/store.ts`, stored as numeric `schemaVersion: 332`. `DBShape` has 33 top-level keys: `schemaVersion`, `counters`, `settings`, `sessions`, and 29 record arrays. `src/db/schema.ts` exports 30 table names for export and future PostgreSQL mapping; it includes `settings` as a named table but omits runtime `sessions` and `counters`.

Records use a loose `AnyRec` shape, `Record<string, unknown> & { id: string }`. This means TypeScript does not enforce every record field. Preserve existing field names exactly, including snake-case `submission_state` and user password fields `password_hash` and `password_salt`.

| Collection | Purpose and key link fields |
|---|---|
| `users` | Staff and demo accounts. `username`, `name`, `role`, `area`, email, phone, hash and salt, `must_change_pw`, `is_active`, `isDemo`, issuedBy, createdAt |
| `sessions` | Login sessions. `token`, `userId`, createdAt, expiresAt. Excluded from exports |
| `accountRequests` | Public account requests. `REQ-2026-#####`, wanted username and role, contact, area, reason, pending or decision status, decidedBy and time |
| `patients` | Registry records. `LOM-####`, demographics, phone, village, area ID, status, SHA status, caregiver username, intake and programme start, next of kin, notes, demo flag |
| `visits` | Home visit forms. `patientId`, visitNumber, dates, author and role, `submission_state`, signatures, summary, sections object, weight, height, foodbag, verifier fields |
| `measurements` | Weight, height and BMI trend points by `patientId` |
| `foodbags` | Patient-linked foodbag records; visit forms also carry the visit foodbag string |
| `pdcaRecords` | Patient-linked extended-case review records; profile response key is `pdca` |
| `encounters` | Clinical encounters. Patient, date, facility, department, condition, ICD-10, severity, findings, prescription, outcome, author |
| `serviceRequests` | Department workflows. `SR-2026-####`, kind, department, title, detail, optional patientId, requester, state, assignee, CC, escalation fields |
| `workflowEvents` | Full request transition history by `requestId`, actor, from, to, note and time |
| `appointments` | Hospital appointments. Patient ID and name, facility, department, date, status, notes, optional requestId or encounterId |
| `pharmacyPurchases` | Purchase ledger. Drug, units, unit cost and total KES, supplier, batch, date, recordedBy |
| `inventoryItems` | Current stock lines. Drug, unit, units on hand, reorderLevel, updatedAt |
| `pharmacyIssues` | Issue ledger. Drug, units, issuedTo, optional patientId, date, issuedBy |
| `patientConditions` | Patient-linked condition records |
| `patientMedications` | Patient-linked medication records |
| `wounds` | Patient-linked wound site, start, status text and notes |
| `hospitalisations` | Patient-linked hospitalisation records |
| `discharges` | Patient-linked discharge records |
| `followups` | Patient-linked follow-up records |
| `childrenRecs` | Patient-linked children records; profile response key is `children` |
| `distributions` | Patient-linked distribution records |
| `spiritualCare` | Patient-linked consent-sensitive spiritual care records |
| `stories` | Patient-linked story records |
| `documentsRecs` | Patient-linked document records; profile response key is `documents` |
| `auditLog` | Append-only audit rows. Time, user, action, entity, detail, previousValue, newValue, device `webapp` |
| `notifications` | In-system messages targeted as `user:<username>` or `role:<role>`, kind, message, read flag |
| `masterDrugs` | Core and imported catalogue. Name, class, dose, route, frequency, duration, instructions, unit, source, sortOrder |
| `ministryAreas` | Area ID, display name, county, nullable `baselinePatients`, nullable `targetMonthlyVisits` |
| `settings` | Single key-value object, see below |
| `counters` | Monotonic counters including `patient`, `request` and `accreq` |

### G2. Settings defaults

| Key | Default | Meaning |
|---|---:|---|
| `programme_days` | 75 | Programme benchmark guide |
| `programme_max_days` | 90 | Extended-case and PDCA threshold in intelligence |
| `measurement_interval_days` | 21 | Due weight and BMI interval |
| `idle_timeout_minutes` | 5 | Policy value shown in Settings; browser safety sign-out is separately fixed at 15 quiet minutes |
| `sound_enabled` | true | Baseline sound default |
| `include_demo` | true | Include demo records in scoped counts and published visits unless set false |
| `ai_mode` | `offline` | One of offline, ollama, openai, custom |
| `ai_endpoint` | empty | OpenAI-compatible or custom full endpoint |
| `ai_base_url` | `http://127.0.0.1:11434` | Native Ollama service base |
| `ai_model` | empty | Exact model name |
| `ai_timeout_seconds` | 120 | Model timeout, clamped server-side to 10 to 300 |
| `ai_keep_alive` | `5m` | Ollama keep-loaded value |
| `ai_send_aggregates` | false | Opt-in verified aggregate context |
| `anonymise_reports` | false | Default reports anonymisation |
| `org_name` | LOMAMO Foundation Kenya | Organisation name |
| `tagline` | Serving our Neighbours in Love | Organisation tagline |

Defaults are added only when a key is undefined, so future settings should follow the same non-destructive pattern.

### G3. IDs, counters and statuses

Random IDs use 9 random bytes in hex with prefixes such as `usr_`, `ses_`, `arq_`, `pat_`, `vis_`, `mea_`, `enc_`, `req_`, `wev_`, `app_`, `pur_`, `stk_`, `iss_`, `con_`, `wnd_`, `pdc_`, `drug_`, `aud_` and `ntf_`.

Human codes:

- Patient: `LOM-0001` from `counters.patient`.
- Department request: `SR-2026-0001` from `counters.request`.
- Account request: `REQ-2026-00001` from `counters.accreq`.

Patient statuses used by UI and reports are `active`, `assessment`, `discharged` and `deceased`. SHA statuses are `Registered - active`, `Registered - pending`, `Not registered` and `Exempted`.

Data quality checks are: phone recorded, SHA status recorded, at least one measurement, at least one published visit. The score averages pass ratios across all patients after demo filtering and returns 0 when there are no patients.

### G4. Demo seed and purge

The deterministic demo seed creates 21 enabled demo users and 260 synthetic patients if absent. Verified fresh-seed figures were 772 published visits within a larger state mix, measurements, 46 encounters, 12 purchases, 16 stock lines with exactly 2 alerts, 8 appointments, 25 extended cases in the verified run, and wound records on roughly one in twelve patients. Dates are generated relative to seed day. Purge removes demo users and patient-linked demo records, demo encounters, purchases and inventory, and demo sessions, while keeping real records, areas and settings. A demo flag switch can exclude demo patients and visits from counts without deleting them.

The workspace development tree at handover contains a test and demo database with schema 332, 22 users, 260 patients and 779 visits after release testing. It is not a clean release database and must never be copied into a ZIP as the shipping `data` state.

## Appendix H - Clinical reference index

All clinical text is decision support only. Verify against current Kenya national guidelines, facility protocols and specialist advice. Nothing auto-prescribes.

### H1. 80 conditions

The source of truth for hallmark features, severities, summary and Medscape search URL is `CONDITIONS` in `src/data/clinicalData.ts`. Index:

Severe Malaria (B54, Infectious Diseases); Uncomplicated Malaria (B54, Infectious Diseases); Pulmonary TB (Drug-Susceptible) (A15.0, Respiratory); MDR-TB (BPaLM) (A15.5, Respiratory); HIV-1 Infection (B24, Infectious Diseases); HIV and TB Co-infection (B20.0, Infectious Diseases); Severe Acute Malnutrition (E43, Paediatrics and Nutrition); Moderate Acute Malnutrition (E44.0, Paediatrics and Nutrition); Sepsis and Septic Shock (A41.9, Emergency and Critical Care); Hypertension Stage 2 (I10, Cardiology); Hypertensive Emergency (I16.1, Emergency and Critical Care); STEMI (Heart Attack) (I21.3, Cardiology); Heart Failure (HFrEF) (I50.1, Cardiology); Type 2 Diabetes Mellitus (E11.9, Endocrine); Diabetic Ketoacidosis (E11.1, Emergency and Critical Care); Community Acquired Pneumonia (J18.9, Respiratory); Asthma (SMART approach) (J45.9, Respiratory); COPD (J44.9, Respiratory); Pre-eclampsia (O14.9, Obstetrics); Postpartum Haemorrhage (O72.1, Obstetrics); Eclampsia (O15.9, Obstetrics); Cholera (A00.9, Infectious Diseases); Acute Watery Diarrhoea (K52.9, Gastroenterology); Dysentery (Bloody Diarrhoea) (A03.9, Gastroenterology); Chronic Kidney Disease G3-G5 (N18.9, Nephrology); Acute Kidney Injury (N17.9, Nephrology); Chronic Wound Ulceration (L98.4, Surgery and Wound Care); Diabetic Foot Ulcer (E11.621, Endocrine and Wound Care); Cellulitis (L03.9, Infectious Diseases); Abscess (L02.9, Surgery); Burns (assessment) (T30.0, Emergency and Surgery); Stroke (acute) (I64, Neurology); Epilepsy (G40.9, Neurology); Meningitis (G00.9, Infectious Diseases); Depression (F32.9, Mental Health); Anxiety Disorders (F41.9, Mental Health); Psychosis (F29, Mental Health); Anaemia (Iron Deficiency) (D50.9, Haematology); Sickle Cell Disease (D57.1, Haematology); Upper Respiratory Tract Infection (J06.9, Respiratory); Acute Otitis Media (H66.9, ENT); Conjunctivitis (H10.9, Eye); Urinary Tract Infection (N39.0, Urology); Pyelonephritis (N12, Urology and Nephrology); Sexually Transmitted Infections (syndromic) (A64, Infectious Diseases); Pelvic Inflammatory Disease (N73.9, Gynaecology); Scabies (B86, Dermatology); Fungal Skin Infection (B35.9, Dermatology); Impetigo (L01.0, Dermatology); Tetanus (A35, Infectious Diseases); Rabies Exposure (A82.9, Infectious Diseases); Snake Bite (T63.0, Emergency); Fracture (closed) (T14.2, Orthopaedics); Osteoarthritis (Knee) (M17.9, Rheumatology); Low Back Pain (non-specific) (M54.5, Musculoskeletal); Peptic Ulcer Disease (K27.9, Gastroenterology); Gastro-oesophageal Reflux (K21.9, Gastroenterology); Constipation (K59.0, Gastroenterology); Intestinal Worms (B82.9, Infectious Diseases); Schistosomiasis (B65.9, Infectious Diseases); Typhoid Fever (A01.0, Infectious Diseases); Brucellosis (A23.9, Infectious Diseases); Leptospirosis (A27.9, Infectious Diseases); COVID-19 (U07.1, Respiratory); Influenza (J11.1, Respiratory); Measles (B05.9, Infectious Diseases); Chickenpox (B01.9, Infectious Diseases); Mumps (B26.9, Infectious Diseases); Hepatitis B (chronic) (B18.1, Hepatology); Liver Cirrhosis (K74.6, Hepatology); Alcohol Use Disorder (F10.2, Mental Health); Substance Use (general) (F19.2, Mental Health); Cervical Cancer Screening (VIA) (Z12.4, Gynaecology and Oncology); Breast Lump (assessment) (N63.0, Oncology); Prostate Enlargement (BPH) (N40, Urology); Cataract (H25.9, Eye); Glaucoma (chronic) (H40.9, Eye); Hearing Loss (assessment) (H91.9, ENT); Dental Abscess (K04.7, Dental); Oral Thrush (B37.0, Infectious Diseases)

### H2. 120 core formulary medicines by class

Each source drug has name, class, dose, route, frequency, duration, instructions, unit and prebuilt preset. The database catalogue may gain imported rows without deleting these.

- **Allergy (2):** Cetirizine 10mg; Chlorphenamine
- **Analgesia (4):** Paracetamol 500mg; Tramadol 50mg; Morphine (oral); Codeine
- **Analgesia and NSAID (2):** Ibuprofen 400mg; Diclofenac 50mg
- **Anthelmintic (3):** Albendazole 400mg; Mebendazole; Praziquantel
- **Anti-TB (4):** RHZE Fixed-Dose Combination; RH Fixed-Dose Combination; Isoniazid 300mg; Ethambutol 400mg
- **Antibiotic (13):** Amoxicillin 500mg; Amoxicillin-Clavulanate; Ceftriaxone Injection; Cefalexin 500mg; Flucloxacillin 500mg; Doxycycline 100mg; Azithromycin 500mg; Clarithromycin; Ciprofloxacin 500mg; Nitrofurantoin 100mg; Cotrimoxazole 960mg; Benzathine Penicillin; Gentamicin Injection
- **Antibiotic and Antiprotozoal (1):** Metronidazole 400mg
- **Anticoagulant (2):** Warfarin; Heparin (unfractionated)
- **Antidote (4):** Calcium Gluconate; Naloxone; Activated Charcoal; Vitamin K (Phytomenadione)
- **Antidote and Emergency (1):** Atropine
- **Antiemetic (2):** Metoclopramide; Ondansetron
- **Antifungal (3):** Fluconazole 200mg; Nystatin Suspension; Griseofulvin
- **Antifungal topical (2):** Clotrimazole Cream; Miconazole Cream
- **Antimalarial (4):** Artemether-Lumefantrine; Artesunate Injection; Quinine (oral); Primaquine
- **Antiparasitic (1):** Ivermectin
- **Antiplatelet (2):** Aspirin 75mg; Clopidogrel 75mg
- **Antiretroviral (6):** Tenofovir-Lamivudine-Dolutegravir (TLD); Dolutegravir 50mg; Abacavir-Lamivudine; Efavirenz 600mg; Zidovudine-Lamivudine; Lopinavir-Ritonavir
- **Antiviral (1):** Aciclovir 400mg
- **Cardiovascular (13):** Amlodipine 5mg; Losartan 50mg; Enalapril 10mg; Hydrochlorothiazide 25mg; Atenolol 50mg; Metoprolol; Furosemide 40mg; Spironolactone 25mg; Atorvastatin 20mg; Hydralazine; Methyldopa 250mg; Nifedipine (immediate release); Glyceryl Trinitrate
- **Dermatology (4):** Permethrin Cream; Benzyl Benzoate; Hydrocortisone Cream 1%; Betamethasone Cream
- **Emergency (1):** Glucose 50% Injection
- **Emergency and Inotrope (4):** Adrenaline 1mg/mL; Noradrenaline; Dopamine; Dobutamine
- **Emergency and Neurology (1):** Diazepam
- **Endocrine (5):** Metformin 500mg; Gliclazide; Insulin (soluble); Insulin (isophane); Levothyroxine
- **Eye (3):** Chloramphenicol Eye Drops; Tetracycline Eye Ointment; Timolol Eye Drops
- **Family Planning (2):** Combined Oral Contraceptive; DMPA Injection (Depo)
- **Fluids and Electrolytes (1):** ORS Sachets
- **Gastroenterology (2):** Omeprazole 20mg; Loperamide
- **Haematology (1):** Folic Acid 5mg
- **Haematology and Nutrition (1):** Ferrous Sulphate (Iron)
- **IV Fluids (3):** Ringer Lactate 500mL; Normal Saline 0.9% 500mL; Dextrose 5% 500mL
- **Laxative (2):** Bisacodyl; Lactulose
- **Mental Health (2):** Fluoxetine 20mg; Haloperidol
- **Mental Health and Pain (1):** Amitriptyline
- **Neurology (3):** Phenobarbital; Carbamazepine; Sodium Valproate
- **Nutrition (2):** Vitamin A; Zinc Sulphate (child)
- **Obstetrics (3):** Oxytocin Injection; Misoprostol; Magnesium Sulphate
- **Obstetrics and Surgery (1):** Tranexamic Acid
- **Respiratory (4):** Salbutamol Inhaler; Beclometasone Inhaler; Budesonide-Formoterol; Ipratropium Inhaler
- **Respiratory and Steroid (1):** Prednisolone 5mg
- **Steroid (2):** Hydrocortisone Injection; Dexamethasone
- **Vitamin (1):** Pyridoxine 25mg

### H3. Eight interaction rules

1. Rifampicin with dolutegravir: Major. Double dolutegravir during rifampicin and for 2 weeks after.
2. Rifampicin with protease inhibitors: Contraindicated. Use a specialist adjusted regimen.
3. Tenofovir with nephrotoxic NSAID or aminoglycoside: Major kidney-load warning.
4. Two or more listed QT-prolonging medicines: Major QT stacking warning.
5. ACE inhibitor or ARB plus NSAID plus diuretic: Major triple-whammy kidney warning.
6. Isoniazid without pyridoxine: Moderate reminder to co-prescribe pyridoxine.
7. Metronidazole with alcohol: Moderate disulfiram-like reaction warning.
8. Warfarin with NSAID or listed new antibiotic: Major bleeding and INR warning.

The checker is deterministic string matching in `checkInteractions`, with special handling for RHZE and RH fixed-dose combinations, TLD, QT lists, the triple combination and missing pyridoxine.

### H4. Ten facilities and departments

| Facility | Level | Town | Departments |
|---|---|---|---|
| Moi Teaching and Referral Hospital, Kakamega (JOOTRH) | Level 6 | Kisumu County | Emergency and Casualty, Internal Medicine, General Surgery, Orthopaedics, Obstetrics and Gynaecology, Paediatrics, ICU, Renal, Oncology, Ophthalmology, ENT, Psychiatry, Dental, Radiology, Laboratory, Pharmacy, Physiotherapy |
| Moi Teaching and Referral Hospital (MTRH) | Level 6 | Eldoret | Emergency, Internal Medicine, Cardiology, Neurosurgery, Oncology, Renal and Dialysis, Obstetrics and Gynaecology, Paediatrics, General Surgery, Orthopaedics, Ophthalmology, Psychiatry, Radiology |
| Kisumu County County Referral Hospital | Level 5 | Kisumu County | Outpatient, Casualty, Medicine, Surgery, Maternity, Paediatrics, TB Clinic, CCC (HIV), Eye, Dental, Mental Health, Physiotherapy, Laboratory |
| Homa Bay County Teaching and Referral Hospital | Level 5 | Homa Bay Town | Outpatient, Casualty, Medicine, Surgery, Maternity, Paediatrics, TB Clinic, CCC (HIV), Eye, Dental, Laboratory, Pharmacy |
| St Elizabeth Lwak Mission Hospital | Level 5 | Lwak, Rarieda | Outpatient, Maternity, Medicine, Minor Surgery, Paediatrics, CCC (HIV), Laboratory, Pharmacy |
| Kendu Adventist Hospital | Level 5 | Kendu Bay | Outpatient, Casualty, Medicine, Surgery, Maternity, Paediatrics, Eye, Dental, Laboratory, Pharmacy, Physiotherapy |
| Aga Khan (Nakuru) | Level 5 | Kisumu County | Emergency, Internal Medicine, Cardiology, Surgery, Obstetrics and Gynaecology, Paediatrics, ICU, Dialysis, Radiology, Laboratory, Pharmacy |
| Ahero Sub-County Hospital | Level 4 | Ahero | Outpatient, Maternity, Medicine, Paediatrics, TB Clinic, CCC (HIV), Minor Surgery, Laboratory |
| Nyalenda Health Centre | Level 3 | Nyalenda, Kisumu County | Outpatient, MCH and Antenatal, Family Planning, TB Clinic, CCC (HIV), Laboratory, Pharmacy, Nutrition |
| Manyatta Health Centre | Level 3 | Manyatta, Kisumu County | Outpatient, MCH and Antenatal, Family Planning, TB Clinic, CCC (HIV), Laboratory, Pharmacy |

### H5. Calculators

- CURB-65: confusion, urea over 7, respiratory rate 30, low BP and age 65. Score 0 to 1 low risk, 2 intermediate, 3 or more high, with published mortality band text.
- Parkland: total is 4 x weight kg x TBSA percent; half in first 8 hours, half in next 16, with hourly rates.
- Cockcroft-Gault: creatinine micromol/L divided by 88.4, sex factor 0.85 for female.
- CKD-EPI 2021: race-free creatinine equation with sex-specific k and alpha and G-stage output.
- BMI: adult bands from 19 years, underweight below 18.5, healthy 18.5 to 24.9, overweight 25 to 29.9, obese 30 or above.

## Appendix I - Reproducing the fixed release ZIP

### I1. Build sequence

```bat
npm install --no-audit --no-fund
npm run typecheck
npm run build
npm run package
npm run verify
```

`scripts/build-package.mjs` copies `.next/static` and `public` into `.next/standalone`, recursively removes only `carelink-db*.json` traced under `.next/standalone/data`, creates root `data/backups` and `logs`, and writes `PACKAGE_MANIFEST.txt`.

### I2. Clean staging recipe

Build the ZIP from a staging copy, never directly from a development tree containing a live database.

Include:

- All root source, configs, docs, launchers, scripts, `src` and `public`.
- `.next/BUILD_ID`.
- The entire `.next/standalone` tree, including `.next/standalone/node_modules`, `.next/standalone/.next/static` and `.next/standalone/public`.
- `data/DO_NOT_DELETE.txt` and empty `data/backups` and `logs` folders.

Exclude:

- Root `node_modules`.
- Root `.next` build folders other than `BUILD_ID` and `standalone`, including `.next/server`, `.next/static`, `.next/cache` and type output.
- Every `carelink-db*.json` anywhere, including before-migrate, unreadable and before-import backups.
- Real or demo `data` files other than `DO_NOT_DELETE.txt`.
- Logs and `tsconfig.tsbuildinfo`.
- The Linux musl Sharp packages under standalone `node_modules/@img/sharp-linuxmusl-x64` and `sharp-libvips-linuxmusl-x64`, matching the fixed ZIP. Images are unoptimized, so Sharp is not used by the office runtime.

Never exclude `.next/standalone/node_modules`. The standalone server needs its traced runtime.

### I3. ZIP and final proof

- Put `START.bat` at ZIP root beside `package.json`, `src/app` and `.next/standalone/server.js`.
- Confirm ZIP integrity and that no filename contains `carelink-db` with a JSON extension.
- Confirm both root and standalone copies of `START.bat` are CRLF if a traced copy exists.
- Extract to a fresh folder, run the verifier, start the packaged server, and check `/api/health` version and needsSetup plus `/setup` HTTP 200.
- Confirm the runtime database appears only at extracted package-root `data/carelink-db.json`, never under `.next`.
- Run functional and Ollama tests against that extraction or a disposable data directory.
- Remove the extraction test database before treating any staging tree as clean. Never rezip a tested extraction without repeating the clean staging checks.
- Record compressed bytes, uncompressed bytes, entry and file counts and SHA-256.

## Appendix J - Release test record

### J1. Core product suite inherited by v3.3.2

The 37-check API suite passed on the pre-Ollama v3.3.1 lineage and the relevant suite was rerun after the standalone data path repair. Covered behaviours: fresh setup, master creation, no password material returned, exact demo counts, published-only counts, stock alerts, chief visit-author refusal, caregiver submission, verification and publication, area scoping 24 versus 260, referral appointment, all governed-deletion branches, maker-checker pharmacy rule, assistant prescription refusal, null Section 12 values, pending account request, downloads and export integrity.

### J2. Ollama suite

A local mock implementing `/api/tags` and `/api/chat` advertised the six exact office model names. Fifteen integration assertions passed: health, unauthenticated refusal, guest 403, chief login, six-model detection, qwen test, settings save, successful Ollama answer, question de-identification, native chat options, aggregates on, aggregates off, missing model settings, and clear missing-model fallback. A separate final-ZIP run created a test chief, detected six models, tested `qwen3.5:4b`, saved settings and received an `AI DRAFT - Ollama local` answer.

This proves protocol and CareLink behaviour. It does not prove real model quality, office GPU or memory performance, or cold-load time for `gemma4:12b`.

### J3. Launcher and packaging tests

- Broken folder verifier exits 1 and explains missing `src/app`.
- Nested extraction root finding works.
- Standalone data-location regression was caught and fixed with the exact two-level package-root rule plus absolute launcher data path.
- Fresh ZIP extraction uses pre-built server with no install or build.
- LF-only START negative test exits 1 under the new verifier; repaired file passes.
- Fixed full ZIP integrity passes and contains no live DB.

### J4. Minimum regression checklist for future changes

- Clean package opens `/setup`; migrated real package does not.
- Login by username and email; failed login audits; logout destroys session.
- Chief creates account and decides a public request; no auto-approval.
- Registry scope for caregiver, both county coordinators, chief and a non-viewer refusal.
- Patient enrolment allocates the next LOM code and one draft Visit 1.
- Visit author refusal for chief and acceptance for caregiver and area coordinator.
- Submitted to approved to published, returned and revoked paths; dashboards change only after publish.
- Encounter referral appointment and governed deletion refusal and success audits.
- Pharmacy purchase, insufficient-stock issue, successful issue, low and out labels, Finance read view.
- Requests, appointments, escalation reason and notifications.
- Reports with null and entered Section 12 values, anonymised and named modes.
- Demo seed counts, demo exclusion switch, purge preserving a real sentinel record.
- Backup export and restore with a pre-import backup.
- Assistant offline answers, prescription refusal, Ollama tags and test, aggregate on and off, unreachable and missing-model fallback.
- Clinical counts remain 80, 120, 8 and 10 unless deliberately changed.
- Mobile More sheet contains every sidebar item; status badges always contain words.
- Build, package and verify are green; all batch files are CRLF; final ZIP has no database and is run from a fresh extraction.

## Appendix K - Known limitations, technical debt and next safe work

### K1. Security and authorisation hardening to review first

The current product is designed for a trusted office LAN, but several APIs use coarser authorisation than the UI implies. Treat these as the first security backlog, not as undocumented intended behaviour:

- `GET /api/patients/[id]` checks patient-viewer role but does not apply `visiblePatients` area scope to a direct ID. `PUT /api/patients/[id]` requires sign-in but does not check patient-viewer role or scope.
- `GET /api/visits` and `GET /api/encounters` require sign-in but no patient-viewer or scope filter and add patient names. Some visit transition targets other than approve, publish and return lack a dedicated role check.
- Department requests and appointment updates require sign-in but do not enforce department ownership server-side.
- `/api/reports` and `/api/intelligence` require sign-in but do not use one shared role and scope policy. Intelligence scopes patients but some global counts remain global.
- `/api/offline/export` allows any signed-in user to download the full backup, although it audits the event. Restrict to approved backup roles after owner approval.
- `update-settings-basic` allows a signed-in non-chief to merge arbitrary setting keys because there is no key allowlist. Add an allowlist or remove the action after checking callers.
- Login returns the session token in JSON as well as setting an HttpOnly cookie. Keep only if a Bearer client needs it.
- `change-password` currently returns HTTP 200 `{ ok: true }` even when the current password does not verify, because the failure inside `mutate` is not surfaced. The password is not changed, but Settings displays success. Fix with tests.
- Admin `reset-password` and `set-user-active` also return ok if the target user is absent or the reset password is too short. Surface explicit errors.
- The service worker and help bundle routes are public by design. The offline HTML, guide and demo account downloads are public endpoints; confirm this remains acceptable before exposing the server beyond the LAN.

Do not expose this v3.3.2 server directly to the public internet without a dedicated security review, HTTPS, reverse-proxy controls, rate limiting, backup encryption and authorisation tests.

### K2. Data and scale limits

- The JSON database is one document, cached in process, synchronously rewritten per mutation. It suits one office server process, not multiple replicas or very large record volumes.
- There is no field-level schema validation library. API constructors coerce known fields, and `AnyRec` permits drift. Add runtime validation carefully without rejecting existing healthy records.
- Dates are strings. Visit and report logic relies on ISO date or timestamp ordering.
- `counters` are part of the same document. Never reset them during data repair or codes can repeat.
- Backups are plain JSON and include password hashes and salts. Protect backup media as confidential health and credential material.
- Audit is append-only in application behaviour, not cryptographically tamper-proof. Anyone with filesystem access can edit the JSON if the server is stopped.

### K3. Product limitations already accepted at handover

- Areas 02 to 11 need real names; all Section 12 values need owner entry.
- Real LOMAMO logo still needs to replace the placeholder file.
- Publishing is explicit rather than a 12-hour timer.
- Single-file offline notes use per-device localStorage and manual JSON export and import; they do not sync automatically with the office database.
- Diag has an honest QR placeholder for the real LAN address, not a generated QR code.
- Clinical summaries are concise references, not current guideline replacements.
- The full 334-drug master CSV still needs verification and import with the real file.
- PostgreSQL is only a future migration path. `drizzle.config.json` and the table map exist, but runtime does not use a SQL database.
- Encounter editing and a dedicated encounter print view are not implemented.

### K4. Suggested next tasks in safe order

1. Supervised real-Windows run of the fixed START.bat, firewall approval for private-network Node access, and one real Ollama question with each chosen model.
2. Replace the logo, rename areas, enter Section 12 values, remove demo data and issue real accounts.
3. Fix the change-password and admin reset error reporting with regression tests.
4. Apply one shared server-side patient scope helper to profile, visit, encounter, request and report routes; test every role.
5. Restrict backup export and settings-basic; review public offline endpoints.
6. Add an automated disposable-data API smoke suite to the repository.
7. Verify and import the real 334-drug CSV; confirm counts and duplicates before production use.
8. Encounter edit and print, prescription-to-stock issue with maker-checker intact, richer finance and audit separation.
9. Only then consider lab results, CHV mapping, SMS or a hosted PostgreSQL deployment.


Shipped 18 October 2026. Built by 26 YHVH-MELCHIZEDEK. Serving our Neighbours in Love.
