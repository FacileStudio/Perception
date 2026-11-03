package auth

import (
	"context"
	"database/sql"
	"testing"

	"github.com/FacileStudio/porte"
	portepg "github.com/FacileStudio/porte/pg"
)

const (
	issuer = "https://sso.facile.studio"
	chosen = "https://cdn.example.com/alice.png"
)

// A sign-in stores the https claim and drops a data: placeholder, and the
// boot backfill fills only accounts that still have no picture, idempotently.
func TestPicturesAreStoredAndBackfilled(t *testing.T) {
	sqlDB, err := testDB(t).DB()
	if err != nil {
		t.Fatal(err)
	}
	custom := signIn(t, sqlDB, "alice", chosen)
	placeholder := signIn(t, sqlDB, "bob", "data:image/svg+xml;base64,AAAA")
	expect(t, sqlDB, custom, chosen)
	expect(t, sqlDB, placeholder, "")

	for range 2 {
		if err := BackfillPictures(context.Background(), sqlDB, issuer); err != nil {
			t.Fatal(err)
		}
	}
	expect(t, sqlDB, placeholder, issuer+"/avatars/bob")
	expect(t, sqlDB, custom, chosen)
}

func signIn(t *testing.T, sqlDB *sql.DB, subject, picture string) int64 {
	t.Helper()
	users := PictureUsers{UserStore: portepg.New(sqlDB).Users()}
	id, err := users.UpsertFromOIDC(context.Background(), porte.Claims{
		Provider: issuer, Subject: subject, Email: subject + "@facile.studio", EmailVerified: true, Picture: picture,
	})
	if err != nil {
		t.Fatalf("upsert %s: %v", subject, err)
	}
	return id
}

func expect(t *testing.T, sqlDB *sql.DB, id int64, want string) {
	t.Helper()
	var got string
	if err := sqlDB.QueryRow(`SELECT avatar_url FROM porte_users WHERE id = $1`, id).Scan(&got); err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Errorf("avatar_url of user %d = %q, want %q", id, got, want)
	}
}
