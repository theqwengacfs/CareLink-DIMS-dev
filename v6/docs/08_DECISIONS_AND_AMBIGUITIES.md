# 08 · Decisions, conflicts and open questions

The specification requires that conflicts be identified and resolutions documented rather than
invented. This register records every material decision taken in this build, the evidence behind it,
and what still requires LOMAMO's formal approval.

**Status key:** `DECIDED` — resolved in this build · `PROPOSED` — implementation awaits approval ·
`BLOCKED` — cannot proceed without an input that has not been supplied.

---

## A. Structural decisions

### A1. One platform, differentiated workspaces — **DECIDED**
Twenty account categories share one codebase, one login and one database, but each receives a
different console, navigation set, default landing page, colour identity, data scope and report set.
Related roles share components without sharing data (caregivers across areas use one application with
different scopes; the Medical Case Manager and the Hospital Liaison Person use related but distinct
clinical workflows).

### A2. Separation of the Chief Administrator and Information Governance — **DECIDED**
The risk in the requirements was that both roles could silently override the other over sensitive
information and backups.

Resolution:
- Governance is a **rule engine** (g1–g8), not a super-user account.
- The Chief System Administrator configures the platform and holds no clinical authority by default.
- The Media & Information Governance Head owns publication and policy.
- Restore and full-database export require **dual approval**: the requester cannot self-approve, and
  two independent signatures are required. One role cannot override the other.
- Neither can edit the audit trail.

### A3. Paper assessment → digital record — **DECIDED**
The physical form remains the primary field record. The caregiver initiates the assessment and
recommends enrolment; the Administrative Assistant digitises and verifies it. The handover is
explicit and auditable:

`assessment_initiated → form_submitted → digital_entered → awaiting_verification → approved_enrolment → active`

with `returned` and `rejected` branches, each requiring a documented reason. Digitising a form never
creates a duplicate patient: a matching name + area (or CCC/file number) forces an explicit decision.

### A4. Master workbook first, application second — **DECIDED**
The architecture was prepared before any data operation, and the import path was built, tested and
demonstrated end to end (engine → JSON → wizard → commit → reconciliation) rather than deferred until
after a large synthetic database was generated. No production patient data is embedded.

### A5. Configurable workflows, not hard-coded screens — **DECIDED**
States, transitions, required capabilities, reasons and guards are data (`WORKFLOW`). The Medical Case
Manager console is one module and can be rebuilt without destabilising the platform.

---

## B. Conflicts resolved in this build

### B1. Role list vs organogram — **PROPOSED**
The requirements propose twenty account categories. The KCO organogram and job functions confirm the
leadership, administration, ministry, medical, media, finance and support functions. Where a
responsibility is not documented in the organogram or a job description, the role is presented with a
template and marked for confirmation in the RBAC matrix.

*Requires:* leadership confirmation of the twenty role templates and their reporting lines.

### B2. Homa Bay ministry areas — **BLOCKED (partially)**
The requirements name **Makongeni, Sofia and Shauri Yako**. The v3.3.2 system image referenced a
larger Homa Bay sub-county structure (eleven service points).

Resolution taken: only the three named areas are loaded. Adding areas is a two-click operation in
Organisation Configuration, and the system displays a standing warning on the Organisation screen.

*Requires:* the verified Homa Bay area list before any Homa Bay field import.

### B3. "Hospital Liasion Person" — **DECIDED**
The spelling in the requirements is a typographical error. The role is implemented as **Hospital
Liaison Person** throughout, including the capability names (`hosp.*`) and the console title.

### B4. 120-day / 180-day discharge — **DECIDED**
The requirements mention 60/100/120/180-day milestones in one place and imply discharge around 120
days elsewhere. Programme duration does **not** discharge a patient. 120 days raises an extension
review; 180 days raises a discharge evaluation requirement. Discharge requires a documented reason
(recommendation) and supporting evidence (approval).

### B5. Transport-fare request form — **BLOCKED (partially)**
The requirements refer to "the attached sample transport-fare request" and instruct that its actual
fields be reproduced. **That image was not among the supplied files** (the only image supplied is the
Foundation letterhead logo).

Resolution taken: a transport component was built with the fields described in the requirements —
journey, estimated fare, number of persons travelling, escort requirement, reason, supporting
information and approval — and is fully configurable.

*Requires:* the fare-request image so the exact field structure can be matched, including any
per-diem, signature or authorisation fields it contains.

### B6. Faith engagement reporting — **DECIDED**
The requirements list "patients recorded as having received salvation". This is treated as a
**restricted, voluntary** field: recorded only where the patient consents, visible only to authorised
ministry and leadership roles, excluded from public and donor-facing reports, and never used as a
staff performance target. The report notes section states this explicitly.

### B7. "Children rescued from becoming orphans" — **PROPOSED**
The requirements warn against counting every child in a household. The indicator therefore counts only
children meeting an approved outcome definition (education continuity + nutrition + guardian care
plan, verified at review), and the report says so.

*Requires:* formal adoption of that outcome definition by programme leadership and M&E.

### B8. Targets from the Mid-Year Report — **PROPOSED**
The reviewed Mid-Year Report (Jan–Jun 2026) records 512 patients served, 378 new and 315 discharged
for the half-year, against a budget of KES 14.74M. These are **historical baselines**, not monthly
targets.

Resolution taken: the H1 figures are loaded as a dated baseline (version 1) and clearly labelled
`BASELINE — Mid-Year Report`. Monthly targets are entered by the County Office Administrator and are
versioned; the demonstration values are labelled demo.

*Requires:* October 2026 targets from each County Office Administrator.

### B9. Third-party storage (Terabox and similar) — **DECIDED**
No integration is provided with Terabox or any consumer synchronisation service. Backup destinations
are limited to a local secure volume and explicitly approved services. A consumer file-sharing
service is not an appropriate destination for clinical records.

### B10. External AI services — **DECIDED**
No cloud AI provider is configured or offered. The assistant is deterministic over scoped data, with
an optional adapter to a **local** Ollama instance. This satisfies the requirement that patient data
must not be transmitted externally by default.

### B11. Financial terminology (SHIF / SHA) — **DECIDED**
The budget line is labelled **"SHIF / SHA contributions"** and is a configurable budget category, so
the organisation's current terminology can be adopted without a code change.

### B12. Reporting cut-off — **DECIDED**
Monday 08:00 EAT reports use **Sunday 23:59 EAT** as the cut-off. The period and cut-off are printed
on every report, and the caseload calculation shows opening, enrolments, discharges and closing.

### B13. Hospital Liaison visibility — **DECIDED**
A liaison person sees **only the requests assigned to them**, not the county caseload — the least
privilege consistent with the work. This is a role-scope setting (`records: 'assigned'`) and can be
widened by the Chief Administrator if LOMAMO prefers county-wide visibility.

### B14. Account provisioning at scale — **PARTIAL**
Account requests, approval, one-time activation codes and printable onboarding sheets are
implemented. A **bulk CSV staff import** is not yet built; the workflow is individual request →
approval. Bulk provisioning is a Phase 2 item and must retain the approval step.

### B15. Offline synchronisation between tablets — **DEFERRED**
The build is offline-capable on one device and supports export/import of the whole dataset. True
multi-device offline synchronisation (conflict resolution, merge policy) requires a server with a
sync protocol. It is not claimed to work. The recommended deployment is either a single office server
on the LAN or one tablet per caregiver with a controlled reconciliation step at the office.

### B16. Electronic signatures — **PROPOSED**
Approvals are attributable records (account, timestamp, reason), which is stronger than an image of a
signature. If LOMAMO requires a drawn or cryptographic signature for discharge or financial approval,
that is an additional feature and should be specified.

### B17. Audit visibility for leadership — **DECIDED**
The President and Country Director see aggregate leadership reporting and the audit trail summary,
but not confidential clinical detail (no `patient.view.clinical`) and not individual HR or welfare
contribution records. Broad oversight does not mean unrestricted access to sensitive detail.

### B18. Retention periods — **PROPOSED**
Indicative periods are documented in doc 03 §11. They require leadership and legal confirmation under
the Kenya Data Protection Act, 2019 before being enforced.

### B19. Patient export is a capability, not a side effect — **DECIDED**
The register CSV export was originally reachable by anyone holding `patient.list`, which would have
let a caregiver export their whole ministry area in one click. Export is now a distinct capability
(`patient.export`), granted only to the County Office Administrator, the Medical Case Manager and
M&E, always scoped to the holder's county and always written to the audit trail. A refused export is
recorded as a denial. Full-database export remains a separate, dual-approved operation.

### B20. Verification and enrolment are two different decisions — **DECIDED**
The Administrative Assistant verifies that a digitised record matches the physical form; the County
Office Administrator authorises enrolment. Splitting them means no single person can create a patient
from paper and admit them to the programme without a second pair of eyes. When the current user
cannot perform the next step, the record now states **who** can — so the handover is visible rather
than a dead end.

### B21. "Dual approval" means initiator plus one independent authoriser — **DECIDED**
Two signatures, both named on the record: the person who initiated the restore or export, and one
authorised countersigner. The initiator cannot countersign, no one can sign twice, and only the
Chief System Administrator (operational capability) or the Media & Information Governance Head
(governance capability) may countersign. Earlier drafts counted the initiator as a third signature,
which would have made restores impossible to execute.

### B22. Two additional reports — **DECIDED**
A Home Visit Report (visit outcomes, failed visits, caregiver activity) and a Hospital Operations
Report (pipeline, transport, evidence and reconciliation position) are now generated from live data.
They were referenced in the report catalogue but had no builder, so selecting them produced an empty
document. Both are now first-class reports with integrity blocks.

### B23. The host computer is the system of record — **DECIDED**
The v4.0 build held data only in the browser, so a tablet and a laptop could never share records.
That is incompatible with running one operating system for the Foundation, and it contradicts the
deployment model in the v3.3.0 handoff. `server.py` now holds the authoritative copy in SQLite on the
host computer. Browsers keep a local copy only as a working buffer. A change is confirmed to the
person only after the host has accepted it.

### B24. Conflicts are refused, never merged — **DECIDED**
A save carries the revision the device last read. If the host has moved on, the save is refused with
409 and the superseded revision is preserved. The person chooses: adopt the central copy, keep the
device copy as a new revision, or download both to compare. Last-write-wins is not used for any
record, clinical or financial. This is the same principle as the v3.3.0 backup pipeline, applied to
concurrent editing.

### B25. Delegation replaces shared credentials — **DECIDED**
A named colleague may receive a defined set of capabilities for a window of at most 120 days. The
grant is intersected with what the delegating officer holds at the moment of use, so a delegation
cannot widen authority. The audit trail records the delegate's own identity and names the
delegating officer. Expiry is automatic.

### B26. Conditions are recorded, never inferred — **DECIDED**
A condition row names its recorder, its certainty and, where applicable, the clinician who
confirmed it. Caregivers may record a suspected condition. Only a holder of `condition.confirm` may
document or confirm a diagnosis. HIV, TB, co-infection, cancer and cryptococcal meningitis are
flagged sensitive and withheld from any role without `condition.sensitive`, including from aggregate
tables that could re-identify a small group.

### B27. Small-group suppression at five — **CONFIGURABLE DEFAULT**
Aggregate condition counts under five are shown as a band, not a number. Five is a working default
for a caseload of this size. LOMAMO's information-governance policy should confirm or replace it;
the value lives in one function (`COND.aggregate`) so the change is a single edit.

### B28. The care centre is not a hospital console — **DECIDED**
The homestay carries occupancy, daily care, handover, meals, safeguarding, cleaning and maintenance.
It does not carry theatre lists, hospital billing or clinical notes. Clinical records remain in the
patient record and are reached only through clinical capabilities. A safeguarding register is
restricted to `care.incident`; HR can see that the care centre exists but cannot read an incident.

### B29. No role was invented for the care centre — **OPEN**
Rather than add a permanent "Care Centre Manager" post, the console is granted to existing roles:
Medical Case Manager and Nurse (clinical and operational), County Office Administrator and
Administrative Assistant (administrative), Caregiver (daily log), Director and HR (view). If the
organogram does contain a dedicated care-centre post, LOMAMO should confirm it and the role can be
added without code changes. **This is a question for the organogram owner.**

### B30. Settings are split into global and personal — **DECIDED**
Thirteen labelled sections replace the previous four-card page. A person sees only the sections they
may use. Personal preferences (rows per page, reduced motion, default console) are stored against
the person and never audited as system changes. A global change records the previous and new value.

### B31. A 60-second idle window, enforced on the host - **DECIDED, WITH A WARNING**
The requirement is implemented as written. It will be disruptive for staff writing long assessments
on a tablet, and the risk is not theoretical: a session that ends mid-form loses typing that was not
drafted. Three mitigations are in place - a warning at 45 seconds, Save draft on long forms, and the
draft restoring when the same person reopens the form. The value remains configurable
(`CARELINK_IDLE_SECONDS`) but changing it is an exception that must be approved and recorded, not a
convenience. **Recommendation to LOMAMO: trial 60 seconds for one week and decide with evidence.**

### B32. Messaging is not a clinical channel - **DECIDED**
Messages refuse an obvious patient code, clinic number, phone number or patient name. That is a
narrow guard against the mistake people actually make, not a filter that pretends to understand
clinical text. The deeper rule is cultural and is stated in the interface: patient detail belongs in
the patient record, where access and audit apply.

### B33. Presence is derived, never declared - **DECIDED**
A person's availability comes from their own authenticated heartbeat. No one can set another
person's presence, and the label is textual as well as coloured. Cross-device presence requires the
office server; without it, presence is local to the device and says so.

### B34. Publication is enforced in the query - **DECIDED**
The public portal is not a hidden console. `/api/public/content` builds its result from records that
are both published and public, so an unpublished item does not exist for a visitor even if the
address is typed directly. A withdrawn item is never returned.

### B35. The theme system cannot touch permissions - **DECIDED**
Ten landing themes change the front door only. Workspace accent follows the department identity and
the person's accessibility setting. Status colours (clinical red, financial amber, success green)
are fixed semantics and are never overridden by a theme.

### B36. Leave: two rule sets, kept apart and both enforced - **DECIDED**
Two documents describe leave differently. The Staff Leave Management specification sets entitlement
(annual, casual, notice, sick certificates, lapse). The field-coverage instruction sets the working
pattern (Monday office day, the Wickliff Monday exception, one office day each, casual cover, no
approval that leaves a location uncovered). They answer different questions and cannot be merged
into one number.

Resolution:
- Entitlement is computed in `LEAVE.balance()` from the staff record's start date, prorated in the
  first year. It is never typed in.
- Coverage is computed in `LEAVE.check()` against a published weekly pattern of named people at
  named locations. A request that would leave a location without cover is refused with R5, unless
  the engine can name a substitute, and the substitute is written into the cover register.
- The seven-day notice and the sick-certificate rule are warnings recorded with the decision, not
  silent refusals: the person deciding sees them.
- The approval chain is a single recorded decision by a holder of `hr.leave.approve` (HR Officer,
  Department Head, County Administrator or Director). The person who applied and the person whose
  leave it is cannot decide it. BR-08's "HR recommends, Head approves" is represented by two
  different people holding the capability, not by two sequential states.

### B37. Paper forms: the paper copy remains primary - **DECIDED**
Each of the six supplied forms is reproduced field for field. A digital entry carries `draft`,
`submitted`, `verified` or `returned`. Verification requires a second officer; the person who
entered the form cannot verify it. Two forms of the same kind for the same patient on the same visit
date are refused rather than merged. Where the scan is incomplete, the form says so: the discharge
form is one page of a two-page document, and no page two has been invented. Printed question numbers
that skip or repeat (Outpatient Q10 to Q14, Inpatient Q9 to Q10, "Page 4 of 3") are kept as printed
and annotated in the form notes.

### B38. Medication safety is a refusal, not a warning - **DECIDED**
A recorded allergy blocks a prescription outright: there is no override. A severe interaction
blocks until the prescriber records a clinical reason; the reason is stored with the prescription
and shown wherever it is read. Dispensing always takes the earliest expiry batch and writes a
negative movement to the stock ledger. Stock quantity is never edited directly; it changes only
through a receipt, a dispense or a reasoned adjustment.

### B39. Omaha care plans use an adapted subset - **DECIDED**
The care-plan structure follows the Omaha System references supplied (domains, problem categories,
Knowledge/Behaviour/Status rating scales, and the TGC/TP/CM/SUR intervention categories). The
problem list in `omaha.js` is a working subset, not the licensed full scheme, and the screen says so.
`careplan.approve` refuses an approval by the person who drafted the plan, and refuses a plan with an
unrated problem. Approval opens a 30-day PDCA record through the existing review engine rather than
a second one.

### B40. Homa Bay: Sofia is carried but marked unverified - **DECIDED**
The organogram shows Makongeni and Shauri Yako under Homa Bay Town. The earlier requirements name
Sofia. Sofia remains in the structure so no existing reference breaks, is flagged `unverified`, and
the organisation screen carries the warning. Adding or removing an area remains a configuration
change (A-series), not a code change.

---

## C. Open questions for LOMAMO

1. Confirm the twenty role templates and their reporting lines against the organogram.
2. Supply the verified Homa Bay ministry-area list.
3. Supply the transport-fare request form image so its exact fields can be reproduced.
4. Approve the orphan-prevention outcome definition.
5. Set October 2026 monthly targets for each county office.
6. Adopt (or amend) the Patient Confidentiality & Ethical Storytelling Policy — currently PROPOSED.
7. Confirm whether Hospital Liaison Persons should see county-wide or assignment-only work.
8. Confirm the retention schedule and the lawful basis for processing.
9. Confirm who holds `patient.export` in each county, and whether the Chief Administrator should ever
   hold it.
10. Confirm the deployment model: one office server, or one device per caregiver with office
    reconciliation. v4.1 implements the office-server model; the per-device model remains possible
    with the same file and a later sync service.
11. Confirm whether a dedicated Care Centre Manager post exists on the organogram (decision B29).
12. Confirm the small-group suppression threshold for condition reporting (decision B27).
13. Confirm the 60-second idle window after a one-week trial, and whether field staff need a longer
    window with device lock as the compensating control (decision B31).
14. Confirm whether Public Relations may see enquiry records that mention a patient, or whether such
    enquiries must be routed to the Medical Case Manager (decision B26 and section H7).
15. Confirm the retention period for internal messages, and whether HR may read a flagged message
    without the participant's knowledge (decision B32).

Each of these is a decision for LOMAMO, not for the software. The system is built so that the answer
is a configuration change, not a rewrite.
