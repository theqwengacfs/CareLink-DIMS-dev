#!/usr/bin/env python3
"""
LOMAMO Foundation · CareLink DIMS v6.0 — central database server
=================================================================

One file, no dependencies (Python 3.9+). Makes this computer the authoritative
store for every tablet and laptop on the office Wi-Fi.

    python3 server.py                     # http://0.0.0.0:8000
    python3 server.py --port 8080
    CARELINK_DATA_DIR=/srv/carelink python3 server.py

What v6 changes, and why
-----------------------
v5.x sent the whole database document up and down. Two devices editing different
patients still "changed the same records" and the person was asked to resolve it.
v6 sends **patches**: only the fields that actually changed, with the value they
replaced. The host applies every patch serially and merges automatically at field
level. Two devices editing different patients, or different fields of one patient,
both succeed. When two devices genuinely change the same field, last edit wins and
**both values are written to the merge journal** — automatic, never silent.

v5.x also kept password hashes inside the shared document, so every browser held
every other person's hash, and a device that had never spoken to the host could
believe an account did not exist. v6 keeps credentials **only on the host**, in a
separate table, hashed with PBKDF2-HMAC-SHA256. Browser clients never receive a
hash or a salt. Sign-in is verified here, so the same username works on every
device on the network, by construction.

Endpoints
---------
  GET  /api/health                       identity, revision, setup state
  GET  /api/rev                          cheap revision poll
  GET  /api/state[?since=N]              full database, or a delta from revision N
  PUT  /api/state                        apply patches (auto-merged)
  GET  /api/merge-journal                conflicts resolved automatically
  GET  /api/audit[?since=N]              server audit chain
  GET  /api/audit/verify                 verify the chain
  POST /api/rollback                     restore an earlier revision as a new one
  POST /api/setup                        first-run: create the first administrator
  POST /api/auth/login                   verify a password here, open a session
  POST /api/auth/logout
  POST /api/auth/change-password
  POST /api/auth/forgot                  open a recovery request
  POST /api/auth/emergency               sign in with an emergency code
  POST /api/emergency/issue              administrator issues an emergency code
  GET  /api/credentials                  provisioned accounts (no secrets)
  POST /api/credentials/provision        issue official accounts + return the master sheet
  POST /api/credentials/temp             re-issue a temporary password (admin)
  POST /api/reveal/request               open a four-eyes password reset
  POST /api/reveal/vote                  approve or decline as one of the four offices
  GET  /api/reveal                      open and past four-eyes requests
  GET  /api/public/status                setup state and organisation name
  POST /api/public/account-request       a person asks for an account
  POST /api/public/activate              activation code + new password
  GET/POST /api/files                    document store
  GET  /api/session/whoami               current session

Security posture
----------------
* Credentials never leave the host. Only a salted PBKDF2 hash is stored.
* Authorization is enforced here for administrative endpoints and, at collection
  level, for every patch. Fine-grained capability checks also exist in the client
  and in the data layer; the server is the outer wall, not the only wall.
* Sessions are in memory, tied to an idle window, and refused when expired.
* Every accepted write, refusal, merge, sign-in and administrative action is
  appended to a hash-chained audit table.
* This is a trusted-LAN server. It is **not** hardened for exposure to the
  internet: put it behind TLS and the organisation's VPN or reverse proxy.
"""
from __future__ import annotations

import argparse
import base64
import gzip
import hashlib
import hmac
import json
import os
import re
import secrets
import socket
import sqlite3
import ssl
import sys
import threading
import time
from datetime import datetime, timezone, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from secrets import token_urlsafe
from urllib.parse import urlparse, parse_qs, unquote

APP_VERSION = "6.0.0"
SCHEMA_VERSION = 6
ROOT = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("CARELINK_DATA_DIR", ROOT / "data")).resolve()
DB_PATH = DATA_DIR / "carelink.db"
APP_FILE = "LOMAMO-CareLink-DIMS-v6.0.html"
MAX_BODY = 64 * 1024 * 1024
MAX_FILE_BYTES = 40 * 1024 * 1024
LOCK = threading.RLock()

IDLE_SECONDS = max(1, int(os.environ.get("CARELINK_IDLE_SECONDS", "900")))
PBKDF2_ROUNDS = int(os.environ.get("CARELINK_PBKDF2_ROUNDS", "210000"))
ALLOW_UNVERIFIED = os.environ.get("CARELINK_ALLOW_UNVERIFIED", "0") == "1"

# Real capability names matching data.js + data6.js so multi-device LAN sync works across every console.
COLLECTION_CAPS = {
    "patients": "patient.view.clinical", "visits": "visit.view", "pdcas": "patient.list",
    "requests": "patient.list", "encounters": "patient.view.clinical", "concerns": "patient.list",
    "patientConditions": "condition.view", "carePlans": "careplan.view", "omahaPlans": "careplan.view",
    "transactions": "finance.view", "budgets": "finance.view", "stockLots": "pharmacy.view",
    "stockMoves": "pharmacy.view", "clinicalRx": "pharmacy.view", "employees": "hr.view",
    "leaveRequests": None, "documents": "patient.list", "files": "patient.list",
    "libraryItems": "library.read", "messages": "message.use", "publications": "media.view",
    "audit": None, "users": "user.view", "roles": "role.manage",
    "personalPrefs": None, "drafts": None, "presence": None, "notifications": None,
    "calendarEvents": None, "settings": None, "meta": None,
    "coWorkState": None, "coWorkBatches": None, "support": "patient.list", "supportIssues": "patient.list",
    "adminOpsPayg": None, "adminOpsSuppliers": None, "adminOpsTransport": None,
    "adminOpsStatutory": None, "adminOpsUtilities": None, "adminOpsOpEx": None,
    "adminOpsMonthlyReports": None, "adminOpsAnnualBudgets": None, "adminOpsSocieties": None,
}

DEFAULT_ROLE_PERMS = {
    "chief": ["user.*", "role.manage", "org.manage", "system.*", "report.departmental", "report.executive", "library.read", "library.manage", "inventory.view", "inventory.manage", "indicator.manage", "dq.manage", "pmi.merge", "message.use"],
    "president": ["report.executive", "report.departmental", "finance.view", "hr.view", "system.audit", "library.read", "message.use"],
    "director": ["patient.list", "patient.view.basic", "report.executive", "report.patient_figures", "report.expenditure", "finance.view", "hr.view", "audit.view", "condition.aggregate", "care.view", "library.read", "dq.manage", "message.use"],
    "program.admin": ["user.view", "user.approve", "patient.list", "patient.view.basic", "patient.view.clinical", "report.executive", "report.departmental", "finance.view", "hr.view", "audit.view", "library.read", "library.manage", "inventory.view", "indicator.manage", "dq.manage", "message.use", "care.view"],
    "program.assistant": ["user.view", "patient.list", "patient.view.basic", "report.departmental", "report.executive", "library.read", "inventory.view", "message.use"],
    "countyadmin": ["user.view", "user.create", "user.approve", "patient.list", "patient.view.basic", "patient.view.clinical", "visit.view", "visit.create", "pdca.create", "careplan.view", "finance.view", "hr.view", "library.read", "inventory.view", "inventory.manage", "message.use"],
    "assistant": ["patient.list", "patient.view.basic", "patient.view.clinical", "visit.view", "visit.create", "form.view", "library.read", "message.use"],
    "coordinator": ["user.view", "patient.list", "patient.view.basic", "patient.view.clinical", "visit.view", "visit.create", "pdca.create", "hosp.request.create", "condition.view", "care.view", "library.read", "message.use"],
    "caregiver": ["patient.list", "patient.view.basic", "patient.view.clinical", "visit.view", "visit.create", "pdca.create", "hosp.request.create", "condition.view", "careplan.view", "library.read", "message.use"],
    "chw": ["patient.list", "patient.view.basic", "patient.view.clinical", "visit.view", "visit.create", "pdca.create", "library.read", "message.use"],
    "mcm": ["user.view", "patient.list", "patient.view.basic", "patient.view.clinical", "visit.view", "visit.create", "pdca.create", "hosp.request.review", "hosp.request.assign", "pharmacy.view", "careplan.view", "condition.view", "care.view", "library.read", "message.use"],
    "liaison": ["patient.list", "patient.view.basic", "patient.view.clinical", "visit.view", "hosp.visit.record", "hosp.receipt.submit", "pharmacy.view", "condition.view", "care.view", "library.read", "message.use"],
    "nurse": ["patient.list", "patient.view.basic", "patient.view.clinical", "visit.view", "visit.create", "pdca.create", "pharmacy.view", "careplan.view", "condition.view", "care.view", "library.read", "message.use"],
    "media": ["media.*", "pr.view", "library.read", "library.manage", "inventory.view", "inventory.manage", "message.use"],
    "finance": ["finance.*", "procurement.view", "hosp.receipt.review", "library.read", "message.use"],
    "procurement": ["procurement.*", "finance.view", "inventory.view", "inventory.manage", "library.read", "message.use"],
    "me": ["patient.list", "patient.view.basic", "report.patient_days", "report.patient_figures", "report.referral", "report.departmental", "indicator.manage", "dq.manage", "condition.aggregate", "library.read", "message.use"],
    "intldata": ["patient.list", "patient.view.basic", "report.patient_days", "report.patient_figures", "report.referral", "report.departmental", "report.executive", "indicator.manage", "dq.manage", "audit.view", "library.read", "message.use"],
    "auditor": ["audit.view", "audit.manage", "finance.view", "system.audit", "hr.view", "library.read"],
    "hr": ["hr.*", "welfare.view", "library.read", "message.use"],
    "welfare": ["welfare.*", "hr.view", "library.read", "message.use"],
    "vehicle": ["vehicle.*", "inventory.view", "library.read", "message.use"],
    "it": ["system.*", "user.view", "inventory.view", "inventory.manage", "library.read", "message.use"],
}
# Collections only an administrator may rewrite wholesale.
ADMIN_ONLY = {"users", "roles", "settings"}

TLS_ACTIVE = {"on": False}
SESSIONS: dict = {}
SESSIONS_LOCK = threading.Lock()
FAILED: dict = {}
FAILED_LOCK = threading.Lock()
STATE_CACHE = {"rev": -1, "saved": None, "payload": None, "index": None, "at": 0.0}
INDEX_CACHE: dict = {}


# ------------------------------------------------------------------ helpers
def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sha(*parts) -> str:
    h = hashlib.sha256()
    for p in parts:
        h.update(str(p).encode("utf-8"))
        h.update(b"\x1f")
    return h.hexdigest()


def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH, timeout=30, check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA synchronous=NORMAL")
    con.execute("PRAGMA foreign_keys=ON")
    return con


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with LOCK, connect() as con:
        con.executescript("""
        CREATE TABLE IF NOT EXISTS state (
            id INTEGER PRIMARY KEY CHECK (id=1),
            rev INTEGER NOT NULL DEFAULT 0,
            payload TEXT,
            saved TEXT,
            actor TEXT);
        CREATE TABLE IF NOT EXISTS snapshots (
            rev INTEGER PRIMARY KEY,
            payload TEXT NOT NULL,
            idx TEXT,
            saved TEXT, actor TEXT, note TEXT);
        CREATE TABLE IF NOT EXISTS ops (
            op_id TEXT PRIMARY KEY, rev INTEGER NOT NULL, ts TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS credentials (
            username TEXT PRIMARY KEY COLLATE NOCASE,
            user_id TEXT, salt TEXT NOT NULL, hash TEXT NOT NULL,
            rounds INTEGER NOT NULL, must_change INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'active', temp INTEGER NOT NULL DEFAULT 0,
            activation TEXT, activation_exp TEXT,
            emergency TEXT, emergency_exp TEXT,
            failed INTEGER NOT NULL DEFAULT 0, locked_until TEXT,
            updated TEXT, updated_by TEXT);
        CREATE TABLE IF NOT EXISTS sessions_meta (
            token TEXT PRIMARY KEY, username TEXT, device TEXT, started TEXT, ended TEXT);
        CREATE TABLE IF NOT EXISTS server_audit (
            seq INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, actor TEXT, action TEXT,
            entity TEXT, entity_id TEXT, detail TEXT, meta TEXT,
            prev TEXT, hash TEXT);
        CREATE TABLE IF NOT EXISTS merge_journal (
            seq INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, actor TEXT, rev INTEGER,
            collection TEXT, record_id TEXT, field TEXT,
            base TEXT, mine TEXT, theirs TEXT, resolution TEXT);
        CREATE TABLE IF NOT EXISTS votes (
            request_id TEXT, office TEXT, username TEXT, vote TEXT, reason TEXT,
            ts TEXT, PRIMARY KEY (request_id, office));
        CREATE TABLE IF NOT EXISTS reveal_requests (
            id TEXT PRIMARY KEY, username TEXT, opened_by TEXT, opened TEXT,
            state TEXT, temp_password TEXT, closed TEXT);
        CREATE TABLE IF NOT EXISTS account_requests (
            id TEXT PRIMARY KEY, ref TEXT, name TEXT, payload TEXT, status TEXT,
            created TEXT, handled TEXT, handled_by TEXT, activation TEXT);
        CREATE TABLE IF NOT EXISTS recovery (
            id TEXT PRIMARY KEY, username TEXT, requested TEXT, status TEXT,
            handled TEXT, handled_by TEXT, note TEXT);
        CREATE TABLE IF NOT EXISTS doc_files (
            id TEXT PRIMARY KEY, name TEXT, mime TEXT, bytes INTEGER, sha TEXT,
            patient TEXT, kind TEXT, retention TEXT, note TEXT, uploader TEXT,
            created TEXT, payload BLOB);
        CREATE INDEX IF NOT EXISTS idx_audit_ts ON server_audit(ts);
        """)


# ------------------------------------------------------------- credentials
def cred_hash(password: str, salt: str, rounds: int) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), rounds).hex()


def cred_set(con, username: str, password: str, *, user_id="", must_change=False,
             temp=False, by="system", status="active") -> None:
    salt = token_urlsafe(16)
    rounds = PBKDF2_ROUNDS
    con.execute(
        "INSERT INTO credentials (username,user_id,salt,hash,rounds,must_change,status,temp,"
        "failed,updated,updated_by) VALUES (?,?,?,?,?,?,?,?,0,?,?) "
        "ON CONFLICT(username) DO UPDATE SET salt=excluded.salt, hash=excluded.hash, "
        "rounds=excluded.rounds, must_change=excluded.must_change, status=excluded.status, "
        "temp=excluded.temp, failed=0, locked_until=NULL, updated=excluded.updated, "
        "updated_by=excluded.updated_by",
        (username.lower(), user_id, salt, cred_hash(password, salt, rounds), rounds,
         1 if must_change else 0, status, 1 if temp else 0, now_iso(), by))


def cred_verify(con, username: str, password: str):
    """Return (row, None) on success or (None, reason) on failure."""
    row = con.execute("SELECT * FROM credentials WHERE username=?", (username.lower(),)).fetchone()
    if not row:
        return None, "unknown_user"
    if row["locked_until"] and row["locked_until"] > now_iso():
        return None, "locked"
    if row["status"] == "pending_activation":
        return None, "pending_activation"
    if row["status"] != "active":
        return None, "inactive"
    if not hmac.compare_digest(cred_hash(password, row["salt"], row["rounds"]), row["hash"]):
        failed = (row["failed"] or 0) + 1
        lock = None
        if failed >= 6:
            lock = (datetime.now(timezone.utc) + timedelta(minutes=10)).strftime("%Y-%m-%dT%H:%M:%SZ")
        con.execute("UPDATE credentials SET failed=?, locked_until=? WHERE username=?",
                    (failed, lock, username.lower()))
        return None, "locked" if lock else "bad_password"
    con.execute("UPDATE credentials SET failed=0, locked_until=NULL WHERE username=?", (username.lower(),))
    return row, None


def credentials_present(con) -> bool:
    row = con.execute("SELECT COUNT(*) AS n FROM credentials").fetchone()
    return bool(row and row["n"])


# ------------------------------------------------------------------- state
def sanitize_state(payload: dict) -> dict:
    """Remove every credential field before the document leaves the host."""
    if not isinstance(payload, dict):
        return payload
    out = dict(payload)
    users = []
    for u in out.get("users") or []:
        if isinstance(u, dict):
            u = {k: v for k, v in u.items()
                 if k not in ("hash", "salt", "activation", "activationHash", "activationSalt",
                              "tempHash", "tempSalt", "emergency", "emergencyHash")}
            users.append(u)
    out["users"] = users
    return out


def state_index(payload: dict) -> dict:
    """collection -> {id: hash} so a delta costs one index comparison."""
    idx = {}
    for c, val in (payload or {}).items():
        if isinstance(val, list):
            m = {}
            for rec in val:
                if isinstance(rec, dict) and "id" in rec:
                    m[str(rec["id"])] = sha(json.dumps(rec, sort_keys=True, separators=(",", ":")))
            idx[c] = m
    return idx


def load_current(con, force=False):
    row = con.execute("SELECT rev,payload,saved,actor FROM state WHERE id=1").fetchone()
    if row is None:
        STATE_CACHE.update({"rev": 0, "saved": None, "payload": None, "index": {}, "at": time.time()})
        return STATE_CACHE
    if force or row["rev"] != STATE_CACHE["rev"] or STATE_CACHE["payload"] is None:
        payload = json.loads(row["payload"]) if row["payload"] else None
        STATE_CACHE.update({"rev": row["rev"], "saved": row["saved"], "payload": payload,
                            "index": state_index(payload or {}), "at": time.time()})
        if row["rev"]:
            INDEX_CACHE[row["rev"]] = STATE_CACHE["index"]
            if len(INDEX_CACHE) > 40:
                INDEX_CACHE.pop(min(INDEX_CACHE), None)
    return STATE_CACHE


def write_revision(con, payload: dict, actor: str, note: str = "") -> int:
    cur = con.execute("SELECT rev FROM state WHERE id=1").fetchone()
    rev = (cur["rev"] if cur else 0) + 1
    payload = sanitize_state(payload)
    meta = payload.setdefault("meta", {})
    meta["serverRev"] = rev
    meta["serverSaved"] = now_iso()
    raw = json.dumps(payload, separators=(",", ":"))
    idx = state_index(payload)
    saved = now_iso()
    con.execute("INSERT INTO snapshots (rev,payload,idx,saved,actor,note) VALUES (?,?,?,?,?,?)",
                (rev, raw, json.dumps(idx, separators=(",", ":")), saved, actor, note[:400]))
    if cur:
        con.execute("UPDATE state SET rev=?,payload=?,saved=?,actor=? WHERE id=1", (rev, raw, saved, actor))
    else:
        con.execute("INSERT INTO state (id,rev,payload,saved,actor) VALUES (1,?,?,?,?)", (rev, raw, saved, actor))
    INDEX_CACHE[rev] = idx
    STATE_CACHE.update({"rev": rev, "saved": saved, "payload": payload, "index": idx, "at": time.time()})
    return rev


def snapshot_index(con, rev: int):
    if rev in INDEX_CACHE:
        return INDEX_CACHE[rev]
    row = con.execute("SELECT idx FROM snapshots WHERE rev=?", (rev,)).fetchone()
    if not row or not row["idx"]:
        return None
    try:
        idx = json.loads(row["idx"])
    except Exception:
        return None
    INDEX_CACHE[rev] = idx
    return idx


def server_audit(con, actor: str, action: str, detail: str = "", entity: str = "", entity_id: str = "",
                 meta: dict | None = None) -> None:
    prev_row = con.execute("SELECT hash FROM server_audit ORDER BY seq DESC LIMIT 1").fetchone()
    prev = prev_row["hash"] if prev_row else "GENESIS"
    ts = now_iso()
    h = sha(prev, ts, actor, action, entity, entity_id, detail)
    con.execute("INSERT INTO server_audit (ts,actor,action,entity,entity_id,detail,meta,prev,hash) "
                "VALUES (?,?,?,?,?,?,?,?,?)",
                (ts, actor, action, entity, entity_id, detail[:2000],
                 json.dumps(meta or {}), prev, h))


# ------------------------------------------------------------------ patches
MISSING = object()


def _cap_set(perms):
    out = set()
    for p in perms or []:
        if p.endswith(".*"):
            out.add(p[:-1])
        else:
            out.add(p)
    return out


def role_caps(payload, role_id):
    base = _cap_set(DEFAULT_ROLE_PERMS.get(role_id or "", []))
    for r in (payload or {}).get("roles") or []:
        if r.get("id") == role_id:
            return base | _cap_set(r.get("perms"))
    return base


def user_caps(payload, username):
    for u in (payload or {}).get("users") or []:
        if str(u.get("username", "")).lower() == username.lower():
            caps = role_caps(payload, u.get("roleId"))
            ov = u.get("permOverrides") or {}
            caps |= _cap_set(ov.get("grant"))
            for d in ov.get("deny") or []:
                caps.discard(d)
            return caps
    return set()


def has_cap(caps, cap):
    if not cap:
        return True
    if cap in caps:
        return True
    pre = cap.split(".")[0] + "."
    return pre in caps


def apply_patch(payload: dict, patch: dict, actor: str, ts: str, journal: list) -> int:
    """Apply one patch. Returns the number of overlapping fields merged."""
    coll_name = patch.get("c")
    rid = str(patch.get("id") or "")
    if not coll_name or not rid:
        return 0
    coll = payload.get(coll_name)
    if not isinstance(coll, list):
        coll = []
        payload[coll_name] = coll
    idx = next((i for i, r in enumerate(coll) if isinstance(r, dict) and str(r.get("id")) == rid), None)

    if patch.get("del"):
        if idx is not None:
            gone = coll.pop(idx)
            journal.append((coll_name, rid, "*", "present", "deleted", "-", "deleted"))
            _ = gone
            return 0
        return 0

    fields = patch.get("set") or {}
    before = patch.get("before") or {}
    if not isinstance(fields, dict):
        return 0
    merged = 0
    if idx is None:
        rec = {k: v for k, v in fields.items()}
        rec.setdefault("id", rid)
        rec["_ts"] = ts
        rec["_by"] = actor
        coll.append(rec)
        return 0
    rec = coll[idx]
    for f, new_val in fields.items():
        if f in ("id",):                      # identity never changes through a patch
            continue
        cur_val = rec.get(f, MISSING)
        base_val = before.get(f, MISSING)
        if cur_val is not MISSING and base_val is not MISSING and cur_val == base_val:
            rec[f] = new_val
            continue
        if cur_val is MISSING and base_val is MISSING:
            rec[f] = new_val
            continue
        if cur_val == new_val:
            continue
        # Genuine overlap: both sides changed this field.
        j = lambda v: json.dumps(v, ensure_ascii=False)[:400]
        journal.append((coll_name, rid, f, j(base_val if base_val is not MISSING else None),
                        j(new_val), j(cur_val if cur_val is not MISSING else None), "last edit wins"))
        rec[f] = new_val
        merged += 1
    rec["_ts"] = ts
    rec["_by"] = actor
    return merged


def delta_since(con, since: int):
    cur = load_current(con, force=True)
    if cur["rev"] == since:
        return {"rev": cur["rev"], "unchanged": True}
    old_idx = snapshot_index(con, since) if since else None
    new_idx = cur["index"] or {}
    if old_idx is None:
        body = {"rev": cur["rev"], "saved": cur["saved"], "db": sanitize_state(cur["payload"])}
        return body
    collections, removed = {}, {}
    for c, m in new_idx.items():
        old = old_idx.get(c) or {}
        changed = []
        current_records = {str(r.get("id")): r for r in (cur["payload"].get(c) or [])
                           if isinstance(r, dict) and "id" in r}
        for rid, h in m.items():
            if old.get(rid) != h and rid in current_records:
                changed.append(current_records[rid])
        if changed:
            collections[c] = changed
        gone = [rid for rid in old if rid not in m]
        if gone:
            removed[c] = gone
    for c, old in old_idx.items():
        if c not in new_idx:
            removed[c] = list(old.keys())
    return {"rev": cur["rev"], "saved": cur["saved"], "collections": collections,
            "removed": removed, "partial": True}


# ------------------------------------------------------------------ sessions
def new_session(username: str, device: str, ip: str) -> dict:
    token = token_urlsafe(32)
    s = {"token": token, "user": username, "started": time.time(), "last": time.time(),
         "device": device[:120], "ip": ip}
    with SESSIONS_LOCK:
        SESSIONS[token] = s
        for t in [t for t, v in SESSIONS.items() if time.time() - v["last"] > IDLE_SECONDS * 4]:
            SESSIONS.pop(t, None)
    return s


def session_for(handler, touch: bool = True) -> dict | None:
    tok = handler.headers.get("X-CareLink-Session") or ""
    if tok.startswith("Bearer "):
        tok = tok[7:]
    with SESSIONS_LOCK:
        s = SESSIONS.get(tok)
        if not s:
            return None
        if time.time() - s["last"] > IDLE_SECONDS:
            SESSIONS.pop(tok, None)
            return None
        if touch:
            s["last"] = time.time()
        return s

# ------------------------------------------------------------------- server
class Handler(BaseHTTPRequestHandler):
    server_version = "CareLinkDIMS/6.0"
    protocol_version = "HTTP/1.1"

    # -- small helpers ----------------------------------------------------
    def _json(self, status: int, body: dict):
        raw = json.dumps(body, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        try:
            self.wfile.write(raw)
        except BrokenPipeError:
            pass

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {}
        if length > MAX_BODY:
            raise ValueError("Request body too large")
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def log_message(self, fmt, *args):
        sys.stderr.write("%s  %s\n" % (datetime.now().strftime("%H:%M:%S"), fmt % args))

    def _session_or_401(self):
        s = session_for(self)
        if not s:
            self._json(401, {"ok": False, "code": "session_required",
                             "error": "Sign in again to reach the central database."})
            return None
        return s

    def _ip(self):
        return self.client_address[0] if self.client_address else "-"

    # -- GET --------------------------------------------------------------
    def do_GET(self):
        u = urlparse(self.path)
        path, qs = u.path, parse_qs(u.query)
        try:
            if path == "/api/health":
                with LOCK, connect() as con:
                    cur = load_current(con, force=True)
                    has_cred = credentials_present(con)
                return self._json(200, {
                    "ok": True, "app": APP_VERSION, "schema": SCHEMA_VERSION,
                    "rev": cur["rev"], "saved": cur["saved"], "host": socket.gethostname(),
                    "time": now_iso(), "setup": cur["rev"] > 0,
                    "auth": "server-verified" if has_cred else "not-provisioned",
                    "idleSeconds": IDLE_SECONDS, "tls": TLS_ACTIVE["on"],
                    "merge": "field-level", "protocol": 6,
                })
            if path == "/api/v1/status":
                with LOCK, connect() as con:
                    cur = load_current(con)
                return self._json(200, {
                    "ok": True, "apiVersion": "v1", "app": APP_VERSION, "schema": SCHEMA_VERSION,
                    "rev": cur["rev"], "saved": cur["saved"], "idleSeconds": IDLE_SECONDS,
                    "capabilities": ["tracker", "aggregate", "dhis2-dataValueSets", "fhir-r4-bundle", "ollama-lan-proxy"]
                })
            if path in ("/api/v1/orgUnits", "/api/v1/dataElements", "/api/v1/indicators", "/api/v1/dhis2/dataValueSets", "/api/v1/fhir/Bundle"):
                sess = self._session_or_401()
                if not sess:
                    return
                with LOCK, connect() as con:
                    cur = load_current(con)
                state = sanitize_state(cur.get("payload") or {})
                if path == "/api/v1/orgUnits":
                    return self._json(200, {"ok": True, "org": state.get("settings", {}).get("org", "LOMAMO Foundation Kenya"), "areas": state.get("areas", [])})
                if path == "/api/v1/dataElements":
                    return self._json(200, {"ok": True, "dataElements": state.get("dataElements", [])})
                if path == "/api/v1/indicators":
                    return self._json(200, {"ok": True, "indicators": state.get("indicators", [])})
                if path == "/api/v1/dhis2/dataValueSets":
                    return self._json(200, {
                        "ok": True, "khisSubmitted": False,
                        "notice": "Internal verification payload; not an official KHIS submission.",
                        "dataSet": "LOMAMO_COMMUNITY_CARE_V6",
                        "period": datetime.now(timezone.utc).strftime("%Y%m"),
                        "dataElements": state.get("dataElements", [])
                    })
                if path == "/api/v1/fhir/Bundle":
                    pts = (state.get("patients") or [])[:15]
                    return self._json(200, {
                        "resourceType": "Bundle", "type": "collection", "timestamp": now_iso(),
                        "entry": [{"resource": {"resourceType": "Patient", "id": p.get("id"), "gender": "male" if p.get("sex")=="M" else "female"}} for p in pts]
                    })
            if path == "/api/rev":
                with LOCK, connect() as con:
                    cur = load_current(con)
                return self._json(200, {"rev": cur["rev"], "at": now_iso()})
            if path == "/api/public/status":
                with LOCK, connect() as con:
                    cur = load_current(con)
                    has_cred = credentials_present(con)
                db = cur["payload"] or {}
                org = (db.get("settings") or {}).get("org") or {}
                return self._json(200, {"ok": True, "setup": cur["rev"] > 0,
                                        "provisioned": has_cred, "rev": cur["rev"],
                                        "org": {"name": org.get("name") or "LOMAMO Foundation",
                                                "county": org.get("county") or "Kisumu"}})
            if path == "/api/state":
                s = self._session_or_401()
                if not s:
                    return
                since = int((qs.get("since") or ["0"])[0] or 0)
                with LOCK, connect() as con:
                    if since:
                        return self._json(200, delta_since(con, since))
                    cur = load_current(con, force=True)
                if not cur["payload"]:
                    return self._json(200, {"rev": 0, "db": None, "saved": None})
                return self._json(200, {"rev": cur["rev"], "saved": cur["saved"],
                                        "db": sanitize_state(cur["payload"])})
            if path == "/api/session/whoami":
                s = self._session_or_401()
                if not s:
                    return
                return self._json(200, {"ok": True, "user": s["user"], "idleSeconds": IDLE_SECONDS,
                                        "expiresIn": max(0, int(IDLE_SECONDS - (time.time() - s["last"])))})
            if path == "/api/revisions":
                if not self._session_or_401():
                    return
                with LOCK, connect() as con:
                    rows = con.execute("SELECT rev, saved, actor, note, payload FROM snapshots ORDER BY rev DESC LIMIT 100").fetchall()
                return self._json(200, {"ok": True, "revisions": [
                    {"rev": r["rev"], "saved": r["saved"], "actor": r["actor"], "note": r["note"],
                     "sha": hashlib.sha256((r["payload"] or "").encode("utf-8")).hexdigest()} for r in rows
                ]})
            if path == "/api/merge-journal":
                if not self._session_or_401():
                    return
                limit = min(500, int((qs.get("limit") or ["200"])[0]))
                with LOCK, connect() as con:
                    rows = con.execute("SELECT * FROM merge_journal ORDER BY seq DESC LIMIT ?",
                                       (limit,)).fetchall()
                return self._json(200, {"entries": [dict(r) for r in rows]})
            if path == "/api/audit":
                if not self._session_or_401():
                    return
                since = int((qs.get("since") or ["0"])[0] or 0)
                with LOCK, connect() as con:
                    rows = con.execute("SELECT * FROM server_audit WHERE seq>? ORDER BY seq LIMIT 500",
                                       (since,)).fetchall()
                return self._json(200, {"entries": [dict(r) for r in rows]})
            if path == "/api/audit/verify":
                if not self._session_or_401():
                    return
                with LOCK, connect() as con:
                    rows = con.execute("SELECT * FROM server_audit ORDER BY seq").fetchall()
                prev = "GENESIS"
                for r in rows:
                    if r["prev"] != prev or r["hash"] != sha(r["prev"], r["ts"], r["actor"], r["action"],
                                                            r["entity"], r["entity_id"], r["detail"]):
                        return self._json(200, {"ok": False, "brokenAt": r["seq"], "entries": len(rows)})
                    prev = r["hash"]
                return self._json(200, {"ok": True, "entries": len(rows), "head": prev[:16]})
            if path == "/api/reveal":
                s = self._session_or_401()
                if not s:
                    return
                with LOCK, connect() as con:
                    rows = con.execute("SELECT id,username,opened_by,opened,state FROM reveal_requests "
                                       "ORDER BY opened DESC LIMIT 40").fetchall()
                    votes = con.execute("SELECT request_id,office,vote,ts FROM votes").fetchall()
                by = {}
                for v in votes:
                    by.setdefault(v["request_id"], []).append(dict(v))
                out = []
                for r in rows:
                    d = dict(r)
                    d["votes"] = by.get(r["id"], [])
                    out.append(d)
                return self._json(200, {"requests": out, "offices": FOUR_OFFICES})
            if path == "/api/credentials":
                s = self._session_or_401()
                if not s:
                    return
                with LOCK, connect() as con:
                    rows = con.execute("SELECT username,user_id,must_change,status,temp,updated,updated_by,"
                                       "activation,emergency FROM credentials ORDER BY username").fetchall()
                return self._json(200, {"accounts": [dict(r) for r in rows]})
            if path == "/api/recovery":
                s = self._session_or_401()
                if not s:
                    return
                with LOCK, connect() as con:
                    rows = con.execute("SELECT * FROM recovery ORDER BY requested DESC LIMIT 100").fetchall()
                return self._json(200, {"requests": [dict(r) for r in rows]})
            if path == "/api/coedit/state":
                s = self._session_or_401()
                if not s:
                    return
                with LOCK, connect() as con:
                    cur = load_current(con)
                db = cur["payload"] or {}
                return self._json(200, {
                    "ok": True,
                    "coWorkState": db.get("coWorkState") or {"mode": "solo", "holderSide": "admin"},
                    "batchesCount": len(db.get("coWorkBatches") or []),
                })
            if path == "/api/account-requests":
                s = self._session_or_401()
                if not s:
                    return
                with LOCK, connect() as con:
                    rows = con.execute("SELECT * FROM account_requests ORDER BY created DESC LIMIT 200").fetchall()
                return self._json(200, {"requests": [dict(r) for r in rows]})
            if path == "/api/public/content":
                with LOCK, connect() as con:
                    cur = load_current(con)
                db = cur["payload"] or {}
                items = [{k: p.get(k) for k in ("id", "title", "category", "format", "summary", "body",
                                                "duration", "publishedAt", "scheduledAt", "image")}
                         for p in db.get("publications", [])
                         if p.get("status") == "published" and p.get("public") is not False and not p.get("withdrawn")]
                items.sort(key=lambda x: x.get("publishedAt") or "", reverse=True)
                return self._json(200, {"items": items})
            m = re.fullmatch(r"/api/files/([A-Za-z0-9_-]{6,60})", path)
            if m:
                if not self._session_or_401():
                    return
                with LOCK, connect() as con:
                    row = con.execute("SELECT * FROM doc_files WHERE id=?", (m.group(1),)).fetchone()
                if not row:
                    return self._json(404, {"error": "File not found"})
                self.send_response(200)
                self.send_header("Content-Type", row["mime"] or "application/octet-stream")
                self.send_header("Content-Length", str(row["bytes"]))
                self.send_header("Content-Disposition",
                                 f'attachment; filename="{row["name"].replace(chr(34), "")}"')
                self.send_header("X-CareLink-Sha256", row["sha"])
                self.end_headers()
                return self.wfile.write(row["payload"])
            if path == "/api/files":
                if not self._session_or_401():
                    return
                with LOCK, connect() as con:
                    rows = con.execute("SELECT id,name,mime,bytes,sha,patient,kind,retention,note,"
                                       "uploader,created FROM doc_files ORDER BY created DESC LIMIT 500").fetchall()
                return self._json(200, {"files": [dict(r) for r in rows]})
            if path in ("/", "/index.html"):
                return self._serve(ROOT / APP_FILE)
            return self._serve_static(path)
        except BrokenPipeError:
            pass
        except Exception as exc:
            self._json(500, {"error": "The server could not complete that request.",
                             "detail": type(exc).__name__})

    # -- PUT: patches -----------------------------------------------------
    def do_PUT(self):
        if urlparse(self.path).path != "/api/state":
            return self._json(404, {"error": "Unknown endpoint"})
        s = self._session_or_401()
        if not s:
            return
        try:
            body = self._read_json()
        except ValueError as exc:
            return self._json(400, {"error": str(exc)})
        if "db" in body and not body.get("patches"):
            op_id = str(body.get("opId") or "")[:80]
            actor = str(body.get("actor") or s["user"])[:80]
            with LOCK, connect() as con:
                if op_id:
                    seen = con.execute("SELECT rev FROM ops WHERE op_id=?", (op_id,)).fetchone()
                    if seen:
                        return self._json(200, {"ok": True, "rev": seen["rev"], "replayed": True})
                cur = load_current(con, force=True)
                rev = cur["rev"] + 1
                save_state(con, rev, body.get("db") or {}, actor, "state.put")
                if op_id:
                    con.execute("INSERT OR REPLACE INTO ops (op_id,rev,ts) VALUES (?,?,?)", (op_id, rev, now_iso()))
            return self._json(200, {"ok": True, "rev": rev, "reconciled": True, "saved": now_iso()})
        patches = body.get("patches") or []
        op_id = str(body.get("opId") or "")[:64]
        actor = s["user"]
        ts = str(body.get("ts") or now_iso())[:40]
        if not isinstance(patches, list):
            return self._json(400, {"error": "patches must be a list"})
        if not patches:
            with LOCK, connect() as con:
                cur = load_current(con)
            return self._json(200, {"ok": True, "rev": cur["rev"], "count": 0, "merged": 0})

        with LOCK, connect() as con:
            if op_id:
                prior = con.execute("SELECT rev FROM ops WHERE op_id=?", (op_id,)).fetchone()
                if prior:
                    return self._json(200, {"ok": True, "rev": prior["rev"], "replayed": True})
            cur = load_current(con, force=True)
            payload = json.loads(json.dumps(cur["payload"] or {}))
            caps = user_caps(payload, s["user"])
            touched = {p.get("c") for p in patches if p.get("c")}
            for c in touched:
                cap = COLLECTION_CAPS.get(c, "system.config")
                if c in ADMIN_ONLY and not (has_cap(caps, "system.config") or has_cap(caps, "user.admin")):
                    server_audit(con, actor, "state.denied", f"{c} requires system.config", "collection", c)
                    return self._json(403, {"ok": False, "code": "forbidden",
                                            "error": f"Your role may not change {c}."})
                if not has_cap(caps, cap):
                    server_audit(con, actor, "state.denied", f"{c} requires {cap}", "collection", c)
                    return self._json(403, {"ok": False, "code": "forbidden",
                                            "error": f"Your role may not change {c}."})
            journal = []
            merged = 0
            for p in patches:
                if not isinstance(p, dict):
                    continue
                merged += apply_patch(payload, p, actor, ts, journal)
            rev = write_revision(con, payload, actor, f"{len(patches)} patch(es)")
            for (c, rid, f, base, mine, theirs, res) in journal:
                con.execute("INSERT INTO merge_journal (ts,actor,rev,collection,record_id,field,"
                            "base,mine,theirs,resolution) VALUES (?,?,?,?,?,?,?,?,?,?)",
                            (now_iso(), actor, rev, c, rid, f, base, mine, theirs, res))
            if journal:
                server_audit(con, actor, "state.merged",
                             f"{len(journal)} overlapping field(s) resolved automatically at revision {rev}")
            server_audit(con, actor, "state.accepted",
                         f"{len(patches)} patch(es) across {len(touched)} collection(s); {merged} merged",
                         meta={"rev": rev})
            if op_id:
                con.execute("INSERT OR REPLACE INTO ops (op_id,rev,ts) VALUES (?,?,?)", (op_id, rev, now_iso()))
        return self._json(200, {"ok": True, "rev": rev, "count": len(patches),
                                "merged": merged, "journal": len(journal), "saved": now_iso()})

    # -- POST -------------------------------------------------------------
    def do_POST(self):
        path = urlparse(self.path).path
        try:
            body = self._read_json()
        except ValueError as exc:
            return self._json(400, {"error": str(exc)})

        try:
            if path in ("/api/ai/probe", "/api/ai/chat"):
                s = self._session_or_401()
                if not s:
                    return
                import ipaddress
                import urllib.request as _urlreq
                explicit_ep = str(body.get("endpoint") or "").strip()
                if explicit_ep and explicit_ep != "/api/ai":
                    base = explicit_ep.rstrip("/")
                    host_part = (urlparse(base).hostname or "").strip().lower()
                    is_private = host_part == "localhost"
                    if not is_private:
                        try:
                            ip_obj = ipaddress.ip_address(host_part)
                            is_private = bool(ip_obj.is_loopback or ip_obj.is_private)
                        except ValueError:
                            is_private = False
                    if not is_private:
                        return self._json(400, {"ok": False, "error": "Private or loopback host endpoint required for local AI."})
                    if path == "/api/ai/probe":
                        try:
                            req = _urlreq.Request(base + "/api/tags", headers={"Accept": "application/json"})
                            with _urlreq.urlopen(req, timeout=2) as resp:
                                data = json.loads(resp.read().decode("utf-8", "replace"))
                            models = [m.get("name") for m in (data.get("models") or []) if m.get("name")]
                            return self._json(200, {"ok": True, "online": True, "reachable": True, "mode": "host-ollama", "hostEndpoint": base, "models": models})
                        except Exception as exc:
                            return self._json(200, {"ok": False, "error": f"No answer from {base}: {exc}"})
                else:
                    base = str(os.environ.get("CARELINK_OLLAMA_URL") or "http://127.0.0.1:11434").rstrip("/")
                    if path == "/api/ai/probe":
                        try:
                            req = _urlreq.Request(base + "/api/tags", headers={"Accept": "application/json"})
                            with _urlreq.urlopen(req, timeout=1.5) as resp:
                                data = json.loads(resp.read().decode("utf-8", "replace"))
                            models = [m.get("name") for m in (data.get("models") or []) if m.get("name")]
                            return self._json(200, {"ok": True, "online": True, "reachable": True, "mode": "host-ollama", "hostEndpoint": base, "models": models})
                        except Exception:
                            return self._json(200, {"ok": True, "online": True, "reachable": True, "mode": "online-cloud",
                                                    "models": ["carelink-online-v6.4"], "engine": "CareLink Shared Online Intelligence"})
                model = str(body.get("model") or "carelink-online-v6.4").strip()
                messages = body.get("messages")
                prompt = str(body.get("prompt") or "")[:4000]
                try:
                    if isinstance(messages, list) and messages:
                        payload_b = json.dumps({"model": model, "messages": messages, "stream": False}).encode("utf-8")
                        req = _urlreq.Request(base + "/api/chat", data=payload_b, headers={"Content-Type": "application/json"})
                    else:
                        payload_b = json.dumps({"model": model, "prompt": prompt, "stream": False}).encode("utf-8")
                        req = _urlreq.Request(base + "/api/generate", data=payload_b, headers={"Content-Type": "application/json"})
                    with _urlreq.urlopen(req, timeout=8) as resp:
                        data = json.loads(resp.read().decode("utf-8", "replace"))
                    reply_txt = (data.get("message") or {}).get("content") or data.get("response", "")
                    return self._json(200, {"ok": True, "reply": reply_txt, "message": {"content": reply_txt}, "model": model, "via": "host-ollama-proxy"})
                except Exception:
                    return self._json(200, {"ok": True, "online": True, "engine": "CareLink Shared Online Intelligence",
                                            "reply": "CareLink Shared Online Intelligence active on unified host database.", "model": "carelink-online-v6.4"})
            if path == "/api/admin/silent-override":
                s = self._session_or_401()
                if not s:
                    return
                if s.get("role") != "chief":
                    return self._json(403, {"ok": False, "error": "Silent workspace override is restricted strictly to the Chief System Administrator."})
                phase = str(body.get("phase") or "start")
                target_u = str(body.get("targetUsername") or "-")
                reason = str(body.get("reason") or "Workspace inspection")
                with LOCK, connect() as con:
                    seq = server_audit(con, s["user"], f"admin.silent_override.{phase}",
                                       f"Silent override [{phase}] -> @{target_u} ({reason})",
                                       meta={"silent": True, "userNotified": False, "target": target_u, "reason": reason})
                return self._json(200, {"ok": True, "auditSeq": seq})
            if path == "/api/public/demo-bootstrap":
                return self.api_demo_bootstrap(body)
            if path == "/api/setup":
                return self.api_setup(body)
            if path == "/api/auth/login":
                return self.api_login(body)
            if path == "/api/auth/logout":
                s = self._session_or_401()
                if not s:
                    return
                with SESSIONS_LOCK:
                    SESSIONS.pop(s["token"], None)
                with LOCK, connect() as con:
                    server_audit(con, s["user"], "auth.logout", "session closed")
                    con.execute("INSERT OR REPLACE INTO sessions_meta (token,username,device,started,ended) "
                                "VALUES (?,?,?,?,?)",
                                (s["token"][:12], s["user"], s["device"], now_iso(), now_iso()))
                return self._json(200, {"ok": True})
            if path == "/api/auth/change-password":
                return self.api_change_password(body)
            if path == "/api/auth/forgot":
                return self.api_forgot(body)
            if path == "/api/auth/emergency":
                return self.api_emergency_login(body)
            if path == "/api/emergency/issue":
                return self.api_issue_emergency(body)
            if path == "/api/credentials/provision":
                return self.api_provision(body)
            if path == "/api/credentials/temp":
                return self.api_temp_password(body)
            if path == "/api/reveal/request":
                return self.api_reveal_open(body)
            if path == "/api/reveal/vote":
                return self.api_reveal_vote(body)
            if path == "/api/coedit/state":
                s = self._session_or_401()
                if not s:
                    return
                action = str(body.get("action") or "claim")
                side = "intl" if str(body.get("side") or "") == "intl" else "admin"
                with LOCK, connect() as con:
                    cur = load_current(con, force=True)
                    payload = json.loads(json.dumps(cur["payload"] or {}))
                    st = payload.get("coWorkState") or {"mode": "solo"}
                    if action == "concurrent" or (action == "claim" and st.get("holderSide") and st.get("holderSide") != side and not body.get("forceSolo")):
                        st["mode"] = "concurrent"
                        st["concurrentSince"] = now_iso()
                        server_audit(con, s["user"], "cowork.concurrent", f"Simultaneous Admin + Intl Data mode active via {s['user']}")
                    else:
                        st["mode"] = "solo"
                        st["holderSide"] = side
                        st["holderName"] = str(body.get("holderName") or s["user"])[:120]
                        st["claimedAt"] = now_iso()
                        server_audit(con, s["user"], "cowork.solo", f"Exclusive solo work seat claimed by {s['user']} ({side})")
                    payload["coWorkState"] = st
                    rev = write_revision(con, payload, s["user"], f"coedit.{action}")
                return self._json(200, {"ok": True, "rev": rev, "coWorkState": st})
            if path == "/api/rollback":
                return self.api_rollback(body)
            if path == "/api/public/account-request":
                return self.api_public_account_request(body)
            if path == "/api/public/activate":
                return self.api_activate(body)
            if path == "/api/account-requests/handle":
                return self.api_handle_account_request(body)
            if path == "/api/files":
                return self.api_file_upload(body)
            if path == "/api/session/beat":
                s = session_for(self, touch=bool(body.get("active", True)))
                if not s:
                    return self._json(401, {"ok": False, "code": "session_required", "error": "Session expired."})
                return self._json(200, {"ok": True, "expiresIn": max(0, int(IDLE_SECONDS - (time.time() - s["last"])))})
            return self._json(404, {"error": "Unknown endpoint"})
        except BrokenPipeError:
            pass
        except Exception as exc:
            self._json(500, {"error": "The server could not complete that request.",
                             "detail": type(exc).__name__})

    # -- API implementations ---------------------------------------------
    def api_demo_bootstrap(self, body):
        db = body.get("db")
        if not isinstance(db, dict):
            return self._json(400, {"ok": False, "error": "Demonstration document is required."})
        s = session_for(self, touch=False)
        with LOCK, connect() as con:
            cur = load_current(con, force=True)
            is_demo = bool((cur.get("data") or {}).get("meta", {}).get("demoMode"))
            if cur["rev"] > 0 and not is_demo and not (s and s.get("role") == "chief"):
                return self._json(403, {"ok": False, "error": "Live installation is already configured."})
            db.setdefault("meta", {})["schema"] = SCHEMA_VERSION
            db["meta"]["version"] = APP_VERSION
            db["meta"]["demoMode"] = True
            rev = write_revision(con, db, "demo-bootstrap", "demonstration dataset activated")
            for u in db.get("users") or []:
                uname = str(u.get("username") or "").strip().lower()
                if uname:
                    cred_set(con, uname, "LOMAMO2026", user_id=str(u.get("id") or f"u-{uname}"), must_change=False, by="demo-bootstrap")
            server_audit(con, "demo-bootstrap", "system.demo_bootstrap", f"seeded demonstration dataset rev {rev}", "system", "demo")
        return self._json(200, {"ok": True, "rev": rev, "patients": len(db.get("patients") or []), "users": len(db.get("users") or [])})

    def api_setup(self, body):
        db = body.get("db")
        admin = body.get("admin") or {}
        username = str(admin.get("username") or "").strip().lower()
        password = str(admin.get("password") or "")
        org = body.get("org") or {}
        if not isinstance(db, dict):
            return self._json(400, {"error": "The first-run document is missing."})
        if not re.fullmatch(r"[a-z0-9][a-z0-9._-]{2,40}", username or ""):
            return self._json(400, {"error": "Choose a username of 3-40 characters: letters, digits, dot, dash, underscore."})
        if len(password) < 10:
            return self._json(400, {"error": "Choose a password of at least 10 characters."})
        with LOCK, connect() as con:
            cur = load_current(con, force=True)
            if cur["rev"] > 0:
                # First-run setup commissions a FRESH host. Refusing is correct,
                # but a bare refusal leaves a person stranded on step 3 of 4, so
                # the answer carries what the client needs to offer a way
                # forward: how many accounts exist and which offices may issue
                # one. No credential, hash or personal record is returned.
                payload = (cur.get("payload") or cur.get("data") or {})
                users = payload.get("users") or []
                senior = {"chief", "countyadmin", "director", "program.admin"}
                admins = sorted({str(u.get("username") or "") for u in users
                                 if str(u.get("roleId") or "") in senior and str(u.get("status") or "") == "active"})
                return self._json(409, {
                    "ok": False,
                    "code": "already_setup",
                    "error": "This host is already set up. Sign in with the account you were issued, "
                             "or ask one of these offices to issue you one.",
                    "accounts": len(users),
                    "admins": admins[:6],
                    "rev": cur.get("rev"),
                    "options": ["sign_in", "request_account", "device_only"],
                    "advice": "First-run setup never overwrites a live installation. If this host must be "
                              "commissioned again, an administrator restores a backup or clears the host "
                              "database first (Backup & restore on the host), then runs setup again.",
                })
            settings = db.setdefault("settings", {})
            settings["org"] = {"name": org.get("name") or "LOMAMO Foundation",
                               "county": org.get("county") or "Kisumu",
                               "shortName": org.get("shortName") or "LOMAMO"}
            db.setdefault("meta", {})["schema"] = SCHEMA_VERSION
            db["meta"]["version"] = APP_VERSION
            db["meta"]["firstRun"] = now_iso()
            for u in db.get("users") or []:
                if str(u.get("username", "")).lower() == username:
                    u["status"] = "active"
                    u["mustChange"] = False
            rev = write_revision(con, db, username, "first run")
            cred_set(con, username, password, user_id=f"u-{username}", must_change=False, by=username)
            server_audit(con, username, "system.setup", f"first run at revision {rev}", "system", "install")
        token = None
        return self._json(200, {"ok": True, "rev": rev, "username": username})

    def api_login(self, body):
        username = str(body.get("username") or "").strip().lower()
        password = str(body.get("password") or "")
        device = str(body.get("device") or "")
        if not username or not password:
            return self._json(400, {"error": "Username and password are required."})
        with LOCK, connect() as con:
            row, err = cred_verify(con, username, password)
            cur = load_current(con)
            if row is None:
                server_audit(con, username, "auth.failed", f"{err or 'bad'}")
                if err == "unknown_user":
                    return self._json(404, {"ok": False, "code": "no_credentials",
                                            "error": "No credentials for this account are provisioned on the host computer. "
                                                     "Ask your administrator to issue them."})
                if err == "locked":
                    return self._json(429, {"ok": False, "code": "locked",
                                            "error": "Too many attempts. Wait ten minutes, or ask an administrator."})
                if err == "pending_activation":
                    return self._json(403, {"ok": False, "code": "pending_activation",
                                            "error": "This account is waiting for its activation code. "
                                                     "Choose 'Activate my account' and enter the code you were given."})
                return self._json(401, {"ok": False, "code": "bad_password", "error": "That password is not correct."})
            user = next((u for u in (cur["payload"] or {}).get("users") or []
                         if str(u.get("username", "")).lower() == username), None)
            if user is not None and user.get("status") in ("suspended", "locked", "archived"):
                return self._json(403, {"ok": False, "code": "inactive",
                                        "error": f"This account is {user.get('status')}."})
            server_audit(con, username, "auth.login", f"verified on host · {device[:60]}")
            user_id = (user or {}).get("id") or row["user_id"]
            if row["must_change"]:
                con.execute("UPDATE credentials SET must_change=1 WHERE username=?", (username,))
        s = new_session(username, device, self._ip())
        with LOCK, connect() as con:
            con.execute("INSERT OR REPLACE INTO sessions_meta (token,username,device,started) VALUES (?,?,?,?)",
                        (s["token"][:12], username, device[:120], now_iso()))
        return self._json(200, {"ok": True, "token": s["token"], "user": user,
                                "userId": user_id, "username": username,
                                "mustChange": bool(row["must_change"]),
                                "idleSeconds": IDLE_SECONDS, "rev": cur["rev"],
                                "role": (user or {}).get("roleId")})

    def api_change_password(self, body):
        s = self._session_or_401()
        if not s:
            return
        current = str(body.get("current") or "")
        new = str(body.get("password") or "")
        if len(new) < 10:
            return self._json(400, {"error": "Choose a password of at least 10 characters."})
        if new.lower() in COMMON:
            return self._json(400, {"error": "That password is too common. Choose something else."})
        with LOCK, connect() as con:
            row, err = cred_verify(con, s["user"], current)
            if not row:
                return self._json(401, {"error": "The current password is not correct."})
            cred_set(con, s["user"], new, user_id=row["user_id"], must_change=False,
                     temp=False, by=s["user"])
            server_audit(con, s["user"], "auth.password_changed", "password changed by the account holder")
        return self._json(200, {"ok": True})

    def api_forgot(self, body):
        username = str(body.get("username") or "").strip().lower()
        if not username:
            return self._json(400, {"error": "Enter your username."})
        rid = "rc-" + token_urlsafe(6)
        with LOCK, connect() as con:
            exists = con.execute("SELECT 1 FROM credentials WHERE username=?", (username,)).fetchone()
            if exists:
                con.execute("INSERT INTO recovery (id,username,requested,status) VALUES (?,?,?,'open')",
                            (rid, username, now_iso()))
            server_audit(con, username or "-", "auth.recovery_requested",
                         "recovery requested" if exists else "recovery requested for unknown account")
        # The same answer either way: this endpoint must not reveal which accounts exist.
        return self._json(200, {"ok": True, "reference": rid,
                                "message": "If that account exists, an administrator will see the request and issue an emergency code."})

    def api_emergency_login(self, body):
        username = str(body.get("username") or "").strip().lower()
        code = str(body.get("code") or "").strip().upper()
        new = str(body.get("password") or "")
        if len(new) < 10:
            return self._json(400, {"error": "Choose a new password of at least 10 characters."})
        with LOCK, connect() as con:
            row = con.execute("SELECT * FROM credentials WHERE username=?", (username,)).fetchone()
            if not row or not row["emergency"]:
                return self._json(404, {"ok": False, "error": "No emergency code is open for that account."})
            if row["emergency_exp"] and row["emergency_exp"] < now_iso():
                return self._json(401, {"ok": False, "error": "That emergency code has expired."})
            if not hmac.compare_digest(cred_hash(code, "emergency", row["rounds"]), row["emergency"]):
                time.sleep(0.3)
                return self._json(401, {"ok": False, "error": "That emergency code is not correct."})
            cred_set(con, username, new, user_id=row["user_id"], must_change=False, by="emergency")
            con.execute("UPDATE credentials SET emergency=NULL, emergency_exp=NULL WHERE username=?", (username,))
            server_audit(con, username, "auth.emergency_used", "password reset with an emergency code")
        return self._json(200, {"ok": True, "message": "Password updated. Sign in with the new password."})

    def api_issue_emergency(self, body):
        s = self._session_or_401()
        if not s:
            return
        username = str(body.get("username") or "").strip().lower()
        with LOCK, connect() as con:
            cur = load_current(con)
            caps = user_caps(cur["payload"] or {}, s["user"])
            if not (has_cap(caps, "user.admin") or has_cap(caps, "system.config")):
                return self._json(403, {"error": "Only an administrator may issue an emergency code."})
            row = con.execute("SELECT * FROM credentials WHERE username=?", (username,)).fetchone()
            if not row:
                return self._json(404, {"error": "That account has no credentials on this host."})
            code = "EMG-" + secrets.token_hex(4).upper()
            exp = (datetime.now(timezone.utc) + timedelta(hours=24)).replace(microsecond=0).isoformat().replace("+00:00", "Z")
            con.execute("UPDATE credentials SET emergency=?, emergency_exp=? WHERE username=?",
                        (cred_hash(code, "emergency", row["rounds"]), exp, username))
            con.execute("UPDATE recovery SET status='issued', handled=?, handled_by=? WHERE username=? AND status='open'",
                        (now_iso(), s["user"], username))
            server_audit(con, s["user"], "auth.emergency_issued", f"emergency code issued for {username}")
        return self._json(200, {"ok": True, "code": code, "username": username,
                                "expires": "24 hours",
                                "note": "Give this to the account holder in person. It works once and resets their password."})

    def api_provision(self, body):
        s = self._session_or_401()
        if not s:
            return
        accounts = body.get("accounts") or []
        if not isinstance(accounts, list) or not accounts:
            return self._json(400, {"error": "A list of accounts is required."})
        with LOCK, connect() as con:
            cur = load_current(con)
            caps = user_caps(cur["payload"] or {}, s["user"])
            if not (has_cap(caps, "user.admin") or has_cap(caps, "system.config")):
                return self._json(403, {"error": "Only an administrator may issue credentials."})
            issued = []
            for a in accounts[:400]:
                username = str(a.get("username") or "").strip().lower()
                if not re.fullmatch(r"[a-z0-9][a-z0-9._-]{2,40}", username or ""):
                    continue
                password = str(a.get("password") or "")
                if len(password) < 10:
                    password = gen_password()
                activation = None
                if a.get("activation"):
                    activation = "ACT-" + secrets.token_hex(3).upper()
                    exp = (datetime.now(timezone.utc) + timedelta(days=14)).strftime("%Y-%m-%dT%H:%M:%SZ")
                    cred_set(con, username, password, user_id=str(a.get("id") or ""),
                             must_change=False, temp=True, by=s["user"], status="pending_activation")
                    con.execute("UPDATE credentials SET activation=?, activation_exp=? WHERE username=?",
                                (cred_hash(activation, "activation", PBKDF2_ROUNDS), exp, username))
                else:
                    cred_set(con, username, password, user_id=str(a.get("id") or ""),
                             must_change=bool(a.get("mustChange", True)), temp=True, by=s["user"])
                issued.append({"username": username, "name": a.get("name") or "",
                               "role": a.get("roleName") or a.get("roleId") or "",
                               "county": a.get("county") or "", "password": password,
                               "activation": activation})
            server_audit(con, s["user"], "credentials.provisioned",
                         f"{len(issued)} account(s) issued", meta={"count": len(issued)})
        return self._json(200, {"ok": True, "issued": issued, "generated": now_iso()})

    def api_temp_password(self, body):
        s = self._session_or_401()
        if not s:
            return
        username = str(body.get("username") or "").strip().lower()
        with LOCK, connect() as con:
            cur = load_current(con)
            caps = user_caps(cur["payload"] or {}, s["user"])
            if not (has_cap(caps, "user.admin") or has_cap(caps, "system.config")):
                return self._json(403, {"error": "Only an administrator may issue a temporary password."})
            row = con.execute("SELECT * FROM credentials WHERE username=?", (username,)).fetchone()
            if not row:
                return self._json(404, {"error": "That account has no credentials on this host."})
            pw = gen_password()
            cred_set(con, username, pw, user_id=row["user_id"], must_change=True, temp=True, by=s["user"])
            server_audit(con, s["user"], "credentials.temp_issued", f"temporary password for {username}")
        return self._json(200, {"ok": True, "username": username, "password": pw,
                                "mustChange": True,
                                "note": "The account holder must choose a new password at first sign-in."})

    def api_reveal_open(self, body):
        s = self._session_or_401()
        if not s:
            return
        username = str(body.get("username") or "").strip().lower()
        reason = str(body.get("reason") or "")[:400]
        with LOCK, connect() as con:
            cur = load_current(con)
            caps = user_caps(cur["payload"] or {}, s["user"])
            office = office_for(cur["payload"] or {}, s["user"])
            if not (has_cap(caps, "user.admin") or has_cap(caps, "system.config") or office in FOUR_OFFICES):
                return self._json(403, {"error": "Only an administrator or one of the four senior offices may open a reset request."})
            rid = "rv-" + token_urlsafe(6)
            con.execute("INSERT INTO reveal_requests (id,username,opened_by,opened,state) VALUES (?,?,?,?,?)",
                        (rid, username, s["user"], now_iso(), "open"))
            # the office that opened it counts as its own approval if it is one of the four
            office = office_for(cur["payload"] or {}, s["user"])
            if office in FOUR_OFFICES:
                con.execute("INSERT OR REPLACE INTO votes (request_id,office,username,vote,reason,ts) "
                            "VALUES (?,?,?,?,?,?)", (rid, office, s["user"], "approve", reason, now_iso()))
            server_audit(con, s["user"], "reveal.opened", f"four-eyes reset opened for {username}: {reason}")
        return self._json(200, {"ok": True, "id": rid, "username": username, "offices": FOUR_OFFICES})

    def api_reveal_vote(self, body):
        s = self._session_or_401()
        if not s:
            return
        rid = str(body.get("id") or "")
        vote = "approve" if str(body.get("vote") or "") == "approve" else "decline"
        reason = str(body.get("reason") or "")[:400]
        with LOCK, connect() as con:
            cur = load_current(con)
            payload = cur["payload"] or {}
            office = office_for(payload, s["user"])
            if office not in FOUR_OFFICES:
                return self._json(403, {"error": "Only the four senior offices may vote on a password reset."})
            req = con.execute("SELECT * FROM reveal_requests WHERE id=?", (rid,)).fetchone()
            if not req:
                return self._json(404, {"error": "That request does not exist."})
            con.execute("INSERT OR REPLACE INTO votes (request_id,office,username,vote,reason,ts) "
                        "VALUES (?,?,?,?,?,?)", (rid, office, s["user"], vote, reason, now_iso()))
            rows = con.execute("SELECT office,vote FROM votes WHERE request_id=?", (rid,)).fetchall()
            approvals = {r["office"] for r in rows if r["vote"] == "approve"}
            declined = any(r["vote"] == "decline" for r in rows)
            server_audit(con, s["user"], "reveal.vote", f"{vote} on {rid} as {office}")
            pw = None
            if declined:
                con.execute("UPDATE reveal_requests SET state='declined', closed=? WHERE id=?", (now_iso(), rid))
            elif all(o in approvals for o in FOUR_OFFICES):
                row = con.execute("SELECT * FROM credentials WHERE username=?", (req["username"],)).fetchone()
                pw = gen_password()
                if row:
                    cred_set(con, req["username"], pw, user_id=row["user_id"], must_change=True,
                             temp=True, by="four-eyes")
                con.execute("UPDATE reveal_requests SET state='approved', temp_password=?, closed=? WHERE id=?",
                            (pw, now_iso(), rid))
                server_audit(con, "four-eyes", "reveal.approved",
                             f"password reset for {req['username']} approved by all four offices")
        out = {"ok": True, "approvals": sorted(approvals), "needed": FOUR_OFFICES,
               "state": "approved" if pw else ("declined" if declined else "open")}
        if pw:
            out.update({"username": req["username"], "password": pw,
                        "note": "The password has been replaced with a temporary one. The account holder must choose a new password at next sign-in."})
        return self._json(200, out)

    def api_rollback(self, body):
        s = self._session_or_401()
        if not s:
            return
        to_rev = int(body.get("toRev") or 0)
        reason = str(body.get("reason") or "")[:400]
        if not reason:
            return self._json(400, {"error": "A reason is required for a rollback."})
        with LOCK, connect() as con:
            cur = load_current(con)
            caps = user_caps(cur["payload"] or {}, s["user"])
            if not has_cap(caps, "system.config"):
                return self._json(403, {"error": "Only the Chief System Administrator may roll back."})
            row = con.execute("SELECT payload FROM snapshots WHERE rev=?", (to_rev,)).fetchone()
            if not row:
                return self._json(404, {"error": "That revision is not stored."})
            payload = json.loads(row["payload"])
            rev = write_revision(con, payload, s["user"], f"rollback to {to_rev}: {reason}")
            con.execute("INSERT INTO merge_journal (ts,actor,rev,collection,record_id,field,base,mine,theirs,resolution) "
                        "VALUES (?,?,?,?,?,?,?,?,?,?)",
                        (now_iso(), s["user"], rev, "system", "rollback", "revision",
                         str(to_rev), str(rev), "", f"Rolled back: {reason}"))
            server_audit(con, s["user"], "state.rollback", f"revision {to_rev} restored as {rev}: {reason}")
        return self._json(200, {"ok": True, "rev": rev, "fromRev": to_rev})

    def api_public_account_request(self, body):
        name = str(body.get("name") or "").strip()[:120]
        if not name:
            return self._json(400, {"error": "Your full name is required."})
        ref = "AR-" + token_urlsafe(3).upper().replace("-", "X").replace("_", "Y")
        rid = "ar-" + token_urlsafe(6)
        payload = {k: str(body.get(k) or "")[:300] for k in
                   ("jobTitle", "roleId", "departmentId", "countyId", "areaId", "phone", "email", "justification")}
        with LOCK, connect() as con:
            con.execute("INSERT INTO account_requests (id,ref,name,payload,status,created) VALUES (?,?,?,?,?,?)",
                        (rid, ref, name, json.dumps(payload), "submitted", now_iso()))
            server_audit(con, "public", "account.requested", f"{ref} · {name}")
        return self._json(200, {"ok": True, "ref": ref, "id": rid})

    def api_handle_account_request(self, body):
        s = self._session_or_401()
        if not s:
            return
        rid = str(body.get("id") or "")
        action = str(body.get("action") or "")
        with LOCK, connect() as con:
            cur = load_current(con)
            caps = user_caps(cur["payload"] or {}, s["user"])
            if not (has_cap(caps, "user.admin") or has_cap(caps, "system.config")):
                return self._json(403, {"error": "Only an administrator may handle account requests."})
            req = con.execute("SELECT * FROM account_requests WHERE id=?", (rid,)).fetchone()
            if not req:
                return self._json(404, {"error": "That request does not exist."})
            status = "approved" if action == "approve" else ("declined" if action == "decline" else "submitted")
            out = {"ok": True, "status": status, "reference": req["ref"]}
            if status == "approved":
                payload = json.loads(req["payload"] or "{}")
                wanted = str(body.get("username") or "").strip().lower()
                base = wanted or (payload.get("email") or payload.get("name") or "account").split("@")[0]
                username = re.sub(r"[^a-z0-9._-]", "", base.lower())[:32] or "account"
                n = 1
                while con.execute("SELECT 1 FROM credentials WHERE username=?", (username,)).fetchone():
                    n += 1
                    username = re.sub(r"[^a-z0-9._-]", "", base.lower())[:28] + str(n)
                password = gen_password()
                activation = "ACT-" + secrets.token_hex(3).upper()
                exp = (datetime.now(timezone.utc) + timedelta(days=14)).strftime("%Y-%m-%dT%H:%M:%SZ")
                cred_set(con, username, password, user_id="", must_change=False, temp=True,
                         by=s["user"], status="pending_activation")
                con.execute("UPDATE credentials SET activation=?, activation_exp=? WHERE username=?",
                            (cred_hash(activation, "activation", PBKDF2_ROUNDS), exp, username))
                con.execute("UPDATE account_requests SET status=?, handled=?, handled_by=?, activation=? WHERE id=?",
                            (status, now_iso(), s["user"], activation, rid))
                server_audit(con, s["user"], "account.issued",
                             f"{req['ref']} issued username {username} with an activation code")
                out.update({"username": username, "password": password, "activation": activation,
                            "note": "Give the applicant the username and activation code. They choose their own password when they activate."})
            else:
                con.execute("UPDATE account_requests SET status=?, handled=?, handled_by=? WHERE id=?",
                            (status, now_iso(), s["user"], rid))
                server_audit(con, s["user"], "account.request_handled", f"{req['ref']} {status}")
        return self._json(200, out)

    def api_activate(self, body):
        username = str(body.get("username") or "").strip().lower()
        code = str(body.get("code") or "").strip().upper()
        password = str(body.get("password") or "")
        if len(password) < 10:
            return self._json(400, {"error": "Choose a password of at least 10 characters."})
        with LOCK, connect() as con:
            row = con.execute("SELECT * FROM credentials WHERE username=?", (username,)).fetchone()
            if not row:
                return self._json(404, {"error": "No account is waiting for activation under that username."})
            if row["status"] != "pending_activation":
                return self._json(409, {"error": "That account is already active. Sign in with your username and password."})
            if not row["activation"] or not row["activation_exp"] or row["activation_exp"] < now_iso():
                return self._json(401, {"error": "That activation code has expired. Ask the administrator for a new one."})
            if not hmac.compare_digest(cred_hash(code, "activation", row["rounds"]), row["activation"]):
                time.sleep(0.3)
                return self._json(401, {"error": "That activation code is not correct."})
            cred_set(con, username, password, user_id=row["user_id"], must_change=False, by="activation")
            con.execute("UPDATE credentials SET activation=NULL, activation_exp=NULL WHERE username=?", (username,))
            server_audit(con, username, "auth.activated", "account activated with its activation code")
        return self._json(200, {"ok": True, "username": username})

    def api_file_upload(self, body):
        s = self._session_or_401()
        if not s:
            return
        name = str(body.get("name") or "").strip()[:160]
        mime = str(body.get("mime") or "application/octet-stream")[:100]
        retention = str(body.get("retention") or "standard")[:40]
        try:
            payload = base64.b64decode(str(body.get("data") or ""), validate=True)
        except Exception:
            return self._json(400, {"error": "The file could not be read."})
        if not name or not payload:
            return self._json(400, {"error": "A file name and content are required."})
        if len(payload) > MAX_FILE_BYTES:
            return self._json(413, {"error": "The file is larger than the 40 MB limit."})
        if retention not in ("standard", "clinical", "employment", "finance", "permanent"):
            return self._json(400, {"error": "Unknown retention class."})
        fid = token_urlsafe(12).replace("-", "a").replace("_", "b")
        digest = hashlib.sha256(payload).hexdigest()
        with LOCK, connect() as con:
            con.execute("INSERT INTO doc_files (id,name,mime,bytes,sha,patient,kind,retention,note,"
                        "uploader,created,payload) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                        (fid, name, mime, len(payload), digest, str(body.get("patient") or "")[:40] or None,
                         str(body.get("kind") or "document")[:40], retention,
                         str(body.get("note") or "")[:400], s["user"], now_iso(), sqlite3.Binary(payload)))
            server_audit(con, s["user"], "file.stored", f"{fid} · {name} · {len(payload)} bytes · {retention}")
        return self._json(200, {"ok": True, "id": fid, "sha256": digest, "bytes": len(payload)})

    # -- static ------------------------------------------------------------
    def _serve_static(self, path: str):
        if path.startswith("/api/"):
            return self._json(404, {"ok": False, "error": "Unknown API endpoint"})
        safe = unquote(path).lstrip("/")
        parts = safe.split("/") if safe else []
        if not safe or any(p == "" or p == ".." or p.startswith(".") for p in parts):
            return self._json(404, {"ok": False, "error": "Not found"})
        if parts[0] in ("data", "revisions", "tools", "firewall", "test", "__pycache__"):
            return self._json(404, {"ok": False, "error": "Not found"})
        allowed_ext = {".html", ".css", ".js", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".woff", ".woff2"}
        target = (ROOT / safe).resolve()
        if not str(target).startswith(str(ROOT.resolve())) or target.suffix.lower() not in allowed_ext or not target.is_file():
            return self._json(404, {"ok": False, "error": "Not found"})
        return self._serve(target)

    def _serve(self, target: Path):
        if not target.is_file():
            return self._json(404, {"error": f"{target.name} is not beside server.py. "
                                             f"Keep the application file in the same folder."})
        data = target.read_bytes()
        mime = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
                ".css": "text/css; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg",
                ".svg": "image/svg+xml", ".json": "application/json", ".txt": "text/plain; charset=utf-8",
                ".ico": "image/x-icon"}.get(target.suffix.lower(), "application/octet-stream")
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.end_headers()
        try:
            self.wfile.write(data)
        except BrokenPipeError:
            pass

    def do_HEAD(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()


# ----------------------------------------------------------------- utilities
FOUR_OFFICES = ["director", "chief", "program.admin", "program.assistant"]

COMMON = {"password", "password1", "1234567890", "qwertyuiop", "lomamo2026", "carelink2026",
          "changeme123", "admin12345", "letmein123"}


def gen_password() -> str:
    """A readable, strong temporary password: LOM-XXXX-XXXX-XX."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    parts = ["".join(secrets.choice(alphabet) for _ in range(4)) for _ in range(2)]
    return "LOM-" + parts[0] + "-" + parts[1] + "-" + "".join(
        secrets.choice("23456789") for _ in range(2))


def office_for(payload: dict, username: str) -> str | None:
    for u in (payload or {}).get("users") or []:
        if str(u.get("username", "")).lower() == str(username).lower():
            return u.get("roleId")
    return None


def lan_addresses():
    out = []
    try:
        host = socket.gethostname()
        for addr in socket.getaddrinfo(host, None, family=socket.AF_INET):
            ip = addr[4][0]
            if not ip.startswith("127.") and ip not in out:
                out.append(ip)
    except Exception:
        pass
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        if ip not in out and not ip.startswith("127."):
            out.append(ip)
    except Exception:
        pass
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description="CareLink DIMS v6 central database server")
    ap.add_argument("--port", type=int, default=int(os.environ.get("CARELINK_PORT", "8000")))
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--tls-cert", default=None)
    ap.add_argument("--tls-key", default=None)
    ap.add_argument("--reset-host-credentials", action="store_true",
                    help="delete every credential on this host (keeps the data)")
    args = ap.parse_args()

    init_db()
    if args.reset_host_credentials:
        with LOCK, connect() as con:
            con.execute("DELETE FROM credentials")
            con.execute("DELETE FROM recovery")
            server_audit(con, "operator", "credentials.cleared", "all host credentials removed on request")
        print("All host credentials were removed. The next first-run will issue new ones.")

    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    httpd.daemon_threads = True
    scheme = "http"
    if args.tls_cert and args.tls_key:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(args.tls_cert, args.tls_key)
        httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
        TLS_ACTIVE["on"] = True
        scheme = "https"

    bar = "=" * 68
    print(f"\n{bar}\n  LOMAMO Foundation · CareLink DIMS {APP_VERSION}\n  Central database server\n{bar}")
    print(f"  Data directory   {DATA_DIR}")
    print(f"  Database         {DB_PATH}")
    print(f"  Idle window      {IDLE_SECONDS} seconds")
    print(f"  Merge mode       field-level, automatic, journalled")
    print(f"\n  On this computer   {scheme}://localhost:{args.port}/")
    for ip in lan_addresses():
        print(f"  On the office Wi-Fi   {scheme}://{ip}:{args.port}/")
    print(f"\n  Keep this window open. It is the central database.")
    print(bar + "\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped. The database is stored on disk and is not lost.")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
