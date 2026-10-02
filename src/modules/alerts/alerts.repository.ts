import { pool } from "../../config/db";
import type { AlertKind, AlertRecipient, AlertRule, CreateAlertInput, UpdateAlertInput } from "./alerts.types";

interface AlertRow extends Omit<AlertRule, "threshold" | "created_at" | "updated_at"> {
  threshold: number | string;
  created_at: Date | string;
  updated_at: Date | string;
}

const ALERT_COLUMNS = `id, user_id, kind, currency, base_currency, direction,
  threshold::float8 AS threshold, enabled, email_enabled, created_at, updated_at`;

function toAlert(row: AlertRow): AlertRule {
  return {
    ...row,
    threshold: Number(row.threshold),
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
  };
}

export const alertsRepository = {
  async findByUser(userId: string): Promise<AlertRule[]> {
    const { rows } = await pool.query<AlertRow>(
      `SELECT ${ALERT_COLUMNS} FROM user_alerts WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );
    return rows.map(toAlert);
  },

  async create(userId: string, input: CreateAlertInput): Promise<AlertRule> {
    const { rows } = await pool.query<AlertRow>(
      `INSERT INTO user_alerts (user_id, kind, currency, base_currency, direction, threshold, email_enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${ALERT_COLUMNS}`,
      [userId, input.kind, input.currency, input.base_currency, input.direction, input.threshold, input.email_enabled],
    );
    const row = rows[0];
    if (!row) throw new Error("INSERT INTO user_alerts no devolvió filas");
    return toAlert(row);
  },

  async update(userId: string, id: string, input: UpdateAlertInput): Promise<AlertRule | null> {
    const { rows } = await pool.query<AlertRow>(
      `UPDATE user_alerts
       SET kind = COALESCE($3, kind),
           currency = COALESCE($4, currency),
           base_currency = COALESCE($5, base_currency),
           direction = COALESCE($6, direction),
           threshold = COALESCE($7, threshold),
           email_enabled = COALESCE($8, email_enabled),
           enabled = COALESCE($9, enabled),
           condition_met = FALSE
       WHERE id = $1 AND user_id = $2
       RETURNING ${ALERT_COLUMNS}`,
      [id, userId, input.kind ?? null, input.currency ?? null, input.base_currency ?? null,
        input.direction ?? null, input.threshold ?? null, input.email_enabled ?? null, input.enabled ?? null],
    );
    return rows[0] ? toAlert(rows[0]) : null;
  },

  async delete(userId: string, id: string): Promise<boolean> {
    const { rowCount } = await pool.query("DELETE FROM user_alerts WHERE id = $1 AND user_id = $2", [id, userId]);
    return rowCount !== null && rowCount > 0;
  },

  async findEventRules(userId: string, kind: AlertKind, currency: string): Promise<AlertRule[]> {
    const { rows } = await pool.query<AlertRow>(
      `SELECT ${ALERT_COLUMNS}
       FROM user_alerts
       WHERE user_id = $1 AND kind = $2 AND currency = $3 AND enabled AND email_enabled`,
      [userId, kind, currency],
    );
    return rows.map(toAlert);
  },

  async findRateRules(): Promise<AlertRule[]> {
    const { rows } = await pool.query<AlertRow>(
      `SELECT ${ALERT_COLUMNS}
       FROM user_alerts
       WHERE enabled AND email_enabled AND kind IN ('daily_change', 'target_rate', 'stale_rates')`,
    );
    return rows.map(toAlert);
  },

  async claimEvent(ruleId: string, eventKey: string): Promise<AlertRecipient | null> {
    const { rows } = await pool.query<AlertRecipient>(
      `UPDATE user_alerts AS a
       SET last_event_key = $2
       FROM users AS u
       WHERE a.id = $1 AND a.user_id = u.id AND a.enabled AND a.email_enabled
         AND a.last_event_key IS DISTINCT FROM $2
       RETURNING u.id, u.email, u.full_name`,
      [ruleId, eventKey],
    );
    return rows[0] ?? null;
  },

  async setCondition(ruleId: string, conditionMet: boolean): Promise<AlertRecipient | null> {
    const { rows } = await pool.query<AlertRecipient>(
      `UPDATE user_alerts AS a
       SET condition_met = $2
       FROM users AS u
       WHERE a.id = $1 AND a.user_id = u.id AND a.enabled AND a.email_enabled
         AND a.condition_met IS DISTINCT FROM $2
       RETURNING u.id, u.email, u.full_name`,
      [ruleId, conditionMet],
    );
    return conditionMet ? rows[0] ?? null : null;
  },
};