import { Pool, type PoolClient } from "pg";
import { env } from "./env";

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  // Railway usa certificados autofirmados, por eso no se valida la cadena de certificados.
  ssl: env.dbSsl ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

/** Acepta tanto el pool como un cliente dentro de una transacción. */
export type Queryable = Pool | PoolClient;

pool.on("error", (err) => {
  console.error("Error inesperado en un cliente inactivo de PostgreSQL:", err.message);
});

/**
 * Ejecuta `fn` dentro de una transacción SQL (BEGIN/COMMIT).
 * Si algo falla, hace ROLLBACK y relanza el error.
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
