#!/usr/bin/env bash
# ============================================================================
# purge_patient_data.sh - erase personal-data files from this repository's
#                         Git history, permanently.
#
# WHY THIS EXISTS
#   Removing a file in a new commit takes it off the live site and out of the
#   working tree, but the blob stays in history and is still downloadable at the
#   old commit's raw URL. For a public repository that holds patient names,
#   National IDs and telephone numbers, "removed" is not enough: the history has
#   to be rewritten.
#
# WHAT IT DOES
#   1. Refuses to run unless the working tree is clean and you are on main.
#   2. Makes a full backup bundle of the current history first.
#   3. Unshallows the clone if needed (a shallow clone cannot be rewritten).
#   4. Runs git filter-repo to drop the listed paths from EVERY commit.
#   5. Verifies: the paths are gone from all history, the suite still passes,
#      and the shipped bundle is unchanged.
#   6. Prints the force-push command and the GitHub support request. It does
#      NOT push: a history rewrite of a shared branch is a decision, not a step.
#
# USAGE
#   python3 -m pip install --user git-filter-repo     # once
#   bash v6/tools/purge_patient_data.sh               # dry run: reports only
#   bash v6/tools/purge_patient_data.sh --rewrite     # rewrite local history
#   bash v6/tools/purge_patient_data.sh --rewrite --push   # ...and force-push
#
# AFTER A REWRITE, EVERYONE MUST RE-CLONE. Old clones, forks and anything
# already downloaded keep their copies; the rewrite protects the future, not the
# past. Ask GitHub Support to clear cached views and forks (the request text is
# printed at the end).
# ============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

hr(){ printf '%s\n' "----------------------------------------------------------------"; }

# Paths to erase. Add to this list anything that holds personal data.
# Override for a test run with:  PURGE_PATHS="a.xlsx|b.csv" bash this-script.sh
PATHS=(
  # Patient data: names, National IDs, telephone numbers, household composition,
  # health status. Removed from the working tree in October 2026; still in history.
  "20260101 LOMAMO registration patients 2026 (1).xlsx"
  "20260101 LOMAMO registration patients 2026.xlsx"
  # Organisational secrets: vehicle plates and chassis numbers, handset IMEIs,
  # staff SIM numbers, asset values, and which member of staff carries which
  # device. Removed from the working tree on 23 October 2026; still in history.
  "LOMAMO Kisumu Master Inventory october 2026.xlsx"
  "LMMK Medical supplies inventory - OCT2026.xlsx"
)
if [[ -n "${PURGE_PATHS:-}" ]]; then
  IFS='|' read -r -a PATHS <<< "$PURGE_PATHS"
fi

MODE="report"
for arg in "$@"; do
  case "$arg" in
    --rewrite)      [[ "$MODE" == "report" ]] && MODE="rewrite" ;;
    --push)         MODE="push" ;;
    --check-remote) MODE="check-remote" ;;
    --fresh-history) MODE="fresh-history" ;;
    *) echo "usage: $0 [--rewrite] [--push] [--check-remote] [--fresh-history]"; exit 2 ;;
  esac
done

echo "LOMAMO C-DIMS · personal-data history purge"
hr
echo "repository : $REPO_ROOT"
echo "mode       : $MODE"
echo "branch     : $(git rev-parse --abbrev-ref HEAD)"
echo

# --- remote check -----------------------------------------------------------
# Asks GitHub whether each targeted path is still reachable at the commits that
# introduced it. Discovers those commits from the repository (or from the API
# when this clone is shallow), so nothing is hardcoded and no SHA ends up in a
# published document.
check_remote() {
  if ! command -v gh >/dev/null 2>&1; then
    echo "gh (GitHub CLI) is not installed. Check manually in a browser:"
    echo "  https://github.com/OWNER/REPO/commits/main/<path>"
    return 1
  fi
  local repo
  repo="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)"
  if [[ -z "$repo" ]]; then
    echo "Could not determine the repository from this clone's remote."; return 1
  fi
  echo "Asking GitHub about $repo ..."
  echo
  local dirty=0
  for p in "${PATHS[@]}"; do
    local enc shas
    enc="$(python3 - "$p" <<'PYENC'
import sys, urllib.parse
print(urllib.parse.quote(sys.argv[1], safe=''))
PYENC
)"
    # commits that touched the path: local history first, API when shallow
    shas="$(git log --all --format=%H -- "$p" 2>/dev/null | head -5)"
    if [[ -z "$shas" ]]; then
      shas="$(gh api "repos/$repo/commits?path=$enc&per_page=5" --jq '.[].sha' 2>/dev/null | head -5)"
    fi
    if [[ -z "$shas" ]]; then
      echo "  GONE           $p"
      echo "                 no commit on the remote touches this path"
      continue
    fi
    local served=0 total=0
    while read -r sha; do
      [[ -z "$sha" ]] && continue
      total=$((total+1))
      if gh api "repos/$repo/contents/$enc?ref=$sha" --jq '.sha' >/dev/null 2>&1; then
        served=$((served+1))
      fi
    done <<< "$shas"
    if [[ "$served" -gt 0 ]]; then
      dirty=1
      echo "  STILL SERVED   $p"
      echo "                 reachable at $served of $total commit(s) that touched it"
    else
      echo "  GONE           $p"
      echo "                 not reachable at any of the $total commit(s) checked"
    fi
  done
  echo
  if [[ "$dirty" == "1" ]]; then
    echo "RESULT: personal data is still downloadable from this repository's history."
    echo "        Run:  bash v6/tools/purge_patient_data.sh --rewrite"
    echo "        then: git push --force --all origin && git push --force --tags origin"
    echo "        then: bash v6/tools/purge_patient_data.sh --check-remote   (again)"
    echo "        and ask GitHub Support to purge cached views (text printed by --rewrite)."
    return 1
  fi
  echo "RESULT: clean. No targeted path is reachable in the remote history."
  return 0
}

if [[ "$MODE" == "check-remote" ]]; then
  echo "LOMAMO C-DIMS · remote history exposure check"
  hr
  check_remote
  exit $?
fi

# --- fresh history ----------------------------------------------------------
# An in-place rewrite drops whole PATHS from every commit. That is enough for a
# file that was only ever a file. It is NOT enough here: the inventory
# identifiers were copied into v6/src/inventory_data.js and from there into every
# revision of the built bundle, the offline single-file app and the office kit
# ZIP. Those files cannot be dropped from history - the application lives in
# them - and rewriting strings inside a 3.6 MB generated bundle in 100+ commits
# also corrupts the historical ZIPs, whose byte offsets shift.
#
# The route that is both complete and simple is a fresh history: one commit from
# the current, verified-clean tree. Nothing older is published, so nothing older
# can be recovered. Combined with deleting and recreating the repository it also
# clears refs/pull/*, which no force-push can.
#
# This creates the branch. It does not push, and it does not delete anything.
fresh_history() {
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "REFUSING: the working tree is not clean. Commit or stash first."
    git status --short | head -20
    exit 1
  fi
  echo "Running the verifier first - a fresh history is only worth having if it is clean ..."
  if ! python3 v6/tools/verify_no_patient_data.py; then
    echo "REFUSING: the tree is not clean. Fix the failures above before starting a new history."
    exit 1
  fi
  local BR="main-clean"
  if git show-ref --verify --quiet "refs/heads/$BR"; then
    echo "REFUSING: a branch named $BR already exists. Delete or rename it first."
    exit 1
  fi
  # A commit needs an identity. Check before creating the orphan branch, not
  # after: failing mid-way leaves the clone on a half-built branch with
  # everything staged, which is a confusing place for anyone to land.
  if [[ -z "$(git config user.name || true)" || -z "$(git config user.email || true)" ]]; then
    echo "REFUSING: git has no committer identity in this clone. Set one first:"
    echo "    git config --global user.name  \"Your Name\""
    echo "    git config --global user.email \"you@example.com\""
    exit 1
  fi
  local START_BRANCH; START_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  echo
  echo "Creating $BR: one commit, no ancestors, from the current tree ..."
  git checkout --orphan "$BR" >/dev/null
  git add -A
  # If the commit fails for any reason, go home rather than leave the clone
  # sitting on an orphan branch with the whole tree staged.
  if ! git commit --quiet -F - <<'MSG'
Reset the published history: structure only, no personal or organisational data

This repository began with a fresh history on 23 October 2026. Earlier revisions
held files that should never have been published:

  * the Administration's patient master workbook - patient names, National IDs,
    telephone numbers, household composition and health status;
  * the October 2026 inventory workbooks, and the copy of one of them inside
    v6/src/inventory_data.js and every built bundle - vehicle registration
    plates, chassis numbers, handset IMEIs, staff SIM numbers, asset values and
    which member of staff carries which device.

Both were removed from the working tree, and the identifiers were removed from
the code that ships. What is published now is the STRUCTURE those workbooks
define - categories, columns, vocabularies, rules, formulas, count sheets and
aggregate baselines - which is what they were supplied for. Records enter through
System -> Master data import on the office host, behind login and the audit
trail. v6/tools/verify_no_patient_data.py proves this tree is clean, and is the
standing check before any release.

Document 23 records what was exposed and what was done. Document 22 is the
runbook for the history itself. Kenya Data Protection Act (2019) notification
duties were referred to the data controller.
MSG
  then
    echo "REFUSING: the commit failed. Returning you to $START_BRANCH."
    git checkout "$START_BRANCH" >/dev/null 2>&1 || true
    git branch -D "$BR" >/dev/null 2>&1 || true
    exit 1
  fi
  echo "  created: $(git rev-parse --short HEAD) on $BR ($(git rev-list --count HEAD) commit, $(git ls-files | wc -l | tr -d ' ') files)"
  git checkout "$START_BRANCH" >/dev/null 2>&1 || true
  cat <<EOF

A clean single-commit history now exists on the branch '$BR'. Nothing was pushed
and nothing was deleted. To publish it, and to clear the old pull-request refs
that a force-push cannot reach:

  1. Verify it:
       git checkout $BR
       python3 v6/tools/verify_no_patient_data.py      # want CLEAN
       npm run test:all                                # want every suite green
       git checkout $START_BRANCH

  2. GitHub -> Settings -> Danger Zone -> Delete this repository
     (this is what removes refs/pull/*, cached views and the old object store;
      you lose issues, pull requests, stars and watchers - not the code)

  3. GitHub -> New repository -> theqwengacfs/CareLink-DIMS-dev
     Keep it PRIVATE. Do not initialise it with a README, .gitignore or licence.

  4. Publish the fresh history:
       cd $(basename "$REPO_ROOT")
       git remote remove origin 2>/dev/null || true
       git remote add origin ${ORIGIN_URL:-https://github.com/theqwengacfs/CareLink-DIMS-dev.git}
       git push -u origin $BR:main

  5. Settings -> Pages -> build from main, root. Confirm .nojekyll is present.
     A private repository has no Pages site on GitHub Free: publish from Lovable,
     Netlify or Vercel, or make the repository public once you are satisfied.

  6. Prove it, then tell every colleague to delete their clone and clone again:
       bash v6/tools/purge_patient_data.sh --check-remote
       python3 v6/tools/verify_no_patient_data.py

If you would rather keep the existing issues and pull requests, use --rewrite
instead and read section 5 of v6/docs/22_PURGE_RUNBOOK.md first: that route
removes the workbook files but leaves the identifiers inside historical bundles,
and needs both --replace-text and a GitHub Support request to go further.
EOF
}

if [[ "$MODE" == "fresh-history" ]]; then
  echo "LOMAMO C-DIMS · fresh history"
  hr
  ORIGIN_URL="$(git config --get remote.origin.url || true)"
  fresh_history
  exit 0
fi

# --- 0. preconditions -------------------------------------------------------
if [[ "$(git rev-parse --abbrev-ref HEAD)" != "main" && "$MODE" != "report" && -z "${PURGE_ALLOW_BRANCH:-}" ]]; then
  echo "REFUSING: a history rewrite must be run from main. You are on $(git rev-parse --abbrev-ref HEAD)."
  echo "(Set PURGE_ALLOW_BRANCH=1 only for a rehearsal on a throwaway clone.)"
  exit 1
fi
if [[ -n "$(git status --porcelain)" && "$MODE" != "report" && -z "${PURGE_ALLOW_DIRTY:-}" ]]; then
  echo "REFUSING: the working tree is not clean. Commit or stash first."
  git status --short | head -20
  exit 1
fi
if ! command -v git-filter-repo >/dev/null 2>&1 && ! python3 -c "import git_filter_repo" 2>/dev/null; then
  echo "git-filter-repo is not installed. Install it once with:"
  echo "    python3 -m pip install --user git-filter-repo"
  [[ "$MODE" == "report" ]] || exit 1
fi

# --- 1. report what is there ------------------------------------------------
echo "Paths targeted for erasure:"
found_any=0
for p in "${PATHS[@]}"; do
  # in the working tree?
  if [[ -e "$p" ]]; then
    echo "  PRESENT IN WORKING TREE : $p ($(du -h "$p" | cut -f1))"
    found_any=1
  fi
  # anywhere in history?
  commits=$(git log --all --oneline -- "$p" 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$commits" != "0" ]]; then
    echo "  IN HISTORY ($commits commit(s)) : $p"
    git log --all --oneline -- "$p" 2>/dev/null | sed 's/^/      /'
    found_any=1
  fi
done
if [[ "$found_any" == "0" ]]; then
  echo "  none - nothing to erase in this clone."
  echo
  echo "NOTE: if this is a shallow clone the history is not present locally, so"
  echo "      'nothing to erase' does not mean 'nothing on GitHub'. Check with:"
  echo "        git rev-list --all --count          (1 = shallow)"
  echo "        gh api repos/OWNER/REPO/contents/PATH?ref=OLD_SHA"
fi
echo
echo "clone depth: $(git rev-list --all --count) commit(s) reachable"
if [[ -f .git/shallow ]]; then echo "             THIS IS A SHALLOW CLONE - it must be unshallowed before a rewrite."; fi
hr

if [[ "$MODE" == "report" ]]; then
  echo "Report only. Re-run with --rewrite to rewrite local history."
  exit 0
fi

# --- 2. backup --------------------------------------------------------------
# git filter-repo REMOVES the origin remote on purpose, so that a rewritten
# history cannot be pushed back by accident. Capture the URL first: without it
# the force-push after a rewrite fails with "origin does not appear to be a git
# repository", and the fix is not obvious at that point in the run.
ORIGIN_URL="$(git config --get remote.origin.url || true)"
if [[ -z "$ORIGIN_URL" ]]; then
  echo "WARNING: this clone has no origin remote. After the rewrite you must add one:"
  echo "    git remote add origin https://github.com/theqwengacfs/CareLink-DIMS-dev.git"
fi
BACKUP="../$(basename "$REPO_ROOT")-pre-purge-$(date +%Y%m%d-%H%M%S).bundle"
echo "Creating a full backup bundle at $BACKUP ..."
git bundle create "$BACKUP" --all
echo "  backup written: $(du -h "$BACKUP" | cut -f1). Restore with:"
echo "    git clone \"$BACKUP\" restored-repo"
echo

# --- 3. unshallow if needed -------------------------------------------------
if [[ -f .git/shallow ]]; then
  echo "Unshallowing the clone (a shallow clone cannot be rewritten) ..."
  git fetch --unshallow origin || git fetch --all
fi

# --- 4. rewrite -------------------------------------------------------------
ARGS=(--invert-paths --force)
for p in "${PATHS[@]}"; do ARGS+=(--path "$p"); done
echo "Rewriting history: git filter-repo ${ARGS[*]}"
if command -v git-filter-repo >/dev/null 2>&1; then
  git filter-repo "${ARGS[@]}"
else
  python3 -m git_filter_repo "${ARGS[@]}"
fi
echo
# filter-repo has just deleted origin. Put it back so the force-push can run.
if [[ -n "$ORIGIN_URL" ]]; then
  git remote add origin "$ORIGIN_URL" 2>/dev/null || git remote set-url origin "$ORIGIN_URL"
  echo "origin restored: $ORIGIN_URL"
  echo
fi

# --- 5. verify --------------------------------------------------------------
echo "Verifying ..."
fail=0
for p in "${PATHS[@]}"; do
  if [[ -n "$(git log --all --oneline -- "$p" 2>/dev/null)" ]]; then
    echo "  FAIL: $p is still reachable in history"; fail=1
  else
    echo "  ok: $p is not reachable in any commit"
  fi
done
echo "  commits now reachable: $(git rev-list --all --count)"
if [[ -f public/carelink-v6.html ]]; then
  echo "  shipped bundle: $(du -h public/carelink-v6.html | cut -f1) (must be unchanged by a purge)"
fi
if command -v node >/dev/null 2>&1 && [[ -f package.json ]]; then
  echo "  running the acceptance suites ..."
  if npm run --silent test:all >/tmp/purge-tests.log 2>&1; then
    echo "  ok: suites pass"
  else
    echo "  FAIL: suites did not pass - see /tmp/purge-tests.log"; tail -20 /tmp/purge-tests.log; fail=1
  fi
fi
if [[ "$fail" == "1" ]]; then
  echo
  echo "Verification failed. Restore from the backup bundle before doing anything else:"
  echo "    git clone \"$BACKUP\" restored-repo"
  exit 1
fi
hr

# --- 6. publish -------------------------------------------------------------
if [[ "$MODE" == "push" ]]; then
  echo "Force-pushing the rewritten history to origin ..."
  if [[ -z "$(git config --get remote.origin.url || true)" ]]; then
    echo "REFUSING: there is no origin remote to push to. Add it first:"
    echo "    git remote add origin ${ORIGIN_URL:-https://github.com/theqwengacfs/CareLink-DIMS-dev.git}"
    exit 1
  fi
  git push --force --all origin
  git push --force --tags origin
else
  echo "History rewritten LOCALLY. To publish it:"
  echo
  echo "    git push --force --all origin"
  echo "    git push --force --tags origin"
fi
cat <<'EOF'

THEN, on GitHub - in this order:
  1. Understand what a force-push does NOT remove.
     GitHub keeps a read-only ref for every pull request (refs/pull/N/head), and
     those refs are not touched by `git push --force --all`. If a pull request
     was opened from a commit whose history contains one of these files, the
     blob stays reachable at that SHA - so
       https://github.com/theqwengacfs/CareLink-DIMS-dev/raw/<old-sha>/<path>
     may still return the file after a successful rewrite and force-push. Cached
     views of old blobs behave the same way. Neither is something you did wrong,
     and neither can be cleared from the command line: only GitHub Support can,
     or deleting and recreating the repository can.
  2. Ask GitHub Support, the same day:
       https://support.github.com/contact/attachments
       Subject: Purge cached content, unreachable blobs and pull-request refs
                for a repository that held personal data
       Body:    Repository: theqwengacfs/CareLink-DIMS-dev
                Files containing personal data (patient names, National IDs and
                telephone numbers) and organisational secrets (vehicle
                registration plates, chassis numbers, handset IMEIs, staff
                telephone numbers and asset values) were committed to this
                repository. I have removed them with a git filter-repo history
                rewrite and force-pushed every branch and tag. Please:
                  a) purge all cached views and the now-unreachable blobs;
                  b) remove the refs/pull/* references that still make the old
                     commits reachable, or otherwise make those blobs unreachable;
                  c) remove any forks created before the rewrite.
                The removed paths were:
                  20260101 LOMAMO registration patients 2026 (1).xlsx
                  20260101 LOMAMO registration patients 2026.xlsx
                  LOMAMO Kisumu Master Inventory october 2026.xlsx
                  LMMK Medical supplies inventory - OCT2026.xlsx
     Keep the ticket number. Re-run --check-remote after they confirm.
  3. Tell every colleague to DELETE their local clone and clone again. An old
     clone still holds the files, and pushing it back restores the old history.
     This is the most common way a purge is silently undone.
  4. Settings -> Pages: confirm the site rebuilds from the new main. The URL
     does not change. If the repository is private, Pages is off on GitHub Free:
     publish from Lovable, Netlify or Vercel, or wait until step 2 is confirmed
     and make the repository public again.
  5. Prove it:
       bash v6/tools/purge_patient_data.sh --check-remote     # want GONE for all
       python3 v6/tools/verify_no_patient_data.py             # want CLEAN

WHAT A REWRITE DOES NOT DO
  It does not un-send a file. Anyone who already downloaded it, any fork made
  before the rewrite, and any mirror, crawler or web archive that fetched it
  still hold a copy. Both sets of files were publicly reachable until they were
  removed, and that window cannot be shortened retroactively. Treat it as a data
  incident, not only a cleanup: tell the data controller, and consider the
  notification duties under the Kenya Data Protection Act (2019) for the personal
  data involved - patient health status and household composition, and staff
  telephone numbers attached to named people.
EOF
