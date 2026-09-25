import { env } from "../config/env";
import { fetchUsdRates, type UsdRateTable } from "../integrations/frankfurter.client";
import { findActiveCurrencies, type CurrencyRow } from "../repositories/currency.repository";
import { AppError } from "../utils/app-error";
import { roundTo } from "../utils/money";

/** De dónde salieron las tasas: recién pedidas, de la caché vigente, o de la caché vencida porque la API falló. */
export type RatesSource = "live" | "cache" | "fallback";

interface CachedRates {
  table: UsdRateTable;
  fetchedAt: number;
  /** Monedas que se pidieron; si cambia el catálogo, la caché deja de servir. */
  codesKey: string;
}

export interface RateSnapshot {
  table: UsdRateTable;
  source: RatesSource;
  fetchedAt: string;
  currencies: CurrencyRow[];
}

const RATE_DECIMALS = 10; // igual que exchange_rate NUMERIC(24,10) en la tabla transactions

let cache: CachedRates | null = null;
let inFlight: Promise<UsdRateTable> | null = null;

/**
 * Devuelve la tabla de tasas usando caché con TTL y fallback:
 * 1. Si la caché está vigente, la usa sin llamar a la API.
 * 2. Si venció, pide tasas nuevas a Frankfurter (una sola petición aunque lleguen varias a la vez).
 * 3. Si Frankfurter falla, usa la última caché aunque esté vencida.
 * 4. Si no hay nada guardado, responde 503.
 */
export async function getRateSnapshot(): Promise<RateSnapshot> {
  const currencies = await findActiveCurrencies();
  const codes = currencies.map((c) => c.code);
  const codesKey = codes.join(",");
  const now = Date.now();
  const cacheMatches = cache !== null && cache.codesKey === codesKey;

  if (cache && cacheMatches && now - cache.fetchedAt < env.RATES_CACHE_TTL_SECONDS * 1000) {
    return { table: cache.table, source: "cache", fetchedAt: new Date(cache.fetchedAt).toISOString(), currencies };
  }

  try {
    inFlight ??= fetchUsdRates(codes).finally(() => {
      inFlight = null;
    });
    const table = await inFlight;
    cache = { table, fetchedAt: Date.now(), codesKey };
    return { table, source: "live", fetchedAt: new Date(cache.fetchedAt).toISOString(), currencies };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    if (cache && cacheMatches) {
      console.warn(`Frankfurter no disponible (${reason}); usando tasas en caché del ${cache.table.date}`);
      return { table: cache.table, source: "fallback", fetchedAt: new Date(cache.fetchedAt).toISOString(), currencies };
    }
    console.error(`Frankfurter no disponible y sin caché: ${reason}`);
    throw new AppError(503, "RATES_UNAVAILABLE", "Las tasas de cambio no están disponibles en este momento");
  }
}

/** Tasa cruzada: cuántas unidades de `to` vale 1 unidad de `from`, usando USD como pivote. */
export function crossRate(table: UsdRateTable, from: string, to: string): number {
  const fromPerUsd = table.rates[from];
  const toPerUsd = table.rates[to];
  if (fromPerUsd === undefined || toPerUsd === undefined) {
    throw new AppError(400, "UNSUPPORTED_CURRENCY", `No hay tasa disponible para ${from}/${to}`);
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
    if (code !== base) rates[code] = crossRate(snapshot.table, base, code);
  }

  return { base, date: snapshot.table.date, source: snapshot.source, fetchedAt: snapshot.fetchedAt, rates };
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

/** Solo para tests: vacía la caché en memoria. */
export function clearRatesCache(): void {
  cache = null;
  inFlight = null;
}
