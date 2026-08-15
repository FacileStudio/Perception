package schemas

import "time"

// User is the local identity row: password hash plus the OIDC source that
// created or last synced the account.
type User struct {
	ID              int64     `gorm:"column:id;primaryKey"`
	Email           string    `gorm:"column:email;uniqueIndex"`
	Name            string    `gorm:"column:name"`
	PasswordHash    string    `gorm:"column:password_hash"`
	Source          string    `gorm:"column:source;default:local"`
	ProfileSyncedAt time.Time `gorm:"column:profile_synced_at"`
	CreatedAt       time.Time `gorm:"column:created_at;autoCreateTime"`
	UpdatedAt       time.Time `gorm:"column:updated_at;autoUpdateTime"`
}

func (User) TableName() string { return "users" }
