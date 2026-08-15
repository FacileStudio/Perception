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

// AuthConfigResponse tells the client whether the deployment uses SSO and
// whether OIDC is mounted, so its login page adapts.
type AuthConfigResponse struct {
	SSOOnly     bool `json:"sso_only"`
	OIDCEnabled bool `json:"oidc_enabled"`
}

// RegisterRequest is the body of a local password registration.
type RegisterRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
}

// LoginRequest is the body of a local password login.
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// AuthResponse carries the session token issued to a successful caller.
type AuthResponse struct {
	UserID string `json:"user_id"`
	Token  string `json:"token"`
}

// MeResponse describes the signed-in user to the /auth/me endpoint.
type MeResponse struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
}
