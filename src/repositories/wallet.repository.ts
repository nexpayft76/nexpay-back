import type { Queryable } from "../config/db";

export async function insertWallet(db: Queryable, userId: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO wallets (user_id) VALUES ($1) RETURNING id",
    [userId],
  );
  const wallet = rows[0];
  if (!wallet) throw new Error("INSERT INTO wallets no devolvió filas");
  return wallet.id;
}

/**
 * Crea un balance en 0 por cada moneda activa del catálogo.
 * Si mañana se agrega una moneda a `currencies`, los usuarios nuevos la reciben sin tocar este código.
 */
export async function insertInitialBalances(db: Queryable, walletId: string): Promise<number> {
  const { rowCount } = await db.query(
    `INSERT INTO balances (wallet_id, currency_code)
     SELECT $1, code FROM currencies WHERE is_active = TRUE`,
    [walletId],
  );
  return rowCount ?? 0;
}
