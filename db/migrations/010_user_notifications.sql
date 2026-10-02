BEGIN;

CREATE TABLE IF NOT EXISTS user_notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        VARCHAR(20) NOT NULL CHECK (type IN ('rate_alert', 'system')),
    title       VARCHAR(200) NOT NULL,
    message     TEXT NOT NULL,
    read        BOOLEAN NOT NULL DEFAULT FALSE,
    alert_id    UUID NULL REFERENCES user_alerts(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_date
    ON user_notifications (user_id, created_at DESC);

COMMIT;
