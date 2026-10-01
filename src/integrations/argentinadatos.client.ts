import { z } from "zod";
import { env } from "../config/env";
import { ARS_RATE_TYPES, DEFAULT_ARS_RATE_TYPE, type ArsRateType } from "./dolarapi.client";
import type { HistoryPoint } from "./frankfurter.client";

const REQUEST_TIMEOUT_MS = 10_000;

/** Respuesta de GET /cotizaciones/dolares/{casa}: historial diario completo (desde 2018). */
const HistoryItemSchema = z.object({
  casa: z.string(),
  compra: z.number().positive().nullable(),
  venta: z.number().positive().nullable(),
  fecha: z.string(),
});

/** Historial de ARS por tipo de dólar: pesos por 1 USD (promedio compra/venta), un punto por día. */
export type ArsHistory = Partial<Record<ArsRateType, HistoryPoint[]>>;

/** Para validar el historial cuando se lee del respaldo en la BD (puede faltar algún tipo). */
export const ArsHistorySchema = z.partialRecord(
  z.enum(["oficial", "mep", "blue"]),
  z.array(z.object({ date: z.string(), value: z.number().positive() })),
);

async function fetchCasaHistory(casa: string, since: string): Promise<HistoryPoint[]> {
  const response = await fetch(`${env.ARGENTINADATOS_BASE_URL}/cotizaciones/dolares/${casa}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`ArgentinaDatos (${casa}) respondió ${response.status}`);

  const parsed = z.array(HistoryItemSchema).safeParse(await response.json());
  if (!parsed.success) throw new Error(`ArgentinaDatos (${casa}) devolvió un formato inesperado`);

  // La API trae ~3.000 días; se guarda solo desde `since` (lo que se grafica).
  const points: HistoryPoint[] = [];
  for (const item of parsed.data) {
    if (item.fecha < since) continue;
    const compra = item.compra ?? item.venta;
    const venta = item.venta ?? item.compra;
    if (compra === null || venta === null) continue;
    points.push({ date: item.fecha, value: (compra + venta) / 2 });
  }
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Historial del dólar oficial, MEP y blue desde `since` (YYYY-MM-DD), en paralelo.
 * Exige al menos el MEP (el tipo por defecto); si falla otro tipo, ese se omite.
 */
export async function fetchArsHistory(since: string): Promise<ArsHistory> {
  const types = Object.keys(ARS_RATE_TYPES) as ArsRateType[];
  const results = await Promise.allSettled(types.map((type) => fetchCasaHistory(ARS_RATE_TYPES[type].casa, since)));

  const history: ArsHistory = {};
  results.forEach((result, i) => {
    const type = types[i];
    if (type && result.status === "fulfilled" && result.value.length > 0) history[type] = result.value;
  });

  if (!history[DEFAULT_ARS_RATE_TYPE]) {
    const reason = results.find((r) => r.status === "rejected");
    throw new Error(
      reason?.status === "rejected" && reason.reason instanceof Error
        ? reason.reason.message
        : "ArgentinaDatos no devolvió el historial del dólar MEP",
    );
  }
  return history;
}
