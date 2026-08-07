package schemas

import "time"

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
