package auth

// MeResponse is the authenticated user's profile. AvatarURL is the identity
// provider's picture URL, or "" when there is none and the client draws
// initials.
type MeResponse struct {
	ID        string `json:"id"`
	Email     string `json:"email"`
	Name      string `json:"name"`
	AvatarURL string `json:"avatar_url"`
}
