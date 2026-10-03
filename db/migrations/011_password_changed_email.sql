BEGIN;

ALTER TABLE email_notifications
    DROP CONSTRAINT IF EXISTS email_notifications_email_type_check;
ALTER TABLE email_notifications
    ADD CONSTRAINT email_notifications_email_type_check
    CHECK (email_type IN ('welcome', 'exchange', 'deposit', 'alert', 'password_changed'));

COMMIT;
