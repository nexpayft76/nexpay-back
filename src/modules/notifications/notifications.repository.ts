import { pool } from "../../config/db";

import type { CreateUserNotificationInput, NotificationEmailType, UserNotification } from "./notifications.types";

export interface CreateEmailNotificationInput {
  user_id: string;
  recipient_email: string;
  email_type: NotificationEmailType;
  subject: string;
}

export const notificationsRepository = {
  async createPending(input: CreateEmailNotificationInput): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO email_notifications (user_id, recipient_email, email_type, subject)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [input.user_id, input.recipient_email, input.email_type, input.subject],
    );
    const row = rows[0];
    if (!row) throw new Error("INSERT INTO email_notifications no devolvió filas");
    return row.id;
  },

  async updateResult(
    id: string,
    result: { status: "sent" | "failed"; provider_message_id?: string; error_message?: string },
  ): Promise<void> {
    const { rowCount } = await pool.query(
      `UPDATE email_notifications
       SET status = CAST($2 AS VARCHAR(10)),
           provider_message_id = CAST($3 AS VARCHAR(255)),
           error_message = $4,
           sent_at = CASE WHEN CAST($2 AS VARCHAR(10)) = 'sent' THEN now() ELSE NULL END
       WHERE id = $1`,
      [id, result.status, result.provider_message_id ?? null, result.error_message ?? null],
    );
    if (rowCount === 0) throw new Error("No se encontró el registro del email para actualizar");
  },

  async listByUser(userId: string): Promise<UserNotification[]> {
    const { rows } = await pool.query<UserNotification>(
      `SELECT id, user_id, type, title, message, read, created_at, alert_id
       FROM user_notifications
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId],
    );
    return rows.map((row) => ({
      ...row,
      created_at: new Date(row.created_at).toISOString(),
      alert_id: row.alert_id ?? null,
    }));
  },

  async create(userId: string, input: CreateUserNotificationInput): Promise<UserNotification> {
    const { rows } = await pool.query<UserNotification>(
      `INSERT INTO user_notifications (user_id, type, title, message, read, alert_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, user_id, type, title, message, read, created_at, alert_id`,
      [userId, input.type, input.title, input.message, input.read ?? false, input.alert_id ?? null],
    );
    const row = rows[0];
    if (!row) throw new Error("INSERT INTO user_notifications no devolvió filas");
    return {
      ...row,
      created_at: new Date(row.created_at).toISOString(),
      alert_id: row.alert_id ?? null,
    };
  },

  async updateRead(userId: string, id: string, read: boolean): Promise<UserNotification | null> {
    const { rows } = await pool.query<UserNotification>(
      `UPDATE user_notifications
       SET read = $3
       WHERE id = $1 AND user_id = $2
       RETURNING id, user_id, type, title, message, read, created_at, alert_id`,
      [id, userId, read],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      ...row,
      created_at: new Date(row.created_at).toISOString(),
      alert_id: row.alert_id ?? null,
    };
  },

  async delete(userId: string, id: string): Promise<boolean> {
    const { rowCount } = await pool.query(
      `DELETE FROM user_notifications WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return rowCount !== null && rowCount > 0;
  },
};