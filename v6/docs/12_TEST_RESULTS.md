# 12 · Test results

Every figure below is produced by a script in `test/` or `tools/`. Reproduce the whole set with:

```bash
python3 build.py
node test/smoke.js            # security model, reporting maths, workflow, dual control
node test/lint.js             # structural integrity of roles, capabilities, workflows, reports
node test/wiring.js           # every emitted control has a registered handler
node test/modals.js           # every modal and action path opens
node test/workflows.js        # full patient and hospital journeys across roles
node test/scoping.js          # county / area / assignment invariants for every account
node test/ai_and_export.js    # assistant scope, leakage and export gating
node test/dual.js             # dual-control authority and thresholds
node test/import.js           # CSV parser + engine JSON → wizard → commit
node test/views.js            # every console rendered for every account
node test/v43.js              # v5.0 workspaces, refusals as well as successes
python3 test/server_api.py    # host API, password verification, file store
python3 tools/import_engine.py --workbook examples/LOMAMO-Master-Patient-Workbook-TEMPLATE.xlsx
```

| Suite | Result |
|---|---|
| `smoke.js` — logic, security, reporting, workflow | **25 / 25** |
| `lint.js` — structural integrity | **18 / 18** |
| `wiring.js` — control → handler coverage | **all 92 emitted controls handled** |
| `modals.js` — modal and action paths | **67 paths + 28 report documents, 0 errors** |
| `workflows.js` — end-to-end journeys | **45 / 45** |
| `scoping.js` — data isolation invariants | **6 / 6** |
| `ai_and_export.js` — assistant and export controls | **10 / 10** |
| `dual.js` — dual control | **10 / 10** |
| `import.js` — import pipeline | **11 / 11** |
| `views.js` — render sweep | **1,527 renders, 0 errors** |
| `v41.js` — v4.1 acceptance (landing, care centre, conditions, delegation, reviews, settings, donor) | **66 / 66** |
| `server_api.py` — central database server (incl. idle expiry, password verification, file store) | **51 / 51** |
| `v42.js` — themes, timeout, messaging, portal, calendar, registry, plans | **48 / 48** |
| `v43.js` — forms, pharmacy, care plans, leave, planning, exports, arrangement, migration | **156 / 156** |
| Security self-test inside the product | **13 / 13 controls effective** |

---

## 1. Logic, security and reporting — 25/25

Demonstration dataset seeds (30 accounts, 50 patients, 251 visits); audit chain verifies; caregiver
login succeeds and wrong password is refused; caregiver list is scoped to Nyalenda; Homa Bay patient
is refused; caregiver cannot approve a request; Kisumu finance isolated from Homa Bay; Chief
Administrator has no clinical access; patient figures compute with 7 ministry areas; Patient-Days
buckets ordered; expenditure totals reconcile; report versions increment; Master Referral Document
blocked for a caregiver; Medical Case Manager can approve; closure guard behaves; requester cannot
self-approve; two independent signatures activate; assistant answers within scope and refuses finance
to a caregiver; audit chain intact; denials recorded.

```
25 passed · 0 failed · 26 checks
```

## 2. Structural integrity — 18/18

| Check | Result |
|---|---|
| Role templates reference only real capabilities | pass |
| Workflow transitions reference only real capabilities | pass |
| Every navigation destination has a view | pass |
| No orphan views | pass |
| All report types render a document | pass |
| All targets reference defined indicators | pass |
| No capability is orphaned | pass |
| Every seeded patient flagged demo | pass |
| Demonstration credentials consistent | pass |
| Caregiver may see clinical (authorised) | pass |
| HR officer cannot see clinical | pass |
| Media head cannot see clinical | pass |
| No cross-county or cross-area patient leakage | pass |
| Every workflow step has an actor | pass |
| No role may edit the audit trail | pass |
| Publication requires consent | pass |
| Dual approval required for restore | pass |

## 3. Data isolation invariants — 6/6

Every account was interrogated across **every** collection it can reach — patients, requests,
transactions, budgets, targets, vehicles, trips, documents — and no row outside its county, ministry
areas or assignments was returned.

```
PASS  No county-scoped account receives another county's rows
PASS  Liaison sees only their own assignments
PASS  Caregiver restricted to one ministry area — nyalenda
PASS  County administrator budget isolated
PASS  County administrator fleet isolated
PASS  Homa Bay budget is fully isolated — 9 lines, all Homa Bay
```

## 4. End-to-end journeys — 45/45

**Patient:** caregiver creates the assessment → submits the physical form → assistant digitises →
submits for verification → assistant verifies (caregiver refused) → county administrator enrols →
caregiver recommends discharge with a reason → MCM refused without evidence → approved with evidence
→ discharged with a date. Every step audited.

**Hospital:** caregiver submits with transport and escort → caregiver refused approval → MCM approves
(transport still unauthorised) → assigned to liaison → closure refused before service → liaison
records service and report → closure refused while unreconciled → finance records the expense and
reconciles → MCM reconciles → closure succeeds. Fifteen audit actions confirmed present, chain intact.

## 5. Dual control — 10/10

Chief requests a full export → cannot approve their own request → caregiver refused and the refusal
is audited → county administrator refused → Media & Governance Head countersigns → threshold met.
Media Head requests a restore → Chief countersigns → threshold met.

## 6. Assistant and export — 10/10

Every account (30) × 12 questions = 360 answers. No exception thrown, no patient name or code
disclosed to a role without `patient.list`, no currency figure disclosed to a role without
`finance.view`. Answers carry typed evidence. An HR officer asking about caseload receives an honest
refusal that names what their role *can* see. Export is refused and audited for a caregiver, allowed
and county-scoped for a County Office Administrator.

## 7. Import — 11/11

CSV parser handles quoted commas and escaped quotes; the engine's JSON loads; 3 rows detected and
ready; ministry areas resolved; 3 patients created; audit and import record written; records flagged
for clinical verification; reconciliation text produced.

## 8. Offline engine

```
Source: examples/LOMAMO-Master-Patient-Workbook-TEMPLATE.xlsx (12.6 KB)
SHA-256: 2c5dc48776aa52dcdee60cba88dae332…
  · 'Instructions'       no header row → skipped
  · 'Patient Register'   header row 5, 3 rows, 19 columns → register
  · 'Home Visits'        header row 5, 4 rows,  9 columns → visits
  · 'Hospital Referrals' header row 5, 2 rows, 10 columns → referrals
  · 'Field Dictionary'   documentation
Patients 3 · Visits 4 · Referrals 2 · Errors 0 · Warnings 0 · Duplicates 0
```

## 9. Defects found and fixed in this audit pass

Recorded because a test suite that only ever reports success is not evidence of anything.

| # | Defect | Severity | Fix |
|---:|---|---|---|
| 1 | Hospital request modal called `repo.patient()` without the user, so every request appeared "outside your authority" | **Critical** — blocked the whole hospital workflow | Passed the signed-in user and added an explicit scope check on the request itself |
| 2 | Medical Case Manager could not open the Hospital Requests console (guard checked a capability only caregivers hold) | **High** | Guard now accepts any hospital capability; navigation group shows for reviewers too |
| 3 | The patient register CSV was exportable by anyone with `patient.list` | **High** — exfiltration path | New `patient.export` capability, county-scoped, audited, refusal logged |
| 4 | Any account could countersign a dual-approval for restore/export | **High** | Approver authority enforced against an explicit approver-capability map |
| 5 | County-scoped roles saw other counties' budget lines, targets, vehicles and trips | **High** | New scoped repository accessors; views no longer read those tables directly |
| 6 | Data-quality report listed every county's transaction numbers to a county M&E officer | Medium | Financial findings limited to roles with financial or audit authority, and to their county |
| 7 | Referral register showed organisation-wide patient counts to a county MCM | Medium | Counts now scoped through the repository |
| 8 | After verification, the record showed no next step and no owner | Medium — workflow dead end | "Next step: Enrol patient → County Office Administrator" is now displayed |
| 9 | Two report types were offered with no document builder | Medium | Home Visit and Hospital Operations reports implemented |
| 10 | Non-patient roles generated `access.denied` noise on every render | Low | Statistics guarded by capability; assistant refuses cleanly before querying |
| 11 | Security self-test failed on a clean installation with no demonstration data | Low | Controls without fixtures report as *skipped*, not failed |
| 12 | A regression test skipped a control that needed no fixture | Low | Skip condition narrowed to an explicit `null` |
| 13 | `edit-staff` button had no handler | Low | Handler and audited edit form added |
| 14 | Self-approval threshold required three signatures, so restores could never execute | Medium | Dual control defined as initiator + one independent authoriser |

## 10. What these tests still do not prove

- **Device layout.** No browser engine was available in the build environment. Breakpoints, touch
  targets and scroll containers are code-verified; the Samsung A11+ 5G and a county-office desktop
  must be tested by hand before go-live.
- **Scale.** The demonstration set is small. A 5,000-patient workbook and a year of transactions
  should be performance-tested before production.
- **Concurrency.** The browser build is single-user by design.
- **Usability.** Only a facilitated session with caregivers and administrative assistants can show
  whether the paper-to-screen handover matches how they actually work.

The tests prove the control model and the arithmetic. They do not prove the system is pleasant, fast
or correct on real paper.


---

## 11. v4.1 additions

### 11.1 Central database server - 26/26

`test/server_api.py` starts `server.py` on a throwaway port and data directory, then proves:

- health, version and schema identity;
- a fresh database starts at revision 0; the first write lands at revision 1;
- a replayed operation identifier returns the same revision and creates no duplicate;
- a stale write receives 409 and the central copy is unchanged;
- explicit resolution creates revision 2 and the superseded revision is retained with its checksum;
- the server audit chain verifies;
- `/../etc/passwd`, `/data/carelink.db`, `/server.py` and `/.env` are all refused;
- the AI probe refuses a public endpoint and reports an unreachable local one honestly;
- the database and its revision snapshots survive a restart on disk.

### 11.2 v4.1 acceptance - 66/66

Covers the landing and sign-in separation, the enrolment care-plan requirement, delegation issue and
expiry, condition recording and clinician-only confirmation, small-group suppression, care-centre
occupancy and incident closure, the twelve-slot review cycle with preserved due dates, the extension
requirement, the settings sections per role, personal preference isolation, the donor summary's
anonymity, and the six branches of the central-database join decision.

### 11.3 What remains unproven

The server and the browser have not been observed working together in a browser on the office Wi-Fi.
The protocol is integration-tested, the client's decision table is unit-tested, and the static pages
are rendered in a DOM sandbox. That is not the same as a tablet on a real network, and it is not
claimed to be.


---

## 12. Second increment (v4.2)

Figures below are as reported when v4.2 was released. They were superseded by section 13; they
are kept so the history is honest rather than rewritten.

| Suite | Result |
|---|---|
| `v42.js` | 48 / 48 |
| `server_api.py` | 36 / 36 |
| `modals.js` | 52 action paths + 28 report documents |
| `views.js` | 1,445 renders, 0 errors |

What `v42.js` proves: ten themes with a working fallback, the 45- and 60-second thresholds, activity
resetting the timer, four kinds of patient identifier refused in messages with ordinary coordination
still allowed, abusive language flagged rather than blocked, presence states derived from heartbeat
age, the public portal excluding an unpublished item without an account, calendar events drawn from
records, six registry checks, the work-plan due date, the returned-plan history, the five backup
stages and activation refused before validation.

What `server_api.py` proves, beyond the earlier checks: a request without a session is refused with
401; a session can be opened; an idle window closes it; an expired token cannot be revived; genuine
activity extends it; sign-out is immediate; a restart clears every session; and the public feed is
reachable without a session and returns only published items.

---

## 13. Third increment (v5.0)

| Suite | Result |
|---|---|
| `v43.js` | 156 / 156 |
| `server_api.py` | 51 / 51 |
| `modals.js` | 67 action paths + 28 report documents |
| `views.js` | 1,527 renders, 0 errors |
| `wiring.js` | 92 emitted controls, all handled |

`v43.js` proves the refusals as well as the successes: a recorded allergy blocks a
prescription and writes nothing; a severe interaction needs a written reason; an expired
batch is never dispensed; stock cannot go negative; an empty or duplicate paper form is
refused; the person who entered a form cannot verify it; a care plan cannot be approved by
its author or with an unrated problem; Monday leave is refused for field staff and allowed
with a warning for the hospital officer; a request that would uncover a location is refused
or covered by a named substitute; the applicant cannot decide their own request; a week plan
respects its daily cap, is not on the calendar before it is accepted, and cannot be accepted
twice; DOCX and XLSX outputs are real ZIP archives; a role without export authority is
refused in the data layer; and every new console renders for every account.

`server_api.py` adds password verification (refused without, refused when wrong, accepted
when right, health changes from `demo` to `server-verified`) and the file store
(round-trip bytes, SHA-256 returned, register requires a session, malformed upload and
unknown retention class refused).

What is still only structurally checked: no browser, no real tablet, no TLS handshake and
no opening of the generated Office files in Microsoft Office. See `docs/15_V5.0_RELEASE.md`
section 4.

---

## 14. Beyond the suites: a real browser and a real TLS handshake

The suites run the data layer in a headless DOM. They do not prove that a screen paints.
On 19 October 2026 the built file was driven in Chromium 156 (headless) at 1440 x 900 and
820 x 1180, over HTTP and over HTTPS with a self-signed certificate:

- sign-in, demonstration dataset, and the 30-entry navigation render for the Medical Case
  Manager with no page errors;
- the patient clinical tab shows the recorded allergy before any prescription is written;
- prescribing amoxicillin to a penicillin-allergic patient is refused in the interface and
  nothing is written; a safe medicine is then prescribed, dispensed and marked dispensed;
- "Propose next week" produces a draft that is accepted onto the calendar, and the accept
  button disappears;
- the form editor opens with the patient prefilled;
- over TLS: wrong password 401 `bad_password`, missing password 401 `password_required`,
  correct password 200 `verified: true`, file upload and byte-identical download, 401 on the
  file endpoint without a session, and TLS 1.1 refused.

Two defects were found by looking at the screens rather than the markup: a row of controls in
the clinical summary was clipped inside its card, and the reorder count treated every formulary
item as out of stock in a county that had never stocked it. Both are fixed and covered by the
suite. This remains a desktop browser, not a tablet; see section 4 of
`docs/15_V5.0_RELEASE.md`.

---

## v5.1.0 (20 October 2026)

| Suite | Result |
|---|---|
| `v51.js` workspace themes, navigation pane, tablet layer | **1,429 / 1,429** |
| All earlier suites | unchanged and passing (15 suites in total with `server_api.py`) |

`v51.js` covers: nine themes with every token defined; 21 WCAG AA text pairs per theme; accent
correction for every department and role accent in every theme; chart colours at 3:1; theme resolution
(default, personal, organisation, automatic); one person's choice never reaching another's; the
data-layer guard on organisation defaults with its audit entry; personal reduce-motion, text size and
touch size surviving a redraw; for all 20 roles the pane holding exactly the pages `navModel()` allows;
no dead-end link; pages every role needs still offered; the hero button never leading to a refusal;
folding and rail preferences per person; the shell drawing the pane or the tab sheet by personal
choice; the Preferences page for every role; every CSS custom property defined; no em or en dashes in
the new files.

