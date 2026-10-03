import { pool, withTransaction } from "../../config/db";

export interface PasswordResetUser {
  id: string;
  email: string;
  full_name: string;
}

export const passwordResetRepository = {
  async create(userId: string, tokenHash: string, expiresAt: Date): Promise<boolean> {
    return withTransaction(async (client) => {
      const { rowCount } = await client.query(
        `SELECT id FROM users
         WHERE id = $1 AND deleted_at IS NULL AND status = 'active' AND password_hash IS NOT NULL
         FOR NO KEY UPDATE`,
        [userId],
      );
      if ((rowCount ?? 0) === 0) return false;

      await client.query(
        `UPDATE password_reset_tokens SET used_at = NOW()
         WHERE user_id = $1 AND used_at IS NULL`,
        [userId],
      );
      await client.query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [userId, tokenHash, expiresAt],
      );
      return true;
    });
  },

  async isValid(tokenHash: string): Promise<boolean> {
    const { rowCount } = await pool.query(
      `SELECT 1
       FROM password_reset_tokens t
       JOIN users u ON u.id = t.user_id
       WHERE t.token_hash = $1
         AND t.used_at IS NULL
         AND t.expires_at > NOW()
         AND u.deleted_at IS NULL
         AND u.status = 'active'
         AND u.password_hash IS NOT NULL`,
      [tokenHash],
    );
    return (rowCount ?? 0) > 0;
  },

  async consumeAndUpdatePassword(tokenHash: string, passwordHash: string): Promise<PasswordResetUser | null> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const lockedUser = await client.query(
        `SELECT u.id
         FROM users u
         JOIN password_reset_tokens t ON t.user_id = u.id
         WHERE t.token_hash = $1
         FOR NO KEY UPDATE OF u`,
        [tokenHash],
      );
      if ((lockedUser.rowCount ?? 0) === 0) {
        await client.query("COMMIT");
        return null;
      }

      const { rows } = await client.query<PasswordResetUser & { token_id: string }>(
        `SELECT t.id AS token_id, u.id, u.email, u.full_name
         FROM password_reset_tokens t
         JOIN users u ON u.id = t.user_id
         WHERE t.token_hash = $1
           AND t.used_at IS NULL
           AND t.expires_at > NOW()
           AND u.deleted_at IS NULL
           AND u.status = 'active'
           AND u.password_hash IS NOT NULL
         FOR UPDATE OF t`,
        [tokenHash],
      );
      const reset = rows[0];
      if (!reset) {
        await client.query("COMMIT");
        return null;
      }

      const { rowCount } = await client.query(
        `UPDATE users SET password_hash = $2, session_version = session_version + 1, updated_at = NOW()
         WHERE id = $1 AND deleted_at IS NULL AND status = 'active'`,
        [reset.id, passwordHash],
      );
      if ((rowCount ?? 0) === 0) {
        await client.query("ROLLBACK");
        return null;
      }
      await client.query(
        `UPDATE password_reset_tokens
         SET used_at = NOW()
         WHERE user_id = $1 AND used_at IS NULL`,
        [reset.id],
      );
      await client.query("COMMIT");
      return { id: reset.id, email: reset.email, full_name: reset.full_name };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  },
};
