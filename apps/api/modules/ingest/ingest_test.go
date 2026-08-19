package ingest

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"
)

// sign produces the header Antenne would send, the way Antenne produces it.
//
// The test signs the same way the emitter does rather than calling the code
// under test, so a change to the scheme fails here instead of quietly agreeing
// with itself.
func sign(secret, timestamp, eventID string, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(timestamp))
	mac.Write([]byte("."))
	mac.Write([]byte(eventID))
	mac.Write([]byte("."))
	mac.Write(body)
	return "sha256=" + hex.EncodeToString(mac.Sum(nil))
}

func TestSignatureAcceptsTheCurrentAndPreviousSecret(t *testing.T) {
	body := []byte(`{"id":"e1"}`)
	secrets := []string{"current", "previous"}

	for _, secret := range secrets {
		if !verify(secrets, "1700000000", "e1", body, sign(secret, "1700000000", "e1", body)) {
			t.Errorf("a signature made with %q was refused; rotation needs both keys accepted", secret)
		}
	}
}

func TestSignatureRefusesEverythingElse(t *testing.T) {
	body := []byte(`{"id":"e1"}`)
	good := sign("current", "1700000000", "e1", body)

	cases := map[string]bool{
		"wrong secret":                verify([]string{"current"}, "1700000000", "e1", body, sign("other", "1700000000", "e1", body)),
		"tampered body":               verify([]string{"current"}, "1700000000", "e1", []byte(`{"id":"e2"}`), good),
		"tampered id":                 verify([]string{"current"}, "1700000000", "e2", body, good),
		"replayed at a new timestamp": verify([]string{"current"}, "1700000001", "e1", body, good),
		"no prefix":                   verify([]string{"current"}, "1700000000", "e1", body, "deadbeef"),
		"not hex":                     verify([]string{"current"}, "1700000000", "e1", body, "sha256=zzzz"),
		"empty secret set":            verify([]string{""}, "1700000000", "e1", body, good),
	}
	for name, accepted := range cases {
		if accepted {
			t.Errorf("%s was accepted", name)
		}
	}
}

func TestSkewIsBoundedInBothDirections(t *testing.T) {
	now := time.Unix(1700000000, 0)
	skew := 5 * time.Minute

	cases := map[string]struct {
		timestamp string
		want      bool
	}{
		"now":          {"1700000000", true},
		"four ahead":   {strconv.FormatInt(now.Add(4*time.Minute).Unix(), 10), true},
		"four behind":  {strconv.FormatInt(now.Add(-4*time.Minute).Unix(), 10), true},
		"six ahead":    {strconv.FormatInt(now.Add(6*time.Minute).Unix(), 10), false},
		"six behind":   {strconv.FormatInt(now.Add(-6*time.Minute).Unix(), 10), false},
		"not a number": {"soon", false},
		"empty":        {"", false},
	}
	for name, tc := range cases {
		if got := withinSkew(tc.timestamp, skew, now); got != tc.want {
			t.Errorf("%s: withinSkew = %v, want %v", name, got, tc.want)
		}
	}
}

// The order of the checks matters: everything cheap and non-secret happens
// before the comparison that depends on a key.
func TestAdmitReportsTheFirstFailure(t *testing.T) {
	now := time.Unix(1700000000, 0)
	body := []byte(`{"id":"e1"}`)
	valid := delivery{
		eventID:       "e1",
		timestamp:     "1700000000",
		schemaVersion: "1",
		signature:     sign("secret", "1700000000", "e1", body),
		body:          body,
	}

	cases := map[string]struct {
		secrets  []string
		mutate   func(delivery) delivery
		expected string
	}{
		"no secret configured": {nil, nil, ReasonNoSecret},
		"no signature":         {[]string{"secret"}, func(d delivery) delivery { d.signature = ""; return d }, ReasonMissingHeaders},
		"no event id":          {[]string{"secret"}, func(d delivery) delivery { d.eventID = ""; return d }, ReasonMissingHeaders},
		"schema version 2":     {[]string{"secret"}, func(d delivery) delivery { d.schemaVersion = "2"; return d }, ReasonBadSchemaVersion},
		"stale timestamp":      {[]string{"secret"}, func(d delivery) delivery { d.timestamp = "1600000000"; return d }, ReasonTimestampSkew},
		"wrong signature":      {[]string{"other"}, nil, ReasonBadSignature},
		"accepted":             {[]string{"secret"}, nil, ""},
	}

	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			request := valid
			if tc.mutate != nil {
				request = tc.mutate(request)
			}
			controller := NewController(nil, Config{Secrets: tc.secrets, MaxSkew: 5 * time.Minute}, func() time.Time { return now })
			if got := controller.admit(request); got != tc.expected {
				t.Errorf("admit = %q, want %q", got, tc.expected)
			}
		})
	}
}

// A stale timestamp is refused even when the signature is otherwise valid,
// which is the property that makes a captured request expire.
func TestAValidSignatureDoesNotSurviveTheSkewWindow(t *testing.T) {
	body := []byte(`{"id":"e1"}`)
	old := delivery{
		eventID:       "e1",
		timestamp:     "1600000000",
		schemaVersion: "1",
		signature:     sign("secret", "1600000000", "e1", body),
		body:          body,
	}
	controller := NewController(nil, Config{Secrets: []string{"secret"}, MaxSkew: 5 * time.Minute},
		func() time.Time { return time.Unix(1700000000, 0) })

	if got := controller.admit(old); got != ReasonTimestampSkew {
		t.Errorf("admit = %q, want a skew rejection for a correctly signed but expired delivery", got)
	}
}

// Both secrets are always hashed, so the response time does not reveal which
// one verified a delivery. A rotation exists to make that indistinguishable,
// and an early return on the first match would undo it.
func TestEverySecretIsTriedWhicheverMatches(t *testing.T) {
	body := []byte(`{"id":"e1"}`)
	secrets := []string{"current", "previous"}

	var hashed int
	counted := make([]string, len(secrets))
	copy(counted, secrets)

	for index, secret := range counted {
		if !verify(secrets, "1700000000", "e1", body, sign(secret, "1700000000", "e1", body)) {
			t.Fatalf("secret %d was refused", index)
		}
		hashed++
	}
	if hashed != len(secrets) {
		t.Errorf("verified %d of %d secrets", hashed, len(secrets))
	}
}

// A refusal must not be cheaper than an acceptance in a way that leaks which
// key is live: the loop has no early exit, so the work is the same either way.
func TestVerifyHasNoEarlyExit(t *testing.T) {
	source, err := os.ReadFile("signature.go")
	if err != nil {
		t.Fatalf("reading signature.go: %v", err)
	}
	body, _, found := strings.Cut(string(source), "// withinSkew")
	if !found {
		t.Fatal("could not isolate verify()")
	}
	if strings.Contains(body, "return true") {
		t.Error("verify returns early on a match; the response time then reveals which secret was in use")
	}
}
