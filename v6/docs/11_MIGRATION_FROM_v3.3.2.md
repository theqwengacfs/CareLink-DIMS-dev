# 11 · Migration from CareLink DDMS v3.3.2

## 1. What v3.3.2 contains

From the supplied system image and handover document:

- a working application stack with launchers;
- 55 routes, 20 API endpoints;
- database schema at revision 332;
- 114 clinical conditions and 334 drugs in the case-manager catalogue;
- a single administrative login model with branch selection;
- the Medical Case Manager offline prototype (`medical.admin` / branch selection).

The release hash recorded in the handover is `bc678576…`.

## 2. What is preserved

| Capability | Status in v4.0 |
|---|---|
| Patient register and clinical categories | Preserved; 114 conditions remain available as a configurable list |
| Drug catalogue (334 entries) | Preserved as reference data for the Medical Case Manager console |
| Branch / ministry-area structure | Preserved and generalised (Kisumu 7 areas, Homa Bay configurable) |
| Case-manager workflows | Re-implemented as services with capability checks; screens are replaceable |
| Audit concept | Strengthened to an append-only hash chain |
| Reporting | Rebuilt around documented indicators, periods and versions |

## 3. What changes deliberately

| v3.3.2 behaviour | v4.0 behaviour | Reason |
|---|---|---|
| Users could reach other departments' consoles | Capability + county + area + assignment enforcement in the data layer | The core defect being corrected |
| One administrative account with broad reach | Twenty scoped role templates; no clinical authority for the system administrator | Least privilege |
| Branch visibility by page | Row-level scoping | Security |
| Reports without stated definitions | Every indicator defined, dated and versioned | Accountability |
| LocalStorage-only persistence with no restore discipline | Explicit backup, verification, dual-approval restore | Recoverability |
| Case-manager console treated as the system | Case-manager console is one module of an operating system | Extensibility |

## 4. Migration sequence

### Phase 0 — Protect (before touching anything)
1. Copy the entire v3.3.2 directory to an archive volume. Record the release hash.
2. Export the v3.3.2 database to a read-only snapshot.
3. Verify a restore of the snapshot into a scratch environment.
4. Record the current schema revision (332) and application version.

### Phase 1 — Reconcile the master workbook
1. Obtain the authoritative master patient workbook.
2. Run the offline engine:
   ```bash
   python3 tools/import_engine.py --workbook MASTER.xlsx \
       --out lomamo_master.json --report reconciliation.md \
       --db-json v332-patients-export.json
   ```
3. Resolve every `duplicate_*` flag by hand. Expect the bulk of the work here: historical registers
   accumulate duplicates, and guessing merges real people.
4. Resolve every `error` (missing name, unrecognised ministry area, missing intake date).
5. Circulate the reconciliation report to the Medical Case Manager and M&E before importing.

### Phase 2 — Commission v4.0
1. Complete first-run setup and role configuration (doc 10 §4).
2. Create the County Office Administrators.
3. Run the Security self-test — it must be 13/13 before real data enters.
4. Create a verified baseline backup.

### Phase 3 — Import
1. Load `lomamo_master.json` in **Master data import**.
2. Confirm the detected mapping on screen. Do not accept a mapping you cannot explain.
3. Preview every row. Choose per-row decisions for flagged records.
4. Commit. The system creates a pre-import backup and writes the audit entry.
5. Export the reconciliation summary and file it.

### Phase 4 — Verify
1. Clinical verification of every imported record (`docsVerified` is `false` until reviewed).
2. Compare five controls against v3.3.2: active caseload, month-to-date discharges, hospital requests
   open, foodbags issued, and the expenditure total for the last closed month.
3. Investigate every variance greater than 1%. Document the explanation.
4. Generate the first Monday report set and check the caseload calculation reconciles.

### Phase 5 — Parallel run
Run both systems for two weeks. Reconcile weekly. Do not retire v3.3.2 until two consecutive weeks
reconcile within tolerance and the Medical Case Manager has signed off the clinical data.

### Phase 6 — Retire
1. Freeze v3.3.2 read-only.
2. Archive the database, the export, the reconciliation reports and the release hash.
3. Record the cut-over date in the v4.0 audit trail as a system note.

## 5. Rollback

Until Phase 6, rollback is: stop using v4.0, continue in v3.3.2, and import nothing further. Because
v4.0 never writes to v3.3.2, the old system is untouched throughout the parallel run. After Phase 6,
rollback means restoring the archived v3.3.2 snapshot — which is why the archive must be verified
before retirement, not after.

## 6. Field mapping notes

| v3.3.2 concept | v4.0 location | Note |
|---|---|---|
| Patient clinical categories (114) | `patient.clinical.diagnosis` reference list | Configuration, not code |
| Drug catalogue (334) | Medical Case Manager reference data | Not yet surfaced in a prescribing UI — deliberately: the DDMS is not a prescribing system |
| Branch | County office + ministry area | Two levels, not one |
| Case manager role | Medical Case Manager | Gained explicit clinical capabilities; lost access to HR and welfare records |
| Admin login | Chief System Administrator **plus** County Office Administrators | Administrative authority no longer implies clinical authority |

## 7. Data that must not be migrated

- Any password, hash or credential in a format that cannot be re-hashed under the new policy.
- Any patient photograph without a recorded consent, unless the Media & Governance function reviews
  and records a lawful basis.
- Any "test" or "demo" patient that has leaked into a production register. Identify and exclude them
  during Phase 1 rather than importing them and deleting later.
