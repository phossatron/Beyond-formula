#!/bin/sh
set -eu

url=http://127.0.0.1:4173/
body=$(curl --fail --silent --show-error --max-time 5 "$url")
printf '%s' "$body" | grep -Fq '<title>Beyond Lab — Formula Studio</title>'
printf 'Healthy: %s (Formula Studio HTML served)\n' "$url"
