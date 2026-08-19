package ingest

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/FacileStudio/Perception/apps/api/schemas"
)

func ptr(value string) *string { return &value }

// full is an envelope with nothing missing, for a test to spoil one field of.
func full() Envelope {
	return Envelope{
		SchemaVersion: 1,
		ID:            "evt_1",
		OccurredAt:    "2026-08-19T10:30:00Z",
		EmittedAt:     "2026-08-19T10:30:01Z",
		Source:        "webhook",
		Provider:      Provider{ID: ptr("prov_1"), Type: "git", Name: "GitHub", Tags: []string{"vcs"}},
		Event:         Event{Type: "git.push", Title: ptr("3 commits to main"), MessageText: ptr("saravenpi pushed"), URL: ptr("https://example.test/c")},
		Actor:         &Actor{ID: ptr("u1"), Name: ptr("Yann"), Email: ptr("Yann@Example.Test")},
		Subject:       Subject{Type: "repository", ID: ptr("r1"), Name: ptr("Perception"), URL: ptr("https://example.test/r")},
		Payload:       Payload{Normalized: map[string]any{"branch": "main"}},
		Privacy:       Privacy{ContainsPII: false, RawPayloadAllowed: false},
	}
}

var now = time.Date(2026, 8, 19, 12, 0, 0, 0, time.UTC)

// The address is lowercased so that "what did this person touch" is one query
// rather than one per capitalisation a provider happened to send.
func TestACompleteEnvelopeMapsEveryField(t *testing.T) {
	event := toEvent(full(), []byte(`{}`), now)

	checks := map[string][2]string{
		"id":            {event.ID, "evt_1"},
		"source":        {event.Source, "webhook"},
		"provider type": {event.ProviderType, "git"},
		"provider name": {event.ProviderName, "GitHub"},
		"event type":    {event.EventType, "git.push"},
		"title":         {event.Title, "3 commits to main"},
		"summary":       {event.Summary, "saravenpi pushed"},
		"entity type":   {event.EntityType, "repository"},
		"entity ref":    {event.EntityRef, "r1"},
		"entity name":   {event.EntityName, "Perception"},
		"actor name":    {event.ActorName, "Yann"},
		"quality":       {event.Quality, schemas.QualityComplete},
	}
	for name, pair := range checks {
		if pair[0] != pair[1] {
			t.Errorf("%s = %q, want %q", name, pair[0], pair[1])
		}
	}

	if event.ActorEmail != "yann@example.test" {
		t.Errorf("actor email = %q, want it normalised to lower case", event.ActorEmail)
	}
	if !event.OccurredAt.Equal(time.Date(2026, 8, 19, 10, 30, 0, 0, time.UTC)) {
		t.Errorf("occurred at = %s, want the envelope's timestamp", event.OccurredAt)
	}
}

// This is the defect that broke the old corpus: the IMAP provider sent
// RFC-2822 while everything else sent ISO-8601, the column was untyped text,
// and 107 events sorted into the wrong place because unixepoch() returned NULL
// for every one of them.
func TestRFC2822TimestampsParse(t *testing.T) {
	envelope := full()
	envelope.OccurredAt = "Wed, 8 Jul 2026 11:50:51 -0700"

	event := toEvent(envelope, nil, now)
	if event.Quality != schemas.QualityComplete {
		t.Errorf("quality = %q, want complete: an RFC-2822 date is not a defect", event.Quality)
	}
	want := time.Date(2026, 7, 8, 18, 50, 51, 0, time.UTC)
	if !event.OccurredAt.Equal(want) {
		t.Errorf("occurred at = %s, want %s", event.OccurredAt, want)
	}
}

// The degraded path never once fired in the old corpus — all 9,355 rows were
// complete — so it has only ever been exercised by a test.
func TestUnparseableFieldsDegradeRatherThanDrop(t *testing.T) {
	t.Run("bad timestamp falls back to the emission time", func(t *testing.T) {
		envelope := full()
		envelope.OccurredAt = "last tuesday"

		event := toEvent(envelope, nil, now)
		if event.Quality != schemas.QualityDegraded {
			t.Errorf("quality = %q, want degraded", event.Quality)
		}
		if !event.OccurredAt.Equal(time.Date(2026, 8, 19, 10, 30, 1, 0, time.UTC)) {
			t.Errorf("occurred at = %s, want the emission time as the closest honest answer", event.OccurredAt)
		}
	})

	t.Run("no timestamp at all falls back to the ingest time", func(t *testing.T) {
		envelope := full()
		envelope.OccurredAt, envelope.EmittedAt = "", ""

		event := toEvent(envelope, nil, now)
		if !event.OccurredAt.Equal(now) {
			t.Errorf("occurred at = %s, want the ingest time", event.OccurredAt)
		}
	})

	t.Run("no event type is degraded", func(t *testing.T) {
		envelope := full()
		envelope.Event.Type = ""
		if got := toEvent(envelope, nil, now).Quality; got != schemas.QualityDegraded {
			t.Errorf("quality = %q, want degraded", got)
		}
	})
}

// An unclassified subject is a real state, not an error: an RSS item is
// genuinely about nothing the suite models.
func TestAnUnclassifiedSubjectIsPartial(t *testing.T) {
	for _, subject := range []string{"unknown", ""} {
		envelope := full()
		envelope.Subject.Type = subject

		event := toEvent(envelope, nil, now)
		if event.Quality != schemas.QualityPartial {
			t.Errorf("subject %q: quality = %q, want partial", subject, event.Quality)
		}
		if event.EntityType != "unknown" {
			t.Errorf("subject %q: entity type = %q, want it normalised to unknown", subject, event.EntityType)
		}
	}
}

// Antenne strips the raw body for targets configured without it; this checks
// the flag again rather than trusting that it did.
func TestRawPayloadIsKeptOnlyWhenAllowed(t *testing.T) {
	envelope := full()
	envelope.Payload.Raw = map[string]any{"secret": "value"}

	if event := toEvent(envelope, nil, now); event.PayloadRaw != nil {
		t.Errorf("raw payload = %s, want it dropped when rawPayloadAllowed is false", event.PayloadRaw)
	}

	envelope.Privacy.RawPayloadAllowed = true
	event := toEvent(envelope, nil, now)
	if event.PayloadRaw == nil {
		t.Fatal("raw payload was dropped even though the envelope allowed it")
	}
	var decoded map[string]any
	if err := json.Unmarshal(event.PayloadRaw, &decoded); err != nil || decoded["secret"] != "value" {
		t.Errorf("raw payload = %s, want the original body", event.PayloadRaw)
	}
}

func TestAnAbsentActorIsNotAnError(t *testing.T) {
	envelope := full()
	envelope.Actor = nil

	event := toEvent(envelope, nil, now)
	if event.ActorName != "" || event.ActorEmail != "" {
		t.Errorf("actor = %q/%q, want empty", event.ActorName, event.ActorEmail)
	}
	if event.Quality != schemas.QualityComplete {
		t.Errorf("quality = %q; a system event has no actor and that is normal", event.Quality)
	}
}

// searchable_text is what full-text and embeddings both read, so a repeated
// field would weight that term twice in one and not the other.
func TestSearchableTextIsAssembledOnceWithoutRepeats(t *testing.T) {
	envelope := full()
	envelope.Event.Title = ptr("Perception")
	envelope.Subject.Name = ptr("Perception")

	text := toEvent(envelope, nil, now).SearchableText
	if strings.Count(text, "Perception") != 1 {
		t.Errorf("searchable text = %q, want the repeated term kept once", text)
	}
	if !strings.Contains(text, "git.push") || !strings.Contains(text, "Yann") {
		t.Errorf("searchable text = %q, want the event type and the actor in it", text)
	}
}
