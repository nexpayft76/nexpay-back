/**
 * Crea (o convierte) la cuenta PROPIETARIA de NexPay: superusuario que recibe todas las comisiones.
 * Hay una sola. El correo y la contraseña salen de variables de entorno: nunca se escriben en el código.
 *
 * Uso (PowerShell), con DATABASE_URL en tu .env:
 *   $env:SUPERUSER_EMAIL="..."; $env:SUPERUSER_PASSWORD="..."; $env:SUPERUSER_NAME="NexPay"; npm run db:superuser
 *
 * - Si el correo no existe: crea la cuenta con su billetera y sus saldos en 0.
 * - Si ya existe: la vuelve superusuario propietario, la reactiva y le pone esa contraseña.
 * - Si ya hay otra cuenta propietaria, no hace nada.
 */
import bcrypt from "bcryptjs";

import { pool, withTransaction } from "../src/config/db";
import { authRepository } from "../src/modules/auth/auth.repository";
import { emailSchema, fullNameSchema, newPasswordSchema } from "../src/modules/auth/auth.middlewares";
import { BCRYPT_ROUNDS } from "../src/modules/auth/auth.service";

function read(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta la variable ${name}`);
  return value;
}

async function main(): Promise<void> {
  const email = emailSchema.parse(read("SUPERUSER_EMAIL"));
  const password = newPasswordSchema.parse(process.env.SUPERUSER_PASSWORD ?? "");
  const fullName = fullNameSchema.parse(process.env.SUPERUSER_NAME?.trim() || "NexPay");
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const { host } = new URL(process.env.DATABASE_URL ?? "");
  console.log(`Base de datos: ${host}`);

  const result = await withTransaction(async (client) => {
    const owner = await client.query<{ email: string }>("SELECT email FROM users WHERE is_owner LIMIT 1");
    const currentOwner = owner.rows[0]?.email;
    if (currentOwner && currentOwner.toLowerCase() !== email.toLowerCase()) {
      throw new Error(`Ya existe una cuenta propietaria (${currentOwner}). Solo puede haber una.`);
    }

    const existing = await authRepository.findByEmail(email, client);
    if (existing) {
      await client.query(
        `UPDATE users
         SET role = 'superuser', is_owner = TRUE, status = 'active', deleted_at = NULL,
             password_hash = $2, session_version = session_version + 1, updated_at = NOW()
         WHERE id = $1`,
        [existing.id, passwordHash],
      );
      return "actualizada";
    }

    const created = await authRepository.createUser(client, { full_name: fullName, email, password_hash: passwordHash });
    await client.query("UPDATE users SET role = 'superuser', is_owner = TRUE WHERE id = $1", [created.id]);
    const walletId = await authRepository.createWallet(client, created.id);
    await authRepository.createInitialBalances(client, walletId);
    return "creada";
  });

  console.log(`✔ Cuenta propietaria ${result}: ${email}`);
}

main()
  .catch((err: unknown) => {
    console.error("✖ Error:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
