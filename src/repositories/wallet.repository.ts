import { pool, type Queryable } from "../config/db";

export interface WalletRow {
  id: string;
  created_at: Date;
}

export interface BalanceRow {
  currency_code: string;
  currency_name: string;
  decimals: number;
  /** NUMERIC llega como string desde pg: se mantiene así para no perder precisión. */
  amount: string;
  updated_at: Date;
}

export async function findWalletByUserId(userId: string, db: Queryable = pool): Promise<WalletRow | null> {
  const { rows } = await db.query<WalletRow>("SELECT id, created_at FROM wallets WHERE user_id = $1", [userId]);
  return rows[0] ?? null;
}

/**
 * Suma `amount` al saldo de una moneda y devuelve el saldo nuevo.
 * `amount` va como string para que PostgreSQL haga la suma en NUMERIC exacto (sin errores de float).
 * El UPDATE bloquea la fila hasta el COMMIT, así dos recargas simultáneas no se pisan.
 * Si la wallet aún no tiene balance en esa moneda (moneda agregada después), lo crea.
 */
export async function creditBalance(
  db: Queryable,
  walletId: string,
  currencyCode: string,
  amount: string,
): Promise<string> {
  const { rows } = await db.query<{ amount: string }>(
    `INSERT INTO balances (wallet_id, currency_code, amount)
     VALUES ($1, $2, $3)
     ON CONFLICT (wallet_id, currency_code)
     DO UPDATE SET amount = balances.amount + EXCLUDED.amount
     RETURNING amount`,
    [walletId, currencyCode, amount],
  );
  const balance = rows[0];
  if (!balance) throw new Error("No se pudo actualizar el balance");
  return balance.amount;
}

export async function findBalancesByWalletId(walletId: string, db: Queryable = pool): Promise<BalanceRow[]> {
  const { rows } = await db.query<BalanceRow>(
    `SELECT b.currency_code, c.name AS currency_name, c.decimals, b.amount, b.updated_at
     FROM balances b
     JOIN currencies c ON c.code = b.currency_code
     WHERE b.wallet_id = $1
     ORDER BY b.currency_code`,
    [walletId],
  );
  return rows;
}

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
