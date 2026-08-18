package auth

// MeResponse is the authenticated user's profile.
type MeResponse struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
}
