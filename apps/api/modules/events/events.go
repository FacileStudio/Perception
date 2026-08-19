// Package events is the browsable view of the corpus.
//
// It exists in phase one, before any retrieval, on purpose: the roadmap's open
// question is whether a good filtered list answers the operational questions
// without an LLM at all. That is cheaper to find out than to argue about, and
// it needs a list to find out with.
package events

import (
	"context"
	"strings"
	"time"

	"github.com/FacileStudio/Perception/apps/api/schemas"
	"github.com/FacileStudio/tronc/errors"

	"gorm.io/gorm"
)

// Service reads events.
type Service struct {
	orm *gorm.DB
}

// NewService wires the service to the database.
func NewService(orm *gorm.DB) *Service {
	return &Service{orm: orm}
}

// Filter narrows a listing. Every field is optional and they combine with AND.
type Filter struct {
	Provider string
	Type     string
	Entity   string
	Actor    string
	Quality  string
	Since    time.Time
	Until    time.Time
	Limit    int
	Cursor   string
}

// Page is one screen of events plus how to ask for the next.
type Page struct {
	Events []Summary `json:"events"`

	// NextCursor is empty on the last page. It is an opaque id rather than
	// an offset: an offset re-reads rows that shifted under it, which on a
	// table that only grows means silently skipping events.
	NextCursor string `json:"next_cursor,omitempty"`
}

// Summary is an event as a list shows it.
//
// The payload is deliberately absent. A listing that carries every raw body is
// a listing nobody can read and a response nobody should have to download to
// see what happened.
type Summary struct {
	ID         string    `json:"id"`
	OccurredAt time.Time `json:"occurred_at"`
	Provider   string    `json:"provider"`
	EventType  string    `json:"event_type"`
	EntityType string    `json:"entity_type"`
	EntityName string    `json:"entity_name"`
	ActorName  string    `json:"actor_name"`
	Title      string    `json:"title"`
	Summary    string    `json:"summary"`
	URL        string    `json:"url"`
	Quality    string    `json:"quality"`
}

// defaultLimit and maxLimit bound a page.
const (
	defaultLimit = 50
	maxLimit     = 200
)

// List returns events newest first.
//
// The ordering is (occurred_at DESC, id DESC) and the cursor carries both,
// because occurred_at is not unique — a git push delivering four events in one
// second would otherwise drop three of them from the next page.
func (s *Service) List(ctx context.Context, filter Filter) (*Page, error) {
	limit := filter.Limit
	if limit <= 0 || limit > maxLimit {
		limit = defaultLimit
	}

	query := s.apply(s.orm.WithContext(ctx).Model(&schemas.Event{}), filter)
	if filter.Cursor != "" {
		occurredAt, id, ok := decodeCursor(filter.Cursor)
		if !ok {
			return nil, errors.Invalid("the cursor is not one this API issued")
		}
		query = query.Where("(occurred_at, id) < (?, ?)", occurredAt, id)
	}

	var events []schemas.Event
	err := query.Order("occurred_at DESC, id DESC").Limit(limit + 1).Find(&events).Error
	if err != nil {
		return nil, errors.Internal("failed to list events", err)
	}

	page := &Page{Events: make([]Summary, 0, limit)}
	if len(events) > limit {
		last := events[limit-1]
		page.NextCursor = encodeCursor(last.OccurredAt, last.ID)
		events = events[:limit]
	}
	for _, event := range events {
		page.Events = append(page.Events, summarise(event))
	}
	return page, nil
}

// Get returns one event in full, payload included.
func (s *Service) Get(ctx context.Context, id string) (*schemas.Event, error) {
	var event schemas.Event
	err := s.orm.WithContext(ctx).Where("id = ?", id).First(&event).Error
	switch {
	case err == gorm.ErrRecordNotFound:
		return nil, errors.NotFound("no event with that id")
	case err != nil:
		return nil, errors.Internal("failed to load the event", err)
	}
	return &event, nil
}

// apply adds the filters to a query.
func (s *Service) apply(query *gorm.DB, filter Filter) *gorm.DB {
	if filter.Provider != "" {
		query = query.Where("provider_type = ?", filter.Provider)
	}
	if filter.Type != "" {
		query = query.Where("event_type = ?", filter.Type)
	}
	if filter.Entity != "" {
		query = query.Where("entity_name ILIKE ?", "%"+filter.Entity+"%")
	}
	if filter.Actor != "" {
		query = query.Where("actor_email = ?", strings.ToLower(filter.Actor))
	}
	if filter.Quality != "" {
		query = query.Where("quality = ?", filter.Quality)
	}
	if !filter.Since.IsZero() {
		query = query.Where("occurred_at >= ?", filter.Since)
	}
	if !filter.Until.IsZero() {
		query = query.Where("occurred_at <= ?", filter.Until)
	}
	return query
}

// summarise reduces an event to what a listing shows.
func summarise(event schemas.Event) Summary {
	return Summary{
		ID:         event.ID,
		OccurredAt: event.OccurredAt,
		Provider:   event.ProviderType,
		EventType:  event.EventType,
		EntityType: event.EntityType,
		EntityName: event.EntityName,
		ActorName:  event.ActorName,
		Title:      event.Title,
		Summary:    event.Summary,
		URL:        event.URL,
		Quality:    event.Quality,
	}
}
