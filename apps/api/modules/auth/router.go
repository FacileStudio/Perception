package auth

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/FacileStudio/Perception/apps/api/internal/env"
	"github.com/FacileStudio/Perception/apps/api/internal/middleware"
	"github.com/FacileStudio/tronc/httpjson"

	"github.com/go-chi/chi/v5"
)

// RegisterRoutes mounts the auth endpoints. Under SSO_ONLY the password routes
// are not registered at all rather than answering 403, so a probe cannot tell
// that local accounts ever existed.
func RegisterRoutes(router chi.Router, service *Service, appEnv env.Config) {
	oidcEnabled := appEnv.OIDC != nil
	authLimiter := middleware.NewRateLimiter(5, 1*time.Minute)

	router.Get(PathConfig, func(w http.ResponseWriter, request *http.Request) {
		httpjson.WriteJSON(w, http.StatusOK, AuthConfigResponse{
			SSOOnly:     appEnv.SSOOnly,
			OIDCEnabled: oidcEnabled,
		})
	})

	if !appEnv.SSOOnly {
		router.With(middleware.RateLimit(authLimiter)).Post(PathRegister, func(w http.ResponseWriter, request *http.Request) {
			var req RegisterRequest
			if err := httpjson.DecodeJSON(w, request, &req); err != nil {
				httpjson.WriteError(w, err)
				return
			}
			response, err := service.controller.register(request.Context(), &req)
			if err != nil {
				httpjson.WriteError(w, err)
				return
			}
			SetSessionCookie(w, response.Token)
			httpjson.WriteJSON(w, http.StatusCreated, response)
		})

		router.With(middleware.RateLimit(authLimiter)).Post(PathLogin, func(w http.ResponseWriter, request *http.Request) {
			var req LoginRequest
			if err := httpjson.DecodeJSON(w, request, &req); err != nil {
				httpjson.WriteError(w, err)
				return
			}
			response, err := service.controller.login(request.Context(), &req)
			if err != nil {
				httpjson.WriteError(w, err)
				return
			}
			SetSessionCookie(w, response.Token)
			httpjson.WriteJSON(w, http.StatusOK, response)
		})
	}

	router.With(middleware.RequireAuth(service)).Post(PathLogout, func(w http.ResponseWriter, request *http.Request) {
		if err := service.logoutUser(request.Context(), requestAuthorization(request)); err != nil {
			httpjson.WriteError(w, err)
			return
		}
		ClearSessionCookie(w)
		w.WriteHeader(http.StatusNoContent)
	})

	router.With(middleware.RequireAuth(service)).Get(PathMe, func(w http.ResponseWriter, request *http.Request) {
		response, err := service.controller.me(request.Context())
		if err != nil {
			httpjson.WriteError(w, err)
			return
		}
		httpjson.WriteJSON(w, http.StatusOK, response)
	})

	if oidcEnabled {
		oidc, err := newOIDCHandler(context.Background(), appEnv.OIDC, service)
		if err != nil {
			slog.Error("failed to initialize OIDC provider", slog.Any("error", err))
			return
		}
		router.Get(PathOIDCLogin, oidc.login)
		router.Get(PathOIDCCallback, oidc.callback)
	}
}

func requestAuthorization(request *http.Request) string {
	if authorization := request.Header.Get("Authorization"); authorization != "" {
		return authorization
	}
	if cookie, err := request.Cookie(SessionCookieName); err == nil && cookie.Value != "" {
		return "Bearer " + cookie.Value
	}
	return ""
}
