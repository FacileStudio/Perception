package ingest

import (
	"context"
	"encoding/json"
	"time"
)

// Config is the ingest policy.
type Config struct {
	// Secrets are the HMAC keys a signature may match, current first.
	//
	// Two are accepted so a rotation does not need Antenne and Perception
	// restarted in the same second: the new key is added here, the emitter
	// switches, and the old key is dropped afterwards.
	Secrets []string

	// MaxSkew bounds how old or how far ahead a delivery's timestamp may be.
	MaxSkew time.Duration
}

// Controller decides whether a delivery is accepted and what it becomes.
type Controller struct {
	service *Service
	config  Config
	now     func() time.Time
}

// NewController builds the controller. now is injectable so a test can put a
// delivery outside the skew window without waiting for the clock.
func NewController(service *Service, config Config, now func() time.Time) *Controller {
	if now == nil {
		now = func() time.Time { return time.Now().UTC() }
	}
	return &Controller{service: service, config: config, now: now}
}

// delivery is one signed request, before it has been believed.
type delivery struct {
	eventID       string
	timestamp     string
	schemaVersion string
	signature     string
	body          []byte
	clientIP      string
}

// admit runs every check a delivery must pass, in the order that reveals the
// least to a caller who should not be here.
//
// The secret is checked first because its absence is a Perception
// misconfiguration rather than a caller's fault, and the signature is checked
// last: every cheap, non-secret test happens before any work that depends on a
// key, so a malformed probe never reaches the comparison.
func (c *Controller) admit(request delivery) string {
	if len(c.config.Secrets) == 0 {
		return ReasonNoSecret
	}
	if request.eventID == "" || request.timestamp == "" || request.signature == "" {
		return ReasonMissingHeaders
	}
	if request.schemaVersion != "" && request.schemaVersion != "1" {
		return ReasonBadSchemaVersion
	}
	if !withinSkew(request.timestamp, c.config.MaxSkew, c.now()) {
		return ReasonTimestampSkew
	}
	if !verify(c.config.Secrets, request.timestamp, request.eventID, request.body, request.signature) {
		return ReasonBadSignature
	}
	return ""
}

// accept stores a verified delivery.
//
// The envelope's own id wins over the header when the two disagree. The header
// is what was signed, so they cannot differ without the body having been
// tampered with — but the signature already proved they were not, and the body
// is the thing that will be read from now on.
func (c *Controller) accept(ctx context.Context, request delivery) (*Response, string) {
	var envelope Envelope
	if err := json.Unmarshal(request.body, &envelope); err != nil {
		return nil, ReasonMalformedBody
	}
	if envelope.SchemaVersion != 0 && envelope.SchemaVersion != SchemaVersion {
		return nil, ReasonBadSchemaVersion
	}
	if envelope.ID == "" {
		envelope.ID = request.eventID
	}

	event := toEvent(envelope, request.body, c.now())
	duplicate, err := c.service.Store(ctx, event)
	if err != nil {
		return nil, ""
	}
	return &Response{Accepted: event.ID, Duplicate: duplicate, Quality: event.Quality}, ""
}
