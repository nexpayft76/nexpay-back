import { pool, type Queryable } from "../../config/db";

export type TransactionType = "BUY" | "SELL" | "EXCHANGE" | "DEPOSIT";

export interface TransactionRecord {
  id: string;
  wallet_id: string;
  type: TransactionType;
  from_currency: string | null;
  to_currency: string;
  from_amount: string;
  to_amount: string;
  exchange_rate: string;
  created_at: string;
}

export interface CreateTransactionInput {
  wallet_id: string;
  type: TransactionType;
  from_currency: string | null;
  to_currency: string;
  from_amount: string;
  to_amount: string;
  exchange_rate: string;
}

export const transactionsRepository = {
  async findAll(): Promise<TransactionRecord[]> {
    const { rows } = await pool.query<TransactionRecord>(
      "SELECT * FROM transactions ORDER BY created_at DESC",
    );
    return rows;
  },

  async findById(id: string): Promise<TransactionRecord | null> {
    const { rows } = await pool.query<TransactionRecord>("SELECT * FROM transactions WHERE id = $1", [id]);
    return rows[0] ?? null;
  },

  async create(input: CreateTransactionInput): Promise<TransactionRecord> {
    const { rows } = await pool.query<TransactionRecord>(
      `INSERT INTO transactions (
        wallet_id, type, from_currency, to_currency, from_amount, to_amount, exchange_rate
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [input.wallet_id, input.type, input.from_currency, input.to_currency, input.from_amount, input.to_amount, input.exchange_rate],
    );
    return rows[0];
  },

  /**
   * Registra una recarga en el historial, dentro de la transacción SQL de `db`.
   * Un DEPOSIT no tiene moneda de origen (from_currency NULL, regla de la migración 002) y su tasa es 1.
   */
  async insertDeposit(
    db: Queryable,
    input: { wallet_id: string; currency_code: string; amount: string },
  ): Promise<{ id: string; created_at: Date }> {
    const { rows } = await db.query<{ id: string; created_at: Date }>(
      `INSERT INTO transactions (wallet_id, type, from_currency, to_currency, from_amount, to_amount, exchange_rate)
       VALUES ($1, 'DEPOSIT', NULL, $2, $3, $3, 1)
       RETURNING id, created_at`,
      [input.wallet_id, input.currency_code, input.amount],
    );
    const row = rows[0];
    if (!row) throw new Error("INSERT INTO transactions no devolvió filas");
    return row;
  },
};
