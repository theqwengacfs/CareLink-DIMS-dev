# 03 · Data model

One JSON document holds the installation. Every entity below is a collection inside `DB.db`.
`schema: 5` is stamped on the document; migrations are additive. Schema 5 adds structured
conditions, care plans, scheduled care-plan reviews, the care centre, delegation and the central
database revision stamp.

## 1. Entity map

```
COUNTIES ──< AREAS ──< PATIENTS >── USERS (caregiver)
                          │
        ┌─────────────────┼──────────────────┬───────────────┬──────────────┐
        ▼                 ▼                  ▼               ▼              ▼
     VISITS             PDCAS           HOSPITAL_REQUESTS  DOCUMENTS   SUPPORT_ISSUES
                                            │
                                            ├──< TRANSACTIONS >── BUDGETS
                                            └──< ENCOUNTERS

USERS >── ROLES (template) ──< CAPABILITIES
  │
  └──< ACCOUNT_REQUESTS     EMPLOYEES >── LEAVE_REQUESTS
                                       └── WELFARE_CONTRIBUTIONS >── WELFARE_ACTIVITIES

VEHICLES >── TRIPS          REFERRAL_ENTITIES >── PATIENTS
AUDIT (append-only, hash-chained)   REPORTS (versioned)   APPROVALS (dual control)

PATIENTS >── PATIENT_CONDITIONS (structured, status-bearing, sensitive flag)
        >── CARE_PLANS (on the patient record: need, objective, expected duration, rationale)
        >── PDCAS.kind = 'review' (one row per 30-day slot, due date preserved)
        >── PDCAS.kind = 'extension' (documented review beyond the programme maximum)

CARE_BEDS >── CARE_RESIDENTS >── PATIENTS
                          └──< CARE_LOGS (shift handover)   CARE_INCIDENTS (restricted)

USERS >── DELEGATIONS (from, to, capabilities, window, status)
```

## 1a. Central database

When the application is served by `server.py`, the same document is stored in
`data/carelink.db` on the host computer as a single SQLite row, with:

| Table | Purpose |
|---|---|
| `state` | the current document, its revision, the committing device and a SHA-256 |
| `snapshots` | one row per superseded revision, with the gzipped copy in `data/revisions/` |
| `ops` | client operation identifiers, so a retried save cannot create a duplicate revision |
| `audit` | the server's own append-only hash chain of commits, conflicts and resolutions |

Every accepted change increments `rev`. A device must present the revision it last read; a stale
save is refused rather than applied.

## 2. Patient

| Field | Type | Notes |
|---|---|---|
| `id` | string | Internal identifier |
| `code` | string | Human file number, e.g. `LOM-NYA-1042` |
| `name` | string | **Personal data — never exported to public reports** |
| `sex`, `age` | string, number | |
| `countyId`, `areaId` | string | Drives geographic scoping |
| `caregiverId` | string | Assigned field officer |
| `status` | enum | See workflow below |
| `intake` | ISO date | Assessment / enrolment date — basis of Patient-Days |
| `discharge` | ISO date | Set only when a discharge is approved |
| `enrolDate` | ISO date | Set when enrolment is executed |
| `referralEntityId` | string | FK to the verified referral register |
| `ccc` | string | Clinic identifier — strongest duplicate key |
| `phone` | string | Personal data |
| `clinical` | object | `diagnosis`, `art`, `weightKg`, `heightCm`, `adherence` — **clinical authority required** |
| `household` | object | `children`, `orphansSupported`, `guardian` |
| `consent` | object | `status`, `scope`, `date`, `note` — governs publication |
| `faithRecord` | string | Restricted field; excluded from reports; not a staff target |
| `flags` | array | `duplicate_check_pending`, `imported`, … |
| `docsVerified` | boolean | Source documents checked against the physical form |

**Patient states:** `assessment_initiated` → `form_submitted` → `digital_entered` →
`awaiting_verification` → `approved_enrolment` → `active` → `discharge_recommended` → `discharged`.
Branches: `returned` (correction loop), `rejected` (with reason). `extension` records a documented
extension of active enrolment beyond 120 days.

## 3. Hospital request

| Field | Notes |
|---|---|
| `no` | e.g. `HR-2026-1042` |
| `patientId`, `countyId`, `areaId` | Scoping and join keys |
| `requestedBy`, `submittedAt` | Originating caregiver |
| `reason`, `priority`, `facility`, `preferredDate` | Clinical request |
| `transport` | `{ required, fare, persons, journey, escort, approved }` |
| `status` | draft → submitted → approved → assigned → completed → reconciled → closed (or returned / rejected) |
| `decision` | `{ by, at, note \| reason }` — every decision is attributed and timestamped |
| `assignedTo`, `assignedAt` | Hospital Liaison Person |
| `serviceCompletedAt`, `clinicalReport`, `expenses` | Evidence of service |
| `reconciledBy`, `reconciledAt` | Financial closure |

**Approval ≠ payment.** `decision.by` (clinical) and `transactions` (financial) are separate records
with separate actors. No single action both authorises care and releases money.

## 4. Transaction

`id, no, patientId, requestId, countyId, category, amount, currency, date, payer, payee, ref,
budgetLine, receipt, enteredBy, reviewedBy, status, flags, note`

Status: `committed` → `paid` → `reconciled`. A `committed` amount reduces available budget but is
not a payment. `receipt:false` blocks reconciliation unless a documented exception is recorded.

## 5. Budget line

`id, countyId, line, amount, period (YYYY-MM), version, effectiveFrom, setBy`

Budget changes are **new versions**, never edits. A report generated under v1 keeps v1 as its basis.
Categories: food, staff transport, patient transport, medication, outpatient, SHIF/SHA, fuel,
maintenance, other.

## 6. Documents (media)

| Field | Notes |
|---|---|
| `kind` | assessment form, CCC card, hospital record, lab result, wound photo, story photo |
| `classification` | clinical · identification · hospital · internal photo · story material · restricted |
| `uploadedBy`, `uploadedAt` | Provenance |
| `consent` | Consent state captured at upload |
| `publication` | not eligible · pending review · approved · rejected |
| `restricted` | Blocks access outside clinical authority |

A clinical attachment is not a media asset. Classification determines who may open it and whether it
can ever be published.

## 7. Audit entry

`seq, ts, actor, action, entity, entityId, detail, before, after, reason, meta, prevHash, hash`

`hash = fnv1a(seq|ts|actor|action|entity|entityId|detail|prevHash)`.

The chain is verified by recomputing every entry. Deleting, inserting or editing an entry breaks the
chain at that point and the break is detectable by any reviewer. Entries are never updated in place
and there is no delete operation in the codebase.

## 8. Report

`id, type, title, countyId, periodKey, params, generatedAt, generatedBy, generatedByName, version,
scheduled, classification, checksum`

Regeneration creates `version + 1` for the same period. The earlier version is retained, so a
management meeting can always be shown the report that was actually issued.

## 9. Approval (dual control)

`id, type, requestedBy, requestedAt, context, required: 2, approvals[{userId, at}], status`

Rules: the requester cannot approve their own request; the same approver cannot sign twice; the
operation executes only when `approvals.length >= required`.

## 9b. Collections added in v5.0

| Collection | Shape | Notes |
|---|---|---|
| `formRecords` | `{id, kind, code, title, patientId, countyId, areaId, status, visitDate, data{}, enteredBy, submittedAt, verifiedBy, verifiedAt, returnReason, version}` | One record per form, patient and visit date. `data` holds the printed fields exactly as the paper asks them. |
| `clinicalRx` | `{id, no, patientId, countyId, areaId, lines[{itemId, dose, route, frequency, days, qty}], reason, alerts[], overrideReason, status, dispensed[], allDispensed, prescribedBy, dispensedBy}` | `no` is `RX-YYYY-nnnn`. `status` is prescribed, partially dispensed, dispensed or cancelled. |
| `stockLots` | `{id, countyId, itemId, batch, expiry, qty, receivedAt, receivedBy, supplier, unitCost}` | Quantity changes only through the ledger. |
| `stockMoves` | `{id, countyId, itemId, lotId, batch, qty, kind, at, by, rxId, note}` | `qty` is signed: positive receipt, negative dispense or adjustment. |
| `omahaPlans` | `{id, patientId, countyId, areaId, title, templateId, status, version, problems[{code, rating{k,b,s}, ratings[], note}], interventions[{problemCode, category, target, detail, frequency, responsible}], createdBy, approvedBy}` | Problems and interventions follow the Omaha structure. |
| `scheduleDrafts` | `{id, userId, countyId, weekStart, status, maxPerDay, days[{date, stops[]}], unscheduled[], capacity, demand}` | A draft has no calendar effect until accepted. |
| `leaveCover` | `{id, date, siteId, forEmployeeId, coveredBy, leaveId, kind, role, at, by}` | Written at approval, removed if the leave is cancelled. |
| `personalPrefs` | `{[userId]: {dashboard: {order[], hidden[]}}}` | Personal arrangement only. It cannot add a module the role cannot already use. |
| `publicFeed` | `{at, items[]}` | Cached response from `/api/public/content`, valid for ten minutes, used only by the public portal. |
| `documents[].fileId` | `{fileStored, fileId, fileName, fileBytes, fileSha, retention}` | The bytes live in SQLite on the host, never in the JSON document. |

Employee records gain `staffType` (permanent or casual), `staffGroup`, `leaveGroup`
(`field`, `hospital`, `office`), `canLeaveMonday` and a start date used for proration.

## 10. Data classification

| Level | Examples | Handling |
|---|---|---|
| Public | Programme descriptions, aggregate outputs with no identifiers | Shareable |
| Donor-facing (approved) | Redacted aggregate reports | Requires publication approval |
| Internal organisational | Operational reports, staff directory | Staff with a need |
| Restricted departmental | Finance, HR, welfare, audit findings | Capability + county scope |
| Confidential patient-related | Patient registers, referral document, media assets | Clinical or explicit authority |
| Highly restricted | Clinical detail, identification images, consent records | Clinical authority; every access audited |

## 11. Retention (proposed — requires adoption)

| Record | Indicative retention | Basis |
|---|---|---|
| Patient clinical record | 7 years after last contact | Continuity of care |
| Financial transactions | 7 years | Statutory audit |
| Audit trail | Permanent | Accountability |
| Patient photographs | Duration of consent + 12 months, then review | Consent scope |
| Application / assessment forms | 7 years | Evidence of enrolment |
| Welfare contribution records | 5 years | Employment records |

These periods are **proposals** and must be confirmed by leadership and legal advice before being
enforced by the retention job.
