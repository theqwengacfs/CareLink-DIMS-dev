# 04 · Workflows

Every transition is data, not code. `WORKFLOW` in `src/core.js` declares, for each state change:
the permitted source states, the destination state, the **capability** required, and whether a
**reason**, **evidence** or **guard** is mandatory. `transition()` enforces all of it, writes the
audit entry and notifies the originating user.

---

## 0a. What changed in v5.0

Five new workflows are described module by module in `docs/14_V5_MODULES.md`: paper forms and
verification, prescribing and dispensing, care plans with second-clinician approval, leave with
field coverage, and weekly visit planning. The decision register in `docs/08` gains B36 to B40
for the questions they settled.

## 0. What changed in v4.1

| Workflow | Rule now enforced |
|---|---|
| Enrolment | The transition is refused without an initial care plan: identified need, expected duration and the reason for that estimate. |
| Care-plan review | Twelve slots at 30-day intervals from the programme start. A slot keeps its original due date; completion records a separate date and shows the delay. |
| Extended case | Beyond the programme maximum, a documented extension review (20 characters minimum) is required before discharge. |
| Discharge | The discharge guard refuses a discharge while an extension review is outstanding. Duration alone never discharges a patient. |
| Delegation | A named colleague receives a defined set of capabilities for a window of no more than 120 days. Only capabilities the delegating officer holds may be delegated. |
| Condition | A care worker may record a suspected condition. Only a clinician may document or confirm a diagnosis. |
| Care centre | Daily handover entries are per shift. A safeguarding incident may only be closed with a written resolution. |

---

## 1. Patient enrolment — paper to programme

```
Assessment initiated ──► Physical form submitted ──► Digital record entered
        (caregiver)                 (caregiver)              (admin assistant)
                                                                   │
                                                                   ▼
                                                        Awaiting verification
                                                                   │
                     ┌─────────────────────────────────────────────┼───────────────────┐
                     ▼                                             ▼                   ▼
            Returned for correction ◄───────────────  Verify record          Reject (reason)
                     │                                (admin assistant)              │
                     │                                        │                      ▼
                     └──► Digital record entered              ▼                   Rejected
                                                       Approved for enrolment
                                                              │
                                                              ▼
                                                    Enrol patient ──► Enrolled · active
```

| Action | Capability | Controls |
|---|---|---|
| Submit physical form | `patient.assess.create` | Caregiver only, own ministry area |
| Digitise / resubmit | `patient.digitise` | Duplicate check against name + area + CCC |
| Submit for verification | `patient.digitise` | |
| Verify | `patient.verify` | Source document must be confirmed |
| Return for correction | `patient.return` | **Reason required** |
| Reject | `patient.enrol` | **Reason required** |
| Enrol | `patient.enrol` | Enrolment date stamped |

**Duplicate protection.** Creating an assessment with a name that already exists in the same ministry
area is blocked with a warning before the record is written. Digitising a form never creates a second
patient when a matching patient is found — the system requires an explicit decision.

**Preserved history.** Returning a record does not delete the digital entry. The original source
document, the person who entered it and every correction remain visible on the History tab.

---

## 2. Discharge

```
Enrolled · active ──► Discharge recommended ──► Discharged
   (caregiver/coordinator)     (clinical admin)      │
        reason required              evidence required │
                                     └──► Decline (reason) ──► active
```

- Recommendation requires a **documented reason**.
- Approval requires **supporting evidence** (assessment, visits, PDCA outcomes, clinical review).
- Programme duration alone never discharges a patient. 180 days raises a *review requirement*, not a
  discharge.
- An extension beyond 120 days records `extension` status with a documented reason.

---

## 3. Hospital request — the seven stages

```
 1  Caregiver submits        status: submitted
        │                    patient, reason, priority, facility, transport, escort, documents
        ▼
 2  Medical Case Manager     approve │ return │ reject │ escalate │ defer
        │                    status: approved (or returned / rejected)
        ▼
 3  Routing                 status: approved → assigned
        │                    County Administrator + Hospital Liaison Person + caregiver visibility
        ▼
 4  Administrative & transport facilitation
        │                    medical approval ≠ transport approval ≠ financial authorisation
        │                    ≠ payment. Four separate records, four separate actors.
        ▼
 5  Hospital service        status: assigned → completed
        │                    attendance, facility, consultation, labs, medication,
        │                    admission/discharge, expenses, report
        ▼
 6  Evidence & reconciliation
        │                    liaison uploads receipts and records → clinical review →
        │                    finance reconciles
        ▼
 7  Closure                 status: reconciled → closed
                             only when the clinical report exists and no transaction is unreconciled
```

| Transition | Capability | Notes |
|---|---|---|
| Submit | `hosp.request.create` | Own ministry area patients only |
| Approve | `hosp.request.review` | Medical Case Manager. **Caregivers and liaison persons do not hold this** |
| Return / Reject | `hosp.request.review` | Reason required, recorded permanently |
| Assign | `hosp.request.assign` | Must select a liaison person in the same county |
| Record service | `hosp.visit.record` | Clinical report required |
| Reconcile | `hosp.receipt.review` | Finance or designated administrator |
| Close | `hosp.close` | **Guard:** clinical report present AND zero unreconciled transactions |

Closing an unreconciled case is impossible in the UI because the guard rejects it in the engine —
not because the button is greyed out.

---

## 4. Account creation

```
Draft ──► Submitted ──► Under review ──► Approved ──► Active
                              │              │
                              └► Rejected    └► (activation issues a one-time code)
                                                     │
                                          Suspended ◄─┴─► Deactivated
```

- Coordinators request accounts for caregivers and field workers in their areas.
- Medical Case Managers request accounts for liaison persons, nurses, clinical officers and
  psychosocial staff.
- Department heads request accounts for their own staff.
- **County Office Administrator approves.** The Chief System Administrator retains authority over
  role templates and exceptional access.
- Approval generates a username and a one-time activation code, displayed **once** on a printable
  onboarding sheet. The password is stored only as a salted hash. No screen anywhere can display an
  existing password.

Every request records: requester, reviewer, decision, date, reason.

---

## 5. Leave (from `STAFF_LEAVE_MANAGER_SPEC.md`)

```
Applied ──► Pending ──► Approved │ Rejected
                          │
                          └─► Recorded against entitlement; visible to HR and the reporting officer
```

| Rule | Statement |
|---|---|
| BR-01 | Annual leave: 15 working days per completed year |
| BR-02 | Casual leave: 3 single days per year |
| BR-03 | Apply ≥ 7 days ahead except in emergencies |
| BR-04 | Monday absence requires documented County Office Administrator approval |
| BR-05 | No more than two staff from one ministry area on leave simultaneously |
| BR-06 | Unused annual leave lapses unless deferral is approved in writing |
| BR-07 | Sick leave beyond two days requires a medical certificate |
| BR-08 | HR recommends; Department Head approves; Director approves for department heads |

The rules are presented in the Leave console as configuration, with the version noted, so that a
change of policy is visible rather than hidden in code.

---

## 6. Media publication

```
Uploaded ──► Classified ──► Pending review ──► Approved ──► Published
                                  │
                                  ├─► Declined
                                  └─► Blocked  (consent missing, withdrawn, or scope too narrow)
```

`GOV.canPublish(doc)` evaluates the **live** consent record at the moment of publication:

1. Consent status must be `granted`.
2. Consent scope must permit the intended use (internal-use consent cannot authorise a success story).
3. The asset must not be restricted to clinical access.

Withdrawing consent immediately demotes any previously approved asset and blocks republication.

---

## 7. Backup and restore

```
Backup selection ──► Validation ──► Dual approval ──► Restore preparation
                                          │
                                          ▼
                                   Execution ──► Verification ──► Audit entry
```

Dual approval: the requester raises the request; two independent approvers must sign; the requester
cannot approve their own request. The pre-restoration state is preserved so an accidental restore
does not destroy recoverable data.

---

## 8. Master import

```
Select file ──► Detect structure ──► Map columns ──► Validate ──► Preview ──►
   (offline)      (engine)            (human confirms)   (per row)    (human decides)
                                                                          │
                            pre-import backup ──► Commit ──► Reconciliation report
```

Decisions available per flagged row: import as new, import and flag, skip, send for review.
Merging is never automatic and never based on name similarity alone.
