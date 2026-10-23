#!/usr/bin/env python3
"""
LOMAMO Foundation Kenya — CareLink DIMS
Master Workbook Import Engine (offline)

Reads the organisation's master patient workbook (multi-sheet XLSX, XLS or CSV),
maps its columns onto the DIMS data model, detects duplicates, validates records
and produces:

  * lomamo_master.json   — a staged import package for the DIMS import wizard
  * reconciliation.md    — a human-readable reconciliation report

DESIGN RULES (non-negotiable):
  1. The workbook never leaves the device. No network calls exist in this file.
  2. The source file is opened read-only and is never modified.
  3. Ambiguous columns are reported for human mapping — never guessed silently.
  4. Duplicate detection uses identifiers where available; name similarity alone
     never merges or discards a record.
  5. Nothing is written to the live database by this script. It only stages.

Usage
-----
  python3 tools/import_engine.py --workbook "MASTER.xlsx" \
      --out lomamo_master.json --report reconciliation.md

  # compare against an existing DIMS export to catch cross-file duplicates
  python3 tools/import_engine.py --workbook MASTER.xlsx --db-json dims-export.json

Options
-------
  --workbook PATH     Source .xlsx / .xlsm / .csv
  --out PATH          JSON output (default: lomamo_master.json)
  --report PATH       Markdown reconciliation (default: reconciliation.md)
  --sheet NAME        Restrict to one worksheet (repeatable)
  --areas PATH        JSON file of ministry areas: [{"id":"nyalenda","name":"Nyalenda"}]
  --db-json PATH      Existing DIMS export for duplicate comparison
  --sample N          Only process the first N data rows per sheet
  --quiet             Suppress console progress
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import json
import os
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

try:
    from openpyxl import load_workbook
except ImportError:  # pragma: no cover
    load_workbook = None

VERSION = "1.0.0"

# ----------------------------------------------------------------------------
# 1. Reference configuration
# ----------------------------------------------------------------------------

# Ministry areas as configured in the DIMS. Override with --areas.
DEFAULT_AREAS = [
    {"id": "nyalenda",  "name": "Nyalenda",      "county": "kisumu"},
    {"id": "nairobird", "name": "Nairobi Road",  "county": "kisumu"},
    {"id": "manyatta",  "name": "Manyatta",      "county": "kisumu"},
    {"id": "ahero",     "name": "Ahero",         "county": "kisumu"},
    {"id": "ombeyi",    "name": "Ombeyi",        "county": "kisumu"},
    {"id": "chiga",     "name": "Chiga",         "county": "kisumu"},
    {"id": "nyahera",   "name": "Nyahera",       "county": "kisumu"},
    {"id": "makongeni", "name": "Makongeni",     "county": "homabay"},
    {"id": "sofia",     "name": "Sofia",         "county": "homabay"},
    {"id": "shauriyako","name": "Shauri Yako",   "county": "homabay"},
]

# Canonical patient fields and the header words that suggest them.
FIELD_RULES: Dict[str, List[str]] = {
    "name":        ["patientname", "fullname", "nameofpatient", "clientname", "name", "patient"],
    "code":        ["filenumber", "fileno", "patientnumber", "patientid", "code", "refno",
                    "registrationnumber", "lomamo id", "lomamoid", "id"],
    "area":        ["ministryarea", "area", "subcounty", "location", "branch", "centre",
                    "center", "village", "zone"],
    "ccc":         ["cccnumber", "cccno", "clinicnumber", "clinicno", "ccc", "artnumber"],
    "phone":       ["phonenumber", "telephone", "mobile", "contact", "phone", "tel"],
    "sex":         ["sex", "gender"],
    "age":         ["age", "ageyears", "years"],
    "dob":         ["dateofbirth", "dob", "birthdate"],
    "intake":      ["intakedate", "assessmentdate", "dateofassessment", "enrolmentdate",
                    "enrollmentdate", "registrationdate", "startdate", "datejoined"],
    "status":      ["status", "programmestatus", "patientstatus", "state"],
    "referral":    ["referralsource", "referredby", "referral", "source", "facility",
                    "hospital", "ccc referral"],
    "caregiver":   ["caregiver", "fieldofficer", "socialworker", "officer", "staff",
                    "worker", "assignedto"],
    "weight":      ["weightkg", "weight", "kgs", "mass"],
    "height":      ["heightcm", "height"],
    "diagnosis":   ["diagnosis", "condition", "clinicalconcern", "medicalcondition", "concern"],
    "children":    ["householdchildren", "noofchildren", "children", "dependants", "dependents"],
    "orphans":     ["orphanssupported", "childrenatrisk", "orphanprevention"],
    "guardian":    ["guardian", "guardianarrangement", "headofhousehold"],
    "discharge":   ["dischargedate", "exitdate", "dateofdischarge", "closure date"],
    "discharge_reason": ["dischargereason", "exitreason", "reasonforclosure", "outcome"],
    "visit_date":  ["visitdate", "dateofvisit", "date"],
    "visit_type":  ["visit type", "visittype", "type"],
    "outcome":     ["outcome", "visitoutcome", "result"],
    "notes":       ["notes", "comments", "observations", "remarks", "narrative"],
    "next_due":    ["nextvisitdue", "nextvisit", "followupdate", "duedate"],
    "bp":          ["bloodpressure", "bp"],
    "request_date": ["requestdate", "referraldate", "datereferred", "dateofreferral", "referral date"],
    "reason":      ["reasonforreferral", "referralreason", "reason", "presentingcomplaint"],
    "priority":    ["priority", "urgency"],
    "transport_required": ["transportrequired", "transportassistance", "transport"],
    "fare":        ["estimatedfare", "transportcost", "fare", "amount"],
}

REGISTER_REQUIRED = ["name"]
VISIT_LINK_FIELDS = ["code", "name"]

# Programme status vocabulary mapped onto DIMS states.
STATUS_MAP = [
    (r"discharg|exited|closed|completed", "discharged"),
    (r"await|verif|pending", "awaiting_verification"),
    (r"assess|new|referred", "digital_entered"),
    (r"activ|enrol|ongoing|open", "active"),
]

# ----------------------------------------------------------------------------
# 2. Helpers
# ----------------------------------------------------------------------------

def norm(s: Any) -> str:
    """Normalise a header or value for comparison."""
    if s is None:
        return ""
    return re.sub(r"[^a-z0-9]", "", str(s).strip().lower())


def clean(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, (dt.datetime, dt.date)):
        return v.isoformat()
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def parse_date(v: Any) -> Tuple[Optional[str], Optional[str]]:
    """Return (iso_date, problem). Accepts Excel dates, ISO and common d/m/y forms."""
    if v in (None, ""):
        return None, None
    if isinstance(v, dt.datetime):
        return v.date().isoformat(), None
    if isinstance(v, dt.date):
        return v.isoformat(), None
    s = str(v).strip()
    if not s:
        return None, None
    s2 = s.replace(".", "-").replace("/", "-")
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d-%m-%y", "%d-%b-%Y", "%d %b %Y",
                "%b %d %Y", "%m-%d-%Y", "%Y-%m", "%d-%b-%y"):
        try:
            return dt.datetime.strptime(s2, fmt).date().isoformat(), None
        except ValueError:
            continue
    # Excel serial number
    try:
        n = float(s)
        if 20000 < n < 60000:
            return (dt.date(1899, 12, 30) + dt.timedelta(days=int(n))).isoformat(), None
    except ValueError:
        pass
    return None, f"Unreadable date: {s!r}"


def parse_number(v: Any) -> Tuple[Optional[float], Optional[str]]:
    if v in (None, ""):
        return None, None
    if isinstance(v, (int, float)):
        return float(v), None
    s = re.sub(r"[^0-9.\-]", "", str(v))
    if s in ("", "-", "."):
        return None, f"Unreadable number: {v!r}"
    try:
        return float(s), None
    except ValueError:
        return None, f"Unreadable number: {v!r}"


def map_headers(headers: List[str]) -> Dict[str, str]:
    """Map canonical field -> source header. Longest keyword wins; each header used once."""
    mapping: Dict[str, str] = {}
    used: set = set()
    # score candidate pairs
    candidates = []
    for field, words in FIELD_RULES.items():
        for h in headers:
            hn = norm(h)
            if not hn:
                continue
            for w in words:
                wn = norm(w)
                if hn == wn:
                    candidates.append((3, len(wn), field, h))
                elif hn.startswith(wn) or hn.endswith(wn):
                    candidates.append((2, len(wn), field, h))
                elif wn in hn:
                    candidates.append((1, len(wn), field, h))
    candidates.sort(reverse=True)
    for _score, _length, field, h in candidates:
        if field in mapping or h in used:
            continue
        mapping[field] = h
        used.add(h)
    return mapping


def find_header_row(rows: List[Tuple[int, List[Any]]]) -> Optional[Tuple[int, List[str]]]:
    """Locate the most plausible header row in the first 15 rows."""
    best = None
    for idx, (rownum, values) in enumerate(rows[:15]):
        texts = [clean(v) for v in values]
        filled = [t for t in texts if t]
        if len(filled) < 3:
            continue
        alpha = sum(1 for t in filled if re.search(r"[A-Za-z]{2,}", t))
        numeric = sum(1 for t in filled if re.fullmatch(r"[\d.,\-/]+", t))
        score = alpha * 2 - numeric
        # a header row should mostly be words, not data
        if alpha >= max(3, int(len(filled) * 0.6)) and score > 0:
            if best is None or score > best[0]:
                best = (score, rownum, texts)
    if best:
        return best[1], best[2]
    return None


def classify_sheet(headers: List[str], sheet_name: str = "") -> str:
    """Classify a worksheet as register, visits, referrals or unknown.

    Classification uses both the sheet name and the vocabulary of its columns.
    A sheet is never treated as a patient register merely because it mentions
    a patient name.
    """
    keys = {norm(h) for h in headers if h}
    name = norm(sheet_name)
    has = lambda field: bool(keys & {norm(w) for w in FIELD_RULES[field]})
    has_intake = has("intake")
    has_visit = len(keys & {norm(w) for w in
                            FIELD_RULES["visit_date"] + FIELD_RULES["outcome"] + FIELD_RULES["visit_type"]})
    has_referral = len(keys & {norm(w) for w in
                               FIELD_RULES["reason"] + FIELD_RULES["priority"] + FIELD_RULES["request_date"]}) \
                   + (1 if has("fare") else 0)

    if any(k in name for k in ("dictionary", "instruction", "readme", "notes", "cover", "summary")):
        return "documentation"
    if any(k in name for k in ("referral", "hospital", "transport")) and has("name"):
        return "referrals"
    if has_visit >= 2 and not has_intake:
        return "visits"
    if has_referral >= 2 and not has_intake:
        return "referrals"
    if has("name") and (has_intake or has("ccc") or has("age") or "register" in name or "patient" in name):
        return "register"
    if has("name"):
        return "register"
    return "unknown"


# ----------------------------------------------------------------------------
# 3. Reading
# ----------------------------------------------------------------------------

def read_workbook(path: Path, only: Optional[List[str]], sample: Optional[int], log):
    """Yield (sheet_name, headers, rows, meta) for every worksheet."""
    suffix = path.suffix.lower()
    if suffix == ".csv":
        with path.open(newline="", encoding="utf-8-sig") as fh:
            reader = list(csv.reader(fh))
        rows = [(i + 1, r) for i, r in enumerate(reader)]
        found = find_header_row(rows)
        if not found:
            raise SystemExit(f"No header row detected in {path.name}")
        header_row, headers = found
        data = [(n, r) for n, r in rows if n > header_row and any(clean(c) for c in r)]
        if sample:
            data = data[:sample]
        yield path.stem, headers, data, {"source": path.name, "sheet": path.stem}
        return

    if load_workbook is None:
        raise SystemExit("openpyxl is required for XLSX input:  pip install openpyxl")

    wb_values = load_workbook(filename=str(path), data_only=True, read_only=True)
    wb_formulas = load_workbook(filename=str(path), data_only=False, read_only=True)
    try:
        for ws in wb_values.worksheets:
            if only and ws.title not in only:
                continue
            raw = []
            for i, row in enumerate(ws.iter_rows(values_only=True), start=1):
                raw.append((i, list(row)))
                if i > 50000:
                    break
            found = find_header_row(raw)
            if not found:
                log(f"  · sheet '{ws.title}': no header row detected — skipped")
                continue
            header_row, headers = found
            data = [(n, r) for n, r in raw if n > header_row and any(clean(c) for c in r)]
            if sample:
                data = data[:sample]

            # formula census (structure awareness, not evaluation)
            fs = wb_formulas[ws.title] if ws.title in wb_formulas.sheetnames else None
            formula_cells = 0
            if fs is not None:
                for row in fs.iter_rows():
                    for cell in row:
                        if isinstance(cell.value, str) and cell.value.startswith("="):
                            formula_cells += 1

            log(f"  · sheet '{ws.title}': header row {header_row}, {len(data)} data rows, "
                f"{len([h for h in headers if h])} columns, {formula_cells} formula cells")
            yield ws.title, headers, data, {"source": path.name, "sheet": ws.title,
                                            "formula_cells": formula_cells}
    finally:
        wb_values.close()
        wb_formulas.close()


# ----------------------------------------------------------------------------
# 4. Transformation
# ----------------------------------------------------------------------------

def resolve_area(value: str, areas: List[dict]) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """Return (area_id, county, problem)."""
    if not value:
        return None, None, "Ministry area not provided"
    v = norm(value)
    for a in areas:
        if v in (norm(a["name"]), norm(a["id"])):
            return a["id"], a.get("county"), None
    # tolerant contains-match (e.g. "Nyalenda (Urban)")
    for a in areas:
        if norm(a["name"]) and norm(a["name"]) in v:
            return a["id"], a.get("county"), f"Area matched loosely: {value!r} → {a['name']}"
    return None, None, f"Unrecognised ministry area: {value!r}"


def normalise_status(value: str) -> Tuple[str, Optional[str]]:
    if not value:
        return "digital_entered", "Status missing — staged as digital record entered"
    v = str(value).lower()
    for pattern, target in STATUS_MAP:
        if re.search(pattern, v):
            return target, None
    return "digital_entered", f"Unrecognised status {value!r} — staged as digital record entered"


def build_records(sheet, headers, rows, mapping, areas, log):
    kind = classify_sheet(headers, sheet)
    records, issues = [], []
    used_fields = {f: h for f, h in mapping.items()}

    for rownum, values in rows:
        def get(field):
            h = mapping.get(field)
            if not h:
                return ""
            try:
                i = headers.index(h)
            except ValueError:
                return ""
            return clean(values[i]) if i < len(values) else ""

        issues_row = []

        if kind in ("unknown", "documentation"):
            continue

        if kind == "referrals":
            rec = {"_row": rownum, "_kind": "referral"}
            rec["code"] = get("code")
            rec["name"] = get("name")
            rd, prob = parse_date(get("request_date"))
            rec["request_date"] = rd
            if prob:
                issues_row.append({"severity": "warn", "field": "request_date", "message": prob})
            rec["facility"] = get("referral") or get("area")
            rec["reason"] = get("reason")
            rec["priority"] = (get("priority") or "routine").lower() or "routine"
            rec["transport_required"] = (get("transport_required") or "").lower() in ("yes", "y", "true", "1", "required")
            fare, prob = parse_number(get("fare"))
            rec["fare"] = fare
            rec["status"] = get("status") or "submitted"
            rec["notes"] = get("notes")
            if not (rec["code"] or rec["name"]):
                issues_row.append({"severity": "error", "field": "link",
                                   "message": "Referral row has neither file number nor patient name"})
            rec["issues"] = issues_row
            records.append(rec)
            continue

        if kind == "visits":
            rec = {"_row": rownum, "_kind": "visit"}
            for f in ("code", "name", "visit_type", "visit_date", "outcome", "notes",
                      "next_due", "bp", "weight"):
                rec[f] = get(f)
            d, prob = parse_date(rec.get("visit_date"))
            rec["visit_date"] = d
            if prob:
                issues_row.append({"severity": "warn", "field": "visit_date", "message": prob})
            w, prob = parse_number(rec.get("weight"))
            rec["weight"] = w
            if prob:
                issues_row.append({"severity": "warn", "field": "weight", "message": prob})
            if not (rec.get("code") or rec.get("name")):
                issues_row.append({"severity": "error", "field": "link",
                                   "message": "Visit row has neither file number nor patient name — cannot be linked"})
            rec["issues"] = issues_row
            records.append(rec)
            continue

        # ---- register row
        rec = {"_row": rownum, "_kind": "patient"}
        rec["name"] = get("name")
        rec["code"] = get("code")
        area_id, county, area_prob = resolve_area(get("area"), areas)
        rec["areaId"] = area_id
        rec["countyId"] = county
        rec["ccc"] = get("ccc")
        rec["phone"] = get("phone")
        sex = get("sex").upper()[:1]
        rec["sex"] = "F" if sex == "F" else ("M" if sex == "M" else "")
        age, prob = parse_number(get("age"))
        rec["age"] = int(age) if age is not None else None
        if prob:
            issues_row.append({"severity": "warn", "field": "age", "message": prob})
        intake, prob = parse_date(get("intake"))
        rec["intake"] = intake
        if prob:
            issues_row.append({"severity": "warn", "field": "intake", "message": prob})
        discharge, prob = parse_date(get("discharge"))
        rec["discharge"] = discharge
        status, prob = normalise_status(get("status"))
        if rec.get("discharge") and status != "discharged":
            status = "discharged"
            issues_row.append({"severity": "info", "field": "status",
                               "message": "Discharge date present — status reconciled to discharged"})
        rec["status"] = status
        if prob:
            issues_row.append({"severity": "warn", "field": "status", "message": prob})
        rec["referral"] = get("referral")
        rec["caregiver"] = get("caregiver")
        weight, prob = parse_number(get("weight"))
        rec["weight"] = weight
        height, prob2 = parse_number(get("height"))
        rec["height"] = height
        rec["diagnosis"] = get("diagnosis")
        kids, prob3 = parse_number(get("children"))
        rec["children"] = int(kids) if kids is not None else None
        orphans, _ = parse_number(get("orphans"))
        rec["orphans"] = int(orphans) if orphans is not None else None
        rec["guardian"] = get("guardian")
        rec["discharge_reason"] = get("discharge_reason")

        if not rec["name"]:
            issues_row.append({"severity": "error", "field": "name",
                               "message": "Patient name is missing — record cannot be imported"})
        if area_prob:
            issues_row.append({"severity": "warn" if "matched loosely" in area_prob else "error",
                               "field": "area", "message": area_prob})
        if not rec["code"]:
            issues_row.append({"severity": "warn", "field": "code",
                               "message": "No file number — a temporary identifier will be assigned"})
        if not rec["intake"]:
            issues_row.append({"severity": "warn", "field": "intake",
                               "message": "Intake date missing — Patient-Days cannot be calculated"})
        rec["issues"] = issues_row
        records.append(rec)

    return kind, records, used_fields


# ----------------------------------------------------------------------------
# 5. Duplicate detection
# ----------------------------------------------------------------------------

def detect_duplicates(patients: List[dict], existing: List[dict]) -> Dict[str, Any]:
    by_ccc: Dict[str, List[dict]] = defaultdict(list)
    by_code: Dict[str, List[dict]] = defaultdict(list)
    by_name_area: Dict[str, List[dict]] = defaultdict(list)

    for p in patients:
        if p.get("ccc"):
            by_ccc[norm(p["ccc"])].append(p)
        if p.get("code"):
            by_code[norm(p["code"])].append(p)
        if p.get("name"):
            by_name_area[f"{norm(p['name'])}|{p.get('areaId') or ''}"].append(p)

    existing_ccc = {norm(e.get("ccc") or "") for e in existing if e.get("ccc")}
    existing_code = {norm(e.get("code") or "") for e in existing if e.get("code")}
    existing_na = {f"{norm(e.get('name') or '')}|{e.get('areaId') or ''}" for e in existing if e.get("name")}

    flags = []
    for key, group in by_ccc.items():
        if len(group) > 1:
            flags.append({"type": "duplicate_ccc_in_file", "key": key,
                          "rows": [g["_row"] for g in group],
                          "action": "review", "message": "Same CCC number appears more than once in the workbook"})
        if key in existing_ccc:
            flags.append({"type": "duplicate_ccc_existing", "key": key,
                          "rows": [g["_row"] for g in group],
                          "action": "update_or_skip",
                          "message": "CCC number already exists in the DIMS database"})
    for key, group in by_code.items():
        if len(group) > 1:
            flags.append({"type": "duplicate_code_in_file", "key": key,
                          "rows": [g["_row"] for g in group], "action": "review",
                          "message": "Same file number appears more than once"})
        if key in existing_code:
            flags.append({"type": "duplicate_code_existing", "key": key,
                          "rows": [g["_row"] for g in group], "action": "update_or_skip",
                          "message": "File number already exists in the DIMS database"})
    for key, group in by_name_area.items():
        if len(group) > 1:
            flags.append({"type": "same_name_same_area", "key": key,
                          "rows": [g["_row"] for g in group], "action": "review",
                          "message": "Identical name within the same ministry area — verify before importing. "
                                     "Names alone are never used to merge records."})
    return {
        "flags": flags,
        "records_flagged": sorted({r for f in flags for r in f["rows"]}),
        "by_type": dict(Counter(f["type"] for f in flags)),
    }


# ----------------------------------------------------------------------------
# 6. Main pipeline
# ----------------------------------------------------------------------------

def run(args) -> int:
    log = (lambda *a: None) if args.quiet else (lambda *a: print(*a))
    path = Path(args.workbook)
    if not path.exists():
        raise SystemExit(f"Workbook not found: {path}")

    areas = DEFAULT_AREAS
    if args.areas:
        areas = json.loads(Path(args.areas).read_text(encoding="utf-8"))

    existing: List[dict] = []
    if args.db_json:
        db = json.loads(Path(args.db_json).read_text(encoding="utf-8"))
        existing = db.get("patients", db if isinstance(db, list) else [])
        log(f"Comparing against {len(existing)} existing DIMS records")

    log(f"\nLOMAMO CareLink DIMS — offline import engine v{VERSION}")
    log(f"Source: {path.name}  ({(path.stat().st_size/1024):,.1f} KB)")
    log(f"SHA-256: {hashlib.sha256(path.read_bytes()).hexdigest()[:32]}…")
    log("")

    sheets_meta = []
    patients: List[dict] = []
    visits: List[dict] = []
    referrals: List[dict] = []
    unmapped_report = {}

    for sheet_name, headers, rows, meta in read_workbook(path, args.sheet, args.sample, log):
        mapping = map_headers([h for h in headers if h])
        kind, records, used = build_records(sheet_name, headers, rows, mapping, areas, log)
        mapped_headers = set(used.values())
        unmapped = [h for h in headers if h and h not in mapped_headers]
        unmapped_report[sheet_name] = unmapped
        if kind == "register":
            patients.extend(records)
        elif kind == "visits":
            visits.extend(records)
        elif kind == "referrals":
            referrals.extend(records)
        sheets_meta.append({
            "sheet": sheet_name,
            "classification": kind,
            "rows": len(records),
            "columns": len([h for h in headers if h]),
            "mapped": mapping,
            "unmapped_columns": unmapped,
            "formula_cells": meta.get("formula_cells", 0),
        })
        log(f"    classified as: {kind} · mapped {len(mapping)} fields · {len(unmapped)} unmapped columns")

    # ---- validation summary
    all_issues = []
    for p in patients:
        for i in p["issues"]:
            all_issues.append({"row": p["_row"], "patient": p.get("name", ""), **i})
    for v in visits:
        for i in v["issues"]:
            all_issues.append({"row": v["_row"], "patient": v.get("name", ""), **i})
    for r in referrals:
        for i in r["issues"]:
            all_issues.append({"row": r["_row"], "patient": r.get("name", ""), **i})

    errors = [i for i in all_issues if i["severity"] == "error"]
    warnings = [i for i in all_issues if i["severity"] == "warn"]
    info = [i for i in all_issues if i["severity"] == "info"]

    dupes = detect_duplicates(patients, existing)
    clean = [p for p in patients if not p["issues"] and p["_row"] not in dupes["records_flagged"]]

    # ---- staged package
    package = {
        "format": "lomamo-dims-import",
        "formatVersion": 1,
        "engineVersion": VERSION,
        "generatedAt": dt.datetime.now().isoformat(timespec="seconds"),
        "source": {
            "file": path.name,
            "bytes": path.stat().st_size,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        },
        "sheets": sheets_meta,
        "summary": {
            "patients": len(patients),
            "visits": len(visits),
            "referrals": len(referrals),
            "clean": len(clean),
            "flagged": len([p for p in patients if p["issues"]]),
            "duplicates": len(dupes["flags"]),
            "errors": len(errors),
            "warnings": len(warnings),
            "unmappedColumns": sum(len(v) for v in unmapped_report.values()),
        },
        "mapping": {s["sheet"]: s["mapped"] for s in sheets_meta},
        "patients": [{k: v for k, v in p.items() if k != "issues"} for p in patients],
        "visits": [{k: v for k, v in v.items() if k != "issues"} for v in visits],
        "referrals": [{k: v for k, v in r.items() if k != "issues"} for r in referrals],
        "issues": all_issues,
        "duplicates": dupes,
    }

    Path(args.out).write_text(json.dumps(package, indent=2, ensure_ascii=False), encoding="utf-8")

    # ---- reconciliation report
    md = render_reconciliation(package, sheets_meta, unmapped_report, all_issues, dupes, args)
    Path(args.report).write_text(md, encoding="utf-8")

    log("")
    log(f"  Patients staged:  {len(patients)}")
    log(f"  Visits staged:    {len(visits)}")
    log(f"  Referrals staged: {len(referrals)}")
    log(f"  Clean records:    {len(clean)}")
    log(f"  Flagged records:  {len([p for p in patients if p['issues']])}")
    log(f"  Duplicate flags:  {len(dupes['flags'])}")
    log(f"  Errors / warnings:{len(errors)} / {len(warnings)}")
    log("")
    log(f"  → {args.out}")
    log(f"  → {args.report}")
    log("\nNothing has been written to the live database. Load the JSON in the DIMS import wizard to preview and commit.")
    return 0


def render_reconciliation(pkg, sheets, unmapped, issues, dupes, args) -> str:
    s = pkg["summary"]
    lines = []
    A = lines.append
    A("# Master Workbook Import — Reconciliation Report\n")
    A(f"**Organisation:** LOMAMO Foundation Kenya  ")
    A(f"**Source workbook:** `{pkg['source']['file']}` ({pkg['source']['bytes']:,} bytes)  ")
    A(f"**SHA-256:** `{pkg['source']['sha256']}`  ")
    A(f"**Generated:** {pkg['generatedAt']}  ")
    A(f"**Engine:** offline import engine v{pkg['engineVersion']}  ")
    A(f"**Classification:** Confidential patient-related\n")
    A("---\n")
    A("## 1. Summary\n")
    A("| Measure | Count |")
    A("|---|---:|")
    A(f"| Patient rows detected | {s['patients']} |")
    A(f"| Visit rows detected | {s['visits']} |")
    A(f"| Referral rows detected | {s.get('referrals', 0)} |")
    A(f"| Records clean | {s['clean']} |")
    A(f"| Records requiring review | {s['flagged']} |")
    A(f"| Duplicate / conflict flags | {s['duplicates']} |")
    A(f"| Errors | {s['errors']} |")
    A(f"| Warnings | {s['warnings']} |")
    A(f"| Unmapped columns | {s['unmappedColumns']} |\n")

    A("## 2. Worksheets\n")
    A("| Worksheet | Classified as | Rows | Columns | Mapped | Unmapped | Formula cells |")
    A("|---|---|---:|---:|---:|---:|---:|")
    for sh in sheets:
        A(f"| {sh['sheet']} | {sh['classification']} | {sh['rows']} | {sh['columns']} | "
          f"{len(sh['mapped'])} | {len(sh['unmapped_columns'])} | {sh['formula_cells']} |")
    A("")

    A("## 3. Column mapping\n")
    for sh in sheets:
        A(f"### {sh['sheet']}\n")
        if sh["mapped"]:
            A("| DIMS field | Source column |")
            A("|---|---|")
            for f, h in sh["mapped"].items():
                A(f"| `{f}` | {h} |")
        else:
            A("_No columns mapped._")
        if sh["unmapped_columns"]:
            A(f"\n**Unmapped source columns (preserved in the original, not imported):** "
              + ", ".join(f"`{c}`" for c in sh["unmapped_columns"]))
        A("")

    A("## 4. Issues requiring attention\n")
    if not issues:
        A("No validation issues were detected.\n")
    else:
        A("| Row | Patient | Severity | Field | Message |")
        A("|---:|---|---|---|---|")
        for i in issues[:200]:
            A(f"| {i['row']} | {i.get('patient','')} | {i['severity']} | {i.get('field','')} | {i['message']} |")
        if len(issues) > 200:
            A(f"\n_… {len(issues)-200} further issues omitted from this table; all are present in the JSON package._")
        A("")

    A("## 5. Duplicate and conflict analysis\n")
    if not dupes["flags"]:
        A("No duplicate identifiers were found within the workbook or against the existing database.\n")
    else:
        A("| Type | Key | Rows | Recommended action |")
        A("|---|---|---|---|")
        for f in dupes["flags"][:120]:
            A(f"| {f['type']} | `{f['key']}` | {', '.join(map(str, f['rows']))} | {f['action']} |")
        A("")
        A("> Name similarity alone is never used to merge or discard a patient record. "
          "Each flagged row requires a human decision in the import wizard: import as new, "
          "merge, update existing, skip, or send for review.\n")

    A("## 6. Transformations applied\n")
    A("- Dates normalised to ISO `YYYY-MM-DD`; Excel serial dates converted using the 1900 date system.")
    A("- Sex values reduced to `F`/`M`; unrecognised values left blank for review.")
    A("- Programme status mapped onto DIMS states "
      "(`active`, `digital_entered`, `awaiting_verification`, `discharged`). A discharge date overrides a conflicting status.")
    A("- Ministry areas resolved against the configured area list; unresolved areas are errors, not guesses.")
    A("- Numeric fields stripped of currency symbols and thousands separators where unambiguous.")
    A("- Unmapped columns are **not** imported. They remain in the original workbook and are listed above.\n")

    A("## 7. Data protection and integrity\n")
    A("- The source workbook was opened read-only and has not been modified.")
    A("- No network request was made by this engine; no patient data left the device.")
    A("- The staged package contains patient identifiers and must be handled as **Confidential patient-related** information.")
    A("- Committing the import in the DIMS creates a verified pre-import backup, preserves the source file, "
      "and writes an audit entry recording the operator, timestamp, SHA-256 and outcome.\n")
    A("---\n")
    A(f"_Prepared by CareLink DIMS offline import engine v{pkg['engineVersion']}. "
      "This report is evidence of processing, not authorisation to import._")
    return "\n".join(lines)


def main(argv: Optional[Iterable[str]] = None) -> int:
    p = argparse.ArgumentParser(description="LOMAMO CareLink DIMS — offline master workbook import engine")
    p.add_argument("--workbook", required=True)
    p.add_argument("--out", default="lomamo_master.json")
    p.add_argument("--report", default="reconciliation.md")
    p.add_argument("--sheet", action="append", default=None)
    p.add_argument("--areas", default=None)
    p.add_argument("--db-json", dest="db_json", default=None)
    p.add_argument("--sample", type=int, default=None)
    p.add_argument("--quiet", action="store_true")
    return run(p.parse_args(argv))


if __name__ == "__main__":
    sys.exit(main())
