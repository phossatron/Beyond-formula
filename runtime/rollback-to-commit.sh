#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  printf 'Usage: %s <approved-commit-sha>\n' "$0" >&2
  exit 64
fi

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repo_dir"

if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]; then
  printf '%s\n' 'Refusing rollback: preserve or commit all local changes first.' >&2
  exit 1
fi

git fetch --prune origin
git merge-base --is-ancestor "$1" origin/main
git checkout --detach "$1"
./runtime/install-local-runtime.sh
git rev-parse HEAD
