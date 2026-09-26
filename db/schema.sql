-- schema.sql
-- Esquema base de NexPay (PostgreSQL). Es el que se ejecutó al crear la base de datos en Railway.
-- Los cambios posteriores están en db/migrations/, en orden numérico.
-- Para una base nueva: ejecutar este archivo y después todas las migraciones.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Catálogo de monedas: valida los códigos usados en balances y transacciones.
CREATE TABLE currencies (
    code       VARCHAR(10) PRIMARY KEY,
    name       VARCHAR(60) NOT NULL,
    decimals   SMALLINT    NOT NULL DEFAULT 2,
    is_active  BOOLEAN     NOT NULL DEFAULT TRUE
);
INSERT INTO currencies (code, name, decimals) VALUES
    ('COP', 'Peso colombiano', 2),
    ('USD', 'Dólar estadounidense', 2),
    ('EUR', 'Euro', 2);

-- Usuarios, con borrado lógico (deleted_at).
CREATE TABLE users (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name      VARCHAR(120) NOT NULL,
    email          VARCHAR(255) NOT NULL UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,
    status         VARCHAR(10)  NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','suspended','closed')),
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deleted_at     TIMESTAMPTZ
);

-- Una wallet por usuario (1:1).
CREATE TABLE wallets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un balance por moneda en cada wallet (1:N). Nunca negativo.
CREATE TABLE balances (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id      UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
    currency_code  VARCHAR(10) NOT NULL REFERENCES currencies(code),
    amount         NUMERIC(24,8) NOT NULL DEFAULT 0 CHECK (amount >= 0),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (wallet_id, currency_code)
);

-- Historial inmutable de operaciones (auditoría).
CREATE TABLE transactions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id      UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
    type           VARCHAR(10) NOT NULL CHECK (type IN ('BUY','SELL','EXCHANGE')),
    from_currency  VARCHAR(10) NOT NULL REFERENCES currencies(code),
    to_currency    VARCHAR(10) NOT NULL REFERENCES currencies(code),
    from_amount    NUMERIC(24,8) NOT NULL CHECK (from_amount > 0),
    to_amount      NUMERIC(24,8) NOT NULL CHECK (to_amount > 0),
    exchange_rate  NUMERIC(24,10) NOT NULL CHECK (exchange_rate > 0),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (from_currency <> to_currency)
);

CREATE INDEX idx_balances_wallet          ON balances(wallet_id);
CREATE INDEX idx_transactions_wallet_date ON transactions(wallet_id, created_at DESC);

-- updated_at automático en cada UPDATE (función y nombres de triggers verificados contra Railway).
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated    BEFORE UPDATE ON users    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_wallets_updated  BEFORE UPDATE ON wallets  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_balances_updated BEFORE UPDATE ON balances FOR EACH ROW EXECUTE FUNCTION set_updated_at();
