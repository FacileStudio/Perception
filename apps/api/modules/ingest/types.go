package ingest

// Header names Antenne signs its deliveries with.
//
// They are the `x-antenne-*` spelling the emitter actually sends. An earlier
// draft of Perception's spec said `X-Nook-*`, from before the bus was renamed;
// the emitter moved and the spec did not. Do not accept both — a second
// spelling is a second code path to keep verified.
const (
	HeaderEventID       = "X-Antenne-Event-Id"
	HeaderTimestamp     = "X-Antenne-Timestamp"
	HeaderSchemaVersion = "X-Antenne-Schema-Version"
	HeaderSignature     = "X-Antenne-Signature-256"
)

// SchemaVersion is the only envelope version this endpoint accepts.
const SchemaVersion = 1

// Rejection reasons, recorded on every refused delivery.
//
// They are a closed set so `ingest_rejections` can be grouped by cause: a
// misconfigured emitter shows up as a hundred rows sharing one reason, which
// is a diagnosis rather than a pile of failures.
const (
	ReasonNoSecret         = "no_ingest_secret_configured"
	ReasonMissingHeaders   = "missing_headers"
	ReasonTimestampSkew    = "timestamp_out_of_range"
	ReasonBadSchemaVersion = "unsupported_schema_version"
	ReasonBadSignature     = "invalid_signature"
	ReasonMalformedBody    = "malformed_body"
	ReasonTooLarge         = "payload_too_large"
)

// Envelope is Antenne's event, schema version 1.
//
// It mirrors the emitter's own struct field for field. Perception decodes what
// Antenne sends rather than a convenient subset, because a field that is
// silently dropped here is a field nobody discovers is missing until they go
// looking for it in a query six months later.
type Envelope struct {
	SchemaVersion int      `json:"schemaVersion"`
	ID            string   `json:"id"`
	OccurredAt    string   `json:"occurredAt"`
	EmittedAt     string   `json:"emittedAt"`
	Source        string   `json:"source"`
	Provider      Provider `json:"provider"`
	Event         Event    `json:"event"`
	Actor         *Actor   `json:"actor"`
	Subject       Subject  `json:"subject"`
	Payload       Payload  `json:"payload"`
	Privacy       Privacy  `json:"privacy"`
}

// Provider identifies the Antenne provider an event came through.
type Provider struct {
	ID   *string  `json:"id"`
	Type string   `json:"type"`
	Name string   `json:"name"`
	Tags []string `json:"tags"`
}

// Event is the human-facing description of what happened.
type Event struct {
	Type        string  `json:"type"`
	Title       *string `json:"title"`
	MessageHTML *string `json:"messageHtml"`
	MessageText *string `json:"messageText"`
	URL         *string `json:"url"`
}

// Actor is who caused the event, when the source says so.
//
// Email is whatever the third-party payload carried. It is not a Facile
// identity and must never be joined to one.
type Actor struct {
	ID    *string `json:"id"`
	Name  *string `json:"name"`
	Email *string `json:"email"`
}

// Subject is what the event is about.
type Subject struct {
	Type string  `json:"type"`
	ID   *string `json:"id"`
	Name *string `json:"name"`
	URL  *string `json:"url"`
}

// Payload carries the normalised fields and, when allowed, the raw body.
type Payload struct {
	Normalized map[string]any `json:"normalized"`
	Raw        any            `json:"raw"`
}

// Privacy flags what the payload may be used for downstream.
type Privacy struct {
	ContainsPII       bool `json:"containsPii"`
	RawPayloadAllowed bool `json:"rawPayloadAllowed"`
}

// Response is what a successful delivery gets back.
type Response struct {
	// Accepted is the event id Perception stored it under.
	Accepted string `json:"accepted"`

	// Duplicate is true when the id was already present. A resend is an
	// idempotent upsert rather than an error, which is what lets an emitter
	// retry a delivery it is unsure about.
	Duplicate bool `json:"duplicate"`

	// Quality is how much of the envelope parsed.
	Quality string `json:"quality"`
}

// RejectionResponse is what a refused delivery gets back.
//
// The reason is returned as well as recorded, because the emitter is the one
// that can fix a clock skew or a stale secret and it should not need access to
// Perception's database to find out which.
type RejectionResponse struct {
	Reason string `json:"reason"`
}
