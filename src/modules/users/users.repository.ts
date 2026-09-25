import { pool } from "../../config/db";

export interface UserRecord {
  id: string;
  full_name: string;
  email: string;
  password_hash: string;
  status: "active" | "inactive" | "closed";
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateUserInput {
  full_name: string;
  email: string;
  password_hash: string;
  status?: "active" | "inactive" | "closed";
}

export interface UpdateUserInput {
  full_name?: string;
  email?: string;
  password_hash?: string;
  status?: "active" | "inactive" | "closed";
}

export const usersRepository = {
  async findAll(): Promise<UserRecord[]> {
    const { rows } = await pool.query<UserRecord>(
      `SELECT * FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC`,
    );
    return rows;
  },

  async findById(id: string): Promise<UserRecord | null> {
    const { rows } = await pool.query<UserRecord>(
      `SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return rows[0] ?? null;
  },

  async create(input: CreateUserInput): Promise<UserRecord> {
    const { rows } = await pool.query<UserRecord>(
      `INSERT INTO users (full_name, email, password_hash, status)
       VALUES ($1, $2, $3, COALESCE($4, 'active'))
       RETURNING *`,
      [input.full_name, input.email, input.password_hash, input.status ?? "active"],
    );
    return rows[0];
  },

  async update(id: string, input: UpdateUserInput): Promise<UserRecord | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (input.full_name !== undefined) {
      fields.push(`full_name = $${index}`);
      values.push(input.full_name);
      index += 1;
    }

    if (input.email !== undefined) {
      fields.push(`email = $${index}`);
      values.push(input.email);
      index += 1;
    }

    if (input.password_hash !== undefined) {
      fields.push(`password_hash = $${index}`);
      values.push(input.password_hash);
      index += 1;
    }

    if (input.status !== undefined) {
      fields.push(`status = $${index}`);
      values.push(input.status);
      index += 1;
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const { rows } = await pool.query<UserRecord>(
      `UPDATE users
       SET ${fields.join(", ")}
       WHERE id = $${index} AND deleted_at IS NULL
       RETURNING *`,
      values,
    );

    return rows[0] ?? null;
  },

  async remove(id: string): Promise<boolean> {
    const { rowCount } = await pool.query(
      `UPDATE users
       SET deleted_at = NOW(), status = 'closed'
       WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );

    return (rowCount ?? 0) > 0;
  },
};
