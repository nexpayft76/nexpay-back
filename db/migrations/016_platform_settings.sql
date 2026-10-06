-- 016_platform_settings.sql
-- Configuración de la plataforma que decide el superusuario desde su panel (sin redeploy):
--   * exchange_fee_percent → comisión del intercambio de balance (% del monto de origen).
--   * p2p_fee_percent      → comisión P2P que paga cada parte (% de lo que recibe).
-- Si una clave no tiene fila, el back usa el valor de la variable de entorno (EXCHANGE_FEE_PERCENT / P2P_FEE_PERCENT).
-- Se puede ejecutar más de una vez sin error.

BEGIN;

CREATE TABLE IF NOT EXISTS platform_settings (
    key         VARCHAR(40) PRIMARY KEY CHECK (key IN ('exchange_fee_percent', 'p2p_fee_percent')),
    -- Mismo rango que transactions.fee_percent y p2p_offers.fee_percent: 0 a 10 %, hasta 4 decimales.
    value       NUMERIC(6,4) NOT NULL CHECK (value >= 0 AND value <= 10),
    updated_by  UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
