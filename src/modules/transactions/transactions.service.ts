import { withTransaction } from "../../config/db";
import { env } from "../../config/env";
import type { ArsRateType } from "../../integrations/dolarapi.client";
import { AppError } from "../../utils/app-error";
import { roundTo } from "../../utils/money";
import { assertSupported, getRateSnapshot, quoteRate, type ArsRateUsed, type RatesSource } from "../rates/rates.service";
import { usersRepository } from "../users/users.repository";
import { notificationsService } from "../notifications";
import { alertsService } from "../alerts/alerts.service";
import { walletsRepository } from "../wallets/wallets.repository";
import { BALANCE_EXCHANGE_TYPES, OWN_TRANSACTION_TYPES, type HistoryQuery } from "./transactions.middlewares";
import { transactionsRepository, type TransactionType } from "./transactions.repository";

/** Monedas locales del corredor. Pagar con una local por una fuerte es BUY; al revés, SELL. */
const LOCAL_CURRENCIES = new Set(["COP", "ARS"]);

export type ExchangeType = Exclude<TransactionType, "DEPOSIT" | "P2P">;

export interface ExchangeRequest {
  from_currency: string;
  to_currency: string;
  /** Total a debitar del origen, comisión incluida. */
  amount: number;
  /** Tipo de dólar si participa ARS (solo mercados legales). */
  ars_rate: Extract<ArsRateType, "oficial" | "mep">;
}

/** El detalle de un cambio: lo mismo se muestra antes de confirmar (cotización) y se guarda al ejecutar. */
export interface ExchangeQuote {
  type: ExchangeType;
  from_currency: string;
  to_currency: string;
  /** Total que se debita del origen. */
  from_amount: string;
  fee_percent: number;
  /** Comisión, en la moneda de origen. */
  fee_amount: string;
  /** Lo que efectivamente se convierte: from_amount - fee_amount. */
  converted_amount: string;
  /** Unidades de destino por 1 unidad de origen (misma tasa que el cotizador). */
  rate: number;
  /** Lo que se acredita en el destino. */
  to_amount: string;
  ars_rate: ArsRateUsed | null;
  rates_date: string;
  rates_source: RatesSource;
  warnings: string[];
}

export interface ExchangeResult extends ExchangeQuote {
  transaction_id: string;
  created_at: string;
  /** Saldos después del cambio (NUMERIC como texto). */
  balances: { from: string; to: string };
}

/** BUY: local → fuerte (ej. COP → USD). SELL: fuerte → local. EXCHANGE: local ↔ local o fuerte ↔ fuerte. */
export function classifyExchange(from: string, to: string): ExchangeType {
  const fromLocal = LOCAL_CURRENCIES.has(from);
  const toLocal = LOCAL_CURRENCIES.has(to);
  if (fromLocal && !toLocal) return "BUY";
  if (!fromLocal && toLocal) return "SELL";
  return "EXCHANGE";
}

/**
 * Calcula el cambio con la tasa del servidor (nunca una enviada por el cliente) y la comisión.
 * Los montos se manejan en unidades mínimas (centavos) para que la comisión y el neto cuadren exacto.
 */
async function buildQuote(input: ExchangeRequest): Promise<ExchangeQuote> {
  const snapshot = await getRateSnapshot();
  const from = assertSupported(snapshot.currencies, input.from_currency);
  const to = assertSupported(snapshot.currencies, input.to_currency);

  const fromScale = 10 ** from.decimals;
  const totalMinor = Math.round(input.amount * fromScale);
  if (Math.abs(input.amount * fromScale - totalMinor) > 1e-6) {
    throw new AppError(400, "INVALID_AMOUNT", `El monto admite como máximo ${from.decimals} decimales`);
  }

  for (const code of [from.code, to.code]) {
    if (snapshot.unavailable.includes(code)) {
      throw new AppError(503, "RATES_UNAVAILABLE", `La tasa de ${code} no está disponible en este momento`);
    }
  }

  const { rate, ars_rate } = quoteRate(snapshot, from.code, to.code, input.ars_rate);

  const feePercent = env.EXCHANGE_FEE_PERCENT;
  const feeMinor = Math.round((totalMinor * feePercent) / 100);
  const convertedMinor = totalMinor - feeMinor;
  const toAmount = roundTo((convertedMinor / fromScale) * rate, to.decimals);
  if (toAmount <= 0) {
    throw new AppError(400, "AMOUNT_TOO_SMALL", "El monto es demasiado chico para convertirlo");
  }

  return {
    type: classifyExchange(from.code, to.code),
    from_currency: from.code,
    to_currency: to.code,
    from_amount: (totalMinor / fromScale).toFixed(from.decimals),
    fee_percent: feePercent,
    fee_amount: (feeMinor / fromScale).toFixed(from.decimals),
    converted_amount: (convertedMinor / fromScale).toFixed(from.decimals),
    rate,
    to_amount: toAmount.toFixed(to.decimals),
    ars_rate,
    rates_date: snapshot.table.date,
    rates_source: snapshot.source,
    warnings: snapshot.warnings,
  };
}

/** Movimiento del historial de la cuenta, como lo ve su dueño. */
export interface HistoryItem {
  id: string;
  type: TransactionType;
  /** null en las recargas. */
  from_currency: string | null;
  to_currency: string;
  from_amount: string;
  to_amount: string;
  exchange_rate: number;
  fee_amount: string;
  fee_currency: string | null;
  fee_percent: number;
  ars_rate_type: string | null;
  created_at: string;
}

export interface HistoryPage {
  items: HistoryItem[];
  page: number;
  limit: number;
  total: number;
}

export const transactionsService = {
  /** Historial de la cuenta del usuario autenticado: recargas, compras, ventas e intercambios. */
  async listMine(userId: string, query: HistoryQuery): Promise<HistoryPage> {
    const wallet = await walletsRepository.findByUserId(userId);
    if (!wallet) throw new AppError(404, "WALLET_NOT_FOUND", "El usuario no tiene una wallet");
    const { rows, total } = await transactionsRepository.findPageByWallet(wallet.id, {
      types: !query.type ? [...OWN_TRANSACTION_TYPES] : query.type === "DEPOSIT" ? ["DEPOSIT"] : [...BALANCE_EXCHANGE_TYPES],
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    });
    return {
      items: rows.map((tx) => ({
        id: tx.id,
        type: tx.type,
        from_currency: tx.from_currency,
        to_currency: tx.to_currency,
        from_amount: tx.from_amount,
        to_amount: tx.to_amount,
        exchange_rate: Number(tx.exchange_rate),
        fee_amount: tx.fee_amount,
        fee_currency: tx.fee_currency,
        fee_percent: Number(tx.fee_percent),
        ars_rate_type: tx.ars_rate_type,
        created_at: new Date(tx.created_at).toISOString(),
      })),
      page: query.page,
      limit: query.limit,
      total,
    };
  },


  listTransactions: () => transactionsRepository.findAll(),
  getTransactionById: (id: string) => transactionsRepository.findById(id),

  /** Cotización exacta (con comisión) para mostrar antes de confirmar. No mueve saldos. */
  quoteExchange: (input: ExchangeRequest): Promise<ExchangeQuote> => buildQuote(input),

  /**
   * Compra, venta o intercambio en la wallet del usuario autenticado (el usuario sale del token).
   * Recalcula la tasa en el momento de ejecutar y aplica todo en una sola transacción SQL.
   */
  async exchange(userId: string, input: ExchangeRequest): Promise<ExchangeResult> {
    const wallet = await walletsRepository.findByUserId(userId);
    if (!wallet) throw new AppError(404, "WALLET_NOT_FOUND", "El usuario no tiene una wallet");

    const quote = await buildQuote(input);

    const record = await withTransaction((client) =>
      transactionsRepository.applyExchange(client, {
        wallet_id: wallet.id,
        type: quote.type,
        from_currency: quote.from_currency,
        to_currency: quote.to_currency,
        from_amount: quote.from_amount,
        to_amount: quote.to_amount,
        exchange_rate: quote.rate.toFixed(10),
        fee_amount: quote.fee_amount,
        fee_percent: String(quote.fee_percent),
        ars_rate_type: quote.ars_rate?.type ?? null,
      }),
    );

    const result: ExchangeResult = {
      ...quote,
      transaction_id: record.transaction.id,
      created_at: new Date(record.transaction.created_at).toISOString(),
      balances: record.balances,
    };

    void alertsService.onBalancesChanged(userId, [
      { currency: result.from_currency, amount: result.balances.from },
      { currency: result.to_currency, amount: result.balances.to },
    ], result.transaction_id);

    // Envío de email con el resumen de la transacción mediante AWS SES (asíncrono)
    void usersRepository.findById(userId).then((user) => {
      if (user) {
        void notificationsService.sendExchangeEmail({
          user: { id: user.id, email: user.email, full_name: user.full_name },
          type: result.type,
          from_currency: result.from_currency,
          to_currency: result.to_currency,
          from_amount: result.from_amount,
          to_amount: result.to_amount,
          rate: result.rate,
          fee_amount: result.fee_amount,
          fee_percent: result.fee_percent,
          transaction_id: result.transaction_id,
          created_at: result.created_at,
          ars_rate_type: result.ars_rate?.type ?? null,
          balances: result.balances,
        });
      }
    });

    return result;
  },
};
