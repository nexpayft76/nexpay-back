-- 005_exchange_fees.sql
-- Compra, venta e intercambio de monedas (POST /api/transactions/me/exchange).
--   * fee_amount / fee_currency / fee_percent: comisión cobrada, en la moneda de origen.
--   * ars_rate_type: tipo de dólar usado cuando participa ARS (oficial, mep o blue); NULL si no participa.
-- En un cambio: from_amount = total debitado (comisión incluida), to_amount = lo acreditado,
-- exchange_rate = unidades de destino por 1 unidad de origen (la tasa aplicada, sin comisión).
-- Las filas existentes quedan con comisión 0. Se puede ejecutar más de una vez.

BEGIN;

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS fee_amount    NUMERIC(24,8) NOT NULL DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS fee_currency  VARCHAR(10) REFERENCES currencies(code);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS fee_percent   NUMERIC(6,4) NOT NULL DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS ars_rate_type VARCHAR(10);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_fee_check') THEN
    ALTER TABLE transactions ADD CONSTRAINT transactions_fee_check
      CHECK (fee_amount >= 0 AND fee_percent >= 0 AND fee_percent < 100);
  END IF;

  -- Si hay comisión, se sabe en qué moneda se cobró.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_fee_currency_check') THEN
    ALTER TABLE transactions ADD CONSTRAINT transactions_fee_currency_check
      CHECK (fee_amount = 0 OR fee_currency IS NOT NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_ars_rate_type_check') THEN
    ALTER TABLE transactions ADD CONSTRAINT transactions_ars_rate_type_check
      CHECK (ars_rate_type IS NULL OR ars_rate_type IN ('oficial', 'mep', 'blue'));
  END IF;
END $$;

COMMIT;
