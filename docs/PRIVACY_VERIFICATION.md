# Privacy verification: findings, missing evidence and limited checks

The privacy tool has two deliberately different scopes. Neither running the app
nor passing its functional tests is privacy certification. Never commit a real
patient workbook, extracted identity list, sensitive reference document or a
report containing patient data.

## What the result means

| Result | Meaning | Exit code |
|---|---|---|
| `CLEAN` | All **defined full-scope** checks ran and passed, including comparison against the supplied/recovered authorised identity source. | `0` |
| `REPOSITORY CHECKS PASSED` | Explicit `--repository-only` scope passed. The identity comparison **did not run**; this is not full clearance. | `0` |
| `NOT CLEAN` | A required check failed (for example, a matched identifier, unsafe archive, or repository-policy violation). | `1` |
| `BLOCKED` | A required check could not run: missing/unusable workbook, missing Excel reader, inaccessible Git metadata, or shallow history. This is **not a detected leak** and **not clearance**. | `2` |

CLI usage errors also exit `2`. If failed and blocked checks coexist, the result
is `NOT CLEAN` / exit `1`; the blockers remain visible in the report. No missing
source is converted into a passed identity comparison.

The original `NOT CLEAN` message conflated a missing workbook with a failed
privacy check. The default now reports `BLOCKED` for that case and still returns
a nonzero exit code. No patient workbook has been fabricated, retrieved from a
live system, or replaced by a demo file to obtain a green result.

## Independent repository checks

These need Python 3 and Git, not the private workbook or Excel reader:

```bash
npm run privacy:repository
# Machine-readable equivalent:
python3 v6/tools/verify_no_patient_data.py --repository-only --json
```

This checks the master-workbook path in HEAD/current checkout and reachable Git
history, published equipment-register structure, seeded contact conventions,
tracked root workbooks, and the existing text/ZIP identifier patterns. It does
not read a workbook, even if `CARELINK_PRIVACY_WORKBOOK` is set. `--workbook` and
`--repository-only` cannot be supplied together.

This mode is useful for everyday development. It is **not a substitute for the
full release check** when that check is required. Do not silently replace a
full-check CI/release command with this limited command to bypass a blocker.

## Full identity comparison — authorised private source required

Use the original authorised master, not the public blank import template or a
synthetic evaluation dataset. The reader checks for all expected master-area
and Waiting List sheets and a nonempty usable identity corpus. These schema
checks prevent accidental substitution; they cannot establish provenance, so
the operator must still confirm that this is the authorised source.

The workbook is intentionally absent from this public checkout. Obtain it only
through an approved private channel and place it in ephemeral `/tmp` storage.
Do not paste patient details into chat or store the workbook in Git. There is no
application or production-database reset involved in this operation.

Install the optional reader outside the checkout, avoiding system-Python or
public-repository changes:

```bash
python3 -m venv /tmp/carelink-privacy-env
/tmp/carelink-privacy-env/bin/python -m pip install -r v6/tools/requirements-privacy.txt
/tmp/carelink-privacy-env/bin/python v6/tools/verify_no_patient_data.py \
  --workbook /tmp/authorised-master.xlsx
```

Use `--json` when a machine-readable result is needed. If a wrapper invokes the
verifier without arguments, the same private path can be supplied for that run
through `CARELINK_PRIVACY_WORKBOOK`; an explicit `--workbook` takes precedence.
Never store a real workbook or a derived identity list in the environment.

```bash
CARELINK_PRIVACY_WORKBOOK=/tmp/authorised-master.xlsx \
  /tmp/carelink-privacy-env/bin/python v6/tools/verify_no_patient_data.py --json
```

The tool parses only a uniquely owned, mode-0600 temporary staging copy outside
the checkout and removes it immediately after extraction, on success or reader
failure. Git-history recovery uses binary-safe reads and the same private
staging/cleanup rules. Extracted patient identities remain in memory only and
are never included as match values in the result JSON. Secret-match values
are not echoed into that JSON either. Reports still name affected files, so
review their paths/metadata before sharing a report; filenames can themselves
be sensitive.

**The caller-owned original is not automatically deleted.** After the check,
purge that `/tmp` source through the approved ephemeral-storage cleanup process.
Do not retain it in downloads, shared storage, test fixtures or release
artifacts. Deleting a local file is not a guarantee of forensic erasure on a
persistent disk; use the organisation's storage controls.

Without the authorised source, the default full command is correctly blocked.
There is no code-only way to prove equality/absence against an unknown identity
corpus. Repository-only results may be reported as limited evidence, never as
“100% privacy cleared.”

## JSON contract (schema version 2)

The command emits one JSON document, without a diagnostic preamble. Each check
has a `status` of `passed`, `failed`, `blocked` or `skipped`. The legacy `ok` field
is `true`, `false` or `null` respectively; blocked/skipped checks are never OK.
Top-level `status`, `scope`, `complete`, `identity_sweep`, `failed_checks`,
`blocked_checks` and `exit_code` make the result explicit.

For **full clearance**, require exit `0` **and all** of:

```json
{
  "scope": "full",
  "status": "passed",
  "complete": true,
  "clean": true,
  "full_clearance": true,
  "identity_sweep": { "status": "passed" }
}
```

A successful repository-only result intentionally has `complete:false`,
`clean:false`, `full_clearance:false` and `identity_sweep.status:"not_run"`.
Exit `0` alone must not be presented as full certification when limited scope
was requested. Existing history-purge guards still call the default full check
and refuse both exit `1` and exit `2`.

## Coverage limits and regression tests

The known-identity sweep and identifier patterns inspect working-tree text and
text members of ZIP archives. They are not OCR or a full content inspection of
PDF, Word, image, encrypted or other binary documents. The history guard checks
the named workbook path in locally reachable history; it is not an exhaustive
scan of every historical blob, hidden pull-request ref or remote artifact.
Full Git history is required for that defined path-absence check; a shallow
clone cannot be certified merely because it lacks older objects.

```bash
npm run test:privacy-verifier
npm run test:all
```

The regression tests use isolated synthetic fixtures only. They cover missing
sources/readers, valid JSON, strict scope/exit semantics, known positive matches,
empty name/phone subsets, Excel numeric/international phone formats, unsafe
archives, shallow/unavailable Git metadata, binary history recovery, private
staging cleanup, and rejection of empty/demo comparison sources. The optional
real synthetic-XLSX round trip runs when the Excel reader is installed; the
remaining unit tests need only the standard library. A synthetic fixture test
result never certifies the actual repository against real patients.
