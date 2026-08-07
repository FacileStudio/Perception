#!/bin/sh
set -e

DATA_DIR="$(git rev-parse --show-toplevel)/.local/postgres"
PORT=5433
DB_NAME=perception

if [ -f "$DATA_DIR/postmaster.pid" ]; then
  echo "Postgres already running"
  exit 0
fi

if [ ! -d "$DATA_DIR" ]; then
  initdb -D "$DATA_DIR" --no-locale --encoding=UTF8
fi

pg_ctl -D "$DATA_DIR" -l "$DATA_DIR/server.log" -o "-p $PORT" start
sleep 1

if ! psql -p "$PORT" -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
  createdb -p "$PORT" "$DB_NAME"
  echo "Created database: $DB_NAME"
fi

# Migrate() enables pgvector, so a local server without the extension installed
# fails at startup rather than at the first embedding. Say so here, once, where
# it is fixable, instead of leaving a reader to decode the migration error.
if ! psql -p "$PORT" -d "$DB_NAME" -c 'CREATE EXTENSION IF NOT EXISTS vector' >/dev/null 2>&1; then
  echo "warning: pgvector is not available on this server (install it, e.g. 'brew install pgvector')"
fi

echo "Postgres running on port $PORT"
