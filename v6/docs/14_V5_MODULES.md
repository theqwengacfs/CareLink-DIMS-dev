# 14 · The v5.0 modules

This document describes the seven workspaces added in v5.0, what each one refuses,
where its data lives, and what is deliberately outside it. It is written for the
person who has to run the system, not for the person who wrote it.

Version 5.0 · schema 5 · October 2026

---

## 1. Paper forms (`src/forms.js`)

Six forms are reproduced field for field from the supplied scans:

| Kind | Printed code | Pages | Notes |
|---|---|---|---|
| `patient_assessment` | LMMK 001 | 4 | Adult assessment and intake |
| `minor_assessment` | LMMK 004 | 4 | Child under 18; the paper footer reads "Page 4 of 3" and is kept as printed |
| `home_visit` | LMMK- | 2 | Every-visit form |
| `hospital_outpatient` | LMMK 020 | 2 | Question numbers 10 and 12 to 14 are absent on the scan; kept absent |
| `hospital_inpatient` | LMMK 020 | 2 | Same printed code as outpatient; the numbering resumes at Q9. Both are kept as separate kinds |
| `discharge` | DISCHARGE | 1 of 2 | **The upload contains page one only.** `partial: true`; no page two is invented |

Behaviour:

- **Draft → submitted → verified**, with a `returned` branch that requires a reason.
- The person who entered a form cannot verify it. A different officer verifies against
  the signed paper copy.
- The same form for the same patient on the same visit date is refused, not merged.
- A verified form cannot be edited.
- Field validation follows the paper: a positive HIV answer needs a clinic card number,
  a referral needs a place and a reason, a health risk needs an explanation, a
  medication default needs a number of days, and a minor assessment refuses an age over 17.
- Printing produces the document, not the console. `printDoc()` writes the document to a
  body-level container; `@media print` hides `#root`, so the sidebar, the modal and the
  buttons never appear on paper.

Capabilities: `form.view`, `form.create`, `form.verify`.

---

## 2. Pharmacy (`src/pharmacy.js`)

Two ledgers and one screen.

**Formulary.** About fifty items with unit, reorder level, category, allergy class and
recorded interactions. It is a working list for this programme, not a national formulary.

**Prescribing.** `RX.prescribe(user, …)` refuses:

| Refusal | Reason |
|---|---|
| Patient outside scope, or not active | A prescription belongs to an enrolled patient |
| No dose, no duration (1 to 365 days), no quantity | The printed prescription must be complete |
| No clinical reason | "Routine" is not a reason |
| A recorded allergy to the medicine's class | **No override exists** |
| A severe interaction without a written reason | The reason is stored on the prescription |
| A role without `clinical.prescribe` | Enforced in the data layer |

Moderate interactions and duplicates are recorded as alerts on the prescription and shown
wherever it is read.

**Dispensing.** `RX.dispense()` takes the **earliest expiry first**, excludes expired and
empty batches, writes one negative movement per batch to the stock ledger, and refuses a
fully dispensed or cancelled prescription. A shortfall is dispensed only with a written
note, and the prescription stays partially dispensed.

**Stock.** A quantity changes only through a receipt, a dispense or a reasoned adjustment.
A receipt refuses a past expiry and a zero quantity. An adjustment refuses a negative
balance and an empty reason. Expiry within 60 days, below reorder level and out of stock
are surfaced on the page.

Capabilities: `pharmacy.view`, `pharmacy.manage`, `clinical.prescribe`, `clinical.dispense`.

---

## 3. Care plans (`src/omaha.js`)

The structure follows the Omaha System documents supplied:

- four domains: environmental, psychosocial, physiological, health-related behaviour;
- a problem list with category and problem statement;
- the three rating scales (Knowledge, Behaviour, Status), each 1 to 5;
- four intervention categories: Teaching, Guidance and Counselling (TGC), Treatments and
  Procedures (TP), Case Management (CM) and Surveillance (SUR).

The problem list is an **adapted subset**, and the screen says so. The full scheme is
licensed and is not reproduced.

Rules:

- a plan is drafted from a template or from chosen problems, then rated;
- **approval is refused** to the person who drafted the plan;
- **approval is refused** while any problem is unrated;
- approval opens a 30-day PDCA record through the existing review engine, so there is one
  review clock in the system, not two;
- a printable care plan carries the problems, the interventions and the rating history.

Capabilities: `careplan.view`, `careplan.manage`, `careplan.approve`.

---

## 4. Leave and field coverage (`src/leave.js`)

Two rule sets, kept apart (decision B36).

**Entitlement** is computed, not typed:

| Rule | Meaning |
|---|---|
| E1 | 15 working days a year, prorated in the first year from the start date |
| E2 | 3 casual days a year, single-day requests only |
| E3 | Seven days' notice; a shorter notice is recorded as an exception |
| E4 | Sick leave beyond two days needs a certificate (recorded as a warning) |
| E5 | Unused annual leave lapses unless a written deferral exists |

**Coverage** is evaluated for every working day in the request against a published weekly
pattern of named people at named locations:

| Rule | Meaning |
|---|---|
| R1 | Monday is the office day; annual and casual leave on a Monday is refused |
| R2 | Wickliff may be away on a Monday (hospital ministry) |
| R3 | Each member of staff has one office day |
| R4 | Casual workers cover field and ministry locations and cannot be in two places on one day |
| R5 | No leave is approved if it leaves a location uncovered |

When a slot would be uncovered, the engine names a substitute (a colleague who is not
already scheduled, then a casual worker) and records that person in the cover register at
the moment of approval. The check is re-run at approval, because the register may have
changed since the application.

A request cannot be decided by the person who applied for it or by the person taking it.
The seven staff names and the three casual workers are the placeholders supplied in the
specification, kept exactly as supplied and marked where they are placeholders.

Capabilities: `hr.view` (register), `hr.leave.approve` (decisions).

---

## 5. Visit planning (`src/schedule.js`)

The calendar shows commitments; this module proposes them.

`SCHED.propose(user)`:

1. reads the patients in the person's scope who are active or in extension;
2. computes the next due date from the recorded visit frequency, the 30-day PDCA review and
   any discharge recommendation;
3. ranks by days overdue;
4. places each patient on a working day, preferring the day on which the person is already
   in that ministry area, and never more than six stops a day;
5. removes days on which the person is on approved leave;
6. lists everyone who could not be placed, with the reason.

The result is a **draft**. Nothing is on the calendar until `SCHED.accept()` is called, and
only the owner of the plan can accept it. Acceptance writes one calendar event per stop.

Capabilities: `visit.create` or `pdca.create`.

---

## 6. Word and Excel without a library (`src/exportdocs.js`)

Both formats are ZIP archives of XML, so both are written with a stored-ZIP writer and the
minimum Open Packaging Convention parts that Word and Excel accept.

- `DOCX.fromHtml(title, html)` writes headings, paragraphs, bullet lines and tables.
  It does not embed images, footnotes or comments.
- `XLSX.fromSheets([…])` writes one table per sheet with a bold header row, an autofilter
  and column widths. It does not write formulas or charts.
- Every export states what was exported and how many rows, in the audit trail.
- A file the browser blocks is reported as blocked, never as saved.

Exports: any report as Word; the patient register, the organisational registry, stock on
hand, the weekly coverage sheet and a field plan as Excel.

---

## 7. Document storage (`src/files.js` and `server.py`)

A document record without its file is a promise, not a record.

- Bytes are stored **on the host**, inside the same SQLite database, with a SHA-256 digest,
  a retention class and the uploader.
- Nothing is stored in the JSON document that is mirrored to every device.
- A file is readable only with a live host session.
- The interface never deletes a file. Retention classes and the review date make disposal a
  deliberate, audited act.
- If no host is reachable, the record is saved and **marked as having no file**. The system
  never claims a file was stored when it was not.

Retention classes: clinical (7 years), employment (7 years), finance (7 years), permanent,
standard (3 years).

---

## 8. Capability additions

`ROLE_ADDITIONS` in `src/data.js` grants the new capabilities in one readable table. The
generated matrix in `docs/02_RBAC_MATRIX.md` shows the result for every role. No new
capability widens an existing scope, and none of the new capabilities is granted to a role
that cannot already see the patient.

---

## 9. What is tested

`test/v43.js` holds 150 assertions across the seven modules: refusals as well as successes.
`test/server_api.py` adds 14 checks for host password verification and the file store.
`test/modals.js` opens every new dialogue. `test/views.js` renders every new console for
every account.

Run all of it with:

```bash
bash run-all-tests.sh
```
