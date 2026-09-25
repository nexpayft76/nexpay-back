import { env } from "../config/env";
import { fetchArsMepQuote, type ArsQuote } from "../integrations/dolarapi.client";
import { fetchUsdRates, PIVOT_CURRENCY, type UsdRateTable } from "../integrations/frankfurter.client";
import { findActiveCurrencies, type CurrencyRow } from "../repositories/currency.repository";
import { AppError } from "../utils/app-error";
import { createCachedSource, type CacheSource } from "../utils/cached-source";
import { roundTo } from "../utils/money";

export type RatesSource = CacheSource;

/** Monedas cuya tasa NO sale de Frankfurter. */
const ARS = "ARS";

export interface ProviderStatus {
  provider: "frankfurter" | "dolarapi";
  label: string;
  currencies: string[];
  source: RatesSource;
  /** Cuándo lo pidió NexPay. */
  fetchedAt: string;
  /** Cuándo lo publicó el proveedor (fecha diaria en Frankfurter, fecha y hora en DolarApi). */
  publishedAt: string;
}

export interface RateSnapshot {
  table: UsdRateTable;
  source: RatesSource;
  fetchedAt: string;
  currencies: CurrencyRow[];
  providers: ProviderStatus[];
  /** Monedas activas sin tasa en este momento (su proveedor falló y no hay caché). */
  unavailable: string[];
}

const RATE_DECIMALS = 10; // igual que exchange_rate NUMERIC(24,10) en la tabla transactions

const frankfurterCache = createCachedSource<UsdRateTable>("Frankfurter", env.RATES_CACHE_TTL_SECONDS * 1000);
const arsCache = createCachedSource<ArsQuote>("DolarApi (MEP)", env.ARS_RATES_CACHE_TTL_SECONDS * 1000);

/** El estado combinado es el "peor" de los proveedores: fallback > live > cache. */
function combineSources(sources: RatesSource[]): RatesSource {
  if (sources.includes("fallback")) return "fallback";
  if (sources.includes("live")) return "live";
  return "cache";
}

/**
 * Arma una tabla "unidades por 1 USD" combinando proveedores:
 * - Frankfurter: tasas oficiales diarias (USD, EUR, COP...).
 * - DolarApi: dólar MEP para ARS, que cambia durante el día.
 * Si un proveedor falla y no tiene caché, sus monedas quedan en `unavailable` y el resto sigue funcionando.
 */
export async function getRateSnapshot(): Promise<RateSnapshot> {
  const currencies = await findActiveCurrencies();
  const codes = currencies.map((c) => c.code);
  const frankfurterCodes = codes.filter((c) => c !== ARS);

  const rates: Record<string, number> = { [PIVOT_CURRENCY]: 1 };
  const providers: ProviderStatus[] = [];
  const unavailable: string[] = [];
  let date = new Date().toISOString().slice(0, 10);

  try {
    const result = await frankfurterCache.get(frankfurterCodes.join(","), () => fetchUsdRates(frankfurterCodes));
    Object.assign(rates, result.value.rates);
    date = result.value.date;
    providers.push({
      provider: "frankfurter",
      label: "Frankfurter · tasa oficial diaria",
      currencies: frankfurterCodes.filter((c) => c !== PIVOT_CURRENCY),
      source: result.source,
      fetchedAt: new Date(result.fetchedAt).toISOString(),
      publishedAt: result.value.date,
    });
  } catch {
    unavailable.push(...frankfurterCodes.filter((c) => c !== PIVOT_CURRENCY));
  }

  if (codes.includes(ARS)) {
    try {
      const result = await arsCache.get(ARS, fetchArsMepQuote);
      rates[ARS] = result.value.arsPerUsd;
      providers.push({
        provider: "dolarapi",
        label: "DolarApi · dólar MEP (varía en el día)",
        currencies: [ARS],
        source: result.source,
        fetchedAt: new Date(result.fetchedAt).toISOString(),
        publishedAt: result.value.publishedAt,
      });
    } catch {
      unavailable.push(ARS);
    }
  }

  if (providers.length === 0 && codes.some((c) => c !== PIVOT_CURRENCY)) {
    throw new AppError(503, "RATES_UNAVAILABLE", "Las tasas de cambio no están disponibles en este momento");
  }

  const oldestFetch = providers.map((p) => p.fetchedAt).sort()[0] ?? new Date().toISOString();
  return {
    table: { date, rates },
    source: combineSources(providers.map((p) => p.source)),
    fetchedAt: oldestFetch,
    currencies,
    providers,
    unavailable,
  };
}

/** Tasa cruzada: cuántas unidades de `to` vale 1 unidad de `from`, usando USD como pivote. */
export function crossRate(table: UsdRateTable, from: string, to: string): number {
  const fromPerUsd = table.rates[from];
  const toPerUsd = table.rates[to];
  if (fromPerUsd === undefined || toPerUsd === undefined) {
    const missing = fromPerUsd === undefined ? from : to;
    throw new AppError(503, "RATES_UNAVAILABLE", `La tasa de ${missing} no está disponible en este momento`);
  }
  return roundTo(toPerUsd / fromPerUsd, RATE_DECIMALS);
}

export function assertSupported(currencies: CurrencyRow[], code: string): CurrencyRow {
  const currency = currencies.find((c) => c.code === code);
  if (!currency) {
    const supported = currencies.map((c) => c.code).join(", ");
    throw new AppError(400, "UNSUPPORTED_CURRENCY", `Moneda no soportada: ${code}. Disponibles: ${supported}`);
  }
  return currency;
}

export async function getRates(base: string) {
  const snapshot = await getRateSnapshot();
  assertSupported(snapshot.currencies, base);

  const rates: Record<string, number> = {};
  for (const { code } of snapshot.currencies) {
    if (code !== base && !snapshot.unavailable.includes(code)) {
      rates[code] = crossRate(snapshot.table, base, code);
    }
  }

  return {
    base,
    date: snapshot.table.date,
    source: snapshot.source,
    fetchedAt: snapshot.fetchedAt,
    rates,
    unavailable: snapshot.unavailable,
    providers: snapshot.providers,
  };
}

export async function convert(from: string, to: string, amount: number) {
  const snapshot = await getRateSnapshot();
  assertSupported(snapshot.currencies, from);
  const target = assertSupported(snapshot.currencies, to);

  const rate = crossRate(snapshot.table, from, to);
  return {
    from,
    to,
    amount,
    rate,
    result: roundTo(amount * rate, target.decimals),
    date: snapshot.table.date,
    source: snapshot.source,
  };
}

/** Solo para tests: vacía las cachés en memoria. */
export function clearRatesCache(): void {
  frankfurterCache.clear();
  arsCache.clear();
}
