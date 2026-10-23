#!/usr/bin/env python3
"""Make a plain-text bundle of the project for platforms that reject .zip.

Every file is written verbatim between explicit markers:

    (marker)CARELINK-FILE relative/path(marker)
    ...exact contents...
    (marker)CARELINK-END(marker)

A binary file (the logo) is written as base64 with a marker that says so.
The parts are ordinary .txt files: they can be attached, pasted or read by an
agent, and restored exactly with the extractor printed in RESTORE.md.
"""
import base64, hashlib, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "text-bundle"
PART_BYTES = 300_000          # comfortable for an upload box and for reading
FILE_MARK = "<" * 3 + "CARELINK-FILE "
END_MARK = "<" * 3 + "CARELINK-END" + ">" * 3
BIN_MARK = "<" * 3 + "CARELINK-BINARY-BASE64 "

SKIP_DIRS = {"offline-kit", "data", "text-bundle", "__pycache__", ".git", "node_modules"}
SKIP_SUFFIX = {".zip", ".pdf"}
INCLUDE_UPLOADS = ["STAFF_LEAVE_MANAGER_SPEC.md", "CASE MANAGER CONSOLE.md",
                   "CareLink_v3.3.0_Handoff.md", "CARELINK_DDMS_v3.3.2_COMPLETE_SYSTEM_IMAGE_AND_HANDOVER.md",
                   "Case Management Clinical Tool.html",
                   "LOMAMO MEDICAL CASE MANAGER WEB HTML Offline.html"]


def project_files():
    for p in sorted(ROOT.rglob("*")):
        if not p.is_file():
            continue
        rel = p.relative_to(ROOT)
        if any(part in SKIP_DIRS for part in rel.parts):
            continue
        if p.suffix.lower() in SKIP_SUFFIX:
            continue
        if p.name.startswith("LOMAMO-CareLink-DIMS-v4.") and p.suffix == ".html":
            continue                              # rebuilt from src in seconds
        yield rel.as_posix(), p


def upload_files():
    up = ROOT.parent / "uploads"
    for name in INCLUDE_UPLOADS:
        p = up / name
        if p.exists():
            yield "uploads/" + name, p


def block(rel, data, binary=False):
    if binary:
        head = f"{BIN_MARK}{rel}>>>\n"
        body = base64.b64encode(data).decode("ascii")
        body = "\n".join(body[i:i+76] for i in range(0, len(body), 76))
        return head + body + "\n" + END_MARK + "\n"
    text = data.decode("utf-8")
    if FILE_MARK in text or END_MARK in text or BIN_MARK in text:
        sys.exit(f"Refusing to bundle {rel}: it contains a marker string.")
    return f"{FILE_MARK}{rel}>>>\n" + text + ("" if text.endswith("\n") else "\n") + END_MARK + "\n"


def main():
    OUT.mkdir(exist_ok=True)
    for old in OUT.glob("carelink-bundle-part*.txt"):
        old.unlink()
    entries = []
    for rel, p in list(project_files()) + list(upload_files()):
        data = p.read_bytes()
        binary = p.suffix.lower() in {".png", ".jpg", ".jpeg", ".ico"} or b"\x00" in data[:2048]
        entries.append(block(rel, data, binary))

    parts, current, size, n = [], [], 0, 1
    for e in entries:
        if current and size + len(e) > PART_BYTES:
            parts.append(current); current, size = [], 0
        current.append(e); size += len(e)
    if current:
        parts.append(current)

    manifest = []
    total = len(parts)
    for i, chunk in enumerate(parts, 1):
        head = (f"CARELINK BUNDLE 4.1 · part {i} of {total}\n"
                f"Restore with the extractor in RESTORE.md. Read this file as raw text.\n"
                f"Do not retype file contents; run the extractor.\n\n")
        body = head + "".join(chunk)
        path = OUT / f"carelink-bundle-part{i}.txt"
        path.write_text(body, encoding="utf-8")
        manifest.append((path.name, len(body.encode('utf-8')), hashlib.sha256(body.encode()).hexdigest()[:16]))

    print(f"Wrote {total} parts to {OUT}")
    for name, size, digest in manifest:
        print(f"  {name:34s} {size/1024:7.1f} KB  sha256 {digest}")
    print(f"  total {(sum(m[1] for m in manifest))/1024/1024:.2f} MB across {total} files")


if __name__ == "__main__":
    main()
