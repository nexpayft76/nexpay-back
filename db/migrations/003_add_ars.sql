-- 003_add_ars.sql
-- Agrega el peso argentino (ARS) al catálogo y crea su balance en 0 para las wallets existentes.
-- Los usuarios nuevos lo reciben automáticamente (insertInitialBalances usa las monedas activas).
-- Su tasa sale de DolarApi (dólar MEP), no de Frankfurter. Se puede ejecutar más de una vez.

BEGIN;

INSERT INTO currencies (code, name, decimals)
VALUES ('ARS', 'Peso argentino', 2)
ON CONFLICT (code) DO NOTHING;

INSERT INTO balances (wallet_id, currency_code)
SELECT id, 'ARS' FROM wallets
ON CONFLICT (wallet_id, currency_code) DO NOTHING;

COMMIT;
