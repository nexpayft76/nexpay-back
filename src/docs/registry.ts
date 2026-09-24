import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

/** Registro central de la documentación. Cada módulo agrega aquí sus endpoints. */
export const registry = new OpenAPIRegistry();

export const bearerAuth = registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
  description: "Token obtenido en /auth/login o /auth/register",
});

export const ErrorResponseSchema = z
  .object({
    error: z.string().meta({ example: "VALIDATION_ERROR" }),
    message: z.string().meta({ example: "Datos de entrada inválidos" }),
    details: z
      .array(z.object({ field: z.string(), message: z.string() }))
      .optional()
      .meta({ example: [{ field: "email", message: "El email no tiene un formato válido" }] }),
  })
  .meta({ id: "ErrorResponse" });

/** Atajo para documentar una respuesta de error con el formato estándar de la API. */
export function errorResponse(description: string) {
  return { description, content: { "application/json": { schema: ErrorResponseSchema } } };
}

/** Atajo para documentar una respuesta JSON exitosa. */
export function jsonResponse(description: string, schema: z.ZodType) {
  return { description, content: { "application/json": { schema } } };
}
