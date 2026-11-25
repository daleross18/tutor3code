#!/usr/bin/env bash
# Squashes the fork branch to its three commits on a base tag: identity, fork-owned new files,
# generated upstream hunks. The tree does not change. Usage: scripts/fork/squash.sh <base tag>
# The first commit after the tag must be the identity commit. Files that the identity commit
# adds or edits stay in it. Every other file that the tag does not have is a fork-owned file.
set -euo pipefail

base="${1:?usage: scripts/fork/squash.sh <base tag>}"
branch="$(git symbolic-ref --short HEAD)"
[ -z "$(git status --porcelain)" ] || { echo "Error: the work tree is not clean." >&2; exit 1; }
old="$(git rev-parse HEAD)"
identity="$(git rev-list --reverse "$base..$old" | head -1)"
[ -n "$identity" ] || { echo "Error: no commits after $base." >&2; exit 1; }
case "$(git log -1 --format=%s "$identity")" in
  "fork: app identity"*) ;;
  *) echo "Error: the first commit after $base is not the identity commit." >&2; exit 1 ;;
esac

git update-ref "refs/backup/$branch-presquash" "$old"
identity_files="$(git diff --name-only "$base" "$identity")"
new_files=()
while IFS= read -r file; do
  grep -qxF -- "$file" <<<"$identity_files" || new_files+=("$file")
done < <(git diff --name-only --diff-filter=A "$base" "$old")

trailer="Co-Authored-By: ${FORK_COAUTHOR:-Claude Opus 5.5 <noreply@anthropic.com>}"
git checkout -q -B "$branch" "$base"
git cherry-pick "$identity" >/dev/null
git checkout "$old" -- "${new_files[@]}"
git commit -q --no-verify -m "fork: split panes with top-level tabs (new files)" -m "$trailer"
git checkout "$old" -- .
if ! git diff --cached --quiet; then
  git commit -q --no-verify -m "fork: generated upstream hunks (scripts/fork/apply-pane-hunks.ts)" -m "$trailer"
fi

if ! git diff --quiet "$old" HEAD; then
  echo "Error: the squashed tree differs from $old. The old tip is refs/backup/$branch-presquash." >&2
  exit 1
fi
echo "Squashed to $(git rev-list --count "$base..HEAD") commits on $base: $(git rev-parse --short=10 HEAD)."
echo "Upstream files edited after the identity commit are in the hunks commit. The old tip is refs/backup/$branch-presquash."
