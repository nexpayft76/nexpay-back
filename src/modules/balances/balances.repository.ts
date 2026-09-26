import { pool } from "../../config/db";

export interface BalanceRecord {
  id: string;
  wallet_id: string;
  currency_code: string;
  amount: string;
  created_at: string;
  updated_at: string;
}

export interface CreateBalanceInput {
  wallet_id: string;
  currency_code: string;
  amount?: string;
}

export interface UpdateBalanceInput {
  amount?: string;
}

export const balancesRepository = {
  async findAll(): Promise<BalanceRecord[]> {
    const { rows } = await pool.query<BalanceRecord>(
      "SELECT * FROM balances ORDER BY updated_at DESC",
    );
    return rows;
  },

  async findById(id: string): Promise<BalanceRecord | null> {
    const { rows } = await pool.query<BalanceRecord>("SELECT * FROM balances WHERE id = $1", [id]);
    return rows[0] ?? null;
  },

  async findByWalletAndCurrency(walletId: string, currencyCode: string): Promise<BalanceRecord | null> {
    const { rows } = await pool.query<BalanceRecord>(
      "SELECT * FROM balances WHERE wallet_id = $1 AND currency_code = $2",
      [walletId, currencyCode],
    );
    return rows[0] ?? null;
  },

  async create(input: CreateBalanceInput): Promise<BalanceRecord> {
    const { rows } = await pool.query<BalanceRecord>(
      `INSERT INTO balances (wallet_id, currency_code, amount)
       VALUES ($1, $2, COALESCE($3, '0'))
       RETURNING *`,
      [input.wallet_id, input.currency_code, input.amount ?? "0"],
    );
    return rows[0];
  },

  async update(id: string, input: UpdateBalanceInput): Promise<BalanceRecord | null> {
    if (input.amount === undefined) {
      return this.findById(id);
    }

    const { rows } = await pool.query<BalanceRecord>(
      `UPDATE balances
       SET amount = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [input.amount, id],
    );

    return rows[0] ?? null;
  },

};
