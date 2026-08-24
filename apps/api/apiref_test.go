package main

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/FacileStudio/Perception/apps/api/internal/env"
	"github.com/FacileStudio/tronc/apiref"
	"github.com/go-chi/chi/v5"
)

// testRouter is the shipped router mounted against a nil database handle. No
// service reads the handle until a request arrives, and these tests only walk
// the route table and read /docs.
//
// It builds porte for real rather than passing an empty authKits: porte owns
// /auth/config, the credential routes and logout now, so a router without it
// would let the coverage guard pass over the routes most likely to move. The
// OIDC kit stays out because constructing it performs discovery against a live
// issuer, and its routes are registered from the same registry entry either
// way.
var testRouter = newTestRouter()

func newTestRouter() chi.Router {
	discardLogger := slog.New(slog.NewTextHandler(io.Discard, nil))
	kits, err := buildAuth(context.Background(), nil, env.Config{}, discardLogger)
	if err != nil {
		panic("building authentication for the test router: " + err.Error())
	}
	return buildRouter(kits, buildModules(nil, kits.sessions, env.Config{}, discardLogger), nil, discardLogger, env.Config{})
}

// A hand-written registry rots the moment a route is added without it, which is
// how an API ends up with documentation that lies. This turns that drift into a
// failing build. If it fails, fix the registry in the module's
// documentation.go - never the test.
func TestEveryRouteIsDocumented(t *testing.T) {
	if missing := apiref.Undocumented(testRouter, refConfig()); len(missing) > 0 {
		t.Errorf("routes missing from the API registry:\n  %s", strings.Join(missing, "\n  "))
	}
}

func TestReferenceIsServed(t *testing.T) {
	page := httptest.NewRecorder()
	testRouter.ServeHTTP(page, httptest.NewRequest(http.MethodGet, "/docs", nil))
	if page.Code != http.StatusOK {
		t.Fatalf("GET /docs = %d, want 200", page.Code)
	}
	if !strings.Contains(page.Body.String(), `data-url="/docs/openapi.json"`) {
		t.Errorf("the reference page does not point at the spec: %s", page.Body.String())
	}

	spec := httptest.NewRecorder()
	testRouter.ServeHTTP(spec, httptest.NewRequest(http.MethodGet, "/docs/openapi.json", nil))
	if spec.Code != http.StatusOK {
		t.Fatalf("GET /docs/openapi.json = %d, want 200", spec.Code)
	}
	var document struct {
		OpenAPI string `json:"openapi"`
		Info    struct {
			Title string `json:"title"`
		} `json:"info"`
		Paths map[string]any `json:"paths"`
	}
	if err := json.Unmarshal(spec.Body.Bytes(), &document); err != nil {
		t.Fatalf("the spec is not JSON: %v", err)
	}
	if !strings.HasPrefix(document.OpenAPI, "3.1") {
		t.Errorf("openapi = %q, want 3.1.x", document.OpenAPI)
	}
	if document.Info.Title != refConfig().Title {
		t.Errorf("info.title = %q, want %q", document.Info.Title, refConfig().Title)
	}
	if len(document.Paths) == 0 {
		t.Error("the spec documents no paths")
	}
}
