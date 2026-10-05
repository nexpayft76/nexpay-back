-- 015_roles_tesoreria.sql
-- Roles y tesorería de comisiones.
--   * users.role: solo dos roles.
--       'user'      → todo el que se registra: ve su dinero y la configuración de su cuenta.
--       'superuser' → ve a todos los usuarios, asigna roles, suspende cuentas y ve todo el sistema.
--   * users.is_owner: la cuenta propietaria de NexPay (UNA sola). Es superusuario, recibe en su billetera
--     todas las comisiones y no se puede degradar ni suspender. Se crea con `npm run db:superuser`
--     (correo y contraseña salen de variables de entorno, nunca del repositorio).
--   * platform_fees: cada comisión cobrada (compra/venta/intercambio o P2P), en la moneda exacta en que
--     se cobró, y a qué billetera se acreditó. Las comisiones anteriores a esta migración no se registran.
-- Se puede ejecutar más de una vez sin error.

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(10) NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_owner BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'superuser'));
  END IF;

  -- La cuenta propietaria siempre es superusuario.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_owner_is_superuser_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_owner_is_superuser_check CHECK (NOT is_owner OR role = 'superuser');
  END IF;
END $$;

-- Una sola cuenta propietaria en todo el sistema.
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_single_owner ON users (is_owner) WHERE is_owner;

CREATE TABLE IF NOT EXISTS platform_fees (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source             VARCHAR(10) NOT NULL CHECK (source IN ('exchange', 'p2p')),
    currency_code      VARCHAR(10) NOT NULL REFERENCES currencies(code),
    amount             NUMERIC(24,8) NOT NULL CHECK (amount > 0),
    -- Quién pagó la comisión y en qué transacción.
    payer_wallet_id    UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
    transaction_id     UUID NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
    offer_id           UUID NULL REFERENCES p2p_offers(id) ON DELETE RESTRICT,
    -- Billetera de la cuenta propietaria que la recibió (NULL solo si todavía no existía la cuenta propietaria).
    credited_wallet_id UUID NULL REFERENCES wallets(id) ON DELETE RESTRICT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_fees_created ON platform_fees (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_fees_currency ON platform_fees (currency_code, source);

-- Historial del usuario: sus transacciones, de la más nueva a la más vieja.
CREATE INDEX IF NOT EXISTS idx_transactions_wallet_created ON transactions (wallet_id, created_at DESC);

COMMIT;
