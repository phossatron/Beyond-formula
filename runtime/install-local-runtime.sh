#!/bin/sh
set -eu

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
uid=$(id -u)
label=com.beyond-formula.runtime
plist="$repo_dir/runtime/$label.plist"

mkdir -p "$repo_dir/runtime/logs"
plutil -lint "$plist"
launchctl bootout "gui/$uid/$label" 2>/dev/null || true
launchctl bootstrap "gui/$uid" "$plist"
printf 'Formula Studio runtime started: http://127.0.0.1:4173/\n'
