package embeddings

import (
	"net/http"

	"github.com/FacileStudio/Perception/apps/api/internal/identity"
	"github.com/FacileStudio/Perception/apps/api/internal/middleware"
	"github.com/FacileStudio/tronc/httpjson"

	"github.com/go-chi/chi/v5"
)

// RegisterRoutes mounts the embeddings status endpoint behind authentication.
func RegisterRoutes(router chi.Router, service *Service, authenticator identity.Authenticator) {
	guarded := router.With(middleware.RequireAuth(authenticator))

	guarded.Get(PathStatus, func(w http.ResponseWriter, request *http.Request) {
		httpjson.WriteJSON(w, http.StatusOK, service.Status())
	})
}
