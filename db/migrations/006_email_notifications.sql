BEGIN;

CREATE TABLE IF NOT EXISTS email_notifications (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    recipient_email     VARCHAR(255) NOT NULL,
    email_type          VARCHAR(30) NOT NULL
                        CHECK (email_type IN ('welcome', 'exchange', 'deposit')),
    subject             VARCHAR(255) NOT NULL,
    status              VARCHAR(10) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'sent', 'failed')),
    provider_message_id VARCHAR(255),
    error_message       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at             TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_email_notifications_user_date
    ON email_notifications (user_id, created_at DESC);

COMMIT;