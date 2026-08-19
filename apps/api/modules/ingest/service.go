package ingest

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"time"

	"github.com/FacileStudio/Perception/apps/api/schemas"
	"github.com/FacileStudio/tronc/errors"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Service stores accepted events and records refused deliveries.
type Service struct {
	orm *gorm.DB
}

// NewService wires the service to the database.
func NewService(orm *gorm.DB) *Service {
	return &Service{orm: orm}
}

// Store writes an event, treating a resend as an update rather than a clash.
//
// Replay protection here is deduplication, not a nonce cache. The event id is
// the primary key, so a delivery that arrives twice lands on the same row and
// answers the same way. That is what lets an emitter retry a delivery whose
// response it never saw — and it is worth saying plainly, because the old
// README claimed a replay window the code never implemented.
func (s *Service) Store(ctx context.Context, event schemas.Event) (bool, error) {
	var existing int64
	if err := s.orm.WithContext(ctx).Model(&schemas.Event{}).
		Where("id = ?", event.ID).Count(&existing).Error; err != nil {
		return false, errors.Internal("failed to check for an existing event", err)
	}

	err := s.orm.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "id"}},
		UpdateAll: true,
	}).Omit("ingested_at").Create(&event).Error
	if err != nil {
		return false, errors.Internal("failed to store the event", err)
	}
	return existing > 0, nil
}

// Reject records a refused delivery.
//
// It never returns an error to the caller's path. A rejection that cannot be
// written is worth a log line, but failing the response because the audit
// trail failed would turn a bad delivery into a retry storm.
func (s *Service) Reject(ctx context.Context, reason, eventID, clientIP string, body []byte) {
	rejection := schemas.IngestRejection{
		Reason:       reason,
		EventID:      eventID,
		SourceIPHash: hashIP(clientIP),
		PayloadHash:  hashOf(body),
		RejectedAt:   time.Now().UTC(),
	}
	_ = s.orm.WithContext(ctx).Create(&rejection).Error
}

// Rejections lists recent refused deliveries, newest first.
func (s *Service) Rejections(ctx context.Context, limit int) ([]schemas.IngestRejection, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var rejections []schemas.IngestRejection
	err := s.orm.WithContext(ctx).
		Order("rejected_at DESC").Limit(limit).Find(&rejections).Error
	if err != nil {
		return nil, errors.Internal("failed to list rejections", err)
	}
	return rejections, nil
}

// hashIP identifies a repeat offender without storing an address.
//
// Which emitter is misconfigured is answerable from a hash. Whose address it
// is, is not a question this table needs to answer, and an address it does not
// hold is one that cannot leak from it.
func hashIP(address string) string {
	if address == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(address))
	return hex.EncodeToString(sum[:])
}
