package auth

import "github.com/FacileStudio/Perception/apps/api/internal/identity"

// SessionCookieName is an alias, not a second declaration. The middleware that
// reads the cookie may not import this package, so the name is owned by the
// seam and both sides spell it once.
const SessionCookieName = identity.SessionCookieName

// The route paths are exported for the same reason as the cookie name: they
// are the contract a replacement implementation has to honour, so they are
// declared once here rather than spelled out in the router and the docs.
const (
	PathConfig       = "/auth/config"
	PathRegister     = "/auth/register"
	PathLogin        = "/auth/login"
	PathLogout       = "/auth/logout"
	PathMe           = "/auth/me"
	PathOIDCLogin    = "/auth/oidc"
	PathOIDCCallback = "/auth/oidc/callback"
)

type AuthConfigResponse struct {
	SSOOnly     bool `json:"sso_only"`
	OIDCEnabled bool `json:"oidc_enabled"`
}

type RegisterRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type AuthResponse struct {
	UserID string `json:"user_id"`
	Token  string `json:"token"`
}

type MeResponse struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
}
