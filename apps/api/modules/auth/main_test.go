package auth

import (
	"context"
	"log/slog"
	"os"
	"testing"

	"github.com/FacileStudio/Perception/apps/api/migrations"
	"github.com/FacileStudio/tronc/testdb"

	"gorm.io/gorm"
)

var config = testdb.Config{
	Prefix:  "perception_auth_test",
	Migrate: migrate,
}

var database *gorm.DB

func migrate(db *gorm.DB) error {
	handle, err := db.DB()
	if err != nil {
		return err
	}
	return migrations.Up(context.Background(), migrations.Config(handle, slog.New(slog.DiscardHandler)))
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
