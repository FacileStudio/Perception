// Package identity owns the seam porte slots into.
//
// Authentication lives in the shared porte package rather than in this
// repository. Nothing outside main.go names a porte type: every consumer —
// middleware, feature modules, handlers — depends on the Authenticator
// interface and the Identity value declared here, so swapping the
// implementation again stays a change to one constructor call.
package identity

import (
	"context"
	"net/http"
)

// Identity is what an authenticated request carries. It is deliberately flat
// and free of database types, so whatever authenticates a request can still
// produce it.
//
// UserID is a decimal string rather than porte's int64: it is an opaque handle
// everywhere downstream, and keeping it a string leaves the JSON shape the
// client already reads untouched.
type Identity struct {
	UserID    string
	Email     string
	Name      string
	AvatarURL string
	ClientIP  string
}

// Authenticator verifies a credential and resolves the profile behind it.
//
// The two halves are separate because porte splits them: its session manager
// verifies a cookie or a bearer token and yields a user id, and deliberately
// carries no email — a library that decided what an identity means to an app
// would be routed around by the second app that adopted it. So the credential
// check is middleware and the profile is a lookup, and this interface is both.
type Authenticator interface {
	RequireAuth(next http.Handler) http.Handler
	IdentityForUser(ctx context.Context, userID int64) (Identity, error)
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
