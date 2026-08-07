package schemas

import "time"

const (
	SessionSlidingWindow = 24 * time.Hour
	SessionMaxLifetime   = 7 * 24 * time.Hour
)

// Session holds no OIDC access or refresh token on purpose. The TypeScript
// Perception stored them, which turned every database backup into a set of live
// credentials for porte.facile.studio.
type Session struct {
	Token     string    `gorm:"column:token;primaryKey"`
	UserID    int64     `gorm:"column:user_id;index"`
	ExpiresAt time.Time `gorm:"column:expires_at"`
	CreatedAt time.Time `gorm:"column:created_at;autoCreateTime"`
}

func (Session) TableName() string { return "sessions" }
