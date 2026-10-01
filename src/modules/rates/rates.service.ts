import { env } from "../../config/env";
import {
  ARS_RATE_TYPES,
  ArsQuotesSchema,
  DEFAULT_ARS_RATE_TYPE,
  fetchArsQuotes,
  type ArsQuote,
  type ArsQuotes,
  type ArsRateType,
} from "../../integrations/dolarapi.client";
import {
  fetchUsdRates,
  PIVOT_CURRENCY,
  UsdRateTableSchema,
  type UsdRateTable,
} from "../../integrations/frankfurter.client";
import { AppError } from "../../utils/app-error";
import { createCachedSource, type CacheSource } from "../../utils/cached-source";
import { roundTo } from "../../utils/money";
import { currenciesRepository, type CurrencyRecord } from "../currencies/currencies.repository";
import { createRatesStore } from "./rates.repository";

export type RatesSource = CacheSource;

/** Moneda cuya tasa sale de DolarApi y no de Frankfurter. */
const ARS = "ARS";

/** Igual que exchange_rate NUMERIC(24,10) en la tabla transactions. */
const RATE_DECIMALS = 10;

export interface ProviderStatus {
  provider: "frankfurter" | "dolarapi";
  label: string;
  currencies: string[];
  source: RatesSource;
  /** true si el proveedor falló y se está usando su última tasa válida. */
  stale: boolean;
  /** Cuándo lo pidió NexPay. */
  fetched_at: string;
  /** Cuándo lo publicó el proveedor (fecha diaria en Frankfurter, fecha y hora en DolarApi). */
  published_at: string;
}

export interface RateSnapshot {
  table: UsdRateTable;
  /** Cotizaciones de ARS por tipo (oficial, mep, blue), o null si DolarApi nunca respondió. */
  ars: ArsQuotes | null;
  source: RatesSource;
  fetched_at: string;
  currencies: CurrencyRecord[];
  providers: ProviderStatus[];
  /** Monedas activas sin ninguna tasa (su proveedor nunca respondió). */
  unavailable: string[];
  /** Avisos para mostrar al usuario (ej. "se usa la última tasa válida"). */
  warnings: string[];
}

const frankfurterCache = createCachedSource(
  "Frankfurter",
  env.RATES_CACHE_TTL_SECONDS * 1000,
  createRatesStore("frankfurter", UsdRateTableSchema),
);
const arsCache = createCachedSource(
  "DolarApi",
  env.ARS_RATES_CACHE_TTL_SECONDS * 1000,
  createRatesStore("dolarapi", ArsQuotesSchema),
);

/** El estado combinado es el "peor" de los proveedores: fallback > live > cache. */
function combineSources(sources: RatesSource[]): RatesSource {
  if (sources.includes("fallback")) return "fallback";
  if (sources.includes("live")) return "live";
  return "cache";
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" });
}

function staleWarning(label: string, currencies: string[], fetchedAt: number): string {
  return (
    `${label} (${currencies.join(", ")}) no está disponible por un problema de conexión. ` +
    `Se usa la última tasa válida (obtenida el ${formatDate(new Date(fetchedAt).toISOString())}).`
  );
}

/**
 * Arma una tabla "unidades por 1 USD" combinando proveedores:
 * - Frankfurter: tasas oficiales diarias (USD, EUR, COP...).
 * - DolarApi: dólar oficial, MEP y blue para ARS (la tabla usa el MEP, promedio compra/venta).
 * Si un proveedor falla se usa su última tasa válida (memoria o BD) y se agrega un aviso en `warnings`.
 */
export async function getRateSnapshot(): Promise<RateSnapshot> {
  const currencies = await currenciesRepository.findAll();
  const codes = currencies.map((c) => c.code).sort();
  const frankfurterCodes = codes.filter((c) => c !== ARS);
  const frankfurterQuotes = frankfurterCodes.filter((c) => c !== PIVOT_CURRENCY);

  const rates: Record<string, number> = { [PIVOT_CURRENCY]: 1 };
  const providers: ProviderStatus[] = [];
  const unavailable: string[] = [];
  const warnings: string[] = [];
  let date = new Date().toISOString().slice(0, 10);
  let ars: ArsQuotes | null = null;

  try {
    const result = await frankfurterCache.get(frankfurterCodes.join(","), () => fetchUsdRates(frankfurterCodes));
    Object.assign(rates, result.value.rates);
    date = result.value.date;
    const stale = result.source === "fallback";
    if (stale) warnings.push(staleWarning("Frankfurter", frankfurterQuotes, result.fetchedAt));
    providers.push({
      provider: "frankfurter",
      label: "Frankfurter · tasa oficial diaria",
      currencies: frankfurterQuotes,
      source: result.source,
      stale,
      fetched_at: new Date(result.fetchedAt).toISOString(),
      published_at: result.value.date,
    });
  } catch {
    unavailable.push(...frankfurterQuotes);
    warnings.push(`No hay ninguna tasa registrada para ${frankfurterQuotes.join(", ")}.`);
  }

  if (codes.includes(ARS)) {
    try {
      const result = await arsCache.get(ARS, fetchArsQuotes);
      ars = result.value;
      const mep = ars[DEFAULT_ARS_RATE_TYPE];
      if (mep) rates[ARS] = mep.mid;
      const stale = result.source === "fallback";
      if (stale) warnings.push(staleWarning("DolarApi", [ARS], result.fetchedAt));
      providers.push({
        provider: "dolarapi",
        label: "DolarApi · dólar oficial, MEP y blue (varían en el día)",
        currencies: [ARS],
        source: result.source,
        stale,
        fetched_at: new Date(result.fetchedAt).toISOString(),
        published_at: mep?.published_at ?? new Date(result.fetchedAt).toISOString(),
      });
    } catch {
      unavailable.push(ARS);
      warnings.push("No hay ninguna tasa registrada para ARS.");
    }
  }

  if (providers.length === 0 && codes.some((c) => c !== PIVOT_CURRENCY)) {
    throw new AppError(503, "RATES_UNAVAILABLE", "Las tasas de cambio no están disponibles en este momento");
  }

  const oldestFetch = providers.map((p) => p.fetched_at).sort()[0] ?? new Date().toISOString();
  return {
    table: { date, rates },
    ars,
    source: combineSources(providers.map((p) => p.source)),
    fetched_at: oldestFetch,
    currencies,
    providers,
    unavailable,
    warnings,
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

export function assertSupported(currencies: CurrencyRecord[], code: string): CurrencyRecord {
  const currency = currencies.find((c) => c.code === code);
  if (!currency) {
    const supported = currencies.map((c) => c.code).join(", ");
    throw new AppError(400, "UNSUPPORTED_CURRENCY", `Moneda no soportada: ${code}. Disponibles: ${supported}`);
  }
  return currency;
}

function getArsQuote(snapshot: RateSnapshot, type: ArsRateType): ArsQuote {
  const quote = snapshot.ars?.[type];
  if (!quote) {
    throw new AppError(503, "RATES_UNAVAILABLE", `La cotización del dólar ${ARS_RATE_TYPES[type].label} no está disponible`);
  }
  return quote;
}

export interface ArsRateUsed {
  type: ArsRateType;
  label: string;
  /** "compra" si el usuario recibe ARS (vende dólares); "venta" si paga con ARS (compra dólares). */
  price_used: "compra" | "venta";
  compra: number;
  venta: number;
  published_at: string;
}

/**
 * Tasa para convertir `from` → `to`. Si participa ARS, usa el tipo de dólar elegido y el precio
 * según la dirección: recibir ARS = precio de compra; pagar con ARS = precio de venta.
 */
export function quoteRate(
  snapshot: RateSnapshot,
  from: string,
  to: string,
  arsRateType: ArsRateType = DEFAULT_ARS_RATE_TYPE,
): { rate: number; ars_rate: ArsRateUsed | null } {
  if (from !== ARS && to !== ARS) {
    return { rate: crossRate(snapshot.table, from, to), ars_rate: null };
  }

  const quote = getArsQuote(snapshot, arsRateType);
  const priceUsed = to === ARS ? "compra" : "venta";
  const table: UsdRateTable = {
    date: snapshot.table.date,
    rates: { ...snapshot.table.rates, [ARS]: quote[priceUsed] },
  };

  return {
    rate: crossRate(table, from, to),
    ars_rate: {
      type: arsRateType,
      label: ARS_RATE_TYPES[arsRateType].label,
      price_used: priceUsed,
      compra: quote.compra,
      venta: quote.venta,
      published_at: quote.published_at,
    },
  };
}

export const ratesService = {
  async getRates(base: string) {
    const snapshot = await getRateSnapshot();
    assertSupported(snapshot.currencies, base);
    if (snapshot.unavailable.includes(base)) {
      throw new AppError(503, "RATES_UNAVAILABLE", `La tasa de ${base} no está disponible en este momento`);
    }

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
      fetched_at: snapshot.fetched_at,
      rates,
      unavailable: snapshot.unavailable,
      providers: snapshot.providers,
      warnings: snapshot.warnings,
    };
  },

  /** Las cotizaciones de ARS disponibles, para que el usuario elija cuál usar. */
  async getArsRates() {
    const snapshot = await getRateSnapshot();
    const provider = snapshot.providers.find((p) => p.provider === "dolarapi");
    if (!snapshot.ars || !provider) {
      throw new AppError(503, "RATES_UNAVAILABLE", "Las cotizaciones del peso argentino no están disponibles");
    }

    const types = (Object.keys(ARS_RATE_TYPES) as ArsRateType[])
      .filter((type) => snapshot.ars?.[type])
      .map((type) => {
        const quote = getArsQuote(snapshot, type);
        return {
          type,
          label: ARS_RATE_TYPES[type].label,
          note: ARS_RATE_TYPES[type].note,
          is_default: type === DEFAULT_ARS_RATE_TYPE,
          compra: quote.compra,
          venta: quote.venta,
          spread: roundTo(quote.venta - quote.compra, 2),
          published_at: quote.published_at,
        };
      });

    return {
      default_type: DEFAULT_ARS_RATE_TYPE,
      source: provider.source,
      stale: provider.stale,
      fetched_at: provider.fetched_at,
      types,
      warnings: snapshot.warnings.filter((w) => w.includes(ARS)),
    };
  },

  async convert(from: string, to: string, amount: number, arsRateType?: ArsRateType) {
    const snapshot = await getRateSnapshot();
    assertSupported(snapshot.currencies, from);
    const target = assertSupported(snapshot.currencies, to);

    const { rate, ars_rate } = quoteRate(snapshot, from, to, arsRateType);
    return {
      from,
      to,
      amount,
      rate,
      result: roundTo(amount * rate, target.decimals),
      ars_rate,
      date: snapshot.table.date,
      source: snapshot.source,
      warnings: snapshot.warnings,
    };
  },
};

/** Solo para tests: vacía las cachés en memoria. */
export function clearRatesCache(): void {
  frankfurterCache.clear();
  arsCache.clear();
}
