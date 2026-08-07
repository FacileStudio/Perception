#!/bin/sh
set -e

DATA_DIR="$(git rev-parse --show-toplevel)/.local/postgres"

if [ ! -f "$DATA_DIR/postmaster.pid" ]; then
  echo "Postgres not running"
  exit 0
fi

pg_ctl -D "$DATA_DIR" stop
echo "Postgres stopped"
