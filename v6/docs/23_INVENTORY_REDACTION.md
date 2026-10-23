# 23 · Inventory redaction — what was published, and what was done

**Date:** 23 October 2026
**Status:** closed in the working tree and in the built application; open in Git
history until the owner runs `v6/tools/purge_patient_data.sh` (see document 22).
**Owner of the register:** the Media department (Kisumu and Homa Bay).

---

## 1. What was published

The two Administration inventory workbooks were committed to a public repository
and one of them — the office inventory sheet — was copied into
`v6/src/inventory_data.js` almost verbatim, which put it inside
`public/carelink-v6.html`. That bundle is served to anyone with the URL, before
any login. It therefore published:

| Exposed | Count | Why it matters |
|---|---|---|
| Vehicle registration plates | 2 | Identifies a specific Foundation vehicle in public |
| Chassis numbers | 2 | Full vehicle identity; usable for cloning documents |
| Handset IMEI numbers | 9 rows, 16 IMEIs | Enables handset cloning and fraudulent warranty or insurance claims |
| Staff SIM / subscriber numbers | 5 | **Personal data** — a real person's telephone number |
| Staff names attached to the device or SIM they hold | 11 rows | Links an identified person to a device, a ministry and a location |
| Monetary values of assets | 52 rows | Organisational financial data, including a seven-figure vehicle |
| Items recorded as missing | 1 row | A theft or loss signal, published with its location |
| A named donor attached to a gift | 1 note | Donor privacy |

The staff SIM numbers are the most serious line in that table. They are
telephone numbers belonging to identified members of staff, published beside
their names — personal data under the **Kenya Data Protection Act (2019)**, in a
repository that also describes an HIV and TB programme.

## 2. Why the patient sweep did not catch it

`v6/tools/verify_no_patient_data.py` swept 565 patient names and 434 patient
telephone numbers read out of the master registration workbook, and correctly
reported zero matches. It was looking for **patient** identities. The inventory
workbook contains no patients: it contains assets, and the personal data in it
belongs to **staff**. A sweep built from one source cannot see another source's
identifiers, and an IMEI or a registration plate is not shaped like a name.

That is the real lesson, and it is why the verifier now carries pattern-based
passes (section 6) rather than only identity-based ones.

## 3. What was done

**Redaction.** `v6/tools/redact_inventory.py` regenerates
`v6/src/inventory_data.js` from the workbooks and removes identifiers and values
while keeping the structure:

| Field | Before | After |
|---|---|---|
| `value` | the workbook's amounts | empty, everywhere |
| `serial` | manufacturer serials, IMEIs, chassis numbers, VC numbers | only the Foundation's own asset labels (`LMM/…`, `LMMK/…`) — 22 of 122 rows had one |
| `loc` | a person's name, or one of nine spellings of the same room | a closed list of 18 site labels |
| `desc` | registration plates and chassis numbers inline | the item described, the identifier removed |
| `item`, `qty`, `unit`, `cat`, `date`, `cond`, `exist`, `src` | the workbook | unchanged — this is the structure worth keeping |

Equipment issued to a person is now recorded against the ministry or room that
owns the duty, and the holder is written into the **movement ledger** on the
office host, where it is behind login and the audit trail. A location field is
not a person field, and a public bundle is not an asset register.

**A dead register, repaired.** `INVENTORY_SEED` was never consumed: the register
calls `inventorySeed()`, which did not exist, so `db.inventoryItems` was seeded
empty and the Office equipment register rendered nothing — while the bundle
still carried all 122 rows of raw data. The exposure bought no functionality.
`inventorySeed()` now exists, the register renders 122 items across 8 categories
and 179 units, and the search, filter, paging, movement and CSV export paths all
work.

**Ownership, wired.** The Media department is documented as the owner of this
register but the `mediahead` role had no `inventory.view`, so neither Media head
could open it. Both capabilities are now granted; ICT, procurement, county
administration and the vehicle officer keep theirs.

**Invented people, reserved space.** The same audit found that seeded contact
details were built to look real: `'07' + a random 8-digit range` produced
plausible Kenyan mobile numbers for demo patients, and two generators produced
plausible numbers for **real named staff**. A fabricated patient beside a number
that belongs to a real subscriber publishes that subscriber's number next to an
HIV diagnosis. All seeded contact details now sit in reserved space:

| What | Convention |
|---|---|
| Patient telephone numbers | `0700 1xxxxx` |
| Official staff numbers | `0700 3xxxxx` |
| Demo roster numbers | `0700 5xxxxx` |
| National IDs | the `9x,xxx,xxx` band, which no Kenyan identity number has reached |
| Clinic (CCC) numbers | `CCC/9xxxx` |
| Mailboxes | `@lomamo.example` — the RFC 2606 reserved TLD, so no seeded mailbox can be a real one |

The three demo vehicle plates in `v6/src/data.js` are invented and stay; they are
allowlisted in the verifier with a comment saying so.

## 4. What the workbooks still contribute

Nothing was thrown away except the identifiers. The structure the Administration
built is now the structure the system uses:

- **122 equipment rows** across the workbook's own **8 categories**, in workbook order.
- **18 site labels** — the closed location list the add and move forms now use, so
  a movement is recorded against a site and never against a person.
- **79 supply lines** with their units, across the six supply groups the workbooks
  define (Medicines, Wound Care, Equipment, PPEs and Socks, Cleaning Material,
  Dressing Materials).
- **The 9-column count sheet** the medical supplies sheet uses, including its
  period-over-period shape (June quantity / used / remaining against October
  remaining / used, in store, given out, remarks).
- **77 kitchen items** and the **10 material columns** they are counted against
  (ceramic, melamine, plastic, aluminium, glass, wooden, others, working total,
  less broken or damaged).
- **7 acquisition notes** from the bottom of the sheet, kept as provenance. A
  named donor is recorded by role: a gift is the Foundation's to publish, a
  person's name attached to it is not.

Quantities on the supply and kitchen templates are deliberately blank. Every line
is confirmed by a **physical count** on the office host — which is what the TB
dispensing protocol already requires of every stock line, and what keeps stock
figures out of a published bundle. *Workplace → Office equipment register →
Physical count templates → Blank count sheet (CSV)* prints the sheet the
storekeeper counts against.

## 5. Where the real values live now

On the office host, in the database `v6/server.py` keeps, behind login and the
audit trail. They are recorded through the register itself:

- **Add item** — asset tag, condition, new/old, and a value field labelled
  *Value (office host only)*.
- **Move or recount** — the movement ledger: who moved it, from where, to where,
  how many were counted, and why. This is where a holder's name belongs.
- **CSV** — exports the register as held on that host, values and tags included,
  and writes an audit line. The export of a redacted host is a redacted CSV; the
  export of the office host carries what the office host was told.

The workbooks stay on the office host too. `.gitignore` now refuses any
spreadsheet at the repository root, so the next one cannot be committed by
accident. The only spreadsheet this repository publishes is the blank, demo-only
import template at `v6/examples/LOMAMO-Master-Patient-Workbook-TEMPLATE.xlsx`.

## 6. How this is kept clean

`v6/tools/verify_no_patient_data.py` runs six passes and exits non-zero on any
match. The three added by this remediation are pattern-based, so they catch a
source no identity list could anticipate:

- **Pass 3 — secrets.** Vehicle plates, chassis numbers, handset IMEIs, and
  telephone numbers outside the demo band, across every text file and inside
  every ZIP archive.
- **Pass 4 — the register.** Row by row: no monetary value, no device identifier,
  no person as a location, no narrative note mistaken for an item, no implausible
  quantity, `inventorySeed()` present, every structure constant present.
- **Pass 5 — conventions.** Every seeded telephone number and mailbox is in
  reserved space; no generator still builds a number from `'07'` plus a random
  range.
- **Pass 6 — the files.** No Administration workbook is tracked at the root.

Run it before any release and after any import:

```bash
python3 v6/tools/verify_no_patient_data.py     # want: CLEAN, exit 0
python3 v6/tools/redact_inventory.py --check   # want: OK, exit 0
```

Both were verified to fail loudly: planting a plate, an IMEI, a value, a device
serial and a person-as-location into the tree makes the verifier report
`NOT CLEAN` and exit 1. A check that cannot fail is not a check.

## 7. What is still open

The files are gone from the working tree, from the built application, from the
offline kit and from the live site — but they remain in **Git history**, and so
does the earlier version of `v6/src/inventory_data.js`, which is where the
identifiers actually were. Erasing that needs a history rewrite and a force-push
to `main`, which only the repository owner can do: **document 22** is the
runbook, and `v6/tools/purge_patient_data.sh` now targets all four workbooks.

Residual risk, stated plainly: both sets of files were publicly downloadable
until they were removed. A rewrite protects the future, not the past — anyone who
downloaded them, any fork, and any crawler or web archive that fetched them
still hold a copy. Because staff telephone numbers and patient health data are
involved, this should be handled as a data incident: tell the data controller
(the Director), and take advice on the notification duties under the Kenya Data
Protection Act (2019). Making the repository private — done on 23 October 2026 —
stops all public access immediately and is the strongest available evidence that
the Foundation acted as soon as it knew.
