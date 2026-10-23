# 05 · Reports and indicator definitions

A number without a definition is an opinion. Every indicator in CareLink DIMS carries a written
definition, a source, a period and a cut-off. The dictionary lives in `src/data.js` (`INDICATORS`) and
is displayed inside the product, so a manager reading a report can see how each figure was produced.

---

## 1. Reporting calendar

| Report | Frequency | Generated | Cut-off |
|---|---|---|---|
| Patient Figures | Weekly (management meeting) | Monday **08:00 EAT** | Sunday 23:59 |
| Patient-Days | Weekly | Monday 08:00 EAT | Report date |
| Expenditure | Weekly and monthly | Monday 08:00 EAT | Report date |
| Master Referral Document | Monthly / on demand | Manual | Report date |
| Executive Summary | Monthly / quarterly | Manual | Period end |
| Home Visit Report | Weekly | Manual or Monday set | Report date |
| Hospital Operations Report | Weekly | Manual | Report date |
| Data Quality | On demand | Manual | Report date |

The scheduler (`REPORTS.mondayTick`) compares the local clock against the most recent Monday 08:00.
If a run has not been recorded for that slot it generates the set for **each county office** —
Patient Figures, Patient-Days and Expenditure — stamps them `scheduled: true`, records the run and
writes a `report.scheduled` audit entry. A manual run is always available and is recorded separately
(`scheduled: false`), so a manually generated report can never be mistaken for the automated one.

Next run is displayed in the console and in Settings, with the last run time.

---

## 2. Indicator dictionary

| # | Indicator | Definition | Source |
|---:|---|---|---|
| 1 | Active patients at cut-off | Patients enrolled and not yet discharged, effective at 23:59 on the cut-off | `patient.status` + effective dates |
| 2 | New patients assessed | Distinct patients whose initial assessment was submitted during the period | `assessment.submitted_at` |
| 3 | Approved for enrolment | Enrolment decisions recorded in the period | `enrolment.approved_at` |
| 4 | Enrolled in the previous week | Enrolments effective in the seven days before cut-off | `enrolment.effective_date` |
| 5 | Discharged in the previous week | Approved discharges effective in the seven days before cut-off | `discharge.effective_date` |
| 6 | Discharged month to date | Approved discharges from the first of the month to cut-off | `discharge.effective_date` |
| 7 | Requiring follow-up | Active patients with an open concern, an overdue visit or an overdue PDCA check — counted once | `concerns` + `visits` + `pdca` |
| 8 | Not found at home | Documented failed visits in the period; one count per patient | `visit.outcome = not_found` |
| 9 | Inpatients | Open hospital admissions at cut-off | `encounter.admitted_at` |
| 10 | Outpatients | Hospital outpatient encounters in the period, per patient per day | `encounter.type = outpatient` |
| 11 | Foodbags issued | Physical foodbags issued and evidenced in the period | `support_issue` |
| 12 | Bibles issued | Physical Bibles distributed | `support_issue` |
| 13 | Mosquito nets issued | Nets distributed | `support_issue` |
| 14 | Mattresses issued | Mattresses distributed | `support_issue` |
| 15 | Blankets issued | Blankets distributed | `support_issue` |
| 16 | Special bags / other support | Other approved items | `support_issue` |
| 17 | Children in orphan-prevention work | Children in enrolled households meeting the **approved outcome definition** (education continuity + nutrition + guardian care plan, verified at assessment and review) | `household_child` + `outcome_verification` |
| 18 | Reported faith engagement | Voluntary, consented record. **Restricted field** — excluded from public and donor reports and never used as a staff target | `patient.faith_record` (restricted) |
| 19 | Hospital requests submitted | Requests submitted in the period | `request.submitted_at` |
| 20 | Hospital requests approved | Clinical approvals in the period | `request.decided_at` |
| 21 | Hospital requests completed | Service delivery recorded in the period | `request.service_completed_at` |
| 22 | Hospital requests outstanding | Requests not closed at cut-off, by reason | `request.status` |

**Two definitions deserve emphasis.**

- *Children rescued from becoming orphans* is **not** "every child in a patient's household". The
  indicator counts only children for whom the approved outcome definition is evidenced. The report
  says so in its notes section, and the definition is displayed next to the figure.
- *Faith engagement* is voluntary and restricted. It is excluded from public and donor-facing
  reports, is not visible to media or finance roles, and is never used to rank or appraise staff.

---

## 3. Caseload calculation

The report shows its arithmetic:

```
Closing active caseload = Opening active caseload
                        + enrolments effective in period
                        − discharges effective in period
                        − transfers and other authorised status changes

System active count at cut-off is shown separately, with the variance.
```

A non-zero variance is displayed, not hidden. It indicates a status change or effective date outside
the reporting window and must be reconciled by the responsible officer before the report is issued.
Subtracting discharges from last week's caseload without adding enrolments is exactly the error this
calculation is designed to expose.

---

## 4. Patient-Days

Days in programme = calendar days from the recorded intake date to the cut-off (or to the discharge
date for discharged patients).

| Milestone | Meaning | Required action |
|---|---|---|
| 60 days | Standard mid-point | Routine review |
| 100 days | Approaching extension review | Prepare extension rationale |
| 120 days | Extension review due | Documented extension required to remain enrolled |
| 180 days | Discharge evaluation overdue | Approved discharge evaluation with evidence |

Each row shows: patient, ministry area, intake, days, last visit, open PDCA actions, status,
discharge-readiness assessment, documented extension reason and the responsible officer.

Duration alone never triggers discharge. The report states this in its own notes.

---

## 5. Expenditure — five distinct states

| State | Meaning |
|---|---|
| **Budgeted** | The approved monthly budget line, at its current version |
| **Committed** | Authorised but not yet paid |
| **Paid** | Money has left the organisation |
| **Reconciled** | A receipt or supporting evidence has been reviewed and matched |
| **Remaining available** | Budget − committed − paid |

They are shown as five separate columns and are never summed as though they were the same thing.
Month-end projection is computed as `(paid + committed) ÷ days elapsed × days in month`, and the
method is stated in the report.

**Evidence flags** raised automatically: missing receipt, duplicate transaction reference, payment
without an approved request, amount above the routine limit, incomplete reconciliation.

---

## 6. Report integrity block

Every generated report states:

- reporting period and cut-off;
- generation date and time;
- county office scope;
- data source;
- report version and period key;
- who generated it (named account, or "Scheduled automation");
- the target and budget versions in force;
- known limitations (for example: facilities that do not submit structured returns under-report
  inpatients).

Archived reports are retained. Regeneration creates a new version; it never overwrites an issued
report. Each archive entry carries a checksum.

---

## 7. Privacy in reports

| Classification | Applies to | Handling |
|---|---|---|
| Internal organisational | Patient Figures, Patient-Days (scoped) | Names visible only within the viewer's authority |
| Restricted departmental | Expenditure, Data Quality | Finance and audit scopes |
| Confidential patient-related | Master Referral Document | Clinical authority; names retained |
| Donor-facing (approved) | Executive summary extracts | **Redacted** — no names, phone numbers, CCC numbers, IDs or photographs |

The Master Referral Document is generated from the live register — never from a side spreadsheet —
and flags any referral to an entity that is not verified.

---

## 8. Formats

| Format | Available | Notes |
|---|---|---|
| Print / PDF | Yes | Dedicated A4 stylesheet, LOMAMO letterhead |
| CSV | Yes | Per-report tabular export |
| DOCX | Partial | Print-to-PDF then convert; native DOCX generation is a Phase 2 item |
| XLSX | Partial | CSV imports directly into Excel; native workbook export is Phase 2 |
| HTML | Yes | The report document itself |

Native DOCX/XLSX generation is deliberately listed as incomplete rather than claimed as working.
