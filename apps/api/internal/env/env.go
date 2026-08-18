package env

import (
	"fmt"

	"github.com/FacileStudio/porte"
	troncenv "github.com/FacileStudio/tronc/env"
)

// OIDCConfig is the OpenID Connect client configuration, only present when
// OIDC_ISSUER was set.
type OIDCConfig struct {
	Issuer       string
	ClientID     string
	ClientSecret string
	RedirectURL  string
	SuccessURL   string
}

// Config is the process configuration: the tronc core plus Perception's OIDC
// and SSO policy.
type Config struct {
	troncenv.Core
	OIDC        *OIDCConfig
	PublicURL   string
	SSOOnly     bool
	AdminEmails []string
}

// Load reads and validates the environment. The public origin is what an OIDC
// redirect has to point at, so it falls back to the first CORS origin when
// PUBLIC_URL is unset; OIDC_ISSUER is the switch that mounts the OIDC routes
// and demands its client triple now, at startup, rather than at the first login
// attempt of a deployment that believed SSO was configured; and SSO_ONLY
// without an issuer refuses to boot, because a running instance that serves a
// login page nobody can get through is worse than none.
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

	cfg.PublicURL = troncenv.String("PUBLIC_URL", "")
	if cfg.PublicURL == "" && len(cfg.CORSAllowedOrigins) > 0 {
		cfg.PublicURL = cfg.CORSAllowedOrigins[0]
	}

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

	if cfg.SSOOnly && cfg.OIDC == nil {
		return Config{}, fmt.Errorf("SSO_ONLY is set without OIDC_ISSUER, which would leave no way to sign in")
	}

	return cfg, nil
}

// Porte translates this config into porte's. The environment variable names are
// the suite convention and do not change; this only reshapes what Load already
// validated.
//
// AcceptLegacyCookie stays off. It exists so an adopting app does not log
// everyone out, and it does that by also reading an unprefixed `session`
// cookie — which is the cookie a compromised sibling host plants, and exactly
// what the __Host- prefix refuses. Perception's pre-porte cookie was named
// perception_session, which that fallback would not have matched anyway, so
// turning it on would widen the attack surface and rescue nothing.
func (c Config) Porte() porte.Config {
	cfg := porte.Config{SSOOnly: c.SSOOnly}
	if c.OIDC == nil {
		return cfg
	}
	cfg.Issuer = c.OIDC.Issuer
	cfg.ClientID = c.OIDC.ClientID
	cfg.ClientSecret = c.OIDC.ClientSecret
	cfg.RedirectURL = c.OIDC.RedirectURL
	cfg.SuccessURL = c.OIDC.SuccessURL
	return cfg
}
