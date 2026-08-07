package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"net/http"
	"time"

	"github.com/FacileStudio/Perception/apps/api/internal/env"
	"github.com/FacileStudio/tronc/errors"
	"github.com/FacileStudio/tronc/httpjson"

	gooidc "github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

const (
	oidcStateCookie = "oidc_state"
	oidcStateTTL    = 10 * time.Minute
)

type oidcHandler struct {
	verifier   *gooidc.IDTokenVerifier
	oauth2Cfg  oauth2.Config
	service    *Service
	successURL string
}

func newOIDCHandler(ctx context.Context, cfg *env.OIDCConfig, service *Service) (*oidcHandler, error) {
	provider, err := gooidc.NewProvider(ctx, cfg.Issuer)
	if err != nil {
		return nil, err
	}

	// No offline_access: Perception stores neither access nor refresh tokens,
	// so asking for one it would have to discard only widens the blast radius.
	oauth2Cfg := oauth2.Config{
		ClientID:     cfg.ClientID,
		ClientSecret: cfg.ClientSecret,
		RedirectURL:  cfg.RedirectURL,
		Endpoint:     provider.Endpoint(),
		Scopes:       []string{gooidc.ScopeOpenID, "email", "profile"},
	}

	return &oidcHandler{
		verifier:   provider.Verifier(&gooidc.Config{ClientID: cfg.ClientID}),
		oauth2Cfg:  oauth2Cfg,
		service:    service,
		successURL: cfg.SuccessURL,
	}, nil
}

func (handler *oidcHandler) login(w http.ResponseWriter, request *http.Request) {
	state, err := randomState()
	if err != nil {
		httpjson.WriteError(w, errors.Internal("failed to generate state", err))
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     oidcStateCookie,
		Value:    state,
		Path:     "/",
		MaxAge:   int(oidcStateTTL.Seconds()),
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})

	http.Redirect(w, request, handler.oauth2Cfg.AuthCodeURL(state), http.StatusFound)
}

func (handler *oidcHandler) callback(w http.ResponseWriter, request *http.Request) {
	stateCookie, err := request.Cookie(oidcStateCookie)
	if err != nil || stateCookie.Value == "" || stateCookie.Value != request.URL.Query().Get("state") {
		httpjson.WriteError(w, errors.Invalid("invalid oauth2 state"))
		return
	}
	clearStateCookie(w)

	oauth2Token, err := handler.oauth2Cfg.Exchange(request.Context(), request.URL.Query().Get("code"))
	if err != nil {
		httpjson.WriteError(w, errors.Internal("failed to exchange code", err))
		return
	}

	rawIDToken, ok := oauth2Token.Extra("id_token").(string)
	if !ok {
		httpjson.WriteError(w, errors.Internal("missing id_token in response", nil))
		return
	}

	idToken, err := handler.verifier.Verify(request.Context(), rawIDToken)
	if err != nil {
		httpjson.WriteError(w, errors.Unauthorized("invalid id_token"))
		return
	}

	var claims struct {
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
		Name          string `json:"name"`
	}
	if err := idToken.Claims(&claims); err != nil {
		httpjson.WriteError(w, errors.Internal("failed to parse claims", err))
		return
	}
	if claims.Email == "" {
		httpjson.WriteError(w, errors.Invalid("OIDC provider did not return an email"))
		return
	}

	_, token, err := handler.service.upsertOIDCUser(request.Context(), claims.Email, claims.Name)
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}

	SetSessionCookie(w, token)
	http.Redirect(w, request, handler.successURL, http.StatusFound)
}

func clearStateCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     oidcStateCookie,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})
}

func randomState() (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(bytes), nil
}
