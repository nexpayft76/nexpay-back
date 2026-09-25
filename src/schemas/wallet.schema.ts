import { z } from "zod";
import { currencyCodeSchema } from "./rates.schema";

export const depositSchema = z
  .object({
    currency: currencyCodeSchema.meta({ description: "Moneda a recargar", example: "USD" }),
    amount: z
      .number({ error: "El monto debe ser un número" })
      .positive("El monto debe ser mayor que 0")
      .meta({ description: "Monto a recargar (máximo 2 decimales)", example: 500 }),
  })
  .meta({ id: "DepositInput" });

export type DepositInput = z.infer<typeof depositSchema>;
