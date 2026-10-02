BEGIN;

CREATE TABLE IF NOT EXISTS user_alerts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind            VARCHAR(30) NOT NULL CHECK (kind IN (
                        'daily_change', 'target_rate', 'low_balance', 'stale_rates', 'deposit_received'
                    )),
    currency        VARCHAR(10) NOT NULL REFERENCES currencies(code),
    base_currency   VARCHAR(10) NOT NULL REFERENCES currencies(code),
    direction       VARCHAR(4) NOT NULL CHECK (direction IN ('up', 'down')),
    threshold       NUMERIC(24, 8) NOT NULL CHECK (threshold >= 0),
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    email_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
    condition_met   BOOLEAN NOT NULL DEFAULT FALSE,
    last_event_key  VARCHAR(100),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_alerts_user_enabled
    ON user_alerts (user_id, enabled);

DROP TRIGGER IF EXISTS trg_user_alerts_updated ON user_alerts;
CREATE TRIGGER trg_user_alerts_updated
    BEFORE UPDATE ON user_alerts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE email_notifications
    DROP CONSTRAINT IF EXISTS email_notifications_email_type_check;
ALTER TABLE email_notifications
    ADD CONSTRAINT email_notifications_email_type_check
    CHECK (email_type IN ('welcome', 'exchange', 'deposit', 'alert'));

COMMIT;