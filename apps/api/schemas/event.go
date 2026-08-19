package schemas

import "time"

// Quality is how much of an event Perception managed to understand.
//
// It is a property of the ingest, not of the source: an event is stored
// whatever its quality, because a provider nobody taught Perception about is
// still something that happened. Dropping it would make the gap invisible,
// which is the failure the old system had in the other direction.
const (
	// QualityComplete means every field the envelope promised parsed.
	QualityComplete = "complete"

	// QualityPartial means the event is usable but its subject is not
	// classified — Antenne sent subject.type "unknown".
	QualityPartial = "partial"

	// QualityDegraded means something load-bearing did not parse, most
	// often the timestamp. The event is searchable but must not be trusted
	// for ordering or for statistics that assume a clean corpus.
	QualityDegraded = "degraded"
)

// Event is one thing that happened somewhere in the suite.
//
// The shape follows Antenne's envelope rather than inventing its own: nesting
// is flattened because every query is over one field at a time, but no field is
// renamed into a synonym, so a reader can hold this table and the emitter's
// schema in mind at once.
type Event struct {
	ID            string `gorm:"column:id;primaryKey"`
	SchemaVersion int    `gorm:"column:schema_version"`

	// Source is where the event entered Antenne: webhook, website, imap,
	// rss, test or system. It is not the provider.
	Source string `gorm:"column:source;index:idx_events_source"`

	EventProvider `gorm:"embedded"`
	EventSubject  `gorm:"embedded"`
	EventActor    `gorm:"embedded"`
	EventTiming   `gorm:"embedded"`
	EventContent  `gorm:"embedded"`
	EventPayload  `gorm:"embedded"`

	Quality string `gorm:"column:quality;index:idx_events_quality"`
}

// EventProvider is which Antenne provider an event came through. Embedded, not
// related: these are columns of events, split out so the row's identity and
// its provenance read apart.
type EventProvider struct {
	ProviderID   string `gorm:"column:provider_id"`
	ProviderType string `gorm:"column:provider_type;index:idx_events_provider_time,priority:1"`
	ProviderName string `gorm:"column:provider_name"`
	ProviderTags []byte `gorm:"column:provider_tags;type:jsonb"`
}

// EventSubject is what the event is about: a repository, a task, a deployment.
//
// EntityRef is the provider's own identifier for it, which is what entity
// resolution will key on rather than the display name — a repository that gets
// renamed is the same repository.
type EventSubject struct {
	EntityType string `gorm:"column:entity_type;index:idx_events_entity,priority:1"`
	EntityRef  string `gorm:"column:entity_ref"`
	EntityName string `gorm:"column:entity_name;index:idx_events_entity,priority:2"`
	EntityURL  string `gorm:"column:entity_url"`
}

// EventActor is who caused the event, when the source said.
type EventActor struct {
	ActorRef  string `gorm:"column:actor_ref"`
	ActorName string `gorm:"column:actor_name"`

	// ActorEmail is the address the source system reported, and it is not a
	// Facile identity.
	//
	// Antenne says so in its own envelope package: the value is whatever a
	// third-party payload happened to carry. It is stored because "what did
	// this person touch" is a real question, and it is named after what it is
	// so that nothing downstream joins it to an SSO account. Perception's
	// August roadmap claimed storing it would let Perception participate in
	// the suite event contract, which keys on a Facile identity. That claim
	// was wrong and this column does not fulfil it.
	ActorEmail string `gorm:"column:actor_email;index:idx_events_actor_email"`
}

// EventTiming is when the thing happened, was sent, and was heard.
type EventTiming struct {
	// OccurredAt is the ordering key for everything downstream. It is a real
	// timestamptz: the old corpus stored text and sorted 107 IMAP events into
	// the wrong place because unixepoch() returned NULL for each one.
	OccurredAt time.Time `gorm:"column:occurred_at;index:idx_events_occurred,sort:desc;index:idx_events_provider_time,priority:2,sort:desc"`
	EmittedAt  time.Time `gorm:"column:emitted_at"`
	IngestedAt time.Time `gorm:"column:ingested_at;autoCreateTime"`
}

// EventContent is what the event says, in the words a person would read.
type EventContent struct {
	EventType string `gorm:"column:event_type;index:idx_events_type"`
	Title     string `gorm:"column:title"`
	Summary   string `gorm:"column:summary"`
	URL       string `gorm:"column:url"`

	// SearchableText is what full-text and embeddings both read. It is built
	// once at ingest rather than assembled per query, so the two retrieval
	// halves can never disagree about what an event says.
	SearchableText string `gorm:"column:searchable_text"`
}

// EventPayload is the source's own data, and what may be kept of it.
type EventPayload struct {
	PayloadNormalized []byte `gorm:"column:payload_normalized;type:jsonb"`

	// PayloadRaw is the source's original body, kept only when the envelope
	// says it may be. Antenne strips it on targets configured without it, and
	// ingest checks the flag again rather than trusting that it did.
	PayloadRaw  []byte `gorm:"column:payload_raw;type:jsonb"`
	PayloadHash string `gorm:"column:payload_hash"`
	ContainsPII bool   `gorm:"column:contains_pii"`
}

func (Event) TableName() string { return "events" }

// IngestRejection is a delivery Perception refused.
//
// It exists so a misconfigured emitter is visible instead of silent. The old
// deployment rejected 243 of 9,598 deliveries and nobody could say why,
// because the only record was a status code the sender logged and nobody read.
type IngestRejection struct {
	ID     int64  `gorm:"column:id;primaryKey"`
	Reason string `gorm:"column:reason;index:idx_rejections_reason"`

	// EventID is the id the sender claimed, when it sent one. It is not a
	// foreign key: the whole point is that this row exists for deliveries
	// that never became events.
	EventID string `gorm:"column:event_id"`

	// SourceIPHash identifies a repeat offender without keeping an address.
	// Which emitter is misconfigured is answerable from a hash; who it
	// belongs to is not a question this table needs to answer.
	SourceIPHash string    `gorm:"column:source_ip_hash"`
	PayloadHash  string    `gorm:"column:payload_hash"`
	RejectedAt   time.Time `gorm:"column:rejected_at;autoCreateTime;index:idx_rejections_time,sort:desc"`
}

func (IngestRejection) TableName() string { return "ingest_rejections" }
