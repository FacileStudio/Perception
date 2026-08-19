package ingest

import (
	"os"
	"testing"

	"github.com/FacileStudio/Perception/apps/api/schemas"
	"github.com/FacileStudio/tronc/testdb"

	"gorm.io/gorm"
)

// config gives this test binary its own Postgres schema.
//
// Per-binary isolation rather than a shared database, because `go test ./...`
// runs packages concurrently: two of them migrating the same schema at once
// deadlocks in porte's DDL, and two of them truncating the same tables leaks
// one package's fixtures into the other's assertions. Both happened here
// before this existed.
var config = testdb.Config{
	Prefix:  "perception_ingest_test",
	Migrate: migrate,
}

// database is the shared handle, or nil when there is no test database.
var database *gorm.DB

func migrate(db *gorm.DB) error {
	handle, err := db.DB()
	if err != nil {
		return err
	}
	return schemas.Migrate(db, handle)
}

func TestMain(m *testing.M) {
	url, ok := testdb.URL()
	if !ok {
		testdb.Announce("mise run db-up")
		os.Exit(m.Run())
	}

	opened, err := testdb.Open(url, config)
	if err != nil {
		panic(err)
	}
	database = opened
	os.Exit(m.Run())
}

// testDB hands a test a clean schema, skipping loudly when there is none.
//
// Skipping loudly rather than silently is the point: a suite that quietly
// covers nothing looks the same as one that passes, and the DDL these tests
// exercise — a generated tsvector column — is exactly what an in-memory
// stand-in would not have run.
func testDB(t *testing.T) *gorm.DB {
	t.Helper()
	if database == nil {
		t.Skip(testdb.SkipReason("mise run db-up"))
	}
	if err := testdb.Truncate(database, config); err != nil {
		t.Fatalf("truncating: %v", err)
	}
	return database
}
