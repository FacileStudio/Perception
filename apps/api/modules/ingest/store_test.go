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

// The rejection log is fed by an unauthenticated endpoint, so it needs a
// ceiling and not only an age policy: an age rule bounds how long a flood's
// rows live, never how many arrive inside the window.
func TestPruneBoundsTheLogByCountAndByAge(t *testing.T) {
	service := NewService(testDB(t))
	ctx := context.Background()

	stale := time.Now().UTC().Add(-30 * 24 * time.Hour)
	rows := make([]schemas.IngestRejection, 0, 12)
	for index := range 12 {
		row := schemas.IngestRejection{Reason: ReasonBadSignature, RejectedAt: time.Now().UTC()}
		if index < 4 {
			row.RejectedAt = stale
		}
		rows = append(rows, row)
	}
	if err := service.orm.Create(&rows).Error; err != nil {
		t.Fatalf("seeding: %v", err)
	}

	if _, err := service.Prune(ctx); err != nil {
		t.Fatalf("prune: %v", err)
	}

	var remaining int64
	service.orm.Model(&schemas.IngestRejection{}).Count(&remaining)
	if remaining != 8 {
		t.Errorf("kept %d rows, want the 8 recent ones and none of the 4 stale", remaining)
	}
}

// A refusal for a missing secret describes Perception, not the sender — and it
// is true of every request while unconfigured, so recording it fills the log
// with rows that diagnose nothing.
func TestTheReasonsWorthRecordingExcludeOurOwnMisconfiguration(t *testing.T) {
	if recordable(ReasonNoSecret) {
		t.Error("a missing ingest secret is recorded; it describes this instance, not the emitter")
	}
	for _, reason := range []string{
		ReasonBadSignature, ReasonTimestampSkew, ReasonBadSchemaVersion,
		ReasonMalformedBody, ReasonMissingHeaders, ReasonTooLarge,
	} {
		if !recordable(reason) {
			t.Errorf("%s is not recorded; it is a signal about the emitter", reason)
		}
	}
}
