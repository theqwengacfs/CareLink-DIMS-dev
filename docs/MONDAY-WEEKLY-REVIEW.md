# Monday meeting review

## Reporting periods

Select a **Meeting Monday**. The patient assessment and weekly paid-expenditure periods cover the preceding Monday through Sunday, using Africa/Nairobi calendar dates. The default is the current week's Monday. Month-to-date finances cover that Monday's calendar month from day one through the selected Monday, inclusive. When a week crosses a month boundary, weekly and monthly totals therefore cover different, explicitly labelled periods.

The reporting date selector does not select an archived meeting or change county agenda/minutes/sitting state. Agenda changes and escalation target the current county sitting. Concern statuses reflect the current register, not reconstructed historical statuses.

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
