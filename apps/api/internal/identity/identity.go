// Package identity owns the seam porte will slot into.
//
// Authentication is destined to leave this repository for the shared porte
// package. That move is only mechanical if nothing outside modules/auth ever
// names a concrete auth type, so every consumer — middleware, feature modules,
// handlers — depends on the Authenticator interface and the Identity value
// declared here, and on nothing else. Swapping the implementation then means
// changing one constructor call in main.go.
package identity

import "context"

// SessionCookieName is the wire contract, so it lives with the seam rather than
// with the implementation. Both the middleware that reads the cookie and the
// auth module that writes it need the name, and the middleware may not import
// modules/auth — that package is reachable from main.go alone. porte must keep
// this spelling or every open session is dropped on deploy.
const SessionCookieName = "perception_session"

// Identity is what an authenticated request carries. It is deliberately flat
// and free of database types: porte will have its own storage and must still
// be able to produce this value.
type Identity struct {
	UserID   string
	Email    string
	Name     string
	ClientIP string
}

// Authenticator resolves a credential into an Identity. modules/auth implements
// it today; porte will implement it tomorrow. Nothing outside this package may
// depend on which one is in use.
type Authenticator interface {
	Authenticate(ctx context.Context, authorization string) (Identity, error)
}

type contextKey struct{}

// WithIdentity returns a context carrying id.
func WithIdentity(ctx context.Context, id Identity) context.Context {
	return context.WithValue(ctx, contextKey{}, id)
}

// FromContext returns the Identity a request was authenticated with. The second
// result is false on an unauthenticated request, which callers must treat as a
// refusal rather than as an anonymous user.
func FromContext(ctx context.Context) (Identity, bool) {
	id, ok := ctx.Value(contextKey{}).(Identity)
	return id, ok
}
