#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$DIR/output"
mkdir -p "$OUT"

for f in "$DIR"/*.d2; do
  name="$(basename "$f" .d2)"
  d2 "$f" "$OUT/$name.png"
done
