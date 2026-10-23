# 02 · Role-Based Access Control Matrix

> Generated from `src/data.js`, `src/data6.js`, `src/core.js`, `src/access_rules.js`, `src/org_teams.js`, `src/costing.js`, `src/tb_dispensing.js` and `src/master_registry.js` by `tools/gen_rbac.py`. Do not edit by hand — regenerate after changing role templates or authority rules.

## 1. The eight authorities

Access is never a single flag. Every decision combines:

| Authority | Question it answers | Enforced by |
|---|---|---|
| Organisational | What may this position oversee or approve? | `role.scope.geo` |
| Departmental | Which department's records may be used? | `role.scope.records = 'department'` |
| Geographic | Which county and ministry areas? | `role.scope.geo`, `countyId`, `areaIds` |
| Clinical | Which patient-care functions and clinical fields? | `patient.view.clinical`, clinical caps |
| Financial | Which budgets, payments and approvals? | `finance.*` |
| Administrative | Which accounts, roles and settings? | `user.*`, `role.manage`, `system.config` |
| Audit | Which records may be inspected and reported? | `audit.view`, `system.audit` (read-only) |
| Information governance | What may be collected, disclosed or published? | `media.*`, governance rules g1–g8 |
| Workflow | Which requests may be initiated, reviewed, approved, closed? | transition capabilities |

## 2. Enforcement path

```
UI request
   → contentFor() guard               (usability: shows an access-denied panel)
   → RBAC.can(user, capability, ctx)  (authorisation: capability + county + area + assignment + department)
   → repo.*()                         (data layer: rows filtered before they are returned)
   → AUDIT.append(access.denied)      (evidence: every refusal is recorded)
```
The interface never receives a row the user is not entitled to see. Hiding a navigation item is a convenience, not the control.

## 3. Role summary

| Role | Department | Geographic scope | Record scope | Capabilities |
|---|---|---|---|---:|
| **Chief System Administrator** | Administration | Organisation | global | 36 |
| **President** | Executive Leadership | Organisation | global | 15 |
| **Country Director** | Executive Leadership | Organisation | global | 33 |
| **County Office Administrator** | Administration | Own county | county | 64 |
| **Administrative Assistant** | Administration | Own county | county | 26 |
| **Ministry Area Coordinator** | Ministry & Field Programmes | Assigned areas | areas | 28 |
| **Supporting Caregiver** | Ministry & Field Programmes | Assigned areas | areas | 27 |
| **Approved Community Health Worker** | Ministry & Field Programmes | Assigned areas | areas | 16 |
| **Medical Case Manager** | Medical & Clinical Services | Own county | county | 56 |
| **Hospital Focal Person** | Medical & Clinical Services | Own county | assigned | 20 |
| **Nurse / Clinical Officer** | Medical & Clinical Services | Own county | county | 38 |
| **Media & Information Governance Head** | Media & Information Governance | Organisation | global | 20 |
| **Finance Officer** | Finance | Own county | county | 23 |
| **Procurement Officer** | Procurement | Own county | county | 16 |
| **M&E / Data Officer** | Data Management & M&E | Own county | county | 20 |
| **Auditor** | Audit | Organisation | global · read-only | 20 |
| **Human Resource Officer** | Human Resources | Organisation | department | 20 |
| **Staff Welfare Officer** | Staff Welfare | Organisation | department | 10 |
| **Vehicle & Transport Officer** | Vehicle & Transport | Own county | county | 11 |
| **Public Relations Officer** | Public Relations & Communications | Organisation | global | 10 |
| **Department Head** | Medical & Clinical Services | Own county | county | 25 |
| **Chief Program Administrator** | Executive Leadership | Organisation | global | 41 |
| **Chief Program Administrator Assistant** | Executive Leadership | Organisation | global | 21 |
| **ICT & Technical Officer** | ICT & Technical Services | Organisation | global | 15 |
| **Homestay & Care Centre Coordinator** | homestay | Own county | county | 18 |
| **International Data Officer** | International Data & Verification | Organisation | global | 17 |

## 4. Coverage by capability group

| Role | Access & identity | System | Patients | Clinical | Care centre | Field & care | Pharmacy | Hospital | Finance | People | Media & governance | Audit | Transport | Reporting | Comms | Assistant | Department library | Recognition | Executive | Assets | Students & research | Occupational safety | Data & indicators |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Chief System Administrator | 7/7 | 8/9 | 5/16 | 1/9 | — | — | 2/9 | — | 2/13 | 2/8 | — | — | — | 3/11 | 1/3 | 1/1 | — | — | — | 2/2 | — | — | 2/2 |
| President | — | 1/9 | 1/16 | — | — | — | — | — | 3/13 | 2/8 | — | — | — | 4/11 | 1/3 | 1/1 | — | 1/2 | 1/2 | — | — | — | — |
| Country Director | 1/7 | — | 3/16 | 2/9 | 1/4 | — | 2/9 | — | 5/13 | 4/8 | — | 1/2 | — | 7/11 | 1/3 | 1/1 | — | 2/2 | 2/2 | — | — | — | 1/2 |
| County Office Administrator | 4/7 | 1/9 | 12/16 | 2/9 | 2/4 | — | 4/9 | 4/7 | 11/13 | 5/8 | — | 1/2 | 1/3 | 8/11 | 1/3 | 1/1 | — | — | — | 2/2 | 2/2 | 2/2 | 1/2 |
| Administrative Assistant | — | — | 11/16 | 3/9 | 2/4 | — | — | 1/7 | 1/13 | 1/8 | — | — | — | 3/11 | 1/3 | 1/1 | — | — | — | 1/2 | — | — | 1/2 |
| Ministry Area Coordinator | 2/7 | 1/9 | 6/16 | 2/9 | 1/4 | 3/6 | 3/9 | 1/7 | 1/13 | 1/8 | — | — | — | 4/11 | 1/3 | 1/1 | — | 1/2 | — | — | — | — | — |
| Supporting Caregiver | — | 1/9 | 7/16 | 3/9 | 2/4 | 5/6 | 2/9 | 1/7 | 1/13 | 1/8 | — | — | — | 1/11 | 1/3 | 1/1 | — | 1/2 | — | — | — | — | — |
| Approved Community Health Worker | — | 1/9 | 4/16 | — | — | 4/6 | 2/9 | — | 1/13 | 1/8 | — | — | — | — | 1/3 | 1/1 | — | 1/2 | — | — | — | — | — |
| Medical Case Manager | 2/7 | — | 11/16 | 9/9 | 4/4 | 4/6 | 8/9 | 5/7 | 1/13 | 1/8 | 1/6 | — | — | 4/11 | 1/3 | 1/1 | 1/3 | — | — | — | 2/2 | — | 1/2 |
| Hospital Focal Person | — | — | 5/16 | 1/9 | 1/4 | 1/6 | 4/9 | 2/7 | 1/13 | 1/8 | — | — | — | 1/11 | 1/3 | 1/1 | — | 1/2 | — | — | — | — | — |
| Nurse / Clinical Officer | — | — | 7/16 | 8/9 | 3/4 | 5/6 | 8/9 | — | 1/13 | 1/8 | — | — | — | 1/11 | 1/3 | 1/1 | 1/3 | 1/2 | — | — | — | — | — |
| Media & Information Governance Head | — | 2/9 | 2/16 | — | — | — | — | — | — | 1/8 | 6/6 | — | — | 2/11 | 1/3 | 1/1 | 3/3 | — | — | 2/2 | — | — | — |
| Finance Officer | — | — | 1/16 | — | — | — | 3/9 | 1/7 | 11/13 | 1/8 | — | — | — | 3/11 | 1/3 | 1/1 | — | 1/2 | — | — | — | — | — |
| Procurement Officer | — | — | — | — | — | — | 3/9 | — | 6/13 | 1/8 | — | — | — | 2/11 | 1/3 | 1/1 | — | — | — | 2/2 | — | — | — |
| M&E / Data Officer | — | — | 4/16 | 2/9 | — | — | — | — | 2/13 | 1/8 | — | 1/2 | — | 5/11 | 1/3 | 1/1 | 1/3 | — | — | — | — | — | 2/2 |
| Auditor | — | 1/9 | 2/16 | 1/9 | — | — | 2/9 | — | 4/13 | 2/8 | — | 2/2 | — | 3/11 | 1/3 | 1/1 | — | — | — | — | — | — | 1/2 |
| Human Resource Officer | 2/7 | — | — | — | 1/4 | — | — | — | — | 7/8 | — | — | — | 2/11 | 1/3 | 1/1 | — | 2/2 | — | — | 2/2 | 2/2 | — |
| Staff Welfare Officer | — | — | — | — | — | — | — | — | — | 4/8 | — | — | — | 1/11 | 1/3 | 1/1 | — | 1/2 | — | — | — | 2/2 | — |
| Vehicle & Transport Officer | — | 1/9 | — | — | — | — | — | — | 1/13 | 1/8 | — | — | 3/3 | 2/11 | 1/3 | 1/1 | — | — | — | 1/2 | — | — | — |
| Public Relations Officer | — | — | — | — | — | — | — | — | — | 1/8 | 1/6 | — | — | 2/11 | 3/3 | 1/1 | 2/3 | — | — | — | — | — | — |
| Department Head | 2/7 | — | 3/16 | 3/9 | 1/4 | — | 3/9 | — | 1/13 | 3/8 | — | — | — | 4/11 | 1/3 | 1/1 | 1/3 | 1/2 | — | — | 1/2 | — | — |
| Chief Program Administrator | 2/7 | 2/9 | 3/16 | — | 1/4 | — | 1/9 | — | 5/13 | 3/8 | — | 1/2 | — | 6/11 | 1/3 | 1/1 | 3/3 | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 |
| Chief Program Administrator Assistant | 1/7 | 2/9 | 2/16 | — | — | — | — | — | 1/13 | 1/8 | — | — | — | 3/11 | 1/3 | 1/1 | 2/3 | 1/2 | 2/2 | 1/2 | 2/2 | 1/2 | — |
| ICT & Technical Officer | 2/7 | 4/9 | — | — | — | — | — | — | — | 1/8 | — | — | — | 1/11 | 1/3 | 1/1 | 2/3 | — | — | 2/2 | — | 1/2 | — |
| Homestay & Care Centre Coordinator | — | — | 3/16 | — | 4/4 | 2/6 | 1/9 | 1/7 | 1/13 | 1/8 | — | — | — | 2/11 | 1/3 | 1/1 | — | 1/2 | — | — | — | — | — |
| International Data Officer | — | — | 2/16 | 1/9 | — | — | — | — | 1/13 | 1/8 | — | 1/2 | — | 6/11 | 1/3 | 1/1 | 1/3 | — | — | — | — | — | 2/2 |

## 5. Capability register

`Sensitive` capabilities are subject to mandatory governance rules that ordinary administration cannot waive. `Dual` capabilities require two independent approvals.

| Capability | Group | Description | Flags | Roles holding it |
|---|---|---|---|---|
| `user.view` | Access & identity | View user directory | — | 9 roles |
| `user.create` | Access & identity | Initiate account requests | — | Chief System Administrator, County Office Administrator, Ministry Area Coordinator, Medical Case Manager, Human Resource Officer, Department Head |
| `user.approve` | Access & identity | Approve / reject accounts | — | Chief System Administrator, County Office Administrator, Chief Program Administrator |
| `user.manage` | Access & identity | Edit, suspend, deactivate accounts | — | Chief System Administrator |
| `role.manage` | Access & identity | Define roles & permission templates | sensitive | Chief System Administrator |
| `org.manage` | Access & identity | Configure counties, areas & departments | — | Chief System Administrator, ICT & Technical Officer |
| `system.config` | System | System settings & workflow configuration | sensitive | Chief System Administrator |
| `system.health` | System | System health & diagnostics | — | Chief System Administrator, ICT & Technical Officer |
| `system.audit` | System | Read the audit trail | sensitive | Chief System Administrator, President, Media & Information Governance Head, Auditor |
| `system.backup` | System | Create and verify backups | sensitive | Chief System Administrator, Media & Information Governance Head, ICT & Technical Officer |
| `system.restore` | System | Restore a database (dual approval) | sensitive, dual approval | Chief System Administrator |
| `system.import` | System | Master workbook import / data migration | sensitive | Chief System Administrator |
| `system.export` | System | Full database export | sensitive, dual approval | Chief System Administrator |
| `patient.list` | Patients | See patient lists (scoped) | — | 20 roles |
| `patient.view.basic` | Patients | View basic patient identity | — | 18 roles |
| `patient.view.clinical` | Patients | View clinical information | sensitive | 7 roles |
| `patient.assess.create` | Patients | Initiate a patient assessment | — | Supporting Caregiver, Nurse / Clinical Officer |
| `patient.digitise` | Patients | Digitise a physical assessment form | — | Administrative Assistant |
| `patient.verify` | Patients | Verify a digitised record | — | County Office Administrator, Administrative Assistant |
| `patient.enrol` | Patients | Approve enrolment | sensitive | County Office Administrator |
| `patient.return` | Patients | Return a record for correction | — | County Office Administrator, Administrative Assistant |
| `patient.discharge.recommend` | Patients | Recommend discharge | — | Ministry Area Coordinator, Supporting Caregiver, Medical Case Manager |
| `patient.discharge.approve` | Patients | Approve discharge | sensitive | County Office Administrator, Medical Case Manager |
| `patient.edit` | Patients | Correct patient records | — | County Office Administrator, Administrative Assistant, Medical Case Manager |
| `patient.export` | Patients | Export patient data (scoped, audited) | sensitive | County Office Administrator, Medical Case Manager, M&E / Data Officer |
| `condition.view` | Clinical | View recorded conditions | sensitive | 7 roles |
| `condition.record` | Clinical | Record a presenting condition | sensitive | Administrative Assistant, Supporting Caregiver, Medical Case Manager, Nurse / Clinical Officer |
| `condition.confirm` | Clinical | Confirm a diagnosis | sensitive | Medical Case Manager, Nurse / Clinical Officer |
| `condition.sensitive` | Clinical | View HIV, TB and counselling detail | sensitive | Medical Case Manager, Nurse / Clinical Officer |
| `condition.aggregate` | Clinical | Condition statistics without identities | — | 7 roles |
| `care.view` | Care centre | View care centre occupancy and residents | — | 12 roles |
| `care.log` | Care centre | Record daily care, meals and handover | — | Administrative Assistant, Supporting Caregiver, Medical Case Manager, Nurse / Clinical Officer, Homestay & Care Centre Coordinator |
| `care.incident` | Care centre | Record and read safeguarding incidents | sensitive | Medical Case Manager, Nurse / Clinical Officer, Homestay & Care Centre Coordinator |
| `care.manage` | Care centre | Manage beds, rosters and care plans | sensitive | County Office Administrator, Medical Case Manager, Homestay & Care Centre Coordinator |
| `delegation.manage` | Access & identity | Issue time-boxed delegations | sensitive | Chief System Administrator, Country Director, County Office Administrator |
| `visit.create` | Field & care | Record home visits | — | Ministry Area Coordinator, Supporting Caregiver, Approved Community Health Worker, Medical Case Manager, Nurse / Clinical Officer |
| `visit.view` | Field & care | View visit history | — | Ministry Area Coordinator, Supporting Caregiver, Approved Community Health Worker, Medical Case Manager, Nurse / Clinical Officer, Homestay & Care Centre Coordinator |
| `pdca.create` | Field & care | Create PDCA follow-up cycles | — | Ministry Area Coordinator, Supporting Caregiver, Approved Community Health Worker, Medical Case Manager, Nurse / Clinical Officer, Homestay & Care Centre Coordinator |
| `pdca.review` | Field & care | Review PDCA documentation | — | Medical Case Manager, Nurse / Clinical Officer |
| `media.upload` | Field & care | Upload patient documents & photographs | — | Supporting Caregiver, Approved Community Health Worker, Hospital Focal Person, Nurse / Clinical Officer |
| `story.submit` | Field & care | Submit potential success-story material | — | Supporting Caregiver |
| `form.view` | Patients | View digitised paper forms | — | 12 roles |
| `form.create` | Patients | Enter a paper form | — | Administrative Assistant, Supporting Caregiver, Approved Community Health Worker, Medical Case Manager, Hospital Focal Person, Nurse / Clinical Officer |
| `form.verify` | Patients | Verify a paper form against the original | — | Chief System Administrator, County Office Administrator, Administrative Assistant, Ministry Area Coordinator, Medical Case Manager, Nurse / Clinical Officer |
| `clinical.prescribe` | Clinical | Prescribe medication | sensitive | Medical Case Manager, Nurse / Clinical Officer |
| `clinical.dispense` | Pharmacy | Dispense medication | — | Medical Case Manager, Nurse / Clinical Officer |
| `pharmacy.view` | Pharmacy | View pharmacy stock and prescriptions | — | 8 roles |
| `pharmacy.manage` | Pharmacy | Receive and adjust pharmacy stock | sensitive | Medical Case Manager, Nurse / Clinical Officer |
| `careplan.view` | Clinical | View care plans | sensitive | 10 roles |
| `careplan.manage` | Clinical | Draft, rate and edit care plans | sensitive | Medical Case Manager, Nurse / Clinical Officer |
| `careplan.approve` | Clinical | Approve a care plan | sensitive | Medical Case Manager, Nurse / Clinical Officer |
| `hosp.request.create` | Hospital | Submit hospital appointment / transport requests | — | County Office Administrator, Administrative Assistant, Ministry Area Coordinator, Supporting Caregiver, Medical Case Manager, Homestay & Care Centre Coordinator |
| `hosp.request.review` | Hospital | Review hospital requests (clinical) | — | Medical Case Manager |
| `hosp.request.assign` | Hospital | Assign hospital focal persons | — | County Office Administrator, Medical Case Manager |
| `hosp.visit.record` | Hospital | Record hospital service delivery | — | Hospital Focal Person |
| `hosp.receipt.submit` | Hospital | Submit receipts & expense evidence | — | Hospital Focal Person |
| `hosp.receipt.review` | Hospital | Review / reconcile hospital expenses | sensitive | County Office Administrator, Medical Case Manager, Finance Officer |
| `hosp.close` | Hospital | Close hospital cases | — | County Office Administrator, Medical Case Manager |
| `finance.view` | Finance | View financial records (scoped) | — | 7 roles |
| `finance.budget.manage` | Finance | Manage budget lines & versions | — | County Office Administrator, Finance Officer |
| `finance.commit` | Finance | Commit / authorise expenditure | — | County Office Administrator, Finance Officer |
| `finance.pay` | Finance | Record payments | — | County Office Administrator, Finance Officer |
| `finance.reconcile` | Finance | Reconcile expenditure | sensitive | County Office Administrator, Finance Officer |
| `finance.report` | Finance | Generate expenditure reports | — | County Office Administrator, Finance Officer |
| `procurement.view` | Finance | View procurement pipeline | — | County Office Administrator, Finance Officer, Procurement Officer |
| `procurement.manage` | Finance | Manage procurement requests | — | Procurement Officer |
| `hr.view` | People | View staff records (HR scope) | — | 8 roles |
| `hr.manage` | People | Manage staff records | sensitive | Human Resource Officer |
| `hr.leave.approve` | People | Approve leave & off-days | — | Country Director, County Office Administrator, Human Resource Officer, Department Head |
| `hr.documents` | People | Manage staff documents | sensitive | Human Resource Officer |
| `welfare.view` | People | View welfare activities | — | County Office Administrator, Human Resource Officer, Staff Welfare Officer |
| `welfare.manage` | People | Manage welfare contributions | sensitive | Staff Welfare Officer |
| `media.view` | Media & governance | Access media library | — | Media & Information Governance Head, Public Relations Officer |
| `media.consent.manage` | Media & governance | Record & verify patient consent | sensitive | Medical Case Manager, Media & Information Governance Head |
| `media.publish` | Media & governance | Approve publication | sensitive | Media & Information Governance Head |
| `media.library.manage` | Media & governance | Manage media assets | — | Media & Information Governance Head |
| `policy.manage` | Media & governance | Manage governance policy | sensitive | Media & Information Governance Head |
| `kb.manage` | Media & governance | Manage organisational knowledge base | — | Media & Information Governance Head |
| `audit.view` | Audit | Inspect records & find findings | — | Country Director, County Office Administrator, M&E / Data Officer, Auditor, Chief Program Administrator, International Data Officer |
| `audit.manage` | Audit | Manage audit findings | sensitive | Auditor |
| `vehicle.view` | Transport | View vehicle & transport records | — | County Office Administrator, Vehicle & Transport Officer |
| `vehicle.manage` | Transport | Manage vehicles, trips & maintenance | — | Vehicle & Transport Officer |
| `trip.log` | Transport | Log trips & fuel | — | Vehicle & Transport Officer |
| `report.patient_days` | Reporting | Patient-Days report | — | 7 roles |
| `report.patient_figures` | Reporting | Patient Figures report | — | Country Director, County Office Administrator, Administrative Assistant, M&E / Data Officer, Auditor, International Data Officer |
| `report.expenditure` | Reporting | Expenditure report | — | 7 roles |
| `report.referral` | Reporting | Master Referral Document | — | Medical Case Manager, M&E / Data Officer, International Data Officer |
| `report.departmental` | Reporting | Departmental reports | — | 22 roles |
| `report.executive` | Reporting | Executive & leadership reports | — | Chief System Administrator, President, Country Director, Chief Program Administrator, Chief Program Administrator Assistant, International Data Officer |
| `report.targets.manage` | Reporting | Set & version targets | — | County Office Administrator |
| `pr.view` | Comms | Public relations workspace | — | Public Relations Officer |
| `pr.publish` | Comms | Publish approved external content | sensitive | Public Relations Officer |
| `message.use` | Comms | Send and receive internal messages | — | 26 roles |
| `ai.use` | Assistant | Use the LOMAMO C-DIMS assistant | — | 26 roles |
| `library.read` | Department library | Read the department library | — | 10 roles |
| `library.borrow` | Department library | Request to borrow material | — | Media & Information Governance Head, Public Relations Officer, Chief Program Administrator, Chief Program Administrator Assistant |
| `library.manage` | Department library | Manage the library and its loans | sensitive | Media & Information Governance Head, Chief Program Administrator, ICT & Technical Officer |
| `credit.view` | Recognition | See C-DIMS coins and usage scores | — | 14 roles |
| `credit.manage` | Recognition | Adjust scores and award coins | sensitive | Country Director, Human Resource Officer, Chief Program Administrator |
| `exec.agenda` | Executive | Read the executive team console | sensitive | President, Country Director, Chief Program Administrator, Chief Program Administrator Assistant |
| `exec.manage` | Executive | Publish agendas, minutes and decisions | sensitive | Country Director, Chief Program Administrator, Chief Program Administrator Assistant |
| `inventory.view` | Assets | View the office equipment register | — | 9 roles |
| `inventory.manage` | Assets | Add, transfer and audit equipment | sensitive | Chief System Administrator, County Office Administrator, Media & Information Governance Head, Procurement Officer, Chief Program Administrator, ICT & Technical Officer |
| `intern.view` | Students & research | View the students and interns register | — | County Office Administrator, Medical Case Manager, Human Resource Officer, Department Head, Chief Program Administrator, Chief Program Administrator Assistant |
| `intern.manage` | Students & research | Supervise students, interns and research requests | sensitive | County Office Administrator, Medical Case Manager, Human Resource Officer, Chief Program Administrator, Chief Program Administrator Assistant |
| `ohs.view` | Occupational safety | View occupational health and safety records | — | County Office Administrator, Human Resource Officer, Staff Welfare Officer, Chief Program Administrator, Chief Program Administrator Assistant, ICT & Technical Officer |
| `ohs.manage` | Occupational safety | Record and manage safety incidents | sensitive | County Office Administrator, Human Resource Officer, Staff Welfare Officer, Chief Program Administrator |
| `indicator.manage` | Data & indicators | Define data elements and indicators | sensitive | Chief System Administrator, M&E / Data Officer, Chief Program Administrator, International Data Officer |
| `dq.manage` | Data & indicators | Resolve data-quality exceptions | sensitive | 9 roles |
| `pmi.merge` | Patients | Merge duplicate patient identities | sensitive | Chief System Administrator, County Office Administrator, Administrative Assistant, Ministry Area Coordinator, Medical Case Manager, Chief Program Administrator |
| `presence.view` | System | See who is on the network and where | — | Chief System Administrator, County Office Administrator, Chief Program Administrator, Chief Program Administrator Assistant, ICT & Technical Officer |
| `weather.view` | System | Open the field weather board | — | 7 roles |
| `report.targets.view` | Reporting | Read targets & baselines in scope | — | 18 roles |
| `report.targets.area` | Reporting | Propose ministry-area targets & baselines | — | Country Director, County Office Administrator, Ministry Area Coordinator, Chief Program Administrator |
| `report.targets.county` | Reporting | Set county-office targets & baselines | sensitive | Country Director, County Office Administrator, Chief Program Administrator |
| `report.targets.national` | Reporting | Set national targets & baselines | sensitive | President, Country Director, Chief Program Administrator |
| `cost.view` | Finance | See cost per patient in your own scope | — | 21 roles |
| `cost.ledger` | Finance | Read the raw cost ledger lines | sensitive | 7 roles |
| `cost.standard.manage` | Finance | Set unit cost standards for a county office | sensitive | County Office Administrator, Finance Officer, Procurement Officer |
| `cost.standard.national` | Finance | Set national unit cost standards | sensitive | President, Country Director, Chief Program Administrator |
| `cost.export` | Finance | Export a cost analysis (audited) | sensitive | Country Director, County Office Administrator, Finance Officer, M&E / Data Officer, Auditor, Chief Program Administrator |
| `tb.view` | Pharmacy | See the TB dispensing control board | — | 15 roles |
| `tb.request.create` | Pharmacy | Request pyridoxine / TB drugs for a patient | — | Ministry Area Coordinator, Supporting Caregiver, Approved Community Health Worker, Medical Case Manager, Hospital Focal Person, Nurse / Clinical Officer |
| `tb.request.review` | Pharmacy | Answer a TB drug request as case manager | sensitive | Medical Case Manager, Nurse / Clinical Officer, Department Head |
| `tb.dispense` | Pharmacy | Dispense against an approved TB request | — | Medical Case Manager, Hospital Focal Person, Nurse / Clinical Officer |
| `tb.stock.count` | Pharmacy | Record a physical TB stock count | — | County Office Administrator, Medical Case Manager, Nurse / Clinical Officer, Finance Officer, Procurement Officer |
| `tb.stock.reconcile` | Pharmacy | Reconcile TB stock against procurement | sensitive | County Office Administrator, Finance Officer, Procurement Officer, Auditor |
| `team.view` | People | See ministry teams, visit days & department leadership | — | 26 roles |
| `team.manage` | People | Edit ministry teams, visit days & department leadership | sensitive | Chief System Administrator, Country Director, County Office Administrator, Human Resource Officer, Chief Program Administrator |

## 6. Negative controls (proven by the in-app security self-test)

| Attempt | Result | Control |
|---|---|---|
| Kisumu Finance Officer reads Homa Bay transactions | **denied** | county scope |
| Homa Bay Finance Officer reads Kisumu transactions | **denied** | county scope |
| Nyalenda caregiver opens a Homa Bay patient | **denied** | county + area scope |
| Nyalenda caregiver opens a patient in Ombeyi | **denied** | area scope |
| Caregiver approves a hospital request | **denied** | no `hosp.request.review` |
| Caregiver publishes patient media | **denied** | no `media.publish` |
| Caregiver reads financial records | **denied** | no `finance.view` |
| Caregiver exports patient data | **denied** | no `patient.export` |
| Chief System Administrator reads clinical detail | **denied by default** | no `patient.view.clinical` |
| Auditor edits a patient record | **denied** | read-only role |
| Hospital Liaison approves their own assignment | **denied** | no review capability |
| Single approval executes a restore or export | **denied** | dual approval required |
| Nyalenda caregiver opens a Nyalenda patient | **permitted** | positive control |

## 7. Separation of duties

| Sensitive operation | Chief System Administrator | Media & Information Governance Head | Requirement |
|---|---|---|---|
| Database restore | requests | approves | two independent approvals; requester cannot self-approve |
| Full database export | requests | approves | two independent approvals, always audited |
| Publication of patient media | cannot approve | approves | consent + scope gate evaluated at publication |
| Reading clinical detail | not held by default | not held | clinical roles only |
| Editing the audit trail | impossible | impossible | append-only, hash-chained |
| Disabling privacy rules | impossible | possible only through policy versioning | rules g1–g8 are non-overridable |

## 8. Authority levels, domains and departments (v6.1)

A capability says **what** an action is. It does not say **how far** it reaches. Since v6.1 every capability that writes targets, money, patient data, drugs or organisational information is bound to a level, a domain and a context. The binding is data (`AUTHORITY_LEVELS`, `ACCESS_DOMAINS`, `CAP_DEPT`, `CAP_LEVEL` in `src/access_rules.js`), so it can be read whole, printed as a matrix and audited. Enforcement happens in `RBAC.can`, the same single gate the data layer already used.

### 8.1 Levels

| Level | Rank | What it reaches |
|---|---:|---|
| `own` | 0 | Own records — the person's own records |
| `assigned` | 1 | Assigned to me — records assigned to the person |
| `area` | 2 | Ministry area — the assigned ministry areas |
| `department` | 3 | Department — the person's department |
| `county` | 4 | County office — every ministry area of one county office |
| `national` | 5 | National — every county office |

### 8.2 Domains

| Domain | Capabilities |
|---|---|
| Targets & baselines | `report.targets.view`, `report.targets.area`, `report.targets.county`, `report.targets.national` |
| Money & budgets | `finance.view`, `finance.budget.manage`, `finance.commit`, `finance.pay`, `finance.reconcile`, `finance.report`, `procurement.view`, `procurement.manage`, `cost.view`, `cost.ledger`, `cost.standard.manage`, `cost.standard.national`, `cost.export` |
| Patient data | `patient.list`, `patient.view.basic`, `patient.view.clinical`, `patient.edit`, `patient.enrol`, `patient.discharge.approve`, `patient.export`, `condition.view`, `condition.sensitive`, `condition.aggregate` |
| Ministry information | `visit.create`, `visit.view`, `pdca.create`, `pdca.review`, `team.view`, `team.manage`, `hr.leave.approve` |
| Drugs & stock | `pharmacy.view`, `pharmacy.manage`, `clinical.prescribe`, `clinical.dispense`, `tb.view`, `tb.request.create`, `tb.request.review`, `tb.dispense`, `tb.stock.count`, `tb.stock.reconcile` |
| Staff & welfare | `hr.view`, `hr.manage`, `hr.documents`, `welfare.view`, `welfare.manage` |
| Media & publication | `media.view`, `media.publish`, `media.consent.manage`, `pr.publish`, `pr.view`, `policy.manage` |
| System & governance | `system.config`, `role.manage`, `org.manage`, `system.import`, `system.backup`, `system.restore`, `system.export`, `system.audit`, `user.approve`, `user.manage` |

### 8.3 Capabilities bound to a level

| Capability | Deepest level | Who may exercise it |
|---|---|---|
| `report.targets.area` | **area** | Country Director, County Office Administrator, Ministry Area Coordinator, Chief Program Administrator |
| `report.targets.county` | **county** | Country Director, County Office Administrator, Chief Program Administrator |
| `report.targets.national` | **national** | President, Country Director, Chief Program Administrator |
| `report.targets.manage` | **county** | County Office Administrator |
| `finance.budget.manage` | **county** | County Office Administrator, Finance Officer |
| `cost.standard.manage` | **county** | County Office Administrator, Finance Officer, Procurement Officer |
| `cost.standard.national` | **national** | President, Country Director, Chief Program Administrator |
| `org.manage` | **national** | Chief System Administrator, ICT & Technical Officer |
| `team.manage` | **county** | Chief System Administrator, Country Director, County Office Administrator, Human Resource Officer, Chief Program Administrator |

### 8.4 Capabilities bound to a department

| Capability | Departments that own it |
|---|---|
| `patient.view.clinical` | Medical & Clinical Services, pharmacy, Ministry & Field Programmes, Hospital Coordination, Administration |
| `condition.view` | Medical & Clinical Services, pharmacy, Ministry & Field Programmes, Hospital Coordination, Administration |
| `condition.record` | Medical & Clinical Services, Ministry & Field Programmes, Hospital Coordination, pharmacy |
| `condition.confirm` | Medical & Clinical Services |
| `condition.sensitive` | Medical & Clinical Services, pharmacy, Hospital Coordination |
| `clinical.prescribe` | Medical & Clinical Services, pharmacy |
| `clinical.dispense` | Medical & Clinical Services, pharmacy, Hospital Coordination |
| `pharmacy.manage` | Medical & Clinical Services, pharmacy, Procurement, Administration |
| `tb.request.review` | Medical & Clinical Services, pharmacy, Hospital Coordination |
| `tb.dispense` | Medical & Clinical Services, pharmacy, Hospital Coordination |
| `tb.stock.reconcile` | Finance, Procurement, pharmacy, Audit, Administration |
| `hr.manage` | Human Resources, Administration, Executive Leadership |
| `hr.documents` | Human Resources, Administration |
| `welfare.manage` | Staff Welfare, Human Resources, Administration |
| `media.publish` | Media & Information Governance, Public Relations & Communications, Administration, Executive Leadership |
| `media.consent.manage` | Media & Information Governance, Medical & Clinical Services, Ministry & Field Programmes, Administration |
| `pr.publish` | Public Relations & Communications, Media & Information Governance, Administration, Executive Leadership |
| `policy.manage` | Media & Information Governance, Administration, Executive Leadership, Audit |
| `procurement.manage` | Procurement, Finance, Administration |
| `finance.commit` | Finance, Administration, Executive Leadership |
| `finance.pay` | Finance, Administration |
| `finance.reconcile` | Finance, Audit, Administration |
| `finance.budget.manage` | Finance, Administration, Executive Leadership |
| `cost.standard.manage` | Finance, Procurement, Administration, Executive Leadership |
| `cost.standard.national` | Finance, Executive Leadership, Administration |
| `vehicle.manage` | Vehicle & Transport, Administration, Procurement |
| `inventory.manage` | ICT & Technical Services, Administration, Procurement |
| `system.config` | Administration, ICT & Technical Services |
| `role.manage` | Administration |
| `org.manage` | Administration, ICT & Technical Services, Executive Leadership |
| `system.import` | Administration, ICT & Technical Services, Data Management & M&E |
| `team.manage` | Administration, Human Resources, Executive Leadership, Ministry & Field Programmes |

### 8.5 Who may set a target or a baseline

Measurement and target setting are separate duties. An M&E / Data Officer reads targets, reports against them and raises a data-quality exception; the office that owns the level sets it.

| Role | Area | County | National |
|---|:--:|:--:|:--:|
| Chief System Administrator | — | — | — |
| President | — | — | yes |
| Country Director | yes | yes | yes |
| County Office Administrator | yes | yes | — |
| Administrative Assistant | — | — | — |
| Ministry Area Coordinator | yes | — | — |
| Supporting Caregiver | — | — | — |
| Approved Community Health Worker | — | — | — |
| Medical Case Manager | — | — | — |
| Hospital Focal Person | — | — | — |
| Nurse / Clinical Officer | — | — | — |
| Media & Information Governance Head | — | — | — |
| Finance Officer | — | — | — |
| Procurement Officer | — | — | — |
| M&E / Data Officer | — | — | — |
| Auditor | — | — | — |
| Human Resource Officer | — | — | — |
| Staff Welfare Officer | — | — | — |
| Vehicle & Transport Officer | — | — | — |
| Public Relations Officer | — | — | — |
| Department Head | — | — | — |
| Chief Program Administrator | yes | yes | yes |
| Chief Program Administrator Assistant | — | — | — |
| ICT & Technical Officer | — | — | — |
| Homestay & Care Centre Coordinator | — | — | — |
| International Data Officer | — | — | — |

### 8.6 The authority self-test

`ACCESS.selfTest()` proves these rules at run time. They also run inside *Assurance → Access & authority audit* and in `v6/test/v61.js`.

| Rule | Expected |
|---|---|
| M&E / Data Officer sets a county target | **refused** |
| M&E / Data Officer sets a national target | **refused** |
| M&E / Data Officer reads targets in scope | **permitted** |
| County Office Administrator sets a county target | **permitted** |
| County Office Administrator sets a national target | **refused** |
| Director sets a national target | **permitted** |
| Caregiver opens the finance ledger | **refused** |
| Caregiver sees the cost of the patients they serve | **permitted** |
| Caregiver reads the raw cost ledger | **refused** |
| Finance sets a national cost standard | **refused** |
| Coordinator proposes an area target for another area | **refused** |
| Chief System Administrator reads clinical detail | **refused** |
| Chief System Administrator sets a programme target | **refused** |

## 9. Changing permissions

1. Chief System Administrator opens **Roles & permissions** and selects a template.
2. Capabilities are added or removed; scope is set (organisation / county / areas; record scope).
3. The change is written to the audit trail with the acting account and timestamp.
4. The Security self-test is re-run; a failure blocks promotion to production.

Where a responsibility is not documented in the organogram or job descriptions, the role is marked **PROPOSED** in the decisions register (doc 08) and requires leadership confirmation.
