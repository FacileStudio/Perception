package authcrypto

import (
	"encoding/base64"
	"testing"
)

func TestNewToken(t *testing.T) {
	token, err := NewToken()
	if err != nil {
		t.Fatalf("NewToken: %v", err)
	}

	raw, err := base64.RawURLEncoding.DecodeString(token)
	if err != nil {
		t.Fatalf("token is not raw URL-safe base64: %v", err)
	}
	if len(raw) != 32 {
		t.Fatalf("token entropy: got %d bytes, want 32", len(raw))
	}
}

func TestNewTokenIsUnique(t *testing.T) {
	seen := make(map[string]bool)
	for i := 0; i < 100; i++ {
		token, err := NewToken()
		if err != nil {
			t.Fatalf("NewToken: %v", err)
		}
		if seen[token] {
			t.Fatal("NewToken produced a duplicate token")
		}
		seen[token] = true
	}
}
