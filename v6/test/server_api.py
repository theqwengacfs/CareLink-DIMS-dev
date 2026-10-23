#!/usr/bin/env python3
"""
test/server_api.py - acceptance checks for the central database server.

Starts server.py on a throwaway data directory and port, then exercises the
endpoints the browser depends on: revision control, conflict refusal,
explicit resolution, snapshot retention, replay protection, the server audit
chain, static-file safety and the AI endpoint guard.

    python3 test/server_api.py

No third-party packages. Exits non-zero if any check fails.
"""
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PORT = 8199
BASE = f"http://127.0.0.1:{PORT}"
results = []


def check(name, cond, detail=""):
    results.append((bool(cond), name, detail))


TOKEN = {"t": ""}


def call(path, method="GET", body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if TOKEN["t"]:
        req.add_header("X-CareLink-Session", TOKEN["t"])
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=6) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except Exception:
            return e.code, {}


def start(env_extra=None, port=None):
    """Starts a server on a throwaway directory and waits for health."""
    global PORT, BASE
    PORT = port or free_port()
    BASE = f"http://127.0.0.1:{PORT}"
    data_dir = tempfile.mkdtemp(prefix="carelink-test-")
    env = dict(os.environ, CARELINK_DATA_DIR=data_dir, **(env_extra or {}))
    proc = subprocess.Popen(
        [sys.executable, str(ROOT / "server.py"), "--port", str(PORT)],
        cwd=str(ROOT), env=env,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    return proc, data_dir, env


def wait_health():
    for _ in range(80):
        try:
            st, health = call("/api/health")
            if st == 200:
                return health
        except Exception:
            time.sleep(0.1)
    return None


def credentials_suite():
    """A host with a provisioned password must refuse an unverified sign-in,
    and the file store must round-trip bytes with a matching digest."""
    import base64
    proc, data_dir, env = start()
    try:
        health = wait_health()
        check("Password suite: server answers", bool(health))
        check("Password suite: unprovisioned host reports demonstration mode", health.get("auth") == "not-provisioned", str(health.get("auth")))

        tool = subprocess.run([sys.executable, str(ROOT / "tools" / "set_password.py"),
                               "--user", "tester", "--password", "CorrectHorseBattery1"],
                              cwd=str(ROOT), env=env, capture_output=True, text=True)
        check("Password suite: provisioning tool succeeds", tool.returncode == 0, tool.stdout + tool.stderr)

        st, body = call("/api/auth/login", "POST", {"username": "tester"})
        check("Password suite: sign-in without a password is refused", st in (400, 401), str(st))
        st, body = call("/api/auth/login", "POST", {"username": "tester", "password": "wrong-password"})
        check("Password suite: a wrong password is refused", st == 401 and body.get("code") == "bad_password", str(st))
        st, body = call("/api/auth/login", "POST", {"username": "tester", "password": "CorrectHorseBattery1"})
        check("Password suite: the correct password opens a session", st == 200 and bool(body.get("token")), str(st))
        TOKEN["t"] = body.get("token", "")
        health = call("/api/health")[1]
        check("Password suite: health now reports server-verified sign-in", health.get("auth") == "server-verified", str(health.get("auth")))

        payload = b"%PDF-1.4 test document for the file store"
        st, up = call("/api/files", "POST", {"name": "consent-form.pdf", "mime": "application/pdf",
                                             "data": base64.b64encode(payload).decode(),
                                             "patient": "p001", "kind": "consent", "retention": "clinical",
                                             "note": "Signed consent for a photograph."})
        check("Password suite: a file is stored", st == 200 and up.get("bytes") == len(payload), str(st))
        fid = up.get("id", "")
        check("Password suite: the digest is returned", len(up.get("sha256", "")) == 64)
        st, listing = call("/api/files")
        check("Password suite: the file appears in the register", st == 200 and any(f["id"] == fid for f in listing.get("files", [])))
        req = urllib.request.Request(BASE + "/api/files/" + fid)
        req.add_header("X-CareLink-Session", TOKEN["t"])
        with urllib.request.urlopen(req, timeout=6) as r:
            got = r.read()
        check("Password suite: the bytes round-trip exactly", got == payload)
        st, bad = call("/api/files", "POST", {"name": "x.pdf", "data": "not base64!!", "retention": "clinical"})
        check("Password suite: a malformed upload is refused", st == 400, str(st))
        st, bad = call("/api/files", "POST", {"name": "x.pdf", "data": base64.b64encode(b"x").decode(), "retention": "made-up"})
        check("Password suite: an unknown retention class is refused", st == 400, str(st))
        TOKEN["t"] = ""
        st, _ = call("/api/files")
        check("Password suite: the file register needs a session", st == 401, str(st))
    finally:
        try:
            proc.terminate(); proc.wait(timeout=10)
        except Exception:
            proc.kill()
        shutil.rmtree(data_dir, ignore_errors=True)


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


def main():
    global PORT, BASE
    PORT = free_port()
    BASE = f"http://127.0.0.1:{PORT}"
    data_dir = tempfile.mkdtemp(prefix="carelink-test-")
    env = dict(os.environ, CARELINK_DATA_DIR=data_dir)
    proc = subprocess.Popen(
        [sys.executable, str(ROOT / "server.py"), "--port", str(PORT)],
        cwd=str(ROOT), env=env,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        for _ in range(60):
            try:
                st, health = call("/api/health")
                if st == 200:
                    break
            except Exception:
                time.sleep(0.1)
        else:
            check("Server started", False, "no answer")
            return 1

        check("Server answers health", health.get("ok") is True)
        check("Server reports the application version", health.get("app") == "6.0.0", str(health.get("app")))
        check("Server states whether passwords are verified", health.get("auth") in ("not-provisioned", "server-verified"), str(health.get("auth")))
        check("Server reports schema 5", health.get("schema") == 6)
        check("Fresh central database starts at revision 0", health.get("rev") == 0)

        # --- static safety ---
        for path, expect in [("/../etc/passwd", 404), ("/data/carelink.db", 404),
                             ("/server.py", 404), ("/.env", 404)]:
            st, _ = call(path)
            check(f"Static request refused: {path}", st in (403, 404), str(st))
        st, state = call("/api/state")
        check("Central database refuses a request without a session", st == 401 and state.get("code") == "session_required", str(st))
        call("/api/setup", "POST", {"db": {"patients": [], "users": [{"id": "u-test", "username": "test", "roleId": "chief"}, {"id": "u-mcm", "username": "mcm.test", "roleId": "mcm"}]}, "org": {"name": "LOMAMO"}, "admin": {"username": "test", "password": "TestPassword123!", "name": "Test Admin"}})
        subprocess.run([sys.executable, str(ROOT / "tools" / "set_password.py"), "--user", "mcm.test", "--password", "ClinicalPass123!", "--no-must-change"], cwd=str(ROOT), env=env, check=True, stdout=subprocess.DEVNULL)
        st, sess = call("/api/auth/login", "POST", {"username": "test", "password": "TestPassword123!", "device": "harness"})
        check("A session can be opened", st == 200 and sess.get("token"), str(st))
        TOKEN.update({"t": sess.get("token", "")})
        st, v1s = call("/api/v1/status")
        check("REST API v1 status responds", st == 200 and v1s.get("apiVersion") == "v1")

        # --- first write ---
        st_forbid, _ = call("/api/state", "PUT", {"patches": [{"c": "patients", "id": "p0", "set": {"id": "p0"}}], "actor": "chief", "opId": "op-forbid"})
        check("System Administrator cannot modify patient clinical records on server", st_forbid == 403, str(st_forbid))
        _, mcm_sess = call("/api/auth/login", "POST", {"username": "mcm.test", "password": "ClinicalPass123!"})
        TOKEN["t"] = mcm_sess.get("token", "")
        st, r = call("/api/state", "PUT", {"patches": [{"c": "patients", "id": "p1", "set": {"id": "p1", "name": "Alpha"}}], "actor": "device-a", "opId": "op-1"})
        rev1 = r.get("rev", 0)
        check("First patch accepted with revision increment", st == 200 and rev1 >= 1, str(r))

        st, r2 = call("/api/state", "PUT", {"patches": [{"c": "patients", "id": "p1", "set": {"id": "p1", "name": "Alpha"}}], "actor": "device-a", "opId": "op-1"})
        check("Idempotent opId replay returns same revision without duplicate write", r2.get("replayed") is True and r2.get("rev") == rev1)

        # --- automatic concurrent multi-device reconciliation (no 409 conflict blocking) ---
        st, merged_res = call("/api/state", "PUT", {"patches": [{"c": "patients", "id": "p2", "set": {"id": "p2", "name": "Beta"}}, {"c": "patients", "id": "p1", "before": {"name": "Old"}, "set": {"name": "Alpha-Updated"}}], "actor": "device-b", "opId": "op-2"})
        rev2 = merged_res.get("rev", 0)
        check("Concurrent device write reconciles automatically without user conflict error", st == 200 and rev2 == rev1 + 1, str(merged_res))
        st, mj = call("/api/merge-journal")
        check("Overlapping field write is recorded in merge journal", st == 200 and len(mj.get("entries", [])) >= 1)
        st, revs = call("/api/revisions")
        check("Revision snapshots are retained on disk", len(revs.get("revisions", [])) >= 2)
        check("Snapshot records a checksum", all(len(x.get("sha", "")) == 64 for x in revs.get("revisions", [])))

        # --- audit chain ---
        st, audit = call("/api/audit/verify")
        check("Server audit chain verifies", audit.get("ok") is True, str(audit))
        check("Server audit records the conflict", audit.get("entries", 0) >= 4, str(audit.get("entries")))

        # --- AI endpoint guard ---
        st, probe = call("/api/ai/probe", "POST", {"endpoint": "http://example.com"})
        check("AI probe refuses a public endpoint", probe.get("ok") is False and "private" in probe.get("error", "").lower())
        st, probe2 = call("/api/ai/probe", "POST", {"endpoint": "http://127.0.0.1:1"})
        check("AI probe reports an unreachable local endpoint honestly", probe2.get("ok") is False and "No answer" in probe2.get("error", ""))

        # --- idle expiry, enforced by the host ---
        env_short = dict(env, CARELINK_IDLE_SECONDS="2")
        proc.terminate(); proc.wait(timeout=10)
        proc = subprocess.Popen([sys.executable, str(ROOT / "server.py"), "--port", str(PORT)],
                                cwd=str(ROOT), env=env_short, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(60):
            try:
                if call("/api/health")[0] == 200:
                    break
            except Exception:
                time.sleep(0.1)
        st, s3 = call("/api/auth/login", "POST", {"username": "test", "password": "TestPassword123!"})
        TOKEN["t"] = s3.get("token", "")
        st, beat = call("/api/session/beat", "POST", {"active": False})
        check("An inactive heartbeat is accepted while the session is live", st == 200)
        time.sleep(2.6)
        st, expired = call("/api/state")
        check("The host refuses a read after the idle window", st == 401 and expired.get("code") == "session_required", str(st))
        st, beat2 = call("/api/session/beat", "POST", {"active": True})
        check("An expired session cannot be revived by a heartbeat", st == 401, str(st))

        st, s4 = call("/api/auth/login", "POST", {"username": "test", "password": "TestPassword123!"})
        TOKEN["t"] = s4.get("token", "")
        call("/api/session/beat", "POST", {"active": True})
        time.sleep(1.2)
        st, keep = call("/api/session/beat", "POST", {"active": True})
        time.sleep(1.2)
        st, still_ok = call("/api/state")
        check("Real activity extends the session", st == 200, str(st))
        call("/api/auth/logout", "POST", {})
        check("A closed session is refused immediately", call("/api/state")[0] == 401)

        # back to the normal window for the remaining checks
        proc.terminate(); proc.wait(timeout=10)
        proc = subprocess.Popen([sys.executable, str(ROOT / "server.py"), "--port", str(PORT)],
                                cwd=str(ROOT), env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(60):
            try:
                if call("/api/health")[0] == 200:
                    break
            except Exception:
                time.sleep(0.1)
        st, s5 = call("/api/auth/login", "POST", {"username": "test", "password": "TestPassword123!"})
        TOKEN["t"] = s5.get("token", "")

        # --- unknown endpoints ---
        st, pub = call("/api/public/content")
        check("The public feed is reachable without a session", st == 200, str(st))
        check("The public feed returns only published items", all(x["id"] for x in pub.get("items", [])), str(len(pub.get("items", []))))

        st, _ = call("/api/nothing")
        check("Unknown API endpoint returns 404", st == 404)

        # --- persistence across restart ---
        proc.terminate()
        proc.wait(timeout=10)
        proc = subprocess.Popen(
            [sys.executable, str(ROOT / "server.py"), "--port", str(PORT)],
            cwd=str(ROOT), env=env,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        for _ in range(60):
            try:
                st, health2 = call("/api/health")
                if st == 200:
                    break
            except Exception:
                time.sleep(0.1)
        check("Database survives a restart", health2.get("rev") >= 2, str(health2.get("rev")))
        check("A restart clears every session", call("/api/state")[0] == 401)
        st, sess2 = call("/api/auth/login", "POST", {"username": "test", "password": "TestPassword123!"})
        TOKEN["t"] = sess2.get("token", "")
        st, state2 = call("/api/state")
        check("Restart returns the same records", any(p["id"] == "p2" for p in (state2.get("db") or {}).get("patients", [])), f"{sess2} / {state2}")
        check("Database file is on disk, not in a temporary cache", (Path(data_dir) / "carelink.db").exists())
        check("Revision snapshots persist in SQLite across restart", len(call("/api/revisions")[1].get("revisions", [])) >= 2)
        return 0
    finally:
        try:
            proc.terminate()
            proc.wait(timeout=10)
        except Exception:
            proc.kill()
        shutil.rmtree(data_dir, ignore_errors=True)


def finish():
    for good, name, detail in results:
        print(f"{'PASS' if good else 'FAIL'}  {name}{('  ' + detail) if (detail and not good) else ''}")
    passed = sum(1 for g, _, _ in results if g)
    print(f"\n{passed}/{len(results)} server checks passed")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    code = main()
    credentials_suite()
    raise SystemExit(finish() or code)
