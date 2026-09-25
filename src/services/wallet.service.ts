import { withTransaction } from "../config/db";
import { env } from "../config/env";
import { findActiveCurrency } from "../repositories/currency.repository";
import { insertDeposit } from "../repositories/transaction.repository";
import { creditBalance, findBalancesByWalletId, findWalletByUserId } from "../repositories/wallet.repository";
import type { DepositInput } from "../schemas/wallet.schema";
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
  /** Monedas con saldo que no entraron en el total porque su tasa no está disponible. */
  missingCurrencies: string[];
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
    // Si la moneda de valorización no tiene tasa, no se puede calcular ningún equivalente.
    if (snapshot.unavailable.includes(target.currency)) {
      throw new AppError(503, "RATES_UNAVAILABLE", `La tasa de ${target.currency} no está disponible`);
    }

    let total = 0;
    const missingCurrencies: string[] = [];
    for (const balance of balances) {
      if (snapshot.unavailable.includes(balance.currency)) {
        missingCurrencies.push(balance.currency);
        continue;
      }
      const rate = balance.currency === target.currency ? 1 : crossRate(snapshot.table, balance.currency, target.currency);
      balance.valueInTarget = roundTo(Number(balance.amount) * rate, target.decimals);
      total += balance.valueInTarget;
    }
    valuation = {
      currency: target.currency,
      total: roundTo(total, target.decimals),
      ratesDate: snapshot.table.date,
      ratesSource: snapshot.source,
      missingCurrencies,
    };
  } catch (err) {
    // Sin tasas (503) la wallet se sigue mostrando, solo que sin valorización.
    if (!(err instanceof AppError) || err.statusCode !== 503) throw err;
  }

  return { walletId: wallet.id, createdAt: wallet.created_at.toISOString(), balances, valuation };
}

/** Máximo por recarga ficticia, en la moneda recargada. Evita saldos absurdos en la demo. */
const DEPOSIT_LIMITS: Record<string, number> = { USD: 10_000, EUR: 10_000, COP: 50_000_000, ARS: 20_000_000 };
const DEFAULT_DEPOSIT_LIMIT = 10_000;

export interface DepositResult {
  transactionId: string;
  type: "DEPOSIT";
  currency: string;
  amount: string;
  newBalance: string;
  createdAt: string;
}

function hasAtMostDecimals(value: number, decimals: number): boolean {
  const scaled = value * 10 ** decimals;
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}

/**
 * Recarga con dinero ficticio (modo demo). En una sola transacción SQL:
 * suma el monto al balance y registra un DEPOSIT en el historial.
 */
export async function deposit(userId: string, input: DepositInput): Promise<DepositResult> {
  if (!env.demoDepositsEnabled) {
    throw new AppError(403, "DEPOSITS_DISABLED", "Las recargas de prueba están desactivadas");
  }

  const currency = await findActiveCurrency(input.currency);
  if (!currency) {
    throw new AppError(400, "UNSUPPORTED_CURRENCY", `Moneda no soportada: ${input.currency}`);
  }
  if (!hasAtMostDecimals(input.amount, currency.decimals)) {
    throw new AppError(400, "INVALID_AMOUNT", `El monto admite como máximo ${currency.decimals} decimales`);
  }
  const limit = DEPOSIT_LIMITS[currency.code] ?? DEFAULT_DEPOSIT_LIMIT;
  if (input.amount > limit) {
    throw new AppError(400, "DEPOSIT_LIMIT_EXCEEDED", `El máximo por recarga es ${limit} ${currency.code}`);
  }

  const amount = input.amount.toFixed(currency.decimals);

  return withTransaction(async (client) => {
    const wallet = await findWalletByUserId(userId, client);
    if (!wallet) throw new AppError(404, "WALLET_NOT_FOUND", "El usuario no tiene una wallet");

    const newBalance = await creditBalance(client, wallet.id, currency.code, amount);
    const tx = await insertDeposit(client, { walletId: wallet.id, currencyCode: currency.code, amount });

    return {
      transactionId: tx.id,
      type: "DEPOSIT",
      currency: currency.code,
      amount,
      newBalance,
      createdAt: tx.created_at.toISOString(),
    };
  });
}
