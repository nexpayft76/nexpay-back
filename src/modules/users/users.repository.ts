import { pool } from "../../config/db";

export interface UserRecord {
  id: string;
  full_name: string;
  email: string;
  status: "active" | "suspended" | "closed";
  theme?: UserTheme;
  in_app_notifications?: boolean;
  email_notifications?: boolean;
  created_at: string;
  updated_at: string;
}

export interface UpdateUserInput {
  full_name?: string;
  email?: string;
  status?: "active" | "suspended" | "closed";
}

export type UserTheme = "light" | "dark";

export interface UserPreferences {
  theme: UserTheme;
  in_app_notifications: boolean;
  email_notifications: boolean;
}

export const usersRepository = {
  async getThemeById(id: string): Promise<UserTheme | null> {
    const { rows } = await pool.query<{ theme: UserTheme }>(
      `SELECT theme FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return rows[0]?.theme ?? null;
  },

  async getPreferencesById(id: string): Promise<UserPreferences | null> {
    const { rows } = await pool.query<UserPreferences>(
      `SELECT theme, in_app_notifications, email_notifications
       FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return rows[0] ?? null;
  },

  async updateTheme(id: string, theme: UserTheme): Promise<UserTheme | null> {
    const { rows } = await pool.query<{ theme: UserTheme }>(
      `UPDATE users SET theme = $2 WHERE id = $1 AND deleted_at IS NULL RETURNING theme`,
      [id, theme],
    );
    return rows[0]?.theme ?? null;
  },

  async updatePreferences(
    id: string,
    input: Partial<UserPreferences>,
  ): Promise<UserPreferences | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (input.theme !== undefined) {
      fields.push(`theme = $${index}`);
      values.push(input.theme);
      index += 1;
    }

    if (input.in_app_notifications !== undefined) {
      fields.push(`in_app_notifications = $${index}`);
      values.push(input.in_app_notifications);
      index += 1;
    }

    if (input.email_notifications !== undefined) {
      fields.push(`email_notifications = $${index}`);
      values.push(input.email_notifications);
      index += 1;
    }

    if (fields.length === 0) {
      return this.getPreferencesById(id);
    }

    values.push(id);
    const { rows } = await pool.query<UserPreferences>(
      `UPDATE users
       SET ${fields.join(", ")}
       WHERE id = $${index} AND deleted_at IS NULL
       RETURNING theme, in_app_notifications, email_notifications`,
      values,
    );

    return rows[0] ?? null;
  },
  async findAll(): Promise<UserRecord[]> {
    const { rows } = await pool.query<UserRecord>(
      `SELECT id, full_name, email, status, created_at, updated_at
       FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC`,
    );
    return rows;
  },

  async findById(id: string): Promise<UserRecord | null> {
    const { rows } = await pool.query<UserRecord>(
      `SELECT id, full_name, email, status, created_at, updated_at
       FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return rows[0] ?? null;
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
      RETURNING id, full_name, email, status, created_at, updated_at`,
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
