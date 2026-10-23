# 22 · Purge runbook — erasing personal data and organisational secrets from Git history

**Audience:** the repository owner (or anyone with admin rights on
`theqwengacfs/CareLink-DIMS-dev`).
**Tools:** `v6/tools/purge_patient_data.sh` (report, rewrite, fresh history,
remote check), `v6/tools/redact_inventory.py` (redaction and filter-repo
replacements) and `v6/tools/verify_no_patient_data.py` (proves the result).
**Read with:** document 23, which records what was exposed and what was changed
in the code.

---

## 1. Where things stand

| Question | Answer |
|---|---|
| Is the repository public? | **No.** Made private on 23 October 2026. Nothing in it is downloadable by the public while it stays private |
| Are the workbooks in the working tree? | **No.** The patient master sheet went on 22 October 2026; the two inventory workbooks on 23 October 2026 |
| Is any identifier in the built application? | **No.** The register was redacted, the bundle rebuilt, the offline kit repacked, and `verify_no_patient_data.py` reports CLEAN across 172 files and every archive |
| Are the seeded people reachable? | **No.** Telephone numbers, National IDs, clinic numbers and mailboxes are all in reserved space (document 23 §3) |
| Is any of it still in Git **history**? | **Yes.** Four workbooks, plus the identifiers inside every historical revision of `v6/src/inventory_data.js`, `public/carelink-v6.html`, `v6/LOMAMO-CareLink-DIMS-v6.0.html` and the office kit ZIP |

No commit SHA is printed in this document. A public SHA plus a path is a
signpost; find the commits yourself with `git log --all --oneline -- "<path>"`.

## 2. Choose a route before you start

| Route | What it removes | Keeps issues and PRs | Complete? |
|---|---|---|---|
| **A · fresh history** (`--fresh-history`, then delete and recreate the repository) | everything: old commits, old blobs, cached views and `refs/pull/*` | no | **yes** |
| **B · in-place rewrite** (`--rewrite` + force-push + Support request) | the four workbook paths | yes | **no** — see §5 |
| **C · stay private** | nothing, but nothing is reachable either | yes | yes, for as long as it stays private |

**Route A is the recommendation.** It is the only route that is both complete and
simple, this repository has no community to lose, and the repository is already
private so there is no exposure while you work. Route B is documented for
completeness and for owners who must keep their issue history.

**Whatever the route, first:**

1. **Tell the team to stop pushing.** A rewrite changes every commit SHA. Anyone
   who pushes an old clone afterwards restores the old history.
2. **Take the copies you need.** After the rewrite the workbooks are
   unrecoverable from GitHub. They are the Administration's master records and
   belong on the office host. Recover a copy from history before you start:
   `git show HEAD:"<path>" > ~/office/<name>.xlsx`
3. **Install the tools once:** `python3 -m pip install --user git-filter-repo openpyxl`

## 3. Route A · fresh history

```bash
cd CareLink-DIMS-dev
git checkout main && git pull
npm install                                   # the script runs the suites

# 1. creates a single-commit branch 'main-clean' from the verified-clean tree.
#    It runs the verifier first and refuses if anything is found. It pushes
#    nothing and deletes nothing.
bash v6/tools/purge_patient_data.sh --fresh-history

# 2. verify that branch, then follow the printed steps:
git checkout main-clean
python3 v6/tools/verify_no_patient_data.py    # want CLEAN
npm run test:all                              # want every suite green
git checkout main
```

Then, on GitHub — these steps are yours, not a script's:

1. **Settings → Danger Zone → Delete this repository.** This is what clears
   `refs/pull/*`, cached views and the old object store. You lose issues, pull
   requests, stars and watchers. You do not lose code.
2. **New repository → `theqwengacfs/CareLink-DIMS-dev`**, private, with no
   README, `.gitignore` or licence.
3. Publish the fresh history:
   ```bash
   git remote remove origin 2>/dev/null || true
   git remote add origin https://github.com/theqwengacfs/CareLink-DIMS-dev.git
   git push -u origin main-clean:main
   ```
4. **Settings → Pages** → build from `main`, root. `.nojekyll` is in the tree.
   A private repository has no Pages site on GitHub Free: publish from Lovable,
   Netlify or Vercel, or make it public once §6 reports clean.
5. **Everyone re-clones.** `rm -rf CareLink-DIMS-dev && git clone …` An old clone
   still holds everything, and pushing it back would restore it.

## 4. Route B · in-place rewrite

```bash
bash v6/tools/purge_patient_data.sh            # report: what is where, changes nothing
bash v6/tools/purge_patient_data.sh --rewrite  # backup bundle, rewrite, verify, run suites
git push --force --all origin                  # origin was restored by the script
git push --force --tags origin
bash v6/tools/purge_patient_data.sh --check-remote
```

`--rewrite` writes a full backup bundle beside the repository before touching
anything, unshallows a shallow clone, refuses to run on a dirty tree or off
`main`, and re-runs `npm run test:all` afterwards so a purge can never silently
break the application. Restore with `git clone "<that bundle>" restored-repo`.

**`git filter-repo` deletes your `origin` remote on purpose**, so that a
rewritten history cannot be pushed back by accident. The script captures the URL
beforehand and puts it back; if you drive filter-repo by hand, expect
*"origin does not appear to be a git repository"* and run
`git remote add origin https://github.com/theqwengacfs/CareLink-DIMS-dev.git`.

If your clone is shallow (`git rev-list --all --count` returns 1), the script
unshallows it first. A shallow clone cannot be rewritten, and "nothing to erase"
in a shallow clone does not mean "nothing on GitHub".

## 5. Why Route B is not complete — read before choosing it

`--rewrite` drops whole paths from every commit. That is the right tool for a
file that was only ever a file. It is not enough here, because the inventory
identifiers were **copied into source** and from there into generated artefacts:

- `v6/src/inventory_data.js` — every revision before 23 October 2026 holds them;
- `public/carelink-v6.html`, `v6/LOMAMO-CareLink-DIMS-v6.0.html` — the built
  bundle, in every revision, and these files *are* the application, so they
  cannot be dropped from history;
- `v6/LOMAMO-CareLink-DIMS-v6.0-Office-Kit.zip` — the same bundle, twice, inside
  a ZIP.

Two further problems sit behind that:

1. **`refs/pull/*` survive a force-push.** GitHub keeps a read-only ref for every
   pull request, and `git push --force --all` does not touch them. This
   repository has merged pull requests whose head commits descend from the
   commits that introduced the files, so the blobs stay reachable at those SHAs
   and `…/raw/<old-sha>/<path>` can keep returning them. Only GitHub Support, or
   deleting the repository, clears those refs.
2. **Rewriting strings inside history corrupts archives.** A partial answer to
   the bundle problem is `--replace-text`, which rewrites the identifier strings
   inside every blob. The generator for it is shipped:
   ```bash
   python3 v6/tools/redact_inventory.py \
     --master ~/office/"LOMAMO Kisumu Master Inventory october 2026.xlsx" \
     --replace-text-file ~/replacements.txt      # outside the repository
   git filter-repo --replace-text ~/replacements.txt --force
   shred -u ~/replacements.txt                   # it holds the secrets it removes
   ```
   It covers only unambiguous strings — plates, chassis numbers, IMEIs,
   subscriber numbers, `Kshs … Million` amounts. Four-figure asset values are
   deliberately excluded, because replacing a bare number everywhere would
   corrupt unrelated numbers in unrelated files. And because replacements change
   byte lengths, **every historical ZIP stops being a valid archive.**

So Route B leaves short asset values in old bundles, needs a Support ticket to
clear `refs/pull/*`, and breaks historical ZIPs. Route A has none of those
problems. If you choose Route B anyway, file the Support request the same day —
the script prints the exact subject and body, listing all four paths and asking
for cached views, unreachable blobs, pull-request refs and forks.

## 6. Prove it

```bash
bash v6/tools/purge_patient_data.sh --check-remote   # want GONE for every path
python3 v6/tools/verify_no_patient_data.py           # want CLEAN, exit 0
python3 v6/tools/redact_inventory.py --check         # want OK, exit 0
```

`--check-remote` discovers the commits that touched each targeted path and asks
the GitHub API whether the file is still reachable at them; nothing is hardcoded
and no SHA is written into a document. Run it after the push, and again after
GitHub Support confirms a cache purge (Route B).

In a browser, an old raw URL should return 404 — and on Route B it may not, for
the reason in §5.1. That is the signal to escalate to Support, not to retry the
push.

## 7. What no rewrite does

It does not un-send a file. Anyone who downloaded it, any fork made before the
rewrite, and any mirror, crawler or web archive that fetched it still holds a
copy. Both sets of workbooks were publicly downloadable until they were removed,
and that window cannot be shortened retroactively.

Treat it as a data incident, not only a cleanup:

- The patient workbook held names, National IDs, telephone numbers, household
  composition and **health status**. The inventory workbook held **staff
  telephone numbers attached to named people**, which is personal data too.
- Tell the data controller (the Director) and take advice on the notification
  duties under the **Kenya Data Protection Act (2019)**.
- Making the repository private on 23 October 2026 stopped all public access
  immediately, and is the strongest available evidence that the Foundation acted
  as soon as it knew. Keep it private until §6 reports clean on the published
  history, not only on the working tree.

## 8. Keeping it clean afterwards

- `python3 v6/tools/verify_no_patient_data.py` is the standing check: six passes
  covering patient identities, organisational secrets, the published register,
  the seeded-contact conventions and the tracked files. Run it before any release
  and after any import. It exits non-zero on any match.
- `.gitignore` refuses any spreadsheet at the repository root. The only
  spreadsheet this repository publishes is the blank demo-only import template
  under `v6/examples/`.
- Patient and asset records enter through *System → Master data import* and the
  equipment register on the office host. The repository holds structure,
  vocabularies, formulas, count sheets, aggregate baselines and mappings:
  `20_MASTER_WORKBOOK_MAPPING.md` §6 for patients, `23_INVENTORY_REDACTION.md`
  §4–5 for assets.
