# 06 · Offline import and data processing

> The master workbook contains confidential patient information. It must never be uploaded to a
> cloud service, a public website or an external AI provider.

This is the operating rule for every import in CareLink DIMS.

---

## 1. Two-stage design

```
 ┌───────────────────────── ON THIS DEVICE ─────────────────────────┐
 │                                                                   │
 │  MASTER.xlsx ──► tools/import_engine.py ──► lomamo_master.json    │
 │  (read-only)         (openpyxl, offline)      reconciliation.md   │
 │                            │                                      │
 │                            ▼                                      │
 │                  CareLink DIMS import wizard                      │
 │            map → validate → preview → decide → commit             │
 │                            │                                      │
 │                            ▼                                      │
 │                  SQLite / local database                          │
 │                                                                   │
 └───────────────────────────────────────────────────────────────────┘
                              no network
```

**Stage 1 — engine (`tools/import_engine.py`).** Reads every worksheet, detects headers, records
formula cells, classifies each sheet (register / visits / referrals / documentation), maps columns
onto the DIMS model, normalises dates and numbers, resolves ministry areas, validates every row,
detects duplicates and writes a staged JSON package plus a reconciliation report.

**Stage 2 — wizard (`src/import.js`).** Loads the package, shows the detected mapping for human
confirmation, previews every row with its issues, requires a per-row decision where a conflict
exists, creates a verified pre-import backup, commits, and produces the reconciliation summary.

The engine **never writes to the database**. The wizard **never guesses** a mapping.

---

## 2. Running the engine

```bash
# 1. Generate the template (once)
python3 tools/make_master_template.py
#    → examples/LOMAMO-Master-Patient-Workbook-TEMPLATE.xlsx

# 2. Analyse the real workbook
python3 tools/import_engine.py \
    --workbook "MASTER PATIENT WORKBOOK.xlsx" \
    --out lomamo_master.json \
    --report reconciliation.md

# 3. Optional: compare against an existing DIMS export to catch cross-file duplicates
python3 tools/import_engine.py --workbook MASTER.xlsx --db-json dims-export.json

# 4. Open CareLink DIMS → Master data import → choose lomamo_master.json
```

Requirements: Python 3.9+, `openpyxl`. Both are installed on a standard LOMAMO laptop; no other
dependency is needed. The engine has **no network code at all**.

Options: `--sheet NAME` (repeatable) restricts to named worksheets, `--areas areas.json` overrides
the ministry-area list, `--sample N` processes only the first N rows per sheet for a dry run,
`--quiet` suppresses progress output.

---

## 3. What the engine handles

| Capability | Behaviour |
|---|---|
| Multiple worksheets | Each sheet is classified independently |
| Non-standard layouts | Header row located within the first 15 rows by a word/digit heuristic |
| Title and instruction sheets | Classified `documentation` and skipped without error |
| Formulas | Counted and reported (structure awareness); values are read from the cached calculation |
| Merged or blank cells | Blank rows skipped; merged cells surface as blanks and are flagged |
| Date formats | ISO, `dd/mm/yyyy`, `dd-Mon-yyyy`, `yyyy-mm`, Excel serial numbers |
| Currency and separators | Stripped where unambiguous; failures flagged, never coerced |
| Ministry-area aliases | Exact and tolerant matching (`"Nyalenda (Urban)"` → `nyalenda`), with a note |
| Status vocabulary | Mapped to DIMS states; discharge date overrides a conflicting status |
| Referral sheets | Detected by sheet name and vocabulary; staged separately, never as patients |
| Visit sheets | Linked by file number or, failing that, patient name |
| Future workbook versions | Unmapped columns are reported and preserved, not discarded |

---

## 4. Duplicate policy

| Test | Strength | Action |
|---|---|---|
| CCC number match | Strong | Flag; require decision; cross-file matches compared against the live database |
| File number match | Strong | Flag; require decision |
| Name + ministry area match | Weak | Flag for human review — **never** auto-merged |

Available decisions per flagged row: **Import as new**, **Import and flag**, **Skip**, **Send for
review**. There is no "merge all" button, because merging on name similarity merges different people
with the same name.

---

## 5. Safety sequence

1. The source file is opened read-only and its SHA-256 is recorded in the package.
2. A verified **pre-import backup** is created before commit (visible in Backup & restore).
3. Existing records are never updated or overwritten by this import path.
4. Imported patients are created with `docsVerified: false` and `flags: ['imported']`, so clinical
   verification is visibly outstanding.
5. The import writes an audit entry containing the operator, timestamp, file name, counts and checksum.
6. A reconciliation report records: rows detected, created, skipped, flagged; fields transformed;
   unmapped columns; every issue with its row number.
7. Import history is retained in the console.

---

## 6. Demonstrated run (included in this build)

```
Source: examples/LOMAMO-Master-Patient-Workbook-TEMPLATE.xlsx  (12.6 KB)
SHA-256: 2c5dc48776aa52dcdee60cba88dae332…

  · sheet 'Instructions': no header row detected — skipped
  · sheet 'Patient Register': header row 5, 3 data rows, 19 columns → register
  · sheet 'Home Visits':      header row 5, 4 data rows,  9 columns → visits
  · sheet 'Hospital Referrals': header row 5, 2 data rows, 10 columns → referrals
  · sheet 'Field Dictionary': documentation

Patients staged:   3
Visits staged:     4
Referrals staged:  2
Clean records:     3
Errors / warnings: 0 / 0
Duplicate flags:   0
```

The browser wizard was then verified against the produced JSON: 3 rows detected, 3 ready, all
ministry areas resolved, 3 patients created, audit entry written, reconciliation text generated.

Artifacts: `examples/lomamo_master.json`, `examples/reconciliation.md`.

---

## 7. AI assistance without exposure

The assistant may help explain unfamiliar column headings, suggest a mapping, describe a sheet, or
propose a validation rule. It does so through the **local** model only (Ollama on `localhost`), and
it never decides how an ambiguous clinical or financial field is interpreted — uncertain mappings
are shown to a human reviewer in the wizard.

With the local model unavailable, the assistant falls back to deterministic, rule-based answers over
scoped data. Nothing is sent anywhere.
