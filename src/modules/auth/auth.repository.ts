import { pool, type Queryable } from "../../config/db";
import type { UserStatus } from "./auth.types";

export interface AuthUserRecord {
  id: string;
  full_name: string;
  email: string;
  /** null en cuentas creadas con Google (sin contraseña). */
  password_hash: string | null;
  status: UserStatus;
  created_at: Date;
  deleted_at: Date | null;
}

const COLUMNS = "id, full_name, email, password_hash, status, created_at, deleted_at";

export const authRepository = {
  async findByEmail(email: string, db: Queryable = pool): Promise<AuthUserRecord | null> {
    const { rows } = await db.query<AuthUserRecord>(`SELECT ${COLUMNS} FROM users WHERE email = $1`, [email]);
    return rows[0] ?? null;
  },

  /** Solo usuarios no borrados lógicamente. */
  async findActiveById(id: string, db: Queryable = pool): Promise<AuthUserRecord | null> {
    const { rows } = await db.query<AuthUserRecord>(
      `SELECT ${COLUMNS} FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return rows[0] ?? null;
  },

  async createUser(
    db: Queryable,
    input: { full_name: string; email: string; password_hash: string },
  ): Promise<AuthUserRecord> {
    const { rows } = await db.query<AuthUserRecord>(
      `INSERT INTO users (full_name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING ${COLUMNS}`,
      [input.full_name, input.email, input.password_hash],
    );
    const user = rows[0];
    if (!user) throw new Error("INSERT INTO users no devolvió filas");
    return user;
  },

  async createWallet(db: Queryable, userId: string): Promise<string> {
    const { rows } = await db.query<{ id: string }>("INSERT INTO wallets (user_id) VALUES ($1) RETURNING id", [userId]);
    const wallet = rows[0];
    if (!wallet) throw new Error("INSERT INTO wallets no devolvió filas");
    return wallet.id;
  },

  /**
   * Un balance en 0 por cada moneda activa del catálogo.
   * Si se agrega una moneda a `currencies`, los usuarios nuevos la reciben sin tocar este código.
   */
  async createInitialBalances(db: Queryable, walletId: string): Promise<void> {
    await db.query(
      `INSERT INTO balances (wallet_id, currency_code)
       SELECT $1, code FROM currencies WHERE is_active = TRUE`,
      [walletId],
    );
  },
};
