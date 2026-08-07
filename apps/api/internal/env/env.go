package env

import (
	"fmt"

	troncenv "github.com/FacileStudio/tronc/env"
)

type OIDCConfig struct {
	Issuer       string
	ClientID     string
	ClientSecret string
	RedirectURL  string
	SuccessURL   string
}

type Config struct {
	troncenv.Core
	OIDC        *OIDCConfig
	PublicURL   string
	SSOOnly     bool
	AdminEmails []string
}

func Load() (Config, error) {
	core, err := troncenv.LoadCore()
	if err != nil {
		return Config{}, err
	}
	if core.Port < 1 || core.Port > 65535 {
		return Config{}, fmt.Errorf("PORT must be a valid TCP port")
	}

	cfg := Config{Core: core}

	if cfg.SSOOnly, err = troncenv.Bool("SSO_ONLY", false); err != nil {
		return Config{}, err
	}

	cfg.AdminEmails = troncenv.List("PERCEPTION_ADMIN_EMAILS")

	// The public origin is what an OIDC redirect has to point at. Deployments
	// almost never set it twice, so it falls back to the first CORS origin the
	// same way OIDC_SUCCESS_URL does.
	cfg.PublicURL = troncenv.String("PUBLIC_URL", "")
	if cfg.PublicURL == "" && len(cfg.CORSAllowedOrigins) > 0 {
		cfg.PublicURL = cfg.CORSAllowedOrigins[0]
	}

	// OIDC_ISSUER is the switch: unset means the OIDC routes are never mounted.
	// Set means the rest has to add up now, at startup, rather than at the first
	// login attempt of a deployment that believed SSO was configured.
	if issuer := troncenv.String("OIDC_ISSUER", ""); issuer != "" {
		clientID := troncenv.String("OIDC_CLIENT_ID", "")
		clientSecret := troncenv.String("OIDC_CLIENT_SECRET", "")
		redirectURL := troncenv.String("OIDC_REDIRECT_URL", "")
		if clientID == "" || clientSecret == "" || redirectURL == "" {
			return Config{}, fmt.Errorf("OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, and OIDC_REDIRECT_URL are required when OIDC_ISSUER is set")
		}
		successURL := troncenv.String("OIDC_SUCCESS_URL", "")
		if successURL == "" && len(cfg.CORSAllowedOrigins) > 0 {
			successURL = cfg.CORSAllowedOrigins[0]
		}
		cfg.OIDC = &OIDCConfig{
			Issuer:       issuer,
			ClientID:     clientID,
			ClientSecret: clientSecret,
			RedirectURL:  redirectURL,
			SuccessURL:   successURL,
		}
	}

	// SSO_ONLY removes the password routes, so without an issuer there is no way
	// left to authenticate at all. Refusing to boot beats a running instance that
	// serves a login page nobody can get through.
	if cfg.SSOOnly && cfg.OIDC == nil {
		return Config{}, fmt.Errorf("SSO_ONLY is set without OIDC_ISSUER, which would leave no way to sign in")
	}

	return cfg, nil
}
