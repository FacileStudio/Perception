package auth

import (
	"net/http"

	"github.com/FacileStudio/Perception/apps/api/internal/identity"
	"github.com/FacileStudio/Perception/apps/api/internal/middleware"
	"github.com/FacileStudio/tronc/errors"
	"github.com/FacileStudio/tronc/httpjson"

	"github.com/go-chi/chi/v5"
)

// PathMe is the only route this module still owns. porte mounts the other
// eight from main.go.
const PathMe = "/auth/me"

// RegisterRoutes mounts /auth/me. Rate limiting the credential routes moved to
// porte along with the credentials themselves.
func RegisterRoutes(router chi.Router, service *Service) {
	router.With(middleware.RequireAuth(service)).Get(PathMe, func(w http.ResponseWriter, request *http.Request) {
		id, ok := identity.FromContext(request.Context())
		if !ok {
			httpjson.WriteError(w, errors.Unauthorized("missing auth"))
			return
		}
		httpjson.WriteJSON(w, http.StatusOK, MeResponse{ID: id.UserID, Email: id.Email, Name: id.Name})
	})
}
