# Developer handover

This is a source snapshot, not a production database backup or a complete native Android release.

1. Read `AGENTS.md`, `docs/PROGRAMME-SCOPE.md`, `docs/PRIVACY_VERIFICATION.md` and `docs/FORMS-AND-COORDINATION-AUDIT.md`.
2. Install supported Node.js and Python 3, then run `npm ci`.
3. Rebuild both static bundles: `node tools/sync-lovable.mjs` and `python3 v6/build.py`.
4. Validate with `npm run test:all` and `npm run build`.
5. Use synthetic data for development. Online authentication, sessions, coordination and persistence require separately configured hosting and KV services; obtain approved access through the owner, not this archive.
6. Keep the three module manifests synchronized as described in `AGENTS.md`.

## Privacy and distribution
The archive contains tracked repository source. Office documents, PDF references and tabular exports are excluded. Obtain approved source-form references separately from the owner. It is intended only for the owner's authorised developer, not public redistribution. It excludes Git history, environment files, hosting credentials, installed dependencies and production KV records. Its exclusion rules do not constitute a forensic guarantee that historical tracked references contain no personal information; review document permissions before onward sharing. No new live patient exports are included.

Generate a reproducible file inventory with `python3 tools/package-developer-handover.py` after committing. The ZIP includes SHA-256 checksums for each source file. Do not commit generated ZIPs. Incomplete requirements and source gaps are expressly recorded in the audit rather than presented as 100% acceptance.
