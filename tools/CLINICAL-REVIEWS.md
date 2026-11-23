# Repeat / returning assessments and revisioned PDCA

## Operational boundary

This implements assessment and clinical-report workflow, **not a production reset, migration, provider upgrade, medical-file upload service, or authorization to publish a release**. No production records are seeded or changed by the regression fixtures.

The supplied blank PDCA reference was inspected in ephemeral storage, then removed. The repository contains only implemented layout/field definitions, not the supplied PDF, page images or extracted reference text.

## One identity, separate support cycles

- **New / fresh:** no previous programme support. An assessment is not enrollment.
- **Repeat:** a new request on or before the 12-calendar-month anniversary of the last programme discharge.
- **Returning:** a new request after that anniversary.
- Anniversary dates are inclusive. A 29 February discharge has a 28 February anniversary in a non-leap year. For example, discharge `2024-02-29` → repeat through `2025-02-28`, returning from `2025-03-01`.
- Programme calendar days use **Africa/Nairobi (UTC+03)**. Bare dates are civil dates; evaluation instants require a timezone and retain their absolute timestamp. The anniversary changes at Kenyan midnight, not UTC midnight. Missing/invalid discharge history is flagged for review, not guessed.
- Exact normalized national-ID duplicates, including records outside the caller's visible scope, are refused by the server without revealing the hidden identity. Name/telephone matches only prompt human identity review. They never trigger an automatic merge, enrollment, or blanket assumption that two people are the same.

The caregiver/coordinator opens the existing discharged identity, confirms the person, records actual assessment time, new complaints **with durations**, comparison with prior history, and references **new hospital/medical documents**. The report goes to the active MCM account(s) for that patient's county. If no confirmed active county-MCM seat exists, the report visibly remains awaiting that account; no delivered notification is claimed and no staff identity is invented.

Final enrollment requires a scoped **MCM office decision**, source-document inspection, and an explicit initial plan/objective/interventions/duration/rationale. The server creates a new `careCycles` row while retaining the previous cycle, source records, prior PDCA/revisions and summary notes under the same patient ID. Old discharge state, baseline measures and cycle-specific costs/outcomes are not new-cycle findings. Allergy history and durable demographics are retained. A second active cycle is refused.

## PDCA preparation and review

Fixed milestone days (independent of configurable legacy cadence):

`30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360`

The scheduled due date is derived from that support cycle's MCM enrollment date. Actual evaluation **date and time** are recorded separately. An on-demand evaluation can be created at any home/clinical visit, with no scheduled milestone. Corrections retain the original evaluation time; a new evaluation requires a new on-demand report.

| Policy | Preparer | Required next steps |
| --- | --- | --- |
| Below 120 days | Caregiver or ministry-area coordinator | Submit → county MCM review/comments → schedule and/or mark for Beneficiary Archive. If corrections are requested, save and resubmit them first. |
| 120+ without confirmed foundation-supported hospitalization | Caregiver or ministry-area coordinator | Submit → MCM comments → **caregiver** re-edit/save → resubmit → MCM authorization → explicit sharing. |
| 120+ with foundation-supported hospitalization, including **past admissions / prior cycles** | MCM | The same MCM-comment → caregiver-correction → resubmission → authorization → sharing chain. |

A generic inpatient checkbox is not foundation-support provenance. The scoped MCM must attest inspection of the admission document and foundation-support reference. Admissions are attributed to their actual admission cycle where history permits; an unmatched old date is not assigned to the current cycle.

Drafts are reassessed at submission: a day-119 draft cannot evade day-120 preparation policy, and a future 120+ milestone is handled conservatively as a 120+ report. Submitted reports retain their policy day rather than changing simply because an archived evaluation is opened later. Newly discovered supported hospitalization requires MCM re-preparation before authorization; a newly ineligible earlier authorization cannot be shared. No automatic specialist concurrence is generated.

Every transition is attributed and timestamped. Immutable revisions retain exact field content once, plus their contemporaneous report metadata. Subsequent edits, master-record changes and new support cycles do not rewrite old reports.

## Supplied format and exports

The editable form covers patient/caregiver/household/demographic data; intake and evaluation anthropometry; SMART date, measurable outcome and functional/family goal; diagnoses and symptoms with durations; PLAN; DO; treatments **with indications**, procedures/reviews/counselling; CHECK (resolved/new symptoms, side effects/management, adherence/appointments, weight/BMI interpretation and action status); ACT and durations; continued-care justification, labs/status, recovery/monitoring, external treatment delays; and estimated discharge.

Missing values stay blank / “Not recorded”. No household children, diagnosis, BMI, treatment, adherence, outcome, target date or evaluation is manufactured from defaults. An author may explicitly record “not assessed” or “not applicable” where appropriate.

- HTML/print uses the reference's **three-page, two-column core**.
- Word downloads are actual `.docx` OOXML, with a matching three-page/two-column core, not HTML renamed `.doc`.
- Long clinical text is allowed to continue to additional pages rather than being clipped or shrunk to unreadability. Each editable PDCA field accepts up to 4,000 characters; an oversized draft/save is refused without creating a truncated or partial revision, and the original form stays open.
- Discharge mode adds a separate physical-signature acknowledgement appendix. Typed names and electronic decisions never assert physical signatures or patient consent.
- Revision-specific print/Word actions export the selected retained version.

## Sources are references, not uploaded scans

Hosted medical-file persistence/access controls are not commissioned in this change. The forms record **physical source references** (facility, document date and reference/location), followed by the MCM's attributed inspection. They never claim that a scan was uploaded, verified by software or stored digitally. Client-provided `fileStored` flags cannot establish evidence of stored bytes, and clinical commands refuse attachment claims. A protected document-storage service would be a separate implementation.

## Server and sync controls

`POST /api/care/command` is the authority for enrollment/discharge, cycles, referrals/evidence, admission provenance, PDCA versions and international sharing/advisories.

- Current account, private-password/session, approved-device, county/area scope and revocation controls still apply on every command and receipt retry.
- The existing `mcm.kisumu` two-county clinical exception is preserved, without finance/global privilege elevation. Coordinators gain only required scoped clinical reads.
- Chief's default role remains nonclinical; the existing audited target-account override lens and two-Chief-identity policy are unchanged. Chief is not silently substituted for a clinical preparer or office MCM.
- Generic `PUT /api/state` cannot forge protected collections, enrollment dates/status/plan, discharge approval, review completion, PDCA calendar appointments or international dossiers. Browser backup/import shortcuts do not replace hosted clinical history or authorizations. Even pre-activation reference imports refuse retained clinical history and cannot supply the new server-owned decision collections.
- International full/delta/fast/paged reads expose only exact MCM-authorized **and explicitly shared** dossiers, not raw patient history, unshared reviews or unrelated financial records.
- Commands use stable request IDs. Identical retries acknowledge the existing operation; conflicting reuse is refused. Receipt-only responses do **not** advance a client's read cursor: it must reconcile the missing saved state.
- Preflight saving and the command are serialized before the first await. Polling, full reads, replay and a second command cannot enter that gap. Per-row sync refusals remain unsaved rather than being acknowledged by an HTTP-200 response.
- Exact-row rebasing preserves unrelated dirty edits and held outboxes. Intervening remote revisions must still be polled. Storage failures/CAS conflicts do not acknowledge enrollment or sharing.

Historical caseload/enrollment/discharge figures now count retained support-cycle events rather than the patient's latest mutable intake/status. Last-visit / overdue checks exclude visits after the requested cutoff and inspect the cycle active at that cutoff. Paper verification is not enrollment, and verifying an older-cycle paper form does not overwrite the current cycle or invent missing discharge findings. New and legacy paper drafts bind their recorded source date at submission (including a corrected draft date), not the later submission/verification date; the form-entry controls refuse relinking a saved source to another patient/type or rewriting it after submission. Current-cycle visit/review counts exclude older-cycle completion.

A hosted browser timer is not a global service account: it cannot impersonate a Chief/system Monday scheduler or change Chief-owned settings in a caregiver session; a hosted scheduler is a separate server-owned capability. Reading AI defaults or rendering its dock is also nonmutating: missing display defaults must not dirty the shared settings row and block an unrelated clinical preflight. Explicit dock configuration remains a Chief-owned, audited action; the server still refuses unauthorized configuration writes.

Clinical revision history increases storage requirements. This change does not clear provider quota restrictions, delete old records, purchase capacity, or authorize a storage migration. If the provider refuses a save, the form must remain visibly unconfirmed.

## Verification

```sh
npm run test:clinical
node tools/sync-lovable.mjs
python3 v6/build.py
npm run test:all
npm run build
npm run privacy:repository
```

The focused suite includes synthetic anniversary/midnight/rollover, authorization, concurrency/CAS/failure, replay/outbox, source honesty, backup parent integrity and OOXML/view assertions. The existing v64/v66 acceptance assertions now distinguish the supplied editable clinical format from superseded fabricated merge values/direct-sharing behavior.

Optional actual-browser test (no production network):

```sh
npm install --no-save --package-lock=false playwright-core @sparticuz/chromium
node v6/test/clinical-browser.mjs
```

Alternatively supply `CHROMIUM_PATH`. Minimal Linux containers may need the bundled Chromium runtime libraries/font configuration; these are ephemeral environment dependencies, not repository assets. Browser screenshots, `.docx` and PDFs are written under `/tmp/carelink-clinical-browser` by default and contain only synthetic fixtures.

**Privacy limitation:** repository-only scans and synthetic tests are not full patient-identity certification. That remains blocked without the authorized identity workbook. No supplied sensitive reference or generated test artifact belongs in Git.
