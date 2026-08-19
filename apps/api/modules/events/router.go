package events

import (
	"net/http"
	"strconv"
	"time"

	"github.com/FacileStudio/Perception/apps/api/internal/identity"
	"github.com/FacileStudio/Perception/apps/api/internal/middleware"
	"github.com/FacileStudio/tronc/httpjson"

	"github.com/go-chi/chi/v5"
)

// Route paths.
const (
	PathEvents = "/events"
	PathEvent  = "/events/{id}"
)

// RegisterRoutes mounts the event listing behind authentication.
func RegisterRoutes(router chi.Router, service *Service, authenticator identity.Authenticator) {
	guarded := router.With(middleware.RequireAuth(authenticator))

	guarded.Get(PathEvents, func(w http.ResponseWriter, request *http.Request) {
		page, err := service.List(request.Context(), filterFrom(request))
		if err != nil {
			httpjson.WriteError(w, err)
			return
		}
		httpjson.WriteJSON(w, http.StatusOK, page)
	})

	guarded.Get(PathEvent, func(w http.ResponseWriter, request *http.Request) {
		event, err := service.Get(request.Context(), chi.URLParam(request, "id"))
		if err != nil {
			httpjson.WriteError(w, err)
			return
		}
		httpjson.WriteJSON(w, http.StatusOK, event)
	})
}

// filterFrom reads the query string.
//
// An unparseable time or limit is ignored rather than refused: these are a
// human's URL, and answering a slightly wrong question beats a 400 that makes
// them go and read the documentation for a date format.
func filterFrom(request *http.Request) Filter {
	query := request.URL.Query()

	filter := Filter{
		Provider: query.Get("provider"),
		Type:     query.Get("type"),
		Entity:   query.Get("entity"),
		Actor:    query.Get("actor"),
		Quality:  query.Get("quality"),
		Cursor:   query.Get("cursor"),
	}
	if limit, err := strconv.Atoi(query.Get("limit")); err == nil {
		filter.Limit = limit
	}
	if since, ok := parseQueryTime(query.Get("since")); ok {
		filter.Since = since
	}
	if until, ok := parseQueryTime(query.Get("until")); ok {
		filter.Until = until
	}
	return filter
}

// parseQueryTime accepts a full timestamp or a bare date.
func parseQueryTime(value string) (time.Time, bool) {
	if value == "" {
		return time.Time{}, false
	}
	for _, layout := range []string{time.RFC3339, "2006-01-02"} {
		if parsed, err := time.Parse(layout, value); err == nil {
			return parsed.UTC(), true
		}
	}
	return time.Time{}, false
}
