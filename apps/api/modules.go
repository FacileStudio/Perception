package main

import (
	"github.com/FacileStudio/Perception/apps/api/internal/env"
	"github.com/FacileStudio/Perception/apps/api/modules/auth"
	"github.com/FacileStudio/Perception/apps/api/modules/events"
	"github.com/FacileStudio/Perception/apps/api/modules/ingest"

	"github.com/FacileStudio/porte/session"
	"gorm.io/gorm"
)

// modules is every feature service the router mounts.
//
// It is one parameter rather than five so that adding a module is a change to
// this struct and its constructor, not to the signature of every function
// between main and the router.
type modules struct {
	auth   *auth.Service
	ingest *ingest.Service
	intake *ingest.Controller
	events *events.Service
}

// buildModules constructs the feature services.
func buildModules(db *gorm.DB, sessions *session.Manager, appEnv env.Config) modules {
	ingestService := ingest.NewService(db)
	return modules{
		auth:   auth.NewService(db, sessions),
		ingest: ingestService,
		intake: ingest.NewController(ingestService, ingest.Config{
			Secrets: appEnv.IngestSecrets,
			MaxSkew: appEnv.IngestMaxSkew,
		}, nil),
		events: events.NewService(db),
	}
}
