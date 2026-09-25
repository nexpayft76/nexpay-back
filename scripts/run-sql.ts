/**
 * Ejecuta uno o más archivos .sql contra la base de datos de DATABASE_URL (.env).
 *
 * Uso: npm run db:sql -- db/migrations/001_google_auth.sql
 */
import { readFile } from "node:fs/promises";
import { pool } from "../src/config/db";

async function main(): Promise<void> {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error("Indica al menos un archivo .sql. Ej: npm run db:sql -- db/migrations/001_google_auth.sql");
    process.exitCode = 1;
    return;
  }

  const { host } = new URL(process.env.DATABASE_URL ?? "");
  console.log(`Base de datos: ${host}`);

  for (const file of files) {
    const sql = await readFile(file, "utf8");
    console.log(`Ejecutando ${file}...`);
    await pool.query(sql);
    console.log(`✔ ${file} aplicado`);
  }

  const { rows } = await pool.query<{ column_name: string; is_nullable: string }>(
    `SELECT column_name, is_nullable FROM information_schema.columns
     WHERE table_name = 'users' ORDER BY ordinal_position`,
  );
  console.log("\nColumnas actuales de users:");
  console.table(rows);
}

main()
  .catch((err: unknown) => {
    console.error("✖ Error:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
