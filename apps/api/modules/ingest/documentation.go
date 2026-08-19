package ingest

import documentation "github.com/FacileStudio/Perception/apps/api/internal/documentation"

// Documentation describes the intake path for the reference at /docs.
var Documentation = documentation.Module{
	Name:        "ingest",
	Description: "The intake path from Antenne. Deliveries are signed with HMAC-SHA256 over {timestamp}.{eventId}.{rawBody} and carry the x-antenne-* headers. Every refusal is recorded in ingest_rejections so a misconfigured emitter is visible rather than silent.",
	Routes: []documentation.Route{
		{
			Method:       "POST",
			Path:         PathIngest,
			Summary:      "Accept a signed event from Antenne",
			Description:  "Requires X-Antenne-Event-Id, X-Antenne-Timestamp and X-Antenne-Signature-256; X-Antenne-Schema-Version must be 1 when present. The event id is the primary key, so a resend is an idempotent upsert answering 202 with duplicate true — replay protection is deduplication, not a nonce cache. An event whose timestamp or event type will not parse is still stored, at quality degraded: no delivery is dropped silently.",
			Auth:         "HMAC signature; no session",
			RequestBody:  "Envelope",
			ResponseBody: "Response",
			Errors: []documentation.Error{
				{Status: 400, Code: "invalid_argument", Description: "Headers are missing, the schema version is unsupported, or the body is not a schema-1 envelope."},
				{Status: 401, Code: "unauthenticated", Description: "The signature does not match any configured secret, or the timestamp is outside INGEST_MAX_SKEW_SECONDS."},
				{Status: 413, Code: "invalid_argument", Description: "The body is larger than 4 MiB."},
				{Status: 500, Code: "internal", Description: "No ingest secret is configured, or the event could not be stored."},
			},
		},
		{
			Method:       "GET",
			Path:         PathRejections,
			Summary:      "List recent refused deliveries",
			Description:  "Newest first, capped at 50. Each row carries the reason, the claimed event id, a hash of the source address and a hash of the payload — enough to identify a repeat offender without keeping an address.",
			Auth:         "session cookie or bearer token required",
			ResponseBody: "[]schemas.IngestRejection",
			Errors: []documentation.Error{
				{Status: 401, Code: "unauthenticated", Description: "Session cookie or Authorization header is missing, invalid, or expired."},
				{Status: 500, Code: "internal", Description: "Unexpected server error."},
			},
		},
	},
}
