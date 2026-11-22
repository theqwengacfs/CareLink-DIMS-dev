#!/usr/bin/env python3
"""Repository privacy checks and an optional-source, known-identity comparison.

The default full check requires the authorised patient workbook. Missing
comparison evidence is BLOCKED, not a detected leak and never a clean sweep.
--repository-only explicitly runs the independent repository checks; it cannot
grant full clearance. These checks have defined coverage, not a universal proof
that no possible personal information exists.

It works in passes:

  PASS 1 - identities.  Reads the master workbook (from a path you give it, or
           from Git history if the file was removed from the working tree) and
           extracts every patient identity: a name on a row that also carries a
           date in column I, plus every telephone number in the Waiting List.
           A name that is only two tokens of the demo name pools is still
           treated as an identity - the check is deliberately strict.

  PASS 2 - the sweep.   Scans every text file in the working tree and the
           contents of every ZIP archive for those identities and numbers, and
           reports the files that match.

  PASS 3 - secrets.     Scans the same ground again for what a patient-identity
           sweep cannot see: vehicle registration plates, chassis numbers,
           handset IMEIs, and telephone numbers outside the demo band. The
           October 2026 inventory workbooks published all of these; see
           v6/docs/23_INVENTORY_REDACTION.md.

  PASS 4 - the register. Reads v6/src/inventory_data.js and asserts, row by
           row, that it carries structure and nothing else: no monetary value,
           no device identifier, no person used as a location, no narrative note
           mistaken for an item, and the count templates still present.

  PASS 5 - conventions. Seeded contact details use only reserved synthetic
           ranges (07001 patient, 07003 staff, 07005 roster) and @lomamo.example.
           Actual official work mailboxes live only in the Chief-attested
           server register; source aliases never prove a mailbox exists.

  PASS 6 - the files.   No Administration workbook may be tracked at the
           repository root. The blank demo-only import template under
           v6/examples is the one spreadsheet this repository publishes.

It also checks Git history for the workbook path, so "removed from the working
tree" is never mistaken for "removed from the repository".

Usage:
    python3 v6/tools/verify_no_patient_data.py
    python3 v6/tools/verify_no_patient_data.py --workbook /tmp/authorised-master.xlsx
    python3 v6/tools/verify_no_patient_data.py --repository-only --json

Exit 0: the explicitly requested scope passed. Only a FULL result with
        clean=true / full_clearance=true includes the identity comparison.
Exit 1: a required repository/identity check failed.
Exit 2: a required check is BLOCKED (missing source/reader/history), or CLI error.
The default and history-purge guards remain fail-closed. JSON stdout contains
only JSON; reports never include the extracted identities or phone values.

PASS 1 requires openpyxl; see requirements-privacy.txt. Other passes use the
standard library. Private staging copies are removed immediately after reading;
a user-supplied original remains the user's responsibility to purge.
"""
from __future__ import annotations

import argparse
import datetime
import json
import os
import re
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKBOOK_NAME = "20260101 LOMAMO registration patients 2026 (1).xlsx"
AREA_SHEETS = ["Manyatta ", "Nyahera", "Nyalenda", "Ombeyi", "Nairobi Road", "Ahero", "Chiga"]
NOT_NAMES = {"manyatta", "nyahera", "nyalenda", "ombeyi", "nairobi road", "ahero", "chiga",
             "homabay", "waiting list", "total", "new", "basic", "name patient"}
BINARY_EXT = {"xlsx", "xls", "pdf", "docx", "doc", "png", "jpg", "jpeg", "webp", "gif", "zip", "gz", "bundle"}

# --------------------------------------------------------------------------
# PASS 3 - organisational secrets.
#
# The patient sweep above was not enough. The October 2026 inventory workbooks
# published vehicle registration plates, chassis numbers, handset IMEIs, staff
# SIM numbers, asset values and which member of staff carries which device.
# None of that is patient data, so a patient-identity sweep walked straight
# past it. These patterns are the ones that should have caught it.
# --------------------------------------------------------------------------
SECRET_PATTERNS = {
    "vehicle registration plate": re.compile(r"\bK[A-Z]{2}\s?\d{3}\s?[A-Z]\b"),
    "handset IMEI": re.compile(r"\b3\d{14}\b"),
    "mobile number outside the demo band": re.compile(
        r"\b(?:0|\+?254)?7[1-9]\d{7}\b|\b01\d{8}\b"),
    "chassis or VIN": re.compile(r"chassis[^A-Z0-9]{0,14}[A-HJ-NPR-Z0-9]{11,}", re.I),
    "landline or subscriber number": re.compile(r"\b0\d{8,9}\b"),
}
# Invented on purpose, documented in the source, and impossible to mistake for
# a real identifier: the demo fleet in v6/src/data.js and the PRNG constants.
SECRET_ALLOWLIST = {
    "KDX 001A", "KDG 442B", "KCC 887C",        # demo vehicles, data.js FLEET seed
    "1013904223", "2654435761",                # linear-congruential constants
    # Fixtures in the acceptance suites. They are invented numbers used to prove
    # that MESSAGING.screen and the referral form REFUSE contact details; the
    # control only means something if the fixture has a real number's shape.
    "0712345678", "0112345678", "254712345678", "0722111222",
}
# Files that quote the patterns in order to detect them.
# Only the two tools that carry the patterns themselves are skipped. The
# documentation is held to the same standard as the code: a document that quotes
# a plate or an IMEI re-publishes it, so this verifier would flag its own
# runbook. That is deliberate.
SECRET_SKIP = {"v6/tools/verify_no_patient_data.py", "v6/tools/redact_inventory.py"}
# The demo estate owns these bands. Anything seeded for a person must sit in
# one of them, so a fabricated record can never carry a real identifier.
DEMO_PHONE = re.compile(r"^0700[135]\d{5}$")
DEMO_EMAIL_DOMAINS = ("@lomamo.example",)
# Staff mailboxes are recorded by explicit Chief attestation in the server DB,
# never seeded or allow-listed as supposedly deliverable addresses in source.
ACCOUNT_ALIAS_EMAILS: set[str] = set()

INTERNAL_TAG = re.compile(r"^(?:LMM|LMMK)[A-Z0-9/\-]*$")


def sh(args: list[str], **kw) -> subprocess.CompletedProcess:
    return subprocess.run(args, cwd=ROOT, capture_output=True, text=True, **kw)


class VerificationBlocked(RuntimeError):
    """A required check cannot run; this is not evidence of a privacy leak."""


def git_text(args: list[str]) -> str:
    try:
        result = sh(["git", *args])
    except (OSError, UnicodeError) as exc:
        raise VerificationBlocked("Git metadata is unavailable or unreadable; history cannot be verified.") from exc
    if result.returncode:
        raise VerificationBlocked("Git could not inspect this checkout; history cannot be verified.")
    return result.stdout


def private_workbook(data: bytes) -> Path:
    """Create an owned, mode-0600 staging file outside the checkout."""
    tmpdir = Path(tempfile.gettempdir()).resolve()
    if tmpdir == ROOT.resolve() or ROOT.resolve() in tmpdir.parents:
        raise VerificationBlocked("Use an ephemeral temporary directory outside the checkout.")
    fd, name = tempfile.mkstemp(prefix="carelink-identity-", suffix=".xlsx", dir=tmpdir)
    target = Path(name)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
    except BaseException:
        target.unlink(missing_ok=True)
        raise
    return target


def workbook_from_history() -> Path | None:
    """Recover binary bytes, skipping deletion commits. Caller owns cleanup."""
    commits = git_text(["log", "--all", "--format=%H", "--", WORKBOOK_NAME]).split()
    for commit in commits:
        raw = subprocess.run(["git", "cat-file", "blob", f"{commit}:{WORKBOOK_NAME}"],
                             cwd=ROOT, capture_output=True, check=False)
        if raw.returncode == 0:
            return private_workbook(raw.stdout)
    return None


def normalise_phone(value) -> str:
    if isinstance(value, float) and value.is_integer():
        value = int(value)  # Excel numeric cells must not acquire an extra '.0'.
    digits = re.sub(r"\D", "", str(value or ""))
    if len(digits) == 12 and digits.startswith("254"):
        return digits[3:]
    if 8 <= len(digits) <= 10:
        return digits[-9:]
    return ""


def extract_identities(path: Path) -> tuple[set[str], set[str]]:
    """Read an authorised staging copy. Never print private data/diagnostics."""
    if not path.is_file() or path.stat().st_size < 1024:
        raise VerificationBlocked("The supplied workbook is missing or truncated; no identity comparison ran.")
    try:
        import openpyxl  # noqa: WPS433 - optional dependency, imported late
    except ImportError as exc:
        raise VerificationBlocked("Workbook reader unavailable. Install v6/tools/requirements-privacy.txt into a private temporary environment.") from exc
    import warnings
    wb = None
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            wb = openpyxl.load_workbook(str(path), data_only=True, read_only=True)
        sheets = {name.strip().casefold(): name for name in wb.sheetnames}
        required = [*AREA_SHEETS, "Waiting List"]
        if any(name.strip().casefold() not in sheets for name in required):
            raise VerificationBlocked("The supplied file lacks required master-workbook sheets; a blank/demo template or partial workbook cannot certify this comparison.")
        names: set[str] = set()
        phones: set[str] = set()
        for sheet in AREA_SHEETS:
            ws = wb[sheets[sheet.strip().casefold()]]
            for row in ws.iter_rows(min_row=4, max_col=9, values_only=True):
                name, date_in = row[0], row[8]
                if isinstance(name, str) and isinstance(date_in, (datetime.datetime, datetime.date)):
                    n = " ".join(name.split())
                    if n.casefold() not in NOT_NAMES and 6 <= len(n) <= 120 and len(n.split()) >= 2:
                        names.add(n)
        ws = wb[sheets["waiting list"]]
        for row in ws.iter_rows(min_row=3, max_col=2, values_only=True):
            name, phone = row[0], row[1]
            if isinstance(name, str) and len(name.split()) >= 2 and name.casefold().strip() not in NOT_NAMES:
                names.add(" ".join(name.split()))
            digits = normalise_phone(phone)
            if digits:
                phones.add(digits)
        if not (names or phones):
            raise VerificationBlocked("No usable comparison identities were extracted; an empty corpus is not a clean sweep.")
        return names, phones
    except VerificationBlocked:
        raise
    except Exception as exc:
        raise VerificationBlocked(f"The workbook could not be inspected ({type(exc).__name__}); no identity comparison ran.") from exc
    finally:
        if wb is not None:
            wb.close()


def identity_patterns(names: set[str], phones: set[str]):
    """An empty side must match NOTHING, never every word boundary."""
    name_parts = [r"\s+".join(re.escape(part) for part in n.split()) for n in sorted(names) if n.strip()]
    name_rx = re.compile(r"(?<!\w)(?:" + "|".join(name_parts) + r")(?!\w)", re.I) if name_parts else re.compile(r"(?!)")
    phone_parts = [r"[\s().-]*".join(map(re.escape, p)) for p in sorted(phones) if p]
    phone_rx = re.compile(r"(?<!\d)(?:(?:\+?254|0)[\s().-]*)?(?:" + "|".join(phone_parts) + r")(?!\d)") if phone_parts else re.compile(r"(?!)")
    return name_rx, phone_rx


def staff_names() -> set[str]:
    """Names that legitimately appear in the repository: the official roster."""
    out = set()
    src = ROOT / "v6" / "src"
    for f in ("data6.js", "org_teams.js", "portal_content.js"):
        p = src / f
        if p.exists():
            txt = p.read_text(encoding="utf-8")
            out |= {" ".join(m.split()).casefold() for m in re.findall(r"name:\s*'([^']+)'", txt)}
            out |= {" ".join(m.split()).casefold() for m in re.findall(r"\{ name:'([^']+)'", txt)}
    return out


def iter_text_files():
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in {".git", "node_modules", "__pycache__"}]
        for fn in filenames:
            ext = fn.lower().rsplit(".", 1)[-1] if "." in fn else ""
            if ext in BINARY_EXT:
                continue
            yield Path(dirpath) / fn


def scan_zip(path: Path, name_rx, phone_rx):
    hits = {"names": 0, "phones": 0, "files": 0, "inner_xlsx": []}
    try:
        with zipfile.ZipFile(path) as z:
            for info in z.infolist():
                if info.is_dir():
                    continue
                inner = Path(info.filename)
                if inner.suffix.lower() in {".xlsx", ".xls"}:
                    hits["inner_xlsx"].append(info.filename)
                    continue
                if inner.suffix.lower().lstrip(".") in BINARY_EXT:
                    continue
                try:
                    txt = z.read(info).decode("utf-8", errors="ignore")
                except Exception as exc:
                    hits["error"] = type(exc).__name__  # no private member content in diagnostics
                    continue
                hits["files"] += 1
                hits["names"] += len(name_rx.findall(txt))
                hits["phones"] += len(phone_rx.findall(txt))
    except Exception as exc:  # unreadable archive is reported, not skipped silently
        hits["error"] = type(exc).__name__
    return hits


# --------------------------------------------------------------------------
# PASS 3 - the sweep for organisational secrets
# --------------------------------------------------------------------------
STAFF_TOKENS = {
    "washington", "ashar", "catherine", "denis", "daniel", "julia", "julie",
    "martin", "musa", "moses", "oscar", "evans", "wickliffe", "wicklyff",
    "john", "irene", "iscah", "millicent", "caroline", "maureen", "chamah",
    "otieno", "odhiambo", "omondi", "obila", "lubalo", "wayodi", "oguta",
    "omolo", "odero", "onyango", "achieng", "abuto", "nyanjong", "atieno",
    "awuor", "anyango", "shikuku", "mildred", "naphtaly", "oduja", "mito",
    "mcclanahan",
}


def _hits(txt: str) -> dict:
    out = {}
    for label, rx in SECRET_PATTERNS.items():
        found = [m.group(0).strip() for m in rx.finditer(txt)]
        found = sorted({h for h in found
                        if h not in SECRET_ALLOWLIST and not DEMO_PHONE.match(h)})
        if found:
            out[label] = found[:4]
    return out


def scan_secrets() -> tuple[list[dict], int, list[str]]:
    """Separate actual pattern matches from inputs that could not be read."""
    offenders, scanned, errors = [], 0, []
    for f in iter_text_files():
        rel = str(f.relative_to(ROOT))
        if rel in SECRET_SKIP:
            continue
        try:
            txt = f.read_bytes().decode("utf-8", errors="ignore")
        except OSError:
            errors.append(rel)
            continue
        scanned += 1
        h = _hits(txt)
        if h:
            offenders.append({"file": rel, **h})
    for f in ROOT.rglob("*.zip"):
        if any(part in {".git", "node_modules", "__pycache__"} for part in f.relative_to(ROOT).parts):
            continue
        rel = str(f.relative_to(ROOT)) + " (archive)"
        try:
            with zipfile.ZipFile(f) as z:
                for info in z.infolist():
                    if info.is_dir() or Path(info.filename).suffix.lower().lstrip(".") in BINARY_EXT:
                        continue
                    try:
                        txt = z.read(info).decode("utf-8", errors="ignore")
                    except Exception:
                        errors.append(rel)
                        continue
                    h = _hits(txt)
                    if h:
                        offenders.append({"file": rel, **h})
        except Exception:
            errors.append(rel)
    return offenders, scanned, sorted(set(errors))


def _field(row: str, name: str):
    m = re.search(name + r':(?:"((?:[^"\\]|\\.)*)"|(-?\d+))', row)
    if not m:
        return None
    return m.group(1) if m.group(1) is not None else int(m.group(2))


def inventory_structure() -> list[str]:
    """PASS 4 - the published register carries structure and nothing else."""
    fails: list[str] = []
    p = ROOT / "v6" / "src" / "inventory_data.js"
    if not p.exists():
        return ["v6/src/inventory_data.js is missing"]
    txt = p.read_text()
    m = re.search(r"const INVENTORY_SEED = \[(.*?)\n\];", txt, re.S)
    if not m:
        return ["INVENTORY_SEED not found in v6/src/inventory_data.js"]
    rows = re.findall(r"\{(.*?)\}", m.group(1), re.S)
    if len(rows) < 100:
        fails.append(f"only {len(rows)} register rows parsed - expected about 122")
    for i, r in enumerate(rows, 1):
        value = _field(r, "value")
        serial = _field(r, "serial")
        loc = _field(r, "loc") or ""
        item = _field(r, "item") or ""
        qty = _field(r, "qty")
        if value not in ("", None):
            fails.append(f"row {i} carries a monetary value (value redacted)")
        if serial and not INTERNAL_TAG.match(serial):
            fails.append(f"row {i} carries a device identifier (value redacted)")
        if re.fullmatch(r"\d+", item):
            fails.append(f"row {i} is a narrative note, not an item")
        if isinstance(qty, int) and qty >= 1000:
            fails.append(f"row {i} has an implausible quantity - a note row was read as an item")
        bad = [t for t in re.findall(r"[A-Za-z']+", loc) if t.lower() in STAFF_TOKENS]
        if bad:
            fails.append(f"row {i} locates an asset at a person (value redacted)")
    if "function inventorySeed(" not in txt:
        fails.append("inventorySeed() is missing - the register would render empty")
    for const in ("INVENTORY_CATEGORIES", "INVENTORY_SITES", "INVENTORY_REDACTION",
                  "INVENTORY_NOTES", "KITCHEN_CATALOG", "KITCHEN_COUNT_COLUMNS",
                  "SUPPLY_CATALOG", "SUPPLY_COUNT_COLUMNS", "INVENTORY_SOURCE"):
        if f"const {const}" not in txt:
            fails.append(f"{const} is missing - the workbook's structure was not carried over")
    return fails


EMAIL_RX = re.compile(r"\b[\w.+-]+@[\w-]+\.[A-Za-z]{2,}\b")
# Numeric contact values only: an SVG icon named `phone` is not a number.
# Match quoted/unquoted keys, spacing, both quote styles and mobile/contact too.
PHONE_LITERAL = re.compile(r"""(?:\b(?:phone|mobile|telephone|contact)\b|["'](?:phone|mobile|telephone|contact)["'])\s*:\s*(["'])([+\d][\d ()+.\-]{6,})\1""", re.I)
EMAIL_PUBLIC_OK = {"contactus@lovemattersmost.org"}


def contact_conventions() -> list[str]:
    """PASS 5 - every seeded person is reachable only in reserved space."""
    fails: list[str] = []
    for f in sorted((ROOT / "v6" / "src").glob("*.js")):
        txt = f.read_text()
        rel = f"v6/src/{f.name}"
        for _, n in PHONE_LITERAL.findall(txt):
            if not DEMO_PHONE.fullmatch(re.sub(r"\D", "", n)):
                fails.append(f"{rel} seeds a telephone number outside the demo band: {n!r}")
        for gen in re.findall(r"'07'\s*\+", txt):
            fails.append(f"{rel} still builds a number from '07' + a random range")
        for e in EMAIL_RX.findall(txt):
            if e in EMAIL_PUBLIC_OK or e in ACCOUNT_ALIAS_EMAILS:
                continue
            if not e.endswith(DEMO_EMAIL_DOMAINS):
                fails.append(f"{rel} seeds a mailbox on a live domain: {e!r}")
    return fails


def build_report(workbook: Path | None = None, *, repository_only: bool = False) -> dict:
    """Collect results without printing. A skipped/blocked check is never OK."""
    report = {
        "schema_version": 2,
        "repository": str(ROOT),
        "scope": "repository" if repository_only else "full",
        "checks": [],
        "scanned_files": 0,
        "identities": {"names": 0, "phones": 0},
        "identity_sweep": {"status": "not_run"},
        "coverage": {
            "working_tree": "UTF-8-readable text and text members of ZIP archives",
            "history": "workbook-path presence in all locally reachable Git history; not a deep historical-content scan",
            "binary_documents": "not a PDF/Word/image content inspection or universal PII detector",
        },
        "next_steps": [],
    }

    def add(name, status, detail="", *, group="repository"):
        assert status in {"passed", "failed", "blocked", "skipped"}
        report["checks"].append({
            "check": name, "status": status, "group": group,
            "ok": True if status == "passed" else False if status == "failed" else None,
            "detail": detail,
        })

    def checked(name, ok, detail="", *, group="repository"):
        add(name, "passed" if ok else "failed", detail, group=group)

    # --- History is an independent repository guard, even in limited scope. ---
    hist = None
    try:
        tree = git_text(["ls-tree", "-r", "HEAD", "--name-only"]).splitlines()
        checked("workbook absent from the working tree of HEAD", WORKBOOK_NAME not in tree,
                "still tracked in HEAD" if WORKBOOK_NAME in tree else "")
        hist = git_text(["log", "--all", "--oneline", "--", WORKBOOK_NAME]).strip()
        shallow_value = git_text(["rev-parse", "--is-shallow-repository"]).strip()
        if shallow_value not in {"true", "false"}:
            raise VerificationBlocked("Git could not establish whether this checkout has complete history.")
        shallow = shallow_value == "true"
        if hist:
            add("workbook absent from all Git history", "failed",
                f"reachable in {len(hist.splitlines())} commit(s); use the owner-reviewed purge runbook")
        elif shallow:
            add("workbook absent from all Git history", "blocked",
                "This is a shallow clone; missing local history cannot prove absence. Fetch complete history before certification.")
        else:
            add("workbook absent from all Git history", "passed")
    except VerificationBlocked as exc:
        add("repository history can be inspected", "blocked", str(exc))
    checked("master workbook absent from the current checkout", not (ROOT / WORKBOOK_NAME).exists(),
            "Private workbooks belong in ephemeral storage, never this public checkout.")

    source_check = "identities extracted from the authorised workbook"
    file_check = "no patient identity in any working-tree file"
    archive_check = "no patient identity inside any archive"
    if repository_only:
        reason = "Not requested in --repository-only mode; no workbook was read and no identity comparison ran."
        for check in (source_check, file_check, archive_check):
            add(check, "skipped", reason, group="identity")
        report["identity_sweep"] = {"status": "not_run", "reason": reason}
        report["next_steps"].append("Full clearance still requires the default full check with the authorised workbook.")
    else:
        names, phones = set(), set()
        staged = None
        try:
            try:
                if workbook is not None:
                    source = Path(workbook).expanduser().resolve()
                    if source == ROOT.resolve() or ROOT.resolve() in source.parents:
                        raise VerificationBlocked("Keep the authorised workbook outside the public checkout, in ephemeral /tmp storage.")
                    if not source.is_file():
                        raise VerificationBlocked("The supplied workbook path is not a readable file; no identity comparison ran.")
                    staged = private_workbook(source.read_bytes())
                elif (ROOT / WORKBOOK_NAME).is_file():
                    staged = private_workbook((ROOT / WORKBOOK_NAME).read_bytes())
                elif hist:
                    staged = workbook_from_history()
                if staged is None:
                    raise VerificationBlocked(
                        "The authorised master workbook is unavailable. No patient-identity comparison ran. "
                        "Supply the original with --workbook /tmp/authorised-master.xlsx; do not substitute a demo template.")
                names, phones = extract_identities(staged)
            finally:
                # Delete only this tool's uniquely owned copy, including on read
                # failure. Never silently delete a caller-owned source file.
                if staged is not None:
                    staged.unlink(missing_ok=True)
            roster_names = staff_names()
            names = {n for n in names if n.casefold() not in roster_names}
            if not (names or phones):
                raise VerificationBlocked("No usable patient identities remain after roster exclusions; an empty comparison cannot grant clearance.")
        except (VerificationBlocked, OSError, UnicodeError) as exc:
            reason = str(exc) if isinstance(exc, VerificationBlocked) else "A required identity source, roster exclusion or staging file could not be read/removed; no clearance is granted."
            for check in (source_check, file_check, archive_check):
                add(check, "blocked", reason, group="identity")
            report["identity_sweep"] = {"status": "blocked", "reason": reason}
            report["next_steps"].append("Use an authorised source outside Git. See docs/PRIVACY_VERIFICATION.md for private dependency/setup and cleanup steps.")
        else:
            report["identities"] = {"names": len(names), "phones": len(phones)}
            add(source_check, "passed", f"{len(names)} patient names, {len(phones)} telephone numbers; values not logged", group="identity")
            name_rx, phone_rx = identity_patterns(names, phones)
            offenders, scan_errors, scanned = [], [], 0
            for f in iter_text_files():
                try:
                    txt = f.read_bytes().decode("utf-8", errors="ignore")
                except OSError:
                    scan_errors.append(str(f.relative_to(ROOT)))
                    continue
                scanned += 1
                n, p = len(name_rx.findall(txt)), len(phone_rx.findall(txt))
                if n or p:
                    offenders.append({"file": str(f.relative_to(ROOT)), "names": n, "phones": p})
            file_status = "failed" if offenders else "blocked" if scan_errors else "passed"
            add(file_check, file_status,
                f"{scanned} files scanned; {len(offenders)} matching file(s); {len(scan_errors)} unreadable file(s). " +
                ", ".join(o["file"] for o in offenders[:6]), group="identity")
            if offenders and scan_errors:
                add("all identity-sweep text inputs readable", "blocked",
                    f"{len(scan_errors)} input(s) unreadable in addition to the reported matches.", group="identity")
            zip_offenders, zip_errors = [], []
            for f in ROOT.rglob("*.zip"):
                if any(part in {".git", "node_modules", "__pycache__"} for part in f.relative_to(ROOT).parts):
                    continue
                h = scan_zip(f, name_rx, phone_rx)
                if h.get("error"):
                    zip_errors.append(str(f.relative_to(ROOT)))
                if h.get("names") or h.get("phones") or h.get("inner_xlsx"):
                    zip_offenders.append({"file": str(f.relative_to(ROOT)), "names": h["names"], "phones": h["phones"],
                                          "workbooks": len(h["inner_xlsx"])})
            zip_status = "failed" if zip_offenders else "blocked" if zip_errors else "passed"
            add(archive_check, zip_status,
                f"{len(zip_offenders)} matching/unsafe archive(s); {len(zip_errors)} unreadable archive(s). " + json.dumps(zip_offenders[:4]), group="identity")
            if zip_offenders and zip_errors:
                add("all identity-sweep archive inputs readable", "blocked",
                    f"{len(zip_errors)} archive(s) unreadable in addition to the reported findings.", group="identity")
            report["scanned_files"] = scanned
            report["identity_sweep"] = {"status": "failed" if "failed" in (file_status, zip_status) else
                                        "blocked" if "blocked" in (file_status, zip_status) else "passed"}

    # --- Independent organisational, inventory, contact and file checks. ---
    offenders, secret_scanned, secret_errors = scan_secrets()
    secret_status = "failed" if offenders else "blocked" if secret_errors else "passed"
    add("no vehicle plate, IMEI, chassis number or live-range telephone number in any file or archive", secret_status,
        f"{secret_scanned} text files scanned; {len(offenders)} matching input(s); {len(secret_errors)} unreadable input(s). " + "; ".join(
            f"{o['file']} ({', '.join(k for k in o if k != 'file')})" for o in offenders[:5]))
    if offenders and secret_errors:
        add("all organisational-identifier scan inputs readable", "blocked",
            f"{len(secret_errors)} input(s) unreadable in addition to the reported matches.")
    # Report locations/types, never actual secret match values. Paths themselves
    # may be sensitive; an operator must still review a report before sharing it.
    report["secret_scan"] = [{"file": o["file"], "types": [k for k in o if k != "file"]} for o in offenders[:10]]
    report["secret_scan_errors"] = secret_errors[:10]
    report["secret_scanned_files"] = secret_scanned
    inventory_check = "the published equipment register carries structure only"
    try:
        inv_fails = inventory_structure()
    except (OSError, UnicodeError):
        add(inventory_check, "blocked", "The published equipment register could not be read.")
    else:
        checked(inventory_check, not inv_fails, "; ".join(inv_fails[:5]) if inv_fails else
                "no values, no device identifiers, no person as a location, no note rows")
    contact_check = "every seeded person is reachable only in reserved space"
    try:
        contact_fails = contact_conventions()
    except (OSError, UnicodeError):
        add(contact_check, "blocked", "A seeded-contact source could not be read.")
    else:
        checked(contact_check, not contact_fails,
                f"{len(contact_fails)} seeded-contact convention violation(s); inspect the local source" if contact_fails else
                "patient/staff/roster phones in 07001/07003/07005; synthetic mail at @lomamo.example")
    try:
        tracked = git_text(["ls-files"]).splitlines()
        rooted = [t for t in tracked if t.lower().endswith((".xlsx", ".xls")) and "/" not in t]
        checked("no Administration workbook is tracked at the repository root", not rooted,
                ", ".join(rooted) if rooted else "structure only; the files stay on the office host")
    except VerificationBlocked as exc:
        add("no Administration workbook is tracked at the repository root", "blocked", str(exc))

    statuses = [c["status"] for c in report["checks"]]
    report["failed_checks"] = statuses.count("failed")
    report["blocked_checks"] = statuses.count("blocked")
    report["status"] = "failed" if report["failed_checks"] else "blocked" if report["blocked_checks"] else "passed"
    report["complete"] = not repository_only and not any(s in {"skipped", "blocked"} for s in statuses)
    report["repository_checks_passed"] = all(c["status"] == "passed" for c in report["checks"] if c["group"] == "repository")
    report["clean"] = report["full_clearance"] = report["complete"] and report["status"] == "passed"
    report["exit_code"] = 1 if report["failed_checks"] else 2 if report["blocked_checks"] else 0
    return report


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Defined repository privacy checks; full clearance requires the authorised identity source.")
    scope = ap.add_mutually_exclusive_group()
    scope.add_argument("--workbook", type=Path, help="authorised master in ephemeral /tmp (or CARELINK_PRIVACY_WORKBOOK; otherwise local/history source)")
    scope.add_argument("--repository-only", action="store_true", help="limited independent repository checks; never grants patient-identity clearance")
    ap.add_argument("--json", action="store_true", help="one machine-readable JSON document, no diagnostic preamble")
    args = ap.parse_args(argv)
    workbook = args.workbook
    if not args.repository_only and workbook is None and os.environ.get("CARELINK_PRIVACY_WORKBOOK"):
        workbook = Path(os.environ["CARELINK_PRIVACY_WORKBOOK"])
    report = build_report(workbook, repository_only=args.repository_only)
    if args.json:
        print(json.dumps(report, indent=1))
    else:
        print(f"LOMAMO C-DIMS · privacy verification · scope: {report['scope']}")
        print("-" * 72)
        marks = {"passed": "ok", "failed": "FAIL", "blocked": "BLOCKED", "skipped": "NOT RUN"}
        for c in report["checks"]:
            print(f"  [{marks[c['status']]}] {c['check']}" + (f" — {c['detail']}" if c["detail"] else ""))
        print("-" * 72)
        if report["status"] == "failed":
            print("NOT CLEAN — failed checks above. Full clearance: NOT GRANTED.")
        elif report["status"] == "blocked":
            print("BLOCKED — required checks could not run. Full clearance: NOT GRANTED.")
            print("No failed checks in the completed work; missing evidence is not a detected leak.")
        elif report["clean"]:
            print("CLEAN — all defined full-scope checks completed. This is not a universal PII guarantee.")
        else:
            print("REPOSITORY CHECKS PASSED — identity comparison NOT RUN; this is NOT full privacy clearance.")
        for step in report["next_steps"]:
            print("Next: " + step)
    return report["exit_code"]


if __name__ == "__main__":
    sys.exit(main())
