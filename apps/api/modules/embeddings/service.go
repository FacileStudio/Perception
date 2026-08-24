package embeddings

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"log/slog"
	"strconv"
	"time"

	"github.com/FacileStudio/Perception/apps/api/schemas"

	"gorm.io/gorm"
)

// The old TypeScript worker stalled at 698 of 9,355 embedded and nothing
// noticed for months. Every constant here exists so that failure mode is
// impossible: bounded retries, a visible error status, and a backlog the
// readiness endpoint reports as degraded.
const (
	tickEvery      = 30 * time.Second
	maxBackoff     = time.Hour
	stallAfter     = 15 * time.Minute
	pendingCeiling = 5000
)

// Service owns the embedding state machine: claiming pending rows, calling
// Voyage, and reporting coverage. It tolerates a nil database handle until a
// request or tick arrives, which keeps the route-coverage test database-free.
type Service struct {
	db      *gorm.DB
	logger  *slog.Logger
	voyage  *voyageClient
	enabled bool
}

// NewService builds the embedding worker's state machine. An empty API key
// leaves it disabled: no worker goroutine, green readiness, honest status.
func NewService(db *gorm.DB, logger *slog.Logger, apiKey string) *Service {
	return &Service{
		db:      db,
		logger:  logger,
		voyage:  newVoyageClient(apiKey),
		enabled: apiKey != "" && db != nil,
	}
}

// StartWorker runs the drain loop until ctx is cancelled. Without an API key
// it does not start at all; Status then reports enabled=false rather than
// pretending work is happening.
func (service *Service) StartWorker(ctx context.Context) {
	if !service.enabled {
		service.logger.Info("embedding worker disabled; VOYAGE_API_KEY not set")
		return
	}
	go service.loop(ctx)
}

func (service *Service) loop(ctx context.Context) {
	ticker := time.NewTicker(tickEvery)
	defer ticker.Stop()

	service.tick(ctx)
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			service.tick(ctx)
		}
	}
}

type claimedRow struct {
	EventID        string
	InputHash      string
	SearchableText string
	Attempts       int
	LastAttemptAt  *time.Time
}

// candidateScanWindow bounds the candidate fetch. It is deliberately wider
// than one batch: rows inside their backoff window sit in front of eligible
// ones in occurred_at order, so the Go-side eligibility filter needs slack to
// find a full batch.
const candidateScanWindow = batchSize * 20

func eligibleForRetry(rows []claimedRow, now time.Time) []claimedRow {
	kept := make([]claimedRow, 0, len(rows))
	for _, row := range rows {
		if row.LastAttemptAt == nil || now.Sub(*row.LastAttemptAt) >= nextEligibleWindow(row.Attempts) {
			kept = append(kept, row)
		}
	}
	return kept
}

// nextEligibleWindow is how long a row waits after an attempt before it can
// be claimed again: exponential in the current attempt count, capped so a
// poisoned row still gets its full retry budget inside a bounded span.
func nextEligibleWindow(attempts int) time.Duration {
	window := tickEvery << attempts
	if window > maxBackoff {
		return maxBackoff
	}
	return window
}

// tick backfills missing rows and drains up to batchSize pending events whose
// last attempt is older than their backoff window.
func (service *Service) tick(ctx context.Context) {
	if err := service.backfillMissing(ctx); err != nil {
		service.logger.Error("embedding backfill failed", slog.Any("error", err))
		return
	}
	if err := service.drainBatch(ctx); err != nil {
		service.logger.Error("embedding batch failed", slog.Any("error", err))
	}
}

func (service *Service) backfillMissing(ctx context.Context) error {
	result := service.db.WithContext(ctx).Exec(`
		INSERT INTO event_embeddings (event_id, model, input_hash, status, attempts)
		SELECT id, ?, ?, 'pending', 0 FROM events
		WHERE NOT EXISTS (SELECT 1 FROM event_embeddings WHERE event_id = events.id)`,
		schemas.EmbeddingModel, "")
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected > 0 {
		service.logger.Info("queued new events for embedding", slog.Int64("count", result.RowsAffected))
	}
	return nil
}

func (service *Service) drainBatch(ctx context.Context) error {
	var rows []claimedRow
	err := service.db.WithContext(ctx).Raw(`
		SELECT ee.event_id, ee.input_hash, e.searchable_text, ee.attempts, ee.last_attempt_at
		FROM event_embeddings ee JOIN events e ON e.id = ee.event_id
		WHERE ee.status = 'pending' AND ee.attempts < ?
		ORDER BY e.occurred_at ASC LIMIT ?`,
		schemas.MaxEmbeddingAttempts, candidateScanWindow).Scan(&rows).Error
	if err != nil || len(rows) == 0 {
		return err
	}

	rows = eligibleForRetry(rows, time.Now().UTC())
	if len(rows) > batchSize {
		rows = rows[:batchSize]
	}

	inputs := make([]string, len(rows))
	hashes := make([]string, len(rows))
	for i, row := range rows {
		inputs[i] = row.SearchableText
		sum := sha256.Sum256([]byte(inputs[i]))
		hashes[i] = hex.EncodeToString(sum[:])
	}

	embeddings, embedErr := service.voyage.embed(ctx, inputs)

	now := time.Now().UTC()
	for i, row := range rows {
		update := map[string]any{"attempts": row.Attempts + 1, "input_hash": hashes[i], "last_attempt_at": now}
		if embedErr == nil {
			update["embedding"] = schemas.Vector(embeddings[i])
			update["status"] = "ready"
			update["model"] = schemas.EmbeddingModel
			update["last_error"] = nil
			update["embedded_at"] = now
		} else if row.Attempts+1 >= schemas.MaxEmbeddingAttempts {
			message := truncateError(embedErr.Error())
			update["status"] = "error"
			update["last_error"] = message
		} else {
			message := truncateError(embedErr.Error())
			update["last_error"] = message
		}
		if err := service.db.WithContext(ctx).Model(&schemas.EventEmbedding{}).
			Where("event_id = ?", row.EventID).Updates(update).Error; err != nil {
			service.logger.Error("failed to update embedding row",
				slog.Any("error", err), slog.String("event_id", row.EventID))
		}
	}

	if embedErr != nil {
		return embedErr
	}
	service.logger.Info("embedded events", slog.Int("count", len(rows)))
	return nil
}

func truncateError(message string) string {
	runes := []rune(message)
	if len(runes) > 512 {
		return string(runes[:512])
	}
	return message
}

// ReadyCheck fails when the backlog looks stalled: more than pendingCeiling
// rows pending, the oldest pending row older than stallAfter while the worker
// is supposed to be draining, or any terminal errors. With embeddings disabled
// it passes — that is configuration, not degradation.
func (service *Service) ReadyCheck() func(context.Context) error {
	return func(_ context.Context) error {
		status := service.computeStatus()
		if !status.Enabled || !status.Degraded {
			return nil
		}
		message := "embedding backlog degraded: " + strconv.FormatInt(status.Pending, 10) + " pending"
		if status.Error > 0 {
			message += ", " + strconv.FormatInt(status.Error, 10) + " terminal errors"
		}
		if status.OldestPending != nil {
			message += ", oldest " + *status.OldestPending
		}
		return &stallError{message}
	}
}

type stallError struct{ message string }

func (e *stallError) Error() string { return e.message }

func (service *Service) computeStatus() StatusResponse {
	if !service.enabled || service.db == nil {
		return StatusResponse{Enabled: false, Model: schemas.EmbeddingModel, StallThreshold: describeThresholds()}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	var counts struct {
		Pending int64
		Ready   int64
		Error   int64
	}
	service.db.WithContext(ctx).Raw(`SELECT
		count(*) FILTER (WHERE status = 'pending') AS pending,
		count(*) FILTER (WHERE status = 'ready') AS ready,
		count(*) FILTER (WHERE status = 'error') AS error
		FROM event_embeddings`).Scan(&counts)

	var totals struct {
		Total int64
	}
	service.db.WithContext(ctx).Raw(`SELECT count(*) AS total FROM events`).Scan(&totals)

	response := StatusResponse{
		Enabled:        true,
		Model:          schemas.EmbeddingModel,
		Pending:        counts.Pending,
		Ready:          counts.Ready,
		Error:          counts.Error,
		TotalEvents:    totals.Total,
		StallThreshold: describeThresholds(),
	}
	if totals.Total > 0 {
		response.Coverage = float64(counts.Ready) / float64(totals.Total)
	}

	var oldestRow struct {
		Oldest sql.NullTime
	}
	service.db.WithContext(ctx).Raw(`SELECT min(created_at) AS oldest FROM event_embeddings WHERE status = 'pending'`).Scan(&oldestRow)
	oldest := oldestRow.Oldest
	if counts.Pending > 0 && oldest.Valid {
		age := time.Since(oldest.Time).Round(time.Second).String()
		response.OldestPending = &age
	}

	response.Degraded = counts.Pending > pendingCeiling ||
		(counts.Pending > 0 && oldest.Valid && time.Since(oldest.Time) > stallAfter) ||
		counts.Error > 0
	return response
}

func describeThresholds() string {
	return "degraded above " + strconv.FormatInt(pendingCeiling, 10) + " pending, oldest pending older than " + stallAfter.String() + ", or any terminal errors"
}

// Status answers GET /api/embeddings/status.
func (service *Service) Status() StatusResponse {
	return service.computeStatus()
}
