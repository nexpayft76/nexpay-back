-- 014_p2p.sql
-- Mercado P2P: un usuario publica una oferta (vende una moneda a la tasa que elige) y otro la acepta.
--   * p2p_offers: cada oferta. Al publicarla, sell_amount sale del saldo del vendedor y queda retenido
--     en la oferta (garantía). Si se cancela o vence, vuelve a su saldo.
--   * Al aceptarla, el intercambio es instantáneo y atómico: el comprador paga buy_amount y recibe
--     buyer_receives; el vendedor recibe seller_receives. Ambos pagan la comisión (fee_percent),
--     descontada de lo que recibe cada uno.
--   * transactions acepta el tipo 'P2P' (un registro para cada parte).
--   * email_notifications acepta el tipo 'p2p' (publicada, vendida, comprada, cancelada o vencida).
--   * Reputación: cantidad de intercambios completados de cada usuario (como vendedor o comprador).
-- Se puede ejecutar más de una vez sin error.

BEGIN;

-- Tipo 'P2P' en transactions (reemplaza la regla de tipos de la migración 002).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_type_check_v2') THEN
    ALTER TABLE transactions DROP CONSTRAINT transactions_type_check_v2;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_type_check_v3') THEN
    ALTER TABLE transactions ADD CONSTRAINT transactions_type_check_v3
      CHECK (type IN ('BUY', 'SELL', 'EXCHANGE', 'DEPOSIT', 'P2P'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS p2p_offers (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_wallet_id  UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
    sell_currency     VARCHAR(10) NOT NULL REFERENCES currencies(code),
    buy_currency      VARCHAR(10) NOT NULL REFERENCES currencies(code),
    -- Lo que entrega el vendedor (retenido mientras la oferta está abierta).
    sell_amount       NUMERIC(24,8) NOT NULL CHECK (sell_amount > 0),
    -- Tasa elegida por el vendedor: unidades de buy_currency por 1 de sell_currency.
    rate              NUMERIC(24,10) NOT NULL CHECK (rate > 0),
    -- Lo que paga el comprador: sell_amount × rate.
    buy_amount        NUMERIC(24,8) NOT NULL CHECK (buy_amount > 0),
    -- Tasa del mercado al publicar (referencia para el límite de ±% y para mostrarla).
    market_rate       NUMERIC(24,10) NOT NULL CHECK (market_rate > 0),
    fee_percent       NUMERIC(6,4) NOT NULL CHECK (fee_percent >= 0 AND fee_percent < 100),
    -- Comisión de cada parte, en la moneda que recibe, y lo que recibe neto.
    seller_fee        NUMERIC(24,8) NOT NULL CHECK (seller_fee >= 0),
    seller_receives   NUMERIC(24,8) NOT NULL CHECK (seller_receives > 0),
    buyer_fee         NUMERIC(24,8) NOT NULL CHECK (buyer_fee >= 0),
    buyer_receives    NUMERIC(24,8) NOT NULL CHECK (buyer_receives > 0),
    status            VARCHAR(10) NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open', 'completed', 'cancelled', 'expired')),
    buyer_wallet_id   UUID NULL REFERENCES wallets(id) ON DELETE RESTRICT,
    seller_tx_id      UUID NULL REFERENCES transactions(id) ON DELETE RESTRICT,
    buyer_tx_id       UUID NULL REFERENCES transactions(id) ON DELETE RESTRICT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at        TIMESTAMPTZ NOT NULL,
    closed_at         TIMESTAMPTZ NULL,
    CHECK (sell_currency <> buy_currency),
    CHECK (buyer_wallet_id IS NULL OR buyer_wallet_id <> seller_wallet_id),
    -- Completada si y solo si tiene comprador; cerrada (completada, cancelada o vencida) si y solo si tiene fecha de cierre.
    CHECK ((status = 'completed') = (buyer_wallet_id IS NOT NULL)),
    CHECK ((status = 'open') = (closed_at IS NULL))
);

-- Mercado: ofertas abiertas por par, de la más nueva a la más vieja.
CREATE INDEX IF NOT EXISTS idx_p2p_offers_open_pair
    ON p2p_offers (sell_currency, buy_currency, created_at DESC) WHERE status = 'open';

-- "Mis ofertas" y el límite de ofertas abiertas por usuario.
CREATE INDEX IF NOT EXISTS idx_p2p_offers_seller
    ON p2p_offers (seller_wallet_id, created_at DESC);

-- Reputación: intercambios completados como comprador (los de vendedor usan idx_p2p_offers_seller).
CREATE INDEX IF NOT EXISTS idx_p2p_offers_buyer_completed
    ON p2p_offers (buyer_wallet_id) WHERE status = 'completed';

-- Vencimiento: ofertas abiertas ordenadas por fecha de vencimiento.
CREATE INDEX IF NOT EXISTS idx_p2p_offers_expiry
    ON p2p_offers (expires_at) WHERE status = 'open';

-- Emails del P2P (mismo registro que los de Nelson: estado de envío por AWS SES).
ALTER TABLE email_notifications
    DROP CONSTRAINT IF EXISTS email_notifications_email_type_check;
ALTER TABLE email_notifications
    ADD CONSTRAINT email_notifications_email_type_check
    CHECK (email_type IN ('welcome', 'exchange', 'deposit', 'alert', 'password_changed', 'password_reset', 'p2p'));

COMMIT;
