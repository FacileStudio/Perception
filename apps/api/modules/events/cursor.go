package events

import (
	"encoding/base64"
	"strings"
	"time"
)

// encodeCursor packs the sort key of the last row on a page.
//
// It carries both halves of the ordering because occurred_at is not unique: a
// git push that delivers four events in the same second would otherwise have
// three of them skipped by the next page's timestamp comparison.
func encodeCursor(occurredAt time.Time, id string) string {
	raw := occurredAt.UTC().Format(time.RFC3339Nano) + "|" + id
	return base64.RawURLEncoding.EncodeToString([]byte(raw))
}

// decodeCursor reads a cursor back, reporting whether it is one we issued.
func decodeCursor(cursor string) (time.Time, string, bool) {
	raw, err := base64.RawURLEncoding.DecodeString(cursor)
	if err != nil {
		return time.Time{}, "", false
	}
	timestamp, id, found := strings.Cut(string(raw), "|")
	if !found || id == "" {
		return time.Time{}, "", false
	}
	occurredAt, err := time.Parse(time.RFC3339Nano, timestamp)
	if err != nil {
		return time.Time{}, "", false
	}
	return occurredAt, id, true
}
