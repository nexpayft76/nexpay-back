-- 004_last_known_rates.sql
-- Guarda la última respuesta válida de cada proveedor de tasas (Frankfurter, DolarApi).
-- Si un proveedor falla y el servidor se reinició (sin caché en memoria), la API usa este
-- respaldo y avisa que la tasa no está actualizada, en lugar de responder "no disponible".
-- No toca tablas existentes. Se puede ejecutar más de una vez.

BEGIN;

CREATE TABLE IF NOT EXISTS last_known_rates (
    provider    VARCHAR(40) PRIMARY KEY,          -- 'frankfurter' | 'dolarapi'
    cache_key   VARCHAR(200) NOT NULL,            -- qué se pidió (ej. 'COP,EUR,USD')
    payload     JSONB        NOT NULL,            -- respuesta ya normalizada del proveedor
    fetched_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMIT;
