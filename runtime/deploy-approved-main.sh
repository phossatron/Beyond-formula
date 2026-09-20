#!/bin/sh
set -eu

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repo_dir"

if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]; then
  printf '%s\n' 'Refusing deployment: preserve or commit all local changes first.' >&2
  exit 1
fi

git fetch --prune origin main
git switch main
git merge --ff-only origin/main
./runtime/install-local-runtime.sh
git rev-parse HEAD
