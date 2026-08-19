package ingest

import (
	"context"
	"testing"
	"time"

	"github.com/FacileStudio/Perception/apps/api/schemas"
)

// A resend is an idempotent upsert, which is what lets an emitter retry a
// delivery whose response it never saw.
func TestAResendUpdatesRatherThanClashing(t *testing.T) {
	service := NewService(testDB(t))
	ctx := context.Background()

	event := toEvent(full(), []byte(`{}`), now)
	duplicate, err := service.Store(ctx, event)
	if err != nil {
		t.Fatalf("first store: %v", err)
	}
	if duplicate {
		t.Error("the first delivery was reported as a duplicate")
	}

	event.Title = "changed on retry"
	duplicate, err = service.Store(ctx, event)
	if err != nil {
		t.Fatalf("resend: %v", err)
	}
	if !duplicate {
		t.Error("the resend was not reported as a duplicate")
	}

	var stored schemas.Event
	if err := service.orm.Where("id = ?", event.ID).First(&stored).Error; err != nil {
		t.Fatalf("reading back: %v", err)
	}
	if stored.Title != "changed on retry" {
		t.Errorf("title = %q, want the resend to have updated the row", stored.Title)
	}

	var count int64
	service.orm.Model(&schemas.Event{}).Count(&count)
	if count != 1 {
		t.Errorf("stored %d rows, want 1", count)
	}
}

// ingested_at records when Perception first heard about an event, and a retry
// does not change that.
func TestAResendDoesNotMoveTheIngestTime(t *testing.T) {
	service := NewService(testDB(t))
	ctx := context.Background()

	event := toEvent(full(), []byte(`{}`), now)
	if _, err := service.Store(ctx, event); err != nil {
		t.Fatalf("first store: %v", err)
	}

	var first schemas.Event
	service.orm.Where("id = ?", event.ID).First(&first)

	time.Sleep(10 * time.Millisecond)
	event.IngestedAt = time.Now().UTC().Add(time.Hour)
	if _, err := service.Store(ctx, event); err != nil {
		t.Fatalf("resend: %v", err)
	}

	var second schemas.Event
	service.orm.Where("id = ?", event.ID).First(&second)
	if !second.IngestedAt.Equal(first.IngestedAt) {
		t.Errorf("ingested at moved from %s to %s on a resend", first.IngestedAt, second.IngestedAt)
	}
}

// The generated tsvector is the half of retrieval that phase three builds on,
// and it is raw DDL that GORM tags cannot express — so it is worth proving it
// exists and fills itself.
func TestTheSearchVectorIsPopulatedByTheDatabase(t *testing.T) {
	service := NewService(testDB(t))

	event := toEvent(full(), []byte(`{}`), now)
	if _, err := service.Store(context.Background(), event); err != nil {
		t.Fatalf("store: %v", err)
	}

	var matches int64
	err := service.orm.Model(&schemas.Event{}).
		Where("search @@ websearch_to_tsquery('simple', ?)", "Perception").
		Count(&matches).Error
	if err != nil {
		t.Fatalf("full-text query: %v", err)
	}
	if matches != 1 {
		t.Errorf("full-text search matched %d rows, want 1", matches)
	}
}

func TestRejectionsAreRecordedWithoutTheAddress(t *testing.T) {
	service := NewService(testDB(t))
	ctx := context.Background()

	service.Reject(ctx, ReasonBadSignature, "evt_1", "203.0.113.7", []byte(`{"a":1}`))

	rejections, err := service.Rejections(ctx, 0)
	if err != nil {
		t.Fatalf("listing rejections: %v", err)
	}
	if len(rejections) != 1 {
		t.Fatalf("recorded %d rejections, want 1", len(rejections))
	}

	recorded := rejections[0]
	if recorded.Reason != ReasonBadSignature || recorded.EventID != "evt_1" {
		t.Errorf("rejection = %+v, want the reason and the claimed id", recorded)
	}
	if recorded.SourceIPHash == "" || recorded.SourceIPHash == "203.0.113.7" {
		t.Errorf("source ip = %q, want a hash and not the address", recorded.SourceIPHash)
	}
	if recorded.PayloadHash == "" {
		t.Error("no payload hash was recorded")
	}
}
