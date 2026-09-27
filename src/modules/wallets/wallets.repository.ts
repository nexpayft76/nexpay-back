import { pool } from "../../config/db";

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
};
