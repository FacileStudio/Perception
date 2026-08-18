package auth

import (
	documentation "github.com/FacileStudio/Perception/apps/api/internal/documentation"
	"github.com/FacileStudio/porte"
)

// Documentation covers porte's routes as well as this module's own. porte
// mounts them, but /docs is Perception's contract with its callers, and a
// route the binary serves has to appear here or TestEveryRouteIsDocumented
// fails.
var Documentation = documentation.Module{
	Name:        "auth",
	Description: "Authentication, served by the shared porte kit. Sessions are an opaque token in an HttpOnly cookie for browsers and a bearer token for everything else. Cookie-borne mutations must carry the X-Facile-CSRF header.",
	Routes: []documentation.Route{
		{
			Method:       "GET",
			Path:         porte.RouteConfig,
			Summary:      "Describe the authentication modes",
			Description:  "Returns {sso_only, oidc_enabled} so a client knows which sign-in paths exist before offering them. When sso_only is true the register and login routes are not mounted at all.",
			Auth:         "public",
			ResponseBody: "porte.ConfigResponse",
		},
		{
			Method:       "POST",
			Path:         porte.RouteRegister,
			Summary:      "Register a local user",
			Description:  "Creates a password account, opens a session and sets the session cookie. Not mounted when SSO_ONLY is enabled. Only the first account is creatable: once one exists the route answers 403, so an instance cannot be claimed by whoever finds it second.",
			Auth:         "public",
			RequestBody:  "porte.CredentialsRequest",
			ResponseBody: "porte.ExchangeResponse",
			Errors: []documentation.Error{
				{Status: 400, Code: "invalid_argument", Description: "Invalid JSON body, malformed email, or a password below the minimum length."},
				{Status: 403, Code: "forbidden", Description: "Registration is closed because an account already exists."},
				{Status: 409, Code: "already_exists", Description: "A user with the same email already exists."},
				{Status: 500, Code: "internal", Description: "Unexpected server error."},
			},
		},
		{
			Method:       "POST",
			Path:         porte.RouteLoginLocal,
			Summary:      "Authenticate a local user",
			Description:  "Verifies the credentials, opens a session and sets the session cookie. Unknown addresses and wrong passwords are answered identically. Not mounted when SSO_ONLY is enabled.",
			Auth:         "public",
			RequestBody:  "porte.CredentialsRequest",
			ResponseBody: "porte.ExchangeResponse",
			Errors: []documentation.Error{
				{Status: 400, Code: "invalid_argument", Description: "Invalid JSON body or a missing email or password."},
				{Status: 401, Code: "unauthenticated", Description: "Email or password is invalid."},
				{Status: 500, Code: "internal", Description: "Unexpected server error."},
			},
		},
		{
			Method:       "POST",
			Path:         porte.RouteLogout,
			Summary:      "Log out",
			Description:  "Deletes the current session row and clears the cookie. A cookie-borne call must carry X-Facile-CSRF.",
			Auth:         "session cookie or bearer token required",
			ResponseBody: "porte.LogoutResponse",
			Errors: []documentation.Error{
				{Status: 403, Code: "forbidden", Description: "The call carried a session cookie without the X-Facile-CSRF header."},
				{Status: 500, Code: "internal", Description: "Unexpected server error."},
			},
		},
		{
			Method:       "GET",
			Path:         PathMe,
			Summary:      "Get the current user",
			Description:  "Returns the authenticated user's id, email and name, read from porte's identity tables.",
			Auth:         "session cookie or bearer token required",
			ResponseBody: "MeResponse",
			Errors: []documentation.Error{
				{Status: 401, Code: "unauthenticated", Description: "Session cookie or Authorization header is missing, invalid, or expired."},
				{Status: 403, Code: "forbidden", Description: "The call carried a session cookie without the X-Facile-CSRF header on a mutating method."},
			},
		},
		{
			Method:      "GET",
			Path:        porte.RouteLogin,
			Summary:     "Start the OIDC sign-in flow",
			Description: "Redirects to the configured identity provider with PKCE, a nonce and a state cookie. A CLI adds ?flow=cli to get a one-time code back instead of a cookie. Only mounted when OIDC_ISSUER is set.",
			Auth:        "public",
			Errors: []documentation.Error{
				{Status: 500, Code: "internal", Description: "Failed to start the flow."},
			},
		},
		{
			Method:      "GET",
			Path:        porte.RouteCallback,
			Summary:     "Complete the OIDC sign-in flow",
			Description: "Validates the state, exchanges the code, verifies the id_token, upserts the identity, sets the session cookie and redirects to OIDC_SUCCESS_URL. No access or refresh token is stored. Only mounted when OIDC_ISSUER is set.",
			Auth:        "public",
			Errors: []documentation.Error{
				{Status: 400, Code: "invalid_argument", Description: "The state is missing or does not match, or the provider returned no email claim."},
				{Status: 401, Code: "unauthenticated", Description: "The id_token is invalid, expired, or not issued for this client."},
				{Status: 500, Code: "internal", Description: "Code exchange failed or the identity could not be saved."},
			},
		},
		{
			Method:       "POST",
			Path:         porte.RouteExchange,
			Summary:      "Trade a CLI login code for a token",
			Description:  "Consumes the one-time code minted by the ?flow=cli sign-in and returns a bearer token. The code is single-use and short-lived. Only mounted when OIDC_ISSUER is set.",
			Auth:         "public",
			RequestBody:  "porte.ExchangeRequest",
			ResponseBody: "porte.ExchangeResponse",
			Errors: []documentation.Error{
				{Status: 400, Code: "invalid_argument", Description: "The body carried no code."},
				{Status: 401, Code: "unauthenticated", Description: "The code is unknown, already consumed, or expired."},
			},
		},
		{
			Method:      "POST",
			Path:        porte.RouteBackchannelLogout,
			Summary:     "Accept a back-channel logout",
			Description: "Ends the sessions of a user the identity provider signed out elsewhere. Called by the provider, not by a browser. Only mounted when OIDC_ISSUER is set.",
			Auth:        "signed logout token from the identity provider",
			Errors: []documentation.Error{
				{Status: 400, Code: "invalid_argument", Description: "The logout token is missing or malformed."},
				{Status: 401, Code: "unauthenticated", Description: "The logout token failed verification."},
			},
		},
	},
}
