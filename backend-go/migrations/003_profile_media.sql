-- +goose Up
ALTER TABLE users ADD COLUMN IF NOT EXISTS background_url VARCHAR(255) NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE users DROP COLUMN IF EXISTS background_url;
