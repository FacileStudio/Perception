package ingest

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"
	"time"

	"github.com/FacileStudio/Perception/apps/api/schemas"
)

// timeFormats are the shapes a timestamp has actually arrived in.
//
// RFC-3339 is what the envelope promises. The RFC-2822 forms are what the IMAP
// provider sent anyway: 107 events in the old corpus carried
// "Wed, 8 Jul 2026 11:50:51 -0700", the column was untyped text, and
// unixepoch() returned NULL for every one of them — so they sorted
// unpredictably and nobody noticed. Parsing both here and storing one
// timestamptz is the fix, and it is why this list is longer than the spec.
var timeFormats = []string{
	time.RFC3339Nano,
	time.RFC3339,
	time.RFC1123Z,
	time.RFC1123,
	time.RFC822Z,
	time.RFC822,
	"Mon, 2 Jan 2006 15:04:05 -0700",
	"Mon, 2 Jan 2006 15:04:05 MST",
	"2 Jan 2006 15:04:05 -0700",
	"2006-01-02 15:04:05Z07:00",
	"2006-01-02T15:04:05",
	"2006-01-02",
}

// parseTime reads a timestamp in any form a provider has been seen to send.
func parseTime(value string) (time.Time, bool) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return time.Time{}, false
	}
	for _, layout := range timeFormats {
		if parsed, err := time.Parse(layout, trimmed); err == nil {
			return parsed.UTC(), true
		}
	}
	return time.Time{}, false
}

// toEvent maps an envelope onto the row Perception stores.
//
// Nothing is dropped for being unparseable. A timestamp that will not parse
// costs the event its quality rating, not its existence — the corpus is
// supposed to record that something happened even when Perception cannot say
// exactly when.
//
// The raw body is kept only when the envelope says it may be. Antenne already
// strips it for targets configured without it; this checks the flag again
// rather than trusting that it did.
func toEvent(envelope Envelope, body []byte, now time.Time) schemas.Event {
	occurredAt, emittedAt, timeParsed := timestamps(envelope, now)
	quality := qualityOf(envelope, timeParsed)

	event := schemas.Event{
		ID:            envelope.ID,
		SchemaVersion: envelope.SchemaVersion,
		Source:        envelope.Source,
		Quality:       quality,
		EventProvider: schemas.EventProvider{
			ProviderID:   deref(envelope.Provider.ID),
			ProviderType: envelope.Provider.Type,
			ProviderName: envelope.Provider.Name,
			ProviderTags: encode(envelope.Provider.Tags),
		},
		EventSubject: schemas.EventSubject{
			EntityType: subjectType(envelope.Subject.Type),
			EntityRef:  deref(envelope.Subject.ID),
			EntityName: deref(envelope.Subject.Name),
			EntityURL:  deref(envelope.Subject.URL),
		},
		EventTiming: schemas.EventTiming{
			OccurredAt: occurredAt,
			EmittedAt:  emittedAt,
			IngestedAt: now,
		},
		EventContent: schemas.EventContent{
			EventType: envelope.Event.Type,
			Title:     deref(envelope.Event.Title),
			Summary:   deref(envelope.Event.MessageText),
			URL:       deref(envelope.Event.URL),
		},
		EventPayload: schemas.EventPayload{
			PayloadHash: hashOf(body),
			ContainsPII: envelope.Privacy.ContainsPII,
		},
	}
	if envelope.Actor != nil {
		event.ActorRef = deref(envelope.Actor.ID)
		event.ActorName = deref(envelope.Actor.Name)
		event.ActorEmail = strings.ToLower(strings.TrimSpace(deref(envelope.Actor.Email)))
	}
	if len(envelope.Payload.Normalized) > 0 {
		event.PayloadNormalized = encode(envelope.Payload.Normalized)
	}

	if envelope.Privacy.RawPayloadAllowed && envelope.Payload.Raw != nil {
		event.PayloadRaw = encode(envelope.Payload.Raw)
	}

	event.SearchableText = searchableText(event)
	return event
}

// timestamps reads when an event happened and was sent, reporting whether the
// occurrence time parsed at all.
func timestamps(envelope Envelope, now time.Time) (occurredAt, emittedAt time.Time, parsed bool) {
	occurredAt, parsed = parseTime(envelope.OccurredAt)
	emittedAt, emittedOK := parseTime(envelope.EmittedAt)

	if !parsed {
		occurredAt = fallbackTime(emittedAt, emittedOK, now)
	}
	if !emittedOK {
		emittedAt = occurredAt
	}
	return occurredAt, emittedAt, parsed
}

// qualityOf rates how much of an envelope Perception understood.
func qualityOf(envelope Envelope, timeParsed bool) string {
	if !timeParsed || envelope.Event.Type == "" {
		return schemas.QualityDegraded
	}
	if subjectUnclassified(envelope.Subject.Type) {
		return schemas.QualityPartial
	}
	return schemas.QualityComplete
}

// fallbackTime is when to say an event happened if it would not say.
//
// The emission time is the closest honest answer; the ingest time is a last
// resort that at least keeps the row in the right week.
func fallbackTime(emittedAt time.Time, emittedOK bool, now time.Time) time.Time {
	if emittedOK {
		return emittedAt
	}
	return now
}

// subjectUnclassified reports whether Antenne could not say what an event was
// about. It is a real state, not an error: an RSS item is genuinely about
// nothing the suite models.
func subjectUnclassified(subject string) bool {
	return subject == "" || subject == "unknown"
}

// subjectType normalises a missing subject to the enum's own spelling, so a
// query never has to test for empty and "unknown" separately.
func subjectType(subject string) string {
	if subject == "" {
		return "unknown"
	}
	return subject
}

// searchableText is what full-text and embeddings both read.
//
// It is assembled once, at ingest, from the fields a person would actually
// search by. Building it per query instead is how the two retrieval halves end
// up answering slightly different questions about the same event.
func searchableText(event schemas.Event) string {
	parts := []string{
		event.Title,
		event.Summary,
		event.EntityName,
		event.EventType,
		event.ProviderName,
		event.ActorName,
	}

	seen := make(map[string]bool, len(parts))
	kept := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed == "" || seen[trimmed] {
			continue
		}
		seen[trimmed] = true
		kept = append(kept, trimmed)
	}
	return strings.Join(kept, " — ")
}

// hashOf fingerprints a delivery, so a rejection can be correlated with a
// retry of the same body without keeping the body.
func hashOf(body []byte) string {
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:])
}

// encode marshals a value for a jsonb column, returning nil rather than an
// error: a payload that will not marshal is not worth failing an ingest over,
// and the event is still worth having without it.
func encode(value any) []byte {
	encoded, err := json.Marshal(value)
	if err != nil {
		return nil
	}
	return encoded
}

// deref reads an optional string.
func deref(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
