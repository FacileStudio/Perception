package middleware

import (
	"net/http"

	"github.com/FacileStudio/Perception/apps/api/internal/identity"
	"github.com/FacileStudio/tronc/httpjson"
	troncmiddleware "github.com/FacileStudio/tronc/middleware"
)

// RequireAuth authenticates a request and hands the result to the next handler
// through the request context.
//
// It takes an identity.Authenticator, never a concrete service: the whole point
// of the identity package is that middleware cannot tell which implementation
// is mounted.
func RequireAuth(authenticator identity.Authenticator) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
			authorization := request.Header.Get("Authorization")
			if authorization == "" {
				if cookie, err := request.Cookie(identity.SessionCookieName); err == nil && cookie.Value != "" {
					authorization = "Bearer " + cookie.Value
				}
			}

			id, err := authenticator.Authenticate(request.Context(), authorization)
			if err != nil {
				httpjson.WriteError(w, err)
				return
			}
			id.ClientIP = troncmiddleware.ClientIP(request)

			next.ServeHTTP(w, request.WithContext(identity.WithIdentity(request.Context(), id)))
		})
	}
}
