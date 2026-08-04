#!/usr/bin/env bash
#
# prune-merged-branches.sh — delete branches whose PR is MERGED.
#
# Why this exists: after squash-merges (how this repo merges PRs), git's own
# `git branch --merged` is unreliable — a squash-merged branch's individual
# commits aren't reachable from main, so it looks "unmerged" even though its
# work is fully on main. The authoritative signal is GitHub's PR state, so
# this script keys off `gh pr list --state merged` instead of reachability.
#
# SAFETY: a branch is deleted ONLY if GitHub reports a MERGED pull request
# whose head is that branch, AND no OPEN PR uses it. Branches with no merged
# PR (e.g. abandoned/never-PR'd work) are reported and LEFT ALONE. `main` and
# the current branch are always protected.
#
# Dry-run by default (prints the plan, deletes nothing).
#   bash scripts/prune-merged-branches.sh            # preview local prune
#   bash scripts/prune-merged-branches.sh --apply    # actually delete local
#   bash scripts/prune-merged-branches.sh --remote --apply   # also prune origin/*
#
set -euo pipefail

APPLY=0
REMOTE=0
for arg in "$@"; do
  case "$arg" in
    --apply)  APPLY=1 ;;
    --remote) REMOTE=1 ;;
    *) echo "unknown arg: $arg (use --apply and/or --remote)" >&2; exit 2 ;;
  esac
done

cd "$(git rev-parse --show-toplevel)"
command -v gh >/dev/null || { echo "gh CLI required (authoritative for squash-merges)" >&2; exit 1; }

echo "[prune] fetching + pruning remote-tracking refs..."
git fetch origin --prune -q

# Authoritative sets from GitHub (head branch names).
mapfile -t MERGED_ARR < <(gh pr list --state merged --limit 300 --json headRefName -q '.[].headRefName' | sort -u)
mapfile -t OPEN_ARR   < <(gh pr list --state open   --limit 300 --json headRefName -q '.[].headRefName' | sort -u)
is_merged() { printf '%s\n' "${MERGED_ARR[@]}"      | grep -qxF -- "$1"; }
is_open()   { printf '%s\n' "${OPEN_ARR[@]:-__none__}" | grep -qxF -- "$1"; }

CURRENT="$(git branch --show-current)"

# If applying and we're sitting on a branch that qualifies for deletion,
# step onto main first (can't delete the branch you're on).
if [ "$APPLY" = 1 ] && [ "$CURRENT" != "main" ] && is_merged "$CURRENT" && ! is_open "$CURRENT"; then
  echo "[prune] on '$CURRENT' (merged) — switching to main first"
  git switch main -q && git pull --ff-only -q
  CURRENT="main"
fi

plan_delete=(); plan_skip=()
classify() {                 # $1 = branch name
  local b="$1"
  [ "$b" = "main" ] && return
  [ "$b" = "$CURRENT" ] && { plan_skip+=("$b  (current branch)"); return; }
  if is_open "$b";   then plan_skip+=("$b  (OPEN PR — never delete)"); return; fi
  if is_merged "$b"; then plan_delete+=("$b"); else plan_skip+=("$b  (no merged PR — left alone)"); fi
}

# ---- local branches ----
echo; echo "=== LOCAL branches ==="
while IFS= read -r b; do classify "$b"; done < <(git for-each-ref --format='%(refname:short)' refs/heads/)
for b in "${plan_delete[@]}"; do echo "  DELETE  $b"; done
for s in "${plan_skip[@]}";   do echo "  keep    $s"; done

if [ "$APPLY" = 1 ]; then
  for b in "${plan_delete[@]}"; do git branch -D "$b" >/dev/null && echo "  deleted local $b"; done
fi

# ---- remote branches (optional) ----
if [ "$REMOTE" = 1 ]; then
  echo; echo "=== REMOTE branches (origin/*) ==="
  rplan_delete=(); rplan_skip=()
  while IFS= read -r rb; do
    b="${rb#origin/}"
    [ "$b" = "main" ] || [ "$b" = "HEAD" ] && continue
    if is_open "$b";   then rplan_skip+=("$b  (OPEN PR)"); continue; fi
    if is_merged "$b"; then rplan_delete+=("$b"); else rplan_skip+=("$b  (no merged PR — left alone)"); fi
  done < <(git for-each-ref --format='%(refname:short)' refs/remotes/origin/)
  for b in "${rplan_delete[@]}"; do echo "  DELETE  origin/$b"; done
  for s in "${rplan_skip[@]}";   do echo "  keep    origin/$s"; done
  if [ "$APPLY" = 1 ]; then
    for b in "${rplan_delete[@]}"; do git push origin --delete "$b" >/dev/null 2>&1 && echo "  deleted origin/$b"; done
  fi
fi

echo
if [ "$APPLY" = 1 ]; then echo "[prune] done."; else echo "[prune] DRY RUN — nothing deleted. Re-run with --apply (add --remote for origin)."; fi
