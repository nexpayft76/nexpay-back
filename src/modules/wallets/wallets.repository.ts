import { pool, type Queryable } from "../../config/db";

export interface WalletRecord {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface WalletBalanceRecord {
  currency_code: string;
  currency_name: string;
  decimals: number;
  /** NUMERIC como texto: se mantiene exacto, sin pasar por float. */
  amount: string;
  updated_at: Date;
}

export const walletsRepository = {
  /** Serializa las modificaciones de saldo con el cierre y rechaza cuentas que ya no están activas. */
  async lockActiveUserForWallet(db: Queryable, walletId: string): Promise<boolean> {
    const { rowCount } = await db.query(
      `SELECT u.id FROM users u
       JOIN wallets w ON w.user_id = u.id
       WHERE w.id = $1 AND u.deleted_at IS NULL AND u.status = 'active'
       FOR NO KEY UPDATE OF u`,
      [walletId],
    );
    return (rowCount ?? 0) > 0;
  },

  /** Saldos de una wallet con el nombre y los decimales de cada moneda (solo monedas activas). */
  async findBalancesWithCurrency(walletId: string): Promise<WalletBalanceRecord[]> {
    const { rows } = await pool.query<WalletBalanceRecord>(
      `SELECT b.currency_code, c.name AS currency_name, c.decimals, b.amount::text AS amount, b.updated_at
       FROM balances b
       JOIN currencies c ON c.code = b.currency_code AND c.is_active = TRUE
       WHERE b.wallet_id = $1
       ORDER BY b.currency_code`,
      [walletId],
    );
    return rows;
  },

  async findAll(): Promise<WalletRecord[]> {
    const { rows } = await pool.query<WalletRecord>(
      "SELECT * FROM wallets ORDER BY created_at DESC",
    );
    return rows;
  },

  async findById(id: string): Promise<WalletRecord | null> {
    const { rows } = await pool.query<WalletRecord>("SELECT * FROM wallets WHERE id = $1", [id]);
    return rows[0] ?? null;
  },

  async findByUserId(user_id: string): Promise<WalletRecord | null> {
    const { rows } = await pool.query<WalletRecord>(
      "SELECT * FROM wallets WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
      [user_id],
    );
    return rows[0] ?? null;
  },

  /**
   * Suma `amount` al saldo de una moneda y devuelve el saldo nuevo (NUMERIC como texto).
   * `amount` va como texto para que PostgreSQL sume en NUMERIC exacto, sin errores de float.
   * El UPDATE bloquea la fila hasta el COMMIT: dos recargas simultáneas no se pisan.
   * Si la wallet no tiene balance en esa moneda (moneda agregada después), lo crea.
   */
  async creditBalance(db: Queryable, walletId: string, currencyCode: string, amount: string): Promise<string> {
    const { rows } = await db.query<{ amount: string }>(
      `INSERT INTO balances (wallet_id, currency_code, amount)
       VALUES ($1, $2, $3)
       ON CONFLICT (wallet_id, currency_code)
       DO UPDATE SET amount = balances.amount + EXCLUDED.amount
       RETURNING amount::text AS amount`,
      [walletId, currencyCode, amount],
    );
    const balance = rows[0];
    if (!balance) throw new Error("No se pudo actualizar el balance");
    return balance.amount;
  },
};
