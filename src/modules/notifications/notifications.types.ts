export interface NotificationRecipient {
  email: string;
  full_name: string;
}

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
