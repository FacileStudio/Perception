package auth

import documentation "github.com/FacileStudio/Perception/apps/api/internal/documentation"

var Documentation = documentation.Module{
	Name:        "auth",
	Description: "Authentication routes. Sessions are cookie-based; the same token is accepted in an Authorization header for non-browser callers.",
	Routes: []documentation.Route{
		{
			Method:       "GET",
			Path:         PathConfig,
			Summary:      "Describe the authentication modes",
			Description:  "Returns {sso_only, oidc_enabled} so a client knows which sign-in paths exist before offering them. When sso_only is true the register and login routes are not mounted at all.",
			Auth:         "public",
			ResponseBody: "AuthConfigResponse",
		},
		{
			Method:       "POST",
			Path:         PathRegister,
			Summary:      "Register a local user",
			Description:  "Creates a password account, opens a session and sets the perception_session cookie. Not mounted when SSO_ONLY is enabled.",
			Auth:         "public",
			RequestBody:  "RegisterRequest",
			ResponseBody: "AuthResponse",
			Errors: []documentation.Error{
				{Status: 400, Code: "invalid_argument", Description: "Invalid JSON body, malformed email, or a password shorter than 8 characters."},
				{Status: 409, Code: "already_exists", Description: "A user with the same email already exists."},
				{Status: 429, Code: "rate_limited", Description: "Too many attempts from this caller."},
				{Status: 500, Code: "internal", Description: "Unexpected server error."},
			},
		},
		{
			Method:       "POST",
			Path:         PathLogin,
			Summary:      "Authenticate a local user",
			Description:  "Verifies the credentials, opens a session and sets the perception_session cookie. Unknown addresses and wrong passwords are answered identically. Not mounted when SSO_ONLY is enabled.",
			Auth:         "public",
			RequestBody:  "LoginRequest",
			ResponseBody: "AuthResponse",
			Errors: []documentation.Error{
				{Status: 400, Code: "invalid_argument", Description: "Invalid JSON body or a missing email or password."},
				{Status: 401, Code: "unauthenticated", Description: "Email or password is invalid."},
				{Status: 429, Code: "rate_limited", Description: "Too many attempts from this caller."},
				{Status: 500, Code: "internal", Description: "Unexpected server error."},
			},
		},
		{
			Method:      "POST",
			Path:        PathLogout,
			Summary:     "Log out",
			Description: "Deletes the current session row and clears the perception_session cookie. Answers 204 with no body.",
			Auth:        "session cookie or bearer token required",
			Errors: []documentation.Error{
				{Status: 401, Code: "unauthenticated", Description: "Session cookie or Authorization header is missing, invalid, or expired."},
				{Status: 500, Code: "internal", Description: "Unexpected server error."},
			},
		},
		{
			Method:       "GET",
			Path:         PathMe,
			Summary:      "Get the current user",
			Description:  "Returns the authenticated user's id, email and name. Every authenticated call also slides the session expiry forward, bounded by the session's absolute lifetime.",
			Auth:         "session cookie or bearer token required",
			ResponseBody: "MeResponse",
			Errors: []documentation.Error{
				{Status: 401, Code: "unauthenticated", Description: "Session cookie or Authorization header is missing, invalid, or expired."},
			},
		},
		{
			Method:      "GET",
			Path:        PathOIDCLogin,
			Summary:     "Start the OIDC sign-in flow",
			Description: "Sets a short-lived state cookie and redirects to the configured identity provider. Only mounted when OIDC_ISSUER is set.",
			Auth:        "public",
			Errors: []documentation.Error{
				{Status: 500, Code: "internal", Description: "Failed to generate the oauth2 state."},
			},
		},
		{
			Method:      "GET",
			Path:        PathOIDCCallback,
			Summary:     "Complete the OIDC sign-in flow",
			Description: "Validates the state cookie, exchanges the code, verifies the id_token, upserts the user keyed on email, sets the perception_session cookie and redirects to OIDC_SUCCESS_URL. No access or refresh token is ever stored. Only mounted when OIDC_ISSUER is set.",
			Auth:        "public",
			Errors: []documentation.Error{
				{Status: 400, Code: "invalid_argument", Description: "The oauth2 state is missing or does not match, or the provider returned no email claim."},
				{Status: 401, Code: "unauthenticated", Description: "The id_token is invalid, expired, or not issued for this client."},
				{Status: 500, Code: "internal", Description: "Code exchange failed, the response carried no id_token, or the user could not be saved."},
			},
		},
	},
}
