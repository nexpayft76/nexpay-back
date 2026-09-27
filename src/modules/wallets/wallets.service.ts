import { AppError } from "../../utils/app-error";
import { roundTo } from "../../utils/money";
import { crossRate, getRateSnapshot, type RatesSource } from "../rates/rates.service";
import { walletsRepository } from "./wallets.repository";

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
        const rate =
          balance.currency === target.currency ? 1 : crossRate(snapshot.table, balance.currency, target.currency);
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
};
