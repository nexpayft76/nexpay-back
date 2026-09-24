import { pool, type Queryable } from "../config/db";
import type { UserStatus } from "../types/auth";

export interface UserRow {
  id: string;
  full_name: string;
  email: string;
  password_hash: string;
  status: UserStatus;
  created_at: Date;
  deleted_at: Date | null;
}

const USER_COLUMNS = "id, full_name, email, password_hash, status, created_at, deleted_at";

export async function findUserByEmail(email: string, db: Queryable = pool): Promise<UserRow | null> {
  const { rows } = await db.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE email = $1`, [email]);
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
  data: { fullName: string; email: string; passwordHash: string },
): Promise<UserRow> {
  const { rows } = await db.query<UserRow>(
    `INSERT INTO users (full_name, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING ${USER_COLUMNS}`,
    [data.fullName, data.email, data.passwordHash],
  );
  const user = rows[0];
  if (!user) throw new Error("INSERT INTO users no devolvió filas");
  return user;
}
