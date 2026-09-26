-- 002_demo_deposits.sql
-- Permite registrar recargas (depósitos) en el historial de transacciones.
--   * Nuevo tipo 'DEPOSIT' además de BUY, SELL y EXCHANGE.
--   * from_currency pasa a ser opcional: un depósito no tiene moneda de origen.
--   * Regla: from_currency es NULL si y solo si el tipo es DEPOSIT.
-- En un depósito: to_currency = moneda recargada, from_amount = to_amount = monto, exchange_rate = 1.
-- Es compatible con los datos existentes y se puede ejecutar más de una vez sin error.

BEGIN;

-- Reemplaza la restricción de tipos (su nombre lo generó PostgreSQL, por eso se busca por definición).
DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'transactions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%''BUY''%'
      AND conname <> 'transactions_type_check_v2'
  LOOP
    EXECUTE format('ALTER TABLE transactions DROP CONSTRAINT %I', constraint_name);
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_type_check_v2') THEN
    ALTER TABLE transactions ADD CONSTRAINT transactions_type_check_v2
      CHECK (type IN ('BUY', 'SELL', 'EXCHANGE', 'DEPOSIT'));
  END IF;
END $$;

ALTER TABLE transactions ALTER COLUMN from_currency DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_deposit_source_check') THEN
    ALTER TABLE transactions ADD CONSTRAINT transactions_deposit_source_check
      CHECK ((type = 'DEPOSIT') = (from_currency IS NULL));
  END IF;
END $$;

COMMIT;
