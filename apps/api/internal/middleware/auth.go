package middleware

import (
	"net/http"

	"github.com/FacileStudio/Perception/apps/api/internal/identity"
	"github.com/FacileStudio/porte"
	"github.com/FacileStudio/tronc/errors"
	"github.com/FacileStudio/tronc/httpjson"
	troncmiddleware "github.com/FacileStudio/tronc/middleware"
)

// RequireAuth verifies the credential and hands the resulting identity to the
// next handler through the request context.
//
// It runs porte's middleware first and then fills in what porte does not
// carry. porte answers "which user is this" and stops there; the address and
// the display name are read here and land in the context every handler already
// reads, so no consumer learns that authentication moved.
//
// It takes an identity.Authenticator, never a concrete service: the whole point
// of the identity package is that middleware cannot tell which implementation
// is mounted.
func RequireAuth(authenticator identity.Authenticator) func(http.Handler) http.Handler {
	hydrate := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
			authenticated, ok := porte.From(request.Context())
			if !ok {
				httpjson.WriteError(w, errors.Unauthorized("missing auth"))
				return
			}

			id, err := authenticator.IdentityForUser(request.Context(), authenticated.UserID)
			if err != nil {
				httpjson.WriteError(w, err)
				return
			}
			id.ClientIP = troncmiddleware.ClientIP(request)

			next.ServeHTTP(w, request.WithContext(identity.WithIdentity(request.Context(), id)))
		})
	}

	return func(next http.Handler) http.Handler {
		return authenticator.RequireAuth(hydrate(next))
	}
}
