import { z } from "zod";

/** Código ISO de 3 letras. Acepta minúsculas ("usd") y las normaliza. */
export const currencyCodeSchema = z
  .string({ error: "La moneda es obligatoria" })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "La moneda debe ser un código de 3 letras, ej. USD")
  .meta({ example: "USD" });

export const ratesQuerySchema = z.object({
  base: currencyCodeSchema.default("USD").meta({ description: "Moneda base", example: "USD" }),
});

export const convertQuerySchema = z
  .object({
    from: currencyCodeSchema.meta({ description: "Moneda de origen", example: "USD" }),
    to: currencyCodeSchema.meta({ description: "Moneda de destino", example: "COP" }),
    amount: z.coerce
      .number({ error: "El monto debe ser un número" })
      .positive("El monto debe ser mayor que 0")
      .max(1_000_000_000_000, "El monto es demasiado grande")
      .meta({ description: "Monto en la moneda de origen", example: 100 }),
  })
  .refine((q) => q.from !== q.to, { message: "Las monedas de origen y destino deben ser distintas", path: ["to"] });

export const walletQuerySchema = z.object({
  valuedIn: currencyCodeSchema
    .default("USD")
    .meta({ description: "Moneda en la que se valoriza el total de la wallet", example: "USD" }),
});

export type ConvertQuery = z.infer<typeof convertQuerySchema>;
