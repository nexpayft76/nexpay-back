import type { PoolClient } from "pg";

import { pool, type Queryable } from "../../config/db";
import { walletsRepository } from "../wallets/wallets.repository";

export type FeeSource = "exchange" | "p2p";

/** Una comisión cobrada, en la moneda exacta en que se cobró. */
export interface CollectedFee {
  source: FeeSource;
  currency: string;
  /** NUMERIC como texto exacto. */
  amount: string;
  payer_wallet_id: string;
  transaction_id: string;
  offer_id?: string | null;
}

export interface FeeTotalRecord {
  currency: string;
  /** NUMERIC como texto exacto. */
  exchange: string;
  p2p: string;
  total: string;
  count: number;
}

export interface FeeRecord {
  id: string;
  source: FeeSource;
  currency_code: string;
  amount: string;
  transaction_id: string;
  offer_id: string | null;
  payer_email: string;
  payer_name: string;
  created_at: Date;
}

export const treasuryRepository = {
  /** Billetera de la cuenta propietaria (la que recibe las comisiones), o null si todavía no existe. */
  async findOwnerWalletId(db: Queryable = pool): Promise<string | null> {
    const { rows } = await db.query<{ id: string }>(
      `SELECT w.id FROM users u JOIN wallets w ON w.user_id = u.id
       WHERE u.is_owner AND u.deleted_at IS NULL
       LIMIT 1`,
    );
    return rows[0]?.id ?? null;
  },

  /**
   * Acredita las comisiones a la billetera propietaria y las registra, dentro de la transacción SQL de
   * `client`: si la operación falla, tampoco queda la comisión. Se acreditan ordenadas por moneda para
   * que dos operaciones simultáneas bloqueen los saldos de la tesorería siempre en el mismo orden.
   */
  async collect(client: PoolClient, fees: CollectedFee[]): Promise<void> {
    const charged = fees.filter((fee) => Number(fee.amount) > 0).sort((a, b) => a.currency.localeCompare(b.currency));
    if (charged.length === 0) return;

    const ownerWalletId = await this.findOwnerWalletId(client);
    for (const fee of charged) {
      if (ownerWalletId) await walletsRepository.creditBalance(client, ownerWalletId, fee.currency, fee.amount);
      await client.query(
        `INSERT INTO platform_fees (source, currency_code, amount, payer_wallet_id, transaction_id, offer_id, credited_wallet_id)
         VALUES ($1, $2, $3::numeric, $4, $5, $6, $7)`,
        [fee.source, fee.currency, fee.amount, fee.payer_wallet_id, fee.transaction_id, fee.offer_id ?? null, ownerWalletId],
      );
    }
  },

  /** Total cobrado por moneda, separado por origen (sumas exactas en NUMERIC). */
  async totals(): Promise<FeeTotalRecord[]> {
    const { rows } = await pool.query<FeeTotalRecord>(
      `SELECT currency_code AS currency,
              COALESCE(sum(amount) FILTER (WHERE source = 'exchange'), 0)::text AS exchange,
              COALESCE(sum(amount) FILTER (WHERE source = 'p2p'), 0)::text AS p2p,
              sum(amount)::text AS total,
              count(*)::int AS count
       FROM platform_fees
       GROUP BY currency_code
       ORDER BY currency_code`,
    );
    return rows;
  },

  /** Últimas comisiones cobradas, con quién las pagó. */
  async list(limit: number, offset: number): Promise<{ rows: FeeRecord[]; total: number }> {
    const [list, count] = await Promise.all([
      pool.query<FeeRecord>(
        `SELECT f.id, f.source, f.currency_code, f.amount::text AS amount, f.transaction_id, f.offer_id,
                u.email AS payer_email, u.full_name AS payer_name, f.created_at
         FROM platform_fees f
         JOIN wallets w ON w.id = f.payer_wallet_id
         JOIN users u ON u.id = w.user_id
         ORDER BY f.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset],
      ),
      pool.query<{ total: number }>("SELECT count(*)::int AS total FROM platform_fees"),
    ]);
    return { rows: list.rows, total: count.rows[0]?.total ?? 0 };
  },
};
