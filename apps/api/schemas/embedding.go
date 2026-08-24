package schemas

import (
	"database/sql/driver"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// EmbeddingDimensions is the vector width of voyage-4-lite and of the column
// the HNSW index is built on. Changing it is a migration plus a re-embed of
// everything, not a config flip.
const EmbeddingDimensions = 1024

// EmbeddingModel is the only embedding model this deployment speaks.
const EmbeddingModel = "voyage-4-lite"

// MaxEmbeddingAttempts is the retry ceiling after which an embedding row goes
// to a terminal error instead of cycling forever. The worker reads it; it
// lives here because the column it bounds does.
const MaxEmbeddingAttempts = 5

// Vector is a pgvector value stored as vector(1024). Hand-rolled rather than a
// dependency because the wire format is two brackets and a comma list.
type Vector []float32

func (v Vector) Value() (driver.Value, error) {
	if v == nil {
		return nil, nil
	}
	if len(v) != EmbeddingDimensions {
		return nil, fmt.Errorf("embedding has %d dimensions, want %d", len(v), EmbeddingDimensions)
	}
	var sb strings.Builder
	sb.WriteByte('[')
	for i, f := range v {
		if i > 0 {
			sb.WriteByte(',')
		}
		sb.WriteString(strconv.FormatFloat(float64(f), 'g', -1, 32))
	}
	sb.WriteByte(']')
	return sb.String(), nil
}

func (v *Vector) Scan(src any) error {
	if src == nil {
		*v = nil
		return nil
	}
	text, ok := src.(string)
	if !ok {
		raw, ok := src.([]byte)
		if !ok {
			return fmt.Errorf("cannot scan %T into Vector", src)
		}
		text = string(raw)
	}
	trimmed := strings.TrimSuffix(strings.TrimPrefix(strings.TrimSpace(text), "["), "]")
	if trimmed == "" {
		*v = Vector{}
		return nil
	}
	parts := strings.Split(trimmed, ",")
	parsed := make(Vector, 0, len(parts))
	for _, part := range parts {
		f, err := strconv.ParseFloat(strings.TrimSpace(part), 32)
		if err != nil {
			return fmt.Errorf("parse vector component: %w", err)
		}
		parsed = append(parsed, float32(f))
	}
	if len(parsed) != EmbeddingDimensions {
		return fmt.Errorf("embedding has %d dimensions, want %d", len(parsed), EmbeddingDimensions)
	}
	*v = parsed
	return nil
}

// EventEmbedding is the per-event embedding state machine. Status moves
// pending -> ready, or pending -> error after MaxEmbeddingAttempts; a row that
// sits pending is the backlog the readiness check watches.
type EventEmbedding struct {
	EventID       string     `gorm:"column:event_id;primaryKey"`
	Embedding     Vector     `gorm:"column:embedding;type:public.vector(1024)"`
	Model         string     `gorm:"column:model;size:64"`
	InputHash     string     `gorm:"column:input_hash"`
	Status        string     `gorm:"column:status;size:16;default:pending;index"`
	Attempts      int        `gorm:"column:attempts;default:0"`
	LastAttemptAt *time.Time `gorm:"column:last_attempt_at"`
	LastError     *string    `gorm:"column:last_error"`
	EmbeddedAt    *time.Time `gorm:"column:embedded_at"`
	CreatedAt     time.Time  `gorm:"column:created_at;autoCreateTime"`
}

func (EventEmbedding) TableName() string { return "event_embeddings" }
