package main

import (
	"context"
	"database/sql"
	"log/slog"
	"os"

	"github.com/FacileStudio/Perception/apps/api/migrations"
	"github.com/FacileStudio/tronc/migrate"
)

// migrateDatabase answers the `migrate` subcommand when the process was started
// as one, and otherwise applies the pending migrations. stop reports that run
// must return code instead of serving, so a failed migration exits 1.
func migrateDatabase(sqlDB *sql.DB, appLogger *slog.Logger) (code int, stop bool) {
	cfg := migrations.Config(sqlDB, appLogger)
	if handled, err := migrate.Command(context.Background(), os.Args, cfg); handled {
		if err != nil {
			appLogger.Error("migrate", slog.Any("error", err))
			return 1, true
		}
		return 0, true
	}
	if err := migrations.Up(context.Background(), cfg); err != nil {
		appLogger.Error("failed to run migrations", slog.Any("error", err))
		return 1, true
	}
	return 0, false
}
