import { z } from "zod";
import { env } from "../config/env";

const REQUEST_TIMEOUT_MS = 5000;
/** Moneda pivote: se piden todas las tasas contra USD y las cruzadas se calculan localmente. */
export const PIVOT_CURRENCY = "USD";

const RatesResponseSchema = z.array(
  z.object({
    date: z.string(),
    base: z.string(),
    quote: z.string(),
    rate: z.number().positive(),
  }),
);

export interface UsdRateTable {
  /** Fecha de publicación de las tasas (YYYY-MM-DD). */
  date: string;
  /** Unidades de cada moneda por 1 USD. Incluye USD = 1. */
  rates: Record<string, number>;
}

/**
 * Pide a Frankfurter las tasas de `codes` con base USD.
 * Se usa USD como base (y no cada moneda) porque Frankfurter redondea las tasas pequeñas:
 * con base COP devuelve COP→USD = 0.00031, que tiene un error cercano al 1,5 %.
 */
export async function fetchUsdRates(codes: string[]): Promise<UsdRateTable> {
  const quotes = codes.filter((code) => code !== PIVOT_CURRENCY);
  if (quotes.length === 0) {
    return { date: new Date().toISOString().slice(0, 10), rates: { [PIVOT_CURRENCY]: 1 } };
  }

  const url = `${env.FRANKFURTER_BASE_URL}/rates?base=${PIVOT_CURRENCY}&quotes=${quotes.join(",")}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`Frankfurter respondió ${response.status}`);
  }

  const parsed = RatesResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error("Frankfurter devolvió un formato inesperado");
  }

  const rates: Record<string, number> = { [PIVOT_CURRENCY]: 1 };
  for (const item of parsed.data) rates[item.quote] = item.rate;

  const missing = quotes.filter((code) => rates[code] === undefined);
  if (missing.length > 0) {
    throw new Error(`Frankfurter no devolvió tasas para: ${missing.join(", ")}`);
  }

  return { date: parsed.data[0]?.date ?? new Date().toISOString().slice(0, 10), rates };
}
