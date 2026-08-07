#!/usr/bin/env sh
#
# The repository quality gate. Reports, never rewrites (except --format).
#
#   sh scripts/check.sh             gofmt + vet + test on every Go module, then the client
#   sh scripts/check.sh --go-only   Go modules only
#   sh scripts/check.sh --format    rewrite Go sources in place
#
# Deliberately depends on nothing but a `go` on PATH and `bun` for the client.
# It is NOT invoked through mise: `mise run` resolves every tool in the merged
# config before running any task body, so an unrelated broken tool in the
# user's global config would take this gate down with it.

set -eu

GO_MODULES="apps/api"
CLIENT_DIR="apps/client"

mode="all"
case "${1:-}" in
--go-only) mode="go" ;;
--format) mode="format" ;;
"") ;;
*)
  echo "usage: $0 [--go-only|--format]" >&2
  exit 2
  ;;
esac

cd "$(git rev-parse --show-toplevel)"

# Resolve the toolchain from GOROOT when it is set. mise exports GOROOT for the
# version this repo pins, but leaves an unrelated `go` earlier on PATH (Homebrew's,
# here), and a go binary driving a different GOROOT fails with
# `compile: version "X" does not match go tool version "Y"`.
if [ -z "${GO:-}" ]; then
  if [ -n "${GOROOT:-}" ] && [ -x "$GOROOT/bin/go" ]; then GO="$GOROOT/bin/go"; else GO=go; fi
fi
if [ -z "${GOFMT:-}" ]; then
  if [ -n "${GOROOT:-}" ] && [ -x "$GOROOT/bin/gofmt" ]; then GOFMT="$GOROOT/bin/gofmt"; else GOFMT=gofmt; fi
fi

if ! command -v "$GO" >/dev/null 2>&1 && [ ! -x "$GO" ]; then
  echo "check: no usable go ('$GO')" >&2
  exit 1
fi

if [ "$mode" = "format" ]; then
  for dir in $GO_MODULES; do
    (cd "$dir" && "$GO" fmt ./...)
  done
  exit 0
fi

# The HTTP authorization matrix needs a real Postgres. It skips loudly without
# one, so bring the repo-local database up and hand it a scratch schema rather
# than letting the gate quietly stop covering authorization. Everything here is
# best-effort: no pg_ctl, no test database, and the matrix says so itself.
if [ -z "${TEST_DATABASE_URL:-}" ] && command -v pg_ctl >/dev/null 2>&1; then
  if sh ./scripts/postgres-up.sh >/dev/null 2>&1; then
    if ! psql -p 5433 -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw perception_test; then
      createdb -p 5433 perception_test >/dev/null 2>&1 || true
    fi
    if psql -p 5433 -d perception_test -c 'SELECT 1' >/dev/null 2>&1; then
      TEST_DATABASE_URL="postgres://localhost:5433/perception_test?sslmode=disable"
      export TEST_DATABASE_URL
      echo "==> test database: perception_test on port 5433"
    fi
  fi
fi

status=0

for dir in $GO_MODULES; do
  echo "==> $dir"
  (
    cd "$dir" || exit 1
    s=0

    unformatted="$("$GOFMT" -l . | grep -v '^vendor/' || true)"
    if [ -n "$unformatted" ]; then
      echo "gofmt: the following files are not formatted (run 'sh scripts/check.sh --format'):"
      echo "$unformatted"
      s=1
    fi

    "$GO" vet ./... || s=1
    "$GO" test ./... || s=1

    # Build for what actually ships, not only for the machine running the gate.
    # go.sum records the modules the host's platform needs; a dependency pulled
    # in by an amd64-only file is absent on an arm64 laptop, so the gate goes
    # green and the Docker build fails on `missing go.sum entry`. That happened
    # on 2026-08-07 and cost a deploy cycle. `go mod tidy` is the fix; this is
    # what notices when someone reaches for `go get` instead.
    GOOS=linux GOARCH=amd64 "$GO" build -o /dev/null ./... || {
      echo "the linux/amd64 build failed; run 'go mod tidy' if it is a missing go.sum entry"
      s=1
    }

    # Postgres is the only database in this suite, tests included. A test on
    # SQLite builds a different schema from the GORM struct tags and then
    # passes, proving nothing about the Postgres DDL that actually ships — and
    # it cannot run what does ship: SELECT ... FOR UPDATE, pgvector, LATERAL.
    drivers="$(grep -nE 'gorm\.io/driver/(sqlite|mysql|sqlserver|clickhouse)|mattn/go-sqlite3|modernc\.org/sqlite' go.mod || true)"
    if [ -n "$drivers" ]; then
      echo "non-Postgres database driver in go.mod; use github.com/FacileStudio/tronc/testdb (see Wiki/MIGRATIONS.md):"
      echo "$drivers"
      s=1
    fi
    exit "$s"
  ) || status=1
done

if [ "$mode" = "all" ]; then
  echo "==> $CLIENT_DIR"
  (
    cd "$CLIENT_DIR" || exit 1
    if ! command -v bun >/dev/null 2>&1; then
      echo "check: no 'bun' on PATH, skipping the client type-check" >&2
      exit 0
    fi
    [ -d node_modules ] || bun install --frozen-lockfile >/dev/null
    bun run check
  ) || status=1

fi

if [ "$status" -ne 0 ]; then
  echo "check failed"
fi
exit "$status"
