import type { PoolClient } from "pg";

import { pool, type Queryable } from "../../config/db";
import { AppError } from "../../utils/app-error";
import { walletsRepository } from "../wallets/wallets.repository";
import type { P2PCalc } from "./p2p.calc";

export type P2POfferStatus = "open" | "completed" | "cancelled" | "expired";

export interface P2POfferRecord {
  id: string;
  seller_wallet_id: string;
  sell_currency: string;
  buy_currency: string;
  sell_amount: string;
  rate: string;
  buy_amount: string;
  market_rate: string;
  fee_percent: string;
  seller_fee: string;
  seller_receives: string;
  buyer_fee: string;
  buyer_receives: string;
  status: P2POfferStatus;
  buyer_wallet_id: string | null;
  seller_tx_id: string | null;
  buyer_tx_id: string | null;
  created_at: Date;
  expires_at: Date;
  closed_at: Date | null;
}

/** Oferta con el nombre del vendedor y su reputación (para el mercado). */
export interface P2PMarketRecord extends P2POfferRecord {
  seller_name: string;
  seller_user_id: string;
  /** Intercambios P2P completados por el vendedor (como vendedor o comprador). */
  completed_trades: number;
}

/** Oferta vencida: lo retenido vuelve al vendedor. */
export interface ReleasedOffer {
  id: string;
  seller_wallet_id: string;
  sell_currency: string;
  sell_amount: string;
  buy_currency: string;
  buy_amount: string;
  rate: string;
  fee_percent: string;
  seller_user_id: string;
}

const OFFER_COLUMNS = `o.id, o.seller_wallet_id, o.sell_currency, o.buy_currency,
  o.sell_amount::text AS sell_amount, o.rate::text AS rate, o.buy_amount::text AS buy_amount,
  o.market_rate::text AS market_rate, o.fee_percent::text AS fee_percent,
  o.seller_fee::text AS seller_fee, o.seller_receives::text AS seller_receives,
  o.buyer_fee::text AS buyer_fee, o.buyer_receives::text AS buyer_receives,
  o.status, o.buyer_wallet_id, o.seller_tx_id, o.buyer_tx_id, o.created_at, o.expires_at, o.closed_at`;

/** Bloquea las cuentas (usuarios) de las wallets en orden fijo: dos operaciones cruzadas no se trancan. */
async function lockAccounts(client: PoolClient, walletIds: string[]): Promise<void> {
  for (const walletId of [...walletIds].sort()) {
    if (!(await walletsRepository.lockActiveUserForWallet(client, walletId))) {
      throw new AppError(409, "ACCOUNT_NOT_ACTIVE", "Una de las cuentas ya no está activa");
    }
  }
}

/** Debita solo si alcanza el saldo (y lo bloquea hasta el COMMIT). Devuelve el saldo nuevo. */
async function debit(client: PoolClient, walletId: string, currency: string, amount: string): Promise<string> {
  const { rows } = await client.query<{ amount: string }>(
    `UPDATE balances SET amount = amount - $1::numeric
     WHERE wallet_id = $2 AND currency_code = $3 AND amount >= $1::numeric
     RETURNING amount::text AS amount`,
    [amount, walletId, currency],
  );
  const row = rows[0];
  if (!row) throw new AppError(409, "INSUFFICIENT_BALANCE", `Saldo insuficiente en ${currency}`);
  return row.amount;
}

async function insertP2PTransaction(
  client: PoolClient,
  input: {
    wallet_id: string;
    from_currency: string;
    to_currency: string;
    from_amount: string;
    to_amount: string;
    exchange_rate: string;
    fee_amount: string;
    fee_percent: string;
  },
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO transactions (
       wallet_id, type, from_currency, to_currency, from_amount, to_amount, exchange_rate,
       fee_amount, fee_currency, fee_percent
     ) VALUES ($1, 'P2P', $2, $3, $4, $5, $6, $7, $3, $8)
     RETURNING id`,
    [
      input.wallet_id,
      input.from_currency,
      input.to_currency,
      input.from_amount,
      input.to_amount,
      input.exchange_rate,
      input.fee_amount,
      input.fee_percent,
    ],
  );
  const row = rows[0];
  if (!row) throw new Error("INSERT INTO transactions no devolvió filas");
  return row.id;
}

export const p2pRepository = {
  /**
   * Publica una oferta: bloquea la cuenta, revisa el límite de ofertas abiertas, retiene el monto
   * (lo saca del saldo) y guarda la oferta. Todo en la transacción SQL de `client`.
   */
  async createOffer(
    client: PoolClient,
    input: { wallet_id: string; sell_currency: string; buy_currency: string; calc: P2PCalc; ttl_hours: number; max_open: number },
  ): Promise<{ offer: P2POfferRecord; balance: string }> {
    await lockAccounts(client, [input.wallet_id]);

    const open = await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM p2p_offers WHERE seller_wallet_id = $1 AND status = 'open'",
      [input.wallet_id],
    );
    if (Number(open.rows[0]?.count ?? 0) >= input.max_open) {
      throw new AppError(409, "TOO_MANY_OFFERS", `Puedes tener como máximo ${input.max_open} ofertas abiertas`);
    }

    const balance = await debit(client, input.wallet_id, input.sell_currency, input.calc.sell_amount);

    const { calc } = input;
    const { rows } = await client.query<P2POfferRecord>(
      `INSERT INTO p2p_offers AS o (
         seller_wallet_id, sell_currency, buy_currency, sell_amount, rate, buy_amount, market_rate,
         fee_percent, seller_fee, seller_receives, buyer_fee, buyer_receives, expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now() + make_interval(hours => $13))
       RETURNING ${OFFER_COLUMNS}`,
      [
        input.wallet_id,
        input.sell_currency,
        input.buy_currency,
        calc.sell_amount,
        calc.rate,
        calc.buy_amount,
        calc.market_rate,
        calc.fee_percent,
        calc.seller_fee,
        calc.seller_receives,
        calc.buyer_fee,
        calc.buyer_receives,
        input.ttl_hours,
      ],
    );
    const offer = rows[0];
    if (!offer) throw new Error("INSERT INTO p2p_offers no devolvió filas");
    return { offer, balance };
  },

  /** Ofertas abiertas y vigentes de otros usuarios, opcionalmente de un par. */
  async listOpen(filters: { exclude_wallet_id: string; sell_currency?: string; buy_currency?: string; limit: number }): Promise<P2PMarketRecord[]> {
    const { rows } = await pool.query<P2PMarketRecord>(
      `SELECT ${OFFER_COLUMNS}, u.full_name AS seller_name, u.id AS seller_user_id,
         (SELECT count(*) FROM p2p_offers c
          WHERE c.status = 'completed'
            AND (c.seller_wallet_id = o.seller_wallet_id OR c.buyer_wallet_id = o.seller_wallet_id))::int AS completed_trades
       FROM p2p_offers o
       JOIN wallets w ON w.id = o.seller_wallet_id
       JOIN users u ON u.id = w.user_id
       WHERE o.status = 'open' AND o.expires_at > now() AND o.seller_wallet_id <> $1
         AND ($2::varchar IS NULL OR o.sell_currency = $2)
         AND ($3::varchar IS NULL OR o.buy_currency = $3)
       ORDER BY o.created_at DESC
       LIMIT $4`,
      [filters.exclude_wallet_id, filters.sell_currency ?? null, filters.buy_currency ?? null, filters.limit],
    );
    return rows;
  },

  /** Ofertas publicadas por una wallet (todas, de la más nueva a la más vieja). */
  async listBySeller(walletId: string, limit = 50): Promise<P2POfferRecord[]> {
    const { rows } = await pool.query<P2POfferRecord>(
      `SELECT ${OFFER_COLUMNS} FROM p2p_offers o WHERE o.seller_wallet_id = $1 ORDER BY o.created_at DESC LIMIT $2`,
      [walletId, limit],
    );
    return rows;
  },

  /**
   * Acepta una oferta: intercambio instantáneo y atómico. Bloquea la oferta y las DOS cuentas
   * (cualquier otra operación de esos usuarios espera a que termine), cobra al comprador,
   * acredita a ambos con su comisión descontada y registra una transacción para cada uno.
   */
  async acceptOffer(
    client: PoolClient,
    input: { offer_id: string; buyer_wallet_id: string },
  ): Promise<{ offer: P2POfferRecord; seller_user_id: string; buyer_balances: { paid: string; received: string }; seller_balance: string }> {
    const found = await client.query<P2POfferRecord>(
      `SELECT ${OFFER_COLUMNS} FROM p2p_offers o WHERE o.id = $1 FOR UPDATE`,
      [input.offer_id],
    );
    const offer = found.rows[0];
    if (!offer) throw new AppError(404, "OFFER_NOT_FOUND", "La oferta no existe");
    if (offer.seller_wallet_id === input.buyer_wallet_id) {
      throw new AppError(409, "OWN_OFFER", "No puedes aceptar tu propia oferta");
    }
    if (offer.status !== "open" || offer.expires_at.getTime() <= Date.now()) {
      throw new AppError(409, "OFFER_NOT_AVAILABLE", "La oferta ya no está disponible");
    }

    await lockAccounts(client, [offer.seller_wallet_id, input.buyer_wallet_id]);

    // Comprador: paga buy_amount y recibe lo retenido menos su comisión.
    const buyerPaid = await debit(client, input.buyer_wallet_id, offer.buy_currency, offer.buy_amount);
    const buyerReceived = await walletsRepository.creditBalance(client, input.buyer_wallet_id, offer.sell_currency, offer.buyer_receives);
    // Vendedor: lo retenido ya salió de su saldo al publicar; recibe el pago menos su comisión.
    const sellerBalance = await walletsRepository.creditBalance(client, offer.seller_wallet_id, offer.buy_currency, offer.seller_receives);

    const sellerTx = await insertP2PTransaction(client, {
      wallet_id: offer.seller_wallet_id,
      from_currency: offer.sell_currency,
      to_currency: offer.buy_currency,
      from_amount: offer.sell_amount,
      to_amount: offer.seller_receives,
      exchange_rate: offer.rate,
      fee_amount: offer.seller_fee,
      fee_percent: offer.fee_percent,
    });
    const buyerTx = await insertP2PTransaction(client, {
      wallet_id: input.buyer_wallet_id,
      from_currency: offer.buy_currency,
      to_currency: offer.sell_currency,
      from_amount: offer.buy_amount,
      to_amount: offer.buyer_receives,
      exchange_rate: (1 / Number(offer.rate)).toPrecision(10),
      fee_amount: offer.buyer_fee,
      fee_percent: offer.fee_percent,
    });

    const updated = await client.query<P2POfferRecord>(
      `UPDATE p2p_offers o
       SET status = 'completed', buyer_wallet_id = $2, seller_tx_id = $3, buyer_tx_id = $4, closed_at = now()
       WHERE o.id = $1
       RETURNING ${OFFER_COLUMNS}`,
      [offer.id, input.buyer_wallet_id, sellerTx, buyerTx],
    );
    const completed = updated.rows[0];
    if (!completed) throw new Error("UPDATE p2p_offers no devolvió filas");

    const seller = await client.query<{ user_id: string }>("SELECT user_id FROM wallets WHERE id = $1", [offer.seller_wallet_id]);

    return {
      offer: completed,
      seller_user_id: seller.rows[0]?.user_id ?? "",
      buyer_balances: { paid: buyerPaid, received: buyerReceived },
      seller_balance: sellerBalance,
    };
  },

  /** Cancela una oferta abierta del vendedor y le devuelve lo retenido. */
  async cancelOffer(client: PoolClient, input: { offer_id: string; seller_wallet_id: string }): Promise<{ offer: P2POfferRecord; balance: string }> {
    const found = await client.query<P2POfferRecord>(
      `SELECT ${OFFER_COLUMNS} FROM p2p_offers o WHERE o.id = $1 AND o.seller_wallet_id = $2 FOR UPDATE`,
      [input.offer_id, input.seller_wallet_id],
    );
    const offer = found.rows[0];
    if (!offer) throw new AppError(404, "OFFER_NOT_FOUND", "La oferta no existe");
    if (offer.status !== "open") throw new AppError(409, "OFFER_NOT_AVAILABLE", "La oferta ya está cerrada");

    await lockAccounts(client, [input.seller_wallet_id]);
    const balance = await walletsRepository.creditBalance(client, input.seller_wallet_id, offer.sell_currency, offer.sell_amount);

    const updated = await client.query<P2POfferRecord>(
      `UPDATE p2p_offers o SET status = 'cancelled', closed_at = now() WHERE o.id = $1 RETURNING ${OFFER_COLUMNS}`,
      [offer.id],
    );
    const cancelled = updated.rows[0];
    if (!cancelled) throw new Error("UPDATE p2p_offers no devolvió filas");
    return { offer: cancelled, balance };
  },

  /**
   * Cierra las ofertas vencidas y devuelve lo retenido a cada vendedor.
   * SKIP LOCKED: si otra operación está usando una oferta (ej. aceptándola), se deja para la próxima pasada.
   */
  async releaseExpired(db: Queryable): Promise<ReleasedOffer[]> {
    const { rows } = await db.query<ReleasedOffer>(
      `WITH expired AS (
         SELECT id FROM p2p_offers
         WHERE status = 'open' AND expires_at <= now()
         ORDER BY expires_at
         LIMIT 100
         FOR UPDATE SKIP LOCKED
       )
       UPDATE p2p_offers o SET status = 'expired', closed_at = now()
       FROM expired e, wallets w
       WHERE o.id = e.id AND w.id = o.seller_wallet_id
       RETURNING o.id, o.seller_wallet_id, o.sell_currency, o.sell_amount::text AS sell_amount,
         o.buy_currency, o.buy_amount::text AS buy_amount, o.rate::text AS rate, o.fee_percent::text AS fee_percent,
         w.user_id AS seller_user_id`,
    );
    for (const offer of rows) {
      await walletsRepository.creditBalance(db, offer.seller_wallet_id, offer.sell_currency, offer.sell_amount);
    }
    return rows;
  },
};
