import { pool, withTransaction } from "../../config/db";
import { AppError } from "../../utils/app-error";
import { walletsRepository } from "../wallets/wallets.repository";

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
    return withTransaction(async (client) => {
      if (!(await walletsRepository.lockActiveUserForWallet(client, input.wallet_id))) {
        throw new AppError(401, "UNAUTHORIZED", "El usuario ya no está activo");
      }
      const { rows } = await client.query<BalanceRecord>(
        `INSERT INTO balances (wallet_id, currency_code, amount)
         VALUES ($1, $2, COALESCE($3, '0'))
         RETURNING *`,
        [input.wallet_id, input.currency_code, input.amount ?? "0"],
      );
      const balance = rows[0];
      if (!balance) throw new Error("INSERT INTO balances no devolvió filas");
      return balance;
    });
  },

  async update(id: string, input: UpdateBalanceInput): Promise<BalanceRecord | null> {
    if (input.amount === undefined) {
      return this.findById(id);
    }

    return withTransaction(async (client) => {
      const { rows: balanceRows } = await client.query<{ wallet_id: string }>(
        "SELECT wallet_id FROM balances WHERE id = $1",
        [id],
      );
      const balance = balanceRows[0];
      if (!balance) return null;

      if (!(await walletsRepository.lockActiveUserForWallet(client, balance.wallet_id))) {
        throw new AppError(401, "UNAUTHORIZED", "El usuario ya no está activo");
      }
      const { rows } = await client.query<BalanceRecord>(
        `UPDATE balances SET amount = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [input.amount, id],
      );
      return rows[0] ?? null;
    });
  },

};
