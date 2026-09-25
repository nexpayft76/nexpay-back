import { z } from "zod";
import { env } from "../config/env";

const REQUEST_TIMEOUT_MS = 5000;

/** Respuesta de GET /dolares/{casa} en DolarApi. */
const DolarResponseSchema = z.object({
  casa: z.string(),
  compra: z.number().positive().nullable(),
  venta: z.number().positive().nullable(),
  fechaActualizacion: z.string(),
});

export interface ArsQuote {
  /** Pesos argentinos por 1 USD (promedio entre compra y venta). */
  arsPerUsd: number;
  compra: number | null;
  venta: number | null;
  /** Momento en que DolarApi actualizó la cotización. */
  publishedAt: string;
}

/**
 * Cotización del dólar MEP ("bolsa") en Argentina.
 * A diferencia de Frankfurter (tasa oficial diaria), el MEP se mueve durante el horario de mercado.
 */
export async function fetchArsMepQuote(): Promise<ArsQuote> {
  const response = await fetch(`${env.DOLARAPI_BASE_URL}/dolares/bolsa`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`DolarApi respondió ${response.status}`);
  }

  const parsed = DolarResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error("DolarApi devolvió un formato inesperado");
  }

  const { compra, venta, fechaActualizacion } = parsed.data;
  const values = [compra, venta].filter((v): v is number => v !== null);
  if (values.length === 0) {
    throw new Error("DolarApi no devolvió valores de compra ni venta");
  }

  return {
    arsPerUsd: values.reduce((sum, v) => sum + v, 0) / values.length,
    compra,
    venta,
    publishedAt: fechaActualizacion,
  };
}
