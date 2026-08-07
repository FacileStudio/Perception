package auth

import (
	"context"
	"log/slog"
	"net/http/httptest"
	"testing"

	"github.com/FacileStudio/Perception/apps/api/internal/authcrypto"
	"github.com/FacileStudio/tronc/errors"
)

func TestSessionTokensAreUniqueAndHashStably(t *testing.T) {
	seen := make(map[string]bool)
	for i := 0; i < 100; i++ {
		token, err := authcrypto.NewToken()
		if err != nil {
			t.Fatalf("NewToken: %v", err)
		}

		hashed := hashToken(token)
		if hashed == token {
			t.Fatal("hashToken returned the raw token, sessions would be stored in the clear")
		}
		if hashed != hashToken(token) {
			t.Fatal("hashToken is not stable, a stored session could never be found again")
		}
		if seen[hashed] {
			t.Fatal("two session tokens hashed to the same value")
		}
		seen[hashed] = true
	}
}

// A service with a nil database proves the rejection happens before any query:
// if these inputs reached gorm the test would panic instead of failing.
func TestAuthenticateRejectsMissingCredentialsWithoutTheDatabase(t *testing.T) {
	service := NewService(nil, slog.Default())

	cases := []struct {
		name          string
		authorization string
	}{
		{name: "empty", authorization: ""},
		{name: "whitespace", authorization: "   "},
		{name: "bearer with no token", authorization: "Bearer "},
		{name: "lowercase bearer with no token", authorization: "bearer    "},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			caller, err := service.Authenticate(context.Background(), tc.authorization)
			if err == nil {
				t.Fatal("Authenticate accepted a credential-free Authorization header")
			}
			if status := errors.Status(err); status != 401 {
				t.Fatalf("status = %d, want 401", status)
			}
			if caller.UserID != "" {
				t.Fatalf("identity leaked on failure: %+v", caller)
			}
		})
	}
}

func TestNormalizeBearer(t *testing.T) {
	cases := []struct {
		name          string
		authorization string
		want          string
	}{
		{name: "bare token", authorization: "abc123", want: "abc123"},
		{name: "bearer prefix", authorization: "Bearer abc123", want: "abc123"},
		{name: "lowercase prefix", authorization: "bearer abc123", want: "abc123"},
		{name: "surrounding space", authorization: "  Bearer  abc123  ", want: "abc123"},
		{name: "scheme only", authorization: "Bearer", want: ""},
		{name: "token starting with bearer", authorization: "bearerish-token", want: "bearerish-token"},
		{name: "empty", authorization: "", want: ""},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := normalizeBearer(tc.authorization); got != tc.want {
				t.Fatalf("normalizeBearer(%q) = %q, want %q", tc.authorization, got, tc.want)
			}
		})
	}
}

func TestSessionCookieCarriesTheContractedAttributes(t *testing.T) {
	recorder := httptest.NewRecorder()
	SetSessionCookie(recorder, "a-session-token")

	cookies := recorder.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("cookies set = %d, want 1", len(cookies))
	}

	cookie := cookies[0]
	if cookie.Name != SessionCookieName {
		t.Fatalf("cookie name = %q, want %q", cookie.Name, SessionCookieName)
	}
	if cookie.Value != "a-session-token" {
		t.Fatalf("cookie value = %q, want the raw token", cookie.Value)
	}
	if !cookie.HttpOnly || !cookie.Secure || cookie.Path != "/" {
		t.Fatalf("cookie attributes = %+v, want HttpOnly, Secure, Path=/", cookie)
	}

	cleared := httptest.NewRecorder()
	ClearSessionCookie(cleared)
	if maxAge := cleared.Result().Cookies()[0].MaxAge; maxAge >= 0 {
		t.Fatalf("cleared cookie MaxAge = %d, want a negative value", maxAge)
	}
}

func TestDocumentationCoversEveryRegisteredRoute(t *testing.T) {
	documented := make(map[string]bool)
	for _, route := range Documentation.Routes {
		documented[route.Method+" "+route.Path] = true
	}

	want := []string{
		"GET " + PathConfig,
		"POST " + PathRegister,
		"POST " + PathLogin,
		"POST " + PathLogout,
		"GET " + PathMe,
		"GET " + PathOIDCLogin,
		"GET " + PathOIDCCallback,
	}
	for _, route := range want {
		if !documented[route] {
			t.Fatalf("route %s is not documented, it would be missing from /docs", route)
		}
	}
	if len(Documentation.Routes) != len(want) {
		t.Fatalf("documented routes = %d, want %d", len(Documentation.Routes), len(want))
	}
}
