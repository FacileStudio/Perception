// Porte is constructed here and nowhere else.
//
// It lives beside main.go rather than inside it because this is the seam the
// repository is built around: seam_test.go asserts that only package main and
// modules/auth may name a porte kit, and keeping the wiring in one named file
// makes the next swap a file to read rather than a function to find.
package main

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"time"

	"github.com/FacileStudio/Perception/apps/api/internal/env"
	"github.com/FacileStudio/Perception/apps/api/modules/auth"

	"github.com/FacileStudio/porte"
	"github.com/FacileStudio/porte/local"
	"github.com/FacileStudio/porte/oidc"
	portepg "github.com/FacileStudio/porte/pg"
	"github.com/FacileStudio/porte/session"
)

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
//
// The OIDC store is wrapped so the picture claim is stored on every upsert,
// and accounts from before that are backfilled once the kit exists.
func buildAuth(ctx context.Context, sqlDB *sql.DB, appEnv env.Config, appLogger *slog.Logger) (authKits, error) {
	cfg := appEnv.Porte()
	store := portepg.New(sqlDB)

	sessions, err := session.New(cfg, session.Deps{Sessions: store.Sessions(), Logger: appLogger})
	if err != nil {
		return authKits{}, err
	}
	kits := authKits{sessions: sessions}

	if appEnv.OIDC != nil {
		kits.oidc, err = discoverOIDC(ctx, cfg, oidc.Deps{
			Users:      auth.PictureUsers{UserStore: store.Users()},
			Identities: store.Identities(),
			Sessions:   sessions,
			Codes:      store.LoginCodes(),
			Logger:     appLogger,
		}, appLogger)
		if err != nil {
			return authKits{}, err
		}
		if err := auth.BackfillPictures(ctx, sqlDB, appEnv.OIDC.Issuer); err != nil {
			return authKits{}, err
		}
	}

	if !appEnv.SSOOnly {
		kits.passwords, err = local.New(local.Config{AllowRegistration: false}, local.Deps{
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

// discoverOIDC builds the OIDC kit, retrying while the identity provider is
// unreachable.
//
// Constructing the kit performs discovery against the issuer, so a failure here
// refuses the boot. That is deliberate — the alternative, which this app did
// before porte, was to log the error and leave SSO answering 404 until somebody
// restarted it, and under SSO_ONLY that is an instance nobody can sign in to
// pretending to be healthy.
//
// But refusing immediately couples Perception's boot to Authentik's uptime: a
// restart during a blip becomes a container that exits, gets restarted, and
// exits again. The retry turns a transient outage into a slower boot instead of
// a restart loop, and a real outage still fails — loudly, after a bounded wait,
// with every attempt logged so the cause is not mistaken for a Perception bug.
func discoverOIDC(ctx context.Context, cfg porte.Config, deps oidc.Deps, appLogger *slog.Logger) (*oidc.Kit, error) {
	const attempts = 5

	var err error
	for attempt := 1; attempt <= attempts; attempt++ {
		var kit *oidc.Kit
		kit, err = oidc.New(ctx, cfg, deps)
		if err == nil {
			return kit, nil
		}
		if attempt == attempts {
			break
		}

		wait := time.Duration(1<<(attempt-1)) * time.Second
		appLogger.Warn("OIDC discovery failed, retrying",
			slog.Int("attempt", attempt),
			slog.Int("of", attempts),
			slog.Duration("in", wait),
			slog.Any("error", err))

		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(wait):
		}
	}

	return nil, fmt.Errorf("OIDC discovery failed after %d attempts: %w", attempts, err)
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
