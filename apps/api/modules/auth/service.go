// Package auth is Perception's current implementation of
// identity.Authenticator: local password accounts plus OIDC, backed by session
// rows in Postgres.
//
// It is meant to be thrown away. The suite is extracting one shared auth
// package, porte, and this package is the seam where it will be swapped in.
// main.go is the only file allowed to import it; everything else depends on
// identity.Authenticator, so the swap should be a change of constructor and
// nothing more.
//
// A replacement must preserve, exactly:
//
//   - the route paths in types.go, mounted under /api, with the same methods,
//     the same public/authenticated split, and the same omissions (no
//     register or login when SSO_ONLY, no OIDC routes without an issuer);
//   - the session cookie: named perception_session, Path=/, HttpOnly, Secure,
//     SameSite=Lax, MaxAge equal to schemas.SessionMaxLifetime, carrying the
//     raw token that the Authorization header would otherwise carry;
//   - the Authenticate contract: accept a bare token or a "Bearer " prefixed
//     one, return a fully populated identity.Identity except ClientIP, which
//     the middleware fills, and return a tronc *errors.Error with code
//     unauthenticated for every credential failure without ever revealing
//     which failure it was.
//
// Session tokens are stored as their SHA-256 digest, so a database dump does
// not hand out live sessions. Perception stores no OIDC access or refresh
// token at all; the TypeScript app it replaces did, and its backups leaked
// live refresh tokens as a result.
package auth

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	stderrors "errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/FacileStudio/Perception/apps/api/internal/authcrypto"
	"github.com/FacileStudio/Perception/apps/api/internal/identity"
	"github.com/FacileStudio/Perception/apps/api/schemas"
	"github.com/FacileStudio/tronc/errors"

	"gorm.io/gorm"
)

const sessionCleanupInterval = 15 * time.Minute

// Service implements authentication: registration, login, sessions and OIDC,
// persisted through the controller on its own orm handle.
type Service struct {
	orm        *gorm.DB
	logger     *slog.Logger
	controller *Controller
}

// NewService wires a Service onto the database, returning one bound to appLogger.
func NewService(db *gorm.DB, appLogger *slog.Logger) *Service {
	service := &Service{orm: db, logger: appLogger}
	service.controller = newController(service)
	return service
}

func (service *Service) registerUser(ctx context.Context, email string, password string, name string) (string, string, error) {
	hash, err := authcrypto.HashPassword(password)
	if err != nil {
		return "", "", errors.Invalid("invalid password")
	}

	record := &schemas.User{
		Email:        email,
		Name:         name,
		PasswordHash: hash,
		Source:       "local",
	}
	if err := service.orm.WithContext(ctx).Create(record).Error; err != nil {
		if stderrors.Is(err, gorm.ErrDuplicatedKey) {
			return "", "", errors.Conflict("email already registered")
		}
		return "", "", errors.Internal("failed to create user", err)
	}

	token, err := service.startSession(ctx, record.ID)
	if err != nil {
		return "", "", err
	}
	return strconv.FormatInt(record.ID, 10), token, nil
}

func (service *Service) loginUser(ctx context.Context, email string, password string) (string, string, error) {
	var record schemas.User
	err := service.orm.WithContext(ctx).Where("email = ?", email).First(&record).Error
	if stderrors.Is(err, gorm.ErrRecordNotFound) {
		authcrypto.VerifyPassword(password, authcrypto.DummyHash)
		return "", "", errors.Unauthorized("invalid credentials")
	}
	if err != nil {
		return "", "", errors.Internal("failed to read user", err)
	}
	if !authcrypto.VerifyPassword(password, record.PasswordHash) {
		return "", "", errors.Unauthorized("invalid credentials")
	}

	token, err := service.startSession(ctx, record.ID)
	if err != nil {
		return "", "", err
	}
	return strconv.FormatInt(record.ID, 10), token, nil
}

func (service *Service) logoutUser(ctx context.Context, authorization string) error {
	token := normalizeBearer(authorization)
	if token == "" {
		return errors.Unauthorized("missing auth token")
	}

	result := service.orm.WithContext(ctx).Where("token = ?", hashToken(token)).Delete(&schemas.Session{})
	if result.Error != nil {
		return errors.Internal("failed to delete session", result.Error)
	}
	return nil
}

func (service *Service) startSession(ctx context.Context, userID int64) (string, error) {
	token, err := authcrypto.NewToken()
	if err != nil {
		return "", errors.Internal("failed to create session", err)
	}

	record := &schemas.Session{
		Token:     hashToken(token),
		UserID:    userID,
		ExpiresAt: time.Now().Add(schemas.SessionSlidingWindow),
	}
	if err := service.orm.WithContext(ctx).Create(record).Error; err != nil {
		return "", errors.Internal("failed to persist session", err)
	}
	return token, nil
}

func (service *Service) upsertOIDCUser(ctx context.Context, email string, name string) (string, string, error) {
	var record schemas.User
	err := service.orm.WithContext(ctx).Where("email = ?", email).First(&record).Error
	if err != nil && !stderrors.Is(err, gorm.ErrRecordNotFound) {
		return "", "", errors.Internal("failed to look up user", err)
	}

	if stderrors.Is(err, gorm.ErrRecordNotFound) {
		record = schemas.User{Email: email, Name: name, Source: "oidc"}
		if err := service.orm.WithContext(ctx).Create(&record).Error; err != nil {
			return "", "", errors.Internal("failed to create user", err)
		}
	} else {
		if name != "" {
			record.Name = name
		}
		record.ProfileSyncedAt = time.Now()
		if err := service.orm.WithContext(ctx).Save(&record).Error; err != nil {
			return "", "", errors.Internal("failed to save user", err)
		}
	}

	token, err := service.startSession(ctx, record.ID)
	if err != nil {
		return "", "", err
	}
	return strconv.FormatInt(record.ID, 10), token, nil
}

// Authenticate resolves a session token into an Identity. ClientIP is left to
// the middleware, which is the only layer that can see the request.
func (service *Service) Authenticate(ctx context.Context, authorization string) (identity.Identity, error) {
	token := normalizeBearer(authorization)
	if token == "" {
		return identity.Identity{}, errors.Unauthorized("missing auth token")
	}

	hashed := hashToken(token)
	var row struct {
		UserID    int64
		Email     string
		Name      string
		ExpiresAt time.Time
		CreatedAt time.Time
	}
	err := service.orm.WithContext(ctx).
		Table("sessions s").
		Select("u.id as user_id, u.email as email, u.name as name, s.expires_at as expires_at, s.created_at as created_at").
		Joins("join users u on u.id = s.user_id").
		Where("s.token = ?", hashed).
		Scan(&row).Error
	if err != nil {
		return identity.Identity{}, errors.Internal("failed to validate auth token", err)
	}
	if row.UserID == 0 {
		return identity.Identity{}, errors.Unauthorized("invalid auth token")
	}

	now := time.Now()
	if now.After(row.ExpiresAt) || now.Sub(row.CreatedAt) > schemas.SessionMaxLifetime {
		return identity.Identity{}, errors.Unauthorized("expired auth token")
	}

	service.renewSession(hashed, row.CreatedAt, now)

	return identity.Identity{
		UserID: strconv.FormatInt(row.UserID, 10),
		Email:  row.Email,
		Name:   row.Name,
	}, nil
}

// renewSession slides the expiry forward on use but never past the session's
// absolute lifetime, and does it off the request path so an authenticated read
// is never slowed by a write.
func (service *Service) renewSession(hashed string, createdAt time.Time, now time.Time) {
	expiresAt := now.Add(schemas.SessionSlidingWindow)
	absoluteMax := createdAt.Add(schemas.SessionMaxLifetime)
	if expiresAt.After(absoluteMax) {
		expiresAt = absoluteMax
	}

	go func() {
		result := service.orm.Model(&schemas.Session{}).
			Where("token = ?", hashed).
			Update("expires_at", expiresAt)
		if result.Error != nil {
			service.logger.Warn("session renewal failed", slog.Any("error", result.Error))
		}
	}()
}

func (service *Service) StartSessionCleanup(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(sessionCleanupInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				result := service.orm.Where("expires_at < ?", time.Now()).Delete(&schemas.Session{})
				if result.Error != nil {
					service.logger.Error("session cleanup failed", slog.Any("error", result.Error))
				} else if result.RowsAffected > 0 {
					service.logger.Info("purged expired sessions", slog.Int64("count", result.RowsAffected))
				}
			}
		}
	}()
}

// SetSessionCookie writes the session token to the browser cookie for the
// session's lifetime.
func SetSessionCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   int(schemas.SessionMaxLifetime.Seconds()),
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})
}

// ClearSessionCookie expires the session cookie: an already-deleted session and
// a missing one both answer the same, so logout is idempotent.
func ClearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})
}

// normalizeBearer accepts both a bare token and a "Bearer " prefixed one. The
// scheme is only stripped when a separator or the end of the string follows it,
// so a token that happens to begin with "bearer" survives intact, and a header
// carrying the scheme and nothing else normalizes to empty rather than to a
// token named "Bearer".
func normalizeBearer(authorization string) string {
	value := strings.TrimSpace(authorization)
	if len(value) >= 6 && strings.EqualFold(value[:6], "bearer") {
		rest := value[6:]
		if rest == "" || rest[0] == ' ' || rest[0] == '\t' {
			return strings.TrimSpace(rest)
		}
	}
	return value
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
