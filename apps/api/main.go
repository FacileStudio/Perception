package main

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/FacileStudio/Perception/apps/api/internal/database"
	documentation "github.com/FacileStudio/Perception/apps/api/internal/documentation"
	"github.com/FacileStudio/Perception/apps/api/internal/env"
	"github.com/FacileStudio/Perception/apps/api/modules/auth"
	"github.com/FacileStudio/Perception/apps/api/modules/events"
	"github.com/FacileStudio/Perception/apps/api/modules/ingest"
	"github.com/FacileStudio/Perception/apps/api/schemas"

	"github.com/FacileStudio/Journal/sdk/journal"
	"github.com/FacileStudio/tronc/apiref"
	"github.com/FacileStudio/tronc/health"
	"github.com/FacileStudio/tronc/healthcheck"
	"github.com/FacileStudio/tronc/httpx"
	"github.com/FacileStudio/tronc/logger"
	troncmiddleware "github.com/FacileStudio/tronc/middleware"
	"github.com/FacileStudio/tronc/spa"
	"github.com/go-chi/chi/v5"
)

// registry is the hand-written route inventory the reference at /docs is
// generated from. Each module owns its own entry; a route absent from it fails
// TestEveryRouteIsDocumented.
func registry() documentation.Response {
	return documentation.Response{
		Modules: []documentation.Module{
			auth.Documentation,
			ingest.Documentation,
			events.Documentation,
		},
	}
}

func refConfig() apiref.Config {
	return apiref.Config{
		Title:       "Perception API",
		Description: "Context brain for Facile operations: ingests suite events and answers grounded operational questions.",
		Servers:     []string{"/api"},
		Registry:    registry(),
	}
}

func main() {
	if healthcheck.Handle(os.Args) {
		return
	}

	os.Exit(run())
}

// buildRouter assembles the API exactly as run() serves it, so a test exercises
// the middleware chain that ships rather than the service layer underneath it.
//
// It tolerates a nil database handle: no service touches it until a request
// arrives, which is what lets the route-coverage test run without Postgres.
// Behind Traefik and Cloudflare, RemoteAddr is only the visitor if both are
// trusted — Traefik replaces the forwarded chain rather than extending it, so
// the visitor survives in Cf-Connecting-Ip alone and
// TRUSTED_PROXIES=private,cloudflare fills all three.
func buildRouter(kits authKits, services modules, sqlDB *sql.DB, appLogger *slog.Logger, appEnv env.Config) chi.Router {
	router := httpx.NewRouter(httpx.Config{
		TrustedProxies: appEnv.TrustedProxies,
		CDNProxies:     appEnv.CDNProxies,
		CDNHeader:      appEnv.CDNHeader,
		Logger:         appLogger,
		CORS: troncmiddleware.CORSConfig{
			AllowedOrigins:   appEnv.CORSAllowedOrigins,
			AllowCredentials: true,
		},
	})

	health.Mount(router, health.DB(sqlDB))
	apiref.Mount(router, refConfig())

	router.Route("/api", func(r chi.Router) {
		kits.sessions.Mount(r)
		if kits.oidc != nil {
			kits.oidc.Mount(r)
		}
		if kits.passwords != nil {
			kits.passwords.Mount(r)
		}
		auth.RegisterRoutes(r, services.auth)
		ingest.RegisterRoutes(r, services.ingest, services.intake, services.auth)
		events.RegisterRoutes(r, services.events, services.auth)
	})

	return router
}

func run() int {
	appEnv, err := env.Load()
	appLogger := logger.New(logger.Config{})
	if err != nil {
		appLogger.Error("failed to load config", slog.Any("error", err))
		return 1
	}
	appLogger, closeJournal := buildLogger(appEnv)
	defer closeJournal()

	db, err := database.Open(appEnv.DatabaseURL)
	if err != nil {
		appLogger.Error("failed to open database", slog.Any("error", err))
		return 1
	}

	sqlDB, err := db.DB()
	if err != nil {
		appLogger.Error("failed to access database handle", slog.Any("error", err))
		return 1
	}

	if err := schemas.Migrate(db, sqlDB); err != nil {
		appLogger.Error("failed to run migrations", slog.Any("error", err))
		return 1
	}
	defer func() {
		if err := sqlDB.Close(); err != nil {
			appLogger.Error("failed to close database", slog.Any("error", err))
		}
	}()

	shutdownCtx, cancelCleanup := context.WithCancel(context.Background())
	defer cancelCleanup()

	kits, err := buildAuth(shutdownCtx, sqlDB, appEnv, appLogger)
	if err != nil {
		appLogger.Error("failed to build authentication", slog.Any("error", err))
		return 1
	}
	services := buildModules(db, kits.sessions, appEnv)
	startSessionSweep(shutdownCtx, kits.sessions, appLogger)

	if len(appEnv.IngestSecrets) == 0 {
		appLogger.Warn("no ingest secret configured; every delivery will be refused",
			slog.String("fix", "set INGEST_HMAC_SECRET, and the same value on Antenne's Perception delivery target"))
	}

	router := buildRouter(kits, services, sqlDB, appLogger, appEnv)

	clientDir := spa.DirFromEnv()
	if spa.Available(clientDir) {
		router.Handle("/*", spa.Handler(spa.Config{Dir: clientDir}))
		appLogger.Info("serving client", slog.String("dir", clientDir))
	}

	return serve(router, ":"+strconv.Itoa(appEnv.Port), appLogger)
}

// buildLogger assembles the application logger, shipping to Journal when both
// its URL and token are set. The returned function closes the shipper.
func buildLogger(appEnv env.Config) (*slog.Logger, func()) {
	var client *journal.Client

	appLogger := logger.New(logger.Config{
		Level: appEnv.LogLevel,
		Wrap: func(handler slog.Handler) slog.Handler {
			if appEnv.JournalURL == "" || appEnv.JournalToken == "" {
				return handler
			}
			client = journal.New(journal.Config{URL: appEnv.JournalURL, Token: appEnv.JournalToken})
			return journal.NewHandler(client, handler)
		},
	})

	return appLogger, func() {
		if client != nil {
			client.Close()
		}
	}
}

// serve runs the HTTP server until it fails or the process is asked to stop,
// and returns the exit status.
func serve(router chi.Router, addr string, appLogger *slog.Logger) int {
	server := &http.Server{
		Addr:              addr,
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	serverErrCh := make(chan error, 1)
	go func() {
		serverErrCh <- server.ListenAndServe()
	}()

	shutdownSignal, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	appLogger.Info("server starting", slog.String("addr", addr))
	select {
	case err := <-serverErrCh:
		if !errors.Is(err, http.ErrServerClosed) {
			appLogger.Error("server stopped", slog.Any("error", err))
			return 1
		}
	case <-shutdownSignal.Done():
		appLogger.Info("server shutting down")
		shutdownContext, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		if err := server.Shutdown(shutdownContext); err != nil {
			appLogger.Error("server shutdown failed", slog.Any("error", err))
			return 1
		}
		appLogger.Info("server stopped")
	}

	return 0
}
