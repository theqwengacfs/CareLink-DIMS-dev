#!/usr/bin/env python3
"""redact_inventory.py - turn the Administration's inventory workbooks into a
published, structure-only register.

WHY THIS EXISTS
  The October 2026 inventory workbooks were committed to a public repository and
  their OFFICE INVENTORY sheet was copied into `v6/src/inventory_data.js` almost
  verbatim. That published, to anyone with the URL:

    * vehicle registration plates and chassis numbers,
    * 16 handset IMEI numbers and which staff member holds each device,
    * asset values, including a seven-figure vehicle,
    * staff names attached to the equipment they carry.

  The workbooks are useful for their STRUCTURE - what the Foundation counts, in
  which categories, on which count sheet, in which units. They are not useful
  for their identifiers, and identifiers have no business in a public bundle.
  This script keeps the first and drops the second, and it is the only supported
  way to regenerate `v6/src/inventory_data.js`.

WHAT IT PRODUCES
  INVENTORY_SEED          122 office-equipment rows: category, date, item,
                          quantity, unit, description, site-level location,
                          internal asset tag, condition, new/old, source.
                          Device serials, IMEIs, chassis numbers, registration
                          plates and monetary values are removed.
  inventorySeed()         the function the register actually calls. Without it
                          the seeded database held zero items and the register
                          rendered empty while the bundle still carried the data.
  INVENTORY_SITES         the closed list of locations, used by the location
                          pickers so a movement is recorded against a site and
                          never against a person.
  INVENTORY_REDACTION     an explicit record of what was removed and where the
                          real values are kept.
  KITCHEN_CATALOG /       structure taken from the KITCHEN INVENTORY and
  KITCHEN_COUNT_COLUMNS   medical-supplies sheets: what is counted, in which
  SUPPLY_CATALOG /        columns, in which units - with every quantity left
  SUPPLY_COUNT_COLUMNS    blank, to be filled by a physical count on the office
                          host, as the TB dispensing protocol requires.

USAGE
  python3 v6/tools/redact_inventory.py                       # workbooks in repo root
  python3 v6/tools/redact_inventory.py --master /path/a.xlsx --supplies /path/b.xlsx
  python3 v6/tools/redact_inventory.py --check               # audit the committed JS

The workbooks are NOT stored in this repository. Run this against a copy on the
office host; `--check` audits the committed JavaScript without them.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]          # repository root
SRC = ROOT / "v6" / "src"
OUT = SRC / "inventory_data.js"

MASTER_DEFAULT = ROOT / "LOMAMO Kisumu Master Inventory october 2026.xlsx"
SUPPLIES_DEFAULT = ROOT / "LMMK Medical supplies inventory - OCT2026.xlsx"

# --------------------------------------------------------------------------
# What counts as a secret
# --------------------------------------------------------------------------
PLATE = re.compile(r"\bK[A-Z]{2}\s?\d{3}\s?[A-Z]\b")            # Kenyan registration
CHASSIS = re.compile(r"(?:chassis\s*(?:no\.?|number)?\s*)?[A-HJ-NPR-Z0-9]{17}\b", re.I)
LONG_DIGITS = re.compile(r"\b\d{9,}\b")                          # IMEI, serial, VC no.
INTERNAL_TAG = re.compile(r"^(?:LMM|LMMK)[A-Z0-9/\- ]*$", re.I)   # the Foundation's own labels
TAG_IN_PARENS = re.compile(r"\(((?:LMM|LMMK)[A-Z0-9/\- ]*)\)", re.I)
MONEY = re.compile(r"(?:kshs?\.?|kes|ksh)\s*[\d.,]+\s*(?:million|bn|billion)?", re.I)

# Locations, reduced to sites. A person is never a location: equipment is
# recorded as issued to a ministry or a room, and the holder is recorded in the
# movement ledger on the office host, where it is access-controlled.
LOC_SITE = {
    # --- held by a person -> the ministry or room that owns the duty ---------
    "washington ayub odero": "With staff - Hospital Ministry",
    "ashar anyango": "With staff - Staff Welfare",
    "ashar anyango omondi": "With staff - Staff Welfare",
    "catherine awuor obila": "With staff - Public Relations",
    "denis allan ouma wayodi": "With staff - Procurement",
    "daniel odhiambo ondu": "LOMAMO Homa Bay office",
    "daniel odhiambo  ondu": "LOMAMO Homa Bay office",
    "julia oguta": "Administrative assistants office",
    "martin chamah": "Director's office",
    "musa nyanjong otieno": "Administrative assistants office",
    "musa otieno -mpesa phone": "Admin office - M-Pesa handset",
    "musa otieno": "Admin office - M-Pesa handset",
    # --- site spellings, normalised -----------------------------------------
    "lomamo office": "LOMAMO Kisumu office",
    "office": "LOMAMO Kisumu office",
    "lomamo office compound": "LOMAMO Kisumu office",
    "lomamu kisumu office compound": "LOMAMO Kisumu office",
    "lomamo kisumu office compound": "LOMAMO Kisumu office",
    "2 office destop": "LOMAMO Kisumu office",
    "lomamo office (missing)": "LOMAMO Kisumu office",
    "lomamo office installed in the vehicle": "Installed in a Foundation vehicle",
    "lomamo homa bay office compound": "LOMAMO Homa Bay office",
    "administrative assistants office": "Administrative assistants office",
    "administrative assistants office.": "Administrative assistants office",
    "administrative assistant": "Administrative assistants office",
    "3 tier in administrative assistant office, 2 tier in director's office":
        "Administrative assistants office",
    "admin office": "Admin office",
    "(admin office)": "Admin office",
    "lomamo office (admin office)": "Admin office",
    "director's office": "Director's office",
    "home stay": "Home Stay",
    "lomamo kitchen": "LOMAMO kitchen",
    "lomamo office compound (kitchen)": "LOMAMO kitchen",
    "office compound (kitchen)": "LOMAMO kitchen",
    "black cabinet by generator": "Black cabinet by the generator",
}
# A parenthetical ministry wins over the person named in front of it.
PAREN = re.compile(r"\(([^)]*(?:ministry|office)[^)]*)\)", re.I)
# Staff names, so a location that still contains one is caught rather than shipped.
STAFF_TOKENS = {
    "washington", "ashar", "catherine", "denis", "allan", "daniel", "julia",
    "martin", "musa", "moses", "oscar", "evans", "wickliffe", "wicklyff",
    "john", "irene", "julie", "susan", "iscah", "millicent", "caroline",
    "maureen", "chamah", "otieno", "odhiambo", "omondi", "obila", "lubalo",
    "wayodi", "oguta", "omolo", "odero", "onyango", "achieng", "abuto",
    "nyanjong", "atieno", "awuor", "anyango", "shikuku", "oduja", "mildred",
    "naphtaly", "omolo",
}


def site_of(raw: str) -> str:
    """Reduce a workbook location to a site label, never a person."""
    s = " ".join(str(raw or "").split())
    if not s:
        return ""
    key = s.lower().strip(".")
    if key in LOC_SITE:
        return LOC_SITE[key]
    m = PAREN.search(s)                                    # "Oscar … (Nyalenda Ministry)"
    if m:
        return " ".join(m.group(1).split()).title().replace("Ministry", "Ministry")
    if ":" in s or " - " in s:                             # "LOMAMO Office : X - Y Ministry"
        tail = re.split(r":| - ", s)[-1].strip()
        if re.search(r"ministry|office", tail, re.I):
            return " ".join(tail.split()).title()
    if PLATE.search(s):
        s = PLATE.sub("a Foundation vehicle", s)
    if any(t.lower() in STAFF_TOKENS for t in re.findall(r"[A-Za-z']+", s)):
        return "With staff (issued)"
    return s


def tag_of(raw: str) -> str:
    """Keep the Foundation's own asset label; drop every manufacturer identifier."""
    s = " ".join(str(raw or "").split())
    if not s or s.upper() in {"N/A", "NA", "-", "NIL"}:
        return ""
    m = TAG_IN_PARENS.search(s)                            # "40913402 (LMM/KEY/10)"
    if m:
        return m.group(1).upper()
    if INTERNAL_TAG.match(s) and not LONG_DIGITS.search(s):
        return s.upper()
    return ""


def desc_of(raw: str) -> str:
    """Description without plates, chassis numbers or long identifier runs."""
    s = " ".join(str(raw or "").split())
    if not s:
        return ""
    s = re.sub(r"(?:truck\s*)?registration\s*(?:number|no\.?)\s*[-:]?\s*" + PLATE.pattern,
               "(registration held on the office host)", s, flags=re.I)
    s = PLATE.sub("(registration held on the office host)", s)
    s = re.sub(r"chassis\s*(?:no\.?|number)?\s*[:\-]?\s*[A-HJ-NPR-Z0-9]{11,}",
               "(chassis held on the office host)", s, flags=re.I)
    s = re.sub(r"(?:imei|ime i|s/?n|serial|vc\s*no|v/?c)\s*[:\-]?\s*\d[\d\s.:,\-]*",
               "", s, flags=re.I)
    s = LONG_DIGITS.sub("", s)
    s = MONEY.sub("", s)
    return re.sub(r"\s{2,}", " ", s).replace(" .", ".").strip(" .,;-")


def js_str(v) -> str:
    return json.dumps("" if v is None else str(v), ensure_ascii=False)


# The workbook writes its section headings in capitals. These are the spellings
# the register has always used, so the categories stay recognisable.
ACRONYMS = {"IT": "IT", "AV": "AV", "PPE": "PPE", "PPES": "PPEs", "&": "&"}
SMALL_WORDS = {"and", "of", "the", "in", "for", "or", "to", "a", "an"}

# A named donor is not published. The gift is; the person is described by role.
NOTE_REDACTIONS = [
    (re.compile(r"by\s+Madam\s+[A-Z][a-z]+\s+[A-Z][A-Za-z]+", re.I), "by a visiting donor"),
    (re.compile(r"Madam\s+[A-Z][a-z]+\s+[A-Z][A-Za-z]+"), "a visiting donor"),
    (re.compile(r"Mr\.?\s+[A-Z][a-z]+\s+[A-Z][A-Za-z]+"), "a donor"),
    (re.compile(r"Mrs\.?\s+[A-Z][a-z]+\s+[A-Z][A-Za-z]+"), "a donor"),
]


def heading(s: str) -> str:
    """'COMPUTERS, IT & NETWORKING EQUIPMENT' -> 'Computers, IT & Networking Equipment'."""
    words = str(s or "").split()
    out = []
    for i, w in enumerate(words):
        if w.upper() in ACRONYMS:
            out.append(ACRONYMS[w.upper()])
        elif w.lower() in SMALL_WORDS and i not in (0, len(words) - 1):
            out.append(w.lower())
        else:
            out.append(w.capitalize())
    return " ".join(out).replace(" ,", ",")


def note_of(text: str) -> str:
    """An acquisition note, with any named individual reduced to a role."""
    s = " ".join(str(text or "").split())
    for rx, rep in NOTE_REDACTIONS:
        s = rx.sub(rep, s)
    return s


# --------------------------------------------------------------------------
# readers
# --------------------------------------------------------------------------
def read_office(path: Path) -> tuple[list[dict], list[str]]:
    """OFFICE INVENTORY: row 1 title, row 2 headers, then data.

    Categories are SECTION ROWS - a capitalised label in column A with nothing
    in column B - not a column of their own. Every row after one belongs to it
    until the next section row appears.

    Columns: 0 Date | 1 Item | 2 Number of Items | 3 Full Description |
             4 Location | 5 Serial # or other Identifier | 6 Original Value/Cost |
             7 Condition | 8 Existence | 9 Source of Funds
    """
    import warnings
    import openpyxl
    warnings.filterwarnings("ignore")
    wb = openpyxl.load_workbook(str(path), data_only=True, read_only=True)
    ws = wb["OFFICE INVENTORY"]
    out, cat, notes = [], "Unclassified", []
    for r in list(ws.iter_rows(values_only=True))[2:]:
        cells = ["" if c is None else str(c).strip() for c in r]
        cells += [""] * (10 - len(cells))
        item = cells[1]
        if not item:                                       # section row or blank
            if cells[0] and not any(cells[2:]):
                cat = heading(cells[0])
            continue
        if re.fullmatch(r"\d+", item) and len(cells[2]) > 40:
            notes.append(note_of(cells[2]))
            continue
        out.append({
            "cat": cat,
            "date": cells[0][:10],
            "item": item,
            "qty": cells[2],
            "desc": cells[3],
            "loc": cells[4],
            "serial": cells[5],
            "value": cells[6],
            "cond": cells[7],
            "exist": cells[8],
            "src": cells[9],
        })
    wb.close()
    return out, notes


def read_categories(raw: list[dict]) -> list[str]:
    """The workbook's own section headings, in workbook order.

    Rows that appear before the first heading (the two vehicles at the top of
    the sheet) are honestly 'Unclassified'; that label is listed last so the
    picker reads the way the workbook does.
    """
    cats = []
    for d in raw:
        if d["cat"] not in cats:
            cats.append(d["cat"])
    if "Unclassified" in cats:
        cats.remove("Unclassified")
        cats.append("Unclassified")
    return cats


CATEGORY_FALLBACK = [
    "Computers, It & Networking Equipment",
    "Furniture & Furnishings",
    "Kitchen & Home Appliances",
    "Mobile Phones, Communication & Av Equipment",
    "Office Supplies & General Miscellaneous",
    "Safety & Protective Gear",
    "Tools, Vehicle Parts & Electrical Accessories",
    "Unclassified",
]

UNIT_WORDS = re.compile(
    r"\b(tabs?|tablets?|tins?|boxes|box|vials?|bottles?|sachets?|pairs?|packets?|"
    r"cartons?|rolls?|bags?|litres?|ml|kg|units?|pcs?|pieces?|bars?|bales?)\b", re.I)


def read_kitchen(path: Path) -> tuple[list[str], list[str]]:
    import warnings
    import openpyxl
    warnings.filterwarnings("ignore")
    wb = openpyxl.load_workbook(str(path), data_only=True, read_only=True)
    ws = wb["KITCHEN INVENTORY"]
    rows = list(ws.iter_rows(values_only=True))
    cols = [heading(str(c)) for c in rows[1] if c not in (None, "")]
    items = []
    for r in rows[2:]:
        name = "" if r[0] is None else " ".join(str(r[0]).split())
        if name and not name.upper() == name:
            items.append(name)
    wb.close()
    return items, cols


def read_supplies(master: Path | None, supplies: Path | None) -> tuple[list[dict], list[str], list[str]]:
    """Item names, units and count-sheet columns. Quantities are never read."""
    import warnings
    import openpyxl
    warnings.filterwarnings("ignore")
    cat, items, cols = "", [], []

    if supplies and supplies.exists():
        wb = openpyxl.load_workbook(str(supplies), data_only=True, read_only=True)
        for sheet in wb.sheetnames:
            cat = heading(sheet)
            ws = wb[sheet]
            rows = list(ws.iter_rows(values_only=True))
            if rows:
                head = [" ".join(str(c).split()) for c in rows[0] if c not in (None, "")]
                if head and not cols:
                    cols = head
            for r in rows[1:]:
                name = "" if r[0] is None else " ".join(str(r[0]).split())
                if not name:
                    continue
                unit = "unit"
                for cell in r[1:]:
                    if cell is None:
                        continue
                    m = UNIT_WORDS.search(str(cell))
                    if m:
                        unit = m.group(1).lower()
                        break
                items.append({"cat": cat, "item": name, "unit": unit})
        wb.close()

    if master and master.exists():
        wb = openpyxl.load_workbook(str(master), data_only=True, read_only=True)
        if "MEDICAL SUPPLIES" in wb.sheetnames:
            ws = wb["MEDICAL SUPPLIES"]
            rows = list(ws.iter_rows(values_only=True))
            for r in rows[2:3]:
                cols = [heading(str(c)) for c in r if c not in (None, "")] or cols
            for r in rows[3:]:
                name = "" if r[0] is None else " ".join(str(r[0]).split())
                if not name:
                    continue
                rest = [c for c in r[1:] if c not in (None, "")]
                if name.upper() == name and not rest:      # section row: MEDICINES, PPE …
                    cat = heading(name)
                    continue
                unit = "unit"
                for cell in r[1:]:
                    if cell is None:
                        continue
                    m = UNIT_WORDS.search(str(cell))
                    if m:
                        unit = m.group(1).lower()
                        break
                if not any(i["item"].lower() == name.lower() for i in items):
                    items.append({"cat": cat or "Medical supplies", "item": name, "unit": unit})
        wb.close()
    return items, cols, sorted({i["cat"] for i in items if i["cat"]})


# --------------------------------------------------------------------------
# emit
# --------------------------------------------------------------------------
def emit(rows: list[dict], cats: list[str], sites: list[str], kitchen: list[str],
         kcols: list[str], sup: list[dict], scols: list[str], stats: dict,
         notes: list[str]) -> str:
    L = []
    A = L.append
    A("/* =====================================================================")
    A("   inventory_data.js - the office equipment register and the count")
    A("   templates derived from the Administration's October 2026 workbooks.")
    A("")
    A("   REDACTION POLICY (applied by v6/tools/redact_inventory.py)")
    A("   This file is published. It ships inside public/carelink-v6.html and")
    A("   is served to anyone with the URL, before any login. Therefore:")
    A("     KEPT    structure - categories, items, quantities, units, condition,")
    A("             new/old, source, site-level location, the Foundation's own")
    A("             asset labels (LMM/…, LMMK/…), and the count-sheet columns.")
    A("     REMOVED manufacturer serial numbers, handset IMEIs, chassis numbers,")
    A("             vehicle registration plates, monetary values, and staff names")
    A("             used as a location.")
    A("   The removed values are recorded on the office host, in the database")
    A("   that v6/server.py keeps, where they are behind login and the audit")
    A("   trail. They are never committed. See v6/docs/23_INVENTORY_REDACTION.md.")
    A("   ===================================================================== */")
    A("")
    A("/* One row per line, so a reviewer can read the register without a tool. */")
    A("const INVENTORY_SEED = [")
    for r in rows:
        parts = []
        for k in ("cat", "date", "item", "qty", "unit", "desc", "loc",
                  "serial", "value", "cond", "exist", "src"):
            parts.append(f"{k}:{r[k] if k == 'qty' else js_str(r[k])}")
        A("  {" + ", ".join(parts) + "},")
    A("];")
    A("")
    A("/* The register the media department owns. Quantities, categories and sites")
    A("   come from the workbook; identifiers and values do not. */")
    A("function inventorySeed(){")
    A("  return INVENTORY_SEED.map((r,i)=>({")
    A("    id:'inv-'+String(i+1).padStart(3,'0'),")
    A("    cat:r.cat, date:r.date, item:r.item, qty:+r.qty||0, unit:r.unit||'unit',")
    A("    desc:r.desc, loc:r.loc, serial:r.serial, value:r.value, cond:r.cond,")
    A("    exist:r.exist, src:r.src")
    A("  }));")
    A("}")
    A("")
    A("const INVENTORY_CATEGORIES = " + json.dumps(cats, ensure_ascii=False) + ";")
    A("")
    A("/* Closed list of locations. Equipment is issued to a site or a ministry,")
    A("   never to a person: the holder is recorded in the movement ledger. */")
    A("const INVENTORY_SITES = " + json.dumps(sites, ensure_ascii=False) + ";")
    A("")
    A("/* What the published register deliberately does not carry. */")
    A("const INVENTORY_REDACTION = {")
    A(f"  removed: {json.dumps(stats['removed'], ensure_ascii=False)},")
    A(f"  counts: {json.dumps(stats['counts'], ensure_ascii=False)},")
    A("  whereTheRealValuesLive:'the office-host database (v6/server.py), behind login and the audit trail',")
    A("  policy:'structure is published; identifiers, values and personal names are not',")
    A("  tool:'v6/tools/redact_inventory.py',")
    A("  check:'python3 v6/tools/verify_no_patient_data.py'")
    A("};")
    A("")
    A("/* Kitchen count template - the columns the workbook counts against, and")
    A("   what is counted. Quantities are left blank on purpose: they are taken")
    A("   by physical count on the office host, which is what the TB dispensing")
    A("   protocol requires of every stock line. */")
    A("const KITCHEN_COUNT_COLUMNS = " + json.dumps(kcols, ensure_ascii=False) + ";")
    A("const KITCHEN_CATALOG = " + json.dumps(kitchen, ensure_ascii=False) + ";")
    A("")
    A("/* Medical, wound-care, equipment, PPE and cleaning supply catalogue. */")
    A("const SUPPLY_COUNT_COLUMNS = " + json.dumps(scols, ensure_ascii=False) + ";")
    A("const SUPPLY_CATALOG = [")
    for s in sup:
        A(f"  {{cat:{js_str(s['cat'])}, item:{js_str(s['item'])}, unit:{js_str(s['unit'])}, qty:''}},")
    A("];")
    A("")
    A("/* Acquisition notes from the bottom of the sheet. The gift is recorded;")
    A("   a named individual is reduced to a role, because a donor's name attached")
    A("   to a gift is not this repository's to publish. */")
    A("const INVENTORY_NOTES = [")
    for n in notes:
        A(f"  {js_str(n)},")
    A("];")
    A("")
    A("const INVENTORY_SOURCE = {")
    A("  file:'LOMAMO Kisumu Master Inventory october 2026.xlsx',")
    A("  sheets:['OFFICE INVENTORY','KITCHEN INVENTORY','MEDICAL SUPPLIES'],")
    A("  alsoFrom:'LMMK Medical supplies inventory - OCT2026.xlsx',")
    A(f"  rows:{len(rows)},")
    A("  inRepository:false,")
    A("  note:'The workbooks stay on the office host. Only their structure is published.'")
    A("};")
    A("")
    return "\n".join(L)


# --------------------------------------------------------------------------
def redact(raw: list[dict]) -> tuple[list[dict], dict]:
    out, counts = [], {"serialsRemoved": 0, "valuesRemoved": 0, "locationsReduced": 0,
                       "descriptionsRedacted": 0, "platesRemoved": 0, "imeisRemoved": 0}
    for i, r in enumerate(raw, 1):
        cat = heading(r.get("cat") or "Unclassified") or "Unclassified"
        digits = re.sub(r"[^\d.]", "", str(r.get("qty") or ""))
        try:
            qty = int(float(digits)) if digits else 1
        except ValueError:
            qty = 1
        unit = "pair" if re.search(r"gumboot|pair|shoe", str(r.get("item") or ""), re.I) else "unit"
        serial_raw = str(r.get("serial") or "")
        value_raw = str(r.get("value") or "")
        loc_raw = str(r.get("loc") or "")
        desc_raw = str(r.get("desc") or "")
        tag = tag_of(serial_raw)
        if serial_raw.strip() and serial_raw.strip().upper() not in {"N/A", "NA"} and not tag:
            counts["serialsRemoved"] += 1
            counts["imeisRemoved"] += 1 if re.search(r"imei|\b3\d{14}\b", serial_raw, re.I) else 0
            counts["platesRemoved"] += 1 if PLATE.search(serial_raw) else 0
        if value_raw.strip() and value_raw.strip().upper() not in {"N/A", "NA"}:
            counts["valuesRemoved"] += 1
        loc = site_of(loc_raw)
        if loc != " ".join(loc_raw.split()):
            counts["locationsReduced"] += 1
        desc = desc_of(desc_raw)
        if desc != " ".join(desc_raw.split()):
            counts["descriptionsRedacted"] += 1
            counts["platesRemoved"] += len(PLATE.findall(desc_raw))
        out.append({
            "cat": cat,
            "date": str(r.get("date") or "")[:10],
            "item": " ".join(str(r.get("item") or "").split()),
            "qty": qty,
            "unit": unit,
            "desc": desc,
            "loc": loc,
            "serial": tag,
            "value": "",
            "cond": " ".join(str(r.get("cond") or "").split()) or "Good",
            "exist": " ".join(str(r.get("exist") or "").split()).upper(),
            "src": " ".join(str(r.get("src") or "").split()).upper(),
        })
    stats = {
        "removed": ["manufacturer serial numbers", "handset IMEI numbers",
                    "chassis numbers", "vehicle registration plates",
                    "monetary values", "staff names used as a location"],
        "counts": counts,
    }
    return out, stats


def check() -> int:
    """Audit the committed JavaScript. Exit 1 if a secret is present."""
    txt = OUT.read_text()
    fails = []
    for label, rx in (("vehicle registration plate", PLATE),
                      ("IMEI-like 15-digit number", re.compile(r"\b3\d{14}\b")),
                      ("long identifier run", LONG_DIGITS),
                      ("monetary value", MONEY)):
        hits = [m.group(0) for m in rx.finditer(txt)]
        hits = [h for h in hits if h not in {"LMMK", "LMM"}]
        if hits:
            fails.append(f"{label}: {len(hits)} hit(s) e.g. {hits[:3]}")
    for name in sorted(STAFF_TOKENS):
        if re.search(r"\b" + re.escape(name) + r"\b", txt, re.I):
            fails.append(f"staff name token present: {name}")
    m = re.search(r"const INVENTORY_SEED = \[(.*?)\n\];", txt, re.S)
    if not m:
        fails.append("INVENTORY_SEED not found")
    else:
        body = m.group(1)
        if re.search(r'value:"[^"]+"', body):
            fails.append("a row still carries a monetary value")
        if re.search(r'serial:"(?!LMM|LMMK)[^"]+"', body):
            fails.append("a row still carries a non-internal serial")
        print(f"  INVENTORY_SEED rows: {body.count('item:')}")
    if re.search(r'item:"\d+"', txt):
        fails.append("a narrative note row leaked into the register (item is a bare number)")
    if re.search(r'qty:\d{4,}', txt):
        fails.append("an implausible quantity survived - a note row was probably read as an item")
    if "function inventorySeed(" not in txt:
        fails.append("inventorySeed() is missing - the register would render empty")
    for const in ("INVENTORY_CATEGORIES", "INVENTORY_SITES", "INVENTORY_REDACTION",
                  "KITCHEN_CATALOG", "KITCHEN_COUNT_COLUMNS", "SUPPLY_CATALOG",
                  "SUPPLY_COUNT_COLUMNS", "INVENTORY_NOTES", "INVENTORY_SOURCE"):
        if f"const {const}" not in txt:
            fails.append(f"{const} is missing")
    if fails:
        print("FAIL")
        for f in fails:
            print("  x " + f)
        return 1
    print("  no plates, IMEIs, chassis numbers, values or staff names in the register")
    print("  inventorySeed() present; every structure constant present")
    print("OK")
    return 0


def replace_text_file(master: Path, out: Path) -> int:
    """Emit a git filter-repo --replace-text file for the UNAMBIGUOUS secrets.

    The identifiers did not only live in the workbooks. They were copied into
    v6/src/inventory_data.js and from there into every revision of the built
    bundle, the offline single-file app and the office kit ZIP. Dropping the
    workbook paths from history therefore does not remove them; the strings have
    to be rewritten inside the blobs that carry them.

    Only strings that cannot collide with anything else are listed. A short
    numeric asset value such as a four-figure price is deliberately NOT included:
    replacing it everywhere would corrupt unrelated numbers in unrelated files.
    Those values remain in historical bundles, which is one of the reasons
    document 22 recommends a fresh history over an in-place rewrite.

    The output file contains real secrets and must never be committed. Write it
    outside the repository, use it, then delete it.
    """
    import warnings
    import openpyxl
    warnings.filterwarnings("ignore")
    if not master.exists():
        print(f"the workbook is not at {master}; it is not stored in this repository")
        return 2
    found: set[str] = set()
    wb = openpyxl.load_workbook(str(master), data_only=True, read_only=True)
    for sheet in wb.sheetnames:
        for row in wb[sheet].iter_rows(values_only=True):
            for cell in row:
                if cell is None:
                    continue
                s = str(cell)
                found |= set(PLATE.findall(s))
                found |= set(re.findall(r"\b3\d{14}\b", s))                 # IMEI
                found |= set(re.findall(r"\b0\d{9}\b", s))                   # subscriber numbers
                found |= {m.group(0) for m in re.finditer(
                    r"(?:chassis\s*(?:no\.?|number)?\s*[:\-]?\s*)([A-HJ-NPR-Z0-9]{17})", s, re.I)}
                found |= {m.group(0) for m in re.finditer(
                    r"Kshs\.?\s*[\d.]+\s*(?:Million|million)", s)}
    wb.close()
    for rx, rep in NOTE_REDACTIONS:
        pass
    lines = ["# Generated by v6/tools/redact_inventory.py --replace-text-file.",
             "# Contains real secrets. Do not commit. Delete after use.",
             "# Use: git filter-repo --replace-text THIS_FILE --force"]
    for s in sorted(found):
        lines.append(f"literal:{s}==>REDACTED")
    out.write_text("\n".join(lines) + "\n")
    print(f"wrote {out} with {len(found)} replacement(s)")
    print("  git filter-repo --replace-text \"" + str(out) + "\" --force")
    print("  then delete that file: it holds the secrets it removes")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--master", default=str(MASTER_DEFAULT))
    ap.add_argument("--supplies", default=str(SUPPLIES_DEFAULT))
    ap.add_argument("--check", action="store_true", help="audit the committed JS only")
    ap.add_argument("--replace-text-file", metavar="OUT",
                    help="write a git filter-repo replacements file (never commit it)")
    args = ap.parse_args()

    if args.replace_text_file:
        return replace_text_file(Path(args.master), Path(args.replace_text_file))

    if args.check:
        print("LOMAMO C-DIMS · inventory register redaction audit")
        print("-" * 64)
        return check()

    master, supplies = Path(args.master), Path(args.supplies)
    if not master.exists():
        print(f"the master inventory workbook is not at {master}")
        print("It is deliberately not stored in this repository. Run this against a")
        print("copy on the office host, or audit the committed file with --check.")
        return 2
    try:
        import openpyxl  # noqa: F401
    except ImportError:
        print("openpyxl is required: python3 -m pip install --user openpyxl")
        return 2

    raw, notes = read_office(master)
    rows, stats = redact(raw)
    cats = read_categories(raw) or CATEGORY_FALLBACK
    sites = sorted({r["loc"] for r in rows if r["loc"]})
    kitchen, kcols = ([], [])
    try:
        kitchen, kcols = read_kitchen(master)
    except Exception as exc:
        print(f"  kitchen sheet skipped ({exc})")
    sup, scols, _ = ([], [], [])
    try:
        sup, scols, _ = read_supplies(master, supplies if supplies.exists() else None)
    except Exception as exc:
        print(f"  supply sheets skipped ({exc})")

    OUT.write_text(emit(rows, cats, sites, kitchen, kcols, sup, scols, stats, notes))
    c = stats["counts"]
    print("wrote", OUT.relative_to(ROOT))
    print(f"  rows                : {len(rows)}")
    print(f"  serials removed     : {c['serialsRemoved']} ({c['imeisRemoved']} IMEIs)")
    print(f"  values removed      : {c['valuesRemoved']}")
    print(f"  locations reduced   : {c['locationsReduced']}")
    print(f"  descriptions cleaned: {c['descriptionsRedacted']} ({c['platesRemoved']} plates)")
    print(f"  kitchen items       : {len(kitchen)} in {len(kcols)} count columns")
    print(f"  supply items        : {len(sup)} in {len(scols)} count columns")
    print(f"  sites               : {len(sites)}")
    print(f"  acquisition notes   : {len(notes)}")
    return check()


if __name__ == "__main__":
    sys.exit(main())
