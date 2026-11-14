package migrations

import (
	"context"
	"errors"
	"io/fs"
	"log/slog"
	"slices"
	"strings"
	"testing"
	"testing/fstest"

	portepg "github.com/FacileStudio/porte/pg"
	"github.com/FacileStudio/tronc/migrate"
	"github.com/FacileStudio/tronc/testdb"
	"gorm.io/gorm"
)

const bootstrap = "mise run db-up   # or any PostgreSQL 16 with pgvector"

var quiet = slog.New(slog.DiscardHandler)

// openSchema gives a test a schema of its own, dropping what the previous run
// left there, and prepares it with prepare.
func openSchema(t *testing.T, prefix string, prepare func(*gorm.DB) error) *gorm.DB {
	t.Helper()
	url, ok := testdb.URL()
	if !ok {
		testdb.Announce(bootstrap)
		t.Skip(testdb.SkipReason(bootstrap))
	}
	admin, err := testdb.Open(url, testdb.Config{Prefix: prefix + "_admin", Migrate: func(*gorm.DB) error { return nil }})
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if err := admin.Exec(`DROP SCHEMA IF EXISTS "` + testdb.SchemaName(prefix) + `" CASCADE`).Error; err != nil {
		t.Fatalf("drop the previous run's schema: %v", err)
	}
	db, err := testdb.Open(url, testdb.Config{Prefix: prefix, Migrate: prepare})
	if err != nil {
		t.Fatalf("open %s: %v", prefix, err)
	}
	return db
}

// runUp applies the migrations the way the binary does at boot.
func runUp(db *gorm.DB) error {
	sqlDB, err := db.DB()
	if err != nil {
		return err
	}
	return Up(context.Background(), Config(sqlDB, quiet))
}

// legacySchema builds the shape AutoMigrate left behind: the baseline's
// tables, no ledger unless one is given, and one event row. The baseline runs
// through tronc/migrate rather than a raw Exec so it takes the advisory lock:
// it creates the vector extension, which every test binary shares, and two of
// them creating it at once collide on pg_extension_name_index.
func legacySchema(ledger string) func(*gorm.DB) error {
	return func(db *gorm.DB) error {
		sqlDB, err := db.DB()
		if err != nil {
			return err
		}
		baseline, err := fs.ReadFile(FS, "00001_baseline.sql")
		if err != nil {
			return err
		}
		only := fstest.MapFS{"00001_baseline.sql": {Data: baseline}}
		if err := migrate.Run(context.Background(), migrate.Config{DB: sqlDB, FS: only, Logger: quiet}); err != nil {
			return err
		}
		statements := []string{
			`DROP TABLE goose_db_version`,
			ledger,
			`INSERT INTO events (id, source, title, searchable_text, occurred_at)
			 VALUES ('evt_legacy', 'test', 'Deployed', 'deployed the api', '2026-01-02T03:04:05Z')`,
		}
		for _, statement := range statements {
			if statement == "" {
				continue
			}
			if err := db.Exec(statement).Error; err != nil {
				return err
			}
		}
		return nil
	}
}

func appliedVersions(t *testing.T, db *gorm.DB) []int64 {
	t.Helper()
	var versions []int64
	if err := db.Raw(`SELECT version_id FROM goose_db_version WHERE version_id > 0 ORDER BY id`).Scan(&versions).Error; err != nil {
		t.Fatalf("read the ledger: %v", err)
	}
	return versions
}

func assertVersions(t *testing.T, db *gorm.DB) {
	t.Helper()
	if got := appliedVersions(t, db); !slices.Equal(got, []int64{1, 2, 3}) {
		t.Fatalf("applied versions %v, want [1 2 3]", got)
	}
}

func columnDefault(t *testing.T, db *gorm.DB, table, column string) string {
	t.Helper()
	var value *string
	err := db.Raw(`SELECT column_default FROM information_schema.columns
		WHERE table_schema = current_schema() AND table_name = ? AND column_name = ?`, table, column).Scan(&value).Error
	if err != nil {
		t.Fatalf("read the default of %s.%s: %v", table, column, err)
	}
	if value == nil {
		return ""
	}
	return *value
}

func sections(t *testing.T, file string) (string, string) {
	t.Helper()
	raw, err := fs.ReadFile(FS, file)
	if err != nil {
		t.Fatalf("read %s: %v", file, err)
	}
	up, down, found := strings.Cut(strings.SplitN(string(raw), "-- +goose Up", 2)[1], "-- +goose Down")
	if !found {
		t.Fatalf("%s has no Down section", file)
	}
	return up, down
}

// TestUpBuildsAnEmptyDatabase checks an empty schema reaches the latest
// version through every migration in order, and that a second run is a no-op.
func TestUpBuildsAnEmptyDatabase(t *testing.T) {
	db := openSchema(t, "perception_migrations_fresh", runUp)
	assertVersions(t, db)
	if got := columnDefault(t, db, "event_embeddings", "created_at"); got != "now()" {
		t.Fatalf("event_embeddings.created_at default %q, want now()", got)
	}
	if err := runUp(db); err != nil {
		t.Fatalf("a second run is not a no-op: %v", err)
	}
	assertVersions(t, db)
}

// TestUpStampsADatabaseBuiltByAutoMigrate checks Up records the baseline of a
// database AutoMigrate built without running it, applies the later
// migrations, and keeps the row. Running the baseline would fail on its first
// CREATE TABLE.
func TestUpStampsADatabaseBuiltByAutoMigrate(t *testing.T) {
	assertStampsLegacy(t, "perception_migrations_legacy", "")
}

// TestUpStampsALegacyDatabaseAfterStatus covers an operator who ran
// `migrate status` before the first boot: goose then created the ledger with
// only its version 0 sentinel, and the baseline must still be stamped rather
// than run.
func TestUpStampsALegacyDatabaseAfterStatus(t *testing.T) {
	assertStampsLegacy(t, "perception_migrations_status",
		`CREATE TABLE goose_db_version (id integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
			version_id bigint NOT NULL, is_applied boolean NOT NULL, tstamp timestamp NOT NULL DEFAULT now());
		 INSERT INTO goose_db_version (version_id, is_applied) VALUES (0, true);`)
}

func assertStampsLegacy(t *testing.T, prefix, ledger string) {
	t.Helper()
	db := openSchema(t, prefix, legacySchema(ledger))
	if columnDefault(t, db, "events", "ingested_at") != "" {
		t.Fatal("the legacy schema already has the defaults migration")
	}
	if err := runUp(db); err != nil {
		t.Fatalf("up on a legacy database: %v", err)
	}
	assertVersions(t, db)
	if got := columnDefault(t, db, "events", "ingested_at"); got != "now()" {
		t.Fatalf("events.ingested_at default %q, want now()", got)
	}
	var title string
	if err := db.Raw(`SELECT title FROM events WHERE id = 'evt_legacy'`).Scan(&title).Error; err != nil {
		t.Fatalf("read the row: %v", err)
	}
	if title != "Deployed" {
		t.Fatalf("the existing row changed: %q", title)
	}
}

// TestColumnDefaultsReverse runs 00002's Down and then its Up again on a
// migrated schema. Nothing else executes a Down section, so a typo there
// would otherwise surface only on the day somebody needs it.
func TestColumnDefaultsReverse(t *testing.T) {
	up, down := sections(t, "00002_column_defaults.sql")
	db := openSchema(t, "perception_migrations_reverse", runUp)
	if err := db.Exec(down).Error; err != nil {
		t.Fatalf("down: %v", err)
	}
	if got := columnDefault(t, db, "event_embeddings", "created_at"); got != "" {
		t.Fatalf("event_embeddings.created_at default %q after down, want none", got)
	}
	if err := db.Exec(up).Error; err != nil {
		t.Fatalf("up again: %v", err)
	}
	if got := columnDefault(t, db, "event_embeddings", "created_at"); got != "now()" {
		t.Fatalf("event_embeddings.created_at default %q after up, want now()", got)
	}
}

var errRollBack = errors.New("roll back")

var porteTables = []string{"porte_users", "porte_identities", "porte_sessions", "porte_login_codes"}

func tableShape(t *testing.T, db *gorm.DB, table string) []string {
	t.Helper()
	var shape []string
	err := db.Raw(`SELECT column_name || ' ' || data_type || ' ' || is_nullable || ' ' || coalesce(column_default, '')
		FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = @table
		UNION ALL SELECT replace(indexdef, ' ON ' || schemaname || '.', ' ON ')
		FROM pg_indexes WHERE schemaname = current_schema() AND tablename = @table
		UNION ALL SELECT conname || ' ' || pg_get_constraintdef(oid) FROM pg_constraint
		WHERE connamespace = current_schema()::regnamespace AND conrelid = to_regclass(@table)
		ORDER BY 1`, map[string]any{"table": table}).Scan(&shape).Error
	if err != nil {
		t.Fatalf("read the shape of %s: %v", table, err)
	}
	return shape
}

// assertMatchesLibrary builds a library's own DDL in a scratch schema, inside
// a transaction that is rolled back, and compares each table's columns,
// types, defaults, indexes and constraints with the ones the migrations
// built. Running the DDL over the migrated schema instead proves nothing,
// since its CREATE TABLE IF NOT EXISTS skips a table that already exists.
func assertMatchesLibrary(t *testing.T, db *gorm.DB, ddl string, tables []string) {
	t.Helper()
	migrated := map[string][]string{}
	for _, table := range tables {
		migrated[table] = tableShape(t, db, table)
	}
	err := db.Transaction(func(tx *gorm.DB) error {
		for _, statement := range []string{`CREATE SCHEMA perception_library_drift`, `SET LOCAL search_path TO perception_library_drift`, ddl} {
			if err := tx.Exec(statement).Error; err != nil {
				t.Fatalf("build the library schema: %v", err)
			}
		}
		for _, table := range tables {
			want := tableShape(t, tx, table)
			if len(want) == 0 {
				t.Errorf("the library no longer creates %s", table)
			} else if !slices.Equal(migrated[table], want) {
				t.Errorf("%s drifted from the library:\nmigrations %v\nlibrary    %v", table, migrated[table], want)
			}
		}
		return errRollBack
	})
	if !errors.Is(err, errRollBack) {
		t.Fatalf("transaction: %v", err)
	}
}

// TestPorteSchemaIsInTheMigrations checks the migrations build porte's
// identity tables exactly as porte/pg's Schema does, which Perception used to
// run with porte/pg.EnsureSchema at every boot. A porte bump that changes its
// Schema makes this fail, and the change then needs a numbered migration of
// its own.
func TestPorteSchemaIsInTheMigrations(t *testing.T) {
	db := openSchema(t, "perception_migrations_porte", runUp)
	assertMatchesLibrary(t, db, portepg.Schema, porteTables)
}
