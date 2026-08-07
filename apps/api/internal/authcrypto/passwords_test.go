package authcrypto

import (
	"strings"
	"testing"
)

func TestHashPasswordAndVerify(t *testing.T) {
	cases := []struct {
		name     string
		password string
	}{
		{name: "simple", password: "correct horse battery staple"},
		{name: "unicode", password: "pässwörd-🔒"},
		{name: "long", password: strings.Repeat("x", 256)},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			hash, err := HashPassword(tc.password)
			if err != nil {
				t.Fatalf("HashPassword: %v", err)
			}
			if !strings.HasPrefix(hash, "$argon2id$v=19$") {
				t.Fatalf("unexpected hash format: %s", hash)
			}
			if !VerifyPassword(tc.password, hash) {
				t.Fatal("VerifyPassword rejected the correct password")
			}
			if VerifyPassword(tc.password+"x", hash) {
				t.Fatal("VerifyPassword accepted a wrong password")
			}
		})
	}
}

func TestHashPasswordRejectsEmpty(t *testing.T) {
	if _, err := HashPassword(""); err == nil {
		t.Fatal("HashPassword accepted an empty password")
	}
}

func TestHashPasswordProducesUniqueSalts(t *testing.T) {
	first, err := HashPassword("same password")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	second, err := HashPassword("same password")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	if first == second {
		t.Fatal("two hashes of the same password are identical, salt is not random")
	}
}

func TestVerifyPasswordRejectsBadInput(t *testing.T) {
	validHash, err := HashPassword("known password")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}

	cases := []struct {
		name     string
		password string
		hash     string
	}{
		{name: "empty password", password: "", hash: validHash},
		{name: "empty hash", password: "known password", hash: ""},
		{name: "malformed hash", password: "known password", hash: "$argon2id$broken"},
		{name: "wrong algorithm", password: "known password", hash: "$bcrypt$v=19$m=65536,t=3,p=2$c2FsdA$aGFzaA"},
		{name: "invalid salt encoding", password: "known password", hash: "$argon2id$v=19$m=65536,t=3,p=2$!!!$aGFzaA"},
		{name: "invalid params", password: "known password", hash: "$argon2id$v=19$m=0,t=0,p=0$c2FsdA$aGFzaA"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if VerifyPassword(tc.password, tc.hash) {
				t.Fatal("VerifyPassword accepted invalid input")
			}
		})
	}
}

func TestDummyHashIsUsable(t *testing.T) {
	if DummyHash == "" {
		t.Fatal("DummyHash is empty, an unknown-user login would skip the argon2 cost")
	}
	if VerifyPassword("timing-safe-dummy-value", DummyHash) != true {
		t.Fatal("DummyHash does not decode as a valid argon2id hash")
	}
}
