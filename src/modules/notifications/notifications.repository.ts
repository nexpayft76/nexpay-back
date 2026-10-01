import { pool } from "../../config/db";

import type { NotificationEmailType } from "./notifications.types";

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
       SET status = $2,
           provider_message_id = $3,
           error_message = $4,
           sent_at = CASE WHEN $2 = 'sent' THEN now() ELSE NULL END
       WHERE id = $1`,
      [id, result.status, result.provider_message_id ?? null, result.error_message ?? null],
    );
    if (rowCount === 0) throw new Error("No se encontró el registro del email para actualizar");
  },
};