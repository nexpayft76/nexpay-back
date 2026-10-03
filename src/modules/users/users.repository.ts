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

/** Datos que un usuario ve de su propia cuenta (sin contraseña ni campos internos). */
export interface MyProfile {
  id: string;
  full_name: string;
  email: string;
  status: "active" | "suspended" | "closed";
  created_at: string;
}

export type CloseAccountResult = "closed" | "has_balance" | "not_found";

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

  /** Actualiza solo nombre y/o email de la cuenta del propio usuario (nunca el estado). */
  async updateProfile(id: string, input: { full_name?: string; email?: string }): Promise<MyProfile | null> {
    const { rows } = await pool.query<MyProfile>(
      `UPDATE users
       SET full_name = COALESCE($2, full_name),
           email = COALESCE($3, email),
           updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id, full_name, email, status, created_at`,
      [id, input.full_name ?? null, input.email ?? null],
    );
    return rows[0] ?? null;
  },

  /**
   * Cierra la cuenta (borrado lógico) solo si todos sus saldos están en 0. Es una única sentencia,
   * así que no hay carrera entre "revisar el saldo" y "cerrar": si entra dinero justo antes, no cierra.
   */
  async close(id: string): Promise<CloseAccountResult> {
    const { rowCount } = await pool.query(
      `UPDATE users
       SET deleted_at = NOW(), status = 'closed', updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM wallets w
           JOIN balances b ON b.wallet_id = w.id
           WHERE w.user_id = users.id AND b.amount > 0
         )`,
      [id],
    );
    if ((rowCount ?? 0) > 0) return "closed";

    const { rowCount: stillActive } = await pool.query(
      `SELECT 1 FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return (stillActive ?? 0) > 0 ? "has_balance" : "not_found";
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
