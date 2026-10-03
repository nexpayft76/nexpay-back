import type { PoolClient } from "pg";

import { pool, type Queryable } from "../../config/db";
import { AppError } from "../../utils/app-error";
import { walletsRepository } from "../wallets/wallets.repository";

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
  fee_amount: string;
  fee_currency: string | null;
  fee_percent: string;
  ars_rate_type: string | null;
  created_at: Date;
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

/** Cambio ya calculado por el servicio (tasa del servidor y comisión). Los montos van como texto exacto. */
export interface ExchangeInput {
  wallet_id: string;
  type: Exclude<TransactionType, "DEPOSIT">;
  from_currency: string;
  to_currency: string;
  /** Total que se debita del origen, comisión incluida. */
  from_amount: string;
  /** Lo que se acredita en el destino. */
  to_amount: string;
  exchange_rate: string;
  fee_amount: string;
  fee_percent: string;
  ars_rate_type: string | null;
}

export interface ExchangeRecord {
  transaction: TransactionRecord;
  /** Saldos después del cambio (NUMERIC como texto). */
  balances: { from: string; to: string };
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

  /**
   * Aplica un cambio de moneda dentro de la transacción SQL de `client` (base: trabajo de Nelson):
   * bloquea los dos saldos, debita el origen solo si alcanza, acredita el destino y lo registra.
   * Si algo falla, withTransaction hace ROLLBACK y no queda nada a medias.
   */
  async applyExchange(client: PoolClient, input: ExchangeInput): Promise<ExchangeRecord> {
    if (!(await walletsRepository.lockActiveUserForWallet(client, input.wallet_id))) {
      throw new AppError(401, "UNAUTHORIZED", "El usuario ya no está activo");
    }

    // FOR UPDATE: dos operaciones simultáneas sobre la misma wallet esperan su turno (sin saldo negativo).
    // ORDER BY fijo: siempre se bloquean en el mismo orden, así dos cambios cruzados no se trancan.
    await client.query(
      `SELECT id FROM balances
       WHERE wallet_id = $1 AND currency_code = ANY($2::varchar[])
       ORDER BY currency_code
       FOR UPDATE`,
      [input.wallet_id, [input.from_currency, input.to_currency]],
    );

    const debit = await client.query<{ amount: string }>(
      `UPDATE balances
       SET amount = amount - $1::numeric
       WHERE wallet_id = $2 AND currency_code = $3 AND amount >= $1::numeric
       RETURNING amount::text AS amount`,
      [input.from_amount, input.wallet_id, input.from_currency],
    );
    const fromBalance = debit.rows[0];
    if (!fromBalance) {
      throw new AppError(409, "INSUFFICIENT_BALANCE", `Saldo insuficiente en ${input.from_currency}`);
    }

    const credit = await client.query<{ amount: string }>(
      `INSERT INTO balances (wallet_id, currency_code, amount)
       VALUES ($1, $2, $3::numeric)
       ON CONFLICT (wallet_id, currency_code)
       DO UPDATE SET amount = balances.amount + EXCLUDED.amount
       RETURNING amount::text AS amount`,
      [input.wallet_id, input.to_currency, input.to_amount],
    );
    const toBalance = credit.rows[0];
    if (!toBalance) throw new Error("No se pudo acreditar el saldo de destino");

    const inserted = await client.query<TransactionRecord>(
      `INSERT INTO transactions (
         wallet_id, type, from_currency, to_currency, from_amount, to_amount, exchange_rate,
         fee_amount, fee_currency, fee_percent, ars_rate_type
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $3, $9, $10)
       RETURNING *`,
      [
        input.wallet_id,
        input.type,
        input.from_currency,
        input.to_currency,
        input.from_amount,
        input.to_amount,
        input.exchange_rate,
        input.fee_amount,
        input.fee_percent,
        input.ars_rate_type,
      ],
    );
    const transaction = inserted.rows[0];
    if (!transaction) throw new Error("INSERT INTO transactions no devolvió filas");

    return { transaction, balances: { from: fromBalance.amount, to: toBalance.amount } };
  },

  /**
   * Registra una recarga en el historial, dentro de la transacción SQL de `db`.
   * Un DEPOSIT no tiene moneda de origen (from_currency NULL, regla de la migración 002) y su tasa es 1.
   */
  async insertDeposit(
    db: Queryable,
    input: { wallet_id: string; currency_code: string; amount: string },
  ): Promise<{ id: string; created_at: Date }> {
    const { rows } = await db.query<{ id: string; created_at: Date }>(
      `INSERT INTO transactions (wallet_id, type, from_currency, to_currency, from_amount, to_amount, exchange_rate)
       VALUES ($1, 'DEPOSIT', NULL, $2, $3, $3, 1)
       RETURNING id, created_at`,
      [input.wallet_id, input.currency_code, input.amount],
    );
    const row = rows[0];
    if (!row) throw new Error("INSERT INTO transactions no devolvió filas");
    return row;
  },
};
