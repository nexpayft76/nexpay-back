import { pool } from "../../config/db";

export type TransactionType = "BUYSELL_EXCHANGE" | "DEPOSIT" | "WITHDRAWAL" | "TRANSFER";

export interface TransactionRecord {
  id: string;
  wallet_id: string;
  type: TransactionType;
  from_currency: string;
  to_currency: string;
  from_amount: string;
  to_amount: string;
  exchange_rate: string;
  created_at: string;
}

export interface CreateTransactionInput {
  wallet_id: string;
  type: TransactionType;
  from_currency: string;
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

  async remove(id: string): Promise<boolean> {
    const { rowCount } = await pool.query("DELETE FROM transactions WHERE id = $1", [id]);
    return (rowCount ?? 0) > 0;
  },
};
