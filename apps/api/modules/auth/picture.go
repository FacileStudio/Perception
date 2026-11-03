package auth

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/FacileStudio/porte"
)

// PictureUsers stores the provider's picture claim on every OIDC upsert.
//
// porte/pg writes Claims.AvatarURL, which porte only fills when an
// AvatarStore downloads the image. Perception copies no bytes: Registre's
// picture is a stable URL that always serves the current photo, so the URL
// itself is what gets stored, on sign-in and on /auth/sync-profile alike.
type PictureUsers struct {
	porte.UserStore
}

// UpsertFromOIDC records the https picture claim as the avatar URL and
// delegates the rest to the wrapped store. Any other scheme is a placeholder
// the client draws better as initials, so it is dropped.
func (users PictureUsers) UpsertFromOIDC(ctx context.Context, claims porte.Claims) (int64, error) {
	claims.AvatarURL = PictureURL(claims.Picture)
	return users.UserStore.UpsertFromOIDC(ctx, claims)
}

// PictureURL returns the claim when it is an https URL and "" otherwise.
func PictureURL(claim string) string {
	if strings.HasPrefix(strings.ToLower(claim), "https://") {
		return claim
	}
	return ""
}

// BackfillPictures gives every account that signed in before pictures were
// stored its Registre URL, derived from the identity row as
// <issuer>/avatars/<subject>, so nobody has to sign in again to get a
// picture. It only touches empty avatars, which makes it idempotent and safe
// to run on every boot.
func BackfillPictures(ctx context.Context, sqlDB *sql.DB, issuer string) error {
	base := PictureURL(strings.TrimRight(issuer, "/"))
	if base == "" {
		return nil
	}
	_, err := sqlDB.ExecContext(ctx, `
		UPDATE porte_users u
		   SET avatar_url = $1 || '/avatars/' || i.subject,
		       avatar_source = 'oidc'
		  FROM porte_identities i
		 WHERE i.user_id = u.id
		   AND i.provider = $2
		   AND u.avatar_url = ''`,
		base, issuer)
	if err != nil {
		return fmt.Errorf("backfill avatar urls: %w", err)
	}
	return nil
}
