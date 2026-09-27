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
import { createCachedSource, type CachedResult } from "../../utils/cached-source";
import { roundSignificant, roundTo } from "../../utils/money";
import { currenciesRepository } from "../currencies/currencies.repository";
import { createRatesStore } from "./rates.repository";
import type { RatesSource } from "./rates.service";

/** Rango → días hacia atrás desde la última tasa válida. */
export const HISTORY_RANGES = { "1w": 7, "1m": 30, "3m": 91, "6m": 182, "1y": 365 } as const;
export type HistoryRange = keyof typeof HISTORY_RANGES;

/** Se descarga un poco más de un año una sola vez; los rangos y los pares se calculan de ahí. */
const DOWNLOAD_DAYS = 370;
const ARS = "ARS";

type HistoryProvider = "frankfurter" | "argentinadatos";

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
  /** "COP-EUR" para un par simple, o el tipo de dólar si participa ARS ("oficial", "mep", "blue"). */
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
  /** Moneda de origen: la serie es "1 {from} = X {to}". */
  from: string;
  to: string;
  range: HistoryRange;
  /** Primer y último día del rango (el último es la última tasa válida). */
  start: string;
  end: string;
  providers: HistoryProvider[];
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
    first: roundSignificant(first.value),
    last: roundSignificant(last.value),
    change_pct: roundTo(((last.value - first.value) / first.value) * 100, 2),
    min: roundSignificant(Math.min(...values)),
    max: roundSignificant(Math.max(...values)),
  };
}

/**
 * Recorta cada serie al rango, contando hacia atrás desde la ÚLTIMA fecha con datos
 * (la última tasa válida), no desde hoy: así un fin de semana o una caída no dejan el gráfico vacío.
 */
function trimToRange(all: Array<{ key: string; label: string; points: HistoryPoint[] }>, range: HistoryRange) {
  const end = all.flatMap((s) => s.points.map((p) => p.date)).sort().at(-1);
  if (!end) return { start: "", end: "", series: [] as HistorySeries[] };
  const start = isoDaysAgo(HISTORY_RANGES[range], new Date(`${end}T00:00:00Z`));
  const series = all.map(({ key, label, points }) => {
    const inRange = points.filter((p) => p.date >= start);
    return { key, label, points: inRange, stats: statsOf(inRange) };
  });
  return { start, end, series };
}

/** Serie "unidades de `code` por 1 USD" indexada por fecha. USD no necesita serie (siempre vale 1). */
function toDateMap(points: HistoryPoint[] | undefined): Map<string, number> {
  return new Map((points ?? []).map((p) => [p.date, p.value]));
}

/**
 * Cruza dos series contra USD: 1 {from} = (to por USD) / (from por USD) {to}.
 * Solo se usan las fechas que existen en las dos (ej. Frankfurter no publica los fines de semana).
 * `null` en una serie = esa moneda es USD (vale 1 todos los días).
 */
function crossSeries(fromPerUsd: Map<string, number> | null, toPerUsd: Map<string, number> | null): HistoryPoint[] {
  const dates = fromPerUsd && toPerUsd
    ? [...fromPerUsd.keys()].filter((d) => toPerUsd.has(d))
    : [...(fromPerUsd ?? toPerUsd ?? new Map<string, number>()).keys()];

  return dates.sort().flatMap((date) => {
    const fromValue = fromPerUsd ? fromPerUsd.get(date) : 1;
    const toValue = toPerUsd ? toPerUsd.get(date) : 1;
    if (fromValue === undefined || toValue === undefined) return [];
    return [{ date, value: roundSignificant(toValue / fromValue) }];
  });
}

function staleWarning(provider: string, fetchedAt: number): string {
  const when = new Date(fetchedAt).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" });
  return `${provider} no está disponible por un problema de conexión. Se muestra el último historial válido (obtenido el ${when}).`;
}

export const ratesHistoryService = {
  /**
   * Historial del par `from` → `to` ("1 from = X to"), para cualquier combinación de monedas activas.
   * - Sin ARS: una serie, calculada con Frankfurter (días hábiles).
   * - Con ARS: tres series (oficial, MEP, blue) desde ArgentinaDatos, cruzadas con Frankfurter si hace falta.
   */
  async getPairHistory(from: string, to: string, range: HistoryRange): Promise<HistoryResponse> {
    if (from === to) {
      throw new AppError(400, "INVALID_HISTORY_QUERY", "Las monedas de origen y destino deben ser distintas");
    }
    const active = (await currenciesRepository.findAll()).map((c) => c.code);
    for (const code of [from, to]) {
      if (!active.includes(code)) {
        throw new AppError(400, "UNSUPPORTED_CURRENCY", `Moneda no soportada: ${code}. Disponibles: ${active.join(", ")}`);
      }
    }

    const involvesArs = from === ARS || to === ARS;
    // Frankfurter hace falta si alguna moneda no es USD ni ARS (COP, EUR...).
    const needsFrankfurter = [from, to].some((c) => c !== PIVOT_CURRENCY && c !== ARS);

    try {
      const providers: HistoryProvider[] = [];
      const loaded: Array<{ provider: string; result: CachedResult<unknown> }> = [];

      let usd: UsdHistory = {};
      if (needsFrankfurter) {
        const quotes = active.filter((c) => c !== PIVOT_CURRENCY && c !== ARS).sort();
        const result = await usdHistoryCache.get(`1y:${quotes.join(",")}`, () =>
          fetchUsdHistory(quotes, isoDaysAgo(DOWNLOAD_DAYS), isoDaysAgo(0)),
        );
        usd = result.value;
        providers.push("frankfurter");
        loaded.push({ provider: "Frankfurter", result });
      }

      let ars: ArsHistory = {};
      if (involvesArs) {
        const result = await arsHistoryCache.get("1y", () => fetchArsHistory(isoDaysAgo(DOWNLOAD_DAYS)));
        ars = result.value;
        providers.push("argentinadatos");
        loaded.push({ provider: "ArgentinaDatos", result });
      }

      // "Unidades de la moneda por 1 USD": USD = null (vale 1); ARS depende del tipo de dólar.
      const perUsd = (code: string, arsType?: ArsRateType): Map<string, number> | null => {
        if (code === PIVOT_CURRENCY) return null;
        if (code === ARS) return toDateMap(arsType ? ars[arsType] : undefined);
        return toDateMap(usd[code]);
      };

      const all = involvesArs
        ? (Object.keys(ARS_RATE_TYPES) as ArsRateType[])
            .filter((type) => ars[type])
            .map((type) => ({
              key: type,
              label: `Dólar ${ARS_RATE_TYPES[type].label}`,
              points: crossSeries(perUsd(from, type), perUsd(to, type)),
            }))
        : [{ key: `${from}-${to}`, label: `1 ${from} en ${to}`, points: crossSeries(perUsd(from), perUsd(to)) }];

      const trimmed = trimToRange(all, range);
      const stale = loaded.some((l) => l.result.source === "fallback");
      const source: RatesSource = stale
        ? "fallback"
        : loaded.some((l) => l.result.source === "live")
          ? "live"
          : "cache";
      const oldestFetch = Math.min(...loaded.map((l) => l.result.fetchedAt));

      return {
        from,
        to,
        range,
        ...trimmed,
        providers,
        source,
        stale,
        fetched_at: new Date(oldestFetch).toISOString(),
        warnings: loaded
          .filter((l) => l.result.source === "fallback")
          .map((l) => staleWarning(l.provider, l.result.fetchedAt)),
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      // Solo llega acá si una fuente falló y nunca hubo un historial guardado.
      throw new AppError(503, "HISTORY_UNAVAILABLE", "El historial de tasas no está disponible en este momento");
    }
  },
};

/** Solo para tests: vacía las cachés en memoria. */
export function clearHistoryCache(): void {
  usdHistoryCache.clear();
  arsHistoryCache.clear();
}
