package events

import documentation "github.com/FacileStudio/Perception/apps/api/internal/documentation"

// Documentation describes the event listing for the reference at /docs.
var Documentation = documentation.Module{
	Name:        "events",
	Description: "The browsable corpus. Filters combine with AND, and paging is by cursor rather than offset so a table that only grows cannot skip rows between pages.",
	Routes: []documentation.Route{
		{
			Method:       "GET",
			Path:         PathEvents,
			Summary:      "List events, newest first",
			Description:  "Query parameters: provider, type, entity (substring match on the entity name), actor (exact email), quality, since and until (RFC-3339 or YYYY-MM-DD), limit (default 50, max 200) and cursor. An unparseable time or limit is ignored rather than refused. The response carries next_cursor until the last page.",
			Auth:         "session cookie or bearer token required",
			ResponseBody: "Page",
			Errors: []documentation.Error{
				{Status: 400, Code: "invalid_argument", Description: "The cursor is not one this API issued."},
				{Status: 401, Code: "unauthenticated", Description: "Session cookie or Authorization header is missing, invalid, or expired."},
				{Status: 500, Code: "internal", Description: "Unexpected server error."},
			},
		},
		{
			Method:       "GET",
			Path:         PathEvent,
			Summary:      "Get one event in full",
			Description:  "Returns the whole row including the normalised payload, and the raw payload when the emitter allowed it to be stored.",
			Auth:         "session cookie or bearer token required",
			ResponseBody: "schemas.Event",
			Errors: []documentation.Error{
				{Status: 401, Code: "unauthenticated", Description: "Session cookie or Authorization header is missing, invalid, or expired."},
				{Status: 404, Code: "not_found", Description: "No event with that id."},
			},
		},
	},
}
