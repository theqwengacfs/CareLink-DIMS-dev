# Monday meeting review

## Reporting periods

Select a **Meeting Monday**. The patient assessment and weekly paid-expenditure periods cover the preceding Monday through Sunday, using Africa/Nairobi calendar dates. The default is the current week's Monday. Month-to-date finances cover that Monday's calendar month from day one through the selected Monday, inclusive. When a week crosses a month boundary, weekly and monthly totals therefore cover different, explicitly labelled periods.

The reporting date selector selects the review date and the new provisional minutes record for that meeting Monday; it does not select an archived agenda or change current county agenda/sitting state. Agenda changes and escalation target the current county sitting. Concern statuses reflect the current register, not reconstructed historical statuses.

## Physical submissions and secretary progression

The county assistant may confirm an actual physical handover against a submitted assessment form or recorded hard-copy assessment and enter its real receipt date in the preceding Monday–Sunday. A digital form, assessment date or uploaded scan alone is not treated as proof of physical handover. The confirmation records the assistant and server time; this is an attestation, not independent proof that paper was delivered. Linked scans/forms are deduplicated, and a source can have only one receipt.

On or after the meeting Monday the assistant draws the order once. The hosted server shuffles ministry areas with cryptographic randomness and persists the order; within each area the system uses the precise recorded source entry timestamp oldest first, with missing timestamps last. It then marks one current assessment, and only the county assistant can mark that presentation discussed and advance. Each advance is version-checked, audit-logged and shared with accounts in patient scope. Restricted users see only their own scoped subset, not the complete county queue. A drawn list is locked: late paper receipts and amendments require an operational review outside this version. A draw is limited to 500 receipts. It is a randomized draw, not a guarantee of long-term fairness between areas. Local synthetic previews use a non-cryptographic demonstration shuffle.

The clinical-date reference list below remains separate: it does not imply a physical submission, and may differ from the confirmed-paper queue. This distinction also allows forms assessed earlier but physically submitted in the preceding week to be included in the confirmed-paper queue.

## Provisional meeting minutes

The county assistant can save meeting-specific provisional minutes to the shared server, with optimistic versions and retained prior versions; county MCM and county administrator accounts in the same county can read them. Word export is a branded DOCX of the saved minutes only; it does not present the current agenda as the historical agenda. Attendance is never filled in automatically. The prior device-only ledger is not migrated or deleted. The old template-notes control records only a filename and notes locally; it does not upload or merge the supplied file. The real organizational template must still be supplied and integrated.

## Clinical review

- Submitted/verified adult and minor assessment forms use their actual assessment dates; drafts and returned forms are not counted.
- Repeat/returning evaluation reports use evaluatedAt.
- Hard-copy assessment batches use assessment/visit dates. An explicit formRecordId avoids counting a linked scan batch again as a separate assessment form.
- Register-only legacy assessment/intake dates are labelled as legacy sources, and a same-patient/same-day register fallback is suppressed when assessment evidence already exists for that day.
- There is no sample-row limit. Separate assessment source records remain separate unless explicitly linked; multiple assessments are not automatically merged based on a name.
- Assessment records are grouped by ministry area. Area order is a deterministic pseudo-random ranking of county, meeting Monday and area ID, so the same area order is reproducible across refreshes and scoped subsets. It is not a random ballot or a fairness guarantee. Within each group records with an exact recorded entry timestamp appear oldest first; records without one follow, with the missing time labelled rather than invented. This is a presentation order, not a recorded secretary-led discussion or evidence that a discussion occurred.
- Hard copies without an actual assessment date are excluded from dated totals and flagged in the tab's data-quality message. Entry/upload dates are not passed off as dates of clinical assessment.
- Patient concerns include all raised in the review week plus older/undated concerns currently open. Closed older concerns and future-dated concerns are excluded.

All patient lists are obtained from the existing scoped repository. Existing non-clinical role restrictions remain. Concern escalation requires a scoped open patient concern, rejects a mismatched county and avoids duplicate proposals in the same current week. The shared proposal contains a neutral clinical-review request, not patient names, codes, diagnoses or concern narratives.

## Financial review

Requires finance.view, finance.reconcile or audit.view, plus existing repository geographic scope. Paid and reconciled KES transactions feed actuals. Commitments are separate; estimates/requests/void transactions are not paid expenses. Other-currency entries are excluded and counted rather than implicitly converted. Missing weekly receipt evidence is counted.

Monthly budget comparisons use only that month's budget lines, the latest effective version per line as of the selected Monday, excluding future-effective and draft/rejected/void lines. Annual/other-month budgets are not prorated or added to monthly ceilings. No matching monthly budget is shown as **Not set**, not zero allocation. Available balance is budget less paid actuals and commitments. Charts, line tables and transaction details use the same scoped source rows.

The review is computed from current synced data; editing the report date is not an immutable audit snapshot. Corrections, budget backdating and later reconciliation can change historical views.
