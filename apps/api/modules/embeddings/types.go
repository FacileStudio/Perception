package embeddings

// The route path is exported for the same reason as in modules/auth: it is
// the wire contract, declared once and spelled once.
const PathStatus = "/embeddings/status"

// StatusResponse is what GET /api/embeddings/status answers. Coverage and
// Degraded are the two numbers a human actually reads.
type StatusResponse struct {
	Enabled        bool    `json:"enabled"`
	Model          string  `json:"model"`
	Pending        int64   `json:"pending"`
	Ready          int64   `json:"ready"`
	Error          int64   `json:"error"`
	TotalEvents    int64   `json:"total_events"`
	Coverage       float64 `json:"coverage"`
	OldestPending  *string `json:"oldest_pending_age,omitempty"`
	StallThreshold string  `json:"stall_threshold"`
	Degraded       bool    `json:"degraded"`
}
