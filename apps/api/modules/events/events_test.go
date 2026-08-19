package events

import (
	"context"
	"encoding/base64"
	"testing"
	"time"

	"github.com/FacileStudio/Perception/apps/api/schemas"

	"gorm.io/gorm"
)

func TestCursorRoundTrips(t *testing.T) {
	occurredAt := time.Date(2026, 8, 19, 10, 30, 0, 123456789, time.UTC)

	decoded, id, ok := decodeCursor(encodeCursor(occurredAt, "evt_1"))
	if !ok {
		t.Fatal("a cursor this package issued was refused")
	}
	if !decoded.Equal(occurredAt) {
		t.Errorf("time = %s, want %s; sub-second precision is what separates events in one push", decoded, occurredAt)
	}
	if id != "evt_1" {
		t.Errorf("id = %q, want evt_1", id)
	}
}

// encodeRaw builds a cursor body the way encodeCursor does, so a malformed
// case is malformed in its content rather than in its encoding.
func encodeRaw(raw string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(raw))
}

func TestAForgedCursorIsRefused(t *testing.T) {
	for name, cursor := range map[string]string{
		"not base64":   "!!!!",
		"no separator": encodeRaw("2026-08-19T10:30:00Z"),
		"no id":        encodeRaw("2026-08-19T10:30:00Z|"),
		"bad time":     encodeRaw("yesterday|evt_1"),
	} {
		if _, _, ok := decodeCursor(cursor); ok {
			t.Errorf("%s was accepted", name)
		}
	}
}

// seed writes events one second apart, newest last.
func seed(t *testing.T, db *gorm.DB, events ...schemas.Event) {
	t.Helper()
	for _, event := range events {
		if err := db.Create(&event).Error; err != nil {
			t.Fatalf("seeding %s: %v", event.ID, err)
		}
	}
}

func event(id, provider, entity string, occurredAt time.Time) schemas.Event {
	return schemas.Event{
		ID:            id,
		Quality:       schemas.QualityComplete,
		EventProvider: schemas.EventProvider{ProviderType: provider},
		EventSubject:  schemas.EventSubject{EntityType: "repository", EntityName: entity},
		EventTiming:   schemas.EventTiming{OccurredAt: occurredAt, EmittedAt: occurredAt},
		EventContent:  schemas.EventContent{EventType: "git.push", SearchableText: entity},
	}
}

// occurred_at is not unique: a git push delivering four events in one second
// is the case an offset-free cursor has to survive, and a timestamp-only
// cursor would drop three of them.
func TestPagingDoesNotSkipEventsSharingATimestamp(t *testing.T) {
	db := testDB(t)
	same := time.Date(2026, 8, 19, 10, 0, 0, 0, time.UTC)
	seed(t, db,
		event("evt_a", "git", "one", same),
		event("evt_b", "git", "two", same),
		event("evt_c", "git", "three", same),
		event("evt_d", "git", "four", same),
	)

	service := NewService(db)
	seen := map[string]bool{}
	cursor := ""

	for range 4 {
		page, err := service.List(context.Background(), Filter{Limit: 2, Cursor: cursor})
		if err != nil {
			t.Fatalf("list: %v", err)
		}
		for _, summary := range page.Events {
			if seen[summary.ID] {
				t.Errorf("%s was returned twice", summary.ID)
			}
			seen[summary.ID] = true
		}
		cursor = page.NextCursor
		if cursor == "" {
			break
		}
	}

	if len(seen) != 4 {
		t.Errorf("paged over %d of 4 events sharing a timestamp: %v", len(seen), seen)
	}
}

func TestListingIsNewestFirstAndFilters(t *testing.T) {
	db := testDB(t)
	base := time.Date(2026, 8, 19, 10, 0, 0, 0, time.UTC)
	seed(t, db,
		event("evt_old", "git", "Perception", base),
		event("evt_mid", "dokploy", "Perception", base.Add(time.Minute)),
		event("evt_new", "git", "Vision", base.Add(2*time.Minute)),
	)
	service := NewService(db)
	ctx := context.Background()

	page, err := service.List(ctx, Filter{})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(page.Events) != 3 || page.Events[0].ID != "evt_new" {
		t.Errorf("listing = %+v, want three events newest first", page.Events)
	}
	if page.NextCursor != "" {
		t.Error("a complete listing returned a next cursor")
	}

	filtered, err := service.List(ctx, Filter{Provider: "git"})
	if err != nil {
		t.Fatalf("filtered list: %v", err)
	}
	if len(filtered.Events) != 2 {
		t.Errorf("provider filter returned %d events, want 2", len(filtered.Events))
	}

	byEntity, err := service.List(ctx, Filter{Entity: "percep"})
	if err != nil {
		t.Fatalf("entity list: %v", err)
	}
	if len(byEntity.Events) != 2 {
		t.Errorf("entity substring returned %d events, want 2", len(byEntity.Events))
	}

	window, err := service.List(ctx, Filter{Since: base.Add(30 * time.Second)})
	if err != nil {
		t.Fatalf("windowed list: %v", err)
	}
	if len(window.Events) != 2 {
		t.Errorf("since filter returned %d events, want 2", len(window.Events))
	}
}

func TestGetReturnsNotFoundForAnUnknownID(t *testing.T) {
	service := NewService(testDB(t))
	if _, err := service.Get(context.Background(), "nope"); err == nil {
		t.Fatal("an unknown id returned an event")
	}
}
