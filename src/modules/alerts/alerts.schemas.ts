import { z } from "zod";
import { ALERT_KINDS } from "./alerts.types";

const alertFields = {
  kind: z.enum(ALERT_KINDS),
  currency: z.string().trim().min(3).max(10),
  base_currency: z.string().trim().min(3).max(10),
  direction: z.enum(["up", "down"]),
  threshold: z
    .number()
    .finite()
    .nonnegative()
    .refine((value) => Number(value.toFixed(2)) === value, "El umbral admite como máximo 2 decimales"),
  email_enabled: z.boolean(),
};

export const createAlertSchema = z.object(alertFields).strict();
export const updateAlertSchema = z.object({
  ...Object.fromEntries(Object.entries(alertFields).map(([key, schema]) => [key, schema.optional()])),
  enabled: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Debe enviar al menos un campo");