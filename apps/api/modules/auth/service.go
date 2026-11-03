// Package auth is what is left of authentication once porte owns it: the
// profile lookup porte declines to make, and the /auth/me route built on it.
//
// porte mounts the rest — /auth/config, register, login, logout and the whole
// OIDC flow — from main.go. This package exists because porte authenticates a
// session and yields a user id and nothing else, on the reasoning that a
// library which decided what an identity means to an app would be routed
// around by the second app that adopted it.
package auth

import (
	"context"
	"net/http"
	"strconv"

	"github.com/FacileStudio/Perception/apps/api/internal/identity"
	"github.com/FacileStudio/porte/session"
	"github.com/FacileStudio/tronc/errors"

	"gorm.io/gorm"
)

// Service resolves a user id into the identity the rest of Perception reads,
// and delegates credential verification to porte's session manager.
type Service struct {
	orm      *gorm.DB
	sessions *session.Manager
}

// NewService wires the profile lookup to porte's identity tables.
func NewService(orm *gorm.DB, sessions *session.Manager) *Service {
	return &Service{orm: orm, sessions: sessions}
}

var _ identity.Authenticator = (*Service)(nil)

// RequireAuth is porte's session middleware, forwarded so that nothing outside
// main.go has to name the manager.
func (service *Service) RequireAuth(next http.Handler) http.Handler {
	return service.sessions.RequireAuth(next)
}

// IdentityForUser reads the profile behind an authenticated user id.
//
// It queries porte_users directly rather than through a GORM model. Perception
// has no domain rows hanging off a user — no documents, no memberships, nothing
// but authentication itself — so it uses porte's table as its own instead of
// keeping a parallel one to join against.
func (service *Service) IdentityForUser(ctx context.Context, userID int64) (identity.Identity, error) {
	var row struct {
		ID        int64
		Email     string
		Name      string
		AvatarURL string
	}
	err := service.orm.WithContext(ctx).
		Table("porte_users").
		Select("id", "email", "name", "avatar_url").
		Where("id = ?", userID).
		Scan(&row).Error
	if err != nil {
		return identity.Identity{}, errors.Internal("failed to load the account", err)
	}
	if row.ID == 0 {
		return identity.Identity{}, errors.Unauthorized("invalid session")
	}

	return identity.Identity{
		UserID:    strconv.FormatInt(row.ID, 10),
		Email:     row.Email,
		Name:      row.Name,
		AvatarURL: row.AvatarURL,
	}, nil
}
