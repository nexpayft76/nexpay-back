export const ALERT_KINDS = [
  "daily_change",
  "target_rate",
  "low_balance",
  "stale_rates",
  "deposit_received",
] as const;

export type AlertKind = (typeof ALERT_KINDS)[number];
export type AlertDirection = "up" | "down";

export interface AlertRule {
  id: string;
  user_id: string;
  kind: AlertKind;
  currency: string;
  base_currency: string;
  direction: AlertDirection;
  threshold: number;
  enabled: boolean;
  email_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateAlertInput {
  kind: AlertKind;
  currency: string;
  base_currency: string;
  direction: AlertDirection;
  threshold: number;
  email_enabled: boolean;
}

export type UpdateAlertInput = Partial<CreateAlertInput> & { enabled?: boolean };

export interface AlertRecipient {
  id: string;
  email: string;
  full_name: string;
}

