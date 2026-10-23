# Master Workbook Import — Reconciliation Report

**Organisation:** LOMAMO Foundation Kenya  
**Source workbook:** `LOMAMO-Master-Patient-Workbook-TEMPLATE.xlsx` (12,928 bytes)  
**SHA-256:** `2c5dc48776aa52dcdee60cba88dae3329160379823bee8461c567c7c63198a82`  
**Generated:** 2026-10-18T17:31:58  
**Engine:** offline import engine v1.0.0  
**Classification:** Confidential patient-related

---

## 1. Summary

| Measure | Count |
|---|---:|
| Patient rows detected | 3 |
| Visit rows detected | 4 |
| Referral rows detected | 2 |
| Records clean | 3 |
| Records requiring review | 0 |
| Duplicate / conflict flags | 0 |
| Errors | 0 |
| Warnings | 0 |
| Unmapped columns | 4 |

## 2. Worksheets

| Worksheet | Classified as | Rows | Columns | Mapped | Unmapped | Formula cells |
|---|---|---:|---:|---:|---:|---:|
| Patient Register | register | 3 | 19 | 19 | 0 | 0 |
| Home Visits | visits | 4 | 9 | 9 | 0 | 0 |
| Hospital Referrals | referrals | 2 | 10 | 10 | 0 | 0 |
| Field Dictionary | documentation | 0 | 4 | 0 | 4 | 0 |

## 3. Column mapping

### Patient Register

| DIMS field | Source column |
|---|---|
| `children` | Household Children |
| `orphans` | Orphans Supported |
| `status` | Programme Status |
| `discharge_reason` | Discharge Reason |
| `referral` | Referral Source |
| `discharge` | Discharge Date |
| `area` | Ministry Area |
| `phone` | Phone Number |
| `name` | Patient Name |
| `intake` | Intake Date |
| `code` | File Number |
| `diagnosis` | Diagnosis |
| `ccc` | CCC Number |
| `caregiver` | Caregiver |
| `weight` | Weight (kg) |
| `height` | Height (cm) |
| `guardian` | Guardian |
| `sex` | Sex |
| `age` | Age |

### Home Visits

| DIMS field | Source column |
|---|---|
| `bp` | Blood Pressure |
| `next_due` | Next Visit Due |
| `name` | Patient Name |
| `code` | File Number |
| `visit_type` | Visit Type |
| `visit_date` | Visit Date |
| `weight` | Weight (kg) |
| `outcome` | Outcome |
| `notes` | Notes |

### Hospital Referrals

| DIMS field | Source column |
|---|---|
| `transport_required` | Transport Required |
| `reason` | Reason for Referral |
| `request_date` | Request Date |
| `name` | Patient Name |
| `code` | File Number |
| `referral` | Facility |
| `priority` | Priority |
| `status` | Status |
| `notes` | Notes |
| `fare` | Estimated Fare (KES) |

### Field Dictionary

_No columns mapped._

**Unmapped source columns (preserved in the original, not imported):** `Column`, `Required`, `Definition`, `Example`

## 4. Issues requiring attention

No validation issues were detected.

## 5. Duplicate and conflict analysis

No duplicate identifiers were found within the workbook or against the existing database.

## 6. Transformations applied

- Dates normalised to ISO `YYYY-MM-DD`; Excel serial dates converted using the 1900 date system.
- Sex values reduced to `F`/`M`; unrecognised values left blank for review.
- Programme status mapped onto DIMS states (`active`, `digital_entered`, `awaiting_verification`, `discharged`). A discharge date overrides a conflicting status.
- Ministry areas resolved against the configured area list; unresolved areas are errors, not guesses.
- Numeric fields stripped of currency symbols and thousands separators where unambiguous.
- Unmapped columns are **not** imported. They remain in the original workbook and are listed above.

## 7. Data protection and integrity

- The source workbook was opened read-only and has not been modified.
- No network request was made by this engine; no patient data left the device.
- The staged package contains patient identifiers and must be handled as **Confidential patient-related** information.
- Committing the import in the DIMS creates a verified pre-import backup, preserves the source file, and writes an audit entry recording the operator, timestamp, SHA-256 and outcome.

---

_Prepared by CareLink DIMS offline import engine v1.0.0. This report is evidence of processing, not authorisation to import._
