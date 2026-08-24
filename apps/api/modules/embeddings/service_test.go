package embeddings

import (
	"log/slog"
	"testing"
	"time"

	"github.com/FacileStudio/tronc/logger"
)

func discardLogger() *slog.Logger {
	return logger.New(logger.Config{Level: "error"})
}

// nextEligibleWindow must grow monotonically so a flapping Voyage outage
// cannot burn the whole retry budget inside a couple of minutes, and must cap
// so a poisoned row still reaches its terminal state within a bounded span.
func TestNextEligibleWindowGrowsAndCaps(t *testing.T) {
	previous := time.Duration(0)
	for attempts := range 8 {
		window := nextEligibleWindow(attempts)
		if window <= previous {
			t.Fatalf("window for %d attempts (%v) not greater than for fewer attempts (%v)", attempts, window, previous)
		}
		previous = window
	}
	for attempts := 7; attempts < 12; attempts++ {
		if window := nextEligibleWindow(attempts); window != maxBackoff {
			t.Fatalf("window for %d attempts = %v, want the %v cap", attempts, window, maxBackoff)
		}
	}
}

// A service without an API key is configuration, not degradation: the worker
// never starts, /ready stays green, and Status says enabled=false instead of
// pretending work is happening.
func TestDisabledServiceNeverDegrades(t *testing.T) {
	service := NewService(nil, discardLogger(), "")
	if service.enabled {
		t.Fatal("a missing API key must not leave the worker enabled")
	}
	if err := service.ReadyCheck()(nil); err != nil {
		t.Fatalf("readiness with embeddings disabled: %v", err)
	}
	status := service.Status()
	if status.Enabled || status.Degraded {
		t.Fatalf("disabled service reported enabled=%v degraded=%v", status.Enabled, status.Degraded)
	}
}

func TestEligibleForRetryHonoursTheBackoffWindow(t *testing.T) {
	now := time.Now().UTC()
	rows := []claimedRow{
		{EventID: "never-tried", Attempts: 0},
		{EventID: "just-failed", Attempts: 1, LastAttemptAt: ptrTime(now.Add(-10 * time.Second))},
		{EventID: "waited-long-enough", Attempts: 1, LastAttemptAt: ptrTime(now.Add(-(nextEligibleWindow(1) + time.Second)))},
		{EventID: "deep-backoff-not-due", Attempts: 3, LastAttemptAt: ptrTime(now.Add(-time.Minute))},
	}

	kept := eligibleForRetry(rows, now)
	got := make(map[string]bool)
	for _, row := range kept {
		got[row.EventID] = true
	}
	if !got["never-tried"] || !got["waited-long-enough"] {
		t.Fatalf("eligible rows missing: %v", got)
	}
	if got["just-failed"] || got["deep-backoff-not-due"] {
		t.Fatalf("rows inside their backoff window were claimed: %v", got)
	}
}

func ptrTime(t time.Time) *time.Time { return &t }
