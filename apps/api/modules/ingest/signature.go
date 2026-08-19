package ingest

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"strconv"
	"strings"
	"time"
)

// signaturePrefix is the algorithm marker Antenne puts on the header.
const signaturePrefix = "sha256="

// verify checks a delivery's signature against every configured secret.
//
// The signature covers `{timestamp}.{eventId}.{rawBody}` and all three are
// bound deliberately: a receiver that signs only the body cannot tell a replay
// of an old event under a fresh timestamp from a new one, and the timestamp is
// what makes bounding the age of an accepted request possible at all.
//
// Comparison is constant time, and every secret is tried even after one
// matches: returning early would let the response time reveal which key was in
// use, which is exactly what a rotation is hiding.
//
// body must be the bytes exactly as received. Verifying a re-encoded payload
// compares a signature against something the sender never signed, and it fails
// intermittently — whenever a map happens to marshal in a different order.
func verify(secrets []string, timestamp, eventID string, body []byte, signature string) bool {
	provided, found := strings.CutPrefix(signature, signaturePrefix)
	if !found {
		return false
	}
	expected, err := hex.DecodeString(provided)
	if err != nil {
		return false
	}

	for _, secret := range secrets {
		if secret == "" {
			continue
		}
		mac := hmac.New(sha256.New, []byte(secret))
		mac.Write([]byte(timestamp))
		mac.Write([]byte("."))
		mac.Write([]byte(eventID))
		mac.Write([]byte("."))
		mac.Write(body)

		if hmac.Equal(mac.Sum(nil), expected) {
			return true
		}
	}
	return false
}

// withinSkew reports whether a delivery's timestamp is close enough to now.
//
// The window is symmetric because clocks drift in both directions, and a
// sender running ahead is no more suspicious than one running behind.
func withinSkew(timestamp string, skew time.Duration, now time.Time) bool {
	seconds, err := strconv.ParseInt(strings.TrimSpace(timestamp), 10, 64)
	if err != nil {
		return false
	}
	difference := now.Sub(time.Unix(seconds, 0))
	if difference < 0 {
		difference = -difference
	}
	return difference <= skew
}
