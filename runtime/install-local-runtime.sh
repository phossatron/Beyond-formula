#!/bin/sh
set -eu

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
uid=$(id -u)
label=com.beyond-formula.runtime
template="$repo_dir/runtime/$label.plist"
runtime_dir="$repo_dir/runtime/.runtime"
site_dir="$repo_dir/runtime/site"
plist="$runtime_dir/$label.plist"

mkdir -p "$repo_dir/runtime/logs" "$site_dir" "$runtime_dir"
install -m 0644 "$repo_dir/index.html" "$site_dir/index.html"
sed "s|__REPO_DIR__|$repo_dir|g" "$template" > "$plist"
plutil -lint "$plist"
launchctl bootout "gui/$uid/$label" 2>/dev/null || true
launchctl bootstrap "gui/$uid" "$plist"
printf 'Formula Studio runtime started: http://127.0.0.1:4173/\n'
