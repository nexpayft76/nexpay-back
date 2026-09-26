-- 001_google_auth.sql
-- Permite iniciar sesión con Google.
--   * google_id: identificador estable de la cuenta de Google (claim "sub" del ID token).
--   * password_hash pasa a ser opcional: los usuarios de Google no tienen contraseña.
--   * Cada usuario debe tener al menos un método de acceso (contraseña o Google).
-- Es compatible con los datos existentes y se puede ejecutar más de una vez sin error.

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_google_id_key') THEN
    ALTER TABLE users ADD CONSTRAINT users_google_id_key UNIQUE (google_id);
  END IF;
END $$;

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_login_method_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_login_method_check
      CHECK (password_hash IS NOT NULL OR google_id IS NOT NULL);
  END IF;
END $$;

COMMIT;
