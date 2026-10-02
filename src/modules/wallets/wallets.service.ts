import { withTransaction } from "../../config/db";
import { env } from "../../config/env";
import { AppError } from "../../utils/app-error";
import { roundTo } from "../../utils/money";
import { currenciesRepository } from "../currencies/currencies.repository";
import { getRateSnapshot, quoteRate, type RatesSource } from "../rates/rates.service";
import { transactionsRepository } from "../transactions/transactions.repository";
import { usersRepository } from "../users/users.repository";
import { notificationsService } from "../notifications";
import { alertsService } from "../alerts/alerts.service";
import { walletsRepository } from "./wallets.repository";

/** Máximo por recarga ficticia, en la moneda recargada (evita saldos absurdos en la demo). */
const DEPOSIT_LIMITS: Record<string, number> = { COP: 50_000_000, ARS: 20_000_000, USD: 10_000, EUR: 10_000 };
const DEFAULT_DEPOSIT_LIMIT = 10_000;

export interface DepositInput {
  currency: string;
  amount: number;
}

export interface DepositResult {
  transaction_id: string;
  type: "DEPOSIT";
  currency: string;
  /** Monto recargado (texto exacto con los decimales de la moneda). */
  amount: string;
  /** Saldo de esa moneda después de la recarga (NUMERIC como texto). */
  new_balance: string;
  created_at: string;
}

function hasAtMostDecimals(value: number, decimals: number): boolean {
  const scaled = value * 10 ** decimals;
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}

export interface MyWalletBalance {
  currency: string;
  name: string;
  decimals: number;
  /** Saldo exacto (NUMERIC como texto). */
  amount: string;
  /** Equivalente aproximado en la moneda de valorización; null si su tasa no está disponible. */
  value_in_target: number | null;
  updated_at: string;
}

export interface MyWalletValuation {
  currency: string;
  total: number;
  rates_date: string;
  rates_source: RatesSource;
  /** Monedas que no entraron en el total porque su tasa nunca estuvo disponible. */
  missing_currencies: string[];
  /** Avisos de las tasas (ej. "se usa la última tasa válida"). */
  warnings: string[];
}

export interface MyWallet {
  wallet_id: string;
  created_at: string;
  balances: MyWalletBalance[];
  /** null si ninguna tasa está disponible: los saldos se muestran igual. */
  valuation: MyWalletValuation | null;
}

// Las wallets se crean solo en el registro (POST /api/auth/register), junto con sus balances.
export const walletsService = {
  listWallets: () => walletsRepository.findAll(),
  getWalletById: (id: string) => walletsRepository.findById(id),
  getWalletByUserId: (userId: string) => walletsRepository.findByUserId(userId),

  /**
   * La wallet del usuario autenticado con sus saldos y el total valorizado en `valuedIn`.
   * Si una tasa falla, el total se calcula con las demás y se avisa; los saldos siempre se devuelven.
   */
  async getMyWallet(userId: string, valuedIn: string): Promise<MyWallet> {
    const wallet = await walletsRepository.findByUserId(userId);
    if (!wallet) throw new AppError(404, "WALLET_NOT_FOUND", "El usuario no tiene una wallet");

    const rows = await walletsRepository.findBalancesWithCurrency(wallet.id);
    const balances: MyWalletBalance[] = rows.map((row) => ({
      currency: row.currency_code,
      name: row.currency_name,
      decimals: row.decimals,
      amount: row.amount,
      value_in_target: null,
      updated_at: row.updated_at.toISOString(),
    }));

    const target = balances.find((b) => b.currency === valuedIn);
    if (!target) {
      const supported = balances.map((b) => b.currency).join(", ");
      throw new AppError(400, "UNSUPPORTED_CURRENCY", `Moneda no soportada: ${valuedIn}. Disponibles: ${supported}`);
    }

    let valuation: MyWalletValuation | null = null;
    try {
      const snapshot = await getRateSnapshot();
      if (snapshot.unavailable.includes(target.currency)) {
        throw new AppError(503, "RATES_UNAVAILABLE", `La tasa de ${target.currency} no está disponible`);
      }

      let total = 0;
      const missing: string[] = [];
      for (const balance of balances) {
        if (snapshot.unavailable.includes(balance.currency)) {
          missing.push(balance.currency);
          continue;
        }
        // Mismo precio que el cotizador (quoteRate con dólar MEP): recibir ARS = compra, pagar con ARS = venta.
        // Así el total estimado coincide con lo que el usuario obtendría al convertir en /api/rates/convert.
        let rate = 1;
        if (balance.currency !== target.currency) {
          try {
            rate = quoteRate(snapshot, balance.currency, target.currency).rate;
          } catch (err) {
            if (!(err instanceof AppError) || err.statusCode !== 503) throw err;
            missing.push(balance.currency);
            continue;
          }
        }
        balance.value_in_target = roundTo(Number(balance.amount) * rate, target.decimals);
        total += balance.value_in_target;
      }

      valuation = {
        currency: target.currency,
        total: roundTo(total, target.decimals),
        rates_date: snapshot.table.date,
        rates_source: snapshot.source,
        missing_currencies: missing,
        warnings: snapshot.warnings,
      };
    } catch (err) {
      // Sin tasas (503) la wallet se muestra igual, solo que sin total.
      if (!(err instanceof AppError) || err.statusCode !== 503) throw err;
    }

    return {
      wallet_id: wallet.id,
      created_at: new Date(wallet.created_at).toISOString(),
      balances,
      valuation,
    };
  },

  /**
   * Recarga con dinero ficticio (modo demo) en la wallet del usuario autenticado.
   * En una sola transacción SQL suma el monto al saldo y registra un DEPOSIT en el historial:
   * si algo falla, no queda ni el saldo sin registro ni el registro sin saldo.
   */
  async deposit(userId: string, input: DepositInput): Promise<DepositResult> {
    if (!env.demoDepositsEnabled) {
      throw new AppError(403, "DEPOSITS_DISABLED", "Las recargas de prueba están desactivadas");
    }

    const currency = await currenciesRepository.findByCode(input.currency);
    if (!currency || !currency.is_active) {
      throw new AppError(400, "UNSUPPORTED_CURRENCY", `Moneda no soportada: ${input.currency}`);
    }
    if (!hasAtMostDecimals(input.amount, currency.decimals)) {
      throw new AppError(400, "INVALID_AMOUNT", `El monto admite como máximo ${currency.decimals} decimales`);
    }
    const limit = DEPOSIT_LIMITS[currency.code] ?? DEFAULT_DEPOSIT_LIMIT;
    if (input.amount > limit) {
      throw new AppError(400, "DEPOSIT_LIMIT_EXCEEDED", `El máximo por recarga es ${limit} ${currency.code}`);
    }

    const wallet = await walletsRepository.findByUserId(userId);
    if (!wallet) throw new AppError(404, "WALLET_NOT_FOUND", "El usuario no tiene una wallet");

    const amount = input.amount.toFixed(currency.decimals);

    const result = await withTransaction(async (client) => {
      const newBalance = await walletsRepository.creditBalance(client, wallet.id, currency.code, amount);
      const tx = await transactionsRepository.insertDeposit(client, {
        wallet_id: wallet.id,
        currency_code: currency.code,
        amount,
      });
      return {
        transaction_id: tx.id,
        type: "DEPOSIT" as const,
        currency: currency.code,
        amount,
        new_balance: newBalance,
        created_at: tx.created_at.toISOString(),
      };
    });

    void alertsService.onDeposit(userId, {
      transactionId: result.transaction_id,
      currency: result.currency,
      amount: result.amount,
      newBalance: result.new_balance,
    });

    // Envío de email con el resumen de recarga de saldo mediante AWS SES (asíncrono)
    void usersRepository.findById(userId).then((user) => {
      if (user) {
        void notificationsService.sendDepositEmail({
          user: { id: user.id, email: user.email, full_name: user.full_name },
          currency: result.currency,
          amount: result.amount,
          new_balance: result.new_balance,
          transaction_id: result.transaction_id,
          created_at: result.created_at,
        });
      }
    });

    return result;
  },
};
