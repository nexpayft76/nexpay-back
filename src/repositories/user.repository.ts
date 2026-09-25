import { pool, type Queryable } from "../config/db";
import type { UserStatus } from "../types/auth";

export interface UserRow {
  id: string;
  full_name: string;
  email: string;
  /** null en cuentas creadas con Google (sin contraseña). */
  password_hash: string | null;
  google_id: string | null;
  status: UserStatus;
  created_at: Date;
  deleted_at: Date | null;
}

const USER_COLUMNS = "id, full_name, email, password_hash, google_id, status, created_at, deleted_at";

export async function findUserByEmail(email: string, db: Queryable = pool): Promise<UserRow | null> {
  const { rows } = await db.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE email = $1`, [email]);
  return rows[0] ?? null;
}

export async function findUserByGoogleId(googleId: string, db: Queryable = pool): Promise<UserRow | null> {
  const { rows } = await db.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE google_id = $1`, [googleId]);
  return rows[0] ?? null;
}

/** Busca un usuario que no haya sido borrado lógicamente. */
export async function findUserById(id: string, db: Queryable = pool): Promise<UserRow | null> {
  const { rows } = await db.query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return rows[0] ?? null;
}

export async function insertUser(
  db: Queryable,
  data: { fullName: string; email: string; passwordHash: string | null; googleId?: string | null },
): Promise<UserRow> {
  const { rows } = await db.query<UserRow>(
    `INSERT INTO users (full_name, email, password_hash, google_id)
     VALUES ($1, $2, $3, $4)
     RETURNING ${USER_COLUMNS}`,
    [data.fullName, data.email, data.passwordHash, data.googleId ?? null],
  );
  const user = rows[0];
  if (!user) throw new Error("INSERT INTO users no devolvió filas");
  return user;
}

/** Vincula una cuenta de Google a un usuario existente (mismo email verificado). */
export async function linkGoogleId(userId: string, googleId: string, db: Queryable = pool): Promise<UserRow> {
  const { rows } = await db.query<UserRow>(
    `UPDATE users SET google_id = $2 WHERE id = $1 RETURNING ${USER_COLUMNS}`,
    [userId, googleId],
  );
  const user = rows[0];
  if (!user) throw new Error("UPDATE users no devolvió filas");
  return user;
}
