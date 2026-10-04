export interface NotificationRecipient {
  id: string;
  email: string;
  full_name: string;
  theme?: "light" | "dark";
}

export type NotificationEmailType = "welcome" | "exchange" | "deposit" | "alert" | "password_changed" | "password_reset" | "p2p";

export interface WelcomeEmailData {
  user: NotificationRecipient;
}

export interface ExchangeNotificationData {
  user: NotificationRecipient;
  type: string; // "BUY" | "SELL" | "EXCHANGE"
  from_currency: string;
  to_currency: string;
  from_amount: string;
  to_amount: string;
  rate: number;
  fee_amount: string;
  fee_percent: number;
  transaction_id: string;
  created_at: string;
  ars_rate_type?: string | null;
  balances?: { from: string; to: string };
}

export interface DepositNotificationData {
  user: NotificationRecipient;
  currency: string;
  amount: string;
  new_balance: string;
  transaction_id: string;
  created_at: string;
}

/** Qué pasó con una oferta P2P (cada evento es un email distinto). */
export type P2PEmailEvent = "published" | "sold" | "bought" | "cancelled" | "expired";

export interface P2PEmailData {
  user: NotificationRecipient;
  event: P2PEmailEvent;
  offer_id: string;
  sell_currency: string;
  buy_currency: string;
  sell_amount: string;
  buy_amount: string;
  rate: number;
  fee_percent: number;
  /** Comisión y neto de quien recibe el email (vendedor o comprador). */
  fee_amount?: string;
  fee_currency?: string;
  receives?: string;
  /** Si publicó: lo que recibiría si aceptan. */
  seller_receives?: string;
  /** La otra parte, solo con nombre e inicial del apellido. */
  counterpart_name?: string;
  expires_at?: string;
  transaction_id?: string | null;
  created_at: string;
}

export interface AlertEmailData {
  user: NotificationRecipient;
  title: string;
  message: string;
}

export type UserNotificationType = "rate_alert" | "system";

export interface UserNotification {
  id: string;
  user_id: string;
  type: UserNotificationType;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
  alert_id?: string | null;
}

export interface CreateUserNotificationInput {
  type: UserNotificationType;
  title: string;
  message: string;
  read?: boolean;
  alert_id?: string | null;
}
