#!/bin/sh
# Fails if any GRID data (or files derived from it) is tracked or staged. Licence: no redistribution.
bad=$( { git ls-files; git diff --cached --name-only; } | sort -u \
  | grep -Ei '\.(zst|jsonl|parquet|sqlite|duckdb)$|stl-hackathon-2026-grid-starter|^public/packs/pro/|^pipeline/out/' )
if [ -n "$bad" ]; then
  echo "BLOCKED: GRID data must not be committed:" >&2
  echo "$bad" >&2
  exit 1
fi
