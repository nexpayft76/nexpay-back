import { pool } from "../../config/db";
import type { PoolClient } from "pg";

export type TransactionType = "BUY" | "SELL" | "EXCHANGE" | "DEPOSIT";

export interface TransactionRecord {
  id: string;
  wallet_id: string;
  type: TransactionType;
  from_currency: string | null;
  to_currency: string;
  from_amount: string;
  to_amount: string;
  exchange_rate: string;
  created_at: string;
}

export interface CreateTransactionInput {
  wallet_id: string;
  type: TransactionType;
  from_currency: string | null;
  to_currency: string;
  from_amount: string;
  to_amount: string;
  exchange_rate: string;
}

export interface CurrencyPurchaseInput {
  wallet_id: string;
  from_currency: string;
  to_currency: string;
  from_amount: string;
  exchange_rate: string;
}

export interface CurrencyPurchaseResult {
  transaction: TransactionRecord;
  balances: {
    from: BalanceSnapshot;
    to: BalanceSnapshot;
  };
}

interface BalanceSnapshot {
  id: string;
  wallet_id: string;
  currency_code: string;
  amount: string;
  created_at: string;
  updated_at: string;
}

export class CurrencyPurchaseError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CurrencyPurchaseError";
  }
}

export const transactionsRepository = {
  async findAll(): Promise<TransactionRecord[]> {
    const { rows } = await pool.query<TransactionRecord>(
      "SELECT * FROM transactions ORDER BY created_at DESC",
    );
    return rows;
  },

  async findById(id: string): Promise<TransactionRecord | null> {
    const { rows } = await pool.query<TransactionRecord>("SELECT * FROM transactions WHERE id = $1", [id]);
    return rows[0] ?? null;
  },

  async buyCurrency(client: PoolClient, input: CurrencyPurchaseInput): Promise<CurrencyPurchaseResult> {
    const currencyResult = await client.query<{ code: string; decimals: number }>(
      `SELECT code, decimals
       FROM currencies
       WHERE code = ANY($1::varchar[]) AND is_active = true
       FOR SHARE`,
      [[input.from_currency, input.to_currency]],
    );

    if (currencyResult.rows.length !== 2) {
      throw new CurrencyPurchaseError(400, "CURRENCY_NOT_AVAILABLE", "Una o ambas monedas no existen o están inactivas");
    }

    const targetCurrency = currencyResult.rows.find((currency) => currency.code === input.to_currency);
    if (!targetCurrency) {
      throw new CurrencyPurchaseError(400, "CURRENCY_NOT_AVAILABLE", "La moneda destino no está disponible");
    }

    const balanceResult = await client.query<BalanceSnapshot>(
      `SELECT id, wallet_id, currency_code, amount::text AS amount, created_at, updated_at
       FROM balances
       WHERE wallet_id = $1 AND currency_code = ANY($2::varchar[])
       ORDER BY currency_code
       FOR UPDATE`,
      [input.wallet_id, [input.from_currency, input.to_currency]],
    );

    const sourceBalance = balanceResult.rows.find((balance) => balance.currency_code === input.from_currency);
    if (!sourceBalance) {
      throw new CurrencyPurchaseError(409, "INSUFFICIENT_BALANCE", "No tienes saldo disponible en la moneda origen");
    }

    const amountResult = await client.query<{ amount: string; is_positive: boolean }>(
      `SELECT round($1::numeric * $2::numeric, LEAST($3::integer, 8))::text AS amount,
              round($1::numeric * $2::numeric, LEAST($3::integer, 8)) > 0 AS is_positive`,
      [input.from_amount, input.exchange_rate, targetCurrency.decimals],
    );
    const toAmount = amountResult.rows[0].amount;

    if (!amountResult.rows[0].is_positive) {
      throw new CurrencyPurchaseError(400, "PURCHASE_AMOUNT_TOO_SMALL", "El monto convertido debe ser mayor que 0");
    }

    const debitResult = await client.query<BalanceSnapshot>(
      `UPDATE balances
       SET amount = amount - $1::numeric, updated_at = NOW()
       WHERE id = $2 AND amount >= $1::numeric
       RETURNING id, wallet_id, currency_code, amount::text AS amount, created_at, updated_at`,
      [input.from_amount, sourceBalance.id],
    );

    if (!debitResult.rows[0]) {
      throw new CurrencyPurchaseError(409, "INSUFFICIENT_BALANCE", "El saldo disponible es insuficiente para esta compra");
    }

    const creditResult = await client.query<BalanceSnapshot>(
      `INSERT INTO balances (wallet_id, currency_code, amount)
       VALUES ($1, $2, $3::numeric)
       ON CONFLICT (wallet_id, currency_code)
       DO UPDATE SET amount = balances.amount + EXCLUDED.amount, updated_at = NOW()
       RETURNING id, wallet_id, currency_code, amount::text AS amount, created_at, updated_at`,
      [input.wallet_id, input.to_currency, toAmount],
    );

    const transactionResult = await client.query<TransactionRecord>(
      `INSERT INTO transactions (
        wallet_id, type, from_currency, to_currency, from_amount, to_amount, exchange_rate
      ) VALUES ($1, 'BUY', $2, $3, $4, $5, $6)
      RETURNING *`,
      [input.wallet_id, input.from_currency, input.to_currency, input.from_amount, toAmount, input.exchange_rate],
    );

    return {
      transaction: transactionResult.rows[0],
      balances: {
        from: debitResult.rows[0],
        to: creditResult.rows[0],
      },
    };
  },

};
