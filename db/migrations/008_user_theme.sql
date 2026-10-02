BEGIN;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS theme VARCHAR(5) NOT NULL DEFAULT 'dark'
    CHECK (theme IN ('light', 'dark'));

COMMIT;