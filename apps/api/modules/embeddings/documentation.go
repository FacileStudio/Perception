package embeddings

import documentation "github.com/FacileStudio/Perception/apps/api/internal/documentation"

var Documentation = documentation.Module{
	Name:        "embeddings",
	Description: "Voyage embedding coverage over the event corpus, with the worker's backlog exposed as both an API read and a readiness signal.",
	Routes: []documentation.Route{
		{
			Method:       "GET",
			Path:         PathStatus,
			Summary:      "Embedding coverage and worker state",
			Description:  "Returns pending/ready/error counts, coverage over total events, and the age of the oldest pending row. Failed rows retry with exponentially spaced attempts up to a one-hour cap, exhausting MaxEmbeddingAttempts into a terminal error state. degraded is true when the backlog exceeds the stall thresholds or any terminal errors exist, which also fails /ready while the worker is enabled. enabled is false when VOYAGE_API_KEY is not set; that state never degrades readiness.",
			Auth:         "session cookie or bearer token required",
			ResponseBody: "StatusResponse",
			Errors: []documentation.Error{
				{Status: 401, Code: "unauthenticated", Description: "Session cookie or Authorization header is missing, invalid, or expired."},
			},
		},
	},
}
