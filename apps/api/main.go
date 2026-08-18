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
	"github.com/FacileStudio/Perception/apps/api/schemas"

	"github.com/FacileStudio/Journal/sdk/journal"
	"github.com/FacileStudio/porte/local"
	"github.com/FacileStudio/porte/oidc"
	portepg "github.com/FacileStudio/porte/pg"
	"github.com/FacileStudio/porte/session"
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
func buildRouter(kits authKits, authService *auth.Service, sqlDB *sql.DB, appLogger *slog.Logger, appEnv env.Config) chi.Router {
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
		auth.RegisterRoutes(r, authService)
	})

	return router
}

// authKits is porte, assembled. The password kit is nil under SSO_ONLY and the
// OIDC kit is nil without an issuer, which is how a route that must not exist
// ends up unmounted rather than answering 403 — there is no endpoint to probe.
type authKits struct {
	sessions  *session.Manager
	passwords *local.Kit
	oidc      *oidc.Kit
}

// buildAuth constructs porte: one session manager, shared by the OIDC kit and
// the local login, over porte's identity tables.
//
// One manager and not two: they would each keep their own idea of the clock and
// of whether the cookie is Secure, and porte refuses a kit whose config
// disagrees with its manager's for exactly that reason.
//
// Discovery runs here, so an unreachable or half-configured issuer fails at
// boot rather than on somebody's first login. That is a deliberate change from
// the module this replaces, which logged the error at route-registration time
// and left SSO 404ing until the next restart.
func buildAuth(ctx context.Context, sqlDB *sql.DB, appEnv env.Config, appLogger *slog.Logger) (authKits, error) {
	cfg := appEnv.Porte()
	store := portepg.New(sqlDB)

	sessions, err := session.New(cfg, session.Deps{Sessions: store.Sessions(), Logger: appLogger})
	if err != nil {
		return authKits{}, err
	}
	kits := authKits{sessions: sessions}

	if appEnv.OIDC != nil {
		kits.oidc, err = oidc.New(ctx, cfg, oidc.Deps{
			Users:      store.Users(),
			Identities: store.Identities(),
			Sessions:   sessions,
			Codes:      store.LoginCodes(),
			Logger:     appLogger,
		})
		if err != nil {
			return authKits{}, err
		}
	}

	if !appEnv.SSOOnly {
		kits.passwords, err = local.New(local.Config{AllowRegistration: true}, local.Deps{
			Users:      store.Users(),
			Identities: store.Identities(),
			Sessions:   sessions,
			Logger:     appLogger,
			Count:      countUsers(sqlDB),
		})
		if err != nil {
			return authKits{}, err
		}
	}

	return kits, nil
}

// countUsers backs porte/local's first-account exception: registration is open
// while the instance is empty and closed the moment an account exists, so a
// public deployment cannot be claimed by whoever finds it second.
//
// It counts porte's table directly because Perception has no user table of its
// own to count.
func countUsers(sqlDB *sql.DB) func(context.Context) (int64, error) {
	return func(ctx context.Context) (int64, error) {
		var count int64
		if err := sqlDB.QueryRowContext(ctx, `SELECT count(*) FROM porte_users`).Scan(&count); err != nil {
			return 0, err
		}
		return count, nil
	}
}

// startSessionSweep deletes expired session rows on a timer. porte expires a
// session by comparing timestamps on read, so a stale row is never honoured;
// this only stops the table growing without bound.
func startSessionSweep(ctx context.Context, sessions *session.Manager, appLogger *slog.Logger) {
	go func() {
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if _, err := sessions.Sweep(ctx); err != nil {
					appLogger.Warn("failed to sweep expired sessions", slog.Any("error", err))
				}
			}
		}
	}()
}

func run() int {
	appEnv, err := env.Load()
	appLogger := logger.New(logger.Config{})
	if err != nil {
		appLogger.Error("failed to load config", slog.Any("error", err))
		return 1
	}
	var journalClient *journal.Client
	appLogger = logger.New(logger.Config{
		Level: appEnv.LogLevel,
		Wrap: func(handler slog.Handler) slog.Handler {
			if appEnv.JournalURL == "" || appEnv.JournalToken == "" {
				return handler
			}
			journalClient = journal.New(journal.Config{URL: appEnv.JournalURL, Token: appEnv.JournalToken})
			return journal.NewHandler(journalClient, handler)
		},
	})
	if journalClient != nil {
		defer journalClient.Close()
	}

	db, err := database.Open(appEnv.DatabaseURL)
	if err != nil {
		appLogger.Error("failed to open database", slog.Any("error", err))
		return 1
	}

	if err := schemas.Migrate(db); err != nil {
		appLogger.Error("failed to run migrations", slog.Any("error", err))
		return 1
	}
	sqlDB, err := db.DB()
	if err != nil {
		appLogger.Error("failed to access database handle", slog.Any("error", err))
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
	authService := auth.NewService(db, kits.sessions)
	startSessionSweep(shutdownCtx, kits.sessions, appLogger)

	router := buildRouter(kits, authService, sqlDB, appLogger, appEnv)

	clientDir := spa.DirFromEnv()
	if spa.Available(clientDir) {
		router.Handle("/*", spa.Handler(spa.Config{Dir: clientDir}))
		appLogger.Info("serving client", slog.String("dir", clientDir))
	}

	addr := ":" + strconv.Itoa(appEnv.Port)
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
