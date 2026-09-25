import { z } from "zod";
import { convertQuerySchema, ratesQuerySchema } from "../schemas/rates.schema";
import { errorResponse, jsonResponse, registry } from "./registry";

export const RatesSourceSchema = z
  .enum(["live", "cache", "fallback"])
  .meta({
    id: "RatesSource",
    description:
      "live: recién pedidas a Frankfurter · cache: caché vigente · fallback: Frankfurter falló y se usan las últimas tasas guardadas",
  });

const RatesSchema = z
  .object({
    base: z.string().meta({ example: "USD" }),
    date: z.string().meta({ description: "Fecha de publicación de las tasas", example: "2026-09-24" }),
    source: RatesSourceSchema,
    fetchedAt: z.string().meta({ example: "2026-09-24T21:00:00.000Z" }),
    rates: z.record(z.string(), z.number()).meta({ example: { COP: 3273.3, EUR: 0.87695, ARS: 1415.5 } }),
    unavailable: z
      .array(z.string())
      .meta({ description: "Monedas sin tasa en este momento (su proveedor falló y no hay caché)", example: [] }),
    providers: z.array(
      z.object({
        provider: z.enum(["frankfurter", "dolarapi"]),
        label: z.string().meta({ example: "DolarApi · dólar MEP (varía en el día)" }),
        currencies: z.array(z.string()).meta({ example: ["ARS"] }),
        source: RatesSourceSchema,
        fetchedAt: z.string().meta({ description: "Cuándo lo pidió NexPay", example: "2026-09-25T17:30:00.000Z" }),
        publishedAt: z.string().meta({ description: "Cuándo lo publicó el proveedor", example: "2026-09-25T17:28:00.000Z" }),
      }),
    ),
  })
  .meta({ id: "Rates" });

const ConversionSchema = z
  .object({
    from: z.string().meta({ example: "USD" }),
    to: z.string().meta({ example: "COP" }),
    amount: z.number().meta({ example: 100 }),
    rate: z.number().meta({ example: 3273.3 }),
    result: z.number().meta({ description: "Redondeado a los decimales de la moneda destino", example: 327330 }),
    date: z.string().meta({ example: "2026-09-24" }),
    source: RatesSourceSchema,
  })
  .meta({ id: "Conversion" });

registry.registerPath({
  method: "get",
  path: "/rates",
  tags: ["Rates"],
  summary: "Tasas de cambio actuales",
  description:
    "Tasas desde la moneda `base` hacia las demás monedas activas. Fuentes:\n\n" +
    "- **Frankfurter v2** (USD, EUR, COP): tasa oficial diaria, caché de 1 h.\n" +
    "- **DolarApi, dólar MEP** (ARS): varía durante el día, caché de 5 min.\n\n" +
    "Cada proveedor tiene fallback a su última tasa conocida. Si uno falla sin caché, " +
    "sus monedas aparecen en `unavailable` y el resto sigue funcionando.",
  request: { query: ratesQuerySchema },
  responses: {
    200: jsonResponse("Tasas de cambio", RatesSchema),
    400: errorResponse("Moneda inválida o no soportada (VALIDATION_ERROR / UNSUPPORTED_CURRENCY)"),
    503: errorResponse("Frankfurter no responde y no hay tasas en caché (RATES_UNAVAILABLE)"),
  },
});

registry.registerPath({
  method: "get",
  path: "/rates/convert",
  tags: ["Rates"],
  summary: "Cotizar una conversión",
  description: "Calcula cuánto se recibe al convertir `amount` de `from` a `to`. No modifica saldos.",
  request: { query: convertQuerySchema },
  responses: {
    200: jsonResponse("Cotización", ConversionSchema),
    400: errorResponse("Parámetros inválidos o moneda no soportada"),
    503: errorResponse("Frankfurter no responde y no hay tasas en caché (RATES_UNAVAILABLE)"),
  },
});
