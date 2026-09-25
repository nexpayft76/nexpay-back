import type { Queryable } from "../config/db";

export interface DepositRow {
  id: string;
  created_at: Date;
}

/** Registra una recarga en el historial (inmutable). Sin moneda de origen y con tasa 1. */
export async function insertDeposit(
  db: Queryable,
  data: { walletId: string; currencyCode: string; amount: string },
): Promise<DepositRow> {
  const { rows } = await db.query<DepositRow>(
    `INSERT INTO transactions (wallet_id, type, from_currency, to_currency, from_amount, to_amount, exchange_rate)
     VALUES ($1, 'DEPOSIT', NULL, $2, $3, $3, 1)
     RETURNING id, created_at`,
    [data.walletId, data.currencyCode, data.amount],
  );
  const row = rows[0];
  if (!row) throw new Error("INSERT INTO transactions no devolvió filas");
  return row;
}
