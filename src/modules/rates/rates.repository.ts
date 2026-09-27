import type { z } from "zod";
import { pool } from "../../config/db";
import type { PersistentStore } from "../../utils/cached-source";

/**
 * Respaldo de la última respuesta válida de cada proveedor en la tabla `last_known_rates`
 * (migración 004). El `payload` se valida al leerlo: si no tiene el formato esperado, se ignora.
 */
export function createRatesStore<S extends z.ZodType>(provider: string, schema: S): PersistentStore<z.output<S>> {
  return {
    async load(key) {
      const { rows } = await pool.query<{ payload: unknown; fetched_at: Date }>(
        "SELECT payload, fetched_at FROM last_known_rates WHERE provider = $1 AND cache_key = $2",
        [provider, key],
      );
      const row = rows[0];
      if (!row) return null;
      const parsed = schema.safeParse(row.payload);
      return parsed.success ? { value: parsed.data, fetchedAt: row.fetched_at.getTime() } : null;
    },

    async save(key, value, fetchedAt) {
      await pool.query(
        `INSERT INTO last_known_rates (provider, cache_key, payload, fetched_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (provider)
         DO UPDATE SET cache_key = EXCLUDED.cache_key, payload = EXCLUDED.payload, fetched_at = EXCLUDED.fetched_at`,
        [provider, key, JSON.stringify(value), new Date(fetchedAt)],
      );
    },
  };
}
