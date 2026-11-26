# Prompt audit 001 — verbatim prompt set, reconciled against the code

Audited revision: `347122a` (main, PR #81), version 6.9.6, schema 6, 69 built modules.
Method: each requirement was checked against the source, the test suite and a live
render — not against [the reconstructed traceability table](../REQUEST-TRACEABILITY.md),
which is now superseded by this audit for the items it covers.

**Suite state at audit time:** `npm run test:all` → **EXIT=0**, no failure lines
(`views` renders, `wiring` controls, `pwa-offline`, `weekly-indicators` 52,
`pwa-hardening` 27, `sync-outbox` 16, `demo-register` 30 all green).

Verdict key: **CAPTURED** (built and evidenced), **PARTIAL** (something real exists
but the line is not satisfied), **NOT CAPTURED**, **BLOCKED** (needs a decision,
service or document the assistant does not have), **INCOMPLETE-SOURCE**.

---

## Batch A — "Add these too 100% fully"

### A1. Weekly planning indicators conform to a 52-week year; Monday–Friday working days; label as "week 48 of 2026" with "Mon 16th – Fri 20th"
**CAPTURED in form — still labelled provisional pending the official boundary rule.**

Live render evidence after this audit's fix:

```
weekly_indicators   Week 48 of 2026 (provisional) · Monday 16 Nov 2026 – Friday 20 Nov 2026 · Africa/Nairobi
patient_figures     Week 48 of 2026 (provisional) · Monday 16 Nov 2026 – Friday 20 Nov 2026 · Africa/Nairobi
home_visits         Week 48 of 2026 (provisional) · Monday 16 Nov 2026 – Friday 20 Nov 2026 · Africa/Nairobi
expenditure         November 2026
executive           Q4 2026
```

- `PERIOD.workWeek()` / `PERIOD.lastCompletedWorkWeek()` clamp to 52 weeks, carry a
  Monday–Friday civil range and name the `Africa/Nairobi` working timezone
  (`v6/src/reports.js:16–40`).
- **Fixed in this audit:** the label was applied to only one report of eleven.
  `reportPeriodLabel(type)` in `v6/src/views_ops.js` now classifies every report
  family — weekly (`weekly_indicators`, `patient_figures`, `patient_days`,
  `home_visits`), monthly (`expenditure`, `referral`, `quality`, `hospital_ops`,
  `condition_summary`) and quarterly (`executive`, `donor`) — so no printed
  document borrows the wrong period, and none still says "7 days to …".
- New suite `v6/test/report-period-labels.js` (26 checks) pins the mapping, proves
  the week number never exceeds 52 across an 800-day sweep, proves two different
  planning weeks never share a label, and proves Mon/Fri bounds hold.
- The word **"(provisional)"** remains deliberate: the organisation has not yet
  supplied the official 52-week boundary rule, so the audit trail keeps the
  convention visible rather than asserting a rule nobody approved.
- `views_patients.js:335` still prints the rolling label in an on-screen note
  (not a printed document) — left as-is, recorded here.

**Remaining:** split the archive period key so two issues in the same week cannot
collide, and remove "(provisional)" once the official rule is supplied.

### A2. After MCM approval, caregiver can send the PDCA to the international advisory team; they see it in their action list and can comment on every line, like MS Word
**NOT CAPTURED (by design, partially scoped).**

- No line-level comment model exists: a search for `pdcaLine`, `lineComments`,
  `PDCA_LINE` returns nothing. Comments today are whole-thread (`care6_flows.js`
  PDCA line discussions, added in PR #73), not anchored to a line or field.
- The `intl.medical` capability exists and the console has a 120+ day PDCA review
  action, but it is not the referral-and-line-comment workspace this line describes.
- The delivery tracker records this as item 10, "partial", with scope undefined.

### A3. Monday deliberation: assessments ordered by when keyed in, ministry areas bundled, "system should randomly select"
**INCOMPLETE-SOURCE (final clause is cut off) + PARTIAL.**
The visible text ends mid-sentence ("The system should randomly select"). A random
order and a keying-in order are in tension, so this cannot be closed as written.
Monday sitting, receipt and minutes workflows exist (PR #74), and scoped Monday
assessment reviews exist (PR #58), but the bundled-by-area, randomly-ordered
deliberation view is not evidenced.

### A4. Monday–Friday devotion rota, admin assistant assigns each team member, counted across the whole year, only working days, Country Director given a special Christian-calendar day
**PARTIAL.** `v6/src/devotion_rules.js` implements roster generation, assignment,
special days and minutes, with a server-authorised command path. It computes
Gregorian observances (Ash Wednesday, Good Friday, Easter Monday, Christmas) by
computus. The file's own comment says: *"these provisional observances are not an
official calendar."* The tracker keeps "Official calendar and weeks" open because
the organisation's actual observances and times are not supplied.

### A5. Random but fair devotion distribution; verse keyed Sunday/Monday; named prayer partner recorded
**PARTIAL.** Roster generation is implemented and scoped; the "ask a team member to
pray and have it recorded" path exists in the devotion meeting record. Fairness is
not independently evidenced, and no test asserts even distribution across a year.

### A6. User selects a Bible verse and prayer notes, displays verses in the 7 major translations, Bible reference system, colourful UI
**NOT CAPTURED.** There is no Bible module, no translation set, no reference
lookup and no biblehub (or other service) integration. A search for `biblehub`,
`BIBLE_VERSES` and `translation` across `v6/src` returns only an unrelated costing
string. This is the largest unbuilt item in batch A.

### A7. Admin assistant's Monday minutes template trains the system; Mon–Fri meetings, Tue–Thu are 08:30–09:00 devotion only
**PARTIAL.** Monday sitting minutes exist with versioned, conflict-checked saves by
the county assistant only (`devotion_rules.js`). The **template itself is deferred
until the organisation supplies it** (tracker: "the official minutes template is
deferred until the organization provides it"). The Tuesday–Thursday devotion-only
meeting pattern is not modelled distinctly.

### A8. All pages and sheets survive refresh offline and online
**CAPTURED for the shell; PARTIAL for in-progress work.**
The installed shell, offline notices, held-work outbox and replay-on-reconnect are
built and tested (`pwa-hardening` 27, `sync-outbox` 16). However the tracker states
the legacy outbox is **unencrypted** and hosted offline clinical login is **not
approved**. So: the page survives; an unsaved clinical entry on a hosted client is
preserved but not yet at a security standard the organisation has accepted.

### A9. PDCA letterhead with logo and markers; every report in a LOMAMO colour scheme, elegant non-profit executive style; each document with its own identity; generator department/user shown
**PARTIAL — the department half is now fixed.**

- `reportShell()` gives every report a letterhead (logo, tricolour rule,
  organisation lines, classification tag, meta grid, footer); eleven documents
  render through it.
- **Fixed in this audit:** the meta grid now reads
  `Generated by — <name> · <department>`, with the department read from the org
  chart (`DEPARTMENTS`) rather than typed per report. Verified for clinical and
  leadership documents in `report-period-labels.js`.
- **Still open:** the line asks each document to have "its unique identity, pattern
  and personality". In practice all eleven share one shell, one accent rule and one
  layout. Per-document identity is a design task, not a bug fix, and is not done.

---

## Batch B — unnumbered block

| # | Requirement | Verdict | Evidence / gap |
|---|---|---|---|
| B1 | Idle/closed/logged-out session ends immediately so another device can sign in without waiting | **PARTIAL, gated** | Explicit logout revokes then releases the lease (`releaseSessionLease`, CAS via `SESSION_LEASE_RELEASE_LUA`). Tab close is not detected — no `pagehide`/`beforeunload`/`sendBeacon` anywhere. `SESSION-LEASE-SECONDS = IDLE + 60` = **1860s**. Design gate written, not implemented. |
| B2 | Share documents like email/WhatsApp; upload and share with chosen staff/departments/teams; personal library; TB-completion example with tag and note | **BLOCKED** | Hosted `api/index.js` has **zero** `/api/files` routes. Legacy `v6/server.py` serves list/upload/download with a session only — **no document-level authorisation, no scanning**. Private storage and malware scanning are unavailable and deferred at the user's instruction. Client warns and checks receipts; that cannot secure direct legacy requests. |
| B3 | Smoothen transitions between pages, sheets and workflow steps | **PARTIAL** | Transition and focus work landed (PR #78, #81); no global transition audit or acceptance. |
| B4 | Clicking a workspace tab must present content immediately without extra scrolling — globally | **PARTIAL, repeatedly re-requested** | Patient-record tabs focus and reveal (PR #78); deep-linked tabs repaired (PR #68). This line appears **four separate times** across the prompt set, which is itself evidence it is not fully satisfied. |
| B5 | All public portal statistics from the central database, governed by applicable rules | **NOT CAPTURED** | No publication-governance pipeline: no approval, disclosure thresholds, suppression or provenance. Existing figures must not be read as authorised live aggregates. |
| B6 | Review 4,000 → 4,444 patients; fully fill all data; report 100% completeness | **BLOCKED** | The 4,000 register is synthetic (`realPatientData: false`). **4,444 appears only in the two documentation files, never in data.** Filling it would mean fabricating patient records, which is prohibited. |
| B7 | Mobile patient metadata — right-hand items not all visible | **PARTIAL** | Responsive metadata released (PR #78) with sampled synthetic browser checks; no real-device acceptance. |
| B8 | Executive action and follow-up matrix layout, and similar boxes globally | **PARTIAL** | Container-aware matrix layout (PR #78); global box audit still open. |
| B9 | Explain C-DIMS Coins as accurate/timely/effective/efficient/disciplined; revamp the staff list layout | **PARTIAL** | `recognition.js` computes a weighted proxy from existing records and shows the formula per person. It does **not** independently measure those five qualities; fairness, rewards governance and verification remain open. |
| B10 | Banner colour balance — texts not legible against the bluish banner | **PARTIAL** | Department banner contrast corrected stop-by-stop in v6.9.6; a **comprehensive** contrast audit across all accounts/themes remains open. |
| B11 | Rename "Kisumu County Office Inpatient Update" → "Hospital Department Update", functions to cover hospital/clinical reporting | **PARTIAL** | Label changed (`care6_flows.js:1286`); it still opens the existing Monday meeting. No dedicated hospital/clinical reporting workflow. |
| B12 | "Media and Governance" → "Media & Information Governance" | **CAPTURED** | Console title and references updated across `ai.js`, `app.js` and console titles. |
| B13 | Each account/user a different banner colour scheme for identity; audit text visibility | **PARTIAL** | `accountSignaturePalette()` derives a stable palette per account (PR #79) with personal choice respected. Hash collisions and perceptually similar colours are possible by design. |
| B14 | User journeys and workflows solid as possible | **PARTIAL** | Perpetual quality line; no acceptance criteria. Workflow engine and QA suite exist. |

---

## Batch C — "Now consider these prompts"

| # | Requirement | Verdict | Evidence / gap |
|---|---|---|---|
| C1 | Offline login with strict security; work synced on reconnect; temporary copy synced and logged | **NOT CAPTURED** | No offline login path exists (`offlineLogin`, `loginOffline` — no matches). Held-work outbox replays patch lists only; it is not an offline data copy and is unencrypted. |
| C2 | No-network banner blocks navigation — move it somewhere neater, globally | **PARTIAL** | Offline status moved into navigation headers (PR #70); offline strip and chip added in v6.9.6. Not verified as non-blocking on every workspace. |
| C3 | Sign-in right side more premium/professional | **PARTIAL** | Landing/sign-in work landed (PR #61, #62); no acceptance evidence for this specific line. |
| C4 | Remove browser approval from admin; first-time login from any client; remove 31-minute wait; immediate logins | **PARTIAL — safety tension** | No device-approval gate exists in `api/index.js` (nothing matching browser/device approval). The 31-minute wait is the **idle lease (1800s + 60s)**. Removing it outright reintroduces exactly the risk the session handoff gate describes: a blind lease replacement lets an old signed token keep working. |
| C5 | Navigation pane click sets the workspace phase without scrolling | **PARTIAL** | Same family as B4; repeatedly re-requested. |
| C6 | Audit all account types — only in-scope workspaces in the left pane | **PARTIAL** | PR #67 refresh and the 36-role workspace audit test exist; the approved role-to-workspace list is still not supplied, so "makes sense to their type" cannot be certified. |
| C7 | Call buttons overlapping names; nothing extending outside margins; banner bleeding under pane | **PARTIAL** | PR #65 separated shortcuts from the shared toolbar; PR #81 corrected layouts. No global geometric acceptance test. |
| C8 | Redesign left navigation panel; keep only in-scope items | **PARTIAL** | Progressive disclosure landed (PR #57); global role audit open. |
| C9 | Intelligent tab/box colouring, status colour codes, reduce congestion, menus for breathing space | **PARTIAL** | Vivid accents (PR #56), disclosure (PR #57); no systematic evidence. |
| C10 | Audit system weighing one account's data against others to find discrepancies | **CAPTURED (partial scope)** | Scoped cross-account discrepancy checks landed (PR #67). Coverage and sign-off not evidenced. |
| C11 | Sign-in page left imagery is zoomed out — meaning lost | **PARTIAL** | Landing imagery reworked (PR #61); no acceptance evidence. |
| C12 | Two screenshots' issue fixed globally | **SCREENSHOT-MISSING** | Cannot audit images not supplied to this session. |
| C13 | PDCA module cleaner, better page usage, professional graphics, better arrangement; generator department and user in every report | **PARTIAL** | PDCA report spread balanced (PR #66); creator provenance in report (PR #66/PDCA layout doc). Department identity in the document is **not** done (see A9). |
| C14 | Solid and green user journeys/workflows | **PARTIAL** | As B14. |

---

## Batch D — final block (~27 requirements)

| # | Requirement | Verdict | Evidence / gap |
|---|---|---|---|
| D1 | Device-aware customisation (PC/tablet/phone) detected automatically | **PARTIAL** | Device-aware workspaces (PR #60); layout tokens exist; no acceptance matrix per device. |
| D2 | Printing module: wireless and wired printing from Android/Windows/PC | **PARTIAL** | Print centre and device print doc exist (`DEVICE-PRINT-AND-SESSION-RELEASE.md`); physical printer output is unverified. |
| D3 | Messaging vibrant; mic/camera still reported as blocked despite site permissions | **PARTIAL** | Team calling handshake built with explicit "device cannot call" explanation (`#callUnavailable`) instead of hidden buttons. The underlying browser/permission cause is a device configuration issue that cannot be fixed from code alone. |
| D4 | Single-instance login, refuse second client, immediate login after logout | **PARTIAL** | One atomic account lease per credential epoch enforces single instance; release is CAS-checked. Immediate handoff on tab close is the open gate (B1/C4). |
| D5 | Log each client/device a user signs in with | **CAPTURED** | Devices are recorded (`devices` collection, revocation and device checks in `getSession`). |
| D6 | UI elegance, texture, smoothness, visual relief | **PARTIAL** | Continuous; no acceptance criteria. |
| D7 | Wallpapers/graphics in workspace backgrounds, tasteful | **PARTIAL** | `data-bg` backdrop attribute and background tokens exist; no evidence this line is satisfied. |
| D8 | Speed up login | **UNVERIFIED** | No before/after measurement recorded. The tracker's performance item is open. |
| D9 | Landing graphic: show "11 Major Departments" while the graphic shows 8; first 8 logical; brighter reds; higher-fidelity lake | **NOT CAPTURED as specified** | Requires the approved mapping of 8 of the 11 to the graphic. The department list supplied conflicts with the code's 16-department model. |
| D10 | Department structure reconciliation (admin/field care/hospital/transport/media&IT/homestay/procurement/finance/HR&staff/welfare/internal ops) | **EXTERNAL-DECISION** | Code has 16 departments (`DEPARTMENTS` in `data.js`). Merging to 11 changes RBAC, reporting and palettes. **Needs an explicit decision before any code change.** |
| D11 | Evidence audit per department: receipts, ETIMS invoices, MPESA/bank SMS proof | **PARTIAL** | Evidence and receipts exist per transaction with reconciliation; global evidence-audit-by-department is open. |
| D12 | Deliberation: accept / hold / not accept with colour codes; decision date on the PDCA header; immediate action items (register SHA, send to hospital) | **PARTIAL** | Monday assessment review exists (PR #58); the three-way decision with header stamp and conditional action items is not evidenced as complete. |
| D13 | PDCA written by caregiver or from a template with per-item detail; no mechanical PDCAs | **PARTIAL** | Care plan items exist; template-with-detail enforcement not evidenced. |
| D14 | Three PDCA types (normal, 120-day, 180-day); normal has no justification; period confirmed by MCM then closed by admin assistant | **PARTIAL** | Extended cases require an MCM-reviewed PDCA before discharge (`care_workflow.js:200`). The three-type model with MCM-confirmed individual period is open (tracker item 12). |
| D15 | Status indicator on digital assessments showing only the registered status | **PARTIAL** | Depends on D12. |
| D16 | Caregiver prepares first draft plan during discussion, with the item list (SHA payment, nutrition, adherence counselling, hygiene, transport, hospital referral, psychosocial, spiritual, mosquito net, Bible in English/Swahili/Luo) | **PARTIAL** | Care plan item vocabulary exists; the exact specified list is not asserted anywhere. |
| D17 | "Caregiver PDCA Review button" — engine trained on 120 real MCM-reviewed PDCAs to ask questions like a case manager | **NOT CAPTURED** | No model, no corpus, no trained engine. Reflection prompts exist and are explicitly **not** clinical AI. Training on clinical records needs approved sources, lawful processing and independent clinical/privacy review (tracker item 3). |
| D18 | Budget for months ending mid-week (planning 1st to last day) | **PARTIAL** | Month-boundary guidance exists; authorised monthly commitments and forecasts are open (tracker item 4). |
| D19 | Stylus handwriting with built-in recognition and grammar proofing | **NOT CAPTURED** | No stylus/recognition engine. Signature fields are typed/attested, never represented as verified signatures. |
| D20 | Speed and efficiency at all levels, 100% effectiveness | **UNVERIFIED** | No metrics or benchmarks defined (tracker item 6). |
| D21 | Announcements with sound and highlight notifications, scoped to audience | **NOT CAPTURED** | No announcements module (`ANNOUNCEMENT` — no matches). Notifications exist, but not scoped announcements with sound. |
| D22 | Creative, non-repetitive icons per account/console | **PARTIAL** | Icon registry exists; no audit of repetition. |
| D23 | Drawers for files/archives globally; discharged patient archive; access **notified not denied** and logged | **PARTIAL** | Care-cycle drawer/archive is partial (tracker item 9); immutable cycle file and scoped notification open. |
| D24 | International medical advisory account and feature-rich console | **PARTIAL** | `intl.medical` capability and console exist; comprehensive workspace open (tracker item 10, same as A2). |
| D25 | PDCA discharge summary names the external organisation and support; Care Cycle File with full programme detail; secure print/download gated by law and policy | **PARTIAL** | Referral entity and care-cycle concepts exist (tracker item 11); scoped, legally reviewed export is open. |
| D26 | Search and AI cover everything within the account's scope | **PARTIAL** | Assistant is scoped; per-record permission checks and freshness/audit are open (tracker item 13). |
| D27 | PWA upgrade: install as a real app named CareLink with proper icon (not Chrome/Brave), full-app feel, offline and online | **CAPTURED** | Manifest declares name/short_name CareLink, standalone display, 192+512 + maskable icons, `id`, `launch_handler`, four shortcuts; install button attachment fixed in v6.9.6; `pwa-hardening` 27 checks. |
| D28 | Left pane auto-hides on scroll, re-expands on icon tap, creative show/hide | **PARTIAL** | Auto-fold on scroll/interaction landed (`NAVP.installAutoFoldListeners`); behaviour across all consoles not accepted. |
| D29 | Left-pane items that do not belong to the account — global audit | **PARTIAL** | Same as C6/C8. |
| D30 | "Stewardship verified" button and surrounding text cramped/bleeding | **PARTIAL** | Layout fixes landed (PR #78/#81); no specific evidence for this element. |

---

## Summary

| Verdict | Count | Share |
|---|---|---|
| CAPTURED | 4 | ~6% |
| PARTIAL | 43 | ~63% |
| NOT CAPTURED | 6 | ~9% |
| BLOCKED / EXTERNAL / MISSING SOURCE | 10 | ~15% |
| UNVERIFIED | 4 | ~6% |

**The six not-captured items** are: the Bible display module (A6), offline login (C1),
the trained PDCA review engine (D17), stylus handwriting (D19), scoped announcements
(D21), and the public-statistics governance pipeline (B5).

**The four captured items** are: the 52-week work-week labelling across all report
families (A1, form complete, boundary rule still provisional), the Media &
Information Governance rename (B12), single-client device logging (D5), and the
installable PWA identity (D27).

**Corrected during this audit:** A1 (work-week labelling was applied to one report
of eleven) and half of A9 (the issuing department was missing from every document).
Both are now covered by `v6/test/report-period-labels.js` (26 checks).

**Three items cannot be progressed by writing code** and need the user:
1. **Official calendar and 52-week boundary rule** (A1, A4) — until supplied, labels
   must stay "provisional".
2. **The 4,444 real-patient reconciliation** (B6) — requires authorised private
   records; fabricating them is prohibited.
3. **The 11-department structure** (D9, D10) — merging 16 departments into 11 is a
   policy decision that rewrites RBAC, reporting and palettes.

**Still open by explicit user instruction, unchanged:** private storage and malware
scanning are deferred build needs; the legacy file service stays running for now and
its document-level access risk remains open; immediate tab-close handoff is designed
but not implemented. No real patient record was created or modified in this audit.
