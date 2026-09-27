import { z } from "zod";
import { AppError } from "../../utils/app-error";

/** Código ISO de 3 letras. Acepta minúsculas ("usd") y las normaliza. */
const currencyCodeSchema = z
  .string({ error: "La moneda es obligatoria" })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "La moneda debe ser un código de 3 letras, ej. USD");

const ratesQuerySchema = z.object({
  base: currencyCodeSchema.default("USD"),
});

const convertQuerySchema = z
  .object({
    from: currencyCodeSchema,
    to: currencyCodeSchema,
    amount: z.coerce
      .number({ error: "El monto debe ser un número" })
      .positive("El monto debe ser mayor que 0")
      .max(1_000_000_000_000, "El monto es demasiado grande"),
    ars_rate: z
      .enum(["oficial", "mep", "blue"], { error: "ars_rate debe ser oficial, mep o blue" })
      .optional(),
  })
  .refine((q) => q.from !== q.to, { message: "Las monedas de origen y destino deben ser distintas", path: ["to"] });

/**
 * En Express 5 `req.query` es de solo lectura, así que la validación devuelve los datos
 * ya normalizados en vez de reemplazar `req.query`. Si falla, lanza un 400 con el formato del equipo.
 */
function parseQuery<S extends z.ZodType>(schema: S, query: unknown, code: string): z.output<S> {
  const result = schema.safeParse(query);
  if (!result.success) {
    throw new AppError(
      400,
      code,
      "Parámetros de consulta inválidos",
      result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }
  return result.data;
}

export const parseRatesQuery = (query: unknown) => parseQuery(ratesQuerySchema, query, "INVALID_RATES_QUERY");
export const parseConvertQuery = (query: unknown) => parseQuery(convertQuerySchema, query, "INVALID_CONVERT_QUERY");
