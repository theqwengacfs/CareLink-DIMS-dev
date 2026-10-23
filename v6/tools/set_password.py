#!/usr/bin/env python3
"""
tools/set_password.py - provision a password on the central database host.

The browser hashes a password to keep it out of the database document. The
host does not trust that: when a credential exists here, /api/session/start
asks for the password and checks a salted PBKDF2-SHA256 hash of its own. A
tablet that knows a username still cannot open a session without it.

    python3 tools/set_password.py --user mcm.kisumu
    python3 tools/set_password.py --user mcm.kisumu --password '...'
    python3 tools/set_password.py --list
    python3 tools/set_password.py --user mcm.kisumu --remove

With no --password, the password is read from the terminal without echo.
Nothing is written until the two entries match and the minimum length is met.

This tool writes to the same SQLite file as server.py. Stop the server, or
run the tool while it is idle; SQLite serialises the write either way.
"""
from __future__ import annotations

import argparse
import getpass
import hashlib
import os
import secrets
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("CARELINK_DATA_DIR", ROOT / "data")).resolve()
DB_PATH = DATA_DIR / "carelink.db"
ITERATIONS = int(os.environ.get("CARELINK_CRED_ITERATIONS") or os.environ.get("CARELINK_PBKDF2_ROUNDS") or "210000")
MIN_LENGTH = 12


def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH, timeout=15, isolation_level=None)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("""CREATE TABLE IF NOT EXISTS credentials (
        username TEXT PRIMARY KEY COLLATE NOCASE,
        user_id TEXT, salt TEXT NOT NULL, hash TEXT NOT NULL,
        rounds INTEGER NOT NULL, must_change INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active', temp INTEGER NOT NULL DEFAULT 0,
        activation TEXT, activation_exp TEXT,
        emergency TEXT, emergency_exp TEXT,
        failed INTEGER NOT NULL DEFAULT 0, locked_until TEXT,
        updated TEXT, updated_by TEXT)""")
    return con


def main() -> int:
    ap = argparse.ArgumentParser(description="Provision a CareLink password on this host")
    ap.add_argument("--user", help="username, exactly as it is typed at sign-in")
    ap.add_argument("--password", help="password; omit to be prompted without echo")
    ap.add_argument("--must-change", action="store_true", default=True,
                    help="require the holder to change it at first sign-in (default)")
    ap.add_argument("--no-must-change", dest="must_change", action="store_false")
    ap.add_argument("--remove", action="store_true", help="delete the credential")
    ap.add_argument("--list", action="store_true", help="list provisioned usernames")
    args = ap.parse_args()

    con = connect()
    if args.list:
        rows = con.execute("SELECT username, updated, must_change FROM credentials ORDER BY username").fetchall()
        if not rows:
            print("No credentials provisioned. The host runs in unverified demonstration mode.")
        for r in rows:
            print(f"{r['username']:<28} updated {r['updated']}  must change: {'yes' if r['must_change'] else 'no'}")
        return 0

    if not args.user:
        print("A username is required. Use --list to see what exists.")
        return 2

    if args.remove:
        con.execute("DELETE FROM credentials WHERE lower(username)=lower(?)", (args.user,))
        print(f"Credential removed for {args.user}. If no other credential exists, the host returns to unverified mode.")
        return 0

    password = args.password
    if password is None:
        password = getpass.getpass("Password: ")
        again = getpass.getpass("Repeat: ")
        if password != again:
            print("The two entries do not match. Nothing was written.")
            return 2
    if len(password) < MIN_LENGTH:
        print(f"The password must be at least {MIN_LENGTH} characters. Nothing was written.")
        return 2
    if password.lower() in ("password", "lomamo2026", "carelink", "123456789012"):
        print("That password is on the well-known list. Choose another. Nothing was written.")
        return 2

    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), ITERATIONS).hex()
    now = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
    con.execute("""INSERT INTO credentials (username, user_id, salt, hash, rounds, updated, updated_by, must_change, status)
                   VALUES (?,?,?,?,?,?,?,?, 'active')
                   ON CONFLICT(username) DO UPDATE SET
                     salt=excluded.salt, hash=excluded.hash, rounds=excluded.rounds,
                     updated=excluded.updated, updated_by=excluded.updated_by,
                     must_change=excluded.must_change, status='active', failed=0, locked_until=NULL""",
                (args.user, 'u-' + args.user.lower(), salt, digest, ITERATIONS, now, 'cli', 1 if args.must_change else 0))
    print(f"Credential written for {args.user} with {ITERATIONS} PBKDF2-SHA256 iterations.")
    print("Restart server.py if it is running, so the health report and the banner show server-verified sign-in.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
