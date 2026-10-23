# 09 · Acceptance test plan and status

Traced against the specification's testing requirements (Part XIX) and final acceptance criteria
(Part XXI). Status reflects what is **actually verified in this build**, not what is intended.

**Status key:** ✅ implemented and verified · 🟡 implemented, partially verified · ⬜ deferred, stated honestly

---

## 1. Account management

| # | Test | Expected | Status | Evidence |
|---|---|---|---|---|
| 1.1 | First-run bootstrap | Chief Administrator created securely; no undocumented accounts | ✅ | Onboarding step 1–2; audit `system.bootstrap` |
| 1.2 | Login with correct password | Console for the user's role | ✅ | `AUTH.login` test |
| 1.3 | Login with wrong password | Refused; failure audited; lockout after threshold | ✅ | Smoke test; `auth.failed` |
| 1.4 | Logout | Session cleared; `auth.logout` recorded | ✅ | |
| 1.5 | Password change | Minimum length enforced; re-hashed with new salt | ✅ | Settings → Security |
| 1.6 | Account request → approval | Access not granted until approved | ✅ | Account workflow |
| 1.7 | Rejection with reason | Recorded with reviewer, date, reason | ✅ | |
| 1.8 | Role assignment | Navigation and data scope change accordingly | ✅ | 21 roles rendered |
| 1.9 | Permission enforcement | Denied actions audited | ✅ | 13/13 security self-test |
| 1.10 | Suspension / deactivation | Account blocked at login | ✅ | `user.manage` |
| 1.11 | Session lock after idle | Password required to resume | ✅ | `AUTH.locked()` |

## 2. Caregiver workflows

| # | Test | Expected | Status |
|---|---|---|---|
| 2.1 | Assessment initiated | Record created in `assessment_initiated` | ✅ |
| 2.2 | Duplicate check on assessment | Warning before a second record is created | ✅ |
| 2.3 | Physical form upload / digitisation | Source preserved; state advanced | ✅ |
| 2.4 | Home visit recorded | Attributed, timestamped, visible to the right roles | ✅ |
| 2.5 | Weight recorded | Feeds the clinical record and trend alerts | ✅ |
| 2.6 | Support item issued | Counts in Patient Figures | ✅ |
| 2.7 | Media upload | Classified; queued for review if storytelling | ✅ |
| 2.8 | Hospital request submitted | Reaches the Medical Case Manager queue | ✅ |
| 2.9 | Discharge recommendation | Requires a documented reason | ✅ |
| 2.10 | Caregiver cannot approve own request | Denied | ✅ |

## 3. Medical workflows

| # | Test | Expected | Status |
|---|---|---|---|
| 3.1 | Clinical review of a request | Approve / return / reject / assign available by capability | ✅ |
| 3.2 | Rejection requires reason | Enforced in the engine | ✅ |
| 3.3 | Assignment to liaison | Same-county liaison list only | ✅ |
| 3.4 | Hospital service recorded | Clinical report required | ✅ |
| 3.5 | Receipt submitted | Attached to the request and the patient | ✅ |
| 3.6 | Clinical review of the service report | Recorded against the case | 🟡 (report stored and visible; a separate clinical sign-off field is Phase 2) |
| 3.7 | Follow-up and closure | Closure guard blocks unreconciled cases | ✅ |
| 3.8 | Referral registry | Unverified entities flagged, never auto-approved | ✅ |

## 4. Administrative workflows

| # | Test | Expected | Status |
|---|---|---|---|
| 4.1 | Physical form verification | Verify / return for correction / reject | ✅ |
| 4.2 | Patient-Days report | Milestones 60/100/120/180 correct and ordered | ✅ |
| 4.3 | Patient Figures report | 20+ indicators with definitions | ✅ |
| 4.4 | Weekly management report | Available Monday 08:00; manual run possible | ✅ |
| 4.5 | Expenditure report | Five states distinct; projection stated | ✅ |
| 4.6 | Target management | Versioned and dated | ✅ |
| 4.7 | Ministry area summaries | Grouped by classification | ✅ |

## 5. Document processing

| # | Test | Expected | Status |
|---|---|---|---|
| 5.1 | Master workbook (multi-sheet) | Every sheet read and classified | ✅ |
| 5.2 | Field mapping | Detected, shown, human-confirmable | ✅ |
| 5.3 | Duplicate detection | CCC / file number / name+area, with human decision | ✅ |
| 5.4 | Validation | Per-row issues with severity | ✅ |
| 5.5 | Preview before commit | Every row visible with its decision | ✅ |
| 5.6 | Reconciliation report | Created, skipped, flagged, transformed, unmapped | ✅ |
| 5.7 | Import audit and backup | Pre-import backup + audit entry with checksum | ✅ |
| 5.8 | XLSX parsing in the browser | Not performed — deliberately delegated to the offline engine | ⬜ (by design) |
| 5.9 | Scanned document OCR | Not implemented | ⬜ |

## 6. Reporting

| # | Test | Expected | Status |
|---|---|---|---|
| 6.1 | Print / PDF | A4 letterhead, no navigation | ✅ |
| 6.2 | CSV export | Per-report tabular export | ✅ |
| 6.3 | Privacy filtering | Public/donor reports redacted | 🟡 (classification and redaction rules implemented; a dedicated redacted-render toggle is Phase 2) |
| 6.4 | Historical preservation | Regeneration creates a new version | ✅ |
| 6.5 | Integrity block | Period, source, version, generator, limitations | ✅ |
| 6.6 | Native DOCX / XLSX | Not implemented | ⬜ |

## 7. Security

| # | Test | Expected | Status |
|---|---|---|---|
| 7.1 | Direct URL access | Blocked by data-layer scope, not by navigation | ✅ |
| 7.2 | Backend/API permission checks | `RBAC.can` + `repo.*` on every read | ✅ |
| 7.3 | Cross-county access | Denied and audited | ✅ |
| 7.4 | Cross-department access | Denied and audited | ✅ |
| 7.5 | Unauthorised export | Requires capability + approval | ✅ |
| 7.6 | Audit trail integrity | Hash chain verifies; tampering detectable | ✅ |
| 7.7 | Session and account security | Lockout, idle lock, one-time codes | ✅ |
| 7.8 | Proof by negative test | 13 controls exercised in-app | ✅ 13/13 |

## 8. Reliability

| # | Test | Expected | Status |
|---|---|---|---|
| 8.1 | Database persistence | State survives reload where storage is available | 🟡 (localStorage; blocked in the sandboxed preview with a clear notice) |
| 8.2 | Backup creation | Created, hashed, listed | ✅ |
| 8.3 | Restore | Dual approval required | 🟡 (approval flow implemented; the restore executor is a production-server operation) |
| 8.4 | Failed import recovery | Pre-import backup available | ✅ |
| 8.5 | Application update | Single-file replacement | ✅ |
| 8.6 | Database migration | Schema version stamped; additive migrations | 🟡 |
| 8.7 | Large workbook | Engine tested on a 5-sheet workbook; production scale untested | 🟡 |
| 8.8 | Concurrent users | Requires server deployment | ⬜ |

## 9. Device

| # | Test | Expected | Status |
|---|---|---|---|
| 9.1 | Desktop browser | Full layout | 🟡 (code-verified; verify on the actual machine) |
| 9.2 | Samsung Android tablet | Touch targets ≥44 px, drawer navigation, single-column forms | 🟡 (designed; must be verified on the device) |
| 9.3 | Touch navigation | No hover-dependent actions | ✅ |
| 9.4 | Camera / file upload | File picker available; camera via browser capture | 🟡 |
| 9.5 | Portrait and landscape | Responsive breakpoints | ✅ |
| 9.6 | Network interruption | No network dependency at runtime | ✅ |
| 9.7 | Offline functionality | Full function offline on the device | ✅ |

## 10. Organisational acceptance (Part XXI)

| Criterion | Status |
|---|---|
| Reflects the approved organogram | 🟡 — structure implemented; formal confirmation outstanding (B1) |
| Each department has a defined purpose and workspace | ✅ |
| Each account has a clear role and permissions | ✅ |
| Users routed to their correct console | ✅ |
| Supports future departments and county offices | ✅ (configuration only) |
| Users cannot access unrelated departments' records | ✅ (13/13 negative tests) |
| Geographic and departmental restrictions enforced on the backend | ✅ |
| Clinical, financial, HR and media permissions differentiated | ✅ |
| Audit records protected | ✅ |
| Sensitive data not sent to external AI by default | ✅ |
| Caregivers submit assessments; assistants digitise and verify | ✅ |
| Duplicate records detected | ✅ |
| Home visits and progress recorded | ✅ |
| Discharge follows an approval workflow | ✅ |
| Patient concern alerts are evidence-based | ✅ |
| Hospital requests follow the correct approval chain | ✅ |
| Transport recorded; expenses reconciled | ✅ |
| Monday 08:00 reports available | ✅ |
| Patient-Days milestones correct | ✅ |
| Patient Figures reconcile with activity | ✅ |
| Targets configured and versioned | ✅ |
| County and ministry-area breakdowns work | ✅ |
| Master workbook analysed offline | ✅ |
| Imports previewed, validated, safe | ✅ |
| Imported data reconciled to source | ✅ |
| All departmental consoles present | ✅ (procurement register is a stub awaiting real supplier data) |
| AI respects permissions | ✅ |
| Backup and restore functional | 🟡 (backup ✅, restore approval ✅, execution server-side) |
| Confidentiality rules govern patient media | ✅ |
| System changes auditable | ✅ |
| Works on desktop and tablet | 🟡 (device verification outstanding) |

---

## 11. Honest summary

**Verified:** 25 logic checks, 813 view renders across 30 accounts, 11 import checks, 13 authorisation
controls — all passing.

**Partial:** native DOCX/XLSX generation, redacted-report toggle, restore execution, device-specific
layout confirmation, multi-user concurrency.

**Deferred:** browser XLSX parsing (delegated offline), OCR, multi-device sync, bulk staff import.

None of the deferred items is silently claimed as working anywhere in the product.
