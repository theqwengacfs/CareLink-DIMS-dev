# CareLink C-DIMS — Standing Agent Rules (`AGENTS.md`)

This repository (`theqwengacfs/CareLink-DIMS-dev`) is developed sequentially across multiple Arena accounts (one active session at a time) and deployed automatically to Production via **Vercel** from the `main` branch.

Every AI coding agent working in this repository **must** follow these standing rules in every session:

## 1. Multi-Account Sync Before Editing
- If resuming an existing session/branch after work may have occurred in another account, run `git fetch origin main` first and merge/rebase `origin/main` into the current session branch before making code edits so no prior changes are overwritten.
- Always work on the session's assigned `arena/...` branch (never switch to or push directly to `main`).

## 2. Build, Bundle & Test Synchronisation
- Keep CSS and JS module arrays strictly synchronized across all three manifests:
  - `tools/sync-lovable.mjs`
  - `v6/build.py`
  - `v6/test/modules.js`
- After modifying any file under `v6/src/`, rebuild the application bundles (`node tools/sync-lovable.mjs` and `python3 v6/build.py`, plus `python3 v6/tools/make_kit.py` if releasing the offline kit) and run `npm run test:all` + `npm run build` so Vercel receives up-to-date static and compiled assets.

## 3. Public Repository Data-Protection Guard
- `theqwengacfs/CareLink-DIMS-dev` is a **public** GitHub repository.
- Never commit real patient PII, live subscriber phone numbers, device IMEIs, real vehicle plates, staff payroll/bank details, or sensitive internal Word/Excel/PDF documents (delegation plans, leave forms, handover reports, food-budget sheets, employee handbooks). Parse sensitive reference documents only in ephemeral `/tmp` storage and purge them immediately after extracting domain logic.

## 4. Mandatory End-of-Task / End-of-Session GitHub & Vercel Prompt
- Whenever an implementation task or session milestone is completed and there are uncommitted or unmerged changes on the current branch, **always ask the user at the end of the turn** whether they want to:
  > **"Commit our changes, push this branch to GitHub, open a Pull Request into `main`, and merge it."**
- Only execute the commit -> push -> PR -> merge sequence once the user confirms, so `main` on GitHub and the live **Vercel** deployment stay cleanly synchronized across all Arena accounts.
