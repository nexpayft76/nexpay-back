import type { z } from "zod";
import { AppError } from "./app-error";

/**
 * Valida `data` contra `schema`. Si falla, lanza un AppError 400 con el detalle por campo.
 */
export function parseInput<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join(".") || "(root)",
      message: issue.message,
    }));
    throw new AppError(400, "VALIDATION_ERROR", "Datos de entrada inválidos", details);
  }
  return result.data;
}
