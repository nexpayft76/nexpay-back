import { env } from "../../config/env";
import { ArsHistorySchema, fetchArsHistory, type ArsHistory } from "../../integrations/argentinadatos.client";
import { ARS_RATE_TYPES, type ArsRateType } from "../../integrations/dolarapi.client";
import {
  fetchUsdHistory,
  HistorySchema,
  PIVOT_CURRENCY,
  type HistoryPoint,
  type UsdHistory,
} from "../../integrations/frankfurter.client";
import { AppError } from "../../utils/app-error";
import { createCachedSource } from "../../utils/cached-source";
import { roundTo } from "../../utils/money";
import { currenciesRepository } from "../currencies/currencies.repository";
import { createRatesStore } from "./rates.repository";
import type { RatesSource } from "./rates.service";

/** Rango → días hacia atrás desde la última tasa válida. */
export const HISTORY_RANGES = { "1w": 7, "1m": 30, "3m": 91, "6m": 182, "1y": 365 } as const;
export type HistoryRange = keyof typeof HISTORY_RANGES;

/** Se descarga un poco más de un año una sola vez; los rangos se recortan de ahí. */
const DOWNLOAD_DAYS = 370;
const ARS = "ARS";
/** Si eligen USD se grafica el par del corredor: 1 USD en COP. */
const USD_DEFAULT_QUOTE = "COP";

const usdHistoryCache = createCachedSource(
  "Frankfurter (historial)",
  env.HISTORY_CACHE_TTL_SECONDS * 1000,
  createRatesStore("frankfurter-history", HistorySchema),
);
const arsHistoryCache = createCachedSource(
  "ArgentinaDatos (historial)",
  env.HISTORY_CACHE_TTL_SECONDS * 1000,
  createRatesStore("argentinadatos-history", ArsHistorySchema),
);

export interface HistorySeries {
  /** "COP", "EUR"… o el tipo de dólar para ARS ("oficial", "mep", "blue"). */
  key: string;
  label: string;
  points: HistoryPoint[];
  stats: {
    first: number;
    last: number;
    /** Variación porcentual entre el primer y el último punto del rango. */
    change_pct: number;
    min: number;
    max: number;
  } | null;
}

export interface HistoryResponse {
  currency: string;
  base: string;
  quote: string;
  range: HistoryRange;
  from: string;
  to: string;
  provider: "frankfurter" | "argentinadatos";
  source: RatesSource;
  stale: boolean;
  fetched_at: string;
  series: HistorySeries[];
  warnings: string[];
}

function isoDaysAgo(days: number, from = new Date()): string {
  const date = new Date(from);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function statsOf(points: HistoryPoint[]): HistorySeries["stats"] {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return null;
  const values = points.map((p) => p.value);
  return {
    first: roundTo(first.value, 6),
    last: roundTo(last.value, 6),
    change_pct: roundTo(((last.value - first.value) / first.value) * 100, 2),
    min: roundTo(Math.min(...values), 6),
    max: roundTo(Math.max(...values), 6),
  };
}

/**
 * Recorta cada serie al rango, contando hacia atrás desde la ÚLTIMA fecha con datos
 * (la última tasa válida), no desde hoy: así un fin de semana o una caída no dejan el gráfico vacío.
 */
function trimToRange(all: Array<{ key: string; label: string; points: HistoryPoint[] }>, range: HistoryRange) {
  const lastDate = all.flatMap((s) => s.points.map((p) => p.date)).sort().at(-1);
  if (!lastDate) return { from: "", to: "", series: [] as HistorySeries[] };
  const fromDate = isoDaysAgo(HISTORY_RANGES[range], new Date(`${lastDate}T00:00:00Z`));
  const series = all.map(({ key, label, points }) => {
    const inRange = points
      .filter((p) => p.date >= fromDate)
      .map((p) => ({ date: p.date, value: roundTo(p.value, 6) }));
    return { key, label, points: inRange, stats: statsOf(inRange) };
  });
  return { from: fromDate, to: lastDate, series };
}

function staleWarning(provider: string, fetchedAt: number): string {
  const when = new Date(fetchedAt).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" });
  return `${provider} no está disponible por un problema de conexión. Se muestra el último historial válido (obtenido el ${when}).`;
}

export const ratesHistoryService = {
  async getHistory(currency: string, range: HistoryRange): Promise<HistoryResponse> {
    const active = (await currenciesRepository.findAll()).map((c) => c.code);
    if (!active.includes(currency)) {
      throw new AppError(400, "UNSUPPORTED_CURRENCY", `Moneda no soportada: ${currency}. Disponibles: ${active.join(", ")}`);
    }

    try {
      if (currency === ARS) {
        const result = await arsHistoryCache.get("1y", () => fetchArsHistory(isoDaysAgo(DOWNLOAD_DAYS)));
        const history: ArsHistory = result.value;
        const all = (Object.keys(ARS_RATE_TYPES) as ArsRateType[])
          .filter((type) => history[type])
          .map((type) => ({ key: type, label: `Dólar ${ARS_RATE_TYPES[type].label}`, points: history[type] ?? [] }));
        const trimmed = trimToRange(all, range);
        const stale = result.source === "fallback";
        return {
          currency,
          base: PIVOT_CURRENCY,
          quote: ARS,
          range,
          ...trimmed,
          provider: "argentinadatos",
          source: result.source,
          stale,
          fetched_at: new Date(result.fetchedAt).toISOString(),
          warnings: stale ? [staleWarning("ArgentinaDatos", result.fetchedAt)] : [],
        };
      }

      // USD, EUR, COP: una sola descarga de Frankfurter con todas las monedas activas (menos USD y ARS).
      const quotes = active.filter((c) => c !== PIVOT_CURRENCY && c !== ARS).sort();
      const quote = currency === PIVOT_CURRENCY ? USD_DEFAULT_QUOTE : currency;
      const result = await usdHistoryCache.get(`1y:${quotes.join(",")}`, () =>
        fetchUsdHistory(quotes, isoDaysAgo(DOWNLOAD_DAYS), isoDaysAgo(0)),
      );
      const history: UsdHistory = result.value;
      const trimmed = trimToRange([{ key: quote, label: `1 USD en ${quote}`, points: history[quote] ?? [] }], range);
      const stale = result.source === "fallback";
      return {
        currency,
        base: PIVOT_CURRENCY,
        quote,
        range,
        ...trimmed,
        provider: "frankfurter",
        source: result.source,
        stale,
        fetched_at: new Date(result.fetchedAt).toISOString(),
        warnings: stale ? [staleWarning("Frankfurter", result.fetchedAt)] : [],
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      // Solo llega acá si la fuente falló y nunca hubo un historial guardado.
      throw new AppError(503, "HISTORY_UNAVAILABLE", "El historial de tasas no está disponible en este momento");
    }
  },
};

/** Solo para tests: vacía las cachés en memoria. */
export function clearHistoryCache(): void {
  usdHistoryCache.clear();
  arsHistoryCache.clear();
}
