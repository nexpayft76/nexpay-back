import { z } from "zod";
import { env } from "../config/env";

const REQUEST_TIMEOUT_MS = 5000;

/** Tipos de dólar de ARS que ofrece NexPay, y cómo se llaman en DolarApi ("casa"). */
export const ARS_RATE_TYPES = {
  oficial: { casa: "oficial", label: "Oficial", note: "Tipo de cambio del Banco Central" },
  mep: { casa: "bolsa", label: "MEP (bolsa)", note: "Mercado legal, varía durante el día" },
  blue: { casa: "blue", label: "Blue", note: "Mercado informal · solo referencia" },
} as const;

export type ArsRateType = keyof typeof ARS_RATE_TYPES;
export const DEFAULT_ARS_RATE_TYPE: ArsRateType = "mep";

export interface ArsQuote {
  /** Pesos que el mercado paga por 1 USD (el usuario vende dólares / recibe ARS). */
  compra: number;
  /** Pesos que el mercado cobra por 1 USD (el usuario compra dólares / paga con ARS). */
  venta: number;
  /** Promedio, para tablas de referencia. */
  mid: number;
  /** Momento en que DolarApi actualizó esta cotización. */
  published_at: string;
}

export type ArsQuotes = Partial<Record<ArsRateType, ArsQuote>>;

const DolarItemSchema = z.object({
  casa: z.string(),
  compra: z.number().positive().nullable(),
  venta: z.number().positive().nullable(),
  fechaActualizacion: z.string(),
});

/** Para validar las cotizaciones cuando se leen del respaldo en la BD (puede faltar algún tipo). */
export const ArsQuotesSchema = z.partialRecord(
  z.enum(["oficial", "mep", "blue"]),
  z.object({ compra: z.number().positive(), venta: z.number().positive(), mid: z.number().positive(), published_at: z.string() }),
);

/**
 * Pide todas las cotizaciones del dólar en Argentina en una sola llamada (GET /dolares)
 * y se queda con los tipos que ofrece NexPay. Exige al menos el MEP (el tipo por defecto).
 */
export async function fetchArsQuotes(): Promise<ArsQuotes> {
  const response = await fetch(`${env.DOLARAPI_BASE_URL}/dolares`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`DolarApi respondió ${response.status}`);

  const parsed = z.array(DolarItemSchema).safeParse(await response.json());
  if (!parsed.success) throw new Error("DolarApi devolvió un formato inesperado");

  const quotes: ArsQuotes = {};
  for (const [type, { casa }] of Object.entries(ARS_RATE_TYPES) as [ArsRateType, { casa: string }][]) {
    const item = parsed.data.find((d) => d.casa === casa);
    if (!item) continue;
    // Si falta un lado, se usa el otro para ambos (sin spread).
    const compra = item.compra ?? item.venta;
    const venta = item.venta ?? item.compra;
    if (compra === null || venta === null) continue;
    quotes[type] = { compra, venta, mid: (compra + venta) / 2, published_at: item.fechaActualizacion };
  }

  if (!quotes[DEFAULT_ARS_RATE_TYPE]) {
    throw new Error("DolarApi no devolvió la cotización del dólar MEP");
  }
  return quotes;
}
