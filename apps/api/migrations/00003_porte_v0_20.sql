-- +goose Up
-- porte v0.20 stores the person's locale and the identity a login code was
-- issued for. porte/pg's Schema adds these columns itself; Perception owns its
-- porte tables in these migrations, so the same columns land here.

ALTER TABLE porte_users ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'en';
ALTER TABLE porte_login_codes ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT '',
                              ADD COLUMN IF NOT EXISTS subject text NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE porte_login_codes DROP COLUMN subject, DROP COLUMN provider;
ALTER TABLE porte_users DROP COLUMN locale;
