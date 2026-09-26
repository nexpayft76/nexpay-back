import { pool } from "../../config/db";

export interface WalletRecord {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface CreateWalletInput {
  user_id: string;
}

export const walletsRepository = {
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

  async create(input: CreateWalletInput): Promise<WalletRecord> {
    const { rows } = await pool.query<WalletRecord>(
      `INSERT INTO wallets (user_id)
       VALUES ($1)
       RETURNING *`,
      [input.user_id],
    );
    return rows[0];
  },

};
