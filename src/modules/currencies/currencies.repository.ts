import { pool } from "../../config/db";

export interface CurrencyRecord {
  code: string;
  name: string;
  decimals: number;
  is_active: boolean;
}

export interface CreateCurrencyInput {
  code: string;
  name: string;
  decimals: number;
  is_active?: boolean;
}

export interface UpdateCurrencyInput {
  name?: string;
  decimals?: number;
  is_active?: boolean;
}

export const currenciesRepository = {
  async findAll(): Promise<CurrencyRecord[]> {
    const { rows } = await pool.query<CurrencyRecord>(
      `SELECT * FROM currencies WHERE is_active = true ORDER BY name ASC`,
    );
    return rows;
  },

  async findByCode(code: string): Promise<CurrencyRecord | null> {
    const { rows } = await pool.query<CurrencyRecord>(
      "SELECT * FROM currencies WHERE code = $1",
      [code],
    );
    return rows[0] ?? null;
  },

  async create(input: CreateCurrencyInput): Promise<CurrencyRecord> {
    const { rows } = await pool.query<CurrencyRecord>(
      `INSERT INTO currencies (code, name, decimals, is_active)
       VALUES ($1, $2, $3, COALESCE($4, true))
       RETURNING *`,
      [input.code, input.name, input.decimals, input.is_active ?? true],
    );
    return rows[0];
  },

  async update(code: string, input: UpdateCurrencyInput): Promise<CurrencyRecord | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (input.name !== undefined) {
      fields.push(`name = $${index}`);
      values.push(input.name);
      index += 1;
    }

    if (input.decimals !== undefined) {
      fields.push(`decimals = $${index}`);
      values.push(input.decimals);
      index += 1;
    }

    if (input.is_active !== undefined) {
      fields.push(`is_active = $${index}`);
      values.push(input.is_active);
      index += 1;
    }

    if (fields.length === 0) {
      return this.findByCode(code);
    }

    values.push(code);
    const { rows } = await pool.query<CurrencyRecord>(
      `UPDATE currencies
       SET ${fields.join(", ")}
       WHERE code = $${index}
       RETURNING *`,
      values,
    );

    return rows[0] ?? null;
  },

  async remove(code: string): Promise<boolean> {
    const { rowCount } = await pool.query(
      "UPDATE currencies SET is_active = false WHERE code = $1 AND is_active = true",
      [code],
    );

    return (rowCount ?? 0) > 0;
  },
};
