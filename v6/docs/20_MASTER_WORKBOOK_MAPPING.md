# 20 · The master patient workbook, mapped into CareLink DIMS

Source studied: **`20260101 LOMAMO registration patients 2026.xlsx`** — the
Administration's current master record of all patient data and information.
Studied on 22 October 2026, sheet by sheet, column by column, formula by formula.

In code: `v6/src/master_registry.js` · In the app: *System → Master registry
mapping* · Proved by: `v6/test/v61.js` §5.

> **The workbook file is not stored in this repository.** It contains patient
> names, National IDs, telephone numbers and household detail, and this repository
> is public and serves the live site. What is kept is its structure, vocabulary,
> rules and mapping — which contain no patient identity. Real records enter the
> system through *System → Master data import* on the office host.

---

## 1. The 21 sheets and where each one lives

| Sheet | Kind | Rows | Becomes |
|---|---|---|---|
| `INDEX` | Report index | 21 | Report centre, Analytics hub, Cost per patient — all 24 topics traced to a page that exists |
| `Extra MI` | Cost & ratio analysis | 104 | Cost engine: "KISUMU Costprice food per visited patient" (`=C/D`), average costprice per unique patient, slum/village ratio |
| `MI 2026` | Monthly indicators | 429 | Indicators, Patient Figures, Analytics hub: main data, controls, care duration, gradients, disease specification, TB and cancer detail, hospital averages |
| `Data` | Multi-year data | 99 | Analytics hub year comparison, waiting list, intake |
| `Foodbags` | Supply issue grid | 51 | Cost engine (bags & supplies), Support register: Bag 1 / Bag 2 / Special bag per week per area, quarterly hygiene packs |
| `CCC1` | Cost & days summary | 59 | Cost engine: foodbags to a month against visited patients, average food per patient, days in programme per area |
| `Manyatta` `Nyahera` `Nyalenda` `Ombeyi` `Nairobi Road` `Ahero` `Chiga` | Ministry area registers | ~253 each | Patient register, scoped to the ministry area |
| `Basic` | Hidden template | 257 | The registration blueprint (an empty area is copied from it) |
| `NEW` | Hidden draft area | 254 | Organisation configuration → add area |
| `URGCAS` | Urgent cases & budget | 75 | Hospital requests (urgent) + budget: NAME, WHAT, COSTS, Budget, month and year totals |
| `Homabay` | Hidden county register | 253 | Patient register, Homa Bay County Office |
| `Waiting List` | Waiting list | 263 | Assessment pipeline: name, telephone, date on the list, date in programme, deceased, other information |
| `Tabel` | Validation lists | 55 | Reference data and every data-entry dropdown, plus the 53-week calendar |
| `Goals '26` | Leadership goals | 12 | Targets & baselines at **national** level (the Director's goals) |
| `Discharged` | Discharge register | 151 | Discharge register and Patient Figures (some source formulas are `#REF!`; they are rebuilt here) |

## 2. The 145 columns of a ministry-area register

Grouped exactly as the workbook groups them. `d` marks a column the workbook
computes — in CareLink those are calculated on save and can never disagree with
the record.

| Group | Columns | Notes |
|---|---|---|
| Identity | A–G | Name, Patient's ID, Spouse's ID, NHIF (`NHIF/LMM/Other`), New in month, In program, Minimal Care |
| Programme days | H–O | **H** `=IF(AND(L="";K>183);"x";"")` minimal-care flag · **I** Date in · **J** Date out ("ONLY CHANGE DATE WHEN DISCHARGED OR DECEASED") · **K** `=IF(I="";0;J-I)` counted days · L discharge month · M deceased month · N repeat patient · O relocated |
| Household & children | P–T | Male children, Female children, **R** `=P+Q`, **S** `=IF(L="";"";R)` prevented becoming orphan, **T** `=IF(M="";"";R)` became orphans |
| Print & schedule | U–AA | Print mirror `=A`, NORMAL BAG, SPECIAL BAG, Medical only, Schedule (`EW`, `EOW`, `Twice Week`) |
| Weekly bag grid | AB–CB | Week 1 … Week 53, one cell per patient per week: `BG1`, `BG2` or `SPB` |
| Bag totals | CC–CF | `=COUNTIF(AB:CB;Tabel!$I$5..7)` for Bag 1, Bag 2, Special bag, and the total |
| Hygiene packs | CG–CP | Two columns per quarter (hygiene packs, extra Water Guard), **CO** `=CG+CI+CK+CM`, **CP** `=CH+CJ+CL+CN` |
| Medication & TB | CQ–CV | Vitamins, Last month given, (Extra)pulmonary TB, **CT** TB discharged days, **CU** TB deceased days, TB flag |
| Grants & conditions | CY–DL | Extra, TB Grant ZvAfrika (+ discharged/deceased days), Wound, Meningitis, Stroke, Cancer NEW (site list), Cancer discharged/deceased days, Malaria, Others |
| Faith & support items | DM–DV | Photo, Intake, Saved, Mosquito net, Viral Load & CD4 known, Default patient, Woundcare, Bible, ARVs, PSC |
| Hospital | DW–DZ | Out-patient visit numbers, patients hospital-in, number of hospital visits, deceased in hospital |
| Cost | EA–EL | **EA** transport in and out of hospital · **EB** medications · **EC** transport · **ED** out-patient · **EE** SHIF · **EF** `=SUM(EB:EE)` · **EG–EJ** in-patient cost 1–4 · **EK** `=SUM(EG:EJ)` · **EL** `=EF+EK` total |

### Two columns carry a governance decision, not just data

* **DM "Photo"** maps to the *consent register*, never to a picture. A photograph
  of a beneficiary is published only with recorded consent.
* **DO "Saved"** maps to the restricted faith record: visible only to authorised
  ministry and leadership roles, and never used as a staff performance target.

## 3. The validation vocabulary (sheet `Tabel`)

| List | Values |
|---|---|
| Months | `January'26` … `December'26` |
| Weekdays | Monday … Sunday |
| Schedule | `EW` (every week), `EOW` (every other week), `1 Month`, `Pulmonary TB`, `Extra pulmonary TB` |
| Yes/No · Activity | `Yes`, `No` · `Active`, `Non Active` · marker `x` |
| Caregivers | `Desmond`, `ZVA`, `Other` — *Desmond Marshall sits on the Foundation's board; ZVA is Zorg voor Afrika, the TB grant in column DB* |
| Cancer sites | Cervical, KS, Uterine, Esophageal and stomach, Lung, Others |
| Food bags | `BG1` Bag 1, `BG2` Bag 2, `SPB` Special bag |
| Cover | `NHIF`, `LMM` (LOMAMO), `Other` |
| Ministry areas | Manyatta, Nyahera, Nyalenda, Ombeyi, Nairobi Rd., Ahero, Chiga, Homabay, New area 4, New area 5 |
| Weeks | 1–53 for 2026; **"a week number means from Monday up and until Saturday"**, week 1 = 1–4 January, week 53 = 28–31 December |

## 4. The rules, rebuilt as code and tested

| Rule | Workbook formula | In CareLink | Test |
|---|---|---|---|
| Days in programme | `K =IF(I="";0;J-I)` | `patients.programDays`, the denominator of cost per patient-day | 2025-07-15 → 2026-01-29 = 198 days |
| Minimal-care review | `H =IF(AND(L="";K>183);"x";"")` | flags an open record beyond 183 days | 198 days open → `x`; 183 → blank; discharged → blank |
| Total children | `R =P+Q` | `household.children` | 1 male + 2 female = 3 |
| Orphans prevented | `S =IF(L="";"";R)` | indicator `orphans_prevented` | counts on discharge only |
| Became orphans | `T =IF(M="";"";R)` | indicator `orphaned` | counts on death only |
| Bag counts | `CC/CD/CE =COUNTIF(AB:CB;code)` | cost engine (bags & supplies) | grid BG1,BG2,BG1,SPB,bg1 → 3/1/1 |
| Other patient cost | `EF =SUM(EB:EE)` | cost subtotal | 450+900+1200+200 = 2750 |
| In-patient cost | `EK =SUM(EG:EJ)` | cost subtotal | 2000+800 = 2800 |
| Total cost | `EL =EF+EK` | the patient's attributed total | 5550 |
| Costprice food per visited patient | `Extra MI E =C/D` | average cost per patient | 511 313 / 129 = KES 3 964 |
| Average per unique patient | `Extra MI E20 =C20/D20` | average cost per unique patient | — |
| Slums versus villages | `Q/S`, `R/S` | analytics pivot on the area classification (urban/village) | 73 / 56 = 56.6% / 43.4% |
| Closing control | `G =D-(E+F)` vs `H` | Patient Figures closing calculation | 16+22−18−2 = 18, difference 0 |
| Long-stay share | `row 52 =B51/B50` | Programme days report | 41/129 = 31.8% |
| Hospital average | `row 352 =B351/B350` | hospital operations report | 214/96 = 2.23 visits per patient |
| TB ten-day cycle | `CR` last month given | TB dispensing control: given 5 Oct → window 13–14 Oct, cover ends 15 Oct | v61 §4 |

## 5. What registration looks like now

*System → Master registry mapping* prints the blueprint: every field a person
typing a new patient sees, grouped as the workbook groups it, with the column it
came from, the allowed values, and where it is stored. The weekly bag grid
(AB–CB) and the quarterly hygiene columns (CG–CN) are entered on the **visit
record**, not at registration, because they are events rather than identity.

The new-patient form carries: cover (NHIF/LMM/Other), spouse's ID, male and
female children (total calculated), visit schedule, food bag code at enrolment,
returning beneficiary, relocated, medical only, TB type, cancer site, ZvAfrika
grant, and the five cost columns known at registration.

## 6. Importing the real workbook

1. On the office host, open *System → Master registry mapping* and download
   **`LOMAMO-master-patient-import-template.csv`** — one column per mapped
   workbook field, with a worked example row.
2. Fill it from the workbook (or export the area sheet to CSV and rename the
   headers to the template's).
3. Open *System → Master data import*, validate, review the duplicate and
   reconciliation report, then commit. The import is capability-guarded
   (`system.import`), audited, and runs on the host — the file never enters the
   repository.
4. Costs imported from EA–EL become cost lines attributed to the patient, so the
   cost-per-patient engine reports the history as well as the current year.
