import { findBalancesByWalletId, findWalletByUserId } from "../repositories/wallet.repository";
import { AppError } from "../utils/app-error";
import { roundTo } from "../utils/money";
import { crossRate, getRateSnapshot, type RatesSource } from "./rates.service";

export interface WalletBalance {
  currency: string;
  name: string;
  decimals: number;
  /** Saldo exacto tal como está en la base de datos (NUMERIC como string). */
  amount: string;
  /** Equivalente aproximado en la moneda de valorización; null si no hay tasas. */
  valueInTarget: number | null;
  updatedAt: string;
}

export interface WalletValuation {
  currency: string;
  total: number;
  ratesDate: string;
  ratesSource: RatesSource;
}

export interface WalletView {
  walletId: string;
  createdAt: string;
  balances: WalletBalance[];
  /** null cuando las tasas no están disponibles: los saldos se muestran igual. */
  valuation: WalletValuation | null;
}

export async function getWallet(userId: string, valuedIn: string): Promise<WalletView> {
  const wallet = await findWalletByUserId(userId);
  if (!wallet) throw new AppError(404, "WALLET_NOT_FOUND", "El usuario no tiene una wallet");

  const rows = await findBalancesByWalletId(wallet.id);
  const balances: WalletBalance[] = rows.map((row) => ({
    currency: row.currency_code,
    name: row.currency_name,
    decimals: row.decimals,
    amount: row.amount,
    valueInTarget: null,
    updatedAt: row.updated_at.toISOString(),
  }));

  const target = balances.find((b) => b.currency === valuedIn);
  if (!target) {
    const supported = balances.map((b) => b.currency).join(", ");
    throw new AppError(400, "UNSUPPORTED_CURRENCY", `Moneda no soportada: ${valuedIn}. Disponibles: ${supported}`);
  }

  let valuation: WalletValuation | null = null;
  try {
    const snapshot = await getRateSnapshot();
    let total = 0;
    for (const balance of balances) {
      const rate = balance.currency === target.currency ? 1 : crossRate(snapshot.table, balance.currency, target.currency);
      balance.valueInTarget = roundTo(Number(balance.amount) * rate, target.decimals);
      total += balance.valueInTarget;
    }
    valuation = {
      currency: target.currency,
      total: roundTo(total, target.decimals),
      ratesDate: snapshot.table.date,
      ratesSource: snapshot.source,
    };
  } catch (err) {
    // Sin tasas (503) la wallet se sigue mostrando, solo que sin valorización.
    if (!(err instanceof AppError) || err.statusCode !== 503) throw err;
  }

  return { walletId: wallet.id, createdAt: wallet.created_at.toISOString(), balances, valuation };
}
